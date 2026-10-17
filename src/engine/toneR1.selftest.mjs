// toneR1.selftest.mjs — tone r1 (2026-10-15, the SKY lane; post.ts TONE_R1): the output grade's day chain ported to the CPU
// (linear saturation, the photographic toe and log contrast round the card, the luminance shoulder, three's AgX with the
// encoded-space look, sRGB, black point, display saturation), run at TONE_R0 (the 2026-10-01 look) and TONE_R1 as post.ts
// declares them. Tone r1 must give back local contrast and colour (grass, camo) while the card, a white wall and the sky
// hold their levels and nothing clips.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
// The output grade chain of src/engine/post.ts in JS (the day path on the grounded rig): linear saturation, the photographic
// toe and log contrast round the card, the luminance shoulder, three's AgX with tone r1's encoded-space look, sRGB, black
// point, display saturation. Input: post-exposure linear sRGB. Output: display sRGB 0..1.
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const mat = (m, c) => [m[0][0] * c[0] + m[1][0] * c[1] + m[2][0] * c[2], m[0][1] * c[0] + m[1][1] * c[1] + m[2][1] * c[2], m[0][2] * c[0] + m[1][2] * c[1] + m[2][2] * c[2]];
// GLSL mat3( col0, col1, col2 ): m[col][row]
const SRGB_TO_2020 = [[0.6274, 0.0691, 0.0164], [0.3293, 0.9195, 0.0880], [0.0433, 0.0113, 0.8956]];
const R2020_TO_SRGB = [[1.6605, -0.1246, -0.0182], [-0.5876, 1.1329, -0.1006], [-0.0728, -0.0083, 1.1187]];
const INSET = [[0.856627153315983, 0.137318972929847, 0.11189821299995], [0.0951212405381588, 0.761241990602591, 0.0767994186031903], [0.0482516061458583, 0.101439036467562, 0.811302368396859]];
const OUTSET = [[1.1271005818144368, -0.1413297634984383, -0.14132976349843826], [-0.11060664309660323, 1.157823702216272, -0.11060664309660294], [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405]];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const contrastApprox = (x) => { const x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; };
function agx(c, look) {
  c = mat(INSET, mat(SRGB_TO_2020, c)).map((v) => Math.max(v, 1e-10));
  c = c.map((v) => Math.min(1, Math.max(0, (Math.log2(v) + 12.47393) / (4.026069 + 12.47393)))).map(contrastApprox);
  const L = luma(c), k = look[0] + (1 - look[0]) * sstep(look[1], 1, L);
  c = c.map((v) => Math.max(L + (v - L) * k, 0));
  c = mat(OUTSET, c).map((v) => Math.pow(Math.max(0, v), 2.2));
  return mat(R2020_TO_SRGB, c).map((v) => Math.min(1, Math.max(0, v)));
}
const oetf = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
function grade(rgb, t) {
  const sceneLuma = luma(rgb);
  let c = rgb.map((v) => Math.max(sceneLuma + (v - sceneLuma) * t.satLinear, 0));
  const [toeX, toeY, toeZ, toeW] = t.toe;
  const u = c.map((v) => Math.log2(Math.max(v, 1e-6) / 0.18));
  const uC = u.map((v) => Math.min(v, 0));
  const uL = Math.min(Math.log2(Math.max(sceneLuma, 1e-6) / 0.18), 0);
  const T = uC.map((v) => Math.min(1, Math.max(0, v / toeY + 1)));
  const TL = Math.min(1, Math.max(0, uL / toeY + 1));
  const liftC = T.map((x, i) => toeY * (x * x * x * (1 - 0.5 * x) - 0.5) - uC[i]);
  const liftL = toeY * (TL * TL * TL * (1 - 0.5 * TL) - 0.5) - uL;
  const hand = sstep(toeZ, toeW, -uL);
  c = u.map((v, i) => 0.18 * Math.pow(2, t.contrast * v + (t.contrast - toeX) * (liftL + (liftC[i] - liftL) * hand)));
  const [shS, shStops, shStart] = t.shoulder;
  if (shStops > 0) {
    const x = Math.max((Math.log2(Math.max(sceneLuma, 1e-6) / 0.18) - shStart) / shStops, 0);
    const g = x < 1 ? x * x * x * (1 - 0.5 * x) : x - 0.5;
    c = c.map((v) => v * Math.pow(2, -(t.contrast - shS) * shStops * g));
  }
  c = agx(c, t.look).map(oetf);
  c = c.map((v) => Math.max(v - t.bp, 0) / (1 - t.bp));
  const L = luma(c);
  return c.map((v) => Math.min(1, Math.max(0, L + (v - L) * t.sat)));
}

const src = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
const num = (re) => { const m = src.match(re); assert.ok(m, `post.ts: ${re}`); return Number(m[1]); };
const block = (name) => { const m = src.match(new RegExp(`const ${name}: ToneLook = Object\\.freeze\\(\\{([\\s\\S]*?)\\}\\);`)); assert.ok(m, name); return m[1]; };
const field = (b, k, fallback) => { const m = b.match(new RegExp(`${k}: ([A-Z_]+|[0-9.]+)`)); assert.ok(m, k); return /^[A-Z_]+$/.test(m[1]) ? fallback[m[1]] : Number(m[1]); };
const K = { GRADE_CONTRAST: num(/const GRADE_CONTRAST = ([0-9.]+);/), GRADE_TOE_SLOPE: num(/const GRADE_TOE_SLOPE = ([0-9.]+);/), GRADE_TOE_STOPS: num(/const GRADE_TOE_STOPS = ([0-9.]+);/) };
const base = { satLinear: num(/const GRADE_SAT_LINEAR = ([0-9.]+);/), bp: num(/const GRADE_BLACK_POINT = ([0-9.]+);/), sat: num(/const GRADE_SATURATION = ([0-9.]+);/),
  toeZ: num(/const GRADE_TOE_CHANNEL_FROM = ([0-9.]+);/), toeW: num(/const GRADE_TOE_CHANNEL_TO = ([0-9.]+);/) };
const look = (name) => { const b = block(name); return { satLinear: base.satLinear, bp: base.bp, sat: base.sat, contrast: field(b, 'contrast', K),
  toe: [field(b, 'toeSlope', K), field(b, 'toeStops', K), base.toeZ, base.toeW], shoulder: [field(b, 'shoulderSlope', K), field(b, 'shoulderStops', K), field(b, 'shoulderStart', K)],
  look: [field(b, 'lookSat', K), field(b, 'lookSatWhite', K)] }; };
const R0 = look('TONE_R0'), R1 = look('TONE_R1');
assert.equal(R0.contrast, 1.28); assert.equal(R0.shoulder[1], 0, 'r0: no shoulder'); assert.equal(R0.look[0], 1, 'r0: no look');
const hsvSat = (c) => { const mx = Math.max(...c), mn = Math.min(...c); return mx > 0 ? (mx - mn) / mx : 0; };
const dl = (c) => 255 * luma(c);
const at = (rgb, t) => { const o = grade(rgb, t), o2 = grade(rgb.map((v) => v * 1.25), t); return { L: dl(o), s: hsvSat(o), dL: dl(o2) - dl(o), max: 255 * Math.max(...o) }; };
// post-exposure linear samples (the card at 0.18)
const S = { card: [0.18, 0.18, 0.18], grassSun: [0.10, 0.28, 0.05], grassShade: [0.02, 0.056, 0.01], camoGreen: [0.12, 0.16, 0.08], camoTan: [0.35, 0.28, 0.18],
  whiteWall: [0.886, 0.886, 0.86], skyBlue: [0.45, 0.70, 1.20], deepShade: [0.012, 0.012, 0.012] };
const r0 = {}, r1 = {};
for (const [k, v] of Object.entries(S)) { r0[k] = at(v, R0); r1[k] = at(v, R1); }
// the 2026-10-01 chain as measured: about 13 display levels per +25 % radiance at the card (13.2 in the GROUND audit)
assert.ok(Math.abs(r0.card.dL - 13.4) < 0.6, `the port reproduces main's local contrast at the card (${r0.card.dL.toFixed(1)})`);
assert.ok(Math.abs(r1.card.L - r0.card.L) <= 0.05 * r0.card.L, 'the card holds its level');
assert.ok(r1.card.dL >= 1.1 * r0.card.dL, 'local contrast at the card up 10 % or more');
assert.ok(r1.grassSun.dL >= 1.15 * r0.grassSun.dL, 'on sunlit grass up 15 % or more');
assert.ok(r1.grassSun.s >= r0.grassSun.s + 0.15, 'a sunlit green regains colour');
assert.ok(r1.camoGreen.s >= r0.camoGreen.s + 0.1 && r1.camoTan.s >= r0.camoTan.s + 0.05, 'camo regains colour');
assert.ok(r1.whiteWall.L <= r0.whiteWall.L + 0.5, 'a sunlit white wall no brighter (MAPS\' church already blooms)');
assert.ok(r1.whiteWall.dL >= 3, 'and keeps its detail');
assert.ok(r1.skyBlue.max < 250 && r1.skyBlue.L <= r0.skyBlue.L + 4, 'the sky clips no channel and holds its level');
assert.ok(r1.deepShade.L >= r0.deepShade.L - 4 && r1.grassShade.L >= r0.grassShade.L - 4, 'the shade lands where the toe put it');
// the shader: the look inside AgX after its sigmoid, the lever, every knob still live
for (const term of ["vec3 cotAgXToneMapping( vec3 color ) {", 'outputColor.rgb = cotAgXToneMapping( outputColor.rgb );', 'uniform vec2 uLook;',
  "const r1 = lightTune('TONE_R1', 1) > 0 ? TONE_R1 : TONE_R0;", 'const tone = toneFor(model?.night ?? 0);',
  'for (const k of Object.keys(TONE_R0) as (keyof ToneLook)[]) out[k] = r1[k] + (TONE_R0[k] - r1[k]) * n;', "lightTune('TONE_LOOK_SAT', tone.lookSat)", "lightTune('GRADE_TOE_SLOPE', tone.toeSlope)",
  "lightTune('GRADE_SHOULDER_STOPS', shoulderTone.shoulderStops)"]) assert.ok(src.includes(term), term);
assert.ok(THREE.ShaderChunk.tonemapping_pars_fragment.includes('color = agxDefaultContrastApprox( color );'), 'three\'s AgX sigmoid anchor');
const row = (k) => `${k} ${r0[k].L.toFixed(0)}/${r0[k].s.toFixed(2)}/${r0[k].dL.toFixed(1)} -> ${r1[k].L.toFixed(0)}/${r1[k].s.toFixed(2)}/${r1[k].dL.toFixed(1)}`;
console.log(`toneR1.selftest (luma/saturation/levels per +25 %): ${Object.keys(S).map(row).join('; ')} PASS`);
