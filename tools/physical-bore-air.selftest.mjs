import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { collectTriangles } from './tank-surface-collect.mjs';
import { boreAirVoxelMask, insideBoreAir, physicalBoreAir } from './physical-bore-air.mjs';
import { WATERTIGHT_VOXEL, measureWatertight, watertightBody } from './tank-watertight-measure.mjs';
import { trackLaneBoxesForVoxel } from './track-lane-boxes.mjs';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { applyInteriorFills } from '../src/vehicles/interiorFills.ts';
import { verifyPhysicalMuzzleBore } from '../src/vehicles/physicalMuzzleBore.ts';
import { VEHICLE_SIZE_FACTORS } from '../src/vehicles/vehicleSizePolicy.ts';

// Declared physical bore air (2026-10-03, tools/physical-bore-air.mjs): a profile's verified open muzzle recess is never
// body interior. Pins: (1) the generator, the shared measurement, the CLI, the fleet gate and the fill-policy receipt
// all read the one rule; (2) the factory records the declared bore it verified, at the owner's installed size;
// (3) the grid mask agrees with the point test voxel for voxel, covers the whole recess and reaches no further than
// half a voxel diagonal; (4) the BMP-3M Dragun's six-voxel 125 mm bore column (0.9 size) is reported as bore air and
// conserved against the plain measurement; (5) a real hull hole beside it is still a leak; (6) the generator leaves
// the bore open, its record passes the build's own bore check, and main's former capping record (245aa4e4e, one
// gun-frame column over the same six voxels) still fails that check, with every one of its voxels inside the rule.
const id = 'bmp3m_dragun125_x', VOXEL = WATERTIGHT_VOXEL;

// (1) wiring
const read = (path) => readFileSync(path, 'utf8');
const generator = read('tools/gen-interior-fills.mjs');
assert.match(generator, /^import \{ insideBoreAir, physicalBoreAir \} from '\.\/physical-bore-air\.mjs';$/m, 'the generator imports the shared rule');
assert.match(generator, /const boreAir = physicalBoreAir\(tank\.root\);/, 'the generator reads the built tank\'s declared bore');
assert.match(generator, /if \(insideBoreAir\(boreAir, grid, x, y, z\)\) \{ if \(first\) boreVox\+\+; continue; \}/, 'the generator never claims bore air');
assert.match(read('tools/tank-watertight-measure.mjs'), /^import \{ boreAirVoxelMask \} from '\.\/physical-bore-air\.mjs';$/m, 'the shared measurement masks bore air');
assert.match(read('tools/tank-watertight-check.mjs'), /physicalBoreAir\(tank\.root\)/, 'the CLI passes the declared bore');
assert.match(read('src/vehicles/watertightAudit.test-support.mjs'), /const boreAir = physicalBoreAir\(root\);/, 'the fleet gate passes the declared bore');
assert.match(read('tools/interior-fill-body-policy.selftest.mjs'), /insideBoreAir\(boreAir, grid, x, y, z\)/, 'the fill-policy receipt counts bore air apart');

const build = (quality) => createTank(id, null, { proceduralOnly: true, quality });
const factor = VEHICLE_SIZE_FACTORS[id];
assert.equal(factor, .90, 'the Dragun carries the owner\'s 0.9 size');
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

let report = {};
for (const quality of ['high', 'low']) {
  const tank = build(quality);
  try {
    // (2) the factory's record of the bore it verified (barrel(): 0.0625 m bore, openGunTube's 0.20 m recess)
    const declared = tank.root.userData.physicalMuzzleBore, bore = physicalBoreAir(tank.root);
    assert.ok(declared && bore, `${quality}: the verified recess is recorded`);
    assert.equal(declared.frame, 'rig_recoil', 'recorded in the recoil frame that carries the bore');
    near(bore.innerRadiusM, .0625 * factor, 1e-9, `${quality}: bore radius at the installed size`);
    near(bore.depthM, .20 * factor, 1e-9, `${quality}: recess depth at the installed size`);
    near(tank.root.userData.physicalMuzzleBoreVerification.minimumDepthM, bore.depthM, .005, `${quality}: the build measured that recess`);

    // (3) mask == point test, on an odd voxel so cylinder faces fall between centres; coverage and reach
    const reach = .03 * Math.sqrt(3) / 2, local = new THREE.Vector3();
    const grid = { origin: [-.31, 1.71, 3.71], voxel: .03, nx: 21, ny: 21, nz: 40 };
    const mask = boreAirVoxelMask(bore, grid);
    let mismatches = 0, masked = 0, insideCylinder = 0;
    for (let z = 0; z < grid.nz; z++) for (let y = 0; y < grid.ny; y++) for (let x = 0; x < grid.nx; x++) {
      const i = (z * grid.ny + y) * grid.nx + x, expect = insideBoreAir(bore, grid, x, y, z) ? 1 : 0;
      if (mask[i] !== expect) mismatches++;
      local.set(grid.origin[0] + (x + .5) * grid.voxel, grid.origin[1] + (y + .5) * grid.voxel, grid.origin[2] + (z + .5) * grid.voxel)
        .applyMatrix4(bore.worldToBore);
      const radial = Math.hypot(local.x, local.y), axial = local.z;
      if (radial < bore.innerRadiusM && axial > bore.muzzleZ - bore.depthM && axial < bore.muzzleZ) {
        insideCylinder++; assert.equal(mask[i], 1, `${quality}: a voxel centred in the recess is bore air`);
      }
      if (mask[i]) {
        masked++;
        assert.ok(radial < bore.innerRadiusM + reach && axial > bore.muzzleZ - bore.depthM - reach && axial < bore.muzzleZ + reach,
          `${quality}: bore air reaches no further than half a voxel diagonal`);
      }
    }
    assert.equal(mismatches, 0, `${quality}: boreAirVoxelMask disagrees with insideBoreAir on ${mismatches} voxels`);
    assert.ok(insideCylinder > 0 && masked > insideCylinder, `${quality}: the grid crosses the recess (${insideCylinder} centred, ${masked} masked)`);

    // (4) the shipped body: bore air apart, conserved against the plain measurement
    const { tris, meshes } = collectTriangles(tank.root);
    const body = watertightBody(id, tris, meshes), lanes = trackLaneBoxesForVoxel(tank.root, VOXEL);
    const withBore = measureWatertight(body, meshes, lanes, { boreAir: bore });
    const plain = measureWatertight(body, meshes, lanes);
    assert.equal(withBore.watertight, true, `${quality}: the Dragun holds water (${withBore.leakL} L)`);
    assert.ok(Math.abs(withBore.leakL + withBore.boreAirL - plain.leakL) <= .02,
      `${quality}: leak ${withBore.leakL} + bore air ${withBore.boreAirL} = plain leak ${plain.leakL}`);
    assert.equal(plain.boreAirL, 0, 'the plain measurement reports no bore air');

    // (5) a real hole in the hull deck, far from the bore, is still a leak and leaves the bore air unchanged
    const hull = meshes.indexOf('hull');
    const holed = body.filter((t) => !(t.mesh === hull && Math.min(t.ay, t.by, t.cy) > 1.5
      && Math.abs((t.ax + t.bx + t.cx) / 3) < .5 && (t.az + t.bz + t.cz) / 3 < -2 && (t.az + t.bz + t.cz) / 3 > -3.2));
    assert.ok(holed.length < body.length, `${quality}: the seeded hole removes deck stock`);
    const hole = measureWatertight(holed, meshes, lanes, { boreAir: bore });
    assert.ok(hole.leakL > 1 && !hole.watertight, `${quality}: a deck hole beside declared bore air leaks (${hole.leakL} L)`);
    assert.equal(hole.boreAirL, withBore.boreAirL, `${quality}: the hole does not change the bore air`);
    report[quality] = { boreAirL: withBore.boreAirL, plainLeakL: plain.leakL, holeLeakL: hole.leakL, maskedVoxels: masked };
  } finally { tank.dispose(); }
}
assert.ok(report.high.boreAirL > 0, `HIGH: the 0.9 bore column is the bore air reported apart (${report.high.boreAirL} L)`);

// (6) the generator leaves the bore open, and the build's own bore check passes its record and fails main's capping one
const capping = { v: .025, o: [-1.605, .3966, -3.5994], t: [0, 1.8, -1.08], g: [0, 2.03265, .387], gun: 'PgBBAEIBPgBBAEcB' };
const tmp = mkdtempSync(join(tmpdir(), 'physical-bore-air-'));
try {
  const run = spawnSync(process.execPath, ['tools/gen-interior-fills.mjs', `--ids=${id}`, '--rounds=8', '--min-fine=1',
    `--out-dir=${join(tmp, 'groups')}`, `--loader=${join(tmp, 'loader.ts')}`], { encoding: 'utf8' });
  assert.equal(run.status, 0, `generator: exit ${run.status}\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, new RegExp(`^${id}: .*declared bore air left open [\\d.]+ L`, 'm'), 'the generator reports the bore air it left open');
  const generated = (await import(pathToFileURL(join(tmp, 'groups', 'bmp3mDragun125X.generated.ts')).href)).INTERIOR_FILLS[id];
  assert.ok(generated, 'the generator wrote the Dragun record');
  const tank = build('high');
  try {
    const bore = physicalBoreAir(tank.root), declared = tank.root.userData.physicalMuzzleBore;
    const voxels = (record) => {
      const rows = [];
      for (const component of ['hull', 'turret', 'gun']) {
        if (!record[component]) continue;
        const binary = Buffer.from(record[component], 'base64'), spans = new Uint16Array(binary.buffer, binary.byteOffset, binary.byteLength / 2);
        const grid = { origin: record.o, voxel: record.v };
        for (let i = 0; i + 5 < spans.length; i += 6) for (let z = spans[i + 2]; z <= spans[i + 5]; z++)
          for (let y = spans[i + 1]; y <= spans[i + 4]; y++) for (let x = spans[i]; x <= spans[i + 3]; x++) rows.push(insideBoreAir(bore, grid, x, y, z));
      }
      return rows;
    };
    assert.ok(voxels(generated).every((touches) => !touches), 'no generated fill voxel touches the declared bore');
    const formerCap = voxels(capping);
    assert.ok(formerCap.length === 6 && formerCap.every(Boolean), 'every voxel of the former capping column lies inside the rule');
    const gunG = tank.root.getObjectByName('rig_gun'), hullG = tank.root.getObjectByName('rig_hull'), turretG = tank.root.getObjectByName('rig_turret');
    const verifyWith = (record) => {
      const before = new Map([hullG, turretG, gunG].map((rig) => [rig, [...rig.children]])), disposables = [];
      applyInteriorFills({ specId: id, hullG, turretG, gunG, material: new THREE.MeshBasicMaterial(), disposables, record });
      try { return verifyPhysicalMuzzleBore(gunG, declared.muzzleZ, declared); }
      finally {
        for (const [rig, children] of before) for (const child of [...rig.children]) if (!children.includes(child)) rig.remove(child);
        for (const resource of disposables) resource.dispose();
      }
    };
    assert.ok(verifyWith(generated).minimumDepthM > .17, 'the regenerated record leaves the verified recess open');
    assert.throws(() => verifyWith(capping), /Physical muzzle aperture is capped/, 'the former gun-frame column still caps the bore');
  } finally { tank.dispose(); }
} finally { rmSync(tmp, { recursive: true, force: true }); }

// a tank without a declared bore has no bore air
const plainTank = createTank('m1a2', null, { proceduralOnly: true });
try { assert.equal(physicalBoreAir(plainTank.root), null, 'no declaration, no bore air'); } finally { plainTank.dispose(); }
console.log(`physical-bore-air.selftest: shared wiring, installed-size record, mask == point test, Dragun bore air ${report.high.boreAirL} L reported apart `
  + `(plain leak ${report.high.plainLeakL} L), a deck hole still leaks ${report.high.holeLeakL} L, the generator leaves the bore open and the former cap still fails PASS`);
