// Proof (implicit state machine audit, round 3 A3, 2026-11-05): the battle's identity travels with the battle. A client
// judged a battle restart from the first snapshot of a link: behind its clocks, or a begun battle shown as not begun.
// Both read the restart's place against the client's own clocks, so a plain reconnect whose first snapshot came 2.5 s
// late read as a restart (it dropped the keyframe an election needs), and a restart on the clients' clock seen after its
// countdown read as none (src/mp/match/timelineRestart.selftest.mjs cases (e) and (f) drive the client). Now the host
// names the battle it plays (WelcomeMessage.battleId): 0 for a match's first battle, kept by every resume through the
// sealed keyframe, and new for a fallback restart. Here, on the real host core through its port, a seat's WELCOME and the
// keyframes it is sent:
//   1. a match's first battle: WELCOME battleId 0, and its keyframe names none;
//   2. a fallback restart (migrationFallback, the kept host's last resort) mints a battle id of its own (never 0; two
//      restarts never share one here); the restarted host's WELCOME and keyframe carry it;
//   3. a resume from that keyframe keeps it: the resumed host's WELCOME carries the restarted battle's id.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { signSeatToken } from '../../../server/match/seatToken.ts';
import { decodeMessage, encodeMessage } from '../wire/codec.ts';
import { MESSAGE_TYPE, PHASE, PROTOCOL_VERSION, TICK_MS, VERDICT } from '../wire/constants.ts';
import { MigrationStore, isMigrationEventKind } from '../match/migrationStore.ts';
import { createHostPortPair } from './hostProtocol.ts';
import { createMatchHostCore } from './matchHostCore.ts';
import * as migration from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const seats = [
  { seat: 0, playerId: 'alice', name: 'Alice', team: 'alpha', specId: 'm1a1_abrams_hc', spawn: { x: -30, z: 0, yaw: 0 } },
  { seat: 1, playerId: 'bob', name: 'Bob', team: 'bravo', specId: 't90am', spawn: { x: 30, z: 0, yaw: Math.PI } },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const hostSecret = createHash('sha256').update('battle-identity').digest('hex');
const key = await migration.deriveMigrationKey(hostSecret);
const hello = (seat) => encodeMessage({ type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 0, clientBuild: 'battle-id',
  token: signSeatToken(hostSecret, { v: 1, roomId: 'BATTLE', seat: seat.seat, playerId: seat.playerId, name: seat.name, team: seat.team, specId: seat.specId, iat: Date.now() - 1000, exp: Date.now() + 3_600_000 }) });
const settle = async (rounds = 40) => { for (let n = 0; n < rounds; n++) await new Promise((resolve) => setImmediate(resolve)); };

/** A host core booted from `resume` (null: a fresh match); alice attached. Its WELCOME and its next sealed keyframe. */
async function host(resume) {
  const pair = createHostPortPair();
  const posted = [];
  pair.main.onMessage((message) => posted.push(message));
  const core = createMatchHostCore({ port: pair.worker, buildWorld: async () => 'terrain', now: () => 0, schedule: () => () => {}, setTimer: () => 0, clearTimer: () => {} });
  pair.main.post({ type: 'boot', config: { roomId: 'BATTLE', matchId: 'm1-0ba771e0', generation: 1, mapId: 'verdant', mode: 'standard', seed: 5, seats, bots: [], countdownS: 0,
    battleLimitS: 600, hostSecret, manifestBase: null, resume } });
  for (let n = 0; n < 400 && !core.actor && !posted.some((message) => message.type === 'boot_failed'); n++) await settle(1);
  assert.ok(core.actor, `the core booted (${posted.find((message) => message.type === 'boot_failed')?.error ?? 'no actor'})`);
  pair.main.post({ type: 'link_open', peer: 1, label: 'alice', playerId: 'alice' });
  pair.main.post({ type: 'link_frame', peer: 1, bytes: hello(seats[0]).slice().buffer });
  await settle();
  const sent = () => posted.filter((message) => message.type === 'link_send' && message.peer === 1).map((message) => decodeMessage(new Uint8Array(message.bytes)))
    .filter((decoded) => decoded.ok).map((decoded) => decoded.message);
  const welcome = sent().find((message) => message.type === MESSAGE_TYPE.WELCOME);
  assert.ok(welcome, 'alice is welcomed');
  // the keyframe the core seals for the next host, as alice's client retains it
  const store = new MigrationStore();
  store.beginLink();
  await core.broadcastKeyframe();
  await settle();
  for (const message of sent()) if (message.type === MESSAGE_TYPE.EVENT) for (const event of message.events) if (isMigrationEventKind(event.kind)) store.receive(event, 0);
  assert.ok(store.keyframe, 'alice retained the sealed keyframe');
  const keyframe = migration.decodeMigrationKeyframe(await migration.openMigrationBlob(key, store.keyframe.blob));
  core.dispose();
  pair.main.close();
  return { welcome, keyframe, actorBattleId: core.actor?.battleId };
}

// ---- 1. a match's first battle
const first = await host(null);
assert.equal(first.welcome.battleId, 0, 'a match\'s first battle is 0');
assert.equal(first.keyframe.battleId ?? 0, 0, 'its keyframe names no other');

// ---- 2. a fallback restart mints a battle of its own
const playing = { tick: 900, serverTimeMs: Math.round(900 * TICK_MS), ackedInputTick: 0, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 0,
  meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 15_000, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
  destroyed: [], destruction: [], entities: [], shells: [], viewer: null, modeStateJson: null };
const restart = migration.migrationFallback({ latestFrame: playing, latestFrameAtMs: 0, nowMs: 10_000, resumeTick: 0, countdownMs: 5000, kept: true });
assert.equal(restart.kind, 'restart', 'setup: the kept host restarts the battle');
const restartId = restart.state.battleId;
assert.ok(Number.isInteger(restartId) && restartId > 0 && restartId <= 0xffffffff, `a restart names a battle of its own, never the first's 0 (${restartId})`);
const ids = new Set(Array.from({ length: 64 }, () => migration.migrationFallback({ latestFrame: null, latestFrameAtMs: null, nowMs: 0, resumeTick: 0, countdownMs: 5000 }).state.battleId));
assert.equal(ids.size, 64, 'every restart names another battle');
assert.equal(migration.migrationFallback({ latestFrame: null, latestFrameAtMs: null, nowMs: 0, resumeTick: 0, countdownMs: 5000, battleId: 77 }).state.battleId, 77, 'or the one it is given');
const restarted = await host({ ...restart.state, resumeTick: restart.resumeTick, holdForSeats: [] });
assert.equal(restarted.welcome.battleId, restartId, `the restarted host welcomes its seats into the restarted battle (${restarted.welcome.battleId})`);
assert.equal(restarted.keyframe.battleId, restartId, 'and seals it into its keyframe');

// ---- 3. a resume keeps the battle it resumes
const { state } = migration.resumeStateFromRetained(restarted.keyframe, 0, null, null, []);
assert.equal(state.battleId, restartId, 'the resume state names the keyframe\'s battle');
const resumed = await host({ ...state, resumeTick: state.tick + 60, holdForSeats: [] });
assert.equal(resumed.welcome.battleId, restartId, `a resumed host welcomes its seats into the same battle (${resumed.welcome.battleId})`);
assert.equal(resumed.keyframe.battleId, restartId, 'and keeps it in its own keyframes');

console.log(`battleIdentity: a match's first battle is 0, a fallback restart names its own (${restartId}), and a resume keeps it through the sealed keyframe to its WELCOMEs`);
