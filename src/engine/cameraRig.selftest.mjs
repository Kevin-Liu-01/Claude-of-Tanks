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

// Lobby observer entry must not reveal a Garage-to-battle flyover. Reuse the
// same spectator solver, but keep death/target-switch handovers unchanged.
{
  const observerCamera = new PerspectiveCamera();
  observerCamera.position.set(-1500, 10, -1500);
  const observerRoot = new Object3D();
  observerRoot.position.set(-1500, 0, -1500);
  observerRoot.updateMatrixWorld(true);
  observerRoot.position.set(20, 0, 12.5); // deliberately stale matrix
  const observed = {
    state: { pos: observerRoot.position.clone(), yaw: 0, turretYaw: 0 },
    input: { aimPoint: new Vector3() },
    visual: {
      root: observerRoot,
      turretTopWorld: out => out.set(0, 2, 0).applyMatrix4(observerRoot.matrixWorld),
      gunPivotWorld: out => out.set(0, 1.7, 0.2).applyMatrix4(observerRoot.matrixWorld),
    },
  };
  const observerRig = createCameraRig(observerCamera, {
    heightField: { getHeightAt: () => 0 }, raycast: () => null, getPlayer: () => null,
  });
  assert.equal(observerRig.snapSpectateForReveal(), false, 'no target cannot certify observer readiness');
  const garagePose = observerCamera.position.clone();
  observerRig.startSpectate(observed);
  assert.deepEqual(observerCamera.position.toArray(), garagePose.toArray(), 'ordinary start retains its visible blend');
  assert.equal(observerRig.snapSpectateForReveal(), true);
  assert.equal(observerCamera.position.x, 20, 'covered snap refreshes the moved target matrix');
  assert.ok(observerCamera.position.distanceTo(observed.state.pos) < 20);
  const revealed = observerCamera.position.clone();
  observerRig.update(1 / 60, idle);
  assert.ok(observerCamera.position.distanceTo(revealed) < 1e-9, 'first live frame cannot resume the old Garage blend');
  observerRig.stopSpectate();
  observerRig.startSpectate(observed);
  assert.deepEqual(observerCamera.position.toArray(), revealed.toArray(), 'later visible entry does not invoke the covered snap');
}

// death r1 (owner 2026-09-17: "if you die you should get kicked out of scope
// mode"): the rig itself leaves SNIPER the frame the player's tank is a wreck,
// before any presentation flow, and a wreck cannot scope back in.
{
  const wreckCamera = new PerspectiveCamera(60, 16 / 9, 0.1, 2000);
  const wreckRoot = new Object3D();
  wreckRoot.updateMatrixWorld(true);
  const wreck = {
    state: { pos: new Vector3(), yaw: 0.4, turretYaw: 0.1 },
    input: { aimPoint: new Vector3() },
    combat: { destroyed: false },
    visual: {
      root: wreckRoot,
      turretTopWorld: out => out.set(0, 2, 0).applyMatrix4(wreckRoot.matrixWorld),
      gunPivotWorld: out => out.set(0, 1.7, 0.2).applyMatrix4(wreckRoot.matrixWorld),
    },
  };
  const wreckRig = createCameraRig(wreckCamera, {
    heightField: { getHeightAt: () => 0 }, raycast: () => null, getPlayer: () => wreck,
  });
  wreckRig.snapArcade(3, 0.4, -0.1);
  wreckRig.enterSniper();
  wreckRig.update(1 / 60, idle);
  assert.equal(wreckRig.mode, 'SNIPER', 'alive: the scope holds through the update');
  assert.equal(wreckCamera.userData.scoped, true, 'alive: consumers see the scoped camera');
  const scopedFov = wreckCamera.fov;
  wreck.combat.destroyed = true;
  wreckRig.update(1 / 60, idle);
  assert.equal(wreckRig.mode, 'ARCADE', 'the frame the tank is a wreck the rig leaves the scope');
  assert.equal(wreckCamera.userData.scoped, false, 'consumers see the arcade camera the same frame');
  assert.ok(wreckCamera.fov > scopedFov + 1, 'the zoomed field of view is gone with the scope');
  wreckRig.enterSniper();
  assert.equal(wreckRig.mode, 'ARCADE', 'a wreck cannot scope back in');
  wreckRig.update(1 / 60, { ...idle, shiftPressed: true });
  wreckRig.update(1 / 60, idle);
  assert.equal(wreckRig.mode, 'ARCADE', 'the scope key is inert on a wreck');
  // the external killcam pose does not hide the rule: the guard runs first
  wreck.combat.destroyed = false;
  wreckRig.enterSniper();
  assert.equal(wreckRig.mode, 'SNIPER', 'a repaired/respawned tank scopes again');
  wreck.combat.destroyed = true;
  wreckRig.setExternalPose(new Vector3(10, 5, 10), new Vector3(), 42);
  wreckRig.update(1 / 60, idle);
  assert.equal(wreckRig.mode, 'ARCADE', 'dying under an external killcam pose still leaves the scope');
  wreckRig.release();
  wreckRig.update(1 / 60, idle);
  assert.equal(wreckRig.mode, 'ARCADE', 'and the released rig resumes in arcade');
  assert.equal(wreckCamera.userData.scoped, false);
}

visualRoot.position.set(-1500, 0, -1500);
visualRoot.updateMatrixWorld(true);
visualRoot.position.set(40, 0, -400);
rig.snapArcade(2, 0, -0.1);
assert.equal(camera.position.x, 40,
  'reveal snap samples the moved battle root instead of its stale Garage matrix');
assert.ok(camera.position.z < -410 && camera.position.z > -420,
  'reveal snap starts beside the battle spawn before the renderer traverses the scene');
camera.updateMatrixWorld(true);
const hullInFrame = visualRoot.position.clone().add(new Vector3(0, 1, 0)).project(camera);
const hullScreenFraction = (1 - hullInFrame.y) / 2;
assert.ok(hullScreenFraction > .60 && hullScreenFraction < .66,
  `chase hull stays in view above the bottom HUD (${hullScreenFraction})`);
assert.equal(camera.fov, 60, 'chase framing preserves the established field of view');
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

// Isometric is a presentation preference; aiming and scope still use the real rig.
{
  let enabled = true, wall = false;
  const camera = new PerspectiveCamera(60, 16 / 9, .1, 2000);
  const player = {state:{pos:new Vector3(),yaw:0,turretYaw:0,speed:0},
    spec:{dims:{heightM:2.4}},input:{aimPoint:new Vector3()},combat:{destroyed:false}};
  const ground = (origin, direction, max) => {
    const distance = -origin.y / direction.y;
    return distance > 0 && distance < max ? {point:origin.clone().addScaledVector(direction,distance),dist:distance,normal:new Vector3(0,1,0)} : null;
  };
  const rig = createCameraRig(camera,{heightField:{getHeightAt:()=>0},
    getPlayer:()=>player,getIsometricView:()=>enabled,aimRaycast:ground,
    raycast:(origin,direction)=>wall && direction.y < .95
      ? {point:origin.clone().addScaledVector(direction,10),dist:10,normal:new Vector3(0,1,0)} : null});
  const center = () => player.state.pos.clone().add(new Vector3(0,1.44,0));
  const projected = () => {camera.updateMatrixWorld(true);return center().project(camera);};
  const settle = () => {for(let i=0;i<180;i++)rig.update(1/60,idle);};
  rig.snapArcade(2,0,-.2);
  assert.equal(camera.fov,38,'covered battle reveal uses the saved overhead view');
  assert.ok(Math.abs(projected().x)<1e-6 && Math.abs(projected().y)<1e-6,'tank centered');
  const orientation = camera.quaternion.clone(), firstAim = rig.aimPoint.clone();
  rig.update(1/60,{...idle,mouseDX:-80,mouseDY:-20});
  assert.ok(rig.aimPoint.distanceTo(firstAim)>1,'mouse moves the actual sight ray');
  assert.ok(camera.quaternion.angleTo(orientation)<1e-6,'aiming does not spin the world');
  const rayOrigin=new Vector3(),rayDirection=new Vector3();rig.getAimRay(rayOrigin,rayDirection);
  assert.ok(rayDirection.angleTo(rig.aimPoint.clone().sub(rayOrigin))<1e-6,'public aim ray matches the reticle');
  const stillDistance=camera.position.distanceTo(center());
  player.state.speed=25;settle();
  assert.ok(camera.position.distanceTo(center())>stillDistance+10,'speed widens framing');
  player.state.pos.set(40,12,-15);rig.update(1/60,idle);
  assert.ok(Math.abs(projected().x)<1e-6 && Math.abs(projected().y)<1e-6,'movement and airtime remain centered');
  player.state.speed=0;settle();
  wall=true;rig.update(1/60,idle);
  assert.ok(camera.position.clone().sub(center()).normalize().y>.95,'obstruction raises overhead angle');
  wall=false;settle();
  for(const aspect of [568/256,320/568,16/9]){
    camera.aspect=aspect;camera.updateProjectionMatrix();settle();
    assert.ok(Math.abs(projected().x)<1e-6 && Math.abs(projected().y)<1e-6,'rotation keeps tank centered');
    assert.ok(camera.position.y>player.state.pos.y+25,'overhead terrain clearance');
  }
  for(let i=0;i<50;i++)rig.update(1/60,{...idle,wheel:3});
  assert.equal(rig.mode,'ARCADE','overhead zoom cannot accidentally enter sniper');
  assert.ok(camera.position.distanceTo(center())>35,'zoom is bounded outside the hull');
  rig.enterSniper();rig.update(1/60,idle);
  assert.equal(rig.mode,'SNIPER');assert.equal(camera.userData.scoped,true);
  rig.exitSniper(true);rig.update(1/60,idle);
  assert.equal(camera.fov,38,'scope exits back to overhead preference');
  assert.ok(Math.abs(projected().x)<1e-6 && Math.abs(projected().y)<1e-6);
  enabled=false;rig.update(1/60,idle);assert.equal(camera.fov,60,'toggle restores chase');
  enabled=true;rig.update(1/60,idle);assert.equal(camera.fov,38);
  rig.setExternalPose(new Vector3(1,50,2),new Vector3(),45);
  rig.update(1/60,{...idle,mouseDX:200});
  assert.deepEqual(camera.position.toArray(),[1,50,2],'replay and external camera owners retain control');
}
console.log('cameraRig.selftest: isometric framing, input, terrain, rotation, zoom and scope passed');

// A wall touching the chase pivot must pull the camera inward, never push it
// through the pivot and reverse the view while the player holds the mouse still.
{
  const camera = new PerspectiveCamera(60, 16 / 9, .1, 2000);
  const actor = { state: { pos: new Vector3(), yaw: 0, turretYaw: 0 },
    spec: { dims: { heightM: 2.4 } }, input: { aimPoint: new Vector3() } };
  const rig = createCameraRig(camera, {
    heightField: { getHeightAt: () => 0 }, getPlayer: () => actor,
    raycast: (origin, dir) => ({ point: origin.clone().addScaledVector(dir, .05),
      normal: new Vector3(0, 0, 1), dist: .05 }),
    aimRaycast: () => null,
  });
  rig.snapArcade(2, 0, -.1);
  assert.ok(camera.getWorldDirection(new Vector3()).z > .9,
    'near-wall collision padding cannot flip the chase view behind the tank');
  for (let frame = 0; frame < 90; frame++) {
    actor.state.pos.z += .25;
    rig.update(1 / 60, idle);
    assert.ok(camera.getWorldDirection(new Vector3()).z > 0,
      'driving past a touching wall without mouse input preserves view direction');
  }
}

// A camera-visible obstacle behind the gun must not become a backwards gun
// command. Deliberately aiming backwards still selects that same obstacle.
{
  const camera = new PerspectiveCamera(60, 16 / 9, .1, 2000);
  const actor = { state: { pos: new Vector3(), yaw: 0, turretYaw: 0 },
    spec: { dims: { heightM: 2.4 } }, input: { aimPoint: new Vector3() } };
  let planes = [-4, 20];
  const cast = (origin, dir, maxDist) => {
    let best = null;
    for (const z of planes) {
      const t = (z - origin.z) / dir.z;
      if (t >= 0 && t <= maxDist && (!best || t < best.dist))
        best = { point: origin.clone().addScaledVector(dir, t), dist: t, normal: new Vector3(0, 0, -1) };
    }
    return best;
  };
  const rig = createCameraRig(camera, { heightField: { getHeightAt: () => 0 },
    getPlayer: () => actor, raycast: () => null, aimRaycast: cast });
  rig.snapArcade(2, 0, -.1);
  assert.equal(actor.input.aimPoint.z, 20, 'the sight targets ahead of the gun, past a rear obstruction');
  for (let frame = 0; frame < 90; frame++) {
    actor.state.pos.z += .08;
    rig.update(1 / 60, idle);
    assert.equal(actor.input.aimPoint.z, 20, 'driving without mouse input never acquires rear cover');
  }
  rig.update(1 / 60, { ...idle, mouseDX: 1 });
  rig.enterSniper();
  rig.update(1 / 60, idle);
  assert.ok(camera.getWorldDirection(new Vector3()).z > 0,
    'scoping cannot latch the rear obstruction into a permanent backwards view');
  actor.state.pos.set(0, 0, 0);
  rig.snapArcade(2, Math.PI, -.1);
  assert.equal(actor.input.aimPoint.z, -4, 'intentional rear aiming remains available');
  rig.snapSniper(2, 0, -.1);
  assert.equal(actor.input.aimPoint.z, 20, 'sniper uses its unchanged gun-origin ray');
  planes = [1, 20];
  rig.snapArcade(2, 0, -.1);
  assert.equal(actor.input.aimPoint.z, 1, 'close cover ahead of the gun still stops the aiming ray');
}
console.log('cameraRig.selftest: close-wall and rear-obstruction aim stability passed');
