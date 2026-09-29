import assert from 'node:assert/strict';
import { automaticPlayerName, normalizePlayerName } from './playerNames.ts';

assert.equal(normalizePlayerName('  Tank   Commander  '), 'Tank Commander', 'inner runs of whitespace collapse, the ends trim');
assert.equal(normalizePlayerName(''), '');
assert.equal(normalizePlayerName(null), '');
assert.equal(normalizePlayerName(42), '42', 'a number is stringified like any other value');
assert.ok(normalizePlayerName('x'.repeat(200)).length <= 24, 'a name is bounded');
assert.equal(automaticPlayerName('stable-browser-id'), automaticPlayerName('stable-browser-id'),
  'the automatic callsign is stable for one browser identity');
assert.notEqual(automaticPlayerName('stable-browser-id'), automaticPlayerName('other-browser-id'),
  'different identities get different callsigns');
assert.ok(automaticPlayerName('stable-browser-id').length > 0);
console.log('playerNames.selftest: normalization bounds and the stable automatic callsign passed');
