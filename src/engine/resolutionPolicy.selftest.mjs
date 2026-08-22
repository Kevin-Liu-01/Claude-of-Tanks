import assert from 'node:assert/strict';
import {
  MOBILE_OUTPUT_PIXEL_BUDGET,
  outputPixelRatio,
  outputResolution,
  uiPixelRatio,
} from './resolutionPolicy.js';

assert.equal(outputPixelRatio({ width: 892, height: 412, devicePixelRatio: 3, mobile: true }), 3,
  'DPR-3 phone landscapes must receive a native backing store');
assert.equal(outputPixelRatio({ width: 430, height: 932, devicePixelRatio: 3, mobile: true }), 3,
  'representative DPR-3 phone portraits remain below the pixel budget');
assert.equal(outputPixelRatio({ width: 1440, height: 900, devicePixelRatio: 3, mobile: false }), 2,
  'desktop output retains its established DPR-2 cap');

const tablet = outputResolution({ width: 1024, height: 1366, devicePixelRatio: 2, mobile: true });
assert.equal(tablet.native, false, 'large tablet output is budget limited');
assert.equal(tablet.budgetLimited, true);
assert.ok(tablet.outputPixels <= MOBILE_OUTPUT_PIXEL_BUDGET + tablet.bufferWidth + tablet.bufferHeight,
  'rounding may add only a boundary row/column beyond the pixel budget');
assert.equal(uiPixelRatio(220, 220, 3, true), 3, 'compact mobile HUD canvases stay device-native');
assert.equal(uiPixelRatio(220, 220, 3, false), 2, 'desktop HUD canvases retain their established cap');

console.log('resolutionPolicy self-test passed');
