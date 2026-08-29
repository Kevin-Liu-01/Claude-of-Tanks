import assert from 'node:assert/strict';
import * as THREE from 'three';
import { optimizeGarageDressing } from './garageDressingOptimization.ts';

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

const proxyMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), proxyMaterial);
proxy.castShadow = true;
proxy.userData.authoredShadowProxy = true;
nested.add(proxy);

const receipt = optimizeGarageDressing(root, { minimumShadowRadiusM: 0.4 });
assert.equal(small.castShadow, false, 'sub-resolution fitting leaves the shadow passes');
assert.equal(large.castShadow, true, 'large workshop structure keeps its shadow');
assert.equal(proxy.castShadow, true, 'authored shadow proxies are never pruned');
assert.equal(receipt.shadowCastersBefore, 5);
assert.equal(receipt.shadowCastersAfter, 4);
assert.equal(receipt.shadowCastersPruned, 1);
assert.equal(receipt.objectsFrozen, 14);
assert.equal(receipt.meshesInstanced, 2, 'exact repeated static props become instances');
assert.equal(receipt.instanceBatches, 1);
assert.equal(receipt.meshesMerged, 2, 'different static geometries sharing state become one draw');
assert.equal(receipt.mergeBatches, 1);
assert.equal(receipt.sourceGeometriesReleased, 2);
assert.equal(releasedMergeSources, 2, 'unreferenced uploaded source geometry is released immediately');
assert.equal(receipt.drawCallsRemoved, 2);
const batch = root.getObjectByName('workshop_static_instances_1');
assert.ok(batch?.isInstancedMesh, 'the optimized scene owns one repeated-prop batch');
assert.equal(repeatedA.parent, null);
assert.equal(repeatedB.parent, null);
assert.equal(mergeA.parent, null);
assert.equal(mergeB.parent, null);
assert.ok(root.getObjectByName('workshop_static_merge_1'),
  'the optimized scene owns one transformed static merge');
assert.equal(fleetA.parent, fleetRoot, 'fleet exhibit ownership remains intact');
assert.equal(fleetB.parent, fleetRoot, 'fleet exhibit meshes are not flattened');
assert.equal(variantA.parent, variantRoot, 'variant-controlled set pieces retain local ownership');
assert.equal(variantB.parent, variantRoot, 'variant-controlled set pieces remain visibility-switchable');
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

console.log('garageDressingOptimization.selftest: static transforms and proxy-safe shadow budget pass');
