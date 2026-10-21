// thermalLensBloom.selftest.mjs — (item fx-ir-lens-bloom-229, the coordinator: "several white-hot live hulls in the IR/thermal
// lens lift the whole frame's ground level", median ~35 -> 61 on the airfield at night) a heat-imaging grade (uThermal 1
// infrared, 2 thermal) turns each pixel's display level into its cool grey, and the night exposure lifts what the bloom's
// wide mips lay round every white-hot hull. Under a heat lens the bloom keeps THERMAL_BLOOM_K of its strength on its
// tightest mips (radius 0) — at night, and (fx-ir-day-heat-229, the coordinator: "the map must read") by day too, where the
// day bloom washed a close hull's heat map white; in the daylight lens, the intensifier and every other camera it is untouched.
// Read on three's own UnrealBloomPass chain (its kernel sizes, mip factors and radius blend), emulated on four white-hot
// hulls: the ground 60-240 px off them loses most of its lift, the hull keeps a rim of glow.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heatLensBloomCut, THERMAL_BLOOM_K } from './post.ts';

// ---- the gate: a heat-imaging code, at every hour ----
for (const code of [0, 3]) for (const night of [0, 0.5, 1]) for (const day of [0, 1]) {
  assert.equal(heatLensBloomCut(code, night, day), 0, `lens ${code} at night ${night}: untouched (the daylight lens, the intensifier)`);
}
for (const code of [1, 2]) {
  for (const night of [0, 0.5, 1]) assert.equal(heatLensBloomCut(code, night), 1, `heat lens ${code} at night ${night}: the full cut, by day too`);
  // the QA hook's THERMAL_BLOOM_DAY 0: the 229 bloom item's night-only cut
  assert.equal(heatLensBloomCut(code, 0, 0), 0, 'night-only: none by day');
  assert.equal(heatLensBloomCut(code, 0.5, 0), 0.5, 'half at dusk');
  assert.equal(heatLensBloomCut(code, 1.4, 0), 1, 'full at night, clamped');
}
assert.ok(THERMAL_BLOOM_K > 0 && THERMAL_BLOOM_K < 0.5, 'the heat lens keeps a glow, well under the default');

// ---- the wiring: the frame's own lens and night level, exactly the old strength and radius when the cut is 0 ----
const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
assert.match(post, /const heatCut = heatLensBloomCut\(grade\.uniforms\.uThermal\.value, \(scene\.userData\.lightModel as LightModel \| undefined\)\?\.night \?\? 0,\s*lightTune\('THERMAL_BLOOM_DAY', 1\)\) \* lightTune\('THERMAL_BLOOM_CUT', 1\);\s*bloom\.strength = lightTune\('BLOOM_STRENGTH', BLOOM_STRENGTH\) \* \(1 - 0\.5 \* scopeWeight\) \* \(1 - \(1 - THERMAL_BLOOM_K\) \* heatCut\);\s*bloom\.threshold = lightTune\('BLOOM_THRESHOLD', BLOOM_THRESHOLD\);\s*bloom\.radius = lightTune\('BLOOM_RADIUS', BLOOM_RADIUS\) \* \(1 - heatCut\);/,
  'the bloom reads the cut from this frame\'s lens and night level (the QA hook THERMAL_BLOOM_CUT, 1 unless a QA run sets it)');
const frame = post.slice(post.indexOf('  function renderFrame('));
assert.ok(frame.indexOf('grade.uniforms.uThermal.value =') < frame.indexOf('updateScopeGrade();'), 'the lens code is set before the bloom reads it');
const STRENGTH = Number(post.match(/^const BLOOM_STRENGTH = ([0-9.]+);/m)[1]), RADIUS = Number(post.match(/^const BLOOM_RADIUS = ([0-9.]+);/m)[1]);

// ---- three's chain: five mips from half resolution, each blurring the last (sigma = kernel / 3 at its resolution) ----
const unreal = readFileSync(new URL('../../node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js', import.meta.url), 'utf8');
const kernels = JSON.parse(unreal.match(/const kernelSizeArray = (\[[^\]]+\]);/)[1].replace(/\s/g, ''));
const factors = JSON.parse(unreal.match(/const bloomFactors = (\[[^\]]+\]);/)[1].replace(/\s/g, ''));
assert.match(unreal, /mix\( factor, mirrorFactor, bloomRadius \)/, 'the composite blends each mip factor toward its mirror by the radius');
assert.match(unreal, /float mirrorFactor = 1\.2 - factor;/);
assert.match(unreal, /const sigma = kernelRadius \/ 3;/);
const weights = (strength, radius) => factors.map((f) => strength * (f + (1.2 - f - f) * radius));
let acc = 0;
const sigmaFull = kernels.map((k, i) => { const s = (k / 3) * 2 ** (i + 1); acc += s * s; return Math.sqrt(acc); });

// ---- four white-hot hulls (48 x 80 px, the clamped high-pass 2.6) on a 1280 x 720 lens, emulated at 1/4 resolution ----
const W = 320, H = 180, Q = 4;
const input = new Float64Array(W * H), hull = new Uint8Array(W * H);
for (const [x0, y0] of [[60, 40], [150, 110], [230, 50], [270, 130]]) {
  for (let y = y0; y < y0 + 20; y++) for (let x = x0; x < x0 + 12; x++) { input[y * W + x] = 2.6; hull[y * W + x] = 1; }
}
function blur(src, sigma) {
  const r = Math.ceil(3 * sigma), k = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-0.5 * i * i / (sigma * sigma)); k.push(v); sum += v; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float64Array(W * H), out = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0; for (let i = -r; i <= r; i++) { const xx = x + i; if (xx >= 0 && xx < W) v += src[y * W + xx] * k[i + r]; } tmp[y * W + x] = v;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0; for (let i = -r; i <= r; i++) { const yy = y + i; if (yy >= 0 && yy < H) v += tmp[yy * W + x] * k[i + r]; } out[y * W + x] = v;
  }
  return out;
}
const mips = sigmaFull.map((s) => blur(input, s / Q));
// the distance (in full-resolution px) from each cell to the nearest hull cell
const dist = new Float64Array(W * H).fill(1e9);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (hull[y * W + x]) { dist[y * W + x] = 0; continue; }
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (hull[y * W + x]) continue;
  let best = 1e9;
  for (const [x0, y0] of [[60, 40], [150, 110], [230, 50], [270, 130]]) {
    const dx = Math.max(x0 - x, 0, x - (x0 + 11)), dy = Math.max(y0 - y, 0, y - (y0 + 19));
    best = Math.min(best, Math.hypot(dx, dy) * Q);
  }
  dist[y * W + x] = best;
}
function band(strength, radius, lo, hi) {
  const w = weights(strength, radius), vals = [];
  for (let i = 0; i < W * H; i++) {
    if (hull[i] || dist[i] < lo || dist[i] >= hi) continue;
    let v = 0; for (let m = 0; m < mips.length; m++) v += w[m] * mips[m][i];
    vals.push(v);
  }
  vals.sort((a, b) => a - b);
  return vals[vals.length >> 1];
}
// the eye lenses (the daylight lens, the intensifier) and every other camera: the very same strength and radius, at any hour
const eye = { s: STRENGTH, r: RADIUS };
for (const night of [0, 1]) {
  assert.equal(STRENGTH * (1 - (1 - THERMAL_BLOOM_K) * heatLensBloomCut(0, night)), STRENGTH);
  assert.equal(RADIUS * (1 - heatLensBloomCut(3, night)), RADIUS);
}
// the heat lens, by day and at night alike
const cutDay = heatLensBloomCut(1, 0), cutNight = heatLensBloomCut(1, 1);
assert.equal(cutDay, cutNight, 'the heat lens cuts the bloom by day as at night');
const heat = { s: STRENGTH * (1 - (1 - THERMAL_BLOOM_K) * cutDay), r: RADIUS * (1 - cutDay) };
const rows = [];
for (const [lo, hi] of [[4, 24], [24, 60], [60, 120], [120, 240]]) {
  const a = band(eye.s, eye.r, lo, hi), b = band(heat.s, heat.r, lo, hi);
  rows.push({ lo, hi, a, b, k: a / b });
}
const [rim, near, mid, far] = rows;
assert.ok(rim.b >= 0.2 * rim.a, `the hull keeps a rim of glow (4-24 px: ${(rim.b / rim.a * 100).toFixed(0)} % of the eye lens's)`);
assert.ok(mid.k >= 4 && far.k >= 5, `the ground 60-240 px off the hulls loses its lift (${mid.k.toFixed(1)}x, ${far.k.toFixed(1)}x less)`);
assert.ok(near.k >= 3, `and 24-60 px (${near.k.toFixed(1)}x less)`);
// (fx-ir-day-heat-229) on the hull itself: the bloom a close hull lays over its own heat map (by day it lifted the map's cool
// parts over the grade's white) falls to under a third
function onHull(strength, radius) {
  const w = weights(strength, radius), vals = [];
  for (let i = 0; i < W * H; i++) { if (!hull[i]) continue; let v = 0; for (let m = 0; m < mips.length; m++) v += w[m] * mips[m][i]; vals.push(v); }
  vals.sort((x, y) => x - y);
  return vals[vals.length >> 1];
}
const selfEye = onHull(eye.s, eye.r), selfHeat = onHull(heat.s, heat.r);
assert.ok(selfHeat <= selfEye / 3, `a hull's own bloom ${selfEye.toFixed(2)} -> ${selfHeat.toFixed(2)} under the heat lens`);
console.log(`thermalLensBloom: a heat lens (day and night) keeps ${THERMAL_BLOOM_K} of the bloom on its tight mips — four white-hot hulls lift the ground `
  + rows.map((r) => `${r.lo}-${r.hi} px ${r.k.toFixed(1)}x less`).join(', ') + `; a hull's own bloom ${selfEye.toFixed(2)} -> ${selfHeat.toFixed(2)}, its rim kept at ${(rim.b / rim.a * 100).toFixed(0)} %; the eye lenses untouched`);
