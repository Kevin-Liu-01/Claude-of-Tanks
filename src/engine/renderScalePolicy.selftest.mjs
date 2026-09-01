import assert from 'node:assert/strict';
import './resolutionPolicy.selftest.mjs';
import {
  baseDynamicScale,
  cappedPixelRatio,
  dynamicScaleFloor,
  internalPixelRatio,
  overloadReliefLever,
  reconstructionMode,
  reconstructionSharpness,
} from './renderScalePolicy.ts';
import { PRESETS } from './quality.ts';

const high = {
  maxPixelRatio: 1.5,
  adaptiveBasePixelRatio: 1.5,
  dynMin: 0.9,
};

assert.equal(cappedPixelRatio(2, high), 1.5);
assert.equal(cappedPixelRatio(0, null), 1,
  'invalid renderer density resolves to a finite native fallback');
assert.equal(cappedPixelRatio(Number.NaN, { maxPixelRatio: Number.NaN }), 1);
assert.equal(cappedPixelRatio(2, { maxPixelRatio: 0 }), 2,
  'non-positive preset caps cannot collapse the post chain');
assert.equal(cappedPixelRatio(2, { maxPixelRatio: '1.25' }), 2,
  'runtime string caps are rejected rather than silently coercing resolution');
assert.equal(baseDynamicScale(2, high), 1,
  'desktop High must start at its full configured density');
assert.equal(baseDynamicScale(2, null), 1);
assert.equal(baseDynamicScale(2, { adaptiveBasePixelRatio: Number.NaN }), 1);
assert.equal(baseDynamicScale(2, { adaptiveBasePixelRatio: 0 }), 1);
assert.equal(baseDynamicScale(2, { adaptiveBasePixelRatio: '1' }), 1,
  'runtime string bases cannot override the numeric preset contract');
assert.equal(baseDynamicScale(2, { adaptiveBasePixelRatio: 0.001 }), 0.005,
  'positive authored bases retain a non-zero safety floor');
assert.equal(dynamicScaleFloor(2, high), 0.9);
assert.equal(dynamicScaleFloor(2, null), 0.75);
assert.equal(dynamicScaleFloor(2, { dynMin: Number.NaN }), 0.75);
assert.equal(dynamicScaleFloor(1.25, high), 0.9,
  'the DPR-1 safety fence ends at the exact retina threshold');
assert.equal(internalPixelRatio(2, high, 0.75), 1.35,
  'desktop High must never fall back to the old muddy 1.125 ratio');

const ultra = { maxPixelRatio: 2, dynMin: 0.75 };
assert.equal(cappedPixelRatio(2, ultra), 2,
  'Ultra should reach native density on a DPR-2 display');
assert.equal(internalPixelRatio(2, ultra, 0.75), 1.5,
  'Ultra fallback must remain at least the full High ceiling');

const nativeDesktop = { maxPixelRatio: 1, dynMin: 0.75 };
assert.equal(dynamicScaleFloor(1, nativeDesktop), 1);
assert.equal(internalPixelRatio(1, nativeDesktop, 0.5), 1,
  'DPR-1 desktop output must not be softened below native CSS density');

const desktopFallback = { maxPixelRatio: 1, dynMin: 1 };
assert.equal(internalPixelRatio(2, desktopFallback, 0.5), 1,
  'desktop fallback tiers must not double-downscale below CSS density');

assert.equal(PRESETS.mobile.msaaSamples, 0,
  'balanced mobile must not allocate a multisampled half-float scene target');
assert.deepEqual(PRESETS.mobile.shadowMapSizes, [1024, 768, 512, 512],
  'balanced mobile shadows must retain a bounded resident footprint');
assert.equal(PRESETS.mobile.vehicleTextureScale, 0.75,
  'mobile vehicle textures must not inherit the harsher world-texture scale');
assert.equal(baseDynamicScale(3, PRESETS.mobile), 1.25 / 1.4,
  'balanced mobile begins above one scene sample per CSS pixel');
assert.equal(dynamicScaleFloor(3, PRESETS.mobile), 0.715,
  'balanced mobile retains a bounded but readable dynamic floor');
assert.ok(internalPixelRatio(3, PRESETS.mobile, 0.1) >= 1,
  'balanced mobile must never fall below CSS-native scene density');

assert.equal(overloadReliefLever(0, 1, 1, 0.9), 'trim',
  'AO/session trim must be the first overload response');
assert.equal(overloadReliefLever(1, 1, 1, 0.9), 'resolution',
  'resolution may move only after the trim is exhausted');
assert.equal(overloadReliefLever(1, 1, 0.9, 0.9), 'tier',
  'tier fallback owns overload after the readable floor');
assert.equal(overloadReliefLever(0, 0, 1, 0.6), 'resolution',
  'AO-free mobile presets proceed directly to their raster lever');

assert.equal(reconstructionSharpness(1), 0.12);
assert.ok(Math.abs(reconstructionSharpness(0.75) - 0.28) < 1e-12,
  'High retains the proven 0.28 RCAS recovery at a 75% input ratio');
assert.equal(reconstructionSharpness(0.5), 0.4,
  'the recovery policy remains capped even when a caller requests it');
assert.equal(reconstructionSharpness(-1), 0.4);
assert.equal(reconstructionSharpness(Number.NaN), 0.4);
assert.equal(reconstructionSharpness(2), 0.12);
assert.equal(reconstructionMode(0.75), 'easu+rcas');
assert.equal(reconstructionMode(0.467), 'easu');
assert.equal(reconstructionMode(0.333), 'linear',
  'heavily reduced mobile sources must not pay for 12-tap native-output EASU');
assert.equal(reconstructionMode(0.4), 'easu',
  'the exact linear/EASU boundary belongs to EASU');
assert.equal(reconstructionMode(0.6), 'easu+rcas',
  'the exact EASU/RCAS boundary restores contrast');
assert.equal(reconstructionMode(1), 'native-rcas');
assert.equal(reconstructionMode(2), 'native-rcas');
assert.equal(reconstructionMode(Number.NaN), 'linear');

console.log('renderScalePolicy self-test passed');
