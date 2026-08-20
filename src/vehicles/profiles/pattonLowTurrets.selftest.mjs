import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const CASES = {
  m26_pershing: { profile: 'm26-broad-cast', gunY: 0.2142, mantletW: 1.50 },
  m45_patton: { profile: 'm45-heavy-howitzer-cast', gunY: 0.20, mantletW: 1.53 },
  m46_patton: { profile: 'm46-low-patton-cast', gunY: 0.23775, mantletW: 1.40 },
  m47_patton: { profile: 'm47-low-t42-cast', gunY: 0.185, mantletW: 0.70 },
};

for (const [id, expected] of Object.entries(CASES)) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  const shell = tank.root.getObjectByName('turret');
  const mantlet = tank.root.getObjectByName('gunMount');
  assert.ok(turretRig && gunRig && shell && mantlet, `${id}: articulated low turret remains complete`);
  assert.equal(turretRig.userData.castHeightScale, 0.5, `${id}: cast profile is exactly half-height`);
  assert.equal(turretRig.userData.castProfile, expected.profile, `${id}: distinct casting treatment survives`);

  const shellSize = new THREE.Box3().setFromObject(shell).getSize(new THREE.Vector3());
  assert(shellSize.y <= 1.10, `${id}: shell, roof seats, and cheek fittings stay inside the low envelope`);
  assert(shellSize.x >= shellSize.y * 2.1, `${id}: broad cast cheeks dominate the reduced vertical profile`);
  assert(Math.abs(gunRig.position.y - expected.gunY) < 1e-6,
    `${id}: gun pivot follows the new roof/mantlet axis without leaving the turret`);

  const mantletSize = new THREE.Box3().setFromObject(mantlet).getSize(new THREE.Vector3());
  assert(mantletSize.x >= expected.mantletW, `${id}: reshaped mantlet keeps a substantial cast face`);
  assert(mantletSize.y <= 0.52, `${id}: mantlet no longer restores the former tall silhouette`);

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

console.log('pattonLowTurrets.selftest: M26/M45/M46/M47 half-height castings and reseated guns verified');
