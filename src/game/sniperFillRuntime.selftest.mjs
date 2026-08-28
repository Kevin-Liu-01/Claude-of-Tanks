import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSniperFillRuntime } from './sniperFillRuntime.ts';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
camera.position.set(4, 5, 6);
camera.userData.scoped = true;
const rig = { mode: 'SNIPER', aimDist: 8 };
const runtime = createSniperFillRuntime(scene, camera, rig);

assert.equal(scene.children.includes(runtime.light), true, 'light is scene-owned');
assert.equal(runtime.light.castShadow, false, 'scope fill never adds a shadow pass');
const retainedPosition = runtime.light.position;
runtime.update();
assert.equal(runtime.light.intensity, 22.5, 'near scoped cover receives bounded fill');
assert.deepEqual(runtime.light.position.toArray(), [4, 5, 6], 'fill follows scoped camera');

camera.position.set(8, 9, 10);
rig.aimDist = 30;
runtime.update();
assert.equal(runtime.light.intensity, 0, 'distant scoped aim contributes no fill');
assert.equal(runtime.light.position, retainedPosition, 'updates retain their vector storage');

rig.mode = 'ARCADE';
rig.aimDist = 2;
runtime.update();
assert.equal(runtime.light.intensity, 0, 'arcade view cannot leak sniper fill');

runtime.dispose();
assert.equal(scene.children.includes(runtime.light), false, 'disposal detaches the retained light');

console.log('sniperFillRuntime.selftest: scoped close-cover fill lifecycle passed');
