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

const proxyMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), proxyMaterial);
proxy.castShadow = true;
proxy.userData.authoredShadowProxy = true;
nested.add(proxy);

const receipt = optimizeGarageDressing(root, { minimumShadowRadiusM: 0.4 });
assert.equal(small.castShadow, false, 'sub-resolution fitting leaves the shadow passes');
assert.equal(large.castShadow, true, 'large workshop structure keeps its shadow');
assert.equal(proxy.castShadow, true, 'authored shadow proxies are never pruned');
assert.equal(receipt.shadowCastersBefore, 3);
assert.equal(receipt.shadowCastersAfter, 2);
assert.equal(receipt.shadowCastersPruned, 1);
assert.equal(receipt.objectsFrozen, 4);
assert.equal(nested.matrixAutoUpdate, false);
assert.equal(small.matrixAutoUpdate, false);
assert.equal(root.matrixAutoUpdate, true, 'integration may still re-seat the workshop root');
assert.equal(root.userData.optimizationReceipt, receipt,
  'the live scene exposes the exact optimization receipt');

small.geometry.dispose();
large.geometry.dispose();
proxy.geometry.dispose();
material.dispose();
proxyMaterial.dispose();

console.log('garageDressingOptimization.selftest: static transforms and proxy-safe shadow budget pass');
