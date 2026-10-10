import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as THREE from 'three';
import { collectTriangles } from './tank-surface-collect.mjs';
import { CLEARANCE_AIR_FILE, declaredClearanceMask, declaredClearanceRecord, encodeSpans, movingClearancePocket,
  movingClearanceSpans, writeDeclaredClearance } from './moving-clearance-air.mjs';
import { measureWatertight, movingClearanceAir, watertightBody } from './tank-watertight-measure.mjs';
import { trackLaneBoxesForVoxel } from './track-lane-boxes.mjs';
import { physicalBoreAir } from './physical-bore-air.mjs';
import { voxelise } from './tank-voxel-body.mjs';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { ensureInteriorFills } from '../src/vehicles/interiorFills.ts';
import { M1A1_GUN_PITCH_BY_YAW } from '../src/vehicles/m1a1GunLimits.ts';

// Moving-part clearance air (2026-10-06, tools/moving-clearance-air.mjs). Pins: (1) the generator, the shared
// measurement, the CLI and the fleet gate read the one rule, and the M1A1 clearance decides gun ownership by object,
// not by mesh name; (2) on a synthetic turret a pocket under a gun mount's lip (the M1A1 slot's shape) is reported as
// moving-clearance air and conserved against the plain measurement, while a holed turret wall still leaks and a roof
// hole under the gun still leaks the turret interior around its own column; (3) a declared record exempts exactly its
// cells on a matching lattice and nothing on a moved one; (4) the shipped M1A2 slot (3.56 L) and the M1A1 HA's
// declared clearance read as moving-clearance air with 0 L of leak, and both still leak without the policy; every
// legacy M1A1 mount carries a current declared record.
const read = (path) => readFileSync(path, 'utf8');

// (1) wiring
const generator = read('tools/gen-interior-fills.mjs');
assert.match(generator, /^import \{ CLEARANCE_AIR_FILE, encodeSpans, insideSpan, movingClearanceSpans, underMovingPart, writeDeclaredClearance \} from '\.\/moving-clearance-air\.mjs';$/m,
  'the generator imports the shared rule');
assert.doesNotMatch(generator, /function (turretProperSpans|movingSpans|underMovingPart|insideTurretProper)\b|const MOVING = /,
  'the generator keeps no private copy of the pocket rule');
assert.match(generator, /writeDeclaredClearance\(clearanceAir, clearanceFile\)/, 'the generator records the cells its clearance cut');
assert.match(read('tools/tank-watertight-measure.mjs'), /^import \{ declaredClearanceMask, movingClearancePocket, movingClearanceSpans \} from '\.\/moving-clearance-air\.mjs';$/m,
  'the shared measurement reads the rule');
assert.match(read('tools/tank-watertight-check.mjs'), /movingOn \? movingClearanceAir\(/, 'the CLI passes the moving-clearance air');
assert.match(read('src/vehicles/watertightAudit.test-support.mjs'), /movingAir: movingClearanceAir\(id\)/, 'the fleet gate passes it');
const clearance = read('tools/m1a1-fill-clearance.mjs');
assert.doesNotMatch(clearance, /namesBelow|movingNames|recoilNames/, 'gun ownership is never decided by a repeated mesh name');
assert.match(clearance, /below\(object,gun\)\?moving:fixed/, 'gun ownership follows the scene graph');

// (2) synthetic turret: a closed turret box with cheek and rear walls on its roof, a gun mount roofing the bay and a
// lip in front of it. The bay behind the lip is enclosed in all six directions (the gun mount closes it from above) and
// reached through the slot under the lip: the pocket rule's case. The turret interior stays a closed body.
const VOXEL = 0.025;
const box = (name, [x0, y0, z0], [x1, y1, z1]) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0, 6, 4, 6), new THREE.MeshBasicMaterial());
  mesh.name = name; mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return mesh;
};
const turret = () => {
  const root = new THREE.Group();
  root.add(box('turret', [-.6, 0, -.6], [.6, .4, .6]));
  root.add(box('turretCheekL', [-.6, .4, -.6], [-.45, .7, .6]), box('turretCheekR', [.45, .4, -.6], [.6, .7, .6]));
  root.add(box('turretRear', [-.45, .4, -.6], [.45, .7, -.45]));
  root.add(box('gunMount', [-.45, .6, -.45], [.45, .7, .6]), box('gunMountLip', [-.45, .5, .55], [.45, .6, .6]));
  return root;
};
// drop the faces of `name` whose centroid lies within r of (x, y, z) on the side the normal axis points to
const punch = (name, [x, y, z], r) => ({ tris, meshes }) => ({ meshes, tris: tris.filter((t) => meshes[t.mesh] !== name
  || Math.hypot((t.ax + t.bx + t.cx) / 3 - x, (t.ay + t.by + t.cy) / 3 - y, (t.az + t.bz + t.cz) / 3 - z) > r) });
const measure = (root, edit = (c) => c, moving = true) => {
  const { tris, meshes } = edit(collectTriangles(root));
  return measureWatertight(tris, meshes, [], { movingAir: moving ? movingClearanceAir(null) : null });
};
const closed = measure(turret()), plain = measure(turret(), undefined, false);
assert.equal(closed.leakL, 0, `the pocket under the lip is moving-clearance air: ${closed.leakL} L`);
assert.ok(closed.movingClearanceL > 1.5, `the pocket is measured: ${closed.movingClearanceL} L`);
assert.ok(plain.leakL > 1.5 && plain.movingClearanceL === 0, `without the policy the pocket reads as a leak: ${plain.leakL} L`);
assert.ok(Math.abs(closed.movingClearanceL - plain.leakL) <= .02, 'moving-clearance air + leak is conserved against the plain leak');
const wall = measure(turret(), punch('turret', [-.6, .2, 0], .12)); // central -x wall quads
assert.ok(wall.leakL > 400, `a holed turret wall still leaks the turret interior: ${wall.leakL} L`);
const roof = measure(turret(), punch('turret', [0, .4, 0], .15)); // the four central 0.2 m roof quads
assert.ok(roof.leakL > 400, `a roof hole under the gun still leaks the turret interior around its own column: ${roof.leakL} L`);
{
  // the rule itself on the synthetic grid: a voxel in the bay is a pocket, one inside the turret body is not
  const { tris, meshes } = collectTriangles(turret()); const grid = voxelise(tris, meshes, { voxel: VOXEL });
  const spans = movingClearanceSpans(grid), at = (x, y, z) => [x, y, z].map((v, k) => Math.floor((v - grid.origin[k]) / VOXEL));
  assert.ok(movingClearancePocket(grid, spans, ...at(0, .55, .3)), 'the bay under the gun mount is a pocket');
  assert.ok(!movingClearancePocket(grid, spans, ...at(0, .2, 0)), 'the turret interior is not');
}

// (3) declared records: exact cells on a matching lattice, nothing (stale) on a moved one
{
  const dir = mkdtempSync(join(tmpdir(), 'cot-clearance-air-'));
  try {
    const file = join(dir, 'air.json');
    writeDeclaredClearance({ synthetic: { v: VOXEL, o: [1, 2, 3], voxels: 8, spans: encodeSpans([2, 2, 2, 3, 3, 3]) } }, file);
    const grid = { nx: 8, ny: 8, nz: 8, origin: [1 - 2 * VOXEL, 2, 3], voxel: VOXEL };
    const hit = declaredClearanceMask('synthetic', grid, file);
    assert.ok(hit && !hit.stale && hit.voxels === 8, 'a matching lattice applies the record');
    const cells = [], expected = []; hit.mask.forEach((v, i) => { if (v) cells.push(i); });
    for (const z of [2, 3]) for (const y of [2, 3]) for (const x of [4, 5]) expected.push((z * 8 + y) * 8 + x);
    assert.deepEqual(cells, expected, 'the cells shift by the whole-voxel origin offset (two voxels along x)');
    const moved = declaredClearanceMask('synthetic', { ...grid, origin: [1 - 2.5 * VOXEL, 2, 3] }, file);
    assert.ok(moved.stale && moved.mask.every((v) => v === 0), 'a moved lattice exempts nothing');
    assert.equal(declaredClearanceMask('other', grid, file), null, 'a tank without a record declares nothing');
    writeDeclaredClearance({ synthetic: null }, file);
    assert.equal(declaredClearanceRecord('synthetic', file), null, 'a regenerated tank without clearance drops its record');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// (4) shipped records
const ids = Object.keys(M1A1_GUN_PITCH_BY_YAW);
const recorded = Object.keys(JSON.parse(read(CLEARANCE_AIR_FILE)).tanks).sort();
assert.deepEqual(recorded, [...ids].sort(), 'every legacy M1A1 mount, and only those, declares its clearance cells');
await ensureInteriorFills(['m1a2', 'm1a1ha']);
const report = {};
for (const id of ['m1a2', 'm1a1ha']) {
  const tank = createTank(id, null, { proceduralOnly: true });
  try {
    const { tris, meshes } = collectTriangles(tank.root);
    const body = watertightBody(id, tris, meshes), lanes = trackLaneBoxesForVoxel(tank.root, VOXEL), boreAir = physicalBoreAir(tank.root);
    const policy = measureWatertight(body, meshes, lanes, { boreAir, movingAir: movingClearanceAir(id) });
    const bare = measureWatertight(body, meshes, lanes, { boreAir });
    assert.ok(!policy.clearanceStale, `${id}: the declared record matches the shipped lattice`);
    assert.equal(policy.leakL, 0, `${id}: no leak beyond its moving-clearance air`);
    assert.ok(bare.leakL > 3, `${id}: without the policy the same air leaks (${bare.leakL} L)`);
    assert.ok(Math.abs(policy.movingClearanceL - bare.leakL) <= .02, `${id}: moving-clearance air + leak is conserved`);
    report[id] = `${policy.movingClearanceL} L`;
  } finally { tank.dispose(); }
}
console.log(`moving-clearance-air.selftest: shared rule wired; synthetic slot ${closed.movingClearanceL} L reported apart, holed wall ${wall.leakL} L and roof ${roof.leakL} L still leak; declared cells exact or stale; m1a2 ${report.m1a2}, m1a1ha ${report.m1a1ha} of moving-clearance air with 0 L leak`);
