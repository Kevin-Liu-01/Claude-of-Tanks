import assert from 'node:assert/strict';
import {
  MAP_IDS,
  RANDOM_BATTLE_MAP_IDS,
  resolveMapId,
} from './maps/index.js';

assert.ok(Object.isFrozen(MAP_IDS), 'the canonical battlefield registry is immutable');
assert.strictEqual(RANDOM_BATTLE_MAP_IDS, MAP_IDS,
  'Random Battle aliases the complete canonical battlefield registry');

const bucketCenters = MAP_IDS.map((_, index) => (index + 0.5) / MAP_IDS.length);
assert.deepEqual(
  bucketCenters.map((sample) => resolveMapId('random', () => sample)),
  MAP_IDS,
  'every registered battlefield owns an equal reachable Random Battle bucket',
);
assert.equal(resolveMapId('random', () => 0), MAP_IDS[0],
  'the lower RNG boundary selects the first battlefield');
assert.equal(resolveMapId('random', () => 1), MAP_IDS.at(-1),
  'the inclusive upper test boundary safely selects the final battlefield');
assert.equal(resolveMapId('random', () => Number.NaN), MAP_IDS[0],
  'invalid RNG input fails closed to a real battlefield');

for (const mapId of MAP_IDS) {
  assert.equal(resolveMapId(mapId, () => 0.75), mapId,
    `an explicit ${mapId} selection is never rerolled`);
}

console.log(`randomBattleMaps.selftest: all ${MAP_IDS.length} battlefields are eligible`);
