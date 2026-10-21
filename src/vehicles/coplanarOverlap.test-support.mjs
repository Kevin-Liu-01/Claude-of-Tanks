// Release 227 (national lamp guards): the exact same-facing coplanar overlap of census parts (cnTurretGeometry.test-
// support.mjs censusPart: owner-local triangle soups with their boxes). That module's sampled coplanarOverlap tests seven
// points per triangle, so a thin face strip (the 5.6 mm flat of a 9 mm guard post lying against a plate's end) can slip
// between them, and an edge midpoint on the edge two neighbouring faces share can fall "inside" the neighbour by float
// noise and count a seventh of a large face. Here each pair of parallel same-facing faces within `tol` of one plane is
// clipped exactly (Sutherland-Hodgman in the receiving face's plane), and only the overlap polygon is sampled, to tell
// its visible part from the part hidden inside a third solid.
import { insideClosed } from './cnTurretGeometry.test-support.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : null; };
const vertex = (T, t, k) => [T[t + 3 * k], T[t + 3 * k + 1], T[t + 3 * k + 2]];

/** A triangle's plane: its unit normal (by winding), offset, area and an in-plane basis (u along its first edge). */
function plane(T, t) {
  const a = vertex(T, t, 0), e1 = sub(vertex(T, t, 1), a), c = cross(e1, sub(vertex(T, t, 2), a)), area = Math.hypot(...c) / 2;
  const n = unit(c), u = unit(e1);
  if (!n || !u || area < 1e-10) return null;
  return { a, n, d: dot(n, a), u, v: cross(n, u), area };
}
const shoelace = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
/** The convex polygon `poly` clipped to the counter-clockwise triangle `clip` (2D). */
function clipToTriangle(poly, clip) {
  let out = poly;
  for (let e = 0; e < 3 && out.length; e++) {
    const p = clip[e], q = clip[(e + 1) % 3], side = (r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const r = out[i], s = out[(i + 1) % out.length], sr = side(r), ss = side(s);
      if (sr >= 0) next.push(r);
      if ((sr >= 0) !== (ss >= 0)) { const f = sr / (sr - ss); next.push([r[0] + f * (s[0] - r[0]), r[1] + f * (s[1] - r[1])]); }
    }
    out = next;
  }
  return out;
}
/** Grid samples (spacing <= `step`, at least the centroid) inside a convex 2D polygon. */
function polygonSamples(poly, step) {
  const sign = Math.sign(shoelace(poly)) || 1, inside = (x, y) => poly.every((p, i) => {
    const q = poly[(i + 1) % poly.length]; return sign * ((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0])) >= 0;
  });
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]), out = [];
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const nx = Math.max(1, Math.ceil((x1 - x0) / step)), ny = Math.max(1, Math.ceil((y1 - y0) / step));
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x = x0 + (i + .5) * (x1 - x0) / nx, y = y0 + (j + .5) * (y1 - y0) / ny;
    if (inside(x, y)) out.push([x, y]);
  }
  if (!out.length) out.push([xs.reduce((s, x) => s + x, 0) / xs.length, ys.reduce((s, y) => s + y, 0) / ys.length]);
  return out;
}

/** The area (m^2) where faces of A lie on parallel, same-facing faces of B (every vertex of A's face within `tol` of B's
 * plane), and the visible part of it (`isHidden(x, y, z)` on B's plane). Opposite-facing coplanar faces are two parts
 * resting face to face (both hidden) and do not count. */
export function exactCoplanarOverlap(A, B, { tol = .002, minDot = .9995, isHidden = () => false, step = .0015 } = {}) {
  let area = 0, visible = 0;
  const bPlanes = []; for (let s = 0; s < B.tri.length; s += 9) bPlanes.push(plane(B.tri, s));
  for (let t = 0; t < A.tri.length; t += 9) {
    const fa = plane(A.tri, t); if (!fa) continue;
    const va = [0, 1, 2].map((k) => vertex(A.tri, t, k));
    for (let s = 0, k = 0; s < B.tri.length; s += 9, k++) {
      const fb = bPlanes[k]; if (!fb || dot(fa.n, fb.n) < minDot || va.some((p) => Math.abs(dot(fb.n, p) - fb.d) > tol)) continue;
      const to2 = (p) => { const r = sub(p, fb.a); return [dot(r, fb.u), dot(r, fb.v)]; };
      const poly = clipToTriangle(va.map(to2), [0, 1, 2].map((m) => to2(vertex(B.tri, s, m))));
      if (poly.length < 3) continue;
      const a = Math.abs(shoelace(poly)); if (a < 1e-12) continue;
      const S = polygonSamples(poly, step);
      const shown = S.filter(([x, y]) => !isHidden(fb.a[0] + x * fb.u[0] + y * fb.v[0], fb.a[1] + x * fb.u[1] + y * fb.v[1], fb.a[2] + x * fb.u[2] + y * fb.v[2])).length;
      area += a; visible += a * shown / S.length;
    }
  }
  return { area, visible };
}

/** Z-fighting among census parts: every pair of parts in different buckets (materials), at least one of them selected
 * by `involve`, whose same-facing coplanar overlap shows more than `minArea` m^2. A point inside a third closed part of
 * `parts` (glass and open lattice see-through, so never hiding) is hidden. Returns [{A, B, area, visible}]. */
export function zFightCensus(parts, { involve = (p) => Boolean(p.role), tol = .002, minArea = 1e-5 } = {}) {
  const hiders = parts.filter((q) => !/Glass$|OpenLattice$/.test(q.bucket));
  const out = [];
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const A = parts[i], B = parts[j];
    if (A.bucket === B.bucket || !(involve(A) || involve(B)) || !A.box.clone().expandByScalar(tol).intersectsBox(B.box)) continue;
    const isHidden = (x, y, z) => hiders.some((q) => q !== A && q !== B && x >= q.box.min.x && x <= q.box.max.x
      && y >= q.box.min.y && y <= q.box.max.y && z >= q.box.min.z && z <= q.box.max.z && insideClosed(q, x, y, z));
    const r = exactCoplanarOverlap(A, B, { tol, isHidden });
    if (r.visible > minArea) out.push({ A, B, ...r });
  }
  return out;
}
