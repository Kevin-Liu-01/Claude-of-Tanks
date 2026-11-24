// garage round 2, 277 (Kevin 2026-11-24: "the world through its doors"): an enclosed Garage's exterior is its map's own
// scene pack clipped to the outside of its hall (garageEnvironmentKit.ts clipGarageEnvironmentToExterior,
// garageArchitecture.ts buildEnclosureExterior). Copyright © 2026 Kevin B. Liu.
// 1. only an enclosed Garage's recipe declares a hall, and the Verdant hall is the stage's 46 m floor;
// 2. its ground meets the hall's floor at every wall and still follows the map past the feather;
// 3. nothing it draws stands inside the walls (no triangle's centroid, no instance's origin), and the clip leaves the
//    world outside whole: the terrain, the horizon, the map's structures and trees still draw;
// 4. a geometry another pack may share is cut only on a clone (the shared one keeps its triangles).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import {
  buildGarageEnvironment, clipGarageEnvironmentToExterior, createGarageEnvironmentAssetLibrary, garageEnclosureFootprint,
  prepareGarageEnvironmentAssets,
} from './garageEnvironmentKit.ts';

// 1.
for (const variant of GARAGE_VARIANTS) {
  const footprint = garageEnclosureFootprint(variant);
  assert.equal(!!footprint, variant.architecture === 'field_shed', `${variant.id}: a hall declared only for the motor pool`);
}
const verdant = GARAGE_VARIANTS.find((variant) => variant.id === 'verdant_motor_pool');
const footprint = garageEnclosureFootprint(verdant);
assert.deepEqual([footprint.halfXM, footprint.halfZM], [23, 23], 'the Verdant hall is the stage\'s 46 m floor');

const assets = createGarageEnvironmentAssetLibrary({});
await prepareGarageEnvironmentAssets(assets, verdant);
const build = buildGarageEnvironment({}, assets, verdant, () => {}, { kitPlacement: null });
// 2.
for (const [x, z] of [[0, 23], [0, -23], [23, 0], [-23, 0], [23, 23], [-23, -23]]) {
  assert.ok(Math.abs(build.groundAtWorld(x, z) + 0.04) < 0.1, `the ground meets the floor at the wall (the excerpt grid interpolates within 10 cm) (${x}, ${z}): ${build.groundAtWorld(x, z).toFixed(3)}`);
}
const far = [[0, 60], [60, 0], [-60, 0], [0, -60]].map(([x, z]) => build.groundAtWorld(x, z));
assert.ok(far.some((height) => Math.abs(height + 0.04) > 0.3), `past the feather the ground is the map's (${far.map((h) => h.toFixed(2)).join(', ')})`);

// 4. (a shared geometry: one mesh of the pack also drawn elsewhere)
const shared = [];
build.root.traverse((object) => { if (object.isMesh && !object.isInstancedMesh && object.name === 'map_derived_terrain_patch') shared.push(object); });
assert.equal(shared.length, 1, 'the pack draws its terrain patch');
const terrainGeometry = shared[0].geometry;
const terrainTriangles = terrainGeometry.index ? terrainGeometry.index.count / 3 : terrainGeometry.getAttribute('position').count / 3;

const halfX = footprint.halfXM + 0.5, halfZ = footprint.halfZM + 0.5;
const clip = clipGarageEnvironmentToExterior(build.root, halfX, halfZ);
assert.ok(clip.removedTriangles > 0 && clip.removedInstances > 0, `the yard inside the hall went (${clip.removedTriangles} triangles, ${clip.removedInstances} instances)`);
assert.equal(terrainGeometry.index ? terrainGeometry.index.count / 3 : terrainGeometry.getAttribute('position').count / 3, terrainTriangles,
  'the original geometry keeps its triangles (the cut is a clone)');
assert.ok(clip.clones.includes(shared[0].geometry), 'the terrain draws its clone');

// 3.
build.root.updateMatrixWorld(true);
const inside = (point) => Math.abs(point.x) < halfX - 1e-6 && Math.abs(point.z) < halfZ - 1e-6;
const drawn = new Set();
const point = new THREE.Vector3(), matrix = new THREE.Matrix4();
build.root.traverse((object) => {
  if (!object.isMesh || !object.visible) return;
  drawn.add(object.name || object.parent?.name);
  if (object.isInstancedMesh) {
    for (let index = 0; index < object.count; index += 1) {
      object.getMatrixAt(index, matrix);
      point.setFromMatrixPosition(matrix).applyMatrix4(object.matrixWorld);
      assert.ok(!inside(point), `${object.name}: instance ${index} inside the hall (${point.x.toFixed(1)}, ${point.z.toFixed(1)})`);
    }
    return;
  }
  const position = object.geometry.getAttribute('position'), index = object.geometry.getIndex();
  const triangles = index ? index.count / 3 : position.count / 3;
  const corner = (k) => (index ? index.getX(k) : k);
  for (let t = 0; t < triangles; t += 1) {
    let cx = 0, cz = 0;
    for (let k = 0; k < 3; k += 1) {
      point.fromBufferAttribute(position, corner(t * 3 + k)).applyMatrix4(object.matrixWorld);
      cx += point.x; cz += point.z;
    }
    assert.ok(!inside({ x: cx / 3, z: cz / 3 }), `${object.name}: triangle ${t} inside the hall`);
  }
});
for (const name of ['map_derived_terrain_patch', 'garage_shared_distant_horizon']) assert.ok(drawn.has(name), `the world outside keeps its ${name}`);
assert.ok([...drawn].some((name) => name?.startsWith('authored_structures_')), 'the map\'s structures still draw outside');
assert.ok([...drawn].some((name) => name?.startsWith('battlefield_tree_')), 'the map\'s trees still draw outside');

for (const geometry of clip.clones) geometry.dispose();
build.dispose();
assets.dispose();
console.log(`garageEnclosureExterior.selftest: the motor pool alone declares a hall; its ground meets the floor at the walls; `
  + `${clip.removedTriangles} triangles and ${clip.removedInstances} instances inside the hall cut on clones; the terrain, horizon, `
  + `structures and trees outside draw PASS`);
process.exit(0);
