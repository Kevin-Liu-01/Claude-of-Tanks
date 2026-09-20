import assert from 'node:assert/strict';
import * as THREE from 'three';
import { interiorFillBoundaryTriangles } from './interior-fill-body-policy.mjs';
import { collectTriangles } from './tank-surface-collect.mjs';
import { voxelise, floodExterior, deepInterior } from './tank-voxel-body.mjs';
import { createTank } from '../src/vehicles/tankFactory.ts';

const id = 'bmp3m_dragun125_x';
const configuredIds = [id, 'merkava4_trophy', 'merkava4_barak', 'namer_ifv'];
const names = ['hull', 'hullDetail', 'hullDark', 'turret', 'turretDetail', 'gun',
  'gunDark', 'gunMount', 'gunMountDark', 'muzzleBoreShadowFallbackDisc', 'track'];
const triangles = names.map((name, mesh) => ({ mesh, identity: name }));
const selected = interiorFillBoundaryTriangles(id, triangles, names);
assert.deepEqual(selected.map(row => row.identity), names.filter(name =>
  !['hullDetail', 'hullDark', 'turretDetail'].includes(name)));
assert.ok(selected.every(row => triangles.includes(row)), 'retain original triangle references and order');
assert.equal(triangles.length, names.length, 'selection never mutates input');
for (const legacy of ['abrams', 'challenger_3', 'cv90105_tml_x', 'object695_x_extra', 'constructor', '__proto__']) {
  assert.equal(interiorFillBoundaryTriangles(legacy, triangles, names), triangles,
    'unconfigured families retain their exact historical boundary input');
}
for (const configuredId of configuredIds) {
  assert.deepEqual(interiorFillBoundaryTriangles(configuredId, triangles, names).map(row => row.identity),
    selected.map(row => row.identity), `${configuredId}: only primary hull/turret and moving gun stock bound fill`);
  for (const missing of ['hull', 'turret']) {
    assert.throws(() => interiorFillBoundaryTriangles(configuredId,
      triangles.filter(row => names[row.mesh] !== missing), names), /missing authored fill boundary/);
  }
}

const launcherId = 'object695_x';
const launcherBuckets = new Set(['gunMount', 'gunMountDark']);
const launcherSelected = interiorFillBoundaryTriangles(launcherId, triangles, names);
const launcherExpected = triangles.filter(row => !launcherBuckets.has(names[row.mesh]));
assert.deepEqual(launcherSelected, launcherExpected,
  'only the two actual exterior launcher buckets leave the generation boundary');
assert.ok(launcherSelected.every((row, index) => row === launcherExpected[index]), 'launcher selection keeps original triangle identity and order');
assert.equal(triangles.length, names.length, 'launcher selection never mutates input');
for (const missing of launcherBuckets) {
  assert.throws(() => interiorFillBoundaryTriangles(launcherId,
    triangles.filter(row => names[row.mesh] !== missing), names), /missing authored fill boundary/,
  'missing real launcher stock must not silently broaden the policy');
}

function leaks(tris, meshes, voxel = .025) {
  const grid = voxelise(tris, meshes, { voxel });
  const exterior = floodExterior(grid), deep = deepInterior(grid);
  let count = 0;
  for (let i = 0; i < exterior.length; i++) if (exterior[i] && deep[i]) count++;
  return { count, bodyTriangles: grid.bodyTris };
}

// The selection still exposes a real broken primary shell to flood/repair.
// Remove a central patch, not the whole wall (which would not bound an interior).
const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2, 4, 4, 4), new THREE.MeshBasicMaterial());
cube.name = 'hull';
const collected = collectTriangles(cube);
const broken = collected.tris.filter(t => !(t.az === 1 && t.bz === 1 && t.cz === 1
  && Math.abs((t.ax + t.bx + t.cx) / 3) < .5 && Math.abs((t.ay + t.by + t.cy) / 3) < .5));
// An unrelated turret triangle supplies the required owner; it cannot close the hole.
const isolated = { ...collected.tris[0], ax: 4, bx: 4, cx: 4, mesh: 1 };
for (const configuredId of configuredIds) {
  const brokenSelected = interiorFillBoundaryTriangles(configuredId, [...broken, isolated], ['hull', 'turret']);
  assert.equal(brokenSelected.length, broken.length + 1);
  assert.ok(leaks(brokenSelected, ['hull', 'turret'], .1).count > 0,
    `${configuredId}: a deleted primary plate still produces real deep-interior leakage`);
}
const brokenLauncher = [...broken, { ...isolated, mesh: 1 }, { ...isolated, mesh: 2 }];
const launcherNames = ['hull', 'gunMount', 'gunMountDark'];
const brokenLauncherSelected = interiorFillBoundaryTriangles(launcherId, brokenLauncher, launcherNames);
assert.deepEqual(brokenLauncherSelected, broken,
  'a deleted primary plate remains in scope even beside independent launcher fittings');
assert.ok(leaks(brokenLauncherSelected, launcherNames, .1).count > 0,
  'the launcher policy cannot hide real body-shell leakage');
cube.geometry.dispose(); cube.material.dispose();

const results = [];
for (const configuredId of configuredIds) for (const quality of ['high', 'low']) {
  const tank = createTank(configuredId, null, { proceduralOnly: true, quality });
  try {
    const { tris, meshes } = collectTriangles(tank.root);
    const boundary = interiorFillBoundaryTriangles(configuredId, tris, meshes);
    const withFittings = leaks(tris, meshes), primary = leaks(boundary, meshes);
    assert.ok(withFittings.count > 0, 'the former broad family span invents exterior cage/optic pockets');
    if (configuredId === id) assert.equal(primary.count, 0,
      'BMP actual authored primary bodies are closed at generator resolution');
    const gun = rows => rows.filter(row => /^(gun|mantlet|muzzle)/i.test(meshes[row.mesh]));
    assert.deepEqual(gun(boundary), gun(tris), 'complete physical bore/mount stock remains in the body input');
    results.push({ id: configuredId, quality, exteriorPocketVoxels: withFittings.count, primaryLeakVoxels: primary.count,
      originalBodyTriangles: withFittings.bodyTriangles, primaryBodyTriangles: primary.bodyTriangles });
  } finally { tank.dispose(); }
}
for (const quality of ['high', 'low']) {
  const tank = createTank(launcherId, null, { proceduralOnly: true, quality, geometryReceipt: true });
  try {
    const { tris, meshes } = collectTriangles(tank.root);
    const boundary = interiorFillBoundaryTriangles(launcherId, tris, meshes);
    const expected = tris.filter(row => !launcherBuckets.has(meshes[row.mesh]));
    assert.equal(boundary.length, expected.length);
    assert.ok(boundary.every((row, index) => row === expected[index]),
      'actual hull, turret, cannon, bore and every other owner remain exact');
    for (const bucket of launcherBuckets) assert.ok(tris.some(row => meshes[row.mesh] === bucket));
    for (const bucket of ['hull', 'turret', 'gun', 'gunDark']) {
      assert.ok(boundary.some(row => meshes[row.mesh] === bucket), `${bucket}: real body/bore boundary retained`);
    }
    const withFittings = leaks(tris, meshes), body = leaks(boundary, meshes);
    assert.ok(withFittings.count > body.count,
      'separate closed canisters must not create one fill volume across their exterior air');
    results.push({ id: launcherId, quality, exteriorPocketVoxels: withFittings.count,
      primaryLeakVoxels: body.count, originalBodyTriangles: withFittings.bodyTriangles,
      primaryBodyTriangles: body.bodyTriangles });
  } finally { tank.dispose(); }
}
console.log('interior-fill-body-policy PASS', JSON.stringify(results));
