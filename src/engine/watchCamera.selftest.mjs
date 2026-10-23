// Watch mode's cameras (watch-mode-243): the drone's world clamp (terrain floor, structures, the square, the ceiling),
// its damped flight, and the ride-along's chase, sight, wreck hold and handovers.
import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { createWatchCamera, footprintGround, WATCH_DRONE, WATCH_RIDE } from './watchCamera.ts';

const DT = 1 / 60;
const idle = () => ({ moveForward: 0, moveRight: 0, moveUp: 0, lookDX: 0, lookDY: 0, boost: false, wheel: 0 });

// a hill at the origin and a 20 m building block at x ∈ [40, 60], z ∈ [-10, 10], 25 m tall
const heightField = { getHeightAt: (x, z) => 12 * Math.exp(-(x * x + z * z) / (2 * 30 * 30)) };
const BOX = { min: new Vector3(40, -5, -10), max: new Vector3(60, 25, 10) };
function rayBox(origin, dir, maxDist) {
  let tMin = 0, tMax = maxDist, axisHit = -1, sign = 0;
  for (const [i, k] of [[0, 'x'], [1, 'y'], [2, 'z']]) {
    const o = origin[k], d = dir[k], lo = BOX.min[k], hi = BOX.max[k];
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d, s = -1;
    if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1; }
    if (t1 > tMin) { tMin = t1; axisHit = i; sign = s; }
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  if (axisHit < 0) return null; // origin inside the box
  const normal = new Vector3();
  normal.setComponent(axisHit, sign);
  return { point: origin.clone().addScaledVector(dir, tMin), normal, dist: tMin, kind: 'structure' };
}
const inBox = (p, pad) => p.x > BOX.min.x - pad && p.x < BOX.max.x + pad && p.y > BOX.min.y - pad && p.y < BOX.max.y + pad
  && p.z > BOX.min.z - pad && p.z < BOX.max.z + pad;

function rig() {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 4000);
  const watch = createWatchCamera(camera, { heightField, raycast: rayBox });
  return { camera, watch };
}

// --- the floor: diving at boost into the hill never puts the lens under its footprint's ground + clearance
{
  const { camera, watch } = rig();
  watch.placeDrone(new Vector3(-80, 30, 0), Math.PI / 2, -0.6);
  let minClear = Infinity;
  for (let i = 0; i < 600; i++) {
    watch.update(DT, { ...idle(), moveForward: 1, moveUp: -1, boost: true, lookDY: i < 30 ? 4 : 0 });
    const p = watch.dronePosition;
    const clear = p.y - footprintGround(heightField, p.x, p.z, WATCH_DRONE.footprintM);
    minClear = Math.min(minClear, clear);
    assert.equal(camera.position.distanceTo(p), 0, 'the lens is the drone');
  }
  assert.ok(minClear >= WATCH_DRONE.floorClearanceM - 1e-6, `floor held (min clearance ${minClear.toFixed(3)} m)`);
}

// --- structures: straight at the block at boost, and diagonally (the move slides along the face)
{
  const { watch } = rig();
  watch.placeDrone(new Vector3(0, 15, 0), Math.PI / 2, 0); // yaw π/2 looks down +X
  for (let i = 0; i < 400; i++) {
    watch.update(DT, { ...idle(), moveForward: 1, boost: true });
    assert.ok(!inBox(watch.dronePosition, 0.5), `never inside the block (frame ${i}, x ${watch.dronePosition.x.toFixed(2)})`);
  }
  assert.ok(watch.dronePosition.x > 30 && watch.dronePosition.x < BOX.min.x, 'stopped at the face');
  assert.ok(Math.abs(watch.droneVelocity.x) < 1, 'speed into the face is taken out');

  const slide = rig().watch;
  slide.placeDrone(new Vector3(20, 15, -4), Math.PI / 2, 0);
  for (let i = 0; i < 240; i++) {
    slide.update(DT, { ...idle(), moveForward: 1, moveRight: 1 }); // forward (+X) and screen-right (+Z): into the face, along it
    assert.ok(!inBox(slide.dronePosition, 0.5), 'the slide stays outside');
  }
  assert.ok(slide.dronePosition.z > 10, `the drone slid along the face past its edge (z ${slide.dronePosition.z.toFixed(1)})`);
}

// --- the square and the ceiling
{
  const { watch } = rig();
  watch.placeDrone(new Vector3(400, 40, 0), Math.PI / 2, 0);
  for (let i = 0; i < 900; i++) watch.update(DT, { ...idle(), moveForward: 1, moveUp: 1, boost: true });
  const p = watch.dronePosition;
  assert.ok(p.x <= WATCH_DRONE.halfExtentM + 1e-9, 'kept to the square');
  const ceiling = Math.min(WATCH_DRONE.ceilingM, heightField.getHeightAt(p.x, p.z) + WATCH_DRONE.ceilingAboveGroundM);
  assert.ok(p.y <= ceiling + 1e-9 && p.y > ceiling - 1, `held at the ceiling (${p.y.toFixed(1)} of ${ceiling.toFixed(1)})`);
}

// --- flight feel: the stick eases in and the drone glides out, the wheel steps cruise speed
{
  const { watch } = rig();
  watch.placeDrone(new Vector3(-200, 60, -200), 0, 0);
  watch.update(DT, { ...idle(), moveForward: 1 });
  const cruise = WATCH_DRONE.speeds[WATCH_DRONE.speedIndex];
  const first = watch.droneVelocity.length();
  assert.ok(first > 0 && first < cruise * 0.2, 'no instant full speed');
  for (let i = 0; i < 120; i++) watch.update(DT, { ...idle(), moveForward: 1 });
  assert.ok(Math.abs(watch.droneVelocity.length() - cruise) < 0.5, 'settles at cruise');
  watch.update(DT, idle());
  assert.ok(watch.droneVelocity.length() > cruise * 0.9, 'release glides, never a dead stop');
  for (let i = 0; i < 240; i++) watch.update(DT, idle());
  assert.ok(watch.droneVelocity.length() < 0.05, 'and settles');
  watch.update(DT, { ...idle(), wheel: 1 });
  assert.equal(watch.speedIndex, WATCH_DRONE.speedIndex + 1, 'the wheel steps the cruise speed');
  for (let i = 0; i < 20; i++) watch.update(DT, { ...idle(), wheel: -1 });
  assert.equal(watch.speedIndex, 0, 'and clamps at the slowest');
}

// --- ride-along: the blend starts where the drone was, lands behind the gunner's lay, follows a new lay
function tank(x, z) {
  const root = new Object3D();
  root.position.set(x, heightField.getHeightAt(x, z), z);
  root.updateMatrixWorld(true);
  const ent = {
    state: { pos: root.position.clone(), yaw: 0, turretYaw: 0 },
    input: { aimPoint: new Vector3(x, root.position.y + 2, z + 300) },
    combat: { destroyed: false },
    visual: {
      root,
      turretTopWorld: (out) => out.set(0, 2.4, 0).applyMatrix4(root.matrixWorld),
      gunPivotWorld: (out) => out.set(0, 2.0, 0.6).applyMatrix4(root.matrixWorld),
    },
  };
  return ent;
}
{
  const { camera, watch } = rig();
  watch.placeDrone(new Vector3(-150, 80, -150), 0.6, -0.4);
  const start = camera.position.clone();
  const a = tank(-100, 120);
  watch.ride(a);
  watch.update(DT, idle());
  assert.ok(camera.position.distanceTo(start) < 2, 'the handover opens on the drone pose (no cut)');
  let maxStep = 0, prev = camera.position.clone();
  for (let i = 0; i < 200; i++) {
    watch.update(DT, idle());
    maxStep = Math.max(maxStep, camera.position.distanceTo(prev));
    prev.copy(camera.position);
  }
  assert.ok(!watch.blending, 'the blend completes');
  assert.ok(maxStep < 4, `a continuous move (largest frame step ${maxStep.toFixed(2)} m)`);
  const pivot = a.visual.turretTopWorld(new Vector3()); pivot.y += WATCH_RIDE.pivotAboveTurretM;
  const behind = camera.position.clone().sub(pivot);
  assert.ok(Math.abs(behind.length() - WATCH_RIDE.orbitSteps[WATCH_RIDE.orbitIndex]) < 1.2, 'on the default orbit step');
  assert.ok(behind.z < -10, 'behind the gun (the lay looks down +Z)');

  // the gunner lays left (+X): the chase swings round behind the new lay
  a.input.aimPoint.set(a.state.pos.x + 300, a.state.pos.y + 2, a.state.pos.z);
  for (let i = 0; i < 120; i++) watch.update(DT, idle());
  const swung = camera.position.clone().sub(pivot);
  assert.ok(swung.x < -10, 'follows the lay');

  // free look offsets the view and eases back once still
  watch.update(DT, { ...idle(), lookDX: 700 });
  for (let i = 0; i < 20; i++) watch.update(DT, idle());
  const looked = camera.position.clone().sub(pivot);
  assert.ok(looked.distanceTo(swung) > 5, 'free look orbits');
  for (let i = 0; i < 400; i++) watch.update(DT, idle());
  assert.ok(camera.position.clone().sub(pivot).distanceTo(swung) < 1, 'and returns behind the gun');

  // the sight: the wheel in past the last step, the hull hidden, the lens at the gun; out again restores it
  for (let i = 0; i < 6; i++) watch.update(DT, { ...idle(), wheel: 1 });
  assert.equal(watch.sight, true, 'wheel in past the closest step opens the sight');
  for (let i = 0; i < 30; i++) watch.update(DT, idle());
  const gun = a.visual.gunPivotWorld(new Vector3());
  assert.ok(camera.position.distanceTo(gun) < 1e-6, 'the lens sits at the gun');
  assert.equal(a.visual.root.visible, false, 'own hull hidden in the sight');
  assert.equal(camera.fov, WATCH_RIDE.fovDeg / watch.zoom, 'sight FOV');
  for (let i = 0; i < 6; i++) watch.update(DT, { ...idle(), wheel: -1 });
  assert.equal(watch.sight, false, 'wheel out closes the sight');
  watch.update(DT, idle());
  assert.equal(a.visual.root.visible, true, 'hull shown again');

  // tank to tank: a blend from the first chase
  const b = tank(60, -120);
  const before = camera.position.clone();
  watch.ride(b);
  watch.update(DT, idle());
  assert.ok(camera.position.distanceTo(before) < 2, 'tank-to-tank opens on the old chase');
  for (let i = 0; i < 200; i++) watch.update(DT, idle());
  assert.equal(watch.target, b);

  // the wreck hold: the sight closes, the camera orbits the wreck
  watch.setSight(true);
  b.combat.destroyed = true;
  watch.update(DT, idle());
  assert.equal(watch.sight, false, 'a wreck closes the sight');
  const w0 = camera.position.clone();
  for (let i = 0; i < 120; i++) watch.update(DT, idle());
  assert.ok(camera.position.distanceTo(w0) > 1, 'the wreck orbit moves');
  assert.equal(b.visual.root.visible, true, 'the wreck is shown');

  // leaving to the drone: the drone takes the camera pose and lifts off
  const exitPose = camera.position.clone();
  watch.startDrone(true);
  assert.equal(watch.mode, 'drone');
  assert.ok(watch.dronePosition.distanceTo(exitPose) < 1e-6, 'the drone starts on the chase pose');
  assert.ok(watch.droneVelocity.y > 0, 'with a lift-off');
  watch.update(DT, idle());
  assert.ok(camera.position.distanceTo(exitPose) < 0.5, 'no cut on leaving');
  watch.stop();
  assert.equal(watch.update(DT, idle()), false, 'stopped: the rig owns the camera again');
}

console.log('watchCamera selftest: PASS');
