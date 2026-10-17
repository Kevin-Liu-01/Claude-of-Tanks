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
// Its destroyed state is the same work's own pieces settled where a blow and gravity leave them (round 2;
// fractureSettle.ts): the stubs standing with their breaks ragged and barred, a corner standing, the lifts leaning out on
// the bank or fallen in, the slab down in cracked plates on the stubs, rubble and the bank's earth thrown over its crest
// (a broken prop has no collider: the wreck stands no higher than its standing corner); the log-and-earth work's roof
// logs in its pit under the slumped soil of its cover, its wall logs spilled.
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
import { sandbagBag } from './fieldworksKit.ts';
import { FractureSettle, edgeRuns, type SettleTris } from './fractureSettle.ts';
import type { DamageMeshWriter, FractureMaterial } from '../destructionKit.ts';
import type {
  FractureFace, FractureLink, FractureLinkKind, FracturePiece, FractureRole, KitFractureAnatomy,
} from '../fractureAnatomy.ts';
import { PartSink, LocalFrame, faceBox, rgb, type Face as KitFace, type RegionalParts } from './regional/geometry.ts';
import { DAMP_EDGE_BREAKS, holedPolygon, recordBody, type HoleRect } from './regional/house.ts';
import { doorUnit } from './regional/openings.ts';
import type { RegionalBuildContext } from './regional/types.ts';

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
  /** regolith, no growth (the Moon, Mars): no tufts */
  barren?: boolean;
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
function lump(m: Mesh, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rng: Rng, shade: Shade, printed: boolean, yaw = rng() * Math.PI, tilt = 0.4, maxY = Infinity): void {
  const ry = yaw, rx = (rng() - 0.5) * tilt, rz = (rng() - 0.5) * tilt;
  const corner = (x: number, y: number, z: number): V3 => {
    let px = x * sx * (0.75 + rng() * 0.5) / 2, py = y * sy * (0.7 + rng() * 0.6) / 2, pz = z * sz * (0.75 + rng() * 0.5) / 2;
    // roll about x, then z, then yaw
    let t = py * Math.cos(rx) - pz * Math.sin(rx); pz = py * Math.sin(rx) + pz * Math.cos(rx); py = t;
    t = px * Math.cos(rz) - py * Math.sin(rz); py = px * Math.sin(rz) + py * Math.cos(rz); px = t;
    return [cx + px * Math.cos(ry) + pz * Math.sin(ry), cy + py, cz - px * Math.sin(ry) + pz * Math.cos(ry)];
  };
  const v = [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1), corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1)];
  // (a destroyed work's chunk sunk until its highest corner is under the cap: a broken prop has no collider)
  const over = Math.max(...v.map((q) => q[1])) - maxY;
  if (over > 0) for (const q of v) q[1] -= over;
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
      const foot = 1 - smooth(W.grade + 0.05, W.grade + 0.95 + mot * 0.4, p[1]);
      c = mix(c, mul(mix(c, moss, 0.45), 0.55), foot * (0.65 + T.age * 0.35));
      // rain runs from the drip line: dark streaks in columns, fading down the wall
      const col = vnoise(p[0] * 3.1 + p[2] * 3.1, 0, 0, 0.55, seed + 3);
      const col2 = vnoise(p[0] * 7.3 - p[2] * 7.3, 0, 0, 0.5, seed + 4);
      const run = smooth(0.46, 0.82, col * 0.7 + col2 * 0.3) * smooth(W.drip - 1.9, W.drip - 0.05, p[1]);
      c = mul(c, 1 - run * (0.34 + T.age * 0.36));
      // and the rust-brown and green stain the runs leave on an old work
      c = mix(c, T.arid ? [0.16, 0.12, 0.08] : [0.09, 0.1, 0.06], run * T.age * 0.35);
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
      const m = smooth(0.48, 0.72, fbm(p[0], p[1], p[2], 0.5, seed + 17)) * (0.35 + shadeSide * 0.65) * (0.35 + T.age * 1.1)
        * (1 - smooth(W.grade + 0.8, W.drip, p[1]) * 0.6);
      c = mix(c, moss, clamp01(m) * 0.85);
      // lichen in grey-green rosettes over the weather faces
      const lr = smooth(0.66, 0.8, vnoise(p[0] * 4.2, p[1] * 4.2, p[2] * 4.2, 0.3, seed + 19)) * (0.2 + T.age * 0.8);
      c = mix(c, lichen, lr * 0.4);
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
    // (round 2, wave 370: "smooth cushions, pillows, loaves") the toe wanders, the face is lumpy and slumped in places
    const jitter = (vnoise(s.x * 2.3, 0, s.z * 2.3, 0.9, B.seed) - 0.5) + (vnoise(s.x * 6.1, 1, s.z * 6.1, 0.5, B.seed + 2) - 0.5) * 0.8;
    for (let r = 0; r < R; r++) {
      let x: number, y: number, z: number;
      if (r < BERM_T.length) {
        const t = BERM_T[r];
        const run = Math.max(0.35, h0 * B.run + 0.35);
        const d = t * run + (t > 0 ? jitter * 0.55 * t : -0.03);
        let hh = h0 * bermProfile(t);
        if (t > 0 && t < 1) {
          const lumps = (vnoise(s.x * 3.7, t * 4, s.z * 3.7, 0.7, B.seed + 5) - 0.5) * 0.16
            + (vnoise(s.x * 9.3, t * 9, s.z * 9.3, 0.35, B.seed + 7) - 0.5) * 0.09
            // spoil clods and slumps: a few sharp bumps and hollows along the face
            + (smooth(0.72, 0.9, vnoise(s.x * 5.3, t * 6, s.z * 5.3, 0.4, B.seed + 9)) - smooth(0.78, 0.95, vnoise(s.x * 4.1, t * 3, s.z * 4.1, 0.6, B.seed + 11)) * 0.7) * 0.12;
          hh += lumps * Math.min(1, h0 * 1.6) * (t < 0.95 ? 1 : 0.4);
        }
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
    // the bank still falls from the wall to its toe: a lump never rises more than a few centimetres over the row inside it
    for (let r = 1; r < BERM_T.length; r++) if (row[r][1] > row[r - 1][1] + 0.06) row[r][1] = row[r - 1][1] + 0.06;
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
      slitList.push({ edge: i, s: len / 2, y: 1.12, w: 0.82, h: 0.42, steps: 3, plate: false });
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
        // the rear: the spoil of the dig banked low either side of the way in (round 2, wave 370: "the rear wall rises
        // straight out of flat lawn"), the far corner higher, the way to the door and its blast wall clear
        const door = L.doorEdge >= 0 ? (() => {
          const a = plan[L.doorEdge], b = plan[(L.doorEdge + 1) % plan.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          return { x: a[0] + (b[0] - a[0]) * (L.doorS / len), z: a[1] + (b[1] - a[1]) * (L.doorS / len) };
        })() : null;
        const fromDoor = door ? Math.hypot(s.x - door.x, s.z - door.z) : 9;
        h = Math.max(s.x < 0 ? hFlank * smooth(-0.9, -2.3, s.x) : 0, 0.55 * smooth(1.6, 2.6, fromDoor));
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
  if (C) {
    // the bag's own light and dark (its seam, its earth toward its bed) over its mean, carried onto this map's hessian
    let mean = 0;
    for (let i = 0; i < C.count; i++) mean += (C.getX(i) + C.getY(i) + C.getZ(i)) / 3;
    mean = Math.max(1e-4, mean / C.count);
    for (let i = 0; i < C.count; i++) {
      const l = (C.getX(i) + C.getY(i) + C.getZ(i)) / 3 / mean;
      C.setXYZ(i, tone[0] * l, tone[1] * l, tone[2] * l);
    }
  }
  m.absorb(g);
  g.dispose();
}

/** A bed's top: a hair under the 6 cm the contact band starts at (structureCollision contactBandSolids), so the bed adds
 *  no collision; the bags' feet over it within the r2 contact (2 cm). */
const BED_TOP = 0.0595;
/**
 * The trodden spoil a stack of bags was set on (the r2 sweep, 2026-10-16: the bags at a work's mouth stood on the grade
 * line and hung over the ground where it falls away from the seat, 2-18 cm over it on Autumn, Urban Block and
 * Reservoir): a low mound centred at (cx, cz), `hl` along `u` and `hw` across it on top, just under the bags' feet,
 * its flanks running down and out at about 45 degrees to `foot` under the ground, so wherever the terrain falls away
 * from the grade it shows as the earth they stand on, never as a gap. Lumpy by place (hash noise: no draws), in the
 * map's earth, damp and darker toward its foot, a little turf in its shoulder; under the contact band's 6 cm, so it adds
 * no collision (structureCollision contactBandSolids), and open beneath.
 */
function spoilBed(m: Mesh, cx: number, cz: number, u: V3, hl: number, hw: number, foot: number, T: FortTones, seed: number): void {
  const K = 14, top = BED_TOP;
  const v: V3 = [-u[2], 0, u[0]];
  // the outline: a rounded rectangle (a superellipse), its outward normal by its gradient
  const outline = Array.from({ length: K }, (_, k) => {
    const a = (k / K) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), p = 2 / 3;
    const ls = Math.sign(c) * Math.pow(Math.abs(c), p) * hl, lt = Math.sign(s) * Math.pow(Math.abs(s), p) * hw;
    const gs = Math.sign(c) * Math.pow(Math.abs(c), 2 - p) / hl, gt = Math.sign(s) * Math.pow(Math.abs(s), 2 - p) / hw, gl = Math.hypot(gs, gt) || 1;
    return { s: ls, t: lt, ns: gs / gl, nt: gt / gl };
  });
  const drop = top - foot;
  // rings from the crown's edge out and down: [reach out, height under the top, slope of the flank there]
  const rings: Array<[number, number, number]> = [[0, 0, 0.25], [0.07, 0.035, 0.7], [0.2 + drop * 0.15, drop * 0.42, 1], [drop * 0.95, drop, 1.1]];
  const lumpAt = (k: number, r: number): number => (hash3(k, r, 3, seed) - 0.5);
  const P = (k: number, r: number): V3 => {
    const o = outline[k], [out, under] = rings[r];
    const rag = r === 0 ? 0 : lumpAt(k, r) * 0.05 * r;
    const s = o.s + o.ns * (out + rag), t = o.t + o.nt * (out + rag);
    // (the crown's rim only ever down, a few millimetres: the bed never stands over its top)
    const y = top - under + (r === 0 ? -(lumpAt(k, 7) + 0.5) * 0.004 : lumpAt(k, r + 7) * Math.min(0.03, under * 0.2));
    return [cx + u[0] * s + v[0] * t, y, cz + u[2] * s + v[2] * t];
  };
  const N = (k: number, r: number): V3 => {
    const o = outline[k], slope = rings[r][2];
    return norm([(u[0] * o.ns + v[0] * o.nt) * slope, 1, (u[2] * o.ns + v[2] * o.nt) * slope]);
  };
  const shade: Shade = (p, n) => {
    const depth = clamp01((top - p[1]) / Math.max(0.05, drop));
    let c = mix(mul(T.earth, 0.82), mul(T.earth, 0.58), depth);
    c = mix(c, mul(T.turf, 0.75), smooth(0.55, 0.8, fbm(p[0] * 2, 0, p[2] * 2, 0.5, seed + 5)) * (1 - depth) * clamp01(n[1]) * (T.barren ? 0 : T.arid ? 0.2 : 0.5));
    return mul(c, 0.82 + vnoise(p[0] * 3, p[1] * 3, p[2] * 3, 0.25, seed + 7) * 0.3);
  };
  // the crown: a fan from its middle, sunk a hair under the rim (never above the bags' feet), a little off the bags' axis
  // (a vertex of a bag's own may stand on it: shared, the two would weld into one collision solid)
  const mid: V3 = [cx + 0.0137, top - 0.003, cz - 0.0091], up: V3 = [0, 1, 0];
  for (let k = 0; k < K; k++) m.triN(mid, up, P(k, 0), N(k, 0), P((k + 1) % K, 0), N((k + 1) % K, 0), shade);
  for (let r = 0; r + 1 < rings.length; r++) for (let k = 0; k < K; k++) {
    const k1 = (k + 1) % K;
    m.triN(P(k, r), N(k, r), P(k, r + 1), N(k, r + 1), P(k1, r + 1), N(k1, r + 1), shade);
    m.triN(P(k, r), N(k, r), P(k1, r + 1), N(k1, r + 1), P(k1, r), N(k1, r), shade);
  }
  // (no underside: it lies under the ground, and a flat one there reads to structureCollision as a deck to stand on)
}

/**
 * The tamped earth a bag was bedded in, over its spoil bed (the log-and-earth work's threshold bags, whose feet stand up
 * to 2 cm over the bed's top): a lumpy pad under the bag's foot, its top 4 mm under the bag's lowest point (`under`) and
 * 1.9 cm thick, so it reaches down into the bed; thinner than the 2.5 cm a collision solid needs (structureCollision
 * solidsFromComponents), so it adds no collision either.
 */
function tampedPad(m: Mesh, cx: number, cz: number, u: V3, hl: number, hw: number, under: number, T: FortTones, seed: number): void {
  const K = 12, top = under - 0.004, bot = top - 0.019;
  const v: V3 = [-u[2], 0, u[0]];
  const ring = (y: number, grow: number, k: number): V3 => {
    const a = ((k + 0.5) / K) * Math.PI * 2, rag = 1 + (hash3(k, 5, 1, seed) - 0.5) * 0.16 + grow;
    const s = Math.cos(a) * hl * rag, t = Math.sin(a) * hw * rag;
    return [cx + u[0] * s + v[0] * t, y - hash3(k, 6, Math.round(y * 1000), seed) * 0.002, cz + u[2] * s + v[2] * t];
  };
  const shade: Shade = (p) => mul(T.earth, 0.62 + vnoise(p[0] * 5, p[1] * 5, p[2] * 5, 0.2, seed + 3) * 0.2);
  const cTop: V3 = [cx - 0.0071, top, cz + 0.0113], cBot: V3 = [cx - 0.0071, bot, cz + 0.0113];
  for (let k = 0; k < K; k++) {
    const k1 = (k + 1) % K;
    const a0 = ring(top, 0, k), a1 = ring(top, 0, k1), b0 = ring(bot, 0.12, k), b1 = ring(bot, 0.12, k1);
    m.tri(cTop, a0, a1, shade, false, undefined, [0, 1, 0]);
    m.tri(cBot, b1, b0, shade, false, undefined, [0, -1, 0]);
    const out: V3 = [a0[0] + a1[0] - 2 * cx, 0, a0[2] + a1[2] - 2 * cz];
    m.quad(a0, b0, b1, a1, shade, false, undefined, out);
  }
}

/**
 * The roof's cover:a skin of earth under turf, nearly flat on top and rounded off at a ragged rim inset from the slab's
 * edge, gently uneven, in patches of grass, dry grass and bare earth, and tufts standing in it. Its normals are the
 * surface's own (area-weighted over the triangles round each vertex), so no wedge of the fan reads as a fold.
 */
function roofCover(m: Mesh, plan: Plan, y: number, thick: number, inset: number, T: FortTones, seed: number, quadrant?: [number, number]): void {
  if (thick <= 0.02) return;
  const inner = grow(plan, -inset + (inset === 0 ? 0.18 : 0));
  const samples = perimeter(inner, 0.2, 0);
  const cx = plan.reduce((s, p) => s + p[0], 0) / plan.length, cz = plan.reduce((s, p) => s + p[1], 0) / plan.length;
  const RINGS = 9;
  // the cover's height over the slab at a share t of the way to its rim: flat, rounded off at the edge, uneven
  const heightAt = (x: number, z: number, t: number): number => {
    if (t >= 1) return -0.01;
    const shoulder = Math.pow(Math.cos(Math.min(1, Math.max(0, (t - 0.68) / 0.32)) * Math.PI / 2), 0.8);
    const lumps = (fbm(x, 0, z, 0.9, seed + 3) - 0.5) * 0.36 + (vnoise(x, 0, z, 0.25, seed + 4) - 0.5) * 0.14
      + (smooth(0.7, 0.9, vnoise(x, 1, z, 0.4, seed + 6)) - 0.35) * 0.18;
    return Math.max(0.01, thick * shoulder * (1 + lumps));
  };
  const K = samples.length;
  const grid: V3[][] = samples.map((s0) => Array.from({ length: RINGS + 1 }, (_, r) => {
    const t = r / RINGS;
    // the rim's raggedness by place along it (low frequency: no radial combing)
    const rag = (vnoise(s0.x * 1.3, 0, s0.z * 1.3, 0.9, seed) - 0.5) * 0.35;
    const x = cx + (s0.x + s0.nx * rag - cx) * t, z = cz + (s0.z + s0.nz * rag - cz) * t;
    return [x, y + heightAt(x, z, t), z] as V3;
  }));
  // the triangles, then each vertex's normal as the area-weighted sum of its triangles' (degenerate ones add nothing)
  const tris: Array<[number, number, number, number, number, number]> = [];
  for (let i = 0; i < K; i++) {
    const i1 = (i + 1) % K;
    for (let r = 0; r < RINGS; r++) {
      if (r > 0) tris.push([i, r, i1, r, i1, r + 1]);
      tris.push([i, r, i1, r + 1, i, r + 1]);
    }
  }
  const acc = grid.map((row) => row.map(() => [0, 0, 0] as V3));
  for (const [ia, ra, ib, rb, ic, rc] of tris) {
    const A = grid[ia][ra], B = grid[ib][rb], C = grid[ic][rc];
    let fn = cross(sub(B, A), sub(C, A));
    if (fn[1] < 0) fn = scl(fn, -1);
    for (const [iv, rv] of [[ia, ra], [ib, rb], [ic, rc]]) { const v = acc[iv][rv]; v[0] += fn[0]; v[1] += fn[1]; v[2] += fn[2]; }
  }
  // the centre is one point for every sample: its normal the sum of all of them
  const centre: V3 = [0, 0, 0];
  for (let i = 0; i < K; i++) { centre[0] += acc[i][0][0]; centre[1] += acc[i][0][1]; centre[2] += acc[i][0][2]; }
  for (let i = 0; i < K; i++) acc[i][0] = [centre[0], centre[1], centre[2]];
  const nrm = acc.map((row) => row.map((v) => norm(v[1] <= 1e-9 ? [0, 1, 0] : v)));
  const shade = (p: V3, n: V3): Rgb => {
    const big = fbm(p[0], 0, p[2], 1.1, seed + 5), mid = fbm(p[0] + 3.7, 0, p[2] - 1.9, 0.45, seed + 6), fine = vnoise(p[0], 0, p[2], 0.12, seed + 7);
    // grass, dry grass in drifts, bare earth in a few patches and where the rim falls away, a darker moss here and there
    let c = mix(T.turf, T.crest, smooth(0.38, 0.72, big));
    c = mix(c, mul(T.turf, 0.62), smooth(0.66, 0.84, mid) * (T.arid ? 0 : 0.6));
    c = mix(c, mul(T.earth, 0.95), smooth(0.7, 0.86, fbm(p[0], 3, p[2], 0.5, seed + 9)) * 0.8);
    const steep = clamp01((1 - n[1]) * 2.5);
    c = mix(c, T.earth, steep * (T.arid ? 0.8 : 0.5));
    if (T.arid) c = mix(c, T.earth, 0.55);
    return mul(c, 0.8 + fine * 0.35);
  };
  for (const [ia, ra, ib, rb, ic, rc] of tris) {
    if (!quadrant) { m.triN(grid[ia][ra], nrm[ia][ra], grid[ib][rb], nrm[ib][rb], grid[ic][rc], nrm[ic][rc], shade); continue; }
    // (round 2: a slab plate's share, the triangles cut on the plates' joints)
    const poly = clipPN(clipPN([{ p: grid[ia][ra], n: nrm[ia][ra] }, { p: grid[ib][rb], n: nrm[ib][rb] }, { p: grid[ic][rc], n: nrm[ic][rc] }],
      quadrant[0], 0), 0, quadrant[1]);
    for (let q = 1; q + 1 < poly.length; q++) m.triN(poly[0].p, poly[0].n, poly[q].p, poly[q].n, poly[q + 1].p, poly[q + 1].n, shade);
  }
  // tufts of grass in it (dry on an arid map: thin, few)
  const tufts = 0; // (round 2, wave 370: "sparse dark spikes", "spiky card tufts": the turf carries its own grass in its colour)
  for (let k = 0; k < tufts; k++) {
    const si = Math.floor(hash3(k, 1, 2, seed) * K), t = Math.sqrt(hash3(k, 3, 4, seed)) * 0.86;
    const s0 = samples[si];
    const x = cx + (s0.x - cx) * t, z = cz + (s0.z - cz) * t, base = y + heightAt(x, z, t) - 0.02;
    if (quadrant && !(x * quadrant[0] > 0.3 && z * quadrant[1] > 0.3)) continue;
    tuft(m, x, base, z, 0.14 + hash3(k, 5, 6, seed) * 0.26, mix(T.crest, T.turf, hash3(k, 7, 8, seed) * 0.7), seed + k * 13);
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

// ---------------------------------------------------------------------------------------------------------------
// the log-and-earth bunker (DZOT, the Japanese bunker, the maneuvers' dugout)

const LOG_W = 4.6, LOG_D = 3.8, LOG_SLIT_Y = 0.86, LOG_SLIT_HW = 0.85, LOG_SLIT_HH = 0.15;
/** (r2 sweep) the slit's blackout board's foot: in the r2 ground band (2 cm over the base) on its stakes, over every
 *  collision strip's floor, so the work's collision stays the one it had */
const LOG_TOE_Y = 0.018;
/**
 * The log-and-earth work's bank (round 2; wave 370: "a smooth green pillow ... sitting on a bright green apron", "a
 * smooth green hump with a neat pit" when destroyed): a low bank of the dug spoil round its walls (to under the slit
 * in front, a little higher on the flanks, low behind and open at the door), drawn in the ground's own material as the
 * concrete works' banks are; the earth over the roof and down its flanks to this bank is the work's own cover, a piece
 * of the destructible that falls with it, so a destroyed work leaves no untouched mound.
 */
function logEarthBermSpec(T: FortTones, seed: number, broken: boolean): BermSpec {
  return {
    plan: ensureOutward(chamferedRect(LOG_W + 0.4, LOG_D + 0.4, 0.3)), run: 1.5, grade: GRADE, seed: seed + 11, tones: T,
    slump: broken ? 1 : 0, cap: 0.48,
    height: (s) => {
      const role = edgeRole(s.nx, s.nz);
      if (role === 'rear') return Math.abs(s.x) > 1.0 ? 0.42 * smooth(1.0, 1.7, Math.abs(s.x)) : 0;
      if (role === 'front') return Math.abs(s.x) < LOG_SLIT_HW + 0.4 ? LOG_SLIT_Y - LOG_SLIT_HH - 0.28 : 0.55;
      return 0.62;
    },
  };
}

/** A log from a to b: radius r at a tapering to r * taper at b, eight-sided, its bark in bands along it, its ends'
 *  grain pale in rings to a dark rim. */
function roundLog(m: Mesh, a: V3, b: V3, r: number, taper: number, T: FortTones, seed: number): void {
  const d = norm(sub(b, a));
  const side = norm(Math.abs(d[1]) > 0.9 ? cross(d, [1, 0, 0]) : cross(d, [0, 1, 0]));
  const up = cross(side, d);
  const SEG = 8;
  const bark: Shade = (p) => {
    const along = (p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2];
    const band = vnoise(along * 2.3, (p[1] + p[0] + p[2]) * 9, seed * 0.01, 0.5, seed + 3);
    const knot = smooth(0.82, 0.92, vnoise(along * 5.1, p[1] * 5, p[2] * 5, 0.4, seed + 5));
    return mul(mix(T.timber, mul(T.timber, 0.55), knot * 0.6), 0.62 + band * 0.55);
  };
  const grain = (c: V3, rr: number): Shade => (p) => {
    const t = Math.min(1, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) / Math.max(0.01, rr));
    const pale = mix([0.42, 0.33, 0.21], [0.33, 0.25, 0.16], 0.5 + 0.5 * Math.sin(t * 19 + seed));
    return mix(pale, mul(T.timber, 0.6), smooth(0.78, 1, t));
  };
  const ring = (c: V3, rr: number, k: number): V3 => {
    const ph = (k / SEG) * Math.PI * 2, wob = 1 + 0.07 * Math.sin(ph * 3 + seed + c[0] * 2.1 + c[2] * 1.3);
    return add(c, add(scl(side, Math.cos(ph) * rr * wob), scl(up, Math.sin(ph) * rr * wob)));
  };
  const rb = r * taper;
  for (let k = 0; k < SEG; k++) {
    const p0 = ring(a, r, k), p1 = ring(a, r, k + 1), p2 = ring(b, rb, k + 1), p3 = ring(b, rb, k);
    const n0 = norm(sub(p0, a)), n1 = norm(sub(p1, a));
    m.triN(p0, n0, p3, n0, p2, n1, bark);
    m.triN(p0, n0, p2, n1, p1, n1, bark);
    m.tri(a, ring(a, r, k + 1), ring(a, r, k), grain(a, r), false, scl(d, -1));
    m.tri(b, ring(b, rb, k), ring(b, rb, k + 1), grain(b, rb), false, d);
  }
}

/** A clump of grass: five to seven curved blades, dark at the foot, paler and drier at the tips. */
function grassClump(m: Mesh, x: number, y: number, z: number, h: number, T: FortTones, seed: number): void {
  const blades = 5 + Math.floor(hash3(seed, 1, 0, 9) * 3);
  const base = mul(T.turf, 0.55), tip = mix(T.turf, T.crest, 0.55 + hash3(seed, 2, 0, 9) * 0.35);
  for (let k = 0; k < blades; k++) {
    const a = hash3(seed, k, 3, 9) * Math.PI * 2, lean = 0.25 + hash3(seed, k, 4, 9) * 0.45, hh = h * (0.6 + hash3(seed, k, 5, 9) * 0.5);
    const dx = Math.cos(a), dz = Math.sin(a), w = 0.012 + hash3(seed, k, 6, 9) * 0.01;
    const p0: V3 = [x - dz * w, y, z + dx * w], p1: V3 = [x + dz * w, y, z - dx * w];
    const mid: V3 = [x + dx * hh * lean * 0.4, y + hh * 0.55, z + dz * hh * lean * 0.4];
    const top: V3 = [x + dx * hh * lean, y + hh, z + dz * hh * lean];
    const midL: V3 = [mid[0] - dz * w * 0.7, mid[1], mid[2] + dx * w * 0.7], midR: V3 = [mid[0] + dz * w * 0.7, mid[1], mid[2] - dx * w * 0.7];
    const n: V3 = norm([dx, 0.6, dz]);
    const cBase: Shade = () => base, cMid: Shade = () => mix(base, tip, 0.55), cTip: Shade = () => tip;
    // two-sided: each face both ways
    for (const s of [1, -1]) {
      const nn = scl(n, s);
      m.vertex(p0, nn, null, cBase(p0, nn)); m.vertex(s > 0 ? midR : midL, nn, null, cMid(mid, nn)); m.vertex(s > 0 ? midL : midR, nn, null, cMid(mid, nn));
      m.vertex(p0, nn, null, cBase(p0, nn)); m.vertex(s > 0 ? p1 : midL, nn, null, cBase(p1, nn)); m.vertex(s > 0 ? midR : p1, nn, null, cMid(mid, nn));
      m.vertex(s > 0 ? midL : midR, nn, null, cMid(mid, nn)); m.vertex(s > 0 ? midR : midL, nn, null, cMid(mid, nn)); m.vertex(top, nn, null, cTip(top, nn));
    }
  }
}

/**
 * The log-and-earth work (round 2; wave 370 on the DZOT, the Japanese bunker and the fjord's dugout: "a smooth,
 * symmetrical green pillow with a lip overhanging one tidy row of identical log ends", "a stuffed tarp laid over the log
 * ends rather than sod and earth over a timber roof", "stiff grey spikes for grass"), in the destruction core's pieces
 * (fractureAnatomy.ts): walls of round logs of their own girths, course on course, butted at the corners in turn (each
 * course's long logs run past the corner, the short ones stop at their faces), the slit between a sill course and a
 * heavier lintel course; the doorway behind between its posts under a lintel, two bags at the threshold; the roof of
 * sixteen logs laid front to back, their ends out over the slit unevenly; on them the earth heaped up behind and down the
 * flanks to the bank, thinning to the brow over the log ends, lumpy, in turf with bare earth where it falls away and
 * clumps of grass, held at the brow by a row of cut sods; the floor dug to the pit. Pieces: the floor and each wall's
 * buried course (the anchors), each wall in bands, the door's posts and lintel, every roof log (snapping at two scores
 * with splintered ends), the earth in four sections, the sods in two runs, the bags.
 */
function buildLogEarthPieces(O: BuildOpts): THREE.BufferGeometry {
  const m = new Mesh();
  const F = new FortPieces(m);
  const rng = mulberry32((O.seed ^ 0x10ea7) >>> 0);
  const T = O.tones;
  const X = LOG_W / 2, Z = LOG_D / 2;
  const slitLo = LOG_SLIT_Y - LOG_SLIT_HH, slitHi = LOG_SLIT_Y + LOG_SLIT_HH;
  // the courses: each its own girth, touching the one under it
  const courses: Array<{ y: number; r: number }> = [];
  for (let y = -0.42, prevTop = -0.42 - 0.13; ;) {
    const r = 0.122 + rng() * 0.034;
    y = prevTop + r;
    courses.push({ y, r });
    prevTop = y + r;
    if (prevTop > 1.3) break;
  }
  const wallTop = courses[courses.length - 1].y + courses[courses.length - 1].r;
  // (the doorway: a low one, its lintel under the roof logs)
  const doorTop = wallTop - 0.25;
  const vol = (r: number, l: number): number => Math.PI * r * r * l;
  const seedOf = (k: number): number => (O.seed + k * 7919) >>> 0;
  // a wall's logs in a band of courses [c0, c1): which wall, and whether its logs run long at this course
  type Wall = 'front' | 'back' | 'left' | 'right';
  const longAt = (w: Wall, c: number): boolean => ((w === 'front' || w === 'back') ? c % 2 === 0 : c % 2 === 1);
  const runOut = (c: number, end: number): number => 0.14 + hash3(c, end, 17, O.seed) * 0.2;
  const logsOf = (w: Wall, c: number): Array<[V3, V3, number]> => {
    const { y, r } = courses[c];
    const long = longAt(w, c);
    const out: Array<[V3, V3, number]> = [];
    if (w === 'front' || w === 'back') {
      const z = w === 'front' ? Z : -Z;
      const x0 = long ? -X - runOut(c, w === 'front' ? 1 : 3) : -X + r * 0.9, x1 = long ? X + runOut(c, w === 'front' ? 2 : 4) : X - r * 0.9;
      const cut = w === 'front' ? (y + r > slitLo + 0.02 && y - r < slitHi - 0.02 ? LOG_SLIT_HW : 0)
        : (y - r < doorTop && y + r > GRADE - 0.05 ? 0.55 : 0);
      if (cut) { out.push([[x0, y, z], [-cut, y, z], r], [[cut, y, z], [x1, y, z], r]); }
      else out.push([[x0, y, z], [x1, y, z], r]);
    } else {
      const x = w === 'left' ? -X : X;
      const z0 = long ? -Z - runOut(c, w === 'left' ? 5 : 7) : -Z + r * 0.9, z1 = long ? Z + runOut(c, w === 'left' ? 6 : 8) : Z - r * 0.9;
      out.push([[x, y, z0], [x, y, z1], r]);
    }
    return out;
  };
  const AXW: Record<Wall, BoxAxes> = {
    front: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] },
    back: { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] },
    left: { o: [0, 0, 0], x: [0, 0, 1], y: [0, 1, 0], z: [-1, 0, 0] },
    right: { o: [0, 0, 0], x: [0, 0, 1], y: [0, 1, 0], z: [-1, 0, 0] },
  };
  const band = (w: Wall, c0: number, c1: number, anchor: boolean, filter?: (a: V3, b: V3) => boolean): number => {
    let volume = 0, any = false;
    const first = F.pieces.length;
    F.begin({ role: 'wall', material: 'timber', face: w, axes: AXW[w], anchor, volume: 0.01 });
    for (let c = c0; c < c1; c++) {
      for (const [a, b, r] of logsOf(w, c)) {
        if (filter && !filter(a, b)) continue;
        roundLog(m, a, b, r, 0.93 + hash3(c, a[0] * 10, a[2] * 10, O.seed) * 0.06, T, seedOf(c * 13 + (a[0] > 0 ? 1 : 0)));
        volume += vol(r, Math.hypot(b[0] - a[0], b[2] - a[2]));
        any = true;
      }
    }
    if (!any) { F.cancel(); return -1; }
    const idx = F.end();
    F.pieces[idx].massKg = Math.max(1, Math.round(volume * 600 * 10) / 10);
    void first;
    return idx;
  };
  // the floor, dug to the pit
  F.begin({ role: 'slab', material: 'earth', face: 'floor', axes: AX, anchor: true, volume: 0.5 });
  // (the r2 standard, 2026-10-16: one flat quad, 15 m2 of the work's plain area) the trodden earth, dished a little
  // where the crew stood, a grid of cells by place (hash noise: no draws), never under the pit by more than 2 cm
  {
    const NX = 4, NZ = 3, x0 = -X + 0.15, x1 = X - 0.15, z0 = -Z + 0.15, z1 = Z - 0.15;
    const at = (i: number, j: number): V3 => {
      const u = i / NX, w = j / NZ, edge = i === 0 || j === 0 || i === NX || j === NZ;
      const dip = edge ? 0 : 0.008 + hash3(i, j, 23, O.seed) * 0.012;
      return [x0 + (x1 - x0) * u, PIT - dip, z0 + (z1 - z0) * w];
    };
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      m.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), () => mul(T.earth, 0.45), false, [0, 1, 0]);
    }
  }
  const floor = F.end();
  // the walls in bands: the buried courses (anchors), then below the slit, the slit's course, the lintel and above
  const cGrade = courses.findIndex((c) => c.y - c.r > -0.05);
  const cSlit = courses.findIndex((c) => c.y + c.r > slitLo + 0.02);
  const nC = courses.length;
  const bands: Record<Wall, number[]> = { front: [], back: [], left: [], right: [] };
  for (const w of ['front', 'back', 'left', 'right'] as Wall[]) {
    bands[w].push(band(w, 0, cGrade, true));
    if (w === 'front') {
      bands[w].push(band(w, cGrade, cSlit, false));
      bands[w].push(band(w, cSlit, cSlit + 1, false, (a, b) => a[0] < 0 || b[0] < 0));
      bands[w].push(band(w, cSlit, cSlit + 1, false, (a, b) => a[0] > 0 && b[0] > 0));
      bands[w].push(band(w, cSlit + 1, nC, false));
    } else if (w === 'back') {
      bands[w].push(band(w, cGrade, nC, false, (a, b) => a[0] < 0 && b[0] <= 0.01));
      bands[w].push(band(w, cGrade, nC, false, (a, b) => a[0] >= -0.01 && b[0] > 0 && !(a[0] < 0)));
      bands[w].push(band(w, cGrade, nC, false, (a, b) => a[0] < 0 && b[0] > 0));
    } else {
      const mid = Math.floor((cGrade + nC) / 2);
      bands[w].push(band(w, cGrade, mid, false));
      bands[w].push(band(w, mid, nC, false));
    }
  }
  for (const w of ['front', 'back', 'left', 'right'] as Wall[]) bands[w] = bands[w].filter((i) => i >= 0);
  // the slit's dark, inside the front wall, on the front's lowest band above the buried course
  // (drawn into the band under the slit, so it falls with it)
  // the doorway: its posts and lintel, the bags at the threshold
  const posts: number[] = [];
  for (const x of [-0.62, 0.62]) {
    F.begin({ role: 'frame', material: 'timber', face: 'back', axes: AX, volume: vol(0.095, 1.95) });
    roundLog(m, [x, -0.04, -Z - 0.17], [x, doorTop, -Z - 0.17], 0.095, 0.95, T, seedOf(91 + (x > 0 ? 1 : 0)));
    posts.push(F.end());
  }
  F.begin({ role: 'frame', material: 'timber', face: 'back', axes: AX, volume: vol(0.11, 1.8), scoreAxis: 0, scores: [0] });
  roundLog(m, [-0.9, doorTop + 0.11, -Z - 0.18], [0.9, doorTop + 0.11, -Z - 0.18], 0.105, 0.94, T, seedOf(93));
  const lintel = F.end();
  const bags: number[] = [];
  const brng = mulberry32(O.seed + 17);
  const bagFoot: number[] = [];
  for (const x of [-1.0, 1.0]) {
    F.begin({ role: 'bag', material: 'canvas', face: 'back', axes: AX, volume: 0.03 });
    const v0 = m.p.length;
    placeBag(m, brng, x, GRADE + 0.1, -Z - 0.5, 0, T.bag, 0);
    let foot = Infinity;
    for (let i = v0 + 1; i < m.p.length; i += 3) foot = Math.min(foot, m.p[i]);
    bagFoot.push(foot);
    bags.push(F.end());
  }
  // the roof: sixteen logs front to back on the wall tops, their ends out over the slit unevenly
  const roof: number[] = [];
  let roofTop = 0;
  // (each its own girth, laid side by side across the span with the slack between them shared out unevenly)
  const radii = Array.from({ length: 16 }, () => 0.104 + rng() * 0.058);
  const span = LOG_W - 0.1, need = radii.reduce((t, r) => t + 2 * r, 0) + 15 * 0.006;
  if (need > span) for (let i = 0; i < 16; i++) radii[i] *= (span - 15 * 0.006) / (need - 15 * 0.006);
  const slack = Math.max(0, span - radii.reduce((t, r) => t + 2 * r, 0) - 15 * 0.006);
  const shares = Array.from({ length: 15 }, () => 0.3 + rng());
  const shareSum = shares.reduce((t, v) => t + v, 0);
  let cursor = -span / 2;
  for (let i = 0; i < 16; i++) {
    const r = radii[i];
    const x = cursor + r;
    cursor = x + r + 0.006 + (i < 15 ? (slack * shares[i]) / shareSum : 0);
    const y = wallTop + r;
    const zb = -Z - 0.18 - rng() * 0.22, zf = rng() < 0.18 ? Z + 0.04 + rng() * 0.08 : Z + 0.12 + Math.pow(rng(), 0.7) * 0.5;
    const s1 = (rng() - 0.5) * 0.5 - 0.7, s2 = (rng() - 0.5) * 0.5 + 0.8;
    F.begin({ role: 'rafter', material: 'timber', face: 'roof', axes: { o: [0, 0, 0], x: [0, 0, 1], y: [0, 1, 0], z: [-1, 0, 0] },
      volume: vol(r, zf - zb), scoreAxis: 0, scores: [s1, s2] });
    roundLog(m, [x, y, zb], [x, y, zf], r, 0.94 + rng() * 0.05, T, seedOf(200 + i));
    roof.push(F.end());
    roofTop = Math.max(roofTop, y + r);
  }
  // the earth over it: heaped behind and down the flanks to the bank, thin at the brow over the log ends; laid in four
  // closed solids whose boxes stand clear of the walls: the two halves over the roof (resting on its logs) and the two
  // flanks heaped against the side walls outside them (their ends tapering to the bank short of the corners, where the
  // corner logs show)
  const field = pillboxBankField('logearth', T, O.seed);
  const bankAt = (x: number, z: number): number => { const h = field.lift(x, z); return Number.isNaN(h) ? roofTop : Math.max(GRADE, h); };
  const XE = X + 1.25, Z0 = -Z - 0.12, Z1 = Z + 0.1, XR = X + 0.16, XF = X + 0.19, ZF = Z - 0.2;
  const topAt = (x: number, z: number): number => {
    const tx = Math.abs(x) / XE;
    const front = smooth(Z - 0.6, Z1, z), back = smooth(-Z + 0.3, Z0, z);
    const crown = 0.5 * (1 - Math.pow(Math.min(1, tx / 0.7), 2.2)) * (1 - 0.78 * front) * (1 - 0.5 * back);
    // (level out to the walls' outer faces, so the flanks rise to the roof's earth, then down to the bank)
    const side = smooth(0.72, 1.0, tx);
    const lumps = (fbm(x, 0, z, 0.8, O.seed + 41) - 0.5) * 0.13 + (vnoise(x, 0, z, 0.3, O.seed + 43) - 0.5) * 0.05
      + smooth(0.74, 0.9, vnoise(x * 3, 1, z * 3, 0.5, O.seed + 45)) * 0.05;
    const y = roofTop + 0.12 + crown + lumps * (1 - side * 0.7);
    return y * (1 - side) + (bankAt(x, z) + 0.04) * side;
  };
  const turf: Shade = (p, n) => {
    const big = fbm(p[0], 0, p[2], 1.1, O.seed + 5), mid = fbm(p[0] + 3.7, 0, p[2] - 1.9, 0.45, O.seed + 6), fine = vnoise(p[0], 0, p[2], 0.12, O.seed + 7);
    let c = mix(T.turf, T.crest, smooth(0.42, 0.75, big));
    c = mix(c, mul(T.turf, 0.6), smooth(0.66, 0.84, mid) * (T.arid ? 0 : 0.55));
    c = mix(c, mul(T.earth, 0.9), smooth(0.68, 0.84, fbm(p[0], 3, p[2], 0.5, O.seed + 9)) * 0.85);
    const steep = clamp01((1 - n[1]) * 2.2);
    c = mix(c, mul(T.earth, 0.85), steep * (T.arid ? 0.8 : 0.6));
    if (T.arid) c = mix(c, T.earth, 0.55);
    return mul(c, 0.78 + fine * 0.36);
  };
  const soil: Shade = (p) => mul(T.earth, 0.55 + vnoise(p[0] * 3, p[1] * 3, p[2] * 3, 0.3, O.seed + 13) * 0.3);
  /** One closed solid of the cover over [x0, x1] x [z0, z1]: its top (turf, its grass), its bottom, its faces. */
  const coverPiece = (x0: number, x1: number, z0: number, z1: number, nx: number, nz: number,
    top: (x: number, z: number) => number, bot: (x: number, z: number, t: number) => number, lip = 0): number => {
    const gx = (i: number): number => x0 + (i * (x1 - x0)) / nx, gz = (j: number): number => z0 + (j * (z1 - z0)) / nz;
    const ty: number[][] = [], by: number[][] = [];
    for (let j = 0; j <= nz; j++) {
      ty.push([]); by.push([]);
      for (let i = 0; i <= nx; i++) { const t = top(gx(i), gz(j)); ty[j].push(t); by[j].push(Math.min(t - 0.05, bot(gx(i), gz(j), t))); }
    }
    const P = (i: number, j: number, up: boolean): V3 => [gx(i), up ? ty[j][i] : by[j][i], gz(j)];
    const nAt = (i: number, j: number): V3 => {
      const il = Math.max(0, i - 1), ir = Math.min(nx, i + 1), jl = Math.max(0, j - 1), jr = Math.min(nz, j + 1);
      const dx = (ty[j][ir] - ty[j][il]) / (gx(ir) - gx(il)), dz = (ty[jr][i] - ty[jl][i]) / (gz(jr) - gz(jl));
      return norm([-dx, 1, -dz]);
    };
    const rimFace: Shade = (p, n) => {
      const i = Math.max(0, Math.min(nx, Math.round(((p[0] - x0) / (x1 - x0)) * nx))), j = Math.max(0, Math.min(nz, Math.round(((p[2] - z0) / (z1 - z0)) * nz)));
      return ty[j][i] - p[1] < 0.07 ? mul(turf(p, [0, 1, 0]), 0.82) : soil(p, n);
    };
    let volume = 0;
    F.begin({ role: 'roof', material: 'earth', face: 'roof', axes: AX, volume: 0.1 });
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      m.triN(P(i, j, true), nAt(i, j), P(i, j + 1, true), nAt(i, j + 1), P(i + 1, j + 1, true), nAt(i + 1, j + 1), turf);
      m.triN(P(i, j, true), nAt(i, j), P(i + 1, j + 1, true), nAt(i + 1, j + 1), P(i + 1, j, true), nAt(i + 1, j), turf);
      m.quad(P(i, j, false), P(i + 1, j, false), P(i + 1, j + 1, false), P(i, j + 1, false), soil, false, [0, -1, 0]);
      volume += (ty[j][i] - by[j][i]) * (gx(1) - gx(0)) * (gz(1) - gz(0));
    }
    const edge = (ia: number, ja: number, ib: number, jb: number, out: V3): void => {
      m.quad(P(ia, ja, true), P(ib, jb, true), P(ib, jb, false), P(ia, ja, false), rimFace, false, undefined, out);
    };
    for (let i = 0; i < nx; i++) { edge(i, 0, i + 1, 0, [0, 0, -1]); edge(i + 1, nz, i, nz, [0, 0, 1]); }
    for (let j = 0; j < nz; j++) { edge(0, j + 1, 0, j, [-1, 0, 0]); edge(nx, j, nx, j + 1, [1, 0, 0]); }
    if (lip) {
      // (r2 sweep, 2026-10-16: a flank's earth stood 3 cm off its side wall, held by nothing where the ground falls from
      // the seat past the bank's toe; Delta's right flank hung 3 cm over it) its inner face pressed on in against the
      // logs, the earth's own section carried `lip` metres toward the wall at the heights it has there (welded on, so the
      // heap and its collision solid keep their plan's outline and heights), the wall carrying it
      const ie = lip < 0 ? 0 : nx, out: V3 = [Math.sign(lip), 0, 0];
      const Q = (j: number, up: boolean): V3 => { const p = P(ie, j, up); return [p[0] + lip, p[1], p[2]]; };
      for (let j = 0; j < nz; j++) {
        m.quad(Q(j, true), Q(j + 1, true), Q(j + 1, false), Q(j, false), rimFace, false, undefined, out);
        m.quad(P(ie, j, true), P(ie, j + 1, true), Q(j + 1, true), Q(j, true), (p) => mul(turf(p, [0, 1, 0]), 0.82), false, undefined, [0, 1, 0]);
        m.quad(P(ie, j, false), P(ie, j + 1, false), Q(j + 1, false), Q(j, false), soil, false, undefined, [0, -1, 0]);
      }
      for (const [j, dz] of [[0, -1], [nz, 1]] as const) m.quad(P(ie, j, true), Q(j, true), Q(j, false), P(ie, j, false), soil, false, undefined, [0, 0, dz]);
    }
    // clumps of grass in it (none on bare regolith, few and dry on an arid map)
    const clumps = T.barren ? 0 : Math.round((T.arid ? 0.25 : 1) * (x1 - x0) * (z1 - z0) * 1.6);
    for (let k = 0; k < clumps; k++) {
      const fi = 0.3 + hash3(k, x0 * 10, z0 * 10, O.seed) * (nx - 0.6), fj = 0.3 + hash3(k, z0 * 10, x0 * 10 + 7, O.seed) * (nz - 0.6);
      const ii = Math.floor(fi), jj = Math.floor(fj), tx = fi - ii, tz = fj - jj;
      const y = (ty[jj][ii] * (1 - tx) + ty[jj][ii + 1] * tx) * (1 - tz) + (ty[jj + 1][ii] * (1 - tx) + ty[jj + 1][ii + 1] * tx) * tz;
      grassClump(m, gx(0) + fi * (gx(1) - gx(0)), y - 0.015, gz(0) + fj * (gz(1) - gz(0)), 0.13 + hash3(k, 5, x0 * 10, O.seed) * 0.13, T,
        (O.seed + k * 31 + Math.round(x0 * 100) * 7 + Math.round(z0 * 100) * 3) >>> 0);
    }
    const idx = F.end();
    F.pieces[idx].massKg = Math.max(1, Math.round(volume * 1600 * 10) / 10);
    return idx;
  };
  const overRoof = (x: number, z: number): number => Math.max(roofTop + 0.07, topAt(x, z));
  const flankTop = (x: number, z: number): number => {
    const end = smooth(ZF - 0.65, ZF, Math.abs(z));
    return topAt(x, z) * (1 - end) + (bankAt(x, z) + 0.03) * end;
  };
  const flankBot = (x: number, z: number, t: number): number => Math.max(bankAt(x, z) - 0.08, t - 0.42);
  const cover = [
    coverPiece(-XR, 0, Z0, Z1, 9, 14, overRoof, () => roofTop - 0.02),
    coverPiece(0, XR, Z0, Z1, 9, 14, overRoof, () => roofTop - 0.02),
    coverPiece(-XE, -XF, -ZF, ZF, 6, 13, flankTop, flankBot, 0.05),
    coverPiece(XF, XE, -ZF, ZF, 6, 13, flankTop, flankBot, -0.05),
  ];
  // the brow's sods: cut turf stacked on the log ends to hold the earth, in two runs
  const sods: number[] = [];
  for (const side of [-1, 1]) {
    F.begin({ role: 'bag', material: 'earth', face: 'front', axes: AX, volume: 0.05 });
    for (let k = 0; k < 6; k++) {
      const w = 0.32 + rng() * 0.12, x = side * (0.25 + k * 0.38 + (rng() - 0.5) * 0.04);
      if (Math.abs(x) + w / 2 > X + 0.1) continue;
      const zc = Z1 + 0.14 + (rng() - 0.5) * 0.04, h = 0.11 + rng() * 0.05, dd = 0.24 + rng() * 0.06;
      const sodTop: Shade = (p) => mul(mix(T.turf, T.crest, vnoise(p[0] * 4, 0, p[2] * 4, 0.3, O.seed + 61)), 0.72 + vnoise(p[0] * 9, 0, p[2] * 9, 0.2, 3) * 0.3);
      const sodSide: Shade = (p) => (p[1] > roofTop + h * 0.72 ? mul(T.turf, 0.55) : mul(T.earth, 0.5 + vnoise(p[0] * 6, p[1] * 6, p[2] * 6, 0.2, 5) * 0.3));
      const yaw = (rng() - 0.5) * 0.2, c = Math.cos(yaw), s = Math.sin(yaw);
      const at = (lx: number, ly: number, lz: number): V3 => [x + lx * c + lz * s, roofTop + ly, zc - lx * s + lz * c];
      const v = [at(-w / 2, 0, -dd / 2), at(w / 2, 0, -dd / 2), at(w / 2, 0, dd / 2), at(-w / 2, 0, dd / 2),
        at(-w / 2, h, -dd / 2), at(w / 2, h * (0.9 + rng() * 0.2), -dd / 2), at(w / 2, h, dd / 2), at(-w / 2, h * (0.9 + rng() * 0.2), dd / 2)];
      m.quad(v[4], v[5], v[6], v[7], sodTop, false, undefined, [0, 1, 0]);
      m.quad(v[3], v[2], v[6], v[7], sodSide, false, undefined, [0, 0, 1]);
      m.quad(v[0], v[1], v[5], v[4], sodSide, false, undefined, [0, 0, -1]);
      m.quad(v[1], v[2], v[6], v[5], sodSide, false, undefined, [1, 0, 0]);
      m.quad(v[0], v[3], v[7], v[4], sodSide, false, undefined, [-1, 0, 0]);
      m.quad(v[0], v[1], v[2], v[3], sodSide, false, undefined, [0, -1, 0]);
    }
    sods.push(F.end());
  }
  // the room's dark behind the slit and through the doorway (its own piece: it falls into the pit with the rest). Behind
  // the slit a blackened board on two stakes driven into the pit's floor (r2 sweep, 2026-10-16: it was a bare card hung
  // 0.67 m up in the room, a member touching nothing), its face where the card's was; the board's foot at the base's level
  // and the stakes 4 cm square, so the work's collision is the one it had (structureCollision: no solid under the band's
  // floor, a stake under the 25 cm2 a solid needs)
  F.begin({ role: 'fitting', material: 'earth', face: 'floor', axes: AX, volume: 0.01 });
  const blackout: Shade = () => [0.005, 0.005, 0.005];
  solid(m, 0, LOG_TOE_Y, Z - 0.33, 2 * LOG_SLIT_HW, slitHi + 0.04 - LOG_TOE_Y, 0.06, 0, blackout, false);
  for (const x of [-LOG_SLIT_HW + 0.12, LOG_SLIT_HW - 0.12]) solid(m, x, PIT - 0.02, Z - 0.33, 0.04, LOG_TOE_Y - 0.002 - (PIT - 0.02), 0.04, 0, blackout, false);
  m.quad([0.5, -0.1, -Z + 0.35], [-0.5, -0.1, -Z + 0.35], [-0.5, doorTop, -Z + 0.35], [0.5, doorTop, -Z + 0.35], () => [0.006, 0.006, 0.006], false, [0, 0, -1]);
  const room = F.end();
  // the threshold bags' beds of trodden spoil, their flanks under the ground (r2 sweep: Airfield's and Monsoon's right
  // bag stood 2-4 cm over the ground where it falls behind the work)
  const beds: number[] = [];
  [-1.0, 1.0].forEach((x, k) => {
    F.begin({ role: 'footing', material: 'earth', face: 'back', anchor: true, axes: AX, volume: 0.06 });
    spoilBed(m, x, -Z - 0.5, [0, 0, 1], 0.36, 0.25, GRADE - 0.3, T, (O.seed + (x > 0 ? 211 : 223)) >>> 0);
    tampedPad(m, x, -Z - 0.5, [0, 0, 1], 0.2, 0.11, bagFoot[k], T, (O.seed + (x > 0 ? 227 : 229)) >>> 0);
    beds.push(F.end());
  });
  // the links: each band on the one under it, the corners nailed, the roof on the walls' tops, the earth on the roof
  const [fBase, fLow, fSlitL, fSlitR, fUp] = bands.front.length === 5 ? bands.front : [bands.front[0], bands.front[1], -1, -1, bands.front[bands.front.length - 1]];
  F.link(fBase, floor, 'rest');
  F.link(fLow, fBase, 'rest');
  if (fSlitL >= 0) { F.link(fSlitL, fLow, 'rest'); F.link(fSlitR, fLow, 'rest'); F.link(fUp, fSlitL, 'rest'); F.link(fUp, fSlitR, 'rest'); }
  else F.link(fUp, fLow, 'rest');
  const bk = bands.back;
  F.link(bk[0], floor, 'rest');
  for (let k = 1; k < bk.length; k++) F.link(bk[k], bk[0], 'rest');
  if (bk.length >= 4) { F.link(bk[3], bk[1], 'rest'); F.link(bk[3], bk[2], 'rest'); }
  for (const w of ['left', 'right'] as Wall[]) {
    const b = bands[w];
    F.link(b[0], floor, 'rest');
    for (let k = 1; k < b.length; k++) F.link(b[k], b[k - 1], 'rest');
  }
  // (the corners: every band of a front or back wall nailed to every band of a flank it crosses at the corner, the
  // butted logs' boxes overlapping there)
  const aabb = (i: number): [number, number, number, number, number, number] => {
    const p = F.pieces[i];
    const sideways = p.face === 'left' || p.face === 'right';
    const hx = sideways ? p.h[2] : p.h[0], hz = sideways ? p.h[0] : p.h[2];
    return [p.c[0] - hx, p.c[0] + hx, p.c[1] - p.h[1], p.c[1] + p.h[1], p.c[2] - hz, p.c[2] + hz];
  };
  for (const a of [...bands.front, ...bands.back]) for (const c of [...bands.left, ...bands.right]) {
    const A = aabb(a), C = aabb(c);
    if (A[0] < C[1] && C[0] < A[1] && A[2] < C[3] && C[2] < A[3] && A[4] < C[5] && C[4] < A[5]) F.link(a, c, 'nail');
  }
  const topFront = bands.front[bands.front.length - 1], topBack = bands.back[bands.back.length - 1];
  for (const i of roof) { F.link(i, topFront, 'rest'); F.link(i, topBack, 'rest'); }
  roof.forEach((ri) => {
    const x = F.pieces[ri].c[0];
    if (x <= 0.2) F.link(cover[0], ri, 'rest');
    if (x >= -0.2) F.link(cover[1], ri, 'rest');
  });
  F.link(cover[2], cover[0], 'rest'); F.link(cover[3], cover[1], 'rest');
  for (const b of bands.left) F.link(cover[2], b, 'rest');
  for (const b of bands.right) F.link(cover[3], b, 'rest');
  for (const sd of sods) for (const ri of roof) { if (F.pieces[sd].c[0] * F.pieces[ri].c[0] >= 0) F.link(sd, ri, 'rest'); }
  // (the earth heaped down the flanks rests against the walls it covers: linked where their boxes meet)
  const box = (i: number): [number, number, number, number, number, number] => {
    const p = F.pieces[i];
    const sideways = p.face === 'left' || p.face === 'right' || p.role === 'rafter';
    const hx = sideways ? p.h[2] : p.h[0], hz = sideways ? p.h[0] : p.h[2];
    return [p.c[0] - hx, p.c[0] + hx, p.c[1] - p.h[1], p.c[1] + p.h[1], p.c[2] - hz, p.c[2] + hz];
  };
  const meets = (a: number, b: number): boolean => {
    const A = box(a), C = box(b);
    return A[0] < C[1] && C[0] < A[1] && A[2] < C[3] && C[2] < A[3] && A[4] < C[5] && C[4] < A[5];
  };
  for (const ci of cover) for (const w of ['front', 'back', 'left', 'right'] as Wall[]) for (const b of bands[w]) if (meets(ci, b)) F.link(ci, b, 'rest');
  for (const ci of cover) for (const other of [...sods, ...posts, lintel]) if (meets(ci, other)) F.link(ci, other, 'rest');
  for (const p of posts) { F.link(p, floor, 'rest'); for (const b of bands.back) F.link(p, b, 'nail'); }
  F.link(lintel, posts[0], 'rest'); F.link(lintel, posts[1], 'rest');
  for (const b of bands.back) if (meets(lintel, b)) F.link(lintel, b, 'nail');
  for (const b of bags) F.link(b, floor, 'rest');
  bags.forEach((b, k) => F.link(b, beds[k], 'rest'));
  // (the beds' flanks run in under the doorway's posts and the rear wall's feet: those rest on them where they meet)
  for (const bd of beds) for (const other of [...posts, ...bands.back]) if (meets(bd, other)) F.link(other, bd, 'rest');
  F.link(room, floor, 'rest');
  const g = m.geometry();
  g.userData.fracture = F.anatomy('bunker');
  return g;
}

/**
 * A log's broken end where it snaps at a score (the core calls it once per kind per map and caches the halves): two
 * runs, the − half's end facing + first; each a splintered round end, slivers out along the grain from a torn middle,
 * fresh wood inside, darker at its rim. A roof log and a door's lintel snap; walls' bands go whole.
 */
export function logFractureEdge(material: FractureMaterial, piece: FracturePiece, score: number | 'whole', seed: number,
  out: DamageMeshWriter): void {
  if (score === 'whole' || material !== 'timber' || (piece.role !== 'rafter' && piece.role !== 'frame')) return;
  const axis = piece.scoreAxis ?? 0;
  const rot = (v: V3): V3 => {
    const [x, y, z, w] = piece.q;
    const tt: V3 = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
    return [v[0] + w * tt[0] + (y * tt[2] - z * tt[1]), v[1] + w * tt[1] + (z * tt[0] - x * tt[2]), v[2] + w * tt[2] + (x * tt[1] - y * tt[0])];
  };
  const unit = (k: number): V3 => rot(k === 0 ? [1, 0, 0] : k === 1 ? [0, 1, 0] : [0, 0, 1]);
  const A = unit(axis), U = unit((axis + 1) % 3), V = unit((axis + 2) % 3);
  const R = Math.min(piece.h[(axis + 1) % 3], piece.h[(axis + 2) % 3]) * 0.95;
  const base = add([piece.c[0], piece.c[1], piece.c[2]], scl(A, score));
  let state = seed >>> 0;
  const rnd = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const fresh: Rgb = [0.5, 0.38, 0.24], rim: Rgb = [0.22, 0.16, 0.1];
  const N = 10;
  for (const side of [1, -1] as const) {
    if (!out.begin(piece.bucket, 'rim')) return;
    const centre = out.vertex(...add(base, scl(A, side * R * (0.3 + rnd() * 0.5))), A[0] * side, A[1] * side, A[2] * side,
      FLAT_UV[0], FLAT_UV[1], fresh[0] / FORT_PRINT_MEAN, fresh[1] / FORT_PRINT_MEAN, fresh[2] / FORT_PRINT_MEAN);
    const ring: number[] = [];
    for (let k = 0; k < N; k++) {
      const ph = (k / N) * Math.PI * 2, sliver = k % 2 ? R * (0.4 + rnd() * 1.1) : R * rnd() * 0.3;
      const p = add(add(add(base, scl(U, Math.cos(ph) * R)), scl(V, Math.sin(ph) * R)), scl(A, side * sliver));
      const c = k % 2 ? fresh : rim;
      ring.push(out.vertex(p[0], p[1], p[2], A[0] * side, A[1] * side, A[2] * side, FLAT_UV[0], FLAT_UV[1],
        c[0] / FORT_PRINT_MEAN, c[1] / FORT_PRINT_MEAN, c[2] / FORT_PRINT_MEAN));
    }
    for (let k = 0; k < N; k++) {
      const a = ring[k], b = ring[(k + 1) % N];
      if (side > 0) out.triangle(centre, a, b); else out.triangle(centre, b, a);
    }
    out.end();
  }
}

/**
 * The destroyed log-and-earth work for the broken pool (round 2; wave 370: "a smooth green hump with a neat pit holding
 * a few logs ... the destroyed log-and-earth bunker reads as clean stone panels next to an untouched cushion"), settled
 * from its own pieces (fractureSettle.ts) in its low bank: the floor and the buried courses stand; the roof's logs snap
 * at their scores and fall into the pit together, splintered; the earth comes down on them in its four sections, tipped
 * and slumped into the hole; the walls' bands spill out and in, the doorway's posts go over, the sods and the bags are
 * thrown; the dug spoil and clods round the crater. No collider: the wreck lies about as high as the old roof.
 */
function buildLogEarthWreck(O: BuildOpts): THREE.BufferGeometry {
  const intact = buildLogEarthPieces({ ...O, broken: false });
  const anatomy = intact.userData.fracture as KitFractureAnatomy;
  const field = pillboxBankField('logearth', O.tones, O.seed);
  const S = new FractureSettle(intact, anatomy, {
    cell: 0.1, margin: 3, dust: 0.82,
    ground: (x, z) => { const h = field.lift(x, z); return Number.isNaN(h) ? PIT : Math.max(GRADE, h); },
  });
  const rng = mulberry32((O.seed ^ 0x2f17c) >>> 0);
  const r = (lo: number, hi: number): number => lo + (hi - lo) * rng();
  const T = O.tones;
  const P = anatomy.pieces;
  const idx = P.map((_, i) => i);
  const az = rng() * Math.PI * 2;
  const blow: V3 = [Math.cos(az), 0, Math.sin(az)];
  const flat = (v: V3): V3 => norm([v[0], 0, v[2]]);
  // 1. the floor and the buried courses; the room's dark goes (it was the room); the earth cover is laid below as the
  // loose soil it falls as, not as its sections
  for (const i of idx) if (P[i].anchor) S.stay(i, 0.86);
  for (const i of idx) if (P[i].role === 'fitting' || P[i].role === 'roof') S.omit(i);
  {
    // the earth slumped into the hole and over its walls' feet: a heap of loose soil, lumpy, torn turf on its crown
    const hm = new Mesh();
    const soilS: Shade = (q, n) => {
      const turfy = smooth(0.55, 0.75, fbm(q[0], 0, q[2], 0.7, O.seed + 71)) * clamp01(n[1] * 1.4 - 0.3);
      return mul(mix(mul(T.earth, 0.85), mix(T.turf, T.crest, 0.4), turfy * (T.arid ? 0.25 : 0.7)), 0.7 + vnoise(q[0] * 2, 0, q[2] * 2, 0.3, O.seed + 73) * 0.4);
    };
    const NX = 20, NZ = 17, X0 = -LOG_W / 2 - 0.9, X1 = LOG_W / 2 + 0.9, Z0 = -LOG_D / 2 - 0.9, Z1 = LOG_D / 2 + 0.9;
    const hgt = (x: number, z: number): number => {
      const tx = Math.abs(x) / (LOG_W / 2 + 0.9), tz = Math.abs(z) / (LOG_D / 2 + 0.9), t = Math.max(tx, tz * 1.05);
      const dome = 0.62 * Math.pow(Math.max(0, 1 - t * t), 1.3);
      const lumps = (fbm(x, 0, z, 0.7, O.seed + 75) - 0.5) * 0.22 + (vnoise(x * 2, 0, z * 2, 0.3, O.seed + 77) - 0.5) * 0.08;
      const ground = (() => { const h = field.lift(x, z); return Number.isNaN(h) ? PIT : Math.max(GRADE, h); })();
      return Math.max(ground - 0.04, (t < 1 ? GRADE + dome + lumps * (1 - t) : ground - 0.04));
    };
    const at = (i: number, j: number): V3 => { const x = X0 + (i * (X1 - X0)) / NX, z = Z0 + (j * (Z1 - Z0)) / NZ; return [x, hgt(x, z), z]; };
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      hm.tri(a, d, c, soilS, false, undefined, [0, 1, 0]);
      hm.tri(a, c, b, soilS, false, undefined, [0, 1, 0]);
    }
    S.extra({ p: hm.p, n: hm.n, t: hm.t, c: hm.c }, 0.95);
  }
  // 2. the roof's logs snapped and down into the pit together
  const roof = idx.filter((i) => P[i].role === 'rafter');
  S.together(() => {
    for (const i of roof) {
      for (const b of S.snap(i, logFractureEdge, undefined, O.seed ^ (i * 61))) {
        const ax = b.axes[0], toward = scl(flat(b.centre), -1);
        S.lie(b, Math.atan2(ax[2], ax[0]) + r(-0.6, 0.6), [toward[0] * r(0.1, 0.6) + blow[0] * r(0, 0.3), 0, toward[2] * r(0.1, 0.6) + blow[2] * r(0, 0.3)],
          false, r(0, Math.PI), { maxTilt: 0.9, sink: r(0.03, 0.11) });
      }
    }
  });
  // 4. the walls' logs spill each its own way: out over the bank mostly, in where the blow struck, a few kept in
  // their course where they lie low
  for (const i of idx) {
    if (S.isLaid(i) || P[i].role !== 'wall') continue;
    const out = flat(P[i].c as V3);
    const struck = dot3(out, blow) < -0.3;
    for (const b of S.scatter(i)) {
      if (b.centre[1] < 0.35 && rng() < 0.55) { S.fix(b, undefined, 0.86); continue; }
      const inward = struck ? rng() < 0.65 : rng() < 0.2;
      const ax = b.axes[0], along = Math.atan2(ax[2], ax[0]);
      const d = inward ? r(0.3, 1.4) : r(0.4, 2.0), dir = inward ? -1 : 1;
      S.lie(b, along + r(-0.45, 0.45), [out[0] * d * dir + r(-0.3, 0.3), 0, out[2] * d * dir + r(-0.3, 0.3)], false, r(0, Math.PI),
        { maxTilt: 0.8, ceiling: 1.4, sink: r(0.01, 0.06) });
    }
  }
  // 5. the doorway's posts over, its lintel down, the sods and bags thrown, the room's dark into the pit
  for (const i of idx) {
    if (S.isLaid(i)) continue;
    const p = P[i], out = flat(p.c as V3);
    if (p.role === 'frame' && p.h[1] > 0.5) S.lie(S.body([i]), r(0, Math.PI * 2), [out[0] * r(0.4, 1.3), 0, out[2] * r(0.4, 1.3)], false, r(0, 3), { ceiling: 1.2 });
    else if (p.role === 'frame') { for (const b of S.snap(i, logFractureEdge, undefined, O.seed ^ (i * 67))) S.lie(b, r(0, Math.PI * 2), [out[0] * r(0.3, 1), 0, out[2] * r(0.3, 1)], false, r(0, 3), { ceiling: 1.3 }); }
    else if (p.role === 'bag' && p.material === 'earth') {
      for (const b of S.scatter(i)) S.lie(b, r(0, Math.PI * 2), [out[0] * r(0.2, 1.4) + r(-0.5, 0.5), 0, out[2] * r(0.2, 1.4) + r(-0.5, 0.5)], rng() < 0.3, r(-0.4, 0.4), { ceiling: 1.3 });
    } else if (p.role === 'bag') S.lie(S.body([i]), r(0, Math.PI * 2), [out[0] * r(0.3, 1.5), 0, out[2] * r(0.3, 1.5)], false, r(-0.3, 0.3), { ceiling: 1.0 });
    else S.drop(S.body([i]), 0, [0, 0, 0], { maxTilt: 1.5 });
  }
  // 6. the spoil round the crater: clods and torn turf, a few splinters
  const m = new Mesh();
  const clod: Shade = (q) => mul(T.earth, 0.6 + vnoise(q[0], q[1], q[2], 0.2, O.seed + 181) * 0.45);
  const turfBit: Shade = (q) => mul(mix(T.turf, T.crest, vnoise(q[0] * 3, 0, q[2] * 3, 0.3, O.seed + 183)), 0.7 + vnoise(q[0] * 9, 0, q[2] * 9, 0.2, 2) * 0.3);
  const ext = Math.hypot(LOG_W / 2, LOG_D / 2);
  for (let k = 0; k < 34; k++) {
    const a = r(0, Math.PI * 2), rr = ext * r(0.85, 1.25) + Math.max(0, Math.cos(a) * blow[0] + Math.sin(a) * blow[2]) * r(0, 1.6);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr, s = 0.1 + rng() * 0.25;
    lump(m, x, S.heightAt(x, z) + s * 0.1, z, s * 1.5, s * 0.55, s, rng, k % 4 === 0 ? turfBit : clod, false, r(0, Math.PI), 0.5);
  }
  const splinter: Shade = (q) => mul(mix(T.timber, [0.55, 0.45, 0.3], 0.5), 0.8 + vnoise(q[0] * 9, q[1] * 9, q[2] * 9, 0.2, O.seed + 29) * 0.4);
  for (let k = 0; k < 14; k++) {
    const a = r(0, Math.PI * 2), rr = ext * r(0.3, 1.3), x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = S.heightAt(x, z) + 0.03;
    const d = r(0, Math.PI), l = r(0.15, 0.5);
    bar(m, [x, y, z], [x + Math.cos(d) * l, y + r(0, 0.12), z + Math.sin(d) * l], splinter, 0.018 + rng() * 0.015);
  }
  S.extra({ p: m.p, n: m.n, t: m.t, c: m.c }, 1);
  intact.dispose();
  return S.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// the pieces (round 2, the destructible-buildings lane: the destruction core's fracture contract, fractureAnatomy.ts;
// the owner, 2026-10-10: "the destruction of buildings needs to be a lot better too, rn its way to sporadic and ugly
// instead of behaving like it would with physics")
//
// The intact concrete work is drawn as the pieces a blow takes it apart into: per wall the stub a breach leaves
// standing (an anchor, as tall as the destroyed state's razed walls) and above it the wall's lift with its embrasures;
// the door between its jambs' lifts under its lintel, the steel leaf in the gap (a piece in a hole would have its box
// round the hole's); the corners as blocks squared to both their walls (the casemate's and the DOT's walls meet at
// right angles; their chamfers and splayed faces lie inside the blocks); the slab in four plates with the roof's earth
// and turf on each; the blast wall's stub and its upper lift; every sandbag; the floor. Every piece is closed (its
// inner face, top and bottom, the cut faces in the broken concrete's fresh grey), so a piece that falls is concrete
// all round. The boxes start apart, save the hexagon's corners (two walls meeting at 120 degrees cannot both be squared
// to a box: their cast joints overlap by the mitre, linked).

type Quat = [number, number, number, number];
interface BoxAxes { o: V3; x: V3; y: V3; z: V3 }
const AX: BoxAxes = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** The broken walls' stub: what a breach leaves standing (an anchor; its top ragged in the destroyed state). */
const STUB_TOP = 0.45;
const FORT_REBAR = { pitchM: 0.2, diaM: 0.016 } as const;
const FORT_DENSITY: Partial<Record<FractureMaterial, number>> = { concrete: 2400, metal: 7850, earth: 1600, timber: 600, rubble: 1800 };

function quatOfAxes(f: BoxAxes): Quat {
  const m00 = f.x[0], m01 = f.y[0], m02 = f.z[0];
  const m10 = f.x[1], m11 = f.y[1], m12 = f.z[1];
  const m20 = f.x[2], m21 = f.y[2], m22 = f.z[2];
  const tr = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4;
  }
  const l = Math.hypot(x, y, z, w) || 1;
  return [x / l, y / l, z / l, w / l];
}
/** A wall edge's axes: x along it, y up, z out of the wall. */
function edgeAxes(o: V3, u: V3): BoxAxes { return { o, x: u, y: [0, 1, 0], z: norm(cross(u, [0, 1, 0])) }; }

interface FortPieceSpec {
  role: FractureRole;
  material: FractureMaterial;
  face?: FractureFace;
  anchor?: boolean;
  axes: BoxAxes;
  scoreAxis?: 0 | 1 | 2;
  /** coordinates along scoreAxis in the axes' frame */
  scores?: readonly number[];
  rebar?: boolean;
  /** m3: the mass is this at the material's density */
  volume: number;
}

/** The anatomy's recorder over a Mesh: a piece is the triangles written between begin and end. */
class FortPieces {
  readonly pieces: FracturePiece[] = [];
  readonly links: FractureLink[] = [];
  private open: { spec: FortPieceSpec; tri0: number } | null = null;
  readonly m: Mesh;
  constructor(m: Mesh) { this.m = m; }
  begin(spec: FortPieceSpec): number {
    if (this.open) throw new Error('fortKit: piece begun inside another');
    this.open = { spec, tri0: this.m.p.length / 9 };
    return this.pieces.length;
  }
  end(): number {
    const o = this.open;
    if (!o) throw new Error('fortKit: piece ended without a begin');
    this.open = null;
    const tri1 = this.m.p.length / 9, P = this.m.p, ax = o.spec.axes;
    if (tri1 <= o.tri0) throw new Error(`fortKit: empty ${o.spec.role} piece`);
    const axes = [ax.x, ax.y, ax.z];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = o.tri0 * 9; i < tri1 * 9; i += 3) {
      const d: V3 = [P[i] - ax.o[0], P[i + 1] - ax.o[1], P[i + 2] - ax.o[2]];
      for (let k = 0; k < 3; k++) {
        const s = dot3(d, axes[k]);
        if (s < lo[k]) lo[k] = s;
        if (s > hi[k]) hi[k] = s;
      }
    }
    const mid = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2), h = [0, 1, 2].map((k) => (hi[k] - lo[k]) / 2 + 0.0002);
    const c: V3 = [0, 1, 2].map((j) => ax.o[j] + axes[0][j] * mid[0] + axes[1][j] * mid[1] + axes[2][j] * mid[2]) as V3;
    const axis = o.spec.scoreAxis ?? (h[0] >= h[1] && h[0] >= h[2] ? 0 : h[1] >= h[2] ? 1 : 2);
    const scores = (o.spec.scores ?? []).map((s) => s - mid[axis]).filter((s) => Math.abs(s) < h[axis] - 0.06)
      .sort((a, b) => a - b).slice(0, 6).map((s) => Math.round(s * 1000) / 1000);
    const r = (v: number): number => Math.round(v * 10000) / 10000;
    this.pieces.push({
      role: o.spec.role, material: o.spec.material, bucket: 'fortConcrete', tri0: o.tri0, triN: tri1 - o.tri0,
      c: c.map(r) as unknown as V3, h: h.map(r) as unknown as V3, q: quatOfAxes(ax),
      massKg: Math.max(1, Math.round(o.spec.volume * (FORT_DENSITY[o.spec.material] ?? 2000) * 10) / 10),
      ...(o.spec.anchor ? { anchor: true as const } : {}),
      ...(o.spec.face ? { face: o.spec.face } : {}),
      ...(scores.length ? { scoreAxis: axis, scores } : {}),
      ...(o.spec.rebar ? { rebar: FORT_REBAR } : {}),
    });
    return this.pieces.length - 1;
  }
  link(a: number, b: number, kind: FractureLinkKind): void {
    if (a === b || a < 0 || b < 0) return;
    if (this.links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return;
    this.links.push({ a, b, kind });
  }
  /** Drops a begun piece that drew nothing (a wall band with no logs in it). */
  cancel(): void {
    if (this.open && this.m.p.length / 9 === this.open.tri0) this.open = null;
  }
  anatomy(kind: string): KitFractureAnatomy {
    if (this.open) throw new Error('fortKit: unfinished piece');
    // (the churned ground a pillbox's fall leaves: about its earthwork's crest)
    return { kind, pieces: this.pieces.slice(), links: this.links.slice(), groundScarM: 3.6 };
  }
}

/** A flat polygon (xz, either winding) at height y, facing up or down, ear-clipped (it may be concave). */
function capPolygon(m: Mesh, poly: Array<[number, number]>, y: number, shade: Shade, up: boolean, printed: boolean): void {
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length]; area += x0 * z1 - x1 * z0; }
  const idx = poly.map((_, i) => i);
  if (area < 0) idx.reverse();
  const P = (i: number): [number, number] => poly[i];
  const crossZ = (a: [number, number], b: [number, number], c: [number, number]): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p: [number, number], a: [number, number], b: [number, number], c: [number, number]): boolean =>
    crossZ(a, b, p) > 1e-9 && crossZ(b, c, p) > 1e-9 && crossZ(c, a, p) > 1e-9;
  const n: V3 = up ? [0, 1, 0] : [0, -1, 0];
  let guard = 0;
  while (idx.length > 3 && guard++ < 500) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const ia = idx[(k + idx.length - 1) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length];
      const a = P(ia), b = P(ib), c = P(ic);
      if (crossZ(a, b, c) <= 1e-9) continue;
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inside(P(j), a, b, c))) continue;
      m.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], shade, printed, n);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) { const [a, b, c] = idx.map(P); m.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], shade, printed, n); }
}

/** A wall face without the weather's grid (an inner or cut face: the same board print) from a along u, `w` wide, y0..y1,
 * facing `n`, `holes` cut out. */
function plainFace(m: Mesh, a: V3, u: V3, w: number, y0: number, y1: number, n: V3, holes: Opening[], shade: Shade): void {
  const ss = [0, w, ...holes.flatMap((h) => [h.s0, h.s1])].filter((s) => s >= 0 && s <= w).sort((p, q) => p - q);
  const ts = [y0, y1, ...holes.flatMap((h) => [h.t0, h.t1])].filter((t) => t >= y0 && t <= y1).sort((p, q) => p - q);
  const P = (s: number, t: number): V3 => [a[0] + u[0] * s, t, a[2] + u[2] * s];
  for (let i = 0; i + 1 < ss.length; i++) {
    const s0 = ss[i], s1 = ss[i + 1];
    if (s1 - s0 < 1e-5) continue;
    for (let j = 0; j + 1 < ts.length; j++) {
      const t0 = ts[j], t1 = ts[j + 1];
      if (t1 - t0 < 1e-5) continue;
      const sm = (s0 + s1) / 2, tm = (t0 + t1) / 2;
      if (holes.some((h) => sm > h.s0 && sm < h.s1 && tm > h.t0 && tm < h.t1)) continue;
      m.quad(P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1), shade, true, n);
    }
  }
}

/**
 * A straight wall block on a plan edge (outer line from `o` along `u`, its outward normal n = u x up): the outer
 * stretch s0..s1, the inner stretch i0..i1 (equal to it where the ends are square cuts; the inner corners where they are
 * mitred), y0..y1, `t` deep. Its outer face is the print and the weather with `openings` (edge coordinates) cut, its
 * inner face plain with `inner` holes, its top and bottom and two end faces closing it.
 */
function wallBlock(m: Mesh, o: V3, u: V3, s0: number, s1: number, i0: number, i1: number, y0: number, y1: number, t: number,
  openings: Opening[], inner: Opening[], out: Shade, inn: Shade, cut: Shade, ends: [Shade, Shade], top: Shade | null, bottom: Shade | null): void {
  const n = norm(cross(u, [0, 1, 0]));
  const P = (s: number, y: number, d: number): V3 => [o[0] + u[0] * s - n[0] * d, y, o[2] + u[2] * s - n[2] * d];
  wallFace(m, P(s0, 0, 0), u, s1 - s0, y0, () => y1, openings.map((op) => ({ s0: op.s0 - s0, s1: op.s1 - s0, t0: op.t0, t1: op.t1 })), out);
  plainFace(m, P(i1, 0, t), scl(u, -1), i1 - i0, y0, y1, scl(n, -1), inner.map((op) => ({ s0: i1 - op.s1, s1: i1 - op.s0, t0: op.t0, t1: op.t1 })), inn);
  const quadXZ = (a: V3, b: V3, c: V3, d: V3, y: number, shade: Shade, up: boolean) =>
    m.quad([a[0], y, a[2]], [b[0], y, b[2]], [c[0], y, c[2]], [d[0], y, d[2]], shade, true, up ? [0, 1, 0] : [0, -1, 0]);
  if (top) quadXZ(P(s0, 0, 0), P(s1, 0, 0), P(i1, 0, t), P(i0, 0, t), y1, top, true);
  if (bottom) quadXZ(P(s0, 0, 0), P(s1, 0, 0), P(i1, 0, t), P(i0, 0, t), y0, bottom, false);
  // the ends: from the outer end to the inner end (square or along the mitre)
  const endFace = (so: number, si: number, shade: Shade, hint: V3) =>
    m.quad(P(so, y0, 0), P(so, y1, 0), P(si, y1, t), P(si, y0, t), shade, true, undefined, hint);
  endFace(s0, i0, ends[0], scl(u, -1));
  endFace(s1, i1, ends[1], u);
  void cut;
}

/**
 * A corner block between two plan edges at right angles (and any short edges between them: a chamfer, a splayed face),
 * squared to the first: its region is the wall between the cut across the first edge at `outer[0]` and the cut across
 * the last at `outer[outer.length - 1]`, its outer chain `outer` (the cut points and the corners between), its inner
 * chain `inner` (the same run `t` in). Faces: the outer chain printed (its segments' openings cut), the inner chain
 * plain, the two cut faces, the top and the bottom.
 */
function cornerBlock(m: Mesh, outer: Array<[number, number]>, inner: Array<[number, number]>, y0: number, y1: number,
  openings: Opening[][], innerHoles: Opening[][], out: Shade, inn: Shade, cut: Shade, top: Shade | null, bottom: Shade | null): void {
  for (let i = 0; i + 1 < outer.length; i++) {
    const a = outer[i], b = outer[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-4) continue;
    const u: V3 = [(b[0] - a[0]) / len, 0, (b[1] - a[1]) / len];
    wallFace(m, [a[0], 0, a[1]], u, len, y0, () => y1, openings[i] ?? [], out);
  }
  for (let i = 0; i + 1 < inner.length; i++) {
    const a = inner[i], b = inner[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-4) continue;
    const u: V3 = [(b[0] - a[0]) / len, 0, (b[1] - a[1]) / len];
    // the inner chain runs the same way as the outer: its face looks in (against the outer's outward normal)
    const nIn: V3 = scl(norm(cross(u, [0, 1, 0])), -1);
    plainFace(m, [b[0], 0, b[1]], scl(u, -1), len, y0, y1, nIn,
      (innerHoles[i] ?? []).map((h) => ({ s0: len - h.s1, s1: len - h.s0, t0: h.t0, t1: h.t1 })), inn);
  }
  const o0 = outer[0], i0 = inner[0], o1 = outer[outer.length - 1], i1 = inner[inner.length - 1];
  const c0: V3 = [(o0[0] + i0[0]) / 2, 0, (o0[1] + i0[1]) / 2], c1: V3 = [(o1[0] + i1[0]) / 2, 0, (o1[1] + i1[1]) / 2];
  const mid: V3 = [(c0[0] + c1[0]) / 2, 0, (c0[2] + c1[2]) / 2];
  m.quad([o0[0], y0, o0[1]], [o0[0], y1, o0[1]], [i0[0], y1, i0[1]], [i0[0], y0, i0[1]], cut, true, undefined, sub(c0, mid));
  m.quad([o1[0], y0, o1[1]], [o1[0], y1, o1[1]], [i1[0], y1, i1[1]], [i1[0], y0, i1[1]], cut, true, undefined, sub(c1, mid));
  const ring = [...outer, ...inner.slice().reverse()];
  if (top) capPolygon(m, ring, y1, top, true, true);
  if (bottom) capPolygon(m, ring, y0, bottom, false, true);
}

/** The intersection of two lines (point + direction) in xz, or null when parallel. */
function meet(p: [number, number], d: [number, number], q: [number, number], e: [number, number]): [number, number] | null {
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
  return [p[0] + d[0] * t, p[1] + d[1] * t];
}

/** Clip a convex polygon (xz) to the half-plane a·x + b·z >= c (Sutherland-Hodgman). */
function clipHalf(poly: Array<[number, number]>, a: number, b: number, c: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const fp = a * p[0] + b * p[1] - c, fq = a * q[0] + b * q[1] - c;
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}

/** Clip a polygon of (point, normal) to the half-plane a·x + b·z >= 0 (the slab's quadrants). */
function clipPN(poly: Array<{ p: V3; n: V3 }>, a: number, b: number): Array<{ p: V3; n: V3 }> {
  const out: Array<{ p: V3; n: V3 }> = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length];
    const fp = a * P.p[0] + b * P.p[2], fq = a * Q.p[0] + b * Q.p[2];
    if (fp >= 0) out.push(P);
    if ((fp >= 0) !== (fq >= 0)) {
      const t = fp / (fp - fq);
      out.push({ p: add(P.p, scl(sub(Q.p, P.p), t)), n: norm(add(P.n, scl(sub(Q.n, P.n), t))) });
    }
  }
  return out;
}

/** The plan's inside `t` in (each edge's line moved in; convex plans, short edges may vanish), as a polygon. */
function insetPlan(plan: Plan, t: number): Array<[number, number]> {
  let poly: Array<[number, number]> = [[-20, -20], [20, -20], [20, 20], [-20, 20]];
  const k = plan.length;
  for (let i = 0; i < k; i++) {
    const a = plan[i], b = plan[(i + 1) % k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
    // inside: (p - a)·n <= -t, i.e. -n·p >= t - n·a
    poly = clipHalf(poly, -nx, -nz, t - (nx * a[0] + nz * a[1]));
  }
  return poly;
}

/**
 * The intact concrete work in pieces (regelbau, dot, hex): the same faces, prints and weather as the r1 build, every
 * piece closed. Returns the geometry with its anatomy on userData.fracture.
 */
function buildConcretePillboxPieces(style: 'regelbau' | 'dot' | 'hex', O: BuildOpts): THREE.BufferGeometry {
  const m = new Mesh();
  const F = new FortPieces(m);
  const T = O.tones;
  const L = concreteLayout(style);
  const { plan, wallTop, slab, overhang, slits, slitList, doorEdge, doorS } = L;
  const k = plan.length;
  const W: Weather = { tones: T, drip: wallTop, slits, grade: GRADE, seed: (O.seed * 31) ^ 0x51ab, burn: 0 };
  const conc = concreteShade(W);
  const reveal = revealShade(W, conc);
  const plateTone: Rgb = mix([0.05, 0.052, 0.055], [0.09, 0.05, 0.03], T.age * 0.6);
  const inner: Shade = (p) => mul(T.concrete, 0.3 + vnoise(p[0], p[1], p[2], 0.4, O.seed + 73) * 0.1);
  const cut: Shade = (p) => mix(T.concrete, [0.36, 0.34, 0.3], 0.5 + vnoise(p[0], p[1], p[2], 0.15, O.seed + 71) * 0.3);
  const doorW = 0.88, doorH = 1.66;
  const t = style === 'dot' ? 1.05 : 0.9;

  // ---- the plan's edges
  interface Edge { i: number; a: [number, number]; b: [number, number]; len: number; u: V3; n: V3; face: FractureFace }
  const edges: Edge[] = plan.map((a, i) => {
    const b = plan[(i + 1) % k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u: V3 = [(b[0] - a[0]) / len, 0, (b[1] - a[1]) / len], n: V3 = [-u[2], 0, u[0]];
    const role = edgeRole(n[0], n[2]);
    return { i, a, b, len, u, n, face: role === 'front' ? 'front' : role === 'rear' ? 'back' : n[0] > 0 ? 'right' : 'left' };
  });
  const slitsOf = (i: number) => slitList.filter((sl) => sl.edge === i);
  const outerOpening = (sl: ConcreteSlit): Opening => ({ s0: sl.s - sl.w / 2, s1: sl.s + sl.w / 2, t0: sl.y - sl.h / 2, t1: sl.y + sl.h / 2 });
  const throatOf = (sl: ConcreteSlit): { hw: number; hh: number } => ({ hw: sl.w / 2 - sl.steps * sl.w * 0.11, hh: sl.h / 2 - sl.steps * sl.h * 0.1 });
  /** The embrasures of an edge drawn into the open piece; the DOT's main one under its visor. */
  const drawSlits = (e: Edge, list: ConcreteSlit[]): void => {
    for (const sl of list) {
      const c: V3 = [e.a[0] + e.u[0] * sl.s, sl.y, e.a[1] + e.u[2] * sl.s];
      embrasure(m, c, e.u, sl.w, sl.h, sl.steps, sl.w * 0.11, sl.h * 0.1, 0.16, t, reveal, sl.plate ? plateTone : null, sl.w * 0.32, 0.1);
      if (style === 'dot' && sl.w > 1) {
        const vy = sl.y + sl.h / 2 + 0.03, depth = 0.18, vw = sl.w + 0.3;
        solid(m, c[0] + e.n[0] * depth / 2, vy, c[2] + e.n[2] * depth / 2, vw, 0.1, depth, Math.atan2(e.n[0], e.n[2]), conc, true);
      }
    }
  };
  /** An edge's throat holes in its inner face, in edge coordinates on the inner line (the outer s, the line is parallel). */
  const throatHoles = (list: ConcreteSlit[]): Opening[] => list.map((sl) => {
    const th = throatOf(sl);
    return { s0: sl.s - th.hw, s1: sl.s + th.hw, t0: sl.y - th.hh, t1: sl.y + th.hh };
  });
  const vol = (len: number, h: number) => len * h * t;

  // ---- the walls: [piece index] per span, for the links
  interface Span { edge: number; s0: number; s1: number; upper: number; stub: number }
  const spans: Span[] = [];
  const corners: Array<{ upper: number; stub: number; a: number; b: number }> = [];
  let lintel = -1, threshold = -1, doorLeft = -1, doorRight = -1;
  const door = doorEdge >= 0 ? { s0: doorS - doorW / 2, s1: doorS + doorW / 2 } : null;

  /** A straight span of an edge: its upper lift and its stub (the door's edge in its two sides and lintel). */
  const straight = (e: Edge, s0: number, s1: number, i0: number, i1: number, endA: Shade, endB: Shade): void => {
    if (s1 - s0 < 0.05) return;
    const list = slitsOf(e.i).filter((sl) => sl.s > s0 && sl.s < s1);
    const ax = edgeAxes([e.a[0], 0, e.a[1]], e.u);
    const scores = [s0 + (s1 - s0) / 3, s0 + (2 * (s1 - s0)) / 3];
    const upper = F.begin({ role: 'wall', material: 'concrete', face: e.face, axes: ax, scoreAxis: 0, scores, rebar: true, volume: vol(s1 - s0, wallTop - STUB_TOP) });
    wallBlock(m, [e.a[0], 0, e.a[1]], e.u, s0, s1, i0, i1, STUB_TOP, wallTop, t, list.map(outerOpening), throatHoles(list), conc, inner, cut, [endA, endB], cut, cut);
    drawSlits(e, list);
    F.end();
    const stub = F.begin({ role: 'wall', material: 'concrete', face: e.face, anchor: true, axes: ax, rebar: true, volume: vol(s1 - s0, STUB_TOP - FOOT) });
    wallBlock(m, [e.a[0], 0, e.a[1]], e.u, s0, s1, i0, i1, FOOT, STUB_TOP, t, [], [], conc, inner, cut, [endA, endB], cut, null);
    F.end();
    F.link(upper, stub, 'cast');
    spans.push({ edge: e.i, s0, s1, upper, stub });
  };
  /** An edge's middle stretch from s0 to s1 (its ends square cuts, or mitred to the inner i0/i1): split round the door. */
  const middle = (e: Edge, s0: number, s1: number, i0: number, i1: number): void => {
    if (!door || e.i !== doorEdge) { straight(e, s0, s1, i0, i1, cut, cut); return; }
    const ax = edgeAxes([e.a[0], 0, e.a[1]], e.u);
    // the door's two sides: their ends at the gap are its reveal
    if (door.s0 - s0 > 0.05) { straight(e, s0, door.s0, i0, door.s0, cut, reveal); doorLeft = spans[spans.length - 1].upper; }
    if (s1 - door.s1 > 0.05) { straight(e, door.s1, s1, door.s1, i1, reveal, cut); doorRight = spans[spans.length - 1].upper; }
    // the lintel over it, the threshold under it
    const top = GRADE + doorH;
    lintel = F.begin({ role: 'wall', material: 'concrete', face: e.face, axes: ax, rebar: true, volume: vol(doorW, wallTop - top) });
    wallBlock(m, [e.a[0], 0, e.a[1]], e.u, door.s0, door.s1, door.s0, door.s1, top, wallTop, t, [], [], conc, inner, cut, [cut, cut], cut, reveal);
    F.end();
    threshold = F.begin({ role: 'wall', material: 'concrete', face: e.face, anchor: true, axes: ax, rebar: true, volume: vol(doorW, GRADE - FOOT) });
    wallBlock(m, [e.a[0], 0, e.a[1]], e.u, door.s0, door.s1, door.s0, door.s1, FOOT, GRADE, t, [], [], conc, inner, cut, [cut, cut], reveal, null);
    F.end();
  };

  {
    // the major edges: the casemate's four sides (its chamfers fall in the corner blocks), the DOT's rear and sides (its
    // splayed front with the main embrasure one block between the sides, squared to both: they are parallel), every
    // side of the hexagon (its corner blocks squared to the incoming side; the outgoing side's cut sits askew in them)
    const major = edges.filter((e) => style === 'hex' ? true
      : style === 'dot' ? (Math.abs(e.u[2]) > 0.995 || e.face === 'back')
      : Math.abs(e.u[0]) > 0.995 || Math.abs(e.u[2]) > 0.995).map((e) => e.i);
    const cutsOn = new Map<number, { start: number; end: number }>();
    for (const i of major) cutsOn.set(i, { start: 0, end: edges[i].len });
    const blocks: Array<{ outer: Array<[number, number]>; inner: Array<[number, number]>; chain: number[]; A: number; B: number }> = [];
    for (let j = 0; j < major.length; j++) {
      const A = edges[major[j]], B = edges[major[(j + 1) % major.length]];
      const chain: number[] = [];
      for (let q = (A.i + 1) % k; q !== B.i; q = (q + 1) % k) chain.push(q);
      // the inner corners: the lines t in, met in turn; a short edge whose inner stretch would be negative drops out
      let run = [A.i, ...chain, B.i];
      const line = (i: number): { p: [number, number]; d: [number, number] } =>
        ({ p: [edges[i].a[0] - edges[i].n[0] * t, edges[i].a[1] - edges[i].n[2] * t], d: [edges[i].u[0], edges[i].u[2]] });
      let pts: Array<[number, number]> = [];
      for (let guard = 0; guard < 8; guard++) {
        pts = [];
        for (let q = 0; q + 1 < run.length; q++) {
          const l0 = line(run[q]), l1 = line(run[q + 1]);
          pts.push(meet(l0.p, l0.d, l1.p, l1.d)!);
        }
        const drop = run.findIndex((ei, q) => q > 0 && q < run.length - 1
          && (pts[q][0] - pts[q - 1][0]) * edges[ei].u[0] + (pts[q][1] - pts[q - 1][1]) * edges[ei].u[2] <= 0.01);
        if (drop < 0) break;
        run = run.filter((_, q) => q !== drop);
      }
      const proj = (e: Edge, p: [number, number]) => (p[0] - e.a[0]) * e.u[0] + (p[1] - e.a[1]) * e.u[2];
      let sA = proj(A, pts[0]) - 0.12, sB = proj(B, pts[pts.length - 1]) + 0.12;
      // a door next to the corner: the block's cut is the door's reveal
      if (door && A.i === doorEdge && door.s1 > sA - 0.4 && door.s1 <= proj(A, pts[0]) - 0.02) sA = door.s1;
      if (door && B.i === doorEdge && door.s0 < sB + 0.4 && door.s0 >= proj(B, pts[pts.length - 1]) + 0.02) sB = door.s0;
      cutsOn.get(A.i)!.end = sA;
      cutsOn.get(B.i)!.start = sB;
      const outer: Array<[number, number]> = [[A.a[0] + A.u[0] * sA, A.a[1] + A.u[2] * sA], A.b];
      for (const q of chain) outer.push(edges[q].b);
      outer.push([B.a[0] + B.u[0] * sB, B.a[1] + B.u[2] * sB]);
      const innerChain: Array<[number, number]> = [[outer[0][0] - A.n[0] * t, outer[0][1] - A.n[2] * t], ...pts,
        [outer[outer.length - 1][0] - B.n[0] * t, outer[outer.length - 1][1] - B.n[2] * t]];
      blocks.push({ outer, inner: innerChain, chain, A: A.i, B: B.i });
    }
    // the middle stretches (and the door's) between the blocks
    for (const i of major) {
      const c = cutsOn.get(i)!;
      const doorAtStart = door && i === doorEdge && Math.abs(c.start - door.s0) < 1e-6;
      const doorAtEnd = door && i === doorEdge && Math.abs(c.end - door.s1) < 1e-6;
      if (doorAtEnd || doorAtStart) {
        // the door's gap runs on to a corner block: the remaining side and the lintel and threshold
        const e = edges[i];
        middle(e, c.start, c.end, c.start, c.end);
      } else middle(edges[i], c.start, c.end, c.start, c.end);
    }
    // the corner blocks: their upper lift with the short edges' embrasures, and their stubs
    for (const b of blocks) {
      const A = edges[b.A];
      // squared to its incoming side, or to its outgoing side where that holds the door (the askew cut keeps off the leaf)
      const sq = door && b.B === doorEdge ? edges[b.B] : A;
      const ax = edgeAxes([sq.a[0], 0, sq.a[1]], sq.u);
      // the openings by outer segment: the chain's edges are the segments 1..chain.length
      const ops: Opening[][] = b.outer.slice(0, -1).map(() => []), holes: Opening[][] = b.inner.slice(0, -1).map(() => []);
      const drawn: ConcreteSlit[] = [];
      b.chain.forEach((q, ci) => {
        for (const sl of slitsOf(q)) {
          ops[ci + 1].push(outerOpening(sl));
          drawn.push(sl);
          // the throat on the inner chain: the segment whose stretch holds the slit's centre carried t in
          const e = edges[q], cx = e.a[0] + e.u[0] * sl.s - e.n[0] * t, cz = e.a[1] + e.u[2] * sl.s - e.n[2] * t;
          for (let s = 0; s + 1 < b.inner.length; s++) {
            const p = b.inner[s], r = b.inner[s + 1], len = Math.hypot(r[0] - p[0], r[1] - p[1]);
            const along = ((cx - p[0]) * (r[0] - p[0]) + (cz - p[1]) * (r[1] - p[1])) / len;
            const off = Math.abs((cx - p[0]) * (r[1] - p[1]) - (cz - p[1]) * (r[0] - p[0])) / len;
            if (along > 0 && along < len && off < 0.05) { const th = throatOf(sl); holes[s].push({ s0: along - th.hw, s1: along + th.hw, t0: sl.y - th.hh, t1: sl.y + th.hh }); break; }
          }
        }
      });
      const area = Math.abs(b.outer.concat(b.inner.slice().reverse()).reduce((sum, p, i, all) => { const q = all[(i + 1) % all.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
      const upper = F.begin({ role: 'wall', material: 'concrete', face: A.face, axes: ax, rebar: true, volume: area * (wallTop - STUB_TOP) });
      cornerBlock(m, b.outer, b.inner, STUB_TOP, wallTop, ops, holes, conc, inner, cut, cut, cut);
      for (const q of b.chain) drawSlits(edges[q], drawn.filter((sl) => sl.edge === q));
      F.end();
      const stub = F.begin({ role: 'wall', material: 'concrete', face: A.face, anchor: true, axes: ax, rebar: true, volume: area * (STUB_TOP - FOOT) });
      cornerBlock(m, b.outer, b.inner, FOOT, STUB_TOP, [], [], conc, inner, cut, cut, null);
      F.end();
      F.link(upper, stub, 'cast');
      corners.push({ upper, stub, a: b.A, b: b.B });
    }
  }

  // ---- the door's steel leaf in its gap (hinged on the left side)
  let leaf = -1;
  if (door) {
    const e = edges[doorEdge];
    const c: V3 = [e.a[0] + e.u[0] * doorS, GRADE, e.a[1] + e.u[2] * doorS];
    const P = (du: number, y: number, dep: number): V3 => [c[0] + e.u[0] * du - e.n[0] * dep, y, c[2] + e.u[2] * du - e.n[2] * dep];
    const hw = doorW / 2, D = 0.32;
    const leafShade: Shade = (p) => mix(plateTone, [0.1, 0.045, 0.02], smooth(0.55, 0.8, vnoise(p[0], p[1], p[2], 0.3, O.seed + 81)) * (0.3 + T.age));
    leaf = F.begin({ role: 'door', material: 'metal', face: e.face, axes: edgeAxes(P(-hw, 0, 0), e.u), volume: doorW * doorH * 0.012 });
    // (round 2, wave 370: "its door is a flat dark-brown panel with no visible frame") the steel frame in the gap, angle
    // section round the opening, and the leaf inside it with its stiffeners, handle and hinges
    const yaw = Math.atan2(e.u[0], e.u[2]) - Math.PI / 2;
    const at = (du: number, dep: number): [number, number] => [c[0] + e.u[0] * du - e.n[0] * dep, c[2] + e.u[2] * du - e.n[2] * dep];
    const frameShade: Shade = (p) => mul(leafShade(p, [0, 1, 0]), 0.82);
    const fw = 0.06;
    for (const du of [-hw + fw / 2, hw - fw / 2]) { const [x, z] = at(du, D - 0.02); solid(m, x, GRADE, z, fw, doorH, 0.07, yaw, frameShade, false); }
    { const [x, z] = at(0, D - 0.02); solid(m, x, GRADE + doorH - fw, z, doorW - 2 * fw - 0.002, fw, 0.07, yaw, frameShade, false); }
    const lw = hw - fw - 0.006;
    m.quad(P(-lw, GRADE + 0.01, D), P(lw, GRADE + 0.01, D), P(lw, GRADE + doorH - fw - 0.006, D), P(-lw, GRADE + doorH - fw - 0.006, D), leafShade, false, e.n);
    m.quad(P(lw, GRADE + 0.01, D + 0.012), P(-lw, GRADE + 0.01, D + 0.012), P(-lw, GRADE + doorH - fw - 0.006, D + 0.012), P(lw, GRADE + doorH - fw - 0.006, D + 0.012), leafShade, false, scl(e.n, -1));
    for (const y of [0.32, (doorH - fw) / 2, doorH - fw - 0.3]) {
      const [x, z] = at(0, D - 0.008);
      solid(m, x, GRADE + y - 0.02, z, lw * 2 - 0.1, 0.04, 0.016, yaw, frameShade, false);
    }
    { const [x, z] = at(lw - 0.12, D - 0.03); solid(m, x, GRADE + doorH * 0.5 - 0.06, z, 0.03, 0.12, 0.04, yaw, () => [0.06, 0.055, 0.05], false); }
    for (const y of [GRADE + 0.3, GRADE + doorH - fw - 0.32]) {
      const [x, z] = at(-lw + 0.05, D - 0.03);
      solid(m, x, y, z, 0.06, 0.12, 0.05, yaw, leafShade, false);
    }
    F.end();
  }

  // ---- the floor of the room (an anchor: what falls in lies on it)
  const floorPoly = insetPlan(plan, t + 0.002);
  const floor = F.begin({ role: 'slab', material: 'concrete', face: 'floor', anchor: true, axes: AX, volume: 0.2 });
  capPolygon(m, floorPoly, PIT, inner, true, true);
  F.end();

  // ---- the roof slab in four plates, each with its earth and turf (and the vent on its rear-left plate)
  const sPlan = grow(plan, overhang), chamf = 0.07, sTop = wallTop + slab;
  const cPlan = grow(plan, overhang - chamf);
  const plates: number[] = [];
  // the earth to the slab's chamfer: no tray (round 2, wave 370: "turf sunk in a tray like a planter")
  const coverThick = style === 'dot' ? 0.5 : style === 'hex' ? 0.16 : 0.26, coverInset = -(overhang - chamf - 0.03);
  for (const [qx, qz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as Array<[number, number]>) {
    const clip = (poly: Array<[number, number]>) => clipHalf(clipHalf(poly, qx, 0, 0), 0, qz, 0);
    const sQ = clip(sPlan), cQ = clip(cPlan);
    const area = Math.abs(sQ.reduce((sum, p, i) => { const q = sQ[(i + 1) % sQ.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    const ex = Math.max(...sQ.map((p) => Math.abs(p[0]))), ez = Math.max(...sQ.map((p) => Math.abs(p[1])));
    const idx = F.begin({ role: 'slab', material: 'concrete', face: 'roof', axes: AX, rebar: true, volume: area * slab,
      scoreAxis: ex >= ez ? 0 : 2, scores: [ex >= ez ? qx * ex / 2 : qz * ez / 2] });
    capPolygon(m, sQ, wallTop, conc, false, true);
    // its edges (the plan's, not the cuts), up to the chamfer, and the chamfer in to the top
    for (let i = 0; i < sPlan.length; i++) {
      const a = sPlan[i], b = sPlan[(i + 1) % sPlan.length], c2 = cPlan[(i + 1) % cPlan.length], d = cPlan[i];
      let seg: Array<[number, number]> = [a, b];
      // clip the segment to the quadrant
      for (const [hx, hz] of [[qx, 0], [0, qz]] as Array<[number, number]>) {
        const fa = hx * seg[0][0] + hz * seg[0][1], fb = hx * seg[1][0] + hz * seg[1][1];
        if (fa < 0 && fb < 0) { seg = []; break; }
        if (fa < 0) { const tt = fa / (fa - fb); seg[0] = [seg[0][0] + (seg[1][0] - seg[0][0]) * tt, seg[0][1] + (seg[1][1] - seg[0][1]) * tt]; }
        else if (fb < 0) { const tt = fa / (fa - fb); seg[1] = [seg[0][0] + (seg[1][0] - seg[0][0]) * tt, seg[0][1] + (seg[1][1] - seg[0][1]) * tt]; }
      }
      if (seg.length < 2) continue;
      const len = Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]);
      if (len < 1e-3) continue;
      const u: V3 = [(seg[1][0] - seg[0][0]) / len, 0, (seg[1][1] - seg[0][1]) / len];
      wallFace(m, [seg[0][0], 0, seg[0][1]], u, len, wallTop, () => sTop - chamf, [], conc, 0.3);
      // the chamfer quad of this edge, clipped (vertical cut planes: clip in plan)
      let quad: Array<{ p: V3; n: V3 }> = [[a[0], sTop - chamf, a[1]], [b[0], sTop - chamf, b[1]], [c2[0], sTop, c2[1]], [d[0], sTop, d[1]]]
        .map((p) => ({ p: p as V3, n: [0, 1, 0] as V3 }));
      quad = clipPN(clipPN(quad, qx, 0), 0, qz);
      const el = Math.hypot(b[0] - a[0], b[1] - a[1]), hint: V3 = [-(b[1] - a[1]) / el, 1, (b[0] - a[0]) / el];
      for (let q = 1; q + 1 < quad.length; q++) m.tri(quad[0].p, quad[q].p, quad[q + 1].p, conc, true, undefined, hint);
    }
    capPolygon(m, cQ, sTop, conc, true, true);
    // the two cut faces through the slab (on x = 0 and z = 0), its section with the chamfer
    for (const [onX, sign] of [[true, qz], [false, qx]] as Array<[boolean, number]>) {
      const reach = (poly: Array<[number, number]>) => Math.max(0, ...poly.filter((p) => Math.abs(onX ? p[0] : p[1]) < 1e-6).map((p) => (onX ? p[1] : p[0]) * sign));
      const rs = reach(sQ), rc = reach(cQ);
      const Pt = (r: number, y: number): V3 => (onX ? [0, y, r * sign] : [r * sign, y, 0]);
      const nCut: V3 = onX ? [-qx, 0, 0] : [0, 0, -qz];
      const sec = [Pt(0, wallTop), Pt(rs, wallTop), Pt(rs, sTop - chamf), Pt(rc, sTop), Pt(0, sTop)];
      for (let q = 1; q + 1 < sec.length; q++) m.tri(sec[0], sec[q], sec[q + 1], cut, true, nCut);
    }
    roofCover(m, plan, sTop, coverThick, coverInset, T, O.seed + 101, [qx, qz]);
    if (qx < 0 && qz < 0 && style !== 'dot') {
      const vent: Shade = () => mix([0.06, 0.06, 0.062], [0.11, 0.05, 0.025], 0.4 + T.age * 0.5);
      const vx = -1.35, vz = -1.05;
      log(m, [vx, sTop - 0.05, vz], [vx, sTop + 0.48, vz], 0.075, 8, vent, vent);
      solid(m, vx, sTop + 0.48, vz, 0.26, 0.05, 0.26, 0.3, vent, false);
    }
    F.end();
    plates.push(idx);
  }
  for (let q = 0; q < 4; q++) F.link(plates[q], plates[(q + 1) % 4], 'cast');

  // ---- the blast wall before the door: its stub and its upper lift, the return the same; the sandbags
  let blastMainStub = -1, blastMainUpper = -1;
  const bags: number[] = [];
  if (door) {
    const e = edges[doorEdge];
    const u = e.u, n = e.n;
    const c: V3 = [e.a[0] + u[0] * doorS, GRADE, e.a[1] + u[2] * doorS];
    const bwDist = 1.25, bwLen = 2.5, bwT = 0.36, bwH = style === 'hex' ? 1.62 : 1.72;
    const bcx = c[0] + n[0] * (bwDist + bwT / 2) + u[0] * 0.35, bcz = c[2] + n[2] * (bwDist + bwT / 2) + u[2] * 0.35;
    const rx = c[0] + u[0] * (0.35 + bwLen / 2 - bwT / 2) + n[0] * (bwDist / 2), rz = c[2] + u[2] * (0.35 + bwLen / 2 - bwT / 2) + n[2] * (bwDist / 2);
    const lift = (cx: number, cz: number, wu: V3, wn: V3, len: number, y0: number, y1: number, anchor: boolean): number => {
      const idx = F.begin({ role: 'wall', material: 'concrete', face: e.face, anchor, axes: { o: [cx, 0, cz], x: wu, y: [0, 1, 0], z: wn }, rebar: true, volume: len * bwT * (y1 - y0) });
      blastWall(m, [cx, 0, cz], wu, wn, len, bwT, y0, y1, conc, O);
      if (!anchor) {
        const p = (du: number, dn: number): V3 => [cx + wu[0] * du + wn[0] * dn, y0, cz + wu[2] * du + wn[2] * dn];
        m.quad(p(-len / 2, -bwT / 2), p(len / 2, -bwT / 2), p(len / 2, bwT / 2), p(-len / 2, bwT / 2), cut, true, [0, -1, 0]);
      }
      F.end();
      return idx;
    };
    blastMainStub = lift(bcx, bcz, u, n, bwLen, FOOT, STUB_TOP, true);
    blastMainUpper = lift(bcx, bcz, u, n, bwLen, STUB_TOP, bwH, false);
    const retStub = lift(rx, rz, n, scl(u, -1), bwDist + 0.02, FOOT, STUB_TOP, true);
    const retUpper = lift(rx, rz, n, scl(u, -1), bwDist + 0.02, STUB_TOP, bwH, false);
    F.link(blastMainUpper, blastMainStub, 'cast'); F.link(retUpper, retStub, 'cast'); F.link(retUpper, blastMainUpper, 'cast');
    F.link(retStub, blastMainStub, 'cast');
    // the return meets the body beside the door
    for (const sp of spans) if (sp.edge === doorEdge && sp.upper === doorRight) { F.link(retUpper, sp.upper, 'cast'); F.link(retStub, sp.stub, 'cast'); }
    // sandbags at the mouth (each its own body) and a course on the blast wall's top
    const mouthX = c[0] + u[0] * (0.35 - bwLen / 2 - 0.45) + n[0] * (bwDist + 0.3), mouthZ = c[2] + u[2] * (0.35 - bwLen / 2 - 0.45) + n[2] * (bwDist + 0.3);
    const brng = mulberry32(O.seed + 91);
    const byCourse: number[][] = [];
    for (let course = 0; course < 3; course++) {
      byCourse.push([]);
      for (let j = 0; j < 3 - course; j++) {
        const along = (j - (2 - course) / 2) * 0.58;
        const x = mouthX + n[0] * along, z = mouthZ + n[2] * along, y = GRADE + 0.1 + course * 0.19;
        const bag = F.begin({ role: 'bag', material: 'earth', axes: AX, volume: 0.034 });
        placeBag(m, brng, x, y, z, Math.atan2(n[0], n[2]), T.bag, course);
        F.end();
        bags.push(bag); byCourse[course].push(bag);
        if (course === 0) F.link(bag, blastMainStub, 'rest');
        else { F.link(bag, byCourse[course - 1][j], 'rest'); F.link(bag, byCourse[course - 1][j + 1], 'rest'); }
      }
    }
    for (let j = 0; j < 4; j++) {
      const along = (j - 1.5) * 0.6;
      const bag = F.begin({ role: 'bag', material: 'earth', axes: AX, volume: 0.034 });
      placeBag(m, brng, bcx + u[0] * along, bwH + 0.1, bcz + u[2] * along, Math.atan2(u[0], u[2]), T.bag, 2);
      F.end();
      bags.push(bag);
      F.link(bag, blastMainUpper, 'rest');
    }
    // the mouth's stack on its bed of trodden spoil, its flanks under the ground (r2 sweep, 2026-10-16: the stack stood
    // on the grade line 3.5 m behind the seat and hung over the ground where it falls away, 18 cm on Autumn)
    const bed = F.begin({ role: 'footing', material: 'earth', face: e.face, anchor: true, axes: AX, volume: 0.3 });
    spoilBed(m, mouthX, mouthZ, n, 0.92, 0.27, GRADE - 0.42, T, (O.seed + 97) >>> 0);
    F.end();
    for (const bag of byCourse[0]) F.link(bag, bed, 'rest');
  }

  // ---- the links: along the walls (cast), the slab on the walls, the door's leaf on its hinges
  const allWalls: Array<{ upper: number; stub: number }> = [...spans, ...corners];
  for (let a = 0; a < allWalls.length; a++) for (let b = a + 1; b < allWalls.length; b++) {
    F.link(allWalls[a].stub, allWalls[b].stub, 'cast');
  }
  // neighbours touch: their pieces' boxes meet (checked on the pieces themselves)
  const P = F.pieces;
  const touching = (i: number, j: number): boolean => {
    const a = P[i], b = P[j];
    const r = Math.hypot(...a.h) + Math.hypot(...b.h);
    return Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1], a.c[2] - b.c[2]) < r * 0.98;
  };
  const uppers = allWalls.map((w) => w.upper).concat(lintel >= 0 ? [lintel] : []);
  for (let a = 0; a < uppers.length; a++) for (let b = a + 1; b < uppers.length; b++) if (touching(uppers[a], uppers[b])) F.link(uppers[a], uppers[b], 'cast');
  for (const pl of plates) for (const up of uppers) if (touching(pl, up)) F.link(pl, up, 'cast');
  if (lintel >= 0) { if (doorLeft >= 0) F.link(lintel, doorLeft, 'cast'); if (doorRight >= 0) F.link(lintel, doorRight, 'cast'); }
  if (leaf >= 0) { if (doorLeft >= 0) F.link(leaf, doorLeft, 'bolt'); if (threshold >= 0) F.link(leaf, threshold, 'rest'); }
  if (threshold >= 0) for (const w of allWalls) F.link(threshold, w.stub, 'cast');
  for (const w of allWalls) F.link(floor, w.stub, 'cast');
  void bags; void blastMainUpper;

  const g = m.geometry();
  g.userData.fracture = F.anatomy('bunker');
  return g;
}

/**
 * The broken face a concrete piece shows where it snaps at a score (the destruction core calls it once a kind a map and
 * caches the halves): two runs, the half toward -scoreAxis first (facing +), then the other; each a ragged cap of fresh
 * grey across the piece's section, standing out of its own half, and the bars of its mesh bent out of it.
 */
export function fortFractureEdge(material: FractureMaterial, piece: FracturePiece, score: number | 'whole', seed: number,
  out: DamageMeshWriter): void {
  if (score === 'whole' || material !== 'concrete') return;
  const axis = piece.scoreAxis ?? 0;
  const rot = (v: V3): V3 => {
    const [x, y, z, w] = piece.q;
    const tt: V3 = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
    return [v[0] + w * tt[0] + (y * tt[2] - z * tt[1]), v[1] + w * tt[1] + (z * tt[0] - x * tt[2]), v[2] + w * tt[2] + (x * tt[1] - y * tt[0])];
  };
  const unit = (k: number): V3 => rot(k === 0 ? [1, 0, 0] : k === 1 ? [0, 1, 0] : [0, 0, 1]);
  const A = unit(axis), U = unit((axis + 1) % 3), V = unit((axis + 2) % 3);
  const hu = piece.h[(axis + 1) % 3], hv = piece.h[(axis + 2) % 3];
  const base = add([piece.c[0], piece.c[1], piece.c[2]], scl(A, score));
  let state = seed >>> 0;
  const rnd = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  // (E1, the r2 standard: a wreck within 1.5 x its intact triangles; the 5 x 5 grid a cap ran the hex form's wreck to
  // 1.81 x) the break's grid by its size: a cell about 40 cm across, at least two along the break and one through it;
  // the ragged depth on every vertex but the break's two ends, so the line it leaves on the faces wanders too
  const nu = Math.max(2, Math.min(6, Math.round((2 * hu) / 0.4))), nv = Math.max(1, Math.min(6, Math.round((2 * hv) / 0.4)));
  const rough = Math.min(0.12, Math.min(hu, hv) * 0.5);
  const fresh: Rgb = [0.42, 0.4, 0.36], rust: Rgb = [0.12, 0.05, 0.025];
  for (const side of [1, -1] as const) {
    if (!out.begin(piece.bucket, 'rim')) return;
    const idx: number[] = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const end = i === 0 || i === nu, face = j === 0 || j === nv;
      const d = (end ? rnd() * 0.3 : face ? 0.1 + rnd() * 0.6 : 0.2 + rnd() * 0.8) * rough * side;
      const p = add(add(add(base, scl(U, (i / nu * 2 - 1) * hu)), scl(V, (j / nv * 2 - 1) * hv)), scl(A, d));
      const k = 0.8 + rnd() * 0.35;
      idx.push(out.vertex(p[0], p[1], p[2], A[0] * side, A[1] * side, A[2] * side, FLAT_UV[0], FLAT_UV[1],
        fresh[0] * k / FORT_PRINT_MEAN, fresh[1] * k / FORT_PRINT_MEAN, fresh[2] * k / FORT_PRINT_MEAN));
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = idx[j * (nu + 1) + i], b = idx[j * (nu + 1) + i + 1], c = idx[(j + 1) * (nu + 1) + i + 1], d = idx[(j + 1) * (nu + 1) + i];
      if (side > 0) { out.triangle(a, b, c); out.triangle(a, c, d); } else { out.triangle(a, c, b); out.triangle(a, d, c); }
    }
    // the bars: a few of each mat's, bent out of the break
    if (piece.rebar) {
      const bars = 3 + Math.floor(rnd() * 3);
      for (let q = 0; q < bars; q++) {
        const pu = (rnd() * 2 - 1) * hu * 0.8, pv = (q % 2 ? 1 : -1) * hv * 0.75;
        const root = add(add(base, scl(U, pu)), scl(V, pv));
        const len = 0.12 + rnd() * 0.22;
        const tip = add(add(root, scl(A, side * len)), add(scl(U, (rnd() - 0.5) * len * 0.8), scl(V, (rnd() - 0.5) * len * 0.5)));
        const w = 0.012, side2 = norm(cross(sub(tip, root), U));
        const v0 = out.vertex(root[0] + side2[0] * w, root[1] + side2[1] * w, root[2] + side2[2] * w, U[0], U[1], U[2], FLAT_UV[0], FLAT_UV[1], rust[0] / FORT_PRINT_MEAN, rust[1] / FORT_PRINT_MEAN, rust[2] / FORT_PRINT_MEAN);
        const v1 = out.vertex(root[0] - side2[0] * w, root[1] - side2[1] * w, root[2] - side2[2] * w, U[0], U[1], U[2], FLAT_UV[0], FLAT_UV[1], rust[0] / FORT_PRINT_MEAN, rust[1] / FORT_PRINT_MEAN, rust[2] / FORT_PRINT_MEAN);
        const v2 = out.vertex(tip[0], tip[1], tip[2], U[0], U[1], U[2], FLAT_UV[0], FLAT_UV[1], rust[0] / FORT_PRINT_MEAN, rust[1] / FORT_PRINT_MEAN, rust[2] / FORT_PRINT_MEAN);
        out.triangle(v0, v1, v2); out.triangle(v0, v2, v1);
      }
    }
    out.end();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// the settled wreck of a concrete work (round 2)

/**
 * The destroyed concrete work for the broken pool (round 2; wave 370: "crater, spoil, splintered logs and rebar at real
 * volume"), settled from its own pieces (fractureSettle.ts) in its earthwork: the room's floor and every wall's stub
 * stand, their breaks ragged and barred; the corner farthest from the blow stands; the lifts lean out against the bank,
 * or fall in where the blow struck, some cracked through with their bars between; the slab comes down in its plates
 * onto what stands, tipped, its earth and turf on it, its broken edges barred; the door is thrown, the blast wall goes
 * over, the bags scatter; fresh-grey rubble at the feet of the breaks and over the floor, the bank's earth thrown over
 * the crest. The broken pool has no collider: the wreck stands no higher than its standing corner.
 */
function buildConcreteWreck(style: 'regelbau' | 'dot' | 'hex', O: BuildOpts): THREE.BufferGeometry {
  const intact = buildConcretePillboxPieces(style, { ...O, broken: false });
  const anatomy = intact.userData.fracture as KitFractureAnatomy;
  const field = pillboxBankField(style, O.tones, O.seed);
  const S = new FractureSettle(intact, anatomy, {
    cell: 0.1, margin: 3, dust: 0.8,
    ground: (x, z) => { const h = field.lift(x, z); return Number.isNaN(h) ? PIT : Math.max(GRADE, h); },
  });
  const rng = mulberry32((O.seed ^ 0x3ec7a11) >>> 0);
  const r = (lo: number, hi: number): number => lo + (hi - lo) * rng();
  const T = O.tones;
  const P = anatomy.pieces;
  const L = concreteLayout(style);
  const az = rng() * Math.PI * 2;
  const blow: V3 = [Math.cos(az), 0, Math.sin(az)]; // the way the blow pushes
  const idx = P.map((_, i) => i);
  const flat = (v: V3): V3 => norm([v[0], 0, v[2]]);
  const nearCorner = (p: FracturePiece): boolean => L.plan.some(([x, z]) => Math.hypot(p.c[0] - x, p.c[2] - z) < 0.75);
  const inPlan = (p: FracturePiece): boolean => Math.max(...L.plan.map(([x, z]) => Math.hypot(x, z))) + 0.6 > Math.hypot(p.c[0], p.c[2]);
  const up = (p: FracturePiece): FracturePiece => ({ ...p, scoreAxis: 1 });
  // a stub's ragged top and a lift's ragged foot (the edge art across the joint between them)
  const stubTop = (i: number): SettleTris | undefined => edgeRuns(fortFractureEdge, up(P[i]), P[i].h[1] - 0.03, O.seed ^ (i * 31))[0];
  const liftFoot = (i: number): SettleTris | undefined => edgeRuns(fortFractureEdge, up(P[i]), -P[i].h[1] + 0.03, O.seed ^ (i * 37))[1];
  // 1. the floor and every stub stand, their breaks ragged
  for (const i of idx) {
    if (!P[i].anchor) continue;
    S.stay(i, 0.86);
    if (P[i].role === 'wall') { const cap = stubTop(i); if (cap) S.extra(cap, 0.9); }
  }
  // 2. the corner farthest from the blow stands
  const corners = idx.filter((i) => P[i].role === 'wall' && !P[i].anchor && nearCorner(P[i]) && inPlan(P[i]));
  const standing = corners.length ? corners.reduce((a, b) => (dot3(flat(P[a].c as V3), blow) >= dot3(flat(P[b].c as V3), blow) ? a : b)) : -1;
  if (standing >= 0) S.cut(standing, () => P[standing].c[1] + P[standing].h[1] - r(0, 0.22), 0.86);
  // 3. the slab down in its plates onto the stubs and the floor, cracked and tipped, its broken edges barred
  const plates = idx.filter((i) => P[i].role === 'slab' && !P[i].anchor).sort((a, b) => P[a].c[1] - P[b].c[1]);
  S.together(() => { for (const i of plates) {
    const p = P[i];
    // its broken inner edges (toward the slab's middle) ragged and barred, then cracked across at its score
    const edges: SettleTris[] = [];
    for (const k of [0, 2] as const) {
      const sign = Math.sign(p.c[k]) || 1;
      const runs = edgeRuns(fortFractureEdge, { ...p, scoreAxis: k }, -sign * (p.h[k] - 0.04), O.seed ^ (i * 53 + k));
      const run = sign > 0 ? runs[1] : runs[0];
      if (run) edges.push(run);
    }
    const parts = S.snap(i, fortFractureEdge, p.scores, O.seed ^ (i * 59));
    for (const e of edges) {
      // (each ragged edge goes with the length it lies against)
      let best = parts[0], bestD = Infinity;
      const ec = [0, 0, 0];
      for (let k = 0; k < e.p.length; k += 3) { ec[0] += e.p[k]; ec[2] += e.p[k + 2]; }
      ec[0] /= e.p.length / 3; ec[2] /= e.p.length / 3;
      for (const b of parts) { const d = Math.hypot(b.centre[0] - ec[0], b.centre[2] - ec[2]); if (d < bestD) { bestD = d; best = b; } }
      S.addTo(best, e);
    }
    for (const b of parts) S.drop(b, r(-0.15, 0.15), [blow[0] * r(0.1, 0.35), 0, blow[2] * r(0.1, 0.35)], { maxTilt: 1.3, ceiling: 3.0 });
  } });
  // 4. the walls' lifts blown off the slab's fall: in where the blow struck them, out on the bank elsewhere; some cracked
  const lifts = idx.filter((i) => P[i].role === 'wall' && !P[i].anchor && i !== standing && inPlan(P[i]));
  lifts.sort((a, b) => P[a].c[1] - P[b].c[1]);
  for (const i of lifts) {
    const p = P[i];
    const out = flat(p.c as V3);
    const struck = dot3(out, blow) < -0.3;
    const foot = liftFoot(i);
    // (E1: a third of the lifts' scores crack, not half: the wreck within 1.5 x the intact)
    const scores = (p.scores ?? []).filter(() => rng() < 0.34);
    const parts = nearCorner(p) ? [S.body([i])] : S.snap(i, fortFractureEdge, scores, O.seed ^ (i * 41));
    for (const b of parts) {
      if (foot) {
        // (each length keeps the part of the ragged foot under it)
        const cut = { p: [] as number[], n: [] as number[], t: [] as number[], c: [] as number[] };
        let lo = Infinity, hi = -Infinity;
        const A = norm(sub([b.centre[0], 0, b.centre[2]], [p.c[0], 0, p.c[2]]));
        for (let k = 0; k < b.tris.p.length; k += 3) {
          const s = (b.tris.p[k] - b.centre[0]) * A[0] + (b.tris.p[k + 2] - b.centre[2]) * A[2];
          lo = Math.min(lo, s); hi = Math.max(hi, s);
        }
        for (let t = 0; t < foot.p.length / 9; t++) {
          const cx = (foot.p[t * 9] + foot.p[t * 9 + 3] + foot.p[t * 9 + 6]) / 3, cz = (foot.p[t * 9 + 2] + foot.p[t * 9 + 5] + foot.p[t * 9 + 8]) / 3;
          const s = parts.length === 1 ? 0 : (cx - b.centre[0]) * A[0] + (cz - b.centre[2]) * A[2];
          if (parts.length > 1 && (s < lo - 0.02 || s > hi + 0.02)) continue;
          cut.p.push(...foot.p.slice(t * 9, t * 9 + 9)); cut.n.push(...foot.n.slice(t * 9, t * 9 + 9));
          cut.t.push(...foot.t.slice(t * 6, t * 6 + 6)); cut.c.push(...foot.c.slice(t * 9, t * 9 + 9));
        }
        S.addTo(b, cut);
      }
      // (cast lifts stay on their hinge: leaning out on the bank, or swung in onto the floor where the blow struck)
      if (nearCorner(p)) S.topple(b, out, r(0.35, 0.8), { minSwing: 0.2, hinged: true });
      else if (struck) S.topple(b, scl(out, -1), r(0.8, 1.4), { minSwing: 0.3, hinged: true });
      else S.topple(b, out, r(0.5, 1.15), { minSwing: 0.3, hinged: true });
    }
  }
  // 5. the door thrown, the blast wall and its return over, the bags scattered
  for (const i of idx) {
    if (S.isLaid(i)) continue;
    const p = P[i];
    const out = flat(p.c as V3);
    if (p.role === 'door') S.lie(S.body([i]), r(0, Math.PI * 2), [out[0] * r(0.8, 1.8), 0, out[2] * r(0.8, 1.8)], rng() < 0.5, r(-0.2, 0.2), { ceiling: 1.2 });
    else if (p.role === 'wall') S.topple(S.body([i]), out, r(0.6, 1.45), { minSwing: 0.3, hinged: true });
    else if (p.role === 'bag') {
      const a = r(0, Math.PI * 2), d = r(0.2, 1.6);
      S.lie(S.body([i]), r(0, Math.PI * 2), [Math.cos(a) * d + out[0] * 0.4, 0, Math.sin(a) * d + out[2] * 0.4], false, r(-0.3, 0.3), { ceiling: 0.9 });
    } else S.lie(S.body([i]), r(0, Math.PI * 2), [out[0] * r(0.3, 1), 0, out[2] * r(0.3, 1)], false, 0, { ceiling: 1.4 });
  }
  // 6. rubble at the breaks' feet and over the floor, bars out of it, the bank's earth thrown over the crest
  const m = new Mesh();
  const dust: Rgb = mix(T.concrete, T.earth, 0.3);
  const chunk: Shade = (q, n) => mul(mix(mul(T.concrete, 0.7), mix(dust, [0.42, 0.4, 0.36], 0.5), vnoise(q[0], q[1], q[2], 0.25, O.seed + 171) * 0.8),
    (n[1] > 0.5 ? 0.95 : 0.8) * (0.85 + hash3(Math.round(q[0] * 3), Math.round(q[2] * 3), 1, O.seed) * 0.25));
  const rust: Shade = () => [0.1, 0.045, 0.022];
  const ext = Math.max(...L.plan.map(([x, z]) => Math.hypot(x, z)));
  // (E1: 24 chunks and 18 clods, was 30 and 26: the wreck within 1.5 x the intact on every form)
  for (let k = 0; k < 24; k++) {
    const a = r(0, Math.PI * 2), rr = k < 15 ? ext * r(0.75, 1.12) : ext * Math.sqrt(rng()) * 0.7;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr, s = 0.14 + rng() * rng() * 0.5;
    const y = S.heightAt(x, z);
    lump(m, x, y + s * 0.18, z, s * (1 + rng() * 0.7), s * (0.5 + rng() * 0.4), s * (0.8 + rng() * 0.5), rng, chunk, true, r(0, Math.PI), 0.7);
    if (s > 0.32 && rng() < 0.55) bar(m, [x, y + s * 0.3, z], [x + r(-0.4, 0.4), y + s * 0.3 + r(0.2, 0.6), z + r(-0.4, 0.4)], rust);
  }
  const clod: Shade = (q) => mul(T.earth, 0.65 + vnoise(q[0], q[1], q[2], 0.2, O.seed + 181) * 0.4);
  for (let k = 0; k < 18; k++) {
    const a = r(0, Math.PI * 2), rr = ext + r(0.4, 2.6) + Math.max(0, Math.cos(a) * blow[0] + Math.sin(a) * blow[2]) * r(0, 1.2);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr, s = 0.1 + rng() * 0.22;
    lump(m, x, S.heightAt(x, z) + s * 0.12, z, s * 1.4, s * 0.55, s, rng, clod, false, r(0, Math.PI), 0.5);
  }
  S.extra({ p: m.p, n: m.n, t: m.t, c: m.c }, 1);
  intact.dispose();
  return S.finish();
}

// ---------------------------------------------------------------------------------------------------------------
// public

function mulberry32(a: number): Rng {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** A pillbox's embrasures in its own frame: each opening's centre, half sizes and outward face normal (physics stream,
 * 2026-10-16: the receipt that rounds go in through them reads them; no draws). */
export function pillboxEmbrasures(style: PillboxStyle): Array<{ x: number; y: number; z: number; hw: number; hh: number; nx: number; nz: number }> {
  return style === 'logearth'
    ? [{ x: 0, y: LOG_SLIT_Y, z: LOG_D / 2, hw: LOG_SLIT_HW, hh: LOG_SLIT_HH, nx: 0, nz: 1 }]
    : concreteLayout(style).slits.map((slit) => ({ ...slit }));
}

/** A concrete pillbox's doorway in its own frame: its centre on the outer face, its half width, its sill and head, its
 * outward normal and its steel leaf's depth (physics stream, 2026-10-16: the receipt reads it; no draws). Null for the
 * log and earth work. */
export function pillboxDoorway(style: PillboxStyle): { x: number; z: number; hw: number; y0: number; y1: number; nx: number; nz: number; leaf: number } | null {
  if (style === 'logearth') return null;
  const { plan, doorEdge, doorS } = concreteLayout(style);
  if (doorEdge < 0) return null;
  const a = plan[doorEdge], b = plan[(doorEdge + 1) % plan.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
  return { x: a[0] + ux * doorS, z: a[1] + uz * doorS, hw: 0.44, y0: GRADE, y1: GRADE + 1.66, nx: -uz, nz: ux, leaf: 0.32 };
}

/**
 * A concrete pillbox's shell parts in its own frame, authored from its layout (physics stream, 2026-10-16; the coordinator:
 * "rounds enter the drawn embrasures and doors"): its slab and structure-band hulls closed every embrasure and the door
 * (a round stopped on the outer face, the drawn throat 0.9-1.05 m deeper). Each wall from its outer face to its inner one
 * (thickness t), split round its embrasures — under the sill, over the lintel, either side — and its door; a plated
 * embrasure's steel plate stands at the throat, where the round stops as drawn (an unplated throat stays open into the
 * room); the roof slab over the plan and its overhang, with its earth. Null for the log and earth work (its slabs stand).
 * Each part: a convex outline (x, z pairs) and its heights.
 */
export function pillboxShellParts(style: PillboxStyle): Array<{ points: number[]; y0: number; y1: number }> | null {
  if (style === 'logearth') return null;
  const L = concreteLayout(style);
  const { plan, wallTop, slab, overhang, slitList, doorEdge, doorS } = L;
  const t = style === 'dot' ? 1.05 : 0.9, doorW = 0.88, doorH = 1.66;
  const inner = insetPlan(plan, t);
  const k = plan.length, parts: Array<{ points: number[]; y0: number; y1: number }> = [];
  // the inner line's point under an outer point (its edge's inner segment: the offset line clipped to the inner plan)
  const innerOf = (i: number) => {
    const a = plan[i], b = plan[(i + 1) % k], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, nx = -uz, nz = ux;
    // the inner plan's corners on this edge's offset line, as edge coordinates
    const on = inner.filter((q) => Math.abs((q[0] - a[0]) * nx + (q[1] - a[1]) * nz + t) < 1e-6).map((q) => (q[0] - a[0]) * ux + (q[1] - a[1]) * uz);
    // (a chamfer shorter than the wall is thick leaves no inner side: its wall closes on the inner corner nearest it)
    const corner = on.length ? null : inner.reduce((best, q) => {
      const d = Math.hypot(q[0] - (a[0] + b[0]) / 2, q[1] - (a[1] + b[1]) / 2);
      return d < best.d ? { q, d } : best;
    }, { q: inner[0], d: Infinity }).q;
    const lo = on.length ? Math.min(...on) : 0, hi = on.length ? Math.max(...on) : 0;
    return { a, ux, uz, nx, nz, len, lo, hi, corner };
  };
  const quad = (E: ReturnType<typeof innerOf>, s0: number, s1: number, y0: number, y1: number, d0 = 0, d1 = t) => {
    if (s1 - s0 < 0.02 || y1 - y0 < 0.02) return;
    // outer at depth d0, inner at d1; at an edge's end the inner side runs to the inner corner (the mitre)
    const at = (s: number, d: number, end: number) => {
      const ss = d >= t - 1e-6 && end !== 0 ? (end < 0 ? Math.max(s, E.lo) : Math.min(s, E.hi)) : s;
      return [E.a[0] + E.ux * ss - E.nx * d, E.a[1] + E.uz * ss - E.nz * d];
    };
    const e0 = s0 <= 1e-6 ? -1 : 0, e1 = s1 >= E.len - 1e-6 ? 1 : 0;
    if (E.corner) {
      // a chamfer's wall: its outer face to the inner corner (a triangle), the whole edge
      parts.push({ points: [...at(0, 0, 0), ...at(E.len, 0, 0), E.corner[0], E.corner[1]], y0, y1 });
      return;
    }
    const pts = [...at(s0, d0, 0), ...at(s1, d0, 0), ...at(s1, d1, e1 ? 1 : 0), ...at(s0, d1, e0 ? -1 : 0)];
    // (at the ends the inner side's corner is the inner plan's own: the walls meet in their mitres)
    if (e0) { pts[6] = E.a[0] + E.ux * E.lo - E.nx * d1; pts[7] = E.a[1] + E.uz * E.lo - E.nz * d1; }
    if (e1) { pts[4] = E.a[0] + E.ux * E.hi - E.nx * d1; pts[5] = E.a[1] + E.uz * E.hi - E.nz * d1; }
    parts.push({ points: pts, y0, y1 });
  };
  for (let i = 0; i < k; i++) {
    const E = innerOf(i);
    const holes: Array<{ s0: number; s1: number; y0: number; y1: number; plate?: { s0: number; s1: number; y0: number; y1: number } }> = [];
    for (const sl of slitList.filter((x) => x.edge === i)) {
      const thw = sl.w / 2 - sl.steps * sl.w * 0.11, thh = sl.h / 2 - sl.steps * sl.h * 0.1;
      holes.push({ s0: sl.s - sl.w / 2, s1: sl.s + sl.w / 2, y0: sl.y - sl.h / 2, y1: sl.y + sl.h / 2,
        ...(sl.plate ? { plate: { s0: sl.s - thw, s1: sl.s + thw, y0: sl.y - thh, y1: sl.y + thh } } : {}) });
    }
    if (i === doorEdge) holes.push({ s0: doorS - doorW / 2, s1: doorS + doorW / 2, y0: GRADE, y1: GRADE + doorH });
    holes.sort((p, q) => p.s0 - q.s0);
    let s = 0;
    for (const h of holes) {
      quad(E, s, h.s0, FOOT, wallTop);
      quad(E, h.s0, h.s1, FOOT, h.y0);
      quad(E, h.s0, h.s1, h.y1, wallTop);
      if (h.plate) quad(E, h.plate.s0, h.plate.s1, h.plate.y0, h.plate.y1, t - 0.12, t);
      s = h.s1;
    }
    quad(E, s, E.len, FOOT, wallTop);
  }
  if (doorEdge >= 0) {
    // the door's steel leaf in its gap, its frame's face to the leaf's back (buildConcretePillboxPieces: D = 0.32 in);
    // the blast wall before it and its return to the body, to the bags on its top; the bags banked at its mouth
    const E = innerOf(doorEdge);
    quad(E, doorS - doorW / 2, doorS + doorW / 2, GRADE, GRADE + doorH, 0.25, 0.34);
    const cx = E.a[0] + E.ux * doorS, cz = E.a[1] + E.uz * doorS;
    const box = (x: number, z: number, wx: number, wz: number, len: number, thick: number, y0: number, y1: number) => {
      const p = (du: number, dn: number) => [x + wx * du - wz * dn, z + wz * du + wx * dn];
      parts.push({ points: [...p(-len / 2, -thick / 2), ...p(len / 2, -thick / 2), ...p(len / 2, thick / 2), ...p(-len / 2, thick / 2)], y0, y1 });
    };
    const bwDist = 1.25, bwLen = 2.5, bwT = 0.36, bwH = style === 'hex' ? 1.62 : 1.72;
    box(cx + E.nx * (bwDist + bwT / 2) + E.ux * 0.35, cz + E.nz * (bwDist + bwT / 2) + E.uz * 0.35, E.ux, E.uz, bwLen, bwT, FOOT, bwH + 0.2);
    box(cx + E.ux * (0.35 + bwLen / 2 - bwT / 2) + E.nx * (bwDist / 2), cz + E.uz * (0.35 + bwLen / 2 - bwT / 2) + E.nz * (bwDist / 2), E.nx, E.nz, bwDist + 0.02, bwT, FOOT, bwH);
    const mouth = 0.35 - bwLen / 2 - 0.45;
    box(cx + E.ux * mouth + E.nx * (bwDist + 0.3), cz + E.uz * mouth + E.nz * (bwDist + 0.3), E.nx, E.nz, 1.6, 0.4, GRADE, GRADE + 0.62);
  }
  // the roof slab over the plan and its overhang, with its earth
  const coverThick = style === 'dot' ? 0.5 : style === 'hex' ? 0.16 : 0.26;
  parts.push({ points: grow(plan, overhang).flat(), y0: wallTop, y1: wallTop + slab + coverThick });
  return parts.map((part) => ({ points: part.points.map((v) => Math.round(v * 1000) / 1000), y0: Math.round(part.y0 * 1000) / 1000, y1: Math.round(part.y1 * 1000) / 1000 }));
}

/** A map's pillbox: its intact and destroyed states (one geometry each, in the bunker's frame). */
export function buildPillbox(style: PillboxStyle, tones: FortTones, seed: number, broken: boolean): THREE.BufferGeometry {
  const O = { tones, seed, broken };
  // (round 2: the intact concrete work in the destruction core's pieces; the destroyed state is the settled heap)
  const g = style === 'logearth' ? (broken ? buildLogEarthWreck(O) : buildLogEarthPieces(O)) : broken ? buildConcreteWreck(style, O) : buildConcretePillboxPieces(style, O);
  return g;
}

/**
 * Each map's pillbox: its form and its tones (sRGB hex; linear below), by its setting (periodClutterKit MAP_SETTING_YEAR)
 * and ground. Concrete, earth, turf, crest (the dry grass or sand over the toe), timber, hessian; age 0 fresh .. 1 relic.
 * The desert maps' sangar (structureVariants) and a map absent here keep their own pillbox.
 */
interface FortMapEntry { style: PillboxStyle; c: number; e: number; t: number; k: number; w?: number; b?: number; age: number; arid?: boolean; camo?: 'pattern' | 'whitewash'; barren?: boolean }
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
  moon: { style: 'dot', c: 0x8c8c8c, e: 0x676b73, t: 0x707479, k: 0x7a7e84, age: 0.1, arid: true, barren: true },
  mars: { style: 'dot', c: 0x9a8a7c, e: 0x8a4f35, t: 0x93573a, k: 0xa0634a, age: 0.1, arid: true, barren: true },
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
      bag: hexLin(e.b ?? W_BAG), age: e.age, arid: !!e.arid, ...(e.camo ? { camo: e.camo } : {}), ...(e.barren ? { barren: true } : {}) },
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

/**
 * A map's pillbox bank as a height field in the pillbox's frame (round 2, the destructible-buildings lane; wave 370:
 * "grow the earthwork out of the terrain: the same material and grain as the ground"): the bank's surface over the
 * base at (lx, lz), 0 beyond its toe, NaN inside the walls — the ground cover law's static lift (groundCoverCraters.ts),
 * so the field's own grass stands on the bank. `radius`: how far from the centre the bank reaches.
 */
export function pillboxBankField(style: PillboxStyle, tones: FortTones, seed: number): { lift: (lx: number, lz: number) => number; radius: number } {
  const B = style === 'logearth' ? logEarthBermSpec(tones, seed, false) : concreteBermSpec(style, concreteLayout(style), tones, seed, false);
  const { grid, hs } = bermGrid(B);
  const K = grid.length, R = BERM_T.length;
  let ext = 0;
  for (const row of grid) for (let r = 0; r < R; r++) ext = Math.max(ext, Math.abs(row[r][0]), Math.abs(row[r][2]));
  const cell = 0.15, side = Math.ceil((ext * 2 + 0.6) / cell), half = (side * cell) / 2;
  const h = new Float32Array(side * side);
  // rasterise the bank's top (its rows from the wall to the toe), the highest surface in a cell
  const tri = (a: V3, b: V3, c: V3): void => {
    const x0 = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) + half) / cell)), x1 = Math.min(side - 1, Math.floor((Math.max(a[0], b[0], c[0]) + half) / cell));
    const z0 = Math.max(0, Math.floor((Math.min(a[2], b[2], c[2]) + half) / cell)), z1 = Math.min(side - 1, Math.floor((Math.max(a[2], b[2], c[2]) + half) / cell));
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(d) < 1e-9) return;
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      const px = -half + (ix + 0.5) * cell, pz = -half + (iz + 0.5) * cell;
      const l1 = ((b[2] - c[2]) * (px - c[0]) + (c[0] - b[0]) * (pz - c[2])) / d;
      const l2 = ((c[2] - a[2]) * (px - c[0]) + (a[0] - c[0]) * (pz - c[2])) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
      const y = l1 * a[1] + l2 * b[1] + l3 * c[1];
      if (y > h[iz * side + ix]) h[iz * side + ix] = y;
    }
  };
  for (let i = 0; i < K; i++) {
    const i1 = (i + 1) % K;
    if (hs[i] < 0.02 && hs[i1] < 0.02) continue;
    for (let r = 0; r + 1 < R; r++) { tri(grid[i][r], grid[i1][r], grid[i1][r + 1]); tri(grid[i][r], grid[i1][r + 1], grid[i][r + 1]); }
  }
  // the walls' plan: no cover inside the work
  const plan = style === 'logearth' ? ensureOutward(chamferedRect(LOG_W, LOG_D, 0.05)) : concreteLayout(style).plan;
  const sign = (() => { const a = plan[0], b = plan[1], c = plan[2]; return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0 ? 1 : -1; })();
  const insideSigned = (x: number, z: number): boolean => {
    for (let i = 0; i < plan.length; i++) {
      const a = plan[i], b = plan[(i + 1) % plan.length];
      if (sign * ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])) < 0) return false;
    }
    return true;
  };
  const at = (ix: number, iz: number): number => (ix < 0 || iz < 0 || ix >= side || iz >= side ? 0 : h[iz * side + ix]);
  return {
    radius: ext + 0.3,
    lift(lx, lz) {
      if (insideSigned(lx, lz)) return NaN;
      const fx = (lx + half) / cell - 0.5, fz = (lz + half) / cell - 0.5;
      const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
      const v = (at(ix, iz) * (1 - tx) + at(ix + 1, iz) * tx) * (1 - tz) + (at(ix, iz + 1) * (1 - tx) + at(ix + 1, iz + 1) * tx) * tz;
      return v > 0.01 ? v : 0;
    },
  };
}

/** The whole work's ground (the body and its bank): the field works' road and trunk checks read its band (props.ts). */
export function pillboxFootprintGeometry(style: PillboxStyle, tones: FortTones, seed: number): THREE.BufferGeometry {
  const body = buildPillbox(style, tones, seed, false), bank = pillboxBerm(style, tones, seed);
  const g = mergeGeometries([body, bank], false);
  body.dispose(); bank.dispose();
  if (!g) throw new Error('fortKit: footprint merge failed');
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// the Vallo Alpino blockhouse (props census #5, lane B 2026-10-15): the Savoyard kit's tower plot

const VALLO_STEEL = rgb(0x4a4e4c), VALLO_DOOR = rgb(0x3f4440);

/** The faces of a chamfered square plan (half-size `h`, chamfer `c`): front, its corner, right, ... each right-handed. */
function chamferedFaces(h: number, c: number): Array<{ face: KitFace; main: 'front' | 'right' | 'back' | 'left' | null }> {
  const v: Array<[number, number]> = [[-h + c, h], [h - c, h], [h, h - c], [h, -h + c], [h - c, -h], [-h + c, -h], [-h, -h + c], [-h, h - c]];
  const names = ['front', null, 'right', null, 'back', null, 'left', null] as const;
  return v.map(([ax, az], i) => {
    const [bx, bz] = v[(i + 1) % v.length];
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    // u x up = out
    return { face: { origin: [(ax + bx) / 2, 0, (az + bz) / 2], u: [ux, 0, uz], out: [-uz, 0, ux], width: len }, main: names[i] };
  });
}

/** The chamfered plan grown by `g` (negative: inset), counter-clockwise seen from above, at height y. */
function chamferedPlan(h: number, c: number, g: number, y: number): Array<[number, number, number]> {
  // (the chamfer's line moves out by g along its diagonal normal: it meets the grown sides (2 - sqrt 2) g further in)
  const H = h + g, C = c + g * (2 - Math.SQRT2);
  return [[-H + C, y, H], [H - C, y, H], [H, y, H - C], [H, y, -H + C], [H - C, y, -H], [-H + C, y, -H], [-H, y, -H + C], [-H, y, H - C]];
}

/**
 * A blockhouse of the Vallo Alpino (the Savoyard kit's tower plot; the worklist: "savoyard tower into fortKit with the r2
 * pillbox fracture"; the judges on the old one: "a box with dark slits on stepped plates"). Poured concrete, its arrises
 * chamfered: a squat block on its footing, the walls half a metre thick. The embrasures (Stufenscharten) are cut through
 * the front and both flanks, each splayed in three steps down to the steel plate with its slit, the dark of the
 * casemate behind. The steel door is in a cut doorway at the back under its hood. Over it the roof slab with its overhang
 * and chamfered top, and the observation cupola: a steel drum, its vision slits cut through the band, on the slab with
 * stones bedded round it. The block is recorded as a body for the damage reading (house.ts recordBody: it breaks and
 * falls into its own heap).
 */
export function valloBlockhaus(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink([ctx.rng() * 7.31, ctx.rng() * 5.17]);
  const S = Math.max(3.2, Math.min(3.8, Math.min(ctx.info.w, ctx.info.d) - 0.2)), h = S / 2, H = 3.1, C = 0.4;
  // (the reveal's back a hand before the core's face: the dark there is never laid on the core)
  const wall = 'plaster3' as const, cut = 0.5, reveal = 0.42;
  // the footing, a hand out round the chamfered block and sunk
  sink.prism(wall, chamferedPlan(h, C, 0.25, -0.5), [0, 1, 0], 0.8);
  // the walls: each face holed by its embrasure or its door, the core behind them
  const slit: HoleRect = { u0: -0.55, u1: 0.55, y0: 1.35, y1: 2.05 };
  const door: HoleRect = { u0: -0.48, u1: 0.48, y0: 0.3, y1: 2.25 };
  const faces = chamferedFaces(h, C);
  for (const { face, main } of faces) {
    const holes = main === 'back' ? [door] : main ? [slit] : [];
    holedPolygon(sink, wall, face, [[-face.width / 2, 0.3], [face.width / 2, 0.3], [face.width / 2, H], [-face.width / 2, H]], holes, cut, reveal,
      {}, [], DAMP_EDGE_BREAKS);
  }
  sink.prism(wall, chamferedPlan(h, C, -cut, 0.3), [0, 1, 0], H - 0.3);
  // the embrasures' stepped splays, the steel plate with its slit at the back of each
  const dec = { decor: true } as const;
  for (const { face, main } of faces) {
    if (!main || main === 'back') continue;
    let hw = 0.55, hh = 0.35;
    const yc = (slit.y0 + slit.y1) / 2;
    for (let k = 1; k <= 3; k++) {
      const d0 = k * 0.12, iw = hw - 0.11, ih = hh - 0.06, depth = reveal - d0, o = -d0 - depth / 2;
      faceBox(sink, wall, face, 0, yc + (ih + hh) / 2, o, 2 * hw, hh - ih, depth, dec, 'ends');
      faceBox(sink, wall, face, 0, yc - (ih + hh) / 2, o, 2 * hw, hh - ih, depth, dec, 'ends');
      for (const s of [-1, 1]) faceBox(sink, wall, face, s * (iw + hw) / 2, yc, o, hw - iw, 2 * ih, depth, dec, 'caps');
      hw = iw; hh = ih;
    }
    const plate = { colour: VALLO_STEEL, decor: true };
    const o = -reveal + 0.03;
    faceBox(sink, 'structureMetal', face, 0, yc + (hh + 0.04) / 2, o, 2 * hw, hh - 0.04, 0.03, plate);
    faceBox(sink, 'structureMetal', face, 0, yc - (hh + 0.04) / 2, o, 2 * hw, hh - 0.04, 0.03, plate);
    for (const s of [-1, 1]) faceBox(sink, 'structureMetal', face, s * (hw - 0.04), yc, o, 0.08, 0.08, 0.03, plate);
  }
  // the steel door at the back of its reveal, the hood over the doorway
  const back = faces.find((f) => f.main === 'back')!.face;
  sink.recess = reveal;
  try {
    doorUnit(sink, back, 0, door.y0, door.u1 - door.u0, door.y1 - door.y0, { leaf: VALLO_DOOR, frame: { bucket: 'structureMetal', width: 0.08, out: 0.03, colour: VALLO_STEEL },
      steps: null, leafKind: 'panel', transom: false }, door.y0);
  } finally { sink.recess = 0; }
  faceBox(sink, wall, back, 0, door.y1 + 0.2, 0.1, 1.4, 0.2, 0.2, dec);
  // the roof slab, its overhang and chamfered top
  sink.prism(wall, chamferedPlan(h, C, 0.2, H), [0, 1, 0], 0.38);
  sink.prism(wall, chamferedPlan(h, C, 0.1, H + 0.38), [0, 1, 0], 0.12);
  const top = H + 0.5;
  // the cupola: a steel drum on the slab, its band of vision slits cut through (the dark drum of its inside behind them)
  const cz = -0.2, r = 0.62, steel = { colour: VALLO_STEEL };
  sink.cylinder('structureMetal', [0, top, cz], 'y', 0.42, r, 12, steel, r, false);
  const band = 0.07, slits = 6, seg = Math.PI * 2 / slits, gap = 0.16;
  for (let k = 0; k < slits; k++) sink.cylinder('structureMetal', [0, top + 0.42, cz], 'y', band, r, 3, steel, r, false, k * seg + gap / 2, seg - gap);
  sink.cylinder('dark', [0, top + 0.4, cz], 'y', band + 0.04, r - 0.05, 12, { decor: true }, r - 0.05, false);
  sink.cylinder('structureMetal', [0, top + 0.42 + band, cz], 'y', 0.24, r, 12, steel, r, false);
  sink.cylinder('structureMetal', [0, top + 0.73 + band - 0.07, cz], 'y', 0.3, r, 12, steel, 0.32, true);
  // stones bedded on the slab round it
  const look = ctx.variant;
  for (let k = 0; k < 7; k++) {
    const x = (look() - 0.5) * (S - 0.4), z = (look() - 0.5) * (S - 0.4);
    if (Math.hypot(x, z - cz) < 0.95) continue;
    const yaw = look() * Math.PI;
    sink.box('stone', [x, top + 0.07, z], [0.2 + look() * 0.08, 0.07 + look() * 0.05, 0.15 + look() * 0.06], dec,
      new LocalFrame([Math.cos(yaw), 0, -Math.sin(yaw)], [0, 1, 0], [Math.sin(yaw), 0, Math.cos(yaw)], [0, 0, 0]));
  }
  recordBody(sink, 0, 0, S, S, top, wall);
  return sink.finish();
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
