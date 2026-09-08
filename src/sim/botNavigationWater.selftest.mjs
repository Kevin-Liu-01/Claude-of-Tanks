// Focused opt-in route-policy regression fixtures.
import assert from 'node:assert/strict';
import { createBotNavigationGrid, planBotRoute } from './botRoutePlanner.ts';
import { createHeightField } from '../world/terrain.ts';
import { getMapConfig, MAP_IDS } from '../world/maps/index.ts';

const N = 41, CELL = 25, MIN = -500;
const index = (x, z) => ((z - MIN) / CELL) * N + (x - MIN) / CELL;
const steps = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const spec = {
  enginePowerHp: 650, weightTons: 40, trackTraction: 1.15,
  terrainResistance: { hard: 0.8, medium: 1, soft: 1.8 },
};
const flat = {
  getHeightAt: () => 0, getGroundType: () => 'medium',
  getWaterMaskAt: () => 0,
};
function plan(navigation, start, goal, extra = {}) {
  return planBotRoute({ navigation, start, goal, spec, rng: () => 0.5,
    useRoleDetour: false, ...extra });
}
function dryGrid(overrides = {}) {
  return createBotNavigationGrid({
    heightField: { ...flat, navigationWaterPolicy: 'avoid-liquid', ...overrides },
  });
}
function assertGridSegments(route, grid) {
  for (const [x, z] of route) {
    assert.ok(Number.isInteger((x - MIN) / CELL) && Number.isInteger((z - MIN) / CELL));
    assert.equal(grid.blocked[index(x, z)], 0, 'every emitted grid point is allowed');
  }
  for (let n = 1; n < route.length; n++) {
    let [x, z] = route[n - 1];
    const [tx, tz] = route[n];
    const dx = Math.sign(tx - x), dz = Math.sign(tz - z);
    const count = Math.max(Math.abs(tx - x), Math.abs(tz - z)) / CELL;
    assert.ok(dx === 0 || dz === 0 || Math.abs(tx - x) === Math.abs(tz - z),
      'simplification preserves a collinear grid edge chain');
    const direction = steps.findIndex(([sx, sz]) => sx === dx && sz === dz);
    for (let k = 0; k < count; k++) {
      assert.equal(grid.waterBlockedEdges[index(x, z)] & (1 << direction), 0);
      const nx = x + dx * CELL, nz = z + dz * CELL;
      assert.equal(grid.blocked[index(nx, nz)], 0);
      if (dx && dz) {
        assert.equal(grid.blocked[index(nx, z)], 0, 'no diagonal corner cutting');
        assert.equal(grid.blocked[index(x, nz)], 0, 'no diagonal corner cutting');
      }
      x = nx; z = nz;
    }
  }
}

// Default maps: a liquid-capable height field does not itself opt into policy.
// Preserve row-major height -> ground -> obstacles calls and RNG consumption.
const trace = [];
const legacyField = {
  getHeightAt(x, z) { trace.push(['height', x, z]); return 0; },
  getGroundType(x, z) { trace.push(['ground', x, z]); return 'soft'; },
  getWaterMaskAt() { throw new Error('default policy must never query liquid'); },
};
const legacy = createBotNavigationGrid({
  heightField: legacyField,
  queryObstacles(x0, z0, _x1, _z1, out) {
    trace.push(['obstacles', x0 + 4.5, z0 + 4.5]); out.length = 0; return out;
  },
});
assert.equal(trace.length, N * N * 3);
for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
  const at = (iz * N + ix) * 3, x = MIN + ix * CELL, z = MIN + iz * CELL;
  assert.deepEqual(trace.slice(at, at + 3),
    [['height', x, z], ['ground', x, z], ['obstacles', x, z]]);
}
assert.equal(legacy.navigationWaterPolicy, undefined);
assert.equal(legacy.waterBlockedEdges, undefined);
assert.equal(legacy.blocked.reduce((a, b) => a + b, 0), 0, 'default shallow soft ground remains legal');
const plain = createBotNavigationGrid({
  heightField: { getHeightAt: () => 0, getGroundType: () => 'soft' },
});
for (const useRoleDetour of [false, true]) {
  let calls = 0;
  const args = { useRoleDetour, rng: () => { calls++; return 0.5; } };
  const route = plan(legacy, { x: -150, z: 0 }, { x: 153, z: 2 }, args);
  assert.equal(calls, useRoleDetour ? 4 : 1);
  assert.deepEqual(route, plan(plain, { x: -150, z: 0 }, { x: 153, z: 2 }, { useRoleDetour }));
  assert.deepEqual(route.at(-1), [153, 2], 'default exact open endpoint unchanged');
}

// Strict preference is explicit: dry/ice/ford mask zero stays open, including
// soft dry ground; any positive liquid coverage is excluded only for opt-in.
const drySoft = dryGrid({ getGroundType: () => 'soft' });
assert.equal(drySoft.blocked[index(0, 0)], 0);
const wetHard = dryGrid({ getGroundType: () => 'hard',
  getWaterMaskAt: (x, z) => x === 0 && z === 0 ? 1e-12 : 0 });
assert.equal(wetHard.blocked[index(0, 0)], 1, 'fractional shore coverage is still liquid');
const dryFord = dryGrid({ getGroundType: () => 'soft',
  getWaterMaskAt: (_x, z) => Math.abs(z) < 8 ? 0 : 1 });
const fordRoute = plan(dryFord, { x: -100, z: 0 }, { x: 100, z: 0 });
assert.deepEqual(fordRoute.at(-1), [100, 0]);
assertGridSegments(fordRoute, dryFord);
assert.throws(() => dryGrid({ getWaterMaskAt: undefined }), /requires getWaterMaskAt/);
assert.throws(() => dryGrid({ getWaterMaskAt: () => NaN }), /finite/);

// Terrain API passes the policy through but continues distinguishing liquid
// from ice. These fixtures use the existing terrainFastGrid liquid-core sites.
const waterConfig = {
  navigationWaterPolicy: 'avoid-liquid',
  terrain: { softLakes: true,
    lakes: [{ x: 80, z: 30, r: 42, level: -2 }],
    marshes: [{ x: -70, z: -20, r: 36, dip: 1.1 }] },
  splat: { seaLake: true },
};
const liquid = createHeightField(1337, waterConfig);
const frozen = createHeightField(1337, {
  ...waterConfig, terrain: { ...waterConfig.terrain, frozenMarshes: true },
});
assert.equal(liquid.navigationWaterPolicy, 'avoid-liquid');
assert.ok(liquid.getWaterMaskAt(80, 30) > 0.95);
assert.equal(frozen.getWaterMaskAt(80, 30), 0);
assert.equal(frozen.getWaterMaskAt(-70, -20), 0);
const frozenGrid = createBotNavigationGrid({ heightField: frozen });
assert.equal(frozenGrid.blocked.reduce((a, b) => a + b, 0), 0, 'ice adds no liquid-blocked cells');
for (const id of MAP_IDS) {
  assert.equal(getMapConfig(id).navigationWaterPolicy,
    id === 'reservoir' ? 'avoid-liquid' : undefined, 'only Reservoir opts in: ' + id);
}

// Dry nodes can straddle liquid. Cache both cardinal and diagonal sampled
// edge restrictions, so routes cannot cross the visible strip at a midpoint.
const stripMask = x => x > 11 && x < 14 ? 1 : 0;
const strip = dryGrid({ getWaterMaskAt: stripMask });
assert.equal(strip.blocked[index(0, 0)], 0);
assert.equal(strip.blocked[index(25, 0)], 0);
assert.ok(strip.waterBlockedEdges[index(0, 0)] & (1 << 1));
assert.ok(strip.waterBlockedEdges[index(25, 0)] & (1 << 0));
assert.ok(strip.waterBlockedEdges[index(0, 0)] & (1 << 7));
const stripRoute = plan(strip, { x: 0, z: 0 }, { x: 25, z: 0 });
assert.deepEqual(stripRoute, [[0, 0]], 'unreachable open goal keeps reachable singleton');
const fractionalWetGoal = plan(strip, { x: -50, z: 0 }, { x: 12.4, z: 0 });
assert.deepEqual(fractionalWetGoal.at(-1), [0, 0], 'off-grid wet goal is not restored');
assertGridSegments(fractionalWetGoal, strip);

// Known negative controls: a sub-sample strip and exact off-grid ingress are
// NOT certified by the cache. Keep these honest limits visible in the suite.
const tinyStrip = dryGrid({ getWaterMaskAt: x => x > 10.1 && x < 10.2 ? 1 : 0 });
assert.equal(tinyStrip.waterBlockedEdges[index(0, 0)] & (1 << 1), 0,
  'sub-step strip demonstrates finite sampling limit, not continuous safety');
assert.equal(stripMask(12.4), 1);
assert.deepEqual(plan(strip, { x: 12.4, z: 0 }, { x: -50, z: 0 })[0], [0, 0],
  'snapped ingress is retained; exact wet ingress still requires deployment proof');

// The nearest dry island is disconnected. Search the reachable component,
// including banks beyond nearestOpen's legacy seven-cell radius.
const island = dryGrid({ getWaterMaskAt: (x, z) =>
  x <= -250 || (Math.abs(x) < 4 && Math.abs(z) < 4) ? 0 : 1 });
const islandRoute = plan(island, { x: -300, z: 0 }, { x: 25, z: 0 });
assert.deepEqual(islandRoute.at(-1), [-250, 0]);
assertGridSegments(islandRoute, island);
assert.deepEqual(plan(dryGrid({ getWaterMaskAt: () => 1 }),
  { x: 0, z: 0 }, { x: 100, z: 0 }), []);
assert.deepEqual(plan(drySoft, { x: 501, z: 0 }, { x: 0, z: 0 }), []);
assert.deepEqual(plan(drySoft, { x: 500, z: 0 }, { x: 700, z: 0 }), [[500, 0]],
  'out-of-grid goal projects to reachable grid boundary, never unsafe requested goal');

// Vehicle-specific directed reachability: the nearest dry lip is too steep
// uphill for the low-powered tank, but that tank can descend with enough grip.
const lip = dryGrid({
  getHeightAt: x => x >= 0 ? 18 : 0,
  getWaterMaskAt: x => x > 0 ? 1 : 0,
});
const weak = { ...spec, enginePowerHp: 180 };
const strong = { ...spec, enginePowerHp: 950 };
assert.deepEqual(plan(lip, { x: -75, z: 0 }, { x: 12, z: 0 }, { spec: weak }).at(-1), [-25, 0]);
assert.deepEqual(plan(lip, { x: -75, z: 0 }, { x: 12, z: 0 }, { spec: strong }).at(-1), [0, 0]);
assert.deepEqual(plan(lip, { x: 0, z: 0 }, { x: -75, z: 0 }, { spec: weak }).at(-1), [-75, 0]);

// Diagonal corner rules remain authoritative even if the diagonal water
// samples themselves are clear.
const pinch = dryGrid({ getWaterMaskAt: (x, z) =>
  (Math.hypot(x - 25, z) < 2 || Math.hypot(x, z - 25) < 2) ? 1 : 0 });
const pinchRoute = plan(pinch, { x: 0, z: 0 }, { x: 25, z: 25 });
assert.deepEqual(pinchRoute.at(-1), [25, 25]);
assert.ok(pinchRoute.length > 2, 'cannot take a direct diagonally pinched edge');
assertGridSegments(pinchRoute, pinch);

// Role vias may project; joined route edges and final effective goal must
// remain coherent for all roles. Planning only consumes cached arrays.
for (const role of ['scout', 'flanker', 'sniper', 'brawler']) {
  let waterCalls = 0;
  const grid = dryGrid({ getWaterMaskAt: (x, z) => {
    waterCalls++; return Math.abs(x) < 65 && Math.abs(z) < 100 ? 1 : 0;
  } });
  const before = waterCalls;
  const start = { x: -150, z: 0 }, goal = { x: 150, z: 0 };
  const direct = plan(grid, start, goal);
  const routed = plan(grid, start, goal, { role, useRoleDetour: true });
  assert.deepEqual(routed.at(-1), direct.at(-1));
  assertGridSegments(routed, grid);
  if (role === 'brawler') {
    // Fixed RNG 0.5 requests via (6,-45), inside this pond. Its nearest
    // reachable bank node is (0,-100); simplification may coalesce that
    // collinear station, so check the retained segment chain, not only points.
    assert.ok(Math.abs(6) < 65 && Math.abs(-45) < 100);
    assert.ok(routed.some(([x, z], n) => {
      if (x === 0 && z === -100) return true;
      const next = routed[n + 1];
      if (!next) return false;
      const [nx, nz] = next;
      return (nx - x) * (-100 - z) === (nz - z) * -x
        && Math.min(x, nx) <= 0 && Math.max(x, nx) >= 0
        && Math.min(z, nz) <= -100 && Math.max(z, nz) >= -100;
    }), 'the wet role via is projected into the retained dry chain');
  }
  assert.equal(waterCalls, before, 'no terrain/policy query during route search');
}
console.log('botNavigationWater.selftest: explicit sampled dry-route policy passed');

