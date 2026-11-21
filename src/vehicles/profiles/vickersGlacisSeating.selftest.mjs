import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const tank = createTank('vickers_mk1', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
const hullRig = tank.root.getObjectByName('rig_hull');
const hullArmor = hullRig.getObjectByName('hull');
const hullEquipment = hullRig.getObjectByName('hullEquipment');
const receipt = hullRig.userData.vickersBowLockReceipt;

assert.ok(hullEquipment?.geometry, 'Vickers folded bow lock renders as hull-owned equipment');
assert.equal(receipt.owner, 'hull', 'bow lock follows the hull articulation');
assert.equal(receipt.carrier, 'upper-glacis', 'bow lock records the upper glacis as its carrier');
assert.equal(receipt.stowed, true, 'bow lock is folded against the carrier');
assert.ok(receipt.contactEmbedM >= 0.01, 'bow-lock feet overlap the carrier by at least 10 mm');
assert.equal(receipt.maxSupportGapM, 0, 'no unsupported gap remains below the assembly');
assert.equal(receipt.armorEnvelopeExcluded, true, 'travel-lock fittings do not enlarge hull armor');

// Lane vickers-mk1-274 (2026-11-21): the crutch lies folded on the long upper glacis (1.58 -> 1.12 m over z 2.45..3.70
// authored, x0.95 compact scale), pitched to the plate, well behind the glacis lip at 3.515 m.
assert.ok(receipt.pitchRad > 0.3 && receipt.pitchRad < 0.4, 'the crutch is pitched to the upper glacis');
hullEquipment.geometry.computeBoundingBox();
const equipmentBounds = hullEquipment.geometry.boundingBox;
assert.ok(equipmentBounds.max.z <= 3.30,
  'folded assembly stays on the glacis instead of projecting past the bow');
assert.ok(equipmentBounds.min.y <= 1.20 && equipmentBounds.max.y <= 1.36,
  'feet lie on the upper glacis while the saddle remains low');

hullArmor.geometry.computeBoundingBox();
assert.ok(hullArmor.geometry.boundingBox.max.z <= 3.81,
  'no length carrier: the hull ends at the mudguard hoods\' noses (published hull 7.92 m at the compact scale)');

tank.dispose();
console.log('vickersGlacisSeating.selftest: folded gun crutch lies on the glacis, supported, and non-armor');
