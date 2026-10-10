import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getSpec } from './specs.ts';
import { createWreckTurretDriver } from './wreckTurretDriver.ts';
import { createWreckEnvironment, createWreckTurrets, wreckTurretProfile } from '../sim/wreckTurrets.ts';

// The physics lane (2026-10-10): the drawn turret of a wreck follows its rigid body — the simulation's pose when an
// authority offers one, a local body of the same engine in a composition, and the authority's motion carried on when it
// goes quiet mid-flight (a killcam freezes the simulation) — never a table pose, never a jump.

const spec = getSpec('m1a2');
const profile = wreckTurretProfile(spec);
const GROUND = 2;

function rig(yaw = 0.4, turretYaw = 0.3) {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.position.set(50, GROUND, -20);
  root.rotation.set(0, yaw, 0, 'YXZ');
  const turret = new THREE.Group();
  turret.position.set(profile.pivot[0], profile.pivot[1], profile.pivot[2]);
  turret.rotation.y = turretYaw;
  const gun = new THREE.Group();
  gun.rotation.x = -0.05;
  turret.add(gun);
  root.add(turret);
  scene.add(root);
  return { scene, root, turret, gun };
}
function drawnFrame(turret) {
  turret.updateWorldMatrix(true, false);
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  turret.matrixWorld.decompose(p, q, s);
  return { p, q, s };
}
function driverFor(r, landings = []) {
  let seed = 7;
  return createWreckTurretDriver({
    spec, root: r.root, turret: r.turret, gun: r.gun,
    ground: () => () => GROUND,
    random: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; },
    trail() {},
    landing: (x, y, z, speed) => landings.push({ x, y, z, speed }),
  });
}

// --- a composition: the local body throws the turret, it lands and rests; no frame jumps more than a step's travel
{
  const r = rig();
  const landings = [];
  const driver = driverFor(r, landings);
  assert.equal(driver.drives, true);
  const seat = r.turret.position.clone();
  const start = drawnFrame(r.turret).p.clone();
  driver.begin(true, seat, 0);
  let peak = -Infinity, worstJump = 0, prev = drawnFrame(r.turret).p.clone();
  for (let f = 1; f <= 600; f++) {
    driver.update(f / 60, 1 / 60);
    const { p } = drawnFrame(r.turret);
    peak = Math.max(peak, p.y);
    worstJump = Math.max(worstJump, p.distanceTo(prev));
    prev = p.clone();
  }
  assert.ok(peak > start.y + 1.5, `thrown clear of the hull (${(peak - start.y).toFixed(2)} m)`);
  assert.ok(worstJump < 0.25, `no frame jumps further than a step's travel (${worstJump.toFixed(3)} m): no snap`);
  assert.ok(landings.length >= 1 && landings[0].speed > 2.2, `its landing was reported (${landings.length})`);
  const rest = drawnFrame(r.turret).p.clone();
  driver.update(11, 1);
  assert.ok(drawnFrame(r.turret).p.distanceTo(rest) < 1e-9, 'at rest it stays where it lies');
  assert.ok(Math.abs(r.gun.rotation.x - 0.06) < 1e-9, 'the gun eased to the wreck droop');
  driver.reset();
}

// --- a fitted rig keeps its turret group's own scale in flight (the T-90M's turret group is 0.95 × 0.65 × 0.913)
{
  const r = rig(1.2, -0.4);
  r.turret.scale.set(0.95, 0.65, 0.913);
  const driver = driverFor(r);
  driver.begin(true, r.turret.position.clone(), 0);
  let worst = 0;
  for (let f = 1; f <= 240; f++) {
    driver.update(f / 60, 1 / 60);
    worst = Math.max(worst, Math.abs(r.turret.scale.x - 0.95), Math.abs(r.turret.scale.y - 0.65), Math.abs(r.turret.scale.z - 0.913));
  }
  assert.ok(worst < 1e-6, `the fitted scale stays on the flying turret (${worst.toExponential(2)})`);
}

// --- an authority: the drawn turret is the body's frame (the procedural seat: no offset), frame for frame
{
  const r = rig(-0.7, 1.1);
  const driver = driverFor(r);
  const turrets = createWreckTurrets({ seed: 3 });
  turrets.bind(createWreckEnvironment(() => GROUND, [], []));
  const tank = { id: 'x', spec, combat: { destroyed: true },
    state: { pos: { x: 50, y: GROUND, z: -20 }, yaw: -0.7, visualPitch: 0, visualRoll: 0, turretYaw: 1.1, speed: 0, verticalSpeed: 0, yawRate: 0 } };
  driver.begin(true, r.turret.position.clone(), null);
  turrets.launch(tank, 'ammorack', 50);
  const pose = new Float64Array(7);
  let worst = 0;
  for (let f = 1; f <= 240; f++) {
    turrets.step([tank]);
    turrets.framePose('x', pose);
    driver.setExternal(pose);
    driver.update(f / 60, 1 / 60);
    const { p, q } = drawnFrame(r.turret);
    worst = Math.max(worst, Math.hypot(p.x - pose[0], p.y - pose[1], p.z - pose[2]),
      1 - Math.abs(q.x * pose[3] + q.y * pose[4] + q.z * pose[5] + q.w * pose[6]));
  }
  assert.ok(worst < 1e-6, `the drawn turret is the body's frame (${worst.toExponential(2)})`);
  // the authority goes quiet mid-flight on a fresh kill: the turret carries on and lands instead of freezing
  const r2 = rig(0.2, 0);
  const driver2 = driverFor(r2);
  const turrets2 = createWreckTurrets({ seed: 9 });
  turrets2.bind(createWreckEnvironment(() => GROUND, [], []));
  const tank2 = { ...tank, id: 'y', state: { ...tank.state, yaw: 0.2, turretYaw: 0 } };
  driver2.begin(true, r2.turret.position.clone(), null);
  turrets2.launch(tank2, 'ammorack', 80);
  for (let f = 1; f <= 18; f++) {
    turrets2.step([tank2]);
    turrets2.framePose('y', pose);
    driver2.setExternal(pose);
    driver2.update(f / 60, 1 / 60);
  }
  const atFreeze = drawnFrame(r2.turret).p.clone();
  let low = Infinity;
  for (let f = 19; f <= 400; f++) {
    driver2.update(f / 60, 1 / 60);
    low = Math.min(low, drawnFrame(r2.turret).p.y);
  }
  const after = drawnFrame(r2.turret).p;
  assert.ok(after.distanceTo(atFreeze) > 0.5, `with the authority quiet it carried on (${after.distanceTo(atFreeze).toFixed(2)} m)`);
  assert.ok(low < atFreeze.y, 'and came down');
}

console.log('wreckTurretDriver.selftest: a composition throws and lands the turret with no jump, a fitted rig keeps its turret scale, an authority\'s pose is drawn exactly, a quiet authority is carried on');
