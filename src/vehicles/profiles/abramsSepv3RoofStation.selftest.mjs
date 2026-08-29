import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const tank = createTank('m1a2_sepv3', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

const turretRig = tank.root.getObjectByName('rig_turret');
const turretEquipment = tank.root.getObjectByName('turretEquipment');
const receipt = turretRig?.userData?.m1a2Sepv3RoofStationReceipt;
assert.ok(receipt, 'SEPv3 roof-station geometry receipt exists');
assert.ok(turretEquipment?.geometry?.attributes?.position, 'SEPv3 roof equipment geometry exists');
assert.equal(turretEquipment.userData.combatHitboxRole, 'equipment',
  'SEPv3 roof carrier does not stretch the base turret armor envelope');

const near = (value, expected, epsilon = 1e-4) =>
  Math.abs(value - expected) <= epsilon;
const { roofCarrier, crows, loader } = receipt;

assert.ok(near(roofCarrier.rearBottomY,
  roofCarrier.rearRoofY - roofCarrier.seatDepthM),
'carrier rear edge is seated into the transition roof');
assert.ok(near(roofCarrier.frontBottomY,
  roofCarrier.frontRoofY - roofCarrier.seatDepthM),
'carrier front edge is seated into the transition roof');
assert.ok(roofCarrier.rearBottomY - roofCarrier.frontBottomY > 0.095,
  'carrier follows the roof pitch instead of remaining horizontal');
assert.ok(near(roofCarrier.thicknessM, 0.11),
  'carrier retains a substantial but compact plate thickness');

const positions = turretEquipment.geometry.attributes.position;
const hasPoint = (target) => {
  for (let index = 0; index < positions.count; index += 1) {
    if (near(positions.getX(index), target[0])
      && near(positions.getY(index), target[1])
      && near(positions.getZ(index), target[2])) return true;
  }
  return false;
};
assert.ok(hasPoint([-1.07, roofCarrier.rearBottomY, roofCarrier.zRear]),
  'carrier rear underside vertex is present in the merged roof equipment');
assert.ok(hasPoint([-1.07, roofCarrier.frontBottomY, roofCarrier.zFront]),
  'carrier front underside vertex is present in the merged roof equipment');

assert.ok(crows.previousBaseY - crows.baseY >= 0.075,
'full commander tower remains seated on the lowered roof carrier');
assert.equal(crows.stationFamily, 'abramsx-open-yoke-v1',
  'commander weapon uses the AbramsX-derived open-yoke family');
assert.equal(crows.sizeStandard, 'm1a3-full-tower',
  'commander tower uses the full M1A3 size standard');
assert.equal(crows.weaponRole, 'commander-primary',
  'open-yoke tower replaces the smaller commander gun');
assert.equal(crows.headOnSide, 'left',
  'full commander tower sits on the left in a head-on view');
assert.equal(crows.lowerArmorCollar, true,
'commander tower has a closed armored lower collar');
assert.equal(crows.equipmentOwnedShielding, true,
'commander shielding remains equipment-owned for combat anatomy');

assert.equal(loader.americanWeaponStandard, 'sheridan-m2hb-v1',
  'loader retains the detailed Browning M2HB family');
assert.equal(loader.shieldVariant, 'low',
  'loader Browning retains its low SEPv3 guard');
assert.equal(loader.station, 'sepv3-loader-m2hb',
  'roof receipt identifies the restored loader installation');
assert.ok(loader.x > 0,
  'loader Browning sits on the right in a head-on view');
assert.ok(near(loader.x, 0.95) && near(loader.pintleZ, -0.10),
  'loader Browning is centered on its roof mounting foot');
assert.ok(loader.receiverBottomY < loader.receiverY
  && loader.receiverBottomY > loader.pintleBottomY,
  'loader bearing reaches continuously into the open-yoke receiver');
assert.equal(loader.connectedBearing, true,
  'loader weapon has an attached roof bearing');
assert.equal(loader.equipmentOwnedShielding, true,
  'loader shielding remains equipment-owned for combat anatomy');

tank.dispose();
console.log('abramsSepv3RoofStation.selftest: full commander tower and right-side loader Browning pass');
