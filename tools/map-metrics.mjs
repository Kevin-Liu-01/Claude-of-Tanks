#!/usr/bin/env node
// Map capture metrics (rounds 37–47, committed 2026-09-23 by owner approval): Node ports of the three Python/PIL
// scripts the AAA map program measured with, on @napi-rs/canvas (already a devDependency) — same numbers within 1 %.
//
//   skyline  <dir> <tag> <maps,comma> [views,comma]        check 5: median ground/sky display-luma ratio at the skyline
//            per <map>-<tag>-<view>.png (default views sky-w,sky-s,centre-far); > 1 = the range reads paler than the
//            sky behind it. Rounds 37, 39, 47 (mesa rings and arid skies).
//   stripe   <image> <x0,y0,x1,y1> [<image> <box> ...]      check 8: windowed 2-D FFT of the detrended Rec.709 luminance
//            in a region — share of power in the strongest bin pair, its wavelength (px) and orientation, the share
//            held by the strongest 1 % of bins (band-limited repeat), the anisotropy of the peak's orientation band,
//            the luminance std. Round 43 (dune wind field: desert w-wall-mid 900,480,1500,700 top-1 % 0.54 → 0.22).
//   boxes    <capdir> <boxes.json> <maps,comma> <tagA> <tagB> [views,comma]   checks 3, 4, 11: mean display luma
//            (Rec.601 on sRGB bytes) of a SHADED and a LIT box, the 5th percentile and mean of the GROUND region, and
//            the near WALL box's mean rgb / hue / saturation / luma, A → B with % deltas. Rounds 42, 45, 47.
//            boxes.json: { "<view>": { "shaded": [x0,y0,x1,y1], "lit": [...], "ground": [...], "wall": [...] },
//            "<map>/<view>": { ...overrides } } — the round-47a table is reproduced in docs/MAP-BEAUTIFICATION.md.
//   --json on any subcommand prints machine-readable rows instead of the tables.
//
// Boxes are x0,y0,x1,y1 pixel bounds, x1/y1 exclusive (PIL crop semantics). Display luma 22 is the daylight floor.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const REC601 = Object.freeze([0.299, 0.587, 0.114]);
const REC709 = Object.freeze([0.2126, 0.7152, 0.0722]);
const SKYLINE_DEFAULT_VIEWS = Object.freeze(['sky-w', 'sky-s', 'centre-far']);
const BOXES_DEFAULT_VIEWS = Object.freeze(['sw-corner-close', 'canyon-in', 'centre-far', 'w-wall-mid', 'bird-w']);
const HELP = `node tools/map-metrics.mjs <subcommand> ... [--json]

  skyline <dir> <tag> <maps,comma> [views,comma]                      ground/sky luma ratio at the skyline (check 5)
  stripe  <image> <x0,y0,x1,y1> [<image> <x0,y0,x1,y1> ...]            oriented periodic-stripe metric (check 8)
  boxes   <capdir> <boxes.json> <maps,comma> <tagA> <tagB> [views,comma]  luma boxes A -> B (checks 3, 4, 11)

Captures are <map>-<tag>-<view>.png (tools/map-view-probe.mjs). Boxes are x0,y0,x1,y1 with x1/y1 exclusive.`;

// ---------------------------------------------------------------------------------------------- images

/** Decode a PNG (or any canvas-decodable image) into { width, height, rgba } through the real @napi-rs rasterizer. */
export async function loadRgba(file) {
  const image = await loadImage(file);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, image.width, image.height);
  return { width: image.width, height: image.height, rgba: data };
}

/** Per-pixel luma (row-major Float64Array) with the given RGB weights; alpha is ignored like PIL's convert('RGB'). */
function lumaOf({ width, height, rgba }, weights = REC601) {
  const out = new Float64Array(width * height);
  const [wr, wg, wb] = weights;
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = rgba[p] * wr + rgba[p + 1] * wg + rgba[p + 2] * wb;
  return out;
}

export function parseBox(text) {
  const parts = String(text).split(',').map((v) => v.trim());
  if (parts.length !== 4 || parts.some((v) => !/^-?\d+$/.test(v))) throw new Error(`box must be x0,y0,x1,y1 integers, got "${text}"`);
  const [x0, y0, x1, y1] = parts.map(Number);
  if (x1 <= x0 || y1 <= y0) throw new Error(`box must have x1 > x0 and y1 > y0, got "${text}"`);
  return [x0, y0, x1, y1];
}

function boxValues(luma, width, height, [x0, y0, x1, y1]) {
  const cx0 = Math.max(0, x0), cy0 = Math.max(0, y0), cx1 = Math.min(width, x1), cy1 = Math.min(height, y1);
  const out = new Float64Array(Math.max(0, cx1 - cx0) * Math.max(0, cy1 - cy0));
  let k = 0;
  for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) out[k++] = luma[y * width + x];
  return out;
}

// ---------------------------------------------------------------------------------------------- statistics (numpy semantics)

export function mean(values) {
  if (!values.length) return NaN;
  let s = 0; for (const v of values) s += v; return s / values.length;
}

/** Population standard deviation (numpy std, ddof = 0). */
export function std(values) {
  const m = mean(values); let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return Math.sqrt(s / values.length);
}

/** numpy median: the mean of the two middle order statistics for an even count. */
export function median(values) {
  if (!values.length) return NaN;
  const sorted = Float64Array.from(values).sort();
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** numpy percentile with linear interpolation between order statistics. */
export function percentile(values, q) {
  if (!values.length) return NaN;
  const sorted = Float64Array.from(values).sort();
  const rank = (sorted.length - 1) * (q / 100);
  const lo = Math.floor(rank), hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/** colorsys.rgb_to_hsv on 0..1 components: h in [0,1), s = (max-min)/max, v = max. */
export function rgbToHsv(r, g, b) {
  const maxc = Math.max(r, g, b), minc = Math.min(r, g, b), v = maxc;
  if (minc === maxc) return [0, 0, v];
  const s = (maxc - minc) / maxc, span = maxc - minc;
  const rc = (maxc - r) / span, gc = (maxc - g) / span, bc = (maxc - b) / span;
  let h;
  if (r === maxc) h = bc - gc; else if (g === maxc) h = 2 + rc - bc; else h = 4 + gc - rc;
  h = (h / 6) % 1; if (h < 0) h += 1;
  return [h, s, v];
}

const roundTo = (value, digits) => { const f = 10 ** digits; return Math.round(value * f) / f; };
const pyMod = (a, n) => ((a % n) + n) % n;

// ---------------------------------------------------------------------------------------------- skyline (check 5)

/**
 * Check-5 metric. For every 8th column between x = 200 and W-200: the strongest luma step in the middle half of the
 * frame is the skyline; the mean of the 6–20 px below it over the mean of the 6–20 px above it (skipped when the
 * "sky" side is darker than 60 or too short). The median over columns; NaN when no column qualifies.
 */
export function skylineRatio(image) {
  const { width: W, height: H } = image;
  const luma = lumaOf(image, REC601);
  const ratios = [];
  const b0 = Math.trunc(H * 0.25), b1 = Math.trunc(H * 0.75);
  for (let x = 200; x < W - 200; x += 8) {
    let best = -1, bestAt = -1;
    for (let y = b0; y < b1 - 1; y++) {
      const d = Math.abs(luma[(y + 1) * W + x] - luma[y * W + x]);
      if (d > best) { best = d; bestAt = y; } // first maximum, like np.argmax
    }
    if (bestAt < 0) continue;
    const i = bestAt;
    const above = [], below = [];
    for (let y = Math.max(0, i - 20); y < i - 6; y++) above.push(luma[y * W + x]);
    for (let y = i + 6; y < Math.min(H, i + 20); y++) below.push(luma[y * W + x]);
    if (above.length < 5 || below.length < 5) continue;
    const a = mean(above);
    if (a < 60) continue;
    ratios.push(mean(below) / a);
  }
  return ratios.length ? median(ratios) : NaN;
}

export async function skylineTable(dir, tag, maps, views = SKYLINE_DEFAULT_VIEWS) {
  const rows = [];
  for (const map of maps) {
    const row = { map, ratios: {} };
    for (const view of views) {
      const file = path.join(dir, `${map}-${tag}-${view}.png`);
      if (!existsSync(file)) continue;
      row.ratios[view] = skylineRatio(await loadRgba(file));
    }
    rows.push(row);
  }
  return rows;
}

const fmt2 = (r) => (Number.isNaN(r) ? ' nan' : r.toFixed(2).padStart(4));
export function formatSkylineTable(rows) {
  return rows.map((row) => `${row.map.padEnd(14)} ${Object.entries(row.ratios).map(([v, r]) => `${v}=${fmt2(r)}`).join('  ')}`).join('\n');
}

// ---------------------------------------------------------------------------------------------- stripe (check 8)

function fftRadix2(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

/** Forward DFT of arbitrary length (radix-2 when a power of two, Bluestein's chirp-z otherwise), in place. */
export function fft(re, im) {
  const n = re.length;
  if (n < 2) return;
  if ((n & (n - 1)) === 0) { fftRadix2(re, im); return; }
  let m = 1; while (m < 2 * n - 1) m <<= 1;
  const cr = new Float64Array(n), ci = new Float64Array(n); // chirp c_j = exp(-i pi j^2 / n), j^2 reduced mod 2n
  for (let j = 0; j < n; j++) { const a = -Math.PI * ((j * j) % (2 * n)) / n; cr[j] = Math.cos(a); ci[j] = Math.sin(a); }
  const ar = new Float64Array(m), ai = new Float64Array(m), br = new Float64Array(m), bi = new Float64Array(m);
  for (let j = 0; j < n; j++) {
    ar[j] = re[j] * cr[j] - im[j] * ci[j]; ai[j] = re[j] * ci[j] + im[j] * cr[j];
    br[j] = cr[j]; bi[j] = -ci[j]; // conj(c_j), mirrored for the circular convolution
    if (j) { br[m - j] = cr[j]; bi[m - j] = -ci[j]; }
  }
  fftRadix2(ar, ai); fftRadix2(br, bi);
  for (let k = 0; k < m; k++) { const r = ar[k] * br[k] - ai[k] * bi[k]; ai[k] = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; }
  for (let k = 0; k < m; k++) ai[k] = -ai[k]; // inverse via conjugation
  fftRadix2(ar, ai);
  for (let k = 0; k < n; k++) {
    const xr = ar[k] / m, xi = -ai[k] / m;
    re[k] = xr * cr[k] - xi * ci[k]; im[k] = xr * ci[k] + xi * cr[k];
  }
}

/** |F|^2 of a real h×w matrix (row-major), fftshifted like numpy (index 0 moves to h>>1, w>>1). */
export function powerSpectrum(values, h, w) {
  const re = Float64Array.from(values), im = new Float64Array(h * w);
  const rowRe = new Float64Array(w), rowIm = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    rowRe.set(re.subarray(y * w, (y + 1) * w)); rowIm.fill(0);
    fft(rowRe, rowIm);
    re.set(rowRe, y * w); im.set(rowIm, y * w);
  }
  const colRe = new Float64Array(h), colIm = new Float64Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) { colRe[y] = re[y * w + x]; colIm[y] = im[y * w + x]; }
    fft(colRe, colIm);
    for (let y = 0; y < h; y++) { re[y * w + x] = colRe[y]; im[y * w + x] = colIm[y]; }
  }
  const cy = h >> 1, cx = w >> 1;
  const p = new Float64Array(h * w);
  for (let y = 0; y < h; y++) {
    const sy = pyMod(y - cy, h);
    for (let x = 0; x < w; x++) { const sx = pyMod(x - cx, w); const i = sy * w + sx; p[y * w + x] = re[i] * re[i] + im[i] * im[i]; }
  }
  return p;
}

/** Remove the mean and a linear ramp (least-squares plane on 1, x, y), like np.linalg.lstsq on the same design. */
export function detrendPlane(values, h, w) {
  const n = h * w;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, sv = 0, sxv = 0, syv = 0;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const v = values[i];
    sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; sv += v; sxv += x * v; syv += y * v;
  }
  // normal equations [n sx sy; sx sxx sxy; sy sxy syy] c = [sv sxv syv], Gaussian elimination
  const A = [[n, sx, sy, sv], [sx, sxx, sxy, sxv], [sy, sxy, syy, syv]];
  for (let c = 0; c < 3; c++) {
    let pivot = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r;
    [A[c], A[pivot]] = [A[pivot], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) { A[c][c] = 1; A[c][3] = 0; } // degenerate axis (w or h of 1)
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k];
    }
  }
  const c0 = A[0][3] / A[0][0], c1 = A[1][3] / A[1][1], c2 = A[2][3] / A[2][2];
  const out = new Float64Array(n);
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) out[i] = values[i] - (c0 + c1 * x + c2 * y);
  return out;
}

/** np.hanning(M): 0.5 - 0.5 cos(2 pi k / (M-1)); [1] for M = 1. */
export function hanning(M) {
  if (M === 1) return Float64Array.of(1);
  const out = new Float64Array(M);
  for (let k = 0; k < M; k++) out[k] = 0.5 - 0.5 * Math.cos(2 * Math.PI * k / (M - 1));
  return out;
}

/**
 * Check-8 corduroy metric of one region: Rec.709 luminance, plane-detrended, Hann-windowed, 2-D power spectrum with
 * a 2.5-bin DC exclusion disc. peakShare = the strongest bin pair's share of the total power; wavelengthPx / angleDeg
 * of that bin; top1Share = the strongest 1 % of bins; anisotropy = mean power in the peak's ±10° orientation band
 * over the mean power overall; stdLuma = std of the detrended luminance.
 */
export function stripeMetrics(image, box) {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0, h = y1 - y0;
  if (x0 < 0 || y0 < 0 || x1 > image.width || y1 > image.height) throw new Error(`box ${box.join(',')} exceeds the ${image.width}x${image.height} image`);
  const luma709 = lumaOf(image, REC709);
  const region = boxValues(luma709, image.width, image.height, box);
  const d = detrendPlane(region, h, w);
  const wy = hanning(h), wx = hanning(w);
  const windowed = new Float64Array(h * w);
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) windowed[i] = d[i] * wy[y] * wx[x];
  const p = powerSpectrum(windowed, h, w);
  const cy = h >> 1, cx = w >> 1;
  let total = 0, peak = -1, peakAt = 0;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    if (Math.hypot(y - cy, x - cx) < 2.5) p[i] = 0;
    total += p[i];
    if (p[i] > peak) { peak = p[i]; peakAt = i; }
  }
  if (!(total > 0)) total = 1;
  const fy = Math.floor(peakAt / w) - cy, fx = (peakAt % w) - cx;
  const freq = Math.hypot(fy / h, fx / w);
  const wavelength = freq > 0 ? 1 / freq : Infinity;
  const angle = pyMod(Math.atan2(fy / h, fx / w) * 180 / Math.PI, 180);
  const sorted = Float64Array.from(p).sort().reverse();
  const top = Math.max(1, Math.floor(sorted.length / 100));
  let top1 = 0; for (let i = 0; i < top; i++) top1 += sorted[i];
  let bandSum = 0, bandCount = 0;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const ang = pyMod(Math.atan2((y - cy) / h, (x - cx) / w) * 180 / Math.PI, 180);
    if (Math.abs(pyMod(ang - angle + 90, 180) - 90) < 10) { bandSum += p[i]; bandCount++; }
  }
  const aniso = (bandSum / Math.max(bandCount, 1)) / (total / p.length);
  return {
    peakShare: roundTo(peak * 2 / total, 4), top1Share: roundTo(top1 / total, 3),
    wavelengthPx: Number.isFinite(wavelength) ? roundTo(wavelength, 1) : Infinity, angleDeg: roundTo(angle, 1),
    anisotropy: roundTo(aniso, 2), stdLuma: roundTo(std(d), 2),
  };
}

// ---------------------------------------------------------------------------------------------- boxes (checks 3, 4, 11)

/** Mean rgb / hue / saturation / luma of a box, as the round-47a wall check printed them. */
export function wallStats(image, box) {
  const [x0, y0, x1, y1] = box;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.max(0, y0); y < Math.min(image.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(image.width, x1); x++) {
    const p = (y * image.width + x) * 4; r += image.rgba[p]; g += image.rgba[p + 1]; b += image.rgba[p + 2]; n++;
  }
  const m = [r / n / 255, g / n / 255, b / n / 255];
  const [h, s] = rgbToHsv(...m);
  const luma = (m[0] * REC601[0] + m[1] * REC601[1] + m[2] * REC601[2]) * 255;
  return { rgb: m.map((v) => v * 255), hueDeg: h * 360, sat: s, luma,
    text: `rgb ${m.map((v) => (v * 255).toFixed(0)).join('/')} hue ${(h * 360).toFixed(0)}° sat ${s.toFixed(2)} luma ${luma.toFixed(1)}` };
}

/** Shaded / lit means, ground p5 and mean, optional wall stats of one capture for one view spec. */
export function boxStats(image, spec) {
  const luma = lumaOf(image, REC601);
  const out = {};
  if (spec.wall) out.wall = wallStats(image, spec.wall);
  for (const k of ['shaded', 'lit']) if (spec[k]) out[k] = mean(boxValues(luma, image.width, image.height, spec[k]));
  const ground = boxValues(luma, image.width, image.height, spec.ground);
  out.p5 = percentile(ground, 5); out.gmean = mean(ground);
  return out;
}

/** The per-view spec: the view's boxes with "<map>/<view>" overrides merged over them. */
export function resolveBoxSpec(boxes, map, view) {
  const spec = { ...(boxes[view] || {}), ...(boxes[`${map}/${view}`] || {}) };
  for (const k of ['shaded', 'lit', 'ground', 'wall']) if (spec[k]) spec[k] = parseBox(spec[k].join(','));
  return spec;
}

export async function boxesTable(capDir, boxes, maps, tagA, tagB, views = BOXES_DEFAULT_VIEWS) {
  const rows = [];
  for (const map of maps) for (const view of views) {
    const spec = resolveBoxSpec(boxes, map, view);
    if (!spec.ground) continue;
    const fileA = path.join(capDir, `${map}-${tagA}-${view}.png`), fileB = path.join(capDir, `${map}-${tagB}-${view}.png`);
    const row = { map, view, missing: [] };
    if (!existsSync(fileA)) row.missing.push('A');
    if (!existsSync(fileB)) row.missing.push('B');
    if (!row.missing.length) { row.a = boxStats(await loadRgba(fileA), spec); row.b = boxStats(await loadRgba(fileB), spec); }
    rows.push(row);
  }
  return rows;
}

const pct = (a, b) => (a ? `${((b - a) / a * 100 >= 0 ? '+' : '')}${((b - a) / a * 100).toFixed(1)}%` : 'n/a');
const f1 = (v, width) => (v === undefined ? 'nan' : v.toFixed(1)).padStart(width);
export function formatBoxesTable(rows) {
  const lines = [`${'map/view'.padEnd(28)} ${'shaded A'.padStart(9)} ${'shaded B'.padStart(9)} ${'d'.padStart(7)} | ${'lit A'.padStart(7)} ${'lit B'.padStart(7)} ${'d'.padStart(7)} | ${'p5 A'.padStart(6)} ${'p5 B'.padStart(6)} | ${'gmean A'.padStart(7)} ${'gmean B'.padStart(7)}`];
  for (const row of rows) {
    const name = `${row.map}/${row.view}`;
    if (row.missing.length) { lines.push(`${name}: missing capture (${row.missing.join('')})`); continue; }
    const { a, b } = row;
    lines.push(`${name.padEnd(28)} ${f1(a.shaded, 9)} ${f1(b.shaded, 9)} ${(a.shaded !== undefined ? pct(a.shaded, b.shaded) : 'n/a').padStart(7)} | ${f1(a.lit, 7)} ${f1(b.lit, 7)} ${(a.lit !== undefined ? pct(a.lit, b.lit) : 'n/a').padStart(7)} | ${f1(a.p5, 6)} ${f1(b.p5, 6)} | ${f1(a.gmean, 7)} ${f1(b.gmean, 7)}`);
    if (a.wall) lines.push(`${''.padEnd(28)} wall A: ${a.wall.text}\n${''.padEnd(28)} wall B: ${b.wall.text}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------- CLI

async function runMapMetrics(argv) {
  const json = argv.includes('--json');
  const args = argv.filter((a) => a !== '--json');
  const [command, ...rest] = args;
  if (!command || command === '--help' || command === '-h') { console.log(HELP); return command ? 0 : 1; }
  if (command === 'skyline') {
    const [dir, tag, maps, views] = rest;
    if (!dir || !tag || !maps) throw new Error('skyline needs <dir> <tag> <maps,comma> [views,comma]');
    const rows = await skylineTable(dir, tag, maps.split(','), views ? views.split(',') : SKYLINE_DEFAULT_VIEWS);
    console.log(json ? JSON.stringify(rows) : formatSkylineTable(rows));
    return 0;
  }
  if (command === 'stripe') {
    if (rest.length < 2 || rest.length % 2) throw new Error('stripe needs <image> <x0,y0,x1,y1> pairs');
    const rows = [];
    for (let i = 0; i < rest.length; i += 2) {
      const file = rest[i], box = parseBox(rest[i + 1]);
      const metrics = stripeMetrics(await loadRgba(file), box);
      rows.push({ file: path.basename(file), box, ...metrics });
      if (!json) console.log(path.basename(file), rest[i + 1], JSON.stringify(metrics));
    }
    if (json) console.log(JSON.stringify(rows));
    return 0;
  }
  if (command === 'boxes') {
    const [capDir, boxesPath, maps, tagA, tagB, views] = rest;
    if (!capDir || !boxesPath || !maps || !tagA || !tagB) throw new Error('boxes needs <capdir> <boxes.json> <maps,comma> <tagA> <tagB> [views,comma]');
    const boxes = JSON.parse(readFileSync(boxesPath, 'utf8'));
    const rows = await boxesTable(capDir, boxes, maps.split(','), tagA, tagB, views ? views.split(',') : BOXES_DEFAULT_VIEWS);
    console.log(json ? JSON.stringify(rows) : formatBoxesTable(rows));
    return 0;
  }
  throw new Error(`Unknown subcommand "${command}"`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await runMapMetrics(process.argv.slice(2)); }
  catch (error) { console.error(`${error.message}\n\n${HELP}`); process.exitCode = 1; }
}
