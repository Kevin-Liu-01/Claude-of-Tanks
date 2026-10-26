// uiCanvas.selftest.mjs — (UI-LOCKDOWN A) the one canvas primitive's rule, driven through a controllable observer and
// resolution query: a shown store is its box × min(DPR, 2) (the snapped device box where reported), a hidden one holds
// 1 px and redraws when its box returns, a box that follows its own store is pinned (no compounding), a ratio flip
// resizes, a retained drawing redraws only on a size, ratio or data change, a per-frame painter sizes in begin(), and a
// lost context redraws when restored. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';

// --- a controllable browser: one ResizeObserver, a resolution query, canvases that record their transform ---
const observed = new Map(); // canvas -> options
let observer = null;
let deviceBoxSupported = true;
class FakeResizeObserver {
  constructor(callback) { this.callback = callback; observer = this; }
  observe(target, options) {
    if (options?.box === 'device-pixel-content-box' && !deviceBoxSupported) throw new TypeError('unsupported box');
    observed.set(target, options ?? {});
  }
  unobserve(target) { observed.delete(target); }
  disconnect() { observed.clear(); }
}
/** Report a content box (CSS px) for `canvas`, with its device-pixel box where the observer was asked for one. */
function report(canvas, width, height, device = null) {
  const deviceBox = observed.get(canvas)?.box === 'device-pixel-content-box';
  const entry = {
    target: canvas,
    contentRect: { width, height },
    contentBoxSize: [{ inlineSize: width, blockSize: height }],
    devicePixelContentBoxSize: deviceBox && device ? [{ inlineSize: device[0], blockSize: device[1] }] : undefined,
  };
  observer.callback([entry]);
}
const queries = [];
function matchMedia(media) {
  const query = new EventTarget();
  query.media = media;
  query.matches = true;
  queries.push(query);
  return query;
}
class FakeCanvas extends EventTarget {
  constructor() {
    super();
    this.width = 300; this.height = 150;
    this.style = {}; this.dataset = {}; this.isConnected = true; this.className = '';
    this.context = null; this.contexts = 0;
  }
  getContext(kind, attributes) {
    assert.equal(kind, '2d');
    this.contexts++;
    this.context ??= { transform: null, attributes, clears: 0, setTransform(...m) { this.transform = m; }, clearRect() { this.clears++; } };
    return this.context;
  }
}
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;
globalThis.ResizeObserver = FakeResizeObserver;
globalThis.matchMedia = matchMedia;
globalThis.document = { createElement: (tag) => { assert.equal(tag, 'canvas'); return new FakeCanvas(); } };
const setRatio = (ratio) => {
  window.devicePixelRatio = ratio;
  queries.at(-1).dispatchEvent(new Event('change'));
};

const { uiCanvas, createUiCanvas, uiCanvasOf, scratchCanvas, uiCanvasCensus, drawImageFit, UI_CANVAS_DPR_CAP } =
  await import('./uiCanvas.ts');
assert.equal(UI_CANVAS_DPR_CAP, 2, 'the probe\'s cap (tools/click-timeline.mjs CANVAS_CAP)');

// 1. a retained drawing: no store before it is measured, then the box × the ratio, drawn once in CSS px
{
  window.devicePixelRatio = 2;
  const draws = [];
  const surface = createUiCanvas(null, 'plan', { draw: (ctx, w, h) => draws.push([w, h, ctx.transform.slice()]) });
  const canvas = surface.canvas;
  assert.equal(canvas.className, 'plan');
  assert.equal(canvas.dataset.uiCanvas, '', 'a mounted canvas is marked for the probes');
  assert.equal(observed.get(canvas)?.box, 'device-pixel-content-box', 'observed in device pixels where supported');
  assert.equal(`${canvas.width}x${canvas.height}`, '1x1', 'no store before a box is measured (not the default 300x150)');
  assert.equal(canvas.contexts, 0, 'no context before the first drawing');
  surface.redraw();
  assert.equal(draws.length, 0, 'a drawing waits for its box');
  report(canvas, 100, 50, [200, 100]);
  assert.equal(`${canvas.width}x${canvas.height}`, '200x100', 'the store is the device box');
  assert.deepEqual(draws, [[100, 50, [2, 0, 0, 2, 0, 0]]], 'drawn once, in CSS px at the ratio');
  assert.equal(surface.shown, true);
  // the same box again: nothing to do
  report(canvas, 100, 50, [200, 100]);
  assert.equal(draws.length, 1, 'an unchanged box redraws nothing');
  // a data change redraws at the same store
  surface.redraw();
  assert.equal(draws.length, 2, 'redraw() is the data change');
  assert.equal(uiCanvas(canvas), surface, 'one surface per canvas');
  assert.equal(uiCanvasOf(canvas), surface);

  // 2. hidden: the store is released at once, and data changes wait for the box
  report(canvas, 0, 0);
  assert.equal(`${canvas.width}x${canvas.height}`, '1x1', 'a hidden canvas holds 1 px');
  assert.equal(surface.shown, false);
  surface.redraw();
  assert.equal(draws.length, 2, 'nothing draws while hidden');
  report(canvas, 120, 40, [240, 80]);
  assert.equal(`${canvas.width}x${canvas.height}`, '240x80', 'the box returns with its store');
  assert.equal(draws.length, 3, 'and its drawing');

  // 3. a ratio flip: the store follows the resolution query, and the next query is armed for the new ratio
  setRatio(1);
  assert.equal(`${canvas.width}x${canvas.height}`, '120x40', 'DPR 2 -> 1 halves the store');
  assert.equal(draws.length, 4, 'and redraws');
  assert.match(queries.at(-1).media, /\(resolution: 1dppx\)/, 'a query for the new ratio');
  setRatio(3);
  assert.equal(`${canvas.width}x${canvas.height}`, '240x80', 'DPR 3 is capped at 2');
  // a device box at a capped ratio is not the store (it is 3x)
  report(canvas, 120, 40, [360, 120]);
  assert.equal(`${canvas.width}x${canvas.height}`, '240x80', 'the capped store ignores the 3x device box');
  surface.dispose();
  assert.equal(observed.has(canvas), false, 'dispose stops observing');
  assert.equal(`${canvas.width}x${canvas.height}`, '1x1', 'and releases the store');
  assert.equal(canvas.dataset.uiCanvas, undefined);
}

// 3b. an emulated scale factor (the probe's flip): devicePixelRatio changes with no query event and the device box
// reports CSS px; the backstop check takes the new ratio within half a second, and an inconsistent device box is ignored
{
  globalThis.devicePixelRatio = 1;
  setRatio(1);
  const surface = createUiCanvas(null, '', { draw: () => {} });
  report(surface.canvas, 100, 50, [100, 50]);
  assert.equal(`${surface.canvas.width}x${surface.canvas.height}`, '100x50');
  globalThis.devicePixelRatio = 2; // no 'change' dispatched
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(`${surface.canvas.width}x${surface.canvas.height}`, '200x100', 'the backstop follows a silent ratio change');
  report(surface.canvas, 100, 50, [100, 50]);
  assert.equal(`${surface.canvas.width}x${surface.canvas.height}`, '200x100', 'a device box in CSS px (emulation) is not the store');
  surface.dispose();
}

// 4. never compounding: a canvas with no CSS size (its attributes are its box) is pinned at the box it had
{
  window.devicePixelRatio = 2;
  const surface = createUiCanvas(null, '', { draw: () => {} });
  const canvas = surface.canvas;
  // the intrinsic box is the store's own size: 1 x 1 after the mount's release, then whatever each store makes it (the
  // Gallery inset's fallback: 268 px to 17,152 px in six picks)
  const pinnedBefore = uiCanvasCensus().pinned;
  report(canvas, canvas.width, canvas.height, [canvas.width * 2, canvas.height * 2]);
  assert.equal(`${canvas.width}x${canvas.height}`, '2x2');
  for (let step = 0; step < 6; step++) report(canvas, canvas.width, canvas.height, [canvas.width * 2, canvas.height * 2]);
  assert.equal(`${canvas.width}x${canvas.height}`, '2x2', 'six feedback reports never grow the store');
  assert.equal(canvas.style.width, '1px', 'the box is pinned at the size it had (a canvas needs a CSS size)');
  assert.equal(canvas.style.height, '1px');
  assert.equal(uiCanvasCensus().pinned, pinnedBefore + 1, 'the pin is counted once');
  // a minimap plate stepping 110 -> 220 at DPR 2 (store 220) is a CSS box change, never feedback
  const plate = createUiCanvas(null, '', { draw: () => {} });
  report(plate.canvas, 110, 110, [220, 220]);
  report(plate.canvas, 220, 220, [440, 440]);
  assert.equal(`${plate.canvas.width}x${plate.canvas.height}`, '440x440', 'a doubled CSS box takes its store');
  // a legitimate change of a CSS-sized box is never mistaken for feedback
  const sized = createUiCanvas(null, '', { draw: () => {} });
  report(sized.canvas, 100, 50, [200, 100]);
  report(sized.canvas, 150, 60, [300, 120]);
  assert.equal(`${sized.canvas.width}x${sized.canvas.height}`, '300x120', 'a resized CSS box takes its store');
  assert.equal(sized.canvas.style.width, undefined, 'and is not pinned');
}

// 5. no device-pixel box (Safari): the content box × the ratio, rounded
{
  deviceBoxSupported = false;
  window.devicePixelRatio = 1.5;
  const surface = createUiCanvas(null, '', { draw: () => {} });
  assert.equal(observed.get(surface.canvas)?.box, undefined, 'observed in CSS px');
  report(surface.canvas, 100.4, 50.2);
  assert.equal(`${surface.canvas.width}x${surface.canvas.height}`, '151x75', 'round(box × 1.5)');
  deviceBoxSupported = true;
}

// 6. units: a design space stretched over the box, or device pixels
{
  window.devicePixelRatio = 2;
  let seen = null;
  const map = createUiCanvas(null, '', { units: [220, 220], draw: (ctx) => { seen = ctx.transform.slice(); } });
  report(map.canvas, 110, 110);
  assert.deepEqual(seen, [1, 0, 0, 1, 0, 0], 'a 220-unit map on a 110 px plate at DPR 2: one unit a store pixel');
  report(map.canvas, 330, 330);
  assert.deepEqual(seen, [3, 0, 0, 3, 0, 0], 'on a 330 px plate: three');
  const device = createUiCanvas(null, '', { units: 'device', draw: (ctx) => { seen = ctx.transform.slice(); } });
  report(device.canvas, 50, 20);
  assert.deepEqual(seen, [1, 0, 0, 1, 0, 0], 'device units draw in store pixels');
  const budget = createUiCanvas(null, '', { maxPixels: 10_000, draw: () => {} });
  report(budget.canvas, 200, 100);
  assert.ok(budget.canvas.width * budget.canvas.height <= 10_000, 'a pixel budget bounds the store');
}

// 7. a per-frame painter: sized in begin(), from its initial box until the observer measures it
{
  window.devicePixelRatio = 2;
  let resizes = 0, initial = 0;
  const sight = createUiCanvas(null, 'sight', { initialBox: () => { initial++; return [640, 360]; }, onResize: () => { resizes++; } });
  const canvas = sight.canvas;
  assert.equal(sight.begin(), true, 'the initial box sizes the first frame');
  assert.equal(`${canvas.width}x${canvas.height}`, '1280x720');
  assert.deepEqual(canvas.context.transform, [2, 0, 0, 2, 0, 0], 'begin() sets the CSS-px transform');
  sight.begin(); sight.begin();
  assert.equal(initial, 1, 'the initial box is read once');
  report(canvas, 800, 600);
  assert.equal(resizes >= 1, true, 'a new box tells the painter');
  assert.equal(`${canvas.width}x${canvas.height}`, '1280x720', 'the store waits for the painter\'s frame (no blank frame)');
  assert.equal(sight.begin(), true);
  assert.equal(`${canvas.width}x${canvas.height}`, '1600x1200', 'and takes the new box in begin()');
  report(canvas, 0, 0);
  assert.equal(`${canvas.width}x${canvas.height}`, '1x1', 'a hidden painter releases at once');
  assert.equal(sight.begin(), false, 'and paints nothing');
  report(canvas, 800, 600);
  assert.equal(sight.begin(), true);
  assert.equal(`${canvas.width}x${canvas.height}`, '1600x1200');
}

// 7b. measureNow(): an owner that has just shown its canvas reads the box in the same task (a visible box only)
{
  globalThis.devicePixelRatio = 2;
  let paints = 0;
  const shown = createUiCanvas(null, '', { onResize: () => { paints++; } });
  report(shown.canvas, 0, 0); // the observer saw it hidden
  assert.equal(shown.begin(), false);
  shown.canvas.clientWidth = 320; shown.canvas.clientHeight = 180; // the owner shows it (display: block)
  shown.measureNow();
  assert.equal(shown.begin(), true, 'it paints in the same task');
  assert.equal(`${shown.canvas.width}x${shown.canvas.height}`, '640x360');
  shown.canvas.clientWidth = 0; shown.canvas.clientHeight = 0;
  shown.measureNow();
  assert.equal(shown.begin(), true, 'a zero read changes nothing (hidden is the observer\'s report)');
  assert.ok(paints >= 1);
}

// 7c. visibility:hidden (a laid-out box no observer reports as hidden): a retained drawing holds no store under it, and the
// half-second sweep releases a drawn one that gets hidden and draws one that shows again
{
  globalThis.devicePixelRatio = 2;
  let draws = 0;
  const swatch = createUiCanvas(null, '', { draw: () => { draws++; } });
  let visible = false;
  swatch.canvas.checkVisibility = () => visible;
  report(swatch.canvas, 44, 52);
  assert.equal(draws, 0, 'nothing draws under visibility:hidden');
  assert.equal(`${swatch.canvas.width}x${swatch.canvas.height}`, '1x1', 'and no store is held');
  visible = true;
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(draws, 1, 'shown, the sweep draws it');
  assert.equal(`${swatch.canvas.width}x${swatch.canvas.height}`, '88x104');
  visible = false;
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(`${swatch.canvas.width}x${swatch.canvas.height}`, '1x1', 'hidden again, the sweep releases it');
  visible = true;
  swatch.redraw();
  assert.equal(draws, 2, 'a data change on a shown canvas draws at once');
  assert.equal(`${swatch.canvas.width}x${swatch.canvas.height}`, '88x104');
  swatch.dispose();
}

// 8. a lost context: nothing draws until it is restored, then the drawing returns
{
  window.devicePixelRatio = 1;
  let draws = 0;
  const surface = createUiCanvas(null, '', { draw: () => { draws++; } });
  report(surface.canvas, 40, 40);
  assert.equal(draws, 1);
  surface.canvas.dispatchEvent(new Event('contextlost'));
  surface.redraw();
  assert.equal(draws, 1, 'nothing draws into a lost context');
  assert.equal(surface.shown, false);
  surface.canvas.dispatchEvent(new Event('contextrestored'));
  assert.equal(draws, 2, 'a restored context redraws');
}

// 9. a host's canvas takes its drawing from a lazy drawer; images present through the surface
{
  window.devicePixelRatio = 1;
  const host = createUiCanvas(null, 'obj');
  report(host.canvas, 64, 64);
  let drawn = null;
  const adopted = uiCanvas(host.canvas, { draw: (_ctx, w, h, surface) => { drawn = [w, h, surface.image]; } });
  assert.equal(adopted, host, 'the same surface');
  adopted.redraw();
  assert.deepEqual(drawn, [64, 64, null], 'the adopted drawing draws');
  const tile = { width: 128, height: 44 };
  host.setImage(tile);
  assert.equal(drawn[2], tile, 'setImage redraws with the image');
  const calls = [];
  drawImageFit({ drawImage: (...args) => calls.push(args) }, tile, 112, 56, 'cover');
  const [, x, y, w, h] = calls[0];
  assert.ok(w >= 112 && h >= 56 && Math.abs(x + w / 2 - 56) < 1e-9 && Math.abs(y + h / 2 - 28) < 1e-9, 'cover fills the box, centred');
}

// 10. a fixed box without an observer (a Node receipt): the box is the box, drawn from the first redraw()
{
  const saved = globalThis.ResizeObserver;
  globalThis.ResizeObserver = undefined;
  window.devicePixelRatio = 1;
  let draws = 0;
  const panel = createUiCanvas(null, '', { box: [142, 138], units: [142, 138], draw: () => { draws++; } });
  assert.equal(panel.canvas.style.width, '142px', 'the fixed box is the CSS size');
  assert.equal(draws, 0, 'nothing draws while mounting (its owner\'s state may not exist yet)');
  panel.redraw();
  assert.equal(draws, 1);
  assert.equal(`${panel.canvas.width}x${panel.canvas.height}`, '142x138');
  globalThis.ResizeObserver = saved;
}

// 11. scratch canvases are sized by their callers and never mounted
{
  const scratch = scratchCanvas(64.4, 0);
  assert.equal(`${scratch.width}x${scratch.height}`, '64x1');
  assert.equal(uiCanvasOf(scratch), undefined);
  assert.equal(scratch.dataset.uiCanvas, undefined);
}

console.log('uiCanvas.selftest: PASS');
