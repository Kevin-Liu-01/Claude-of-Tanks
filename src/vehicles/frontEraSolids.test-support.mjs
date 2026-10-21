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
// (one visit per triangle per query: a global stamp, so two solids never share a mark)
let STAMP = 0;
const SCRATCH_RAY = new THREE.Ray(), SCRATCH_HIT = new THREE.Vector3(), SCRATCH_CP = new THREE.Vector3();

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
  // (a numeric cell key: coordinates within 250 m of the origin at 5 cm cells)
  #key(i, j, k) { return ((i + 5000) * 10000 + (j + 5000)) * 10000 + (k + 5000); }
  #cover(box, f) {
    const c = this.cell;
    for (let i = Math.floor(box.min.x / c); i <= Math.floor(box.max.x / c); i++)
      for (let j = Math.floor(box.min.y / c); j <= Math.floor(box.max.y / c); j++)
        for (let k = Math.floor(box.min.z / c); k <= Math.floor(box.max.z / c); k++) f(this.#key(i, j, k));
  }
  /** Inside the closed piece: an odd number of crossings along all three ray directions. */
  inside(p) {
    if (!this.box.containsPoint(p)) return false;
    const ray = SCRATCH_RAY, hit = SCRATCH_HIT, c = this.cell;
    for (const [n, d] of DIRS.entries()) {
      // (round 10, the critic's UAPL-C8-6: a stamp on each triangle instead of a Set per ray; the same crossings)
      const [u, w] = PLANE[n], pu = Math.floor(p.getComponent(u) / c), pw = Math.floor(p.getComponent(w) / c), stamp = ++STAMP;
      const pn = p.getComponent(n) - 1e-3;
      ray.set(p, d);
      let crossings = 0;
      for (let i = pu - 1; i <= pu + 1; i++) for (let j = pw - 1; j <= pw + 1; j++) {
        const list = this.planes[n].get(i * 1000003 + j);
        if (!list) continue;
        for (const t of list) {
          if (t.stamp === stamp) continue; t.stamp = stamp;
          if (t.box.max.getComponent(n) < pn) continue;
          if (ray.intersectTriangle(t.tri.a, t.tri.b, t.tri.c, false, hit)) crossings++;
        }
      }
      if (crossings % 2 === 0) return false;
    }
    return true;
  }
  /** The distance from p to the piece's nearest surface within `far` (Infinity past it). */
  distance(p, far = .1) {
    const cp = SCRATCH_CP, stamp = ++STAMP, c = this.cell;
    let best = Infinity;
    for (let i = Math.floor((p.x - far) / c); i <= Math.floor((p.x + far) / c); i++)
      for (let j = Math.floor((p.y - far) / c); j <= Math.floor((p.y + far) / c); j++)
        for (let k = Math.floor((p.z - far) / c); k <= Math.floor((p.z + far) / c); k++) {
          const list = this.cells.get(this.#key(i, j, k));
          if (!list) continue;
          for (const t of list) {
            if (t.stamp === stamp) continue; t.stamp = stamp;
            t.tri.closestPointToPoint(p, cp);
            const d = cp.distanceTo(p);
            if (d < best) best = d;
          }
        }
    return best <= far ? best : Infinity;
  }
  /** How deep p lies inside the piece (0 outside). (Round 10, UAPL-C8-6: a seated point lies a few millimetres in, so
   * the nearest surface is first sought within 12 mm (a few cells; every triangle that close is listed in them) and the
   * full reach only when none is that near: the same distance.) */
  depth(p, far = .1) {
    if (!this.inside(p)) return 0;
    const near = this.distance(p, Math.min(.012, far));
    return Number.isFinite(near) ? near : this.distance(p, far);
  }
}

/** A part's vertices and points over its faces at most `step` apart. */
export function surfaceSamples(tris, step) {
  const out = [];
  for (const t of tris) {
    // (round 10, UAPL-C8-6: a triangle's samples are its own, whatever else is sampled with it: kept on it per step)
    if (t.samplesStep === step) { for (const q of t.samples) out.push(q); continue; }
    const from = out.length, {tri} = t;
    const {a, b, c} = tri;
    out.push(a, b, c);
    const n = Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / step);
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
      if ((i === 0 && j === 0) || (i === n && j === 0) || (i === 0 && j === n)) continue;
      out.push(a.clone().multiplyScalar(1 - (i + j) / n).addScaledVector(b, i / n).addScaledVector(c, j / n));
    }
    t.samples = out.slice(from); t.samplesStep = step;
  }
  return out;
}

/** The triangles of `tris` whose boxes meet `box`, in their order, through a lazily built 10 cm cell index kept on the
 * array (round 10, UAPL-C8-6: the receipt filtered a whole hull shell's triangles once per new part). */
export function trianglesIn(tris, box) {
  if (tris.length < 64) return tris.filter(t => t.box.intersectsBox(box));
  const C = .1, key = (i, j, k) => ((i + 2500) * 5000 + (j + 2500)) * 5000 + (k + 2500);
  if (!tris.cellIndex) {
    const index = new Map();
    tris.forEach((t, n) => {
      for (let i = Math.floor(t.box.min.x / C); i <= Math.floor(t.box.max.x / C); i++)
        for (let j = Math.floor(t.box.min.y / C); j <= Math.floor(t.box.max.y / C); j++)
          for (let k = Math.floor(t.box.min.z / C); k <= Math.floor(t.box.max.z / C); k++) {
            const kk = key(i, j, k); let l = index.get(kk); if (!l) index.set(kk, l = []); l.push(n);
          }
    });
    Object.defineProperty(tris, 'cellIndex', {value: index});
  }
  const picked = new Set();
  for (let i = Math.floor(box.min.x / C); i <= Math.floor(box.max.x / C); i++)
    for (let j = Math.floor(box.min.y / C); j <= Math.floor(box.max.y / C); j++)
      for (let k = Math.floor(box.min.z / C); k <= Math.floor(box.max.z / C); k++)
        for (const n of tris.cellIndex.get(key(i, j, k)) ?? []) picked.add(n);
  return [...picked].sort((a, b) => a - b).map(n => tris[n]).filter(t => t.box.intersectsBox(box));
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
