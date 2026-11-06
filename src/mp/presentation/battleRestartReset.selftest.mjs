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
// Review r1 (the effects' half): the presentation stood the collision and props, and told the effects nothing. They kept
// the abandoned battle's structure stages (the house drawn as rubble over the wall that stood again) and their stage
// ledger, which refused the restarted battle's own collapse of the same house. Now the restart is told on the bus
// ('battle:restarted') and the effects reset what the battle laid as a battle's start does (fx/effects.ts resetAll):
//   5. the real effects runtime on the presentation's bus: house 2's collapse is drawn (its structure mask), the restart
//      stands it in the effects too, and the restarted battle's collapse of it is drawn again.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createBattlePresentation } from './index.ts';
import { createFx } from '../../fx/effects.ts';
import { STRUCT_STRIDE } from '../../fx/structureMask.ts';
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
  let restartsTold = 0;
  let ground = null;
  // the page's bus: what the presentation tells, and the listeners bound to it (the effects, case 5)
  const listeners = new Map();
  const bus = {
    on(type, listener) {
      const list = listeners.get(type) ?? [];
      listeners.set(type, list);
      list.push(listener);
      return () => { const at = list.indexOf(listener); if (at >= 0) list.splice(at, 1); };
    },
    emit(type, payload) {
      if (type === 'structure:stage') stages.push({ id: payload.structureId, stage: payload.stage, settled: payload.settled === true });
      if (type === 'battle:restarted') restartsTold++;
      for (const listener of [...(listeners.get(type) ?? [])]) listener(payload);
    },
  };
  const presentation = createBattlePresentation({
    engineCtx: { scene: { add() {} }, anisotropy: 1 },
    game: { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'winter' },
    bus,
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
    createTankVisual: () => ({ root: { position: new THREE.Vector3(), userData: {} }, setVisible() {}, syncFromState() {}, dispose() {} }),
    prepareVisualTextures: async () => {}, clock: () => 0,
  });
  await presentation.applyRoster([{ entityId: 1, seat: 0, team: 0, bot: false, connected: true, playerId: 'me', name: 'Me', specId: 'm1a1_abrams_hc' }],
    { ownEntityId: 1, ownPlayerId: 'me', roomId: 'r', mapId: 'winter', mode: 'standard', rulesetJson: '{}' });
  return { presentation, bus, field, crushes, stages, resets: () => worldResets, told: () => restartsTold, heapAt: (x, z) => ground?.offsetAt(x, z) ?? NaN };
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
  if (one.told() !== 1) wrong.push(`the bus heard the restart ${one.told()} times (once, for the effects)`);
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
  if (one.resets() !== 1 || one.told() !== 1) wrong.push(`no further reset within the restarted battle (${one.resets()} world resets, ${one.told()} told)`);
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
  assert.equal(late.told(), 0, 'and none told on the bus');
  assert.deepEqual(late.crushes.map((crush) => crush.index), [3], 'its list lays down as ever');
  late.presentation.dispose();
}

// ---- 5. the effects on the presentation's bus follow the restart (review r1)
{
  const five = await seat();
  // the effects' canvases (after the presentation, whose paint scheduler would take this stub for a page)
  const require = createRequire(import.meta.url);
  const { createCanvas } = require('@napi-rs/canvas');
  globalThis.document ??= { createElement: () => createCanvas(1, 1) };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
  camera.position.set(40, 20, -60); camera.lookAt(40, 0, 0); camera.updateMatrixWorld(true);
  // the world's structure materials take the effects' collapse patch; the patched program's mask is what the GPU draws
  // each building by (a collapsed one's start time in its first texel), read here off the patch's own uniform
  let mask = null;
  const world = {
    mapId: 'winter',
    patchStructureMaterials(patch) {
      const material = new THREE.MeshBasicMaterial();
      patch(material, { role: 'depth' });
      const shader = { uniforms: {}, vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}', fragmentShader: '#include <common>\nvoid main() {\n#include <dithering_fragment>\n}' };
      material.onBeforeCompile(shader, null);
      mask = shader.uniforms.uStructMask.value.image.data;
      return 1;
    },
  };
  const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
    { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) }, { seed: 5, world: () => world });
  scene.add(fx.group);
  fx.bindBus(five.bus);
  const frames = (n) => { for (let i = 0; i < n; i++) fx.update(1 / 60, [], camera, () => null); };
  frames(1);
  assert.ok(mask, 'setup: the effects patched the world\'s structure material');
  // well into a battle's clock, so each collapse laid is stamped with its own time (a settled one: the clock less the fall)
  fx.resetClock(100);
  frames(1);
  const laidAt = (structureId) => mask[structureId * STRUCT_STRIDE * 4];
  const drawnDown = (structureId) => laidAt(structureId) > 0;
  five.presentation.applyFrame(frame({ restarts: 0, destroyed: [0, 1], destruction: collapseLog }));
  frames(2);
  assert.ok(drawnDown(2), 'setup: the effects draw house 2 collapsed');
  assert.ok(!drawnDown(1), 'setup: and house 1 standing');
  const oldCollapseAt = laidAt(2);
  const wrong = [];
  five.presentation.applyFrame(frame({ restarts: 1 }));
  frames(2);
  if (drawnDown(2)) wrong.push('the effects still draw the abandoned battle\'s collapse of house 2 over its standing collision');
  five.presentation.applyFrame(frame({ restarts: 1, destroyed: [1], destruction: collapseLog }));
  frames(2);
  if (!(drawnDown(2) && laidAt(2) !== oldCollapseAt)) wrong.push(`the effects drew nothing of the restarted battle's collapse of house 2 (stamped ${laidAt(2)}, the abandoned battle's ${oldCollapseAt}: their stage ledger refused it)`);
  if (wrong.length) {
    console.error(`battleRestartReset: the effects kept the abandoned battle's structures over the restart:\n  ${wrong.join('\n  ')}`);
    assert.fail('a battle restart resets what the effects laid of the abandoned battle, and the restarted battle\'s collapse is drawn');
  }
  five.presentation.dispose();
  fx.resetAll();
}

console.log('battleRestartReset: a battle restart stands the old battle\'s fences and house again on this seat (the world\'s reset, the mirror\'s stages and ground, the effects\' stages on the bus), and the restarted battle lays and draws its own falls and collapse');
