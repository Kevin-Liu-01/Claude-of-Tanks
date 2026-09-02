import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const close = (actual, expected, tolerance = 1e-9) =>
  Math.abs(actual - expected) <= tolerance;

for (const [id, expectedScale, expectedFamily] of [
  ['vickers_mk1', 0.95, 'cot-vickers-mk1-compact-r1'],
  ['fv510', 1.10, 'cot-warrior-enlarged-r1'],
  ['fv510_milan', 1.10, 'cot-warrior-milan-enlarged-r1'],
]) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const receipt = hullRig?.userData.ukCompleteVehicleScaleReceipt;

  assert(hullRig && turretRig, `${id}: articulated hull and turret owners exist`);
  assert.equal(receipt?.designFamily, expectedFamily,
    `${id}: scale operation publishes the correct vehicle-specific receipt`);
  assert.equal(receipt?.vehicleScale, expectedScale,
    `${id}: requested uniform scale is explicit`);
  assert(receipt?.bakedBucketGeometry && receipt?.directAssembliesScaled
      && receipt?.ownerScalesPreserved,
  `${id}: authored geometry and instantiated assemblies scale before merge`);
  assert(receipt?.turretPivotScaled && receipt?.gunPivotScaled
      && receipt?.muzzleAnchorScaled && receipt?.contactGeometryScaled
      && receipt?.trackHitboxesScaled && receipt?.roadWheelLayoutScaled,
  `${id}: articulation anchors and collision metadata follow the visible vehicle scale`);
  assert(close(hullRig.scale.x, 1) && close(hullRig.scale.y, 1)
      && close(hullRig.scale.z, 1),
  `${id}: hull owner remains an identity-scale metre frame`);
  assert(close(turretRig.scale.x, 1) && close(turretRig.scale.z, 1),
  `${id}: turret owner does not carry a late uniform render scale`);
  assert(close(turretRig.scale.y, id.startsWith('fv510') ? 0.84 : 1),
    `${id}: pre-existing turret-height shaping remains intact`);

  tank.dispose();
}

for (const [id, objectName, receiptName] of [
  ['vickers_mk1', 'vickers_mk1_loader_roof_machine_gun', 'vickersRoofMachineGunReceipt'],
  ['centurion5', 'centurion5_loader_roof_machine_gun', 'centurionRoofMachineGunReceipt'],
]) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  const turretRig = tank.root.getObjectByName('rig_turret');
  const weapon = tank.root.getObjectByName(objectName);
  const receipt = turretRig?.userData[receiptName];
  assert(weapon, `${id}: visible named roof machine-gun station exists`);
  assert.equal(weapon.userData.fitting, 'pintleMG',
    `${id}: station uses the detailed fleet machine-gun fitting`);
  assert.equal(weapon.userData.weaponClass, 'mag58',
    `${id}: station carries a proper MAG 58 receiver and barrel`);
  assert.equal(weapon.userData.shieldVariant, 'low',
    `${id}: loader station carries its compact protective shield`);
  assert.equal(weapon.userData.forwardFacing, true,
    `${id}: roof weapon faces forward rather than lying across the crown`);
  assert.equal(receipt?.armorEnvelopeExcluded, true,
    `${id}: roof weapon support remains equipment, not turret armor`);

  tank.dispose();
}

console.log('ukScaleWeapons.selftest: UK scale, pivot, contact and visible roof-weapon contracts hold');
