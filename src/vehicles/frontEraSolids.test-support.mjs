// Release 227, round 7 (2026-10-18; the critic's UAPL-R5C-3: "the new receipt does not bite on permanent new parts
// (frames, bars, uprights, lids, end plates, housings): a part floating off its seat, or buried in the casting or hull
// shell, passes"): closed-piece solids for frontEraPackages.selftest.mjs. A Solid answers whether a point lies inside a
// closed piece (an odd number of crossings along each of three near-axis rays) and how deep (its
// distance to the piece's nearest surface), from hashed triangles so a whole vehicle's new parts are measured in seconds;
// surfaceSamples lays a part's vertices and points over its faces at a given spacing (a straight bar's middle buried in a
// convex dome has no vertex there).
import * as THREE from 'three';

// (near-axis rays, slightly skewed so none runs along a box's edge or face; each hashed on the plane square to it)
const DIRS = [new THREE.Vector3(1, 1e-4, 2e-4), new THREE.Vector3(3e-4, 1, 1e-4), new THREE.Vector3(2e-4, 3e-4, 1)].map(d => d.normalize());
const PLANE = [[1, 2], [0, 2], [0, 1]];

/** Triangles of a geometry (optionally transformed) as {a, b, c, box}. */
export function trianglesOf(g, matrix = null) {
  const p = g.getAttribute('position'), ix = g.index, out = [];
  for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
    const v = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, ix ? ix.getX(i + k) : i + k));
    if (matrix) for (const q of v) q.applyMatrix4(matrix);
    const tri = new THREE.Triangle(v[0], v[1], v[2]);
    if (tri.getArea() < 1e-10) continue;
    out.push({tri, box: new THREE.Box3().setFromPoints(v)});
  }
  return out;
}

export class Solid {
  /** @param {{tri: THREE.Triangle, box: THREE.Box3}[]} tris */
  constructor(tris, cell = .05) {
    this.tris = tris; this.cell = cell; this.box = new THREE.Box3();
    this.cells = new Map();
    for (const t of tris) {
      this.box.union(t.box);
      this.#cover(t.box, k => { let l = this.cells.get(k); if (!l) this.cells.set(k, l = []); l.push(t); });
    }
    this.size = this.box.getSize(new THREE.Vector3()).length();
    // per ray direction, the triangles hashed on the plane square to it
    this.planes = PLANE.map(([u, w]) => {
      const map = new Map();
      for (const t of tris) for (let i = Math.floor(t.box.min.getComponent(u) / cell); i <= Math.floor(t.box.max.getComponent(u) / cell); i++)
        for (let j = Math.floor(t.box.min.getComponent(w) / cell); j <= Math.floor(t.box.max.getComponent(w) / cell); j++) {
          const k = i * 1000003 + j; let l = map.get(k); if (!l) map.set(k, l = []); l.push(t);
        }
      return map;
    });
  }
  #key(i, j, k) { return `${i},${j},${k}`; }
  #cover(box, f) {
    const c = this.cell;
    for (let i = Math.floor(box.min.x / c); i <= Math.floor(box.max.x / c); i++)
      for (let j = Math.floor(box.min.y / c); j <= Math.floor(box.max.y / c); j++)
        for (let k = Math.floor(box.min.z / c); k <= Math.floor(box.max.z / c); k++) f(this.#key(i, j, k));
  }
  /** Inside the closed piece: an odd number of crossings along all three ray directions. */
  inside(p) {
    if (!this.box.containsPoint(p)) return false;
    const ray = new THREE.Ray(), hit = new THREE.Vector3(), c = this.cell;
    for (const [n, d] of DIRS.entries()) {
      const [u, w] = PLANE[n], pu = Math.floor(p.getComponent(u) / c), pw = Math.floor(p.getComponent(w) / c), seen = new Set();
      ray.set(p, d);
      let crossings = 0;
      for (let i = pu - 1; i <= pu + 1; i++) for (let j = pw - 1; j <= pw + 1; j++) for (const t of this.planes[n].get(i * 1000003 + j) ?? []) {
        if (seen.has(t)) continue; seen.add(t);
        if (t.box.max.getComponent(n) < p.getComponent(n) - 1e-3) continue;
        if (ray.intersectTriangle(t.tri.a, t.tri.b, t.tri.c, false, hit)) crossings++;
      }
      if (crossings % 2 === 0) return false;
    }
    return true;
  }
  /** The distance from p to the piece's nearest surface within `far` (Infinity past it). */
  distance(p, far = .1) {
    const cp = new THREE.Vector3(), seen = new Set();
    let best = Infinity;
    this.#cover(new THREE.Box3(p.clone().subScalar(far), p.clone().addScalar(far)), k => {
      for (const t of this.cells.get(k) ?? []) {
        if (seen.has(t)) continue; seen.add(t);
        t.tri.closestPointToPoint(p, cp);
        best = Math.min(best, cp.distanceTo(p));
      }
    });
    return best <= far ? best : Infinity;
  }
  /** How deep p lies inside the piece (0 outside). */
  depth(p, far = .1) { return this.inside(p) ? this.distance(p, far) : 0; }
}

/** A part's vertices and points over its faces at most `step` apart. */
export function surfaceSamples(tris, step) {
  const out = [];
  for (const {tri} of tris) {
    const {a, b, c} = tri;
    out.push(a, b, c);
    const n = Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / step);
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      if ((i === 0 && j === 0) || (i === n && j === 0) || (i === 0 && j === n)) continue;
      out.push(a.clone().multiplyScalar(1 - (i + j) / n).addScaledVector(b, i / n).addScaledVector(c, j / n));
    }
  }
  return out;
}

/** The deepest of `points` inside `solid`, with where it is. */
export function deepest(points, solid) {
  let depth = 0, at = null;
  for (const q of points) {
    if (!solid.box.containsPoint(q)) continue;
    const d = solid.depth(q);
    if (d > depth) { depth = d; at = q; }
  }
  return {depth, at};
}
