import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildHorizonRing, sampleHorizonGeometry } from './maps/horizon.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { disposeObject3DResources, releaseObject3DGpuResources } from '../engine/resourceLifetime.ts';

// Authenticated by executing the actual 822daf5fa:src/world/terrain.js
// buildHorizonRing with its original Verdant config and Three's SimplexNoise.
// Original function SHA256: b46e865dea6808207b7e8815206a4100b5668b83b746490d0c83d44913402fad
// No Git dependency at test/runtime; fixtures include original positions,
// colours, computed normals and indices, not a visual approximation.
const seeds = [1337, 2049, 7719];
const original = [
  'db9e1699cbc2896cd4c5114048889ddfa64e14b9a521824f3ea631e822d2665e',
  '0915af897254ea8eb96f63e017308317b9090c58a59527b8abfa07c9a933e62d',
  'dbc535e0152380e571bef634e8a6946fe8f89a161204f62e84da710d30d46993',
];
// Actual pre-restoration 28d5fd378 geometry over the same map/seed order.
const other29 = 'e9a5a2a1f05f8c6382b137015f9336da5518e5e65c6f46605ff8376c561fe00e';
const unaffected = createHash('sha256');
function digest(mesh) {
  const hash = createHash('sha256');
  for (const key of ['position', 'color', 'normal']) {
    hash.update(Buffer.from(mesh.geometry.attributes[key].array.buffer));
  }
  return hash.update(Buffer.from(mesh.geometry.index.array.buffer)).digest('hex');
}
for (const [i, seed] of seeds.entries()) {
  for (const id of MAP_IDS) {
    const sample = sampleHorizonGeometry(getMapConfig(id), seed);
    if (id !== 'verdant') {
      unaffected.update(id + ':' + seed).update(Buffer.from(sample.positions.buffer))
        .update(Buffer.from(sample.heights.buffer)).update(JSON.stringify(sample.rows));
      continue;
    }
    const mesh = buildHorizonRing(null, getMapConfig(id), seed);
    assert.equal(digest(mesh), original[i], 'restored uploaded geometry/colour is exactly the original');
    assert.deepEqual(mesh.geometry.attributes.position.array, sample.positions,
      'authoring diagnostics sample the actual restored renderer, not the replaced mountain ring');
    assert.equal(mesh.geometry.attributes.position.count, 960);
    assert.equal(mesh.geometry.index.count, 4320);
    const bytes = Object.values(mesh.geometry.attributes).reduce((sum, a) => sum + a.array.byteLength,
      mesh.geometry.index.array.byteLength);
    assert.equal(bytes, 43200, 'original smaller geometry allocation');
    assert.equal(mesh.children.length, 0, 'one original draw, no new canopy ribbons');
    assert.equal(mesh.material.map, null, 'original backdrop has no textures or texture-bake work');
    assert.equal(mesh.material.fog, true);
    assert.equal(mesh.userData.aoExclude, true);
    assert.equal(mesh.matrixAutoUpdate, false);
    const position = mesh.geometry.attributes.position;
    position.setY(240, position.getY(240) + .01);
    assert.notEqual(digest(mesh), original[i], 'even a small new redesign fails the original oracle');
    const suspended = releaseObject3DGpuResources(mesh, { releaseMaterials: false });
    assert.equal(suspended.textures, 0); assert.equal(suspended.materials, 0);
    const disposed = disposeObject3DResources(mesh);
    assert.equal(disposed.textures, 0); assert.equal(disposed.materials, 1);
    assert.equal(disposed.geometries, 1);
  }
}
assert.equal(unaffected.digest('hex'), other29, 'all29 other horizons remain byte-exact across three seeds');
console.log('originalVerdantHorizon: exact historical geometry/colour, smaller resource budget, lifecycle, other29 unchanged PASS');
