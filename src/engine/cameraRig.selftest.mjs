import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { createCameraRig } from './cameraRig.ts';

const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 2000);
const player = {
  state: { pos: new Vector3(0, 0, 0), yaw: 0, turretYaw: 0 },
  input: { aimPoint: new Vector3() },
  visual: {
    root: new Object3D(),
    turretTopWorld(out) { return out.set(0, 2, 0); },
    gunPivotWorld(out) { return out.set(0, 1.7, 0.2); },
  },
};
const rig = createCameraRig(camera, {
  heightField: { getHeightAt: () => 0 },
  raycast: () => null,
  getPlayer: () => player,
});
const idle = {
  mouseDX: 0,
  mouseDY: 0,
  wheel: 0,
  rmb: false,
  shiftPressed: false,
};

rig.snapArcade(2, 0, -0.1);
const initialAim = rig.aimPoint.clone();
const initialDirection = new Vector3();
camera.getWorldDirection(initialDirection);

rig.update(1 / 60, {
  ...idle,
  mouseDX: 140,
  mouseDY: -35,
  rmb: true,
});
const heldAim = rig.aimPoint.clone();
const heldDirection = new Vector3();
camera.getWorldDirection(heldDirection);
assert.ok(heldAim.distanceTo(initialAim) > 100,
  'gun hold keeps publishing the newly aimed world point');
assert.ok(heldDirection.angleTo(initialDirection) > 0.2,
  'gun hold does not lock the camera onto its previous point');
assert.ok(player.input.aimPoint.distanceTo(heldAim) < 1e-9,
  'the player and guided-fire input receive the live sight point');

rig.update(1 / 60, idle);
const releasedDirection = new Vector3();
camera.getWorldDirection(releasedDirection);
assert.ok(releasedDirection.angleTo(heldDirection) < 1e-9,
  'releasing gun hold leaves the camera at the current aim without snapping back');

console.log('cameraRig.selftest: live gun-hold sight and snap-free release passed');
