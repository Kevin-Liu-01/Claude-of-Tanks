import assert from 'node:assert/strict';
import {
  MOBILE_OUTPUT_PIXEL_BUDGET,
  outputPixelRatio,
  outputResolution,
  uiPixelRatio,
} from './resolutionPolicy.ts';

assert.equal(outputPixelRatio({ width: 892, height: 412, devicePixelRatio: 3, mobile: true }), 3,
  'DPR-3 phone landscapes must receive a native backing store');
assert.equal(outputPixelRatio({ width: 430, height: 932, devicePixelRatio: 3, mobile: true }), 3,
  'representative DPR-3 phone portraits remain below the pixel budget');
assert.equal(outputPixelRatio({ width: 1440, height: 900, devicePixelRatio: 3, mobile: false }), 2,
  'desktop output retains its established DPR-2 cap');
assert.equal(outputPixelRatio({ width: 2000, height: 2000, devicePixelRatio: 3 }), 2,
  'omitting the mobile flag remains a desktop decision');

const tablet = outputResolution({ width: 1024, height: 1366, devicePixelRatio: 2, mobile: true });
assert.equal(tablet.native, false, 'large tablet output is budget limited');
assert.equal(tablet.budgetLimited, true);
assert.ok(tablet.outputPixels <= MOBILE_OUTPUT_PIXEL_BUDGET + tablet.bufferWidth + tablet.bufferHeight,
  'rounding may add only a boundary row/column beyond the pixel budget');
assert.equal(uiPixelRatio(220, 220, 3, true), 3, 'compact mobile HUD canvases stay device-native');
assert.equal(uiPixelRatio(220, 220, 3, false), 2, 'desktop HUD canvases retain their established cap');

assert.deepEqual(outputResolution({ width: 100, height: 50, devicePixelRatio: 2 }), {
  width: 100,
  height: 50,
  devicePixelRatio: 2,
  pixelRatio: 2,
  bufferWidth: 200,
  bufferHeight: 100,
  outputPixels: 20_000,
  native: true,
  budgetLimited: false,
}, 'diagnostics preserve exact non-square backing-store arithmetic');

const cappedDesktop = outputResolution({ width: 100, height: 50, devicePixelRatio: 3 });
assert.equal(cappedDesktop.native, false);
assert.equal(cappedDesktop.budgetLimited, false,
  'desktop DPR caps are not mislabeled as mobile budget pressure');

assert.equal(outputResolution({
  width: 100,
  height: 100,
  devicePixelRatio: 3,
  mobile: true,
}).budgetLimited, false, 'a native DPR-3 phone is not budget-limited');
assert.equal(outputResolution({
  width: 100,
  height: 100,
  devicePixelRatio: 2,
  mobile: true,
}).budgetLimited, false, 'a native DPR-2 phone compares against its device density, not the cap');

const budgetBoundary = outputResolution({
  width: 1000,
  height: 1000,
  devicePixelRatio: 3,
  mobile: true,
  mobilePixelBudget: 8_994_001,
});
assert.equal(budgetBoundary.pixelRatio, 2.999);
assert.equal(budgetBoundary.budgetLimited, false,
  'the 0.001 diagnostic tolerance boundary is inclusive');

assert.equal(outputPixelRatio(), 1, 'missing resolution evidence uses a safe DPR-1 default');
assert.equal(outputPixelRatio({ devicePixelRatio: Number.NaN }), 1,
  'non-finite display density cannot poison canvas sizing');
assert.equal(outputPixelRatio({
  width: -4,
  height: 0,
  devicePixelRatio: 4,
  mobile: true,
  mobilePixelBudget: Number.POSITIVE_INFINITY,
}), 3, 'invalid mobile dimensions and budgets fall back without exceeding the DPR cap');

const sanitized = outputResolution({
  width: Number.NaN,
  height: -10,
  devicePixelRatio: null,
});
assert.deepEqual(sanitized, {
  width: 1,
  height: 1,
  devicePixelRatio: 1,
  pixelRatio: 1,
  bufferWidth: 1,
  bufferHeight: 1,
  outputPixels: 1,
  native: true,
  budgetLimited: false,
}, 'invalid external viewport evidence resolves to one finite output pixel');

assert.equal(uiPixelRatio(220, 220, undefined, false), 1,
  'headless HUD sizing has an explicit DPR-1 default');
globalThis.window = { devicePixelRatio: 2.5 };
assert.equal(uiPixelRatio(220, 220), 2,
  'browser HUD sizing defaults to the live display density and desktop cap');
delete globalThis.window;

console.log('resolutionPolicy self-test passed');
