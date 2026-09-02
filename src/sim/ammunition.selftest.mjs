import assert from 'node:assert/strict';
import {
  consumeAmmunition,
  createAmmunitionState,
  firstAvailableAmmunitionSlot,
  hasAmmunition,
  replenishAmmunition,
  shellAmmunitionCapacity,
  totalAmmunition,
  totalAmmunitionCapacity,
} from './ammunition.ts';

const loadout = createAmmunitionState([
  { type: 'APFSDS' },
  { type: 'HEAT', count: 4 },
  { type: 'HESH' },
]);
assert.deepEqual(loadout, {
  ammo: [24, 4, 20],
  ammoCapacity: [24, 4, 20],
});
assert.equal(shellAmmunitionCapacity({ type: 'HE', count: 0 }), 0,
  'an explicit empty channel is not replaced by a fallback');
assert.equal(consumeAmmunition(loadout, 1), true);
assert.equal(loadout.ammo[1], 3);
loadout.ammo[0] = 0;
loadout.ammo[1] = 0;
loadout.ammo[2] = 19;
assert.equal(hasAmmunition(loadout, 0), false);
assert.equal(firstAvailableAmmunitionSlot(loadout), 2,
  'automatic depletion fallback picks the first stocked slot');
assert.equal(consumeAmmunition(loadout, 0), false, 'empty ammunition never goes negative');
assert.deepEqual(replenishAmmunition(loadout), {
  added: [5, 1, 1],
  totalAdded: 7,
}, 'a cache replenishes each real channel and always restores a rare missile');
assert.deepEqual(loadout.ammo, [5, 1, 20]);
assert.equal(totalAmmunition(loadout), 26);
assert.equal(totalAmmunitionCapacity(loadout), 48);
loadout.ammo.fill(0);
assert.equal(firstAvailableAmmunitionSlot(loadout), -1,
  'an exhausted vehicle has no synthetic fallback slot');

console.log('ammunition.selftest: authored inventory, consumption, and cache replenishment passed');
