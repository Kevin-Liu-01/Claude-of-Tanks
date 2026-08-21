import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTank } from '../tankFactory.js';
import { TYPE10_GUN_SEAT } from './type10GunSeat.js';

const closeTo = (actual, expected, tolerance, label) => {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ±${tolerance}, received ${actual}`);
};

for (const id of ['type10', 'type10b']) {
  const visual = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  const turret = visual.root.getObjectByName('rig_turret');
  const gun = visual.root.getObjectByName('rig_gun');
  const mount = visual.root.getObjectByName('gunMount');
  const muzzle = visual.root.getObjectByName('rig_muzzle');

  assert.ok(turret && gun && mount?.geometry && muzzle,
    `${id}: complete articulated gun rig exists`);
  mount.geometry.computeBoundingBox();
  const mantletBackZ = gun.position.z + mount.geometry.boundingBox.min.z;

  closeTo(gun.position.x, 0, 1e-9, `${id}: cannon is centered laterally`);
  closeTo(turret.position.y + gun.position.y, 1.991, 1e-6,
    `${id}: cannon restores the authored bore height`);
  closeTo(mantletBackZ, TYPE10_GUN_SEAT.turretAttachmentCenterZ, 0.001,
    `${id}: mantlet back plane meets the turret attachment area`);

  visual.root.updateMatrixWorld(true);
  const muzzleWorld = muzzle.getWorldPosition(new Vector3());
  closeTo(muzzleWorld.z, TYPE10_GUN_SEAT.certifiedMuzzleWorldZ, 1e-6,
    `${id}: cannon re-seat preserves certified muzzle length`);

  const pivotWorld = gun.getWorldPosition(new Vector3());
  const gunRun = muzzleWorld.distanceTo(pivotWorld);
  for (const pitchDeg of [-10, 0, 20]) {
    gun.rotation.x = pitchDeg * Math.PI / 180;
    visual.root.updateMatrixWorld(true);
    closeTo(muzzle.getWorldPosition(new Vector3()).distanceTo(
      gun.getWorldPosition(new Vector3())), gunRun, 1e-6,
    `${id}: ${pitchDeg}° articulation stays on the corrected trunnion`);
  }
  visual.dispose();
}

console.log('type10GunSeat.selftest: Type 10 and Type 10B cannons are centered, seated, and length-stable');
