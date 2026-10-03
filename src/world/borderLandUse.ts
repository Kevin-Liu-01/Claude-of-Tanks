// The map-borders lane (2026-10-03, the coordinator's decision: "one field system on both sides of the edge"): on a map
// with a land-use profile (the ground lane's landUse.ts — a grid of blocks along the map's heading, each cut into fields,
// with tracks along the long boundaries, hedges on some short ones, and a region's boundary: a grass margin, a polder's
// water ditch, a paddy's bund or a karst field's dry stone wall), the land past the edge is that same grid. The terrain
// material draws its crops and tracks there as it does inside the square; this module traces the grid's hedged
// boundaries (and on a walled region every boundary) past the edge as polylines for borderHedgerows.ts, from the
// grid's own point query (landUseAt): a scan across the band finds where a boundary is crossed, and each crossing is
// followed along its boundary in 8 m steps, re-centred on the boundary at every step.

/** The land-use sample this module reads (landUse.ts LandFieldSample, structurally). */
export interface LandUseSampleLike {
  active: number;
  hedge: number;
  edgeM: number;
  boundary: number;
}

/** The land-use grid this module follows: its point query and its layout (landUse.ts LandUseProfile's own numbers). */
export interface BorderLandUse {
  /** landUseAt(profile, x, z, out) bound to the map's profile. */
  at(x: number, z: number, out: LandUseSampleLike): LandUseSampleLike;
  /** A fresh sample (landUse.ts createLandFieldSample). */
  sample(): LandUseSampleLike;
  /** The grid's heading (rad), its block size along and across it (m) and its boundary (0 margin, 1 ditch, 2 bund, 3 wall). */
  heading: number;
  blockU: number;
  blockV: number;
  boundary: number;
}

/** A traced boundary stretch: world points ~8 m apart, each with the presence 0..1 (the caller's fades applied). */
export interface LandUseLine { xs: number[]; zs: number[]; w: number[] }

const STEP_M = 8;
const SCAN_STEP_M = 3;
const CENTRE_SEARCH_M = 5;
const CENTRE_RES_M = 0.5;
const VISIT_CELL_M = 6;

/**
 * The boundaries past the edge to stand a bush line or a wall on: on a walled region (boundary 3) every boundary
 * (the walls enclose each field), elsewhere the short boundaries whose hedge is on. `maxOut` bounds the band past the
 * edge (from 20 m); `keep(x, z)` excludes the ranges' hand-over, the sea and a railway's right of way; `presenceAt`
 * folds in the caller's fades (the edge, the woods).
 */
export function traceLandUseLines(
  landUse: BorderLandUse, edge: number, maxOut: number,
  keep: (x: number, z: number) => boolean, presenceAt: (x: number, z: number) => number,
): LandUseLine[] {
  const walls = landUse.boundary > 2.5;
  const s = landUse.sample();
  const ux = Math.cos(landUse.heading), uz = Math.sin(landUse.heading), vx = -uz, vz = ux;
  const R = edge + maxOut, span = R * Math.SQRT2 + 20;
  const visited = new Set<number>();
  const cellKey = (x: number, z: number): number => (Math.floor(x / VISIT_CELL_M) + 4096) * 8192 + (Math.floor(z / VISIT_CELL_M) + 4096);
  const inBand = (x: number, z: number): boolean => {
    const out = Math.max(Math.abs(x), Math.abs(z)) - edge;
    return out >= 20 && out <= maxOut && keep(x, z);
  };
  // the boundary predicate: on a hedged short boundary (or any boundary of a walled region)
  const on = (x: number, z: number): boolean => {
    landUse.at(x, z, s);
    if (!(s.active > 0)) return false;
    return walls ? s.edgeM < 1.0 : s.hedge > 0.5;
  };
  // the centre of the boundary near (x, z) across the direction (ax, az): the middle of the run where the predicate
  // holds within ±CENTRE_SEARCH_M, or null
  const centre = (x: number, z: number, ax: number, az: number): [number, number] | null => {
    let first = Number.NaN, last = Number.NaN;
    for (let t = -CENTRE_SEARCH_M; t <= CENTRE_SEARCH_M; t += CENTRE_RES_M) {
      if (on(x + ax * t, z + az * t)) { if (Number.isNaN(first)) first = t; last = t; }
      else if (!Number.isNaN(first)) break;
    }
    if (Number.isNaN(first)) return null;
    const t = (first + last) * 0.5;
    return [x + ax * t, z + az * t];
  };
  const lines: LandUseLine[] = [];
  // two passes: crossing the short boundaries (scanning along the heading, following them across it), and on a walled
  // region crossing the long ones too (scanning across the heading, following them along it)
  const passes: [number, number, number, number, number][] = [[ux, uz, vx, vz, landUse.blockV / 3]];
  if (walls) passes.push([vx, vz, ux, uz, landUse.blockU / 3]);
  for (const [sx, sz, fx, fz, lineGap] of passes) {
    const gap = Math.max(10, lineGap);
    for (let o = -span; o <= span; o += gap) {
      let wasOn = false;
      for (let t = -span; t <= span; t += SCAN_STEP_M) {
        const x = fx * o + sx * t, z = fz * o + sz * t;
        if (!inBand(x, z)) { wasOn = false; continue; }
        const now = on(x, z);
        if (now && !wasOn && !visited.has(cellKey(x, z))) {
          const seed = centre(x, z, sx, sz);
          if (seed) {
            const line = follow(seed, fx, fz, sx, sz);
            if (line.xs.length >= 2) lines.push(line);
          }
        }
        wasOn = now;
      }
    }
  }
  return lines;

  /** Follow a boundary from `seed` both ways along (fx, fz), re-centring across (sx, sz) at every step. */
  function follow(seed: [number, number], fx: number, fz: number, sx: number, sz: number): LandUseLine {
    const back: [number, number][] = [], fwd: [number, number][] = [seed];
    for (const dir of [1, -1]) {
      const pts = dir > 0 ? fwd : back;
      let [x, z] = seed;
      for (let i = 0; i < 400; i++) {
        const next = centre(x + fx * STEP_M * dir, z + fz * STEP_M * dir, sx, sz);
        if (!next || !inBand(next[0], next[1])) break;
        const key = cellKey(next[0], next[1]);
        if (visited.has(key)) break;
        visited.add(key);
        pts.push(next);
        [x, z] = next;
      }
    }
    visited.add(cellKey(seed[0], seed[1]));
    const pts = back.reverse().concat(fwd);
    return { xs: pts.map((p) => p[0]), zs: pts.map((p) => p[1]), w: pts.map((p) => presenceAt(p[0], p[1])) };
  }
}
