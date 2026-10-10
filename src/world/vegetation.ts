// src/world/vegetation.ts — instanced vegetation with GPU wind.
// Trees are built from alpha-carded foliage planes (canvas leaf-cluster
// textures) on branched trunks — not cone/blob primitives. Grass is a dense
// camera-centred instanced carpet (cell-cached, deterministic) layered over a
// sparser map-wide midfield scatter.
// Contract: docs/ARCHITECTURE.md §3.2; visuals per docs/research/graphics-aaa.md §8.

import * as THREE from 'three';
import { keepStreams } from './geometryStreams.ts';
import { RAIL_CUTTING_SEED_NORMAL_Y, railCuttingSeedAdmits } from './railSpurs.ts';
import { shapeFarTreeBase } from './farTreeBase.ts';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sampleSplatNoise, applyTone, type HeightField, type TerrainPlacementSampler } from './terrain.ts';
import { setToppleAxis, settledToppleAngle } from './topple.ts';
import { setCircleShape, type CollisionRecord } from './collision.ts';
import { treeRootDecalAreaM2, treeRootDecalRadius } from './treeGrounding.ts';
import { PLAYABLE_HALF_EXTENT_M } from './battlefieldBounds.ts';
import {
  TREE_ARCHETYPES, TREE_GEOMETRY_SCALE, treeTrunkCollisionRadiusM,
  type TreeSpecies,
} from './treeSpecies.ts';
import { isClearOfSpawns } from './spawnClearance.ts';
import { deploymentClearings } from '../sim/matchPlacement.ts';
import { createStructureClearances, excludeStructureVegetation, excludeVegetation, overlapsStructureClearance,
  placedStructureClearances } from './vegetationClearance.ts';
import type { SceneryMapConfig } from './sceneryPlan.ts';
import { compactGroundCoverInstances, type GroundCoverBlocked } from './groundCoverClearance.ts';
import { attachTreeCards, attachTreeLobes } from './treeAttachments.ts';
import { applyCanopyDiffuseWrap } from './canopyLighting.ts'; // round 55: shared with the horizon ring (leaf module)
export { applyCanopyDiffuseWrap };
// Round 77 (2026-09-26): the map's wind and moss (THREE-free), read once per world
import {
  resolveTreeWind, resolveTrunkMoss, TREE_WIND_FLUTTER_M, TREE_WIND_LEAN_M, TREE_WIND_MOBILE_SCALE,
  TREE_WIND_NOMINAL_HEIGHT_M, type TreeWindConfig,
} from './treeClimate.ts';
// Round 77b (2026-09-26): the leaf-scale crown detail (a tiling normal + alpha-break tile per foliage class) and the
// far tier as impostors baked from the near trees
import { createLeafDetailLibrary, LEAF_DETAIL_LAW, LEAF_DETAIL_NORMAL_SCALE } from './leafDetail.ts';
import { createTreeImpostorLibrary, type TreeImpostorLibrary, type TreeImpostorRenderer } from './treeImpostors.ts';
// p2 trees lane (2026-10-01): the grown near trees — skeleton, wood, spray cards and crown shadow hull — and their
// branch-spray atlases
import {
  canopySkyOcclusion, crownLobes, crownSurfaceNormal, emitBranchGeometry, GROWTH_CROWN_SHADING, emitCrownShadowHull, emitLeafCards, growShrubSkeleton, GROWTH_SHRUB_VALUE, growthCardRows, shrubStemSites, GROWTH_CROWN_STEM_WIDTH, growthCrownAttachments,
  growTreeSkeleton, GROWTH_BIRCH_FOOT, GROWTH_CANOPY_AO, GROWTH_TUBE_SIDES, TREE_GROWTH_PROFILES, weldGrownGeometry, type CrownShadowMass, type GrowthSpecies,
} from './treeGrowth.ts';
import { makePalmFrondAtlas, makeSprayAtlas, SHRUB_STEM_TILE, SPRAY_ATLAS_COVERAGE, SPRAY_ATLAS_TILES, type SprayKind } from './treeSprayAtlas.ts';
import type { GroundLitterConfig } from './groundLitter.ts';
import { resolveLandUseProfile, type LandFieldSample } from './landUse.ts';
import {
  insideClearPolygon, plannedSiteClearances, redistributeAuthoredTrees, type AuthoredTreeFeature,
} from './authoredTreePlacement.ts';
import { treeBiomeArid, treeBiomeColour, treeBiomeOpen, treeBiomePalette, treeBiomeShrub, treeBiomeShrubColour, treeBiomeSlot, treeBiomeUpland, treeBiomeWoodSpread, uplandBandOf, uplandZoneAllows, type TreeBiomeSlot } from './treeBiomes.ts';
import { resolveGroundReduxProfile } from './groundRedux.ts';
import { createCraterFollower, createStaticCoverPatcher, followCraters, reseatCraterTrees, restoreCraterTrees, type GroundCoverCraters } from './groundCoverCraters.ts';
import { bendMangroveRoot, shapeMangroveFarStem, relocateTidalMangroves, type TidalMangroveFeature } from './tidalMangrove.ts';
import { DESTRUCTIBLE_BUILDING_TYPES } from './maps/structureKit.ts';
import type { PropsMapConfig } from './props.ts';
// MOBILE r1: central tier texture scale (desktop returns sizes unchanged)
import { getDeviceTier, texSize } from '../engine/quality.ts';
import { applyLodShadowFadeDepth } from '../engine/lodShadowFade.ts';
// trees round 2 (2026-10-03): the grown crowns' dappled shadow
import { applyCrownDappleDepth, CROWN_DAPPLE_ATTRIBUTE, crownDappleTags } from './crownShadowDapple.ts';
import { markShadowOnly, setShadowCasterCascades, setShadowCasterProfile, type ShadowCasterProfile } from '../engine/renderLayers.ts';
import { registerRetainedObject3DResources } from '../engine/resourceLifetime.ts';
import { advanceGrassChunkWork, createGrassChunkWork,
  type GrassChunkWork, type GrassChunkBuffer, type GrassChunkWorkState } from './grassChunkWork.ts';
import { createGrassCarpetWork, advanceGrassCarpetWork,
  type GrassCarpetWorkState } from './grassCarpetWork.ts';

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

interface EngineContext {
  setupShadowMaterial(material: THREE.Material, hook?: MaterialShaderHook | null): void;
  /** p2 trees lane: the scene, whose userData.lightModel (engine/lightModel.ts) drives the leaf transmission. */
  scene?: THREE.Scene | null;
  /** Round 77b: the renderer the far-tier impostor atlas bakes with (production); absent in the receipts. */
  renderer?: TreeImpostorRenderer | null;
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
  /** Leaf-bearing birch/aspen; omitted for the existing bare winter crowns. */
  birchLeaves?: boolean;
  /** Trees lane: a bare form's winter twigs (the map's `vegetation.bare`; set by the grown definitions, never by a map). */
  bare?: boolean;
  /** Trees round 2: the regional form the slot grows as on the desktop tiers (treeBiomes.ts; the map's word wins). */
  form?: GrowthSpecies;
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

interface BirchLimb {
  x: number; y: number; z: number;
  length: number; tilt: number; yaw: number;
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

interface GrassStubblePatch {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  feather: number;
  heightScale: number;
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
  /** environment density pass (2026-09-12): stones, clods and splinters under the camera. */
  litter?: GroundLitterConfig | null;
  bushCount: number;
  bushSpecies: Species;
  grassTexTone: ToneFunction | null;
  tuftTone: ToneFunction | null;
  parks: VegetationDisc[] | null;
  palettes: Partial<Record<Species, VegetationPalette>>;
  avoid: VegetationDisc[] | null;
  belts?: VegetationBelt[];
  /**
   * The map-revival lane (2026-10-06, Kestrel's plantations): rects only the belts plant in — the woodlots, the lone
   * trees, the hedges and the saplings take no site inside one, so a plantation block holds its rows alone.
   */
  standKeepOut?: readonly { x0: number; x1: number; z0: number; z1: number }[];
  /**
   * Trees round 2b: where the map's palms grow (a spring, a wadi bed, an oasis): a palm drawn anywhere else grows as
   * `palmFallback` (default: the map's first other species), so no draw moves.
   */
  palmSites?: readonly VegetationDisc[];
  palmFallback?: Species;
  /**
   * The Redrock lane (2026-10-07, owner: "redrock is really rough"; a tree stood on an inselberg's sheer-walled cap and
   * trees on the jebels' tops): no tree grows on ground higher than this (m, absolute): the wadi's trees keep to its floor.
   * Absent = no ceiling (every other map).
   */
  treeCeilingY?: number;
  /**
   * The Redrock lane (2026-10-07, the coordinator: the walls and domes changed which draws found ground, and the shared
   * stream moved every tree after them — 136 trees in one half against 87 in the other, from 100/102): every candidate
   * of the trees, the saplings and the bushes draws from its own stream, keyed by the map's seed, the placement's kind
   * and the candidate's ordinal, so a site that newly refuses (or admits) a candidate moves no other one. Absent = the
   * shared sequential streams, byte for byte (every other map).
   */
  keyedPlacement?: boolean;
  /**
   * The Redrock lane (2026-10-08, the fairness swap): the point the deployments turn about. The halves either side of it,
   * across the deployments' axis, then hold the same tree and shrub cover: a stand or a lone tree whose seat lies in the
   * playable half that already holds more trees waits for a seat in the other, and once the border's blocks, the
   * saplings and the shrubs have grown (in runs along one half) the short half is evened with lone trees and field
   * shrubs of its own (evenTreeHalves, evenBushHalves). With keyedPlacement, so a seat that waits moves no other
   * candidate. Absent = no balance (every other map).
   */
  coverHalvesAbout?: { x: number; z: number };
  /**
   * The Redrock lane (round 10, 2026-10-08; the gauntlet's wave 270 on Redrock's low sand view: "tall, flat cross-card
   * blades far out of scale", the nearest object a sprite): the map's tufts' height, a factor on every tuft's (a dry
   * tuft stands half as tall again as a green one, and the hyper-arid floor's are all dry). A test on a drawn size, no
   * draw: unset, every map's tufts are as before.
   */
  tuftHeight?: number;
  clusterScrub?: number;
  /**
   * Trees lane (2026-10-06, the coordinator's ruling on the gauntlet's wave 178: "the meadows are peppered with isolated
   * trees and small clumps like a park or savanna ... the ridges should be wooded"): a map's woods follow its landscape.
   * A woodlot's centre stands only on the wood-zone ground — the share `zone` of the square ranked by height and slope
   * (the ridges, their slopes, ground steeper than `slopeDeg`, default 12°) — neighbouring stands may close into one wood
   * (their outlines overlapping by up to `merge` m, default 30), and a wood keeps no thin patches. Every stand keeps its
   * count; the field trees keep the field law; unset, the woods stand as before.
   */
  landscapeWoods?: Readonly<{ zone: number; slopeDeg?: number; merge?: number }>;
  authoredTrees?: AuthoredTreeFeature[];
  /**
   * Trees lane (2026-10-05, Kestrel's dispersal stands): the authored stands may stand inside the settlement rect. The rect
   * and its 24 m margin keep every tree off a map's town, and on Kestrel the rect is the whole plateau. Set, an authored
   * station skips that one test (the avoid discs, the road verge, hardstands and soft ground, the parks, the spawns and
   * the slope still hold) and keeps clear of the map's planned sites (authoredTreePlacement.ts plannedSiteClearances) and
   * of the `clear` polygons it names ([x, z] rings: its aprons, yards or a town plan's lots). A map that leaves it unset
   * is placed exactly as before.
   */
  authoredInSettlement?: { clear?: readonly (readonly (readonly [number, number])[])[] };
  /**
   * Trees lane (2026-10-06, the map lanes' request; Saltmere's Léon bocage first): trees along the map's land-use hedges
   * — the short field boundaries its profile hedges (landUse.ts hedgeShare), read through the CPU twin (landUseAt) —
   * a tree every `spacingM` (jittered ±25 %) in the hedge's band, one field gate of `gateM` left open on every hedged
   * field end, the species drawn from `mix` (the map's own slots; treeBiomes grows them as the place's forms). Ordinary
   * field trees on their own stream, after every other placement: unset, a map is placed exactly as before.
   */
  hedgeTrees?: {
    mix: SpeciesMix; spacingM: number; gateM?: number;
    /**
     * Trees lane (2026-10-07, the gauntlet's wave 205 on Polders: willow rows along the ditches): the lines the trees
     * follow — 'hedge' (the default) the land use's hedges; 'boundary' its fields' own boundaries (the ditches of a
     * ditched region, landUse `boundary` 1), each boundary planted once, from the field on its far side, `offsetM` in from
     * it (default [1.8, 3.4] m: on the bank, clear of the ditch), and only a boundary at least `minLineM` long (default 40:
     * a long side, not a field end).
     */
    along?: 'hedge' | 'boundary';
    offsetM?: readonly [number, number];
    minLineM?: number;
  };
  /**
   * Trees lane (2026-10-07, the gauntlet's wave 205 on Polders: "free-standing trees scattered at random through the
   * ploughed field"): a map's woods keep off its arable land. A woodlot's centre, its trees and its saplings refuse a
   * field's cropped ground (any crop but pasture, inside its grass margin); pasture, the margins and the ground off the
   * field system stay open to them. Unset, the woods stand as before. Census: group.userData.woodsOffArable.
   */
  woodsOffArable?: boolean;
  stubblePatches?: readonly GrassStubblePatch[];
  /** Reuses the willow species/library slots; no fourth material or atlas. */
  willowForm?: 'tidalMangrove';
  /**
   * Trees lane (2026-10-05, the cities lane's Ironworks in March 1945): the map's deciduous broadleaves stand bare —
   * each grows its own trunk, limbs and twigs, its sprays painted as winter twigs in the species' habit (the birch's fine
   * lattice, the oak's crooked twigs and clustered buds, the poplar's straight climbing shoots; BARE_SPRAY_KINDS), at the
   * twigs' grey-brown, their shadow as open as the twigs. A shrub of such a form goes bare too (the buddleia's winter
   * canes under last summer's dry panicles). Conifers and the evergreen broadleaves (olive, holm oak, eucalyptus, the
   * mangrove, the acacia) keep their leaves. The desktop grown builds; the phones keep their cards.
   */
  bare?: boolean;
  /**
   * Trees round 5: the map's own shrub form (a shrub-only growth form: 'broom', 'longleafSeedling', 'buddleia'), over its
   * place's (treeBiomes.ts `shrub`); the desktop grown builds only. The bush slot keeps its records, seeds and mobile look.
   */
  shrubForm?: GrowthSpecies;
  /** p2 trees lane: keep the legacy card trees on this world even on the desktop tiers (the tidal-mangrove receipt's
   * reviewed comparison, same-build A/B through `?legacyTrees=1`). */
  legacyTrees?: boolean;
  tidalTrees?: readonly TidalMangroveFeature[];
}

export interface VegetationMapConfig extends Pick<PropsMapConfig, 'props'>, TreeWindConfig {
  vegetation?: Partial<VegetationConfig>;
}

interface BuildYield {
  stage: string;
  fine?: boolean;
  rowEnd?: boolean;
}

interface VegetationBuildDetail {
  [stage: string]: number | Array<{ stage: string; ms: number }>;
  sliceCount: number;
  maxSliceMs: number;
  slowest: Array<{ stage: string; ms: number }>;
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
  /**
   * Trees round 3: a closed wood's interior tree takes the far tier nearer (this share of the full-detail radius): the
   * wood's edge stands in front of it, and round 3's closed woods doubled the near tier's trees in a wooded view.
   */
  nearScale?: number;
  /**
   * Trees round 5: the tree grew inside a wood (a closed wood's stand, the border's woods, a stand's saplings) — on a
   * map whose woods close, its species' forest-grown near variants (assignTreeForms); a field tree keeps the open form.
   */
  wood?: boolean;
  /** Trees lane (2026-10-06): one of a map's hedge trees (vegetation.hedgeTrees, plantHedgeTrees). */
  hedgeRow?: boolean;
  /** Ground lane (crater-render-spec §C): the placement before a crater re-seated the trunk (base + offsetAt). */
  craterBase?: THREE.Matrix4;
  /** Trees round 5: one of the field trees (placeLoneTrees), the field law's (addFieldTree). */
  field?: boolean;
}

export interface TreeObstacle extends CollisionRecord {
  treeIdx: number;
  _pressS?: number;
  _pressT?: number;
}

interface ConcealmentDisc extends VegetationDisc {
  add: number;
}

interface VegetationGrassWorkState {
  total: number;
  built: number;
  pendingVisible: number;
  pendingAhead: number;
  cameraUnknown: number;
  active: (GrassChunkWorkState & { chunkX: number; chunkZ: number }) | null;
  carpet: GrassCarpetWorkState;
  disposed: boolean;
}

export interface VegetationRuntime {
  group: THREE.Group;
  /** Cancel CPU-only streaming before the world resource owner evicts meshes. */
  dispose(): void;
  /** Checkpoint-only accounting; never force-drains unfinished visible grass. */
  getGrassWorkState(): VegetationGrassWorkState;
  setGroundCoverClearance(blocked: GroundCoverBlocked): void;
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
  /** Fell a trunk toward (dx, dz); `settled` lays it at its final pose at once (state that fell before this viewer looked). */
  crushTree(record: TreeObstacle, dx: number, dz: number, settled?: boolean): boolean;
  resetToppled(): void;
  /** Step only the felled trunks' falls by `dt` (update runs them; the Scene Studio runs them on its timeline). */
  advanceToppled(dt: number): void;
  _clusters: VegetationDisc[];
  /** Trees round 2: the fraction of a stand's own outline a point stands at (the receipts' woodlot law). */
  _standOutline(index: number, x: number, z: number): number;
  /** Round 77b: the rim-forest blocks as discs (their understorey's stands) and the impostor library (null: lobes). */
  _rimBlocks: VegetationDisc[];
  _treeImpostors: TreeImpostorLibrary | null;
  /** Round 77c: the map's rim species mix and the rim trees' mean height (instance height scale × the near
   * geometry's height, metres; 0 without an impostor library) — the ring forest's impostors take both
   * (horizonForestImpostors.ts). */
  _rimMix: SpeciesMix;
  _rimTreeHeightM: number;
  /** Round 77c: the rim trees' mean instance tint (linear r, g, b) — the ring's impostors take it, so the forest over
   * the red line is as dark as the rim (the ring's own tones average 0.99; the battlefield's value jitter and stand
   * shade average well under 1). */
  _rimTreeTint: readonly [number, number, number];
  /** Round 77c: bake the far tier's impostor atlas now (the covered activation warm), so no presented frame pays
   * for it; true when an atlas is baked after the call, false without a library (mobile, the receipts). */
  warmImpostors(): boolean;
  /** Round 77b: the placed tree records, read-only, for the receipts' slot audits. */
  _trees: ReadonlyArray<Readonly<{ x: number; z: number; species: Species; variant: number; fv: number; near: boolean; slot: number; fslot: number }>>;
  _buildDetail?: VegetationBuildDetail;
  /** Ground lane (2026-10-03): the canopy's cover over the square (0..1, a 256² grid of 4 m texels, row-major z then
   * x, texel centres at -512 + (i + 0.5) × 4) — the terrain draws a forest floor under it and no field, the ground
   * tiers thin under it. Built once from the final tree records. */
  _woodsMask: Float32Array;
  /**
   * Ground lane (crater-render-spec §C): follow the battle's craters — the grass chunks', bushes' and understorey's
   * instances in a crater's cleared bowl are hidden and the rest re-seated on base + offsetAt, the carpet rebuilds with
   * the same law, standing trees root into the bowl's wall (map.ts calls this once a frame after the terrain's sync).
   */
  followCraters(law: GroundCoverCraters): void;
}

interface GarageTreeKit {
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

interface GarageTreeGeometryBuild {
  readonly trunk: THREE.BufferGeometry;
  readonly foliage: THREE.BufferGeometry;
  readonly foliageTexture: THREE.Texture | null;
  /** The grown trunk's bark sheet (its styled UVs read the four styles); the round-8 garage trunks paint none. */
  readonly bark?: { readonly albedo: THREE.Texture; readonly normal: THREE.Texture };
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

// the shaded sward's light (a copy of tallGrass.ts SHADED_SWARD_GLSL; tallGrass.selftest pins them equal)
const SHADED_SWARD_GLSL = /* glsl */ `{ vec3 cotAlb = max( material.diffuseColor, vec3( 1e-4 ) ); vec3 cotIrr = reflectedLight.indirectDiffuse / cotAlb; float cotL = dot( cotIrr, vec3( 0.2126, 0.7152, 0.0722 ) );
#ifdef COT_SUN_VIS_CAPTURED
float cotShade = 1.0 - clamp( cotSunVis, 0.0, 1.0 );
#else
float cotShade = 1.0;
#endif
reflectedLight.indirectDiffuse = mix( cotIrr, vec3( cotL ) * vec3( 1.05, 1.0, 0.86 ), 0.75 * cotShade ) * cotAlb; }`;
const HALF = 512;
const CHUNKS = 8, CHUNK_SIZE = 128;
// Performance pass: terrain splat/detail already carries the meadow at range;
// rendering hundreds of thousands of alpha-tested blade cards on top made the
// field look noisy and consumed most of the battle's triangle/overdraw budget.
// Keep readable tufts around the vehicle, then hand off gradually to terrain.
const GRASS_PER_CHUNK = 12000;         // sparse, map-wide midfield scatter
const GRASS_FADE_END = 320;            // broad, gradual handoff to the terrain meadow
const CARPET_CELL = 16;
const CARPET_RING = 3;                 // 49 cached cells, coverage to ±56 m
const CARPET_PER_CELL = 420;           // filters thin this to a natural sward
const CARPET_FAR = 48;                 // circular fade hides the square cell edge
const CARPET_CAP = 14000;              // hard upload/raster ceiling per variant
// Round 78 (the performance lane): the full-detail radius 260 / 290 → 200 / 230 m. The far tier is the near tree's
// own bake since round 77b (`treeImpostors.ts`), so the switch is the same crown at a smaller size: at the chase pose
// the trees behind a village 150–250 m out read identically at 260 and 200 m under 3 × magnification, 160 m shows
// flatter crowns; the near tier (trunks, cards, whorls, crown shadow proxies) is the whole triangle budget — verdant
// 6.95 → 6.06 M at chase (under the 7 M gate), fjord 9.39 → 8.03 M, each 100 m of radius ~0.8–1.2 M. The mobile
// tier already stood at 200 / 225. `?treeNear=<m>` below is the same-build A/B.
const TREE_NEAR_IN = 200, TREE_NEAR_OUT = 230; // hysteresis band (full-detail radius)
// Round 77b: the rim-forest understorey — the stands' shrub law scaled to the rim trees (1.35–2.2 against the
// interior 0.95–1.7: the ratio of the two ranges' means) and bounded by the rim's own extent
const RIM_UNDERSTOREY_SCALE = 1.4;
const RIM_UNDERSTOREY_BOUND_M = 506;
// Round 78 (the performance lane): the shrubs cast into the cascades whose texels can carry them and no further —
// the bushes (1.5–2.5 m) into the three near cascades (to ~300 m on the desktop presets, where a bush is six pixels
// tall), the understorey (young growth under 1.6 m, pure dressing) into the two nearest (to ~180 m). Every other
// cascade pass skips them entirely (renderLayers.setShadowCasterCascades); the field trees are unchanged.
/** p2 trees lane: the gust's share of a crown's albedo (the leaves a gust turns over catch more sky). */
const TREE_WIND_LEAF_FLASH = 0.11;
const BUSH_SHADOW_CASCADES = 0b0111;
const UNDERSTOREY_SHADOW_CASCADES = 0b0011;

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
// These legacy palettes specify LINEAR reflectance, not display HSL. Encode
// once for Canvas; SRGBColorSpace on the atlas decodes it once when sampled.
function css(h: number, s: number, l: number): string {
  _cc.setHSL(h, s, l, THREE.LinearSRGBColorSpace);
  return _cc.getStyle(THREE.SRGBColorSpace);
}

function finishAlphaPixels(
  c: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  floodR: number,
  floodG: number,
  floodB: number,
  radialFalloff = false,
  tone: ToneFunction | null = null,
): ImageData {
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
  return id;
}

function finishAlphaTexture(
  c: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  floodR: number,
  floodG: number,
  floodB: number,
  radialFalloff = false,
  tone: ToneFunction | null = null,
): THREE.Texture {
  const id = finishAlphaPixels(c, ctx, floodR, floodG, floodB, radialFalloff, tone);
  // Preserve the same straight-alpha edge padding as grass. A Canvas
  // round-trip would discard RGB wherever radial falloff makes alpha zero.
  const t = new THREE.Texture(id);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// r2 terrain_environment: procedural bark sheet — vertical fissure striation
// albedo + matching normal map shared by every trunk/branch material. The
// untextured vertex-tinted cylinders were the "branchless faceted prism"
// tell: with a striated map + normal relief the trunks read as bark at
// gameplay range. U wraps the trunk circumference (texture wraps in x);
// The last 16 columns are neutral snow: opaque snow loads share this material
// bucket, but must never inherit bark fissures or their tangent-space normals.
const TREE_SURFACE_SIZE = 256;
const TREE_BARK_COLUMNS = 240;
// p2 trees lane (2026-10-01): the bark sheet carries four styles side by side, each a 256-column block (240 bark
// columns + a 16-column gutter): 0 the furrowed sheet above (its exact painting stream; the snow strip in its gutter),
// 1 the scaly plates of a pine or spruce, 2 the smooth mottled bark of a eucalyptus or fir, 3 the papery lenticelled
// white of a birch or aspen. The grown trees (treeGrowth.ts) select a style through their u (2 + 2 × style + the
// fraction round the stem); every legacy builder's u in [0, 1] stays on style 0 and the snow's -1 on the strip.
// Trees round 4 (2026-10-04): 4 the grown trees' furrowed bark (paintMeanderingFurrows; style 0 keeps the legacy
// sheet's pixels for the phones and the legacy builders).
const TREE_BARK_STYLES = 5;
const TREE_BARK_ATLAS_WIDTH = TREE_SURFACE_SIZE * TREE_BARK_STYLES;
function _nrmFromHeight(h: Float32Array, s: number, strength: number, w = s): THREE.CanvasTexture {
  const px = new Uint8ClampedArray(w * s * 4);
  const H = (x: number, y: number): number => h[((y + s) % s) * w + ((x + w) % w)];
  const v = new THREE.Vector3();
  for (let y = 0; y < s; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
    v.set(-dx * strength, dy * strength, 1).normalize(); // (the canvas uploads flipped: green −∂h/∂v = +∂h/∂row, as proceduralTexture.ts)
    const i = (y * w + x) * 4;
    px[i] = v.x * 127.5 + 127.5; px[i + 1] = v.y * 127.5 + 127.5; px[i + 2] = v.z * 127.5 + 127.5; px[i + 3] = 255;
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = s;
  context2d(c).putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, w, s), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function makeBarkTexture(seed: number, styles = TREE_BARK_STYLES): {
  albedo: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  meanReflectance: number;
  width: number;
} {
  // p2 trees lane: only the grown trees read styles 1–3 — a legacy build (the phones, `?legacyTrees=1`) keeps the
  // single 256-column sheet it always had
  const s = TREE_SURFACE_SIZE, W = TREE_SURFACE_SIZE * styles;
  const rng = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = W; c.height = s;
  const ctx = context2d(c, { willReadFrequently: true });
  ctx.save();
  // the furrowed sheet paints into its own 256 columns exactly as on the single sheet (whose canvas edge clipped it
  // there): its pixels, its mean reflectance and the legacy trunks' compensation stay byte-identical, and no stroke
  // reaches the next style's block
  ctx.beginPath();
  ctx.rect(0, 0, s, s);
  ctx.clip();
  ctx.scale(TREE_BARK_COLUMNS / s, 1);
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
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(TREE_BARK_COLUMNS, 0, s - TREE_BARK_COLUMNS, s);
  if (styles > 1) paintBarkStyles(ctx, mulberry32((seed ^ 0xba4c) >>> 0), s);
  const id = ctx.getImageData(0, 0, W, s);
  const hgt = new Float32Array(W * s);
  const linear = new Float32Array(256);
  for (let value = 0; value < 256; value++) {
    _cc.setRGB(value / 255, value / 255, value / 255, THREE.SRGBColorSpace);
    linear[value] = _cc.r;
  }
  let sumReflectance = 0;
  for (let i = 0; i < W * s; i++) {
    hgt[i] = (id.data[i * 4] * 0.5 + id.data[i * 4 + 1] * 0.35 + id.data[i * 4 + 2] * 0.15) / 255;
    if (i % W < TREE_BARK_COLUMNS) {
      sumReflectance += linear[id.data[i * 4]] * 0.2126
        + linear[id.data[i * 4 + 1]] * 0.7152 + linear[id.data[i * 4 + 2]] * 0.0722;
    }
  }
  const albedo = new THREE.CanvasTexture(c);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
  albedo.anisotropy = 8;
  return {
    albedo,
    normal: _nrmFromHeight(hgt, s, 2.2, W),
    meanReflectance: sumReflectance / (TREE_BARK_COLUMNS * s),
    width: W,
  };
}

/**
 * p2 trees lane: bark styles 1–3 beside the furrowed sheet (style 0), each painted wrapped into its own 240 columns
 * (the strokes repeat at ±240 so the stem's seam tiles) with its 16-column gutter a copy of its first columns.
 */
function paintBarkStyles(ctx: CanvasRenderingContext2D, rng: RandomSource, s: number): void {
  const B = TREE_BARK_COLUMNS;
  const wrapped = (style: number, draw: (offset: number) => void): void => {
    ctx.save();
    ctx.translate(style * s, 0);
    ctx.beginPath(); ctx.rect(0, 0, B, s); ctx.clip();
    for (const offset of [-B, 0, B]) draw(offset);
    ctx.restore();
  };
  // 1 — scaly plates: irregular plates in staggered, overlapping runs, split by dark fissures (pine, spruce; the vertex
  // tint warms a pine's upper stem). Trees round 2 (2026-10-03): round 1 laid fourteen columns of flat four-cornered
  // plates end to end, which a close view of a pine read as stacked bricks; now each plate is a jagged six-cornered scale
  // of its own size, its seat jittered off any column, lit along its top edge and shaded under it, with a flake or two
  // down its face, and the smaller scales lie over the larger. No inner highlight: the normal map's relief lights the
  // plates' edges
  ctx.save(); ctx.translate(s, 0); ctx.fillStyle = '#3e3530'; ctx.fillRect(0, 0, B, s); ctx.restore();
  const plates: Array<{ x: number; y: number; w: number; h: number; l: number; sat: number; pts: number[]; flakes: number[] }> = [];
  for (let k = 0; k < 340; k++) {
    const w = 10 + rng() * 16, h = 18 + rng() * 32;
    const pts: number[] = [];
    for (let v = 0; v < 6; v++) {
      const a = (v / 6) * Math.PI * 2 + (rng() - 0.5) * 0.5;
      pts.push(Math.cos(a) * w * (0.42 + rng() * 0.14), Math.sin(a) * h * (0.42 + rng() * 0.12));
    }
    const flakes: number[] = [];
    for (let f = 0, n = rng() < 0.6 ? 1 : 2; f < n; f++) flakes.push((rng() - 0.5) * w * 0.6, (rng() - 0.5) * 0.5, rng() * 0.6 + 0.3);
    plates.push({ x: rng() * B, y: rng() * s, w, h, l: 0.46 + rng() * 0.26, sat: rng(), pts, flakes });
  }
  plates.sort((a, b) => b.w * b.h - a.w * a.h);
  wrapped(1, (offset) => {
    for (const plate of plates) {
      for (const dy of [-s, 0, s]) {
        if (plate.y + dy < -plate.h || plate.y + dy > s + plate.h) continue;
        const cx = plate.x + offset, cy = plate.y + dy;
        ctx.beginPath();
        for (let v = 0; v < 6; v++) {
          const px = cx + plate.pts[v * 2], py = cy + plate.pts[v * 2 + 1];
          if (v === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        const grad = ctx.createLinearGradient(cx, cy - plate.h * 0.5, cx, cy + plate.h * 0.5);
        _cc.setHSL(0.065 + plate.l * 0.02, 0.15 + plate.sat * 0.06, plate.l * 0.66);
        grad.addColorStop(0, _cc.getStyle());
        _cc.setHSL(0.065 + plate.l * 0.02, 0.15 + plate.sat * 0.06, plate.l * 0.48);
        grad.addColorStop(1, _cc.getStyle());
        ctx.fillStyle = grad;
        ctx.fill();
        // a flake or two down the scale's face
        ctx.strokeStyle = 'rgba(40,32,28,0.5)';
        ctx.lineWidth = 0.8;
        for (let f = 0; f < plate.flakes.length; f += 3) {
          const fx = cx + plate.flakes[f], lean = plate.flakes[f + 1], len = plate.h * plate.flakes[f + 2];
          ctx.beginPath(); ctx.moveTo(fx, cy - len * 0.5); ctx.lineTo(fx + lean * len * 0.3, cy + len * 0.5); ctx.stroke();
        }
      }
    }
  });
  // 2 — smooth: pale grey-buff with soft peeling patches and fine horizontal lenticels (eucalyptus, fir)
  ctx.save(); ctx.translate(2 * s, 0); ctx.fillStyle = '#a8a294'; ctx.fillRect(0, 0, B, s); ctx.restore();
  const patches: Array<[number, number, number, number, number]> = [];
  for (let k = 0; k < 40; k++) patches.push([rng() * B, rng() * s, 14 + rng() * 40, 20 + rng() * 60, rng()]);
  const marks: Array<[number, number, number]> = [];
  for (let k = 0; k < 90; k++) marks.push([rng() * B, rng() * s, 3 + rng() * 9]);
  wrapped(2, (offset) => {
    for (const [x, y, w, h, t] of patches) {
      _cc.setHSL(0.09 + t * 0.04, 0.10 + t * 0.10, 0.50 + (t - 0.5) * 0.22);
      ctx.fillStyle = _cc.getStyle();
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.ellipse(x + offset, y, w * 0.5, h * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#6e685e';
    for (const [x, y, w] of marks) ctx.fillRect(x + offset, y, w, 1.2);
    ctx.globalAlpha = 1;
  });
  // 3 — papery white: chalky base, dark horizontal lenticel dashes, dark lozenge scars (birch, aspen)
  ctx.save(); ctx.translate(3 * s, 0); ctx.fillStyle = '#e6e3dc'; ctx.fillRect(0, 0, B, s); ctx.restore();
  const dashes: Array<[number, number, number, number]> = [];
  for (let k = 0; k < 150; k++) dashes.push([rng() * B, rng() * s, 4 + rng() * 22, 0.8 + rng() * 1.8]);
  const scars: Array<[number, number, number]> = [];
  for (let k = 0; k < 9; k++) scars.push([rng() * B, rng() * s, 6 + rng() * 12]);
  wrapped(3, (offset) => {
    ctx.fillStyle = '#c9c4ba';
    ctx.globalAlpha = 0.5;
    for (let k = 0; k < 24; k++) ctx.fillRect(((k * 53) % B) + offset, (k * 97) % s, 30, 8);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#2e2a28';
    for (const [x, y, w, h] of dashes) ctx.fillRect(x + offset, y, w, h);
    for (const [x, y, r] of scars) {
      ctx.beginPath();
      ctx.moveTo(x + offset - r, y); ctx.lineTo(x + offset, y - r * 0.45); ctx.lineTo(x + offset + r, y); ctx.lineTo(x + offset, y + r * 0.45);
      ctx.closePath(); ctx.fill();
    }
    // trees round 4 (the gauntlet's wave 51: the birch trunks "cardboard-like"): the bark's own grain — long thin
    // lenticel bands in loose rows, short paired dashes, grey hairline cracks running across, a few dark fissured
    // lozenges with a pale lip — drawn from a stream of their own, so the sheet's other styles keep their draws
    const grain = mulberry32(0xb1c4);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = '#3a3532';
    for (let k = 0; k < 34; k++) {
      const x = grain() * B, y = grain() * s, w = 18 + grain() * 46, h = 0.7 + grain() * 1.1;
      ctx.fillRect(x + offset, y, w, h);
      if (grain() < 0.5) ctx.fillRect(x + offset + w * (0.2 + grain() * 0.5), y + h + 1.5 + grain() * 2, w * 0.35, h * 0.8);
    }
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#8f877d';
    ctx.lineWidth = 0.7;
    for (let k = 0; k < 40; k++) {
      const x = grain() * B, y = grain() * s, len = 8 + grain() * 26;
      ctx.beginPath(); ctx.moveTo(x + offset, y); ctx.lineTo(x + offset + len, y + (grain() - 0.5) * 3); ctx.stroke();
    }
    ctx.globalAlpha = 0.85;
    for (let k = 0; k < 3; k++) {
      const x = grain() * B, y = grain() * s, r = 8 + grain() * 10;
      ctx.fillStyle = '#d8d3ca';
      ctx.beginPath(); ctx.ellipse(x + offset, y, r * 1.25, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#26221f';
      ctx.beginPath();
      ctx.moveTo(x + offset - r, y); ctx.lineTo(x + offset, y - r * 0.5); ctx.lineTo(x + offset + r, y); ctx.lineTo(x + offset, y + r * 0.5);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    paintBirchFarMarks(ctx, offset, B, s);
  });
  paintMeanderingFurrows(ctx, rng, s);
  // the gutters of styles 1–4 continue their first columns (filtering across the stem's seam stays continuous)
  for (let style = 1; style < TREE_BARK_STYLES; style++) {
    ctx.drawImage(ctx.canvas, style * s, 0, s - B, s, style * s + B, 0, s - B, s);
  }
}

/**
 * Trees round 5 (2026-10-05, the gauntlet's wave 98: Frontier's birches "uniformly white, bark-less trunks", "paper-thin
 * with zero bark texture at this distance"): the marks a birch's stem shows from across a field — its lenticel dashes
 * and grain are a few centimetres and average to white by the fourth mip (a texel there is ~6 cm at 50 m) — the black
 * horizontal bands where the bark has cracked across, ragged-edged, each a sixth to two fifths of the way round the
 * stem and a few centimetres tall, some broken in two, and the dark chevrons under shed branches; about a tenth of the
 * bark, from a stream of their own (the sheet's other styles keep their draws), each drawn again a sheet's height above
 * and below so the bark tiles down the stem.
 */
function paintBirchFarMarks(ctx: CanvasRenderingContext2D, offset: number, B: number, s: number): void {
  const far = mulberry32(0xb17c4);
  ctx.fillStyle = '#1f1b19';
  const blot = (cx: number, cy: number, w: number, h: number, alpha: number): void => {
    // a band's piece: long across the stem, pinched at its ends, its edges rippled by three slow waves (never spiky)
    const p1 = far() * 6.283, p2 = far() * 6.283, p3 = far() * 6.283, skew = (far() - 0.5) * 0.25, n = 24, pts: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const rx = w * 0.5 * (1 + 0.1 * Math.sin(2 * a + p1));
      const ry = h * 0.5 * Math.pow(Math.abs(sn), 0.6) * (1 + 0.3 * Math.sin(3 * a + p2) + 0.18 * Math.sin(5 * a + p3));
      pts.push(c * rx, sn * ry + c * rx * skew);
    }
    ctx.globalAlpha = alpha;
    for (const dy of [-s, 0, s]) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const px = cx + offset + pts[i * 2], py = cy + dy + pts[i * 2 + 1];
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    }
  };
  for (let k = 0; k < 9; k++) {
    const x = far() * B, y = far() * s, w = 36 + far() * 60, h = 6 + far() * 8, dark = 0.75 + far() * 0.2;
    if (far() < 0.4) {
      // broken in two across the stem
      const split = 0.35 + far() * 0.3;
      blot(x - w * (1 - split) * 0.5 - 1.5, y, w * split, h, dark);
      blot(x + w * split * 0.5 + 1.5, y + (far() - 0.5) * h * 0.5, w * (1 - split), h * (0.7 + far() * 0.4), dark);
    } else blot(x, y, w, h, dark);
  }
  for (let k = 0; k < 4; k++) {
    // a shed branch's scar: a broad dark chevron opening up the stem, thickest at its point
    const x = far() * B, y = far() * s, w = 30 + far() * 26, h = w * (0.22 + far() * 0.1), lean = (far() - 0.5) * 0.25 * w;
    const arm = 0.2 + far() * 0.06;
    ctx.globalAlpha = 0.85;
    for (const dy of [-s, 0, s]) {
      ctx.beginPath();
      ctx.moveTo(x + offset - w * 0.5, y + dy - h * 0.5);
      ctx.quadraticCurveTo(x + offset + lean - w * 0.2, y + dy + h * 0.2, x + offset + lean, y + dy + h * 0.5);
      ctx.quadraticCurveTo(x + offset + lean + w * 0.2, y + dy + h * 0.2, x + offset + w * 0.5, y + dy - h * 0.5);
      ctx.lineTo(x + offset + w * (0.5 - arm), y + dy - h * 0.5);
      ctx.quadraticCurveTo(x + offset + lean + w * 0.1, y + dy - h * 0.1, x + offset + lean, y + dy + h * 0.02);
      ctx.quadraticCurveTo(x + offset + lean - w * 0.1, y + dy - h * 0.1, x + offset - w * (0.5 - arm), y + dy - h * 0.5);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Trees round 4 (2026-10-04, the gauntlet's wave 46 on Saltwind's olive: "a repeating tyre-tread chevron bark
 * texture"): style 4, the grown trees' furrowed bark. Style 0 laid thirty fissures down the sheet, each jittered point
 * by point (a fresh phase every 12 px), so the furrows ran as parallel zigzags: a tread. Here the ridges wander as one
 * field — nine ridges round the stem, their courses warped by a few smooth waves of whole periods (so the sheet tiles
 * both ways) that vary across the stem as well as down it, so no two furrows run parallel; a second, finer ridge set
 * interferes with the first where the ridges merge and split, and each ridge breaks across at its own cracks into
 * plates. Painted texel by texel into its 240 columns; its mean reflectance is held to style 0's, so a grown trunk's
 * tint keeps its calibration.
 */
function paintMeanderingFurrows(ctx: CanvasRenderingContext2D, rng: RandomSource, s: number): void {
  const B = TREE_BARK_COLUMNS, style = 4, ridges = 9;
  // a periodic value noise (a lattice of n × n cells over the sheet, smoothly interpolated): the sheet tiles both ways
  const lattice = (n: number): ((u: number, v: number) => number) => {
    const g = Array.from({ length: n * n }, () => rng());
    return (u: number, v: number): number => {
      const x = (((u % 1) + 1) % 1) * n, y = (((v % 1) + 1) % 1) * n;
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const at = (i: number, j: number): number => g[((j + n) % n) * n + ((i + n) % n)];
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    };
  };
  const wander1 = lattice(3), wander2 = lattice(6), wander3 = lattice(12), widthN = lattice(5), plateN = lattice(9);
  // each ridge's cracks: two to five across it at their own heights, each crossing part of it
  const cracks = Array.from({ length: ridges }, () => Array.from({ length: 2 + ((rng() * 4) | 0) },
    () => ({ v: rng(), a: rng() * 0.35, b: 0.55 + rng() * 0.45, w: 0.008 + rng() * 0.014 })));
  const height = new Float32Array(B * s);
  let sum = 0;
  for (let y = 0; y < s; y++) for (let x = 0; x < B; x++) {
    const u = x / B, v = y / s;
    // the courses wander as one field, its waves as varied across the stem as down it: no two furrows parallel
    const warp = 0.075 * (wander1(u, v) - 0.5) + 0.045 * (wander2(u, v * 2) - 0.5) + 0.02 * (wander3(u * 2, v * 3) - 0.5);
    const f = (u + warp) * ridges, i = ((Math.floor(f) % ridges) + ridges) % ridges, q = f - Math.floor(f);
    // a ridge's breadth wanders too (where two furrows close, the ridges between them merge)
    const sharp = 0.35 + 0.6 * widthN(u * 2 + warp, v);
    let h = Math.pow(Math.sin(Math.PI * q), sharp);
    // plates: the ridge's face rises and falls along it
    h *= 0.78 + 0.22 * plateN(u + warp * 0.5, v * 2);
    for (const c of cracks[i]) {
      let dv = Math.abs(v - c.v); dv = Math.min(dv, 1 - dv);
      if (dv < c.w && q > c.a && q < c.b) h *= 0.3 + 0.7 * (dv / c.w);
    }
    height[y * B + x] = h;
    sum += h;
  }
  // the furrows dark, the ridges' tops pale, in linear light about style 0's own mean reflectance (its 240 columns as
  // painted above), so a grown trunk's tint, authored against the furrowed sheet, keeps its value
  const mean = sum / (B * s);
  const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const toSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
  const sheet = ctx.getImageData(0, 0, B, s).data;
  let target = 0;
  for (let i = 0; i < B * s; i++) {
    target += toLinear(sheet[i * 4] / 255) * 0.2126 + toLinear(sheet[i * 4 + 1] / 255) * 0.7152 + toLinear(sheet[i * 4 + 2] / 255) * 0.0722;
  }
  target /= B * s;
  const image = ctx.createImageData(B, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < B; x++) {
    const L = target * (0.35 + 0.65 * height[y * B + x] / Math.max(1e-3, mean));
    const i = (y * B + x) * 4;
    image.data[i] = toSrgb(Math.min(1, L * 1.04)) * 255; image.data[i + 1] = toSrgb(Math.min(1, L)) * 255;
    image.data[i + 2] = toSrgb(Math.min(1, L * 0.93)) * 255; image.data[i + 3] = 255;
  }
  ctx.putImageData(image, style * s, 0);
}

// Two tuft variants: 0 = lush meadow tuft, 1 = drier mixed tuft. Dense at the
// root line, ragged at the top so minified mips fade the card edges instead of
// exposing a translucent rectangle.
export function makeGrassCardTexture(
  rng: RandomSource,
  variant: number,
  tone: ToneFunction | null = null,
): THREE.Texture {
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
    // (ground lane, wave 87: "a crisp dark X-shaped mark on the ground … a leftover editor or debug marker") a sparse dry
    // card spread its blades' bases over its whole width, so its densest band — the one that survives the alpha test at
    // range — was a horizontal stripe low on the card, and a lone dry tuft's two crossed cards drew two crossed stripes on
    // bare soil (the cards' roots and a squashed tuft were ruled out in the lab: neither a faded foot nor a sunk card moved
    // the mark). A dry tuft is a tuft: its blades rise from the card's middle third and fan out, so at range it is a narrow
    // dense foot under a spreading crown; the meadow's card keeps its strip of sward
    const bu = rng();
    const bx = variant === 0 ? 4 + bu * (s - 8) : s * 0.5 + (bu - 0.5) * 0.34 * s;
    // Each metre-wide card holds a sward, not a cluster of broad spear leaves.
    // Ground cover 2026-09-12: 70 % of the 1049e4e blade width (2.1-4.9 px on
    // the 128 px card, was 1.35-3.15). The 45 % blades were too thin to
    // survive their own mips: past 60 m the tufts alpha-tested away and every
    // pasture read as a bare sheet where the reference showed dark turf.
    const bw = 2.1 + rng() * 2.8;
    const tall = rng();
    const tipY = s - (0.35 + 0.62 * tall) * s;
    const lean = rng() - 0.5;
    const tipX = variant === 0 ? bx + lean * 45 : Math.min(s - 3, Math.max(3, bx + (bx - s * 0.5) * 1.2 + lean * 0.5 * (s - tipY)));
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
      // (ground lane, wave 87: "pale, colorless specks … at a uniform size and density") the pale accents a cream at the
      // grass's own value, not paper white
      ctx.fillStyle = warm ? css(0.13, 0.75, 0.62) : css(0.13, 0.32, 0.64);
      for (let p = 0; p < 4; p++) {
        ctx.beginPath();
        ctx.arc(fx + (rng() - 0.5) * 3, fy + (rng() - 0.5) * 2, 0.7 + rng() * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // Keep straight-alpha padding in ImageData. Writing it back through Canvas
  // premultiplies RGB by zero alpha, turning the padded texels black again.
  // ImageData is a native TexImageSource: the same flip/filter/mip policy
  // uploads this existing pixel buffer without retaining a second canvas.
  const pixels = finishAlphaPixels(c, ctx, 74, 88, 42, false, tone);
  const texture = new THREE.Texture(pixels);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function broadleafBladePath(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.beginPath();
  ctx.moveTo(-width, 0);
  ctx.quadraticCurveTo(-width * 0.12, -height * 2.2, width, 0);
  ctx.quadraticCurveTo(width * 0.28, height * 2.0, -width, 0);
  ctx.closePath();
}

function paintBroadleafBlade(
  ctx: CanvasRenderingContext2D, rng: RandomSource,
  width: number, height: number, hue: number, sat: number, lightness: number,
  sun: number, pixelScale: number,
): void {
  const value = lightness * (0.74 + rng() * 0.60);
  ctx.fillStyle = css(hue + (rng() - 0.5) * 0.022, sat, value);
  broadleafBladePath(ctx, width, height);
  ctx.fill();
  if (rng() < 0.6) {
    ctx.fillStyle = css(hue - 0.008, sat * 0.95, Math.min(0.42, value + 0.045 + sun * 0.025));
    ctx.beginPath();
    ctx.moveTo(-width * 0.78, 0);
    ctx.quadraticCurveTo(-width * 0.10, -height * 1.65, width * 0.84, 0);
    ctx.quadraticCurveTo(width * 0.15, -height * 0.16, -width * 0.78, 0);
    ctx.fill();
  }
  if (rng() < 0.55) {
    ctx.strokeStyle = css(hue + 0.01, sat * 0.9, value * 0.55);
    ctx.lineWidth = 0.45 * pixelScale;
    ctx.beginPath();
    ctx.moveTo(-width, 0);
    ctx.lineTo(width * 0.82, 0);
    ctx.stroke();
  }
}

// Each existing clump becomes one short leaf-bearing branchlet. Keep the
// full radial canopy footprint: long whole-card fans left near trees hollow.
function paintBroadleafBranchlet(
  ctx: CanvasRenderingContext2D, rng: RandomSource,
  x: number, y: number, direction: number, size: number,
  hue: number, sat: number, lightness: number, sun: number, pixelScale: number,
): void {
  const reach = (9 + rng() * 8) * pixelScale * size;
  const count = 6 + (rng() * 7) | 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(direction);
  ctx.strokeStyle = css(hue + 0.02, sat * 0.65, lightness * 0.70);
  ctx.lineWidth = 0.65 * pixelScale;
  ctx.beginPath();
  ctx.moveTo(-reach, 0);
  ctx.lineTo(reach, 0);
  ctx.stroke();
  for (let leaf = 0; leaf < count; leaf++) {
    const alongJitter = rng() - 0.5, angleJitter = rng() - 0.5;
    const width = (3.6 + rng() * 5.2) * size * pixelScale * 0.72;
    const height = (2.2 + rng() * 3.1) * size * pixelScale * 0.72;
    const side = leaf % 2 ? 1 : -1;
    const angle = side * (0.68 + rng() * 0.68) + angleJitter * 0.22;
    const station = (leaf / (count - 1) - 0.5) * reach * 1.65 + alongJitter * pixelScale * 2;
    ctx.save();
    ctx.translate(station, 0);
    ctx.rotate(angle);
    ctx.translate(width, 0); // The pointed base attaches to the actual twig.
    paintBroadleafBlade(ctx, rng, width, height, hue, sat, lightness, sun, pixelScale);
    ctx.restore();
  }
  ctx.restore();
}

// Same species-owned atlas and 115-clump distribution, but negative space
// comes from pointed leaves on short twigs, not shaded discs with punched holes.
export function makeLeafClusterTexture(rng: RandomSource, tone: ToneFunction | null = null): THREE.Texture {
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
      // the grade shoulder. Leaves 2026-09-12: the warm yellow-green hue of
      // the 1049e4e atlas returns (0.185-0.22) at the capped lightness.
      hue = 0.185 + rng() * 0.035; sat = 0.25 + rng() * 0.07;
      l = 0.20 + sun * 0.11 + rng() * 0.06;
    } else if (famRoll < 0.78) { // mid olive body
      hue = 0.215 + rng() * 0.045; sat = 0.29 + rng() * 0.09;
      l = 0.17 + sun * 0.15 + rng() * 0.10;
    } else {                     // dark shadow foliage
      hue = 0.26 + rng() * 0.045; sat = 0.24 + rng() * 0.08;
      l = 0.12 + sun * 0.10 + rng() * 0.07;
    }
    const sizeMul = 0.7 + rng() * 0.9;
    // Leaves 2026-09-12: the shaded understorey under each clump returns from
    // the 1049e4e atlas — leaves read as lit shapes on a dark interior instead
    // of paint on transparency, which is what gave the reference crowns their
    // depth. The branchlet's twig negative space stays.
    {
      const ur = (9 + rng() * 8) * K * sizeMul;
      const gr = ctx.createRadialGradient(x, y + 3 * K, 0, x, y + 3 * K, ur);
      gr.addColorStop(0, css(hue + 0.02, sat * 0.8, l * 0.42));
      gr.addColorStop(0.55, css(hue + 0.02, sat * 0.8, l * 0.42).replace('rgb(', 'rgba(').replace(')', ',0.55)'));
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(x, y + 3 * K, ur, 0, Math.PI * 2);
      ctx.fill();
    }
    paintBroadleafBranchlet(ctx, rng, x, y, a, sizeMul, hue, sat, l, sun, K);
  }
  return finishAlphaTexture(c, ctx, 70, 78, 40, true, tone);
}

// Conifer foliage card: fanned needle sprays, muted olive-green.
export function makeNeedleSprayTexture(rng: RandomSource, tone: ToneFunction | null = null): THREE.Texture {
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
    // Needles retain chlorophyll color under the warm key: the old pale,
    // low-chroma sprays compressed toward yellow-white after tone mapping.
    // Keep every stroke, RNG draw and atlas dimension unchanged.
    ctx.strokeStyle = css(0.30 + rng() * 0.045, 0.32 + rng() * 0.09, 0.13 + sun * 0.07 + rng() * 0.055);
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
export function makePalmFrondTexture(rng: RandomSource, tone: ToneFunction | null = null): THREE.Texture {
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

// One leaf-bearing spray atlas, sharing the bare-twig atlas's 256px budget.
// Branch-connected leaves and open gaps survive minification without a solid
// circular underlay. The existing palette separates gold birch from pale aspen.
export function makeBirchLeafTexture(rng: RandomSource, tone: ToneFunction | null = null): THREE.Texture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = context2d(c, { willReadFrequently: true });
  ctx.clearRect(0, 0, s, s);
  ctx.lineCap = 'round';
  for (let spray = 0; spray < 11; spray++) {
    const angle = spray * 2.39996 + (rng() - 0.5) * 0.7;
    const length = 52 + rng() * 48;
    const x = 128 + (rng() - 0.5) * 44, y = 128 + (rng() - 0.5) * 44;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = css(0.10, 0.12, 0.24 + rng() * 0.07);
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.quadraticCurveTo(length * 0.5, -4, length, 0);
    ctx.stroke();
    for (let pair = 0; pair < 7; pair++) {
      const t = (pair + 0.7) / 7.8;
      for (const side of [-1, 1]) {
        const at = clamp(t + (rng() - 0.5) * 0.055, 0.02, 0.98);
        const leafLength = (5.5 + rng() * 4.0) * (1.2 - t * 0.35);
        const leafWidth = leafLength * (0.48 + rng() * 0.16);
        const light = 0.26 + rng() * 0.12 + (side < 0 ? 0.025 : 0);
        ctx.save();
        ctx.translate(-8 + (length + 16) * at - 8 * at * at, -8 * at * (1 - at));
        ctx.rotate(side * (0.65 + rng() * 0.55));
        // The pointed petiole meets the branch; broad serration-scale edges
        // read as individual leaves rather than disconnected brush flecks.
        ctx.fillStyle = css(0.10 + (rng() - 0.5) * 0.09, 0.30 + rng() * 0.15, light);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(leafLength * 0.55, -leafWidth, leafLength * 1.5, -leafWidth * 0.5);
        ctx.lineTo(leafLength * 1.9, 0);
        ctx.quadraticCurveTo(leafLength, leafWidth * 1.1, 0, 0);
        ctx.fill();
        ctx.strokeStyle = css(0.10, 0.20, light * 0.72);
        ctx.lineWidth = 0.55;
        ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(leafLength * 1.35, 0); ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }
  return finishAlphaTexture(c, ctx, 92, 83, 60, true, tone);
}

export function makeBirchFoliageTexture(rng: RandomSource, palette: VegetationPalette = {}): THREE.Texture {
  return palette.birchLeaves === true
    ? makeBirchLeafTexture(rng, palette.texTone || null)
    : makeTwigTexture(rng, palette.texTone || null);
}

// Bare-twig card (winter birch crowns / bare shrubs): dark branching strokes.
export function makeTwigTexture(rng: RandomSource, tone: ToneFunction | null = null): THREE.Texture {
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

/** Bake bark/snow separation into the existing UV/color buffers, once at build. */
export function prepareTreeBarkSurface(
  geometry: THREE.BufferGeometry,
  meanReflectance: number,
  atlasWidth = TREE_BARK_ATLAS_WIDTH,
): THREE.BufferGeometry {
  if (geometry.userData.barkSurfacePrepared) return geometry;
  const uv = attribute(geometry, 'uv');
  const color = attribute(geometry, 'color');
  const compensation = 1 / clamp(meanReflectance, 0.4, 1);
  for (let index = 0; index < uv.count; index++) {
    const u = uv.getX(index);
    if (u < 0) {
      // Constant UV selects the middle of the smooth white strip, including
      // its flat normal. No snow mask, extra fetch, material or varying.
      uv.setXY(index, (TREE_BARK_COLUMNS + 8) / atlasWidth, 0.5);
      continue;
    }
    // p2 trees lane: u ≥ 2 = a grown trunk's styled bark (2 + 2 × style + the fraction round the stem); [0, 1] the
    // legacy builders' furrowed sheet (style 0)
    const style = u >= 2 ? Math.min(atlasWidth / TREE_SURFACE_SIZE - 1, Math.floor((u - 2) / 2)) : 0;
    const frac = u >= 2 ? clamp(u - 2 - Math.floor((u - 2) / 2) * 2, 0, 1) : u;
    uv.setX(index, (style * TREE_SURFACE_SIZE + 2 + frac * (TREE_BARK_COLUMNS - 4)) / atlasWidth);
    // the grown wood's tints are authored against the sheet (its darkest is the crown's shade): no compensation
    if (u >= 2) continue;
    const r = color.getX(index), g = color.getY(index), b = color.getZ(index);
    const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
    // Dark trunk tints predate the bark sheet and were multiplied down twice.
    // Restore their authored reflectance; bright birch/palm bark was already
    // authored for the sheet and must retain its existing headroom.
    const weight = 1 - clamp((luminance - 0.065) / 0.055, 0, 1);
    const gain = 1 + (compensation - 1) * weight;
    color.setXYZ(index, r * gain, g * gain, b * gain);
  }
  geometry.userData.barkSurfacePrepared = true;
  return geometry;
}

/** Preserve joined snow faces on Three's nonindexed ico, with no new vertices. */
export function shapeTreeSnowLobe(
  geometry: THREE.BufferGeometry,
  rng: RandomSource,
): THREE.BufferGeometry {
  const position = attribute(geometry, 'position');
  const normal = attribute(geometry, 'normal');
  const uv = attribute(geometry, 'uv');
  const corners = new Map<string, readonly [number, number, number]>();
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    const key = `${x},${y},${z}`;
    // Keep the old jitter's RNG consumption so snow placement/variants do not
    // move merely because duplicate triangle corners now share one position.
    const hasRadius = Math.hypot(x, z) > 1e-4;
    const radial = hasRadius ? rng() : 0.5;
    const vertical = hasRadius ? rng() : 0.5;
    let corner = corners.get(key);
    if (!corner) {
      const scale = 1 + (radial - 0.5) * 0.24;
      corner = [x * scale, y + (vertical - 0.5) * Math.hypot(x, y, z) * 0.10, z * scale];
      corners.set(key, corner);
    }
    position.setXYZ(index, corner[0], corner[1], corner[2]);
    _v3.set(corner[0], corner[1], corner[2]).normalize();
    normal.setXYZ(index, _v3.x, _v3.y, _v3.z);
    uv.setXY(index, -1, 0.5); // converted by prepareTreeBarkSurface after merge
  }
  return geometry;
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
  // Round 77: the crown radius the card's cascade sample reaches out by (aCard.w); the default covers the frozen
  // pre-round callers (the bush receipts' literal predecessor).
  crownR = 2.4,
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
  const pos = attribute(g, 'position');
  const n = pos.count;
  _c.setHSL(hue, sat, 0.5, THREE.SRGBColorSpace); // tint via HSL, applied as multiplier around 1
  const col = new Float32Array(n * 3);
  const fl = new Float32Array(n);
  const card = new Float32Array(n * 4);
  // Round 77 (2026-09-26, the vegetation round): the crown as a lit VOLUME. Every vertex takes the sphere normal at
  // its own station about the crown centre (the card curves with the crown and shades across its face instead of
  // as one flat facet — the "unlit blob" tell of the round's evidence), the caller's up-bias at 40 % (the wrapped
  // lobe, the leaf translucency and the hemisphere light keep the underside from crushing) and a per-card tilt of
  // up to ±11° hashed from the card's station — no RNG draw, so every placement stream stays byte-identical.
  const tilt = Math.sin(px * 12.9898 + py * 78.233 + pz * 37.719) * 43758.5453;
  const tiltA = (tilt - Math.floor(tilt)) * Math.PI * 2;
  const tiltX = Math.cos(tiltA) * 0.19, tiltZ = Math.sin(tiltA) * 0.19;
  const bias = upBias * 0.40;
  const nrm = attribute(g, 'normal');
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r * 1.7 * shade; col[i * 3 + 1] = _c.g * 1.7 * shade; col[i * 3 + 2] = _c.b * 1.7 * shade;
    fl[i] = flex;
    const nd = _v3.set(pos.getX(i) - canopyCx, (pos.getY(i) - canopyCy) * 0.65, pos.getZ(i) - canopyCz);
    if (nd.lengthSq() < 1e-6) nd.set(0, 1, 0);
    nd.normalize();
    nd.x += tiltX; nd.z += tiltZ; nd.y += bias;
    nd.normalize();
    nrm.setXYZ(i, nd.x, nd.y, nd.z);
    // aCard: the card's centre (instance space) and the crown radius — the cascades are sampled once per leaf cluster
    // at this centre pushed out toward the sun (foliageWindHook), never per fragment
    card[i * 4] = px; card[i * 4 + 1] = py; card[i * 4 + 2] = pz; card[i * 4 + 3] = crownR;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
  g.setAttribute('aCard', new THREE.BufferAttribute(card, 4));
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

// A tree should meet the ground through a short change in trunk thickness,
// then continue into individual surface roots.  A straight cone reads as a
// pedestal from the chase camera, especially once its broad bottom catches a
// single flat highlight.  Ease the radius into the stem and keep the lower
// outline only modestly wider; the root ridges below provide the real spread.
// Tree bases 2026-09-12: the eased pedestal read as a cone sitting under the
// trunk. The collar is now a fluted root flare: its ground ring swells into
// `lobes` buttress starts (soft cos^1.5 flutes that vanish two thirds of the
// way up), so the roots below grow out of the trunk instead of a skirt.
function buildRootFlare(
  topRadius: number,
  bottomRadius: number,
  height: number,
  sides: number,
  phase: number,
  lobes = 5,
): THREE.BufferGeometry {
  // lobes = 0 keeps the reviewed two-ring eased flare byte-exact (tidal
  // mangrove stilt trunks); every ordinary trunk takes the fluted collar.
  const fluted = lobes > 0;
  const ringSides = fluted ? Math.max(sides, lobes * 3) : sides;
  const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, ringSides, fluted ? 4 : 2);
  const position = attribute(geometry, 'position');
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    const sourceRadius = Math.hypot(x, z);
    if (sourceRadius <= 1e-5) continue;
    const t = clamp(y / height + 0.5, 0, 1);
    const angle = Math.atan2(z, x);
    let radius: number;
    if (fluted) {
      const eased = Math.pow(1 - t, 2.2);
      const lobe = Math.pow(Math.max(0, Math.cos(angle * lobes + phase)), 1.5);
      const swell = 1 + lobe * 0.58 * Math.pow(1 - t, 2.0) + Math.sin(angle * 7 - phase) * 0.03 * (1 - t);
      radius = (topRadius + (bottomRadius - topRadius) * eased) * swell;
    } else {
      const eased = Math.pow(1 - t, 1.75);
      const flute = 1 + Math.sin(angle * 5 + phase) * 0.045 * (1 - t);
      radius = (topRadius + (bottomRadius - topRadius) * eased) * flute;
    }
    position.setXYZ(index, Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  }
  geometry.computeVertexNormals();
  geometry.translate(0, height * 0.5 - 0.012, 0);
  return geometry;
}

// A surface root: a half-ellipse section swept outward from inside the
// collar's ground ring. Its crown is highest at the trunk, tapers and sinks
// into the soil over its reach (six sections across so a crest vertex sits on
// the trunk axis, four along: 35 vertices and 48 triangles), and the buried
// underside never shows.
function buildRootTongue(
  innerRadius: number,
  reach: number,
  width: number,
  height: number,
  angle: number,
): THREE.BufferGeometry {
  const across = 6, along = 4;
  const start = innerRadius - width * 0.35;
  const span = reach + width * 0.35;
  const positions = new Float32Array((across + 1) * (along + 1) * 3);
  const uvs = new Float32Array((across + 1) * (along + 1) * 2);
  const indices: number[] = [];
  for (let j = 0; j <= along; j++) {
    const u = j / along;
    const crown = height * Math.pow(1 - u, 0.55) * (0.35 + 0.65 * (1 - u));
    const halfWidth = width * 0.5 * (1 - u * 0.62);
    const seat = 0.008 - u * 0.02;
    for (let i = 0; i <= across; i++) {
      const theta = (i / across) * Math.PI;
      const vertex = j * (across + 1) + i;
      positions[vertex * 3] = start + u * span;
      positions[vertex * 3 + 1] = Math.sin(theta) * crown + seat;
      positions[vertex * 3 + 2] = Math.cos(theta) * halfWidth;
      uvs[vertex * 2] = u;
      uvs[vertex * 2 + 1] = i / across;
      if (i < across && j < along) {
        const a = vertex, b = vertex + 1, c = vertex + across + 1, d = vertex + across + 2;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.rotateY(-angle);
  return geometry;
}

function addRootButtresses(
  parts: THREE.BufferGeometry[],
  rng: RandomSource,
  color: THREE.Color,
  radius: number,
  count: number,
  tidalMangrove = false,
): void {
  const phase = rng() * Math.PI * 2;
  for (let index = 0; index < count; index++) {
    const angle = phase + index / count * Math.PI * 2 + (rng() - 0.5) * 0.22;
    if (tidalMangrove) {
      // Reviewed tidal stilt roots: the same bent cones, RNG draws and seating
      // as the published Mangrove candidate; only ordinary trees changed.
      const length = radius * (1.65 + rng() * 0.55);
      const root = new THREE.ConeGeometry(radius * (0.34 + rng() * 0.10), length, 6, 2, false);
      const tiltRoll = rng() * 0.06;
      bendMangroveRoot(root, angle, length, 0.10 + tiltRoll);
      parts.push(paintFlat(root, color.clone().multiplyScalar(0.90 + rng() * 0.10), 0));
    } else {
      const length = radius * (1.55 + rng() * 0.60);
      const width = radius * (0.62 + rng() * 0.16);
      const tiltRoll = rng() * 0.06;
      const root = buildRootTongue(radius * 0.62, length, width, radius * 0.50 + tiltRoll, angle);
      parts.push(paintFlat(root, color.clone().multiplyScalar(0.90 + rng() * 0.10), 0));
    }
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
  tidalMangrove = false,
): THREE.BufferGeometry {
  const cy = shape.cy ?? 4.35, crx = shape.rx ?? 2.35, cry = shape.ry ?? 1.75;
  // clamp a branch tip (radial dist r, height y) inside 0.78 of the hull;
  // r0 = radial offset of the branch base from the trunk axis
  function clampLen(y0: number, rotZ: number, len: number, r0 = 0): number {
    for (let it = 0; it < 7; it++) {
      const tipY = y0 + Math.cos(rotZ) * len;
      const tipR = r0 + Math.sin(rotZ) * len;
      const e = (tipR / crx) ** 2 + ((tipY - cy) / cry) ** 2;
      if (e <= 0.70) break;
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
  // Narrow eased root collar; low radial ridges and the root decal carry the
  // spread/contact, avoiding the old wide cone pedestal.
  {
    const flare = buildRootFlare(0.30, tidalMangrove ? 0.34 : 0.40, 0.66, 12, trunkPhase, tidalMangrove ? 0 : 5);
    _c.setHSL(0.07, 0.25, 0.20 + rng() * 0.05, THREE.SRGBColorSpace);
    parts.push(paintFlat(flare, _c.clone(), 0));
  }
  addRootButtresses(parts, rng, trunkColor, 0.38, 5, tidalMangrove);
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
    // Limbs taper to a twig rather than a 10 cm sawn stump: with the smaller
    // crown cards a blunt tip poking through the canopy read as a spike.
    const br = new THREE.CylinderGeometry(0.02, 0.13, len, 5, 1);
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
      const br2 = new THREE.CylinderGeometry(0.011, 0.05, len2, 4, 1);
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
    rootButtresses: 5, rootFlare: true, organicWarp: true,
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
  const crownR = Math.max(rx, ry, rz) * sizeMul; // round 77: the cascade sample's reach (aCard.w)
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
    const wsz = (1.10 + rng() * 1.10) * sizeMul;
    const cardAspect = 0.70 + Math.abs(dy) * 0.16;
    // r6 TANGENT-BIASED shell orientation: ~2/3 of the shell cards lie
    // roughly tangent to the crown hull (leaf clusters as seen from outside
    // a real tree), the rest stay fully random interior fill. The old
    // uniformly random eulers criss-crossed flat sheets through the
    // silhouette — the "collage of cutout cards" tell at 10-30 m.
    if (rad > 0.55 && rng() < 0.78) {
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
    // 2026-09-14: back to the 1049e4e shade range. The flatter 0.61/0.33 - 0.82/0.24 - 0.90/0.14
    // range shipped in the restoration draft read as "flat, untextured" crowns (owner); the
    // reference's deeper core and skirt gradients are what give the canopy its baked-AO form.
    const shade = (0.58 + 0.42 * clamp(distC, 0, 1)) // dark core, lit shell
      * (0.80 + 0.34 * clamp((py - cy) / ry * 0.5 + 0.5, 0, 1)) * (0.92 + rng() * 0.16);
    // r6: upBias 1.55 -> 1.0 — the near-vertical bent normals lit the whole
    // crown one flat tone; a stronger lateral component gives the sun-side /
    // shade-side gradient a real crown shows (light-driven wrap keeps the
    // dark side from crushing)
    parts.push(foliageCard(wsz, wsz * cardAspect, px, py, pz, _e, shade,
      hue0 + (rng() - 0.5) * 0.09, sat0 + rng() * 0.08, l0 + rad * 0.65, 0, cy, 0,
      0.78, 0.38, crownR));
  }
  // a couple of low cards hanging near the branch collar
  for (let i = 0; i < Math.max(2, nCards >> 4); i++) {
    const a = rng() * Math.PI * 2, rr = 0.9 + rng() * 0.9;
    _e.set(rng() * Math.PI, rng() * Math.PI * 2, rng() * Math.PI, 'YXZ');
    parts.push(foliageCard(1.3 * sizeMul, 1.0 * sizeMul, Math.cos(a) * rr, (shape.trunkH ?? 3.1) * 0.90 + rng() * 0.6, Math.sin(a) * rr,
      _e, 0.62, hue0 + 0.005, sat0 + 0.02, 0.35, 0, cy, 0, 1.55, 0, crownR));
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
      _e, 0.50 + rng() * 0.08, hue0 + 0.01, sat0 * 0.8, 0.25, 0, cy, 0, 1.55, 0, crownR));
  }
  return mergeParts(parts);
}

function buildPineTrunk(rng: RandomSource, pal: VegetationPalette = {}): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkH = 5.9 + rng() * 0.6;
  // The same three draws in the same order as before round 77 (phase, crook x, crook z); the phase also seeds the
  // branch whorls below.
  const trunkPhase = rng() * Math.PI * 2;
  const crookX = (rng() - 0.5) * 0.10, crookZ = (rng() - 0.5) * 0.10;
  const trunk = organicizeTrunk(
    new THREE.CylinderGeometry(0.10, 0.26, trunkH, 11, 4),
    trunkPhase, crookX, crookZ, 0.065,
  );
  trunk.translate(0, trunkH / 2, 0);
  _c.setHSL(0.06, 0.30, 0.19 + rng() * 0.05, THREE.SRGBColorSpace);
  const trunkColor = _c.clone();
  parts.push(paintFlat(trunk, trunkColor.clone(), 0));
  const flare = buildRootFlare(0.26, 0.35, 0.58, 11, rng() * Math.PI * 2);
  _c.setHSL(0.06, 0.28, 0.17 + rng() * 0.04, THREE.SRGBColorSpace);
  parts.push(paintFlat(flare, _c.clone(), 0));
  addRootButtresses(parts, rng, trunkColor, 0.31, 4);
  // Round 77 (2026-09-26): branch whorls under the needle tiers. The conifer trunk was a bare pole with card tiers
  // floating around it; three tapered open three-sided limbs per whorl every 0.62 m from 2.0 m (above the trunk-quality
  // receipt's 0.4–1.65 m lower-stem band at every species' vertical scale) to 5.5 m, reaching the tier radius and
  // drooping 15–30° below level, give the crown its structure through the card gaps (18 limbs, 108 triangles —
  // a centimetre-thin limb needs no fourth side).
  // Hashed from the trunk phase and the whorl — no RNG draw, so the snow lobes below keep their exact stream.
  {
    const hashN = (x: number): number => { const r = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return r - Math.floor(r); };
    const topY = 6.4;
    let whorl = 0;
    for (let y = 2.0; y < 5.6; y += 0.62, whorl++) {
      const t = (y - 1.2) / (topY - 1.2);
      const reach = (1.0 - t) * 1.45 + 0.30;
      for (let k = 0; k < 3; k++) {
        const h = hashN(trunkPhase * 3.7 + whorl * 1.7 + k * 2.9);
        const a = trunkPhase + (k / 3) * Math.PI * 2 + (h - 0.5) * 0.9 + whorl * 0.83;
        const len = reach * (0.72 + h * 0.36);
        const limb = new THREE.CylinderGeometry(0.012, 0.028 + (1 - t) * 0.022, len, 3, 1, true);
        limb.translate(0, len / 2, 0);
        limb.rotateZ(1.83 + h * 0.28); // 105–121° from vertical: level to drooping
        limb.rotateY(a);
        limb.translate(0, y, 0);
        _c.setHSL(0.06, 0.26, 0.16 + h * 0.05, THREE.SRGBColorSpace);
        parts.push(paintFlat(limb, _c.clone(), 0.12 + t * 0.10));
      }
    }
  }
  // r6 terrain_environment: OPAQUE snow lobes riding the tier tops (winter
  // maps, pal.snow) — the whitened needle cards alone still averaged toward
  // green at range; real load is a solid white mass sitting ON the boughs.
  // Shared material bucket; neutral snow UVs bypass the bark surface atlas.
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
        shapeTreeSnowLobe(lobe, rng);
        lobe.scale(1.6 + rng() * 0.5, 0.55, 1.0 + rng() * 0.4);
        lobe.rotateY(a + Math.PI / 2);
        lobe.translate(Math.cos(a) * rr * 0.62, y + 0.14 + rng() * 0.2, Math.sin(a) * rr * 0.62);
        _c.setHSL(0.585, 0.04, 0.62, THREE.SRGBColorSpace).multiplyScalar(1.55);
        parts.push(paintFlat(lobe, _c.clone(), 0.12));
      }
    }
    // leader cap: the topmost load every snowbound spruce carries
    const cap = new THREE.IcosahedronGeometry(0.34, 0);
    shapeTreeSnowLobe(cap, rng);
    cap.scale(1.1, 0.70, 1.1);
    cap.translate(0, topY - 0.28, 0);
    _c.setHSL(0.585, 0.04, 0.64, THREE.SRGBColorSpace).multiplyScalar(1.55);
    parts.push(paintFlat(cap, _c.clone(), 0.2));
  }
  const merged = mergeParts(parts);
  merged.userData.trunkQuality = {
    family: 'conifer', radialSegments: 11, verticalSegments: 4,
    rootButtresses: 4, rootFlare: true, organicWarp: true,
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
      // 2026-09-14: back to the 1049e4e tier gradient (0.48 + 0.40 t + 0.26 jitter); the
      // 0.60/0.28/0.18 draft range flattened the conifer skirts (owner: "flat, untextured").
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
        0, y - 0.6, 0, 1.05, 0, 1.9 * sizeMul));
    }
  }
  // vertical leader cards at the top
  for (let k = 0; k < 2; k++) {
    _e.set(0, rng() * Math.PI, 0, 'YXZ');
    parts.push(foliageCard(1.0 * sizeMul, 1.7 * sizeMul, 0, topY - 0.55, 0, _e, 0.9,
      hue0, sat0 + 0.03, 0.8, 0, topY - 1.6, 0, 1.55, 0, 1.9 * sizeMul));
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
  const rootFlare = buildRootFlare(
    0.23 * rMul, 0.31 * rMul, 0.60, 10, rng() * Math.PI * 2,
  );
  trunkParts.push(paintFlat(rootFlare, trunkColor.clone().multiplyScalar(0.88), 0));
  addRootButtresses(trunkParts, rng, trunkColor, 0.28 * rMul, 4);
  for (let i = 0; i < NSEG; i++) {
    const t0 = i / NSEG, t1 = (i + 1) / NSEG;
    const x0 = Math.cos(leanA) * lean * t0 * t0, z0 = Math.sin(leanA) * lean * t0 * t0;
    const x1 = Math.cos(leanA) * lean * t1 * t1, z1 = Math.sin(leanA) * lean * t1 * t1;
    const segLen = Math.hypot(H / NSEG, x1 - x0, z1 - z0) * 1.04;
    const seg = new THREE.CylinderGeometry(
      (0.13 + (1 - t1) * 0.10) * rMul, (0.14 + (1 - t0) * 0.10) * rMul, segLen, 10, 2);
    organicizeTrunk(seg, i * 0.73 + leanA, 0, 0, 0.045);
    // ring-band illusion: alternating leaf-scar bands in warm brown
    _c.setHSL(0.072, 0.30, (i % 2 ? 0.34 : 0.43) + rng() * 0.03, THREE.SRGBColorSpace); // r2: bark-map compensation
    // Tilt by the full horizontal bend, then yaw it into the XZ direction.
    // Using signed X here bent Z-facing segments toward the wrong joint.
    seg.rotateZ(Math.atan2(Math.hypot(x1 - x0, z1 - z0), H / NSEG) * -1);
    seg.rotateY(-leanA);
    seg.translate((x0 + x1) / 2, (t0 + t1) * 0.5 * H, (z0 + z1) / 2);
    trunkParts.push(paintFlat(seg, _c.clone(), t1 * 0.2));
    px = x1; pz = z1;
  }
  // fiber collar under the crown
  const collar = new THREE.CylinderGeometry(0.30 * rMul, 0.19 * rMul, 0.6, 10, 2);
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
    g.translate(px, H + 0.12, pz);
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
      fl[i] = 0.20 + t * (dead ? 0.05 : 0.55);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aFlex', new THREE.BufferAttribute(fl, 1));
    // round 77: the frond's cascade sample stands at the crown's heart, reaching 3.4 m out toward the sun (aCard)
    const card = new Float32Array(nv * 4);
    for (let i = 0; i < nv; i++) { card[i * 4] = px; card[i * 4 + 1] = H + 0.12; card[i * 4 + 2] = pz; card[i * 4 + 3] = 3.4; }
    g.setAttribute('aCard', new THREE.BufferAttribute(card, 4));
    // sky-lit normals: outward + up bias, like the other canopies (round 77: the bias at 55 % of the old 1.35 so the
    // fronds on the sun side and the shaded side separate — a real crown's fronds fan out around the light)
    const nrm = attribute(g, 'normal');
    _v3.set(Math.sin(a) * 0.45, 0.74, Math.cos(a) * 0.45).normalize();
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
    jitterFarShell(core, rng, 0.25);
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
    family: 'palm', radialSegments: 10, verticalSegments: 2,
    rootButtresses: 4, rootFlare: true, organicWarp: true,
  };
  return { trunk, cards: mergeParts(cardParts) };
}

// Birch/aspen: connected, tapered limbs carry the crown rather than an
// independent random cloud. The same topology serves bare and leafy palettes.
const BIRCH_VAR: BirchVariant[] = [
  { h0: 4.3, hr: 0.9, crw: 1.15, nBr: 11 }, // young slender
  { h0: 6.0, hr: 1.3, crw: 1.55, nBr: 14 }, // classic
  { h0: 7.5, hr: 1.6, crw: 2.00, nBr: 17 }, // old broad
];

function birchLimbStation(limb: BirchLimb, t: number, out: THREE.Vector3): THREE.Vector3 {
  const reach = Math.sin(limb.tilt) * limb.length * t;
  return out.set(limb.x - Math.cos(limb.yaw) * reach,
    limb.y + Math.cos(limb.tilt) * limb.length * t,
    limb.z + Math.sin(limb.yaw) * reach);
}

function addBirchLimb(
  parts: THREE.BufferGeometry[], limb: BirchLimb,
  tipRadius: number, baseRadius: number, sides: number, flex: number,
): void {
  const geometry = new THREE.CylinderGeometry(tipRadius, baseRadius, limb.length, sides, 1);
  geometry.translate(0, limb.length / 2, 0);
  geometry.rotateZ(limb.tilt);
  geometry.rotateY(limb.yaw);
  geometry.translate(limb.x, limb.y, limb.z);
  parts.push(paintFlat(geometry, _c.clone(), flex));
}

function birchLimbLength(limb: BirchLimb, height: number, radius: number): number {
  return Math.min(limb.length, Math.max(0.12, height - limb.y) / Math.cos(limb.tilt),
    Math.max(0.12, radius - Math.hypot(limb.x, limb.z)) / Math.sin(limb.tilt));
}

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
  const birchFlare = buildRootFlare(0.16, 0.22, 0.46, 10, rng() * Math.PI * 2);
  trunkParts.push(paintFlat(birchFlare, birchRootColor.clone(), 0));
  addRootButtresses(trunkParts, rng, birchRootColor, 0.21, 4);
  // Construction-local only: no extra retained geometry, attributes or frame work.
  const leaders: BirchLimb[] = [], crownLimbs: BirchLimb[] = [];
  const addBranchLattice = (): void => {
    const leaderCount = 2 + ((rng() * 2) | 0);
    for (let leader = 0; leader < leaderCount; leader += 1) {
      const yaw = (leader / leaderCount) * Math.PI * 2 + rng() * 1.2;
      const tilt = 0.10 + rng() * 0.14;
      const length = H * (0.42 + rng() * 0.16);
      const baseY = H * (0.50 + rng() * 0.10);
      const limb = {x: 0, y: baseY - length * 0.12, z: 0, length, tilt, yaw};
      limb.length = birchLimbLength(limb, H * 0.96, crw * 0.72);
      _c.setHSL(0.08, 0.04, 0.72 + rng() * 0.10, THREE.SRGBColorSpace);
      addBirchLimb(trunkParts, limb, 0.014, 0.075, 5, 0.15);
      leaders.push(limb); crownLimbs.push(limb);
    }
    const branchCount = (vr.nBr ?? 14) + ((rng() * 4) | 0);
    for (let index = 0; index < branchCount; index += 1) {
      const length = 0.9 + rng() * (H * 0.22);
      const tilt = 0.72 + rng() * 0.48;
      const yaw = rng() * Math.PI * 2;
      const station = 0.06 + rng() * 0.70;
      const parent = leaders[index % leaderCount];
      birchLimbStation(parent, station, _v3);
      const limb = {x: _v3.x, y: _v3.y, z: _v3.z, length, tilt, yaw};
      // Reuse the former random root offset as crown reach variation, keeping
      // the construction stream and all conditional fork/snow counts stable.
      limb.length = birchLimbLength(limb, H * 0.96, crw * (0.82 + rng() * 0.20));
      _c.setHSL(0.06, 0.06, 0.46 + rng() * 0.12, THREE.SRGBColorSpace);
      addBirchLimb(trunkParts, limb, 0.005, 0.040, 4, 0.3);
      crownLimbs.push(limb);
      if (rng() >= 0.6) continue;
      const forkLength = limb.length * (0.45 + rng() * 0.3);
      const forkTilt = Math.min(1.35, tilt + (rng() - 0.3) * 0.7);
      const forkYaw = yaw + (rng() - 0.5) * 1.1;
      birchLimbStation(limb, 0.9, _v3);
      const fork = {x: _v3.x, y: _v3.y, z: _v3.z, length: forkLength, tilt: forkTilt, yaw: forkYaw};
      fork.length = birchLimbLength(fork, H * 0.99, crw * 1.10);
      _c.setHSL(0.06, 0.06, 0.50 + rng() * 0.12, THREE.SRGBColorSpace);
      addBirchLimb(trunkParts, fork, 0.003, 0.020, 3, 0.4);
    }
  };
  addBranchLattice();
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
    // Every limb receives a terminal spray before reusing its inner stations.
    // Small scatter opens the silhouette without detaching whole crown clumps.
    const limb = crownLimbs[i % crownLimbs.length];
    birchLimbStation(limb, i < crownLimbs.length ? 0.94 : 0.60 + rad * 0.25, _v3);
    const px = _v3.x + dx * 0.12, py = _v3.y + dy * 0.12, pz = _v3.z + dz * 0.12;
    cardParts.push(foliageCard(w, w * 1.05, px, py, pz,
      _e, (0.9 + rng() * 0.3) * (1 + sk * 0.35),
      hue0 + (0.585 - hue0) * sk, sat0 * (1 - sk * 0.8) + 0.02 * sk, 0.45, 0, cy, 0, 1.55, 0, crw * 1.3));
    if (dy > 0.15) snowAnchors.push({ x: px, y: py, z: pz, w, dy });
  }
  // small BRANCH-RIDING snow lobes on the upper twig masses only — rime
  // clumps following the structure, no monolithic parasol cap
  const addSnowLobes = (): void => {
    for (const a of snowAnchors) {
      if (rng() > snow * (0.20 + a.dy * 0.45)) continue;
      const lr = a.w * (0.16 + rng() * 0.10);
      const lobe = new THREE.IcosahedronGeometry(lr, 0);
      shapeTreeSnowLobe(lobe, rng);
      lobe.scale(1.5 + rng() * 0.5, 0.60, 0.85 + rng() * 0.3);
      lobe.rotateY(rng() * Math.PI * 2);
      lobe.translate(a.x, a.y + lr * 0.28, a.z);
      _c.setHSL(0.585, 0.05, 0.60, THREE.SRGBColorSpace).multiplyScalar(1.55);
      trunkParts.push(paintFlat(lobe, _c.clone(), 0.10));
    }
  };
  if (snow > 0.01) addSnowLobes();
  const trunk = mergeParts(trunkParts);
  trunk.userData.trunkQuality = {
    family: 'birch', radialSegments: 10, verticalSegments: 5,
    rootButtresses: 4, rootFlare: true, organicWarp: true,
  };
  return { trunk, cards: mergeParts(cardParts) };
}

/** The spray atlas a species paints on a map: birches and aspens carry leaves only where the palette says so. */
export function grownSprayKind(species: Species, palette: VegetationPalette = {}): SprayKind {
  return grownFormSprayKind(species as GrowthSpecies, palette);
}

/**
 * Trees lane (2026-10-05): the winter twigs a deciduous form paints on a bare map (VegetationConfig `bare`): the
 * birch's fine lattice for the slender-twigged (birch, aspen, willow, beech), the oak's crooked twigs for the stout
 * (oak, chestnut), the poplar's climbing shoots, the buddleia's winter canes. A form not named keeps its leaves.
 */
export const BARE_SPRAY_KINDS: Readonly<Partial<Record<GrowthSpecies, SprayKind>>> = Object.freeze({
  birch: 'birch-bare', aspen: 'birch-bare', willow: 'birch-bare', beech: 'birch-bare',
  oak: 'oak-bare', chestnut: 'oak-bare', poplar: 'poplar-bare', buddleia: 'buddleia-bare',
  // the Streuobst fruit trees' crooked spurs are the oak's habit
  apple: 'oak-bare',
});

/** Trees round 2: the spray atlas a grown form paints (treeBiomes.ts) — a birch-family form leafy only where the palette
 * says so (a slot's biome entry can say so too, through palOf); a bare palette's form its winter twigs. */
export function grownFormSprayKind(growth: GrowthSpecies, palette: VegetationPalette = {}): SprayKind {
  if (palette.bare === true && BARE_SPRAY_KINDS[growth]) return BARE_SPRAY_KINDS[growth]!;
  if (growth === 'birch' || growth === 'aspen') return palette.birchLeaves === true ? growth : 'birch-bare';
  return growth as SprayKind;
}

/**
 * Trees lane: the palette a form grows with on a bare map — its winter twigs (`bare`), without the leaf colours a map
 * palette tunes for its crowns (the twigs take the twig law, grownTintLaw); unchanged for a form that keeps its leaves
 * or on a map in leaf.
 */
export function bareFormPalette<P extends VegetationPalette>(pal: P, growth: GrowthSpecies, bare: boolean): P {
  if (!bare || !BARE_SPRAY_KINDS[growth]) return pal;
  return { ...pal, bare: true, birchLeaves: false, cardHue: undefined, cardSat: undefined };
}

/**
 * p2 trees lane: one grown near tree (treeGrowth.ts) as the pool's geometries — the wood (stem, scaffolds, limbs and
 * side shoots as tubes, the legacy fluted root flare and root tongues at the foot, a winter palette's snow lobes on the
 * limbs), the spray cards and the crown's own shadow hull. Deterministic from the seed; the desktop tiers' builder.
 */
/**
 * p2 trees lane (2026-10-02): the grown crowns' back-lit transmission gain (canopyLighting.ts COT_GROWN_CROWN) — the
 * a4 capture read Saltmere's and Frontier's crowns 19 % under the base where the stand and macro views look into a low
 * sun, while the per-species values hold them at parity front- and side-lit (.qa-dev species-luma).
 */
const GROWN_CROWN_TRANSMISSION = 1.6;

/**
 * p2 trees lane (2026-10-02): the leaves' transmission under the grounded light (canopyLighting.ts): the share of the
 * (shadowed) direct light a leaf passes to its far side, Lambert on that side. The lighting lane's handover: under the
 * grounded light, which retired the anti-sun fill, Saltmere's crowns read 23–36 % under the base.
 */
const LEAF_TRANSMISSION = 0.45;

/**
 * Trees round 2 (2026-10-03): the share of the turn a grown crown's leaf cluster makes about its own axis toward the
 * camera (foliageWindHook COT_LEAF_BILLBOARD): all of it — a cluster is leaves all round its twig, and its edge is the
 * flat card the gauntlet named.
 */
const GROWN_LEAF_BILLBOARD = 1;

/**
 * The near canopy's camera dissolve band (m from the camera; a small crown's scaled by vCotNearScale): its cards thin
 * out from the far end to nothing at the near. Trees round 3b (2026-10-04, the gauntlet's wave 46: the chase camera's
 * foreground bush "a screen-door mesh", "a cross-hatched net-like texture artifact"): a grown crown's cluster leaves
 * whole — it shrinks to its centre at its own threshold in the band (a hash of where it sits), so a near crown thins by
 * clusters and a still frame keeps no dither (the desktop tiers run no temporal AA to average one away: quality.ts);
 * the palms' fronds, the trunks and the phones' cards keep the pixel dissolve.
 */
const CANOPY_NEAR_DISSOLVE = Object.freeze([2.5, 8.0] as const);
/**
 * The bark's near-camera dissolve band (m from the camera; the trunks, the limbs and the twigs). Trees lane (2026-10-05,
 * the gauntlet's wave 122 on round 5's close frames: the near tree's trunk "a see-through dotted tube", "trunk bark
 * reads as a see-through fishnet mesh", "solid branch stubs float in the sky above it"): the band was 1.5-4.2 m, so a
 * trunk a camera rested 2-4 m from stood half dithered in every close view while its limbs past the band stayed solid.
 * It now lies below any distance a pose holds the camera from bark: from the camera's near plane (0.5 m, main.ts) to
 * 1 m. Bark dissolves only as the camera grazes it, and stands solid at rest.
 */
const BARK_NEAR_DISSOLVE = Object.freeze([0.5, 1.0] as const);
/**
 * Trees round 4: the near dissolve's reach per material (uCotNearReach, over CANOPY_NEAR_DISSOLVE and the crown's size):
 * a crown's whole band, a shrub's half of it — a 6 m field bush keeps its clusters to about 3.5 m from the camera and
 * thins by whole clusters inside that (the coordinator's 0.5 over the first 0.3: a bush filling half the screen and
 * hiding the player's own tank at 2 to 3 m played worse than a slightly earlier thinning).
 */
const FOLIAGE_NEAR_REACH = Object.freeze({ crown: 1, shrub: 0.5 });
/**
 * Trees round 4 (the gauntlet's wave 68 on the dolly's bush: "an upper cluster hangs into the sky with no visible stem"):
 * how far the near dissolve's per-cluster gate leans on the cluster's height in its shrub — a shrub carries no wood, so
 * its clusters leave from the top down and none is left over a thinned skirt; a crown's leave by the hash alone.
 */
const FOLIAGE_GATE_LIFT = Object.freeze({ crown: 0, shrub: 0.75 });
/**
 * Trees round 4 (the cost hold: Verdant's chase at +1.01 ms over the PR state, the near tier's trunks its largest
 * vegetation class): a branch tube under GROWTH_WOOD_FINE_R (m) at its base is fine wood — the tube law's three-sided limbs
 * and twigs (treeGrowth.ts emitBranchGeometry), 40–75 % of a grown trunk's triangles — and the bark program draws it no
 * farther than GROWTH_WOOD_FINE_FAR (m) from the camera, each tree at its own 0.85–1.15 of it: a pixel or two wide there,
 * inside the crown, under its leaf cards (the desktop tiers; the phones' trunks carry no fine-wood tag).
 */
const GROWTH_WOOD_FINE_R = 0.05, GROWTH_WOOD_FINE_FAR = 80;
/**
 * Trees round 4 (the cost hold, the third trim): a limb under GROWTH_WOOD_MID_R (m) at its base — the tube law's
 * four-sided limbs — is mid wood (aWoodFine 2), drawn no farther than twice the fine wood's reach: under a pixel and a
 * half wide there; the stem and the scaffold limbs at every distance.
 */
const GROWTH_WOOD_MID_R = 0.12;
/**
 * Trees round 4 (the cost hold: Verdant's understorey 3,609 shrubs, nine in ten past 100 m of the chase camera): a shrub
 * whose crown radius over its distance is under this (rad; about 24 px across on a 1600 px frame) draws half its clusters,
 * each kept by a hash of its own, at 1.25 times their size — the understorey's young growth past about 65 m, a field bush
 * past about 220 m (the desktop tiers; a crown never thins).
 */
const FOLIAGE_SHRUB_THIN = 0.011;


/**
 * The grown crowns' card tint law per family: the legacy HSL multiplier's hue and saturation, and its gain. A birch's
 * law is its bare twigs' warm grey; a birch crown in leaf (the palette's birchLeaves) takes the leaves' hue and
 * saturation at the twigs' gain. Trees round 2 (2026-10-03): the biome table's leafy birches on palettes that name no
 * card colour (Prokhorovka's pine and willow slots, the Fulda Gap's aspens, the junction's birches) fell back to the
 * twigs' law and grew olive-brown crowns among the green ones (the round-2 hand-over's Verdant and Frontier frames).
 */
export function grownTintLaw(family: string, leafy = false, bare = false): readonly [number, number, number] {
  // trees lane: a bare form's winter twigs take the birch twigs' warm grey, whatever its family
  if (bare) return [0.08, 0.06, 1.8];
  if (family === 'conifer') return [0.30, 0.18, 1.95];
  if (family === 'birch') return leafy ? [0.228, 0.19, 1.8] : [0.08, 0.06, 1.8];
  if (family === 'dead') return [0.08, 0.05, 1.7];
  if (family === 'palm') return [0.215, 0.28, 1.75];
  return [0.228, 0.19, 1.85];
}

/**
 * p2 trees lane: a grown shrub (the desktop field bush and understorey; treeGrowth.ts growShrubSkeleton) — the bush
 * species' sprays on its own spray atlas tiles (the round-8 bush cards spanned the whole texture: on the 2 × 2 spray
 * atlas they drew four sprays each), the trees' tint law (the understorey a touch younger and yellower), a snowy
 * palette's laden tiles on the sky-facing sprays. Cards only, welded: the shrub's stems stand inside its foliage.
 */
function buildGrownShrub(kind: 'bush' | 'understorey', rng: RandomSource, pal: VegetationPalette, growth: GrowthSpecies,
  shrubAtlas = false): THREE.BufferGeometry {
  const profile = TREE_GROWTH_PROFILES[growth];
  const skeleton = growShrubSkeleton(growth, kind, rng);
  // a snowy palette's load lies on the sprays facing the sky highest on the mound: a fixed share of the shrub's sprays
  // (by the load) takes the atlas' laden tiles in that order, every other one a bare tile — every shrub of a map
  // carries the same load, not a draw's
  const snow = pal.snow ?? 0;
  if (snow > 0.05) {
    const order = skeleton.leaves.filter(site => site.ny > 0.35)
      .sort((a, b) => (b.ny + 0.5 * b.y / skeleton.height) - (a.ny + 0.5 * a.y / skeleton.height));
    const laden = new Set(order.slice(0, Math.round(skeleton.leaves.length * 0.12 * Math.min(1, snow * 1.1))));
    // (trees round 5: a shrub atlas' bare row is its one plain tile and its stems; makeSprayAtlas `shrub`)
    for (const site of skeleton.leaves) {
      site.tile = shrubAtlas ? (laden.has(site) ? site.tile % SPRAY_ATLAS_TILES : SPRAY_ATLAS_TILES)
        : (laden.has(site) ? 0 : SPRAY_ATLAS_TILES) + (site.tile % SPRAY_ATLAS_TILES);
    }
  } else if (shrubAtlas) {
    // trees round 5: the sprays keep to the shrub atlas' leaf tiles (its last is the stems')
    skeleton.leaves.forEach((site, i) => { if (site.tile === SHRUB_STEM_TILE) site.tile = i % SHRUB_STEM_TILE; });
  }
  const [hueBase, satBase, gain] = grownTintLaw(profile.family, pal.birchLeaves === true, pal.bare === true);
  const hue0 = (pal.cardHue ?? hueBase) + (kind === 'understorey' ? 0.015 : 0), sat0 = pal.cardSat ?? satBase;
  const shrubValue = GROWTH_SHRUB_VALUE[growth] ?? 1;
  // trees round 2 (2026-10-03, gauntlet wave 4: the "green balls", the "papercraft" foreground bush): a shrub shades as
  // its own few masses — its sprays' lobes, the union's normals and a lighter depth shade than a crown's (a shrub is
  // open to the sky around it), its lit shell given back by the shrub gain (GROWTH_CROWN_SHADING)
  skeleton.lobes = crownLobes(skeleton, kind === 'bush' ? 3 : 2);
  // trees round 5 (the gauntlet's wave 98: the near bush's "flat, stemless leaf cards with no visible branch structure
  // connecting them to the ground"): a shrub on its shrub atlas stands on its stems — a card a stool from the ground into
  // its clump (treeGrowth.ts shrubStemSites), drawn in the bark's grey-brown
  if (shrubAtlas) skeleton.leaves.push(...shrubStemSites(skeleton, SHRUB_STEM_TILE, rng));
  const cards = emitLeafCards(skeleton, {
    tiles: SPRAY_ATLAS_TILES, rng, rows: 2, depthShade: GROWTH_CROWN_SHADING.shrubDepthShade,
    tint(shade, site, r) {
      const jitter = r();
      if (site.stem) {
        // the bark under the atlas' own grey-brown: a neutral, a little warm, in the mound's shade
        const value = (0.55 + 0.45 * shade) * (0.9 + jitter * 0.2) * GROWTH_SHRUB_STEM_VALUE;
        return [value, value * 0.94, value * 0.86];
      }
      const sk = snow > 0.05 && site.tile < SPRAY_ATLAS_TILES ? 0.85 + jitter * 0.15 : 0;
      _c.setHSL(hue0 + (r() - 0.5) * 0.06 + (0.585 - hue0) * sk, (sat0 + r() * 0.06) * (1 - sk * 0.85) + 0.02 * sk, 0.5,
        THREE.SRGBColorSpace);
      const value = (0.55 + 0.45 * shade) * (0.92 + r() * 0.16) * (1 + sk * 1.6) * (profile.foliageValue ?? 1) * (sk > 0 ? 1 : shrubValue)
        * GROWTH_CROWN_SHADING.shrubGain;
      return [_c.r * gain * value, _c.g * gain * value, _c.b * gain * value];
    },
  });
  // the shrubs' normals keep the round-8 bush's positive-up floor: a skirt spray lights as the mound's side, never
  // as a downward pole gone black
  const normal = cards.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < normal.count; i++) {
    const nx = normal.getX(i), ny = Math.max(0.2, normal.getY(i)), nz = normal.getZ(i), l = Math.hypot(nx, ny, nz);
    normal.setXYZ(i, nx / l, ny / l, nz / l);
  }
  return weldGrownGeometry(cards);
}

/** Trees round 5: the forest-grown near variants of a wood's species (0 and 1; the third stays open-grown). */
const FOREST_NEAR_VARIANTS = 2;
/** Trees lane (2026-10-06): the grid (m) a map's hedge planting reads its land use on (plantHedgeTrees). */
const HEDGE_SCAN_M = 1.5;
/** Trees round 5: a shrub stem card's tint (the bark atlas tile's multiplier; buildGrownShrub). */
const GROWTH_SHRUB_STEM_VALUE = 1.15;
/** Trees round 5: the shrub atlas' size before the device's texture scale (createBushes; the crowns' are 512). */
const SHRUB_ATLAS_PX = 1024;
/**
 * Trees round 5 (the field law, createVegetation's addFieldTree): a field tree within this share of a woodlot's outline
 * beyond it stands at the wood's edge; past this many metres beyond its field's grass margin it is in the interior, unless
 * within this many metres of a road (its verge, a field's edge too).
 */
const FIELD_TREE_WOOD_EDGE = 1.2;
/** Trees round 5: the field law on (a probe's copy turns it off for its before census). */
const FIELD_TREE_LAW = true;
const FIELD_TREE_MARGIN_M = 3;
const FIELD_TREE_ROAD_VERGE_M = 18;
/** Trees round 5: the least distance between two moved field trees' trunks (a hedgerow's standards, m). */
const FIELD_TREE_SPACING_M = 5;

function buildGrownTree(species: GrowthSpecies, seed: number, variant: number, pal: VegetationPalette = {}, forest = false): TreeGeometryPair {
  const profile = TREE_GROWTH_PROFILES[species];
  const rng = mulberry32(seed);
  const skeleton = growTreeSkeleton(species, rng, { variant, tier: 'desktop', forest });
  const parts: THREE.BufferGeometry[] = [emitBranchGeometry(skeleton, {
    tint: profile.barkTint, topTint: profile.barkTopTint, barkStyle: profile.bark, rng, tier: 'desktop',
  })];
  const stem = skeleton.branches[0];
  const stemR = stem.nodes[Math.min(1, stem.nodes.length - 1)].r;
  // the flare and the root tongues stand in the crown's sky shade too (the stem's foot, canopySkyOcclusion)
  const footShade = 1 - GROWTH_CANOPY_AO * canopySkyOcclusion(skeleton, 0, 0.3, 0);
  // trees round 4: a birch's collar is its stem's black foot (treeGrowth.ts GROWTH_BIRCH_FOOT), not white bark
  const footDark = profile.bark === 3 ? 1 - GROWTH_BIRCH_FOOT.depth * 0.9 : 1;
  const footColor = new THREE.Color(profile.barkTint[0] * 0.80 * footShade * footDark, profile.barkTint[1] * 0.78 * footShade * footDark,
    profile.barkTint[2] * 0.76 * footShade * footDark);
  // the tidal mangrove stands on the reviewed stilt roots (addRootButtresses' bent cones, tidalMangrove.ts) over the
  // two-ring eased collar; every other tree takes the fluted collar and its swept root tongues
  const tidal = species === 'mangrove';
  parts.push(paintFlat(buildRootFlare(stemR, stemR * (tidal ? 1.13 : 1.36), 0.62, 10, rng() * Math.PI * 2, tidal ? 0 : 5), footColor, 0));
  const roots = profile.family === 'conifer' || profile.family === 'birch' ? 4 : 5;
  const rootFirst = parts.length;
  addRootButtresses(parts, rng, footColor, tidal ? 0.38 : stemR * 1.28, roots, tidal);
  const rootEnd = parts.length;
  if (tidal) {
    // the arches are drawn round the origin's axis: each joins the grown stem where it stands at the arch's collar
    for (let i = rootFirst; i < rootEnd; i++) {
      const p = parts[i].getAttribute('position');
      let top = -Infinity;
      for (let v = 0; v < p.count; v++) top = Math.max(top, p.getY(v));
      const nodes = stem.nodes;
      let ax = nodes[nodes.length - 1].x, az = nodes[nodes.length - 1].z;
      for (let n = 1; n < nodes.length; n++) {
        if (nodes[n].y < top) continue;
        const t = clamp((top - nodes[n - 1].y) / Math.max(1e-6, nodes[n].y - nodes[n - 1].y), 0, 1);
        ax = nodes[n - 1].x + (nodes[n].x - nodes[n - 1].x) * t; az = nodes[n - 1].z + (nodes[n].z - nodes[n - 1].z) * t;
        break;
      }
      parts[i].translate(ax, 0, az);
    }
  }
  // a winter palette's snow load: the spray atlas paints the snow on the needles and twigs, and pads of snow lie on the
  // upward-facing sprays down the crown (the bark sheet's snow strip) — a conifer's boughs carry the load the round-8
  // snow caps showed (six or seven pads a tree at Frosthollow's 0.75–0.9, each a bough wide, spread down the crown,
  // the leader capped), a broadleaf's or a birch's a lighter load riding its limbs
  const snow = pal.snow ?? 0;
  // trees round 2 (2026-10-03, gauntlet wave 4: "white cotton-ball discs perched on the branch tips"): a conifer's load
  // is the laden spray tiles over its upper crown (below), not lumps on its boughs; a broadleaf's and a birch's light
  // load still rides their limbs as flat pads
  if ((snow > 0.25 && profile.family !== 'conifer') || (profile.family === 'birch' && snow > 0.01)) {
    const maxPads = Math.round(2 + 3 * snow);
    // the highest upward sprays first (a weeping crown's sprays hang: its pads ride the tops of its limbs instead): the
    // top two always carry a pad, the rest by the load and the height
    const upward = profile.habit === 'hanging'
      ? skeleton.branches.filter(b => b.order >= 1 && b.nodes.length > 1).map((b) => {
        const a = b.nodes[0], z = b.nodes[b.nodes.length - 1], dl = Math.hypot(z.x - a.x, z.y - a.y, z.z - a.z) || 1;
        const mid = b.nodes[Math.floor(b.nodes.length / 2)];
        return { x: mid.x, y: mid.y + mid.r, z: mid.z, ax: (z.x - a.x) / dl, ay: 0, az: (z.z - a.z) / dl, nx: 0, ny: 1, nz: 0, length: Math.min(1.2, dl) };
      }).sort((a, b) => b.y - a.y)
      : skeleton.leaves.filter(site => site.ny >= 0.6).sort((a, b) => b.y - a.y);
    // one pad a height band down the crown (the bands split the upward sprays' span), each on the band's spray turned
    // farthest round the stem from the pad above it; the top two bands always load, the lower ones by the load
    const yHi = upward.length ? upward[0].y : 0, yLo = upward.length ? upward[upward.length - 1].y : 0;
    const band = Math.max(1e-3, yHi - yLo) / maxPads;
    let lastAz: number | null = null;
    for (let k = 0; k < maxPads && upward.length; k++) {
      const top = yHi - k * band, bottom = top - band;
      let site: (typeof upward)[number] | null = null, best = -1;
      for (const candidate of upward) {
        if (candidate.y > top + 1e-6 || candidate.y <= bottom - (k === maxPads - 1 ? 1e-6 : 0)) continue;
        const az = Math.atan2(candidate.z, candidate.x);
        const turn = lastAz === null ? candidate.ny : Math.abs(Math.atan2(Math.sin(az - lastAz), Math.cos(az - lastAz)));
        if (turn > best) { best = turn; site = candidate; }
      }
      if (!site) continue;
      const heightT = clamp(site.y / skeleton.height, 0, 1);
      if (k >= 2 && rng() > snow * (0.6 + 0.4 * heightT)) continue;
      // out along the bough, where the load shows past the sprays above it
      const along = site.length * 0.45;
      const cx = site.x + site.ax * along, cy = site.y + site.ay * along, cz = site.z + site.az * along;
      // a limb's load follows its spray: one flat pad lying along it, a little out from its seat
      const lr = site.length * 0.15 * (0.8 + rng() * 0.4);
      const yaw = Math.atan2(site.ax, site.az) + Math.PI / 2;
      const lobe = new THREE.IcosahedronGeometry(lr, 0);
      shapeTreeSnowLobe(lobe, rng);
      lobe.scale(1.7, 0.26, 1.0);
      lobe.rotateY(yaw + (rng() - 0.5) * 0.5);
      lobe.translate(cx + site.nx * 0.05, cy + site.ny * 0.05, cz + site.nz * 0.05);
      _c.setHSL(0.585, 0.04, 0.62, THREE.SRGBColorSpace).multiplyScalar(1.55);
      parts.push(paintFlat(lobe, _c.clone(), 0.12));
      lastAz = Math.atan2(site.z, site.x);
    }
  }
  // the grown wood and cards are emitted as flat triangle lists; welded (identical vertices shared, an index) they draw
  // through the vertex cache: a ring vertex of a tube runs once instead of six times, a card's four triangles from six
  // vertices instead of twelve — fewer vertex invocations per grown tree than the flat legacy tree it replaces
  // the crown supports (treeAttachments.ts's contract), measured on the flat wood before the weld (the wood leads the
  // merge, so its branch ranges hold; they leave its userData first, so the merge records none)
  const branchRanges = parts[0].userData.branchRanges ?? [];
  delete parts[0].userData.branchRanges;
  const flatTrunk = mergeParts(parts);
  // trees round 4 (the cost hold: the near tier's trunks the frame's largest vegetation class, 1.2 M triangles at
  // Verdant's chase): a thin branch's tube — a limb or a twig under 5 cm at its base, the tube law's three sides — carries
  // aWoodFine, and the bark program draws it no farther than GROWTH_WOOD_FINE_FAR from the camera, where it is a pixel
  // wide inside the crown; a snag's bare wood is its whole silhouette and keeps every branch
  if (species !== 'snag') {
    const fine = new Float32Array(flatTrunk.getAttribute('position').count);
    skeleton.branches.forEach((branch, i) => {
      const range = branchRanges[i];
      if (!range || branch.order === 0) return;
      const r0 = branch.nodes[0].r;
      if (r0 <= GROWTH_WOOD_FINE_R) fine.fill(1, range[0], range[1]);
      else if (r0 <= GROWTH_WOOD_MID_R) fine.fill(2, range[0], range[1]);
    });
    flatTrunk.setAttribute('aWoodFine', new THREE.BufferAttribute(fine, 1));
  }
  const crownAttachments = growthCrownAttachments(skeleton, flatTrunk, branchRanges);
  const trunk = weldGrownGeometry(flatTrunk);
  if (tidal) {
    // the stilt roots' receipt (treeGrowth.selftest): the stem's triangle corners in the welded index (the wood leads
    // the merge) and each arch's vertex range in the welded trunk (the weld keeps first-seen order and an arch shares
    // no corner with the wood or the collar)
    const index = trunk.index!.array, arches: Array<readonly [number, number]> = [];
    let corner = 0;
    for (let i = 0; i < rootEnd; i++) {
      const n = parts[i].index ? parts[i].index!.count : parts[i].getAttribute('position').count;
      if (i >= rootFirst) {
        let lo = Infinity, hi = -1;
        for (let c = corner; c < corner + n; c++) { lo = Math.min(lo, index[c]); hi = Math.max(hi, index[c]); }
        arches.push([lo, hi + 1]);
      }
      corner += n;
    }
    trunk.userData.stiltRoots = { variant, stemCorners: branchRanges[0] ?? [0, 0], arches };
  }
  trunk.userData.crownAttachments = crownAttachments;
  trunk.userData.originalTrunkVertices = trunk.getAttribute('position').count;
  trunk.userData.trunkQuality = {
    family: profile.family === 'dead' ? 'broadleaf' : profile.family, radialSegments: GROWTH_TUBE_SIDES.desktop[0],
    verticalSegments: stem.nodes.length - 1, rootButtresses: roots, rootFlare: true, organicWarp: true,
  };
  // a winter palette's snow lies on the sprays that face the sky: the atlas paints it on its top tile row only
  // (treeSprayAtlas.ts), so the upward sprays high in the crown take those snow-laden tiles and every other spray —
  // the side and under faces a viewer on the ground mostly sees — a bare one. A position hash decides (no draw from
  // the tree's stream); the column of the tile is kept.
  if (snow > 0.05) {
    for (const site of skeleton.leaves) {
      const heightT = clamp(site.y / skeleton.height, 0, 1);
      // trees round 2: a spray takes the load where the crown's surface faces the sky (the lobes' union at the card's
      // centre), so the snow lies over the upper crown and along the tiers' tops instead of wherever a spray's own face
      // happens to turn up
      const hull = crownSurfaceNormal(skeleton, site.x + site.ax * site.length * 0.45, site.y + site.ay * site.length * 0.45,
        site.z + site.az * site.length * 0.45);
      const up = Math.max(clamp((site.ny - 0.3) / 0.45, 0, 1) * 0.5, clamp((hull[1] - 0.05) / 0.55, 0, 1));
      const hash = Math.sin(site.x * 12.9898 + site.y * 78.233 + site.z * 37.719) * 43758.5453;
      const laden = hash - Math.floor(hash) < up * (0.45 + 0.55 * heightT) * Math.min(1, snow * 1.1);
      site.tile = (laden ? 0 : SPRAY_ATLAS_TILES) + (site.tile % SPRAY_ATLAS_TILES);
    }
  }
  // the card tint law of the grown crowns: the legacy HSL multiplier around the atlas (hue and saturation from the map
  // palette or the family default), a dark interior and a lit shell from the site's shade, a little per-spray jitter;
  // a snow-laden spray takes the snow's neutral, lifted tint (its painted snow stays white, its needles frosted) and a
  // bare one none. The gain sits a little over the legacy 1.7: the spray atlases paint a touch darker than the round-8
  // ones.
  const [hueBase, satBase, gain] = grownTintLaw(profile.family, pal.birchLeaves === true, pal.bare === true);
  const hue0 = pal.cardHue ?? hueBase, sat0 = pal.cardSat ?? satBase;
  // a palm's frond atlas holds one frond (makePalmFrondAtlas); its dead fronds (shade 0) are straw-brown
  const palm = profile.family === 'palm';
  let cards = weldGrownGeometry(emitLeafCards(skeleton, {
    tiles: palm ? 1 : SPRAY_ATLAS_TILES, rng: mulberry32((seed ^ 0x5eed) >>> 0), rows: growthCardRows(profile.family),
    stemWidth: GROWTH_CROWN_STEM_WIDTH,
    tint(shade, site, r) {
      const jitter = r();
      const sk = snow > 0.05 && site.tile < SPRAY_ATLAS_TILES ? 0.85 + jitter * 0.15 : 0;
      const dead = palm && shade <= 0;
      _c.setHSL(dead ? 0.085 + (r() - 0.5) * 0.02 : hue0 + (r() - 0.5) * 0.06 + (0.585 - hue0) * sk,
        dead ? 0.34 + r() * 0.06 : (sat0 + r() * 0.06) * (1 - sk * 0.85) + 0.02 * sk, 0.5, THREE.SRGBColorSpace);
      // a laden spray's lift brightens its painted snow far more than its dark needles (the tint multiplies the
      // texel): the snow reads as snow beside the snowfield, the needles under it stay dark. Trees round 2: a crown
      // with lobes darkens its cards by their depth in it (treeGrowth.ts emitLeafCards); the crown gain gives the lit
      // shell back what that darkening takes
      const value = (0.52 + 0.48 * shade) * (0.92 + r() * 0.16) * (1 + sk * 1.6) * (profile.foliageValue ?? 1)
        * (skeleton.lobes ? GROWTH_CROWN_SHADING.crownGain : 1);
      return [_c.r * gain * value, _c.g * gain * value, _c.b * gain * value];
    },
  }));
  // trees round 2: a palm's fronds keep their authored arch — no billboard frame (foliageWindHook COT_LEAF_BILLBOARD)
  // (built fresh without the frame's two streams, never trimmed with deleteAttribute: the cards are drawn every frame,
  // and an attributes object that lost keys slows three's per-frame update of every geometry, geometryStreams.ts)
  if (palm) cards = keepStreams(cards, Object.keys(cards.attributes).filter((name) => name !== 'aAxis' && name !== 'aLeaf'));
  // the crown's own shadow hull rides on the trunk (createTreeMeshPools builds the pool's proxy from it); a mangrove's
  // stilt arches cast with it
  // trees round 2: the hull's wood, then its crown masses, each with the share of the sun its sprays let through (the
  // tree's own atlas share of opaque leaf: crownShadowDapple.ts opens each mass that far)
  const crownHull = emitCrownShadowHull(skeleton, 8, SPRAY_ATLAS_COVERAGE[grownFormSprayKind(species, pal)] ?? undefined);
  let hull: Float32Array = crownHull;
  trunk.userData.shadowHullMasses = crownHull.masses;
  if (tidal) {
    const arches = parts.slice(rootFirst, rootEnd).map((g) => (g.index ? g.toNonIndexed() : g).getAttribute('position').array as Float32Array);
    const joined = new Float32Array(hull.length + arches.reduce((n, a) => n + a.length, 0));
    joined.set(hull);
    let o = hull.length;
    for (const a of arches) { joined.set(a, o); o += a.length; }
    hull = joined;
  }
  trunk.userData.shadowHull = hull;
  return { trunk, cards };
}

/**
 * p2 trees lane (2026-10-01): the share of a battlefield's trees that stand as shell-killed snags — read off the map's
 * crater count (how fought-over the authored field is): a farmland map with a few dozen craters keeps one dead tree
 * in forty, a shelled district one in sixteen. 0 without craters (and wherever a config carries no props block).
 */
function battleSnagShare(cfg: VegetationMapConfig | null): number {
  const craters = Number(cfg?.props?.craters ?? 0);
  if (!(craters > 0)) return 0;
  // trees round 3 (2026-10-03, the gauntlet's wave 31: the snags read as a sick species recurring on every front): a
  // third of the round-1 share — a shattered trunk here and there by the craters, not a tree in every stand
  return Math.min(0.025, 0.004 + (craters / 120) * 0.017);
}

/**
 * p2 trees lane: the snag's far stand-in (the impostor atlas holds the living species only): its broken stem as a
 * tapered six-sided pole with two or three limb stubs, and a token of dead twig mass at the stubs — a dark mark on
 * a far stand, the way a burnt tree reads across a field.
 */
function buildSnagFarGeometry(rng: RandomSource, k: number): FarTreeGeometryPair {
  const trunkParts: THREE.BufferGeometry[] = [], canopyParts: THREE.BufferGeometry[] = [];
  const H = 4.6 + k * 0.8 + rng() * 0.6;
  const trunk = new THREE.CylinderGeometry(0.12, 0.30, H, 6, 1);
  trunk.translate(0, H / 2, 0);
  _c.setRGB(0.30, 0.28, 0.26);
  trunkParts.push(paintFlat(trunk, _c.clone(), 0));
  const stubs = 2 + ((rng() * 2) | 0);
  for (let i = 0; i < stubs; i++) {
    const len = 0.8 + rng() * 1.2;
    const limb = new THREE.CylinderGeometry(0.03, 0.08, len, 4, 1);
    limb.translate(0, len / 2, 0);
    limb.rotateZ(0.8 + rng() * 0.6);
    limb.rotateY(rng() * Math.PI * 2);
    limb.translate(0, H * (0.45 + rng() * 0.4), 0);
    trunkParts.push(paintFlat(limb, _c.clone(), 0.1));
    // (trees round 3: a small dark token where the near snag's limbs end — the shattered trunk carries no crown)
    const twigs = new THREE.IcosahedronGeometry(0.18 + rng() * 0.1, 0);
    twigs.scale(1.2, 0.5, 1.2);
    sphereNormals(twigs, 0, 0, 0, 0.5);
    twigs.translate((rng() - 0.5) * 1.6, H * (0.55 + rng() * 0.35), (rng() - 0.5) * 1.6);
    canopyParts.push(paintCanopy(twigs, 0.07, 0.10, 0.16, 0.22, H * 0.4, H, rng, 0.2));
  }
  return { trunk: mergeParts(trunkParts), canopy: mergeParts(canopyParts) };
}

/** Deterministic near-trunk geometry used by the strict visual/shape audit. */
export function buildTreeTrunkAuditGeometry(
  species: TreeSpecies,
  seed = 0x71ee,
  palette: VegetationPalette = {},
): THREE.BufferGeometry {
  // p2 trees lane: the desktop tiers' near trunk is the grown one (every species, the palm included); the mobile tier's
  // the legacy builder below
  if (vegetationGrowsTrees()) return buildGrownTree(species, seed, 1, palette).trunk;
  const rng = mulberry32(seed);
  const archetype = TREE_ARCHETYPES[species];
  if (archetype.family === 'conifer') {
    const geometry = buildPineTrunk(rng, palette);
    const scale = TREE_GEOMETRY_SCALE[species];
    geometry.scale(scale[0], scale[1], scale[2]);
    return geometry;
  }
  if (archetype.family === 'palm') return buildPalmGeometry(rng).trunk;
  if (archetype.family === 'birch') {
    const geometry = buildBirchGeometry(rng, palette).trunk;
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

function canopyJitterNoise(key: number): number {
  key = Math.imul(key ^ key >>> 16, 0x7feb352d);
  key = Math.imul(key ^ key >>> 15, 0x846ca68b);
  return ((key ^ key >>> 16) >>> 0) / 4294967296;
}

function canopyCornerKey(x: number, y: number, z: number, seed: number): number {
  // Micrometre keys join duplicated shell corners, including cone UV seams.
  return seed ^ Math.imul(Math.round(x * 1e6), 73856093)
    ^ Math.imul(Math.round(y * 1e6), 19349663) ^ Math.imul(Math.round(z * 1e6), 83492791);
}

function jitterFarShell(
  geo: THREE.BufferGeometry,
  rng: RandomSource,
  amount: number,
): THREE.BufferGeometry {
  const pos = attribute(geo, 'position');
  let seed: number | undefined;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    if (Math.hypot(x, z) > 1e-4) {
      // Preserve both historical draws per eligible vertex, even duplicates.
      const draw = rng();
      rng();
      if (seed === undefined) seed = (draw * 4294967296) >>> 0;
      if (amount === 0) continue;
      const y = pos.getY(i), key = canopyCornerKey(x, y, z, seed);
      const f = 1 + (canopyJitterNoise(key) - 0.5) * 2 * amount;
      pos.setX(i, Math.abs(x) < 1e-10 ? 0 : x * f);
      pos.setZ(i, Math.abs(z) < 1e-10 ? 0 : z * f);
      pos.setY(i, y + (canopyJitterNoise(key ^ 0x9e3779b9) - 0.5) * amount * 0.8);
    }
  }
  // Callers replace every normal after final scaling. The near palm core
  // shares this joined-corner law so its small solid crown cannot split.
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
  // vista pass (2026-09-19): a touch darker and more saturated, matching the leafy near cards at the LOD edge
  const hue = cp.hue ?? 0.24, sat = cp.sat ?? 0.37, l0 = cp.l0 ?? 0.205, l1 = cp.l1 ?? 0.31;
  const trunkParts: THREE.BufferGeometry[] = [], canopyParts: THREE.BufferGeometry[] = [];
  // r3: far variant 1 is a taller, narrower crown (matches the near
  // columnar shape) so distant stands mix two silhouettes
  const tallF = fvi === 1 ? 1.28 : 1.0, wideF = fvi === 1 ? 0.78 : 1.0;
  const trunkH = fvi === 1 ? 3.6 : 2.9;
  // r6: thicker far trunk (0.20/0.36 -> 0.32/0.55) — sub-pixel trunks at
  // 400 m+ vanished and rim-forest crowns read as floating saucers
  const trunk = new THREE.CylinderGeometry(0.30, 0.44, trunkH, 6, 1);
  shapeFarTreeBase(trunk, 0.7 + fvi * 1.3);
  trunk.translate(0, trunkH / 2, 0);
  _c.setHSL(0.07, 0.26, 0.23, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(trunk, _c, 0));
  const addCanopyLobe = (index: number): void => {
    const big = index === 0
      ? 1
      : (index < 3 ? 0.62 + rng() * 0.32 : 0.30 + rng() * 0.26);
    const blob = new THREE.IcosahedronGeometry((1.25 + rng() * 0.6) * big, 0);
    jitterFarShell(blob, rng, index < 3 ? 0.34 : 0.46);
    blob.scale(
      (1.1 + rng() * 0.3) * wideF,
      (0.72 + rng() * 0.25) * tallF,
      (1.1 + rng() * 0.3) * wideF,
    );
    sphereNormals(blob, 0, 0, 0, 0.5); // round 77: half the up-bias — a lit side and a shaded side at range
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
  // vista pass (2026-09-19): far crowns sat a stop paler than the leafy near cards; darker, more saturated
  // needles, 4-5 unequal tiers and six tufts break the lathe-cone read at range
  const hue = cp.hue ?? 0.315, sat = cp.sat ?? 0.36, l0 = cp.l0 ?? 0.165, l1 = cp.l1 ?? 0.27;
  const trunkParts: THREE.BufferGeometry[] = [], canopyParts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.40, 2.2, 5, 1); // r6: see oak far trunk
  shapeFarTreeBase(trunk, 1.9);
  trunk.translate(0, 1.1, 0);
  _c.setHSL(0.06, 0.28, 0.19, THREE.SRGBColorSpace);
  trunkParts.push(paintFlat(trunk, _c, 0));
  // r7: randomized tier count/placement + deeper jitter — the fixed 3-tier
  // table stamped the same lathe-perfect stacked-cone silhouette on every
  // instance ("dozens of identical stacked cones" critique)
  const nTier = 4 + ((rng() * 2) | 0);
  const baseY = 1.2 + rng() * 0.5;
  const topYf = 5.6 + rng() * 0.9;
  for (let ti = 0; ti < nTier; ti++) {
    const tt = ti / (nTier - 1);
    const y = baseY + (topYf - baseY) * tt * (0.9 + rng() * 0.2) - 0.5;
    const r = ((1 - tt) * 1.35 + 0.45) * (0.72 + rng() * 0.62);
    const h = 1.6 + (1 - tt) * 1.2 + rng() * 0.5;
    // PERF (performance_budget r3): 8x2 closed cone -> 7x1 open cone (40 ->
    // 21 tris). The base cap is never visible from gameplay camera heights
    // and the tier stack hides the lost height ring; jitter keeps the
    // silhouette ragged. See the oak-lobe decimation note above.
    const cone = new THREE.ConeGeometry(r, h, 9, 1, true);
    jitterFarShell(cone, rng, 0.50);
    sphereNormals(cone, 0, h * -0.25, 0, 0.40); // radial+up: lit side / sky-filled side (round 77: bias halved)
    cone.translate((rng() - 0.5) * 0.55, y + h / 2, (rng() - 0.5) * 0.55);
    canopyParts.push(paintCanopy(cone, hue, sat, l0, l1, 1.2, 6.6, rng, 0.35));
  }
  // r5: a few branch-tuft satellites poking through the tier line so the far
  // pine silhouette is ragged like the near card LOD, not a lathe object
  for (let b = 0; b < 6; b++) {
    const a = rng() * Math.PI * 2, ty = 1.8 + rng() * 3.4;
    const t = (ty - 1.2) / 5.4;
    const rr = (1.0 - t) * 1.5 + 0.35;
    const tuft = new THREE.IcosahedronGeometry(0.38 + rng() * 0.3, 0);
    jitterFarShell(tuft, rng, 0.4);
    tuft.scale(1.3, 0.7, 1.3);
    sphereNormals(tuft, 0, 0, 0, 0.45); // round 77: bias halved
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
    if (i === 0) shapeFarTreeBase(seg, leanA);
    seg.rotateZ(-Math.atan2(Math.hypot(x1 - x0, z1 - z0), H / NSEG));
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
  jitterFarShell(core, rng, 0.28);
  core.scale(1.35, 0.62, 1.35);
  sphereNormals(core, 0, 0, 0, 0.6); // round 77: bias halved
  core.translate(px, H + 0.1, pz);
  canopyParts.push(paintCanopy(core, cp.hue ?? 0.232, cp.sat ?? 0.30,
    (cp.l0 ?? 0.21) * 0.85, cp.l1 ?? 0.33, H - 0.5, H + 0.6, rng, 0.25));
  // dead-frond skirt: a ring of drooping khaki mass under the crown — the
  // second value the range silhouette needs so it reads palm, not asterisk
  const skirt = new THREE.IcosahedronGeometry(0.85, 0); // PERF r3: far-LOD detail 0 (see oak note)
  jitterFarShell(skirt, rng, 0.3);
  skirt.scale(1.25, 0.45, 1.25);
  sphereNormals(skirt, 0, 0, 0, 0.4); // round 77: bias halved
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
  shapeFarTreeBase(trunk, 2.8);
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
    jitterFarShell(blob, rng, 0.45);
    blob.scale(0.72, 1.6 + rng() * 0.5, 0.72);
    sphereNormals(blob, 0, 0, 0, 0.5); // round 77: bias halved
    blob.translate((rng() - 0.5) * 2.1, H * 0.74 + (rng() - 0.4) * 1.7, (rng() - 0.5) * 2.1);
    canopyParts.push(paintCanopy(blob, cp.hue ?? 0.06, cp.sat ?? 0.07,
      cp.l0 ?? 0.26, cp.l1 ?? 0.38, H * 0.4, H, rng, 0.35));
  }
  return { trunk: mergeParts(trunkParts), canopy: mergeParts(canopyParts) };
}

interface BushSprayBuffers {
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  color: Float32Array;
  flex: Float32Array;
}

// Two wings share an outward crease: one convex leaf cluster, with a
// continuous atlas across all four triangles rather than crossed flat walls.
function writeBushSpray(
  buffers: BushSprayBuffers, offset: number,
  cx: number, cy: number, cz: number, width: number,
  pitch: number, yaw: number, roll: number, shade: number,
): void {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), ca = Math.cos(yaw), sa = Math.sin(yaw);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const rx = ca * cr + sa * sp * sr, ry = cp * sr, rz = -sa * cr + ca * sp * sr;
  const ux = -ca * sr + sa * sp * cr, uy = cp * cr, uz = sa * sr + ca * sp * cr;
  for (let v = 0; v < 12; v++) {
    const corner = v % 6;
    const right = corner === 2 || corner === 4 || corner === 5;
    const top = corner === 0 || corner === 2 || corner === 5;
    const column = Math.floor(v / 6) + (right ? 1 : 0), u = column * 0.5;
    const x = (u - 0.5) * width * (top ? 0.90 : 1);
    const y = (top ? 0.4 : -0.4) * width;
    const fold = column === 1 ? width * 0.15 : 0;
    const i = offset + v, p = i * 3;
    buffers.position[p] = cx + rx * x + ux * y + sa * cp * fold;
    buffers.position[p + 1] = cy + ry * x + uy * y - sp * fold;
    buffers.position[p + 2] = cz + rz * x + uz * y + ca * cp * fold;
    // Use the actual packed vertex, not one card-center normal. The positive
    // upward floor retains lateral form without the old downward black pole.
    let nx = buffers.position[p], ny = (buffers.position[p + 1] - 0.55) * 0.65;
    let nz = buffers.position[p + 2];
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; nz /= length; ny = Math.max(0.28, ny / length + 0.55);
    const inverse = 1 / Math.hypot(nx, ny, nz);
    buffers.normal[p] = nx * inverse;
    buffers.normal[p + 1] = ny * inverse;
    buffers.normal[p + 2] = nz * inverse;
    const value = shade * (0.88 + 0.18 * clamp((buffers.position[p + 1] + 0.1) / 1.6, 0, 1));
    buffers.color[p] = _c.r * 1.7 * value;
    buffers.color[p + 1] = _c.g * 1.7 * value;
    buffers.color[p + 2] = _c.b * 1.7 * value;
    buffers.uv[i * 2] = u; buffers.uv[i * 2 + 1] = top ? 1 : 0;
    buffers.flex[i] = 0.22;
  }
}

// Exact minimum among a folded spray's two bottom edges and its crease.
// Pitch/roll keep its local long axis upwards, so the tapered top is higher.
function bushSprayBottom(width: number, pitch: number, roll: number): number {
  const cp = Math.cos(pitch);
  return width * (-0.4 * cp * Math.cos(roll)
    + Math.min(-0.5 * Math.abs(cp * Math.sin(roll)), -0.15 * Math.sin(pitch)));
}

function bushSprayPitch(branch: number, variation: number): number {
  if (branch >= 12) return -1.00 + variation * 0.28;
  if (branch < 4) return 0.35 + variation * 0.45;
  return (variation - 0.5) * 1.20;
}

// Four irregular grounded branches, eight overlapping interior clusters and
// four upper shoots. 16 folded sprays retain64 triangles/192 vertices, with
// no temporary geometry or per-frame work. They form a body, not a saucer.
function buildBushCards(rng: RandomSource, pal: VegetationPalette = {}): THREE.BufferGeometry {
  const hue0 = pal.cardHue ?? 0.24, sat0 = pal.cardSat ?? 0.26;
  const buffers: BushSprayBuffers = {
    position: new Float32Array(192 * 3), normal: new Float32Array(192 * 3),
    uv: new Float32Array(192 * 2), color: new Float32Array(192 * 3), flex: new Float32Array(192),
  };
  for (let i = 0; i < 16; i++) {
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = Math.pow(0.3 + 0.7 * rng(), 0.8);
    const w = 0.72 + rng() * 0.55;
    const pitchRoll = rng(), yawRoll = rng(), rollRoll = rng();
    const shadeRoll = rng(), hueRoll = rng(), satRoll = rng(); // Exact old11-draw/node stream.
    _c.setHSL(hue0 + (hueRoll - 0.5) * 0.055, sat0 * 0.85 + satRoll * 0.04, 0.5, THREE.SRGBColorSpace);
    const lower = i < 4, upper = i >= 12;
    const direction = lower ? i * Math.PI * 0.5 + (yawRoll - 0.5) * 0.90 : Math.atan2(dx, dz);
    const yaw = direction + (yawRoll - 0.5) * 0.65;
    // Upper clusters arch over the body, rather than repeating the upright
    // skirt as four tall blades. Interior branches cross at varied angles.
    const pitch = bushSprayPitch(i, pitchRoll);
    const roll = (rollRoll - 0.5) * (lower ? 0.70 : 1.30);
    const radius = lower ? 0.46 + rad * 0.24 : upper ? 0.10 + rad * 0.36 : rad * 0.52;
    const shade = (0.60 + 0.30 * rad) * (0.94 + shadeRoll * 0.12);
    const cy = lower ? -0.045 - bushSprayBottom(w, pitch, roll)
      : upper ? 0.82 + dy * 0.10 : 0.55 + dy * 0.18;
    writeBushSpray(buffers, i * 12, Math.sin(direction) * radius, cy, Math.cos(direction) * radius,
      w, pitch, yaw, roll, shade);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(buffers.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(buffers.normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(buffers.uv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(buffers.color, 3));
  geometry.setAttribute('aFlex', new THREE.BufferAttribute(buffers.flex, 1));
  return geometry;
}

/** Trees round 4: the mantle's spacing along a closed wood's outline (m; placeUnderstorey). */
const UNDERSTOREY_MANTLE_SPACING_M = 6;
/** Trees round 4: the concealment a tree's disc adds (0.08) and under: the discs the understorey keeps to (a bush's is 0.35). */
const MANTLE_TREE_COVER_MAX = 0.1;
/**
 * Trees round 4: the understorey shrub's height (its scale × its height jitter: the mound about a metre tall at unit
 * scale) over which it screens a hull — a shrub that tall stands in the wood's cover inside the playable square
 * (placeUnderstorey).
 */
const UNDERSTOREY_SCREEN_M = 1.2;
/**
 * Trees round 4: the height range (m, the same measure) a refused shrub is capped to — a shrub out of the wood's cover
 * that would screen a hull keeps its place as young growth, its whole form scaled down to a height jittered over this
 * range by a hash of its place (placeUnderstorey).
 */
const UNDERSTOREY_CAP_M = Object.freeze([0.6, 1.2] as const);

// Round 77 (2026-09-26): the understorey — young growth at the forest edges. A smaller, looser shrub than the field
// bush (ten folded sprays, 40 triangles, 120 vertices: four grounded branches, four interior clusters, two upright
// shoots) on the bush species' atlas, a touch yellower (young leaves). Its own geometry and its own RNG, so the shrub
// receipts' two bush shapes and every placement stream stay exactly theirs.
function buildUnderstoreyCards(rng: RandomSource, pal: VegetationPalette = {}): THREE.BufferGeometry {
  const hue0 = (pal.cardHue ?? 0.24) + 0.015, sat0 = pal.cardSat ?? 0.26;
  const count = 10;
  const buffers: BushSprayBuffers = {
    position: new Float32Array(count * 36), normal: new Float32Array(count * 36),
    uv: new Float32Array(count * 24), color: new Float32Array(count * 36), flex: new Float32Array(count * 12),
  };
  for (let i = 0; i < count; i++) {
    let dx = rng() * 2 - 1, dy = rng() * 2 - 1, dz = rng() * 2 - 1;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    const rad = Math.pow(0.3 + 0.7 * rng(), 0.8);
    const w = 0.55 + rng() * 0.45;
    const pitchRoll = rng(), yawRoll = rng(), rollRoll = rng();
    const shadeRoll = rng(), hueRoll = rng(), satRoll = rng();
    _c.setHSL(hue0 + (hueRoll - 0.5) * 0.05, sat0 * 0.9 + satRoll * 0.05, 0.5, THREE.SRGBColorSpace);
    const lower = i < 4, upper = i >= 8;
    const direction = lower ? i * Math.PI * 0.5 + (yawRoll - 0.5) * 0.9 : Math.atan2(dx, dz);
    const yaw = direction + (yawRoll - 0.5) * 0.65;
    const pitch = upper ? -1.15 + pitchRoll * 0.3 : lower ? 0.4 + pitchRoll * 0.4 : (pitchRoll - 0.5) * 1.1;
    const roll = (rollRoll - 0.5) * (lower ? 0.6 : 1.2);
    const radius = lower ? 0.34 + rad * 0.18 : upper ? 0.06 + rad * 0.22 : rad * 0.38;
    const shade = (0.62 + 0.30 * rad) * (0.94 + shadeRoll * 0.12);
    const cy = lower ? -0.04 - bushSprayBottom(w, pitch, roll) : upper ? 0.62 + dy * 0.08 : 0.40 + dy * 0.14;
    writeBushSpray(buffers, i * 12, Math.sin(direction) * radius, cy, Math.cos(direction) * radius,
      w, pitch, yaw, roll, shade);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(buffers.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(buffers.normal, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(buffers.uv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(buffers.color, 3));
  geometry.setAttribute('aFlex', new THREE.BufferAttribute(buffers.flex, 1));
  return geometry;
}

function garageTreePalette(
  cfg: VegetationMapConfig | null,
  species: Species,
): VegetationPalette {
  const palettes = cfg?.vegetation?.palettes || {};
  const family = TREE_ARCHETYPES[species].family;
  return palettes[species]
    || (family === 'conifer' ? palettes.pine : undefined)
    || (family === 'birch' ? palettes.birch : undefined)
    || (family === 'palm' ? palettes.palm : palettes.oak)
    || {};
}

export function buildDetailedGarageTree(
  species: Species,
  seed: number,
  variantIndex: number,
  palette: VegetationPalette,
): GarageTreeGeometryBuild {
  const archetype = TREE_ARCHETYPES[species];
  let pair: TreeGeometryPair;
  let foliageTexture: THREE.Texture;
  switch (archetype.family) {
    case 'conifer': {
      const scale = TREE_GEOMETRY_SCALE[species];
      pair = {
        trunk: buildPineTrunk(mulberry32(seed + 61 + variantIndex * 101), palette),
        cards: buildPineCards(mulberry32(seed + 63 + variantIndex * 101), 0.60, 1, palette),
      };
      pair.trunk.scale(scale[0], scale[1], scale[2]);
      pair.cards.scale(scale[0], scale[1], scale[2]);
      foliageTexture = makeNeedleSprayTexture(mulberry32(seed + 52), palette.texTone || null);
      break;
    }
    case 'palm':
      pair = buildPalmGeometry(mulberry32(seed + 81 + variantIndex * 101), palette, {
        h0: 4.7 + variantIndex * 0.85,
        hr: 1.15,
        rMul: 1.30 - variantIndex * 0.14,
        lean0: 0.42 + variantIndex * 0.12,
        leanR: 0.45,
      });
      foliageTexture = makePalmFrondTexture(mulberry32(seed + 53), palette.texTone || null);
      break;
    case 'birch': {
      pair = buildBirchGeometry(mulberry32(seed + 85 + variantIndex * 101), palette, {
        h0: 4.8 + variantIndex * 1.15,
        hr: 1.15,
        crw: 1.25 + variantIndex * 0.28,
        nBr: 12 + variantIndex * 2,
      });
      const scale = TREE_GEOMETRY_SCALE[species];
      pair.trunk.scale(scale[0], scale[1], scale[2]);
      pair.cards.scale(scale[0], scale[1], scale[2]);
      foliageTexture = makeBirchFoliageTexture(mulberry32(seed + 54), palette);
      break;
    }
    default: {
      const shape: BroadleafShape = {
        cy: archetype.canopyCenterM,
        rx: archetype.canopyRadiusM,
        ry: Math.max(1.15, archetype.fallHeightM - archetype.canopyCenterM),
        rz: archetype.canopyRadiusM * (0.88 + variantIndex * 0.08),
        trunkH: archetype.trunkHeightM,
      };
      pair = {
        trunk: buildBroadleafTrunk(mulberry32(seed + 65 + variantIndex * 101), shape),
        cards: buildBroadleafCards(
          mulberry32(seed + 67 + variantIndex * 101),
          36 + variantIndex * 4,
          1,
          palette,
          shape,
        ),
      };
      foliageTexture = makeLeafClusterTexture(mulberry32(seed + 51), palette.texTone || null);
      break;
    }
  }
  if (archetype.family !== 'palm') attachTreeCards(pair);
  return { trunk: pair.trunk, foliage: pair.cards, foliageTexture };
}

/**
 * p2 trees lane (2026-10-02): the desktop Garage's groves grow their trees as the battle's near tier does
 * (buildGrownTree, treeGrowth.ts) — the species' spray atlas (the pinnate frond atlas for the palm) and the four-style
 * bark sheet its styled UVs read (prepareTreeBarkSurface). The phones' Garage keeps the round-8 trees
 * (buildDetailedGarageTree, whose crown-attachment contract main's treeAttachments receipt holds).
 */
function buildGrownGarageTree(
  species: Species,
  seed: number,
  variantIndex: number,
  palette: VegetationPalette,
): GarageTreeGeometryBuild {
  const pair = buildGrownTree(species as GrowthSpecies, seed + 65 + variantIndex * 101, variantIndex, palette);
  const bark = makeBarkTexture(seed + 97, TREE_BARK_STYLES);
  prepareTreeBarkSurface(pair.trunk, bark.meanReflectance);
  const snow = palette.snow ?? 0;
  const foliageTexture = species === 'palm'
    ? makePalmFrondAtlas(mulberry32(seed + 53), texSize(512), palette.texTone || null)
    : makeSprayAtlas(grownSprayKind(species, palette), mulberry32(seed + 51), texSize(512),
      snow > 0.05 ? null : palette.texTone || null, snow);
  return { trunk: pair.trunk, foliage: pair.cards, foliageTexture, bark: { albedo: bark.albedo, normal: bark.normal } };
}

/** Native far-stem inspection only: calls the same four constructors used by
 * battlefield far LODs. Species scaling and placement are audited separately. */
export function buildFarTreeTrunkAuditGeometry(family: 'oak'|'pine'|'palm'|'birch', seed=2001): THREE.BufferGeometry {
  const rng=mulberry32(seed);
  const pair=family==='pine'?buildPineFarGeometry(rng)
    :family==='palm'?buildPalmFarGeometry(rng)
    :family==='birch'?buildBirchFarGeometry(rng):buildOakFarGeometry(rng);
  pair.canopy.dispose();
  return pair.trunk;
}

export function buildFallbackGarageTree(
  species: Species,
  seed: number,
  variantIndex: number,
  palette: VegetationPalette,
): GarageTreeGeometryBuild {
  const archetype = TREE_ARCHETYPES[species];
  let pair: FarTreeGeometryPair;
  switch (archetype.family) {
    case 'conifer': {
      pair = buildPineFarGeometry(mulberry32(seed + 71 + variantIndex * 101), palette);
      const radial = archetype.canopyRadiusM / TREE_ARCHETYPES.pine.canopyRadiusM;
      const vertical = archetype.fallHeightM / TREE_ARCHETYPES.pine.fallHeightM;
      pair.trunk.scale(radial, vertical, radial);
      pair.canopy.scale(radial, vertical, radial);
      break;
    }
    case 'palm':
      pair = buildPalmFarGeometry(mulberry32(seed + 75 + variantIndex * 101), palette, variantIndex % 2);
      break;
    case 'birch': {
      pair = buildBirchFarGeometry(mulberry32(seed + 77 + variantIndex * 101), palette);
      const radial = archetype.canopyRadiusM / TREE_ARCHETYPES.birch.canopyRadiusM;
      const vertical = archetype.fallHeightM / TREE_ARCHETYPES.birch.fallHeightM;
      pair.trunk.scale(radial, vertical, radial);
      pair.canopy.scale(radial, vertical, radial);
      break;
    }
    default: {
      pair = buildOakFarGeometry(mulberry32(seed + 73 + variantIndex * 101), palette, variantIndex % 2);
      const radial = archetype.canopyRadiusM / TREE_ARCHETYPES.oak.canopyRadiusM;
      const vertical = archetype.fallHeightM / TREE_ARCHETYPES.oak.fallHeightM;
      pair.trunk.scale(radial, vertical, radial);
      pair.canopy.scale(radial, vertical, radial);
      break;
    }
  }
  if (archetype.family !== 'palm') attachTreeLobes(pair);
  return { trunk: pair.trunk, foliage: pair.canopy, foliageTexture: null };
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
  const k = ((variant % 3) + 3) % 3;
  const palette = garageTreePalette(cfg, species);
  const detailed = typeof document !== 'undefined';
  const build = !detailed ? buildFallbackGarageTree(species, seed, k, palette)
    : vegetationGrowsTrees() ? buildGrownGarageTree(species, seed, k, palette)
      : buildDetailedGarageTree(species, seed, k, palette);
  const { trunk, foliage, foliageTexture, bark } = build;
  const trunkMaterial = new THREE.MeshStandardMaterial({
    map: bark?.albedo ?? null, normalMap: bark?.normal ?? null, vertexColors: true, roughness: 0.92, metalness: 0,
  });
  if (bark) trunkMaterial.normalScale.set(0.85, 0.85);
  const foliageMaterial = new THREE.MeshStandardMaterial({
    map: foliageTexture,
    alphaTest: detailed ? 0.38 : 0,
    alphaToCoverage: detailed,
    side: detailed || species === 'palm' ? THREE.DoubleSide : THREE.FrontSide,
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  // (2026-10-08: the leaves take the sky's full light, as the battlefield's do; materialEnvIntensity.ts)
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
      bark?.albedo.dispose();
      bark?.normal.dispose();
      trunkMaterial.dispose();
      foliageMaterial.dispose();
    },
  };
}

/** Fixed-topology grass cards with a shallow, construction-only normal fan. */
export function buildGrassTuftGeometry(
  w: number,
  h: number,
  planeCount = 2,
  widthScale = 1.12,
): THREE.BufferGeometry {
  const planes: THREE.BufferGeometry[] = [];
  for (let plane = 0; plane < planeCount; plane++) {
    const geometry = new THREE.PlaneGeometry(w * widthScale, h, 1, 1);
    const uv = attribute(geometry, 'uv');
    const normal = attribute(geometry, 'normal');
    for (let vertex = 0; vertex < normal.count; vertex++) {
      // Straight-up normals made every blade an equally bright horizontal
      // receiver. A mostly-up fan gives tips/sides their own form shading
      // without black card backs, a shader branch, or biome recoloring.
      const tip = uv.getY(vertex);
      const nx = (uv.getX(vertex) * 2 - 1) * (0.07 + tip * 0.19);
      const nz = 0.08 + tip * 0.02;
      normal.setXYZ(vertex, nx, Math.sqrt(1 - nx * nx - nz * nz), nz);
    }
    geometry.translate(0, h / 2 - 0.03, 0);
    geometry.rotateY((plane / 2) * Math.PI);
    planes.push(geometry);
  }
  const merged = mergeGeometries(planes, false) as THREE.BufferGeometry;
  for (const geometry of planes) geometry.dispose();
  return merged;
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
// 2026-09-14 environment richness: desktop tiers place 10 % more tree clusters and lone trees
// than the authored per-map counts, restoring the density the road, structure and spawn
// clearances trimmed since 1049e4e (verdant 899 -> 812 trees at the spawn pose). Mobile keeps
// the authored counts. Read at build time, after the device tier is resolved.
// Layout identity (destruction core lane, 2026-10-08, the coordinator's ruling): every tier places what the desktop
// places — a phone's trees are records (trunks block movement and shells, crowns hide), and the authority's indices are
// the desktop's — so the phones' saving is in how a tree draws, never in which trees stand.
export function treeRichness(): number { return 1.1; }

/**
 * Trees round 2 (2026-10-03; Glacier Pass's census, gauntlet wave 4's "lone needle-like grass stalks" on Frosthollow):
 * on a snowbound battlefield (its ground profile's snow climate, groundRedux.ts) the classic grass tufts are dead winter
 * grass — the rimed straw tone on the card wherever the map names none (Frosthollow's own), a sixth of a meadow's density
 * at most (the sparse law then gathers them into clumps, resolveTuftScale), and short: stalks that barely clear the snow
 * (a field-wide stubble patch at 45 %, the stubble law's own height scale) — instead of a spring-green sward pushed
 * through the snowfield. The tall-grass tier's sedge is the ground profile's (tundra). A config, not a code path: the
 * tufts' draws and their placement law stay what they were.
 */
export const SNOW_GRASS_LAW = Object.freeze({ maxDensity: 0.12, heightScale: 0.45 });
function applySnowGrassLaw(veg: VegetationConfig, mapId: string | null): void {
  if (resolveGroundReduxProfile(mapId).climate !== 'snow') return;
  veg.grassTexTone ??= (_h, _s, l) => [0.105, 0.10, clamp(l + 0.36, 0, 1)];
  veg.grassDensity = Math.min(veg.grassDensity, SNOW_GRASS_LAW.maxDensity);
  veg.stubblePatches = [...(veg.stubblePatches ?? []),
    { x0: -700, x1: 700, z0: -700, z1: 700, feather: 1, heightScale: SNOW_GRASS_LAW.heightScale }];
}

/** p2 trees lane (2026-10-01): the desktop tiers grow their near trees (treeGrowth.ts); the mobile tier keeps the
 * legacy card trees. Read at build time, after the device tier is resolved. */
export function vegetationGrowsTrees(): boolean {
  if (getDeviceTier() === 'mobile') return false;
  // the same-build A/B of the tree redesign (the probes): `?legacyTrees=1` keeps the legacy trees on every map
  return !(typeof location !== 'undefined' && /[?&]legacyTrees=1(&|$)/.test(location.search ?? ''));
}

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
  const sliceTimings: Array<{ stage: string; ms: number }> = [];
  let stepStarted = performance.now();
  let r = g.next();
  const recordStep = (result: IteratorResult<BuildYield, VegetationRuntime>): void => {
    const key = result.done ? 'finalize' : (result.value.stage || 'other');
    const ms = performance.now() - stepStarted;
    stageTimings[key] = (stageTimings[key] || 0) + ms;
    sliceTimings.push({ stage: key, ms });
  };
  recordStep(r);
  let i = 0;
  // Fine builds include per-species texture and geometry boundaries. The
  // exact count varies with the biome, so this is an upper-bound progress
  // denominator; createMapAsync advances to the next canonical stage when
  // the generator completes.
  const total = fineSlices ? 160 : 16;
  while (!r.done) {
    const admissionStep = r.value?.stage === 'placementTerrain';
    const shouldTick = admissionStep || fineSlices || !r.value || !r.value.fine || r.value.rowEnd;
    // Admission preparation yields even in coarse builds; its extra sampler
    // rows must not consume the planting progress denominator.
    if (tick && shouldTick) await tick(admissionStep ? i : ++i, total);
    stepStarted = performance.now();
    r = g.next();
    recordStep(r);
  }
  const slowest = sliceTimings.slice().sort((a, b) => b.ms - a.ms).slice(0, 8);
  r.value._buildDetail = {
    ...Object.fromEntries(
      Object.entries(stageTimings).map(([key, ms]) => [key, Math.round(ms)])),
    sliceCount: sliceTimings.length,
    maxSliceMs: slowest[0]?.ms || 0,
    slowest,
  };
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
  // Round 77b (2026-09-26): the far tier bakes its impostor atlas from the near trees where the engine context
  // carries a renderer (production); the receipts (no renderer) and the mobile tier keep the opaque lobe tier.
  const bakeRenderer: TreeImpostorRenderer | null = mobileTier ? null : (engineCtx.renderer ?? null);
  // Phone screens cannot resolve the alpha-card density used by desktop in
  // the midfield; it aliases into crawling grain while spending millions of
  // vertices. Hand off earlier to the terrain meadow and the opaque far-tree
  // silhouettes. Both transitions already use continuous density/LOD fades,
  // so this removes sub-pixel noise without introducing a distance pop.
  const grassFadeEnd = mobileTier ? 224 : GRASS_FADE_END;
  const grassTaperEnd = mobileTier ? 196 : 280;
  const treeNearIn = mobileTier ? 200 : (() => {
    // Round 78 (the performance lane): `?treeNear=<m>` (desktop tiers; the probes' same-build A/B of the near-tier
    // distance) overrides the band's inner radius; the outer keeps the hysteresis width. The shipped band is
    // TREE_NEAR_IN / TREE_NEAR_OUT; nothing else reads the query (the receipts run without a location).
    const q = typeof location !== 'undefined' ? Number((/[?&]treeNear=(\d+)(&|$)/.exec(location.search ?? '') ?? [])[1]) : NaN;
    return q >= 60 && q <= 400 ? q : TREE_NEAR_IN;
  })();
  const treeNearOut = mobileTier ? 225 : treeNearIn + (TREE_NEAR_OUT - TREE_NEAR_IN);
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
  let groundCoverBlocked: GroundCoverBlocked | null = null;
  // trees round 2 (2026-10-03): a snowbound map's classic tufts are dead winter grass (applySnowGrassLaw)
  applySnowGrassLaw(veg, cfg?.id ?? null);
  const grassPerChunk = Math.round(GRASS_PER_CHUNK * veg.grassDensity
    * (mobileTier ? 0.62 : 1));
  const carpetPerCell = Math.round(CARPET_PER_CELL * veg.grassDensity
    * (mobileTier ? 0.72 : 1));

  const uWindTime = { value: 0 };
  // p2 trees lane (2026-10-02): the leaf transmission's strength (canopyLighting.ts), driven each frame from the
  // scene's light model: LEAF_TRANSMISSION under the grounded light, 0 under the legacy rig (its anti-sun fill still
  // lights the backs) and before a light model resolves
  const uLeafTransmission = { value: 0 };
  // Round 77 (2026-09-26): the map's wind (treeClimate.ts) — the direction it blows toward, and (the lean of a
  // nominal-height crown top, 1 / the nominal height, the canopy flutter amplitude); the mobile tier keeps a third
  // of the lean and half the flutter. And the moss its shaded trunk bases grow (0 on the arid and frozen maps).
  const treeWind = resolveTreeWind(cfg);
  const uWindDir = { value: new THREE.Vector2(treeWind.dirX, treeWind.dirZ) };
  const uWind = { value: new THREE.Vector3(
    TREE_WIND_LEAN_M * treeWind.strength * (mobileTier ? TREE_WIND_MOBILE_SCALE.lean : 1),
    1 / TREE_WIND_NOMINAL_HEIGHT_M,
    TREE_WIND_FLUTTER_M * treeWind.strength * (mobileTier ? TREE_WIND_MOBILE_SCALE.flutter : 1),
  ) };
  const uMoss = { value: resolveTrunkMoss(cfg) };
  // trees round 4 (the cost hold): fine wood's reach from the camera (GROWTH_WOOD_FINE_FAR; the phones keep their trunks)
  const uWoodFineFar = { value: mobileTier ? 1e9 : GROWTH_WOOD_FINE_FAR };
  // trees round 4 (the cost hold): a small shrub's thinning (FOLIAGE_SHRUB_THIN; 0 thins none — the phones)
  const uShrubThin = { value: mobileTier ? 0 : FOLIAGE_SHRUB_THIN };
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
      vec3 cotGrassRoot;
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
        // ground footprint of this vertex BEFORE the wind sway (instance space)
        cotGrassRoot = vec3(transformed.x, 0.0, transformed.z);
        float sway = uv.y * uv.y;
        float phase = giw.x * 0.35 + giw.z * 0.28;
        transformed.x += sway * (0.12 * sin(uWindTime * 1.6 + phase) + 0.05 * sin(uWindTime * 3.7 + phase * 2.3));
        transformed.z += sway * 0.08 * cos(uWindTime * 1.3 + phase);
      }`);
    // shadow-stability 2026-09-13 ("flashing shadows from trees when the
    // camera moves"): a blade used to sample the cascade shadow at its swaying
    // fragment position, so every tip crossing a tree-shadow edge flipped
    // between lit and dark, frame after frame, and the chase camera's sub-pixel
    // motion re-dealt those flips across the whole shadow edge. Sample the sun
    // shadow at the blade's ground footprint instead: one blade keeps one
    // shadow state while it moves in the wind, and the shadow edge on grass
    // follows the ground exactly like the terrain under it. Only the shadow
    // lookup moves — lighting, fog and the blade's own position are untouched.
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <shadowmap_vertex>', /* glsl */`
      #if defined( USE_SHADOWMAP )
      {
        vec4 cotGrassShadowWorld = vec4(cotGrassRoot, 1.0);
        #ifdef USE_INSTANCING
          cotGrassShadowWorld = instanceMatrix * cotGrassShadowWorld;
        #endif
        worldPosition = modelMatrix * cotGrassShadowWorld;
      }
      #endif
      #include <shadowmap_vertex>`);
    // ground lane (2026-10-03): a crop tuft carries its crop's albedo negated in the instance colour (makeTuft) — the
    // card's own luminance (its dark roots, its lit tips) over the crop's colour, normalised by the card's mean green
    // blade (≈ 0.22/0.32/0.05 linear, luminance 0.28); every other tuft multiplies its tint as before
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <color_fragment>', /* glsl */`
      #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
        if (vColor.r < 0.0) diffuseColor.rgb = -vColor.rgb * (dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) / 0.28);
        else diffuseColor *= vColor;
      #endif`);
    // ground lane (2026-10-03, waves 13/14: "grass in shadow turns a saturated teal or indigo"): the shaded sward's light
    // as the tall grass takes it — the same text as tallGrass.ts SHADED_SWARD_GLSL (tallGrass.selftest compares them; a
    // copy keeps the carpet's module free of the tall-grass tier): after the chunk, as far as the blade is in shadow
    if (shader.fragmentShader.includes('#include <lights_fragment_end>')) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${SHADED_SWARD_GLSL}`);
    }
    useAttributeNormal(shader);
    mipAlphaGuard(shader); // aa-r1: distance-stable blade coverage
  };

  // Far tufts collapse to one wider plane. At this range their alpha
  // silhouette supplies the entire read, so a crossed second plane is waste.
  const makeTuftFarGeometry = (w: number, h: number): THREE.BufferGeometry =>
    buildGrassTuftGeometry(w, h, 1, 1.5);

  const grassTex: THREE.Texture[] = [];
  grassTex.push(makeGrassCardTexture(mulberry32(seed + 41), 0, veg.grassTexTone));
  yield { stage: 'grassPrep', fine: true };
  grassTex.push(makeGrassCardTexture(mulberry32(seed + 42), 1, veg.grassTexTone));
  yield { stage: 'grassPrep', fine: true };
  function makeGrassMaterial(
    tex: THREE.Texture,
    farDist: number,
    cacheKey: string,
    alphaTest = 0.44,
  ): THREE.MeshLambertMaterial {
    // Lambert is materially cheaper for a rough, non-metallic alpha card and
    // preserves the lighting/shadow response that is actually visible here.
    const mat = new THREE.MeshLambertMaterial({
      map: tex, alphaTest, alphaToCoverage: true, side: THREE.DoubleSide,
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
    height: number;
    radius: number;
  }> = [];
  function* buildGrassVariants(): Generator<BuildYield, void, void> {
    for (let gv = 0; gv < 2; gv++) {
      // r7: taller tuft cards (0.60/0.48 -> 0.74/0.58) — WoT-scale near grass
      // must clearly break the ground plane beside the tracks, not read as a
      // 2 cm moss carpet
      const w = gv === 0 ? 0.92 : 1.14, h = gv === 0 ? 0.74 : 0.58;
      grassVariants.push({
        // The far card is wider; reserve its full width and 0.188 m wind sway.
        height: h - 0.03, radius: w * 0.75 + 0.2,
        geo: buildGrassTuftGeometry(w, h),
        geoFar: makeTuftFarGeometry(w, h), // performance_budget r5 (see builder)
        // Ground cover 2026-09-12: the streamed mid/far tufts cut at 0.34 so the
        // thin blades survive their deep mips and the far fields keep the dark
        // tuft cover the 1049e4e pastures showed to ~300 m; the near carpet
        // keeps the crisp 0.44 edge beside the tracks.
        // v8/v7: root-anchored shadow lookup; v9/v8 (ground lane): the crop tuft's colour branch; v10/v9: the shaded sky light desaturated
        matMid: makeGrassMaterial(grassTex[gv], grassFadeEnd, 'world-grass-wind-v11', 0.34),
        matNear: makeGrassMaterial(grassTex[gv], CARPET_FAR, 'world-grass-carpet-v10'),
      });
      yield { stage: 'grassPrep', fine: true };
    }
  }
  yield* buildGrassVariants();

  const _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _qLean = new THREE.Quaternion();
  const _bushCast = new THREE.Color(); // ground lane: a shrub's own cast
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
  // ground lane (2026-10-03): the field the terrain draws under a tuft (the height field's landUse.ts hook; absent on a
  // map without fields and in the sandboxed harnesses) — a reused record, inline so the section needs no import
  const _landScratch: LandFieldSample = { active: 0, crop: 0, edgeM: 0, endM: 0, sU: 0, sV: 0, split: 1, alongU: 1, marginM: 0, track: 0, hedge: 0, rowX: 1, rowZ: 0, jitter: 0, id: 0,
    boundary: 0, tintR: 0, tintG: 0, tintB: 0, sward: 1, cropHeight: 1, cropKeep: -1, weed: 0, urban: 0 };
  const landUseAt = heightField._landUseAt ?? null;
  // the time-to-battle lane (2026-10-08; the coordinator's ruling: grass follows the ground the player sees): a tuft's
  // slope is the rendered near terrain's (the height field's contact surface: the triangle under it, its vertices kept
  // for the field's life and shared with movement), not the analytic normal's four heights 1.2 m out; a field without
  // one (the sandboxed harnesses' stubs) keeps the analytic normal
  const _contactNormal = { x: 0, y: 1, z: 0 };
  // ground lane: the canopy's cover (set once the trees are placed; null before — a tuft built earlier ignores it)
  let woodsCoverAt: ((x: number, z: number) => number) | null = null;
  // r5 terrain_environment: map-authored no-vegetation discs (desert uses one
  // to keep the establishing camera's foreground frame edge clear — a squat
  // palm sat clipped at the bottom-left of battlefield_desert.png)
  // (the map-revival lane, 2026-10-07: Orchard's lanes keep their treads clear in a chain of discs) the discs' bounds, so a
  // candidate away from them pays four comparisons
  const avoidBounds = veg.avoid?.length ? veg.avoid.reduce((b, av) => [Math.min(b[0], av.x - av.r), Math.max(b[1], av.x + av.r),
    Math.min(b[2], av.z - av.r), Math.max(b[3], av.z + av.r)], [Infinity, -Infinity, Infinity, -Infinity]) : null;
  function inAvoid(x: number, z: number): boolean {
    if (!veg.avoid) return false;
    if (avoidBounds && (x < avoidBounds[0] || x > avoidBounds[1] || z < avoidBounds[2] || z > avoidBounds[3])) return false;
    for (const av of veg.avoid) {
      if (Math.hypot(x - av.x, z - av.z) < av.r) return true;
    }
    return false;
  }
  // Round 67 (2026-09-24): a railway cutting's batter faces (Tarkhan) seed sparse grass and scrub on their upper
  // part — the height field's weight thinned per candidate (railSpurs.ts), the tuft and bush slope gates relaxed
  // to RAIL_CUTTING_SEED_NORMAL_Y where it admits; the exclusion keeps trees, rocks and props off the faces. A map
  // without cuttings publishes no weight and seeds exactly as before (the hook is read before the constant, so the
  // grass harnesses that extract this section run without the import).
  const batterSeedAt = heightField._batterSeedAt ?? null;
  const batterAdmits = (x: number, z: number): boolean =>
    batterSeedAt !== null && railCuttingSeedAdmits(batterSeedAt(x, z), x, z);
  // ground lane (2026-10-08, wave 274: "hard density edges"): a clumpy draw in [0, 1] (a 1.1 m value noise, inline — the
  // grass harnesses compile this section without the module's helpers) the field gate and the margin line are read
  // against, so the field's law and the wild sward's meet across the gate's band (tallGrass.ts admit: the same law)
  const fieldDrawAt = (x: number, z: number): number => {
    const fx = x / 1.1, fz = z / 1.1, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
    const h = (a: number, b: number): number => { const v = Math.sin(a * 127.1 + b * 311.7 + 74.7) * 43758.5453; return v - Math.floor(v); };
    const a0 = h(ix, iz) + (h(ix + 1, iz) - h(ix, iz)) * sx, a1 = h(ix, iz + 1) + (h(ix + 1, iz + 1) - h(ix, iz + 1)) * sx;
    return a0 + (a1 - a0) * sz;
  };
  // ground lane (2026-10-08, wave 274): the sward follows its ground on a map that asks it (the height field's hook,
  // groundRedux.ts swardSlope: the sun in world xz and the strength) — absent on every other map
  const swardSlopeK = heightField._swardSlope ?? null;
  const steepSeedOk = (normalY: number, x: number, z: number): boolean =>
    normalY >= 0.78 || (batterSeedAt !== null && normalY >= RAIL_CUTTING_SEED_NORMAL_Y && batterAdmits(x, z));
  // ground lane (2026-10-08, the gauntlet's wave 260 on Cinder Junction): a cinder yard's weed clumps (the height field's
  // hook, groundRedux.ts cinderYardWeedsAt) — absent on every other map, whose villages keep the old thinning
  const yardWeedsAt = heightField._yardWeedsAt ?? null;
  function terrainDryness(
    x: number,
    z: number,
    roll: number,
    carpet: boolean,
  ): number {
    if (noVeg(x, z) && !batterAdmits(x, z)) return -1;
    const groundType = heightField.getGroundType(x, z);
    // ground lane (2026-10-03): the turf's edge along a road dissolves over a metre and a half (a position hash, inline:
    // the grass harnesses compile this filter without the module's helpers), not one ruled line at 4.2 m from the
    // centreline — it never comes nearer than that line
    const edgeHash = Math.sin(x * 12.9898 + z * 78.233 + 2678.049) * 43758.5453;
    if (groundType === 'hard' || heightField._roadDist(x, z) < 4.2 + (edgeHash - Math.floor(edgeHash)) * 1.6) return -1;
    if (groundType === 'soft' && roll > 0.3) return -1;
    if (heightField._villageMask(x, z) > 0.35) {
      // (a cinder yard: the tufts keep to the weeds' clumps, thickest at their hearts — none on the trodden cinder)
      if (yardWeedsAt !== null) { if (roll > yardWeedsAt(x, z) * (carpet ? 0.9 : 0.45)) return -1; }
      else if (roll > (carpet ? 0.35 : 0.15)) return -1;
    }
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
  // Working bays shorten accepted tufts, not their placement candidates.
  // This runs only while a chunk/cached carpet cell is constructed: no
  // shader, draw-time transform, terrain exclusion or RNG change.
  function stubbleHeightScale(x: number, z: number): number {
    let scale = 1;
    if (!veg.stubblePatches) return scale;
    for (const patch of veg.stubblePatches) {
      const outside = Math.max(patch.x0 - x, x - patch.x1, patch.z0 - z, z - patch.z1, 0);
      if (outside >= patch.feather) continue;
      const factor = patch.heightScale + (1 - patch.heightScale)
        * smoothstepJs(0, patch.feather, outside);
      scale = Math.min(scale, factor);
    }
    return scale;
  }
  function makeTuft(
    x: number,
    z: number,
    crng: RandomSource,
    carpet: boolean,
  ): number[] | null {
    // round 67: a candidate on a railway cutting's batter face passes the rim-band cull (the deep faces at the map
    // edge lie beyond 474 m); every other candidate out there is culled before it draws, as before
    if (Math.max(Math.abs(x), Math.abs(z)) > 474 && !(batterSeedAt !== null && batterSeedAt(x, z) > 0)) return null;
    if (inAvoid(x, z)) return null;
    const roll = crng(), yaw = crng() * Math.PI * 2;
    const sxz = 0.74 + crng() * 0.62;
    let sy = 0.55 + crng() * 0.85;
    const hueJ = crng(), lumJ = crng(), varJ = crng(), clJ = crng();
    let dry = terrainDryness(x, z, roll, carpet);
    if (dry < 0) return null;
    if (dry > 0) sy *= 1.5;
    if (veg.tuftHeight !== undefined) sy *= veg.tuftHeight;
    // ground lane: little sward grows in a stand's shade — the forest floor is litter (the terrain draws it). The
    // carpet only: it always streams after the build (the clearance seal), while the midfield chunks are built partly
    // before the trees stand (the first-view ring, every chunk in a capture build) and partly after (the deferred
    // rest) — the cover would split them at a chunk line
    if (carpet && woodsCoverAt !== null && clJ < woodsCoverAt(x, z) * 0.85) return null;
    // splat-aware thinning: drier + thinner on dirt patches, dense in meadows
    const sn = sampleSplatNoise(x, z, _splatScratch);
    // (thresholds track the shader's `worn` band — r4: 0.55/0.80 + warp)
    const dirtPatch = smoothstepJs(0.55, 0.80, sn.n2 + (sn.n1 - 0.5) * 0.45);
    if (dirtPatch > 0.35 && clJ < dirtPatch * 0.9) dry = Math.max(dry, 0.55);
    // ground lane (wave 71: "hard-edged colour patches … real swards mix the two through a gradient, with cured blades
    // among green ones"; Verdant's "flat, oversaturated neon … no yellow or brown mixing"): a summer sward is part cured
    // wherever it stands — a tuft in six carries last season's straw (a hash of the tuft's own draws: the stream is
    // unchanged)
    if (((hueJ * 13.7 + varJ * 5.3) % 1) < 0.17) dry = Math.max(dry, 0.6);
    // r7: carpet cull 0.6 -> 0.4 — the near dirt patches punched hard bald
    // holes in the hero grass ring and the exposed albedo read as "flat
    // mottled texture up to the tracks"; keep them THINNER, not bare
    // (wave 71: "bare, blurry soil between tufts") a worn patch is grazed turf with its soil at the trodden core only
    // (terrain.ts wornCore): the tufts thin hard on the core, and only a little on the rim
    const dirtCore = smoothstepJs(0.78, 1.0, sn.n2 + (sn.n1 - 0.5) * 0.45);
    if (rejectDenseScatter(sn, Math.max(dirtCore, dirtPatch * 0.62), roll, clJ, carpet)) return null;
    // sparse-biome ecology (desert scrub / winter litter): confetti-uniform
    // scatter reads as noise dots — gate placement behind a low-frequency
    // mask so growth clusters in hollows and along moisture lines, with only
    // stray outliers between the clumps
    if (!resolveTuftScale(sn, clJ, roll, varJ)) return null;
    const sxzMul = _tuftScaleScratch[0], syMul = _tuftScaleScratch[1];
    // PERF (performance_budget r6): slope test LAST — it is the dearest
    // predicate and every cull above it is pure math over (x, z, the 8
    // pre-drawn rng values). All 8 rng draws happen unconditionally at the
    // top of this function, so test ORDER cannot shift the rng stream
    // (measured: 1.26 M candidates per boot on verdant). The slope is the
    // rendered near terrain's (2026-10-08, _contactNormal above).
    const normalY = heightField.getContactNormalAt
      ? heightField.getContactNormalAt(x, z, _contactNormal).y
      : heightField.getNormalAt(x, z).y;
    // ground lane: inside a cultivated field (past its grass margin) the tuft is the crop — none on a plough, a few on
    // a track, short straw on stubble, gold on ripe grain (crop ids: landUse.ts LAND_CROP). The fields keep to the
    // ground the terrain draws them on (its landW; tallGrass.ts admit reads the same gate): off the villages, the
    // roads' shoulders, the water and the slopes past ~2–3° — on a meadow slope the layout crosses the sward stays the
    // sward's (the round-1 lane frames: crop tufts on Amberford's hillside, out of any field the terrain drew)
    let crop = -1, pastureDry = -1;
    if (landUseAt !== null) {
      const f = landUseAt(x, z, _landScratch);
      if (f.active) {
        // (an urban land use — Ruinspires — lies inside the village too: landUse.ts LandUseProfile.urban)
        const fieldW = (1 - smoothstepJs(0.05, 0.30, heightField._villageMask(x, z)) * (1 - f.urban))
          * smoothstepJs(5.0, 8.0, heightField._roadDist(x, z))
          * (1 - (f.works ? smoothstepJs(0.22, 0.40, 1 - normalY) : smoothstepJs(0.04, 0.10, 1 - normalY))) // a works' berms: ~40°
          * (1 - smoothstepJs(0.02, 0.10, heightField.getWaterMaskAt(x, z)));
        // (wave 274: the field's law across the gate's band, a clumpy draw — tallGrass.ts admit: the same law)
        if (fieldW > 0.15 + 0.70 * fieldDrawAt(x, z)) {
          // a ditch's water and a dry stone wall carry no sward, a bund half of one, a track a few tufts
          if (f.track > 0.5) {
            // (wave 79: no grass in a farm track's wheel lanes — tallGrass.ts admit: the same law) a ditch's water and a
            // track's lanes carry no tufts, its crown a short sparse few, its verges a trodden half
            // (wave 83: the lanes wander and swell along the track — landUse.ts laneQ — their verge ragged by the tuft)
            const dLine = Math.abs(f.sV);
            const laneQ = f.laneQ ?? (dLine - 0.85) / 0.24;
            if (f.boundary === 1 || Math.abs(laneQ) < 1.15 + 0.35 * clJ) return null;
            if (laneQ < 0 ? clJ < 0.45 : clJ < 0.5) return null;
            if (laneQ < 0) sy *= 0.6;
          }
          // (wave 274: a grass margin meets the crop across the terrain's ragged band, a bund's and a wall's on their line —
          // tallGrass.ts admit: the same law)
          else if (f.boundary < 1.5
            ? fieldDrawAt(x * 1.22 + 17.3, z * 1.22 - 5.1) < 1 - smoothstepJs(-1.6, 2.6, f.edgeM - f.marginM + (fieldDrawAt(x * 0.22 + 3.1, z * 0.22 + 7.7) - 0.5) * 3.0)
            : f.edgeM < f.marginM) {
            if (f.boundary === 3 && f.edgeM < 0.62) return null;
            if (f.boundary === 2 && f.edgeM < 0.55 && clJ < 0.5) return null;
          } else if (!f.sward) return null;
          else if (f.weed) dry = Math.max(dry, 0.75); // a bare field's weeds: the tuft's own straw, not the soil's colour
          else if (f.crop !== 0) {
            // (wave 71: "… and green among straw") a sown field carries its weeds — an eighth of its tufts the sward's
            // own, most of them along its edge, where the crop thins into the margin over three metres instead of
            // stopping on a line
            const weedP = 0.12 + 0.73 * (1 - smoothstepJs(0, 3.0, f.edgeM - f.marginM));
            if (((hueJ * 7.31 + lumJ * 3.17) % 1) >= weedP) crop = f.crop;
          } else {
            // (wave 69, Verdant's establishing view: "near-circular blotches … rather than the rectilinear plots") a
            // pasture's straw is its own — a grazed field paler and yellower, a shut-up one lush, by the field's draw
            // (terrain.ts: its tone by the same draw, at the bake's six bits) — not the meadow's round dry patches
            const jq = Math.round(f.jitter * 63) / 63;
            pastureDry = 0.55 * ((jq * 7.31 + 0.13) % 1);
          }
        }
      }
    }
    if (!steepSeedOk(normalY, x, z)) return null;
    // (wave 274: thinner and shorter up a steep slope, drier on one turned to the sun — tallGrass.ts admit: the same law)
    if (swardSlopeK !== null && normalY < 0.999) {
      const steepK = smoothstepJs(0.04, 0.20, 1 - normalY) * swardSlopeK[2];
      if (clJ < 0.55 * steepK) return null;
      sy *= 1 - 0.30 * steepK;
      const nn = heightField.getNormalAt(x, z), tilt = Math.hypot(nn.x, nn.z);
      if (tilt > 1e-4) {
        dry = Math.max(dry, Math.max(0, (nn.x * swardSlopeK[0] + nn.z * swardSlopeK[1]) / tilt)
          * smoothstepJs(0.03, 0.16, 1 - normalY) * 0.55 * swardSlopeK[2]);
      }
    }
    const vv = varJ < (0.75 - dry * 0.5) ? 0 : 1;
    const y = heightField.getHeightAt(x, z);
    const tuftHeight = sy * syMul * (veg.stubblePatches ? stubbleHeightScale(x, z) : 1);
    const card = grassVariants[vv];
    if (groundCoverBlocked?.(x, y - 0.03, z,
      card.height * tuftHeight * (carpet ? 1.04 : 1),
      card.radius * sxz * sxzMul * (carpet ? 0.96 : 1.28))) return null;
    // toned to sit on the terrain grass albedo so the far scale-out is
    // invisible (tufts must NOT read brighter than the ground they stand on)
    // r2: per-tuft variance REDUCED (hue 0.075 -> 0.05, lum 0.19 -> 0.12)
    // and a low-frequency meadow unifier keyed to the shared splat field —
    // adjacent tufts now drift together like one sward instead of the
    // radioactive lime-vs-dark confetti the critique flagged
    // (wave 71: Verdant's "flat, oversaturated neon" — the carpet's tips at HSV saturation 0.8 under the grade's boost)
    // the tint a third less saturated and a little yellower: a summer sward, not a lime lawn (was 0.225 / 0.30)
    let th = 0.21 + (hueJ - 0.5) * 0.05 - dry * 0.08;
    let ts = 0.19 - dry * 0.07;
    let tl = 0.44 + (lumJ - 0.5) * 0.12 + (sn.n2 - 0.5) * 0.10 + dry * 0.04;
    // r6 terrain_environment: MEADOW PATCHWORK on the blades themselves. The
    // splat shader stamps 50-200 m dry-straw fields (meadowA -> uTintA), but
    // the 0-40 m carpet buried them under uniformly-green tufts — the "one
    // saturated green across the entire map" critique. sn.mA is the CPU twin
    // of that shader field: tufts standing on a dry patch swing toward
    // yellow-brown straw, so the patchwork reads at every distance.
    const dryPatch = pastureDry >= 0 ? pastureDry : smoothstepJs(0.54, 0.85, sn.mA);
    th -= dryPatch * 0.075;
    ts *= 1 - dryPatch * 0.30;
    tl += dryPatch * 0.05;
    if (veg.tuftTone) [th, ts, tl] = veg.tuftTone(th, ts, tl);
    let cropHeight = 1;
    _c.setHSL(((th % 1) + 1) % 1, clamp(ts, 0, 1), clamp(tl, 0, 1));
    // a crop's tuft: the crop's measured albedo (landUse.ts LAND_CROP_ALBEDO, on the sample: ripe wheat
    // 0.30/0.22/0.075, barley 0.33/0.28/0.12, a young crop 0.075/0.19/0.04, stubble 0.30/0.25/0.13, rice green
    // 0.10/0.23/0.045 …) carried NEGATED in the instance colour: the grass shader then keeps only the card's luminance
    // (its dark roots and lit tips) and lays the crop's colour over it. A multiplier on the green card turned its dry
    // blades and flower specks pink and lavender (the round-1 lane frames).
    if (crop > 0) {
      const lj = -(0.90 + 0.20 * lumJ);
      _c.setRGB(_landScratch.tintR * lj, _landScratch.tintG * lj, _landScratch.tintB * lj);
      cropHeight = Math.max(0.3, Math.min(1.4, _landScratch.cropHeight));
    }
    const t = _tuftScratch;
    // r2: midfield (non-carpet) tufts run ~15% wider — see the cull note
    // above (r3: 1.15 -> 1.28, coverage where the carpet hands over)
    t[0] = x; t[1] = y - 0.03; t[2] = z; t[3] = yaw;
    // (ground lane, wave 87) a low crop's tuft — stubble, a karst field's weeds, a vineyard's — was squashed to a third of
    // its height at its full width, two crossed cards lying almost flat; it keeps its aspect now (narrower as it is lower)
    t[4] = sxz * sxzMul * (carpet ? 1 : 1.28) * Math.min(1, Math.pow(cropHeight, 0.8)); t[5] = tuftHeight * cropHeight;
    t[6] = _c.r; t[7] = _c.g; t[8] = _c.b; t[9] = vv;
    return t;
  }

  // ---- ground lane (2026-10-08, crater-render-spec §C): the battle's craters in the ground cover ----
  // One law (groundCoverCraters.ts): inside 0.9 R of a crater the cover is gone, elsewhere in the overlay's reach it
  // stands on base + offsetAt. The static meshes (grass chunks, bushes, the understorey) go through one patcher.
  let craterLaw: GroundCoverCraters | null = null;
  const craterFollower = createCraterFollower();
  const craterPatcher = createStaticCoverPatcher();
  function reseatInstances(mesh: THREE.InstancedMesh, count: number, ax0: number, az0: number, size: number,
    x0: number, z0: number, x1: number, z1: number): number {
    return craterLaw ? craterPatcher.reseat(craterLaw, mesh as never, count, ax0, az0, size, x0, z0, x1, z1) : 0;
  }

  yield { stage: 'grassPrep' }; // perf-r3: yield before scatter
  // ---- midfield grass scatter (map-wide chunks, unchanged system) ----
  interface GrassChunkMesh {
    mesh: THREE.InstancedMesh;
    total: number;
    geoNear: THREE.BufferGeometry;
    geoFar: THREE.BufferGeometry;
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
    job: GrassChunkWork | null;
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
  let disposed = false;
  function beginGrassChunk(gc: GrassChunk): void {
    if (grassBuildJob) throw new Error('Grass staging already belongs to an active chunk');
    grassBuildJob = gc;
    gc.job = createGrassChunkWork({
      random: mulberry32((seed ^ (gc.ix * 73856093) ^ (gc.iz * 19349663)) >>> 0),
      candidateCount: grassPerChunk, x0: gc.x0, z0: gc.z0, size: CHUNK_SIZE,
      makeTuft: (x, z, crng) => makeTuft(x, z, crng, false),
      staging: midTuftScratch,
      variantSphere(vv) {
        const geometry = grassVariants[vv].geo;
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        return geometry.boundingSphere!;
      },
      publish: buffers => {
        publishGrassChunk(gc, buffers);
        // (crater-render-spec §C) a chunk built after craters takes them as it is published
        if (craterLaw?.active && gc.meshes && craterLaw.touches(gc.x0, gc.z0, gc.x0 + CHUNK_SIZE, gc.z0 + CHUNK_SIZE)) {
          for (const entry of gc.meshes) {
            reseatInstances(entry.mesh, entry.total, gc.x0, gc.z0, CHUNK_SIZE, gc.x0, gc.z0, gc.x0 + CHUNK_SIZE, gc.z0 + CHUNK_SIZE);
          }
        }
      },
    });
  }
  function advanceGrassChunk(gc: GrassChunk, eager = false): boolean {
    if (!gc.job) beginGrassChunk(gc);
    const job = gc.job!;
    try {
      if (eager) while (!job.complete) job.step();
      else advanceGrassChunkWork(job, 250, 1.5);
    } catch (error) {
      job.cancel();
      gc.job = null;
      if (grassBuildJob === gc) grassBuildJob = null;
      throw error;
    }
    if (!job.complete) return false;
    gc.job = null;
    if (grassBuildJob === gc) grassBuildJob = null;
    return true;
  }
  function publishGrassChunk(gc: GrassChunk, buffers: readonly GrassChunkBuffer[]): void {
    // Publication is a final state-machine step, not an uncharged tail after
    // the deadline. The two variant containers are constant work; their arrays
    // and full-count bounds have already been prepared in resumable steps.
    const chunkMeshes: GrassChunkMesh[] = [];
    try {
      for (const buffer of buffers) {
        const vv = buffer.variant, count = buffer.count;
        // Avoid InstancedMesh's eager count-sized identity initialization. All
        // matrix/color writes and exact bounds are already complete off-tree.
        const mesh = new THREE.InstancedMesh(
          grassVariants[vv].geo, grassVariants[vv].matMid, 0);
        chunkMeshes.push({
          mesh, total: count,
          geoNear: grassVariants[vv].geo,
          geoFar: grassVariants[vv].geoFar,
        });
        mesh.instanceMatrix = new THREE.InstancedBufferAttribute(buffer.matrices, 16);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(buffer.colors, 3);
        mesh.count = count;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        // The instances never move. Preserve the radial density/LOD policy,
        // with the exact full-count sphere computed by the sliced scan above;
        // later prefix-count density changes remain safely inside it.
        mesh.boundingSphere = buffer.sphere;
        mesh.frustumCulled = true;
        mesh.visible = false;
        mesh.matrixAutoUpdate = false;
        mesh.userData.aoExclude = true; // GTAO override prepass ignores alphaTest
      }
      for (const entry of chunkMeshes) group.add(entry.mesh);
    } catch (error) {
      for (const entry of chunkMeshes) {
        entry.mesh.removeFromParent();
        entry.mesh.dispose(); // shared geometry/material remain world-owned
      }
      throw error;
    }
    gc.meshes = chunkMeshes;
    gc.built = true;
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
          advanceGrassChunk(gc, true);
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
  function inactiveCarpetBuffers(variant: number) {
    const set = carpetSets[variant], mesh = set.meshes[1 - set.active];
    return { matrices: mesh.instanceMatrix.array as Float32Array,
      colors: mesh.instanceColor!.array as Float32Array };
  }
  const carpetWork = createGrassCarpetWork({
    seed, cellSize: CARPET_CELL, ring: CARPET_RING, candidatesPerCell: carpetPerCell,
    capacity: CARPET_CAP, cache: carpetCache, cacheCapacity: 420, scratch: _cellScratch,
    random: mulberry32, makeTuft: (x, z, crng) => makeTuft(x, z, crng, true),
    targets: () => [inactiveCarpetBuffers(0), inactiveCarpetBuffers(1)],
    publish: publishCarpet,
    // (crater-render-spec §C) a carpet tuft in a crater's cleared bowl is dropped, the rest stands on base + offsetAt
    reseat: (x, z) => (craterLaw?.active ? (craterLaw.holeAt(x, z) ? NaN : craterLaw.liftAt(x, z)) : 0),
  });
  let _carpetCellX = 0x7fffffff;
  let _carpetCellZ = 0x7fffffff;
  function rebuildCarpet(camPos: THREE.Vector3, eager = !deferFarGrass): void {
    carpetWork.request(Math.floor(camPos.x / CARPET_CELL), Math.floor(camPos.z / CARPET_CELL));
    // Authoring/capture builds retain synchronous completion, while actual
    // entry/driving shares the exact generator with a cooperative deadline.
    if (eager) while (!carpetWork.complete) carpetWork.step();
    else advanceGrassCarpetWork(carpetWork, 4096, 1.5);
  }
  function publishCarpet(counts: readonly [number, number]): void {
    for (let vv = 0; vv < 2; vv++) {
      const set = carpetSets[vv];
      const fresh = set.meshes[1 - set.active];
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

  // Props are placed after vegetation. Seal actual accepted solid footprints
  // before the world renders, then reuse the same admission rule for streaming.
  function setGroundCoverClearance(blocked: GroundCoverBlocked): void {
    if (groundCoverBlocked) throw new Error('Ground-cover clearance is already sealed');
    if (carpetCache.size || grassBuildJob || carpetWork.getState().requestedGeneration > 0) {
      throw new Error('Seal ground-cover clearance before streaming starts');
    }
    groundCoverBlocked = blocked;
    let rejected = 0;
    for (const chunk of grassChunks) for (const entry of chunk.meshes ?? []) {
      const mesh = entry.mesh;
      entry.geoFar.computeBoundingBox();
      const box = entry.geoFar.boundingBox!;
      const radius = Math.max(Math.abs(box.min.x), Math.abs(box.max.x),
        Math.abs(box.min.z), Math.abs(box.max.z)) + 0.2;
      const kept = compactGroundCoverInstances(mesh.instanceMatrix.array,
        mesh.instanceColor?.array ?? null, entry.total, box.max.y, radius, blocked);
      rejected += entry.total - kept;
      entry.total = mesh.count = kept;
      // Previous bounds remain conservative. No new GPU buffer/mesh/material.
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    carpetCache.clear();
    _carpetCellX = _carpetCellZ = 0x7fffffff;
    group.userData.groundCoverClearance = { rejectedInitialInstances: rejected };
  }
  // ---- trees ----
  // Every tree material carries the per-instance occlusion fade (aFadeI,
  // 0 = solid → 1 = dithered to ~12%) plus a near-camera dissolve: WoT fades
  // any tree standing between the chase camera and the vehicle — without it,
  // forest routes hide the player tank behind full-screen canopy walls, and
  // cards inside the orbit radius degrade to giant flat unlit sheets.
  // camo_spotting r3: per-hook near-camera dissolve — trunks keep the tight
  // band (BARK_NEAR_DISSOLVE: since the trees lane's 2026-10-05 fix, only as the camera grazes bark), CANOPY fragments
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
    matteCanopy = false,
    thin = 0, // round 77: leaf translucency (canopyLighting.ts), 0 for bark
  ): MaterialShaderHook => (shader: MaterialShader): void => {
    shader.uniforms.uWindTime = uWindTime;
    shader.uniforms.uWindDir = uWindDir; // round 77
    shader.uniforms.uWind = uWind;
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
      '#include <common>\nuniform float uWindTime;\nuniform vec2 uWindDir;\nuniform vec3 uWind;\nuniform vec3 uCamPos;\nuniform vec3 uCamFwd;\nuniform float uSniperFade;\nuniform float uScopeDist;\nuniform vec3 uFocusPos;\nattribute float aFlex;\nattribute float aFadeI;\nattribute float aLodF;\nvarying float vLodF;\nvarying float vFadeI;\nvarying float vScopeKeep;\nvarying float vTDRay;\nvarying float vTAlong;\nvarying float vDSeg;\nvarying float vWindLift;');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      {
        vec4 tiw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        // Round 77 (2026-09-26) — the wind (treeClimate.ts). A gust front travels down the map wind over the stands
        // (a 350 m wavelength at ~8 m/s); every tree leans with it by the SQUARE of its height — a cantilever: the
        // base holds, the crown moves — with a per-tree gustiness and a little cross-wind roll, and the canopy
        // flutters about the lean by its authored flex (aFlex: the palettes' cardL0 law, the trunk at 0, the limbs
        // at 0.1–0.4) with a per-card phase hashed from that flex and the card's station. Instance space, before
        // instanceMatrix, so a tall rim tree leans further; the trunk's collision record never moves. In a still
        // frame the neighbours lean by different amounts (the phases); in play the whole stand breathes.
        float ph = fract(sin(tiw.x * 12.9898 + tiw.z * 78.233) * 43758.5453) * 6.2831853;
        float front = 0.5 + 0.5 * sin(uWindTime * 0.42 - dot(tiw.xz, uWindDir) * 0.018);
        float gust = 0.30 + 0.70 * front * (0.55 + 0.45 * sin(uWindTime * 1.31 + ph));
        // p2 trees lane (2026-10-01): the gust as the crown's tone — a crown in a gust turns its leaves and catches more
        // sky, so the gust fronts read as waves of light across a far forest where the lean itself is sub-pixel
        vWindLift = gust - 0.62;
        float lean = uWind.x * gust * (0.70 + 0.30 * sin(uWindTime * 1.15 + ph) + 0.12 * sin(uWindTime * 2.63 + ph * 1.7));
        float hn = clamp(transformed.y * uWind.y, 0.0, 1.0);
        vec2 leanDir = uWindDir + vec2(-uWindDir.y, uWindDir.x) * (0.22 * sin(uWindTime * 0.97 + ph * 1.3));
        // Continuous phase: fract introduced a jump where the 1.9x harmonic crossed a card.
        float fph = (aFlex * 53.17 + (position.x * 0.37 + position.z * 0.53) * 0.05) * 6.2831853;
        float fl = aFlex * uWind.z * (0.45 + 0.55 * gust);
        transformed.xz += leanDir * (lean * hn * hn);
        transformed.x += fl * (sin(uWindTime * 3.1 + fph) + 0.5 * sin(uWindTime * 5.3 + fph * 1.9));
        transformed.z += fl * 0.7 * cos(uWindTime * 2.6 + fph * 1.3);
        transformed.y += fl * 0.3 * sin(uWindTime * 4.3 + fph * 0.7);
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
      '#include <common>\nuniform float uScopeHard;\nuniform float uSniperFade;\nuniform float uScopeDist;\nvarying float vLodF;\nvarying float vFadeI;\nvarying float vScopeKeep;\nvarying float vTDRay;\nvarying float vTAlong;\nvarying float vDSeg;\nvarying float vWindLift;\n#ifdef COT_LEAF_BILLBOARD\nvarying float vCotNearScale;\nvarying float vCotGeoNear;\n#endif');
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
        #ifdef COT_LEAF_BILLBOARD
        // trees round 2: a small crown (a bush at the chase camera's side) dissolves only where the camera would be
        // inside it — the canopy band read as a dithered core on Saltmere's foreground shrub (gauntlet wave 4); trees
        // round 3b: a grown cluster's near fade is its shrink (vCotGeoNear, CANOPY_NEAR_DISSOLVE), no dither
        fadeKeep *= mix(smoothstep(${nearD0.toFixed(2)} * vCotNearScale, ${nearD1.toFixed(2)} * vCotNearScale, length(vViewPosition)), 1.0, vCotGeoNear);
        #else
        fadeKeep *= smoothstep(${nearD0.toFixed(2)}, ${nearD1.toFixed(2)}, length(vViewPosition));
        #endif
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
    if (thin > 0 && !mobileTier) {
      // the canopy hooks (cards, far lobes, impostors): the gust lift on the albedo, ±4 % around the still crown — the
      // desktop tiers' far forests; the phones keep their foliage fragment exactly (the unread varying links away)
      shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <color_fragment>',
        `#include <color_fragment>\n\tdiffuseColor.rgb *= 1.0 + vWindLift * ${TREE_WIND_LEAF_FLASH.toFixed(3)};`);
    }
    // p2 trees lane: the canopy hooks transmit light through the leaves under the grounded light (desktop tiers)
    applyCanopyDiffuseWrap(shader, wrap, matteCanopy, thin, thin > 0 && !mobileTier ? uLeafTransmission : null);
  };
  const treeWindHook = makeTreeWindHook(BARK_NEAR_DISSOLVE[0], BARK_NEAR_DISSOLVE[1], 0.30); // trunks/bark
  // Leaves 2026-09-12: 0.50 -> 0.38 wrap so lit and shaded crown sides separate again.
  // Round 77: the near cards transmit 45 % of the (shadowed) direct light when back-lit, the far lobes 18 %.
  const canopyWindHook = makeTreeWindHook(CANOPY_NEAR_DISSOLVE[0], CANOPY_NEAR_DISSOLVE[1], 0.38, true, true, 0.45); // matte canopy cards
  const farCanopyWindHook = makeTreeWindHook(2.5, 8.0, 0.38, true, true, 0.18); // matte far lobes
  // Round 77: moss on the shaded side of the trunk bases, by the map's climate (uMoss, treeClimate.ts). Grows in the
  // bark's fissures (the sheet's darker texels), thickest at the ground and gone by 3 m, on the side turned from the
  // sun; a faint lichen dusting on the temperate maps, a full collar on the wet ones, none on the arid and frozen.
  const barkHook = (shader: MaterialShader): void => {
    treeWindHook(shader);
    shader.uniforms.uMoss = uMoss;
    shader.uniforms.uCotWoodFineFar = uWoodFineFar;
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nvarying float vBarkY;\nattribute float aWoodFine;\nuniform float uCotWoodFineFar;');
    // trees round 4 (the cost hold): fine wood (aWoodFine, a thin branch's tube) past its tree's share of
    // GROWTH_WOOD_FINE_FAR from the camera collapses to a point — its triangles cover nothing and rasterize nothing; a
    // geometry without the tag (the phones', a snag's, the round-8 trees') reads it as 0 and keeps all its wood
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <project_vertex>', /* glsl */`
      if ( aWoodFine > 0.5 ) {
        float cotWoodHash = fract( sin( dot( instanceMatrix[ 3 ].xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        if ( distance( instanceMatrix[ 3 ].xyz, uCamPos ) > uCotWoodFineFar * aWoodFine * ( 0.85 + 0.3 * cotWoodHash ) ) transformed = vec3( 0.0 );
      }
      vBarkY = ( instanceMatrix * vec4( transformed, 1.0 ) ).y - instanceMatrix[ 3 ].y;
      #include <project_vertex>`);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>', '#include <common>\nuniform float uMoss;\nvarying float vBarkY;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <normal_fragment_maps>', /* glsl */`
      #include <normal_fragment_maps>
      #if NUM_DIR_LIGHTS > 0
      if ( uMoss > 0.001 ) {
        float cotShade = 1.0 - saturate( dot( normal, directionalLights[ 0 ].direction ) * 1.4 + 0.25 );
        float cotLow = 1.0 - smoothstep( 0.5, 3.0, vBarkY );
        float cotLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
        float cotFissure = 0.45 + 0.55 * ( 1.0 - saturate( cotLum * 4.0 ) );
        float cotPatch = 0.6 + 0.4 * sin( vBarkY * 5.3 + vMapUv.x * 29.0 ) * cos( vBarkY * 3.1 - vMapUv.x * 17.0 );
        float cotMoss = uMoss * cotShade * cotLow * cotFissure * cotPatch;
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.13, 0.20, 0.06 ) * ( 0.55 + cotLum * 1.6 ), saturate( cotMoss * 1.15 ) );
      }
      #endif`);
  };
  /**
   * Trees round 4: a shrub's foliage hook — the crowns' with a shorter near-dissolve reach (uCotNearReach, a uniform of
   * each material over the one program): a crown thins away from 8 m as the camera comes up to it, but a shrub keeps
   * its clusters to about 2 m (the gauntlet's wave 51 on 3b: the near shrub read as "a handful of identical, flat,
   * hard-outlined leaf cutouts" — the dissolve had taken most of a 6 m bush's clusters at 3 to 6 m and left the rest
   * floating).
   */
  const shrubFoliageHook = (shader: MaterialShader): void => {
    foliageWindHook(shader);
    shader.uniforms.uCotNearReach = { value: FOLIAGE_NEAR_REACH.shrub };
    shader.uniforms.uCotGateLift = { value: FOLIAGE_GATE_LIFT.shrub };
    shader.uniforms.uCotInsideFade = { value: 1 };
    shader.uniforms.uCotShrubThin = uShrubThin;
  };
  const foliageWindHook = (shader: MaterialShader): void => {
    canopyWindHook(shader);
    shader.uniforms.uCotNearReach = { value: FOLIAGE_NEAR_REACH.crown };
    shader.uniforms.uCotShrubThin = { value: 0 };
    shader.uniforms.uCotGateLift = { value: FOLIAGE_GATE_LIFT.crown };
    shader.uniforms.uCotInsideFade = { value: 0 };
    // Trees round 2 (2026-10-03): the grown crowns' leaf clusters turn about their own axes to face the camera
    // (COT_LEAF_BILLBOARD, the share of the turn; the desktop grown builds). A cluster keeps its seat, its axis (a
    // hanging spray still hangs, a level one still reaches out) and its sag, and shows the viewer its face instead of
    // its edge, so a crown reads as a mass of leaves from every side (the gauntlet: "flat-card broadleaf", "drooping
    // card foliage"). The turn is in instance space, ahead of the wind block: the camera is carried into the instance's
    // frame through the inverse of its rotation × scale (the transpose with each row over its squared length) and the
    // model-view's rigid inverse; the lighting keeps the crown hull's normals, which never turned with the card. A
    // geometry without the frame (the round-8 bush cards) reads aAxis as zero and stays as authored.
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\n#ifdef COT_LEAF_BILLBOARD\nattribute vec3 aAxis;\nattribute vec3 aLeaf;\nuniform float uCotNearReach;\nuniform float uCotGateLift;\nuniform float uCotInsideFade;\nuniform float uCotShrubThin;\nvarying float vCotNearScale;\nvarying float vCotGeoNear;\n#endif');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`#include <begin_vertex>
      #ifdef COT_LEAF_BILLBOARD
      // trees round 4: the card's share of its size (the near dissolve's and the inside fade's), applied after the wind
      // (the project_vertex patch below)
      float cotShrinkF = 1.0;
      // the near-camera dissolve's reach by the crown's size: a shrub's (crown ~1.5–3 m across) under half a tree's;
      // trees round 4: times the material's own reach (uCotNearReach: a crown's 1, a shrub's FOLIAGE_NEAR_REACH.shrub)
      vCotNearScale = mix( 0.45, 1.0, smoothstep( 1.6, 3.6, aCard.w * length( instanceMatrix[ 0 ].xyz ) ) ) * uCotNearReach;
      vCotGeoNear = 0.0;
      if ( dot( aAxis, aAxis ) > 0.5 ) {
        mat3 cotIm = mat3( instanceMatrix );
        vec3 cotCam = - ( transpose( mat3( modelViewMatrix ) ) * modelViewMatrix[ 3 ].xyz ) - instanceMatrix[ 3 ].xyz;
        cotCam = vec3( dot( cotIm[ 0 ], cotCam ) / dot( cotIm[ 0 ], cotIm[ 0 ] ), dot( cotIm[ 1 ], cotCam ) / dot( cotIm[ 1 ], cotIm[ 1 ] ),
          dot( cotIm[ 2 ], cotCam ) / dot( cotIm[ 2 ], cotIm[ 2 ] ) );
        vec3 cotRight = cross( aAxis, cotCam - aCard.xyz );
        float cotRightL = length( cotRight );
        if ( cotRightL > 1e-4 ) {
          vec3 cotFacing = aCard.xyz + cotRight * ( aLeaf.x / cotRightL ) + aAxis * aLeaf.y - vec3( 0.0, aLeaf.z, 0.0 );
          transformed = mix( transformed, cotFacing, COT_LEAF_BILLBOARD );
        }
        // trees round 3b: the near dissolve takes whole clusters — the card's centre against the band
        // (CANOPY_NEAR_DISSOLVE, by the crown's size), each card shrinking to its centre at its own threshold
        float cotNear = length( cotCam - aCard.xyz ) * length( cotIm[ 0 ] );
        float cotKeep = smoothstep( ${CANOPY_NEAR_DISSOLVE[0].toFixed(2)} * vCotNearScale, ${CANOPY_NEAR_DISSOLVE[1].toFixed(2)} * vCotNearScale, cotNear );
        // trees round 4: a shrub's clusters leave from the top down (uCotGateLift: its gate leans on the cluster's height
        // in the mound), so a bush that carries no wood never leaves a cluster hanging over a thinned skirt; a crown's
        // (held by its limbs) leave by the hash alone
        float cotHash = fract( sin( dot( aCard.xyz + instanceMatrix[ 3 ].xyz, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
        float cotGate = 0.1 + 0.8 * mix( cotHash, clamp( aCard.y / ( 1.5 * aCard.w ), 0.0, 1.0 ), uCotGateLift );
        // trees round 4 (the gauntlet's wave 68: the dolly's camera stands inside a 6 m field bush and sees its far top
        // clusters hang in the sky over the emptied heart): a shrub the camera stands in leaves whole — inside its crown
        // radius (in the instance's own frame, the scale divided out) and under its top, by the material's uniform
        // (uCotInsideFade: a shrub's 1, a crown's 0, whose wood holds what stays), over a tenth of the radius at its rim so
        // no pose catches the whole bush half-shrunk into scattered sprigs
        float cotIn = uCotInsideFade * ( 1.0 - smoothstep( 0.94, 1.04, length( cotCam.xz ) / max( aCard.w, 1e-3 ) ) )
          * ( 1.0 - smoothstep( 1.4, 1.8, cotCam.y / max( aCard.w, 1e-3 ) ) );
        // trees round 4 (the gauntlet's wave 84: the dolly's camera a twentieth of the radius inside its bush's rim, and
        // every card of the bush drawn at a hundredth of its size — specks over the whole frame, one in the open sky): a
        // crown's card shrinks over its own window about its gate; a shrub's (uCotInsideFade 1) is whole or gone, at its
        // gate — by the camera's distance (the near dissolve) and by the camera's depth into the shrub's rim (the inside
        // fade: its top cards first, the last of it at the rim's inner edge) — so no pose draws a shrunken card of a shrub
        // trees round 4 (the cost hold): a shrub under uCotShrubThin of angular radius (its crown radius over its
        // distance, in the instance's own frame) draws half its clusters, each by its own hash, at 1.25 times their size
        float cotThin = step( length( cotCam ) * uCotShrubThin, aCard.w );
        cotShrinkF = uCotInsideFade > 0.5
          ? step( cotGate, cotKeep ) * ( 1.0 - step( 1.0, cotIn + cotGate ) ) * mix( step( 0.5, fract( cotHash * 7.13 ) ) * 1.25, 1.0, cotThin )
          : smoothstep( cotGate - 0.1, cotGate + 0.1, cotKeep );
        vCotGeoNear = 1.0;
      }
      #endif`);
    useAttributeNormal(shader);
    // aa-r1: mip-aware alpha BEFORE the built-in alpha test / A2C smoothstep
    // (the canopyWindHook dissolve above keeps the <alphatest_fragment>
    // anchor, so this composes as: mip boost -> alpha test -> dissolve).
    mipAlphaGuard(shader);
    // p2 trees lane (2026-10-02): a grown crown's cards fade as they turn edge-on to a view looking up into the crown
    // (COT_CARD_EDGE_FADE, the desktop grown builds). From under a broadleaf a spray seen along its own plane squeezes
    // its leaves into a sliver that the mip give-back above closes into a solid dark blade. Its coverage falls with
    // the card's facing (its geometric face, from the view position's derivatives: a bent card fades row by row),
    // before the alpha test, which alpha-to-coverage feathers. Only as the view climbs past 20° to 49° above level:
    // seen from the side, a conifer's level sprays edge-on are the dark tiers that draw its layers, and they stay.
    // The phones and `?legacyTrees=1` keep their cards as they were.
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <alphatest_fragment>', /* glsl */`
      #ifdef COT_CARD_EDGE_FADE
      {
        // the derivatives in uniform control flow; the view's climb (the view ray against world up, viewMatrix's second
        // column) decides whether the face is worth forming: a level or downward look pays nothing more
        vec3 cotDx = dFdx( vViewPosition ), cotDy = dFdy( vViewPosition );
        vec3 cotRay = normalize( - vViewPosition );
        float cotUp = smoothstep( 0.35, 0.75, dot( cotRay, viewMatrix[ 1 ].xyz ) );
        if ( cotUp > 0.0 ) {
          vec3 cotFace = normalize( cross( cotDx, cotDy ) );
          diffuseColor.a *= mix( 1.0, smoothstep( 0.05, 0.28, abs( dot( cotFace, cotRay ) ) ), cotUp );
        }
      }
      #endif
      #include <alphatest_fragment>`);
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
      #ifdef COT_LEAF_BILLBOARD
      // trees round 4 (the gauntlet's wave 84: "a stray foliage-green sliver floats in the open sky" at the dolly's
      // vanished bush): a card shrinks to its centre after the wind, not before it — the wind moves each corner by its
      // own flex (a card's stem little, its tip most), so a card collapsed ahead of it was stretched back out into a
      // sliver; after it, a collapsed card is a point and draws nothing
      transformed = aCard.xyz + ( transformed - aCard.xyz ) * cotShrinkF;
      #endif
      {
        vec4 fiw = instanceMatrix * vec4(transformed, 1.0);
        vFolKeep = mix(1.0, smoothstep(4.0, 10.0, distance(fiw.xyz, uCamPos)), uSniperFade);
        vLeafW = fiw.xyz;
      }
      #include <project_vertex>`);
    // World-anchored leaf clumps make intersecting cards read as one crown.
    // Scattering now follows LIGHT incidence in applyCanopyDiffuseWrap, not
    // view angle. Removing the two rim normalizations, dot and additive gain
    // pays for the cheaper wrap arithmetic and stops camera-dependent bleach.
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <map_fragment>', /* glsl */`
      #include <map_fragment>
      {
        float lA = texture2D(uCanopyDet, vLeafW.xz * 0.60).r;
        float lB = texture2D(uCanopyDet, vec2(vLeafW.x * 0.44 + 0.29, vLeafW.y * 0.60)).r;
        float leafM = lA * 0.6 + lB * 0.4;
        diffuseColor.rgb *= 0.86 + leafM * 0.28;
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
    // Round 77 (2026-09-26): the cascades on the canopy. The near cards now RECEIVE the sun's cascades (desktop;
    // createTreeMeshPools), sampled once per leaf cluster: at the card's centre (aCard.xyz, instance space) pushed
    // out toward the sun by the crown's radius (aCard.w × the instance scale), so a card on the sun side of its own
    // crown proxy samples clear sky and a card behind it samples the proxy's shadow — a self-shadowed crown at
    // cluster granularity, one shadow state per card and none of the per-fragment sparkle that kept the cards
    // unshadowed since the r5 budget (the round-13 rule of the grass roots, one level up). Neighbouring crowns,
    // buildings and the terrain shade the cards the same way. The sun comes from the CSM's first light in view
    // space, turned to world by the view rotation's transpose (no new uniform, no CPU work). Bushes carry no aCard
    // (their five attributes are frozen by the shrub receipts) and sample 0.9 m over their base, one state per
    // shrub. A shaded cluster keeps 22 % of the direct term (light scattered and transmitted through the leaves
    // around it — cotLeafShadow on the CSM chunk's directional sites) so the cascades darken the canopy without
    // crushing it; the ambient dims through the same softened visibility (cotSunVis, lighting.ts) and, below, by
    // the sky the shading leaves occlude.
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <common>',
      '#include <common>\nattribute vec4 aCard;\n#if NUM_DIR_LIGHTS > 0\nstruct DirectionalLight { vec3 direction; vec3 color; };\nuniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];\n#endif');
    shader.vertexShader = _mustReplace(shader.vertexShader, '#include <shadowmap_vertex>', /* glsl */`
      #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
      {
        vec3 cotSunW = normalize( directionalLights[ 0 ].direction * mat3( viewMatrix ) );
        float cotHas = step( 0.001, aCard.w );
        vec3 cotCardObj = mix( vec3( 0.0, 0.9, 0.0 ), aCard.xyz, cotHas );
        float cotReach = mix( 1.6, aCard.w, cotHas ) * length( instanceMatrix[ 0 ].xyz );
        vec4 cotCardW = modelMatrix * ( instanceMatrix * vec4( cotCardObj, 1.0 ) );
        worldPosition = vec4( cotCardW.xyz + cotSunW * ( cotReach * 0.9 ), 1.0 );
      }
      #endif
      #include <shadowmap_vertex>`);
    {
      // The CSM chunk carries three directional sites: the fading and the plain cascade loops, and the non-CSM
      // loop that USE_CSM compiles out; every one takes the floor, the count guards the installed chunk.
      const begin = THREE.ShaderChunk.lights_fragment_begin;
      const site = 'getShadow( directionalShadowMap[ i ]';
      const sites = begin.split(site).length - 1;
      if (sites !== 3) throw new Error(`world/vegetation: expected three directional shadow sites, found ${sites}`);
      const soft = begin.replaceAll(site, `cotLeafShadow( ${site}`)
        .replaceAll('vDirectionalShadowCoord[ i ] ) : 1.0;', 'vDirectionalShadowCoord[ i ] ) ) : 1.0;');
      if (soft.split('cotLeafShadow(').length - 1 !== 3 || soft.split(') ) : 1.0;').length - 1 !== 3) {
        throw new Error('world/vegetation: the directional shadow sites did not take the leaf-shadow floor');
      }
      shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <lights_fragment_begin>', soft);
      shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>',
        '#include <common>\nfloat cotLeafShadow( float s ) { return mix( 0.22, 1.0, s ); }');
      // The sky under a shaded cluster: the leaves above it occlude the sky the way they block the sun, so the
      // indirect terms fall to 50 % where the cluster is fully shadowed (the raw visibility recovered from the
      // softened cotSunVis) — the crown's shade side reads as shade, not as a second, dimmer lit side. Guarded on
      // the engine's own anchor (lighting.ts's cotAmbDim), so a rig without it compiles unchanged.
      const end = THREE.ShaderChunk.lights_fragment_end;
      if (end.includes('irradiance *= cotAmbDim;') && end.includes('iblIrradiance *= cotAmbDim;')) {
        shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <lights_fragment_end>',
          end.replace('irradiance *= cotAmbDim;', 'float cotLeafSky = mix( 0.50, 1.0, saturate( ( cotSunVis - 0.22 ) / 0.78 ) );\n\t\tirradiance *= cotAmbDim * cotLeafSky;')
            .replace('iblIrradiance *= cotAmbDim;', 'iblIrradiance *= cotAmbDim * cotLeafSky;'));
      }
    }
    // Round 77b (2026-09-26): the leaf-scale crown detail (leafDetail.ts). The desktop near material carries the
    // class's detail tile as its normal map, sampled once with the card's own (repeated) UVs: the tile's mask cuts the
    // card's antialiased edge texels in leaf-cluster bites and shades the gaps between leaves (both mean-neutral, so
    // the far mips keep the pre-round coverage and tone under the mip guard), and its normal perturbs the authored
    // sphere normal in a tangent frame rebuilt AFTER useAttributeNormal's override — three's own frame (built in
    // normal_fragment_begin from the double-sided flip) would light every back face from below again. Compiled out
    // without a normal map (the mobile tier), so the phones keep their flat card program.
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <common>', '#include <common>\nvec4 cotLeafDet;');
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <alphamap_fragment>', /* glsl */`
      #include <alphamap_fragment>
      #ifdef USE_NORMALMAP
      {
        cotLeafDet = texture2D( normalMap, vNormalMapUv );
        diffuseColor.a *= ${LEAF_DETAIL_LAW.alphaFloor.toFixed(2)} + ${LEAF_DETAIL_LAW.alphaSpan.toFixed(2)} * cotLeafDet.a;
        diffuseColor.rgb *= ${LEAF_DETAIL_LAW.aoFloor.toFixed(2)} + ${LEAF_DETAIL_LAW.aoSpan.toFixed(2)} * cotLeafDet.a;
      }
      #endif`);
    shader.fragmentShader = _mustReplace(shader.fragmentShader, '#include <normal_fragment_maps>', /* glsl */`
      #ifdef USE_NORMALMAP
      {
        vec3 cotLeafN = cotLeafDet.xyz * 2.0 - 1.0;
        cotLeafN.xy *= normalScale;
        mat3 cotLeafTbn = getTangentFrame( - vViewPosition, normal, vNormalMapUv );
        normal = normalize( cotLeafTbn * cotLeafN );
      }
      #else
      #include <normal_fragment_maps>
      #endif`);
  };
  // Bark and smooth snow occupy the existing atlas. Dark trunk tints are
  // calibrated against its measured linear reflectance during geometry prep.
  const barkTex = makeBarkTexture(seed + 97, vegetationGrowsTrees() && !veg.legacyTrees ? TREE_BARK_STYLES : 1);
  const barkMat = new THREE.MeshStandardMaterial({
    map: barkTex.albedo, normalMap: barkTex.normal,
    vertexColors: true, roughness: 0.92, metalness: 0.0,
  });
  barkMat.normalScale.set(0.85, 0.85);
  // (2026-10-08, the world-ibl lane: bark, crowns, leaves and shrubs take the sky's full image-based light. Their trims —
  // bark 0.85, far canopy 0.80, leaves and shrubs 0.75 — never applied (three overwrote them with the scene's intensity),
  // so every approved crown was lit at the full sky; the shaded clusters' sky dim is cotLeafSky below.
  // engine/materialEnvIntensity.ts now applies an authored value.)
  engineCtx.setupShadowMaterial(barkMat, barkHook);
  barkMat.customProgramCacheKey = () => 'world-tree-bark-v12'; // trees lane: the near dissolve only as the camera grazes bark (round 4: fine wood's reach; round 77: the wind law and the moss)
  barkMat.userData.cotWoodFineFar = uWoodFineFar; // the frame probe's same-page A/B (its wood-fine toggle)
  yield { stage: 'treePrep', fine: true };

  // far canopy: own material — strong sky/env fill acts as the fake-SSS
  // backlight term so shaded crown sides stay green, never crushed black
  const canopyFarMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0.0 });
  // DoubleSide: the far palm crown is built from open arched frond blades —
  // FrontSide culled half of them at any azimuth (closed lobe canopies are
  // unaffected beyond a little overdraw)
  canopyFarMat.side = THREE.DoubleSide;
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
    farCanopyWindHook(shader);
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
        // vista pass (2026-09-19): the 0.9 m clumps mip to their mean past ~150 m, which left every far crown a
        // smooth lathe cone. Two metre-scale clump fields (about 3 m and 9 m) keep massed foliage readable to the
        // horizon, and a rim darkening rounds the crown as a volume instead of a flat cut-out.
        float lC = texture2D(uCanopyDet, vCanW.xz * 0.055 + vec2(0.31, 0.77)).r;
        float lD = texture2D(uCanopyDet, vec2(vCanW.x * 0.019 + 0.53, vCanW.y * 0.023 + 0.11)).r;
        float bigLeaf = lC * 0.55 + lD * 0.45;
        diffuseColor.rgb *= 0.80 + bigLeaf * 0.46;
        float rim = 1.0 - ndv;
        diffuseColor.rgb *= 1.0 - rim * rim * 0.30;
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
  canopyFarMat.customProgramCacheKey = () => 'world-tree-canopyfar-v17'; // round 77: the wind law, translucency
  yield { stage: 'treePrep', fine: true };

  // Round 77b (2026-09-26): the leaf-scale detail tiles (one per foliage class, built on first use; none on the
  // mobile tier) and the world's retained-resource collections — live arrays, so the impostor library registered
  // after the species geometry joins the same ownership record (a second registration would replace the first).
  // Declared here, above the species tables, so the receipts that slice those tables run without them.
  const leafDetail = createLeafDetailLibrary(seed, !mobileTier);
  const retainedGeometries: THREE.BufferGeometry[] = grassVariants.flatMap(variant => [variant.geo, variant.geoFar]);
  const retainedMaterials: THREE.Material[] = [barkMat, canopyFarMat, ...grassVariants.flatMap(variant => [variant.matMid, variant.matNear])];
  const retainedTextures: THREE.Texture[] = [canopyDetailTex];

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
    tex(rng: RandomSource, palette: VegetationPalette): THREE.Texture;
    near(index: number, palette: VegetationPalette): TreeGeometryPair;
    far(rng: RandomSource, palette: VegetationPalette, index: number): FarTreeGeometryPair;
    /** p2 trees lane: the near trees grow (treeGrowth.ts): their cards take the grown crowns' edge-on fade. */
    grown?: boolean;
    /** Trees round 2: the species whose leaf-detail class the material takes (a regional form's family). */
    detailSpecies?: Species;
    /** Trees round 5: a forest-grown species' open-grown near variant (the probes' `?forestAB=1` alternate). */
    nearOpen?(index: number, palette: VegetationPalette): TreeGeometryPair;
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
    tidalMangrove = false,
  ): SpeciesDefinition {
    return {
      texSeed, nearSeed, farSeed,
      tex: (r, pal) => makeLeafClusterTexture(r, pal.texTone || null),
      near: (k, pal) => {
        const shape = shapes[k % shapes.length];
        return {
          trunk: buildBroadleafTrunk(mulberry32(seed + nearSeed + k * 7), shape, tidalMangrove),
          cards: buildBroadleafCards(
            mulberry32(seed + nearSeed + 2 + k * 7), shape.n, 1.0, pal, shape,
          ),
        };
      },
      far: (r, pal, k) => {
        const pair = scaleFar(buildOakFarGeometry(r, pal, k), farScale[0], farScale[1], farScale[2]);
        if (tidalMangrove) shapeMangroveFarStem(pair.trunk, k, pair.canopy);
        return pair;
      },
    };
  }
  // trees round 2 (2026-10-03): a slot's regional form — the map palette's `form`, else the map's biome (treeBiomes.ts)
  const formOf = (sp: Species): { form: GrowthSpecies; leaves: boolean; colour?: TreeBiomeSlot['colour'] } | null => {
    const explicit = veg.palettes[sp]?.form;
    if (explicit) return { form: explicit, leaves: veg.palettes[sp]?.birchLeaves === true };
    const slot = treeBiomeSlot(cfg?.id, sp);
    return slot ? { form: slot.form, leaves: slot.leaves === true, ...(slot.colour ? { colour: slot.colour } : {}) } : null;
  };
  // p2 trees lane (2026-10-01): the desktop tiers grow their near trees (treeGrowth.ts) and paint branch-spray atlases
  // (treeSprayAtlas.ts); the far tier is the bake of those trees (treeImpostors.ts). The mobile tier keeps the
  // legacy card trees, atlases and lobe tier exactly — the phones' cheaper path — and so do the palms and the
  // tidal-mangrove willow form (its reviewed stilt-rooted trunk). Seeds, variants and the far builders are the
  // legacy definition's, so a species' placement and its lobe stand-ins never move.
  const grownTrees = vegetationGrowsTrees() && !veg.legacyTrees;
  // the species whose foliage material paints a spray atlas (the grown crowns' 2 × 2 tiles): the shrubs of such a
  // species grow from its sprays too (buildGrownShrub); any other bush species keeps the round-8 bush cards
  const sprayAtlasSpecies = new Set<Species>();
  // trees round 5 (the coordinator's ruling on the gauntlet's wave 98: Frontier's woods "a single wall of near-identical
  // forked grey trunks", their savanna read): on a map whose woods close (treeBiomes.ts treeBiomeWoodSpread over one),
  // the species its woods are made of grow their first two near variants forest-grown (treeGrowth.ts
  // forestGrownProfile: a tall clear bole under a high crown) and keep the third open-grown; their trees in the woods
  // take the forest-grown pair, the field trees the open one (assignTreeForms). The pools, the impostor rows and the
  // records are the slot's three, as before: no draw, no row, no record moves.
  // (`?forestForm=0`: the open-grown form everywhere, the probes' same-build A/B; `?forestAB=1` also grows the open
  // variants beside the forest-grown ones, each pool mesh carrying its open geometry as userData.formAlt, so the frame
  // probe's forest-form toggle swaps them in one page)
  const forestQuery = typeof location !== 'undefined' ? location.search ?? '' : '';
  // (trees lane, 2026-10-05: an orchard form's slot stays open-grown in a wood too, its variants its own species)
  const forestSpecies = new Set<Species>(grownTrees && treeBiomeWoodSpread(cfg?.id) > 1 && !/[?&]forestForm=0(&|$)/.test(forestQuery)
    ? veg.clusterMix.map(([sp]) => sp).filter((sp) => sp !== 'palm'
      && !TREE_GROWTH_PROFILES[(formOf(sp)?.form ?? sp) as GrowthSpecies]?.orchard) : []);
  const forestAB = forestSpecies.size > 0 && /[?&]forestAB=1(&|$)/.test(forestQuery);
  // trees lane (2026-10-05): a bare map's deciduous broadleaves and shrubs stand leafless (VegetationConfig `bare`;
  // `?bare=1` stands any map's bare, the probes' same-build A/B)
  const bareMap = grownTrees && (veg.bare === true || /[?&]bare=1(&|$)/.test(forestQuery));
  function grownDefinition(species: Exclude<Species, 'palm'>, legacy: SpeciesDefinition): SpeciesDefinition {
    if (!grownTrees) return legacy;
    sprayAtlasSpecies.add(species);
    // trees round 2: the slot grows as its regional form (treeBiomes.ts); its seeds, its far stand-ins and its records
    // stay the slot's. Its palette is the map's through the form (treeBiomePalette): a form of another family drops the
    // card hue and saturation tuned for the slot's family, a leafy form on a palette tuned for bare twigs drops the
    // twigs' colours, and a leafy form takes its leaves (a birch form on a pine slot is leafy); the place's foliage
    // colour fills what the map palette leaves unnamed (Wadi Rum's dust-dulled acacias).
    const form = formOf(species), growth: GrowthSpecies = form?.form ?? species;
    const family = TREE_GROWTH_PROFILES[growth].family;
    const crossFamily = !!form && family !== (TREE_ARCHETYPES[species]?.family ?? 'broadleaf');
    const placeColour = treeBiomeColour(cfg?.id);
    // (trees lane, 2026-10-05: on a bare map a deciduous form's palette is its winter twigs')
    const formPal = (pal: VegetationPalette): VegetationPalette => bareFormPalette(treeBiomePalette(pal, form, crossFamily, placeColour),
      growth, bareMap);
    return {
      texSeed: legacy.texSeed, nearSeed: legacy.nearSeed, farSeed: legacy.farSeed, grown: true,
      // the leaf-scale detail of the form's family (a holm oak on a cedar slot is leaves, not needles)
      detailSpecies: !form ? species : family === 'conifer' ? 'pine' : family === 'birch' ? 'birch' : 'oak',
      // a snowy palette's texTone is the round-8 cards' hoar-frost wash (their snow); the spray atlas paints its snow
      tex: (r, pal) => {
        const fp = formPal(pal);
        return makeSprayAtlas(grownFormSprayKind(growth, fp), r, texSize(512), (fp.snow ?? 0) > 0.05 ? null : fp.texTone || null, fp.snow ?? 0);
      },
      near: (k, pal) => buildGrownTree(growth, seed + legacy.nearSeed + k * 7, k, formPal(pal), forestSpecies.has(species) && k < FOREST_NEAR_VARIANTS),
      nearOpen: (k, pal) => buildGrownTree(growth, seed + legacy.nearSeed + k * 7, k, formPal(pal)),
      far: legacy.far,
    };
  }
  // p2 trees lane (2026-10-02): the tidal mangrove (the Mangrove map's willow form) grows on the desktop tiers — the
  // mangrove's own broad crown and leathery spray atlas over the reviewed stilt roots (buildGrownTree); the legacy
  // definition's seeds and far stand-ins (the stilt-stemmed lobes, shapeMangroveFarStem). The phones keep it all.
  function mangroveDefinition(legacy: SpeciesDefinition): SpeciesDefinition {
    if (!grownTrees) return legacy;
    sprayAtlasSpecies.add('willow');
    return {
      texSeed: legacy.texSeed, nearSeed: legacy.nearSeed, farSeed: legacy.farSeed, grown: true,
      tex: (r, pal) => makeSprayAtlas('mangrove', r, texSize(512), (pal.snow ?? 0) > 0.05 ? null : pal.texTone || null, pal.snow ?? 0),
      near: (k, pal) => buildGrownTree('mangrove', seed + legacy.nearSeed + k * 7, k, pal),
      far: legacy.far,
    };
  }
  const SPECIES: Record<Species, SpeciesDefinition> = {
    pine: grownDefinition('pine', coniferDefinition(52, 61, 71, TREE_GEOMETRY_SCALE.pine)),
    spruce: grownDefinition('spruce', coniferDefinition(55, 91, 111, TREE_GEOMETRY_SCALE.spruce)),
    fir: grownDefinition('fir', coniferDefinition(56, 121, 141, TREE_GEOMETRY_SCALE.fir)),
    cedar: grownDefinition('cedar', coniferDefinition(57, 151, 171, TREE_GEOMETRY_SCALE.cedar)),
    cypress: grownDefinition('cypress', coniferDefinition(58, 181, 201, TREE_GEOMETRY_SCALE.cypress)),
    oak: grownDefinition('oak', broadleafDefinition(51, 65, 73, OAK_SHAPES, [1, 1, 1])),
    poplar: grownDefinition('poplar', broadleafDefinition(59, 211, 231, POPLAR_SHAPES, [0.58, 1.25, 0.58])),
    willow: veg.willowForm === 'tidalMangrove'
      ? mangroveDefinition(broadleafDefinition(60, 241, 261, WILLOW_SHAPES, [1.45, 0.82, 1.45], true))
      : grownDefinition('willow', broadleafDefinition(60, 241, 261, WILLOW_SHAPES, [1.45, 0.82, 1.45])),
    acacia: grownDefinition('acacia', broadleafDefinition(62, 271, 291, ACACIA_SHAPES, [1.48, 0.78, 1.42])),
    eucalyptus: grownDefinition('eucalyptus', broadleafDefinition(63, 301, 321, EUCALYPTUS_SHAPES, [0.68, 1.35, 0.72])),
    palm: {
      texSeed: 53, nearSeed: 81, farSeed: 75, grown: grownTrees,
      // p2 trees lane: the desktop palms keep their reviewed geometry and take a pinnate frond (the round-8 painter's
      // solid blade read as a banana leaf); the phones keep the round-8 frond
      tex: (r, pal) => (grownTrees ? makePalmFrondAtlas(r, texSize(512), pal.texTone || null) : makePalmFrondTexture(r, pal.texTone || null)),
      // p2 trees lane: the desktop palms grow (treeGrowth.ts growPalm: an arching stem and a fan of pinnate fronds);
      // the phones keep the round-8 palm
      near: (k, pal) => (grownTrees ? buildGrownTree('palm', seed + 81 + k * 7, k, pal) : buildPalmGeometry(mulberry32(seed + 81 + k * 7), pal, PALM_VAR[k % 3])),
      far: (r, pal, k) => buildPalmFarGeometry(r, pal, k),
    },
    birch: grownDefinition('birch', {
      texSeed: 54, nearSeed: 85, farSeed: 77,
      tex: makeBirchFoliageTexture,
      // content_breadth r3: pal now reaches the near builder (winter card
      // tint + snow load; verdant/urban pass no birch palette -> unchanged)
      // r5 terrain_environment: k selects BIRCH_VAR — three distinct
      // height/crown proportions so stands stop reading as clones
      near: (k, pal) => buildBirchGeometry(mulberry32(seed + 85 + k * 7), pal, BIRCH_VAR[k % 3]),
      far: (r, pal) => buildBirchFarGeometry(r, pal),
    }),
    aspen: grownDefinition('aspen', {
      texSeed: 64, nearSeed: 331, farSeed: 351,
      tex: makeBirchFoliageTexture,
      near: (k, pal) => scaleNear(
        buildBirchGeometry(mulberry32(seed + 331 + k * 7), pal, BIRCH_VAR[k % 3]),
        ...TREE_GEOMETRY_SCALE.aspen,
      ),
      far: (r, pal) => scaleFar(buildBirchFarGeometry(r, pal), ...TREE_GEOMETRY_SCALE.aspen),
    }),
  };
  // p2 trees lane: the battle zones' snags (desktop tiers, maps with craters) — a species of their own pools,
  // converted from placed trees by position after placement (convertSnags); outside the impostor atlas
  const snagShare = grownTrees ? battleSnagShare(cfg) : 0;
  if (snagShare > 0) {
    (SPECIES as Record<string, SpeciesDefinition>).snag = {
      texSeed: 65, nearSeed: 361, farSeed: 381, grown: true,
      // trees round 2: weathered grey-brown dead twigs (the charred 0.42 value read as a pitch-black card on Frosthollow's
      // snow, gauntlet wave 4)
      tex: (r) => makeSprayAtlas('birch-bare', r, texSize(256), (_h, sat, l) => [0.07, sat * 0.3, l * 0.86]),
      near: (k) => buildGrownTree('snag', seed + 361 + k * 7, k, {}),
      far: (r, _pal, k) => buildSnagFarGeometry(r, k),
    };
  }
  const speciesList = veg.species.filter((sp) => SPECIES[sp]);
  if (snagShare > 0) speciesList.push('snag' as Species);
  const bushSpecies = speciesList.includes(veg.bushSpecies) ? veg.bushSpecies : speciesList[0];
  if (!bushSpecies) throw new Error('world/vegetation: at least one species is required');
  const palOf = (sp: Species): VegetationPalette => {
    const explicit = veg.palettes[sp];
    if (explicit) return explicit;
    const family = TREE_ARCHETYPES[sp]?.family; // p2 trees lane: the snag has no archetype (it reads no palette)
    if (family === 'conifer') return veg.palettes.pine || {};
    if (family === 'birch') return veg.palettes.birch || {};
    if (family === 'palm') return veg.palettes.palm || {};
    return veg.palettes.oak || {};
  };

  const foliageTex = {} as Record<Species, THREE.Texture>;
  const foliageMats = {} as Record<Species, THREE.MeshStandardMaterial>;
  const foliageDepthMats = {} as Record<Species, THREE.MeshDepthMaterial>;
  function* createFoliageMaterials(): Generator<BuildYield, void, void> {
    for (const sp of speciesList) {
      foliageTex[sp] = SPECIES[sp].tex(mulberry32(seed + SPECIES[sp].texSeed), palOf(sp));
      const fm = new THREE.MeshStandardMaterial({
        map: foliageTex[sp], alphaTest: 0.38, alphaToCoverage: true, side: THREE.DoubleSide,
        vertexColors: true, roughness: 1.0, metalness: 0.0,
      });
      // Round 77b: the class's detail tile as the card's normal map (desktop; the mobile library returns null and the
      // phones keep the flat card program). The tile is a material property, so every species shares one program.
      // trees round 2: a slot grown as a form of another family takes that family's detail (grownDefinition)
      const leafTile = leafDetail.texture(leafDetail.classOf(SPECIES[sp].detailSpecies ?? sp, palOf(sp)));
      if (leafTile) { fm.normalMap = leafTile; fm.normalScale.set(LEAF_DETAIL_NORMAL_SCALE, LEAF_DETAIL_NORMAL_SCALE); }
      // p2 trees lane: the grown crowns' edge-on fade (foliageWindHook) and their back-lit transmission gain
      // (canopyLighting.ts COT_GROWN_CROWN: the dark Saltmere and Frontier crowns against a low sun)
      // trees round 2: and their clusters turn to face the camera (COT_LEAF_BILLBOARD; the palms' fronds carry no frame)
      if (SPECIES[sp].grown) {
        fm.defines = { ...(fm.defines ?? {}), COT_CARD_EDGE_FADE: '', COT_GROWN_CROWN: GROWN_CROWN_TRANSMISSION.toFixed(2),
          COT_LEAF_BILLBOARD: GROWN_LEAF_BILLBOARD.toFixed(2) };
      }
      engineCtx.setupShadowMaterial(fm, foliageWindHook);
      // Species vary textures/uniforms, not this shared shader hook. Three
      // already keys material/geometry defines; a species suffix needlessly
      // recompiles identical programs when the last world using it is evicted.
      fm.customProgramCacheKey = () => 'world-tree-foliage-v25'; // trees round 4: the shrink after the wind; each material's near reach, gate lift and inside fade (round 3b: the clusters' near dissolve; round 2: the facing clusters; p2: the edge-on fade; round 77b: the leaf-scale detail; round 77: wind, cluster shadows, translucency)
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
  // Shader-only detail, customDepthMaterial and unselected grass LODs are
  // invisible to ordinary mesh traversal. Keep the existing library owned
  // even when a species/LOD has no instances; disposal deduplicates attachments.
  retainedMaterials.push(...Object.values(foliageMats), ...Object.values(foliageDepthMats));
  retainedTextures.push(...leafDetail.textures); // round 77b: the detail tiles the species' materials share
  registerRetainedObject3DResources(group, {
    geometries: retainedGeometries,
    materials: retainedMaterials,
    textures: retainedTextures,
  });

  // r7: 3 near variants + 2 far variants per species (was 2/1) — "dozens of
  // identical stacked-cone pines" was a top critique; every stand now mixes
  // three distinct crowns near and two silhouettes at range, on top of the
  // per-instance rotation/scale/tint jitter.
  const NEAR_VARIANTS = 3, FAR_VARIANTS = 2;
  const treeGeo = {} as Record<Species, TreeGeometryPair[]>;
  const treeGeoFar = {} as Record<Species, FarTreeGeometryPair[]>;
  /** Trees round 5: the open-grown alternates of the forest-grown variants (`?forestAB=1` only). */
  const treeGeoOpen = {} as Partial<Record<Species, TreeGeometryPair[]>>;
  function* createSpeciesGeometry(): Generator<BuildYield, void, void> {
    for (const sp of speciesList) {
      treeGeo[sp] = [];
      for (let k = 0; k < NEAR_VARIANTS; k++) {
        const geometry = SPECIES[sp].near(k, palOf(sp));
        // the crown supports: a grown tree seats every spray on its wood and carries its own attachment record
        // (buildGrownTree); the legacy cards are attached here (treeAttachments.ts)
        if (TREE_ARCHETYPES[sp]?.family !== 'palm' && !geometry.trunk.userData.crownAttachments) attachTreeCards(geometry);
        prepareTreeBarkSurface(geometry.trunk, barkTex.meanReflectance, barkTex.width);
        treeGeo[sp].push(geometry);
        yield { stage: 'treePrep', fine: true };
        const open = forestAB && forestSpecies.has(sp) && k < FOREST_NEAR_VARIANTS ? SPECIES[sp].nearOpen?.(k, palOf(sp)) : undefined;
        if (open) {
          prepareTreeBarkSurface(open.trunk, barkTex.meanReflectance, barkTex.width);
          (treeGeoOpen[sp] ??= [])[k] = open;
        }
      }
      treeGeoFar[sp] = [];
      for (let k = 0; k < FAR_VARIANTS; k++) {
        const geometry = SPECIES[sp].far(
          mulberry32(seed + SPECIES[sp].farSeed + k * 101), palOf(sp), k,
        );
        if (TREE_ARCHETYPES[sp]?.family !== 'palm') attachTreeLobes(geometry);
        prepareTreeBarkSurface(geometry.trunk, barkTex.meanReflectance, barkTex.width);
        treeGeoFar[sp].push(geometry);
        yield { stage: 'treePrep', fine: true };
      }
    }
  }
  yield* createSpeciesGeometry();

  // Round 77b (2026-09-26): the far tier as impostors of the near trees (treeImpostors.ts) — one atlas per world of
  // every species' three near variants from eight azimuths, baked from the trunks, the cards and the leaf atlases
  // (lazily, in update(), where the renderer is; re-baked after a GPU suspension), drawn beyond the 260 / 290 m band
  // as one camera-facing quad per tree through the far canopy's own wind / dissolve / matte-wrap hook. Desktop tiers
  // with a renderer; the receipts (no renderer) and the mobile tier keep the opaque lobe tier and its two draws per
  // species and far variant. The atlas gutters flood with the leaf atlases' mean opaque tone, so the mips of a tile
  // never average toward black.
  const treeImpostors: TreeImpostorLibrary | null = bakeRenderer ? createTreeImpostorLibrary({
    rows: speciesList.filter(sp => (sp as string) !== 'snag').flatMap(sp => treeGeo[sp].map((pair, variant) => ({
      species: sp, variant, trunk: pair.trunk, cards: pair.cards, foliage: foliageTex[sp],
    }))),
    bark: barkTex.albedo,
    flood: (() => {
      let r = 0, g = 0, b = 0, n = 0;
      for (const sp of speciesList) {
        if ((sp as string) === 'snag') continue;
        const image = foliageTex[sp].image as { data?: Uint8ClampedArray; width?: number } | null;
        const data = image?.data;
        if (!data) continue;
        for (let i = 0; i < data.length; i += 64) {
          if (data[i + 3] < 128) continue;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
      }
      return n > 0 ? new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace)
        : new THREE.Color(0.06, 0.077, 0.021);
    })(),
    hook: farCanopyWindHook,
    setupMaterial: (material, hook) => engineCtx.setupShadowMaterial(material, hook),
    renderer: bakeRenderer,
  }) : null;
  if (treeImpostors) {
    retainedMaterials.push(treeImpostors.material);
    retainedTextures.push(treeImpostors.albedo.texture, treeImpostors.normal.texture);
    yield { stage: 'treePrep', fine: true };
  }

  // Keep the authored random admission sequence when road exits are extended.
  // This sampler has no gameplay fast cache and is released after planting.
  let placementAdmission: TerrainPlacementSampler | null = null;
  if (heightField._createRoadPlacementSampler) {
    const steps=heightField._createRoadPlacementSampler();
    let result=steps.next();
    while (!result.done) {yield {stage:'placementTerrain',fine:true};result=steps.next();}
    placementAdmission=result.value;
  }
  const admission=():TerrainPlacementSampler=>placementAdmission??heightField;
  function newlyUnsafeRoadSite(x:number,z:number,roadMargin:number,normalY:number):boolean {
    if (!placementAdmission) return false;
    return (heightField._roadDist(x,z)<roadMargin && placementAdmission._roadDist(x,z)>=roadMargin)
      || (heightField.getNormalAt(x,z).y<normalY && placementAdmission.getNormalAt(x,z).y>=normalY);
  }

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
  const sapRngShared = mulberry32((seed ^ 0x5a9) >>> 0);
  const clusters: VegetationDisc[] = [];
  // Round 77b: the rim-forest blocks as discs (centre, half the block width) — the stands the rim understorey
  // feathers; recorded from the placement below, no RNG draw of their own
  const rimBlocks: VegetationDisc[] = [];
  const trees: TreeRecord[] = []; // { x,z,species,variant, mat: Matrix4, tint: Color, near: bool }
  // Rim trees intentionally bypass interior site admission, but a through
  // road still needs the same nine-metre trunk clearance at its exit.
  // Defer rejection until all placement RNG has been consumed.
  const roadBlockedRimTrees = new Set<TreeRecord>();
  const authoredTreeDonors = veg.authoredTrees || veg.tidalTrees ? new Set<TreeRecord>() : null;
  const treeObstacles: TreeObstacle[] = [];
  const protectedSpawns = [L.spawns.player, ...L.spawns.enemies];
  // Symmetric deployments (modes lane, 2026-10-08): both sides' deployment slots keep the clearings the pads keep
  // (sim/matchPlacement.ts deploymentClearings). The seeded passes still test the pads alone (a rejected candidate
  // would shift every later draw); the trees standing within 26 m of a slot drop after every placement (excludeVegetation
  // below), and the draw-free tests — the understorey's admission, the snags' hash — read the slots beside the pads.
  const deploymentSlots = deploymentClearings(heightField);
  const spawnClearings = [...protectedSpawns, ...deploymentSlots];
  /** Rim-forest clearance around every spawn: tank + chase camera, not a meadow (was 36 m, see placeRimForest). */
  const RIM_SPAWN_CLEARANCE_M = 20;
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
  /** `settled`: an opted-in map's authored station, admitted inside the settlement rect (`authoredInSettlement`). */
  /** The Redrock lane: ground above the map's tree ceiling (veg.treeCeilingY) grows no tree. */
  function overTreeCeiling(x: number, z: number): boolean {
    return veg.treeCeilingY !== undefined && heightField.getHeightAt(x, z) > veg.treeCeilingY;
  }
  /** The Redrock lane: a candidate's own stream under veg.keyedPlacement (the seed, the placement's kind, its ordinal). */
  const keyedPlacement = veg.keyedPlacement === true;
  function keyedStream(kind: number, ordinal: number): RandomSource {
    let h = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(kind + 1, 0x85ebca77) ^ Math.imul(ordinal + 1, 0xc2b2ae3d);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return mulberry32((h ^ (h >>> 16)) >>> 0);
  }
  /** Each stand's key (its attempt's ordinal), for its saplings' and its fringe bushes' own streams. */
  const clusterKeys: number[] = [];
  // The Redrock lane: the halves' cover (veg.coverHalvesAbout) — the side of the line through the turning point a seat
  // lies on (the map's north and south halves, or its east and west, whichever the deployments face across), and
  // whether that half of the playable square already holds more trees
  const halvesAbout = veg.coverHalvesAbout ?? null;
  const halvesAxis = [0, 1];
  if (halvesAbout) {
    const ex = L.spawns.enemies.reduce((acc, e) => acc + e.x, 0) / L.spawns.enemies.length - L.spawns.player.x;
    const ez = L.spawns.enemies.reduce((acc, e) => acc + e.z, 0) / L.spawns.enemies.length - L.spawns.player.z;
    if (Math.abs(ex) > Math.abs(ez)) { halvesAxis[0] = Math.sign(ex); halvesAxis[1] = 0; } else halvesAxis[1] = Math.sign(ez) || 1;
  }
  function coverHalf(x: number, z: number): number {
    return (x - halvesAbout!.x) * halvesAxis[0] + (z - halvesAbout!.z) * halvesAxis[1] < 0 ? 0 : 1;
  }
  const _coverHalves = [0, 0];
  // (symmetric deployments: the last evening counts without the trees the deployment clearings drop after it)
  function countTreeHalves(withoutClearings = false): void {
    _coverHalves[0] = 0; _coverHalves[1] = 0;
    for (const t of trees) {
      if (Math.max(Math.abs(t.x), Math.abs(t.z)) > PLAYABLE_HALF_EXTENT_M) continue;
      if (withoutClearings && !isClearOfSpawns(t.x, t.z, deploymentSlots, 26)) continue;
      _coverHalves[coverHalf(t.x, t.z)]++;
    }
  }
  function treeHalfAhead(x: number, z: number): boolean {
    if (!halvesAbout || Math.max(Math.abs(x), Math.abs(z)) > PLAYABLE_HALF_EXTENT_M) return false;
    countTreeHalves();
    const h = coverHalf(x, z);
    return _coverHalves[h] > _coverHalves[1 - h];
  }
  /** A seat drawn in the other half, turned about the point into this one (veg.coverHalvesAbout). */
  const _evenSeat = [0, 0];
  function seatInHalf(x: number, z: number, half: number): number[] {
    const turn = coverHalf(x, z) !== half;
    _evenSeat[0] = turn ? 2 * halvesAbout!.x - x : x; _evenSeat[1] = turn ? 2 * halvesAbout!.z - z : z;
    return _evenSeat;
  }
  let placingBelts = false; // standKeepOut: the belts plant inside the kept-out rects
  function siteOk(x: number, z: number, margin: number, settled = false): boolean {
    if (Math.max(Math.abs(x), Math.abs(z)) > 455) return false;
    if (inAvoid(x, z) || overTreeCeiling(x, z)) return false;
    // (Kestrel's plantations, 2026-10-07) a map's standKeepOut rects take only its belts' trees
    if (!placingBelts && veg.standKeepOut?.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)) return false;
    if (!settled && x > v.x0 - 24 && x < v.x1 + 24 && z > v.z0 - 24 && z < v.z1 + 24) return false;
    if (admission()._roadDist(x, z) < 9 + margin) return false;
    if (admission().getGroundType(x, z) === 'soft' || noVeg(x, z)) return false;
    if (veg.parks) { // town maps: trees only inside the park belts
      let inPark = false;
      for (const p of veg.parks) {
        if (Math.hypot(x - p.x, z - p.z) < p.r) { inPark = true; break; }
      }
      if (!inPark) return false;
    }
    if (!isClearOfSpawns(x, z, protectedSpawns, 26)) return false;
    return admission().getNormalAt(x, z).y > 0.82;
  }
  function pushTree(
    x: number,
    z: number,
    species: Species,
    scMin: number,
    scMax: number,
    withObstacle: boolean,
    // trees round 2: the stream the tree's own draws come from (the woodlots draw from theirs, placeTreeClusters)
    r: RandomSource = rng,
    // trees round 3: a closed wood's crowns spread wider (the width and depth scale; placeTreeClusters)
    spread = 1,
  ): void {
    // trees round 2b: a palm outside the map's palm sites grows as its fallback species (every path: stands, lone trees,
    // belts, the rim); no draw moves
    if (species === 'palm' && palmElsewhere && !palmSiteOk(x, z)) species = palmElsewhere;
    const y = heightField.getHeightAt(x, z);
    const sc = scMin + r() * (scMax - scMin);
    const archetype = TREE_ARCHETYPES[species];
    // Independent, position-keyed width/depth/height variation changes the
    // silhouette without consuming the placement RNG stream. Stands retain
    // their authored positions while individual trees stop reading as clones.
    const sx = sc * (0.86 + treePositionNoise(x, z, 1) * 0.28) * spread;
    const sy = sc * (0.88 + treePositionNoise(x, z, 2) * 0.24);
    const sz = sc * (0.86 + treePositionNoise(x, z, 3) * 0.28) * spread;
    _q.setFromAxisAngle(_up, r() * Math.PI * 2);
    // r3 terrain_environment: per-instance LEAN jitter — every trunk used to
    // stand bolt vertical, a loud repetition tell in stands; a few degrees of
    // random tilt (more for palms) reads as natural growth
    const leanA = r() * Math.PI * 2;
    const leanM = treePositionNoise(x, z, 4) * archetype.leanMaxRad;
    _qLean.setFromAxisAngle(_axLean.set(Math.cos(leanA), 0, Math.sin(leanA)), leanM);
    _q.multiply(_qLean);
    // height variance clamped tight (no needle-thin scaling-bug giants)
    _m4.compose(_pv.set(x, y - 0.06, z), _q, _sv.set(sx, sy, sz));
    // per-tree hue/value jitter, WIDE: identical-sibling canopies are the
    // loudest mid-distance tell, so value swings ~2x and hue drifts between
    // yellow-green and blue-green per instance
    const vj = 0.58 + r() * 0.42;
    // content_breadth r3: the wide hue jitter is authored for verdant
    // variety — on the winter map a g-heavy roll re-saturated a frosted pine
    // back to summer green (the critique's lone green tree). pal.jitterHue
    // (0..1, default 1) scales the per-channel spread around the neutral
    // value jitter; winter runs ~0.22 = near value-only.
    const pj = palOf(species).jitterHue ?? 1;
    _c.setRGB(vj * (1 + (r() * 0.26 - 0.12) * pj), vj * (1 + (r() * 0.22 - 0.04) * pj),
      vj * (1 + (r() * 0.24 - 0.16) * pj));
    // r7 terrain_environment: ~10% DRY/YELLOWED individuals (critique: "no
    // dry/dead mix-ins... monoculture"). A strong per-instance tint pull
    // toward sun-scorched straw/amber — broadleafs go autumn-gold, conifers
    // read as browning stressed trees. Gated to summer palettes (pj >= 0.5):
    // winter runs value-only jitter and the desert palettes manage their own
    // range. Rolled from a POSITION HASH, not the shared rng stream — one
    // extra rng() here would shift every subsequent placement and re-break
    // the authored establishing-shot compositions (see sapRng note above).
    // Trees round 2 (2026-10-03, the gauntlet's wave 6: "multiple trees in the treeline show dead/brown foliage
    // scattered randomly among healthy green trees, reading as a widespread asset bug", Cinder Junction and Frontier
    // Basin): the amber and browned-off tenth read as broken assets beside the grown crowns. A summer wood keeps a few
    // trees a shade drier and yellower, no more (the battle zones' snags carry the dead).
    const dryRoll = treePositionNoise(x, z, 0);
    if (pj >= 0.5 && dryRoll < 0.04) {
      _c.r *= 1.1;
      _c.g *= 0.98;
      _c.b *= 0.8;
    }
    trees.push({
      x, z, species, variant: (r() * 3) | 0, fv: (r() * 2) | 0,
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
    if (!withObstacle && heightField._roadDist(x, z) < 9) {
      roadBlockedRimTrees.add(trees[trees.length - 1]);
    }
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
  // trees round 2b (the gauntlet's wave 15: "palms included, whatever the place"): a map that names its palms' sites
  // grows them there only, any other palm as its fallback species (veg.palmSites; no draw moves)
  const palmElsewhere: Species | null = veg.palmSites
    ? (veg.palmFallback ?? (veg.species.find((sp) => sp !== 'palm') ?? null)) : null;
  function palmSiteOk(x: number, z: number): boolean {
    for (const site of veg.palmSites ?? []) if (Math.hypot(x - site.x, z - site.z) < site.r) return true;
    return false;
  }
  // trees round 2b (2026-10-03, gauntlet wave 28 on Copper Mesa: "green broadleaf and fir clumps on sand"): an upland
  // place (treeBiomes.ts upland) zones its forms by height — its conifer forms (juniper, pinyon) on the higher ground,
  // the top two fifths of the square's heights; its broadleaf forms (mesquite) in the low washes, the bottom two fifths;
  // nothing on the slopes between. A test on a seat, no draw.
  const uplandBand: readonly [number, number] | null = treeBiomeUpland(cfg?.id) ? (() => {
    const heights: number[] = [];
    for (let z = -430; z <= 430; z += 24) for (let x = -430; x <= 430; x += 24) heights.push(heightField.getHeightAt(x, z));
    heights.sort((a, b) => a - b);
    return uplandBandOf(heights);
  })() : null;
  function uplandZoneOk(x: number, z: number, sp: Species): boolean {
    if (!uplandBand) return true;
    const form = formOf(sp)?.form ?? sp;
    return uplandZoneAllows(uplandBand, TREE_GROWTH_PROFILES[form as GrowthSpecies]?.family === 'conifer', heightField.getHeightAt(x, z));
  }
  function addTree(x: number, z: number, species: Species, r: RandomSource = rng, spread = 1): boolean {
    if (!siteOk(x, z, 0)) return false;
    pushTree(x, z, species, 0.95, 1.7, true, r, spread); // wide size spread per stand
    return true;
  }
  // the trees lane (2026-10-06): a landscape map's woods (VegetationConfig `landscapeWoods`) — the wood-zone score of a
  // point (its height's quantile over the square, and half a point more at the zone's slope), the score a woodlot's
  // centre needs (the share `zone` of the square's ground scores over it) and the overlap its stands may close by
  const landscape = veg.landscapeWoods ?? null;
  const landscapeHeights: number[] = [];
  if (landscape) {
    for (let z = -430; z <= 430; z += 24) for (let x = -430; x <= 430; x += 24) landscapeHeights.push(heightField.getHeightAt(x, z));
    landscapeHeights.sort((a, b) => a - b);
  }
  const landscapeSlope = Math.tan(((landscape?.slopeDeg ?? 12) * Math.PI) / 180);
  function woodZoneScore(x: number, z: number): number {
    const h = heightField.getHeightAt(x, z);
    let lo = 0, hi = landscapeHeights.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (landscapeHeights[mid] < h) lo = mid + 1; else hi = mid; }
    const ny = Math.max(0.05, heightField.getNormalAt(x, z).y), grade = Math.sqrt(Math.max(0, 1 - ny * ny)) / ny;
    return lo / Math.max(1, landscapeHeights.length) + 0.5 * Math.min(1, grade / landscapeSlope);
  }
  const landscapeThreshold: number = landscape ? (() => {
    const scores: number[] = [];
    for (let z = -430; z <= 430; z += 24) for (let x = -430; x <= 430; x += 24) scores.push(woodZoneScore(x, z));
    scores.sort((a, b) => a - b);
    return scores[Math.min(scores.length - 1, Math.floor(scores.length * (1 - Math.min(1, Math.max(0, landscape.zone)))))];
  })() : 0;
  const landscapeMerge = landscape ? (landscape.merge ?? 30) : null;
  function isSeparatedTreeCluster(x: number, z: number, r = 0): boolean {
    // trees round 2: a woodlot keeps clear of the others by a little of its own reach too (the round-1 stands by the
    // others' only). Round 2b: a tenth of it, not half — at half, the round-1-sized woodlots fitted a third fewer stands
    // on the crowded maps (Nordhavn Fjord 81 -> 49, Monsoon Ridge 120 -> 75) and their corridors lost their cover
    for (const c of clusters) {
      // (the trees lane: a landscape map's stands may close into one wood, their outlines overlapping by its merge)
      const need = landscapeMerge !== null ? Math.max(6, c.r + r - landscapeMerge) : c.r + 26 + r * 0.1;
      if (Math.hypot(x - c.x, z - c.z) < need) return false;
    }
    return true;
  }
  function tintTreeStand(startIndex: number, r: RandomSource = rng): void {
    const toneBias = r();
    const lightness = 0.95 + (r() - 0.5) * 0.12;
    for (let i = startIndex; i < trees.length; i++) {
      trees[i].tint.multiplyScalar(lightness);
      trees[i].tint.r *= 0.90 + toneBias * 0.20;
      trees[i].tint.b *= 1.10 - toneBias * 0.20;
    }
  }
  function rememberAuthoredDonors(start: number, count: number): void {
    if (!authoredTreeDonors) return;
    for (let i = start; i < start + count; i++) authoredTreeDonors.add(trees[i]);
  }
  // Trees round 2 (2026-10-03, the gauntlet: "uniform circular stamped tree-clump placement visible from altitude"): the
  // stands are woodlots — an irregular, often elongated outline (a few harmonics of a radius, stretched along an axis),
  // a denser edge (the trees crowd toward the light at a wood's margin, so its outline reads from the air), a clearing in
  // a large one and patches where the stand thins. Each woodlot's shape is kept (woodlotShapes) so its edge growth —
  // the saplings, the fringe scrub, the understorey — follows the real outline (standPoint), not a circle round it.
  interface WoodlotShape { cos: number; sin: number; stretch: number; h: readonly [number, number, number]; p: readonly [number, number, number] }
  const woodlotShapes: WoodlotShape[] = [];
  /** The outline's radius at polar angle a in the woodlot's frame (its harmonics), as a fraction of the base radius. */
  function woodlotRim(shape: WoodlotShape, a: number): number {
    return 1 + shape.h[0] * Math.cos(2 * a + shape.p[0]) + shape.h[1] * Math.cos(3 * a + shape.p[1]) + shape.h[2] * Math.cos(5 * a + shape.p[2]);
  }
  const _standPoint = [0, 0];
  /**
   * The world point at polar angle a and fraction k of a stand's outline (k = 1 on the rim): a woodlot's own shape, a
   * round stand (no shape: a rim block) its circle. The stand disc's r is the woodlot's base radius times its stretch.
   */
  function standPoint(index: number, stand: VegetationDisc, a: number, k: number): number[] {
    const shape = woodlotShapes[index];
    if (!shape) { _standPoint[0] = stand.x + Math.cos(a) * stand.r * k; _standPoint[1] = stand.z + Math.sin(a) * stand.r * k; return _standPoint; }
    const base = stand.r / shape.stretch, f = k * woodlotRim(shape, a) * base;
    const u = Math.cos(a) * f * shape.stretch, w = Math.sin(a) * f / shape.stretch;
    _standPoint[0] = stand.x + u * shape.cos - w * shape.sin;
    _standPoint[1] = stand.z + u * shape.sin + w * shape.cos;
    return _standPoint;
  }
  /** A smooth hashed field over the battlefield (0..1, ~22 m cells): where a woodlot's stand thins. */
  /** The fraction of its outline a point stands at from a stand's centre (1 on the rim; the circle's for a rim block). */
  function standOutlineFraction(index: number, x: number, z: number): number {
    const stand = clusters[index], shape = woodlotShapes[index];
    if (!stand) return Infinity;
    const dx = x - stand.x, dz = z - stand.z;
    if (!shape) return Math.hypot(dx, dz) / stand.r;
    const u = (dx * shape.cos + dz * shape.sin) / shape.stretch, w = (dz * shape.cos - dx * shape.sin) * shape.stretch;
    return Math.hypot(u, w) / ((stand.r / shape.stretch) * woodlotRim(shape, Math.atan2(w, u)));
  }
  function woodlotDensity(x: number, z: number): number {
    const gx = x / 22, gz = z / 22, ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    const h = (i: number, j: number): number => treePositionNoise(i * 7.31, j * 7.31, 23);
    return (h(ix, iz) * (1 - ux) + h(ix + 1, iz) * ux) * (1 - uz) + (h(ix, iz + 1) * (1 - ux) + h(ix + 1, iz + 1) * ux) * uz;
  }
  /**
   * The round-1 stands' draws on the shared stream: the loop runs as it always did — its trees placed, then popped with
   * the trunk records and the concealment discs they registered (dropRimTreeOutsideWoods' rule) — so every placement
   * after it (the lone trees, the belts, the rim, the bushes) keeps its seat; the woodlots then grow on their own stream.
   */
  function replayRoundOneStandDraws(): void {
    if (keyedPlacement) return; // (keyed: no shared stream to keep in step)
    const t0 = trees.length, o0 = treeObstacles.length, c0 = concealers.length;
    const scratch: VegetationDisc[] = [];
    let attempts = 0;
    const clusterTarget = Math.round(veg.clusterCount * treeRichness());
    while (scratch.length < clusterTarget && attempts++ < 2600) {
      const x = (rng() * 2 - 1) * 430, z = (rng() * 2 - 1) * 430;
      if (!siteOk(x, z, 6)) continue;
      if (scratch.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 26)) continue;
      const r = 16 + rng() * 26;
      const species = pickSpecies(veg.clusterMix, rng());
      const n = 24 + (rng() * 34) | 0;
      let placed = 0;
      const cb0 = trees.length;
      for (let i = 0; i < n * 3 && placed < n; i++) {
        const a = rng() * Math.PI * 2, rr = r * Math.sqrt(rng());
        const sp = rng() < 0.8 ? species : pickSpecies(veg.loneMix, rng());
        if (addTree(x + Math.cos(a) * rr, z + Math.sin(a) * rr, sp)) placed++;
      }
      tintTreeStand(cb0);
      if (placed > 2) scratch.push({ x, z, r });
    }
    trees.length = t0; treeObstacles.length = o0; concealers.length = c0;
  }
  // (the trees lane: VegetationConfig `woodsOffArable` — a field's cropped ground, read through the land use's CPU twin)
  const arableLandAt = veg.woodsOffArable ? heightField._landUseAt ?? null : null;
  const _arableLand: LandFieldSample = { active: 0, crop: 0, edgeM: 0, endM: 0, sU: 0, sV: 0, split: 1, alongU: 1, marginM: 0, track: 0,
    hedge: 0, rowX: 1, rowZ: 0, jitter: 0, id: 0, boundary: 0, tintR: 0, tintG: 0, tintB: 0, sward: 1, cropHeight: 1, cropKeep: -1, weed: 0, urban: 0 };
  const arableCensus = { centres: 0, trees: 0, saplings: 0 };
  function onArable(x: number, z: number): boolean {
    if (arableLandAt === null) return false;
    const at = arableLandAt(x, z, _arableLand);
    return at.active > 0 && at.crop !== 0 && at.edgeM > at.marginM;
  }
  function placeTreeClusters(): void {
    replayRoundOneStandDraws();
    const wrShared = mulberry32((seed ^ 0x30d1a7) >>> 0);
    // trees round 2b: a hyper-arid place's stands are open groves in the low ground (a third of a wood's trees over
    // three and a half times the ground each, seated in a wadi bed or a hollow); Las Cañadas' are open groves anywhere
    const arid = treeBiomeArid(cfg?.id), open = treeBiomeOpen(cfg?.id);
    // trees round 3: a closed wood's crowns spread a sixth wider than a field tree's (treeBiomes.ts treeBiomeWoodSpread:
    // never an open grove's, nor the tidal coast's) — a rule of the place, so a build with or without its authored rows
    // grows the same woods
    const woodSpread = treeBiomeWoodSpread(cfg?.id);
    let attempts = 0;
    const clusterTarget = Math.round(veg.clusterCount * treeRichness());
    // round 2b: more tries than the round-1 2600 — a woodlot of the round-1 footprint fits fewer ways on a crowded map
    // (the trees lane: a landscape map keeps its woods' tree budget — the target stands' mean count, a round-2b stand's
    // 24-57 trees half again — placing stands past the target, up to a quarter more, until its stands hold it)
    const standBudget = landscape ? clusterTarget * (open ? 14.2 : 60.75) : 0;
    let standTrees = 0;
    while ((landscape ? clusters.length < clusterTarget * 1.25 && (clusters.length < clusterTarget || standTrees < standBudget)
      : clusters.length < clusterTarget) && attempts++ < 6000) {
      const wr = keyedPlacement ? keyedStream(1, attempts) : wrShared;
      // the stand's leading species first: a palm stand on a map that names its palm sites stands in one (the oasis,
      // the wadi, the spring), any other anywhere on the field
      const species = pickSpecies(veg.clusterMix, wr());
      const palmStand = species === 'palm' && !!veg.palmSites?.length;
      let x = (wr() * 2 - 1) * 430, z = (wr() * 2 - 1) * 430;
      if (palmStand) {
        const site = veg.palmSites![Math.min(veg.palmSites!.length - 1, Math.floor(wr() * veg.palmSites!.length))];
        const a = wr() * Math.PI * 2, rr = site.r * Math.sqrt(wr());
        x = site.x + Math.cos(a) * rr; z = site.z + Math.sin(a) * rr;
      }
      if (treeHalfAhead(x, z)) continue;
      if (!siteOk(x, z, 6)) continue;
      if (onArable(x, z)) { arableCensus.centres++; continue; }
      // (the trees lane: a landscape map's woodlot stands on its wood-zone ground)
      if (landscape && woodZoneScore(x, z) < landscapeThreshold) continue;
      if (arid && !palmStand && hollowDepthAt(x, z) < 0.8) continue;
      if (!uplandZoneOk(x, z, species)) continue;
      // the stand's trees and the ground each takes, so its area follows its count — a round-1 stand drew its radius
      // apart from its count and many read as thin orchards; then a stretch along a heading (area kept) and three
      // harmonics of the outline. Trees round 2b: 48-84 m² a tree (the round-1 stands' mean footprint, ~66 m²): at the
      // closed wood's 26-42 m² the woods covered half the ground they did, and the deployments' corridors lost a quarter
      // of their tree cover (Fjord 14.6 -> 11.1 %, Monsoon 23.2 -> 16.6 %, Verdant 20.6 -> 15.2 %) — the fast-match
      // tail battlePacing guards grew from three to six
      // r5: ~1.7x trees per stand — designated forest strips must read DENSE (closed canopy) next to WoT tree lines
      // Trees round 3 (2026-10-03, the gauntlet's wave 31: "trees stand singly like savanna; real places have closed
      // woods"): the woods' canopy closed at 41-45 % of their ground (Frontier, Verdant) — a parkland. A wood holds half
      // again the trees on two thirds of the ground each (32-56 m²), its ground kept, and its crowns spread a sixth
      // wider (woodSpread): the canopy closes over about two thirds of it. The draws are round 2b's.
      const n0 = 24 + (wr() * 34) | 0, n = open ? Math.max(5, Math.round(n0 * 0.35)) : Math.round(n0 * 1.5);
      const perTree = 48 + wr() * 36;
      const base = Math.sqrt(n * (open ? perTree * 2 : perTree * 0.66) / Math.PI);
      const stretch = Math.sqrt(1 + wr() * wr() * 1.6);
      const heading = wr() * Math.PI;
      const shape: WoodlotShape = {
        cos: Math.cos(heading), sin: Math.sin(heading), stretch,
        h: [0.06 + wr() * 0.12, 0.04 + wr() * 0.1, 0.02 + wr() * 0.07],
        p: [wr() * Math.PI * 2, wr() * Math.PI * 2, wr() * Math.PI * 2],
      };
      const r = base * stretch;
      if (!isSeparatedTreeCluster(x, z, r)) continue;
      // a large wood holds a clearing (a glade, a felled patch) off its centre
      const clearing = base > 21 && !open ? { a: wr() * Math.PI * 2, k: 0.3 + wr() * 0.3, r: base * (0.2 + wr() * 0.12) } : null;
      let placed = 0;
      const cb0 = trees.length, ob0 = treeObstacles.length, cc0 = concealers.length;
      const index = clusters.length;
      woodlotShapes[index] = shape;
      const disc: VegetationDisc = { x, z, r };
      let cx = 0, cz = 0;
      if (clearing) { const p = standPoint(index, disc, clearing.a, clearing.k); cx = p[0]; cz = p[1]; }
      // (the trees lane: a landscape map's stand, closing into its neighbours, tries twice as long to seat its count)
      for (let i = 0; i < n * (landscape ? 8 : 4) && placed < n; i++) {
        // the margin is denser than the heart (k ~ u^0.42), the stand thins in patches, a clearing stays open
        const a = wr() * Math.PI * 2, k = Math.pow(wr(), 0.42), keep = wr();
        const sp = wr() < 0.8 ? species : pickSpecies(veg.loneMix, wr());
        const p = standPoint(index, disc, a, k);
        const px = p[0], pz = p[1];
        if (clearing && Math.hypot(px - cx, pz - cz) < clearing.r) continue;
        // (the trees lane: a landscape map's wood keeps no thin patches — the draw is made all the same)
        if (!landscape && k < 0.85 && keep > 0.5 + 0.8 * woodlotDensity(px, pz)) continue;
        // a palm grove keeps to its water (wave 26: a palm stand's trees past the site grew as acacias round it, three
        // to each palm on Sirocco Wadi)
        if (palmStand && !palmSiteOk(px, pz)) continue;
        if (!uplandZoneOk(px, pz, sp)) continue;
        if (onArable(px, pz)) { arableCensus.trees++; continue; }
        if (addTree(px, pz, sp, wr, woodSpread)) {
          placed++;
          trees[trees.length - 1].wood = true;
          // a closed wood's interior (inside seven tenths of its outline) meets the far tier sooner (TreeRecord.nearScale)
          if (woodSpread > 1 && k < 0.7) trees[trees.length - 1].nearScale = 0.55;
        }
      }
      // r6 (content_breadth): coherent PER-STAND tint bias — a whole-stand lean (warm vs cool, small value drift) is
      // what makes mid-distance forest blocks read as distinct species stands
      tintTreeStand(cb0, wr);
      if (placed > 2) {
        // Keep at least three quarters of every existing stand in place. The map-authored rows consume records, never
        // add trees or change RNG.
        rememberAuthoredDonors(cb0, Math.floor(placed / 4));
        clusters.push(disc);
        standTrees += placed;
        clusterKeys.push(attempts);
      } else {
        // a stand that could not stand leaves no stray trees in the open (wave 26: the Caldera floor's attempts on its
        // steep cinder left a scatter of strays over it); its draws are spent as they were
        woodlotShapes.length = index;
        trees.length = cb0; treeObstacles.length = ob0; concealers.length = cc0;
      }
    }
    // (the trees lane: a landscape map's census — its stands against their target, the score a centre needed)
    if (landscape) {
      group.userData.landscapeWoods = { stands: clusters.length, target: clusterTarget, attempts: Math.min(attempts, 6000),
        threshold: +landscapeThreshold.toFixed(3), standTrees, standBudget: Math.round(standBudget) };
    }
  }
  placeTreeClusters();
  yield { stage: 'treeClusters' };
  // Ground lane (2026-10-03, the gauntlet: trees "scattered evenly instead of growing in clumps, groves and forest
  // masses"): on a map with a field system (the height field's landUse.ts hook) the nearest hedged field boundary within
  // 45 m of a point, a seat in its grass margin (1–2.5 m off the line, beside a track rather than on it) and the line's
  // heading — the lone trees' field-boundary share and field clumps grow there as hedgerow trees and remnants
  // (placeLoneTrees), the field bushes in the margins (addBush). Position-hashed, no draw: the seat moves only where
  // it is a site too. Without a field system nothing moves.
  const _hedgeSite = [0, 0, 0, 0]; // x, z, tangent x, tangent z
  // the field system read here from the height field itself (this section runs in the placement harnesses too)
  const hedgeLandAt = heightField._landUseAt ?? null;
  const _hedgeLand: LandFieldSample = { active: 0, crop: 0, edgeM: 0, endM: 0, sU: 0, sV: 0, split: 1, alongU: 1, marginM: 0, track: 0, hedge: 0, rowX: 1, rowZ: 0, jitter: 0, id: 0,
    boundary: 0, tintR: 0, tintG: 0, tintB: 0, sward: 1, cropHeight: 1, cropKeep: -1, weed: 0, urban: 0 };
  function hedgeSite(x: number, z: number, salt: number): number[] {
    _hedgeSite[0] = x; _hedgeSite[1] = z; _hedgeSite[2] = 0; _hedgeSite[3] = 0;
    if (hedgeLandAt === null) return _hedgeSite;
    const e0 = hedgeLandAt(x, z, _hedgeLand).edgeM;
    if (!_hedgeLand.active || e0 > 45) return _hedgeSite;
    const gx = hedgeLandAt(x + 1, z, _hedgeLand).edgeM - e0, gz = hedgeLandAt(x, z + 1, _hedgeLand).edgeM - e0;
    const gl = Math.hypot(gx, gz);
    if (gl < 0.3) return _hedgeSite;
    const ux = gx / gl, uz = gz / gl;
    const offset = 1.0 + 1.5 * treePositionNoise(x, z, salt);
    let tx = x - ux * (e0 - offset), tz = z - uz * (e0 - offset);
    const at = hedgeLandAt(tx, tz, _hedgeLand);
    if (at.edgeM > 3.5) return _hedgeSite;
    // only a hedged boundary takes its trees (the layout's hedge lines, landUse.ts hedgeShare): the field trees then draw
    // a few boundaries as unbroken shelterbelts and hedgerows instead of dotting every one of them evenly (the round-2
    // lab frames); a point near an open boundary keeps its own seat
    // (the flag read half a metre off the line on the tree's own side: each field carries its own boundary's hedge)
    if (hedgeLandAt(x - ux * (e0 - 0.5), z - uz * (e0 - 0.5), _hedgeLand).hedge < 0.5) return _hedgeSite;
    hedgeLandAt(tx, tz, _hedgeLand);
    if (_hedgeLand.track > 0.3) { tx = x - ux * (e0 - offset - 3.0); tz = z - uz * (e0 - offset - 3.0); }
    if (!siteOk(tx, tz, 0)) return _hedgeSite;
    _hedgeSite[0] = tx; _hedgeSite[1] = tz; _hedgeSite[2] = -uz; _hedgeSite[3] = ux;
    return _hedgeSite;
  }
  /**
   * The round-1 lone trees' draws on the shared stream: the scatter runs as it always did, its trees placed and then
   * popped with their trunk records and concealment discs, so every placement after it (the belts, the rim, the bushes)
   * keeps its seat (the woodlots' rule, replayRoundOneStandDraws).
   */
  function replayRoundOneLoneDraws(): void {
    if (keyedPlacement) return; // (keyed: no shared stream to keep in step)
    const t0 = trees.length, o0 = treeObstacles.length, c0 = concealers.length;
    for (let i = 0, placed = 0, loneTarget = Math.round(veg.loneCount * treeRichness()); i < 800 && placed < loneTarget; i++) {
      const x = (rng() * 2 - 1) * 460, z = (rng() * 2 - 1) * 460;
      if (addTree(x, z, pickSpecies(veg.loneMix, rng()))) {
        placed++;
        if (rng() < 0.4) {
          const a2 = rng() * Math.PI * 2, r2 = 4 + rng() * 7;
          if (addTree(x + Math.cos(a2) * r2, z + Math.sin(a2) * r2, pickSpecies(veg.loneMix, rng()))) placed++;
        }
      }
    }
    trees.length = t0; treeObstacles.length = o0; concealers.length = c0;
  }
  /** How far a point lies under the ground 30 m round it (m; a wadi bed or a hollow is positive). */
  function hollowDepthAt(x: number, z: number): number {
    let mean = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      mean += heightField.getHeightAt(x + Math.cos(a) * 30, z + Math.sin(a) * 30);
    }
    return mean / 8 - heightField.getHeightAt(x, z);
  }
  /**
   * Trees round 5 (2026-10-05, the coordinator's ruling on the gauntlet's wave 100: "conifers standing inside the brown
   * ploughed fields ... the Hessian farmland reads as savanna parkland"): on a map with a field system (the ground lane's
   * land use, read through the height field's `_landUseAt`) a field tree grows on a hedged boundary or at a wood's edge,
   * never in a field's interior (past its grass margin and clear of a road's verge). One the draws seat in an interior
   * moves to the nearest hedged boundary — hedgeSite from its seat, or from points 40 m round it — or, without one, to
   * the nearest wood's edge within 60 m; only then is it dropped (the lone trees' loop seats another in its place, so a
   * field keeps its cover count). A conifer form stands in the open only at a wood's edge: elsewhere the lone mix's
   * broadleaf form takes its slot. A dropped tree's draws are spent as a placed one's (placed and popped), every move is
   * position-hashed, and a map without a field system grows its field trees as before.
   */
  const _fieldLand: LandFieldSample = { active: 0, crop: 0, edgeM: 0, endM: 0, sU: 0, sV: 0, split: 1, alongU: 1, marginM: 0, track: 0, hedge: 0, rowX: 1, rowZ: 0, jitter: 0, id: 0,
    boundary: 0, tintR: 0, tintG: 0, tintB: 0, sward: 1, cropHeight: 1, cropKeep: -1, weed: 0, urban: 0 };
  /** Whether a point stands at a woodlot's edge: within two fifths of the stand's outline beyond it (or inside it). */
  function atWoodEdge(x: number, z: number): boolean {
    for (let i = 0; i < clusters.length; i++) if (standOutlineFraction(i, x, z) <= FIELD_TREE_WOOD_EDGE) return true;
    return false;
  }
  /** Whether a point lies in a field's interior: past the field's grass margin and clear of a road's verge. */
  function inFieldInterior(x: number, z: number): boolean {
    if (hedgeLandAt === null) return false;
    hedgeLandAt(x, z, _fieldLand);
    return _fieldLand.active > 0 && _fieldLand.edgeM > _fieldLand.marginM + FIELD_TREE_MARGIN_M
      && admission()._roadDist(x, z) > FIELD_TREE_ROAD_VERGE_M;
  }
  const _fieldSeat = [0, 0];
  /** Whether a seat stands clear of the field trees already planted (a moved line never stacks on one boundary point). */
  function fieldSeatClear(x: number, z: number, from: number): boolean {
    for (let i = from; i < trees.length; i++) if (Math.hypot(trees[i].x - x, trees[i].z - z) < FIELD_TREE_SPACING_M) return false;
    return true;
  }
  /**
   * A boundary seat stepped along the boundary's tangent (either way, a spacing at a time) until it stands clear of the
   * field trees already there, on a site a tree may take, and stays on the boundary (written to the seat); false if
   * none of seven does.
   */
  function fieldSeatAlong(bx: number, bz: number, tx: number, tz: number, from: number): boolean {
    for (let step = 0; step < 7; step++) {
      const along = (step === 0 ? 0 : (step % 2 === 1 ? 1 : -1) * Math.ceil(step / 2)) * FIELD_TREE_SPACING_M * 1.25;
      const cx = bx + tx * along, cz = bz + tz * along;
      if (fieldSeatClear(cx, cz, from) && siteOk(cx, cz, 0) && (step === 0 || (!inFieldInterior(cx, cz) && !atWoodEdge(cx, cz)))) {
        _fieldSeat[0] = cx; _fieldSeat[1] = cz;
        return true;
      }
    }
    return false;
  }
  /** A boundary seat from a probe point: across to its field's nearest edge, into the grass margin; or null. */
  const _boundarySeat = [0, 0, 0, 0];
  function boundarySeatFrom(px: number, pz: number): number[] | null {
    if (hedgeLandAt === null) return null;
    const e0 = hedgeLandAt(px, pz, _fieldLand).edgeM, margin = _fieldLand.marginM;
    if (!_fieldLand.active) return null;
    const gx = hedgeLandAt(px + 1, pz, _fieldLand).edgeM - e0, gz = hedgeLandAt(px, pz + 1, _fieldLand).edgeM - e0;
    const gl = Math.hypot(gx, gz);
    if (gl < 0.3) return null;
    const ux = gx / gl, uz = gz / gl, offset = Math.min(2.5, Math.max(1, margin * 0.5));
    _boundarySeat[0] = px - ux * (e0 - offset); _boundarySeat[1] = pz - uz * (e0 - offset);
    _boundarySeat[2] = -uz; _boundarySeat[3] = ux;
    return _boundarySeat;
  }
  /**
   * The seat an interior tree moves to, or null: the nearest boundary in the open — a hedged one (hedgeSite) or any
   * field's edge, its grass margin — found from the seat and from probes 25, 50, 75 and 100 m round it (a hedged one taken while
   * within half again the nearest's distance), stepped along it until it stands clear of the field trees already there;
   * else a wood's edge within 60 m. A seat at a wood's edge is the wood's, not the open field's: the boundaries' are
   * taken in the open, so the open field keeps its cover.
   */
  function fieldTreeMove(x: number, z: number, from: number): number[] | null {
    let bestHedge = Infinity, bestEdge = Infinity;
    const hedge = [0, 0, 0, 0], edge = [0, 0, 0, 0];
    for (let k = -1; k < 32; k++) {
      const ring = 25 * (1 + Math.floor(Math.max(0, k) / 8)), ang = (k % 8) * Math.PI / 4 + (Math.floor(Math.max(0, k) / 8) % 2) * Math.PI / 8;
      const px = k < 0 ? x : x + Math.cos(ang) * ring, pz = k < 0 ? z : z + Math.sin(ang) * ring;
      const site = hedgeSite(px, pz, 83);
      if ((site[2] !== 0 || site[3] !== 0) && !atWoodEdge(site[0], site[1])) {
        const d = Math.hypot(site[0] - x, site[1] - z);
        if (d < bestHedge) { bestHedge = d; hedge[0] = site[0]; hedge[1] = site[1]; hedge[2] = site[2]; hedge[3] = site[3]; }
      }
      const seat = boundarySeatFrom(px, pz);
      if (seat && !inFieldInterior(seat[0], seat[1]) && !atWoodEdge(seat[0], seat[1]) && siteOk(seat[0], seat[1], 0)) {
        const d = Math.hypot(seat[0] - x, seat[1] - z);
        if (d < bestEdge) { bestEdge = d; edge[0] = seat[0]; edge[1] = seat[1]; edge[2] = seat[2]; edge[3] = seat[3]; }
      }
    }
    if (bestHedge < Infinity && bestHedge <= 1.5 * bestEdge && fieldSeatAlong(hedge[0], hedge[1], hedge[2], hedge[3], from)) {
      fieldTreeLaw.toHedge++;
      return _fieldSeat;
    }
    if (bestEdge < Infinity && fieldSeatAlong(edge[0], edge[1], edge[2], edge[3], from)) {
      fieldTreeLaw.toBoundary++;
      return _fieldSeat;
    }
    if (bestHedge < Infinity && fieldSeatAlong(hedge[0], hedge[1], hedge[2], hedge[3], from)) {
      fieldTreeLaw.toHedge++;
      return _fieldSeat;
    }
    let bestWood = 120;
    for (let i = 0; i < clusters.length; i++) {
      const stand = clusters[i], shape = woodlotShapes[i];
      const dx = x - stand.x, dz = z - stand.z;
      const a = shape ? Math.atan2((dz * shape.cos - dx * shape.sin) * shape.stretch, (dx * shape.cos + dz * shape.sin) / shape.stretch)
        : Math.atan2(dz, dx);
      const at = standPoint(i, stand, a, 1.1);
      const d = Math.hypot(at[0] - x, at[1] - z);
      if (d < bestWood && fieldSeatClear(at[0], at[1], from)) { bestWood = d; _fieldSeat[0] = at[0]; _fieldSeat[1] = at[1]; }
    }
    if (bestWood >= 120) return null;
    fieldTreeLaw.toWood++;
    return _fieldSeat;
  }
  /** Whether a slot grows as a conifer form here (the form a map's palette or biome gives it, every tier alike). */
  function coniferForm(species: Species): boolean {
    // (the form formOf gives the slot: the map palette's, else its place's)
    const form = veg.palettes[species]?.form ?? treeBiomeSlot(cfg?.id, species)?.form ?? species;
    return (TREE_GROWTH_PROFILES as Partial<Record<string, { family: string }>>)[form]?.family === 'conifer';
  }
  /** A lone tree on a field-system map: seated by the field law (above), or as before without a field system. */
  function addFieldTree(x: number, z: number, species: Species, r: RandomSource, from: number): boolean {
    // (a town map's trees keep to its park belts, veg.parks, which are no fields)
    if (hedgeLandAt === null || !FIELD_TREE_LAW || veg.parks) return addTree(x, z, species, r);
    // a seat its own site refuses is refused as it always was: the lone trees' loop draws the trees it drew before the
    // law, and only their seats move (a dropped tree counts as planted, below)
    if (!siteOk(x, z, 0)) return false;
    let sx = x, sz = z;
    if (!atWoodEdge(x, z) && inFieldInterior(x, z)) {
      const seat = fieldTreeMove(x, z, from);
      if (!seat) return dropFieldTree(x, z, species, r);
      sx = seat[0]; sz = seat[1];
      fieldTreeLaw.moved++;
    }
    let sp = species;
    if (coniferForm(sp) && !atWoodEdge(sx, sz)) {
      const broadleaf = veg.loneMix.filter(([candidate]) => !coniferForm(candidate) && treeGeo[candidate]);
      if (broadleaf.length) {
        const total = broadleaf.reduce((sum, [, w]) => sum + w, 0);
        let roll = treePositionNoise(sx, sz, 89) * total;
        sp = broadleaf[broadleaf.length - 1][0];
        for (const [candidate, w] of broadleaf) { roll -= w; if (roll <= 0) { sp = candidate; break; } }
        fieldTreeLaw.swapped++;
      }
    }
    if (addTree(sx, sz, sp, r)) return true;
    // (the new seat refused it — a road, a building, the slope)
    return dropFieldTree(x, z, species, r);
  }
  /**
   * A field tree the law could seat nowhere: its draws spent as a planted tree's (placed at its own seat, then popped
   * with its records) and counted as planted, so the loop draws on as it did before the law.
   */
  function dropFieldTree(x: number, z: number, species: Species, r: RandomSource): boolean {
    const t0 = trees.length, o0 = treeObstacles.length, c0 = concealers.length;
    addTree(x, z, species, r);
    trees.length = t0; treeObstacles.length = o0; concealers.length = c0;
    fieldTreeLaw.dropped++;
    return true;
  }
  /**
   * The field law's tally and the field trees' census (the probes': vegetation.group.userData.fieldTreeLaw): the moved
   * (to a hedge, to their own field's boundary, to a wood's edge), swapped and dropped; the lone trees, those in the open
   * (not at a wood's edge), in a field's interior, and the conifer forms in the open.
   */
  const fieldTreeLaw = { moved: 0, toHedge: 0, toBoundary: 0, toWood: 0, swapped: 0, dropped: 0, lone: 0, open: 0, interior: 0, coniferOpen: 0 };
  /**
   * Trees round 2b (2026-10-03, the gauntlet's wave 15: "trees scattered at even, savanna-like spacing, whatever the
   * place"; round 3, wave 31: "trees stand singly like savanna; real places have closed woods, groves, shelterbelts and
   * hedgerow lines"): the field trees stand in groups and lines, never singly in the open. Two fifths as fringe groups
   * at a woodlot's edge (two to four trees along its outline, just outside it, where the wood's seedlings reach into
   * the field); a quarter as boundary lines (a hedgerow of five to nine along the nearest hedged field boundary where
   * the map has a field system, hedgeSite; else an avenue of four to seven along a road's verge); the rest as
   * shelterbelts of six to twelve in the open ground between the deployments, where the round-1 scatter gave the fights
   * their cover (battlePacing's fast tail grew without it) — on a hedge where one is near, else across or along the
   * deployments' axis. A line keeps one species but for a stranger in five, and a gap in seven. In a hyper-arid place
   * (treeBiomes.ts arid) the lone trees keep to the low ground, the wadi beds and hollows, singly or in pairs; in an
   * upland place (treeBiomes.ts upland) each to its form's zone. The lone trees draw from their own stream; the
   * round-1 scatter's draws replay on the shared one; the hedge seats are position-hashed (no draw moves).
   */
  function placeLoneTrees(): void {
    replayRoundOneLoneDraws();
    const loneFrom = trees.length;
    const lrShared = mulberry32((seed ^ 0x1a0e5) >>> 0);
    let lr: RandomSource = lrShared;
    const arid = treeBiomeArid(cfg?.id), zoned = uplandBand !== null;
    const loneTarget = Math.round(veg.loneCount * treeRichness());
    let reach = 0;
    for (const stand of clusters) reach += stand.r;
    const standByReach = (u: number): number => {
      let acc = 0;
      for (let k = 0; k < clusters.length; k++) { acc += clusters[k].r; if (u * reach <= acc) return k; }
      return clusters.length - 1;
    };
    // the deployments' axis (the player's anchor to the enemies' centroid) for the shelterbelts
    const anchorB = L.spawns.enemies.reduce((acc, e) => { acc.x += e.x / L.spawns.enemies.length; acc.z += e.z / L.spawns.enemies.length; return acc; }, { x: 0, z: 0 });
    const axisX = anchorB.x - L.spawns.player.x, axisZ = anchorB.z - L.spawns.player.z, axisL = Math.hypot(axisX, axisZ) || 1;
    let placed = 0;
    // a line of trees through (x0, z0) along the unit heading (dx, dz), centred on the seed: the same draws for every
    // tree whether it stands or not (its spacing, its offset off the line, its gap, its species)
    const plantLine = (x0: number, z0: number, dx: number, dz: number, count: number, spacing: number, species: Species): void => {
      for (let k = 0; k < count && placed < loneTarget; k++) {
        const along = (k - (count - 1) / 2) * spacing * (0.85 + lr() * 0.3), off = (lr() - 0.5) * 2.4;
        const gap = lr() < 0.14, stranger = lr() < 0.2;
        const sp = stranger ? pickSpecies(veg.loneMix, lr()) : species;
        const px = x0 + dx * along - dz * off, pz = z0 + dz * along + dx * off;
        if (gap || !uplandZoneOk(px, pz, sp)) continue;
        if (addFieldTree(px, pz, sp, lr, loneFrom)) placed++;
      }
    };
    for (let i = 0; i < 2400 && placed < loneTarget; i++) {
      if (keyedPlacement) lr = keyedStream(2, i);
      const roll = lr();
      let x = (lr() * 2 - 1) * 460, z = (lr() * 2 - 1) * 460;
      if (arid || zoned) {
        // a wadi bed or a hollow (or the form's zone, below), or nothing (try again); a tree and now and then a companion
        // (the companion drawn before the seat's test, as round 2b drew it: these places' trees stay where they stood)
        const companions = lr() < 0.4 ? 1 : 0;
        if (treeHalfAhead(x, z)) continue;
        if (arid && hollowDepthAt(x, z) < 1.2) continue;
        const species = pickSpecies(veg.loneMix, lr());
        if (!uplandZoneOk(x, z, species)) continue;
        if (addTree(x, z, species, lr)) {
          placed++;
          for (let c = 0; c < companions; c++) {
            const a2 = lr() * Math.PI * 2, r2 = 4 + lr() * 7;
            const cx = x + Math.cos(a2) * r2, cz = z + Math.sin(a2) * r2;
            const companion = pickSpecies(veg.loneMix, lr());
            if (uplandZoneOk(cx, cz, companion) && addTree(cx, cz, companion, lr)) placed++;
          }
        }
      } else if (roll < 0.4 && clusters.length) {
        // a fringe group at a woodlot's edge, along its outline just outside it
        const index = standByReach(lr()), a = lr() * Math.PI * 2, k = 1.04 + lr() * 0.22;
        const point = standPoint(index, clusters[index], a, k);
        const count = 2 + ((lr() * 3) | 0), spacing = 5 + lr() * 2;
        plantLine(point[0], point[1], -Math.sin(a), Math.cos(a), count, spacing, pickSpecies(veg.loneMix, lr()));
      } else if (roll < 0.65) {
        // a hedgerow along the nearest hedged field boundary, else an avenue along a road's verge
        const site = hedgeSite(x, z, 61);
        if (site[2] !== 0 || site[3] !== 0) {
          const sx = site[0], sz = site[1], tx = site[2], tz = site[3];
          const count = 5 + ((lr() * 5) | 0), spacing = 6 + lr() * 3;
          plantLine(sx, sz, tx, tz, count, spacing, pickSpecies(veg.loneMix, lr()));
        } else {
          const d = admission()._roadDist(x, z);
          if (d < 10 || d > 17) continue;
          // the road's heading: across the gradient of the distance to it
          const gx = admission()._roadDist(x + 1, z) - d, gz = admission()._roadDist(x, z + 1) - d, gl = Math.hypot(gx, gz) || 1;
          const count = 4 + ((lr() * 4) | 0), spacing = 8 + lr() * 3;
          plantLine(x, z, -gz / gl, gx / gl, count, spacing, pickSpecies(veg.loneMix, lr()));
        }
      } else {
        // a shelterbelt in the open ground between the deployments (along the axis, its middle seven tenths, within
        // 220 m of it): on the nearest hedged boundary where there is one, else across or along the axis, a little off
        const t = 0.15 + lr() * 0.7, w = (lr() * 2 - 1) * 220;
        x = L.spawns.player.x + axisX * t - (axisZ / axisL) * w;
        z = L.spawns.player.z + axisZ * t + (axisX / axisL) * w;
        const across = lr() < 0.5, tilt = (lr() - 0.5) * 0.5;
        const count = 6 + ((lr() * 7) | 0), spacing = 5 + lr() * 3;
        const species = pickSpecies(veg.loneMix, lr());
        const site = hedgeSite(x, z, 61);
        let dx: number, dz: number;
        if (site[2] !== 0 || site[3] !== 0) { x = site[0]; z = site[1]; dx = site[2]; dz = site[3]; }
        else {
          const ux = axisX / axisL, uz = axisZ / axisL, bx = across ? -uz : ux, bz = across ? ux : uz;
          dx = bx * Math.cos(tilt) - bz * Math.sin(tilt); dz = bx * Math.sin(tilt) + bz * Math.cos(tilt);
        }
        plantLine(x, z, dx, dz, count, spacing, species);
      }
    }
  }
  const authoredLoneStart = trees.length;
  placeLoneTrees();
  fieldTreeLaw.lone = trees.length - authoredLoneStart;
  for (let i = authoredLoneStart; i < trees.length; i++) trees[i].field = true;
  if (hedgeLandAt !== null && !veg.parks) {
    for (let i = authoredLoneStart; i < trees.length; i++) {
      const t = trees[i];
      let inside = false;
      for (let k = 0; k < clusters.length && !inside; k++) if (standOutlineFraction(k, t.x, t.z) <= 1) inside = true;
      if (!inside) fieldTreeLaw.open++;
      if (atWoodEdge(t.x, t.z)) continue;
      if (inFieldInterior(t.x, t.z)) fieldTreeLaw.interior++;
      if (coniferForm(t.species)) fieldTreeLaw.coniferOpen++;
    }
  }
  group.userData.fieldTreeLaw = fieldTreeLaw;
  // maps r1 (ADDITIVE, config-gated): WINDBREAK BELTS — authored tree LINES
  // ({x0,z0,x1,z1, gap?, jitter?, species?}) for steppe shelterbelts and
  // field-boundary rows. Runs only when cfg.vegetation.belts exists, so no
  // pre-existing map consumes a single extra rng() draw (their layouts stay
  // bit-identical). Trees go through addTree => full siteOk rules + obstacles
  // + concealment, i.e. belts are real cover, not dressing.
  function placeTreeBelts(): void {
    placingBelts = true;
    try {
      placeBeltRows();
    } finally {
      placingBelts = false;
    }
  }
  function placeBeltRows(): void {
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
  rememberAuthoredDonors(authoredLoneStart, trees.length - authoredLoneStart);

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
  // Round 77c: the rim's trees, for their mean stature (the ring forest's impostors take it, horizonForestImpostors.ts)
  const rimTrees: TreeRecord[] = [];
  // The map-borders lane (2026-10-03, owner: "i literally just see a treeline and then nothing"): the rim forest stands
  // by the border's woods (the ring forest beyond does too — borderLandform.ts woodsAt), so the woods cross the red line
  // as one and open country stays open; the blocks used to ring the whole square like a hedge wall, hiding the land
  // behind them. Past the playable edge a tree outside the woods is dropped (a lone one stays now and then); inside it,
  // where trees are cover and crush records, a third of the trees in the open stay, so the edge keeps scattered cover
  // with clearings between. The placement stream is consumed exactly as before — a dropped tree is placed, then popped
  // with the trunk record and the concealment disc it registered — and a block's understorey still counts it.
  const borderWoodsAt = heightField.getBorderWoodsAt;
  // trees round 2b (2026-10-03, wave 26 at Sirocco's east edge: "a lone lollipop broadleaf ... on the foreground dune"):
  // a hyper-arid place's rim keeps its trees where its floor's do — a wadi bed or a hollow, or its palm sites
  const aridRim = treeBiomeArid(cfg?.id);
  function dropRimTreeOutsideWoods(x: number, z: number): boolean {
    const inside = Math.max(Math.abs(x), Math.abs(z)) <= PLAYABLE_HALF_EXTENT_M;
    // (and an upland place's keeps each form to its zone, uplandZoneOk)
    if (!(aridRim && hollowDepthAt(x, z) < 1.2 && !palmSiteOk(x, z)) && uplandZoneOk(x, z, trees[trees.length - 1].species)) {
      if (!borderWoodsAt) return false;
      // trees round 3 (2026-10-03, the gauntlet's wave 31: "trees stand singly like savanna"): the trees kept in the open
      // stand by the patch, not one by one — the hash is the 36 m cell's, so a kept share is a copse with clearings
      // round it, never a scatter of singles along the edge
      const cell = treePositionNoise(Math.floor(x / 36) * 36 + 18, Math.floor(z / 36) * 36 + 18, 9);
      if (cell < Math.max(inside ? 0.34 : 0.04, borderWoodsAt(x, z))) return false;
    }
    const tree = trees.pop()!;
    roadBlockedRimTrees.delete(tree);
    if (inside && treeObstacles.length && treeObstacles[treeObstacles.length - 1].treeIdx === trees.length) {
      treeObstacles.pop();
      const disc = concealers[concealers.length - 1];
      if (disc && disc.x === tree.x && disc.z === tree.z) concealers.pop();
    }
    return true;
  }
  yield { stage: 'treeLoneAndBelts' };
  function placeRimForest(): void {
    for (let c = 0; c < veg.rimCount; c++) {
      const br = keyedPlacement ? keyedStream(4, c) : rng;
      const slot = (c + (br() - 0.5)) / Math.max(1, veg.rimCount);
      const a = slot * Math.PI * 2 + (br() - 0.5) * 0.22;
      const rad = 442 + br() * 52;
      const cx = Math.cos(a) * rad, cz = Math.sin(a) * rad;
      if (Math.max(Math.abs(cx), Math.abs(cz)) > 502) continue;
      const species = pickSpecies(veg.rimMix, br());
      const bw = 26 + br() * 44;          // block width wanders 26-70 m
      const dens = 0.55 + br() * 0.95;    // per-block density wanders
      const n = Math.max(6, Math.round((16 + br() * 18) * dens));
      const tb = br();
      _standTint.setRGB(0.88 + tb * 0.24, 0.94 + (br() - 0.5) * 0.10,
        0.88 + (1 - tb) * 0.22);
      const b0 = trees.length;
      let placed = 0;
      for (let i = 0; i < n; i++) {
        const tr = keyedPlacement ? keyedStream(5, c * 128 + i) : rng;
        const x = cx + (tr() - 0.5) * bw, z = cz + (tr() - 0.5) * bw;
        if (Math.max(Math.abs(x), Math.abs(z)) > 506) continue;
        // maps r1: the rim ring can cross open WATER now (coastal bay fills the
        // east rim) — no forest wading in the sea. noVeg is false along every
        // pre-existing map's rim, so this is a no-op for them.
        if (noVeg(x, z)) continue;
        // Boundary spawns can sit inside the horizon ring. Keep a chase-camera
        // corridor here because rim trees intentionally bypass the ordinary
        // playable-area site policy. Owner review 2026-09-13: the 36 m disc
        // cleared the whole forest the reference build (1049e4e) had around the
        // Fjord and Alpine spawns; 20 m still clears the tank and the camera
        // (which sits ~12 m behind the spawn) and keeps the stand in view.
        if (!isClearOfSpawns(x, z, protectedSpawns, RIM_SPAWN_CLEARANCE_M) || overTreeCeiling(x, z)) continue;
        // (a hyper-arid border's trees are field trees in its hollows, not a forest ring's giants: round 3)
        pushTree(x, z, tr() < 0.85 ? species : pickSpecies(veg.rimMix, tr()), aridRim ? 0.95 : 1.35, aridRim ? 1.5 : 2.2, false, tr);
        placed++;
        if (dropRimTreeOutsideWoods(x, z)) continue;
        trees[trees.length - 1].wood = true;
        rimTrees.push(trees[trees.length - 1]);
      }
      for (let i = b0; i < trees.length; i++) trees[i].tint.multiply(_standTint);
      if (placed >= 3) rimBlocks.push({ x: cx, z: cz, r: bw * 0.5 }); // round 77b: a block that stands
    }
  }
  placeRimForest();
  // saddle emergents between the rim blocks
  function placeSaddleTrees(): void {
    for (let i = 0, nSad = Math.round(veg.rimCount * 1.5); i < nSad; i++) {
      const sr = keyedPlacement ? keyedStream(6, i) : rng;
      const a = sr() * Math.PI * 2;
      const rad = 446 + sr() * 48;
      const x = Math.cos(a) * rad + (sr() - 0.5) * 18;
      const z = Math.sin(a) * rad + (sr() - 0.5) * 18;
      if (Math.max(Math.abs(x), Math.abs(z)) > 506) continue;
      if (noVeg(x, z)) continue; // maps r1: see the rim-block note (sea rim)
      if (!isClearOfSpawns(x, z, protectedSpawns, RIM_SPAWN_CLEARANCE_M) || overTreeCeiling(x, z)) continue;
      pushTree(x, z, pickSpecies(veg.rimMix, sr()), aridRim ? 0.9 : 1.2, aridRim ? 1.4 : 1.9, false, sr);
      if (dropRimTreeOutsideWoods(x, z)) continue;
      trees[trees.length - 1].wood = true;
      rimTrees.push(trees[trees.length - 1]);
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
    for (let ci = 0; ci < clusters.length; ci++) {
      const c = clusters[ci];
      const sapRng = keyedPlacement ? keyedStream(7, clusterKeys[ci]) : sapRngShared;
      const nSap = 3 + (sapRng() * 4) | 0;
      for (let sIt = 0; sIt < nSap; sIt++) {
        const sa = sapRng() * Math.PI * 2;
        // trees round 2: just past the woodlot's own outline (standPoint)
        const edge = standPoint(ci, c, sa, 1.02 + sapRng() * 0.35);
        const sx = edge[0], sz = edge[1];
        const roll = sapRng(), sc = 0.42 + sapRng() * 0.26;
        const yawS = sapRng() * Math.PI * 2;
        const vjS = 0.60 + sapRng() * 0.40;
        const variantS = (sapRng() * 3) | 0, fvS = (sapRng() * 2) | 0;
        const jr = sapRng(), jg = sapRng(), jb = sapRng();
        if (!siteOk(sx, sz, 0)) continue;
        if (onArable(sx, sz)) { arableCensus.saplings++; continue; }
        const sy = heightField.getHeightAt(sx, sz);
        let spS = pickSpecies(veg.clusterMix, roll);
        if (spS === 'palm' && palmElsewhere && !palmSiteOk(sx, sz)) spS = palmElsewhere;
        // an upland place's sapling grows in its form's zone too (its draws already made)
        if (!uplandZoneOk(sx, sz, spS)) continue;
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
          wood: true,
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
  if (veg.woodsOffArable) group.userData.woodsOffArable = { refused: { ...arableCensus }, landUse: arableLandAt !== null };
  /**
   * The Redrock lane (veg.coverHalvesAbout): the halves' trees evened at the last. The border's blocks and a stand's
   * saplings grow in runs along one half, so where they leave a half short a lone tree is seated in it — each its own
   * keyed draws, a seat drawn in the other half turned about the point, a hyper-arid place's in a bed or a hollow — until
   * the halves stand within a tree of each other.
   */
  function evenTreeHalves(): void {
    if (!halvesAbout) return;
    const arid = treeBiomeArid(cfg?.id);
    for (let i = 0; i < 2400; i++) {
      countTreeHalves(true);
      if (Math.abs(_coverHalves[0] - _coverHalves[1]) <= 1) return;
      const r = keyedStream(13, i);
      const seat = seatInHalf((r() * 2 - 1) * 460, (r() * 2 - 1) * 460, _coverHalves[0] < _coverHalves[1] ? 0 : 1);
      const x = seat[0], z = seat[1], species = pickSpecies(veg.loneMix, r());
      if (arid && hollowDepthAt(x, z) < 1.2) continue;
      if (!isClearOfSpawns(x, z, deploymentSlots, 26)) continue;
      if (!uplandZoneOk(x, z, species)) continue;
      if (addTree(x, z, species, r)) trees[trees.length - 1].field = true;
    }
  }
  evenTreeHalves();

  /**
   * Trees lane (2026-10-06): a map's hedge trees (VegetationConfig `hedgeTrees`). The playable ground is read on a
   * HEDGE_SCAN_M grid through the land use's CPU twin; a point in a hedge's band (hedge ≥ 0.98: within its 1.2 m of the
   * line, on its field's side) joins its field end's line (the field's id and the side of its short edge). Along each
   * line, by its coordinate along the block grid's v axis, a seat every spacingM (jittered ±25 %) nearest the line,
   * the field gate's gap left (its centre a hash of the line), the site's rules and a field tree's 5 m from any tree
   * kept; the species from the mix. Own stream; census in group.userData.hedgeTrees (with trees per hedge km).
   */
  function plantHedgeTrees(): void {
    const ht = veg.hedgeTrees;
    if (!ht || hedgeLandAt === null) return;
    const profile = resolveLandUseProfile((cfg as { id?: string } | null)?.id);
    if (!profile) return;
    const hedgeRng = mulberry32((seed ^ 0x4ed9e) >>> 0);
    const ch = Math.cos(profile.heading), sh = Math.sin(profile.heading);
    const lines = new Map<number, number[]>(); // key -> [along, x, z, the seat's miss]*
    // (the trees lane, 2026-10-07: `along: 'boundary'` — a ditched region's willow rows: the field's own boundary across
    // its nearer axis, planted from the field on its far side only, in a band `offsetM` in from it, off the ditch)
    const boundaryMode = ht.along === 'boundary';
    const [band0, band1] = ht.offsetM ?? [1.8, 3.4], bandMid = (band0 + band1) / 2;
    for (let z = -PLAYABLE_HALF_EXTENT_M + 15; z <= PLAYABLE_HALF_EXTENT_M - 15; z += HEDGE_SCAN_M) {
      for (let x = -PLAYABLE_HALF_EXTENT_M + 15; x <= PLAYABLE_HALF_EXTENT_M - 15; x += HEDGE_SCAN_M) {
        const at = hedgeLandAt(x, z, _hedgeLand);
        if (!at.active) continue;
        let key: number, along: number, miss: number;
        if (!boundaryMode) {
          if (at.hedge < 0.98) continue;
          key = at.id * 2 + (at.sU >= 0 ? 0 : 1); along = -sh * x + ch * z; miss = Math.abs(at.sU);
        } else {
          if (at.track > 0.3) continue;
          const acrossU = Math.abs(at.sU) <= Math.abs(at.sV), off = acrossU ? at.sU : at.sV, d = Math.abs(off);
          if (off < 0 || d < band0 || d > band1) continue;
          key = at.id * 2 + (acrossU ? 0 : 1); along = acrossU ? -sh * x + ch * z : ch * x + sh * z; miss = Math.abs(d - bandMid);
        }
        let line = lines.get(key);
        if (!line) { line = []; lines.set(key, line); }
        line.push(along, x, z, miss);
      }
    }
    // the trees already standing (the field law's 5 m), on a grid; the hedge trees join it as they stand
    const cell = 8, near = new Map<number, number[]>();
    const keyOf = (x: number, z: number): number => (Math.floor(x / cell) + 4096) * 8192 + (Math.floor(z / cell) + 4096);
    const remember = (x: number, z: number): void => { const k = keyOf(x, z), b = near.get(k); if (b) b.push(x, z); else near.set(k, [x, z]); };
    for (const t of trees) remember(t.x, t.z);
    const clear = (x: number, z: number): boolean => {
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
        const b = near.get((gx + 4096) * 8192 + (gz + 4096));
        if (b) for (let i = 0; i < b.length; i += 2) if (Math.hypot(b[i] - x, b[i + 1] - z) < FIELD_TREE_SPACING_M) return false;
      }
      return true;
    };
    const census = { lines: 0, km: 0, seats: 0, planted: 0, gates: 0, refused: { site: 0, spacing: 0, authored: 0 }, species: {} as Record<string, number> };
    const gateHalf = (ht.gateM ?? 4) / 2;
    for (const key of [...lines.keys()].sort((a, b) => a - b)) {
      const raw = lines.get(key)!, n = raw.length / 4;
      if (n < 3) continue;
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => raw[a * 4] - raw[b * 4]);
      const a0 = raw[order[0] * 4], a1 = raw[order[n - 1] * 4];
      if (a1 - a0 < (boundaryMode ? Math.max(ht.spacingM, ht.minLineM ?? 40) : ht.spacingM)) continue;
      census.lines++; census.km += (a1 - a0) / 1000;
      // the field gate: its centre a hash of the line, inside its middle three fifths
      const gate = a0 + (a1 - a0) * (0.2 + 0.6 * ((Math.imul(key, 2654435761) >>> 0) / 4294967296));
      census.gates++;
      let next = a0 + ht.spacingM * 0.5 * (0.5 + hedgeRng());
      for (let j = 0; j < n; j++) {
        const i = order[j], along = raw[i * 4];
        if (along < next) continue;
        // the seat: of the points within a scan step along, the nearest the line
        let best = i;
        for (let k = j + 1; k < n && raw[order[k] * 4] < along + HEDGE_SCAN_M; k++) if (raw[order[k] * 4 + 3] < raw[best * 4 + 3]) best = order[k];
        next = along + ht.spacingM * (0.75 + 0.5 * hedgeRng());
        if (Math.abs(along - gate) < gateHalf + 1) continue;
        const x = raw[best * 4 + 1], z = raw[best * 4 + 2], species = pickSpecies(ht.mix, hedgeRng());
        census.seats++;
        if (!clear(x, z)) { census.refused.spacing++; continue; }
        if (!siteOk(x, z, 0)) { census.refused.site++; continue; }
        pushTree(x, z, species, 0.9, 1.5, true, hedgeRng, 1);
        trees[trees.length - 1].hedgeRow = true;
        remember(x, z);
        census.planted++;
        census.species[species] = (census.species[species] ?? 0) + 1;
      }
    }
    group.userData.hedgeTrees = { ...census, along: boundaryMode ? 'boundary' : 'hedge', km: +census.km.toFixed(2),
      perKm: census.km > 0 ? +(census.planted / census.km).toFixed(1) : 0 };
  }
  plantHedgeTrees();

  // Round 77 (2026-09-26): the stand shade. A tree inside a dense stand stands under its neighbours' crowns: the
  // sky over it is mostly leaves, so it reads darker than the trees at the edge — the crown-scale contrast a far
  // forest needs to read as trees and not as a band, and the same tone the near stand's interior carries. Counted
  // once at construction on a 12 m grid (neighbouring trunks within 10 m, 8 saturating), baked into the instance
  // tint every LOD shares; the placements, RNG streams and records never move. Counted here, after the last
  // RNG-driven placement and before the structure, road and tidal passes (those remove or relocate records: a
  // relocated mangrove keeps its stand's tone, and a build with or without the tidal band tints alike).
  {
    const cell = 12, grid = new Map<number, number[]>();
    const keyOf = (x: number, z: number): number => (Math.floor(x / cell) + 4096) * 8192 + (Math.floor(z / cell) + 4096);
    for (let i = 0; i < trees.length; i++) {
      const k = keyOf(trees[i].x, trees[i].z);
      const bucket = grid.get(k);
      if (bucket) bucket.push(i); else grid.set(k, [i]);
    }
    for (const t of trees) {
      let neighbours = 0;
      const cx = Math.floor(t.x / cell), cz = Math.floor(t.z / cell);
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
        const bucket = grid.get((gx + 4096) * 8192 + (gz + 4096));
        if (!bucket) continue;
        for (const j of bucket) {
          const o = trees[j];
          if (o === t) continue;
          const dx = o.x - t.x, dz = o.z - t.z;
          if (dx * dx + dz * dz < 100) neighbours++;
        }
      }
      const density = Math.min(1, neighbours / 8);
      t.tint.multiplyScalar(1 - 0.24 * density * density * (3 - 2 * density));
    }
  }

  // Village trees are already kept 24 m outside its building envelope, but
  // authored lane structures can sit anywhere on the map. Reserve their real
  // oriented roof footprints against the complete crown + lean envelope.
  // This runs after every RNG-driven placement, and before any tree pool or
  // root decal is built, so no rejected tree survives as collision/spotting.
  // Placed structures that need clear ground (Mangrove's fishery wharf) join them with the footprint their own plan
  // gives; no other map publishes one.
  // The scenery lane (2026-10-03): a map's rock formations and landmarks claim their ground from the config alone.
  // The landmarks lane (2026-10-05): a map's set pieces claim their footprints the same way (landmarks/plan.ts).
  const placedClearances = placedStructureClearances((cfg as { id?: string } | null)?.id, heightField,
    cfg?.props?.riverLandings ?? [], cfg?.props?.landmarks, (cfg as SceneryMapConfig | null)?.scenery);
  const structureClearances = [...createStructureClearances(
    cfg?.props?.tacticalBeats ?? [], DESTRUCTIBLE_BUILDING_TYPES,
  ), ...placedClearances];
  group.userData.structureClearance = {
    sites: structureClearances.length,
    rejectedTrees: excludeStructureVegetation(
      trees, treeObstacles, concealers, structureClearances,
      (tree) => tree.cr + Math.sin(TREE_ARCHETYPES[tree.species].leanMaxRad) * (tree.fallH ?? 0),
    ),
  };
  if (authoredTreeDonors && veg.authoredTrees) {
    // (trees round 5: a tree the rows move takes its new seat's wood mark — a row's own seat is a field tree's, open-grown;
    // a squatter moved onto a stand tree's old seat stands in the wood)
    const seatKey = (t: TreeRecord): string => `${t.x},${t.z}`;
    const seatWood = new Map<string, boolean>(), seatOf = new Map<TreeRecord, string>();
    for (const t of trees) { const key = seatKey(t); seatWood.set(key, t.wood === true); seatOf.set(t, key); }
    // (trees lane, 2026-10-05: a map that opts in stands its stands inside its settlement rect, clear of its planned sites
    // and of the polygons it names; Kestrel's dispersal quarters)
    const settled = veg.authoredInSettlement;
    const standSite = settled
      ? (x: number, z: number, margin: number): boolean => siteOk(x, z, margin, true) && !insideClearPolygon(settled.clear ?? [], x, z)
      : siteOk;
    const standClearances = settled
      ? [...structureClearances, ...plannedSiteClearances(cfg?.props?.plannedSites ?? [])] : structureClearances;
    group.userData.authoredTrees = redistributeAuthoredTrees(trees, treeObstacles, concealers,
      authoredTreeDonors, veg.authoredTrees, heightField, standSite, standClearances, cfg?.props?.wallRuns ?? []);
    for (const t of trees) { const key = seatKey(t); if (key !== seatOf.get(t)) t.wood = seatWood.get(key) ?? false; }
    // (the trees lane, 2026-10-07: the redistribution reads the map without its hedge — authoredTreePlacement.ts
    // stationOccupant — so a hedge tree keeps a field tree's spacing from every tree the rows moved, onto a station or
    // onto a donor's old ground, as it kept it from the trees standing when it was planted; the hedge trees come last,
    // so every tree before them stands where the map without a hedge puts it)
    const hedgeCensus = group.userData.hedgeTrees as { refused: { authored: number } } | undefined;
    if (hedgeCensus) {
      const moved = trees.filter((t) => !t.hedgeRow && seatKey(t) !== seatOf.get(t));
      if (moved.length) {
        hedgeCensus.refused.authored = excludeVegetation(trees, treeObstacles, concealers, (t) => t.hedgeRow === true
          && moved.some((m) => Math.hypot(m.x - t.x, m.z - t.z) < FIELD_TREE_SPACING_M));
      }
    }
  }

  // ground lane: where the trees stand before the tidal map moves its willows (the field bushes' knot sites)
  const knotSites = new Float64Array(trees.length * 2);
  for (let i = 0; i < trees.length; i++) { knotSites[i * 2] = trees[i].x; knotSites[i * 2 + 1] = trees[i].z; }
  // near/far instanced meshes (partition rewritten on camera movement, hysteresis).
  function placeTidalTrees(): void {
    if (veg.willowForm === 'tidalMangrove' && veg.tidalTrees && authoredTreeDonors) {
      group.userData.tidalMangroves = relocateTidalMangroves(trees, treeObstacles, concealers,
        authoredTreeDonors, veg.tidalTrees, veg.authoredTrees ?? [], heightField, structureClearances,
        cfg?.props?.riverLandings ?? [], veg.avoid ?? []);
    }
    authoredTreeDonors?.clear();
  }
  placeTidalTrees();
  let rootDecalOrdinals: Map<TreeRecord,number> | null = null;
  const inDeploymentClearing = (tree: TreeRecord): boolean => !isClearOfSpawns(tree.x, tree.z, deploymentSlots, 26);
  const clearsDeployment = trees.some(inDeploymentClearing);
  const clearedHedgeTrees = clearsDeployment ? trees.reduce((n, t) => n + (t.hedgeRow && inDeploymentClearing(t) ? 1 : 0), 0) : 0;
  if (placementAdmission || roadBlockedRimTrees.size || clearsDeployment) {
    rootDecalOrdinals=new Map(trees.map((tree,index)=>[tree,index]));
  }
  if (placementAdmission || roadBlockedRimTrees.size) {
    group.userData.roadPlacementClearance={rejectedTrees:excludeVegetation(
      trees,treeObstacles,concealers,tree=>roadBlockedRimTrees.has(tree)
        || newlyUnsafeRoadSite(tree.x,tree.z,9,.82),group.userData.tidalMangroves)};
  }
  // symmetric deployments: the trees within a deployment slot's clearing, after every seeded pass (the root decals keep
  // their stream through rootDecalOrdinals, as for the road clearance)
  group.userData.deploymentClearance = { slots: deploymentSlots.length, rejectedTrees: clearsDeployment
    ? excludeVegetation(trees, treeObstacles, concealers, inDeploymentClearing, group.userData.tidalMangroves) : 0 };
  roadBlockedRimTrees.clear();
  // (trees lane: the hedge trees still standing once the structure, road and tidal passes have taken theirs; the
  // deployment clearings' share counted apart)
  if (group.userData.hedgeTrees) {
    group.userData.hedgeTrees.standing = trees.reduce((n, t) => n + (t.hedgeRow ? 1 : 0), 0);
    group.userData.hedgeTrees.clearings = clearedHedgeTrees;
  }
  // Each LOD is a trunk mesh (opaque bark) + a card mesh (alpha foliage) sharing
  // the same instance matrices.
  const _whiteScratch = new THREE.Color(1, 1, 1);
  // p2 trees lane (2026-10-01): the battle zones' snags. After every placement, exclusion and relocation pass (the
  // placement streams, the records' admission and the stand shade never move), a share of the living trees — by a
  // position hash, thickest toward the middle of the field where the lines meet, never within 45 m of a spawn,
  // never a palm or a tidal mangrove — stands as a shell-killed snag: its species (its pools are its own), its
  // crown and fall measures for the camera's occlusion fade and the toppled pose, a charred grey tint and its root
  // decal. A snag is a look only: the obstacle and concealment records the simulation reads (collision, spotting,
  // the host's world) are the living tree's, the same on every tier and on `?legacyTrees=1` — the phones grow no
  // snags, and a mixed lobby must share one world.
  function convertSnags(): number {
    if (!(snagShare > 0)) return 0;
    const SNAG = { canopyCenterM: 3.4, canopyRadiusM: 1.4, fallHeightM: 5.4, fallRadiusM: 0.16, rootDecalRadiusM: 1.2 };
    let converted = 0;
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i];
      if (t.species === 'palm' || (t.species === 'willow' && veg.willowForm === 'tidalMangrove')) continue;
      if (!isClearOfSpawns(t.x, t.z, spawnClearings, 45)) continue;
      const middle = 1 - smoothstepJs(180, 470, Math.hypot(t.x, t.z));
      if (treePositionNoise(t.x, t.z, 9) >= snagShare * (0.35 + 1.3 * middle)) continue;
      const e = t.mat.elements;
      const sxz = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[8], e[9], e[10])), sy = Math.hypot(e[4], e[5], e[6]);
      (t as { species: string }).species = 'snag';
      t.cy = e[13] + SNAG.canopyCenterM * sy;
      t.cr = SNAG.canopyRadiusM * sxz;
      t.fallH = SNAG.fallHeightM * sy;
      t.fallR = SNAG.fallRadiusM * sxz;
      t.dr = SNAG.rootDecalRadiusM * sxz;
      const value = 0.62 + treePositionNoise(t.x, t.z, 10) * 0.25;
      t.tint.setRGB(value, value * 0.96, value * 0.92);
      converted++;
    }
    return converted;
  }
  group.userData.battleSnags = { share: snagShare, converted: convertSnags() };
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
    capacity: number,
  ): TreeMesh {
    if (!Number.isSafeInteger(capacity) || capacity < 0 || (capacity === 0 && trees.length > 0)) {
      throw new RangeError('Tree instance pools require a valid capacity for their population');
    }
    // per-instance occlusion fade — EVERY geometry drawn with the tree hooks
    // must carry the attribute (near meshes are updated live; far meshes stay
    // zero — a tree within camera range is always in the near partition)
    if (!geo.getAttribute('aFadeI')) {
      const fadeAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
      fadeAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFadeI', fadeAttr);
    }
    if (!geo.getAttribute('aLodF')) { // aa-r1: LOD cross-fade dissolve share
      const lodAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
      lodAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aLodF', lodAttr);
    }
    const m = new THREE.InstancedMesh(geo, mat, capacity);
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
  // Shadow redesign 2026-09-12: the crown shadow proxies that the r5 budget
  // note measured as net-negative were rendered in the forward passes with
  // colorWrite off. They now sit on the shadow-only render layer that the
  // tank shadow batches already use (renderLayers.ts routes it into every
  // cascade pass and nowhere else), so a near tree casts its far-LOD lobe hull
  // (~150 tris) and a far tree a 20-tri ellipsoid, and neither costs a forward
  // draw. This is what returns the solid crown shadows of the 1049e4e
  // presentation under every tree, near and far. Mobile keeps trunk-only
  // shadows.
  // The proxy material is never compiled for color: proxies sit on the
  // shadow-only layer and only the cascade depth passes rasterize them.
  const canopyShadowProxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  /** The flat (non-indexed) positions of a geometry as a private copy; the shadow pass needs positions only. */
  function shadowPositionsOf(source: THREE.BufferGeometry): Float32Array {
    const flat = source.index ? source.toNonIndexed() : source;
    const array = (flat.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    return flat === source ? array.slice() : array;
  }
  // Round 79 (2026-09-28, the performance lane): the proxy carries the near tree's WHOLE shadow — the far-LOD lobe
  // hull and the near trunk in one position-only geometry — so a pool costs one shadow-only instanced draw per
  // cascade instead of two (the trunk mesh and the crown proxy held identical instance sets, the same LOD-fade
  // depth program and the same FrontSide-as-BackSide depth pass, and each grew its own three r8 cascade proxies:
  // on Monsoon Ridge 15.8 trunk draws and 15.8 crown draws per near cascade at the chase pose, and 7.5 + 7.5 in the
  // last). The trunk mesh itself no longer casts on the tiers that build proxies; the mobile tier keeps trunk-only
  // shadows from the trunk mesh as before. Same triangles, same depth values (a depth map is order-independent).
  function canopyShadowProxyGeometry(canopy: THREE.BufferGeometry, trunk: THREE.BufferGeometry | null = null): THREE.BufferGeometry {
    // A private copy: instance attributes must stay per pool.
    const geometry = new THREE.BufferGeometry();
    const crown = shadowPositionsOf(canopy);
    if (trunk) {
      const bark = shadowPositionsOf(trunk);
      const merged = new Float32Array(crown.length + bark.length);
      merged.set(crown, 0);
      merged.set(bark, crown.length);
      geometry.setAttribute('position', new THREE.BufferAttribute(merged, 3));
    } else {
      geometry.setAttribute('position', new THREE.BufferAttribute(crown, 3));
    }
    geometry.computeBoundingSphere();
    return geometry;
  }
  function makeCanopyShadowProxy(geometry: THREE.BufferGeometry, sp: Species, capacity: number, name: string): TreeMesh {
    const proxy = makeTreeMesh(geometry, canopyShadowProxyMat, sp, false, capacity);
    markShadowOnly(proxy);
    proxy.castShadow = true;
    proxy.receiveShadow = false;
    // trees round 2: a grown crown's hull lets the sun through its leaf gaps (crownShadowDapple.ts; it keeps the LOD
    // dissolve); a lobe proxy stays solid
    if (geometry.getAttribute(CROWN_DAPPLE_ATTRIBUTE)) applyCrownDappleDepth(proxy);
    else applyLodShadowFadeDepth(proxy);
    proxy.userData.treeCanopyShadowProxy = true;
    proxy.name = name;
    return proxy;
  }
  const canopyShadowProxies = !mobileTier;
  // Round 77: the near cards receive the cascades on the desktop tiers (one sample per leaf cluster, foliageWindHook);
  // the mobile tier keeps its unshadowed cards and pays no PCF on its foliage overdraw.
  const canopyShadowReceive = !mobileTier;
  // Round 79 (2026-09-28, the performance lane): the near tier's shadow casters share one caster profile for the
  // cascade router (engine/shadowCasterProfiles.ts): the farthest planar camera distance any near-slot tree stands
  // at this frame (scope promotion included) and the tallest near tree — update() refreshes both — so a cascade
  // whose sampled range starts beyond their shadows' reach skips them (the last cascade at most sun elevations:
  // its map spans the field, and the near owners drew all their instances into it every other frame).
  const nearTierShadowProfile: ShadowCasterProfile = { heightM: 0, reachM: 0 };
  const speciesHeightM = {} as Record<Species, number>;
  function geometryTopM(geometry: THREE.BufferGeometry): number {
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    return geometry.boundingBox ? geometry.boundingBox.max.y : 0;
  }
  /**
   * Trees round 5: the forest-grown form's variants (forestSpecies above). A wood's tree of such a species takes one of
   * the two forest-grown near variants (its drawn variant, the open third's by a position hash); a field tree, the open
   * one. Only the pool a tree draws in moves: its records were registered at its seat, and every tier keeps its own.
   */
  function assignTreeForms(): void {
    if (!forestSpecies.size) return;
    let forest = 0, open = 0;
    for (const t of trees) {
      if (!forestSpecies.has(t.species)) continue;
      if (t.wood) {
        if (t.variant >= FOREST_NEAR_VARIANTS) t.variant = treePositionNoise(t.x, t.z, 97) < 0.5 ? 0 : 1;
        forest++;
      } else {
        t.variant = FOREST_NEAR_VARIANTS;
        open++;
      }
    }
    group.userData.treeForms = { forest, open, species: [...forestSpecies] };
  }
  /**
   * A grown tree's shadow proxy: its crown shadow hull, position-only, its crown masses' tags (each its own pattern and
   * porosity; the wood never dapples), welded (its shadow passes run a fraction of the vertices).
   */
  function grownHullProxy(trunk: THREE.BufferGeometry): THREE.BufferGeometry {
    const hull = trunk.userData.shadowHull as Float32Array;
    let geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(hull.slice(), 3));
    const masses = trunk.userData.shadowHullMasses as readonly CrownShadowMass[] | undefined;
    if (masses) geometry.setAttribute(CROWN_DAPPLE_ATTRIBUTE, new THREE.BufferAttribute(crownDappleTags(hull.length / 3, masses), 1));
    geometry = weldGrownGeometry(geometry);
    geometry.computeBoundingSphere();
    return geometry;
  }
  /** Trees round 5 (`?forestAB=1`): an open-grown alternate sharing its pool geometry's per-instance attributes. */
  function formAlternate(alt: THREE.BufferGeometry, primary: THREE.BufferGeometry): THREE.BufferGeometry {
    for (const name of ['aFadeI', 'aLodF']) { const a = primary.getAttribute(name); if (a) alt.setAttribute(name, a); }
    retainedGeometries.push(alt);
    return alt;
  }
  function createTreeMeshPools(): void {
    // Species never changes during promotion, cross-fade, toppling or reset.
    // Each LOD can therefore hold at most this species' final population,
    // even while both near/far representations coexist. Count only after all
    // construction-time exclusions and authored relocations have completed.
    const speciesCounts = new Map<Species, number>();
    for (const tree of trees) {
      speciesCounts.set(tree.species, (speciesCounts.get(tree.species) ?? 0) + 1);
    }
    for (const sp of speciesList) {
      // An unused species still owns its existing meshes/materials. Retain
      // one inert color slot for the same vertex-color shader setup; count=0.
      // A completely empty population retains the original zero-byte pools.
      const capacity = Math.min(trees.length, Math.max(1, speciesCounts.get(sp) ?? 0));
      speciesHeightM[sp] = Math.max(
        ...treeGeo[sp].map((g) => Math.max(geometryTopM(g.trunk), geometryTopM(g.cards))),
        ...treeGeoFar[sp].map((g) => Math.max(geometryTopM(g.trunk), geometryTopM(g.canopy))));
      nearMeshes[sp] = treeGeo[sp].map((g, variant) => {
        const trunk = makeTreeMesh(g.trunk, barkMat, sp, false, capacity);
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
        trunk.userData.treeLod = 'near';
        const foliage = makeTreeMesh(g.cards, foliageMats[sp], sp, true, capacity);
        // Alpha-cut foliage and coarse opaque canopy stand-ins both produce
        // unstable results in moving cascades: cards sparkle while rounded
        // stand-ins project conspicuous black blotches across dirt roads.
        // Keep the stable trunk shadow and the bounded root contact decal;
        // the foliage's authored vertex shading supplies crown volume.
        foliage.castShadow = false;
        foliage.receiveShadow = canopyShadowReceive; // round 77: received once per cluster, never per fragment
        foliage.userData.treeLod = 'near';
        const pool: TreeMesh[] = [trunk, foliage];
        const open = treeGeoOpen[sp]?.[variant];
        if (open) { trunk.userData.formAlt = formAlternate(open.trunk, trunk.geometry); foliage.userData.formAlt = formAlternate(open.cards, foliage.geometry); }
        if (canopyShadowProxies) {
          // Round 79: the crown proxy carries the trunk's shadow too (canopyShadowProxyGeometry); the trunk mesh
          // stops casting so the pool submits one shadow draw per cascade, not two. p2 trees lane: a grown tree
          // casts its own hull — its stem, its thick limbs and its crown masses (treeGrowth.ts emitCrownShadowHull) —
          // so the shadow on the ground is the shape the crown above it has.
          trunk.castShadow = false;
          const proxyGeometry = g.trunk.userData.shadowHull ? grownHullProxy(g.trunk)
            : canopyShadowProxyGeometry(treeGeoFar[sp][variant % treeGeoFar[sp].length].canopy, g.trunk);
          const proxy = makeCanopyShadowProxy(proxyGeometry, sp, capacity, `treeCanopyShadow_${sp}_${variant}`);
          if (open?.trunk.userData.shadowHull) proxy.userData.formAlt = formAlternate(grownHullProxy(open.trunk), proxy.geometry);
          pool.push(proxy);
        }
        // the pool's one shadow caster (the proxy, or the trunk on the tiers without proxies) reports the near tier's reach
        setShadowCasterProfile(pool[pool.length - 1].castShadow ? pool[pool.length - 1] : trunk, nearTierShadowProfile);
        return pool;
      });
      // r7: far LOD is now a 2-variant array (silhouette variety at range)
      farMeshes[sp] = treeGeoFar[sp].map((g, fv) => {
        if (treeImpostors && (sp as string) !== 'snag') {
          // Round 77b: one quad pool per species and far variant on the impostor atlas (the second variant mirrored);
          // aImpRow (the tree's near variant, written with its slot) picks the species' row. No shadow either way:
          // the far tier casts nothing (the near proxies carry the crowns) and receives nothing, as the lobes did.
          const quad = makeTreeMesh(treeImpostors.quadGeometry(sp, fv === 1), treeImpostors.material, sp, false, capacity);
          const rowAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
          rowAttr.setUsage(THREE.DynamicDrawUsage);
          quad.geometry.setAttribute('aImpRow', rowAttr);
          quad.castShadow = false;
          quad.receiveShadow = false;
          quad.userData.treeLod = 'far';
          quad.userData.treeImpostor = true;
          quad.userData.aoExclude = true; // alpha-tested: the GTAO override prepass would composite the quads solid
          quad.name = `treeImpostor_${sp}_${fv}`;
          return [quad];
        }
        const farCanopy = makeTreeMesh(g.canopy, canopyFarMat, sp, false, capacity);
        farCanopy.receiveShadow = false; // CSM self-shadow at range = black crowns
        farCanopy.userData.treeLod = 'far';
        const farTrunk = makeTreeMesh(g.trunk, barkMat, sp, false, capacity);
        farTrunk.receiveShadow = false;
        farTrunk.userData.treeTrunk = true;
        farTrunk.userData.treeLod = 'far';
        const pair: TreeMesh[] = [farTrunk, farCanopy];
        if ((sp as string) === 'snag') for (const m of pair) m.userData.battleSnag = true; // p2 trees lane: outside the atlas
        // PERF (perf-budget r3): far-partition trees (beyond ~260 m) do NOT cast
        // shadows — a tree shadow out there is subpixel at 1080p (see lighting.ts
        // far-cascade rationale) yet every lobe/trunk was re-rasterized by the
        // CSM cascade passes; with the density boost this alone was millions of
        // tris/frame of invisible shadow work.
        for (const m of pair) m.castShadow = false;
        // 2026-09-12 owner review ("fuzzy shadows"): the ellipsoid stand-ins
        // that briefly shadowed this partition read as soft blobs under every
        // distant crown. As in 1049e4e the far partition casts nothing; the
        // near partition's canopy proxies carry the real crown silhouettes.
        return pair;
      });
    }
  }
  assignTreeForms();
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
    let originalOrdinal=0;
    for (const t of trees) {
      const ordinal=rootDecalOrdinals?.get(t)??originalOrdinal;
      while(originalOrdinal<ordinal){for(let k=0;k<=segs;k++)drng();originalOrdinal++;}
      originalOrdinal++;
      const r = treeRootDecalRadius(t.dr);
      if (r <= 0) {
        // Preserve every later dry decal's angle/radius stream when an
        // existing tree is transferred to the map-owned tidal band.
        for (let k = 0; k <= segs; k++) drng();
        continue;
      }
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
    dmesh.userData.decalCount = vb / (1 + segs);
    dmesh.userData.projectedAreaM2 = projectedAreaM2;
    dmesh.userData.maxRadiusM = maxRadiusM;
    group.add(dmesh);
  }
  createTreeRootDecals();
  rootDecalOrdinals=null;

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
  /**
   * Trees round 2: a map's own shrub form (treeBiomes.ts `shrub`: Las Cañadas' broom) — its spray atlas on a foliage
   * material of its own, set up exactly as a grown species' (the hooks, the defines, the leaf detail, the cascades),
   * with its alpha-tested shadow material; null without one (the shrubs take the bush slot's material).
   */
  function shrubMaterials(form: GrowthSpecies | null, pal: VegetationPalette): [THREE.MeshStandardMaterial, THREE.MeshDepthMaterial] | null {
    if (!form) return null;
    // trees round 5: a shrub atlas (its stems on the last tile; treeSprayAtlas.ts makeSprayAtlas `shrub`)
    const map = makeSprayAtlas(grownFormSprayKind(form, pal), mulberry32(seed + 77), texSize(SHRUB_ATLAS_PX), pal.texTone || null, 0, true);
    const material = new THREE.MeshStandardMaterial({
      map, alphaTest: 0.38, alphaToCoverage: true, side: THREE.DoubleSide, vertexColors: true, roughness: 1.0, metalness: 0.0,
    });
    const tile = leafDetail.texture(leafDetail.classOf('oak', pal));
    if (tile) { material.normalMap = tile; material.normalScale.set(LEAF_DETAIL_NORMAL_SCALE, LEAF_DETAIL_NORMAL_SCALE); }
    material.defines = { ...(material.defines ?? {}), COT_CARD_EDGE_FADE: '', COT_GROWN_CROWN: GROWN_CROWN_TRANSMISSION.toFixed(2),
      COT_LEAF_BILLBOARD: GROWN_LEAF_BILLBOARD.toFixed(2) };
    engineCtx.setupShadowMaterial(material, shrubFoliageHook);
    material.userData.cotShrubThin = uShrubThin; // the frame probe's same-page A/B (its shrub-thin toggle)
    material.customProgramCacheKey = () => 'world-tree-foliage-v25';
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.38 });
    retainedMaterials.push(material, depth);
    retainedTextures.push(map);
    return [material, depth];
  }
  function createBushes(): void {
    // trees round 2: the desktop shrubs take the place's foliage colour where the map palette names none (the phones
    // keep the palette as it is)
    // trees round 4: a place's own shrub colour (treeBiomes.ts shrubColour) wins over the bush slot's palette, as a form's
    // own colour does over its slot's (the Las Cañadas broom ash-dulled, where the slot's acacia palette read green)
    const shrubColour = grownTrees ? treeBiomeShrubColour(cfg?.id) : null;
    // p2 trees lane: the desktop shrubs grow from the bush species' sprays (buildGrownShrub); the phones keep the cards
    // the shrub grows from the sprays its material paints: the Mangrove map's willow form is the mangrove
    // trees round 2: the shrubs grow as the map's shrub form (their own material: shrubMaterials) or the bush slot's form
    const shrubForm = grownTrees ? veg.shrubForm ?? treeBiomeShrub(cfg?.id) : null;
    const shrubGrowth: GrowthSpecies = bushSpecies === 'willow' && veg.willowForm === 'tidalMangrove' ? 'mangrove'
      : shrubForm ?? (grownTrees ? formOf(bushSpecies)?.form : null) ?? bushSpecies;
    // (trees lane, 2026-10-05: on a bare map a deciduous shrub stands bare, its winter twigs or canes)
    // (trees lane, 2026-10-08, the gauntlet's wave 260 on Hostomel's handcart: the near bush "flat olive-brown leaf cards
    // with dark outlines, a heap of paper cut-outs"): a shrub grown as its bush slot's own leafy form takes that form's
    // leaves as the slot's trees do (grownDefinition: treeBiomePalette's leafy form) — the birch slot's leafy birch on
    // Hostomel and the reservoir drew its leaf sprays in the bare winter birch's twig brown (grownTintLaw's birch without
    // leaves); a map's own shrub form keeps its own palette, and the place's shrub colour still wins
    const bushSlotLeaves = grownTrees && !shrubForm && formOf(bushSpecies)?.leaves === true;
    const bushFormTerms = bushSlotLeaves || shrubColour
      ? { ...(bushSlotLeaves ? { leaves: true } : {}), ...(shrubColour ? { colour: shrubColour } : {}) } : null;
    const bushPal = grownTrees
      ? bareFormPalette(treeBiomePalette(palOf(bushSpecies), bushFormTerms, false, treeBiomeColour(cfg?.id)),
        shrubGrowth, bareMap)
      : palOf(bushSpecies);
    const shrubMats = shrubMaterials(shrubForm, bushPal);
    // trees round 4: a shrub grown from its slot's sprays shares that slot's crowns' texture and program but not their
    // near reach (FOLIAGE_NEAR_REACH): its own material over the one program, with the shrub hook's uniform — made when
    // the first shrub is planted (a world without shrubs registers none)
    let bushMatCache: THREE.MeshStandardMaterial | null = null;
    // trees round 5 (the gauntlet's wave 98: the near bush's "lobed leaf cards two to four times life size with no
    // twigs"): a shrub grown from its slot's sprays paints its own atlas — the slot's sprays at a shrub's leaf size on
    // woody twigs, its stems on the last tile (treeSprayAtlas.ts makeSprayAtlas `shrub`), at twice the crowns' texels (a
    // field bush's cards run 1-2.4 m against a crown's 0.55-1.1) — under the crowns' program, with its own shadow
    // caster. A crown without the facing clusters (none on the desktop grown builds) keeps its own.
    const slotCrown = foliageMats[bushSpecies];
    const slotShrubAtlas = !shrubMats && grownTrees && sprayAtlasSpecies.has(bushSpecies)
      && !!slotCrown?.defines && 'COT_LEAF_BILLBOARD' in slotCrown.defines;
    const shrubOnAtlas = !!shrubMats || slotShrubAtlas;
    let shrubDepthCache: THREE.MeshDepthMaterial | null = null;
    const bushMaterial = (): THREE.MeshStandardMaterial => {
      if (bushMatCache) return bushMatCache;
      const crown = foliageMats[bushSpecies];
      if (shrubMats) bushMatCache = shrubMats[0];
      else if (!crown.defines || !('COT_LEAF_BILLBOARD' in crown.defines)) bushMatCache = crown;
      else {
        // (three's MeshStandardMaterial.copy resets the defines to STANDARD alone: the crown's must come across, or the
        // clone compiles another program without the facing clusters and dissolves by the pixel dither)
        const shrub = crown.clone();
        shrub.defines = { ...(crown.defines ?? {}) };
        if (slotShrubAtlas) {
          const snow = bushPal.snow ?? 0;
          shrub.map = makeSprayAtlas(grownFormSprayKind(shrubGrowth, bushPal), mulberry32(seed + 79), texSize(SHRUB_ATLAS_PX),
            snow > 0.05 ? null : bushPal.texTone || null, snow, true);
          shrubDepthCache = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: shrub.map, alphaTest: 0.38 });
          retainedMaterials.push(shrubDepthCache);
          retainedTextures.push(shrub.map);
        }
        engineCtx.setupShadowMaterial(shrub, shrubFoliageHook);
        shrub.userData.cotShrubThin = uShrubThin;
        shrub.customProgramCacheKey = () => 'world-tree-foliage-v25';
        retainedMaterials.push(shrub);
        bushMatCache = shrub;
      }
      return bushMatCache;
    };
    const bushGeos = sprayAtlasSpecies.has(bushSpecies)
      ? [buildGrownShrub('bush', mulberry32(seed + 31), bushPal, shrubGrowth, shrubOnAtlas),
        buildGrownShrub('bush', mulberry32(seed + 32), bushPal, shrubGrowth, shrubOnAtlas)]
      : [buildBushCards(mulberry32(seed + 31), bushPal), buildBushCards(mulberry32(seed + 32), bushPal)];
    const bushPlacements: [THREE.Matrix4[], THREE.Matrix4[]] = [[], []];
    const bushKeep: [boolean[],boolean[]]=[[],[]];
    function addBush(x: number, z: number, hedge = false, br: RandomSource = rng): void {
      if (Math.max(Math.abs(x), Math.abs(z)) > 470) return;
      if (inAvoid(x, z)) return;
      if (br() > veg.bushCount) return; // per-map density scale
      // (the Redrock lane: no shrub on a dome's cap or a jebel's top either; veg.treeCeilingY, absent on every other map)
      if (overTreeCeiling(x, z)) return;
      if (admission()._roadDist(x, z) < 6) return;
      if (admission().getGroundType(x, z) === 'soft' || (noVeg(x, z) && !batterAdmits(x, z))) return;
      if (!steepSeedOk(admission().getNormalAt(x, z).y, x, z)) return;
      let clump = 1;
      if (veg.bushCount < 1) {
        // r6 two-scale clustering (matches makeTuft): biome moisture belts x
        // thicket cores — shrubs knot into dense washes/hollow thickets with
        // clean ground between, instead of the r5 near-uniform pepper noise
        const sb = sampleSplatNoise(x, z, _splatScratch);
        const biome = smoothstepJs(0.42, 0.70, sb.n2);
        const thicket = smoothstepJs(0.44, 0.78, sb.n1);
        clump = biome * (0.12 + 0.88 * thicket);
        if (br() > clump * 0.95 + 0.05) return;
      }
      // ground lane (2026-10-03): a field bush on a map with a field system grows in the nearest boundary's margin
      // (hedgeSite, as the lone trees) — decided where its candidate was drawn, so every seeded draw is unchanged
      if (hedge) {
        const site = hedgeSite(x, z, 67);
        if (site[2] !== 0 || site[3] !== 0) { x = site[0]; z = site[1]; }
        else if (treePositionNoise(x, z, 71) < 0.6) {
          // ground lane: without a boundary to grow on, a field bush grows at the foot of the nearest tree within
          // 35 m (2–5 m out from its trunk, on its own side) — scrub knots round the lone trees and the stands' edges
          // instead of peppering the open ground evenly; position-hashed, so every seeded draw is unchanged. The trees
          // as they stood before the tidal map moved its willows into the water (knotSites): both of that map's
          // builds deal the same bushes (tidalMangrove.selftest).
          let best = -1, bestD = 35;
          for (let i = 0; i < knotSites.length; i += 2) {
            const d = Math.hypot(x - knotSites[i], z - knotSites[i + 1]);
            if (d < bestD) { bestD = d; best = i; }
          }
          if (best >= 0) {
            const tx = knotSites[best], tz = knotSites[best + 1], dl = Math.hypot(x - tx, z - tz) || 1;
            const out = 2 + 3 * treePositionNoise(x, z, 73);
            const bx = tx + (x - tx) / dl * out, bz = tz + (z - tz) / dl * out;
            if (admission()._roadDist(bx, bz) >= 6 && admission().getGroundType(bx, bz) !== 'soft' && !noVeg(bx, bz)
              && steepSeedOk(admission().getNormalAt(bx, bz).y, bx, bz) && Math.max(Math.abs(bx), Math.abs(bz)) <= 470
              && !inAvoid(bx, bz)) {
              x = bx; z = bz;
            }
          }
        }
      }
      const y = heightField.getHeightAt(x, z);
      // hull-height concealers: foliage reaches ~2.5-3 m so a parked tank is
      // genuinely occluded (knee-high shrubs sold zero visual concealment)
      // r5: size keyed to the clump core — 2-3x spread, big growth at centers
      const sc = (1.6 + br() * 1.6) * (0.7 + clump * 0.45);
      _q.setFromAxisAngle(_up, br() * Math.PI * 2);
      // ground lane (2026-10-03, the gauntlet: bushes were "near-identical round green balls"): each shrub its own shape —
      // an oval footprint (the across axis 72–100 % of the cover axis, so it never leaves its cover disc), a crown a
      // little lower or taller, and a lean of up to 6° about its own long axis; position-hashed, no seeded draw
      const hz = treePositionNoise(x, z, 41), hy = treePositionNoise(x, z, 43), ht = treePositionNoise(x, z, 47);
      _qLean.setFromAxisAngle(_axLean.set(1, 0, 0), (ht - 0.5) * 0.21);
      _q.multiply(_qLean);
      _m4.compose(_pv.set(x, y - 0.05, z), _q, _sv.set(sc, sc * (1.05 + br() * 0.35) * (0.80 + 0.30 * hy), sc * (0.72 + 0.28 * hz)));
      const variant=(br()*2)|0,keep=!newlyUnsafeRoadSite(x,z,6,.78);
      // a placed structure's clear ground takes no bush either: dropped after its draws, so every later bush stays
      if (placedClearances.length && overlapsStructureClearance(placedClearances, x, z, 2.5 * sc + 0.3)) return;
      bushPlacements[variant].push(_m4.clone());bushKeep[variant].push(keep);
      if(keep)concealers.push({ x, z, r: 2.0 * sc, add: 0.35 }); // SPOTTING WIRING: bush cover
    }
    // 2026-09-14 environment richness: desktop tiers seed 30 % more field bushes, clumps and
    // cluster fringe scrub than the authored counts (mobile keeps them). Read at build time,
    // after the device tier is resolved. Per-map veg.bushCount still gates what survives.
    // (every tier since 2026-10-08: a bush is a concealer, a record the phones must stand where the desktop's does)
    const bushRichness = 1.3;
    function placeBushFringes(): void {
      // fringe bushes around each tree cluster. r3 terrain_environment: maps
      // can raise veg.clusterScrub (desert oases) — extra shrubs land INSIDE
      // the cluster as understory at the trunk bases, grounding the palm
      // clusters that used to stand as bare sticks on clean sand.
      const scrubMul = (veg.clusterScrub ?? 1) * bushRichness;
      for (let ci = 0; ci < clusters.length; ci++) {
        const c = clusters[ci];
        const fr = keyedPlacement ? keyedStream(8, clusterKeys[ci]) : rng;
        const n = Math.round((5 + (fr() * 6) | 0) * scrubMul);
        for (let i = 0; i < n; i++) {
          const br = keyedPlacement ? keyedStream(9, clusterKeys[ci] * 256 + i) : rng;
          const a = br() * Math.PI * 2;
          const inside = scrubMul > 1 && br() < 0.55;
          // trees round 2: round the woodlot's own outline (standPoint)
          const p = standPoint(ci, c, a, inside ? 0.25 + br() * 0.6 : 1.05 + br() * 0.5);
          addBush(p[0], p[1], false, br);
        }
      }
    }
    function placeFieldBushes(): void {
      for (let i = 0, cap = Math.round(470 * bushRichness); i < cap; i++) { // scattered field bushes, mild roadside bias
        const br = keyedPlacement ? keyedStream(10, i) : rng;
        const x = (br() * 2 - 1) * 455, z = (br() * 2 - 1) * 455;
        const rd = admission()._roadDist(x, z);
        if (rd > 26 && br() > 0.55) continue;
        addBush(x, z, true, br);
      }
    }
    function placeBushClumps(): void {
      // midfield concealment clumps: 4-6 bushes over a ~10-12 m spread so a
      // parked tank is at least half-occluded from ground level
      for (let c = 0, cap = Math.round(58 * bushRichness); c < cap; c++) {
        const cr = keyedPlacement ? keyedStream(11, c) : rng;
        const x = (cr() * 2 - 1) * 420, z = (cr() * 2 - 1) * 420;
        const n = 4 + (cr() * 3) | 0;
        for (let i = 0; i < n; i++) {
          const br = keyedPlacement ? keyedStream(12, c * 16 + i) : rng;
          addBush(x + (br() - 0.5) * 11, z + (br() - 0.5) * 11, false, br);
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
        const m = new THREE.InstancedMesh(bushGeos[bv], bushMaterial(), bushPlacements[bv].length);
        let kept=0;
        for (let i = 0; i < bushPlacements[bv].length; i++) {
          // darker, near-neutral multipliers: the old 0.8-1.1 range let lit
          // bushes glow saturated pure green against the graded terrain and
          // read as pasted-in — sit them INTO the field tone instead
          const bj = 0.52 + rng() * 0.34;
          _c.setRGB(bj * (0.94 + rng() * 0.14), bj * (0.98 + rng() * 0.14), bj * (0.90 + rng() * 0.16));
          if(!bushKeep[bv][i])continue;
          const placement=bushPlacements[bv][i],e=placement.elements;
          // ground lane: one shrub of a thicket is greyer, the next yellower or bluer (a position hash, no seeded draw)
          {
            const hh = treePositionNoise(e[12], e[14], 53), ha = treePositionNoise(e[12], e[14], 59);
            const amt = 0.10 + 0.22 * ha;
            if (hh < 0.34) _c.multiply(_bushCast.setRGB(1 + 0.12 * amt * 4, 1 + 0.02 * amt * 4, 1 - 0.20 * amt * 4).multiplyScalar(1 / (1 + amt * 0.4)));
            else if (hh < 0.67) _c.multiply(_bushCast.setRGB(1 - 0.06 * amt * 4, 1 + 0.01 * amt * 4, 1 + 0.10 * amt * 4));
            else { const g = (_c.r + _c.g + _c.b) / 3; _c.lerp(_bushCast.setRGB(g, g, g), amt * 1.6); }
          }
          m.setMatrixAt(kept,placement);m.setColorAt(kept,_c);
          bushFadeReg.push({attr:bAttr,slot:kept,x:e[12],z:e[14],fade:0});
          kept++;
        }
        m.count=kept;
        m.castShadow = true;
        setShadowCasterCascades(m, BUSH_SHADOW_CASCADES); // round 78: the near cascades only
        // round 77: the cascades on the shrubs too — sampled once per shrub 0.9 m over its base and 1.6 × its scale
        // toward the sun (foliageWindHook), so a bush under a crown sits in the crown's shadow, one state per shrub
        m.receiveShadow = canopyShadowReceive;
        m.matrixAutoUpdate = false;
        m.customDepthMaterial = shrubMats?.[1] ?? shrubDepthCache ?? foliageDepthMats[bushSpecies];
        m.userData.aoExclude = true; // GTAO override prepass ignores alphaTest
        m.userData.bush = true;
        m.computeBoundingSphere();
        group.add(m);
      }
    }
    // Round 77 (2026-09-26): the understorey at the forest edges — young growth stepping every stand down into the
    // field (the edge feathering the evidence lacked: no hard line of identical trees). Its own RNG stream, so the
    // placement streams stay byte-identical; no cover disc and no trunk record — pure dressing that conceals nothing
    // and stops nothing; the bush admission (roads, soft ground, water, slopes, spawns, the village); a density that
    // falls from the stand's edge (0.82 R) to nothing at 1.6 R. Desktop tiers only; the phones keep their bush budget.
    const understoreyRng = mulberry32((seed ^ 0x77e5) >>> 0);
    const understoreyPlacements: THREE.Matrix4[] = [];
    const understoreyTints: THREE.Color[] = [];
    function placeUnderstorey(): void {
      if (mobileTier) return;
      // trees round 4 (2026-10-04, the coordinator's law for every shrub a player can drive up to): the understorey
      // conceals nothing, so a shrub inside the playable square tall enough to screen a hull (UNDERSTOREY_SCREEN_M) stands
      // in the wood's own cover — within a metre of a tree's concealment disc (a field bush's own 0.35 disc does not
      // count) — and a player who sees it between himself and an enemy is in cover there, never behind a hide that
      // hides nothing. Out of that cover such a shrub keeps its place but not its height: its form is scaled down whole
      // to young growth of 0.6–1.2 m (UNDERSTOREY_CAP_M), so the law takes the tall ones and leaves the layer as thick
      // as it was. Looked up through a 16 m grid of the discs; every check falls after its shrub's draws and the capped
      // heights come from a hash of the shrub's place, so every stream keeps its draws. The low growth feathering out of
      // a stand stays as it was; past the square the rim keeps its own
      const COVER_CELL_M = 16, coverGrid = new Map<number, ConcealmentDisc[]>();
      const cellKey = (i: number, j: number): number => (i + 4096) * 8192 + (j + 4096);
      for (const disc of concealers) {
        if (disc.add > MANTLE_TREE_COVER_MAX) continue;
        const i0 = Math.floor((disc.x - disc.r - 1) / COVER_CELL_M), i1 = Math.floor((disc.x + disc.r + 1) / COVER_CELL_M);
        const j0 = Math.floor((disc.z - disc.r - 1) / COVER_CELL_M), j1 = Math.floor((disc.z + disc.r + 1) / COVER_CELL_M);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          const k = cellKey(i, j), list = coverGrid.get(k);
          if (list) list.push(disc); else coverGrid.set(k, [disc]);
        }
      }
      const inWoodCover = (x: number, z: number): boolean => {
        const list = coverGrid.get(cellKey(Math.floor(x / COVER_CELL_M), Math.floor(z / COVER_CELL_M)));
        return !!list && list.some((disc) => Math.hypot(x - disc.x, z - disc.z) <= disc.r + 1);
      };
      /** A shrub in the playable square that screens a hull and stands out of the wood's cover. */
      const screensInTheOpen = (x: number, z: number, sc: number, hy: number): boolean =>
        Math.max(Math.abs(x), Math.abs(z)) <= PLAYABLE_HALF_EXTENT_M && sc * hy > UNDERSTOREY_SCREEN_M && !inWoodCover(x, z);
      /**
       * The scale that brings such a shrub, at its own proportions, down to a young growth's height jittered by a hash of
       * its place: no stream, so every production stream keeps its draws and its count (tidalMangrove pins them).
       */
      const cappedScale = (x: number, z: number, hy: number): number =>
        (UNDERSTOREY_CAP_M[0] + canopyJitterNoise(canopyCornerKey(x, 0, z, seed ^ 0x6b2d)) * (UNDERSTOREY_CAP_M[1] - UNDERSTOREY_CAP_M[0])) / hy;
      // The stand law (round 77), shared by the interior stands and — round 77b — the rim-forest blocks: the same
      // draws in the same order for the stands (their placements stay byte-identical), then the blocks from the
      // stream's continuation, with the rim trees' own scale (1.35–2.2 × the interior stands' 0.95–1.7) and the
      // rim's own bound (the blocks stand at 442–506 m, past the field bushes' 470).
      const plant = (stand: VegetationDisc, scaleMul: number, bound: number, index = -1): void => {
        const n = Math.round((7 + understoreyRng() * 9) * bushRichness);
        for (let i = 0; i < n; i++) {
          const a = understoreyRng() * Math.PI * 2;
          const rr = 0.82 + understoreyRng() * 0.78;
          const sc = (0.85 + understoreyRng() * 0.75) * scaleMul, yaw = understoreyRng() * Math.PI * 2, hy = 0.9 + understoreyRng() * 0.4;
          const tj = understoreyRng(), tr = understoreyRng(), tg = understoreyRng(), tb = understoreyRng();
          const keepRoll = understoreyRng();
          if (keepRoll > (1 - smoothstepJs(1.05, 1.6, rr)) * 0.9 + 0.1) continue;
          // trees round 2: a woodlot's understorey follows its own outline (standPoint; a rim block's is its circle)
          const at = standPoint(index, stand, a, rr), x = at[0], z = at[1];
          if (!admitted(x, z, sc, bound)) continue;
          seat(x, z, screensInTheOpen(x, z, sc, hy) ? cappedScale(x, z, hy) : sc, hy, yaw, tj, tr, tg, tb);
        }
      };
      /** The bush admission (roads, soft ground, water, slopes, spawns, the village, structures) inside the bound. */
      const admitted = (x: number, z: number, sc: number, bound: number): boolean => {
        if (Math.max(Math.abs(x), Math.abs(z)) > bound || inAvoid(x, z)) return false;
        // the map-borders lane: past the playable edge a block's undergrowth keeps to the border's woods
        if (borderWoodsAt && Math.max(Math.abs(x), Math.abs(z)) > PLAYABLE_HALF_EXTENT_M && borderWoodsAt(x, z) < 0.5) return false;
        if (heightField._roadDist(x, z) < 6 || admission()._roadDist(x, z) < 6) return false;
        if (admission().getGroundType(x, z) === 'soft' || noVeg(x, z)) return false;
        if (admission().getNormalAt(x, z).y < 0.78 || heightField.getNormalAt(x, z).y < 0.78) return false;
        if (!isClearOfSpawns(x, z, spawnClearings, 20)) return false;
        if (x > v.x0 - 12 && x < v.x1 + 12 && z > v.z0 - 12 && z < v.z1 + 12) return false;
        return !overlapsStructureClearance(structureClearances, x, z, 1.4 * sc);
      };
      const seat = (x: number, z: number, sc: number, hy: number, yaw: number, tj: number, tr: number, tg: number, tb: number): void => {
        const y = heightField.getHeightAt(x, z);
        _q.setFromAxisAngle(_up, yaw);
        _m4.compose(_pv.set(x, y - 0.04, z), _q, _sv.set(sc, sc * hy, sc));
        understoreyPlacements.push(_m4.clone());
        const bj = 0.55 + tj * 0.32;
        understoreyTints.push(new THREE.Color(bj * (0.96 + tr * 0.14), bj * (1.0 + tg * 0.14), bj * (0.86 + tb * 0.14)));
      };
      clusters.forEach((c, index) => plant(c, 1, 470, index));
      for (const b of rimBlocks) plant(b, RIM_UNDERSTOREY_SCALE, RIM_UNDERSTOREY_BOUND_M);
      // trees round 4 (2026-10-04, the gauntlet's wave 46 on Frontier's wood edge: "one tree model cloned at the same
      // height, form and spacing in a straight row, with no shrub mantle"): a closed wood's edge wears a mantle — taller
      // young growth (1.5 to 2.7 m), a few metres apart along its outline, gaps left — on its own stream (every other
      // placement keeps its draws). Dressing like the understorey: it conceals and stops nothing (the wood's own
      // discs conceal); an open grove's place (treeBiomeOpen) keeps its open ground
      if (!treeBiomeOpen(cfg?.id)) {
        const mantleRng = mulberry32((seed ^ 0x3a17) >>> 0);
        clusters.forEach((stand, index) => {
          const n = Math.round((stand.r * Math.PI * 2) / UNDERSTOREY_MANTLE_SPACING_M);
          for (let i = 0; i < n; i++) {
            const a = ((i + mantleRng() * 0.8) / n) * Math.PI * 2, rr = 0.9 + mantleRng() * 0.2;
            const sc = 1.5 + mantleRng() * 1.2, yaw = mantleRng() * Math.PI * 2, hy = 0.95 + mantleRng() * 0.35;
            const tj = mantleRng(), tr = mantleRng(), tg = mantleRng(), tb = mantleRng();
            if (mantleRng() < 0.25) continue; // the mantle's gaps
            const at = standPoint(index, stand, a, rr), x = at[0], z = at[1];
            if (!admitted(x, z, sc, 470)) continue;
            // every mantle shrub screens a hull: out of the wood's cover it keeps its place as capped young growth (the
            // count then never reads the trees' cover, so a wood's other form leaves every pool as it was)
            seat(x, z, screensInTheOpen(x, z, sc, hy) ? cappedScale(x, z, hy) : sc, hy, yaw, tj, tr, tg, tb);
          }
        });
      }
    }
    function createUnderstoreyMesh(): void {
      const n = understoreyPlacements.length;
      if (n === 0) return;
      const geometry = sprayAtlasSpecies.has(bushSpecies) ? buildGrownShrub('understorey', mulberry32(seed + 33), bushPal, shrubGrowth, shrubOnAtlas)
        : buildUnderstoreyCards(mulberry32(seed + 33), bushPal);
      geometry.userData.understorey = true;
      geometry.setAttribute('aFadeI', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      geometry.setAttribute('aLodF', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      const fadeAttr = attribute(geometry, 'aFadeI');
      const m = new THREE.InstancedMesh(geometry, bushMaterial(), n);
      for (let i = 0; i < n; i++) {
        const e = understoreyPlacements[i].elements;
        m.setMatrixAt(i, understoreyPlacements[i]);
        m.setColorAt(i, understoreyTints[i]);
        bushFadeReg.push({ attr: fadeAttr, slot: i, x: e[12], z: e[14], fade: 0 });
      }
      m.castShadow = true;
      setShadowCasterCascades(m, UNDERSTOREY_SHADOW_CASCADES); // round 78: the two nearest cascades only
      m.receiveShadow = canopyShadowReceive;
      m.matrixAutoUpdate = false;
      m.customDepthMaterial = shrubMats?.[1] ?? shrubDepthCache ?? foliageDepthMats[bushSpecies];
      m.userData.aoExclude = true;
      m.userData.understorey = true;
      m.name = 'understorey';
      m.computeBoundingSphere();
      group.add(m);
    }
    // (the Redrock lane, veg.coverHalvesAbout: the halves' shrubs evened at the last, as the trees are — field shrubs of
    // their own keyed draws in the short half until the halves stand within a shrub)
    function evenBushHalves(): void {
      if (!halvesAbout) return;
      for (let i = 0; i < 2400; i++) {
        _coverHalves[0] = 0; _coverHalves[1] = 0;
        for (const list of bushPlacements) for (const m of list) _coverHalves[coverHalf(m.elements[12], m.elements[14])]++;
        if (Math.abs(_coverHalves[0] - _coverHalves[1]) <= 1) return;
        const br = keyedStream(14, i);
        const seat = seatInHalf((br() * 2 - 1) * 455, (br() * 2 - 1) * 455, _coverHalves[0] < _coverHalves[1] ? 0 : 1);
        addBush(seat[0], seat[1], true, br);
      }
    }
    placeBushFringes();
    placeFieldBushes();
    placeBushClumps();
    evenBushHalves();
    createBushMeshes();
    placeUnderstorey();
    createUnderstoreyMesh();
  }
  createBushes();
  placementAdmission=null;

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
    const ir = m.geometry.getAttribute('aImpRow') as THREE.BufferAttribute | undefined; // round 77b: the impostor row
    if (ir) { ir.addUpdateRange(slot, 1); ir.needsUpdate = true; }
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
      const ir = m.geometry.getAttribute('aImpRow') as THREE.BufferAttribute | undefined; // round 77b
      if (ir) ir.array[slot] = t.variant;
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
      const d = Math.hypot(t.x - camPos.x, t.z - camPos.z), reach = t.nearScale ?? 1;
      const promo = scopePromoted(t, camPos); // scope corridor mesh promotion
      if (t.near) {
        if (d > treeNearOut * reach && !promo) {
          t.near = false;
          t.lodT = true;
          t.lodF = 0; // near side starts solid, dissolves out
          addToGroup(farMeshes[t.species][t.fv], farSlots[t.species][t.fv], t, 'fslot', false);
          lodTransitions.push({ t, dir: 1 });
        }
      } else if (d < treeNearIn * reach || promo) {
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
    const distance = Math.hypot(tree.x - camPos.x, tree.z - camPos.z), reach = tree.nearScale ?? 1;
    tree.near = distance < treeNearIn * reach || (tree.near && distance <= treeNearOut * reach)
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
      const row = mesh.geometry.getAttribute('aImpRow') as THREE.BufferAttribute | undefined; // round 77b
      if (row) row.array[tree.fslot] = tree.variant;
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
      const row = mesh.geometry.getAttribute('aImpRow') as THREE.BufferAttribute | undefined; // round 77b
      if (row) {
        row.clearUpdateRanges();
        row.needsUpdate = true;
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
  // `settled` (multiplayer world state, 2026-10-01): a trunk the authority had already felled before this viewer saw it
  // (a late joiner, a reconnect, the persistent destroyed list) starts at the end of its fall — the next update writes
  // the final pose once and retires the animation — so nothing falls at the wrong time and nothing sounds.
  function crushTree(ob: TreeObstacle, dx: number, dz: number, settled = false): boolean {
    const t = trees[ob.treeIdx];
    if (!t || t.crushed) return false;
    if (!t.uprightMat) t.uprightMat = t.mat.clone();
    t.crushed = true;
    ob.crushed = true;
    ob.dead = true;
    setToppleAxis(_tcax, dx, dz);
    treeCrushAnims.push({
      t, base: t.mat.clone(), x: t.x, y: ob.min[1], z: t.z,
      ax: _tcax.x, az: _tcax.z, u: settled ? 1.1 : 0,
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
  let grassAheadDistance = grassFadeEnd + 32;

  function selectGrassBuild(camPos: THREE.Vector3): void {
    grassSelection.urgent = null;
    grassSelection.ahead = null;
    grassSelection.aheadDistance = Infinity;
    const movedFromSpawn = Math.hypot(camPos.x - spawn.x, camPos.z - spawn.z);
    const grassAhead = grassFadeEnd + (movedFromSpawn > 28 ? CHUNK_SIZE * 0.5 : 32);
    grassAheadDistance = grassAhead;
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
    if (!deferFarGrass || disposed) return;
    // A single job owns both staging buffers until it finishes. Urgency
    // selects the next job; it must never drain/reset the existing owner or
    // turn two complete chunks into one unbounded visible-frame task.
    if (!grassBuildJob) {
      const next = grassSelection.urgent ?? grassSelection.ahead;
      if (next) beginGrassChunk(next);
    }
    if (grassBuildJob) advanceGrassChunk(grassBuildJob);
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
    if (_lastCam.distanceToSquared(camPos) > 36 || scopeRepartitionPending) {
      scopeRepartitionPending = false;
      _lastCam.copy(camPos);
      repartitionTrees(camPos);
      return;
    }
    // Stagger a tree repartition against carpet construction/publication, but
    // keep advancing a stationary camera's unfinished first carpet. Changing
    // cells coalesces to the newest target without discarding completed cells.
    if (!carpetWork.complete) rebuildCarpet(camPos);
  }

  function update(
    dt: number,
    camPos: THREE.Vector3,
    camFwd: THREE.Vector3 | null = null,
    focusPos: THREE.Vector3 | null = null,
  ): void {
    if (disposed) return;
    // Round 77b: the impostor atlas bakes here, before this frame's render and outside any render pass (the first
    // frame, and again after a GPU suspension disposed it); a no-op once baked and without a renderer.
    treeImpostors?.ensureBaked();
    uWindTime.value += dt;
    uLeafTransmission.value = (engineCtx.scene?.userData.lightModel as { mode?: string } | undefined)?.mode === 'physical'
      ? LEAF_TRANSMISSION : 0;
    if (treeCrushAnims.length) updateTreeCrush(dt); // gameplay_feel r6 topples
    uCamPos.value.copy(camPos);
    if (camFwd) uCamFwd.value.copy(camFwd);
    updateNearTierShadowReach(camPos);
    uSniperFade.value += (sniperFadeTarget - uSniperFade.value) *
      (1 - Math.exp(-(dt || 0) / 0.08));
    // Do not spend the opening/countdown frames filling an invisible outer
    // ring while the tank is parked. Once the camera has travelled roughly
    // two hull lengths, stream half a chunk ahead of the fade band. A grass
    // job is limited to 250 small steps or a 1.5 ms cooperative deadline.
    // Instance writes, bounds and publication share candidate evaluation's budget.
    // No wall-clock completion promise applies on a loaded device.
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

  /** Round 79: the near tier's shadow reach this frame — the farthest near-slot tree (planar) and the tallest one. */
  function updateNearTierShadowReach(camPos: THREE.Vector3): void {
    let reach2 = 0, height = 0;
    for (const sp of speciesList) {
      const speciesHeight = speciesHeightM[sp] ?? 0;
      for (const slots of nearSlots[sp]) {
        for (const t of slots) {
          const dx = t.x - camPos.x, dz = t.z - camPos.z;
          const d2 = dx * dx + dz * dz;
          if (d2 > reach2) reach2 = d2;
          const e = t.mat.elements;
          const h = speciesHeight * Math.hypot(e[4], e[5], e[6]);
          if (h > height) height = h;
        }
      }
    }
    nearTierShadowProfile.reachM = Math.sqrt(reach2);
    nearTierShadowProfile.heightM = height;
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
  // Ground lane (2026-10-03, the gauntlet: trees "scattered evenly instead of growing in clumps, groves and forest
  // masses"; round 77's open item "no floor darkening — terrain has no canopy channel"): the canopy's cover over the
  // square, rasterised once from the final tree records (every placement, exclusion and relocation pass is done; the
  // snag conversion is a look only) — each crown a soft disc of its own radius, the crowns' union then spread over
  // 12 m and thresholded, so a stand whose canopy closes reads 1 and a lone tree or an open row of them next to
  // nothing (a pasture runs to a lone oak's trunk; a wood's floor is litter) — the mask the terrain reads (a forest
  // floor, no field under the trees) and the ground tiers thin under. Self-contained between the factory's functions (the placement
  // harnesses compile the sections above on their own, the grass-work receipt its slices from dispose to the return).
  const woodsSize = 256, woodsCell = 1024 / 256;
  const woodsCrowns = new Float32Array(woodsSize * woodsSize);
  for (const tree of trees) {
    const r = Math.max(1.5, tree.cr) * 1.15;
    const i0 = Math.max(0, Math.floor((tree.x - r + 512) / woodsCell)), i1 = Math.min(woodsSize - 1, Math.floor((tree.x + r + 512) / woodsCell));
    const j0 = Math.max(0, Math.floor((tree.z - r + 512) / woodsCell)), j1 = Math.min(woodsSize - 1, Math.floor((tree.z + r + 512) / woodsCell));
    for (let j = j0; j <= j1; j++) {
      const cz = -512 + (j + 0.5) * woodsCell;
      for (let i = i0; i <= i1; i++) {
        const cx = -512 + (i + 0.5) * woodsCell;
        const w = Math.max(0, Math.min(1, 1.3 - Math.hypot(cx - tree.x, cz - tree.z) / r));
        const k = j * woodsSize + i;
        if (w > woodsCrowns[k]) woodsCrowns[k] = w;
      }
    }
  }
  // the 3 × 3 box (separable, clamped at the square's edge), then the stand threshold
  const woodsRows = new Float32Array(woodsSize * woodsSize), woodsMask = new Float32Array(woodsSize * woodsSize);
  for (let j = 0; j < woodsSize; j++) {
    for (let i = 0; i < woodsSize; i++) {
      const k = j * woodsSize + i;
      woodsRows[k] = (woodsCrowns[k] + woodsCrowns[i > 0 ? k - 1 : k] + woodsCrowns[i < woodsSize - 1 ? k + 1 : k]) / 3;
    }
  }
  for (let j = 0; j < woodsSize; j++) {
    for (let i = 0; i < woodsSize; i++) {
      const k = j * woodsSize + i;
      const spread = (woodsRows[k] + woodsRows[j > 0 ? k - woodsSize : k] + woodsRows[j < woodsSize - 1 ? k + woodsSize : k]) / 3;
      const t = Math.max(0, Math.min(1, (spread - 0.30) / 0.55));
      woodsMask[k] = t * t * (3 - 2 * t);
    }
  }
  woodsCoverAt = (x: number, z: number): number => {
    const u = Math.max(0, Math.min(woodsSize - 1.001, (x + 512) / woodsCell - 0.5));
    const v = Math.max(0, Math.min(woodsSize - 1.001, (z + 512) / woodsCell - 0.5));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * woodsSize + i;
    const a = woodsMask[k] + (woodsMask[k + 1] - woodsMask[k]) * fu;
    const b = woodsMask[k + woodsSize] + (woodsMask[k + woodsSize + 1] - woodsMask[k + woodsSize]) * fu;
    return a + (b - a) * fv;
  };
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

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    grassBuildJob?.job?.cancel();
    carpetWork.cancel();
    if (grassBuildJob) grassBuildJob.job = null;
    grassBuildJob = null;
    midTuftScratch[0] = new Float64Array(0);
    midTuftScratch[1] = new Float64Array(0);
    carpetCache.clear();
  }

  function getGrassWorkState(): VegetationGrassWorkState {
    let built = 0, pendingVisible = 0, pendingAhead = 0, cameraUnknown = 0;
    for (const chunk of grassChunks) {
      if (chunk.built) built++;
      if (chunk.cameraDist == null) { cameraUnknown++; continue; }
      if (chunk.built) continue;
      if (chunk.cameraDist < grassFadeEnd) pendingVisible++;
      else if (chunk.cameraDist < grassAheadDistance) pendingAhead++;
    }
    const active = grassBuildJob?.job
      ? { ...grassBuildJob.job.getState(), chunkX: grassBuildJob.ix, chunkZ: grassBuildJob.iz } : null;
    return { total: grassChunks.length, built, pendingVisible, pendingAhead, cameraUnknown, active,
      carpet: carpetWork.getState(), disposed };
  }

  // Round 77c: the rim trees' mean stature — the instance height scale × the near geometry's height of the rows the
  // impostor atlas bakes — so the ring forest's impostors over the red line stand as tall as the trees at it
  // (horizonForestImpostors.ts); 0 where no atlas exists (the receipts, the mobile tier: the ring keeps its lobes).
  let rimTreeHeightM = 0;
  const rimTreeTint: [number, number, number] = [1, 1, 1];
  if (treeImpostors && rimTrees.length > 0) {
    let sum = 0, r = 0, g = 0, b = 0;
    let living = 0;
    for (const tree of rimTrees) {
      if ((tree.species as string) === 'snag') continue;
      living++;
      const row = treeImpostors.rows[treeImpostors.rowBase(tree.species) + tree.variant % treeImpostors.variants];
      const e = tree.mat.elements;
      sum += Math.hypot(e[4], e[5], e[6]) * row.heightM;
      r += tree.tint.r; g += tree.tint.g; b += tree.tint.b;
    }
    if (living > 0) {
      rimTreeHeightM = sum / living;
      rimTreeTint[0] = r / living; rimTreeTint[1] = g / living; rimTreeTint[2] = b / living;
    }
  }
  rimTrees.length = 0;
  // ---- ground lane (crater-render-spec §C): following the battle's craters ----
  let craterDressing: THREE.InstancedMesh[] | null = null;
  const writeCraterTree = (t: TreeRecord): void => {
    if (t.slot >= 0) writeTreeSlot(nearMeshes[t.species][t.variant], t.slot, t, t.fade);
    if (t.fslot >= 0) writeTreeSlot(farMeshes[t.species][t.fv], t.fslot, t, 0);
  };
  function followCraterLaw(law: GroundCoverCraters): void {
    craterLaw = law;
    craterDressing ??= group.children.filter((c): c is THREE.InstancedMesh =>
      (c as THREE.InstancedMesh).isInstancedMesh === true && (c.userData.bush === true || c.userData.understorey === true));
    followCraters(law, craterFollower, () => {
      craterPatcher.restore();
      restoreCraterTrees(trees, writeCraterTree);
      carpetWork.refresh();
    }, (x0, z0, x1, z1) => {
      for (const gc of grassChunks) {
        if (!gc.meshes || gc.x0 > x1 || gc.x0 + CHUNK_SIZE < x0 || gc.z0 > z1 || gc.z0 + CHUNK_SIZE < z0) continue;
        for (const entry of gc.meshes) reseatInstances(entry.mesh, entry.total, gc.x0, gc.z0, CHUNK_SIZE, x0, z0, x1, z1);
      }
      for (const mesh of craterDressing!) reseatInstances(mesh, mesh.count, -HALF, -HALF, HALF * 2, x0, z0, x1, z1);
      reseatCraterTrees(law, trees, x0, z0, x1, z1, writeCraterTree); // trunks root into the bowl's wall
      // the carpet rebuilds (its inactive half, as ever) when the reach meets its ring
      if (_carpetCellX !== 0x7fffffff) {
        const reach = (CARPET_RING + 1) * CARPET_CELL, cx = (_carpetCellX + 0.5) * CARPET_CELL, cz = (_carpetCellZ + 0.5) * CARPET_CELL;
        if (x1 >= cx - reach && x0 <= cx + reach && z1 >= cz - reach && z0 <= cz + reach) carpetWork.refresh();
      }
    });
  }
  return { group, update, dispose, getGrassWorkState, followCraters: followCraterLaw, setWindTime, setSniperFade, setGroundCoverClearance, treeObstacles, concealers,
    crushTree, resetToppled, advanceToppled: (dt: number) => { if (treeCrushAnims.length) updateTreeCrush(dt); }, _clusters: clusters, _standOutline: standOutlineFraction, _rimBlocks: rimBlocks, _treeImpostors: treeImpostors, _trees: trees,
    _woodsMask: woodsMask,
    _rimMix: veg.rimMix, _rimTreeHeightM: rimTreeHeightM, _rimTreeTint: rimTreeTint,
    warmImpostors: () => (treeImpostors ? treeImpostors.ensureBaked() : false) };
}
