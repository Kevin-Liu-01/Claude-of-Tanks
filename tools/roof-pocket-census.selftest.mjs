import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { OWNER_RULES, POCKET_CLASSES, POCKET_MIN_AREA_M2, POCKET_MIN_DEPTH_M, RAISED_ROOF_Y, VOXEL_M, roofPockets } from './roof-pocket.mjs';

// Roof-pocket receipt (264, Main 2026-10-28: "Put the census --gate in a receipt that's shrink-only fleet-wide"; the
// owner on the Leclercs, 2026-10-27: "basically they create "roofs" that imply solid areas but have no side plating or
// anything under and it jus tlooks goofy"). docs/geometry-gate/roof-pockets.json holds one row per tank: the plan area of
// its seen pockets under the armour body's own undersides (tools/roof-pocket.mjs) in three classes (turret raised roofs,
// turret base overhangs, hull), bound to the tank's hull, turret and gun group digests in the fleet geometry ledger.
// tools/roof-pocket-census.mjs --update refuses a class that grew, so a row can only shrink unless a re-baseline is
// asked for by name. This receipt holds the whole fleet against the ledger without building a tank, re-measures two
// rows, and proves the detector on a plate laid over a slot.
const LEDGER = 'docs/geometry-gate/roof-pockets.json';
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
const fleet = JSON.parse(readFileSync('docs/references/fleet-geometry-ledger.json', 'utf8')).tanks;
const { ALL_TANK_IDS } = await import('../src/vehicles/specs.ts');
const refresh = (ids) => `node tools/roof-pocket-census.mjs --ledger=${LEDGER} --update --ids=${ids.join(',')}`;

// The measuring standard cannot quietly loosen.
const S = ledger.settings;
assert.ok(S.voxelM <= VOXEL_M && S.minAreaCm2 <= POCKET_MIN_AREA_M2 * 1e4 && S.minDepthCm <= POCKET_MIN_DEPTH_M * 100,
  `ledger standard ${JSON.stringify(S)}`);
assert.ok(S.raisedRoofY === RAISED_ROOF_Y && S.toleranceCm2 <= 40 && S.toleranceFrac <= 0.02, `ledger classes and tolerance ${JSON.stringify(S)}`);

const rows = ledger.tanks;
const missing = ALL_TANK_IDS.filter((id) => !rows[id]);
assert.deepEqual(missing, [], `every tank has a roof-pocket row: ${refresh(missing)}`);
assert.deepEqual(Object.keys(rows).filter((id) => !ALL_TANK_IDS.includes(id)), [], 'no row for a retired id');
const stale = ALL_TANK_IDS.filter((id) => {
  const groups = fleet[id]?.high?.groups, held = rows[id].geometry ?? {};
  return !groups || ['hull', 'turret', 'gun'].some((g) => held[g] !== groups[g]);
});
assert.deepEqual(stale, [], `hull, turret or gun geometry moved since these rows were measured; re-measure them (shrink-only): ${refresh(stale)}`);
for (const id of ALL_TANK_IDS) for (const k of POCKET_CLASSES) assert.ok(Number.isInteger(rows[id][k]) && rows[id][k] >= 0, `${id}: ${k} ${rows[id][k]}`);
const total = (k) => ALL_TANK_IDS.reduce((t, id) => t + rows[id][k], 0);

// Two rows re-measured: the Leclerc S2 (its false roofs closed in 263) and a tank with no pocket at all.
const run = (...args) => spawnSync(process.execPath, ['--max-old-space-size=4096', 'tools/roof-pocket-census.mjs', ...args], { encoding: 'utf8', timeout: 900000 });
const clean = ALL_TANK_IDS.find((id) => POCKET_CLASSES.every((k) => rows[id][k] === 0));
assert.ok(clean, 'some tank reads no pocket');
const live = run(`--ledger=${LEDGER}`, '--check', `--ids=leclerc_s2,${clean}`);
assert.equal(live.status, 0, `re-measured rows match the ledger (exit ${live.status})\n${live.stdout}\n${live.stderr}`);

// Negative control: two blocks 13 cm apart under a 4 cm plate (the Leclerc's old riser over its slot) is a pocket; the
// same plate on a solid block is not.
const boxTris = (out, x0, y0, z0, x1, y1, z1) => {
  const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  for (const [a, b, c, d] of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]]) out.push(...P[a], ...P[b], ...P[c], ...P[a], ...P[c], ...P[d]);
};
const slot = [], solid = [];
for (const out of [slot, solid]) {
  boxTris(out, 0, 0, -0.30, 0.6, 0.40, 0);
  boxTris(out, 0, 0, 0.13, 0.6, 0.40, 0.43);
  boxTris(out, 0, -0.08, -0.30, 0.6, 0, 0.43);
  boxTris(out, 0, 0.40, -0.05, 0.6, 0.44, 0.18);
}
boxTris(solid, 0, 0, 0, 0.6, 0.40, 0.13);
const caught = roofPockets(Float64Array.from(slot), OWNER_RULES.turret), closed = roofPockets(Float64Array.from(solid), OWNER_RULES.turret);
assert.ok(caught.some((p) => p.box[2] >= -0.02 && p.box[5] <= 0.15 && p.areaM2 > 0.004), `a plate over a slot reads as a pocket (${JSON.stringify(caught.map((p) => p.box))})`);
assert.equal(closed.length, 0, `the slot filled reads no pocket (${JSON.stringify(closed.map((p) => p.box))})`);

console.log(`roof-pocket-census.selftest: ${ALL_TANK_IDS.length} rows current (turret raised ${total('turretRaisedCm2')} cm2, `
  + `turret base ${total('turretBaseCm2')} cm2, hull ${total('hullCm2')} cm2 fleet-wide, shrink-only); leclerc_s2 and ${clean} `
  + 're-measured; the plate over a slot caught, the filled slot clear PASS');
