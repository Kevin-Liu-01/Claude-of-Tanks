// Proof (implicit state machine audit M1, 2026-11-02): the phase a migrated host resumes in. Every keyframe carries
// countdown | playing | ended, and nothing read it: the actor forced the countdown to 0 on any resume, so a host lost
// during the countdown went live at once (its peers still in their covered entry), and a keyframe sealed after the
// verdict resumed as a running match with no result. And an elected seat that could not read its keyframe booted fresh
// at tick 0, a battle in progress restarted from its spawns behind every client's clock. Driven through the host core's
// port exactly as the browser host boots a migration (matchHostCore.ts boot with `resume`):
//   - countdown: the new actor counts down the time the old one had left, then plays;
//   - ended: the new actor is ended from its first tick with the old verdict, reports it, and its field stays still;
//   - no readable keyframe: a seat that saw the battle playing declines; before the battle it restarts the countdown on
//     the clients' timeline (migrationFallback), and the core boots that state at that tick, every hull on its spawn.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { INPUT_MARGIN_UNKNOWN, NO_TICK, PHASE, TICK_MS } from '../wire/constants.ts';
import { createHostPortPair } from './hostProtocol.ts';
import { createMatchHostCore } from './matchHostCore.ts';
import * as migration from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const { captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe, resumeStateFromRetained } = migration;
const seats = [
  { seat: 0, playerId: 'alice', name: 'Alice', team: 'alpha', specId: 'm1a1_abrams_hc', spawn: { x: -30, z: 0, yaw: 0 } },
  { seat: 1, playerId: 'bob', name: 'Bob', team: 'bravo', specId: 't90am', spawn: { x: 30, z: 0, yaw: Math.PI } },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const hostSecret = createHash('sha256').update('resume-phase').digest('hex');
const noSchedule = () => () => {};

/** The old host: an actor on the bare height field, advanced in virtual time. */
function oldHost(options) {
  let nowMs = 1000;
  const actor = createMatchActor({ roomId: 'PHASE1', mapId: 'verdant', seed: 4, seats, bots: [], world: 'terrain', now: () => nowMs, schedule: noSchedule, ...options });
  return { actor, advance(ticks) { for (let n = 0; n < ticks; n++) { nowMs += TICK_MS; actor.advance(nowMs); } } };
}

/** MatchHostCore.buildKeyframe's shape, through the sealed codec. */
function keyframeOf(actor) {
  const tick = actor.tick, serverTimeMs = Math.round(tick * TICK_MS), era = createEraIndexer();
  const meta = actor.authority.snapshot({ tick, serverTimeMs, viewerId: 'migration', ackInputSeq: null }).meta;
  const battleTimeMs = Math.round(actor.authority.timeS * 1000) + actor.resumedBattleTimeMs;
  const frame = {
    tick, serverTimeMs, ackedInputTick: NO_TICK, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: INPUT_MARGIN_UNKNOWN,
    meta: captureMeta({ ...meta, battleTimeMs }, actor.ended), destroyed: [], destruction: [], shells: [], viewer: null, modeStateJson: null,
    entities: actor.authority.entities.map((entity) => captureEntityRow(entity, actor.wireIdOf(entity.id), era, tick)).sort((a, b) => a.entityId - b.entityId),
  };
  const phase = actor.ended || actor.authority.result ? 'ended' : actor.authority.phase === 'countdown' ? 'countdown' : 'playing';
  return decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs, phase, frame, entities: captureEntityExtras(actor), modeCheckpoint: actor.authority.captureModeCheckpoint() }));
}

/** The new host: a core booted through its port with `resume`; its actor's loop is advanced by hand in virtual time. */
async function newHost(resume, battleLimitS = null) {
  let nowMs = 50_000;
  const pair = createHostPortPair();
  const posted = [];
  pair.main.onMessage((message) => posted.push(message));
  const core = createMatchHostCore({ port: pair.worker, buildWorld: async () => 'terrain', now: () => nowMs, schedule: noSchedule, setTimer: () => 0, clearTimer: () => {} });
  pair.main.post({ type: 'boot', config: { roomId: 'PHASE1', matchId: 'm1-0000ph45', generation: 2, mapId: 'verdant', mode: 'standard', seed: 4, seats, bots: [], countdownS: 0, battleLimitS, hostSecret, manifestBase: null, resume } });
  for (let n = 0; n < 400 && !posted.some((message) => message.type === 'ready' || message.type === 'boot_failed'); n++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(core.actor, `the core booted (${posted.find((message) => message.type === 'boot_failed')?.error ?? 'no ready'})`);
  return { core, actor: core.actor, posted, advance(ticks) { for (let n = 0; n < ticks; n++) { nowMs += TICK_MS; core.actor.advance(nowMs); } }, dispose() { core.dispose(); pair.main.close(); } };
}

// ---- a host lost one second into a five-second countdown
{
  const old = oldHost({ countdownS: 5, battleLimitS: 600 });
  old.advance(60);
  assert.equal(old.actor.authority.phase, 'countdown', 'setup: the old host is counting down');
  const keyframe = keyframeOf(old.actor);
  assert.equal(keyframe.frame.meta.phase, PHASE.COUNTDOWN);
  const { state } = resumeStateFromRetained(keyframe, 0, null, null, []);
  const next = await newHost({ ...state, resumeTick: keyframe.tick + 30, holdForSeats: [] }, 600);
  const meta = () => next.actor.authority.snapshotMeta('alice');
  assert.equal(next.actor.authority.phase, 'countdown', `a countdown resumes as a countdown (was: ${next.actor.authority.phase}, the rest of it skipped)`);
  assert.ok(Math.abs(meta().countdownMs - keyframe.frame.meta.countdownMs) <= 20, `with the time the old host had left (${meta().countdownMs} vs ${keyframe.frame.meta.countdownMs} ms)`);
  next.advance(Math.ceil(keyframe.frame.meta.countdownMs / TICK_MS) + 2);
  assert.equal(next.actor.authority.phase, 'playing', 'then the battle starts');
  next.dispose(); old.actor.stop();
}

// ---- a keyframe sealed after the verdict (a two-second clock that ran out)
{
  const old = oldHost({ countdownS: 0, battleLimitS: 2, endedLingerTicks: 600 });
  for (let n = 0; n < 200 && !old.actor.ended; n++) old.advance(1);
  assert.ok(old.actor.ended && old.actor.authority.result, 'setup: the old host reached its verdict');
  old.advance(20);
  const keyframe = keyframeOf(old.actor);
  assert.equal(keyframe.phase, 'ended');
  const { state } = resumeStateFromRetained(keyframe, 0, null, null, []);
  const next = await newHost({ ...state, resumeTick: keyframe.tick + 30, holdForSeats: [] }, 2);
  next.advance(1);
  assert.equal(next.actor.ended, true, 'an ended match resumes ended (was: a running match with no result)');
  assert.equal(next.actor.authority.result, old.actor.authority.result, 'with the old verdict');
  assert.equal(next.actor.authority.resultReason, old.actor.authority.resultReason);
  const timeS = next.actor.authority.timeS;
  next.advance(30);
  assert.equal(next.actor.authority.timeS, timeS, 'its field stays still (the ending hold is spent)');
  await new Promise((resolve) => setImmediate(resolve));
  const reports = next.posted.filter((message) => message.type === 'report').map((message) => message.report);
  assert.ok(reports.some((report) => report.phase === 'ended' && report.verdict?.result === old.actor.authority.result), `the new host reports the verdict (${JSON.stringify(reports.map((report) => report.phase))})`);
  next.dispose(); old.actor.stop();
}

// ---- no readable keyframe: decline a battle in progress, restart a countdown on the clients' timeline
{
  assert.equal(typeof migration.migrationFallback, 'function', 'the unreadable-state path is an explicit decision (migrationState.ts migrationFallback), not a silent fresh boot at tick 0');
  const playing = oldHost({ countdownS: 0, battleLimitS: 600 });
  playing.advance(90);
  assert.deepEqual(migration.migrationFallback({ latestFrame: keyframeOf(playing.actor).frame, latestFrameAtMs: 0, nowMs: 500, resumeTick: 60, countdownMs: 5000 }), { kind: 'decline', reason: 'battle_in_progress' },
    'a seat that saw the battle playing declines (the room elects a seat with the keyframe, or ends the match)');
  playing.actor.stop();
  const counting = oldHost({ countdownS: 5, battleLimitS: 600 });
  counting.advance(100);
  const seen = keyframeOf(counting.actor).frame;
  const restart = migration.migrationFallback({ latestFrame: seen, latestFrameAtMs: 10_000, nowMs: 11_000, resumeTick: 90, countdownMs: 5000 });
  assert.equal(restart.kind, 'restart');
  assert.equal(restart.resumeTick, seen.tick + 60, 'the restart continues the timeline the seat saw (newest tick plus the time since)');
  assert.equal(migration.migrationFallback({ latestFrame: null, latestFrameAtMs: null, nowMs: 0, resumeTick: 75, countdownMs: 5000 }).resumeTick, 75, 'or the room\'s resume tick');
  const next = await newHost({ ...restart.state, resumeTick: restart.resumeTick, holdForSeats: [] }, 600);
  assert.equal(next.actor.tick, restart.resumeTick, 'the core boots the restart at that tick, not at 0');
  assert.equal(next.actor.authority.phase, 'countdown');
  assert.equal(next.actor.authority.snapshotMeta('alice').countdownMs, 5000, 'with the whole countdown');
  const alice = next.actor.authority.entityById.get('alice');
  assert.ok(Math.hypot(alice.state.pos.x + 30, alice.state.pos.z) < 1, 'every hull on its spawn');
  next.dispose(); counting.actor.stop();
}
console.log('resumePhase: a migrated countdown counts on, an ended match stays ended with its verdict, and an unreadable keyframe declines a battle in progress or restarts the countdown on the clients\' timeline');
