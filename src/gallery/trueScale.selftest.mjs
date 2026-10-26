// trueScale.selftest.mjs — a true-scale canvas is a uiCanvas: its backing store is its CSS box × min(DPR, 2), a canvas
// without a box holds 1 px and draws when it gets one (2026-10-25, lockdown-251; UI-LOCKDOWN A).
//
// The stage's inset is hidden on a phone, so its canvas had no CSS width; drawTrueScale fell back to the backing
// store's width and multiplied it by the device ratio, doubling the canvas at every Gallery selection (268 px to
// 17 152 px in six picks; a 49 s task in the 4x phone spike census). This receipt draws a hidden canvas eight times
// (its store stays released), shows it (one drawing, of the latest entries, at its box times the ratio), follows a box
// change and a visible canvas's size, and checks that the 1.75 m figure's height is DOM text, not canvas text.
import assert from 'node:assert/strict';

const observers = [];
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
  observe(target) { this.targets.add(target); }
  unobserve(target) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); }
};
/** The observer's report of a laid-out box (CSS px). */
const layout = (canvas, width, height) => {
  for (const observer of observers) {
    if (observer.targets.has(canvas)) {
      observer.callback([{ target: canvas, contentRect: { width, height }, contentBoxSize: [{ inlineSize: width, blockSize: height }] }]);
    }
  }
};
const drawn = [];
let texts = 0;
const context = () => ({
  setTransform() {}, clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, scale() {}, beginPath() {},
  arc() {}, fill() {}, fillText() { texts++; },
  drawImage(image, ...rest) { if (image?.label && rest.length === 8) drawn.push(image.label); }, // a silhouette's tint, not its mask probe
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }),
});
const canvasElement = () => {
  const canvas = { width: 300, height: 150, dataset: {}, style: {}, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; } };
  const shared = context();
  canvas.getContext = () => shared;
  return canvas;
};
globalThis.devicePixelRatio = 2;
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#fff' });
globalThis.document = { documentElement: { lang: 'en' }, createElement: () => canvasElement() };
globalThis.Image = class {
  set src(value) {
    this.label = value; this.naturalWidth = 40; this.naturalHeight = 10;
    queueMicrotask(() => this.onload?.());
  }
};
const { drawTrueScale } = await import('./trueScale.ts');
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// a hidden canvas (no box yet): eight selections leave its store released and draw nothing
const hidden = canvasElement();
hidden.width = 134; hidden.height = 96;
const caption = { textContent: '', hidden: true };
for (let pick = 0; pick < 8; pick++) {
  await drawTrueScale(hidden, [{ id: `tank${pick}`, lengthM: 7, tone: '--ink-2', facing: 'right' }], { layout: 'overlay', human: caption, label: 'scale' });
}
await settle();
assert.deepEqual([hidden.width, hidden.height], [1, 1], 'a canvas without a CSS box holds no store (and never grows)');
assert.deepEqual(drawn, [], 'and draws nothing while hidden');
assert.ok(caption.textContent.length > 0 && !caption.hidden, 'the figure\'s height is the DOM caption over the canvas');

// shown: one drawing, of the latest selection, at its box times the ratio (the page's 134/96 aspect)
const boxH = 150 * (96 / 134);
layout(hidden, 150, boxH);
await settle();
assert.deepEqual([hidden.width, hidden.height], [300, Math.round(boxH * 2)], 'shown, its backing store is its box at the ratio');
assert.equal(drawn.length, 1, 'one deferred drawing');
assert.match(drawn[0], /tank7/, 'of the latest selection');
assert.equal(texts, 0, 'no canvas text (the caption is DOM)');

// the same box again draws nothing; a new box takes its own store and redraws at it
layout(hidden, 150, boxH);
assert.equal(drawn.length, 1, 'an unchanged box draws nothing more');
layout(hidden, 160, 160 * (96 / 134));
assert.deepEqual([hidden.width, hidden.height], [320, Math.round(160 * (96 / 134) * 2)], 'a resized box: its store follows');
assert.equal(drawn.length, 2, 'and is redrawn at it');
// hidden again (a tab or a phone layout): released at once
layout(hidden, 0, 0);
assert.deepEqual([hidden.width, hidden.height], [1, 1], 'hidden again, the store is released');

// a visible canvas sizes from its box, and every selection redraws at that size
const visible = canvasElement();
visible.width = 360; visible.height = 72;
layout(visible, 326, 65.2);
for (let pick = 0; pick < 4; pick++) {
  await drawTrueScale(visible, [{ id: 'a', lengthM: 7, tone: '--ink-1', facing: 'right' }, { id: 'b', lengthM: 9, tone: '--ink-3', facing: 'left' }],
    { layout: 'apart', label: 'versus' });
}
layout(visible, 326, 65.2);
assert.deepEqual([visible.width, visible.height], [652, 130], 'a visible canvas: its box times the ratio, every draw');
console.log('trueScale.selftest: a hidden canvas holds 1 px and waits for its box (no backing growth), a shown one draws once at its box and follows it PASS');
