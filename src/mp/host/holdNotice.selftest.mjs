// Proof (implicit state machine audit, round 3 B1/X6, 2026-11-05; round 4 F0, 2026-11-06): a held seat's stall clock
// follows what its host announces. A migrated host holds the HELLOs of the seats it awaits through its boot and its resume
// hold, and nothing reached a held seat before its WELCOME. Round 2 (Q1) let a seat's stall clock allow a fixed bound, the
// boot's whole bound and the hold (MIGRATION_WELCOME_ALLOWANCE_MS, 33 s), and only on a link to a newly elected host (a
// newer generation than its last WELCOME). A kept host (matchSession.ts bootKeptHost: the room had nobody else to elect,
// the same generation) boots and holds its seats the same way and got 0: a seat whose link opened at its boot asked for a
// fresh link at 5 s, inside the hold. And a new host that overran its own hold left its seats waiting the whole 33 s.
// Now a host that holds a HELLO says how long (wire HOLD): through the boot its runtime does, on the main thread, to every
// link (matchHost.ts bootHoldNotice), and in the resume hold its core does (matchHostCore.ts noticeHeld); the seat's
// allowance runs to that (MatchClient receiveHold). Every case runs the real host runtime and core and a real MatchClient
// in virtual time, a 4 s boot and a 3 s hold that alice's partner bob never ends. In cases 1, 2 and 4 bob is the host and
// alice a peer on her WebRTC link (the scripted double), which the runtime's acceptor answers and bridges to its core:
//   1. a kept host (same generation): alice is told twice (boot, hold), asks for no fresh link, and is welcomed when the
//      hold ends (before round 3: stalled at 5 s, inside the hold);
//   2. a newly elected host that goes silent once it has announced its hold: alice asks for a fresh link at the announced
//      hold's end plus its release margin and her stall clock, 15 s after her link opened (before round 3: 38 s, the
//      fixed bound's);
//   3. the kept host's own seat (alice hosting), over its host runtime's loopback: told during the boot and again in the
//      hold, welcomed when the hold ends without a fresh link (before round 3: stalled at 5 s);
//   4. (round 4 F0) case 1 with a host Worker that takes 8 s to evaluate its chunk (a slow device, a cold cache): its
//      core comes up 8 s after the runtime made its port, and what the runtime posted meanwhile waits, in order, as a
//      Worker's message queue does. Alice is told at her HELLO, by the runtime, and once more by the core in the hold; no
//      fresh link; welcomed at 8 + 4 + 3 s. Before, a peer's boot notice was the core's: the runtime only posted her frames
//      to the Worker, so she heard nothing until its core ran, and asked for a fresh link 5 s into the boot. A real
//      browser Worker's evaluation is not reproduced here.
// Review r1 (round 3): the core's boot after its world resolves and its HELLO verification (WebCrypto) run in real time,
// while virtual time moved 50 ms every four turns of the loop, so under load the hold notice landed steps late and case 2
// went silent on a clock threshold before it. Virtual time moves only once that work has settled (drainUntil: the boot
// posted ready, and the held HELLO joined the hold), and case 2 goes silent once alice's HELLO is in the hold (after its
// notice), a state of the host's, not a clock reading, so every time here is the host's own and the windows below are
// exact.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { signSeatToken } from '../../../server/match/seatToken.ts';
import { MatchClient } from '../match/matchClient.ts';
import * as recovery from '../match/recovery.ts';
import { MigratingTransport, WebRtcTransport, createLoopbackPair } from '../transport/index.ts';
import { decodeMessage } from '../wire/codec.ts';
import { MESSAGE_TYPE, PHASE, TICK_MS, VERDICT } from '../wire/constants.ts';
import { HOST_LOOPBACK_PEER, createHostPortPair } from './hostProtocol.ts';
import { createMatchHostCore } from './matchHostCore.ts';
import { createMatchHost } from './matchHost.ts';
import { FakeSignalRelay, RtcWorld } from '../transport/rtcDouble.test-support.ts';
import { migrationFallback } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const seats = [
  { seat: 0, playerId: 'alice', name: 'Alice', team: 'alpha', specId: 'm1a1_abrams_hc', spawn: { x: -30, z: 0, yaw: 0 } },
  { seat: 1, playerId: 'bob', name: 'Bob', team: 'bravo', specId: 't90am', spawn: { x: 30, z: 0, yaw: Math.PI } },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const hostSecret = createHash('sha256').update('hold-notice').digest('hex');
const aliceToken = signSeatToken(hostSecret, { v: 1, roomId: 'HOLDNT', seat: 0, playerId: 'alice', name: 'Alice', team: 'alpha', specId: 'm1a1_abrams_hc', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
const BOOT_MS = 4_000;
// (round 4 F0) a host Worker's evaluation past the stall clock: its core runs this long after the runtime made its port
const WORKER_EVAL_MS = 8_000;
const STEP_MS = 50;
const STALL_MS = 5_000;
const { RESUME_HOLD_MS } = recovery;
// (read off the module so this file also runs, and fails on the hazard, on a base without the margin)
const HOLD_RELEASE_MARGIN_MS = recovery.HOLD_RELEASE_MARGIN_MS ?? RESUME_HOLD_MS;

/**
 * Turn the event loop until `settled()` (the real async work of this virtual instant is done), with `each` after every
 * turn: setImmediate turns first, then 5 ms sleeps (WebCrypto and module loads run on other threads), capped by count.
 */
async function drainUntil(settled, what, each = () => {}) {
  for (let round = 0; !settled(); round++) {
    if (round > 24_200) throw new Error(`holdNotice: ${what} never settled (${round} turns)`);
    await new Promise((resolve) => (round < 200 ? setImmediate(resolve) : setTimeout(resolve, 5)));
    each();
  }
}

/**
 * Alice, a peer of bob's host, on her link to it as a browser has it: her WebRTC channel answered by the host runtime's
 * acceptor and bridged to its core's port (matchHost.ts). The core comes up `evalMs` after the runtime made its port (0: at
 * once, the in-process port's way); what the runtime posted to it before then waits, in order, as a Worker's message queue
 * holds what was posted before its script ran.
 */
/** `count` turns of the event loop (setImmediate), with `each` after every one. */
async function turns(count, each) {
  for (let turn = 0; turn < count; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
    each();
  }
}

async function bridgedSeat({ newHost, silentAfterHold = false, evalMs = 0, untilMs = 45_000 }) {
  let nowMs = 100_000;
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
  const generation = newHost ? 2 : 1;
  const world = new RtcWorld();
  const relay = new FakeSignalRelay('bob', generation);
  const cores = [];
  const host = { worldLoaded: false, ready: false, failed: null };
  const seen = { notices: [], welcomeAtMs: null, stalledAtMs: null, closed: false };
  let silent = false;
  let openedAtMs = null;
  // the host's thread: its core (its boot's world a 4 s load) up `evalMs` after the port is made
  const createPort = () => {
    const pair = createHostPortPair();
    const waiting = [];
    let evaluated = false;
    const evaluate = () => {
      cores.push(createMatchHostCore({ port: pair.worker, now: time.clock, schedule: time.schedule, setTimer: time.setTimer, clearTimer: time.clearTimer,
        buildWorld: () => new Promise((resolve) => time.setTimer(() => { host.worldLoaded = true; resolve('terrain'); }, BOOT_MS)),
        keyframeIntervalMs: 60_000, configIntervalMs: 60_000, reportIntervalMs: 60_000 }));
      evaluated = true;
      for (const [message, transfer] of waiting.splice(0)) pair.main.post(message, transfer);
    };
    if (evalMs > 0) time.setTimer(evaluate, evalMs);
    else evaluate();
    return {
      post(message, transfer) { if (evaluated) pair.main.post(message, transfer); else waiting.push([message, transfer]); },
      onMessage: (listener) => pair.main.onMessage((message) => {
        if (message.type === 'ready') host.ready = true;
        if (message.type === 'boot_failed') host.failed = message.error;
        if (message.type === 'link_close' && message.peer !== HOST_LOOPBACK_PEER) seen.closed = true;
        // a host gone silent: nothing more of its core's reaches a peer
        if (silent && message.type === 'link_send' && message.peer !== HOST_LOOPBACK_PEER) return;
        listener(message);
      }),
      close: () => pair.main.close(),
    };
  };
  const runtime = createMatchHost({
    playerId: 'bob', generation: () => relay.generation, createPort, createPeerConnection: world.createPeerConnection,
    room: { signaler: relay.signalerFor('bob'), reportMatch: async () => {} }, clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer,
  });
  const flush = () => { relay.flush(); world.flush(); runtime.pump(nowMs); };
  // alice's client: welcomed by the old host's timeline once, then its link moves to this host as its boot begins
  const old = createLoopbackPair({ clock: time.clock });
  old.server.open();
  const migrating = new MigratingTransport(old.client);
  const client = new MatchClient({ transport: migrating, token: aliceToken, clock: time.clock });
  client.onPhase((phase) => { if (phase === 'stalled' && seen.stalledAtMs === null) seen.stalledAtMs = nowMs; });
  client.connect();
  old.pump(nowMs);
  if (newHost) client.migration.setGeneration(generation);
  // what alice hears on her link to the host, whoever on it says it (the runtime or its core)
  const aliceRtc = new WebRtcTransport({ signaler: relay.signalerFor('alice'), createPeerConnection: world.createPeerConnection, clock: time.clock,
    setTimer: time.setTimer, clearTimer: time.clearTimer, random: () => 0.5 });
  aliceRtc.onFrame((bytes) => {
    const decoded = decodeMessage(bytes);
    if (!decoded.ok) return;
    if (decoded.message.type === MESSAGE_TYPE.HOLD) seen.notices.push({ atMs: nowMs - openedAtMs, holdMs: decoded.message.holdMs });
    if (decoded.message.type === MESSAGE_TYPE.WELCOME && seen.welcomeAtMs === null) seen.welcomeAtMs = nowMs - openedAtMs;
  });
  // this instant's real async work is done: a loaded world's boot posted ready, and a booted host took the HELLO it held
  // into its hold (its token checked), welcomed it or closed it
  const joinedHold = () => (cores[0]?.stats()?.resumeHold?.arrived ?? 0) >= 1;
  const settled = () => host.failed !== null || ((!host.worldLoaded || host.ready)
    && (!host.ready || joinedHold() || seen.welcomeAtMs !== null || seen.closed));
  // a fallback restart's state (the kept host's last resort) or any resume: alice and bob awaited, bob never back
  const playing = { tick: 900, serverTimeMs: Math.round(900 * TICK_MS), ackedInputTick: 0, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 0,
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 15_000, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
    destroyed: [], destruction: [], entities: [], shells: [], viewer: null, modeStateJson: null };
  const restart = migrationFallback({ latestFrame: playing, latestFrameAtMs: nowMs, nowMs, resumeTick: 900, countdownMs: 5000, kept: true, battleId: 9 });
  const starting = runtime.start({ roomId: 'HOLDNT', matchId: 'm1-00h01d00', generation, mapId: 'verdant', mode: 'standard', seed: 3, seats, bots: [],
    countdownS: 0, battleLimitS: 600, hostSecret, manifestBase: null, resume: { ...restart.state, resumeTick: restart.resumeTick, holdForSeats: ['alice', 'bob'] } });
  starting.catch(() => {});
  openedAtMs = nowMs;
  migrating.replace(aliceRtc, newHost ? 'host changed' : 'host kept');
  // her offer, the runtime's answer, her channel's open and her HELLO all land at this instant (the relay and the WebRTC
  // double deliver on flush)
  await drainUntil(() => aliceRtc.state === 'open' && settled(), 'alice\'s link', flush);
  // and what the host says to her HELLO crosses its port (microtasks) before time moves
  await turns(3, flush);
  while (nowMs - openedAtMs < untilMs && seen.stalledAtMs === null && (seen.welcomeAtMs === null || nowMs - openedAtMs < seen.welcomeAtMs + 500)) {
    nowMs += STEP_MS;
    time.fireDue();
    flush();
    await new Promise((resolve) => setImmediate(resolve));
    await drainUntil(settled, `the host at ${nowMs - openedAtMs} ms`, flush);
    await turns(1, flush);
    // the host goes quiet once alice's HELLO is in its hold (what it says as it takes her in has gone out by now): a state
    // of the host's, not a time, so a base that announces nothing goes quiet at the same moment
    if (silentAfterHold && joinedHold()) silent = true;
    flush();
    client.update(nowMs, STEP_MS / 1000);
    flush();
  }
  assert.equal(host.failed, null, 'setup: the core booted');
  const stats = client.stats();
  client.dispose();
  runtime.stop();
  for (const core of cores) core.dispose();
  return { ...seen, stalledAtMs: seen.stalledAtMs === null ? null : seen.stalledAtMs - openedAtMs, holdNotices: stats.holdNotices ?? 0, cores: cores.length };
}

/** The host's own seat over its runtime's loopback, the kept host's boot and hold. */
async function hostSeat() {
  let nowMs = 100_000;
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
  const cores = [];
  // what the core tells its runtime: ready, and its WELCOME to the loopback seat
  const core = { worldLoaded: false, ready: false, failed: null, welcomed: false };
  const host = createMatchHost({
    playerId: 'alice', generation: () => 1, createPeerConnection: world.createPeerConnection,
    createPort: () => {
      const pair = createHostPortPair();
      cores.push(createMatchHostCore({ port: pair.worker, now: time.clock, schedule: time.schedule, setTimer: time.setTimer, clearTimer: time.clearTimer,
        buildWorld: () => new Promise((resolve) => time.setTimer(() => { core.worldLoaded = true; resolve('terrain'); }, BOOT_MS)),
        keyframeIntervalMs: 60_000, configIntervalMs: 60_000, reportIntervalMs: 60_000 }));
      pair.main.onMessage((message) => {
        if (message.type === 'ready') core.ready = true;
        if (message.type === 'boot_failed') core.failed = message.error;
        if (message.type !== 'link_send' || message.peer !== HOST_LOOPBACK_PEER) return;
        const decoded = decodeMessage(new Uint8Array(message.bytes));
        if (decoded.ok && decoded.message.type === MESSAGE_TYPE.WELCOME) core.welcomed = true;
      });
      return pair.main;
    },
    room: { signaler: relay.signalerFor('alice'), reportMatch: async () => {} }, clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer,
  });
  const restart = migrationFallback({ latestFrame: null, latestFrameAtMs: null, nowMs, resumeTick: 900, countdownMs: 5000, kept: true, battleId: 9 });
  const starting = host.start({ roomId: 'HOLDNT', matchId: 'm1-00h01d00', generation: 1, mapId: 'verdant', mode: 'standard', seed: 3, seats, bots: [],
    countdownS: 0, battleLimitS: 600, hostSecret, manifestBase: null, resume: { ...restart.state, resumeTick: restart.resumeTick, holdForSeats: ['alice', 'bob'] } });
  starting.catch(() => {});
  const client = new MatchClient({ transport: new MigratingTransport(host.transport), token: aliceToken, clock: time.clock });
  const startedAtMs = nowMs;
  let stalledAtMs = null;
  client.onPhase((phase) => { if (phase === 'stalled' && stalledAtMs === null) stalledAtMs = nowMs - startedAtMs; });
  client.connect();
  const flush = () => { relay.flush(); world.flush(); host.pump(nowMs); };
  const settle = async (rounds = 4) => { for (let n = 0; n < rounds; n++) { await new Promise((resolve) => setImmediate(resolve)); flush(); } };
  // this instant's real async work is done: a loaded world's boot posted ready, and the core took the queued HELLO into
  // its hold (its token checked) or welcomed it
  const settled = () => core.failed !== null || ((!core.worldLoaded || core.ready)
    && (!core.ready || (cores[0]?.stats()?.resumeHold?.arrived ?? 0) >= 1 || core.welcomed));
  let welcomeAtMs = null;
  // the core takes the boot at this instant (its world due BOOT_MS from now)
  await settle(1);
  while (nowMs - startedAtMs < 20_000 && stalledAtMs === null && welcomeAtMs === null) {
    nowMs += STEP_MS;
    time.fireDue();
    await settle(1);
    await drainUntil(settled, `the host runtime at ${nowMs - startedAtMs} ms`, flush);
    flush();
    client.update(nowMs, STEP_MS / 1000);
    if (client.welcome && welcomeAtMs === null) welcomeAtMs = nowMs - startedAtMs;
  }
  assert.equal(core.failed, null, 'setup: the host runtime\'s core booted');
  const notices = client.stats().holdNotices ?? 0;
  client.dispose();
  host.stop();
  await settle();
  return { stalledAtMs, welcomeAtMs, notices };
}

/** A peer's notices on a kept host's link: one at her HELLO, one when her HELLO joined the hold (`holdAtMs`). */
function keptNoticesWrong(label, result, holdAtMs) {
  const wrong = [];
  if (result.stalledAtMs !== null && (result.welcomeAtMs === null || result.stalledAtMs < result.welcomeAtMs)) {
    wrong.push(`${label}: alice asked for a fresh link ${result.stalledAtMs} ms after her link opened, before her WELCOME (her HELLO held ${holdAtMs} ms for the boot, then the hold up to ${RESUME_HOLD_MS} ms)`);
  }
  if (!(result.welcomeAtMs !== null && result.welcomeAtMs >= holdAtMs + RESUME_HOLD_MS && result.welcomeAtMs <= holdAtMs + RESUME_HOLD_MS + STEP_MS)) {
    wrong.push(`${label}: alice was welcomed at ${result.welcomeAtMs} ms (the hold's end, ${holdAtMs + RESUME_HOLD_MS} ms)`);
  }
  // the first at her HELLO: what is left of the boot's 30 s bound and the hold; the second as her HELLO joins the hold, as
  // the boot ends: the whole hold. Two, no more: one teller each (the runtime for the boot, the core for the hold).
  const [first, second] = result.notices;
  if (!(result.notices.length === 2 && first.atMs <= STEP_MS && first.holdMs === 30_000 + RESUME_HOLD_MS - first.atMs
    && second.atMs === holdAtMs && second.holdMs === RESUME_HOLD_MS)) {
    wrong.push(`${label}: the host's notices to alice ${JSON.stringify(result.notices)} (one at her HELLO with the boot's bound and the hold, one when her HELLO joined the hold at ${holdAtMs} ms with what was left)`);
  }
  return wrong;
}

const wrong = [];
// ---- 1. a kept host: the same generation, a 4 s boot and a 3 s hold
const kept = await bridgedSeat({ newHost: false });
wrong.push(...keptNoticesWrong('kept host', kept, BOOT_MS));
// ---- 2. a newly elected host that announced its hold and went silent
const silent = await bridgedSeat({ newHost: true, silentAfterHold: true });
const lastNotice = silent.notices.at(-1);
const expectedStall = lastNotice ? lastNotice.atMs + lastNotice.holdMs + HOLD_RELEASE_MARGIN_MS + STALL_MS : NaN;
if (!(silent.notices.length === 2 && lastNotice.atMs === BOOT_MS && silent.stalledAtMs !== null && silent.stalledAtMs >= expectedStall && silent.stalledAtMs <= expectedStall + STEP_MS)) {
  wrong.push(`elected host gone silent once its hold began: alice asked for a fresh link at ${silent.stalledAtMs} ms (its announced hold's end, the release margin and her stall clock: ${expectedStall} ms; notices ${JSON.stringify(silent.notices)})`);
}
// ---- 3. the kept host's own seat over its loopback
const own = await hostSeat();
if (own.stalledAtMs !== null) wrong.push(`the host's own seat asked for a fresh link ${own.stalledAtMs} ms into the boot, before its WELCOME`);
if (!(own.welcomeAtMs !== null && own.welcomeAtMs >= BOOT_MS + RESUME_HOLD_MS && own.welcomeAtMs <= BOOT_MS + RESUME_HOLD_MS + STEP_MS)) wrong.push(`the host's own seat was welcomed at ${own.welcomeAtMs} ms (the hold's end, ${BOOT_MS + RESUME_HOLD_MS} ms)`);
if (own.notices !== 2) wrong.push(`the host's own seat took ${own.notices} notices (one from its runtime in the boot, one from the core in the hold)`);
// ---- 4. (round 4 F0) a kept host whose Worker evaluates for 8 s before its core runs
const slow = await bridgedSeat({ newHost: false, evalMs: WORKER_EVAL_MS });
if (slow.stalledAtMs === null && slow.cores !== 1) wrong.push(`setup: the slow Worker's core ran ${slow.cores} times`);
wrong.push(...keptNoticesWrong(`kept host, its Worker evaluating ${WORKER_EVAL_MS} ms`, slow, WORKER_EVAL_MS + BOOT_MS));
if (wrong.length) {
  console.error(`holdNotice: a held seat's stall clock did not follow its host's announced hold:\n  ${wrong.join('\n  ')}`);
  assert.fail('a host that holds a seat\'s HELLO tells it how long, on any link, and the seat waits that long and no longer');
}
assert.equal(kept.holdNotices, 2, 'the client counts both notices');
console.log(`holdNotice: a kept host's held seat waits through its ${BOOT_MS} ms boot and its hold (welcomed at ${kept.welcomeAtMs} ms, notices ${kept.notices.map((notice) => `${notice.holdMs} ms at ${notice.atMs}`).join(', ')}); a silent host's seat stalls at ${silent.stalledAtMs} ms (the fixed bound: ${STALL_MS + 33_000} ms); the host's own seat welcomed at ${own.welcomeAtMs} ms; behind a Worker evaluating ${WORKER_EVAL_MS} ms, welcomed at ${slow.welcomeAtMs} ms (notices ${slow.notices.map((notice) => `${notice.holdMs} ms at ${notice.atMs}`).join(', ')})`);
