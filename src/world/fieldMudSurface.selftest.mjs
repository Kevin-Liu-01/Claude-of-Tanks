// fieldMudSurface.selftest — the adobe field walls' worn mud print (the scenery lane, 2026-10-03; gauntlet wave 20 read
// the mud walls as "smooth pillow- and pipe-shaped walls instead of eroded mud brick"):
//   1. seamless: no step at the tile edge beyond the print's own texel-to-texel variation, across and up;
//   2. the render is lost in patches, a tenth to a third of the tile, most at the two feet and the crown of the
//      section (the arc's v), least mid face; the plain band past the section (the apron's) loses none;
//   3. where the render is off, the bricks show in courses: their mortar lines run along the tile at the course pitch;
//   4. the bricks read darker than the render (sun-dried earth under a lighter coat), and lie lower in the relief;
//   5. the phone print (256 px) keeps the loss share and the mean colour; deterministic, sixteen rows a slice.
import assert from 'node:assert/strict';
import { FIELD_MUD_PLAIN_V, paintFieldMudBuffers } from './fieldMudSurface.ts';

function drain(generator) {
  let slices = 0, step = generator.next();
  while (!step.done) { slices++; assert.equal(step.value.fine, true); step = generator.next(); }
  return { ...step.value, slices };
}
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const luma = (px, i) => px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114;
function meanLinear(px) {
  const m = [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) for (let c = 0; c < 3; c++) m[c] += lin(px[i + c] / 255);
  return m.map((v) => v / (px.length / 4));
}

const print = drain(paintFieldMudBuffers(512));
const { size, px, hgt, loss } = print;
assert.equal(size, 512);
assert.equal(print.slices, 512 / 16, 'sixteen rows a slice');
assert.deepEqual(drain(paintFieldMudBuffers(512)).px, px, 'the same seed paints the same print');

// 1. seamless
for (const across of [true, false]) {
  const steps = new Float64Array(size);
  for (let b = 0; b < size; b++) {
    let sum = 0;
    for (let t = 0; t < size; t++) {
      const i0 = across ? t * size + b : b * size + t;
      const i1 = across ? t * size + ((b + 1) % size) : ((b + 1) % size) * size + t;
      sum += Math.abs(luma(px, i1) - luma(px, i0));
    }
    steps[b] = sum / size;
  }
  // (the wrap's step against the print's own: the 98th inner step, or, up the tile, its course joints where the bricks
  // show — the wrap is a course joint in the worn foot, and those step the same)
  const wrap = steps[size - 1], inner = [...steps.slice(0, size - 1)].sort((a, b) => a - b);
  const pitch = size / 32;
  let local = 0;
  if (!across) {
    for (let c = 1; c < 32; c++) {
      const row = c * pitch - 1;
      let shown = 0;
      for (let x = 0; x < size; x++) shown += loss[row * size + x];
      if (shown / size > 0.5) local = Math.max(local, 1.3 * steps[row]);
    }
  }
  assert.ok(wrap <= Math.max(inner[Math.floor(inner.length * 0.98)], local), `the print tiles ${across ? 'along' : 'up'} (wrap ${wrap.toFixed(2)})`);
}

// 2. the losses: a share of the tile, most at the feet and the crown, none in the plain band
let total = 0;
const rowLoss = new Float64Array(size);
for (let y = 0; y < size; y++) { let n = 0; for (let x = 0; x < size; x++) n += loss[y * size + x]; rowLoss[y] = n / size; total += n; }
const share = total / (size * size);
assert.ok(share > 0.1 && share < 0.33, `the render is lost in patches over a tenth to a third of the tile (${share.toFixed(3)})`);
const band = (v0, v1) => { let s = 0, n = 0; for (let y = Math.floor(v0 * size); y < Math.ceil(v1 * size); y++) { s += rowLoss[(y + size) % size]; n++; } return s / n; };
const feet = (band(-0.04, 0.04) + band(0.8, 0.88)) / 2, crown = band(0.38, 0.46), midFace = (band(0.17, 0.25) + band(0.59, 0.67)) / 2;
assert.ok(feet > midFace * 1.6 && crown > midFace * 1.3, `the feet (${feet.toFixed(3)}) and the crown (${crown.toFixed(3)}) wear more than mid face (${midFace.toFixed(3)})`);
assert.equal(band(FIELD_MUD_PLAIN_V[0], FIELD_MUD_PLAIN_V[1]), 0, 'the plain band (the apron\'s) keeps its render');

// 3. the courses: inside the losses, the darkest rows (the mortar) fall at the course pitch (32 courses, 16 px)
const pitch = size / 32, phase = new Float64Array(pitch);
const phaseN = new Float64Array(pitch);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const i = y * size + x;
  if (!loss[i]) continue;
  phase[y % pitch] += hgt[i]; phaseN[y % pitch]++;
}
const relief = Array.from(phase, (s, k) => s / Math.max(1, phaseN[k]));
const lowest = relief.indexOf(Math.min(...relief)), highest = relief.indexOf(Math.max(...relief));
assert.ok(lowest === 0 || lowest === pitch - 1 || lowest === 1, `the bed joints fall on the course edges (lowest at row ${lowest} of ${pitch})`);
assert.ok(relief[highest] - relief[lowest] > 0.1, 'the bricks stand proud of their mortar');

// 4. bricks darker and lower than the render
let lossL = 0, renderL = 0, lossH = 0, renderH = 0, nl = 0, nr = 0;
for (let i = 0; i < loss.length; i++) {
  if (loss[i]) { lossL += luma(px, i); lossH += hgt[i]; nl++; } else { renderL += luma(px, i); renderH += hgt[i]; nr++; }
}
lossL /= nl; renderL /= nr; lossH /= nl; renderH /= nr;
assert.ok(lossL < renderL * 0.92, `the bricks read darker than the render (${lossL.toFixed(1)} vs ${renderL.toFixed(1)})`);
assert.ok(lossH < renderH - 0.15, `the bricks lie under the render's face (${lossH.toFixed(2)} vs ${renderH.toFixed(2)})`);

// 5. the phone print
const phone = drain(paintFieldMudBuffers(256));
assert.equal(phone.slices, 256 / 16);
let phoneLoss = 0;
for (const l of phone.loss) phoneLoss += l;
phoneLoss /= phone.loss.length;
assert.ok(Math.abs(phoneLoss - share) < 0.03, `the phone print keeps the loss share (${phoneLoss.toFixed(3)} vs ${share.toFixed(3)})`);
const mean = meanLinear(px), phoneMean = meanLinear(phone.px);
for (let c = 0; c < 3; c++) assert.ok(Math.abs(phoneMean[c] / mean[c] - 1) < 0.03, `channel ${c}: the phone print keeps the mean colour`);

console.log(`fieldMudSurface self-test passed: seamless; render lost over ${(share * 100).toFixed(1)} % (feet ${(feet * 100).toFixed(0)} %, crown ${(crown * 100).toFixed(0)} %, mid face ${(midFace * 100).toFixed(0)} %, the apron band none); coursed bricks darker and lower than the render; the phone print alike`);
