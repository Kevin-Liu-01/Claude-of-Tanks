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

hullEquipment.geometry.computeBoundingBox();
const equipmentBounds = hullEquipment.geometry.boundingBox;
assert.ok(equipmentBounds.max.z <= 3.27,
  'folded assembly stays on the beak instead of projecting past the bow');
assert.ok(equipmentBounds.min.y <= 1.36 && equipmentBounds.max.y <= 1.54,
  'feet intersect the upper glacis while the saddle remains low');

hullArmor.geometry.computeBoundingBox();
assert.ok(hullArmor.geometry.boundingBox.max.z <= 3.56,
  'removed length-carrier box no longer inflates the structural hull envelope');

tank.dispose();
console.log('vickersGlacisSeating.selftest: folded bow lock is flush, supported, and non-armor');
