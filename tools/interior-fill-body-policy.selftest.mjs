import assert from 'node:assert/strict';
import * as THREE from 'three';
import { interiorFillBoundaryTriangles } from './interior-fill-body-policy.mjs';
import { collectTriangles } from './tank-surface-collect.mjs';
import { voxelise, floodExterior, deepInterior } from './tank-voxel-body.mjs';
import { createTank } from '../src/vehicles/tankFactory.ts';

const id = 'bmp3m_dragun125_x';
const names = ['hull', 'hullDetail', 'hullDark', 'turret', 'turretDetail', 'gun',
  'gunDark', 'gunMount', 'gunMountDark', 'muzzleBoreShadowFallbackDisc', 'track'];
const triangles = names.map((name, mesh) => ({ mesh, identity: name }));
const selected = interiorFillBoundaryTriangles(id, triangles, names);
assert.deepEqual(selected.map(row => row.identity), names.filter(name =>
  !['hullDetail', 'hullDark', 'turretDetail'].includes(name)));
assert.ok(selected.every(row => triangles.includes(row)), 'retain original triangle references and order');
assert.equal(triangles.length, names.length, 'selection never mutates input');
for (const legacy of ['abrams', 'challenger_3', 'cv90105_tml_x', 'constructor', '__proto__']) {
  assert.equal(interiorFillBoundaryTriangles(legacy, triangles, names), triangles,
    'unconfigured families retain their exact historical boundary input');
}
for (const missing of ['hull', 'turret']) {
  assert.throws(() => interiorFillBoundaryTriangles(id,
    triangles.filter(row => names[row.mesh] !== missing), names), /missing authored fill boundary/);
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
const brokenSelected = interiorFillBoundaryTriangles(id, [...broken, isolated], ['hull', 'turret']);
assert.equal(brokenSelected.length, broken.length + 1);
assert.ok(leaks(brokenSelected, ['hull', 'turret'], .1).count > 0,
  'a deleted primary plate still produces real deep-interior leakage');
cube.geometry.dispose(); cube.material.dispose();

const results = [];
for (const quality of ['high', 'low']) {
  const tank = createTank(id, null, { proceduralOnly: true, quality });
  try {
    const { tris, meshes } = collectTriangles(tank.root);
    const boundary = interiorFillBoundaryTriangles(id, tris, meshes);
    const withFittings = leaks(tris, meshes), primary = leaks(boundary, meshes);
    assert.ok(withFittings.count > 0, 'the former broad family span invents exterior cage/optic pockets');
    assert.equal(primary.count, 0, 'actual authored primary bodies are closed at generator resolution');
    const gun = rows => rows.filter(row => /^(gun|mantlet|muzzle)/i.test(meshes[row.mesh]));
    assert.deepEqual(gun(boundary), gun(tris), 'complete physical bore/mount stock remains in the body input');
    results.push({ quality, exteriorPocketVoxels: withFittings.count, primaryLeakVoxels: primary.count,
      originalBodyTriangles: withFittings.bodyTriangles, primaryBodyTriangles: primary.bodyTriangles });
  } finally { tank.dispose(); }
}
console.log('interior-fill-body-policy PASS', JSON.stringify(results));
