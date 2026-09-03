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
assert.equal(shellAmmunitionCapacity({ type: 'HEAT', count: 3.9 }), 3,
  'fractional authored capacities are normalized to whole rounds');
for (const invalidCount of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.equal(shellAmmunitionCapacity({ type: 'HEAT', count: invalidCount }), 16,
    'invalid authored capacities fall back to their shell-type default');
}
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

{
  const guarded = createAmmunitionState([{ type: 'APFSDS', count: 2 }]);
  for (const invalidSlot of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 1]) {
    assert.equal(hasAmmunition(guarded, invalidSlot), false,
      `invalid slot ${String(invalidSlot)} is never treated as stocked slot 1`);
    assert.equal(consumeAmmunition(guarded, invalidSlot), false,
      `invalid slot ${String(invalidSlot)} cannot consume slot 1 ammunition`);
  }
  assert.equal(guarded.ammo[0], 2,
    'invalid slot probes leave the real inventory untouched');
}

{
  const corrupt = {
    ammo: [Number.NaN, Number.POSITIVE_INFINITY, -4, 1.9, 99],
    ammoCapacity: [5, 5, 5, 5, 5],
  };
  assert.equal(firstAvailableAmmunitionSlot(corrupt), 3,
    'availability skips non-finite and negative corrupted counts');
  assert.equal(totalAmmunition(corrupt), 100,
    'totals ignore invalid counts and normalize fractional rounds');
  assert.deepEqual(replenishAmmunition(corrupt), {
    added: [1, 0, 1, 1, 0],
    totalAdded: 3,
  }, 'resupply repairs malformed counts and clamps over-capacity inventory');
  assert.deepEqual(corrupt.ammo, [1, 5, 1, 2, 5]);
}

assert.deepEqual(createAmmunitionState(null), { ammo: [], ammoCapacity: [] },
  'a missing loadout creates a safe empty inventory');
assert.deepEqual(replenishAmmunition({ ammo: [0], ammoCapacity: [0] }), {
  added: [0], totalAdded: 0,
}, 'a zero-capacity channel cannot synthesize ammunition');
assert.deepEqual(replenishAmmunition({ ammo: [0, 0], ammoCapacity: [5] }), {
  added: [1, 0], totalAdded: 1,
}, 'mismatched inventory arrays only replenish their shared authored range');

console.log('ammunition.selftest: authored inventory, consumption, and cache replenishment passed');
