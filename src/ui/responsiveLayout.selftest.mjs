import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import {
  VIEWPORT_HEIGHT_BANDS,
  VIEWPORT_WIDTH_BANDS,
  classifyViewport,
  installResponsiveLayout,
  isPinchZoomed,
  layoutViewportSize,
  pinchFactor,
  viewportHeightBand,
  viewportWidthBand,
} from './responsiveLayout.ts';
const RESPONSIVE_SURFACES_CSS = await readFile(
  new URL('./responsiveSurfaces.css', import.meta.url),
  'utf8',
);
const GARAGE_CSS = await readFile(new URL('./garage.css', import.meta.url), 'utf8');
const INDEX_HTML = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const HOME_CSS = await readFile(new URL('../../public/home.css', import.meta.url), 'utf8');
const GALLERY_CSS = await readFile(new URL('../gallery/gallery.css', import.meta.url), 'utf8');
const PUBLIC_NAV_CSS = await readFile(new URL('../presentation/publicNav.css', import.meta.url), 'utf8');

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
  // 2026-09-19 panel policy: fine-pointer windows keep persistent sidebars from 900 px up; coarse pointers,
  // sub-900 widths and short heights still fold them into overlays
  [880, 640, 'tablet', 'compact', 'landscape', true, false],
  [900, 640, 'tablet', 'compact', 'landscape', false, false],
  [960, 640, 'tablet', 'compact', 'landscape', false, false],
  [1000, 646, 'tablet', 'compact', 'landscape', false, false],
  [1024, 768, 'tablet', 'standard', 'landscape', false, false],
  [1024, 500, 'tablet', 'short', 'landscape', true, false],
  [1112, 834, 'laptop', 'standard', 'landscape', false],
  [1194, 834, 'laptop', 'standard', 'landscape', false],
  [1194, 834, 'laptop', 'standard', 'landscape', true, true],
  [1180, 820, 'laptop', 'standard', 'landscape', true, true],
  [1280, 600, 'laptop', 'compact', 'landscape', false],
  [1280, 480, 'laptop', 'short', 'landscape', true],
  [1280, 720, 'laptop', 'standard', 'landscape', false],
  [1280, 800, 'laptop', 'standard', 'landscape', false],
  [1366, 768, 'laptop', 'standard', 'landscape', false],
  [1366, 1024, 'laptop', 'tall', 'landscape', false],
  [1366, 1024, 'laptop', 'tall', 'landscape', true, true],
  [1368, 912, 'laptop', 'tall', 'landscape', false],
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

{
  const viewportListeners = new Map();
  const windowListeners = new Map();
  const properties = new Map();
  const events = [];
  let queuedFrame = null;
  const visualViewport = {
    width: 430,
    height: 613,
    offsetLeft: 0,
    offsetTop: 0,
    scale: 1,
    addEventListener(type, callback) { viewportListeners.set(type, callback); },
    removeEventListener(type, callback) {
      if (viewportListeners.get(type) === callback) viewportListeners.delete(type);
    },
  };
  const mediaQuery = matches => ({
    matches,
    addEventListener() {},
    removeEventListener() {},
  });
  const win = {
    innerWidth: 430,
    innerHeight: 733,
    visualViewport,
    matchMedia(query) { return mediaQuery(query === '(pointer: coarse)'); },
    addEventListener(type, callback) { windowListeners.set(type, callback); },
    removeEventListener(type, callback) {
      if (windowListeners.get(type) === callback) windowListeners.delete(type);
    },
    requestAnimationFrame(callback) { queuedFrame = callback; return 1; },
    cancelAnimationFrame() { queuedFrame = null; },
    dispatchEvent(event) { events.push(event); return true; },
  };
  const doc = {
    body: { dataset: {} },
    documentElement: {
      clientWidth: 430,
      style: { setProperty(name, value) { properties.set(name, value); } },
    },
  };
  win.document = doc;

  const handle = installResponsiveLayout(win, doc);
  assert.equal(properties.get('--cot-viewport-height'), '613px',
    'the visual viewport, not the stale layout viewport, owns fullscreen height');
  assert.equal(properties.get('--cot-viewport-width'), '430px');
  assert.equal(doc.body.dataset.cotViewport, 'visual');
  for (const unread of ['--cot-viewport-offset-left', '--cot-viewport-offset-top', '--cot-viewport-scale']) {
    assert.equal(properties.has(unread), false, `${unread} has no consumer and is not written`);
  }
  assert.equal(events.length, 1);

  visualViewport.height = 733;
  visualViewport.offsetTop = 22;
  viewportListeners.get('scroll')();
  assert.ok(queuedFrame, 'visual viewport scroll at scale 1 schedules one synchronized layout');
  queuedFrame();
  queuedFrame = null;
  assert.equal(properties.get('--cot-viewport-height'), '733px');
  assert.equal(handle.snapshot().height, 733);
  assert.equal(handle.snapshot().offsetTop, 22, 'the snapshot still reports the scale-1 keyboard offset');
  assert.equal(events.length, 2,
    'exact visual viewport changes emit even when the semantic height band stays unchanged');

  visualViewport.offsetTop = 40;
  viewportListeners.get('scroll')();
  queuedFrame();
  queuedFrame = null;
  assert.equal(events.length, 2, 'an offset-only change at scale 1 is not a layout change');

  // an iOS pinch with the keyboard up keeps the keyboard-shrunk visible height, unzoomed
  visualViewport.scale = 2;
  visualViewport.width = 215;
  visualViewport.height = 366.5;
  visualViewport.offsetTop = 300;
  viewportListeners.get('resize')();
  queuedFrame();
  queuedFrame = null;
  assert.equal(properties.get('--cot-viewport-height'), '733px');
  assert.equal(properties.get('--cot-viewport-width'), '430px');
  assert.equal(events.length, 2, 'a pinch over the iOS keyboard case is still no layout change');

  handle.destroy();
  assert.equal(viewportListeners.has('resize'), false);
  assert.equal(viewportListeners.has('scroll'), false);
  assert.equal(windowListeners.has('resize'), false);
}

// ---------------------------------------------------------------------------------------------------------------
// A trackpad pinch (2026-10-15, owner: "using both my fingers on track pad to like expand the screen in landing
// causes a bunch of weirdness and layout shifts"). Chrome, Firefox and Safari zoom the VISUAL viewport: its scale
// rises, its width and height shrink to the layout size / scale, its offsets follow the pan, and window 'resize'
// never fires. Nothing about the layout may move: no size variable, band, panel policy or cot:layoutchange.
// a window as the browser reports it: the root's clientWidth is the layout viewport, which no pinch changes
const browserWindow = (innerWidth, innerHeight, visualViewport, clientWidth = innerWidth) => ({
  innerWidth, innerHeight, visualViewport, document: { documentElement: { clientWidth } },
});
assert.deepEqual(layoutViewportSize({ innerWidth: 1440, innerHeight: 900 }),
  { width: 1440, height: 900, offsetLeft: 0, offsetTop: 0, visualScale: 1, pinchFactor: 1 },
  'no visualViewport: the window size');
assert.deepEqual(layoutViewportSize(browserWindow(1440, 900,
  { width: 720, height: 450, offsetLeft: 360, offsetTop: 225, scale: 2 })),
{ width: 1440, height: 900, offsetLeft: 0, offsetTop: 0, visualScale: 2, pinchFactor: 2 },
'a 2x pinch measures the visible area unmagnified, with no offsets');
assert.equal(layoutViewportSize(browserWindow(1440, 900, { width: 1425, height: 900, scale: 1 }, 1425)).width, 1425,
  'a classic scrollbar: the visual viewport and clientWidth both exclude it');
assert.equal(layoutViewportSize(browserWindow(1440, 900, { width: 712.50037, height: 450.0002, scale: 2 }, 1425)).width,
  1425, 'and a pinch over it measures that same width (Chrome: 712.50037 x 2)');
assert.equal(layoutViewportSize(browserWindow(1440, 900, { width: 1440, height: 900, scale: Number.NaN })).width, 1440,
  'a nonsense scale changes nothing');
assert.equal(layoutViewportSize(browserWindow(215, 400, { width: 215, height: 366.5, scale: 2 }, 430)).width, 430,
  'WebKit iOS shrinks innerWidth under a pinch: the visual viewport and clientWidth, not innerWidth, give the real width');
// iOS rests at a page scale other than 1 with no pinch (2026-10-16 iOS 26.5 simulator review). The factor is the
// layout viewport over the visual one, never visualViewport.scale: visual size x scale oversized or shrank the app.
{
  const pageZoom = browserWindow(322, 571, { width: 322, height: 571, scale: 1.25 }, 322);
  assert.deepEqual(layoutViewportSize(pageZoom),
    { width: 322, height: 571, offsetLeft: 0, offsetTop: 0, visualScale: 1.25, pinchFactor: 1 },
    'Safari page zoom 125 % at rest (scale 1.25, no pinch) lays out at the visible 322x571, not 403x714');
  assert.equal(isPinchZoomed(pageZoom), false, 'page zoom alone is not a pinch');
  const pinchedFromPageZoom = browserWindow(161, 285.5, { width: 161, height: 285.5, scale: 2.5 }, 322);
  assert.deepEqual([layoutViewportSize(pinchedFromPageZoom).width, layoutViewportSize(pinchedFromPageZoom).height],
    [322, 571], 'a pinch from that rest (1.25 -> 2.5) still measures 322x571');
  assert.equal(isPinchZoomed(pinchedFromPageZoom), true);
  const minimumEffectiveWidth = browserWindow(1024, 2226, { width: 1024, height: 2226, scale: 0.392578 }, 1024);
  assert.deepEqual([layoutViewportSize(minimumEffectiveWidth).width, layoutViewportSize(minimumEffectiveWidth).height],
    [1024, 2226], 'an iPad window shrunk to fit Safari\'s 1024 px minimum effective width (rest scale 0.39) lays out at 1024, not 402');
  const pinchedFromShrink = browserWindow(1024, 2226, { width: 512, height: 1113, scale: 0.785156 }, 1024);
  assert.deepEqual([layoutViewportSize(pinchedFromShrink).width, layoutViewportSize(pinchedFromShrink).height],
    [1024, 2226], 'a 2x pinch from that shrunk rest measures the same 1024x2226');
  assert.equal(layoutViewportSize(browserWindow(1440, 900, { width: 1440, height: 900, scale: 2 })).width, 1440,
    'a scale above 1 whose visual width did not shrink is no pinch (no engine can inflate the layout)');
  assert.equal(layoutViewportSize(browserWindow(402, 700, { width: 500, height: 870.6, scale: 0.804 }, 402)).width, 402,
    'a page zoomed out past its layout (wide content fitted to the screen) still lays out at its real width');
}
assert.equal(pinchFactor(1440, 1440), 1);
assert.equal(pinchFactor(1439.28, 1440), 1, 'within a pixel of the layout width the page is at rest (clientWidth is whole pixels)');
assert.equal(pinchFactor(411.4286, 411), 1, 'a fractional device-pixel ratio at rest');
assert.equal(pinchFactor(720, 1440), 2);
assert.equal(pinchFactor(720, 0), 1, 'no layout reading: the measurement before 2026-10-16');
assert.equal(pinchFactor(undefined, 1440), 1);
assert.equal(isPinchZoomed(browserWindow(1440, 900, { width: 1440, scale: 1 })), false);
assert.equal(isPinchZoomed(browserWindow(1440, 900, { width: 1432.8, scale: 1.005 })), true,
  'a pinch of more than a pixel is a pinch');
assert.equal(isPinchZoomed(browserWindow(1440, 900, { width: 1107.7, scale: 1.3 })), true);
assert.equal(isPinchZoomed(browserWindow(1440, 900, null)), false);
assert.equal(isPinchZoomed(undefined), false);

{
  const viewportListeners = new Map();
  const windowListeners = new Map();
  const properties = new Map();
  let propertyWrites = 0;
  let datasetWrites = 0;
  const events = [];
  let queuedFrame = null;
  const runFrame = () => { const frame = queuedFrame; queuedFrame = null; frame?.(); };
  const visualViewport = {
    width: 1440, height: 900, offsetLeft: 0, offsetTop: 0, scale: 1,
    addEventListener(type, callback) { viewportListeners.set(type, callback); },
    removeEventListener(type, callback) { if (viewportListeners.get(type) === callback) viewportListeners.delete(type); },
  };
  const mediaQuery = (matches) => ({ matches, addEventListener() {}, removeEventListener() {} });
  const win = {
    innerWidth: 1440,
    innerHeight: 900,
    visualViewport,
    matchMedia(query) { return mediaQuery(query === '(hover: hover)'); },
    addEventListener(type, callback) { windowListeners.set(type, callback); },
    removeEventListener(type, callback) { if (windowListeners.get(type) === callback) windowListeners.delete(type); },
    requestAnimationFrame(callback) { queuedFrame = callback; return 1; },
    cancelAnimationFrame() { queuedFrame = null; },
    dispatchEvent(event) { events.push(event); return true; },
  };
  const dataset = new Proxy({}, { set(target, key, value) { datasetWrites++; target[key] = value; return true; } });
  const doc = {
    body: { dataset },
    documentElement: {
      // the layout viewport: the window (no classic scrollbar), whatever the pinch does
      get clientWidth() { return win.innerWidth; },
      style: { setProperty(name, value) { propertyWrites++; properties.set(name, value); } },
    },
  };
  win.document = doc;
  const handle = installResponsiveLayout(win, doc);
  const desktop = { width: '1440px', height: '900px', bands: 'desktop/tall/persistent' };
  const state = () => ({
    width: properties.get('--cot-viewport-width'),
    height: properties.get('--cot-viewport-height'),
    bands: `${dataset.cotWidth}/${dataset.cotHeight}/${dataset.cotPanels}`,
  });
  assert.deepEqual(state(), desktop);
  assert.equal(events.length, 1);
  const writesAtRest = { properties: propertyWrites, dataset: datasetWrites };
  const pinch = (scale, { left = 0, top = 0, width = 1440, height = 900 } = {}) => {
    Object.assign(visualViewport, { scale, width: width / scale, height: height / scale, offsetLeft: left, offsetTop: top });
    viewportListeners.get('resize')();
    runFrame();
  };

  // the gesture: every zoom step on the way in and out, the same measurements the probe recorded on 1440x900. Its
  // first and last steps sit within a pixel of rest (1440 / 1.0005 = 1439.28): the rounding pixel is held because the
  // scale moved with it.
  for (const scale of [1.0005, 1.05, 1.15, 1.31, 1.363, 1.7, 1.875, 2, 2.9, 3, 2, 1.4, 1.01, 1.0004, 1]) {
    pinch(scale, { left: (1440 - 1440 / scale) / 2, top: (900 - 900 / scale) / 2 });
    assert.deepEqual(state(), desktop, `a ${scale}x pinch leaves the size variables and bands alone`);
  }
  assert.equal(events.length, 1, 'a whole pinch gesture dispatches no cot:layoutchange');
  assert.deepEqual({ properties: propertyWrites, dataset: datasetWrites }, writesAtRest,
    'a pinch writes no custom property and no body attribute (no document restyle)');
  assert.equal(handle.snapshot().width, 1440);
  assert.equal(handle.snapshot().widthBand, 'desktop');

  // panning while zoomed moves only the offsets: not even a measurement is scheduled
  pinch(2, { left: 360, top: 225 });
  for (let step = 0; step < 36; step++) {
    visualViewport.offsetLeft = 360 + step * 10;
    visualViewport.offsetTop = 225 - step * 5;
    viewportListeners.get('scroll')();
    assert.equal(queuedFrame, null, 'a zoomed pan schedules no layout frame');
  }
  assert.equal(events.length, 1, 'a zoomed pan dispatches nothing');

  // float rounding of visual size x scale never wobbles the layout
  Object.assign(visualViewport, { scale: 1.7, width: 847.0588, height: 529.4118 });
  viewportListeners.get('resize')();
  runFrame();
  Object.assign(visualViewport, { scale: 2, width: 720.5, height: 450.4 });
  viewportListeners.get('resize')();
  runFrame();
  assert.deepEqual(state(), desktop, 'a pixel of rounding inside a pinch is held');
  assert.equal(events.length, 1);

  // a real window resize while zoomed still relayouts, then pinching back out to 1 changes nothing
  win.innerWidth = 1200;
  Object.assign(visualViewport, { scale: 2, width: 600, height: 450 });
  windowListeners.get('resize')();
  runFrame();
  assert.equal(properties.get('--cot-viewport-width'), '1200px', 'a real resize while zoomed is a layout change');
  assert.equal(dataset.cotWidth, 'laptop');
  assert.equal(events.length, 2);
  pinch(1, { width: 1200 });
  assert.equal(properties.get('--cot-viewport-width'), '1200px');
  assert.equal(events.length, 2, 'un-zooming after the resize is no layout change');

  // browser zoom (cmd +/-) is a real relayout: window resize, scale stays 1, the CSS-px viewport shrinks
  win.innerWidth = 1309;
  win.innerHeight = 818;
  Object.assign(visualViewport, { scale: 1, width: 1309.0909, height: 818.1818, offsetLeft: 0, offsetTop: 0 });
  windowListeners.get('resize')();
  runFrame();
  assert.equal(properties.get('--cot-viewport-width'), '1309px');
  assert.equal(properties.get('--cot-viewport-height'), '818px');
  assert.equal(`${dataset.cotWidth}/${dataset.cotHeight}`, 'laptop/standard');
  assert.equal(events.length, 3, 'browser zoom dispatches its relayout');

  handle.destroy();
  assert.equal(viewportListeners.size, 0);
  assert.equal(windowListeners.size, 0);
}

// iOS Safari page zoom (aA 125 %) rests at visualViewport.scale 1.25 with no pinch: the app lays out at the visible
// 322x571, the keyboard still measures at that rest, and a pinch from it only magnifies
{
  const viewportListeners = new Map();
  const properties = new Map();
  const events = [];
  let queuedFrame = null;
  const runFrame = () => { const frame = queuedFrame; queuedFrame = null; frame?.(); };
  const visualViewport = {
    width: 322, height: 571, offsetLeft: 0, offsetTop: 0, scale: 1.25,
    addEventListener(type, callback) { viewportListeners.set(type, callback); },
    removeEventListener(type, callback) { if (viewportListeners.get(type) === callback) viewportListeners.delete(type); },
  };
  const win = {
    innerWidth: 322, innerHeight: 571, visualViewport,
    matchMedia(query) { return { matches: query === '(pointer: coarse)', addEventListener() {}, removeEventListener() {} }; },
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(callback) { queuedFrame = callback; return 1; },
    cancelAnimationFrame() { queuedFrame = null; },
    dispatchEvent(event) { events.push(event); return true; },
  };
  const doc = {
    body: { dataset: {} },
    documentElement: { clientWidth: 322, style: { setProperty(name, value) { properties.set(name, value); } } },
  };
  win.document = doc;
  const handle = installResponsiveLayout(win, doc);
  const size = () => [properties.get('--cot-viewport-width'), properties.get('--cot-viewport-height')];
  assert.deepEqual(size(), ['322px', '571px'], 'page zoom at rest: the visible size, not visual size x scale (403x714)');
  assert.equal(doc.body.dataset.cotWidth, 'phone');
  Object.assign(visualViewport, { height: 300, offsetTop: 0 });
  viewportListeners.get('scroll')();
  assert.ok(queuedFrame, 'at the page-zoom rest a visual viewport scroll still measures (the keyboard)');
  runFrame();
  assert.deepEqual(size(), ['322px', '300px']);
  assert.equal(events.length, 2);
  Object.assign(visualViewport, { width: 161, height: 150, offsetLeft: 80, offsetTop: 60, scale: 2.5 });
  viewportListeners.get('resize')();
  runFrame();
  assert.deepEqual(size(), ['322px', '300px'], 'a pinch from the page-zoom rest only magnifies');
  visualViewport.offsetLeft = 120;
  viewportListeners.get('scroll')();
  assert.equal(queuedFrame, null, 'and its pan schedules nothing');
  assert.equal(events.length, 2);
  handle.destroy();
}

// index.html seeds the first paint with the same rule before any module loads: a page loaded (or restored by
// history navigation) pinch-zoomed still paints at its real size
{
  const seed = INDEX_HTML.match(/<script>\n([\s\S]*?)<\/script>/)?.[1];
  assert.ok(seed?.includes('const viewport = window.visualViewport;'), 'the first plain head script is the seed');
  const properties = new Map();
  const target = { addEventListener() {}, removeEventListener() {} };
  const run = (innerWidth, innerHeight, visualViewport, clientWidth = innerWidth) => {
    properties.clear();
    const documentElement = { clientWidth, style: { setProperty: (name, value) => properties.set(name, value) } };
    runInNewContext(seed, {
      window: { ...target, innerWidth, innerHeight, visualViewport },
      document: { ...target, documentElement },
      Symbol, Number, Math,
    });
    const seeded = [properties.get('--cot-viewport-width'), properties.get('--cot-viewport-height')];
    const measured = layoutViewportSize({ innerWidth, innerHeight, visualViewport, document: { documentElement } });
    assert.deepEqual(seeded, [`${measured.width}px`, `${measured.height}px`], 'the seed and layoutViewportSize agree');
    return seeded;
  };
  assert.deepEqual(run(1440, 900, { width: 720, height: 450, scale: 2, offsetLeft: 360, offsetTop: 225 }),
    ['1440px', '900px'], 'a zoomed first paint seeds the unzoomed size');
  assert.deepEqual(run(430, 733, { width: 430, height: 613, scale: 1 }, 430), ['430px', '613px'],
    'the iOS third-party browser mismatch at scale 1 still seeds the visible height');
  assert.deepEqual(run(322, 571, { width: 322, height: 571, scale: 1.25 }), ['322px', '571px'],
    'Safari page zoom at rest seeds the visible size');
  assert.deepEqual(run(1024, 2226, { width: 1024, height: 2226, scale: 0.392578 }), ['1024px', '2226px'],
    'an iPad window shrunk to its minimum effective width seeds the layout size');
  assert.deepEqual(run(1440, 900, { width: 1439.28, height: 899.55, scale: 1.0005 }), ['1439px', '900px'],
    'within a pixel of rest: the visual viewport as it is');
  assert.deepEqual(run(1280, 720, null), ['1280px', '720px'], 'no visualViewport: the window size');
  assert.deepEqual(run(1280, 720, { width: 640, height: 360, scale: 2 }, 0), ['640px', '360px'],
    'no layout reading: the visual viewport as it is (the measurement before 2026-10-16)');
  assert.doesNotMatch(seed, /viewport(\?)?\.scale/, 'the seed never multiplies by visualViewport.scale');
}

assert.match(RESPONSIVE_SURFACES_CSS, /body\[data-cot-width='tablet'\] \.cot-set-panel/,
  'settings must consume the shared tablet contract');
assert.match(RESPONSIVE_SURFACES_CSS, /body\[data-cot-width='phone'\] \.cot-si-diag\{display:none\}/,
  'phone hit reports must remove right-side penetration diagrams');
assert.match(RESPONSIVE_SURFACES_CSS, /body\[data-cot-height='short'\] \.cot-studio \.dock/,
  'Studio must have a short-screen composition independent of device width');
assert.match(RESPONSIVE_SURFACES_CSS, /body\[data-cot-width='tablet'\]\[data-cot-orientation='portrait'\] \.cot-es/,
  'after-action reports must handle portrait tablets beyond legacy phone widths');
assert.match(GARAGE_CSS,
  /\.cot-featured\{display:none;[^}]*\}[\s\S]*body\[data-cot-height='tall'\] \.cot-featured\{display:block;\}/,
  'Battle Gallery must reserve sidebar height only on tall viewports');
assert.match(INDEX_HTML,
  /const viewport = window\.visualViewport;[\s\S]*--cot-viewport-height[\s\S]*#app \{[^}]*--cot-viewport-height[\s\S]*#cot-boot \{[\s\S]*--cot-viewport-height/,
  'the first boot paint and renderer root must consume the visual viewport before modules load');
assert.match(RESPONSIVE_SURFACES_CSS,
  /body\[data-cot-viewport='visual'\] :is\([\s\S]*\.cot-garage[\s\S]*\.cot-hud[\s\S]*\.cot-bl[\s\S]*height:var\(--cot-viewport-height,100dvh\)/,
  'garage, battle, loading, and modal roots must share one measured fullscreen height');
assert.match(HOME_CSS, /\.v5-hero\{[^}]*var\(--cot-viewport-height,100dvh\)/,
  'the public hero must not trust broken third-party iOS small viewport units');
assert.match(GALLERY_CSS, /\.gallery-shell\{height:calc\(var\(--cot-viewport-height,100dvh\) - 64px\)/,
  'the gallery workspace must fit the measured viewport below navigation');
assert.match(PUBLIC_NAV_CSS, /html,body\{min-height:var\(--cot-viewport-height,100dvh\)\}/,
  'public pages must cover the measured mobile viewport');

console.log(`responsive viewport contract: PASS (${matrix.length} representative viewports; a pinch never relayouts)`);
