// src/world/vegetation.ts — instanced vegetation with GPU wind.
// Trees are built from alpha-carded foliage planes (canvas leaf-cluster
// textures) on branched trunks — not cone/blob primitives. Grass is a dense
// camera-centred instanced carpet (cell-cached, deterministic) layered over a
// sparser map-wide midfield scatter.
// Contract: docs/ARCHITECTURE.md §3.2; visuals per docs/research/graphics-aaa.md §8.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sampleSplatNoise, applyTone, type HeightField } from './terrain.ts';
import { setToppleAxis, settledToppleAngle } from './topple.ts';
import { setCircleShape, type CollisionRecord } from './collision.ts';
import { treeRootDecalAreaM2, treeRootDecalRadius } from './treeGrounding.ts';
import { PLAYABLE_HALF_EXTENT_M } from './battlefieldBounds.ts';
import {
  TREE_ARCHETYPES, TREE_GEOMETRY_SCALE, treeTrunkCollisionRadiusM,
  type TreeSpecies,
} from './treeSpecies.ts';
import { isClearOfSpawns } from './spawnClearance.ts';
// MOBILE r1: central tier texture scale (desktop returns sizes unchanged)
import { getDeviceTier, texSize } from '../engine/quality.ts';
import { applyLodShadowFadeDepth } from '../engine/lodShadowFade.ts';

type RandomSource = () => number;
type ToneFunction = (
  hue: number,
  saturation: number,
  lightness: number,
) => readonly [number, number, number];
type MaterialShader = Parameters<THREE.Material['onBeforeCompile']>[0];
type MaterialShaderHook = (shader: MaterialShader) => void;
type Species = TreeSpecies;
type TreeMesh = THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;
type MutableNumberArray = Float32Array | Float64Array | number[];

interface EngineContext {
  setupShadowMaterial(material: THREE.Material, hook?: MaterialShaderHook | null): void;
}

interface ColorTone {
  hue?: number;
  sat?: number;
  l?: number;
}

interface CanopyPalette {
  hue?: number;
  sat?: number;
  l0?: number;
  l1?: number;
}

interface VegetationPalette {
  canopy?: CanopyPalette;
  cardHue?: number;
  cardSat?: number;
  cardL0?: number;
  frond?: ColorTone;
  jitterHue?: number;
  snow?: number;
  texTone?: ToneFunction;
}

interface BroadleafShape {
  cy?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  trunkH?: number;
  n?: number;
}

interface PalmVariant {
  h0?: number;
  hr?: number;
  rMul?: number;
  lean0?: number;
  leanR?: number;
}

interface BirchVariant {
  h0?: number;
  hr?: number;
  crw?: number;
  nBr?: number;
}

interface VegetationDisc {
  x: number;
  z: number;
  r: number;
}

interface VegetationBelt {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  gap?: number;
  jitter?: number;
  skip?: number;
  species?: Species;
}

type SpeciesMix = ReadonlyArray<readonly [Species, number]>;

interface VegetationConfig {
  species: Species[];
  clusterMix: SpeciesMix;
  loneMix: SpeciesMix;
  rimMix: SpeciesMix;
  clusterCount: number;
  loneCount: number;
  rimCount: number;
  grassDensity: number;
  bushCount: number;
  bushSpecies: Species;
  grassTexTone: ToneFunction | null;
  tuftTone: ToneFunction | null;
  parks: VegetationDisc[] | null;
  palettes: Partial<Record<Species, VegetationPalette>>;
  avoid: VegetationDisc[] | null;
  belts?: VegetationBelt[];
  clusterScrub?: number;
}

export interface VegetationMapConfig {
  vegetation?: Partial<VegetationConfig>;
}

interface BuildYield {
  stage: string;
  fine?: boolean;
  rowEnd?: boolean;
}

interface TreeGeometryPair {
  trunk: THREE.BufferGeometry;
  cards: THREE.BufferGeometry;
}

interface FarTreeGeometryPair {
  trunk: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
}

interface TreeRecord {
  x: number;
  z: number;
  species: Species;
  variant: number;
  fv: number;
  mat: THREE.Matrix4;
  tint: THREE.Color;
  near: boolean;
  cy: number;
  cr: number;
  fade: number;
  slot: number;
  fslot: number;
  dr: number;
  fallH?: number;
  fallR?: number;
  lodF: number;
  lodT: boolean;
  crushed?: boolean;
  uprightMat?: THREE.Matrix4;
}

export interface TreeObstacle extends CollisionRecord {
  treeIdx: number;
  _pressS?: number;
  _pressT?: number;
}

interface ConcealmentDisc extends VegetationDisc {
  add: number;
}

export interface VegetationRuntime {
  group: THREE.Group;
  update(
    deltaSeconds: number,
    cameraPosition: THREE.Vector3,
    cameraForward?: THREE.Vector3 | null,
    focusPosition?: THREE.Vector3 | null,
  ): void;
  setWindTime(timeSeconds: number): void;
  setSniperFade(
    fraction: number,
    immediate?: boolean,
    fovDegrees?: number | null,
    aimDistanceMeters?: number | null,
  ): void;
  treeObstacles: TreeObstacle[];
  concealers: ConcealmentDisc[];
  crushTree(record: TreeObstacle, dx: number, dz: number): boolean;
  resetToppled(): void;
  _clusters: VegetationDisc[];
  _buildDetail?: Record<string, number>;
}

export interface GarageTreeKit {
  species: Species;
  trunk: THREE.BufferGeometry;
  foliage: THREE.BufferGeometry;
  trunkMaterial: THREE.MeshStandardMaterial;
  foliageMaterial: THREE.MeshStandardMaterial;
  detailTier: 'battlefield-near' | 'battlefield-far';
  dispose(): void;
}

interface GarageTreeEngineContext {
  setupShadowMaterial?(
    material: THREE.Material,
    hook?: MaterialShaderHook | null,
  ): void;
}

function context2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('world/vegetation: Canvas2D context unavailable');
  return context;
}

function attribute(geometry: THREE.BufferGeometry, name: string): THREE.BufferAttribute {
  return geometry.getAttribute(name) as THREE.BufferAttribute;
}

export function mulberry32(a: number): RandomSource {return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const HALF = 512;
const CHUNKS = 8, CHUNK_SIZE = 128;
// Performance pass: terrain splat/detail already carries the meadow at range;
// rendering hundreds of thousands of alpha-tested blade cards on top made the
// field look noisy and consumed most of the battle's triangle/overdraw budget.
// Keep readable tufts around the vehicle, then hand off gradually to terrain.
const GRASS_PER_CHUNK = 12000;         // sparse, map-wide midfield scatter
const GRASS_FADE_END = 180;            // scale-out ends before cards become sub-pixel
const CARPET_CELL = 16;
const CARPET_RING = 3;                 // 49 cached cells, coverage to ±56 m
const CARPET_PER_CELL = 420;           // filters thin this to a natural sward
const CARPET_FAR = 48;                 // circular fade hides the square cell edge
const CARPET_CAP = 14000;              // hard upload/raster ceiling per variant
const TREE_NEAR_IN = 260, TREE_NEAR_OUT = 290; // hysteresis band (full-detail radius)

function clamp(x: number, a: number, b: number): number { return x < a ? a : x > b ? b : x; }
function smoothstepJs(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function treePositionNoise(x: number, z: number, salt: number): number {
  const raw = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return raw - Math.floor(raw);
}

function _mustReplace(src: string, anchor: string, replacement: string): string {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/vegetation: shader anchor missing: ${anchor}`);
  return out;
}

// aa-r1 ANTI-SHIMMER (owner: "vegetation is still anti aliasing a lot"):
// mip-aware alpha-coverage rescale on every alpha-tested foliage/grass card.
// Mechanism (motion-burst evidence, shots/aa-r1/): mipmapping AVERAGES the
// card alpha toward its mean, so with a fixed alphaTest the surviving
// coverage shrinks with distance until leaves/blades are 1px islands sitting
// right AT the threshold — each sub-pixel camera step flips them on/off and
// whole canopies seethe. The standard fix (Golus, "Anti-aliased Alpha Test")
// scales alpha back up with the sampled mip level so coverage stays roughly
// distance-invariant; alpha-to-coverage (already on these materials) then
// dithers the restored partial alpha across the MSAA samples instead of
// hard-cutting it. Zero effect at magnification (mip <= 0), and the
// radial-falloff border erosion baked into the atlases keeps its job — texels
// the author pulled to 0 stay 0, so minified cards still never resolve as
// solid rectangles.
const MIP_ALPHA_BOOST = 0.25; // coverage give-back per mip level
const MIP_ALPHA_MAX = 3.5;    // deep-mip cap: never boost more than ~1.9x
function mipAlphaGuard(shader: MaterialShader): void {
  shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <alphatest_fragment>', /* glsl */`
    #if defined( USE_MAP ) && defined( USE_ALPHATEST )
    {
      vec2 aaTs = vec2( textureSize( map, 0 ) );
      vec2 aaDx = dFdx( vMapUv * aaTs ), aaDy = dFdy( vMapUv * aaTs );
      float aaMip = 0.5 * log2( max( max( dot( aaDx, aaDx ), dot( aaDy, aaDy ) ), 1.0 ) );
      diffuseColor.a *= 1.0 + min( aaMip, ${MIP_ALPHA_MAX.toFixed(2)} ) * ${MIP_ALPHA_BOOST.toFixed(3)};
    }
    #endif
    #include <alphatest_fragment>`);
}

// Cards carry hand-authored normals (up for grass, canopy-outward for tree
// foliage); undo the DOUBLE_SIDED faceDirection flip so backfaces don't light
// from below.
function useAttributeNormal(shader: MaterialShader): void {
  shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <normal_fragment_begin>',
    '#include <normal_fragment_begin>\nnormal = normalize( vNormal );\nnonPerturbedNormal = normal;');
}

// ---------------------------------------------------------------------------
// Canvas textures (grass blade card, leaf-cluster + needle-spray foliage)
// ---------------------------------------------------------------------------

const _cc = new THREE.Color();
function css(h: number, s: number, l: number): string { _cc.setHSL(h, s, l); return _cc.getStyle(); }

function finishAlphaTexture(
  c: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  floodR: number,
  floodG: number,
  floodB: number,
  radialFalloff = false,
  tone: ToneFunction | null = null,
): THREE.CanvasTexture {
  // flood transparent texels with the mean foliage tone so mip averaging does
  // not darken distant cards toward black (non-premultiplied-alpha bleed).
  // radialFalloff pulls border alpha to 0 so deep mips average BELOW the
  // alphaTest threshold — otherwise minified cards resolve as solid rectangles.
  const s = c.width;
  const id = ctx.getImageData(0, 0, s, s);
  const d = id.data;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4;
    if (d[i + 3] < 24) { d[i] = floodR; d[i + 1] = floodG; d[i + 2] = floodB; }
    if (radialFalloff) {
      const rr = Math.hypot(x - s / 2, y - s / 2) / (s / 2);
      d[i + 3] *= clamp((1.08 - rr) / 0.5, 0, 1);
    }
  }
  applyTone(d, tone);
  ctx.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// r2 terrain_environment: procedural bark sheet — vertical fissure striation
// albedo + matching normal map shared by every trunk/branch material. The
// untextured vertex-tinted cylinders were the "branchless faceted prism"
// tell: with a striated map + normal relief the trunks read as bark at
// gameplay range. U wraps the trunk circumference (texture wraps in x);
// mean luminance sits ~0.72 so the per-species vertex tints keep their role.
function _nrmFromHeight(h: Float32Array, s: number, strength: number): THREE.CanvasTexture {
  const px = new Uint8ClampedArray(s * s * 4);
  const H = (x: number, y: number): number => h[((y + s) % s) * s + ((x + s) % s)];
  const v = new THREE.Vector3();
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    v.set(-dx * strength, -dy * strength, 1).normalize();
    const i = (y * s + x) * 4;
    px[i] = v.x * 127.5 + 127.5; px[i + 1] = v.y * 127.5 + 127.5; px[i + 2] = v.z * 127.5 + 127.5; px[i + 3] = 255;
  }
  const c = document.createElement('canvas');
  c.width = c.height = s;
  context2d(c).putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, s, s), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function makeBarkTexture(seed: number): { albedo: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const s = 256;
  const rng = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = context2d(c, { willReadFrequently: true });
  ctx.fillStyle = '#aea89f'; // near-neutral: species vertex tints own the hue (birch stays pale)
  ctx.fillRect(0, 0, s, s);
  const paintPlates = (): void => {
    for (let plate = 0; plate < 46; plate += 1) {
      const x = rng() * s, y = rng() * s;
      const width = 14 + rng() * 30, height = 30 + rng() * 70;
      ctx.globalAlpha = 0.16 + rng() * 0.18;
      const lightness = 0.58 + (rng() - 0.5) * 0.26;
      _cc.setHSL(0.075 + (rng() - 0.5) * 0.02, 0.07 + rng() * 0.05, lightness);
      ctx.fillStyle = _cc.getStyle();
      for (const offset of [-s, 0, s]) {
        ctx.fillRect(x - width / 2 + offset, y - height / 2, width, height);
      }
    }
  };
  const paintFissures = (): void => {
    ctx.lineCap = 'round';
    for (let fissure = 0; fissure < 30; fissure += 1) {
      const x = rng() * s;
      const wobble = 2 + rng() * 5;
      const width = 1.4 + rng() * 2.6;
      const dark = 0.30 + rng() * 0.12;
      const points: number[][] = [];
      for (let y = -8; y <= s + 8; y += 12) {
        points.push([
          x + Math.sin(y * 0.05 + rng() * 6) * wobble + (rng() - 0.5) * 3,
          y,
        ]);
      }
      const passes = [[0, dark, width + 1.6, 0], [1, 0.86, width * 0.6, width * 0.9]];
      for (const [pass, lightness, passWidth, passOffset] of passes) {
        _cc.setHSL(0.07, pass ? 0.06 : 0.10, lightness);
        ctx.strokeStyle = _cc.getStyle();
        ctx.lineWidth = passWidth;
        ctx.globalAlpha = pass ? 0.5 : 0.9;
        for (const offset of [-s, 0, s]) {
          ctx.beginPath();
          ctx.moveTo(points[0][0] + offset + passOffset, points[0][1]);
          for (let point = 1; point < points.length; point += 1) {
            ctx.lineTo(points[point][0] + offset + passOffset, points[point][1]);
          }
          ctx.stroke();
        }
      }
    }
  };
  const paintScars = (): void => {
    for (let scar = 0; scar < 60; scar += 1) {
      const x = rng() * s, y = rng() * s, length = 4 + rng() * 12;
      _cc.setHSL(0.07, 0.08, 0.40 + rng() * 0.16);
      ctx.strokeStyle = _cc.getStyle();
      ctx.lineWidth = 1 + rng();
      ctx.globalAlpha = 0.5;
      for (const offset of [-s, 0, s]) {
        ctx.beginPath();
        ctx.moveTo(x + offset, y);
        ctx.lineTo(x + offset + length, y + (rng() - 0.5) * 4);
        ctx.stroke();
      }
    }
  };
  paintPlates();
  ctx.globalAlpha = 1;
  paintFissures();
  ctx.globalAlpha = 1;
  paintScars();
  ctx.globalAlpha = 1;
  const id = ctx.getImageData(0, 0, s, s);
  const hgt = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) {
    hgt[i] = (id.data[i * 4] * 0.5 + id.data[i * 4 + 1] * 0.35 + id.data[i * 4 + 2] * 0.15) / 255;
  }
  const albedo = new THREE.CanvasTexture(c);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
  albedo.anisotropy = 8;
  return { albedo, normal: _nrmFromHeight(hgt, s, 2.2) };
}

// Two tuft variants: 0 = lush meadow tuft, 1 = drier mixed tuft. Dense at the
// root line, ragged at the top so minified mips fade the card edges instead of
// exposing a translucent rectangle.
function makeGrassCardTexture(
  rng: RandomSource,
  variant: number,
  tone: ToneFunction | null = null,
): THREE.CanvasTexture {
  // Grass never occupies enough screen space to justify a 256 px procedural
  // atlas. A simpler 128 px silhouette minifies more cleanly and quarters the
  // texture traffic without changing the authored meadow palette.
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = context2d(c, { willReadFrequently: true });
  ctx.clearRect(0, 0, s, s);
  // r7: fewer, dimmer dry blades (the bright dry tips read as white speckle
  // dust over the dark carpet in player_view) + livelier green tips so near
  // tufts read as lit 3D turf instead of murky moss
  const dryChance = variant === 0 ? 0.08 : 0.26;
  const nBlades = variant === 0 ? 22 : 18;
  for (let b = 0; b < nBlades; b++) {
    const dry = rng() < dryChance;
    const bx = 4 + rng() * (s - 8);
    const bw = 3 + rng() * 4;
    const tall = rng();
    const tipX = bx + (rng() - 0.5) * (variant === 0 ? 45 : 65);
    const tipY = s - (0.35 + 0.62 * tall) * s;
    const cpX = bx + (tipX - bx) * (0.25 + rng() * 0.3);
    const cpY = s - (s - tipY) * (0.45 + rng() * 0.2);
    const grad = ctx.createLinearGradient(0, s, 0, tipY);
    if (dry) {
      grad.addColorStop(0, css(0.105, 0.28, 0.15 + rng() * 0.05));
      grad.addColorStop(1, css(0.115, 0.32, 0.30 + rng() * 0.07));
    } else {
      // r2: tips desaturated + narrowed (0.46/0.38+0.13 -> 0.40/0.35+0.08) —
      // the hot lime blade tips read as radioactive speckle against the dark
      // blade bases in the near field
      // r6: slightly brighter, wider tip range — the carpet read as uniform
      // dark moss mush at 5-20 m (critique); distinct lit blade tips are the
      // detail signal that survives at gameplay range
      grad.addColorStop(0, css(0.24, 0.40, 0.12 + rng() * 0.04));
      grad.addColorStop(0.6, css(0.225, 0.42, 0.26 + rng() * 0.06));
      grad.addColorStop(1, css(0.19 + rng() * 0.05, 0.42, 0.37 + rng() * 0.10));
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(bx - bw / 2, s + 2);
    ctx.quadraticCurveTo(cpX - bw * 0.3, cpY, tipX, tipY);
    ctx.quadraticCurveTo(cpX + bw * 0.3, cpY, bx + bw / 2, s + 2);
    ctx.closePath();
    ctx.fill();
  }
  // A few broad color accents survive minification without the old high-
  // frequency flower speckle.
  if (variant === 0) {
    for (let f = 0; f < 3; f++) {
      const fx = 6 + rng() * (s - 12), fy = s - (0.45 + 0.4 * rng()) * s;
      const warm = rng() < 0.55;
      ctx.fillStyle = warm ? css(0.13, 0.75, 0.62) : css(0.14, 0.12, 0.86);
      for (let p = 0; p < 4; p++) {
        ctx.beginPath();
        ctx.arc(fx + (rng() - 0.5) * 3, fy + (rng() - 0.5) * 2, 0.7 + rng() * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return finishAlphaTexture(c, ctx, 74, 88, 42, false, tone);
}

// Broadleaf foliage card: dozens of small leaf-ellipse clumps, centre-heavy so
// card silhouettes stay ragged; brighter toward the top (sun side).
// r6 terrain_environment: 256 -> 512 atlas with ~2.3x BIGGER individual
// leaves, a dark under-canopy pass beneath every clump and per-leaf tip
// highlights — the old texel-scale leaf mush averaged into "flat acrylic
// noise" on every card by 15 m (the diorama-prop critique). Distinct readable
// leaf shapes are what survive minification as foliage.
function makeLeafClusterTexture(rng: RandomSource, tone: ToneFunction | null = null): THREE.CanvasTexture {
  // MOBILE r1: tier-scaled atlas (painter is K-relative)
  const s = texSize(512), K = s / 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = context2d(c, { willReadFrequently: true });
  ctx.clearRect(0, 0, s, s);
  const cx = s / 2, cy = s / 2;
  // r8: three distinct clump FAMILIES on the one atlas (sun-bleached yellow-
  // green tips / mid olive / dark blue-green shadow foliage) with varied leaf
  // sizes — the single-family clumps read as "one repeated leaf texture"
  // stamped across every crown (critique). Family mix keyed per clump so
  // cards cut from different atlas regions carry visibly different foliage.
  for (let k = 0; k < 115; k++) {
    const a = rng() * Math.PI * 2;
    const rr = Math.pow(rng(), 0.62) * 0.45 * s;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    const sun = 1 - y / s;
    const famRoll = rng();
    let hue, sat, l;
    if (famRoll < 0.30) {        // sun-bleached tips
      // lighting_post r2: cap the bleached family — 0.48 HSL-lightness
      // clipped to lime-white under the 4.5 sun key; ~0.41 rolls off inside
      // the grade shoulder.
      hue = 0.170 + rng() * 0.035; sat = 0.21 + rng() * 0.07;
      l = 0.22 + sun * 0.12 + rng() * 0.07;
    } else if (famRoll < 0.78) { // mid olive body
      hue = 0.215 + rng() * 0.045; sat = 0.19 + rng() * 0.08;
      l = 0.17 + sun * 0.15 + rng() * 0.10;
    } else {                     // dark shadow foliage
      hue = 0.26 + rng() * 0.045; sat = 0.15 + rng() * 0.06;
      l = 0.12 + sun * 0.10 + rng() * 0.07;
    }
    const sizeMul = 0.7 + rng() * 0.9; // per-clump leaf scale spread
    // shadow understorey blob under the clump: leaves read as lit shapes ON
    // a dark interior instead of paint daubs on transparency
    {
      const ur = (9 + rng() * 8) * K * sizeMul;
      const gr = ctx.createRadialGradient(x, y + 3 * K, 0, x, y + 3 * K, ur);
      gr.addColorStop(0, css(hue + 0.02, sat * 0.8, l * 0.42));
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(x, y + 3 * K, ur, 0, Math.PI * 2);
      ctx.fill();
    }
    const nl = 6 + (rng() * 7) | 0;
    for (let j = 0; j < nl; j++) {
      const lx = x + (rng() - 0.5) * 15 * K, ly = y + (rng() - 0.5) * 15 * K;
      // r6: leaves ~2.3x bigger in atlas space — bold readable shapes
      const lw = (3.6 + rng() * 5.2) * sizeMul * K, lh = (2.2 + rng() * 3.1) * sizeMul * K;
      const rot = rng() * Math.PI;
      // r2: PER-LEAF value/hue spread (was one flat fill per clump — the
      // "acrylic paint daub" tell) + a lit sliver on the upper edge of ~half
      // the leaves so crowns carry leaf-scale speckle and specular breakup
      const ll = l * (0.74 + rng() * 0.60);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rot);
      // leaf: pointed-ellipse body with a faint dark keel line
      ctx.fillStyle = css(hue + (rng() - 0.5) * 0.022, sat, ll);
      ctx.beginPath();
      ctx.ellipse(0, 0, lw, lh, 0, 0, Math.PI * 2);
      ctx.fill();
      if (rng() < 0.6) {
        ctx.fillStyle = css(hue - 0.012, sat * 0.85, Math.min(0.62, ll + 0.13 + sun * 0.05));
        ctx.beginPath();
        ctx.ellipse(-lw * 0.18, -lh * 0.30, lw * 0.55, lh * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (rng() < 0.55) { // central vein keel — leaf-scale structure at 512px
        ctx.strokeStyle = css(hue + 0.01, sat * 0.9, ll * 0.55);
        ctx.lineWidth = 0.9 * K * 0.5;
        ctx.beginPath();
        ctx.moveTo(-lw * 0.8, 0);
        ctx.lineTo(lw * 0.8, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  // r2: punch small sky-holes through the foliage mass — solid card interiors
  // were the flat-splat giveaway; alpha gaps let light break through crowns
  ctx.globalCompositeOperation = 'destination-out';
  for (let hle = 0; hle < 70; hle++) {
    const a = rng() * Math.PI * 2;
    const rr = Math.pow(rng(), 0.7) * 0.42 * s;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    ctx.beginPath();
    ctx.arc(x, y, (1.5 + rng() * 3.6) * K, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  return finishAlphaTexture(c, ctx, 70, 78, 40, true, tone);
}

// Conifer foliage card: fanned needle sprays, muted olive-green.
function makeNeedleSprayTexture(rng: RandomSource, tone: ToneFunction | null = null): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = context2d(c, { willReadFrequently: true });
  ctx.clearRect(0, 0, s, s);
  const cx = s / 2, cy = s / 2;
  ctx.lineCap = 'round';
  for (let k = 0; k < 95; k++) {
    const a = rng() * Math.PI * 2;
    const rr = Math.pow(rng(), 0.6) * 0.44 * s;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    const sun = 1 - y / s;
    const dir = rng() * Math.PI * 2;
    const n = 8 + (rng() * 8) | 0;
    ctx.strokeStyle = css(0.30 + rng() * 0.035, 0.18 + rng() * 0.08, 0.15 + sun * 0.12 + rng() * 0.07);
    ctx.lineWidth = 1.5 + rng() * 0.9;
    for (let j = 0; j < n; j++) {
      const na = dir + (rng() - 0.5) * 1.5;
      const len = 9 + rng() * 12;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(na) * len, y + Math.sin(na) * len + len * 0.25);
      ctx.stroke();
    }
  }
  return finishAlphaTexture(c, ctx, 52, 68, 48, true, tone);
}

// Palm frond card: ONE feather-shaped frond filling the card, v axis = frond
// length (base at the bottom). Dense overlapping leaflets fill a contiguous
// silhouette with a serrated edge so the frond reads as a mass, not sparse
// scribbles; dry tips, darker underside strokes for depth.
function makePalmFrondTexture(rng: RandomSource, tone: ToneFunction | null = null): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = context2d(c, { willReadFrequently: true });
  ctx.clearRect(0, 0, s, s);
  const bx = s / 2;
  const drawLeaflets = (
    pass: number,
    t: number,
    rx: number,
    ry: number,
    len: number,
    dry: number,
    droop: number,
  ): void => {
    for (const side of [-1, 1]) {
      for (let leaflet = 0; leaflet < 4; leaflet += 1) {
        // The contiguous feather silhouette must survive alpha minification.
        const width = 7.2 - t * 2.6 - leaflet * 0.9;
        if (width <= 1) continue;
        const jitter = (rng() - 0.5) * 7;
        const luminance = pass === 0
          ? 0.13 + rng() * 0.05
          : 0.19 + t * 0.11 + rng() * 0.07 + dry * 0.10;
        const saturation = pass === 0 ? 0.28 : 0.30 - dry * 0.12;
        const hue = 0.21 - dry * 0.10 + (rng() - 0.5) * 0.02;
        ctx.strokeStyle = css(hue, saturation, luminance);
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        const endX = rx + side * len * (0.9 + rng() * 0.2);
        const endY = ry - len * 0.30 + droop * (0.4 + rng() * 0.3) + jitter;
        ctx.beginPath();
        ctx.moveTo(rx, ry + leaflet * 2.2);
        ctx.quadraticCurveTo(
          rx + side * len * 0.5,
          ry - len * 0.24 + jitter * 0.5,
          endX,
          endY,
        );
        ctx.stroke();
      }
    }
  };
  // two passes: dark under-layer slightly wider, lit top layer
  for (let pass = 0; pass < 2; pass++) {
    const n = 42;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const ry = s - 4 - (s - 12) * t;
      const rx = bx + Math.sin(t * 2.6) * 5;
      // feather envelope: widest just below mid, tapering to the tip
      const env = Math.sin(Math.min(1, t * 1.12) * Math.PI);
      const len = (14 + env * 88) * (pass === 0 ? 1.08 : 1.0);
      const dry = t > 0.78 ? (t - 0.78) * 3.6 : 0;
      const droop = 18 + t * 26;
      drawLeaflets(pass, t, rx, ry, len, dry, droop);
    }
  }
  // central rib on top
  ctx.strokeStyle = css(0.13, 0.34, 0.30);
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(bx, s - 2);
  ctx.quadraticCurveTo(bx + 4, s * 0.5, bx + Math.sin(2.6) * 5, 10);
  ctx.stroke();
  return finishAlphaTexture(c, ctx, 55, 76, 38, false, tone);
}

// Bare-twig card (winter birch crowns / bare shrubs): dark branching strokes.
function makeTwigTexture(rng: RandomSource, tone: ToneFunction | null = null): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = context2d(c, { willReadFrequently: true });
  ctx.clearRect(0, 0, s, s);
  ctx.lineCap = 'round';
  // r9: soft twig-HAZE underlay first — real winter birch crowns read as a
  // purple-brown gauze of thousands of sub-pixel twigs, not as separable
  // black scribbles on the sky. Translucent blobs + a dense pass of fine
  // strokes give the card body; the branch skeleton draws on top.
  for (let b = 0; b < 18; b++) {
    const x = s / 2 + (rng() - 0.5) * 130, y = s / 2 + (rng() - 0.5) * 130;
    const r = 16 + rng() * 30;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(88,84,86,0.22)'); // cool grey — brown read autumnal
    gr.addColorStop(1, 'rgba(88,84,86,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let f = 0; f < 150; f++) { // fine-twig strokes: the haze texture
    const x = s / 2 + (rng() - 0.5) * 150, y = s / 2 + (rng() - 0.5) * 150;
    const a = rng() * Math.PI * 2, len = 8 + rng() * 16;
    ctx.strokeStyle = css(0.045 + rng() * 0.03, 0.05 + rng() * 0.05, 0.26 + rng() * 0.16);
    ctx.lineWidth = 0.8 + rng() * 0.9;
    ctx.globalAlpha = 0.55 + rng() * 0.35;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (rng() - 0.5) * 5,
      y + Math.sin(a) * len * 0.5 - rng() * 4, x + Math.cos(a) * len, y + Math.sin(a) * len - len * 0.2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  function branch(x: number, y: number, a: number, len: number, w: number, depth: number): void {
    if (depth <= 0 || len < 5) return;
    const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
    // r9: lifted from near-black (0.14-0.24 -> 0.22-0.34) — pure-dark strokes
    // against snow albedo read as glitch scribbles at any distance; sat cut
    // toward grey so the crown reads winter-purple-grey, not autumn brown
    ctx.strokeStyle = css(0.05 + rng() * 0.02, 0.08, 0.22 + rng() * 0.12);
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
    const forks = 2 + ((rng() * 2) | 0);
    for (let k = 0; k < forks; k++) {
      branch(nx, ny, a + (rng() - 0.5) * 1.5, len * (0.55 + rng() * 0.25), w * 0.62, depth - 1);
    }
  }
  for (let b = 0; b < 9; b++) {
    const a = rng() * Math.PI * 2;
    branch(s / 2 + (rng() - 0.5) * 60, s / 2 + (rng() - 0.5) * 60, a, 26 + rng() * 22, 2.4, 4);
  }
  return finishAlphaTexture(c, ctx, 82, 72, 66, true, tone);
}

// ---------------------------------------------------------------------------
// Tree geometry — branched trunk (opaque) + foliage cards (alpha-tested)
// ---------------------------------------------------------------------------

const _c = new THREE.Color();
const _v3 = new THREE.Vector3();
const _e = new THREE.Euler();
const _qq = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _scale = new THREE.Vector3(1, 1, 1);

function paintFlat(
  geo: THREE.BufferGeometry,
  color: THREE.Color,
  flex: number,
): THREE.BufferGeometry {
  const n = attribute(geo, 'position').count;
  const col = new Float32Array(n * 3);
  const fl = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
    fl[i] = flex;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
  return geo;
}

// one foliage card: plane transformed into place, vertex colour = AO/tint,
// normal = canopy-outward blend so lighting wraps the crown as one volume
// r5 terrain_environment: optional BOW — broadleaf/bush cards arc gently
// along their height (parabolic bulge toward local +z) so crown surfaces
// read as curved intersecting leaf masses instead of flat cut-out sheets
// (the "blob-card parasol" critique). Costs 2 extra tris per bowed card.
function foliageCard(
  w: number,
  h: number,
  px: number,
  py: number,
  pz: number,
  euler: THREE.Euler,
  shade: number,
  hue: number,
  sat: number,
  flex: number,
  canopyCx: number,
  canopyCy: number,
  canopyCz: number,
  upBias = 1.55,
  bow = 0,
): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 1, bow > 0 ? 2 : 1);
  if (bow > 0) {
    const bp = attribute(g, 'position');
    for (let i = 0; i < bp.count; i++) {
      const yy = bp.getY(i) / (h || 1); // -0.5 .. 0.5 along the card height
      bp.setZ(i, bp.getZ(i) + (0.25 - yy * yy) * w * bow);
    }
  }
  _qq.setFromEuler(euler);
  _m.compose(_v3.set(px, py, pz), _qq, _scale);
  g.applyMatrix4(_m);
  const n = attribute(g, 'position').count;
  _c.setHSL(hue, sat, 0.5, THREE.SRGBColorSpace); // tint via HSL, applied as multiplier around 1
  const col = new Float32Array(n * 3);
  const fl = new Float32Array(n);
  const nd = _v3.set(px - canopyCx, (py - canopyCy) * 0.65, pz - canopyCz);
  if (nd.lengthSq() < 1e-6) nd.set(0, 1, 0);
  nd.normalize();
  // up-bias: canopy reads sunlit, not backlit-black. r2: parameterized —
  // squat bushes need a LOWER bias (0.75) or every card normal collapses to
  // straight-up and the whole shrub lights as one flat unlit sheet.
  nd.y += upBias; nd.normalize();
  const nrm = attribute(g, 'normal');
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r * 1.7 * shade; col[i * 3 + 1] = _c.g * 1.7 * shade; col[i * 3 + 2] = _c.b * 1.7 * shade;
    fl[i] = flex;
    nrm.setXYZ(i, nd.x, nd.y, nd.z);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
  return g;
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false) as THREE.BufferGeometry;
}

function organicizeTrunk(
  geometry: THREE.BufferGeometry,
  phase: number,
  crookX: number,
  crookZ: number,
  flute = 0.07,
): THREE.BufferGeometry {
  const position = attribute(geometry, 'position');
  let minY = Infinity, maxY = -Infinity;
  for (let index = 0; index < position.count; index++) {
    minY = Math.min(minY, position.getY(index));
    maxY = Math.max(maxY, position.getY(index));
  }
  const height = Math.max(1e-5, maxY - minY);
  for (let index = 0; index < position.count; index++) {
    let x = position.getX(index), z = position.getZ(index);
    const y = position.getY(index);
    const radius = Math.hypot(x, z);
    const t = clamp((y - minY) / height, 0, 1);
    if (radius > 1e-5) {
      const angle = Math.atan2(z, x);
      const irregularity = 1
        + Math.sin(angle * 3 + phase) * flute * (1 - t * 0.55)
        + Math.sin(angle * 7 - phase * 0.7) * flute * 0.24;
      x *= irregularity;
      z *= irregularity;
    }
    const bend = t * t;
    x += crookX * bend + Math.sin(t * Math.PI * 1.35 + phase) * crookX * 0.22 * t;
    z += crookZ * bend + Math.sin(t * Math.PI * 1.15 - phase) * crookZ * 0.22 * t;
    position.setXYZ(index, x, y, z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function addRootButtresses(
  parts: THREE.BufferGeometry[],
  rng: RandomSource,
  color: THREE.Color,
  radius: number,
  count: number,
): void {
  const phase = rng() * Math.PI * 2;
  for (let index = 0; index < count; index++) {
    const angle = phase + index / count * Math.PI * 2 + (rng() - 0.5) * 0.22;
    const length = radius * (1.65 + rng() * 0.55);
    const root = new THREE.ConeGeometry(radius * (0.34 + rng() * 0.10), length, 6, 2, false);
    root.rotateZ(Math.PI / 2 - 0.10 - rng() * 0.06);
    root.rotateY(-angle);
    root.scale(1, 0.48, 1);
    root.translate(Math.cos(angle) * length * 0.42, radius * 0.24, Math.sin(angle) * length * 0.42);
    parts.push(paintFlat(root, color.clone().multiplyScalar(0.90 + rng() * 0.10), 0));
  }
}

// trunk + a few real branch cylinders reaching into the canopy.
// r3 terrain_environment: takes the canopy SHAPE so every branch tip is
// clamped INSIDE the crown hull — the r8 "bigger primary branches" reached
// past the card ellipsoid and stabbed through the canopy top as bare black
// spikes in every top-down/establishing view (top critique item).
function buildBroadleafTrunk(
  rng: RandomSource,
  shape: BroadleafShape = {},
): THREE.BufferGeometry {
  const cy = shape.cy ?? 4.35, crx = shape.rx ?? 2.35, cry = shape.ry ?? 1.75;
  // clamp a branch tip (radial dist r, height y) inside 0.78 of the hull;
  // r0 = radial offset of the branch base from the trunk axis
  function clampLen(y0: number, rotZ: number, len: number, r0 = 0): number {
    for (let it = 0; it < 7; it++) {
      const tipY = y0 + Math.cos(rotZ) * len;
      const tipR = r0 + Math.sin(rotZ) * len;
      const e = (tipR / crx) ** 2 + ((tipY - cy) / cry) ** 2;
      if (e <= 0.78) break;
      len *= 0.84;
    }
    return len;
  }
  const parts: THREE.BufferGeometry[] = [];
  const trunkH = (shape.trunkH ?? 3.1) + rng() * 0.5;
  // Twelve-sided, vertically segmented and gently crooked: enough silhouette
  // variation to read as a grown trunk rather than a straight low-poly post.
  const trunkPhase = rng() * Math.PI * 2;
  const trunk = organicizeTrunk(
    new THREE.CylinderGeometry(0.17, 0.30, trunkH, 12, 4),
    trunkPhase, (rng() - 0.5) * 0.18, (rng() - 0.5) * 0.18, 0.085,
  );
  trunk.translate(0, trunkH / 2, 0);
  _c.setHSL(0.07, 0.26, 0.22 + rng() * 0.06, THREE.SRGBColorSpace);
  const trunkColor = _c.clone();
  parts.push(paintFlat(trunk, trunkColor.clone(), 0));
  // r2: root flare — the trunk widens into the ground instead of poking out
  // of it like a dowel; the root decal disc carries the contact shadow
  {
    const flare = new THREE.CylinderGeometry(0.30, 0.55, 0.55, 12, 2);
    const fp = attribute(flare, 'position');
    for (let i = 0; i < fp.count; i++) { // ribbed, slightly irregular flare
      const x = fp.getX(i), z = fp.getZ(i);
      const aF = Math.atan2(z, x);
      const rib = 1 + Math.abs(Math.sin(aF * 3.5 + 0.7)) * 0.22 * (0.5 - fp.getY(i));
      fp.setX(i, x * rib); fp.setZ(i, z * rib);
    }
    flare.computeVertexNormals();
    flare.translate(0, 0.24, 0);
    _c.setHSL(0.07, 0.25, 0.20 + rng() * 0.05, THREE.SRGBColorSpace);
    parts.push(paintFlat(flare, _c.clone(), 0));
  }
  addRootButtresses(parts, rng, trunkColor, 0.38, 5);
  // r8: more + BIGGER primary branches reaching well into the canopy volume
  // (critique: "bare cylinder trunks that never connect to the canopy via
  // branches") — 4-6 limbs, thicker and longer (up to ~3.4 m, canopy center
  // sits at 4.35 m), plus a forked secondary on most of them so the trunk-to-
  // crown transition reads as real branch structure through card gaps.
  const nBr = 4 + (rng() * 3) | 0;
  for (let b = 0; b < nBr; b++) {
    const rotZ = 0.45 + rng() * 0.6;
    const rotY = (b / nBr) * Math.PI * 2 + rng() * 0.8;
    const y0 = trunkH * (0.58 + rng() * 0.34);
    const len = clampLen(y0, rotZ, 2.0 + rng() * 1.4);
    const br = new THREE.CylinderGeometry(0.05, 0.13, len, 5, 1);
    br.translate(0, len / 2, 0);
    br.rotateZ(rotZ);
    br.rotateY(rotY);
    br.translate(0, y0, 0);
    _c.setHSL(0.07, 0.24, 0.20 + rng() * 0.05, THREE.SRGBColorSpace);
    parts.push(paintFlat(br, _c.clone(), 0.15));
    if (rng() < 0.75) { // forked secondary off the limb tip
      const rotZ2 = rotZ + (rng() - 0.2) * 0.7;
      // limb tip position (approx): rotate (0,len,0) by Z then Y
      const tipR = Math.sin(rotZ) * len, tipY = Math.cos(rotZ) * len;
      // secondary clamped from the tip station too — it was the worst
      // canopy-piercing offender (tip + 1.7 m at a steeper angle)
      const len2 = clampLen(y0 + tipY, rotZ2, 0.9 + rng() * 0.8, tipR);
      const br2 = new THREE.CylinderGeometry(0.03, 0.055, len2, 4, 1);
      br2.translate(0, len2 / 2, 0);
      br2.rotateZ(rotZ2);
      br2.rotateY(rotY + (rng() - 0.5) * 0.9);
      br2.translate(
        -Math.cos(rotY) * tipR,
        y0 + tipY,
        Math.sin(rotY) * tipR,
      );
      _c.setHSL(0.07, 0.22, 0.22 + rng() * 0.05, THREE.SRGBColorSpace);
      parts.push(paintFlat(br2, _c.clone(), 0.25));
    }
  }
  const merged = mergeParts(parts);
  merged.userData.trunkQuality = {
    family: 'broadleaf', radialSegments: 12, verticalSegments: 4,
    rootButtresses: 5, organicWarp: true,
  };
  return merged;
}

function buildBroadleafCards(
  rng: RandomSource,
  nCards: number,
  sizeMul: number,
  pal: VegetationPalette = {},
  shape: BroadleafShape = {},
): THREE.BufferGeometry {
  // r7: sat 0.24 -> 0.19 + hue pulled off pure green — default oaks rendered
  // as "over-saturated lime puffballs" against the graded field
  const hue0 = pal.cardHue ?? 0.228, sat0 = pal.cardSat ?? 0.19;
  // content_breadth r4: optional palette luminance floor — winter birch
  // stands rendered near-black against snow because the card luminance was
  // hardcoded and palette lifts could not reach it
  const l0 = pal.cardL0 ?? 0.30;
  // r3 terrain_environment: SHAPE-driven crown — the three near variants
  // used to differ only by rng jitter, so every broadleaf on the map shared
  // one round-lollipop silhouette (top critique item). Variants now span
  // round / tall-columnar / wide-spreading crowns.
  const cy = shape.cy ?? 4.35, rx = shape.rx ?? 2.35,
    ry = shape.ry ?? 1.75, rz = shape.rz ?? (shape.rx ?? 2.35);
  // multi-lobe crown: cards cluster around 2-3 offset sub-lobes so the canopy
  // silhouette reads as a broken broadleaf mass, not one lollipop ball
  const lobes: Array<[number, number, number]> = [[0, cy, 0]];
  const nLobes = 2 + ((rng() * 2) | 0);
  for (let li = 1; li < nLobes; li++) {
    const la = rng() * Math.PI * 2;
    lobes.push([Math.cos(la) * (1.2 + rng() * 0.7), cy + (rng() - 0.35) * 1.3,
      Math.sin(la) * (1.2 + rng() * 0.7)]);
  }
  const parts: THREE.BufferGeometry[] = [];
  const _tq = new THREE.Quaternion(), _tq2 = new THREE.Quaternion();
  const _zAxis = new THREE.Vector3(0, 0, 1), _dv = new THREE.Vector3();
  for (let i = 0; i < nCards; i++) {
    const lobe = lobes[(rng() * lobes.length) | 0];
    const lr = lobe === lobes[0] ? 1.0 : 0.62; // satellites are smaller
    // direction on a squashed sphere, radius biased outward
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = Math.pow(0.22 + 0.78 * rng(), 0.75);
    const px = lobe[0] + dx * rad * rx * lr;
    const py = lobe[1] + dy * rad * ry * lr * (dy > 0 ? 1 : 0.8);
    const pz = lobe[2] + dz * rad * rz * lr;
    // r6: wider card size spread — same-size clusters read as one repeated
    // stamp; a few big mass cards + many small filler tufts read as foliage
    // Keep the shell clusters below the size at which a single atlas card
    // spans an entire crown quadrant. The previous 2.75 m upper bound made
    // its rectangular overlap readable from ground-level cameras; the same
    // card count at 1.20..2.40 m produces a denser ragged silhouette while
    // reducing alpha overdraw.
    const wsz = (1.20 + rng() * 1.20) * sizeMul;
    // r6 TANGENT-BIASED shell orientation: ~2/3 of the shell cards lie
    // roughly tangent to the crown hull (leaf clusters as seen from outside
    // a real tree), the rest stay fully random interior fill. The old
    // uniformly random eulers criss-crossed flat sheets through the
    // silhouette — the "collage of cutout cards" tell at 10-30 m.
    if (rad > 0.55 && rng() < 0.68) {
      _dv.set(dx, dy * 0.75, dz).normalize();
      _tq.setFromUnitVectors(_zAxis, _dv);
      _tq2.setFromAxisAngle(_dv, rng() * Math.PI * 2); // random roll about the normal
      _tq2.multiply(_tq);
      // +-20 deg jitter so the shell never reads as a faceted geodesic
      _tq.setFromEuler(_e.set((rng() - 0.5) * 0.7, (rng() - 0.5) * 0.7, 0, 'YXZ'));
      _tq2.multiply(_tq);
      _e.setFromQuaternion(_tq2, 'YXZ');
    } else {
      _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    }
    const distC = Math.hypot(px, py - cy, pz) / Math.max(rx, ry);
    // r6: deeper interior AO + wider hue/value jitter per card — flat
    // one-tone crowns were the "broccoli blob" mid-distance tell.
    // lighting_post r3: core floor 0.42 -> 0.50 so oaks meet the shared
    // 0.30-0.45 linear albedo band pines/palms target (cross-species match)
    // r7: vertical gradient deepened (0.86+0.28 -> 0.72+0.42) — the canopy
    // darkens toward the ground plane like a real shaded understory, so the
    // crown reads grounded instead of a uniformly lit floating ball
    // r8: floors lifted (core 0.50 -> 0.58, vertical 0.72 -> 0.80) — the
    // stacked AO gradients drove shadowed canopy undersides to near-black
    // paint blobs in the chase view (critique); real crowns keep skylight
    // bounce in the skirt. Hue jitter widened ±0.025 -> ±0.045: with one
    // shared leaf atlas, per-card hue/value spread is what breaks the
    // "single repeated leaf texture" read.
    const shade = (0.58 + 0.42 * clamp(distC, 0, 1)) // dark core, lit shell
      * (0.80 + 0.34 * clamp((py - cy) / ry * 0.5 + 0.5, 0, 1)) * (0.92 + rng() * 0.16);
    // r6: upBias 1.55 -> 1.0 — the near-vertical bent normals lit the whole
    // crown one flat tone; a stronger lateral component gives the sun-side /
    // shade-side gradient a real crown shows (wrap 0.62 keeps the dark side
    // from crushing)
    parts.push(foliageCard(wsz, wsz * 0.82, px, py, pz, _e, shade,
      hue0 + (rng() - 0.5) * 0.09, sat0 + rng() * 0.08, l0 + rad * 0.65, 0, cy, 0,
      1.0, 0.5)); // r5: bowed shell cards — curved leaf masses, not flat splats
  }
  // a couple of low cards hanging near the branch collar
  for (let i = 0; i < Math.max(2, nCards >> 4); i++) {
    const a = rng() * Math.PI * 2, rr = 0.9 + rng() * 0.9;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    parts.push(foliageCard(1.3 * sizeMul, 1.0 * sizeMul, Math.cos(a) * rr, 2.9 + rng() * 0.6, Math.sin(a) * rr,
      _e, 0.5, hue0 + 0.005, sat0 + 0.02, 0.35, 0, cy, 0));
  }
  // r3 terrain_environment: inner DARK FILLER cards — with only the shell
  // cards the crown read as a hollow shell of floating splats wherever the
  // camera caught a gap (sky showing through the middle of the canopy).
  // A handful of big, dark, low-sat cards packed around the lobe cores
  // block the see-through and give the crown a shaded interior mass.
  for (let i = 0; i < 9; i++) {
    const lobe = lobes[(rng() * lobes.length) | 0];
    const a = rng() * Math.PI * 2, rr = Math.pow(rng(), 1.5) * 0.4;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    parts.push(foliageCard(1.92 * sizeMul, 1.64 * sizeMul,
      lobe[0] + Math.cos(a) * rr * rx, lobe[1] + (rng() - 0.5) * ry * 0.7,
      lobe[2] + Math.sin(a) * rr * rz,
      _e, 0.40 + rng() * 0.10, hue0 + 0.01, sat0 * 0.8, 0.25, 0, cy, 0));
  }
  return mergeParts(parts);
}

function buildPineTrunk(rng: RandomSource, pal: VegetationPalette = {}): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkH = 5.9 + rng() * 0.6;
  const trunk = organicizeTrunk(
    new THREE.CylinderGeometry(0.10, 0.26, trunkH, 11, 4),
    rng() * Math.PI * 2, (rng() - 0.5) * 0.10, (rng() - 0.5) * 0.10, 0.065,
  );
  trunk.translate(0, trunkH / 2, 0);
  _c.setHSL(0.06, 0.30, 0.19 + rng() * 0.05, THREE.SRGBColorSpace);
  const trunkColor = _c.clone();
  parts.push(paintFlat(trunk, trunkColor.clone(), 0));
  const flare = new THREE.CylinderGeometry(0.26, 0.46, 0.5, 11, 2);
  flare.translate(0, 0.22, 0);
  _c.setHSL(0.06, 0.28, 0.17 + rng() * 0.04, THREE.SRGBColorSpace);
  parts.push(paintFlat(flare, _c.clone(), 0));
  addRootButtresses(parts, rng, trunkColor, 0.31, 4);
  // r6 terrain_environment: OPAQUE snow lobes riding the tier tops (winter
  // maps, pal.snow) — the whitened needle cards alone still averaged toward
  // green at range; real load is a solid white mass sitting ON the boughs.
  // Same trick as the birch branch-riding lobes (bark material, lifted tint).
  const snow = pal.snow ?? 0;
  if (snow > 0.25) {
    const topY = 6.4;
    for (let y = 2.1; y < topY - 0.4; y += 0.62 + rng() * 0.5) {
      const t = (y - 1.2) / (topY - 1.2);
      const rr = (1.0 - t) * 1.35 + 0.22;
      const m = 1 + ((rng() * 2) | 0);
      for (let k = 0; k < m; k++) {
        if (rng() > snow * (0.45 + 0.55 * t)) continue;
        const a = rng() * Math.PI * 2;
        const lr = 0.30 + rng() * 0.26 + (1 - t) * 0.14;
        const lobe = new THREE.IcosahedronGeometry(lr, 0);
        jitterRadial(lobe, rng, 0.35);
        lobe.scale(1.6 + rng() * 0.5, 0.34, 1.0 + rng() * 0.4);
        lobe.rotateY(a + Math.PI / 2);
        sphereNormals(lobe, 0, 0, 0, 1.3);
        lobe.translate(Math.cos(a) * rr * 0.62, y + 0.14 + rng() * 0.2, Math.sin(a) * rr * 0.62);
        _c.setHSL(0.585, 0.04, 0.62, THREE.SRGBColorSpace).multiplyScalar(1.55);
        parts.push(paintFlat(lobe, _c.clone(), 0.12));
      }
    }
    // leader cap: the topmost load every snowbound spruce carries
    const cap = new THREE.IcosahedronGeometry(0.34, 0);
    jitterRadial(cap, rng, 0.3);
    cap.scale(1.1, 0.55, 1.1);
    sphereNormals(cap, 0, 0, 0, 1.3);
    cap.translate(0, topY - 0.28, 0);
    _c.setHSL(0.585, 0.04, 0.64, THREE.SRGBColorSpace).multiplyScalar(1.55);
    parts.push(paintFlat(cap, _c.clone(), 0.2));
  }
  const merged = mergeParts(parts);
  merged.userData.trunkQuality = {
    family: 'conifer', radialSegments: 11, verticalSegments: 4,
    rootButtresses: 4, organicWarp: true,
  };
  return merged;
}

function buildPineCards(
  rng: RandomSource,
  tierStep: number,
  sizeMul: number,
  pal: VegetationPalette = {},
): THREE.BufferGeometry {
  // lighting_post r3: pine defaults 0.325/0.23 -> 0.30/0.18 — pines sat
  // brighter + more cyan than oaks (hue0 0.235); pull both into one band
  const hue0 = pal.cardHue ?? 0.30, sat0 = pal.cardSat ?? 0.18;
  const l0 = pal.cardL0 ?? 0.15; // content_breadth r4: palette luminance floor
  const topY = 6.4;
  const parts: THREE.BufferGeometry[] = [];
  for (let y = 1.55; y < topY - 0.3; y += tierStep * (0.85 + rng() * 0.3)) {
    const t = (y - 1.2) / (topY - 1.2);
    const rr = (1.0 - t) * 1.65 + 0.30;
    const m = Math.max(4, Math.round(2.8 + rr * 2.7)); // denser tiers: no see-through crowns
    const a0 = rng() * Math.PI * 2;
    for (let k = 0; k < m; k++) {
      const a = a0 + (k / m) * Math.PI * 2 + (rng() - 0.5) * 0.7;
      // cap card width — oversized bottom-tier quads mip into solid diamonds
      const w = Math.min(rr * 1.15 + 0.75, 2.4) * sizeMul, h = (0.9 + rr * 0.45) * sizeMul;
      _e.set(-Math.PI / 2 + 0.55 + rng() * 0.25, -a + Math.PI / 2, (rng() - 0.5) * 0.3, 'YXZ');
      // r6: wider per-card value/hue spread — one uniform saturated green
      // across every card was the "model railroad pine" tell at 30-80 m
      // r7: base 0.50 -> 0.42 — lower tiers shade toward the ground plane
      // r8: 0.42 -> 0.48 — bottom tiers went to black paint in chase shadow
      const shade = 0.48 + t * 0.40 + rng() * 0.26;
      // content_breadth r3: pal.snow lays a SNOW LOAD on the tier tops —
      // upper tiers whiten/brighten most (a loaded spruce is white above,
      // green in the skirt), per-card jitter keeps the load clumpy
      // r6 terrain_environment: floor raised (0.25+0.75t -> 0.48+0.52t) and
      // whitening strengthened — winter conifers still read summer-green
      // against full snow cover (critique); a loaded spruce is white-limbed
      // down to its skirt, not just at the leader
      const sk = (pal.snow ?? 0) * (0.48 + 0.52 * t) * (0.60 + rng() * 0.40);
      parts.push(foliageCard(w, h, Math.cos(a) * rr * 0.55, y + rng() * 0.25, Math.sin(a) * rr * 0.55,
        _e, shade * (1 + sk * 0.75),
        hue0 + (rng() - 0.5) * 0.045 + (0.585 - hue0) * sk,
        (sat0 + rng() * 0.07) * (1 - sk * 0.85) + 0.02 * sk,
        l0 + Math.pow(t, 1.5) * 0.65,
        0, y - 0.6, 0, 1.05));
    }
  }
  // vertical leader cards at the top
  for (let k = 0; k < 2; k++) {
    _e.set(0, rng() * Math.PI, 0, 'YXZ');
    parts.push(foliageCard(1.0 * sizeMul, 1.7 * sizeMul, 0, topY - 0.55, 0, _e, 0.9,
      hue0, sat0 + 0.03, 0.8, 0, topY - 1.6, 0));
  }
  return mergeParts(parts);
}

// --- palm: curved warm-brown trunk + a crown of ARCHED drooping fronds
// (bent tapered planes, dense frond texture) + coconut cluster ---
function buildPalmGeometry(
  rng: RandomSource,
  pal: VegetationPalette = {},
  vr: PalmVariant = {},
): TreeGeometryPair {
  // r6: frond tint is PALETTE-DRIVEN and defaults desaturated olive — the
  // old hardcoded HSL(0.228, 0.32, 0.5) x 1.55 rendered saturated lime
  // plastic against the desert sand (top critique item)
  const fr = pal.frond || {};
  const frondHue = fr.hue ?? 0.205, frondSat = fr.sat ?? 0.22, frondLum = fr.l ?? 0.44;
  const trunkParts: THREE.BufferGeometry[] = [];
  // r3 terrain_environment: per-variant proportions + thicker trunks — the
  // identical stick-thin same-height palms were the "sprite-like repeats"
  // tell; variants now span squat-thick / classic / tall-slender with
  // matching lean character (vr from PALM_VAR)
  const rMul = vr.rMul ?? 1.15;
  const H = (vr.h0 ?? 5.6) + rng() * (vr.hr ?? 1.4);
  const leanA = rng() * Math.PI * 2;
  const lean = (vr.lean0 ?? 0.5) + rng() * (vr.leanR ?? 0.5); // total top offset in meters
  const NSEG = 6;
  let px = 0, pz = 0;
  const trunkColor = new THREE.Color().setHSL(0.072, 0.30, 0.38, THREE.SRGBColorSpace);
  const rootFlare = organicizeTrunk(
    new THREE.CylinderGeometry(0.23 * rMul, 0.36 * rMul, 0.48, 10, 2),
    rng() * Math.PI * 2, 0, 0, 0.075,
  );
  rootFlare.translate(0, 0.22, 0);
  trunkParts.push(paintFlat(rootFlare, trunkColor.clone().multiplyScalar(0.88), 0));
  addRootButtresses(trunkParts, rng, trunkColor, 0.28 * rMul, 4);
  for (let i = 0; i < NSEG; i++) {
    const t0 = i / NSEG, t1 = (i + 1) / NSEG;
    const x0 = Math.cos(leanA) * lean * t0 * t0, z0 = Math.sin(leanA) * lean * t0 * t0;
    const x1 = Math.cos(leanA) * lean * t1 * t1, z1 = Math.sin(leanA) * lean * t1 * t1;
    const segLen = Math.hypot(H / NSEG, x1 - x0, z1 - z0) * 1.04;
    const seg = new THREE.CylinderGeometry(
      (0.13 + (1 - t1) * 0.10) * rMul, (0.14 + (1 - t0) * 0.10) * rMul, segLen, 9, 2);
    organicizeTrunk(seg, i * 0.73 + leanA, 0, 0, 0.045);
    // ring-band illusion: alternating leaf-scar bands in warm brown
    _c.setHSL(0.072, 0.30, (i % 2 ? 0.34 : 0.43) + rng() * 0.03, THREE.SRGBColorSpace); // r2: bark-map compensation
    seg.rotateZ(Math.atan2(x1 - x0, H / NSEG) * -1);
    seg.rotateY(-leanA);
    seg.translate((x0 + x1) / 2, (t0 + t1) * 0.5 * H, (z0 + z1) / 2);
    trunkParts.push(paintFlat(seg, _c.clone(), t1 * 0.2));
    px = x1; pz = z1;
  }
  // fiber collar under the crown
  const collar = new THREE.CylinderGeometry(0.30 * rMul, 0.19 * rMul, 0.6, 9, 2);
  collar.translate(px, H - 0.15, pz);
  _c.setHSL(0.082, 0.32, 0.29, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(collar, _c.clone(), 0.2));
  // coconut cluster nestled at the crown base
  for (let k = 0; k < 4 + ((rng() * 3) | 0); k++) {
    const a = rng() * Math.PI * 2;
    const nut = new THREE.IcosahedronGeometry(0.13 + rng() * 0.05, 0);
    nut.translate(px + Math.cos(a) * (0.22 + rng() * 0.14), H + 0.02 + rng() * 0.16,
      pz + Math.sin(a) * (0.22 + rng() * 0.14));
    _c.setHSL(0.09, 0.38, 0.28 + rng() * 0.09, THREE.SRGBColorSpace);
    trunkParts.push(paintFlat(nut, _c.clone(), 0.3));
  }

  // arched frond: tapered plane bent along its length — rises from the crown,
  // arcs over and droops at the tip. Built per-frond so the canopy is a mass.
  function frond(
    a: number,
    phi0: number,
    phiTip: number,
    len: number,
    wBase: number,
    shade: number,
    dead: boolean,
  ): THREE.BufferGeometry {
    const SEGS = 6;
    const g = new THREE.PlaneGeometry(1, 1, 1, SEGS);
    const p = attribute(g, 'position');
    // bend: integrate the frond direction along the arc; x stays width axis
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) + 0.5; // 0..1 along the frond
      const w = (1 - t * 0.8) * wBase; // taper toward the tip
      let ry = 0, rf = 0;
      const steps = 12;
      const dl = (len * t) / steps;
      for (let sIt = 0; sIt < steps; sIt++) {
        const tt = ((sIt + 0.5) / steps) * t;
        const ph = phi0 + (phiTip - phi0) * tt * tt;
        rf += Math.cos(ph) * dl;
        ry += Math.sin(ph) * dl;
      }
      p.setXYZ(i, p.getX(i) * w, ry, rf);
    }
    g.computeVertexNormals();
    const rotY = new THREE.Matrix4().makeRotationY(a);
    g.applyMatrix4(rotY);
    g.translate(px, H + 0.18, pz);
    const nv = p.count;
    const col = new Float32Array(nv * 3);
    const fl = new Float32Array(nv);
    if (dead) _c.setHSL(0.095, 0.30, 0.28, THREE.SRGBColorSpace);
    else _c.setHSL(frondHue + (rng() - 0.5) * 0.035, frondSat, frondLum, THREE.SRGBColorSpace);
    const uvA = attribute(g, 'uv');
    for (let i = 0; i < nv; i++) {
      const t = uvA.getY(i); // 0..1 along the frond length
      const m = dead ? 1 : 1.38 * shade;
      col[i * 3] = _c.r * m; col[i * 3 + 1] = _c.g * m; col[i * 3 + 2] = _c.b * m;
      fl[i] = dead ? 0.25 : 0.30 + t * 0.45;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
    // sky-lit normals: outward + strong up bias, like the other canopies
    const nrm = attribute(g, 'normal');
    _v3.set(Math.sin(a) * 0.45, 1.35, Math.cos(a) * 0.45).normalize();
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, _v3.x, _v3.y, _v3.z);
    return g;
  }

  const cardParts: THREE.BufferGeometry[] = [];
  // r5 terrain_environment: 9-11 BIG fronds (was 13-17 thin ones) — the
  // dense thin-blade crown read as a bottle-brush starburst (critique);
  // real date-palm crowns are a handful of long arched fronds that rise,
  // arc and DROOP well below horizontal. Wider blades + longer arcs + a
  // deeper droop give the layered drooping canopy; the crown core below
  // fills the star's hollow center.
  const n = 9 + ((rng() * 3) | 0);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng() * 0.5;
    // alternate steep/shallow launch angles => layered dome-shaped crown
    const steep = k % 2 === 0;
    const phi0 = steep ? 0.95 + rng() * 0.30 : 0.50 + rng() * 0.28; // up from horizontal
    const phiTip = -(0.85 + rng() * 0.60); // tips droop WELL below horizontal
    const len = 4.0 + rng() * 1.5;
    const shade = 0.7 + (steep ? 0.3 : 0.12) + rng() * 0.1;
    cardParts.push(frond(a, phi0, phiTip, len, 2.0, shade, false));
  }
  // crown core: a small dark mass where the frond bases overlap — without it
  // the crown center was hollow and the fronds read as separate spikes
  {
    const core = new THREE.IcosahedronGeometry(0.44 * rMul, 0);
    jitterRadial(core, rng, 0.25);
    core.scale(1.35, 0.85, 1.35);
    sphereNormals(core, 0, 0, 0, 1.0);
    core.translate(px, H + 0.30, pz);
    _c.setHSL(frondHue, frondSat * 0.9, Math.max(0.10, frondLum * 0.45), THREE.SRGBColorSpace);
    trunkParts.push(paintFlat(core, _c.clone(), 0.2));
  }
  // r6: 4-5 hanging dead fronds — a proper dry skirt under the crown pulls
  // the palette toward khaki and breaks the all-green crown ball
  for (let k = 0; k < 4 + ((rng() * 2) | 0); k++) {
    const a = rng() * Math.PI * 2;
    cardParts.push(frond(a, -0.9 - rng() * 0.3, -1.45, 2.3 + rng() * 0.5, 1.05, 0.6, true));
  }
  const trunk = mergeParts(trunkParts);
  trunk.userData.trunkQuality = {
    family: 'palm', radialSegments: 9, verticalSegments: 2,
    rootButtresses: 4, organicWarp: true,
  };
  return { trunk, cards: mergeParts(cardParts) };
}

// --- birch: pale banded trunk, upward branches, sparse bare-twig cards ---
// content_breadth r3: takes the species palette — the winter map's birches
// rendered with the hardcoded autumn-brush card tint (beige-mauve puffs, the
// "dead autumn saplings" critique) because this was the one near builder
// that ignored pal. cardHue/cardSat/cardL0 now apply, and pal.snow (0..1)
// lays a top-weighted SNOW LOAD across the twig cloud: upward cards lerp
// toward blue-white and brighten, exactly how loaded winter brush reads.
// r5 terrain_environment: REBUILT. The r4 "crown cap" — a 2.5-3.5 m
// flattened icosphere disc on a pole — rendered every winter birch as the
// SAME grey umbrella/parasol, cloned ~30x at near-identical height (the
// loudest foliage tell in the critique). Now: per-variant proportions
// (BIRCH_VAR: young slender / classic / old broad), an UPRIGHT BRANCH
// LATTICE of real forking limbs that carries the winter silhouette, an
// upright-ellipsoid twig-haze card cloud (taller than wide — birch brooms,
// not mushrooms), and small branch-riding snow lobes only. No crown cap.
const BIRCH_VAR: BirchVariant[] = [
  { h0: 4.3, hr: 0.9, crw: 1.15, nBr: 11 }, // young slender
  { h0: 6.0, hr: 1.3, crw: 1.55, nBr: 14 }, // classic
  { h0: 7.5, hr: 1.6, crw: 2.00, nBr: 17 }, // old broad
];
function buildBirchGeometry(
  rng: RandomSource,
  pal: VegetationPalette = {},
  vr: BirchVariant = {},
): TreeGeometryPair {
  const trunkParts: THREE.BufferGeometry[] = [];
  const H = (vr.h0 ?? 5.6) + rng() * (vr.hr ?? 1.6);
  const crw = vr.crw ?? 1.55;
  const trunkStem = organicizeTrunk(
    new THREE.CylinderGeometry(0.06, 0.16, H * 0.62, 10, 5),
    rng() * Math.PI * 2, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08, 0.055,
  );
  trunkStem.translate(0, H * 0.31, 0);
  // banded bark via vertex colours: pale white with darker patches
  {
    const trunkPosition = attribute(trunkStem, 'position');
    const nv = trunkPosition.count;
    const col = new Float32Array(nv * 3);
    const fl = new Float32Array(nv);
    for (let i = 0; i < nv; i++) {
      const y = trunkPosition.getY(i);
      const band = Math.sin(y * 5.1 + rng() * 0.3) > 0.72 ? 0.32 : 1;
      _c.setHSL(0.09, 0.04, (0.80 + rng() * 0.10) * band + (band < 1 ? 0.08 : 0), THREE.SRGBColorSpace); // r2: bark-map compensation
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      fl[i] = 0;
    }
    trunkStem.setAttribute('color', new THREE.BufferAttribute(col, 3));
    trunkStem.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
    trunkParts.push(trunkStem);
  }
  const birchRootColor = new THREE.Color().setHSL(0.08, 0.045, 0.66, THREE.SRGBColorSpace);
  const birchFlare = organicizeTrunk(
    new THREE.CylinderGeometry(0.16, 0.25, 0.36, 10, 2),
    rng() * Math.PI * 2, 0, 0, 0.06,
  );
  birchFlare.translate(0, 0.16, 0);
  trunkParts.push(paintFlat(birchFlare, birchRootColor.clone(), 0));
  addRootButtresses(trunkParts, rng, birchRootColor, 0.21, 4);
  const addBranchLattice = (): void => {
    const leaderCount = 2 + ((rng() * 2) | 0);
    for (let leader = 0; leader < leaderCount; leader += 1) {
      const yaw = (leader / leaderCount) * Math.PI * 2 + rng() * 1.2;
      const tilt = 0.10 + rng() * 0.14;
      const length = H * (0.42 + rng() * 0.16);
      const baseY = H * (0.50 + rng() * 0.10);
      const branch = new THREE.CylinderGeometry(0.035, 0.075, length, 5, 1);
      branch.translate(0, length / 2, 0);
      branch.rotateZ(tilt);
      branch.rotateY(yaw);
      branch.translate(0, baseY - length * 0.12, 0);
      _c.setHSL(0.08, 0.04, 0.72 + rng() * 0.10, THREE.SRGBColorSpace);
      trunkParts.push(paintFlat(branch, _c.clone(), 0.15));
    }
    const branchCount = (vr.nBr ?? 14) + ((rng() * 4) | 0);
    for (let index = 0; index < branchCount; index += 1) {
      const length = 0.9 + rng() * (H * 0.22);
      const tilt = 0.30 + rng() * 0.55;
      const yaw = rng() * Math.PI * 2;
      const baseY = H * (0.52 + rng() * 0.34);
      const branch = new THREE.CylinderGeometry(0.012, 0.040, length, 4, 1);
      branch.translate(0, length / 2, 0);
      branch.rotateZ(tilt);
      branch.rotateY(yaw);
      const branchBaseRadius = 0.035 + rng() * 0.025;
      const branchBaseX = -Math.cos(yaw) * branchBaseRadius;
      const branchBaseZ = Math.sin(yaw) * branchBaseRadius;
      branch.translate(branchBaseX, baseY, branchBaseZ);
      _c.setHSL(0.06, 0.06, 0.46 + rng() * 0.12, THREE.SRGBColorSpace);
      trunkParts.push(paintFlat(branch, _c.clone(), 0.3));
      if (rng() >= 0.6) continue;
      const forkLength = length * (0.45 + rng() * 0.3);
      const fork = new THREE.CylinderGeometry(0.008, 0.020, forkLength, 3, 1);
      fork.translate(0, forkLength / 2, 0);
      fork.rotateZ(tilt + (rng() - 0.3) * 0.7);
      fork.rotateY(yaw + (rng() - 0.5) * 1.1);
      const forkReach = Math.sin(tilt) * length * 0.9;
      fork.translate(
        branchBaseX - Math.cos(yaw) * forkReach,
        baseY + Math.cos(tilt) * length * 0.9,
        branchBaseZ + Math.sin(yaw) * forkReach,
      );
      _c.setHSL(0.06, 0.06, 0.50 + rng() * 0.12, THREE.SRGBColorSpace);
      trunkParts.push(paintFlat(fork, _c.clone(), 0.4));
    }
  };
  // r5: LEADER LIMBS — the trunk forks into 2-3 near-vertical leaders that
  // run into the crown (a real birch splits low), each pale-barked
  // upward branch lattice: thin forking limbs filling the crown ellipsoid —
  // the bare winter structure the critique asked for ("bare branch lattice")
  addBranchLattice();
  // twig-haze cards in an UPRIGHT ellipsoid (taller than wide): the crown
  // reads as a broom-shaped gauze around the branch lattice
  const cardParts: THREE.BufferGeometry[] = [];
  const cy = H * 0.74;
  const snow = pal.snow ?? 0;
  const nc = (snow > 0.01 ? 40 : 30) + ((rng() * 8) | 0);
  const hue0 = pal.cardHue ?? 0.08, sat0 = pal.cardSat ?? 0.06;
  const snowAnchors: Array<{ x: number; y: number; z: number; w: number; dy: number }> = [];
  for (let i = 0; i < nc; i++) {
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = Math.pow(0.3 + 0.7 * rng(), 0.8);
    const w = (snow > 0.01 ? 1.05 : 1.25) + rng() * 0.75;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    // snow load: cards on the UPPER crown hemisphere whiten + brighten
    const sk = snow * Math.max(0, dy) * (0.6 + rng() * 0.4);
    const px = dx * rad * crw, py = cy + dy * rad * H * 0.26, pz = dz * rad * crw;
    cardParts.push(foliageCard(w, w * 1.05, px, py, pz,
      _e, (0.9 + rng() * 0.3) * (1 + sk * 0.35),
      hue0 + (0.585 - hue0) * sk, sat0 * (1 - sk * 0.8) + 0.02 * sk, 0.45, 0, cy, 0));
    if (dy > 0.15) snowAnchors.push({ x: px, y: py, z: pz, w, dy });
  }
  // small BRANCH-RIDING snow lobes on the upper twig masses only — rime
  // clumps following the structure, no monolithic parasol cap
  const addSnowLobes = (): void => {
    for (const a of snowAnchors) {
      if (rng() > snow * (0.20 + a.dy * 0.45)) continue;
      const lr = a.w * (0.16 + rng() * 0.10);
      const lobe = new THREE.IcosahedronGeometry(lr, 0);
      jitterRadial(lobe, rng, 0.35);
      lobe.scale(1.5 + rng() * 0.5, 0.40, 0.85 + rng() * 0.3);
      lobe.rotateY(rng() * Math.PI * 2);
      sphereNormals(lobe, 0, 0, 0, 1.15);
      lobe.translate(a.x, a.y + lr * 0.28, a.z);
      _c.setHSL(0.585, 0.05, 0.60, THREE.SRGBColorSpace).multiplyScalar(1.55);
      trunkParts.push(paintFlat(lobe, _c.clone(), 0.10));
    }
  };
  if (snow > 0.01) addSnowLobes();
  const trunk = mergeParts(trunkParts);
  trunk.userData.trunkQuality = {
    family: 'birch', radialSegments: 10, verticalSegments: 5,
    rootButtresses: 4, organicWarp: true,
  };
  return { trunk, cards: mergeParts(cardParts) };
}

/** Deterministic near-trunk geometry used by the strict visual/shape audit. */
export function buildTreeTrunkAuditGeometry(
  species: TreeSpecies,
  seed = 0x71ee,
): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const archetype = TREE_ARCHETYPES[species];
  if (archetype.family === 'conifer') {
    const geometry = buildPineTrunk(rng);
    const scale = TREE_GEOMETRY_SCALE[species];
    geometry.scale(scale[0], scale[1], scale[2]);
    return geometry;
  }
  if (archetype.family === 'palm') return buildPalmGeometry(rng).trunk;
  if (archetype.family === 'birch') {
    const geometry = buildBirchGeometry(rng).trunk;
    const scale = TREE_GEOMETRY_SCALE[species];
    geometry.scale(scale[0], scale[1], scale[2]);
    return geometry;
  }
  return buildBroadleafTrunk(rng, {
    cy: archetype.canopyCenterM,
    rx: archetype.canopyRadiusM,
    ry: Math.max(1.1, archetype.canopyRadiusM * 0.62),
    rz: archetype.canopyRadiusM,
    trunkH: archetype.trunkHeightM,
  });
}

// --- far-LOD trees: OPAQUE canopy lobes (no alpha cards). Beyond ~260 m the
// card mips would resolve to solid rectangles; opaque jittered lobes give
// clean massed silhouettes for ridgelines and the rim forest instead. ---

function jitterRadial(
  geo: THREE.BufferGeometry,
  rng: RandomSource,
  amount: number,
): THREE.BufferGeometry {
  const pos = attribute(geo, 'position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (Math.hypot(x, z) > 1e-4) {
      const f = 1 + (rng() - 0.5) * 2 * amount;
      pos.setX(i, x * f); pos.setZ(i, z * f);
      pos.setY(i, pos.getY(i) + (rng() - 0.5) * amount * 0.8);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// Sphere-project the normals of a canopy lobe (centered on cx/cy/cz, in the
// geometry's local space) with an up-bias, mirroring the near-LOD foliage
// cards: the crown lights as one smooth sunlit volume instead of a shattered
// pile of self-shadowing face normals. Call BEFORE translating the lobe.
function sphereNormals(
  geo: THREE.BufferGeometry,
  cx: number,
  cy: number,
  cz: number,
  upBias: number,
): THREE.BufferGeometry {
  const pos = attribute(geo, 'position'), nrm = attribute(geo, 'normal');
  for (let i = 0; i < pos.count; i++) {
    _v3.set(pos.getX(i) - cx, (pos.getY(i) - cy) * 0.7, pos.getZ(i) - cz);
    if (_v3.lengthSq() < 1e-6) _v3.set(0, 1, 0);
    _v3.normalize();
    _v3.y += upBias;
    _v3.normalize();
    nrm.setXYZ(i, _v3.x, _v3.y, _v3.z);
  }
  return geo;
}

// vertical light gradient + speckle baked into vertex colours
function paintCanopy(
  geo: THREE.BufferGeometry,
  hue: number,
  sat: number,
  l0: number,
  l1: number,
  y0: number,
  y1: number,
  rng: RandomSource,
  flexTop: number,
): THREE.BufferGeometry {
  const pos = attribute(geo, 'position');
  const col = new Float32Array(pos.count * 3);
  const fl = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const t = clamp((pos.getY(i) - y0) / (y1 - y0), 0, 1);
    _c.setHSL(hue + (rng() - 0.5) * 0.02, sat, (l0 + (l1 - l0) * t) * (0.9 + rng() * 0.2), THREE.SRGBColorSpace);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    fl[i] = t * flexTop;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
  return geo;
}

// Far builders return { trunk, canopy } so the canopy can use its own lit
// material (no shadow reception, boosted sky ambient) — the old single-mesh
// bark material rendered canopies as near-black shattered shards at 8x zoom.
function buildOakFarGeometry(
  rng: RandomSource,
  pal: VegetationPalette = {},
  fvi = 0,
): FarTreeGeometryPair {
  const cp = pal.canopy || {};
  const hue = cp.hue ?? 0.24, sat = cp.sat ?? 0.30, l0 = cp.l0 ?? 0.235, l1 = cp.l1 ?? 0.36;
  const trunkParts: THREE.BufferGeometry[] = [], canopyParts: THREE.BufferGeometry[] = [];
  // r3: far variant 1 is a taller, narrower crown (matches the near
  // columnar shape) so distant stands mix two silhouettes
  const tallF = fvi === 1 ? 1.28 : 1.0, wideF = fvi === 1 ? 0.78 : 1.0;
  const trunkH = fvi === 1 ? 3.6 : 2.9;
  // r6: thicker far trunk (0.20/0.36 -> 0.32/0.55) — sub-pixel trunks at
  // 400 m+ vanished and rim-forest crowns read as floating saucers
  const trunk = new THREE.CylinderGeometry(0.32, 0.55, trunkH, 5, 1);
  trunk.translate(0, trunkH / 2, 0);
  _c.setHSL(0.07, 0.26, 0.23, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(trunk, _c, 0));
  const addCanopyLobe = (index: number): void => {
    const big = index === 0
      ? 1
      : (index < 3 ? 0.62 + rng() * 0.32 : 0.30 + rng() * 0.26);
    const blob = new THREE.IcosahedronGeometry((1.25 + rng() * 0.6) * big, 0);
    jitterRadial(blob, rng, index < 3 ? 0.34 : 0.46);
    blob.scale(
      (1.1 + rng() * 0.3) * wideF,
      (0.72 + rng() * 0.25) * tallF,
      (1.1 + rng() * 0.3) * wideF,
    );
    sphereNormals(blob, 0, 0, 0, 1);
    const spread = (index < 3 ? 2.2 : 3.4) * wideF;
    blob.translate(
      (rng() - 0.5) * spread,
      (4.15 + (rng() - 0.45) * 1.7 - (1 - big) * 0.7
        + (index >= 3 ? rng() * 0.9 : 0)) * (fvi === 1 ? 1.18 : 1),
      (rng() - 0.5) * spread,
    );
    canopyParts.push(paintCanopy(
      blob, hue, sat, l0 * 0.82, l1, 2.3, 5.9 * tallF, rng, 0.3,
    ));
  };
  // 6-8 unequal lobes with strong offsets (r5, up from 4-5): broken
  // asymmetric broadleaf mass with satellite tufts poking off the crown so
  // the silhouette carries card-like raggedness even at range, with a deeper
  // shade gradient bottom -> crown
  const nLobes = 6 + ((rng() * 3) | 0);
  for (let b = 0; b < nLobes; b++) {
    // PERF (performance_budget r3): icosa detail 1 -> 0 on every far-LOD
    // canopy lobe. These lobes render ONLY beyond TREE_NEAR_IN (260 m), where
    // a whole crown is 15-40 px tall — after jitterRadial + sphereNormals the
    // 20-face silhouette is indistinguishable from the 80-face one at that
    // size, and the far-canopy pool was 1.9 M tris/frame of the 8.6 M total
    // (r7 forested-hills planting multiplied the far-tree count). Measured on
    // the m1a2/verdant probe battle: far-canopy pool 1.92 M -> 0.53 M.
    addCanopyLobe(b);
  }
  return { trunk: mergeParts(trunkParts), canopy: mergeParts(canopyParts) };
}

function buildPineFarGeometry(
  rng: RandomSource,
  pal: VegetationPalette = {},
): FarTreeGeometryPair {
  const cp = pal.canopy || {};
  const hue = cp.hue ?? 0.315, sat = cp.sat ?? 0.26, l0 = cp.l0 ?? 0.215, l1 = cp.l1 ?? 0.33;
  const trunkParts: THREE.BufferGeometry[] = [], canopyParts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.40, 2.2, 5, 1); // r6: see oak far trunk
  trunk.translate(0, 1.1, 0);
  _c.setHSL(0.06, 0.28, 0.19, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(trunk, _c, 0));
  // r7: randomized tier count/placement + deeper jitter — the fixed 3-tier
  // table stamped the same lathe-perfect stacked-cone silhouette on every
  // instance ("dozens of identical stacked cones" critique)
  const nTier = 3 + ((rng() * 2) | 0);
  const baseY = 1.2 + rng() * 0.5;
  const topYf = 5.6 + rng() * 0.9;
  for (let ti = 0; ti < nTier; ti++) {
    const tt = ti / (nTier - 1);
    const y = baseY + (topYf - baseY) * tt * (0.9 + rng() * 0.2) - 0.5;
    const r = ((1 - tt) * 1.35 + 0.45) * (0.8 + rng() * 0.45);
    const h = 1.6 + (1 - tt) * 1.2 + rng() * 0.5;
    // PERF (performance_budget r3): 8x2 closed cone -> 7x1 open cone (40 ->
    // 21 tris). The base cap is never visible from gameplay camera heights
    // and the tier stack hides the lost height ring; jitter keeps the
    // silhouette ragged. See the oak-lobe decimation note above.
    const cone = new THREE.ConeGeometry(r, h, 7, 1, true);
    jitterRadial(cone, rng, 0.36);
    sphereNormals(cone, 0, h * -0.25, 0, 0.75); // radial+up: lit side / sky-filled side
    cone.translate((rng() - 0.5) * 0.55, y + h / 2, (rng() - 0.5) * 0.55);
    canopyParts.push(paintCanopy(cone, hue, sat, l0, l1, 1.2, 6.6, rng, 0.35));
  }
  // r5: a few branch-tuft satellites poking through the tier line so the far
  // pine silhouette is ragged like the near card LOD, not a lathe object
  for (let b = 0; b < 4; b++) {
    const a = rng() * Math.PI * 2, ty = 1.8 + rng() * 3.4;
    const t = (ty - 1.2) / 5.4;
    const rr = (1.0 - t) * 1.5 + 0.35;
    const tuft = new THREE.IcosahedronGeometry(0.38 + rng() * 0.3, 0);
    jitterRadial(tuft, rng, 0.4);
    tuft.scale(1.3, 0.7, 1.3);
    sphereNormals(tuft, 0, 0, 0, 0.85);
    tuft.translate(Math.cos(a) * rr, ty, Math.sin(a) * rr);
    canopyParts.push(paintCanopy(tuft, hue, sat, l0, l1, 1.2, 6.6, rng, 0.3));
  }
  return { trunk: mergeParts(trunkParts), canopy: mergeParts(canopyParts) };
}

function buildPalmFarGeometry(
  rng: RandomSource,
  pal: VegetationPalette = {},
  fvi = 0,
): FarTreeGeometryPair {
  // The old far palm was a straight pole + one flat jittered disc — at
  // establishing distance whole oases read as glitched grey scaffolding
  // topped with green starbursts. Rebuilt: gently curved tapered trunk and a
  // crown of ARCHED drooping frond blades around a dome core, so the range
  // silhouette matches the near LOD's real palm shape.
  const cp = pal.canopy || {};
  const trunkParts: THREE.BufferGeometry[] = [], canopyParts: THREE.BufferGeometry[] = [];
  // r3: far variants differ in height/lean/gauge like the near set — every
  // far cluster used to repeat one silhouette at mid/far distance
  const H = fvi === 0 ? 5.3 : 6.9;
  const rfMul = fvi === 0 ? 1.3 : 1.05;
  const leanA = rng() * Math.PI * 2;
  const lean = (fvi === 0 ? 0.75 : 0.4) + rng() * 0.4; // total top offset in meters
  const NSEG = 3;
  let px = 0, pz = 0;
  for (let i = 0; i < NSEG; i++) {
    const t0 = i / NSEG, t1 = (i + 1) / NSEG;
    const x0 = Math.cos(leanA) * lean * t0 * t0, z0 = Math.sin(leanA) * lean * t0 * t0;
    const x1 = Math.cos(leanA) * lean * t1 * t1, z1 = Math.sin(leanA) * lean * t1 * t1;
    const segLen = Math.hypot(H / NSEG, x1 - x0, z1 - z0) * 1.04;
    const seg = new THREE.CylinderGeometry(
      (0.13 + (1 - t1) * 0.11) * rfMul, (0.15 + (1 - t0) * 0.11) * rfMul, segLen, 5, 1);
    seg.rotateZ(-Math.atan2(x1 - x0, H / NSEG));
    seg.rotateY(-leanA);
    seg.translate((x0 + x1) / 2, (t0 + t1) * 0.5 * H, (z0 + z1) / 2);
    _c.setHSL(0.074, 0.28, 0.37 + (i % 2) * 0.05, THREE.SRGBColorSpace);
    trunkParts.push(paintFlat(seg, _c.clone(), t1 * 0.15));
    px = x1; pz = z1;
  }
  // crown core: dome where the frond bases overlap. r9: MUCH bigger (0.62 ->
  // 1.15 radius, wider squash) — at 300+ m the blades are sub-pixel and the
  // core is all that survives; a real date-palm crown reads as a ~3 m fluffy
  // mass, and the tiny r8 core left only a spiky star (the "glitched
  // scaffolding" establishing-shot read)
  const core = new THREE.IcosahedronGeometry(1.15, 0); // PERF r3: far-LOD detail 0 (see oak note)
  jitterRadial(core, rng, 0.28);
  core.scale(1.35, 0.62, 1.35);
  sphereNormals(core, 0, 0, 0, 1.2);
  core.translate(px, H + 0.1, pz);
  canopyParts.push(paintCanopy(core, cp.hue ?? 0.232, cp.sat ?? 0.30,
    (cp.l0 ?? 0.21) * 0.85, cp.l1 ?? 0.33, H - 0.5, H + 0.6, rng, 0.25));
  // dead-frond skirt: a ring of drooping khaki mass under the crown — the
  // second value the range silhouette needs so it reads palm, not asterisk
  const skirt = new THREE.IcosahedronGeometry(0.85, 0); // PERF r3: far-LOD detail 0 (see oak note)
  jitterRadial(skirt, rng, 0.3);
  skirt.scale(1.25, 0.45, 1.25);
  sphereNormals(skirt, 0, 0, 0, 0.7);
  skirt.translate(px, H - 0.45, pz);
  canopyParts.push(paintCanopy(skirt, 0.10, 0.20, 0.20, 0.30, H - 0.9, H + 0.1, rng, 0.2));
  // radial arched fronds: bent tapered blades that rise, arc over and droop —
  // the star-of-fronds crown a real palm shows at range (opaque planes; the
  // far canopy material is DoubleSide for exactly this builder)
  const nF = 10 + ((rng() * 3) | 0); // r5 TE: match the near crown — few BIG fronds
  // r6: UNEVEN frond fan — the equal-angle equal-length blades rendered every
  // far palm as the same radial asterisk (critique); wider azimuth jitter,
  // 2:1 length spread and per-blade droop variance break the star symmetry
  for (let k = 0; k < nF; k++) {
    const a = (k / nF) * Math.PI * 2 + rng() * 0.9;
    const len = 2.7 + rng() * 2.1;
    const phi0 = 0.45 + rng() * 0.7;            // launch angle up from horizontal
    const phiTip = -(0.70 + rng() * 0.80);      // tip droops well below horizontal
    // PERF r3: 4 -> 3 height segments — the arc solver below keeps the
    // rise/droop curve; one fewer bend row is invisible at 260 m+.
    const g = new THREE.PlaneGeometry(1, 1, 1, 3);
    const p = attribute(g, 'position');
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) + 0.5; // 0..1 along the frond
      // r9: blades widened ~40% — sub-pixel blades were the starburst tell
      const w = (1.0 - t * 0.62) * (1.55 + rng() * 0.25); // taper to the tip
      let ry = 0, rf = 0;
      const steps = 8, dl = (len * t) / steps;
      for (let sIt = 0; sIt < steps; sIt++) {
        const tt = ((sIt + 0.5) / steps) * t;
        const ph = phi0 + (phiTip - phi0) * tt * tt;
        rf += Math.cos(ph) * dl;
        ry += Math.sin(ph) * dl;
      }
      p.setXYZ(i, p.getX(i) * w, ry, rf);
    }
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(a));
    g.translate(px, H + 0.14, pz);
    // outward+up sky-lit normals, matching the near-LOD frond treatment
    const nrm = attribute(g, 'normal');
    _v3.set(Math.sin(a) * 0.5, 1.25, Math.cos(a) * 0.5).normalize();
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, _v3.x, _v3.y, _v3.z);
    canopyParts.push(paintCanopy(g, (cp.hue ?? 0.232) + (rng() - 0.5) * 0.02,
      cp.sat ?? 0.32, cp.l0 ?? 0.21, cp.l1 ?? 0.35, H - 1.4, H + 1.5, rng, 0.4));
  }
  return { trunk: mergeParts(trunkParts), canopy: mergeParts(canopyParts) };
}

function buildBirchFarGeometry(
  rng: RandomSource,
  pal: VegetationPalette = {},
): FarTreeGeometryPair {
  const cp = pal.canopy || {};
  const trunkParts: THREE.BufferGeometry[] = [], canopyParts: THREE.BufferGeometry[] = [];
  const H = 5.4;
  const trunk = new THREE.CylinderGeometry(0.06, 0.16, H, 5, 1);
  trunk.translate(0, H / 2, 0);
  _c.setHSL(0.09, 0.04, 0.82, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(trunk, _c, 0));
  // r5: real winter birch crowns are a broken haze of twig masses around
  // upward branches, not 2 lobes on a pole — 4-5 lobes + branch cylinders
  const nBr = 4 + ((rng() * 2) | 0);
  for (let b = 0; b < nBr; b++) {
    const len = 1.6 + rng() * 1.4;
    const br = new THREE.CylinderGeometry(0.02, 0.06, len, 4, 1);
    br.translate(0, len / 2, 0);
    br.rotateZ(0.35 + rng() * 0.55);
    br.rotateY(rng() * Math.PI * 2);
    br.translate(0, H * (0.55 + rng() * 0.35), 0);
    _c.setHSL(0.08, 0.06, 0.55 + rng() * 0.1, THREE.SRGBColorSpace);
    trunkParts.push(paintFlat(br, _c.clone(), 0.25));
  }
  // r9: more lobes, lifted default luminance (0.16/0.26 -> 0.26/0.38) — far
  // birch crowns minified to near-black ink blots against the snowfield
  // r4 terrain_environment: narrower, TALLER lobes (0.9 -> 0.72 xz, 1.35 ->
  // 1.6 y) — the squat round caps read as "grey poles with blue-white
  // mushroom-cap blobs" (winter critique); a birch crown is an upright
  // broom-shaped twig mass. Pairs with the far-canopy edge erosion.
  for (let b = 0; b < 5 + ((rng() * 3) | 0); b++) {
    const blob = new THREE.IcosahedronGeometry(0.65 + rng() * 0.45, 0); // PERF r3: far-LOD detail 0
    jitterRadial(blob, rng, 0.45);
    blob.scale(0.72, 1.6 + rng() * 0.5, 0.72);
    sphereNormals(blob, 0, 0, 0, 1.0);
    blob.translate((rng() - 0.5) * 2.1, H * 0.74 + (rng() - 0.4) * 1.7, (rng() - 0.5) * 2.1);
    canopyParts.push(paintCanopy(blob, cp.hue ?? 0.06, cp.sat ?? 0.07,
      cp.l0 ?? 0.26, cp.l1 ?? 0.38, H * 0.4, H, rng, 0.35));
  }
  return { trunk: mergeParts(trunkParts), canopy: mergeParts(canopyParts) };
}

// squat card clump for hedgerow/field bushes.
// r2 terrain_environment: the roadside shrubs were the loudest "flat acrylic
// splat" tell at 10-40 m — more, smaller cards (16 vs 11) for a ragged
// silhouette, a LOW normal up-bias (0.75) so the sides of the clump actually
// shade around the volume, a deeper core->rim AO ramp, and a vertical
// understory gradient so the skirt sits dark against the lit crown.
function buildBushCards(rng: RandomSource, pal: VegetationPalette = {}): THREE.BufferGeometry {
  const hue0 = pal.cardHue ?? 0.24, sat0 = pal.cardSat ?? 0.26;
  const parts: THREE.BufferGeometry[] = [];
  const cy = 0.55;
  for (let i = 0; i < 16; i++) {
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = Math.pow(0.3 + 0.7 * rng(), 0.8);
    const w = 0.72 + rng() * 0.55;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    const vGrad = 0.78 + 0.42 * clamp(dy * 0.5 + 0.5, 0, 1); // lit top, shaded skirt
    const shade = (0.34 + 0.62 * rad) * vGrad * (0.9 + rng() * 0.2);
    parts.push(foliageCard(w, w * 0.8, dx * rad * 0.85, cy + dy * rad * 0.38, dz * rad * 0.85,
      _e, shade, hue0 + (rng() - 0.5) * 0.055, sat0 + rng() * 0.06, 0.22, 0, cy, 0, 0.75, 0.45));
  }
  return mergeParts(parts);
}

/**
 * Build one static battlefield tree kit. Browser Garages use the same branched,
 * alpha-carded near-tree geometry seen in battle because their groves begin at
 * roughly 30 m; headless audits retain the opaque far silhouette so tests never
 * need a DOM canvas. Both paths are immutable and instanced by the Garage.
 */
export function createGarageTreeKit(
  engineCtx: GarageTreeEngineContext,
  cfg: VegetationMapConfig | null,
  species: Species,
  seed = 2001,
  variant = 0,
): GarageTreeKit {
  const palettes = cfg?.vegetation?.palettes || {};
  const k = ((variant % 3) + 3) % 3;
  const archetype = TREE_ARCHETYPES[species];
  const palette = palettes[species]
    || (archetype.family === 'conifer' ? palettes.pine : undefined)
    || (archetype.family === 'birch' ? palettes.birch : undefined)
    || (archetype.family === 'palm' ? palettes.palm : palettes.oak)
    || {};
  const detailed = typeof document !== 'undefined';
  let trunk: THREE.BufferGeometry;
  let foliage: THREE.BufferGeometry;
  let foliageTexture: THREE.CanvasTexture | null = null;
  if (detailed) {
    let pair: TreeGeometryPair;
    switch (archetype.family) {
      case 'conifer': {
        const scale = TREE_GEOMETRY_SCALE[species];
        pair = {
          trunk: buildPineTrunk(mulberry32(seed + 61 + k * 101), palette),
          cards: buildPineCards(mulberry32(seed + 63 + k * 101), 0.60, 1, palette),
        };
        pair.trunk.scale(scale[0], scale[1], scale[2]);
        pair.cards.scale(scale[0], scale[1], scale[2]);
        foliageTexture = makeNeedleSprayTexture(mulberry32(seed + 52), palette.texTone || null);
        break;
      }
      case 'palm':
        pair = buildPalmGeometry(mulberry32(seed + 81 + k * 101), palette, {
          h0: 4.7 + k * 0.85, hr: 1.15, rMul: 1.30 - k * 0.14,
          lean0: 0.42 + k * 0.12, leanR: 0.45,
        });
        foliageTexture = makePalmFrondTexture(mulberry32(seed + 53), palette.texTone || null);
        break;
      case 'birch': {
        pair = buildBirchGeometry(mulberry32(seed + 85 + k * 101), palette, {
          h0: 4.8 + k * 1.15, hr: 1.15, crw: 1.25 + k * 0.28, nBr: 12 + k * 2,
        });
        const scale = TREE_GEOMETRY_SCALE[species];
        pair.trunk.scale(scale[0], scale[1], scale[2]);
        pair.cards.scale(scale[0], scale[1], scale[2]);
        foliageTexture = makeTwigTexture(mulberry32(seed + 54), palette.texTone || null);
        break;
      }
      default: {
        const shape: BroadleafShape = {
          cy: archetype.canopyCenterM,
          rx: archetype.canopyRadiusM,
          ry: Math.max(1.15, archetype.fallHeightM - archetype.canopyCenterM),
          rz: archetype.canopyRadiusM * (0.88 + k * 0.08),
          trunkH: archetype.trunkHeightM,
        };
        pair = {
          trunk: buildBroadleafTrunk(mulberry32(seed + 65 + k * 101), shape),
          cards: buildBroadleafCards(
            mulberry32(seed + 67 + k * 101), 36 + k * 4, 1, palette, shape,
          ),
        };
        foliageTexture = makeLeafClusterTexture(mulberry32(seed + 51), palette.texTone || null);
        break;
      }
    }
    trunk = pair.trunk;
    foliage = pair.cards;
  } else {
    let pair: FarTreeGeometryPair;
    switch (archetype.family) {
      case 'conifer': {
        pair = buildPineFarGeometry(mulberry32(seed + 71 + k * 101), palette);
        const radial = archetype.canopyRadiusM / TREE_ARCHETYPES.pine.canopyRadiusM;
        pair.trunk.scale(radial, archetype.fallHeightM / TREE_ARCHETYPES.pine.fallHeightM, radial);
        pair.canopy.scale(radial, archetype.fallHeightM / TREE_ARCHETYPES.pine.fallHeightM, radial);
        break;
      }
      case 'palm':
        pair = buildPalmFarGeometry(mulberry32(seed + 75 + k * 101), palette, k % 2);
        break;
      case 'birch': {
        pair = buildBirchFarGeometry(mulberry32(seed + 77 + k * 101), palette);
        const radial = archetype.canopyRadiusM / TREE_ARCHETYPES.birch.canopyRadiusM;
        pair.trunk.scale(radial, archetype.fallHeightM / TREE_ARCHETYPES.birch.fallHeightM, radial);
        pair.canopy.scale(radial, archetype.fallHeightM / TREE_ARCHETYPES.birch.fallHeightM, radial);
        break;
      }
      default: {
        pair = buildOakFarGeometry(mulberry32(seed + 73 + k * 101), palette, k % 2);
        const radial = archetype.canopyRadiusM / TREE_ARCHETYPES.oak.canopyRadiusM;
        pair.trunk.scale(radial, archetype.fallHeightM / TREE_ARCHETYPES.oak.fallHeightM, radial);
        pair.canopy.scale(radial, archetype.fallHeightM / TREE_ARCHETYPES.oak.fallHeightM, radial);
        break;
      }
    }
    trunk = pair.trunk;
    foliage = pair.canopy;
  }
  const trunkMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0,
  });
  const foliageMaterial = new THREE.MeshStandardMaterial({
    map: foliageTexture,
    alphaTest: detailed ? 0.38 : 0,
    alphaToCoverage: detailed,
    side: detailed || species === 'palm' ? THREE.DoubleSide : THREE.FrontSide,
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  foliageMaterial.envMapIntensity = 0.85;
  engineCtx.setupShadowMaterial?.(trunkMaterial);
  engineCtx.setupShadowMaterial?.(foliageMaterial);
  return {
    species,
    trunk,
    foliage,
    trunkMaterial,
    foliageMaterial,
    detailTier: detailed ? 'battlefield-near' : 'battlefield-far',
    dispose() {
      trunk.dispose();
      foliage.dispose();
      foliageTexture?.dispose();
      trunkMaterial.dispose();
      foliageMaterial.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// createVegetation
// ---------------------------------------------------------------------------

/**
 * Create instanced grass and trees with GPU wind.
 * @param {object} heightField HeightField from terrain.createHeightField
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {number} [seed=2001] vegetation seed
 * @param {?object} [cfg=null] map config (uses cfg.vegetation); null = classic verdant set
 * @returns {{group:THREE.Group, update:function(number,THREE.Vector3):void,
 *   setWindTime:function(number):void, treeObstacles:Array<{min:number[],max:number[]}>}}
 */
export function createVegetation(
  heightField: HeightField,
  engineCtx: EngineContext,
  seed = 2001,
  cfg: VegetationMapConfig | null = null,
): VegetationRuntime {
  const g = vegetationBuildSteps(heightField, engineCtx, seed, cfg, false);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/**
 * perf-r3 (play-session probe): chunked twin of {@link createVegetation} —
 * the one-call build was a single ~2.1 s task behind the loading bar. Awaits
 * `tick(done, total)` between sections (grass carpet, tree prep, each tree
 * placement pass, root decals, bushes) so the loading screen keeps painting.
 * Byte-identical output: both wrappers drain the same generator, same rng
 * draw order.
 * @param {?function(number, number): (Promise<void>|void)} tick
 */
export async function createVegetationAsync(
  heightField: HeightField,
  engineCtx: EngineContext,
  seed = 2001,
  cfg: VegetationMapConfig | null = null,
  tick: ((done: number, total: number) => Promise<void> | void) | null = null,
  fineSlices = false,
): Promise<VegetationRuntime> {
  // Async map loads only need the complete grass ring around their first
  // spawn. Deterministic outer chunks are beyond the shader fade band and
  // stream a full chunk ahead of the camera afterward. Synchronous capture
  // builds still drain every chunk eagerly for their frozen pixel contract.
  const g = vegetationBuildSteps(heightField, engineCtx, seed, cfg, true);
  const stageTimings: Record<string, number> = {};
  let stepStarted = performance.now();
  let r = g.next();
  const recordStep = (result: IteratorResult<BuildYield, VegetationRuntime>): void => {
    const key = result.done ? 'finalize' : (result.value.stage || 'other');
    stageTimings[key] = (stageTimings[key] || 0) + performance.now() - stepStarted;
  };
  recordStep(r);
  let i = 0;
  // Fine builds include per-species texture and geometry boundaries. The
  // exact count varies with the biome, so this is an upper-bound progress
  // denominator; createMapAsync advances to the next canonical stage when
  // the generator completes.
  const total = fineSlices ? 160 : 16;
  while (!r.done) {
    const shouldTick = fineSlices || !r.value || !r.value.fine || r.value.rowEnd;
    if (tick && shouldTick) await tick(++i, total);
    stepStarted = performance.now();
    r = g.next();
    recordStep(r);
  }
  r.value._buildDetail = Object.fromEntries(
    Object.entries(stageTimings).map(([key, ms]) => [key, Math.round(ms)]));
  return r.value;
}

function* vegetationBuildSteps(
  heightField: HeightField,
  engineCtx: EngineContext,
  seed: number,
  cfg: VegetationMapConfig | null,
  deferFarGrass: boolean,
): Generator<BuildYield, VegetationRuntime, void> {
  const mobileTier = getDeviceTier() === 'mobile';
  // Phone screens cannot resolve the alpha-card density used by desktop in
  // the midfield; it aliases into crawling grain while spending millions of
  // vertices. Hand off earlier to the terrain meadow and the opaque far-tree
  // silhouettes. Both transitions already use continuous density/LOD fades,
  // so this removes sub-pixel noise without introducing a distance pop.
  const grassFadeEnd = mobileTier ? 132 : GRASS_FADE_END;
  const grassTaperEnd = mobileTier ? 112 : 155;
  const treeNearIn = mobileTier ? 200 : TREE_NEAR_IN;
  const treeNearOut = mobileTier ? 225 : TREE_NEAR_OUT;
  const veg: VegetationConfig = {
    species: ['pine', 'oak'],
    clusterMix: [['pine', 0.55], ['oak', 0.45]],
    loneMix: [['pine', 0.5], ['oak', 0.5]],
    rimMix: [['pine', 0.7], ['oak', 0.3]],
    clusterCount: 46, loneCount: 95, rimCount: 58,
    grassDensity: 1, bushCount: 1, bushSpecies: 'oak',
    grassTexTone: null, tuftTone: null, parks: null, palettes: {},
    avoid: null, // [{x,z,r}] — no vegetation discs (e.g. establishing-camera foreground)
    ...((cfg && cfg.vegetation) || {}),
  };
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'vegetation';
  const L = heightField._layout;
  const v = L.village;
  const noVeg = heightField._noVeg || (() => false);
  const grassPerChunk = Math.round(GRASS_PER_CHUNK * veg.grassDensity
    * (mobileTier ? 0.62 : 1));
  const carpetPerCell = Math.round(CARPET_PER_CELL * veg.grassDensity
    * (mobileTier ? 0.72 : 1));

  const uWindTime = { value: 0 };
  const uCamPos = { value: new THREE.Vector3(0, 0, 0) };
  // gameplay_feel r2: camera->tank occlusion-fade focus point (y=-9999 = off)
  const uFocusPos = { value: new THREE.Vector3(0, -9999, 0) };
  // Sniper near-grass suppression (0 = arcade, 1 = sniper): with the camera at
  // the gun trunnion, meter-tall blades otherwise flood the lower half of the
  // scope. WoT hides near grass in sniper mode by default — fade tufts inside
  // ~15 m of the camera while the rig is in SNIPER. Eased over ~0.1 s in
  // update() so mode switches don't pop.
  const uSniperFade = { value: 0 };
  let sniperFadeTarget = 0;
  // HIGH-ZOOM SCOPE HARD-CUT (controls_gunnery r4): at x4/x8 the screen-door
  // dither of the scope-corridor fade magnifies into a full-frame halftone
  // stipple (the r3 critic's "blanketed in dither"). Below ~15° FOV the
  // corridor fade goes BINARY — faded fragments discard cleanly, kept ones
  // render full-opacity — so the zoomed sight picture is crisp edge to edge.
  const uScopeHard = { value: 0 };
  // SCOPE CORRIDOR LENGTH (controls_gunnery r5): how far along the scope ray
  // the foliage cull reaches, in meters. Driven from the live server-aim
  // distance (rig.aimDist) through setSniperFade — the r4 corridor died at a
  // fixed 40-70 m, so any bush 100-320 m out on the sight line still blinded
  // the x4/x8 scope (r5 critique: target IS-2 100% hidden at 320 m).
  const uScopeDist = { value: 70 };
  // Camera forward (unit) — drives the sniper center-cone grass clear-out.
  const uCamFwd = { value: new THREE.Vector3(0, 0, 1) };

  // ---- grass materials (shared hook, per-material fade distance) ----
  const grassWindHook = (farDist: number): MaterialShaderHook => (shader: MaterialShader): void => {
    shader.uniforms.uWindTime = uWindTime;
    shader.uniforms.uCamPos = uCamPos;
    shader.uniforms.uGrassFar = { value: farDist };
    shader.uniforms.uSniperFade = uSniperFade;
    shader.uniforms.uCamFwd = uCamFwd;
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nuniform float uWindTime;\nuniform vec3 uCamPos;\nuniform float uGrassFar;\nuniform float uSniperFade;\nuniform vec3 uCamFwd;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      {
        vec4 giw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float dCam = distance(giw.xyz, uCamPos);
        // wide scale-out band (last ~45% of the range): tufts shrink away
        // gradually instead of cutting to flat albedo on a visible line
        // (r3: 0.66 -> 0.56 — a longer ease so blade height falls off with
        // distance instead of ending in a readable band edge)
        float gfade = 1.0 - smoothstep(uGrassFar * 0.56, uGrassFar, dCam);
        // sniper scope (WoT keeps the scoped picture clean): the trunnion-
        // height camera stares OVER meter-tall blades, so the old 7-15 m
        // suppression still let midfield grass flood 30-60% of the sight at
        // x2-x8. Widen the near band to 30 m AND clear a center cone — blades
        // within ~3-6 m of the view ray out to ~90 m shrink away; off-axis
        // and far grass keeps the meadow context around the scope edges.
        float nearBand = smoothstep(12.0, 30.0, dCam);
        float dRay = length(cross(giw.xyz - uCamPos, uCamFwd));
        float rayBand = 1.0 - (1.0 - smoothstep(2.6, 6.0, dRay)) * (1.0 - smoothstep(90.0, 130.0, dCam));
        gfade *= mix(1.0, nearBand * rayBand, uSniperFade);
        transformed *= gfade;
        float sway = uv.y * uv.y;
        float phase = giw.x * 0.35 + giw.z * 0.28;
        transformed.x += sway * (0.12 * sin(uWindTime * 1.6 + phase) + 0.05 * sin(uWindTime * 3.7 + phase * 2.3));
        transformed.z += sway * 0.08 * cos(uWindTime * 1.3 + phase);
      }`);
    useAttributeNormal(shader);
    mipAlphaGuard(shader); // aa-r1: distance-stable blade coverage
  };

  // Two single-segment crossed cards are sufficient for grass-scale parallax.
  // The old three 2-segment cards cost 12 triangles per tuft; this costs four
  // and also avoids the overly busy blade volume the user was seeing.
  function makeTuftGeometry(
    w: number,
    h: number,
    planeCount = 2,
    widthScale = 1.12,
  ): THREE.BufferGeometry {
    const planes: THREE.BufferGeometry[] = [];
    for (let k = 0; k < planeCount; k++) {
      const p = new THREE.PlaneGeometry(w * widthScale, h, 1, 1);
      p.translate(0, h / 2 - 0.03, 0);
      p.rotateY((k / 2) * Math.PI);
      planes.push(p);
    }
    const geo = mergeGeometries(planes, false) as THREE.BufferGeometry;
    const nrm = attribute(geo, 'normal');
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    return geo;
  }

  // Far tufts collapse to one wider plane. At this range their alpha
  // silhouette supplies the entire read, so a crossed second plane is waste.
  const makeTuftFarGeometry = (w: number, h: number): THREE.BufferGeometry =>
    makeTuftGeometry(w, h, 1, 1.5);

  const grassTex: THREE.CanvasTexture[] = [];
  grassTex.push(makeGrassCardTexture(mulberry32(seed + 41), 0, veg.grassTexTone));
  yield { stage: 'grassPrep', fine: true };
  grassTex.push(makeGrassCardTexture(mulberry32(seed + 42), 1, veg.grassTexTone));
  yield { stage: 'grassPrep', fine: true };
  function makeGrassMaterial(
    tex: THREE.Texture,
    farDist: number,
    cacheKey: string,
  ): THREE.MeshLambertMaterial {
    // Lambert is materially cheaper for a rough, non-metallic alpha card and
    // preserves the lighting/shadow response that is actually visible here.
    const mat = new THREE.MeshLambertMaterial({
      map: tex, alphaTest: 0.44, alphaToCoverage: true, side: THREE.DoubleSide,
    });
    engineCtx.setupShadowMaterial(mat, grassWindHook(farDist));
    mat.customProgramCacheKey = () => cacheKey;
    return mat;
  }
  const grassVariants: Array<{
    geo: THREE.BufferGeometry;
    geoFar: THREE.BufferGeometry;
    matMid: THREE.MeshLambertMaterial;
    matNear: THREE.MeshLambertMaterial;
  }> = [];
  function* buildGrassVariants(): Generator<BuildYield, void, void> {
    for (let gv = 0; gv < 2; gv++) {
      // r7: taller tuft cards (0.60/0.48 -> 0.74/0.58) — WoT-scale near grass
      // must clearly break the ground plane beside the tracks, not read as a
      // 2 cm moss carpet
      const w = gv === 0 ? 0.92 : 1.14, h = gv === 0 ? 0.74 : 0.58;
      grassVariants.push({
        geo: makeTuftGeometry(w, h),
        geoFar: makeTuftFarGeometry(w, h), // performance_budget r5 (see builder)
        matMid: makeGrassMaterial(grassTex[gv], grassFadeEnd, 'world-grass-wind-v6'),
        matNear: makeGrassMaterial(grassTex[gv], CARPET_FAR, 'world-grass-carpet-v6'),
      });
      yield { stage: 'grassPrep', fine: true };
    }
  }
  yield* buildGrassVariants();

  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _qLean = new THREE.Quaternion();
  const _axLean = new THREE.Vector3();
  const _pv = new THREE.Vector3();
  const _sv = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);

  // shared placement filter/tint for a tuft candidate; returns null or
  // [x, y, z, yaw, sxz, sy, r, g, b, variant].
  // PERF (GC): the returned array is a REUSED module scratch — callers must
  // copy the values out (slice() at init time, flat-pack for carpet cells)
  // before calling makeTuft again. This ran hot enough to top the allocation
  // profile while driving (new carpet cells stream in as the camera moves).
  const _tuftScratch = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const _tuftScaleScratch = [1, 1];
  // Map-wide scatter evaluates this field hundreds of thousands of times.
  // Reuse the result record so those reads stay allocation-free.
  const _splatScratch = { n1: 0, n2: 0, mA: 0 };
  // r5 terrain_environment: map-authored no-vegetation discs (desert uses one
  // to keep the establishing camera's foreground frame edge clear — a squat
  // palm sat clipped at the bottom-left of battlefield_desert.png)
  function inAvoid(x: number, z: number): boolean {
    if (!veg.avoid) return false;
    for (const av of veg.avoid) {
      if (Math.hypot(x - av.x, z - av.z) < av.r) return true;
    }
    return false;
  }
  function terrainDryness(
    x: number,
    z: number,
    roll: number,
    carpet: boolean,
  ): number {
    if (noVeg(x, z)) return -1;
    const groundType = heightField.getGroundType(x, z);
    if (groundType === 'hard' || heightField._roadDist(x, z) < 4.2) return -1;
    if (groundType === 'soft' && roll > 0.3) return -1;
    if (heightField._villageMask(x, z) > 0.35
      && roll > (carpet ? 0.35 : 0.15)) return -1;
    return groundType === 'soft' ? 0.5 : 0;
  }
  function rejectDenseScatter(
    splat: ReturnType<typeof sampleSplatNoise>,
    dirtPatch: number,
    roll: number,
    clusterRoll: number,
    carpet: boolean,
  ): boolean {
    if (dirtPatch > 0.55 && roll < (carpet ? 0.4 : 0.75)) return true;
    return !carpet && splat.n1 < 0.34 && clusterRoll > 0.25 + splat.n1;
  }
  function resolveTuftScale(
    splat: ReturnType<typeof sampleSplatNoise>,
    clusterRoll: number,
    roll: number,
    variantRoll: number,
  ): boolean {
    _tuftScaleScratch[0] = 1;
    _tuftScaleScratch[1] = 1;
    if (veg.grassDensity >= 0.5) return true;
    const biome = smoothstepJs(0.42, 0.70, splat.n2);
    const thicket = smoothstepJs(0.44, 0.78, splat.n1);
    const clump = biome * (0.12 + 0.88 * thicket);
    if (clusterRoll > clump * 0.97 + 0.03) return false;
    _tuftScaleScratch[0] = 0.5 + clump * 0.85 + roll * 0.7;
    _tuftScaleScratch[1] = Math.min(1.35, 0.55 + clump * 0.65 + variantRoll * 0.55);
    return true;
  }
  function makeTuft(
    x: number,
    z: number,
    crng: RandomSource,
    carpet: boolean,
  ): number[] | null {
    if (Math.max(Math.abs(x), Math.abs(z)) > 474) return null;
    if (inAvoid(x, z)) return null;
    const roll = crng(), yaw = crng() * Math.PI * 2;
    const sxz = 0.74 + crng() * 0.62;
    let sy = 0.55 + crng() * 0.85;
    const hueJ = crng(), lumJ = crng(), varJ = crng(), clJ = crng();
    let dry = terrainDryness(x, z, roll, carpet);
    if (dry < 0) return null;
    if (dry > 0) sy *= 1.5;
    // splat-aware thinning: drier + thinner on dirt patches, dense in meadows
    const sn = sampleSplatNoise(x, z, _splatScratch);
    // (thresholds track the shader's `worn` band — r4: 0.55/0.80 + warp)
    const dirtPatch = smoothstepJs(0.55, 0.80, sn.n2 + (sn.n1 - 0.5) * 0.45);
    if (dirtPatch > 0.35 && clJ < dirtPatch * 0.9) dry = Math.max(dry, 0.55);
    // r7: carpet cull 0.6 -> 0.4 — the near dirt patches punched hard bald
    // holes in the hero grass ring and the exposed albedo read as "flat
    // mottled texture up to the tracks"; keep them THINNER, not bare
    if (rejectDenseScatter(sn, dirtPatch, roll, clJ, carpet)) return null;
    // sparse-biome ecology (desert scrub / winter litter): confetti-uniform
    // scatter reads as noise dots — gate placement behind a low-frequency
    // mask so growth clusters in hollows and along moisture lines, with only
    // stray outliers between the clumps
    if (!resolveTuftScale(sn, clJ, roll, varJ)) return null;
    const sxzMul = _tuftScaleScratch[0], syMul = _tuftScaleScratch[1];
    // PERF (performance_budget r6): slope test LAST — it is the expensive
    // predicate (4 heightAt samples for the central-difference normal) and
    // every cull above it is pure math over (x, z, the 8 pre-drawn rng
    // values). All 8 rng draws happen unconditionally at the top of this
    // function, so test ORDER cannot shift the rng stream: exactly the same
    // candidate set is accepted with exactly the same appearance — the
    // rejected majority just stops paying the 4-sample normal probe
    // (measured: 1.26 M candidates per boot on verdant).
    if (heightField.getNormalAt(x, z).y < 0.78) return null;
    const vv = varJ < (0.75 - dry * 0.5) ? 0 : 1;
    const y = heightField.getHeightAt(x, z);
    // toned to sit on the terrain grass albedo so the far scale-out is
    // invisible (tufts must NOT read brighter than the ground they stand on)
    // r2: per-tuft variance REDUCED (hue 0.075 -> 0.05, lum 0.19 -> 0.12)
    // and a low-frequency meadow unifier keyed to the shared splat field —
    // adjacent tufts now drift together like one sward instead of the
    // radioactive lime-vs-dark confetti the critique flagged
    let th = 0.225 + (hueJ - 0.5) * 0.05 - dry * 0.08;
    let ts = 0.30 - dry * 0.11;
    let tl = 0.44 + (lumJ - 0.5) * 0.12 + (sn.n2 - 0.5) * 0.10 + dry * 0.04;
    // r6 terrain_environment: MEADOW PATCHWORK on the blades themselves. The
    // splat shader stamps 50-200 m dry-straw fields (meadowA -> uTintA), but
    // the 0-40 m carpet buried them under uniformly-green tufts — the "one
    // saturated green across the entire map" critique. sn.mA is the CPU twin
    // of that shader field: tufts standing on a dry patch swing toward
    // yellow-brown straw, so the patchwork reads at every distance.
    const dryPatch = smoothstepJs(0.54, 0.85, sn.mA);
    th -= dryPatch * 0.075;
    ts *= 1 - dryPatch * 0.30;
    tl += dryPatch * 0.05;
    if (veg.tuftTone) [th, ts, tl] = veg.tuftTone(th, ts, tl);
    _c.setHSL(((th % 1) + 1) % 1, clamp(ts, 0, 1), clamp(tl, 0, 1));
    const t = _tuftScratch;
    // r2: midfield (non-carpet) tufts run ~15% wider — see the cull note
    // above (r3: 1.15 -> 1.28, coverage where the carpet hands over)
    t[0] = x; t[1] = y - 0.03; t[2] = z; t[3] = yaw;
    t[4] = sxz * sxzMul * (carpet ? 1 : 1.28); t[5] = sy * syMul;
    t[6] = _c.r; t[7] = _c.g; t[8] = _c.b; t[9] = vv;
    return t;
  }

  // write a tuft stored at offset o of an indexable array (flat-packed cells)
  function writeTuftAt(
    mesh: THREE.InstancedMesh,
    i: number,
    t: MutableNumberArray,
    o: number,
  ): void {
    // This is a yaw-only transform. Writing its column-major matrix/color
    // directly avoids Quaternion/Vector/Matrix method traffic for every one
    // of the hundreds of thousands of grass instances while producing the
    // same transform as Matrix4.compose(position, yawQuaternion, scale).
    const yaw = t[o + 3], sn = Math.sin(yaw), cs = Math.cos(yaw);
    const sxz = t[o + 4], sy = t[o + 5];
    const ma = mesh.instanceMatrix.array, mi = i * 16;
    ma[mi] = cs * sxz; ma[mi + 1] = 0; ma[mi + 2] = -sn * sxz; ma[mi + 3] = 0;
    ma[mi + 4] = 0; ma[mi + 5] = sy; ma[mi + 6] = 0; ma[mi + 7] = 0;
    ma[mi + 8] = sn * sxz; ma[mi + 9] = 0; ma[mi + 10] = cs * sxz; ma[mi + 11] = 0;
    ma[mi + 12] = t[o]; ma[mi + 13] = t[o + 1]; ma[mi + 14] = t[o + 2]; ma[mi + 15] = 1;
    if (!mesh.instanceColor) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(mesh.instanceMatrix.count * 3), 3);
    }
    const ca = mesh.instanceColor.array, ci = i * 3;
    ca[ci] = t[o + 6]; ca[ci + 1] = t[o + 7]; ca[ci + 2] = t[o + 8];
  }
  yield { stage: 'grassPrep' }; // perf-r3: yield before scatter
  // ---- midfield grass scatter (map-wide chunks, unchanged system) ----
  interface GrassChunkMesh {
    mesh: THREE.InstancedMesh;
    total: number;
    geoNear: THREE.BufferGeometry;
    geoFar: THREE.BufferGeometry;
  }
  interface GrassBuildState {
    crng: RandomSource;
    candidate: number;
    counts: [number, number];
  }
  interface GrassChunk {
    ix: number;
    iz: number;
    x0: number;
    z0: number;
    cx: number;
    cz: number;
    meshes: GrassChunkMesh[] | null;
    built: boolean;
    job: GrassBuildState | null;
    lod: boolean;
    cameraDist?: number;
  }
  const grassChunks: GrassChunk[] = [];
  // Each accepted tuft used to become a standalone 10-number JS Array via
  // slice(), then die immediately after its chunk's instance buffers were
  // written. Across the 64 chunks that is hundreds of thousands of tiny
  // allocations and a large young-generation GC bill. Two reusable flat
  // Float64 buffers retain the exact numeric values/output while making the
  // entire staging pass allocation-free per tuft.
  const midTuftScratch = [
    new Float64Array(grassPerChunk * 10),
    new Float64Array(grassPerChunk * 10),
  ];
  let grassBuildJob: GrassChunk | null = null;
  function beginGrassChunk(gc: GrassChunk): void {
    grassBuildJob = gc;
    gc.job = {
      crng: mulberry32((seed ^ (gc.ix * 73856093) ^ (gc.iz * 19349663)) >>> 0),
      candidate: 0,
      counts: [0, 0],
    };
  }
  function advanceGrassChunk(gc: GrassChunk, candidateBudget: number): boolean {
    if (!gc.job) beginGrassChunk(gc);
    const job = gc.job!;
    const end = Math.min(grassPerChunk, job.candidate + candidateBudget);
    for (; job.candidate < end; job.candidate++) {
      const t = makeTuft(
        gc.x0 + job.crng() * CHUNK_SIZE,
        gc.z0 + job.crng() * CHUNK_SIZE,
        job.crng, false);
      if (t) {
        const vv = t[9];
        midTuftScratch[vv].set(t, job.counts[vv] * 10);
        job.counts[vv]++;
      }
    }
    if (job.candidate < grassPerChunk) return false;

    const chunkMeshes: GrassChunkMesh[] = [];
    for (let vv = 0; vv < 2; vv++) {
      const count = job.counts[vv];
      if (count === 0) continue;
      const mesh = new THREE.InstancedMesh(
        grassVariants[vv].geo, grassVariants[vv].matMid, count);
      for (let i = 0; i < count; i++) {
        writeTuftAt(mesh, i, midTuftScratch[vv], i * 10);
      }
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      // The instances in this mesh never move and belong to one 128 m map
      // chunk. Preserve the radial density/LOD policy in update(), but also
      // let Three reject complete chunks behind the camera. The old global
      // opt-out submitted every in-range chunk, including the rear
      // hemisphere, which could double midfield grass triangles without
      // contributing a pixel. Compute the conservative full-count sphere
      // once; later prefix-count density changes remain safely inside it.
      mesh.computeBoundingSphere();
      mesh.frustumCulled = true;
      mesh.visible = false;
      mesh.matrixAutoUpdate = false;
      mesh.userData.aoExclude = true; // GTAO override prepass ignores alphaTest
      group.add(mesh);
      chunkMeshes.push({
        mesh, total: count,
        geoNear: grassVariants[vv].geo,
        geoFar: grassVariants[vv].geoFar,
      });
    }
    gc.meshes = chunkMeshes;
    gc.built = true;
    gc.job = null;
    if (grassBuildJob === gc) grassBuildJob = null;
    return true;
  }
  const spawn = L.spawns.player;
  const initialGrassRadius = grassFadeEnd + CHUNK_SIZE * 0.71 + 32;
  function* buildGrassChunks(): Generator<BuildYield, void, void> {
    for (let cz = 0; cz < CHUNKS; cz++) {
      for (let cx = 0; cx < CHUNKS; cx++) {
        const x0 = -HALF + cx * CHUNK_SIZE, z0 = -HALF + cz * CHUNK_SIZE;
        const gc = {
          ix: cx, iz: cz, x0, z0,
          cx: x0 + CHUNK_SIZE / 2,
          cz: z0 + CHUNK_SIZE / 2,
          meshes: null, built: false, job: null, lod: false,
        };
        grassChunks.push(gc);
        // Synchronous screenshot builds retain the exact eager path. Async map
        // builds create the complete first-view ring; no rendered tuft/count/
        // placement changes, only when invisible distant chunks are generated.
        if (!deferFarGrass || Math.hypot(spawn.x - gc.cx, spawn.z - gc.cz) < initialGrassRadius) {
          beginGrassChunk(gc);
          advanceGrassChunk(gc, grassPerChunk);
        }
        yield { stage: 'grassScatter', fine: true, rowEnd: cx === CHUNKS - 1 };
      }
    }
  }
  yield* buildGrassChunks();

  yield { stage: 'grassScatter' };
  // ---- near grass carpet (camera-centred, dense, cell-cached) ----
  // PERF (performance_budget r5): DOUBLE-BUFFERED. A rebuild used to
  // bufferSubData 3.9 MB into the instance buffers the GPU was still reading
  // — on ANGLE's Metal backend that is a fence wait, profiled at 22-224 ms
  // per rebuild while driving (the certification p99/p1 killer). Each rebuild
  // now writes the INACTIVE mesh pair (idle for >=180 ms, no in-flight
  // references, so the upload is a plain memcpy) and flips visibility. Ranged
  // uploads keep the transfer at the live prefix, not the 52 k cap.
  interface CarpetSet {
    meshes: [THREE.InstancedMesh, THREE.InstancedMesh];
    active: number;
  }
  const carpetSets: CarpetSet[] = []; // per variant: { meshes: [a, b], active: 0 }
  const _zeroScaleM4 = new THREE.Matrix4().makeScale(0, 0, 0);
  function createCarpetSets(): void {
    for (let vv = 0; vv < 2; vv++) {
      const pair: THREE.InstancedMesh[] = [];
      for (let half = 0; half < 2; half++) {
        const mesh = new THREE.InstancedMesh(grassVariants[vv].geo, grassVariants[vv].matNear, CARPET_CAP);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        // boot with ONE zero-scale instance visible: an invisible mesh never
        // reaches WebGLAttributes.update, so its 3.3 MB GPU buffer would
        // otherwise be created by the FIRST in-battle flip — a one-shot
        // bufferData hitch inside the certification window. Zero scale
        // rasterizes nothing; the first real rebuild overwrites slot 0.
        mesh.count = 1;
        mesh.visible = true;
        mesh.setMatrixAt(0, _zeroScaleM4);
        mesh.matrixAutoUpdate = false;
        mesh.userData.aoExclude = true; // GTAO override prepass ignores alphaTest
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // allocate instanceColor now
        mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
        group.add(mesh);
        pair.push(mesh);
      }
      carpetSets.push({ meshes: pair as [THREE.InstancedMesh, THREE.InstancedMesh], active: 0 });
    }
  }
  createCarpetSets();
  // PERF (GC): each cached cell is ONE flat Float32Array (10 floats per tuft)
  // instead of ~a hundred small JS arrays — cell streaming while driving was
  // the top per-frame allocation source in the heap profile.
  const carpetCache = new Map<string, Float32Array>(); // "ix,iz" -> Float32Array (len = 10 * count)
  const _cellScratch = new Float32Array(1024 * 10); // packs one cell before sizing
  function carpetCell(ix: number, iz: number): Float32Array {
    const key = ix + ',' + iz;
    let cell = carpetCache.get(key);
    if (cell) return cell;
    const crng = mulberry32((seed ^ 0x51ab ^ (ix * 374761393) ^ (iz * 668265263)) >>> 0);
    const x0 = ix * CARPET_CELL, z0 = iz * CARPET_CELL;
    let n = 0;
    for (let i = 0; i < carpetPerCell; i++) {
      const t = makeTuft(x0 + crng() * CARPET_CELL, z0 + crng() * CARPET_CELL, crng, true);
      if (t && (n + 1) * 10 <= _cellScratch.length) {
        t[4] *= 0.96; t[5] *= 1.04; // r7: near carpet no longer shrunk — it is the hero grass
        _cellScratch.set(t, n * 10);
        n++;
      }
    }
    cell = _cellScratch.slice(0, n * 10);
    carpetCache.set(key, cell);
    if (carpetCache.size > 420) {
      const oldestKey = carpetCache.keys().next().value;
      if (oldestKey !== undefined) carpetCache.delete(oldestKey);
    }
    return cell;
  }
  let _carpetCellX = 0x7fffffff;
  let _carpetCellZ = 0x7fffffff;
  function rebuildCarpet(camPos: THREE.Vector3): void {
    const cix = Math.floor(camPos.x / CARPET_CELL), ciz = Math.floor(camPos.z / CARPET_CELL);
    const counts = [0, 0];
    // write into the inactive half of each variant's A/B pair (see above)
    const targets = [
      carpetSets[0].meshes[1 - carpetSets[0].active],
      carpetSets[1].meshes[1 - carpetSets[1].active],
    ];
    for (let dz = -CARPET_RING; dz <= CARPET_RING; dz++) {
      for (let dx = -CARPET_RING; dx <= CARPET_RING; dx++) {
        const cell = carpetCell(cix + dx, ciz + dz);
        for (let o = 0; o < cell.length; o += 10) {
          const vv = cell[o + 9];
          if (counts[vv] >= CARPET_CAP) continue;
          writeTuftAt(targets[vv], counts[vv]++, cell, o);
        }
      }
    }
    for (let vv = 0; vv < 2; vv++) {
      const set = carpetSets[vv];
      const fresh = targets[vv];
      const stale = set.meshes[set.active];
      fresh.count = counts[vv];
      fresh.visible = counts[vv] > 0;
      // upload only the written prefix — the 52 k cap is rarely full
      fresh.instanceMatrix.clearUpdateRanges();
      fresh.instanceMatrix.addUpdateRange(0, counts[vv] * 16);
      fresh.instanceMatrix.needsUpdate = true;
      if (fresh.instanceColor) {
        fresh.instanceColor.clearUpdateRanges();
        fresh.instanceColor.addUpdateRange(0, counts[vv] * 3);
        fresh.instanceColor.needsUpdate = true;
      }
      // A never-filled half holds only the boot zero-scale instance (draws
      // nothing) — LEAVE it visible so its GPU buffers get created by the
      // next rendered frame instead of by its first mid-battle flip.
      if (stale.userData.carpetFilled) stale.visible = false;
      fresh.userData.carpetFilled = true;
      set.active = 1 - set.active;
    }
  }

  yield { stage: 'grassCarpet' };
  // ---- trees ----
  // Every tree material carries the per-instance occlusion fade (aFadeI,
  // 0 = solid → 1 = dithered to ~12%) plus a near-camera dissolve: WoT fades
  // any tree standing between the chase camera and the vehicle — without it,
  // forest routes hide the player tank behind full-screen canopy walls, and
  // cards inside the orbit radius degrade to giant flat unlit sheets.
  // camo_spotting r3: per-hook near-camera dissolve — trunks keep the tight
  // 1.5-4.2 m band (a trunk 5 m away SHOULD block the view), CANOPY fragments
  // (leaf cards + far-LOD lobes) dissolve out to ~8 m so the in-clump chase
  // camera is never smothered by unfaded sheets.
  // r2: wrap is now an AMOUNT (0 = off). Trunks get a moderate 0.30 wrap so
  // the bark terminator rolls off softly instead of the hard two-tone
  // lit/shadow split the critique flagged; canopy keeps the strong 0.62.
  // fullFade (was keyed off wrap) controls the occlusion-fade keep floor.
  const makeTreeWindHook = (
    nearD0: number,
    nearD1: number,
    wrap = 0,
    fullFade = false,
  ): MaterialShaderHook => (shader: MaterialShader): void => {
    shader.uniforms.uWindTime = uWindTime;
    // SNIPER SCOPE CORRIDOR (controls_gunnery r3): while scoped, EVERY tree
    // part (trunk, near cards, far canopy — this hook is shared by all of
    // them, and foliageWindHook chains through it for leaf cards + bushes)
    // crossing a ~4.5 m radius cylinder along the scope ray for the first
    // ~60 m dithers down to a 0.16 keep-floor. WoT fades intervening crowns
    // in sniper mode; without this, leaf cards and trunks 5-60 m out walled
    // off the whole sight picture (a locked 415 m target was 100% invisible).
    shader.uniforms.uCamPos = uCamPos;
    shader.uniforms.uCamFwd = uCamFwd;
    shader.uniforms.uSniperFade = uSniperFade;
    shader.uniforms.uScopeHard = uScopeHard;
    shader.uniforms.uScopeDist = uScopeDist; // r5: corridor length = aim dist
    shader.uniforms.uFocusPos = uFocusPos;   // r2: occlusion-fade sight capsule
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nuniform float uWindTime;\nuniform vec3 uCamPos;\nuniform vec3 uCamFwd;\nuniform float uSniperFade;\nuniform float uScopeDist;\nuniform vec3 uFocusPos;\nattribute float aFlex;\nattribute float aFadeI;\nattribute float aLodF;\nvarying float vLodF;\nvarying float vFadeI;\nvarying float vScopeKeep;\nvarying float vTDRay;\nvarying float vTAlong;\nvarying float vDSeg;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      {
        vec4 tiw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float ph = tiw.x * 0.043 + tiw.z * 0.051;
        float amp = aFlex * 0.14;
        transformed.x += amp * (sin(uWindTime * 1.15 + ph) + 0.45 * sin(uWindTime * 2.63 + ph * 1.7));
        transformed.z += amp * 0.7 * cos(uWindTime * 0.97 + ph * 1.3);
        vec4 tvw = instanceMatrix * vec4(transformed, 1.0);
        // gameplay_feel r2: occlusion fade only near the camera->tank sight
        // capsule — canopy crossing open sky stays solid (no dither
        // curtains smearing crowns half-off the sight line). uFocusPos.y is
        // parked at -9999 while the corridor is off, zeroing the fade.
        // gameplay_feel r7 (round critique MAJOR "screen-door dither
        // corridor"): the gate is now a CONE, pinched at the camera (0.55 m)
        // and opening to hull-silhouette width (2.8 m) at the tank, with a
        // 2 m feather. The old constant 3–6.5 m cylinder classified
        // everything within 6.5 m of the CAMERA end as "on the sight line" —
        // under perspective that is most of the frame, so whole near
        // canopies dithered as full-height checkerboard swathes while
        // driving woods (b_drive_mid evidence). A fragment now fades only if
        // it actually overlaps the camera->hull silhouette cone.
        {
          vec3 seg = uFocusPos - uCamPos;
          float segL2 = dot(seg, seg);
          float tt = segL2 > 1e-4 ? clamp(dot(tvw.xyz - uCamPos, seg) / segL2, 0.0, 1.0) : 0.0;
          float dSeg = length(tvw.xyz - (uCamPos + seg * tt));
          float coneR = mix(0.55, 2.8, tt);
          vFadeI = aFadeI * (1.0 - smoothstep(coneR, coneR + 2.0, dSeg));
          vDSeg = dSeg; // gameplay_feel r5: fragment keep-floor near the sight capsule
        }
        // aa-r1 LOD cross-fade: unlike aFadeI (sight-capsule gated above),
        // the per-instance LOD fade applies unconditionally — repartition
        // dissolves the near representation in/out through the same stable
        // IGN dither instead of popping it at the 260/290 m band.
        vLodF = aLodF;
        // sniper scope-ray corridor keep (per vertex — tall trunks fade only
        // where they actually cross the sight line)
        vec3 tRel = tvw.xyz - uCamPos;
        float tAlong = dot(tRel, uCamFwd);
        float tDRay = length(tRel - uCamFwd * max(tAlong, 0.0));
        // >>> gameplay_feel r4 / controls_gunnery r5: FULL suppression inside
        // the aiming corridor. The r4 corridor culled canopy within ~5.5 m of
        // the scope ray but only for the first 40-70 m along it — a bush
        // sitting at 100-320 m on the sight line still hid an aimed-at,
        // SPOTTED target completely (r5 critique: IS-2 at 320 m, 100% blind
        // x4 scope). The corridor now runs the whole way to the server-aim
        // distance (uScopeDist, from rig.aimDist): near foliage keeps the
        // wide 5.5-9 m clearance, far foliage narrows to a 2.5-5 m tunnel so
        // long shots open a scope-sized window instead of carving a canyon
        // through the forest. Composes with the fragment-side uScopeHard
        // high-zoom binary cut: keep 0 discards under both.
        float tBand = smoothstep(30.0, 60.0, tAlong);
        float tCorr = 1.0 - (1.0 - smoothstep(mix(5.5, 2.5, tBand),
                                              mix(9.0, 5.0, tBand), tDRay))
                          * (1.0 - smoothstep(uScopeDist, uScopeDist + 30.0, tAlong));
        vScopeKeep = mix(1.0, tCorr, uSniperFade);
        // gameplay_feel r5: carry the ray metrics to the fragment stage so
        // the corridor EDGES can be feathered per fragment (the per-vertex
        // vScopeKeep quantized the dissolve into card-sized hard columns);
        // vScopeKeep stays as a cheap early-out.
        vTDRay = tDRay;
        vTAlong = tAlong;
        // <<< gameplay_feel r4 / controls_gunnery r5
      }`);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\nuniform float uScopeHard;\nuniform float uSniperFade;\nuniform float uScopeDist;\nvarying float vLodF;\nvarying float vFadeI;\nvarying float vScopeKeep;\nvarying float vTDRay;\nvarying float vTAlong;\nvarying float vDSeg;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <alphatest_fragment>', /* glsl */`
      #include <alphatest_fragment>
      {
        // camera-occlusion fade (per-instance) + near-camera card dissolve
        // + sniper scope corridor. Screen-space dither keeps the opaque/
        // alpha-tested pipeline (depth writes stay correct — no sorting,
        // no blend halos).
        // gameplay_feel r5: canopy fades FULLY (WoT fades the whole occluder
        // corridor — the old 0.12 keep-floor stippled a haze over the tank);
        // trunks keep the 12% ghost so the forest still reads.
        float fadeKeep = 1.0 - ${fullFade ? '1.0' : '0.88'} * vFadeI;
        fadeKeep *= smoothstep(${nearD0.toFixed(2)}, ${nearD1.toFixed(2)}, length(vViewPosition));
        // aa-r1 LOD cross-fade share (repartition transition, see update()):
        // rides the same IGN dissolve below — stable per-pixel pattern, no
        // per-frame reseeding, exactly the killcam/scope-corridor grammar.
        fadeKeep = min(fadeKeep, 1.0 - vLodF);
        // gameplay_feel r5 (round critique minor): re-evaluate the corridor
        // smoothsteps PER FRAGMENT from the interpolated ray metrics — the
        // vertex-quantized vScopeKeep made whole cards share one keep value,
        // dissolving the corridor in hard-edged card-sized COLUMNS. The
        // vertex value stays as a cheap early-out.
        float scopeKeepF = 1.0;
        if (vScopeKeep < 0.999) {
          float fBand = smoothstep(30.0, 60.0, vTAlong);
          float fCorr = 1.0 - (1.0 - smoothstep(mix(5.5, 2.5, fBand),
                                                mix(9.0, 5.0, fBand), vTDRay))
                            * (1.0 - smoothstep(uScopeDist, uScopeDist + 30.0, vTAlong));
          scopeKeepF = mix(1.0, fCorr, uSniperFade);
        }
        fadeKeep = min(fadeKeep, scopeKeepF);
        ${fullFade ? `
        // gameplay_feel r5: occlusion-fade keep FLOOR near the sight capsule
        // — canopy within ~2.2 m of the camera->tank sight ray discards
        // fully, so no half-dissolved speckle overlaps the player hull
        // silhouette when parked under a tree. r7: gate on vFadeI > 0.6
        // (deep inside the cone) instead of > 0.01 — with the pinched cone a
        // barely-fading fragment 2 m off the camera-end axis must not be
        // cut to a hard 2.2 m hole.
        if (vFadeI > 0.6 && vDSeg < 2.2) discard;` : ''}
        if (uScopeHard > 0.5) {
          // high-zoom scope (FOV <= 15°): dither magnified by the optics
          // reads as halftone stipple — cut binary instead (r4): corridor
          // foliage vanishes cleanly, everything else is full-opacity.
          if (fadeKeep < 0.55) discard;
        } else if (fadeKeep < 0.9995) {
          // gameplay_feel r5: interleaved-gradient-noise pair at TWO octaves
          // (fine + 3.7x coarser, 50/50) — the old pixel-scale white-noise
          // hash read as artifact speckle over large sheets at mid
          // keep-rates; the IGN mix has blue-ish spectral character.
          float d1 = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          float d2 = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy / 3.7), vec2(0.06711056, 0.00583715))));
          float dit = mix(d1, d2, 0.5);
          if (dit > fadeKeep) discard;
        }
      }`);
    // lighting_post r3: wrap-diffuse on canopy materials — crowns get a lit
    // side -> occluded interior ramp under the CSM sun instead of reading as
    // unshaded texture at distance. Cards carry canopy-outward normals.
    if (wrap > 0) {
      // r8: wrap 0.45 -> 0.62 — shadowed canopy undersides still crushed to
      // black paint in the chase view; the stronger wrap plays the leaf
      // translucency/skylight bounce a real crown skirt shows
      const w = wrap.toFixed(2);
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_physical_pars_fragment>',
        THREE.ShaderChunk.lights_physical_pars_fragment.replace(
          'float dotNL = saturate( dot( normal, directLight.direction ) );',
          `float dotNL = saturate( ( dot( normal, directLight.direction ) + ${w} ) / ${(1 + wrap).toFixed(2)} );`));
    }
  };
  const treeWindHook = makeTreeWindHook(1.5, 4.2, 0.30);          // trunks/bark
  const canopyWindHook = makeTreeWindHook(2.5, 8.0, 0.62, true);  // canopy sheets + cards
  const foliageWindHook = (shader: MaterialShader): void => {
    canopyWindHook(shader);
    useAttributeNormal(shader);
    // aa-r1: mip-aware alpha BEFORE the built-in alpha test / A2C smoothstep
    // (the canopyWindHook dissolve above keeps the <alphatest_fragment>
    // anchor, so this composes as: mip boost -> alpha test -> dissolve).
    mipAlphaGuard(shader);
    // SNIPER FOLIAGE FADE (controls_gunnery r2): WoT fades the bush the
    // player is scoped inside — screen-door-dither leaf fragments within
    // ~10 m of the camera while uSniperFade > 0 (same eased uniforms as the
    // grass suppression; zero cost in arcade mode where vFolKeep == 1.0).
    // The r3 scope-ray corridor lives in makeTreeWindHook (shared with trunks
    // and far canopies) — this hook only adds the inside-a-bush dissolve.
    // (uCamPos/uSniperFade uniforms + declarations already added upstream.)
    shader.uniforms.uCanopyDet = { value: canopyDetailTex };
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nvarying float vFolKeep;\nvarying vec3 vLeafW;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <project_vertex>', /* glsl */`
      {
        vec4 fiw = instanceMatrix * vec4(transformed, 1.0);
        vFolKeep = mix(1.0, smoothstep(4.0, 10.0, distance(fiw.xyz, uCamPos)), uSniperFade);
        vLeafW = fiw.xyz;
      }
      #include <project_vertex>`);
    // r6 terrain_environment CANOPY VOLUME SHADING — the two shading terms
    // that separate "flat card collage" from an AAA tree crown:
    //  (a) world-anchored leaf-clump value mottle shared by every card of a
    //      crown: neighbouring cards stop rendering as flat one-tone sheets
    //      and read as one continuous foliage mass with interior clumping;
    //  (b) VIEW-EDGE TRANSLUCENCY/RIM — fragments near the card silhouette
    //      (grazing |N.V|) lift toward a warm sun-through-leaves tone, the
    //      cheap stand-in for SSS/backlit foliage every modern engine ships.
    //      Keyed by the clump mottle so the rim sparkles at leaf scale
    //      instead of drawing a uniform halo outline.
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <map_fragment>', /* glsl */`
      #include <map_fragment>
      {
        float lA = texture2D(uCanopyDet, vLeafW.xz * 0.60).r;
        float lB = texture2D(uCanopyDet, vec2(vLeafW.x * 0.44 + 0.29, vLeafW.y * 0.60)).r;
        float leafM = lA * 0.6 + lB * 0.4;
        diffuseColor.rgb *= 0.78 + leafM * 0.46;
        float ndv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
        float rim = 1.0 - ndv;
        rim *= rim;
        // tint MULTIPLIES the card's own color: green crowns rim warm-green,
        // winter rime cards rim neutral-warm — no species-specific paths
        diffuseColor.rgb += diffuseColor.rgb * rim * (0.35 + leafM * 0.95) * vec3(0.60, 0.63, 0.40);
      }`);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying float vFolKeep;\nvarying vec3 vLeafW;\nuniform sampler2D uCanopyDet;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <alphatest_fragment>', /* glsl */`
      #include <alphatest_fragment>
      if (uScopeHard > 0.5) {
        if (vFolKeep < 0.55) discard; // r4: binary at high zoom — no stipple
      } else if (vFolKeep < 0.999) {
        // gameplay_feel r5: two-octave IGN (fine + 3.7x coarser, 50/50) —
        // matches the tree-hook dissolve so half-faded bushes stop reading
        // as pixel-scale white speckle.
        float fd1 = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        float fd2 = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy / 3.7), vec2(0.06711056, 0.00583715))));
        float fdit = mix(fd1, fd2, 0.5);
        if (fdit >= vFolKeep) discard;
      }`);
  };
  // r2: striated bark albedo+normal on every trunk/branch (see makeBarkTexture)
  // — vertex colors still carry the per-species tint, lifted ~1.35x below to
  // compensate for the ~0.72-mean map multiplying in.
  const barkTex = makeBarkTexture(seed + 97);
  const barkMat = new THREE.MeshStandardMaterial({
    map: barkTex.albedo, normalMap: barkTex.normal,
    vertexColors: true, roughness: 0.92, metalness: 0.0,
  });
  barkMat.normalScale.set(0.85, 0.85);
  barkMat.envMapIntensity = 0.85;
  engineCtx.setupShadowMaterial(barkMat, treeWindHook);
  barkMat.customProgramCacheKey = () => 'world-tree-bark-v7';
  yield { stage: 'treePrep', fine: true };

  // far canopy: own material — strong sky/env fill acts as the fake-SSS
  // backlight term so shaded crown sides stay green, never crushed black
  const canopyFarMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0.0 });
  // DoubleSide: the far palm crown is built from open arched frond blades —
  // FrontSide culled half of them at any azimuth (closed lobe canopies are
  // unaffected beyond a little overdraw)
  canopyFarMat.side = THREE.DoubleSide;
  canopyFarMat.envMapIntensity = 1.35;
  // r4 terrain_environment: the far-LOD lobes were SMOOTH-SHADED SOLIDS —
  // beyond 260 m every crown read as a "playdough broccoli" blob with a
  // clean round silhouette (the single loudest AAA failure in the critique).
  // Two fragment-side fixes on the shared far-canopy material:
  //  (a) world-space leaf-clump value mottle (biplanar, per-instance unique
  //      since it keys off world position) so the surface reads as massed
  //      foliage instead of smooth clay, and
  //  (b) VIEW-EDGE ALPHA EROSION — fragments near the silhouette (low
  //      |N·V|) discard where the clump noise runs light, so every crown
  //      edge breaks into leaf-scale raggedness instead of a vector-smooth
  //      lobe outline. Interior fragments (|N·V| high) never discard, so
  //      crowns stay solid masses with no see-through.
  const canopyDetailTex = (() => {
    const s = 128;
    const drng = mulberry32(seed + 913);
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = context2d(c);
    ctx.fillStyle = 'rgb(118,118,118)';
    ctx.fillRect(0, 0, s, s);
    for (let k = 0; k < 340; k++) { // wrapped soft leaf clumps -> tileable
      const x = drng() * s, y = drng() * s, r = 1.4 + drng() * 4.2;
      const l = (60 + drng() * 150) | 0;
      ctx.fillStyle = `rgba(${l},${l},${l},0.85)`;
      for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 2;
    return t;
  })();
  yield { stage: 'treePrep', fine: true };
  const farCanopyHook = (shader: MaterialShader): void => {
    canopyWindHook(shader);
    shader.uniforms.uCanopyDet = { value: canopyDetailTex };
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nvarying vec3 vCanW;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <project_vertex>',
      '{ vec4 cw4 = instanceMatrix * vec4(transformed, 1.0); vCanW = cw4.xyz; }\n#include <project_vertex>');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\nuniform sampler2D uCanopyDet;\nvarying vec3 vCanW;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <map_fragment>', /* glsl */`
      #include <map_fragment>
      {
        // ~0.9 m clump scale; two world-plane projections cover every face
        float lA = texture2D(uCanopyDet, vCanW.xz * 0.55).r;
        float lB = texture2D(uCanopyDet, vec2(vCanW.x * 0.41 + 0.37, vCanW.y * 0.55)).r;
        float leaf = lA * 0.6 + lB * 0.4;
        diffuseColor.rgb *= 0.74 + leaf * 0.56; // leaf-clump value breakup
        float ndv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
        // silhouette erosion: ragged leafy crown edges (interior untouched).
        // aa-r1: erosion now FADES OUT with view distance (full to 380 m,
        // gone by 540 m). The discard raggedness is leaf-scale — beyond
        // ~400 m it is sub-pixel, and the motion bursts showed the far
        // treeline crawling with per-frame discard sparkle (dark dot churn
        // on every lit lobe). Near the 260 m LOD-in edge the ragged
        // silhouette is untouched; at range crowns return to solid lobes,
        // which MSAA + the post AA stages hold perfectly stable.
        float eroW = 1.0 - smoothstep(380.0, 540.0, length(vViewPosition));
        if (leaf < (0.74 - ndv * 1.45) * eroW) discard;
      }`);
  };
  engineCtx.setupShadowMaterial(canopyFarMat, farCanopyHook);
  canopyFarMat.customProgramCacheKey = () => 'world-tree-canopyfar-v10';
  yield { stage: 'treePrep', fine: true };

  // r3 terrain_environment: SILHOUETTE variant tables. Every near/far
  // variant used to run the same builder with a different seed — same
  // proportions, so stands read as "the same 2-3 trees repeated". Broadleafs
  // now span round / tall-columnar / wide-spreading crowns; palms span
  // squat-thick / classic / tall-slender with matching trunk gauges.
  const OAK_SHAPES: Array<BroadleafShape & { n: number }> = [
    { cy: 4.35, rx: 2.35, ry: 1.75, rz: 2.35, trunkH: 3.1, n: 58 }, // round classic
    // r4: columnar crown widened + more cards (1.85/52 -> 2.05/62) — at the
    // frame edge the sparse narrow variant read as "a bare pole with a tiny
    // blob canopy" (player_view right edge, critique)
    { cy: 5.05, rx: 2.05, ry: 2.30, rz: 2.05, trunkH: 3.8, n: 62 }, // tall columnar
    { cy: 3.80, rx: 3.05, ry: 1.40, rz: 3.05, trunkH: 2.6, n: 66 }, // wide spreading
  ];
  const POPLAR_SHAPES: Array<BroadleafShape & { n: number }> = [
    { cy: 5.5, rx: 1.35, ry: 2.55, rz: 1.35, trunkH: 4.2, n: 56 },
    { cy: 6.0, rx: 1.15, ry: 2.85, rz: 1.15, trunkH: 4.7, n: 54 },
    { cy: 5.0, rx: 1.60, ry: 2.25, rz: 1.60, trunkH: 3.8, n: 60 },
  ];
  const WILLOW_SHAPES: Array<BroadleafShape & { n: number }> = [
    { cy: 3.55, rx: 3.55, ry: 1.30, rz: 3.55, trunkH: 2.4, n: 72 },
    { cy: 3.85, rx: 3.20, ry: 1.55, rz: 3.55, trunkH: 2.7, n: 72 },
    { cy: 3.30, rx: 3.85, ry: 1.15, rz: 3.45, trunkH: 2.2, n: 76 },
  ];
  const ACACIA_SHAPES: Array<BroadleafShape & { n: number }> = [
    { cy: 4.15, rx: 3.55, ry: 0.92, rz: 3.35, trunkH: 3.4, n: 62 },
    { cy: 4.55, rx: 3.15, ry: 1.05, rz: 3.65, trunkH: 3.8, n: 60 },
    { cy: 3.85, rx: 3.90, ry: 0.80, rz: 3.10, trunkH: 3.1, n: 64 },
  ];
  const EUCALYPTUS_SHAPES: Array<BroadleafShape & { n: number }> = [
    { cy: 6.0, rx: 1.55, ry: 2.50, rz: 1.55, trunkH: 4.8, n: 50 },
    { cy: 6.55, rx: 1.35, ry: 2.80, rz: 1.70, trunkH: 5.2, n: 48 },
    { cy: 5.55, rx: 1.85, ry: 2.15, rz: 1.45, trunkH: 4.4, n: 54 },
  ];
  const PALM_VAR: PalmVariant[] = [
    { h0: 4.5, hr: 1.0, rMul: 1.40, lean0: 0.72, leanR: 0.5 }, // squat, thick, leaning
    { h0: 5.6, hr: 1.4, rMul: 1.15, lean0: 0.50, leanR: 0.5 }, // classic (thicker)
    { h0: 7.0, hr: 1.6, rMul: 0.95, lean0: 0.32, leanR: 0.4 }, // tall slender
  ];
  // species registry: texture + near/far geometry builders, seed bases keep
  // the classic verdant set bit-identical to the pre-config build
  interface SpeciesDefinition {
    texSeed: number;
    nearSeed: number;
    farSeed: number;
    tex(rng: RandomSource, palette: VegetationPalette): THREE.CanvasTexture;
    near(index: number, palette: VegetationPalette): TreeGeometryPair;
    far(rng: RandomSource, palette: VegetationPalette, index: number): FarTreeGeometryPair;
  }
  function scaleNear(
    pair: TreeGeometryPair,
    x: number,
    y: number,
    z: number,
  ): TreeGeometryPair {
    pair.trunk.scale(x, y, z);
    pair.cards.scale(x, y, z);
    return pair;
  }
  function scaleFar(
    pair: FarTreeGeometryPair,
    x: number,
    y: number,
    z: number,
  ): FarTreeGeometryPair {
    pair.trunk.scale(x, y, z);
    pair.canopy.scale(x, y, z);
    return pair;
  }
  function coniferDefinition(
    texSeed: number,
    nearSeed: number,
    farSeed: number,
    scale: readonly [number, number, number],
  ): SpeciesDefinition {
    return {
      texSeed, nearSeed, farSeed,
      tex: (r, pal) => makeNeedleSprayTexture(r, pal.texTone || null),
      near: (k, pal) => scaleNear({
        trunk: buildPineTrunk(mulberry32(seed + nearSeed + k * 7), pal),
        cards: buildPineCards(mulberry32(seed + nearSeed + 2 + k * 7), 0.60, 1.0, pal),
      }, scale[0], scale[1], scale[2]),
      far: (r, pal) => scaleFar(buildPineFarGeometry(r, pal), scale[0], scale[1], scale[2]),
    };
  }
  function broadleafDefinition(
    texSeed: number,
    nearSeed: number,
    farSeed: number,
    shapes: Array<BroadleafShape & { n: number }>,
    farScale: readonly [number, number, number],
  ): SpeciesDefinition {
    return {
      texSeed, nearSeed, farSeed,
      tex: (r, pal) => makeLeafClusterTexture(r, pal.texTone || null),
      near: (k, pal) => {
        const shape = shapes[k % shapes.length];
        return {
          trunk: buildBroadleafTrunk(mulberry32(seed + nearSeed + k * 7), shape),
          cards: buildBroadleafCards(
            mulberry32(seed + nearSeed + 2 + k * 7), shape.n, 1.0, pal, shape,
          ),
        };
      },
      far: (r, pal, k) => scaleFar(
        buildOakFarGeometry(r, pal, k), farScale[0], farScale[1], farScale[2],
      ),
    };
  }
  const SPECIES: Record<Species, SpeciesDefinition> = {
    pine: coniferDefinition(52, 61, 71, TREE_GEOMETRY_SCALE.pine),
    spruce: coniferDefinition(55, 91, 111, TREE_GEOMETRY_SCALE.spruce),
    fir: coniferDefinition(56, 121, 141, TREE_GEOMETRY_SCALE.fir),
    cedar: coniferDefinition(57, 151, 171, TREE_GEOMETRY_SCALE.cedar),
    cypress: coniferDefinition(58, 181, 201, TREE_GEOMETRY_SCALE.cypress),
    oak: broadleafDefinition(51, 65, 73, OAK_SHAPES, [1, 1, 1]),
    poplar: broadleafDefinition(59, 211, 231, POPLAR_SHAPES, [0.58, 1.25, 0.58]),
    willow: broadleafDefinition(60, 241, 261, WILLOW_SHAPES, [1.45, 0.82, 1.45]),
    acacia: broadleafDefinition(62, 271, 291, ACACIA_SHAPES, [1.48, 0.78, 1.42]),
    eucalyptus: broadleafDefinition(63, 301, 321, EUCALYPTUS_SHAPES, [0.68, 1.35, 0.72]),
    palm: {
      texSeed: 53, nearSeed: 81, farSeed: 75,
      tex: (r, pal) => makePalmFrondTexture(r, pal.texTone || null),
      near: (k, pal) => buildPalmGeometry(mulberry32(seed + 81 + k * 7), pal, PALM_VAR[k % 3]),
      far: (r, pal, k) => buildPalmFarGeometry(r, pal, k),
    },
    birch: {
      texSeed: 54, nearSeed: 85, farSeed: 77,
      tex: (r, pal) => makeTwigTexture(r, pal.texTone || null),
      // content_breadth r3: pal now reaches the near builder (winter card
      // tint + snow load; verdant/urban pass no birch palette -> unchanged)
      // r5 terrain_environment: k selects BIRCH_VAR — three distinct
      // height/crown proportions so stands stop reading as clones
      near: (k, pal) => buildBirchGeometry(mulberry32(seed + 85 + k * 7), pal, BIRCH_VAR[k % 3]),
      far: (r, pal) => buildBirchFarGeometry(r, pal),
    },
    aspen: {
      texSeed: 64, nearSeed: 331, farSeed: 351,
      tex: (r, pal) => makeTwigTexture(r, pal.texTone || null),
      near: (k, pal) => scaleNear(
        buildBirchGeometry(mulberry32(seed + 331 + k * 7), pal, BIRCH_VAR[k % 3]),
        ...TREE_GEOMETRY_SCALE.aspen,
      ),
      far: (r, pal) => scaleFar(buildBirchFarGeometry(r, pal), ...TREE_GEOMETRY_SCALE.aspen),
    },
  };
  const speciesList = veg.species.filter((sp) => SPECIES[sp]);
  const bushSpecies = speciesList.includes(veg.bushSpecies) ? veg.bushSpecies : speciesList[0];
  if (!bushSpecies) throw new Error('world/vegetation: at least one species is required');
  const palOf = (sp: Species): VegetationPalette => {
    const explicit = veg.palettes[sp];
    if (explicit) return explicit;
    const family = TREE_ARCHETYPES[sp].family;
    if (family === 'conifer') return veg.palettes.pine || {};
    if (family === 'birch') return veg.palettes.birch || {};
    if (family === 'palm') return veg.palettes.palm || {};
    return veg.palettes.oak || {};
  };

  const foliageTex = {} as Record<Species, THREE.CanvasTexture>;
  const foliageMats = {} as Record<Species, THREE.MeshStandardMaterial>;
  const foliageDepthMats = {} as Record<Species, THREE.MeshDepthMaterial>;
  function* createFoliageMaterials(): Generator<BuildYield, void, void> {
    for (const sp of speciesList) {
      foliageTex[sp] = SPECIES[sp].tex(mulberry32(seed + SPECIES[sp].texSeed), palOf(sp));
      const fm = new THREE.MeshStandardMaterial({
        map: foliageTex[sp], alphaTest: 0.38, alphaToCoverage: true, side: THREE.DoubleSide,
        vertexColors: true, roughness: 1.0, metalness: 0.0,
      });
      fm.envMapIntensity = 0.85; // keep ambient on shaded leaves — no black cards
      engineCtx.setupShadowMaterial(fm, foliageWindHook);
      fm.customProgramCacheKey = () => 'world-tree-foliage-v10-' + sp; // aa-r1: + mip-alpha guard
      foliageMats[sp] = fm;
      // alpha-tested shadow casting: without this every card shadows as a quad.
      // r6: palm gets a HIGHER shadow alphaTest — its frond texture covers most
      // of the card, so at shadow-map mip levels the averaged alpha stayed
      // above 0.38 across the whole quad and every frond shadowed as a solid
      // 1.9 m strap; the crown projected a giant star-shaped blob several times
      // its own size (desert critique). 0.62 keeps only the dense frond core.
      foliageDepthMats[sp] = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking, map: foliageTex[sp],
        alphaTest: sp === 'palm' ? 0.62 : 0.38,
      });
      yield { stage: 'treePrep', fine: true };
    }
  }
  yield* createFoliageMaterials();

  // r7: 3 near variants + 2 far variants per species (was 2/1) — "dozens of
  // identical stacked-cone pines" was a top critique; every stand now mixes
  // three distinct crowns near and two silhouettes at range, on top of the
  // per-instance rotation/scale/tint jitter.
  const NEAR_VARIANTS = 3, FAR_VARIANTS = 2;
  const treeGeo = {} as Record<Species, TreeGeometryPair[]>;
  const treeGeoFar = {} as Record<Species, FarTreeGeometryPair[]>;
  function* createSpeciesGeometry(): Generator<BuildYield, void, void> {
    for (const sp of speciesList) {
      treeGeo[sp] = [];
      for (let k = 0; k < NEAR_VARIANTS; k++) {
        treeGeo[sp].push(SPECIES[sp].near(k, palOf(sp)));
        yield { stage: 'treePrep', fine: true };
      }
      treeGeoFar[sp] = [];
      for (let k = 0; k < FAR_VARIANTS; k++) {
        treeGeoFar[sp].push(SPECIES[sp].far(
          mulberry32(seed + SPECIES[sp].farSeed + k * 101), palOf(sp), k,
        ));
        yield { stage: 'treePrep', fine: true };
      }
    }
  }
  yield* createSpeciesGeometry();

  // weighted species pick from a [ [species, weight], ... ] mix
  function pickSpecies(mix: SpeciesMix, roll: number): Species {
    let tot = 0;
    for (const [sp, w] of mix) if (treeGeo[sp]) tot += w;
    let acc = 0;
    for (const [sp, w] of mix) {
      if (!treeGeo[sp]) continue;
      acc += w / tot;
      if (roll <= acc) return sp;
    }
    return speciesList[0];
  }

  // placement: clusters + lone trees + horizon rim forest
  // r6: saplings draw from their OWN stream — consuming the shared placement
  // rng shifted every tree/bush placed after the first cluster and broke the
  // authored establishing-shot compositions (foreground framing oaks moved)
  const sapRng = mulberry32((seed ^ 0x5a9) >>> 0);
  const clusters: VegetationDisc[] = [];
  const trees: TreeRecord[] = []; // { x,z,species,variant, mat: Matrix4, tint: Color, near: bool }
  const treeObstacles: TreeObstacle[] = [];
  const protectedSpawns = [L.spawns.player, ...L.spawns.enemies];
  // SPOTTING WIRING: concealment discs {x,z,r,add} sampled by the spotting
  // sim (src/sim/spotting.ts) — bushes conceal strongly, tree canopies mildly.
  const concealers: ConcealmentDisc[] = [];
  function registerTreeInteraction(
    treeIndex: number,
    groundY: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    concealment = 0.08,
  ): void {
    const tree = trees[treeIndex];
    const archetype = TREE_ARCHETYPES[tree.species];
    const radialScale = Math.max(scaleX, scaleZ);
    const radius = treeTrunkCollisionRadiusM(tree.species, tree.variant) * radialScale;
    treeObstacles.push(setCircleShape({
      min: [tree.x - radius, groundY, tree.z - radius],
      max: [tree.x + radius, groundY + archetype.trunkHeightM * scaleY, tree.z + radius],
      crushable: true,
      // Trees topple on contact and do not scrub drivetrain speed. Their
      // physical response is the fall animation, not an invisible wall that
      // can divert a bot or trap a low-speed tank between trunks.
      crushMin: 0,
      crushKeep: 1,
      crushed: false,
      treeIdx: treeIndex,
      kind: 'tree',
    }, tree.x, tree.z, radius) as TreeObstacle);
    concealers.push({
      x: tree.x,
      z: tree.z,
      r: archetype.canopyRadiusM * radialScale * 0.8,
      add: concealment,
    });
  }
  function siteOk(x: number, z: number, margin: number): boolean {
    if (Math.max(Math.abs(x), Math.abs(z)) > 455) return false;
    if (inAvoid(x, z)) return false;
    if (x > v.x0 - 24 && x < v.x1 + 24 && z > v.z0 - 24 && z < v.z1 + 24) return false;
    if (heightField._roadDist(x, z) < 9 + margin) return false;
    if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) return false;
    if (veg.parks) { // town maps: trees only inside the park belts
      let inPark = false;
      for (const p of veg.parks) {
        if (Math.hypot(x - p.x, z - p.z) < p.r) { inPark = true; break; }
      }
      if (!inPark) return false;
    }
    if (!isClearOfSpawns(x, z, protectedSpawns, 26)) return false;
    return heightField.getNormalAt(x, z).y > 0.82;
  }
  function pushTree(
    x: number,
    z: number,
    species: Species,
    scMin: number,
    scMax: number,
    withObstacle: boolean,
  ): void {
    const y = heightField.getHeightAt(x, z);
    const sc = scMin + rng() * (scMax - scMin);
    const archetype = TREE_ARCHETYPES[species];
    // Independent, position-keyed width/depth/height variation changes the
    // silhouette without consuming the placement RNG stream. Stands retain
    // their authored positions while individual trees stop reading as clones.
    const sx = sc * (0.86 + treePositionNoise(x, z, 1) * 0.28);
    const sy = sc * (0.88 + treePositionNoise(x, z, 2) * 0.24);
    const sz = sc * (0.86 + treePositionNoise(x, z, 3) * 0.28);
    _q.setFromAxisAngle(_up, rng() * Math.PI * 2);
    // r3 terrain_environment: per-instance LEAN jitter — every trunk used to
    // stand bolt vertical, a loud repetition tell in stands; a few degrees of
    // random tilt (more for palms) reads as natural growth
    const leanA = rng() * Math.PI * 2;
    const leanM = treePositionNoise(x, z, 4) * archetype.leanMaxRad;
    _qLean.setFromAxisAngle(_axLean.set(Math.cos(leanA), 0, Math.sin(leanA)), leanM);
    _q.multiply(_qLean);
    // height variance clamped tight (no needle-thin scaling-bug giants)
    _m4.compose(_pv.set(x, y - 0.06, z), _q, _sv.set(sx, sy, sz));
    // per-tree hue/value jitter, WIDE: identical-sibling canopies are the
    // loudest mid-distance tell, so value swings ~2x and hue drifts between
    // yellow-green and blue-green per instance
    const vj = 0.58 + rng() * 0.42;
    // content_breadth r3: the wide hue jitter is authored for verdant
    // variety — on the winter map a g-heavy roll re-saturated a frosted pine
    // back to summer green (the critique's lone green tree). pal.jitterHue
    // (0..1, default 1) scales the per-channel spread around the neutral
    // value jitter; winter runs ~0.22 = near value-only.
    const pj = palOf(species).jitterHue ?? 1;
    _c.setRGB(vj * (1 + (rng() * 0.26 - 0.12) * pj), vj * (1 + (rng() * 0.22 - 0.04) * pj),
      vj * (1 + (rng() * 0.24 - 0.16) * pj));
    // r7 terrain_environment: ~10% DRY/YELLOWED individuals (critique: "no
    // dry/dead mix-ins... monoculture"). A strong per-instance tint pull
    // toward sun-scorched straw/amber — broadleafs go autumn-gold, conifers
    // read as browning stressed trees. Gated to summer palettes (pj >= 0.5):
    // winter runs value-only jitter and the desert palettes manage their own
    // range. Rolled from a POSITION HASH, not the shared rng stream — one
    // extra rng() here would shift every subsequent placement and re-break
    // the authored establishing-shot compositions (see sapRng note above).
    const dryRoll = treePositionNoise(x, z, 0);
    if (pj >= 0.5 && dryRoll < 0.10) {
      const deep = dryRoll < 0.03; // a few fully browned-off trees
      _c.r *= deep ? 1.30 : 1.26;
      _c.g *= deep ? 0.82 : 0.96;
      _c.b *= deep ? 0.38 : 0.48;
    }
    trees.push({
      x, z, species, variant: (rng() * 3) | 0, fv: (rng() * 2) | 0,
      mat: _m4.clone(), tint: _c.clone(), near: false,
      // occlusion-fade bookkeeping: canopy proxy sphere (world center/radius,
      // generous enough for every species' card spread), eased fade 0..1 and
      // the instance slot assigned by the current near partition (-1 = far).
      // fslot mirrors slot for the far partition (incremental repartition).
      cy: y + archetype.canopyCenterM * sy,
      cr: archetype.canopyRadiusM * Math.max(sx, sz),
      fade: 0, slot: -1, fslot: -1,
      lodF: 0, lodT: false,
      dr: archetype.rootDecalRadiusM * Math.max(sx, sz),
      fallH: archetype.fallHeightM * sy,
      fallR: archetype.fallRadiusM * Math.max(sx, sz),
    });
    // Every tree reachable inside the playable square uses the same physical
    // trunk record. Outer-rim trees beyond the wall remain horizon dressing.
    if (withObstacle || Math.max(Math.abs(x), Math.abs(z)) <= PLAYABLE_HALF_EXTENT_M) {
      // gameplay_feel r6 (round critique MAJOR): tree trunks are CRUSHABLE —
      // state.ts's collider drives a moving hull THROUGH the tagged record,
      // marks it `crushed` and calls world.crushObstacle → crushTree below
      // for the hinge-topple. treeIdx links the record to its tree instance.
      registerTreeInteraction(trees.length - 1, y, sx, sy, sz);
      // camo_spotting r3 forest balance: 0.13 stacked any clump to the bush
      // cap — bloom-hot forest campers at 250 m+ never lit up. Canopies
      // soft-conceal (0.08); bushes (0.35) stay the real hides. Pairs with
      // MAX_BUSH_BONUS 0.6 -> 0.5 in src/sim/spotting.ts (already applied).
    }
  }
  function addTree(x: number, z: number, species: Species): boolean {
    if (!siteOk(x, z, 0)) return false;
    pushTree(x, z, species, 0.95, 1.7, true); // wide size spread per stand
    return true;
  }
  function isSeparatedTreeCluster(x: number, z: number): boolean {
    for (const c of clusters) {
      if (Math.hypot(x - c.x, z - c.z) < c.r + 26) return false;
    }
    return true;
  }
  function tintTreeStand(startIndex: number): void {
    const toneBias = rng();
    const lightness = 0.95 + (rng() - 0.5) * 0.12;
    for (let i = startIndex; i < trees.length; i++) {
      trees[i].tint.multiplyScalar(lightness);
      trees[i].tint.r *= 0.90 + toneBias * 0.20;
      trees[i].tint.b *= 1.10 - toneBias * 0.20;
    }
  }
  function placeTreeClusters(): void {
    let attempts = 0;
    while (clusters.length < veg.clusterCount && attempts++ < 2200) {
      const x = (rng() * 2 - 1) * 430, z = (rng() * 2 - 1) * 430;
      if (!siteOk(x, z, 6)) continue;
      if (!isSeparatedTreeCluster(x, z)) continue;
      const r = 16 + rng() * 26;
      const species = pickSpecies(veg.clusterMix, rng());
      // r5: ~1.7x trees per stand — designated forest strips must read DENSE
      // (closed canopy) next to WoT tree lines, not as loose orchards
      const n = 24 + (rng() * 34) | 0;
      let placed = 0;
      const cb0 = trees.length;
      for (let i = 0; i < n * 3 && placed < n; i++) {
        const a = rng() * Math.PI * 2, rr = r * Math.sqrt(rng());
        const sp = rng() < 0.8 ? species : pickSpecies(veg.loneMix, rng());
        if (addTree(x + Math.cos(a) * rr, z + Math.sin(a) * rr, sp)) placed++;
      }
      // r6 (content_breadth): coherent PER-STAND tint bias — per-tree jitter
      // alone averages every distant stand toward the same mid-green; a whole-
      // cluster lean (warm vs cool, small value drift) is what makes
      // mid-distance forest blocks read as distinct species stands instead of
      // "uniform leaf-card blobs" (critique).
      tintTreeStand(cb0);
      if (placed > 2) clusters.push({ x, z, r });
    }
  }
  placeTreeClusters();
  yield { stage: 'treeClusters' };
  function placeLoneTrees(): void {
    for (let i = 0, placed = 0; i < 700 && placed < veg.loneCount; i++) { // lone trees + pairs
      const x = (rng() * 2 - 1) * 460, z = (rng() * 2 - 1) * 460;
      if (addTree(x, z, pickSpecies(veg.loneMix, rng()))) {
        placed++;
        if (rng() < 0.4) { // companion tree — lone lollipops read fake
          const a2 = rng() * Math.PI * 2, r2 = 4 + rng() * 7;
          if (addTree(x + Math.cos(a2) * r2, z + Math.sin(a2) * r2, pickSpecies(veg.loneMix, rng()))) placed++;
        }
      }
    }
  }
  placeLoneTrees();
  // maps r1 (ADDITIVE, config-gated): WINDBREAK BELTS — authored tree LINES
  // ({x0,z0,x1,z1, gap?, jitter?, species?}) for steppe shelterbelts and
  // field-boundary rows. Runs only when cfg.vegetation.belts exists, so no
  // pre-existing map consumes a single extra rng() draw (their layouts stay
  // bit-identical). Trees go through addTree => full siteOk rules + obstacles
  // + concealment, i.e. belts are real cover, not dressing.
  function placeTreeBelts(): void {
    if (veg.belts) {
      for (const b of veg.belts) {
        const len = Math.hypot(b.x1 - b.x0, b.z1 - b.z0);
        const gap = b.gap ?? 8;
        const jit = b.jitter ?? 2.5;
        const nB = Math.max(2, Math.round(len / gap));
        for (let i = 0; i <= nB; i++) {
          const t = i / nB;
          const bx = b.x0 + (b.x1 - b.x0) * t + (rng() - 0.5) * jit;
          const bz = b.z0 + (b.z1 - b.z0) * t + (rng() - 0.5) * jit;
          if (rng() < (b.skip ?? 0.12)) continue; // storm gaps read planted-then-weathered
          addTree(bx, bz, b.species || pickSpecies(veg.loneMix, rng()));
        }
      }
    }
  }
  placeTreeBelts();

  // horizon rim forest: dense clustered blocks on the raised map border so
  // distant ridgelines carry massed silhouettes instead of scattered lollipops
  // r6 (content_breadth): DE-COMB. The blocks were laid at even angular
  // spacing (c/rimCount * 2PI +- 0.11 rad) with one width and one density —
  // at 450 m the border treeline rendered as a repeating sprite comb
  // (critique, major). Blocks now land on stratified-JITTERED angles (+-0.5
  // slot), block width/density/scale wander per block, each stand carries a
  // coherent tint bias (whole stands lean warm-birch or cool-spruce — the
  // per-tree jitter alone averages to one grey at range), and a sparse
  // emergent scatter fills the saddles so gaps read as thin forest, not
  // clean breaks between identical tufts.
  const _standTint = new THREE.Color();
  yield { stage: 'treeLoneAndBelts' };
  function placeRimForest(): void {
    for (let c = 0; c < veg.rimCount; c++) {
      const slot = (c + (rng() - 0.5)) / Math.max(1, veg.rimCount);
      const a = slot * Math.PI * 2 + (rng() - 0.5) * 0.22;
      const rad = 442 + rng() * 52;
      const cx = Math.cos(a) * rad, cz = Math.sin(a) * rad;
      if (Math.max(Math.abs(cx), Math.abs(cz)) > 502) continue;
      const species = pickSpecies(veg.rimMix, rng());
      const bw = 26 + rng() * 44;          // block width wanders 26-70 m
      const dens = 0.55 + rng() * 0.95;    // per-block density wanders
      const n = Math.max(6, Math.round((16 + rng() * 18) * dens));
      const tb = rng();
      _standTint.setRGB(0.88 + tb * 0.24, 0.94 + (rng() - 0.5) * 0.10,
        0.88 + (1 - tb) * 0.22);
      const b0 = trees.length;
      for (let i = 0; i < n; i++) {
        const x = cx + (rng() - 0.5) * bw, z = cz + (rng() - 0.5) * bw;
        if (Math.max(Math.abs(x), Math.abs(z)) > 506) continue;
        // maps r1: the rim ring can cross open WATER now (coastal bay fills the
        // east rim) — no forest wading in the sea. noVeg is false along every
        // pre-existing map's rim, so this is a no-op for them.
        if (noVeg(x, z)) continue;
        // Boundary spawns can sit inside the horizon ring. Preserve a larger
        // chase-camera corridor here because rim trees intentionally bypass the
        // ordinary playable-area site policy.
        if (!isClearOfSpawns(x, z, protectedSpawns, 36)) continue;
        pushTree(x, z, rng() < 0.85 ? species : pickSpecies(veg.rimMix, rng()), 1.35, 2.2, false);
      }
      for (let i = b0; i < trees.length; i++) trees[i].tint.multiply(_standTint);
    }
  }
  placeRimForest();
  // saddle emergents between the rim blocks
  function placeSaddleTrees(): void {
    for (let i = 0, nSad = Math.round(veg.rimCount * 1.5); i < nSad; i++) {
      const a = rng() * Math.PI * 2;
      const rad = 446 + rng() * 48;
      const x = Math.cos(a) * rad + (rng() - 0.5) * 18;
      const z = Math.sin(a) * rad + (rng() - 0.5) * 18;
      if (Math.max(Math.abs(x), Math.abs(z)) > 506) continue;
      if (noVeg(x, z)) continue; // maps r1: see the rim-block note (sea rim)
      if (!isClearOfSpawns(x, z, protectedSpawns, 36)) continue;
      pushTree(x, z, pickSpecies(veg.rimMix, rng()), 1.2, 1.9, false);
    }
  }
  placeSaddleTrees();

  // r6 terrain_environment: SAPLING understory fringe — real forest edges
  // step down through young growth into the field (the critique's missing
  // "undergrowth transition"). 3-6 half-scale trees ring each stand, drawn
  // from the DEDICATED sapRng stream AFTER every shared-rng placement pass so
  // the authored tree layout (and the composed establishing shots) stays
  // untouched. These young trees still register a proportionally small trunk
  // so shells and hulls topple them through the same path as mature trees.
  function placeSaplings(): void {
    for (const c of clusters) {
      const nSap = 3 + (sapRng() * 4) | 0;
      for (let sIt = 0; sIt < nSap; sIt++) {
        const sa = sapRng() * Math.PI * 2;
        const sr = c.r * (1.02 + sapRng() * 0.35);
        const sx = c.x + Math.cos(sa) * sr, sz = c.z + Math.sin(sa) * sr;
        const roll = sapRng(), sc = 0.42 + sapRng() * 0.26;
        const yawS = sapRng() * Math.PI * 2;
        const vjS = 0.60 + sapRng() * 0.40;
        const variantS = (sapRng() * 3) | 0, fvS = (sapRng() * 2) | 0;
        const jr = sapRng(), jg = sapRng(), jb = sapRng();
        if (!siteOk(sx, sz, 0)) continue;
        const sy = heightField.getHeightAt(sx, sz);
        const spS = pickSpecies(veg.clusterMix, roll);
        const archetypeS = TREE_ARCHETYPES[spS];
        const sapScaleX = sc * (0.86 + treePositionNoise(sx, sz, 11) * 0.28);
        const sapScaleY = sc * (0.90 + treePositionNoise(sx, sz, 12) * 0.20);
        const sapScaleZ = sc * (0.86 + treePositionNoise(sx, sz, 13) * 0.28);
        _q.setFromAxisAngle(_up, yawS);
        _m4.compose(
          _pv.set(sx, sy - 0.06, sz),
          _q,
          _sv.set(sapScaleX, sapScaleY, sapScaleZ),
        );
        // young growth runs a touch brighter/yellower against the mature stand
        const pjS = palOf(spS).jitterHue ?? 1;
        _c.setRGB(vjS * (1 + jr * 0.20 * pjS), vjS * (1.02 + jg * 0.16 * pjS),
          vjS * (0.88 + jb * 0.16 * pjS));
        trees.push({
          x: sx, z: sz, species: spS, variant: variantS, fv: fvS,
          mat: _m4.clone(), tint: _c.clone(), near: false,
          cy: sy + archetypeS.canopyCenterM * sapScaleY,
          cr: archetypeS.canopyRadiusM * Math.max(sapScaleX, sapScaleZ),
          fade: 0, slot: -1, fslot: -1,
          lodF: 0, lodT: false,
          dr: archetypeS.rootDecalRadiusM * Math.max(sapScaleX, sapScaleZ),
          fallH: archetypeS.fallHeightM * sapScaleY,
          fallR: archetypeS.fallRadiusM * Math.max(sapScaleX, sapScaleZ),
        });
        registerTreeInteraction(
          trees.length - 1,
          sy,
          sapScaleX,
          sapScaleY,
          sapScaleZ,
          0.04,
        );
      }
    }
  }
  placeSaplings();

  // near/far instanced meshes (partition rewritten on camera movement, hysteresis).
  // Each LOD is a trunk mesh (opaque bark) + a card mesh (alpha foliage) sharing
  // the same instance matrices.
  const _whiteScratch = new THREE.Color(1, 1, 1);
  // The visible near tree dissolves through aLodF while its far stand-in is
  // already present. The shared engine shadow policy mirrors that dissolve for
  // every compatible caster on every battlefield. Without it, a promoted crown
  // casts its full shadow immediately and demoted trunks/crowns vanish together
  // on the final transition frame, flashing broad ground patches in dense stands.
  function makeTreeMesh(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    sp: Species,
    isFoliage: boolean,
  ): TreeMesh {
    // per-instance occlusion fade — EVERY geometry drawn with the tree hooks
    // must carry the attribute (near meshes are updated live; far meshes stay
    // zero — a tree within camera range is always in the near partition)
    if (!geo.getAttribute('aFadeI')) {
      const fadeAttr = new THREE.InstancedBufferAttribute(new Float32Array(trees.length), 1);
      fadeAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFadeI', fadeAttr);
    }
    if (!geo.getAttribute('aLodF')) { // aa-r1: LOD cross-fade dissolve share
      const lodAttr = new THREE.InstancedBufferAttribute(new Float32Array(trees.length), 1);
      lodAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aLodF', lodAttr);
    }
    const m = new THREE.InstancedMesh(geo, mat, trees.length);
    // PERF (performance_budget r5): near/far partitions are rewritten while
    // the camera drives (repartitionTrees) — StaticDrawUsage instance buffers
    // sync-stall ANGLE-Metal on re-upload (see carpet note). Dynamic usage on
    // everything repartition touches.
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, _whiteScratch);
    m.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    // cards do NOT receive shadows: per-card CSM self-shadowing turns half the
    // canopy pitch-black; the baked vertex-colour AO carries that job instead
    m.receiveShadow = !isFoliage;
    m.frustumCulled = false;
    m.count = 0;
    m.matrixAutoUpdate = false;
    if (isFoliage) {
      m.customDepthMaterial = foliageDepthMats[sp];
      m.userData.treeFoliage = true;
      // GTAO's override-material prepass ignores alphaTest — cards would
      // composite as huge dark floating quads over the canopy
      m.userData.aoExclude = true;
    }
    group.add(m);
    return m;
  }
  const nearMeshes = {} as Record<Species, TreeMesh[][]>;
  const farMeshes = {} as Record<Species, TreeMesh[][]>;
  // PERF NOTE (performance_budget r5): a cascade shadow-proxy LOD for the
  // near-tree canopy cards was prototyped here and MEASURED NET-NEGATIVE:
  // the cards' whole cascade share is only ~0.29 M tris/frame, while a
  // colorWrite-off proxy (three r185 has no shadow-only flag — an invisible
  // material skips the shadow pass too, verified) re-renders its geometry
  // into the main pass AND every cascade for +0.9 M (far-LOD lobes) or ~±0
  // (low-poly blobs, with a visible dappled->solid shadow change). The real
  // shadow-triangle mass is props/buildings (-0.66 M measured with props
  // castShadow off) — see docs/PERFORMANCE.md.
  function createTreeMeshPools(): void {
    for (const sp of speciesList) {
      nearMeshes[sp] = treeGeo[sp].map((g) => {
        const trunk = makeTreeMesh(g.trunk, barkMat, sp, false);
        // shadow-stability r2: The opaque canopy proxy is deliberately coarse
        // and stable on broad ground receivers, but projecting that same mask
        // onto a narrow bark cylinder makes its lit face jump between dark and
        // light samples while the chase camera crosses cascade texels. Bark
        // already has normal-mapped/direct-light form shading, so keep the
        // trunk as a ground shadow CASTER without letting canopy/self shadows
        // crawl across its visible surface.
        trunk.receiveShadow = false;
        applyLodShadowFadeDepth(trunk);
        trunk.userData.treeTrunk = true;
        const foliage = makeTreeMesh(g.cards, foliageMats[sp], sp, true);
        // Alpha-cut foliage and coarse opaque canopy stand-ins both produce
        // unstable results in moving cascades: cards sparkle while rounded
        // stand-ins project conspicuous black blotches across dirt roads.
        // Keep the stable trunk shadow and the bounded root contact decal;
        // the foliage's authored vertex shading supplies crown volume.
        foliage.castShadow = false;
        return [trunk, foliage];
      });
      // r7: far LOD is now a 2-variant array (silhouette variety at range)
      farMeshes[sp] = treeGeoFar[sp].map((g) => {
        const farCanopy = makeTreeMesh(g.canopy, canopyFarMat, sp, false);
        farCanopy.receiveShadow = false; // CSM self-shadow at range = black crowns
        const farTrunk = makeTreeMesh(g.trunk, barkMat, sp, false);
        farTrunk.receiveShadow = false;
        farTrunk.userData.treeTrunk = true;
        const pair = [farTrunk, farCanopy];
        // PERF (perf-budget r3): far-partition trees (beyond ~260 m) do NOT cast
        // shadows — a tree shadow out there is subpixel at 1080p (see lighting.ts
        // far-cascade rationale) yet every lobe/trunk was re-rasterized by the
        // CSM cascade passes; with the density boost this alone was millions of
        // tris/frame of invisible shadow work.
        for (const m of pair) m.castShadow = false;
        return pair;
      });
    }
  }
  createTreeMeshPools();

  yield { stage: 'treeRimAndMeshes' };
  // ---- tree root decals --------------------------------------------------
  // This layer is only a small, static trunk/soil contact cue. It must never
  // impersonate a canopy shadow: Verdant has thousands of clustered trees,
  // and the former crown-sized translucent discs overlapped into near-black
  // patches underneath both GTAO and the real CSM shadows. Those stacked
  // sheets also paid hundreds of thousands of shadow-receiving transparent
  // triangles while driving. Canopy proxies own cast shadows; GTAO owns
  // broad contact; this decal owns only the final root seam.
  function createTreeRootDecals(): void {
    if (trees.length === 0) return;
    const ds = 128;
    const dc = document.createElement('canvas');
    dc.width = dc.height = ds;
    const dctx = context2d(dc);
    const dg = dctx.createRadialGradient(ds / 2, ds / 2, 0, ds / 2, ds / 2, ds / 2);
    dg.addColorStop(0, 'rgba(28,26,20,0.56)');
    dg.addColorStop(0.38, 'rgba(35,33,25,0.32)');
    dg.addColorStop(0.72, 'rgba(42,41,32,0.10)');
    dg.addColorStop(1, 'rgba(42,44,34,0)');
    dctx.fillStyle = dg;
    dctx.fillRect(0, 0, ds, ds);
    const decTex = new THREE.CanvasTexture(dc);
    decTex.colorSpace = THREE.SRGBColorSpace;
    // The outer edge samples fully transparent texels, so its polygonal
    // contour is invisible; eight terrain-conforming sectors preserve the
    // same soft root-contact footprint while minimizing this map-wide merged
    // mesh's triangles across thousands of decals.
    const segs = 8;
    const drng = mulberry32((seed ^ 0xdeca) >>> 0);
    const pos = [], uv2 = [], idx = [];
    let vb = 0;
    let projectedAreaM2 = 0;
    let maxRadiusM = 0;
    for (const t of trees) {
      const r = treeRootDecalRadius(t.dr);
      if (r <= 0) continue;
      const cx0 = t.x, cz0 = t.z;
      projectedAreaM2 += treeRootDecalAreaM2(r);
      maxRadiusM = Math.max(maxRadiusM, r);
      pos.push(cx0, heightField.getHeightAt(cx0, cz0) + 0.05, cz0);
      uv2.push(0.5, 0.5);
      const a0 = drng() * Math.PI * 2;
      for (let k = 0; k < segs; k++) {
        const a = a0 + (k / segs) * Math.PI * 2;
        const rr = r * (0.90 + drng() * 0.18);
        const px = cx0 + Math.cos(a) * rr, pz = cz0 + Math.sin(a) * rr;
        pos.push(px, heightField.getHeightAt(px, pz) + 0.05, pz);
        uv2.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
      }
      for (let k = 0; k < segs; k++) idx.push(vb, vb + 1 + k, vb + 1 + ((k + 1) % segs));
      vb += 1 + segs;
    }
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    dgeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv2), 2));
    dgeo.setIndex(idx);
    dgeo.computeVertexNormals();
    const dmat = new THREE.MeshStandardMaterial({
      map: decTex, transparent: true, depthWrite: false,
      roughness: 0.97, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const dmesh = new THREE.Mesh(dgeo, dmat);
    // An AO/contact decal receiving the directional shadow darkens twice and
    // makes a snapped cascade edge look like the ground texture is flashing.
    dmesh.receiveShadow = false;
    dmesh.castShadow = false;
    dmesh.matrixAutoUpdate = false;
    dmesh.renderOrder = 1;
    dmesh.userData.aoExclude = true;
    dmesh.userData.treeRootDecal = true;
    dmesh.userData.decalCount = trees.length;
    dmesh.userData.projectedAreaM2 = projectedAreaM2;
    dmesh.userData.maxRadiusM = maxRadiusM;
    group.add(dmesh);
  }
  createTreeRootDecals();

  // r3 (gameplay_feel): per-instance bush fade registry — bushes within
  // ~1.5 hull radii of the player join the dither set (see updateOcclusionFade).
  interface BushFadeRecord {
    attr: THREE.BufferAttribute;
    slot: number;
    x: number;
    z: number;
    fade: number;
  }
  const bushFadeReg: BushFadeRecord[] = [];

  yield { stage: 'treeRootDecals' };
  // ---- bushes (hedgerow / field-edge cover, purely visual) ----
  function createBushes(): void {
    const bushPal = palOf(bushSpecies);
    const bushGeos = [buildBushCards(mulberry32(seed + 31), bushPal), buildBushCards(mulberry32(seed + 32), bushPal)];
    const bushPlacements: [THREE.Matrix4[], THREE.Matrix4[]] = [[], []];
    function addBush(x: number, z: number): void {
      if (Math.max(Math.abs(x), Math.abs(z)) > 470) return;
      if (inAvoid(x, z)) return;
      if (rng() > veg.bushCount) return; // per-map density scale
      if (heightField._roadDist(x, z) < 6) return;
      if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) return;
      if (heightField.getNormalAt(x, z).y < 0.78) return;
      let clump = 1;
      if (veg.bushCount < 1) {
        // r6 two-scale clustering (matches makeTuft): biome moisture belts x
        // thicket cores — shrubs knot into dense washes/hollow thickets with
        // clean ground between, instead of the r5 near-uniform pepper noise
        const sb = sampleSplatNoise(x, z, _splatScratch);
        const biome = smoothstepJs(0.42, 0.70, sb.n2);
        const thicket = smoothstepJs(0.44, 0.78, sb.n1);
        clump = biome * (0.12 + 0.88 * thicket);
        if (rng() > clump * 0.95 + 0.05) return;
      }
      const y = heightField.getHeightAt(x, z);
      // hull-height concealers: foliage reaches ~2.5-3 m so a parked tank is
      // genuinely occluded (knee-high shrubs sold zero visual concealment)
      // r5: size keyed to the clump core — 2-3x spread, big growth at centers
      const sc = (1.6 + rng() * 1.6) * (0.7 + clump * 0.45);
      _q.setFromAxisAngle(_up, rng() * Math.PI * 2);
      _m4.compose(_pv.set(x, y - 0.05, z), _q, _sv.set(sc, sc * (1.05 + rng() * 0.35), sc));
      bushPlacements[(rng() * 2) | 0].push(_m4.clone());
      concealers.push({ x, z, r: 2.0 * sc, add: 0.35 }); // SPOTTING WIRING: bush cover
    }
    function placeBushFringes(): void {
      // fringe bushes around each tree cluster. r3 terrain_environment: maps
      // can raise veg.clusterScrub (desert oases) — extra shrubs land INSIDE
      // the cluster as understory at the trunk bases, grounding the palm
      // clusters that used to stand as bare sticks on clean sand.
      const scrubMul = veg.clusterScrub ?? 1;
      for (const c of clusters) {
        const n = Math.round((5 + (rng() * 6) | 0) * scrubMul);
        for (let i = 0; i < n; i++) {
          const a = rng() * Math.PI * 2;
          const inside = scrubMul > 1 && rng() < 0.55;
          const rr = c.r * (inside ? 0.25 + rng() * 0.6 : 1.05 + rng() * 0.5);
          addBush(c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr);
        }
      }
    }
    function placeFieldBushes(): void {
      for (let i = 0; i < 470; i++) { // scattered field bushes, mild roadside bias
        const x = (rng() * 2 - 1) * 455, z = (rng() * 2 - 1) * 455;
        const rd = heightField._roadDist(x, z);
        if (rd > 26 && rng() > 0.55) continue;
        addBush(x, z);
      }
    }
    function placeBushClumps(): void {
      // midfield concealment clumps: 4-6 bushes over a ~10-12 m spread so a
      // parked tank is at least half-occluded from ground level
      for (let c = 0; c < 58; c++) {
        const x = (rng() * 2 - 1) * 420, z = (rng() * 2 - 1) * 420;
        const n = 4 + (rng() * 3) | 0;
        for (let i = 0; i < n; i++) {
          addBush(x + (rng() - 0.5) * 11, z + (rng() - 0.5) * 11);
        }
      }
    }
    function createBushMeshes(): void {
      for (let bv = 0; bv < 2; bv++) {
        if (bushPlacements[bv].length === 0) continue;
        // bushes share the hooked foliage material → need the fade attribute
        // too. All zeros at build; the r3 gameplay_feel pass fades bushes that
        // sit ON the player's hull (they never occlude the sight LINE, but
        // cover parked on the tank left it majority-hidden in chase frames).
        bushGeos[bv].setAttribute('aFadeI',
          new THREE.InstancedBufferAttribute(new Float32Array(bushPlacements[bv].length), 1));
        // aa-r1: bushes never LOD-swap but share the hooked foliage material —
        // the shader needs the attribute present (stays all-zero).
        bushGeos[bv].setAttribute('aLodF',
          new THREE.InstancedBufferAttribute(new Float32Array(bushPlacements[bv].length), 1));
        const bAttr = attribute(bushGeos[bv], 'aFadeI');
        for (let i = 0; i < bushPlacements[bv].length; i++) {
          const e = bushPlacements[bv][i].elements;
          bushFadeReg.push({ attr: bAttr, slot: i, x: e[12], z: e[14], fade: 0 });
        }
        const m = new THREE.InstancedMesh(bushGeos[bv], foliageMats[bushSpecies], bushPlacements[bv].length);
        for (let i = 0; i < bushPlacements[bv].length; i++) {
          m.setMatrixAt(i, bushPlacements[bv][i]);
          // darker, near-neutral multipliers: the old 0.8-1.1 range let lit
          // bushes glow saturated pure green against the graded terrain and
          // read as pasted-in — sit them INTO the field tone instead
          const bj = 0.52 + rng() * 0.34;
          _c.setRGB(bj * (0.94 + rng() * 0.14), bj * (0.98 + rng() * 0.14), bj * (0.90 + rng() * 0.16));
          m.setColorAt(i, _c);
        }
        m.castShadow = true;
        m.receiveShadow = false; // baked card AO, no per-card CSM self-shadow
        m.matrixAutoUpdate = false;
        m.customDepthMaterial = foliageDepthMats[bushSpecies];
        m.userData.aoExclude = true; // GTAO override prepass ignores alphaTest
        m.computeBoundingSphere();
        group.add(m);
      }
    }
    placeBushFringes();
    placeFieldBushes();
    placeBushClumps();
    createBushMeshes();
  }
  createBushes();

  yield { stage: 'bushes' };
  // ---- chase-camera foliage occlusion fade -------------------------------
  // WoT behavior: any tree standing between the camera and the player's tank
  // fades to near-transparency so the third-person loop stays readable on
  // forest routes. Each frame the pivot→camera segment is swept against every
  // near tree's canopy proxy sphere; intersecting trees ease toward fade = 1
  // (dithered to ~12% in the shader), everything else eases back to 0.
  const OCCL_TAU_S = 0.13;  // ease time constant (≈150 ms feel, like uSniperFade)
  // gameplay_feel r5: 1.1 → 2.6. The thin segment-vs-sphere test only faded
  // crowns whose proxy sphere the exact camera→pivot line pierced — driving a
  // forest corridor left mid-corridor crowns just off the line filling 60-90%
  // of the frame (drive_b_turn: tank fully hidden for seconds). The wider pad
  // turns the test into a fat occlusion capsule, WoT-style.
  const OCCL_PAD_M = 2.6;   // capsule radius pad around camera→pivot
  const OCCL_BOX_PAD = 14;  // XZ broadphase reject (max near-tree cr + pad)
  const BUSH_FADE_R2 = 7 * 7;
  let occlAny = false;      // skip the sweep entirely once everything settled
  const _dirtyFadeAttrs = new Set<THREE.BufferAttribute>();
  const occlusionSegment = {
    active: false,
    ax: 0, ay: 0, az: 0,
    dx: 0, dy: 0, dz: 0,
    lengthSq: 0,
    minX: 0, maxX: 0, minZ: 0, maxZ: 0,
  };
  function writeTreeFade(t: TreeRecord): void {
    for (const m of nearMeshes[t.species][t.variant]) {
      const attr = attribute(m.geometry, 'aFadeI');
      attr.array[t.slot] = t.fade;
      // PERF (performance_budget r5): ranged upload — the full 20 KB fade
      // array re-upload was fence-stalling with the rest (see repartition).
      attr.addUpdateRange(t.slot, 1);
      _dirtyFadeAttrs.add(attr);
    }
  }
  function prepareOcclusionSegment(
    camPos: THREE.Vector3,
    focusPos: THREE.Vector3 | null,
  ): void {
    const segment = occlusionSegment;
    segment.active = focusPos !== null && focusPos !== undefined;
    if (!focusPos) {
      uFocusPos.value.set(0, -9999, 0);
      return;
    }
    uFocusPos.value.copy(focusPos);
    segment.ax = focusPos.x;
    segment.ay = focusPos.y;
    segment.az = focusPos.z;
    segment.dx = camPos.x - segment.ax;
    segment.dy = camPos.y - segment.ay;
    segment.dz = camPos.z - segment.az;
    segment.lengthSq = segment.dx * segment.dx
      + segment.dy * segment.dy + segment.dz * segment.dz;
    segment.minX = Math.min(segment.ax, camPos.x) - OCCL_BOX_PAD;
    segment.maxX = Math.max(segment.ax, camPos.x) + OCCL_BOX_PAD;
    segment.minZ = Math.min(segment.az, camPos.z) - OCCL_BOX_PAD;
    segment.maxZ = Math.max(segment.az, camPos.z) + OCCL_BOX_PAD;
  }
  function treeOcclusionTarget(tree: TreeRecord): number {
    const segment = occlusionSegment;
    if (!segment.active || !tree.near
      || tree.x <= segment.minX || tree.x >= segment.maxX
      || tree.z <= segment.minZ || tree.z >= segment.maxZ) return 0;
    let along = segment.lengthSq > 1e-6
      ? ((tree.x - segment.ax) * segment.dx
        + (tree.cy - segment.ay) * segment.dy
        + (tree.z - segment.az) * segment.dz) / segment.lengthSq
      : 0;
    along = Math.max(0, Math.min(1, along));
    const px = segment.ax + segment.dx * along - tree.x;
    const py = segment.ay + segment.dy * along - tree.cy;
    const pz = segment.az + segment.dz * along - tree.z;
    const radius = tree.cr + OCCL_PAD_M;
    return px * px + py * py + pz * pz < radius * radius ? 1 : 0;
  }
  function updateTreeOcclusionFades(smoothing: number): boolean {
    let any = false;
    for (const tree of trees) {
      const target = treeOcclusionTarget(tree);
      if (tree.fade !== target) {
        tree.fade += (target - tree.fade) * smoothing;
        if (Math.abs(tree.fade - target) < 0.02) tree.fade = target;
        if (tree.slot >= 0) writeTreeFade(tree);
      }
      if (tree.fade !== 0) any = true;
    }
    return any;
  }
  function updateBushOcclusionFades(smoothing: number): boolean {
    let any = false;
    const segment = occlusionSegment;
    for (const bush of bushFadeReg) {
      const bx = bush.x - segment.ax, bz = bush.z - segment.az;
      const target = segment.active && bx * bx + bz * bz < BUSH_FADE_R2 ? 1 : 0;
      if (bush.fade !== target) {
        bush.fade += (target - bush.fade) * smoothing;
        if (Math.abs(bush.fade - target) < 0.02) bush.fade = target;
        bush.attr.array[bush.slot] = bush.fade;
        bush.attr.addUpdateRange(bush.slot, 1);
        _dirtyFadeAttrs.add(bush.attr);
      }
      if (bush.fade !== 0) any = true;
    }
    return any;
  }
  function flushTreeFadeUploads(): void {
    for (const attr of _dirtyFadeAttrs) attr.needsUpdate = true;
    _dirtyFadeAttrs.clear();
  }
  function updateOcclusionFade(
    dt: number,
    camPos: THREE.Vector3,
    focusPos: THREE.Vector3 | null,
  ): void {
    // gameplay_feel r2: feed the camera->tank sight capsule to the vertex
    // shader — the fade only dithers fragments near the sight line, so
    // canopy half-off the corridor stays solid against open sky.
    prepareOcclusionSegment(camPos, focusPos);
    if (!occlusionSegment.active && !occlAny) return;
    // dt = 0 (shot mode / deterministic captures) snaps: harness stays exact.
    const k = dt > 0 ? 1 - Math.exp(-dt / OCCL_TAU_S) : 1;
    // r3 (gameplay_feel): scrub sitting on/behind the hull opens up — bushes
    // within ~1.5 hull radii of the player join the dither set even though
    // they never intersect the camera→pivot capsule.
    const treeFadeActive = updateTreeOcclusionFades(k);
    const bushFadeActive = updateBushOcclusionFades(k);
    occlAny = treeFadeActive || bushFadeActive;
    if (_dirtyFadeAttrs.size > 0) flushTreeFadeUploads();
  }

  const _lastCam = new THREE.Vector3(1e9, 0, 0);
  let _partitionBuilt = false;
  // hud_ui r6 (MAJOR): while scoped at high zoom, far-LOD billboard trees
  // inside the AIM CORRIDOR promote to full meshes — the x8 sight picture
  // magnified the cross-quad impostors on the target ridge into obvious
  // paper-cutout forests. Radius scales with zoom (capped at the 640 m max
  // engagement range); the corridor hugs the scope frustum, so the extra
  // full-detail trees stay in the low hundreds and only exist while scoped.
  let scopeZoomR = 0; // promotion radius in m (0 = arcade, no promotion)
  let scopeRepartitionPending = false;
  function scopePromoted(t: TreeRecord, camPos: THREE.Vector3): boolean {
    if (scopeZoomR <= 0) return false;
    let fx = uCamFwd.value.x, fz = uCamFwd.value.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    const dx = t.x - camPos.x, dz = t.z - camPos.z;
    const along = dx * fx + dz * fz;
    if (along < 0 || along > scopeZoomR) return false;
    // corridor half-width: x8 horizontal half-FOV (~0.107 rad) plus margin
    return Math.abs(dx * fz - dz * fx) < 24 + along * 0.14;
  }
  // PERF (performance_budget r5): repartition is now INCREMENTAL. The old
  // full rewrite flagged every near/far instance buffer for re-upload on any
  // camera step that moved one tree across the hysteresis band — with the
  // buffers allocated at trees.length capacity that was ~12 MB of
  // gl.bufferSubData per event, and on ANGLE's Metal backend each upload into
  // a buffer still referenced by in-flight GPU work is a fence wait (profiled
  // 22-224 ms — the certification p99/p1 killer). Now a crossing tree is
  // swap-removed from its old group and appended to its new one, and only the
  // two touched slots upload via addUpdateRange (tens of floats, no stall).
  const nearSlots = {} as Record<Species, TreeRecord[][]>;
  const farSlots = {} as Record<Species, TreeRecord[][]>;
  function createPartitionSlots(): void {
    for (const sp of speciesList) {
      nearSlots[sp] = Array.from({ length: NEAR_VARIANTS }, () => []);
      farSlots[sp] = Array.from({ length: FAR_VARIANTS }, () => []);
    }
  }
  createPartitionSlots();
  /** Flag one instance slot's matrix/color/fade for a ranged GPU upload. */
  function markSlotDirty(m: TreeMesh, slot: number): void {
    m.instanceMatrix.addUpdateRange(slot * 16, 16);
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) {
      m.instanceColor.addUpdateRange(slot * 3, 3);
      m.instanceColor.needsUpdate = true;
    }
    const fa = m.geometry.getAttribute('aFadeI') as THREE.BufferAttribute | undefined;
    if (fa) { fa.addUpdateRange(slot, 1); fa.needsUpdate = true; }
    const lf = m.geometry.getAttribute('aLodF') as THREE.BufferAttribute | undefined;
    if (lf) { lf.addUpdateRange(slot, 1); lf.needsUpdate = true; }
  }
  /** Write tree t into `slot` of every mesh in the group. Far groups render
   * fade 0 (opaque): occlusion fade only ever applies inside camera range.
   * aa-r1: the LOD cross-fade share (t.lodF) rides along on the NEAR side —
   * far representations stay solid underneath the dissolve (see update()). */
  function writeTreeSlot(
    meshes: TreeMesh[],
    slot: number,
    t: TreeRecord,
    fade: number,
    lodF = 0,
  ): void {
    for (const m of meshes) {
      m.setMatrixAt(slot, t.mat);
      m.setColorAt(slot, t.tint);
      const fa = m.geometry.getAttribute('aFadeI') as THREE.BufferAttribute | undefined;
      if (fa) fa.array[slot] = fade;
      const lf = m.geometry.getAttribute('aLodF') as THREE.BufferAttribute | undefined;
      if (lf) lf.array[slot] = lodF;
      markSlotDirty(m, slot);
    }
  }
  function removeFromGroup(
    meshes: TreeMesh[],
    slots: TreeRecord[],
    t: TreeRecord,
    key: 'slot' | 'fslot',
    fade: boolean,
  ): void {
    const i = t[key];
    const last = slots.pop();
    if (last && last !== t) {
      slots[i] = last;
      last[key] = i;
      // lodF travels with NEAR slots only (fade == true). A far-group swap
      // must write 0: a mid-fade tree's lodF describes its near-side
      // dissolve, and the ticker never rewrites far slots — carrying it
      // here left far instances stuck half-dithered (probe-caught).
      writeTreeSlot(meshes, i, last, fade ? last.fade : 0, fade ? (last.lodF || 0) : 0);
    }
    t[key] = -1;
    for (const m of meshes) { m.count = slots.length; m.visible = slots.length > 0; }
  }
  function addToGroup(
    meshes: TreeMesh[],
    slots: TreeRecord[],
    t: TreeRecord,
    key: 'slot' | 'fslot',
    fade: boolean,
  ): void {
    const i = slots.length;
    slots.push(t);
    t[key] = i;
    writeTreeSlot(meshes, i, t, fade ? t.fade : 0, fade ? (t.lodF || 0) : 0);
    for (const m of meshes) { m.count = slots.length; m.visible = true; }
  }
  // aa-r1 LOD CROSS-FADE (task: "LOD cross-fades instead of pops where
  // cheap"): a tree crossing the 260/290 m hysteresis band used to swap
  // card-canopy <-> lobe-canopy in one frame. Now the crossing tree holds
  // BOTH representations for ~0.35 s while its NEAR side dissolves through
  // the stable two-octave IGN dither (aLodF -> vLodF -> the existing
  // fadeKeep discard — the exact killcam/scope-corridor pattern, no
  // per-frame reseeding): out-cross = far appears solid immediately, near
  // dithers OUT over it; in-cross = near dithers IN over the still-solid
  // far, which is only dropped when the fade lands. No silhouette holes at
  // any point (one representation is always full), and the per-frame GPU
  // traffic is one float per transitioning tree via the ranged-upload path.
  // dt == 0 (shot mode) snaps transitions complete — captures stay
  // deterministic. Transitioning trees are skipped by repartition until
  // their fade settles (the 30 m hysteresis band makes a genuine re-cross
  // inside 0.35 s unreachable at any vehicle speed).
  const LOD_FADE_S = 0.35;
  interface LodTransition {
    t: TreeRecord;
    dir: 1 | -1;
  }
  const lodTransitions: LodTransition[] = []; // { t, dir: +1 near-fades-out | -1 near-fades-in }
  function writeLodFade(t: TreeRecord): void {
    if (t.slot < 0) return;
    for (const m of nearMeshes[t.species][t.variant]) {
      const lf = attribute(m.geometry, 'aLodF');
      lf.array[t.slot] = t.lodF;
      lf.addUpdateRange(t.slot, 1);
      lf.needsUpdate = true;
    }
  }
  function tickLodTransitions(dt: number): void {
    if (lodTransitions.length === 0) return;
    const step = dt > 0 ? dt / LOD_FADE_S : 1; // dt 0 = deterministic snap
    for (let i = lodTransitions.length - 1; i >= 0; i--) {
      const tr = lodTransitions[i];
      const t = tr.t;
      t.lodF = clamp(t.lodF + step * tr.dir, 0, 1);
      const done = tr.dir > 0 ? t.lodF >= 1 : t.lodF <= 0;
      if (!done) {
        writeLodFade(t);
        continue;
      }
      if (tr.dir > 0) { // near faded out — retire the near representation
        t.lodF = 0;
        removeFromGroup(nearMeshes[t.species][t.variant], nearSlots[t.species][t.variant], t, 'slot', true);
      } else {          // near fully in — drop the far stand-in beneath it
        writeLodFade(t);
        removeFromGroup(farMeshes[t.species][t.fv], farSlots[t.species][t.fv], t, 'fslot', false);
      }
      t.lodT = false;
      lodTransitions.splice(i, 1);
    }
  }
  function repartitionTrees(camPos: THREE.Vector3): void {
    if (!_partitionBuilt) { rebuildPartitionFull(camPos); return; }
    for (const t of trees) {
      if (t.lodT) continue; // mid cross-fade — settle before re-deciding
      const d = Math.hypot(t.x - camPos.x, t.z - camPos.z);
      const promo = scopePromoted(t, camPos); // scope corridor mesh promotion
      if (t.near) {
        if (d > treeNearOut && !promo) {
          t.near = false;
          t.lodT = true;
          t.lodF = 0; // near side starts solid, dissolves out
          addToGroup(farMeshes[t.species][t.fv], farSlots[t.species][t.fv], t, 'fslot', false);
          lodTransitions.push({ t, dir: 1 });
        }
      } else if (d < treeNearIn || promo) {
        t.near = true;
        t.lodT = true;
        t.lodF = 1; // near side arrives fully dissolved, fades in
        addToGroup(nearMeshes[t.species][t.variant], nearSlots[t.species][t.variant], t, 'slot', true);
        lodTransitions.push({ t, dir: -1 });
      }
    }
  }
  /** One-time full partition build (map load / world rebuild): plain full
   * uploads, and seeds the slot bookkeeping the incremental path maintains. */
  function clearPartitionSlots(): void {
    for (const species of speciesList) {
      for (const slots of nearSlots[species]) slots.length = 0;
      for (const slots of farSlots[species]) slots.length = 0;
    }
  }
  function seedTreePartition(tree: TreeRecord, camPos: THREE.Vector3): void {
    tree.lodT = false;
    tree.lodF = 0;
    const distance = Math.hypot(tree.x - camPos.x, tree.z - camPos.z);
    tree.near = distance < treeNearIn || (tree.near && distance <= treeNearOut)
      || scopePromoted(tree, camPos);
    if (tree.near) {
      const slots = nearSlots[tree.species][tree.variant];
      tree.slot = slots.length;
      tree.fslot = -1;
      slots.push(tree);
      for (const mesh of nearMeshes[tree.species][tree.variant]) {
        mesh.setMatrixAt(tree.slot, tree.mat);
        mesh.setColorAt(tree.slot, tree.tint);
        attribute(mesh.geometry, 'aFadeI').array[tree.slot] = tree.fade;
        const lodFade = mesh.geometry.getAttribute('aLodF') as THREE.BufferAttribute | undefined;
        if (lodFade) lodFade.array[tree.slot] = 0;
      }
      return;
    }
    const slots = farSlots[tree.species][tree.fv];
    tree.fslot = slots.length;
    tree.slot = -1;
    slots.push(tree);
    for (const mesh of farMeshes[tree.species][tree.fv]) {
      mesh.setMatrixAt(tree.fslot, tree.mat);
      mesh.setColorAt(tree.fslot, tree.tint);
      const fade = mesh.geometry.getAttribute('aFadeI') as THREE.BufferAttribute | undefined;
      if (fade) fade.array[tree.fslot] = 0;
      const lodFade = mesh.geometry.getAttribute('aLodF') as THREE.BufferAttribute | undefined;
      if (lodFade) lodFade.array[tree.fslot] = 0;
    }
  }
  function uploadNearPartition(species: Species, variant: number): void {
    for (const mesh of nearMeshes[species][variant]) {
      mesh.count = nearSlots[species][variant].length;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.needsUpdate = true;
      }
      const fade = attribute(mesh.geometry, 'aFadeI');
      fade.clearUpdateRanges();
      fade.needsUpdate = true;
      const lodFade = mesh.geometry.getAttribute('aLodF') as THREE.BufferAttribute | undefined;
      if (lodFade) {
        lodFade.clearUpdateRanges();
        lodFade.needsUpdate = true;
      }
      mesh.visible = mesh.count > 0;
    }
  }
  function uploadFarPartition(species: Species, variant: number): void {
    for (const mesh of farMeshes[species][variant]) {
      mesh.count = farSlots[species][variant].length;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.needsUpdate = true;
      }
      const lodFade = mesh.geometry.getAttribute('aLodF') as THREE.BufferAttribute | undefined;
      if (lodFade) {
        lodFade.clearUpdateRanges();
        lodFade.needsUpdate = true;
      }
      mesh.visible = mesh.count > 0;
    }
  }
  function uploadPartition(): void {
    for (const species of speciesList) {
      for (let variant = 0; variant < NEAR_VARIANTS; variant += 1) {
        uploadNearPartition(species, variant);
      }
      for (let variant = 0; variant < FAR_VARIANTS; variant += 1) {
        uploadFarPartition(species, variant);
      }
    }
  }
  function rebuildPartitionFull(camPos: THREE.Vector3): void {
    _partitionBuilt = true;
    lodTransitions.length = 0;
    clearPartitionSlots();
    for (const t of trees) {
      // A full rebuild is an authoritative partition snapshot. Never carry a
      // half-complete near-LOD dissolve into the new instance layout: stale
      // aLodF slots make a whole tree shadow change coverage on the next map
      // refresh even though its visible representation is already settled.
      seedTreePartition(t, camPos);
    }
    uploadPartition();
  }

  // gameplay_feel r6 (round critique MAJOR "no crushable vegetation"): trees
  // with trunk obstacles hinge-topple under a moving hull. state.ts owns the
  // overlap detection (hull OBB vs the tagged treeObstacles record above) and
  // calls world.crushObstacle → crushTree(ob, dx, dz); the fall recomposes
  // tree.mat from the ORIGINAL placement about the trunk base every tick
  // (props.ts crushProp pattern) and writes it through the existing near/far
  // slot plumbing (writeTreeSlot handles the ranged GPU uploads), so the
  // felled trunk persists as set dressing exactly where it dropped.
  interface TreeCrushAnimation {
    t: TreeRecord;
    base: THREE.Matrix4;
    x: number;
    y: number;
    z: number;
    ax: number;
    az: number;
    u: number;
    maxAng: number;
  }
  const treeCrushAnims: TreeCrushAnimation[] = [];
  const _tcq = new THREE.Quaternion();
  const _tcax = new THREE.Vector3();
  const _tcm1 = new THREE.Matrix4();
  const _tcm2 = new THREE.Matrix4();
  function crushTree(ob: TreeObstacle, dx: number, dz: number): boolean {
    const t = trees[ob.treeIdx];
    if (!t || t.crushed) return false;
    if (!t.uprightMat) t.uprightMat = t.mat.clone();
    t.crushed = true;
    ob.crushed = true;
    ob.dead = true;
    setToppleAxis(_tcax, dx, dz);
    treeCrushAnims.push({
      t, base: t.mat.clone(), x: t.x, y: ob.min[1], z: t.z,
      ax: _tcax.x, az: _tcax.z, u: 0,
      maxAng: settledToppleAngle(heightField, t.x, ob.min[1], t.z, dx, dz,
        t.fallH!, t.fallR!),
    });
    return true;
  }
  function resetToppled(): void {
    treeCrushAnims.length = 0;
    for (const ob of treeObstacles) {
      ob.crushed = false;
      ob.dead = false;
      ob._pressS = 0;
      ob._pressT = -1e9;
      const t = trees[ob.treeIdx];
      if (!t || !t.crushed || !t.uprightMat) continue;
      t.crushed = false;
      t.mat.copy(t.uprightMat);
      if (t.slot >= 0) writeTreeSlot(nearMeshes[t.species][t.variant], t.slot, t, t.fade);
      if (t.fslot >= 0) writeTreeSlot(farMeshes[t.species][t.fv], t.fslot, t, 0);
    }
  }
  function updateTreeCrush(dt: number): void {
    for (let k = treeCrushAnims.length - 1; k >= 0; k--) {
      const a = treeCrushAnims[k];
      a.u = Math.min(a.u + dt / 1.15, 1.1);
      const e = Math.min(a.u / 0.82, 1);
      // Terrain-seated fall along the ram direction + a small settle bounce.
      let ang = a.maxAng * e * e * (3 - 2 * e);
      if (a.u > 0.82) {
        ang = a.maxAng - 0.035 * Math.sin((a.u - 0.82) * 17) * Math.exp(-(a.u - 0.82) * 5.5);
      }
      _tcax.set(a.ax, 0, a.az).normalize();
      _tcq.setFromAxisAngle(_tcax, ang);
      a.t.mat.makeTranslation(a.x, a.y, a.z)
        .multiply(_tcm1.makeRotationFromQuaternion(_tcq))
        .multiply(_tcm2.makeTranslation(-a.x, -a.y, -a.z))
        .multiply(a.base);
      if (a.t.slot >= 0) {
        writeTreeSlot(nearMeshes[a.t.species][a.t.variant], a.t.slot, a.t, a.t.fade);
      }
      if (a.t.fslot >= 0) {
        writeTreeSlot(farMeshes[a.t.species][a.t.fv], a.t.fslot, a.t, 0);
      }
      if (a.u >= 1.1) treeCrushAnims.splice(k, 1); // final pose persists in t.mat
    }
  }

  const grassSelection: {
    urgent: GrassChunk | null;
    ahead: GrassChunk | null;
    aheadDistance: number;
  } = { urgent: null, ahead: null, aheadDistance: Infinity };

  function selectGrassBuild(camPos: THREE.Vector3): void {
    grassSelection.urgent = null;
    grassSelection.ahead = null;
    grassSelection.aheadDistance = Infinity;
    const movedFromSpawn = Math.hypot(camPos.x - spawn.x, camPos.z - spawn.z);
    const grassAhead = grassFadeEnd + (movedFromSpawn > 28 ? CHUNK_SIZE * 0.5 : 32);
    for (const chunk of grassChunks) {
      const distance = Math.max(0,
        Math.hypot(camPos.x - chunk.cx, camPos.z - chunk.cz) - CHUNK_SIZE * 0.71);
      chunk.cameraDist = distance;
      if (chunk.built) continue;
      if (distance < grassFadeEnd && !grassSelection.urgent) {
        grassSelection.urgent = chunk;
      } else if (distance < grassAhead && distance < grassSelection.aheadDistance) {
        grassSelection.ahead = chunk;
        grassSelection.aheadDistance = distance;
      }
    }
  }

  function advanceDeferredGrass(): void {
    if (!deferFarGrass) return;
    const urgent = grassSelection.urgent;
    if (urgent) {
      if (grassBuildJob && grassBuildJob !== urgent) advanceGrassChunk(grassBuildJob, grassPerChunk);
      if (!urgent.built) {
        beginGrassChunk(urgent);
        advanceGrassChunk(urgent, grassPerChunk);
      }
      return;
    }
    if (!grassBuildJob && grassSelection.ahead) beginGrassChunk(grassSelection.ahead);
    if (grassBuildJob) advanceGrassChunk(grassBuildJob, 250);
  }

  function updateGrassVisibility(): void {
    for (const chunk of grassChunks) {
      if (!chunk.built) continue;
      const distance = chunk.cameraDist ?? Infinity;
      const visibleFraction = distance < grassFadeEnd
        ? 1 - 0.94 * smoothstepJs(56, grassTaperEnd, distance) : 0;
      if (distance > 48) chunk.lod = true;
      else if (distance < 40) chunk.lod = false;
      for (const record of chunk.meshes ?? []) {
        const count = Math.floor(record.total * visibleFraction);
        record.mesh.visible = count > 0;
        if (count > 0) record.mesh.count = count;
        const geometry = chunk.lod ? record.geoFar : record.geoNear;
        if (record.mesh.geometry !== geometry) record.mesh.geometry = geometry;
      }
    }
  }

  function updatePartitionCaches(camPos: THREE.Vector3): void {
    const carpetCellX = Math.floor(camPos.x / CARPET_CELL);
    const carpetCellZ = Math.floor(camPos.z / CARPET_CELL);
    if (carpetCellX !== _carpetCellX || carpetCellZ !== _carpetCellZ) {
      _carpetCellX = carpetCellX;
      _carpetCellZ = carpetCellZ;
      rebuildCarpet(camPos);
      return;
    }
    if (_lastCam.distanceToSquared(camPos) <= 36 && !scopeRepartitionPending) return;
    scopeRepartitionPending = false;
    _lastCam.copy(camPos);
    repartitionTrees(camPos);
  }

  function update(
    dt: number,
    camPos: THREE.Vector3,
    camFwd: THREE.Vector3 | null = null,
    focusPos: THREE.Vector3 | null = null,
  ): void {
    uWindTime.value += dt;
    if (treeCrushAnims.length) updateTreeCrush(dt); // gameplay_feel r6 topples
    uCamPos.value.copy(camPos);
    if (camFwd) uCamFwd.value.copy(camFwd);
    uSniperFade.value += (sniperFadeTarget - uSniperFade.value) *
      (1 - Math.exp(-(dt || 0) / 0.08));
    // Do not spend the opening/countdown frames filling an invisible outer
    // ring while the tank is parked. Once the camera has travelled roughly
    // two hull lengths, stream half a chunk ahead of the fade band. A grass
    // chunk finishes in under one second at the bounded 250-candidate/frame
    // rate, while 64 m is more than three seconds of lookahead at 72 km/h.
    // The former full-chunk margin started several wholly invisible 12k-tuft
    // jobs during the first live drive and needlessly kept terrain/noise work
    // resident on the main thread; the rendered fade band is unchanged.
    selectGrassBuild(camPos);
    advanceDeferredGrass();
    // Continuous density rolloff and hysteretic geometry LOD keep the far
    // meadow sub-pixel work bounded without a visible band transition.
    updateGrassVisibility();
    // Stagger the two rebuild classes so a carpet upload and tree repartition
    // never land on the same frame.
    // Rebuild only after crossing a 16 m cache-cell boundary. The previous
    // seven-meter distance trigger uploaded several MB while merely orbiting
    // the camera; the circular shader fade keeps this coarser recenter hidden.
    updatePartitionCaches(camPos);
    tickLodTransitions(dt); // aa-r1: advance LOD cross-fades (dt 0 snaps)
    updateOcclusionFade(dt, camPos, focusPos);
  }

  function setWindTime(t: number): void { uWindTime.value = t; }

  /**
   * Drive sniper near-grass suppression (0 = arcade, 1 = sniper). The value
   * eases in update(); pass `immediate` to snap (deterministic screenshots).
   * @param {number} f target fade 0..1
   * @param {boolean} [immediate=false] skip the ease
   * @param {number} [fovDeg] live camera FOV. While scoped at ≤15° (x4/x8)
   *   the corridor/bush fades switch from screen-door dither to a binary
   *   cut (uScopeHard) so the magnified picture carries no stipple.
   */
  function setSniperFade(
    f: number,
    immediate = false,
    fovDeg: number | null = null,
    aimDistM: number | null = null,
  ): void {
    sniperFadeTarget = clamp(f, 0, 1);
    if (immediate) uSniperFade.value = sniperFadeTarget;
    if (sniperFadeTarget < 0.5) uScopeHard.value = 0;
    else if (fovDeg != null) uScopeHard.value = fovDeg <= 15 ? 1 : 0;
    // r5: scope-ray corridor reaches the aimed point (see uScopeDist). The
    // 70 m floor keeps the r4 near-field behavior when aiming at a close
    // wall; the 640 m cap covers the max fire range with margin.
    if (aimDistM != null) uScopeDist.value = clamp(Math.max(70, aimDistM - 4), 70, 640);
    // hud_ui r6: zoom-scaled impostor→mesh promotion radius (aim corridor)
    const wasR = scopeZoomR;
    scopeZoomR = (sniperFadeTarget >= 0.5 && fovDeg != null && fovDeg <= 15)
      ? Math.min(720, treeNearIn * clamp(30 / fovDeg, 1, 3.4)) : 0;
    if (Math.abs(scopeZoomR - wasR) > 1) scopeRepartitionPending = true;
  }

  return { group, update, setWindTime, setSniperFade, treeObstacles, concealers,
    crushTree, resetToppled, _clusters: clusters };
}
