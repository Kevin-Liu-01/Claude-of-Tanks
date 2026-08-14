import assert from 'node:assert/strict';
import { createBotNavigationGrid, planBotRoute } from './botRoutePlanner.js';

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
const deps = {
  start: { x: -150, z: 0 },
  goal: { x: 150, z: 0 },
  heightField: { getHeightAt: () => { heightSamples++; return 0; } },
  getObstacles: () => [wall],
  queryObstacles: (_minX, _minZ, _maxX, _maxZ, out) => {
    out.length = 0;
    out.push(wall);
    return out;
  },
  role: 'flanker',
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

console.log('botRoutePlanner.selftest: seeded variation and traversability passed');
