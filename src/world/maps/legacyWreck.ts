// src/world/maps/legacyWreck.ts — the settled wreck of a part-built light structure, laid from its own parts (the
// destructible-kits lane, round 3, 2026-10-11).
//
// The owner: "the destruction of buildings needs to be a lot better too, rn its way to sporadic and ugly instead of
// behaving like it would with physics". The light structures structureKit builds from a handful of boxes, slabs and
// cylinders (the guard post, the motor pool, the checkpoint hut, the tents, the huts and the offices) all broke into the
// same litter whatever had stood there (structureKit `debris`: sticks, two flat leaves and four posts in a ring). This
// lays the broken state from the kind's own parts instead, each where a blow and gravity leave it (fractureSettle.ts):
//  - what lies on the ground stays (a slab, a plinth, a step);
//  - a post snaps over a stub, and its top falls about the break;
//  - a cabin caves in, its roof plane down to a fifth or a half of its height (a tent nearly flat) and lower where the
//    blow struck, with its windows and door; one on stilts then drops onto the stubs and tips off them;
//  - a wall leaf swings outward about its foot until it lies on the ground or leans on what stands; a mast or a stack
//    on a roof falls as one;
//  - the small things are thrown; a roof comes down in pieces of about three metres onto everything else (canvas
//    draped flat);
//  - fragments in the kind's own colours round the foot.
// Each part's box comes from its own faces (the normal of its largest face, then of the largest face square to it), its
// kind from that box: thin and level (a sheet), thin and upright (a leaf), long and upright (a post), solid (a block).
// A part broken at a plane is clamped to it rather than clipped open (clampTris), so a snapped post shows a closed end.
// Deterministic in the stream it is given; the output is plain position, normal, uv and colour with the night mask at 0
// (a wreck's windows are dark), the layout the kinds' intact builds draw in.
import * as THREE from 'three';
import { FractureSettle, type SettleBody, type SettleTris } from './fractureSettle.ts';
import type { FracturePiece, FractureRole, KitFractureAnatomy } from '../fractureAnatomy.ts';
import type { FractureMaterial } from '../destructionKit.ts';
import { ensureWorldNightEmissionMask } from '../worldNightEmissionGeometry.ts';
import { NIGHT_EMISSION_ATTRIBUTE } from '../../engine/nightEmissionMaterial.ts';

type Rng = () => number;
type V3 = [number, number, number];
type LegacyMaterial = 'wood' | 'metal' | 'canvas';
type PartKind = 'ground' | 'post' | 'leaf' | 'sheet' | 'block' | 'small';
const PART_KINDS: ReadonlySet<string> = new Set(['ground', 'post', 'leaf', 'sheet', 'block', 'small']);

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const UP: V3 = [0, 1, 0];

/** Smooth value noise in 0..1 (a named block's buckled sheet). */
function buckleNoise(x: number, y: number, z: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const h = (a: number, b: number, c: number): number => {
    let q = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647) ^ Math.imul(s | 0, 1274126177);
    q = Math.imul(q ^ (q >>> 13), 1103515245);
    return ((q ^ (q >>> 16)) >>> 0) / 4294967296;
  };
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
    l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}

/** One part of the kind: its run, its box, its world bounds, what it is and the block it rides on (−1: none). */
interface Part {
  index: number;
  kind: PartKind;
  c: V3;
  h: V3;
  axes: [V3, V3, V3];
  lo: V3;
  hi: V3;
  owner: number;
  /** A window pane (its outward face lit at night): it shatters rather than falls whole. */
  glass: boolean;
  /** Its members' triangle ranges within its run (one for a lone part): a cut leaves out a member wholly past it. */
  members: [number, number][];
  /** A piece its kit named (userData.piece): it falls as its kind says. */
  named: boolean;
}

/** The box of a run from its own faces: the largest face's normal, the largest face's square to it, their cross. */
function boxOf(p: ArrayLike<number>, tri0: number, triN: number): { c: V3; h: V3; axes: [V3, V3, V3] } {
  const clusters: { n: V3; a: number }[] = [];
  for (let t = tri0; t < tri0 + triN; t++) {
    const o = t * 9;
    const e1: V3 = [p[o + 3] - p[o], p[o + 4] - p[o + 1], p[o + 5] - p[o + 2]];
    const e2: V3 = [p[o + 6] - p[o], p[o + 7] - p[o + 1], p[o + 8] - p[o + 2]];
    const cr = cross(e1, e2), area = Math.hypot(cr[0], cr[1], cr[2]) / 2;
    if (area < 1e-9) continue;
    const n = scl(cr, 1 / (2 * area));
    const hit = clusters.find((k) => Math.abs(dot(k.n, n)) > 0.995);
    if (hit) hit.a += area; else clusters.push({ n, a: area });
  }
  clusters.sort((x, y) => y.a - x.a);
  const a0 = clusters.length ? clusters[0].n : UP;
  const square = clusters.find((k) => Math.abs(dot(k.n, a0)) < 0.08);
  const a1 = square ? nrm(sub(square.n, scl(a0, dot(square.n, a0))))
    : nrm(Math.abs(a0[1]) < 0.9 ? cross(a0, UP) : cross(a0, [1, 0, 0]));
  const axes: [V3, V3, V3] = [a0, a1, nrm(cross(a0, a1))];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let v = tri0 * 3; v < (tri0 + triN) * 3; v++) {
    const q: V3 = [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]];
    for (let k = 0; k < 3; k++) { const s = dot(q, axes[k]); lo[k] = Math.min(lo[k], s); hi[k] = Math.max(hi[k], s); }
  }
  let c: V3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) c = add(c, scl(axes[k], (lo[k] + hi[k]) / 2));
  return { c, h: [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2], axes };
}

/** The unit quaternion (x, y, z, w) turning the local axes into `axes` (a proper rotation's columns). */
function quatOf(axes: [V3, V3, V3]): [number, number, number, number] {
  const [m00, m10, m20] = axes[0], [m01, m11, m21] = axes[1], [m02, m12, m22] = axes[2];
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    return [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
}

function classify(box: { h: V3; axes: [V3, V3, V3] }, lo: V3, hi: V3): PartKind {
  const ext = box.h.map((x) => 2 * x);
  const order = [0, 1, 2].sort((a, b) => ext[a] - ext[b]);
  const [iS, iM, iL] = order;
  const up = box.axes.map((a) => Math.abs(a[1]));
  const height = hi[1] - lo[1];
  const vol = ext[0] * ext[1] * ext[2];
  if (ext[iL] < 0.5) return 'small';
  if (up[iL] > 0.85 && ext[iM] < 0.42 && ext[iL] > 0.9) return 'post';
  if (ext[iS] < 0.24 && up[iS] < 0.4 && height > 0.45) return 'leaf';
  if (ext[iS] < 0.32 && up[iS] > 0.7) return lo[1] < 0.12 && hi[1] < 0.5 ? 'ground' : 'sheet';
  if (lo[1] < 0.12 && height < 0.55) return 'ground';
  return vol < 1.2 ? 'small' : 'block';
}

/**
 * The parts as one non-indexed geometry, with the anatomy the settle reads: each part its own run, or (the
 * destructible-kits lane, round 4) the parts of one piece together (userData.piece, 'kind:name': a wall with its
 * casings and door, a roof with its fascias and gutter, a porch deck), of that kind. A pane is always its own (it
 * shatters).
 */
function partsAnatomy(kind: string, parts: readonly THREE.BufferGeometry[], material: LegacyMaterial):
  { geometry: THREE.BufferGeometry; anatomy: KitFractureAnatomy; parts: Part[] } {
  const P: number[] = [], N: number[] = [], T: number[] = [], C: number[] = [];
  const runs: [number, number][] = [];
  const glass: boolean[] = [];
  const forced: (PartKind | null)[] = [];
  const memberRuns: [number, number][][] = [];
  const groups: { members: THREE.BufferGeometry[]; pane: boolean; kind: PartKind | null }[] = [];
  const byPiece = new Map<string, number>();
  for (const part of parts) {
    const lit = part.getAttribute(NIGHT_EMISSION_ATTRIBUTE);
    let pane = false;
    if (lit) for (let v = 0; v < lit.count && !pane; v++) pane = lit.getX(v) === 1;
    const piece = !pane && typeof part.userData.piece === 'string' ? part.userData.piece as string : null;
    const at = piece === null ? undefined : byPiece.get(piece);
    if (at !== undefined) { groups[at].members.push(part); continue; }
    const head = piece?.split(':')[0] ?? '';
    if (piece !== null) byPiece.set(piece, groups.length);
    groups.push({ members: [part], pane, kind: PART_KINDS.has(head) ? head as PartKind : null });
  }
  for (const group of groups) {
    const tri0 = P.length / 9, ranges: [number, number][] = [];
    for (const part of group.members) {
      const m0 = P.length / 9 - tri0;
      const g = part.index ? part.toNonIndexed() : part;
      const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), uv = g.getAttribute('uv'), col = g.getAttribute('color');
      const count = pos.count - (pos.count % 3);
      for (let v = 0; v < count; v++) {
        P.push(pos.getX(v), pos.getY(v), pos.getZ(v));
        if (nor) N.push(nor.getX(v), nor.getY(v), nor.getZ(v)); else N.push(0, 1, 0);
        if (uv) T.push(uv.getX(v), uv.getY(v)); else T.push(0, 0);
        if (col) C.push(col.getX(v), col.getY(v), col.getZ(v)); else C.push(0.5, 0.5, 0.5);
      }
      if (g !== part) g.dispose();
      ranges.push([m0, P.length / 9 - tri0 - m0]);
    }
    memberRuns.push(ranges);
    runs.push([tri0, P.length / 9 - tri0]);
    glass.push(group.pane);
    forced.push(group.kind);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(T, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  const fm: FractureMaterial = material === 'metal' ? 'metal' : material === 'canvas' ? 'canvas' : 'plank';
  const pieces: FracturePiece[] = [];
  const info: Part[] = [];
  runs.forEach(([tri0, triN], index) => {
    const box = boxOf(P, tri0, triN);
    const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (let v = tri0 * 3; v < (tri0 + triN) * 3; v++) {
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[v * 3 + k]); hi[k] = Math.max(hi[k], P[v * 3 + k]); }
    }
    const kindOf = forced[index] ?? (triN ? classify(box, lo, hi) : 'small');
    const role: FractureRole = kindOf === 'ground' ? 'footing' : kindOf === 'post' ? 'post' : kindOf === 'leaf' ? 'wall'
      : kindOf === 'sheet' ? 'roof' : 'fitting';
    pieces.push({
      role, material: fm, bucket: 'structure', tri0, triN, c: box.c, h: box.h, q: quatOf(box.axes),
      massKg: Math.max(1, 8 * box.h[0] * box.h[1] * box.h[2] * (material === 'metal' ? 600 : material === 'canvas' ? 40 : 350)),
      ...(kindOf === 'ground' ? { anchor: true as const } : {}),
    });
    info.push({ index, kind: kindOf, c: box.c, h: box.h, axes: box.axes, lo, hi, owner: -1, glass: glass[index], members: memberRuns[index], named: forced[index] !== null });
  });
  // what rides on a block (a window, a door, a sign, a unit on its roof; the roof it carries): within its bounds and off
  // the ground, or a sheet lying on its top over its plan (a piece named by its kit falls as its kind says)
  const blocks = info.filter((p) => p.kind === 'block');
  for (const p of info) {
    if (p.kind === 'block' || p.kind === 'ground' || p.lo[1] < 0.12 || forced[p.index]) continue;
    const host = blocks.find((b) => [0, 1, 2].every((k) => p.lo[k] >= b.lo[k] - 0.12 && p.hi[k] <= b.hi[k] + 0.12))
      ?? (p.kind === 'sheet' ? blocks.find((b) => Math.abs(p.lo[1] - b.hi[1]) < 0.2
        && p.c[0] > b.lo[0] && p.c[0] < b.hi[0] && p.c[2] > b.lo[2] && p.c[2] < b.hi[2]) : undefined);
    if (host) p.owner = host.index;
  }
  return { geometry, anatomy: { kind, pieces, links: [] }, parts: info };
}

/** A run's positions clamped between two planes along `axis` (from `at`): a convex part kept closed at a break. */
function clampTris(t: SettleTris, axis: V3, at: V3, lo: number, hi: number): SettleTris {
  const out: SettleTris = { p: [], n: [], t: [], c: [] };
  for (let tri = 0; tri < t.p.length / 9; tri++) {
    const q: V3[] = [];
    for (let k = 0; k < 3; k++) {
      const o = tri * 9 + k * 3;
      let v: V3 = [t.p[o], t.p[o + 1], t.p[o + 2]];
      const s = dot(sub(v, at), axis);
      if (s < lo) v = add(v, scl(axis, lo - s));
      else if (s > hi) v = sub(v, scl(axis, s - hi));
      q.push(v);
    }
    const cr = cross(sub(q[1], q[0]), sub(q[2], q[0]));
    if (Math.hypot(cr[0], cr[1], cr[2]) < 1e-7) continue;
    for (let k = 0; k < 3; k++) {
      const o = tri * 9 + k * 3;
      out.p.push(...q[k]); out.n.push(t.n[o], t.n[o + 1], t.n[o + 2]); out.c.push(t.c[o], t.c[o + 1], t.c[o + 2]);
    }
    for (let k = 0; k < 6; k++) out.t.push(t.t[tri * 6 + k]);
  }
  return out;
}

/** A piece of a run: its triangles and its members' ranges in them. */
interface Cut { tris: SettleTris; members: [number, number][] }

/**
 * A run's members clamped between two planes along `axis` (clampTris): a member wholly past either plane is left out
 * (it falls with the piece it lies in), the rest clamped and closed at the break. A lone part is clamped whole.
 */
function clampMembers(cut: Cut, axis: V3, at: V3, lo: number, hi: number): Cut {
  if (cut.members.length < 2) {
    const tris = clampTris(cut.tris, axis, at, lo, hi);
    return { tris, members: [[0, tris.p.length / 9]] };
  }
  const out: Cut = { tris: { p: [], n: [], t: [], c: [] }, members: [] };
  for (const [m0, mN] of cut.members) {
    let mn = Infinity, mx = -Infinity;
    for (let v = m0 * 3; v < (m0 + mN) * 3; v++) {
      const sv = (cut.tris.p[v * 3] - at[0]) * axis[0] + (cut.tris.p[v * 3 + 1] - at[1]) * axis[1] + (cut.tris.p[v * 3 + 2] - at[2]) * axis[2];
      mn = Math.min(mn, sv); mx = Math.max(mx, sv);
    }
    if (mx <= lo || mn >= hi) continue;
    const one: SettleTris = { p: cut.tris.p.slice(m0 * 9, (m0 + mN) * 9), n: cut.tris.n.slice(m0 * 9, (m0 + mN) * 9),
      t: cut.tris.t.slice(m0 * 6, (m0 + mN) * 6), c: cut.tris.c.slice(m0 * 9, (m0 + mN) * 9) };
    const kept = clampTris(one, axis, at, lo, hi), start = out.tris.p.length / 9;
    append(out.tris, kept);
    out.members.push([start, kept.p.length / 9]);
  }
  return out;
}

/** A run caved in under a plane: every point over y = top(x, z) brought down onto it (its faces kept, closed). */
function caveIn(t: SettleTris, top: (x: number, z: number) => number): SettleTris {
  const out: SettleTris = { p: [], n: [], t: [], c: [] };
  for (let tri = 0; tri < t.p.length / 9; tri++) {
    const q: V3[] = [];
    for (let k = 0; k < 3; k++) {
      const o = tri * 9 + k * 3;
      q.push([t.p[o], Math.min(t.p[o + 1], top(t.p[o], t.p[o + 2])), t.p[o + 2]]);
    }
    const cr = cross(sub(q[1], q[0]), sub(q[2], q[0]));
    if (Math.hypot(cr[0], cr[1], cr[2]) < 1e-7) continue;
    for (let k = 0; k < 3; k++) {
      const o = tri * 9 + k * 3;
      out.p.push(...q[k]);
      // a face brought down onto the plane faces up the plane
      const n: V3 = q[k][1] < t.p[o + 1] - 1e-4 && Math.abs(t.n[o + 1]) > 0.7 ? UP : [t.n[o], t.n[o + 1], t.n[o + 2]];
      out.n.push(...n); out.c.push(t.c[o], t.c[o + 1], t.c[o + 2]);
    }
    for (let k = 0; k < 6; k++) out.t.push(t.t[tri * 6 + k]);
  }
  return out;
}

function centreOf(t: SettleTris): V3 {
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < t.p.length; k += 3) {
    for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], t.p[k + j]); hi[j] = Math.max(hi[j], t.p[k + j]); }
  }
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
}

const bodyOf = (tris: SettleTris, axes: [V3, V3, V3]): SettleBody => ({ tris, pieces: [], axes, centre: centreOf(tris) });

/** Turns a run about the level axis square to `dir` through `at`, by `angle` (its top toward `dir`). */
function tilt(t: SettleTris, at: V3, dir: V3, angle: number): void {
  const k = nrm(cross(UP, dir)), c = Math.cos(angle), s = Math.sin(angle);
  const turn = (v: V3): V3 => add(add(scl(v, c), scl(cross(k, v), s)), scl(k, dot(k, v) * (1 - c)));
  for (let i = 0; i < t.p.length; i += 3) {
    const q = turn([t.p[i] - at[0], t.p[i + 1] - at[1], t.p[i + 2] - at[2]]);
    t.p[i] = q[0] + at[0]; t.p[i + 1] = q[1] + at[1]; t.p[i + 2] = q[2] + at[2];
    const n = turn([t.n[i], t.n[i + 1], t.n[i + 2]]);
    t.n[i] = n[0]; t.n[i + 1] = n[1]; t.n[i + 2] = n[2];
  }
}
const append = (to: SettleTris, from: SettleTris): void => {
  to.p.push(...from.p); to.n.push(...from.n); to.t.push(...from.t); to.c.push(...from.c);
};

/** A small box of triangles (a fragment), turned by yaw and pitch, at `at`, in one colour. */
function fragment(w: number, h: number, d: number, yaw: number, pitch: number, at: V3, rgb: V3): SettleTris {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.rotateX(pitch); g.rotateY(yaw); g.translate(at[0], at[1], at[2]);
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
  const t: SettleTris = { p: [], n: [], t: [], c: [] };
  for (let v = 0; v < p.count; v++) {
    t.p.push(p.getX(v), p.getY(v), p.getZ(v)); t.n.push(n.getX(v), n.getY(v), n.getZ(v));
    t.t.push(uv.getX(v), uv.getY(v)); t.c.push(rgb[0], rgb[1], rgb[2]);
  }
  g.dispose();
  return t;
}

/**
 * The settled wreck of a part-built kind. `parts` are the kind's painted parts as its builder hands them to the merge
 * (structureKit mergeConnectedStructure); `rng` is the wreck's own stream.
 */
export function buildLegacyWreck(kind: string, parts: readonly THREE.BufferGeometry[], material: LegacyMaterial,
  rng: Rng): THREE.BufferGeometry {
  const { geometry, anatomy, parts: info } = partsAnatomy(kind, parts, material);
  const S = new FractureSettle(geometry, anatomy, { cell: 0.08, margin: 3.2, dust: 0.86 });
  const r = (lo: number, hi: number): number => lo + (hi - lo) * rng();
  const az = rng() * Math.PI * 2;
  const blow: V3 = [Math.cos(az), 0, Math.sin(az)];
  const lean = (d: V3, spread: number): V3 => {
    const a = Math.atan2(d[2], d[0]) + r(-spread, spread);
    return [Math.cos(a), 0, Math.sin(a)];
  };
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, top = 0;
  for (const p of info) {
    x0 = Math.min(x0, p.lo[0]); x1 = Math.max(x1, p.hi[0]); z0 = Math.min(z0, p.lo[2]); z1 = Math.max(z1, p.hi[2]);
    top = Math.max(top, p.hi[1]);
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // (no loose body comes to rest higher than this, except on a caved block, which may stand taller: set once they lie)
  let blockTop = 0, ceiling = Math.min(1.9, Math.max(0.9, top * 0.42));
  const topOf = (t: SettleTris): number => { let y = -Infinity; for (let k = 1; k < t.p.length; k += 3) y = Math.max(y, t.p[k]); return y; };
  const laid = new Set<number>();
  const riders = (b: Part): Part[] => info.filter((p) => p.owner === b.index);
  const take = (p: Part): SettleTris => { laid.add(p.index); S.omit(p.index); return S.run(p.index); };

  // 1. what lies on the ground stays; the panes shatter (their shards are laid with the fragments, below them)
  const panes: Part[] = [];
  for (const p of info) {
    if (p.glass) { take(p); panes.push(p); continue; }
    if (p.kind === 'ground' && p.owner < 0) { laid.add(p.index); S.stay(p.index, 0.92); }
  }

  // 2. a post from the ground snaps over a stub; its top falls once the rest has come down
  const tops: { tris: SettleTris; axes: [V3, V3, V3]; out: V3; named: boolean }[] = [];
  for (const p of info) {
    if (p.kind !== 'post' || p.owner >= 0 || p.lo[1] > 0.15) continue;
    const run: Cut = { tris: take(p), members: p.members };
    // (a steel column or post its kit named buckles low, a hand to a knee's height, and its top goes over with the blow)
    const len = p.hi[1] - p.lo[1], at = p.lo[1] + Math.max(0.22, len * (p.named ? r(0.08, 0.24) : r(0.16, 0.5)));
    S.extra(clampMembers(run, UP, [0, 0, 0], -Infinity, at).tris, 0.88);
    if (p.hi[1] - at > 0.12) {
      // (it falls away from the building, the way the blow pushes it: a top falling inward would stand on the heap)
      const radial = nrm([p.c[0] - cx + 1e-3, 0, p.c[2] - cz]);
      const away = p.named ? nrm(add(scl(radial, 0.35), blow)) : nrm(add(radial, scl(blow, 0.6)));
      tops.push({ tris: clampMembers(run, UP, [0, 0, 0], at, Infinity).tris, axes: p.axes, out: away, named: p.named });
    }
  }

  // 3. a block caves in, its roof plane down to a fraction of its height and lower where the blow struck (canvas has
  // no stiffness: a tent goes nearly flat; boards and sheet metal fold to a fifth or a half); one on stilts then drops
  // onto the stubs, swung over toward the struck side, and rests where it lands
  for (const b of info) {
    if (b.kind !== 'block' || b.owner >= 0) continue;
    const height = b.hi[1] - b.lo[1];
    // (a block its kit named — a clad cabin with its walls — goes lower: its sheet folds where a plain box would stand)
    const k = material === 'canvas' ? r(0.1, 0.24) : b.named ? r(0.13, 0.3) : r(0.2, 0.45), slope = r(0.05, 0.16);
    // (never below a hand's breadth of its foot: a long block's slope would otherwise drive its struck end underground)
    const plane = (x: number, z: number): number =>
      Math.max(b.lo[1] + 0.12, b.lo[1] + height * k - slope * ((x - b.c[0]) * blow[0] + (z - b.c[2]) * blow[2]));
    const tris = take(b);
    for (const p of riders(b)) {
      if (laid.has(p.index)) continue;
      // a rider under the plane caves in with it; one above it comes down onto what is left
      if ((p.lo[1] + p.hi[1]) / 2 < plane(p.c[0], p.c[2])) append(tris, take(p));
      else p.owner = -1;
    }
    const caved = caveIn(tris, plane);
    if (b.named) {
      // (a block its kit named — a clad cabin, its walls with it — racks over toward the blow as it goes down: its walls
      // lean the same way, a parallelogram, rather than standing square under the caved plane)
      // and its sheet buckles: pushed in and out on a metre's wavelength, nothing at its foot
      const lean0 = lean(blow, 0.35), k = r(0.22, 0.5), amp = r(0.14, 0.24), seed = Math.floor(rng() * 65536);
      for (let i = 0; i < caved.p.length; i += 3) {
        const x = caved.p[i], y = caved.p[i + 1], z = caved.p[i + 2], up = Math.max(0, y - b.lo[1]);
        const fold = amp * Math.min(1, up / 0.45);
        caved.p[i] = x + lean0[0] * k * up + fold * (buckleNoise(x * 1.45, y * 2.1, z * 1.45, seed) - 0.5) * 2;
        caved.p[i + 2] = z + lean0[2] * k * up + fold * (buckleNoise(x * 1.45 + 17.3, y * 2.1, z * 1.45, seed + 1) - 0.5) * 2;
      }
      // (each facet lit as it now lies: the folds read in the light, not only at the edges)
      for (let o = 0; o + 9 <= caved.p.length; o += 9) {
        const e1: V3 = [caved.p[o + 3] - caved.p[o], caved.p[o + 4] - caved.p[o + 1], caved.p[o + 5] - caved.p[o + 2]];
        const e2: V3 = [caved.p[o + 6] - caved.p[o], caved.p[o + 7] - caved.p[o + 1], caved.p[o + 8] - caved.p[o + 2]];
        const cr = cross(e1, e2);
        if (Math.hypot(cr[0], cr[1], cr[2]) < 1e-9) continue;
        const n = nrm(cr);
        for (let k3 = 0; k3 < 9; k3 += 3) { caved.n[o + k3] = n[0]; caved.n[o + k3 + 1] = n[1]; caved.n[o + k3 + 2] = n[2]; }
      }
    }
    if (b.lo[1] > 0.25) {
      tilt(caved, centreOf(caved), lean(blow, 0.4), r(0.22, 0.5));
      S.drop(bodyOf(caved, b.axes), r(-0.45, 0.45), scl(lean(blow, 0.6), r(0.3, 1.1)), { maxTilt: 1.1, ceiling: height + 0.7 });
    } else {
      S.extra(caved, 0.86);
    }
    blockTop = Math.max(blockTop, topOf(caved));
  }
  ceiling = Math.max(ceiling, blockTop + 0.35);

  // (what stands on a roof — a mast and its rungs, a chimney, a stack — falls as one: its touching raised parts)
  // (a kit that names its pieces has said what falls together: its pieces are not gathered here)
  const raised = info.filter((p) => !laid.has(p.index) && p.owner < 0 && !p.named && (p.kind === 'post' || p.kind === 'small') && p.lo[1] > 0.3);
  const group = new Map<number, number>(raised.map((p) => [p.index, p.index]));
  const root = (i: number): number => { while (group.get(i) !== i) i = group.get(i)!; return i; };
  const gap = (a: Part, b: Part): number => Math.max(0, ...[0, 1, 2].map((k) => Math.max(a.lo[k] - b.hi[k], b.lo[k] - a.hi[k])));
  for (let i = 0; i < raised.length; i++) for (let j = i + 1; j < raised.length; j++) {
    if (gap(raised[i], raised[j]) <= 0.04) group.set(root(raised[i].index), root(raised[j].index));
  }
  const assemblies = new Map<number, Part[]>();
  for (const p of raised) { const g = root(p.index); if (!assemblies.has(g)) assemblies.set(g, []); assemblies.get(g)!.push(p); }
  for (const members of assemblies.values()) {
    const lo = Math.min(...members.map((p) => p.lo[1])), hi = Math.max(...members.map((p) => p.hi[1]));
    if (members.length < 2 || hi - lo < 1.5) continue;
    const tris: SettleTris = { p: [], n: [], t: [], c: [] };
    for (const p of members) append(tris, take(p));
    S.topple(bodyOf(tris, members[0].axes), lean(blow, 0.7), Math.PI / 2, { minSwing: 1.2 });
  }

  // 4. a wall leaf swings outward about its foot (one on the struck side now and then falls in)
  for (const p of info) {
    if (p.kind !== 'leaf' || p.owner >= 0 || laid.has(p.index)) continue;
    const thin = [0, 1, 2].sort((a, b) => p.h[a] - p.h[b])[0];
    let d = nrm([p.axes[thin][0], 0, p.axes[thin][2]]);
    // (outward, away from the building's middle; a leaf on the struck side now and then falls in)
    if (dot(d, [p.c[0] - cx, 0, p.c[2] - cz]) < 0) d = scl(d, -1);
    if (dot(d, blow) < -0.3 && rng() < 0.3) d = scl(d, -1);
    const tris = take(p);
    S.topple(bodyOf(tris, p.axes), lean(d, 0.25), Math.PI / 2, { minSwing: 0.9, ceiling });
  }

  // 5. the posts' tops fall about their breaks
  // (a named column's top lies where it fell, on what it fell on, rather than being moved out to the rim)
  for (const t of tops) {
    S.topple(bodyOf(t.tris, t.axes), lean(t.out, 0.5), Math.PI / 2, { minSwing: 1.2, ceiling: t.named ? Math.max(ceiling, top * 0.45) : ceiling });
  }

  // 6. the small things (and whatever rode a block that fell apart) are thrown, before the roofs come down on them
  for (const p of info) {
    if (laid.has(p.index) || (p.kind === 'sheet' && p.owner < 0)) continue;
    const out = nrm(add(nrm([p.c[0] - cx + 1e-3, 0, p.c[2] - cz]), scl(blow, 0.8)));
    const tris = take(p);
    // (a thing its kit named — a rod, a pipe, a ladder, a lamp — comes down by where it stood, along its own length)
    const L = p.named ? p.axes[[0, 1, 2].sort((a, b) => p.h[b] - p.h[a])[0]] : null;
    const yaw = L ? Math.atan2(L[2], L[0] || 1e-6) + r(-0.25, 0.25) : rng() * Math.PI * 2;
    S.lie(bodyOf(tris, p.axes), yaw, scl(lean(out, 0.5), p.named ? r(0.1, 0.6) : r(0.3, 1.6)), rng() < 0.3, r(-0.5, 0.5),
      { ceiling: Math.min(ceiling, 1.3) });
  }

  // 7. the roofs and raised floors come down together, in pieces, onto everything else
  S.together(() => {
    for (const p of info) {
      if (p.kind !== 'sheet' || p.owner >= 0 || laid.has(p.index)) continue;
      const [L, M] = [0, 1, 2].sort((a, b) => p.h[b] - p.h[a]);
      const tris = take(p);
      // (a sheet breaks into pieces no wider than about three metres either way: two to three along, one to three across)
      const cutsOf = (len: number): number[] => {
        const n = Math.min(3, Math.ceil(len / 3.2));
        return Array.from({ length: n - 1 }, (_, i) => -len / 2 + (len * (i + 1)) / n + r(-0.12, 0.12) * (len / n));
      };
      const strips = (from: Cut[], axis: V3, cuts: number[]): Cut[] => from.flatMap((piece) => {
        const bounds = [-Infinity, ...cuts, Infinity];
        return bounds.slice(1).map((hi, i) => clampMembers(piece, axis, p.c, bounds[i], hi)).filter((q) => q.tris.p.length);
      });
      // (a roof or a truss its kit named comes down as its frame breaks it: in one to three lengths along its span, none
      // across, each tipped a little the way the blow went and all moved together, so it lands as a roof, not as tiles)
      const namedCuts = (len: number): number[] => {
        const n = Math.min(3, Math.max(1, Math.round(len / 4.2)));
        return Array.from({ length: n - 1 }, (_, i) => -len / 2 + (len * (i + 1)) / n + r(-0.1, 0.1) * (len / n));
      };
      const halves = (p.named
        ? strips([{ tris, members: p.members }], p.axes[L], namedCuts(2 * p.h[L]))
        : strips(strips([{ tris, members: p.members }], p.axes[L], cutsOf(2 * p.h[L])), p.axes[M], cutsOf(2 * p.h[M])))
        .map((q) => q.tris);
      const together = p.named ? scl(lean(blow, 0.3), r(0.15, 0.8)) : null;
      for (const half of halves) {
        const body = bodyOf(half, p.axes), shift = together ?? scl(lean(blow, 0.7), r(0.1, 0.8));
        if (material === 'canvas') {
          // (canvas drapes: laid out flat over what is under it, along the way it hung)
          const along = p.axes[L];
          S.lie(body, Math.atan2(along[2], along[0]) + r(-0.3, 0.3), shift, false, r(-0.12, 0.12), { ceiling });
        } else {
          tilt(half, body.centre, lean(blow, p.named ? 0.5 : Math.PI), p.named ? r(0.04, 0.22) : r(0.05, 0.4));
          body.centre = centreOf(half);
          // (a named roof rests on what it falls on — drums, stubs, the trusses under it — rather than being moved out
          // to the rim: a little less tipping, and the heap may stand to six tenths of the work's height under it)
          S.drop(body, p.named ? r(-0.12, 0.12) : r(-0.35, 0.35), shift,
            p.named ? { maxTilt: 0.7, ceiling: Math.max(ceiling, top * 0.6) } : { maxTilt: 1.2, ceiling });
        }
      }
    }
  });

  // 8. fragments round the foot in the kind's own colours
  const col = geometry.getAttribute('color');
  const bits: SettleTris = { p: [], n: [], t: [], c: [] };
  const span = Math.max(x1 - x0, z1 - z0);
  const n = Math.round(Math.min(18, Math.max(7, span * 2.2)));
  for (let k = 0; k < n; k++) {
    const v = Math.floor(rng() * col.count);
    const rgb: V3 = [col.getX(v) * 0.85, col.getY(v) * 0.85, col.getZ(v) * 0.85];
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * span * 0.62;
    const at: V3 = [cx + Math.cos(a) * d + blow[0] * 0.4, 0, cz + Math.sin(a) * d + blow[2] * 0.4];
    const long = material === 'canvas' ? r(0.3, 0.9) : r(0.18, 0.7);
    const g = material === 'canvas' ? fragment(long, 0.02, r(0.2, 0.5), rng() * 6.283, r(-0.2, 0.2), at, rgb)
      : fragment(r(0.05, 0.14), r(0.03, 0.08), long, rng() * 6.283, r(-0.3, 0.3), at, rgb);
    // seated on the heap where it lands
    let lowY = Infinity;
    for (let j = 1; j < g.p.length; j += 3) lowY = Math.min(lowY, g.p[j]);
    const seat = S.heightAt(at[0], at[2]) - lowY - 0.01;
    for (let j = 1; j < g.p.length; j += 3) g.p[j] += seat;
    append(bits, g);
  }
  // the panes' shards on the ground below where they were, thrown out a little from the building
  for (const p of panes) {
    const v = geometry.getAttribute('color'), at0 = anatomy.pieces[p.index].tri0 * 3;
    const rgb: V3 = [v.getX(at0) * 0.7, v.getY(at0) * 0.7, v.getZ(at0) * 0.7];
    const out = nrm([p.c[0] - cx + 1e-3, 0, p.c[2] - cz]);
    const count = Math.min(4, 2 + Math.floor(Math.max(p.h[0], p.h[1], p.h[2]) * 2));
    for (let k = 0; k < count; k++) {
      const d = r(0.2, 0.9), side = r(-1, 1) * Math.max(p.h[0], p.h[2]);
      const at: V3 = [p.c[0] + out[0] * d - out[2] * side, 0, p.c[2] + out[2] * d + out[0] * side];
      const g = fragment(r(0.08, 0.26), 0.012, r(0.06, 0.2), rng() * 6.283, r(-0.15, 0.15), at, rgb);
      let lowY = Infinity;
      for (let j = 1; j < g.p.length; j += 3) lowY = Math.min(lowY, g.p[j]);
      const seat = S.heightAt(at[0], at[2]) - lowY - 0.004;
      for (let j = 1; j < g.p.length; j += 3) g.p[j] += seat;
      append(bits, g);
    }
  }
  S.extra(bits, 0.95);
  geometry.dispose();
  return ensureWorldNightEmissionMask(S.finish());
}
