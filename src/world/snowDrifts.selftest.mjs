// snowDrifts.selftest — the snow maps' drift and sastrugi trains (terrain.ts, the redux snow block) without rings
// (the engine-cs lane, 2026-10-14; media wave f1: 14 notes on Frosthollow at sunset, "concentric orange contour rings, a
// banding or marbling artefact that reads like wood grain", and Alpine by day, "a repeating swirl and ring texture").
//
// A train's crests and lee lines are the iso-lines of its phase. Round 73b's drift phase added n1 × 0.9 cycle (the noise
// texture's R field at its 9.5 m and 21 m octaves) to a 15 m ramp and multiplied the world position by a heading and a
// wavelength that vary over the map: the phase's gradient along the wind reversed over much of the snow, and wherever it
// does the iso-lines close into rings round the noise's extrema. A phase strictly monotone along the wind has no closed
// iso-line. The CPU twin below bakes the shader's uNoise texture exactly as makeShaderNoiseTexture does (the splat fields,
// seed 3011, bytes, repeat-wrapped bilinear texel reads) and evaluates both laws over the whole battlefield square:
//  1. the new drift and sastrugi phases are strictly monotone along the wind everywhere (no rings), with a bounded
//     meander (heading, wavelength);
//  2. the old drift phase reversed over a large share of the square (the defect, pinned);
//  3. the tilt the drift draws keeps every facet on the sun's side of the terminator under a sunset sun, and a high sun
//     keeps the whole relief;
//  4. the GLSL carries the law and none of the old one.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { tileableTorusNoise as torusNoise } from './proceduralTexture.ts';
import { mulberry32 } from './terrain.ts';

// ---- the shader's uNoise texture (terrain.ts splatFieldSteps + makeShaderNoiseTexture): R = field a, G = field b
const S = 256;
const tex = [new Uint8ClampedArray(S * S), new Uint8ClampedArray(S * S)];
{
  const noi = new SimplexNoise({ random: mulberry32(3011) });
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, j = y * S + x;
    const a = Math.fround(torusNoise(noi, u, v, 4, 4, 3) * 0.6 + torusNoise(noi, u, v, 9, 9, 27) * 0.4);
    const b = Math.fround(torusNoise(noi, u, v, 2, 2, 55) * 0.7 + torusNoise(noi, u, v, 5, 5, 91) * 0.3);
    tex[0][j] = (a * 0.5 + 0.5) * 255; tex[1][j] = (b * 0.5 + 0.5) * 255;
  }
}
/** nz(p, s, o) channel c at mip 0: repeat-wrapped bilinear at texel centres, row 0 at v = 0 (the texture uploads unflipped). */
function nz(px, pz, s, ox, oz, c) {
  const x = (px * s + ox) * S - 0.5, y = (pz * s + oz) * S - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const i0 = x0 & 255, j0 = y0 & 255, i1 = (i0 + 1) & 255, j1 = (j0 + 1) & 255, t = tex[c];
  const g00 = t[j0 * S + i0], g10 = t[j0 * S + i1], g01 = t[j1 * S + i0], g11 = t[j1 * S + i1];
  return (g00 + (g10 - g00) * fx + (g01 - g00) * fy + (g00 - g10 - g01 + g11) * fx * fy) / 255;
}
const n1 = (x, z) => nz(x, z, 0.0117, 0, 0, 0);
const n1h = (x, z) => nz(x, z, 0.047, 0, 0, 0);
const n2 = (x, z) => nz(x, z, 0.0031, 0.41, 0.13, 1);
const wOff = (x, z) => [(nz(x, z, 0.0009, 0.53, 0.17, 0) - 0.5) * 48, (nz(x, z, 0.0009, 0.53, 0.17, 1) - 0.5) * 48];
const n2w = (x, z) => { const [wx, wz] = wOff(x, z); return nz(x + wx, z + wz, 0.0031, 0.41, 0.13, 1); };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- the laws (cycles; the GLSL's fract() and sin() arguments)
const WIND = [0.6221, 0.7829];
const K_DRIFT = 0.0669, K_SAST = 3.4 / (2 * Math.PI);
const driftPhase = (x, z) => (x * WIND[0] + z * WIND[1]) * K_DRIFT + (n2(x, z) - 0.5) * 0.2 + wOff(x, z)[1] * (0.3 / 48);
const sastPhase = (x, z) => (x * WIND[0] + z * WIND[1]) * K_SAST + (n2(x, z) - 0.5) * 0.25 + (n1(x, z) - 0.5) * 0.2;
/** Round 73b's drift phase: the heading field and the wavelength field on the world position, n1 and n2w as phase. */
function oldDriftPhase(x, z) {
  let sx = 0.62 + (nz(x, z, 0.0025, 0.37, 0.91, 0) - 0.5) * 0.9, sz = 0.78 + (nz(x, z, 0.0025, 0.37, 0.91, 1) - 0.5) * 0.9;
  const l = Math.hypot(sx, sz); sx /= l; sz /= l;
  return (x * sx + z * sz) * 0.0669 * (0.78 + 0.44 * n2(x, z)) + n1(x, z) * 0.9 + n2w(x, z) * 0.5;
}
assert.ok(Math.abs(Math.hypot(...WIND) - 1) < 1e-4 && Math.abs(WIND[0] / WIND[1] - 0.62 / 0.78) < 1e-3, 'the snow maps\' wind, normalised');

// ---- 1, 2. along the wind over the battlefield square: the new phases strictly monotone, the old one reversing
const H = 0.05, STEP = 1.37; // a step incommensurate with the noise's texels
const along = (f, x, z) => (f(x + WIND[0] * H, z + WIND[1] * H) - f(x - WIND[0] * H, z - WIND[1] * H)) / (2 * H);
const across = (f, x, z) => (f(x - WIND[1] * H, z + WIND[0] * H) - f(x + WIND[1] * H, z - WIND[0] * H)) / (2 * H);
let minDrift = Infinity, minSast = Infinity, oldReversed = 0, count = 0, worstHeading = 0;
const headings = [], lengths = [];
for (let x = -512; x <= 512; x += STEP) for (let z = -512; z <= 512; z += STEP) {
  const ad = along(driftPhase, x, z), as = along(sastPhase, x, z);
  minDrift = Math.min(minDrift, ad / K_DRIFT); minSast = Math.min(minSast, as / K_SAST);
  const cd = across(driftPhase, x, z);
  const heading = Math.atan2(Math.abs(cd), ad) * 180 / Math.PI;
  worstHeading = Math.max(worstHeading, heading);
  if ((count & 63) === 0) { headings.push(heading); lengths.push(1 / Math.hypot(ad, cd)); }
  if (along(oldDriftPhase, x, z) <= 0) oldReversed++;
  count++;
}
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
assert.ok(minDrift > 0.2, `the drift phase climbs along the wind everywhere (its slowest ${minDrift.toFixed(3)} of the train's wave number)`);
assert.ok(minSast > 0.35, `the sastrugi's too (${minSast.toFixed(3)})`);
const oldShare = oldReversed / count;
assert.ok(oldShare > 0.2, `round 73b's drift phase reversed over ${(oldShare * 100).toFixed(1)} % of the square: the rings`);
// the meander: the crests turn and the spacing swings, bounded
const h50 = pct(headings, 0.5), h99 = pct(headings, 0.99), l01 = pct(lengths, 0.01), l99 = pct(lengths, 0.99);
assert.ok(h50 > 2 && h50 < 10 && h99 < 30 && worstHeading < 60, `the crests' heading off the wind: p50 ${h50.toFixed(1)}°, p99 ${h99.toFixed(1)}°, worst ${worstHeading.toFixed(1)}°`);
assert.ok(l01 > 9 && l99 < 26, `the drift spacing ${l01.toFixed(1)}–${l99.toFixed(1)} m (p01–p99; the train's own 15 m)`);

// ---- 3. the terminator: the tilt the drift block draws, its along-sun share bounded as the GLSL bounds it
const DETAIL_GAIN = 1; // the snow maps' splat.detailNormal (absent: 1)
function drawnTilt(x, z, camDist, sun, sw = 0.26) {
  const dwave = ((driftPhase(x, z) % 1) + 1) % 1;
  let drift = (dwave < 0.8 ? dwave / 0.8 : (1 - dwave) / 0.2) * 2 - 1;
  drift *= 0.2 + 0.8 * smooth(0.35, 0.70, n2w(x, z));
  const sast = Math.sin(sastPhase(x, z) * 2 * Math.PI) * (1 - smooth(30, 120, camDist));
  const driftD = 1 - smooth(120, 420, camDist);
  const t = Math.min(0.3, Math.max(-0.3, sast * 0.5 + drift * driftD * 0.9)) * sw;
  let tx = WIND[0] * t, tz = WIND[1] * t;
  const sHl = Math.hypot(sun[0], sun[2]), shx = sun[0] / Math.max(sHl, 1e-4), shz = sun[2] / Math.max(sHl, 1e-4);
  const dkE = 2 * DETAIL_GAIN * (1 + smooth(18, 45, camDist) * (1 - smooth(300, 600, camDist)));
  const fullA = 0.3 * sw * Math.abs(WIND[0] * shx + WIND[1] * shz) + 1e-5;
  const tS = Math.max(sun[1], 0) / Math.max(sHl, 0.05);
  const keepA = Math.min(1, Math.max(0.35 * tS, tS - 0.12) / (dkE * fullA));
  const a = tx * shx + tz * shz;
  tx -= shx * a * (1 - keepA); tz -= shz * a * (1 - keepA);
  // the world tilt SPLAT_NORMAL_FRAG draws: twice the encoded delta, times dk (its largest: the range gain whole)
  return { wx: tx * dkE, wz: tz * dkE, keepA, sun: { shx, shz, tS } };
}
const sunAt = (azDeg, elDeg) => {
  const az = azDeg * Math.PI / 180, el = elDeg * Math.PI / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
};
let worstSunset = Infinity, sunsetSamples = 0, dayKeep = Infinity;
for (const el of [1, 2, 3.5, 5, 8]) for (let az = 0; az < 360; az += 22.5) {
  const sun = sunAt(az, el);
  for (const camDist of [8, 30, 60, 200]) for (let i = 0; i < 400; i++) {
    const x = -480 + ((i * 97.13) % 960), z = -480 + ((i * 61.71 + az * 3.1) % 960);
    const { wx, wz } = drawnTilt(x, z, camDist, sun);
    const n = [wx, 1, wz], l = Math.hypot(...n);
    const ndl = (n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]) / l;
    worstSunset = Math.min(worstSunset, ndl / sun[1]);
    sunsetSamples++;
  }
}
assert.ok(worstSunset > 0.5, `under a sunset sun (1–8°) every drift facet keeps the sun: N·L at least ${worstSunset.toFixed(3)} of the flat ground's (round 73b: 0 over the rings' far sides)`);
for (const el of [35, 50, 70]) for (let az = 0; az < 360; az += 30) {
  const sun = sunAt(az, el);
  for (const camDist of [8, 60, 200]) dayKeep = Math.min(dayKeep, drawnTilt(0, 0, camDist, sun).keepA);
}
assert.equal(dayKeep, 1, 'a day sun (35° and up) keeps the whole relief');

// ---- 4. the GLSL
const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const block = terrain.slice(terrain.indexOf('  if (uReduxSnow.y > 0.001) {'), terrain.indexOf('  // Round 73: the folds.'));
assert.ok(block.length > 500, 'the snow trains\' block');
for (const term of [
  'vec2 swind = vec2(0.6221, 0.7829);', 'float sph = dot(uv, swind);',
  'float sast = sin(sph * 3.4 + ((n2 - 0.5) * 0.25 + (n1 - 0.5) * 0.2) * 6.2832) * (1.0 - smoothstep(30.0, 120.0, camDist));',
  'float dwave = fract(sph * 0.0669 + (n2 - 0.5) * 0.2 + wOff.y * (0.3 / 48.0));',
  'float drift = (dwave < 0.8 ? dwave / 0.8 : (1.0 - dwave) / 0.2) * 2.0 - 1.0;',
  'drift *= 0.2 + 0.8 * smoothstep(0.35, 0.70, n2w);',
  'vec2 sTilt = swind * clamp(sast * 0.5 + drift * driftD * 0.9, -0.3, 0.3) * sw;',
  'float dkE = 2.0 * max(uDetailGain, 1e-3) * (1.0 + smoothstep(18.0, 45.0, camDist) * (1.0 - smoothstep(300.0, 600.0, camDist)));',
  'float fullA = 0.3 * sw * abs(dot(swind, sH)) + 1e-5;', 'float tS = max(uSunDirW.y, 0.0) / max(sHl, 0.05);',
  'float keepA = min(1.0, max(0.35 * tS, tS - 0.12) / (dkE * fullA));', 'sTilt -= sH * dot(sTilt, sH) * (1.0 - keepA);', 'n.xy += sTilt;',
]) assert.ok(block.includes(term), `the block carries: ${term}`);
for (const old of ['nz(uv, 0.0025', 'n1h * 5.0', 'n1 * 0.9', '(0.78 + 0.44 * n2)', 'n2w * 0.5'])
  assert.ok(!block.includes(old), `round 73b's ringing term is gone: ${old}`);
// the twin's wOff is the shader's (the 0.0009 field read once for the domain warp and the drift's meander)
assert.ok(terrain.includes('vec2 wOff = (nz(uv, 0.0009, vec2(0.53, 0.17)).rg - 0.5) * 48.0;'), 'the domain warp the drift reads');
// SPLAT_NORMAL_FRAG draws the encoded delta twice over, times dk with the range gain — the terminator bound's dkE
assert.ok(terrain.includes('gSplatNrm = n.xyz * 2.0 - 1.0;') && terrain.includes('vec3 pN = vec3(dN.x, dN.z, dN.y) * dk;')
  && terrain.includes('dk *= 1.0 + DK_RANGE_GAIN * smoothstep(18.0, 45.0, camDk) * (1.0 - smoothstep(300.0, 600.0, camDk))')
  && terrain.includes('#define DK_RANGE_GAIN 1.0'), 'the detail gain the bound assumes');

console.log(`snowDrifts.selftest: over the battlefield square (${count} points) the drift and sastrugi phases climb along the wind everywhere `
  + `(slowest ${minDrift.toFixed(2)} and ${minSast.toFixed(2)} of their wave numbers; round 73b's drift reversed over ${(oldShare * 100).toFixed(1)} %: the rings), `
  + `the crests meander (heading p50 ${h50.toFixed(1)}°, p99 ${h99.toFixed(1)}°; spacing ${l01.toFixed(1)}–${l99.toFixed(1)} m), a sunset sun lights every facet `
  + `(N·L at least ${worstSunset.toFixed(2)} of flat, ${sunsetSamples} samples), a day sun keeps the whole relief, the GLSL carries the law PASS`);
