import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.js';

const EPSILON_M = 0.002;
const near = (actual, expected, epsilon = EPSILON_M) =>
  Math.abs(actual - expected) <= epsilon;

const tank = createTank('abramsx', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
await Promise.resolve();

try {
  const spec = getSpec('abramsx');
  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');
  const shell = tank.root.getObjectByName('turret');
  assert.ok(turret && gun && shell?.geometry,
    'AbramsX retains canonical turret, gun and structural shell nodes');

  assert.deepEqual(spec.armor.turretPivot, [0, 1.95, -0.04],
    'combat and presentation publish the centered AbramsX turret ring');
  assert.deepEqual(spec.armor.gunPivot, [0, -0.02, 2.189],
    'combat gun axis follows the rebased visual gun without moving in world space');
  assert.ok(near(turret.position.z, -0.04, 1e-9),
    'live yaw origin is centered on the turret shell');

  shell.geometry.computeBoundingBox();
  const localBounds = shell.geometry.boundingBox;
  const localCenter = localBounds.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(localCenter.z) <= EPSILON_M,
    `structural center stays on the yaw axis (offset ${localCenter.z.toFixed(4)} m)`);

  // Rebasing changes the local coordinates only. The authored default pose,
  // including the shell extents and XM360 axis, must remain visually fixed.
  const worldBounds = new THREE.Box3().setFromObject(shell);
  assert.ok(near(worldBounds.min.z, -2.481) && near(worldBounds.max.z, 2.404),
    'rest-pose shell retains its authored world-space longitudinal extents');
  const gunWorld = gun.getWorldPosition(new THREE.Vector3());
  assert.ok(near(gunWorld.z, 2.149, 1e-9),
    'XM360 trunnion retains its authored world-space station');

  // A correctly centered yaw axis keeps the shell center fixed at every
  // heading. The previous -0.39 m origin moved it through a 0.3515 m orbit.
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    turret.rotation.y = yaw;
    tank.root.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(shell).getCenter(new THREE.Vector3());
    assert.ok(Math.hypot(center.x - turret.position.x, center.z - turret.position.z)
      <= EPSILON_M,
    `shell center remains on the ring through yaw ${yaw.toFixed(3)}`);
  }

  const receipt = turret.userData.abramsxTurretPivotReceipt;
  assert.deepEqual(receipt, {
    authoredPivotZ: -0.39,
    centeredPivotZ: -0.04,
    structuralRestCenterZ: -0.0385,
    contentShiftZ: -0.35,
  }, 'AbramsX publishes the source-to-centered pivot rebase receipt');
} finally {
  tank.dispose();
}

console.log('abramsXTurretPivot.selftest: centered yaw axis and stable rest pose pass');
