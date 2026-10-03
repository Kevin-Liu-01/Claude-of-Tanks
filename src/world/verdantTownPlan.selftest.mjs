// Verdant Fields' classic town plan (maps lane, 2026-10-03; the owner: "the old verdant town plan was better"). The
// layout-brief rebuild keeps its swells, barrows, hedgerow banks, pads and strongpoints, but the village stands as it did
// on main: every planned building on main's plot, the six village wall runs, no apron clearing the centre.
//
// The ruling is about the plan (where each house stands), not about a building's collision box, so this receipt holds
// the plots: it builds Verdant's props in Node and compares each planned building's plot (centre, orientation and size,
// through its four corners) with main's, so a later terrain, road or dressing change that re-seats the town fails here
// instead of in a screenshot. What stands on a plot may differ: the kolkhoz kit builds the region's version of each
// building inside it (src/world/maps/regional/regionalArchitecture.selftest.mjs holds it there). (Lane A's receipt
// compared the shard's structure boxes with main's; the regional-buildings lane moved it to the plots, 2026-10-03.)
import assert from 'node:assert/strict';
import { getMapConfig } from './maps/index.ts';

// main's nine planned buildings (origin/main 0cfc5f41a, its props built in Node): kind, plot centre x and z, plot width
// and depth, yaw. The same plots stood in main's verdant shard from 7353d5b48 to 1eb8375d6.
const MAIN_PLOTS = [
  ['farmhouse', 26.538, -34.171, 15.99, 9.0, 0.1924],
  ['barn', 28.236, -1.074, 8.364, 13.213, 0.062],
  ['tavern', 3.49, 1.272, 9.7, 14.9, 0.1043],
  ['chapel', 30.972, 31.479, 6.026, 8.207, 0.0781],
  ['cottage', 6.842, 32.524, 6.361, 8.425, 0.0564],
  ['ruin', 7.958, 96.306, 6.376, 8.74, -0.0091],
  ['granary', -30.508, 55.317, 4.177, 6.9, 1.473],
  ['schoolhouse', -33.876, 79.139, 9.1, 16.1, 1.4535],
  ['mill', 62.712, 90.159, 6.321, 6.321, 1.3946],
];
/** a plot corner may stand this far from main's */
const TOLERANCE = 0.1;
// The village wall runs of the classic plan (relative to the classic village rect), and main's stone count along them.
const VILLAGE_WALLS = [
  [-56, 8, -56, 64, 2], [-56, 8, -20, 8, 3], [74, 30, 74, 96, 4],
  [-8, 110, 52, 110, 2], [38, -34, 74, -34, 1], [-44, 108, -10, 108, 0],
];
const MAIN_VILLAGE_STONES = 74;
const VILLAGE_BOX = [-80, 100, -60, 140];

const config = getMapConfig('verdant');
assert.equal(config.terrain.roads, undefined, 'Verdant keeps the country road generator its frontage lots stand on');
const village = { x0: -60, x1: 80, z0: -40, z1: 120 };
for (const stand of config.terrain.hardstands ?? []) {
  const clear = stand.x + stand.width / 2 < village.x0 - 40 || stand.x - stand.width / 2 > village.x1 + 40
    || stand.z + stand.length / 2 < village.z0 - 40 || stand.z - stand.length / 2 > village.z1 + 40;
  assert.ok(clear, `no apron clears the town (one stands at ${stand.x}, ${stand.z})`);
}
for (const run of VILLAGE_WALLS) {
  assert.ok(config.props.wallRuns.some((own) => own.every((v, i) => v === run[i])), `the village wall run ${run} stands`);
}

// Verdant's props, built the way the collision capture builds them (seeds 1337, 2001, 2002)
const { installWorldBuildFixture } = await import('../../tools/headlessWorldCollision.mjs');
installWorldBuildFixture();
const [terrain, vegetation, props, fleet, models] = await Promise.all([
  import('./terrain.ts'), import('./vegetation.ts'), import('./props.ts'), import('../vehicles/fleetFactory.ts'), import('./propsModelStore.ts'),
]);
await models.preloadPropModels();
const wreckIds = config.props?.tankWrecks?.ids ?? [];
if (wreckIds.length) await fleet.ensureTankBuilders(wreckIds);
const engine = { anisotropy: 4, setupShadowMaterial() {} };
const field = terrain.createHeightField(1337, config);
const flora = vegetation.createVegetation(field, engine, 2001, config);
const dressing = props.createProps(field, engine, 2002, config, flora);

/** A plot's four corners in the world (the building's local frame turned by its yaw about Y). */
function corners(x, z, w, d, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
    const lx = sx * w / 2, lz = sz * d / 2;
    return [x + lx * c + lz * s, z - lx * s + lz * c];
  });
}
/** The town's worst plot corner against main's (Infinity when the planned buildings differ in number or kind). */
function planError(buildings) {
  if (buildings.length !== MAIN_PLOTS.length) return Infinity;
  let worst = 0;
  for (const [kind, x, z, w, d, rot] of MAIN_PLOTS) {
    const want = corners(x, z, w, d, rot);
    let best = Infinity;
    for (const b of buildings) {
      if (b.kind !== kind) continue;
      const got = corners(b.x, b.z, b.w, b.d, b.rot);
      best = Math.min(best, Math.max(...want.map(([wx, wz], i) => Math.hypot(got[i][0] - wx, got[i][1] - wz))));
    }
    worst = Math.max(worst, best);
  }
  return worst;
}
const planned = dressing.features.buildings.filter((b) => b.kind);
assert.equal(planned.length, MAIN_PLOTS.length, `the town has main's ${MAIN_PLOTS.length} planned buildings (${planned.length})`);
const worst = planError(planned);
assert.ok(worst <= TOLERANCE, `every planned building stands on main's plot (the worst plot corner is ${worst.toFixed(3)} m off)`);
// the negative control: the same town with one plot moved 1 m must fail
assert.ok(planError(planned.map((b, i) => (i === 0 ? { ...b, x: b.x + 1 } : b))) > TOLERANCE, 'a plot moved by 1 m fails the plan');

const [x0, x1, z0, z1] = VILLAGE_BOX;
const stones = (dressing.destructibles ?? []).filter((s) => s.kind === 'wallstone' && s.x >= x0 && s.x <= x1 && s.z >= z0 && s.z <= z1);
assert.equal(stones.length, MAIN_VILLAGE_STONES, `the village walls carry main's ${MAIN_VILLAGE_STONES} stones (${stones.length})`);
const segmentDistance = (px, pz, [ax, az, bx, bz]) => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
};
for (const s of stones) {
  assert.ok(VILLAGE_WALLS.some((run) => segmentDistance(s.x, s.z, run) < 4), `a stone at (${s.x.toFixed(1)}, ${s.z.toFixed(1)}) stands on a village wall run`);
}
console.log(`verdantTownPlan.selftest: ${planned.length} planned buildings on main's plots (worst corner ${worst.toFixed(3)} m), `
  + `${stones.length} village wall stones on the six runs, no apron in the town`);
