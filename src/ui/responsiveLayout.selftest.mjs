import assert from 'node:assert/strict';
import {
  VIEWPORT_HEIGHT_BANDS,
  VIEWPORT_WIDTH_BANDS,
  classifyViewport,
  viewportHeightBand,
  viewportWidthBand,
} from './responsiveLayout.ts';
import { RESPONSIVE_SURFACES_CSS } from './responsiveSurfaces.ts';

assert.deepEqual(VIEWPORT_WIDTH_BANDS.phone, { min: 0, max: 519 });
assert.deepEqual(VIEWPORT_WIDTH_BANDS.desktop, { min: 1440, max: Infinity });
assert.deepEqual(VIEWPORT_HEIGHT_BANDS.short, { min: 0, max: 519 });
assert.deepEqual(VIEWPORT_HEIGHT_BANDS.tall, { min: 900, max: Infinity });

for (const [width, band] of [
  [0, 'phone'], [519, 'phone'], [520, 'compact'], [767, 'compact'],
  [768, 'tablet'], [1099, 'tablet'], [1100, 'laptop'], [1439, 'laptop'],
  [1440, 'desktop'], [2560, 'desktop'],
]) assert.equal(viewportWidthBand(width), band, `width ${width} should be ${band}`);

for (const [height, band] of [
  [0, 'short'], [519, 'short'], [520, 'compact'], [719, 'compact'],
  [720, 'standard'], [899, 'standard'], [900, 'tall'], [1440, 'tall'],
]) assert.equal(viewportHeightBand(height), band, `height ${height} should be ${band}`);

const matrix = [
  [320, 480, 'phone', 'short', 'portrait', true],
  [320, 568, 'phone', 'compact', 'portrait', true],
  [344, 882, 'phone', 'standard', 'portrait', true],
  [360, 640, 'phone', 'compact', 'portrait', true],
  [360, 780, 'phone', 'standard', 'portrait', true],
  [375, 667, 'phone', 'compact', 'portrait', true],
  [390, 844, 'phone', 'standard', 'portrait', true],
  [393, 852, 'phone', 'standard', 'portrait', true],
  [412, 915, 'phone', 'tall', 'portrait', true],
  [430, 932, 'phone', 'tall', 'portrait', true],
  [480, 800, 'phone', 'standard', 'portrait', true],
  [507, 768, 'phone', 'standard', 'portrait', true],
  [512, 768, 'phone', 'standard', 'portrait', true],
  [540, 720, 'compact', 'standard', 'portrait', true],
  [600, 800, 'compact', 'standard', 'portrait', true],
  [600, 960, 'compact', 'tall', 'portrait', true],
  [712, 1138, 'compact', 'tall', 'portrait', true],
  [375, 320, 'phone', 'short', 'landscape', true],
  [568, 320, 'compact', 'short', 'landscape', true],
  [667, 375, 'compact', 'short', 'landscape', true],
  [844, 390, 'tablet', 'short', 'landscape', true],
  [768, 600, 'tablet', 'compact', 'landscape', true],
  [768, 1024, 'tablet', 'tall', 'portrait', true],
  [810, 1080, 'tablet', 'tall', 'portrait', true],
  [820, 1180, 'tablet', 'tall', 'portrait', true],
  [834, 1194, 'tablet', 'tall', 'portrait', true],
  [912, 1368, 'tablet', 'tall', 'portrait', true],
  [1024, 768, 'tablet', 'standard', 'landscape', true],
  [1024, 1366, 'tablet', 'tall', 'portrait', true],
  [1112, 834, 'laptop', 'standard', 'landscape', true],
  [1194, 834, 'laptop', 'standard', 'landscape', true],
  [1194, 834, 'laptop', 'standard', 'landscape', true, true],
  [1180, 820, 'laptop', 'standard', 'landscape', true, true],
  [1280, 600, 'laptop', 'compact', 'landscape', false],
  [1280, 480, 'laptop', 'short', 'landscape', true],
  [1280, 720, 'laptop', 'standard', 'landscape', false],
  [1280, 800, 'laptop', 'standard', 'landscape', false],
  [1366, 768, 'laptop', 'standard', 'landscape', false],
  [1366, 1024, 'laptop', 'tall', 'landscape', true],
  [1366, 1024, 'laptop', 'tall', 'landscape', true, true],
  [1368, 912, 'laptop', 'tall', 'landscape', true],
  [1368, 912, 'laptop', 'tall', 'landscape', true, true],
  [1440, 900, 'desktop', 'tall', 'landscape', false],
  [1512, 982, 'desktop', 'tall', 'landscape', false],
  [1600, 900, 'desktop', 'tall', 'landscape', false],
  [1728, 1117, 'desktop', 'tall', 'landscape', false],
  [1920, 1080, 'desktop', 'tall', 'landscape', false],
  [2560, 1080, 'desktop', 'tall', 'landscape', false],
  [2560, 1440, 'desktop', 'tall', 'landscape', false],
  [3440, 1440, 'desktop', 'tall', 'landscape', false],
  [3840, 2160, 'desktop', 'tall', 'landscape', false],
];

for (const [width, height, widthBand, heightBand, orientation, overlayPanels, forceCoarse] of matrix) {
  const coarsePointer = forceCoarse ?? width < 1100;
  const layout = classifyViewport({ width, height, coarsePointer, hover: !coarsePointer });
  assert.equal(layout.widthBand, widthBand, `${width}x${height} width band`);
  assert.equal(layout.heightBand, heightBand, `${width}x${height} height band`);
  assert.equal(layout.widthDensity, width <= 380 ? 'narrow' : 'roomy', `${width}x${height} width density`);
  assert.equal(layout.heightDensity, height <= 430 ? 'tight' : 'roomy', `${width}x${height} height density`);
  assert.equal(layout.orientation, orientation, `${width}x${height} orientation`);
  assert.equal(layout.overlayPanels, overlayPanels, `${width}x${height} panel policy`);
  assert.ok(layout.scale >= 0.78 && layout.scale <= 1.08, `${width}x${height} scale stays bounded`);
  assert.equal(layout.input, coarsePointer ? 'coarse' : 'fine', `${width}x${height} input mode`);
}

assert.match(RESPONSIVE_SURFACES_CSS, /body\[data-cot-width='tablet'\] \.cot-set-panel/,
  'settings must consume the shared tablet contract');
assert.match(RESPONSIVE_SURFACES_CSS, /body\[data-cot-width='phone'\] \.cot-si-diag\{display:none\}/,
  'phone hit reports must remove right-side penetration diagrams');
assert.match(RESPONSIVE_SURFACES_CSS, /body\[data-cot-height='short'\] \.cot-studio \.dock/,
  'Studio must have a short-screen composition independent of device width');
assert.match(RESPONSIVE_SURFACES_CSS, /body\[data-cot-width='tablet'\]\[data-cot-orientation='portrait'\] \.cot-es/,
  'after-action reports must handle portrait tablets beyond legacy phone widths');

console.log(`responsive viewport contract: PASS (${matrix.length} representative viewports)`);
