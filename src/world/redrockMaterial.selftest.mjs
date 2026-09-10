import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import badlands from './maps/badlands.ts';
import { historicalBadlandsInput } from './shorelineHistoryTestOracle.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const base = '78640f623e12cb55243acfd4cbf895764c2c8123';
const originalSource = execFileSync('git', ['show', `${base}:src/world/maps/badlands.ts`], { cwd: root, encoding: 'utf8' });
const original = (await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(originalSource)).toString('base64'))).default;
const serialize = value => JSON.stringify(value, (_key, item) => typeof item === 'function' ? item.toString() : item);

// Material authoring only: existing canyon support, props, routes, water,
// species, budgets, light and every unlisted material setting remain exact.
const { banding: _candidateBanding, ...horizon } = badlands.horizon;
assert.equal(serialize({ ...badlands, horizon, splat: { ...badlands.splat,
  rippleAmp: original.splat.rippleAmp, strata: original.splat.strata,
  rockTone: original.splat.rockTone } }), serialize(original));

function assertQuietWash(config) {
  // Retain a trace of small wind-scour relief without the old .616 strength
  // of the never-fading distant dune-bed branch.
  assert.ok(config.splat.rippleAmp > 0 && config.splat.rippleAmp <= .06);
  assert.ok(Math.min(config.splat.rippleAmp * 2.2, 1) < .14);
  assert.ok(config.splat.strata > 0 && config.splat.strata <= .05);
  assert.ok(config.horizon.banding > 0 && config.horizon.banding <= .06);
  let meanDelta = 0;
  for (let i = 0; i <= 100; i++) {
    const luminance = i / 100;
    const oldTone = original.splat.rockTone(.06, .40, luminance);
    const tone = config.splat.rockTone(.06, .40, luminance);
    assert.deepEqual(tone.slice(0, 2), oldTone.slice(0, 2), 'retain red-rock hue and saturation');
    assert.ok(tone.every(Number.isFinite));
    meanDelta += tone[2] - oldTone[2];
  }
  const range = config.splat.rockTone(0, .4, 1)[2] - config.splat.rockTone(0, .4, 0)[2];
  assert.ok(range >= .25 && range <= .40, 'retain real bed tone variation without high-contrast repeating seams');
  assert.ok(Math.abs(meanDelta / 101) < .05, 'contrast reduction is not a blanket brightness wash');
}
assertQuietWash(badlands);
assert.throws(() => assertQuietWash(original), { code: 'ERR_ASSERTION' }, 'old floor-wide dune relief is rejected');
assert.throws(() => assertQuietWash({ ...badlands, splat: { ...badlands.splat, rockTone: () => [.045, .248, .43] } }),
  { code: 'ERR_ASSERTION' }, 'flat featureless replacement cannot pass');

// These are actual production uniform/painter connections, not replacement
// test equations standing in for a disconnected config.
const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.match(terrain, /shader\.uniforms\.uStrata = \{ value: S\.strata \?\? 0 \}/);
assert.match(terrain, /S\.rippleAmp \?\? 0/);
assert.match(terrain, /makeSandstoneLayer\(3002, aniso, S\.rockTone \|\| null\)/);
assert.match(terrain, /float bedW = min\(uRipple\.z \* 2\.2, 1\.0\)/);
const horizonSource = readFileSync(new URL('./maps/horizon.ts', import.meta.url), 'utf8');
assert.match(horizonSource, /banding: horizon\.banding \?\?/);

// Older all-map fixture tests still execute their exact original palette;
// their immutable config/geometry/pixel goldens are never regenerated here.
const historical = historicalBadlandsInput(badlands);
assert.equal(serialize(historical.splat), serialize(original.splat));
assert.equal(serialize(historical.horizon), serialize(original.horizon));
console.log('redrockMaterial: bounded wash/bedding contrast, wired authoring, unchanged canyon/gameplay and exact historical palettes PASS');
