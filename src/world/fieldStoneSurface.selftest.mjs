// fieldStoneSurface.selftest — the dry-stone field walls' print (the scenery lane, 2026-10-03). The walls' face stones
// are geometry, each carrying a window of the print; gauntlet wave 34 read a printed rubble on them as "stamped
// flagstone with dark outlines", so the print is one stone's skin over its face band and the hearting's packing stones
// over a band the core maps:
//   1. seamless along the wall, every row (the face windows and the core both wrap in u);
//   2. a stone's skin, no stones in it: the face band has no joint, no void and no dark line (its darkest texels well
//      above a void's, no run of dark texels along or up it);
//   3. each window its own stone: windows a face stone's size differ in tone from one another, and a window's own tone
//      drifts far less across it than the windows differ;
//   4. the hearting band is the core between the stones: packing stones in dark voids, well darker than the face;
//   5. the stone print's palette: the face band's mean colour within 4 % of the props stone print's (that painter
//      executed from props.ts), so a map's stone tone and masonry tint keep giving its walls their colour;
//   6. the lift (wave 34, Verdant's black wall): a tone darker than the floor is lifted to it in linear light, hue and
//      contrast kept; a lighter print is left alone;
//   7. the phone print (256 px) is the same skin: its band means and void share agree with the desktop print's;
//   8. deterministic for a seed, sixteen rows a slice.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { FIELD_STONE_FACE_V, FIELD_STONE_HEARTING_V, liftFieldStoneMean, paintFieldStoneBuffers } from './fieldStoneSurface.ts';

function drain(generator) {
  let slices = 0, step = generator.next();
  while (!step.done) { slices++; assert.equal(step.value.fine, true); step = generator.next(); }
  return { ...step.value, slices };
}
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const luma = (px, i) => px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114;
function meanLinear(px, size, v0 = 0, v1 = 1) {
  const m = [0, 0, 0];
  let n = 0;
  for (let y = Math.ceil(v0 * size); y < Math.floor(v1 * size); y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) m[c] += lin(px[i + c] / 255);
    n++;
  }
  return m.map((v) => v / n);
}

const print = drain(paintFieldStoneBuffers(512));
const { size, px, hgt, joint } = print;
assert.equal(size, 512);
assert.equal(print.slices, 512 / 16, 'sixteen rows a slice');
const [F0, F1] = FIELD_STONE_FACE_V, [H0, H1] = FIELD_STONE_HEARTING_V;
assert.ok(F0 >= 0 && F1 < H0 && H1 <= 1, 'the face windows and the hearting band do not overlap');

// 8. deterministic
assert.deepEqual(drain(paintFieldStoneBuffers(512)).px, px, 'the same seed paints the same print');
assert.notDeepEqual(drain(paintFieldStoneBuffers(512, 0x5eed)).px, px, 'another seed paints another skin');

// 1. seamless along the wall: the wrap column's step sits inside the distribution of the print's own column steps
const steps = new Float64Array(size);
for (let b = 0; b < size; b++) {
  let sum = 0;
  for (let t = 0; t < size; t++) sum += Math.abs(luma(px, t * size + ((b + 1) % size)) - luma(px, t * size + b));
  steps[b] = sum / size;
}
const wrap = steps[size - 1], inner = [...steps.slice(0, size - 1)].sort((a, b) => a - b);
assert.ok(wrap <= inner[Math.floor(inner.length * 0.98)], `the print tiles along the wall (wrap step ${wrap.toFixed(2)})`);

// 2. a stone's skin: no joint, no void, no dark line in the face band
const faceRows = [Math.ceil(F0 * size), Math.floor(F1 * size)];
const faceL = [];
for (let y = faceRows[0]; y < faceRows[1]; y++) for (let x = 0; x < size; x++) faceL.push(luma(px, y * size + x));
const sorted = Float64Array.from(faceL).sort();
const median = sorted[sorted.length >> 1], darkest = sorted[Math.floor(sorted.length * 0.01)];
assert.ok(darkest > median * 0.55, `the face band holds no void: its darkest hundredth ${darkest.toFixed(1)} vs its median ${median.toFixed(1)}`);
let faceJoints = 0;
for (let y = faceRows[0]; y < faceRows[1]; y++) for (let x = 0; x < size; x++) faceJoints += joint[y * size + x];
assert.equal(faceJoints, 0, 'no joint in the face band');
function longestDark(along) {
  let best = 0;
  const limit = median * 0.72;
  for (let a = along ? faceRows[0] : 0; a < (along ? faceRows[1] : size); a++) {
    let run = 0;
    for (let t = along ? 0 : faceRows[0]; t < (along ? size : faceRows[1]); t++) {
      run = luma(px, along ? a * size + t : t * size + a) < limit ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }
  return best;
}
const darkAlong = longestDark(true), darkUp = longestDark(false);
assert.ok(darkAlong < 24 && darkUp < 24, `no dark line runs across the skin (longest ${Math.max(darkAlong, darkUp)} texels)`);

// 3. each window its own stone: a face stone's window (about 0.36 x 0.18 of a tile), 300 of them in the face band
function windowMean(u0, v0, w, h) {
  let s = 0, n = 0;
  for (let y = Math.floor(v0 * size); y < Math.floor((v0 + h) * size); y += 2) for (let x = Math.floor(u0 * size); x < Math.floor((u0 + w) * size); x += 2) {
    s += luma(px, y * size + (x % size)); n++;
  }
  return s / n;
}
let seed = 0x51ab;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const means = [], drifts = [];
for (let k = 0; k < 300; k++) {
  const w = 0.36, h = 0.18, u0 = rand(), v0 = F0 + rand() * (F1 - F0 - h);
  means.push(windowMean(u0, v0, w, h));
  const halves = [windowMean(u0, v0, w / 2, h), windowMean(u0 + w / 2, v0, w / 2, h)];
  drifts.push(Math.abs(halves[0] - halves[1]));
}
const mean = means.reduce((a, b) => a + b, 0) / means.length;
const spread = Math.sqrt(means.reduce((a, b) => a + (b - mean) ** 2, 0) / means.length) / mean;
const drift = drifts.reduce((a, b) => a + b, 0) / drifts.length / mean;
assert.ok(spread > 0.05, `the windows differ in tone from stone to stone (${(spread * 100).toFixed(1)} %)`);
assert.ok(drift < spread * 1.2, `a window's own tone drifts less than the stones differ (${(drift * 100).toFixed(1)} % vs ${(spread * 100).toFixed(1)} %)`);

// 4. the hearting band: packing stones in dark voids
const hRows = [Math.ceil(H0 * size), Math.floor(H1 * size)];
let voids = 0, n = 0, voidL = 0, stoneL = 0, nv = 0, ns = 0, heartL = 0;
for (let y = hRows[0]; y < hRows[1]; y++) for (let x = 0; x < size; x++) {
  const i = y * size + x, l = luma(px, i);
  heartL += l; n++;
  if (joint[i]) { voids++; voidL += l; nv++; } else { stoneL += l; ns++; }
}
const voidShare = voids / n;
heartL /= n; voidL /= nv; stoneL /= ns;
assert.ok(voidShare > 0.2 && voidShare < 0.65, `the core's voids take a fifth to two thirds of it (${voidShare.toFixed(2)})`);
assert.ok(voidL < stoneL * 0.6, `its voids are darker than its packing stones (${voidL.toFixed(1)} vs ${stoneL.toFixed(1)})`);
assert.ok(heartL < median * 0.5, `the core between the stones reads dark (${heartL.toFixed(1)} vs the skin's ${median.toFixed(1)})`);
let voidH = 0, stoneH = 0;
for (let y = hRows[0]; y < hRows[1]; y++) for (let x = 0; x < size; x++) { const i = y * size + x; if (joint[i]) voidH += hgt[i]; else stoneH += hgt[i]; }
assert.ok(voidH / nv < stoneH / ns - 0.15, 'its voids lie low in the relief');

// 5. the stone print's palette, executed from props.ts
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const from = source.indexOf('function buildStoneCourseEdges('), to = source.indexOf('function* makeStone(', from);
assert.ok(from > 0 && to > from, 'the props stone print is executed from its production source');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (lo, hi, v) => { const t = clamp((v - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
const stonePrint = new Function('THREE', 'clamp', 'smoothstep', `${stripTypeScriptTypes(source.slice(from, to))}
  return { buildStoneCourseEdges, buildStoneColumnEdges, paintStoneRow };`)(THREE, clamp, smoothstep);
function mulberry32(s) {
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const stonePx = new Uint8ClampedArray(size * size * 4), stoneHgt = new Float32Array(size * size);
const srng = mulberry32(0x51a7), noise = new SimplexNoise({ random: mulberry32(7) });
const rows = stonePrint.buildStoneCourseEdges(size, srng);
const columns = stonePrint.buildStoneColumnEdges(size, rows.length - 1, srng);
const colour = new THREE.Color();
for (let y = 0; y < size; y++) stonePrint.paintStoneRow(noise, stonePx, stoneHgt, size, y, rows, columns, colour);
const faceMean = meanLinear(px, size, F0, F1), stoneMean = meanLinear(stonePx, size);
for (let c = 0; c < 3; c++) {
  assert.ok(Math.abs(faceMean[c] / stoneMean[c] - 1) < 0.04,
    `channel ${c}: the skin's mean ${faceMean[c].toFixed(4)} within 4 % of the stone print's ${stoneMean[c].toFixed(4)}`);
}

// 6. the lift: Verdant's dark stone tone (its lightness x0.76) lifted to the floor; the untoned print left alone
{
  const dark = new Uint8ClampedArray(px), colourT = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
  for (let i = 0; i < dark.length; i += 4) {
    colourT.setRGB(dark[i] / 255, dark[i + 1] / 255, dark[i + 2] / 255).getHSL(hsl);
    colourT.setHSL(0.075, Math.min(1, hsl.s * 1.3 + 0.02), hsl.l * 0.76);
    dark[i] = colourT.r * 255; dark[i + 1] = colourT.g * 255; dark[i + 2] = colourT.b * 255;
  }
  const before = meanLinear(dark, size, 0, 0.86);
  const k = liftFieldStoneMean(dark, size);
  const after = meanLinear(dark, size, 0, 0.86);
  const lum = (m) => 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
  assert.ok(k > 1.2, `a dark tone is lifted (x${k.toFixed(2)} in linear light)`);
  assert.ok(Math.abs(lum(after) - lin(0.36)) / lin(0.36) < 0.03, `to the floor (${lum(after).toFixed(4)} vs ${lin(0.36).toFixed(4)})`);
  assert.ok(Math.abs(after[0] / after[1] - before[0] / before[1]) < 0.03, 'its hue kept');
  const light = new Uint8ClampedArray(px);
  assert.equal(liftFieldStoneMean(light, size, 0.2), 1, 'a print lighter than the floor is left as it is');
  assert.deepEqual(light, px);
}

// 7. the phone print
const phone = drain(paintFieldStoneBuffers(256));
assert.equal(phone.slices, 256 / 16);
const phoneFace = meanLinear(phone.px, 256, F0, F1), phoneHeart = meanLinear(phone.px, 256, H0, H1), heart = meanLinear(px, size, H0, H1);
let phoneVoids = 0, pn = 0;
for (let y = Math.ceil(H0 * 256); y < Math.floor(H1 * 256); y++) for (let x = 0; x < 256; x++) { phoneVoids += phone.joint[y * 256 + x]; pn++; }
for (let c = 0; c < 3; c++) {
  assert.ok(Math.abs(phoneFace[c] / faceMean[c] - 1) < 0.02, `channel ${c}: the phone print keeps the skin's mean colour`);
  assert.ok(Math.abs(phoneHeart[c] / heart[c] - 1) < 0.08, `channel ${c}: the phone print keeps the core's`);
}
assert.ok(Math.abs(phoneVoids / pn - voidShare) < 0.05, `the phone print keeps the core's voids (${(phoneVoids / pn).toFixed(2)} vs ${voidShare.toFixed(2)})`);

console.log(`fieldStoneSurface self-test passed: a seamless stone skin (no void, darkest hundredth ${(darkest / median * 100).toFixed(0)} % of its median, longest dark run ${Math.max(darkAlong, darkUp)} texels), windows differing ${(spread * 100).toFixed(1)} % stone to stone and drifting ${(drift * 100).toFixed(1)} % across one, a dark core (voids ${(voidShare * 100).toFixed(0)} %), mean colour ${faceMean.map((v, c) => (v / stoneMean[c]).toFixed(3)).join('/')} of the stone print's, the lift, the phone print alike`);
