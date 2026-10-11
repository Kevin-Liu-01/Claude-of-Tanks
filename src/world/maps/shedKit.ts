// src/world/maps/shedKit.ts — the destructible sheds, rebuilt fracture-ready (the destructible-kits lane, 2026-10-10).
//
// The owner, 2026-10-10: "what about our destructible buildings like the shed and bunkers that need complete
// redesigns?" and "the destruction of buildings needs to be a lot better too, rn its way to sporadic and ugly instead
// of behaving like it would with physics". The old field hut and lean-to were a few vertex-painted boxes under slab
// roofs (structureKit.ts gableLight, makeLeanTo) that broke into a handful of loose sticks.
//
// A shed here is framed the way a carpenter frames one, member by member, and every member is a piece the physical
// destruction can take apart (fractureAnatomy.ts, agreed with the destruction core lane):
// - fieldstone, brick or concrete footings under the sills (the support graph's anchors);
// - hewn sills, corner posts, wall plates, girts let into the posts and studs; board-and-batten or lapped cladding
//   nailed on them in panels of a few boards, cut round a framed window (casing, sill, reveal, sash, muntins, glass
//   set back, shutters) and a ledged and braced door on strap hinges;
// - rafter pairs with collar ties on the plates, a ridge board under its cap, battens, and the region's covering:
//   boards laid board-on-board, tarred felt under lath strips, corrugated fibre-cement sheets or 5V tin; barge boards;
//   a snow load in winter;
// - a porch roof on braced posts, a stoop, a stovepipe and its cap, a bench, a rain barrel; the lean-to's firewood
//   stacks, chopping block and sawbuck.
// Each piece is one contiguous run of the kind's non-indexed geometry with a box that encloses it, its mass, its links
// (rest, nail, bolt) and the scores where it snaps; `geometry.userData.fracture` carries the anatomy.
//
// One material per kind (the pool's `structureWood`): the boards and members take the hewn-oak tile with their grain
// along the tile's v (a board inside one plank lane, a framing member in the straight-grained band), and what is not
// timber (stone, felt, sheet, glass, snow, iron) samples one plain texel of the tile and carries its own colour over
// that texel's value. The weathering lives in the vertex colours: each board its own tone, a damp foot, rain runs,
// moss and lichen on what faces the sky, sun-bleach high up, paint worn back to the wood, rust on tin.
//
// Draw law (brokenDraws.ts): the pool builds from the map's shared props stream, so the caller spends the legacy
// builder's draws and hands this kit a stream of its own (structureKit.ts shedMeta).
//
// Pure geometry: no DOM, no materials. Deterministic in (style, stream).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DamageMeshWriter, FractureMaterial } from '../destructionKit.ts';
import type {
  FractureFace, FractureLink, FractureLinkKind, FracturePiece, FractureRole, KitFractureAnatomy,
} from '../fractureAnatomy.ts';
import { certifyGroundedStructureParts } from '../structureConnectivity.ts';
import { auditRoofPlanePitch } from '../propGeometry.ts';
import { ensureWorldNightEmissionMask, markWorldAperture } from '../worldNightEmissionGeometry.ts';

type Rng = () => number;
type V3 = [number, number, number];
type Rgb = readonly [number, number, number];

// ------------------------------------------------------------------------------------------------- the surface

/** The structure tile's repeats per metre (structureKit's box uv: one 1.82 m tile). */
const UV_PER_M = 0.55;
/** The tile's plank lanes (timberGrain.ts: a seam every 56 px of 256, 4 px wide): a board keeps inside one lane. */
const LANE_U = 56 / 256;
const SEAM_U = 4 / 256;
/** The straight-grained band a framing member's uv keeps to (timberGrain.ts: no knots there). */
const MEMBER_U0 = 0.05;
const MEMBER_U1 = 0.18;
/**
 * A plain texel of the wood tile: the flattest 7 x 7 texels of its straight-grained band (std 0.018 linear), clear of
 * seams, knots and checks. Stone, felt, sheet, glass, snow and iron sample it and carry their colour over its value.
 * (The tile is a CanvasTexture with flipY: v = 1 − row/size.) shedKit.selftest measures it.
 */
export const SHED_FLAT_UV: readonly [number, number] = [0.0957, 0.3496];
/** The tile's linear value at SHED_FLAT_UV and its linear mean over the plank lanes (the albedo is sRGB: the shader
 * reads the decoded value), which the vertex colours are divided by (shedKit.selftest measures both). */
export const SHED_FLAT_LUM = 0.66;
export const SHED_GRAIN_LUM = 0.661;

const DENSITY: Readonly<Partial<Record<FractureMaterial, number>>> = {
  timber: 520, plank: 480, stone: 2500, brick: 1900, concrete: 2400, metal: 7850, glass: 2500, earth: 1600,
  canvas: 400, thatch: 200, tile: 1900, slate: 2700, rubble: 2100, adobe: 1700, plaster: 1600, infill: 1500,
};

// ------------------------------------------------------------------------------------------------- vectors

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** An orthonormal, right-handed frame: z = x × y. */
interface Frame { o: V3; x: V3; y: V3; z: V3 }

/** A frame from its origin, its x and a hint for its y (made orthogonal to x). */
function frame(o: V3, x: V3, yHint: V3): Frame {
  const fx = nrm(x);
  const fz = nrm(cross(fx, yHint));
  return { o, x: fx, y: cross(fz, fx), z: fz };
}
const AXES: Frame = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
function at(f: Frame, lx: number, ly: number, lz: number): V3 {
  return [
    f.o[0] + f.x[0] * lx + f.y[0] * ly + f.z[0] * lz,
    f.o[1] + f.x[1] * lx + f.y[1] * ly + f.z[1] * lz,
    f.o[2] + f.x[2] * lx + f.y[2] * ly + f.z[2] * lz,
  ];
}
function axisOf(f: Frame, k: number): V3 { return k === 0 ? f.x : k === 1 ? f.y : f.z; }
/** Rotation (x, y, z, w) taking the unit axes onto the frame's. */
function quatOf(f: Frame): [number, number, number, number] {
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
/** v rotated by the unit quaternion q = (x, y, z, w). */
function rotate(q: readonly number[], v: V3): V3 {
  const [x, y, z, w] = q;
  const t: V3 = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
}

// ------------------------------------------------------------------------------------------------- noise and colour

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ seed) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** Smooth value noise at unit scale (the caller scales the coordinates), 0..1. */
function vnoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const tx = x - ix, ty = y - iy, tz = z - iz;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), sz = tz * tz * (3 - 2 * tz);
  const v000 = hash3(ix, iy, iz, seed), v100 = hash3(ix + 1, iy, iz, seed);
  const v010 = hash3(ix, iy + 1, iz, seed), v110 = hash3(ix + 1, iy + 1, iz, seed);
  const v001 = hash3(ix, iy, iz + 1, seed), v101 = hash3(ix + 1, iy, iz + 1, seed);
  const v011 = hash3(ix, iy + 1, iz + 1, seed), v111 = hash3(ix + 1, iy + 1, iz + 1, seed);
  const a = v000 + (v100 - v000) * sx, b = v010 + (v110 - v010) * sx;
  const c = v001 + (v101 - v001) * sx, d = v011 + (v111 - v011) * sx;
  const e = a + (b - a) * sy, f = c + (d - c) * sy;
  return e + (f - e) * sz;
}
function fbm(p: V3, scale: number, seed: number): number {
  const x = p[0] / scale, y = p[1] / scale, z = p[2] / scale;
  return vnoise(x, y, z, seed) * 0.62 + vnoise(x * 2.13 + 7.1, y * 2.13, z * 2.13, seed + 7) * 0.38;
}
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number): number => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mulc = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];
const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** An authored sRGB hex as linear albedo. */
const hexLin = (hex: number): Rgb => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
const luma = (c: Rgb): number => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

const MOSS: Rgb = hexLin(0x56602f);
const LICHEN: Rgb = hexLin(0x8f8c62);
const RUST: Rgb = hexLin(0x7a4a2c);
const IRON: Rgb = hexLin(0x2b2a28);
const GLASS: Rgb = hexLin(0x2c3a40);
const SNOW: Rgb = hexLin(0xe1e6ec);
const FRESH_WOOD: Rgb = hexLin(0xc2a27a);
const BARK: Rgb = hexLin(0x4a3b2c);
const LOG_END: Rgb = hexLin(0xa68660);
const ROOM: Rgb = hexLin(0x141210);

// ------------------------------------------------------------------------------------------------- styles

export type ShedRoof = 'boards' | 'felt' | 'fibre' | 'tin';

/** A map's sheds: what they are clad and roofed with, how old and how wet they are (linear albedo). */
export interface ShedStyle {
  readonly id: string;
  readonly cladding: 'boardBatten' | 'lap';
  readonly wood: Rgb;
  readonly woodSpread: number;
  readonly frame: Rgb;
  /** The boards' paint (tar, a faded blue), worn back to the wood by `age`; null: bare timber. */
  readonly paint: Rgb | null;
  readonly trim: Rgb;
  readonly door: Rgb;
  readonly shutter: Rgb | null;
  readonly roof: ShedRoof;
  readonly roofTone: Rgb;
  readonly footing: 'fieldstone' | 'brick' | 'concrete';
  readonly stone: Rgb;
  /** 0..1 moss and algae (an oceanic climate high, a dry one none). */
  readonly moss: number;
  /** 0..1 weathering: sun-bleach, paint wear, mottling, rust. */
  readonly age: number;
  readonly snow: boolean;
}

const style = (s: ShedStyle): ShedStyle => Object.freeze(s);

/** The default, and Verdant's: Prokhorovka in 1943, a kolkhoz field hut of grey spruce boards under a board roof. */
const KOLKHOZ = style({
  id: 'kolkhoz', cladding: 'boardBatten', wood: hexLin(0x7d7264), woodSpread: 0.16, frame: hexLin(0x5d5247),
  paint: null, trim: hexLin(0x6e6253), door: hexLin(0x625545), shutter: hexLin(0x5e7c79), roof: 'boards',
  roofTone: hexLin(0x6f695f), footing: 'fieldstone', stone: hexLin(0x8a8479), moss: 0.45, age: 0.75, snow: false,
});

export const SHED_STYLES: Readonly<Record<string, ShedStyle>> = Object.freeze({
  verdant: KOLKHOZ,
  // Amberford, Normandy 1944: creosoted boards under tarred felt, Caen-stone footings
  autumn: style({ ...KOLKHOZ, id: 'normandy', wood: hexLin(0x54443a), woodSpread: 0.12, frame: hexLin(0x4a3b30),
    trim: hexLin(0x5b4a3c), door: hexLin(0x4d3e32), shutter: null, roof: 'felt', roofTone: hexLin(0x2f2e2f),
    stone: hexLin(0x9d9584), moss: 0.55, age: 0.6 }),
  // Frontier Basin, the Fulda Gap around 1984: a dark-stained field barn under corrugated fibre-cement on concrete
  frontier: style({ ...KOLKHOZ, id: 'hessian', wood: hexLin(0x4c3c30), woodSpread: 0.1, frame: hexLin(0x42342a),
    trim: hexLin(0x5a4a3b), door: hexLin(0x463729), shutter: null, roof: 'fibre', roofTone: hexLin(0x7b7a74),
    footing: 'concrete', stone: hexLin(0x8b8983), moss: 0.35, age: 0.45 }),
  // Tidegate Polders, Zeeland: tarred lapped boards, white trim, a Dutch-green door, felt, brick piers
  polders: style({ ...KOLKHOZ, id: 'zeeland', cladding: 'lap', wood: hexLin(0x5d5349), paint: hexLin(0x262422),
    frame: hexLin(0x3a332d), trim: hexLin(0xc9c3b6), door: hexLin(0x2f4b3c), shutter: hexLin(0x2f4b3c), roof: 'felt',
    roofTone: hexLin(0x2c2c2e), footing: 'brick', stone: hexLin(0x7d4b3b), moss: 0.5, age: 0.45 }),
  // Highland Reservoir, the Eifel in 1944-45: grey boards, felt, greywacke footings
  reservoir: style({ ...KOLKHOZ, id: 'eifel', wood: hexLin(0x6c665d), frame: hexLin(0x50493f), shutter: null,
    roof: 'felt', roofTone: hexLin(0x313133), stone: hexLin(0x6b6964), moss: 0.5, age: 0.7 }),
  // Saltwind Narrows, Dalmatia in 1992: sun-bleached boards under rusting 5V tin on limestone
  saltwind: style({ ...KOLKHOZ, id: 'dalmatian', wood: hexLin(0x9c907d), woodSpread: 0.12, frame: hexLin(0x7d705f),
    trim: hexLin(0x8a7d6b), door: hexLin(0x6f7a72), shutter: hexLin(0x6f7a72), roof: 'tin', roofTone: hexLin(0x8f918c),
    stone: hexLin(0xb7af9e), moss: 0.04, age: 0.85 }),
  // Frosthollow, the Podhale in January 1945: dark spruce under a board roof and its snow
  winter: style({ ...KOLKHOZ, id: 'podhale', wood: hexLin(0x5b4e41), woodSpread: 0.12, frame: hexLin(0x463b31),
    trim: hexLin(0x6b5b49), door: hexLin(0x54473a), shutter: null, roof: 'boards', roofTone: hexLin(0x5d554b),
    stone: hexLin(0x817c75), moss: 0.25, age: 0.7, snow: true }),
  // Saltmere Bay, Brittany in the 1960s: boards in a faded blue worn grey, felt, granite
  coastal: style({ ...KOLKHOZ, id: 'breton', wood: hexLin(0x726c63), paint: hexLin(0x5f7884), trim: hexLin(0xb5b2a9),
    door: hexLin(0x4f6a76), shutter: hexLin(0x4f6a76), roof: 'felt', roofTone: hexLin(0x2e2e30),
    stone: hexLin(0x8e8a83), moss: 0.6, age: 0.6 }),
  // Longleaf Crossing, a Southern mill town around 1940: unpainted heart pine under rusting 5V tin on brick piers
  longleaf: style({ ...KOLKHOZ, id: 'longleaf', wood: hexLin(0x8b7b69), woodSpread: 0.14, frame: hexLin(0x6a5c4c),
    trim: hexLin(0x7c6d5c), door: hexLin(0x6a5b4b), shutter: null, roof: 'tin', roofTone: hexLin(0x8d8f8b),
    footing: 'brick', stone: hexLin(0x8b503d), moss: 0.25, age: 0.7 }),
  // Aegis Crossing, the Serranía: bleached boards under rusting tin on pale limestone
  cliffbridge: style({ ...KOLKHOZ, id: 'serrania', wood: hexLin(0x9a8a73), frame: hexLin(0x7a6a56), shutter: null,
    roof: 'tin', roofTone: hexLin(0x8a8a84), stone: hexLin(0xc4bdad), moss: 0.06, age: 0.8 }),
});

export function shedStyleFor(mapId: string | null | undefined): ShedStyle {
  return (mapId && SHED_STYLES[mapId]) || KOLKHOZ;
}
export const SHED_DEFAULT_STYLE = KOLKHOZ;

// ------------------------------------------------------------------------------------------------- the writer

type UvMode = 'flat' | { grain: 0 | 1 | 2; u0: number; v0: number };

/** How a primitive looks: its albedo, how its uv takes the tile, how many segments carry its weathering. */
interface Look {
  tone: Rgb;
  uv: UvMode;
  /** Segments along the grain axis (the vertex colours' resolution). */
  seg?: number;
  /** End-grain darkening (default 0.7). */
  endDark?: number;
  /** How much of the style's weathering (default 1; 0 for glass and snow). */
  weather?: number;
  /** A painted board: its paint over `tone` (the bare wood), worn by the style's age. */
  paint?: Rgb | null;
  /** A covering facing the sky: lichen and moss as on a roof. */
  roof?: boolean;
  /** Rust streaks (tin). */
  rust?: boolean;
}

interface PieceSpec {
  role: FractureRole;
  material: FractureMaterial;
  face?: FractureFace;
  anchor?: boolean;
  /** The box's axes; `scores` are coordinates along `scoreAxis` in this frame. */
  axes: Frame;
  scoreAxis?: 0 | 1 | 2;
  scores?: readonly number[];
  /** Contact points for a piece its box fits badly (a rafter pair's A), in the prop frame. */
  points?: readonly V3[];
  edgeRadiusM?: number;
  roofPitch?: { axis: 'x' | 'z'; outwardSign: -1 | 1; angleRad: number; kind: 'gable' | 'skillion' };
}

interface BuiltPiece {
  geometry: THREE.BufferGeometry;
  spec: PieceSpec;
  axis: 0 | 1 | 2;
  /** The box's centre in its own axes (scores are measured from it). */
  mid: V3;
  c: V3;
  h: V3;
  q: [number, number, number, number];
  massKg: number;
  scores: number[];
}

/** One kind's build: its geometry (one run a piece) and the anatomy that names the runs. */
export interface ShedBuild {
  geometry: THREE.BufferGeometry;
  anatomy: KitFractureAnatomy;
}

const FLAT_PAIR: [number, number] = [SHED_FLAT_UV[0], SHED_FLAT_UV[1]];

class ShedWriter {
  private p: number[] = [];
  private n: number[] = [];
  private t: number[] = [];
  private c: number[] = [];
  private panes: THREE.BufferGeometry[] = [];
  private volume = 0;
  private density = 500;
  private spec: PieceSpec | null = null;
  readonly built: BuiltPiece[] = [];
  readonly links: FractureLink[] = [];

  readonly style: ShedStyle;
  readonly rng: Rng;
  readonly salt: number;

  constructor(style: ShedStyle, rng: Rng, salt: number) {
    this.style = style;
    this.rng = rng;
    this.salt = salt;
  }

  /** A board's uv: inside one plank lane of the tile, anywhere along its grain. */
  plankUv(widthM: number, grain: 0 | 1 | 2): UvMode {
    const w = Math.min(widthM * UV_PER_M, LANE_U - SEAM_U - 0.01);
    const lane = Math.floor(this.rng() * 4);
    const lo = lane * LANE_U + SEAM_U + 0.004, hi = (lane + 1) * LANE_U - 0.004 - w;
    return { grain, u0: lo + (hi - lo) * this.rng(), v0: this.rng() };
  }
  /** A framing member's uv: the straight-grained band. */
  memberUv(widthM: number, grain: 0 | 1 | 2): UvMode {
    const w = Math.min(widthM * UV_PER_M, MEMBER_U1 - MEMBER_U0 - 0.005);
    return { grain, u0: MEMBER_U0 + (MEMBER_U1 - MEMBER_U0 - w) * this.rng(), v0: this.rng() };
  }

  begin(spec: PieceSpec): number {
    if (this.spec) throw new Error('shedKit: piece begun inside another');
    this.spec = spec;
    this.volume = 0;
    this.density = DENSITY[spec.material] ?? 500;
    return this.built.length;
  }

  end(): number {
    const spec = this.spec;
    if (!spec) throw new Error('shedKit: piece ended without a begin');
    if (!this.p.length && !this.panes.length) throw new Error(`shedKit: empty ${spec.role} piece`);
    const main = new THREE.BufferGeometry();
    main.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    main.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    main.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
    main.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    let geometry = ensureWorldNightEmissionMask(main);
    if (this.panes.length) {
      const merged = mergeGeometries([main, ...this.panes.map(ensureWorldNightEmissionMask)], false);
      if (!merged) throw new Error(`shedKit: ${spec.role} piece merge failed`);
      main.dispose();
      for (const pane of this.panes) pane.dispose();
      geometry = merged;
    }
    if (spec.roofPitch) {
      geometry.userData.roofPlanePitch = { ...spec.roofPitch };
      if (spec.roofPitch.kind === 'skillion') {
        const { axis, outwardSign, angleRad } = spec.roofPitch;
        geometry.userData.skillionRoofPitch = { axis, outwardSign, angleRad };
      }
    }
    // the box: the piece's extent along its own axes
    const pos = geometry.getAttribute('position');
    const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
    const ax = spec.axes;
    for (let i = 0; i < pos.count; i++) {
      const d: V3 = [pos.getX(i) - ax.o[0], pos.getY(i) - ax.o[1], pos.getZ(i) - ax.o[2]];
      for (let k = 0; k < 3; k++) {
        const s = dot(d, axisOf(ax, k));
        if (s < lo[k]) lo[k] = s;
        if (s > hi[k]) hi[k] = s;
      }
    }
    const mid: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const h: V3 = [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2];
    const longest = h[0] >= h[1] && h[0] >= h[2] ? 0 : h[1] >= h[2] ? 1 : 2;
    const axis = spec.scoreAxis ?? longest;
    const piece: BuiltPiece = {
      geometry, spec, axis, mid, c: at(ax, mid[0], mid[1], mid[2]), h, q: quatOf(ax),
      massKg: Math.max(0.5, this.volume * this.density), scores: [],
    };
    this.built.push(piece);
    this.rescore(this.built.length - 1, spec.scores ?? []);
    this.p = []; this.n = []; this.t = []; this.c = []; this.panes = [];
    this.spec = null;
    return this.built.length - 1;
  }

  /** Set a finished piece's scores from coordinates along its score axis (in its own frame). */
  rescore(index: number, coordinates: readonly number[]): void {
    const piece = this.built[index];
    const half = piece.h[piece.axis];
    piece.scores = coordinates
      .map((s) => s - piece.mid[piece.axis])
      .filter((s) => Math.abs(s) < half - 0.04)
      .sort((a, b) => a - b)
      .filter((s, i, all) => i === 0 || s - all[i - 1] > 0.08)
      .slice(0, 6)
      .map((s) => Math.round(s * 1000) / 1000);
  }

  link(a: number, b: number, kind: FractureLinkKind): void {
    if (a === b || a < 0 || b < 0) return;
    if (this.links.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return;
    this.links.push({ a, b, kind });
  }

  addVolume(m3: number): void { this.volume += Math.abs(m3); }

  // --- colour

  /** The vertex colour at p (normal n): the look's albedo, weathered, over the tile's value. */
  shade(look: Look, p: V3, n: V3, end: boolean, flat: boolean): Rgb {
    const st = this.style, w = look.weather ?? 1;
    let c: Rgb = look.tone;
    if (look.paint) {
      // paint worn back to the wood: patchy, thinner at the foot
      const wear = smooth(0.4, 0.9, fbm(p, 0.35, this.salt + 101) * 0.75 + st.age * 0.35
        + (1 - smooth(0.1, 0.7, p[1])) * 0.2);
      c = mix(look.paint, look.tone, wear * 0.85);
    }
    if (w > 0) {
      const mottle = fbm(p, 0.8, this.salt + 11) - 0.5;
      c = mulc(c, 1 + mottle * w * (0.18 + st.age * 0.14));
      // the damp foot: darker to half a metre, its edge wandering
      const footTop = 0.32 + vnoise(p[0] * 2.1, p[2] * 2.1, 0.5, this.salt + 31) * 0.35;
      const foot = 1 - smooth(0.02, footTop, p[1]);
      c = mix(c, mulc(c, 0.58), foot * 0.75 * w);
      // vertical rain runs on the walls (value noise stretched down the wall)
      if (Math.abs(n[1]) < 0.3 && !look.roof) {
        const run = vnoise(p[0] * 9 + p[2] * 9, p[1] * 0.7, 0.5, this.salt + 41);
        c = mulc(c, 1 - smooth(0.62, 0.92, run) * 0.18 * w * (0.5 + st.age * 0.5));
      }
      // moss and lichen on what faces the sky (a roof, a sill's top, a footing) and at the foot
      if (st.moss > 0) {
        const up = clamp01(n[1]);
        const spot = smooth(0.45, 0.78, fbm(p, look.roof ? 0.55 : 0.4, this.salt + 23));
        const lowRoof = look.roof ? 1 - smooth(2.4, 4.0, p[1]) * 0.6 : 0;
        const amount = st.moss * w * spot * (look.roof ? 0.55 + lowRoof * 0.45 : up * 0.7 + foot * 0.45);
        const tint = look.roof && vnoise(p[0] * 3.3, p[1] * 3.3, p[2] * 3.3, this.salt + 29) > 0.55 ? LICHEN : MOSS;
        c = mix(c, tint, clamp01(amount) * 0.75);
      }
      if (look.rust) {
        // runs down the slope from the nail rows and laps, a little bloom between them
        const streak = smooth(0.5, 0.85, vnoise(p[0] * 4.3 + p[2] * 4.3, p[1] * 0.45, 0.3, this.salt + 61));
        const patch = smooth(0.68, 0.9, fbm(p, 0.6, this.salt + 67));
        c = mix(c, RUST, clamp01(streak * 0.62 + patch * 0.25) * st.age);
      }
      // sun-bleach high up: greyer and lighter
      const bleach = st.age * w * clamp01((p[1] - 1.1) / 2.6) * 0.22 + (look.roof ? st.age * 0.1 : 0);
      const g = luma(c) * 1.12;
      c = mix(c, [g, g * 0.985, g * 0.96], bleach);
    }
    if (end) c = mulc(c, look.endDark ?? 0.7);
    const k = 1 / (flat ? SHED_FLAT_LUM : SHED_GRAIN_LUM);
    return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
  }

  // --- primitives

  private vertex(p: V3, nn: V3, u: number, v: number, col: Rgb): void {
    this.p.push(p[0], p[1], p[2]);
    this.n.push(nn[0], nn[1], nn[2]);
    this.t.push(u, v);
    this.c.push(col[0], col[1], col[2]);
  }

  /** A planar quad (corners in order round it) with per-corner normals; the winding follows the mean normal. */
  quad(pts: readonly V3[], normals: readonly V3[], uv: readonly (readonly [number, number])[], cols: readonly Rgb[]): void {
    const mean = nrm(add(add(normals[0], normals[1]), add(normals[2], normals[3])));
    const fwd = dot(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])), mean) >= 0;
    const order = fwd ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const i of order) this.vertex(pts[i], normals[i], uv[i][0], uv[i][1], cols[i]);
  }

  private tri(a: V3, b: V3, c: V3, look: Look): void {
    const nn = nrm(cross(sub(b, a), sub(c, a)));
    for (const p of [a, b, c]) this.vertex(p, nn, FLAT_PAIR[0], FLAT_PAIR[1], this.shade(look, p, nn, false, true));
  }

  /** A box between lo and hi in the frame's coordinates. `skip`: bit 2k leaves out face −k, bit 2k+1 face +k. */
  box(f: Frame, lo: V3, hi: V3, look: Look, skip = 0): void {
    const flat = look.uv === 'flat';
    const g = flat ? -1 : (look.uv as { grain: number }).grain;
    const u0 = flat ? 0 : (look.uv as { u0: number }).u0, v0 = flat ? 0 : (look.uv as { v0: number }).v0;
    const segs = Math.max(1, look.seg ?? 1);
    this.addVolume((hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]));
    for (let k = 0; k < 3; k++) {
      for (const s of [-1, 1] as const) {
        if (skip & (1 << (k * 2 + (s > 0 ? 1 : 0)))) continue;
        const a = (k + 1) % 3, b = (k + 2) % 3;
        const along = g === a ? a : g === b ? b : -1;
        const cut = along >= 0 ? segs : 1;
        const nn = scl(axisOf(f, k), s);
        const fk = s > 0 ? hi[k] : lo[k];
        for (let i = 0; i < cut; i++) {
          const corner = (ia: number, ib: number): V3 => {
            const l: V3 = [0, 0, 0];
            l[k] = fk;
            l[a] = ia ? hi[a] : lo[a];
            l[b] = ib ? hi[b] : lo[b];
            if (along >= 0) {
              const tt = (along === a ? ia : ib) ? (i + 1) / cut : i / cut;
              l[along] = lo[along] + (hi[along] - lo[along]) * tt;
            }
            return l;
          };
          const local = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
          const world = local.map((l) => at(f, l[0], l[1], l[2]));
          const uv = local.map((l): [number, number] => {
            if (flat) return FLAT_PAIR;
            if (g === k) return [u0 + (l[a] - lo[a]) * UV_PER_M * 0.3, v0 + (l[b] - lo[b]) * UV_PER_M * 0.3];
            const across = g === a ? b : a;
            return [u0 + (l[across] - lo[across]) * UV_PER_M, v0 + (l[g] - lo[g]) * UV_PER_M];
          });
          const cols = world.map((p) => this.shade(look, p, nn, g === k, flat));
          this.quad(world, [nn, nn, nn, nn], uv, cols);
        }
      }
    }
  }

  /** A convex polygon in the frame's xy plane (counter-clockwise seen from +z) extruded from z0 to z1; its grain along
   * the frame's x (0) or y (1). */
  prism(f: Frame, poly: readonly (readonly [number, number])[], z0: number, z1: number, look: Look, backCap = true): void {
    const flat = look.uv === 'flat';
    const g = flat ? 1 : (look.uv as { grain: number }).grain;
    const u0 = flat ? 0 : (look.uv as { u0: number }).u0, v0 = flat ? 0 : (look.uv as { v0: number }).v0;
    let minX = Infinity, minY = Infinity, area = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
      minX = Math.min(minX, x0); minY = Math.min(minY, y0);
      area += x0 * y1 - x1 * y0;
    }
    this.addVolume(area / 2 * (z1 - z0));
    const capUv = (x: number, y: number): [number, number] => {
      if (flat) return FLAT_PAIR;
      return g === 1 ? [u0 + (x - minX) * UV_PER_M, v0 + (y - minY) * UV_PER_M]
        : [u0 + (y - minY) * UV_PER_M, v0 + (x - minX) * UV_PER_M];
    };
    for (const [zc, s] of [[z1, 1], [z0, -1]] as const) {
      if (s < 0 && !backCap) continue;
      const nn = scl(f.z, s);
      for (let i = 1; i + 1 < poly.length; i++) {
        for (const j of s > 0 ? [0, i, i + 1] : [0, i + 1, i]) {
          const [x, y] = poly[j];
          const p = at(f, x, y, zc);
          const [u, v] = capUv(x, y);
          this.vertex(p, nn, u, v, this.shade(look, p, nn, false, flat));
        }
      }
    }
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
      const ex = x1 - x0, ey = y1 - y0, len = Math.hypot(ex, ey);
      if (len < 1e-6) continue;
      const nl = [ey / len, -ex / len];
      const nn = nrm(add(scl(f.x, nl[0]), scl(f.y, nl[1])));
      const pts = [at(f, x0, y0, z0), at(f, x1, y1, z0), at(f, x1, y1, z1), at(f, x0, y0, z1)];
      const endGrain = !flat && Math.abs(g === 1 ? nl[1] : nl[0]) > 0.7;
      const along = (x: number, y: number) => (g === 1 ? y - minY : x - minX);
      const uv: [number, number][] = flat ? [FLAT_PAIR, FLAT_PAIR, FLAT_PAIR, FLAT_PAIR]
        : [[u0, v0 + along(x0, y0) * UV_PER_M], [u0, v0 + along(x1, y1) * UV_PER_M],
          [u0 + (z1 - z0) * UV_PER_M, v0 + along(x1, y1) * UV_PER_M], [u0 + (z1 - z0) * UV_PER_M, v0 + along(x0, y0) * UV_PER_M]];
      this.quad(pts, [nn, nn, nn, nn], uv, pts.map((p) => this.shade(look, p, nn, endGrain, flat)));
    }
  }

  /** A cylinder along the frame's y from y0 to y1 (n sides, smooth normals); caps optional. */
  cylinder(f: Frame, r0: number, r1: number, y0: number, y1: number, sides: number, look: Look, caps = true): void {
    const flat = look.uv === 'flat';
    const u0 = flat ? 0 : (look.uv as { u0: number }).u0, v0 = flat ? 0 : (look.uv as { v0: number }).v0;
    this.addVolume(Math.PI * ((r0 + r1) / 2) ** 2 * (y1 - y0));
    const slope = (r0 - r1) / Math.max(1e-6, y1 - y0);
    const ring = (j: number, r: number, y: number): { p: V3; n: V3 } => {
      const a = (j / sides) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
      return { p: at(f, cx * r, y, cz * r), n: nrm(add(add(scl(f.x, cx), scl(f.z, cz)), scl(f.y, slope))) };
    };
    for (let j = 0; j < sides; j++) {
      const q = [ring(j, r0, y0), ring(j + 1, r0, y0), ring(j + 1, r1, y1), ring(j, r1, y1)];
      const uv = q.map((_, i): [number, number] => flat ? FLAT_PAIR
        : [u0 + ((j + (i === 1 || i === 2 ? 1 : 0)) / sides) * 0.1, v0 + (i >= 2 ? (y1 - y0) * UV_PER_M : 0)]);
      this.quad(q.map((v) => v.p), q.map((v) => v.n), uv, q.map((v) => this.shade(look, v.p, v.n, false, flat)));
    }
    if (!caps) return;
    for (const [y, r, s] of [[y1, r1, 1], [y0, r0, -1]] as const) {
      const nn = scl(f.y, s);
      const centre = at(f, 0, y, 0);
      for (let j = 0; j < sides; j++) {
        const p0 = ring(j, r, y).p, p1 = ring(j + 1, r, y).p;
        for (const p of s > 0 ? [centre, p1, p0] : [centre, p0, p1]) {
          this.vertex(p, nn, FLAT_PAIR[0], FLAT_PAIR[1], this.shade(look, p, nn, true, true));
        }
      }
    }
  }

  /** An irregular stone: a box whose corners its own stream pushes about, faceted. */
  stone(f: Frame, lo: V3, hi: V3, look: Look, jitter = 0.18): void {
    const size = sub(hi, lo);
    const corner: V3[] = [];
    for (let i = 0; i < 8; i++) {
      const l: V3 = [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
      for (let k = 0; k < 3; k++) l[k] += (this.rng() - 0.5) * jitter * size[k];
      corner.push(at(f, l[0], l[1], l[2]));
    }
    this.addVolume(size[0] * size[1] * size[2] * 0.8);
    for (const [a, b, c, d] of [[0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5]]) {
      // (the faces are listed clockwise seen from outside)
      this.tri(corner[a], corner[c], corner[b], look);
      this.tri(corner[a], corner[d], corner[c], look);
    }
  }

  /** A pane of glass (a thin box), lit as a window at night, facing `out`. */
  pane(f: Frame, lo: V3, hi: V3, out: V3): void {
    const keep = { p: this.p, n: this.n, t: this.t, c: this.c };
    this.p = []; this.n = []; this.t = []; this.c = [];
    this.box(f, lo, hi, { tone: GLASS, uv: 'flat', weather: 0 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    markWorldAperture(g, [out[0], out[1], out[2]]);
    this.panes.push(g);
    this.p = keep.p; this.n = keep.n; this.t = keep.t; this.c = keep.c;
  }

  /** Certify, merge (one run a piece), write the anatomy. */
  finish(kind: string, cap: number): ShedBuild {
    if (this.spec) throw new Error('shedKit: unfinished piece');
    if (this.built.length > cap) throw new Error(`shedKit: ${kind} has ${this.built.length} pieces (cap ${cap})`);
    const parts = this.built.map((b) => b.geometry);
    const connectivity = certifyGroundedStructureParts(kind, parts);
    const roofPlanePitches = parts.filter((g) => g.userData.roofPlanePitch).map((g) => auditRoofPlanePitch(g));
    const geometry = mergeGeometries(parts, false);
    if (!geometry) throw new Error(`shedKit: ${kind} merge failed`);
    const pieces: FracturePiece[] = [];
    let tri0 = 0;
    for (const b of this.built) {
      const triN = b.geometry.getAttribute('position').count / 3;
      pieces.push({
        role: b.spec.role, material: b.spec.material, bucket: 'structureWood', tri0, triN,
        c: b.c.map((v) => Math.round(v * 10000) / 10000) as unknown as V3,
        h: b.h.map((v) => Math.round(v * 10000) / 10000 + 0.0001) as unknown as V3,
        q: b.q, massKg: Math.round(b.massKg * 10) / 10,
        ...(b.spec.anchor ? { anchor: true as const } : {}),
        ...(b.spec.face ? { face: b.spec.face } : {}),
        ...(b.scores.length ? { scoreAxis: b.axis, scores: b.scores } : {}),
        // contact points in the piece's box frame (fractureAnatomy.ts)
        ...(b.spec.points ? { points: b.spec.points.map((pt) => boxLocal(b, pt)), edgeRadiusM: b.spec.edgeRadiusM ?? 0.05 } : {}),
      });
      tri0 += triN;
      b.geometry.dispose();
    }
    const anatomy: KitFractureAnatomy = { kind, pieces, links: this.links.slice() };
    assertSupported(anatomy);
    geometry.userData.structureConnectivity = connectivity;
    geometry.userData.roofPlanePitches = roofPlanePitches;
    geometry.userData.skillionRoofPitches = roofPlanePitches
      .filter((pitch) => pitch.kind === 'skillion')
      .map(({ kind: _kind, ...pitch }) => pitch);
    geometry.userData.fracture = anatomy;
    return { geometry, anatomy };
  }
}

/** A prop-frame point in a finished piece's box frame (its axes, about its centre). */
function boxLocal(b: BuiltPiece, pt: V3): V3 {
  const d = sub(pt, b.c), ax = b.spec.axes;
  return [dot(d, ax.x), dot(d, ax.y), dot(d, ax.z)].map((v) => Math.round(v * 10000) / 10000) as unknown as V3;
}

/** Every piece reaches an anchor through the links (a kit that leaves one hanging is wrong, not the core's to fix). */
function assertSupported(anatomy: KitFractureAnatomy): void {
  const n = anatomy.pieces.length, adj: number[][] = Array.from({ length: n }, () => []);
  for (const l of anatomy.links) {
    if (l.a < 0 || l.b < 0 || l.a >= n || l.b >= n) throw new Error(`shedKit: ${anatomy.kind} link out of range`);
    adj[l.a].push(l.b); adj[l.b].push(l.a);
  }
  const seen = new Uint8Array(n), queue: number[] = [];
  anatomy.pieces.forEach((p, i) => { if (p.anchor) { seen[i] = 1; queue.push(i); } });
  if (!queue.length) throw new Error(`shedKit: ${anatomy.kind} has no anchor`);
  while (queue.length) for (const j of adj[queue.pop()!]) if (!seen[j]) { seen[j] = 1; queue.push(j); }
  const loose = anatomy.pieces.map((_, i) => (seen[i] ? -1 : i)).filter((i) => i >= 0);
  if (loose.length) throw new Error(`shedKit: ${anatomy.kind} pieces ${loose.join(', ')} reach no anchor`);
}

// ------------------------------------------------------------------------------------------------- walls

/** A board layout across [a, b]: widths between wMin and wMax, joints forced at `cuts` (an opening's edges). */
function boardRuns(w: ShedWriter, a: number, b: number, wMin: number, wMax: number, cuts: readonly number[] = []): [number, number][] {
  const stops = [a, ...cuts.filter((c) => c > a + 0.05 && c < b - 0.05).sort((x, y) => x - y), b];
  const runs: [number, number][] = [];
  for (let s = 0; s + 1 < stops.length; s++) {
    let x = stops[s];
    const end = stops[s + 1];
    while (x < end - 1e-6) {
      let width = wMin + (wMax - wMin) * w.rng();
      if (end - (x + width) < wMin * 0.6) width = end - x;
      runs.push([x, Math.min(end, x + width)]);
      x += width;
    }
  }
  return runs;
}

/** A board's own tone: the base, a shade lighter or darker, a touch warmer or cooler. */
function boardTone(w: ShedWriter, base: Rgb): Rgb {
  const k = 1 + (w.rng() - 0.5) * 2 * w.style.woodSpread;
  const warm = (w.rng() - 0.5) * 0.06;
  return [base[0] * k * (1 + warm), base[1] * k, base[2] * k * (1 - warm)];
}

/** An opening in a wall: u0..u1 along it, y0..y1 up it. */
interface Opening { u0: number; u1: number; y0: number; y1: number }

interface WallSpec {
  face: FractureFace;
  /** The wall's frame: x along it, y up, z out; origin on the frame's outer plane at u = 0, y = 0. */
  f: Frame;
  u0: number;
  u1: number;
  y0: number;
  /** The boards' top at u (a plate line, or a rake). */
  top: (u: number) => number;
  openings: Opening[];
  /** Where panels split (targets; the nearest board joint takes each). */
  splits: number[];
  /** Horizontal girts (heights) let into the posts behind the boards, between u limits. */
  girts: number[];
  girtU0: number;
  girtU1: number;
  /** Studs (u) behind the boards, from the sill to studTop. */
  studs: number[];
  studTop: number;
}

/** What a wall wrote: its panels' piece indices and their u ranges. */
interface WallPanels { pieces: number[]; ranges: [number, number][] }

const BOARD_T = 0.024;
const BATTEN_W = 0.05;
const BATTEN_T = 0.02;

/** The vertical segments of a board across [u0, u1] from y0 to its top, cut round the openings it crosses:
 * [bottom, top at u0, top at u1]. */
function boardSpans(spec: WallSpec, u0: number, u1: number): [number, number, number][] {
  const um = (u0 + u1) / 2;
  let spans: [number, number, number][] = [[spec.y0, spec.top(u0), spec.top(u1)]];
  for (const o of spec.openings) {
    if (um < o.u0 || um > o.u1) continue;
    const next: [number, number, number][] = [];
    for (const s of spans) {
      const lowTop = Math.min(s[1], s[2]);
      if (o.y0 > s[0] + 0.02) next.push([s[0], Math.min(o.y0, s[1]), Math.min(o.y0, s[2])]);
      if (o.y1 < lowTop - 0.02) next.push([o.y1, s[1], s[2]]);
    }
    spans = next;
  }
  return spans;
}

/**
 * Where a lapped course from y (a board `course` high) stands on a wall whose top is `top(u)` over [s0, s1]: the
 * stretches where the top clears the course's foot, each cut where the rake crosses the course's top, so every piece
 * has a straight top (flat at the course, or along the rake). The top is linear on either side of u = 0 (a gable).
 */
function lapSpans(top: (u: number) => number, s0: number, s1: number, y: number, course: number): [number, number][] {
  const out: [number, number][] = [];
  const stops = [s0, ...(s0 < 0 && s1 > 0 ? [0] : []), s1];
  const cross = (a: number, b: number, level: number): number | null => {
    const ta = top(a) - level, tb = top(b) - level;
    if ((ta > 0) === (tb > 0) || Math.abs(ta - tb) < 1e-9) return null;
    return a + (b - a) * (ta / (ta - tb));
  };
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i], b = stops[i + 1];
    // the part of [a, b] where the top clears the foot by 4 cm
    let lo = a, hi = b;
    const foot = y + 0.04;
    const cut = cross(a, b, foot);
    if (top(a) < foot && top(b) < foot) continue;
    if (cut !== null) { if (top(a) < foot) lo = cut; else hi = cut; }
    // split where the rake crosses the course's top
    const mid = cross(lo, hi, y + course);
    if (mid !== null && mid - lo > 0.02 && hi - mid > 0.02) { out.push([lo, mid], [mid, hi]); } else if (hi - lo > 0.02) out.push([lo, hi]);
  }
  return out;
}

/** A board (or a batten) between u0 and u1 over its spans: a box, or a prism where its top is raked. */
function wallBoard(w: ShedWriter, spec: WallSpec, u0: number, u1: number, z0: number, z1: number, look: Look, inset = 0): void {
  for (const [y0, t0, t1] of boardSpans(spec, u0, u1)) {
    if (Math.min(t0, t1) - y0 < 0.03) continue;
    if (Math.abs(t0 - t1) < 0.004) w.box(spec.f, [u0, y0 + inset, z0], [u1, t0 - inset, z1], look);
    else w.prism(spec.f, [[u0, y0 + inset], [u1, y0 + inset], [u1, t1 - inset], [u0, t0 - inset]], z0, z1, look);
  }
}

/**
 * Cladding over a wall in panels: each panel is a piece holding its boards, the battens over its joints, the girts
 * and studs behind it, and whatever `dress` adds while it is open (a window, a door frame).
 */
function cladWall(w: ShedWriter, spec: WallSpec, dress: (panel: number, range: [number, number]) => void): WallPanels {
  const st = w.style, lap = st.cladding === 'lap';
  const cuts = spec.openings.flatMap((o) => [o.u0, o.u1]);
  const runs = lap ? [] : boardRuns(w, spec.u0, spec.u1, 0.17, 0.25, cuts);
  const joints = runs.slice(1).map((r) => r[0]);
  // a split snaps to the nearest board joint, but never to an opening's edge unless it asked for that edge (a split
  // on a window's edge would leave the window in neither panel)
  const onEdge = (j: number) => cuts.some((c) => Math.abs(c - j) < 1e-3);
  const snap = (s: number): number => {
    if (lap || !joints.length) return s;
    const pool = onEdge(s) ? joints : joints.filter((j) => !onEdge(j));
    return (pool.length ? pool : joints).reduce((best, j) => (Math.abs(j - s) < Math.abs(best - s) ? j : best), (pool.length ? pool : joints)[0]);
  };
  const bounds = [spec.u0, ...spec.splits.map(snap), spec.u1]
    .sort((a, b) => a - b).filter((v, i, all) => i === 0 || v - all[i - 1] > 0.3);
  const out: WallPanels = { pieces: [], ranges: [] };
  const last = bounds.length - 2;
  for (let p = 0; p <= last; p++) {
    const a = bounds[p], b = bounds[p + 1];
    const range: [number, number] = [a, b];
    const panelJoints = joints.filter((j) => j > a + 1e-4 && j < b - 1e-4);
    const idx = w.begin({ role: 'wall', material: 'plank', face: spec.face, axes: spec.f, scoreAxis: 0,
      scores: panelJoints.filter((_, i) => i % 2 === 1) });
    // the girts let into the posts behind the boards (the end panels' girts run on to the posts past the boards)
    for (const gy of spec.girts) {
      const g0 = p === 0 ? Math.min(a, spec.girtU0) : a, g1 = p === last ? Math.max(b, spec.girtU1) : b;
      const lo = Math.max(g0, spec.girtU0), hi = Math.min(g1, spec.girtU1);
      if (hi - lo < 0.1) continue;
      let segs: [number, number][] = [[lo, hi]];
      for (const o of spec.openings) {
        if (!(gy > o.y0 - 0.06 && gy < o.y1 + 0.06)) continue;
        const next: [number, number][] = [];
        for (const [s0, s1] of segs) {
          if (o.u0 - 0.03 - s0 > 0.1) next.push([s0, Math.min(s1, o.u0 - 0.03)]);
          if (s1 - (o.u1 + 0.03) > 0.1) next.push([Math.max(s0, o.u1 + 0.03), s1]);
        }
        segs = next;
      }
      for (const [s0, s1] of segs) {
        w.box(spec.f, [s0, gy - 0.05, -0.10], [s1, gy + 0.05, 0], { tone: boardTone(w, st.frame), uv: w.memberUv(0.1, 0), seg: 2 });
      }
    }
    for (const su of spec.studs) {
      const mine = (su >= a && su < b) || (p === 0 && su < a) || (p === last && su >= b);
      if (!mine || spec.openings.some((o) => su > o.u0 - 0.04 && su < o.u1 + 0.04)) continue;
      w.box(spec.f, [su - 0.045, spec.y0 + 0.13, -0.10], [su + 0.045, spec.studTop, 0],
        { tone: boardTone(w, st.frame), uv: w.memberUv(0.09, 1), seg: 2 });
    }
    if (lap) {
      // lapped boards: horizontal, each one's lower edge kicked out over the board below
      const course = 0.165, rise = 0.15, tilt = 0.07;
      const topMax = Math.max(spec.top(a), spec.top(b));
      for (let y = spec.y0; y < topMax - 0.03; y += rise) {
        let segs: [number, number][] = [[a, b]];
        for (const o of spec.openings) {
          if (y + course < o.y0 || y > o.y1) continue;
          const next: [number, number][] = [];
          for (const [s0, s1] of segs) {
            if (o.u0 - s0 > 0.05) next.push([s0, Math.min(s1, o.u0)]);
            if (s1 - o.u1 > 0.05) next.push([Math.max(s0, o.u1), s1]);
          }
          segs = next;
        }
        const look: Look = { tone: boardTone(w, st.wood), uv: w.plankUv(course, 0), seg: 2, paint: st.paint };
        const bf = frame(at(spec.f, 0, y, 0), spec.f.x, add(scl(spec.f.y, Math.cos(tilt)), scl(spec.f.z, -Math.sin(tilt))));
        for (const [s0, s1] of segs) {
          for (const [c0, c1] of lapSpans(spec.top, s0, s1, y, course)) {
            const top0 = Math.min(y + course, spec.top(c0)), top1 = Math.min(y + course, spec.top(c1));
            if (Math.abs(top0 - top1) < 0.005) w.box(bf, [c0, 0, 0], [c1, top0 - y, BOARD_T], look);
            else w.prism(bf, [[c0, 0], [c1, 0], [c1, top1 - y], [c0, top0 - y]], 0, BOARD_T, look);
          }
        }
      }
    } else {
      for (const [r0, r1] of runs) {
        if (r0 < a - 1e-4 || r1 > b + 1e-4) continue;
        wallBoard(w, spec, r0, r1, 0, BOARD_T, { tone: boardTone(w, st.wood), uv: w.plankUv(r1 - r0, 1), seg: 2, paint: st.paint });
      }
      // the battens over this panel's own joints (its edge joints are its neighbours')
      for (const j of panelJoints) {
        wallBoard(w, spec, j - BATTEN_W / 2, j + BATTEN_W / 2, BOARD_T, BOARD_T + BATTEN_T,
          { tone: boardTone(w, st.wood), uv: w.plankUv(BATTEN_W, 1), seg: 1, paint: st.paint }, 0.012);
      }
    }
    dress(idx, range);
    w.end();
    out.pieces.push(idx);
    out.ranges.push(range);
  }
  return out;
}

/** A framed window (inside its panel's piece): casing, sill, reveal, sash and muntins, glass set back, shutters. */
function framedWindow(w: ShedWriter, f: Frame, o: Opening): void {
  const st = w.style;
  const cas = 0.075, depth = st.cladding === 'lap' ? BOARD_T + 0.012 : BOARD_T;
  const trimV = (): Look => ({ tone: boardTone(w, st.trim), uv: w.plankUv(cas, 1), seg: 2 });
  const trimH = (): Look => ({ tone: boardTone(w, st.trim), uv: w.plankUv(cas, 0), seg: 2 });
  // casing boards round the opening, proud of the cladding
  w.box(f, [o.u0 - cas, o.y0 - 0.02, depth], [o.u0, o.y1 + cas, depth + 0.022], trimV());
  w.box(f, [o.u1, o.y0 - 0.02, depth], [o.u1 + cas, o.y1 + cas, depth + 0.022], trimV());
  w.box(f, [o.u0 - cas - 0.02, o.y1, depth], [o.u1 + cas + 0.02, o.y1 + cas + 0.02, depth + 0.028], trimH());
  // the sill, standing out with its drip
  w.box(f, [o.u0 - cas - 0.03, o.y0 - 0.05, -0.04], [o.u1 + cas + 0.03, o.y0, depth + 0.06], trimH());
  // the reveal: the opening's depth through the wall
  const rev: Look = { tone: mulc(st.trim, 0.85), uv: w.plankUv(0.1, 1), seg: 1 };
  w.box(f, [o.u0, o.y0, -0.10], [o.u0 + 0.02, o.y1, depth], rev);
  w.box(f, [o.u1 - 0.02, o.y0, -0.10], [o.u1, o.y1, depth], rev);
  w.box(f, [o.u0, o.y1 - 0.02, -0.10], [o.u1, o.y1, depth], rev);
  // the sash: its frame and a cross of muntins, set back; the four panes behind them
  const sash: Look = { tone: mulc(st.trim, 0.95), uv: 'flat', weather: 0.6 };
  const s0 = -0.035, s1 = -0.005, fw = 0.04, mw = 0.022;
  const iu0 = o.u0 + 0.02, iu1 = o.u1 - 0.02, iy0 = o.y0, iy1 = o.y1 - 0.02;
  w.box(f, [iu0, iy0, s0], [iu0 + fw, iy1, s1], sash);
  w.box(f, [iu1 - fw, iy0, s0], [iu1, iy1, s1], sash);
  w.box(f, [iu0 + fw, iy0, s0], [iu1 - fw, iy0 + fw, s1], sash);
  w.box(f, [iu0 + fw, iy1 - fw, s0], [iu1 - fw, iy1, s1], sash);
  const um = (iu0 + iu1) / 2, ym = (iy0 + iy1) / 2;
  w.box(f, [um - mw / 2, iy0 + fw, s0 + 0.004], [um + mw / 2, iy1 - fw, s1 - 0.004], sash);
  w.box(f, [iu0 + fw, ym - mw / 2, s0 + 0.004], [iu1 - fw, ym + mw / 2, s1 - 0.004], sash);
  const gz0 = s0 - 0.004, gz1 = s0 + 0.002;
  for (const [a, b, c, d] of [
    [iu0 + fw, um - mw / 2, iy0 + fw, ym - mw / 2], [um + mw / 2, iu1 - fw, iy0 + fw, ym - mw / 2],
    [iu0 + fw, um - mw / 2, ym + mw / 2, iy1 - fw], [um + mw / 2, iu1 - fw, ym + mw / 2, iy1 - fw],
  ]) w.pane(f, [a, c, gz0], [b, d, gz1], f.z);
  // the dark room behind, so the glass reads against something
  w.box(f, [o.u0, o.y0, -0.12], [o.u1, o.y1, -0.10], { tone: ROOM, uv: 'flat', weather: 0 });
  // board shutters hinged open against the cladding
  if (st.shutter) {
    const sw = (o.u1 - o.u0) / 2 + 0.03, h0 = o.y0 - 0.04, h1 = o.y1 + 0.03;
    for (const side of [-1, 1] as const) {
      const ua = side < 0 ? o.u0 - cas - 0.01 - sw : o.u1 + cas + 0.01, ub = ua + sw;
      const tone = boardTone(w, st.wood);
      for (const [r0, r1] of boardRuns(w, ua, ub, 0.11, 0.15)) {
        w.box(f, [r0 + 0.003, h0, depth + 0.026], [r1 - 0.003, h1, depth + 0.048],
          { tone, uv: w.plankUv(r1 - r0, 1), seg: 2, paint: st.shutter });
      }
      for (const ly of [h0 + 0.12, h1 - 0.12]) {
        w.box(f, [ua + 0.02, ly - 0.04, depth + 0.048], [ub - 0.02, ly + 0.04, depth + 0.066],
          { tone, uv: w.plankUv(0.08, 0), seg: 1, paint: st.shutter });
        const hu0 = side < 0 ? ub - 0.16 : ua, hu1 = side < 0 ? ub : ua + 0.16;
        w.box(f, [hu0, ly - 0.015, depth + 0.066], [hu1, ly + 0.015, depth + 0.072], { tone: IRON, uv: 'flat', weather: 0.3 });
      }
    }
  }
}

/** A ledged and braced door in its opening (its own piece): boards, ledges, a Z brace, strap hinges, a latch. */
function ledgedDoor(w: ShedWriter, f: Frame, o: Opening, hingeLeft: boolean): void {
  const st = w.style;
  const z0 = -0.012, z1 = z0 + 0.024;
  for (const [r0, r1] of boardRuns(w, o.u0 + 0.005, o.u1 - 0.005, 0.13, 0.17)) {
    w.box(f, [r0 + 0.002, o.y0 + 0.01, z0], [r1 - 0.002, o.y1 - 0.005, z1],
      { tone: boardTone(w, st.door), uv: w.plankUv(r1 - r0, 1), seg: 3, paint: st.paint ? st.door : null });
  }
  const ledgeTone = boardTone(w, st.door);
  const ly = [o.y0 + 0.22, (o.y0 + o.y1) / 2, o.y1 - 0.22];
  for (const y of ly) w.box(f, [o.u0 + 0.04, y - 0.06, z1], [o.u1 - 0.04, y + 0.06, z1 + 0.022], { tone: ledgeTone, uv: w.plankUv(0.12, 0), seg: 2 });
  // the braces, rising from the hinge side's foot to the next ledge on the latch side
  for (let i = 0; i < 2; i++) {
    const ya = ly[i] + 0.06, yb = ly[i + 1] - 0.06;
    const ua = hingeLeft ? o.u0 + 0.08 : o.u1 - 0.08, ub = hingeLeft ? o.u1 - 0.08 : o.u0 + 0.08;
    const dir = nrm(add(scl(f.x, ub - ua), scl(f.y, yb - ya)));
    const bf = frame(at(f, ua, ya, 0), dir, cross(f.z, dir));
    w.box(bf, [0, -0.05, z1], [Math.hypot(ub - ua, yb - ya), 0.05, z1 + 0.02], { tone: ledgeTone, uv: w.plankUv(0.1, 0), seg: 2 });
  }
  // strap hinges over the top and bottom ledges, a thumb latch on the other side
  for (const y of [ly[0], ly[2]]) {
    const hu0 = hingeLeft ? o.u0 - 0.02 : o.u1 - 0.46, hu1 = hingeLeft ? o.u0 + 0.46 : o.u1 + 0.02;
    w.box(f, [hu0, y - 0.022, z1 + 0.022], [hu1, y + 0.022, z1 + 0.03], { tone: IRON, uv: 'flat', weather: 0.3 });
  }
  const lu = hingeLeft ? o.u1 - 0.12 : o.u0 + 0.06;
  w.box(f, [lu, o.y0 + 0.95, z1], [lu + 0.06, o.y0 + 1.13, z1 + 0.05], { tone: IRON, uv: 'flat', weather: 0.3 });
}

// ------------------------------------------------------------------------------------------------- roofs

/** A roof plane: points are o + e·a + f·b + up·c (e along its eave, f up its slope, up out of it). */
interface RoofPlane { o: V3; e: V3; f: V3; up: V3 }

function roofFrame(rp: RoofPlane): Frame {
  return { o: rp.o, x: rp.e, y: rp.up, z: cross(rp.e, rp.up) };
}

/** A box in roof coordinates (a along the eave, b up the slope, c out of the plane). */
function roofBox(w: ShedWriter, rp: RoofPlane, a0: number, a1: number, b0: number, b1: number, c0: number, c1: number, look: Look): void {
  const rf = roofFrame(rp);
  const fz = dot(rf.z, rp.f) >= 0 ? 1 : -1;
  const z0 = b0 * fz, z1 = b1 * fz;
  w.box(rf, [a0, c0, Math.min(z0, z1)], [a1, c1, Math.max(z0, z1)], look);
}

/** How far the covering stands over the battens' top (its top surface). */
function coverTop(roof: ShedRoof): number {
  return roof === 'boards' ? 0.044 : roof === 'felt' ? 0.048 : roof === 'fibre' ? 0.058 : 0.024;
}

/**
 * A roof section's covering over a rectangle of the plane (along the eave a0..a1, up the slope b0..b1; the plane is
 * the battens' top), its battens under it and its snow over it, lifted by `lift` (a row lapping the one below).
 * Call inside the section's piece; returns its joints along the eave (the scores).
 */
function coverRoof(w: ShedWriter, rp: RoofPlane, a0: number, a1: number, b0: number, b1: number,
  opts: { battens: number[]; snow: boolean; lift?: number; snowDepth?: number; snowLip?: boolean }): number[] {
  const st = w.style, lift = opts.lift ?? 0;
  const joints: number[] = [];
  for (const bb of opts.battens) {
    if (bb < b0 - 0.01 || bb > b1 + 0.01) continue;
    roofBox(w, rp, a0, a1, bb - 0.025, bb + 0.025, -0.03 + lift, lift, { tone: boardTone(w, st.frame), uv: w.memberUv(0.05, 0), seg: 2 });
  }
  if (st.roof === 'boards') {
    // board-on-board down the slope: the under boards with gaps, the cover boards over the gaps
    const runs = boardRuns(w, a0, a1, 0.2, 0.26);
    for (const [r0, r1] of runs) {
      roofBox(w, rp, r0 + 0.012, r1 - 0.012, b0, b1, lift, lift + 0.022, { tone: boardTone(w, st.roofTone), uv: w.plankUv(r1 - r0, 2), seg: 2, roof: true });
      joints.push(r1);
    }
    for (const j of joints.slice(0, -1)) {
      roofBox(w, rp, j - 0.05, j + 0.05, b0 + 0.01, b1, lift + 0.022, lift + 0.044, { tone: boardTone(w, st.roofTone), uv: w.plankUv(0.1, 2), seg: 1, roof: true });
    }
  } else if (st.roof === 'felt') {
    // sheathing boards, the felt in strips laid from the eave up (each lapping the one below), lath strips down it
    roofBox(w, rp, a0, a1, b0, b1, lift, lift + 0.022, { tone: boardTone(w, st.frame), uv: w.plankUv(0.2, 0), seg: 2 });
    const strip = 0.92, lapM = 0.09;
    let s = 0;
    for (let b = b0; b < b1 - 0.05; b += strip - lapM, s++) {
      const top = Math.min(b1, b + strip), kick = s * 0.0006;
      roofBox(w, rp, a0 - 0.02, a1 + 0.02, b - 0.01, top, lift + 0.022 + kick, lift + 0.03 + kick,
        { tone: mulc(st.roofTone, 1 + (w.rng() - 0.5) * 0.12), uv: 'flat', roof: true });
    }
    for (let a = a0 + 0.15; a < a1 - 0.1; a += 0.62) {
      roofBox(w, rp, a - 0.02, a + 0.02, b0, b1, lift + 0.03, lift + 0.048, { tone: boardTone(w, st.frame), uv: w.memberUv(0.04, 2), seg: 2, roof: true });
    }
  } else {
    // corrugated sheets down the slope: fibre-cement (a 177 mm wave, 50 mm deep) or 5V tin (a V rib every 300 mm),
    // every other sheet lapped over its neighbour
    const fibre = st.roof === 'fibre';
    const cover = fibre ? 1.0 : 0.61, overlap = fibre ? 0.09 : 0.04;
    let k = 0;
    for (let a = a0; a < a1 - 0.05; a += cover, k++) {
      const sa1 = Math.min(a1, a + cover + overlap);
      corrugatedSheet(w, rp, a, sa1, b0, b1, fibre, lift + (k % 2) * (fibre ? 0.009 : 0.004));
      joints.push(Math.min(a1, a + cover));
    }
  }
  if (opts.snow) {
    // the snow load: a slab over the covering, its eave edge rounded off and hanging a hand over
    const top = coverTop(st.roof) + lift, depth = opts.snowDepth ?? 0.14, snow: Look = { tone: SNOW, uv: 'flat', weather: 0 };
    if (opts.snowLip === false) {
      roofBox(w, rp, a0, a1, b0 + 0.02, b1 - 0.05, top, top + depth, snow);
    } else {
      roofBox(w, rp, a0, a1, b0 + 0.08, b1 - 0.05, top, top + depth, snow);
      roofBox(w, rp, a0, a1, b0 - 0.06, b0 + 0.08, top - 0.02, top + depth * 0.64, snow);
    }
  }
  return joints.slice(0, -1);
}

/** One corrugated sheet in roof coordinates (a along the eave, b up the slope), lifted by `lift`. */
function corrugatedSheet(w: ShedWriter, rp: RoofPlane, a0: number, a1: number, b0: number, b1: number, fibre: boolean, lift: number): void {
  const st = w.style;
  const rf = roofFrame(rp), fz = dot(rf.z, rp.f) >= 0 ? 1 : -1;
  const look: Look = { tone: mulc(st.roofTone, 1 + (w.rng() - 0.5) * 0.08), uv: 'flat', roof: true, rust: !fibre };
  const pitch = fibre ? 0.177 : 0.3, depth = fibre ? 0.05 : 0.022, t = fibre ? 0.007 : 0.002;
  // the profile across the eave: (a, height, slope of the height along a)
  const prof: [number, number, number][] = [];
  if (fibre) {
    const n = Math.max(4, Math.round((a1 - a0) / pitch * 4));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n), ph = ((a - a0) / pitch) * Math.PI * 2;
      prof.push([a, depth * (1 - Math.cos(ph)) / 2, depth * Math.PI / pitch * Math.sin(ph)]);
    }
  } else {
    prof.push([a0, 0, 0]);
    for (let r = a0 + 0.06; r < a1 - 0.03; r += pitch) prof.push([r - 0.02, 0, 0], [r, depth, 0], [r + 0.02, 0, 0]);
    prof.push([a1, 0, 0]);
  }
  const P = (a: number, h: number, b: number): V3 => at(rf, a, h + lift, b * fz);
  const N = (slope: number, s: number): V3 => scl(nrm(add(rf.y, scl(rf.x, -slope))), s);
  for (let i = 0; i + 1 < prof.length; i++) {
    const [pa, ha, sa] = prof[i], [pb, hb, sb] = prof[i + 1];
    const tin = !fibre ? (hb - ha) / Math.max(1e-6, pb - pa) : 0;
    for (const [off, s] of [[0, 1], [-t, -1]] as const) {
      const pts = [P(pa, ha + off, b0), P(pb, hb + off, b0), P(pb, hb + off, b1), P(pa, ha + off, b1)];
      const na = N(fibre ? sa : tin, s), nb = N(fibre ? sb : tin, s);
      const normals = [na, nb, nb, na];
      w.quad(pts, normals, [FLAT_PAIR, FLAT_PAIR, FLAT_PAIR, FLAT_PAIR], pts.map((p, k) => w.shade(look, p, normals[k], false, true)));
    }
  }
  // the ends (the profile's edge) and the two sides
  for (const bb of [b0, b1]) {
    const nn = scl(rf.z, (bb === b1 ? 1 : -1) * fz);
    for (let i = 0; i + 1 < prof.length; i++) {
      const [pa, ha] = prof[i], [pb, hb] = prof[i + 1];
      const pts = [P(pa, ha, bb), P(pb, hb, bb), P(pb, hb - t, bb), P(pa, ha - t, bb)];
      const col = w.shade(look, pts[0], nn, false, true);
      w.quad(pts, [nn, nn, nn, nn], [FLAT_PAIR, FLAT_PAIR, FLAT_PAIR, FLAT_PAIR], [col, col, col, col]);
    }
  }
  for (const [pa, ha, s] of [[prof[0][0], prof[0][1], -1], [prof[prof.length - 1][0], prof[prof.length - 1][1], 1]] as const) {
    const nn = scl(rf.x, s);
    const pts = [P(pa, ha, b0), P(pa, ha, b1), P(pa, ha - t, b1), P(pa, ha - t, b0)];
    const col = w.shade(look, pts[0], nn, false, true);
    w.quad(pts, [nn, nn, nn, nn], [FLAT_PAIR, FLAT_PAIR, FLAT_PAIR, FLAT_PAIR], [col, col, col, col]);
  }
  w.addVolume((a1 - a0) * (b1 - b0) * t * 1.15);
}

// ------------------------------------------------------------------------------------------------- the field hut

/** The field hut (the light family's footprint: hw 2.3, hl 3.5, h 4.1; its front gable and door to +z). */
const FH = {
  hx: 2.1, hz: 2.8,
  // the sills ride low on their stones (a raised hut read as floating where the ground fell away)
  sillY0: 0.14, sillY1: 0.30, sillW: 0.16,
  floorY: 0.33,
  post: 0.14,
  plateY0: 2.38, plateY1: 2.52,
  /** The rafters' top line: y = rafterWallY + tan(pitch)·(hx − |x|). */
  rafterWallY: 2.62,
  pitch: Math.atan2(1.35, 2.1),
  rafterD: 0.14,
  eaveX: 2.44,
  gableZ: 3.12,
  boardY0: 0.17,
  door: { u0: -0.45, u1: 0.45, y0: 0.33, y1: 2.29 },
  frontWindow: { u0: -1.62, u1: -1.0, y0: 1.06, y1: 1.78 },
  sideWindow: { u0: -0.72, u1: -0.1, y0: 1.06, y1: 1.78 },
  trussZ: [-2.765, -1.383, 0, 1.383, 2.765],
};

/** The rafters' top at |x|. */
const fhRafterTop = (x: number): number => FH.rafterWallY + Math.tan(FH.pitch) * (FH.hx - Math.abs(x));

export function buildShedFieldHut(st: ShedStyle, rng: Rng): ShedBuild {
  const w = new ShedWriter(st, rng, 0x51ed);
  const tanP = Math.tan(FH.pitch), cosP = Math.cos(FH.pitch), sinP = Math.sin(FH.pitch);
  const dV = FH.rafterD / cosP;
  const frameLook = (width: number, grain: 0 | 1 | 2): Look => ({ tone: boardTone(w, st.frame), uv: w.memberUv(width, grain), seg: 3 });
  const stoneLook = (): Look => ({ tone: mulc(st.stone, 1 + (w.rng() - 0.5) * 0.18), uv: 'flat' });
  const footMaterial: FractureMaterial = st.footing === 'brick' ? 'brick' : st.footing === 'concrete' ? 'concrete' : 'stone';

  // --- footings (the anchors), under the long sills at their ends and middles
  const footings: { idx: number; sx: number }[] = [];
  for (const sx of [-1, 1]) for (const z of [-FH.hz + 0.2, 0, FH.hz - 0.2]) {
    const f = frame([sx * (FH.hx - FH.sillW / 2), 0, z], [1, 0, 0], [0, 1, 0]);
    const idx = w.begin({ role: 'footing', material: footMaterial, anchor: true, axes: f });
    footing(w, f, FH.sillY0, stoneLook);
    w.end();
    footings.push({ idx, sx });
  }

  // --- sills: the long ones on the footings, their ends past the corners; the end ones between them
  const sillLR: number[] = [];
  for (const sx of [-1, 1]) {
    const f = frame([sx * (FH.hx - FH.sillW / 2), FH.sillY0, 0], [0, 0, 1], [0, 1, 0]);
    const idx = w.begin({ role: 'sill', material: 'timber', face: sx > 0 ? 'right' : 'left', axes: f, scoreAxis: 0, scores: [-1.3, 1.3] });
    w.box(f, [-FH.hz - 0.06, 0, -FH.sillW / 2], [FH.hz + 0.06, FH.sillY1 - FH.sillY0, FH.sillW / 2], frameLook(FH.sillW, 0));
    w.end();
    sillLR.push(idx);
    for (const fo of footings) if (fo.sx === sx) w.link(idx, fo.idx, 'rest');
  }
  const [sillL, sillR] = sillLR;
  const sillFB: number[] = [];
  for (const sz of [-1, 1]) {
    const f = frame([0, FH.sillY0, sz * (FH.hz - FH.sillW / 2)], [1, 0, 0], [0, 1, 0]);
    const idx = w.begin({ role: 'sill', material: 'timber', face: sz > 0 ? 'front' : 'back', axes: f, scoreAxis: 0, scores: [0] });
    w.box(f, [-FH.hx + FH.sillW, 0, -FH.sillW / 2], [FH.hx - FH.sillW, FH.sillY1 - FH.sillY0, FH.sillW / 2], frameLook(FH.sillW, 0));
    w.end();
    sillFB.push(idx);
    w.link(idx, sillL, 'nail'); w.link(idx, sillR, 'nail');
  }
  const [sillB, sillF] = sillFB;

  // --- the floor deck on the sills (its boards along z)
  {
    const f = frame([0, FH.sillY1, 0], [0, 0, 1], [0, 1, 0]);
    const floor = w.begin({ role: 'slab', material: 'plank', face: 'floor', axes: f });
    for (const [x0, x1] of boardRuns(w, -FH.hx + FH.sillW, FH.hx - FH.sillW, 0.16, 0.22)) {
      // the frame's x is world z and its z world −x
      w.box(f, [-FH.hz + FH.sillW, 0, -x1 + 0.002], [FH.hz - FH.sillW, FH.floorY - FH.sillY1, -x0 - 0.002],
        { tone: boardTone(w, mulc(st.wood, 0.85)), uv: w.plankUv(x1 - x0, 0), seg: 2, weather: 0.4 });
    }
    w.end();
    for (const s of [sillL, sillR, sillB, sillF]) w.link(floor, s, 'nail');
  }

  // --- corner posts on the sills, the wall plates on the posts
  const posts = new Map<string, number>();
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const f = frame([sx * (FH.hx - FH.post / 2), FH.sillY1, sz * (FH.hz - FH.post / 2)], [1, 0, 0], [0, 1, 0]);
    const idx = w.begin({ role: 'post', material: 'timber', axes: f, scoreAxis: 1, scores: [0.55, 1.35] });
    w.box(f, [-FH.post / 2, 0, -FH.post / 2], [FH.post / 2, FH.plateY0 - FH.sillY1, FH.post / 2], frameLook(FH.post, 1));
    w.end();
    posts.set(`${sx},${sz}`, idx);
    w.link(idx, sx < 0 ? sillL : sillR, 'bolt');
    w.link(idx, sz < 0 ? sillB : sillF, 'nail');
  }
  const postOf = (sx: number, sz: number): number => posts.get(`${sx},${sz}`)!;
  const plates: number[] = [];
  for (const sx of [-1, 1]) {
    const f = frame([sx * (FH.hx - FH.post / 2), FH.plateY0, 0], [0, 0, 1], [0, 1, 0]);
    const idx = w.begin({ role: 'plate', material: 'timber', face: sx > 0 ? 'right' : 'left', axes: f, scoreAxis: 0, scores: [-1.38, 0, 1.38] });
    w.box(f, [-FH.hz, 0, -FH.post / 2], [FH.hz, FH.plateY1 - FH.plateY0, FH.post / 2], frameLook(FH.post, 0));
    w.end();
    plates.push(idx);
    w.link(idx, postOf(sx, -1), 'nail'); w.link(idx, postOf(sx, 1), 'nail');
  }
  const [plateL, plateR] = plates;

  // --- the rafter pairs, collar-tied, seated on the plates (plumb cuts at the ridge and the tails)
  const trusses: number[] = [];
  const tail = FH.eaveX - 0.02;
  for (const z of FH.trussZ) {
    const f = frame([0, 0, z], [1, 0, 0], [0, 1, 0]);
    const points: V3[] = [];
    for (const dz of [-0.03, 0.03]) {
      points.push([-tail, fhRafterTop(tail) - dV, z + dz], [tail, fhRafterTop(tail) - dV, z + dz], [0, fhRafterTop(0), z + dz]);
    }
    const idx = w.begin({ role: 'rafter', material: 'timber', face: 'roof', axes: f, scoreAxis: 0, scores: [-1.15, 0, 1.15], points, edgeRadiusM: 0.07 });
    for (const sx of [-1, 1] as const) {
      const xa = 0.016, xb = tail;
      const poly: [number, number][] = sx > 0
        ? [[xa, fhRafterTop(xa) - dV], [xb, fhRafterTop(xb) - dV], [xb, fhRafterTop(xb)], [xa, fhRafterTop(xa)]]
        : [[-xb, fhRafterTop(xb) - dV], [-xa, fhRafterTop(xa) - dV], [-xa, fhRafterTop(xa)], [-xb, fhRafterTop(xb)]];
      w.prism(f, poly, -0.03, 0.03, { tone: boardTone(w, st.frame), uv: w.memberUv(0.06, 0), seg: 3 });
    }
    const yc = 3.2, xc = FH.hx - (yc + dV - FH.rafterWallY) / tanP + 0.04;
    w.box(f, [-xc, yc - 0.06, 0.03], [xc, yc + 0.06, 0.065], frameLook(0.12, 0));
    w.end();
    trusses.push(idx);
    w.link(idx, plateL, 'nail'); w.link(idx, plateR, 'nail');
  }

  // --- the walls
  const sideTop = (): number => fhRafterTop(FH.hx) - dV - 0.006;
  const rakeTop = (u: number): number => fhRafterTop(u) + 0.008;
  // left (−x): u = world z
  const fL = frame([-FH.hx, 0, 0], [0, 0, 1], [0, 1, 0]);
  const left = cladWall(w, {
    face: 'left', f: fL, u0: -FH.hz, u1: FH.hz, y0: FH.boardY0, top: sideTop, openings: [FH.sideWindow],
    splits: [-0.95, 0.95], girts: [0.9, 1.9], girtU0: -FH.hz + FH.post, girtU1: FH.hz - FH.post,
    studs: [-1.45, FH.sideWindow.u0 - 0.06, FH.sideWindow.u1 + 0.06, 1.45], studTop: FH.plateY0,
  }, (_panel, [a, b]) => { if (FH.sideWindow.u0 >= a - 1e-6 && FH.sideWindow.u1 <= b + 1e-6) framedWindow(w, fL, FH.sideWindow); });
  // right (+x): u = world −z
  const fR = frame([FH.hx, 0, 0], [0, 0, -1], [0, 1, 0]);
  const right = cladWall(w, {
    face: 'right', f: fR, u0: -FH.hz, u1: FH.hz, y0: FH.boardY0, top: sideTop, openings: [],
    splits: [-0.95, 0.95], girts: [0.9, 1.9], girtU0: -FH.hz + FH.post, girtU1: FH.hz - FH.post,
    studs: [-1.45, 0, 1.45], studTop: FH.plateY0,
  }, () => undefined);
  for (const [wall, sx] of [[left, -1], [right, 1]] as const) {
    wall.pieces.forEach((pi, k) => {
      w.link(pi, sx < 0 ? sillL : sillR, 'nail');
      w.link(pi, sx < 0 ? plateL : plateR, 'nail');
      // the left wall's u runs back to front (+z), the right's front to back
      if (k === 0) w.link(pi, postOf(sx, sx < 0 ? -1 : 1), 'nail');
      if (k === wall.pieces.length - 1) w.link(pi, postOf(sx, sx < 0 ? 1 : -1), 'nail');
    });
  }
  // the gables: the front (+z) u = world x, the back (−z) u = world −x; their boards run up to the rake and over the
  // side walls' board edges at the corners
  const endU = FH.hx + BOARD_T + BATTEN_T;
  const fF = frame([0, 0, FH.hz], [1, 0, 0], [0, 1, 0]);
  const doorO: Opening = { u0: FH.door.u0 - 0.04, u1: FH.door.u1 + 0.04, y0: FH.door.y0, y1: FH.door.y1 + 0.05 };
  const front = cladWall(w, {
    face: 'front', f: fF, u0: -endU, u1: endU, y0: FH.boardY0, top: rakeTop, openings: [doorO, FH.frontWindow],
    splits: [doorO.u0, doorO.u1], girts: [0.9, 1.9, 2.47], girtU0: -FH.hx + FH.post, girtU1: FH.hx - FH.post,
    studs: [FH.frontWindow.u0 - 0.06, doorO.u0 - 0.05, doorO.u1 + 0.05, 1.3], studTop: 2.42,
  }, (_panel, [a, b]) => {
    if (FH.frontWindow.u0 >= a - 1e-6 && FH.frontWindow.u1 <= b + 1e-6) framedWindow(w, fF, FH.frontWindow);
    if (a <= doorO.u0 + 0.01 && b >= doorO.u1 - 0.01) {
      // the door's frame: jambs and a head proud of the opening, and a louvred vent high in the gable
      w.box(fF, [doorO.u0 - 0.075, FH.door.y0, BOARD_T], [doorO.u0 + 0.005, doorO.y1 + 0.08, BOARD_T + 0.022],
        { tone: boardTone(w, st.trim), uv: w.plankUv(0.09, 1), seg: 2 });
      w.box(fF, [doorO.u1 - 0.005, FH.door.y0, BOARD_T], [doorO.u1 + 0.075, doorO.y1 + 0.08, BOARD_T + 0.022],
        { tone: boardTone(w, st.trim), uv: w.plankUv(0.09, 1), seg: 2 });
      w.box(fF, [doorO.u0 - 0.095, doorO.y1, BOARD_T], [doorO.u1 + 0.095, doorO.y1 + 0.1, BOARD_T + 0.028],
        { tone: boardTone(w, st.trim), uv: w.plankUv(0.1, 0), seg: 2 });
      const rev: Look = { tone: mulc(st.trim, 0.85), uv: w.plankUv(0.1, 1), seg: 2 };
      w.box(fF, [doorO.u0, FH.door.y0, -0.10], [doorO.u0 + 0.035, doorO.y1, BOARD_T], rev);
      w.box(fF, [doorO.u1 - 0.035, FH.door.y0, -0.10], [doorO.u1, doorO.y1, BOARD_T], rev);
      w.box(fF, [doorO.u0, doorO.y1 - 0.035, -0.10], [doorO.u1, doorO.y1, BOARD_T], rev);
      for (let k = 0; k < 3; k++) {
        const y = 3.12 + k * 0.09;
        w.box(fF, [-0.22, y, BOARD_T], [0.22, y + 0.05, BOARD_T + 0.03], { tone: mulc(st.trim, 0.85), uv: w.plankUv(0.05, 0), seg: 1 });
      }
      // the porch roof's ledger, spiked to the wall over the door head
      w.box(fF, [-1.3, 2.32, BOARD_T], [1.3, 2.47, BOARD_T + 0.07], { tone: boardTone(w, st.frame), uv: w.memberUv(0.07, 0), seg: 3 });
    }
  });
  const fB = frame([0, 0, -FH.hz], [-1, 0, 0], [0, 1, 0]);
  const back = cladWall(w, {
    face: 'back', f: fB, u0: -endU, u1: endU, y0: FH.boardY0, top: rakeTop, openings: [],
    splits: [0], girts: [0.9, 1.9, 2.47], girtU0: -FH.hx + FH.post, girtU1: FH.hx - FH.post, studs: [-1.0, 1.0], studTop: 2.42,
  }, () => undefined);
  if (front.pieces.length !== 3) throw new Error('shedKit: the field hut front must split round its door');
  const [frontL, overDoor, frontR] = front.pieces;
  const frontTruss = trusses[trusses.length - 1], backTruss = trusses[0];
  for (const pi of front.pieces) { w.link(pi, sillF, 'nail'); w.link(pi, frontTruss, 'nail'); }
  w.link(frontL, postOf(-1, 1), 'nail'); w.link(frontR, postOf(1, 1), 'nail');
  w.link(overDoor, frontL, 'nail'); w.link(overDoor, frontR, 'nail');
  for (const pi of back.pieces) { w.link(pi, sillB, 'nail'); w.link(pi, backTruss, 'nail'); }
  w.link(back.pieces[0], postOf(1, -1), 'nail'); w.link(back.pieces[back.pieces.length - 1], postOf(-1, -1), 'nail');

  // --- the door, hung on the right jamb
  const door = w.begin({ role: 'door', material: 'plank', face: 'front', axes: fF, scoreAxis: 0, scores: [-0.15, 0.15] });
  ledgedDoor(w, fF, FH.door, false);
  w.end();
  w.link(door, overDoor, 'nail');

  // --- the roof planes (the battens' top), the ridge and its cap
  const top = coverTop(st.roof);
  const planes = ([-1, 1] as const).map((sx) => {
    const down: V3 = [sx * cosP, -sinP, 0];
    const rp: RoofPlane = { o: [0, fhRafterTop(0) + 0.03 / cosP, 0], e: [0, 0, 1], f: scl(down, -1), up: nrm([sx * sinP, cosP, 0]) };
    return { sx, rp, down };
  });
  const ridgeF = frame([0, 0, 0], [0, 0, 1], [0, 1, 0]);
  const ridge = w.begin({ role: 'board', material: 'plank', face: 'roof', axes: ridgeF, scoreAxis: 0, scores: [-1.4, 0, 1.4] });
  w.box(ridgeF, [-FH.gableZ, fhRafterTop(0) - 0.2, -0.016], [FH.gableZ, fhRafterTop(0) + 0.01, 0.016], frameLook(0.2, 0));
  for (const { rp } of planes) {
    const capLook: Look = st.roof === 'boards'
      ? { tone: boardTone(w, st.roofTone), uv: w.plankUv(0.17, 0), seg: 3, roof: true }
      : { tone: mulc(st.roofTone, st.roof === 'felt' ? 1.05 : 0.96), uv: 'flat', roof: true, rust: st.roof === 'tin' };
    const capT = st.roof === 'boards' ? 0.022 : st.roof === 'felt' ? 0.007 : st.roof === 'fibre' ? 0.012 : 0.004;
    roofBox(w, rp, -FH.gableZ - 0.02, FH.gableZ + 0.02, -0.19, 0.012, top, top + capT, capLook);
  }
  w.end();
  for (const t of trusses) w.link(ridge, t, 'nail');

  // --- the roof sections, three a slope: battens, covering, barge boards at the gables, the snow
  const sectionZ: [number, number][] = [[-FH.gableZ, -1.04], [-1.04, 1.04], [1.04, FH.gableZ]];
  const eaveB = -(FH.eaveX + 0.03) / cosP, ridgeB = -0.02;
  const battens: number[] = [];
  for (let b = eaveB + 0.08; b < ridgeB - 0.05; b += 0.36) battens.push(b);
  const roofMaterial: FractureMaterial = st.roof === 'tin' ? 'metal' : st.roof === 'fibre' ? 'slate' : 'plank';
  const sections: { idx: number; sx: number; z: [number, number] }[] = [];
  for (const { sx, rp, down } of planes) {
    for (const z of sectionZ) {
      const idx = w.begin({
        role: 'roof', material: roofMaterial, face: 'roof', axes: roofFrame(rp), scoreAxis: 0,
        roofPitch: { axis: 'x', outwardSign: sx, angleRad: FH.pitch, kind: 'gable' },
      });
      const joints = coverRoof(w, rp, z[0], z[1], eaveB, ridgeB, { battens, snow: st.snow });
      const gz = Math.abs(z[0]) > 3 ? z[0] : Math.abs(z[1]) > 3 ? z[1] : 0;
      if (gz) {
        // the barge board down the gable's rake, standing over the covering's edge
        const zSide = Math.sign(gz);
        const bf = frame([0, rp.o[1], gz - zSide * 0.016], down, rp.up);
        w.box(bf, [0.02, -0.21, -0.016], [-eaveB + 0.04, top + 0.012, 0.016], { tone: boardTone(w, st.trim), uv: w.plankUv(0.22, 0), seg: 3 });
      }
      w.end();
      w.rescore(idx, joints);
      sections.push({ idx, sx, z });
      for (let t = 0; t < FH.trussZ.length; t++) {
        if (FH.trussZ[t] > z[0] - 0.1 && FH.trussZ[t] < z[1] + 0.1) w.link(idx, trusses[t], 'nail');
      }
      w.link(idx, ridge, 'nail');
    }
  }

  // --- the porch: a frame of two braced posts and their beam on pad stones (one anchored piece), a ledger on the wall,
  // and the skillion roof over them (its rafters, battens and covering only: the roof's own plane)
  const porchZ0 = FH.hz + 0.05, porchZ1 = 3.9, porchHigh = 2.52, porchLow = 2.2;
  const porchAngle = Math.atan2(porchHigh - porchLow, porchZ1 - porchZ0);
  const porchY = (z: number): number => porchHigh - Math.tan(porchAngle) * (z - porchZ0);
  const porchPostZ = 3.66, porchPostX = 1.08;
  const beamTop = porchY(porchPostZ) - 0.13;
  const porchPlane: RoofPlane = {
    o: [0, porchHigh + 0.03, porchZ0], e: [1, 0, 0],
    f: nrm([0, Math.sin(porchAngle), -Math.cos(porchAngle)]), up: nrm([0, Math.cos(porchAngle), Math.sin(porchAngle)]),
  };
  const porchSlopeLen = (porchZ1 - porchZ0) / Math.cos(porchAngle);
  const porchFrame = (() => {
    const f = frame([0, 0, porchPostZ], [1, 0, 0], [0, 1, 0]);
    const points: V3[] = [];
    for (const sx of [-1, 1]) points.push([sx * (porchPostX + 0.15), -0.12, porchPostZ], [sx * 1.34, beamTop, porchPostZ]);
    const idx = w.begin({ role: 'frame', material: 'timber', anchor: true, axes: f, scoreAxis: 0, scores: [-0.55, 0.55],
      points, edgeRadiusM: 0.07 });
    for (const sx of [-1, 1]) {
      const pf = frame([sx * porchPostX, 0, porchPostZ], [1, 0, 0], [0, 1, 0]);
      w.stone(pf, [-0.15, -0.12, -0.15], [0.15, 0.1, 0.15], stoneLook(), 0.15);
      w.box(pf, [-0.055, 0.1, -0.055], [0.055, beamTop - 0.12, 0.055], frameLook(0.11, 1));
      // the knee brace up to the beam
      const ya = beamTop - 0.12 - 0.5, yb = beamTop - 0.12, xa = sx * (porchPostX - 0.05), xb = sx * (porchPostX - 0.5);
      const dir = nrm([xb - xa, yb - ya, 0]);
      const bf = frame([xa, ya, porchPostZ], dir, cross([0, 0, 1], dir));
      w.box(bf, [0, -0.032, -0.032], [Math.hypot(xb - xa, yb - ya) + 0.03, 0.032, 0.032], frameLook(0.065, 0));
    }
    w.box(AXES, [-1.34, beamTop - 0.12, porchPostZ - 0.06], [1.34, beamTop, porchPostZ + 0.06], frameLook(0.12, 0));
    // the rafters from the ledger over the beam (the roof piece keeps to its own plane: the pitch receipt regresses
    // all of a piece's vertices, and a deep stack of layers over a short slope tilts the fit)
    for (const x of [-1.24, -0.42, 0.42, 1.24]) {
      roofBox(w, porchPlane, x - 0.025, x + 0.025, -porchSlopeLen, 0, -0.14, -0.03, { tone: boardTone(w, st.frame), uv: w.memberUv(0.05, 2), seg: 2 });
    }
    // and the battens nailed across them
    for (const b of [-porchSlopeLen + 0.15, -porchSlopeLen * 0.5, -0.15]) {
      roofBox(w, porchPlane, -1.38, 1.38, b - 0.025, b + 0.025, -0.03, 0, { tone: boardTone(w, st.frame), uv: w.memberUv(0.05, 0), seg: 2 });
    }
    w.end();
    return idx;
  })();
  {
    const rp = porchPlane, slopeLen = porchSlopeLen;
    const porch = w.begin({
      role: 'roof', material: roofMaterial, face: 'roof', axes: roofFrame(rp),
      roofPitch: { axis: 'z', outwardSign: 1, angleRad: porchAngle, kind: 'skillion' },
    });
    // (a thinner load on the short porch roof: it sheds its snow)
    coverRoof(w, rp, -1.38, 1.38, -slopeLen, 0, { battens: [], snow: st.snow, snowDepth: 0.035, snowLip: false });
    w.end();
    w.link(porch, overDoor, 'nail');
    w.link(porch, porchFrame, 'nail');
  }
  // --- the stoop: a deck on sleepers at the door, a stone step
  {
    const stoop = w.begin({ role: 'slab', material: 'plank', face: 'floor', anchor: true, axes: AXES });
    for (const x of [-0.6, 0.6]) w.box(AXES, [x - 0.06, -0.04, FH.hz + 0.02], [x + 0.06, 0.18, 3.5], frameLook(0.12, 2));
    for (const [z0, z1] of boardRuns(w, FH.hz + 0.02, 3.5, 0.13, 0.17)) {
      w.box(AXES, [-0.78, 0.18, z0 + 0.004], [0.78, 0.22, z1 - 0.004], { tone: boardTone(w, mulc(st.wood, 0.9)), uv: w.plankUv(z1 - z0, 0), seg: 2 });
    }
    w.stone(AXES, [-0.5, -0.1, 3.52], [0.5, 0.15, 3.9], stoneLook(), 0.1);
    w.end();
    w.link(stoop, sillF, 'rest');
  }
  // --- a bench under the front window, a rain barrel by the porch
  {
    const f = frame([-1.42, 0, 3.12], [1, 0, 0], [0, 1, 0]);
    w.begin({ role: 'fitting', material: 'plank', anchor: true, axes: f });
    for (const x of [-0.42, 0.42]) w.box(f, [x - 0.03, 0, -0.16], [x + 0.03, 0.42, 0.16], frameLook(0.06, 1));
    w.box(f, [-0.52, 0.42, -0.17], [0.52, 0.47, 0.17], { tone: boardTone(w, st.wood), uv: w.plankUv(0.34, 0), seg: 2 });
    w.box(f, [-0.42, 0.12, -0.03], [0.42, 0.18, 0.03], frameLook(0.06, 0));
    w.end();
  }
  {
    const f = frame([1.6, 0, 3.32], [1, 0, 0], [0, 1, 0]);
    w.begin({ role: 'fitting', material: 'plank', anchor: true, axes: f });
    const staves: Look = { tone: boardTone(w, mulc(st.wood, 0.75)), uv: w.plankUv(0.1, 1), seg: 2 };
    w.cylinder(f, 0.25, 0.28, 0.0, 0.42, 12, staves, false);
    w.cylinder(f, 0.28, 0.25, 0.42, 0.84, 12, staves, false);
    for (const y of [0.1, 0.42, 0.74]) {
      const r = (y === 0.42 ? 0.28 : 0.258) + 0.008;
      w.cylinder(f, r, r, y - 0.025, y + 0.025, 12, { tone: RUST, uv: 'flat', weather: 0.3 }, false);
    }
    w.cylinder(f, 0.245, 0.245, 0.76, 0.78, 12, { tone: hexLin(0x1d2124), uv: 'flat', weather: 0 }, true);
    w.end();
  }

  // --- the stovepipe through the back of the left slope, its flashing and its rain cap
  {
    const px = -1.05, pz = -1.85, roofY = fhRafterTop(px) + 0.03 / cosP + top;
    const f = frame([px, 0, pz], [1, 0, 0], [0, 1, 0]);
    const pipe = w.begin({ role: 'chimney', material: 'metal', axes: f, scoreAxis: 1, scores: [roofY + 0.2] });
    const iron: Look = { tone: hexLin(0x3c3a37), uv: 'flat', weather: 0.5, rust: true };
    w.cylinder(f, 0.075, 0.075, roofY - 0.3, 4.32, 10, iron, false);
    w.cylinder(f, 0.15, 0.085, roofY - 0.05, roofY + 0.06, 10, { tone: hexLin(0x55524c), uv: 'flat', weather: 0.6 }, true);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2, cx = Math.cos(a) * 0.072, cz = Math.sin(a) * 0.072;
      w.box(f, [cx - 0.008, 4.3, cz - 0.008], [cx + 0.008, 4.4, cz + 0.008], iron);
    }
    w.cylinder(f, 0.18, 0.02, 4.4, 4.5, 10, iron, true);
    w.end();
    for (const s of sections) if (s.sx < 0 && pz > s.z[0] && pz < s.z[1]) w.link(pipe, s.idx, 'nail');
  }

  return w.finish('fieldhut', 48);
}

/** A footing under a sill or a post, its top at topY (inside its piece). */
function footing(w: ShedWriter, f: Frame, topY: number, stoneLook: () => Look): void {
  const st = w.style;
  if (st.footing === 'fieldstone') {
    w.stone(f, [-0.24, -0.16, -0.22], [0.24, topY + 0.01, 0.22], stoneLook());
  } else if (st.footing === 'brick') {
    // a brick pier: courses of two bricks laid crosswise in turn, the mortar between them a shade lighter
    const courses = Math.max(2, Math.round((topY + 0.12) / 0.085));
    for (let c = 0; c < courses; c++) {
      const y0 = -0.12 + c * 0.085, tone = mulc(st.stone, 1 + (w.rng() - 0.5) * 0.2);
      if (c % 2) {
        w.box(f, [-0.12, y0, -0.115], [0.12, y0 + 0.075, -0.005], { tone, uv: 'flat' });
        w.box(f, [-0.12, y0, 0.005], [0.12, y0 + 0.075, 0.115], { tone: mulc(tone, 0.94), uv: 'flat' });
      } else {
        w.box(f, [-0.115, y0, -0.12], [-0.005, y0 + 0.075, 0.12], { tone, uv: 'flat' });
        w.box(f, [0.005, y0, -0.12], [0.115, y0 + 0.075, 0.12], { tone: mulc(tone, 0.94), uv: 'flat' });
      }
      w.box(f, [-0.11, y0 + 0.075, -0.11], [0.11, Math.min(topY, y0 + 0.085), 0.11], { tone: hexLin(0x9a958a), uv: 'flat', weather: 0.4 });
    }
  } else {
    w.box(f, [-0.2, -0.16, -0.2], [0.2, topY + 0.005, 0.2], stoneLook());
    w.box(f, [-0.23, -0.16, -0.23], [0.23, 0.02, 0.23], stoneLook());
  }
}

// ------------------------------------------------------------------------------------------------- the lean-to

/** The lean-to (footprint hw 2.9, hl 2.5, h 3.1): open to +z, its roof falling toward the open front. */
const LT = {
  postX: [-2.4, 0, 2.4],
  frontZ: 1.95, backZ: -1.95,
  post: 0.15,
  slope: 0.18,
  /** The covering's underside (the battens' top): y = coverY0 − tan(slope)·z. */
  coverY0: 2.7,
  roofX: 2.92, roofZ0: -2.5, roofZ1: 2.5,
  rafterX: [-2.8, -1.68, -0.56, 0.56, 1.68, 2.8],
  rafterD: 0.15,
  footTop: 0.12,
};
const ltCover = (z: number): number => LT.coverY0 - Math.tan(LT.slope) * z;

export function buildShedLeanTo(st: ShedStyle, rng: Rng): ShedBuild {
  const w = new ShedWriter(st, rng, 0x1ea7);
  const cosS = Math.cos(LT.slope), sinS = Math.sin(LT.slope);
  const rafterTop = (z: number): number => ltCover(z) - 0.03;
  const rafterBottom = (z: number): number => rafterTop(z) - LT.rafterD / cosS;
  const frameLook = (width: number, grain: 0 | 1 | 2): Look => ({ tone: boardTone(w, st.frame), uv: w.memberUv(width, grain), seg: 3 });
  const stoneLook = (): Look => ({ tone: mulc(st.stone, 1 + (w.rng() - 0.5) * 0.18), uv: 'flat' });
  const beamTop = rafterBottom(LT.frontZ), plateTop = rafterBottom(LT.backZ);
  const footMaterial: FractureMaterial = st.footing === 'brick' ? 'brick' : st.footing === 'concrete' ? 'concrete' : 'stone';

  // --- pad stones and the posts on them
  const footings: number[] = [];
  for (const z of [LT.backZ, LT.frontZ]) for (const x of LT.postX) {
    const f = frame([x, 0, z], [1, 0, 0], [0, 1, 0]);
    footings.push(w.begin({ role: 'footing', material: footMaterial, anchor: true, axes: f }));
    footing(w, f, LT.footTop, stoneLook);
    w.end();
  }
  const posts: number[] = [];
  [LT.backZ, LT.frontZ].forEach((z, k) => LT.postX.forEach((x, j) => {
    const f = frame([x, LT.footTop, z], [1, 0, 0], [0, 1, 0]);
    const topY = z > 0 ? beamTop - 0.2 : plateTop - 0.14;
    const idx = w.begin({ role: 'post', material: 'timber', axes: f, scoreAxis: 1, scores: [0.45, 1.25] });
    w.box(f, [-LT.post / 2, 0, -LT.post / 2], [LT.post / 2, topY - LT.footTop + 0.04, LT.post / 2], frameLook(LT.post, 1));
    w.end();
    posts.push(idx);
    w.link(idx, footings[k * 3 + j], 'rest');
  }));
  const backPosts = posts.slice(0, 3), frontPosts = posts.slice(3);

  // --- the front beam and the back plate
  const beamF = frame([0, beamTop - 0.2, LT.frontZ], [1, 0, 0], [0, 1, 0]);
  const beam = w.begin({ role: 'plate', material: 'timber', face: 'front', axes: beamF, scoreAxis: 0, scores: [-1.2, -0.25, 0.25, 1.2] });
  w.box(beamF, [-2.9, 0, -0.07], [2.9, 0.2, 0.07], frameLook(0.14, 0));
  w.end();
  for (const p of frontPosts) w.link(beam, p, 'bolt');
  const plateF = frame([0, plateTop - 0.14, LT.backZ], [1, 0, 0], [0, 1, 0]);
  const plate = w.begin({ role: 'plate', material: 'timber', face: 'back', axes: plateF, scoreAxis: 0, scores: [-1.2, -0.25, 0.25, 1.2] });
  w.box(plateF, [-2.9, 0, -0.07], [2.9, 0.14, 0.07], frameLook(0.14, 0));
  w.end();
  for (const p of backPosts) w.link(plate, p, 'bolt');

  // --- knee braces from the front posts up to the beam
  LT.postX.forEach((x, j) => {
    for (const side of j === 1 ? [-1, 1] : [j === 0 ? 1 : -1]) {
      const ya = beamTop - 0.2 - 0.62, yb = beamTop - 0.2;
      const xa = x + side * 0.06, xb = x + side * 0.62;
      const dir = nrm([xb - xa, yb - ya, 0]);
      const bf = frame([xa, ya, LT.frontZ], dir, cross([0, 0, 1], dir));
      const idx = w.begin({ role: 'brace', material: 'timber', axes: bf });
      w.box(bf, [0, -0.04, -0.035], [Math.hypot(xb - xa, yb - ya) + 0.04, 0.04, 0.035], frameLook(0.08, 0));
      w.end();
      w.link(idx, frontPosts[j], 'nail'); w.link(idx, beam, 'nail');
    }
  });

  // --- rafters over the plate and the beam
  const rafters: number[] = [];
  for (const x of LT.rafterX) {
    const axes = frame([x, rafterTop(0), 0], [0, -sinS, cosS], [0, cosS, sinS]);
    const idx = w.begin({ role: 'rafter', material: 'timber', face: 'roof', axes, scoreAxis: 0, scores: [-1.0, 0, 1.0] });
    // a prism in the rafter's vertical plane (this frame's x is world z)
    const f = frame([x, 0, 0], [0, 0, 1], [0, 1, 0]);
    const za = LT.roofZ0 + 0.05, zb = LT.roofZ1 - 0.08;
    w.prism(f, [[za, rafterBottom(za)], [zb, rafterBottom(zb)], [zb, rafterTop(zb)], [za, rafterTop(za)]], -0.03, 0.03,
      { tone: boardTone(w, st.frame), uv: w.memberUv(0.06, 0), seg: 3 });
    w.end();
    rafters.push(idx);
    w.link(idx, beam, 'nail'); w.link(idx, plate, 'nail');
  }

  // --- the roof: three bays across, two rows down meeting over the middle, battens under each
  const rp: RoofPlane = { o: [0, ltCover(0), 0], e: [1, 0, 0], f: nrm([0, sinS, -cosS]), up: nrm([0, cosS, sinS]) };
  const bOf = (z: number): number => -z / cosS;
  const rows: [number, number][] = [[bOf(LT.roofZ1), 0], [0, bOf(LT.roofZ0)]];
  const bays: [number, number][] = [[-LT.roofX, -0.98], [-0.98, 0.98], [0.98, LT.roofX]];
  const roofMaterial: FractureMaterial = st.roof === 'tin' ? 'metal' : st.roof === 'fibre' ? 'slate' : 'plank';
  for (const [b0, b1] of rows) for (const [a0, a1] of bays) {
    const idx = w.begin({
      role: 'roof', material: roofMaterial, face: 'roof', axes: roofFrame(rp), scoreAxis: 0,
      roofPitch: { axis: 'z', outwardSign: 1, angleRad: LT.slope, kind: 'skillion' },
    });
    const battens: number[] = [];
    for (let b = b0 + 0.12; b < b1 - 0.05; b += 0.62) battens.push(b);
    const joints = coverRoof(w, rp, a0, a1, b0, b1, { battens, snow: st.snow });
    w.end();
    w.rescore(idx, joints);
    LT.rafterX.forEach((x, k) => { if (x > a0 - 0.1 && x < a1 + 0.1) w.link(idx, rafters[k], 'nail'); });
  }

  // --- the back wall: boards on girts over the back posts' outer faces, in four panels
  const fBack = frame([0, 0, LT.backZ - LT.post / 2], [-1, 0, 0], [0, 1, 0]);
  const back = cladWall(w, {
    face: 'back', f: fBack, u0: -2.55, u1: 2.55, y0: 0.12, top: () => plateTop, openings: [],
    splits: [-1.25, 0, 1.25], girts: [0.55, 1.55, 2.45], girtU0: -2.47, girtU1: 2.47, studs: [], studTop: plateTop,
  }, () => undefined);
  back.pieces.forEach((pi, k) => {
    w.link(pi, plate, 'nail');
    const [a, b] = back.ranges[k];
    // the back wall's u runs along −x: a post at world x stands at u = −x
    LT.postX.forEach((x, j) => { if (-x > a - 0.1 && -x < b + 0.1) w.link(pi, backPosts[j], 'nail'); });
  });
  // --- the side walls, boarded over the back half, their tops under the roof; girts run on to the front posts
  for (const sx of [-1, 1] as const) {
    const fx = sx * (2.4 + LT.post / 2);
    const fS = sx < 0 ? frame([fx, 0, 0], [0, 0, 1], [0, 1, 0]) : frame([fx, 0, 0], [0, 0, -1], [0, 1, 0]);
    const u0 = sx < 0 ? LT.backZ - LT.post / 2 : -0.05, u1 = sx < 0 ? 0.05 : -(LT.backZ - LT.post / 2);
    const side = cladWall(w, {
      face: sx < 0 ? 'left' : 'right', f: fS, u0, u1, y0: 0.12, top: (u) => rafterTop(sx < 0 ? u : -u) - 0.005, openings: [],
      splits: [], girts: [0.55, 1.55], girtU0: sx < 0 ? LT.backZ : -LT.frontZ, girtU1: sx < 0 ? LT.frontZ : -LT.backZ,
      studs: [], studTop: 2,
    }, () => undefined);
    for (const pi of side.pieces) {
      w.link(pi, backPosts[sx < 0 ? 0 : 2], 'nail');
      w.link(pi, frontPosts[sx < 0 ? 0 : 2], 'nail');
    }
  }

  // --- the firewood stacked in both bays against the back wall
  for (const [x0, x1, hgt] of [[-2.28, -0.12, 1.28], [0.12, 2.28, 0.96]] as const) {
    const idx = w.begin({ role: 'fitting', material: 'timber', anchor: true, axes: AXES, scoreAxis: 0,
      scores: [x0 + (x1 - x0) * 0.25, (x0 + x1) / 2, x0 + (x1 - x0) * 0.75] });
    firewoodStack(w, x0, x1, LT.backZ + 0.12, LT.backZ + 0.82, hgt);
    w.end();
    for (const pi of back.pieces) w.link(idx, pi, 'rest');
  }
  // --- a chopping block with its axe, and a sawbuck with a log on it
  {
    const f = frame([1.25, 0, 0.95], [1, 0, 0], [0, 1, 0]);
    w.begin({ role: 'fitting', material: 'timber', anchor: true, axes: f });
    w.cylinder(f, 0.24, 0.27, 0, 0.52, 10, { tone: BARK, uv: w.plankUv(0.2, 1), seg: 2 }, false);
    w.cylinder(f, 0.24, 0.24, 0.52, 0.53, 10, { tone: LOG_END, uv: 'flat', weather: 0.4 }, true);
    const helve = frame(at(f, 0.05, 0.5, 0), nrm([0.45, 0.62, 0.2]), [0, 1, 0]);
    w.box(helve, [0, -0.018, -0.018], [0.68, 0.018, 0.018], { tone: hexLin(0x8c7155), uv: w.memberUv(0.036, 0), seg: 2 });
    w.box(f, [-0.02, 0.47, -0.04], [0.14, 0.56, 0.04], { tone: hexLin(0x3a3936), uv: 'flat', weather: 0.3 });
    for (let k = 0; k < 4; k++) {
      const a = k * 1.7 + w.rng(), r = 0.45 + w.rng() * 0.25;
      const sf = frame(at(f, Math.cos(a) * r, 0.06, Math.sin(a) * r), [Math.cos(a + 1.2), 0, Math.sin(a + 1.2)], [0, 1, 0]);
      w.prism(sf, [[-0.06, -0.06], [0.07, -0.06], [0.0, 0.06]], -0.17, 0.17, { tone: LOG_END, uv: w.plankUv(0.1, 0), seg: 1, endDark: 0.9 });
    }
    w.end();
  }
  {
    const f = frame([-1.3, 0, 0.9], [1, 0, 0], [0, 1, 0]);
    w.begin({ role: 'fitting', material: 'timber', anchor: true, axes: f });
    // two X legs (each two crossed sticks) joined by a rail, a log in their crotches
    for (const z of [-0.35, 0.35]) {
      for (const s of [-1, 1]) {
        const dir = nrm([s * 0.42, 0.9, 0]);
        const lf = frame(at(f, -s * 0.21, 0, z), dir, cross([0, 0, 1], dir));
        w.box(lf, [0, -0.03, -0.03], [0.98, 0.03, 0.03], frameLook(0.06, 0));
      }
    }
    w.box(f, [-0.03, 0.32, -0.36], [0.03, 0.38, 0.36], frameLook(0.06, 2));
    w.box(f, [-0.11, 0.69, -0.8], [0.11, 0.91, 0.8], { tone: BARK, uv: w.plankUv(0.2, 2), seg: 2, endDark: 1.3 });
    w.end();
  }

  return w.finish('leanto', 48);
}

/** A stack of split firewood: the stack's body, its face of split ends (wedges and quarters), round logs on top. */
function firewoodStack(w: ShedWriter, x0: number, x1: number, z0: number, z1: number, h: number): void {
  w.box(AXES, [x0 + 0.03, 0.0, z0], [x1 - 0.03, h - 0.06, z1 - 0.05], { tone: mulc(BARK, 0.9), uv: w.plankUv(0.2, 0), seg: 2 });
  const rowH = 0.155;
  let row = 0;
  for (let y = 0.03; y < h - 0.1; y += rowH, row++) {
    let x = x0 + 0.04 + (row % 2) * 0.07;
    while (x < x1 - 0.12) {
      const wd = 0.13 + w.rng() * 0.08;
      const kind = w.rng();
      const poly: [number, number][] = kind < 0.45
        ? [[-wd / 2, -rowH * 0.42], [wd / 2, -rowH * 0.42], [0, rowH * 0.45]]
        : kind < 0.8
          ? [[-wd / 2, -rowH * 0.42], [wd / 2, -rowH * 0.42], [wd / 2, rowH * 0.1], [-wd * 0.05, rowH * 0.45], [-wd / 2, rowH * 0.2]]
          : [[-wd / 2, -rowH * 0.3], [0, -rowH * 0.45], [wd / 2, -rowH * 0.3], [wd / 2, rowH * 0.3], [0, rowH * 0.45], [-wd / 2, rowH * 0.3]];
      const f = frame([x + wd / 2, y + rowH / 2, z1 - 0.06], [1, 0, 0], [0, 1, 0]);
      w.prism(f, poly, 0, 0.02 + w.rng() * 0.05, { tone: mulc(LOG_END, 0.85 + w.rng() * 0.3), uv: 'flat', weather: 0.5, endDark: 1 }, false);
      x += wd + 0.01;
    }
  }
  for (let k = 0; k < 4; k++) {
    const lx = x0 + 0.2 + (k / 4) * (x1 - x0 - 0.3);
    const f = frame([lx, h - 0.02, (z0 + z1) / 2], [1, 0, 0], [0, 0, 1]);
    w.cylinder(f, 0.07, 0.07, -(z1 - z0) / 2 + 0.03, (z1 - z0) / 2 - 0.05, 7, { tone: BARK, uv: w.plankUv(0.14, 1), seg: 1 }, true);
  }
}

// ------------------------------------------------------------------------------------------------- the collision

/**
 * The solids a shed's collision is derived from (props.ts refitDestructibleColliders through meta.collisionBuild): the
 * envelopes of what stands on the ground — its walls (boards, battens and girts in one slab each), posts and pad
 * stones, the stoop, the bench, the barrel, the firewood stacks — so the contact band is the few parts the building
 * presents, not its hundreds of boards (a board-by-board derivation took seconds a build and published four times the
 * parts). Built from the kit's constants alone: no stream draws, the same on every tier and peer.
 */
export function buildShedCollision(kind: 'fieldhut' | 'leanto', st: ShedStyle): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add3 = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
    g.deleteAttribute('uv');
    parts.push(g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  };
  const out = BOARD_T + BATTEN_T + (st.cladding === 'lap' ? 0.012 : 0);
  if (kind === 'fieldhut') {
    // the closed hut is one solid to its plates, as the light family's was (a hull never threads a thin wall)
    add3(-FH.hx - out, 0, -FH.hz - out, FH.hx + out, FH.plateY1, FH.hz + out);
    // the porch frame's posts on their stones, the stoop and its step, the bench, the barrel
    for (const sx of [-1, 1]) add3(sx * 1.08 - 0.15, 0, 3.66 - 0.15, sx * 1.08 + 0.15, 2.0, 3.66 + 0.15);
    add3(-0.78, 0, FH.hz + 0.02, 0.78, 0.22, 3.5);
    add3(-0.5, 0, 3.52, 0.5, 0.15, 3.9);
    add3(-1.94, 0, 2.95, -0.9, 0.47, 3.29);
    add3(1.32, 0, 3.04, 1.9, 0.84, 3.6);
  } else {
    // the posts on their pad stones
    for (const z of [LT.backZ, LT.frontZ]) for (const x of LT.postX) add3(x - 0.2, 0, z - 0.2, x + 0.2, z > 0 ? 1.95 : 2.75, z + 0.2);
    // the back wall and the side walls' boarded halves
    add3(-2.55, 0, LT.backZ - LT.post / 2 - out, 2.55, 2.85, LT.backZ - LT.post / 2 + 0.10);
    for (const sx of [-1, 1]) {
      const x0 = sx < 0 ? -2.4 - LT.post / 2 - out : 2.4 + LT.post / 2 - 0.10, x1 = sx < 0 ? -2.4 - LT.post / 2 + 0.10 : 2.4 + LT.post / 2 + out;
      add3(x0, 0, LT.backZ - LT.post / 2, x1, 2.85, 0.05);
    }
    // the firewood stacks, the chopping block, the sawbuck and its log
    add3(-2.28, 0, LT.backZ + 0.12, -0.12, 1.28, LT.backZ + 0.82);
    add3(0.12, 0, LT.backZ + 0.12, 2.28, 0.96, LT.backZ + 0.82);
    add3(1.25 - 0.28, 0, 0.95 - 0.28, 1.25 + 0.28, 0.53, 0.95 + 0.28);
    add3(-1.3 - 0.45, 0, 0.9 - 0.8, -1.3 + 0.45, 0.91, 0.9 + 0.8);
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error(`shedKit: ${kind} collision merge failed`);
  return merged;
}

// ------------------------------------------------------------------------------------------------- the broken heap

/** The broken pool has no collider: nothing of the heap stands higher than a hull crosses. */
export const SHED_BROKEN_CAP = 0.58;

/**
 * The fallen shed for the broken pool (until the core's bodies settle it): the footings, sills, floor and stoop where
 * they stood; the posts snapped to stubs over their bases with their upper lengths fallen beside them; the panels,
 * roof sections, rafters and door fallen outward and lying askew over the heap; the tall fittings tipped over —
 * nothing above SHED_BROKEN_CAP, dusted and darkened where it lies.
 */
export function buildShedBroken(build: ShedBuild, rng: Rng, salt: number): THREE.BufferGeometry {
  const src = build.geometry;
  const pos = src.getAttribute('position'), nor = src.getAttribute('normal'), uv = src.getAttribute('uv'), col = src.getAttribute('color');
  const P: number[] = [], N: number[] = [], T: number[] = [], C: number[] = [];
  const cell = 0.25, half = 24, field = new Float32Array(half * 2 * half * 2);
  const cellAt = (x: number, z: number): number => {
    const i = Math.floor(x / cell) + half, j = Math.floor(z / cell) + half;
    return i < 0 || j < 0 || i >= half * 2 || j >= half * 2 ? -1 : j * half * 2 + i;
  };
  const r = (lo: number, hi: number): number => lo + (hi - lo) * rng();
  const pieces = build.anatomy.pieces;
  const stays = (i: number): boolean => {
    const p = pieces[i];
    return p.role === 'footing' || p.role === 'sill' || p.role === 'slab' || (p.role === 'fitting' && p.c[1] + p.h[1] <= SHED_BROKEN_CAP);
  };
  const standing = (i: number): boolean => pieces[i].role === 'post' || pieces[i].role === 'frame';
  /** Lay a run's vertices (through `place` and `turn`) on the heap, under the cap, dusted. */
  const lay = (i: number, place: (v: V3) => V3, turn: (v: V3) => V3, rest: boolean): void => {
    const piece = pieces[i];
    const t0 = piece.tri0 * 3, t1 = t0 + piece.triN * 3;
    const moved: V3[] = [];
    let minY = Infinity, maxY = -Infinity;
    for (let v = t0; v < t1; v++) {
      const m = place([pos.getX(v), pos.getY(v), pos.getZ(v)]);
      moved.push(m);
      minY = Math.min(minY, m[1]); maxY = Math.max(maxY, m[1]);
    }
    let lift = 0;
    if (rest) {
      let ground = 0;
      for (const m of moved) { const c = cellAt(m[0], m[2]); if (c >= 0) ground = Math.max(ground, field[c]); }
      lift = ground - minY + 0.005;
    }
    // over the cap: sunk into the heap and crushed flatter about its foot, never above what a hull crosses
    const base = Math.min(minY + lift, SHED_BROKEN_CAP - 0.04);
    const squash = Math.min(1, (SHED_BROKEN_CAP - base) / Math.max(0.001, maxY - minY));
    for (let k = 0; k < moved.length; k++) {
      const m = moved[k];
      const y = rest ? base + (m[1] - minY) * squash : Math.min(m[1], SHED_BROKEN_CAP);
      P.push(m[0], y, m[2]);
      const nm = turn([nor.getX(t0 + k), nor.getY(t0 + k), nor.getZ(t0 + k)]);
      N.push(nm[0], nm[1], nm[2]);
      T.push(uv.getX(t0 + k), uv.getY(t0 + k));
      const dust = 0.74 + 0.14 * hash3(Math.floor(m[0] * 3), Math.floor(m[2] * 3), i, salt);
      C.push(col.getX(t0 + k) * dust, col.getY(t0 + k) * dust, col.getZ(t0 + k) * dust * 0.97);
      const c = cellAt(m[0], m[2]);
      if (c >= 0) field[c] = Math.max(field[c], y);
    }
  };
  /** A fallen copy: the box's thinnest axis near upright, turned by the stream and tilted over what it lands on. */
  const fall = (i: number): void => {
    const piece = pieces[i];
    const ax = [rotate(piece.q, [1, 0, 0]), rotate(piece.q, [0, 1, 0]), rotate(piece.q, [0, 0, 1])];
    const thin = piece.h[0] <= piece.h[1] && piece.h[0] <= piece.h[2] ? 0 : piece.h[1] <= piece.h[2] ? 1 : 2;
    const A = scl(ax[thin], ax[thin][1] >= 0 ? 1 : -1), B = ax[(thin + 1) % 3];
    const Cc = nrm(cross(A, B));
    const yaw = r(-0.7, 0.7);
    const flatB = Math.hypot(B[0], B[2]) > 1e-3 ? nrm([B[0], 0, B[2]]) : [1, 0, 0] as V3;
    let bb = nrm([flatB[0] * Math.cos(yaw) - flatB[2] * Math.sin(yaw), 0, flatB[0] * Math.sin(yaw) + flatB[2] * Math.cos(yaw)]);
    let up: V3 = [0, 1, 0];
    // askew: tipped about its long horizontal axis, its high edge up to about the cap on the heap
    const across = Math.max(0.2, piece.h[(thin + 2) % 3] * 2);
    const tilt = Math.min(0.75, Math.asin(Math.min(0.95, (SHED_BROKEN_CAP * r(0.55, 0.95)) / across))) * (rng() < 0.5 ? -1 : 1);
    const third0 = cross(up, bb);
    up = nrm(add(scl(up, Math.cos(tilt)), scl(third0, Math.sin(tilt))));
    bb = nrm(sub(bb, scl(up, dot(bb, up))));
    const third = cross(up, bb);
    const turn = (v: V3): V3 => add(add(scl(up, dot(v, A)), scl(bb, dot(v, B))), scl(third, dot(v, Cc)));
    // mostly where it stood: a wall panel a little outward, a roof section down off its plates
    const out = nrm([piece.c[0] + r(-0.3, 0.3), 0, piece.c[2] + r(-0.3, 0.3)]);
    const reach = Math.min(0.9, piece.c[1] * 0.18) + r(0, 0.25);
    const T0: V3 = [piece.c[0] + out[0] * reach, 0, piece.c[2] + out[2] * reach];
    lay(i, (v) => add(turn(sub(v, piece.c as V3)), T0), turn, true);
  };
  const identity = (v: V3): V3 => v;
  const order = pieces.map((_, i) => i).sort((a, b) => Number(stays(b)) - Number(stays(a)) || pieces[a].c[1] - pieces[b].c[1]);
  for (const i of order) {
    if (stays(i)) { lay(i, identity, identity, false); continue; }
    if (standing(i)) {
      // the stub over its base (squashed to a snapped height), and the rest of it fallen beside it
      const piece = pieces[i];
      let low = Infinity, high = -Infinity;
      for (let v = piece.tri0 * 3; v < (piece.tri0 + piece.triN) * 3; v++) { low = Math.min(low, pos.getY(v)); high = Math.max(high, pos.getY(v)); }
      const stubH = r(0.22, SHED_BROKEN_CAP - 0.06) - Math.max(0, low);
      const k = Math.max(0.05, stubH / Math.max(0.01, high - low));
      lay(i, (v) => [v[0], low + (v[1] - low) * k, v[2]], identity, false);
    }
    fall(i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(T, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return ensureWorldNightEmissionMask(g);
}

// ------------------------------------------------------------------------------------------------- the edge art

/**
 * The broken end a timber member shows where it snaps at a score (the core calls it once per kind per map and caches
 * the halves): two runs, first the cap of the half toward −scoreAxis (facing +), then the half toward + (facing −);
 * each a splintered end — slivers out along the grain from a torn middle, fresh wood inside, darker at its rim.
 * Boards, panels, roof sections and sheets snap at their joints (nothing to draw: every board is closed); a footing
 * never snaps; a rafter pair, a fitting and a chimney leave their cut plain.
 */
export function shedFractureEdge(material: FractureMaterial, piece: FracturePiece, score: number | 'whole', seed: number,
  out: DamageMeshWriter): void {
  if (score === 'whole' || material !== 'timber') return;
  if (piece.role !== 'post' && piece.role !== 'sill' && piece.role !== 'plate' && piece.role !== 'brace'
    && piece.role !== 'girt' && piece.role !== 'purlin' && piece.role !== 'stud' && piece.role !== 'board') return;
  const axis = piece.scoreAxis ?? 0;
  const unit = (k: number): V3 => rotate(piece.q, k === 0 ? [1, 0, 0] : k === 1 ? [0, 1, 0] : [0, 0, 1]);
  const A = unit(axis), U = unit((axis + 1) % 3), V = unit((axis + 2) % 3);
  const hu = piece.h[(axis + 1) % 3], hv = piece.h[(axis + 2) % 3];
  const base = add([piece.c[0], piece.c[1], piece.c[2]], scl(A, score));
  let state = seed >>> 0;
  const rnd = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const n = 4, len = Math.min(0.22, Math.max(hu, hv) * 1.6);
  for (const side of [1, -1] as const) {
    if (!out.begin(piece.bucket, 'rim')) return;
    const idx: number[] = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const edge = i === 0 || j === 0 || i === n || j === n;
      const sliver = rnd() < 0.3 ? len * (0.5 + rnd() * 0.5) : len * rnd() * 0.25;
      const d = (edge ? sliver * 0.4 : sliver) * side;
      const p = add(add(add(base, scl(U, (i / n * 2 - 1) * hu)), scl(V, (j / n * 2 - 1) * hv)), scl(A, d));
      const c = edge ? mulc(FRESH_WOOD, 0.7) : FRESH_WOOD;
      idx.push(out.vertex(p[0], p[1], p[2], A[0] * side, A[1] * side, A[2] * side, SHED_FLAT_UV[0], SHED_FLAT_UV[1], c[0], c[1], c[2]));
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = idx[j * (n + 1) + i], b = idx[j * (n + 1) + i + 1], c = idx[(j + 1) * (n + 1) + i + 1], d = idx[(j + 1) * (n + 1) + i];
      if (side > 0) { out.triangle(a, b, c); out.triangle(a, c, d); } else { out.triangle(a, c, b); out.triangle(a, d, c); }
    }
    out.end();
  }
}
