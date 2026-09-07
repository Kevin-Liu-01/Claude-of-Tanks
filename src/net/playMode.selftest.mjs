import assert from 'node:assert/strict';
import { normalizePlayMode } from './playMode.ts';

for (const mode of ['solo', 'private', 'lan']) assert.equal(normalizePlayMode(mode), mode);
assert.equal(normalizePlayMode('ranked'), 'private', 'retired saved selection opens supported multiplayer');
for (const value of ['', null, undefined, false, 0, {}, [], 'bogus', 'PRIVATE']) {
  assert.equal(normalizePlayMode(value), 'solo', 'invalid mode cannot expose a hidden entry path');
}
console.log('playMode.selftest: supported entry modes and retired/invalid selection normalization passed');
