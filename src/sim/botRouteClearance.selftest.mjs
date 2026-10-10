// Hull clearance on the bot navigation grid (bots lane, 2026-10-02). Steinburg's 25 m grid ran a diagonal edge
// through a block whose two buildings stand 0.6 m apart, and led a courtyard out through a 1 m gap in the row behind
// it: the edges and the legs off the grid never asked whether a hull fits. Every leg a route hands a bot now keeps
// the widest hull's clearance of solid cover, round a single bend where the straight edge does not.
import assert from 'node:assert/strict';
import { createBotNavigationGrid, planBotRoute, NAV_HULL_HALF_WIDTH_M } from './botRoutePlanner.ts';
import { collisionFootprintContainsPoint } from '../world/collision.ts';
import { tankContactRect } from './tankContactShape.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { TANK_SPECS, SAVED_TANK_IDS } from '../vehicles/specs.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

const CLEARANCE = NAV_HULL_HALF_WIDTH_M + 0.5;
const spec = { enginePowerHp: 900, weightTons: 60, terrainResistance: { hard: 1, medium: 1.1, soft: 1.6 } };
const flat = { getHeightAt: () => 0, getGroundType: () => 'hard' };
const box = (x0, z0, x1, z1) => ({ min: [x0, 0, z0], max: [x1, 6, z1], kind: 'structure' });
const solid = (o) => !(o.crushed || o.crushable || o.dead);

function plan(navigation, start, goal) {
  return planBotRoute({ navigation, start, goal, spec, rng: () => 0.5, role: 'brawler', useRoleDetour: false });
}

/** The least clearance along every leg of a route (start included), sampled every 0.5 m, from solid footprints. */
function leastClearance(route, start, obstacles, skipEndM = 0) {
  let least = Infinity, prev = [start.x, start.z];
  for (const point of route) {
    const length = Math.hypot(point[0] - prev[0], point[1] - prev[1]);
    for (let d = 0; d <= length; d += 0.5) {
      const t = length ? d / length : 0, x = prev[0] + (point[0] - prev[0]) * t, z = prev[1] + (point[1] - prev[1]) * t;
      if (Math.hypot(x - start.x, z - start.z) < skipEndM) continue;
      let clear = 6;
      for (const o of obstacles) {
        if (!solid(o)) continue;
        for (const m of [0, 0.5, 1, 1.5, 2, 2.5, CLEARANCE - 0.01]) {
          if (m < clear && collisionFootprintContainsPoint(o, x, z, m)) { clear = m; break; }
        }
      }
      least = Math.min(least, clear);
    }
    prev = point;
  }
  return least;
}

console.log('[1] the grid is cleared for the widest hull in the fleet');
await ensureAuthorityFleet();
let widest = { id: '', halfWidth: 0 };
for (const id of SAVED_TANK_IDS) {
  const halfWidth = tankContactRect(TANK_SPECS[id]).halfWidth;
  if (halfWidth > widest.halfWidth) widest = { id, halfWidth };
}
assert.ok(widest.halfWidth <= NAV_HULL_HALF_WIDTH_M,
  `${widest.id} (${widest.halfWidth.toFixed(3)} m) fits the grid's ${NAV_HULL_HALF_WIDTH_M} m hull half-width`);
assert.ok(NAV_HULL_HALF_WIDTH_M - widest.halfWidth < 0.1, 'and the bound tracks the widest hull, not a guess');
console.log(`  ok  widest contact half-width ${widest.halfWidth.toFixed(3)} m (${widest.id})`);

console.log('[2] a diagonal edge through a 0.6 m gap between two blocks is no passage');
{
  // the two blocks meet the diagonal (0,0)-(25,25) at the gap; every cell around them stays open
  const blocks = [box(5, 5, 12.2, 20), box(12.8, 5, 20, 20)];
  const navigation = createBotNavigationGrid({ heightField: flat, getObstacles: () => blocks });
  const start = { x: 0, z: 0 }, route = plan(navigation, start, { x: 25, z: 25 });
  const least = leastClearance(route, start, blocks);
  assert.ok(least >= CLEARANCE - 0.01, `every leg keeps the hull's ${CLEARANCE} m (least ${least} m): ${JSON.stringify(route)}`);
  assert.deepEqual(route.at(-1), [25, 25], 'and the route still arrives');
  console.log(`  ok  ${JSON.stringify(route)}`);
}

console.log('[3] a boulder on an edge bends the edge round it instead of closing it');
{
  const boulder = { min: [10.5, 0, -2], max: [14.5, 2, 2], shape2: { kind: 'circle', cx: 12.5, cz: 0, r: 2 } };
  const navigation = createBotNavigationGrid({ heightField: flat, getObstacles: () => [boulder] });
  const start = { x: 0, z: 0 }, route = plan(navigation, start, { x: 50, z: 0 });
  const least = leastClearance(route, start, [boulder]);
  let length = 0, prev = [0, 0];
  for (const point of route) { length += Math.hypot(point[0] - prev[0], point[1] - prev[1]); prev = point; }
  assert.ok(least >= CLEARANCE - 0.01, `the bend keeps the hull's clearance (least ${least} m): ${JSON.stringify(route)}`);
  assert.ok(length < 53, `round the boulder, not round the next cells (${length.toFixed(1)} m for 50 m)`);
  console.log(`  ok  ${JSON.stringify(route.map((p) => p.map((v) => +v.toFixed(1))))}`);
}

console.log('[4] a hull in a channel leaves by its open end, not through the 1 m gap ahead');
{
  // Steinburg's courtyard in miniature: a 7.2 m channel between two buildings, a row behind them with a 1 m gap
  const walls = [box(-20, -10, -3.6, 15), box(3.6, -10, 20, 15), box(-40, 17, -0.5, 25), box(0.5, 17, 40, 25)];
  const navigation = createBotNavigationGrid({ heightField: flat, getObstacles: () => walls });
  const start = { x: 0, z: 5 }, route = plan(navigation, start, { x: 0, z: 80 });
  const least = leastClearance(route, start, walls);
  assert.ok(least >= CLEARANCE - 0.01, `every leg keeps the hull's clearance (least ${least} m): ${JSON.stringify(route)}`);
  assert.ok(route[0][1] < start.z, 'the first leg runs back down the channel');
  assert.deepEqual(route.at(-1), [0, 80]);
  console.log(`  ok  ${JSON.stringify(route)}`);
}

console.log('[5] Steinburg: the two pockets the battles found, and a sweep of the town');
{
  const world = createDedicatedWorldCollision('urban');
  const obstacles = world.getObstacles();
  const navigation = createBotNavigationGrid({ heightField: world.heightField, queryObstacles: world.queryObstacles,
    getObstacles: () => obstacles });
  const near = (x0, z0, x1, z1) => world.queryObstacles(Math.min(x0, x1) - 30, Math.min(z0, z1) - 30,
    Math.max(x0, x1) + 30, Math.max(z0, z1) + 30, []);
  for (const [label, start, goal] of [
    ['the block with a 0.6 m gap', { x: -75, z: -45 }, { x: -50, z: -75 }],
    // Steinburg's hill-town plan (2026-10-05, the map-revival lane) replaced the old courtyard: its yard is now the one
    // behind the north lane's rows (14 of 16 rays meet cover within 22 m), left by its west opening. The edge-offset
    // containment this receipt measures with overstates a rotated corner (a rectangle's corner reaches 1.41 times the
    // margin), so a leg passing under one reads short of the clearance it keeps: re-point a pocket, not the planner.
    ['the courtyard', { x: -18, z: 50 }, { x: -36, z: 279 }],
  ]) {
    const route = plan(navigation, start, goal);
    let least = Infinity, prev = start;
    for (const point of route) {
      least = Math.min(least, leastClearance([point], prev, near(prev.x, prev.z, point[0], point[1])));
      prev = { x: point[0], z: point[1] };
    }
    assert.ok(least >= CLEARANCE - 0.01, `${label}: every leg keeps the hull's clearance (least ${least} m)`);
    console.log(`  ok  ${label}: ${route.map((p) => `(${p[0].toFixed(0)},${p[1].toFixed(0)})`).join(' ')}`);
  }
  // open starts and goals across the town: no leg passes within half a metre of a building or a boulder
  let seed = 4242, touching = 0;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const clearOf = (x, z, m) => !near(x, z, x, z).some((o) => solid(o) && collisionFootprintContainsPoint(o, x, z, m));
  for (let k = 0; k < 60; k++) {
    let start, goal;
    do start = { x: (rnd() * 2 - 1) * 400, z: (rnd() * 2 - 1) * 400 }; while (!clearOf(start.x, start.z, 3));
    do goal = { x: (rnd() * 2 - 1) * 400, z: (rnd() * 2 - 1) * 400 }; while (!clearOf(goal.x, goal.z, 3));
    let prev = start;
    for (const point of plan(navigation, start, goal)) {
      const length = Math.hypot(point[0] - prev.x, point[1] - prev.z);
      for (let d = 0; d <= length; d += 1) {
        const x = prev.x + (point[0] - prev.x) * d / (length || 1), z = prev.z + (point[1] - prev.z) * d / (length || 1);
        if (!clearOf(x, z, 0.5)) { touching++; d = length; }
      }
      prev = { x: point[0], z: point[1] };
    }
  }
  assert.equal(touching, 0, `no leg of 60 town routes runs through cover (${touching} did)`);
  console.log('  ok  60 routes across the town, none through cover');
}

console.log('[6] a bridge deck is the floor its route rides, not cover');
{
  const world = createDedicatedWorldCollision('cliffbridge');
  const obstacles = world.getObstacles();
  const navigation = createBotNavigationGrid({ heightField: world.heightField, queryObstacles: world.queryObstacles,
    getObstacles: () => obstacles });
  const route = plan(navigation, { x: 0, z: -150 }, { x: 0, z: 150 });
  let prev = [0, -150];
  for (const point of route) {
    const length = Math.hypot(point[0] - prev[0], point[1] - prev[1]);
    for (let d = 0; d <= length; d += 1) {
      const t = d / (length || 1), x = prev[0] + (point[0] - prev[0]) * t, z = prev[1] + (point[1] - prev[1]) * t;
      if (Math.abs(z) < 99) assert.ok(Math.abs(x) <= 9, `the crossing stays on the deck (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
    prev = point;
  }
  assert.deepEqual(route.at(-1), [0, 150]);
  console.log(`  ok  ${route.map((p) => `(${p[0].toFixed(0)},${p[1].toFixed(0)})`).join(' ')}`);
}

console.log('botRouteClearance.selftest: hull-clear edges, bends, legs off the grid and decks passed');
