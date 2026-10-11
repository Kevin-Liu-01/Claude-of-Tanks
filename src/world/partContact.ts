// src/world/partContact.ts — exact part contact for assembled kits (the buildings and landmarks lane, 2026-10-10).
//
// The owner, on the relay station's roof mast ("look at this monstrosity"): two legs splayed apart, three rungs floating
// between them and the top pole hanging over the gap. The kits' build-time gates (structureConnectivity.ts,
// maps/structureAssemblyAudit.ts) compare axis-aligned bounds with a 9-12 cm slack: a tilted leg's box reaches out to a
// rung its steel never touches, and a part merged into its bucket's one geometry has a box that touches everything. This
// module looks at the mesh itself:
//   - a geometry splits into its welded components (triangles sharing a vertex position), one per authored member even
//     after the members were merged into one buffer;
//   - two components touch when the distance between their convex hulls (GJK on their vertex sets) is within the
//     tolerance: exact for the kits' primitives (boxes, prisms, cylinders, struts), conservative for a concave one;
//   - every component must reach the ground through a chain of touching components (a flood fill from those whose
//     lowest point sits in the ground band), and a bar-like member (a strut, a rung, a brace) that stands off the
//     vertical should meet something at both of its ends.
// Renderer-free and allocation-light: receipts run it over every kit (kitConnectivity.selftest.mjs).
import type { BufferGeometry } from 'three';

interface PartComponent {
  /** the component's unique vertex positions, x y z flat */
  points: Float64Array;
  min: [number, number, number];
  max: [number, number, number];
  triangles: number;
  /** the geometry (index in the caller's list) it came from */
  source: number;
}

/**
 * Split geometries into welded components: triangles that share a vertex position (to `weld` metres) are one member.
 * Degenerate triangles join nothing; each component keeps its unique positions and bounds.
 */
export function weldedComponents(geometries: readonly BufferGeometry[], weld = 1e-4): PartComponent[] {
  const out: PartComponent[] = [];
  const inv = 1 / weld;
  geometries.forEach((geometry, source) => {
    const position = geometry.getAttribute('position');
    if (!position || position.count < 3) return;
    const index = geometry.getIndex();
    const count = index ? index.count : position.count;
    const vertexOf = (i: number) => (index ? index.getX(i) : i);
    // weld positions to ids
    const ids = new Map<string, number>();
    const idOfVertex = new Int32Array(position.count).fill(-1);
    const coords: number[] = [];
    for (let v = 0; v < position.count; v++) {
      const x = position.getX(v), y = position.getY(v), z = position.getZ(v);
      const key = `${Math.round(x * inv)},${Math.round(y * inv)},${Math.round(z * inv)}`;
      let id = ids.get(key);
      if (id === undefined) { id = coords.length / 3; ids.set(key, id); coords.push(x, y, z); }
      idOfVertex[v] = id;
    }
    // union-find over welded ids, joined by each triangle
    const parent = new Int32Array(coords.length / 3);
    for (let i = 0; i < parent.length; i++) parent[i] = i;
    const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const used = new Uint8Array(parent.length);
    const triOf: number[] = [];
    for (let t = 0; t + 2 < count; t += 3) {
      const a = idOfVertex[vertexOf(t)], b = idOfVertex[vertexOf(t + 1)], c = idOfVertex[vertexOf(t + 2)];
      if (a === b || b === c || a === c) continue;
      used[a] = used[b] = used[c] = 1;
      const ra = find(a), rb = find(b), rc = find(c);
      if (ra !== rb) parent[ra] = rb;
      const rb2 = find(rb);
      if (rc !== rb2) parent[rc] = rb2;
      triOf.push(a);
    }
    const groups = new Map<number, number[]>();
    for (let id = 0; id < parent.length; id++) {
      if (!used[id]) continue;
      const root = find(id);
      let list = groups.get(root);
      if (!list) { list = []; groups.set(root, list); }
      list.push(id);
    }
    const trianglesPerRoot = new Map<number, number>();
    for (const a of triOf) { const r = find(a); trianglesPerRoot.set(r, (trianglesPerRoot.get(r) ?? 0) + 1); }
    for (const [root, list] of groups) {
      const points = new Float64Array(list.length * 3);
      const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      list.forEach((id, k) => {
        for (let axis = 0; axis < 3; axis++) {
          const value = coords[id * 3 + axis];
          points[k * 3 + axis] = value;
          if (value < min[axis]) min[axis] = value;
          if (value > max[axis]) max[axis] = value;
        }
      });
      out.push({ points, min, max, triangles: trianglesPerRoot.get(root) ?? 0, source });
    }
  });
  return out;
}

/** The gap between two components' bounds (0 when they overlap). */
function boundsGap(a: PartComponent, b: PartComponent): number {
  let s = 0;
  for (let axis = 0; axis < 3; axis++) {
    const g = Math.max(0, b.min[axis] - a.max[axis], a.min[axis] - b.max[axis]);
    s += g * g;
  }
  return Math.sqrt(s);
}

// ------------------------------------------------------------------------------------------------- GJK distance
type V = [number, number, number];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function support(points: Float64Array, dx: number, dy: number, dz: number): V {
  let best = -Infinity, bi = 0;
  for (let i = 0; i < points.length; i += 3) {
    const d = points[i] * dx + points[i + 1] * dy + points[i + 2] * dz;
    if (d > best) { best = d; bi = i; }
  }
  return [points[bi], points[bi + 1], points[bi + 2]];
}

/** The closest point to the origin on a simplex, and the simplex reduced to the vertices that span it. */
function closestOnSimplex(simplex: V[]): { point: V; simplex: V[] } {
  if (simplex.length === 1) return { point: simplex[0], simplex };
  if (simplex.length === 2) {
    const [a, b] = simplex, ab = sub(b, a), denom = dot(ab, ab);
    const t = denom > 0 ? Math.min(1, Math.max(0, -dot(a, ab) / denom)) : 0;
    if (t <= 0) return { point: a, simplex: [a] };
    if (t >= 1) return { point: b, simplex: [b] };
    return { point: [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t], simplex };
  }
  if (simplex.length === 3) return closestOnTriangle(simplex[0], simplex[1], simplex[2]);
  // a tetrahedron: the origin inside it is contact; otherwise the nearest of the faces it lies outside
  const [a, b, c, d] = simplex;
  const faces: Array<[V, V, V, V]> = [[a, b, c, d], [a, c, d, b], [a, d, b, c], [b, d, c, a]];
  let best: { point: V; simplex: V[] } | null = null, bestD = Infinity, outsideAny = false;
  for (const [p, q, r, opposite] of faces) {
    const n = cross(sub(q, p), sub(r, p));
    const sideOrigin = -dot(n, p), sideOpposite = dot(n, sub(opposite, p));
    // the origin on the far side of this face from the fourth vertex (a flat tetrahedron counts every face)
    if (sideOrigin * sideOpposite < 0 || Math.abs(sideOpposite) < 1e-14) {
      outsideAny = true;
      const candidate = closestOnTriangle(p, q, r), dd = dot(candidate.point, candidate.point);
      if (dd < bestD) { bestD = dd; best = candidate; }
    }
  }
  if (!outsideAny || !best) return { point: [0, 0, 0], simplex };
  return best;
}

/** Ericson's closest point on a triangle to the origin, with the sub-simplex its Voronoi region names. */
function closestOnTriangle(a: V, b: V, c: V): { point: V; simplex: V[] } {
  const ab = sub(b, a), ac = sub(c, a), ap: V = [-a[0], -a[1], -a[2]];
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return { point: a, simplex: [a] };
  const bp: V = [-b[0], -b[1], -b[2]], d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return { point: b, simplex: [b] };
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return { point: [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v], simplex: [a, b] };
  }
  const cp: V = [-c[0], -c[1], -c[2]], d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return { point: c, simplex: [c] };
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return { point: [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w], simplex: [a, c] };
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return { point: [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w], simplex: [b, c] };
  }
  const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
  return { point: [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w], simplex: [a, b, c] };
}

/**
 * The distance between the convex hulls of two point sets (GJK). Returns 0 for overlapping hulls; stops early once the
 * distance is known to be under `stopBelow` (a contact test needs no more).
 */
export function convexDistance(a: Float64Array, b: Float64Array, stopBelow = 0): number {
  let v: V = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  let simplex: V[] = [];
  let best = Math.hypot(v[0], v[1], v[2]);
  for (let iteration = 0; iteration < 96; iteration++) {
    const vv = dot(v, v);
    if (vv <= 1e-18) return 0;
    const sa = support(a, -v[0], -v[1], -v[2]), sb = support(b, v[0], v[1], v[2]);
    const w = sub(sa, sb);
    // converged: the new support point brings the hull no closer than the current estimate
    if (vv - dot(v, w) <= Math.max(1e-12, vv * 1e-10)) return Math.sqrt(vv);
    if (simplex.some((p) => p[0] === w[0] && p[1] === w[1] && p[2] === w[2])) return Math.sqrt(vv);
    simplex.push(w);
    const closest = closestOnSimplex(simplex);
    simplex = closest.simplex;
    v = closest.point;
    const d = Math.hypot(v[0], v[1], v[2]);
    if (d <= stopBelow) return d;
    if (simplex.length === 4) return 0;
    best = Math.min(best, d);
  }
  return best;
}

// ------------------------------------------------------------------------------------------------- the audit
interface ConnectivityOptions {
  /** two members touch within this distance (m) */
  tolerance?: number;
  /** a member whose lowest point is under this height (the structure's frame) stands on the ground */
  groundY?: number;
  /** bar-like members (length over thickness at least this) are checked for free ends */
  barRatio?: number;
}

interface FloatingPart {
  component: number;
  source: number;
  min: [number, number, number];
  max: [number, number, number];
  /** the distance to the nearest grounded member */
  nearestGap: number;
}

interface DanglingEnd {
  component: number;
  source: number;
  end: [number, number, number];
  gap: number;
}

/** Floating members that touch each other: one loose assembly, and how far it hangs from anything grounded. */
interface FloatingIsland {
  members: number;
  min: [number, number, number];
  max: [number, number, number];
  /** the distance from the island to the nearest grounded member (m) */
  gap: number;
}

interface ConnectivityReport {
  components: number;
  grounded: number;
  floating: FloatingPart[];
  islands: FloatingIsland[];
  dangling: DanglingEnd[];
}

/** A component's principal axis by power iteration on its covariance (unit vector), its centroid and extents along it. */
function principal(points: Float64Array): { axis: V; centre: V; lo: number; hi: number; radius: number } {
  const n = points.length / 3;
  const centre: V = [0, 0, 0];
  for (let i = 0; i < points.length; i += 3) { centre[0] += points[i]; centre[1] += points[i + 1]; centre[2] += points[i + 2]; }
  centre[0] /= n; centre[1] /= n; centre[2] /= n;
  const cov = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i] - centre[0], y = points[i + 1] - centre[1], z = points[i + 2] - centre[2];
    cov[0] += x * x; cov[1] += x * y; cov[2] += x * z; cov[3] += y * y; cov[4] += y * z; cov[5] += z * z;
  }
  // start from the farthest point's direction (never orthogonal to a bar's own axis), then iterate
  let far = 0, axis: V = [1, 0, 0];
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i] - centre[0], y = points[i + 1] - centre[1], z = points[i + 2] - centre[2], d = x * x + y * y + z * z;
    if (d > far) { far = d; axis = [x, y, z]; }
  }
  if (far > 0) { const l = Math.sqrt(far); axis = [axis[0] / l, axis[1] / l, axis[2] / l]; }
  for (let k = 0; k < 24; k++) {
    const next: V = [cov[0] * axis[0] + cov[1] * axis[1] + cov[2] * axis[2], cov[1] * axis[0] + cov[3] * axis[1] + cov[4] * axis[2],
      cov[2] * axis[0] + cov[4] * axis[1] + cov[5] * axis[2]];
    const l = Math.hypot(next[0], next[1], next[2]);
    if (!(l > 0)) break;
    axis = [next[0] / l, next[1] / l, next[2] / l];
  }
  let lo = Infinity, hi = -Infinity, radius = 0;
  for (let i = 0; i < points.length; i += 3) {
    const p: V = [points[i] - centre[0], points[i + 1] - centre[1], points[i + 2] - centre[2]];
    const t = dot(p, axis);
    lo = Math.min(lo, t); hi = Math.max(hi, t);
    const perp = Math.hypot(p[0] - axis[0] * t, p[1] - axis[1] * t, p[2] - axis[2] * t);
    radius = Math.max(radius, perp);
  }
  return { axis, centre, lo, hi, radius };
}

/**
 * Every member reaches the ground through touching members; every bar standing off the vertical meets something at both
 * ends. Members are the welded components of the geometries (`weldedComponents`).
 */
export function auditPartContact(components: readonly PartComponent[], options: ConnectivityOptions = {}): ConnectivityReport {
  const tolerance = options.tolerance ?? 0.02, groundY = options.groundY ?? 0.03, barRatio = options.barRatio ?? 8;
  const n = components.length;
  const touching: number[][] = Array.from({ length: n }, () => []);
  // sweep along x: only members whose x ranges come within the tolerance are compared
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => components[a].min[0] - components[b].min[0]);
  for (let oi = 0; oi < n; oi++) {
    const i = order[oi], ci = components[i];
    for (let oj = oi + 1; oj < n; oj++) {
      const j = order[oj], cj = components[j];
      if (cj.min[0] > ci.max[0] + tolerance) break;
      if (boundsGap(ci, cj) > tolerance) continue;
      if (convexDistance(ci.points, cj.points, tolerance) <= tolerance) {
        touching[i].push(j); touching[j].push(i);
      }
    }
  }
  const grounded = new Uint8Array(n), queue: number[] = [];
  for (let i = 0; i < n; i++) if (components[i].min[1] <= groundY) { grounded[i] = 1; queue.push(i); }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const j of touching[queue[cursor]]) if (!grounded[j]) { grounded[j] = 1; queue.push(j); }
  }
  const floating: FloatingPart[] = [];
  for (let i = 0; i < n; i++) {
    if (grounded[i]) continue;
    let nearestGap = Infinity;
    for (let j = 0; j < n; j++) {
      if (!grounded[j]) continue;
      const g = boundsGap(components[i], components[j]);
      if (g >= nearestGap) continue;
      nearestGap = Math.min(nearestGap, convexDistance(components[i].points, components[j].points));
    }
    floating.push({ component: i, source: components[i].source, min: components[i].min, max: components[i].max, nearestGap });
  }
  // the floating members gathered into islands (members touching each other), each with its gap to the grounded set
  const islandOf = new Int32Array(n).fill(-1), islands: FloatingIsland[] = [];
  const byComponent = new Map(floating.map((f) => [f.component, f]));
  for (const f of floating) {
    if (islandOf[f.component] >= 0) continue;
    const island: FloatingIsland = { members: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], gap: Infinity };
    const stack = [f.component];
    islandOf[f.component] = islands.length;
    while (stack.length) {
      const i = stack.pop()!, member = byComponent.get(i)!;
      island.members++;
      island.gap = Math.min(island.gap, member.nearestGap);
      for (let axis = 0; axis < 3; axis++) {
        island.min[axis] = Math.min(island.min[axis], components[i].min[axis]);
        island.max[axis] = Math.max(island.max[axis], components[i].max[axis]);
      }
      for (const j of touching[i]) if (!grounded[j] && islandOf[j] < 0) { islandOf[j] = islands.length; stack.push(j); }
    }
    islands.push(island);
  }
  islands.sort((a, b) => b.gap - a.gap);
  // free ends of bars that stand off the vertical (a post's top is free; a rung's or a brace's end is not)
  const dangling: DanglingEnd[] = [];
  for (let i = 0; i < n; i++) {
    const c = components[i];
    if (c.points.length < 18) continue;
    const { axis, centre, lo, hi, radius } = principal(c.points);
    const length = hi - lo;
    if (length < 0.4 || length < barRatio * Math.max(radius * 2, 1e-3)) continue;
    if (Math.abs(axis[1]) > 0.9) continue;
    for (const t of [lo, hi]) {
      const cap: number[] = [];
      for (let k = 0; k < c.points.length; k += 3) {
        const p: V = [c.points[k] - centre[0], c.points[k + 1] - centre[1], c.points[k + 2] - centre[2]];
        if (Math.abs(dot(p, axis) - t) <= Math.max(0.02, radius * 1.5)) cap.push(c.points[k], c.points[k + 1], c.points[k + 2]);
      }
      if (!cap.length) continue;
      const capPoints = Float64Array.from(cap);
      let capMinY = Infinity;
      for (let k = 1; k < capPoints.length; k += 3) capMinY = Math.min(capMinY, capPoints[k]);
      if (capMinY <= groundY) continue;
      let gap = Infinity;
      for (const j of touching[i]) gap = Math.min(gap, convexDistance(capPoints, components[j].points, tolerance));
      if (gap > tolerance) {
        dangling.push({ component: i, source: c.source, end: [centre[0] + axis[0] * t, centre[1] + axis[1] * t, centre[2] + axis[2] * t], gap });
      }
    }
  }
  return { components: n, grounded: queue.length, floating, islands, dangling };
}
