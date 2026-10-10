// src/world/maps/fortKit.ts — the field works' pillbox, rebuilt (the fortifications lane, 2026-10-09).
//
// The owner, 2026-10-09: "make sure the destructible buildings are just as good looking as normal buildings ... the
// bunkers and pillboxes needs to be improved a lot" (R259). Gauntlet wave 315 on the old pillbox (inhabitKit bBunker):
// "rough boxes with a tan trim band and a smooth grey roof, sitting on brown plinths or on flat brown patches that look
// pasted onto the grass".
//
// A pillbox here is poured reinforced concrete, built as its period built it:
// - walls a metre thick, shown where the embrasure steps in through them (the stepped Stufenscharte, its steel plate);
// - chamfered arrises, a roof slab with its overhang, drip groove and chamfer;
// - the dogleg entrance behind a blast wall at the back, sandbags at its mouth, a vent pipe on the roof;
// - board-formwork concrete: the props' `fortConcrete` bucket, the board-formed print (regionalSurfaces.ts boardFormed)
//   under these vertex colours, which carry the weather: damp foot, rain runs under the drip and the slits, soot over
//   the embrasures, moss and lichen;
// - earth banked against three walls to the sill, turf on the roof. The bank is the battlefield's earthwork, not the
//   destructible's (pillboxBerm; props.ts lays it with its own collision and draws it in the ground's material).
// Its destroyed state is the same concrete broken: the walls razed to ragged stubs with their bars bent out, the slab
// cracked into plates fallen into the room, rubble at a real volume, soot, all under BROKEN_CAP (a broken prop has no
// collider, so nothing of it stands higher than a hull crosses); the bank stands round it, its earth face bared.
//
// Regional forms (pillboxStyleFor): the German Regelbau casemate (western Europe 1940-45 and its relics), the Soviet
// DOT with its rounded front under a thick earth cover, the hexagonal pillbox (the KMT lines of 1937, the Japanese and
// Spanish rounds), and the log-and-earth DZOT / bunker (Kursk, Kohima, the 1941 maneuvers, Narvik, modern dugouts).
// The desert maps keep the sangar (regional/desertSangar.ts).
//
// Pure geometry: no DOM, no materials. Every part carries position, normal, uv and color (linear). Concrete takes the
// print at the plaster buckets' 0.42 repeats per metre; everything else samples one plain texel of it (FLAT_UV) and
// carries its own colour divided by that texel's.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sandbagBag } from './sceneryKit.ts';

type Rng = () => number;
type V3 = [number, number, number];
export type Rgb = readonly [number, number, number];

/** The print's repeats per metre (the board-formed tile is 2.38 m: sixteen 15 cm boards). */
const UV_PER_M = 0.42;
/**
 * A plain texel of the board-formed print (mid-board, clear of lift lines, ties, tears and butt joints at the tile's
 * seed; FORT_PRINT_SEED): the earth, turf, timber, steel and bags sample it and carry their colour over its value.
 */
export const FLAT_UV: readonly [number, number] = [0.252, 0.715];
/** The print's seed (props.ts paints the bucket with it, so FLAT_UV's texel is the one measured here). */
export const FORT_PRINT_SEED = 0xb0a8;
/** The linear value the props lift the print's mean to (fortPrintLift); vertex colours are albedo over it. */
export const FORT_PRINT_MEAN = 0.42;

export type PillboxStyle = 'regelbau' | 'dot' | 'hex' | 'logearth';

/** One map's tones for its pillbox, linear albedo. */
export interface FortTones {
  concrete: Rgb;
  earth: Rgb;
  turf: Rgb;
  /** dry grass or sand over the toe and crest */
  crest: Rgb;
  timber: Rgb;
  bag: Rgb;
  /** 0 fresh .. 1 an old relic (moss, lichen, rust, runs) */
  age: number;
  /** a sandy map: no moss, the berm sand */
  arid: boolean;
  /** the period's paint: the 1944 casemates' sprayed blotches, the winter's lime wash (worn by `age`) */
  camo?: 'pattern' | 'whitewash';
}

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hexLin = (hex: number): Rgb => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number): number => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------------------------------------------
// noise (hash-based: no draws from any stream)

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ seed) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** Smooth value noise in 3D at `scale` metres, 0..1. */
function vnoise(x: number, y: number, z: number, scale: number, seed: number): number {
  const fx = x / scale, fy = y / scale, fz = z / scale;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), sz = tz * tz * (3 - 2 * tz);
  const v = (i: number, j: number, k: number) => hash3(ix + i, iy + j, iz + k, seed);
  const a = v(0, 0, 0) + (v(1, 0, 0) - v(0, 0, 0)) * sx, b = v(0, 1, 0) + (v(1, 1, 0) - v(0, 1, 0)) * sx;
  const c = v(0, 0, 1) + (v(1, 0, 1) - v(0, 0, 1)) * sx, d = v(0, 1, 1) + (v(1, 1, 1) - v(0, 1, 1)) * sx;
  const e = a + (b - a) * sy, f = c + (d - c) * sy;
  return e + (f - e) * sz;
}
function fbm(x: number, y: number, z: number, scale: number, seed: number): number {
  return vnoise(x, y, z, scale, seed) * 0.55 + vnoise(x, y, z, scale * 0.47, seed + 7) * 0.3 + vnoise(x, y, z, scale * 0.21, seed + 13) * 0.15;
}

// ---------------------------------------------------------------------------------------------------------------
// the mesh writer

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** How a surface colours itself at a point: linear albedo (before the print's division). */
type Shade = (p: V3, n: V3) => Rgb;

class Mesh {
  /** vertex colours = albedo x this: over the print's mean (the fortConcrete bucket), or 1 (the plain baked bucket) */
  readonly colourScale: number;
  constructor(colourScale = 1 / FORT_PRINT_MEAN) { this.colourScale = colourScale; }
  readonly p: number[] = [];
  readonly n: number[] = [];
  readonly t: number[] = [];
  readonly c: number[] = [];
  /** One vertex: its colour is albedo; `print` true samples the board print at the uv, false the plain texel. */
  vertex(p: V3, n: V3, uv: readonly [number, number] | null, col: Rgb): void {
    this.p.push(p[0], p[1], p[2]);
    this.n.push(n[0], n[1], n[2]);
    const u = uv ?? FLAT_UV;
    this.t.push(u[0], u[1]);
    this.c.push(col[0] * this.colourScale, col[1] * this.colourScale, col[2] * this.colourScale);
  }
  /**
   * A flat quad a b c d (either winding): with `n` its normal is n and its winding follows it; with `hint` its normal
   * is its own, turned to agree with the hint; with neither, its own as wound.
   */
  quad(a: V3, b: V3, c: V3, d: V3, shade: Shade, printed: boolean, n?: V3, hint?: V3): void {
    let g = norm(cross(sub(b, a), sub(d, a)));
    const want = n ?? hint;
    if (want && g[0] * want[0] + g[1] * want[1] + g[2] * want[2] < 0) { const t = b; b = d; d = t; g = scl(g, -1); }
    const nn = n ?? g;
    const uvOf = (q: V3) => (printed ? planarUv(q, nn) : null);
    for (const q of [a, b, c, a, c, d]) this.vertex(q, nn, uvOf(q), shade(q, nn));
  }
  tri(a: V3, b: V3, c: V3, shade: Shade, printed: boolean, n?: V3, hint?: V3): void {
    let g = norm(cross(sub(b, a), sub(c, a)));
    const want = n ?? hint;
    if (want && g[0] * want[0] + g[1] * want[1] + g[2] * want[2] < 0) { const t = b; b = c; c = t; g = scl(g, -1); }
    const nn = n ?? g;
    for (const q of [a, b, c]) this.vertex(q, nn, printed ? planarUv(q, nn) : null, shade(q, nn));
  }
  /** A smooth triangle (its own vertex normals), wound to agree with them. */
  triN(a: V3, na: V3, b: V3, nb: V3, c: V3, nc: V3, col: (p: V3, n: V3) => Rgb, uv: ((p: V3, n: V3) => readonly [number, number]) | null = null): void {
    const g = cross(sub(b, a), sub(c, a)), avg = add(add(na, nb), nc);
    if (g[0] * avg[0] + g[1] * avg[1] + g[2] * avg[2] < 0) { const t = b; b = c; c = t; const tn = nb; nb = nc; nc = tn; }
    this.vertex(a, na, uv ? uv(a, na) : null, col(a, na));
    this.vertex(b, nb, uv ? uv(b, nb) : null, col(b, nb));
    this.vertex(c, nc, uv ? uv(c, nc) : null, col(c, nc));
  }
  /** Append another geometry (its colours albedo, its uvs replaced by the plain texel unless kept). */
  absorb(g: THREE.BufferGeometry, keepUv = false): void {
    const s = g.index ? g.toNonIndexed() : g;
    if (!s.getAttribute('normal')) s.computeVertexNormals();
    const P = s.getAttribute('position'), N = s.getAttribute('normal'), C = s.getAttribute('color'), T = s.getAttribute('uv');
    for (let i = 0; i < P.count; i++) {
      this.p.push(P.getX(i), P.getY(i), P.getZ(i));
      this.n.push(N.getX(i), N.getY(i), N.getZ(i));
      if (keepUv && T) this.t.push(T.getX(i), T.getY(i)); else this.t.push(FLAT_UV[0], FLAT_UV[1]);
      const r = C ? C.getX(i) : 0.5, gg = C ? C.getY(i) : 0.5, b = C ? C.getZ(i) : 0.5;
      this.c.push(r * this.colourScale, gg * this.colourScale, b * this.colourScale);
    }
    if (s !== g) s.dispose();
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/** The print's planar projection: a wall's u along its face and v up it; a top face by plan. */
function planarUv(q: V3, n: V3): [number, number] {
  if (Math.abs(n[1]) > 0.7) return [q[0] * UV_PER_M, q[2] * UV_PER_M];
  // along the face: the horizontal tangent (n x up), so the boards stay level on every wall
  const tx = -n[2], tz = n[0], tl = Math.hypot(tx, tz) || 1;
  return [(q[0] * tx + q[2] * tz) / tl * UV_PER_M + 0.37, q[1] * UV_PER_M];
}

// ---------------------------------------------------------------------------------------------------------------
// faces with openings, gridded so the weather has vertices to sit on

interface Opening { s0: number; s1: number; t0: number; t1: number }

/**
 * A wall face: origin `o` (its left foot seen from outside), `u` along it (unit, horizontal), up the world's +y, `w`
 * wide and from height t=y0 to `top(s)`; the openings are cut out (their cells skipped; the reveals are built apart).
 * Cells of about `cell` metres.
 */
function wallFace(m: Mesh, o: V3, u: V3, w: number, y0: number, top: (s: number) => number, openings: Opening[], shade: Shade, cell = 0.22): void {
  const n = norm(cross(u, [0, 1, 0]));
  const ss = new Set<number>([0, w]);
  for (let i = 1; i < Math.ceil(w / cell); i++) ss.add((i * w) / Math.ceil(w / cell));
  for (const op of openings) { ss.add(Math.max(0, op.s0)); ss.add(Math.min(w, op.s1)); }
  const sList = [...ss].sort((a, b) => a - b);
  const tMax = Math.max(...sList.map(top));
  const ts = new Set<number>([y0]);
  const rows = Math.max(1, Math.ceil((tMax - y0) / cell));
  for (let i = 1; i <= rows; i++) ts.add(y0 + ((tMax - y0) * i) / rows);
  for (const op of openings) { ts.add(op.t0); ts.add(op.t1); }
  const tList = [...ts].sort((a, b) => a - b);
  const at = (s: number, t: number): V3 => [o[0] + u[0] * s, t, o[2] + u[2] * s];
  for (let i = 0; i + 1 < sList.length; i++) {
    const s0 = sList[i], s1 = sList[i + 1];
    if (s1 - s0 < 1e-4) continue;
    const top0 = top(s0), top1 = top(s1);
    for (let j = 0; j + 1 < tList.length; j++) {
      const t0 = tList[j], t1 = tList[j + 1];
      if (t0 >= Math.max(top0, top1) - 1e-4) break;
      const sm = (s0 + s1) / 2, tm = (t0 + t1) / 2;
      if (openings.some((op) => sm > op.s0 && sm < op.s1 && tm > op.t0 && tm < op.t1)) continue;
      // the top row follows the ragged top (a broken wall), never above it
      const a0 = Math.min(t1, top0), a1 = Math.min(t1, top1);
      if (a0 <= t0 + 1e-4 && a1 <= t0 + 1e-4) continue;
      m.quad(at(s0, t0), at(s1, t0), at(s1, Math.max(t0, a1)), at(s0, Math.max(t0, a0)), shade, true, n);
    }
  }
}

/**
 * A stepped embrasure through a wall face: the outer opening, `steps` steps each narrowing and going deeper, the throat
 * closed by a plate (`plate` colour) with a dark slit. The face's frame: centre `c` on the face, `u` along, `n` out.
 */
function embrasure(m: Mesh, c: V3, u: V3, w: number, h: number, steps: number, stepW: number, stepH: number, stepD: number,
  throatD: number, shadeReveal: Shade, plate: Rgb | null, slitW: number, slitH: number): void {
  const n = norm(cross(u, [0, 1, 0]));
  const up: V3 = [0, 1, 0];
  const pt = (du: number, dv: number, depth: number): V3 => add(add(add(c, scl(u, du)), scl(up, dv)), scl(n, -depth));
  let hw = w / 2, hh = h / 2, d = 0;
  for (let k = 0; k <= steps; k++) {
    const d1 = k === steps ? throatD : d + stepD;
    // the reveals of this step: sill (facing up), soffit (down), left and right cheeks (facing in)
    const sill: [V3, V3, V3, V3] = [pt(-hw, -hh, d), pt(hw, -hh, d), pt(hw, -hh, d1), pt(-hw, -hh, d1)];
    m.quad(sill[0], sill[1], sill[2], sill[3], shadeReveal, true, [0, 1, 0]);
    m.quad(pt(hw, hh, d), pt(-hw, hh, d), pt(-hw, hh, d1), pt(hw, hh, d1), shadeReveal, true, [0, -1, 0]);
    m.quad(pt(-hw, hh, d), pt(-hw, -hh, d), pt(-hw, -hh, d1), pt(-hw, hh, d1), shadeReveal, true, u);
    m.quad(pt(hw, -hh, d), pt(hw, hh, d), pt(hw, hh, d1), pt(hw, -hh, d1), shadeReveal, true, scl(u, -1));
    if (k === steps) break;
    // the step's face: a frame from this outline in to the next, facing out
    const nw = hw - stepW, nh = hh - stepH;
    m.quad(pt(-hw, -hh, d1), pt(hw, -hh, d1), pt(nw, -nh, d1), pt(-nw, -nh, d1), shadeReveal, true, n);
    m.quad(pt(hw, -hh, d1), pt(hw, hh, d1), pt(nw, nh, d1), pt(nw, -nh, d1), shadeReveal, true, n);
    m.quad(pt(hw, hh, d1), pt(-hw, hh, d1), pt(-nw, nh, d1), pt(nw, nh, d1), shadeReveal, true, n);
    m.quad(pt(-hw, hh, d1), pt(-hw, -hh, d1), pt(-nw, -nh, d1), pt(-nw, nh, d1), shadeReveal, true, n);
    hw = nw; hh = nh; d = d1;
  }
  // the throat: a plate (or the dark of the room) with the slit
  const back = throatD;
  const plateShade: Shade = () => plate ?? [0.012, 0.011, 0.01];
  const slitShade: Shade = () => [0.004, 0.004, 0.004];
  if (plate) {
    m.quad(pt(-hw, -hh, back), pt(hw, -hh, back), pt(hw, hh, back), pt(-hw, hh, back), plateShade, false, n);
    const sw = Math.min(slitW, hw * 1.6) / 2, sh = Math.min(slitH, hh * 1.6) / 2;
    m.quad(pt(-sw, -sh, back - 0.006), pt(sw, -sh, back - 0.006), pt(sw, sh, back - 0.006), pt(-sw, sh, back - 0.006), slitShade, false, n);
    // the plate's bolted rim, a hair proud
    const rim = 0.035;
    for (const [a0, a1, b0, b1] of [[-hw, hw, -hh, -hh + rim], [-hw, hw, hh - rim, hh], [-hw, -hw + rim, -hh, hh], [hw - rim, hw, -hh, hh]]) {
      m.quad(pt(a0, b0, back - 0.012), pt(a1, b0, back - 0.012), pt(a1, b1, back - 0.012), pt(a0, b1, back - 0.012), () => mul(plate, 0.8), false, n);
    }
  } else {
    m.quad(pt(-hw, -hh, back), pt(hw, -hh, back), pt(hw, hh, back), pt(-hw, hh, back), slitShade, false, n);
  }
}

/** A solid box (axis-aligned in a yawed frame), every face printed or plain. */
function solid(m: Mesh, cx: number, y0: number, cz: number, w: number, h: number, d: number, yaw: number, shade: Shade, printed: boolean): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (x: number, y: number, z: number): V3 => [cx + x * c + z * s, y0 + y, cz - x * s + z * c];
  const X = w / 2, Z = d / 2;
  const v = [P(-X, 0, -Z), P(X, 0, -Z), P(X, 0, Z), P(-X, 0, Z), P(-X, h, -Z), P(X, h, -Z), P(X, h, Z), P(-X, h, Z)];
  const ctr = P(0, h / 2, 0);
  const face = (a: V3, b: V3, c: V3, d: V3) => {
    const fc = scl(add(add(a, b), add(c, d)), 0.25);
    m.quad(a, b, c, d, shade, printed, norm(sub(fc, ctr)));
  };
  face(v[3], v[2], v[6], v[7]); face(v[1], v[0], v[4], v[5]); face(v[2], v[1], v[5], v[6]);
  face(v[0], v[3], v[7], v[4]); face(v[7], v[6], v[5], v[4]); face(v[0], v[1], v[2], v[3]);
}

/** A rough convex lump (a box with its corners pulled about): rubble, a stone, a clod. */
function lump(m: Mesh, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rng: Rng, shade: Shade, printed: boolean, yaw = rng() * Math.PI, tilt = 0.4): void {
  const ry = yaw, rx = (rng() - 0.5) * tilt, rz = (rng() - 0.5) * tilt;
  const corner = (x: number, y: number, z: number): V3 => {
    let px = x * sx * (0.75 + rng() * 0.5) / 2, py = y * sy * (0.7 + rng() * 0.6) / 2, pz = z * sz * (0.75 + rng() * 0.5) / 2;
    // roll about x, then z, then yaw
    let t = py * Math.cos(rx) - pz * Math.sin(rx); pz = py * Math.sin(rx) + pz * Math.cos(rx); py = t;
    t = px * Math.cos(rz) - py * Math.sin(rz); py = px * Math.sin(rz) + py * Math.cos(rz); px = t;
    return [cx + px * Math.cos(ry) + pz * Math.sin(ry), cy + py, cz - px * Math.sin(ry) + pz * Math.cos(ry)];
  };
  const v = [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1), corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1)];
  // quads split into triangles each with its own facet normal (a pulled box is not planar)
  const ctr: V3 = [cx, cy, cz];
  const out = (a: V3, b: V3, c: V3): V3 => sub(scl(add(add(a, b), c), 1 / 3), ctr);
  const q = (a: V3, b: V3, c: V3, d: V3) => { m.tri(a, b, c, shade, printed, undefined, out(a, b, c)); m.tri(a, c, d, shade, printed, undefined, out(a, c, d)); };
  q(v[3], v[2], v[6], v[7]); q(v[1], v[0], v[4], v[5]); q(v[2], v[1], v[5], v[6]); q(v[0], v[3], v[7], v[4]); q(v[7], v[6], v[5], v[4]); q(v[0], v[1], v[2], v[3]);
}

/** A bar of rebar: a thin square rod from a to b (rust). */
function bar(m: Mesh, a: V3, b: V3, shade: Shade, r = 0.014): void {
  const d = norm(sub(b, a));
  const side = norm(Math.abs(d[1]) > 0.9 ? cross(d, [1, 0, 0]) : cross(d, [0, 1, 0]));
  const up = cross(side, d);
  const o = [add(scl(side, r), scl(up, r)), add(scl(side, -r), scl(up, r)), add(scl(side, -r), scl(up, -r)), add(scl(side, r), scl(up, -r))];
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    m.quad(add(a, o[k]), add(a, o[k1]), add(b, o[k1]), add(b, o[k]), shade, false, undefined, add(o[k], o[k1]));
  }
}

/** A log along +x from x0 to x1 at (y, z), radius r, `seg` sides: its bark by `shade`, end grain paler. */
function log(m: Mesh, a: V3, b: V3, r: number, seg: number, shade: Shade, endShade: Shade): void {
  const d = norm(sub(b, a));
  const side = norm(Math.abs(d[1]) > 0.9 ? cross(d, [1, 0, 0]) : cross(d, [0, 1, 0]));
  const up = cross(side, d);
  const ring = (c: V3, k: number): V3 => {
    const ph = (k / seg) * Math.PI * 2, wob = 1 + 0.06 * Math.sin(ph * 3 + c[0] * 2.1 + c[2] * 1.3);
    return add(c, add(scl(side, Math.cos(ph) * r * wob), scl(up, Math.sin(ph) * r * wob)));
  };
  for (let k = 0; k < seg; k++) {
    const p0 = ring(a, k), p1 = ring(a, k + 1), p2 = ring(b, k + 1), p3 = ring(b, k);
    const n0 = norm(sub(p0, a)), n1 = norm(sub(p1, a));
    m.triN(p0, n0, p3, n0, p2, n1, shade);
    m.triN(p0, n0, p2, n1, p1, n1, shade);
    m.tri(a, ring(a, k + 1), ring(a, k), endShade, false, scl(d, -1));
    m.tri(b, ring(b, k), ring(b, k + 1), endShade, false, d);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// the plan: a convex outline, its offset rings (the berm, the slab's overhang)

type Plan = Array<[number, number]>;

/** A rectangle w x d centred, its four vertical arrises chamfered by `c`, counter-clockwise from above (x right, z toward the viewer). */
function chamferedRect(w: number, d: number, c: number): Plan {
  const X = w / 2, Z = d / 2;
  return [[X - c, Z], [X, Z - c], [X, -Z + c], [X - c, -Z], [-X + c, -Z], [-X, -Z + c], [-X, Z - c], [-X + c, Z]]
    .reverse() as Plan;
}
/** A regular polygon of `k` sides, radius r (to its corners), a flat face toward +z. */
function polygon(k: number, r: number): Plan {
  const out: Plan = [];
  for (let i = 0; i < k; i++) {
    const a = Math.PI / 2 + Math.PI / k + (i * 2 * Math.PI) / k;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out.reverse();
}
/** The Soviet DOT's plan: a rectangle whose front (+z) is three faces of an octagon. */
function roundFront(w: number, d: number): Plan {
  const X = w / 2, Z = d / 2, f = w * 0.29;
  return [[-X, -Z], [X, -Z], [X, Z - f], [X - f, Z], [-X + f, Z], [-X, Z - f]].map(([x, z]) => [x, z] as [number, number]).reverse();
}

/** Signed area > 0 for counter-clockwise seen from +y looking down with x right, z down the page... normalised here. */
function ensureOutward(plan: Plan): Plan {
  // the edges' outward normal must point away from the centroid; flip the winding if not
  const [a, b] = [plan[0], plan[1]];
  const cx = plan.reduce((s, p) => s + p[0], 0) / plan.length, cz = plan.reduce((s, p) => s + p[1], 0) / plan.length;
  const ex = b[0] - a[0], ez = b[1] - a[1];
  const nx = -ez, nz = ex; // a wall's outward normal is cross(u, +y) = (-u.z, 0, u.x) (wallFace)
  const mx = (a[0] + b[0]) / 2 - cx, mz = (a[1] + b[1]) / 2 - cz;
  return nx * mx + nz * mz >= 0 ? plan : [...plan].reverse();
}

interface PerimeterSample { x: number; z: number; nx: number; nz: number; /** arc length from the start */ s: number; edge: number }

/** Samples round a convex plan every `step` m, with a fan of normals round each corner (an offset ring is rounded). */
function perimeter(plan: Plan, step: number, fan = 3): PerimeterSample[] {
  const out: PerimeterSample[] = [];
  const k = plan.length;
  const normalOf = (i: number): [number, number] => {
    const a = plan[i], b = plan[(i + 1) % k], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez);
    return [-ez / l, ex / l];
  };
  let s = 0;
  for (let i = 0; i < k; i++) {
    const a = plan[i], b = plan[(i + 1) % k], [nx, nz] = normalOf(i), [px, pz] = normalOf((i - 1 + k) % k);
    // the corner's fan, from the previous edge's normal to this one's
    const pa = Math.atan2(pz, px);
    let na = Math.atan2(nz, nx);
    while (na - pa > Math.PI) na -= Math.PI * 2;
    while (na - pa < -Math.PI) na += Math.PI * 2;
    for (let f = 1; f <= fan; f++) {
      const t = f / (fan + 1), ang = pa + (na - pa) * t;
      out.push({ x: a[0], z: a[1], nx: Math.cos(ang), nz: Math.sin(ang), s, edge: i });
    }
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / step));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      out.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, nx, nz, s: s + len * t, edge: i });
    }
    s += len;
  }
  return out;
}

/** A plan grown outward by `d` (each edge moved out along its normal; convex plans only). */
function grow(plan: Plan, d: number): Plan {
  const k = plan.length;
  const lines = plan.map((a, i) => {
    const b = plan[(i + 1) % k], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez);
    const nx = -ez / l, nz = ex / l;
    return { px: a[0] + nx * d, pz: a[1] + nz * d, dx: ex / l, dz: ez / l };
  });
  return lines.map((L, i) => {
    const P = lines[(i - 1 + k) % k];
    const den = P.dx * L.dz - P.dz * L.dx;
    if (Math.abs(den) < 1e-9) return [L.px, L.pz] as [number, number];
    const t = ((L.px - P.px) * L.dz - (L.pz - P.pz) * L.dx) / den;
    return [P.px + P.dx * t, P.pz + P.dz * t] as [number, number];
  });
}

/** A prism of a plan from y0 to y1: its walls (no openings), top and bottom optional. */
function prism(m: Mesh, plan: Plan, y0: number, y1: number, shadeWall: Shade, shadeTop: Shade | null, shadeBottom: Shade | null, printed = true, cell = 0.3): void {
  const k = plan.length;
  for (let i = 0; i < k; i++) {
    const a = plan[i], b = plan[(i + 1) % k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u: V3 = [(b[0] - a[0]) / len, 0, (b[1] - a[1]) / len];
    if (printed) wallFace(m, [a[0], 0, a[1]], u, len, y0, () => y1, [], shadeWall, cell);
    else m.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], shadeWall, false);
  }
  if (shadeTop) cap(m, plan, y1, shadeTop, true, printed);
  if (shadeBottom) cap(m, plan, y0, shadeBottom, false, printed);
}

/** A plan's horizontal face at y in concentric rings (vertices for the weather), facing up or down. */
function cap(m: Mesh, plan: Plan, y: number, shade: Shade, up: boolean, printed: boolean, rings = 4): void {
  const cx = plan.reduce((s, p) => s + p[0], 0) / plan.length, cz = plan.reduce((s, p) => s + p[1], 0) / plan.length;
  const k = plan.length;
  const at = (i: number, r: number): V3 => [cx + (plan[i % k][0] - cx) * r, y, cz + (plan[i % k][1] - cz) * r];
  const n: V3 = up ? [0, 1, 0] : [0, -1, 0];
  for (let j = 0; j < rings; j++) {
    const r0 = j / rings, r1 = (j + 1) / rings;
    for (let i = 0; i < k; i++) {
      const a = at(i, r0), b = at(i + 1, r0), c = at(i + 1, r1), d = at(i, r1);
      // the plans run so that walls face out; seen from above that is clockwise: up faces take (a d c b)
      if (up) m.quad(a, d, c, b, shade, printed, n); else m.quad(a, b, c, d, shade, printed, n);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// the weather on the concrete

interface Weather {
  tones: FortTones;
  /** world-up height of the slab's underside (the drip line the runs start from) */
  drip: number;
  /** the embrasures' centres and half sizes (soot fans over them, runs under their sills): face normal xz */
  slits: Array<{ x: number; y: number; z: number; hw: number; hh: number; nx: number; nz: number }>;
  /** grade (local y) */
  grade: number;
  seed: number;
  /** the soot and scorch of a destroyed state (0 none) */
  burn: number;
}

/** The concrete's colour at a point of a face: tone, mottle, damp foot, runs, soot, moss and lichen. */
function concreteShade(W: Weather): Shade {
  const T = W.tones;
  const moss: Rgb = T.arid ? [0.11, 0.095, 0.07] : [0.055, 0.075, 0.03];
  const lichen: Rgb = [0.34, 0.33, 0.24];
  return (p, n) => {
    const seed = W.seed;
    let c: Rgb = mul(T.concrete, 0.88);
    // broad pour mottle and the lifts' tone, both faint (the print carries the boards)
    const mot = fbm(p[0], p[1] * 1.6, p[2], 1.3, seed);
    c = mul(c, 0.9 + mot * 0.2);
    const vertical = Math.abs(n[1]) < 0.5;
    if (T.camo === 'pattern' && n[1] < 0.7) {
      // sprayed blotches, soft-edged, olive and red-brown over the grey, worn back toward it on the weather faces
      const b1 = smooth(0.42, 0.5, fbm(p[0], p[1] * 0.8, p[2], 1.1, seed + 201));
      const b2 = smooth(0.48, 0.56, fbm(p[0] + 7.1, p[1] * 0.8, p[2] - 3.3, 0.9, seed + 203));
      const wear = clamp01(0.95 - T.age * 0.35 + (vnoise(p[0] * 3, p[1] * 3, p[2] * 3, 0.25, seed + 205) - 0.5) * 0.3);
      c = mix(c, [0.105, 0.105, 0.055], b1 * wear);
      c = mix(c, [0.12, 0.075, 0.045], b2 * (1 - b1) * wear);
    } else if (T.camo === 'whitewash' && n[1] < 0.7) {
      // a lime wash brushed on in the field, patchy, thin over the board lines, run down by the thaw
      const wash = smooth(0.3, 0.46, fbm(p[0], p[1] * 0.6, p[2], 0.8, seed + 207)) * (0.95 - T.age * 0.3);
      c = mix(c, [0.7, 0.71, 0.7], clamp01(wash));
    }
    if (vertical) {
      // the damp foot: darker and greener where the splash and the berm's wet reach
      const foot = 1 - smooth(W.grade + 0.05, W.grade + 0.75 + mot * 0.3, p[1]);
      c = mix(c, mul(mix(c, moss, 0.35), 0.62), foot * (0.55 + T.age * 0.35));
      // rain runs from the drip line: dark streaks in columns, fading down the wall
      const col = vnoise(p[0] * 3.1 + p[2] * 3.1, 0, 0, 0.55, seed + 3);
      const col2 = vnoise(p[0] * 7.3 - p[2] * 7.3, 0, 0, 0.5, seed + 4);
      const run = smooth(0.52, 0.86, col * 0.7 + col2 * 0.3) * smooth(W.drip - 1.7, W.drip - 0.05, p[1]);
      c = mul(c, 1 - run * (0.24 + T.age * 0.3));
      // the band under the overhang: sheltered, a shade cleaner and darker grey; the drip's dark tide line just under it
      const under = smooth(W.drip - 0.4, W.drip - 0.02, p[1]);
      c = mul(c, 1 - under * 0.12);
      const tide = smooth(W.drip - 0.55, W.drip - 0.3, p[1]) * (1 - smooth(W.drip - 0.3, W.drip - 0.1, p[1]));
      c = mul(c, 1 - tide * (0.1 + T.age * 0.12) * (0.6 + vnoise(p[0] * 2, 0, p[2] * 2, 0.4, seed + 5) * 0.8));
    } else if (n[1] > 0.5) {
      // tops: lichen rosettes and grime in the low spots
      const l = smooth(0.62, 0.8, fbm(p[0], 0, p[2], 0.35, seed + 9)) * (0.25 + T.age * 0.75) * (T.arid ? 0.35 : 1);
      c = mix(c, lichen, l * 0.55);
      c = mul(c, 0.86 + fbm(p[0], 0, p[2], 0.8, seed + 11) * 0.18);
    }
    // moss patches in the shade side and low, on an old work
    if (!T.arid && vertical) {
      const shadeSide = clamp01(0.5 - n[0] * 0.35 - n[2] * 0.45);
      const m = smooth(0.55, 0.76, fbm(p[0], p[1], p[2], 0.5, seed + 17)) * shadeSide * (0.3 + T.age * 1.0)
        * (1 - smooth(W.grade + 0.6, W.drip, p[1]) * 0.7);
      c = mix(c, moss, clamp01(m) * 0.75);
    }
    // the embrasures: soot fanned over the opening, a run of grime from each sill corner
    for (const sl of W.slits) {
      const facing = n[0] * sl.nx + n[2] * sl.nz;
      if (facing < 0.6) continue;
      const tx = -sl.nz, tz = sl.nx;
      const du = (p[0] - sl.x) * tx + (p[2] - sl.z) * tz, dv = p[1] - sl.y;
      // soot: above the opening, spreading as it rises
      if (dv > -sl.hh * 0.5) {
        const spread = sl.hw + 0.12 + Math.max(0, dv) * 0.7;
        const s = smooth(spread, spread * 0.45, Math.abs(du)) * smooth(sl.hh + 0.85, sl.hh * 0.6, dv);
        c = mul(c, 1 - s * (0.45 + W.burn * 0.3));
      }
      // runs under the sill
      if (dv < -sl.hh) {
        const r = Math.max(smooth(0.09, 0.0, Math.abs(du - sl.hw + 0.05)), smooth(0.09, 0.0, Math.abs(du + sl.hw - 0.05)));
        c = mul(c, 1 - r * smooth(-sl.hh - 0.9, -sl.hh, dv) * (0.28 + T.age * 0.15));
      }
    }
    if (W.burn > 0) {
      const sc = smooth(0.45, 0.75, fbm(p[0], p[1], p[2], 0.6, seed + 23)) * W.burn;
      c = mul(c, 1 - sc * 0.55);
    }
    return c;
  };
}

/** The reveals of an embrasure: the concrete in the dark of its depth (a cheap occlusion by distance from the face). */
function revealShade(W: Weather, base: Shade): Shade {
  return (p, n) => {
    const c = base(p, n);
    let k = 1;
    for (const sl of W.slits) {
      const depth = -((p[0] - sl.x) * sl.nx + (p[2] - sl.z) * sl.nz);
      if (depth > -0.02 && Math.hypot(p[0] - sl.x - sl.nx * -depth, p[2] - sl.z - sl.nz * -depth) < sl.hw + 0.4) {
        k = Math.min(k, 1 - smooth(0, 0.8, depth) * 0.72);
      }
    }
    return mul(c, k * 0.8);
  };
}

// ---------------------------------------------------------------------------------------------------------------
// the berm

interface BermSpec {
  plan: Plan;
  /** the berm's height at the wall for a perimeter sample (0: no berm there) */
  height: (s: PerimeterSample) => number;
  /** the run from the wall to the toe per metre of height (cot of the bank) */
  run: number;
  grade: number;
  seed: number;
  tones: FortTones;
  /** a broken work: the bank slumped (none higher than `cap`) and cratered */
  slump: number;
  cap: number;
  /** the contact proxy (pillboxContactProxy): the bank ends where it falls below this height, straight down there */
  clip?: number;
}

/** The ring parameters out from the wall (share of the run) and the bank's height there (share of its height). */
const BERM_T = [0, 0.14, 0.32, 0.52, 0.72, 0.88, 1.0, 1.1];
const bermProfile = (t: number): number => (t >= 1 ? 0 : Math.pow(Math.cos(t * Math.PI / 2), 1.25));

/** The berm's rings round the plan (its samples, the rows out from the wall to the skirt, the smoothed heights). */
function bermGrid(B: BermSpec): { samples: PerimeterSample[]; grid: V3[][]; hs: number[] } {
  const samples = perimeter(B.plan, 0.32);
  const K = samples.length, R = BERM_T.length + 1;
  const grid: V3[][] = [];
  const heights = samples.map((s) => B.height(s));
  // smooth the heights round the perimeter (no steps where a taper starts)
  const hs = heights.map((_, i) => {
    let acc = 0, wsum = 0;
    for (let j = -3; j <= 3; j++) { const w = 1 - Math.abs(j) / 4; acc += heights[(i + j + K) % K] * w; wsum += w; }
    return acc / wsum;
  });
  for (let i = 0; i < K; i++) {
    const s = samples[i], h0 = hs[i];
    const row: V3[] = [];
    const jitter = (vnoise(s.x * 2.3, 0, s.z * 2.3, 0.9, B.seed) - 0.5);
    for (let r = 0; r < R; r++) {
      let x: number, y: number, z: number;
      if (r < BERM_T.length) {
        const t = BERM_T[r];
        const run = Math.max(0.35, h0 * B.run + 0.35);
        const d = t * run + (t > 0 ? jitter * 0.22 * t : -0.03);
        let hh = h0 * bermProfile(t);
        if (t > 0 && t < 1) hh += (vnoise(s.x * 3.7, t * 4, s.z * 3.7, 0.7, B.seed + 5) - 0.5) * 0.09 * Math.min(1, h0 * 2);
        if (B.slump > 0 && t < 0.86) {
          // slumped: the crest down to the cap, a crater bite in the front; the toe (where the ground's fillet meets it,
          // props.ts) stays as it lay
          const crater = smooth(1.4, 0.2, Math.hypot(s.x - 1.2, s.z - 2.6)) * B.slump * (1 - t);
          const toe = h0 * bermProfile(0.86);
          hh = Math.max(toe, Math.min(hh * (1 - 0.45 * B.slump) * (1 - crater * 0.6), B.cap * (1 - 0.15 * t)));
        }
        x = s.x + s.nx * d; z = s.z + s.nz * d;
        y = B.grade + (t >= 1.05 ? -0.06 : hh);
      } else {
        // the skirt: straight down below grade so no slope shows daylight under it
        const run = Math.max(0.35, h0 * B.run + 0.35);
        const d = BERM_T[BERM_T.length - 1] * run + jitter * 0.22;
        x = s.x + s.nx * d; z = s.z + s.nz * d; y = B.grade - 0.75;
      }
      row.push([x, y, z]);
    }
    grid.push(row);
  }
  if (B.clip !== undefined) {
    // the movement footprint's bank: a hull drives up a toe lower than this, so the footprint ends at the contour
    const yc = B.grade + B.clip;
    for (const row of grid) {
      let k = 0;
      while (k + 1 < BERM_T.length && row[k + 1][1] >= yc) k++;
      const a = row[k], b = row[Math.min(k + 1, BERM_T.length - 1)];
      const f = a[1] <= yc || b[1] >= a[1] ? 0 : clamp01((a[1] - yc) / (a[1] - b[1]));
      const cut: V3 = a[1] <= yc ? [row[0][0], yc, row[0][2]] : [a[0] + (b[0] - a[0]) * f, yc, a[2] + (b[2] - a[2]) * f];
      for (let r = k + 1; r < BERM_T.length; r++) row[r] = [cut[0], cut[1], cut[2]];
      row[BERM_T.length] = [cut[0], B.grade - 0.75, cut[2]];
    }
  }
  return { samples, grid, hs };
}

/** The earth banked against the walls: rings out from the wall, its toe sunk below grade (a skirt), turf and earth. */
function berm(m: Mesh, B: BermSpec): void {
  const { samples, grid, hs } = bermGrid(B);
  const K = samples.length, R = BERM_T.length + 1;
  // smooth normals over the grid
  const nrm: V3[][] = grid.map((row, i) => row.map((_, r) => {
    const a = grid[(i + 1) % K][r], b = grid[(i - 1 + K) % K][r];
    const c = grid[i][Math.min(R - 1, r + 1)], d = grid[i][Math.max(0, r - 1)];
    // along the perimeter x outward-down
    let nn = norm(cross(sub(a, b), sub(c, d)));
    if (nn[1] < 0) nn = scl(nn, -1);
    return nn;
  }));
  const T = B.tones;
  const shade = (p: V3, n: V3, r: number, h0: number): Rgb => {
    const crestT = r / (BERM_T.length - 1);
    const pat = fbm(p[0], 0, p[2], 0.9, B.seed + 31);
    const fine = vnoise(p[0], 0, p[2], 0.22, B.seed + 37);
    // the turf: thick on the crest and the gentle toe, broken on the steep middle where the earth shows
    const steep = clamp01((1 - n[1]) * 2.6);
    let turfShare = clamp01(1.05 - steep * 0.9 + (pat - 0.5) * 0.9);
    if (T.arid) turfShare *= 0.15;
    let c = mix(mix(T.earth, mul(T.earth, 0.8), fine), mix(T.turf, T.crest, smooth(0.45, 0.8, pat)), turfShare);
    // damp, darker earth tight against the wall, and the wall's own splash of concrete grit
    if (r === 0) c = mul(c, 0.72);
    // the toe fades to the ground's crest tone (the ground round it)
    c = mix(c, T.crest, smooth(0.6, 1, crestT) * 0.5);
    if (B.slump > 0) c = mix(c, mul(T.earth, 0.55), smooth(0.4, 0.8, fbm(p[0], 1, p[2], 0.7, B.seed + 41)) * 0.6 * B.slump);
    return mul(c, 0.92 + fine * 0.16 + h0 * 0);
  };
  for (let i = 0; i < K; i++) {
    const i1 = (i + 1) % K;
    if (hs[i] < 0.02 && hs[i1] < 0.02) continue;
    for (let r = 0; r + 1 < R; r++) {
      const a = grid[i][r], b = grid[i1][r], c = grid[i1][r + 1], d = grid[i][r + 1];
      const na = nrm[i][r], nb = nrm[i1][r], nc = nrm[i1][r + 1], nd = nrm[i][r + 1];
      // outward rings: from the wall (r) to the toe (r+1); seen from above, (a d c) and (a c b) face up
      const ringOf = new Map<V3, number>([[a, r], [b, r], [c, r + 1], [d, r + 1]]);
      const col = (p: V3, n: V3) => shade(p, n, ringOf.get(p) ?? r, hs[i]);
      m.triN(a, na, d, nd, c, nc, col);
      m.triN(a, na, c, nc, b, nb, col);
    }
    // the inner face: the earth cut against the wall, from the crest down below grade (hidden in the concrete while
    // the work stands; the bank's face over the razed walls once it is destroyed)
    const a = grid[i][0], b = grid[i1][0];
    const a0: V3 = [a[0], B.grade - 0.75, a[2]], b0: V3 = [b[0], B.grade - 0.75, b[2]];
    const inward: V3 = norm([-samples[i].nx, 0, -samples[i].nz]);
    const cut: Shade = (p) => mul(T.earth, 0.62 + vnoise(p[0] * 3, p[1] * 5, p[2] * 3, 0.3, B.seed + 43) * 0.25);
    m.quad(a, b, b0, a0, cut, false, inward);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// the forms

export interface PillboxForm {
  plan: Plan;
  wallTop: number;
  slab: number;
  overhang: number;
  /** the berm's height at the wall by side (front +z, flank, rear) */
  bermFront: number;
  bermFlank: number;
  bermRear: number;
  /** the berm's run per metre of height */
  bermRun: number;
}

const GRADE = 0.08; // the placed base sits 0.08 m below grade (props.ts addDestructible('bunker', y - 0.08))
/** The room's floor, below grade: a destroyed work's slab falls into it. */
const PIT = -0.55;
/** Nothing of a destroyed work stands higher than this over its base (a broken prop has no collider; dcore). */
const BROKEN_CAP = 0.58;
const FOOT = -0.62; // the walls go on below grade so no slope shows their foot

/** Which of a plan's edges is the front (+z), the rear (-z) and the flanks, by its outward normal. */
function edgeRole(_nx: number, nz: number): 'front' | 'rear' | 'flank' {
  if (nz > 0.38) return 'front';
  if (nz < -0.7) return 'rear';
  return 'flank';
}

interface BuildOpts { tones: FortTones; seed: number; broken: boolean }

interface ConcreteSlit { edge: number; s: number; y: number; w: number; h: number; steps: number; plate: boolean }
interface ConcreteLayout {
  plan: Plan; wallTop: number; slab: number; overhang: number;
  slits: Weather['slits']; slitList: ConcreteSlit[]; doorEdge: number; doorS: number; doorLen: number;
}

/** A concrete form's plan, heights, embrasures and door (no draws: the builders and the footing read the same). */
function concreteLayout(style: 'regelbau' | 'dot' | 'hex'): ConcreteLayout {
  const plan = ensureOutward(style === 'hex' ? polygon(6, 2.62) : style === 'dot' ? roundFront(5.1, 4.3) : chamferedRect(5.0, 4.4, 0.42));
  const wallTop = style === 'dot' ? 1.72 : style === 'hex' ? 1.78 : 1.84;
  const slab = style === 'dot' ? 0.72 : style === 'hex' ? 0.5 : 0.6;
  const overhang = style === 'hex' ? 0.24 : style === 'dot' ? 0.12 : 0.22;
  const k = plan.length;
  // the embrasures: per edge, by role
  const slits: Weather['slits'] = [];
  const slitList: ConcreteSlit[] = [];
  let doorEdge = -1, doorS = 0, doorLen = 0;
  for (let i = 0; i < k; i++) {
    const a = plan[i], b = plan[(i + 1) % k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
    const role = edgeRole(nx, nz);
    if (style === 'hex') {
      if (role === 'rear') { doorEdge = i; doorS = len / 2; doorLen = len; continue; }
      slitList.push({ edge: i, s: len / 2, y: 1.12, w: 0.62, h: 0.34, steps: 2, plate: false });
    } else if (style === 'dot') {
      if (role === 'front' && Math.abs(nx) < 0.2) slitList.push({ edge: i, s: len / 2, y: 0.98, w: 1.35, h: 0.5, steps: 3, plate: false });
      else if (role === 'front') slitList.push({ edge: i, s: len / 2, y: 1.05, w: 0.6, h: 0.3, steps: 2, plate: false });
      else if (role === 'rear') { doorEdge = i; doorS = len * 0.68; doorLen = len; }
    } else {
      if (role === 'front' && len > 2) slitList.push({ edge: i, s: len / 2, y: 0.98, w: 1.5, h: 0.62, steps: 3, plate: true });
      else if (role === 'flank' && len > 2) slitList.push({ edge: i, s: len * (nx > 0 ? 0.62 : 0.38), y: 1.18, w: 0.66, h: 0.34, steps: 2, plate: true });
      else if (role === 'rear' && len > 2) { doorEdge = i; doorS = len * 0.66; doorLen = len; }
    }
  }
  for (const sl of slitList) {
    const a = plan[sl.edge], b = plan[(sl.edge + 1) % k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    slits.push({ x: a[0] + ux * sl.s, y: sl.y, z: a[1] + uz * sl.s, hw: sl.w / 2, hh: sl.h / 2, nx: -uz, nz: ux });
  }
  return { plan, wallTop, slab, overhang, slits, slitList, doorEdge, doorS, doorLen };
}

/**
 * The Regelbau casemate (and the hexagonal and DOT forms through `form`): the body with its embrasures, the slab, the
 * entrance, the berm and the roof's turf. `broken`: the destroyed state of the same work.
 */
function buildConcretePillbox(style: 'regelbau' | 'dot' | 'hex', O: BuildOpts): THREE.BufferGeometry {
  const m = new Mesh();
  const rng = mulberry32(O.seed);
  const T = O.tones;
  const L = concreteLayout(style);
  const { plan, wallTop, slab, overhang, slits, slitList, doorEdge, doorS, doorLen } = L;
  const k = plan.length;
  const W: Weather = { tones: T, drip: wallTop, slits, grade: GRADE, seed: (O.seed * 31) ^ 0x51ab, burn: O.broken ? 1 : 0 };
  const conc = concreteShade(W);
  const reveal = revealShade(W, conc);
  const plateTone: Rgb = mix([0.05, 0.052, 0.055], [0.09, 0.05, 0.03], T.age * 0.6);
  const doorW = 0.88, doorH = 1.66;

  // ---- the body
  // a broken work: the front blown in to a ragged stub, the flanks broken down toward it, the rear standing
  const ragged = (edge: number, len: number) => {
    if (!O.broken) return () => wallTop;
    const a = plan[edge], b = plan[(edge + 1) % k];
    const nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
    const role = edgeRole(nx, nz);
    return (s: number) => {
      const x = a[0] + (b[0] - a[0]) * (s / len), z = a[1] + (b[1] - a[1]) * (s / len);
      const jag = (vnoise(x * 5.1, 0, z * 5.1, 0.35, O.seed + 61) - 0.5) * 0.5 + (hash3(Math.round(x * 9), 0, Math.round(z * 9), O.seed) - 0.5) * 0.18;
      // the blast's bowl: lowest in front of the main embrasure, rising toward the rear corners
      const front = clamp01((z + 2.2) / 4.4);
      let top: number;
      // razed: a broken prop has no collider, so no stub stands higher than a hull crosses (dcore's rule, ~0.5 m)
      if (role === 'front') top = 0.2 + Math.abs(x) * 0.05;
      else if (role === 'flank') top = 0.48 - front * 0.22;
      else top = 0.5;
      return Math.max(GRADE + 0.08, Math.min(BROKEN_CAP, top + jag * 0.45));
    };
  };
  for (let i = 0; i < k; i++) {
    const a = plan[i], b = plan[(i + 1) % k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u: V3 = [(b[0] - a[0]) / len, 0, (b[1] - a[1]) / len];
    const ops: Opening[] = [];
    for (const sl of slitList) if (sl.edge === i) ops.push({ s0: sl.s - sl.w / 2, s1: sl.s + sl.w / 2, t0: sl.y - sl.h / 2, t1: sl.y + sl.h / 2 });
    if (i === doorEdge) ops.push({ s0: doorS - doorW / 2, s1: doorS + doorW / 2, t0: GRADE, t1: GRADE + doorH });
    const top = ragged(i, len);
    wallFace(m, [a[0], 0, a[1]], u, len, FOOT, top, O.broken ? ops.filter((op) => op.t1 < top(op.s0) - 0.05 && op.t1 < top(op.s1) - 0.05) : ops, conc);
    if (O.broken) {
      // the break's top: the wall's thickness across the ragged line, and the bars bent out of it
      const thick = 0.85;
      const n: V3 = [-u[2], 0, u[0]];
      const steps = Math.max(2, Math.round(len / 0.22));
      for (let j = 0; j < steps; j++) {
        const s0 = (j / steps) * len, s1 = ((j + 1) / steps) * len, t0 = top(s0), t1 = top(s1);
        if (t0 >= wallTop - 0.01 && t1 >= wallTop - 0.01) continue;
        const p0: V3 = [a[0] + u[0] * s0, t0, a[1] + u[2] * s0], p1: V3 = [a[0] + u[0] * s1, t1, a[1] + u[2] * s1];
        const q0 = add(p0, scl(n, -thick)), q1 = add(p1, scl(n, -thick));
        const freshCore: Shade = (p) => mix(T.concrete, [0.36, 0.34, 0.3], 0.5 + vnoise(p[0], p[1], p[2], 0.15, O.seed + 71) * 0.3);
        m.quad(p0, p1, add(q1, [0, -0.04, 0]), add(q0, [0, -0.04, 0]), freshCore, false, [0, 1, 0]);
        // the inner face below the break (the room's wall, sooted)
        const inner: Shade = (p) => mul(T.concrete, 0.28 + vnoise(p[0], p[1], p[2], 0.4, O.seed + 73) * 0.12);
        m.quad(q1, q0, [q0[0], PIT, q0[2]], [q1[0], PIT, q1[2]], inner, false, scl(n, -1));
        // the bars: the outer and inner mats' verticals, bent out and over where the blast tore the concrete off them
        if (hash3(j, i, 3, O.seed) < 0.26) {
          const rust: Shade = () => mix([0.12, 0.05, 0.025], [0.05, 0.035, 0.03], hash3(j, i, 5, O.seed));
          const off = hash3(j, i, 4, O.seed) < 0.5 ? 0.09 : thick - 0.09, out = off < thick / 2 ? 1 : -0.6;
          const base = add(p0, scl(n, -off));
          const len1 = Math.min(0.14 + hash3(j, i, 7, O.seed) * 0.3, BROKEN_CAP + 0.24 - t0);
          const bend = add(base, [n[0] * len1 * 0.45 * out + u[0] * (hash3(j, 9, i, O.seed) - 0.5) * 0.25, len1, n[2] * len1 * 0.45 * out + u[2] * (hash3(j, 9, i, O.seed) - 0.5) * 0.25]);
          const tip = add(bend, [n[0] * 0.22 * out, -0.05 - hash3(j, i, 11, O.seed) * 0.25, n[2] * 0.22 * out]);
          bar(m, base, bend, rust); bar(m, bend, tip, rust);
        }
      }
    }
  }
  // the embrasures (a broken work keeps only those under its ragged line)
  for (const sl of slitList) {
    const a = plan[sl.edge], b = plan[(sl.edge + 1) % k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u: V3 = [(b[0] - a[0]) / len, 0, (b[1] - a[1]) / len];
    if (O.broken) {
      const top = ragged(sl.edge, len);
      if (!(sl.y + sl.h / 2 < top(sl.s - sl.w / 2) - 0.05 && sl.y + sl.h / 2 < top(sl.s + sl.w / 2) - 0.05)) continue;
    }
    const c: V3 = [a[0] + u[0] * sl.s, sl.y, a[1] + u[2] * sl.s];
    const thick = style === 'dot' ? 1.05 : 0.9;
    embrasure(m, c, u, sl.w, sl.h, sl.steps, sl.w * 0.11, sl.h * 0.1, 0.16, thick, reveal, sl.plate ? plateTone : null, sl.w * 0.32, 0.1);
    // the DOT's main embrasure under its cast visor (the hood over the opening, against splinters and the rain)
    if (style === 'dot' && sl.w > 1 && !O.broken) {
      const n: V3 = [-u[2], 0, u[0]];
      const vy = sl.y + sl.h / 2 + 0.03, depth = 0.3, vw = sl.w + 0.36;
      solid(m, c[0] + n[0] * depth / 2, vy, c[2] + n[2] * depth / 2, vw, 0.14, depth, Math.atan2(n[0], n[2]), conc, true);
    }
  }
  // the door: its reveal and the steel leaf set in it
  if (doorEdge >= 0) {
    const a = plan[doorEdge], b = plan[(doorEdge + 1) % k], len = doorLen || Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u: V3 = [(b[0] - a[0]) / len, 0, (b[1] - a[1]) / len];
    const n: V3 = [-u[2], 0, u[0]];
    const c: V3 = [a[0] + u[0] * doorS, GRADE, a[1] + u[2] * doorS];
    const P = (du: number, y: number, dep: number): V3 => [c[0] + u[0] * du - n[0] * dep, y, c[2] + u[2] * du - n[2] * dep];
    const hw = doorW / 2, D = 0.32;
    if (!O.broken) {
    m.quad(P(-hw, GRADE + doorH, 0), P(-hw, GRADE, 0), P(-hw, GRADE, D), P(-hw, GRADE + doorH, D), reveal, true, u);
    m.quad(P(hw, GRADE, 0), P(hw, GRADE + doorH, 0), P(hw, GRADE + doorH, D), P(hw, GRADE, D), reveal, true, scl(u, -1));
    m.quad(P(hw, GRADE + doorH, 0), P(-hw, GRADE + doorH, 0), P(-hw, GRADE + doorH, D), P(hw, GRADE + doorH, D), reveal, true, [0, -1, 0]);
    m.quad(P(-hw, GRADE + 0.005, 0), P(hw, GRADE + 0.005, 0), P(hw, GRADE + 0.005, D), P(-hw, GRADE + 0.005, D), reveal, true, [0, 1, 0]);
    const leaf: Shade = (p) => mix(plateTone, [0.1, 0.045, 0.02], smooth(0.55, 0.8, vnoise(p[0], p[1], p[2], 0.3, O.seed + 81)) * (0.3 + T.age));
    {
      m.quad(P(-hw, GRADE, D), P(hw, GRADE, D), P(hw, GRADE + doorH, D), P(-hw, GRADE + doorH, D), leaf, false, n);
      // the leaf's frame and hinges, a little proud
      for (const y of [GRADE + 0.3, GRADE + doorH - 0.3]) solid(m, c[0] + u[0] * (-hw + 0.05) - n[0] * (D - 0.03), y, c[2] + u[2] * (-hw + 0.05) - n[2] * (D - 0.03), 0.06, 0.12, 0.05, Math.atan2(u[0], u[2]) - Math.PI / 2, leaf, false);
    }
    }
    // the blast wall: an L before the door, the way in from the left (as seen leaving)
    const bwDist = 1.25, bwLen = 2.5, bwT = 0.36, bwH = style === 'hex' ? 1.62 : 1.72;
    const yaw = Math.atan2(n[0], n[2]);
    const bcx = c[0] + n[0] * (bwDist + bwT / 2) + u[0] * 0.35, bcz = c[2] + n[2] * (bwDist + bwT / 2) + u[2] * 0.35;
    const bwTop = O.broken ? 0.42 : bwH;
    blastWall(m, [bcx, 0, bcz], u, n, bwLen, bwT, FOOT, bwTop, conc, O);
    // its return to the body, on the right
    const rx = c[0] + u[0] * (0.35 + bwLen / 2 - bwT / 2) + n[0] * (bwDist / 2), rz = c[2] + u[2] * (0.35 + bwLen / 2 - bwT / 2) + n[2] * (bwDist / 2);
    blastWall(m, [rx, 0, rz], n, scl(u, -1), bwDist + 0.02, bwT, FOOT, bwTop, conc, O);
    void yaw;
    // sandbags at the mouth (and a course on the blast wall's top)
    const bagShade = T.bag;
    const mouthX = c[0] + u[0] * (0.35 - bwLen / 2 - 0.45) + n[0] * (bwDist + 0.3), mouthZ = c[2] + u[2] * (0.35 - bwLen / 2 - 0.45) + n[2] * (bwDist + 0.3);
    const brng = mulberry32(O.seed + 91);
    const bagCourses = O.broken ? 0 : 3;
    for (let course = 0; course < bagCourses; course++) {
      for (let j = 0; j < 3 - course; j++) {
        const along = (j - (2 - course) / 2) * 0.58;
        placeBag(m, brng, mouthX + n[0] * along, GRADE + 0.1 + course * 0.19, mouthZ + n[2] * along, Math.atan2(n[0], n[2]), bagShade, course);
      }
    }
    if (!O.broken) {
      for (let j = 0; j < 4; j++) {
        const along = (j - 1.5) * 0.6;
        placeBag(m, brng, bcx + u[0] * along, bwTop + 0.1, bcz + u[2] * along, Math.atan2(u[0], u[2]), bagShade, 2);
      }
    } else {
      for (let j = 0; j < 7; j++) placeBag(m, brng, mouthX + (brng() - 0.5) * 2.4, GRADE + 0.06, mouthZ + (brng() - 0.5) * 2.4, brng() * Math.PI, bagShade, 0);
    }
  }

  // ---- the roof slab: its underside under the overhang, the edge with its drip groove, the chamfer, the top
  const sPlan = grow(plan, overhang), chamf = 0.07;
  const sTop = wallTop + slab;
  const slabShade = conc;
  if (!O.broken) {
    cap(m, sPlan, wallTop, slabShade, false, true, 2);
    // drip groove: a 4 cm step up 6 cm in from the edge
    const dPlan = grow(plan, overhang - 0.06);
    prism(m, dPlan, wallTop - 0.0, wallTop + 0.04, slabShade, null, null, true, 0.5);
    prism(m, sPlan, wallTop + 0.04, sTop - chamf, slabShade, null, null, true, 0.3);
    const cPlan = grow(plan, overhang - chamf);
    // the chamfer: from the edge's top in to the top face
    for (let i = 0; i < sPlan.length; i++) {
      const a = sPlan[i], b = sPlan[(i + 1) % sPlan.length], c2 = cPlan[(i + 1) % cPlan.length], d = cPlan[i];
      const el = Math.hypot(b[0] - a[0], b[1] - a[1]);
      m.quad([a[0], sTop - chamf, a[1]], [b[0], sTop - chamf, b[1]], [c2[0], sTop, c2[1]], [d[0], sTop, d[1]], slabShade, true,
        undefined, [-(b[1] - a[1]) / el, 1, (b[0] - a[0]) / el]);
    }
    cap(m, cPlan, sTop, slabShade, true, true, 5);
    // the turf and earth over the roof, inset from the edge, a ragged rim
    roofCover(m, plan, sTop, style === 'dot' ? 0.5 : style === 'hex' ? 0.12 : 0.24, style === 'dot' ? 0.1 : 0.38, T, O.seed + 101);
    // vent pipe and its cap, the periscope stub
    const vent: Shade = () => mix([0.06, 0.06, 0.062], [0.11, 0.05, 0.025], 0.4 + T.age * 0.5);
    const vx = plan[0][0] * 0.0 - 1.35, vz = -1.05;
    if (style !== 'dot') {
      log(m, [vx, sTop - 0.05, vz], [vx, sTop + 0.48, vz], 0.075, 8, vent, vent);
      solid(m, vx, sTop + 0.48, vz, 0.26, 0.05, 0.26, 0.3, vent, false);
    }
  } else {
    // the slab broken in two: the rear plate hinged on the rear wall, sagging toward the front; the front plate fallen
    // into the shell and down the breach
    collapsedSlab(m, sPlan, slab, slabShade, O, rng);
  }

  // (the bank is not the destructible's: props.ts lays it as a static earthwork, pillboxBerm, so it outlives the
  // concrete and keeps its collision)

  // ---- the destroyed state's rubble, at a real volume, in the concrete's own colours (none higher than a hull crosses)
  if (O.broken) rubble(m, plan, O, rng);

  return m.geometry();
}

/** A concrete form's berm: to the sill in front (cut down under each embrasure), higher on the flanks, open behind. */
function concreteBermSpec(style: 'regelbau' | 'dot' | 'hex', L: ConcreteLayout, T: FortTones, seed: number, broken: boolean): BermSpec {
  const { plan, slits } = L;
  const hFront = style === 'dot' ? 1.15 : style === 'hex' ? 0.78 : 0.98;
  const hFlank = style === 'dot' ? 1.3 : style === 'hex' ? 0.88 : 1.16;
  const notch = slits.filter((sl) => edgeRole(sl.nx, sl.nz) !== 'rear');
  return {
    plan, run: style === 'dot' ? 1.3 : 1.42, grade: GRADE, seed: seed + 111, tones: T,
    slump: broken ? 1 : 0, cap: 0.48,
    height: (s) => {
      const role = edgeRole(s.nx, s.nz);
      let h = role === 'front' ? hFront : role === 'flank' ? hFlank : 0;
      if (role === 'flank' && s.nz < -0.1) h = hFlank * (0.5 + 0.5 * smooth(-2.4, -0.8, s.z));
      if (role === 'rear') {
        // the rear stays open at the entrance; the bank wraps the corner on the far side only
        h = (s.x < 0 ? hFlank * smooth(-0.9, -2.3, s.x) : 0);
      }
      // the field of fire: the bank cut down below each embrasure's sill
      for (const sl of notch) {
        const facing = s.nx * sl.nx + s.nz * sl.nz;
        if (facing < 0.7) continue;
        const du = Math.abs((s.x - sl.x) * -sl.nz + (s.z - sl.z) * sl.nx);
        h = Math.min(h, (sl.y - sl.hh - 0.18 - GRADE) + smooth(sl.hw + 0.05, sl.hw + 0.7, du) * 2);
      }
      return Math.max(0, h);
    },
  };
}

/** A blast wall: a slab on its foot `len` long along `u`, its face toward `n`. */
function blastWall(m: Mesh, c: V3, u: V3, n: V3, len: number, t: number, y0: number, y1: number, shade: Shade, O: BuildOpts): void {
  const a: V3 = [c[0] - u[0] * len / 2 + n[0] * t / 2, 0, c[2] - u[2] * len / 2 + n[2] * t / 2];
  const b: V3 = [c[0] + u[0] * len / 2 - n[0] * t / 2, 0, c[2] + u[2] * len / 2 - n[2] * t / 2];
  // outer face (toward n), inner face, ends, top with a chamfer
  wallFace(m, a, u, len, y0, () => y1, [], shade, 0.25);
  wallFace(m, b, scl(u, -1), len, y0, () => y1, [], shade, 0.25);
  const e0: V3 = [a[0] - n[0] * t, 0, a[2] - n[2] * t];
  wallFace(m, e0, n, t, y0, () => y1, [], shade, 0.25);
  const e1: V3 = [b[0] + n[0] * t, 0, b[2] + n[2] * t];
  wallFace(m, e1, scl(n, -1), t, y0, () => y1, [], shade, 0.25);
  const p = (du: number, dn: number): V3 => [c[0] + u[0] * du + n[0] * dn, y1, c[2] + u[2] * du + n[2] * dn];
  m.quad(p(-len / 2, -t / 2), p(-len / 2, t / 2), p(len / 2, t / 2), p(len / 2, -t / 2), shade, true, [0, 1, 0]);
  void O;
}

function placeBag(m: Mesh, rng: Rng, x: number, y: number, z: number, yaw: number, tone: Rgb, course: number): void {
  const g = sandbagBag(0.56, 0.19, 0.34, rng, { fill: 0.92, dirt: course === 0 ? 0.6 : 0.25 });
  g.rotateY(yaw + Math.PI / 2 + (rng() - 0.5) * 0.14);
  g.translate(x, y, z);
  // the bag's own tones toward this map's hessian
  const C = g.getAttribute('color');
  if (C) for (let i = 0; i < C.count; i++) {
    const l = (C.getX(i) + C.getY(i) + C.getZ(i)) / 3 / 0.2;
    C.setXYZ(i, tone[0] * l, tone[1] * l, tone[2] * l);
  }
  m.absorb(g);
  g.dispose();
}

/**
 * The roof's cover: a skin of earth under turf, flat on top and rounded off at a ragged rim inset from the slab's edge,
 * lumpy, its normals smooth (no facets), and tufts of grass standing in it.
 */
function roofCover(m: Mesh, plan: Plan, y: number, thick: number, inset: number, T: FortTones, seed: number): void {
  if (thick <= 0.02) return;
  const inner = grow(plan, -inset + (inset === 0 ? 0.18 : 0));
  const samples = perimeter(inner, 0.22, 3);
  const cx = plan.reduce((s, p) => s + p[0], 0) / plan.length, cz = plan.reduce((s, p) => s + p[1], 0) / plan.length;
  const RINGS = 8;
  // the cover's height over the slab at a share t of the way to its rim: a plateau rounded off at the edge, lumpy
  const heightAt = (x: number, z: number, t: number): number => {
    if (t >= 1) return -0.01;
    const shoulder = Math.pow(Math.cos(Math.min(1, Math.max(0, (t - 0.55) / 0.45)) * Math.PI / 2), 0.7);
    const lumps = (fbm(x, 0, z, 0.55, seed + 3) - 0.5) * 0.5 + (vnoise(x, 0, z, 0.18, seed + 4) - 0.5) * 0.18;
    return Math.max(0.01, thick * shoulder * (1 + lumps));
  };
  const pt = (s: PerimeterSample, r: number): V3 => {
    const t = r / RINGS;
    const rag = (vnoise(s.x * 3, 0, s.z * 3, 0.6, seed) - 0.5) * 0.4;
    const x = cx + (s.x + s.nx * rag - cx) * t, z = cz + (s.z + s.nz * rag - cz) * t;
    return [x, y + heightAt(x, z, t), z];
  };
  const K = samples.length;
  const grid = samples.map((s) => Array.from({ length: RINGS + 1 }, (_, r) => pt(s, r)));
  const nrm = grid.map((row, i) => row.map((p, r) => {
    if (r === 0) return [0, 1, 0] as V3;
    const a = grid[(i + 1) % K][r], b = grid[(i - 1 + K) % K][r], c = grid[i][Math.min(RINGS, r + 1)], d = grid[i][r - 1];
    let n = norm(cross(sub(c, d), sub(a, b)));
    if (n[1] < 0) n = scl(n, -1);
    void p;
    return n;
  }));
  const shade = (p: V3, n: V3): Rgb => {
    const pat = fbm(p[0], 0, p[2], 0.6, seed + 5), fine = vnoise(p[0], 0, p[2], 0.15, seed + 7);
    let c = mix(mix(T.turf, T.crest, smooth(0.35, 0.7, pat)), mul(T.earth, 0.9), smooth(0.62, 0.85, fbm(p[0], 3, p[2], 0.4, seed + 9)) * 0.7);
    const steep = clamp01((1 - n[1]) * 3);
    c = mix(c, T.earth, steep * (T.arid ? 0.8 : 0.45));
    if (T.arid) c = mix(c, T.earth, 0.6);
    return mul(c, 0.86 + fine * 0.28);
  };
  for (let i = 0; i < K; i++) {
    const i1 = (i + 1) % K;
    for (let r = 0; r < RINGS; r++) {
      const a = grid[i][r], b = grid[i1][r], c = grid[i1][r + 1], d = grid[i][r + 1];
      if (r === 0) m.triN(a, nrm[i][r], d, nrm[i][r + 1], c, nrm[i1][r + 1], shade);
      else { m.triN(a, nrm[i][r], d, nrm[i][r + 1], c, nrm[i1][r + 1], shade); m.triN(a, nrm[i][r], c, nrm[i1][r + 1], b, nrm[i1][r], shade); }
    }
  }
  // tufts of grass in it (dry on an arid map: thin, few)
  const tufts = T.arid ? 18 : 70;
  for (let k = 0; k < tufts; k++) {
    const si = Math.floor(hash3(k, 1, 2, seed) * K), t = Math.sqrt(hash3(k, 3, 4, seed)) * 0.82;
    const s0 = samples[si];
    const x = cx + (s0.x - cx) * t, z = cz + (s0.z - cz) * t, base = y + heightAt(x, z, t) - 0.02;
    tuft(m, x, base, z, 0.16 + hash3(k, 5, 6, seed) * 0.22, mix(T.crest, T.turf, hash3(k, 7, 8, seed) * 0.6), seed + k * 13);
  }
}

/** A tuft of grass: four or five blades, each a thin two-sided triangle leaning out, darker at its foot. */
function tuft(m: Mesh, x: number, y: number, z: number, h: number, tone: Rgb, seed: number): void {
  const blades = 4 + Math.floor(hash3(seed, 1, 0, 9) * 2);
  for (let b = 0; b < blades; b++) {
    const a = hash3(seed, b, 1, 7) * Math.PI * 2, lean = 0.25 + hash3(seed, b, 2, 7) * 0.35, w = 0.025 + hash3(seed, b, 3, 7) * 0.02;
    const hh = h * (0.7 + hash3(seed, b, 4, 7) * 0.5);
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz * w, pz = dx * w;
    const p0: V3 = [x + px, y, z + pz], p1: V3 = [x - px, y, z - pz], tip: V3 = [x + dx * hh * lean, y + hh, z + dz * hh * lean];
    const n = norm(cross(sub(p1, p0), sub(tip, p0)));
    const col = (p: V3): Rgb => mul(tone, 0.55 + 0.6 * clamp01((p[1] - y) / hh));
    m.vertex(p0, n, null, col(p0)); m.vertex(p1, n, null, col(p1)); m.vertex(tip, n, null, col(tip));
    const nb = scl(n, -1);
    m.vertex(p1, nb, null, col(p1)); m.vertex(p0, nb, null, col(p0)); m.vertex(tip, nb, null, col(tip));
  }
}

/**
 * The slab fallen into the room: cracked into four plates along two ragged lines, each sagging from the wall stub it
 * still rests on down into the pit, the front ones pushed out over the blown face; the bars across the cracks. The
 * plates' tops stay under BROKEN_CAP.
 */
function collapsedSlab(m: Mesh, sPlan: Plan, slab: number, shade: Shade, O: BuildOpts, rng: Rng): void {
  const T = O.tones;
  const xs = sPlan.map((p) => p[0]), zs = sPlan.map((p) => p[1]);
  const X0 = Math.min(...xs) + 0.1, X1 = Math.max(...xs) - 0.1, Z0 = Math.min(...zs) + 0.1, Z1 = Math.max(...zs) - 0.1;
  const cxk = (X0 + X1) / 2 + (rng() - 0.5) * 0.6, czk = (Z0 + Z1) / 2 + (rng() - 0.5) * 0.5;
  const jag = (v: number, salt: number) => (vnoise(v * 4.3, salt, 0, 0.35, O.seed + 131) - 0.5) * 0.4;
  const core: Shade = (p) => mix(T.concrete, [0.33, 0.31, 0.28], 0.45 + vnoise(p[0], p[1], p[2], 0.15, O.seed + 137) * 0.3);
  const rust: Shade = () => [0.1, 0.045, 0.022];
  const N = 6;
  /** One plate's outline (slab-local x, z), counter-clockwise: the outer corner, along the two outer edges, back along the cracks. */
  const quadrant = (sx: number, sz: number): Array<[number, number]> => {
    const xa = sx < 0 ? X0 : X1, za = sz < 0 ? Z0 : Z1;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= N; i++) { const x = xa + (cxk - xa) * (i / N); pts.push([x, za]); }
    for (let i = 1; i <= N; i++) { const z = za + (czk - za) * (i / N); pts.push([cxk + jag(z, 1), z]); }
    for (let i = 1; i < N; i++) { const x = cxk + (xa - cxk) * (i / N); pts.push([x, czk + jag(x, 2)]); }
    for (let i = 0; i < N; i++) { const z = czk + (za - czk) * (i / N); pts.push([xa, z]); }
    return pts;
  };
  const plates: Array<(p: V3) => V3> = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const pts = quadrant(sx, sz);
    const pcx = pts.reduce((a, p) => a + p[0], 0) / pts.length, pcz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    // the plate sags toward the room's middle: its outer edge on the stub, its inner one down in the pit; the front pair
    // thrown further, out over the blown face
    const front = sz > 0;
    const tiltX = (front ? 0.2 : 0.15) * -sz + (rng() - 0.5) * 0.08, tiltZ = 0.17 * sx + (rng() - 0.5) * 0.08;
    const shiftZ = front ? 0.7 : 0.15, drop = front ? 0.0 : 0.04;
    const rot = (p: V3): V3 => {
      // about the plate's centre: tilt about x (front-back) then z (side), then sit it low
      const x = p[0] - pcx, y = p[1] - slab / 2, z = p[2] - pcz;
      const y1 = y * Math.cos(tiltX) - z * Math.sin(tiltX), z1 = y * Math.sin(tiltX) + z * Math.cos(tiltX);
      const x2 = x * Math.cos(tiltZ) - y1 * Math.sin(tiltZ), y2 = x * Math.sin(tiltZ) + y1 * Math.cos(tiltZ);
      return [pcx + x2, y2, pcz + z1 + shiftZ - drop];
    };
    // the plate's top lands at BROKEN_CAP at its highest
    let top = -Infinity;
    for (const [x, z] of pts) top = Math.max(top, rot([x, slab, z])[1]);
    const lift = BROKEN_CAP - 0.04 - top;
    const P = (x: number, y: number, z: number): V3 => { const q = rot([x, y, z]); return [q[0], q[1] + lift, q[2]]; };
    plates.push((p) => P(p[0], p[1], p[2]));
    const up = P(pcx, slab, pcz), dn = P(pcx, 0, pcz);
    const nUp = norm(sub(up, dn));
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      m.tri(P(pcx, slab, pcz), P(a[0], slab, a[1]), P(b[0], slab, b[1]), shade, true, undefined, nUp);
      m.tri(P(pcx, 0, pcz), P(b[0], 0, b[1]), P(a[0], 0, a[1]), (p, n) => mul(shade(p, n), 0.4), true, undefined, scl(nUp, -1));
      // the edge: a cast face on the slab's own edges, a fresh broken one along the cracks
      const crack = !(Math.abs(a[0] - b[0]) < 1e-6 && (Math.abs(a[0] - X0) < 1e-6 || Math.abs(a[0] - X1) < 1e-6))
        && !(Math.abs(a[1] - b[1]) < 1e-6 && (Math.abs(a[1] - Z0) < 1e-6 || Math.abs(a[1] - Z1) < 1e-6));
      const mid = P((a[0] + b[0]) / 2, slab / 2, (a[1] + b[1]) / 2);
      m.quad(P(a[0], 0, a[1]), P(b[0], 0, b[1]), P(b[0], slab, b[1]), P(a[0], slab, a[1]), crack ? core : shade, !crack, undefined, sub(mid, P(pcx, slab / 2, pcz)));
      // bars out of the broken edges
      if (crack && hash3(i, Math.round(sx * 3 + sz), 17, O.seed) < 0.45) {
        const base = P((a[0] + b[0]) / 2, slab * (hash3(i, 1, 19, O.seed) < 0.5 ? 0.2 : 0.8), (a[1] + b[1]) / 2);
        const out = norm(sub(mid, P(pcx, slab / 2, pcz)));
        const l = 0.15 + hash3(i, 2, 23, O.seed) * 0.3;
        const tip: V3 = [base[0] + out[0] * l, Math.min(BROKEN_CAP + 0.18, base[1] + out[1] * l + 0.05), base[2] + out[2] * l];
        bar(m, base, tip, rust);
      }
    }
  }
  // bars spanning the cracks between neighbouring plates, sagging
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    const x = X0 + (X1 - X0) * t, z = czk + jag(x, 2);
    const pa = plates[x < cxk ? 0 : 1]([x, slab * 0.25, z - 0.05]), pb = plates[x < cxk ? 2 : 3]([x, slab * 0.25, z + 0.05]);
    const mid: V3 = [(pa[0] + pb[0]) / 2, Math.min(pa[1], pb[1]) - 0.12, (pa[2] + pb[2]) / 2];
    bar(m, pa, mid, rust); bar(m, mid, pb, rust);
  }
}

/** The rubble of a blown front: a low heap in the concrete's colours, chunks on it and round it, all under 0.5 m. */
function rubble(m: Mesh, plan: Plan, O: BuildOpts, rng: Rng): void {
  const T = O.tones;
  const zs = plan.map((p) => p[1]);
  const front = Math.max(...zs);
  const dust: Rgb = mix(T.concrete, T.earth, 0.35);
  const heapShade: Shade = (p) => mul(mix(dust, T.concrete, vnoise(p[0], 0, p[2], 0.3, O.seed + 151)), 0.75 + vnoise(p[0], 0, p[2], 0.12, O.seed + 157) * 0.35);
  // the heap: a low dome over the breach, spilling out of the front
  const cx = 0, cz = front - 0.2, rx = 2.7, rz = 1.9, H = 0.4;
  const SEG = 20, RING = 5;
  const pt = (k: number, r: number): V3 => {
    const ph = (k / SEG) * Math.PI * 2, t = r / RING;
    const wob = 1 + (vnoise(Math.cos(ph) * 3, 0, Math.sin(ph) * 3, 0.8, O.seed + 161) - 0.5) * 0.4;
    const x = cx + Math.cos(ph) * rx * t * wob, z = cz + Math.sin(ph) * rz * t * wob;
    const h = H * Math.pow(1 - t * t, 1.4) + (t < 1 ? (vnoise(x * 3, 0, z * 3, 0.4, O.seed + 163) - 0.5) * 0.12 : -0.08);
    return [x, GRADE + h, z];
  };
  for (let k = 0; k < SEG; k++) for (let r = 0; r < RING; r++) {
    const a = pt(k, r), b = pt(k + 1, r), c = pt(k + 1, r + 1), d = pt(k, r + 1);
    if (r === 0) m.tri(a, c, d, heapShade, false, undefined, [0, 1, 0]);
    else { m.tri(a, c, d, heapShade, false, undefined, [0, 1, 0]); m.tri(a, b, c, heapShade, false, undefined, [0, 1, 0]); }
  }
  // chunks: slabs of the wall with their boards (printed), blocks, a few with bars
  const chunkShade: Shade = (p, n) => mul(mix(mul(T.concrete, 0.66), mix(dust, [0.16, 0.15, 0.13], 0.5), vnoise(p[0], p[1], p[2], 0.25, O.seed + 171) * 0.75),
    (n[1] > 0.5 ? 0.95 : 0.78) * (0.85 + hash3(Math.round(p[0] * 3), Math.round(p[2] * 3), 1, O.seed) * 0.25));
  const rust: Shade = () => [0.1, 0.045, 0.022];
  for (let i = 0; i < 26; i++) {
    const ang = rng() * Math.PI * 2, rr = Math.sqrt(rng());
    const x = cx + Math.cos(ang) * rx * 1.15 * rr, z = cz + 0.3 + Math.sin(ang) * rz * 1.2 * rr;
    const s = 0.16 + rng() * rng() * 0.62;
    const heapY = GRADE + Math.max(0, H * (1 - rr * rr)) * 0.75;
    const h = Math.min(0.42, s * (0.45 + rng() * 0.4), Math.max(0.1, (BROKEN_CAP - heapY) / 0.9));
    lump(m, x, heapY + h * 0.25, z, s * (1 + rng() * 0.8), h, s * (0.8 + rng() * 0.6), rng, chunkShade, true, rng() * Math.PI, 0.7);
    if (s > 0.45 && rng() < 0.6) bar(m, [x, heapY + h * 0.5, z], [x + (rng() - 0.5) * 0.7, Math.min(BROKEN_CAP + 0.2, heapY + h * 0.5 + rng() * 0.35), z + (rng() - 0.5) * 0.7], rust);
  }
  // inside the shell: the floor heaped with the fallen ceiling's fragments
  for (let i = 0; i < 14; i++) {
    const x = (rng() - 0.5) * 3.6, z = (rng() - 0.5) * 3.0 - 0.2, s = 0.2 + rng() * 0.4;
    lump(m, x, GRADE + 0.08, z, s, Math.min(0.35, s * 0.6), s, rng, chunkShade, true);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// the log-and-earth bunker (DZOT, the Japanese bunker, the maneuvers' dugout)

const LOG_W = 4.6, LOG_D = 3.8, LOG_SLIT_Y = 0.86, LOG_SLIT_HW = 0.85, LOG_SLIT_HH = 0.15;
function logEarthBermSpec(T: FortTones, seed: number, broken: boolean): BermSpec {
  return {
    plan: ensureOutward(chamferedRect(LOG_W + 0.4, LOG_D + 0.4, 0.3)), run: 1.4, grade: GRADE, seed: seed + 11, tones: T,
    slump: broken ? 1 : 0, cap: 0.48,
    height: (s) => {
      const role = edgeRole(s.nx, s.nz);
      if (role === 'rear') return Math.abs(s.x) > 1.1 ? 0.95 * smooth(1.1, 1.9, Math.abs(s.x)) : 0;
      if (role === 'front') return Math.abs(s.x) < LOG_SLIT_HW + 0.4 ? LOG_SLIT_Y - LOG_SLIT_HH - 0.1 : 1.1;
      return 1.15;
    },
  };
}

function buildLogEarthPillbox(O: BuildOpts): THREE.BufferGeometry {
  const m = new Mesh();
  const rng = mulberry32(O.seed);
  const T = O.tones;
  const W = LOG_W, D = LOG_D, X = W / 2, Z = D / 2;
  const bark: Shade = (p) => mul(T.timber, 0.75 + vnoise(p[0] * 1.3, p[1] * 6, p[2] * 1.3, 0.25, O.seed + 3) * 0.45);
  const endGrain: Shade = (p) => mul(mix(T.timber, [0.2, 0.15, 0.09], 0.4), 0.8 + vnoise(p[0] * 7, p[1] * 7, p[2] * 7, 0.3, O.seed + 5) * 0.35);
  const r = 0.13;
  const wallTop = 1.32;
  const slitY = LOG_SLIT_Y, slitHW = LOG_SLIT_HW, slitHH = LOG_SLIT_HH;
  // walls of horizontal logs: front (+z) with the slit, the flanks, the rear with the doorway gap
  const courses = Math.floor((wallTop - FOOT * 0.3) / (2 * r * 0.92));
  for (let cI = 0; cI < courses; cI++) {
    const y = FOOT * 0.3 + r + cI * 2 * r * 0.92;
    if (O.broken && y > 0.36 + (cI % 2) * 0.08) continue;
    const j = (rng() - 0.5) * 0.12;
    // front: two logs either side of the slit where the slit's course runs
    if (Math.abs(y - slitY) < slitHH + r * 0.5) {
      log(m, [-X - 0.18 + j, y, Z], [-slitHW, y, Z], r, 7, bark, endGrain);
      log(m, [slitHW, y, Z], [X + 0.18 + j, y, Z], r, 7, bark, endGrain);
    } else log(m, [-X - 0.2 + j, y, Z], [X + 0.2 + j, y, Z], r, 7, bark, endGrain);
    log(m, [X, y + r * 0.92, Z + 0.2 + j], [X, y + r * 0.92, -Z - 0.2], r, 7, bark, endGrain);
    log(m, [-X, y + r * 0.92, -Z - 0.2 + j], [-X, y + r * 0.92, Z + 0.2], r, 7, bark, endGrain);
    if (y > GRADE + 1.55 || y < GRADE) log(m, [-X - 0.2, y, -Z], [X + 0.2, y, -Z], r, 7, bark, endGrain);
    else { log(m, [-X - 0.2, y, -Z], [-0.5, y, -Z], r, 7, bark, endGrain); log(m, [0.5, y, -Z], [X + 0.2, y, -Z], r, 7, bark, endGrain); }
  }
  // the slit's dark and its log lintel
  m.quad([-slitHW, slitY - slitHH, Z - 0.25], [slitHW, slitY - slitHH, Z - 0.25], [slitHW, slitY + slitHH, Z - 0.25], [-slitHW, slitY + slitHH, Z - 0.25], () => [0.005, 0.005, 0.005], false, [0, 0, 1]);
  // the dark of the room through the rear doorway, its frame posts and lintel, two bags at the threshold
  if (!O.broken) {
    m.quad([0.5, GRADE - 0.05, -Z + 0.35], [-0.5, GRADE - 0.05, -Z + 0.35], [-0.5, GRADE + 1.5, -Z + 0.35], [0.5, GRADE + 1.5, -Z + 0.35], () => [0.006, 0.006, 0.006], false, [0, 0, -1]);
    for (const x of [-0.55, 0.55]) log(m, [x, GRADE - 0.1, -Z - 0.05], [x, GRADE + 1.55, -Z - 0.05], 0.09, 6, bark, endGrain);
    log(m, [-0.75, GRADE + 1.6, -Z - 0.05], [0.75, GRADE + 1.6, -Z - 0.05], 0.1, 6, bark, endGrain);
    const brng = mulberry32(O.seed + 17);
    for (const x of [-0.95, 0.95]) placeBag(m, brng, x, GRADE + 0.1, -Z - 0.45, 0, T.bag, 0);
  }
  if (!O.broken) {
    // the roof: two layers of logs across, then the earth over them, a turfed mound to the slit's brow
    for (let i = 0; i < 18; i++) {
      const x = -X - 0.1 + (i * (W + 0.2)) / 17;
      log(m, [x, wallTop + r, -Z - 0.35], [x, wallTop + r, Z + 0.45], r * 0.95, 6, bark, endGrain);
    }
    // the earth over the roof: a turfed dome from the eaves (the roof logs' ends left showing at the front) to 0.6 m
    const roofPlan: Plan = ensureOutward([[-X - 0.3, -Z - 0.3], [X + 0.3, -Z - 0.3], [X + 0.3, Z + 0.05], [-X - 0.3, Z + 0.05]]);
    roofCover(m, roofPlan, wallTop + 2 * r - 0.04, 0.62, -0.06, T, O.seed + 9);
  } else {
    // the roof down: logs fallen in and thrown, splintered
    for (let i = 0; i < 12; i++) {
      const x = (rng() - 0.5) * W, z = (rng() - 0.5) * D, a = rng() * Math.PI, l = 0.8 + rng() * 2;
      const y = GRADE + 0.2 + rng() * 0.25;
      log(m, [x - Math.cos(a) * l / 2, y, z - Math.sin(a) * l / 2], [x + Math.cos(a) * l / 2, y + (rng() - 0.5) * 0.3, z + Math.sin(a) * l / 2], r * 0.9, 6, (p, n) => mul(bark(p, n), 0.6), endGrain);
    }
  }
  // (the bank all round to the slit, open at the rear door: the static earthwork, pillboxBerm)
  if (O.broken) {
    for (let i = 0; i < 10; i++) lump(m, (rng() - 0.5) * 4, GRADE + 0.08, (rng() - 0.5) * 3.4, 0.3 + rng() * 0.4, 0.22, 0.3 + rng() * 0.4, rng, (p) => mul(T.earth, 0.8 + vnoise(p[0], 0, p[2], 0.2, 5) * 0.3), false);
  }
  return m.geometry();
}

// ---------------------------------------------------------------------------------------------------------------
// public

function mulberry32(a: number): Rng {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** A map's pillbox: its intact and destroyed states (one geometry each, in the bunker's frame). */
export function buildPillbox(style: PillboxStyle, tones: FortTones, seed: number, broken: boolean): THREE.BufferGeometry {
  const O = { tones, seed, broken };
  const g = style === 'logearth' ? buildLogEarthPillbox(O) : buildConcretePillbox(style, O);
  return g;
}

/**
 * Each map's pillbox: its form and its tones (sRGB hex; linear below), by its setting (periodClutterKit MAP_SETTING_YEAR)
 * and ground. Concrete, earth, turf, crest (the dry grass or sand over the toe), timber, hessian; age 0 fresh .. 1 relic.
 * The desert maps' sangar (structureVariants) and a map absent here keep their own pillbox.
 */
interface FortMapEntry { style: PillboxStyle; c: number; e: number; t: number; k: number; w?: number; b?: number; age: number; arid?: boolean; camo?: 'pattern' | 'whitewash' }
const W_TIMBER = 0x5b4a38, W_BAG = 0x8e7f5e;
export const FORT_MAPS: Readonly<Record<string, FortMapEntry>> = Object.freeze({
  // western Europe 1940-45 and its relics: the Regelbau casemate
  autumn: { style: 'regelbau', c: 0x8f8b82, e: 0x5a4a38, t: 0x5d6a33, k: 0x8a8150, age: 0.4, camo: 'pattern' },
  polders: { style: 'regelbau', c: 0x8c8a84, e: 0x4f4636, t: 0x55663a, k: 0x7f8257, age: 0.45, camo: 'pattern' },
  reservoir: { style: 'regelbau', c: 0x8a877f, e: 0x55473a, t: 0x50602f, k: 0x7a7a48, age: 0.5, camo: 'pattern' },
  foundry: { style: 'regelbau', c: 0x85827b, e: 0x4c4339, t: 0x58603a, k: 0x7a7559, age: 0.55, camo: 'pattern' },
  railyard: { style: 'regelbau', c: 0x87847c, e: 0x4f463b, t: 0x5a6438, k: 0x7d7a55, age: 0.75 },
  urban: { style: 'regelbau', c: 0x8a867e, e: 0x50463a, t: 0x56653a, k: 0x7f7c55, age: 0.7 },
  frontier: { style: 'regelbau', c: 0x8b877f, e: 0x55493a, t: 0x58693a, k: 0x86834f, age: 0.75 },
  coastal: { style: 'regelbau', c: 0x8d8b84, e: 0x4e4a3c, t: 0x5b6d3b, k: 0x8b8a5a, age: 0.95 },
  winter: { style: 'regelbau', c: 0x8e8c88, e: 0x6d6a66, t: 0xd7dbe2, k: 0xe4e7ec, age: 0.35, camo: 'whitewash' },
  whiteout: { style: 'regelbau', c: 0x8f8e8a, e: 0x77746f, t: 0xdfe3ea, k: 0xe8ebf0, age: 0.5 },
  ruinspires: { style: 'regelbau', c: 0x8d8981, e: 0x5f5242, t: 0x6a6c3c, k: 0x8f8559, age: 0.6 },
  skybridge: { style: 'regelbau', c: 0x9b8f80, e: 0x8a5f43, t: 0x8f6a4b, k: 0xaa8161, age: 0.5, arid: true },
  titan_gorge: { style: 'regelbau', c: 0x9a8e80, e: 0x8a5c40, t: 0x93684a, k: 0xaa8161, age: 0.55, arid: true },
  copper_mesa: { style: 'regelbau', c: 0x8f8a82, e: 0x6b5a4a, t: 0x7d6c58, k: 0x8f7d66, age: 0.6, arid: true },
  // the Soviet DOT, rounded front under a thick earth cover
  steppe: { style: 'dot', c: 0x928d82, e: 0x6a5a42, t: 0x7d7a4c, k: 0x9a9060, age: 0.55 },
  moon: { style: 'dot', c: 0x8c8c8c, e: 0x676b73, t: 0x707479, k: 0x7a7e84, age: 0.1, arid: true },
  mars: { style: 'dot', c: 0x9a8a7c, e: 0x8a4f35, t: 0x93573a, k: 0xa0634a, age: 0.1, arid: true },
  alpine: { style: 'dot', c: 0x949089, e: 0x6b6258, t: 0x6d7444, k: 0x9ea0a2, age: 0.5 },
  // the hexagonal pillbox: the KMT lines of 1937, the Japanese and Spanish rounds
  blackglass: { style: 'hex', c: 0x8a8780, e: 0x4b4338, t: 0x58613a, k: 0x6f6b52, age: 0.3 },
  caldera: { style: 'hex', c: 0x87857f, e: 0x403c38, t: 0x55663a, k: 0x6c7048, age: 0.9 },
  cliffbridge: { style: 'hex', c: 0x9a948a, e: 0x7a6650, t: 0x857a52, k: 0xa39466, age: 0.75, arid: true },
  orchard: { style: 'hex', c: 0x9a948a, e: 0x7a6450, t: 0x7f7650, k: 0x9e9168, age: 0.6, arid: true },
  saltwind: { style: 'hex', c: 0x9c978d, e: 0x7a6a56, t: 0x7c7752, k: 0x9b9270, age: 0.6, arid: true },
  // the Western Desert's round concrete posts (the Italian and Libyan pillboxes), sand banked high against them
  desert: { style: 'hex', c: 0xa39a8a, e: 0x9c8466, t: 0xae9a78, k: 0xb8a482, age: 0.65, arid: true },
  oasis: { style: 'hex', c: 0xa69d8c, e: 0xa48c6c, t: 0xb9a37e, k: 0xc4ae88, age: 0.7, arid: true },
  // log and earth: the DZOT, the Japanese bunker, the maneuvers' dugout, the modern timber position
  verdant: { style: 'logearth', c: 0x8e8a82, e: 0x4f4232, t: 0x5e6c34, k: 0x8b8650, w: 0x5a4936, age: 0.4 },
  monsoon: { style: 'logearth', c: 0x8a877f, e: 0x5a4632, t: 0x4f6430, k: 0x6d7a3f, w: 0x5d4b38, age: 0.4 },
  longleaf: { style: 'logearth', c: 0x8e8a82, e: 0x7a5e3e, t: 0x5f6b33, k: 0x8f8550, w: 0x6a5640, age: 0.3 },
  fjord: { style: 'logearth', c: 0x8e8a84, e: 0x55493c, t: 0x5a6640, k: 0x8a8a70, w: 0x564636, age: 0.35 },
  airfield: { style: 'logearth', c: 0x8e8a82, e: 0x54473a, t: 0x5d6a38, k: 0x86834f, w: 0x7a6650, b: 0x7d7860, age: 0.1 },
  mangrove: { style: 'logearth', c: 0x8a877f, e: 0x4f4232, t: 0x56683a, k: 0x76804a, w: 0x6a5a44, age: 0.5 },
  delta: { style: 'logearth', c: 0x8a877f, e: 0x6a5a44, t: 0x61694b, k: 0x8a8a5c, w: 0x6a5a44, age: 0.4 },
});

/** A map's pillbox form and tones, or null where the map keeps its own (the sangar, a map not listed). */
export function fortFor(mapId: string): { style: PillboxStyle; tones: FortTones; seed: number } | null {
  const e = FORT_MAPS[mapId];
  if (!e) return null;
  let h = 0x811c9dc5;
  for (let i = 0; i < mapId.length; i++) h = Math.imul(h ^ mapId.charCodeAt(i), 0x01000193);
  return {
    style: e.style,
    seed: (h >>> 0) % 100000,
    tones: { concrete: hexLin(e.c), earth: hexLin(e.e), turf: hexLin(e.t), crest: hexLin(e.k), timber: hexLin(e.w ?? W_TIMBER),
      bag: hexLin(e.b ?? W_BAG), age: e.age, arid: !!e.arid, ...(e.camo ? { camo: e.camo } : {}) },
  };
}

/**
 * The footing of a map's intact pillbox, in its own frame (+z forward, y over its base): per perimeter sample of its
 * berm, the bank's surface points out from the wall (rows t = BERM_T: the crest at the wall to the toe and the skirt)
 * and the outward direction; where there is no bank (the open rear), the wall's foot. props.ts lays the ground's own
 * material over the toe from these (a fillet from the bank onto the terrain), so the bank grows out of the ground.
 */
export function pillboxFooting(style: PillboxStyle, tones: FortTones, seed: number): Array<{ rows: V3[]; nx: number; nz: number; h: number }> {
  const B = style === 'logearth' ? logEarthBermSpec(tones, seed, false) : concreteBermSpec(style, concreteLayout(style), tones, seed, false);
  const { samples, grid, hs } = bermGrid(B);
  return samples.map((s, i) => ({ rows: grid[i], nx: s.nx, nz: s.nz, h: hs[i] }));
}
export const FORT_GRADE = GRADE;

/**
 * A map's pillbox bank: the earth banked against its walls, in the pillbox's frame (+z forward, y over its base). It
 * is the battlefield's, not the destructible's: props.ts lays it as a static earthwork round each pillbox (its own
 * collision; drawn with the ground's material on desktop, in these vertex colours on the phones' plain baked material,
 * `forBaked`), so it stands as it was when the concrete inside is destroyed. `clip`: the movement footprint's source,
 * the bank cut off where it falls under that height (FORT_CONTACT_FLOOR_M; the hitbox lane's formations rule: a hull
 * is stopped where the bank stands higher than it climbs, not at its toe).
 */
export function pillboxBerm(style: PillboxStyle, tones: FortTones, seed: number, opts: { clip?: number; forBaked?: boolean } = {}): THREE.BufferGeometry {
  const m = new Mesh(opts.forBaked ? 1 : 1 / FORT_PRINT_MEAN);
  const B = style === 'logearth' ? logEarthBermSpec(tones, seed, false) : concreteBermSpec(style, concreteLayout(style), tones, seed, false);
  berm(m, { ...B, clip: opts.clip });
  return m.geometry();
}
export const FORT_CONTACT_FLOOR_M = 0.35;

/** The whole work's ground (the body and its bank): the field works' road and trunk checks read its band (props.ts). */
export function pillboxFootprintGeometry(style: PillboxStyle, tones: FortTones, seed: number): THREE.BufferGeometry {
  const body = buildPillbox(style, tones, seed, false), bank = pillboxBerm(style, tones, seed);
  const g = mergeGeometries([body, bank], false);
  body.dispose(); bank.dispose();
  if (!g) throw new Error('fortKit: footprint merge failed');
  return g;
}

/** Default tones (a temperate map); props.ts passes each map's. */
export const TEMPERATE_TONES: FortTones = {
  concrete: hexLin(0x9a968c), earth: hexLin(0x5a4a38), turf: hexLin(0x56622f), crest: hexLin(0x7d7a4a),
  timber: hexLin(0x5b4a38), bag: hexLin(0x8e7f5e), age: 0.45, arid: false,
};

/** For the offline look tools: a style's two states, merged with nothing else. */
export function buildForRender(o: { variant?: string; broken?: boolean; seed?: number; map?: string }): THREE.BufferGeometry {
  const f = o.map ? fortFor(o.map) : null;
  const style = f?.style ?? (o.variant as PillboxStyle) ?? 'regelbau', tones = f?.tones ?? TEMPERATE_TONES, seed = f?.seed ?? o.seed ?? 7;
  const body = buildPillbox(style, tones, seed, !!o.broken), bank = pillboxBerm(style, tones, seed);
  const g = mergeGeometries([body, bank], false)!;
  body.dispose(); bank.dispose();
  return g;
}

export { mergeGeometries as _mergeForTests };
