import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const near = (value, expected, epsilon = 1e-4) =>
  Math.abs(value - expected) <= epsilon;

for (const id of ['m1a1', 'm1a1ha', 'ua_m1a1']) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  const turretRig = tank.root.getObjectByName('rig_turret');
  const turretEquipment = tank.root.getObjectByName('turretEquipment');
  const receipt = turretRig?.userData?.abramsCwsRoofSeatingReceipt;

  assert.ok(receipt, `${id}: CWS roof-seating receipt exists`);
  const authoredVariant = id === 'ua_m1a1' ? 'm1a1ha' : id;
  assert.equal(receipt.variant, authoredVariant,
    `${id}: receipt belongs to its authored Abrams geometry variant`);
  assert.ok(turretEquipment?.geometry?.attributes?.position,
    `${id}: roof equipment geometry exists`);
  assert.equal(turretEquipment.userData.combatHitboxRole, 'equipment',
    `${id}: roof furniture remains outside the base turret armor envelope`);

  for (const [name, plate] of [
    ['carrier', receipt.roofCarrier],
    ['forward panel', receipt.forwardPanel],
  ]) {
    assert.ok(near(plate.rearBottomY, plate.rearRoofY - plate.seatDepthM),
      `${id}: ${name} rear edge is seated into the turret roof`);
    assert.ok(near(plate.frontBottomY, plate.frontRoofY - plate.seatDepthM),
      `${id}: ${name} front edge is seated into the turret roof`);
    assert.ok(plate.rearBottomY > plate.frontBottomY,
      `${id}: ${name} follows the forward roof pitch`);
  }

  assert.ok(receipt.roofCarrier.rearBottomY - receipt.roofCarrier.frontBottomY > 0.095,
    `${id}: carrier removes the former 10 cm-plus forward hover gap`);
  assert.ok(near(receipt.cws.pedestalBottomY,
    receipt.cws.carrierMountTopY - 0.0025),
  `${id}: CWS pedestal is attached to the re-seated carrier`);
  assert.ok(near(receipt.cws.drumTopY,
    receipt.cws.drumCarrierTopY - 0.003),
  `${id}: hatch ring remains flush with the carrier surface`);

  if (id === 'ua_m1a1') {
    const cage = turretRig.userData.uaM1A1CageRailReceipt;
    assert.ok(cage, `${id}: cage publishes its front centre-rail receipt`);
    const connectorInnerX = cage.connectorCenterXM - cage.connectorSpanM * 0.5;
    const connectorOuterX = cage.connectorCenterXM + cage.connectorSpanM * 0.5;
    assert.ok(connectorInnerX <= -cage.centerRailHalfWidthM,
      `${id}: each front tie overlaps the longitudinal centre rail`);
    assert.ok(connectorOuterX >= cage.frontRibInnerXM + cage.overlapM * 0.5,
      `${id}: each front tie overlaps its transverse outer rib`);
    assert.ok(near(cage.yM, 1.16),
      `${id}: front ties follow the pitched canopy height`);
    assert.ok(near(cage.zM, 2.62),
      `${id}: front ties terminate at the marked centre-rail end`);
  }
}

console.log('abramsCwsRoofSeating.selftest: M1A1, HA and UA roof panels are flush; UA cage rail is tied');
