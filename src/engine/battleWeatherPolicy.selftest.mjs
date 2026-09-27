import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BATTLE_TIMES, BATTLE_WEATHER_VERSION, selectBattleWeather } from './battleWeatherPolicy.ts';

const biomes = ['temperate', 'arid', 'tropical', 'cold', 'coastal'];
assert.equal(BATTLE_WEATHER_VERSION, 3);

// These are protocol fixtures, not expectations produced by a second copy of
// the implementation. Version 3 adds sunset while preserving the shipped night domain
// and these day/night fixtures, seed normalization and legacy descriptor field name.
const fixtures = [
  [0, 'temperate', { version: 3, seed: 0, biome: 'temperate', condition: 'clear',
    timeOfDay: 'day', precipitationIntensity: 0, cloudOpacityMultiplier: 1, fogDensityMultiplier: 1 }],
  [1337, 'tropical', { version: 3, seed: 1337, biome: 'tropical', condition: 'clear',
    timeOfDay: 'day', precipitationIntensity: 0, cloudOpacityMultiplier: 1, fogDensityMultiplier: 1 }],
  [3, 'cold', { version: 3, seed: 3, biome: 'cold', condition: 'clear',
    timeOfDay: 'night', precipitationIntensity: 0, cloudOpacityMultiplier: 1, fogDensityMultiplier: 1 }],
  [16, 'cold', { version: 3, seed: 16, biome: 'cold', condition: 'clear',
    timeOfDay: 'night', precipitationIntensity: 0, cloudOpacityMultiplier: 1, fogDensityMultiplier: 1 }],
  [2002, 'arid', { version: 3, seed: 2002, biome: 'arid', condition: 'clear',
    timeOfDay: 'night', precipitationIntensity: 0, cloudOpacityMultiplier: 1, fogDensityMultiplier: 1 }],
];
for (const [seed, biome, expected] of fixtures) {
  assert.deepEqual(selectBattleWeather(seed, biome), expected);
}

function checkSelection(seed, biome) {
  const value = selectBattleWeather(seed, biome);
  assert.deepEqual(value, selectBattleWeather(seed, biome), 'repeat/peer selection is exact');
  assert.equal(value.seed, seed >>> 0);
  assert.equal(value.biome, biome);
  assert.equal(Object.isFrozen(value), true, 'a consumer cannot mutate the match descriptor');
  assert.equal(value.version, 3);
  assert.equal(value.condition, 'clear');
  assert.ok(['day', 'sunset', 'night'].includes(value.timeOfDay));
  assert.equal(value.cloudOpacityMultiplier, 1);
  assert.equal(value.fogDensityMultiplier, 1);
  assert.equal(value.precipitationIntensity, 0);
  return value;
}

const random = Math.random;
Math.random = () => { throw new Error('Weather must not use a global random stream'); };
try {
  for (const biome of biomes) {
    const counts = new Map();
    const times = new Map();
    for (let seed = 0; seed < 2048; seed++) {
      const value = checkSelection(seed, biome);
      counts.set(value.condition, (counts.get(value.condition) ?? 0) + 1);
      times.set(value.timeOfDay, (times.get(value.timeOfDay) ?? 0) + 1);
      assert.equal(value.timeOfDay, selectBattleWeather(seed, 'temperate').timeOfDay,
        'day/night domain remains independent of biome');
    }
    assert.deepEqual([...counts], [['clear', 2048]], 'no seed can select rain, snow or randomized fog');
    assert.ok(times.get('night') > 250 && times.get('night') < 600, 'night is bounded minority');
    assert.ok(times.get('day') > times.get('night'));
  }
} finally { Math.random = random; }

for (const biome of biomes) {
  assert.deepEqual(selectBattleWeather(-1, biome), selectBattleWeather(0xffffffff, biome));
  assert.deepEqual(selectBattleWeather(1337, biome), selectBattleWeather(2 ** 32 + 1337, biome),
    'normalization matches the existing combat/lobby seed path');
  const first = selectBattleWeather(1337, biome);
  selectBattleWeather(99, biome);
  assert.deepEqual(first, selectBattleWeather(1337, biome), 'unrelated match ordering has no effect');
  assert.notStrictEqual(first, selectBattleWeather(1337, biome), 'no cross-match retained object cache');
}
for (const seed of [NaN, Infinity, -Infinity, .5, Number.MAX_SAFE_INTEGER + 1, null, '1337']) {
  assert.throws(() => selectBattleWeather(seed, 'temperate'), /safe integer seed/);
}
for (const biome of ['', 'winter', '__proto__', 'constructor', null, undefined]) {
  assert.throws(() => selectBattleWeather(1337, biome), /Unknown battle weather biome/);
}
const source = readFileSync(new URL('./battleWeatherPolicy.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /^import\s/m, 'pure policy must not import renderer, quality, map or fleet owners');
assert.doesNotMatch(source, /Math\.random\(|Date\.|performance\.|setTimeout\(|requestAnimationFrame\(/,
  'no time, scheduler or global random dependency');
for (let mask = 1; mask < 8; mask++) {
  const enabled = BATTLE_TIMES.filter((_, i) => mask & (1 << i));
  for (let seed = 0; seed < 256; seed++) {
    const actual = selectBattleWeather(seed, 'temperate', enabled);
    assert.ok(enabled.includes(actual.timeOfDay));
    assert.deepEqual(actual, selectBattleWeather(seed, 'temperate', [...enabled].reverse()), 'UI order cannot re-key weather');
  }
}
assert.throws(() => selectBattleWeather(0, 'temperate', []), /At least one/);
assert.throws(() => selectBattleWeather(0, 'temperate', ['dawn']), /valid time/);
const sunsetCount = Array.from({length:2048}, (_,seed) => selectBattleWeather(seed,'temperate')).filter(x=>x.timeOfDay==='sunset').length;
assert.ok(sunsetCount > 300 && sunsetCount < 500, 'sunset is a real seeded possibility');
assert.doesNotMatch(source, /battleWeatherParticleBudget|selectCondition/);
console.log('battleWeatherPolicy self-test: clear-only v3, exact seeded day/night fixtures and no resource/clock ownership PASS');
