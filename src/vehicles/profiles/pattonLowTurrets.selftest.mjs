import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const CASES = {
  m26_pershing: { profile: 'm26-broad-cast', castScale: 0.65, gunY: 0.27846, mantletW: 1.50 },
  m45_patton: { profile: 'm45-heavy-howitzer-cast', castScale: 0.65, gunY: 0.26, mantletW: 1.53 },
  m46_patton: {
    profile: 'm46-low-patton-cast', castScale: 0.78, gunY: 0.37089, mantletW: 1.40,
    sprocketR: 0.14, sprocketTeeth: false,
  },
  m47_patton: {
    profile: 'm47-low-t42-cast', castScale: 0.65, gunY: 0.2405, mantletW: 0.70,
    sprocketR: 0.325, sprocketTeeth: false,
  },
};

for (const [id, expected] of Object.entries(CASES)) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  const shell = tank.root.getObjectByName('turret');
  const mantlet = tank.root.getObjectByName('gunMount');
  assert.ok(turretRig && gunRig && shell && mantlet, `${id}: articulated low turret remains complete`);
  assert.equal(turretRig.userData.castHeightScale, expected.castScale,
    `${id}: cast profile keeps its deliberate family height`);
  assert.equal(turretRig.userData.castProfile, expected.profile, `${id}: distinct casting treatment survives`);

  const shellSize = new THREE.Box3().setFromObject(shell).getSize(new THREE.Vector3());
  assert(shellSize.y <= 1.40, `${id}: shell, roof seats, and cheek fittings stay inside the restored low envelope`);
  assert(shellSize.x >= shellSize.y * 1.65, `${id}: broad cast cheeks dominate the restored vertical profile`);
  assert(Math.abs(gunRig.position.y - expected.gunY) < 1e-6,
    `${id}: gun pivot follows the new roof/mantlet axis without leaving the turret`);

  const mantletSize = new THREE.Box3().setFromObject(mantlet).getSize(new THREE.Vector3());
  assert(mantletSize.x >= expected.mantletW, `${id}: reshaped mantlet keeps a substantial cast face`);
  assert(mantletSize.y <= 0.68, `${id}: mantlet stays proportional to its restored casting`);

  if (expected.sprocketR != null) {
    const hullRig = tank.root.getObjectByName('rig_hull');
    const gearReceipt = hullRig?.userData?.runningGearReceipts?.[0];
    assert.ok(gearReceipt, `${id}: running-gear geometry receipt remains available`);
    assert.equal(gearReceipt.sprocket.r, expected.sprocketR,
      `${id}: rear drive sprocket keeps its authored radius`);
    assert.equal(gearReceipt.sprocketTeeth, expected.sprocketTeeth,
      `${id}: non-camouflaged radial sprocket blocks stay removed`);
  }

  const repeat = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const repeatShell = repeat.root.getObjectByName('turret');
  const repeatGun = repeat.root.getObjectByName('rig_gun');
  const repeatSize = new THREE.Box3().setFromObject(repeatShell).getSize(new THREE.Vector3());
  assert.ok(repeatSize.distanceTo(shellSize) < 1e-6,
    `${id}: repeated construction must not compress the shared profile again`);
  assert.ok(Math.abs(repeatGun.position.y - gunRig.position.y) < 1e-6,
    `${id}: repeated construction keeps the same gun axis`);
  repeat.dispose();
  tank.dispose();
}

console.log('pattonLowTurrets.selftest: Patton casting heights, gun seats, and M46/M47 rear sprockets verified');
