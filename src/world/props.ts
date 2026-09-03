// src/world/props.ts — rocks, ~10-building village, walls and cover props.
// Contract: docs/ARCHITECTURE.md §3.2. All geometry composed BufferGeometry,
// all textures canvas-generated, everything merged into few draw calls.

import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise } from '../engine/simplexFast.ts';
import {
  normalTextureFromHeight as normalFromHeight,
  textureFromRgbaPixels as toTexture,
  tileableTorusNoise as torusN,
} from './proceduralTexture.ts';
import { applyTone, type HeightField, type TerrainLayout } from './terrain.ts';
import { getDeviceTier } from '../engine/quality.ts';
import { markShadowOnly } from '../engine/renderLayers.ts';
import { destructibleCastsShadow } from './destructibleRenderPolicy.ts';
import { applySourcedBuildings } from './sourcedTextures.ts';
import { URBAN_BUILDERS } from './maps/urbanKit.ts';
import { dressMapExtras } from './maps/mapKits.ts'; // content_breadth r2
// world-dressing r1: building-catalog extension + destructible small props
import { VILLAGE_BUILDERS } from './maps/villageKit.ts';
import {
  DESTRUCTIBLE_TYPES,
  FENCE_SEG,
  WALL_SEG,
  bSandbagBroken,
  type DestructiblePropType,
} from './maps/inhabitKit.ts';
import { pickCivilianVehicleKind } from './maps/civilianVehicleKit.ts';
import {
  DESTRUCTIBLE_BUILDING_TYPES, STRUCTURE_BUILDERS,
} from './maps/structureKit.ts';
import { addCatalogExterior, addConnectedExterior } from './maps/exteriorDetailKit.ts';
import { registerWorldDestructibles, emitBreakFx, emitDestroyed } from './destructibles.ts';
import { setToppleAxis, settledToppleAngle } from './topple.ts';
import { createUtilityNetwork } from './utilityNetwork.ts';
import {
  LOOSE_PROP_STEP_S, createLoosePropBody, kickLooseProp, resetLoosePropBody,
  resolveLoosePropObstacle, resolveLoosePropPair, stepLoosePropBody,
} from './loosePropPhysics.ts';
import {
  cloneCollisionRecord, convexHull2, setCircleShape, setConvexShape, setObbShape,
} from './collision.ts';
import {
  appendStructureCollisionBand, applyStructureCollisionBand, deriveStructureCollisionProfile,
} from './structureCollision.ts';
import {
  hedgehogBeamSpecs, planGroundedObbPose, planGroundedSegment, planUtilityPoleStation,
  sampleDiscGround, sampleObbGround, type GroundedSegmentEndpoint,
} from './propPlacement.ts';
import {
  box, gablePrism, jitterUV, makeTelephonePoleDistanceGeometry,
  pitchSkillionRoof, scaleUV, slabBox,
} from './propGeometry.ts';
// DESTRUCTIBLES r1: real-roster tank wrecks baked to static geometry
import { bakeTankWreck, bakeWreckDebris, wreckPool } from './wrecks.ts';
import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { isPostwarVehicleEra } from '../vehicles/taxonomy.ts';
import { preloadPropModels, requirePropModels, type BakedPropModel } from './propsModelStore.ts';
import {
  resolveRowhouseTrimBucket, resolveStructureWindowStyle, writeStructureInstanceTint,
} from './structureInstanceAppearance.ts';
import {
  SOURCED_STRUCTURE_TYPES, type SourcedStructureType,
} from './sourcedStructureTypes.ts';
import type { CollisionRecord } from './collision.ts';
import type { LoosePropBody, LoosePropKickCause } from './loosePropPhysics.ts';
import type { UtilityNetwork } from './utilityNetwork.ts';
import type { GeometryBuckets, StructureDimensions } from './maps/exteriorDetailKit.ts';
// Build-time-baked licensed models (see tools/bake-props-models.mjs +
// docs/ATTRIBUTION.md). The exact float/index streams live in a gzip-packed
// binary archive; createMapAsync starts it while terrain is being constructed.
export { preloadPropModels };

// Per-category switch: sourced model vs procedural, set from side-by-side
// screenshot judging on 2026-07-27 (record in docs/ATTRIBUTION.md). Only the
// two winners survive; every losing category (buildings, ruin, rocks, fences,
// hay, haystacks, barrels, trees, tank wrecks) stays procedural and its
// models were removed from the repo.
const SOURCED = {
  sandbags: true, // sandbag emplacements — no procedural equivalent, fits the palette
  poles: true,    // telephone poles with crossarms/insulators/wire beat the plain cylinders
};

type Rng = () => number;
type ToneFunction = (
  hue: number,
  saturation: number,
  lightness: number,
) => readonly [number, number, number];
type MaterialShader = Parameters<THREE.Material['onBeforeCompile']>[0];
type MaterialShaderHook = (shader: MaterialShader) => void;
type PropsBuckets = GeometryBuckets & Record<string, THREE.BufferGeometry[]>;

interface CompletePropsBuckets extends GeometryBuckets {
  plaster: THREE.BufferGeometry[];
  plaster2: THREE.BufferGeometry[];
  plaster3: THREE.BufferGeometry[];
  stone: THREE.BufferGeometry[];
  roof: THREE.BufferGeometry[];
  wood: THREE.BufferGeometry[];
  dark: THREE.BufferGeometry[];
  glass: THREE.BufferGeometry[];
  curtain: THREE.BufferGeometry[];
  straw: THREE.BufferGeometry[];
  baked: THREE.BufferGeometry[];
  [name: string]: THREE.BufferGeometry[];
}
type PropsStructureBuilder = (
  rng: Rng,
  buckets: PropsBuckets,
  wallBucket?: string,
) => StructureDimensions;

interface EngineContext {
  anisotropy?: number;
  setupShadowMaterial(material: THREE.Material, hook?: MaterialShaderHook | null): void;
}

interface SurfaceTextureOptions {
  roughMin?: number;
  roughMax?: number;
  aoMin?: number;
}

interface GeneratedSurfaceTextures {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  surface: THREE.Texture;
}

interface BakedGeometryOptions {
  targetH?: number;
  targetW?: number;
  scale?: number;
  burn?: number;
  mul?: number;
  sink?: number;
  sourceZMin?: number;
  sourceZMax?: number;
  whiteCap?: readonly [number, number, number];
}

interface RowhouseDimensions {
  w: number;
  d: number;
  lowContrastTrim?: boolean;
}

interface InhabitSettings {
  stalls?: number;
  benches?: number;
  coreClutter?: number;
  bales?: number;
  stooks?: number;
  sleds?: number;
  drums?: number;
  pots?: number;
  trucks?: number;
  jeeps?: number;
  drumClusters?: number;
  looseClutter?: number;
  camps?: number;
  carts?: number;
  modernClutter?: number | Record<string, number>;
  roadFence?: string;
  yardFence?: string;
  troughs?: number;
  churns?: number;
  laundry?: number;
  handcarts?: number;
}

interface TacticalOutcropSettings {
  count?: number;
  radius?: number;
  scaleMin?: number;
  scaleMax?: number;
}

interface TacticalBeatSettings {
  id?: string;
  role?: string;
  x: number;
  z: number;
  yawDeg?: number;
  structure?: string;
  reservePad?: number;
  maxSpread?: number;
  redoubt?: boolean;
  redoubtOffset?: number;
  outcrop?: TacticalOutcropSettings | false;
  wreck?: boolean;
  wreckYawDeg?: number;
  wreckOffsetX?: number;
  wreckOffsetZ?: number;
}

interface TankWreckSettings {
  count?: number;
  era?: string;
  ids?: string[];
  debris?: boolean;
  maxGroundEmbed?: number;
}

type WallRun = readonly [number, number, number, number, number?];

interface PropsSettings {
  plan: string[];
  tones: Record<string, ToneFunction | null | undefined>;
  rockTone: ToneFunction | null;
  wallStoneChance: number;
  buildingLat: readonly [number, number];
  sideSkip: number;
  maxSpread: number;
  spacingPad: number;
  wallRuns: WallRun[] | null;
  well: boolean;
  hayCrates: boolean;
  fences: boolean;
  telegraph: boolean;
  carts: boolean;
  logs: boolean;
  haystacks: number;
  rocks: number;
  outcrops: number;
  craters: number;
  rubblePiles: number;
  wrecks: number;
  cropFields: number;
  lampposts: boolean;
  hedgehogs: number;
  destructibleBuildings: string[];
  tacticalBeats: TacticalBeatSettings[];
  streetRows: boolean;
  curbs: boolean;
  monument: boolean;
  townCraters: boolean;
  snowCap?: boolean;
  streetRowsAfterLandmarks?: boolean;
  streetRowRoadStride?: number;
  ruinChance?: number;
  blockFill?: boolean;
  destructibleBuildingLat?: readonly [number, number];
  yardClutter?: boolean;
  inhabit?: InhabitSettings;
  wallStyle?: string;
  sandbagLines?: number;
  tankWrecks?: TankWreckSettings;
  rockSink?: number;
  extraKits?: readonly string[] | null;
}

export interface PropsMapConfig {
  id: string;
  props?: Partial<PropsSettings>;
}

interface PlacedBuilding {
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
}

interface TacticalBeatFeature {
  id?: string;
  role?: string;
  x: number;
  z: number;
  structurePlaced: boolean;
  redoubt: boolean;
}

interface PlacedRadius {
  x: number;
  z: number;
  rr: number;
}

interface DecorationGroundingReceipt {
  kind: string;
  x: number;
  y: number;
  z: number;
  relief?: number;
  baseClearance?: number;
  start?: GroundedSegmentEndpoint;
  end?: GroundedSegmentEndpoint;
  supportMin?: number;
  supportMax?: number;
  specId?: string;
  [name: string]: string | number | boolean | GroundedSegmentEndpoint | undefined;
}

interface UtilityPoleGroundingReceipt {
  x: number;
  y: number;
  z: number;
  supportMin: number;
  supportMax: number;
  supportSpread: number;
}

interface UtilityPolePlacementReceipt {
  station: number;
  paired: boolean;
  pairRelief: number;
  yaw: number;
  poles: UtilityPoleGroundingReceipt[];
}

interface BakedInstanceGroup {
  geo: THREE.BufferGeometry;
  list: THREE.Matrix4[];
}

type DestructibleClass = 'break' | 'topple' | 'toss' | 'physics';

interface PropsDestructibleMeta extends Omit<DestructiblePropType, 'cls' | 'mat'> {
  cls: DestructibleClass;
  mat: string;
  airDrag?: number;
  instanceTintStrength?: number;
}

interface PropsCollisionRecord extends CollisionRecord {
  __looseStamp?: number;
  _pressS?: number;
  _pressT?: number;
  hedgehogId?: number;
}

interface GroundSupportRecord {
  y?: number;
  min: number;
  max: number;
  spread: number;
  mode: 'pitched' | 'obb' | 'disc';
}

export interface CrushableRecord {
  x: number;
  y: number;
  z: number;
  r: number;
  h: number;
  toppled: boolean;
  index?: number;
  recIdx?: number;
  kind?: string;
  dynamic?: boolean;
  wirePoleIndex?: number;
}

interface DestructibleRecord {
  kind: string;
  cls: DestructibleClass;
  x: number;
  y: number;
  z: number;
  yaw: number;
  sc: number;
  r: number;
  h: number;
  slot: number;
  state: number;
  ob: PropsCollisionRecord | null;
  col?: CollisionRecord;
  loopRef?: CrushableRecord;
  groundSupport: GroundSupportRecord | null;
  looseIndex?: number;
  body?: LoosePropBody;
  looseListed?: boolean;
  _dKey?: string;
  _destructibleIndex?: number;
}

interface LooseDestructibleRecord extends DestructibleRecord {
  looseIndex: number;
  body: LoosePropBody;
  looseListed: boolean;
}

interface DestructiblePool {
  meta: PropsDestructibleMeta;
  mats4: THREE.Matrix4[];
  records: DestructibleRecord[];
  imI: THREE.InstancedMesh | null;
  imB: THREE.InstancedMesh | null;
  nBroken: number;
}

interface PoleMatrixWriter {
  instanceMatrix: { needsUpdate: boolean };
  getMatrixAt(index: number, target: THREE.Matrix4): void;
  setMatrixAt(index: number, matrix: THREE.Matrix4): void;
}

interface BaseCrushAnimation {
  im: THREE.InstancedMesh | PoleMatrixWriter;
  index: number;
  x: number;
  y: number;
  z: number;
  ax: number;
  az: number;
  t: number;
  placement: THREE.Matrix4 | null;
}

interface ToppleAnimation extends BaseCrushAnimation {
  type?: undefined;
  maxAng: number;
  wirePoleIndex?: number;
}

interface TossAnimation extends BaseCrushAnimation {
  type: 'toss';
  h: number;
  vx: number;
  vy: number;
  vz: number;
  dur: number;
  spin?: number;
  r?: number;
}

type CrushAnimation = ToppleAnimation | TossAnimation;

interface PendingBlast {
  x: number;
  y: number;
  z: number;
}

interface ShellImpactSettings {
  r?: number;
  he?: boolean;
  cause?: LoosePropKickCause;
}

interface PropsBuildSlice {
  fine?: boolean;
  tankBuilder?: string;
}

interface TankWreckSpot {
  specId: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hx: number;
  hz: number;
  h: number;
  debrisTris: number;
  supportMin: number;
  supportMax: number;
  supportSpread: number;
  supportMaxEmbed: number;
  supportMaxFloat: number;
}

interface WreckBake {
  geo: THREE.BufferGeometry;
  shadowGeo: THREE.BufferGeometry | null;
  hx: number;
  hz: number;
  h: number;
  tris: number;
}

export interface PropsRuntime {
  group: THREE.Group;
  obstacles: PropsCollisionRecord[];
  colliders: CollisionRecord[];
  crushables: CrushableRecord[];
  crushProp(index: number, dx: number, dz: number, speed?: number): boolean;
  crushDestructible(
    propIndex: number,
    dx: number,
    dz: number,
    speed?: number,
    cause?: LoosePropKickCause,
  ): boolean;
  destructibles: DestructibleRecord[];
  looseRecords: DestructibleRecord[];
  updateProps(deltaSeconds: number, cameraPosition?: THREE.Vector3 | null): void;
  resetDestructibles(): void;
  tankWreckSpots: TankWreckSpot[];
  utilityNetwork: UtilityNetwork | null;
  utilityPolePlacements: UtilityPolePlacementReceipt[];
  decorationGroundingReceipts: DecorationGroundingReceipt[];
  sourcedTexturesReady: Promise<void[]>;
  getLoosePropStats(): { total: number; active: number };
  features: {
    buildings: PlacedBuilding[];
    tacticalBeats: TacticalBeatFeature[];
  };
}

const PROP_TYPE_REGISTRY: Readonly<Record<string, PropsDestructibleMeta>> = DESTRUCTIBLE_TYPES;

function canvas2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('world/props: Canvas2D context unavailable');
  return context;
}

export function mulberry32(a: number): Rng {return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function clamp(x: number, a: number, b: number): number { return x < a ? a : x > b ? b : x; }
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------

// One linear ORM-style texture feeds both material slots: AO reads red and
// roughness reads green. Packing them together adds real PBR response without
// doubling the building texture/upload budget.
function surfaceFromHeight(h: Float32Array, s: number, anisotropy: number, {
  roughMin = 0.72, roughMax = 0.98, aoMin = 0.76,
}: SurfaceTextureOptions = {}): THREE.CanvasTexture {
  const px = new Uint8ClampedArray(s * s * 4);
  for (let i = 0; i < h.length; i++) {
    const height = clamp(h[i], 0, 1);
    const j = i * 4;
    px[j] = (aoMin + height * (1 - aoMin)) * 255;
    px[j + 1] = (roughMin + (1 - height) * (roughMax - roughMin)) * 255;
    px[j + 2] = 0;
    px[j + 3] = 255;
  }
  return toTexture(px, s, { anisotropy });
}

const _col = new THREE.Color();

function makePlaster(
  noi: SimplexNoise,
  anisotropy: number,
  tone: ToneFunction | null = null,
): GeneratedSurfaceTextures {
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const n1 = noi.noise(x * 0.045, y * 0.045) * 0.5 + 0.5;
    const n2 = noi.noise(x * 0.16 + 40, y * 0.16 - 21) * 0.5 + 0.5;
    const stain = smoothstep(0.55, 0.9, noi.noise(x * 0.02 - 90, y * 0.05 + 33) * 0.5 + 0.5);
    const streak = smoothstep(0.60, 0.92, noi.noise(x * 0.11 + 250, y * 0.018 - 7) * 0.5 + 0.5);
    // weathered plaster: mid albedo so full sun never blows it to white
    const l = 0.44 + n1 * 0.08 + n2 * 0.04 - stain * 0.15 - streak * 0.08;
    _col.setHSL(0.085, 0.13 - stain * 0.05, l);
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = n1 * 0.5 + n2 * 0.5;
  }
  applyTone(px, tone);
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 1.2, anisotropy),
    surface: surfaceFromHeight(hgt, s, anisotropy, { roughMin: 0.84, roughMax: 0.98, aoMin: 0.80 }),
  };
}

function makeRoofTiles(
  noi: SimplexNoise,
  anisotropy: number,
  tone: ToneFunction | null = null,
): GeneratedSurfaceTextures {
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const rowH = 32, tileW = 42;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const row = Math.floor(y / rowH);
    const off = (row % 2) * tileW * 0.5;
    const tile = Math.floor((x + off) / tileW);
    const tRng = noi.noise(tile * 13.7 + 3, row * 7.9 - 11) * 0.5 + 0.5; // per-tile tone
    const inRowY = (y % rowH) / rowH;
    const inTileX = ((x + off) % tileW) / tileW;
    // AA spec (4eccce8): WIDER grooves + softer groove contrast — the 1-2px
    // repeating tile-gap rows with bright specular rims were the loudest
    // remaining shimmer at range (rim softening pairs with the lower
    // normal-map strength below)
    const gap = (inRowY < 0.14 || inTileX < 0.09) ? 1 : 0;
    const curve = Math.sin(inTileX * Math.PI) * 0.5 + 0.5;
    const wear = noi.noise(x * 0.1 - 60, y * 0.1 + 45) * 0.5 + 0.5;
    _col.setHSL(0.028 + tRng * 0.02, 0.42 - wear * 0.12, (0.26 + tRng * 0.10 + curve * 0.04) * (gap ? 0.55 : 1));
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = gap ? 0.16 : 0.4 + curve * 0.5 + (1 - inRowY) * 0.15;
  }
  applyTone(px, tone);
  // normal strength 2.4 -> 1.8: damps the per-tile specular rim glints that
  // aliased into fireflies once a roof fell below ~2px/tile on screen
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 1.8, anisotropy),
    surface: surfaceFromHeight(hgt, s, anisotropy, { roughMin: 0.70, roughMax: 0.94, aoMin: 0.73 }),
  };
}

function buildStoneCourseEdges(size: number, rng: () => number): number[] {
  const rowE = [0];
  while (rowE[rowE.length - 1] < size) {
    let nxt = rowE[rowE.length - 1] + 88 + ((rng() * 72) | 0);
    if (size - nxt < 70) nxt = size;
    rowE.push(nxt);
  }
  return rowE;
}

function buildStoneColumnEdges(size: number, rowCount: number, rng: () => number): number[][] {
  const stoneE: number[][] = [];
  for (let row = 0; row < rowCount; row++) {
    const e = [0];
    while (e[e.length - 1] < size) {
      let nxt = e[e.length - 1] + 105 + ((rng() * 125) | 0);
      if (size - nxt < 88) nxt = size;
      e.push(nxt);
    }
    stoneE.push(e);
  }
  return stoneE;
}

function intervalAt(edges: readonly number[], value: number): number {
  let index = 0;
  while (edges[index + 1] <= value) index++;
  return index;
}

function paintStoneRow(
  noi: SimplexNoise,
  pixels: Uint8ClampedArray,
  heights: Float32Array,
  size: number,
  y: number,
  rowEdges: readonly number[],
  columnEdges: readonly (readonly number[])[],
): void {
  const row = intervalAt(rowEdges, y);
  const columns = columnEdges[row];
  for (let x = 0; x < size; x++) {
    const i = y * size + x, j = i * 4;
    const wob = noi.noise(x * 0.085 + row * 31, y * 0.085 - 17) * 3.4;
    const dRow = Math.min(y - rowEdges[row], rowEdges[row + 1] - y) + wob * 0.6;
    const column = intervalAt(columns, x);
    const dCol = Math.min(x - columns[column], columns[column + 1] - x) + wob;
    const edgeD = Math.min(dRow, dCol * 0.9);
    const mortar = edgeD < 3.6 ? 1 : 0;
    const tone = noi.noise(row * 13.3 + column * 29.7 + 3.1,
      row * 7.7 - column * 11.9) * 0.5 + 0.5;
    const grain = noi.noise(x * 0.11 + 8, y * 0.11 - 77) * 0.5 + 0.5;
    const grime = smoothstep(0.5, 0.95,
      noi.noise(x * 0.016 + 130, y * 0.028 + 71) * 0.5 + 0.5);
    const bevel = clamp((edgeD - 3.6) / 15, 0, 1);
    _col.setHSL(
      0.081 + tone * 0.014,
      0.06 + tone * 0.055 - grime * 0.02,
      (mortar ? 0.25 + grain * 0.04
        : (0.305 + tone * 0.14 + grain * 0.05) * (0.82 + bevel * 0.18)) - grime * 0.07,
    );
    pixels[j] = _col.r * 255;
    pixels[j + 1] = _col.g * 255;
    pixels[j + 2] = _col.b * 255;
    pixels[j + 3] = 255;
    heights[i] = mortar ? 0.12
      : (0.48 + tone * 0.26 + grain * 0.16) * (0.55 + 0.45 * bevel);
  }
}

function makeStone(
  noi: SimplexNoise,
  anisotropy: number,
  tone: ToneFunction | null = null,
): GeneratedSurfaceTextures {
  // Irregular fieldstone coursing (512 px, ~0.35-0.9 m blocks at uvScale 0.5).
  const s = 512, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const srng = mulberry32(0x51a7);
  const rowEdges = buildStoneCourseEdges(s, srng);
  const columnEdges = buildStoneColumnEdges(s, rowEdges.length - 1, srng);
  for (let y = 0; y < s; y++) {
    paintStoneRow(noi, px, hgt, s, y, rowEdges, columnEdges);
  }
  applyTone(px, tone);
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 3.0, anisotropy),
    surface: surfaceFromHeight(hgt, s, anisotropy, { roughMin: 0.78, roughMax: 0.98, aoMin: 0.68 }),
  };
}

function makeWood(
  noi: SimplexNoise,
  anisotropy: number,
  tone: ToneFunction | null = null,
): GeneratedSurfaceTextures {
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const plankW = 42;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const plank = Math.floor(x / plankW);
    const tone = noi.noise(plank * 23.7, plank * 9.1 + 4) * 0.5 + 0.5;
    const inX = (x % plankW) / plankW;
    const gapped = inX < 0.07 ? 1 : 0;
    const grain = noi.noise(x * 0.30 + plank * 50, y * 0.02) * 0.5 + 0.5;
    _col.setHSL(0.070 + tone * 0.015, 0.32 - grain * 0.08, (0.185 + tone * 0.08 + grain * 0.05) * (gapped ? 0.5 : 1));
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = gapped ? 0.1 : 0.5 + grain * 0.4;
  }
  applyTone(px, tone);
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 1.8, anisotropy),
    surface: surfaceFromHeight(hgt, s, anisotropy, { roughMin: 0.64, roughMax: 0.93, aoMin: 0.72 }),
  };
}

function makeStraw(
  noi: SimplexNoise,
  anisotropy: number,
  tone: ToneFunction | null = null,
): GeneratedSurfaceTextures {
  // packed dry straw: long directional stalks with dark inter-stalk gaps and
  // per-stalk tone variation, graded toward dull ochre — the old bright
  // low-contrast yellow read as untextured toy cylinders on the hay bales
  const s = 256, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    const stalk = noi.noise(x * 0.022, y * 0.55) * 0.5 + 0.5;  // stalk-bundle tone
    const strand = noi.noise(x * 0.10 + 31, y * 1.55 - 12) * 0.5 + 0.5; // fine strands
    const kink = noi.noise(x * 0.45 + 77, y * 0.35 + 9) * 0.5 + 0.5;    // broken ends
    const gap = smoothstep(0.74, 0.92, noi.noise(x * 0.06 + 90, y * 0.9 + 55) * 0.5 + 0.5);
    const l = (0.21 + stalk * 0.13 + strand * 0.10 + kink * 0.04) * (1 - gap * 0.55);
    _col.setHSL(0.098 + stalk * 0.022, 0.38 - gap * 0.12, l);
    px[j] = _col.r * 255; px[j + 1] = _col.g * 255; px[j + 2] = _col.b * 255; px[j + 3] = 255;
    hgt[i] = (stalk * 0.45 + strand * 0.4 + kink * 0.15) * (1 - gap * 0.7);
  }
  applyTone(px, tone);
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, 2.4, anisotropy),
    surface: surfaceFromHeight(hgt, s, anisotropy, { roughMin: 0.88, roughMax: 1.0, aoMin: 0.74 }),
  };
}

// Neutral detail atlases for the vertex-colored destructible building kit.
// Their RGB stays close to white so the kit palette remains authoritative;
// the texture contributes grain/weave/corrugation and its normal map adds the
// readable material response that flat vertex colors could not provide.
function sampleStructureDetail(
  noi: SimplexNoise,
  kind: 'wood' | 'canvas' | 'steel',
  x: number,
  y: number,
  sample: Float32Array,
): void {
  const grain = noi.noise(x * 0.17 + (kind === 'steel' ? 70 : 11), y * 0.06 - 31)
    * 0.5 + 0.5;
  if (kind === 'wood') {
    const plank = (x % 28) / 28;
    const seam = plank < 0.07 ? 1 : 0;
    const rings = Math.sin(y * 0.11 + noi.noise(x * 0.08, y * 0.018) * 4) * 0.5 + 0.5;
    sample[0] = seam ? 0.08 : 0.46 + rings * 0.38;
    sample[1] = (0.86 + grain * 0.13) * (seam ? 0.68 : 1);
  } else if (kind === 'canvas') {
    const warp = Math.sin(x * Math.PI * 0.52) * 0.5 + 0.5;
    const weft = Math.sin(y * Math.PI * 0.52) * 0.5 + 0.5;
    sample[0] = warp * 0.45 + weft * 0.45 + grain * 0.10;
    sample[1] = 0.88 + sample[0] * 0.10;
  } else {
    const corrugation = Math.sin(x * Math.PI / 5) * 0.5 + 0.5;
    const scratch = smoothstep(0.72, 0.94,
      noi.noise(x * 0.09 + 91, y * 0.31 - 17) * 0.5 + 0.5);
    sample[0] = corrugation * 0.80 + grain * 0.20;
    sample[1] = 0.86 + corrugation * 0.12 - scratch * 0.10;
  }
}

function makeStructureDetail(
  noi: SimplexNoise,
  anisotropy: number,
  kind: 'wood' | 'canvas' | 'steel',
): GeneratedSurfaceTextures {
  const s = 128, px = new Uint8ClampedArray(s * s * 4), hgt = new Float32Array(s * s);
  const sample = new Float32Array(2);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = y * s + x, j = i * 4;
    sampleStructureDetail(noi, kind, x, y, sample);
    const v = clamp(sample[1], 0.55, 1) * 255;
    px[j] = v; px[j + 1] = v; px[j + 2] = v; px[j + 3] = 255;
    hgt[i] = sample[0];
  }
  return {
    albedo: toTexture(px, s, { srgb: true, anisotropy }),
    normal: normalFromHeight(hgt, s, kind === 'canvas' ? 0.9 : 1.45, anisotropy),
    surface: surfaceFromHeight(hgt, s, anisotropy, kind === 'steel'
      ? { roughMin: 0.52, roughMax: 0.84, aoMin: 0.76 }
      : kind === 'canvas'
        ? { roughMin: 0.90, roughMax: 1.0, aoMin: 0.84 }
        : { roughMin: 0.68, roughMax: 0.95, aoMin: 0.74 }),
  };
}

function _mustReplace(src: string, anchor: string, replacement: string): string {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/props: shader anchor missing: ${anchor}`);
  return out;
}

function makeGrimeTexture(noi: SimplexNoise, anisotropy: number): THREE.CanvasTexture {
  const s = 256, px = new Uint8ClampedArray(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const u = x / s, v = y / s, j = (y * s + x) * 4;
    const a = torusN(noi, u, v, 3, 3, 5) * 0.6 + torusN(noi, u, v, 7, 7, 19) * 0.4;
    const b = torusN(noi, u, v, 5, 5, 47) * 0.55 + torusN(noi, u, v, 13, 13, 91) * 0.45;
    // r3: blue carries a smooth 1-2 cycle field — sampled at very low world
    // frequency it drives the per-neighbourhood facade tint drift below
    const c2 = torusN(noi, u, v, 2, 2, 133) * 0.7 + torusN(noi, u, v, 5, 5, 171) * 0.3;
    px[j] = (a * 0.5 + 0.5) * 255;
    px[j + 1] = (b * 0.5 + 0.5) * 255;
    px[j + 2] = (c2 * 0.5 + 0.5) * 255; px[j + 3] = 255;
  }
  return toTexture(px, s, { anisotropy });
}

/**
 * Compact neutral vehicle finish. Vertex colors carry each paint/glass/rubber
 * zone; this 64px PBR set adds orange-peel, chips, panel grime and roughness
 * without a unique texture or material per vehicle family.
 */
function makeVehiclePaint(noi: SimplexNoise, anisotropy: number): GeneratedSurfaceTextures {
  const size = 64;
  const pixels = new Uint8ClampedArray(size * size * 4);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = y * size + x;
    const pixel = index * 4;
    const fine = noi.noise(x * 0.31 + 711, y * 0.31 - 233) * 0.5 + 0.5;
    const broad = noi.noise(x * 0.075 - 89, y * 0.10 + 417) * 0.5 + 0.5;
    const chipNoise = noi.noise(x * 0.58 + 63, y * 0.58 + 159) * 0.5 + 0.5;
    const chip = chipNoise > 0.94 && broad < 0.43 ? 0.075 : 0;
    const streak = smoothstep(0.70, 0.94,
      noi.noise(x * 0.08 + 349, y * 0.018 - 81) * 0.5 + 0.5);
    const value = clamp(0.945 + fine * 0.035 - chip - streak * 0.025, 0.76, 0.99);
    pixels[pixel] = value * 255;
    pixels[pixel + 1] = value * 255;
    pixels[pixel + 2] = value * 255;
    pixels[pixel + 3] = 255;
    height[index] = clamp(0.46 + fine * 0.10 - chip * 0.55 - streak * 0.045, 0, 1);
  }
  return {
    albedo: toTexture(pixels, size, { srgb: true, anisotropy }),
    normal: normalFromHeight(height, size, 0.22, anisotropy),
    surface: surfaceFromHeight(height, size, anisotropy, {
      roughMin: 0.68,
      roughMax: 0.94,
      aoMin: 0.84,
    }),
  };
}

// ---------------------------------------------------------------------------
// Baked sourced models (vertex-colored, welded at bake time)
// ---------------------------------------------------------------------------

const _bakedCache = new Map<string, THREE.BufferGeometry>();

interface BakedModelSelection {
  sourceVertexIds: number[] | null;
  sourceIndices: ArrayLike<number>;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function fullBakedModelSelection(model: BakedPropModel): BakedModelSelection {
  const [minX, minY, minZ] = model.bbox.min;
  const [maxX, maxY, maxZ] = model.bbox.max;
  return {
    sourceVertexIds: null,
    sourceIndices: model.indices,
    minX, minY, minZ, maxX, maxY, maxZ,
  };
}

function slicedBakedModelSelection(
  name: string,
  model: BakedPropModel,
  zMin: number,
  zMax: number,
): BakedModelSelection {
  const vertexCount = model.positions.length / 3;
  const remap = new Int32Array(vertexCount);
  remap.fill(-1);
  const sourceVertexIds: number[] = [];
  const sourceIndices: number[] = [];
  for (let i = 0; i < model.indices.length; i += 3) {
    const triangle = [model.indices[i], model.indices[i + 1], model.indices[i + 2]];
    const inside = triangle.every((id) => {
      const z = model.positions[id * 3 + 2];
      return z >= zMin && z <= zMax;
    });
    if (!inside) continue;
    for (const id of triangle) {
      if (remap[id] < 0) {
        remap[id] = sourceVertexIds.length;
        sourceVertexIds.push(id);
      }
      sourceIndices.push(remap[id]);
    }
  }
  if (!sourceIndices.length) throw new Error(`world/props: empty baked slice ${name}`);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const id of sourceVertexIds) {
    const x = model.positions[id * 3];
    const y = model.positions[id * 3 + 1];
    const z = model.positions[id * 3 + 2];
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return {
    sourceVertexIds, sourceIndices,
    minX, minY, minZ, maxX, maxY, maxZ,
  };
}

function selectBakedModel(
  name: string,
  model: BakedPropModel,
  opts: BakedGeometryOptions,
): BakedModelSelection {
  if (opts.sourceZMin == null && opts.sourceZMax == null) {
    return fullBakedModelSelection(model);
  }
  return slicedBakedModelSelection(
    name, model, opts.sourceZMin ?? -Infinity, opts.sourceZMax ?? Infinity,
  );
}

function resolveBakedScale(
  selection: BakedModelSelection,
  opts: BakedGeometryOptions,
): number {
  if (opts.targetH) return opts.targetH / Math.max(1e-6, selection.maxY - selection.minY);
  if (opts.targetW) {
    return opts.targetW / Math.max(1e-6,
      Math.max(selection.maxX - selection.minX, selection.maxZ - selection.minZ));
  }
  return opts.scale ?? 1;
}

function copyBakedVertexAttributes(
  model: BakedPropModel,
  selection: BakedModelSelection,
  opts: BakedGeometryOptions,
  scale: number,
): { positions: Float32Array; normals: Float32Array } {
  const count = selection.sourceVertexIds?.length ?? model.positions.length / 3;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const centerX = (selection.minX + selection.maxX) / 2;
  const centerZ = (selection.minZ + selection.maxZ) / 2;
  for (let i = 0; i < count; i++) {
    const sourceIndex = selection.sourceVertexIds?.[i] ?? i;
    positions[i * 3] = (model.positions[sourceIndex * 3] - centerX) * scale;
    positions[i * 3 + 1] = (model.positions[sourceIndex * 3 + 1] - selection.minY)
      * scale - (opts.sink ?? 0);
    positions[i * 3 + 2] = (model.positions[sourceIndex * 3 + 2] - centerZ) * scale;
    normals[i * 3] = model.normals[sourceIndex * 3];
    normals[i * 3 + 1] = model.normals[sourceIndex * 3 + 1];
    normals[i * 3 + 2] = model.normals[sourceIndex * 3 + 2];
  }
  return { positions, normals };
}

function isWhiteCapColor(r: number, g: number, b: number): boolean {
  return Math.min(r, g, b) > 0.72 && Math.max(r, g, b) - Math.min(r, g, b) < 0.10;
}

function copyBakedVertexColors(
  model: BakedPropModel,
  selection: BakedModelSelection,
  opts: BakedGeometryOptions,
): Float32Array {
  const count = selection.sourceVertexIds?.length ?? model.positions.length / 3;
  const colors = new Float32Array(count * 3);
  const burn = opts.burn ?? 0;
  const multiplier = opts.mul ?? 1;
  for (let i = 0; i < count; i++) {
    const sourceIndex = selection.sourceVertexIds?.[i] ?? i;
    const colorIndex = sourceIndex * 3;
    let r = model.colors[colorIndex] * multiplier;
    let g = model.colors[colorIndex + 1] * multiplier;
    let b = model.colors[colorIndex + 2] * multiplier;
    if (opts.whiteCap && isWhiteCapColor(r, g, b)) {
      [r, g, b] = opts.whiteCap;
    }
    if (burn > 0) {
      r = (r + (0.045 - r) * burn) * (1 - burn * 0.25);
      g = (g + (0.038 - g) * burn) * (1 - burn * 0.25);
      b = (b + (0.032 - b) * burn) * (1 - burn * 0.25);
    }
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  return colors;
}

/**
 * Build a BufferGeometry from a baked model: uniform scale to a target size,
 * XZ-centered, base at y=0, optional color grading (burn/darken for wrecks).
 * @param {string} name key in props-models.json
 * @param {{targetH?:number,targetW?:number,scale?:number,burn?:number,
 *   mul?:number,sink?:number,sourceZMin?:number,sourceZMax?:number}} [opts]
 * @returns {THREE.BufferGeometry} indexed geometry with position/normal/color
 */
export function bakedGeometry(name: string, opts: BakedGeometryOptions = {}): THREE.BufferGeometry {
  const key = name + JSON.stringify(opts);
  const hit = _bakedCache.get(key);
  if (hit) return hit;
  const m = requirePropModels()[name];
  if (!m) throw new Error('world/props: missing baked model ' + name);
  const selection = selectBakedModel(name, m, opts);
  const scale = resolveBakedScale(selection, opts);
  const { positions, normals } = copyBakedVertexAttributes(m, selection, opts, scale);
  const colors = copyBakedVertexColors(m, selection, opts);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // BufferGeometry#setIndex only wraps ordinary JS arrays. Packed runtime
  // models expose a Uint16Array view, which must be wrapped explicitly or the
  // renderer later mistakes the raw typed array for a BufferAttribute.
  const indexArray = selection.sourceIndices instanceof Uint16Array
    ? selection.sourceIndices
    : new Uint16Array(selection.sourceIndices);
  geo.setIndex(new THREE.BufferAttribute(indexArray, 1));
  geo.userData.size = {
    w: (selection.maxX - selection.minX) * scale,
    h: (selection.maxY - selection.minY) * scale,
    d: (selection.maxZ - selection.minZ) * scale,
  };
  _bakedCache.set(key, geo);
  return geo;
}

export function buildSourcedStructureGeometry(id: SourcedStructureType) {
  const spec = SOURCED_STRUCTURE_TYPES[id];
  return bakedGeometry(spec.model, { targetH: spec.targetH, sink: spec.sink });
}

// ---------------------------------------------------------------------------
// Building assembly — parts are pushed into per-material buckets, then merged
// ---------------------------------------------------------------------------

function makeCottage(
  rng: Rng,
  buckets: PropsBuckets,
  wallBucket = 'plaster',
): StructureDimensions {
  // (content_breadth r3: wallBucket may now be plaster2/plaster3 — the
  // parts literal below carries all wall families)
  const w = 5.2 + rng() * 1.2, d = 7.0 + rng() * 2.2;
  const wallH = 2.9, roofH = 1.9 + rng() * 0.4, over = 0.35;
  const parts: PropsBuckets = {
    plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
  };
  parts.stone.push(box(w + 0.3, 1.0, d + 0.3).translate(0, -0.1, 0)); // foundation (sinks)
  parts[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, d / 2 - 0.16));
  parts[wallBucket].push(gablePrism(w, roofH, 0.32).translate(0, wallH, -d / 2 + 0.16));
  // roof slabs
  const slope = Math.hypot(w / 2 + over, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + over);
  for (const side of [-1, 1]) {
    const slab = slabBox(slope + 0.15, 0.12, d + over * 2, 0.35); // r2: real tile rows (see slabBox)
    slab.rotateZ(side * ang);
    slab.translate(-side * (w / 4 + over / 2), wallH + roofH / 2 + 0.06, 0);
    parts.roof.push(slab);
  }
  // r2: ridge cap — the bare slab junction read as an extruded cardboard fold
  parts.roof.push(slabBox(0.34, 0.13, d + over * 2, 0.5).translate(0, wallH + roofH + 0.04, 0));
  // r2: chimney with cap slab + clay pot (was a bare stub most shots missed)
  parts.stone.push(box(0.55, 1.6, 0.55).translate(w * 0.22, wallH + roofH - 0.2, d * 0.22));
  parts.stone.push(box(0.72, 0.12, 0.72).translate(w * 0.22, wallH + roofH + 0.56, d * 0.22));
  {
    const pot = new THREE.CylinderGeometry(0.09, 0.12, 0.30, 6, 1);
    scaleUV(pot, 0.5, 0.5);
    pot.translate(w * 0.22, wallH + roofH + 0.74, d * 0.22);
    parts.roof.push(pot);
  }
  // door on +z gable end (r2: + lintel and a stone doorstep)
  parts.wood.push(box(1.1, 2.1, 0.10).translate(w * 0.08, 1.05, d / 2 + 0.10));
  parts.dark.push(box(0.86, 1.9, 0.06).translate(w * 0.08, 1.0, d / 2 + 0.16));
  parts.wood.push(box(1.3, 0.14, 0.14).translate(w * 0.08, 2.16, d / 2 + 0.10));
  parts.stone.push(box(1.24, 0.14, 0.5).translate(w * 0.08, 0.07, d / 2 + 0.28));
  // r2: small dark attic window in the +z gable
  parts.dark.push(box(0.5, 0.6, 0.06).translate(-w * 0.16, wallH + roofH * 0.42, d / 2 + 0.02));
  // windows on long sides
  const nw = 2 + ((rng() * 2) | 0);
  const shutters = rng() < 0.6; // r2: hung shutters on most cottages
  for (let k = 0; k < nw; k++) {
    const zz = -d / 2 + (k + 0.5) * (d / nw);
    for (const side of [-1, 1]) {
      if (rng() < 0.2) continue;
      // r5: frame PROUD, pane recessed (they were swapped — dark glass box
      // floated outside the frame and read as a painted-on rectangle), plus
      // a stone sill closing the bottom
      parts.wood.push(box(0.14, 1.06, 0.86).translate(side * (w / 2 + 0.05), 1.7, zz));
      parts.dark.push(box(0.06, 0.9, 0.7).translate(side * (w / 2 + 0.015), 1.7, zz));
      parts.stone.push(box(0.16, 0.09, 0.98).translate(side * (w / 2 + 0.06), 1.12, zz));
      if (shutters && rng() < 0.85) {
        parts.wood.push(box(0.05, 1.0, 0.30).translate(side * (w / 2 + 0.04), 1.7, zz - 0.43 - 0.16));
        parts.wood.push(box(0.05, 1.0, 0.30).translate(side * (w / 2 + 0.04), 1.7, zz + 0.43 + 0.16));
      }
    }
  }
  addConnectedExterior(parts, { id: 'cottage', w, d, wallH, profile: 'rural', variant: 0 });
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + roofH };
}

function makeBarn(rng: Rng, buckets: PropsBuckets): StructureDimensions {
  const w = 7.5 + rng() * 1.2, d = 11 + rng() * 2, wallH = 3.6, roofH = 2.6, over = 0.45;
  const parts: PropsBuckets = {
    plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
  };
  parts.stone.push(box(w + 0.3, 1.2, d + 0.3).translate(0, -0.1, 0));
  parts.wood.push(box(w, wallH, d).translate(0, wallH / 2, 0));
  parts.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH, d / 2 - 0.15));
  parts.wood.push(gablePrism(w, roofH, 0.3).translate(0, wallH, -d / 2 + 0.15));
  const slope = Math.hypot(w / 2 + over, roofH + 0.1);
  const ang = Math.atan2(roofH + 0.1, w / 2 + over);
  for (const side of [-1, 1]) {
    const slab = slabBox(slope + 0.15, 0.14, d + over * 2, 0.35); // r2: real tile rows
    slab.rotateZ(side * ang);
    slab.translate(-side * (w / 4 + over / 2), wallH + roofH / 2 + 0.07, 0);
    parts.roof.push(slab);
  }
  parts.dark.push(box(2.6, 2.9, 0.10).translate(0, 1.45, d / 2 + 0.08)); // big barn door
  parts.wood.push(box(2.9, 3.1, 0.06).translate(0, 1.55, d / 2 + 0.02));
  // r2 terrain_environment: the barn was a featureless dark box (critique).
  // Ridge cap, vertical batten relief on both long walls, cross-braced door
  // planks, a hayloft door + hoist beam in the gable, and small side windows.
  parts.roof.push(slabBox(0.36, 0.14, d + over * 2, 0.5).translate(0, wallH + roofH + 0.05, 0));
  {
    const nBat = Math.max(6, Math.round(d / 1.15));
    for (let bIdx = 0; bIdx < nBat; bIdx++) {
      const zz = -d / 2 + (bIdx + 0.5) * (d / nBat);
      for (const side of [-1, 1]) {
        const bat = box(0.07, wallH - 0.35, 0.13, 1.4);
        jitterUV(bat, rng);
        parts.wood.push(bat.translate(side * (w / 2 + 0.035), wallH / 2 - 0.1, zz));
      }
    }
    // diagonal door cross-brace plank
    const brace = box(0.16, 3.4, 0.05, 1.2);
    brace.rotateZ(0.72);
    parts.wood.push(brace.translate(0, 1.45, d / 2 + 0.15));
    // hayloft door + hoist beam high in the +z gable
    parts.dark.push(box(1.05, 1.15, 0.08).translate(0, wallH + roofH * 0.42, d / 2 + 0.04));
    parts.wood.push(box(1.25, 0.10, 0.10).translate(0, wallH + roofH * 0.42 + 0.68, d / 2 + 0.04));
    const hoist = box(0.10, 0.10, 0.85, 1.2);
    hoist.translate(0, wallH + roofH * 0.78, d / 2 + 0.35);
    parts.wood.push(hoist);
    // small side windows under the eaves
    for (const side of [-1, 1]) {
      for (const zz of [-d * 0.28, d * 0.28]) {
        if (rng() < 0.25) continue;
        parts.dark.push(box(0.06, 0.5, 0.62).translate(side * (w / 2 + 0.02), wallH - 0.75, zz));
        parts.wood.push(box(0.10, 0.08, 0.74).translate(side * (w / 2 + 0.04), wallH - 1.06, zz));
      }
    }
  }
  addConnectedExterior(parts, { id: 'barn', w, d, wallH, profile: 'timber', variant: 2 });
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + roofH };
}

function makeTower(rng: Rng, buckets: PropsBuckets): StructureDimensions {
  const w = 3.4, d = 3.4, wallH = 6.4 + rng() * 0.8;
  const parts: PropsBuckets = {
    plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
  };
  parts.stone.push(box(w + 0.4, 1.2, d + 0.4).translate(0, -0.1, 0));
  parts.stone.push(box(w, wallH, d, 0.7).translate(0, wallH / 2, 0));
  const spire = new THREE.ConeGeometry(w * 0.78, 2.6, 4, 1);
  spire.rotateY(Math.PI / 4);
  scaleUV(spire, 2, 2);
  spire.translate(0, wallH + 1.3, 0);
  parts.roof.push(spire);
  for (let k = 0; k < 3; k++) {
    const yy = 1.8 + k * 1.7;
    parts.dark.push(box(0.5, 0.8, 0.06).translate(0, yy, d / 2 + 0.04));
    parts.dark.push(box(0.06, 0.8, 0.5).translate(w / 2 + 0.04, yy, 0));
  }
  parts.wood.push(box(1.0, 2.2, 0.1).translate(0, 1.1, -d / 2 - 0.06));
  addConnectedExterior(parts, { id: 'tower', w, d, wallH, profile: 'civic', variant: 1 });
  mergeInto(buckets, parts);
  return { w: w + 0.4, d: d + 0.4, h: wallH + 2.6 };
}

function makeRuin(rng: Rng, buckets: PropsBuckets): StructureDimensions {
  const w = 6.0 + rng(), d = 8.0 + rng() * 1.5;
  const parts: PropsBuckets = {
    plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
  };
  parts.stone.push(box(w + 0.3, 1.0, d + 0.3).translate(0, -0.1, 0));
  // four broken walls: sequences of piers with varying heights
  const t = 0.5;
  const walls = [
    { len: d, rot: 0, ox: -w / 2 + t / 2, oz: 0 },
    { len: d, rot: 0, ox: w / 2 - t / 2, oz: 0 },
    { len: w - 2 * t, rot: Math.PI / 2, ox: 0, oz: -d / 2 + t / 2 },
    { len: w - 2 * t, rot: Math.PI / 2, ox: 0, oz: d / 2 - t / 2 },
  ];
  for (const wl of walls) {
    const segs = 3 + ((rng() * 3) | 0);
    const segLen = wl.len / segs;
    for (let k = 0; k < segs; k++) {
      if (rng() < 0.3) continue; // collapsed gap
      const hh = 0.9 + rng() * 2.1;
      const b = box(t, hh, segLen * 0.94, 0.7);
      b.translate(0, hh / 2, -wl.len / 2 + (k + 0.5) * segLen);
      if (wl.rot) b.rotateY(wl.rot);
      b.translate(wl.ox, 0, wl.oz);
      parts.stone.push(b);
    }
  }
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: 3.0 };
}

// flat-roofed adobe house (desert maps): parapet, wood roof beams, viga ends
function makeAdobe(rng: Rng, buckets: PropsBuckets): StructureDimensions {
  const w = 5.4 + rng() * 1.8, d = 5.8 + rng() * 2.6;
  const wallH = 3.0 + rng() * 0.5;
  const parts: PropsBuckets = {
    plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
  };
  parts.stone.push(box(w + 0.3, 0.8, d + 0.3).translate(0, -0.15, 0));
  parts.plaster.push(box(w, wallH, d).translate(0, wallH / 2, 0));
  // parapet rim
  parts.plaster.push(box(w, 0.45, 0.18).translate(0, wallH + 0.22, d / 2 - 0.09));
  parts.plaster.push(box(w, 0.45, 0.18).translate(0, wallH + 0.22, -d / 2 + 0.09));
  parts.plaster.push(box(0.18, 0.45, d - 0.36).translate(w / 2 - 0.09, wallH + 0.22, 0));
  parts.plaster.push(box(0.18, 0.45, d - 0.36).translate(-w / 2 + 0.09, wallH + 0.22, 0));
  parts.wood.push(slabBox(w - 0.2, 0.1, d - 0.2, 0.35).translate(0, wallH + 0.02, 0)); // roof deck (r2: slabBox)
  // viga beam ends over the door face
  const nBeam = Math.max(3, (w / 0.9) | 0);
  for (let k = 0; k < nBeam; k++) {
    const bx = -w / 2 + (k + 0.5) * (w / nBeam);
    const beam = new THREE.CylinderGeometry(0.07, 0.07, 0.55, 5, 1);
    scaleUV(beam, 0.5, 0.5);
    beam.rotateX(Math.PI / 2);
    beam.translate(bx, wallH - 0.28, d / 2 + 0.18);
    parts.wood.push(beam);
  }
  parts.wood.push(box(1.0, 2.0, 0.10).translate(w * 0.1, 1.0, d / 2 + 0.08));
  parts.dark.push(box(0.8, 1.8, 0.06).translate(w * 0.1, 0.95, d / 2 + 0.13));
  const nw = 1 + ((rng() * 2) | 0);
  for (let k = 0; k < nw; k++) {
    const zz = -d / 2 + (k + 0.5) * (d / nw);
    for (const side of [-1, 1]) {
      if (rng() < 0.3) continue;
      parts.dark.push(box(0.06, 0.7, 0.6).translate(side * (w / 2 + 0.05), 1.9, zz));
    }
  }
  if (rng() < 0.45) { // rooftop stair block
    parts.plaster.push(box(w * 0.35, 1.0, d * 0.3).translate(-w * 0.18, wallH + 0.5, -d * 0.18));
  }
  addConnectedExterior(parts, { id: 'adobe', w, d, wallH, profile: 'desert', variant: 0 });
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + 1.2 };
}

// 2-3 story town rowhouse (urban maps): window grids, shopfront, gable roof.
// dims {w,d} pins the footprint so street strips can butt shared walls.
function resolveRowhouseRoofHeight(rng: Rng, roofRoll: number): number {
  if (roofRoll < 0.13) return 0.7;
  if (roofRoll < 0.30) return 0.75 + rng() * 0.35;
  if (roofRoll < 0.44) return 1.9 + rng() * 0.55;
  return 1.35 + rng() * 0.6;
}

function addRowhouseFlatRoof(
  rng: Rng,
  buckets: PropsBuckets,
  parts: PropsBuckets,
  wallBucket: string,
  w: number,
  d: number,
  wallH: number,
): void {
  const deck = box(w - 0.24, 0.10, d - 0.24);
  const colors = new Float32Array(deck.attributes.position.count * 3);
  for (let i = 0; i < deck.attributes.position.count; i++) {
    const value = 0.045 + rng() * 0.02;
    colors[i * 3] = value * 1.08;
    colors[i * 3 + 1] = value;
    colors[i * 3 + 2] = value * 0.90;
  }
  deck.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  deck.translate(0, wallH + 0.14, 0);
  if (buckets.baked) parts.baked!.push(deck);
  else parts.roof.push(deck);
  const parapetHeight = 0.55 + rng() * 0.25;
  const y = wallH + parapetHeight / 2;
  parts[wallBucket].push(box(w, parapetHeight, 0.22).translate(0, y, d / 2 - 0.11));
  parts[wallBucket].push(box(w, parapetHeight, 0.22).translate(0, y, -d / 2 + 0.11));
  parts[wallBucket].push(box(0.22, parapetHeight, d).translate(w / 2 - 0.11, y, 0));
  parts[wallBucket].push(box(0.22, parapetHeight, d).translate(-w / 2 + 0.11, y, 0));
  parts.stone.push(box(w + 0.14, 0.10, 0.32)
    .translate(0, wallH + parapetHeight + 0.05, d / 2 - 0.11));
  parts.stone.push(box(w + 0.14, 0.10, 0.32)
    .translate(0, wallH + parapetHeight + 0.05, -d / 2 + 0.11));
  parts.stone.push(box(0.32, 0.10, d + 0.14)
    .translate(w / 2 - 0.11, wallH + parapetHeight + 0.05, 0));
  parts.stone.push(box(0.32, 0.10, d + 0.14)
    .translate(-w / 2 + 0.11, wallH + parapetHeight + 0.05, 0));
  if (rng() < 0.6) {
    parts[wallBucket].push(box(1.5, 1.1, 1.9)
      .translate((rng() - 0.5) * w * 0.3, wallH + 0.55, (rng() - 0.5) * d * 0.3));
  }
}

function addRowhouseRoof(
  rng: Rng,
  buckets: PropsBuckets,
  parts: PropsBuckets,
  wallBucket: string,
  w: number,
  d: number,
  wallH: number,
  roofH: number,
  flatRoof: boolean,
): number {
  const over = 0.3;
  if (flatRoof) {
    addRowhouseFlatRoof(rng, buckets, parts, wallBucket, w, d, wallH);
  } else {
    parts[wallBucket].push(gablePrism(w, roofH, 0.32)
      .translate(0, wallH, d / 2 - 0.16));
    parts[wallBucket].push(gablePrism(w, roofH, 0.32)
      .translate(0, wallH, -d / 2 + 0.16));
  }
  const slope = Math.hypot(w / 2 + over, roofH + 0.1);
  const angle = Math.atan2(roofH + 0.1, w / 2 + over);
  if (!flatRoof) for (const side of [-1, 1]) {
    const slab = slabBox(slope + 0.15, 0.13, d + over * 2, 0.35);
    slab.rotateZ(side * angle);
    slab.translate(-side * (w / 4 + over / 2), wallH + roofH / 2 + 0.06, 0);
    parts.roof.push(slab);
  }
  return angle;
}

function addRowhouseFacadeRelief(
  rng: Rng,
  parts: PropsBuckets,
  wallBucket: string,
  lowContrastFacade: boolean,
  w: number,
  d: number,
  wallH: number,
): void {
  const trimBucket = lowContrastFacade
    ? 'stone'
    : wallBucket === 'plaster' || wallBucket === 'stone' ? 'stone' : 'plaster';
  if (rng() < 0.6) {
    parts[trimBucket].push(box(w + 0.22, 0.16, 0.12)
      .translate(0, wallH - 0.10, d / 2 + 0.05));
    parts[trimBucket].push(box(w + 0.22, 0.16, 0.12)
      .translate(0, wallH - 0.10, -d / 2 - 0.05));
    parts[trimBucket].push(box(0.12, 0.16, d + 0.22)
      .translate(w / 2 + 0.05, wallH - 0.10, 0));
    parts[trimBucket].push(box(0.12, 0.16, d + 0.22)
      .translate(-w / 2 - 0.05, wallH - 0.10, 0));
  }
  if (rng() < 0.45) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      parts.stone.push(box(0.20, wallH - 0.3, 0.20)
        .translate(sx * (w / 2 + 0.02), (wallH - 0.3) / 2, sz * (d / 2 + 0.02)));
    }
  }
}

function addRowhouseChimneys(
  rng: Rng,
  parts: PropsBuckets,
  w: number,
  d: number,
  wallH: number,
  roofH: number,
): void {
  const chimneyCount = 1 + (rng() < 0.55 ? 1 : 0);
  for (let index = 0; index < chimneyCount; index++) {
    const z = -d * 0.38 + rng() * d * 0.76;
    const x = (rng() - 0.5) * w * 0.12;
    const height = 1.1 + rng() * 0.7;
    const stack = box(0.66, height, 0.66, 0.8);
    jitterUV(stack, rng);
    parts.stone.push(stack.translate(x, wallH + roofH + height / 2 - 0.35, z));
    parts.stone.push(box(0.82, 0.14, 0.82)
      .translate(x, wallH + roofH + height - 0.30, z));
    if (rng() < 0.5) {
      const pot = new THREE.CylinderGeometry(0.10, 0.13, 0.34, 6, 1);
      pot.translate(x + (rng() - 0.5) * 0.3, wallH + roofH + height - 0.06,
        z + (rng() - 0.5) * 0.3);
      parts.roof.push(pot);
    }
  }
}

function addRowhouseRoofClutter(
  rng: Rng,
  parts: PropsBuckets,
  w: number,
  d: number,
  wallH: number,
  roofH: number,
): void {
  const ventCount = 1 + ((rng() * 2) | 0);
  for (let index = 0; index < ventCount; index++) {
    const z = -d * 0.34 + rng() * d * 0.68;
    const side = rng() < 0.5 ? -1 : 1;
    const x = side * w * (0.10 + rng() * 0.16);
    const y = wallH + roofH * (1 - Math.abs(x) / (w / 2 + 0.3)) - 0.12;
    const pipe = new THREE.CylinderGeometry(0.05, 0.06, 0.5 + rng() * 0.3, 5, 1);
    pipe.translate(x, y + 0.28, z);
    parts.dark.push(pipe);
  }
  if (rng() < 0.35) {
    const z = -d * 0.3 + rng() * d * 0.6;
    const height = 1.4 + rng() * 0.8;
    const mast = new THREE.CylinderGeometry(0.022, 0.028, height, 4, 1);
    mast.translate((rng() - 0.5) * w * 0.2,
      wallH + roofH + height / 2 - 0.3, z);
    parts.dark.push(mast);
    const bar = box(0.9 + rng() * 0.5, 0.03, 0.03, 2.0);
    bar.rotateY(rng() * Math.PI);
    bar.translate((rng() - 0.5) * w * 0.2, wallH + roofH + height - 0.34, z);
    parts.dark.push(bar);
  }
}

function addRowhouseDormers(
  rng: Rng,
  parts: PropsBuckets,
  wallBucket: string,
  w: number,
  d: number,
  wallH: number,
  roofH: number,
  roofAngle: number,
): void {
  if (rng() >= 0.4 || roofH <= 1.45) return;
  const count = 1 + ((rng() * 2) | 0);
  for (let index = 0; index < count; index++) {
    const side = rng() < 0.5 ? -1 : 1;
    const z = -d * 0.30 + rng() * d * 0.60;
    const y = wallH + roofH * 0.40;
    const x = side * (w / 2 + 0.3) * 0.55;
    parts[wallBucket].push(box(0.98, 1.0, 0.88).translate(x, y + 0.08, z));
    parts.dark.push(box(0.07, 0.60, 0.52).translate(x + side * 0.50, y + 0.14, z));
    parts.wood.push(box(0.05, 0.72, 0.10)
      .translate(x + side * 0.51, y + 0.14, z - 0.31));
    parts.wood.push(box(0.05, 0.72, 0.10)
      .translate(x + side * 0.51, y + 0.14, z + 0.31));
    const cap = slabBox(1.24, 0.09, 1.04, 0.4);
    cap.rotateZ(side * roofAngle * 0.5);
    cap.translate(x - side * 0.06, y + 0.72, z);
    parts.roof.push(cap);
  }
}

interface RowhouseWindowStyle {
  bayPitch: number;
  width: number;
  height: number;
  phase: number;
  shutters: boolean;
  trimBucket: string;
  doorSlots: readonly [number, number];
}

function pickRowhousePaneBucket(rng: Rng, lowContrastFacade: boolean): string {
  const roll = rng();
  if (lowContrastFacade) return roll < 0.76 ? 'glass' : 'dark';
  if (roll < 0.62) return 'glass';
  return roll < 0.83 ? 'curtain' : 'dark';
}

function addRowhouseGroundOpening(
  rng: Rng,
  parts: PropsBuckets,
  x: number,
  z: number,
  side: number,
): void {
  if (rng() < 0.55) {
    parts.glass!.push(box(0.07, 1.55, 1.90).translate(x + side * 0.02, 1.38, z));
    parts.stone.push(box(0.16, 0.42, 2.06).translate(x + side * 0.05, 0.32, z));
    parts.wood.push(box(0.10, 0.15, 2.10).translate(x + side * 0.055, 2.28, z));
    parts.wood.push(box(0.09, 0.44, 1.72).translate(x + side * 0.065, 2.66, z));
    if (rng() < 0.55) {
      const awning = pitchSkillionRoof(
        box(0.85, 0.06, 2.15), 'x', side as -1 | 1, 0.42,
      );
      awning.translate(x + side * 0.52, 2.62, z);
      parts.roof.push(awning);
    }
    return;
  }
  parts.wood.push(box(0.10, 2.24, 1.08).translate(x + side * 0.03, 1.14, z));
  parts.dark.push(box(0.06, 2.02, 0.86).translate(x + side * 0.085, 1.05, z));
  parts.wood.push(box(0.11, 0.15, 1.32).translate(x + side * 0.055, 2.34, z));
  parts.stone.push(box(0.36, 0.16, 1.26).translate(x + side * 0.16, 0.10, z));
}

function addRowhouseWindow(
  rng: Rng,
  parts: PropsBuckets,
  style: RowhouseWindowStyle,
  lowContrastFacade: boolean,
  x: number,
  y: number,
  z: number,
  side: number,
): void {
  parts[pickRowhousePaneBucket(rng, lowContrastFacade)].push(
    box(0.05, style.height, style.width).translate(x + side * 0.012, y, z),
  );
  const jambWidth = 0.14, proudness = side * 0.065;
  parts[style.trimBucket].push(box(jambWidth, style.height + 0.14, 0.13)
    .translate(x + proudness, y, z - style.width / 2 - 0.06));
  parts[style.trimBucket].push(box(jambWidth, style.height + 0.14, 0.13)
    .translate(x + proudness, y, z + style.width / 2 + 0.06));
  parts[style.trimBucket].push(box(0.17, 0.16, style.width + 0.34)
    .translate(x + side * 0.08, y + style.height / 2 + 0.09, z));
  parts.stone.push(box(0.22, 0.11, style.width + 0.30)
    .translate(x + side * 0.10, y - style.height / 2 - 0.07, z));
  parts.wood.push(box(0.07, 0.07, style.width)
    .translate(x + side * 0.038, y + style.height * 0.12, z));
  if (!style.shutters || rng() >= 0.8) return;
  parts.wood.push(box(0.05, style.height, 0.30)
    .translate(x + side * 0.03, y, z - style.width / 2 - 0.30));
  parts.wood.push(box(0.05, style.height, 0.30)
    .translate(x + side * 0.03, y, z + style.width / 2 + 0.30));
}

function addRowhouseGableWindows(
  rng: Rng,
  parts: PropsBuckets,
  style: RowhouseWindowStyle,
  lowContrastFacade: boolean,
  w: number,
  d: number,
  y: number,
): void {
  const x = w * (0.14 + rng() * 0.08);
  for (const z of [d / 2 + 0.05, -d / 2 - 0.05]) {
    for (const side of [-1, 1]) {
      parts[pickRowhousePaneBucket(rng, lowContrastFacade)].push(
        box(style.width, style.height, 0.06).translate(side * x, y, z),
      );
      parts.stone.push(box(style.width + 0.28, 0.10, 0.16)
        .translate(side * x, y - style.height / 2 - 0.06, z));
    }
  }
}

function addRowhouseWindowBay(
  rng: Rng,
  parts: PropsBuckets,
  style: RowhouseWindowStyle,
  lowContrastFacade: boolean,
  w: number,
  d: number,
  story: number,
  y: number,
  bay: number,
  bayCount: number,
): void {
  const z = -d / 2 + (bay + 0.5) * (d / bayCount) + style.phase;
  if (z < -d / 2 + 0.75 || z > d / 2 - 0.75) return;
  for (const side of [-1, 1]) {
    const x = side * (w / 2);
    if (story === 0 && bay === style.doorSlots[side < 0 ? 0 : 1] % bayCount) {
      addRowhouseGroundOpening(rng, parts, x, z, side);
    } else if (rng() >= 0.12) {
      addRowhouseWindow(rng, parts, style, lowContrastFacade, x, y, z, side);
    }
  }
}

function addRowhouseWindowGrid(
  rng: Rng,
  parts: PropsBuckets,
  style: RowhouseWindowStyle,
  lowContrastFacade: boolean,
  w: number,
  d: number,
  stories: number,
): void {
  for (let story = 0; story < stories; story++) {
    const y = 1.8 + story * 2.9;
    const bayCount = Math.max(2, Math.round(d / style.bayPitch));
    for (let bay = 0; bay < bayCount; bay++) {
      addRowhouseWindowBay(
        rng, parts, style, lowContrastFacade, w, d, story, y, bay, bayCount,
      );
    }
    if (story > 0) addRowhouseGableWindows(
      rng, parts, style, lowContrastFacade, w, d, y,
    );
  }
}

function addRowhouseStringCourse(
  parts: PropsBuckets,
  trimBucket: string,
  w: number,
  d: number,
): void {
  parts[trimBucket].push(box(w + 0.16, 0.14, 0.10).translate(0, 3.32, d / 2 + 0.04));
  parts[trimBucket].push(box(w + 0.16, 0.14, 0.10).translate(0, 3.32, -d / 2 - 0.04));
  parts[trimBucket].push(box(0.10, 0.14, d + 0.16).translate(w / 2 + 0.04, 3.32, 0));
  parts[trimBucket].push(box(0.10, 0.14, d + 0.16).translate(-w / 2 - 0.04, 3.32, 0));
}

function makeRowhouse(
  rng: Rng,
  buckets: PropsBuckets,
  wallBucket = 'plaster',
  dims: RowhouseDimensions | null = null,
): StructureDimensions {
  const lowContrastFacade = dims?.lowContrastTrim === true;
  const w = (dims && dims.w) || 8.0 + rng() * 3.0;
  const d = (dims && dims.d) || 9.0 + rng() * 4.0;
  const stories = 2 + ((rng() * 2) | 0);
  const wallH = stories * 2.9 + 0.6;
  // content_breadth r3: MIXED roof pitches — every house carried the same
  // 1.4-2.0 m gable ("one gable pitch" critique). ~20% low-pitch pans, ~15%
  // steep town gables, the rest the classic band.
  const roofRoll = rng();
  // content_breadth r4: ~13% PARAPET-FLAT roofs — the establishing camera
  // reads the town as roofscape, and an unbroken sheet of same-axis gables
  // was the loudest "archetype repetition" tell along the main street.
  const flatRoof = roofRoll < 0.13;
  const roofH = resolveRowhouseRoofHeight(rng, roofRoll);
  const parts: PropsBuckets = {
    plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
    glass: [], curtain: [], baked: [],
  };
  parts.stone.push(box(w + 0.3, 1.2, d + 0.3).translate(0, -0.1, 0));
  parts[wallBucket].push(box(w, wallH, d).translate(0, wallH / 2, 0));
  const roofAngle = addRowhouseRoof(
    rng, buckets, parts, wallBucket, w, d, wallH, roofH, flatRoof,
  );
  // content_breadth r4: facade RELIEF that survives to mid distance — a
  // proud eaves cornice band under the roofline (~60%) and stone corner
  // quoin strips on masonry walls (~45%): the two most-repeated street
  // archetypes stop reading as bare extruded boxes
  addRowhouseFacadeRelief(rng, parts, wallBucket, lowContrastFacade, w, d, wallH);
  // r7 ROOFSCAPE: ridge chimney stacks with cap slabs (1-2 per house, real
  // masonry proportions) — the old lone 0.6 m stub on the slope was invisible
  // at gameplay distance and the roofs read as bare extruded caps
  addRowhouseChimneys(rng, parts, w, d, wallH, roofH);
  // r7 terrain_environment ROOF CLUTTER: small vent pipes + the occasional
  // wire aerial mast — the ridge chimneys alone left mid-distance roofscapes
  // reading as bare extruded caps (critique: "almost no roof clutter")
  addRowhouseRoofClutter(rng, parts, w, d, wallH, roofH);
  // r7 DORMERS on ~40% of houses: boxed body half-sunk into the slope, dark
  // attic window on the vertical face, pitched cap slab — breaks the bare
  // roof planes the critique flagged
  addRowhouseDormers(rng, parts, wallBucket, w, d, wallH, roofH, roofAngle);
  // window grids on the long sides.
  // r6: ground floors get STREET LIFE — one door or shopfront slot per long
  // side, and ~40% of buildings hang wooden shutters beside their windows.
  // The critique: two facade materials with identical punched black window
  // rectangles and "no street-level doors, shutters, or signage visible".
  const windowStyle: RowhouseWindowStyle = {
    doorSlots: [(rng() * 97) | 0, (rng() * 97) | 0],
    shutters: rng() < 0.4,
  // r7 PER-BUILDING WINDOW LANGUAGE: bay pitch, opening size and a rhythm
  // phase all vary house-to-house — the critique's "repeated identical
  // window spacing across facades" came from every facade computing the same
  // d/2.6 grid with the same 1.25 x 0.82 opening
    bayPitch: 2.3 + rng() * 0.9,
    width: 0.72 + rng() * 0.22,
    height: 1.10 + rng() * 0.30,
    phase: (rng() - 0.5) * 0.5,
    trimBucket: resolveRowhouseTrimBucket(
      wallBucket, rng() < 0.5, lowContrastFacade,
    ),
  };
  addRowhouseWindowGrid(
    rng, parts, windowStyle, lowContrastFacade, w, d, stories,
  );
  // string course between ground and first floor on masonry facades: cheap
  // horizontal relief that kills the single-extrusion read from the street
  if (rng() < 0.55) {
    addRowhouseStringCourse(parts, windowStyle.trimBucket, w, d);
  }
  // street door + shopfront on the +z gable face
  parts.wood.push(box(1.2, 2.3, 0.12).translate(-w * 0.15, 1.15, d / 2 + 0.08));
  parts.dark.push(box(1.0, 2.1, 0.06).translate(-w * 0.15, 1.1, d / 2 + 0.14));
  if (rng() < 0.55) parts.glass!.push(box(2.3, 1.5, 0.06).translate(w * 0.18, 1.5, d / 2 + 0.10));
  const facadeVariant = (Math.round(w * 10) + Math.round(d * 10) + stories) % 4;
  addConnectedExterior(parts, {
    id: 'rowhouse', w, d, wallH, profile: 'urban', variant: facadeVariant,
  });
  mergeInto(buckets, parts);
  return { w: w + 0.3, d: d + 0.3, h: wallH + roofH };
}

const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _one = new THREE.Vector3(1, 1, 1);
const _posv = new THREE.Vector3();
const _scalev = new THREE.Vector3();
const _euler = new THREE.Euler();

function mergeInto(
  buckets: PropsBuckets,
  parts: PropsBuckets,
  transform: THREE.Matrix4 | null = null,
): void {
  for (const key of Object.keys(parts)) {
    for (const g of parts[key]) {
      if (transform) g.applyMatrix4(transform);
      buckets[key].push(g);
    }
  }
}

type GroundDecalKind = 'dirt' | 'apron' | 'crater' | 'scorch';

function configureDecalGradient(
  gradient: CanvasGradient,
  kind: GroundDecalKind,
): void {
  if (kind === 'scorch') {
    gradient.addColorStop(0, 'rgba(26,20,14,0.92)');
    gradient.addColorStop(0.38, 'rgba(52,38,24,0.85)');
    gradient.addColorStop(0.66, 'rgba(84,66,42,0.55)');
    gradient.addColorStop(1, 'rgba(90,74,48,0)');
  } else if (kind === 'crater') {
    gradient.addColorStop(0, 'rgba(16,13,10,0.96)');
    gradient.addColorStop(0.30, 'rgba(30,24,17,0.93)');
    gradient.addColorStop(0.52, 'rgba(64,50,32,0.88)');
    gradient.addColorStop(0.74, 'rgba(70,56,37,0.55)');
    gradient.addColorStop(1, 'rgba(74,60,40,0)');
  } else if (kind === 'apron') {
    gradient.addColorStop(0, 'rgba(112,101,84,0.92)');
    gradient.addColorStop(0.55, 'rgba(104,93,76,0.88)');
    gradient.addColorStop(0.82, 'rgba(96,86,70,0.72)');
    gradient.addColorStop(1, 'rgba(90,80,66,0.55)');
  } else {
    gradient.addColorStop(0, 'rgba(52,42,27,0.94)');
    gradient.addColorStop(0.4, 'rgba(66,53,34,0.82)');
    gradient.addColorStop(0.72, 'rgba(78,64,42,0.5)');
    gradient.addColorStop(1, 'rgba(82,68,45,0)');
  }
}

function paintApronGrit(ctx: CanvasRenderingContext2D, size: number): void {
  const rng = mulberry32(5519);
  for (let k = 0; k < 260; k++) {
    const x = rng() * size, y = rng() * size, radius = 0.8 + rng() * 2.6;
    ctx.fillStyle = rng() < 0.5
      ? `rgba(84,74,60,${0.10 + rng() * 0.16})`
      : `rgba(132,121,102,${0.08 + rng() * 0.14})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintCraterEjecta(ctx: CanvasRenderingContext2D, size: number): void {
  const rng = mulberry32(7717);
  ctx.strokeStyle = 'rgba(58,46,30,0.55)';
  ctx.lineCap = 'round';
  for (let k = 0; k < 22; k++) {
    const angle = rng() * Math.PI * 2;
    const innerRadius = size * (0.26 + rng() * 0.10);
    const outerRadius = size * (0.38 + rng() * 0.16);
    ctx.lineWidth = 1.5 + rng() * 3.5;
    ctx.globalAlpha = 0.35 + rng() * 0.5;
    ctx.beginPath();
    ctx.moveTo(size / 2 + Math.cos(angle) * innerRadius,
      size / 2 + Math.sin(angle) * innerRadius);
    ctx.lineTo(size / 2 + Math.cos(angle + (rng() - 0.5) * 0.2) * outerRadius,
      size / 2 + Math.sin(angle + (rng() - 0.5) * 0.2) * outerRadius);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function applyDecalRaggedEdge(
  image: ImageData,
  noise: SimplexNoise,
  size: number,
  kind: GroundDecalKind,
): void {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x - size / 2) / (size / 2);
    const dy = (y - size / 2) / (size / 2);
    const radius = kind === 'apron'
      ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy);
    const sample = noise.noise(x * 0.11 + (kind === 'scorch' ? 40 : 0), y * 0.11)
      * 0.5 + 0.5;
    const edge = kind === 'apron'
      ? smoothstep(0.66, 0.99, radius + (sample - 0.5) * 0.20)
      : smoothstep(0.55, 1.0, radius);
    let alpha = clamp(1 - edge * (kind === 'apron' ? 1.0 + sample * 0.25
      : 0.4 + sample * 1.1), 0, 1);
    if (kind === 'apron') alpha *= 1 - smoothstep(0.94, 1.0, radius);
    image.data[(y * size + x) * 4 + 3] *= alpha;
  }
}

function makeGroundDecalTexture(
  noise: SimplexNoise,
  anisotropy: number,
  kind: GroundDecalKind,
): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas2d(canvas, { willReadFrequently: true });
  ctx.clearRect(0, 0, size, size);
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0, size / 2, size / 2, size / 2,
  );
  configureDecalGradient(gradient, kind);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  if (kind === 'apron') paintApronGrit(ctx, size);
  if (kind === 'crater') paintCraterEjecta(ctx, size);
  const image = ctx.getImageData(0, 0, size, size);
  applyDecalRaggedEdge(image, noise, size, kind);
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

interface RoadsideSpotContext {
  rng: Rng;
  roads: TerrainLayout['roads'];
  heightField: HeightField;
  noVegetation(x: number, z: number): boolean;
  spawns: TerrainLayout['spawns'];
  placedBuildings: readonly PlacedRadius[];
}

function isRoadsideSpotClear(
  { heightField, noVegetation, spawns, placedBuildings }: RoadsideSpotContext,
  x: number,
  z: number,
): boolean {
  if (Math.max(Math.abs(x), Math.abs(z)) > 455) return false;
  if (heightField._roadDist(x, z) < 4.6 || noVegetation(x, z)) return false;
  if (heightField.getGroundType(x, z) === 'soft') return false;
  if (heightField.getNormalAt(x, z).y < 0.90) return false;
  if ([spawns.player, ...spawns.enemies]
    .some((spawn) => Math.hypot(x - spawn.x, z - spawn.z) < 24)) return false;
  return !placedBuildings.some(
    (building) => Math.hypot(x - building.x, z - building.z) < building.rr + 2.5,
  );
}

function findRoadsideSpot(
  context: RoadsideSpotContext,
  offMin: number,
  offMax: number,
  tries = 40,
): [number, number, number] | null {
  const { rng, roads } = context;
  for (let attempt = 0; attempt < tries; attempt++) {
    const nodes = roads[(rng() * roads.length) | 0];
    if (!nodes || nodes.length < 4) continue;
    const index = 2 + ((rng() * (nodes.length - 3)) | 0);
    const [startX, startZ] = nodes[index];
    const [endX, endZ] = nodes[index + 1] || nodes[index - 1];
    const tangentLength = Math.hypot(endX - startX, endZ - startZ) || 1;
    const side = rng() < 0.5 ? -1 : 1;
    const offset = offMin + rng() * (offMax - offMin);
    const x = startX - ((endZ - startZ) / tangentLength) * offset * side;
    const z = startZ + ((endX - startX) / tangentLength) * offset * side;
    if (!isRoadsideSpotClear(context, x, z)) continue;
    return [x, z, Math.atan2(endX - startX, endZ - startZ)];
  }
  return null;
}

type AddDestructible = (
  kind: string,
  x: number,
  y: number,
  z: number,
  yaw?: number,
  scale?: number,
  tiltX?: number,
  tiltZ?: number,
) => DestructibleRecord;

interface FieldScatterContext {
  rng: Rng;
  village: TerrainLayout['village'];
  heightField: HeightField;
  noVegetation(x: number, z: number): boolean;
  spawns: readonly { x: number; z: number }[];
  addDestructible: AddDestructible;
}

function isFieldScatterPointClear(
  context: FieldScatterContext,
  x: number,
  z: number,
): boolean {
  const { village, heightField, noVegetation, spawns } = context;
  if (x > village.x0 - 8 && x < village.x1 + 8
      && z > village.z0 - 8 && z < village.z1 + 8) return false;
  if (heightField._roadDist(x, z) < 8) return false;
  if (heightField.getGroundType(x, z) === 'soft' || noVegetation(x, z)) return false;
  if (heightField.getNormalAt(x, z).y < 0.93) return false;
  return !spawns.some((spawn) => Math.hypot(x - spawn.x, z - spawn.z) < 18);
}

function addFieldScatterPartners(
  context: FieldScatterContext,
  kind: string,
  x: number,
  z: number,
): void {
  const { rng, heightField, noVegetation, addDestructible } = context;
  const partnerCount = 1 + ((rng() * 2) | 0);
  for (let index = 0; index < partnerCount; index++) {
    const angle = rng() * Math.PI * 2;
    const radius = 2.4 + rng() * 4;
    const partnerX = x + Math.cos(angle) * radius;
    const partnerZ = z + Math.sin(angle) * radius;
    if (heightField._roadDist(partnerX, partnerZ) < 7
        || noVegetation(partnerX, partnerZ)) continue;
    addDestructible(kind, partnerX,
      heightField.getHeightAt(partnerX, partnerZ) - 0.03, partnerZ,
      rng() * Math.PI * 2, 0.85 + rng() * 0.3);
  }
}

function scatterFieldProps(
  context: FieldScatterContext,
  kind: string,
  count: number,
): void {
  const { rng, heightField, addDestructible } = context;
  for (let attempt = 0, placed = 0; attempt < count * 16 && placed < count; attempt++) {
    const x = (rng() * 2 - 1) * 420;
    const z = (rng() * 2 - 1) * 420;
    if (!isFieldScatterPointClear(context, x, z)) continue;
    const y = heightField.getHeightAt(x, z);
    addDestructible(kind, x, y - 0.03, z, rng() * Math.PI * 2, 0.9 + rng() * 0.3);
    if (rng() < 0.55) addFieldScatterPartners(context, kind, x, z);
    placed++;
  }
}

interface DestructibleBuildContext {
  heightField: HeightField;
  seed: number;
  localTypes: Readonly<Record<string, PropsDestructibleMeta>>;
  pools: Map<string, DestructiblePool>;
  records: DestructibleRecord[];
  looseRecords: LooseDestructibleRecord[];
  obstacles: PropsCollisionRecord[];
  colliders: CollisionRecord[];
  crushables: CrushableRecord[];
  quaternion: THREE.Quaternion;
  euler: THREE.Euler;
}

interface GroundedDestructiblePlacement {
  y: number;
  support: GroundSupportRecord | null;
}

interface DestructibleContactExtents {
  radius: number;
  halfWidth: number;
  halfLength: number;
}

function resolveDestructibleMeta(
  context: DestructibleBuildContext,
  kind: string,
): PropsDestructibleMeta {
  const meta = context.localTypes[kind]
    || DESTRUCTIBLE_BUILDING_TYPES[kind] || PROP_TYPE_REGISTRY[kind];
  if (!meta) throw new Error('world/props: unknown destructible kind ' + kind);
  return meta;
}

function groundDestructiblePlacement(
  heightField: HeightField,
  meta: PropsDestructibleMeta,
  x: number,
  y: number,
  z: number,
  yaw: number,
  scale: number,
  tiltX: number,
  tiltZ: number,
): GroundedDestructiblePlacement {
  if (meta.fence || meta.wall) {
    const centerY = heightField.getHeightAt(x, z);
    return {
      y: Math.min(y, centerY - 0.025),
      support: { mode: 'pitched', min: centerY, max: centerY, spread: 0 },
    };
  }
  if (Math.abs(tiltX) >= 0.08 || Math.abs(tiltZ) >= 0.08) {
    return { y, support: null };
  }
  const usesObb = meta.hw != null || meta.hl != null;
  const sampled = usesObb
    ? sampleObbGround(heightField, x, z,
      (meta.hw ?? meta.r) * scale, (meta.hl ?? meta.r) * scale, yaw, 0.025)
    : sampleDiscGround(heightField, x, z,
      (meta.groundR ?? meta.collisionR ?? meta.r) * scale, 0.025);
  return {
    y: Math.min(y, sampled.y),
    support: { mode: usesObb ? 'obb' : 'disc', ...sampled },
  };
}

function ensureDestructiblePool(
  context: DestructibleBuildContext,
  kind: string,
  meta: PropsDestructibleMeta,
): DestructiblePool {
  const existing = context.pools.get(kind);
  if (existing) return existing;
  const pool: DestructiblePool = {
    meta, mats4: [], records: [], imI: null, imB: null, nBroken: 0,
  };
  context.pools.set(kind, pool);
  return pool;
}

function addLooseDestructibleBody(
  context: DestructibleBuildContext,
  meta: PropsDestructibleMeta,
  record: DestructibleRecord,
  recordIndex: number,
): void {
  if (meta.cls !== 'physics') return;
  record.looseIndex = context.looseRecords.length;
  record.body = createLoosePropBody({
    x: record.x, baseY: record.y, z: record.z,
    radius: (meta.bodyR ?? meta.r) * record.sc,
    height: record.h,
    mass: meta.mass ?? 1,
    restitution: meta.bounce ?? 0.32,
    friction: meta.friction ?? 2.2,
    airDrag: meta.airDrag ?? 0.16,
    angularDrag: meta.angularDrag ?? 0.42,
    groundConstrained: meta.groundConstrained === true,
    spinBias: ((recordIndex + context.seed) & 1) ? 1 : -1,
  });
  record.looseListed = false;
  context.looseRecords.push(record as LooseDestructibleRecord);
}

function getDestructibleContactExtents(
  meta: PropsDestructibleMeta,
  scale: number,
  yaw: number,
  radius: number,
): DestructibleContactExtents {
  const contactRadius = meta.fence || meta.wall
    ? Math.max(meta.r * scale, 0.6) : radius;
  if (meta.hw != null || meta.hl != null) {
    const halfWidth = (meta.hw ?? meta.r) * scale;
    const halfLength = (meta.hl ?? meta.r) * scale;
    const cosine = Math.abs(Math.cos(yaw));
    const sine = Math.abs(Math.sin(yaw));
    return {
      radius: contactRadius,
      halfWidth: halfWidth * cosine + halfLength * sine + 0.05,
      halfLength: halfWidth * sine + halfLength * cosine + 0.05,
    };
  }
  if (meta.fence || meta.wall) {
    const segmentLength = meta.wall ? WALL_SEG : FENCE_SEG;
    const thickness = meta.wall ? 0.35 : 0.2;
    const cosine = Math.abs(Math.cos(yaw));
    const sine = Math.abs(Math.sin(yaw));
    return {
      radius: contactRadius,
      halfWidth: (thickness * cosine + segmentLength * 0.5 * sine) * scale + 0.05,
      halfLength: (thickness * sine + segmentLength * 0.5 * cosine) * scale + 0.05,
    };
  }
  return { radius: contactRadius, halfWidth: contactRadius, halfLength: contactRadius };
}

function applyDestructibleObstacleShape(
  obstacle: PropsCollisionRecord,
  meta: PropsDestructibleMeta,
  record: DestructibleRecord,
  extents: DestructibleContactExtents,
): void {
  const { x, z, yaw, sc: scale } = record;
  if (meta.hw != null || meta.hl != null) {
    setObbShape(obstacle, x, z, (meta.hw ?? meta.r) * scale + 0.05,
      (meta.hl ?? meta.r) * scale + 0.05, yaw);
  } else if (meta.fence || meta.wall) {
    const segmentLength = meta.wall ? WALL_SEG : FENCE_SEG;
    const thickness = meta.wall ? 0.35 : 0.2;
    setObbShape(obstacle, x, z, thickness * scale + 0.05,
      segmentLength * 0.5 * scale + 0.05, yaw);
  } else if (meta.shape === 'circle') {
    setCircleShape(obstacle, x, z, (meta.collisionR ?? meta.r) * scale + 0.025);
  } else {
    setObbShape(obstacle, x, z, extents.radius, extents.radius, yaw);
  }
}

function registerDestructibleObstacle(
  context: DestructibleBuildContext,
  meta: PropsDestructibleMeta,
  record: DestructibleRecord,
  recordIndex: number,
): void {
  const extents = getDestructibleContactExtents(meta, record.sc, record.yaw, record.r);
  const obstacle: PropsCollisionRecord = {
    min: [record.x - extents.halfWidth, record.y, record.z - extents.halfLength],
    max: [record.x + extents.halfWidth, record.y + record.h,
      record.z + extents.halfLength],
    crushable: true, crushed: false, propIdx: recordIndex, kind: record.kind,
  };
  applyDestructibleObstacleShape(obstacle, meta, record, extents);
  if (meta.keep != null) obstacle.crushKeep = meta.keep;
  if (meta.crushMin != null) obstacle.crushMin = meta.crushMin;
  record.ob = obstacle;
  context.obstacles.push(obstacle);
  if (!meta.collider) return;
  const collider = cloneCollisionRecord(obstacle);
  collider.dead = false;
  record.col = collider;
  context.colliders.push(collider);
}

function registerDestructibleContact(
  context: DestructibleBuildContext,
  meta: PropsDestructibleMeta,
  record: DestructibleRecord,
  recordIndex: number,
): void {
  if (meta.contact === 'ob') {
    registerDestructibleObstacle(context, meta, record, recordIndex);
    return;
  }
  if (meta.contact !== 'loop') return;
  const entry: CrushableRecord = {
    x: record.x, y: record.y, z: record.z, r: record.r, h: record.h,
    recIdx: recordIndex, kind: record.kind,
    dynamic: meta.cls === 'physics', toppled: false,
  };
  context.crushables.push(entry);
  record.loopRef = entry;
}

function addDestructibleRecord(
  context: DestructibleBuildContext,
  kind: string,
  x: number,
  y: number,
  z: number,
  yaw = 0,
  scale = 1,
  tiltX = 0,
  tiltZ = 0,
): DestructibleRecord {
  const meta = resolveDestructibleMeta(context, kind);
  const placement = groundDestructiblePlacement(
    context.heightField, meta, x, y, z, yaw, scale, tiltX, tiltZ,
  );
  const pool = ensureDestructiblePool(context, kind, meta);
  context.euler.set(tiltX, yaw, tiltZ, 'YXZ');
  context.quaternion.setFromEuler(context.euler);
  _mat4.compose(_posv.set(x, placement.y, z), context.quaternion,
    _scalev.set(scale, scale, scale));
  pool.mats4.push(_mat4.clone());
  const record: DestructibleRecord = {
    kind, cls: meta.cls, x, y: placement.y, z, yaw, sc: scale,
    r: meta.r * scale, h: meta.h * scale,
    slot: pool.mats4.length - 1, state: 0, ob: null,
    groundSupport: placement.support,
  };
  const recordIndex = context.records.length;
  context.records.push(record);
  pool.records.push(record);
  addLooseDestructibleBody(context, meta, record, recordIndex);
  registerDestructibleContact(context, meta, record, recordIndex);
  return record;
}

// ---------------------------------------------------------------------------
// createProps
// ---------------------------------------------------------------------------

/**
 * Create rocks, village buildings, walls and cover props.
 * @param {object} heightField HeightField from terrain.createHeightField
 * @param {object} engineCtx EngineCtx (ARCHITECTURE §2.8)
 * @param {number} [seed=2002] props seed
 * @param {?object} [cfg=null] map config (uses cfg.props); null = classic verdant set
 * @returns {{group:THREE.Group, obstacles:Array<{min:number[],max:number[]}>,
 *   colliders:Array<{min:number[],max:number[]}>, features:{buildings:Array<object>}}}
 */
export function createProps(
  heightField: HeightField,
  engineCtx: EngineContext,
  seed = 2002,
  cfg: PropsMapConfig | null = null,
): PropsRuntime {
  const g = propsBuildSteps(heightField, engineCtx, seed, cfg);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

/**
 * perf-r3 (play-session probe): chunked twin of {@link createProps} — the
 * one-call build was a single ~1.6 s task behind the loading bar. Awaits
 * `tick(done, total)` between placement families (buildings, rowhouses,
 * walls, trucks, crops, street furniture, wrecks, pool finalization) so the
 * loading screen keeps painting. Byte-identical output: both wrappers drain
 * the same generator, same rng draw order.
 * @param {?function(number, number): (Promise<void>|void)} tick
 */
export async function createPropsAsync(
  heightField: HeightField,
  engineCtx: EngineContext,
  seed = 2002,
  cfg: PropsMapConfig | null = null,
  tick: ((done: number, total: number) => Promise<void> | void) | null = null,
  fineSlices = false,
): Promise<PropsRuntime> {
  const g = propsBuildSteps(heightField, engineCtx, seed, cfg);
  let r = g.next();
  let i = 0;
  const total = fineSlices ? 60 : 9;
  while (!r.done) {
    const step = r.value;
    if (step?.tankBuilder) await ensureTankBuilder(step.tankBuilder);
    if (tick && (fineSlices || !step || !step.fine)) await tick(++i, total);
    r = g.next();
  }
  return r.value;
}

function* propsBuildSteps(
  heightField: HeightField,
  engineCtx: EngineContext,
  seed: number,
  cfg: PropsMapConfig | null,
): Generator<PropsBuildSlice | undefined, PropsRuntime, void> {
  const P: PropsSettings = {
    plan: ['cottage', 'barn', 'cottage', 'tower', 'cottage', 'ruin',
      'cottage', 'barn', 'cottage', 'cottage'],
    tones: {}, rockTone: null, wallStoneChance: 0.25,
    buildingLat: [10, 4], sideSkip: 0.25, maxSpread: 1.7, spacingPad: 9,
    wallRuns: null, well: true, hayCrates: true, fences: true,
    telegraph: true, carts: true, logs: true,
    haystacks: 15, rocks: 170, outcrops: 16, craters: 30, rubblePiles: 0,
    wrecks: 4, // r7: burned-out vehicle hulks along the roads (contested read)
    // r6 terrain_environment dressing passes (per-biome, see map configs):
    // cropFields = standing crop-row plots on open farmland; lampposts =
    // cast-iron street lights along the town grid; hedgehogs = steel anti-
    // tank obstacles scattered on streets/approaches
    cropFields: 0, lampposts: false, hedgehogs: 0,
    destructibleBuildings: [],
    // Authored composite positions that turn a broad lane into a memorable
    // decision point. Each beat may combine a destructible structure,
    // sandbag redoubt, hard rock outcrop and staged wreck while reusing the
    // existing pooled/merged render families.
    tacticalBeats: [],
    streetRows: false, curbs: false, monument: false, townCraters: false,
    ...((cfg && cfg.props) || {}),
  };
  const mapId = cfg ? cfg.id : 'verdant';
  const rng = mulberry32(seed);
  const detailUvRng = () => 0.5;
  const L = heightField._layout;
  const noVeg = heightField._noVeg || (() => false);
  const noi = new SimplexNoise({ random: mulberry32(seed + 7) });
  const aniso = engineCtx.anisotropy ?? 4;
  const group = new THREE.Group();
  group.name = 'props';
  const decorationGroundingReceipts: DecorationGroundingReceipt[] = [];
  const v = L.village;

  const T = P.tones || {};
  const plaster = makePlaster(noi, aniso, T.plaster || null);
  yield { fine: true };
  // content_breadth r3: TWO extra render families — the street walls
  // recycled one plaster print ("same white-plaster box repeats dozens of
  // times", critique). Map configs may author tones.plaster2/plaster3
  // (urban.js does); other maps derive tasteful shifts of their own plaster
  // tone so village cottages inherit the variety for free.
  const _tShift = (
    base: ToneFunction | null | undefined,
    dh: number,
    ds: number,
    dl: number,
  ): ToneFunction => (h: number, s: number, l: number) => {
    const [bh, bs, bl] = base ? base(h, s, l) : [h, s, l];
    return [Math.max(0, Math.min(1, bh + dh)),
      Math.max(0, Math.min(1, bs * ds)),
      Math.max(0, Math.min(1, bl * dl))];
  };
  const plaster2 = makePlaster(noi, aniso, T.plaster2 || _tShift(T.plaster, +0.022, 1.1, 0.90));
  yield { fine: true };
  const plaster3 = makePlaster(noi, aniso, T.plaster3 || _tShift(T.plaster, -0.035, 0.72, 0.84));
  yield { fine: true };
  const roofT = makeRoofTiles(noi, aniso, T.roof || null);
  yield { fine: true };
  const stone = makeStone(noi, aniso, T.stone || null);
  yield { fine: true };
  const wood = makeWood(noi, aniso, T.wood || null);
  yield { fine: true };
  const straw = makeStraw(noi, aniso, T.straw || null);
  yield { fine: true };
  const structureWood = makeStructureDetail(noi, aniso, 'wood');
  yield { fine: true };
  const structureCanvas = makeStructureDetail(noi, aniso, 'canvas');
  yield { fine: true };
  const structureMetal = makeStructureDetail(noi, aniso, 'steel');
  yield { fine: true };
  const vehiclePaint = makeVehiclePaint(noi, Math.min(aniso, 4));
  yield { fine: true };

  // Deep-hunt 2026-07: sourced CC0 PBR building sets (ambientCG, see
  // docs/ATTRIBUTION.md) swap into plaster/roof/wood (and stone -> brick on
  // urban) in place when they load; procedural stays the fallback of record.
  const sourcedTexturesReady = applySourcedBuildings({ plaster, roof: roofT, wood, stone }, mapId);

  const windowStyle = resolveStructureWindowStyle(mapId);
  const mats: Record<string, THREE.MeshStandardMaterial> = {
    plaster: new THREE.MeshStandardMaterial({ map: plaster.albedo, normalMap: plaster.normal,
      roughnessMap: plaster.surface, aoMap: plaster.surface, roughness: 1, metalness: 0 }),
    plaster2: new THREE.MeshStandardMaterial({ map: plaster2.albedo, normalMap: plaster2.normal,
      roughnessMap: plaster2.surface, aoMap: plaster2.surface, roughness: 1, metalness: 0 }),
    plaster3: new THREE.MeshStandardMaterial({ map: plaster3.albedo, normalMap: plaster3.normal,
      roughnessMap: plaster3.surface, aoMap: plaster3.surface, roughness: 1, metalness: 0 }),
    roof: new THREE.MeshStandardMaterial({ map: roofT.albedo, normalMap: roofT.normal,
      roughnessMap: roofT.surface, aoMap: roofT.surface, roughness: 1, metalness: 0 }),
    stone: new THREE.MeshStandardMaterial({ map: stone.albedo, normalMap: stone.normal,
      roughnessMap: stone.surface, aoMap: stone.surface, roughness: 1, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ map: wood.albedo, normalMap: wood.normal,
      roughnessMap: wood.surface, aoMap: wood.surface, roughness: 1, metalness: 0 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x161a1d, roughness: 0.35, metalness: 0.15 }),
    // content_breadth r3: window PANES get real materials — the old shared
    // near-black 'dark' slabs read as unframed voids at establishing
    // distance (critique). 'glass' is a low-roughness slate that picks up
    // sky/env specular; 'curtain' is a muted warm fill (daytime curtained /
    // shuttered interiors) that breaks the all-black grid without turning
    // into the white/emissive rectangles seen under Ruinspires' exposure.
    // world-dressing r1 + AA agent's FINAL measured glass spec (4eccce8):
    // roughness floor 0.35 (sub-pixel sky-glints shimmered under AA at
    // range — the sky-catch read comes from envMapIntensity, not tightness),
    // metalness <= 0.2, envMapIntensity capped at 1.0 below (1.5 pushed
    // glints past the 1.78 bloom threshold).
    glass: new THREE.MeshPhysicalMaterial({ color: windowStyle.glassColor,
      roughness: windowStyle.glassRoughness, metalness: windowStyle.glassMetalness,
      clearcoat: windowStyle.glassClearcoat,
      clearcoatRoughness: windowStyle.glassClearcoatRoughness,
      envMapIntensity: windowStyle.glassEnvMapIntensity }),
    curtain: new THREE.MeshStandardMaterial({ color: windowStyle.curtainColor,
      roughness: 0.94, metalness: 0, emissive: windowStyle.curtainEmissive,
      emissiveIntensity: windowStyle.curtainEmissiveIntensity }),
    straw: new THREE.MeshStandardMaterial({ map: straw.albedo, normalMap: straw.normal,
      roughnessMap: straw.surface, aoMap: straw.surface, roughness: 1, metalness: 0 }),
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    baked: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }),
    vehicle: new THREE.MeshStandardMaterial({
      map: vehiclePaint.albedo,
      normalMap: vehiclePaint.normal,
      roughnessMap: vehiclePaint.surface,
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.045,
    }),
    structureWood: new THREE.MeshStandardMaterial({
      map: structureWood.albedo, normalMap: structureWood.normal,
      roughnessMap: structureWood.surface, aoMap: structureWood.surface,
      vertexColors: true, roughness: 1, metalness: 0,
    }),
    structureCanvas: new THREE.MeshStandardMaterial({
      map: structureCanvas.albedo, normalMap: structureCanvas.normal,
      roughnessMap: structureCanvas.surface, aoMap: structureCanvas.surface,
      vertexColors: true, roughness: 1, metalness: 0,
    }),
    structureMetal: new THREE.MeshStandardMaterial({
      map: structureMetal.albedo, normalMap: structureMetal.normal,
      roughnessMap: structureMetal.surface, aoMap: structureMetal.surface,
      vertexColors: true, roughness: 1, metalness: 0.08,
    }),
  };
  function configureSurfaceMaterials(): void {
    for (const key of ['plaster', 'plaster2', 'plaster3', 'roof', 'stone', 'wood',
      'straw', 'structureWood', 'structureCanvas', 'structureMetal']) {
      mats[key].aoMapIntensity = 0.82;
    }
    mats.rock.envMapIntensity = 0.35; // no white env-specular sparkle at distance
    mats.baked.envMapIntensity = 0.5; // flat-shaded sourced models: no spec sparkle
    mats.vehicle.envMapIntensity = 0.58;
    mats.structureWood.envMapIntensity = 0.34;
    mats.structureCanvas.envMapIntensity = 0.22;
    mats.structureMetal.envMapIntensity = 0.48;
    mats.glass.envMapIntensity = 1.0; // capped (AA glass spec 4eccce8 — glints
  }
  configureSurfaceMaterials();
  // above this crossed the 1.78 bloom threshold; the post-side firefly clamp
  // is a safety net, not a design allowance)

  // world-space grime/variation overlay: a second noise-masked albedo layer
  // (macro tone breakup + streaky weathering) that de-grids every tiled
  // hard-surface texture — walls stop reading as a repeated stamp at zoom
  const grimeTex = makeGrimeTexture(noi, aniso);
  yield { fine: true };
  // r5 terrain_environment: WINTER SNOW-CAP — on the winter map every prop
  // material whitens its UP-FACING fragments toward drifted snow (clumpy,
  // noise-broken). This is what fixes the physically-contradictory "fully
  // snow-free saturated orange roofs in a deep-snow scene" critique: roofs,
  // wall tops, chimneys, carts, sourced baked models and rocks all carry a
  // slope-masked snow load, while vertical faces keep their material.
  const snowCap = mapId === 'winter' || !!P.snowCap;
  const grimeHook: MaterialShaderHook = (shader) => {
    shader.uniforms.uGrime = { value: grimeTex };
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <worldpos_vertex>', /* glsl */`#include <worldpos_vertex>
{
  vec4 gw = vec4(transformed, 1.0);
  vec3 gn = objectNormal;
  #ifdef USE_INSTANCING
  gw = instanceMatrix * gw;
  gn = mat3(instanceMatrix) * gn;
  #endif
  vGrimeW = (modelMatrix * gw).xyz;
  vGrimeN = normalize(mat3(modelMatrix) * gn);
}`);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying vec3 vGrimeW;\nvarying vec3 vGrimeN;\nuniform sampler2D uGrime;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <map_fragment>', /* glsl */`#include <map_fragment>
{
  float gA = texture2D(uGrime, vGrimeW.xz * 0.021 + vGrimeW.y * 0.013).r;
  float gB = texture2D(uGrime, vec2(vGrimeW.x + vGrimeW.z, vGrimeW.y * 1.7) * 0.055).g;
  diffuseColor.rgb *= 0.84 + gA * 0.30;
  diffuseColor.rgb *= 1.0 - smoothstep(0.58, 0.95, gB) * 0.20;
  // r3 terrain_environment: smooth ~25-60 m warm/cool + value drift so
  // adjacent buildings stop sharing one identical facade/roof tone (the
  // "whole town shares 3-4 materials" tell). Low frequency = no seams
  // across a single wall, but neighbouring houses land on different tints.
  float gC = texture2D(uGrime, vGrimeW.xz * 0.0058 + vec2(0.31, 0.67)).b;
  diffuseColor.rgb *= 0.92 + gC * 0.16;
  diffuseColor.rgb = mix(diffuseColor.rgb,
    diffuseColor.rgb * (gC > 0.5 ? vec3(1.05, 1.0, 0.93) : vec3(0.95, 0.99, 1.06)),
    abs(gC - 0.5) * 1.1);
${snowCap ? `
  // winter: slope-masked snow load on upward faces (clumpy, wind-tailed)
  {
    float swN = texture2D(uGrime, vGrimeW.xz * 0.11 + vec2(0.13, 0.71)).r;
    float sw = smoothstep(0.52, 0.80, vGrimeN.y + (swN - 0.5) * 0.22);
    sw *= 0.72 + 0.28 * texture2D(uGrime, vGrimeW.xz * 0.031).g;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.795, 0.835, 0.90), sw * 0.88);
  }` : ''}
}`);
  };
  function installSurfaceShaderHooks(): void {
    for (const [materialKind, material] of Object.entries(mats)) {
      engineCtx.setupShadowMaterial(material,
        materialKind === 'dark' || materialKind === 'glass' ? null : grimeHook);
      material.customProgramCacheKey = () =>
        'world-props-' + materialKind + '-v6' + (snowCap ? 's' : '');
    }
  }
  installSurfaceShaderHooks();

  const buckets: CompletePropsBuckets = {
    plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
    glass: [], curtain: [], straw: [], baked: [],
  };
  const obstacles: PropsCollisionRecord[] = [];
  const colliders: CollisionRecord[] = [];
  // crushables — the main.ts hull-radius contact loop (effects_combat r1).
  // Entries are telegraph poles ({index} into the pole InstancedMesh) OR
  // world-dressing r1 'loop'-contact destructibles ({recIdx} into the
  // destructible records below): flat/small clutter a hull brushes aside.
  const crushables: CrushableRecord[] = []; // [{x,y,z,r,h,toppled, index?|recIdx?}]
  // One renderer-free topology + one InstancedMesh for every conductor
  // segment. Only spans touching a falling pole are rewritten during impact.
  let utilityNetwork: UtilityNetwork | null = null;
  let wireIM: THREE.InstancedMesh | null = null;

  // -------------------------------------------------------------------------
  // DESTRUCTIBLE SMALL-PROP LAYER (world-dressing r1) — "just like trees".
  //
  // Every inhabiting object (carts, crates, barrels, fences, stalls, bales,
  // troughs, lamps, ...) is an instance in a per-type InstancedMesh pool with
  // a destructible RECORD. Three trigger paths, all landing in breakRecord():
  //  1. hull overrun of a tagged CRUSHABLE OBSTACLE — the exact tree seam:
  //     state.ts SAT detects, queues, calls world.crushObstacle → propIdx
  //     routes here (map.ts); state.ts applies the speed bite + emits
  //     prop:crushed (generic dust via main.ts fx.propCrush);
  //  2. hull-radius contact via the main.ts crushables loop ('loop' class —
  //     sapling-grade clutter with NO obstacle at all);
  //  3. shells — src/fx/effects.ts forwards per-frame flight segments and
  //     world-impact points through src/world/destructibles.ts; light props
  //     are shoot-through (no colliders — a hay bale never eats a shell) and
  //     break cosmetically, HE clears a radius.
  // Break classes: 'break' zero-scales the intact instance and activates a
  // pre-built flattened debris instance in the type's broken pool (no
  // per-frame cost once settled, no respawn); 'topple' runs the pole-style
  // eased hinge fall and persists tipped. Kind-flavored particle bursts ride
  // the destructibles.ts seam into fx.propBreak (splinters/staves/hay puff).
  // -------------------------------------------------------------------------
  const drng = mulberry32(seed + 9001); // own stream — never shifts placements
  const destructibles: DestructibleRecord[] = []; // records: {kind,cls,x,y,z,yaw,sc,r,h,slot,state,ob}
  const looseRecords: LooseDestructibleRecord[] = []; // physics-class records; sleeping records cost no update work
  const activeLoose: LooseDestructibleRecord[] = []; // only awake records, bounded by the local interaction area
  const dPools = new Map<string, DestructiblePool>(); // kind -> {meta, mats4: Matrix4[], imI, imB, nBroken}
  const _dq = new THREE.Quaternion();
  const _de = new THREE.Euler();
  const _structureTint = new THREE.Color();
  // DESTRUCTIBLES r1: kinds whose INTACT geometry is a licensed baked model
  // (props-models.json) — they cannot live in inhabitKit (no bakedGeometry
  // there). Same meta shape; the shared broken state is the burst-bag heap.
  // keep 0.97: driving a sandbag line barely registers on the speedo.
  const LOCAL_TYPES: Record<string, PropsDestructibleMeta> = {
    sandbagbig: {
      cls: 'break', mat: 'baked', contact: 'ob', r: 2.0, h: 1.35, keep: 0.97,
      build: () => buildSourcedStructureGeometry('sandbagbig'),
      broken: bSandbagBroken,
    },
    sandbagsmall: {
      cls: 'break', mat: 'baked', contact: 'ob', r: 1.7, h: 1.05, keep: 0.975,
      build: () => buildSourcedStructureGeometry('sandbagsmall'),
      broken: bSandbagBroken,
    },
    sandbagwall: {
      cls: 'break', mat: 'baked', contact: 'ob', r: 1.5, h: 1.0, keep: 0.975,
      build: () => buildSourcedStructureGeometry('sandbagwall'),
      broken: bSandbagBroken,
    },
  };
  const destructibleContext: DestructibleBuildContext = {
    heightField,
    seed,
    localTypes: LOCAL_TYPES,
    pools: dPools,
    records: destructibles,
    looseRecords,
    obstacles,
    colliders,
    crushables,
    quaternion: _dq,
    euler: _de,
  };
  function addDestructible(
    kind: string,
    x: number,
    y: number,
    z: number,
    yaw = 0,
    sc = 1,
    tiltX = 0,
    tiltZ = 0,
  ): DestructibleRecord {
    return addDestructibleRecord(
      destructibleContext, kind, x, y, z, yaw, sc, tiltX, tiltZ,
    );
  }
  /**
   * March destructible fence MODULES (FENCE_SEG pitch) along a ground line —
   * the wooden-fence side of the wall kit. Modules pitch to the terrain,
   * skip road crossings (natural gaps), and can hang an open GATE module at
   * a skip or at the far end. Every module is an independent destructible:
   * drive-through-able like saplings, breakable by shells.
   * @param {string} kind fence type ('fenceplank'|'fencepicket'|'fencewattle'|'fencerail')
   * @param {number} gateChance chance the first road-gap edge gets a gate
   */
  function placeFenceRun(
    kind: string,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    gateChance = 0.35,
  ): void {
    const along = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(along / FENCE_SEG));
    const tx = (x1 - x0) / along, tz = (z1 - z0) / along;
    const yaw = Math.atan2(tx, tz); // module runs along local +z
    let gated = false;
    let openRun = false;
    for (let k = 0; k < n; k++) {
      const ax = x0 + tx * (k * FENCE_SEG), az = z0 + tz * (k * FENCE_SEG);
      const bx = x0 + tx * ((k + 1) * FENCE_SEG), bz = z0 + tz * ((k + 1) * FENCE_SEG);
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      if (Math.max(Math.abs(cx), Math.abs(cz)) > 478) { openRun = false; continue; }
      if (heightField._roadDist(cx, cz) < 4.6 || noVeg(cx, cz)) {
        if (openRun && !gated && drng() < gateChance) {
          // hang an open gate at the field entrance the road cuts
          const gy = heightField.getHeightAt(ax, az);
          addDestructible('gate', ax, gy - 0.06, az, yaw, 1);
          gated = true;
        }
        openRun = false;
        continue;
      }
      if (drng() < 0.05) { openRun = false; continue; } // the odd missing module
      const ya = heightField.getHeightAt(ax, az), yb = heightField.getHeightAt(bx, bz);
      const cy = Math.min(ya, yb);
      const tiltX = Math.atan2(yb - ya, FENCE_SEG) * 0.85;
      addDestructible(kind, cx, cy - 0.06, cz, yaw, 0.96 + drng() * 0.10, tiltX, (drng() - 0.5) * 0.03);
      openRun = true;
    }
  }

  /** Seeded ring scatter of destructibles around a point (yards, markets). */
  function scatterDestructibles(
    kind: string,
    cx: number,
    cz: number,
    count: number,
    rMin: number,
    rMax: number,
    minRoad = 3.5,
  ): number {
    let placed = 0;
    for (let t = 0; t < count * 7 && placed < count; t++) {
      const a = drng() * Math.PI * 2, r = rMin + drng() * (rMax - rMin);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (Math.max(Math.abs(x), Math.abs(z)) > 478) continue;
      if (heightField._roadDist(x, z) < minRoad || noVeg(x, z)) continue;
      if (heightField.getNormalAt(x, z).y < 0.88) continue;
      let onB = false;
      for (const pb of placedB) {
        if (Math.hypot(x - pb.x, z - pb.z) < pb.rr - 0.5) { onB = true; break; }
      }
      if (onB) continue;
      const y = heightField.getHeightAt(x, z);
      addDestructible(kind, x, y - 0.03, z, drng() * Math.PI * 2, 0.9 + drng() * 0.2);
      placed++;
    }
    return placed;
  }

  const buildingFeatures: PlacedBuilding[] = [];
  const tacticalBeatFeatures: TacticalBeatFeature[] = [];
  // sourced-model instancing: name -> { geo, list: [Matrix4, ...] }
  const bakedInstances = new Map<string, BakedInstanceGroup>();
  function addBakedInstance(
    name: string,
    geo: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    yaw: number,
    sc = 1,
    tiltX = 0,
    tiltZ = 0,
  ): void {
    let e = bakedInstances.get(name);
    if (!e) { e = { geo, list: [] }; bakedInstances.set(name, e); }
    _quat.setFromEuler(_euler.set(tiltX, yaw, tiltZ, 'YXZ'));
    _mat4.compose(_posv.set(x, y, z), _quat, _scalev.set(sc, sc, sc));
    e.list.push(_mat4.clone());
  }

  function groundFit(x: number, z: number, w: number, d: number, rot: number) {
    const cs = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot));
    const hx = (w * cs + d * sn) / 2, hz = (w * sn + d * cs) / 2;
    const support = sampleObbGround(heightField, x, z, w / 2, d / 2, rot);
    return { y: support.y, spread: support.spread, hx, hz };
  }

  function addStructureCollision(
    id: string, tmp: PropsBuckets, x: number, baseY: number, z: number, yaw: number,
  ): void {
    let profile;
    try {
      profile = deriveStructureCollisionProfile(tmp);
    } catch (error) {
      throw new Error(`${id}: unable to derive structure collision`, { cause: error });
    }
    appendStructureCollisionBand(obstacles, profile.contact, x, baseY, z, yaw).kind = 'structure';
    for (const band of profile.shell) {
      appendStructureCollisionBand(colliders, band, x, baseY, z, yaw).kind = 'structure';
    }
  }

  yield;
  // --- village buildings along the roads ---
  const roads = L.roads;
  // junction/plaza: the road crossing nearest the village/town center
  function resolveVillageJunction(): { x: number; z: number } {
    if (mapId === 'verdant') return { x: 20, z: 73 };
    let best = 1e9;
    let resolved = { x: v.cx, z: v.cz };
    const inspectRoadPair = (
      leftRoad: readonly (readonly [number, number])[],
      rightRoad: readonly (readonly [number, number])[],
    ): void => {
      for (const [ax, az] of leftRoad) for (const [bx, bz] of rightRoad) {
        if (Math.hypot(ax - bx, az - bz) > 18) continue;
        const jx = (ax + bx) / 2, jz = (az + bz) / 2;
        const d = Math.hypot(jx - v.cx, jz - v.cz);
        if (d < best) { best = d; resolved = { x: jx, z: jz }; }
      }
    };
    for (let leftIndex = 0; leftIndex < roads.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < roads.length; rightIndex++) {
        inspectRoadPair(roads[leftIndex], roads[rightIndex]);
      }
    }
    return resolved;
  }
  const junction = resolveVillageJunction();
  // point-to-segment distance (local twin of terrain.js segDist)
  function segD(
    px: number,
    pz: number,
    ax: number,
    az: number,
    bx: number,
    bz: number,
  ): number {
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = clamp(t, 0, 1);
    const ex = ax + dx * t - px, ez = az + dz * t - pz;
    return Math.hypot(ex, ez);
  }
  // distance to the nearest road EXCLUDING index `skip` (keeps crossings open)
  function distToOtherRoads(x: number, z: number, skip = -1): number {
    let best = 1e9;
    for (let ri = 0; ri < roads.length; ri++) {
      if (ri === skip) continue;
      const nodes = roads[ri];
      for (let sg = 0; sg < nodes.length - 1; sg++) {
        const d = segD(x, z, nodes[sg][0], nodes[sg][1], nodes[sg + 1][0], nodes[sg + 1][1]);
        if (d < best) best = d;
      }
    }
    return best;
  }

  // content_breadth r3: wall-material picker — stone share still follows
  // P.wallStoneChance (desert adobe stays all-sandstone), but the plaster
  // share now splits across the three render families, and a cap stops the
  // SAME plaster print appearing on 3+ consecutive placements (the "same
  // white box repeats dozens of times" critique).
  const _wallHist: Array<string | null> = [null, null];
  function pickWall(rr: Rng): string {
    let b = rr() < P.wallStoneChance ? 'stone'
      : (() => { const q = rr(); return q < 0.5 ? 'plaster' : q < 0.8 ? 'plaster2' : 'plaster3'; })();
    if (b !== 'stone' && _wallHist[0] === b && _wallHist[1] === b) {
      b = b === 'plaster' ? 'plaster2' : b === 'plaster2' ? 'plaster3' : 'plaster';
    }
    _wallHist[1] = _wallHist[0]; _wallHist[0] = b;
    return b;
  }

  function collectBuildingCandidates(): Array<{ x: number; z: number; tx: number; tz: number }> {
    const result: Array<{ x: number; z: number; tx: number; tz: number }> = [];
    for (const nodes of roads) {
      for (let i = 1; i < nodes.length - 1; i++) {
        const [nx, nz] = nodes[i];
        if (nx < v.x0 + 6 || nx > v.x1 - 6 || nz < v.z0 + 6 || nz > v.z1 - 6) continue;
        if (Math.hypot(nx - junction.x, nz - junction.z) < 22) continue; // keep the plaza open
        const tx = nodes[i + 1][0] - nodes[i - 1][0], tz = nodes[i + 1][1] - nodes[i - 1][1];
        const tl = Math.hypot(tx, tz);
        result.push({ x: nx, z: nz, tx: tx / tl, tz: tz / tl });
      }
    }
    return result;
  }
  const candidates = collectBuildingCandidates();
  // NOTE: sourced barn/church models were trialed here and lost the
  // side-by-side judging to the procedural set (docs/ATTRIBUTION.md).
  const BUILDER_BY_NAME: Record<string, PropsStructureBuilder> = {
    cottage: makeCottage, barn: makeBarn, tower: makeTower, ruin: makeRuin,
    adobe: makeAdobe, rowhouse: makeRowhouse,
    ...URBAN_BUILDERS, // church / factory landmarks (maps/urbanKit.ts)
    // world-dressing r1: per-theme catalog — farmhouse/granary/chapel/mill,
    // logcabin/alpine/onionchurch/woodshed, minaret, cornershop, depot
    ...VILLAGE_BUILDERS,
    // Map-quality structure pass: eight new heavyweight landmarks. They use
    // the same bucket merge path, so detail rises without one mesh per house.
    ...STRUCTURE_BUILDERS,
  };
  const builders = P.plan.map((n) => BUILDER_BY_NAME[n] || makeCottage);
  let bi = 0;
  const placedB: PlacedRadius[] = [];
  function collectTacticalReservations(): PlacedRadius[] {
    const result: PlacedRadius[] = [];
    for (const beat of P.tacticalBeats || []) {
      if (!beat.structure) continue;
      const meta = DESTRUCTIBLE_BUILDING_TYPES[beat.structure];
      if (!meta) continue;
      result.push({
        x: beat.x, z: beat.z,
        rr: Math.hypot(meta.hw, meta.hl) * 0.72 + (beat.reservePad ?? 2.5),
      });
    }
    return result;
  }
  const tacticalReservations = collectTacticalReservations();
  const conflictsTacticalReservation = (x: number, z: number, clearance = 10): boolean => tacticalReservations
    .some((site) => Math.hypot(x - site.x, z - site.z) < site.rr + clearance);
  type BuildingCandidate = (typeof candidates)[number];
  function isRoadBuildingSiteClear(x: number, z: number): boolean {
    return !placedB.some((placed) => Math.hypot(x - placed.x, z - placed.z) < placed.rr + P.spacingPad);
  }
  function jitterBuildingUvs(tmp: PropsBuckets): void {
    for (const bucketName of Object.keys(tmp)) {
      for (const geometry of tmp[bucketName]) {
        jitterUV(geometry, geometry.userData?.detailUv ? detailUvRng : rng);
      }
    }
  }
  function placePlannedBuilding(px: number, pz: number, rot: number): boolean {
    const tmp: PropsBuckets = {
      plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
      glass: [], curtain: [], straw: [], baked: [],
    };
    const structureId = P.plan[bi] || 'cottage';
    const info = builders[bi](rng, tmp, pickWall(rng));
    addCatalogExterior(tmp, { id: structureId, info, variant: bi });
    const fit = groundFit(px, pz, info.w, info.d, rot);
    if (fit.spread > P.maxSpread) return false;
    jitterBuildingUvs(tmp);
    addStructureCollision(structureId, tmp, px, fit.y + 0.05, pz, rot);
    _quat.setFromAxisAngle(_upAxis, rot);
    _mat4.compose(_posv.set(px, fit.y + 0.05, pz), _quat, _one);
    mergeInto(buckets, tmp, _mat4);
    buildingFeatures.push({ x: px, z: pz, w: info.w, d: info.d, rot });
    placedB.push({ x: px, z: pz, rr: Math.max(info.w, info.d) * 0.75 });
    bi++;
    return true;
  }
  function placeRoadBuilding(cand: BuildingCandidate, side: number): void {
    if (rng() < P.sideSkip) return;
    const lat = P.buildingLat[0] + rng() * P.buildingLat[1];
    const px = cand.x - cand.tz * side * lat;
    const pz = cand.z + cand.tx * side * lat;
    if (px < v.x0 || px > v.x1 || pz < v.z0 || pz > v.z1) return;
    if (heightField._roadDist(px, pz) < 7.5 || noVeg(px, pz)) return;
    if (conflictsTacticalReservation(px, pz) || !isRoadBuildingSiteClear(px, pz)) return;
    const rot = Math.atan2(cand.tx, cand.tz) + (rng() - 0.5) * 0.10;
    placePlannedBuilding(px, pz, rot);
  }
  function placeRoadBuildings(): void {
    // Monumental-city maps place their landmark plan first, then let the
    // rowhouse strips knit dense street walls around those reserved masses.
    if (P.streetRows && !P.streetRowsAfterLandmarks) return;
    for (const cand of candidates) {
      if (bi >= builders.length) return;
      for (const side of [-1, 1]) {
        if (bi >= builders.length) return;
        placeRoadBuilding(cand, side);
      }
    }
  }
  placeRoadBuildings();

  // heaped masonry chunks + a jutting charred beam (shared by the street
  // rubble scatter and the collapsed rowhouse slots).
  // r3 terrain_environment: chunks are no longer axis-clean boxes — each box
  // gets a consistent PER-CORNER offset (shared corners move together, so
  // faces stay welded) turning it into an irregular broken-masonry
  // hexahedron; a scatter of small brick shards rings the pile base.
  const _rubbleOff = new Float32Array(24);
  function roughenChunk<T extends THREE.BufferGeometry>(chunk: T, rrng: Rng, amt: number): T {
    for (let c = 0; c < 8; c++) {
      _rubbleOff[c * 3] = (rrng() - 0.5) * amt;
      _rubbleOff[c * 3 + 1] = (rrng() - 0.5) * amt * 0.7;
      _rubbleOff[c * 3 + 2] = (rrng() - 0.5) * amt;
    }
    const cp = chunk.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const ci = (cp.getX(i) > 0 ? 1 : 0) + (cp.getY(i) > 0 ? 2 : 0) + (cp.getZ(i) > 0 ? 4 : 0);
      cp.setXYZ(i, cp.getX(i) + _rubbleOff[ci * 3], cp.getY(i) + _rubbleOff[ci * 3 + 1],
        cp.getZ(i) + _rubbleOff[ci * 3 + 2]);
    }
    chunk.computeVertexNormals();
    return chunk;
  }
  function addRubblePile(x: number, z: number, pr: number, rrng: Rng): void {
    const y = heightField.getHeightAt(x, z);
    const n = 6 + ((rrng() * 5) | 0);
    for (let k = 0; k < n; k++) {
      const a = rrng() * Math.PI * 2, rr = Math.sqrt(rrng()) * pr;
      const cs = 0.35 + rrng() * 0.8;
      // mix chunk classes: blocky masonry / flat slab / brick-proportioned
      const cls = rrng();
      const chunk = cls < 0.55
        ? box(cs, cs * (0.5 + rrng() * 0.5), cs * (0.6 + rrng() * 0.6), 0.9)
        : cls < 0.8
          ? box(cs * 1.3, cs * 0.22, cs * (0.8 + rrng() * 0.5), 0.9)   // wall slab
          : box(cs * 0.7, cs * 0.3, cs * 0.35, 0.9);                    // brick clump
      roughenChunk(chunk, rrng, cs * 0.34);
      jitterUV(chunk, rrng);
      chunk.rotateY(rrng() * Math.PI);
      chunk.rotateX((rrng() - 0.5) * 0.5);
      chunk.translate(x + Math.cos(a) * rr, y + 0.12 + (1 - rr / pr) * pr * 0.35, z + Math.sin(a) * rr);
      buckets.stone.push(chunk);
    }
    // brick-shard apron: small debris feathering the pile into the ground
    for (let k = 0; k < 7; k++) {
      const a = rrng() * Math.PI * 2, rr = pr * (0.8 + rrng() * 0.6);
      const bs = 0.10 + rrng() * 0.16;
      const shard = roughenChunk(box(bs * 1.7, bs * 0.7, bs, 1.2), rrng, bs * 0.4);
      shard.rotateY(rrng() * Math.PI);
      shard.translate(x + Math.cos(a) * rr, y + 0.05, z + Math.sin(a) * rr);
      buckets.stone.push(shard);
    }
    if (rrng() < 0.6) { // charred beam jutting out
      const beam = box(0.14, 0.14, 2.2 + rrng() * 1.4, 1.0);
      beam.rotateX(-0.5 - rrng() * 0.4);
      beam.rotateY(rrng() * Math.PI * 2);
      beam.translate(x, y + pr * 0.4, z);
      buckets.wood.push(beam);
    }
    obstacles.push(setCircleShape(
      { min: [x - pr, y, z - pr], max: [x + pr, y + pr * 0.7, z + pr] }, x, z, pr));
    colliders.push(setCircleShape(
      { min: [x - pr, y, z - pr], max: [x + pr, y + pr * 0.7, z + pr] }, x, z, pr));
  }

  yield;
  // --- contiguous rowhouse strips along the streets (town maps): buildings
  // butt against each other with shared walls, doors on the street, varied
  // heights/facades, the odd collapsed slot spilling rubble into the street ---
  function placeStreetRows(): void {
    if (!P.streetRows) return;
    const srng = mulberry32(seed + 505);
    interface StreetBounds { x: number; z: number; hx: number; hz: number }
    type RoadPoint = [number, number, number, number];
    type RoadPointSampler = (distance: number) => RoadPoint;
    const stripAABBs: StreetBounds[] = [];
    const frontageReservations = placedB.slice();
    const createRoadSampler = (pts: (typeof roads)[number]): { total: number; pointAt: RoadPointSampler } => {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      }
      const total = cum[cum.length - 1];
      const pointAt = (t: number): RoadPoint => {
        let i = 1;
        while (i < cum.length - 1 && cum[i] < t) i++;
        const f = (t - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
        const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f;
        const z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
        let tx = pts[i][0] - pts[i - 1][0], tz = pts[i][1] - pts[i - 1][1];
        const tl = Math.hypot(tx, tz) || 1;
        return [x, z, tx / tl, tz / tl];
      };
      return { total, pointAt };
    };
    const outsideStreetRowArea = (x: number, z: number): boolean =>
      x < v.x0 + 8 || x > v.x1 - 8 || z < v.z0 + 8 || z > v.z1 - 8;
    const blockedStreetRowSite = (
      x: number,
      z: number,
      roadIndex: number,
      width: number,
      depth: number,
    ): boolean => distToOtherRoads(x, z, roadIndex) < 9.5
      || Math.hypot(x - junction.x, z - junction.z) < 26
      || noVeg(x, z)
      || conflictsTacticalReservation(x, z, Math.hypot(width, depth) * 0.5);
    const conflictsFrontage = (x: number, z: number, width: number, depth: number): boolean =>
      frontageReservations.some((site) =>
        Math.hypot(x - site.x, z - site.z) < site.rr + Math.hypot(width, depth) * 0.34);
    const intersectsStreetRow = (x: number, z: number, hx: number, hz: number): boolean =>
      stripAABBs.some((bounds) => Math.abs(x - bounds.x) < hx + bounds.hx - 1.0
        && Math.abs(z - bounds.z) < hz + bounds.hz - 1.0);
    const addStreetRubble = (
      ruined: boolean,
      rx: number,
      rz: number,
      nx: number,
      nz: number,
      offset: number,
      depth: number,
    ): void => {
      if (!ruined) return;
      const x = rx + nx * (offset - depth * 0.55), z = rz + nz * (offset - depth * 0.55);
      if (heightField._roadDist(x, z) > 3.4) addRubblePile(x, z, 1.8 + srng() * 1.2, srng);
    };
    const placeStreetRowSlot = (
      distance: number,
      roadIndex: number,
      side: number,
      pointAt: RoadPointSampler,
    ): number => {
      const width = 8.2 + srng() * 3.0, depth = 8.5 + srng() * 3.5;
      const [rx, rz, tx, tz] = pointAt(distance + width / 2);
      if (outsideStreetRowArea(rx, rz)) return distance + width;
      const nx = -tz * side, nz = tx * side;
      const offset = 5.7 + srng() * 1.8 + depth / 2;
      const x = rx + nx * offset, z = rz + nz * offset;
      if (blockedStreetRowSite(x, z, roadIndex, width, depth)) return distance + 6;
      if (conflictsFrontage(x, z, width, depth)) return distance + width;
      const roll = srng();
      if (roll < 0.14) return distance + 4 + srng() * 7;
      const rot = Math.atan2(-nx, -nz);
      const cs = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot));
      const hx = (width * cs + depth * sn) / 2, hz = (width * sn + depth * cs) / 2;
      if (intersectsStreetRow(x, z, hx, hz)) return distance + width * 0.6;
      const ruined = roll < (P.ruinChance ?? 0.24);
      const tmp: PropsBuckets = {
        plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [],
        glass: [], curtain: [], straw: [], baked: [],
      };
      const info = ruined
        ? makeRuin(rng, tmp)
        : makeRowhouse(rng, tmp, pickWall(srng), {
          w: width, d: depth, lowContrastTrim: mapId === 'ruinspires',
        });
      const fit = groundFit(x, z, info.w, info.d, rot);
      if (fit.spread > 3.2) return distance + width;
      jitterBuildingUvs(tmp);
      addStructureCollision(ruined ? 'ruin' : 'rowhouse', tmp, x, fit.y + 0.05, z, rot);
      _quat.setFromAxisAngle(_upAxis, rot);
      _mat4.compose(_posv.set(x, fit.y + 0.05, z), _quat, _one);
      mergeInto(buckets, tmp, _mat4);
      buildingFeatures.push({ x, z, w: info.w, d: info.d, rot });
      placedB.push({ x, z, rr: Math.max(info.w, info.d) * 0.75 });
      stripAABBs.push({ x, z, hx, hz });
      addStreetRubble(ruined, rx, rz, nx, nz, offset, depth);
      return distance + width - 0.25;
    };
    const placeStreetSide = (
      roadIndex: number,
      side: number,
      total: number,
      pointAt: RoadPointSampler,
    ): void => {
      let distance = 3 + srng() * 9;
      while (distance < total - 10) {
        distance = placeStreetRowSlot(distance, roadIndex, side, pointAt);
      }
    };
    const placeStreetRoad = (roadIndex: number): void => {
      if (roadIndex % Math.max(1, P.streetRowRoadStride || 1) !== 0) return;
      const { total, pointAt } = createRoadSampler(roads[roadIndex]);
      for (const side of [-1, 1]) {
        placeStreetSide(roadIndex, side, total, pointAt);
      }
    };
    for (let roadIndex = 0; roadIndex < roads.length; roadIndex++) {
      placeStreetRoad(roadIndex);
    }

    // --- street furniture + battle litter (town maps) --------------------
    // Cast-iron lampposts march both pavements; small masonry spill, roof-
    // tile shards and the odd toppled post litter the kerb line — the shelled
    // town finally carries its own street-level texture instead of bare
    // asphalt ribbons between facades.
    function placeStreetFurniture(): void {
      const frng = mulberry32(seed + 606);
      const placeStreetLamps = (): void => {
        for (let ri = 0; ri < roads.length; ri++) {
          const pts = roads[ri];
          for (let i = 1; i < pts.length - 1; i += 1) { // r5: every node (~32 m spacing)
          const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
          const tl = Math.hypot(bx - ax, bz - az) || 1;
          const txn = (bx - ax) / tl, tzn = (bz - az) / tl;
          const side = (i % 2) ? 1 : -1; // alternate pavements
          const lx = ax - tzn * side * 5.9, lz = az + txn * side * 5.9;
          if (lx < v.x0 + 4 || lx > v.x1 - 4 || lz < v.z0 + 4 || lz > v.z1 - 4) continue;
          if (distToOtherRoads(lx, lz, ri) < 7 || noVeg(lx, lz)) continue;
          const ly = heightField.getHeightAt(lx, lz);
          if (frng() < 0.18) { // toppled post lying across the pavement
            const fall = box(0.09, 0.09, 4.6, 1.4);
            fall.rotateY(frng() * Math.PI * 2);
            fall.translate(lx, ly + 0.1, lz);
            buckets.dark.push(fall);
            continue;
          }
          // world-dressing r1: standing lamps are DESTRUCTIBLE instances —
          // a moving hull hinge-topples them (tree seam), shells knock them
          // down; the felled post persists across the pavement.
          // lamp kit's arm runs along local +x; the old post aimed local +z
          // over the carriageway with yaw -atan2(tzn,txn) — shift by -pi/2
          const yawL = -Math.atan2(tzn, txn) - Math.PI / 2;
          addDestructible('lamp', lx, ly - 0.02, lz, yawL, 0.95 + frng() * 0.1);
          }
        }
      };
      // kerb-line battle litter: masonry chips + slate shards along frontages
      const placeStreetLitter = (): void => {
        for (let i = 0, placed = 0; i < 900 && placed < 150; i++) {
          const x = v.x0 + frng() * (v.x1 - v.x0);
          const z = v.z0 + frng() * (v.z1 - v.z0);
          const rd = heightField._roadDist(x, z);
          if (rd < 3.2 || rd > 7.5) continue; // hugs the kerb/pavement band
          if (noVeg(x, z)) continue;
          const y = heightField.getHeightAt(x, z);
          const cs = 0.14 + frng() * 0.34;
          const chip = box(cs, cs * (0.4 + frng() * 0.4), cs * (0.5 + frng() * 0.8), 1.6);
          jitterUV(chip, frng);
          chip.rotateY(frng() * Math.PI);
          chip.rotateX((frng() - 0.5) * 0.4);
          chip.translate(x, y + cs * 0.2, z);
          if (frng() < 0.72) buckets.stone.push(chip); else buckets.roof.push(chip);
          placed++;
        }
      };
      placeStreetLamps();
      placeStreetLitter();
    }
    placeStreetFurniture();
  }
  placeStreetRows();

  yield;
  // --- town block fill (urban): place remaining plan buildings on a coarse
  // grid BETWEEN the streets so blocks read built-up, not just road-fronted ---
  function placeTownBlockFill(): void {
    if (!P.blockFill || bi >= builders.length) return;
    const brng = mulberry32(seed + 404);
    const step = 27;
    const tryPlaceTownBuilding = (gx: number, gz: number): void => {
      if (bi >= builders.length) return;
      const px = gx + (brng() - 0.5) * 10, pz = gz + (brng() - 0.5) * 10;
      const roadDistance = heightField._roadDist(px, pz);
      if (roadDistance < 11 || roadDistance > 60 || noVeg(px, pz)) return;
      if (conflictsTacticalReservation(px, pz)) return;
      if (Math.hypot(px - junction.x, pz - junction.z) < 24) return;
      if (!isRoadBuildingSiteClear(px, pz)) return;
      const rot = (brng() < 0.5 ? 0 : Math.PI / 2) + (brng() - 0.5) * 0.06;
      placePlannedBuilding(px, pz, rot);
    };
    for (let gz = v.z0 + 14; gz < v.z1 - 14 && bi < builders.length; gz += step) {
      for (let gx = v.x0 + 14; gx < v.x1 - 14 && bi < builders.length; gx += step) {
        tryPlaceTownBuilding(gx, gz);
      }
    }
  }
  placeTownBlockFill();

  // Map-specific strongpoints. Random dressing is still valuable between
  // lanes, but critical cover cannot be left to a scatter pass: these beats
  // deliberately anchor the brawl, scout and support routes authored by each
  // expansion map. Structures and redoubts reuse destructible pools, so the
  // pass adds no new material or draw-call family.
  function placeTacticalBeats(): void {
    if (!P.tacticalBeats?.length) return;
    type TacticalBeat = NonNullable<typeof P.tacticalBeats>[number];
    const placeTacticalStructure = (beat: TacticalBeat, yaw: number): boolean => {
      if (!beat.structure) return false;
      const meta = DESTRUCTIBLE_BUILDING_TYPES[beat.structure];
      if (!meta) throw new Error(`world/props: unknown tactical structure ${beat.structure}`);
      const fit = groundFit(beat.x, beat.z, meta.hw * 2, meta.hl * 2, yaw);
      const rr = Math.hypot(meta.hw, meta.hl) * 0.72;
      const blocked = placedB.some((placed) =>
        Math.hypot(beat.x - placed.x, beat.z - placed.z) < placed.rr + rr + 1.5);
      const tooSteep = fit.spread > Math.max(P.maxSpread, beat.maxSpread ?? 3.8);
      if (tooSteep || noVeg(beat.x, beat.z) || blocked) return false;
      addDestructible(beat.structure, beat.x, fit.y + 0.04, beat.z, yaw);
      buildingFeatures.push({ x: beat.x, z: beat.z, w: meta.hw * 2, d: meta.hl * 2, rot: yaw });
      placedB.push({ x: beat.x, z: beat.z, rr });
      return true;
    };
    const placeTacticalRedoubt = (beat: TacticalBeat, yaw: number): void => {
      if (!beat.redoubt) return;
      const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
      const sideX = Math.cos(yaw), sideZ = -Math.sin(yaw);
      const offset = beat.redoubtOffset ?? 8.5;
      const cx = beat.x + fwdX * offset, cz = beat.z + fwdZ * offset;
      for (let sideIndex = -1; sideIndex <= 1; sideIndex++) {
        const sx = cx + sideX * sideIndex * 3.05, sz = cz + sideZ * sideIndex * 3.05;
        const sy = heightField.getHeightAt(sx, sz);
        const kind = sideIndex === 0 ? 'sandbagbig' : 'sandbagsmall';
        addDestructible(kind, sx, sy - 0.04, sz, yaw + sideIndex * 0.12, 1.18);
      }
      scatterDestructibles('ammobox', cx - fwdX * 2.2, cz - fwdZ * 2.2, 2, 0.8, 2.2, 0);
      scatterDestructibles('crate', cx - fwdX * 3.0, cz - fwdZ * 3.0, 1, 0.5, 1.5, 0);
    };
    for (const beat of P.tacticalBeats) {
      const yaw = THREE.MathUtils.degToRad(beat.yawDeg || 0);
      const structurePlaced = placeTacticalStructure(beat, yaw);
      placeTacticalRedoubt(beat, yaw);
      tacticalBeatFeatures.push({
        id: beat.id, role: beat.role, x: beat.x, z: beat.z,
        structurePlaced, redoubt: !!beat.redoubt,
      });
    }
  }
  placeTacticalBeats();

  // Light-building pass: huts, shelters, tents and camp infrastructure are
  // individually destructible, unlike the heavyweight merged landmarks.
  // A separate seeded stream keeps the established village layout stable.
  // Each type becomes one intact InstancedMesh plus an empty broken-state
  // pool, bounded to the handful of families authored by the active map.
  function placeDestructibleBuildings(): void {
    if (!P.destructibleBuildings?.length) return;
    const srng = mulberry32(seed + 17041);
    const lateral = P.destructibleBuildingLat || [9.5, 9.0];
    interface DestructibleBuildingSite { x: number; z: number; rot: number }
    const sampleDestructibleBuildingSite = (attempt: number): DestructibleBuildingSite | null => {
      if (attempt < 52 && candidates.length) {
        const cand = candidates[(srng() * candidates.length) | 0];
        const side = srng() < 0.5 ? -1 : 1;
        const lat = lateral[0] + srng() * lateral[1];
        return {
          x: cand.x - cand.tz * side * lat,
          z: cand.z + cand.tx * side * lat,
          rot: Math.atan2(cand.tx, cand.tz) + (srng() - 0.5) * 0.16,
        };
      }
      const x = v.x0 + 10 + srng() * Math.max(1, v.x1 - v.x0 - 20);
      const z = v.z0 + 10 + srng() * Math.max(1, v.z1 - v.z0 - 20);
      const rot = (srng() < 0.5 ? 0 : Math.PI / 2) + (srng() - 0.5) * 0.14;
      const roadDistance = heightField._roadDist(x, z);
      return roadDistance < 7.5 || roadDistance > 48 ? null : { x, z, rot };
    };
    const placeDestructibleBuilding = (kind: string): void => {
      const meta = DESTRUCTIBLE_BUILDING_TYPES[kind];
      if (!meta) return;
      const rr = Math.hypot(meta.hw, meta.hl) * 0.72;
      for (let attempt = 0; attempt < 80; attempt++) {
        const site = sampleDestructibleBuildingSite(attempt);
        if (!site) continue;
        const { x, z, rot } = site;
        const margin = Math.max(meta.hw, meta.hl) + 2;
        const outsideVillage = x < v.x0 + margin || x > v.x1 - margin
          || z < v.z0 + margin || z > v.z1 - margin;
        if (outsideVillage || Math.hypot(x - junction.x, z - junction.z) < 18 || noVeg(x, z)) continue;
        const fit = groundFit(x, z, meta.hw * 2, meta.hl * 2, rot);
        if (fit.spread > Math.max(P.maxSpread, 1.9)) continue;
        const blocked = placedB.some((placed) => Math.hypot(x - placed.x, z - placed.z) < placed.rr + rr + 2.0);
        if (blocked) continue;
        addDestructible(kind, x, fit.y + 0.04, z, rot);
        buildingFeatures.push({ x, z, w: meta.hw * 2, d: meta.hl * 2, rot });
        placedB.push({ x, z, rr });
        return;
      }
    };
    for (const kind of P.destructibleBuildings) {
      placeDestructibleBuilding(kind);
    }
  }
  placeDestructibleBuildings();

  // --- yard set-dressing (r2 terrain_environment): woodpiles, barrels and
  // short garden-fence runs around every free-standing building. The village
  // read as boxes dropped on pristine lawn — lived-in clutter grounds them.
  function placeYardClutter(): void {
    if (!(P.yardClutter ?? !P.streetRows)) return;
    const yrng = mulberry32(seed + 808);
    function yardSpot(pb: PlacedRadius, rMin: number, rMax: number): [number, number] | null {
      for (let t = 0; t < 8; t++) {
        const a = yrng() * Math.PI * 2, r = pb.rr + rMin + yrng() * (rMax - rMin);
        const x = pb.x + Math.cos(a) * r, z = pb.z + Math.sin(a) * r;
        if (heightField._roadDist(x, z) < 4.5 || noVeg(x, z)) continue;
        if (heightField.getNormalAt(x, z).y < 0.9) continue;
        let clear = true;
        for (const ob of placedB) {
          if (ob !== pb && Math.hypot(x - ob.x, z - ob.z) < ob.rr) { clear = false; break; }
        }
        if (clear) return [x, z];
      }
      return null;
    }
    // world-dressing r1: yard dressing is now the DESTRUCTIBLE inhabiting-
    // object layer — firewood stacks, barrels, troughs, churns, benches,
    // laundry lines and hand carts placed per the map's inhabit config, all
    // instanced + crushable (see the destructible layer above). The garden
    // fence keeps its role as a fence-kit run of breakable modules.
    const INH = P.inhabit || {};
    const yardFence = INH.yardFence || 'fencepicket';
    const placeYardFirewood = (building: PlacedRadius): void => {
      if (yrng() >= 0.6) return;
      const spot = yardSpot(building, 1.2, 3.4);
      if (!spot) return;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      addDestructible('firewood', spot[0], y - 0.03, spot[1], yrng() * Math.PI * 2, 0.9 + yrng() * 0.25);
    };
    const placeYardBarrels = (building: PlacedRadius): void => {
      if (yrng() >= 0.7) return;
      const spot = yardSpot(building, 0.8, 2.6);
      if (!spot) return;
      const count = 1 + ((yrng() * 2) | 0);
      for (let barrelIndex = 0; barrelIndex < count; barrelIndex++) {
        const x = spot[0] + (yrng() - 0.5) * 1.4, z = spot[1] + (yrng() - 0.5) * 1.4;
        const y = heightField.getHeightAt(x, z);
        addDestructible('barrel', x, y - 0.02, z, yrng() * Math.PI * 2, 0.9 + yrng() * 0.25);
      }
    };
    const placeYardTrough = (building: PlacedRadius): void => {
      if (!(INH.troughs ?? 1) || yrng() >= 0.35) return;
      const spot = yardSpot(building, 1.4, 3.2);
      if (!spot) return;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      addDestructible('trough', spot[0], y - 0.03, spot[1], yrng() * Math.PI * 2, 1);
    };
    const placeYardChurns = (building: PlacedRadius): void => {
      if (!(INH.churns ?? 0) || yrng() >= 0.4) return;
      const spot = yardSpot(building, 0.7, 2.0);
      if (!spot) return;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      addDestructible('churn', spot[0], y - 0.01, spot[1], yrng() * Math.PI, 1);
      if (yrng() < 0.6) {
        addDestructible('churn', spot[0] + 0.5,
          heightField.getHeightAt(spot[0] + 0.5, spot[1] + 0.2) - 0.01,
          spot[1] + 0.2, yrng() * Math.PI, 0.95);
      }
    };
    const placeYardLaundry = (building: PlacedRadius): void => {
      if (!(INH.laundry ?? 0) || yrng() >= 0.30) return;
      const spot = yardSpot(building, 2.4, 4.4);
      if (!spot) return;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      addDestructible('laundry', spot[0], y - 0.02, spot[1], yrng() * Math.PI * 2, 1);
    };
    const placeYardHandcart = (building: PlacedRadius): void => {
      if (!(INH.handcarts ?? 1) || yrng() >= 0.25) return;
      const spot = yardSpot(building, 1.6, 3.6);
      if (!spot) return;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      addDestructible('handcart', spot[0], y - 0.02, spot[1], yrng() * Math.PI * 2, 1);
    };
    const placeYardFence = (building: PlacedRadius): void => {
      if (yrng() >= 0.5) return;
      const spot = yardSpot(building, 2.6, 4.4);
      if (!spot) return;
      const yaw = yrng() * Math.PI * 2;
      const tx = Math.cos(yaw), tz = Math.sin(yaw);
      const len = 4.8 + yrng() * 4.8;
      placeFenceRun(yardFence, spot[0] - tx * len / 2, spot[1] - tz * len / 2,
        spot[0] + tx * len / 2, spot[1] + tz * len / 2, 0.2);
    };
    for (const building of placedB) {
      placeYardFirewood(building);
      placeYardBarrels(building);
      placeYardTrough(building);
      placeYardChurns(building);
      placeYardLaundry(building);
      placeYardHandcart(building);
      placeYardFence(building);
    }
  }
  placeYardClutter();

  yield;
  // --- low boundary walls (cover) ---
  // world-dressing r1 built these as a styled merged kit; DESTRUCTIBLES r1
  // rebuilds every run as WALL_SEG (3 m) DESTRUCTIBLE MODULES: a tank at
  // speed plows through (crushable obstacle, per-kind momentum scrub, never
  // a hard stop), shells + HE splash breach them LOCALLY (module-granular),
  // and each broken module leaves low crumbled rubble that persists for the
  // battle. Intact modules keep REAL cover value — a per-module collider
  // blocks shells/LOS until it dies with the module. Square END/CORNER POSTS
  // stay static dressing (they anchor breach lips visually), as does the
  // authored gapAt breach (crumbled courses + tumbled blocks).
  function addWallRun(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    gapAt = -1,
  ): void {
    const style = P.wallStyle || 'fieldstone';
    const wallB = style === 'adobe' ? 'plaster' : 'stone';
    // brick-style maps route to the stone module (urban's 'stone' texture IS
    // the brick print); adobe keeps its own thicker mud module
    const wallKind = style === 'adobe' ? 'walladobe' : 'wallstone';
    const along = Math.hypot(x1 - x0, z1 - z0);
    const nSeg6 = Math.max(1, Math.round(along / 6)); // legacy gapAt frame
    const nMod = Math.max(1, Math.round(along / WALL_SEG));
    const tx = (x1 - x0) / along, tz = (z1 - z0) / along;
    const yaw = Math.atan2(tx, tz); // module runs along local +z
    const thick = style === 'adobe' ? 0.52 : 0.46;
    const runH = 1.0 + rng() * 0.15; // family height scale
    let prevBuilt = false;
    function endPost(px: number, pz: number): void {
      const py = heightField.getHeightAt(px, pz) - 0.15;
      const ph = runH * 1.05 + 0.3;
      const post = box(thick + 0.22, ph, thick + 0.22, 0.7);
      jitterUV(post, rng);
      buckets[wallB].push(post.translate(px, py + ph / 2, pz));
      buckets[wallB].push(box(thick + 0.34, 0.12, thick + 0.34, 0.8)
        .translate(px, py + ph + 0.05, pz)); // cap slab
    }
    function addBrokenBreach(t0: number, t1: number): void {
      for (const breachT of [0.18, 0.82]) {
        const x = x0 + tx * (t0 + breachT * (t1 - t0));
        const z = z0 + tz * (t0 + breachT * (t1 - t0));
        const y = heightField.getHeightAt(x, z) - 0.15;
        const height = 0.30 + rng() * 0.25;
        const stub = box(thick, height, WALL_SEG * 0.4, 0.7);
        jitterUV(stub, rng);
        stub.rotateY(yaw);
        buckets[wallB].push(stub.translate(x, y + height / 2, z));
      }
      for (let blockIndex = 0; blockIndex < 5; blockIndex++) {
        const breachT = 0.2 + rng() * 0.6;
        const x = x0 + tx * (t0 + breachT * (t1 - t0)) + (rng() - 0.5) * 1.6;
        const z = z0 + tz * (t0 + breachT * (t1 - t0)) + (rng() - 0.5) * 1.6;
        const size = 0.16 + rng() * 0.22;
        const block = roughenChunk(
          box(size * 1.5, size * 0.8, size, 1.2), rng, size * 0.4,
        );
        jitterUV(block, rng);
        block.rotateY(rng() * Math.PI);
        block.translate(x, heightField.getHeightAt(x, z) + size * 0.3, z);
        buckets[wallB].push(block);
      }
    }
    function isGapModule(center: number): boolean {
      return gapAt >= 0
        && center >= gapAt * (along / nSeg6)
        && center < (gapAt + 1) * (along / nSeg6);
    }
    function beginsGap(moduleIndex: number, center: number): boolean {
      return moduleIndex === 0 || gapAt < 0
        || (center - WALL_SEG) < gapAt * (along / nSeg6);
    }
    for (let k = 0; k < nMod; k++) {
      const t0 = k * WALL_SEG, t1 = Math.min((k + 1) * WALL_SEG, along);
      const tc = (t0 + t1) / 2;
      const cx = x0 + tx * tc, cz = z0 + tz * tc;
      // legacy gapAt (authored in the old ~6 m segmentation): modules whose
      // center falls in that span render the static breach instead
      const inGap = isGapModule(tc);
      const skip = heightField._roadDist(cx, cz) < 5.5 || noVeg(cx, cz)
        || Math.max(Math.abs(cx), Math.abs(cz)) > 478;
      if (inGap || skip) {
        if (!skip && inGap && beginsGap(k, tc)) addBrokenBreach(t0, t1);
        if (prevBuilt) endPost(x0 + tx * t0, z0 + tz * t0); // post at the lip
        prevBuilt = false;
        continue;
      }
      if (!prevBuilt) endPost(x0 + tx * t0, z0 + tz * t0); // run (re)start
      const ya = heightField.getHeightAt(x0 + tx * t0, z0 + tz * t0);
      const yb = heightField.getHeightAt(x0 + tx * t1, z0 + tz * t1);
      const cy = Math.min(ya, yb);
      const tiltX = Math.atan2(yb - ya, t1 - t0) * 0.85;
      addDestructible(wallKind, cx, cy - 0.13, cz, yaw,
        runH * (0.94 + rng() * 0.12), tiltX, (rng() - 0.5) * 0.02);
      prevBuilt = true;
    }
    if (prevBuilt) endPost(x1, z1); // closing post
  }
  const wallRuns: WallRun[] = P.wallRuns || [
    [v.x0 + 4, 8, v.x0 + 4, 64, 2],
    [v.x0 + 4, 8, v.x0 + 40, 8, 3],
    [v.x1 - 6, 30, v.x1 - 6, 96, 4],
    [-8, v.z1 - 10, 52, v.z1 - 10, 2],
    [38, v.z0 + 6, 74, v.z0 + 6, 1],
    [-44, 108, -10, 108, 0],
    // midfield field-boundary walls: hull-down/cover lines in the open ground
    [-186, -62, -118, -62, 3],
    [-118, -62, -118, -14, 1],
    [148, -196, 148, -132, 2],
    [-64, 218, 8, 218, 4],
    [196, 108, 258, 108, 2],
    [-266, 66, -212, 66, 1],
    [96, -320, 158, -320, 3],
  ];
  function placeBoundaryWalls(): void {
    for (const wallRun of wallRuns) {
      addWallRun(wallRun[0], wallRun[1], wallRun[2], wallRun[3], wallRun[4] ?? -1);
    }
  }
  placeBoundaryWalls();

  // --- village well near the junction ---
  function placeVillageWell(): void {
    if (!P.well) return;
    let wx = junction.x + 9, wz = junction.z + 7;
    for (let i = 0; i < 20 && heightField._roadDist(wx, wz) < 6.5; i++) { wx += 2; wz += 1; }
    const wy = heightField.getHeightAt(wx, wz);
    const ring = new THREE.CylinderGeometry(1.0, 1.1, 0.9, 10, 1);
    scaleUV(ring, 3, 0.5);
    ring.translate(wx, wy + 0.45, wz);
    buckets.stone.push(ring);
    for (const s of [-1, 1]) {
      const post = box(0.14, 1.9, 0.14);
      post.translate(wx + s * 0.85, wy + 0.95, wz);
      buckets.wood.push(post);
    }
    const wroof = gablePrism(2.4, 0.7, 1.4);
    wroof.rotateY(Math.PI / 2);
    wroof.translate(wx, wy + 1.9, wz);
    buckets.roof.push(wroof);
    obstacles.push(setCircleShape(
      { min: [wx - 1.1, wy, wz - 1.1], max: [wx + 1.1, wy + 2.6, wz + 1.1] }, wx, wz, 1.1));
    colliders.push(setCircleShape(
      { min: [wx - 1.1, wy, wz - 1.1], max: [wx + 1.1, wy + 2.6, wz + 1.1] }, wx, wz, 1.1));
  }
  placeVillageWell();

  // --- INHABITING OBJECTS (world-dressing r1): themed destructible dressing
  // per map config zones — market ring on the plaza, working clutter through
  // the village core, hay bales/stooks on the open farmland, oil drums +
  // pallets on industrial aprons, souk pottery/rugs, winter sleds. Density
  // knobs live in cfg.props.inhabit; everything placed here is instanced and
  // destructible (drive-through/knock-over/breakable per class). ---
  function placeInhabitingObjects(): void {
    const inh = P.inhabit || {};
    const overlapsBuilding = (
      x: number,
      z: number,
      padding: number,
      except: PlacedRadius | null = null,
    ): boolean => placedB.some((building) => building !== except
      && Math.hypot(x - building.x, z - building.z) < building.rr + padding);
    // market: stall ring + goods clutter around the junction plaza
    const placeMarketStalls = (): void => {
      const nStalls = inh.stalls ?? 0;
      if (nStalls <= 0) return;
      const placeMarketGoods = (x: number, z: number): void => {
        if (drng() < 0.8) scatterDestructibles('crate', x, z, 1, 1.6, 2.6);
        if (drng() < 0.6) scatterDestructibles('barrel', x, z, 1 + ((drng() * 2) | 0), 1.4, 2.8);
        if (drng() < 0.5) {
          scatterDestructibles((inh.pots ?? 0) > 0 ? 'pot' : 'pallet', x, z, 1, 1.5, 2.5);
        }
      };
      let placedSt = 0;
      for (let t = 0; t < nStalls * 14 && placedSt < nStalls; t++) {
        const a = drng() * Math.PI * 2, r = 9 + drng() * 9;
        const x = junction.x + Math.cos(a) * r, z = junction.z + Math.sin(a) * r;
        if (heightField._roadDist(x, z) < 4.2 || noVeg(x, z)) continue;
        if (heightField.getNormalAt(x, z).y < 0.92) continue;
        if (overlapsBuilding(x, z, 0.5)) continue;
        const y = heightField.getHeightAt(x, z);
        // stall faces the plaza center
        addDestructible('stall', x, y - 0.03, z, Math.atan2(junction.x - x, junction.z - z), 0.95 + drng() * 0.15);
        placeMarketGoods(x, z);
        placedSt++;
      }
      // benches around the square
      scatterDestructibles('bench', junction.x, junction.z, inh.benches ?? 2, 7, 15, 4.0);
    };
    // village-core work clutter: crates/barrels/pallets between the houses
    const placeCoreClutter = (): void => {
      const coreClutter = inh.coreClutter ?? 0;
      if (coreClutter <= 0) return;
      for (let k = 0; k < coreClutter; k++) {
        const x = v.x0 + drng() * (v.x1 - v.x0);
        const z = v.z0 + drng() * (v.z1 - v.z0);
        if (heightField._roadDist(x, z) < 4.0 || noVeg(x, z)) continue;
        if (heightField.getNormalAt(x, z).y < 0.90) continue;
        if (overlapsBuilding(x, z, 0.3)) continue;
        const y = heightField.getHeightAt(x, z);
        const roll = drng();
        const kind = roll < 0.4 ? 'crate' : roll < 0.7 ? 'barrel' : roll < 0.85 ? 'pallet' : 'handcart';
        addDestructible(kind, x, y - 0.03, z, drng() * Math.PI * 2, 0.9 + drng() * 0.25);
      }
    };
    // Open-farmland hay: round bales + harvest stooks scattered on worked land.
    const placeFieldObjects = (): void => {
      const fieldContext: FieldScatterContext = {
        rng: drng,
        village: v,
        heightField,
        noVegetation: noVeg,
        spawns: [L.spawns.player, ...L.spawns.enemies],
        addDestructible,
      };
      const baleCount = inh.bales ?? 0;
      const stookCount = inh.stooks ?? 0;
      const sledCount = inh.sleds ?? 0;
      if (baleCount > 0) scatterFieldProps(fieldContext, 'bale', baleCount);
      if (stookCount > 0) scatterFieldProps(fieldContext, 'stook', stookCount);
      if (sledCount > 0) scatterFieldProps(fieldContext, 'sled', sledCount);
    };
    // industrial dressing: oil drums + pallet spots along streets/aprons
    const placeIndustrialDrums = (): void => {
      const drumCount = inh.drums ?? 0;
      if (drumCount <= 0) return;
      for (let t = 0, placed = 0; t < drumCount * 16 && placed < drumCount; t++) {
        const x = v.x0 + drng() * (v.x1 - v.x0);
        const z = v.z0 + drng() * (v.z1 - v.z0);
        const rd = heightField._roadDist(x, z);
        if (rd < 3.4 || rd > 14 || noVeg(x, z)) continue;
        if (overlapsBuilding(x, z, 0.3)) continue;
        const y = heightField.getHeightAt(x, z);
        addDestructible('drum', x, y - 0.02, z, drng() * Math.PI * 2, 0.95 + drng() * 0.12);
        if (drng() < 0.5) scatterDestructibles('pallet', x, z, 1 + ((drng() * 2) | 0), 1.0, 2.4);
        if (drng() < 0.35) scatterDestructibles('crate', x, z, 1, 1.2, 2.2);
        placed++;
      }
    };
    // souk dressing: pottery clusters + rug display frames near buildings
    const placeSoukObjects = (): void => {
      const potCount = inh.pots ?? 0;
      if (potCount <= 0) return;
      for (let t = 0, placed = 0; t < potCount * 16 && placed < potCount; t++) {
        const pb = placedB.length ? placedB[(drng() * placedB.length) | 0] : null;
        if (!pb) break;
        const a = drng() * Math.PI * 2, r = pb.rr + 0.8 + drng() * 2.6;
        const x = pb.x + Math.cos(a) * r, z = pb.z + Math.sin(a) * r;
        if (heightField._roadDist(x, z) < 3.6 || noVeg(x, z)) continue;
        if (overlapsBuilding(x, z, 0, pb)) continue;
        const y = heightField.getHeightAt(x, z);
        addDestructible(drng() < 0.7 ? 'pot' : 'rugframe', x, y - 0.02, z, drng() * Math.PI * 2, 0.9 + drng() * 0.25);
        placed++;
      }
    };
    placeMarketStalls();
    placeCoreClutter();
    placeFieldObjects();
    placeIndustrialDrums();
    placeSoukObjects();
  }
  placeInhabitingObjects();

  // --- DESTRUCTIBLES r1: soft-vehicle + military-clutter dressing ----------
  yield;
  // Supply trucks and utility 4x4s parked on roadside pull-offs and yards
  // (destructible to burnt hulks), fuel-drum clusters with the rare RED
  // explosive drum, ammo-box stacks, and campsite/supply-dump story clusters
  // (tents + firewood + crates + drums) in the off-road clearings where
  // battles funnel. Everything rides the instanced destructible layer.
  function placeMilitaryClutter(): void {
    const inh = P.inhabit || {};
    const vrng = mulberry32(seed + 12007);
    const roadsideContext: RoadsideSpotContext = {
      rng: vrng, roads, heightField, noVegetation: noVeg,
      spawns: L.spawns, placedBuildings: placedB,
    };
    // Heavy roadside vehicles: map-flavored cargo, box-body, and flatbed
    // families. The selector is seeded and bounded to three pools per lane.
    const placeHeavyRoadTraffic = (): void => {
    for (let k = 0, cap = inh.trucks ?? 0; k < cap; k++) {
      const spot = findRoadsideSpot(roadsideContext, 5.6, 9.5);
      if (!spot) continue;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      const kind = pickCivilianVehicleKind(mapId, 'heavy', vrng());
      addDestructible(kind, spot[0], y - 0.04, spot[1],
        spot[2] + (vrng() < 0.25 ? (vrng() - 0.5) * 1.6 : (vrng() - 0.5) * 0.3),
        0.96 + vrng() * 0.10);
      // truck stops spill cargo: crates/ammo beside the tailgate
      if (vrng() < 0.6) scatterDestructibles('crate', spot[0], spot[1], 1, 2.6, 4.2);
      if (vrng() < 0.45) scatterDestructibles('ammobox', spot[0], spot[1], 1, 2.4, 4.0);
    }
    };
    placeHeavyRoadTraffic();
    // Light traffic: distinct sedans, wagons, pickups, vans, and utility 4x4s
    // replace the repeated single jeep while keeping the authored count.
    const placeLightRoadTraffic = (): void => {
    for (let k = 0, cap = inh.jeeps ?? 0; k < cap; k++) {
      const spot = findRoadsideSpot(roadsideContext, 4.8, 7.5);
      if (!spot) continue;
      const y = heightField.getHeightAt(spot[0], spot[1]);
      const kind = pickCivilianVehicleKind(mapId, 'light', vrng());
      addDestructible(kind, spot[0], y - 0.03, spot[1],
        spot[2] + (vrng() - 0.5) * 0.9, 0.95 + vrng() * 0.1);
    }
    };
    placeLightRoadTraffic();
    // fuel-drum clusters (2-4 drums; ~12% carry one RED explosive drum)
    const placeFuelDrumClusters = (): void => {
    for (let k = 0, cap = inh.drumClusters ?? 0; k < cap; k++) {
      const spot = findRoadsideSpot(roadsideContext, 5.0, 12);
      if (!spot) continue;
      const n = 2 + ((vrng() * 3) | 0);
      let redDone = false;
      for (let d = 0; d < n; d++) {
        const a = vrng() * Math.PI * 2, r = vrng() * 1.4;
        const x = spot[0] + Math.cos(a) * r, z = spot[1] + Math.sin(a) * r;
        const y = heightField.getHeightAt(x, z);
        const red = !redDone && vrng() < 0.12;
        if (red) redDone = true;
        addDestructible(red ? 'drumred' : 'drum', x, y - 0.02, z, vrng() * Math.PI * 2, 0.95 + vrng() * 0.1);
      }
      if (vrng() < 0.4) scatterDestructibles('pallet', spot[0], spot[1], 1, 1.6, 3.0);
    }
    };
    placeFuelDrumClusters();
    // Persistent loose dressing: the galvanized churn was the original
    // visually "bouncy gray can". Expand that interaction language into
    // bins, bottles, pails, jerry cans and detached wheels, with a deliberate
    // map-flavored mix. These are sleeping instanced bodies: the count adds
    // scene detail but no per-frame physics until a hull or shell wakes one.
    const industrialLoose = ['trashcan', 'gasbottle', 'jerrycan', 'loosewheel', 'bucket', 'drum'];
    const ruralLoose = ['churn', 'bucket', 'jerrycan', 'loosewheel', 'gasbottle', 'trashcan'];
    const dryLoose = ['jerrycan', 'gasbottle', 'bucket', 'loosewheel', 'trashcan', 'cone'];
    const isIndustrial = mapId === 'urban' || mapId === 'railyard' || mapId === 'foundry' || mapId === 'caldera';
    const isDry = mapId === 'desert' || mapId === 'badlands' || mapId === 'frontier';
    const looseKinds = isIndustrial ? industrialLoose : isDry ? dryLoose : ruralLoose;
    const looseCap = inh.looseClutter ?? (P.streetRows ? 20 : P.plan.length >= 14 ? 18 : 14);
    const placeLooseRoadsideClutter = (): void => {
    for (let k = 0; k < looseCap; k++) {
      const spot = findRoadsideSpot(
        roadsideContext, isIndustrial ? 4.6 : 5.2, isIndustrial ? 12 : 15, 52,
      );
      if (!spot) continue;
      const members = vrng() < 0.42 ? 2 : 1;
      for (let j = 0; j < members; j++) {
        const a = vrng() * Math.PI * 2;
        const rr = j ? 0.65 + vrng() * 0.75 : 0;
        const x = spot[0] + Math.cos(a) * rr, z = spot[1] + Math.sin(a) * rr;
        if (noVeg(x, z)) continue;
        const kind = looseKinds[(vrng() * looseKinds.length) | 0];
        addDestructible(kind, x, heightField.getHeightAt(x, z) - 0.015, z,
          vrng() * Math.PI * 2, 0.88 + vrng() * 0.18);
      }
    }
    };
    placeLooseRoadsideClutter();
    // campsites / supply dumps: tents, firewood, crates, drums — the "life"
    // clusters at village outskirts and along the approach woods
    const placeSupplyCamps = (): void => {
    const placeSecondCampTent = (cx: number, cz: number, yaw: number): void => {
      if (vrng() >= 0.7) return;
      const angle = yaw + Math.PI * (0.6 + vrng() * 0.5);
      const x = cx + Math.cos(angle) * (4 + vrng() * 2);
      const z = cz + Math.sin(angle) * (4 + vrng() * 2);
      if (heightField._roadDist(x, z) <= 4.5 || noVeg(x, z)) return;
      addDestructible('tent', x, heightField.getHeightAt(x, z) - 0.03, z,
        angle + Math.PI + (vrng() - 0.5) * 0.5, 0.9 + vrng() * 0.15);
    };
    const placeCampFireRing = (cx: number, cz: number): void => {
      const stoneCount = 5 + ((vrng() * 3) | 0);
      const y = heightField.getHeightAt(cx + 2.6, cz + 1.4);
      for (let stoneIndex = 0; stoneIndex < stoneCount; stoneIndex++) {
        const angle = (stoneIndex / stoneCount) * Math.PI * 2;
        const stone = box(0.22 + vrng() * 0.1, 0.18, 0.2, 1.4);
        jitterUV(stone, vrng);
        stone.rotateY(vrng() * Math.PI);
        stone.translate(cx + 2.6 + Math.cos(angle) * 0.55,
          y + 0.08, cz + 1.4 + Math.sin(angle) * 0.55);
        buckets.stone.push(stone);
      }
    };
    const placeCampCargo = (cx: number, cz: number): void => {
      scatterDestructibles('firewood', cx, cz, 1, 2.2, 4.5);
      scatterDestructibles('crate', cx, cz, 1 + ((vrng() * 2) | 0), 2.4, 5.5);
      scatterDestructibles('ammobox', cx, cz, 1 + ((vrng() * 2) | 0), 2.0, 5.0);
      if (vrng() < 0.5) {
        scatterDestructibles('drum', cx, cz, 1 + ((vrng() * 2) | 0), 3.0, 6.0);
      }
    };
    const placeParkedCampVehicle = (cx: number, cz: number): void => {
      if (vrng() >= 0.35) return;
      const angle = vrng() * Math.PI * 2;
      const x = cx + Math.cos(angle) * (6.5 + vrng() * 2);
      const z = cz + Math.sin(angle) * (6.5 + vrng() * 2);
      const supported = heightField._roadDist(x, z) > 4.6
        && !noVeg(x, z) && heightField.getNormalAt(x, z).y > 0.9;
      if (!supported) return;
      const lane = vrng() < 0.5 ? 'light' : 'heavy';
      addDestructible(pickCivilianVehicleKind(mapId, lane, vrng()), x,
        heightField.getHeightAt(x, z) - 0.04, z, vrng() * Math.PI * 2, 0.95);
    };
    for (let k = 0, cap = inh.camps ?? 0; k < cap; k++) {
      const spot = findRoadsideSpot(roadsideContext, 10, 26, 60);
      if (!spot) continue;
      const [cx, cz] = spot;
      const yawC = vrng() * Math.PI * 2;
      const y0 = heightField.getHeightAt(cx, cz);
      addDestructible('tent', cx, y0 - 0.03, cz, yawC, 0.95 + vrng() * 0.15);
      placeSecondCampTent(cx, cz, yawC);
      placeCampFireRing(cx, cz);
      placeCampCargo(cx, cz);
      placeParkedCampVehicle(cx, cz);
    }
    };
    placeSupplyCamps();
    // Modern roadside and industrial vocabulary: concrete vehicle barriers,
    // signs, cones, transformer cabinets and cable reels. Every piece uses an
    // existing instanced destructible pool, so a count of 40 still costs five
    // draw calls rather than forty and remains idle until actually hit.
    const modernCfg = inh.modernClutter ?? 0;
    const authoredModernKinds = typeof modernCfg === 'object' && modernCfg
      ? Object.entries(modernCfg).flatMap(([kind, count]) =>
        Array.from({ length: Math.max(0, count | 0) }, () => kind))
      : null;
    // Authored legacy-map backports guarantee every vocabulary family while
    // retaining seeded variety in where those families land. Numeric budgets
    // keep the original weighted selection path byte-for-byte unchanged.
    const shuffleAuthoredModernKinds = (): void => {
      if (!authoredModernKinds) return;
      for (let i = authoredModernKinds.length - 1; i > 0; i--) {
        const j = (vrng() * (i + 1)) | 0;
        [authoredModernKinds[i], authoredModernKinds[j]] =
          [authoredModernKinds[j], authoredModernKinds[i]];
      }
    };
    shuffleAuthoredModernKinds();
    const modernCap = authoredModernKinds
      ? authoredModernKinds.length : typeof modernCfg === 'number' ? modernCfg : 0;
    const selectModernKind = (index: number): string => {
      if (authoredModernKinds) return authoredModernKinds[index];
      const roll = vrng();
      if (roll < 0.25) return 'barrier';
      if (roll < 0.45) return 'roadsign';
      if (roll < 0.70) return 'cone';
      return roll < 0.84 ? 'transformer' : 'cablespool';
    };
    const extendModernArrangement = (
      kind: string,
      x: number,
      z: number,
      yaw: number,
    ): void => {
      if (kind === 'barrier' && vrng() < 0.6) {
        const lx = Math.cos(yaw), lz = -Math.sin(yaw);
        const partners = 1 + ((vrng() * 2) | 0);
        for (let index = 1; index <= partners; index++) {
          const bx = x + lx * 2.75 * index, bz = z + lz * 2.75 * index;
          if (noVeg(bx, bz)) continue;
          addDestructible('barrier', bx, heightField.getHeightAt(bx, bz) - 0.03,
            bz, yaw + (vrng() - 0.5) * 0.12, 0.92 + vrng() * 0.12);
        }
      } else if (kind === 'cone') {
        scatterDestructibles('cone', x, z, 1 + ((vrng() * 3) | 0), 0.7, 2.5);
      }
    };
    const placeModernRoadsideClutter = (): void => {
    for (let k = 0; k < modernCap; k++) {
      const spot = findRoadsideSpot(roadsideContext, 5.0, 13.5, 52);
      if (!spot) continue;
      const [mx, mz, myaw] = spot;
      const kind = selectModernKind(k);
      const y = heightField.getHeightAt(mx, mz);
      addDestructible(kind, mx, y - 0.03, mz,
        myaw + (vrng() - 0.5) * (kind === 'barrier' ? 0.18 : 0.7),
        0.9 + vrng() * 0.18);
      // Checkpoint barriers and work-zone cones read as arrangements rather
      // than isolated props. Partners keep the same seeded placement path.
      extendModernArrangement(kind, mx, mz, myaw);
    }
    };
    placeModernRoadsideClutter();
  }
  placeMilitaryClutter();

  // --- hay bales + crates near buildings (world-dressing r1: instanced
  // DESTRUCTIBLES — a hull crushes them, shells burst them, hay puffs) ---
  function placeHayAndCrates(): void {
    for (let i = 0; P.hayCrates && i < Math.min(5, placedB.length); i++) {
      const pb = placedB[i];
      const n = 1 + ((rng() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const a = rng() * Math.PI * 2, r = pb.rr + 2 + rng() * 4;
        const x = pb.x + Math.cos(a) * r, z = pb.z + Math.sin(a) * r;
        if (heightField._roadDist(x, z) < 4.5) continue;
        const y = heightField.getHeightAt(x, z);
        addDestructible(rng() < 0.5 ? 'bale' : 'crate', x, y - 0.03, z,
          rng() * Math.PI, 0.9 + rng() * 0.3);
      }
    }
  }
  placeHayAndCrates();

  // --- wooden fence runs + telegraph poles along the roads ---
  // world-dressing r1: road fences are now DESTRUCTIBLE fence-kit modules
  // (per-map type, drive-through-able like saplings, shell-breakable) with
  // the odd open gate where field entrances meet the road.
  const utilityPolePlacements: UtilityPolePlacementReceipt[] = [];
  function placeRoadsideUtilities(): UtilityNetwork | null {
    const roadsL = L.roads;
    const roadFence = (P.inhabit && P.inhabit.roadFence) || 'fenceplank';
    function fenceRun(
      nodes: Array<readonly [number, number]>,
      i0: number,
      i1: number,
      side: number,
    ): void {
      for (let i = i0; i < i1 && i < nodes.length - 1; i++) {
        const [ax, az] = nodes[i], [bx, bz] = nodes[i + 1];
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz);
        const tx = dx / len, tz = dz / len;
        const ox = -tz * side * 7.6, oz = tx * side * 7.6;
        placeFenceRun(roadFence, ax + ox, az + oz, bx + ox, bz + oz, 0.30);
      }
    }
    function placeRoadFenceLines(): void {
      if (!P.fences || roadsL.length < 2) return;
      fenceRun(roadsL[0], 11, 14, -1); // village approach, west side
      fenceRun(roadsL[0], 20, 23, 1);  // north exit, east side
      fenceRun(roadsL[1], 9, 12, -1);  // west field edge
      fenceRun(roadsL[1], 20, 23, 1);  // east field edge
    }
    placeRoadFenceLines();
    // telegraph poles marching along road A — tapered round poles with twin
    // cross-arms and a brace, planted dead vertical
    // r7 terrain_environment: whiteCap remaps the model's 0.90-white insulator
    // caps to dark glazed glass-green — they rendered as blown "daytime
    // streetlamp" blobs on every pole (player_view critique)
    // The source model is a whole two-station segment: two posts roughly
    // 9.5 source metres apart plus conductor faces between them. Use its
    // near-post slice as the physical primitive, then let terrain policy and
    // the live utility network decide whether a station has one or two posts.
    const poleGeo = SOURCED.poles && P.telegraph
      ? bakedGeometry('telephone_pole_polygoogle',
        {
          targetH: 7.4, sink: 0.15, sourceZMin: -1,
          whiteCap: [0.14, 0.21, 0.16],
        }) : null;
    // r4 terrain_environment: record pole stations — catenary WIRES are strung
    // between consecutive poles below (the bare pole line was a critique item:
    // "telephone poles have no visible wires, they read as bare sticks")
    const poleLine: Array<{
      x: number;
      y: number;
      z: number;
      yaw: number;
      sourced: boolean;
      attachH: number;
      instanceIndex?: number;
    }> = [];
    type UtilityPoleStation = ReturnType<typeof planUtilityPoleStation>;
    type UtilityPolePost = UtilityPoleStation['primary'];
    const addUtilityPole = (post: UtilityPolePost, station: UtilityPoleStation): void => {
      const networkIndex = poleLine.length;
      const poleRec: (typeof poleLine)[number] = {
        x: post.x, y: post.y, z: post.z, yaw: station.yaw,
        sourced: !!SOURCED.poles, attachH: SOURCED.poles ? 6.5 : 5.75,
      };
      poleLine.push(poleRec);
      if (SOURCED.poles) {
        addBakedInstance('pole', poleGeo!, post.x, post.y, post.z, station.yaw, 1);
        poleRec.instanceIndex = bakedInstances.get('pole')!.list.length - 1;
        crushables.push({
          x: post.x, y: post.y, z: post.z, r: 0.45, h: 7.4,
          index: poleRec.instanceIndex, wirePoleIndex: networkIndex, toppled: false,
        });
        return;
      }
      const pole = new THREE.CylinderGeometry(0.09, 0.17, 6.2, 7, 1);
      scaleUV(pole, 0.8, 3.0);
      pole.translate(post.x, post.y + 3.0, post.z);
      buckets.wood.push(pole);
      for (const armY of [5.75, 5.15]) {
        const arm = box(1.5, 0.11, 0.09, 1.0);
        arm.rotateY(station.yaw);
        arm.translate(post.x, post.y + armY, post.z);
        buckets.wood.push(arm);
        for (const side of [-1, 1]) {
          const peg = box(0.07, 0.16, 0.07, 2.0);
          peg.rotateY(station.yaw);
          peg.translate(post.x + Math.cos(station.yaw) * 0.6 * side,
            post.y + armY + 0.13, post.z - Math.sin(station.yaw) * 0.6 * side);
          buckets.wood.push(peg);
        }
      }
      const brace = box(0.06, 1.1, 0.06, 1.5);
      brace.rotateZ(0.6);
      brace.rotateY(station.yaw);
      brace.translate(post.x + Math.cos(station.yaw) * 0.26,
        post.y + 4.8, post.z - Math.sin(station.yaw) * 0.26);
      buckets.wood.push(brace);
    };
    // r5 terrain_environment: poles every node (~32 m, was every 2nd). The
    // 64 m spans cut CHORDS across the road's curves — one span slashed
    // diagonally through the default chase-cam frame as a hard black line
    // (critique). Short spans follow the carriageway; the wires read as
    // roadside infrastructure instead of a graphical artifact.
    function placeUtilityPoles(): void {
    for (let i = 8; P.telegraph && i < roadsL[0].length - 1; i += 1) {
      const [ax, az] = roadsL[0][i], [bx, bz] = roadsL[0][i + 1];
      const tl = Math.hypot(bx - ax, bz - az);
      const tx = (bx - ax) / tl, tz = (bz - az) / tl;
      const px = ax - tz * 6.9, pz = az + tx * 6.9;
      if (Math.max(Math.abs(px), Math.abs(pz)) > 470 || noVeg(px, pz)) continue;
      const partnerX = px + tx * 6.5, partnerZ = pz + tz * 6.5;
      const allowPair = Math.max(Math.abs(partnerX), Math.abs(partnerZ)) <= 470
        && !noVeg(partnerX, partnerZ);
      const station = planUtilityPoleStation(heightField, px, pz, tx, tz, { allowPair });
      const physicalPoles = station.partner
        ? [station.primary, station.partner] : [station.primary];
      utilityPolePlacements.push({
        station: i,
        paired: station.paired,
        pairRelief: station.pairRelief,
        yaw: station.yaw,
        poles: physicalPoles.map((post) => ({
          x: post.x, y: post.y, z: post.z,
          supportMin: post.support.min,
          supportMax: post.support.max,
          supportSpread: post.support.spread,
        })),
      });
      for (const post of physicalPoles) {
        addUtilityPole(post, station);
      }
    }
    }
    placeUtilityPoles();
    // Catenary topology. Geometry is instantiated after material finalization;
    // keeping the spans out of the static dark bucket lets adjacent wires be
    // pulled down by a toppled pole without unmerging the rest of the world.
    function collectWireSpans(): Array<readonly [number, number]> {
      const wireSpans: Array<readonly [number, number]> = [];
      for (let pi = 0; pi + 1 < poleLine.length; pi++) {
        const A = poleLine[pi], B = poleLine[pi + 1];
        const spanL = Math.hypot(B.x - A.x, B.z - A.z);
        if (spanL > 52 || spanL < 6) continue; // a skipped pole leaves the span unstrung
        wireSpans.push([pi, pi + 1]);
      }
      return wireSpans;
    }
    const wireSpans = collectWireSpans();
    const network = wireSpans.length ? createUtilityNetwork(poleLine, wireSpans) : null;
    // DESTRUCTIBLES r1: telegraph-pole DEBRIS — every pole line lost a few
    // to the shelling: a snapped stump, the felled pole across the verge
    // with its crossarm splayed, a coil of downed wire. Static dressing
    // (no collision) that sells the fought-over road.
    function placeFelledUtilityPoles(): void {
      if (!P.telegraph || poleLine.length <= 3) return;
      const prng2 = mulberry32(seed + 4407);
      const nDebris = Math.min(3, (poleLine.length / 5) | 0);
      for (let d = 0; d < nDebris; d++) {
        const pl = poleLine[(prng2() * poleLine.length) | 0];
        const ox = pl.x + (prng2() - 0.5) * 4, oz = pl.z + (prng2() - 0.5) * 4;
        if (Math.max(Math.abs(ox), Math.abs(oz)) > 460 || noVeg(ox, oz)) continue;
        if (heightField._roadDist(ox, oz) < 4.2) continue;
        const stumpSupport = sampleDiscGround(heightField, ox, oz, 0.17, 0.03);
        const oy = stumpSupport.y;
        const yawD = prng2() * Math.PI * 2;
        // snapped stump
        const stump = new THREE.CylinderGeometry(0.13, 0.17, 0.9 + prng2() * 0.6, 7, 1);
        scaleUV(stump, 0.8, 1.0);
        stump.rotateZ((prng2() - 0.5) * 0.24);
        stump.translate(ox, oy + 0.45, oz);
        buckets.wood.push(stump);
        // Felled poles are long enough to span a verge shoulder. Align the
        // rigid body to terrain at both ends instead of floating its far end
        // from the stump's one center sample.
        const fallLength = 5.6 + prng2() * 1.2;
        const dirX = Math.sin(yawD), dirZ = Math.cos(yawD);
        const fallX = ox + dirX * (fallLength * 0.5 + 0.4);
        const fallZ = oz + dirZ * (fallLength * 0.5 + 0.4);
        const fallPose = planGroundedSegment(
          heightField, fallX, fallZ, dirX, dirZ, fallLength, 0.13, 0.02,
        );
        const fall = new THREE.CylinderGeometry(0.09, 0.15, fallLength, 7, 1);
        scaleUV(fall, 0.8, 3.0);
        _quat.setFromUnitVectors(_upAxis,
          _posv.set(fallPose.axisX, fallPose.axisY, fallPose.axisZ));
        fall.applyQuaternion(_quat);
        fall.translate(fallPose.x, fallPose.y, fallPose.z);
        buckets.wood.push(fall);
        decorationGroundingReceipts.push({
          kind: 'felled-utility-pole', x: fallPose.x, y: fallPose.y, z: fallPose.z,
          relief: fallPose.relief, baseClearance: -0.02,
          start: fallPose.start, end: fallPose.end,
        });
        const arm = box(1.4, 0.10, 0.09, 1.0); // crossarm knocked loose
        arm.rotateY(yawD + 0.5 + prng2());
        arm.translate(fallPose.end.x, fallPose.end.support.min + 0.05, fallPose.end.z);
        buckets.wood.push(arm);
      }
    }
    placeFelledUtilityPoles();
    return network;
  }
  utilityNetwork = placeRoadsideUtilities();

  // --- rocks (instanced, 3 displaced-icosahedron variants) ---
  // r3 terrain_environment: REBUILT. The old detail-1 icospheres with one
  // low-frequency displacement octave kept their geodesic facet pattern and
  // flat (unwelded) normals — a raw white faceted primitive sat in the
  // winter establishing foreground. Now: welded vertices (smooth normals),
  // higher subdivision, THREE displacement octaves for real lumpy boulder
  // silhouettes, and a slope/height-keyed albedo blend (pale weathered top
  // vs darker base) so the tops read snow/lichen-capped per map tone.
  const rockGeos: THREE.BufferGeometry[] = [];
  const rockHulls: number[][] = [];
  // r7 terrain_environment: RIDGED FRACTURE displacement + crease shading —
  // the r3 boulders still read as "smooth grey blobs with no fracture
  // planes" (critique). A ridged octave (1-|noise|) carves crease valleys
  // into the surface; crease proximity darkens the albedo (fracture shadow
  // lines) and the same field keys a partial normal HARDENING (lerp toward
  // the local radial facet direction) so crease shoulders shade as broken
  // faces instead of one continuous smooth ball.
  function buildRockVariants(): void {
  for (let vi = 0; vi < 3; vi++) {
    const g = mergeVertices(new THREE.IcosahedronGeometry(1, vi === 2 ? 3 : 2));
    const p = g.attributes.position;
    const vr = mulberry32(seed + 30 + vi);
    const tmpv = new THREE.Vector3();
    const creaseA = new Float32Array(p.count); // 1 at crease line, 0 elsewhere
    for (let i = 0; i < p.count; i++) {
      tmpv.set(p.getX(i), p.getY(i), p.getZ(i));
      const ridge = 1 - Math.abs(noi.noise3d(
        tmpv.x * 2.2 + vi * 31, tmpv.y * 2.2 - 7, tmpv.z * 2.2 + 13));
      const crease = Math.pow(ridge, 5); // sharp valley lines
      creaseA[i] = crease;
      const f = 1
        + noi.noise3d(tmpv.x * 1.4 + vi * 9, tmpv.y * 1.4, tmpv.z * 1.4) * 0.30
        + noi.noise3d(tmpv.x * 3.1 - vi * 17, tmpv.y * 3.1 + 40, tmpv.z * 3.1) * 0.13
        + noi.noise3d(tmpv.x * 6.8 + 91, tmpv.y * 6.8 - vi * 5, tmpv.z * 6.8) * 0.05
        - crease * 0.115; // carved fracture valleys
      tmpv.multiplyScalar(f);
      tmpv.y = Math.max(tmpv.y, -0.55);
      p.setXYZ(i, tmpv.x, tmpv.y * 0.82, tmpv.z);
    }
    g.computeVertexNormals();
    const nrm = g.attributes.normal;
    // partial facet hardening: pull normals toward the radial direction on
    // crease shoulders — the smooth-welded shading breaks into planes there
    const nv = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const cw = creaseA[i] * 0.55;
      if (cw < 0.03) continue;
      nv.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      tmpv.set(p.getX(i), p.getY(i) * 0.6, p.getZ(i)).normalize();
      nv.lerp(tmpv, cw).normalize();
      nrm.setXYZ(i, nv.x, nv.y, nv.z);
    }
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      // darker, mossier boulders — the old light-gray tone flashed white at
      // distance under the sun/env light and read as pixel errors
      const upW = clamp(nrm.getY(i), 0, 1);
      const l = 0.26 + vr() * 0.08 + p.getY(i) * 0.04 + upW * upW * 0.10;
      let rh = 0.09 + vr() * 0.02, rs = 0.07, rl = clamp(l, 0.15, 0.48);
      if (P.rockTone) { const t = P.rockTone(rh, rs, rl); rh = t[0]; rs = t[1]; rl = clamp(t[2], 0, 1); }
      // upward faces take the map cap tone harder (snow/dust), sides darker;
      // crease valleys darken like fracture shadow lines
      _col.setHSL(rh, rs,
        clamp(rl * (0.86 + upW * 0.22) * (1 - creaseA[i] * 0.34), 0, 1), THREE.SRGBColorSpace);
      col[i * 3] = _col.r; col[i * 3 + 1] = _col.g; col[i * 3 + 2] = _col.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    rockGeos.push(g);
    const projected: Array<[number, number]> = [];
    for (let i = 0; i < p.count; i++) projected.push([p.getX(i), p.getZ(i)]);
    rockHulls.push(convexHull2(projected));
  }
  }
  buildRockVariants();
  const rockPlacements: THREE.Matrix4[][] = [[], [], []];
  function tryRock(
    x: number,
    z: number,
    scMin: number,
    scMax: number,
    slopePref: boolean,
    sink = 0.22,
  ): boolean {
    const vv = (rng() * 3) | 0;
    const yawR = rng() * Math.PI * 2;
    const sc = scMin + Math.pow(rng(), 1.6) * (scMax - scMin);
    if (Math.max(Math.abs(x), Math.abs(z)) > 485) return false;
    if (x > v.x0 - 8 && x < v.x1 + 8 && z > v.z0 - 8 && z < v.z1 + 8) return false;
    if (heightField._roadDist(x, z) < 6) return false;
    if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) return false;
    for (const s of [L.spawns.player, ...L.spawns.enemies]) {
      if (Math.hypot(x - s.x, z - s.z) < 16) return false;
    }
    if (slopePref) {
      const steep = heightField.getNormalAt(x, z).y < 0.93;
      if (!steep && rng() > 0.30) return false; // prefer rocky slopes
    }
    const y = heightField.getHeightAt(x, z) - sink * sc;
    _quat.setFromAxisAngle(_upAxis, yawR);
    _mat4.compose(_posv.set(x, y, z), _quat,
      _scalev.set(sc, sc * (0.8 + rng() * 0.35), sc));
    rockPlacements[vv].push(_mat4.clone());
    // sink <= 0.5: half-drifted surface rocks keep their cover role; only the
    // deep-embedded ground-clutter class (0.60) is drive-over
    if (sc >= 1.25 && sink <= 0.5) {
      // The old square ±1.15*scale AABB made its four empty corners solid;
      // at a 3 m outcrop that stopped a hull more than a metre from the
      // visible stone. Use the displaced mesh's actual projected convex hull.
      const c = Math.cos(yawR), s = Math.sin(yawR);
      const local = rockHulls[vv];
      const points = new Array(local.length);
      for (let i = 0; i < local.length; i += 2) {
        const lx = local[i] * sc, lz = local[i + 1] * sc;
        points[i] = x + lx * c + lz * s;
        points[i + 1] = z - lx * s + lz * c;
      }
      const rec = setConvexShape(
        { min: [x, y, z], max: [x, y + sc * 1.1, z] }, points);
      obstacles.push(rec);
      colliders.push(cloneCollisionRecord(rec));
    }
    return true;
  }
  // Hard cover belonging to the authored tactical beats is added before the
  // general scatter. It lands in the same three rock instances and therefore
  // costs geometry instances, not draw calls. A broken crescent leaves two
  // peek routes instead of forming an impassable wall.
  function placeTacticalOutcrops(): void {
  for (const beat of P.tacticalBeats || []) {
    if (!beat.outcrop) continue;
    const count = beat.outcrop.count ?? 5;
    const radius = beat.outcrop.radius ?? 9;
    const yaw = THREE.MathUtils.degToRad(beat.yawDeg || 0);
    for (let i = 0; i < count; i++) {
      const arc = count === 1 ? 0 : (i / (count - 1) - 0.5) * Math.PI * 0.92;
      const a = yaw + Math.PI + arc;
      const rr = radius * (0.72 + 0.28 * Math.abs(Math.sin(i * 2.17 + seed)));
      tryRock(beat.x + Math.cos(a) * rr, beat.z + Math.sin(a) * rr,
        beat.outcrop.scaleMin ?? 1.55, beat.outcrop.scaleMax ?? 3.1, false, 0.24);
    }
  }
  }
  placeTacticalOutcrops();
  // r3: per-map surface-rock sink (winter buries boulders deeper so they
  // read as drift-covered rock shoulders, not loose balls ON the snow)
  const surfSink = P.rockSink ?? 0.22;
  function scatterSurfaceRocks(): void {
    for (let i = 0, placed = 0; i < P.rocks * 9 && placed < P.rocks; i++) {
      if (tryRock((rng() * 2 - 1) * 485, (rng() * 2 - 1) * 485, 0.9, 2.8, true, surfSink)) placed++;
    }
  }
  scatterSurfaceRocks();
  // r3 terrain_environment: embedded half-buried boulders — sunk to ~60% so
  // the ground reads like it HOLDS rock instead of hosting loose balls; no
  // colliders (drive-over ground clutter), pairs with the new heightfield
  // micro-relief for a believable near-field ground
  function scatterEmbeddedRocks(): void {
    for (let i = 0, placed = 0; i < P.rocks * 5 && placed < Math.round(P.rocks * 0.7); i++) {
      if (tryRock((rng() * 2 - 1) * 470, (rng() * 2 - 1) * 470, 0.55, 1.5, false, 0.60)) placed++;
    }
  }
  scatterEmbeddedRocks();
  // boulder outcrop clusters: chunky hull-down cover groups in the open field
  function scatterBoulderOutcrops(): void {
  for (let c = 0, made = 0; c < P.outcrops * 8 && made < P.outcrops; c++) {
    const cx = (rng() * 2 - 1) * 420, cz = (rng() * 2 - 1) * 420;
    if (heightField._roadDist(cx, cz) < 12) continue;
    const n = 3 + (rng() * 3) | 0;
    let got = 0;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, rr = 1.5 + rng() * 6;
      if (tryRock(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, 1.3, 3.2, false)) got++;
    }
    if (got > 0) made++;
  }
  }
  scatterBoulderOutcrops();
  function instantiateRockVariants(): void {
  for (let vi = 0; vi < 3; vi++) {
    if (rockPlacements[vi].length === 0) continue;
    const im = new THREE.InstancedMesh(rockGeos[vi], mats.rock, rockPlacements[vi].length);
    for (let i = 0; i < rockPlacements[vi].length; i++) im.setMatrixAt(i, rockPlacements[vi][i]);
    im.castShadow = true;
    im.receiveShadow = true;
    im.matrixAutoUpdate = false;
    im.computeBoundingSphere();
    group.add(im);
  }
  }
  instantiateRockVariants();

  // --- field haystacks: classic WoT soft-cover silhouettes in the open ---
  const stackSpots: Array<{ x: number; z: number; r: number }> = []; // r6: fed to the grounding-decal pass below
  function placeFieldHaystacks(): void {
  for (let i = 0, placed = 0; i < P.haystacks * 22 && placed < P.haystacks; i++) {
    const x = (rng() * 2 - 1) * 430, z = (rng() * 2 - 1) * 430;
    if (x > v.x0 - 10 && x < v.x1 + 10 && z > v.z0 - 10 && z < v.z1 + 10) continue;
    if (heightField._roadDist(x, z) < 9) continue;
    if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) continue;
    if (heightField.getNormalAt(x, z).y < 0.92) continue;
    let nearSpawn = false;
    for (const s of [L.spawns.player, ...L.spawns.enemies]) {
      if (Math.hypot(x - s.x, z - s.z) < 18) { nearSpawn = true; break; }
    }
    if (nearSpawn) continue;
    const y = heightField.getHeightAt(x, z);
    // world-dressing r1: haystacks are DESTRUCTIBLE instances now — a hull
    // plows through (crushable obstacle, WoT hay behavior) and shells pass
    // through cosmetically instead of being EATEN (the old collider made a
    // hay pile stop AP rounds; colliders are gone for hay).
    const sc = 0.85 + rng() * 0.4;
    addDestructible('haystack', x, y - 0.10, z, rng() * Math.PI * 2, sc);
    stackSpots.push({ x, z, r: 1.9 * sc * 1.5 });
    placed++;
  }
  }
  placeFieldHaystacks();

  // --- field clutter: fallen logs + stumps (visual ground detail) ---
  function placeFieldLogsAndStumps(): void {
  for (let i = 0, placed = 0; P.logs && i < 260 && placed < 26; i++) {
    const x = (rng() * 2 - 1) * 460, z = (rng() * 2 - 1) * 460;
    if (x > v.x0 - 6 && x < v.x1 + 6 && z > v.z0 - 6 && z < v.z1 + 6) continue;
    if (heightField._roadDist(x, z) < 7) continue;
    if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) continue;
    if (rng() < 0.6) { // log
      const r = 0.16 + rng() * 0.13, len = 2.2 + rng() * 1.9;
      const yaw = rng() * Math.PI * 2;
      const pose = planGroundedSegment(
        heightField, x, z, Math.cos(yaw), -Math.sin(yaw), len, r * 0.85, r * 0.1,
      );
      const log = new THREE.CylinderGeometry(r * 0.85, r, len, 7, 1);
      scaleUV(log, 1.0, len * 0.5);
      _quat.setFromUnitVectors(_upAxis, _posv.set(pose.axisX, pose.axisY, pose.axisZ));
      log.applyQuaternion(_quat);
      log.translate(pose.x, pose.y, pose.z);
      buckets.wood.push(log);
      decorationGroundingReceipts.push({
        kind: 'fallen-log', x: pose.x, y: pose.y, z: pose.z,
        relief: pose.relief, baseClearance: -r * 0.1,
        start: pose.start, end: pose.end,
      });
    } else { // stump
      const r = 0.22 + rng() * 0.15, h = 0.35 + rng() * 0.3;
      const support = sampleDiscGround(heightField, x, z, r, 0.06);
      const st = new THREE.CylinderGeometry(r * 0.92, r * 1.15, h, 8, 1);
      scaleUV(st, 1.5, 0.5);
      st.rotateY(rng() * Math.PI);
      st.translate(x, support.y + h / 2, z);
      buckets.wood.push(st);
      decorationGroundingReceipts.push({
        kind: 'stump', x, y: support.y, z, relief: support.spread, baseClearance: -0.06,
        supportMin: support.min, supportMax: support.max,
      });
    }
    placed++;
  }
  }
  placeFieldLogsAndStumps();

  // --- standing crop fields (r6 terrain_environment) ------------------------
  yield;
  // The open farmland carried no crops at all ("summer fields have no crops"
  // critique) — WoT maps stage their fields with standing grain. Each plot is
  // a fan of parallel crop-card rows (terrain-conformed vertical strips, one
  // merged alpha-tested mesh) plus the field's own haystack-ready clearing.
  // ~350 tris/plot — establishing-shot scale dressing at negligible cost.
  function placeCropFields(): void {
    if ((P.cropFields ?? 0) <= 0) return;
    const crng = mulberry32(seed + 515);
    const cropTex = createCropTexture(crng);
    const cropGeos: THREE.BufferGeometry[] = [];
    for (let p = 0, made = 0; p < P.cropFields * 30 && made < P.cropFields; p++) {
      if (tryPlaceCropPlot(crng, cropGeos)) made++;
    }
    finalizeCropFields(cropTex, cropGeos);
  }

  function createCropTexture(crng: () => number): THREE.CanvasTexture {
    const cs = 256;
    const cc = document.createElement('canvas');
    cc.width = cc.height = cs;
    const cctx = canvas2d(cc, { willReadFrequently: true });
    cctx.clearRect(0, 0, cs, cs);
    for (let b = 0; b < 260; b++) { // wheat stalks with seed heads
      const x = crng() * cs;
      const hgt = cs * (0.50 + crng() * 0.42);
      const lean = (crng() - 0.5) * 16;
      const lum = 0.30 + crng() * 0.20;
      _col.setHSL(0.115 + crng() * 0.02, 0.34, lum);
      cctx.strokeStyle = _col.getStyle();
      cctx.lineWidth = 1.2 + crng() * 1.1;
      cctx.beginPath();
      cctx.moveTo(x, cs + 2);
      cctx.quadraticCurveTo(x + lean * 0.4, cs - hgt * 0.6, x + lean, cs - hgt);
      cctx.stroke();
      _col.setHSL(0.105 + crng() * 0.02, 0.38, Math.min(0.62, lum + 0.12));
      cctx.fillStyle = _col.getStyle();
      cctx.beginPath();
      cctx.ellipse(x + lean, cs - hgt, 1.7 + crng(), 4.5 + crng() * 2.5, lean * 0.03, 0, Math.PI * 2);
      cctx.fill();
    }
    const cid = cctx.getImageData(0, 0, cs, cs);
    for (let i = 0; i < cs * cs; i++) { // mean-tone flood so mips don't halo
      if (cid.data[i * 4 + 3] < 24) {
        cid.data[i * 4] = 150; cid.data[i * 4 + 1] = 122; cid.data[i * 4 + 2] = 62;
      }
    }
    cctx.putImageData(cid, 0, 0);
    const cropTex = new THREE.CanvasTexture(cc);
    cropTex.colorSpace = THREE.SRGBColorSpace;
    cropTex.wrapS = THREE.RepeatWrapping;
    cropTex.anisotropy = aniso;
    return cropTex;
  }

  function cropPlotAvoidsSpawns(cx: number, cz: number, radius: number): boolean {
    return ![L.spawns.player, ...L.spawns.enemies].some((spawn) =>
      Math.hypot(cx - spawn.x, cz - spawn.z) < radius + 24);
  }

  function cropPlotCornersAreLevel(
    cx: number, cz: number, pw: number, pd: number,
    dx: number, dz: number, px2: number, pz2: number,
  ): boolean {
    const y0 = heightField.getHeightAt(cx, cz);
    for (const [ex, ez] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const qx = cx + dx * ex * pw * 0.5 + px2 * ez * pd * 0.5;
      const qz = cz + dz * ex * pw * 0.5 + pz2 * ez * pd * 0.5;
      if (Math.abs(heightField.getHeightAt(qx, qz) - y0) > 3.2) return false;
    }
    return true;
  }

  function appendCropRowGeometry(
    cropGeos: THREE.BufferGeometry[], crng: () => number,
    rx: number, rz: number, half: number, rowH: number, tintL: number,
    dx: number, dz: number,
  ): void {
    const nSt = Math.max(3, Math.ceil((half * 2) / 3.4));
    const pos: number[] = [], uv: number[] = [], idx: number[] = [], col: number[] = [];
    for (let sIt = 0; sIt <= nSt; sIt++) {
      const t = sIt / nSt;
      const sx2 = rx + dx * (t * 2 - 1) * half;
      const sz2 = rz + dz * (t * 2 - 1) * half;
      const gy = heightField.getHeightAt(sx2, sz2);
      const hh = rowH * (0.86 + crng() * 0.28);
      pos.push(sx2, gy + 0.02, sz2, sx2, gy + hh, sz2);
      uv.push(t * half * 0.8, 0, t * half * 0.8, 1);
      const cshade = tintL * (0.9 + crng() * 0.2);
      col.push(cshade, cshade, cshade, cshade, cshade, cshade);
      if (sIt > 0) {
        const b0 = (sIt - 1) * 2, b1 = sIt * 2;
        idx.push(b0, b1, b0 + 1, b0 + 1, b1, b1 + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    geometry.setIndex(idx);
    cropGeos.push(geometry);
  }

  function appendCropRows(
    cropGeos: THREE.BufferGeometry[], crng: () => number,
    cx: number, cz: number, pw: number, pd: number,
    dx: number, dz: number, px2: number, pz2: number,
  ): void {
    const rowPitch = 2.5 + crng() * 0.5;
    const nRows = Math.floor(pd / rowPitch);
    const rowH = 1.05 + crng() * 0.2;
    const tintL = 0.9 + crng() * 0.25;
    for (let row = 0; row < nRows; row++) {
      const offset = (row - (nRows - 1) / 2) * rowPitch;
      const rx = cx + px2 * offset, rz = cz + pz2 * offset;
      const half = pw * (0.44 + crng() * 0.08);
      appendCropRowGeometry(cropGeos, crng, rx, rz, half, rowH, tintL, dx, dz);
    }
  }

  function tryPlaceCropPlot(
    crng: () => number,
    cropGeos: THREE.BufferGeometry[],
  ): boolean {
    const cx = (crng() * 2 - 1) * 380, cz = (crng() * 2 - 1) * 380;
    const pw = 34 + crng() * 26, pd = 26 + crng() * 22;
    const radius = Math.hypot(pw, pd) * 0.5;
    const overlapsVillage = cx > v.x0 - radius - 14 && cx < v.x1 + radius + 14
      && cz > v.z0 - radius - 14 && cz < v.z1 + radius + 14;
    if (overlapsVillage || heightField._roadDist(cx, cz) < radius + 9) return false;
    if (heightField.getGroundType(cx, cz) === 'soft' || noVeg(cx, cz)) return false;
    let supported = heightField.getNormalAt(cx, cz).y > 0.965;
    if (!cropPlotAvoidsSpawns(cx, cz, radius)) supported = false;

    // Keep this seeded draw before the support decision: rejected flatness
    // candidates historically consume their row angle too.
    const dirA = crng() * Math.PI;
    const dx = Math.cos(dirA), dz = Math.sin(dirA);
    const px2 = -dz, pz2 = dx;
    if (supported && !cropPlotCornersAreLevel(cx, cz, pw, pd, dx, dz, px2, pz2)) {
      supported = false;
    }
    if (!supported) return false;
    appendCropRows(cropGeos, crng, cx, cz, pw, pd, dx, dz, px2, pz2);
    return true;
  }

  function finalizeCropFields(
    cropTex: THREE.CanvasTexture,
    cropGeos: THREE.BufferGeometry[],
  ): void {
    if (cropGeos.length === 0) return;
    const cropMat = new THREE.MeshStandardMaterial({
      map: cropTex, alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide,
      vertexColors: true, roughness: 1.0, metalness: 0.0,
    });
    cropMat.envMapIntensity = 0.5;
    engineCtx.setupShadowMaterial(cropMat);
    const merged = mergeGeometries(cropGeos, false);
    // Explicit up normals avoid alpha-strip lighting and missing-normal crashes.
    const nPos = merged.attributes.position.count;
    const nUp = new Float32Array(nPos * 3);
    for (let i = 0; i < nPos; i++) nUp[i * 3 + 1] = 1;
    merged.setAttribute('normal', new THREE.BufferAttribute(nUp, 3));
    const cropMesh = new THREE.Mesh(merged, cropMat);
    cropMesh.name = 'crop-fields';
    cropMesh.castShadow = false;
    cropMesh.receiveShadow = false;
    cropMesh.matrixAutoUpdate = false;
    cropMesh.userData.aoExclude = true;
    group.add(cropMesh);
  }
  placeCropFields();

  // --- street lampposts (r6 terrain_environment, town maps) -----------------
  yield;
  // Cast-iron posts marching along the paved grid — the missing street
  // furniture scale cue ("urban streets missing furniture" critique).
  function placeTownLampposts(): void {
    if (!P.lampposts) return;
    const lrng = mulberry32(seed + 611);
    let lampCount = 0;
    const placeLampAtRoadNode = (roadIndex: number, nodeIndex: number): boolean => {
      const nodes = L.roads[roadIndex];
      const [ax, az] = nodes[nodeIndex], [bx, bz] = nodes[nodeIndex + 1];
      const tl = Math.hypot(bx - ax, bz - az) || 1;
      const side = ((nodeIndex >> 1) % 2) ? 1 : -1;
      const lx = ax - ((bz - az) / tl) * 6.3 * side;
      const lz = az + ((bx - ax) / tl) * 6.3 * side;
      const outsideTown = lx < v.x0 - 12 || lx > v.x1 + 12
        || lz < v.z0 - 12 || lz > v.z1 + 12;
      if (outsideTown || heightField._roadDist(lx, lz) < 4.6) return false;
      const blocked = placedB.some((building) =>
        Math.hypot(lx - building.x, lz - building.z) < building.rr + 1.2);
      if (blocked) return false;
      const y = heightField.getHeightAt(lx, lz);
      const armAngle = Math.atan2(ax - lx, az - lz);
      addDestructible('lamp', lx, y - 0.02, lz,
        armAngle - Math.PI / 2, 0.95 + lrng() * 0.12);
      return true;
    };
    for (let ri = 0; ri < L.roads.length && lampCount < 44; ri++) {
      const nodes = L.roads[ri];
      for (let i = 2; i < nodes.length - 1 && lampCount < 44; i += 2) {
        if (placeLampAtRoadNode(ri, i)) lampCount++;
      }
    }
  }
  placeTownLampposts();

  // --- anti-tank hedgehogs (r6 terrain_environment) --------------------------
  // Steel-beam obstacles on the streets/approaches — the classic shelled-town
  // debris silhouette WoT urban maps scatter at intersections.
  function placeHedgehogs(): void {
    if ((P.hedgehogs ?? 0) <= 0) return;
    const hrng = mulberry32(seed + 613);
    const placeHedgehog = (hedgehogId: number): boolean => {
      const inTown = hrng() < 0.7;
      const hx = inTown ? v.x0 + hrng() * (v.x1 - v.x0) : (hrng() * 2 - 1) * 320;
      const hz = inTown ? v.z0 + hrng() * (v.z1 - v.z0) : (hrng() * 2 - 1) * 320;
      const roadDistance = heightField._roadDist(hx, hz);
      if (roadDistance > 8.5 || (roadDistance < 2.2 && hrng() < 0.5)) return false;
      const blocked = placedB.some((building) =>
        Math.hypot(hx - building.x, hz - building.z) < building.rr + 1.5);
      if (blocked || noVeg(hx, hz)) return false;
      const nearSpawn = [L.spawns.player, ...L.spawns.enemies]
        .some((spawn) => Math.hypot(hx - spawn.x, hz - spawn.z) < 20);
      if (nearSpawn) return false;
      const yaw = hrng() * Math.PI * 2;
      const scale = 0.85 + hrng() * 0.35;
      const y = sampleDiscGround(heightField, hx, hz, 1.08 * scale, 0.035).y;
      const yawOffsets = [
        (hrng() - 0.5) * 0.3,
        (hrng() - 0.5) * 0.3,
        (hrng() - 0.5) * 0.3,
      ];
      const beams = hedgehogBeamSpecs(hx, y, hz, yaw, scale, yawOffsets);
      for (const beamSpec of beams) {
        const beam = box(0.16 * scale, 0.16 * scale, 2.1 * scale, 1.2);
        beam.rotateX(beamSpec.tilt);
        beam.rotateY(beamSpec.yaw);
        beam.translate(hx, y + 0.62 * scale, hz);
        buckets.dark.push(beam);
        const record: PropsCollisionRecord = {
          min: [hx, beamSpec.minY, hz], max: [hx, beamSpec.maxY, hz],
          kind: 'hedgehog', hedgehogId,
        };
        setObbShape(record, hx, hz, beamSpec.halfWidth + 0.025,
          beamSpec.halfLength + 0.025, beamSpec.yaw);
        obstacles.push(record);
        colliders.push(cloneCollisionRecord(record));
      }
      return true;
    };
    for (let i = 0, placed = 0; i < P.hedgehogs * 20 && placed < P.hedgehogs; i++) {
      if (placeHedgehog(placed)) placed++;
    }
  }
  placeHedgehogs();

  // --- carts along the roads (world-dressing r1: DESTRUCTIBLE hay carts +
  // hand carts — a moving hull smashes them to debris, shells burst them;
  // no collider so they never eat a shell) ---
  function placeRoadCarts(): void {
    const cartCap = (P.inhabit && P.inhabit.carts) ?? 2;
    let carts = 0;
    for (let i = 4; P.carts && L.roads.length >= 2 && i < L.roads[1].length - 1 && carts < cartCap; i += 5) {
      const [ax, az] = L.roads[1][i];
      const cxp = ax + 8.5, czp = az + 6.5;
      if (Math.max(Math.abs(cxp), Math.abs(czp)) > 440) continue;
      if (heightField._roadDist(cxp, czp) < 6) continue;
      if (heightField.getGroundType(cxp, czp) === 'soft' || noVeg(cxp, czp)) continue;
      const y = heightField.getHeightAt(cxp, czp);
      addDestructible(carts % 2 ? 'handcart' : 'haycart', cxp, y - 0.04, czp,
        rng() * Math.PI * 2, 0.95 + rng() * 0.12);
      carts++;
    }
  }
  placeRoadCarts();

  // --- sandbag emplacements: defensive clusters along the main road + plaza ---
  // DESTRUCTIBLES r1: sandbags no longer wall a hull OR eat shells — every
  // emplacement is a destructible record (crushKeep ~0.97: you barely feel
  // them) that bursts into spilled bags. The three sourced silhouettes ride
  // the LOCAL_TYPES pools; a tank at speed just drives over the position.
  function placeSandbagEmplacements(): void {
    if (!SOURCED.sandbags) return;
    const srng = mulberry32(seed + 401);
    const sbKind = (pick: number): string => (
      pick < 0.45 ? 'sandbagbig' : pick < 0.8 ? 'sandbagsmall' : 'sandbagwall'
    );
    let placedS = 0;
    const sandbagCap = P.sandbagLines ?? 9;
    const roadA = L.roads[0];
    const placeSandbagAtRoadNode = (nodeIndex: number): boolean => {
      const [ax, az] = roadA[nodeIndex], [bx, bz] = roadA[nodeIndex + 1];
      if (Math.abs(az) > 330) return false;
      const tl = Math.hypot(bx - ax, bz - az);
      const side = (nodeIndex % 2) ? 1 : -1;
      const sx = ax - ((bz - az) / tl) * 8.6 * side, sz = az + ((bx - ax) / tl) * 8.6 * side;
      if (Math.max(Math.abs(sx), Math.abs(sz)) > 460) return false;
      if (heightField._roadDist(sx, sz) < 5.5) return false;
      if (heightField.getGroundType(sx, sz) === 'soft' || noVeg(sx, sz)) return false;
      if (heightField.getNormalAt(sx, sz).y < 0.9) return false;
      const blocked = placedB.some((building) =>
        Math.hypot(sx - building.x, sz - building.z) < building.rr + 4);
      if (blocked) return false;
      const y = heightField.getHeightAt(sx, sz);
      const yaw = Math.atan2(bx - ax, bz - az) + (srng() - 0.5) * 0.3;
      addDestructible(sbKind(srng()), sx, y - 0.04, sz, yaw, 1.25 + srng() * 0.3);
      if (srng() < 0.55) scatterDestructibles('ammobox', sx, sz, 1, 1.8, 3.2);
      if (srng() < 0.3) scatterDestructibles('crate', sx, sz, 1, 1.8, 3.0);
      return true;
    };
    for (let i = 6; i < roadA.length - 2 && placedS < sandbagCap; i += 3) {
      if (placeSandbagAtRoadNode(i)) placedS++;
    }
    // plaza corner nest by the well
    {
      const nx = junction.x - 11, nz = junction.z - 8;
      const y = heightField.getHeightAt(nx, nz);
      addDestructible('sandbagbig', nx, y - 0.04, nz, Math.PI * 0.7, 1.4);
      addDestructible('sandbagsmall', nx + 3.4,
        heightField.getHeightAt(nx + 3.4, nz + 1.6) - 0.04, nz + 1.6, Math.PI * 0.25, 1.3);
      scatterDestructibles('ammobox', nx + 1.5, nz + 1, 2, 1.2, 2.6);
    }
  }
  placeSandbagEmplacements();

  // --- knocked-out TANK WRECKS: real roster vehicles, baked static ----------
  yield;
  // DESTRUCTIBLES r1 replaces the r7 generic box hulks with the game's own
  // tank models: era-appropriate roster vehicles built through tankFactory,
  // posed by the factory's settled-wreck machinery (turret tossed or unseated,
  // gun drooped), charred/rust-painted and BAKED into ONE static merged mesh
  // per map (src/world/wrecks.ts — no live tank cost, no articulation).
  // They are pure DRESSING: solid obstacles + shell colliders, never in
  // game.tanks, invisible to spotting and the minimap. Placement stays the
  // storytelling read: roadside kills along the advance routes, plus paired
  // "duel" beats where two hulks face each other off the same verge.
  const wreckScorch: Array<[number, number]> = [];
  const tankWreckSpots: TankWreckSpot[] = []; // probe/debug: {specId,x,z,yaw,hx,hz,h} per hulk
  function* placeTankWrecks(): Generator<PropsBuildSlice, void, void> {
    const wCfg = P.tankWrecks || null;
    const requestedWrecks = wCfg ? (wCfg.count ?? 3) : (P.wrecks ?? 0);
    // Loading-speed r1: the third mobile hulk was one independent 284 ms
    // hidden-prefetch atom. Two keep the paired roadside story beat on a
    // small screen while removing two transient live-tank factories; desktop
    // content stays unchanged. A second similarly sized roster atom was
    // exposed after this one disappeared and is scheduled separately.
    const wreckCount = getDeviceTier() === 'mobile'
      ? Math.min(requestedWrecks, 2) : requestedWrecks;
    if (wreckCount > 0) {
      const wrng = mulberry32(seed + 909);
      const era = (wCfg && wCfg.era) || 'ww2';
      const pool = (wCfg && wCfg.ids) || wreckPool(era);
      const bakeCache = new Map<string, WreckBake | null>(); // specId|pop -> bake result
      const wreckGeos: THREE.BufferGeometry[] = [];
      const wreckShadowGeos: THREE.BufferGeometry[] = []; // factory shadow proxies, wreck-posed
      let bakedTris = 0;
      let wreckSerial = 0;
      let wreckPickSerial = 0;
      function bakeFor(specId: string, pop: boolean): WreckBake | null {
        const key = specId + (pop ? '|p' : '');
        if (bakeCache.has(key)) return bakeCache.get(key) ?? null;
        const baked = bakeTankWreck(engineCtx, specId, {
          seed: seed + bakeCache.size * 131, pop,
        });
        bakeCache.set(key, baked);
        return baked;
      }
      function* placeWreck(
        x: number,
        z: number,
        yaw: number,
      ): Generator<PropsBuildSlice, boolean, void> {
        // Explicit map pools are deliberate story casts: consume them in
        // order so the complete modern wreck vocabulary is guaranteed across
        // the legacy-map set. Unauthored pools retain seeded random variety.
        const specId = wCfg?.ids?.length
          ? pool[wreckPickSerial++ % pool.length]
          : pool[(wrng() * pool.length) | 0];
        const pop = wrng() < 0.45; // mix ammo-rack tosses with unseated kills
        // The async world builder resolves only the selected wreck's authored
        // family before this synchronous bake resumes. No full-fleet barrier,
        // speculative preload, or legacy fallback is involved.
        yield { fine: true, tankBuilder: specId };
        const baked = bakeFor(specId, pop);
        if (!baked) return false;
        const support = planGroundedObbPose(
          heightField, x, z, baked.hx, baked.hz, yaw, 0.14,
        );
        // A rigid hulk cannot conform to a cliff lip or deep ditch. Reject
        // those candidates and let the seeded road pass find a supported
        // site instead of either floating a track or burying half the tank.
        if (support.maxEmbed > (wCfg?.maxGroundEmbed ?? 1.1)) return false;
        bakedTris += baked.tris; // budget counts PLACED tris (clones render too)
        const y = support.y;
        _quat.setFromUnitVectors(_upAxis,
          _posv.set(support.normalX, support.normalY, support.normalZ));
        const g = baked.geo.clone();
        g.rotateY(yaw);
        g.applyQuaternion(_quat);
        g.translate(x, y, z); // settled on dead suspension across its whole footprint
        wreckGeos.push(g);
        // Secondary destruction stays inside the same static merged wreck
        // mesh: torn track runs, wheels and armor plates improve the scene
        // read without adding draw calls, animation, or live vehicle state.
        let debrisTris = 0;
        if (wCfg?.debris !== false) {
          const debris = bakeWreckDebris(seed + 17001 + wreckSerial * 97, {
            modern: isPostwarVehicleEra(era),
          });
          wreckSerial++;
          debris.geo.rotateY(yaw);
          debris.geo.applyQuaternion(_quat);
          debris.geo.translate(x, y + 0.01, z);
          wreckGeos.push(debris.geo);
          debrisTris = debris.tris;
          bakedTris += debrisTris;
        }
        if (baked.shadowGeo) {
          const sg = baked.shadowGeo.clone();
          sg.rotateY(yaw);
          sg.applyQuaternion(_quat);
          sg.translate(x, y, z);
          wreckShadowGeos.push(sg);
        }
        // solid obstacle + shell collider from the yaw-rotated footprint
        const cs = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
        const hx = baked.hx * cs + baked.hz * sn + 0.2;
        const hz = baked.hx * sn + baked.hz * cs + 0.2;
        const rec = setObbShape(
          { min: [x - hx, y, z - hz], max: [x + hx, y + baked.h - 0.2, z + hz] },
          x, z, baked.hx + 0.2, baked.hz + 0.2, yaw);
        obstacles.push(rec);
        colliders.push(cloneCollisionRecord(rec));
        wreckScorch.push([x, z]);
        tankWreckSpots.push({
          specId, x, y, z, yaw, hx, hz, h: baked.h, debrisTris,
          supportMin: support.min, supportMax: support.max, supportSpread: support.spread,
          supportMaxEmbed: support.maxEmbed, supportMaxFloat: support.maxFloat,
        });
        decorationGroundingReceipts.push({
          kind: 'tank-wreck', specId, x, y, z, relief: support.spread,
          baseClearance: support.maxFloat,
          supportMin: support.min, supportMax: support.max,
        });
        return true;
      }
      let placedW = 0;
      function* placeAuthoredWrecks(): Generator<PropsBuildSlice, void, void> {
        // Story-critical wrecks mark crossfires and failed assaults at authored
        // lane anchors before the seeded road pass supplies organic variation.
        for (const beat of P.tacticalBeats || []) {
          if (!beat.wreck || placedW >= wreckCount || bakedTris > 260000) continue;
          const yawW = THREE.MathUtils.degToRad(beat.wreckYawDeg ?? beat.yawDeg ?? 0);
          if (yield* placeWreck(beat.x + (beat.wreckOffsetX || 0),
            beat.z + (beat.wreckOffsetZ || 0), yawW)) {
            placedW++;
            yield { fine: true };
          }
        }
      }
      function wreckSpotIsClear(px: number, pz: number): boolean {
        if (Math.max(Math.abs(px), Math.abs(pz)) > 440) return false;
        if (heightField._roadDist(px, pz) < 5.2) return false;
        if (heightField.getGroundType(px, pz) === 'soft' || noVeg(px, pz)) return false;
        if (heightField.getNormalAt(px, pz).y < 0.88) return false;
        const nearSpawn = [L.spawns.player, ...L.spawns.enemies]
          .some((spawn) => Math.hypot(px - spawn.x, pz - spawn.z) < 30);
        if (nearSpawn) return false;
        const nearBuilding = placedB
          .some((building) => Math.hypot(px - building.x, pz - building.z) < building.rr + 4);
        return !nearBuilding && Math.hypot(px - junction.x, pz - junction.z) >= 20;
      }
      function duelSpotIsClear(qx: number, qz: number): boolean {
        return Math.max(Math.abs(qx), Math.abs(qz)) <= 440
          && heightField._roadDist(qx, qz) >= 5.2
          && heightField.getGroundType(qx, qz) !== 'soft'
          && !noVeg(qx, qz)
          && heightField.getNormalAt(qx, qz).y >= 0.88;
      }
      function* placePairedWreck(px: number, pz: number): Generator<PropsBuildSlice, void, void> {
        if (placedW >= wreckCount || wrng() >= 0.4) return;
        const da = wrng() * Math.PI * 2;
        const dd = 9 + wrng() * 5;
        const qx = px + Math.cos(da) * dd, qz = pz + Math.sin(da) * dd;
        if (!duelSpotIsClear(qx, qz)) return;
        const yaw = Math.atan2(px - qx, pz - qz) + (wrng() - 0.5) * 0.3;
        if (yield* placeWreck(qx, qz, yaw)) {
          placedW++;
          yield { fine: true };
        }
      }
      function* tryPlaceRoadWreck(
        nodes: Array<[number, number]>,
        nodeIndex: number,
      ): Generator<PropsBuildSlice, void, void> {
        const [ax, az] = nodes[nodeIndex], [bx, bz] = nodes[nodeIndex + 1];
        const length = Math.hypot(bx - ax, bz - az) || 1;
        const side = wrng() < 0.5 ? -1 : 1;
        const offset = 6.5 + wrng() * 4.5;
        const px = ax - ((bz - az) / length) * offset * side;
        const pz = az + ((bx - ax) / length) * offset * side;
        if (!wreckSpotIsClear(px, pz)) return;
        const yaw = Math.atan2(bx - ax, bz - az) + (wrng() - 0.5) * 0.9;
        if (!(yield* placeWreck(px, pz, yaw))) return;
        placedW++;
        yield { fine: true };
        yield* placePairedWreck(px, pz);
      }
      function* placeRoadWrecks(): Generator<PropsBuildSlice, void, void> {
        for (let ri = 0; ri < roads.length && placedW < wreckCount; ri++) {
          const nodes = roads[ri];
          for (let i = 5; i < nodes.length - 1 && placedW < wreckCount;
            i += 3 + ((wrng() * 2) | 0)) {
            if (bakedTris > 260000) break;
            yield* tryPlaceRoadWreck(nodes, i);
          }
        }
      }
      function finalizeWreckMeshes(): void {
        if (wreckGeos.length === 0) return;
        const wm = new THREE.Mesh(mergeGeometries(wreckGeos, false), mats.baked);
        wm.name = 'tank-wrecks';
        // PERF: the full hulks never enter the shadow passes — the factory's
        // own low-poly proxies (baked below in the same pose) cast instead,
        // exactly like live procedural tanks (installProceduralShadowProxies)
        wm.castShadow = false;
        wm.receiveShadow = true;
        wm.matrixAutoUpdate = false;
        group.add(wm);
        for (const g of wreckGeos) g.dispose();
        if (wreckShadowGeos.length > 0) {
          const shadowMat = new THREE.MeshBasicMaterial({
            name: 'TankWreckShadowProxy', colorWrite: false, depthWrite: false,
          });
          const sm = new THREE.Mesh(mergeGeometries(wreckShadowGeos, false), shadowMat);
          sm.name = 'tank-wrecks-shadow';
          sm.castShadow = true;
          sm.receiveShadow = false;
          sm.matrixAutoUpdate = false;
          markShadowOnly(sm);
          group.add(sm);
          for (const g of wreckShadowGeos) g.dispose();
        }
      }
      function disposeWreckBakeCache(): void {
        for (const baked of bakeCache.values()) {
          if (!baked) continue;
          baked.geo.dispose();
          if (baked.shadowGeo) baked.shadowGeo.dispose();
        }
      }
      yield* placeAuthoredWrecks();
      yield* placeRoadWrecks();
      finalizeWreckMeshes();
      disposeWreckBakeCache();
    }
  }
  yield* placeTankWrecks();

  // --- street rubble piles (urban): heaped masonry chunks + broken beams ---
  // r6: every 4th candidate may land in a 90 m OUTSKIRT band around the town
  // rect — shelled approaches carry debris too; the establishing camera used
  // to frame nothing but clean lawn between itself and the first block
  function placeStreetRubble(): void {
    if (P.rubblePiles <= 0) return;
    const rrng = mulberry32(seed + 403);
    const placeRubbleCandidate = (candidateIndex: number): boolean => {
      const extension = candidateIndex % 4 === 0 ? 90 : 0;
      const x = v.x0 - extension + rrng() * (v.x1 - v.x0 + extension * 2);
      const z = v.z0 - extension + rrng() * (v.z1 - v.z0 + extension * 2);
      const outskirt = x < v.x0 || x > v.x1 || z < v.z0 || z > v.z1;
      const roadDistance = heightField._roadDist(x, z);
      if (roadDistance < 4.5 || roadDistance > (outskirt ? 70 : 16)) return false;
      const blocked = placedB.some((building) =>
        Math.hypot(x - building.x, z - building.z) < building.rr + 2.5);
      if (blocked) return false;
      const nearSpawn = [L.spawns.player, ...L.spawns.enemies]
        .some((spawn) => Math.hypot(x - spawn.x, z - spawn.z) < 20);
      if (nearSpawn || Math.hypot(x - junction.x, z - junction.z) < 16) return false;
      addRubblePile(x, z, 1.6 + rrng() * 1.3, rrng);
      return true;
    };
    for (let i = 0, placed = 0; i < P.rubblePiles * 14 && placed < P.rubblePiles; i++) {
      if (placeRubbleCandidate(i)) placed++;
    }
  }
  placeStreetRubble();

  // --- street curbs (town maps): raised stone kerb lines along both sides of
  // every street inside the town rect, broken at crossings ---
  function placeStreetCurbs(): void {
    if (!P.curbs) return;
    // r6: urban kerbs/pavements read as CONCRETE, not planks — the urban
    // stone bucket is Bricks097 and its elongated courses on thin slabs read
    // as wooden boardwalk; route them to the plaster bucket on urban only
    // lighting_post r4: urban plaster (~0.88 albedo) on sun-facing horizontal
    // slabs rendered ~100% white ("sidewalks read emissive") — stone reads as
    // concrete-gray on every map.
    const kerbBucket = 'stone';
    for (let ri = 0; ri < roads.length; ri++) {
      const nodes = roads[ri];
      for (let i = 0; i < nodes.length - 1; i++) {
        const [ax, az] = nodes[i], [bx, bz] = nodes[i + 1];
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (mx < v.x0 - 6 || mx > v.x1 + 6 || mz < v.z0 - 6 || mz > v.z1 + 6) continue;
        const dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz);
        const tx = dx / len, tz = dz / len;
        const nSub = Math.max(1, Math.ceil(len / 5.2));
        const segLen = (len / nSub) * 1.03;
        const yaw = -Math.atan2(tz, tx);
        for (let k = 0; k < nSub; k++) {
          const tt0 = k / nSub, tt = (k + 0.5) / nSub, tt1 = (k + 1) / nSub;
          const cx = ax + dx * tt, cz = az + dz * tt;
          for (const side of [-1, 1]) {
            const px = cx - tz * side * 5.05, pz = cz + tx * side * 5.05;
            if (distToOtherRoads(px, pz, ri) < 6.8) continue; // open corners
            const y = heightField.getHeightAt(px, pz);
            const g = slabBox(segLen, 0.26, 0.34, 1.3);
            jitterUV(g, rng);
            g.rotateY(yaw);
            g.translate(px, y + 0.06, pz);
            buckets[kerbBucket].push(g);
            // r5: PAVEMENT slab behind the kerb — a 2.2 m sidewalk strip
            // flanking every street, pitched to the terrain per sub-segment.
            // The critique's "town = boxes dropped on a lawn" came straight
            // from streets with no built edge between asphalt and grass.
            const sx0 = ax + dx * tt0 - tz * side * 6.35, sz0 = az + dz * tt0 + tx * side * 6.35;
            const sx1 = ax + dx * tt1 - tz * side * 6.35, sz1 = az + dz * tt1 + tx * side * 6.35;
            const h0 = heightField.getHeightAt(sx0, sz0);
            const h1 = heightField.getHeightAt(sx1, sz1);
            const walk = slabBox(segLen, 0.16, 2.25, 0.9); // r2: un-stretched paving
            jitterUV(walk, rng);
            walk.rotateZ(Math.atan2(h1 - h0, segLen));
            walk.rotateY(yaw);
            walk.translate((sx0 + sx1) / 2, (h0 + h1) / 2 + 0.10, (sz0 + sz1) / 2);
            buckets[kerbBucket].push(walk);
          }
        }
      }
    }
  }
  placeStreetCurbs();

  // --- central-square monument (town maps): stepped stone obelisk ---
  function placeCentralMonument(): void {
    if (!P.monument) return;
    let ox = junction.x - 8, oz = junction.z - 9;
    for (let i = 0; i < 24 && heightField._roadDist(ox, oz) < 6; i++) { ox -= 1.5; oz -= 1; }
    const oy = heightField.getHeightAt(ox, oz);
    buckets.stone.push(box(2.4, 0.5, 2.4, 0.8).translate(ox, oy + 0.2, oz));
    buckets.stone.push(box(1.5, 0.6, 1.5, 0.8).translate(ox, oy + 0.72, oz));
    const shaft = box(0.72, 3.4, 0.72, 1.2);
    jitterUV(shaft, rng);
    buckets.stone.push(shaft.translate(ox, oy + 2.7, oz));
    const tip = new THREE.ConeGeometry(0.5, 0.7, 4, 1);
    tip.rotateY(Math.PI / 4);
    scaleUV(tip, 1, 1);
    tip.translate(ox, oy + 4.75, oz);
    buckets.stone.push(tip);
    obstacles.push({ min: [ox - 1.3, oy, oz - 1.3], max: [ox + 1.3, oy + 5.1, oz + 1.3] });
    colliders.push({ min: [ox - 1.3, oy, oz - 1.3], max: [ox + 1.3, oy + 5.1, oz + 1.3] });
  }
  placeCentralMonument();

  // --- ground-blend decals: dirt/AO ring under buildings + shell craters ---
  function placeGroundBlendDecals(): void {
    // r5 terrain_environment: TRACK-TEAR strip texture — churned dark earth
    // with two ragged tread lanes running along V; laid as conformed strips
    // on the AI drive corridors so the approaches read fought-over.
    function makeChurnTexture(): THREE.CanvasTexture {
      const w = 128, h = 256;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = canvas2d(c, { willReadFrequently: true });
      ctx.clearRect(0, 0, w, h);
      const trng = mulberry32(9131);
      // churned base band
      for (let y = 0; y < h; y += 2) {
        const wob = noi.noise(y * 0.05, 3.7) * 10;
        const grd = ctx.createLinearGradient(0, 0, w, 0);
        grd.addColorStop(0, 'rgba(60,48,32,0)');
        grd.addColorStop(0.22, 'rgba(52,41,27,0.62)');
        grd.addColorStop(0.5, 'rgba(58,46,30,0.72)');
        grd.addColorStop(0.78, 'rgba(52,41,27,0.62)');
        grd.addColorStop(1, 'rgba(60,48,32,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(wob, y, w - wob * 2, 2.4);
      }
      // twin tread lanes: darker compacted ruts with lug chatter
      for (const lane of [0.32, 0.68]) {
        for (let y = 0; y < h; y += 3) {
          const wobL = noi.noise(y * 0.07, lane * 9) * 5;
          ctx.fillStyle = `rgba(28,22,15,${0.55 + (trng() * 0.3)})`;
          ctx.fillRect(w * lane - 7 + wobL, y, 14, 2.2);
        }
        for (let y = 0; y < h; y += 7) { // lug marks across the rut
          ctx.fillStyle = 'rgba(20,16,11,0.5)';
          ctx.fillRect(w * lane - 8 + trng() * 3, y + trng() * 3, 16, 1.6);
        }
      }
      // fade both ends + ragged alpha
      const id = ctx.getImageData(0, 0, w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const vv = y / h;
        const endFade = smoothstep(0, 0.14, vv) * smoothstep(1, 0.86, vv);
        const nse = noi.noise(x * 0.12 + 80, y * 0.12) * 0.5 + 0.5;
        id.data[(y * w + x) * 4 + 3] *= endFade * clamp(0.75 + nse * 0.5, 0, 1);
      }
      ctx.putImageData(id, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      return t;
    }
    // terrain-conformed rectangular strip (track tears): stations every ~2.4 m
    function conformedStrip(
      ax: number,
      az: number,
      bx: number,
      bz: number,
      wS: number,
    ): THREE.BufferGeometry {
      const len = Math.hypot(bx - ax, bz - az);
      const nSt = Math.max(3, Math.ceil(len / 2.4));
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      const nx = -tz, nz = tx;
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      for (let i = 0; i <= nSt; i++) {
        const t = i / nSt;
        const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
        for (const sd of [-1, 1]) {
          const px = cx + nx * sd * wS / 2, pz = cz + nz * sd * wS / 2;
          pos.push(px, heightField.getHeightAt(px, pz) + 0.05, pz);
          uv.push(sd < 0 ? 0 : 1, t);
        }
        if (i > 0) {
          const b0 = (i - 1) * 2, b1 = i * 2;
          idx.push(b0, b1, b0 + 1, b0 + 1, b1, b1 + 1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    }
    // terrain-conformed disc; profile[] lifts each ring above the ground
    function conformedDisc(
      x: number,
      z: number,
      r: number,
      profile: readonly number[],
    ): THREE.BufferGeometry {
      const rings = [0, 0.4, 0.7, 1.0], segs = 18;
      const nv = 1 + (rings.length - 1) * segs;
      const pos = new Float32Array(nv * 3);
      const uv = new Float32Array(nv * 2);
      pos[0] = x; pos[1] = heightField.getHeightAt(x, z) + profile[0]; pos[2] = z;
      uv[0] = 0.5; uv[1] = 0.5;
      let vi = 1;
      for (let ri = 1; ri < rings.length; ri++) {
        for (let k = 0; k < segs; k++) {
          const a = (k / segs) * Math.PI * 2;
          const px = x + Math.cos(a) * r * rings[ri], pz = z + Math.sin(a) * r * rings[ri];
          pos[vi * 3] = px;
          pos[vi * 3 + 1] = heightField.getHeightAt(px, pz) + profile[ri];
          pos[vi * 3 + 2] = pz;
          uv[vi * 2] = 0.5 + Math.cos(a) * 0.5 * rings[ri];
          uv[vi * 2 + 1] = 0.5 + Math.sin(a) * 0.5 * rings[ri];
          vi++;
        }
      }
      const idx: number[] = [];
      for (let k = 0; k < segs; k++) idx.push(0, 1 + k, 1 + ((k + 1) % segs));
      for (let ri = 1; ri < rings.length - 1; ri++) {
        const a0 = 1 + (ri - 1) * segs, b0 = 1 + ri * segs;
        for (let k = 0; k < segs; k++) {
          const k1 = (k + 1) % segs;
          idx.push(a0 + k, b0 + k, a0 + k1, a0 + k1, b0 + k, b0 + k1);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    }
    // r6 (content_breadth): terrain-conformed ROTATED RECT (building aprons)
    // — 5x5 vertex grid so the sheet follows the ground; uv spans 0..1 for
    // the square-falloff apron texture.
    function conformedRect(
      cx: number,
      cz: number,
      hw: number,
      hd: number,
      rot: number,
    ): THREE.BufferGeometry {
      const nx = 5, nz = 5;
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          const u = ix / (nx - 1), vv = iz / (nz - 1);
          const lx = (u - 0.5) * 2 * hw, lz = (vv - 0.5) * 2 * hd;
          const px = cx + lx * cosR + lz * sinR;
          const pz = cz - lx * sinR + lz * cosR;
          pos.push(px, heightField.getHeightAt(px, pz) + 0.06, pz);
          uv.push(u, vv);
        }
      }
      for (let iz = 0; iz < nz - 1; iz++) {
        for (let ix = 0; ix < nx - 1; ix++) {
          const a = iz * nx + ix, b = a + 1, c2 = a + nx, d2 = c2 + 1;
          idx.push(a, c2, b, b, c2, d2);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    }
    function addDecalMesh(geos: THREE.BufferGeometry[], tex: THREE.Texture, {
      receiveShadow = true,
      groundContact = false,
      decalKind = 'surface',
    }: {
      receiveShadow?: boolean;
      groundContact?: boolean;
      decalKind?: string;
    } = {}): void {
      if (geos.length === 0) return;
      const mat = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, depthWrite: false,
        roughness: 0.97, metalness: 0,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      if (receiveShadow) engineCtx.setupShadowMaterial(mat);
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
      // Foundation/contact tint already supplies the small-scale grounding
      // term. Letting the live CSM shade that translucent layer again stacks
      // two darkening systems and makes cascade movement read as a flashing
      // ground texture. Authored surface decals (craters, aprons, churn) still
      // receive directional shadows; only the contact layer opts out.
      mesh.receiveShadow = receiveShadow;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 1;
      mesh.userData.groundContactDecal = groundContact;
      mesh.userData.terrainDecal = true;
      mesh.userData.terrainDecalKind = decalKind;
      mesh.userData.decalParts = geos.length;
      group.add(mesh);
    }
    function collectFoundationDecals(
      dirtDiscs: THREE.BufferGeometry[],
      apronGeos: THREE.BufferGeometry[],
    ): void {
      for (const building of buildingFeatures) {
        if (P.streetRows) {
          apronGeos.push(conformedRect(building.x, building.z,
            building.w / 2 + 2.8, building.d / 2 + 2.8, building.rot || 0));
        } else {
          dirtDiscs.push(conformedDisc(building.x, building.z,
            Math.max(building.w, building.d) * 1.2, [0.05, 0.05, 0.05, 0.04]));
        }
      }
      for (const prop of crushables) {
        dirtDiscs.push(conformedDisc(prop.x, prop.z, 1.15, [0.05, 0.05, 0.04, 0.03]));
      }
      for (const stack of stackSpots) {
        dirtDiscs.push(conformedDisc(stack.x, stack.z, stack.r, [0.05, 0.05, 0.04, 0.03]));
      }
    }
    function courtyardDecalIsClear(x: number, z: number): boolean {
      const roadDistance = heightField._roadDist(x, z);
      if (roadDistance < 7 || roadDistance > 40) return false;
      const onBuilding = placedB.some((building) =>
        Math.hypot(x - building.x, z - building.z) < building.rr + 1);
      return !onBuilding && !noVeg(x, z);
    }
    function collectCourtyardDecals(apronGeos: THREE.BufferGeometry[]): void {
      if (!P.streetRows) return;
      const crng2 = mulberry32(seed + 771);
      for (let i = 0, placed = 0; i < 700 && placed < 84; i++) {
        const x = v.x0 + crng2() * (v.x1 - v.x0);
        const z = v.z0 + crng2() * (v.z1 - v.z0);
        if (!courtyardDecalIsClear(x, z)) continue;
        apronGeos.push(conformedDisc(x, z,
          4.5 + crng2() * 7.0, [0.04, 0.04, 0.04, 0.03]));
        placed++;
      }
    }
    function placeFoundationDecals(): void {
      const dirtDiscs: THREE.BufferGeometry[] = [];
      const apronGeos: THREE.BufferGeometry[] = [];
      collectFoundationDecals(dirtDiscs, apronGeos);
      collectCourtyardDecals(apronGeos);
      addDecalMesh(dirtDiscs, makeGroundDecalTexture(noi, aniso, 'dirt'), {
        receiveShadow: false,
        groundContact: true,
        decalKind: 'ground-contact',
      });
      addDecalMesh(apronGeos, makeGroundDecalTexture(noi, aniso, 'apron'), {
        decalKind: 'apron',
      });
    }
    // craters: scattered shell holes with a raised rim mound. Town maps
    // (P.townCraters) let them pock the streets and squares themselves —
    // the contract's shelled-town read needs impact scars ON the asphalt,
    // not just in the fields outside the rect.
    // r5 terrain_environment: CRATER KIT rebuild. The old soft scorch smudge
    // + 0.14-0.26 m rim never registered ("zero battle scarring ... pristine
    // lawns", critique). Now: (a) a dedicated crater texture (black pit, raw
    // rim earth, ejecta rays), (b) a REAL raised rim mound (0.26-0.48 m at
    // the 0.7 ring — catches sun/shadow so the scar reads in silhouette),
    // (c) 3 radius classes, (d) ~55% of craters CLUSTER along the AI drive
    // corridors (spawn -> objective) where the eye actually looks, and (e) a
    // debris-clod ring around the larger holes.
    const CR_R = [2.3, 3.6, 5.2, 6.8];
    type DriveCorridor = [number, number, number, number];
    function addCraterClods(x: number, z: number, radius: number): void {
      const count = 4 + ((rng() * 3) | 0);
      for (let index = 0; index < count; index++) {
        const angle = rng() * Math.PI * 2;
        const distance = radius * (0.68 + rng() * 0.45);
        const size = 0.14 + rng() * 0.26;
        const clod = roughenChunk(box(size * 1.4, size * 0.7, size, 1.3), rng, size * 0.4);
        jitterUV(clod, rng);
        clod.rotateY(rng() * Math.PI);
        const clodX = x + Math.cos(angle) * distance;
        const clodZ = z + Math.sin(angle) * distance;
        clod.translate(clodX, heightField.getHeightAt(clodX, clodZ) + size * 0.25, clodZ);
        buckets.stone.push(clod);
      }
    }
    function randomCraterCenter(corridors: DriveCorridor[]): [number, number] {
      let x, z;
      if (rng() < 0.55 && corridors.length) { // corridor-clustered scarring
        const co = corridors[(rng() * corridors.length) | 0];
        const t = 0.16 + rng() * 0.74;
        const lat = (rng() - 0.5) * 44;
        const dx = co[2] - co[0], dz = co[3] - co[1];
        const dl = Math.hypot(dx, dz) || 1;
        x = co[0] + dx * t - (dz / dl) * lat;
        z = co[1] + dz * t + (dx / dl) * lat;
      } else {
        x = (rng() * 2 - 1) * 420; z = (rng() * 2 - 1) * 420;
      }
      return [x, z];
    }
    function craterCenterIsClear(x: number, z: number): boolean {
      if (Math.max(Math.abs(x), Math.abs(z)) > 430) return false;
      const inTown = x > v.x0 - 4 && x < v.x1 + 4 && z > v.z0 - 4 && z < v.z1 + 4;
      if (inTown && !P.townCraters) return false;
      if (heightField._roadDist(x, z) < (inTown ? 1.5 : 5.5)) return false;
      if (inTown) {
        const onBuilding = placedB.some((building) =>
          Math.hypot(x - building.x, z - building.z) < building.rr + 1.5);
        if (onBuilding) return false;
      }
      if (heightField.getGroundType(x, z) === 'soft' || noVeg(x, z)) return false;
      return ![L.spawns.player, ...L.spawns.enemies]
        .some((spawn) => Math.hypot(x - spawn.x, z - spawn.z) < 20);
    }
    function tryPlaceBattleScar(
      corridors: DriveCorridor[],
      craterDiscs: THREE.BufferGeometry[],
      burnDiscs: THREE.BufferGeometry[],
    ): boolean {
      const [x, z] = randomCraterCenter(corridors);
      if (!craterCenterIsClear(x, z)) return false;
      const roll = rng();
      if (roll < 0.24) { // burnt patch, no rim — HE strike / burn scar
        burnDiscs.push(conformedDisc(x, z, 2.6 + rng() * 2.6, [0.03, 0.03, 0.04, 0.02]));
        return true;
      }
      const r = CR_R[(rng() * CR_R.length) | 0] * (0.85 + rng() * 0.3);
      const rim = 0.26 + rng() * 0.22;
      craterDiscs.push(conformedDisc(x, z, r, [0.03, 0.02, rim, 0.02]));
      if (r > 3.2) addCraterClods(x, z, r);
      return true;
    }
    function placeBattleScars(corridors: DriveCorridor[]): void {
      const craterDiscs: THREE.BufferGeometry[] = [];
      const burnDiscs: THREE.BufferGeometry[] = [];
      for (let i = 0, placed = 0; i < P.craters * 14 && placed < P.craters; i++) {
        if (tryPlaceBattleScar(corridors, craterDiscs, burnDiscs)) placed++;
      }
      for (const [wx, wz] of wreckScorch) {
        burnDiscs.push(conformedDisc(wx, wz, 5.6, [0.03, 0.04, 0.05, 0.02]));
      }
      addDecalMesh(craterDiscs, makeGroundDecalTexture(noi, aniso, 'crater'), {
        decalKind: 'crater',
      });
      addDecalMesh(burnDiscs, makeGroundDecalTexture(noi, aniso, 'scorch'), {
        decalKind: 'scorch',
      });
    }
    // r5 terrain_environment: TRACK-TEAR strips along the AI corridors —
    // tread-churned earth runs (14-26 m) with twin rut lanes, conformed to
    // the terrain, so the approaches read driven-over ("no tread-torn earth
    // beyond faint road ruts", critique).
    function placeTrackTears(corridors: DriveCorridor[]): void {
      const trng = mulberry32(seed + 5115);
      const tearGeos: THREE.BufferGeometry[] = [];
      const nTears = P.streetRows ? 10 : 16;
      for (let i = 0, placed = 0; i < nTears * 10 && placed < nTears; i++) {
        const co = corridors[(trng() * corridors.length) | 0];
        const t = 0.18 + trng() * 0.66;
        const dx = co[2] - co[0], dz = co[3] - co[1];
        const dl = Math.hypot(dx, dz) || 1;
        const lat = (trng() - 0.5) * 30;
        const cx = co[0] + dx * t - (dz / dl) * lat;
        const cz = co[1] + dz * t + (dx / dl) * lat;
        if (Math.max(Math.abs(cx), Math.abs(cz)) > 420) continue;
        if (heightField._roadDist(cx, cz) < 6) continue;
        if (heightField.getGroundType(cx, cz) === 'soft' || noVeg(cx, cz)) continue;
        if (heightField.getNormalAt(cx, cz).y < 0.86) continue;
        let onB = false;
        for (const pb of placedB) {
          if (Math.hypot(cx - pb.x, cz - pb.z) < pb.rr + 2) { onB = true; break; }
        }
        if (onB) continue;
        const ang = Math.atan2(dz, dx) + (trng() - 0.5) * 0.5;
        const hl = 7 + trng() * 6; // half length
        tearGeos.push(conformedStrip(
          cx - Math.cos(ang) * hl, cz - Math.sin(ang) * hl,
          cx + Math.cos(ang) * hl, cz + Math.sin(ang) * hl,
          3.2 + trng() * 0.8));
        placed++;
      }
      addDecalMesh(tearGeos, makeChurnTexture(), { decalKind: 'churn' });
    }
    const corridors: DriveCorridor[] = [L.spawns.player, ...L.spawns.enemies]
      .map((spawn) => [spawn.x, spawn.z, v.cx ?? 10, v.cz ?? 40]);
    placeFoundationDecals();
    placeBattleScars(corridors);
    placeTrackTears(corridors);
  }
  placeGroundBlendDecals();

  // --- sourced-model InstancedMeshes (one per model, shared baked material) ---
  let poleIM: PoleMatrixWriter | null = null; // effects_combat r1: virtual writer for hinge-topple matrices
  let poleFullIM: THREE.InstancedMesh | null = null;
  let poleDistanceIM: THREE.InstancedMesh | null = null;
  let poleMatrices: THREE.Matrix4[] | null = null;
  let poleHigh: Uint8Array | null = null;
  let poleLodDirty = false;
  const lastPoleCamera = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);

  function rebuildPoleInstances(): void {
    if (!poleFullIM || !poleDistanceIM || !poleMatrices || !poleHigh) return;
    let fullCount = 0, distanceCount = 0;
    for (let i = 0; i < poleMatrices.length; i++) {
      if (poleHigh[i]) poleFullIM.setMatrixAt(fullCount++, poleMatrices[i]);
      else poleDistanceIM.setMatrixAt(distanceCount++, poleMatrices[i]);
    }
    poleFullIM.count = fullCount;
    poleDistanceIM.count = distanceCount;
    poleFullIM.visible = fullCount > 0;
    poleDistanceIM.visible = distanceCount > 0;
    poleFullIM.instanceMatrix.needsUpdate = true;
    poleDistanceIM.instanceMatrix.needsUpdate = true;
    poleLodDirty = false;
  }

  function movedPoleCamera(cameraPos: THREE.Vector3): boolean {
    return !Number.isFinite(lastPoleCamera.x)
      || lastPoleCamera.distanceToSquared(cameraPos) > 64;
  }

  function reclassifyPoleInstances(cameraPos: THREE.Vector3): boolean {
    if (!poleMatrices || !poleHigh) return false;
    let changed = false;
    lastPoleCamera.copy(cameraPos);
    for (let i = 0; i < poleMatrices.length; i++) {
      const e = poleMatrices[i].elements;
      const d = Math.hypot(e[12] - cameraPos.x, e[14] - cameraPos.z);
      // Hysteresis keeps a moving chase camera from repartitioning at the
      // boundary. The full model remains exact through 105 m and only
      // yields after 120 m, where the compact crossarm is screen-equivalent.
      const wasHigh = poleHigh[i] !== 0;
      const high = wasHigh ? d <= 120 : d < 105;
      if (high !== wasHigh) { poleHigh[i] = high ? 1 : 0; changed = true; }
    }
    return changed;
  }

  function updatePoleLod(cameraPos: THREE.Vector3 | null, force = false): void {
    if (!poleMatrices || !poleHigh) return;
    let changed = force;
    if (cameraPos && Number.isFinite(cameraPos.x) && Number.isFinite(cameraPos.z)) {
      if (movedPoleCamera(cameraPos) || force) changed = reclassifyPoleInstances(cameraPos) || changed;
    }
    if (changed || poleLodDirty) rebuildPoleInstances();
  }
  // r3 terrain_environment: the pale-sand baked sandbag models rendered as
  // raw white lumps on the winter snowfield (probed: the "foreground white
  // icosphere" of the critique was a sack_trench instance at 87 m). Per-map
  // instance tint pulls them to dark wet hessian so they read as emplaced
  // defenses against the snow.
  const bakedTint = snowCap ? new THREE.Color(0.52, 0.50, 0.47) : null;
  function instantiateBakedModels(): void {
  for (const [name, e] of bakedInstances) {
    if (e.list.length === 0) continue;
    if (name === 'pole') {
      const matrixStore = e.list.map((matrix: THREE.Matrix4) => matrix.clone());
      poleMatrices = matrixStore;
      poleHigh = new Uint8Array(e.list.length);
      poleHigh.fill(1);
      poleFullIM = new THREE.InstancedMesh(e.geo, mats.baked, e.list.length);
      poleDistanceIM = new THREE.InstancedMesh(
        makeTelephonePoleDistanceGeometry(), mats.baked, e.list.length);
      for (const mesh of [poleFullIM, poleDistanceIM]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        group.add(mesh);
      }
      poleFullIM.name = 'baked-pole-full';
      poleDistanceIM.name = 'baked-pole-distance';
      poleFullIM.userData.distanceSplitM = 120;
      poleDistanceIM.userData.distanceSplitM = 105;
      poleDistanceIM.count = 0;
      poleDistanceIM.visible = false;
      rebuildPoleInstances();
      // Crush/topple records retain their stable authored index. The renderer
      // is free to pack near/far instances independently behind this writer.
      poleIM = {
        instanceMatrix: { needsUpdate: false },
        getMatrixAt(index: number, target: THREE.Matrix4): void { target.copy(matrixStore[index]); },
        setMatrixAt(index: number, matrix: THREE.Matrix4): void {
          matrixStore[index].copy(matrix);
          poleLodDirty = true;
        },
      };
      continue;
    }
    const im = new THREE.InstancedMesh(e.geo, mats.baked, e.list.length);
    const tint = bakedTint && name.startsWith('sb') ? bakedTint : null;
    for (let i = 0; i < e.list.length; i++) {
      im.setMatrixAt(i, e.list[i]);
      if (tint) im.setColorAt(i, tint);
    }
    im.castShadow = true;
    im.receiveShadow = true;
    im.matrixAutoUpdate = false;
    im.computeBoundingSphere();
    im.name = `baked-${name}`;
    group.add(im);
  }
  }
  instantiateBakedModels();

  // Linked utility conductors: one four-sided unit cylinder, instanced along
  // all sampled catenaries. No shadow casting avoids sub-pixel CSM shimmer;
  // matrices move only while a connected pole is actively toppling.
  const _wirePoints = utilityNetwork
    ? new Float64Array((utilityNetwork.segments + 1) * 3) : null;
  const _wireA = new THREE.Vector3(), _wireB = new THREE.Vector3();
  const _wireMid = new THREE.Vector3(), _wireDir = new THREE.Vector3();
  const _wireUp = new THREE.Vector3(0, 1, 0), _wireScale = new THREE.Vector3();
  const _wireQuat = new THREE.Quaternion(), _wireMatrix = new THREE.Matrix4();
  function writeWireSpan(spanIndex: number): void {
    const points = _wirePoints;
    if (!wireIM || !utilityNetwork || !points) return;
    for (let side = 0; side < 2; side++) {
      utilityNetwork.writeSpanPoints(spanIndex, side, points);
      for (let seg = 0; seg < utilityNetwork.segments; seg++) {
        const a = seg * 3, b = a + 3;
        _wireA.set(points[a], points[a + 1], points[a + 2]);
        _wireB.set(points[b], points[b + 1], points[b + 2]);
        _wireDir.subVectors(_wireB, _wireA);
        const len = _wireDir.length();
        if (len < 1e-5) continue;
        _wireQuat.setFromUnitVectors(_wireUp, _wireDir.multiplyScalar(1 / len));
        _wireMid.addVectors(_wireA, _wireB).multiplyScalar(0.5);
        _wireScale.set(0.020, len * 1.02, 0.020);
        _wireMatrix.compose(_wireMid, _wireQuat, _wireScale);
        wireIM.setMatrixAt(utilityNetwork.instanceIndex(spanIndex, side, seg), _wireMatrix);
      }
    }
  }
  function rebuildWireSpans(indices: readonly number[] | null = null): void {
    if (!wireIM || !utilityNetwork) return;
    if (indices) {
      for (const spanIndex of indices) writeWireSpan(spanIndex);
    } else {
      for (let i = 0; i < utilityNetwork.spans.length; i++) writeWireSpan(i);
    }
    wireIM.instanceMatrix.needsUpdate = true;
  }
  function instantiateUtilityWires(): void {
    if (!utilityNetwork?.instanceCount) return;
    const wireGeo = new THREE.CylinderGeometry(1, 1, 1, 4, 1);
    wireIM = new THREE.InstancedMesh(wireGeo, mats.dark, utilityNetwork.instanceCount);
    wireIM.name = 'utility-wires';
    wireIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    wireIM.castShadow = false;
    wireIM.receiveShadow = false;
    wireIM.frustumCulled = false;
    wireIM.matrixAutoUpdate = false;
    group.add(wireIM);
    rebuildWireSpans();
  }
  instantiateUtilityWires();

  // content_breadth r2: map-specific set dressing (Frosthollow lake basin —
  // shoreline reeds / refrozen pressure ridges / rowboat / jetty). Soft
  // dressing only: pushes into the existing material buckets, no colliders.
  dressMapExtras({
    mapId, extraKits: P.extraKits, L, heightField, rng, buckets,
    groundingReceipts: decorationGroundingReceipts,
  });

  // --- merge buckets into one mesh per material ---
  function* mergeMaterialBuckets(): Generator<PropsBuildSlice, void, void> {
    for (const key of Object.keys(buckets)) {
      if (buckets[key].length === 0) continue;
      // mergeGeometries requires uniform indexing (ExtrudeGeometry is non-indexed)
      const merged = mergeGeometries(buckets[key].map((geometry) =>
        (geometry.index ? geometry.toNonIndexed() : geometry)), false);
      const mesh = new THREE.Mesh(merged, mats[key]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      yield { fine: true }; // loading-speed r1: merge one material family per idle slice
    }
  }
  yield* mergeMaterialBuckets();

  // -------------------------------------------------------------------------
  yield;
  // DESTRUCTIBLE POOL FINALIZATION (world-dressing r1): one InstancedMesh per
  // type for the intact instances, one (initially empty) for the broken
  // debris states. Geometry is built ONCE per type per map from the kit's
  // seeded builders; per-instance variety rides matrix scale/yaw + the
  // world-space grime shader. Break = zero-scale the intact slot + activate a
  // broken slot: two matrix writes, no per-frame cost once settled.
  // -------------------------------------------------------------------------
  const _zeroScale = new THREE.Vector3(1e-4, 1e-4, 1e-4);
  function refitDestructibleColliders(
    geometry: THREE.BufferGeometry,
    pool: DestructiblePool,
  ): void {
    const positions = geometry.getAttribute('position');
    if (!positions || !pool.records.length) return;
    // Refit every destructible obstacle to the actual ground-bearing solids.
    // Roof overhangs, open bays and support gaps remain visually and
    // physically open instead of inheriting the metadata placement box.
    const contactBand = deriveStructureCollisionProfile({ baked: [geometry] }).contact;
    for (const record of pool.records) {
      if (!record.ob) continue;
      const scaledBand = record.sc === 1 ? contactBand : {
        ...contactBand,
        parts: contactBand.parts.map((part) => part.kind === 'circle'
          ? { ...part, cx: part.cx * record.sc, cz: part.cz * record.sc, r: part.r * record.sc }
          : part.kind === 'obb'
            ? {
              ...part, cx: part.cx * record.sc, cz: part.cz * record.sc,
              hw: part.hw * record.sc, hl: part.hl * record.sc,
            }
            : {
              ...part,
              cx: part.cx * record.sc,
              cz: part.cz * record.sc,
              points: part.points.map((value) => value * record.sc),
            }),
      };
      applyStructureCollisionBand(record.ob, scaledBand, record.x, record.z, record.yaw);
      if (record.col) {
        applyStructureCollisionBand(record.col, scaledBand, record.x, record.z, record.yaw);
      }
    }
  }
  function tintDestructibleInstances(
    kind: string,
    pool: DestructiblePool,
    imI: THREE.InstancedMesh,
  ): void {
    if (snowCap && kind.startsWith('sandbag')) {
      const tint = new THREE.Color(0.52, 0.50, 0.47);
      for (let i = 0; i < pool.mats4.length; i++) imI.setColorAt(i, tint);
    }
    if (!pool.meta.instanceTintStrength) return;
    for (let i = 0; i < pool.mats4.length; i++) {
      writeStructureInstanceTint(_structureTint, kind, i, seed, pool.meta.instanceTintStrength);
      imI.setColorAt(i, _structureTint);
    }
    imI.instanceColor!.needsUpdate = true;
  }
  function finalizeDestructiblePool(kind: string, pool: DestructiblePool): void {
    const meta = pool.meta;
    // Wall modules use the map-toned masonry materials; other objects keep
    // the wood, straw, vehicle, or baked family selected by their metadata.
    const material = mats[meta.mat] || mats.baked;
    const geoI = meta.build(drng);
    refitDestructibleColliders(geoI, pool);
    const imI = new THREE.InstancedMesh(geoI, material, pool.mats4.length);
    for (let i = 0; i < pool.mats4.length; i++) imI.setMatrixAt(i, pool.mats4[i]);
    tintDestructibleInstances(kind, pool, imI);
    const castsDynamicShadow = destructibleCastsShadow(meta);
    imI.castShadow = castsDynamicShadow;
    imI.receiveShadow = true;
    imI.matrixAutoUpdate = false;
    if (meta.cls === 'topple' || meta.cls === 'toss' || meta.cls === 'physics') imI.frustumCulled = false; // instances animate
    else imI.computeBoundingSphere();
    imI.name = 'destructible-' + kind;
    group.add(imI);
    pool.imI = imI;
    if (meta.broken) {
      const geoB = meta.broken(drng);
      const imB = new THREE.InstancedMesh(geoB, material, pool.mats4.length);
      imB.count = 0;
      imB.visible = false;
      imB.castShadow = castsDynamicShadow;
      imB.receiveShadow = true;
      imB.matrixAutoUpdate = false;
      imB.frustumCulled = false; // slots appended over the battle
      imB.name = 'destructible-' + kind + '-broken';
      group.add(imB);
      pool.imB = imB;
    }
  }
  function* finalizeDestructiblePools(): Generator<PropsBuildSlice | undefined, void, void> {
    for (const [kind, pool] of dPools) {
      yield; // perf-r3: one instanced-pool build per slice (geometry per kind)
      finalizeDestructiblePool(kind, pool);
    }
  }
  yield* finalizeDestructiblePools();
  // spatial hash over destructible records for the shell paths (8 m cells)
  const D_CELL = 8;
  const dHash = new Map<string, number[]>();
  function indexDestructibleRecords(): void {
    for (let i = 0; i < destructibles.length; i++) {
      const rec = destructibles[i];
      const kx = Math.floor(rec.x / D_CELL), kz = Math.floor(rec.z / D_CELL);
      const key = kx + ':' + kz;
      let cell = dHash.get(key);
      if (!cell) { cell = []; dHash.set(key, cell); }
      cell.push(i);
      rec._dKey = key;
      rec._destructibleIndex = i;
    }
  }
  indexDestructibleRecords();

  // Loose bodies can cross the shell hash's 8 m cells. Re-key only on a cell
  // boundary crossing (rare); the steady-state fixed step remains allocation
  // free and shell hits never target a stale/ghost position.
  function refreshDestructibleCell(rec: DestructibleRecord): void {
    const key = Math.floor(rec.x / D_CELL) + ':' + Math.floor(rec.z / D_CELL);
    if (key === rec._dKey) return;
    const old = rec._dKey ? dHash.get(rec._dKey) : undefined;
    if (old) {
      const at = rec._destructibleIndex == null ? -1 : old.indexOf(rec._destructibleIndex);
      if (at >= 0) old.splice(at, 1);
    }
    let cell = dHash.get(key);
    if (!cell) { cell = []; dHash.set(key, cell); }
    if (rec._destructibleIndex != null) cell.push(rec._destructibleIndex);
    rec._dKey = key;
  }
  // Dedicated static broad phase for awake clutter. It uses its own stamp so
  // it cannot interfere with map.ts's movement grid over the same records.
  const LOOSE_CELL = 12;
  const looseCells = new Map<number, PropsCollisionRecord[]>();
  const looseCellKey = (x: number, z: number): number => (x + 32768) * 65536 + (z + 32768);
  function indexLoosePropObstacles(): void {
    for (const obstacle of obstacles) {
      const x0 = Math.floor(obstacle.min[0] / LOOSE_CELL), x1 = Math.floor(obstacle.max[0] / LOOSE_CELL);
      const z0 = Math.floor(obstacle.min[2] / LOOSE_CELL), z1 = Math.floor(obstacle.max[2] / LOOSE_CELL);
      for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
        const key = looseCellKey(cx, cz);
        let cell = looseCells.get(key);
        if (!cell) { cell = []; looseCells.set(key, cell); }
        cell.push(obstacle);
      }
    }
  }
  indexLoosePropObstacles();
  const looseObstacleScratch: PropsCollisionRecord[] = [];
  let looseObstacleStamp = 0;
  function queryLooseObstacles(x: number, z: number, r: number): PropsCollisionRecord[] {
    looseObstacleScratch.length = 0;
    looseObstacleStamp++;
    const x0 = Math.floor((x - r) / LOOSE_CELL), x1 = Math.floor((x + r) / LOOSE_CELL);
    const z0 = Math.floor((z - r) / LOOSE_CELL), z1 = Math.floor((z + r) / LOOSE_CELL);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const cell = looseCells.get(looseCellKey(cx, cz));
      if (!cell) continue;
      for (const ob of cell) {
        if (ob.__looseStamp === looseObstacleStamp) continue;
        ob.__looseStamp = looseObstacleStamp;
        if (ob.max[0] < x - r || ob.min[0] > x + r || ob.max[2] < z - r || ob.min[2] > z + r) continue;
        looseObstacleScratch.push(ob);
      }
    }
    return looseObstacleScratch;
  }

  // hinge-topple animation state (effects_combat r1 pole pattern, generalized
  // world-dressing r1): every entry rebuilds its instance matrix per tick from
  // the ORIGINAL placement so the hinge never compounds. Poles and topple-
  // class destructibles share the runner. Cap simultaneous anims — overflow
  // entries snap the oldest to its final pose.
  const crushAnims: CrushAnimation[] = [];
  const MAX_CRUSH_ANIMS = 14;
  const _cm = new THREE.Matrix4(), _cq = new THREE.Quaternion();
  const _cax = new THREE.Vector3();
  // Topple/toss poses run inside the RAF-driven world update. Reuse the same
  // composition matrices for every bounded animation instead of allocating
  // three Matrix4 objects per prop per frame.
  const _animM = new THREE.Matrix4();
  const _animR = new THREE.Matrix4();
  const _animT = new THREE.Matrix4();
  let fxBudget = 6; // kind-flavored break bursts per frame (refilled each tick)

  function poseToppled(a: ToppleAnimation, ang: number): void {
    if (!a.placement) return;
    _cax.set(a.ax, 0, a.az).normalize();
    _cq.setFromAxisAngle(_cax, ang);
    _animM.makeTranslation(a.x, a.y, a.z)
      .multiply(_animR.makeRotationFromQuaternion(_cq))
      .multiply(_animT.makeTranslation(-a.x, -a.y, -a.z))
      .multiply(a.placement);
    a.im.setMatrixAt(a.index, _animM);
    a.im.instanceMatrix.needsUpdate = true;
    if (a.wirePoleIndex != null && utilityNetwork) {
      const spans = utilityNetwork.setPoleFall(a.wirePoleIndex, a.ax, a.az, ang);
      rebuildWireSpans(spans);
    }
  }
  function pushCrushAnim(a: CrushAnimation): void {
    if (crushAnims.length >= MAX_CRUSH_ANIMS) {
      const old = crushAnims.shift(); // snap-finish the oldest
      if (!old) return;
      if (!old.placement) { old.im.getMatrixAt(old.index, _cm); old.placement = _cm.clone(); }
      if (old.type === 'toss') {
        if (old.spin == null) { old.spin = 6; old.r = old.h * 0.35; }
        poseTossed(old, old.dur);
      } else {
        poseToppled(old, old.maxAng);
      }
    }
    crushAnims.push(a);
  }

  // DESTRUCTIBLES r1: explosive chain queue — a red fuel drum detonating
  // inside breakRecord must not recurse into shellImpact mid-iteration, so
  // blasts are deferred one tick (also naturally staggers chained drums).
  const pendingBlasts: PendingBlast[] = [];

  function ensureLooseActive(rec: LooseDestructibleRecord): void {
    if (rec.looseListed) return;
    rec.looseListed = true;
    activeLoose.push(rec);
  }

  function kickLooseRecord(
    idx: number,
    dx: number,
    dz: number,
    speed: number,
    cause: LoosePropKickCause,
  ): boolean {
    const rec = destructibles[idx];
    if (!rec?.body || rec.looseIndex == null || rec.looseListed == null
      || !kickLooseProp(rec.body, dx, dz, speed, cause)) return false;
    ensureLooseActive(rec as LooseDestructibleRecord);
    return true;
  }

  function animateBrokenRecord(
    rec: DestructibleRecord,
    pool: DestructiblePool,
    dx: number,
    dz: number,
    speed: number,
    directionLength: number,
  ): void {
    if (rec.cls === 'topple') {
      setToppleAxis(_cax, dx, dz);
      pushCrushAnim({
        im: pool.imI!, index: rec.slot, x: rec.x, y: rec.y, z: rec.z,
        ax: _cax.x, az: _cax.z, t: 0, placement: null,
        maxAng: settledToppleAngle(heightField, rec.x, rec.y, rec.z, dx, dz,
          rec.h, Math.max(0.05, Math.min(0.22, rec.r * 0.18))),
      });
      return;
    }
    if (rec.cls === 'toss') {
      // DESTRUCTIBLES r1: rammed drums/churns go FLYING — short ballistic
      // arc along the impact direction (speed-scaled), tumbling in flight,
      // settling on their side. Persists via the anim's final pose.
      const th = 2.2 + Math.min(speed, 12) * 0.55;
      setToppleAxis(_cax, dx, dz);
      pushCrushAnim({
        type: 'toss', im: pool.imI!, index: rec.slot,
        x: rec.x, y: rec.y, z: rec.z, h: rec.h,
        vx: (dx / directionLength) * th + (drng() - 0.5) * 1.2,
        vz: (dz / directionLength) * th + (drng() - 0.5) * 1.2,
        vy: 2.6 + Math.min(speed, 12) * 0.30,
        ax: _cax.x, az: _cax.z,
        t: 0, placement: null, dur: 1.5,
      });
      return;
    }
    // swap-out: zero-scale the intact slot, activate a broken slot in place
    _quat.setFromAxisAngle(_upAxis, rec.yaw);
    _mat4.compose(_posv.set(rec.x, rec.y, rec.z), _quat, _zeroScale);
    pool.imI!.setMatrixAt(rec.slot, _mat4);
    pool.imI!.instanceMatrix.needsUpdate = true;
    if (!pool.imB) return;
    const bi = pool.nBroken++;
    if (bi >= pool.mats4.length) return;
    pool.imB.setMatrixAt(bi, pool.mats4[rec.slot]);
    if (pool.meta.instanceTintStrength) {
      writeStructureInstanceTint(
        _structureTint, rec.kind, rec.slot, seed, pool.meta.instanceTintStrength,
      );
      pool.imB.setColorAt(bi, _structureTint);
      pool.imB.instanceColor!.needsUpdate = true;
    }
    pool.imB.count = pool.nBroken;
    pool.imB.visible = true;
    pool.imB.instanceMatrix.needsUpdate = true;
  }

  /**
   * Break/topple/toss one destructible record. All trigger paths land here
   * (hull-overrun obstacle seam, hull-radius loop, shell sweep/impact).
   * @param {number} idx destructibles index
   * @param {number} dx break direction (XZ, need not be unit)
   * @param {number} [speed=0] impact speed m/s (hull overrun) — debris throw
   *   inherits it; 0 = shell-grade base energy
   * @param {string} [cause='shell'] 'ram' | 'shell' | 'blast'
   * @returns {boolean} true if the record broke now
   */
  function breakRecord(
    idx: number,
    dx: number,
    dz: number,
    speed = 0,
    cause: LoosePropKickCause = 'shell',
  ): boolean {
    const rec = destructibles[idx];
    if (!rec || rec.state) return false;
    const pool = dPools.get(rec.kind);
    if (!pool || !pool.imI) return false;
    // Loose dressing is displaced, never consumed. Shells/blasts kick it too,
    // and a later tank can push the exact same object again after it settles.
    if (rec.cls === 'physics') return kickLooseRecord(idx, dx, dz, speed, cause);
    rec.state = 1;
    if (rec.ob) rec.ob.crushed = true;          // ghost for collision + AI
    if (rec.col) rec.col.dead = true;           // shells/LOS pass the breach
    if (rec.loopRef) rec.loopRef.toppled = true; // stop the main.ts loop
    const l = Math.hypot(dx, dz) || 1;
    animateBrokenRecord(rec, pool, dx, dz, speed, l);
    // explosive kinds (red fuel drums): a proper blast next tick — flavored
    // fireball via the fx seam + chained radius damage onto nearby records
    if (pool.meta.explosive) {
      pendingBlasts.push({ x: rec.x, y: rec.y + rec.h * 0.4, z: rec.z });
    }
    if (fxBudget > 0) {
      fxBudget--;
      // debris inherits the rammer's velocity: dir magnitude carries energy
      // (1 = shell-grade break; a 14 m/s overrun throws ~2.6x as hard)
      const throwK = 1 + Math.min(speed, 14) * 0.115;
      emitBreakFx(rec.kind, rec.x, rec.y + Math.min(0.5, rec.h * 0.3), rec.z,
        (dx / l) * throwK, (dz / l) * throwK, rec.h);
    }
    // audio seam (DESTRUCTIBLES r1): every destruction reports on the bus
    emitDestroyed({ kind: rec.kind, pos: [rec.x, rec.y, rec.z], cause });
    return true;
  }

  /** main.ts crushables-loop contract (poles + 'loop'-class destructibles). */
  function crushProp(i: number, dx: number, dz: number, speed = 0): boolean {
    const c = crushables[i];
    if (!c || c.toppled) return false;
    if (c.recIdx != null) {
      const rec = destructibles[c.recIdx];
      if (rec && rec.body) return kickLooseRecord(c.recIdx, dx, dz, speed, 'ram');
      c.toppled = true;
      return breakRecord(c.recIdx, dx, dz, speed, 'ram');
    }
    if (!poleIM || c.index == null) return false;
    c.toppled = true;
    setToppleAxis(_cax, dx, dz);
    // Hinge axis is perpendicular to travel and oriented so a positive
    // right-handed rotation makes the pole fall along the ram direction.
    pushCrushAnim({
      im: poleIM, index: c.index, x: c.x, y: c.y, z: c.z,
      wirePoleIndex: c.wirePoleIndex,
      ax: _cax.x, az: _cax.z, t: 0, placement: null,
      maxAng: settledToppleAngle(heightField, c.x, c.y, c.z, dx, dz, c.h, 0.12),
    });
    return true;
  }

  /** map.ts crushObstacle seam for prop-tagged crushable obstacles. */
  function crushDestructible(
    propIdx: number,
    dx: number,
    dz: number,
    speed = 0,
    cause: LoosePropKickCause = 'ram',
  ): boolean {
    return breakRecord(propIdx, dx, dz, speed, cause);
  }

  // shell paths (registered through src/world/destructibles.ts; effects.ts
  // forwards flight segments + world impact points)
  const _dCells: number[][] = [];
  function cellsAround(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    pad: number,
  ): number[][] {
    _dCells.length = 0;
    const minX = Math.floor((Math.min(x0, x1) - pad) / D_CELL);
    const maxX = Math.floor((Math.max(x0, x1) + pad) / D_CELL);
    const minZ = Math.floor((Math.min(z0, z1) - pad) / D_CELL);
    const maxZ = Math.floor((Math.max(z0, z1) + pad) / D_CELL);
    // cap the scan: a chained flight segment can span tens of meters (an
    // APFSDS covers ~28 m per sim tick), so allow a generous window — empty
    // cells are a Map miss each; a pathological hitch-length span still bails
    if ((maxX - minX + 1) * (maxZ - minZ + 1) > 220) return _dCells;
    for (let kx = minX; kx <= maxX; kx++) {
      for (let kz = minZ; kz <= maxZ; kz++) {
        const cell = dHash.get(kx + ':' + kz);
        if (cell) _dCells.push(cell);
      }
    }
    return _dCells;
  }
  const _slabRange = [0, 1];
  function clipShellAxis(origin: number, delta: number, min: number, max: number): boolean {
    if (Math.abs(delta) < 1e-9) return origin >= min && origin <= max;
    const inv = 1 / delta;
    let near = (min - origin) * inv, far = (max - origin) * inv;
    if (near > far) { const swap = near; near = far; far = swap; }
    if (near > _slabRange[0]) _slabRange[0] = near;
    if (far < _slabRange[1]) _slabRange[1] = far;
    return _slabRange[0] <= _slabRange[1];
  }
  function shellSegmentHitsRecord(
    rec: DestructibleRecord,
    ax: number,
    ay: number,
    az: number,
    dx: number,
    dy: number,
    dz: number,
  ): boolean {
    _slabRange[0] = 0;
    _slabRange[1] = 1;
    return clipShellAxis(ax, dx, rec.x - rec.r, rec.x + rec.r)
      && clipShellAxis(ay, dy, rec.y - 0.4, rec.y + rec.h)
      && clipShellAxis(az, dz, rec.z - rec.r, rec.z + rec.r);
  }
  function shellSweep(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
  ): void {
    let broke = 0;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    for (const cell of cellsAround(ax, az, bx, bz, 2.5)) {
      for (const idx of cell) {
        const rec = destructibles[idx];
        if (rec.state) continue;
        // Slab test: segment vs the record's AABB (x/z ± r, y .. y+h).
        if (shellSegmentHitsRecord(rec, ax, ay, az, dx, dy, dz)
          && breakRecord(idx, dx, dz, 0, 'shell') && ++broke >= 3) return;
      }
    }
  }
  function shellImpact(
    x: number,
    y: number,
    z: number,
    opts: ShellImpactSettings = {},
  ): void {
    const r = opts.r ?? (opts.he ? 4.6 : 1.0);
    const cause = opts.cause || 'blast';
    let broke = 0;
    for (const cell of cellsAround(x, z, x, z, r + 2.5)) {
      for (const idx of cell) {
        const rec = destructibles[idx];
        if (rec.state) continue;
        const ddx = rec.x - x, ddz = rec.z - z;
        if (Math.hypot(ddx, ddz) > r + rec.r) continue;
        if (y < rec.y - r || y > rec.y + rec.h + r) continue;
        if (breakRecord(idx, ddx, ddz, 0, cause) && ++broke >= 6) return;
      }
    }
  }
  registerWorldDestructibles({
    key: mapId,
    isActive: () => {
      for (let o: THREE.Object3D | null = group; o; o = o.parent) {
        if (o.visible === false) return false;
      }
      return !!group.parent; // only once assembled into a scene
    },
    sweep: shellSweep,
    impact: shellImpact,
  });

  // DESTRUCTIBLES r1: tossed-prop pose — ballistic arc along the impact
  // direction with tumble, composed about the prop's own center against the
  // ORIGINAL placement (same non-compounding rule as the hinge topple).
  const _tq = new THREE.Quaternion();
  function poseTossed(a: TossAnimation, t: number): void {
    if (!a.placement) return;
    const u = Math.min(t / a.dur, 1);
    const ox = a.vx * t, oz = a.vz * t;
    let oy = a.vy * t - 4.9 * t * t;
    // rest pose: lying on its side — center drops from h/2 to its radius
    const rest = (a.r ?? a.h * 0.34) - a.h * 0.5;
    const gd = heightField.getHeightAt(a.x + ox, a.z + oz)
      - heightField.getHeightAt(a.x, a.z);
    if (oy < rest + gd) oy = rest + gd;
    // tumble, easing into a flat-lying quarter-turn multiple by touchdown
    const rawAng = (a.spin ?? 0) * t;
    const lieAng = (Math.floor(rawAng / Math.PI) + 0.5) * Math.PI;
    const ang = u < 0.72 ? rawAng : rawAng + (lieAng - rawAng) * ((u - 0.72) / 0.28);
    _cax.set(a.ax, 0, a.az).normalize();
    _tq.setFromAxisAngle(_cax, ang);
    // M = T(flight offset) * T(center) * R * T(-center) * placement — tumble
    // about the prop's own mid-height, carried along the ballistic offset
    const cy = a.y + a.h * 0.5;
    _animM.makeTranslation(a.x + ox, cy + oy, a.z + oz)
      .multiply(_animR.makeRotationFromQuaternion(_tq))
      .multiply(_animT.makeTranslation(-a.x, -cy, -a.z))
      .multiply(a.placement);
    a.im.setMatrixAt(a.index, _animM);
    a.im.instanceMatrix.needsUpdate = true;
  }

  // Persistent loose-body pose: rotate the authored placement about its
  // scaled mid-height, then carry that center with the body. Shared matrices
  // keep every awake-body step allocation-free.
  const _looseQ = new THREE.Quaternion();
  const _looseM = new THREE.Matrix4();
  const _looseR = new THREE.Matrix4();
  function poseLooseRecord(rec: LooseDestructibleRecord): void {
    const b = rec.body, pool = dPools.get(rec.kind);
    if (!b || !pool || !pool.imI) return;
    _looseQ.set(b.qx, b.qy, b.qz, b.qw);
    _looseM.makeTranslation(b.x, b.y, b.z);
    _looseR.makeRotationFromQuaternion(_looseQ);
    _looseM.multiply(_looseR);
    _looseR.makeTranslation(-b.homeX, -(b.homeBaseY + b.height * 0.5), -b.homeZ);
    _looseM.multiply(_looseR).multiply(pool.mats4[rec.slot]);
    pool.imI.setMatrixAt(rec.slot, _looseM);
    pool.imI.instanceMatrix.needsUpdate = true;
  }

  function syncLooseRecord(rec: LooseDestructibleRecord): void {
    const b = rec.body;
    rec.x = b.x; rec.y = b.y - b.height * 0.5; rec.z = b.z;
    if (rec.loopRef) {
      rec.loopRef.x = b.x;
      rec.loopRef.y = b.y - b.radius;
      rec.loopRef.z = b.z;
    }
    refreshDestructibleCell(rec);
    poseLooseRecord(rec);
  }

  let looseAcc = 0;
  function integrateLooseProps(): void {
    for (let i = activeLoose.length - 1; i >= 0; i--) {
      const rec = activeLoose[i], b = rec.body;
      stepLoosePropBody(b, LOOSE_PROP_STEP_S,
        heightField.getHeightAt, heightField.getNormalAt);
      for (const ob of queryLooseObstacles(b.x, b.z, b.radius + 0.08)) {
        resolveLoosePropObstacle(b, ob);
      }
    }
  }
  function resolveLoosePropPairs(): void {
    for (let i = 0; i < activeLoose.length; i++) {
      const rec = activeLoose[i], a = rec.body;
      for (let j = 0; j < looseRecords.length; j++) {
        const other = looseRecords[j];
        if (other === rec || (other.body.active && other.looseIndex < rec.looseIndex)) continue;
        const wakes = resolveLoosePropPair(a, other.body);
        if ((wakes & 1) && !rec.looseListed) ensureLooseActive(rec);
        if (wakes & 2) ensureLooseActive(other);
      }
    }
  }
  function syncAndRetireLooseProps(): void {
    for (let i = activeLoose.length - 1; i >= 0; i--) {
      const rec = activeLoose[i];
      syncLooseRecord(rec);
      if (!rec.body.active) {
        rec.looseListed = false;
        activeLoose.splice(i, 1);
      }
    }
  }
  function updateLooseProps(dt: number): void {
    if (!activeLoose.length || dt <= 0) return;
    looseAcc = Math.min(0.1, looseAcc + dt);
    while (looseAcc >= LOOSE_PROP_STEP_S) {
      looseAcc -= LOOSE_PROP_STEP_S;
      // Integrate + collide with static cover first.
      integrateLooseProps();
      // Momentum transfer wakes neighboring sleeping clutter. Active/active
      // pairs are resolved once by looseIndex ordering.
      resolveLoosePropPairs();
      syncAndRetireLooseProps();
    }
  }

  function updateProps(dt: number, cameraPos: THREE.Vector3 | null = null): void {
    updatePoleLod(cameraPos);
    fxBudget = 6; // per-frame kind-burst cap refill
    // DESTRUCTIBLES r1: deferred explosive-drum blasts (max 2/tick so chains
    // ripple instead of detonating as one frame spike)
    for (let b = 0; b < 2 && pendingBlasts.length; b++) {
      const bl = pendingBlasts.shift();
      if (!bl) break;
      emitBreakFx('drumblast', bl.x, bl.y, bl.z, 0, 0, 1.4); // flavored fireball
      shellImpact(bl.x, bl.y, bl.z, { r: 5.4, he: true, cause: 'blast' });
    }
    updateLooseProps(dt);
    if (!crushAnims.length) return; // zero per-frame cost when idle
    for (let k = crushAnims.length - 1; k >= 0; k--) {
      const a = crushAnims[k];
      if (!a.placement) {
        // capture the ORIGINAL placement on the first tick so the hinge/arc
        // composes against it, never an already-rotated matrix
        a.im.getMatrixAt(a.index, _cm);
        a.placement = _cm.clone();
        if (a.type === 'toss') {
          a.spin = 5.0 + mulberry32((a.index + 3) * 2654435761)() * 4.5;
          a.r = a.h * 0.35;
        } else {
          // random hinge-axis wobble so simultaneous topples de-sync
          const wob = (mulberry32((a.index + 1) * 2654435761)() - 0.5) * 0.22;
          const cw = Math.cos(wob), sw = Math.sin(wob);
          const nx = a.ax * cw - a.az * sw, nz = a.ax * sw + a.az * cw;
          a.ax = nx; a.az = nz;
        }
      }
      if (a.type === 'toss') {
        a.t = Math.min(a.t + dt, a.dur);
        poseTossed(a, a.t);
        if (a.t >= a.dur) crushAnims.splice(k, 1);
        continue;
      }
      a.t = Math.min(a.t + dt, 1.1);
      // eased fall to ~83-85deg with a small end bounce
      const u = Math.min(a.t / 0.8, 1);
      let ang = a.maxAng * u * u * (3 - 2 * u);
      if (a.t > 0.8) ang = a.maxAng - 0.06 * Math.sin((a.t - 0.8) * 18) * Math.exp(-(a.t - 0.8) * 6);
      poseToppled(a, ang);
      if (a.t >= 1.1) crushAnims.splice(k, 1);
    }
    updatePoleLod(cameraPos);
  }

  /**
   * DESTRUCTIBLES r1: rematch restore — worlds are cached and reused across
   * battles, so startBattle() calls this to stand every broken/toppled/
   * tossed destructible back up: records reset, intact instance matrices
   * restored, broken pools emptied, obstacle/collider ghosts revived, pole
   * topples righted and any in-flight anims dropped.
   */
  function restoreDestructibleRecord(rec: DestructibleRecord): void {
    if (rec.ob) {
      rec.ob.crushed = false;
      rec.ob._pressS = 0;
      rec.ob._pressT = -1e9;
    }
    if (rec.col) rec.col.dead = false;
    if (rec.loopRef) rec.loopRef.toppled = false;
    if (rec.body) {
      resetLoosePropBody(rec.body);
      rec.looseListed = false;
      rec.x = rec.body.homeX; rec.y = rec.body.homeBaseY; rec.z = rec.body.homeZ;
      if (rec.loopRef) {
        rec.loopRef.x = rec.x; rec.loopRef.y = rec.y; rec.loopRef.z = rec.z;
      }
      refreshDestructibleCell(rec);
      const pool = dPools.get(rec.kind);
      if (pool && pool.imI) {
        pool.imI.setMatrixAt(rec.slot, pool.mats4[rec.slot]);
        pool.imI.instanceMatrix.needsUpdate = true;
      }
      return;
    }
    if (!rec.state) return;
    rec.state = 0;
    const pool = dPools.get(rec.kind);
    if (pool && pool.imI) {
      pool.imI.setMatrixAt(rec.slot, pool.mats4[rec.slot]);
      pool.imI.instanceMatrix.needsUpdate = true;
    }
  }
  function resetBrokenPools(): void {
    for (const pool of dPools.values()) {
      pool.nBroken = 0;
      if (pool.imB) {
        pool.imB.count = 0;
        pool.imB.visible = false;
        pool.imB.instanceMatrix.needsUpdate = true;
      }
    }
  }
  function restoreToppledPoles(): void {
    // felled telegraph poles stand back up (their placement matrices are
    // authoritative in bakedInstances; the topple only ever composed on top)
    if (!poleIM) return;
    let dirty = false;
    for (const c of crushables) {
      if (c.recIdx != null || c.index == null) continue;
      if (!c.toppled) continue;
      c.toppled = false;
      const e = bakedInstances.get('pole');
      if (e && e.list[c.index]) {
        poleIM.setMatrixAt(c.index, e.list[c.index]);
        dirty = true;
      }
    }
    if (dirty) poleIM.instanceMatrix.needsUpdate = true;
    updatePoleLod(lastPoleCamera, true);
  }
  function resetDestructibles(): void {
    crushAnims.length = 0;
    pendingBlasts.length = 0;
    activeLoose.length = 0;
    looseAcc = 0;
    for (const rec of destructibles) restoreDestructibleRecord(rec);
    resetBrokenPools();
    restoreToppledPoles();
    if (utilityNetwork) {
      utilityNetwork.reset();
      rebuildWireSpans();
    }
  }

  return { group, obstacles, colliders, crushables, crushProp, crushDestructible,
    destructibles, looseRecords, updateProps, resetDestructibles, tankWreckSpots, utilityNetwork,
    utilityPolePlacements, decorationGroundingReceipts,
    sourcedTexturesReady,
    getLoosePropStats: () => ({ total: looseRecords.length, active: activeLoose.length }),
    features: { buildings: buildingFeatures, tacticalBeats: tacticalBeatFeatures } };
}
