import assert from 'node:assert/strict';
import { createBotNavigationGrid, planBotRoute } from './botRoutePlanner.ts';

function seeded(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const wall = { min: [-20, -5, -85], max: [20, 20, 85] };
let heightSamples = 0;
const routeSpec = {
  enginePowerHp: 650,
  weightTons: 40,
  terrainResistance: { hard: 0.8, medium: 1.0, soft: 1.8 },
  trackTraction: 1,
};
const deps = {
  start: { x: -150, z: 0 },
  goal: { x: 150, z: 0 },
  heightField: {
    getHeightAt: () => { heightSamples++; return 0; },
    getGroundType: () => 'medium',
  },
  getObstacles: () => [wall],
  queryObstacles: (_minX, _minZ, _maxX, _maxZ, out) => {
    out.length = 0;
    out.push(wall);
    return out;
  },
  role: 'flanker',
  spec: routeSpec,
};
const navigation = createBotNavigationGrid(deps);
const routeA = planBotRoute({ ...deps, navigation, rng: seeded(7) });
const routeA2 = planBotRoute({ ...deps, navigation, rng: seeded(7) });
const routeB = planBotRoute({ ...deps, navigation, rng: seeded(99) });
assert.equal(heightSamples, 41 * 41, 'all bots share one terrain scan');
assert.deepEqual(routeA, routeA2, 'same match seed reproduces the opening');
assert.notDeepEqual(routeA, routeB, 'different match seeds vary the opening');
assert.ok(routeA.some(([, z]) => Math.abs(z) > 85), 'route clears the solid wall');
assert.ok(routeA.every(([x, z]) => !(x > -23.5 && x < 23.5 && z > -88.5 && z < 88.5)),
  'no waypoint occupies solid cover');
assert.deepEqual(routeA.at(-1), [150, 0], 'route still hunts the opposing spawn');

// Navigation must use the same tight compound footprint as movement. The
// broad-phase bounds span both wings, but the central courtyard is open and
// must not become an invisible 50 m wall in the bot grid.
const courtyard = {
  min: [-29, -2, -30], max: [29, 12, 30],
  shape2: {
    kind: 'compound', cx: 0, cz: 0,
    parts: [
      { kind: 'obb', cx: -25, cz: 0, hw: 4, hl: 30, yaw: 0 },
      { kind: 'obb', cx: 25, cz: 0, hw: 4, hl: 30, yaw: 0 },
    ],
  },
};
const courtyardNavigation = createBotNavigationGrid({
  heightField: { getHeightAt: () => 0 },
  getObstacles: () => [courtyard],
});
const centerCell = 20 * 41 + 20;
assert.equal(courtyardNavigation.blocked[centerCell], 0,
  'compound footprint keeps the open courtyard navigable');

// Vehicle capability must change the route over the same immutable terrain
// grid. A strong, high-grip tank can cross the short central ridge; a weak
// engine cannot sustain that climb and must use either end of the ridge.
const ridgeHeightField = {
  getHeightAt: (x, z) => Math.abs(x) < 25 && Math.abs(z) < 125 ? 18 : 0,
  getGroundType: () => 'medium',
};
const ridgeNavigation = createBotNavigationGrid({ heightField: ridgeHeightField });
const ridgeBase = {
  start: { x: -150, z: 0 },
  goal: { x: 150, z: 0 },
  heightField: ridgeHeightField,
  navigation: ridgeNavigation,
  role: 'brawler',
};
const strongRoute = planBotRoute({
  ...ridgeBase,
  rng: seeded(17),
  spec: {
    ...routeSpec,
    enginePowerHp: 950,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.4 },
    trackTraction: 1.15,
  },
});
const weakRoute = planBotRoute({
  ...ridgeBase,
  rng: seeded(17),
  spec: {
    ...routeSpec,
    enginePowerHp: 220,
    terrainResistance: { hard: 1.1, medium: 1.35, soft: 2.4 },
    trackTraction: 0.85,
  },
});
assert.ok(strongRoute.every(([, z]) => Math.abs(z) < 125),
  'capable bot takes the central ridge instead of a fixed-angle detour');
assert.ok(weakRoute.some(([, z]) => Math.abs(z) >= 125),
  'engine-limited bot routes around terrain it cannot climb');

// Ground condition is part of the same route decision. A randomized role
// waypoint inside a bog must not force the tank through it when a firm route
// around the edge is materially cheaper.
const bogHeightField = {
  getHeightAt: () => 0,
  getGroundType: (x, z) => Math.abs(x) < 100 && Math.abs(z) < 110 ? 'soft' : 'hard',
};
const bogNavigation = createBotNavigationGrid({ heightField: bogHeightField });
const bogRoute = planBotRoute({
  start: { x: -150, z: 0 },
  goal: { x: 150, z: 0 },
  heightField: bogHeightField,
  navigation: bogNavigation,
  role: 'brawler',
  rng: seeded(19),
  spec: {
    ...routeSpec,
    enginePowerHp: 800,
    terrainResistance: { hard: 0.8, medium: 1.1, soft: 3.0 },
  },
});
assert.ok(bogRoute.some(([, z]) => Math.abs(z) >= 110),
  'bot prefers firm terrain over a costly soft-ground role waypoint');

console.log('botRoutePlanner.selftest: seeded, vehicle-aware traversability passed');
