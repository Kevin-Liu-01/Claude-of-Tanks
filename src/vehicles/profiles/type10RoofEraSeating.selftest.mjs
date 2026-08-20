import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

function closeTo(actual, expected, label, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon,
    `${label}: expected ${expected}, received ${actual}`);
}

const type10 = createTank('type10', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
const type10Turret = type10.root.getObjectByName('rig_turret');
const type10Receipt = type10Turret?.userData.type10RoofBustleReceipt;
assert.ok(type10Receipt, 'Type 10 exposes its roof and bustle seating receipt');
assert.equal(type10Receipt.opticVariant, 'compact-right',
  'Type 10 uses the compact right-side roof optic');
assert.ok(type10Receipt.opticCenterX > 0.5,
  'Type 10 optic remains on the right half of the turret');
assert.ok(type10Receipt.opticScaleRatio <= 0.60,
  'Type 10 optic stays materially smaller than the former housing');
closeTo(type10Receipt.roofCarrierY - type10Receipt.opticBottomY, 0.012,
  'Type 10 optic embeds into its roof carrier');
assert.ok(type10Receipt.bustleOverlapM >= 0.01,
  'Type 10 bustle rack overlaps the rear shell by at least 10 mm');
type10.dispose();

const type10b = createTank('type10b', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
const type10bTurret = type10b.root.getObjectByName('rig_turret');
const sharedReceipt = type10bTurret?.userData.type10RoofBustleReceipt;
const kaiReceipt = type10bTurret?.userData.type10bRoofEraReceipt;
assert.ok(sharedReceipt, 'Type 10B exposes the shared bustle seating receipt');
assert.ok(kaiReceipt, 'Type 10B exposes its roof and ERA seating receipt');
assert.equal(sharedReceipt.opticVariant, 'type10b-standard-left',
  'Type 10B preserves its dedicated left-side sight package');
assert.ok(sharedReceipt.bustleOverlapM >= 0.01,
  'Type 10B shared bustle rack overlaps the rear shell by at least 10 mm');
closeTo(kaiReceipt.roofCarrierY - kaiReceipt.leftSightBottomY,
  kaiReceipt.contactEmbedM, 'Type 10B left sight embeds into the roof');
closeTo(kaiReceipt.roofCarrierY - kaiReceipt.rightSightBottomY,
  kaiReceipt.contactEmbedM, 'Type 10B right sight embeds into the roof');
closeTo(kaiReceipt.roofCarrierY - kaiReceipt.rwsBottomY,
  kaiReceipt.contactEmbedM, 'Type 10B RWS embeds into the roof');
assert.equal(kaiReceipt.maxRoofGapM, 0,
  'Type 10B roof fittings permit no daylight below their bases');
assert.equal(kaiReceipt.eraCarrierDerivedTransforms, true,
  'Type 10B ERA follows armor-carrier faces');
assert.equal(kaiReceipt.turretEraCassettes, 40,
  'Type 10B carries the denser forty-cassette turret ERA field');
assert.ok(kaiReceipt.turretEraCassettes > kaiReceipt.formerTurretEraCassettes,
  'Type 10B gains turret ERA coverage over the replaced layout');
assert.equal(kaiReceipt.hullEraCassettes, 12,
  'Type 10B retains both six-cassette hull side courses');
assert.ok(kaiReceipt.turretEraEmbedM >= 0.01,
  'Type 10B turret ERA embeds at least 10 mm into its carrier');
assert.ok(kaiReceipt.hullEraEmbedM >= 0.01,
  'Type 10B hull ERA embeds at least 10 mm into its carrier');
assert.equal(kaiReceipt.basketJoinGapM, 0,
  'Type 10B Kai basket and shared bustle rack have no open seam');
assert.ok(kaiReceipt.kaiBasketRearZ <= kaiReceipt.baseBasketForwardZ + 0.002,
  'Type 10B Kai basket reaches the shared bustle rack');
type10b.dispose();

console.log('type10RoofEraSeating.selftest: roof fittings, ERA, optics, and bustle racks are seated');
