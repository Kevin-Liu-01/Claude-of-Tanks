// 2026-11-02 audit F7: the battle camera has one owner (external | spectate | death | cinematic | player), entered
// through one function that runs the leaving owner's teardown. Before it, six fields encoded the owner:
// startSpectate / startDeathCam / startCinematic left an external pose set (the camera froze unless every caller
// released first), an aerial takeover dropped the flyby without its letterbox, and a Shift held through a replay came
// back as a rising edge that scoped in on the first player frame.
import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { createCameraRig } from './cameraRig.ts';

// the letterbox is a DOM element: a minimal document records its display
const letterbox = { style: { display: '' }, className: '' };
globalThis.document = {
  createElement: () => letterbox,
  body: { appendChild() {}, classList: { contains: () => false } },
};

function entity(x = 0, z = 0) {
  const root = new Object3D();
  root.position.set(x, 0, z);
  root.updateMatrixWorld(true);
  return {
    state: { pos: root.position.clone(), yaw: 0.3, turretYaw: 0 },
    input: { aimPoint: new Vector3() },
    combat: { destroyed: false },
    aerial: null,
    visual: {
      root,
      turretTopWorld: (out) => out.set(0, 2, 0).applyMatrix4(root.matrixWorld),
      gunPivotWorld: (out) => out.set(0, 1.7, 0.2).applyMatrix4(root.matrixWorld),
    },
  };
}
const idle = { mouseDX: 0, mouseDY: 0, wheel: 0, rmb: false, shiftPressed: false };

function setup() {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 2000);
  const player = entity();
  const rig = createCameraRig(camera, {
    heightField: { getHeightAt: () => 0 }, raycast: () => null, getPlayer: () => player,
  });
  rig.snapArcade(2, 0.3, -0.1);
  rig.update(1 / 60, idle);
  return { camera, player, rig };
}
const pinned = new Vector3(60, 30, 60);
const pinnedLook = new Vector3(0, 0, 0);

// an external pose (a replay, an ending beat) and then the spectate chase, with no release in between
{
  const { camera, rig } = setup();
  rig.setExternalPose(pinned, pinnedLook, 42);
  assert.equal(rig.externalActive, true);
  const ally = entity(30, 30);
  rig.startSpectate(ally);
  assert.equal(rig.externalActive, false, 'entering spectate ends the external pose');
  assert.equal(rig.cameraOwner, 'spectate');
  for (let i = 0; i < 90; i++) rig.update(1 / 60, idle);
  assert.ok(camera.position.distanceTo(pinned) > 5, 'the spectate chase moves the camera (it froze on the external pose)');
}

// an external pose and then the death orbit, with no release in between
{
  const { camera, rig } = setup();
  rig.setExternalPose(pinned, pinnedLook, 42);
  rig.startDeathCam();
  assert.equal(rig.cameraOwner, 'death');
  assert.equal(rig.externalActive, false, 'entering the death cam ends the external pose');
  rig.update(1 / 60, idle);
  const first = camera.position.clone();
  for (let i = 0; i < 60; i++) rig.update(1 / 60, idle);
  assert.ok(camera.position.distanceTo(first) > 0.1, 'the death orbit turns');
  assert.ok(camera.position.distanceTo(pinned) > 5);
}

// an external pose and then the flyby: the flyby owns the camera and its letterbox
{
  const { rig } = setup();
  rig.setExternalPose(pinned, pinnedLook, 42);
  rig.startCinematic(4);
  assert.equal(rig.cameraOwner, 'cinematic');
  assert.equal(rig.externalActive, false);
  assert.equal(rig.cinematicActive, true);
  assert.equal(letterbox.style.display, 'block');
  rig.setExternalPose(pinned, pinnedLook, 42);
  assert.equal(rig.cinematicActive, false);
  assert.equal(letterbox.style.display, 'none', 'an external pose tears the flyby down with its letterbox');
  rig.release();
  assert.equal(rig.cameraOwner, 'player');
}

// an aerial takeover during the flyby runs the flyby's teardown: no letterbox over the flight
{
  const { player, rig } = setup();
  rig.startCinematic(4);
  rig.update(1 / 60, idle);
  assert.equal(letterbox.style.display, 'block');
  player.aerial = { active: true, kind: 'drone', x: 0, y: 20, z: 0, yaw: 0, launching: false };
  rig.update(1 / 60, idle);
  assert.equal(rig.cinematicActive, false, 'the flight ends the flyby');
  assert.equal(letterbox.style.display, 'none', 'and its letterbox: the HUD does not come back under the bars');
  assert.equal(rig.cameraOwner, 'player');
}

// a Shift held through a replay is not a rising edge when the player gets the camera back
{
  const { rig } = setup();
  rig.update(1 / 60, idle); // Shift up while the player drives
  rig.setExternalPose(pinned, pinnedLook, 42); // the replay
  rig.update(1 / 60, { ...idle, shiftPressed: true }); // the player holds Shift through it
  rig.release();
  rig.update(1 / 60, { ...idle, shiftPressed: true });
  assert.equal(rig.mode, 'ARCADE', 'a held Shift does not scope in on the first frame back');
  rig.update(1 / 60, idle);
  rig.update(1 / 60, { ...idle, shiftPressed: true });
  assert.equal(rig.mode, 'SNIPER', 'a fresh press scopes in as before');
  // and after a deterministic snap
  rig.snapArcade(2, 0.3, -0.1);
  rig.update(1 / 60, { ...idle, shiftPressed: true });
  assert.equal(rig.mode, 'ARCADE', 'a held Shift does not scope in on the first frame after a snap');
}

// the public mirror cannot disagree with the owner
{
  const { rig } = setup();
  rig.setExternalPose(pinned, pinnedLook, 42);
  assert.equal(rig.externalActive, true);
  assert.throws(() => { 'use strict'; rig.externalActive = false; }, TypeError, 'externalActive is read from the owner');
  rig.stopSpectate(); // not the owner: nothing changes
  assert.equal(rig.cameraOwner, 'external');
  rig.release();
  assert.equal(rig.externalActive, false);
}

console.log('cameraRigOwner.selftest: spectate, death cam and flyby end an external pose, the flight ends the flyby with its letterbox, a held Shift re-arms, externalActive mirrors the owner pass');
