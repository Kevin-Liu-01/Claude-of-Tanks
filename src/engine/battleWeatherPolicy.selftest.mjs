import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BATTLE_TIMES, BATTLE_WEATHER_VERSION, selectBattleWeather } from './battleWeatherPolicy.ts';

const biomes = ['temperate', 'arid', 'tropical', 'cold', 'coastal'];
assert.equal(BATTLE_WEATHER_VERSION, 4);

// Version 4 changes the seeded time mapping; keep receipts explicit.
for (const [seed, timeOfDay] of [[0, 'day'], [1, 'sunset'], [5, 'night'], [1337, 'day']]) {
  assert.deepEqual(selectBattleWeather(seed, 'temperate'), {
    version: 4, seed, biome: 'temperate', condition: 'clear', timeOfDay,
    precipitationIntensity: 0, cloudOpacityMultiplier: 1, fogDensityMultiplier: 1,
  });
}

function checkSelection(seed, biome) {
  const value = selectBattleWeather(seed, biome);
  assert.deepEqual(value, selectBattleWeather(seed, biome), 'repeat/peer selection is exact');
  assert.equal(value.seed, seed >>> 0);
  assert.equal(value.biome, biome);
  assert.equal(Object.isFrozen(value), true, 'a consumer cannot mutate the match descriptor');
  assert.equal(value.version, 4);
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
    assert.ok(times.get('night') > 150 && times.get('night') < 260, 'night is bounded minority');
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
// All seven preference combinations retain 60:30:10 relative weights. A large
// deterministic sample catches accidental uniform fallback and disabled choices.
const weights = { day: 60, sunset: 30, night: 10 };
const sampleSize = 65536;
for (let mask = 1; mask < 8; mask++) {
  const enabled = BATTLE_TIMES.filter((_, i) => mask & (1 << i));
  const counts = { day: 0, sunset: 0, night: 0 };
  const totalWeight = enabled.reduce((total, time) => total + weights[time], 0);
  for (let seed = 0; seed < sampleSize; seed++) {
    const actual = selectBattleWeather(seed, 'temperate', enabled);
    assert.ok(enabled.includes(actual.timeOfDay));
    counts[actual.timeOfDay]++;
    if (seed < 256) {
      assert.deepEqual(actual, selectBattleWeather(seed, 'temperate', [...enabled].reverse()),
        'UI order cannot re-key weather');
      assert.deepEqual(actual, selectBattleWeather(seed, 'temperate', [...enabled, ...enabled]),
        'duplicate preferences cannot increase a time’s odds');
    }
  }
  for (const time of BATTLE_TIMES) {
    const expected = enabled.includes(time) ? weights[time] / totalWeight : 0;
    assert.ok(Math.abs(counts[time] / sampleSize - expected) < 0.01,
      `${enabled.join('/')} preserves the intended ${time} share`);
  }
  console.log(`  ${enabled.join('/')} selections: ${JSON.stringify(counts)}`);
}
assert.throws(() => selectBattleWeather(0, 'temperate', []), /At least one/);
assert.throws(() => selectBattleWeather(0, 'temperate', ['dawn']), /valid time/);
assert.doesNotMatch(source, /battleWeatherParticleBudget|selectCondition/);
console.log('battleWeatherPolicy self-test: clear-only v4, weighted seeded day/sunset/night and no resource/clock ownership PASS');
