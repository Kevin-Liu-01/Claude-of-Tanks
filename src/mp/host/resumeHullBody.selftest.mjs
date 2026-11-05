// Proof (implicit state machine audit, round 2 U2, 2026-11-04): a migrated host restores each hull's body from its row,
// not only its pose. applyResumeState wrote the row's position, speeds and angles and nothing else: the fresh host's
// ground contact (grounded), body mode (supported), spring and ride stayed under them, although wire 10 carries the body
// bits (AIRBORNE, OVERTURNED, TUMBLING, AUTO_RIGHTING; src/mp/match/hullBodyRow.ts). So
//   - a hull in the air at the keyframe was a grounded hull to the new host: its first step seated it on the ground
//     under it (a 4 m drop in one tick) instead of flying on;
//   - a hull tumbling on its side came back supported, its rigid phase lost.
// The restore is the client's own (prediction.ts applyAuthorityRow: pose, body flags, spring, ride), so the two copies of
// a hull take a row the same way. Built as combatMigration's handoff: the old host's keyframe through the codec, onto a
// second actor on the same roster, both stepped one tick.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { ENTITY_FLAGS } from '../wire/constants.ts';
import { hullBodyMode, restoreHullBodyMode, setHullGrounded } from '../../sim/hullBodyMode.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const seats = [
  { seat: 0, playerId: 'flying', name: 'Flying', team: 'alpha', specId: 'leclerc_s2' },
  { seat: 1, playerId: 'tumbling', name: 'Tumbling', team: 'bravo', specId: 'leclerc_s2' },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const world = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] });
const make = (resume) => createMatchActor({ roomId: 'resume-body', mapId: 'verdant', seed: 41, seats, bots: [], world: world(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
const inputs = new Map();

const old = make(null), sim = old.authority;
sim.onMatchReady();
for (let n = 0; n < 60; n++) sim.step({ dt: 1 / 60, inputs });
// the old host's hulls at the keyframe: one 4 m up and climbing 3 m/s (a crest's launch), one tumbling on its side
const flying = sim.entityById.get('flying').state, tumbling = sim.entityById.get('tumbling').state;
flying.pos.y = 4; flying.verticalSpeed = 3; setHullGrounded(flying, false);
flying._ride.y = 4; flying._ride.v = 3; flying._ride.airTime = 0.2;
tumbling.visualRoll = 1.4; restoreHullBodyMode(tumbling, false, true, false);
const tick = Math.round(sim.timeS * 60), battleTimeMs = Math.round(sim.timeS * 1000), era = createEraIndexer();
const snap = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
const frame = { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127, meta: captureMeta({ ...snap.meta, battleTimeMs }, false),
  destroyed: [], entities: sim.entities.map((entity) => captureEntityRow(entity, old.wireIdOf(entity.id), era, tick)), shells: [], viewer: null, modeStateJson: null };
const rowOf = (id) => frame.entities.find((row) => row.entityId === old.wireIdOf(id));
assert.ok(rowOf('flying').flags & ENTITY_FLAGS.AIRBORNE, 'setup: the flying hull\'s row says airborne');
assert.ok(rowOf('tumbling').flags & ENTITY_FLAGS.TUMBLING, 'setup: the tumbling hull\'s row says tumbling');
const sealed = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs, timeS: sim.timeS, phase: 'playing', modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(old), frame }));

const fresh = make({ tick, battleTimeMs });
applyResumeState(fresh, sealed);
const flown = fresh.authority.entityById.get('flying').state, tumbled = fresh.authority.entityById.get('tumbling').state;
const wrong = [];
if (flown.grounded !== false) wrong.push(`flying hull grounded ${flown.grounded} on the new host (its row says airborne)`);
if (!(Math.abs(flown._ride.y - 4) < 0.01 && Math.abs(flown._ride.v - 3) < 0.05)) wrong.push(`flying hull's ride at y ${flown._ride.y.toFixed(3)}, v ${flown._ride.v.toFixed(3)} (its row: 4 m, 3 m/s)`);
if (hullBodyMode(tumbled) !== 'tumbling') wrong.push(`tumbling hull's body mode '${hullBodyMode(tumbled)}' on the new host (its row says tumbling)`);
// one tick on both hosts: the flying hull flies on
sim.step({ dt: 1 / 60, inputs });
fresh.authority.onMatchReady();
fresh.authority.step({ dt: 1 / 60, inputs });
if (!(Math.abs(flown.pos.y - flying.pos.y) < 0.02)) wrong.push(`flying hull at y ${flown.pos.y.toFixed(3)} after a tick on the new host, ${flying.pos.y.toFixed(3)} on the old`);
if (wrong.length) {
  console.error(`resumeHullBody: ${wrong.length} body readings lost across the handoff:\n  ${wrong.join('\n  ')}`);
  assert.fail('a migrated host must restore each hull\'s ground contact, body mode, spring and ride from its row');
}
old.stop(); fresh.stop();
console.log('resumeHullBody: a migrated host restores each hull\'s ground contact, body mode, spring and ride from its row, as the client\'s predictor does: an airborne hull flies on, a tumbling one stays tumbling');
