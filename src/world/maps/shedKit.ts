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
import { seatFloatingParts } from './wreckContact.ts';

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
  /** The tile's uv per metre (default UV_PER_M): a stand-in's whole wall takes one plank lane a board. */
  uvPerM?: number;
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

/** How much a build draws: the desktops' full construction, or the phones' lighter one (the same pieces and links). */
export type ShedDetail = 'full' | 'lite';

/** One kind's build: its geometry (one run a piece) and the anatomy that names the runs. */
export interface ShedBuild {
  geometry: THREE.BufferGeometry;
  anatomy: KitFractureAnatomy;
}

const FLAT_PAIR: [number, number] = [SHED_FLAT_UV[0], SHED_FLAT_UV[1]];
/** The pieces a shed's shell is made of: they draw before its frame and fittings. */
const SHELL_ROLES: ReadonlySet<string> = new Set(['wall', 'roof', 'door', 'frame', 'board', 'chimney']);

class ShedWriter {
  private p: number[] = [];
  private n: number[] = [];
  private t: number[] = [];
  private c: number[] = [];
  private panes: THREE.BufferGeometry[] = [];
  /** (2026-10-11, the cost series' overdraw) where the piece's hidden members start and stop (vertex index, inner) */
  private layers: [number, boolean][] = [];
  private volume = 0;
  private density = 500;
  private spec: PieceSpec | null = null;
  readonly built: BuiltPiece[] = [];
  readonly links: FractureLink[] = [];

  readonly style: ShedStyle;
  readonly rng: Rng;
  readonly salt: number;
  /** 'lite' (the phones): one segment a board, no battens, girts or studs, plain sashes; the same pieces. */
  readonly lite: boolean;

  constructor(style: ShedStyle, rng: Rng, salt: number, detail: ShedDetail = 'full') {
    this.style = style;
    this.rng = rng;
    this.salt = salt;
    this.lite = detail === 'lite';
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

  /**
   * Members written from here are ones the shell hides (a girt behind the boards) until `inner(false)`: the piece draws
   * them after its shell, so the depth test throws out their fragments instead of shading them under the cladding.
   */
  inner(on: boolean): void {
    const at = this.p.length / 3, last = this.layers[this.layers.length - 1];
    if ((last ? last[1] : false) === on) return;
    if (last && last[0] === at) this.layers.pop(); else this.layers.push([at, on]);
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
    if (this.layers.some(([, on]) => on)) {
      // the shell's vertices first, then the hidden members' (each run kept in its own order)
      const count = this.p.length / 3, cuts = [...this.layers, [count, false] as [number, boolean]];
      const shell: [number, number][] = [], hidden: [number, number][] = [];
      let from = 0, on = false;
      for (const [at, next] of cuts) {
        if (at > from) (on ? hidden : shell).push([from, at]);
        from = at; on = next;
      }
      const P: number[] = [], N: number[] = [], T: number[] = [], C: number[] = [];
      for (const [a, b] of [...shell, ...hidden]) {
        for (let v = a; v < b; v++) {
          P.push(this.p[v * 3], this.p[v * 3 + 1], this.p[v * 3 + 2]); N.push(this.n[v * 3], this.n[v * 3 + 1], this.n[v * 3 + 2]);
          T.push(this.t[v * 2], this.t[v * 2 + 1]); C.push(this.c[v * 3], this.c[v * 3 + 1], this.c[v * 3 + 2]);
        }
      }
      this.p = P; this.n = N; this.t = T; this.c = C;
    }
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
    this.p = []; this.n = []; this.t = []; this.c = []; this.panes = []; this.layers = [];
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
    const segs = this.lite ? 1 : Math.max(1, look.seg ?? 1);
    const k1 = look.uvPerM ?? UV_PER_M;
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
            if (g === k) return [u0 + (l[a] - lo[a]) * k1 * 0.3, v0 + (l[b] - lo[b]) * k1 * 0.3];
            const across = g === a ? b : a;
            return [u0 + (l[across] - lo[across]) * k1, v0 + (l[g] - lo[g]) * k1];
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
    const k1 = look.uvPerM ?? UV_PER_M;
    const capUv = (x: number, y: number): [number, number] => {
      if (flat) return FLAT_PAIR;
      return g === 1 ? [u0 + (x - minX) * k1, v0 + (y - minY) * k1]
        : [u0 + (y - minY) * k1, v0 + (x - minX) * k1];
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

  /** The open piece's triangles as a plain geometry (a stand-in: no anatomy, no certification). */
  plainGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    const panes = this.panes;
    this.p = []; this.n = []; this.t = []; this.c = []; this.panes = []; this.spec = null;
    const main = ensureWorldNightEmissionMask(g);
    if (!panes.length) return main;
    const merged = mergeGeometries([main, ...panes.map(ensureWorldNightEmissionMask)], false);
    if (!merged) throw new Error('shedKit: stand-in merge failed');
    main.dispose();
    for (const pane of panes) pane.dispose();
    return merged;
  }

  /** Certify, merge (one run a piece), write the anatomy. */
  finish(kind: string, cap: number): ShedBuild {
    if (this.spec) throw new Error('shedKit: unfinished piece');
    if (this.built.length > cap) throw new Error(`shedKit: ${kind} has ${this.built.length} pieces (cap ${cap})`);
    // (2026-10-11) the shell's pieces draw first, the frame and the rest after them (the depth test throws out what the
    // shell hides); the links follow the pieces' new places
    const order = this.built.map((_, i) => i)
      .sort((a, b) => (SHELL_ROLES.has(this.built[a].spec.role) ? 0 : 1) - (SHELL_ROLES.has(this.built[b].spec.role) ? 0 : 1) || a - b);
    const place = new Map(order.map((old, i) => [old, i]));
    const built = order.map((i) => this.built[i]);
    const parts = built.map((b) => b.geometry);
    const connectivity = certifyGroundedStructureParts(kind, parts);
    const roofPlanePitches = parts.filter((g) => g.userData.roofPlanePitch).map((g) => auditRoofPlanePitch(g));
    const geometry = mergeGeometries(parts, false);
    if (!geometry) throw new Error(`shedKit: ${kind} merge failed`);
    const pieces: FracturePiece[] = [];
    let tri0 = 0;
    for (const b of built) {
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
    const anatomy: KitFractureAnatomy = { kind, pieces, links: this.links.map((l) => ({ ...l, a: place.get(l.a)!, b: place.get(l.b)! })) };
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
  /** Girts (heights) across the frame's outer face, `girtDepth` deep, the boards nailed on them (a pole barn's, where
   * the wall's inside shows); none: the boards are nailed to the frame. Nothing of a panel stands inside the frame's
   * plane, so its box keeps off the posts, sills and plates (the destruction core's bodies start apart). */
  girts?: number[];
  girtDepth?: number;
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
/** A board (or a batten) up the wall in its spans; `skip` faces always hidden (the box's bits), the foot's only at the
 * wall's foot (a span over an opening shows its foot). */
function wallBoard(w: ShedWriter, spec: WallSpec, u0: number, u1: number, z0: number, z1: number, look: Look, inset = 0,
  skip = 0, footSkip = false): void {
  for (const [y0, t0, t1] of boardSpans(spec, u0, u1)) {
    if (Math.min(t0, t1) - y0 < 0.03) continue;
    const mask = skip | (footSkip && Math.abs(y0 - spec.y0) < 1e-4 ? 1 << 2 : 0);
    if (Math.abs(t0 - t1) < 0.004) w.box(spec.f, [u0, y0 + inset, z0], [u1, t0 - inset, z1], look, mask);
    else w.prism(spec.f, [[u0, y0 + inset], [u1, y0 + inset], [u1, t1 - inset], [u0, t0 - inset]], z0, z1, look);
  }
}
/** Two neighbouring boards' spans the same (their butting sides hide each other wholly). */
const sameSpans = (spec: WallSpec, a: [number, number], b: [number, number]): boolean => {
  const sa = boardSpans(spec, a[0], a[1]), sb = boardSpans(spec, b[0], b[1]);
  return sa.length === sb.length && sa.every((x, i) => Math.abs(x[0] - sb[i][0]) < 1e-4
    && Math.abs(Math.min(x[1], x[2]) - Math.min(sb[i][1], sb[i][2])) < 1e-4);
};

/**
 * Cladding over a wall in panels: each panel is a piece holding its boards, the battens over its joints, its girts
 * (when the wall has them) and whatever `dress` adds on its face while it is open (a window's casing, a door's jamb).
 */
function cladWall(w: ShedWriter, spec: WallSpec, dress: (panel: number, range: [number, number]) => void): WallPanels {
  const st = w.style, lap = st.cladding === 'lap', gz = spec.girtDepth ?? 0;
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
    // the girts across the frame's face under this panel's boards, broken round the openings
    for (const gy of spec.girts ?? []) {
      let segs: [number, number][] = [[a, b]];
      for (const o of spec.openings) {
        if (!(gy > o.y0 - 0.06 && gy < o.y1 + 0.06)) continue;
        const next: [number, number][] = [];
        for (const [s0, s1] of segs) {
          if (o.u0 - 0.03 - s0 > 0.1) next.push([s0, Math.min(s1, o.u0 - 0.03)]);
          if (s1 - (o.u1 + 0.03) > 0.1) next.push([Math.max(s0, o.u1 + 0.03), s1]);
        }
        segs = next;
      }
      // (behind the boards: drawn after them, its face under them left out)
      w.inner(true);
      for (const [s0, s1] of segs) {
        w.box(spec.f, [s0, gy - 0.05, 0], [s1, gy + 0.05, gz], { tone: boardTone(w, st.frame), uv: w.memberUv(0.1, 0), seg: 2 }, 1 << 5);
      }
      w.inner(false);
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
        const bf = frame(at(spec.f, 0, y, gz + course * Math.sin(tilt)), spec.f.x, add(scl(spec.f.y, Math.cos(tilt)), scl(spec.f.z, -Math.sin(tilt))));
        for (const [s0, s1] of segs) {
          for (const [c0, c1] of lapSpans(spec.top, s0, s1, y, course)) {
            const top0 = Math.min(y + course, spec.top(c0)), top1 = Math.min(y + course, spec.top(c1));
            if (Math.abs(top0 - top1) < 0.005) w.box(bf, [c0, 0, 0], [c1, top0 - y, BOARD_T], look);
            else w.prism(bf, [[c0, 0], [c1, 0], [c1, top1 - y], [c0, top0 - y]], 0, BOARD_T, look);
          }
        }
      }
    } else {
      runs.forEach(([r0, r1], ri) => {
        if (r0 < a - 1e-4 || r1 > b + 1e-4) return;
        // (a side its neighbour butts with the same spans is never seen; nor its foot on the wall's foot)
        const prev = runs[ri - 1], next = runs[ri + 1];
        const skip = (prev && Math.abs(prev[1] - r0) < 1e-4 && sameSpans(spec, prev, [r0, r1]) ? 1 : 0)
          | (next && Math.abs(next[0] - r1) < 1e-4 && sameSpans(spec, next, [r0, r1]) ? 2 : 0);
        wallBoard(w, spec, r0, r1, gz, gz + BOARD_T, { tone: boardTone(w, st.wood), uv: w.plankUv(r1 - r0, 1), seg: 2, paint: st.paint },
          0, skip, true);
      });
      // the battens over this panel's own joints (its edge joints are its neighbours'): their backs on the boards unseen
      for (const j of w.lite ? [] : panelJoints) {
        wallBoard(w, spec, j - BATTEN_W / 2, j + BATTEN_W / 2, gz + BOARD_T, gz + BOARD_T + BATTEN_T,
          { tone: boardTone(w, st.wood), uv: w.plankUv(BATTEN_W, 1), seg: 1, paint: st.paint }, 0.012, 1 << 4, true);
      }
    }
    dress(idx, range);
    w.end();
    out.pieces.push(idx);
    out.ranges.push(range);
  }
  return out;
}

/** A window's outer parts (inside its panel's piece): the casing proud of the cladding, the sill and its drip, board
 * shutters hinged open against the cladding. Nothing of it stands inside the frame's plane. */
function windowDress(w: ShedWriter, f: Frame, o: Opening): void {
  const st = w.style;
  const cas = 0.075, depth = st.cladding === 'lap' ? BOARD_T + 0.024 : BOARD_T;
  const trimV = (): Look => ({ tone: boardTone(w, st.trim), uv: w.plankUv(cas, 1), seg: 2 });
  const trimH = (): Look => ({ tone: boardTone(w, st.trim), uv: w.plankUv(cas, 0), seg: 2 });
  // casing boards round the opening, proud of the cladding
  w.box(f, [o.u0 - cas, o.y0 - 0.02, depth], [o.u0, o.y1 + cas, depth + 0.022], trimV());
  w.box(f, [o.u1, o.y0 - 0.02, depth], [o.u1 + cas, o.y1 + cas, depth + 0.022], trimV());
  w.box(f, [o.u0 - cas - 0.02, o.y1, depth], [o.u1 + cas + 0.02, o.y1 + cas + 0.02, depth + 0.028], trimH());
  // the sill, standing out with its drip
  w.box(f, [o.u0 - cas - 0.03, o.y0 - 0.05, 0], [o.u1 + cas + 0.03, o.y0, depth + 0.05], trimH());
  // board shutters hinged open against the cladding (on the battens)
  if (st.shutter) {
    const sw = (o.u1 - o.u0) / 2 + 0.03, h0 = o.y0 - 0.04, h1 = o.y1 + 0.03, z0 = BOARD_T + BATTEN_T + 0.002;
    for (const side of [-1, 1] as const) {
      const ua = side < 0 ? o.u0 - cas - 0.01 - sw : o.u1 + cas + 0.01, ub = ua + sw;
      const tone = boardTone(w, st.wood);
      for (const [r0, r1] of boardRuns(w, ua, ub, 0.11, 0.15)) {
        w.box(f, [r0 + 0.003, h0, z0], [r1 - 0.003, h1, z0 + 0.018], { tone, uv: w.plankUv(r1 - r0, 1), seg: 2, paint: st.shutter });
      }
      for (const ly of [h0 + 0.12, h1 - 0.12]) {
        w.box(f, [ua + 0.02, ly - 0.04, z0 + 0.018], [ub - 0.02, ly + 0.04, z0 + 0.03], { tone, uv: w.plankUv(0.08, 0), seg: 1, paint: st.shutter });
        const hu0 = side < 0 ? ub - 0.16 : ua, hu1 = side < 0 ? ub : ua + 0.16;
        w.box(f, [hu0, ly - 0.015, z0 + 0.03], [hu1, ly + 0.015, z0 + 0.034], { tone: IRON, uv: 'flat', weather: 0.3 });
      }
    }
  }
}

/** A window's inset (its own piece, behind the cladding's face): the reveal through the frame, the sash and its muntins,
 * the glass set back, and the dark room behind it. */
function windowInset(w: ShedWriter, f: Frame, o: Opening): void {
  const st = w.style;
  const rev: Look = { tone: mulc(st.trim, 0.85), uv: w.plankUv(0.1, 1), seg: 1 };
  w.box(f, [o.u0, o.y0, -0.10], [o.u0 + 0.02, o.y1, 0], rev);
  w.box(f, [o.u1 - 0.02, o.y0, -0.10], [o.u1, o.y1, 0], rev);
  w.box(f, [o.u0, o.y1 - 0.02, -0.10], [o.u1, o.y1, 0], rev);
  w.box(f, [o.u0, o.y0, -0.10], [o.u1, o.y0 + 0.012, 0], rev);
  const sash: Look = { tone: mulc(st.trim, 0.95), uv: 'flat', weather: 0.6 };
  const s0 = -0.035, s1 = -0.005, fw = 0.04, mw = 0.022;
  const iu0 = o.u0 + 0.02, iu1 = o.u1 - 0.02, iy0 = o.y0 + 0.012, iy1 = o.y1 - 0.02;
  w.box(f, [iu0, iy0, s0], [iu0 + fw, iy1, s1], sash);
  w.box(f, [iu1 - fw, iy0, s0], [iu1, iy1, s1], sash);
  w.box(f, [iu0 + fw, iy0, s0], [iu1 - fw, iy0 + fw, s1], sash);
  w.box(f, [iu0 + fw, iy1 - fw, s0], [iu1 - fw, iy1, s1], sash);
  const um = (iu0 + iu1) / 2, ym = (iy0 + iy1) / 2;
  const gz0 = s0 - 0.004, gz1 = s0 + 0.002;
  if (w.lite) {
    w.pane(f, [iu0 + fw, iy0 + fw, gz0], [iu1 - fw, iy1 - fw, gz1], f.z);
  } else {
    w.box(f, [um - mw / 2, iy0 + fw, s0 + 0.004], [um + mw / 2, iy1 - fw, s1 - 0.004], sash);
    w.box(f, [iu0 + fw, ym - mw / 2, s0 + 0.004], [iu1 - fw, ym + mw / 2, s1 - 0.004], sash);
    for (const [a, b, c, d] of [
      [iu0 + fw, um - mw / 2, iy0 + fw, ym - mw / 2], [um + mw / 2, iu1 - fw, iy0 + fw, ym - mw / 2],
      [iu0 + fw, um - mw / 2, ym + mw / 2, iy1 - fw], [um + mw / 2, iu1 - fw, ym + mw / 2, iy1 - fw],
    ]) w.pane(f, [a, c, gz0], [b, d, gz1], f.z);
  }
  // the dark room behind, so the glass reads against something
  w.box(f, [o.u0, o.y0, -0.12], [o.u1, o.y1, -0.10], { tone: ROOM, uv: 'flat', weather: 0 });
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

/** A door opening's reveal through the frame (inside the door's piece): its jambs' and head's inner faces. */
function doorReveal(w: ShedWriter, f: Frame, o: Opening, y0: number): void {
  const rev: Look = { tone: mulc(w.style.trim, 0.85), uv: w.plankUv(0.1, 1), seg: 2 };
  w.box(f, [o.u0, y0, -0.10], [o.u0 + 0.035, o.y1, 0], rev);
  w.box(f, [o.u1 - 0.035, y0, -0.10], [o.u1, o.y1, 0], rev);
  w.box(f, [o.u0 + 0.035, o.y1 - 0.035, -0.10], [o.u1 - 0.035, o.y1, 0], rev);
}

/** A ladder stored flat along a wall on two iron hooks at its ends (inside its panel's piece): rails, rungs, the hooks. */
function hungLadder(w: ShedWriter, f: Frame, u0: number, u1: number, y: number): void {
  const st = w.style, z0 = BOARD_T + BATTEN_T + 0.05, rail = 0.055, gap = 0.36;
  const tone = boardTone(w, mulc(st.wood, 1.05));
  for (const dy of [0, gap]) w.box(f, [u0, y + dy, z0], [u1, y + dy + rail, z0 + 0.03], { tone, uv: w.plankUv(rail, 0), seg: 2 });
  for (let u = u0 + 0.15; u < u1 - 0.1; u += 0.3) {
    w.box(f, [u - 0.017, y + rail, z0 + 0.004], [u + 0.017, y + gap, z0 + 0.026], { tone: mulc(tone, 0.95), uv: w.plankUv(0.034, 1), seg: 1 });
  }
  // the hooks: out of the battens, up round the lower rail, at the rails' ends (kitConnectivity: a bar meets something at
  // both of its ends)
  for (const u of [u0 + 0.02, u1 - 0.02]) {
    w.box(f, [u - 0.012, y - 0.03, BOARD_T + BATTEN_T - 0.005], [u + 0.012, y - 0.008, z0 + 0.045], { tone: IRON, uv: 'flat', weather: 0.3 });
    // (its strap up over both rails' faces)
    w.box(f, [u - 0.012, y - 0.03, z0 + 0.03], [u + 0.012, y + gap + rail + 0.012, z0 + 0.045], { tone: IRON, uv: 'flat', weather: 0.3 });
  }
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
  opts: { battens: number[]; snow: boolean; lift?: number; snowDepth?: number; snowLip?: boolean; eaveEdge?: boolean; upperEdge?: boolean }): number[] {
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
    // sheathing boards, the felt in strips laid from the eave up (each lapping the one below), lath strips down it;
    // a strip's tone is its course's on the whole plane, so the sections' strips run on across their joints
    roofBox(w, rp, a0, a1, b0, b1, lift, lift + 0.022, { tone: boardTone(w, st.frame), uv: w.plankUv(0.2, 0), seg: 2 });
    const strip = 0.92, lapM = 0.09, plane = Math.round(rp.up[0] * 97 + rp.up[2] * 89);
    let s = 0;
    for (let b = b0; b < b1 - 0.05; b += strip - lapM, s++) {
      const top = Math.min(b1, b + strip), kick = s * 0.0006, course = Math.round(b * 7);
      roofBox(w, rp, a0, a1, b - 0.01, top, lift + 0.022 + kick, lift + 0.03 + kick,
        { tone: mulc(st.roofTone, 1 + (hash3(course, plane, 5, w.salt) - 0.5) * 0.12), uv: 'flat', roof: true });
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
    // the snow load: a slab over the covering, its eave edge rounded off and hanging a hand over (at the roof's own eave
    // and upper edge only: across a joint between two rows it runs on)
    const top = coverTop(st.roof) + lift, depth = opts.snowDepth ?? 0.14, snow: Look = { tone: SNOW, uv: 'flat', weather: 0 };
    const eave = opts.eaveEdge !== false, upper = opts.upperEdge !== false;
    const end = upper ? b1 - 0.05 : b1;
    if (opts.snowLip === false || !eave) {
      roofBox(w, rp, a0, a1, eave ? b0 + 0.02 : b0, end, top, top + depth, snow);
    } else {
      roofBox(w, rp, a0, a1, b0 + 0.08, end, top, top + depth, snow);
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
    // (a whole number of waves across the sheet, a trough at each edge: it bears on what it lies on there)
    const wave = (a1 - a0) / Math.max(1, Math.round((a1 - a0) / pitch));
    const n = Math.max(4, Math.round((a1 - a0) / wave * 4));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n), ph = ((a - a0) / wave) * Math.PI * 2;
      prof.push([a, depth * (1 - Math.cos(ph)) / 2, depth * Math.PI / wave * Math.sin(ph)]);
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
  post: 0.14,
  /** The rafters' top line: y = rafterWallY + tan(pitch)·(hx − |x|). */
  rafterWallY: 2.62,
  pitch: Math.atan2(1.35, 2.1),
  rafterD: 0.14,
  eaveX: 2.44,
  /** The roof's ends: flush with the gables' cladding (a close verge: the barge boards ride on the gable boards'
   * boards' faces, over the battens' tops), so a roof piece's box reaches over a gable wall's by a board at most (the
   * destruction core's bodies start apart). */
  gableZ: 2.8 + 0.024,
  boardY0: 0.17,
  door: { u0: -0.45, u1: 0.45, y0: 0.33, y1: 2.29 },
  frontWindow: { u0: -1.62, u1: -1.0, y0: 1.06, y1: 1.78 },
  sideWindow: { u0: -0.72, u1: -0.1, y0: 1.06, y1: 1.78 },
  trussZ: [-2.765, -1.383, 0, 1.383, 2.765],
};

/** The rafters' top at |x|. */
const fhRafterTop = (x: number): number => FH.rafterWallY + Math.tan(FH.pitch) * (FH.hx - Math.abs(x));
/** The plates' top: the rafters' underside where it crosses the wall line (they bear on the plates' outer edges). */
const FH_PLATE_Y1 = FH.rafterWallY - FH.rafterD / Math.cos(FH.pitch);
const FH_PLATE_Y0 = FH_PLATE_Y1 - FH.post;
/** The front panels' outermost face (the porch ledger's and its flashing's): the porch's pieces start beyond it. */
const FH_FRONT_OUT = 0.094;

/**
 * The porch over the door: its rafters hung off the ledger's face on iron hangers (their square-cut feet on the face at
 * 2.36 m), battens across them, a beam on two braced posts; the plane is the battens' top.
 */
const FH_PORCH = (() => {
  const a = Math.atan2(0.32, 3.9 - 2.85), rd = 0.09, bat = 0.03, zL = FH.hz + FH_FRONT_OUT;
  const up: V3 = [0, Math.cos(a), Math.sin(a)], f: V3 = [0, Math.sin(a), -Math.cos(a)];
  const o: V3 = [0, 2.36 + (rd + bat) * up[1], zL + (rd + bat) * up[2]];
  const y = (z: number): number => o[1] - Math.tan(a) * (z - o[2]);
  const eaveZ = 3.9, postZ = 3.66, postX = 1.08;
  return {
    a, rd, bat, zL, o, eaveZ, postZ, postX, stoopTop: 0.22,
    plane: { o, e: [1, 0, 0], f, up } as RoofPlane,
    /** b (along its plane, up-slope positive) at the eave, and at the covering's back edge (its foot on the ledger line). */
    eaveB: -(eaveZ - o[2]) / Math.cos(a),
    backB: (o[2] - zL) / Math.cos(a),
    beamTop: y(postZ) - (rd + bat) / Math.cos(a),
  };
})();

export function buildShedFieldHut(st: ShedStyle, rng: Rng, detail: ShedDetail = 'full'): ShedBuild {
  const w = new ShedWriter(st, rng, 0x51ed, detail);
  const cosP = Math.cos(FH.pitch), sinP = Math.sin(FH.pitch);
  const dV = FH.rafterD / cosP;
  const frameLook = (width: number, grain: 0 | 1 | 2): Look => ({ tone: boardTone(w, st.frame), uv: w.memberUv(width, grain), seg: 3 });
  const stoneLook = (): Look => ({ tone: mulc(st.stone, 1 + (w.rng() - 0.5) * 0.18), uv: 'flat' });
  const footMaterial: FractureMaterial = st.footing === 'brick' ? 'brick' : st.footing === 'concrete' ? 'concrete' : 'stone';
  const roofMaterial: FractureMaterial = st.roof === 'tin' ? 'metal' : st.roof === 'fibre' ? 'slate' : 'plank';
  const iron: Look = { tone: IRON, uv: 'flat', weather: 0.3 };

  // --- the footings (an anchor: their tops under the cladding's foot), and on them the sill frame with the floor
  // between (another: what a collapse leaves standing)
  const stones = w.begin({ role: 'footing', material: footMaterial, anchor: true, face: 'floor', axes: AXES });
  for (const sx of [-1, 1]) for (const z of [-FH.hz + 0.2, 0, FH.hz - 0.2]) {
    footing(w, frame([sx * (FH.hx - FH.sillW / 2), 0, z], [1, 0, 0], [0, 1, 0]), FH.sillY0 - 0.016, stoneLook);
  }
  w.end();
  const base = w.begin({ role: 'sill', material: 'timber', anchor: true, face: 'floor', axes: AXES });
  for (const sx of [-1, 1]) {
    const f = frame([sx * (FH.hx - FH.sillW / 2), FH.sillY0, 0], [0, 0, 1], [0, 1, 0]);
    w.box(f, [-FH.hz, 0, -FH.sillW / 2], [FH.hz, FH.sillY1 - FH.sillY0, FH.sillW / 2], frameLook(FH.sillW, 0));
  }
  for (const sz of [-1, 1]) {
    const f = frame([0, FH.sillY0, sz * (FH.hz - FH.sillW / 2)], [1, 0, 0], [0, 1, 0]);
    w.box(f, [-FH.hx + FH.sillW, 0, -FH.sillW / 2], [FH.hx - FH.sillW, FH.sillY1 - FH.sillY0, FH.sillW / 2], frameLook(FH.sillW, 0));
  }
  {
    // the floor deck between the sills, flush with their tops (its boards along z: the frame's x is world z, its z −x)
    const f = frame([0, FH.sillY1 - 0.03, 0], [0, 0, 1], [0, 1, 0]);
    for (const [x0, x1] of boardRuns(w, -FH.hx + FH.sillW, FH.hx - FH.sillW, 0.16, 0.22)) {
      w.box(f, [-FH.hz + FH.sillW, 0, -x1 + 0.002], [FH.hz - FH.sillW, 0.03, -x0 - 0.002],
        { tone: boardTone(w, mulc(st.wood, 0.85)), uv: w.plankUv(x1 - x0, 0), seg: 2, weather: 0.4 });
    }
  }
  w.end();
  w.link(base, stones, 'rest');

  // --- corner posts on the sills, the wall plates on the posts
  const posts = new Map<string, number>();
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const f = frame([sx * (FH.hx - FH.post / 2), FH.sillY1, sz * (FH.hz - FH.post / 2)], [1, 0, 0], [0, 1, 0]);
    const idx = w.begin({ role: 'post', material: 'timber', axes: f, scoreAxis: 1, scores: [0.55, 1.35] });
    w.box(f, [-FH.post / 2, 0, -FH.post / 2], [FH.post / 2, FH_PLATE_Y0 - FH.sillY1, FH.post / 2], frameLook(FH.post, 1));
    w.end();
    posts.set(`${sx},${sz}`, idx);
    w.link(idx, base, 'bolt');
  }
  const postOf = (sx: number, sz: number): number => posts.get(`${sx},${sz}`)!;
  const plates: number[] = [];
  for (const sx of [-1, 1]) {
    const f = frame([sx * (FH.hx - FH.post / 2), FH_PLATE_Y0, 0], [0, 0, 1], [0, 1, 0]);
    const idx = w.begin({ role: 'plate', material: 'timber', face: sx > 0 ? 'right' : 'left', axes: f, scoreAxis: 0, scores: [-1.38, 0, 1.38] });
    w.box(f, [-FH.hz, 0, -FH.post / 2], [FH.hz, FH.post, FH.post / 2], frameLook(FH.post, 0));
    w.end();
    plates.push(idx);
    w.link(idx, postOf(sx, -1), 'nail'); w.link(idx, postOf(sx, 1), 'nail');
  }

  // --- the rafters, each its own piece: seated on the plate's outer edge, square-cut against the ridge board, the tail
  // plumb-cut under the eave (a pair's A would be one box over the whole gable)
  const tail = FH.eaveX - 0.02, xa = 0.016;
  const rafters: { idx: number; sx: number; t: number }[] = [];
  FH.trussZ.forEach((z, t) => {
    for (const sx of [-1, 1] as const) {
      const down: V3 = [sx * cosP, -sinP, 0], up: V3 = [sx * sinP, cosP, 0];
      const foot: V3 = [sx * xa, fhRafterTop(xa) - dV, z];
      const head = xa + FH.rafterD * sinP;
      const idx = w.begin({ role: 'rafter', material: 'timber', face: 'roof', axes: frame(foot, down, up), scoreAxis: 0, scores: [0.95, 1.9] });
      const f = frame([0, 0, z], [1, 0, 0], [0, 1, 0]);
      const poly: [number, number][] = sx > 0
        ? [[xa, fhRafterTop(xa) - dV], [tail, fhRafterTop(tail) - dV], [tail, fhRafterTop(tail)], [head, fhRafterTop(head)]]
        : [[-tail, fhRafterTop(tail) - dV], [-xa, fhRafterTop(xa) - dV], [-head, fhRafterTop(head)], [-tail, fhRafterTop(tail)]];
      w.prism(f, poly, -0.03, 0.03, { tone: boardTone(w, st.frame), uv: w.memberUv(0.06, 0), seg: 3 });
      w.end();
      rafters.push({ idx, sx, t });
      w.link(idx, plates[sx < 0 ? 0 : 1], 'nail');
    }
  });

  // --- the roof planes (the battens' top), the ridge board standing up through the covering's gap as a ridge roll
  const top = coverTop(st.roof);
  const capT = st.roof === 'boards' ? 0.022 : st.roof === 'felt' ? 0.007 : st.roof === 'fibre' ? 0.012 : 0.004;
  const capLook = (): Look => st.roof === 'boards'
    ? { tone: boardTone(w, st.roofTone), uv: w.plankUv(0.17, 0), seg: 3, roof: true }
    : { tone: mulc(st.roofTone, st.roof === 'felt' ? 1.05 : 0.96), uv: 'flat', roof: true, rust: st.roof === 'tin' };
  const planes = ([-1, 1] as const).map((sx) => {
    const down: V3 = [sx * cosP, -sinP, 0];
    const rp: RoofPlane = { o: [0, fhRafterTop(0) + 0.03 / cosP, 0], e: [0, 0, 1], f: scl(down, -1), up: nrm([sx * sinP, cosP, 0]) };
    return { sx, rp, down };
  });
  const ridgeY = fhRafterTop(0), planeY = ridgeY + 0.03 / cosP;
  const finTop = planeY + (top + capT) / cosP - 0.004;
  /** The ridge roll over z0..z1: the board's top standing through the gap and its cap strip. */
  const ridgeRoll = (z0: number, z1: number, fromY: number): void => {
    w.box(AXES, [-0.016, fromY, z0], [0.016, finTop, z1], frameLook(0.2, 2));
    w.box(AXES, [-0.024, finTop - 0.004, z0], [0.024, finTop + 0.014, z1], capLook());
  };
  const ridge = w.begin({ role: 'board', material: 'plank', face: 'roof', axes: AXES, scoreAxis: 2, scores: [-1.4, 0, 1.4] });
  ridgeRoll(-FH.hz, FH.hz, ridgeY - 0.17);
  w.end();
  for (const r of rafters) w.link(ridge, r.idx, 'nail');

  // --- the roof sections, two a slope between the gables: battens, covering, snow, the cap boards on their own side
  const eaveB = -(FH.eaveX + 0.03) / cosP, ridgeB = -0.02;
  const battens: number[] = [];
  for (let b = eaveB + 0.08; b < ridgeB - 0.05; b += 0.36) battens.push(b);
  const sections: { idx: number; sx: number; z: [number, number] }[] = [];
  for (const { sx, rp } of planes) {
    for (const z of [[-FH.gableZ, 0], [0, FH.gableZ]] as [number, number][]) {
      const idx = w.begin({
        role: 'roof', material: roofMaterial, face: 'roof', axes: roofFrame(rp), scoreAxis: 0,
        roofPitch: { axis: 'x', outwardSign: sx, angleRad: FH.pitch, kind: 'gable' },
      });
      const joints = coverRoof(w, rp, z[0], z[1], eaveB, ridgeB, { battens, snow: st.snow });
      roofBox(w, rp, z[0], z[1], -0.19, -0.015, top, top + capT, capLook());
      w.end();
      w.rescore(idx, joints);
      sections.push({ idx, sx, z });
      for (const r of rafters) if (r.sx === sx && FH.trussZ[r.t] > z[0] - 0.1 && FH.trussZ[r.t] < z[1] + 0.1) w.link(idx, r.idx, 'nail');
      w.link(idx, ridge, 'nail');
    }
  }

  // --- the walls: boards and battens on the frame's face in panels (nothing of a panel inside the frame's plane)
  const sideTop = (): number => fhRafterTop(FH.hx + BOARD_T + BATTEN_T) - dV - 0.005;
  const rakeTop = (u: number): number => fhRafterTop(u) + 0.008;
  // left (−x): u = world z; the side window and its shutters in the back panel
  const fL = frame([-FH.hx, 0, 0], [0, 0, 1], [0, 1, 0]);
  const left = cladWall(w, {
    face: 'left', f: fL, u0: -FH.hz, u1: FH.hz, y0: FH.boardY0, top: sideTop, openings: [FH.sideWindow], splits: [0.45],
  }, (_panel, [a, b]) => { if (FH.sideWindow.u0 >= a - 1e-6 && FH.sideWindow.u1 <= b + 1e-6) windowDress(w, fL, FH.sideWindow); });
  // right (+x): u = world −z; a ladder hung along it under the eave on two iron hooks
  const fR = frame([FH.hx, 0, 0], [0, 0, -1], [0, 1, 0]);
  const right = cladWall(w, {
    face: 'right', f: fR, u0: -FH.hz, u1: FH.hz, y0: FH.boardY0, top: sideTop, openings: [], splits: [1.6],
  }, () => undefined);
  {
    // a ladder hung along it under the eave on two iron hooks (its own piece: it comes down by itself)
    const ladder = w.begin({ role: 'fitting', material: 'timber', face: 'right', axes: fR, scoreAxis: 0, scores: [0] });
    hungLadder(w, fR, -1.55, 1.55, 1.82);
    w.end();
    const k = right.ranges.findIndex(([a, b]) => a < -1.5 && b > 1.5);
    w.link(ladder, right.pieces[k >= 0 ? k : 0], 'rest');
  }
  for (const [wall, sx] of [[left, -1], [right, 1]] as const) {
    wall.pieces.forEach((pi, k) => {
      w.link(pi, base, 'nail');
      w.link(pi, plates[sx < 0 ? 0 : 1], 'nail');
      // the left wall's u runs back to front (+z), the right's front to back
      if (k === 0) w.link(pi, postOf(sx, sx < 0 ? -1 : 1), 'nail');
      if (k === wall.pieces.length - 1) w.link(pi, postOf(sx, sx < 0 ? 1 : -1), 'nail');
    });
  }
  // the gables: the front (+z) u = world x, the back (−z) u = world −x; their boards run up to the rake and over the
  // side walls' board edges at the corners; the porch ledger and its flashing across the front, a part on each panel
  const endU = FH.hx + BOARD_T + BATTEN_T;
  const fF = frame([0, 0, FH.hz], [1, 0, 0], [0, 1, 0]);
  // (the door's opening runs to the cladding's foot: no board stub under the threshold)
  const doorO: Opening = { u0: FH.door.u0 - 0.04, u1: FH.door.u1 + 0.04, y0: FH.boardY0, y1: FH.door.y1 + 0.05 };
  /**
   * The barge boards over a gable panel's stretch of the rakes (world x from x0 to x1 at the gable's face, zs its side):
   * standing on the gable boards' face over the covering's edge, cut plumb at the panel's edges and at the apex, square
   * at the eaves; the finial where the two meet.
   */
  const eaveRun = (FH.eaveX + 0.03) / cosP + 0.04;
  const bargeOver = (zs: number, x0: number, x1: number, tone: Rgb): void => {
    const zc = zs * (FH.gableZ + 0.016), yb = -0.21, yt = top + 0.012;
    for (const { sx, rp, down } of planes) {
      const lo = sx < 0 ? Math.max(0, -Math.min(x1, 0)) : Math.max(0, x0), hi = sx < 0 ? -x0 : x1;
      if (hi - lo < 0.02) continue;
      const atX = (ax: number, y: number): number => (ax - y * sinP) / cosP;
      const outer = (y: number): number => (hi >= endU - 1e-6 ? eaveRun : atX(hi, y));
      const bf = frame([0, rp.o[1], zc], down, rp.up);
      w.prism(bf, [[atX(lo, yb), yb], [outer(yb), yb], [outer(yt), yt], [atX(lo, yt), yt]], -0.016, 0.016,
        { tone, uv: { grain: 0, u0: 0.68, v0: 0.13 + sx * 0.07 }, seg: 3 });
    }
    if (x0 < 0 && x1 > 0) {
      const apexY = planes[0].rp.o[1] + (top + 0.012) / cosP;
      const ff = frame([0, 0, zc], [1, 0, 0], [0, 1, 0]);
      const trim: Look = { tone, uv: w.plankUv(0.07, 1), seg: 2 };
      w.box(ff, [-0.035, apexY - 0.36, -0.024], [0.035, apexY + 0.08, 0.024], trim);
      w.prism(ff, [[-0.035, apexY + 0.08], [0.035, apexY + 0.08], [0, apexY + 0.17]], -0.024, 0.024, trim);
    }
  };
  const frontBarge = boardTone(w, st.trim), backBarge = boardTone(w, st.trim);
  const ledgerTone = boardTone(w, st.frame);
  const jamb = (u0: number, u1: number): void => {
    w.box(fF, [u0, FH.door.y0, BOARD_T], [u1, doorO.y1 + 0.1, BOARD_T + 0.022], { tone: boardTone(w, st.trim), uv: w.plankUv(0.09, 1), seg: 2 });
  };
  const front = cladWall(w, {
    face: 'front', f: fF, u0: -endU, u1: endU, y0: FH.boardY0, top: rakeTop, openings: [doorO, FH.frontWindow],
    splits: [doorO.u0, doorO.u1],
  }, (_panel, [a, b]) => {
    bargeOver(1, a, b, frontBarge);
    const lo = Math.max(a, -1.3), hi = Math.min(b, 1.3);
    if (hi - lo > 0.02) {
      w.box(fF, [lo, 2.32, BOARD_T], [hi, 2.47, FH_FRONT_OUT], { tone: ledgerTone, uv: w.memberUv(0.07, 0), seg: 3 });
      w.box(fF, [lo, 2.47, BOARD_T], [hi, 2.476, FH_FRONT_OUT], { tone: mulc(IRON, 1.3), uv: 'flat', weather: 0.4 });
    }
    if (FH.frontWindow.u0 >= a - 1e-6 && FH.frontWindow.u1 <= b + 1e-6) windowDress(w, fF, FH.frontWindow);
    if (Math.abs(b - doorO.u0) < 1e-6) jamb(doorO.u0 - 0.075, doorO.u0);
    if (Math.abs(a - doorO.u1) < 1e-6) jamb(doorO.u1, doorO.u1 + 0.075);
    if (Math.abs(a - doorO.u0) < 1e-6 && Math.abs(b - doorO.u1) < 1e-6) {
      // over the door: the head trim between the jambs, and a louvred vent high in the gable
      w.box(fF, [doorO.u0, doorO.y1, BOARD_T], [doorO.u1, doorO.y1 + 0.1, BOARD_T + 0.028], { tone: boardTone(w, st.trim), uv: w.plankUv(0.1, 0), seg: 2 });
      for (let k = 0; k < 3; k++) {
        const y = 3.12 + k * 0.09;
        w.box(fF, [-0.22, y, BOARD_T], [0.22, y + 0.05, BOARD_T + 0.03], { tone: mulc(st.trim, 0.85), uv: w.plankUv(0.05, 0), seg: 1 });
      }
    }
  });
  const fB = frame([0, 0, -FH.hz], [-1, 0, 0], [0, 1, 0]);
  const back = cladWall(w, {
    face: 'back', f: fB, u0: -endU, u1: endU, y0: FH.boardY0, top: rakeTop, openings: [], splits: [0.6],
  }, (_panel, [a, b]) => {
    bargeOver(-1, -b, -a, backBarge);
    // a louvred vent high in the back gable, in the panel that holds the gable's middle
    if (a <= -0.3 && b >= 0.3) {
      for (let k = 0; k < 3; k++) {
        const y = 3.12 + k * 0.09;
        w.box(fB, [-0.22, y, BOARD_T], [0.22, y + 0.05, BOARD_T + 0.03], { tone: mulc(st.trim, 0.85), uv: w.plankUv(0.05, 0), seg: 1 });
      }
      w.box(fB, [-0.26, 3.07, BOARD_T], [0.26, 3.12, BOARD_T + 0.035], { tone: st.trim, uv: w.plankUv(0.05, 0), seg: 1 });
    }
  });
  if (front.pieces.length !== 3) throw new Error('shedKit: the field hut front must split round its door');
  const [frontL, overDoor, frontR] = front.pieces;
  const endRafters = (zs: number): number[] => rafters.filter((r) => FH.trussZ[r.t] * zs > 2.7).map((r) => r.idx);
  for (const [wall, zs] of [[front, 1], [back, -1]] as const) {
    for (const pi of wall.pieces) {
      w.link(pi, base, 'nail');
      for (const r of endRafters(zs)) w.link(pi, r, 'nail');
      // the roof's ends ride on the gable's top
      for (const sec of sections) if ((sec.z[0] + sec.z[1]) * zs > 0) w.link(pi, sec.idx, 'nail');
    }
  }
  w.link(frontL, postOf(-1, 1), 'nail'); w.link(frontR, postOf(1, 1), 'nail');
  w.link(overDoor, frontL, 'nail'); w.link(overDoor, frontR, 'nail');
  w.link(back.pieces[0], postOf(1, -1), 'nail'); w.link(back.pieces[back.pieces.length - 1], postOf(-1, -1), 'nail');

  // --- the windows' insets (each its own piece behind its panel's face): reveal, sash, glass, the dark room
  const sidePanel = left.pieces[left.ranges.findIndex(([a, b]) => FH.sideWindow.u0 >= a - 1e-6 && FH.sideWindow.u1 <= b + 1e-6)];
  for (const [f, o, panel, face] of [[fL, FH.sideWindow, sidePanel, 'left'], [fF, FH.frontWindow, frontL, 'front']] as const) {
    const idx = w.begin({ role: 'frame', material: 'glass', face, axes: f });
    windowInset(w, f, o);
    w.end();
    w.link(idx, panel, 'nail');
  }

  // --- the door, hung on the right jamb, with its opening's reveal
  const door = w.begin({ role: 'door', material: 'plank', face: 'front', axes: fF, scoreAxis: 0, scores: [-0.15, 0.15] });
  ledgedDoor(w, fF, FH.door, false);
  doorReveal(w, fF, doorO, FH.door.y0);
  w.end();
  w.link(door, frontR, 'nail');
  w.link(door, base, 'rest');

  // --- the porch: the rafters hung off the ledger and battened (one piece), the covering (the roof's own plane: the
  // pitch receipt regresses a piece's every vertex), the beam, the two posts with short knee braces
  const P = FH_PORCH, pPlane = P.plane;
  const porchRafters = w.begin({ role: 'rafter', material: 'timber', face: 'roof', axes: roofFrame(pPlane), scoreAxis: 0, scores: [-0.83, 0, 0.83] });
  for (const x of [-1.24, -0.42, 0.42, 1.24]) {
    roofBox(w, pPlane, x - 0.025, x + 0.025, P.eaveB + 0.03, 0, -(P.rd + P.bat), -P.bat, { tone: boardTone(w, st.frame), uv: w.memberUv(0.05, 2), seg: 2 });
    // its hanger's two iron cheeks against the ledger
    for (const s of [-1, 1]) {
      const x0 = x + s * 0.025, x1 = x0 + s * 0.003;
      roofBox(w, pPlane, Math.min(x0, x1), Math.max(x0, x1), -0.1, 0, -(P.rd + P.bat) + 0.012, -P.bat - 0.012, iron);
    }
  }
  for (const b of [P.eaveB + 0.15, P.eaveB * 0.5, -0.12]) {
    roofBox(w, pPlane, -1.38, 1.38, b - 0.025, b + 0.025, -P.bat, 0, { tone: boardTone(w, st.frame), uv: w.memberUv(0.05, 0), seg: 2 });
  }
  // the fascia across the rafters' tails, up to the covering (the destructible-kits lane: the tails' ends meet it)
  roofBox(w, pPlane, -1.38, 1.38, P.eaveB, P.eaveB + 0.03, -(P.rd + P.bat), 0, { tone: boardTone(w, st.trim), uv: w.memberUv(0.12, 0), seg: 2 });
  w.end();
  for (const pi of front.pieces) w.link(porchRafters, pi, 'nail');
  {
    const porch = w.begin({
      role: 'roof', material: roofMaterial, face: 'roof', axes: roofFrame(pPlane),
      roofPitch: { axis: 'z', outwardSign: 1, angleRad: P.a, kind: 'skillion' },
    });
    // (a thinner load on the short porch roof: it sheds its snow)
    coverRoof(w, pPlane, -1.38, 1.38, P.eaveB, P.backB, { battens: [], snow: st.snow, snowDepth: 0.035, snowLip: false });
    w.end();
    w.link(porch, porchRafters, 'nail');
  }
  const beam = w.begin({ role: 'plate', material: 'timber', face: 'front', axes: AXES, scoreAxis: 0, scores: [-0.6, 0.6] });
  // (its ends 1.5 cm past the outer rafters it carries)
  w.box(AXES, [-1.28, P.beamTop - 0.12, P.postZ - 0.06], [1.28, P.beamTop, P.postZ + 0.06], frameLook(0.12, 0));
  w.end();
  w.link(beam, porchRafters, 'nail');
  const porchPosts: number[] = [];
  for (const sx of [-1, 1]) {
    const pf = frame([sx * P.postX, 0, P.postZ], [1, 0, 0], [0, 1, 0]);
    const idx = w.begin({ role: 'post', material: 'timber', face: 'front', axes: pf, scoreAxis: 1, scores: [1.0] });
    w.box(pf, [-0.055, P.stoopTop, -0.055], [0.055, P.beamTop - 0.12, 0.055], frameLook(0.11, 1));
    const yb = P.beamTop - 0.12, ya = yb - 0.33, xa = sx * (P.postX - 0.05), xb = sx * (P.postX - 0.38);
    const dir = nrm([xb - xa, yb - ya, 0]);
    const bf = frame([xa, ya, P.postZ], dir, cross([0, 0, 1], dir));
    w.box(bf, [0, -0.03, -0.03], [Math.hypot(xb - xa, yb - ya), 0.03, 0.03], frameLook(0.06, 0));
    w.end();
    porchPosts.push(idx);
    w.link(idx, beam, 'nail');
  }

  // --- the stoop (an anchor): a deck on sleepers at the door, a stone step, the porch posts' pad stones
  {
    const stoop = w.begin({ role: 'slab', material: 'plank', face: 'floor', anchor: true, axes: AXES });
    const z0 = FH.hz + FH_FRONT_OUT + 0.004;
    for (const x of [-0.45, 0.45]) w.box(AXES, [x - 0.06, -0.04, z0], [x + 0.06, P.stoopTop - 0.04, 3.5], frameLook(0.12, 2));
    for (const [za, zb] of boardRuns(w, z0, 3.5, 0.13, 0.17)) {
      w.box(AXES, [-0.6, P.stoopTop - 0.04, za + 0.004], [0.6, P.stoopTop, zb - 0.004], { tone: boardTone(w, mulc(st.wood, 0.9)), uv: w.plankUv(zb - za, 0), seg: 2 });
    }
    w.stone(AXES, [-0.5, -0.1, 3.52], [0.5, 0.15, 3.9], stoneLook(), 0.1);
    for (const sx of [-1, 1]) {
      w.stone(frame([sx * P.postX, 0, P.postZ], [1, 0, 0], [0, 1, 0]), [-0.15, -0.12, -0.15], [0.15, P.stoopTop - 0.012, 0.15], stoneLook(), 0.08);
    }
    w.end();
    for (const pp of porchPosts) w.link(pp, stoop, 'bolt');
  }
  // --- a bench under the front window, a rain barrel by the porch
  {
    const f = frame([-1.675, 0, 3.12], [1, 0, 0], [0, 1, 0]);
    w.begin({ role: 'fitting', material: 'plank', anchor: true, axes: f });
    for (const x of [-0.3, 0.3]) w.box(f, [x - 0.03, 0, -0.16], [x + 0.03, 0.42, 0.16], frameLook(0.06, 1));
    w.box(f, [-0.375, 0.42, -0.17], [0.375, 0.47, 0.17], { tone: boardTone(w, st.wood), uv: w.plankUv(0.34, 0), seg: 2 });
    w.box(f, [-0.3, 0.12, -0.03], [0.3, 0.18, 0.03], frameLook(0.06, 0));
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

  // --- the winter's firewood stacked against the back gable, its split ends out
  {
    const zb = -(FH.gableZ + 0.032) - 0.012;
    const idx = w.begin({ role: 'fitting', material: 'timber', anchor: true, face: 'back', axes: AXES, scoreAxis: 0, scores: [-0.9] });
    firewoodStack(w, -1.62, -0.2, zb - 0.46, zb, 1.04, -1);
    w.end();
    for (const pi of back.pieces) w.link(idx, pi, 'rest');
  }

  // --- the stovepipe out of the back of the left slope: its foot cut to the covering (or the snow) on a lead plate,
  // its rain cap (its box lies along the slope, so it stands on the section and not in it)
  {
    const sl = planes[0];
    const px = -1.05, pz = -1.85, r = 0.075, sides = 10;
    const lift = top + (st.snow ? 0.14 : 0);
    const surface = (x: number): number => fhRafterTop(x) + 0.03 / cosP + lift / cosP;
    const pipe = w.begin({ role: 'chimney', material: 'metal', axes: roofFrame(sl.rp), scoreAxis: 1, scores: [lift + 0.5] });
    const look: Look = { tone: hexLin(0x3c3a37), uv: 'flat', weather: 0.5, rust: true };
    const yMid = surface(px + r) + 0.03;
    const f = frame([px, 0, pz], [1, 0, 0], [0, 1, 0]);
    for (let j = 0; j < sides; j++) {
      const ring = (k: number, y: number | null): { p: V3; n: V3 } => {
        const a = (k / sides) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
        return { p: [px + cx * r, y ?? surface(px + cx * r) + 0.006, pz + cz * r], n: [cx, 0, cz] };
      };
      const q = [ring(j, null), ring(j + 1, null), ring(j + 1, yMid), ring(j, yMid)];
      w.quad(q.map((v) => v.p), q.map((v) => v.n), [FLAT_PAIR, FLAT_PAIR, FLAT_PAIR, FLAT_PAIR], q.map((v) => w.shade(look, v.p, v.n, false, true)));
    }
    w.cylinder(f, r, r, yMid, 4.32, sides, look, false);
    const bp = (px + lift * sinP) / cosP;
    roofBox(w, sl.rp, pz - 0.19, pz + 0.19, bp - 0.2, bp + 0.2, lift, lift + 0.006, { tone: hexLin(0x6d6f70), uv: 'flat', weather: 0.5 });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2, cx = Math.cos(a) * 0.072, cz = Math.sin(a) * 0.072;
      w.box(f, [cx - 0.008, 4.3, cz - 0.008], [cx + 0.008, 4.4, cz + 0.008], look);
    }
    w.cylinder(f, 0.18, 0.02, 4.4, 4.5, 10, look, true);
    w.end();
    for (const sec of sections) if (sec.sx < 0 && pz > sec.z[0] && pz < sec.z[1]) w.link(pipe, sec.idx, 'nail');
  }

  return w.finish('fieldhut', 48);
}

/** A footing under a sill or a post, its top at topY (inside its piece). */
function footing(w: ShedWriter, f: Frame, topY: number, stoneLook: () => Look, size = 1): void {
  const st = w.style;
  if (st.footing === 'fieldstone') {
    w.stone(f, [-0.24 * size, -0.16, -0.22 * size], [0.24 * size, topY + 0.01, 0.22 * size], stoneLook());
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
    w.box(f, [-0.2 * size, -0.16, -0.2 * size], [0.2 * size, topY + 0.005, 0.2 * size], stoneLook());
    w.box(f, [-0.23 * size, -0.16, -0.23 * size], [0.23 * size, 0.02, 0.23 * size], stoneLook());
  }
}

// ------------------------------------------------------------------------------------------------- the lean-to

/** The lean-to (footprint hw 2.9, hl 2.5, h 3.1): open to +z, its roof falling toward the open front. */
const LT = {
  postX: [-2.4, 0, 2.4],
  /** The front posts' line, and the back wall's line (the collision's: the boards' outer face is a post and its
   * cladding behind it). */
  frontZ: 1.95, backZ: -1.95,
  /** The back posts' line: in from the wall line by the girts the back boards are nailed on (a pole barn's; the wall's
   * inside shows through the open front). */
  backPostZ: -1.87,
  girtD: 0.08,
  post: 0.15,
  slope: 0.18,
  /** The covering's underside (the battens' top): y = coverY0 − tan(slope)·z. */
  coverY0: 2.7,
  roofX: 2.92, roofZ0: -2.5, roofZ1: 2.5,
  /** The side walls' outer face (the side posts' faces): the roof's bays stop over it and its verges run on past. */
  sideX: 2.4 + 0.15 / 2,
  rafterX: [-2.8, -1.68, -0.56, 0.56, 1.68, 2.8],
  rafterD: 0.15,
  footTop: 0.12,
};
const ltCover = (z: number): number => LT.coverY0 - Math.tan(LT.slope) * z;
/** The firewood stacks' back: clear of the back posts and their pad stones. */
const LT_STACK_Z0 = LT.backPostZ + 0.15;

export function buildShedLeanTo(st: ShedStyle, rng: Rng, detail: ShedDetail = 'full'): ShedBuild {
  const w = new ShedWriter(st, rng, 0x1ea7, detail);
  const cosS = Math.cos(LT.slope), sinS = Math.sin(LT.slope);
  const rafterTop = (z: number): number => ltCover(z) - 0.03;
  const rafterBottom = (z: number): number => rafterTop(z) - LT.rafterD / cosS;
  const frameLook = (width: number, grain: 0 | 1 | 2): Look => ({ tone: boardTone(w, st.frame), uv: w.memberUv(width, grain), seg: 3 });
  const stoneLook = (): Look => ({ tone: mulc(st.stone, 1 + (w.rng() - 0.5) * 0.18), uv: 'flat' });
  const beamTop = rafterBottom(LT.frontZ), plateTop = rafterBottom(LT.backPostZ);
  const footMaterial: FractureMaterial = st.footing === 'brick' ? 'brick' : st.footing === 'concrete' ? 'concrete' : 'stone';

  // --- pad stones and the posts on them
  const footings: number[] = [];
  for (const z of [LT.backPostZ, LT.frontZ]) for (const x of LT.postX) {
    const f = frame([x, 0, z], [1, 0, 0], [0, 1, 0]);
    footings.push(w.begin({ role: 'footing', material: footMaterial, anchor: true, axes: f }));
    footing(w, f, LT.footTop - 0.016, stoneLook, z < 0 ? 0.55 : 0.85);
    w.end();
  }
  const posts: number[] = [];
  [LT.backPostZ, LT.frontZ].forEach((z, k) => LT.postX.forEach((x, j) => {
    const f = frame([x, LT.footTop, z], [1, 0, 0], [0, 1, 0]);
    const topY = z > 0 ? beamTop - 0.2 : plateTop - 0.14;
    const idx = w.begin({ role: 'post', material: 'timber', axes: f, scoreAxis: 1, scores: [0.45, 1.25] });
    w.box(f, [-LT.post / 2, 0, -LT.post / 2], [LT.post / 2, topY - LT.footTop, LT.post / 2], frameLook(LT.post, 1));
    w.end();
    posts.push(idx);
    w.link(idx, footings[k * 3 + j], 'rest');
  }));
  const backPosts = posts.slice(0, 3), frontPosts = posts.slice(3);

  // --- the front beam and the back plate
  const beamF = frame([0, beamTop - 0.2, LT.frontZ], [1, 0, 0], [0, 1, 0]);
  const beam = w.begin({ role: 'plate', material: 'timber', face: 'front', axes: beamF, scoreAxis: 0, scores: [-1.2, -0.25, 0.25, 1.2] });
  // (its ends 1.5 cm past the end rafters it carries: the destructible-kits lane, kitConnectivity)
  w.box(beamF, [-2.845, 0, -0.07], [2.845, 0.2, 0.07], frameLook(0.14, 0));
  w.end();
  for (const p of frontPosts) w.link(beam, p, 'bolt');
  const plateF = frame([0, plateTop - 0.14, LT.backPostZ], [1, 0, 0], [0, 1, 0]);
  const plate = w.begin({ role: 'plate', material: 'timber', face: 'back', axes: plateF, scoreAxis: 0, scores: [-1.2, -0.25, 0.25, 1.2] });
  w.box(plateF, [-2.845, 0, -0.07], [2.845, 0.14, 0.07], frameLook(0.14, 0));
  w.end();
  for (const p of backPosts) w.link(plate, p, 'bolt');

  // --- knee braces from the front posts up to the beam
  LT.postX.forEach((x, j) => {
    for (const side of j === 1 ? [-1, 1] : [j === 0 ? 1 : -1]) {
      const ya = beamTop - 0.2 - 0.62, yb = beamTop - 0.2;
      const xa = x + side * LT.post / 2, xb = x + side * 0.62;
      const dir = nrm([xb - xa, yb - ya, 0]);
      const bf = frame([xa, ya, LT.frontZ], dir, cross([0, 0, 1], dir));
      const idx = w.begin({ role: 'brace', material: 'timber', axes: bf });
      const len = Math.hypot(xb - xa, yb - ya), tanA = Math.abs(dir[1] / dir[0]);
      w.box(bf, [0.04 * tanA, -0.04, -0.035], [len - 0.04 / tanA, 0.04, 0.035], frameLook(0.08, 0));
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

  // --- the roof: three bays between the side walls, two rows down meeting over the middle, battens under each; and
  // its verges past the side walls (each a strip down the whole slope over its end rafter)
  const rp: RoofPlane = { o: [0, ltCover(0), 0], e: [1, 0, 0], f: nrm([0, sinS, -cosS]), up: nrm([0, cosS, sinS]) };
  const bOf = (z: number): number => -z / cosS;
  const rows: [number, number][] = [[bOf(LT.roofZ1), 0], [0, bOf(LT.roofZ0)]];
  const edge = LT.sideX + BOARD_T;
  const bays: [number, number][] = [[-edge, -0.98], [-0.98, 0.98], [0.98, edge]];
  const roofMaterial: FractureMaterial = st.roof === 'tin' ? 'metal' : st.roof === 'fibre' ? 'slate' : 'plank';
  const roofPiece = (a0: number, a1: number, b0: number, b1: number): number => {
    const eaveEdge = Math.abs(b0 - rows[0][0]) < 1e-6, upperEdge = Math.abs(b1 - rows[1][1]) < 1e-6;
    const idx = w.begin({
      role: 'roof', material: roofMaterial, face: 'roof', axes: roofFrame(rp), scoreAxis: 0,
      roofPitch: { axis: 'z', outwardSign: 1, angleRad: LT.slope, kind: 'skillion' },
    });
    // (corrugated sheets bear on a purlin at either end of their run: one at the eave, one under the upper edge)
    const sheets = st.roof === 'fibre' || st.roof === 'tin', last = sheets ? 0.03 : 0.07;
    const battens: number[] = sheets && eaveEdge ? [b0 + 0.03] : [];
    for (let b = b0 + 0.12; b < b1 - 0.05; b += 0.62) battens.push(b);
    // (and one under the covering's upper edge, over the rafters' tails behind the plate)
    if (upperEdge && b1 - last - battens[battens.length - 1] > 0.2) battens.push(b1 - last);
    const joints = coverRoof(w, rp, a0, a1, b0, b1, { battens, snow: st.snow, eaveEdge, upperEdge });
    w.end();
    w.rescore(idx, joints);
    LT.rafterX.forEach((x, k) => { if (x > a0 - 0.1 && x < a1 + 0.1) w.link(idx, rafters[k], 'nail'); });
    return idx;
  };
  for (const [b0, b1] of rows) for (const [a0, a1] of bays) roofPiece(a0, a1, b0, b1);
  const verges = [roofPiece(-LT.roofX, -edge, rows[0][0], rows[1][1]), roofPiece(edge, LT.roofX, rows[0][0], rows[1][1])];

  // --- the back wall: boards on girts across the back posts' outer faces (a pole barn's), in four panels
  const fBack = frame([0, 0, LT.backPostZ - LT.post / 2], [-1, 0, 0], [0, 1, 0]);
  const back = cladWall(w, {
    face: 'back', f: fBack, u0: -2.55, u1: 2.55, y0: LT.footTop, top: () => plateTop, openings: [],
    splits: [-1.25, 0, 1.25], girts: [0.55, 1.55, plateTop - 0.14], girtDepth: LT.girtD,
  }, () => undefined);
  back.pieces.forEach((pi, k) => {
    w.link(pi, plate, 'nail');
    const [a, b] = back.ranges[k];
    // the back wall's u runs along −x: a post at world x stands at u = −x
    LT.postX.forEach((x, j) => { if (-x > a - 0.1 && -x < b + 0.1) w.link(pi, backPosts[j], 'nail'); });
  });
  // --- the side walls, boarded over the back half on the side posts' faces, their tops under the roof (its verges)
  for (const sx of [-1, 1] as const) {
    const fx = sx * LT.sideX;
    const fS = sx < 0 ? frame([fx, 0, 0], [0, 0, 1], [0, 1, 0]) : frame([fx, 0, 0], [0, 0, -1], [0, 1, 0]);
    const zBack = LT.backPostZ + 0.075;
    const u0 = sx < 0 ? zBack : -0.05, u1 = sx < 0 ? 0.05 : -zBack;
    const side = cladWall(w, {
      face: sx < 0 ? 'left' : 'right', f: fS, u0, u1, y0: LT.footTop, top: (u) => rafterTop(sx < 0 ? u : -u) - 0.005,
      openings: [], splits: [],
    }, () => undefined);
    for (const pi of side.pieces) {
      w.link(pi, backPosts[sx < 0 ? 0 : 2], 'nail');
      w.link(pi, verges[sx < 0 ? 0 : 1], 'nail');
      for (const bp of back.pieces) w.link(pi, bp, 'nail');
    }
  }

  // --- the firewood stacked in both bays against the back wall, clear of the posts
  const stackZ0 = LT_STACK_Z0;
  for (const [x0, x1, hgt] of [[-2.28, -0.12, 1.28], [0.12, 2.28, 0.96]] as const) {
    const idx = w.begin({ role: 'fitting', material: 'timber', anchor: true, axes: AXES, scoreAxis: 0,
      scores: [x0 + (x1 - x0) * 0.25, (x0 + x1) / 2, x0 + (x1 - x0) * 0.75] });
    firewoodStack(w, x0, x1, stackZ0, stackZ0 + 0.7, hgt);
    w.end();
    for (const pi of back.pieces) w.link(idx, pi, 'rest');
  }
  // --- a chopping block with its axe, and a sawbuck with a log on it
  {
    const f = frame([1.25, 0, 0.95], [1, 0, 0], [0, 1, 0]);
    w.begin({ role: 'fitting', material: 'timber', anchor: true, axes: f });
    w.cylinder(f, 0.24, 0.27, 0, 0.52, 10, { tone: BARK, uv: w.plankUv(0.2, 1), seg: 2 }, false);
    w.cylinder(f, 0.24, 0.24, 0.52, 0.53, 10, { tone: LOG_END, uv: 'flat', weather: 0.4 }, true);
    // (driven into the block's top, its helve standing up out of it: kitConnectivity exempts a member near upright)
    const helve = frame(at(f, 0.05, 0.5, 0), nrm([0.16, 0.95, 0.07]), [0, 0, 1]);
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

/** A stack of split firewood: the stack's body, its face of split ends (wedges and quarters) toward +z (or −z with
 * `face` −1), round logs on top. */
function firewoodStack(w: ShedWriter, x0: number, x1: number, z0: number, z1: number, h: number, face: 1 | -1 = 1): void {
  if (face > 0) w.box(AXES, [x0 + 0.03, 0.0, z0], [x1 - 0.03, h - 0.06, z1 - 0.05], { tone: mulc(BARK, 0.9), uv: w.plankUv(0.2, 0), seg: 2 });
  else w.box(AXES, [x0 + 0.03, 0.0, z0 + 0.05], [x1 - 0.03, h - 0.06, z1], { tone: mulc(BARK, 0.9), uv: w.plankUv(0.2, 0), seg: 2 });
  const rowH = 0.155;
  let row = 0;
  for (let y = 0.03; y < h - 0.1; y += rowH, row++) {
    if (w.lite && row % 2) continue;
    let x = x0 + 0.04 + (row % 2) * 0.07;
    while (x < x1 - 0.12) {
      const wd = 0.13 + w.rng() * 0.08;
      const kind = w.rng();
      const poly: [number, number][] = kind < 0.45
        ? [[-wd / 2, -rowH * 0.42], [wd / 2, -rowH * 0.42], [0, rowH * 0.45]]
        : kind < 0.8
          ? [[-wd / 2, -rowH * 0.42], [wd / 2, -rowH * 0.42], [wd / 2, rowH * 0.1], [-wd * 0.05, rowH * 0.45], [-wd / 2, rowH * 0.2]]
          : [[-wd / 2, -rowH * 0.3], [0, -rowH * 0.45], [wd / 2, -rowH * 0.3], [wd / 2, rowH * 0.3], [0, rowH * 0.45], [-wd / 2, rowH * 0.3]];
      const f = face > 0 ? frame([x + wd / 2, y + rowH / 2, z1 - 0.06], [1, 0, 0], [0, 1, 0])
        : frame([x + wd / 2, y + rowH / 2, z0 + 0.06], [-1, 0, 0], [0, 1, 0]);
      w.prism(f, face > 0 ? poly : poly.map(([px, py]) => [-px, py] as [number, number]).reverse(), 0, 0.02 + w.rng() * 0.05,
        { tone: mulc(LOG_END, 0.85 + w.rng() * 0.3), uv: 'flat', weather: 0.5, endDark: 1 }, false);
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
    // (the numbers the shards were captured with: the solid to the old plate line, the old porch and fittings)
    add3(-FH.hx - out, 0, -FH.hz - out, FH.hx + out, 2.52, FH.hz + out);
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

// ------------------------------------------------------------------------------------------------- the stand-ins

/** Past this (m from the nearest copy) the pool draws the far stand-in (props.ts; with a few metres' hysteresis); the
 * phones' smaller screens take it nearer. */
export const SHED_FAR_M = 72;
export const SHED_FAR_M_PHONE = 46;

const OUT = BOARD_T + BATTEN_T;
/** Metres a board takes of the tile at a stand-in's scale (one plank lane a board). */
const BOARD_LANE_M = 0.23, COURSE_LANE_M = 0.18;

/**
 * A shed's far stand-in (a couple of hundred triangles against its thousands): its walls, gables, roof planes, porch,
 * door, windows and shutters as plain masses on the cladding's own outer faces, the boards one plank lane of the tile
 * each, in the style's tones and weathering. No stream draws, no anatomy. The windows are lit at night like the build's.
 */
export function buildShedFar(kind: 'fieldhut' | 'leanto', st: ShedStyle): THREE.BufferGeometry {
  const w = new ShedWriter(st, () => 0.5, 0x5f4a, 'lite');
  w.begin({ role: 'wall', material: 'plank', axes: AXES });
  const lap = st.cladding === 'lap';
  const wood = (grain: 0 | 1 | 2): Look => ({
    tone: st.wood, paint: st.paint, uv: { grain, u0: SEAM_U, v0: 0.21 }, uvPerM: LANE_U / (lap ? COURSE_LANE_M : BOARD_LANE_M),
  });
  const roof: Look = st.roof === 'boards'
    ? { tone: st.roofTone, uv: { grain: 2, u0: SEAM_U, v0: 0.37 }, uvPerM: LANE_U / BOARD_LANE_M, roof: true }
    : { tone: st.roofTone, uv: 'flat', roof: true, rust: st.roof === 'tin' };
  const snow: Look = { tone: SNOW, uv: 'flat', weather: 0 };
  const member: Look = { tone: st.frame, uv: 'flat' };
  const stone: Look = { tone: st.stone, uv: 'flat' };
  // the cladding of a box's four sides (lapped boards take their grain along each face; battened boards up it)
  const clad = (lo: V3, hi: V3, faces: 'all' | 'x' | 'z'): void => {
    const keepX = faces !== 'z', keepZ = faces !== 'x';
    const skipY = (1 << 2) | (1 << 3), skipX = keepX ? 0 : 3, skipZ = keepZ ? 0 : (1 << 4) | (1 << 5);
    if (!lap) { w.box(AXES, lo, hi, wood(1), skipY | skipX | skipZ); return; }
    if (keepZ) w.box(AXES, lo, hi, wood(0), skipY | 3);
    if (keepX) w.box(AXES, lo, hi, wood(2), skipY | (1 << 4) | (1 << 5));
  };
  const top = coverTop(st.roof);
  if (kind === 'fieldhut') {
    const cosP = Math.cos(FH.pitch), sinP = Math.sin(FH.pitch), wallTop = FH.rafterWallY - 0.02;
    for (const sx of [-1, 1]) w.box(AXES, [sx * (FH.hx - 0.08) - 0.1, 0, -FH.hz], [sx * (FH.hx - 0.08) + 0.1, FH.sillY0, FH.hz], stone);
    clad([-FH.hx - OUT, FH.boardY0, -FH.hz - OUT], [FH.hx + OUT, wallTop, FH.hz + OUT], 'all');
    for (const zs of [1, -1]) {
      const f = frame([0, 0, zs * (FH.hz + OUT / 2)], [zs, 0, 0], [0, 1, 0]);
      w.prism(f, [[-FH.hx - OUT, wallTop], [FH.hx + OUT, wallTop], [0, fhRafterTop(0) - 0.01]], -OUT / 2, OUT / 2, wood(lap ? 0 : 1));
    }
    for (const sx of [-1, 1] as const) {
      const rp: RoofPlane = { o: [0, fhRafterTop(0) + 0.03 / cosP, 0], e: [0, 0, 1], f: [-sx * cosP, sinP, 0], up: nrm([sx * sinP, cosP, 0]) };
      const eaveB = -(FH.eaveX + 0.03) / cosP;
      roofBox(w, rp, -FH.gableZ, FH.gableZ, eaveB, 0.01, -0.21, top, roof);
      if (st.snow) roofBox(w, rp, -FH.gableZ + 0.05, FH.gableZ - 0.05, eaveB + 0.06, -0.04, top, top + 0.12, snow);
      // the barge boards down both gables' rakes (a white trim reads from far off)
      for (const zs of [-1, 1]) {
        const za = zs * FH.gableZ, zb = za + zs * 0.032;
        roofBox(w, rp, Math.min(za, zb), Math.max(za, zb), eaveB - 0.04, 0, -0.21, top + 0.012, { tone: st.trim, uv: 'flat' });
      }
    }
    const front = FH.hz + OUT, door = FH.door, fw = FH.frontWindow, sw = FH.sideWindow;
    w.box(AXES, [door.u0, door.y0, front], [door.u1, door.y1, front + 0.012], { tone: st.wood, paint: st.door, uv: 'flat' });
    w.box(AXES, [door.u0 - 0.08, door.y1, front], [door.u1 + 0.08, door.y1 + 0.09, front + 0.02], { tone: st.trim, uv: 'flat' });
    w.pane(AXES, [fw.u0, fw.y0, front - 0.004], [fw.u1, fw.y1, front + 0.006], [0, 0, 1]);
    const side = frame([-FH.hx - OUT, 0, 0], [0, 0, 1], [0, 1, 0]);
    w.pane(side, [sw.u0, sw.y0, -0.004], [sw.u1, sw.y1, 0.006], [-1, 0, 0]);
    // the casings round them
    w.box(AXES, [fw.u0 - 0.075, fw.y0 - 0.05, front - 0.002], [fw.u1 + 0.075, fw.y1 + 0.095, front + 0.004], { tone: st.trim, uv: 'flat' });
    w.box(side, [sw.u0 - 0.075, sw.y0 - 0.05, -0.002], [sw.u1 + 0.075, sw.y1 + 0.095, 0.004], { tone: st.trim, uv: 'flat' });
    for (const [f, o] of [[AXES, fw], [side, sw]] as const) {
      const z0 = f === AXES ? front : 0;
      w.box(f, [o.u0 - 0.07, o.y0 - 0.05, z0], [o.u1 + 0.07, o.y0, z0 + 0.05], { tone: st.trim, uv: 'flat' });
      if (!st.shutter) continue;
      const half = (o.u1 - o.u0) / 2 + 0.03;
      for (const s of [-1, 1]) {
        const ua = s < 0 ? o.u0 - 0.085 - half : o.u1 + 0.085;
        w.box(f, [ua, o.y0 - 0.04, z0 + 0.026], [ua + half, o.y1 + 0.03, z0 + 0.048], { tone: st.wood, paint: st.shutter, uv: 'flat' });
      }
    }
    // the porch on its posts and beam, the stoop and step, the stovepipe
    const P = FH_PORCH;
    roofBox(w, P.plane, -1.38, 1.38, P.eaveB, P.backB, -(P.rd + P.bat), top, roof);
    if (st.snow) roofBox(w, P.plane, -1.33, 1.33, P.eaveB + 0.05, P.backB - 0.03, top, top + 0.035, snow);
    w.box(AXES, [-1.3, 2.32, front - 0.02], [1.3, 2.47, FH.hz + FH_FRONT_OUT], member);
    for (const sx of [-1, 1]) w.box(AXES, [sx * P.postX - 0.055, 0, P.postZ - 0.055], [sx * P.postX + 0.055, P.beamTop - 0.12, P.postZ + 0.055], member);
    w.box(AXES, [-1.34, P.beamTop - 0.12, P.postZ - 0.06], [1.34, P.beamTop, P.postZ + 0.06], member);
    w.box(AXES, [-0.6, 0, FH.hz + FH_FRONT_OUT], [0.6, P.stoopTop, 3.5], { tone: mulc(st.wood, 0.9), uv: 'flat' });
    w.box(AXES, [-0.5, 0, 3.52], [0.5, 0.15, 3.9], stone);
    w.box(AXES, [1.35, 0, 3.07], [1.85, 0.84, 3.57], { tone: mulc(st.wood, 0.75), uv: 'flat' });
    w.box(AXES, [-2.05, 0.42, 2.95], [-1.3, 0.47, 3.29], { tone: st.wood, uv: 'flat' });
    w.box(AXES, [-1.59, 0, -FH.gableZ - 0.5], [-0.23, 1.0, -FH.gableZ - 0.05], { tone: mix(BARK, LOG_END, 0.55), uv: 'flat', weather: 0.5 }, 1 << 2);
    w.box(AXES, [-1.13, fhRafterTop(1.05), -1.93], [-0.97, 4.42, -1.77], { tone: hexLin(0x3c3a37), uv: 'flat', weather: 0.5, rust: true });
  } else {
    const cosS = Math.cos(LT.slope), sinS = Math.sin(LT.slope);
    const rTop = (z: number) => ltCover(z) - 0.03, rBottom = (z: number) => rTop(z) - LT.rafterD / cosS;
    const beamTop = rBottom(LT.frontZ), plateTop = rBottom(LT.backPostZ);
    for (const z of [LT.backPostZ, LT.frontZ]) for (const x of LT.postX) {
      w.box(AXES, [x - 0.15, 0, z - 0.15], [x + 0.15, LT.footTop, z + 0.15], stone);
      w.box(AXES, [x - LT.post / 2, LT.footTop, z - LT.post / 2], [x + LT.post / 2, z > 0 ? beamTop - 0.16 : plateTop - 0.1, z + LT.post / 2], member);
    }
    w.box(AXES, [-2.9, beamTop - 0.2, LT.frontZ - 0.07], [2.9, beamTop, LT.frontZ + 0.07], member);
    const backZ = LT.backZ - LT.post / 2;
    clad([-2.55, 0.12, backZ - OUT], [2.55, plateTop, backZ], 'z');
    for (const sx of [-1, 1]) {
      const x0 = sx * (2.4 + LT.post / 2);
      const f = frame([x0 + sx * OUT / 2, 0, 0], [0, 0, 1], [0, 1, 0]);
      w.prism(f, [[backZ, 0.12], [0.05, 0.12], [0.05, rTop(0.05) - 0.005], [backZ, rTop(backZ) - 0.005]], -OUT / 2, OUT / 2, wood(lap ? 0 : 1));
    }
    const rp: RoofPlane = { o: [0, ltCover(0), 0], e: [1, 0, 0], f: nrm([0, sinS, -cosS]), up: nrm([0, cosS, sinS]) };
    roofBox(w, rp, -LT.roofX, LT.roofX, -LT.roofZ1 / cosS, -LT.roofZ0 / cosS, -0.18, top, roof);
    if (st.snow) roofBox(w, rp, -LT.roofX + 0.05, LT.roofX - 0.05, -LT.roofZ1 / cosS + 0.08, -LT.roofZ0 / cosS - 0.05, top, top + 0.12, snow);
    const stackZ0 = LT_STACK_Z0;
    for (const [x0, x1, hgt] of [[-2.28, -0.12, 1.28], [0.12, 2.28, 0.96]] as const) {
      w.box(AXES, [x0 + 0.03, 0, stackZ0], [x1 - 0.03, hgt, stackZ0 + 0.68], { tone: mix(BARK, LOG_END, 0.55), uv: 'flat', weather: 0.5 }, 1 << 2);
    }
    w.box(AXES, [1.02, 0, 0.72], [1.48, 0.53, 1.18], { tone: BARK, uv: 'flat', weather: 0.5 }, 1 << 2);
  }
  return w.plainGeometry();
}

/**
 * A shed's shadow caster (meta.shadowBuild: the cascades draw it in place of the build, on the pool's own matrices): the
 * stand-in's masses held a few centimetres INSIDE every surface the build shows (inside the boards, under the covering,
 * within the posts), so a sunlit face of the build never stands behind its own caster, while the walls, the eaves'
 * overhang, the porch and the stacks still throw their shadows. Style-free.
 */
export function buildShedShadow(kind: 'fieldhut' | 'leanto'): THREE.BufferGeometry {
  const w = new ShedWriter(SHED_DEFAULT_STYLE, () => 0.5, 0x5f4b, 'lite');
  w.begin({ role: 'wall', material: 'plank', axes: AXES });
  const look: Look = { tone: [0.5, 0.5, 0.5], uv: 'flat', weather: 0 };
  if (kind === 'fieldhut') {
    const cosP = Math.cos(FH.pitch), sinP = Math.sin(FH.pitch);
    const x = FH.hx - 0.03, z = FH.hz - 0.03, wallTop = FH_PLATE_Y1;
    w.box(AXES, [-x, 0.02, -z], [x, wallTop, z], look);
    for (const zs of [1, -1]) {
      const f = frame([0, 0, zs * (z - 0.01)], [zs, 0, 0], [0, 1, 0]);
      w.prism(f, [[-x, wallTop - 0.01], [x, wallTop - 0.01], [0, fhRafterTop(0) - 0.06]], -0.01, 0.01, look);
    }
    for (const sx of [-1, 1] as const) {
      const rp: RoofPlane = { o: [0, fhRafterTop(0) + 0.03 / cosP, 0], e: [0, 0, 1], f: [-sx * cosP, sinP, 0], up: nrm([sx * sinP, cosP, 0]) };
      roofBox(w, rp, -FH.gableZ + 0.03, FH.gableZ - 0.03, -(FH.eaveX + 0.01) / cosP, 0.0, -0.025, -0.006, look);
    }
    const P = FH_PORCH;
    roofBox(w, P.plane, -1.35, 1.35, P.eaveB + 0.02, 0, -0.025, -0.006, look);
    for (const sx of [-1, 1]) w.box(AXES, [sx * P.postX - 0.035, 0, P.postZ - 0.035], [sx * P.postX + 0.035, P.beamTop - 0.13, P.postZ + 0.035], look);
    w.box(AXES, [-1.32, P.beamTop - 0.11, P.postZ - 0.04], [1.32, P.beamTop - 0.01, P.postZ + 0.04], look);
    w.box(AXES, [-0.56, 0, FH.hz + FH_FRONT_OUT + 0.03], [0.56, P.stoopTop - 0.03, 3.46], look);
    w.box(AXES, [1.42, 0, 3.14], [1.78, 0.8, 3.5], look);
    w.box(AXES, [-1.55, 0.02, -FH.gableZ - 0.46], [-0.27, 0.92, -FH.gableZ - 0.12], look);
    w.box(AXES, [-1.1, 3.4, -1.9], [-1.0, 4.38, -1.8], look);
  } else {
    const cosS = Math.cos(LT.slope), sinS = Math.sin(LT.slope);
    const rTop = (z: number) => ltCover(z) - 0.03, rBottom = (z: number) => rTop(z) - LT.rafterD / cosS;
    const beamTop = rBottom(LT.frontZ), plateTop = rBottom(LT.backPostZ);
    for (const z of [LT.backPostZ, LT.frontZ]) for (const x of LT.postX) {
      w.box(AXES, [x - 0.05, 0.02, z - 0.05], [x + 0.05, z > 0 ? beamTop - 0.03 : plateTop - 0.03, z + 0.05], look);
    }
    w.box(AXES, [-2.86, beamTop - 0.18, LT.frontZ - 0.05], [2.86, beamTop - 0.02, LT.frontZ + 0.05], look);
    // (the walls show both faces through the open front: their casters lie inside the boards)
    const boardZ = LT.backPostZ - LT.post / 2 - LT.girtD - BOARD_T / 2;
    w.box(AXES, [-2.5, 0.14, boardZ - 0.007], [2.5, plateTop - 0.01, boardZ + 0.007], look);
    for (const sx of [-1, 1]) {
      const x0 = sx * (LT.sideX + BOARD_T / 2), zb = LT.backPostZ - LT.post / 2;
      const f = frame([x0, 0, 0], [0, 0, 1], [0, 1, 0]);
      w.prism(f, [[zb, 0.14], [0.0, 0.14], [0.0, rTop(0) - 0.04], [zb, rTop(zb) - 0.04]], -0.007, 0.007, look);
    }
    const rp: RoofPlane = { o: [0, ltCover(0), 0], e: [1, 0, 0], f: nrm([0, sinS, -cosS]), up: nrm([0, cosS, sinS]) };
    roofBox(w, rp, -LT.roofX + 0.03, LT.roofX - 0.03, -(LT.roofZ1 - 0.03) / cosS, -(LT.roofZ0 + 0.03) / cosS, -0.025, -0.006, look);
    const stackZ0 = LT_STACK_Z0;
    for (const [x0, x1, hgt] of [[-2.28, -0.12, 1.28], [0.12, 2.28, 0.96]] as const) {
      w.box(AXES, [x0 + 0.06, 0.02, stackZ0 + 0.03], [x1 - 0.06, hgt - 0.12, stackZ0 + 0.6], look);
    }
  }
  return w.plainGeometry();
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
  const standing = (i: number): boolean => pieces[i].role === 'post';
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
  // (the destructible-kits lane, 2026-10-11; kitConnectivity.selftest: every member of a wreck reaches the ground
  // through touching members) the heap's quarter-metre field can leave a piece resting on nothing: down until it touches
  seatFloatingParts(g);
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
