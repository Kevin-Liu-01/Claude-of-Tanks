import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera } from 'three';
import { createWorldFramePresentationRuntime } from './worldFramePresentationRuntime.ts';

const camera = new PerspectiveCamera(37, 1, 0.1, 1000);
camera.position.set(5, 7, 9);
camera.lookAt(5, 7, 10);
camera.updateMatrixWorld(true);
const root = new Object3D();
root.position.set(2, 3, 4);
root.updateMatrixWorld(true);
const entity = {
  state: {},
  spec: { dims: { heightM: 4 } },
  visual: { root },
};
const fades = [];
const updates = [];
const world = {
  setSniperFade(...args) { fades.push(args); },
  update(dtSeconds, cameraPosition, forward, focus) {
    updates.push({ dtSeconds, cameraPosition, forward: forward.toArray(),
      focus: focus?.toArray() ?? null });
  },
};
const rig = { mode: 'ARCADE', aimDist: 260, externalActive: false };
let dormant = false;
let cameraFocus = entity;
const runtime = createWorldFramePresentationRuntime({
  camera,
  rig,
  getWorld: () => world,
  isWorldDormant: () => dormant,
  getCameraFocus: () => cameraFocus,
});

runtime.update(1 / 60, true, false);
assert.deepEqual(fades.at(-1), [0, false, 37, 260]);
assert.deepEqual(updates.at(-1).cameraPosition, camera.position);
assert.deepEqual(updates.at(-1).focus, [2, 6, 4], 'focus lifts to turret height');
assert.ok(updates.at(-1).forward[2] > 0.999, 'world direction follows the camera');

rig.mode = 'SNIPER';
runtime.update(1 / 60, true, false);
assert.equal(fades.at(-1)[0], 1, 'scope opens the complete aim corridor');
assert.equal(updates.at(-1).focus, null, 'scope does not apply chase-camera fade');

rig.mode = 'ARCADE';
rig.externalActive = true;
runtime.update(1 / 60, true, false);
assert.equal(updates.at(-1).focus, null, 'external capture poses never dither foliage');

rig.externalActive = false;
cameraFocus = null;
runtime.update(1 / 60, true, false);
assert.equal(updates.at(-1).focus, null, 'missing occupied entity is safe');

dormant = true;
runtime.update(1 / 60, false, false);
assert.equal(updates.length, 4, 'dormant Garage world performs no frame work');
assert.equal(fades.length, 4);

console.log('worldFramePresentationRuntime.selftest: scope, occlusion and dormancy passed');
