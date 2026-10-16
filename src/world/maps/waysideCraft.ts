// src/world/maps/waysideCraft.ts — the mesh tools the wayside monuments are cut with (props census #11, the looks lane,
// 2026-10-15), over craftMesh.ts's member writer: stone faces split into cells so their weathering reads across them
// (black mould runs, lichen, a damp foot), tapered blocks for splays and washes, polygons extruded (gables, spandrels,
// reliefs), lathes with smooth normals (finials, urns, balls), a shaft cut off ragged (a monument snapped above its
// plinth), and the moves that lay a written group down. Pure geometry: no materials, no draws from any stream (the
// weathering is hash noise over the corner's position).
import * as THREE from 'three';
import { Mesh, X, Y, Z, add, cross, dot, hash, member as memberImpl, mix, mul, norm, scl, sub, type Rgb, type UvMode, type V3 } from './craftMesh.ts';

/** A corner's colour (linear albedo) from its place and its face's normal. */
export type Shade = (q: V3, n: V3) => Rgb;

export const FLAT: UvMode = { kind: 'flat' };
export const G = (u0: number): UvMode => ({ kind: 'grain', u0 });

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Value noise in [0, 1): the hash on the integer lattice, smoothly interpolated. */
function vnoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const h = (a: number, b: number, c: number) => hash(a + c * 7919, b, seed);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const x00 = lerp(h(ix, iy, iz), h(ix + 1, iy, iz), sx), x10 = lerp(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), sx);
  const x01 = lerp(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), sx), x11 = lerp(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), sx);
  return lerp(lerp(x00, x10, sy), lerp(x01, x11, sy), sz);
}

/** How a stone (or a rendered, painted) surface has weathered. */
export interface Weathering {
  base: Rgb;
  seed: number;
  /** The ground's height in the build's frame: the damp foot darkens up from it. */
  foot?: number;
  damp?: number;
  /** Mottling of the tone at the hand scale (0..). */
  mottle?: number;
  /** Black mould runs down the vertical faces (0..1): their strength. */
  mould?: number;
  /** Lichen on the tops and the weather side (0..1). */
  lichen?: number;
  lichenCol?: Rgb;
  /** Green algae up from the foot (the monsoon's tombs). */
  algae?: number;
}

const LICHEN: Rgb = [0.36, 0.38, 0.27];
const ALGAE: Rgb = [0.09, 0.14, 0.06];

/** A surface's weathering as a corner shade: mottle, damp foot, mould runs, algae, lichen. */
export function weathered(w: Weathering): Shade {
  return (q, n) => {
    const mot = 1 + (w.mottle ?? 0.1) * (vnoise(q[0] * 4.1, q[1] * 4.1, q[2] * 4.1, w.seed) - 0.5) * 2;
    let c = mul(w.base, mot);
    c = mul(c, 1 - (w.damp ?? 0.22) * (1 - smooth(0, 0.55, q[1] - (w.foot ?? 0))));
    if (w.mould && Math.abs(n[1]) < 0.55) {
      // the runs: narrow across the face, long down it, strongest under the drip edge above
      const across = Math.abs(n[0]) > Math.abs(n[2]) ? q[2] : q[0];
      const run = smooth(0.52, 0.86, vnoise(across * 11 + 3.3, q[1] * 0.9, 0.5, w.seed + 7));
      c = mul(c, 1 - w.mould * run);
    }
    if (w.algae) {
      const a = (1 - smooth(0, 0.45, q[1] - (w.foot ?? 0))) * smooth(0.35, 0.7, vnoise(q[0] * 5, q[1] * 3, q[2] * 5, w.seed + 19));
      c = mix(c, ALGAE, a * w.algae);
    }
    if (w.lichen) {
      const up = Math.max(0, n[1]);
      const l = smooth(0.58, 0.74, vnoise(q[0] * 6.3, q[1] * 6.3, q[2] * 6.3, w.seed + 13)) * (0.25 + 0.75 * up);
      c = mix(c, w.lichenCol ?? LICHEN, l * w.lichen);
    }
    return c;
  };
}

/** A shade of one colour. */
export const plain = (c: Rgb): Shade => () => c;
/** A shade darkened (a recess's occlusion, a soffit). */
export const dim = (s: Shade, k: number): Shade => (q, n) => mul(s(q, n), k);

function uvFn(m: Mesh, mode: UvMode): (q: V3, n: V3) => [number, number] {
  if (mode.kind === 'flat') { const f = m.surface.flatUv ?? [0.5, 0.5]; return () => [f[0], f[1]]; }
  if (mode.kind === 'masonry') {
    return (q, n) => (Math.abs(n[1]) > 0.6 ? [q[0] * 0.5, q[2] * 0.5] : Math.abs(n[0]) > 0.5 ? [q[2] * 0.5, q[1] * 0.5] : [q[0] * 0.5, q[1] * 0.5]);
  }
  // grain along the longest way of the face (a board's)
  const u0 = mode.u0;
  return (q, n) => (Math.abs(n[1]) > 0.6 ? [u0 + q[0] * 0.12, q[2] * 0.55] : Math.abs(n[0]) > 0.5 ? [u0 + q[2] * 0.12, q[1] * 0.55] : [u0 + q[0] * 0.12, q[1] * 0.55]);
}

/** One triangle wound to face `out` (its flat normal its own). */
function tri(m: Mesh, a: V3, b: V3, c: V3, out: V3, shade: Shade, mode: UvMode = FLAT): void {
  let g = cross(sub(b, a), sub(c, a));
  const len = Math.hypot(g[0], g[1], g[2]);
  if (len < 1e-10) return;
  g = scl(g, 1 / len);
  if (dot(g, out) < 0) { const t = b; b = c; c = t; g = scl(g, -1); }
  const uv = uvFn(m, mode), printed = mode.kind !== 'flat';
  const col = m.colour(shade(scl(add(add(a, b), c), 1 / 3), g), printed);
  const ua = uv(a, g), ub = uv(b, g), uc = uv(c, g);
  m.tri(a, b, c, g, g, g, ua, ub, uc, col);
}

/** A quad split into a grid of cells about `cell` metres (corners a b c d in order round it). */
export function gridQuad(m: Mesh, a: V3, b: V3, c: V3, d: V3, out: V3, shade: Shade, cell: number, mode: UvMode = FLAT): void {
  const nu = Math.max(1, Math.round(Math.hypot(...sub(b, a)) / cell)), nv = Math.max(1, Math.round(Math.hypot(...sub(d, a)) / cell));
  const at = (u: number, v: number): V3 => {
    const p0 = add(a, scl(sub(b, a), u)), p1 = add(d, scl(sub(c, d), u));
    return add(p0, scl(sub(p1, p0), v));
  };
  const uv = uvFn(m, mode), printed = mode.kind !== 'flat';
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    m.quad(at(i / nu, j / nv), at((i + 1) / nu, j / nv), at((i + 1) / nu, (j + 1) / nv), at(i / nu, (j + 1) / nv), out, uv, shade, printed);
  }
}

export type Faces = Partial<Record<'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz', boolean>>;

/** An axis-aligned block from `lo` to `hi`, each face split into cells about `cell` metres; `skip` faces left out. */
export function gbox(m: Mesh, lo: V3, hi: V3, shade: Shade, cell = 0.2, skip: Faces = {}, mode: UvMode = FLAT): void {
  const [x0, y0, z0] = lo, [x1, y1, z1] = hi;
  if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
  if (!skip.px) gridQuad(m, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], X, shade, cell, mode);
  if (!skip.nx) gridQuad(m, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], shade, cell, mode);
  if (!skip.py) gridQuad(m, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], Y, shade, cell, mode);
  if (!skip.ny) gridQuad(m, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], shade, cell, mode);
  if (!skip.pz) gridQuad(m, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], Z, shade, cell, mode);
  if (!skip.nz) gridQuad(m, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], shade, cell, mode);
}

/**
 * A tapered block (a splay, a wash, a moulding's chamfer) centred on (cx, cz): w0 x d0 at y0 to w1 x d1 at y1; `caps`
 * which ends are closed.
 */
export function frustum(m: Mesh, cx: number, cz: number, y0: number, y1: number, w0: number, d0: number, w1: number, d1: number,
  shade: Shade, caps: 'both' | 'top' | 'bottom' | 'none' = 'both', mode: UvMode = FLAT): void {
  const b: V3[] = [[cx - w0 / 2, y0, cz - d0 / 2], [cx + w0 / 2, y0, cz - d0 / 2], [cx + w0 / 2, y0, cz + d0 / 2], [cx - w0 / 2, y0, cz + d0 / 2]];
  const t: V3[] = [[cx - w1 / 2, y1, cz - d1 / 2], [cx + w1 / 2, y1, cz - d1 / 2], [cx + w1 / 2, y1, cz + d1 / 2], [cx - w1 / 2, y1, cz + d1 / 2]];
  const outs: V3[] = [[0, 0, -1], X, Z, [-1, 0, 0]];
  const uv = uvFn(m, mode), printed = mode.kind !== 'flat';
  for (let k = 0; k < 4; k++) {
    const j = (k + 1) % 4;
    const e = norm(sub(add(t[k], t[j]), add(b[k], b[j])));
    const out = norm(sub(outs[k], scl(e, dot(outs[k], e))));
    m.quad(b[k], b[j], t[j], t[k], out, uv, shade, printed);
  }
  if (caps === 'both' || caps === 'top') m.quad(t[0], t[1], t[2], t[3], Y, uv, shade, printed);
  if (caps === 'both' || caps === 'bottom') m.quad(b[0], b[3], b[2], b[1], [0, -1, 0], uv, shade, printed);
}

/**
 * A polygon in the XY plane (points in order, star-shaped about point `fan`) extruded along Z from z0 to z1: a gable,
 * a spandrel, a relief's figure. `ends` closes the faces at z0 and z1.
 */
export function prismZ(m: Mesh, pts: ReadonlyArray<readonly [number, number]>, z0: number, z1: number, shade: Shade, fan = 0,
  ends: 'both' | 'front' | 'back' | 'none' = 'both', mode: UvMode = FLAT, sides = true): void {
  const n = pts.length;
  let area = 0;
  for (let k = 0; k < n; k++) { const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % n]; area += ax * by - bx * ay; }
  const ccw = area > 0;
  for (let k = 0; sides && k < n; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % n];
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
    if (l < 1e-6) continue;
    const out: V3 = ccw ? [dy / l, -dx / l, 0] : [-dy / l, dx / l, 0];
    const uv = uvFn(m, mode);
    m.quad([ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1], out, uv, shade, mode.kind !== 'flat');
  }
  const [fx, fy] = pts[fan];
  for (let k = 0; k < n; k++) {
    const a = (fan + 1 + k) % n, b = (fan + 2 + k) % n;
    if (a === fan || b === fan) continue;
    if (ends === 'both' || ends === 'front') tri(m, [fx, fy, z1], [pts[a][0], pts[a][1], z1], [pts[b][0], pts[b][1], z1], Z, shade, mode);
    if (ends === 'both' || ends === 'back') tri(m, [fx, fy, z0], [pts[a][0], pts[a][1], z0], [pts[b][0], pts[b][1], z0], [0, 0, -1], shade, mode);
  }
}

/**
 * A lathe about the vertical through `c`: profile points [radius, height] bottom to top, `seg` sides, normals smooth
 * round it and along it (a finial, an urn, a ball). A radius of 0 closes the end.
 */
export function lathe(m: Mesh, profile: ReadonlyArray<readonly [number, number]>, seg: number, c: V3, shade: Shade, phase = 0): void {
  const n = profile.length;
  const nrm2 = profile.map((_, k) => {
    const [r0, y0] = profile[Math.max(0, k - 1)], [r1, y1] = profile[Math.min(n - 1, k + 1)];
    const tr = r1 - r0, ty = y1 - y0, l = Math.hypot(tr, ty) || 1;
    return [ty / l, -tr / l] as const;
  });
  const P = (k: number, j: number): V3 => {
    const a = phase + (j / seg) * Math.PI * 2;
    return [c[0] + Math.cos(a) * profile[k][0], c[1] + profile[k][1], c[2] + Math.sin(a) * profile[k][0]];
  };
  const N = (k: number, j: number): V3 => {
    const a = phase + (j / seg) * Math.PI * 2;
    return norm([Math.cos(a) * nrm2[k][0], nrm2[k][1], Math.sin(a) * nrm2[k][0]]);
  };
  const flat = m.surface.flatUv ?? [0.5, 0.5];
  const emit = (a: V3, b: V3, cc: V3, na: V3, nb: V3, nc: V3) => {
    const g = cross(sub(b, a), sub(cc, a));
    if (Math.hypot(g[0], g[1], g[2]) < 1e-12) return;
    const mid = norm(add(add(na, nb), nc));
    const col = m.colour(shade(scl(add(add(a, b), cc), 1 / 3), mid), false);
    if (dot(g, mid) >= 0) m.tri(a, b, cc, na, nb, nc, flat, flat, flat, col);
    else m.tri(a, cc, b, na, nc, nb, flat, flat, flat, col);
  };
  for (let k = 0; k + 1 < n; k++) {
    for (let j = 0; j < seg; j++) {
      const a = P(k, j), b = P(k, j + 1), cc = P(k + 1, j + 1), d = P(k + 1, j);
      const na = N(k, j), nb = N(k, j + 1), nc = N(k + 1, j + 1), nd = N(k + 1, j);
      if (profile[k][0] > 1e-6) emit(a, b, cc, na, nb, nc);
      if (profile[k + 1][0] > 1e-6) emit(a, cc, d, na, nc, nd);
    }
  }
}

/** The vertices written since `from`, moved by `mat` (normals with it). */
function xform(m: Mesh, from: number, mat: THREE.Matrix4): void {
  const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(mat);
  for (let i = from; i < m.p.length; i += 3) {
    v.set(m.p[i], m.p[i + 1], m.p[i + 2]).applyMatrix4(mat);
    m.p[i] = v.x; m.p[i + 1] = v.y; m.p[i + 2] = v.z;
    v.set(m.n[i], m.n[i + 1], m.n[i + 2]).applyMatrix3(nm).normalize();
    m.n[i] = v.x; m.n[i + 1] = v.y; m.n[i + 2] = v.z;
  }
}

/** The box of the vertices written since `from`. */
function bounds(m: Mesh, from: number): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = from; i < m.p.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], m.p[i + k]); max[k] = Math.max(max[k], m.p[i + k]); }
  return { min, max };
}

/**
 * Lay the group written since `from` down: turned by `q` about its own box centre, then moved so that centre stands over
 * (x, z) and its lowest corner `sink` metres under the ground (it rests, it does not float).
 */
export function layDown(m: Mesh, from: number, q: THREE.Quaternion, x: number, z: number, sink = 0.02): void {
  const b0 = bounds(m, from);
  const c = new THREE.Vector3((b0.min[0] + b0.max[0]) / 2, (b0.min[1] + b0.max[1]) / 2, (b0.min[2] + b0.max[2]) / 2);
  xform(m, from, new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z).premultiply(new THREE.Matrix4().makeRotationFromQuaternion(q)));
  const b1 = bounds(m, from);
  xform(m, from, new THREE.Matrix4().makeTranslation(x, -b1.min[1] - sink, z));
}

/**
 * A shaft of convex section `sec` ([x, z] round it, counter-clockwise seen from above) between per-corner bottom and top
 * heights: a ragged end where a height list varies (a break), capped by a fan from its middle at `midB` / `midT`
 * (the break's own colour `breakCol`, or the shaft's where the end is whole). `centre` offsets it.
 */
export function raggedShaft(m: Mesh, sec: ReadonlyArray<readonly [number, number]>, yb: readonly number[], yt: readonly number[],
  midB: number, midT: number, side: Shade, capB: Shade | null, capT: Shade | null, centre: readonly [number, number] = [0, 0]): void {
  const n = sec.length, [cx, cz] = centre;
  const P = (k: number, y: number): V3 => [cx + sec[k % n][0], y, cz + sec[k % n][1]];
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    const ex = sec[j][0] - sec[k][0], ez = sec[j][1] - sec[k][1], l = Math.hypot(ex, ez) || 1;
    const mx = (sec[j][0] + sec[k][0]) / 2, mz = (sec[j][1] + sec[k][1]) / 2;
    const s = ez * mx - ex * mz >= 0 ? 1 : -1;
    const out: V3 = [(s * ez) / l, 0, (-s * ex) / l];
    tri(m, P(k, yb[k]), P(j, yb[j]), P(j, yt[j]), out, side);
    tri(m, P(k, yb[k]), P(j, yt[j]), P(k, yt[k]), out, side);
  }
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    if (capT) tri(m, [cx, midT, cz], P(k, yt[k]), P(j, yt[j]), Y, capT);
    if (capB) tri(m, [cx, midB, cz], P(k, yb[k]), P(j, yb[j]), [0, -1, 0], capB);
  }
}

/** An octagon of across-flats `w` (a chamfered square's section), counter-clockwise from above. */
export function octagon(w: number, chamfer: number): Array<[number, number]> {
  const h = w / 2, c = Math.min(chamfer, h * 0.6);
  return [[h, -h + c], [h, h - c], [h - c, h], [-h + c, h], [-h, h - c], [-h, -h + c], [-h + c, -h], [h - c, -h]];
}

/** A ring of short members (a crown of thorns, a wreath) round the vertical at c, radius r, `n` links. */
export function ring(m: Mesh, c: V3, r: number, n: number, w: number, col: Rgb, mode: UvMode = FLAT, tilt = 0): void {
  const pt = (k: number): V3 => {
    const a = (k / n) * Math.PI * 2;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * tilt, c[2] + Math.sin(a) * r];
  };
  for (let k = 0; k < n; k++) {
    const a = pt(k), b = pt(k + 1);
    const mid = scl(add(a, b), 0.5);
    memberAt(m, a, b, w, w, norm(sub(mid, c)), col, mode);
  }
}

/** A plain member from a to b (w across `side`, h the third way), no chamfer, through craftMesh's writer. */
function memberAt(m: Mesh, a: V3, b: V3, w: number, h: number, side: V3, col: Rgb, mode: UvMode = FLAT, shade?: Shade, chamfer = 0): void {
  memberImpl(m, a, b, w, h, side, col, mode, { chamfer, shade });
}

/** A seeded stream of the builder's own (mulberry32): never a placement stream. */
export function ownStream(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
