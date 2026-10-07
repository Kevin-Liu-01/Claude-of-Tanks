// The map-revival lane (2026-10-06, Skybridge round 3; gauntlet wave 133: "smooth grey-mauve peaks", "a sharp central
// pyramid ... rather than flat-topped bedded sandstone mesas"): the tableland ring's outer ranges capped. The mesa stack
// caps its near tables and its escarpment (horizon.ts reshapeFiniteTableCaps), but its saddle, summits and shoulder
// stood over them as domes and spires. Past `fromRadiusM` every vertex comes down to its massif's cap: a level that
// wanders round the ring (by `vary`) in whole strata (`stepM`), so the far skyline is flat-topped mesas at a few heights
// with cliffs between them — Kaiparowits and the Straight Cliffs rather than the Alps. Opt-in per map
// (horizon.summitCap), heights only and lowering only; the cut then settles by the bed stair's laws
// (settleHorizonCut, shared with the dam's canyon).
import { suppressNeedles } from './horizonMassif.ts';

export interface HorizonSummitCapSettings {
  /** The caps' mean level (m). */
  levelM: number;
  /** The caps begin here (m from the centre), blended in over 120 m. */
  fromRadiusM: number;
  /** How far the level wanders round the ring (a share of it, default 0.15). */
  vary?: number;
  /** The caps stand at whole strata of this thickness (m, default 25), so neighbouring mesas differ by a cliff. */
  stepM?: number;
}

/** The tableland stair's cliff bound (horizonEscarpment.ts). */
const MAX_SLOPE = 3.6;

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * A cut settles as the bed stair settles its own: a column the cut left standing alone between lower neighbours draws
 * as a spike, so it comes down to one arc step over the higher of them, and the 3.6:1 radial cliff bound holds — each
 * law by lowering the higher vertex, over the masked vertices (the cut and its neighbours), in a few rounds.
 */
export function settleHorizonCut(h: Float32Array, p: Float32Array, columns: number, mask: Float32Array): void {
  const n = columns, rowCount = h.length / n;
  const rOf = (i: number): number => Math.hypot(p[i * 3], p[i * 3 + 2]);
  const lowerTo = (i: number, j: number): void => {
    const lim = MAX_SLOPE * Math.max(1, Math.abs(rOf(i) - rOf(j)));
    if (h[i] > h[j] + lim) { h[i] = h[j] + lim; mask[i] = 1; }
  };
  for (let round = 0; round < 3; round++) {
    for (let row = 0; row < rowCount; row++) suppressNeedles(h, p, row * n, n, mask);
    for (let row = 1; row < rowCount; row++) {
      for (let k = 0; k < n; k++) {
        const i = row * n + k, j = i - n;
        if (mask[i] > 0 || mask[j] > 0) { lowerTo(i, j); lowerTo(j, i); }
      }
    }
  }
}

/** Mark a lowered vertex and its four neighbours for the settling. */
export function markHorizonCut(mask: Float32Array, i: number, columns: number): void {
  const n = columns, rowCount = mask.length / n, row = (i / n) | 0, k = i % n;
  mask[i] = 1;
  mask[row * n + (k + 1) % n] = 1;
  mask[row * n + (k + n - 1) % n] = 1;
  if (row > 0) mask[i - n] = 1;
  if (row < rowCount - 1) mask[i + n] = 1;
}

/** Cap the ring's outer ranges into mesas (heights only; a vertex is only ever lowered). */
export function capHorizonSummits(
  ring: { positions: Float32Array; heights: Float32Array; maxHeight: number }, settings: HorizonSummitCapSettings,
  seed: number, columns: number,
): void {
  const h = ring.heights, p = ring.positions;
  const random = mulberry32(seed);
  const phases = [random(), random(), random()].map((v) => v * Math.PI * 2);
  const vary = settings.vary ?? 0.15, step = settings.stepM ?? 25;
  // the massifs' levels round the ring: three octaves of the azimuth, in [-1, 1]
  const wander = (a: number): number => 0.6 * Math.sin(3 * a + phases[0]) + 0.3 * Math.sin(7 * a + phases[1])
    + 0.1 * Math.sin(13 * a + phases[2]);
  const mask = new Float32Array(h.length);
  let cut = false;
  for (let i = 0; i < h.length; i++) {
    const x = p[i * 3], z = p[i * 3 + 2];
    const w = smoothstep(settings.fromRadiusM - 60, settings.fromRadiusM + 60, Math.hypot(x, z));
    if (w <= 0) continue;
    let cap = settings.levelM * (1 + vary * wander(Math.atan2(z, x)));
    if (step > 0) cap = Math.round(cap / step) * step;
    if (!(h[i] > cap)) continue;
    h[i] -= w * (h[i] - cap);
    markHorizonCut(mask, i, columns);
    cut = true;
  }
  if (!cut) return;
  settleHorizonCut(h, p, columns, mask);
  ring.maxHeight = 1;
  for (let i = 0; i < h.length; i++) {
    p[i * 3 + 1] = h[i];
    ring.maxHeight = Math.max(ring.maxHeight, h[i]);
  }
}
