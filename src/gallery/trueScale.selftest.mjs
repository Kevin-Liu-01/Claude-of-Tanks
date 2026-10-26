// trueScale.selftest.mjs — a true-scale canvas sizes its backing store from its CSS box, and a canvas without one
// waits for it (2026-10-25, lockdown-251).
//
// The stage's inset is hidden on a phone, so its canvas had no CSS width; drawTrueScale fell back to the backing
// store's width and multiplied it by the device ratio, doubling the canvas at every Gallery selection (268 px to
// 17 152 px in six picks; a 49 s task in the 4x phone spike census). This receipt draws a hidden canvas eight times
// (its backing store never moves), shows it (one drawing, of the latest entries, at its box times the ratio), and pins
// a visible canvas's size.
import assert from 'node:assert/strict';

const observers = [];
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
  observe(target) { this.targets.add(target); }
  unobserve(target) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); }
};
const drawn = [];
const context = () => ({
  setTransform() {}, clearRect() {}, fillRect() {}, save() {}, restore() {}, translate() {}, scale() {}, beginPath() {},
  arc() {}, fill() {}, fillText() {},
  drawImage(image, ...rest) { if (image?.label && rest.length === 8) drawn.push(image.label); }, // a silhouette's tint, not its mask probe
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }),
});
const canvasElement = () => {
  const canvas = { width: 300, height: 150, clientWidth: 0, dataset: {}, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; } };
  canvas.getContext = () => context();
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

// a hidden canvas: eight selections leave its backing store as authored
const hidden = canvasElement();
hidden.width = 134; hidden.height = 96;
for (let pick = 0; pick < 8; pick++) {
  await drawTrueScale(hidden, [{ id: `tank${pick}`, lengthM: 7, tone: '--ink-2', facing: 'right' }], { layout: 'overlay', human: true, label: 'scale' });
}
await settle();
assert.deepEqual([hidden.width, hidden.height], [134, 96], 'a canvas without a CSS box keeps its backing store');
assert.deepEqual(drawn, [], 'and draws nothing while hidden');

// shown: one drawing, of the latest selection, at its box times the ratio
hidden.clientWidth = 150;
for (const observer of observers) {
  if (observer.targets.has(hidden)) observer.callback([{ target: hidden, contentRect: { width: 150 } }]);
}
await settle();
assert.deepEqual([hidden.width, hidden.height], [300, Math.round(150 * (96 / 134) * 2)], 'shown, its backing store is its box at the ratio');
assert.equal(drawn.length, 1, 'one deferred drawing');
assert.match(drawn[0], /tank7/, 'of the latest selection');

// a second box change with nothing deferred draws nothing more; a visible canvas sizes from its box at every draw
for (const observer of observers) {
  if (observer.targets.has(hidden)) observer.callback([{ target: hidden, contentRect: { width: 160 } }]);
}
await settle();
assert.equal(drawn.length, 1, 'nothing deferred, nothing redrawn');
const visible = canvasElement();
visible.width = 360; visible.height = 72; visible.clientWidth = 326;
for (let pick = 0; pick < 4; pick++) {
  await drawTrueScale(visible, [{ id: 'a', lengthM: 7, tone: '--ink-1', facing: 'right' }, { id: 'b', lengthM: 9, tone: '--ink-3', facing: 'left' }],
    { layout: 'apart', label: 'versus' });
}
assert.deepEqual([visible.width, visible.height], [652, 130], 'a visible canvas: its box times the ratio, every draw');
console.log('trueScale.selftest: a hidden canvas waits for its box (no backing growth), a shown one draws once at its box PASS');
