// Receipt for tools/hud-ammo-frame-ink.mjs and the capture flow of tools/hud-ammo-capture.mjs (owner 2026-10-17: out of
// ammo and unlimited rounds; critic r4b: five phone frames lost the tray slot's count, label, strike and ∞ while every
// DOM check passed, because the DOM was read and the saved pixels were not; critic r6: the receipt matched the flow's
// source shapes, so a clip passed through a variable, a filtered findings array and a DOM read that never names a label
// all passed it). The flow now runs end to end here against a recording browser over a fake DOM: every call it makes is
// read as made, the real readHud reads the fake DOM, and the frames it saves are synthetic PNGs drawn from that DOM.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { cropImage, decodePng, encodePng, inkGap, markInk, slotFrameFindings } from './hud-ammo-frame-ink.mjs';
import { framesInPage, readHud, recordReticle, RULES, runCapture, settleTray, showTrayMarks, stageInPage,
  TRAY_INK_GAP } from './hud-ammo-capture.mjs';

const chunk = (type, body) => {
  const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
  return Buffer.concat([head, body, tail]);
};
const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
/** An RGB (bpp 3) or RGBA (bpp 4) PNG of `rows` (bytes per row = width * bpp), each row written with its own filter,
 *  the predictors the spec's. */
function pngOf(width, rows, filters, bpp = 3) {
  const encoded = [];
  rows.forEach((row, y) => {
    const prior = y ? rows[y - 1] : new Array(width * bpp).fill(0);
    encoded.push(filters[y], ...row.map((v, x) => {
      const left = x >= bpp ? row[x - bpp] : 0; const up = prior[x]; const corner = x >= bpp ? prior[x - bpp] : 0;
      const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, corner)][filters[y]];
      return (v - predictor) & 255;
    }));
  });
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(rows.length, 4); header[8] = 8; header[9] = bpp === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from(encoded))), chunk('IEND', Buffer.alloc(0))]);
}
const pixelsOf = (image, width) => (x, y) => [...image.data.subarray((y * width + x) * 4, (y * width + x) * 4 + 3)];

// 1. PNG: every row filter Chrome may write decodes exactly; encode -> decode is exact; a crop keeps its pixels.
{
  const width = 3; const height = 5; const bpp = 3;
  const rows = Array.from({ length: height }, (_, y) => Array.from({ length: width * bpp }, (_, x) => (y * 53 + x * 29 + (x % 3) * 71) & 255));
  const image = decodePng(pngOf(width, rows, [0, 1, 2, 3, 4]));
  assert.deepEqual([image.width, image.height], [width, height]);
  const at = pixelsOf(image, width);
  rows.forEach((row, y) => { for (let x = 0; x < width; x++) assert.deepEqual(at(x, y), row.slice(x * bpp, x * bpp + bpp), `filter ${y} decodes pixel ${x}`); });
  const again = decodePng(encodePng(image));
  assert.deepEqual([...again.data], [...image.data], 'encode -> decode is exact');
  const crop = cropImage(image, { x0: 1, y0: 2, x1: 3, y1: 4 });
  assert.deepEqual([crop.width, crop.height], [2, 2]);
  assert.deepEqual([...crop.data.subarray(0, 4)], [...image.data.subarray((2 * width + 1) * 4, (2 * width + 1) * 4 + 4)], 'a crop keeps its pixels');
}

// 1b. The Paeth predictor, branch by branch (critic r6, K7: a decoder that never predicts from the corner passed). Each
// case is two pixels of a filter-4 row: the first sets `left`, the second is predicted from (left, up, corner); the row
// above sets `up` and `corner`. Every branch and every tie the spec breaks, with the candidates all different.
{
  const CASES = [
    { name: 'left', left: 200, up: 50, corner: 60, pick: 'left' },
    { name: 'up', left: 50, up: 200, corner: 60, pick: 'up' },
    { name: 'corner', left: 100, up: 10, corner: 60, pick: 'corner' },
    { name: 'pa = pc < pb breaks to left', left: 60, up: 120, corner: 100, pick: 'left' },
    { name: 'pb = pc < pa breaks to up', left: 120, up: 60, corner: 100, pick: 'up' },
    { name: 'far apart, the residual wraps', left: 250, up: 10, corner: 240, pick: 'up' },
  ];
  const width = CASES.length * 2;
  const top = []; const row = [];
  CASES.forEach((c, i) => {
    assert.equal(paeth(c.left, c.up, c.corner), c[c.pick], `${c.name}: the case picks its branch`);
    assert.equal(new Set([c.left, c.up, c.corner]).size, 3, `${c.name}: the candidates differ`);
    // channel 0 carries the case; channels 1 and 2 vary the same pixels so every channel decodes on its own
    top.push(c.corner, (c.corner + 7 * i) & 255, (c.corner * 3) & 255, c.up, (c.up + 7 * i) & 255, (c.up * 5) & 255);
    row.push(c.left, (c.left + 11) & 255, (c.left * 7) & 255, 77 + i, 13 * i, 201 - i);
  });
  const image = decodePng(pngOf(width, [top, row], [0, 4]));
  const at = pixelsOf(image, width);
  CASES.forEach((c, i) => assert.deepEqual(at(2 * i + 1, 1), row.slice((2 * i + 1) * 3, (2 * i + 2) * 3), `paeth ${c.name}`));
  for (let x = 0; x < width; x++) assert.deepEqual(at(x, 1), row.slice(x * 3, x * 3 + 3), `paeth row pixel ${x}`);
}

// 1c. The Average predictor (critic r7: every byte sum in section 1's rows was even, so a decoder rounding (left + up)
// up passed). A filter-3 row whose sums are odd where rounding matters — the first pixel (no left, an odd up), odd sums
// under and over 255 — and an even sum over 255 (a decoder wrapping the sum before halving it), the residuals wrapping.
{
  const top = [77, 51, 3, 50, 99, 201, 255, 180, 17, 180, 254, 60];
  const row = [101, 30, 250, 20, 7, 0, 200, 133, 9, 3, 255, 128];
  const sums = row.map((_, x) => (x >= 3 ? row[x - 3] : 0) + top[x]);
  assert.ok(sums.slice(0, 3).every((sum) => sum % 2 === 1), 'the first pixel: no left, an odd up in every channel');
  assert.ok(sums.some((sum) => sum % 2 === 1 && sum < 256) && sums.some((sum) => sum % 2 === 1 && sum > 255), 'odd sums under and over 255');
  assert.ok(sums.some((sum) => sum % 2 === 0 && sum > 255), 'an even sum over 255');
  assert.ok(row.some((v, x) => v < sums[x] >> 1), 'a residual wraps');
  const image = decodePng(pngOf(4, [top, row], [0, 3]));
  const at = pixelsOf(image, 4);
  for (let x = 0; x < 4; x++) assert.deepEqual(at(x, 1), row.slice(x * 3, x * 3 + 3), `average pixel ${x} (sums ${sums.slice(x * 3, x * 3 + 3)})`);
}

// 1d. An RGBA frame (colour type 6, as a screenshot may be written): every filter over four-byte pixels, odd sums and
// the alpha channel included, decodes exactly.
{
  const width = 3; const bpp = 4;
  const rows = Array.from({ length: 5 }, (_, y) => Array.from({ length: width * bpp }, (_, x) => (y * 61 + x * 37 + (x % 4) * 83 + 1) & 255));
  const image = decodePng(pngOf(width, rows, [0, 1, 2, 3, 4], bpp));
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      assert.deepEqual([...image.data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)], row.slice(x * 4, x * 4 + 4), `RGBA filter ${y} pixel ${x}`);
    }
  });
}

// 2. The saved frame's slot read. A phone-sized empty selected slot at device scale 2 (CSS px below), drawn as Chrome
// draws it: the danger 0, the dimmed type label, the strike, the amber chevron and the opaque top edge.
const scale = 2;
const blank = (width, height, rgb) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; }
  return { width, height, data };
};
const copy = (image) => ({ ...image, data: new Uint8ClampedArray(image.data) });
const paint = (image, x, y, rgb) => {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const i = (Math.floor(y) * image.width + Math.floor(x)) * 4; image.data[i] = rgb[0]; image.data[i + 1] = rgb[1]; image.data[i + 2] = rgb[2];
};
const shade = (image, box, alpha = 0.72) => {
  for (let y = Math.floor(box.y0 * scale); y < Math.ceil(box.y1 * scale); y++) for (let x = Math.floor(box.x0 * scale); x < Math.ceil(box.x1 * scale); x++) {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
    const i = (y * image.width + x) * 4;
    for (let k = 0; k < 3; k++) image.data[i + k] = Math.round(image.data[i + k] * (1 - alpha) + [4, 6, 9][k] * alpha);
  }
};
const PANEL = [10, 14, 18]; const DANGER = [240, 90, 90]; const LABEL = [92, 92, 92]; const CHEVRON = [231, 190, 112];
const WHITE = [230, 237, 243];
const slot = {
  name: 'APFSDS|0', box: { x0: 5, y0: 5, x1: 53, y1: 57 },
  count: { box: { x0: 40, y0: 7, x1: 47, y1: 20 }, danger: true },
  label: { box: { x0: 9, y0: 44, x1: 44, y1: 54 } },
  strike: { length: 24, box: { x0: 20, y0: 21.5, x1: 38, y1: 39.5 } },
  chevron: { box: { x0: 7, y0: 24, x1: 17.1, y1: 37 } },
  edge: { box: { x0: 5, y0: 5, x1: 53, y1: 6 }, rgb: [255, 189, 92] },
};
const zero = (image, rgb) => { for (let y = 16; y < 38; y++) for (let x = 82; x < 94; x++) if (x < 84 || x > 91 || y < 18 || y > 35) paint(image, x, y, rgb); };
const strikeInk = (image) => {
  for (let t = -12; t <= 12; t += 0.25) {
    const x = (29 + t * Math.SQRT1_2) * scale; const y = (30.5 - t * Math.SQRT1_2) * scale;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) paint(image, x + dx, y + dy, DANGER);
  }
};
const scene = blank(60 * scale, 62 * scale, PANEL);
for (let x = 10 * scale; x < 106; x++) for (const y of [10, 11]) paint(scene, x, y, slot.edge.rgb);
zero(scene, DANGER);
for (let y = 92; y < 104; y++) for (let x = 18; x < 88; x++) if (x % 4 !== 3) paint(scene, x, y, LABEL); // APFSDS
strikeInk(scene);
for (let k = 0; k < 6; k++) for (let w = 0; w < 2; w++) { paint(scene, 22 - k + w, 54 + k, CHEVRON); paint(scene, 22 - k + w, 66 - k, CHEVRON); } // ‹
assert.deepEqual(slotFrameFindings(scene, [slot], scale), [], 'every mark the DOM names is in the frame');

// r4b's frame: none of the slot's marks, and a 0.72 dark box the slot's size, 4 px high, over its frame
const stripped = blank(60 * scale, 62 * scale, PANEL);
for (let x = 10 * scale; x < 106; x++) for (const y of [10, 11]) paint(stripped, x, y, slot.edge.rgb);
shade(stripped, { x0: 5, y0: 1, x1: 53, y1: 53 });
const findings = slotFrameFindings(stripped, [slot], scale);
for (const mark of ['its count in the danger ink', 'its type label', 'its strike', 'its selection chevron', 'its top edge']) {
  assert.ok(findings.some((line) => line.includes(mark)), `the stripped slot reports ${mark} missing (${findings.join('; ')})`);
}

// a missing label is missing even where the shell's tail reaches into its box (text runs across its box; a tail does not)
const tail = blank(60 * scale, 62 * scale, PANEL);
for (let y = 88; y < 96; y++) for (let x = 46; x < 72; x++) paint(tail, x, y, [70, 72, 74]);
assert.ok(slotFrameFindings(tail, [{ name: 'APFSDS|24', box: slot.box, label: slot.label }], scale)[0]?.includes('its type label'),
  'a shell tail in the label box is not a label');

// the reload shade over the slot's upper half: the chevron under it still reads; a count under it is there but dimmed,
// and that is a failure (critic r7: the stacked and touch trays' corner count read about 2:1 under the shade while the ∞
// beside it stayed white); a count over the shade reads at full brightness
const reloading = blank(60 * scale, 62 * scale, [42, 31, 14]);
zero(reloading, WHITE); // a 24
for (let k = 0; k < 6; k++) for (let w = 0; w < 2; w++) { paint(reloading, 22 - k + w, 54 + k, CHEVRON); paint(reloading, 22 - k + w, 66 - k, CHEVRON); }
const lifted = copy(reloading);
shade(reloading, { x0: 6, y0: 6, x1: 52, y1: 32 });
const reloadSlot = { name: 'APFSDS|24', box: slot.box, count: { box: slot.count.box, danger: false }, chevron: slot.chevron };
const shaded = slotFrameFindings(reloading, [reloadSlot], scale);
assert.equal(shaded.length, 1, `only the dimmed count is a finding (${shaded.join('; ')})`);
assert.ok(shaded[0].startsWith('slot "APFSDS|24": its count is dimmed in the frame'), shaded[0]);
const ink = markInk(reloading, { x0: 78, y0: 12, x1: 96, y1: 42 }, { rise: 30 });
assert.ok(ink.ink > 40 && ink.reach > 0.5, `the shaded count is still there (${JSON.stringify(ink)})`);
shade(lifted, { x0: 6, y0: 6, x1: 52, y1: 32 });
zero(lifted, WHITE); // the count over the shade
assert.deepEqual(slotFrameFindings(lifted, [reloadSlot], scale), [], 'a count over the reload shade and the shaded chevron read');
// the numeral's brightness bar: a grey count (luma 165) is dimmed, the numeral's white is not
const grey = blank(60 * scale, 62 * scale, PANEL);
zero(grey, [165, 165, 165]);
assert.ok(slotFrameFindings(grey, [{ ...reloadSlot, chevron: null }], scale).some((line) => line.includes('its count is dimmed')),
  'a grey count is dimmed');

// 2b. The empty 0 is read by its danger hue, not its brightness (critic r6, K9: a 0 in any bright ink passed). A 0 in
// the numeral's white, and in near misses that fail one clause of the danger class each (too dark, too little red over
// green, too much green, too far from grey-red), is not the danger 0; the danger 0 is.
{
  const countOnly = { name: 'APFSDS|0', box: slot.box, count: slot.count };
  const NEAR = { white: WHITE, 'dark red (r <= 170)': [160, 60, 60], 'pink (r - g <= 65)': [200, 140, 140],
    'salmon (g >= 150)': [240, 160, 150], 'orange (|g - b| >= 45)': [240, 100, 30], amber: [240, 160, 48] };
  for (const [name, rgb] of Object.entries(NEAR)) {
    const frame = blank(60 * scale, 62 * scale, PANEL);
    zero(frame, rgb);
    assert.ok(slotFrameFindings(frame, [countOnly], scale).some((line) => line.includes('its count in the danger ink')),
      `a ${name} 0 is not the danger 0`);
  }
  const frame = blank(60 * scale, 62 * scale, PANEL);
  zero(frame, DANGER);
  assert.deepEqual(slotFrameFindings(frame, [countOnly], scale), [], 'the danger 0 reads');
}

// 2c. The strike is read without the 0's pixels (critic r6, K8: the danger 0 inside the strike's box stood in for a
// missing strike). Where the slot's 0 sits inside the strike's box, a frame with the 0 and no strike misses the strike;
// with both, nothing is missing.
{
  const overlapped = { name: 'APFSDS|0', box: slot.box, count: { box: { x0: 39, y0: 7, x1: 48, y1: 21 }, danger: true },
    strike: { length: 24, box: { x0: 20, y0: 6, x1: 48, y1: 40 } } };
  const zeroOnly = blank(60 * scale, 62 * scale, PANEL);
  zero(zeroOnly, DANGER);
  const inBox = markInk(zeroOnly, { x0: 40, y0: 12, x1: 96, y1: 80 }, { hue: (r, g, b) => r > 170 && r - g > 65 }).ink;
  assert.ok(inBox >= Math.round(overlapped.strike.length * scale * 0.6), `the 0 alone fills the strike's need (${inBox} px)`);
  assert.ok(slotFrameFindings(zeroOnly, [overlapped], scale).some((line) => line.includes('its strike is not in the frame')),
    'the 0 inside the strike\'s box is not its strike');
  const both = copy(zeroOnly);
  strikeInk(both);
  assert.deepEqual(slotFrameFindings(both, [overlapped], scale), [], 'the 0 and the strike both read');
}

// 3. The ink gap between two marks: device pixels 14 and 20 are 6 apart, 5 px of gap at scale 2 = 2.5 CSS px.
{
  const bare = blank(40, 10, PANEL); const mark = copy(bare); const icon = copy(bare);
  for (let y = 2; y < 8; y++) { for (let x = 10; x <= 14; x++) paint(mark, x, y, [220, 220, 220]); for (let x = 20; x <= 24; x++) paint(icon, x, y, [140, 140, 140]); }
  assert.equal(inkGap({ bare, mark, icon }, { x0: 0, y0: 0, x1: 20, y1: 5 }, 2), 2.5);
  assert.equal(inkGap({ bare, mark, icon: bare }, { x0: 0, y0: 0, x1: 20, y1: 5 }, 2), null, 'no icon ink: no gap');
}

// --- 4. The flow, end to end, against a recording browser over a fake DOM ---
// The fake DOM holds the tray slots, the reticle canvas and the controls readHud reads. Each element has a CSS box, an
// ink box for its text (what a Range measures), a computed style and pseudo styles. A screenshot draws the slots from
// it as a synthetic PNG: panel, top edge, the key, the shell icon, the count, the label, the strike and the chevron,
// each where the DOM puts it and only while visible.
const SCALE = 2;
const VIEW = { width: 240, height: 130 };
const rgbOf = (color) => (/rgba?\((\d+), (\d+), (\d+)/.exec(color)?.slice(1) ?? [0, 0, 0]).map(Number);
class FakeElement {
  constructor({ classes = [], text = '', box = null, ink = null, style = {}, pseudo = {}, children = {}, attrs = {}, shown = true, colour = null }) {
    Object.assign(this, { classes, textContent: text, box, ink, computed: style, pseudo, children, attrs, shown, colour, style: {} });
    this.classList = { contains: (name) => this.classes.includes(name) };
    for (const child of Object.values(children)) child.parent = this;
  }
  checkVisibility() { return this.shown && this.style.visibility !== 'hidden' && (!this.parent || this.parent.checkVisibility()); }
  getBoundingClientRect() { const b = this.box ?? { x0: 0, y0: 0, x1: 0, y1: 0 }; return { left: b.x0, top: b.y0, right: b.x1, bottom: b.y1 }; }
  querySelector(selector) { return this.children[selector] ?? null; }
  getAttribute(name) { return this.attrs[name] ?? null; }
}
const at = (box, dx, dy) => ({ x0: box.x0 + dx, y0: box.y0 + dy, x1: box.x1 + dx, y1: box.y1 + dy });
/**
 * One tray slot at (x, y), 64 px square on a mouse tray or 48x52 on touch. `gaps` moves its marks: { label: CSS px from
 * the icon's foot to the label's ink }.
 */
function fakeSlot({ x, y, type, count, empty = false, selected = false, touch = false, shown = true, labelRise = 0 }) {
  const w = touch ? 48 : 64; const h = touch ? 52 : 64;
  const box = { x0: x, y0: y, x1: x + w, y1: y + h };
  const rel = (x0, y0, x1, y1) => at({ x0, y0, x1, y1 }, x, y);
  const danger = 'rgb(240, 90, 90)';
  // a text's CSS box (its line box and padding) is larger than its ink box (what a Range measures; critic r7: equal boxes
  // let a descriptor read off the CSS box pass)
  const line = (box) => ({ x0: box.x0 - 2, y0: box.y0 - 2, x1: box.x1 + 2, y1: box.y1 + 2 });
  const cnt = new FakeElement({ text: count, box: line(touch ? rel(w - 13, 3, w - 3, 16) : rel(w - 16, 46, w - 4, 61)),
    ink: touch ? rel(w - 13, 3, w - 3, 16) : rel(w - 16, 46, w - 4, 61),
    style: { color: empty ? danger : 'rgb(230, 237, 243)', opacity: '1', fontSize: touch ? '11px' : '13px', zIndex: '2' } });
  const ty = new FakeElement({ text: type, box: line(rel(5, 48 - labelRise, 34, 60 - labelRise)), ink: rel(5, 48 - labelRise, 34, 60 - labelRise),
    style: { color: 'rgb(150, 160, 170)', opacity: empty ? '0.34' : '1' } });
  const key = new FakeElement({ text: '1', box: rel(4, 3, 16, 16), shown: !touch, style: { opacity: '1' } });
  const canvas = new FakeElement({ box: rel(w / 2 - 4, 8, w / 2 + 4, 38) });
  const strike = empty ? { content: '""', left: '16px', right: '16px', top: `${(h - 3) / 2 - 0.75}px`, height: '1.5px', display: 'block' } : { content: 'none' };
  const chevron = touch && selected ? { content: '"‹"', left: '2px', top: '50%', fontSize: '13px', display: 'block' } : { content: 'none' };
  const el = new FakeElement({ classes: ['cot-shell', ...(empty ? ['empty'] : []), ...(selected ? ['sel'] : [])], box, shown,
    style: { borderTopWidth: '1px', borderRightWidth: '1px', borderBottomWidth: '2px', borderLeftWidth: '1px',
      borderTopColor: selected ? 'rgb(240, 160, 48)' : 'rgba(146, 164, 180, 0.28)', borderBottomColor: empty ? 'rgb(240, 90, 90)' : 'rgb(240, 160, 48)',
      boxShadow: 'none', opacity: '1' },
    pseudo: { '::before': strike, '::after': chevron }, children: { '.cnt': cnt, '.ty': ty, '.key': key, canvas } });
  return el;
}
/** Draws the visible slots as Chrome would, at SCALE; `strip` leaves out every mark over the slots (r4b's frames). */
function renderFrame(document, { strip = false } = {}) {
  const image = blank(VIEW.width * SCALE, VIEW.height * SCALE, [35, 48, 57]);
  const fill = (box, rgb, pattern = () => true) => {
    for (let y = Math.round(box.y0 * SCALE); y < Math.round(box.y1 * SCALE); y++) {
      for (let x = Math.round(box.x0 * SCALE); x < Math.round(box.x1 * SCALE); x++) if (pattern(x, y)) paint(image, x, y, rgb);
    }
  };
  // glyphs: two of every three columns, inside the line box's middle rows
  const glyphs = (box, rgb) => fill({ x0: box.x0 + 0.5, y0: box.y0 + 2, x1: box.x1 - 0.5, y1: box.y1 - 2 }, rgb, (x) => x % 3 !== 2);
  for (const el of document.querySelectorAll('.cot-shell')) {
    if (!el.checkVisibility()) continue;
    fill(el.box, PANEL);
    const edge = rgbOf(el.computed.borderTopColor);
    if (/^rgb\(/.test(el.computed.borderTopColor)) fill({ ...el.box, y1: el.box.y0 + 1 }, edge);
    if (strip) continue;
    const empty = el.classList.contains('empty');
    const { '.cnt': cnt, '.ty': ty, '.key': key, canvas } = el.children;
    if (canvas.checkVisibility()) fill(canvas.box, empty ? [90, 94, 98] : [205, 212, 218]);
    if (key.checkVisibility()) { fill(key.box, [138, 151, 163]); fill({ x0: key.box.x0 + 1, y0: key.box.y0 + 1, x1: key.box.x1 - 1, y1: key.box.y1 - 1 }, PANEL); }
    if (cnt.checkVisibility()) glyphs(cnt.ink, empty ? DANGER : WHITE);
    if (ty.checkVisibility()) glyphs(ty.ink, empty ? [74, 80, 86] : [150, 160, 170]);
    if (empty) {
      const cx = (el.box.x0 + el.box.x1) / 2; const cy = el.box.y0 + 1 + (el.box.y1 - el.box.y0 - 3) / 2;
      const half = (el.box.x1 - el.box.x0 - 2 - 32) / 2;
      for (let t = -half; t <= half; t += 0.25) {
        const x = (cx + t * Math.SQRT1_2) * SCALE; const y = (cy - t * Math.SQRT1_2) * SCALE;
        for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) paint(image, x + dx, y + dy, DANGER);
      }
    }
    if (el.pseudo['::after'].content !== 'none') {
      const x = el.box.x0 + 1 + 2; const y = el.box.y0 + 1 + (el.box.y1 - el.box.y0 - 3) / 2;
      for (let k = 0; k < 10; k++) for (let w = 0; w < 2; w++) {
        paint(image, (x + 3) * SCALE - k / 2 + w, y * SCALE - k, CHEVRON); paint(image, (x + 3) * SCALE - k / 2 + w, y * SCALE + k, CHEVRON);
      }
    }
  }
  return image;
}
/** The fake page's document and window globals, for one case. */
function fakeDocument({ touch, slots, paintLog = [], extra = {}, tray = 'inline' }) {
  const canvas = new FakeElement({ classes: ['cot-ret'], box: { x0: 0, y0: 0, x1: VIEW.width, y1: VIEW.height } });
  Object.assign(canvas, { width: VIEW.width * SCALE, height: VIEW.height * SCALE,
    getContext: () => ({ getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }) }) });
  const fire = touch ? [0, 1].map(() => new FakeElement({ box: { x0: 0, y0: 0, x1: 1, y1: 1 }, style: { opacity: '1', borderTopColor: 'rgb(1, 2, 3)' } })) : [];
  const bySelector = { '.cot-ret': [canvas], '.cot-shell': slots, '.cot-touch .fire': fire, ...extra };
  return {
    body: { classList: { contains: (name) => name === 'cot-touch-layout' && touch }, dataset: { hudTray: tray } },
    querySelector: (selector) => bySelector[selector]?.[0] ?? null,
    querySelectorAll: (selector) => bySelector[selector] ?? [],
    createRange: () => ({ node: null, selectNodeContents(node) { this.node = node; },
      getBoundingClientRect() { const b = this.node.ink ?? this.node.box; return { left: b.x0, top: b.y0, right: b.x1, bottom: b.y1 }; } }),
    getAnimations: () => [],
    paintLog,
  };
}
function installGlobals(document) {
  Object.assign(globalThis, {
    window: globalThis, document, innerWidth: VIEW.width, innerHeight: VIEW.height,
    getComputedStyle: (el, pseudo) => (pseudo ? el.pseudo[pseudo] ?? { content: 'none' } : el.computed),
    requestAnimationFrame: (callback) => setImmediate(callback),
    __RETICLE_LOG: { paint: document.paintLog },
    __HUD_LAYOUT: { staged: [], state(name) { this.staged.push(name); } },
  });
}
/** A Chromium whose pages record every call (screenshot options as passed) and run the in-page functions on the fake DOM. */
function recordingChromium({ documents, strip = false }) {
  const calls = [];
  let pageIndex = 0;
  const chromium = {
    async launch(options) {
      calls.push({ kind: 'launch', options });
      return {
        async newContext(options) {
          calls.push({ kind: 'context', options });
          return {
            async addInitScript(fn) { calls.push({ kind: 'initScript', fn }); },
            async newPage() {
              const document = documents[pageIndex++];
              let frames = 0;
              return {
                on() {},
                async goto(url) { calls.push({ kind: 'goto', url }); installGlobals(document); },
                async waitForFunction(fn) { assert.ok(fn(), 'the fixture is up'); },
                async waitForTimeout(ms) { calls.push({ kind: 'wait', ms }); },
                async evaluate(fn, arg) { calls.push({ kind: 'evaluate', fn, arg }); return fn(arg); },
                async screenshot(options) {
                  calls.push({ kind: 'screenshot', options: options === undefined ? undefined : { ...options } });
                  const frame = options?.path ? frames++ === 0 : false;
                  return encodePng(renderFrame(document, { strip: strip && frame }));
                },
              };
            },
            async close() {},
          };
        },
        async close() { calls.push({ kind: 'browserClose' }); },
      };
    },
  };
  return { chromium, calls };
}
const lockCalls = [];
const lock = { async acquire(ms, options) { lockCalls.push(['acquire', ms, options]); }, refresh() { lockCalls.push(['refresh']); }, release() { lockCalls.push(['release']); } };
const files = new Map();
const io = { writeFile: async (path, data) => { files.set(path, data); }, mkdir: async () => {} };
const mouseSlots = () => [fakeSlot({ x: 10, y: 50, type: 'APFSDS', count: '0', empty: true, selected: true }),
  fakeSlot({ x: 84, y: 50, type: 'HEAT', count: '16' }), fakeSlot({ x: 158, y: 50, type: 'HE', count: '12' })];
const touchSlots = () => [fakeSlot({ x: 150, y: 40, type: 'APFSDS', count: '0', empty: true, selected: true, touch: true }),
  fakeSlot({ x: 150, y: 40, type: 'HEAT', count: '16', touch: true, shown: false }),
  fakeSlot({ x: 150, y: 40, type: 'HE', count: '12', touch: true, shown: false })];
const CASE_MOUSE = { name: 'mouse', width: 1440, height: 900, touch: false, scale: SCALE, stages: ['ammo-dry-cannon'], crop: true };
const CASE_TOUCH = { name: 'touch', width: 390, height: 844, touch: true, scale: SCALE, stages: ['ammo-dry-cannon'], crop: true };
async function run({ documents, strip = false, cases = [CASE_MOUSE, CASE_TOUCH] }) {
  const { chromium, calls } = recordingChromium({ documents, strip });
  files.clear(); lockCalls.length = 0;
  const result = await runCapture({ chromium, lock, url: 'http://fixture', out: '/evidence', cases, lockTimeoutMs: 1000, ...io });
  return { ...result, calls };
}
const ours = (issues, prefix) => issues.filter((line) => prefix.some((p) => line.includes(p)));
const FLOW_ISSUES = ['saved frame:', 'the DOM read names', 'tray count', 'tray label', 'tray key', 'tray text', 'no visible tray slot'];

// 4a. A clean run: the real readHud reads the fake DOM and names every mark each visible slot shows; the frame and
// every ink shot are full-viewport screenshots; nothing touches the page between the DOM read and the frame.
{
  const mouse = fakeDocument({ touch: false, slots: mouseSlots() });
  const touch = fakeDocument({ touch: true, slots: touchSlots() });
  const { reports, calls } = await run({ documents: [mouse, touch] });
  assert.equal(reports.length, 2);
  assert.deepEqual(lockCalls.filter(([kind]) => kind !== 'refresh').map(([kind]) => kind), ['acquire', 'release'], 'the capture lock is held, then released');
  assert.ok(calls.some((call) => call.kind === 'initScript' && call.fn === recordReticle), 'the reticle recorder is installed before boot');
  for (const [report, document] of [[reports[0], mouse], [reports[1], touch]]) {
    const at = report.case;
    assert.deepEqual(ours(report.issues, FLOW_ISSUES), [], `${at}: a clean frame has no flow failures (${report.issues.join('; ')})`);
    const visible = document.querySelectorAll('.cot-shell').filter((el) => el.checkVisibility());
    assert.equal(report.slots.length, visible.length, `${at}: one descriptor per visible slot`);
    report.slots.forEach((descriptor, i) => {
      const el = visible[i];
      // the descriptor is filled in from the DOM (critic r6, F8: a read that never names a label disabled every label check)
      assert.deepEqual(descriptor.label?.box, el.children['.ty'].ink, `${at} ${descriptor.name}: the label's ink box`);
      assert.deepEqual(descriptor.count?.box, el.children['.cnt'].ink, `${at} ${descriptor.name}: the count's ink box`);
      assert.equal(descriptor.count.danger, el.classList.contains('empty'), `${at} ${descriptor.name}: the danger 0`);
      assert.deepEqual(descriptor.key?.box ?? null, report.case === 'mouse' ? el.children['.key'].box : null, `${at} ${descriptor.name}: the key`);
      assert.equal(!!descriptor.strike, el.classList.contains('empty'), `${at} ${descriptor.name}: an empty slot's strike`);
      assert.equal(!!descriptor.chevron, report.case === 'touch' && el.classList.contains('sel'), `${at} ${descriptor.name}: the chevron`);
    });
    // every slot's gaps were measured from shots: count, label and key to the icon, the count to the label and the key
    for (const row of report.trayInk) {
      const pairs = ['count-icon', 'label-icon', 'count-label', ...(report.case === 'mouse' ? ['key-icon', 'key-count'] : [])];
      for (const pair of pairs) assert.ok(row[pair] >= TRAY_INK_GAP, `${at} ${row.text}: ${pair} ${row[pair]} px`);
    }
  }
  // the calls as made: no screenshot carries a clip, however it is passed (critic r6, F2), and only the frame a path
  const shots = calls.filter((call) => call.kind === 'screenshot');
  assert.ok(shots.length >= 2 * 5, `the frames and their ink shots (${shots.length})`);
  for (const call of shots) {
    assert.ok(call.options === undefined || Object.keys(call.options).every((key) => key === 'path'),
      `a screenshot passes only a path (${JSON.stringify(call.options)})`);
  }
  assert.deepEqual(shots.filter((call) => call.options?.path).map((call) => call.options.path),
    ['/evidence/mouse-ammo-dry-cannon.png', '/evidence/touch-ammo-dry-cannon.png'], 'one saved frame per stage');
  // per stage: staged and settled, the DOM read, the frame at once, then the ink shots
  const pageCalls = calls.filter((call) => ['evaluate', 'screenshot', 'wait'].includes(call.kind));
  const reads = pageCalls.map((call, i) => (call.fn === readHud ? i : -1)).filter((i) => i >= 0);
  assert.equal(reads.length, 2, 'one DOM read per stage');
  const name = (call) => call.fn?.name ?? call.kind;
  for (const [k, read] of reads.entries()) {
    assert.equal(pageCalls[read].arg, RULES, 'readHud reads with the exported rules');
    assert.deepEqual(pageCalls.slice(read - 6, read + 1).map(name),
      ['stageInPage', 'framesInPage', 'stageInPage', 'framesInPage', 'wait', 'settleTray', 'readHud'],
      'the stage is staged twice across frames, the tray settles, then the DOM is read');
    const frame = pageCalls[read + 1];
    assert.ok(frame.kind === 'screenshot' && frame.options?.path, 'the frame is the very next call after the DOM read');
    const after = pageCalls.slice(read + 2, k + 1 < reads.length ? reads[k + 1] - 6 : pageCalls.length);
    const inkShots = after.filter((call) => call.kind === 'screenshot');
    assert.ok(inkShots.length >= 4 && inkShots.every((call) => !call.options?.path), 'the ink shots follow the frame, unsaved');
    const marks = after.filter((call) => call.fn === showTrayMarks);
    assert.ok(marks.length === inkShots.length + 1, 'each ink shot shows its marks, and the last call shows them all again');
    assert.deepEqual(marks.at(-1).arg[1], ['count', 'label', 'icon', 'key'], 'every mark is shown again after the ink shots');
  }
  assert.ok([stageInPage, framesInPage, settleTray].every((fn) => pageCalls.some((call) => call.fn === fn)), 'the stage helpers ran');
  assert.ok(files.has('/evidence/report.json'), 'the report is written');
}

// 4b. r4b's frames, through the flow: the saved frame has none of the slots' marks. Every line the saved-frame read
// finds is a failure of that stage, none filtered or dropped (critic r6, F6: a findings array filtered to nothing).
{
  const { reports, calls } = await run({ documents: [fakeDocument({ touch: false, slots: mouseSlots() }), fakeDocument({ touch: true, slots: touchSlots() })], strip: true });
  const frames = [];
  for (const call of calls) if (call.kind === 'screenshot' && call.options?.path) frames.push(call);
  for (const report of reports) {
    const document = fakeDocument({ touch: report.case === 'touch', slots: report.case === 'touch' ? touchSlots() : mouseSlots() });
    const expected = slotFrameFindings(renderFrame(document, { strip: true }), report.slots, SCALE);
    const marks = report.slots.reduce((sum, item) => sum + 2 + (item.strike ? 1 : 0) + (item.chevron ? 1 : 0), 0);
    assert.equal(expected.length, marks, `${report.case}: the stripped frame misses each slot's count, label, strike and chevron`);
    assert.deepEqual(report.frameFindings, expected, `${report.case}: the stage reports the saved frame's findings as read`);
    for (const line of expected) assert.ok(report.issues.includes(`saved frame: ${line}`), `${report.case}: "${line}" is a failure`);
    for (const mark of ['its count', 'its type label', 'its strike']) {
      assert.ok(report.issues.some((line) => line.startsWith('saved frame:') && line.includes(mark)), `${report.case}: ${mark} missing fails`);
    }
  }
  assert.equal(frames.length, 2);
}

// 4c. A label that crowds its icon, a count over its label, and a slot the DOM read cannot name: each is a failure
// of its stage (critic r6: the stacked trays' ∞ and 0 over APFSDS; a label-less descriptor skipped every label read).
{
  const crowded = mouseSlots();
  const label = crowded[1].children['.ty'];
  label.ink = label.box = { x0: 89, y0: 88.5, x1: 118, y1: 99.5 }; // its glyphs 2.5 px under the icon's foot (y 88)
  const overCount = touchSlots();
  overCount[0].children['.cnt'].ink = overCount[0].children['.cnt'].box = { x0: 175, y0: 86, x1: 186, y1: 99 }; // on the label
  const { reports } = await run({ documents: [fakeDocument({ touch: false, slots: crowded }), fakeDocument({ touch: true, slots: overCount })] });
  assert.ok(reports[0].issues.includes('tray label of "HEAT|16" 2.5 px from its shell icon'),
    `a label 2.5 px from its icon fails (${reports[0].issues.join('; ')})`);
  assert.ok(reports[1].issues.some((line) => line.startsWith('tray count of "APFSDS|0"') && line.endsWith('from its label')),
    `a count on its label fails (${reports[1].issues.join('; ')})`);
  // an icon the frame shows no ink of leaves its gaps unmeasured: that is a failure, not a pass
  const blankIcon = mouseSlots();
  blankIcon[2].children.canvas.box = { x0: 190, y0: 70, x1: 190, y1: 70 };
  const third = await run({ documents: [fakeDocument({ touch: false, slots: blankIcon })], cases: [CASE_MOUSE] });
  assert.ok(third.reports[0].issues.includes('tray count of "HE|12" null px from its shell icon'), third.reports[0].issues.join('; '));
  // the DOM read finds no label text: the descriptor names none, and that is a failure, not a skipped check
  const unnamed = mouseSlots();
  unnamed[2].children['.ty'].textContent = '';
  const second = await run({ documents: [fakeDocument({ touch: false, slots: unnamed })], cases: [CASE_MOUSE] });
  assert.ok(second.reports[0].issues.includes('slot "|12": the DOM read names no type label'), second.reports[0].issues.join('; '));
}

// 4d. Every descriptor check, each on its own (critic r7: only a missing label on a mouse tray was pinned; deleting the
// count, danger-ink, key, strike, chevron or no-slot check, or limiting the label or count check to mouse trays, passed).
// Each run below breaks one mark the DOM read must name, on a mouse tray and on a touch tray, and that slot's line is a
// failure of its stage; the clean runs (4a) name no descriptor failure on either tray.
{
  const issuesOf = async (touch, breakSlots) => {
    const slots = touch ? touchSlots() : mouseSlots();
    breakSlots(slots);
    const { reports } = await run({ documents: [fakeDocument({ touch, slots })], cases: [touch ? CASE_TOUCH : CASE_MOUSE] });
    return reports[0].issues;
  };
  const DESCRIPTOR = [
    ['mouse: no count', false, (slots) => { slots[1].children['.cnt'].textContent = ''; }, 'slot "HEAT|": the DOM read names no count'],
    ['touch: no count', true, (slots) => { slots[0].children['.cnt'].textContent = ''; }, 'slot "APFSDS|": the DOM read names no count'],
    ['mouse: an empty slot\'s 0 in white', false, (slots) => { slots[0].children['.cnt'].computed.color = 'rgb(230, 237, 243)'; },
      'slot "APFSDS|0": its count\'s danger ink false does not match empty true'],
    ['mouse: a loaded slot\'s count in the danger ink', false, (slots) => { slots[2].children['.cnt'].computed.color = 'rgb(240, 90, 90)'; },
      'slot "HE|12": its count\'s danger ink true does not match empty false'],
    ['touch: an empty slot\'s 0 in white', true, (slots) => { slots[0].children['.cnt'].computed.color = 'rgb(230, 237, 243)'; },
      'slot "APFSDS|0": its count\'s danger ink false does not match empty true'],
    ['touch: no type label', true, (slots) => { slots[0].children['.ty'].textContent = ''; }, 'slot "|0": the DOM read names no type label'],
    ['mouse: no key', false, (slots) => { slots[2].children['.key'].shown = false; }, 'slot "HE|12": the DOM read names no key'],
    ['mouse: an empty slot without its strike', false, (slots) => { slots[0].pseudo['::before'] = { content: 'none' }; },
      'slot "APFSDS|0": the DOM read names no strike on an empty slot'],
    ['touch: an empty slot without its strike', true, (slots) => { slots[0].pseudo['::before'] = { content: 'none' }; },
      'slot "APFSDS|0": the DOM read names no strike on an empty slot'],
    ['touch: the selected slot without its chevron', true, (slots) => { slots[0].pseudo['::after'] = { content: 'none' }; },
      'slot "APFSDS|0": the DOM read names no chevron on the selected slot'],
    ['mouse: no visible slot', false, (slots) => { for (const el of slots) el.shown = false; }, 'no visible tray slot'],
    ['touch: no visible slot', true, (slots) => { for (const el of slots) el.shown = false; }, 'no visible tray slot'],
  ];
  for (const [name, touch, breakSlots, line] of DESCRIPTOR) {
    const issues = await issuesOf(touch, breakSlots);
    assert.ok(issues.includes(line), `${name}: "${line}" is a failure (${issues.join('; ')})`);
  }
}

// 5. The reticle's furniture checks in readHud, on recorded paint (critic r6: make the report catch them). The desktop
// scope's reload as r6 measured it — the countdown on the ring's lower arc, its digits 1.65 px under the clip's
// contours — and a phone's clip touching its small ring fail; the r7 layout passes. 400x300 CSS, the sight at 200,150.
{
  const contour = (cx, y0, w, h) => ({ op: 'stroke', style: 'rgba(5,8,11,0.88)', lineWidth: 3, n: 7, ring: false, circle: null,
    box: { x0: cx - w / 2 - 1.5, y0: y0 - 1.5, x1: cx + w / 2 + 1.5, y1: y0 + h + 1.5 } });
  const halo = (r, lineWidth) => ({ op: 'stroke', style: 'rgba(0,0,0,0.62)', lineWidth, n: 2, ring: true, circle: { x: 200, y: 150, r },
    box: { x0: 200 - r - lineWidth / 2, y0: 150 - r - lineWidth / 2, x1: 200 + r + lineWidth / 2, y1: 150 + r + lineWidth / 2 } });
  const text = (value, x0, baseline, w, size = 16) => ({ op: 'text', text: value, style: 'rgba(240,160,48,0.95)',
    box: { x0, y0: baseline - size * 0.74, x1: x0 + w, y1: baseline + size * 0.08 } });
  const rackAt = (y0, shellW = 6.5, shellH = 16, gap = 4) => [0, 1, 2, 3].map((i) => contour(200 + (i - 1.5) * (shellW + gap), y0 + (i === 1 || i === 2 ? 1.5 : 0), shellW, shellH));
  const read = (paintLog) => {
    const document = fakeDocument({ touch: false, slots: [], paintLog });
    installGlobals(document);
    Object.assign(globalThis, { innerWidth: 400, innerHeight: 300 });
    return readHud(RULES).overlaps;
  };
  // r6, desktop ×8 (ring 54 px): rack at cy+27 (its middle shells 1.5 px lower, their foot at 194.5), the countdown's
  // baseline 15 px under that foot
  const r6 = read([halo(54, 3), ...rackAt(177), text('12', 190, 194.5 + 15, 16)]);
  assert.ok(r6.some((line) => /^"12" -?[\d.]+ px from the ring$/.test(line)), `the countdown on the ring fails (${r6.join('; ')})`);
  const rackGap = r6.map((line) => /^"12" ([\d.]+) px from the rack$/.exec(line)?.[1]).find(Boolean);
  assert.ok(rackGap != null && Number(rackGap) < 2, `digits 1.66 px under the clip's contours fail (${r6.join('; ')})`);
  // r7: the rack below the ring (ring foot 204 + halo 1.5 + 3 + turn 0.4 + contour 1.5), the digits 3 px under its contours
  const rackTop = 150 + 54 + 1.5 + 3 + 0.4 + 1.5;
  const rackFoot = rackTop + 1.5 + 16;
  const r7 = read([halo(54, 3), ...rackAt(rackTop), text('12', 190, rackFoot + 1.5 + 3 + 11.84, 16)]);
  assert.deepEqual(r7, [], 'the r7 desktop scope stack keeps every gap');
  // a phone's live clip at cy+20 inside a 19.5 px ring (critic r6, D3) fails; dropped below the ring it passes
  const phone = read([halo(19.5, 2.8), ...rackAt(170, 5.5, 14, 3.5)]);
  assert.ok(phone.some((line) => line.startsWith('a rack shell')), `a phone's clip on its ring fails (${phone.join('; ')})`);
  assert.deepEqual(read([halo(19.5, 2.8), ...rackAt(150 + 19.5 + 1.4 + 3 + 0.4 + 1.5 + 0.1, 5.5, 14, 3.5)]), [], 'below the ring it passes');
  // the ring's halo is the widest full-circle stroke: a thinner ink pass of the same ring does not loosen the check
  // (digits 3.2 px under the ink pass's reach, 2.45 px under the halo's)
  const both = read([halo(54, 3), { ...halo(54, 1.5), style: 'rgba(140,242,140,0.95)' }, text('3', 195, 150 + 54 + 0.75 + 3.2 + 11.84, 10)]);
  assert.ok(both.some((line) => line === '"3" 2.45 px from the ring'), `a countdown 3.2 px under the ink but inside the halo's gap fails (${both.join('; ')})`);
}

// 5b. The scope's vision switch and the sight's marks against the HUD's panels (critic r8: seated under the sight, the
// switch ran under the tray slots and the controls row on short mouse windows, and the readouts and the warning chip
// landed on it; the stack's foot ran 4.77 px into a controls row modelled 112 px up, and the row starts 120 px up). The
// switch over a tray slot, 2 px from one, off the screen; a readout 2 px over a controls button; the warning chip over a
// control and over a readout; a wide tray's row where hud.ts does not model it: each is a line of the report, and the
// clear layout reads none. 400x300 CSS, the sight at 200,150.
{
  const el = (box) => new FakeElement({ box, style: { opacity: '1' } });
  const read = ({ paintLog = [], extra = {}, tray = 'inline', slots = [] }) => {
    const document = fakeDocument({ touch: false, slots, paintLog, extra, tray });
    installGlobals(document);
    Object.assign(globalThis, { innerWidth: 400, innerHeight: 300 });
    return readHud(RULES).overlaps;
  };
  const row = (top) => el({ x0: 120, y0: top, x1: 280, y1: top + 32 });
  const clearRow = { '.cot-vehicle-controls': [row(180)], '.cot-vehicle-controls>button': [row(180)] };
  const slot = () => [fakeSlot({ x: 260, y: 236, type: 'HE', count: '12' })]; // (260,236)-(324,300)
  const switchAt = (x0, y0) => ({ '.cot-scope-vision': [el({ x0, y0, x1: x0 + 156, y1: y0 + 48 })] });
  // clear: the switch beside the sight, 3 px or more from the slot and the row
  assert.deepEqual(read({ extra: { ...clearRow, ...switchAt(230, 126) }, slots: slot() }), [], 'a clear switch reads no line');
  const over = read({ extra: { ...clearRow, ...switchAt(200, 220) }, slots: slot() });
  assert.ok(over.some((line) => /^the vision switch -[\d.]+ px from \.cot-shell$/.test(line)), `the switch over a tray slot fails (${over.join('; ')})`);
  const near = read({ extra: { ...clearRow, ...switchAt(230, 186) }, slots: slot() });
  assert.ok(near.includes('the vision switch 2 px from .cot-shell'), `the switch 2 px from a slot fails (${near.join('; ')})`);
  const off = read({ extra: { ...clearRow, ...switchAt(300, 126) } });
  assert.ok(off.includes('the vision switch leaves the screen'), `a switch off the screen fails (${off.join('; ')})`);
  const onRow = read({ extra: { ...clearRow, ...switchAt(150, 160) } });
  assert.ok(onRow.some((line) => /^the vision switch -[\d.]+ px from \.cot-vehicle-controls>button$/.test(line)), `the switch on the row fails (${onRow.join('; ')})`);
  // a readout under the marker 2 px over a controls button (the r8 stack's foot at a row modelled 112 px up)
  const text = (value, x0, baseline, w, size = 13.5) => ({ op: 'text', text: value, style: 'rgba(226,236,244,0.92)',
    box: { x0, y0: baseline - size * 0.74, x1: x0 + w, y1: baseline + size * 0.08 } });
  const foot = read({ paintLog: [text('14 ', 185, 178 - 13.5 * 0.08, 20)], extra: clearRow });
  assert.ok(foot.includes('"14 " 2 px from .cot-vehicle-controls>button'), `a readout 2 px over the row fails (${foot.join('; ')})`);
  assert.deepEqual(read({ paintLog: [text('14 ', 185, 177 - 13.5 * 0.08, 20)], extra: clearRow }), [], 'a readout 3 px over the row passes');
  // the warning chip (its six-point outline around its text) over a control, and over a readout
  const chip = (cx, y, w = 130) => [{ op: 'stroke', style: 'rgba(170,180,190,.55)', lineWidth: 1, n: 6, ring: false, circle: null,
    box: { x0: cx - w / 2, y0: y - 14, x1: cx + w / 2, y1: y + 10 } }, text('GUN TRAVEL LIMIT', cx - w / 2 + 36, y + 1, 80, 10.5)];
  const chipOnRow = read({ paintLog: chip(200, 178), extra: clearRow });
  assert.ok(chipOnRow.some((line) => /^the warning chip -[\d.]+ px from \.cot-vehicle-controls>button$/.test(line)), `the chip on the row fails (${chipOnRow.join('; ')})`);
  const chipOnText = read({ paintLog: [...chip(200, 170), text('14 ', 185, 182, 20)], extra: { '.cot-vehicle-controls': [row(260)] } });
  assert.ok(chipOnText.includes('the warning chip over "14 "'), `the chip over a readout fails (${chipOnText.join('; ')})`);
  assert.deepEqual(read({ paintLog: chip(200, 100), extra: { '.cot-vehicle-controls': [row(180)] } }), [], 'a chip above the ring passes');
  // the zoom plate's rule 2 px from the speedometer, its text on it, and a readout row set right of the column (its plate
  // centred 200 px from the marker) on the minimap (critic r8 round: a 480 px window's plate touched the speedometer)
  const rule = (x0, y) => ({ op: 'stroke', style: 'rgba(170,240,178,0.5)', lineWidth: 1.2, n: 4, ring: false, circle: null,
    box: { x0, y0: y - 6.1, x1: x0 + 20, y1: y - 4.9 } });
  const drive = { '.cot-drive': [el({ x0: 100, y0: 200, x1: 181, y1: 281 })] };
  const ruleNear = read({ paintLog: [rule(183, 220)], extra: drive });
  assert.ok(ruleNear.includes('a zoom rule 2 px from .cot-drive'), `a zoom rule 2 px from the speedometer fails (${ruleNear.join('; ')})`);
  const plateOn = read({ paintLog: [text('×8.0', 170, 230, 28, 16)], extra: drive });
  assert.ok(plateOn.some((line) => /^"×8.0" -[\d.]+ px from \.cot-drive$/.test(line)), `the zoom plate on the speedometer fails (${plateOn.join('; ')})`);
  const far = read({ paintLog: [text('×8.0', 386, 230, 28, 16)], extra: { '.cot-minimap': [el({ x0: 380, y0: 200, x1: 400, y1: 300 })] } });
  assert.ok(far.some((line) => /^"×8.0" -[\d.]+ px from \.cot-minimap$/.test(line)), `a plate 200 px right of the marker on the minimap fails (${far.join('; ')})`);
  // a wide mouse tray's row 112 px over the floor (where hud.ts no longer models it); a stacked tray's row may sit anywhere
  const model = read({ extra: { '.cot-vehicle-controls': [row(188)] } });
  assert.ok(model.includes('the controls row starts 112 px over the floor, hud.ts models 120'), `a row off the model fails (${model.join('; ')})`);
  assert.deepEqual(read({ extra: { '.cot-vehicle-controls': [row(188)] }, tray: 'stacked' }), [], 'a stacked tray\'s row is not modelled');
}

// 6. The command line hands the flow its browser and lock and takes no screenshot of its own.
{
  const cli = readFileSync(new URL('./hud-ammo-states.browser.mjs', import.meta.url), 'utf8');
  assert.match(cli, /import \{ runCapture \} from '\.\/hud-ammo-capture\.mjs'/, 'the command line runs the tested flow');
  assert.doesNotMatch(cli, /\.screenshot\(|\bpage\.[a-z]|\.evaluate\(|newPage/, 'the command line touches no page itself');
}

console.log('hud-ammo-frame-ink.selftest: PNG rows decode exactly (RGB and RGBA, Paeth branch by branch, Average with odd '
  + 'sums); a stripped tray slot fails the saved-frame read mark by mark, the empty 0 by its hue, the strike without the '
  + '0, a count under the reload shade as dimmed; the capture flow, run against a recording browser, names every mark off '
  + 'its ink box, fails each missing descriptor mark on mouse and touch, clips no shot, reads its frame before any ink '
  + 'shot and fails every finding; the reticle checks catch the r6 countdown and clip on the ring; the vision switch over, '
  + 'near or off a panel, a readout, a zoom rule or the warning chip near a control (the speedometer and the minimap among '
  + 'them, a row set right of the column too) and a controls row off the model fail');
