// A route never starts from a grid cell the hull cannot drive out of (bot-wedge-264). Infected seed 2 on Badlands
// (mode-aggression harness, item/mode-reds-263): a bot T-72B3M Kunlun stood wedged in the low ground north of a mesa,
// (-31, -288) to (-12, -308), for some 80 s at full throttle and no speed. The grid cell on the mesa's flank at
// (-25, -300) stands 10 m up: open, and on every goal's side of the hull edges (which read no slope), but each of its
// eight edges is a cliff. routeStartCell took it as the start of every route from there (the legs to the nearer cells
// cross the rocks), the search could not leave it, and clearRoute made no route of one cell: the mission's setWaypoints
// handed the local router the bare destination behind the mesa, and the hull drove at the face, its stuck reverses
// putting it back on the same line each time. Pins: a synthetic knoll cell beside the start (the wet grid and the dry
// one), the Badlands wedge's positions, and the controller's mission route from inside the wedge.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createBotNavigationGrid, planBotRoute } from './botRoutePlanner.ts';
import { createTankState } from './movement.ts';
import { terrainVariantFor } from './matchRuleset.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createAI, mulberry32 } from '../game/ai.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

await ensureAuthorityFleet();
const spec = getSpec('t72b3m_kunlun');
assert.ok(spec, 'the wedged hull\'s spec is in the authority fleet');
const plan = (navigation, start, goal) => planBotRoute({ navigation, start, goal, spec, rng: () => 0.5, role: 'brawler',
  useRoleDetour: false });
const fmt = (route) => route.map((p) => `(${p[0].toFixed(0)},${p[1].toFixed(0)})`).join(' ');

// A knoll 8 m high on the grid cell (25, 0): its top within 4 m of the cell centre, its sides falling to the floor by
// 6 m. Every edge out of the cell meets a 128 % stretch (the edge samples a quarter along, 6.25 m out), so the cell is
// open but the hull cannot leave it; the cell (0, 0) is the next nearest.
const knoll = (x, z) => {
  const r = Math.hypot(x - 25, z);
  return r <= 4 ? 8 : r >= 6 ? 0 : 8 * (6 - r) / 2;
};
const start = { x: 16, z: 2, y: 0 }, goal = { x: 100, z: 0 };

console.log('[1] the wet grid: a start beside a cell it cannot leave routes from the next cell');
{
  const field = { getHeightAt: knoll, getGroundType: () => 'hard' };
  const navigation = createBotNavigationGrid({ heightField: field });
  const route = plan(navigation, start, goal);
  assert.ok(route.length >= 2, `a route round the knoll, not none (${fmt(route)})`);
  assert.ok(!route.some(([x, z]) => Math.hypot(x - 25, z) < 1), `no waypoint on the knoll cell (${fmt(route)})`);
  assert.deepEqual(route.at(-1), [goal.x, goal.z], 'it ends at the goal');
  console.log(`  ok  ${fmt(route)}`);
}

console.log('[2] the dry grid (avoid-liquid): the hull\'s own cell, when it cannot leave it, is not the start');
{
  const field = { getHeightAt: knoll, getGroundType: () => 'hard', getWaterMaskAt: () => 0,
    navigationWaterPolicy: 'avoid-liquid' };
  const navigation = createBotNavigationGrid({ heightField: field });
  const route = plan(navigation, start, goal);
  assert.ok(route.length >= 2, `a route round the knoll, not none (${fmt(route)})`);
  assert.ok(!route.some(([x, z]) => Math.hypot(x - 25, z) < 1), `no waypoint on the knoll cell (${fmt(route)})`);
  const end = route.at(-1);
  assert.ok(Math.hypot(end[0] - goal.x, end[1] - goal.z) <= 25, `it reaches the goal's cell (${fmt(route)})`);
  console.log(`  ok  ${fmt(route)}`);
}

console.log('[2b] a hull standing on the knoll (its own cell, at its height) keeps it, wet and dry: no drop off an edge');
{
  const onTop = { x: 24, z: 1, y: 8 };
  for (const [label, field] of [
    ['wet', { getHeightAt: knoll, getGroundType: () => 'hard' }],
    ['dry', { getHeightAt: knoll, getGroundType: () => 'hard', getWaterMaskAt: () => 0, navigationWaterPolicy: 'avoid-liquid' }],
  ]) {
    const route = plan(createBotNavigationGrid({ heightField: field }), onTop, goal);
    assert.ok(route.every(([x, z]) => Math.hypot(x - 25, z) < 1), `${label}: no waypoint off the knoll (${fmt(route)})`);
    console.log(`  ok  ${label}: [${fmt(route)}]`);
  }
}

console.log('[3] Badlands (the Infected ground): every position of the seed-2 wedge routes round the mesa');
const world = createDedicatedWorldCollision('badlands', { retain: true, variant: terrainVariantFor('infected') });
const field = world.heightField;
const navigation = createBotNavigationGrid({ heightField: field, queryObstacles: world.queryObstacles,
  getObstacles: () => world.getObstacles() });
// the survivors' ground south of the mesa, where the hunt's targets stood through the wedge
const quarry = { x: -20.4, z: -365.2 };
const wedge = [[-36, -286], [-31.6, -285.1], [-28.3, -291.1], [-25, -294], [-15.5, -300.4], [-12, -311]];
for (const [x, z] of wedge) {
  const route = plan(navigation, { x, z, y: field.getHeightAt(x, z) }, quarry);
  assert.ok(route.length >= 2, `from (${x}, ${z}): a route, not the bare destination (${fmt(route)})`);
  assert.ok(!route.some(([px, pz]) => Math.hypot(px + 25, pz + 300) < 1),
    `from (${x}, ${z}): no waypoint on the mesa's flank cell (-25, -300) (${fmt(route)})`);
  console.log(`  ok  (${x}, ${z}): ${fmt(route)}`);
}

console.log('[4] the controller: a hunt target behind the mesa gives the wedged hull a planned route');
{
  const bot = { id: 'kunlun', specId: spec.id, spec, team: 'bravo',
    state: createTankState(spec, new Vector3(-31.6, field.getHeightAt(-31.6, -285.1), -285.1), 0.78),
    combat: { hp: spec.hp, maxHp: spec.hp, destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS, kind: 'ready' },
      shellSlot: 0, modules: {}, crew: {}, fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 } };
  const searchRng = mulberry32(5);
  const ctl = createAI(bot, { difficulty: 'normal', rng: mulberry32(9), deps: {
    heightField: field, raycast: world.raycast, getObstacles: () => world.getObstacles(),
    queryObstacles: world.queryObstacles || null, getEnemies: () => [], getAllies: () => [],
    spotting: { isSpotted: () => false },
    planRoute: (from, to) => planBotRoute({ start: from, goal: to, navigation, rng: searchRng, role: 'brawler', spec,
      useRoleDetour: false }),
  } });
  ctl.setWaypoints([[quarry.x, quarry.z]], { loop: false });
  const info = ctl.debugInfo();
  assert.ok(info.wpCount >= 2, `the mission's waypoints are a route (${info.wpCount} waypoint(s), the first `
    + `(${info.waypointX?.toFixed(0)}, ${info.waypointZ?.toFixed(0)}))`);
  assert.ok(Math.hypot(info.waypointX - quarry.x, info.waypointZ - quarry.z) > 40,
    'the first waypoint is not the bare destination behind the mesa');
  console.log(`  ok  ${info.wpCount} waypoints, the first (${info.waypointX.toFixed(0)}, ${info.waypointZ.toFixed(0)})`);
}
world.release?.();

console.log('botRouteStartCell.selftest: no route starts from a cell the hull cannot leave (synthetic knoll, wet and dry; Badlands wedge; mission route)');
