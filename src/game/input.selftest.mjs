import assert from 'node:assert/strict';
import { DEFAULT_BINDINGS } from './input.js';

assert.equal(DEFAULT_BINDINGS.sniperToggle, 'ShiftLeft',
  'Shift remains the established sniper toggle');
assert.equal(DEFAULT_BINDINGS.freeLook, 'AltLeft',
  'left Alt provides a dedicated hold-to-free-look modifier');
assert.notEqual(DEFAULT_BINDINGS.freeLook, DEFAULT_BINDINGS.sniperToggle,
  'free look never steals the sniper binding');

console.log('input.selftest: sniper and dedicated hold-to-free-look defaults passed');
