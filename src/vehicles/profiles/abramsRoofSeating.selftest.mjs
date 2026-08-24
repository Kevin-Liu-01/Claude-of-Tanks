import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const near = (value, expected, epsilon = 1e-4) =>
  Math.abs(value - expected) <= epsilon;

for (const id of ['m1a2', 'm1a2_tusk', 'm1a2_sepv2']) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  const turretRig = tank.root.getObjectByName('rig_turret');
  const turretEquipment = tank.root.getObjectByName('turretEquipment');
  const receipt = turretRig?.userData?.abramsRoofSeatingReceipt;

  assert.ok(receipt, `${id}: Abrams roof-seating receipt exists`);
  assert.equal(receipt.variant, id, `${id}: receipt belongs to the requested variant`);
  assert.ok(turretEquipment?.geometry?.attributes?.position,
    `${id}: roof equipment geometry exists`);
  assert.equal(turretEquipment.userData.combatHitboxRole, 'equipment',
    `${id}: roof carrier remains outside the base turret armor envelope`);

  const { roofCarrier, crows, loaderMount, loaderWeapon, gunnerSight } = receipt;
  assert.ok(near(roofCarrier.rearBottomY,
    roofCarrier.rearRoofY - roofCarrier.seatDepthM),
  `${id}: carrier rear edge is seated into the roof`);
  assert.ok(near(roofCarrier.frontBottomY,
    roofCarrier.frontRoofY - roofCarrier.seatDepthM),
  `${id}: carrier front edge is seated into the roof`);
  assert.ok(roofCarrier.rearBottomY - roofCarrier.frontBottomY > 0.095,
    `${id}: carrier follows the roof pitch instead of hovering horizontally`);
  assert.ok(near(roofCarrier.thicknessM, 0.12),
    `${id}: carrier retains its original 120 mm plate depth`);

  assert.ok(near(crows.baseBottomY,
    crows.carrierTopY - crows.contactOverlapM),
  `${id}: CROWS pedestal is derived from the carrier top`);
  assert.ok(crows.contactOverlapM >= 0.009 && crows.contactOverlapM <= 0.011,
    `${id}: CROWS pedestal overlaps its carrier by about 10 mm`);
  assert.equal(crows.equipmentOwned, true,
    `${id}: CROWS remains equipment-owned`);

  assert.ok(near(loaderMount.rearBottomY,
    loaderMount.rearRoofY - loaderMount.seatDepthM),
  `${id}: loader mounting foot is seated at its rear edge`);
  assert.ok(near(loaderMount.frontBottomY,
    loaderMount.frontRoofY - loaderMount.seatDepthM),
  `${id}: loader mounting foot is seated at its front edge`);
  assert.ok(loaderMount.rearBottomY > loaderMount.frontBottomY,
    `${id}: loader mounting foot follows the local roof slope`);
  assert.ok(near(loaderMount.x, 0.95) && near(loaderMount.z, -0.10),
    `${id}: loader mounting foot retains the marked roof position`);
  assert.ok(near(loaderMount.topY, 0.85),
    `${id}: loader mounting foot retains the marked top datum`);

  assert.ok(near(gunnerSight.rearBottomY,
    gunnerSight.rearRoofY - gunnerSight.seatDepthM),
  `${id}: gunner-sight panel rear is flush with the roof`);
  assert.ok(near(gunnerSight.frontBottomY,
    gunnerSight.frontRoofY - gunnerSight.seatDepthM),
  `${id}: gunner-sight panel front is flush with the roof`);
  assert.ok(gunnerSight.rearBottomY > gunnerSight.frontBottomY,
    `${id}: gunner-sight panel follows the roof pitch`);

  if (id === 'm1a2_tusk') {
    assert.equal(loaderWeapon, null,
      'm1a2_tusk: separate LAGS gun stays on its connected armored station');
  } else {
    assert.ok(loaderWeapon, `${id}: loader machine-gun seating receipt exists`);
    assert.ok(near(loaderWeapon.x, loaderMount.x)
      && near(loaderWeapon.pintleZ, loaderMount.z),
    `${id}: loader machine-gun pintle is centered on its mounting foot`);
    assert.ok(loaderWeapon.mountOverlapM >= 0.007,
      `${id}: loader machine-gun pintle overlaps its mounting foot`);
    assert.ok(loaderWeapon.pintleTopY > loaderWeapon.receiverBottomY,
      `${id}: loader machine-gun pintle reaches into its receiver`);
  }

  tank.dispose();
}

console.log('abramsRoofSeating.selftest: M1A2, TUSK and SEPv2 roof equipment is seated');

await import('./abramsWheelBayPanels.selftest.mjs');
