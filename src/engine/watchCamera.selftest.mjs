// Watch mode's cameras (watch-mode-243; the spectator drone's flight, watch-drone-244): the drone's world clamp (a hard
// floor, a terrain-follow floor ahead of it, structures, soft edges and ceiling), its flight (two-lag momentum, altitude
// hold, speed by height), its lock-on orbit, and the ride-along's chase, sight, wreck hold and handovers.
import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import { createWatchCamera, droneHeightScale, footprintGround, WATCH_DRONE, WATCH_RIDE } from './watchCamera.ts';

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
  assert.ok(minClear >= WATCH_DRONE.hardClearanceM - 1e-6, `the hard floor never gives (min clearance ${minClear.toFixed(3)} m)`);
}

// --- terrain follow: cruising level and low at the hill, the drone rises before the rise, clears it, settles back
{
  const { watch } = rig();
  const lane = -25; // clear of the block; the hill's crest on this line
  const crest = heightField.getHeightAt(0, lane);
  watch.placeDrone(new Vector3(-150, 6, lane), Math.PI / 2, 0); // 6 m over flat ground, the hill ahead
  let minClear = Infinity, peak = 0, risenBefore = false;
  for (let i = 0; i < 60 * 14; i++) {
    watch.update(DT, { ...idle(), moveForward: 1, boost: true });
    const p = watch.dronePosition;
    const clear = p.y - footprintGround(heightField, p.x, p.z, WATCH_DRONE.footprintM);
    minClear = Math.min(minClear, clear);
    peak = Math.max(peak, p.y);
    // already climbing where the floor under it alone would not lift it (the floor looks ahead)
    if (p.x < 0 && footprintGround(heightField, p.x, p.z, WATCH_DRONE.footprintM) + WATCH_DRONE.floorClearanceM < 6 && p.y > 6.5) risenBefore = true;
  }
  assert.ok(risenBefore, 'the floor looks ahead: the drone starts up before the slope');
  assert.ok(minClear > WATCH_DRONE.floorClearanceM * 0.6, `it follows the rise with room (min clearance ${minClear.toFixed(2)} m)`);
  assert.ok(peak > crest + WATCH_DRONE.floorClearanceM * 0.6, `and clears the crest (${peak.toFixed(1)} m over ${crest.toFixed(1)} m)`);
  assert.ok(Math.abs(watch.dronePosition.y - 6) < 1, `then settles back to the height it was flown at (${watch.dronePosition.y.toFixed(2)} m)`);
}

// --- altitude hold: climbed and let go, the drone keeps its height while it flies on
{
  const { watch } = rig();
  watch.placeDrone(new Vector3(-300, 20, -300), 0, 0);
  for (let i = 0; i < 90; i++) watch.update(DT, { ...idle(), moveUp: 1 });
  const released = watch.dronePosition.y;
  let over = 0;
  for (let i = 0; i < 90; i++) { watch.update(DT, idle()); over = Math.max(over, watch.dronePosition.y - released); }
  const held = watch.dronePosition.y;
  assert.ok(over < 3 && held >= released, `a released climb coasts to a stop, it does not sink back (${over.toFixed(2)} m over)`);
  let drift = 0;
  for (let i = 0; i < 300; i++) {
    watch.update(DT, { ...idle(), moveForward: 1, moveRight: i < 150 ? 0.5 : -0.5 });
    drift = Math.max(drift, Math.abs(watch.dronePosition.y - held));
  }
  assert.ok(held > 30, 'it climbed');
  assert.ok(drift < 0.5, `held its height in flight (drift ${drift.toFixed(3)} m)`);
}

// --- speed by height: the same stick cruises slower low, faster high
{
  const settle = (y) => {
    const { watch } = rig();
    watch.placeDrone(new Vector3(-300, y, -300), 0, 0);
    for (let i = 0; i < 240; i++) watch.update(DT, { ...idle(), moveForward: 1 });
    return Math.hypot(watch.droneVelocity.x, watch.droneVelocity.z);
  };
  const low = settle(4), high = settle(120);
  assert.ok(high > low * 2.5, `higher is faster (${low.toFixed(1)} m/s at 4 m, ${high.toFixed(1)} m/s at 120 m)`);
  assert.ok(Math.abs(high - WATCH_DRONE.speeds[WATCH_DRONE.speedIndex] * droneHeightScale(120)) < 1, 'by the height law');
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

// --- the square and the ceiling: approached at boost, they slow the drone down rather than stop it dead
{
  const { watch } = rig();
  watch.placeDrone(new Vector3(400, 40, 0), Math.PI / 2, 0);
  let maxJolt = 0;
  const v0 = new Vector3();
  for (let i = 0; i < 900; i++) {
    v0.copy(watch.droneVelocity);
    watch.update(DT, { ...idle(), moveForward: 1, moveUp: 1, boost: true });
    if (i > 10) maxJolt = Math.max(maxJolt, watch.droneVelocity.distanceTo(v0));
  }
  const p = watch.dronePosition;
  assert.ok(maxJolt < 8, `no dead stop at an edge (largest speed change in a frame ${maxJolt.toFixed(2)} m/s)`);
  assert.ok(p.x <= WATCH_DRONE.halfExtentM + 1e-9, 'kept to the square');
  const ceiling = Math.min(WATCH_DRONE.ceilingM, heightField.getHeightAt(p.x, p.z) + WATCH_DRONE.ceilingAboveGroundM);
  assert.ok(p.y <= ceiling + 1e-9 && p.y > ceiling - 1, `held at the ceiling (${p.y.toFixed(1)} of ${ceiling.toFixed(1)})`);
}

// --- flight feel: the stick eases in and the drone glides out, the wheel steps cruise speed
{
  const { watch } = rig();
  watch.placeDrone(new Vector3(-200, 60, -200), 0, 0);
  const cruise = WATCH_DRONE.speeds[WATCH_DRONE.speedIndex] * droneHeightScale(60);
  const speeds = [];
  for (let i = 0; i < 4; i++) { watch.update(DT, { ...idle(), moveForward: 1 }); speeds.push(watch.droneVelocity.length()); }
  assert.ok(speeds[0] > 0 && speeds[0] < cruise * 0.02, 'no instant speed');
  assert.ok(speeds[2] - speeds[1] > speeds[1] - speeds[0], 'the push builds (no jolt on the press)');
  for (let i = 0; i < 180; i++) watch.update(DT, { ...idle(), moveForward: 1 });
  assert.ok(Math.abs(watch.droneVelocity.length() - cruise) < 0.5, `settles at cruise (${watch.droneVelocity.length().toFixed(2)} of ${cruise.toFixed(2)})`);
  watch.update(DT, idle());
  assert.ok(watch.droneVelocity.length() > cruise * 0.9, 'release glides, never a dead stop');
  for (let i = 0; i < 360; i++) watch.update(DT, idle());
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
      // the bore: along +Z, wherever the gunner's aim point is (the turret lags the lay)
      gunDirWorld: (out) => out.set(0, 0, 1),
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
  const bore = camera.getWorldDirection(new Vector3());
  assert.ok(bore.z > 0.99, `the sight is slaved to the gun, not the lay (${bore.toArray().map((v) => v.toFixed(2))})`);
  for (let i = 0; i < 6; i++) watch.update(DT, { ...idle(), wheel: -1 });
  assert.equal(watch.sight, false, 'wheel out closes the sight');
  watch.update(DT, idle());
  assert.equal(a.visual.root.visible, true, 'hull shown again');

  // tank to tank: a blend from the first chase; the lens turns onto the new tank and never stares at the ground under it
  const b = tank(60, -120);
  const before = camera.position.clone();
  watch.ride(b);
  watch.update(DT, idle());
  assert.ok(camera.position.distanceTo(before) < 2, 'tank-to-tank opens on the old chase');
  const look = new Vector3(), toB = new Vector3();
  let steepest = 1, lastFacing = -1;
  for (let i = 0; i < 200; i++) {
    watch.update(DT, idle());
    camera.getWorldDirection(look);
    steepest = Math.min(steepest, look.y);
    if (watch.blendProgress > 0.6 && watch.blending) {
      toB.copy(b.state.pos).sub(camera.position).normalize();
      lastFacing = look.dot(toB);
    }
  }
  assert.ok(steepest > -0.75, `the hop never looks straight down (steepest look ${steepest.toFixed(2)})`);
  assert.ok(lastFacing > 0.85, `past the lead the lens faces the new tank (${lastFacing.toFixed(2)})`);
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

// --- lock-on orbit: on a moving tank the lock is continuous, the lens holds the tank, the stick orbits it, letting go
// flies on; a tank that jumps across the field (a revive) lets the lock go
{
  const { camera, watch } = rig();
  const t = tank(-250, -250);
  watch.placeDrone(new Vector3(-250, 40, -300), 0.2, -0.2);
  for (let i = 0; i < 10; i++) watch.update(DT, idle());
  const before = camera.position.clone();
  const fwd = new Vector3();
  camera.getWorldDirection(fwd);
  watch.lock(t);
  assert.equal(watch.lockTarget, t, 'locked');
  let maxStep = 0, maxTurn = 0;
  const prev = camera.position.clone(), prevDir = fwd.clone(), dir = new Vector3(), toTank = new Vector3(), pivot = new Vector3();
  for (let i = 0; i < 60 * 6; i++) {
    // the tank drives on at 8 m/s
    t.visual.root.position.x += 8 * DT;
    t.visual.root.position.y = heightField.getHeightAt(t.visual.root.position.x, t.visual.root.position.z);
    t.visual.root.updateMatrixWorld(true);
    t.state.pos.copy(t.visual.root.position);
    watch.update(DT, idle());
    maxStep = Math.max(maxStep, camera.position.distanceTo(prev));
    camera.getWorldDirection(dir);
    maxTurn = Math.max(maxTurn, dir.angleTo(prevDir));
    prev.copy(camera.position);
    prevDir.copy(dir);
  }
  assert.ok(before.distanceTo(prev) > 0, 'it flies');
  assert.ok(maxStep < 1.2, `no jump on locking or following (largest frame step ${maxStep.toFixed(2)} m)`);
  assert.ok(maxTurn < 0.06, `no snap of the lens (largest frame turn ${maxTurn.toFixed(3)} rad)`);
  t.visual.turretTopWorld(pivot);
  toTank.copy(pivot).sub(camera.position).normalize();
  camera.getWorldDirection(dir);
  assert.ok(dir.angleTo(toTank) < 0.08, `the lens holds the tank (${dir.angleTo(toTank).toFixed(3)} rad off)`);
  const range = camera.position.distanceTo(pivot);
  assert.ok(Math.abs(range - Math.hypot(0, 40 - pivot.y, 50)) < 12, `at the range it locked from (${range.toFixed(1)} m)`);
  // the stick goes round
  const az = (p) => Math.atan2(p.x - pivot.x, p.z - pivot.z);
  const az0 = az(camera.position);
  for (let i = 0; i < 120; i++) watch.update(DT, { ...idle(), moveRight: 1 });
  assert.ok(Math.abs(az(camera.position) - az0) > 0.2, 'sideways orbits the tank');
  const rangeBefore = camera.position.distanceTo(pivot);
  for (let i = 0; i < 120; i++) watch.update(DT, { ...idle(), moveForward: 1 });
  assert.ok(camera.position.distanceTo(pivot) < rangeBefore - 3, 'forward closes in');
  // letting go flies on from the orbit's pose, no cut
  const at = camera.position.clone();
  watch.lock(null);
  assert.equal(watch.lockTarget, null, 'let go');
  watch.update(DT, idle());
  assert.ok(camera.position.distanceTo(at) < 1, 'letting go is continuous');
  // a lock from far away streams its slot ahead of the flight (perf-245's warm); a near one does not
  {
    const calls = [];
    const camera2 = new PerspectiveCamera(60, 16 / 9, 0.1, 4000);
    const far = createWatchCamera(camera2, { heightField, raycast: rayBox, prepareDestination: (p, l, s) => calls.push([p.clone(), l.clone(), s]) });
    far.placeDrone(new Vector3(-250, 120, 200), 0, 0);
    far.lock(t);
    assert.equal(calls.length, 1, 'a far lock asks for its slot once');
    assert.ok(calls[0][2] >= 0.5 && calls[0][0].distanceTo(t.state.pos) <= WATCH_DRONE.orbitMaxM + 10, 'the slot on the orbit, with a flight time');
    far.lock(null);
    far.placeDrone(t.state.pos.clone().add(new Vector3(0, 20, -30)), 0, 0);
    far.lock(t);
    assert.equal(calls.length, 1, 'a near lock needs no warm');
  }
  // a hop streams its destination from its first frame: the chase pose behind the tank, over the blend
  {
    const calls = [];
    const camera3 = new PerspectiveCamera(60, 16 / 9, 0.1, 4000);
    const hop = createWatchCamera(camera3, { heightField, raycast: rayBox, prepareDestination: (p, l, s) => calls.push([p.clone(), l.clone(), s]) });
    hop.placeDrone(new Vector3(-250, 120, 200), 0, 0);
    hop.ride(t);
    assert.equal(calls.length, 1, 'the hop asks for its destination once, as it starts');
    assert.ok(calls[0][2] >= 1 && calls[0][0].distanceTo(t.state.pos) < WATCH_RIDE.orbitSteps[WATCH_RIDE.orbitIndex] + 4,
      'behind the tank at the orbit step, for the blend\'s time');
  }
  // a revive across the field lets the lock go
  watch.lock(t);
  for (let i = 0; i < 30; i++) watch.update(DT, idle());
  t.visual.root.position.set(200, heightField.getHeightAt(200, 200), 200);
  t.visual.root.updateMatrixWorld(true);
  t.state.pos.copy(t.visual.root.position);
  const was = camera.position.clone();
  watch.update(DT, idle());
  assert.equal(watch.lockTarget, null, 'a tank that jumps across the field lets the lock go');
  assert.ok(camera.position.distanceTo(was) < 2, 'and the drone does not chase it');
}

console.log('watchCamera selftest: PASS');
