import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BATTLE_WEATHER_VERSION, battleWeatherParticleBudget, selectBattleWeather } from './battleWeatherPolicy.ts';

const biomes = ['temperate', 'arid', 'tropical', 'cold', 'coastal'];
assert.equal(BATTLE_WEATHER_VERSION, 1);
for (const [preset, budget] of [['low', 0], ['mobile-low', 0], ['mobile', 64], ['mobile-high', 64],
  ['medium', 128], ['high', 384], ['ultra', 768], ['unknown', 0], ['constructor', 0]]) {
  assert.equal(battleWeatherParticleBudget(preset), budget);
}

// These are protocol fixtures, not expectations produced by a second copy of
// the implementation. A deliberate selection change requires versioning.
const fixtures = [
  [0, 'temperate', { version: 1, seed: 0, biome: 'temperate', condition: 'clear',
    timeOfDay: 'day', precipitationIntensity: 0, cloudOpacityMultiplier: 1, fogDensityMultiplier: 1 }],
  [1337, 'tropical', { version: 1, seed: 1337, biome: 'tropical', condition: 'rain',
    timeOfDay: 'day', precipitationIntensity: .627, cloudOpacityMultiplier: 1.30, fogDensityMultiplier: 1.20 }],
  [3, 'cold', { version: 1, seed: 3, biome: 'cold', condition: 'snow',
    timeOfDay: 'night', precipitationIntensity: .457, cloudOpacityMultiplier: 1.30, fogDensityMultiplier: 1.20 }],
  [16, 'cold', { version: 1, seed: 16, biome: 'cold', condition: 'fog',
    timeOfDay: 'night', precipitationIntensity: 0, cloudOpacityMultiplier: 1.15, fogDensityMultiplier: 1.40 }],
  [2002, 'arid', { version: 1, seed: 2002, biome: 'arid', condition: 'clear',
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
  assert.ok(['clear', 'fog', 'rain', 'snow'].includes(value.condition));
  assert.ok(['day', 'night'].includes(value.timeOfDay));
  assert.ok(value.cloudOpacityMultiplier >= 1 && value.cloudOpacityMultiplier <= 1.30);
  assert.ok(value.fogDensityMultiplier >= 1 && value.fogDensityMultiplier <= 1.50);
  const wet = value.condition === 'rain' || value.condition === 'snow';
  assert.ok(wet ? value.precipitationIntensity >= .35 && value.precipitationIntensity <= .70
    : value.precipitationIntensity === 0);
  if (biome === 'arid') assert.ok(!wet, 'dry-biome policy cannot create snow or rain');
  if (value.condition === 'snow') assert.equal(biome, 'cold');
  if (biome === 'cold') assert.notEqual(value.condition, 'rain', 'frozen biome keeps snow precipitation');
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
        'day/night domain is independent of biome/precipitation branch');
    }
    assert.ok(counts.get('clear') > 100 && counts.get('fog') > 100, 'both dry choices reachable');
    if (biome !== 'arid') assert.ok(counts.get(biome === 'cold' ? 'snow' : 'rain') > 100);
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
console.log('battleWeatherPolicy self-test: deterministic biome/weather/day selection, bounds and no resource/clock ownership PASS');
