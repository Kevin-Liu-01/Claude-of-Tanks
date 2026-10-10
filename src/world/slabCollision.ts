// src/world/slabCollision.ts — a convex solid's colliders in horizontal slabs (the hitbox lane, 2026-10-07).
//
// A collider part is a 2D outline extruded between two heights. A solid that leans — a tank wreck on a slope, a hedgehog's
// beam — extruded whole from its lowest to its highest point fills a wedge of air on either side: the world collider
// audit (tools/world-collider-audit.mjs) measured a third of the shell rays that met a wreck's collider and 25 % of those
// that met a hedgehog's passing more than 10 cm clear of the steel. Cut into slabs, each slab the section of the solid
// inside it, the parts lean with the solid.
//
// The solid is the convex hull of a point set (a box's corners, a wreck part's posed prism). Its section at a height is the
// convex hull of where the segments between its points cross that height, and its part between two heights the hull of
// those crossings at both and of the points between (both exact for a convex hull). Pure and deterministic.
import { convexHull2, type SimpleCollisionShape } from './collision.ts';
import { simplifyConvex } from './rockCollision.ts';

/** A slab: a convex outline (world [x, z, ...]) between two heights. */
export interface Slab {
  points: number[];
  y0: number;
  y1: number;
}

function sectionPairs(points: ArrayLike<number>, y0: number, y1: number, out: Array<[number, number]>): void {
  const n = points.length / 3;
  for (let i = 0; i < n; i++) {
    const yi = points[i * 3 + 1];
    if (yi >= y0 && yi <= y1) out.push([points[i * 3], points[i * 3 + 2]]);
    for (let j = i + 1; j < n; j++) {
      const yj = points[j * 3 + 1];
      if (yi === yj) continue;
      for (const y of [y0, y1]) {
        if ((yi - y) * (yj - y) >= 0) continue;
        const t = (y - yi) / (yj - yi);
        out.push([points[i * 3] + (points[j * 3] - points[i * 3]) * t, points[i * 3 + 2] + (points[j * 3 + 2] - points[i * 3 + 2]) * t]);
      }
    }
  }
}

/**
 * The convex hull of `points` (world x y z triples) cut into slabs of at most `band` metres from its lowest point to its
 * highest; each slab the 2D hull of the solid inside it, at most `corners` corners, heights to the centimetre. A solid no
 * taller than `band` is one slab.
 */
export function convexSlabs(points: ArrayLike<number>, band = 0.5, corners = 8): Slab[] {
  let low = Infinity, top = -Infinity;
  for (let i = 1; i < points.length; i += 3) { low = Math.min(low, points[i]); top = Math.max(top, points[i]); }
  if (!(top > low)) return [];
  const count = Math.max(1, Math.ceil((top - low) / band - 1e-6)), step = (top - low) / count;
  const slabs: Slab[] = [];
  for (let s = 0; s < count; s++) {
    const y0 = low + step * s, y1 = s === count - 1 ? top : low + step * (s + 1);
    const pairs: Array<[number, number]> = [];
    sectionPairs(points, y0, y1, pairs);
    if (pairs.length < 3) continue;
    const hull = convexHull2(pairs);
    if (hull.length < 6) continue;
    slabs.push({ points: simplifyConvex(hull, corners), y0: Math.round(y0 * 100) / 100, y1: Math.round(y1 * 100) / 100 });
  }
  return slabs;
}

/** Ranged convex collider parts of slabs. */
export function slabParts(slabs: readonly Slab[]): SimpleCollisionShape[] {
  return slabs.map((slab) => {
    let cx = 0, cz = 0;
    for (let i = 0; i < slab.points.length; i += 2) { cx += slab.points[i]; cz += slab.points[i + 1]; }
    const n = Math.max(1, slab.points.length / 2);
    return { kind: 'convex', cx: cx / n, cz: cz / n, points: slab.points.slice(), y0: slab.y0, y1: slab.y1 };
  });
}

/** The eight corners (x y z triples) of a box of half extents (hx, hy, hz) turned by a column-major 4 x 4 matrix. */
export function boxCorners(hx: number, hy: number, hz: number, matrix: ArrayLike<number>): number[] {
  const e = matrix, out: number[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = sx * hx, ly = sy * hy, lz = sz * hz;
    out.push(e[0] * lx + e[4] * ly + e[8] * lz + e[12], e[1] * lx + e[5] * ly + e[9] * lz + e[13], e[2] * lx + e[6] * ly + e[10] * lz + e[14]);
  }
  return out;
}
