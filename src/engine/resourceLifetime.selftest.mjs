import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  disposeObject3DResources,
  residentResourceLimits,
} from './resourceLifetime.js';

assert.deepEqual(residentResourceLimits('mobile'), {
  pedestalVisuals: 2,
  worldScenes: 1,
});
assert.equal(residentResourceLimits('desktop').pedestalVisuals, 10);
assert.equal(residentResourceLimits('desktop').worldScenes, Infinity);

const sharedTexture = new THREE.Texture();
const retiredTexture = new THREE.Texture();
const retiredGeometry = new THREE.BufferGeometry();
const retiredMaterial = new THREE.MeshStandardMaterial({ map: sharedTexture });
retiredMaterial.normalMap = retiredTexture;
const retired = new THREE.Group();
retired.add(new THREE.Mesh(retiredGeometry, retiredMaterial));
const parent = new THREE.Scene();
parent.add(retired);

const live = new THREE.Group();
live.add(new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshStandardMaterial({ map: sharedTexture }),
));

let geometryDisposals = 0;
let materialDisposals = 0;
let sharedTextureDisposals = 0;
let retiredTextureDisposals = 0;
retiredGeometry.addEventListener('dispose', () => { geometryDisposals += 1; });
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
assert.equal(materialDisposals, 1, 'retired material must release its program state');
assert.equal(retiredTextureDisposals, 1, 'unshared retired texture must be released');
assert.equal(sharedTextureDisposals, 0, 'texture used by a preserved root must stay resident');
assert.deepEqual(released, { objects: 2, geometries: 1, materials: 1, textures: 1 });
assert.deepEqual(disposalOrder.map(([type]) => type), ['geometry', 'material', 'texture'],
  'resource owners are notified before each owned GPU resource is disposed');
assert.equal(disposalOrder.some(([, resource]) => resource === sharedTexture), false,
  'preserved shared resources never reach disposal callbacks');

console.log('resourceLifetime self-test passed');
