// The pinch-zoom probe's pure half (2026-10-16): arguments, the phase comparison against two controls, the
// layout-shift window and the verdict. The probe itself drives a browser against a served checkout and is a manual
// probe (`npm run qa:pinch -- --base=<origin>`), never part of npm test; this receipt keeps its rules honest.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BOX_TOLERANCE_PX, DEFAULT_SURFACES, LAYOUT_VARS, comparePhase, flatten, parseArgs, resizeVerdict, shiftsBetween, verdictFor,
} from './pinch-zoom-probe.mjs';

// ---- arguments
assert.throws(() => parseArgs([]), /--base=/, 'a served origin is required');
assert.throws(() => parseArgs(['--base=http://127.0.0.1:5291', '--surfaces=home,nowhere']), /unknown surface/);
assert.throws(() => parseArgs(['--base=http://127.0.0.1:5291', '--frobnicate']), /unknown argument/);
assert.throws(() => parseArgs(['--base=http://127.0.0.1:5291', '--resize=1000']), /bad --width/);
const defaults = parseArgs(['--base=http://127.0.0.1:5291/']);
assert.equal(defaults.base, 'http://127.0.0.1:5291', 'a trailing slash is dropped');
assert.deepEqual(defaults.surfaces, [...DEFAULT_SURFACES]);
assert.deepEqual([defaults.width, defaults.height, defaults.resize.width, defaults.resize.height], [1440, 900, 1000, 700]);
for (const surface of ['home', 'docs', 'gallery', 'dossier', 'notfound', 'hud', 'splash', 'garage', 'battle']) {
  assert.ok(DEFAULT_SURFACES.includes(surface), `the default sweep covers ${surface}`);
}
assert.ok(LAYOUT_VARS.includes('--cot-viewport-width') && LAYOUT_VARS.includes('--cot-ui-scale'));

// ---- the comparison
const snap = (over = {}) => ({
  vars: { '--cot-viewport-width': '1440px', '--cot-viewport-height': '900px', '--cot-ui-scale': '1.0000' },
  bands: { cotWidth: 'desktop', cotHeight: 'tall', cotPanels: 'persistent' },
  shell: { html: [0, 0, 1440, 900], body: [0, 0, 1440, 900], '#app': [0, 0, 1440, 900] },
  doc: { scrollWidth: 1440, scrollHeight: 16000 },
  scroll: { x: 0, y: 2600 },
  canvases: [{ label: 'canvas', width: 1440, height: 900, clientWidth: 1440, clientHeight: 900 }],
  scrollers: { 'div.dossier-scroll': 700 },
  keys: { 'header.v5-hero header.v5-hero': [0, 0, 1440, 900] },
  // id -> [offsetLeft, offsetTop, offsetWidth, offsetHeight, animated, label]
  census: { 1: [0, 0, 1440, 900, 0, 'header'], 2: [40, 120, 600, 80, 0, 'h1'], 3: [0, 0, 10, 10, 1, 'spinner'], 4: [5, 5, 50, 50, 0, 'carousel'] },
  ...over,
});
const clone = (v) => JSON.parse(JSON.stringify(v));
const a = snap(), b = snap({ census: { ...snap().census, 4: [65, 5, 50, 50, 0, 'carousel'] } });

const clean = comparePhase(a, b, clone(b));
assert.deepEqual([clean.changed, clean.moved, clean.volatile], [[], [], []], 'an unchanged phase is clean');
assert.equal(clean.compared, 2, 'the animated element and the one that moved between the controls are left out');
assert.equal(flatten(a)['var --cot-viewport-width'], '1440px');

// the pre-fix pinch on /home: the vars and bands followed the zoomed visual viewport, the page restacked
const bug = clone(b);
bug.vars['--cot-viewport-width'] = '720px';
bug.bands.cotWidth = 'compact';
bug.doc.scrollHeight = 23000;
bug.census[2] = [16, 90, 688, 120, 0, 'h1'];
bug.canvases[0].width = 720;
const relayout = comparePhase(a, b, bug);
assert.deepEqual(relayout.changed.map((c) => c.key).sort(), [
  'band cotWidth', 'canvas[0] canvas', 'document scrollHeight', 'var --cot-viewport-width',
]);
assert.deepEqual(relayout.moved.map((m) => m.element), ['h1']);

// a rounding pixel is not a move; more is
const wobble = clone(b);
wobble.census[2][0] += BOX_TOLERANCE_PX;
wobble.keys['header.v5-hero header.v5-hero'][3] += BOX_TOLERANCE_PX;
assert.deepEqual(comparePhase(a, b, wobble).moved, []);
assert.deepEqual(comparePhase(a, b, wobble).changed, []);
wobble.census[2][0] += 1;
assert.equal(comparePhase(a, b, wobble).moved.length, 1);

// a measurement that already differed between the controls is volatile, not a pinch effect
const a2 = snap({ scrollers: { 'div.dossier-scroll': 650 } });
const vol = comparePhase(a2, b, { ...clone(b), scrollers: { 'div.dossier-scroll': 0 } });
assert.deepEqual(vol.volatile, ['scrollTop div.dossier-scroll']);
assert.deepEqual(vol.changed, []);
// a reset inner scroller is caught when it was steady
assert.deepEqual(comparePhase(a, b, { ...clone(b), scrollers: { 'div.dossier-scroll': 0 } }).changed.map((c) => c.key),
  ['scrollTop div.dossier-scroll']);
// a variable that appears or disappears counts (the fix removed --cot-viewport-scale; a phase must not add one)
assert.deepEqual(comparePhase(a, b, { ...clone(b), vars: { ...b.vars, '--cot-viewport-scale': '2.0000' } }).changed
  .map((c) => c.key), ['var --cot-viewport-scale']);

// ---- layout-shift window
const shifts = [{ startTime: 10, value: 0.2 }, { startTime: 50, value: 0.01 }, { startTime: 60, value: 0.3 }, { startTime: 99, value: 0.5 }];
assert.deepEqual(shiftsBetween(shifts, 40, 70).map((s) => s.value), [0.3, 0.01], 'inside the window, largest first');

// ---- verdict
const passing = {
  zoom: { peakScale: 2, restoredScale: 1 },
  compare: { pinched: clean, panned: clean, restored: clean },
  layoutchangeDuringPinch: 0, pinchShifts: [], pinchShiftSum: 0,
  resize: { to: '1000x700', relayout: true, why: 'ok' },
};
assert.deepEqual(verdictFor(passing), { pass: true, problems: [] });
const failing = (over) => verdictFor({ ...passing, ...over });
assert.match(failing({ zoom: { peakScale: 1, restoredScale: 1 } }).problems.join(), /never zoomed/, 'no zoom tests nothing');
assert.match(failing({ compare: { ...passing.compare, pinched: relayout } }).problems.join(), /pinched: 4 measurement/);
assert.match(failing({ compare: { ...passing.compare, pinched: relayout } }).problems.join(), /element box\(es\) moved \(h1\)/);
assert.match(failing({ layoutchangeDuringPinch: 3 }).problems.join(), /cot:layoutchange fired 3/);
assert.match(failing({ pinchShifts: [{ value: 0.4 }], pinchShiftSum: 0.4 }).problems.join(), /layout-shift/);
assert.match(failing({ zoom: { peakScale: 2, restoredScale: 2 } }).problems.join(), /over the DOM left the page stuck at scale 2/);
assert.deepEqual(failing({ zoom: { peakScale: 2, restoredScale: 2, pinchOutOverCanvas: true } }).problems, [],
  'over a 3D canvas the pinch is its camera zoom by design');
assert.match(failing({ resize: { to: '1000x700', relayout: false, why: 'no cot:layoutchange' } }).problems.join(), /did not relayout/);

// ---- the real-resize check
const sized = (width, layoutchange, canvasWidth) => ({
  vars: { '--cot-viewport-width': `${width}px` }, bands: {}, viewport: { innerWidth: width },
  counters: { layoutchange, windowResize: layoutchange },
  canvases: canvasWidth ? [{ label: 'canvas', width: canvasWidth, height: 900, clientWidth: canvasWidth, clientHeight: 900 }] : [],
});
const size = { width: 1000, height: 700 };
assert.equal(resizeVerdict(sized(1000, 2, 0), sized(1440, 1, 0), { kind: 'public' }, size).relayout, true);
assert.match(resizeVerdict(sized(1440, 2, 0), sized(1440, 1, 0), { kind: 'public' }, size).why, /1440px != 1000px/);
assert.equal(resizeVerdict(sized(1000, 1, 0), sized(1440, 1, 0), { kind: 'public' }, size).why, 'no cot:layoutchange');
// the Studio's 3D view sits beside its dock: the renderer resizing at all is the test, not a full-width canvas
assert.equal(resizeVerdict(sized(1000, 2, 640), sized(1440, 1, 1080), { kind: 'game' }, size).relayout, true);
assert.equal(resizeVerdict(sized(1000, 2, 1080), sized(1440, 1, 1080), { kind: 'game' }, size).why, 'no canvas followed the new size');

// ---- the probe drives a real trackpad pinch on SwiftShader and stays out of npm test
const source = readFileSync(new URL('./pinch-zoom-probe.mjs', import.meta.url), 'utf8');
assert.match(source, /Input\.synthesizePinchGesture[\s\S]{0,160}gestureSourceType: source/);
assert.match(source, /async function zoomIn[\s\S]{0,120}await pinch\(cdp, run\.aimCdp, 2, 'mouse'\)/,
  'the first pinch is the trackpad one (ctrl+wheel)');
assert.match(source, /if \(surface\.kind !== 'game'\) \{\s*await pinch\(cdp, run\.aimCdp, 2, 'touch'\)/,
  'no touch on the game page: a touch is the splash entry gesture and a garage tap');
assert.match(source, /const back = await page\.evaluate\(pageDomPoint, aimed\)/, 'the pinch-out aims at the DOM, never a 3D canvas');
assert.match(source, /Emulation\.setPageScaleFactor', \{ pageScaleFactor: 2 \}/, 'a cancelled pinch is let through to test the layout');
assert.match(source, /'--use-angle=swiftshader'/, 'no GPU, no capture lock');
assert.match(source, /import\('puppeteer'\)/, 'puppeteer loads only when the probe runs, so this receipt needs no browser');
assert.match(source, /page\.setViewport\(\{ width: options\.resize\.width/, 'a real resize must still relayout');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.scripts['qa:pinch'], 'node tools/pinch-zoom-probe.mjs');
const { SELFTEST_SUITES } = await import('./selftest-suites.mjs');
assert.ok(!Object.values(SELFTEST_SUITES).flat().includes('tools/pinch-zoom-probe.mjs'), 'the browser probe is manual');

console.log('pinch-zoom-probe selftest: PASS');
