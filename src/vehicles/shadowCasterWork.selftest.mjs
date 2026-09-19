import assert from 'node:assert/strict';
import * as THREE from 'three';
import { measureNearShadowCasterWork } from './shadowCasterWork.ts';

const material = new THREE.MeshBasicMaterial();
const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });
const box = new THREE.BoxGeometry(); // Twelve triangles.
const root = new THREE.Group();
const mesh = () => { const m = new THREE.Mesh(box, material); m.castShadow = true; return m; };
const plain = mesh(); root.add(plain);
const instances = new THREE.InstancedMesh(box, material, 9);
instances.count = 3; instances.castShadow = true; root.add(instances);
const lod = new THREE.LOD(), near = mesh(), far = mesh();
lod.addLevel(near, 0); lod.addLevel(far, 20);
near.visible = false; far.visible = true; root.add(lod);
const invisible = new THREE.Group(); invisible.visible = false; invisible.add(mesh()); root.add(invisible);
const noShadow = mesh(); noShadow.castShadow = false; root.add(noShadow);
const noMaterial = mesh(); noMaterial.material = hiddenMaterial; root.add(noMaterial);
const groupedGeometry = box.clone();
groupedGeometry.clearGroups();
groupedGeometry.addGroup(0, 18, 0); groupedGeometry.addGroup(18, 18, 1);
groupedGeometry.setDrawRange(3, 30);
const grouped = new THREE.Mesh(groupedGeometry, [material, hiddenMaterial]);
grouped.castShadow = true; root.add(grouped);
const snapshot = [];
root.traverse(object => snapshot.push([object, object.visible, object.castShadow]));
assert.deepEqual(measureNearShadowCasterWork([root, plain, instances, root]),
  { lod:'near', cameraLayerMask:1, draws:4, triangles:65 },
  '12 ordinary + 36 instance + 12 selected near + 5 visible group triangles, without duplicates');
for (const [object, visible, castShadow] of snapshot) {
  assert.equal(object.visible, visible); assert.equal(object.castShadow, castShadow);
}
instances.count = 0;
assert.deepEqual(measureNearShadowCasterWork([root]), { lod:'near', cameraLayerMask:1, draws:3, triangles:29 });
// A second visible LOD must not pad the apparent savings; nor may a hidden
// ordinary subtree, a disabled shadow, invisible material or unused instances.
far.geometry = new THREE.SphereGeometry(1, 64, 32);
assert.equal(measureNearShadowCasterWork([root]).triangles, 29);
const hiddenChild = invisible.children[0];
assert.equal(measureNearShadowCasterWork([invisible, hiddenChild]).triangles, 0,
  'explicit descendant root never bypasses hidden parent');
assert.equal(measureNearShadowCasterWork([hiddenChild]).triangles, 0);
assert.equal(measureNearShadowCasterWork([far]).triangles, 0,
  'explicit far-LOD root is still excluded at the near detail distance');
assert.equal(measureNearShadowCasterWork([near]).triangles, 12,
  'near LOD selection is deterministic even when previous visibility is far');
plain.layers.set(1);
assert.equal(measureNearShadowCasterWork([plain]).triangles, 0);
assert.equal(measureNearShadowCasterWork([plain], 2).triangles, 12);
plain.layers.set(0);
const layeredParent = new THREE.Group(); layeredParent.layers.set(1); layeredParent.add(mesh());
assert.equal(measureNearShadowCasterWork([layeredParent]).triangles, 12,
  'parent layer mismatch does not prune matching child layers');
const negativeRange = mesh(); negativeRange.geometry = box.clone();
negativeRange.geometry.setDrawRange(-3, 6);
assert.equal(measureNearShadowCasterWork([negativeRange]).triangles, 1,
  'clipping a negative draw start must not extend its original end');
negativeRange.geometry.dispose();
instances.count = 10;
assert.throws(() => measureNearShadowCasterWork([instances]), /valid active instance count/);
instances.count = 0;
const duplicateLod = new THREE.LOD(), duplicateLevel = mesh();
duplicateLod.addLevel(duplicateLevel, 0); duplicateLod.addLevel(duplicateLevel, 20);
assert.throws(() => measureNearShadowCasterWork([duplicateLod]), /distinct LOD level objects/);
assert.throws(() => measureNearShadowCasterWork([duplicateLevel]), /distinct LOD level objects/);
const wire = mesh(), wireMaterial = material.clone(); wireMaterial.wireframe = true;
wire.material = wireMaterial;
assert.throws(() => measureNearShadowCasterWork([wire]), /wireframe lines/);
wireMaterial.dispose();
const zeroGroups = new THREE.Mesh(box.clone(), [material]);
zeroGroups.geometry.clearGroups(); zeroGroups.castShadow = true; root.add(zeroGroups);
assert.equal(measureNearShadowCasterWork([root]).triangles, 29);
far.geometry.dispose(); groupedGeometry.dispose(); zeroGroups.geometry.dispose();
box.dispose(); material.dispose(); hiddenMaterial.dispose();
console.log('shadowCasterWork.selftest: actual near caster submissions, instancing, groups, LOD and visibility pass');
