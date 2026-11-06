// Proof (implicit state machine audit, round 3 B1/X6, 2026-11-05): a held seat's stall clock follows what its host
// announces. A migrated host holds the HELLOs of the seats it awaits through its boot and its resume hold, and nothing
// reached a held seat before its WELCOME. Round 2 (Q1) let a seat's stall clock allow a fixed bound, the boot's whole
// bound and the hold (MIGRATION_WELCOME_ALLOWANCE_MS, 33 s), and only on a link to a newly elected host (a newer
// generation than its last WELCOME). A kept host (matchSession.ts bootKeptHost: the room had nobody else to elect, the
// same generation) boots and holds its seats the same way and got 0: a seat whose link opened at its boot asked for a
// fresh link at 5 s, inside the hold. And a new host that overran its own hold left its seats waiting the whole 33 s.
// Now a host that holds a HELLO says how long (wire HOLD: matchHostCore.ts noticeHeld, through the boot and again in the
// hold) and the seat's allowance runs to that (MatchClient receiveHold). On the real host core through its port and a
// real MatchClient, in virtual time, a 4 s boot and a 3 s hold that alice's partner bob never ends:
//   1. a kept host (same generation): alice is told twice (boot, hold), asks for no fresh link, and is welcomed when the
//      hold ends (before: stalled at 5 s, inside the hold);
//   2. a newly elected host that goes silent after it announced its hold: alice asks for a fresh link at the announced
//      hold's end plus her stall clock, about 12 s after her link opened (before: 38 s, the fixed bound's);
//   3. the kept host's own seat, over its host runtime's loopback (matchHost.ts): told during the boot and again in the
//      hold, welcomed when the hold ends without a fresh link (before: stalled at 5 s).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { signSeatToken } from '../../../server/match/seatToken.ts';
import { MatchClient } from '../match/matchClient.ts';
import { MigratingTransport, createLoopbackPair } from '../transport/index.ts';
import { decodeMessage } from '../wire/codec.ts';
import { MESSAGE_TYPE, PHASE, TICK_MS, VERDICT } from '../wire/constants.ts';
import { createHostPortPair } from './hostProtocol.ts';
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
const STEP_MS = 50;

async function heldSeat({ newHost, silentAfterMs = Infinity, untilMs = 45_000 }) {
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
  const settle = async (rounds = 4) => { for (let n = 0; n < rounds; n++) await new Promise((resolve) => setImmediate(resolve)); };
  // the host core, its boot's world a 4 s load
  const port = createHostPortPair();
  const core = createMatchHostCore({ port: port.worker, now: time.clock, schedule: time.schedule, setTimer: time.setTimer, clearTimer: time.clearTimer,
    buildWorld: () => new Promise((resolve) => time.setTimer(() => resolve('terrain'), BOOT_MS)), keyframeIntervalMs: 60_000, configIntervalMs: 60_000, reportIntervalMs: 60_000 });
  // alice's client: welcomed by the old host's timeline once, then its link moves to this host as its boot begins
  const old = createLoopbackPair({ clock: time.clock });
  old.server.open();
  const migrating = new MigratingTransport(old.client);
  const client = new MatchClient({ transport: migrating, token: aliceToken, clock: time.clock });
  const seen = { notices: [], welcomeAtMs: null, stalledAtMs: null };
  client.onPhase((phase) => { if (phase === 'stalled' && seen.stalledAtMs === null) seen.stalledAtMs = nowMs; });
  client.connect();
  old.pump(nowMs);
  if (newHost) client.migration.setGeneration(2);
  // the link to the host: alice's frames into the core's port as peer 1, the core's sends for peer 1 back to her
  const link = createLoopbackPair({ clock: time.clock });
  link.server.open();
  let silent = false;
  link.server.onFrame((bytes) => port.main.post({ type: 'link_frame', peer: 1, bytes: bytes.slice().buffer }));
  port.main.onMessage((message) => {
    if (message.type !== 'link_send' || message.peer !== 1) return;
    // the host goes quiet once its boot is done and its hold announced (its hold's own notice is sent as the boot ends)
    if (nowMs - openedAtMs > silentAfterMs) silent = true;
    if (silent) return;
    const bytes = new Uint8Array(message.bytes);
    const decoded = decodeMessage(bytes);
    if (decoded.ok && decoded.message.type === MESSAGE_TYPE.HOLD) {
      seen.notices.push({ atMs: nowMs - openedAtMs, holdMs: decoded.message.holdMs });
    }
    if (decoded.ok && decoded.message.type === MESSAGE_TYPE.WELCOME && seen.welcomeAtMs === null) seen.welcomeAtMs = nowMs - openedAtMs;
    link.server.send(bytes);
  });
  // a fallback restart's state (the kept host's last resort) or any resume: alice and bob awaited, bob never back
  const playing = { tick: 900, serverTimeMs: Math.round(900 * TICK_MS), ackedInputTick: 0, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 0,
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 15_000, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
    destroyed: [], destruction: [], entities: [], shells: [], viewer: null, modeStateJson: null };
  const restart = migrationFallback({ latestFrame: playing, latestFrameAtMs: nowMs, nowMs, resumeTick: 900, countdownMs: 5000, kept: true, battleId: 9 });
  port.main.post({ type: 'boot', config: { roomId: 'HOLDNT', matchId: 'm1-00h01d00', generation: newHost ? 2 : 1, mapId: 'verdant', mode: 'standard', seed: 3, seats, bots: [],
    countdownS: 0, battleLimitS: 600, hostSecret, manifestBase: null, resume: { ...restart.state, resumeTick: restart.resumeTick, holdForSeats: ['alice', 'bob'] } } });
  port.main.post({ type: 'link_open', peer: 1, label: 'alice', playerId: 'alice' });
  const openedAtMs = nowMs;
  migrating.replace(link.client, newHost ? 'host changed' : 'host kept');
  await settle();
  while (nowMs - openedAtMs < untilMs && seen.stalledAtMs === null && (seen.welcomeAtMs === null || nowMs - openedAtMs < seen.welcomeAtMs + 500)) {
    nowMs += STEP_MS;
    time.fireDue();
    link.pump(nowMs);
    await settle();
    link.pump(nowMs);
    client.update(nowMs, STEP_MS / 1000);
  }
  const stats = client.stats();
  client.dispose();
  core.dispose();
  port.main.close();
  return { ...seen, stalledAtMs: seen.stalledAtMs === null ? null : seen.stalledAtMs - openedAtMs, holdNotices: stats.holdNotices ?? 0, holdStats: core.stats?.()?.resumeHold ?? null };
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
  const host = createMatchHost({
    playerId: 'alice', generation: () => 1, createPeerConnection: world.createPeerConnection,
    createPort: () => {
      const pair = createHostPortPair();
      cores.push(createMatchHostCore({ port: pair.worker, now: time.clock, schedule: time.schedule, setTimer: time.setTimer, clearTimer: time.clearTimer,
        buildWorld: () => new Promise((resolve) => time.setTimer(() => resolve('terrain'), BOOT_MS)), keyframeIntervalMs: 60_000, configIntervalMs: 60_000, reportIntervalMs: 60_000 }));
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
  const settle = async (rounds = 4) => { for (let n = 0; n < rounds; n++) { await new Promise((resolve) => setImmediate(resolve)); relay.flush(); world.flush(); host.pump(nowMs); } };
  let welcomeAtMs = null;
  while (nowMs - startedAtMs < 20_000 && stalledAtMs === null && welcomeAtMs === null) {
    nowMs += STEP_MS;
    time.fireDue();
    await settle();
    client.update(nowMs, STEP_MS / 1000);
    if (client.welcome && welcomeAtMs === null) welcomeAtMs = nowMs - startedAtMs;
  }
  const notices = client.stats().holdNotices ?? 0;
  client.dispose();
  host.stop();
  await settle();
  return { stalledAtMs, welcomeAtMs, notices };
}

const wrong = [];
// ---- 1. a kept host: the same generation, a 4 s boot and a 3 s hold
const kept = await heldSeat({ newHost: false });
if (kept.stalledAtMs !== null && (kept.welcomeAtMs === null || kept.stalledAtMs < kept.welcomeAtMs)) {
  wrong.push(`kept host: alice asked for a fresh link ${kept.stalledAtMs} ms after her link opened, before her WELCOME (the boot ${BOOT_MS} ms, the hold up to 3000 ms)`);
}
if (!(kept.welcomeAtMs !== null && kept.welcomeAtMs >= BOOT_MS + 2_900 && kept.welcomeAtMs <= BOOT_MS + 3_400)) wrong.push(`kept host: alice was welcomed at ${kept.welcomeAtMs} ms (the hold's end, about ${BOOT_MS + 3000} ms)`);
if (!(kept.notices.length === 2 && kept.notices[0].atMs < 500 && kept.notices[0].holdMs >= 32_000 && kept.notices[1].atMs >= BOOT_MS
  && kept.notices[1].holdMs > 2_500 && kept.notices[1].holdMs <= 3_000)) {
  wrong.push(`kept host: the host's notices to alice ${JSON.stringify(kept.notices)} (one at her HELLO with the boot's bound and the hold, one when her HELLO joined the hold with what was left)`);
}
// ---- 2. a newly elected host that announced its hold and went silent
const silent = await heldSeat({ newHost: true, silentAfterMs: BOOT_MS + 100 });
const expectedStall = BOOT_MS + 3_000 + 5_000;
if (!(silent.stalledAtMs !== null && Math.abs(silent.stalledAtMs - expectedStall) <= 600)) {
  wrong.push(`elected host gone silent once its hold began: alice asked for a fresh link at ${silent.stalledAtMs} ms (its announced hold's end plus her stall clock: about ${expectedStall} ms; notices ${JSON.stringify(silent.notices)})`);
}
// ---- 3. the kept host's own seat over its loopback
const own = await hostSeat();
if (own.stalledAtMs !== null) wrong.push(`the host's own seat asked for a fresh link ${own.stalledAtMs} ms into the boot, before its WELCOME`);
if (!(own.welcomeAtMs !== null && own.welcomeAtMs >= BOOT_MS + 2_900 && own.welcomeAtMs <= BOOT_MS + 3_400)) wrong.push(`the host's own seat was welcomed at ${own.welcomeAtMs} ms (the hold's end, about ${BOOT_MS + 3000} ms)`);
if (own.notices !== 2) wrong.push(`the host's own seat took ${own.notices} notices (one from its runtime in the boot, one from the core in the hold)`);
if (wrong.length) {
  console.error(`holdNotice: a held seat's stall clock did not follow its host's announced hold:\n  ${wrong.join('\n  ')}`);
  assert.fail('a host that holds a seat\'s HELLO tells it how long, on any link, and the seat waits that long and no longer');
}
assert.equal(kept.holdNotices, 2, 'the client counts both notices');
console.log(`holdNotice: a kept host's held seat waits through its ${BOOT_MS} ms boot and its hold (welcomed at ${kept.welcomeAtMs} ms, notices ${kept.notices.map((notice) => `${notice.holdMs} ms at ${notice.atMs}`).join(', ')}); a silent host's seat stalls at ${silent.stalledAtMs} ms (the fixed bound: ${5_000 + 33_000} ms); the host's own seat welcomed at ${own.welcomeAtMs} ms`);
