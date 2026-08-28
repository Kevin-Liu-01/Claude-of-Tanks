import assert from 'node:assert/strict';
import { DEFAULT_BINDINGS, migrateShiftAimCapsFreeLookBindings } from './input.ts';
import './armorAimOverlay.selftest.mjs';

assert.equal(DEFAULT_BINDINGS.sniperToggle, 'ShiftLeft',
  'left Shift toggles sniper mode');
assert.equal(DEFAULT_BINDINGS.freeLook, 'CapsLock',
  'Caps Lock is the dedicated hold-to-free-look modifier');

const shiftFreeLookPrimary = { sniperToggle: null, freeLook: 'ShiftLeft' };
const shiftFreeLookSecondary = { freeLook: 'AltLeft' };
assert.equal(migrateShiftAimCapsFreeLookBindings(
  shiftFreeLookPrimary, shiftFreeLookSecondary), true);
assert.deepEqual(shiftFreeLookPrimary, { sniperToggle: 'ShiftLeft', freeLook: 'CapsLock' },
  'current defaults migrate Shift back to aiming and Caps Lock onto free look');
assert.equal(shiftFreeLookSecondary.freeLook, 'AltLeft',
  'the old Alt shortcut remains available as a secondary free-look key');

const legacyPrimary = { sniperToggle: 'ShiftLeft', freeLook: 'AltLeft' };
const legacySecondary = {};
assert.equal(migrateShiftAimCapsFreeLookBindings(legacyPrimary, legacySecondary), true);
assert.deepEqual(legacyPrimary, { sniperToggle: 'ShiftLeft', freeLook: 'CapsLock' },
  'older Shift-aim defaults gain the Caps Lock free-look hold');
assert.equal(legacySecondary.freeLook, 'AltLeft',
  'older defaults retain Left Alt as their secondary free-look key');

const customPrimary = { sniperToggle: 'KeyV', freeLook: 'KeyX' };
assert.equal(migrateShiftAimCapsFreeLookBindings(customPrimary, {}), false);
assert.deepEqual(customPrimary, { sniperToggle: 'KeyV', freeLook: 'KeyX' },
  'intentional custom bindings are preserved');

const capsCollision = { sniperToggle: null, freeLook: 'ShiftLeft', shotLog: 'CapsLock' };
assert.equal(migrateShiftAimCapsFreeLookBindings(capsCollision, {}), false);
assert.deepEqual(capsCollision,
  { sniperToggle: null, freeLook: 'ShiftLeft', shotLog: 'CapsLock' },
  'a custom Caps Lock binding is never overwritten');

console.log('input.selftest: Shift aim and Caps Lock free-look migration passed');
