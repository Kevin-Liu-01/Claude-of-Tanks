// src/world/horizonMassif.ts — the mountains lane of the p2 redesign (2026-10-02; owner: "clouds are the bar;
// mountains, horizons and terrain must match"). MASSIFS, NOT CONES: an eroded landform for the ring's ranges and the
// far range. Pure and deterministic from the map seed, Node-runnable (no DOM), evaluated once per vertex at world
// construction — no per-frame work, no draw call, no triangle (heights only: every vertex keeps its radius and angle).
//
// Why: round 72's coarse relief carved the profile envelope with one broad ridged field, and the profile itself is one
// angular noise per row, so its massifs line up from row to row: every range was a radial spur, and a spur seen end-on
// from the battlefield is a smooth triangle — three blur passes rounded its summit and the cone rule straightened its
// flanks (Frosthollow, Frontier Basin, Obsidian Caldera). Ranges at one to three kilometres read by other things: crest
// lines with several summits and the cols between them, spurs that step down the flanks (shoulders in the silhouette)
// with couloirs between them, flanks that are concave — steep under the crest, easing into a broad valley floor.
//
// The landform here is a dendritic drainage pattern cut into a smooth base, after Clay John's erosion filter: in
// jittered cells, cosine waves laid ACROSS the local slope (so their crests and troughs run DOWN it, and their count
// grows with the slope), each finer octave turned by the slope the coarser octaves leave — the couloirs branch the way
// water cuts them, the ridges between them become spurs and arêtes, flat floors stay smooth. maps/horizon.ts multiplies
// the ring's own composition (its ranges, smoothed along each row) by this landform normalised to a mean of one, so the
// authored layout keeps its tall sectors and its passes while every mass in it is carved into ridges and valleys.

export interface MassifSettings {
  /** Wavelength (m) of the smooth base the drainage is cut into. */
  baseWavelengthM: number;
  /** Couloir spacing (m) of the coarsest erosion octave (each further octave halves it) and the number of octaves. */
  gullyWavelengthM: number;
  gullyOctaves: number;
  /** Amplitude ratio between successive erosion octaves. */
  gullyGain: number;
  /** How many waves a cell carries per unit of slope (the couloirs' density on a steep face). */
  slopeStrength: number;
  /** How strongly an octave's own slope turns the next octave (the branching). */
  branch: number;
  /** The erosion's share of the landform (0..1: 0 = the smooth base alone). */
  erosion: number;
  /** Concavity: the power on the normalised landform (> 1: broad floors, steep crests). */
  concavity: number;
  /** How far the landform may scale a mass: the multiplier spans [1 - contrast, 1 + contrast] around its mean of one. */
  contrast: number;
  /** Along-row smoothing (m) of the composition the landform multiplies (removes the old profile's cones). */
  smoothM: number;
}

export interface MassifField {
  settings: MassifSettings;
  /** The landform multiplier at (x, z): mean one over the annulus, within [1 - contrast, 1 + contrast]. */
  multiplier(x: number, z: number): number;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD: readonly number[] = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1];

/** 2D simplex noise with its analytic gradient (Gustavson's sdnoise2 form), seeded. Value about -1..1. */
class SimplexD {
  private readonly perm = new Uint8Array(512);
  constructor(rng: () => number) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  /** Writes the gradient to g[0], g[1]; returns the value. */
  noise(x: number, y: number, g: Float64Array): number {
    const perm = this.perm;
    const s = (x + y) * F2;
    const i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0, dx = 0, dy = 0;
    const t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const gi = (perm[ii + perm[jj]] % 12) * 2, gx = GRAD[gi], gy = GRAD[gi + 1];
      const t2 = t0 * t0, t4 = t2 * t2, d = gx * x0 + gy * y0;
      n += t4 * d; const k = -8 * t2 * t0 * d; dx += k * x0 + t4 * gx; dy += k * y0 + t4 * gy;
    }
    const t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const gi = (perm[ii + i1 + perm[jj + j1]] % 12) * 2, gx = GRAD[gi], gy = GRAD[gi + 1];
      const t2 = t1 * t1, t4 = t2 * t2, d = gx * x1 + gy * y1;
      n += t4 * d; const k = -8 * t2 * t1 * d; dx += k * x1 + t4 * gx; dy += k * y1 + t4 * gy;
    }
    const t2v = 0.5 - x2 * x2 - y2 * y2;
    if (t2v > 0) {
      const gi = (perm[ii + 1 + perm[jj + 1]] % 12) * 2, gx = GRAD[gi], gy = GRAD[gi + 1];
      const t2 = t2v * t2v, t4 = t2 * t2, d = gx * x2 + gy * y2;
      n += t4 * d; const k = -8 * t2 * t2v * d; dx += k * x2 + t4 * gx; dy += k * y2 + t4 * gy;
    }
    g[0] = dx * 70; g[1] = dy * 70;
    return n * 70;
  }
}

/** Integer hash to 0..1 for the erosion cells. */
function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);

/**
 * One erosion octave (Clay John's erosion filter): over a 4 x 4 neighbourhood of jittered cells, cosine waves whose
 * phase runs along `dir` — the slope turned 90 degrees and NOT normalised, so a steeper face carries more of them and a
 * flat floor none — blended by a Gaussian of the distance to each cell. Writes [value -1..1, d/dpx, d/dpz] (cell units).
 */
export function erosionOctave(px: number, pz: number, dirx: number, dirz: number, seed: number, out: Float64Array): void {
  const ix = Math.floor(px), iz = Math.floor(pz);
  const fx = px - ix, fz = pz - iz;
  let va = 0, gx = 0, gz = 0, wt = 0;
  for (let j = -2; j <= 1; j++) {
    for (let i = -2; i <= 1; i++) {
      const cx = ix - i, cz = iz - j;
      const ppx = fx + i - hash2(cx, cz, seed) * 0.5, ppz = fz + j - hash2(cx, cz, seed ^ 0x5bd1e995) * 0.5;
      const w = Math.exp(-(ppx * ppx + ppz * ppz) * 2);
      wt += w;
      const mag = (ppx * dirx + ppz * dirz) * 6.283185307179586;
      va += Math.cos(mag) * w;
      const sn = -Math.sin(mag) * w;
      gx += sn * dirx; gz += sn * dirz;
    }
  }
  out[0] = va / wt; out[1] = gx / wt; out[2] = gz / wt;
}

/**
 * The landform's multiplier for a mean-one value u: the cols and valleys cut linearly (down to 1 - contrast), the
 * summits rise through a soft knee (at most about 1 + contrast / 2.5) — ranges are carved down from their crest lines,
 * a summit is seldom much above the ridge it stands on, and a linear rise stood every high point as a horn.
 */
function kneeMultiplier(u: number, contrast: number): number {
  const d = u - 1;
  return 1 + contrast * (d < 0 ? Math.max(-1, d) : d / (1 + 1.5 * d));
}

/**
 * The massif field of one map: a smooth base (two simplex octaves) cut by `gullyOctaves` erosion octaves, calibrated
 * over `annulus` (the 4th / 97th percentiles map to 0 / 1), passed through the concavity power and normalised to a mean
 * of one inside [1 - contrast, 1 + contrast].
 */
export function createMassifField(seed: number, settings: MassifSettings, annulus: readonly [number, number] = [700, 1400]): MassifField {
  const s = settings;
  const rng = mulberry32(seed >>> 0);
  const noise = new SimplexD(rng);
  const o0x = rng() * 512 - 256, o0z = rng() * 512 - 256, o1x = rng() * 512 - 256, o1z = rng() * 512 - 256;
  const erosionSeed = (Math.floor(rng() * 0x7fffffff) | 1) >>> 0;
  const g = new Float64Array(2), e = new Float64Array(3);
  const bf = 1 / s.baseWavelengthM, cell = s.gullyWavelengthM;
  const landform = (x: number, z: number): number => {
    // the smooth base and its gradient (height 0..1 per metre)
    let n = noise.noise(x * bf + o0x, z * bf + o0z, g);
    let nx = g[0] * bf, nz = g[1] * bf;
    n += 0.35 * noise.noise(x * bf * 2 + o1x, z * bf * 2 + o1z, g);
    nx += 0.35 * g[0] * bf * 2; nz += 0.35 * g[1] * bf * 2;
    const h = (n / 1.35) * 0.5 + 0.5, hx = nx / 2.7, hz = nz / 2.7;
    // the erosion octaves: dir = the slope per first-octave cell, turned 90 degrees, times the slope strength, plus the
    // accumulated octaves' own slope (the branching)
    let eh = 0, ehx = 0, ehz = 0, ea = 0.5, ef = 1 / cell;
    for (let o = 0; o < s.gullyOctaves; o++) {
      const dx = (hz + ehz * s.branch) * cell * s.slopeStrength;
      const dz = -(hx + ehx * s.branch) * cell * s.slopeStrength;
      erosionOctave(x * ef, z * ef, dx, dz, (erosionSeed + Math.imul(o, 0x9e3779b9)) >>> 0, e);
      eh += e[0] * ea;
      // the octave's gradient in height per metre (its share ea of the erosion, at its own cell size)
      ehx += e[1] * ea * ef * 0.5; ehz += e[2] * ea * ef * 0.5;
      ea *= s.gullyGain; ef *= 2;
    }
    return h + (eh - 0.5) * s.erosion;
  };
  // calibration over the annulus: percentiles, then the concavity power's mean (so the multiplier averages one)
  let lo = 0, hi = 1, mean = 0.5, kneeMean = 1;
  {
    const values: number[] = [];
    const NR = 16, NA = 128;
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
      const theta = ((i + 0.5 * (j & 1)) / NA) * Math.PI * 2, r = annulus[0] + (j + 0.5) / NR * (annulus[1] - annulus[0]);
      values.push(landform(Math.cos(theta) * r, Math.sin(theta) * r));
    }
    const sorted = values.slice().sort((a, b) => a - b);
    lo = sorted[Math.floor(sorted.length * 0.04)];
    hi = sorted[Math.floor(sorted.length * 0.97)];
    let sum = 0;
    for (const v of values) sum += Math.pow(clamp((v - lo) / Math.max(1e-6, hi - lo), 0, 1.15), s.concavity);
    mean = Math.max(1e-3, sum / values.length);
    // the knee's own mean over the same samples, so the multiplier still averages one
    let kneeSum = 0;
    for (const v of values) kneeSum += kneeMultiplier(Math.pow(clamp((v - lo) / Math.max(1e-6, hi - lo), 0, 1.15), s.concavity) / mean, s.contrast);
    kneeMean = Math.max(1e-3, kneeSum / values.length);
  }
  const span = Math.max(1e-6, hi - lo);
  return {
    settings: s,
    multiplier(x, z) {
      const u = Math.pow(clamp((landform(x, z) - lo) / span, 0, 1.15), s.concavity) / mean; // mean one
      return kneeMultiplier(u, s.contrast) / kneeMean;
    },
  };
}

/** The ring grid the pass works on (maps/horizon.ts HorizonRingGeometry) plus each row's floor and whether it moves. */
export interface MassifRingInput {
  columns: number;
  rowCount: number;
  positions: Float32Array;
  heights: Float32Array;
  floors: Float32Array;
  /** Per row 0..1: how much of the pass the row takes (0 keeps it; the first ridge band ramps in). */
  weights: Float32Array;
}

/**
 * The pass: per active row, the composition (the row's relief over its floor, smoothed along the row over
 * settings.smoothM so the old profile's cones become broad masses) times the landform multiplier, blended by the row's
 * weight. Heights only, in place (positions[i * 3 + 1] too). A generator that yields every four rows, so the world
 * build can slice it (maps/horizon.ts drives it inside buildHorizonRingSteps); returns the tallest new height.
 */
export function* carveMassifRingSteps(input: MassifRingInput, field: MassifField): Generator<void, number, void> {
  const { columns: n, rowCount, positions: p, heights: h, floors, weights } = input;
  const s = field.settings;
  const comp = new Float32Array(n), tmp = new Float32Array(n);
  let maxHeight = 0, done = 0;
  for (let row = 0; row < rowCount; row++) {
    const w = weights[row];
    if (w <= 0) continue;
    const off = row * n;
    // the composition, smoothed along the row by a box filter of about smoothM (three passes ~ a Gaussian)
    const r = Math.hypot(p[off * 3], p[off * 3 + 2]);
    const radius = Math.max(0, Math.round((s.smoothM / Math.max(1, (2 * Math.PI * r) / n)) / 1.7));
    for (let k = 0; k < n; k++) comp[k] = Math.max(0, h[off + k] - floors[row]);
    for (let pass = 0; pass < 3 && radius > 0; pass++) {
      let acc = 0;
      for (let d = -radius; d <= radius; d++) acc += comp[(d + n) % n];
      for (let k = 0; k < n; k++) {
        tmp[k] = acc / (2 * radius + 1);
        acc += comp[(k + radius + 1) % n] - comp[(k - radius + n) % n];
      }
      comp.set(tmp);
    }
    for (let k = 0; k < n; k++) {
      const i = off + k;
      const carved = floors[row] + comp[k] * field.multiplier(p[i * 3], p[i * 3 + 2]);
      // below its floor a row keeps its own height (a valley the composition already cut)
      const target = h[i] < floors[row] ? h[i] : carved;
      h[i] += (target - h[i]) * w;
    }
    suppressNeedles(h, p, off, n);
    for (let k = 0; k < n; k++) {
      const i = off + k;
      p[i * 3 + 1] = h[i];
      if (h[i] > maxHeight) maxHeight = h[i];
    }
    if ((++done & 3) === 0) yield;
  }
  return maxHeight;
}

/**
 * One-column needles out of a row: a vertex standing more than one arc step (45 degrees) above BOTH neighbours comes
 * down to one arc step over the higher of them — a single 15–20 m column cannot carry a summit, it draws as a spike.
 */
export function suppressNeedles(h: Float32Array, p: Float32Array, off: number, n: number, mask?: Float32Array): void {
  for (let k = 0; k < n; k++) {
    const i = off + k, a = off + (k + n - 1) % n, b = off + (k + 1) % n;
    if (mask && mask[i] <= 0) continue;
    const arc = Math.hypot(p[b * 3] - p[a * 3], p[b * 3 + 2] - p[a * 3 + 2]) * 0.5;
    const top = Math.max(h[a], h[b]) + arc;
    if (h[i] > top && Math.min(h[i] - h[a], h[i] - h[b]) > arc) h[i] = top;
  }
}

/** Synchronous wrapper (receipts, the headless sampler). */
export function carveMassifRing(input: MassifRingInput, field: MassifField): number {
  const steps = carveMassifRingSteps(input, field);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/**
 * The tableland rings' side canyons: each active row's relief over its floor times min(1, multiplier + bias) — the
 * dendritic landform only cuts down, so the table caps it misses keep their level. Generator like the carve above.
 */
export function* cutMassifCanyonsSteps(input: MassifRingInput, field: MassifField, bias: number): Generator<void, void, void> {
  const { columns: n, rowCount, positions: p, heights: h, floors, weights } = input;
  let done = 0;
  for (let row = 0; row < rowCount; row++) {
    const w = weights[row];
    if (w <= 0) continue;
    for (let k = 0; k < n; k++) {
      const i = row * n + k;
      if (h[i] <= floors[row]) continue;
      const m = Math.min(1, field.multiplier(p[i * 3], p[i * 3 + 2]) + bias);
      if (m >= 1) continue;
      h[i] += (floors[row] + (h[i] - floors[row]) * m - h[i]) * w;
      p[i * 3 + 1] = h[i];
    }
    if ((++done & 3) === 0) yield;
  }
}
