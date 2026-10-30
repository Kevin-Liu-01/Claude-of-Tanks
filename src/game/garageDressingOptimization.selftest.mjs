import assert from 'node:assert/strict';
import * as THREE from 'three';
import { optimizeGarageDressing, optimizeGarageDressingSteps } from './garageDressingOptimization.ts';

const root = new THREE.Group();
const nested = new THREE.Group();
root.add(nested);

const material = new THREE.MeshStandardMaterial();
const small = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), material);
small.castShadow = true;
nested.add(small);

const large = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), material);
large.castShadow = true;
nested.add(large);

const repeatedGeometry = new THREE.BoxGeometry(0.7, 0.7, 0.7);
const repeatedA = new THREE.Mesh(repeatedGeometry, material);
repeatedA.position.set(2, 0, 0);
repeatedA.castShadow = repeatedA.receiveShadow = true;
nested.add(repeatedA);
const repeatedB = new THREE.Mesh(repeatedGeometry, material);
repeatedB.position.set(-2, 0, 0);
repeatedB.castShadow = repeatedB.receiveShadow = true;
nested.add(repeatedB);

const mergeMaterial = new THREE.MeshStandardMaterial();
const mergeA = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.4), mergeMaterial);
mergeA.position.set(0, 1, 2);
const mergeB = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 8), mergeMaterial);
mergeB.position.set(0, 1, -2);
nested.add(mergeA, mergeB);
let releasedMergeSources = 0;
mergeA.geometry.addEventListener('dispose', () => { releasedMergeSources += 1; });
mergeB.geometry.addEventListener('dispose', () => { releasedMergeSources += 1; });

const fleetRoot = new THREE.Group();
fleetRoot.name = 'dressing_tank_test';
const fleetA = new THREE.Mesh(repeatedGeometry, material);
const fleetB = new THREE.Mesh(repeatedGeometry, material);
fleetRoot.add(fleetA, fleetB);
nested.add(fleetRoot);

const variantRoot = new THREE.Group();
variantRoot.userData.variantSwitchOwner = true;
const variantA = new THREE.Mesh(repeatedGeometry, material);
const variantB = new THREE.Mesh(repeatedGeometry, material);
variantRoot.add(variantA, variantB);
nested.add(variantRoot);

const displayRoot = new THREE.Group();
displayRoot.userData.sourceVehicleId = 'display_test';
displayRoot.position.set(4, 0, 0);
const displayMaterial = new THREE.MeshStandardMaterial();
const displayA = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.6), displayMaterial);
displayA.position.set(-0.8, 0.25, 0);
const displayB = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.4), displayMaterial);
displayB.position.set(0.8, 0.15, 0);
const displayRig = new THREE.Group();
displayRig.add(displayA, displayB);
displayRoot.add(displayRig);
nested.add(displayRoot);

const proxyMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), proxyMaterial);
proxy.castShadow = true;
proxy.userData.authoredShadowProxy = true;
nested.add(proxy);

const receipt = optimizeGarageDressing(root, {
  minimumShadowRadiusM: 0.4,
  staticDisplayOwners: [displayRoot],
});
assert.equal(small.castShadow, false, 'sub-resolution fitting leaves the shadow passes');
assert.equal(large.castShadow, true, 'large workshop structure keeps its shadow');
assert.equal(proxy.castShadow, true, 'authored shadow proxies are never pruned');
assert.equal(receipt.shadowCastersBefore, 5);
assert.equal(receipt.shadowCastersAfter, 4);
assert.equal(receipt.shadowCastersPruned, 1);
assert.equal(receipt.objectsFrozen, 18);
assert.equal(receipt.meshesInstanced, 2, 'exact repeated static props become instances');
assert.equal(receipt.instanceBatches, 1);
assert.equal(receipt.meshesMerged, 2, 'different static geometries sharing state become one draw');
assert.equal(receipt.mergeBatches, 1);
assert.equal(receipt.sourceGeometriesReleased, 4,
  'unreferenced workshop and decorative-display sources leave GPU residency');
assert.equal(releasedMergeSources, 2, 'unreferenced uploaded source geometry is released immediately');
assert.equal(receipt.displayMeshesMerged, 2);
assert.equal(receipt.displayMergeBatches, 1);
assert.equal(receipt.displayDrawCallsRemoved, 1);
assert.equal(receipt.drawCallsRemoved, 3);
const batch = root.getObjectByName('workshop_static_instances_1');
assert.ok(batch?.isInstancedMesh, 'the optimized scene owns one repeated-prop batch');
assert.ok(repeatedA.parent === null);
assert.ok(repeatedB.parent === null);
assert.ok(mergeA.parent === null);
assert.ok(mergeB.parent === null);
assert.ok(root.getObjectByName('workshop_static_merge_1'),
  'the optimized scene owns one transformed static merge');
assert.ok(fleetA.parent === fleetRoot, 'fleet exhibit ownership remains intact');
assert.ok(fleetB.parent === fleetRoot, 'fleet exhibit meshes are not flattened');
assert.ok(variantA.parent === variantRoot, 'variant-controlled set pieces retain local ownership');
assert.ok(variantB.parent === variantRoot, 'variant-controlled set pieces remain visibility-switchable');
assert.ok(displayRoot.getObjectByName('workshop_display_merge_1'),
  'an explicitly immutable authored display shares one exact draw owner');
assert.ok(displayRig.parent === null, 'empty decorative rig branches leave the live scene graph');
assert.deepEqual(displayRoot.position.toArray(), [4, 0, 0],
  'the authored display owner remains movable after its leaf draws collapse');
assert.equal(nested.matrixAutoUpdate, false);
assert.equal(small.matrixAutoUpdate, false);
assert.equal(root.matrixAutoUpdate, true, 'integration may still re-seat the workshop root');
assert.equal(root.userData.optimizationReceipt, receipt,
  'the live scene exposes the exact optimization receipt');

small.geometry.dispose();
large.geometry.dispose();
proxy.geometry.dispose();
repeatedGeometry.dispose();
mergeA.geometry.dispose();
mergeB.geometry.dispose();
for (const geometry of root.userData.optimizationDisposables || []) geometry.dispose();
material.dispose();
mergeMaterial.dispose();
proxyMaterial.dispose();
displayMaterial.dispose();

{
  // A display owner nested inside another merges alone and stays movable inside its parent owner (the Garage's Abrams
  // bay, carried to each destination's placement after the shared optimization).
  const workshop = new THREE.Group();
  const shared = new THREE.Group();
  shared.userData.variantSwitchOwner = true;
  workshop.add(shared);
  const paint = new THREE.MeshStandardMaterial();
  const box = (x, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), paint);
    mesh.position.set(x, 0.25, z);
    return mesh;
  };
  const sharedA = box(-6, 0), sharedB = box(-4, 0);
  shared.add(sharedA, sharedB);
  const bay = new THREE.Group();
  bay.userData.sourceVehicleId = 'bay_test';
  bay.position.set(5, 0, 0);
  const bayA = box(-1, 0), bayB = box(1, 0);
  bay.add(bayA, bayB);
  shared.add(bay);
  const nestedReceipt = optimizeGarageDressing(workshop, { staticDisplayOwners: [shared, bay] });
  assert.equal(nestedReceipt.displayMergeBatches, 2, 'the parent and the nested owner each keep one merged draw');
  assert.equal(nestedReceipt.displayMeshesMerged, 4);
  const sharedMerges = shared.children.filter((child) => child.userData.workshopStaticDisplayMerge);
  const bayMerges = bay.children.filter((child) => child.userData.workshopStaticDisplayMerge);
  assert.equal(sharedMerges.length, 1, 'the parent owner merges only its own leaves');
  assert.equal(bayMerges.length, 1, 'the nested owner merges its leaves under itself');
  assert.ok(bay.parent === shared, 'the nested owner stays inside its parent owner');
  const center = (mesh) => {
    mesh.geometry.computeBoundingBox();
    return mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
  };
  assert.ok(center(bayMerges[0]).distanceTo(new THREE.Vector3(0, 0.25, 0)) < 1e-6,
    'the nested owner\'s merged vertices stay in its own frame');
  assert.ok(center(sharedMerges[0]).distanceTo(new THREE.Vector3(-5, 0.25, 0)) < 1e-6,
    'the parent owner\'s merged vertices exclude the nested owner');
  bay.position.set(-20, 0, 7);
  bay.rotation.y = Math.PI;
  bay.updateMatrix();
  workshop.updateMatrixWorld(true);
  const moved = new THREE.Box3().setFromObject(bayMerges[0]).getCenter(new THREE.Vector3());
  assert.ok(moved.distanceTo(new THREE.Vector3(-20, 0.25, 7)) < 1e-6,
    'moving the nested owner after optimization carries its merged draw');
  for (const geometry of workshop.userData.optimizationDisposables || []) geometry.dispose();
  paint.dispose();
}

{
  // A mesh flagged keepDisplayMesh (a workshop crew, already merged in its own frame) keeps its own draw inside a
  // display owner, so the frustum culls each crew on its own instead of drawing every bay's crew in every view.
  const workshop = new THREE.Group();
  const shared = new THREE.Group();
  shared.userData.variantSwitchOwner = true;
  workshop.add(shared);
  const paint = new THREE.MeshStandardMaterial();
  const crewA = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.7, 0.3), paint);
  crewA.userData.keepDisplayMesh = true;
  crewA.position.set(10, 0.85, 0);
  const crewB = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.7, 0.3), paint);
  crewB.userData.keepDisplayMesh = true;
  crewB.position.set(-10, 0.85, 0);
  const propA = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), paint);
  const propB = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.5), paint);
  propB.position.set(1, 0, 0);
  shared.add(crewA, crewB, propA, propB);
  const kept = optimizeGarageDressing(workshop, { staticDisplayOwners: [shared] });
  assert.equal(kept.displayMeshesMerged, 2, 'only the plain props merge');
  assert.ok(crewA.parent === shared, 'a kept crew mesh stays its own draw');
  assert.ok(crewB.parent === shared, 'every kept crew mesh stays its own draw');
  for (const geometry of workshop.userData.optimizationDisposables || []) geometry.dispose();
  crewA.geometry.dispose(); crewB.geometry.dispose(); paint.dispose();
}

// (lockdown-251) the shadow budget reads each caster's world scale from one walk of the workshop and its ancestors, not
// a walk up the parents per caster: the same casters keep their shadow under scaled, mirrored and rotated owners, and
// under an ancestor moved since its last world update (getWorldScale walked that ancestor first; so does the pass now).
{
  const build = () => {
    let seed = 0x5eed;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const stage = new THREE.Group();
    const workshop = new THREE.Group();
    stage.add(workshop);
    stage.updateMatrixWorld(true);
    stage.scale.set(1.3, 0.6, 1.3); // moved after its last world update
    stage.rotation.y = 0.4;
    const material = new THREE.MeshStandardMaterial();
    const meshes = [];
    let parent = workshop;
    for (let depth = 0; depth < 6; depth++) {
      const group = new THREE.Group();
      group.position.set(random() * 2 - 1, random(), random() * 2 - 1);
      group.rotation.set(random(), random() * 3, random());
      group.scale.set(depth === 2 ? -0.7 : 0.5 + random(), 0.5 + random(), 0.5 + random() * 0.4);
      parent.add(group);
      for (let k = 0; k < 6; k++) {
        const size = 0.05 + random() * 0.5;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.5, size), material);
        mesh.position.set(random(), random(), random());
        mesh.scale.set(k === 3 ? -1.4 : 0.4 + random() * 1.6, 0.4 + random(), 0.4 + random() * 1.6);
        mesh.castShadow = true;
        group.add(mesh);
        meshes.push(mesh);
      }
      parent = group;
    }
    return { workshop, meshes };
  };
  const reference = build();
  const scale = new THREE.Vector3();
  const expected = reference.meshes.map((mesh) => {
    mesh.geometry.computeBoundingSphere();
    mesh.getWorldScale(scale);
    return mesh.geometry.boundingSphere.radius * Math.max(scale.x, scale.y, scale.z) >= 0.4;
  });
  const subject = build();
  optimizeGarageDressing(subject.workshop);
  assert.ok(expected.includes(true) && expected.includes(false), 'the case keeps some casters and prunes others');
  assert.deepEqual(subject.meshes.map((mesh) => mesh.castShadow), expected,
    'the same casters keep their shadow as by getWorldScale');
}

// (2026-10-27, the room-stalls lane) the optimization as steps does the one pass's work in the same order: the same
// receipt and the same scene graph as optimizeGarageDressing, yielding between the freeze runs, the prop passes and
// each display merge batch
{
  const build = () => {
    const workshop = new THREE.Group();
    const filler = new THREE.Group();
    for (let i = 0; i < 900; i++) filler.add(new THREE.Group());
    workshop.add(filler);
    const shared = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const propMaterial = new THREE.MeshStandardMaterial();
    for (const x of [-3, 3]) {
      const prop = new THREE.Mesh(shared, propMaterial);
      prop.position.set(x, 0, 0);
      prop.castShadow = true;
      workshop.add(prop);
    }
    const display = new THREE.Group();
    display.userData.sourceVehicleId = 'display_steps';
    display.position.set(5, 0, 1);
    for (const [index, color] of [0x335566, 0x664433].entries()) {
      const displayMaterial = new THREE.MeshStandardMaterial({ color });
      for (const z of [-1, 1]) {
        const part = new THREE.Mesh(new THREE.BoxGeometry(0.4 + index * 0.1, 0.5, 0.6), displayMaterial);
        part.position.set(index, 0.25, z);
        display.add(part);
      }
    }
    workshop.add(display);
    return { workshop, display };
  };
  const signature = (root) => {
    const rows = [];
    root.updateWorldMatrix(true, true);
    root.traverse((object) => {
      const geometry = object.geometry;
      rows.push([object.name, object.type, object.castShadow, object.matrixAutoUpdate,
        geometry ? Array.from(geometry.getAttribute('position').array) : null,
        Array.from(object.matrixWorld.elements)]);
    });
    return JSON.stringify(rows);
  };
  const once = build();
  const expected = optimizeGarageDressing(once.workshop, { staticDisplayOwners: [once.display] });
  assert.ok(expected.displayMergeBatches >= 2 && expected.objectsFrozen > 900, JSON.stringify(expected));
  const stepped = build();
  const steps = optimizeGarageDressingSteps(stepped.workshop, { staticDisplayOwners: [stepped.display] });
  let yields = 0;
  let result;
  for (;;) {
    const step = steps.next();
    if (step.done) { result = step.value; break; }
    yields += 1;
  }
  assert.ok(yields >= 6, `the pass yields between its pieces (${yields})`);
  assert.deepEqual(result, expected, 'the same receipt');
  assert.equal(signature(stepped.workshop), signature(once.workshop), 'the same scene graph, vertices and transforms');
}

console.log('garageDressingOptimization.selftest: static transforms and proxy-safe shadow budget pass; the optimization as steps matches the one pass');
