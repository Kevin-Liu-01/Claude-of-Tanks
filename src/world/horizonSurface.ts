import type { CanyonGround } from './horizonRedrock.ts';

function smoothstep(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Carry the conditioned road shoulders into the surrounding geology. */
export function continuedGroundAt(ground: CanyonGround, x: number, z: number): number {
  const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 512;
  if (edgeOut <= 0 || !ground.getOutlandHeightAt) return ground.getHeightAt(x, z);
  const ex = Math.max(-511.5, Math.min(511.5, x)), ez = Math.max(-511.5, Math.min(511.5, z));
  const residual = ground.getHeightAt(ex, ez) - ground.getOutlandHeightAt(ex, ez);
  return ground.getOutlandHeightAt(x, z) + residual * (1 - smoothstep(0, 180, edgeOut));
}

/** Construction-time sampling of the two triangles actually drawn in a ring
 * quad. Extrapolating its first triangle through the fourth corner floats
 * props above warped cliffs. The caller owns the reusable output. */
export interface HorizonSurfacePoint { x: number; y: number; z: number; slope: number }
export function sampleHorizonFace(
  positions: Float32Array, heights: Float32Array,
  i00: number, i01: number, i10: number, i11: number,
  u: number, w: number, out: HorizonSurfacePoint,
): HorizonSurfacePoint {
  const upper = u + w > 1;
  const a = upper ? i11 : i00, b = i01, c = i10;
  const ub = upper ? 1 - w : u, uc = upper ? 1 - u : w;
  const ax = positions[a * 3], az = positions[a * 3 + 2], ay = heights[a];
  const bx = positions[b * 3] - ax, bz = positions[b * 3 + 2] - az, by = heights[b] - ay;
  const cx = positions[c * 3] - ax, cz = positions[c * 3 + 2] - az, cy = heights[c] - ay;
  out.x = ax + bx * ub + cx * uc; out.y = ay + by * ub + cy * uc; out.z = az + bz * ub + cz * uc;
  const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
  out.slope = Math.hypot(nx, nz) / Math.max(1e-6, Math.abs(ny));
  return out;
}

/**
 * The borders lane (2026-10-08): the drawn ring's own surface height at a world point — along each column the rows'
 * heights linear in the radius, then between the two columns — read lazily from the ring mesh's position attribute
 * (`columns` + 1 seam column per row), so the seam's later refinements are included. NaN off the ring.
 */
export function ringMeshSurfaceSampler(position: { array: ArrayLike<number>; count: number }, columns: number): (x: number, z: number) => number {
  let radii: Float32Array | null = null, heights: Float32Array | null = null, rows = 0;
  const init = (): void => {
    const stride = columns + 1;
    rows = Math.floor(position.count / stride);
    radii = new Float32Array(rows * columns); heights = new Float32Array(rows * columns);
    const a = position.array;
    for (let j = 0; j < rows; j++) for (let k = 0; k < columns; k++) {
      const i = j * stride + k, o = j * columns + k;
      radii[o] = Math.hypot(a[i * 3], a[i * 3 + 2]); heights[o] = a[i * 3 + 1];
    }
  };
  const along = (k: number, r: number): number => {
    const R = radii!, Y = heights!;
    if (r < R[k] || r > R[(rows - 1) * columns + k]) return Number.NaN;
    let lo = 0, hi = rows - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (R[mid * columns + k] <= r) lo = mid; else hi = mid; }
    const r0 = R[lo * columns + k], r1 = R[hi * columns + k], t = r1 > r0 ? (r - r0) / (r1 - r0) : 0;
    return Y[lo * columns + k] * (1 - t) + Y[hi * columns + k] * t;
  };
  return (x: number, z: number): number => {
    if (!radii) init();
    let a = Math.atan2(z, x); if (a < 0) a += Math.PI * 2;
    const f = (a / (Math.PI * 2)) * columns, k0 = Math.floor(f) % columns, k1 = (k0 + 1) % columns, t = f - Math.floor(f);
    const r = Math.hypot(x, z);
    return along(k0, r) * (1 - t) + along(k1, r) * t;
  };
}

/**
 * The borders lane (2026-10-08, Nordhavn's headland past the edge: "a smooth lawn slope dipping under water, no rocks,
 * no wet band"): metres landward of the ring's own waterline at every ring vertex (`maxM` where none is near). The
 * square's strand reads its shoreline contours (terrain.ts shoreAt), which know nothing of a headland or a bay the ring
 * draws in a sea opening. The ring carries its marine weight in its uv's V (negative: the sea sector's weight faded
 * over the metre above the water's floor, maps/horizon.ts — the coverage its water is drawn from), so the waterline is
 * where that weight crosses `threshold`: a vertex below it beside one above measures the crossing along their shared
 * edge (interpolated, so the line follows the coast, not the grid's quads), and four relaxation passes carry the
 * distance 32 m up the shore — the strand (wet band, foam line, wrack, pebbles) runs on round the ring's own coast.
 * (The round's first census measured it by the ground's height under the sea's surface instead: a shelf of dry
 * vertices a few centimetres under it took the whole wet band, a grey staircase along the grid's quads.)
 * Rows of `columns` + 1 vertices (the seam column repeats the first), before the seam's refinement.
 */
export function ringWaterlineMetres(
  position: { array: ArrayLike<number>; count: number }, uv: { array: ArrayLike<number> },
  columns: number, threshold = 0.4, maxM = 32,
): Float32Array {
  const stride = columns + 1, rows = Math.floor(position.count / stride), P = position.array, U = uv.array;
  const out = new Float32Array(position.count).fill(maxM);
  const marine = new Float32Array(rows * columns), dist = new Float32Array(rows * columns);
  for (let j = 0; j < rows; j++) for (let k = 0; k < columns; k++) {
    const v = U[(j * stride + k) * 2 + 1];
    marine[j * columns + k] = v < 0 ? -v : 0;
  }
  for (let j = 0; j < rows; j++) for (let k = 0; k < columns; k++) {
    const o = j * columns + k, i = j * stride + k, mi = marine[o];
    let best = maxM;
    if (mi >= threshold) best = 0;
    else {
      const x = P[i * 3], z = P[i * 3 + 2];
      for (let dj = -1; dj <= 1; dj++) {
        const jn = j + dj;
        if (jn < 0 || jn >= rows) continue;
        for (let dk = -1; dk <= 1; dk++) {
          if (!dj && !dk) continue;
          const kn = (k + dk + columns) % columns, on = jn * columns + kn, mn = marine[on];
          if (mn < threshold) continue;
          const n = jn * stride + kn;
          // where the weight crosses the threshold along the edge (linear between the two ends)
          const t = (threshold - mi) / Math.max(1e-6, mn - mi);
          best = Math.min(best, t * Math.hypot(P[n * 3] - x, P[n * 3 + 2] - z));
        }
      }
    }
    dist[o] = best;
  }
  // ... and on up the shore from those crossings: a few relaxation passes over the grid's edges (a vertex row is 5-30 m
  // across, so four passes carry the strand's 32 m)
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let j = 0; j < rows; j++) for (let k = 0; k < columns; k++) {
      const o = j * columns + k;
      if (dist[o] === 0) continue;
      const i = j * stride + k, x = P[i * 3], z = P[i * 3 + 2];
      let best = dist[o];
      for (let dj = -1; dj <= 1; dj++) {
        const jn = j + dj;
        if (jn < 0 || jn >= rows) continue;
        for (let dk = -1; dk <= 1; dk++) {
          if (!dj && !dk) continue;
          const kn = (k + dk + columns) % columns, on = jn * columns + kn;
          if (dist[on] >= best) continue;
          const n = jn * stride + kn;
          best = Math.min(best, dist[on] + Math.hypot(P[n * 3] - x, P[n * 3 + 2] - z));
        }
      }
      if (best < dist[o]) { dist[o] = best; changed = true; }
    }
    if (!changed) break;
  }
  for (let j = 0; j < rows; j++) for (let k = 0; k <= columns; k++) out[j * stride + k] = Math.min(maxM, dist[j * columns + (k % columns)]);
  return out;
}
