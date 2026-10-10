/**
 * structureGroundOcclusionBake.ts — 2026-10-09 (the shadows lane; owner: "shadows are still really bad on maps like
 * whiteout"; the gauntlet on Frosthollow and Whiteout: "buildings that look like they float on it"; on Steinburg: "weak
 * contact shadows").
 *
 * The ground's sky beside the world's standing solids, baked once per world. Scene-wide GTAO stays off on every tier by
 * the owner's choice (2026-09-28, quality.ts: its speckled crevice wash over terrain and foliage), the screen-space contact
 * shadows take only the sun's share, and the analytic ground occlusion covers the four nearest hulls
 * (vehicleGroundOcclusion.ts). So a wall, a fence, a shed or a boulder met the ground with nothing but its cascade shadow,
 * and under a deck — where the sky is nearly all the light — with nothing at all.
 *
 * This is the occlusion a solid casts on the ground's cosine-weighted sky, the same quantity vehicleGroundOcclusion.ts
 * computes per pixel for a hull, here computed on the CPU over a map-space raster from the collision solids (the hitbox
 * lane's records: every structure, wall, fence, prop and stone, each part a convex prism with its own bottom and top) and
 * read by the aerial pass (structureGroundOcclusion.ts) on the ground's ambient share only. It is grounding, not cavity
 * shading: it reaches the ground around a solid in proportion to the solid's height (a fence a metre, a house a few), it
 * never darkens a solid's own faces, seams or crevices, and it is smooth by construction (an exact integral, no noise).
 *
 * The law. For a receiver at height y on level ground with normal up, a convex prism (footprint polygon, bottom y0, top y1)
 * hides the projected solid angle of its faces turned toward the receiver over π — Lambert's polygon formula
 * (1 / 2π) Σ θ_i n·ĉ_i over each face's edges, θ_i the angle between consecutive corners seen from the receiver and ĉ_i the
 * unit normal of the plane through them. The side faces count from max(y0, y) to y1 (the part of a face below the
 * receiver's horizon hides ground, not sky); the bottom face counts where the receiver stands under it (an overhang, a
 * bridge deck, an eave). A convex prism's faces seen from one point never overlap, so the sum is exact for one part; parts
 * combine as independent occluders (vis = Π (1 − ff)), which slightly over-counts where two solids hide the same sky. The
 * receiver's height is the part's base (its record's bottom: the ground it stands on), so the bake needs no terrain query.
 * Each part's reach is REACH_H of its height (an infinite wall hides 5 % of the sky at 2 heights), faded over its last
 * 40 % so no edge is drawn.
 *
 * The raster: RG8 over the playable square, TEXEL_M a texel. R the occlusion in its upper seven bits (0..127) and in its
 * lowest bit whether the texel lies inside a standing solid (the filtered read takes the bit as noise under 1/254). G the
 * base height of the strongest occluder modulo BASE_WRAP_M at BASE_WRAP_M / 256 (the pass recovers the nearest base
 * congruent to it within half a wrap of the pixel's own height, and lets only receivers near the ground take the term —
 * never a roof, a hull top or a wall). A texel inside a standing solid has no visible ground: it takes the largest
 * occlusion of its open neighbours, so the filtered read at the wall line is the wall foot's own value, not a lighter seam,
 * and its flag holds the pass to receivers at the base itself there, so a wall's own top never darkens.
 *
 * No DOM, no WebGL, no three: the worker (structureGroundOcclusionWorker.ts) and the receipt run it as it is.
 */

/** Half the side of the baked square (m): the playable square (terrain.ts, the census's CENSUS_HALF + 1). */
export const SGO_HALF_M = 512;
/** Texels a side. 0.5 m: a fence's metre-wide band resolves, a house's few-metre band is smooth. */
export const SGO_SIZE = 2048;
export const SGO_TEXEL_M = (2 * SGO_HALF_M) / SGO_SIZE;
/** A part's reach in its own heights, and its ceiling (m). */
export const SGO_REACH_H = 2.0;
export const SGO_REACH_MAX_M = 10;
/** The share of the reach over which a part's term fades out (no drawn edge). */
export const SGO_REACH_FADE = 0.4;
/** Parts lower than this (kerbs, plates, a sandbag course's lip) are not occluders (m). */
export const SGO_MIN_HEIGHT_M = 0.3;
/** A part whose bottom stands this far over its base is an overhang: the ground under it is open and occluded. */
export const SGO_OVERHANG_M = 1.2;
/** The G channel's wrap (m): base heights are stored modulo it, at BASE_WRAP_M / 256. */
export const SGO_BASE_WRAP_M = 64;
/** R's lowest bit: the texel lies inside a standing solid (its occlusion is its open neighbours'). */
export const SGO_COVERED_BIT = 1;
/** Sides of the polygon a circle part becomes. */
export const SGO_CIRCLE_SIDES = 10;

const TWO_PI = Math.PI * 2;

/** A collision part as the bake reads it (collision.ts SimpleCollisionShape without the import). */
export interface SgoShape {
  kind: 'obb' | 'circle' | 'convex';
  cx: number;
  cz: number;
  hw?: number;
  hl?: number;
  yaw?: number;
  r?: number;
  points?: number[];
  y0?: number;
  y1?: number;
}
/** A collision record as the bake reads it (collision.ts CollisionRecord). */
export interface SgoRecord {
  min: readonly number[];
  max: readonly number[];
  shape2?: { parts?: readonly SgoShape[] } | SgoShape | null;
  treeIdx?: number;
  dead?: boolean;
  crushed?: boolean;
  kind?: string;
}

/** The parts of a record: a compound's parts, a single shape, or its bounding box. */
function recordShapes(record: SgoRecord): SgoShape[] {
  const s = record.shape2 as ({ parts?: readonly SgoShape[] } & Partial<SgoShape>) | null | undefined;
  if (s && Array.isArray(s.parts)) return s.parts as SgoShape[];
  if (s && typeof s.kind === 'string') return [s as SgoShape];
  const cx = (record.min[0] + record.max[0]) / 2, cz = (record.min[2] + record.max[2]) / 2;
  return [{ kind: 'obb', cx, cz, hw: (record.max[0] - record.min[0]) / 2, hl: (record.max[2] - record.min[2]) / 2, yaw: 0 }];
}

/** A shape's footprint as counter-clockwise (positive signed area) x, z pairs. */
export function shapeFootprint(shape: SgoShape): number[] {
  let pts: number[];
  if (shape.kind === 'circle') {
    pts = [];
    const r = shape.r ?? 0;
    for (let i = 0; i < SGO_CIRCLE_SIDES; i++) {
      const a = (i / SGO_CIRCLE_SIDES) * TWO_PI;
      pts.push(shape.cx + Math.cos(a) * r, shape.cz + Math.sin(a) * r);
    }
  } else if (shape.kind === 'convex') {
    pts = (shape.points ?? []).slice();
  } else {
    const yaw = shape.yaw ?? 0, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
    const hw = shape.hw ?? 0, hl = shape.hl ?? 0;
    pts = [];
    for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pts.push(shape.cx + rx * hw * s + fx * hl * t, shape.cz + rz * hw * s + fz * hl * t);
    }
  }
  let area2 = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const j = (i + 2) % pts.length;
    area2 += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
  }
  if (area2 < 0) {
    const rev: number[] = [];
    for (let i = pts.length - 2; i >= 0; i -= 2) rev.push(pts[i], pts[i + 1]);
    pts = rev;
  }
  return pts;
}

/**
 * The records' occluding parts packed for the bake (and the worker's transfer): per part
 * [n, y0, y1, base, x0, z0, … x(n−1), z(n−1)]. Trees, dead and crushed records and parts under SGO_MIN_HEIGHT_M stay out.
 */
export function packOccluders(records: readonly SgoRecord[]): Float32Array {
  const out: number[] = [];
  for (const record of records) {
    if (!record || record.treeIdx != null || record.dead || record.crushed) continue;
    const base = record.min[1];
    for (const shape of recordShapes(record)) {
      const y0 = shape.y0 ?? record.min[1], y1 = shape.y1 ?? record.max[1];
      if (!(y1 - base >= SGO_MIN_HEIGHT_M) || !(y1 > y0)) continue;
      const pts = shapeFootprint(shape);
      if (pts.length < 6) continue;
      out.push(pts.length / 2, y0, y1, base, ...pts);
    }
  }
  return new Float32Array(out);
}

/** One edge term of Lambert's formula for a receiver with normal up: θ · (a × b).y / |a × b|. */
function edgeTerm(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  const s = Math.sqrt(cx * cx + cy * cy + cz * cz);
  if (s < 1e-12) return 0;
  return Math.atan2(s, ax * bx + ay * by + az * bz) * cy / s;
}

/** The share of an up-facing receiver's cosine-weighted sky a vertical quad (two footprint corners, bottom ya, top yb) hides. */
function sideFormFactor(px: number, py: number, pz: number, x0: number, z0: number, x1: number, z1: number, ya: number, yb: number): number {
  const a0x = x0 - px, a0z = z0 - pz, a1x = x1 - px, a1z = z1 - pz;
  const lo = ya - py, hi = yb - py;
  // a vertical edge lies in a plane through the vertical, so its term is zero: only the bottom and top edges count
  const k = edgeTerm(a0x, lo, a0z, a1x, lo, a1z) + edgeTerm(a1x, hi, a1z, a0x, hi, a0z);
  return Math.abs(k) / TWO_PI;
}

/** The share a horizontal polygon above the receiver (its footprint at height y) hides. */
function capFormFactor(px: number, py: number, pz: number, pts: ArrayLike<number>, o: number, n: number, y: number): number {
  const h = y - py;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    k += edgeTerm(pts[o + 2 * i] - px, h, pts[o + 2 * i + 1] - pz, pts[o + 2 * j] - px, h, pts[o + 2 * j + 1] - pz);
  }
  return Math.abs(k) / TWO_PI;
}

/**
 * The share of the cosine-weighted sky one convex prism hides from an up-facing receiver at (px, py, pz): its side faces
 * turned toward the receiver above its horizon, and its bottom where the receiver stands under it. `pts` holds the
 * counter-clockwise footprint at offset `o`, `n` corners. Also returns the receiver's signed distance outside the
 * footprint (≤ 0 inside) through `out[0]`.
 */
export function prismSkyOcclusion(
  px: number, py: number, pz: number, pts: ArrayLike<number>, o: number, n: number, y0: number, y1: number, out?: Float64Array,
): number {
  if (y1 <= py) { if (out) out[0] = Infinity; return 0; }
  const ya = Math.max(y0, py);
  let ff = 0, dOut = -Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = pts[o + 2 * i], z0 = pts[o + 2 * i + 1], x1 = pts[o + 2 * j], z1 = pts[o + 2 * j + 1];
    const ex = x1 - x0, ez = z1 - z0, el = Math.hypot(ex, ez) || 1;
    // outward normal of a counter-clockwise footprint edge: (ez, −ex)
    const d = ((px - x0) * ez - (pz - z0) * ex) / el;
    if (d > dOut) dOut = d;
    if (d > 0) ff += sideFormFactor(px, py, pz, x0, z0, x1, z1, ya, y1);
  }
  // the bottom face is turned toward any receiver under its plane (inside the footprint: an eave or a deck over it)
  if (py < y0) ff += capFormFactor(px, py, pz, pts, o, n, y0);
  if (out) out[0] = dOut;
  return Math.min(1, ff);
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A texel rectangle [i0, j0, i1, j1) of the raster. */
export type SgoRect = [number, number, number, number];

export interface SgoBakeResult {
  /** RG8 texels of the rectangle, row-major from (i0, j0). */
  rg: Uint8Array;
  rect: SgoRect;
  parts: number;
  ms: number;
}

/** The texel rectangle a world rectangle (x0, z0)–(x1, z1) touches, clamped to the raster. */
export function sgoRectOf(x0: number, z0: number, x1: number, z1: number, size = SGO_SIZE, half = SGO_HALF_M): SgoRect {
  const t = (2 * half) / size;
  const c = (v: number) => Math.max(0, Math.min(size, v));
  return [c(Math.floor((x0 + half) / t)), c(Math.floor((z0 + half) / t)), c(Math.ceil((x1 + half) / t)), c(Math.ceil((z1 + half) / t))];
}

/** The world rectangle a part reaches (its footprint grown by its reach). */
function partReach(y1: number, base: number): number {
  return Math.min(SGO_REACH_MAX_M, SGO_REACH_H * Math.max(0, y1 - base));
}

/**
 * Bake the occlusion raster (or one rectangle of it) from packed occluders. The rectangle is computed in full: every part
 * whose reach touches it contributes, so a re-bake of a region around a destroyed solid matches a full bake there.
 */
export function bakeStructureGroundOcclusion(
  packed: Float32Array, rect: SgoRect | null = null, size = SGO_SIZE, half = SGO_HALF_M,
): SgoBakeResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const texel = (2 * half) / size;
  // one level of dilation needs the ring of texels around the rectangle
  const [ri0, rj0, ri1, rj1] = rect ?? [0, 0, size, size];
  const i0 = Math.max(0, ri0 - 1), j0 = Math.max(0, rj0 - 1), i1 = Math.min(size, ri1 + 1), j1 = Math.min(size, rj1 + 1);
  const w = i1 - i0, h = j1 - j0;
  const vis = new Float32Array(w * h).fill(1);
  const best = new Float32Array(w * h);
  const baseAt = new Float32Array(w * h);
  const covered = new Uint8Array(w * h);
  const out = new Float64Array(1);
  let parts = 0;
  for (let o = 0; o < packed.length;) {
    const n = packed[o];
    const y0 = packed[o + 1], y1 = packed[o + 2], base = packed[o + 3];
    const po = o + 4;
    o = po + 2 * n;
    const reach = partReach(y1, base);
    if (!(reach > 0)) continue;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let k = 0; k < n; k++) {
      const x = packed[po + 2 * k], z = packed[po + 2 * k + 1];
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const [pi0, pj0, pi1, pj1] = sgoRectOf(minX - reach, minZ - reach, maxX + reach, maxZ + reach, size, half);
    const ai0 = Math.max(pi0, i0), aj0 = Math.max(pj0, j0), ai1 = Math.min(pi1, i1), aj1 = Math.min(pj1, j1);
    if (ai0 >= ai1 || aj0 >= aj1) continue;
    parts++;
    const standing = y0 - base < SGO_OVERHANG_M;
    const fadeFrom = reach * (1 - SGO_REACH_FADE);
    for (let j = aj0; j < aj1; j++) {
      const pz = -half + (j + 0.5) * texel;
      for (let i = ai0; i < ai1; i++) {
        const idx = (j - j0) * w + (i - i0);
        if (covered[idx]) continue;
        const px = -half + (i + 0.5) * texel;
        let ff = prismSkyOcclusion(px, base, pz, packed, po, n, y0, y1, out);
        const dOut = out[0];
        if (dOut <= 0 && standing) { covered[idx] = 1; baseAt[idx] = base; continue; }
        if (dOut >= reach) continue;
        if (dOut > fadeFrom) ff *= 1 - smoothstep(fadeFrom, reach, dOut);
        if (ff <= 1e-4) continue;
        vis[idx] *= 1 - ff;
        if (ff > best[idx]) { best[idx] = ff; baseAt[idx] = base; }
      }
    }
  }
  // the open texels' occlusion; a covered texel takes the largest of its open neighbours (the wall foot's value)
  const ow = ri1 - ri0, oh = rj1 - rj0;
  const rg = new Uint8Array(ow * oh * 2);
  // the occlusion in R's upper seven bits, the covered flag in its lowest (SGO_COVERED_BIT)
  const enc = (v: number, covered: boolean) => (Math.max(0, Math.min(127, Math.round(v * 127))) << 1) | (covered ? 1 : 0);
  const wrap = (y: number) => {
    const m = ((y % SGO_BASE_WRAP_M) + SGO_BASE_WRAP_M) % SGO_BASE_WRAP_M;
    return Math.round((m / SGO_BASE_WRAP_M) * 256) & 255;
  };
  for (let j = rj0; j < rj1; j++) {
    for (let i = ri0; i < ri1; i++) {
      const idx = (j - j0) * w + (i - i0);
      let occ = 1 - vis[idx], b = baseAt[idx];
      if (covered[idx]) {
        occ = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = i + di - i0, jj = j + dj - j0;
            if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
            const k = jj * w + ii;
            if (covered[k]) continue;
            const v = 1 - vis[k];
            if (v > occ) occ = v;
          }
        }
      }
      const q = ((j - rj0) * ow + (i - ri0)) * 2;
      rg[q] = enc(occ, covered[idx] === 1);
      rg[q + 1] = occ > 0 || covered[idx] ? wrap(b) : 0;
    }
  }
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { rg, rect: [ri0, rj0, ri1, rj1], parts, ms: t1 - t0 };
}

/** The occluders' world rectangle reach (for a region re-bake around changed records): grown by the largest reach. */
export function packedBounds(packed: Float32Array): [number, number, number, number] | null {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let o = 0; o < packed.length;) {
    const n = packed[o], y1 = packed[o + 2], base = packed[o + 3], po = o + 4;
    o = po + 2 * n;
    const reach = partReach(y1, base);
    for (let k = 0; k < n; k++) {
      const x = packed[po + 2 * k], z = packed[po + 2 * k + 1];
      minX = Math.min(minX, x - reach); maxX = Math.max(maxX, x + reach);
      minZ = Math.min(minZ, z - reach); maxZ = Math.max(maxZ, z + reach);
    }
  }
  return Number.isFinite(minX) ? [minX, minZ, maxX, maxZ] : null;
}
