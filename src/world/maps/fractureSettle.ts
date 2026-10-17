// src/world/maps/fractureSettle.ts — the settled wreck of a fracture-ready kind, laid from its own pieces (the
// destructible-buildings redesign lane, round 2, 2026-10-11).
//
// Waves 390a/b (the sheds) and 370 (the pillboxes) on the destroyed states: "flat, clean rafts of boards and sheets with
// a few stub posts, much smaller than the building, lying on untouched ground ... walls, doors, windows and roof
// sections are missing rather than fallen"; the coordinator: "the wreck needs a heap with real volume, its own roof,
// door and window parts, a standing corner, splintered boards and churned ground ... this is where the pillbox R2
// fracture work and dcore's bodies should meet". The destruction core's live breaks (fx/propFracture.ts) take a kind's
// pieces apart physically and keep the pool's broken geometry as the settled state (a late joiner, a migration, the
// phones); this lays that settled state from the same pieces, each its triangle run in the intact build, where a blow
// and gravity leave them:
//  - what the kit keeps standing stays where it stood (the anchors; a corner with its boards broken off, staggered);
//  - each body (a piece, or a wall panel with its window) falls rigidly: a wall swings about its foot until it lies on
//    the ground or comes to lean on what stands, a roof section drops onto whatever fell first, a member snaps at its
//    scores (the kit's own edge art on each break) and each length lies where it drops, the small things are thrown;
//  - every body comes to rest on a height grid of everything laid before it: dropped until it touches, then tipped
//    about that contact toward its centre of mass until another point rests, so the heap stacks to its real volume.
// Deterministic in the kit's own choices; THREE only for the output geometry. The output has no runs (the broken pool
// carries no anatomy): position, normal, uv and colour, as the kits' intact builds draw.

import * as THREE from 'three';
import type { DamageMeshWriter, FractureMaterial } from '../destructionKit.ts';
import type { FracturePiece, KitFractureAnatomy } from '../fractureAnatomy.ts';

type V3 = [number, number, number];
/** A rotation as the images of x, y and z. */
type Rot = [V3, V3, V3];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const UP: V3 = [0, 1, 0];

function quatRotate(q: readonly number[], v: V3): V3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

function rotApply(R: Rot, v: V3): V3 {
  return [R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2], R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2],
    R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]];
}

/** The rotation by `angle` about the unit `axis` (Rodrigues). */
function rotAxis(axis: V3, angle: number): Rot {
  const c = Math.cos(angle), s = Math.sin(angle), k = 1 - c, [x, y, z] = axis;
  return [
    [c + x * x * k, y * x * k + z * s, z * x * k - y * s],
    [x * y * k - z * s, c + y * y * k, z * y * k + x * s],
    [x * z * k + y * s, y * z * k - x * s, c + z * z * k],
  ];
}

/** A rigid motion: p -> R p + t. */
interface Xf { R: Rot; t: V3 }
const IDENTITY: Xf = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] };
/** The motion turning by R about `from` and carrying `from` to `to`. */
function about(R: Rot, from: V3, to: V3): Xf { return { R, t: sub(to, rotApply(R, from)) }; }
/** `b` after `a`. */
function compose(a: Xf, b: Xf): Xf {
  return { R: [rotApply(b.R, a.R[0]), rotApply(b.R, a.R[1]), rotApply(b.R, a.R[2])], t: add(rotApply(b.R, a.t), b.t) };
}
function xfApply(x: Xf, px: number, py: number, pz: number): V3 { return add(rotApply(x.R, [px, py, pz]), x.t); }

/** A run of non-indexed triangles: 9 position, 9 normal, 6 uv and 9 colour floats a triangle. */
export interface SettleTris { p: number[]; n: number[]; t: number[]; c: number[] }

const emptyTris = (): SettleTris => ({ p: [], n: [], t: [], c: [] });

/** A rigid body of the wreck: its triangles (in the prop frame, as built) and the box axes it lies by. */
export interface SettleBody {
  tris: SettleTris;
  /** The pieces whose runs it carries (each placed once). */
  pieces: readonly number[];
  /** Its box axes (its first piece's: a snapped member's lengths and a stack's loose things keep their piece's) and its
   *  centre. */
  axes: [V3, V3, V3];
  centre: V3;
}

/** The kit's art for a broken end (shedFractureEdge, fortFractureEdge): two runs a score, the − half's cap first. */
export type SettleEdge = (material: FractureMaterial, piece: FracturePiece, score: number | 'whole', seed: number,
  out: DamageMeshWriter) => void;

export interface SettleOptions {
  /** The grid's cell (m) and how far past the pieces' boxes it reaches (m). */
  cell?: number;
  margin?: number;
  /** The ground under the wreck in the prop frame (default flat at 0): a pillbox's bank, say. */
  ground?: (x: number, z: number) => number;
  /** How a laid body is dusted: its colours times dust * (1 ± spread/2), hashed by place. */
  dust?: number;
  dustSpread?: number;
  /**
   * (props #1, the huts' r2 round) A body of several members (a wall's boards and battens, a frame's plates) is laid
   * whole, then each of its members that does not rest on what is under it comes down onto it: nothing of a fallen
   * piece hangs in the air (the r2 standard's floating check). Off by default (the pillbox lays its own).
   */
  restMembers?: boolean;
}

export interface FallOptions {
  /** Most the settle may tip it from the pose it is given (rad; default 1.5). */
  maxTilt?: number;
  /** A wall's least swing before what it meets can stop it (rad; default 1.0: a panel stopped nearer upright slides on). */
  minSwing?: number;
  /** No part of it should come to rest higher (m): it is moved out from the wreck's middle and laid again (3 more tries). */
  ceiling?: number;
  /** A topple that stays on its hinge (a cast wall leaning on its stub and the bank): laid where its swing stops, not
   *  dropped and tipped again. */
  hinged?: boolean;
  /** Colour factor for this body (default the settle's dust). */
  dust?: number;
  /** Sunk into what it rests on (m; default 0.012). */
  sink?: number;
}

/** Captures a kit's edge art (DamageMeshWriter) as runs of plain triangles. */
class CapWriter implements DamageMeshWriter {
  readonly runs: SettleTris[] = [];
  private v: number[] = [];
  private idx: number[] = [];
  private open = false;
  begin(_bucket: string, _role: string): boolean { this.v = []; this.idx = []; this.open = true; return true; }
  vertex(px: number, py: number, pz: number, nx: number, ny: number, nz: number, u: number, v: number,
    r: number, g: number, b: number): number {
    this.v.push(px, py, pz, nx, ny, nz, u, v, r, g, b);
    return this.v.length / 11 - 1;
  }
  triangle(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  end(): void {
    if (!this.open) return;
    const t = emptyTris();
    for (const i of this.idx) {
      const o = i * 11, v = this.v;
      t.p.push(v[o], v[o + 1], v[o + 2]); t.n.push(v[o + 3], v[o + 4], v[o + 5]);
      t.t.push(v[o + 6], v[o + 7]); t.c.push(v[o + 8], v[o + 9], v[o + 10]);
    }
    this.runs.push(t);
    this.open = false;
  }
  get vertices(): number { return this.v.length / 11; }
  get capacity(): number { return 1 << 20; }
}

/**
 * A kit's edge art for one break as plain runs: [the − half's cap facing +, the + half's cap facing −] (empty where the
 * art draws nothing). `piece` may be a copy with its own score axis (a stub's top, a lift's foot).
 */
export function edgeRuns(edge: SettleEdge, piece: FracturePiece, score: number, seed: number): SettleTris[] {
  const w = new CapWriter();
  edge(piece.material, piece, score, seed, w);
  return w.runs;
}

function hash2(x: number, z: number, salt: number): number {
  let h = Math.imul(Math.floor(x * 7.3) | 0, 374761393) ^ Math.imul(Math.floor(z * 7.3) | 0, 668265263) ^ Math.imul(salt | 0, 1103515245);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * The settle of one kind's wreck. The kit lays its pieces in order — what stands first, then each body from the bottom
 * of the building up, so a roof finds the walls and members that fell before it — and takes the geometry at the end.
 */
export class FractureSettle {
  readonly pieces: readonly FracturePiece[];
  private readonly pos: ArrayLike<number>;
  private readonly nor: ArrayLike<number>;
  private readonly uv: ArrayLike<number>;
  private readonly col: ArrayLike<number>;
  private readonly out = emptyTris();
  private readonly laid: Uint8Array;
  private readonly cell: number;
  private readonly x0: number;
  private readonly z0: number;
  private readonly nx: number;
  private readonly nz: number;
  /** The heap's height a cell (the ground first). */
  private readonly h: Float32Array;
  private readonly ground: (x: number, z: number) => number;
  private readonly dust: number;
  private readonly dustSpread: number;
  private readonly restMembers: boolean;
  private salt = 0;
  /** While bodies fall together: their samples, raised into the heap when the last of them has come to rest. */
  private deferred: Float64Array[] | null = null;

  constructor(geometry: THREE.BufferGeometry, anatomy: KitFractureAnatomy, opts: SettleOptions = {}) {
    this.pieces = anatomy.pieces;
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const need = (name: string): ArrayLike<number> => {
      const a = g.getAttribute(name);
      if (!a) throw new Error(`fractureSettle: the build has no ${name}`);
      return a.array as ArrayLike<number>;
    };
    this.pos = need('position'); this.nor = need('normal'); this.uv = need('uv'); this.col = need('color');
    this.laid = new Uint8Array(this.pieces.length);
    this.cell = opts.cell ?? 0.08;
    this.ground = opts.ground ?? (() => 0);
    this.dust = opts.dust ?? 0.82;
    this.dustSpread = opts.dustSpread ?? 0.16;
    this.restMembers = opts.restMembers ?? false;
    // the grid over every piece's box, out by the margin
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of this.pieces) {
      const r = Math.hypot(p.h[0], p.h[1], p.h[2]);
      x0 = Math.min(x0, p.c[0] - r); x1 = Math.max(x1, p.c[0] + r);
      z0 = Math.min(z0, p.c[2] - r); z1 = Math.max(z1, p.c[2] + r);
    }
    const m = opts.margin ?? 3;
    this.x0 = x0 - m; this.z0 = z0 - m;
    this.nx = Math.ceil((x1 - x0 + 2 * m) / this.cell);
    this.nz = Math.ceil((z1 - z0 + 2 * m) / this.cell);
    this.h = new Float32Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      this.h[j * this.nx + i] = this.ground(this.x0 + (i + 0.5) * this.cell, this.z0 + (j + 0.5) * this.cell);
    }
  }

  /** The heap's height at (x, z) (the ground outside the grid). */
  heightAt(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return this.ground(x, z);
    return this.h[j * this.nx + i];
  }

  /** A piece's triangles as built. */
  run(i: number): SettleTris {
    const piece = this.pieces[i];
    const t = emptyTris();
    for (let v = piece.tri0 * 3; v < (piece.tri0 + piece.triN) * 3; v++) {
      t.p.push(this.pos[v * 3], this.pos[v * 3 + 1], this.pos[v * 3 + 2]);
      t.n.push(this.nor[v * 3], this.nor[v * 3 + 1], this.nor[v * 3 + 2]);
      t.t.push(this.uv[v * 2], this.uv[v * 2 + 1]);
      t.c.push(this.col[v * 3], this.col[v * 3 + 1], this.col[v * 3 + 2]);
    }
    return t;
  }

  private claim(i: number): void {
    if (this.laid[i]) throw new Error(`fractureSettle: piece ${i} laid twice`);
    this.laid[i] = 1;
  }

  /** Whether a piece has been laid (or claimed into a body). */
  isLaid(i: number): boolean { return this.laid[i] === 1; }

  /** A piece the wreck does without (a room's darkness, an earth cover the kit lays as a slumped heap of its own). */
  omit(i: number): void { this.claim(i); }

  /** Leaves a piece where it stood. */
  stay(i: number, dust = 0.94): void {
    this.claim(i);
    this.write(this.run(i), dust);
  }

  /**
   * Leaves a piece standing broken off: every vertex over `cutY(x, z)` brought down to it (an upright board, a post or
   * a cast lift keeps its foot and loses its top, square or staggered as the kit's height wanders).
   */
  cut(i: number, cutY: (x: number, z: number) => number, dust = 0.9): void {
    this.claim(i);
    this.write(breakOff(this.run(i), cutY), dust);
  }

  /** More triangles carried by a body (a break's ragged face drawn on the piece before it falls). */
  addTo(b: SettleBody, t: SettleTris): void {
    appendTris(b.tris, t);
    b.centre = centreOf(b.tris);
  }

  /** A body left where it is (a post's stub over its base, a stack's bottom course), broken off at `cutY` if given. */
  fix(b: SettleBody, cutY?: (x: number, z: number) => number, dust = 0.9): void {
    this.write(cutY ? breakOff(b.tris, cutY) : b.tris, dust);
  }

  /** Another piece carried by a body (a window in its length of wall): claimed, its run appended. */
  attach(b: SettleBody, i: number): void {
    this.claim(i);
    appendTris(b.tris, this.run(i));
    b.centre = centreOf(b.tris);
    b.pieces = [...b.pieces, i];
  }

  /** Several pieces as one rigid body (a wall panel with its window and trim), or extra triangles of the kit's. */
  body(pieces: readonly number[], extra?: SettleTris): SettleBody {
    const tris = emptyTris();
    for (const i of pieces) {
      this.claim(i);
      const r = this.run(i);
      tris.p.push(...r.p); tris.n.push(...r.n); tris.t.push(...r.t); tris.c.push(...r.c);
    }
    if (extra) { tris.p.push(...extra.p); tris.n.push(...extra.n); tris.t.push(...extra.t); tris.c.push(...extra.c); }
    const q = pieces.length ? this.pieces[pieces[0]].q : [0, 0, 0, 1];
    return { tris, pieces, axes: [quatRotate(q, [1, 0, 0]), quatRotate(q, [0, 1, 0]), quatRotate(q, [0, 0, 1])], centre: centreOf(tris) };
  }

  /**
   * A piece snapped at its scores (or the kit's own): a body a length, in order along the score axis, each break
   * capped with the kit's edge art (the − length takes the cap facing +, the + length the one facing −).
   */
  snap(i: number, edge?: SettleEdge, scores?: readonly number[], seed = 0): SettleBody[] {
    const piece = this.pieces[i];
    const s = [...(scores ?? piece.scores ?? [])].sort((a, b) => a - b);
    if (!s.length) return [this.body([i])];
    this.claim(i);
    const axis = piece.scoreAxis ?? (piece.h[0] >= piece.h[1] && piece.h[0] >= piece.h[2] ? 0 : piece.h[1] >= piece.h[2] ? 1 : 2);
    const A = quatRotate(piece.q, axis === 0 ? [1, 0, 0] : axis === 1 ? [0, 1, 0] : [0, 0, 1]);
    const c = piece.c as V3;
    const src = this.run(i);
    const parts = s.map(() => emptyTris()).concat([emptyTris()]);
    for (let tri = 0; tri < src.p.length / 9; tri++) {
      // the triangle as a polygon of attributed corners, clipped into each slab between consecutive scores
      const corners: number[][] = [];
      for (let k = 0; k < 3; k++) {
        const v = tri * 3 + k;
        corners.push([src.p[v * 3], src.p[v * 3 + 1], src.p[v * 3 + 2], src.n[v * 3], src.n[v * 3 + 1], src.n[v * 3 + 2],
          src.t[v * 2], src.t[v * 2 + 1], src.c[v * 3], src.c[v * 3 + 1], src.c[v * 3 + 2]]);
      }
      const along = (q: number[]): number => (q[0] - c[0]) * A[0] + (q[1] - c[1]) * A[1] + (q[2] - c[2]) * A[2];
      const d0 = along(corners[0]), d1 = along(corners[1]), d2 = along(corners[2]);
      const lo3 = Math.min(d0, d1, d2), hi3 = Math.max(d0, d1, d2);
      let slab = 0;
      while (slab < s.length && s[slab] <= lo3) slab++;
      if (slab === s.length || s[slab] >= hi3) { pushCorners(parts[slab], corners[0], corners[1], corners[2]); continue; }
      for (let k = 0; k <= s.length; k++) {
        const lo = k === 0 ? -Infinity : s[k - 1], hi = k === s.length ? Infinity : s[k];
        let poly = corners;
        if (lo > -Infinity) poly = clipPoly(poly, (q) => along(q) - lo);
        if (hi < Infinity) poly = clipPoly(poly, (q) => hi - along(q));
        if (poly.length < 3) continue;
        for (let f = 1; f + 1 < poly.length; f++) pushCorners(parts[k], poly[0], poly[f], poly[f + 1]);
      }
    }
    if (edge) {
      for (let k = 0; k < s.length; k++) {
        const w = new CapWriter();
        edge(piece.material, piece, s[k], (seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0, w);
        if (w.runs[0]) appendTris(parts[k], w.runs[0]);
        if (w.runs[1]) appendTris(parts[k + 1], w.runs[1]);
      }
    }
    const axes: [V3, V3, V3] = [quatRotate(piece.q, [1, 0, 0]), quatRotate(piece.q, [0, 1, 0]), quatRotate(piece.q, [0, 0, 1])];
    return parts.filter((t) => t.p.length).map((tris) => ({ tris, pieces: [i], axes, centre: centreOf(tris) }));
  }

  /** A piece of many loose things (a firewood stack, a course of bags) broken into its connected parts. */
  scatter(i: number): SettleBody[] {
    this.claim(i);
    const piece = this.pieces[i];
    const src = this.run(i);
    const triCount = src.p.length / 9;
    const parent = new Int32Array(triCount).map((_, k) => k);
    const find = (k: number): number => { while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; };
    const owner = new Map<string, number>();
    for (let tri = 0; tri < triCount; tri++) {
      for (let k = 0; k < 3; k++) {
        const o = (tri * 3 + k) * 3;
        const key = `${Math.round(src.p[o] * 2000)},${Math.round(src.p[o + 1] * 2000)},${Math.round(src.p[o + 2] * 2000)}`;
        const prev = owner.get(key);
        if (prev === undefined) owner.set(key, tri);
        else { const a = find(prev), b = find(tri); if (a !== b) parent[a] = b; }
      }
    }
    const groups = new Map<number, SettleTris>();
    for (let tri = 0; tri < triCount; tri++) {
      const root = find(tri);
      let t = groups.get(root);
      if (!t) { t = emptyTris(); groups.set(root, t); }
      t.p.push(...src.p.slice(tri * 9, tri * 9 + 9)); t.n.push(...src.n.slice(tri * 9, tri * 9 + 9));
      t.t.push(...src.t.slice(tri * 6, tri * 6 + 6)); t.c.push(...src.c.slice(tri * 9, tri * 9 + 9));
    }
    const axes: [V3, V3, V3] = [quatRotate(piece.q, [1, 0, 0]), quatRotate(piece.q, [0, 1, 0]), quatRotate(piece.q, [0, 0, 1])];
    return [...groups.values()].map((tris) => ({ tris, pieces: [i], axes, centre: centreOf(tris) }));
  }

  /**
   * A body swung about its foot toward `dir` (horizontal): it turns until it lies on what is under it or comes to lean on
   * something standing (at most `angle`), then settles.
   */
  topple(b: SettleBody, dir: V3, angle: number, o: FallOptions = {}): void {
    const d = nrm([dir[0], 0, dir[2]]);
    // the pivot: the foot of its face toward dir, where it stands
    let reach = -Infinity, minY = Infinity;
    for (let k = 0; k < b.tris.p.length; k += 3) {
      const v: V3 = [b.tris.p[k], b.tris.p[k + 1], b.tris.p[k + 2]];
      reach = Math.max(reach, dot(sub(v, b.centre), d));
      minY = Math.min(minY, v[1]);
    }
    const pivot: V3 = [b.centre[0] + d[0] * reach, minY, b.centre[2] + d[2] * reach];
    const axis = nrm(cross(UP, d));
    // swing in steps; stop before the first step that would sink it into the heap past its pivot's own reach
    const steps = Math.max(4, Math.ceil(angle / 0.07));
    const minSwing = Math.min(angle, o.minSwing ?? 1.0);
    const pts = samplesOf(b.tris);
    let done = 0;
    for (let s = 1; s <= steps; s++) {
      const a = (angle * s) / steps;
      if (a <= minSwing) { done = a; continue; }
      // (the cells along its hinge are where it stands: only what it swings out over can stop it)
      const gap = this.gapOf(pts, about(rotAxis(axis, a), pivot, pivot), (x, z) => (x - pivot[0]) * d[0] + (z - pivot[2]) * d[2] > 0.22);
      if (gap < -0.02) break;
      done = a;
    }
    this.transform(b.tris, rotAxis(axis, done), pivot, pivot);
    turnAxes(b, rotAxis(axis, done));
    if (o.hinged) { b.centre = centreOf(b.tris); this.write(b.tris, o.dust ?? this.dust); return; }
    this.settle(b, o);
  }

  /** A body dropped where it is (turned by `yaw` about its centre and moved by `shift`), then settled. */
  drop(b: SettleBody, yaw = 0, shift: V3 = [0, 0, 0], o: FallOptions = {}): void {
    const R = rotAxis(UP, yaw);
    this.transform(b.tris, R, b.centre, add(b.centre, [shift[0], 0.0, shift[2]]));
    turnAxes(b, R);
    this.settle(b, o);
  }

  /**
   * A body laid down: its longest box axis level along `yaw`, its thinnest up (or down when `flip`), rolled about its
   * length by `roll`, moved by `shift`, then settled.
   */
  lie(b: SettleBody, yaw: number, shift: V3, flip = false, roll = 0, o: FallOptions = {}): void {
    const ext = b.axes.map((a) => {
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < b.tris.p.length; k += 3) {
        const s = dot([b.tris.p[k] - b.centre[0], b.tris.p[k + 1] - b.centre[1], b.tris.p[k + 2] - b.centre[2]], a);
        lo = Math.min(lo, s); hi = Math.max(hi, s);
      }
      return hi - lo;
    });
    const L = ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : ext[1] >= ext[2] ? 1 : 2;
    const T = [0, 1, 2].filter((k) => k !== L).sort((p, q) => ext[p] - ext[q])[0];
    const M = 3 - L - T;
    const bL: V3 = [Math.cos(yaw), 0, Math.sin(yaw)];
    const bT: V3 = flip ? [0, -1, 0] : [0, 1, 0];
    let bM = cross(bT, bL);
    // a proper rotation: the target triple keeps the source triple's handedness
    const src: [V3, V3, V3] = [b.axes[0], b.axes[1], b.axes[2]];
    const det = (m: [V3, V3, V3]): number => dot(m[0], cross(m[1], m[2]));
    const tgt: [V3, V3, V3] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    tgt[L] = bL; tgt[T] = bT; tgt[M] = bM;
    if (Math.sign(det(tgt)) !== Math.sign(det(src))) { bM = scl(bM, -1); tgt[M] = bM; }
    // R maps src[k] to tgt[k]: R v = sum_k tgt[k] (src[k] . v)
    const R0: Rot = [
      add(add(scl(tgt[0], src[0][0]), scl(tgt[1], src[1][0])), scl(tgt[2], src[2][0])),
      add(add(scl(tgt[0], src[0][1]), scl(tgt[1], src[1][1])), scl(tgt[2], src[2][1])),
      add(add(scl(tgt[0], src[0][2]), scl(tgt[1], src[1][2])), scl(tgt[2], src[2][2])),
    ];
    const Rr = rotAxis(bL, roll);
    const R: Rot = [rotApply(Rr, R0[0]), rotApply(Rr, R0[1]), rotApply(Rr, R0[2])];
    this.transform(b.tris, R, b.centre, add(b.centre, [shift[0], 0, shift[2]]));
    turnAxes(b, R);
    this.settle(b, o);
  }

  /** Extra triangles of the kit's laid as they are (clods, a spill): seated on the heap where `seat` asks. */
  extra(t: SettleTris, dust = 1): void { this.write(t, dust); }

  /**
   * Bodies that fall together (a slab's plates, a roof's sections): each comes to rest on the heap as it was before any
   * of them, so they lie side by side as they fall instead of stacking one on the next as the settle lays them in turn.
   */
  together(lay: () => void): void {
    this.deferred = [];
    try { lay(); } finally {
      const queued = this.deferred;
      this.deferred = null;
      for (const pts of queued) this.raise(pts);
    }
  }

  /** The pieces not laid yet (a kit asserts none are left). */
  unlaid(): number[] {
    const out: number[] = [];
    this.laid.forEach((v, i) => { if (!v) out.push(i); });
    return out;
  }

  /** The wreck: every laid triangle in the order laid. */
  finish(): THREE.BufferGeometry {
    const left = this.unlaid();
    if (left.length) throw new Error(`fractureSettle: pieces never laid: ${left.join(', ')}`);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.out.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.out.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.out.t, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.out.c, 3));
    return g;
  }

  // --- internals

  /** Turns the triangles by R about `from`, placing `from` at `to`. */
  private transform(t: SettleTris, R: Rot, from: V3, to: V3): void {
    for (let k = 0; k < t.p.length; k += 3) {
      const v = rotApply(R, [t.p[k] - from[0], t.p[k + 1] - from[1], t.p[k + 2] - from[2]]);
      t.p[k] = v[0] + to[0]; t.p[k + 1] = v[1] + to[1]; t.p[k + 2] = v[2] + to[2];
      const n = rotApply(R, [t.n[k], t.n[k + 1], t.n[k + 2]]);
      t.n[k] = n[0]; t.n[k + 1] = n[1]; t.n[k + 2] = n[2];
    }
  }

  /** The heap's height at a point, cell-exact inside the grid (the ground outside it). */
  private heapAt(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return this.ground(x, z);
    return this.h[j * this.nx + i];
  }

  /** The least gap between a body's samples (moved by `xf`) and the heap, over the points `where` keeps. */
  private gapOf(pts: Float64Array, xf: Xf, where?: (x: number, z: number) => boolean): number {
    let gap = Infinity;
    const [c0, c1, c2] = xf.R, t = xf.t;
    for (let k = 0; k < pts.length; k += 3) {
      const px = pts[k], py = pts[k + 1], pz = pts[k + 2];
      const x = c0[0] * px + c1[0] * py + c2[0] * pz + t[0];
      const z = c0[2] * px + c1[2] * py + c2[2] * pz + t[2];
      if (where && !where(x, z)) continue;
      const g = c0[1] * px + c1[1] * py + c2[1] * pz + t[1] - this.heapAt(x, z);
      if (g < gap) gap = g;
    }
    return gap;
  }

  /**
   * Rests a body on the heap: dropped until it touches, then tipped about that contact toward its centre of mass until
   * another point comes to rest (at most maxTilt in all), a few times over; then written.
   */
  private settle(b: SettleBody, o: FallOptions): void {
    const pts = samplesOf(b.tris);
    const mid: V3 = [this.x0 + this.nx * this.cell / 2, 0, this.z0 + this.nz * this.cell / 2];
    let xf = this.rest(pts, o, IDENTITY);
    if (o.ceiling !== undefined) {
      const c = centreOf(b.tris), out = nrm([c[0] - mid[0] + 1e-3, 0, c[2] - mid[2]]);
      for (let attempt = 1; attempt < 4 && topOf(pts, xf) > o.ceiling; attempt++) {
        // (out from the middle, farther each time; the last time laid flat, clear of the heap, on the ground)
        if (attempt < 3) {
          const reach = 0.55 * attempt;
          xf = this.rest(pts, o, about(IDENTITY.R, c, [c[0] + out[0] * reach, c[1], c[2] + out[2] * reach]));
          continue;
        }
        // (the looks lane, 2026-10-15: a big piece — a greenhouse's film, a garage's arch — laid 1.7 m out still lay on the
        // heap over the ceiling, and the next came down on it: the space stations' wrecks stood higher than the stations.
        // Out farther until it lies under the ceiling, or where it lies lowest.)
        let best = xf, bestTop = Infinity;
        for (const reach of [1.7, 2.6, 3.8, 5.4, 7.5]) {
          const laid = this.rest(pts, { ...o, maxTilt: 0.3 }, about(flatTurn(b), c, [c[0] + out[0] * reach, c[1], c[2] + out[2] * reach]));
          const top = topOf(pts, laid);
          if (top < bestTop) { best = laid; bestTop = top; }
          if (top <= o.ceiling) break;
        }
        // (2026-10-16: a sheet as wide as the station — the rover garage's canopy, a greenhouse's arched rib — tipped even
        // 0.3 onto the heap still stood a metre over the station on a quarter of the seeds: laid level on what is under
        // it instead, where it lies lowest)
        if (bestTop > o.ceiling) {
          for (const reach of [0, 1.7, 3.8, 7.5]) {
            const level = this.rest(pts, { ...o, maxTilt: 0 }, about(flatTurn(b), c, [c[0] + out[0] * reach, c[1], c[2] + out[2] * reach]));
            const top = topOf(pts, level);
            if (top < bestTop) { best = level; bestTop = top; }
            if (top <= o.ceiling) break;
          }
        }
        xf = best;
      }
    }
    const sink = o.sink ?? 0.012;
    xf = { R: xf.R, t: [xf.t[0], xf.t[1] - sink, xf.t[2]] };
    xfTris(b.tris, xf);
    if (this.restMembers && this.restEachMember(b.tris, sink)) {
      b.centre = centreOf(b.tris);
      this.write(b.tris, o.dust ?? this.dust);
      return;
    }
    b.centre = centreOf(b.tris);
    // (the samples moved with it raise the heap: no second sampling)
    const moved = new Float64Array(pts.length);
    const [c0, c1, c2] = xf.R;
    for (let k = 0; k < pts.length; k += 3) {
      moved[k] = c0[0] * pts[k] + c1[0] * pts[k + 1] + c2[0] * pts[k + 2] + xf.t[0];
      moved[k + 1] = c0[1] * pts[k] + c1[1] * pts[k + 1] + c2[1] * pts[k + 2] + xf.t[1];
      moved[k + 2] = c0[2] * pts[k] + c1[2] * pts[k + 1] + c2[2] * pts[k + 2] + xf.t[2];
    }
    this.write(b.tris, o.dust ?? this.dust, moved);
  }

  /**
   * Each member of a laid body (its welded components), lowest first, brought down onto what is under it when it does
   * not rest there already: the heap as it was, or the body's members already placed (a batten stays on its boards, a
   * board left over air comes down onto the heap), kept level; true when any moved.
   */
  private restEachMember(t: SettleTris, sink: number): boolean {
    const comps = components(t);
    if (comps.length < 2) return false;
    const { cell, x0, z0, nx, nz } = this;
    const local = new Map<number, number>();
    const supportAt = (x: number, z: number): number => {
      const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell);
      const own = i >= 0 && j >= 0 && i < nx && j < nz ? local.get(j * nx + i) : undefined;
      const heap = this.heapAt(x, z);
      return own !== undefined && own > heap ? own : heap;
    };
    const members = comps.map((tris) => {
      const sub: SettleTris = { p: [], n: [], t: [], c: [] };
      for (const tri of tris) for (let k = 0; k < 9; k++) sub.p.push(t.p[tri * 9 + k]);
      const pts = samplesOf(sub);
      let low = Infinity;
      for (let k = 1; k < pts.length; k += 3) low = Math.min(low, pts[k]);
      return { tris, pts, low };
    }).sort((a, b) => a.low - b.low);
    let moved = false;
    for (const { tris, pts } of members) {
      let gap = Infinity;
      for (let k = 0; k < pts.length; k += 3) gap = Math.min(gap, pts[k + 1] - supportAt(pts[k], pts[k + 2]));
      let dy = 0;
      if (gap > 0.015 && Number.isFinite(gap)) {
        dy = gap + sink;
        for (const tri of tris) for (let k = 1; k < 9; k += 3) t.p[tri * 9 + k] -= dy;
        moved = true;
      }
      // (it is under what comes after it: its samples over their cells and the eight round them, as the heap is raised)
      for (let k = 0; k < pts.length; k += 3) {
        const i = Math.floor((pts[k] - x0) / cell), j = Math.floor((pts[k + 2] - z0) / cell), y = pts[k + 1] - dy;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const c = jj * nx + ii, was = local.get(c);
          if (was === undefined || y > was) local.set(c, y);
        }
      }
    }
    return moved;
  }

  /** The pose (from `start`) a body's samples come to rest in: dropped and tipped, a few times over. */
  private rest(pts: Float64Array, o: FallOptions, start: Xf): Xf {
    const maxTilt = o.maxTilt ?? 1.5;
    let xf = start, tilted = 0;
    const n = pts.length / 3;
    const moved = new Float64Array(pts.length), gaps = new Float64Array(n);
    for (let iter = 0; iter < 8; iter++) {
      // drop onto the highest support
      let gap = Infinity, at = -1;
      const [c0, c1, c2] = xf.R, tt = xf.t;
      for (let k = 0; k < n; k++) {
        const px = pts[k * 3], py = pts[k * 3 + 1], pz = pts[k * 3 + 2];
        const x = c0[0] * px + c1[0] * py + c2[0] * pz + tt[0];
        const y = c0[1] * px + c1[1] * py + c2[1] * pz + tt[1];
        const z = c0[2] * px + c1[2] * py + c2[2] * pz + tt[2];
        moved[k * 3] = x; moved[k * 3 + 1] = y; moved[k * 3 + 2] = z;
        gaps[k] = y - this.heapAt(x, z);
        if (gaps[k] < gap) { gap = gaps[k]; at = k; }
      }
      if (at < 0) break;
      xf = { R: xf.R, t: [xf.t[0], xf.t[1] - gap, xf.t[2]] };
      if (tilted >= maxTilt - 1e-3) break;
      // tip toward the centre of mass about the support: the points resting (within a centimetre of the lowest), their
      // middle and how far they reach toward the centre of mass; a centre of mass over them stands, one past them tips
      // about the farthest resting point toward it (a single point, or the edge a panel rests on)
      let mx = 0, mz = 0, sx = 0, sz = 0, sn = 0;
      for (let k = 0; k < n; k++) {
        mx += moved[k * 3]; mz += moved[k * 3 + 2];
        if (gaps[k] - gap < 0.012) { sx += moved[k * 3]; sz += moved[k * 3 + 2]; sn++; }
      }
      mx /= n; mz /= n; sx /= sn; sz /= sn;
      const lever = Math.hypot(mx - sx, mz - sz);
      if (lever < this.cell * 0.75) break;
      const d: V3 = [(mx - sx) / lever, 0, (mz - sz) / lever];
      let reach = -Infinity, at2 = at;
      for (let k = 0; k < n; k++) {
        if (gaps[k] - gap >= 0.012) continue;
        const r = (moved[k * 3] - sx) * d[0] + (moved[k * 3 + 2] - sz) * d[2];
        if (r > reach) { reach = r; at2 = k; }
      }
      if (lever <= reach + this.cell * 0.5) break; // the centre of mass is over what it rests on
      const cx = moved[at2 * 3], cz = moved[at2 * 3 + 2];
      // the angle at which the first point on the far side comes down onto the heap
      let need = Infinity;
      for (let k = 0; k < n; k++) {
        const r = (moved[k * 3] - cx) * d[0] + (moved[k * 3 + 2] - cz) * d[2];
        if (r < this.cell * 1.5) continue;
        need = Math.min(need, Math.asin(Math.min(1, Math.max(0, gaps[k] - gap) / r)));
      }
      if (!Number.isFinite(need) || need < 0.004) break;
      const a = Math.min(need, maxTilt - tilted);
      const pivot: V3 = [cx, moved[at2 * 3 + 1] - gap, cz];
      xf = compose(xf, about(rotAxis(nrm(cross(UP, d)), a), pivot, pivot));
      tilted += a;
    }
    return xf;
  }

  /** Writes a body's triangles to the wreck (dusted) and raises the heap under them. */
  private write(t: SettleTris, dust: number, samples?: Float64Array): void {
    const salt = ++this.salt;
    for (let k = 0; k < t.p.length; k += 3) {
      const f = dust * (1 - this.dustSpread / 2 + this.dustSpread * hash2(t.p[k], t.p[k + 2], salt));
      this.out.p.push(t.p[k], t.p[k + 1], t.p[k + 2]);
      this.out.n.push(t.n[k], t.n[k + 1], t.n[k + 2]);
      // dusted toward a dry grey-brown as well as darkened
      const r = t.c[k] * f, g = t.c[k + 1] * f, bl = t.c[k + 2] * f, mean = (r + g + bl) / 3;
      const toDust = (1 - dust) * 0.35;
      this.out.c.push(r + (mean * 1.04 - r) * toDust, g + (mean * 0.98 - g) * toDust, bl + (mean * 0.88 - bl) * toDust);
    }
    for (let k = 0; k < t.t.length; k++) this.out.t.push(t.t[k]);
    // the heap rises under it: its samples, each over its cell and the eight round it (the samples lie closer than
    // three cells, so no gap is left for a later body to sink through)
    const pts = samples ?? samplesOf(t);
    if (this.deferred) this.deferred.push(pts);
    else this.raise(pts);
  }

  /** Raises the heap under a body's samples. */
  private raise(pts: Float64Array): void {
    const { cell, x0, z0, nx, nz, h } = this;
    for (let k = 0; k < pts.length; k += 3) {
      const i = Math.floor((pts[k] - x0) / cell), j = Math.floor((pts[k + 2] - z0) / cell), y = pts[k + 1];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const c = jj * nx + ii;
        if (y > h[c]) h[c] = y;
      }
    }
  }
}

/**
 * What stands of a run broken off at cutY: a triangle wholly above the break is gone, one across it is brought down to
 * it (an upright board, a post or a cast lift keeps its foot and loses its top; a level board over the break goes).
 */
function breakOff(t: SettleTris, cutY: (x: number, z: number) => number): SettleTris {
  const out = emptyTris();
  for (let tri = 0; tri < t.p.length / 9; tri++) {
    const ys: number[] = [];
    let above = 0;
    for (let k = 0; k < 3; k++) {
      const o = tri * 9 + k * 3, cy = cutY(t.p[o], t.p[o + 2]);
      ys.push(Math.min(t.p[o + 1], cy));
      if (t.p[o + 1] > cy + 1e-4) above++;
    }
    if (above === 3) continue;
    for (let k = 0; k < 3; k++) {
      const o = tri * 9 + k * 3;
      out.p.push(t.p[o], ys[k], t.p[o + 2]); out.n.push(t.n[o], t.n[o + 1], t.n[o + 2]);
      out.c.push(t.c[o], t.c[o + 1], t.c[o + 2]);
    }
    for (let k = 0; k < 6; k++) out.t.push(t.t[tri * 6 + k]);
  }
  return out;
}

/** The turn that lays a body flat: its thinnest box axis upright, its longest level along where it points now. */
/** A body's box axes turned with it (2026-10-16: they stayed as built, so a body laid, dropped or toppled and then
 *  relayed by the ceiling was turned flat about its old axes — a greenhouse's arched rib came to rest on its edge, 8 m
 *  tall, wherever it was relayed). */
function turnAxes(b: SettleBody, R: Rot): void {
  b.axes = [rotApply(R, b.axes[0]), rotApply(R, b.axes[1]), rotApply(R, b.axes[2])];
}

function flatTurn(b: SettleBody): Rot {
  const c = centreOf(b.tris);
  const ext = b.axes.map((a) => {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < b.tris.p.length; k += 3) {
      const s = dot([b.tris.p[k] - c[0], b.tris.p[k + 1] - c[1], b.tris.p[k + 2] - c[2]], a);
      lo = Math.min(lo, s); hi = Math.max(hi, s);
    }
    return hi - lo;
  });
  const T = ext[0] <= ext[1] && ext[0] <= ext[2] ? 0 : ext[1] <= ext[2] ? 1 : 2;
  const up = b.axes[T][1] >= 0 ? b.axes[T] : scl(b.axes[T], -1);
  // the shortest turn taking `up` to the vertical
  const axis = cross(up, UP), sin = Math.hypot(axis[0], axis[1], axis[2]), cos = up[1];
  if (sin < 1e-6) return IDENTITY.R;
  return rotAxis(scl(axis, 1 / sin), Math.atan2(sin, cos));
}

/** Moves a run's positions and turns its normals. */
function xfTris(t: SettleTris, x: Xf): void {
  for (let k = 0; k < t.p.length; k += 3) {
    const v = xfApply(x, t.p[k], t.p[k + 1], t.p[k + 2]);
    t.p[k] = v[0]; t.p[k + 1] = v[1]; t.p[k + 2] = v[2];
    const n = rotApply(x.R, [t.n[k], t.n[k + 1], t.n[k + 2]]);
    t.n[k] = n[0]; t.n[k + 1] = n[1]; t.n[k + 2] = n[2];
  }
}

/** A body's highest point once moved. */
function topOf(pts: Float64Array, x: Xf): number {
  let top = -Infinity;
  const [c0, c1, c2] = x.R;
  for (let k = 0; k < pts.length; k += 3) top = Math.max(top, c0[1] * pts[k] + c1[1] * pts[k + 1] + c2[1] * pts[k + 2] + x.t[1]);
  return top;
}

/**
 * The points a body is settled by: its corners (once each), points along its long edges and over its broad faces every
 * SAMPLE_M, so a long board finds a ridge under its middle and a roof section the stub under its field.
 */
const SAMPLE_M = 0.16;
const SAMPLE_CAP = 3000;
/** A run's triangles gathered into its welded members (triangles sharing a corner within a millimetre). */
function components(t: SettleTris): number[][] {
  const n = t.p.length / 9, parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const seen = new Map<string, number>();
  for (let tri = 0; tri < n; tri++) {
    for (let k = 0; k < 3; k++) {
      const o = tri * 9 + k * 3;
      const key = `${Math.round(t.p[o] * 1000)},${Math.round(t.p[o + 1] * 1000)},${Math.round(t.p[o + 2] * 1000)}`;
      const other = seen.get(key);
      if (other === undefined) seen.set(key, tri);
      else { const a = find(tri), b = find(other); if (a !== b) parent[a] = b; }
    }
  }
  const groups = new Map<number, number[]>();
  for (let tri = 0; tri < n; tri++) { const r = find(tri); const g = groups.get(r) ?? []; g.push(tri); groups.set(r, g); }
  return [...groups.values()];
}

function samplesOf(t: SettleTris): Float64Array {
  const out: number[] = [];
  const put = (x: number, y: number, z: number): void => { out.push(x, y, z); };
  // (each edge from its first corner, its last left to the next edge: a closed run's corners are each taken once a face)
  const edge = (a: V3, b: V3): void => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / SAMPLE_M);
    for (let k = 0; k < n; k++) { const u = k / n; put(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u); }
  };
  for (let tri = 0; tri < t.p.length / 9; tri++) {
    const o = tri * 9;
    const a: V3 = [t.p[o], t.p[o + 1], t.p[o + 2]], b: V3 = [t.p[o + 3], t.p[o + 4], t.p[o + 5]], c: V3 = [t.p[o + 6], t.p[o + 7], t.p[o + 8]];
    edge(a, b); edge(b, c); edge(c, a);
    // a broad face (a sheet, a slab) is sampled over its field too; a long thin one along its edges is enough
    const ab = sub(b, a), ac = sub(c, a), cr = cross(ab, ac), area = Math.hypot(cr[0], cr[1], cr[2]) / 2;
    const longest = Math.max(Math.hypot(...ab), Math.hypot(...ac), Math.hypot(...sub(c, b)));
    if (area / longest < SAMPLE_M * 0.6) continue;
    const n = Math.ceil(longest / SAMPLE_M);
    for (let i = 1; i < n; i++) for (let j = 1; i + j < n; j++) {
      const u = i / n, v = j / n;
      put(a[0] + ab[0] * u + ac[0] * v, a[1] + ab[1] * u + ac[1] * v, a[2] + ab[2] * u + ac[2] * v);
    }
  }
  if (out.length / 3 <= SAMPLE_CAP) return Float64Array.from(out);
  // (a body of thousands of small faces: every k-th point, the corners of its box kept by the stride's spread)
  const stride = Math.ceil(out.length / 3 / SAMPLE_CAP), kept: number[] = [];
  for (let k = 0; k < out.length / 3; k += stride) kept.push(out[k * 3], out[k * 3 + 1], out[k * 3 + 2]);
  return Float64Array.from(kept);
}

function centreOf(t: SettleTris): V3 {
  let lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < t.p.length; k += 3) {
    lo = [Math.min(lo[0], t.p[k]), Math.min(lo[1], t.p[k + 1]), Math.min(lo[2], t.p[k + 2])];
    hi = [Math.max(hi[0], t.p[k]), Math.max(hi[1], t.p[k + 1]), Math.max(hi[2], t.p[k + 2])];
  }
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
}

/** Sutherland–Hodgman against one plane (keeps f >= 0), interpolating every attribute. */
function clipPoly(poly: number[][], f: (q: number[]) => number): number[][] {
  const out: number[][] = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    const fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const s = fa / (fa - fb);
      out.push(a.map((v, i) => v + (b[i] - v) * s));
    }
  }
  return out;
}

function pushCorners(t: SettleTris, ...corners: number[][]): void {
  for (const q of corners) {
    t.p.push(q[0], q[1], q[2]); t.n.push(q[3], q[4], q[5]); t.t.push(q[6], q[7]); t.c.push(q[8], q[9], q[10]);
  }
}

function appendTris(to: SettleTris, from: SettleTris): void {
  to.p.push(...from.p); to.n.push(...from.n); to.t.push(...from.t); to.c.push(...from.c);
}
