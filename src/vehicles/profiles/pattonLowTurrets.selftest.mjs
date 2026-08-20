import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const CASES = {
  m26_pershing: { profile: 'm26-broad-cast', gunY: 0.27846, mantletW: 1.50 },
  m45_patton: { profile: 'm45-heavy-howitzer-cast', gunY: 0.26, mantletW: 1.53 },
  m46_patton: { profile: 'm46-low-patton-cast', gunY: 0.309075, mantletW: 1.40 },
  m47_patton: { profile: 'm47-low-t42-cast', gunY: 0.2405, mantletW: 0.70 },
};

for (const [id, expected] of Object.entries(CASES)) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  const shell = tank.root.getObjectByName('turret');
  const mantlet = tank.root.getObjectByName('gunMount');
  assert.ok(turretRig && gunRig && shell && mantlet, `${id}: articulated low turret remains complete`);
  assert.equal(turretRig.userData.castHeightScale, 0.65, `${id}: cast profile restores 30% of the prior half-height scale`);
  assert.equal(turretRig.userData.castProfile, expected.profile, `${id}: distinct casting treatment survives`);

  const shellSize = new THREE.Box3().setFromObject(shell).getSize(new THREE.Vector3());
  assert(shellSize.y <= 1.40, `${id}: shell, roof seats, and cheek fittings stay inside the restored low envelope`);
  assert(shellSize.x >= shellSize.y * 1.65, `${id}: broad cast cheeks dominate the restored vertical profile`);
  assert(Math.abs(gunRig.position.y - expected.gunY) < 1e-6,
    `${id}: gun pivot follows the new roof/mantlet axis without leaving the turret`);

  const mantletSize = new THREE.Box3().setFromObject(mantlet).getSize(new THREE.Vector3());
  assert(mantletSize.x >= expected.mantletW, `${id}: reshaped mantlet keeps a substantial cast face`);
  assert(mantletSize.y <= 0.68, `${id}: mantlet stays proportional to the 30%-taller casting`);

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

console.log('pattonLowTurrets.selftest: M26/M45/M46/M47 30%-restored castings and reseated guns verified');
