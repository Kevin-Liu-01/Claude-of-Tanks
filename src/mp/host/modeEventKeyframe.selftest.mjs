// Proof (implicit state machine audit, round 2 U2, 2026-11-04): a migration keyframe follows a mode event. The keyframe
// seals the mode checkpoint (scores, zones, flags, the ball, waves, respawns), dated at its capture, and the host core
// sealed one only on its cadence (ROOM_MATCH_KEYFRAME_INTERVAL_MS, 2 s; a keyframe still sealing skipped a whole
// interval). A host that died between a mode event and the next keyframe left the event out of every seat's resume: the
// new host replayed a Turbo Ball goal from the ball's place before it, started a Horde wave again, lost a capture or a
// score, and revived a hull twice. Now the core seals a keyframe within a housekeeping beat of a mode event (at most
// every MODE_KEYFRAME_SPACING_MS), so the window is a beat and a seal, not the interval.
// Driven through the host core's port as the browser host boots (matchHostCore.ts boot), its cadence set to 10 s so a
// keyframe soon after the event can only be the event's: Zone Control, a hull killed and revived by the mode
// (mode_respawn), virtual time.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TICK_MS } from '../wire/constants.ts';
import { createHostPortPair } from './hostProtocol.ts';
import { createMatchHostCore } from './matchHostCore.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const seats = [
  { seat: 0, playerId: 'alice', name: 'Alice', team: 'alpha', specId: 'm1a1_abrams_hc', spawn: { x: -30, z: 0, yaw: 0 } },
  { seat: 1, playerId: 'bob', name: 'Bob', team: 'bravo', specId: 't90am', spawn: { x: 30, z: 0, yaw: Math.PI } },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
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
// Web Crypto resolves on the thread pool: a real event-loop turn, not just microtasks
const settle = async (rounds = 3) => { for (let n = 0; n < rounds; n++) await new Promise((resolve) => setImmediate(resolve)); };
const advance = async (ms, each = () => {}) => {
  for (let step = 0, steps = Math.max(1, Math.round(ms / TICK_MS)); step < steps; step++) { nowMs += TICK_MS; time.fireDue(); await settle(); each(); }
};

const pair = createHostPortPair();
const posted = [];
pair.main.onMessage((message) => posted.push(message));
const core = createMatchHostCore({ port: pair.worker, buildWorld: async () => 'terrain', now: time.clock, schedule: time.schedule, setTimer: time.setTimer, clearTimer: time.clearTimer,
  keyframeIntervalMs: 10_000, configIntervalMs: 60_000, reportIntervalMs: 60_000 });
const hostSecret = createHash('sha256').update('mode-event-keyframe').digest('hex');
pair.main.post({ type: 'boot', config: { roomId: 'MODEKF', matchId: 'm1-00m0dekf', generation: 1, mapId: 'verdant', mode: 'zone_control', seed: 9, seats, bots: [], countdownS: 0, battleLimitS: 600, hostSecret, manifestBase: null, resume: null } });
for (let n = 0; n < 400 && !posted.some((message) => message.type === 'ready' || message.type === 'boot_failed'); n++) await settle(1);
assert.ok(core.actor, `the core booted (${posted.find((message) => message.type === 'boot_failed')?.error ?? 'no ready'})`);
const keyframes = () => core.stats()?.migrationKeyframes ?? 0;
await advance(1000);
assert.equal(keyframes(), 1, `setup: the cadence's first keyframe, and no other in the first second (${keyframes()})`);

// a hull destroyed; the mode revives it after its respawn time (mode_respawn)
const sim = core.actor.authority;
const ifv = sim.entityById.get('alice');
ifv.combat.hp = 0; ifv.combat.destroyed = true;
let revivedAtMs = null, atRevive = 0, sealedAfterMs = null;
await advance(((sim.modeController.ruleset.respawnS ?? 6) + 2.5) * 1000, () => {
  if (revivedAtMs === null && !sim.entityById.get('alice').combat.destroyed) { revivedAtMs = nowMs; atRevive = keyframes(); }
  else if (revivedAtMs !== null && sealedAfterMs === null && keyframes() > atRevive) sealedAfterMs = nowMs - revivedAtMs;
});
assert.ok(revivedAtMs !== null, 'setup: the mode revived the hull');
assert.ok(sealedAfterMs !== null && sealedAfterMs <= 800,
  `a keyframe follows the revive within a housekeeping beat and a seal (${sealedAfterMs === null ? 'none in 2.5 s: the next one is the cadence\'s, 10 s on' : `${Math.round(sealedAfterMs)} ms`})`);
// and the cadence's own spacing holds: mode events do not seal more than twice a second
const before = keyframes();
await advance(2000);
assert.ok(keyframes() - before <= 4, `at most every 500 ms (${keyframes() - before} in 2 s)`);
core.dispose(); pair.main.close();
console.log(`modeEventKeyframe: a migration keyframe follows a mode event within ${Math.round(sealedAfterMs)} ms (the cadence alone: up to its whole interval)`);
