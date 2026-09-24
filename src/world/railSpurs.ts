// src/world/railSpurs.ts — authored rail spurs (round 57, 2026-09-24). A map lays a siding as a centreline path
// in its terrain config (`terrain.railSpurs`); the layout carries it to the set-dressing kit, which lays ballast,
// rails, sleepers and buffer stops that follow the ground along the path (maps/mapKits.ts, the same track the rail
// yards run), and the height field keeps vegetation and scattered props out of the track's berth through the
// `_noVeg` exclusion the hardstand aprons use. Renderer-free: the path resampler and the distance math are shared
// by terrain.ts, the kit and the receipts. Soft dressing by contract — a hull rolls over the 0.2 m bed like a curb
// and no collision record is published.

export interface RailSpurConfig {
  /**
   * Centreline in metres, two or more points. The kit lays straight spans of at most RAIL_SPUR_SPAN_M between
   * consecutive points; a corner sharper than a few degrees shows as a kink in the rails, so a curve is authored as
   * intermediate points.
   */
  path: readonly (readonly [number, number])[];
  /** Rail centre spacing; omitted = RAIL_SPUR_GAUGE_M (the yards' ±0.72 m). */
  gauge?: number;
  /** Ballast slab width; omitted = RAIL_SPUR_BALLAST_M. */
  ballast?: number;
  /** Buffer stops: 'end' closes the last point of the path, 'both' closes both ends; omitted leaves the ends open. */
  bufferStop?: 'end' | 'both';
}

interface RailSpan {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** The rail yards' span: their graded ground is flat enough for 10 m slabs (their lines are pinned byte-identical). */
export const RAIL_SPUR_SPAN_M = 10;
/**
 * An authored spur's span across a plain: a rigid slab misses the ground's folds by their sagitta over the span
 * (Tarkhan's loading face, worst slab corner against the ground: 0.23 m with 10 m spans and the yards' two-sample
 * lay, 0.16 m with 5 m under the kit's least-squares lay, 0.13 m with 4 m — and no better with 3 m, where the
 * cross-track curvature no plane can follow is what remains; the deep slab of the 'full' lay hides that).
 */
export const RAIL_SPUR_LAY_M = 4;
export const RAIL_SPUR_GAUGE_M = 1.44;
export const RAIL_SPUR_BALLAST_M = 3.0;
/** Vegetation and scattered props keep this far from the centreline: the slab's half-width plus 2.1 m of shoulder. */
export const RAIL_SPUR_BERTH_M = 3.6;

/** Horizontal run of a span. Exact for an axis-aligned span (the rail yards' fixed lines stay byte-identical). */
export function railRunLength(dx: number, dz: number): number {
  return dx === 0 ? Math.abs(dz) : dz === 0 ? Math.abs(dx) : Math.hypot(dx, dz);
}

/**
 * Straight spans along a path: every edge is split into round(run / spanM) spans, at least one. By default the
 * spans are spanM long with the remainder in the last one — the rail yards' own segmentation rule, so a two-point
 * path lays exactly the spans the fixed yard lines always did; `even` shares the run equally instead (an authored
 * spur whose run is not a multiple of the span gets no stub slab at its end).
 */
export function resampleRailPath(
  path: RailSpurConfig['path'], spanM = RAIL_SPUR_SPAN_M, even = false,
): RailSpan[] {
  const spans: RailSpan[] = [];
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const dx = bx - ax, dz = bz - az;
    const run = railRunLength(dx, dz);
    if (!(run > 0)) continue;
    const ux = dx / run, uz = dz / run;
    const count = Math.max(1, Math.round(run / spanM));
    const step = even ? run / count : spanM;
    for (let k = 0; k < count; k++) {
      const tA = k * step, tB = even && k === count - 1 ? run : Math.min(run, tA + step);
      spans.push({ ax: ax + ux * tA, az: az + uz * tA, bx: ax + ux * tB, bz: az + uz * tB });
    }
  }
  return spans;
}

function squaredDistanceToEdge(
  x: number, z: number, ax: number, az: number, dx: number, dz: number, l2: number,
): number {
  let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - x, ez = az + dz * t - z;
  return ex * ex + ez * ez;
}

/** Distance from (x, z) to the nearest spur centreline; Infinity without spurs. */
export function railSpurDistance(spurs: readonly RailSpurConfig[], x: number, z: number): number {
  let best = Infinity;
  for (const spur of spurs) {
    const path = spur.path;
    for (let i = 1; i < path.length; i++) {
      const ax = path[i - 1][0], az = path[i - 1][1];
      const dx = path[i][0] - ax, dz = path[i][1] - az;
      const d2 = squaredDistanceToEdge(x, z, ax, az, dx, dz, dx * dx + dz * dz);
      if (d2 < best) best = d2;
    }
  }
  return Math.sqrt(best);
}

/**
 * The track's berth as a height-field exclusion: true within `berth` metres of any spur centreline (the buffer
 * stops sit inside the end discs). Allocation-free per query; null when the map authors no spur, so every other
 * map's `_noVeg` stays the same function it was.
 */
export function createRailSpurExclusion(
  spurs: readonly RailSpurConfig[] | undefined, berth = RAIL_SPUR_BERTH_M,
): ((x: number, z: number) => boolean) | null {
  if (!spurs?.length) return null;
  const edges: number[] = [];
  for (const spur of spurs) {
    const path = spur.path;
    for (let i = 1; i < path.length; i++) {
      const ax = path[i - 1][0], az = path[i - 1][1];
      const dx = path[i][0] - ax, dz = path[i][1] - az;
      edges.push(ax, az, dx, dz, dx * dx + dz * dz);
    }
  }
  if (edges.length === 0) return null;
  const packed = Float64Array.from(edges), berth2 = berth * berth;
  return (x, z) => {
    for (let at = 0; at < packed.length; at += 5) {
      if (squaredDistanceToEdge(x, z, packed[at], packed[at + 1], packed[at + 2], packed[at + 3], packed[at + 4])
        <= berth2) return true;
    }
    return false;
  };
}
