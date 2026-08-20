import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const expectedHalfWidths = new Map([
  ['leo2a4', 0.92],
  ['leo2a4_otco', 0.92],
  ['leo2a4m', 0.88],
  ['leo2a6', 0.88],
  ['leo2a6m', 0.88],
]);

for (const [id, expectedHalfW] of expectedHalfWidths) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  try {
    const hullRig = tank.root.getObjectByName('rig_hull');
    const closure = hullRig?.userData.leopardUnderGlacisClosure;
    assert.ok(hullRig && closure, `${id}: under-glacis closure receipt exists`);
    assert.equal(closure.halfW, expectedHalfW,
      `${id}: closure uses the family track-safe half-width`);
    assert.ok(closure.laneHalfWidth == null || closure.halfW < closure.laneHalfWidth,
      `${id}: closure remains inside the animated track lanes`);
    assert.ok(closure.bellyRunRearZ <= closure.tubFrontZ,
      `${id}: belly return overlaps the lower tub without a rear gap`);
    assert.ok(closure.bellyRunFrontZ >= closure.lowerPlateRearZ,
      `${id}: belly return overlaps the receding lower-front plate`);
    assert.ok(closure.lowerPlateFrontTopY > closure.beltY,
      `${id}: lower-front plate captures the glacis belt foot`);
    assert.ok(closure.lowerPlateRearTopY >= closure.bellyY - 0.011,
      `${id}: lower-front plate lands on the belly plane`);
    assert.ok(closure.lowerPlateFrontZ > closure.lowerPlateRearZ,
      `${id}: lower-front plate rises toward the bow`);
  } finally {
    tank.dispose();
  }
}

console.log('leopardHullClosure.selftest: requested Leopard bow undersides are continuous and track-safe');
