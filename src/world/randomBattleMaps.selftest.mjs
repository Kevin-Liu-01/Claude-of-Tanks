import assert from 'node:assert/strict';
import {
  MAP_IDS,
  RANDOM_BATTLE_MAP_IDS,
  resolveMapId,
} from './maps/index.ts';

assert.ok(Object.isFrozen(MAP_IDS), 'the canonical battlefield registry is immutable');
// 2026-09-19: Mars (Olympus Basin) is reached through Mars mode, never by the random draw
assert.ok(Object.isFrozen(RANDOM_BATTLE_MAP_IDS), 'the random-battle roster is immutable');
assert.deepEqual([...RANDOM_BATTLE_MAP_IDS], MAP_IDS.filter((id) => id !== 'mars'),
  'Random Battle draws every canonical battlefield except Mars');
assert.ok(MAP_IDS.includes('mars') && !RANDOM_BATTLE_MAP_IDS.includes('mars'), 'Mars stays registered but out of the draw');

const bucketCenters = RANDOM_BATTLE_MAP_IDS.map((_, index) => (index + 0.5) / RANDOM_BATTLE_MAP_IDS.length);
assert.deepEqual(
  bucketCenters.map((sample) => resolveMapId('random', () => sample)),
  [...RANDOM_BATTLE_MAP_IDS],
  'every random-battle battlefield owns an equal reachable Random Battle bucket',
);
assert.equal(resolveMapId('random', () => 0), MAP_IDS[0],
  'the lower RNG boundary selects the first battlefield');
assert.equal(resolveMapId('random', () => 1), RANDOM_BATTLE_MAP_IDS.at(-1),
  'the inclusive upper test boundary safely selects the final battlefield');
assert.equal(resolveMapId('random', () => Number.NaN), MAP_IDS[0],
  'invalid RNG input fails closed to a real battlefield');

for (const mapId of MAP_IDS) {
  assert.equal(resolveMapId(mapId, () => 0.75), mapId,
    `an explicit ${mapId} selection is never rerolled`);
}

console.log(`randomBattleMaps.selftest: all ${MAP_IDS.length} battlefields are eligible`);
