// A flag carrier is revealed to every viewer (Main's ruling on audit finding 53, 2026-11-09; AGENTS.md: never send a
// hidden enemy's coordinates and rely on rendering). A carried flag's published position is its carrier's, so the
// carrier is an explicit reveal in the spotting filter (reveal reason 'flag_carrier'): the snapshot then carries the
// carrier's own row, and no coordinate of a hull the viewer does not observe rides the snapshot. Nobody else is revealed,
// and the reveal ends with the carry.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import '../vehicles/tankFactory.ts'; // register the full authored fleet
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { matchRulesetFor } from './matchRuleset.ts';

const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
const match = createAuthoritativeMatch({ gameMode: 'capture_the_flag', mapId: 'verdant', countdownS: 0, seed: 5,
  worldCollision: { mapId: 'verdant', heightField: flat, obstacles: [] }, players: [
    { id: 'runner', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: -400, yaw: 0 } },
    { id: 'scout', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: -300, z: -450, yaw: 0 } },
    { id: 'watcher', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 0, z: 400, yaw: Math.PI } },
  ] });
match.onMatchReady();
const controller = match.modeController;
const runner = match.entityById.get('runner'), watcher = match.entityById.get('watcher');
const [ownFlag, enemyFlag] = controller.state.flags;
assert.equal(enemyFlag.team, 'bravo');
assert.equal(matchRulesetFor('capture_the_flag').flagPitch.carrierRevealed, true, 'the ruleset names the reveal');

const idle = { throttle: 0, steer: 0, brake: true, fire: false, aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0 };
const inputs = new Map([['runner', idle], ['scout', idle], ['watcher', idle]]);
// the watcher holds 700+ m from every point the runner stands on (beyond any spot range on open ground)
const hold = (entity, x, z) => { entity.state.pos.x = x; entity.state.pos.z = z; entity.state.speed = 0; };
let tick = 0;
const step = (runnerAt) => {
  hold(watcher, 600, enemyFlag.baseZ + 400 * Math.sign(enemyFlag.baseZ || 1));
  hold(runner, runnerAt.x, runnerAt.z);
  match.step({ dt: 1 / 60, inputs });
  tick++;
};
const snapshotFor = (viewerId) => match.snapshot({ tick, serverTimeMs: tick * 1000 / 60, viewerId, ackInputSeq: tick });
// the hidden-coordinates law on the mode state: a carried flag is placed only where its carrier's own row is
const lawClean = (snapshot, label) => {
  const ids = new Set(snapshot.entities.map((entity) => entity.id));
  for (const flag of snapshot.meta.modeState.flags) {
    if (flag.status === 'carried') assert.ok(ids.has(flag.carrierId), `${label}: the ${flag.team} flag's carrier rides the snapshot`);
  }
  return ids;
};

for (let i = 0; i < 3; i++) step({ x: ownFlag.baseX, z: ownFlag.baseZ - 300 });
let seen = lawClean(snapshotFor('watcher'), 'before the take');
assert.ok(!seen.has('runner') && !seen.has('scout'), 'unspotted hulls are hidden before the take');
assert.equal(controller.revealReason('runner'), null, 'no reveal before the take');

for (let i = 0; i < 3; i++) step({ x: enemyFlag.x, z: enemyFlag.z });
assert.equal(enemyFlag.status, 'carried');
assert.equal(enemyFlag.carrierId, 'runner');
assert.equal(controller.revealReason('runner'), 'flag_carrier', 'carrying the flag is the named reveal');
assert.equal(controller.revealReason('scout'), null, 'nobody else is revealed');
// the runner drives off with it, still beyond the watcher's sight
for (let i = 0; i < 3; i++) step({ x: enemyFlag.baseX - 200, z: enemyFlag.baseZ });
const carrying = snapshotFor('watcher');
seen = lawClean(carrying, 'carrying');
assert.ok(seen.has('runner'), 'the carrier is revealed to the other side');
assert.ok(!seen.has('scout'), 'no other hidden hull is sent');
const flagRow = carrying.meta.modeState.flags.find((flag) => flag.team === 'bravo');
assert.ok(Math.hypot(flagRow.x - runner.state.pos.x, flagRow.z - runner.state.pos.z) < 1e-6, 'the flag rides its revealed carrier');
const entitiesOut = [], shellsOut = [];
match.observeForViewer('watcher', entitiesOut, shellsOut);
assert.deepEqual(entitiesOut.map((entity) => entity.id).sort(), [...seen].sort(), 'observeForViewer applies the same reveal');
match.afterSnapshotBroadcast();

// the capture ends the carry, and with it the reveal
for (let i = 0; i < 3; i++) step({ x: ownFlag.baseX, z: ownFlag.baseZ });
assert.equal(controller.state.score.alpha, 1, 'the run is captured');
assert.equal(controller.revealReason('runner'), null, 'the reveal ends with the carry');
seen = lawClean(snapshotFor('watcher'), 'after the capture');
assert.ok(!seen.has('runner'), 'the former carrier is hidden again');

console.log('flagCarrierReveal.selftest: the carrier is revealed by name while it carries, nobody else, and the snapshot places no hidden hull');
