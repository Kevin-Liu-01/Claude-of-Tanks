import assert from 'node:assert/strict';
import { pendingAmmoSelectionSlot } from './ammoSelectionPresentation.ts';

const combat = Object.freeze({ destroyed: false, ammo: Object.freeze([24, 4, 0]) });
const player = Object.freeze({ isPlayer: true, _networkShellSlot: 0,
  input: Object.freeze({ shellSlot: 1 }), combat });
assert.equal(pendingAmmoSelectionSlot(player), 1,
  'old ready authority must not make a requested missile channel appear ready');
assert.equal(pendingAmmoSelectionSlot({ ...player, _networkShellSlot: 1 }), null,
  'matching authority immediately ends pending presentation');
assert.equal(pendingAmmoSelectionSlot({ ...player, input: { shellSlot: 0 } }), null,
  'cancellation back to the authoritative slot does not invent another load cycle');
assert.equal(pendingAmmoSelectionSlot({ ...player, input: { shellSlot: 0 },
  _networkAmmoSelectionPending: true }), 0,
  'an unacknowledged cancellation remains pending even when its slot matches older authority');
assert.equal(pendingAmmoSelectionSlot({ ...player, input: { shellSlot: 0 },
  _networkAmmoSelectionPending: false }), null,
  'a covered acknowledgement clears cancellation presentation');
assert.equal(pendingAmmoSelectionSlot({ ...player, _networkShellSlot: undefined }), null,
  'solo has no network confirmation wait');
assert.equal(pendingAmmoSelectionSlot({ ...player, isPlayer: false }), null,
  'remote/spectator entities never expose player intent');
assert.equal(pendingAmmoSelectionSlot({ ...player, combat: { ...combat, destroyed: true } }), null);
assert.equal(pendingAmmoSelectionSlot({ ...player, combat: null }), null);
assert.equal(pendingAmmoSelectionSlot({ ...player, input: null }), null);
assert.equal(pendingAmmoSelectionSlot(null), null, 'disconnect/replacement has no retained owner or timer');
for (const slot of [-1, 3, 0.5, NaN, Infinity, undefined]) {
  assert.equal(pendingAmmoSelectionSlot({ ...player, input: { shellSlot: slot } }), null);
  assert.equal(pendingAmmoSelectionSlot({ ...player, _networkShellSlot: slot }), null);
}
for (const ammo of [0, -1, NaN, Infinity, undefined]) {
  assert.equal(pendingAmmoSelectionSlot({ ...player, combat: { ammo: [24, ammo, 0] } }), null,
    'rejection/depletion cannot retain an indefinite pending indicator');
}
assert.deepEqual(player.input, { shellSlot: 1 });
assert.deepEqual(player.combat.ammo, [24, 4, 0]);
console.log('ammoSelectionPresentation.selftest: pending, authority settlement, rejection and lifecycle PASS');
