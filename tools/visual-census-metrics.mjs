// Visual census metrics (2026-10-01): the per-frame numbers of a census run (tools/visual-census.mjs), computed from
// the captured PNG alone so any two runs — two commits, two machines — compare on the same arithmetic. Pure functions
// over { width, height, rgba } (loadRgba of tools/map-metrics.mjs decodes a PNG into that shape).
//
// Luma is DISPLAY luma: Rec.601 weights on the sRGB bytes, 0..255 — the scale of map-metrics' skyline and boxes checks
// (22 is the daylight shadow floor there). Saturation is HSV saturation (max - min) / max. The sky / ground split is a
// per-column skyline: the strongest 8-row step of luma (plus half the step of blueness B - R) inside a window around
// the flat-world horizon row of the camera (tools/visual-census-views.mjs horizonRow), median-filtered across columns.
// Rows above the skyline are sky, rows below are ground; a frame whose horizon falls above the top edge is all ground.
//
// Earlier rounds' numbers kept here: check 5's skyline ratio (map-metrics skylineRatio, verbatim), round 72's "ring
// height" (how far the far terrain rises above the flat horizon, px) and ridge contrast (luma step across the
// silhouette), round 73's surface detail energy (high-pass energy of the ground).
import { skylineRatio } from './map-metrics.mjs';

const REC601 = Object.freeze([0.299, 0.587, 0.114]);
const LUMA_BINS = 1024; // 0.25 luma per bin
const SAT_BINS = 1000;
const STEP = 8; // skyline step half-width, rows
const SPLIT_GAP = 3; // rows left out on each side of the skyline

const round = (v, digits = 3) => (Number.isFinite(v) ? Math.round(v * 10 ** digits) / 10 ** digits : null);

/** The value below which `q` (0..1) of the histogram's mass lies, at the bin centre. */
export function histogramQuantile(hist, total, q, binWidth) {
  if (!(total > 0)) return null;
  const target = q * total;
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (acc >= target && acc > 0) return (i + 0.5) * binWidth;
  }
  return (hist.length - 0.5) * binWidth;
}

/** Luma, saturation, blueness planes plus the whole-frame histograms and colourfulness sums in one pass. */
function planes({ width, height, rgba }) {
  const n = width * height;
  const L = new Float32Array(n), S = new Float32Array(n), BR = new Float32Array(n);
  const lumaHist = new Float64Array(LUMA_BINS), satHist = new Float64Array(SAT_BINS);
  let rgSum = 0, rgSq = 0, ybSum = 0, ybSq = 0, clipHigh = 0, clipLow = 0, lSum = 0, lSq = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    const l = r * REC601[0] + g * REC601[1] + b * REC601[2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const s = max > 0 ? (max - min) / max : 0;
    L[i] = l; S[i] = s; BR[i] = b - r;
    lumaHist[Math.min(LUMA_BINS - 1, Math.floor(l * (LUMA_BINS / 256)))]++;
    satHist[Math.min(SAT_BINS - 1, Math.floor(s * SAT_BINS))]++;
    const rg = r - g, yb = 0.5 * (r + g) - b;
    rgSum += rg; rgSq += rg * rg; ybSum += yb; ybSq += yb * yb;
    lSum += l; lSq += l * l;
    if (l >= 250) clipHigh++;
    if (l <= 5) clipLow++;
  }
  const rgMean = rgSum / n, ybMean = ybSum / n;
  const colorfulness = Math.sqrt(Math.max(0, rgSq / n - rgMean ** 2) + Math.max(0, ybSq / n - ybMean ** 2))
    + 0.3 * Math.hypot(rgMean, ybMean);
  const lumaMean = lSum / n;
  return { L, S, BR, lumaHist, satHist, colorfulness, clipHigh: clipHigh / n, clipLow: clipLow / n, lumaMean,
    lumaStd: Math.sqrt(Math.max(0, lSq / n - lumaMean ** 2)) };
}

/** |L - mean of its 5 x 5 neighbourhood| per pixel (edges clamp the box), through a summed-area table. */
export function highPass(L, width, height, radius = 2) {
  const sat = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += L[y * width + x];
      sat[(y + 1) * (width + 1) + x + 1] = sat[y * (width + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius), y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(width, x + radius + 1);
      const sum = sat[y1 * (width + 1) + x1] - sat[y0 * (width + 1) + x1] - sat[y1 * (width + 1) + x0] + sat[y0 * (width + 1) + x0];
      out[y * width + x] = Math.abs(L[y * width + x] - sum / ((x1 - x0) * (y1 - y0)));
    }
  }
  return out;
}

/** Mean gradient magnitude (central differences, halved) over the interior: the frame's edge sharpness. */
function sharpness(L, width, height) {
  let sum = 0, n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      sum += 0.5 * Math.hypot(L[i + 1] - L[i - 1], L[i + width] - L[i - width]);
      n++;
    }
  }
  return n ? sum / n : 0;
}

function median(values) {
  if (!values.length) return null;
  const s = Float64Array.from(values).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Per-column skyline row (the first ground row) inside [h - 0.5 H, h + 0.08 H] around the horizon row h, or null
 * when that window is thinner than 24 rows. Returns { rows (Int32Array per column, median-filtered over 9 columns),
 * score (the median step strength in luma units) }.
 */
export function detectSkyline(L, BR, width, height, horizon) {
  if (horizon === null || !Number.isFinite(horizon)) return null;
  const lo = Math.max(STEP + 2, Math.round(horizon - 0.5 * height));
  const hi = Math.min(height - STEP - 2, Math.round(horizon + 0.08 * height));
  if (hi - lo < 24) return null;
  const raw = new Int32Array(width), scores = new Float64Array(width);
  const pl = new Float64Array(height + 1), pb = new Float64Array(height + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) { pl[y + 1] = pl[y] + L[y * width + x]; pb[y + 1] = pb[y] + BR[y * width + x]; }
    let best = -1, bestAt = lo;
    for (let y = lo; y <= hi; y++) {
      const dl = (pl[y] - pl[y - STEP]) - (pl[y + STEP] - pl[y]);
      const db = (pb[y] - pb[y - STEP]) - (pb[y + STEP] - pb[y]);
      const score = (Math.abs(dl) + 0.5 * Math.abs(db)) / STEP;
      if (score > best) { best = score; bestAt = y; }
    }
    raw[x] = bestAt; scores[x] = best;
  }
  const rows = new Int32Array(width), win = [];
  for (let x = 0; x < width; x++) {
    win.length = 0;
    for (let k = Math.max(0, x - 4); k <= Math.min(width - 1, x + 4); k++) win.push(raw[k]);
    win.sort((a, b) => a - b);
    rows[x] = win[win.length >> 1];
  }
  return { rows, score: median(scores), window: [lo, hi] };
}

function regionStats(values, mask, wanted) {
  let n = 0, sum = 0, sq = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== wanted) continue;
    const v = values[i]; n++; sum += v; sq += v * v;
  }
  const mean = n ? sum / n : null;
  return { n, mean, std: n ? Math.sqrt(Math.max(0, sq / n - mean * mean)) : null };
}

/** Mean rgb, saturation and saturation-weighted circular hue of the pixels whose mask equals `wanted`. */
function regionColour(rgba, S, mask, wanted) {
  let n = 0, r = 0, g = 0, b = 0, s = 0, hx = 0, hy = 0;
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    if (mask[i] !== wanted) continue;
    const R = rgba[p], G = rgba[p + 1], B = rgba[p + 2];
    n++; r += R; g += G; b += B; s += S[i];
    const max = Math.max(R, G, B), min = Math.min(R, G, B), span = max - min;
    if (span > 0) {
      let h;
      if (max === R) h = ((G - B) / span) % 6; else if (max === G) h = (B - R) / span + 2; else h = (R - G) / span + 4;
      const a = (h * Math.PI) / 3;
      hx += Math.cos(a) * S[i]; hy += Math.sin(a) * S[i];
    }
  }
  if (!n) return null;
  const hue = (Math.atan2(hy, hx) * 180) / Math.PI;
  return { rgb: [round(r / n, 1), round(g / n, 1), round(b / n, 1)], sat: round(s / n), hueDeg: Math.hypot(hx, hy) > 1e-9 ? round((hue + 360) % 360, 1) : null };
}

/** Sky / ground split from a skyline (1 = sky, 2 = ground, 0 = the gap rows); all ground without a skyline. */
function splitMask(width, height, skyline, horizon) {
  const mask = new Uint8Array(width * height);
  if (!skyline) {
    mask.fill(horizon !== null && horizon >= height ? 1 : 2);
    return mask;
  }
  for (let x = 0; x < width; x++) {
    const s = skyline.rows[x];
    for (let y = 0; y < height; y++) mask[y * width + x] = y < s - SPLIT_GAP ? 1 : y >= s + SPLIT_GAP ? 2 : 0;
  }
  return mask;
}

/** Sky-side metrics that need the skyline itself (ring height, relief, ridge step, the sky's vertical gradient, wash). */
function skylineFigures(L, width, height, skyline, horizon, mask) {
  const rows = skyline.rows, heights = [], steps = [];
  let relief = 0, reliefN = 0, topSum = 0, topN = 0, lowSum = 0, lowN = 0, farSum = 0, farN = 0, nearSum = 0, nearN = 0;
  const colMean = (x, y0, y1) => { let s = 0, n = 0; for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) { s += L[y * width + x]; n++; } return n ? s / n : null; };
  for (let x = 0; x < width; x++) {
    const s = rows[x];
    heights.push(horizon - s);
    if (x + 8 < width) { relief += Math.abs(rows[x + 8] - s); reliefN++; }
    const above = colMean(x, s - 20, s - 6), below = colMean(x, s + 6, s + 20);
    if (above !== null && below !== null) steps.push(above - below);
    for (let y = 0; y < Math.min(s - SPLIT_GAP, Math.round(height * 0.1)); y++) { topSum += L[y * width + x]; topN++; }
    for (let y = Math.max(0, s - 45); y < s - 5; y++) { lowSum += L[y * width + x]; lowN++; }
    for (let y = s + SPLIT_GAP; y < Math.min(height, s + 43); y++) { farSum += L[y * width + x]; farN++; }
  }
  for (let y = Math.round(height * 0.85); y < height; y++) {
    for (let x = 0; x < width; x++) { const i = y * width + x; if (mask[i] === 2) { nearSum += L[i]; nearN++; } }
  }
  return {
    ringHeightPx: round(median(heights), 1), skylineReliefPx: round(reliefN ? relief / reliefN : null, 2),
    skylineStep: round(median(steps), 2),
    skyZenithRatio: topN && lowN ? round((topSum / topN) / (lowSum / lowN)) : null,
    groundFarNearRatio: farN && nearN ? round((farSum / farN) / (nearSum / nearN)) : null,
  };
}

/**
 * Every census number of one frame. `horizon` is the flat-world horizon row of the camera that took it (null when
 * unknown: the frame then counts as all ground). Values are rounded for the JSON; shares are 0..1.
 */
export function frameMetrics(image, { horizon = null } = {}) {
  const { width, height, rgba } = image;
  const P = planes(image);
  const pct = (q) => round(histogramQuantile(P.lumaHist, width * height, q, 256 / LUMA_BINS), 2);
  const hp = highPass(P.L, width, height);
  const skyline = detectSkyline(P.L, P.BR, width, height, horizon);
  const mask = splitMask(width, height, skyline, horizon);
  const sky = regionStats(P.L, mask, 1), ground = regionStats(P.L, mask, 2);
  const skyDetail = regionStats(hp, mask, 1), groundDetail = regionStats(hp, mask, 2), allDetail = regionStats(hp, new Uint8Array(width * height), 0);
  const check5 = skylineRatio(image);
  const out = {
    lumaMean: round(P.lumaMean, 2), lumaStd: round(P.lumaStd, 2),
    lumaP1: pct(0.01), lumaP5: pct(0.05), lumaP25: pct(0.25), lumaP50: pct(0.5), lumaP75: pct(0.75), lumaP95: pct(0.95), lumaP99: pct(0.99),
    clipHigh: round(P.clipHigh, 4), clipLow: round(P.clipLow, 4),
    satMean: round(regionStats(P.S, new Uint8Array(width * height), 0).mean),
    satP90: round(histogramQuantile(P.satHist, width * height, 0.9, 1 / SAT_BINS)),
    colorfulness: round(P.colorfulness, 2), sharpness: round(sharpness(P.L, width, height), 3),
    detail: round(allDetail.mean, 3),
    horizonRow: round(horizon, 1),
    skyShare: round(sky.n / (width * height), 4),
    skyMean: round(sky.mean, 2), skyStd: round(sky.std, 2),
    groundMean: round(ground.mean, 2), groundStd: round(ground.std, 2),
    skyGroundContrast: sky.n && ground.n ? round((sky.mean - ground.mean) / (sky.mean + ground.mean), 4) : null,
    skyDetail: round(skyDetail.mean, 3), groundDetail: round(groundDetail.mean, 3),
    skylineScore: skyline ? round(skyline.score, 2) : null,
    skylineRatioCheck5: Number.isFinite(check5) ? round(check5) : null,
    sky: regionColour(rgba, P.S, mask, 1), ground: regionColour(rgba, P.S, mask, 2),
  };
  Object.assign(out, skyline && sky.n ? skylineFigures(P.L, width, height, skyline, horizon, mask)
    : { ringHeightPx: null, skylineReliefPx: null, skylineStep: null, skyZenithRatio: null, groundFarNearRatio: null });
  return out;
}

/** The headline numbers the index and the compare tables print, in order, with their labels. */
export const CENSUS_HEADLINE_METRICS = Object.freeze([
  ['lumaMean', 'luma'], ['lumaP5', 'p5'], ['lumaP95', 'p95'], ['satMean', 'sat'], ['colorfulness', 'colour'],
  ['skyGroundContrast', 'sky/gnd'], ['skylineRatioCheck5', 'chk5'], ['ringHeightPx', 'ring px'],
  ['skylineReliefPx', 'relief'], ['groundDetail', 'gnd detail'], ['skyDetail', 'sky detail'], ['sharpness', 'sharp'],
]);
