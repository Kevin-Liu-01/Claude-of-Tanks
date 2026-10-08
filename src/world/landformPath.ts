// src/world/landformPath.ts — a ridge's curved axis (the map-revival lane, 2026-10-08, Skybridge round 6; gauntlet wave
// 259 on round 5's reservoir arm: "a ruler-straight ... trench", "a stadium-shaped swimming pool", "no side-canyon bends").
//
// Glen Canyon's side canyons are drowned meanders: the river's bends cut into the sandstone and the lake filling them
// wall to wall. A ridge may now follow a path instead of its bearing: its control points are the polygon of a clamped
// uniform cubic B-spline — the curve starts at the first point and ends at the last, leaving and arriving along the
// first and last legs, and rounds every corner between (a meander's bends, never an interpolating spline's kinks) —
// sampled every STEP_M, and a point's ridge frame is (lx, lz) = (its arc station from the curve's
// middle, its signed distance from the curve: positive on the left of the direction of travel, a straight ridge's +z
// side). Past either end the frame runs on straight along the end's tangent, so a nose, a cliff end or a taper ends a
// curved ridge as it ends a bar, and a two-point path is exactly the straight ridge between its points. Every term the
// ridge's geology reads in its frame (the outline's lobes, the rills, the strata's dip, the roughness) follows the bends.
//
// A query reads only the few segments that can be nearest anywhere in its cell: a uniform grid over the path's reach,
// each cell keeping the segments whose nearest distance to the cell is within the cell's best farthest distance. Pure
// and deterministic; it allocates nothing per query. The curve's radius should exceed the reach on the inside of every
// bend (prepareLandformPath reports the tightest), or the frame folds there.

/** The prepared path a ridge's frame reads (prepareLandformPath). */
export interface PreparedLandformPath {
  /** The curve's dense points and each one's arc station (m). */
  xs: Float64Array;
  zs: Float64Array;
  s: Float64Array;
  /** The curve's length (m), the centre of its bounds and the bounds' half-diagonal (m). */
  length: number;
  cx: number;
  cz: number;
  halfDiagonal: number;
  /** How far from the curve a query is answered (m): beyond, the frame is not read. */
  reach: number;
  /** The tightest radius of curvature along the curve (m), for the authoring check. */
  minRadius: number;
  /** The grid: origin, cell size, cells across, each cell's run of candidate segments in `items`. */
  gx: number;
  gz: number;
  cell: number;
  nx: number;
  nz: number;
  start: Int32Array;
  items: Int32Array;
}

/** A point's ridge frame on a path. */
export interface LandformPathFrame {
  lx: number;
  lz: number;
}

const STEP_M = 2;
const CELL_M = 8;

/** A uniform cubic B-spline segment over four control points, at t in [0, 1]. */
function bspline(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], t: number, out: number[]): void {
  const u = 1 - t, t2 = t * t, t3 = t2 * t;
  const wa = u * u * u / 6, wb = (3 * t3 - 6 * t2 + 4) / 6, wc = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, wd = t3 / 6;
  out[0] = wa * a[0] + wb * b[0] + wc * c[0] + wd * d[0];
  out[1] = wa * a[1] + wb * b[1] + wc * c[1] + wd * d[1];
}

/** The squared distance from (px, pz) to the segment (ax, az)-(bx, bz). */
function segmentDistance2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - px, ez = az + dz * t - pz;
  return ex * ex + ez * ez;
}

/**
 * Prepare a path from its control points (at least two, in metres; the curve passes through each) for frames out to
 * `reach` metres from it.
 */
const prepared = new WeakMap<object, Map<number, PreparedLandformPath>>();

export function prepareLandformPath(control: ReadonlyArray<readonly [number, number]>, reach: number): PreparedLandformPath {
  // (a map's path is a static array: every layout of it reads the one preparation)
  const cached = prepared.get(control)?.get(reach);
  if (cached) return cached;
  const built = preparePath(control, reach);
  let byReach = prepared.get(control);
  if (!byReach) { byReach = new Map(); prepared.set(control, byReach); }
  byReach.set(reach, built);
  return built;
}

function preparePath(control: ReadonlyArray<readonly [number, number]>, reach: number): PreparedLandformPath {
  if (control.length < 2) throw new Error('A landform path needs two control points or more');
  for (const p of control) if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) throw new Error('A landform path point is not finite');
  // the dense curve: a straight two-point path stays exactly its segment
  const pts: number[][] = [];
  if (control.length === 2) {
    pts.push([control[0][0], control[0][1]], [control[1][0], control[1][1]]);
  } else {
    // the clamped polygon: the end points tripled, so the curve starts and ends on them along the end legs
    const q: (readonly [number, number])[] = [control[0], control[0], ...control, control[control.length - 1], control[control.length - 1]];
    const p: number[] = [0, 0];
    for (let i = 0; i + 3 < q.length; i++) {
      const span = Math.hypot(q[i + 2][0] - q[i + 1][0], q[i + 2][1] - q[i + 1][1]) + 1;
      const steps = Math.max(2, Math.ceil(span / STEP_M));
      for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
        bspline(q[i], q[i + 1], q[i + 2], q[i + 3], k / steps, p);
        const last = pts[pts.length - 1];
        // (the tripled ends make zero-length steps: a point is kept only past the last)
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) pts.push([p[0], p[1]]);
      }
    }
  }
  const n = pts.length;
  const xs = new Float64Array(n), zs = new Float64Array(n), s = new Float64Array(n);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    xs[i] = pts[i][0]; zs[i] = pts[i][1];
    if (i) s[i] = s[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
    minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]); minZ = Math.min(minZ, zs[i]); maxZ = Math.max(maxZ, zs[i]);
  }
  const length = s[n - 1];
  if (!(length > 1)) throw new Error('A landform path must be longer than a metre');
  // the tightest bend: the circumradius of every three consecutive points two steps apart
  let minRadius = Infinity;
  for (let i = 2; i + 2 < n; i++) {
    const ax = xs[i - 2], az = zs[i - 2], bx = xs[i], bz = zs[i], qx = xs[i + 2], qz = zs[i + 2];
    const area2 = Math.abs((bx - ax) * (qz - az) - (bz - az) * (qx - ax));
    if (area2 < 1e-9) continue;
    const r = Math.hypot(bx - ax, bz - az) * Math.hypot(qx - bx, qz - bz) * Math.hypot(qx - ax, qz - az) / (2 * area2);
    minRadius = Math.min(minRadius, r);
  }
  // the grid over the reach (the ends' straight runs are answered from the end segments, which every cell past an end
  // keeps as candidates through the same nearest-distance test)
  const gx = minX - reach - CELL_M, gz = minZ - reach - CELL_M;
  const nx = Math.max(1, Math.ceil((maxX + reach + CELL_M - gx) / CELL_M)), nz = Math.max(1, Math.ceil((maxZ + reach + CELL_M - gz) / CELL_M));
  // per cell, the segments whose expanded bounds overlap it (each segment visits only its own cells), then the pruning:
  // a segment whose nearest possible distance exceeds the cell's best farthest distance is never nearest there
  const segs = n - 1, near: number[][] = Array.from({ length: nx * nz }, () => []);
  for (let i = 0; i < segs; i++) {
    const lo = (v: number, o: number) => Math.max(0, Math.floor((v - o) / CELL_M));
    const ca = lo(Math.min(xs[i], xs[i + 1]) - reach - CELL_M, gx), cb = Math.min(nx - 1, lo(Math.max(xs[i], xs[i + 1]) + reach + CELL_M, gx));
    const ra = lo(Math.min(zs[i], zs[i + 1]) - reach - CELL_M, gz), rb = Math.min(nz - 1, lo(Math.max(zs[i], zs[i + 1]) + reach + CELL_M, gz));
    for (let cz = ra; cz <= rb; cz++) for (let cxi = ca; cxi <= cb; cxi++) near[cz * nx + cxi].push(i);
  }
  const lists: number[][] = [];
  for (let cz = 0; cz < nz; cz++) {
    for (let cxi = 0; cxi < nx; cxi++) {
      const x0 = gx + cxi * CELL_M, z0 = gz + cz * CELL_M, x1 = x0 + CELL_M, z1 = z0 + CELL_M;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      // a segment's farthest distance over the cell is at a corner; its nearest at least its distance from the centre
      // less the half-diagonal
      let best = Infinity;
      const found: number[] = [];
      for (const i of near[cz * nx + cxi]) {
        const dc = Math.sqrt(segmentDistance2(mx, mz, xs[i], zs[i], xs[i + 1], zs[i + 1]));
        if (dc - CELL_M * Math.SQRT1_2 > reach) continue;
        const ax = xs[i], az = zs[i], bx = xs[i + 1], bz = zs[i + 1];
        const far = Math.sqrt(Math.max(segmentDistance2(x0, z0, ax, az, bx, bz), segmentDistance2(x1, z0, ax, az, bx, bz),
          segmentDistance2(x0, z1, ax, az, bx, bz), segmentDistance2(x1, z1, ax, az, bx, bz)));
        best = Math.min(best, far);
        found.push(i, dc);
      }
      const keep: number[] = [];
      for (let k = 0; k < found.length; k += 2) if (found[k + 1] - CELL_M * Math.SQRT1_2 <= best) keep.push(found[k]);
      lists.push(keep);
    }
  }
  const start = new Int32Array(nx * nz + 1);
  let total = 0;
  for (let c = 0; c < lists.length; c++) { start[c] = total; total += lists[c].length; }
  start[lists.length] = total;
  const items = new Int32Array(total);
  for (let c = 0, k = 0; c < lists.length; c++) for (const i of lists[c]) items[k++] = i;
  return {
    xs, zs, s, length, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, halfDiagonal: Math.hypot(maxX - minX, maxZ - minZ) / 2,
    reach, minRadius, gx, gz, cell: CELL_M, nx, nz, start, items,
  };
}

/**
 * The ridge frame of (x, z) on the path, written to `out`: lx its station from the curve's middle, lz its signed
 * distance (left of the direction of travel positive). False (and `out` untouched) beyond the reach.
 */
export function landformPathFrame(path: PreparedLandformPath, x: number, z: number, out: LandformPathFrame): boolean {
  const ci = Math.floor((x - path.gx) / path.cell), cj = Math.floor((z - path.gz) / path.cell);
  if (ci < 0 || cj < 0 || ci >= path.nx || cj >= path.nz) return false;
  const c = cj * path.nx + ci, a = path.start[c], b = path.start[c + 1];
  if (a === b) return false;
  const { xs, zs } = path;
  let best = Infinity, bi = -1, bt = 0;
  for (let k = a; k < b; k++) {
    const i = path.items[k];
    const ax = xs[i], az = zs[i], dx = xs[i + 1] - ax, dz = zs[i + 1] - az, l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - x, ez = az + dz * t - z, d2 = ex * ex + ez * ez;
    if (d2 < best) { best = d2; bi = i; bt = t; }
  }
  if (bi < 0 || best > path.reach * path.reach) return false;
  const last = xs.length - 2;
  const ax = xs[bi], az = zs[bi], dx = xs[bi + 1] - ax, dz = zs[bi + 1] - az, len = Math.max(1e-9, Math.hypot(dx, dz));
  const tx = dx / len, tz = dz / len;
  // past an end the frame runs on along the end's tangent: the station past the end, the distance across it
  if ((bi === 0 && bt <= 0) || (bi === last && bt >= 1)) {
    const ox = bi === 0 && bt <= 0 ? ax : xs[bi + 1], oz = bi === 0 && bt <= 0 ? az : zs[bi + 1];
    const along = (x - ox) * tx + (z - oz) * tz;
    out.lx = (bi === 0 && bt <= 0 ? 0 : path.length) + along - path.length / 2;
    out.lz = -(x - ox) * tz + (z - oz) * tx;
    return true;
  }
  const px = ax + dx * bt, pz = az + dz * bt;
  out.lx = path.s[bi] + bt * len - path.length / 2;
  // the side: the segment's left normal (-tz, tx); at a bend's vertex every candidate agrees on it outside the bend
  const side = -(x - px) * tz + (z - pz) * tx;
  out.lz = (side < 0 ? -1 : 1) * Math.sqrt(best);
  return true;
}

/** A station on a path: its point and its unit tangent (landformPathStation). */
export interface LandformPathStation {
  x: number;
  z: number;
  tx: number;
  tz: number;
}

/**
 * The curve's point and unit tangent at the station `s` (m from the curve's middle, clamped to its ends), written to
 * `out`: the point on the dense curve, the tangent the chord across 2 m either side (a skin's rows turn smoothly).
 */
export function landformPathStation(path: PreparedLandformPath, s: number, out: LandformPathStation): LandformPathStation {
  const point = (t: number, o: { x: number; z: number }) => {
    const u = Math.max(0, Math.min(path.length, t));
    let lo = 0, hi = path.s.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (path.s[mid] <= u) lo = mid; else hi = mid; }
    const seg = path.s[hi] - path.s[lo], f = seg > 0 ? (u - path.s[lo]) / seg : 0;
    o.x = path.xs[lo] + (path.xs[hi] - path.xs[lo]) * f; o.z = path.zs[lo] + (path.zs[hi] - path.zs[lo]) * f;
    return o;
  };
  const t = s + path.length / 2;
  point(t, out);
  const a = point(t - 2, { x: 0, z: 0 }), b = point(t + 2, { x: 0, z: 0 });
  const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  out.tx = (b.x - a.x) / l; out.tz = (b.z - a.z) / l;
  return out;
}
