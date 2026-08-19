import assert from 'node:assert/strict';
import {
  baseDynamicScale,
  cappedPixelRatio,
  dynamicScaleFloor,
  internalPixelRatio,
  overloadReliefLever,
  reconstructionSharpness,
} from './renderScalePolicy.js';

const high = {
  maxPixelRatio: 1.5,
  adaptiveBasePixelRatio: 1.5,
  dynMin: 0.9,
};

assert.equal(cappedPixelRatio(2, high), 1.5);
assert.equal(baseDynamicScale(2, high), 1,
  'desktop High must start at its full configured density');
assert.equal(dynamicScaleFloor(2, high), 0.9);
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

const mobile = {
  maxPixelRatio: 1.25,
  adaptiveBasePixelRatio: 1,
  dynMin: 0.6,
};
assert.equal(baseDynamicScale(2, mobile), 0.8,
  'mobile keeps its constrained starting density');
assert.equal(dynamicScaleFloor(2, mobile), 0.6,
  'mobile keeps its explicit memory/performance floor');

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
  'larger Medium/Low reconstructions receive stronger but capped recovery');

console.log('renderScalePolicy self-test passed');
