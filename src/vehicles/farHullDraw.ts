// One draw per far hull (far-hull-273, the owner's "distant tanks - yes"). Past FAR_LOD_ENTER_M a battle build draws its
// far LOD (farLod.ts): a stand-in per owner, material and coplanar depth, the far running gear, and every draw no stand-in
// replaces (the hull's and turret's own plates, which damage edits; the track bands, which the gear's runtime writes; the
// bores, the fittings in two materials). The world-pools census (docs/PERFORMANCE.md "World pools") read 14 far allies at
// 439 colour-pass draws over 172 materials, every material one vehicle's own; couch split screen redraws them per pane.
// This draws everything the far LOD shows that one program can express as ONE draw:
// - one material per hull: a copy of one of the vehicle's own materials (the carrier: its armour paint) under its whole
//   compile chain (the cascade registration, the readability floors, the field dust, the disarmed burn mask with the
//   scoped armour paint), so every term a part draws with is the GLSL it drew with; what differed between the parts'
//   materials rides in a per-piece record: whether it takes the carrier's camouflage, roughness and normal maps, its
//   roughness, metalness, sky-light share, clearcoat, specular, armour-paint mode, the four vehicle shader switches
//   (floorless, wheel-paint readability, no field dust, gear cavity: branches instead of defines), and the weapon finish's
//   settled dust and grime (its edge wear resolves to nothing past FAR_LOD_RETURN_M: weaponFinish.ts `resolve`);
// - a part's own texture set (weapon steel, rubber, track links, a kit's paint) as its mean: its colour map's linear mean
//   in the paint, its roughness and metalness maps' in those terms, no normal map. At these ranges a hull is tens of pixels across
//   and those maps sample their last mips; the armour paint's camouflage, which reads at range, keeps the map;
// - the articulation: each vertex names its piece, each piece its owner (the hull, the turret, the gun's pitch frame, a
//   station, a part with its own transform), whose matrix relative to the vehicle's root is a uniform, refreshed before
//   the draw; the program's model, model-view and normal matrices are that owner's, so every hook that reads them (the
//   dust's own-frame breakup, the armour paint's frames) reads what it read on the part;
// - the coplanar order: each piece carries its far depth offset (coplanarDepth.ts), applied in clip space as the polygon
//   offset was (units of the depth buffer's resolution, slope factor 0);
// - the live parts (the plates damage edits, the bands, anything not a stand-in): clustered as the stand-ins are, each
//   rides its parent (a transform of its own baked in), follows its draw's visibility (a hidden piece collapses outside
//   the clip volume), its buffers and its transform (an edit or a swapped geometry clusters it again and rebuilds the
//   draw); a double-sided part draws its triangles both ways; a part's own emission rides its record.
// - the lamps' lenses (engine/nightEmissionMaterial.ts): a slot per lens material whose emission the lamps drive live,
//   the lens mask per vertex, the same GLSL (nightEmissionFragment).
// A part another program draws (a profile's own patch, transparency or alpha, another kind of draw) keeps its own draw, counted by reason (FarHullDraw.fallbacks). The far LOD never shows on a wreck, so the burn, the
// dents and the wreck's swaps stay with the detail. Shadows are the articulated shadow batch's already (one caster draw a
// hull a cascade).
import * as THREE from 'three';
import { COPLANAR_TIE_NEAR_M, COPLANAR_TIE_UNITS } from './coplanarDepth.ts';
import { FAR_HULL_CELL_M, clusterGeometry, thinPartCell } from './farLod.ts';
import { armorPaintMode, farHullVehicleMaterial, vehicleEnvScaleOf, VEHICLE_SUIT_OCCLUSION_ATTRIBUTE,
  ARMOR_PAINT_ZONE_ATTRIBUTE } from './materials.ts';
import { programVariantOrigin } from '../engine/programVariants.ts';
import { NIGHT_EMISSION_ATTRIBUTE, nightEmissionBaseOf, nightEmissionFragment, nightEmissionSharedUniforms } from '../engine/nightEmissionMaterial.ts';

/** The owners one hull's draw can carry (a uniform array of matrices: 96 vec4, inside WebGL2's 256). */
export const FAR_HULL_MAX_PARTS = 24;
/** The program key suffix of a far hull's material. */
const FAR_HULL_KEY = '|far-hull-v1';
/** The vehicle switches a carrier's program would have compiled as defines; the far program branches on them. */
const SWITCHES = ['COT_VEHICLE_FLOORLESS', 'COT_WHEEL_PAINT_READABILITY', 'COT_NO_FIELD_DUST', 'COT_GEAR_CAVITY'] as const;
/**
 * The vehicle switches that only change how a map is sampled, which the far draw drops: it reads every map but its
 * carrier's as the map's linear mean, and a carrier's tile is below a pixel past the far LOD's 165 m. (274) The rubber's
 * broken-up tile (materials.ts RUBBER_TILES_GLSL) is one.
 */
const SAMPLING_SWITCHES = ['COT_RUBBER_TILES'] as const;
/** The defines a vehicle material may carry beyond its registration's (three's own and the switches). */
const LOOSE_DEFINES = new Set<string>(['STANDARD', 'PHYSICAL', ...SWITCHES, ...SAMPLING_SWITCHES]);
const BURN_KEY_RE = /\|burn-r\d+$/;
const WEAR_KEY = '|weapon-wear-v3';
const NIGHT_KEY = '|night-emission-mask-v2:';
/** The night lens materials one draw can carry (emission slots: uniforms the lamps drive live). */
const NIGHT_SLOTS = 4;
/** The vehicle registrations whose programs are one GLSL (materials.ts: createTankMaterials' and the bare hook's). */
const VEHICLE_FAMILY_RE = /^veh-ambient-floor-v[25]$/;
/** Texels per piece record. */
const RECORD_TEXELS = 6;

/** One draw (or one group of a multi-material draw) the far LOD shows. */
export interface FarHullPiece {
  object: THREE.Mesh;
  /** The material this piece draws with (a group's slot of a multi-material draw). */
  material: THREE.Material;
  /** The geometry in the owner's frame (a stand-in's own, a live draw's own, a copy of a group's range). */
  geometry: THREE.BufferGeometry;
  /** The owner whose frame the geometry is in. */
  owner: THREE.Object3D;
  depth: number;
  ties: number;
  /** A range of the geometry's index (or vertices): a group of a multi-material draw. */
  range?: { start: number; count: number };
  /** A live draw (not a stand-in): followed for visibility and buffer edits, parked while the draw shows. */
  live?: boolean;
  /** Its own transform is baked into its owner's (its parent's) frame: followed like an edit. */
  baked?: boolean;
}

export interface FarHullDraw {
  mesh: THREE.Mesh;
  material: THREE.Material;
  /** The pieces the draw carries. */
  pieces: FarHullPiece[];
  /** The draws the far LOD shows that it does not carry, by reason. */
  fallbacks: Record<string, number>;
  /** The pieces it does not carry (the caller keeps their draws). */
  left: FarHullPiece[];
  /** Each left piece as `name|material|reason`. */
  leftNames: string[];
  /** Its own textures (the piece records). */
  textures: THREE.Texture[];
  /** Take the live pieces' edits in (cluster the edited piece again, rebuild the draw): once a frame, outside the render. */
  update(): void;
  /** How many times update() rebuilt the draw. */
  readonly rebuilds: number;
  /** Park the live pieces' draws (the draw stands in for them) or give them back. */
  parkLive(on: boolean): void;
  /** (debug, the in-page bisection) Draw the pieces `test` picks their own way again, the rest in the one draw; null
   * puts every piece back. */
  exclude(test: ((piece: FarHullPiece) => boolean) | null): number;
  dispose(): void;
}

type SurfaceMaterial = THREE.MeshStandardMaterial & Partial<THREE.MeshPhysicalMaterial> & {
  defines?: Record<string, unknown>; vertexColors?: boolean; alphaHash?: boolean;
};
interface WearParams { dustColor?: number[]; dust?: number; grime?: number }

/** A material's program: its registration family, whether the weapon finish wraps it and whether it is a night lens
 * (engine/nightEmissionMaterial.ts, with no per-instance activity), the burn mask stripped. */
function programOf(material: THREE.Material): { key: string; wear: boolean; night: boolean } {
  let key = '';
  try { key = material.customProgramCacheKey(); } catch { key = '?'; }
  key = key.replace(BURN_KEY_RE, '');
  const wear = key.endsWith(WEAR_KEY) && !!material.userData.weaponWear;
  if (wear) key = key.slice(0, -WEAR_KEY.length);
  const night = key.endsWith(NIGHT_KEY) && material.userData.nightEmissionMask === true && !material.userData.nightEmissionActivity;
  if (night) key = key.slice(0, -NIGHT_KEY.length);
  return { key, wear, night };
}

// ---- texture means -------------------------------------------------------------------------------------------------
const MEANS = new WeakMap<THREE.Texture, { version: number; mean: number[] | null }>();
const MEAN_SIZE = 32;
let meanCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** A texture's mean texel (linear where it is sRGB, as the shader samples it), or null when its pixels cannot be read. */
export function textureMeanLinear(texture: THREE.Texture): number[] | null {
  const cached = MEANS.get(texture);
  if (cached && cached.version === texture.version) return cached.mean;
  let mean: number[] | null = null;
  try { mean = readMean(texture); } catch { mean = null; }
  MEANS.set(texture, { version: texture.version, mean });
  return mean;
}

function readMean(texture: THREE.Texture): number[] | null {
  if ((texture as THREE.CompressedTexture).isCompressedTexture) return null;
  const image = texture.image as { data?: ArrayLike<number>; width?: number; height?: number } | CanvasImageSource | null;
  const srgb = texture.colorSpace === THREE.SRGBColorSpace;
  const sums = [0, 0, 0, 0];
  let n = 0;
  const add = (r: number, g: number, b: number, a: number): void => {
    sums[0] += srgb ? srgbToLinear(r) : r; sums[1] += srgb ? srgbToLinear(g) : g; sums[2] += srgb ? srgbToLinear(b) : b; sums[3] += a; n++;
  };
  if (image && 'data' in image && image.data && image.width && image.height) {
    const data = image.data, pixels = image.width * image.height;
    const channels = Math.round(data.length / pixels);
    const scale = data instanceof Uint8Array || data instanceof Uint8ClampedArray ? 1 / 255 : 1;
    const step = Math.max(1, Math.floor(pixels / 4096));
    for (let p = 0; p < pixels; p += step) {
      const o = p * channels;
      const r = data[o] * scale, g = channels > 1 ? data[o + 1] * scale : r, b = channels > 2 ? data[o + 2] * scale : r;
      add(r, g, b, channels > 3 ? data[o + 3] * scale : 1);
    }
  } else if (image) {
    meanCanvas ??= typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(MEAN_SIZE, MEAN_SIZE)
      : Object.assign(document.createElement('canvas'), { width: MEAN_SIZE, height: MEAN_SIZE });
    const ctx = meanCanvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, MEAN_SIZE, MEAN_SIZE);
    ctx.drawImage(image as CanvasImageSource, 0, 0, MEAN_SIZE, MEAN_SIZE);
    const data = ctx.getImageData(0, 0, MEAN_SIZE, MEAN_SIZE).data;
    for (let o = 0; o < data.length; o += 4) add(data[o] / 255, data[o + 1] / 255, data[o + 2] / 255, data[o + 3] / 255);
  }
  return n ? sums.map((s) => s / n) : null;
}

// ---- what one program can carry -----------------------------------------------------------------------------------
/**
 * Why `material` cannot draw in `carrier`'s program, or null when it can: the same registration family (the vehicle
 * materials' two keys draw one GLSL) or the carrier's own program, with at most the weapon finish on top; a standard
 * or physical material; nothing a piece record cannot carry (transparency, alpha, emission, extra lobes, maps whose
 * pixels cannot be read for their mean).
 */
export function farHullMismatch(material: THREE.Material, carrier: THREE.Material): string | null {
  const m = programVariantOrigin(material) as SurfaceMaterial, c = programVariantOrigin(carrier) as SurfaceMaterial;
  if (!m.isMeshStandardMaterial) return `type:${m.type}`;
  const pm = programOf(m), pc = programOf(c);
  if (pm.key !== pc.key && !(VEHICLE_FAMILY_RE.test(pm.key) && VEHICLE_FAMILY_RE.test(pc.key))) return `program:${pm.key}`;
  if (m.transparent || m.alphaTest > 0 || m.opacity < 1 || m.alphaMap || m.alphaHash) return 'alpha';
  // a double-sided part over a front-sided carrier draws its triangles both ways (mergedGeometry)
  if (m.side !== c.side && !(m.side === THREE.DoubleSide && c.side === THREE.FrontSide)) return 'side';
  if (m.emissiveMap || m.aoMap || m.lightMap || m.displacementMap || c.metalnessMap || c.bumpMap) return 'maps';
  if (m.flatShading !== c.flatShading || m.fog !== c.fog || m.toneMapped !== c.toneMapped || m.wireframe) return 'raster';
  if ((m.sheen ?? 0) > 0 || (m.iridescence ?? 0) > 0 || (m.transmission ?? 0) > 0 || (m.anisotropy ?? 0) > 0
    || (m.dispersion ?? 0) > 0) return 'lobes';
  if (m.clearcoatMap || m.clearcoatRoughnessMap || m.clearcoatNormalMap || m.specularIntensityMap || m.specularColorMap) return 'maps';
  if ((m.clearcoat ?? 0) > 0 && Math.abs((m.clearcoatRoughness ?? 0) - (c.clearcoatRoughness ?? 0)) > 0.02) return 'clearcoatRoughness';
  if (m.specularColor && (m.specularColor.r !== 1 || m.specularColor.g !== 1 || m.specularColor.b !== 1)) return 'specularColor';
  if (m.ior !== undefined && Math.abs(m.ior - 1.5) > 1e-6) return 'ior';
  if (m.normalMap && m.normalMap === c.normalMap && m.normalScale && Math.abs(m.normalScale.x - m.normalScale.y) > 1e-6) return 'normalScale';
  if (m.polygonOffset && m.polygonOffsetFactor !== 0) return 'slopeOffset';
  if (m.depthWrite === false || m.depthTest === false || m.colorWrite === false || m.blending !== THREE.NormalBlending) return 'raster';
  if (m.map && m.map !== c.map && !textureMeanLinear(m.map)) return 'map-unreadable';
  if (m.roughnessMap && m.roughnessMap !== c.roughnessMap && !textureMeanLinear(m.roughnessMap)) return 'map-unreadable';
  if (m.metalnessMap && !textureMeanLinear(m.metalnessMap)) return 'map-unreadable';
  for (const key of Object.keys(m.defines ?? {})) if (!LOOSE_DEFINES.has(key) && !(key in (c.defines ?? {}))) return `define:${key}`;
  for (const key of Object.keys(c.defines ?? {})) if (!LOOSE_DEFINES.has(key) && !(key in (m.defines ?? {}))) return `define:-${key}`;
  return null;
}

/** The carrier: the physical (or standard) vehicle-family material the most triangles draw with, without the finish. */
export function pickFarHullCarrier(pieces: readonly FarHullPiece[]): THREE.Material | null {
  const weight = new Map<THREE.Material, number>();
  for (const piece of pieces) {
    const material = programVariantOrigin(piece.material) as SurfaceMaterial;
    if (!material.isMeshStandardMaterial || material.transparent || material.alphaTest > 0) continue;
    const program = programOf(material);
    // (274) a night lens may carry: its copy skips the mask and takes an emission slot like any lens
    if (program.wear || !VEHICLE_FAMILY_RE.test(program.key)) continue;
    const triangles = trianglesOf(piece);
    // a physical carrier expresses a standard part (clearcoat 0, specular 1); a standard one cannot express a physical part
    weight.set(material, (weight.get(material) ?? 0) + triangles * (material.isMeshPhysicalMaterial ? 4 : 1) * (material.map ? 2 : 1));
  }
  let best: THREE.Material | null = null, bestWeight = -1;
  for (const [material, w] of weight) if (w > bestWeight) { best = material; bestWeight = w; }
  return best;
}

function trianglesOf(piece: FarHullPiece): number {
  if (piece.range) return piece.range.count / 3;
  const g = piece.geometry;
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

function switchBits(material: SurfaceMaterial): number {
  let bits = 0;
  SWITCHES.forEach((name, bit) => { if (material.defines && name in material.defines) bits |= 1 << bit; });
  return bits;
}

// ---- the pieces' data ---------------------------------------------------------------------------------------------
interface PieceSurface {
  /** The paint factor folded into the colour attribute: the material colour times its own map's mean (if not the carrier's). */
  tint: [number, number, number];
  record: number[];
}

/** A piece's surface: its tint and its record row (RECORD_TEXELS texels): A (map weight, roughness, metalness, sky-light
 * share), B (roughness-map weight, normal scale, clearcoat, switch bits), C (owner, far depth units, tie units,
 * armour-paint mode), D (specular intensity, shown, weapon dust, weapon grime), E (dust colour, the map's mean green), F
 * (the night lens's emission slot + 1, 0 for none; the part's own emission, a lens's day radiance). */
function pieceSurface(piece: FarHullPiece, part: number, carrier: SurfaceMaterial, nightSlot: number): PieceSurface {
  const m = programVariantOrigin(piece.material) as SurfaceMaterial;
  const physical = m.isMeshPhysicalMaterial === true;
  const ownMap = m.map && m.map !== carrier.map ? textureMeanLinear(m.map) : null;
  const ownRough = m.roughnessMap && m.roughnessMap !== carrier.roughnessMap ? textureMeanLinear(m.roughnessMap) : null;
  // a metalness map (the weapon steel's) as its mean blue, as three's chunk reads it; the carrier takes none
  const ownMetal = m.metalnessMap ? textureMeanLinear(m.metalnessMap) : null;
  const program = programOf(m);
  const wear = (program.wear ? m.userData.weaponWear : null) as WearParams | null;
  const dust = wear?.dustColor ?? [0, 0, 0];
  const mapMean = m.map ? textureMeanLinear(m.map) : null;
  const env = program.key.endsWith('v2') ? 1 : vehicleEnvScaleOf(m);
  return {
    tint: [m.color.r * (ownMap ? ownMap[0] : 1), m.color.g * (ownMap ? ownMap[1] : 1), m.color.b * (ownMap ? ownMap[2] : 1)],
    record: [
      m.map && !ownMap ? 1 : 0, m.roughness * (ownRough ? ownRough[1] : 1), m.metalness * (ownMetal ? ownMetal[2] : 1), env,
      m.roughnessMap && !ownRough ? 1 : 0, m.normalMap && m.normalMap === carrier.normalMap ? m.normalScale.x : 0,
      physical ? m.clearcoat ?? 0 : 0, switchBits(m),
      part, piece.depth, piece.ties, armorPaintMode(m),
      physical ? m.specularIntensity ?? 1 : 1, 1, wear?.dust ?? 0, wear?.grime ?? 0,
      dust[0] ?? 0, dust[1] ?? 0, dust[2] ?? 0, mapMean ? mapMean[1] : 0.9,
      nightSlot + 1, m.emissive.r * m.emissiveIntensity, m.emissive.g * m.emissiveIntensity, m.emissive.b * m.emissiveIntensity,
    ],
  };
}

/** A piece's drawn range as a geometry of its own (its group's triangles, the vertices they use). */
function rangeGeometry(piece: FarHullPiece): THREE.BufferGeometry {
  const g = piece.geometry;
  const index = g.index;
  const total = index ? index.count : g.getAttribute('position').count;
  const start = piece.range ? piece.range.start : 0;
  const end = Math.min(total, piece.range ? piece.range.start + piece.range.count : total);
  const remap = new Map<number, number>(), list: number[] = [], triangles: number[] = [];
  for (let i = start; i < end; i++) {
    const v = index ? index.getX(i) : i;
    let local = remap.get(v);
    if (local === undefined) { local = list.length; remap.set(v, local); list.push(v); }
    triangles.push(local);
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(g.attributes)) {
    const plain = attribute as THREE.BufferAttribute;
    const size = plain.itemSize;
    const Kind = plain.array.constructor as new (length: number) => THREE.TypedArray;
    const array = new Kind(list.length * size);
    for (let o = 0; o < list.length; o++) for (let k = 0; k < size; k++) array[o * size + k] = plain.array[list[o] * size + k];
    out.setAttribute(name, new THREE.BufferAttribute(array, size, plain.normalized));
  }
  out.setIndex(triangles);
  return out;
}

/**
 * What a piece contributes: a stand-in or the gear's range as it is (already reduced); a live draw clustered as the far
 * hull's stand-ins are (farLod.ts clusterGeometry: a 5 cm cell, a long thin part at its own), so the one draw holds no
 * more than the stand-ins would. Null when nothing is left.
 */
function pieceData(piece: FarHullPiece): THREE.BufferGeometry | null {
  if (!piece.live) return piece.geometry;
  // a shared source (the battle builds' pooled rigid stock, a copied visual's) clusters once while it stands unedited
  const cell = thinPartCell(piece.object) ?? FAR_HULL_CELL_M;
  const local = piece.baked ? piece.object.matrix.elements.map((v) => v.toFixed(6)).join(',') : '';
  const key = `${piece.range ? `${piece.range.start}:${piece.range.count}` : '*'}|${cell}|${versionsOf(piece.geometry).join(',')}|${local}`;
  let entries = CLUSTERED.get(piece.geometry);
  const hit = entries?.get(key);
  if (hit !== undefined) { hit.users++; return hit.data; }
  let range = piece.range || piece.geometry.index === null ? rangeGeometry(piece) : piece.geometry;
  if (piece.baked) {
    // its own transform into its owner's frame (a copy: the source stays the draw's own)
    if (range === piece.geometry) range = piece.geometry.clone();
    range.applyMatrix4(piece.object.matrix);
  }
  const clustered = clusterGeometry(range, cell);
  if (range !== piece.geometry) range.dispose();
  if (!entries) CLUSTERED.set(piece.geometry, entries = new Map());
  entries.set(key, { data: clustered, users: 1 });
  return clustered;
}

/** Clustered live sources by geometry and range, cell and versions, with their users (released with the draws). */
const CLUSTERED = new WeakMap<THREE.BufferGeometry, Map<string, { data: THREE.BufferGeometry | null; users: number }>>();
function releaseData(source: THREE.BufferGeometry, data: THREE.BufferGeometry | null): void {
  const entries = CLUSTERED.get(source);
  if (!entries) return;
  for (const [key, entry] of entries) {
    if (entry.data !== data) continue;
    if (--entry.users > 0) return;
    entries.delete(key);
    entry.data?.dispose();
    return;
  }
}

/** Where a piece sits in the merged buffers, what it contributes and what it was built from (the live change test). */
interface PieceSlot {
  piece: FarHullPiece;
  first: number;
  data: THREE.BufferGeometry | null;
  surface: PieceSurface;
  geometry: THREE.BufferGeometry;
  versions: number[];
  /** A baked piece's local matrix as it was clustered. */
  local: number[] | null;
  /** Its frame is mirrored (a negative determinant): three would flip the front face for its draw; the one draw winds
   * its triangles the other way instead. */
  flip: boolean;
}

const VERSIONED = ['position', 'normal', 'color', 'uv'];
function versionsOf(geometry: THREE.BufferGeometry): number[] {
  return [...VERSIONED.map((name) => (geometry.getAttribute(name) as THREE.BufferAttribute | undefined)?.version ?? -1),
    geometry.index?.version ?? -1];
}

/** The merged layout: compact types (a normal a signed byte a component; the paint a normalized short at half scale; the
 * suit's shade a normalized byte; the armour panel a short; the piece row an unsigned short). */
/** The merged geometry of `slots` (their `first` set here). */
function mergedGeometry(slots: PieceSlot[]): THREE.BufferGeometry {
  let vertexCount = 0, indexCount = 0;
  const doubled = (slot: PieceSlot): boolean => (programVariantOrigin(slot.piece.material) as SurfaceMaterial).side === THREE.DoubleSide;
  for (const slot of slots) {
    slot.first = vertexCount;
    if (!slot.data) continue;
    const times = doubled(slot) ? 2 : 1;
    vertexCount += slot.data.getAttribute('position').count * times;
    indexCount += (slot.data.index ? slot.data.index.count : slot.data.getAttribute('position').count) * times;
  }
  const position = new Float32Array(vertexCount * 3), normal = new Int8Array(vertexCount * 3), uv = new Float32Array(vertexCount * 2);
  // the paint at half scale in a normalized short (the vertex colours' baked dust and light run to 1.4: a byte clamped them)
  const color = new Uint16Array(vertexCount * 3), suitShade = new Uint8Array(vertexCount), panels = new Int16Array(vertexCount);
  const pieceRow = new Uint16Array(vertexCount), nightMask = new Uint8Array(vertexCount);
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  const byte = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 255);
  const snorm = (v: number): number => Math.round(Math.max(-1, Math.min(1, v)) * 127);
  const half = (v: number): number => Math.round(Math.max(0, Math.min(2, v)) / 2 * 65535);
  let at = 0;
  slots.forEach((slot, row) => {
    const g = slot.data;
    if (!g) return;
    const m = programVariantOrigin(slot.piece.material) as SurfaceMaterial;
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), t = g.getAttribute('uv');
    const c = m.vertexColors ? g.getAttribute('color') : null;
    const suit = g.getAttribute(VEHICLE_SUIT_OCCLUSION_ATTRIBUTE), panel = g.getAttribute(ARMOR_PAINT_ZONE_ATTRIBUTE);
    const lens = slot.surface.record[20] > 0 ? g.getAttribute(NIGHT_EMISSION_ATTRIBUTE) : null;
    const [tr, tg, tb] = slot.surface.tint;
    const count = p.count;
    // a double-sided part: its triangles again, wound the other way, with its normals turned (the back faces three's
    // DOUBLE_SIDED shading lit with the normal flipped)
    const copies = doubled(slot) ? 2 : 1;
    for (let copy = 0; copy < copies; copy++) {
      const first = slot.first + copy * count, sign = copy ? -1 : 1;
      for (let v = 0; v < count; v++) {
        const o = first + v;
        position[o * 3] = p.getX(v); position[o * 3 + 1] = p.getY(v); position[o * 3 + 2] = p.getZ(v);
        if (n) { normal[o * 3] = snorm(sign * n.getX(v)); normal[o * 3 + 1] = snorm(sign * n.getY(v)); normal[o * 3 + 2] = snorm(sign * n.getZ(v)); }
        if (t) { uv[o * 2] = t.getX(v); uv[o * 2 + 1] = t.getY(v); }
        color[o * 3] = half(tr * (c ? c.getX(v) : 1)); color[o * 3 + 1] = half(tg * (c ? c.getY(v) : 1)); color[o * 3 + 2] = half(tb * (c ? c.getZ(v) : 1));
        if (suit) suitShade[o] = byte(suit.getX(v));
        if (panel) panels[o] = panel.getX(v);
        if (lens) nightMask[o] = lens.getX(v);
        pieceRow[o] = row;
      }
      const corners = g.index ? g.index.count : count;
      const reverse = (copy === 1) !== slot.flip;
      for (let i = 0; i < corners; i += 3) {
        const a = g.index ? g.index.getX(i) : i, b = g.index ? g.index.getX(i + 1) : i + 1, d = g.index ? g.index.getX(i + 2) : i + 2;
        index[at++] = first + a;
        index[at++] = first + (reverse ? d : b);
        index[at++] = first + (reverse ? b : d);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3, true));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3, true));
  geometry.setAttribute(VEHICLE_SUIT_OCCLUSION_ATTRIBUTE, new THREE.BufferAttribute(suitShade, 1, true));
  geometry.setAttribute(ARMOR_PAINT_ZONE_ATTRIBUTE, new THREE.BufferAttribute(panels, 1));
  geometry.setAttribute('farPiece', new THREE.BufferAttribute(pieceRow, 1));
  geometry.setAttribute('farNightMask', new THREE.BufferAttribute(nightMask, 1));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return geometry;
}

// ---- the program ---------------------------------------------------------------------------------------------------
/** Replace `pattern` in `text` exactly `times` times, or throw (the patch then fails and the hull keeps its draws). */
function replaceExact(text: string, pattern: RegExp, replacement: string, what: string, times = 1): string {
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  const found = text.match(global)?.length ?? 0;
  if (found !== times) throw new Error(`far hull patch: ${what} matched ${found} times, expected ${times}`);
  return text.replace(global, replacement);
}

/** Every `#include <name>` of three's chunks in `text`, expanded (recursively), as three's resolveIncludes would. */
function expandIncludes(text: string, depth = 0): string {
  if (depth > 8) throw new Error('far hull patch: includes nest too deep');
  return text.replace(/#include <(\w+)>/g, (whole, name: string) => {
    const chunk = (THREE.ShaderChunk as Record<string, string>)[name];
    return chunk === undefined ? whole : expandIncludes(chunk, depth + 1);
  });
}

/** Expand `#include <name>` now, so its text can be patched (three would expand it after the hooks). */
function expandChunk(text: string, name: string, edit: (chunk: string) => string): string {
  const chunk = (THREE.ShaderChunk as Record<string, string>)[name];
  if (!chunk) throw new Error(`far hull patch: no chunk ${name}`);
  return replaceExact(text, new RegExp(`#include <${name}>`), edit(chunk), `#include <${name}>`);
}

interface FarHullUniforms {
  uFarParts: { value: THREE.Matrix4[] };
  uFarNightEmissive: { value: THREE.Color[] };
  uFarNightBase: { value: THREE.Color[] };
  uFarRecords: { value: THREE.DataTexture };
  uFarTie: { value: number };
  uFarUnit: { value: number };
}

const RECORD_VARYINGS = 'flat varying vec4 vFarSurfA;\nflat varying vec4 vFarSurfB;\nflat varying vec4 vFarSurfC;\nflat varying vec4 vFarSurfD;\nflat varying vec4 vFarSurfE;\nflat varying vec4 vFarSurfF;\nvarying float vFarNightMask;\n';

/**
 * The far hull's patch, after the carrier's whole chain: the owners' frames per vertex, the clip-space depth offset,
 * the piece records, the switches as branches and the weapon finish's dust and grime.
 */
function farHullPatch(uniforms: FarHullUniforms) {
  return (shader: { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string }): void => {
    Object.assign(shader.uniforms, uniforms, nightEmissionSharedUniforms());
    let vs = shader.vertexShader, fs = shader.fragmentShader;
    // vertex: the paint's half scale and the coplanar order at their chunks' anchors, then every chunk of the main body
    // expanded (three would expand them after the hooks, too late for the matrices below), then the owner's frame for
    // every model matrix of three's chunks and of the hooks
    vs = replaceExact(vs, /#include <color_vertex>/, '#include <color_vertex>\n\tvColor *= 2.0;', 'color_vertex');
    // the coplanar order (coplanarDepthUnits as a polygon offset of slope factor 0); a hidden piece leaves the clip volume
    vs = replaceExact(vs, /#include <project_vertex>/, '#include <project_vertex>\n'
      + '\tgl_Position.z -= ( vFarSurfC.y + vFarSurfC.z * uFarTie ) * uFarUnit * gl_Position.w;\n'
      + '\tif ( vFarSurfD.y < 0.5 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );', 'project_vertex');
    const main = vs.search(/void\s+main\s*\(\s*\)\s*\{/);
    if (main < 0) throw new Error('far hull patch: no vertex main');
    const open = vs.indexOf('{', main) + 1;
    const body = expandIncludes(vs.slice(open))
      .replace(/\bmodelViewMatrix\b/g, 'farModelView').replace(/\bnormalMatrix\b/g, 'farNormalMatrix').replace(/\bmodelMatrix\b/g, 'farModel');
    const fetch = (k: number): string => `texelFetch( uFarRecords, ivec2( ${k}, farRow ), 0 )`;
    vs = `attribute float farPiece;\nattribute float farNightMask;\nuniform highp sampler2D uFarRecords;\nuniform mat4 uFarParts[ ${FAR_HULL_MAX_PARTS} ];\n`
      + `uniform float uFarTie;\nuniform float uFarUnit;\n${RECORD_VARYINGS}${vs.slice(0, open)}\n`
      + `\tint farRow = int( farPiece + 0.5 );\n`
      + `\tvFarSurfA = ${fetch(0)};\n\tvFarSurfB = ${fetch(1)};\n\tvFarSurfC = ${fetch(2)};\n\tvFarSurfD = ${fetch(3)};\n\tvFarSurfE = ${fetch(4)};\n\tvFarSurfF = ${fetch(5)};\n\tvFarNightMask = farNightMask;\n`
      + `\tmat4 farModel = modelMatrix * uFarParts[ int( vFarSurfC.x + 0.5 ) ];\n`
      + `\tmat4 farModelView = viewMatrix * farModel;\n`
      + `\tmat3 farNormalMatrix = transpose( inverse( mat3( farModelView ) ) );\n${body}`;
    if (/uniform float uApPaint;/.test(vs)) vs = replaceExact(vs, /uniform float uApPaint;/, '#define uApPaint vFarSurfC.w', 'uApPaint vs');
    // fragment
    fs = `${RECORD_VARYINGS}bool farSwitch( int bit ) { return ( int( vFarSurfB.w + 0.5 ) & ( 1 << bit ) ) != 0; }\n`
      + `uniform vec3 uFarNightEmissive[ ${NIGHT_SLOTS} ];\nuniform vec3 uFarNightBase[ ${NIGHT_SLOTS} ];\n`
      + 'uniform vec3 nightEmissionWarm, nightEmissionRed, nightEmissionCool;\n'
      + `uniform float nightEmissionRedLevel, nightEmissionFloorExposure, nightEmissionExposure;\n${fs}`;
    // a night lens: its material's live emission and day radiance (its slot), the lens mask per vertex
    fs = replaceExact(fs, /#include <emissivemap_fragment>/, `#include <emissivemap_fragment>
	{
		int farNight = int( vFarSurfF.x + 0.5 ) - 1;
		if ( farNight >= 0 ) {
			vec3 farNightBase = uFarNightBase[ farNight ];
			totalEmissiveRadiance = uFarNightEmissive[ farNight ];
			${nightEmissionFragment('farNightBase', 'vFarNightMask', '1.0')}
		} else {
			totalEmissiveRadiance = vFarSurfF.yzw;
		}
	}`, 'emissivemap_fragment');
    fs = expandChunk(fs, 'map_fragment', (chunk) => replaceExact(chunk, /diffuseColor \*= sampledDiffuseColor;/,
      'diffuseColor *= mix( vec4( 1.0 ), sampledDiffuseColor, vFarSurfA.x );', 'map weight'));
    // the weapon finish's settled dust and grime (weaponFinish.ts; its edge wear resolves to nothing at this range)
    fs = replaceExact(fs, /#include <color_fragment>/, `#include <color_fragment>
	float farWeaponDust = 0.0;
	if ( vFarSurfD.z > 0.0 || vFarSurfD.w > 0.0 ) {
		vec3 farUpView = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
		float farUp = dot( normalize( vNormal ), farUpView );
		farWeaponDust = vFarSurfD.z * smoothstep( 0.25, 0.9, farUp ) * clamp( 0.4 + ( 1.0 - vFarSurfE.w ) * 4.0, 0.0, 1.0 );
		float farGrime = vFarSurfD.w * smoothstep( 0.1, -0.8, farUp );
		diffuseColor.rgb = mix( diffuseColor.rgb, vFarSurfE.rgb, farWeaponDust ) * ( 1.0 - 0.35 * farGrime );
	}`, 'color_fragment');
    fs = expandChunk(fs, 'roughnessmap_fragment', (chunk) => `${replaceExact(
      replaceExact(chunk, /float roughnessFactor = roughness;/, 'float roughnessFactor = roughness * vFarSurfA.y;', 'roughness'),
      /roughnessFactor \*= texelRoughness\.g;/, 'roughnessFactor *= mix( 1.0, texelRoughness.g, vFarSurfB.x );', 'roughness map')}
roughnessFactor = mix( roughnessFactor, 0.92, farWeaponDust );`);
    fs = expandChunk(fs, 'metalnessmap_fragment', (chunk) => replaceExact(chunk, /float metalnessFactor = metalness;/,
      'float metalnessFactor = metalness * vFarSurfA.z;', 'metalness'));
    fs = expandChunk(fs, 'normal_fragment_maps', (chunk) => replaceExact(chunk, /mapN\.xy \*= normalScale;/,
      'mapN.xy *= normalScale * vFarSurfB.y;', 'normal scale'));
    fs = expandChunk(fs, 'lights_physical_fragment', (chunk) => {
      let out = chunk;
      if (/float specularIntensityFactor = specularIntensity;/.test(out)) {
        out = replaceExact(out, /float specularIntensityFactor = specularIntensity;/, 'float specularIntensityFactor = specularIntensity * vFarSurfD.x;', 'specular');
      }
      if (/material\.clearcoat = clearcoat;/.test(out)) {
        out = replaceExact(out, /material\.clearcoat = clearcoat;/, 'material.clearcoat = clearcoat * vFarSurfB.z;', 'clearcoat');
      }
      return out;
    });
    // the sky-light share and the armour-paint mode per piece
    fs = replaceExact(fs, /uniform float uVehEnvScale;/, '#define uVehEnvScale vFarSurfA.w', 'uVehEnvScale');
    if (/uniform float uApPaint;/.test(fs)) fs = replaceExact(fs, /uniform float uApPaint;/, '#define uApPaint vFarSurfC.w', 'uApPaint fs');
    // the paint-mean reference reads the map only where the piece takes it
    fs = replaceExact(fs, /(#ifdef USE_MAP\s*\n\s*)(vehRefL = )/, '$1if ( vFarSurfA.x > 0.5 ) $2', 'paint mean');
    // the switches: field dust, the floors (wheel paint or the hull's), the gear cavity, as branches
    fs = replaceExact(fs, /#if defined\( STANDARD \) && !defined\( COT_NO_FIELD_DUST \)(\s*\n\s*)\{/,
      '#if defined( STANDARD )$1if ( !farSwitch( 2 ) ) {', 'field dust');
    fs = replaceExact(fs, /#ifndef COT_VEHICLE_FLOORLESS(\s*\n\s*)#ifdef COT_WHEEL_PAINT_READABILITY(\s*\n\s*)\{/,
      'if ( !farSwitch( 0 ) ) {$1if ( farSwitch( 1 ) )$2{', 'floors open');
    fs = replaceExact(fs, /\}(\s*\n\s*)#else(\s*\n\s*)\{(\s*\n\s*)float vehFacing/, '}$1else$2{$3float vehFacing', 'floors else');
    fs = replaceExact(fs, /\}(\s*\n\s*)#endif(\s*\n\s*)\{(\s*\n\s*)vec3 vehWorldPos/, '}$1$2{$3vec3 vehWorldPos', 'floors end');
    fs = replaceExact(fs, /\}(\s*\n\s*)#endif(\s*\n\s*)#ifdef COT_GEAR_CAVITY(\s*\n\s*)\{/, '}$1}$2if ( farSwitch( 3 ) )$3{', 'cavity open');
    fs = replaceExact(fs, /(reflectedLight\.indirectSpecular \*= [0-9.]+;\s*\n\s*\})\s*\n\s*#endif/, '$1', 'cavity end');
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
}

/** The depth buffer's resolution at the far end of NDC (24-bit fixed, or float in [0.5, 1)): one unit, in NDC. */
const DEPTH_UNIT_NDC = 2 / (1 << 24);

const _inverseRoot = new THREE.Matrix4();

const _mirror = new THREE.Matrix4();
/** Whether a piece's frame relative to the root (its owner's, times its baked transform) is mirrored. */
function mirrored(root: THREE.Object3D, piece: FarHullPiece): boolean {
  root.updateMatrixWorld(true);
  _mirror.copy(root.matrixWorld).invert().multiply(piece.owner.matrixWorld);
  const det = _mirror.determinant() * (piece.baked ? piece.object.matrix.determinant() : 1);
  return det < 0;
}

/** Whether `object` draws as far as its own visibility and its ancestors' go (its layers may be parked by the draw). */
function shownUnder(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (node === root) return true;
    if (!node.visible) return false;
  }
  return false;
}

const DRAWS = new WeakMap<THREE.Object3D, FarHullDraw>();
/** The far hull draw a `farLodHullDraw` mesh is (receipts, probes). */
export function farHullDrawOf(mesh: THREE.Object3D): FarHullDraw | undefined { return DRAWS.get(mesh); }

let lastRefusal = '';
/** Why the last buildFarHullDraw returned null (the far LOD's record carries it). */
export function farHullRefusal(): string { return lastRefusal; }

/**
 * Merge `pieces` (the far LOD's draws under `root`) into one draw in the carrier's program. Pieces it cannot carry stay
 * out (`left`, `fallbacks` by reason); null when fewer than two pieces would merge, or when the carrier's chain cannot
 * take the patch (the caller keeps the far LOD as it is).
 */
export function buildFarHullDraw(root: THREE.Object3D, pieces: readonly FarHullPiece[], parkLayer: number): FarHullDraw | null {
  lastRefusal = '';
  const fallbacks: Record<string, number> = {};
  const carrier = pickFarHullCarrier(pieces) as SurfaceMaterial | null;
  if (!carrier) { lastRefusal = 'no carrier'; return null; }
  const owners: THREE.Object3D[] = [];
  const carried: FarHullPiece[] = [];
  const left: FarHullPiece[] = [];
  const leftNames: string[] = [];
  const leave = (piece: FarHullPiece, reason: string): void => {
    fallbacks[reason] = (fallbacks[reason] ?? 0) + 1;
    left.push(piece);
    leftNames.push(`${piece.object.name}|${piece.material.name || piece.material.type}|${reason}`);
  };
  // a live draw in several materials is carried whole or not at all (its object parks as one)
  const refused = new Map<THREE.Object3D, string>();
  for (const piece of pieces) {
    const reason = farHullMismatch(piece.material, carrier);
    if (reason && piece.live) refused.set(piece.object, reason);
  }
  const nightMaterials: THREE.MeshStandardMaterial[] = [];
  for (const piece of pieces) {
    const reason = farHullMismatch(piece.material, carrier) ?? (piece.live ? refused.get(piece.object) ?? null : null);
    if (reason) { leave(piece, reason); continue; }
    const lens = programVariantOrigin(piece.material) as THREE.MeshStandardMaterial;
    if (programOf(lens).night && !nightMaterials.includes(lens)) {
      if (nightMaterials.length >= NIGHT_SLOTS || !nightEmissionBaseOf(lens)) { leave(piece, 'night-slots'); continue; }
      nightMaterials.push(lens);
    }
    if (!owners.includes(piece.owner)) {
      if (owners.length >= FAR_HULL_MAX_PARTS) { leave(piece, 'owners'); continue; }
      owners.push(piece.owner);
    }
    carried.push(piece);
  }
  if (carried.length < 2) { lastRefusal = `carried ${carried.length} of ${pieces.length}: ${JSON.stringify(fallbacks)}`; return null; }
  const slots: PieceSlot[] = carried.map((piece) => ({ piece, first: 0, data: pieceData(piece),
    surface: pieceSurface(piece, owners.indexOf(piece.owner), carrier,
      programOf(piece.material).night ? nightMaterials.indexOf(programVariantOrigin(piece.material) as THREE.MeshStandardMaterial) : -1),
    geometry: piece.geometry, versions: versionsOf(piece.geometry), local: piece.baked ? [...piece.object.matrix.elements] : null,
    flip: mirrored(root, piece) }));
  const recordData = new Float32Array(RECORD_TEXELS * 4 * slots.length);
  slots.forEach((slot, row) => recordData.set(slot.surface.record, row * RECORD_TEXELS * 4));
  const records = new THREE.DataTexture(recordData, RECORD_TEXELS, slots.length, THREE.RGBAFormat, THREE.FloatType);
  records.needsUpdate = true;
  const uniforms: FarHullUniforms = {
    uFarParts: { value: Array.from({ length: FAR_HULL_MAX_PARTS }, () => new THREE.Matrix4()) },
    uFarNightEmissive: { value: Array.from({ length: NIGHT_SLOTS }, () => new THREE.Color(0, 0, 0)) },
    // the lenses' day radiance by reference (refreshNightEmissionBase edits it in place)
    uFarNightBase: { value: Array.from({ length: NIGHT_SLOTS }, (_, i) => nightMaterials[i] ? nightEmissionBaseOf(nightMaterials[i])! : new THREE.Color(0, 0, 0)) },
    uFarRecords: { value: records },
    uFarTie: { value: 0 },
    uFarUnit: { value: DEPTH_UNIT_NDC },
  };
  const material = farHullVehicleMaterial(carrier, farHullPatch(uniforms), FAR_HULL_KEY) as SurfaceMaterial | null;
  if (!material) { records.dispose(); lastRefusal = 'carrier outside a registration family'; return null; }
  // the records carry what the uniforms did: the uniforms stand at one
  material.color.setRGB(1, 1, 1);
  material.vertexColors = true;
  material.roughness = 1;
  material.metalness = 1;
  if (material.normalScale) material.normalScale.set(1, 1);
  if (material.isMeshPhysicalMaterial) {
    material.clearcoat = 1;
    material.specularIntensity = 1;
  }
  material.polygonOffset = false;
  material.emissive?.setRGB(0, 0, 0);
  const defines = { ...(material.defines ?? {}) };
  for (const name of [...SWITCHES, ...SAMPLING_SWITCHES]) delete defines[name];
  material.defines = defines;
  material.needsUpdate = true;
  let geometry = mergedGeometry(slots);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'farLodHullDraw';
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = carried.some((piece) => piece.object.receiveShadow);
  mesh.userData.farLod = true;
  mesh.userData.farHullDraw = true;
  mesh.matrixAutoUpdate = false;
  root.add(mesh);
  const syncParts = (): void => {
    _inverseRoot.copy(root.matrixWorld).invert();
    owners.forEach((owner, i) => uniforms.uFarParts.value[i].multiplyMatrices(_inverseRoot, owner.matrixWorld));
  };
  const bound = (): void => {
    root.updateMatrixWorld(true);
    syncParts();
    geometry.boundingSphere = farHullBounds(uniforms.uFarParts.value, slots);
  };
  bound();
  const liveSlots = slots.filter((slot) => slot.piece.live);
  let rebuilds = 0;
  const excluded = new Set<PieceSlot>();
  const previous = mesh.onBeforeRender;
  mesh.onBeforeRender = function farHullBeforeRender(renderer, scene, camera, drawnGeometry, drawn, group) {
    previous.call(this, renderer, scene, camera, drawnGeometry, drawn, group);
    syncParts();
    // the lamps drive their lenses' emission live (vehicleNightLighting.ts): each slot reads its material's
    nightMaterials.forEach((lens, i) => uniforms.uFarNightEmissive.value[i].copy(lens.emissive).multiplyScalar(lens.emissiveIntensity));
    const near = (camera as THREE.PerspectiveCamera).near ?? 0;
    uniforms.uFarTie.value = COPLANAR_TIE_UNITS * ((near > COPLANAR_TIE_NEAR_M ? near / COPLANAR_TIE_NEAR_M : 1) - 1);
    // a live piece shows as its draw would (its visibility and its ancestors'): the record's flag
    let moved = false;
    slots.forEach((slot, row) => {
      if (!slot.piece.live && !excluded.size) return;
      const shown = excluded.has(slot) ? 0 : !slot.piece.live || shownUnder(slot.piece.object, root) ? 1 : 0;
      const at = row * RECORD_TEXELS * 4 + 13;
      if (recordData[at] !== shown) { recordData[at] = shown; moved = true; }
    });
    if (moved) records.needsUpdate = true;
  };
  // the live pieces' parked layers (their own masks, restored on unpark): only the objects themselves, never their children
  const parked: Array<[THREE.Object3D, number]> = [];
  const liveObjects = [...new Set(liveSlots.map((slot) => slot.piece.object))];
  const draw: FarHullDraw = {
    mesh, material, pieces: carried, fallbacks, left, leftNames, textures: [records],
    get rebuilds() { return rebuilds; },
    update() {
      // a live piece whose geometry was swapped or edited (a dent, the bands' last pose) is clustered again and the draw
      // rebuilt; an untouched frame costs a version read a live piece
      let changed = false;
      for (const slot of liveSlots) {
        const g = slot.piece.object.geometry;
        const versions = versionsOf(g);
        const moved = slot.local !== null && slot.piece.object.matrix.elements.some((v, i) => Math.abs(v - slot.local![i]) > 1e-6);
        if (g === slot.geometry && !moved && versions.every((v, i) => v === slot.versions[i])) continue;
        if (slot.local) slot.local = [...slot.piece.object.matrix.elements];
        releaseData(slot.geometry, slot.data);
        slot.piece.geometry = g;
        slot.data = pieceData(slot.piece);
        slot.geometry = g;
        slot.versions = versions;
        changed = true;
      }
      if (!changed) return;
      const old = geometry;
      geometry = mergedGeometry(slots);
      mesh.geometry = geometry;
      bound();
      old.dispose();
      rebuilds++;
    },
    parkLive(on) {
      if (on) {
        if (parked.length) return;
        for (const object of liveObjects) {
          if (object.layers.mask === 1 << parkLayer) continue;
          parked.push([object, object.layers.mask]);
          object.layers.set(parkLayer);
        }
      } else {
        for (const [object, mask] of parked) object.layers.mask = mask;
        parked.length = 0;
      }
    },
    exclude(test) {
      // give the excluded pieces' own draws back (a live draw unparked, a stand-in shown), take them out of the one draw
      for (const slot of excluded) {
        if (slot.piece.live) { const at = parked.findIndex(([object]) => object === slot.piece.object); if (at < 0 && mesh.visible) { parked.push([slot.piece.object, slot.piece.object.layers.mask]); slot.piece.object.layers.set(parkLayer); } }
        else slot.piece.object.visible = false;
      }
      excluded.clear();
      if (!test) return 0;
      for (const slot of slots) if (test(slot.piece)) excluded.add(slot);
      for (const slot of excluded) {
        if (slot.piece.live) {
          const at = parked.findIndex(([object]) => object === slot.piece.object);
          if (at >= 0) { slot.piece.object.layers.mask = parked[at][1]; parked.splice(at, 1); }
        } else slot.piece.object.visible = true;
      }
      return excluded.size;
    },
    dispose() {
      for (const [object, mask] of parked) object.layers.mask = mask;
      parked.length = 0;
      mesh.removeFromParent();
      geometry.dispose();
      for (const slot of liveSlots) releaseData(slot.geometry, slot.data);
      material.dispose();
      records.dispose();
    },
  };
  DRAWS.set(mesh, draw);
  return draw;
}

/** A sphere about the pieces' own spheres in their owners' frames now, padded for a turn of the turret or the gun. */
function farHullBounds(parts: readonly THREE.Matrix4[], slots: readonly PieceSlot[]): THREE.Sphere {
  const box = new THREE.Box3();
  const spheres: THREE.Sphere[] = [];
  for (const slot of slots) {
    if (!slot.data) continue;
    if (!slot.data.boundingSphere) slot.data.computeBoundingSphere();
    const sphere = slot.data.boundingSphere!.clone().applyMatrix4(parts[slot.surface.record[8]]);
    spheres.push(sphere);
    box.expandByPoint(_corner.copy(sphere.center).addScalar(sphere.radius)).expandByPoint(_corner.copy(sphere.center).addScalar(-sphere.radius));
  }
  const centre = box.getCenter(new THREE.Vector3());
  let radius = 0;
  for (const sphere of spheres) radius = Math.max(radius, sphere.center.distanceTo(centre) + sphere.radius);
  return new THREE.Sphere(centre, radius * 1.1 + 0.25);
}
const _corner = new THREE.Vector3();

// ---- the switch ----------------------------------------------------------------------------------------------------
/** `?farHullDraw=0` builds and shows the far LOD's draws as they were (the stand-ins and the live draws one by one). */
const FAR_HULL_DRAW_QUERY = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('farHullDraw') : null;
let farHullDrawOn = FAR_HULL_DRAW_QUERY !== '0';
const FAR_HULL_APPLY = Symbol('farHullApply');
const farHullVehicles = new Set<WeakRef<THREE.Object3D>>();

/** Whether far vehicles draw their one far hull draw (else their far LOD's draws as they were). */
export function farHullDrawEnabled(): boolean { return farHullDrawOn; }

/** A vehicle's re-show of its far LOD, run when the switch moves. */
export function registerFarHullVehicle(root: THREE.Object3D, apply: () => void): void {
  (root as THREE.Object3D & { [FAR_HULL_APPLY]?: () => void })[FAR_HULL_APPLY] = apply;
  farHullVehicles.add(new WeakRef(root));
}

/** Switch every live vehicle's far LOD between the one draw and its draws as they were (the in-page A/B). */
export function setFarHullDrawEnabled(on: boolean): number {
  farHullDrawOn = on;
  let applied = 0;
  for (const ref of farHullVehicles) {
    const root = ref.deref() as (THREE.Object3D & { [FAR_HULL_APPLY]?: () => void }) | undefined;
    if (!root) { farHullVehicles.delete(ref); continue; }
    root[FAR_HULL_APPLY]?.();
    applied++;
  }
  return applied;
}

if (typeof window !== 'undefined') {
  (window as unknown as { __FAR_HULL_DEBUG?: unknown }).__FAR_HULL_DEBUG = {
    set: setFarHullDrawEnabled,
    get enabled() { return farHullDrawOn; },
    /** (the in-page bisection) every vehicle's pieces whose material `test` picks drawn their own way; null restores. */
    exclude(test: ((material: THREE.Material, piece: FarHullPiece) => boolean) | null): number {
      let n = 0;
      for (const ref of farHullVehicles) {
        const mesh = ref.deref()?.getObjectByName('farLodHullDraw');
        const draw = mesh ? DRAWS.get(mesh) : undefined;
        if (draw) n += draw.exclude(test ? (piece) => test(programVariantOrigin(piece.material), piece) : null);
      }
      return n;
    },
  };
}
