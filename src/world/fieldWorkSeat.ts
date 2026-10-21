// The field works' seat (the maps lane, 229; the coordinator's ruling of 2026-10-18: terrain-conforming breastworks, each
// sandbag module seated on its own ground with a sunk base and none left out). A module stands on the ground under its
// own footprint: its courses follow the plane of that ground (a vertical shear: the faces stay plumb, as a wall of bags laid
// up a slope keeps them), up to FIELD_WORK_SHEAR_MAX, and its base sits FIELD_WORK_SINK_M under the lowest point of the
// ground relative to that plane, so no corner stands in the air. Before 229 each module stood level at the lowest point of
// a 2.3-2.7 m disc round it: on a slope a work stepped down in level blocks sunk deep into the hill ("a dark rectangular
// block on the hillside"), and 227's fieldWorksLevel cut those modules out instead, with their cover.
//
// The record's collision follows the drawn module: its contact band and shell slabs keep their outlines, each cut along
// the slope into cells no more than FIELD_WORK_CELL_RISE_M of rise across, every cell raised by the plane's rise at its
// centre (rays and hulls read a part's flat y0..y1). DOM-free and three-free: props.ts lays the module and refits its
// records with it; fieldWorkSeat.selftest.mjs.

/** The base under the lowest ground of the footprint (relative to the courses' plane). */
export const FIELD_WORK_SINK_M = 0.04;
/** The steepest the courses follow (20 degrees); the rest of a slope is taken by the base's sink. */
export const FIELD_WORK_SHEAR_MAX = Math.tan((20 * Math.PI) / 180);
/** Flatter than this (about one degree) a module stands level, as before. */
const FIELD_WORK_SHEAR_MIN = 0.02;
/** The ground under the footprint sampled at most this far apart, edges and centre included. */
const FIELD_WORK_SEAT_STEP_M = 0.6;
/** A sheared part's collision cell spans at most this much rise. */
export const FIELD_WORK_CELL_RISE_M = 0.15;

export interface HeightSampler { getHeightAt(x: number, z: number): number }

export interface FieldWorkSeat {
  /** The module's origin height (its base, y = 0 of its geometry, at its centre). */
  y: number;
  /** The courses' rise per metre along the module's local x and z (0: level). */
  shearX: number;
  shearZ: number;
  /** The lowest and highest ground under the footprint. */
  min: number;
  max: number;
}

/**
 * The seat of a module of half extents `hw` (local x) and `hl` (local z), turned by `yaw` (props' frame: local x to world
 * (cos, -sin), local z to (sin, cos)): the least-squares plane of the ground under it, clamped, and the base under it.
 */
export function fieldWorkSeat(ground: HeightSampler, x: number, z: number, yaw: number, hw: number, hl: number): FieldWorkSeat {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const nx = Math.max(2, Math.ceil((2 * hw) / FIELD_WORK_SEAT_STEP_M)), nz = Math.max(2, Math.ceil((2 * hl) / FIELD_WORK_SEAT_STEP_M));
  const samples: number[] = [];
  let min = Infinity, max = -Infinity, sxx = 0, szz = 0, sgx = 0, sgz = 0;
  for (let i = 0; i <= nx; i++) {
    const lx = -hw + (2 * hw * i) / nx;
    for (let j = 0; j <= nz; j++) {
      const lz = -hl + (2 * hl * j) / nz;
      const g = ground.getHeightAt(x + lx * c + lz * s, z - lx * s + lz * c);
      samples.push(lx, lz, g);
      if (g < min) min = g;
      if (g > max) max = g;
      // (the grid is centred, so the plane's slopes are independent of its offset)
      sxx += lx * lx; szz += lz * lz; sgx += g * lx; sgz += g * lz;
    }
  }
  const slope = (v: number): number => {
    const clamped = Math.max(-FIELD_WORK_SHEAR_MAX, Math.min(FIELD_WORK_SHEAR_MAX, v));
    return Math.abs(clamped) < FIELD_WORK_SHEAR_MIN ? 0 : clamped;
  };
  const shearX = slope(sxx > 0 ? sgx / sxx : 0), shearZ = slope(szz > 0 ? sgz / szz : 0);
  let base = Infinity;
  for (let k = 0; k < samples.length; k += 3) {
    const under = samples[k + 2] - shearX * samples[k] - shearZ * samples[k + 1];
    if (under < base) base = under;
  }
  return { y: base - FIELD_WORK_SINK_M, shearX, shearZ, min, max };
}

/**
 * The module's instance matrix (three's column-major elements): translate · turn by yaw · shear · scale, a local point
 * (lx, ly, lz) of the geometry at world height y + sc * (ly + shearX * lx + shearZ * lz).
 */
export function fieldWorkMatrix(x: number, y: number, z: number, yaw: number, sc: number, shearX: number, shearZ: number): number[] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [c * sc, shearX * sc, -s * sc, 0, 0, sc, 0, 0, s * sc, shearZ * sc, c * sc, 0, x, y, z, 1];
}

/** A convex outline (x, z pairs) clipped to lo <= coordinate <= hi along x (axis 0) or z (axis 1). */
function clipConvex(points: readonly number[], axis: 0 | 1, lo: number, hi: number): number[] {
  let out = points.slice();
  for (const [bound, sign] of [[lo, 1], [hi, -1]] as const) {
    const input = out;
    out = [];
    const n = input.length / 2;
    for (let i = 0; i < n; i++) {
      const ax = input[2 * i], az = input[2 * i + 1];
      const bx = input[2 * ((i + 1) % n)], bz = input[2 * ((i + 1) % n) + 1];
      const da = sign * ((axis === 0 ? ax : az) - bound), db = sign * ((axis === 0 ? bx : bz) - bound);
      if (da >= 0) out.push(ax, az);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        out.push(ax + (bx - ax) * t, az + (bz - az) * t);
      }
    }
    if (out.length < 6) return [];
  }
  return out;
}

/** A convex outline's area centroid and area. */
function centroidOf(points: readonly number[]): { x: number; z: number; area: number } {
  let a = 0, cx = 0, cz = 0;
  const n = points.length / 2;
  for (let i = 0; i < n; i++) {
    const x0 = points[2 * i], z0 = points[2 * i + 1], x1 = points[2 * ((i + 1) % n)], z1 = points[2 * ((i + 1) % n) + 1];
    const cross = x0 * z1 - x1 * z0;
    a += cross; cx += (x0 + x1) * cross; cz += (z0 + z1) * cross;
  }
  if (Math.abs(a) < 1e-12) {
    let mx = 0, mz = 0;
    for (let i = 0; i < n; i++) { mx += points[2 * i]; mz += points[2 * i + 1]; }
    return { x: mx / n, z: mz / n, area: 0 };
  }
  return { x: cx / (3 * a), z: cz / (3 * a), area: Math.abs(a) / 2 };
}

export interface RangedOutline { points: number[]; y0: number; y1: number }

/**
 * A sheared module's collision parts: each part (a convex outline in the module's frame, metres, scale applied, its heights
 * from the module's base) cut along x and z into cells across which the courses' plane rises at most
 * FIELD_WORK_CELL_RISE_M, every cell raised by the rise at its centre. Unsheared parts come back as they are.
 */
export function shearedOutlines(parts: readonly RangedOutline[], shearX: number, shearZ: number): RangedOutline[] {
  if (shearX === 0 && shearZ === 0) return parts.map((part) => ({ points: part.points.slice(), y0: part.y0, y1: part.y1 }));
  const out: RangedOutline[] = [];
  for (const part of parts) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < part.points.length; i += 2) {
      x0 = Math.min(x0, part.points[i]); x1 = Math.max(x1, part.points[i]);
      z0 = Math.min(z0, part.points[i + 1]); z1 = Math.max(z1, part.points[i + 1]);
    }
    const nx = Math.max(1, Math.ceil((Math.abs(shearX) * (x1 - x0)) / FIELD_WORK_CELL_RISE_M));
    const nz = Math.max(1, Math.ceil((Math.abs(shearZ) * (z1 - z0)) / FIELD_WORK_CELL_RISE_M));
    for (let i = 0; i < nx; i++) {
      const strip = nx === 1 ? part.points.slice() : clipConvex(part.points, 0, x0 + ((x1 - x0) * i) / nx, x0 + ((x1 - x0) * (i + 1)) / nx);
      if (!strip.length) continue;
      for (let j = 0; j < nz; j++) {
        const cell = nz === 1 ? strip : clipConvex(strip, 1, z0 + ((z1 - z0) * j) / nz, z0 + ((z1 - z0) * (j + 1)) / nz);
        if (!cell.length) continue;
        const centre = centroidOf(cell);
        if (centre.area < 1e-6) continue;
        const rise = shearX * centre.x + shearZ * centre.z;
        out.push({ points: cell, y0: part.y0 + rise, y1: part.y1 + rise });
      }
    }
  }
  return out;
}

/** The plane's lowest and highest rise over a set of outlines (their corners). */
export function shearRiseRange(parts: readonly RangedOutline[], shearX: number, shearZ: number): [number, number] {
  let lo = 0, hi = 0;
  for (const part of parts) {
    for (let i = 0; i < part.points.length; i += 2) {
      const rise = shearX * part.points[i] + shearZ * part.points[i + 1];
      if (rise < lo) lo = rise;
      if (rise > hi) hi = rise;
    }
  }
  return [lo, hi];
}
