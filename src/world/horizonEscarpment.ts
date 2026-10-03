// src/world/horizonEscarpment.ts — the mountains lane of the p2 redesign (2026-10-02; owner: "clouds are the bar;
// mountains, horizons and terrain must match"). LAYERED ESCARPMENTS for the tableland rings: the cliff-and-slope
// stairs of flat-lying strata. Pure and deterministic from the map seed, Node-runnable (no DOM), run once per ring at
// world construction — no per-frame work, no draw call, no triangle (heights only: every vertex keeps its radius and
// angle).
//
// Why: the mesa stack's tables rose on one smooth ramp from the valley floor to the cap (the round-47 supported
// approach at 1.25:1, 1.8:1 for the far escarpment), so every wall was one plain sheet — "flat vertical cliffs with no
// layered escarpments, talus aprons or buttresses" (Copper Mesa, Sirocco Wadi, Titan Gorge, Skybridge). Plateau country
// erodes by its beds: a resistant bed (sandstone, limestone, a lava flow) stands as a cliff, the weak bed under it
// (shale, mudstone, ash) weathers back to a slope buried in the talus that falls from the cliff above, and the next
// resistant bed makes the next cliff — a stair of cliffs and talus benches whose edges follow the beds around every
// spur. The caprock at the top makes the sharp rim; the foot of each cliff is a concave talus apron.
//
// The pass maps each height through a stair transfer in world height: beds of seeded thickness (world-anchored, so a
// bed keeps its level round the whole ring, with a slight seeded dip), each split into a talus slope (a concave ramp,
// steepening toward the cliff foot) and a cliff (the rest of the bed's rise over a small share of its input range).
// Because the transfer is monotone in height it never moves a contour in plan: the cliff lines follow the landform's
// own meanders, so every buttress and alcove of the tables carries its tiers round. A plan meander (a seeded field in
// metres of height) is added first, so straight table edges break into buttresses and embayments; the beds' cliff
// share wanders slowly round the ring, so a cliff pinches out into a slope here and thickens there.

export interface EscarpmentSettings {
  /** Bed thickness range (m): each bed is one cliff over one talus slope. */
  bedM: readonly [number, number];
  /** Share of a bed's input height range that rises as cliff (its range round the ring). */
  cliffShare: readonly [number, number];
  /** Share of a bed's rise the talus slope takes (the rest is cliff). */
  talusRise: number;
  /** Concavity of the talus slope (> 1: it steepens toward the cliff foot). */
  talusCurve: number;
  /** Bed dip (m of level change per km) along a seeded azimuth. */
  dipPerKm: number;
  /** Plan meander amplitude (m of height) and wavelength (m): buttresses and embayments along the table edges. */
  meanderM: number;
  meanderWavelengthM: number;
}

export interface EscarpmentRingInput {
  columns: number;
  rowCount: number;
  positions: Float32Array;
  heights: Float32Array;
  /** Per row: the valley floor under the tables (m) — heights below it are left alone — and the row's weight 0..1. */
  floors: Float32Array;
  weights: Float32Array;
  /** Optional per-vertex weight 0..1 at (x, z) (the seam band past the playable edge keeps the continued ground). */
  weightAt?: (x: number, z: number) => number;
}

import { suppressNeedles } from './horizonMassif.ts';

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);

/** Smooth hashed value noise (-1..1) on a unit lattice, for the meander and the cliff-share wander. */
function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const h = (i: number, j: number): number => {
    let v = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ seed;
    v = Math.imul(v ^ (v >>> 15), 0x85ebca6b); v = Math.imul(v ^ (v >>> 13), 0xc2b2ae35);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  };
  const a = h(ix, iz), b = h(ix + 1, iz), c = h(ix, iz + 1), d = h(ix + 1, iz + 1);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}

export interface EscarpmentField {
  settings: EscarpmentSettings;
  /** The stepped height for an input height at (x, z), above `floor`; `slopeWeight` (0..1) scales the plan meander
   * (nil on a flat cap or floor, so a cap stays one level and only the cliff lines wander). */
  apply(x: number, z: number, height: number, floor: number, slopeWeight?: number): number;
  /** The bed tops (m, before the dip) for the receipts. */
  beds: Float64Array;
}

/** The beds of one map: a seeded stack from 200 m under the datum to 900 m over it. */
export function createEscarpmentField(seed: number, settings: EscarpmentSettings): EscarpmentField {
  const s = settings;
  const rng = mulberry32(seed >>> 0);
  const tops: number[] = [];
  let z = -200 - rng() * s.bedM[1];
  while (z < 900) { tops.push(z); z += s.bedM[0] + rng() * (s.bedM[1] - s.bedM[0]); }
  tops.push(z);
  const beds = Float64Array.from(tops);
  const dipAz = rng() * Math.PI * 2, dipX = Math.cos(dipAz) * s.dipPerKm / 1000, dipZ = Math.sin(dipAz) * s.dipPerKm / 1000;
  const meanderSeed = (Math.floor(rng() * 0x7fffffff) | 1) >>> 0, shareSeed = (Math.floor(rng() * 0x7fffffff) | 1) >>> 0;
  const mf = 1 / s.meanderWavelengthM;
  return {
    settings: s,
    beds,
    apply(x, zz, height, floor, slopeWeight = 1) {
      // the plan meander: buttresses and embayments (only above the floor, fading in over the first 12 m)
      const above = height - floor;
      if (above <= 0) return height;
      const meander = (valueNoise(x * mf, zz * mf, meanderSeed) * 0.7 + valueNoise(x * mf * 2.3, zz * mf * 2.3, meanderSeed ^ 0x2545f491) * 0.3)
        * s.meanderM * clamp(above / 12, 0, 1) * slopeWeight;
      const h = height + meander;
      // the bed this height falls in (beds are world-level, dipping slightly)
      const dip = x * dipX + zz * dipZ;
      const level = h - dip;
      let lo = 0, hi = beds.length - 1;
      if (level <= beds[0] || level >= beds[hi]) return h;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (beds[mid] <= level) lo = mid; else hi = mid; }
      const b0 = beds[lo], b1 = beds[lo + 1], t = (level - b0) / (b1 - b0);
      // this bed's cliff share wanders slowly round the ring (a cliff pinches out into a slope, or thickens)
      const wander = valueNoise(x / 700 + lo * 3.7, zz / 700 - lo * 1.3, shareSeed) * 0.5 + 0.5;
      const cliff = s.cliffShare[0] + (s.cliffShare[1] - s.cliffShare[0]) * wander;
      const footT = 1 - cliff;
      let out: number;
      if (t < footT) {
        // the talus slope: a concave ramp that steepens toward the cliff foot
        const u = t / footT;
        out = s.talusRise * (u + (Math.pow(u, s.talusCurve) - u) * 0.6);
      } else {
        // the cliff: the rest of the bed's rise, its top a sharp caprock rim
        out = s.talusRise + (1 - s.talusRise) * ((t - footT) / cliff);
      }
      // never below the floor the tables stand on
      return Math.max(floor, b0 + (b1 - b0) * out + dip);
    },
  };
}

/**
 * The pass over the ring grid (a generator that yields between its stages and every eight rows; the side canyons are
 * cut before the rows are refined, horizonMassif.ts cutMassifCanyonsSteps): (1) the plan meander, by the local slope;
 * (2) every height through the bed stair; (3) the talus aprons — a fill at the foot of the cliffs, `talusFill` of the way from the floor
 * to the neighbourhood's mean height (about 70 m round each vertex), wherever the stair left the ground lower.
 * (4) bounds every face at `maxSlope` (3.6:1, 74 degrees) between rows and between columns.
 * Each step is blended by the row's weight and the per-vertex weight. Heights only, in place (positions too).
 * Returns the tallest new height.
 */
export function* carveEscarpmentRingSteps(input: EscarpmentRingInput, field: EscarpmentField, options: {
  talusFill?: number; maxSlope?: number;
} = {}): Generator<void, number, void> {
  const { columns: n, rowCount, positions: p, heights: h, floors, weights, weightAt } = input;
  const weight = new Float32Array(n * rowCount);
  for (let row = 0; row < rowCount; row++) {
    const wr = weights[row];
    if (wr <= 0) continue;
    for (let k = 0; k < n; k++) {
      const i = row * n + k;
      weight[i] = weightAt ? wr * weightAt(p[i * 3], p[i * 3 + 2]) : wr;
    }
  }
  // (1) + (2): the meander follows the input's own slope (central differences on the grid) so caps and floors keep one level
  const src = Float32Array.from(h);
  const rOf0 = (i: number): number => Math.hypot(p[i * 3], p[i * 3 + 2]);
  for (let i = 0; i < n * rowCount; i++) {
    const w = weight[i];
    if (w <= 0) continue;
    const row = (i / n) | 0, k = i - row * n, x = p[i * 3], z = p[i * 3 + 2];
    // the smaller one-sided slope each way: a vertex on the rim of a flat cap or at the foot of a wall has a flat side
    // and takes no meander (the cap keeps its one level); a vertex inside a face is steep on both sides
    const km = row * n + (k + n - 1) % n, kp = row * n + (k + 1) % n;
    const sideA = (dA: number, dB: number): number => (dA * dB > 0 ? Math.min(Math.abs(dA), Math.abs(dB)) : 0);
    const arcM = Math.max(1, Math.hypot(p[i * 3] - p[km * 3], p[i * 3 + 2] - p[km * 3 + 2]));
    const arcP = Math.max(1, Math.hypot(p[kp * 3] - p[i * 3], p[kp * 3 + 2] - p[i * 3 + 2]));
    const along = sideA((src[i] - src[km]) / arcM, (src[kp] - src[i]) / arcP);
    const im = row > 0 ? i - n : i, ip = row < rowCount - 1 ? i + n : i;
    const radial = sideA((src[i] - src[im]) / Math.max(1, rOf0(i) - rOf0(im)), (src[ip] - src[i]) / Math.max(1, rOf0(ip) - rOf0(i)));
    const slope = Math.max(along, radial);
    const stepped = field.apply(x, z, h[i], floors[row], clamp((slope - 0.08) / 0.3, 0, 1));
    h[i] += (stepped - h[i]) * w;
    if (k === n - 1 && (row & 7) === 7) yield;
  }
  yield;
  // (3) the talus aprons: a separable box mean of about 70 m (columns by their arc, rows by their radial spacing)
  const fill = options.talusFill ?? 0;
  if (fill > 0) {
    const mean = new Float32Array(n * rowCount), tmp = new Float32Array(n * rowCount);
    for (let row = 0; row < rowCount; row++) {
      const r = Math.hypot(p[row * n * 3], p[row * n * 3 + 2]);
      const kr = Math.max(1, Math.round(70 / Math.max(1, (2 * Math.PI * r) / n)));
      for (let k = 0; k < n; k++) {
        let acc = 0;
        for (let d = -kr; d <= kr; d++) acc += h[row * n + (k + d + n) % n];
        tmp[row * n + k] = acc / (2 * kr + 1);
      }
    }
    for (let row = 0; row < rowCount; row++) {
      for (let k = 0; k < n; k++) {
        const i = row * n + k, r0 = Math.hypot(p[i * 3], p[i * 3 + 2]);
        let acc = 0, cnt = 0;
        for (let rr = row; rr >= 0; rr--) { const j = rr * n + k; if (r0 - Math.hypot(p[j * 3], p[j * 3 + 2]) > 70) break; acc += tmp[j]; cnt++; }
        for (let rr = row + 1; rr < rowCount; rr++) { const j = rr * n + k; if (Math.hypot(p[j * 3], p[j * 3 + 2]) - r0 > 70) break; acc += tmp[j]; cnt++; }
        mean[i] = acc / Math.max(1, cnt);
      }
    }
    for (let i = 0; i < n * rowCount; i++) {
      const w = weight[i];
      if (w <= 0) continue;
      const row = (i / n) | 0;
      const apron = floors[row] + Math.max(0, mean[i] - floors[row]) * fill;
      if (apron > h[i]) h[i] += (apron - h[i]) * w;
    }
  }
  // (4) the cliffs' bound: no face between two rows (or two columns) steeper than `maxSlope` — a cliff, never a vertical
  // sheet of stretched triangles (forward then backward per column over the active rows, then round each row)
  const maxSlope = options.maxSlope ?? 3.6;
  const rOf = (i: number): number => Math.hypot(p[i * 3], p[i * 3 + 2]);
  // every bound is enforced by LOWERING the higher vertex of a pair (never raising the lower), so the three laws — the
  // radial cliff bound, the same bound along each row, no one-column needle — only ever take height away and settle
  // together in a few rounds (a raise to satisfy one law could stand a new needle for another)
  const lowerTo = (i: number, j: number, gap: number): void => {
    const lim = maxSlope * Math.max(1, gap);
    if (h[i] > h[j] + lim) h[i] = h[j] + lim;
  };
  for (let round = 0; round < 4; round++) {
    for (let k = 0; k < n; k++) {
      for (let row = 1; row < rowCount; row++) {
        const i = row * n + k, j = i - n;
        if (weight[i] > 0) lowerTo(i, j, rOf(i) - rOf(j));
      }
      for (let row = rowCount - 2; row >= 0; row--) {
        const i = row * n + k, j = i + n;
        if (weight[i] > 0) lowerTo(i, j, rOf(j) - rOf(i));
      }
    }
    for (let row = 0; row < rowCount; row++) {
      const off = row * n;
      for (let k = 0; k < n; k++) {
        const i = off + k, j = off + (k + n - 1) % n;
        if (weight[i] > 0) lowerTo(i, j, Math.hypot(p[i * 3] - p[j * 3], p[i * 3 + 2] - p[j * 3 + 2]));
      }
      for (let k = n - 1; k >= 0; k--) {
        const i = off + k, j = off + (k + 1) % n;
        if (weight[i] > 0) lowerTo(i, j, Math.hypot(p[i * 3] - p[j * 3], p[i * 3 + 2] - p[j * 3 + 2]));
      }
      if (weights[row] > 0) suppressNeedles(h, p, off, n, weight);
    }
    if (round === 1) yield;
  }
  let maxHeight = 0;
  for (let i = 0; i < n * rowCount; i++) {
    p[i * 3 + 1] = h[i];
    if (weight[i] > 0 && h[i] > maxHeight) maxHeight = h[i];
  }
  return maxHeight;
}

/** Synchronous wrapper (receipts, the headless sampler). */
export function carveEscarpmentRing(input: EscarpmentRingInput, field: EscarpmentField, options: { talusFill?: number; maxSlope?: number } = {}): number {
  const steps = carveEscarpmentRingSteps(input, field, options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/**
 * The caprock of a far tableland: a grey-scale opening along one closed row (a running minimum, then a running maximum,
 * over `half` columns either side). A summit narrower than the window comes down to the shoulder it stands on and stays
 * flat there, a table wider than the window keeps its own outline, and nothing rises — the far skyline of mesas and
 * buttes rather than stepped pyramids. `scratch` holds `n` values and is overwritten.
 */
export function openRowTables(heights: Float32Array, off: number, n: number, half: number, scratch: Float32Array): void {
  for (let k = 0; k < n; k++) {
    let lo = Infinity;
    for (let d = -half; d <= half; d++) lo = Math.min(lo, heights[off + (k + d + n) % n]);
    scratch[k] = lo;
  }
  for (let k = 0; k < n; k++) {
    let hi = -Infinity;
    for (let d = -half; d <= half; d++) hi = Math.max(hi, scratch[(k + d + n) % n]);
    heights[off + k] = hi;
  }
}
