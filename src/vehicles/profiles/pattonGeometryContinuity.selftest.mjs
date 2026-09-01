import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const lowerHullExpectations = {
  m46_patton: { floorY: 0.48, minimumGlacisAngleDeg: 1 },
  m47_patton: { floorY: 0.468, minimumGlacisAngleDeg: 1 },
  m48: { floorY: 0.626, minimumGlacisAngleDeg: 24 },
};

for (const [id, expected] of Object.entries(lowerHullExpectations)) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  const hull = tank.root.getObjectByName('rig_hull');
  const receipt = hull?.userData.pattonLowerHullReceipt;
  assert.ok(receipt, `${id}: lower hull publishes a continuity receipt`);
  assert(Math.abs(receipt.floorY - expected.floorY) < 1e-6,
    `${id}: floor remains at its measured station`);
  assert.equal(receipt.rearUndercutJoinsFloor, true,
    `${id}: rear underside begins on the hull floor without an open band`);
  assert(Math.abs(receipt.rearUndercutBottomY - receipt.floorY) < 1e-6,
    `${id}: rear ramp and belly share the exact seam height`);
  assert(receipt.lowerGlacisAngleDeg >= expected.minimumGlacisAngleDeg,
    `${id}: lower glacis preserves its requested slope`);
  tank.dispose();
}

const m60a1 = createTank('m60a1', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
const m60Turret = m60a1.root.getObjectByName('rig_turret');
const cheekPanels = m60Turret?.userData.m60VariantAttachmentReceipt?.cheekPanels;
assert.equal(cheekPanels?.count, 12,
  'M60A1 uses twelve individually seated cheek panels');
assert.equal(cheekPanels?.courses, 2,
  'M60A1 panels form two casting-following courses');
assert(cheekPanels?.maximumSupportGapM <= 0.002,
  'M60A1 ERA has no unsupported corner above the cast turret skin');
m60a1.dispose();

console.log('pattonGeometryContinuity.selftest: Patton floors, stern ramps, glacis, and M60A1 ERA remain joined');
