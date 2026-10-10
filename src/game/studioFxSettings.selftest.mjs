// Scene Studio `fx` block + cinematic effect parameter schema (pure).
import assert from 'node:assert/strict';
import {
  STUDIO_FX_QUALITIES, STUDIO_FX_PARAMS, normalizeStudioFx, studioFxState, fxParam, flareColor,
} from './studioFxSettings.ts';

// Backward compatibility: scenes without the block keep the battle look.
assert.deepEqual(normalizeStudioFx(undefined), { quality: 'battle', trackDust: false });
assert.deepEqual(normalizeStudioFx({ quality: 'bogus' }), { quality: 'battle', trackDust: false });
assert.equal(studioFxState(normalizeStudioFx(null)), null, 'default settings serialize to no block');

// Cinematic implies track dust unless explicitly disabled.
assert.deepEqual(normalizeStudioFx({ quality: 'cinematic' }), { quality: 'cinematic', trackDust: true });
assert.deepEqual(normalizeStudioFx({ quality: 'cinematic', trackDust: false }), { quality: 'cinematic', trackDust: false });
assert.deepEqual(normalizeStudioFx({ trackDust: true }), { quality: 'battle', trackDust: true });

// state() -> load() -> state() is identity for every combination.
for (const quality of STUDIO_FX_QUALITIES) {
  for (const trackDust of [true, false]) {
    const settings = { quality, trackDust };
    const block = studioFxState(settings);
    assert.deepEqual(normalizeStudioFx(block), settings, `${quality}/${trackDust} round-trips`);
    if (block) assert.deepEqual(studioFxState(normalizeStudioFx(JSON.parse(JSON.stringify(block)))), block);
  }
}
assert.deepEqual(studioFxState({ quality: 'cinematic', trackDust: true }), { quality: 'cinematic' });

// Parameter schema: defaults inside ranges, clamping, unknown keys rejected.
for (const [type, defs] of Object.entries(STUDIO_FX_PARAMS)) {
  const keys = new Set();
  for (const def of defs) {
    assert.ok(!keys.has(def.key), `${type}.${def.key} unique`);
    keys.add(def.key);
    assert.ok(def.min < def.max && def.value >= def.min && def.value <= def.max, `${type}.${def.key} default in range`);
    assert.ok(def.step > 0 && def.step <= def.max - def.min, `${type}.${def.key} step`);
    assert.equal(def.label, `studioPanel.fxParam.${def.key}`);
    assert.equal(fxParam(type, def.key, undefined), def.value);
    assert.equal(fxParam(type, def.key, def.max * 10 + 1), def.max);
    assert.equal(fxParam(type, def.key, def.min - 1000), def.min);
    assert.equal(fxParam(type, def.key, Number.NaN), def.value);
  }
}
assert.throws(() => fxParam('flare', 'nonsense', 1), RangeError);
assert.equal(flareColor('red'), 0xff4a2a);
assert.equal(flareColor('purple'), flareColor('white'), 'unknown flare colours fall back to white');

console.log('studioFxSettings.selftest: fx block defaults, round-trip and parameter schema hold');
