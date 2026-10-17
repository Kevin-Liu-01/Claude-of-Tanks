// src/world/maps/regional/roundedBody.ts — a house body's worn, rounded corners (the looks lane, 2026-10-17; WORKPLAN-227
// §5: Siwa's kershef houses through the house grammar). The grammar (house.ts buildHouse) builds a body square-cornered;
// a mud house's corners are worn round, a hand to a metre and a half across. Its parts are cut by vertical planes
// through the four corner squares (sliceParts: every triangle split along them, every attribute carried), then every
// point inside a corner square is turned onto the quarter round (roundCorners): the walls, the footing and its course,
// the drip strip, the roof deck and every craft the grammar laid on them bend round together, their normals with them,
// so a corner shades as a curved wall, not a facet. A box's corner square is rc on a side; n strips to a side give the
// arc 2n segments (n = 2: the four segments a quarter of roundedRing's arcs, point for point, so a parapet ring laid on
// the rounded body meets its top edge exactly).
import * as THREE from 'three';
import type { RegionalParts } from './geometry.ts';

/** A body's plan box (its walls' outer faces) in the frame its parts are in. */
export interface BodyBox { x0: number; z0: number; x1: number; z1: number }

/**
 * A cutting plane through the corner squares: x = c (axis 0) or z = c (axis 2), cutting only what reaches into the
 * corner squares' band across the other axis (a polygon lying wholly between them needs no cut: nothing of it bends).
 */
interface CornerPlane { axis: 0 | 2; c: number; lo: number; hi: number }

/** The planes through a box's corner squares, `n` strips across each square (the z planes first: they part the bands). */
function cornerPlanes(box: BodyBox, rc: number, n: number): CornerPlane[] {
  const zs: CornerPlane[] = [], xs: CornerPlane[] = [];
  for (let j = 0; j <= n; j++) {
    const f = 1 - j / n;
    zs.push({ axis: 2, c: box.z0 + rc * f, lo: box.x0 + rc, hi: box.x1 - rc }, { axis: 2, c: box.z1 - rc * f, lo: box.x0 + rc, hi: box.x1 - rc });
    xs.push({ axis: 0, c: box.x0 + rc * f, lo: box.z0 + rc, hi: box.z1 - rc }, { axis: 0, c: box.x1 - rc * f, lo: box.z0 + rc, hi: box.z1 - rc });
  }
  return [...zs, ...xs];
}

const SNAP = 1e-6;

/**
 * Round a body's corners in place: its parts cut through the corner squares (rc on a side, `n` strips a side), then
 * every point in them turned onto the quarter rounds (roundCorners). `uncut(y)` names the heights of the level faces
 * the cut may leave whole — the floors between storeys, a footing's buried base: hidden in the body, their corners turn
 * onto the arcs and their edges stay inside the walls. The parts must be non-indexed (PartSink's are).
 */
export function roundBody(parts: RegionalParts, box: BodyBox, rc: number, opts: { n?: number; uncut?: (y: number) => boolean } = {}): void {
  const planes = cornerPlanes(box, rc, opts.n ?? 2);
  for (const list of Object.values(parts)) for (const g of list) sliceGeometry(g, planes, opts.uncut);
  roundCorners(parts, box, rc);
}

/**
 * Split every triangle of a geometry along the planes (each a convex polygon cut in two where a plane crosses it, a
 * point within a micrometre of a plane counted on it), fanned back into triangles. Every vertex attribute is carried by
 * interpolation (an integer attribute rounded).
 */
function sliceGeometry(g: THREE.BufferGeometry, planes: readonly CornerPlane[], uncut?: (y: number) => boolean): void {
  if (g.index) return;
  const names = Object.keys(g.attributes);
  const attrs = names.map((name) => g.getAttribute(name) as THREE.BufferAttribute);
  const sizes = attrs.map((a) => a.itemSize);
  const offsets: number[] = [];
  let stride = 0;
  for (const s of sizes) { offsets.push(stride); stride += s; }
  const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos) return;
  const po = offsets[names.indexOf('position')];
  // planes that cross the geometry's extent at all
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const live = planes.filter(({ axis, c }) => (axis === 0 ? bb.min.x < c - SNAP && bb.max.x > c + SNAP : bb.min.z < c - SNAP && bb.max.z > c + SNAP));
  if (!live.length) return;
  const record = (i: number): number[] => {
    const r = new Array<number>(stride);
    for (let a = 0; a < attrs.length; a++) for (let k = 0; k < sizes[a]; k++) r[offsets[a] + k] = attrs[a].getComponent(i, k);
    return r;
  };
  const out: number[] = [];
  let cut = false;
  for (let t = 0; t + 2 < pos.count; t += 3) {
    let polys: number[][][] = [[record(t), record(t + 1), record(t + 2)]];
    const y = polys[0][0][po + 1];
    if (uncut && Math.abs(polys[0][1][po + 1] - y) < SNAP && Math.abs(polys[0][2][po + 1] - y) < SNAP && uncut(y)) {
      for (const v of polys[0]) out.push(...v);
      continue;
    }
    for (const { axis, c, lo: bandLo, hi: bandHi } of live) {
      const at = po + axis, other = po + 2 - axis, next: number[][][] = [];
      for (const poly of polys) {
        let lo = Infinity, hi = -Infinity, olo = Infinity, ohi = -Infinity;
        for (const v of poly) { lo = Math.min(lo, v[at]); hi = Math.max(hi, v[at]); olo = Math.min(olo, v[other]); ohi = Math.max(ohi, v[other]); }
        if (lo >= c - SNAP || hi <= c + SNAP || (olo >= bandLo - SNAP && ohi <= bandHi + SNAP)) { next.push(poly); continue; }
        const a: number[][] = [], b: number[][] = [];
        for (let i = 0; i < poly.length; i++) {
          const p = poly[i], q = poly[(i + 1) % poly.length];
          const dp = Math.abs(p[at] - c) < SNAP ? 0 : p[at] - c, dq = Math.abs(q[at] - c) < SNAP ? 0 : q[at] - c;
          if (dp <= 0) a.push(p);
          if (dp >= 0) b.push(p);
          if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
            const s = dp / (dp - dq), m = p.map((x, k) => x + (q[k] - x) * s);
            m[at] = c;
            a.push(m); b.push(m);
          }
        }
        if (a.length >= 3) next.push(a);
        if (b.length >= 3) next.push(b);
        cut = true;
      }
      polys = next;
    }
    for (const poly of polys) for (let k = 1; k + 1 < poly.length; k++) out.push(...poly[0], ...poly[k], ...poly[k + 1]);
  }
  if (!cut) return;
  const count = out.length / stride;
  for (let a = 0; a < attrs.length; a++) {
    const src = attrs[a], size = sizes[a], off = offsets[a];
    const integer = !(src.array instanceof Float32Array || src.array instanceof Float64Array);
    const Ctor = src.array.constructor as new (n: number) => THREE.TypedArray;
    const arr = new Ctor(count * size);
    for (let i = 0; i < count; i++) for (let k = 0; k < size; k++) {
      const v = out[i * stride + off + k];
      arr[i * size + k] = integer ? Math.round(v) : v;
    }
    g.setAttribute(names[a], new THREE.BufferAttribute(arr, size, src.normalized));
  }
  g.computeBoundingBox();
}

/**
 * Turn every point inside a corner square of the box (rc on a side, its inner corner the arc's centre) onto the quarter
 * round: a point `m` out from the centre along the square's edge (the larger of its two offsets) goes to radius m, at
 * an angle in proportion to its run along that edge, so the wall's straight run from the square's inner edge to the
 * corner becomes the arc's quarter, a footing standing proud of the wall the arc a hand outside it. Normals turn with
 * the surface (the map's inverse transpose). Points outside the corner squares are not moved.
 */
function roundCorners(parts: RegionalParts, box: BodyBox, rc: number): void {
  const Q = Math.PI / 4;
  for (const list of Object.values(parts)) for (const g of list) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined, nor = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    let moved = false;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const sx = x > box.x1 - rc ? 1 : x < box.x0 + rc ? -1 : 0, sz = z > box.z1 - rc ? 1 : z < box.z0 + rc ? -1 : 0;
      if (!sx || !sz) continue;
      const cx = sx > 0 ? box.x1 - rc : box.x0 + rc, cz = sz > 0 ? box.z1 - rc : box.z0 + rc;
      const a = sx * (x - cx), b = sz * (z - cz);
      if (a <= 0 || b <= 0) continue;
      // (a, b) -> (a', b') and its Jacobian [[p, q], [r, s]] (rows a', b'; columns a, b)
      let a2: number, b2: number, p: number, q: number, r: number, s: number;
      if (a >= b) {
        const th = Q * b / a, c = Math.cos(th), sn = Math.sin(th);
        a2 = a * c; b2 = a * sn;
        p = c + th * sn; q = -Q * sn; r = sn - th * c; s = Q * c;
      } else {
        const ph = Q * a / b, c = Math.cos(ph), sn = Math.sin(ph);
        a2 = b * sn; b2 = b * c;
        p = Q * c; q = sn - ph * c; r = -Q * sn; s = c + ph * sn;
      }
      pos.setX(i, cx + sx * a2);
      pos.setZ(i, cz + sz * b2);
      moved = true;
      if (!nor) continue;
      const det = p * s - q * r;
      if (Math.abs(det) < 1e-12) continue;
      const na = sx * nor.getX(i), nb = sz * nor.getZ(i), ny = nor.getY(i);
      const ma = (s * na - r * nb) / det, mb = (-q * na + p * nb) / det;
      const l = Math.hypot(ma, ny, mb) || 1;
      nor.setXYZ(i, sx * ma / l, ny / l, sz * mb / l);
    }
    if (!moved) continue;
    pos.needsUpdate = true;
    if (nor) nor.needsUpdate = true;
    g.computeBoundingBox();
  }
}
