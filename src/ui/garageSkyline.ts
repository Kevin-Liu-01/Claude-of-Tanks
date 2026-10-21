import * as THREE from 'three';

import { GARAGE_SUN_TRIM } from '../game/garageSkyPresets.ts';
import {
  GARAGE_SKYLINE_NO_DATA,
  GARAGE_SKYLINES,
  type GarageSkylineLandmark,
  type GarageSkylineRecord,
} from './garageSkylines.generated.ts';

/**
 * K10, the outside environment from the map (garage r9): a Garage's horizon ring shaped by its own battlefield and
 * dressed with its own landmarks (tools/generate-garage-skylines.mjs bakes both from the map files).
 *
 * - Four NEAR LAYERS (radii 44-80 m) carry the battlefield's near relief: each layer's crest stands at the elevation
 *   angle the map heightfield shows in its distance band (60-160 m, 160-340 m, 340-720 m, then the far low land), times
 *   the Garage's one elevation factor, so Redrock's canyon walls, Glacier's spurs and Monsoon's jungle rim stand where
 *   they stand in battle. Past the map's edge a layer falls back to low land.
 * - The LANDMARKS stand at their true compass bearing from the Garage's anchor, their distance compressed onto the ring
 *   (58-116 m), their elevation angle compressed by the same factor (small built ones kept legible): jebel walls with
 *   fluted cliffs, bedding, varnish and beehive domes; domed inselbergs; snow massifs with rock ribs, couloirs and a
 *   treeline; frozen lakes; forts, hospice, villages, a wooden church, a sawmill, a hill town, tea terraces, a river.
 *
 * Everything is one unlit vertex-colour mesh (the horizon's existing draw and program): lit by one fixed low sun,
 * hazed toward the sky with distance and toward each foot with valley haze. Pure and deterministic (no random state,
 * no clock): the same map always builds the same skyline. Garages without a style row keep the classic backdrop.
 */

type SkylineBiome = 'redrock' | 'alpine' | 'tatra' | 'naga';

interface SkylineStyle {
  readonly biome: SkylineBiome;
  /** The one elevation factor: a landform's elevation angle in the Garage is this share of its battle elevation. */
  readonly kElev: number;
  /** The haze the far forms fade into (the sky's horizon band in this Garage's weather). */
  readonly haze: number;
  /** Extra haze on every form (dust and mist thicken it). */
  readonly hazeBoost: number;
  /** Haze per doubling of distance past 700 m (clear desert air thin, the monsoon's wet air thick). */
  readonly hazePerOctave: number;
  /** The shade side's light (the sky's fill): low in the desert's hard light, higher under snow and cloud. */
  readonly ambient: number;
  /**
   * The colour of the sky's fill and of the sun, as linear RGB multipliers (neutral when absent). Snow in shade takes
   * the blue sky's colour and in sun a warm white: lit only in grey, Glacier's range read as "a very pale, low-contrast
   * grey faceted shape" (garage r9 g1 r4).
   */
  readonly skyTint?: readonly [number, number, number];
  readonly sunTint?: readonly [number, number, number];
}

const STYLES: Readonly<Partial<Record<string, SkylineStyle>>> = Object.freeze({
  badlands: { biome: 'redrock', kElev: 0.56, haze: 0xd9b89a, hazeBoost: 0.02, hazePerOctave: 0.1, ambient: 0.3 },
  alpine: { biome: 'alpine', kElev: 0.6, haze: 0xc2d2e0, hazeBoost: 0, hazePerOctave: 0.085, ambient: 0.4,
    skyTint: [0.74, 0.88, 1.14], sunTint: [1.05, 1.0, 0.92] },
  winter: { biome: 'tatra', kElev: 0.6, haze: 0xc8d2db, hazeBoost: 0.03, hazePerOctave: 0.12, ambient: 0.44,
    skyTint: [0.8, 0.9, 1.1], sunTint: [1.04, 1.0, 0.94] },
  monsoon: { biome: 'naga', kElev: 0.95, haze: 0xb9c8c6, hazeBoost: 0.05, hazePerOctave: 0.17, ambient: 0.42 },
});

/** True when the Garage of this map builds its horizon from the map's skyline. */
export function garageSkylineEnabled(mapId: string): boolean {
  return Boolean(STYLES[mapId] && GARAGE_SKYLINES[mapId]);
}

const DEG = Math.PI / 180;
const FOOT = -4.5;

const COLORS = new Map<number, THREE.Color>();
function hex(value: number): THREE.Color {
  let color = COLORS.get(value);
  if (!color) {
    color = new THREE.Color(value);
    COLORS.set(value, color);
  }
  return color;
}

/** A stable hash in [0, 1). */
function hash1(i: number, salt: number): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(salt | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
/** Smooth 1D value noise in [0, 1]. */
function noise1(t: number, salt: number): number {
  const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f);
  return hash1(i, salt) * (1 - s) + hash1(i + 1, salt) * s;
}
/** Ridged noise (sharp crests) in [0, 1]. */
function ridged(t: number, salt: number): number {
  return 1 - Math.abs(noise1(t, salt) * 2 - 1);
}

const bandCache = new Map<string, Int16Array>();
function bands(mapId: string, record: GarageSkylineRecord): Int16Array {
  let values = bandCache.get(mapId);
  if (!values) {
    const binary = atob(record.bandsBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    values = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
    bandCache.set(mapId, values);
  }
  return values;
}

/** The map's near relief in one band at a compass bearing (degrees of elevation), or null past the map's edge. */
function bandElevation(mapId: string, record: GarageSkylineRecord, band: number, azDeg: number): number | null {
  const values = bands(mapId, record);
  const n = record.bearings;
  const f = ((((azDeg % 360) + 360) % 360) / 360) * n;
  const i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, t = f - Math.floor(f);
  const a = values[band * n + i0], b = values[band * n + i1];
  if (a === GARAGE_SKYLINE_NO_DATA && b === GARAGE_SKYLINE_NO_DATA) return null;
  if (a === GARAGE_SKYLINE_NO_DATA) return b / 100;
  if (b === GARAGE_SKYLINE_NO_DATA) return a / 100;
  return (a * (1 - t) + b * t) / 100;
}

/** Compass bearing (deg) of a ring angle (the Garage frame's atan2(z, x)) and back. */
const azOf = (theta: number): number => ((90 - theta / DEG) % 360 + 360) % 360;
const thetaOf = (azDeg: number): number => (90 - azDeg) * DEG;
const angleGap = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

/** The ring radius a landmark at this distance stands at. */
const ringRadius = (distM: number): number => THREE.MathUtils.clamp(58 + 15 * Math.log(Math.max(1, distM) / 150), 58, 116);

class SkylineMesh {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];
  maxHeight = 0;
  maxElevation = 0;
  vertex(x: number, y: number, z: number, color: THREE.Color): number {
    const index = this.positions.length / 3;
    this.positions.push(x, y, z);
    this.colors.push(color.r, color.g, color.b);
    this.maxHeight = Math.max(this.maxHeight, y);
    const r = Math.hypot(x, z);
    if (r > 30) this.maxElevation = Math.max(this.maxElevation, Math.atan2(y - 2.35, r) / DEG);
    return index;
  }
}

interface SkylineContext {
  readonly mesh: SkylineMesh;
  readonly style: SkylineStyle;
  readonly sun: THREE.Vector3;
  readonly haze: THREE.Color;
}

/** A frame turned to face the yard at a compass bearing: x across (right, seen from the yard), z away, y up. */
function ringFrame(azDeg: number, radius: number): (x: number, y: number, z: number, out: THREE.Vector3) => THREE.Vector3 {
  const theta = thetaOf(azDeg);
  const ox = Math.cos(theta), oz = Math.sin(theta), ax = -Math.sin(theta), az = Math.cos(theta);
  return (x, y, z, out) => out.set(ox * (radius + z) + ax * x, y, oz * (radius + z) + az * x);
}

/** Smooth 2D value noise in [0, 1]. */
function noise2(x: number, y: number, salt: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number): number => hash1(a * 7919 + b * 104729, salt);
  const top = h(ix, iy) * (1 - sx) + h(ix + 1, iy) * sx;
  const bottom = h(ix, iy + 1) * (1 - sx) + h(ix + 1, iy + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}

/** The fixed light every horizon face takes: ambient sky, the Garage's own sun (its trimmed azimuth and elevation). */
function lightOf(ctx: SkylineContext, n: THREE.Vector3, lift = 0): number {
  return ctx.style.ambient + 0.95 * Math.max(0, n.dot(ctx.sun)) + 0.12 * Math.max(0, n.y) + lift;
}

/** `colour` lit by that light: grey where the style has no tints, else the sky's fill and the sun in their colours. */
function applyLight(ctx: SkylineContext, colour: THREE.Color, n: THREE.Vector3, lift = 0, shade = 1): THREE.Color {
  const { skyTint, sunTint } = ctx.style;
  if (!skyTint || !sunTint) return colour.multiplyScalar(lightOf(ctx, n, lift) * shade);
  const fill = ctx.style.ambient + 0.12 * Math.max(0, n.y) + lift, sun = 0.95 * Math.max(0, n.dot(ctx.sun));
  return colour.setRGB(
    colour.r * (fill * skyTint[0] + sun * sunTint[0]) * shade,
    colour.g * (fill * skyTint[1] + sun * sunTint[1]) * shade,
    colour.b * (fill * skyTint[2] + sun * sunTint[2]) * shade,
  );
}

type Paint = (u: number, v: number, p: THREE.Vector3, slope: number, n: THREE.Vector3, out: THREE.Color) => THREE.Color;

/**
 * A lit, hazed grid: `nu` columns by `nv` rows from `place(u, v)` (u, v in [0, 1]), coloured by `paint` from its height
 * share v, its position, its slope (0 flat to 1 sheer) and its normal; lit by the Garage's sun from its own normal
 * (turned to face the yard) and hazed by `haze(v)`. Smooth (shared vertices) for snowfields, sand and forest; `flat`
 * gives every triangle its own normal and colour, for rock (crisp joints, ribs and couloirs).
 */
function grid(ctx: SkylineContext, nu: number, nv: number,
  place: (u: number, v: number, iu: number, iv: number, out: THREE.Vector3) => THREE.Vector3,
  paint: Paint, haze: (v: number) => number, options: { readonly lift?: number; readonly flat?: boolean } = {}): void {
  const { mesh } = ctx;
  const lift = options.lift ?? 0;
  const cols = nu + 1, rows = nv + 1;
  const pts = new Float32Array(cols * rows * 3);
  const p = new THREE.Vector3();
  for (let iv = 0; iv < rows; iv += 1) {
    for (let iu = 0; iu < cols; iu += 1) {
      place(iu / nu, iv / nv, iu, iv, p);
      const o = (iv * cols + iu) * 3;
      pts[o] = p.x; pts[o + 1] = p.y; pts[o + 2] = p.z;
    }
  }
  const at = (iu: number, iv: number, out: THREE.Vector3): THREE.Vector3 => out.fromArray(pts, (THREE.MathUtils.clamp(iv, 0, nv) * cols + THREE.MathUtils.clamp(iu, 0, nu)) * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3();
  const colour = new THREE.Color();
  const shade = (vShare: number): void => {
    applyLight(ctx, colour, n, lift).lerp(ctx.haze, THREE.MathUtils.clamp(haze(vShare) + ctx.style.hazeBoost, 0, 0.92));
  };
  if (options.flat) {
    const tri = (i0: number, j0: number, i1: number, j1: number, i2: number, j2: number): void => {
      at(i0, j0, a); at(i1, j1, b); at(i2, j2, c);
      n.subVectors(b, a).cross(d.subVectors(c, a));
      if (n.lengthSq() < 1e-12) return;
      n.normalize();
      p.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      if (n.x * -p.x + n.z * -p.z < 0) n.negate();
      const slope = 1 - THREE.MathUtils.clamp(n.y * 1.4, 0, 1);
      const u = (i0 + i1 + i2) / (3 * nu), v = (j0 + j1 + j2) / (3 * nv);
      paint(u, v, p, slope, n, colour);
      shade(v);
      const base = mesh.positions.length / 3;
      mesh.vertex(a.x, a.y, a.z, colour); mesh.vertex(b.x, b.y, b.z, colour); mesh.vertex(c.x, c.y, c.z, colour);
      mesh.indices.push(base, base + 1, base + 2);
    };
    for (let iv = 0; iv < nv; iv += 1) {
      for (let iu = 0; iu < nu; iu += 1) {
        // alternate the diagonal so the facets do not all lean one way
        if ((iu + iv) % 2 === 0) { tri(iu, iv, iu, iv + 1, iu + 1, iv); tri(iu + 1, iv, iu, iv + 1, iu + 1, iv + 1); }
        else { tri(iu, iv, iu, iv + 1, iu + 1, iv + 1); tri(iu, iv, iu + 1, iv + 1, iu + 1, iv); }
      }
    }
    return;
  }
  const first = mesh.positions.length / 3;
  for (let iv = 0; iv < rows; iv += 1) {
    for (let iu = 0; iu < cols; iu += 1) {
      at(iu + 1, iv, a).sub(at(iu - 1, iv, b));
      at(iu, iv + 1, c).sub(at(iu, iv - 1, d));
      n.crossVectors(c, a);
      if (n.lengthSq() < 1e-10) n.set(0, 1, 0);
      n.normalize();
      at(iu, iv, p);
      if (n.x * -p.x + n.z * -p.z < 0) n.negate();
      const slope = 1 - THREE.MathUtils.clamp(n.y * 1.4, 0, 1);
      paint(iu / nu, iv / nv, p, slope, n, colour);
      shade(iv / nv);
      mesh.vertex(p.x, p.y, p.z, colour);
    }
  }
  for (let iv = 0; iv < nv; iv += 1) {
    for (let iu = 0; iu < nu; iu += 1) {
      const i0 = first + iv * cols + iu, i1 = i0 + 1, i2 = i0 + cols, i3 = i2 + 1;
      mesh.indices.push(i0, i2, i1, i1, i2, i3);
    }
  }
}

/** A quad's colour lit by its own normal and hazed (null for a degenerate quad). */
function quadLit(ctx: SkylineContext, corners: readonly THREE.Vector3[], color: THREE.Color, haze: number, shade = 1): THREE.Color | null {
  const n = new THREE.Vector3().subVectors(corners[1], corners[0]).cross(new THREE.Vector3().subVectors(corners[corners.length - 1], corners[0]));
  if (n.lengthSq() < 1e-12) return null;
  n.normalize();
  if (n.x * -corners[0].x + n.z * -corners[0].z < 0) n.negate();
  return applyLight(ctx, color.clone(), n, 0, shade).lerp(ctx.haze, THREE.MathUtils.clamp(haze + ctx.style.hazeBoost, 0, 0.92));
}

/** A quad (or triangle) with one colour per corner. */
function quadVertices(ctx: SkylineContext, corners: readonly THREE.Vector3[], colours: readonly THREE.Color[]): void {
  const { mesh } = ctx;
  const base = mesh.positions.length / 3;
  corners.forEach((v, index) => mesh.vertex(v.x, v.y, v.z, colours[index]));
  if (corners.length === 3) mesh.indices.push(base, base + 1, base + 2);
  else mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** A flat-shaded quad (corners in order) in a colour lit by its normal and hazed. */
function quadColor(ctx: SkylineContext, corners: readonly THREE.Vector3[], color: THREE.Color, haze: number, shade = 1): void {
  const colour = quadLit(ctx, corners, color, haze, shade);
  if (colour) quadVertices(ctx, corners, [colour, colour, colour, colour]);
}

/** A flat-shaded quad in a tone. */
function quad(ctx: SkylineContext, corners: readonly THREE.Vector3[], tone: number, haze: number, shade = 1): void {
  quadColor(ctx, corners, hex(tone), haze, shade);
}

/** A box in a ring frame: walls in `wall`, flat or pitched roof (ridge across x) in `roof`, front face toward the yard. */
function frameBox(ctx: SkylineContext, F: ReturnType<typeof ringFrame>, x0: number, x1: number, z0: number, z1: number,
  foot: number, top: number, wall: number, roof: number, haze: number, ridge = 0): void {
  const P = (x: number, y: number, z: number): THREE.Vector3 => F(x, y, z, new THREE.Vector3());
  quad(ctx, [P(x0, foot, z0), P(x1, foot, z0), P(x1, top, z0), P(x0, top, z0)], wall, haze);
  quad(ctx, [P(x1, foot, z0), P(x1, foot, z1), P(x1, top, z1), P(x1, top, z0)], wall, haze, 0.86);
  quad(ctx, [P(x0, foot, z1), P(x0, foot, z0), P(x0, top, z0), P(x0, top, z1)], wall, haze, 0.86);
  if (ridge > 0) {
    const zm = (z0 + z1) / 2;
    quad(ctx, [P(x0 - 0.15, top, z0 - 0.15), P(x1 + 0.15, top, z0 - 0.15), P(x1 + 0.15, top + ridge, zm), P(x0 - 0.15, top + ridge, zm)], roof, haze);
    quad(ctx, [P(x1, top, z0), P(x1, top, z1), P(x1, top + ridge, zm)], wall, haze, 0.9);
    quad(ctx, [P(x0, top, z1), P(x0, top, z0), P(x0, top + ridge, zm)], wall, haze, 0.9);
  } else {
    quad(ctx, [P(x0, top, z0), P(x1, top, z0), P(x1, top, z1), P(x0, top, z1)], roof, haze);
  }
}

/** A prism (tower, stack, dome drum) in a ring frame, `sides` faces from `foot` to `top`, a cone cap `cap` m high. */
function framePrism(ctx: SkylineContext, F: ReturnType<typeof ringFrame>, x: number, z: number, radius: number, foot: number, top: number,
  tone: number, capTone: number, haze: number, sides = 6, cap = 0): void {
  const P = (px: number, y: number, pz: number): THREE.Vector3 => F(px, y, pz, new THREE.Vector3());
  // only the yard-facing half and the rims round it are seen
  for (let i = 0; i < sides; i += 1) {
    const a0 = Math.PI + (i / sides) * Math.PI * 2, a1 = Math.PI + ((i + 1) / sides) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    if (Math.sin(mid) > 0.55) continue;
    const [x0, z0, x1, z1] = [x + Math.cos(a0) * radius, z + Math.sin(a0) * radius, x + Math.cos(a1) * radius, z + Math.sin(a1) * radius];
    quad(ctx, [P(x0, foot, z0), P(x1, foot, z1), P(x1, top, z1), P(x0, top, z0)], tone, haze);
    if (cap > 0) quad(ctx, [P(x0, top, z0), P(x1, top, z1), P(x, top + cap, z)], capTone, haze);
  }
}

/** A landform's projection onto the ring: its radius, height, half-width and haze. */
interface Projection {
  readonly R: number;
  readonly H: number;
  readonly half: number;
  readonly haze: number;
  readonly elevationDeg: number;
  readonly halfDeg: number;
}

function project(style: SkylineStyle, mark: GarageSkylineLandmark, options: { minElevDeg?: number; minHalfDeg?: number; maxHalfDeg?: number } = {}): Projection {
  const R = ringRadius(mark.distM);
  const e = Math.atan2(mark.heightM, mark.distM) / DEG;
  const elevationDeg = Math.max(style.kElev * e, options.minElevDeg ?? 0);
  // the footprint's extent across the line of sight (a rectangle of length along its strike and width across it)
  const delta = (mark.strikeDeg - mark.azDeg) * DEG;
  const extent = 0.5 * (mark.lengthM * Math.abs(Math.sin(delta)) + mark.widthM * Math.abs(Math.cos(delta)));
  const halfDeg = THREE.MathUtils.clamp(Math.atan2(extent, mark.distM) / DEG, options.minHalfDeg ?? 0.6, options.maxHalfDeg ?? 38);
  const haze = THREE.MathUtils.clamp(0.05 + style.hazePerOctave * Math.log2(Math.max(200, mark.distM) / 700), 0.03, 0.6);
  return { R, H: R * Math.tan(elevationDeg * DEG), half: R * Math.tan(halfDeg * DEG), haze, elevationDeg, halfDeg };
}

// -------------------------------------------------------------------------------------------------------------------
// Landforms
// -------------------------------------------------------------------------------------------------------------------

/**
 * Wadi Rum's jebel: a sand ramp and talus apron, then a sheer cliff of buttress columns (each a ridge of two faces, so
 * the sun picks out one face and leaves the other in shade: the vertical fluting that reads from kilometres), deep
 * chimneys between some of them, bedding tiers across, desert varnish streaking down from the contact, the pale Disi
 * sandstone over it and a skyline of beehive domes; its ends round off into noses.
 */
function addJebel(ctx: SkylineContext, mark: GarageSkylineLandmark, salt: number): Projection {
  const pr = project(ctx.style, mark);
  const F = ringFrame(mark.azDeg, pr.R);
  const H = pr.H, half = pr.half;
  // the columns across the wall: widths 1.4-4 % of its run, a chimney every few
  const edges: number[] = [-half];
  let k = 0;
  while (edges[edges.length - 1] < half - 0.5) {
    const w = (0.035 + 0.05 * hash1(k, salt + 1)) * half * 2 * (H > 12 ? 0.75 : 1);
    edges.push(Math.min(half, edges[edges.length - 1] + Math.max(1.2, w)));
    k += 1;
    if (edges.length > 30) { edges.push(half); break; }
  }
  const crest = (x: number): number => {
    const u = (x + half) / (2 * half);
    const ends = Math.pow(Math.sin(Math.PI * THREE.MathUtils.clamp(u, 0.001, 0.999)), 0.3);
    const tier = 0.9 + 0.1 * Math.round(noise1(u * 3.2, salt) * 3) / 3;
    return H * ends * tier;
  };
  const dome = (x: number): number => 0.09 * H * Math.pow(Math.abs(Math.sin((x / Math.max(3, H * 0.9)) * Math.PI + salt)), 0.8);
  // the cliff to the contact, then the Disi cap rounding back in three rows to the domes' tops
  const ROWS = [0.16, 0.42, 0.64, 0.84, 0.93, 1];
  const SET = [0, 0, 0, 0, 0.05, 0.13]; // the cap's set-back (share of H)
  const P = (x: number, y: number, z: number): THREE.Vector3 => F(x, y, z, new THREE.Vector3());
  const colour = new THREE.Color();
  const cliffTone = (x: number, t: number, column: number, shade: number): THREE.Color => {
    if (t > 0.85) return colour.copy(hex(0xdcb68c)).lerp(hex(0xc69a6e), noise1(x * 0.6, salt + 9) * 0.6).multiplyScalar(shade);
    const bed = Math.floor(t * 9 + noise1(x * 0.08, salt + 2) * 0.9) % 4;
    colour.copy(hex([0x8c3f27, 0xa04c30, 0x7e3924, 0xab5839][bed]));
    // varnish: some columns streaked dark from the contact down; the cliff's foot darker (the talus's shade)
    const streak = hash1(column, salt + 11) > 0.6 ? (1 - Math.abs(t - 0.58) * 2.4) : 0;
    colour.lerp(hex(0x2e1a14), THREE.MathUtils.clamp(streak, 0, 0.66));
    if (t < 0.3) colour.multiplyScalar(0.86 + t * 0.45);
    return colour.multiplyScalar(shade);
  };
  for (let c = 0; c < edges.length - 1; c += 1) {
    const x0 = edges[c], x1 = edges[c + 1], xm = (x0 + x1) / 2 + (hash1(c, salt + 4) - 0.5) * (x1 - x0) * 0.35;
    const w = x1 - x0;
    // a buttress stands forward of its joints; a chimney bites back between its neighbours
    const chimney = hash1(c, salt + 5) > 0.8;
    const apex = chimney ? (0.45 + 0.3 * hash1(c, salt + 7)) * w : -(0.34 + 0.32 * hash1(c, salt + 6)) * w;
    const tops = [crest(x0) + dome(x0), crest(xm) + dome(xm), crest(x1) + dome(x1)];
    for (let r = 0; r < ROWS.length - 1; r += 1) {
      const ya = ROWS[r], yb = ROWS[r + 1];
      const za = SET[r] * H, zb = SET[r + 1] * H;
      // the apex flattens into the cap's rounded domes
      const aa = apex * (r >= 4 ? 0.12 : r >= 3 ? 0.6 : 1), ab = apex * (r + 1 >= 5 ? 0 : r + 1 >= 4 ? 0.12 : r + 1 >= 3 ? 0.6 : 1);
      const L0 = P(x0, ya * tops[0], za), L1 = P(x0, yb * tops[0], zb);
      const M0 = P(xm, ya * tops[1], za + aa), M1 = P(xm, yb * tops[1], zb + ab);
      const R0 = P(x1, ya * tops[2], za), R1 = P(x1, yb * tops[2], zb);
      const tm = (ya + yb) / 2;
      const shade = chimney ? 0.7 : 1;
      quadColor(ctx, [L0, M0, M1, L1], cliffTone(x0, tm, c, shade).clone(), pr.haze);
      quadColor(ctx, [M0, R0, R1, M1], cliffTone(x1, tm, c, shade).clone(), pr.haze);
    }
    // the talus below the column (scree in the cliff's own red), and the sand ramp's pale foot
    const footZ = -(0.14 * H + 2);
    const Ta = P(x0, FOOT, footZ), Tb = P(x1, FOOT, footZ), Tc = P(x1, ROWS[0] * tops[2], 0), Td = P(x0, ROWS[0] * tops[0], 0);
    const ramp = noise1(c * 0.37, salt + 7);
    quadColor(ctx, [Ta, Tb, Tc, Td], colour.copy(hex(0x9c5838)).lerp(hex(0xcc9668), ramp * ramp).clone(), pr.haze + 0.05);
  }
  return pr;
}

/** A domed inselberg: a massif and its lower lobe, each a round jebel: jointed buttress columns round its front (the sun
 * picks out one face of each), bedding tiers and varnish, then a beehive-banded rounded cap; a talus skirt at its foot. */
function addInselberg(ctx: SkylineContext, mark: GarageSkylineLandmark, salt: number): Projection {
  const pr = project(ctx.style, mark, { minElevDeg: 2.4, minHalfDeg: 2.2, maxHalfDeg: 26 });
  const lobes: Array<[number, number, number]> = [[0, 1, 1], [0.62 + 0.2 * hash1(salt, 5), 0.66, 0.58]];
  const colour = new THREE.Color();
  const near = mark.distM < 1200;
  lobes.forEach(([offset, hScale, wScale], lobe) => {
    const half = pr.half * wScale * (offset ? 1 : 0.78);
    const cx = offset * pr.half * (hash1(salt, 6) > 0.5 ? 1 : -1);
    const H = pr.H * hScale;
    const depth = half * 0.85;
    const F = ringFrame(mark.azDeg, pr.R + (offset ? half * 0.4 : 0));
    const P = (phi: number, radius: number, y: number): THREE.Vector3 => F(cx + Math.sin(phi) * half * radius, y, -Math.cos(phi) * depth * radius, new THREE.Vector3());
    const columns = near ? 14 : 8;
    // rows: the wall's foot, two tiers of cliff, the cap's shoulder, the dome
    const ROWS: ReadonlyArray<readonly [number, number]> = [[0.12, 1], [0.4, 0.97], [0.66, 0.93], [0.84, 0.74], [1, 0.3]];
    for (let c = 0; c < columns; c += 1) {
      const a0 = -1.0 + (2 * c) / columns, a1 = -1.0 + (2 * (c + 1)) / columns;
      const am = (a0 + a1) / 2 + (hash1(c + lobe * 17, salt + 3) - 0.5) * 0.4 / columns;
      const out = 0.05 + 0.05 * hash1(c + lobe * 17, salt + 4); // the buttress's apex stands out of the round
      for (let r = 0; r < ROWS.length - 1; r += 1) {
        const [ya, ra] = ROWS[r], [yb, rb] = ROWS[r + 1];
        const oa = r >= 3 ? 0 : out, ob = r + 1 >= 3 ? 0 : out;
        const L0 = P(a0, ra, ya * H), L1 = P(a0, rb, yb * H), M0 = P(am, ra * (1 + oa), ya * H), M1 = P(am, rb * (1 + ob), yb * H);
        const R0 = P(a1, ra, ya * H), R1 = P(a1, rb, yb * H);
        const t = (ya + yb) / 2;
        if (r >= 3) {
          // the beehive cap: horizontal bands
          colour.copy(hex(r === 3 ? 0x9c553c : 0xa86246)).multiplyScalar(0.95 + 0.08 * hash1(c + lobe * 5, salt + 3));
        } else {
          colour.copy(hex([0x8a4630, 0x9a5238, 0x82402c][r % 3])).multiplyScalar(0.94 + 0.1 * hash1(c + lobe * 7, salt + 2));
          if (hash1(c + lobe * 7, salt + 8) > 0.55) colour.lerp(hex(0x2c180f), 0.5 * (1 - Math.abs(t - 0.45) * 2));
        }
        quadColor(ctx, [L0, M0, M1, L1], colour.clone(), pr.haze);
        quadColor(ctx, [M0, R0, R1, M1], colour.clone(), pr.haze);
      }
      // the talus skirt
      quadColor(ctx, [P(a0, 1.25, FOOT), P(a1, 1.25, FOOT), P(a1, 1, ROWS[0][0] * H), P(a0, 1, ROWS[0][0] * H)],
        colour.copy(hex(0xa8633f)).lerp(hex(0xc89062), noise1(c, salt + 9) * 0.6).clone(), pr.haze + 0.04);
    }
  });
  return pr;
}

/** A snow massif: a crest of summits (sharp alpine horns, or the Tatra's broad tops), its face broken into rock ribs
 * (each a ridge of two faces, rock on its steep flanks) with snow couloirs between them and snow on every ledge and
 * up-facing facet; a dark spruce belt at the foot where the biome has one. A jungle range (Monsoon's) is a smooth forest
 * to its crest instead, crowns breaking its line, mist in its folds. */
function addMassif(ctx: SkylineContext, mark: GarageSkylineLandmark, salt: number, low = false): Projection {
  const pr = project(ctx.style, mark, { maxHalfDeg: 34 });
  const F = ringFrame(mark.azDeg, pr.R);
  const biome = ctx.style.biome;
  const alpine = biome === 'alpine', naga = biome === 'naga', tatra = biome === 'tatra';
  const H = pr.H, half = pr.half;
  const peakAt = mark.name === 'the High Tatra' ? 0.62 : 0.3 + 0.4 * hash1(salt, 1);
  const crest = (u: number): number => {
    const ends = Math.pow(Math.sin(Math.PI * THREE.MathUtils.clamp(u, 0.001, 0.999)), naga ? 0.8 : 0.55);
    if (naga) return H * ends * (0.74 + 0.26 * noise1(u * 4, salt) + 0.06 * Math.pow(Math.abs(Math.sin(u * 60 + salt)), 0.5));
    const summit = Math.exp(-Math.pow((u - peakAt) / (alpine ? 0.14 : 0.22), 2));
    const horns = alpine ? 0.26 * Math.pow(ridged(u * 7, salt + 2), 3) : 0.1 * ridged(u * 4, salt + 2);
    return H * ends * (0.5 + 0.42 * summit + horns + 0.05 * noise1(u * 13, salt + 3));
  };
  if (naga) {
    const nu = THREE.MathUtils.clamp(Math.round(half / 2.4), 12, 20);
    grid(ctx, nu, 4, (u, v, _iu, iv, out) => {
      const y = iv === 0 ? FOOT : crest(u) * Math.pow(v, 1.05);
      return F((u - 0.5) * 2 * half, y, -(1 - v) * (0.6 * H + 4), out);
    }, (u, v, _p, _slope, _n, out) => out.copy(hex(noise2(u * 26, v * 4, salt) > 0.55 ? 0x355a34 : 0x284a2d))
      .lerp(hex(0x4c6e40), noise2(u * 70, v * 7, salt + 1) * 0.35),
    (v) => pr.haze + (1 - v) * 0.36);
    return pr;
  }
  // the ribs: columns across the face, each a rib standing forward of its couloirs
  const columns = THREE.MathUtils.clamp(Math.round(half / 2.6), 8, 18);
  // the far ranges (past 5 km, hazed) take the low form's rows: the near walls carry the detail
  const ROWS = low || mark.distM > 5000 ? [0, 0.3, 0.6, 0.82, 1] : [0, 0.16, 0.32, 0.48, 0.62, 0.75, 0.87, 1];
  const P = (x: number, y: number, z: number): THREE.Vector3 => F(x, y, z, new THREE.Vector3());
  const colour = new THREE.Color();
  const back = 0.62 * H + 4; // the face's run back from its foot to its crest
  const at = (x: number, v: number, apex: number): THREE.Vector3 => {
    const u = x / (2 * half) + 0.5;
    const top = crest(u);
    // a ledge every other row: the face steps back a little more there
    const z = -(1 - v) * back + apex * Math.sin(Math.PI * Math.min(1, v * 1.15));
    return P(x, v === 0 ? FOOT : top * Math.pow(v, alpine ? 0.85 : 1.05), z);
  };
  // whether the last tone was forest: the spruce stays dark at range in the clear winter air (it hazed to the snow's grey)
  let lastForest = false;
  // the last tone's cover: snowfields and forest blend softly across their facets, rock keeps its crisp joints
  let lastKind: 'snow' | 'forest' | 'rock' = 'snow';
  const tone = (n: THREE.Vector3, v: number, x: number, c: number, flank: 0 | 1): THREE.Color => {
    const u = x / (2 * half) + 0.5;
    // the spruce forest climbs to the treeline (about half the relief on the High Tatra, most of the foothills), ragged
    // up the ribs and down the couloirs, snow-dusted near its top (garage r9 g1 r2: at 0.3 it all sat behind the near
    // ground and the range read as a white mound)
    // Glacier's ranges (garage r9 g1 r4: "a very pale ... flat" range where the before had green foothills): the Mont
    // Cenis valleys' spruce and larch climb their lower slopes too, lower than the Tatra's (the pass stands above them)
    const treeline = alpine
      ? (mark.heightM < 700 ? 0.46 : 0.26) + 0.1 * noise1(u * 7, salt + 8) + (flank ? 0.05 : -0.05) * (hash1(c, salt + 9) - 0.3)
      : (mark.heightM < 700 ? 0.78 : 0.5) + 0.12 * noise1(u * 7, salt + 8) + (flank ? 0.05 : -0.05) * (hash1(c, salt + 9) - 0.3);
    lastForest = (tatra || alpine) && v < treeline;
    lastKind = lastForest ? 'forest' : 'snow';
    if (lastForest) {
      const dusted = THREE.MathUtils.smoothstep(v, treeline - 0.14, treeline);
      if (alpine) {
        // spruce and larch in stands: three greens by stand, snow lying in the gaps and on the upper fringe
        const stand = hash1(c * 31 + Math.round(v * 20), salt + 4);
        // (the scene's own fog lifts the range again in the Garage: a darker green keeps the belt legible under it)
        return colour.copy(hex(stand < 0.34 ? 0x203a26 : stand < 0.68 ? 0x2b4931 : 0x37583d))
          .lerp(hex(0xb7c5cf), (hash1(c * 5 + Math.round(v * 9), salt + 3) > 0.78 ? 0.4 : 0) + dusted * 0.45);
      }
      return colour.copy(hex(noise1(c * 1.7, salt + 4) > 0.5 ? 0x223029 : 0x2d3b33)).lerp(hex(0x9aa6ac), (hash1(c * 5 + Math.round(v * 9), salt + 3) > 0.72 ? 0.35 : 0) + dusted * 0.4);
    }
    // the rock runs in streaks down one flank of a rib, from high on it toward the foot (it holds no snow: too steep),
    // the couloirs and ledges between the ribs under snow; the steepest facets bare anywhere
    // (r4: Glacier's every rib carried a long streak and the range read as grey blocks: fewer, shorter streaks there)
    const ribbed = hash1(c, salt + 17) > (alpine ? 0.42 : 0.45);
    const rockFlank = hash1(c, salt + 18) > 0.5 ? 1 : 0;
    const rockFrom = (alpine ? 0.34 : 0.18) + 0.6 * hash1(c, salt + 16);
    const rockTo = Math.min(1, rockFrom + (alpine ? 0.18 : 0.3) + (alpine ? 0.3 : 0.5) * hash1(c, salt + 19));
    const snowy = !(ribbed && flank === rockFlank && v > rockFrom && v < rockTo) && n.y > (alpine ? 0.22 : tatra ? 0.3 : 0.22);
    if (!snowy) lastKind = 'rock';
    if (!snowy) return colour.copy(hex(alpine ? 0x434a52 : 0x56606b)).lerp(hex(alpine ? 0x2a3038 : 0x333a42), hash1(c * 13 + Math.round(v * 9), salt + 6) * 0.55);
    // snow: wind-packed white high up, a faint blue-grey in the hollows lower down
    return colour.copy(hex(0xf4f7fa)).lerp(hex(alpine ? 0xc2d0dc : 0xc9d5df), hash1(c * 7 + Math.round(v * 5), salt + 7) * 0.3 + (alpine ? (1 - v) * 0.2 : 0));
  };
  const n = new THREE.Vector3();
  const faceTone = (a: THREE.Vector3, b: THREE.Vector3, c2: THREE.Vector3, v: number, x: number, c: number, flank: 0 | 1): THREE.Color => {
    n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c2, a)).normalize();
    if (n.x * -a.x + n.z * -a.z < 0) n.negate();
    return tone(n, v, x, c, flank).clone();
  };
  // irregular rib widths (a quarter to twice the mean), the ribs wandering across the face row by row
  const edges: number[] = [-half];
  for (let c = 0; c < columns * 2 && edges[edges.length - 1] < half - 0.4; c += 1) {
    edges.push(Math.min(half, edges[edges.length - 1] + (2 * half / columns) * (0.35 + 1.5 * Math.pow(hash1(c, salt + 14), 1.6))));
  }
  if (edges[edges.length - 1] < half) edges.push(half);
  // the facets, lit and hazed; snowfields and forest then take each corner's mean over the facets of their own cover
  // that share it (soft snow, garage r9 g1 r4: the flat facets read as "faceted ... flat"), rock stays flat-shaded
  const facets: Array<{ corners: THREE.Vector3[]; colour: THREE.Color; kind: 'snow' | 'forest' | 'rock' }> = [];
  const pushFacet = (corners: THREE.Vector3[], tint: THREE.Color, haze: number, kind: 'snow' | 'forest' | 'rock'): void => {
    const lit = quadLit(ctx, corners, tint, haze);
    if (lit) facets.push({ corners, colour: lit, kind });
  };
  for (let c = 0; c < edges.length - 1; c += 1) {
    const x0 = edges[c], x1 = edges[c + 1];
    const apex = -(0.2 + 0.4 * hash1(c, salt + 5)) * (x1 - x0);
    const mid = (r: number): number => (x0 + x1) / 2 + (hash1(c * 7 + r, salt + 4) - 0.5) * (x1 - x0) * 0.6;
    for (let r = 0; r < ROWS.length - 1; r += 1) {
      const va = ROWS[r], vb = ROWS[r + 1];
      const L0 = at(x0, va, 0), L1 = at(x0, vb, 0), M0 = at(mid(r), va, apex), M1 = at(mid(r + 1), vb, apex), R0 = at(x1, va, 0), R1 = at(x1, vb, 0);
      const vm = (va + vb) / 2;
      const left = faceTone(L0, M0, L1, vm, x0, c, 0), leftForest = lastForest, leftKind = lastKind;
      const forestHaze = alpine ? 0.35 : 0.5;
      pushFacet([L0, M0, M1, L1], left, (pr.haze + (1 - vm) * 0.08) * (leftForest ? forestHaze : 1), leftKind);
      const right = faceTone(M0, R0, M1, vm, x1, c, 1);
      pushFacet([M0, R0, R1, M1], right, (pr.haze + (1 - vm) * 0.08) * (lastForest ? forestHaze : 1), lastKind);
    }
  }
  const soft = alpine || tatra;
  const key = (v: THREE.Vector3, kind: string): string => `${kind}:${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
  const sums = new Map<string, { colour: THREE.Color; count: number }>();
  if (soft) {
    for (const facet of facets) {
      if (facet.kind === 'rock') continue;
      for (const corner of facet.corners) {
        const k = key(corner, facet.kind);
        const sum = sums.get(k);
        if (sum) { sum.colour.add(facet.colour); sum.count += 1; } else sums.set(k, { colour: facet.colour.clone(), count: 1 });
      }
    }
  }
  for (const facet of facets) {
    if (!soft || facet.kind === 'rock') { quadVertices(ctx, facet.corners, [facet.colour, facet.colour, facet.colour, facet.colour]); continue; }
    quadVertices(ctx, facet.corners, facet.corners.map((corner) => {
      const sum = sums.get(key(corner, facet.kind))!;
      // some of the facet's own light kept, so the ribs still model under the sun (more in the forest: its stands)
      return sum.colour.clone().multiplyScalar(1 / sum.count).lerp(facet.colour, facet.kind === 'forest' ? 0.6 : 0.4);
    }));
  }
  return pr;
}

/** A frozen lake (or a frozen river pool): a flat sheet of grey-blue ice seen over the near ground, white floes and drift
 * streaks on it, a dark pressure crack across it. Or the flood channel's brown water with the sky in it. */
function addLake(ctx: SkylineContext, mark: GarageSkylineLandmark, salt: number, water = false): Projection {
  const pr = project(ctx.style, mark, { minHalfDeg: 6, maxHalfDeg: 30 });
  const Rn = Math.max(46, pr.R - 16), Rf = pr.R + 10;
  const y = water ? -1.1 : -0.75;
  const nu = 18, nv = 3;
  grid(ctx, nu, nv, (u, v, _iu, _iv, out) => {
    const az = mark.azDeg + (u - 0.5) * 2 * pr.halfDeg * (0.8 + 0.2 * Math.sin(v * Math.PI));
    const r = Rn + (Rf - Rn) * v;
    const theta = thetaOf(az);
    return out.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
  }, (u, v, _p, _slope, _n, out) => {
    if (water) return out.copy(hex(0x6a5c44)).lerp(hex(0x8f948c), noise2(u * 14, v * 2, salt) * 0.55);
    const floe = noise2(u * 21, v * 5, salt + 1) > 0.6;
    out.copy(hex(floe ? 0xe8eef2 : 0x9fb3c1)).lerp(hex(0x8aa0b0), noise1(u * 7, salt + 2) * 0.3);
    if (Math.abs(u - 0.55 + 0.1 * Math.sin(v * 3)) < 0.03) out.lerp(hex(0x4f6372), 0.6); // the pressure crack
    return out;
  }, () => pr.haze * 0.6 + 0.05, { lift: 0.18 });
  return pr;
}

/** A tea estate on a near slope: terraces stepping up the hill in bright clipped rows, shade trees between them. */
function addTerraces(ctx: SkylineContext, mark: GarageSkylineLandmark, salt: number): Projection {
  const pr = project(ctx.style, mark, { minElevDeg: 3.2, minHalfDeg: 9, maxHalfDeg: 18 });
  const F = ringFrame(mark.azDeg, pr.R - 6);
  const steps = 7, nu = 14;
  grid(ctx, nu, steps * 2, (u, _v, _iu, iv, out) => {
    const step = Math.floor(iv / 2), riser = iv % 2 === 1;
    const x = (u - 0.5) * 2 * pr.half * (1 - 0.25 * (iv / (steps * 2)));
    const y = iv === 0 ? FOOT : ((step + (riser ? 1 : 0)) / steps) * pr.H * (0.92 + 0.08 * Math.sin(u * 6 + salt));
    const z = -(1 - iv / (steps * 2)) * (pr.H * 1.6 + 4) + (riser ? 0.25 : 0);
    return F(x, y, z, out);
  }, (u, v, _p, slope, _n, out) => {
    if (noise2(u * 9, v * 13, salt + 3) > 0.74) return out.copy(hex(0x2e4a2c)); // shade trees
    return out.copy(slope > 0.5 ? hex(0x5a4a34) : hex(0x5f8a3e)).lerp(hex(0x78a048), noise2(u * 30, v * 14, salt) * 0.35);
  }, (v) => pr.haze + (1 - v) * 0.15, { lift: 0.05 });
  return pr;
}

// -------------------------------------------------------------------------------------------------------------------
// Built landmarks
// -------------------------------------------------------------------------------------------------------------------

/** A stone fort on its spur: a curtain wall, a keep and two drum towers. */
function addFort(ctx: SkylineContext, mark: GarageSkylineLandmark): Projection {
  const pr = project(ctx.style, mark, { minElevDeg: 1.3, minHalfDeg: 1.4 });
  const F = ringFrame(mark.azDeg, pr.R);
  const s = Math.max(pr.half, 1.6), h = Math.max(pr.H, 1.2);
  const base = ringRelief(ctx, mark, pr);
  frameBox(ctx, F, -s, s, 0, s * 0.8, base - 1, base + h * 0.55, 0x8d8a82, 0x6e6c66, pr.haze);
  frameBox(ctx, F, -s * 0.35, s * 0.35, s * 0.15, s * 0.6, base, base + h, 0x9a968c, 0x5a5652, pr.haze);
  for (const x of [-s, s]) framePrism(ctx, F, x, 0.1, s * 0.22, base - 1, base + h * 0.75, 0x86837c, 0x55524e, pr.haze, 6, 0);
  return pr;
}

/** The Hospice: a long stone house under a hipped roof, its chapel's bell turret. */
function addHospice(ctx: SkylineContext, mark: GarageSkylineLandmark): Projection {
  const pr = project(ctx.style, mark, { minElevDeg: 1.1, minHalfDeg: 2.0 });
  const F = ringFrame(mark.azDeg, pr.R);
  const s = pr.half, h = Math.max(pr.H, 1.4), base = ringRelief(ctx, mark, pr);
  frameBox(ctx, F, -s, s, 0, s * 0.45, base - 1, base + h * 0.7, 0xc9c2b2, 0xe6ecef, pr.haze, h * 0.32);
  framePrism(ctx, F, s * 0.6, s * 0.2, s * 0.08, base + h * 0.7, base + h * 1.25, 0xb8b0a0, 0x5a5650, pr.haze, 4, h * 0.2);
  return pr;
}

/** A village: a row of steep-roofed houses (snow on the roofs where it snows) round its church tower. */
function addVillage(ctx: SkylineContext, mark: GarageSkylineLandmark, salt: number): Projection {
  const pr = project(ctx.style, mark, { minElevDeg: 0.9, minHalfDeg: 3.2, maxHalfDeg: 12 });
  const F = ringFrame(mark.azDeg, pr.R);
  const snowy = ctx.style.biome !== 'naga' && ctx.style.biome !== 'redrock';
  const houses = THREE.MathUtils.clamp(mark.houses ?? 8, 5, 11);
  const unit = (pr.half * 2) / houses;
  const base = ringRelief(ctx, mark, pr);
  const wallTones = ctx.style.biome === 'tatra' ? [0x6a4c34, 0x5c4230, 0x7a5a3e] : [0x8a7058, 0xb8ad98, 0x6e5640];
  for (let k = 0; k < houses; k += 1) {
    const x0 = -pr.half + k * unit + unit * 0.12, x1 = x0 + unit * (0.6 + 0.25 * hash1(k, salt));
    const z0 = (hash1(k, salt + 1) - 0.5) * unit * 1.4;
    const eave = Math.max(0.7, pr.H * (0.35 + 0.15 * hash1(k, salt + 2)));
    frameBox(ctx, F, x0, x1, z0, z0 + unit * 0.7, base - 1, base + eave, wallTones[k % 3], snowy ? 0xe4eaee : 0x6a4a3a, pr.haze, eave * 0.8);
  }
  // the church: its tower and spire (or the bulb on the Tatra's wooden churches)
  const cx = -pr.half * 0.15;
  frameBox(ctx, F, cx - unit * 0.22, cx + unit * 0.22, unit * 0.3, unit * 0.75, base - 1, base + pr.H * 1.15, 0xd6d0c4, 0x4a4f55, pr.haze);
  framePrism(ctx, F, cx, unit * 0.52, unit * 0.18, base + pr.H * 1.15, base + pr.H * 1.2, 0x4a4f55, 0x3e4246, pr.haze, 4, pr.H * 0.5);
  return pr;
}

/** A wooden Carpathian church: a shingled nave under a steep roof, its tower with a bulb (onion) dome. */
function addChurch(ctx: SkylineContext, mark: GarageSkylineLandmark): Projection {
  const pr = project(ctx.style, mark, { minElevDeg: 1.6, minHalfDeg: 1.0 });
  const F = ringFrame(mark.azDeg, pr.R);
  const s = Math.max(pr.half, 1.2), h = Math.max(pr.H, 1.6), base = ringRelief(ctx, mark, pr);
  const wood = ctx.style.biome === 'tatra' ? 0x5a4030 : 0xcfc7b6;
  const roof = ctx.style.biome === 'tatra' ? 0xe2e8ec : 0x7a3e30;
  frameBox(ctx, F, -s, s * 0.5, 0, s * 0.7, base - 1, base + h * 0.42, wood, roof, pr.haze, h * 0.3);
  frameBox(ctx, F, s * 0.5, s * 1.05, s * 0.1, s * 0.6, base - 1, base + h * 0.8, wood, roof, pr.haze);
  framePrism(ctx, F, s * 0.78, s * 0.35, s * 0.38, base + h * 0.8, base + h * 0.9, 0x3e3a36, 0x34302c, pr.haze, 6, h * 0.22);
  return pr;
}

/** The sawmill: a tall timber shed, its board stacks and its stack (the atmosphere draws the smoke). */
function addSawmill(ctx: SkylineContext, mark: GarageSkylineLandmark): Projection {
  const pr = project(ctx.style, mark, { minElevDeg: 1.2, minHalfDeg: 2.4 });
  const F = ringFrame(mark.azDeg, pr.R);
  const s = pr.half, h = Math.max(pr.H, 1.2), base = ringRelief(ctx, mark, pr);
  frameBox(ctx, F, -s, s * 0.4, 0, s * 0.6, base - 1, base + h * 0.6, 0x5c4432, 0xe2e8ec, pr.haze, h * 0.35);
  frameBox(ctx, F, s * 0.5, s, -s * 0.2, s * 0.2, base - 1, base + h * 0.25, 0x8a6a48, 0xd8dee2, pr.haze);
  framePrism(ctx, F, -s * 0.6, s * 0.3, s * 0.06, base, base + h * 1.6, 0x4a3e36, 0x2a2624, pr.haze, 5);
  return pr;
}

/** A hill town on its saddle: corrugated and tiled roofs stepping down the terraces, its church. */
function addTown(ctx: SkylineContext, mark: GarageSkylineLandmark, salt: number): Projection {
  const pr = project(ctx.style, mark, { minElevDeg: 1.0, minHalfDeg: 6, maxHalfDeg: 16 });
  const F = ringFrame(mark.azDeg, pr.R);
  const count = 12, unit = (pr.half * 2) / count, base = ringRelief(ctx, mark, pr);
  for (let k = 0; k < count; k += 1) {
    const x0 = -pr.half + k * unit, terrace = Math.abs(Math.sin(k * 0.7 + salt)) * pr.H * 0.9;
    const roof = [0x8a3f30, 0x6e7276, 0x9a5a3e, 0x7a8086][Math.floor(hash1(k, salt) * 4)];
    frameBox(ctx, F, x0 + unit * 0.1, x0 + unit * 0.85, hash1(k, salt + 3) * unit, unit * 1.4, base - 1 + terrace, base + terrace + pr.H * 0.5,
      [0xd8d2c4, 0xc4b8a0, 0xe0dcd2][k % 3], roof, pr.haze, pr.H * 0.28);
  }
  return pr;
}

/** A wayside cross on its crag. */
function addCross(ctx: SkylineContext, mark: GarageSkylineLandmark): Projection {
  const pr = project(ctx.style, mark, { minElevDeg: 0.9, minHalfDeg: 0.35 });
  const F = ringFrame(mark.azDeg, pr.R);
  const h = Math.max(pr.H, 1.1), base = ringRelief(ctx, mark, pr);
  frameBox(ctx, F, -0.09, 0.09, 0, 0.18, base, base + h, 0x3a3634, 0x3a3634, pr.haze * 0.7);
  frameBox(ctx, F, -h * 0.3, h * 0.3, 0, 0.18, base + h * 0.62, base + h * 0.74, 0x3a3634, 0x3a3634, pr.haze * 0.7);
  return pr;
}

/** The height of the near ring's ground under a built landmark (it stands on the land, not in the air or under it). */
function ringRelief(ctx: SkylineContext, mark: GarageSkylineLandmark, pr: Projection): number {
  void ctx; void mark;
  return Math.max(0, pr.R * Math.tan(0.6 * DEG));
}

// -------------------------------------------------------------------------------------------------------------------
// The ring
// -------------------------------------------------------------------------------------------------------------------

/** The landmarks' share of the horizon's triangles (K10: horizon and landmarks together 9,500 or fewer). */
const SKYLINE_LANDMARK_TRIANGLES = 4400;

const LAYERS = [
  { radius: 44, base: -5.4, slant: 5, segments: 112, rows: 8 },
  { radius: 54, base: -6.2, slant: 7, segments: 96, rows: 7 },
  { radius: 66, base: -7.0, slant: 9, segments: 80, rows: 6 },
  { radius: 80, base: -8.0, slant: 11, segments: 64, rows: 5 },
] as const;

export interface GarageSkylineLandmarkReceipt {
  readonly type: string;
  readonly name: string | null;
  readonly azDeg: number;
  readonly distM: number;
  readonly ringRadiusM: number;
  readonly heightM: number;
  readonly halfWidthDeg: number;
  readonly elevationDeg: number;
}

const skylineCache = new Map<string, THREE.BufferGeometry>();
/** Bakes kept, most recent last: two, like the pack cache (the r9 engineering critic: no bake held all session). */
const SKYLINE_CACHE_MAPS = 2;
/** Maps whose prepare or bake is in flight (a count per map): their bakes are never dropped (see pinGarageKitMap). */
const pinnedSkylines = new Map<string, number>();

function trimSkylineCache(): void {
  for (const [map, bake] of skylineCache) {
    if (skylineCache.size <= SKYLINE_CACHE_MAPS) return;
    if (pinnedSkylines.has(map)) continue;
    skylineCache.delete(map);
    bake.dispose();
  }
}

/** Hold a map's skyline bake from its prepare to its pack's build; the returned release is idempotent. */
export function pinGarageSkyline(mapId: string): () => void {
  pinnedSkylines.set(mapId, (pinnedSkylines.get(mapId) ?? 0) + 1);
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    const count = (pinnedSkylines.get(mapId) ?? 1) - 1;
    if (count > 0) pinnedSkylines.set(mapId, count);
    else pinnedSkylines.delete(mapId);
    trimSkylineCache();
  };
}

/**
 * A Garage's horizon for its pack: the bake is deterministic, so each map's is built once and every pack build takes its
 * own copy (the pack disposes what it is given; the Garage revisited skips the rebuild).
 */
export function createGarageSkylineBackdrop(mapId: string): THREE.BufferGeometry {
  return prepareGarageSkyline(mapId).clone();
}

/** Bake a map's skyline into the session cache ahead of its pack build (idempotent); returns the cached bake. */
export function prepareGarageSkyline(mapId: string): THREE.BufferGeometry {
  let geometry = skylineCache.get(mapId);
  if (geometry) skylineCache.delete(mapId);
  else geometry = buildGarageSkyline(mapId);
  skylineCache.set(mapId, geometry);
  // a pack takes its own copy, so an older bake leaves the cache without touching any built pack
  trimSkylineCache();
  return geometry;
}

/**
 * Build a Garage's horizon from its map's skyline. Returns the geometry for the horizon's one draw; its userData
 * receipts the near layers, every landmark (type, name, bearing, ring radius, elevation), the tallest point and the
 * largest elevation angle seen from the opening camera.
 */
export function buildGarageSkyline(mapId: string): THREE.BufferGeometry {
  const style = STYLES[mapId];
  const record = GARAGE_SKYLINES[mapId];
  if (!style || !record) throw new Error(`garage skyline: no skyline for ${mapId}`);
  const mesh = new SkylineMesh();
  // the Garage's own sun (garageSkyPresets.ts GARAGE_SUN_TRIM), so the walls and the yard are lit from one side
  const trim = GARAGE_SUN_TRIM[mapId] ?? { sunElevationDeg: 32, sunAzimuthDeg: 163 };
  const sun = new THREE.Vector3().setFromSphericalCoords(1, (90 - trim.sunElevationDeg) * DEG, trim.sunAzimuthDeg * DEG);
  const ctx: SkylineContext = { mesh, style, sun, haze: hex(style.haze).clone() };
  const salt = Array.from(mapId).reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261) % 100000;

  // the near ground the landmarks claim: a landform drawn as a landmark replaces the band's relief in its sector
  const claims = record.landmarks.filter((mark) => mark.distM < 720 && (mark.type === 'inselberg' || mark.type === 'lake' || mark.type === 'river'))
    .map((mark) => ({ mark, pr: project(style, mark) }));
  const claimed = (layer: number, az: number): { cap: number } | null => {
    for (const { mark, pr } of claims) {
      if (angleGap(az, mark.azDeg) > pr.halfDeg + 3) continue;
      const band = mark.distM < 160 ? 0 : mark.distM < 340 ? 1 : 2;
      if (mark.type === 'lake' || mark.type === 'river') { if (LAYERS[layer].radius < pr.R) return { cap: -1.4 }; continue; }
      if (layer >= band) return { cap: 1.2 };
    }
    return null;
  };

  const biome = style.biome;
  const groundColor = (out: THREE.Color, t: number, slope: number, u: number, layer: number): THREE.Color => {
    // two scales of 2D patches over the band's face (u round the ring, t up its face)
    const n = noise2(u * 90 + layer * 7, t * 3, salt), m = noise2(u * 340 + layer * 3, t * 7, salt + 1);
    switch (biome) {
      case 'redrock': {
        if (slope > 0.6 && t > 0.35) return out.copy(hex(0x95533a)).lerp(hex(0x6e3a2a), m * 0.6);
        // wind ripples across the sand (bands round the ring), drifted pale crests, scattered dark stones
        const ripple = 0.5 + 0.5 * Math.sin(t * 38 + noise2(u * 40, t * 2, salt + 3) * 5);
        out.copy(hex(0xc28356)).lerp(hex(0x9e5d3b), n * 0.75).lerp(hex(0xd8a675), m * 0.35 * (1 - t));
        out.multiplyScalar(0.93 + 0.1 * ripple);
        if (noise2(u * 900, t * 12, salt + 4) > 0.82) out.lerp(hex(0x4a2a1e), 0.5);
        return out;
      }
      case 'alpine': {
        if (slope > 0.62) return out.copy(hex(0x565e65)).lerp(hex(0x3c434a), m * 0.5);
        return out.copy(hex(0xeef3f7)).lerp(hex(0xb6c5d2), Math.min(1, slope * 0.9 + (1 - t) * 0.2 + m * 0.15));
      }
      case 'tatra': {
        // spruce woods along the crests in clumps (dark crowns, snow-laden fringes), snow on the open slopes below
        const clump = noise1(u * 46 + layer * 11, salt + 5);
        const reach = (clump - 0.5) * 2.2;
        if (clump > 0.5 && t > 1 - reach) return out.copy(hex(m > 0.5 ? 0x24322b : 0x303e36)).lerp(hex(0xc4cfd6), t > 1 - reach + 0.15 ? 0 : 0.35);
        if (slope > 0.72) return out.copy(hex(0x6e777d));
        return out.copy(hex(0xe8eef2)).lerp(hex(0xc0ccd6), (1 - t) * 0.3 + slope * 0.3 + m * 0.15);
      }
      case 'naga':
      default: {
        // rain forest: dark folds and lit crowns, the canopy's emergents lighter, the valley floor's mist below
        const crown = noise1(u * 300 + layer * 5, salt + 6);
        return out.copy(hex(n > 0.52 ? 0x23452a : 0x355f33)).lerp(hex(0x5e8746), crown * crown * 0.6 * t).lerp(hex(0x1c3522), (1 - t) * 0.2);
      }
    }
  };
  const crestDetail = (theta: number, layer: number): number => {
    const u = theta / (Math.PI * 2);
    switch (biome) {
      case 'naga': return 0.5 * Math.pow(Math.abs(Math.sin(theta * (17 + layer * 4) + noise1(u * 6, salt) * 2.4)), 0.55)
        + Math.pow(Math.max(0, Math.sin(theta * 7 - salt)), 12) * 0.9;
      case 'tatra': return noise1(u * 46 + layer * 11, salt + 5) > 0.5 ? 0.6 + 0.8 * ridged(u * 260, salt + layer) : 0.1 * noise1(u * 90, salt);
      case 'alpine': return 0.5 * Math.pow(ridged(u * 30, salt + layer), 3);
      case 'redrock':
      default: return 0.25 * noise1(u * 70, salt + layer);
    }
  };
  LAYERS.forEach((layer, layerIndex) => {
    const { segments, rows } = layer;
    const crests = new Float32Array(segments + 1);
    for (let s = 0; s <= segments; s += 1) {
      const theta = (s / segments) * Math.PI * 2;
      const az = azOf(theta);
      let e = layerIndex < 3 ? bandElevation(mapId, record, layerIndex, az) : null;
      if (e === null) e = 0.5 + 1.2 * noise1(theta * 3, salt + layerIndex) + (layerIndex === 3 ? 0.6 : 0);
      const claim = claimed(layerIndex, az);
      let crest = layer.radius * Math.tan(style.kElev * e * DEG) + crestDetail(theta, layerIndex);
      if (claim) crest = Math.min(crest, claim.cap);
      crests[s] = THREE.MathUtils.clamp(crest, -1.6, layer.radius * Math.tan(13 * DEG));
    }
    grid(ctx, segments, rows - 1, (u, v, iu, _iv, out) => {
      const theta = u * Math.PI * 2;
      const crest = crests[iu];
      const shape = 1 - Math.pow(1 - v, 1.35);
      const y = layer.base + (crest - layer.base) * shape;
      const r = layer.radius - layer.slant * (1 - v);
      return out.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
    }, (u, v, _p, slope, _n, out) => groundColor(out, v, slope, u, layerIndex),
    (v) => Math.min(0.7, 0.06 + layerIndex * 0.1 + (1 - v) * 0.16));
  });

  // the landmarks: nearest first, a landform hidden behind nearer, taller ones over its whole span is left out (the far
  // jebels behind Jebel Rum, a far ridge behind the cirque), and the rest keep to the skyline's triangle budget
  const receipts: GarageSkylineLandmarkReceipt[] = [];
  const cover = new Float32Array(360).fill(-90);
  const LANDFORM = new Set(['jebel', 'inselberg', 'massif', 'ridge']);
  const order = record.landmarks.map((mark, index) => ({ mark, index, pr: project(style, mark) }))
    .sort((a, b) => a.mark.distM - b.mark.distM);
  const visible = new Set<number>();
  for (const { mark, index, pr } of order) {
    if (!LANDFORM.has(mark.type)) { visible.add(index); continue; }
    const bins: number[] = [];
    for (let d = -Math.ceil(pr.halfDeg); d <= Math.ceil(pr.halfDeg); d += 1) bins.push(((Math.round(mark.azDeg) + d) % 360 + 360) % 360);
    // a landform's crest falls off toward its ends: only its middle three fifths count as cover
    if (!bins.some((bin) => pr.elevationDeg > cover[bin] + 0.5)) continue;
    visible.add(index);
    const core = Math.ceil(pr.halfDeg * 0.6);
    for (let d = -core; d <= core; d += 1) {
      const bin = ((Math.round(mark.azDeg) + d) % 360 + 360) % 360;
      cover[bin] = Math.max(cover[bin], pr.elevationDeg * 0.85);
    }
  }
  const budget = SKYLINE_LANDMARK_TRIANGLES;
  const before = mesh.indices.length / 3;
  for (const { mark, index } of order) {
    if (!visible.has(index)) continue;
    if (mesh.indices.length / 3 - before > budget && LANDFORM.has(mark.type) && !mark.name) continue;
    const markSalt = salt + index * 131;
    let pr: Projection | null = null;
    switch (mark.type) {
      case 'jebel': pr = addJebel(ctx, mark, markSalt); break;
      case 'inselberg': pr = addInselberg(ctx, mark, markSalt); break;
      case 'massif': pr = addMassif(ctx, mark, markSalt); break;
      case 'ridge': pr = addMassif(ctx, mark, markSalt, true); break;
      case 'lake': pr = addLake(ctx, mark, markSalt); break;
      case 'river': pr = addLake(ctx, mark, markSalt, true); break;
      case 'terraces': pr = addTerraces(ctx, mark, markSalt); break;
      case 'fort': pr = addFort(ctx, mark); break;
      case 'hospice': pr = addHospice(ctx, mark); break;
      case 'village': pr = addVillage(ctx, mark, markSalt); break;
      case 'church': pr = addChurch(ctx, mark); break;
      case 'sawmill': pr = addSawmill(ctx, mark); break;
      case 'town': pr = addTown(ctx, mark, markSalt); break;
      case 'cross': pr = addCross(ctx, mark); break;
      default: break;
    }
    if (pr) {
      receipts.push(Object.freeze({
        type: mark.type, name: mark.name, azDeg: mark.azDeg, distM: mark.distM, ringRadiusM: Number(pr.R.toFixed(2)),
        heightM: Number(pr.H.toFixed(2)), halfWidthDeg: Number(pr.halfDeg.toFixed(2)), elevationDeg: Number(pr.elevationDeg.toFixed(2)),
      }));
    }
  }

  const geometry = new THREE.BufferGeometry();
  const vertexCount = mesh.positions.length / 3;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(vertexCount > 65535 ? new Uint32Array(mesh.indices) : new Uint16Array(mesh.indices), 1));
  geometry.computeBoundingSphere();
  geometry.userData.skyline = mapId;
  geometry.userData.skylineLayers = LAYERS.length;
  geometry.userData.skylineLandmarks = Object.freeze(receipts);
  geometry.userData.maxHeightM = Number(mesh.maxHeight.toFixed(3));
  geometry.userData.maxElevationDeg = Number(mesh.maxElevation.toFixed(2));
  geometry.userData.accentTopM = 0;
  geometry.userData.massTopM = 0;
  geometry.userData.builtHorizon = null;
  return geometry;
}
