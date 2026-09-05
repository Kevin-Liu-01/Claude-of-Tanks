import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { createCameraRig } from './cameraRig.ts';
import { createInput } from '../game/input.ts';
import { minimapAngleForDirection, normalizeMinimapAngle } from '../ui/minimapOrientation.ts';

const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 2000);
const visualRoot = new Object3D();
const turretAnchor = new Vector3(0, 2, 0);
const gunAnchor = new Vector3(0, 1.7, 0.2);
const player = {
  state: { pos: new Vector3(0, 0, 0), yaw: 0, turretYaw: 0 },
  input: { aimPoint: new Vector3() },
  visual: {
    root: visualRoot,
    turretTopWorld(out) { return out.copy(turretAnchor).applyMatrix4(visualRoot.matrixWorld); },
    gunPivotWorld(out) { return out.copy(gunAnchor).applyMatrix4(visualRoot.matrixWorld); },
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

visualRoot.position.set(-1500, 0, -1500);
visualRoot.updateMatrixWorld(true);
visualRoot.position.set(40, 0, -400);
rig.snapArcade(2, 0, -0.1);
assert.equal(camera.position.x, 40,
  'reveal snap samples the moved battle root instead of its stale Garage matrix');
assert.ok(camera.position.z < -410 && camera.position.z > -420,
  'reveal snap starts beside the battle spawn before the renderer traverses the scene');
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

// Exercise the real mouse accumulator, not a hard-coded yaw sign. The normal
// rig accepts world-yaw deltas from consumeMouseDelta; spectateLook instead
// accepts raw screen pixels from killcam's locked/unlocked cursor handler.
const savedGlobals = new Map(['window', 'document', 'localStorage'].map(
  (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const inputWindow = new EventTarget();
const inputDocument = new EventTarget();
const lockElement = {};
inputDocument.pointerLockElement = lockElement;
for (const [key, value] of Object.entries({
  window: inputWindow,
  document: inputDocument,
  localStorage: { getItem: () => null, setItem() {} },
})) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

try {
  const input = createInput({ lockElement });
  input.setSetting('aimSmoothing', 0);
  input.setSetting('sensitivity', 1);
  input.setSetting('sniperSensScale', 1);
  const mouse = { x: 0, y: 0 };
  const beforeDirection = new Vector3();
  const afterDirection = new Vector3();
  const screenRight = new Vector3();
  visualRoot.position.set(0, 0, 0);

  function assertTurn(mode, heading, pixelSign) {
    const label = `${mode}, heading ${heading}, mouse-${pixelSign > 0 ? 'right' : 'left'}`;
    camera.getWorldDirection(beforeDirection);
    screenRight.setFromMatrixColumn(camera.matrixWorld, 0);
    const beforeAngle = minimapAngleForDirection(beforeDirection.x, beforeDirection.z);
    const rawDX = pixelSign * 100;

    if (mode === 'spectator') {
      rig.spectateLook(rawDX, 0);
      // Spectator yaw eases toward the target. Settle without wall-clock time.
      for (let frame = 0; frame < 120; frame++) rig.update(1 / 60, idle);
    } else {
      inputWindow.dispatchEvent(Object.assign(new Event('mousemove'), {
        movementX: rawDX, movementY: 0, clientX: 500 + rawDX, clientY: 300,
      }));
      input.consumeMouseDelta(mouse, 1 / 60, mode === 'sniper');
      assert.ok(mouse.x * pixelSign < 0,
        `${label}: raw screen pixels become the opposite-signed world-yaw delta`);
      rig.update(1 / 60, {
        ...idle, mouseDX: mouse.x, mouseDY: mouse.y, rmb: mode === 'gun-hold',
      });
    }

    camera.getWorldDirection(afterDirection);
    assert.ok(afterDirection.dot(screenRight) * pixelSign > 0.001,
      `${label}: the actual camera turns toward the corresponding screen side`);
    const afterAngle = minimapAngleForDirection(afterDirection.x, afterDirection.z);
    const turn = normalizeMinimapAngle(afterAngle - beforeAngle);
    // A right turn is CLOCKWISE on a fixed north-up map at every heading.
    // Endpoint x alone is misleading: when facing map-down it moves left.
    assert.ok(turn * pixelSign > 0.001 && turn * pixelSign < Math.PI / 2,
      `${label}: the fixed-map view cone follows camera handedness across angle wrap`);
  }

  for (const mode of ['arcade', 'gun-hold', 'sniper', 'spectator']) {
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      for (const pixelSign of [1, -1]) {
        player.state.yaw = heading;
        rig.snapArcade(2, heading, -0.1);
        if (mode === 'sniper') rig.snapSniper(4, heading, -0.1);
        if (mode === 'spectator') {
          rig.startSpectate(player);
          for (let frame = 0; frame < 120; frame++) rig.update(1 / 60, idle);
        }
        assertTurn(mode, heading, pixelSign);
      }
    }
  }
} finally {
  for (const [key, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

console.log('cameraRig.selftest: live gun-hold sight, snap-free release, and mouse/minimap handedness passed');
