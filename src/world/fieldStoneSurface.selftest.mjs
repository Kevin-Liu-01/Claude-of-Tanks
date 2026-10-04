// fieldStoneSurface.selftest — the dry-stone field walls' rubble print (the scenery lane, 2026-10-03; gauntlet wave 20
// read the walls' coursed stone print as "block walls laid out like a grid", and a regional kit's brick laid brick
// courses over fieldstone):
//   1. seamless: no step at the tile edge beyond the print's own texel-to-texel variation, across and up;
//   2. rubble, not ashlar: no joint runs a third of the tile along or up (the stone print's mortar runs the whole tile),
//      the joints take a twentieth to a fifth of the face, and the stones lie flat (their runs longer along than up);
//   3. dry joints: darker than the stones and low in the relief;
//   4. the stone print's palette: the mean colour within 4 % of the props stone print's (that painter executed from
//      props.ts), so a map's stone tone and masonry tint keep giving its walls their colour;
//   5. the phone print (256 px) is the same stones: its mean colour and joint share agree with the desktop print's;
//   6. deterministic for a seed, sixteen rows a slice.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { paintFieldStoneBuffers } from './fieldStoneSurface.ts';

function drain(generator) {
  let slices = 0, step = generator.next();
  while (!step.done) { slices++; assert.equal(step.value.fine, true); step = generator.next(); }
  return { ...step.value, slices };
}
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function meanLinear(px) {
  const m = [0, 0, 0];
  for (let i = 0; i < px.length; i += 4) for (let c = 0; c < 3; c++) m[c] += lin(px[i + c] / 255);
  return m.map((v) => v / (px.length / 4));
}
const luma = (px, i) => px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114;

const print = drain(paintFieldStoneBuffers(512));
const { size, px, hgt, joint } = print;
assert.equal(size, 512);
assert.equal(print.slices, 512 / 16, 'sixteen rows a slice');

// 6. deterministic
const again = drain(paintFieldStoneBuffers(512));
assert.deepEqual(again.px, px, 'the same seed paints the same print');
assert.notDeepEqual(drain(paintFieldStoneBuffers(512, 0x5eed)).px, px, 'another seed paints other stones');

// 1. seamless: the wrap boundary sits inside the distribution of the print's own column and row boundaries
function boundarySteps(across) {
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
  return steps;
}
for (const across of [true, false]) {
  const steps = boundarySteps(across);
  const wrap = steps[size - 1], inner = [...steps.slice(0, size - 1)].sort((a, b) => a - b);
  assert.ok(wrap <= inner[Math.floor(inner.length * 0.98)],
    `the print tiles ${across ? 'along' : 'up'} the wall (wrap step ${wrap.toFixed(2)} vs the 98th inner ${inner[Math.floor(inner.length * 0.98)].toFixed(2)})`);
}

// 2. rubble, not ashlar
function longestJointRun(J, along) {
  let best = 0;
  for (let a = 0; a < size; a++) {
    let run = 0;
    for (let t = 0; t < 2 * size; t++) {
      const k = t % size, v = along ? J[a * size + k] : J[k * size + a];
      run = v ? run + 1 : 0;
      if (run > best) best = run;
    }
  }
  return Math.min(best, size) / size;
}
let jointShare = 0;
for (const j of joint) jointShare += j;
jointShare /= joint.length;
assert.ok(jointShare > 0.05 && jointShare < 0.2, `the dry joints take a twentieth to a fifth of the face (${jointShare.toFixed(3)})`);
const runAlong = longestJointRun(joint, true), runUp = longestJointRun(joint, false);
assert.ok(runAlong < 1 / 3 && runUp < 1 / 3, `no joint runs a third of the tile (along ${runAlong.toFixed(3)}, up ${runUp.toFixed(3)})`);
function meanStoneRun(along) {
  let runs = 0, total = 0;
  for (let a = 0; a < size; a++) {
    let run = 0;
    for (let k = 0; k < size; k++) {
      const v = along ? joint[a * size + k] : joint[k * size + a];
      if (!v) run++;
      else if (run) { runs++; total += run; run = 0; }
    }
  }
  return total / Math.max(1, runs);
}
const flat = meanStoneRun(true) / meanStoneRun(false);
assert.ok(flat > 1.3, `the stones lie flat: their runs along the wall ${flat.toFixed(2)} times their runs up it`);

// the props stone print, executed from props.ts: its coursed mortar runs the whole tile (what this print replaces)
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const from = source.indexOf('function buildStoneCourseEdges('), to = source.indexOf('function* makeStone(', from);
assert.ok(from > 0 && to > from, 'the props stone print is executed from its production source');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (lo, hi, v) => { const t = clamp((v - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
const stonePrint = new Function('THREE', 'clamp', 'smoothstep', `${stripTypeScriptTypes(source.slice(from, to))}
  return { buildStoneCourseEdges, buildStoneColumnEdges, paintStoneRow };`)(THREE, clamp, smoothstep);
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
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
const mortar = Uint8Array.from(stoneHgt, (h) => (h < 0.13 ? 1 : 0));
assert.ok(longestJointRun(mortar, true) > 0.99, 'the stone print\'s mortar courses run the whole tile (the ashlar read)');

// 3. dry joints
let jointLuma = 0, stoneLuma = 0, jointH = 0, stoneH = 0, nJ = 0, nS = 0;
for (let i = 0; i < joint.length; i++) {
  if (joint[i]) { jointLuma += luma(px, i); jointH += hgt[i]; nJ++; } else { stoneLuma += luma(px, i); stoneH += hgt[i]; nS++; }
}
jointLuma /= nJ; stoneLuma /= nS; jointH /= nJ; stoneH /= nS;
assert.ok(jointLuma < stoneLuma * 0.6, `the joints are voids: well darker than the stones (${jointLuma.toFixed(1)} vs ${stoneLuma.toFixed(1)})`);
assert.ok(jointH < 0.12 && stoneH > 0.35, `the joints lie low in the relief (${jointH.toFixed(2)} vs ${stoneH.toFixed(2)})`);

// 4. the stone print's palette
const mean = meanLinear(px), stoneMean = meanLinear(stonePx);
for (let c = 0; c < 3; c++) {
  assert.ok(Math.abs(mean[c] / stoneMean[c] - 1) < 0.04,
    `channel ${c}: the field print's mean ${mean[c].toFixed(4)} within 4 % of the stone print's ${stoneMean[c].toFixed(4)}`);
}

// 5. the phone print
const phone = drain(paintFieldStoneBuffers(256));
assert.equal(phone.slices, 256 / 16);
const phoneMean = meanLinear(phone.px);
let phoneJoints = 0;
for (const j of phone.joint) phoneJoints += j;
phoneJoints /= phone.joint.length;
for (let c = 0; c < 3; c++) assert.ok(Math.abs(phoneMean[c] / mean[c] - 1) < 0.02, `channel ${c}: the phone print keeps the mean colour`);
assert.ok(Math.abs(phoneJoints - jointShare) < 0.03, `the phone print keeps the joint share (${phoneJoints.toFixed(3)} vs ${jointShare.toFixed(3)})`);

console.log(`fieldStoneSurface self-test passed: seamless rubble (joints ${(jointShare * 100).toFixed(1)} %, longest run ${(Math.max(runAlong, runUp) * 100).toFixed(1)} % of the tile, stones ${flat.toFixed(2)}x flat), dry joints, mean colour ${mean.map((v, c) => (v / stoneMean[c]).toFixed(3)).join('/')} of the stone print's, the phone print alike`);
