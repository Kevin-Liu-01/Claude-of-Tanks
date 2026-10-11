// The host's HELLO gate under a slow hello path (2026-10-11, the MP lane: mp-world-events-audit, mp-room-lifecycle and
// mp-p2p-headless time out on "every seat welcomed" at load >= 60, on main as on every branch). In virtual time, on the
// real host runtime and core: alice hosts, bob connects through WebRTC, and bob's HELLO is held on his channel (the scripted
// world's congestion) — as a starved process, a host main thread inside a long task or a slow seat-token verification
// would hold it — for longer than the gate's old 5 s window. Then the channel drains.
//   - a slow HELLO is admitted: bob is welcomed once it lands (before: the gate closed the link at 5 s with HELLO_REQUIRED
//     "hello timeout", bob's client read the CLOSE as the end of its seat and the session went 'lost' for good);
//   - a link that never says hello is still closed at the gate's deadline (HELLO_TIMEOUT_MS);
//   - a client closed with "hello timeout" (a host whose window ran out anyway) re-offers and says hello again, bounded,
//     instead of ending its seat.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { signSeatToken } from '../../../server/match/seatToken.ts';
import * as matchClientModule from '../match/matchClient.ts';
import { CLOSE_REASON } from '../wire/constants.ts';
import { TRANSPORT_CLOSE } from '../transport/transport.ts';
import { WebRtcTransport } from '../transport/index.ts';
import { FakeSignalRelay, RtcWorld } from '../transport/rtcDouble.test-support.ts';
import { createHostPortPair } from './hostProtocol.ts';
import * as hostCore from './matchHostCore.ts';

const { createMatchHostCore } = hostCore;
// (read through the namespace so this receipt also runs, and fails, against a core that predates the export)
const HELLO_TIMEOUT_MS = hostCore.HELLO_TIMEOUT_MS ?? 5_000;
const { MatchClient } = matchClientModule;
const MAX_HELLO_RETRIES = matchClientModule.MAX_HELLO_RETRIES ?? 0;
import { createMatchHost } from './matchHost.ts';

const TICK_MS = 1000 / 60;
const SEAT_SECRET = 'room-seat-secret-0123456789abcdef';
const matchId = 'm1-0be11001';
const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
const tokenFor = (seat, playerId, team, specId) => signSeatToken(hostSecret, { v: 1, roomId: 'ROOM03', seat, playerId, name: playerId, team, specId, iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
const seats = [
  { seat: 0, playerId: 'alice', name: 'Alice', team: 'alpha', specId: 'm1a2', spawn: { x: -40, z: 0, yaw: 0 } },
  { seat: 1, playerId: 'bob', name: 'Bob', team: 'alpha', specId: 't90m', spawn: { x: 0, z: 0, yaw: 0 } },
  // an enemy that never connects keeps the match running (one side alone would end it)
  { seat: 2, playerId: 'dave', name: 'Dave', team: 'bravo', specId: 't90m', spawn: { x: 600, z: 600, yaw: Math.PI } },
];
const idle = () => ({ throttle: 0, steer: 0, brake: false, fire: false, aimLocked: false, aimYaw: 0, aimPitch: 0, aimDistance: 300, shellSlot: 0, actionPresses: 0 });

/** One host with alice on its loopback and bob over WebRTC; `holdHelloMs` keeps bob's outgoing frames on his channel that long. */
async function helloCase({ label, holdHelloMs, helloTimeoutMs, scenario = null }) {
  let nowMs = 200_000;
  let serial = 0;
  const timers = new Map();
  const time = {
    clock: () => nowMs,
    setTimer(callback, delayMs) { const handle = ++serial; timers.set(handle, { dueMs: nowMs + delayMs, callback, handle }); return handle; },
    clearTimer(handle) { timers.delete(handle); },
    schedule(callback, delayMs) { const handle = time.setTimer(callback, delayMs); return () => time.clearTimer(handle); },
    fireDue() {
      for (;;) {
        const due = [...timers.values()].filter((timer) => timer.dueMs <= nowMs).sort((a, b) => a.dueMs - b.dueMs || a.handle - b.handle)[0];
        if (!due) break;
        timers.delete(due.handle);
        due.callback();
      }
    },
  };
  const world = new RtcWorld();
  const relay = new FakeSignalRelay('alice', 1);
  const hosts = [];
  const clients = [];
  const cores = [];
  const settle = async (rounds = 6) => {
    for (let index = 0; index < rounds; index++) {
      await new Promise((resolve) => setImmediate(resolve));
      relay.flush(); world.flush();
      for (const host of hosts) host.pump(nowMs);
    }
  };
  const advance = async (ms) => {
    const steps = Math.max(1, Math.round(ms / TICK_MS));
    for (let step = 0; step < steps; step++) {
      nowMs += TICK_MS;
      time.fireDue();
      await settle(3);
      for (const client of clients) client.update(nowMs, TICK_MS / 1000);
      await settle(2);
    }
  };
  const createPort = () => {
    const pair = createHostPortPair();
    cores.push(createMatchHostCore({
      port: pair.worker, buildWorld: async () => 'terrain', now: time.clock, schedule: time.schedule, setTimer: time.setTimer, clearTimer: time.clearTimer,
      ...(helloTimeoutMs !== undefined ? { helloTimeoutMs } : {}),
    }));
    return pair.main;
  };
  const alice = createMatchHost({
    playerId: 'alice', generation: () => relay.generation, createPort, createPeerConnection: world.createPeerConnection,
    room: { signaler: relay.signalerFor('alice'), reportMatch: async () => {} }, clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer,
  });
  hosts.push(alice);
  const starting = alice.start({ roomId: 'ROOM03', matchId, generation: 1, mapId: 'verdant', mode: 'standard', seed: 9, seats, bots: [], countdownS: 0, battleLimitS: 600, hostSecret, manifestBase: null, resume: null });
  await settle(12);
  await starting;
  const aliceClient = new MatchClient({ transport: alice.transport, token: tokenFor(0, 'alice', 'alpha', 'm1a2'), clock: time.clock, controls: idle });
  clients.push(aliceClient);
  aliceClient.connect();
  await advance(TICK_MS * 6);
  assert.ok(aliceClient.welcome, `${label}: alice welcomed on the loopback`);

  // bob's channels start congested: everything he sends (his HELLO first) waits on his side until released
  const held = [];
  const bobPeerConnection = (config) => {
    const pc = world.createPeerConnection(config);
    const create = pc.createDataChannel.bind(pc);
    pc.createDataChannel = (name) => { const channel = create(name); if (holdHelloMs > 0) { channel.congested = true; held.push(channel); } return channel; };
    return pc;
  };
  const bobRtc = new WebRtcTransport({ signaler: relay.signalerFor('bob'), createPeerConnection: bobPeerConnection, clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer, random: () => 0.5 });
  const bobClient = new MatchClient({ transport: bobRtc, token: tokenFor(1, 'bob', 'alpha', 't90m'), clock: time.clock, controls: idle });
  clients.push(bobClient);
  const closes = [];
  bobClient.onPhase((phase) => { if (phase === 'closed') closes.push(bobClient.lastCloseReason); });
  bobClient.connect();
  const releaseAt = nowMs + (holdHelloMs === Infinity ? 1e12 : holdHelloMs);
  let released = false;
  let staleSent = false;
  for (let elapsed = 0; elapsed < 20_000 && !bobClient.welcome; elapsed += 100) {
    // a stale offer from bob reaches the host while his link is open and his HELLO not yet in
    if (scenario === 'stale-offer' && !staleSent && bobRtc.state === 'open') {
      staleSent = true;
      relay.inject('bob', { to: 'alice', generation: relay.generation, kind: 'offer', sdp: 'v=0 (a stale offer from an attempt bob already gave up)' });
    }
    if (!released && nowMs >= releaseAt) { released = true; for (const channel of held) { channel.congested = false; channel.drain(); } }
    await advance(100);
  }
  // an optional disturbance once bob is in: the host's own client reconnects (its stall recovery), or a stale offer from bob
  let after = null;
  if (scenario === 'loopback-reconnect' && bobClient.welcome) {
    const aliceWelcomes = []; const bobWelcomes = [];
    aliceClient.onWelcome((welcome) => aliceWelcomes.push(welcome));
    bobClient.onWelcome((welcome) => bobWelcomes.push(welcome));
    const closesBefore = closes.length;
    if (scenario === 'loopback-reconnect') alice.transport.reconnect(TRANSPORT_CLOSE.STALLED, 'no accepted authority for 5000 ms');
    for (let elapsed = 0; elapsed < 10_000; elapsed += 100) {
      await advance(100);
      if (scenario === 'loopback-reconnect' && aliceWelcomes.length && aliceClient.phase === 'live') break;
      if (scenario === 'stale-offer' && (closes.length > closesBefore || (bobWelcomes.length && bobClient.phase === 'live'))) break;
    }
    after = { aliceWelcomes: aliceWelcomes.length, alicePhase: aliceClient.phase, aliceServerErrors: aliceClient.stats().serverErrors,
      bobWelcomes: bobWelcomes.length, bobPhase: bobClient.phase, bobNewCloses: closes.slice(closesBefore) };
  }
  const result = {
    label, welcomed: !!bobClient.welcome, closes, phase: bobClient.phase, after,
    lastCloseReason: bobClient.lastCloseReason, helloRetries: bobClient.stats().helloRetries ?? 0, coreStats: cores[0].stats(),
  };
  for (const client of clients) client.dispose();
  alice.stop();
  await settle(4);
  return result;
}

// ---- a HELLO held 3 s past the old 5 s window is admitted: bob is welcomed once it lands
const slow = await helloCase({ label: 'slow hello', holdHelloMs: 8_000 });
assert.ok(slow.welcomed, `slow hello: bob is welcomed once his HELLO lands 8 s after his channel opened (closes ${JSON.stringify(slow.closes)}, last close ${slow.lastCloseReason})`);
assert.deepEqual(slow.closes, [], 'slow hello: the gate never closed bob');
assert.ok(HELLO_TIMEOUT_MS >= 15_000, `the gate's window covers a host or seat busy for seconds (${HELLO_TIMEOUT_MS} ms)`);

// ---- a link that never says hello is still closed at the gate's deadline
const silent = await helloCase({ label: 'silent link', holdHelloMs: Infinity, helloTimeoutMs: 2_000 });
assert.equal(silent.welcomed, false, 'silent link: never welcomed');
assert.equal(silent.helloRetries, MAX_HELLO_RETRIES, `silent link: the seat asked for ${MAX_HELLO_RETRIES} fresh links, no more (${silent.helloRetries})`);
assert.equal(silent.lastCloseReason, CLOSE_REASON.HELLO_REQUIRED, `silent link: then the gate's HELLO_REQUIRED ends it (${silent.lastCloseReason})`);
assert.equal(silent.phase, 'closed', `silent link: the seat is closed (${silent.phase})`);

// ---- a client the gate closed anyway ("hello timeout": a 2 s window, a HELLO held 3 s) re-offers and says hello again
const retried = await helloCase({ label: 'retry', holdHelloMs: 3_000, helloTimeoutMs: 2_000 });
assert.ok(retried.welcomed, `retry: bob is welcomed on a fresh link after the gate closed the first one (closes ${JSON.stringify(retried.closes)}, retries ${retried.helloRetries})`);
assert.ok(retried.helloRetries >= 1, `retry: the client re-offered after "hello timeout" (${retried.helloRetries})`);

// ---- the host's own client reconnects its loopback (its stall recovery after a long task on the host's tab): it is
// welcomed again (before: the core kept the old link 0, the second HELLO met UNEXPECTED_MESSAGE, the host's seat hung in
// 'handshaking' with the world running on without it)
const loop = await helloCase({ label: 'loopback reconnect', holdHelloMs: 0, scenario: 'loopback-reconnect' });
assert.ok(loop.after, 'loopback reconnect: bob was in before the disturbance');
assert.ok(loop.after.aliceWelcomes >= 1 && loop.after.alicePhase === 'live', `loopback reconnect: the host's own seat is welcomed again and live (${JSON.stringify(loop.after)})`);

// ---- a stale offer from bob reaches the host while he is entering (his link open, his HELLO held 1 s): the acceptor
// retires the link with REPLACED "peer offered again" (its second-tab rule), and bob re-offers and is welcomed (before: his
// session read the CLOSE as the end of his seat, 'lost' for good — the headless proofs' never-welcomed seats, closeReason 15)
const stale = await helloCase({ label: 'stale offer', holdHelloMs: 1_000, scenario: 'stale-offer' });
assert.ok(stale.welcomed, `stale offer: bob is welcomed on a fresh link (closes ${JSON.stringify(stale.closes)}, retries ${stale.helloRetries})`);
assert.ok(stale.helloRetries >= 1, `stale offer: bob re-offered after "peer offered again" (${stale.helloRetries})`);
assert.equal(stale.phase, 'live', `stale offer: bob is live (${stale.phase})`);

console.log(`helloGate.selftest: a HELLO 8 s late is admitted (window ${HELLO_TIMEOUT_MS} ms); a silent link is closed at its deadline; a seat closed with "hello timeout" re-offers and is welcomed (${retried.helloRetries} retry); the host's own seat is welcomed again after a loopback reconnect; a seat a stale offer of its own replaced re-offers and is welcomed`);
