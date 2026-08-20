import assert from 'node:assert/strict';
import { DEFAULT_BINDINGS, migrateShiftFreeLookBindings } from './input.js';

assert.equal(DEFAULT_BINDINGS.sniperToggle, null,
  'sniper mode has no default keyboard binding');
assert.equal(DEFAULT_BINDINGS.freeLook, 'ShiftLeft',
  'left Shift is the dedicated hold-to-free-look modifier');

const legacyPrimary = { sniperToggle: 'ShiftLeft', freeLook: 'AltLeft' };
const legacySecondary = {};
assert.equal(migrateShiftFreeLookBindings(legacyPrimary, legacySecondary), true);
assert.deepEqual(legacyPrimary, { sniperToggle: null, freeLook: 'ShiftLeft' },
  'legacy defaults migrate Shift away from aiming and onto free look');
assert.equal(legacySecondary.freeLook, 'AltLeft',
  'the old Alt shortcut remains available as a secondary free-look key');

const customPrimary = { sniperToggle: 'KeyV', freeLook: 'KeyX' };
assert.equal(migrateShiftFreeLookBindings(customPrimary, {}), false);
assert.deepEqual(customPrimary, { sniperToggle: 'KeyV', freeLook: 'KeyX' },
  'intentional custom bindings are preserved');

console.log('input.selftest: Shift free-look defaults and legacy migration passed');
