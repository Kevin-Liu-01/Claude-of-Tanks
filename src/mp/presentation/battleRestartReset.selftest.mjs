// Proof (implicit state machine audit, round 3 X5, 2026-11-05): the presentation's settled world follows a battle restart.
// A host that restarts the battle from its spawns (migrationFallback, the kept host's last resort), or resumes it from a
// frame still in its countdown, has every prop and structure standing; the client tells the restart once on
// MatchFrame.battleRestarts (matchClient.ts restartBattle, round 3 A3). The presentation laid the abandoned battle's
// destroyed list and destruction log down as settled state and never stood them up: the client's collision kept the old
// crushes (its prediction drove through props the host blocks), and the restarted battle's own falls and stages of the
// same props and structures found them already down and laid nothing. Here, on the real presentation and destruction
// mirror over a world of four fences and a street of four houses (the world's own destructibles reset is its seam, as
// map.ts resetDestructibles is in the browser):
//   1. the old battle lays fences 0 and 1 and collapses house 2 (records crushed, the collider dead, the heap raised);
//   2. a frame of the restarted battle (battleRestarts 0 -> 1): the world's destructibles reset once, house 2 stands
//      again (records, collider, ground), nothing is laid;
//   3. the restarted battle fells fence 1 and collapses house 2 again: both lie down again, settled;
//   4. a presentation whose first frame already counts a restart resets nothing (its world is fresh).
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createBattlePresentation } from './index.ts';
import { setCompoundShape, setObbShape } from '../../world/collision.ts';
import { createDestructionMatch } from '../../sim/destructionMatch.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';
import { quantizeDestructionEntry } from '../wire/destructionLog.ts';
import { PHASE, VERDICT } from '../wire/constants.ts';
import { encodeObstacleFall } from '../../sim/obstacleFall.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

await ensureAuthorityFleet(['m1a1_abrams_hc']);
const P1_RULES = { ...matchRulesetFor('standard').destruction, sections: false };
const flat = { getHeightAt: () => 0, getHeightAtFast: () => 0, getContactHeightAt: () => 0, getNormalAt: () => null, getGroundType: () => 'hard', maxY: 1 };

/** Four fences (obstacles 0-3), then a street of four houses (structure ids 0-3, obstacles 4-7, colliders 0-3). */
function battlefield() {
  const obstacles = Array.from({ length: 4 }, (_, index) => ({ min: [index * 4, 0, 40], max: [index * 4 + 1, 2, 41], crushed: false, crushable: true, crushMin: 0, kind: 'fence', shape2: null }));
  const colliders = [];
  for (let id = 0; id < 4; id++) {
    obstacles.push(setObbShape({ min: [0, 0, 0], max: [0, 1.8, 0], kind: 'structure', structureIdx: id }, id * 20, 0, 6, 4, 0));
    colliders.push(setCompoundShape({ min: [0, 0, 0], max: [0, 6, 0], kind: 'structure', structureIdx: id }, [{ kind: 'obb', cx: id * 20, cz: 0, hw: 6, hl: 4, yaw: 0 }]));
  }
  return { obstacles, colliders };
}

// the authority's log of house 2 collapsing (as a destruction match on the same street writes it)
const authority = createDestructionMatch({ rules: P1_RULES, ...(() => { const { obstacles, colliders } = battlefield(); return { obstacles: obstacles.slice(4), colliders }; })() });
const house = authority.structures.byId(2);
authority.structures.applyPoints(house, house.maxHp * 2, { cause: 'blast', munition: 'he', x: 40, y: 2, z: -4, dirX: 0, dirZ: 1 });
authority.step();
const collapseLog = authority.log.map(quantizeDestructionEntry);
assert.ok(collapseLog.some((entry) => entry.kind === 'stage' && entry.stage === 'collapsed' && entry.structureId === 2), 'setup: the log collapses house 2');

async function seat() {
  const field = battlefield();
  const crushes = [];
  const stages = [];
  let worldResets = 0;
  let ground = null;
  const presentation = createBattlePresentation({
    engineCtx: { scene: { add() {} }, anisotropy: 1 },
    game: { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'winter' },
    bus: { emit(type, payload) { if (type === 'structure:stage') stages.push({ id: payload.structureId, stage: payload.stage, settled: payload.settled === true }); } },
    worldCollision: {
      heightField: flat, getObstacles: () => field.obstacles, getColliders: () => field.colliders,
      // the world's crush of a prop, and its own reset of every destructible (map.ts: props, trees, poles stand again)
      crushObstacle(obstacle, dx, dz, speed, cause, options) {
        crushes.push({ index: field.obstacles.indexOf(obstacle), settled: options?.settled === true });
        obstacle.crushed = true;
      },
      // the round's ground (craters, heaps) the world draws and drapes on (the mirror's overlay)
      bindGroundOverlay(overlay) { ground = overlay; },
      resetDestructibles() {
        worldResets++;
        for (const obstacle of field.obstacles) if (obstacle.kind === 'fence') obstacle.crushed = false;
      },
    },
    createTankVisual: () => ({ root: { position: new Vector3(), userData: {} }, setVisible() {}, syncFromState() {}, dispose() {} }),
    prepareVisualTextures: async () => {}, clock: () => 0,
  });
  await presentation.applyRoster([{ entityId: 1, seat: 0, team: 0, bot: false, connected: true, playerId: 'me', name: 'Me', specId: 'm1a1_abrams_hc' }],
    { ownEntityId: 1, ownPlayerId: 'me', roomId: 'r', mapId: 'winter', mode: 'standard', rulesetJson: '{}' });
  return { presentation, field, crushes, stages, resets: () => worldResets, heapAt: (x, z) => ground?.offsetAt(x, z) ?? NaN };
}

const frame = ({ restarts, destroyed = [], destruction = [], revision = destroyed.length }) => ({
  tick: 100, renderTimeMs: 0, entities: [], shells: [], unseenShells: [],
  meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 1000, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: revision },
  modeStateJson: null, destroyed, destroyedFalls: destroyed.map(() => encodeObstacleFall('ram', 1, 0)), destructibleRevision: revision, destroyedPending: () => false,
  destruction, destructionPending: () => false, craterPending: () => false,
  viewer: { entityId: 1, playerId: 'me', state: null, row: null, viewer: null, authorityTick: 0, authorityReceivedAtMs: 0, predictedShot: null },
  events: [], ownShots: [], extrapolatedMs: 0, phase: 'live', battleRestarts: restarts,
});

{
  const one = await seat();
  const houseRecord = one.field.obstacles[4 + 2], houseCollider = one.field.colliders[2];
  // ---- 1. the old battle's settled state
  one.presentation.applyFrame(frame({ restarts: 0, destroyed: [0, 1], destruction: collapseLog }));
  assert.deepEqual(one.crushes.map((crush) => crush.index), [0, 1], 'setup: the old battle lays fences 0 and 1');
  assert.ok(one.stages.some((stage) => stage.id === 2 && stage.stage === 'collapsed'), 'setup: and collapses house 2');
  assert.ok(houseRecord.crushed && houseCollider.dead, 'setup: house 2 no longer pushes the predicted hull nor stops rays');
  assert.ok(one.heapAt(40, 0) > 0.5, `setup: its heap is on this seat's ground (${one.heapAt(40, 0)})`);
  // ---- 2. the restarted battle's first frame: nothing destroyed, nothing logged
  one.presentation.applyFrame(frame({ restarts: 1 }));
  const wrong = [];
  if (one.resets() !== 1) wrong.push(`the world's destructibles reset ${one.resets()} times (once at the restart)`);
  if (one.field.obstacles[0].crushed || one.field.obstacles[1].crushed) wrong.push('the old battle\'s fences still lie on this seat');
  if (houseRecord.crushed || houseCollider.dead) wrong.push(`the old battle's collapse of house 2 still stands in this seat's collision (crushed ${houseRecord.crushed}, dead ${houseCollider.dead})`);
  if (!(one.heapAt(40, 0) === 0)) wrong.push(`the old battle's heap is still on this seat's ground (${one.heapAt(40, 0)} m)`);
  // ---- 3. the restarted battle fells fence 1 and collapses house 2 again
  const before = { crushes: one.crushes.length, stages: one.stages.length };
  one.presentation.applyFrame(frame({ restarts: 1, destroyed: [1], destruction: collapseLog }));
  const relaid = one.crushes.slice(before.crushes);
  if (!(relaid.length === 1 && relaid[0].index === 1 && relaid[0].settled)) wrong.push(`the restarted battle's fall of fence 1 laid ${JSON.stringify(relaid)}`);
  if (!one.stages.slice(before.stages).some((stage) => stage.id === 2 && stage.stage === 'collapsed' && stage.settled)) wrong.push('the restarted battle\'s collapse of house 2 laid nothing');
  if (!(houseRecord.crushed && houseCollider.dead)) wrong.push('house 2 is not down again');
  if (one.resets() !== 1) wrong.push(`no further reset within the restarted battle (${one.resets()})`);
  if (wrong.length) {
    console.error(`battleRestartReset: the abandoned battle's settled world outlived its restart:\n  ${wrong.join('\n  ')}`);
    assert.fail('a battle restart stands the settled world, and the restarted battle lays its own');
  }
  one.presentation.dispose();
}

// ---- 4. a presentation whose first frame already counts a restart: its world is fresh, nothing to stand
{
  const late = await seat();
  late.presentation.applyFrame(frame({ restarts: 2, destroyed: [3] }));
  assert.equal(late.resets(), 0, 'no reset on the first frame');
  assert.deepEqual(late.crushes.map((crush) => crush.index), [3], 'its list lays down as ever');
  late.presentation.dispose();
}

console.log('battleRestartReset: a battle restart stands the old battle\'s fences and house again on this seat (the world\'s reset, the mirror\'s stages and ground), and the restarted battle lays its own falls and collapse');
