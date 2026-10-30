import assert from 'node:assert/strict';
import {
  MOBILE_OUTPUT_PIXEL_BUDGET, DESKTOP_OUTPUT_PIXEL_BUDGET, WIDE_ASPECT_REFERENCE,
  desktopOutputBudget,
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
assert.equal(outputPixelRatio({ width: 2000, height: 2000, devicePixelRatio: 3 }), 1.44,
  'large desktop windows respect the output-pixel budget');

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

for (const [width, height] of [[2560, 1440], [3840, 2160], [5120, 2880]]) {
  const r = outputResolution({ width, height, devicePixelRatio: 2 });
  assert.ok(r.outputPixels <= DESKTOP_OUTPUT_PIXEL_BUDGET + r.bufferWidth + r.bufferHeight);
  assert.equal(r.budgetLimited, true);
}
assert.equal(outputResolution({ width: 1920, height: 1080, devicePixelRatio: 2 }).pixelRatio, 2,
  'ordinary Retina output keeps the same crisp native pixels');

// (local-fps-265) the 3D canvas of a window wider than 16:9 gets the 16:9 share of the desktop budget
{
  const wide = (width, height, devicePixelRatio) => outputResolution({ width, height, devicePixelRatio, wideAspectBudget: true });
  // the owner's 32:9 G95NC at "looks like 3840x1080": 5430x1527 (the 4K budget) before, a native-density 32:9's 3840x1080 now
  const before = outputResolution({ width: 3840, height: 1080, devicePixelRatio: 2 });
  assert.equal(before.bufferWidth, 5431);
  const g95 = wide(3840, 1080, 2);
  assert.equal(g95.pixelRatio, 1, 'a DPR-2 32:9 window backs its 3D canvas at its CSS pixels');
  assert.deepEqual([g95.bufferWidth, g95.bufferHeight], [3840, 1080]);
  assert.equal(g95.budgetLimited, true);
  assert.ok(Math.abs(desktopOutputBudget(3840, 1080, true) - DESKTOP_OUTPUT_PIXEL_BUDGET / 2) < 1e-6, '32:9 is twice 16:9: half the budget');
  // the same 32:9 at native density was inside its share already
  assert.equal(wide(3840, 1080, 1).pixelRatio, 1);
  // a 16:9 or 16:10 window keeps the whole budget: no 16:9 screen softens
  for (const [w, h, dpr] of [[1728, 1117, 2], [1920, 1080, 2], [2560, 1440, 2], [1280, 720, 1], [3840, 2160, 1]]) {
    assert.equal(wide(w, h, dpr).pixelRatio, outputPixelRatio({ width: w, height: h, devicePixelRatio: dpr }), `${w}x${h}@${dpr} unchanged`);
  }
  assert.equal(desktopOutputBudget(1920, 1080, true), DESKTOP_OUTPUT_PIXEL_BUDGET, 'exactly 16:9 is served whole');
  // a 21:9 at native density stays native (its share, 6.2 MP, is past its 5 MP)
  assert.equal(wide(3440, 1440, 1).pixelRatio, 1);
  // the HUD's canvases never take the share: a full-screen sight on the 32:9 keeps the DPR-2 cap's budget
  assert.equal(uiPixelRatio(3840, 1080, 2, false), before.pixelRatio);
  // a portrait or square desktop window is not wide
  assert.equal(desktopOutputBudget(1000, 2000, true), DESKTOP_OUTPUT_PIXEL_BUDGET);
  assert.equal(WIDE_ASPECT_REFERENCE, 16 / 9);
}
