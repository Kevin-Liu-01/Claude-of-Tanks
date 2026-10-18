// Receipt for tools/hud-ammo-frame-ink.mjs and the saved-frame read of tools/hud-ammo-states.browser.mjs (owner
// 2026-10-17: out of ammo and unlimited rounds; critic r4b: five phone frames lost the tray slot's count, label,
// strike and ∞ while every DOM check passed, because the DOM was read and the saved pixels were not).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { cropImage, decodePng, encodePng, inkGap, markInk, slotFrameFindings } from './hud-ammo-frame-ink.mjs';

// 1. PNG: every row filter Chrome may write decodes exactly; encode -> decode is exact; a crop keeps its pixels.
{
  const width = 3; const height = 5; const bpp = 3;
  const rows = Array.from({ length: height }, (_, y) => Array.from({ length: width * bpp }, (_, x) => (y * 53 + x * 29 + (x % 3) * 71) & 255));
  const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  const encoded = [];
  rows.forEach((row, y) => {
    const filter = y; // 0 none, 1 sub, 2 up, 3 average, 4 paeth
    const prior = y ? rows[y - 1] : new Array(width * bpp).fill(0);
    encoded.push(filter, ...row.map((v, x) => {
      const left = x >= bpp ? row[x - bpp] : 0; const up = prior[x]; const corner = x >= bpp ? prior[x - bpp] : 0;
      const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, corner)][filter];
      return (v - predictor) & 255;
    }));
  });
  const chunk = (type, body) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
    return Buffer.concat([head, body, tail]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from(encoded))), chunk('IEND', Buffer.alloc(0))]);
  const image = decodePng(png);
  assert.deepEqual([image.width, image.height], [width, height]);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      assert.deepEqual([...image.data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4)], [...row.slice(x * bpp, x * bpp + bpp), 255],
        `filter ${y} decodes pixel ${x}`);
    }
  });
  const again = decodePng(encodePng(image));
  assert.deepEqual([...again.data], [...image.data], 'encode -> decode is exact');
  const crop = cropImage(image, { x0: 1, y0: 2, x1: 3, y1: 4 });
  assert.deepEqual([crop.width, crop.height], [2, 2]);
  assert.deepEqual([...crop.data.subarray(0, 4)], [...image.data.subarray((2 * width + 1) * 4, (2 * width + 1) * 4 + 4)], 'a crop keeps its pixels');
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
const slot = {
  name: 'APFSDS|0', box: { x0: 5, y0: 5, x1: 53, y1: 57 },
  count: { box: { x0: 40, y0: 7, x1: 47, y1: 20 }, danger: true },
  label: { box: { x0: 9, y0: 44, x1: 44, y1: 54 } },
  strike: { length: 24, box: { x0: 20, y0: 21.5, x1: 38, y1: 39.5 } },
  chevron: { box: { x0: 7, y0: 24, x1: 17.1, y1: 37 } },
  edge: { box: { x0: 5, y0: 5, x1: 53, y1: 6 }, rgb: [255, 189, 92] },
};
const scene = blank(60 * scale, 62 * scale, PANEL);
for (let x = 10 * scale; x < 106; x++) for (const y of [10, 11]) paint(scene, x, y, slot.edge.rgb);
for (let y = 16; y < 38; y++) for (let x = 82; x < 94; x++) if (x < 84 || x > 91 || y < 18 || y > 35) paint(scene, x, y, DANGER); // the 0
for (let y = 92; y < 104; y++) for (let x = 18; x < 88; x++) if (x % 4 !== 3) paint(scene, x, y, LABEL); // APFSDS
for (let t = -12; t <= 12; t += 0.25) {
  const x = (29 + t * Math.SQRT1_2) * scale; const y = (30.5 - t * Math.SQRT1_2) * scale;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) paint(scene, x + dx, y + dy, DANGER);
}
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

// the reload shade over the slot's upper half dims the count and the chevron; dimmed is still there
const reloading = blank(60 * scale, 62 * scale, [42, 31, 14]);
for (let y = 16; y < 38; y++) for (let x = 82; x < 94; x++) if (x < 84 || x > 91 || y < 18 || y > 35) paint(reloading, x, y, [230, 237, 243]); // a 24
for (let k = 0; k < 6; k++) for (let w = 0; w < 2; w++) { paint(reloading, 22 - k + w, 54 + k, CHEVRON); paint(reloading, 22 - k + w, 66 - k, CHEVRON); }
shade(reloading, { x0: 6, y0: 6, x1: 52, y1: 32 });
assert.deepEqual(slotFrameFindings(reloading, [{ name: 'APFSDS|24', box: slot.box, count: { box: slot.count.box, danger: false },
  chevron: slot.chevron }], scale), [], 'a count and chevron under the reload shade still read');
const ink = markInk(reloading, { x0: 78, y0: 12, x1: 96, y1: 42 }, { rise: 30 });
assert.ok(ink.ink > 40 && ink.reach > 0.5, `the shaded count's ink (${JSON.stringify(ink)})`);

// 3. The ink gap between two marks: device pixels 14 and 20 are 6 apart, 5 px of gap at scale 2 = 2.5 CSS px.
{
  const bare = blank(40, 10, PANEL); const mark = copy(bare); const icon = copy(bare);
  for (let y = 2; y < 8; y++) { for (let x = 10; x <= 14; x++) paint(mark, x, y, [220, 220, 220]); for (let x = 20; x <= 24; x++) paint(icon, x, y, [140, 140, 140]); }
  assert.equal(inkGap({ bare, mark, icon }, { x0: 0, y0: 0, x1: 20, y1: 5 }, 2), 2.5);
  assert.equal(inkGap({ bare, mark, icon: bare }, { x0: 0, y0: 0, x1: 20, y1: 5 }, 2), null, 'no icon ink: no gap');
}

// 4. The capture reads the saved frame, with nothing between its DOM read and the frame, and never clips a shot.
{
  const tool = readFileSync(new URL('./hud-ammo-states.browser.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(tool, /screenshot\(\{[^)]*\bclip\b/, 'no clipped capture (r4b: clipped shots before the frame stripped the phone slot)');
  const settle = tool.indexOf('await settleTray(page)');
  const read = tool.indexOf('await page.evaluate(readHud');
  const frame = tool.indexOf('decodePng(await page.screenshot({ path: resolve(out, file) }))');
  const inkShots = tool.indexOf('await trayInkGaps(page, hud.slots, c.scale)');
  assert.ok(settle > 0 && settle < read && read < frame && frame < inkShots,
    'the tray settles, the DOM is read, the frame is saved, and only then are the ink shots taken');
  assert.doesNotMatch(tool.slice(read + 30, frame), /\bawait\b|\bpage\b/, 'nothing touches the page between the DOM read and the frame');
  assert.match(tool, /slotFrameFindings\(frame, hud\.slots, c\.scale\)[\s\S]{0,120}issues\.push\(`saved frame: /,
    'what the saved frame misses is a failure');
  assert.match(tool, /for \(const mark of \['count', 'label'\]\)/, 'the count and the type label each keep their gap from the icon');
}

console.log('hud-ammo-frame-ink.selftest: PNG rows decode exactly; a stripped tray slot fails the saved-frame read mark by '
  + 'mark while a shaded one passes; the capture reads its frame before any ink shot and never clips');
