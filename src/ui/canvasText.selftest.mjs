// canvasText.selftest.mjs — (UI-LOCKDOWN A) a canvas's words and figures as DOM runs over it: a run lands where the canvas
// drew it (left by its alignment, its top the anchor less the font's ascent for its baseline, its line box the font's
// ascent + descent), carries the canvas's font, ink, alpha and halo, writes only what changed, hides when a repaint
// leaves it out, and reports its anchor for the receipts. Copyright © 2026 Kevin B. Liu.
// (A headless Chrome pass, .qa-dev/canvas-ui/text.{html,mjs} in the lane, measured every sight run's DOM baseline and
// left edge within 0.01 px of the canvas text it replaces, alphabetic and middle, left, centre and right, CJK too.)
import assert from 'node:assert/strict';

// --- a document whose elements count their style writes, and a measuring canvas with fixed font metrics ---
let writes = 0;
function styleOf() {
  const props = {};
  return new Proxy(props, {
    get: (target, key) => (key === 'setProperty' ? (k, v) => { writes++; target[k] = v; } : target[key] ?? ''),
    set: (target, key, value) => { writes++; target[key] = String(value); return true; },
  });
}
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.style = styleOf(); this.className = ''; this.text = ''; this.dataset = {}; }
  get textContent() { return this.text; }
  set textContent(value) { writes++; this.text = String(value); }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
}
const METRICS = { alphabetic: [10, 3], middle: [6, 7] }; // [fontBoundingBoxAscent, fontBoundingBoxDescent] per baseline
let measured = 0;
const measurer = {
  font: '', textBaseline: 'alphabetic',
  measureText(text) {
    measured++;
    const [ascent, descent] = METRICS[this.textBaseline];
    return { width: text.length * 8, fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent };
  },
};
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? { width: 1, height: 1, getContext: () => measurer } : new Element(tag)),
  getElementById: () => null,
  head: new Element('head'),
  fonts: new EventTarget(),
};

const { createCanvasText } = await import('./canvasText.ts');
const parent = new Element('div');
const layer = createCanvasText(parent, 'cot-ret-text');
assert.equal(layer.root.className, 'cot-ctext cot-ret-text');
assert.ok(parent.children[0] === layer.root, 'the layer goes over its canvas, in the canvas\'s parent');

const style = { font: '700 22px Cot', color: '#f0a030', align: 'left', baseline: 'alphabetic', alpha: 1, haloWidth: 0, halo: '' };
layer.begin();
layer.place(0, '3.2', 60, 80, style);
layer.end();
const run = layer.run(0);
assert.equal(run.textContent, '3.2');
assert.equal(run.style.transform, 'translate(60.00px,70.00px)', 'the first placement writes its place (left x, top y - ascent)');
assert.equal(run.style.lineHeight, '13px', 'its line box is the font\'s ascent + descent');
assert.equal(run.style.font, '700 22px Cot');
assert.equal(run.style.color, '#f0a030');
assert.equal(run.style.display, '', 'shown');
assert.deepEqual({ ...layer.placed()[0] }, { text: '3.2', x: 60, y: 80, font: '700 22px Cot', align: 'left', baseline: 'alphabetic',
  color: '#f0a030', alpha: 1 }, 'the record is the canvas anchor');

// an unchanged repaint writes nothing and measures nothing
const writesBefore = writes, measuredBefore = measured;
layer.begin();
layer.place(0, '3.2', 60, 80, style);
layer.end();
assert.equal(writes, writesBefore, 'an unchanged run writes no style');
assert.equal(measured, measuredBefore, 'and measures nothing');

// centre and right alignment, the middle baseline, a halo and an alpha (a hit label)
const hit = { font: '700 19px Cot', color: '#ff5040', align: 'center', baseline: 'middle', alpha: 0.5, haloWidth: 4.6, halo: 'rgba(5,8,11,0.94)' };
layer.begin();
layer.place(1, '420', 320, 160, hit);
layer.place(2, 'Ricochet', 600, 280, { ...hit, align: 'right', alpha: 1, haloWidth: 0 });
layer.end();
assert.equal(layer.run(1).style.transform, 'translate(308.00px,154.00px)', 'centred: half its width left; middle: its ascent above');
assert.equal(layer.run(1).style['-webkit-text-stroke'], '4.6px rgba(5,8,11,0.94)', 'the halo is a text stroke of the same width');
assert.equal(layer.run(1).style.opacity, '0.5');
assert.equal(layer.run(2).style.transform, 'translate(536.00px,274.00px)', 'right: its whole width left');
assert.equal(layer.run(0).style.display, 'none', 'a run the repaint left out hides');
assert.deepEqual(layer.placed().map((record) => record.text), ['420', 'Ricochet'], 'the records are this repaint\'s runs');

// a font loading measures again; clear() hides every run
document.fonts.dispatchEvent(new Event('loadingdone'));
const measuredBeforeFont = measured;
layer.begin();
layer.place(1, '420', 320, 160, hit);
layer.end();
assert.equal(measured, measuredBeforeFont + 1, 'a loaded font re-measures the run');
layer.clear();
assert.ok([0, 1, 2].every((slot) => layer.run(slot).style.display === 'none'), 'clear() hides every run');
assert.equal(layer.placed().length, 0);

// placeAs reads the canvas's state as it would draw
const ctx = { font: '600 11.5px Cot', fillStyle: 'rgba(208,221,232,0.8)', textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1,
  strokeStyle: '#000', lineWidth: 3 };
layer.begin();
layer.placeAs(3, '1240 m', 10, 20, ctx);
layer.end();
assert.equal(layer.run(3).style.color, 'rgba(208,221,232,0.8)');
assert.equal(layer.run(3).style.font, '600 11.5px Cot');
assert.equal(layer.run(3).style['-webkit-text-stroke'] ?? '', '', 'no halo unless asked');
console.log('canvasText.selftest: runs land at the canvas anchor by alignment and baseline, write only changes, hide when left out PASS');
