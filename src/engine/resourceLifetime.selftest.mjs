import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  disposeObject3DResources,
  releaseObject3DGpuResources,
  registerRetainedObject3DResources,
  residentResourceLimits,
  visitOwnedObject3DGeometries,
} from './resourceLifetime.ts';

assert.deepEqual(residentResourceLimits('mobile'), {
  pedestalVisuals: 2,
  worldScenes: 1,
});
assert.deepEqual(residentResourceLimits('desktop'), {
  pedestalVisuals: 4,
  worldScenes: 2,
});
assert.ok(Number.isFinite(residentResourceLimits('desktop').worldScenes),
  'desktop map residency must never grow without a ceiling');

const sharedTexture = new THREE.Texture();
const retiredTexture = new THREE.Texture();
const retiredGeometry = new THREE.BufferGeometry();
const retiredMaterial = new THREE.MeshStandardMaterial({ map: sharedTexture });
retiredMaterial.normalMap = retiredTexture;
const dormantGeometry = new THREE.BufferGeometry();
const retired = new THREE.Group();
retired.add(new THREE.Mesh(retiredGeometry, retiredMaterial));
registerRetainedObject3DResources(retired, { geometries: new Set([dormantGeometry]) });
const parent = new THREE.Scene();
parent.add(retired);

const live = new THREE.Group();
live.add(new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshStandardMaterial({ map: sharedTexture }),
));

let geometryDisposals = 0;
let dormantGeometryDisposals = 0;
let materialDisposals = 0;
let sharedTextureDisposals = 0;
let retiredTextureDisposals = 0;
retiredGeometry.addEventListener('dispose', () => { geometryDisposals += 1; });
dormantGeometry.addEventListener('dispose', () => { dormantGeometryDisposals += 1; });
retiredMaterial.addEventListener('dispose', () => { materialDisposals += 1; });
sharedTexture.addEventListener('dispose', () => { sharedTextureDisposals += 1; });
retiredTexture.addEventListener('dispose', () => { retiredTextureDisposals += 1; });

const disposalOrder = [];
const released = disposeObject3DResources(retired, {
  preserveRoots: [live],
  onDispose(type, resource) { disposalOrder.push([type, resource]); },
});
assert.equal(retired.parent, null, 'retired subtree must detach from the live scene');
assert.equal(geometryDisposals, 1, 'retired geometry must release its GPU buffer');
assert.equal(dormantGeometryDisposals, 1,
  'retained off-tree geometry must release with its Object3D owner');
assert.equal(materialDisposals, 1, 'retired material must release its program state');
assert.equal(retiredTextureDisposals, 1, 'unshared retired texture must be released');
assert.equal(sharedTextureDisposals, 0, 'texture used by a preserved root must stay resident');
assert.deepEqual(released, { objects: 2, geometries: 2, materials: 1, textures: 1 });
assert.deepEqual(disposalOrder.map(([type]) => type),
  ['geometry', 'geometry', 'material', 'texture'],
  'resource owners are notified before each owned GPU resource is disposed');
assert.equal(disposalOrder.some(([, resource]) => resource === sharedTexture), false,
  'preserved shared resources never reach disposal callbacks');

const suspendedRoot = new THREE.Group();
const suspendedGeometry = new THREE.BoxGeometry();
const suspendedTexture = new THREE.Texture();
const suspendedMaterial = new THREE.MeshStandardMaterial({ map: suspendedTexture });
const suspendedMesh = new THREE.Mesh(suspendedGeometry, suspendedMaterial);
suspendedRoot.add(suspendedMesh);
parent.add(suspendedRoot);
let suspendedDisposals = 0;
for (const resource of [suspendedGeometry, suspendedTexture, suspendedMaterial]) {
  resource.addEventListener('dispose', () => { suspendedDisposals += 1; });
}
const suspended = releaseObject3DGpuResources(suspendedRoot);
assert.equal(suspendedRoot.parent, parent,
  'GPU suspension keeps the retained presentation in its ownership tree');
assert.equal(suspendedMesh.geometry, suspendedGeometry,
  'GPU suspension preserves the exact CPU-side geometry for automatic re-upload');
assert.equal(suspendedMesh.material, suspendedMaterial,
  'GPU suspension preserves the exact material and shader contract');
assert.deepEqual(suspended, { objects: 2, geometries: 1, materials: 1, textures: 1 });
assert.equal(suspendedDisposals, 3, 'every independently owned WebGL allocation is released');

const programRetained = releaseObject3DGpuResources(suspendedRoot, {
  releaseMaterials: false,
});
assert.deepEqual(programRetained,
  { objects: 2, geometries: 1, materials: 0, textures: 1 },
  'phase suspension can retain compiled programs while releasing buffers and textures');

// Explicit read-only inventory uses the same live ownership declarations as
// disposal, but must not detach, dispose or change any owner/resource state.
const inventoryParent = new THREE.Scene(), inventoryRoot = new THREE.Group();
inventoryParent.add(inventoryRoot);
const inventoryGeometry = new THREE.BoxGeometry();
const inventoryOffTree = new THREE.BoxGeometry(2, 2, 2);
const inventoryLater = new THREE.PlaneGeometry();
const inventoryTexture = new THREE.Texture();
const inventoryMaterial = new THREE.MeshStandardMaterial({ map: inventoryTexture });
const inventoryMesh = new THREE.InstancedMesh(inventoryGeometry, inventoryMaterial, 2);
inventoryMesh.visible = false;
inventoryRoot.add(inventoryMesh, new THREE.Mesh(inventoryGeometry, inventoryMaterial));
const declaredGeometries = new Set([inventoryGeometry, inventoryOffTree]);
registerRetainedObject3DResources(inventoryRoot, { geometries: declaredGeometries });
registerRetainedObject3DResources(inventoryMesh, { geometries: [inventoryOffTree] });
let inventoryDisposals = 0;
for (const resource of [inventoryGeometry, inventoryOffTree, inventoryLater, inventoryMaterial, inventoryTexture, inventoryMesh]) {
  resource.addEventListener('dispose', () => { inventoryDisposals++; });
}
const inventoryBefore = {
  parent: inventoryRoot.parent, children: [...inventoryRoot.children],
  geometry: inventoryMesh.geometry, material: inventoryMesh.material, texture: inventoryMaterial.map,
  matrixArray: inventoryMesh.instanceMatrix.array.slice(), position: inventoryGeometry.attributes.position.array.slice(),
  groups: JSON.stringify(inventoryGeometry.groups), visible: inventoryMesh.visible,
};
const firstInventory = [];
assert.equal(visitOwnedObject3DGeometries(inventoryRoot, geometry => firstInventory.push(geometry)), 2);
assert.deepEqual(new Set(firstInventory), new Set([inventoryGeometry, inventoryOffTree]), 'attached/declaration aliases deduplicate');
declaredGeometries.add(inventoryLater);
const laterInventory = [];
assert.equal(visitOwnedObject3DGeometries(inventoryRoot, geometry => laterInventory.push(geometry)), 3);
assert.deepEqual(new Set(laterInventory), new Set([inventoryGeometry, inventoryOffTree, inventoryLater]),
  'streamed off-tree additions remain visible without replacing the declaration');
assert.equal(inventoryDisposals, 0, 'inventory must never invoke mesh, geometry, material or texture disposal');
assert.equal(inventoryRoot.parent, inventoryBefore.parent);
assert.deepEqual(inventoryRoot.children, inventoryBefore.children);
assert.equal(inventoryMesh.geometry, inventoryBefore.geometry);
assert.equal(inventoryMesh.material, inventoryBefore.material);
assert.equal(inventoryMaterial.map, inventoryBefore.texture);
assert.equal(inventoryMesh.visible, inventoryBefore.visible);
assert.deepEqual(inventoryMesh.instanceMatrix.array, inventoryBefore.matrixArray);
assert.deepEqual(inventoryGeometry.attributes.position.array, inventoryBefore.position);
assert.equal(JSON.stringify(inventoryGeometry.groups), inventoryBefore.groups);
disposeObject3DResources(inventoryRoot);
assert.equal(inventoryDisposals, 6, 'normal final cleanup still sees the complete inventory');

console.log('resourceLifetime self-test passed');
