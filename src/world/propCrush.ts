/**
 * propCrush.ts — a prop a hull runs over gives where the hull meets it (destruction core lane, 2026-10-10; the owner:
 * "just let physics work"; the crush waves 350/352: a map vehicle flipped from its paint to the burnt wreck in one frame
 * at first contact, after the hull had driven a metre and more into it, and a hut came back unchanged from under the
 * tracks that crossed its heap).
 *
 * A crush field over the prop's footprint (its own frame, cells of CELL_M) holds, cell by cell, the lowest height a hull
 * has let stand there and the shove the hull has given there; the prop's own triangles are drawn through it. The hull
 * presses where it is now and every cell keeps the worst it has been given, so the prop gives at the hull's front as it
 * arrives (the band ahead of its glacis buckles and is pushed on), pancakes under the tracks behind it, splays at the
 * track edges, sags round all that (the droop: nothing stands higher than the crush beside it allows), and a heap
 * crossed again later is flattened further where the tracks cross it.
 *
 * Pure and deterministic: the field moves only with the hull poses it is given, and the crumple's breakup is hashed
 * from the vertex's rest place. The presentation draws this; the simulation's crush event stays the authority on
 * collision (props.ts: the record's obstacle is ghosted by the event, never by the press).
 */

/** The field's cell (m). */
export const CRUSH_CELL_M = 0.2;
/** How far round the prop's footprint the field reaches (m): the splay and the shove leave the footprint a little. */
const MARGIN_M = 0.6;
/** Under the tracks: the floor a crushed body is pressed to (m over the prop's base), and the ramp of the hull's front
 *  (the idlers and the lower glacis ride over it: the cap rises toward the front edge). */
const FLOOR_M = 0.12;
const RAMP_M = 1.1;
const RAMP_H = 0.55;
/** The band ahead of the hull's front edge that its glacis meets first (m), its shove at the contact (m) and how far it
 *  presses that band down there (a share of the prop's height). */
const AHEAD_M = 0.55;
const PUSH_M = 0.2;
const AHEAD_SAG = 0.18;
/** The band beside the tracks (m): the splay outward (m) and the cap's rise across it. */
const SIDE_M = 0.5;
const SPLAY_M = 0.22;
/** The droop: no cell stands higher than its neighbour's cap plus this much a metre between them. */
const DROOP_SLOPE = 1.15;
/** What is left of the height over a cap (the pancake: the body above it squashed into this share of itself). */
const SQUASH = 0.11;
/** The crumple's breakup of a pressed surface (m). */
const NOISE_M = 0.07;

/** One prop's field. */
export interface CrushField {
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  readonly cell: number;
  /** The prop's rest top (its own frame, m over its base). */
  readonly top: number;
  /** The lowest height a hull has let stand over each cell (Infinity: untouched). */
  readonly cap: Float32Array;
  /** The cap with its droop (settleField). */
  readonly eff: Float32Array;
  /** The shove each cell has been given (its own frame). */
  readonly pushX: Float32Array;
  readonly pushZ: Float32Array;
  /** Pressed at all, and whether the droop is stale. */
  touched: boolean;
  stale: boolean;
}

/** A field over a footprint of half extents (hw, hl) about the prop's origin, its rest top `top`. */
export function createCrushField(hw: number, hl: number, top: number, cell = CRUSH_CELL_M): CrushField {
  const x0 = -hw - MARGIN_M, z0 = -hl - MARGIN_M;
  const nx = Math.max(2, Math.ceil((2 * (hw + MARGIN_M)) / cell) + 1);
  const nz = Math.max(2, Math.ceil((2 * (hl + MARGIN_M)) / cell) + 1);
  const n = nx * nz;
  const cap = new Float32Array(n).fill(Infinity);
  return { x0, z0, nx, nz, cell, top: Math.max(0.2, top), cap, eff: new Float32Array(n).fill(Infinity),
    pushX: new Float32Array(n), pushZ: new Float32Array(n), touched: false, stale: false };
}

/** Whether a hull rectangle (centre, unit forward, half extents; the prop's frame) meets the prop's box (half extents
 *  hw, hl about its origin), the band ahead of the hull's front included (its glacis meets it first). */
export function hullMeetsBox(cx: number, cz: number, fx: number, fz: number, halfLength: number, halfWidth: number,
  hw: number, hl: number): boolean {
  // separating axes: the box's two and the hull's two
  const L = halfLength + AHEAD_M * 0.5, ox = cx + fx * AHEAD_M * 0.5, oz = cz + fz * AHEAD_M * 0.5;
  const rx = -fz, rz = fx;
  // the box's axes
  const ex = Math.abs(fx) * L + Math.abs(rx) * halfWidth, ez = Math.abs(fz) * L + Math.abs(rz) * halfWidth;
  if (Math.abs(ox) > hw + ex || Math.abs(oz) > hl + ez) return false;
  // the hull's axes
  const pf = Math.abs(ox * fx + oz * fz), pr = Math.abs(ox * rx + oz * rz);
  if (pf > L + Math.abs(fx) * hw + Math.abs(fz) * hl) return false;
  if (pr > halfWidth + Math.abs(rx) * hw + Math.abs(rz) * hl) return false;
  return true;
}

/**
 * One hull's press on the field: its centre (cx, cz), unit forward (fx, fz) and half extents, all in the prop's frame.
 * Every cell keeps the lowest cap and the largest shove it has been given. Returns whether anything changed.
 */
export function pressField(f: CrushField, cx: number, cz: number, fx: number, fz: number, halfLength: number, halfWidth: number): boolean {
  const reach = Math.hypot(halfLength + AHEAD_M, halfWidth + SIDE_M);
  const i0 = Math.max(0, Math.floor((cx - reach - f.x0) / f.cell)), i1 = Math.min(f.nx - 1, Math.ceil((cx + reach - f.x0) / f.cell));
  const j0 = Math.max(0, Math.floor((cz - reach - f.z0) / f.cell)), j1 = Math.min(f.nz - 1, Math.ceil((cz + reach - f.z0) / f.cell));
  if (i0 > i1 || j0 > j1) return false;
  let changed = false;
  for (let j = j0; j <= j1; j++) {
    const pz = f.z0 + j * f.cell - cz;
    for (let i = i0; i <= i1; i++) {
      const px = f.x0 + i * f.cell - cx;
      const u = px * fx + pz * fz, v = -px * fz + pz * fx, av = Math.abs(v);
      if (u > halfLength + AHEAD_M || u < -halfLength || av > halfWidth + SIDE_M) continue;
      const k = j * f.nx + i;
      let cap = Infinity, push = 0, lat = 0;
      if (av <= halfWidth && u <= halfLength) {
        // under the hull: pressed to the floor, the ramp of its front edge letting a little more stand there
        const s = halfLength - u;
        cap = FLOOR_M + RAMP_H * Math.max(0, 1 - s / RAMP_M);
      } else if (av <= halfWidth) {
        // the band ahead of its front: the glacis meets it, shoves it on and bends it down a little
        const w = 1 - (u - halfLength) / AHEAD_M;
        cap = f.top * (1 - AHEAD_SAG * w);
        push = PUSH_M * w;
      } else if (u <= halfLength) {
        // beside the tracks: splayed outward and pressed partway
        const w = 1 - (av - halfWidth) / SIDE_M;
        cap = FLOOR_M + 0.3 + (1 - w) * f.top;
        lat = SPLAY_M * w * (v < 0 ? -1 : 1);
      }
      if (cap < f.cap[k] - 1e-4) { f.cap[k] = cap; changed = true; }
      if (push > 0 || lat !== 0) {
        // the shove along the hull's travel and its splay across it, each kept at the largest it has been
        const along = f.pushX[k] * fx + f.pushZ[k] * fz, across = -f.pushX[k] * fz + f.pushZ[k] * fx;
        const nAlong = Math.max(along, push), nAcross = Math.abs(lat) > Math.abs(across) ? lat : across;
        const nx = fx * nAlong - fz * nAcross, nz = fz * nAlong + fx * nAcross;
        if (Math.abs(nx - f.pushX[k]) > 1e-4 || Math.abs(nz - f.pushZ[k]) > 1e-4) {
          f.pushX[k] = nx; f.pushZ[k] = nz; changed = true;
        }
      }
    }
  }
  if (changed) { f.touched = true; f.stale = true; }
  return changed;
}

/** The droop: each cell's effective cap is the lowest of its own and its neighbours' plus the slope over the distance
 *  between them (a two-pass chamfer over the grid). */
export function settleField(f: CrushField): void {
  const { nx, nz, cap, eff } = f;
  eff.set(cap);
  const d1 = DROOP_SLOPE * f.cell, d2 = DROOP_SLOPE * f.cell * Math.SQRT2;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let e = eff[k];
      if (i > 0) e = Math.min(e, eff[k - 1] + d1);
      if (j > 0) {
        e = Math.min(e, eff[k - nx] + d1);
        if (i > 0) e = Math.min(e, eff[k - nx - 1] + d2);
        if (i + 1 < nx) e = Math.min(e, eff[k - nx + 1] + d2);
      }
      eff[k] = e;
    }
  }
  for (let j = nz - 1; j >= 0; j--) {
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      let e = eff[k];
      if (i + 1 < nx) e = Math.min(e, eff[k + 1] + d1);
      if (j + 1 < nz) {
        e = Math.min(e, eff[k + nx] + d1);
        if (i + 1 < nx) e = Math.min(e, eff[k + nx + 1] + d2);
        if (i > 0) e = Math.min(e, eff[k + nx - 1] + d2);
      }
      eff[k] = e;
    }
  }
  f.stale = false;
}

/** A hash in [-1, 1] of a rest place (the crumple's breakup: a prop crushed twice the same crumples the same). */
function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(Math.round(x * 37) | 0, 73856093) ^ Math.imul(Math.round(y * 37) | 0, 19349663) ^ Math.imul(Math.round(z * 37) | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/** A field value at (x, z) in the prop's frame, bilinear (Infinity at an untouched corner reads as the prop's top). */
function sample(f: CrushField, a: Float32Array, x: number, z: number, empty: number): number {
  const gx = Math.max(0, Math.min(f.nx - 1.001, (x - f.x0) / f.cell)), gz = Math.max(0, Math.min(f.nz - 1.001, (z - f.z0) / f.cell));
  const i = Math.floor(gx), j = Math.floor(gz), tx = gx - i, tz = gz - j;
  const k = j * f.nx + i;
  const v00 = Number.isFinite(a[k]) ? a[k] : empty, v10 = Number.isFinite(a[k + 1]) ? a[k + 1] : empty;
  const v01 = Number.isFinite(a[k + f.nx]) ? a[k + f.nx] : empty, v11 = Number.isFinite(a[k + f.nx + 1]) ? a[k + f.nx + 1] : empty;
  return (v00 * (1 - tx) + v10 * tx) * (1 - tz) + (v01 * (1 - tx) + v11 * tx) * tz;
}

/**
 * Draw the prop's rest positions through its field into `out` (both xyz triples, the prop's frame). A vertex over its
 * cell's cap is pressed into a thin layer over it (the order of the heights kept, so a pancaked body is still the body,
 * crumpled), the shove moves it on (its upper parts most), and nothing goes under the prop's base.
 */
export function deformPositions(f: CrushField, rest: ArrayLike<number>, out: Float32Array): void {
  if (f.stale) settleField(f);
  const high = f.top + 10;
  for (let v = 0; v < rest.length; v += 3) {
    const x = rest[v], y = rest[v + 1], z = rest[v + 2];
    let cap = sample(f, f.eff, x, z, high);
    let ny = y, nx = x, nz = z;
    if (cap < high) {
      // the crumple's breakup where it is pressed (more where it was pressed further)
      const pressed = Math.max(0, Math.min(1, (f.top - cap) / f.top));
      cap += hash3(x, y, z) * NOISE_M * pressed;
      if (y > cap) ny = cap + (y - cap) * SQUASH;
      const px = sample(f, f.pushX, x, z, 0), pz = sample(f, f.pushZ, x, z, 0);
      if (px !== 0 || pz !== 0) {
        const lift = Math.max(0.25, Math.min(1, (y - FLOOR_M) / Math.max(0.4, f.top * 0.75)));
        nx += px * lift; nz += pz * lift;
      }
    }
    out[v] = nx; out[v + 1] = Math.max(0.015, ny); out[v + 2] = nz;
  }
}

/** Flat normals: each triangle's own, written to its vertices (a shared vertex takes its last triangle's). */
export function flatNormals(position: ArrayLike<number>, index: ArrayLike<number> | null, normal: Float32Array): void {
  const tris = index ? index.length / 3 : position.length / 9;
  for (let t = 0; t < tris; t++) {
    const a = index ? index[t * 3] : t * 3, b = index ? index[t * 3 + 1] : t * 3 + 1, c = index ? index[t * 3 + 2] : t * 3 + 2;
    const ax = position[a * 3], ay = position[a * 3 + 1], az = position[a * 3 + 2];
    const ux = position[b * 3] - ax, uy = position[b * 3 + 1] - ay, uz = position[b * 3 + 2] - az;
    const vx = position[c * 3] - ax, vy = position[c * 3 + 1] - ay, vz = position[c * 3 + 2] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (!(l > 1e-12)) continue;
    nx /= l; ny /= l; nz /= l;
    normal[a * 3] = nx; normal[a * 3 + 1] = ny; normal[a * 3 + 2] = nz;
    normal[b * 3] = nx; normal[b * 3 + 1] = ny; normal[b * 3 + 2] = nz;
    normal[c * 3] = nx; normal[c * 3 + 1] = ny; normal[c * 3 + 2] = nz;
  }
}

/**
 * A crush the presentation never saw a hull make (a remote or late event, a hull out of view): a hull of the record's
 * width plus a margin crossing it along (dirX, dirZ) in its own frame, from its near edge to its far one; `k` (0..1) how
 * far along. Writes the hull's centre and forward into `out` [cx, cz, fx, fz, halfLength, halfWidth].
 */
export function sweepPose(hw: number, hl: number, dirX: number, dirZ: number, k: number, out: number[]): number[] {
  const l = Math.hypot(dirX, dirZ) || 1;
  const fx = dirX / l, fz = dirZ / l;
  // the prop's extent along the travel, and a hull wide enough to cross all of it
  const along = Math.abs(fx) * hw + Math.abs(fz) * hl, across = Math.abs(fz) * hw + Math.abs(fx) * hl;
  const halfLength = 3.4, halfWidth = Math.max(1.7, across + 0.2);
  const start = -along - halfLength - AHEAD_M, end = along + halfLength;
  const s = start + (end - start) * Math.max(0, Math.min(1, k));
  out[0] = fx * s; out[1] = fz * s; out[2] = fx; out[3] = fz; out[4] = halfLength; out[5] = halfWidth;
  return out;
}
