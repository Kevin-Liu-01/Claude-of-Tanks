import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import badlands from './maps/badlands.ts';

// 2026-10-01 (frozen pins retired): this receipt used to `git show` the 78640f623 Badlands module and hold every
// non-material authoring field, the historical palette projection and the rock tone's hue/saturation/mean to it.
// Those were change detectors of history. The material contract is now absolute: a quiet red-rock wash with bounded
// ripple/strata/banding, a finite red-rock tone with real bed variation, and the authoring wired to the production
// terrain and horizon painters.
function assertQuietWash(config) {
  // Retain a trace of small wind-scour relief without the old .616 strength
  // of the never-fading distant dune-bed branch.
  assert.ok(config.splat.rippleAmp > 0 && config.splat.rippleAmp <= .06);
  assert.ok(Math.min(config.splat.rippleAmp * 2.2, 1) < .14);
  // (ground lane, wave 62: the walls "smooth, plaster-like … identical wavy dark squiggles … a stamped pattern rather than
  // sandstone") the walls' bedding is the material's at the wall's scale — beds, rust beds, joint blocks and varnish
  // (strata ≤ .13, six tenths of the joints) — and the sandstone tile draws no marker beds or partings of its own
  assert.ok(config.splat.strata > 0 && config.splat.strata <= .13);
  assert.equal(config.splat.sandstoneMarkers, 0, 'no stamped marker beds from the tile');
  assert.ok(config.horizon.banding > 0 && config.horizon.banding <= .06);
  for (let i = 0; i <= 100; i++) {
    const tone = config.splat.rockTone(.06, .40, i / 100);
    assert.ok(tone.every(Number.isFinite), 'finite rock tone');
    assert.ok(tone[0] >= 0 && tone[0] <= .1, 'red-rock hue');
    assert.ok(tone[1] > .1 && tone[1] <= .6, 'muted but present red-rock saturation');
  }
  const range = config.splat.rockTone(0, .4, 1)[2] - config.splat.rockTone(0, .4, 0)[2];
  assert.ok(range >= .25 && range <= .40, 'retain real bed tone variation without high-contrast repeating seams');
}
assertQuietWash(badlands);
// The rejected floor-wide dune relief (rippleAmp .28, strata .14) and a flat featureless tone must both fail, and so must
// the tile's own marker beds back on its walls.
assert.throws(() => assertQuietWash({ ...badlands, splat: { ...badlands.splat, rippleAmp: .28, strata: .14 } }),
  { code: 'ERR_ASSERTION' }, 'old floor-wide dune relief is rejected');
assert.throws(() => assertQuietWash({ ...badlands, splat: { ...badlands.splat, rockTone: () => [.045, .248, .43] } }),
  { code: 'ERR_ASSERTION' }, 'flat featureless replacement cannot pass');
assert.throws(() => assertQuietWash({ ...badlands, splat: { ...badlands.splat, sandstoneMarkers: 1 } }),
  { code: 'ERR_ASSERTION' }, 'the tile\'s stamped marker beds are rejected');

// These are actual production uniform/painter connections, not replacement
// test equations standing in for a disconnected config.
const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.match(terrain, /shader\.uniforms\.uStrata = \{ value: S\.strata \?\? 0 \}/);
assert.match(terrain, /S\.rippleAmp \?\? 0/);
assert.match(terrain, /makeSandstoneLayer\(3002, aniso, S\.rockTone \|\| null, S\.sandstoneMarkers \?\? 1\)/);
assert.match(terrain, /float bedW = min\(uRipple\.z \* 2\.2, 1\.0\)/);
const horizonSource = readFileSync(new URL('./maps/horizon.ts', import.meta.url), 'utf8');
assert.match(horizonSource, /banding: horizon\.banding \?\?/);
console.log('redrockMaterial: bounded wash/bedding contrast, red-rock tone and wired authoring PASS');
