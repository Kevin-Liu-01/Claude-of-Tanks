import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { GarageVariant } from '../game/garageVariants.ts';
import {
  GARAGE_CAMERA_AZIMUTH_RAD,
  GARAGE_PLATFORM_GEOMETRY,
  garagePlatformTerrainHeight,
  garageViewPoint,
  garageWorldPointToView,
  legacyGaragePointToView,
} from '../game/garagePresentationPose.ts';
import {
  addCatalogExterior,
  type GeometryBuckets,
} from '../world/maps/exteriorDetailKit.ts';
import {
  auditStructureCollision,
  structureCollisionOpenIds,
} from '../world/maps/structureCollision.ts';
import { auditStructureAssembly } from '../world/maps/structureAssemblyAudit.ts';
import type { TreeSpecies } from '../world/treeSpecies.ts';
import { createGarageTreeKit } from '../world/vegetation.ts';
import {
  GARAGE_ENVIRONMENT_RECIPES,
  type GarageEnvironmentRecipe,
  type GarageSurfaceKey,
} from './garageEnvironmentRecipes.ts';
import {
  getGarageTerrainPatch,
  type GarageTerrainPatch,
} from './garageTerrainPatches.generated.ts';
import {
  addGarageFacilityDetails,
  garageDrydockBasin,
  garageDrydockGround,
  garageTerraceAtDatum,
  garageTunnelBore,
  getGarageFacilityTerraces,
} from './garageFacilityDetails.ts';
import {
  GARAGE_HARDSTAND_FEATHER_M,
  GARAGE_HARDSTAND_PROGRAM_KEY,
  garageHardstandDetailTexture,
  garageHardstandDetailUniform,
  garageHardstandGradedHook,
  garageHardstandGrainTexture,
} from './garageHardstandProgram.ts';
import {
  GARAGE_HARDSTAND_STYLES,
  GARAGE_SHEETING_TILE_M,
  garageFacilityAlbedo,
  garageHardstandAlbedo,
  garageHardstandDetailKind,
  garageHardstandWetMask,
  garageHardstandNormal,
  garageHardstandNormalKind,
  garageSheeting,
} from './garageYardWear.ts';
import { createGarageSea, garageSeaHoleGlsl } from './garageSea.ts';
import {
  addGarageApproachDetails,
  type GarageApproachStats,
} from './garageApproachDetails.ts';
import { buildGarageKitDressing, type GarageKitBuild, type GarageKitPlacement } from './garageKitPlacement.ts';
import { GARAGE_KIT_PLACEMENTS, GARAGE_KIT_SKYLINES } from './garageKitPlacements.ts';
import { arcWeight, GarageSkylineEmitter, type GarageSkyline } from './garageSkylineKit.ts';

interface GarageEnvironmentEngineContext {
  anisotropy?: number;
  setupShadowMaterial?(material: THREE.Material, extraHook?: THREE.Material['onBeforeCompile'] | null): void;
}

interface GarageEnvironmentStats {
  readonly distinctiveElements: readonly string[];
  readonly drawCalls: number;
  readonly enclosingSurfaces: number;
  readonly landmarkHeightM: number;
  readonly objects: number;
  readonly serviceFrame: string;
  readonly signature: string;
  readonly sourceBeat: string;
  readonly sourceLandmarkLocal: readonly [number, number, number];
  readonly sourceStructure: string;
  readonly terrainProfile: string;
  readonly terrainSourceAnchor: readonly [number, number];
  readonly terrainVertices: number;
  readonly textureSets: readonly string[];
  readonly treeSpecies: readonly string[];
  readonly trees: number;
  readonly treeDetailTier: 'battlefield-near' | 'battlefield-far' | 'none';
  readonly backdropLayers: number;
  readonly horizonStyle: GarageEnvironmentRecipe['horizonStyle'] | 'none';
  readonly horizonMaxHeightM: number;
  /** The built horizon's tallest building mass and slender accent (0 where the biome has none). */
  readonly builtHorizonMassTopM: number;
  readonly builtHorizonAccentTopM: number;
  /** The named landmarks of a Garage's built skyline (garage r9, garageSkylineKit.ts), or none. */
  readonly kitSkylineLandmarks: readonly string[];
  readonly groundCover: number;
  readonly structures: number;
  readonly facilityProps: number;
  readonly facilityStations: number;
  readonly approachLabel: string;
  readonly approachStyle: string;
  readonly approachSegments: number;
  readonly approachDetails: number;
  readonly approachConnected: boolean;
  readonly approachGroundErrorM: number;
  readonly approachTerrainGraded: boolean;
  readonly approachMaxGrade: number;
  readonly connectedExteriorParts: number;
  readonly connectedExteriorBuildings: number;
  readonly maxExteriorSupportGapM: number;
  readonly collisionAuditedStructures: number;
  readonly collisionFootprints: number;
  readonly collisionEnvelopeFill: number;
  readonly openCollisionMaxFill: number;
  readonly structurePerimeterSectors: number;
  readonly treeTrunkMinRadialSegments: number;
  readonly treeTrunksRooted: boolean;
  readonly structureUnsupportedParts: number;
  readonly maxStructureConnectionGapM: number;
  readonly looseParts: number;
  readonly railSegments: number;
  readonly placementZones: number;
  readonly openingViewFrames: number;
  readonly structuralConnections: number;
  readonly unsupportedParts: number;
  readonly heavyLiftSystems: number;
  readonly operationalMachines: number;
  readonly factoryProcessZones: number;
  readonly elevatedAccessSystems: number;
  readonly secureStorageSystems: number;
  readonly environmentSpecificAssemblies: number;
  readonly servicePurposeTags: readonly string[];
  readonly facilityMaterialClasses: number;
  readonly openingSightlineIntrusions: number;
  readonly placementOverlaps: number;
  readonly maxGroundContactErrorM: number;
  readonly platformGroundClearanceM: number;
  readonly triangles: number;
  /** The garage r9 kit's receipt (garageKitPlacement.ts), or null where the Garage places no kit yet. */
  readonly kit: (GarageKitBuild['stats'] & { readonly slideshow: GarageKitBuild['slideshow'] }) | null;
}

export interface GarageEnvironmentBuild {
  readonly root: THREE.Group;
  readonly stats: GarageEnvironmentStats;
  readonly texturesReady?: Promise<void>;
  /** The pack's graded terrain under a world-local point (the kit's placement receipts seat pieces with it). */
  readonly groundAtWorld?: (x: number, z: number) => number;
  dispose(): void;
}

interface TextureEntry {
  color: THREE.Texture | null;
  normal: THREE.Texture | null;
  ready: Promise<void>;
  references: number;
  lastUse: number;
  listeners: Set<() => void>;
}

interface TextureHandle {
  readonly color: THREE.Texture | null;
  readonly normal: THREE.Texture | null;
  readonly ready: Promise<void>;
  release(): void;
}

interface SharedGarageTreeGrove {
  readonly species: TreeSpecies;
  readonly trunk: THREE.BufferGeometry;
  readonly foliage: THREE.BufferGeometry;
  readonly trunkMaterial: THREE.MeshStandardMaterial;
  readonly foliageMaterial: THREE.MeshStandardMaterial;
  readonly detailTier: 'battlefield-near' | 'battlefield-far';
  dispose(): void;
}

export interface GarageEnvironmentAssetLibrary {
  acquire(key: GarageSurfaceKey, requestRender: () => void): TextureHandle;
  treeGrove(species: TreeSpecies): SharedGarageTreeGrove;
  prepareTreeGroves(species: readonly TreeSpecies[]): Promise<void>;
  warmAll(requestRender: () => void): void;
  retainedTextures(): Iterable<THREE.Texture>;
  diagnostics(): Readonly<{ residentSets: number; referencedSets: number }>;
  dispose(): void;
}

const SURFACE_FILES: Readonly<Record<GarageSurfaceKey, readonly [string, string]>> = Object.freeze({
  grass: ['/textures/garage/Grass004_1K-JPG_Color.webp', '/textures/garage/Grass004_1K-JPG_NormalGL.webp'],
  sand: ['/textures/garage/Ground093C_1K-JPG_Color.webp', '/textures/garage/Ground093C_1K-JPG_NormalGL.webp'],
  snow: ['/textures/garage/Snow010A_1K-JPG_Color.webp', '/textures/garage/Snow010A_1K-JPG_NormalGL.webp'],
  rock: ['/textures/garage/Rock063_1K-JPG_Color.webp', '/textures/garage/Rock063_1K-JPG_NormalGL.webp'],
  cobble: ['/textures/garage/PavingStones046_1K-JPG_Color.webp', '/textures/garage/PavingStones046_1K-JPG_NormalGL.webp'],
  plaster: ['/textures/garage/Plaster007_1K-JPG_Color.webp', '/textures/garage/Plaster007_1K-JPG_NormalGL.webp'],
  roof: ['/textures/garage/RoofingTiles012A_1K-JPG_Color.webp', '/textures/garage/RoofingTiles012A_1K-JPG_NormalGL.webp'],
  wood: ['/textures/garage/Planks023A_1K-JPG_Color.webp', '/textures/garage/Planks023A_1K-JPG_NormalGL.webp'],
  brick: ['/textures/garage/Bricks097_1K-JPG_Color.webp', '/textures/garage/Bricks097_1K-JPG_NormalGL.webp'],
});

const MAX_RESIDENT_TEXTURE_SETS = 9;

/**
 * Wind-laid desert sand for the Garage packs (2026-10-10, wave 338: "the sand a grain-free orange plane"): the stock
 * Ground093C albedo is nearly flat, so sand draws a procedural near-white albedo (the terrain tint colours it) with
 * fine grain, dark lithic specks and wind ripples about 20 cm apart on the 9.8 m tile. Drawn once per resident set.
 */
function proceduralSandAlbedo(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const image = g.createImageData(size, size);
  let seed = 0x5a1d;
  const random = (): number => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // low-frequency warp so the ripples meander instead of ruling straight lines
  const warp = (x: number, y: number): number => Math.sin(x * 0.011 + Math.sin(y * 0.017) * 1.7) * 9
    + Math.sin(y * 0.023 + x * 0.006) * 5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const along = (x * 0.94 + y * 0.34 + warp(x, y)) * (Math.PI * 2 / 11);
      const ripple = Math.sin(along) * 0.5 + 0.5;
      // the lee face of each ripple is a little darker and finer
      const lee = Math.pow(ripple, 3) * 0.07 - 0.03;
      const patch = Math.sin(x * 0.019 + 1.3) * Math.sin(y * 0.015 + 0.4) * 0.035;
      const grain = (random() - 0.5) * 0.09;
      let value = 0.9 + lee + patch + grain;
      if (random() < 0.035) value -= 0.12 + random() * 0.1;
      if (random() < 0.01) value += 0.08;
      const index = (y * size + x) * 4;
      const tone = Math.max(0, Math.min(1, value));
      image.data[index] = Math.round(255 * Math.min(1, tone * 1.02));
      image.data[index + 1] = Math.round(255 * tone);
      image.data[index + 2] = Math.round(255 * tone * 0.96);
      image.data[index + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  return canvas;
}
const BUCKET_KEYS = [
  'plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'baked', 'route',
] as const;
type BucketKey = typeof BUCKET_KEYS[number];

function buildSharedGarageTreeGrove(
  engineCtx: GarageEnvironmentEngineContext,
  species: TreeSpecies,
): SharedGarageTreeGrove {
  const seed = hashVariant(`garage-tree-${species}`);
  const source = createGarageTreeKit(engineCtx, null, species, seed, seed % 3);
  const transformPart = (
    geometry: THREE.BufferGeometry,
    x: number,
    z: number,
    size: number,
    yaw: number,
  ): THREE.BufferGeometry => geometry.clone().applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(x, 0, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(size, size, size),
  ));
  const mergeGrove = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
    const pieces = [
      transformPart(geometry, -1.45, 0.35, 0.92, 0.22),
      transformPart(geometry, 1.20, -0.58, 0.76, -0.86),
      transformPart(geometry, 0.10, 1.38, 0.62, 1.42),
    ];
    const merged = mergeGeometries(pieces, false);
    for (const piece of pieces) piece.dispose();
    if (!merged) throw new Error(`Garage tree grove merge failed for ${species}`);
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  };
  const trunk = mergeGrove(source.trunk);
  const foliage = mergeGrove(source.foliage);
  trunk.userData.trunkQuality = source.trunk.userData.trunkQuality;
  const trunkMaterial = source.trunkMaterial;
  const foliageMaterial = source.foliageMaterial;
  const foliageTexture = foliageMaterial.map;
  // a grown kit's bark sheet (vegetation.ts buildGrownGarageTree); the round-8 kits' trunks paint none
  const barkTextures = [trunkMaterial.map, trunkMaterial.normalMap];
  source.trunk.dispose();
  source.foliage.dispose();
  return {
    species,
    trunk,
    foliage,
    trunkMaterial,
    foliageMaterial,
    detailTier: source.detailTier,
    dispose() {
      trunk.dispose();
      foliage.dispose();
      foliageTexture?.dispose();
      for (const texture of barkTextures) texture?.dispose();
      trunkMaterial.dispose();
      foliageMaterial.dispose();
    },
  };
}

/** Reference-counted PBR residency shared by the active and previous pack. */
export function createGarageEnvironmentAssetLibrary(
  engineCtx: GarageEnvironmentEngineContext,
): GarageEnvironmentAssetLibrary {
  const entries = new Map<GarageSurfaceKey, TextureEntry>();
  const treeGroves = new Map<TreeSpecies, SharedGarageTreeGrove>();
  const treeGrovePending = new Map<TreeSpecies, Promise<void>>();
  const retainedTextures = new Set<THREE.Texture>();
  const loader = typeof document === 'undefined' ? null : new THREE.TextureLoader();
  let tick = 0;
  let disposed = false;

  const prepare = (texture: THREE.Texture, color: boolean): void => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, Math.max(1, engineCtx.anisotropy || 4));
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
  };

  const load = (
    key: GarageSurfaceKey,
    url: string,
    color: boolean,
    entry: TextureEntry,
    settle: () => void,
  ): THREE.Texture | null => {
    if (!loader) {
      settle();
      return null;
    }
    const texture = loader.load(url, () => {
      if (disposed || entries.get(key) !== entry) {
        texture.dispose();
        settle();
        return;
      }
      for (const listener of entry.listeners) listener();
      settle();
    }, undefined, () => {
      if (entries.get(key) === entry) for (const listener of entry.listeners) listener();
      settle();
    });
    prepare(texture, color);
    retainedTextures.add(texture);
    return texture;
  };

  const trim = (): void => {
    const candidates = [...entries.entries()]
      .filter(([, entry]) => entry.references === 0)
      .sort((a, b) => a[1].lastUse - b[1].lastUse);
    while (entries.size > MAX_RESIDENT_TEXTURE_SETS && candidates.length) {
      const [key, entry] = candidates.shift()!;
      entries.delete(key);
      if (entry.color) retainedTextures.delete(entry.color);
      if (entry.normal) retainedTextures.delete(entry.normal);
      entry.color?.dispose();
      entry.normal?.dispose();
      entry.listeners.clear();
    }
  };

  return {
    acquire(key, requestRender) {
      let entry = entries.get(key);
      if (!entry) {
        let resolveReady = (): void => {};
        const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
        let remainingLoads = 2;
        const settle = (): void => {
          remainingLoads = Math.max(0, remainingLoads - 1);
          if (remainingLoads === 0) resolveReady();
        };
        entry = {
          color: null,
          normal: null,
          ready,
          references: 0,
          lastUse: ++tick,
          listeners: new Set(),
        };
        entries.set(key, entry);
        const [colorUrl, normalUrl] = SURFACE_FILES[key];
        const sandCanvas = key === 'sand' ? proceduralSandAlbedo() : null;
        if (sandCanvas) {
          const sand = new THREE.CanvasTexture(sandCanvas);
          prepare(sand, true);
          retainedTextures.add(sand);
          entry.color = sand;
          settle();
        } else {
          entry.color = load(key, colorUrl, true, entry, settle);
        }
        entry.normal = load(key, normalUrl, false, entry, settle);
      }
      entry.references += 1;
      entry.lastUse = ++tick;
      entry.listeners.add(requestRender);
      let released = false;
      return {
        color: entry.color,
        normal: entry.normal,
        ready: entry.ready,
        release() {
          if (released) return;
          released = true;
          entry!.references = Math.max(0, entry!.references - 1);
          entry!.lastUse = ++tick;
          entry!.listeners.delete(requestRender);
          trim();
        },
      };
    },
    treeGrove(species) {
      let grove = treeGroves.get(species);
      if (!grove) {
        grove = buildSharedGarageTreeGrove(engineCtx, species);
        treeGroves.set(species, grove);
        if (grove.foliageMaterial.map) retainedTextures.add(grove.foliageMaterial.map);
      }
      return grove;
    },
    async prepareTreeGroves(species) {
      for (const treeSpecies of species) {
        if (treeGroves.has(treeSpecies)) continue;
        let pending = treeGrovePending.get(treeSpecies);
        if (!pending) {
          pending = (async () => {
            if (typeof requestAnimationFrame === 'function') {
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            }
            if (!disposed && !treeGroves.has(treeSpecies)) this.treeGrove(treeSpecies);
          })().finally(() => treeGrovePending.delete(treeSpecies));
          treeGrovePending.set(treeSpecies, pending);
        }
        await pending;
      }
    },
    warmAll(requestRender) {
      // Nine compressed albedo/normal pairs stay under the established Garage
      // GPU budget. Warming them after first paint keeps switches hitch-free
      // while the reference-counted nine-set cap still bounds residency.
      for (const key of Object.keys(SURFACE_FILES) as GarageSurfaceKey[]) {
        const handle = this.acquire(key, requestRender);
        handle.release();
      }
    },
    retainedTextures: () => retainedTextures,
    diagnostics: () => Object.freeze({
      residentSets: entries.size,
      referencedSets: [...entries.values()].filter((entry) => entry.references > 0).length,
    }),
    dispose() {
      disposed = true;
      for (const entry of entries.values()) {
        entry.color?.dispose();
        entry.normal?.dispose();
        entry.listeners.clear();
      }
      for (const grove of treeGroves.values()) grove.dispose();
      treeGroves.clear();
      treeGrovePending.clear();
      entries.clear();
      retainedTextures.clear();
    },
  };
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashVariant(id: string): number {
  let hash = 0x811c9dc5;
  for (const character of id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

interface GarageAtmospherePalette { readonly horizon: number; readonly silhouette: number; }

function atmospherePalette(weather: GarageVariant['weather']): GarageAtmospherePalette {
  switch (weather) {
    case 'dust': return { horizon: 0xa27f61, silhouette: 0x725b4d };
    case 'snow': return { horizon: 0x91a9b4, silhouette: 0x607987 };
    case 'rain': return { horizon: 0x59767a, silhouette: 0x405c57 };
    case 'industrial': return { horizon: 0x69767c, silhouette: 0x4b575d };
    default: return { horizon: 0x668d99, silhouette: 0x526f5d };
  }
}

/**
 * Linear colours from sRGB hex, converted once (the backdrop and the built horizon paint ~10k vertices a build; a
 * THREE.Color per vertex with its sRGB decode was a third of the build, the garage lane's profile of 2026-10-14).
 */
const HEX_COLORS = new Map<number, THREE.Color>();
function hexColor(hex: number): THREE.Color {
  let color = HEX_COLORS.get(hex);
  if (!color) {
    color = new THREE.Color(hex);
    HEX_COLORS.set(hex, color);
  }
  return color;
}

function createBackdropGeometry(
  patch: GarageTerrainPatch,
  values: Float32Array,
  seed: number,
  atmosphere: GarageAtmospherePalette,
  recipe: GarageEnvironmentRecipe,
  skyline: GarageSkyline | null = null,
): THREE.BufferGeometry {
  // Five map-derived bands close the terrain. Relief is authored by biome: mesas terrace, dunes crest and only the alpine
  // recipe receives a mountain skyline; the exact sampled patch still perturbs every crest, so the result stays grounded
  // in its source battlefield.
  //
  // Each band is a landform, not a fence (2026-10-11, waves 393, 398 and 402: "flat grey trapezoid mountains",
  // "cardboard mountains", "uniform orange slabs", "smooth tan humps"): nine rows from its foot to its crest on a face
  // that slopes away from the yard, coloured by height and slope for its biome, lit by its own surface under one fixed
  // low sun, and hazed toward the horizon with distance and toward the foot with valley mist. The coast carries its sea.
  //
  // Round 5d-2 (waves 408 and 419: "flat untextured grey trapezoid slabs", "flat grey-blue blocks", "huge flat pale-blue
  // slabs meant as mountains", "mountains standing on a straight snow line", "smooth flat-tan walls with no strata"):
  // the town, the steelworks and the railway no longer stand as stepped slabs in a silhouette tint. Their bands are low
  // land, and the built horizon is real building masses behind the first band (blocks with windows, gables and a spire;
  // sawtooth mill halls, chimneys and tanks; engine sheds, a water tower and signal gantries), lit by face and hazed by
  // distance. Finer bands carry patches at two scales; the near bands keep their colour; Frosthollow's hills are snow
  // with conifer woods, the pass has a forested foot that grows out of its snowfield, the mesas carry strata, varnish
  // and shaded cliffs, and the sea darkens toward the shore and fades into the horizon. One unlit vertex-colour program.
  // the near bands carry the most columns; the far, hazed ones need fewer (the pack's 50k-triangle budget)
  // (garage r9: a Garage with a built skyline of its own (garageSkylineKit.ts) draws its landmarks into this draw and may
  // reshape the bands: sea arcs, strands, hedges; its low land needs fewer columns)
  const LAYER_SEGMENTS = skyline?.bandSegments ?? [160, 160, 104, 80, 80] as const;
  const segments = 120;
  const ROWS = 8;
  const layers = [
    { radius: 44, base: -5.4, height: 0.26, relief: 0.10, slant: 5 },
    { radius: 54, base: -6.2, height: 0.44, relief: 0.16, slant: 7 },
    { radius: 66, base: -7.0, height: 0.62, relief: 0.22, slant: 9 },
    { radius: 80, base: -8.0, height: 0.82, relief: 0.28, slant: 11 },
    { radius: 96, base: -9.2, height: 1.00, relief: 0.34, slant: 13 },
  ] as const;
  const style = recipe.horizonStyle;
  const snowy = recipe.terrainSurface === 'snow';
  const tropical = recipe.treeSpecies.includes('palm') && recipe.terrainSurface === 'grass';
  const builtKind: 'town' | 'steelworks' | 'railway' | null = style === 'urban' ? 'town'
    : recipe.approach.style === 'foundry-haul-road' ? 'steelworks'
      : recipe.approach.style === 'rail-fan' ? 'railway' : null;
  const phase = ((seed >>> 8) % 6283) / 1000;
  const datum = samplePatch(patch, values, 0, 0);
  const horizon = new THREE.Color(atmosphere.horizon);
  const silhouette = new THREE.Color(atmosphere.silhouette);
  const terrainTone = new THREE.Color(recipe.terrainTint);
  // a value noise in (angle, height) for patches of wood, scree and snow
  const noiseGrid = (() => {
    let state = seed >>> 0;
    return Float32Array.from({ length: 128 * 16 }, () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    });
  })();
  const noise = (u: number, v: number): number => {
    const x = (((u % 1) + 1) % 1) * 128, y = THREE.MathUtils.clamp(v, 0, 0.999) * 15;
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
    const at = (cx: number, cy: number): number => noiseGrid[Math.min(15, cy) * 128 + (cx % 128)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
  };
  const crestProfile = (angle: number, layerIndex: number, layer: typeof layers[number]): number => {
    const broad = Math.sin(angle * 2 + phase) * 0.22
      + Math.sin(angle * 5 - phase * 0.6) * 0.12
      + Math.sin(angle * 9 + phase * 0.34) * 0.055;
    const fine = (noise(angle / (Math.PI * 2) * 4, 0.3 + layerIndex * 0.11) - 0.5) * 0.12;
    switch (style) {
      case 'alpine': {
        const peakA = Math.pow(Math.max(0, Math.sin(angle * 3 + phase)), 2.2);
        const peakB = Math.pow(Math.max(0, Math.sin(angle * 5 - phase * 0.7)), 3.0);
        const crag = Math.pow(Math.max(0, Math.sin(angle * 11 + phase * 1.4)), 5.0);
        const passCut = Math.pow(Math.max(0, Math.cos(angle * 2 - phase * 0.4)), 8.0);
        return broad * 1.35 + peakA * 0.62 + peakB * 0.38 + crag * 0.2 + fine * 1.5 - passCut * 0.18;
      }
      case 'dune': {
        const layerPhase = phase + layerIndex * 1.93;
        const skewed = (lobes: number, offset: number): number => {
          const x = angle * lobes + offset;
          return x + 0.55 * Math.sin(x);
        };
        const ridgeA = Math.pow(1 - Math.abs(Math.sin(skewed(4, layerPhase))), 1.8);
        const ridgeB = Math.pow(1 - Math.abs(Math.sin(skewed(9, -layerPhase * 0.7))), 2.4);
        const shoulder = THREE.MathUtils.smoothstep(Math.cos(angle - phase * 0.5 - 2.4), 0.55, 0.86);
        const reach = 0.36 + layer.height * 0.64;
        return (ridgeA * 0.62 + ridgeB * 0.2 + broad * 0.25 - 0.2) * reach
          + shoulder * 0.5 * layer.height * layer.height - layer.height * 0.5;
      }
      case 'mesa': {
        // flat-topped tablelands broken by canyons, with buttes standing off them
        const shelf = Math.sin(angle * 2 + phase) * 0.52 + Math.sin(angle * 4 - phase) * 0.20;
        const canyon = Math.pow(Math.max(0, Math.sin(angle * 3 - phase * 0.7 + layerIndex)), 10);
        const butte = Math.pow(Math.max(0, Math.cos(angle * 5 + phase + layerIndex * 0.8)), 14);
        const notch = Math.pow(Math.max(0, Math.sin(angle * 13 + phase * 2 + layerIndex * 1.7)), 24);
        return Math.round(shelf * 4) / 4 + broad * 0.18 - canyon * 0.42 + butte * 0.46 - notch * 0.2 + fine * 0.4;
      }
      case 'rolling': {
        const woodedShoulder = Math.pow(Math.max(0, Math.sin(angle * 4 + phase)), 3) * 0.20;
        if (tropical && layerIndex < 2) {
          // Monsoon's near ridges carry rain forest (the re-judge, 2026-10-15: "smooth low-poly ... no jungle belt ... no
          // tree line on the ridges"): the crest breaks into rounded crowns about 8 m across, emergents standing over them
          const crowns = layerIndex === 0 ? 17 : 21;
          const crown = Math.pow(Math.abs(Math.sin(angle * crowns + phase + noise(angle / (Math.PI * 2) * 6, 0.7) * 2.4)), 0.55);
          const emergent = Math.pow(Math.max(0, Math.sin(angle * 7 - phase * 1.3)), 12) * 0.16;
          return broad * 1.30 + woodedShoulder + fine + crown * 0.22 + emergent;
        }
        return broad * 1.30 + woodedShoulder + fine;
      }
      case 'coastal': {
        const headland = Math.pow(Math.max(0, Math.sin(angle * 2.2 + phase)), 4) * 0.38;
        return broad * 0.25 - 0.12 + headland + fine * 0.5;
      }
      default: // the town, the steelworks and the railway: low land behind which their buildings stand
        return broad * 0.34 + fine - 0.04;
    }
  };
  /** The band's ground colour at one point: biome, height above the datum, height up its own face, slope and patches. */
  const ground = (out: THREE.Color, t: number, y: number, slope: number, u: number, layerIndex: number): THREE.Color => {
    const n = noise(u * 5, t * 0.8 + layerIndex * 0.11);
    const m = noise(u * 23 + layerIndex * 0.37, t * 1.7);
    const H = recipe.horizonHeightM;
    switch (style) {
      case 'alpine': {
        // a forested foot grows out of the snowfield, then rock bands and snow by height and slope
        if (t < 0.16) return out.copy(terrainTone).lerp(hexColor(0x2c3a31), t / 0.16 * (0.4 + n * 0.5));
        const snowLine = H * (0.42 + (n - 0.5) * 0.18);
        if (y > snowLine && slope < 0.85) return out.copy(hexColor(0xe9eef2)).lerp(hexColor(0xa9b8c4), Math.min(1, slope * 0.8 + m * 0.2));
        if (y > H * 0.24 || slope > 0.85) return out.copy(hexColor(m > 0.5 ? 0x6e7275 : 0x50565a)).lerp(hexColor(0x3d4245), n * 0.5);
        return out.copy(hexColor(m > 0.45 ? 0x24322a : 0x34432f));
      }
      case 'mesa': {
        if (t < 0.36) return out.copy(hexColor(0x7d5240)).lerp(hexColor(0x9a6a4c), n * 0.6).lerp(hexColor(0x5c3a2c), m * 0.25);
        const band = Math.floor((y + 40) / 0.75 + n * 0.8) % 5;
        const strata = [0xa35f40, 0xc98a5e, 0x8a4a33, 0xd8a074, 0x9b5a3c][band];
        // desert varnish runs down the cliff in streaks
        const streak = Math.pow(noise(u * 61, 0.5), 3) * 0.5;
        return out.copy(hexColor(strata)).lerp(hexColor(0x4a2c22), streak + Math.max(0, (n - 0.62)) * 0.6);
      }
      case 'dune': return out.copy(hexColor(0xd7b585)).lerp(hexColor(0xc29a68), n * 0.7).lerp(hexColor(0xe6caa0), m * 0.2);
      case 'rolling': {
        if (snowy) {
          // snowbound hills: conifer woods and grey outcrops through the snow
          if (n > 0.6 && t < 0.85) return out.copy(hexColor(m > 0.5 ? 0x26332c : 0x34423a));
          if (slope > 0.7) return out.copy(hexColor(0x7d8486));
          return out.copy(hexColor(0xe4ebef)).lerp(hexColor(0xc4d0d8), m * 0.5 + slope * 0.3);
        }
        if (tropical) return out.copy(hexColor(n > 0.5 ? 0x24452a : 0x3e6a34)).lerp(hexColor(0x587c3a), m * 0.35);
        return out.copy(hexColor(n > 0.58 ? 0x2f4a2b : 0x4f6d3c)).lerp(hexColor(0x6b7f4a), t * 0.25 + m * 0.15);
      }
      case 'coastal': {
        if (slope > 0.75) return out.copy(hexColor(0x7f8580)).lerp(hexColor(0x5d6460), n * 0.5);
        return out.copy(hexColor(n > 0.55 ? 0x41583f : 0x5a734e)).lerp(hexColor(0x6f7f56), m * 0.3);
      }
      default: {
        // town: allotments, scrub and rail embankments; steelworks and railway: moor, spoil and scrub
        if (builtKind === 'town') return out.copy(hexColor(n > 0.55 ? 0x46573a : 0x5f6b48)).lerp(hexColor(0x6e6a5a), m * 0.4);
        return out.copy(hexColor(n > 0.5 ? 0x4a4a3a : 0x5c5844)).lerp(hexColor(0x3c3832), m * 0.45).lerp(silhouette, 0.12);
      }
    }
  };

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  let maxHeightM = -Infinity;
  const sun = new THREE.Vector3(0.53, 0.5, -0.63).normalize();
  const colour = new THREE.Color();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  const rugged = style === 'mesa' || style === 'alpine';
  const columns = segments + 1;
  layers.forEach((layer, layerIndex) => {
    const segments = LAYER_SEGMENTS[layerIndex];
    const columns = segments + 1;
    const crestHeights = new Float32Array(columns);
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const sourceX = Math.cos(angle) * patch.sizeXM * 0.48;
      const sourceZ = Math.sin(angle) * patch.sizeZM * 0.48;
      const sampled = THREE.MathUtils.clamp(samplePatch(patch, values, sourceX, sourceZ) - datum, -2.4, 4.8);
      const nominal = recipe.horizonHeightM * layer.height * (builtKind ? 0.55 : 1);
      const clamped = THREE.MathUtils.clamp(
        nominal + sampled * layer.relief + crestProfile(angle, layerIndex, layer) * recipe.horizonHeightM,
        -0.15, recipe.horizonHeightM,
      );
      const crest = skyline?.crest ? Math.min(recipe.horizonHeightM, skyline.crest(angle, layerIndex, clamped)) : clamped;
      crestHeights[segment] = crest;
      maxHeightM = Math.max(maxHeightM, crest);
    }
    const first = positions.length / 3;
    // positions: rows from foot (k = 0) to crest (k = ROWS - 1); the face slopes back from the yard
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const crest = crestHeights[segment];
      for (let k = 0; k < ROWS; k += 1) {
        const t = k / (ROWS - 1);
        let shape = 1 - Math.pow(1 - t, 1.35);
        if (style === 'mesa') shape = t < 0.36 ? t * 0.7 : 0.252 + (t - 0.36) / 0.64 * 0.748; // a talus, then the cliff
        const y = layer.base + (crest - layer.base) * shape;
        const radius = layer.radius - layer.slant * (1 - t) * (style === 'mesa' && t >= 0.36 ? 0.12 : 1);
        positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
        colors.push(0, 0, 0);
      }
    }
    // colours: biome by height and slope, lit by the band's own surface, hazed with distance and toward the foot
    for (let segment = 0; segment <= segments; segment += 1) {
      const wrapped = segment === segments ? 0 : segment;
      const prev = (wrapped + segments - 1) % segments, next = (wrapped + 1) % segments;
      for (let k = 0; k < ROWS; k += 1) {
        const t = k / (ROWS - 1);
        const at = (s: number, kk: number): THREE.Vector3 => a.fromArray(positions, (first + s * ROWS + kk) * 3);
        const along = b.copy(at(next, k)).sub(at(prev, k));
        const up = c.copy(at(wrapped, Math.min(ROWS - 1, k + 1))).sub(at(wrapped, Math.max(0, k - 1)));
        normal.crossVectors(up, along).normalize();
        // the face must look at the yard (inward)
        const p = at(wrapped, k);
        if (normal.x * -p.x + normal.z * -p.z < 0) normal.negate();
        const slope = 1 - Math.max(0, Math.min(1, normal.y * 1.4));
        if (!skyline?.ground?.(colour, (segment / segments) * Math.PI * 2, t, p.y, slope, layerIndex,
          noise(segment / segments * 5, t * 0.8 + layerIndex * 0.11))) ground(colour, t, p.y, slope, segment / segments, layerIndex);
        const sunlit = Math.max(0, normal.dot(sun));
        const lit = rugged ? 0.46 + 0.86 * sunlit + 0.1 * Math.max(0, normal.y) : 0.56 + 0.64 * sunlit + 0.1 * Math.max(0, normal.y);
        let shade = lit * (0.92 + (noise(segment / segments * 17, t + layerIndex) - 0.5) * 0.16);
        // Monsoon's forest crowns stay dark against the sky (ticket 6, 2026-10-15: lit crowns "wash out to white puffs
        // that read as cloud")
        if (tropical && style === 'rolling' && layerIndex < 2 && t > 0.7) shade = Math.min(shade, 0.95) * 0.8;
        colour.multiplyScalar(shade);
        const haze = Math.min(0.8, 0.07 + layerIndex * 0.12 + (1 - t) * 0.16) * (tropical && layerIndex < 2 && t > 0.7 ? 0.5 : 1);
        colour.lerp(horizon, haze);
        colour.toArray(colors, (first + segment * ROWS + k) * 3);
      }
    }
    for (let segment = 0; segment < segments; segment += 1) {
      // a column drowned under a skyline's sea arc is never seen: it draws nothing
      if (skyline && crestHeights[segment] < -2.4 && crestHeights[segment + 1] < -2.4) continue;
      for (let k = 0; k < ROWS - 1; k += 1) {
        const i0 = first + segment * ROWS + k, i1 = i0 + 1, i2 = i0 + ROWS, i3 = i2 + 1;
        indices.push(i0, i1, i2, i2, i1, i3);
      }
    }
  });
  if (style === 'coastal') {
    // the sea from the shore to the horizon: deep green-teal at the shore, swell bands across it, the horizon's haze far
    // (wave 408: "a flat, uniform teal plane meeting the grass")
    const first = positions.length / 3;
    const rings = [34, 46, 62, 84, 116, 170, 260];
    rings.forEach((r, ringIndex) => {
      const far = ringIndex / (rings.length - 1);
      for (let segment = 0; segment <= segments; segment += 1) {
        const angle = (segment / segments) * Math.PI * 2;
        positions.push(Math.cos(angle) * r, -2.3, Math.sin(angle) * r);
        const swell = noise(segment / segments * 31 + ringIndex * 0.21, 0.2 + ringIndex * 0.1);
        // (rejudge6: "flat teal bands"; garage r9: shallow turquoise toward the strand, deepening to blue-green offshore)
        colour.copy(hexColor(skyline ? 0x2f747a : 0x274f57)).lerp(hexColor(skyline ? 0x2e6a78 : 0x3d6f78), far * 0.8 + (swell - 0.5) * 0.12)
          .lerp(horizon, Math.min(0.92, 0.12 + far * far * 0.85));
        colors.push(colour.r, colour.g, colour.b);
      }
    });
    for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        // a skyline's sea runs only over its arc (the land bands hide the rest)
        if (skyline?.seaArc && arcWeight((segment + 0.5) / segments * Math.PI * 2, skyline.seaArc[0], skyline.seaArc[1], 0.35) <= 0) continue;
        const i0 = first + ringIndex * columns + segment, i1 = i0 + 1, i2 = i0 + columns, i3 = i2 + 1;
        indices.push(i0, i2, i1, i1, i2, i3);
      }
    }
  }
  let accentTopM = 0;
  let massTopM = 0;
  if (skyline) {
    const emitter = new GarageSkylineEmitter(positions, colors, indices, horizon, sun, seed ^ 0x51c1);
    skyline.build(emitter);
    massTopM = emitter.massTop;
    accentTopM = emitter.accentTop;
  } else if (builtKind) {
    const built = addBuiltHorizon(builtKind, seed, horizon, sun, positions, colors, indices);
    massTopM = built.massTopM;
    accentTopM = built.accentTopM;
  }
  const vertexCount = positions.length / 3;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(vertexCount > 65535 ? new Uint32Array(indices) : new Uint16Array(indices), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.horizonStyle = recipe.horizonStyle;
  geometry.userData.builtHorizon = skyline ? 'skyline' : builtKind;
  geometry.userData.kitSkylineLandmarks = skyline ? skyline.landmarks.map((landmark) => landmark.name) : [];
  geometry.userData.accentTopM = Number(accentTopM.toFixed(3));
  geometry.userData.massTopM = Number(massTopM.toFixed(3));
  geometry.userData.maxHeightM = Number(maxHeightM.toFixed(3));
  return geometry;
}

/**
 * The built horizon behind a town, a steelworks or a railway yard (round 5d-2): building masses between the first and
 * the third band, each turned to face the yard, every face flat-shaded by the same low sun as the bands and hazed by its
 * distance. Their feet stand behind the first band's crest. The town: blocks of four to seven storeys with window rows
 * (a few lit), pitched-roof houses, a church spire and a factory chimney. The steelworks: sawtooth mill halls, chimneys,
 * gas holders and a blast furnace stack. The railway: engine sheds, a water tower, coaling stage and signal gantries.
 * The masses stay under the biome ceiling (13.2 m); only slender accents (stacks, the spire, the furnace, the water
 * tower) rise past it. Returns both tops.
 */
function addBuiltHorizon(
  kind: 'town' | 'steelworks' | 'railway',
  seed: number,
  horizon: THREE.Color,
  sun: THREE.Vector3,
  positions: number[],
  colors: number[],
  indices: number[],
): { massTopM: number; accentTopM: number } {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  const rng = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const colour = new THREE.Color();
  const n = new THREE.Vector3();
  let tallest = 0;
  let accentTop = 0;
  let accent = false; // set while an accent is drawn: its tops count apart from the masses'
  /** one flat-shaded quad (corners counter-clockwise seen from outside) in a tone lit by its normal and hazed by `haze` */
  const quad = (p: readonly THREE.Vector3[], tone: number, haze: number): void => {
    n.subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[3], p[0])).normalize();
    const lit = 0.5 + 0.7 * Math.max(0, n.dot(sun)) + 0.12 * Math.max(0, n.y);
    const base = positions.length / 3;
    for (const v of p) {
      // walls darken toward their feet (grime, the ground's shade)
      colour.copy(hexColor(tone)).multiplyScalar(lit * (v.y < 1 ? 0.72 : 1)).lerp(horizon, haze);
      positions.push(v.x, v.y, v.z); colors.push(colour.r, colour.g, colour.b);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  /** a flat panel on a front face at z0: a doorway, a louvre band or a row of glazing */
  const panel = (at: (x: number, y: number, z: number) => THREE.Vector3, x0: number, x1: number, z0: number, y0: number,
    y1: number, tone: number, haze: number): void => {
    quad([at(x0, y0, z0 - 0.06), at(x1, y0, z0 - 0.06), at(x1, y1, z0 - 0.06), at(x0, y1, z0 - 0.06)], tone, haze);
  };
  const tri = (p: readonly THREE.Vector3[], tone: number, haze: number): void => {
    n.subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0])).normalize();
    const lit = 0.5 + 0.7 * Math.max(0, n.dot(sun)) + 0.12 * Math.max(0, n.y);
    colour.copy(hexColor(tone)).multiplyScalar(lit).lerp(horizon, haze);
    const base = positions.length / 3;
    for (const v of p) { positions.push(v.x, v.y, v.z); colors.push(colour.r, colour.g, colour.b); }
    indices.push(base, base + 1, base + 2);
  };
  /** a frame turned to face the yard at (angle, radius): x across (to the right seen from the yard), z away from it */
  const frame = (angle: number, radius: number) => {
    const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const across = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const origin = out.clone().multiplyScalar(radius);
    return (x: number, y: number, z: number): THREE.Vector3 => origin.clone().addScaledVector(across, x).addScaledVector(out, z).setY(y);
  };
  const FOOT = -3.5;
  /** a box: front face toward the yard; walls in `wall`, flat roof in `roof` */
  const box = (at: ReturnType<typeof frame>, x0: number, x1: number, z0: number, z1: number, top: number,
    wall: number, roof: number, haze: number, flat = true): void => {
    const P = (x: number, y: number, z: number) => at(x, y, z);
    quad([P(x0, FOOT, z0), P(x1, FOOT, z0), P(x1, top, z0), P(x0, top, z0)], wall, haze); // front (faces the yard: -z)
    quad([P(x1, FOOT, z0), P(x1, FOOT, z1), P(x1, top, z1), P(x1, top, z0)], wall, haze);
    quad([P(x0, FOOT, z1), P(x0, FOOT, z0), P(x0, top, z0), P(x0, top, z1)], wall, haze);
    quad([P(x1, FOOT, z1), P(x0, FOOT, z1), P(x0, top, z1), P(x1, top, z1)], wall, haze);
    if (flat) quad([P(x0, top, z0), P(x1, top, z0), P(x1, top, z1), P(x0, top, z1)], roof, haze);
    if (accent) accentTop = Math.max(accentTop, top); else tallest = Math.max(tallest, top);
  };
  /** a pitched roof over a box, its ridge across the frame (gable ends left and right) */
  const gable = (at: ReturnType<typeof frame>, x0: number, x1: number, z0: number, z1: number, eave: number, ridge: number,
    wall: number, roof: number, haze: number): void => {
    const P = (x: number, y: number, z: number) => at(x, y, z);
    const zm = (z0 + z1) / 2;
    quad([P(x0, eave, z0), P(x1, eave, z0), P(x1, ridge, zm), P(x0, ridge, zm)], roof, haze);
    quad([P(x1, eave, z1), P(x0, eave, z1), P(x0, ridge, zm), P(x1, ridge, zm)], roof, haze);
    tri([P(x1, eave, z0), P(x1, eave, z1), P(x1, ridge, zm)], wall, haze);
    tri([P(x0, eave, z1), P(x0, eave, z0), P(x0, ridge, zm)], wall, haze);
    if (accent) accentTop = Math.max(accentTop, ridge); else tallest = Math.max(tallest, ridge);
  };
  /** window rows on a front face at z0 (dark glass, a few lit) */
  const windows = (at: ReturnType<typeof frame>, x0: number, x1: number, z0: number, top: number, haze: number): void => {
    const P = (x: number, y: number, z: number) => at(x, y, z);
    for (let floor = 1.2; floor + 1.4 < top - 0.6; floor += 3) {
      for (let x = x0 + 1.1; x + 1.3 < x1 - 0.6; x += 2.6) {
        const lit = rng() < 0.12;
        quad([P(x, floor, z0 - 0.06), P(x + 1.3, floor, z0 - 0.06), P(x + 1.3, floor + 1.5, z0 - 0.06), P(x, floor + 1.5, z0 - 0.06)],
          lit ? 0xd9c48f : 0x2c3339, haze * (lit ? 0.6 : 1));
      }
    }
  };
  /** a round tank, stack or tower: a prism of `sides` from FOOT (or `foot`) to `top` with a darker cap */
  const prism = (at: ReturnType<typeof frame>, x: number, z: number, radius: number, top: number, tone: number, cap: number,
    haze: number, sides = 10, foot = FOOT): void => {
    const P = (px: number, y: number, pz: number) => at(px, y, pz);
    const rise = Math.min(radius * 0.25, 1.2);
    for (let i = 0; i < sides; i += 1) {
      const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
      const [x0, z0, x1, z1] = [x + Math.cos(a0) * radius, z + Math.sin(a0) * radius, x + Math.cos(a1) * radius, z + Math.sin(a1) * radius];
      quad([P(x1, foot, z1), P(x0, foot, z0), P(x0, top, z0), P(x1, top, z1)], tone, haze);
      tri([P(x, top + rise, z), P(x1, top, z1), P(x0, top, z0)], cap, haze);
    }
    if (accent) accentTop = Math.max(accentTop, top + rise); else tallest = Math.max(tallest, top + rise);
  };
  const hazeAt = (radius: number): number => THREE.MathUtils.clamp(0.1 + (radius - 50) / 40 * 0.22, 0.08, 0.34);
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rng() * list.length)];
  if (kind === 'town') {
    const walls = [0x8a5a44, 0x9c6b52, 0xb9b0a0, 0xa39a8a, 0x8c8f8f, 0x7a6a5c];
    const roofs = [0x4a4f55, 0x7a4a3a, 0x5a5048];
    let angle = rng() * 0.2;
    while (angle < Math.PI * 2) {
      const radius = 52 + rng() * 26;
      const at = frame(angle, radius);
      const roll = rng();
      const width = 7 + rng() * 9;
      if (roll < 0.62) {
        const top = 9 + rng() * 4;
        box(at, -width / 2, width / 2, 0, 8 + rng() * 5, top, pick(walls), 0x3e4246, hazeAt(radius));
        windows(at, -width / 2, width / 2, 0, top, hazeAt(radius));
      } else if (roll < 0.9) {
        const eave = 6 + rng() * 2.5;
        const depth = 7 + rng() * 3;
        box(at, -width / 2, width / 2, 0, depth, eave, pick(walls), 0x3e4246, hazeAt(radius), false);
        gable(at, -width / 2 - 0.3, width / 2 + 0.3, -0.4, depth + 0.4, eave, eave + 2.8 + rng() * 1.2, pick(walls), pick(roofs), hazeAt(radius));
        windows(at, -width / 2, width / 2, 0, eave, hazeAt(radius));
      } else if (roll < 0.95) {
        // a church: nave and a spire
        box(at, -5, 5, 0, 14, 8.6, 0xa59d8c, 0x4a4f55, hazeAt(radius), false);
        gable(at, -5.3, 5.3, -0.3, 14.3, 8.6, 12.8, 0xa59d8c, 0x4a4f55, hazeAt(radius));
        accent = true;
        box(at, -2, 2, -2.5, 1.5, 16, 0xa59d8c, 0x4a4f55, hazeAt(radius), false);
        prism(at, 0, -0.5, 2.3, 24, 0x4a4f55, 0x3a3f44, hazeAt(radius), 4, 16);
        accent = false;
      } else {
        accent = true;
        prism(at, 0, 4, 1.4, 20 + rng() * 5, 0x7b4e3c, 0x2a2624, hazeAt(radius), 8);
        accent = false;
        box(at, -6, 6, 0, 12, 8, 0x8a6a54, 0x3e4246, hazeAt(radius));
      }
      angle += (width + 4 + rng() * 6) / radius;
    }
  } else if (kind === 'steelworks') {
    let angle = rng() * 0.3;
    while (angle < Math.PI * 2) {
      const radius = 54 + rng() * 22;
      const at = frame(angle, radius);
      const roll = rng();
      const width = 14 + rng() * 14;
      if (roll < 0.55) {
        // a mill hall with a sawtooth roof
        const eave = 7 + rng() * 2.6;
        const depth = 16 + rng() * 10;
        const wall = pick([0x6f7478, 0x5d6266, 0x7a5a48, 0x6a5f55]);
        box(at, -width / 2, width / 2, 0, depth, eave, wall, 0x3a3d40, hazeAt(radius), false);
        panel(at, -width / 2 + 0.6, width / 2 - 0.6, 0, eave - 1.6, eave - 0.6, 0x2b2e30, hazeAt(radius)); // louvres
        panel(at, -2.6, 2.6, 0, 0, Math.min(6, eave - 2), 0x1f2224, hazeAt(radius)); // the bay door
        const teeth = Math.max(2, Math.round(depth / 5));
        for (let i = 0; i < teeth; i += 1) {
          const za = (i / teeth) * depth, zb = ((i + 1) / teeth) * depth;
          const P = (x: number, y: number, z: number) => at(x, y, z);
          quad([P(width / 2, eave, za), P(-width / 2, eave, za), P(-width / 2, eave + 3.2, za), P(width / 2, eave + 3.2, za)], 0x8a9298, hazeAt(radius) * 0.9);
          quad([P(-width / 2, eave, zb), P(width / 2, eave, zb), P(width / 2, eave + 3.2, za), P(-width / 2, eave + 3.2, za)], 0x3d4144, hazeAt(radius));
        }
        tallest = Math.max(tallest, eave + 3.2);
      } else if (roll < 0.75) {
        accent = true;
        prism(at, 0, 3, 1.3 + rng() * 0.6, 20 + rng() * 6, pick([0x6e4434, 0x8a8a86]), 0x1c1a19, hazeAt(radius), 8);
        prism(at, 5, 6, 1.1, 16 + rng() * 5, 0x6e4434, 0x1c1a19, hazeAt(radius), 8);
        accent = false;
      } else if (roll < 0.9) {
        // gas holders and storage tanks
        prism(at, 0, 6, 6 + rng() * 3, 8 + rng() * 3.5, pick([0x8a6e52, 0x9a9c9a, 0x6a6e70]), 0x55595b, hazeAt(radius), 14);
      } else {
        // a blast furnace: a stack in a frame with its downcomer
        accent = true;
        prism(at, 0, 5, 3.4, 19, 0x4d4a48, 0x2a2826, hazeAt(radius), 10);
        box(at, -6, -4.6, 2, 8, 22, 0x5a5552, 0x3a3836, hazeAt(radius));
        box(at, 4.6, 6, 2, 8, 22, 0x5a5552, 0x3a3836, hazeAt(radius));
        box(at, -6, 6, 2, 8, 22.8, 0x5a5552, 0x3a3836, hazeAt(radius));
        accent = false;
      }
      angle += (width + 5 + rng() * 8) / radius;
    }
  } else {
    let angle = rng() * 0.3;
    let placedTower = false;
    while (angle < Math.PI * 2) {
      const radius = 54 + rng() * 22;
      const at = frame(angle, radius);
      const roll = rng();
      const width = 12 + rng() * 12;
      if (roll < 0.55) {
        // an engine shed: brick walls, a pitched roof with a smoke vent along its ridge
        const eave = 6.5 + rng() * 1.8;
        const depth = 20 + rng() * 14;
        const wall = pick([0x7e5240, 0x6c4a3a, 0x5c6064]);
        box(at, -width / 2, width / 2, 0, depth, eave, wall, 0x3a3d40, hazeAt(radius), false);
        // the road doors on the yard face and a row of arched windows above them
        for (let door = -1; door <= 1; door += 2) panel(at, door * width / 4 - 2, door * width / 4 + 2, 0, 0, 5, 0x1d1f20, hazeAt(radius));
        for (let x = -width / 2 + 1; x + 1.2 < width / 2 - 0.5; x += 2.2) panel(at, x, x + 1.2, 0, eave - 2.4, eave - 0.9, 0x2c3339, hazeAt(radius));
        gable(at, -width / 2 - 0.4, width / 2 + 0.4, -0.5, depth + 0.5, eave, eave + 3.6, wall, 0x45494c, hazeAt(radius));
        box(at, -1.2, 1.2, depth * 0.2, depth * 0.8, eave + 4.4, 0x2f3133, 0x2a2c2e, hazeAt(radius));
      } else if (roll < 0.7 && !placedTower) {
        placedTower = true;
        // the water tower on its trestle
        accent = true;
        for (const [lx, lz] of [[-2.2, 1], [2.2, 1], [-2.2, 5], [2.2, 5]]) box(at, lx - 0.25, lx + 0.25, lz - 0.25, lz + 0.25, 11, 0x4a3e34, 0x4a3e34, hazeAt(radius));
        prism(at, 0, 3, 3.2, 15.5, 0x6b5a48, 0x3e3a36, hazeAt(radius), 12, 11);
        accent = false;
      } else if (roll < 0.85) {
        // a signal gantry over the running lines
        box(at, -width / 2, -width / 2 + 0.5, 0, 0.5, 8, 0x2f3133, 0x2f3133, hazeAt(radius));
        box(at, width / 2 - 0.5, width / 2, 0, 0.5, 8, 0x2f3133, 0x2f3133, hazeAt(radius));
        box(at, -width / 2, width / 2, 0, 0.5, 8.6, 0x2f3133, 0x2f3133, hazeAt(radius));
      } else {
        // the coaling stage and a works chimney
        box(at, -8, 8, 0, 9, 11, 0x4a4440, 0x2e2b29, hazeAt(radius));
        accent = true;
        prism(at, 10, 5, 1.2, 19 + rng() * 5, 0x6e4434, 0x1c1a19, hazeAt(radius), 8);
        accent = false;
      }
      angle += (width + 6 + rng() * 10) / radius;
    }
  }
  return { massTopM: tallest, accentTopM: accentTop };
}

function createGroundCoverGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  // A clump of seven narrow blades of different heights, leaning out from the root (waves 408 and 419 read the old
  // three-blade tufts as "teal cone spikes"): a darker base and a lit tip. The material reads vertex colours; without
  // this attribute every tuft drew black (wave 338's "black spikes" across the lawn and sand).
  for (let blade = 0; blade < 7; blade += 1) {
    const angle = blade * 2.4;
    const lean = 0.08 + (blade % 3) * 0.07;
    const height = 0.42 + ((blade * 37) % 7) / 7 * 0.32;
    const bx = Math.cos(angle) * 0.04, bz = Math.sin(angle) * 0.04;
    const half = 0.03;
    const sx = -Math.sin(angle) * half, sz = Math.cos(angle) * half;
    positions.push(bx - sx, 0, bz - sz, bx + sx, 0, bz + sz, bx + Math.cos(angle) * lean, height, bz + Math.sin(angle) * lean);
    colors.push(0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.95, 0.95, 0.95);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function decodePatch(patch: GarageTerrainPatch): Float32Array {
  const binary = globalThis.atob(patch.centimetersBase64);
  const values = new Float32Array(binary.length / 2);
  for (let index = 0; index < values.length; index += 1) {
    const raw = binary.charCodeAt(index * 2) | (binary.charCodeAt(index * 2 + 1) << 8);
    values[index] = (raw & 0x8000 ? raw - 0x10000 : raw) / 100;
  }
  return values;
}

/**
 * A yard's containers weathered in the Garage (rejudge6, 2026-10-15: "toy-saturated containers"): each livery drawn 40 %
 * of the way to its grey and darkened, the dirt rising up the bottom 1.2 m. Fresh geometry per build (railKit's
 * pushContainer), so the pass never compounds.
 */
function weatherLiveries(buckets: GeometryBuckets): void {
  for (const value of Object.values(buckets)) {
    if (!Array.isArray(value)) continue;
    for (const geometry of value as THREE.BufferGeometry[]) {
      const color = geometry.getAttribute('color'), position = geometry.getAttribute('position');
      if (!color || !position) continue;
      for (let i = 0; i < color.count; i += 1) {
        const r = color.getX(i), g = color.getY(i), b = color.getZ(i);
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const k = 0.86 * (1 - 0.18 * Math.max(0, 1 - position.getY(i) / 1.2));
        color.setXYZ(i, (r + (luma - r) * 0.4) * k, (g + (luma - g) * 0.4) * k, (b + (luma - b) * 0.4) * k);
      }
      color.needsUpdate = true;
    }
  }
}

function samplePatch(
  patch: GarageTerrainPatch,
  values: Float32Array,
  x: number,
  z: number,
): number {
  const fx = THREE.MathUtils.clamp((x / patch.sizeXM + 0.5) * (patch.width - 1), 0, patch.width - 1);
  const fz = THREE.MathUtils.clamp((z / patch.sizeZM + 0.5) * (patch.height - 1), 0, patch.height - 1);
  const x0 = Math.floor(fx); const z0 = Math.floor(fz);
  const x1 = Math.min(patch.width - 1, x0 + 1);
  const z1 = Math.min(patch.height - 1, z0 + 1);
  const tx = fx - x0; const tz = fz - z0;
  const a = THREE.MathUtils.lerp(values[z0 * patch.width + x0], values[z0 * patch.width + x1], tx);
  const b = THREE.MathUtils.lerp(values[z1 * patch.width + x0], values[z1 * patch.width + x1], tx);
  return THREE.MathUtils.lerp(a, b, tz);
}

function cameraPoint(side: number, depth: number): Readonly<{ x: number; z: number }> {
  return garageViewPoint(side, depth);
}

/**
 * Metres per texture repeat on the terrain, per surface (2026-10-11, wave 398: "a hugely over-scaled cobblestone
 * texture whose setts are nearly a soldier's height across"): every surface used to repeat about every 9.6 m.
 */
const TERRAIN_TILE_M: Readonly<Partial<Record<GarageSurfaceKey, number>>> = Object.freeze({
  cobble: 1.8, grass: 4, rock: 6, sand: 8, snow: 8,
});

function createTerrainGeometry(patch: GarageTerrainPatch, values: Float32Array, tileM = 9.6): THREE.BufferGeometry {
  const positions = new Float32Array(patch.width * patch.height * 3);
  const uvs = new Float32Array(patch.width * patch.height * 2);
  let vertex = 0;
  for (let row = 0; row < patch.height; row += 1) {
    for (let column = 0; column < patch.width; column += 1) {
      const index = row * patch.width + column;
      positions[vertex * 3] = -patch.sizeXM / 2 + (column / (patch.width - 1)) * patch.sizeXM;
      positions[vertex * 3 + 1] = values[index];
      positions[vertex * 3 + 2] = -patch.sizeZM / 2 + (row / (patch.height - 1)) * patch.sizeZM;
      uvs[vertex * 2] = ((column / (patch.width - 1)) * patch.sizeXM) / tileM;
      uvs[vertex * 2 + 1] = ((row / (patch.height - 1)) * patch.sizeZM) / tileM;
      vertex += 1;
    }
  }
  const indices = new Uint16Array((patch.width - 1) * (patch.height - 1) * 6);
  let cursor = 0;
  for (let row = 0; row < patch.height - 1; row += 1) {
    for (let column = 0; column < patch.width - 1; column += 1) {
      const a = row * patch.width + column;
      const b = a + 1; const c = a + patch.width; const d = c + 1;
      indices.set([a, c, b, b, c, d], cursor);
      cursor += 6;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createBuckets(): GeometryBuckets {
  return {
    plaster: [],
    plaster2: [],
    plaster3: [],
    stone: [],
    roof: [],
    wood: [],
    dark: [],
    glass: [],
    baked: [],
    route: [],
  };
}

function normalizeGeometry(source: THREE.BufferGeometry, vertexColors: boolean): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  for (const key of Object.keys(geometry.attributes)) {
    if (!['position', 'normal', 'uv', 'color'].includes(key)) geometry.deleteAttribute(key);
  }
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  if (!geometry.getAttribute('uv')) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(
      new Float32Array(geometry.getAttribute('position').count * 2), 2,
    ));
  }
  if (vertexColors && !geometry.getAttribute('color')) {
    geometry.setAttribute('color', new THREE.BufferAttribute(
      new Float32Array(geometry.getAttribute('position').count * 3).fill(1), 3,
    ));
  }
  if (!vertexColors && geometry.getAttribute('color')) geometry.deleteAttribute('color');
  return geometry;
}

/** Build one authentic, renderer-only Garage scene pack. */
export function buildGarageEnvironment(
  engineCtx: GarageEnvironmentEngineContext,
  assets: GarageEnvironmentAssetLibrary,
  variant: GarageVariant,
  requestRender: () => void = () => {},
  options: Readonly<{ kitPlacement?: GarageKitPlacement | null }> = {},
): GarageEnvironmentBuild {
  const recipe = GARAGE_ENVIRONMENT_RECIPES[variant.architecture]
    || GARAGE_ENVIRONMENT_RECIPES.field_shed;
  const patch = getGarageTerrainPatch(variant.mapId);
  const heights = decodePatch(patch);
  const reliefScale = recipe.reliefScale ?? 1;
  const applyReliefScale = (): void => {
    if (reliefScale === 1) return;
    // Battlefield height is measured at kilometer scale. A Garage excerpt is
    // less than one hundred meters wide, so preserve the exact sampled shape
    // while compressing extreme vertical relief into the showroom camera's
    // readable range. This avoids snowbanks swallowing roofs or blocking the
    // hero without reverting to a fabricated flat plane.
    for (let index = 0; index < heights.length; index += 1) {
      heights[index] *= reliefScale;
    }
  };
  applyReliefScale();
  // Saltmere's quay and shore (2026-10-11, waves 393, 398 and 402: "Saltmere never shows its sea", "a featureless green
  // bank hides the sea"): behind the yard the bank is cut back to a level quay at the datum, and past the quay edge the
  // ground falls to the waterline under the coastal backdrop's sea, so the opening view looks over the quay to open
  // water. A building standing past the edge keeps the quay's level under it (the lighthouse on its point).
  const shapeQuayAndShore = (): void => {
    if (recipe.horizonStyle !== 'coastal') return;
    const keep = recipe.structures.filter((placement) => placement.depth > 12);
    for (let row = 0; row < patch.height; row += 1) {
      const z = -patch.sizeZM / 2 + (row / (patch.height - 1)) * patch.sizeZM;
      for (let column = 0; column < patch.width; column += 1) {
        const x = -patch.sizeXM / 2 + (column / (patch.width - 1)) * patch.sizeXM;
        const { side, depth } = garageWorldPointToView(x, z);
        // (garage r9, the brief's "grass mounds on the quay": the quay runs on to the patch's sides, and the apron right
        // of the turntable, where the downs' shoulder stood 3-6 m over the dock's head, is levelled to the quay too)
        const apron = THREE.MathUtils.smoothstep(side, 9, 15) * THREE.MathUtils.smoothstep(depth, -18, -11);
        if ((depth < 9 && apron <= 0) || Math.abs(side) > 60) continue;
        const index = row * patch.width + column;
        const quay = Math.max(apron, THREE.MathUtils.smoothstep(depth, 9, 15) * (1 - THREE.MathUtils.smoothstep(Math.abs(side), 50, 60)));
        const shoreDepth = 33 + 2.5 * Math.sin(side * 0.13 + 1.1);
        const nearBuilding = keep.some((placement) => Math.hypot(placement.side - side, placement.depth - depth) < 6.5);
        const drop = nearBuilding ? 0 : THREE.MathUtils.smoothstep(depth, shoreDepth - 0.5, shoreDepth + 4.5);
        const target = THREE.MathUtils.lerp(0, -3.4, drop);
        heights[index] = THREE.MathUtils.lerp(heights[index], target, Math.max(quay, drop));
      }
    }
  };
  shapeQuayAndShore();
  const root = new THREE.Group();
  root.name = `garage_environment_${variant.architecture}`;
  root.userData.perfOwner = 'garage/environment';
  root.userData.mode = 'garage-environment';
  root.userData.enclosingSurfaces = 0;
  root.userData.ready = true;
  root.userData.source = 'authentic-garage-scene-pack';
  const seed = hashVariant(variant.id);

  const disposables: Array<{ dispose(): void }> = [];
  const handles: TextureHandle[] = [];
  const track = <T extends { dispose(): void }>(resource: T): T => {
    disposables.push(resource);
    return resource;
  };
  const texturedMaterial = (
    surface: GarageSurfaceKey,
    options: THREE.MeshStandardMaterialParameters,
  ): THREE.MeshStandardMaterial => {
    const handle = assets.acquire(surface, requestRender);
    handles.push(handle);
    const material = new THREE.MeshStandardMaterial({
      ...options,
      map: handle.color,
      normalMap: handle.normal,
      normalScale: new THREE.Vector2(0.45, 0.45),
    });
    engineCtx.setupShadowMaterial?.(material);
    return track(material);
  };
  const plainMaterial = (options: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial(options);
    engineCtx.setupShadowMaterial?.(material);
    return track(material);
  };

  // The scene-level engine sky already owns the exact battlefield atmosphere,
  // cloud decks, color-space handling and PMREM. A second 76 m Garage dome
  // occluded it and compressed to a white card under post-processing. Outdoor
  // packs now contribute only their map-derived relief horizon; the real Sky
  // remains visible with zero additional frame work or Garage-owned textures.
  const atmosphere = atmospherePalette(variant.weather);

  const horizon = new THREE.Mesh(
    track(createBackdropGeometry(patch, heights, seed, atmosphere, recipe, GARAGE_KIT_SKYLINES[variant.architecture] ?? null)),
    track(new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      depthWrite: true,
      fog: false,
      toneMapped: false,
    })),
  );
  horizon.name = 'garage_shared_distant_horizon';
  horizon.receiveShadow = false;
  horizon.castShadow = false;
  horizon.matrixAutoUpdate = false;
  horizon.updateMatrix();
  root.add(horizon);
  // Saltmere's harbour (rejudge6, 2026-10-15: "the sea is flat teal bands"): a lit sea with swell and chop over the
  // backdrop's painted one out to 125 m; neither covers the graving dock, pumped dry
  if (recipe.horizonStyle === 'coastal') {
    const dock = garageDrydockBasin(variant);
    const hole = dock ? { side: dock.side, halfWidth: dock.halfWidth, depth0: dock.depth0, depth1: dock.depth1 } : null;
    if (hole) {
      const backdropMaterial = horizon.material as THREE.MeshBasicMaterial;
      backdropMaterial.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vBackdropWorld;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBackdropWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vBackdropWorld;')
          .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${garageSeaHoleGlsl(hole, 'vBackdropWorld')}`);
      };
      backdropMaterial.customProgramCacheKey = () => 'garage-backdrop-dock-hole-v1';
    }
    const sea = createGarageSea(engineCtx.setupShadowMaterial
      ? (material, hook) => { engineCtx.setupShadowMaterial!(material, hook as THREE.Material['onBeforeCompile']); }
      : null, hole);
    track(sea.geometry);
    track(sea.material as THREE.Material);
    root.add(sea);
  }

  const combined = createBuckets();
  const rng = mulberry32(seed);
  const structureRecords = recipe.structures.map((placement, structureIndex) => {
    // These are authored world-space perimeter stations, not five buildings
    // squeezed into one camera-facing strip. The shared coordinates keep
    // every footprint inside the compact patch while giving the environment
    // a readable 220-degree built horizon from both the hero view and orbit.
    const { x, z } = cameraPoint(placement.side, placement.depth);
    const local = createBuckets();
    const dimensions = placement.builder(rng, local);
    addCatalogExterior(local, {
      id: placement.catalogId,
      info: dimensions,
      variant: structureIndex,
    });
    if (placement.catalogId === 'containerrow') weatherLiveries(local);
    const supports: Array<{ gap: number }> = [];
    for (const value of Object.values(local)) {
      if (!Array.isArray(value)) continue;
      for (const geometry of value) {
        const support = geometry.userData.structureSupport as { gap?: number } | undefined;
        if (support && Number.isFinite(support.gap)) {
          supports.push({ gap: Number(support.gap) });
        }
      }
    }
    const exteriorParts = supports.length;
    const exteriorSupportGap = Math.max(0, ...supports.map((support) => support.gap));
    const collisionAudit = auditStructureCollision(local, dimensions, 'movement', placement.catalogId);
    const assemblyAudit = auditStructureAssembly(local);
    const y = samplePatch(patch, heights, x, z);
    return {
      placement, local, dimensions, x, z, y, exteriorParts, exteriorSupportGap,
      collisionAudit, assemblyAudit,
    };
  });

  // Cut a compact, feathered service terrace beneath each real structure.
  // This preserves the sampled battlefield relief between buildings while
  // preventing a wide hall from bridging a steep slope or floating at one end.
  const shapeStructureTerraces = (): void => {
    for (const { placement, dimensions, x: structureX, z: structureZ, y } of structureRecords) {
      const radiusX = Math.max(3.5, dimensions.w * placement.scale * 0.58 + 1.6);
      const radiusZ = Math.max(3.5, dimensions.d * placement.scale * 0.58 + 1.6);
      for (let row = 0; row < patch.height; row += 1) {
        const z = -patch.sizeZM / 2 + (row / (patch.height - 1)) * patch.sizeZM;
        for (let column = 0; column < patch.width; column += 1) {
          const x = -patch.sizeXM / 2 + (column / (patch.width - 1)) * patch.sizeXM;
          const distance = Math.hypot((x - structureX) / radiusX, (z - structureZ) / radiusZ);
          if (distance >= 1.42) continue;
          const blend = THREE.MathUtils.smoothstep(distance, 0.92, 1.42);
          const index = row * patch.width + column;
          heights[index] = THREE.MathUtils.lerp(y, heights[index], blend);
        }
      }
    }
  };
  shapeStructureTerraces();

  // Terrain-seat the complete service islands before emitting the terrain
  // mesh. Long rails, gantry feet and opposite canopy posts previously each
  // sampled a different battlefield height, producing buried equipment and
  // visibly torn frames on sloped excerpts. These compact feathered terraces
  // preserve the outer map relief while giving every connected assembly one
  // physically coherent support plane.
  const facilityTerraces = getGarageFacilityTerraces(variant);
  const terraceRecords = facilityTerraces.map((terrace) => {
    const center = cameraPoint(terrace.side, terrace.depth);
    // The shared fleet exhibits are authored and seated at the canonical
    // Garage datum. Their outdoor service frames and local terrain must use
    // that same plane; sampling a dune/snowbank here previously raised the
    // frame through the tank while leaving the actual fleet graph at y=0.
    const y = garageTerraceAtDatum(terrace, facilityTerraces)
      ? 0
      : samplePatch(patch, heights, center.x, center.z);
    return { ...terrace, ...center, y };
  });
  const shapeFacilityTerraces = (): void => {
    for (const terrace of terraceRecords) {
      for (let row = 0; row < patch.height; row += 1) {
        const z = -patch.sizeZM / 2 + (row / (patch.height - 1)) * patch.sizeZM;
        for (let column = 0; column < patch.width; column += 1) {
          const x = -patch.sizeXM / 2 + (column / (patch.width - 1)) * patch.sizeXM;
          const { side, depth } = garageWorldPointToView(x, z);
          const distance = Math.hypot(
            (side - terrace.side) / terrace.radiusSide,
            (depth - terrace.depth) / terrace.radiusDepth,
          );
          if (distance >= 1.65) continue;
          const blend = THREE.MathUtils.smoothstep(distance, 1.20, 1.65);
          const index = row * patch.width + column;
          heights[index] = THREE.MathUtils.lerp(terrace.y, heights[index], blend);
        }
      }
    }
  };

  // Cut one continuous, bounded road grade into the sampled battlefield
  // excerpt before the visible route ribbon is emitted. This preserves the
  // source terrain outside the lane but prevents a route from inheriting a
  // near-vertical dune, snow-bank, or urban rubble edge. The first waypoint
  // meets the canonical podium apron and each later waypoint is clamped to a
  // believable ten-percent service-road grade.
  const approachMaxGrade = 0.10;
  const gradeApproachTerrain = (): void => {
    const waypoints = recipe.approach.waypoints.map(([side, depth]) => {
      const world = cameraPoint(side, depth);
      return { side, depth, ...world };
    });
    const targetHeights: number[] = [];
    waypoints.forEach((point, index) => {
      const sampled = samplePatch(patch, heights, point.x, point.z);
      if (index === 0) {
        targetHeights.push(Math.min(sampled, GARAGE_PLATFORM_GEOMETRY.terrainSurfaceYM));
        return;
      }
      const previous = waypoints[index - 1];
      const distance = Math.hypot(point.side - previous.side, point.depth - previous.depth);
      const previousHeight = targetHeights[index - 1];
      const delta = distance * approachMaxGrade;
      targetHeights.push(THREE.MathUtils.clamp(
        sampled,
        previousHeight - delta,
        previousHeight + delta,
      ));
    });
    const railFanExtent = recipe.approach.style === 'rail-fan'
      ? Math.max(0, ...(recipe.approach.lanes || []).map((lane) => Math.abs(lane)))
      : 0;
    const innerRadius = recipe.approach.width / 2 + railFanExtent;
    const feather = 2.2;
    for (let row = 0; row < patch.height; row += 1) {
      const z = -patch.sizeZM / 2 + (row / (patch.height - 1)) * patch.sizeZM;
      for (let column = 0; column < patch.width; column += 1) {
        const x = -patch.sizeXM / 2 + (column / (patch.width - 1)) * patch.sizeXM;
        const view = garageWorldPointToView(x, z);
        let closestDistance = Number.POSITIVE_INFINITY;
        let targetHeight = heights[row * patch.width + column];
        for (let index = 0; index < waypoints.length - 1; index += 1) {
          const a = waypoints[index];
          const b = waypoints[index + 1];
          const sideDelta = b.side - a.side;
          const depthDelta = b.depth - a.depth;
          const lengthSquared = sideDelta * sideDelta + depthDelta * depthDelta;
          const along = THREE.MathUtils.clamp(
            ((view.side - a.side) * sideDelta + (view.depth - a.depth) * depthDelta)
              / Math.max(0.001, lengthSquared),
            0,
            1,
          );
          const nearestSide = a.side + sideDelta * along;
          const nearestDepth = a.depth + depthDelta * along;
          const distance = Math.hypot(view.side - nearestSide, view.depth - nearestDepth);
          if (distance >= closestDistance) continue;
          closestDistance = distance;
          targetHeight = THREE.MathUtils.lerp(
            targetHeights[index], targetHeights[index + 1], along,
          );
        }
        if (closestDistance >= innerRadius + feather) continue;
        const blend = THREE.MathUtils.smoothstep(
          closestDistance,
          innerRadius,
          innerRadius + feather,
        );
        const sampleIndex = row * patch.width + column;
        heights[sampleIndex] = THREE.MathUtils.lerp(targetHeight, heights[sampleIndex], blend);
      }
    }
  };
  gradeApproachTerrain();
  // Service islands win over the graded road wherever the two intentionally
  // meet, keeping every gantry foot and real fleet exhibit on its own datum.
  shapeFacilityTerraces();
  // Saltmere's graving dock (the re-judge, 2026-10-15: "the hero frame shows no drydock (no basin, water or caisson)"):
  // the ground under the basin, its paving and the channel past its caisson is cut to the dock's own profile
  // (garageDrydockGround), which keeps every terrain triangle under the altars, the head wall and the paving.
  const drydock = garageDrydockBasin(variant);
  const carveDrydock = (): void => {
    if (!drydock) return;
    for (let row = 0; row < patch.height; row += 1) {
      const z = -patch.sizeZM / 2 + (row / (patch.height - 1)) * patch.sizeZM;
      for (let column = 0; column < patch.width; column += 1) {
        const x = -patch.sizeXM / 2 + (column / (patch.width - 1)) * patch.sizeXM;
        const { side, depth } = garageWorldPointToView(x, z);
        const index = row * patch.width + column;
        const cut = garageDrydockGround(drydock, side, depth, heights[index]);
        if (cut !== null) heights[index] = cut;
      }
    }
  };
  carveDrydock();
  // Glacier's tunnel (the re-judge, 2026-10-15: "a flat-topped snow-white band at floor level" at the bore's far end, the
  // hill's ground standing up through the floor): the ground in the bore and a terrain diagonal (3.4 m) beyond its walls
  // is lowered to the mouth's level, under the floor slab, all of it inside the cliff (garageRockKit.ts)
  const carveTunnelBore = (): void => {
    const bore = garageTunnelBore(variant);
    if (!bore) return;
    const mouth = cameraPoint(bore.side, bore.depth0);
    const floorY = samplePatch(patch, heights, mouth.x, mouth.z) + 0.04;
    for (let row = 0; row < patch.height; row += 1) {
      const z = -patch.sizeZM / 2 + (row / (patch.height - 1)) * patch.sizeZM;
      for (let column = 0; column < patch.width; column += 1) {
        const x = -patch.sizeXM / 2 + (column / (patch.width - 1)) * patch.sizeXM;
        const { side, depth } = garageWorldPointToView(x, z);
        if (Math.abs(side - bore.side) < bore.half + 3.4 && depth > bore.depth0 + 0.3 && depth < bore.depth0 + bore.length + 3.0) {
          const index = row * patch.width + column;
          heights[index] = Math.min(heights[index], floorY);
        }
      }
    }
  };
  carveTunnelBore();

  // The podium is a physical object with its bottom at y=0. Re-apply one
  // canonical circular exclusion after every structure/facility terrace has
  // shaped the map excerpt so snowbanks, dunes, and steep source samples can
  // never rise through its side wall. The feather remains outside the base and
  // preserves the authored terrain beyond the immediate display apron.
  const shapePlatformTerrain = (): number => {
    let maxPlatformTerrainY = Number.NEGATIVE_INFINITY;
    for (let row = 0; row < patch.height; row += 1) {
      const z = -patch.sizeZM / 2 + (row / (patch.height - 1)) * patch.sizeZM;
      for (let column = 0; column < patch.width; column += 1) {
        const x = -patch.sizeXM / 2 + (column / (patch.width - 1)) * patch.sizeXM;
        const index = row * patch.width + column;
        heights[index] = garagePlatformTerrainHeight(x, z, heights[index]);
        if (Math.hypot(x, z) <= GARAGE_PLATFORM_GEOMETRY.baseRadiusM) {
          maxPlatformTerrainY = Math.max(maxPlatformTerrainY, heights[index]);
        }
      }
    }
    return maxPlatformTerrainY;
  };
  const maxPlatformTerrainY = shapePlatformTerrain();
  const platformGroundMaxY = Math.max(
    maxPlatformTerrainY,
    GARAGE_PLATFORM_GEOMETRY.groundSurfaceYM,
  );
  const platformGroundClearanceM = Math.max(0, -platformGroundMaxY);

  // A later terrace's feather can reach into an earlier terrace even when
  // their actual equipment footprints do not overlap. Re-seat every exact
  // support plane after all feathering is complete so long rails and station
  // frames cannot inherit a neighbouring facility's grade. Authored inner
  // footprints are disjoint (audited below), so this pass is deterministic.
  const reseatFacilityTerraces = (): void => {
    for (const terrace of terraceRecords) {
      for (let row = 0; row < patch.height; row += 1) {
        const z = -patch.sizeZM / 2 + (row / (patch.height - 1)) * patch.sizeZM;
        for (let column = 0; column < patch.width; column += 1) {
          const x = -patch.sizeXM / 2 + (column / (patch.width - 1)) * patch.sizeXM;
          const { side, depth } = garageWorldPointToView(x, z);
          const distance = Math.hypot(
            (side - terrace.side) / terrace.radiusSide,
            (depth - terrace.depth) / terrace.radiusDepth,
          );
          if (distance <= 1.20) heights[row * patch.width + column] = terrace.y;
        }
      }
    }
  };
  reseatFacilityTerraces();
  // the reseat levels every facility terrace's core back to its datum; the dock and the bore are cut again after it
  carveDrydock();
  carveTunnelBore();


  const measurePlacementQuality = (): {
    readonly placementOverlaps: number;
    readonly maxGroundContactErrorM: number;
  } => {
    let placementOverlaps = 0;
    for (const structure of structureRecords) {
      const radius = Math.hypot(
        structure.dimensions.w * structure.placement.scale,
        structure.dimensions.d * structure.placement.scale,
      ) * 0.48;
      const { side: structureSide, depth: structureDepth } = garageWorldPointToView(
        structure.x,
        structure.z,
      );
      for (const terrace of terraceRecords) {
        const distance = Math.hypot(
          (structureSide - terrace.side) / (radius + terrace.radiusSide + 0.8),
          (structureDepth - terrace.depth) / (radius + terrace.radiusDepth + 0.8),
        );
        if (distance < 1) placementOverlaps += 1;
      }
    }
    let maxGroundContactErrorM = 0;
    for (const terrace of terraceRecords) {
      // the small yard floors are audited at every kit foot instead (garageBayFloor.selftest.mjs)
      if (terrace.label.startsWith('crew-floor-')) continue;
      for (const [sideOffset, depthOffset] of [[0, 0], [-0.55, -0.55], [0.55, -0.55],
        [-0.55, 0.55], [0.55, 0.55]] as const) {
        const point = cameraPoint(
          terrace.side + terrace.radiusSide * sideOffset,
          terrace.depth + terrace.radiusDepth * depthOffset,
        );
        maxGroundContactErrorM = Math.max(maxGroundContactErrorM,
          Math.abs(samplePatch(patch, heights, point.x, point.z) - terrace.y));
      }
    }
    return { placementOverlaps, maxGroundContactErrorM };
  };
  const { placementOverlaps, maxGroundContactErrorM } = measurePlacementQuality();

  const terrainGeometry = track(createTerrainGeometry(patch, heights, TERRAIN_TILE_M[recipe.terrainSurface] ?? 9.6));
  // Monsoon's ground is wet (garage round 7, place-truth; the critic panel, 2026-10-14: "a dry, sunny dirt yard with no
  // wet sheen"): the grass, the causeway and the yard take a damp sheen and the yard's puddles a polish (the wet mask)
  const rainSoaked = variant.weather === 'rain';
  const terrain = new THREE.Mesh(terrainGeometry, texturedMaterial(recipe.terrainSurface, {
    color: recipe.terrainTint, roughness: rainSoaked ? 0.8 : 0.94, metalness: 0,
  }));
  terrain.name = 'map_derived_terrain_patch';
  terrain.receiveShadow = true;
  root.add(terrain);

  // The paved apron drapes onto the shaped terrain (2026-10-10, wave 338: a hard-edged "decal patch" in the sand was
  // the old 29 x 24 m box's corner standing proud over a dip). Inside the podium's terrain-clear ring it lies at the
  // canonical ground surface as before; beyond, 2 cm over the terrain, so no edge ever floats. Paved slabs under the
  // four fleet exhibits' pads join it in the same mesh and mapping (wave 338: "bay lines painted onto grass").
  // Where the ground rises more than 0.45 m above the datum the pavement stops: its vertices there sink 6 cm under the
  // terrain, so the visible edge is the line where the two surfaces cross, following the slope's contour (2026-10-11,
  // wave 398: the old cut left "jagged polygon edges" and "blotchy slabs with ragged hard rims").
  const APRON_RISE_LIMIT_M = 0.45;
  const apronHeightAt = (x: number, z: number): number => {
    const ground = samplePatch(patch, heights, x, z);
    // in the drydock's cut the yard's floor follows the cut ground under the dock's own granite
    if (drydock) {
      const { side, depth } = garageWorldPointToView(x, z);
      if (garageDrydockGround(drydock, side, depth, ground) !== null) return ground + 0.02;
    }
    if (ground > APRON_RISE_LIMIT_M) return ground - 0.06;
    return Math.max(ground, GARAGE_PLATFORM_GEOMETRY.terrainSurfaceYM) + 0.02;
  };
  // The apron reaches past the camera's near ground on every side (GA.03, the garage critic panel 2026-10-14: "the graded
  // pad ends in a hard diagonal with raw grass or scrub in the lower left"): the old 29 x 24 m rectangle's +z edge crossed
  // the canonical frame's lower left (the camera stands 18 m out on the view axis, its frame's foot 13.5 m short of the
  // turntable), so the yard ended in frame. At 36 x 36 m the frame's foot and both sides of its lower half lie on worked
  // ground for every hull the showroom frames; the yard's texel layout keeps its 29 x 24 m canvas, read mirrored beyond it.
  // The apron lies on the terrain's own grid and triangulation, 2 cm over it, so it drapes exactly (a finer grid of its
  // own bridged the terrain's cells and stood up to 6 cm proud of a pad's feather) and costs fewer triangles.
  const APRON_HALF_M = 18;
  const apronGeometry = (() => {
    const cellX = patch.sizeXM / (patch.width - 1), cellZ = patch.sizeZM / (patch.height - 1);
    const i0 = Math.max(0, Math.floor((patch.sizeXM / 2 - APRON_HALF_M) / cellX) - 1);
    const i1 = Math.min(patch.width - 1, Math.ceil((patch.sizeXM / 2 + APRON_HALF_M) / cellX) + 1);
    const j0 = Math.max(0, Math.floor((patch.sizeZM / 2 - APRON_HALF_M) / cellZ) - 1);
    const j1 = Math.min(patch.height - 1, Math.ceil((patch.sizeZM / 2 + APRON_HALF_M) / cellZ) + 1);
    const columns = i1 - i0 + 1, rows = j1 - j0 + 1;
    const vertices = new Float32Array(columns * rows * 3);
    const indices: number[] = [];
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < columns; i += 1) {
        const at = (j * columns + i) * 3;
        vertices[at] = -patch.sizeXM / 2 + (i0 + i) * cellX;
        vertices[at + 2] = -patch.sizeZM / 2 + (j0 + j) * cellZ;
        if (i < columns - 1 && j < rows - 1) {
          // the terrain's own diagonal (createTerrainGeometry), counter-clockwise seen from above
          const a = j * columns + i, b = a + 1, c = a + columns, d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(columns * rows * 2), 2));
    geometry.setIndex(indices);
    return geometry;
  })();
  {
    const positions = apronGeometry.getAttribute('position');
    const uvs = apronGeometry.getAttribute('uv');
    for (let index = 0; index < positions.count; index += 1) {
      uvs.setXY(index, positions.getX(index) / 29 + 0.5, 0.5 - positions.getZ(index) / 24);
    }
  }
  {
    // The worked yard thins out into the terrain (wave 408: "a ruler-straight seam ... where the textured foreground
    // snow meets a flat, pale, untextured snow plane"): each vertex's share of worked ground falls to nothing over the
    // apron's outer 2.4 m and as the ground climbs toward the rise limit, so neither the rectangle's edge nor the
    // slope's crossing line shows; garageHardstandGradedHook breaks the ramp into an irregular margin.
    const positions = apronGeometry.getAttribute('position');
    const blend = new Float32Array(positions.count);
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index), z = positions.getZ(index);
      positions.setY(index, apronHeightAt(x, z));
      const edge = (APRON_HALF_M - Math.max(Math.abs(x), Math.abs(z))) / GARAGE_HARDSTAND_FEATHER_M;
      const ground = samplePatch(patch, heights, x, z);
      const rise = 1 - THREE.MathUtils.smoothstep(ground, 0.18, APRON_RISE_LIMIT_M - 0.01);
      blend[index] = THREE.MathUtils.clamp(edge, 0, 1) * rise;
    }
    apronGeometry.setAttribute('hardstandBlend', new THREE.BufferAttribute(blend, 1));
  }
  const slabGeometries: THREE.BufferGeometry[] = [];
  // Every fleet exhibit stands on worked ground (wave 408, Ironworks' K2: "an open-earth yard still needs a compacted
  // working surface ... graded into the terrain, with no hard slab edge"): the yard's own floor reaches 1.32 radii over
  // each pad, draped on the levelled core and its feather, and thins out from 0.9 radii (the slab kinds' joints, the
  // earth kinds' ruts and grit). The old pads were cut discs (wave 402: "a hard-edged darker sand patch").
  const PAD_REACH = 1.32;
  const PAD_RINGS = [[0, 1], [0.5, 1], [0.68, 1], [0.84, 0.45], [1, 0]] as const;
  for (const terrace of terraceRecords) {
    if (!terrace.label.startsWith('fleet-service-')) continue;
    const segments = 48;
    const positions: number[] = [];
    const uvs: number[] = [];
    const blends: number[] = [];
    const ringPoint = (ring: number, segment: number): [number, number, number, number] => {
      const angle = (segment / segments) * Math.PI * 2;
      // a broad, even irregularity only (wave 398: no ragged rim)
      const wobble = 1 + 0.05 * Math.sin(angle * 2 + terrace.side) + 0.025 * Math.sin(angle * 3 + terrace.depth);
      const [radius, share] = PAD_RINGS[ring];
      const lx = Math.cos(angle) * radius * wobble * terrace.radiusSide * PAD_REACH;
      const lz = Math.sin(angle) * radius * wobble * terrace.radiusDepth * PAD_REACH;
      const cos = Math.cos(GARAGE_CAMERA_AZIMUTH_RAD), sin = Math.sin(GARAGE_CAMERA_AZIMUTH_RAD);
      const x = terrace.x + lx * cos + lz * sin;
      const z = terrace.z - lx * sin + lz * cos;
      return [x, z, share, radius];
    };
    const push = ([x, z, share, radius]: [number, number, number, number]): void => {
      // the level core (1.2 radii, wobble included) lies on the pad's datum; the margin drapes over the terrain's feather
      const y = (radius * PAD_REACH * 1.075 <= 1.2 ? terrace.y : samplePatch(patch, heights, x, z)) + 0.02;
      positions.push(x, y, z);
      uvs.push(x / 29 + 0.5, 0.5 - z / 24);
      blends.push(share);
    };
    for (let ring = 0; ring < PAD_RINGS.length - 1; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const a = ringPoint(ring, segment), b = ringPoint(ring, segment + 1);
        const c = ringPoint(ring + 1, segment), d = ringPoint(ring + 1, segment + 1);
        // counter-clockwise seen from above, so the floor faces up
        if (ring > 0) { push(a); push(b); push(c); }
        push(b); push(d); push(c);
      }
    }
    const slab = new THREE.BufferGeometry();
    slab.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    slab.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    slab.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3));
    slab.setAttribute('hardstandBlend', new THREE.Float32BufferAttribute(blends, 1));
    slabGeometries.push(slab);
  }
  // The pavement stops at the foot of a rise (2026-10-10, wave 357: Saltmere's draped apron climbed a hill behind the
  // hero as "a shapeless grey tarp heap"): above 0.45 m the apron sinks under the terrain (apronHeightAt), so the slope
  // keeps its own ground and the pavement's edge follows its contour.
  const apronNonIndexed = (() => {
    const flat = apronGeometry.toNonIndexed();
    const positions = flat.getAttribute('position');
    const uvs = flat.getAttribute('uv');
    const blends = flat.getAttribute('hardstandBlend');
    const keptPositions: number[] = [];
    const keptUvs: number[] = [];
    const keptBlends: number[] = [];
    for (let triangle = 0; triangle < positions.count; triangle += 3) {
      let highest = -Infinity;
      let worked = 0;
      for (let corner = 0; corner < 3; corner += 1) {
        highest = Math.max(highest, positions.getY(triangle + corner));
        worked = Math.max(worked, blends.getX(triangle + corner));
      }
      if (highest > 6 || worked === 0) continue; // a cliff cell or ground the yard never reaches: nothing to pave
      for (let corner = 0; corner < 3; corner += 1) {
        keptPositions.push(positions.getX(triangle + corner), positions.getY(triangle + corner), positions.getZ(triangle + corner));
        keptUvs.push(uvs.getX(triangle + corner), uvs.getY(triangle + corner));
        keptBlends.push(blends.getX(triangle + corner));
      }
    }
    flat.dispose();
    const trimmed = new THREE.BufferGeometry();
    trimmed.setAttribute('position', new THREE.Float32BufferAttribute(keptPositions, 3));
    trimmed.setAttribute('uv', new THREE.Float32BufferAttribute(keptUvs, 2));
    trimmed.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(keptPositions.length), 3));
    trimmed.setAttribute('hardstandBlend', new THREE.Float32BufferAttribute(keptBlends, 1));
    return trimmed;
  })();
  apronGeometry.dispose();
  const hardstandGeometry = mergeGeometries([apronNonIndexed, ...slabGeometries], false) ?? apronNonIndexed;
  if (hardstandGeometry !== apronNonIndexed) apronNonIndexed.dispose();
  for (const slab of slabGeometries) slab.dispose();
  hardstandGeometry.computeVertexNormals();
  track(hardstandGeometry);
  // This Garage's own floor (garageYardWear.ts): a per-pack albedo over the apron's texel layout (slab joints or
  // earth, the yard's working history with its track lanes down this pack's approach road, the region's sand, snow,
  // salt, cinders, soot, mud or dust) and the shared normal for its floor kind, on the stock map + normal program.
  const hardstandStyle = GARAGE_HARDSTAND_STYLES[variant.architecture];
  const [approachSide, approachDepth] = recipe.approach.waypoints[0];
  // The floor fills 40 % of the Garage frame at a grazing angle (the garage critic panel, 2026-10-14: "16x anisotropic
  // filtering"): its own textures filter at the device's best anisotropy where the device allows 8 or more (three clamps
  // to the device's maximum); weaker devices keep the engine's setting.
  const floorAnisotropy = (engineCtx.anisotropy ?? 4) >= 8 ? 16 : (engineCtx.anisotropy ?? 4);
  const hardstandAlbedo = garageHardstandAlbedo(hardstandStyle, garageViewPoint(approachSide, approachDepth),
    floorAnisotropy);
  const hardstandNormalKind = garageHardstandNormalKind(hardstandStyle);
  const hardstandNormal = garageHardstandNormal(hardstandNormalKind, floorAnisotropy);
  // The floor's detail layer (garageHardstandProgram.ts): this ground type's relief and albedo at a real scale. Its shared
  // uniform starts level and sharpens every floor of the kind when the relief exists: generated at Garage idle (the
  // stage), or here after the pack's first frame, never on the visit's critical path.
  const hardstandDetailKind = garageHardstandDetailKind(hardstandStyle);
  const hardstandDetail = { uniform: garageHardstandDetailUniform(hardstandDetailKind), kind: hardstandDetailKind };
  if (typeof document !== 'undefined' && hardstandDetail.uniform.value?.userData.sharedGarageHardstandDetail !== hardstandDetailKind) {
    const generate = (): void => {
      garageHardstandDetailTexture(hardstandDetailKind, floorAnisotropy);
      requestRender();
    };
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof idle === 'function') idle(generate, { timeout: 1500 });
    else setTimeout(generate, 600);
  }
  // Monsoon's puddles: the yard's wet mask (null in every dry yard) and the whole yard damp
  const hardstandWetMaskTexture = garageHardstandWetMask(hardstandStyle);
  const hardstandWet = hardstandWetMaskTexture ? { mask: track(hardstandWetMaskTexture), amount: 1 } : null;
  // the snow yards sparkle (packed snow most, the crushed rock with snow in its hollows less)
  const hardstandSparkle = hardstandStyle === 'earth-snow' ? 1 : hardstandStyle === 'gravel-snow' ? 0.6
    : hardstandStyle === 'slab-snow' ? 0.5 : 0;
  // The graded floor (garageHardstandGradedHook) blends over the terrain: transparent, writing no depth, drawn before the
  // floor decals (renderOrder -1), on its own program, which garageStage.ts compiles with the outdoor seeds.
  const gradedMaterial = (options: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial({ ...options, transparent: true, depthWrite: false });
    // the grain is subtler on packed snow than on earth and concrete
    const grainStrength = hardstandNormalKind === 'snow' ? 0.32 : hardstandNormalKind === 'slab' ? 0.5 : 0.62;
    engineCtx.setupShadowMaterial?.(material, garageHardstandGradedHook(garageHardstandGrainTexture(floorAnisotropy), grainStrength,
      hardstandDetail, hardstandWet, hardstandSparkle) as THREE.Material['onBeforeCompile']);
    material.customProgramCacheKey = () => GARAGE_HARDSTAND_PROGRAM_KEY;
    return track(material);
  };
  const hardstandMaterial = hardstandAlbedo && hardstandNormal
    ? gradedMaterial({
      map: track(hardstandAlbedo), normalMap: hardstandNormal,
      normalScale: hardstandNormalKind === 'slab' ? new THREE.Vector2(0.6, 0.6)
        : hardstandNormalKind === 'snow' ? new THREE.Vector2(0.3, 0.3) : new THREE.Vector2(0.45, 0.45),
      roughness: 0.94, metalness: 0.02,
    })
    : texturedMaterial('plaster', { color: recipe.hardstandTint, roughness: 0.94, metalness: 0.02 });
  hardstandMaterial.polygonOffset = true;
  hardstandMaterial.polygonOffsetFactor = -1;
  hardstandMaterial.polygonOffsetUnits = -1;
  const hardstand = new THREE.Mesh(hardstandGeometry, hardstandMaterial);
  hardstand.name = 'connected_service_hardstand';
  hardstand.renderOrder = -1;
  hardstand.userData.drapedOnTerrain = true;
  hardstand.userData.gradedEdges = hardstandMaterial.transparent;
  hardstand.userData.fleetPadSlabs = slabGeometries.length;
  hardstand.userData.hardstandStyle = hardstandStyle;
  root.userData.serviceYardWear = hardstandStyle;
  hardstand.receiveShadow = true;
  hardstand.matrixAutoUpdate = false;
  hardstand.updateMatrix();
  root.add(hardstand);

  // Static battlefield ground cover sits outside the service hardstand. A
  // single three-triangle tuft is instanced across the real terrain and color
  // graded to the selected biome. It is intentionally windless in Garage:
  // one draw, no alpha sorting, no animation wake-up and no shadow shimmer.
  const addGroundCover = (): number => {
    const groundCoverCount = recipe.terrainSurface === 'grass' ? 240
      : recipe.terrainSurface === 'snow' ? 112
        : recipe.terrainSurface === 'cobble' ? 48 : 96;
    const groundCoverGeometry = track(createGroundCoverGeometry());
    const groundCoverMaterial = plainMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    const groundCover = new THREE.InstancedMesh(
      groundCoverGeometry,
      groundCoverMaterial,
      groundCoverCount,
    );
    groundCover.name = 'static_battlefield_ground_cover';
    const coverBase = recipe.terrainSurface === 'grass' ? new THREE.Color(recipe.terrainTint).offsetHSL(-0.03, 0.04, -0.1)
      : recipe.terrainSurface === 'snow' ? new THREE.Color(0x716d58)
        : recipe.terrainSurface === 'sand' ? new THREE.Color(0x8d744d)
          : recipe.terrainSurface === 'rock' ? new THREE.Color(0x705d49)
            : new THREE.Color(0x59604d);
    const coverMatrix = new THREE.Matrix4();
    const coverPosition = new THREE.Vector3();
    const coverQuaternion = new THREE.Quaternion();
    const coverScale = new THREE.Vector3();
    const coverUp = new THREE.Vector3(0, 1, 0);
    let groundCoverIndex = 0;
    let groundCoverAttempts = 0;
    const placeGroundCoverInstance = (): void => {
      const angle = rng() * Math.PI * 2;
      const radius = Math.sqrt(17 * 17 + rng() * (44 * 44 - 17 * 17));
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const insideStructure = structureRecords.some((record) => (
        Math.abs(x - record.x) < record.dimensions.w * record.placement.scale * 0.62 + 0.8
        && Math.abs(z - record.z) < record.dimensions.d * record.placement.scale * 0.62 + 0.8
      ));
      if (insideStructure) return;
      // no tufts on the working floors (2026-10-10, wave 357: "black spikes stud the sand"): the apron and every
      // exhibit or crew pad stay clear
      if (Math.abs(x) < 15 && Math.abs(z) < 12.5) return;
      const view = garageWorldPointToView(x, z);
      const onPad = terraceRecords.some((terrace) => (
        (terrace.label.startsWith('fleet-service-') || terrace.label.startsWith('crew-floor-'))
        && Math.hypot((view.side - terrace.side) / terrace.radiusSide, (view.depth - terrace.depth) / terrace.radiusDepth) < 1.3
      ));
      if (onPad) return;
      // nor in Saltmere's dock or through its granite paving
      if (drydock && garageDrydockGround(drydock, view.side, view.depth, 0) !== null) return;
      const y = samplePatch(patch, heights, x, z);
      const size = (recipe.terrainSurface === 'grass' ? 0.52 : 0.34) * (0.68 + rng() * 0.62);
      coverPosition.set(x, y + 0.01, z);
      coverQuaternion.setFromAxisAngle(coverUp, rng() * Math.PI * 2);
      coverScale.set(size * (0.72 + rng() * 0.45), size, size * (0.72 + rng() * 0.45));
      groundCover.setMatrixAt(groundCoverIndex,
        coverMatrix.compose(coverPosition, coverQuaternion, coverScale));
      groundCover.setColorAt(groundCoverIndex, coverBase.clone().offsetHSL(
        (rng() - 0.5) * 0.035,
        (rng() - 0.5) * 0.08,
        (rng() - 0.5) * 0.09,
      ));
      groundCoverIndex += 1;
    };
    while (groundCoverIndex < groundCoverCount && groundCoverAttempts < groundCoverCount * 12) {
      groundCoverAttempts += 1;
      placeGroundCoverInstance();
    }
    groundCover.count = groundCoverIndex;
    groundCover.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    groundCover.instanceMatrix.needsUpdate = true;
    if (groundCover.instanceColor) groundCover.instanceColor.needsUpdate = true;
    groundCover.castShadow = false;
    groundCover.receiveShadow = true;
    groundCover.computeBoundingBox();
    groundCover.computeBoundingSphere();
    groundCover.matrixAutoUpdate = false;
    groundCover.updateMatrix();
    root.add(groundCover);
    return groundCoverIndex;
  };
  const groundCoverIndex = addGroundCover();

  const mergeStructureRecords = (): void => {
    for (const { placement, local, x, z, y } of structureRecords) {
      // A desert minaret is mud-plastered to its dome (2026-10-10, waves 338 and 357: the white shaft under a red tiled
      // cap read as "a red-capped lighthouse standing among the dunes"): on sand packs its dome and lantern take the
      // shaft's adobe, one shade deeper than the courts' lime wash.
      if (placement.catalogId === 'minaret' && recipe.terrainSurface === 'sand') {
        local.plaster2 = [...(local.plaster2 || []), ...(local.roof || []), ...(local.plaster || []), ...(local.stone || [])];
        local.roof = [];
        local.plaster = [];
        local.stone = [];
      }
      const uniformScale = placement.scale;
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw),
        new THREE.Vector3(uniformScale, uniformScale, uniformScale),
      );
      for (const key of BUCKET_KEYS) {
        for (const geometry of local[key] || []) {
          geometry.applyMatrix4(transform);
          combined[key]!.push(geometry);
        }
      }
    }
  };
  mergeStructureRecords();

  // The buildings sit in their ground (GA.03; the garage critic panel, 2026-10-14: "no cast shadows or contact darkening,
  // so the building looks pasted on ... AO at the base of every structure"; the scenery stays out of the live casters for
  // the first visit's sake): a soft dark band 2.4 m wide round every structure's footprint, four strips from just inside
  // its walls outward (the corners darken twice, as ground does there), in one decal draw on the contact shadows' program.
  const addStructureBaseShade = (): void => {
    if (typeof document === 'undefined') return;
    // v runs out from the wall, u along it: a band's middle (u 0.5) is full strength along the wall, its ends (u 0.5 to
    // 1) fade out past the corners, so no band ends in a hard cut and two bands meeting at a corner blend round it (the
    // re-judge, 2026-10-15: "hard-edged near-black rectangles" under the buildings from above)
    const S = 64, U = 32;
    const data = new Uint8Array(4 * S * U);
    for (let row = 0; row < S; row += 1) {
      const t = (row + 0.5) / S;
      for (let column = 0; column < U; column += 1) {
        const along = Math.max(0, ((column + 0.5) / U - 0.5) / 0.5);
        data[(row * U + column) * 4 + 3] = Math.round(255 * (1 - t) * (1 - t) * (1 - along) * (1 - along));
      }
    }
    const texture = track(new THREE.DataTexture(data, U, S, THREE.RGBAFormat));
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    const positions: number[] = [], uvs: number[] = [];
    const margin = 2.4, inset = 0.15; // (1.2 m at 0.46 did not read from the Garage camera: the re-judge, 2026-10-15)
    // open, round or stilted structures keep their own ground (a square band round a water tower's legs would be paint)
    const open = new Set(['watertower', 'gantry', 'netyard', 'lighthouse', 'minaret', 'stack', 'parkingdeck']);
    for (const { placement, dimensions, x, z, y } of structureRecords) {
      if (open.has(placement.catalogId)) continue;
      const hw = dimensions.w * placement.scale / 2, hd = dimensions.d * placement.scale / 2;
      const c = Math.cos(placement.yaw), sn = Math.sin(placement.yaw);
      const at = (lx: number, lz: number): [number, number, number] => [x + c * lx + sn * lz, y + 0.04, z - sn * lx + c * lz];
      // each side: [wall start, wall end] along the wall, and its outward direction
      const sides: Array<[[number, number], [number, number], [number, number]]> = [
        [[-hw - margin, hd - inset], [hw + margin, hd - inset], [0, 1]],
        [[hw + margin, -hd + inset], [-hw - margin, -hd + inset], [0, -1]],
        [[hw - inset, hd + margin], [hw - inset, -hd - margin], [1, 0]],
        [[-hw + inset, -hd - margin], [-hw + inset, hd + margin], [-1, 0]],
      ];
      for (const [[ax, az], [bx, bz], [ox, oz]] of sides) {
        const reach = margin + inset;
        const length = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / length, dz = (bz - az) / length;
        // three pieces along the wall: the end past one corner (fading in), the wall's own run, the end past the other
        const cuts: Array<[number, number, number, number]> = [
          [0, margin, 1, 0.5], [margin, length - margin, 0.5, 0.5], [length - margin, length, 0.5, 1],
        ];
        for (const [s0, s1, u0, u1] of cuts) {
          const p0x = ax + dx * s0, p0z = az + dz * s0, p1x = ax + dx * s1, p1z = az + dz * s1;
          const a = at(p0x, p0z), b = at(p1x, p1z), b2 = at(p1x + ox * reach, p1z + oz * reach), a2 = at(p0x + ox * reach, p0z + oz * reach);
          // two triangles, counter-clockwise seen from above (the winding is fixed below if a side comes out reversed)
          const quad = [a, b, b2, a, b2, a2];
          const quv = [[u0, 0], [u1, 0], [u1, 1], [u0, 0], [u1, 1], [u0, 1]];
          const ux = b[0] - a[0], uz = b[2] - a[2], vx = a2[0] - a[0], vz = a2[2] - a[2];
          const up = uz * vx - ux * vz; // the y of (b - a) x (a2 - a)
          const order = up >= 0 ? [0, 1, 2, 3, 4, 5] : [0, 2, 1, 3, 5, 4];
          for (const k of order) {
            positions.push(...quad[k]);
            uvs.push(quv[k][0], quv[k][1]);
          }
        }
      }
    }
    if (!positions.length) return;
    const geometry = track(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    const material = track(new THREE.MeshBasicMaterial({
      map: texture, color: 0x000000, transparent: true, opacity: 0.52, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    material.name = 'garage:structure-base-shade';
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'garage_structure_base_shade';
    mesh.renderOrder = 1;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    root.add(mesh);
  };
  addStructureBaseShade();
  // Sand and snow banked against the buildings' walls in the sand and snow yards (the re-judge, 2026-10-15, Sirocco: the
  // plaster wall behind the gun had "no weathering, sand-drift line at the base"): a low drift along each wall's foot,
  // deepest at the wall, thinning out a metre and a half from it, uneven along its run, in the baked bucket
  const addStructureDrifts = (): void => {
    const style = GARAGE_HARDSTAND_STYLES[variant.architecture];
    const sand = style === 'earth-sand' || style === 'slab-sand';
    const snow = style === 'earth-snow' || style === 'gravel-snow' || style === 'slab-snow';
    if (!sand && !snow) return;
    const light = new THREE.Color(sand ? 0xd8bf8e : 0xedf2f5), dark = new THREE.Color(sand ? 0xc4a470 : 0xd3dde4);
    const open = new Set(['watertower', 'gantry', 'netyard', 'lighthouse', 'minaret', 'stack', 'parkingdeck']);
    const positions: number[] = [], colors: number[] = [], tone = new THREE.Color();
    let wobble = seed % 97;
    for (const { placement, dimensions, x, z } of structureRecords) {
      if (open.has(placement.catalogId)) continue;
      const hw = dimensions.w * placement.scale / 2, hd = dimensions.d * placement.scale / 2;
      const c = Math.cos(placement.yaw), sn = Math.sin(placement.yaw);
      const at = (lx: number, lz: number, lift: number): [number, number, number] => {
        const wx = x + c * lx + sn * lz, wz = z - sn * lx + c * lz;
        return [wx, samplePatch(patch, heights, wx, wz) + lift, wz];
      };
      // each wall: its run from one corner to the other and its outward direction
      const walls: Array<[[number, number], [number, number], [number, number]]> = [
        [[-hw, hd], [hw, hd], [0, 1]], [[hw, -hd], [-hw, -hd], [0, -1]], [[hw, hd], [hw, -hd], [1, 0]], [[-hw, -hd], [-hw, hd], [-1, 0]],
      ];
      for (const [[ax, az], [bx, bz], [ox, oz]] of walls) {
        const length = Math.hypot(bx - ax, bz - az), steps = Math.max(2, Math.round(length / 1.2));
        const row = (k: number): Array<[number, number, number, number]> => {
          const t = k / steps, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
          wobble += 1;
          const depth = (sand ? 0.34 : 0.3) * (0.45 + 0.55 * Math.abs(Math.sin(wobble * 1.7 + t * 9))) * Math.min(1, t * steps, (1 - t) * steps);
          const reach = 1.5 * (0.7 + 0.3 * Math.sin(wobble * 0.9));
          return [0, 0.5, 1].map((r): [number, number, number, number] => {
            const [wx, wy, wz] = at(px + ox * (r * reach - 0.05), pz + oz * (r * reach - 0.05), 0.02);
            return [wx, wy + depth * Math.pow(1 - r, 1.5) - (r === 1 ? 0.03 : 0), wz, r];
          });
        };
        let previous = row(0);
        for (let k = 1; k <= steps; k += 1) {
          const next = row(k);
          for (let r = 0; r < 2; r += 1) {
            const quad = [previous[r], next[r], next[r + 1], previous[r], next[r + 1], previous[r + 1]];
            // face the sky whichever way the wall's run turns
            const [p0, p1, p2] = quad;
            const ux = p1[0] - p0[0], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vz = p2[2] - p0[2];
            const order = uz * vx - ux * vz >= 0 ? [0, 1, 2, 3, 4, 5] : [0, 2, 1, 3, 5, 4];
            for (const i of order) {
              positions.push(quad[i][0], quad[i][1], quad[i][2]);
              tone.copy(light).lerp(dark, 0.25 + 0.5 * quad[i][3]);
              colors.push(tone.r, tone.g, tone.b);
            }
          }
          previous = next;
        }
      }
    }
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    combined.baked!.push(geometry);
  };
  addStructureDrifts();

  const buildFacilityPresentation = () => {
    // The facility frames, panels and footings take the shared weathered steel, enamel and cast-concrete albedos
    // (garageYardWear.ts) over the stucco normal; machinery keeps the timber normal (2026-10-10, wave 357: "flat
    // navy, yellow and cyan beams", "blank maroon boxes", "a European red-brick deck").
    const facilityHandles = variant.architecture === 'field_shed'
      ? null
      : Object.freeze({
          fine: assets.acquire('plaster', requestRender),
          equipment: assets.acquire('wood', requestRender),
        });
    if (facilityHandles) handles.push(...Object.values(facilityHandles));
    const anisotropy = engineCtx.anisotropy ?? 4;
    const facilitySurfaceHandles = facilityHandles
      ? Object.freeze({
          structure: { color: garageFacilityAlbedo('steel', anisotropy), normal: facilityHandles.fine.normal },
          painted: { color: garageFacilityAlbedo('panel', anisotropy), normal: facilityHandles.fine.normal },
          equipment: { color: null, normal: facilityHandles.equipment.normal },
          masonry: { color: garageFacilityAlbedo('concrete', anisotropy) ?? facilityHandles.fine.color,
            normal: facilityHandles.fine.normal },
        })
      : null;
    const facilityDetails = variant.architecture === 'field_shed'
      ? Object.freeze({
          facilityProps: 0,
          facilityStations: 0,
          looseParts: 0,
          railSegments: 0,
          openingViewFrames: 0,
          placementZones: 0,
          structuralConnections: 0,
          unsupportedParts: 0,
          heavyLiftSystems: 0,
          operationalMachines: 0,
          factoryProcessZones: 0,
          elevatedAccessSystems: 0,
          secureStorageSystems: 0,
          environmentSpecificAssemblies: 0,
          servicePurposeTags: Object.freeze([]),
          facilityMaterialClasses: 0,
          openingSightlineIntrusions: 0,
          meshes: Object.freeze([]),
          materials: Object.freeze([]),
        })
      : addGarageFacilityDetails({
          buckets: combined,
          engineCtx,
          surfaceMaps: Object.fromEntries(Object.entries(facilitySurfaceHandles!).map(
            ([key, handle]) => [key, { color: handle.color, normal: handle.normal }],
          )) as Parameters<typeof addGarageFacilityDetails>[0]['surfaceMaps'],
          groundAtWorld: (x, z) => samplePatch(patch, heights, x, z),
          variant,
          // building surfaces at their real size: trapezoidal sheeting (render and planks join the pack's own plaster and
          // wood buckets, so they add no draw)
          surfaces: {
            sheeting: { color: garageSheeting('albedo', anisotropy), normal: garageSheeting('normal', anisotropy) },
          },
          sheetingTileM: GARAGE_SHEETING_TILE_M,
        });
    const approachDetails: GarageApproachStats = variant.architecture === 'field_shed'
      ? Object.freeze({
          approachLabel: recipe.approach.label,
          approachStyle: recipe.approach.style,
          approachSegments: 0,
          approachDetails: 0,
          approachConnected: true,
          approachGroundErrorM: 0,
        })
      : addGarageApproachDetails({
          approach: recipe.approach,
          buckets: combined,
          groundAtWorld: (x, z) => samplePatch(patch, heights, x, z),
        });
    for (const mesh of facilityDetails.meshes) {
      track(mesh.geometry);
      root.add(mesh);
    }
    for (const material of facilityDetails.materials) track(material);
    return { facilityDetails, approachDetails };
  };
  const { facilityDetails, approachDetails } = buildFacilityPresentation();

  // The garage r9 kit (garageKitPlacement.ts): this Garage's placed cranes, walls, signs, displays, clutter and
  // atmosphere. Solids join the baked bucket and surfaces their own buckets before the merge below; the kit's display,
  // decal and atmosphere meshes are the pack's only new draws.
  // (the placement receipts pass their own: an empty one measures the scene the kit must keep clear of)
  const kitPlacement = options.kitPlacement !== undefined ? options.kitPlacement : GARAGE_KIT_PLACEMENTS[variant.architecture];
  const kit = kitPlacement
    ? buildGarageKitDressing({
        variant,
        placement: kitPlacement,
        buckets: combined,
        groundAtWorld: (x, z) => samplePatch(patch, heights, x, z),
        setupShadowMaterial: engineCtx.setupShadowMaterial ? (material) => engineCtx.setupShadowMaterial!(material) : null,
        anisotropy: engineCtx.anisotropy,
      })
    : null;
  if (kit) {
    for (const mesh of kit.meshes) {
      track(mesh.geometry);
      mesh.updateMatrix();
      root.add(mesh);
    }
    for (const material of kit.materials) track(material);
  }

  const materialForBucket = (key: BucketKey): THREE.Material => {
    // Source albedo already contains its own value range. Keep the material
    // multiplier close to white so shaded facades retain readable PBR detail.
    const building = new THREE.Color(recipe.buildingTint).lerp(new THREE.Color(0xffffff), 0.62);
    switch (key) {
      case 'plaster': return texturedMaterial('plaster', { color: building, roughness: 1 });
      case 'plaster2': return texturedMaterial('plaster', { color: building.clone().offsetHSL(0, -0.04, -0.08), roughness: 1 });
      case 'plaster3': return texturedMaterial('plaster', { color: building.clone().offsetHSL(0.02, -0.02, 0.05), roughness: 1 });
      // Saltmere's walls are whitewashed granite render, not red brick (garage r9, the per-garage brief 5)
      case 'stone': return variant.architecture === 'naval_drydock'
        ? texturedMaterial('plaster', { color: new THREE.Color(0xf2f0ea), roughness: 1 })
        : texturedMaterial('brick', { color: building.clone().multiplyScalar(0.86), roughness: 1 });
      // dry-country roofs are flat earth-plastered decks, not European red tiles (wave 377: "a European red-tile house in
      // the badlands")
      // the snowbound yards' roofs lie under snow (the re-judge, 2026-10-15: "the roofs carry no snow ... bare saturated
      // orange roofs in a snowbound yard"), on the yard's own resident snow texture
      case 'roof': return recipe.terrainSurface === 'snow'
        ? texturedMaterial('snow', { color: 0xf1f5f7, roughness: 0.9 })
        : variant.architecture === 'shade_depot' || variant.architecture === 'recovery_yard'
          ? texturedMaterial('plaster', { color: new THREE.Color(recipe.buildingTint).multiplyScalar(0.78), roughness: 1 })
          // Steinburg's clay is weathered and sooted down, not the frame's most saturated plane over the tank (the
          // re-judge, 2026-10-15): a cool grey multiplier draws its orange toward brown
          : variant.architecture === 'brick_arsenal'
            ? texturedMaterial('roof', { color: 0x8c949b, roughness: 0.96 })
            // Breton slate over Saltmere's whitewash (garage r9): a cold blue-grey multiplier takes the tile's red out
            : variant.architecture === 'naval_drydock'
              ? texturedMaterial('plaster', { color: 0x5a636c, roughness: 0.82 })
            : texturedMaterial('roof', { color: new THREE.Color(variant.accent).lerp(new THREE.Color(0xaaa19a), 0.74), roughness: 0.96 });
      // Saltmere's sheds are whitewashed (garage r9: the brief's "red-roof brick sheds" were brown weatherboard)
      case 'wood': return variant.architecture === 'naval_drydock'
        ? texturedMaterial('plaster', { color: 0xe4e1d8, roughness: 1 })
        : texturedMaterial('wood', { color: 0xd2c3aa, roughness: 1 });
      case 'glass': return plainMaterial({ color: 0x6b8790, roughness: 0.16, metalness: 0.08, transparent: true, opacity: 0.78 });
      case 'baked': return plainMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.88, metalness: 0.06 });
      case 'route': return texturedMaterial(recipe.approach.surface, {
        color: new THREE.Color(recipe.hardstandTint).lerp(new THREE.Color(0xffffff), 0.10)
          .multiplyScalar(rainSoaked ? 0.84 : 1),
        roughness: rainSoaked ? 0.62 : 0.94,
        metalness: recipe.approach.style === 'drydock-lane' ? 0.08 : 0.01,
      });
      default: return plainMaterial({ color: 0x55595a, roughness: 0.68, metalness: 0.30 });
    }
  };

  // The turntable's plinth meets loose ground with a drift banked against it (the re-judge, 2026-10-15, Sirocco: "the
  // plinth also meets bare sand with no drift or shoulder"; the snow yards' podiums stood on their floors the same way):
  // in the sand and snow yards a low ring of drifted sand or snow stands against the plinth's foot, deeper to windward,
  // thinning to nothing 1.4-1.8 m out, in the baked bucket (no draw of its own)
  const addPodiumDrift = (): void => {
    const sand = hardstandStyle === 'earth-sand';
    const snow = hardstandStyle === 'earth-snow' || hardstandStyle === 'gravel-snow' || hardstandStyle === 'slab-snow';
    if (!sand && !snow) return;
    const inner = GARAGE_PLATFORM_GEOMETRY.baseRadiusM - 0.06, reach = sand ? 1.8 : 1.4, peak = sand ? 0.34 : 0.28;
    const segments = 72, rings = 5;
    // packed and crushed-rock yards keep a grey, trodden snow; the ring is uneven, banked to windward and all but gone
    // on the lee side, never a clean halo (CPU canonical, 2026-10-15)
    const trodden = hardstandStyle === 'gravel-snow' || hardstandStyle === 'slab-snow';
    const light = new THREE.Color(sand ? 0xdcc392 : trodden ? 0xd4dade : 0xe6ecf0);
    const dark = new THREE.Color(sand ? 0xc9aa74 : trodden ? 0xb9c1c6 : 0xcfd9e0);
    const positions: number[] = [], colors: number[] = [];
    const wind = seed % 628 / 100;
    const point = (segment: number, ring: number): [number, number, number, number] => {
      const angle = (segment / segments) * Math.PI * 2, t = ring / rings;
      const windward = Math.max(0, Math.cos(angle - wind));
      const depth = (0.08 + 0.75 * windward * windward + 0.18 * Math.sin(angle * 5 + wind * 3) + 0.1 * Math.sin(angle * 11 + wind)) * peak;
      const r = inner + t * reach * (0.35 + 0.75 * windward + 0.15 * Math.sin(angle * 3 + wind));
      const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
      const ground = Math.max(samplePatch(patch, heights, x, z), GARAGE_PLATFORM_GEOMETRY.terrainSurfaceYM) + 0.03;
      return [x, ground + Math.max(0, depth) * Math.pow(1 - t, 1.6) - (ring === rings ? 0.04 : 0), z, t];
    };
    const tone = new THREE.Color();
    for (let segment = 0; segment < segments; segment += 1) {
      for (let ring = 0; ring < rings; ring += 1) {
        const a = point(segment, ring), b = point(segment + 1, ring), c = point(segment + 1, ring + 1), d = point(segment, ring + 1);
        // outward (a to d) crossed with round the ring (a to b) points down, so a, c, d and a, b, c face the sky
        for (const p of [a, c, d, a, b, c]) {
          positions.push(p[0], p[1], p[2]);
          tone.copy(light).lerp(dark, 0.3 + 0.5 * p[3]);
          colors.push(tone.r, tone.g, tone.b);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    combined.baked!.push(geometry);
  };
  addPodiumDrift();
  // The plaster family's tinted variants draw alone; one that carries only a few facade fixtures folds into the largest
  // of the family (garage r9: the kit's display and decal draws are paid for here and by the facility cylinders' one
  // tier), losing a tint only on pieces of a couple of hundred triangles.
  const foldTinyPlasterBuckets = (): void => {
    const family = (['plaster', 'plaster2', 'plaster3'] as const).filter((key) => (combined[key] || []).length);
    if (family.length < 2) return;
    const trianglesOf = (key: typeof family[number]): number => (combined[key] || []).reduce((sum, geometry) => (
      sum + (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3), 0);
    const largest = family.reduce((best, key) => (trianglesOf(key) > trianglesOf(best) ? key : best), family[0]);
    for (const key of family) {
      if (key === largest || trianglesOf(key) >= 240) continue;
      (combined[largest] ||= []).push(...(combined[key] || []));
      combined[key] = [];
    }
  };
  foldTinyPlasterBuckets();
  // Saltmere's whitewashed walls and its render share the plaster texture: the render's few fixtures ride the walls'
  // draw (garage r9: the kit's display, decal and atmosphere draws are paid for here)
  // (Ironworks: its few render fixtures, under a hundred triangles, ride the brick: the crane bay's clad wall draws instead)
  if (variant.architecture === 'naval_drydock' || variant.architecture === 'factory_line') {
    for (const key of ['plaster', 'plaster2', 'plaster3'] as const) {
      (combined.stone ||= []).push(...(combined[key] || []));
      combined[key] = [];
    }
  }
  const addMergedStructures = (): void => {
    for (const key of BUCKET_KEYS) {
      const sources = combined[key] || [];
      if (!sources.length) continue;
      const normalized = sources.map((geometry) => normalizeGeometry(geometry, key === 'baked'));
      const merged = mergeGeometries(normalized, false);
      for (const geometry of normalized) geometry.dispose();
      for (const geometry of sources) geometry.dispose();
      if (!merged) throw new Error(`Garage environment could not merge ${variant.id}/${key}`);
      track(merged);
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      const material = materialForBucket(key);
      material.name = `garage:${key}`;
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `authored_structures_${key}`;
      // Garage scenery is static and carries textured/vertex-colour contact definition; most of it stays out of the
      // live CSM caster set (nine bucket shadow programs on the first outdoor selection once cost a half-second hitch,
      // and fine station geometry shimmered under cascade refreshes). The three biggest masses cast (the re-judge,
      // 2026-10-15: "the light is flat ... the shed casts no readable shadow ... the sail casts no shade"): the baked
      // bucket (the sail, the rock faces, the mounds, the drifts), the brick and stone walls and the clay roofs. The
      // night switch ABBA (02:20, A main / V GA.05 on GA.03 / C = V with these casters, A V C C V A A V C) measured
      // C within noise of V: Sirocco cold 796 vs 790 ms, the winter yard 531 vs 536 ms, Verdant warm 55 vs 57 ms.
      mesh.castShadow = key === 'baked' || key === 'stone' || key === 'roof';
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      root.add(mesh);
    }
  };
  addMergedStructures();

  // One repeated far-tree mesh per species produced the old row of identical
  // cones/lollipops. The asset library owns one full near-tree three-tree grove
  // per species. All cached environments share its immutable geometry,
  // material, and atlas, so repeat switches allocate only instance matrices.
  const addTreeGroves = (): {
    detailTier: GarageEnvironmentStats['treeDetailTier'];
    trunkQualities: ReadonlyArray<{ radialSegments?: number; rootFlare?: boolean } | undefined>;
  } => {
    const treeKits = recipe.treeSpecies.map((species) => (
      assets.treeGrove(species as TreeSpecies)
    ));
    const matrices = treeKits.map(() => [] as THREE.Matrix4[]);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const groveCount = Math.ceil(recipe.treeCount / 2);
    const grovePoints: Array<{ x: number; z: number }> = [];
    const groveSiteFree = (x: number, z: number, self: { x: number; z: number } | null = null): boolean => {
      const { side, depth } = garageWorldPointToView(x, z);
      // Preserve only the narrow canonical approach lane. The old whole-half-
      // plane exclusion left alternate orbit angles looking unfinished even
      // though the environment owned enough vegetation for a complete ring.
      if (depth < 5 && Math.abs(side) < 16) return false;
      // Saltmere's quay and shore run to the sea behind the hero: no grove there (garage r9: the brief's "dead-looking
      // pines" stood on the strand behind the turret), the downs behind the camera keep theirs
      if (recipe.horizonStyle === 'coastal' && depth > 12 && Math.abs(side) < 36) return false;
      // no grove in Saltmere's dock, on its paving or in its channel (a crown's reach round it)
      if (drydock && [[0, 0], [3.5, 0], [-3.5, 0], [0, 3.5], [0, -3.5]].some(([ds, dd]) => (
        garageDrydockGround(drydock, side + ds, depth + dd, 0) !== null))) return false;
      const nearStructure = structureRecords.some((record) => {
        const radius = Math.hypot(
          record.dimensions.w * record.placement.scale,
          record.dimensions.d * record.placement.scale,
        ) * 0.48;
        return Math.hypot(x - record.x, z - record.z) < radius + 4.8;
      });
      const nearFacility = terraceRecords.some((terrace) => (
        Math.hypot(x - terrace.x, z - terrace.z)
          < Math.max(terrace.radiusSide, terrace.radiusDepth) + 4.2
      ));
      // no grove grows through a placed kit piece (garage r9: the LED trailer, the cells, the cranes)
      const nearKit = (kit?.footprints ?? []).some((footprint) => Math.hypot(x - footprint.x, z - footprint.z) < footprint.radius + 3.6);
      return !nearStructure && !nearFacility && !nearKit
        && !grovePoints.some((point) => point !== self && Math.hypot(x - point.x, z - point.z) < 7.0);
    };
    for (let attempt = 0;
      attempt < groveCount * 80 && grovePoints.length < groveCount;
      attempt += 1) {
      const angle = rng() * Math.PI * 2;
      const radiusScale = 0.90 + rng() * 0.10;
      const x = Math.cos(angle) * 42 * radiusScale;
      const z = Math.sin(angle) * 36 * radiusScale;
      if (!groveSiteFree(x, z)) continue;
      grovePoints.push({ x, z });
    }
    // No grove stands straight behind a fleet exhibit (2026-10-11, wave 408: "a leafy plant sprouts straight through
    // the left side of the turret", a birch 25 m behind the Leopard): seen from a point 45 % of the way out from the
    // turntable to the exhibit, where its bay camera stands (the opening camera sees none of the exhibits), a grove
    // inside the exhibit's silhouette turns along its ring to the nearest clear site, keeping every other rule, or stays
    // out.
    const exhibits = terraceRecords.filter((terrace) => terrace.label.startsWith('fleet-service-'));
    const behindExhibit = (x: number, z: number): boolean => exhibits.some((exhibit) => {
      const viewX = exhibit.x * 0.45, viewZ = exhibit.z * 0.45;
      const reach = Math.hypot(exhibit.x - viewX, exhibit.z - viewZ);
      if (Math.hypot(x - viewX, z - viewZ) < reach) return false;
      const gap = Math.atan2(z - viewZ, x - viewX) - Math.atan2(exhibit.z - viewZ, exhibit.x - viewX);
      // the hull's half-length: a tree anywhere behind the hull rises out of its silhouette
      return Math.abs(Math.atan2(Math.sin(gap), Math.cos(gap))) < Math.atan2(3.6, reach) + 0.04;
    });
    let grovesTurned = 0;
    for (const point of grovePoints) {
      if (!behindExhibit(point.x, point.z)) continue;
      const radius = Math.hypot(point.x, point.z);
      const start = Math.atan2(point.z, point.x);
      search: for (let step = 1; step <= 90; step += 1) {
        for (const sign of [1, -1]) {
          const angle = start + sign * step * 0.035;
          const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
          if (behindExhibit(x, z) || !groveSiteFree(x, z, point)) continue;
          point.x = x;
          point.z = z;
          grovesTurned += 1;
          break search;
        }
      }
    }
    root.userData.grovesTurnedFromExhibits = grovesTurned;
    for (let index = 0; index < groveCount; index += 1) {
      const fallbackSide = THREE.MathUtils.lerp(-31, 31,
        groveCount <= 1 ? 0.5 : index / (groveCount - 1));
      const fallbackDepth = 38 + Math.sin((index / Math.max(1, groveCount - 1)) * Math.PI) * 7;
      const fallback = cameraPoint(fallbackSide, fallbackDepth);
      const { x, z } = grovePoints[index] || fallback;
      const size = 0.82 + rng() * 0.26;
      const heading = rng() * Math.PI * 2;
      const stretch = 0.94 + rng() * 0.12;
      if (behindExhibit(x, z)) continue; // it could not turn clear
      const y = samplePatch(patch, heights, x, z);
      position.set(x, y, z);
      quaternion.setFromAxisAngle(up, heading);
      scale.set(size, size * stretch, size);
      matrices[index % treeKits.length].push(matrix.compose(position, quaternion, scale).clone());
    }
    treeKits.forEach((kit, kitIndex) => {
      const transforms = matrices[kitIndex];
      for (const [part, geometry, material] of [
        ['trunks', kit.trunk, kit.trunkMaterial],
        ['foliage', kit.foliage, kit.foliageMaterial],
      ] as const) {
        const instances = new THREE.InstancedMesh(geometry, material, transforms.length);
        instances.name = `battlefield_tree_${kit.species}_${part}`;
        transforms.forEach((transform, index) => instances.setMatrixAt(index, transform));
        instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        instances.instanceMatrix.needsUpdate = true;
        instances.castShadow = false;
        instances.receiveShadow = true;
        instances.computeBoundingBox();
        instances.computeBoundingSphere();
        instances.matrixAutoUpdate = false;
        instances.updateMatrix();
        root.add(instances);
      }
    });
    return {
      detailTier: treeKits[0]?.detailTier || 'none',
      trunkQualities: treeKits.map((kit) => (
        kit.trunk.userData.trunkQuality as {
          radialSegments?: number;
          rootFlare?: boolean;
        } | undefined
      )),
    };
  };
  const { detailTier: treeDetailTier, trunkQualities: treeTrunkQualities } = addTreeGroves();

  root.updateMatrixWorld(true);
  let objects = 0;
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    objects += 1;
    const one = (object.geometry.index?.count || object.geometry.getAttribute('position')?.count || 0) / 3;
    triangles += one * (object instanceof THREE.InstancedMesh ? object.count : 1);
  });

  const landmarkView = legacyGaragePointToView(recipe.landmark[0], recipe.landmark[2]);
  const landmarkWorld = cameraPoint(landmarkView.side, landmarkView.depth);
  const perimeterSectors = new Set(structureRecords.map(({ x, z }) => {
    const angle = Math.atan2(z, x) + Math.PI;
    return Math.floor((angle / (Math.PI * 2)) * 8) % 8;
  })).size;
  const stats: GarageEnvironmentStats = Object.freeze({
    distinctiveElements: Object.freeze([
      ...recipe.distinctiveElements,
      recipe.approach.label,
      'connected high-detail map facades',
      `five-layer ${recipe.horizonStyle} terrain horizon`,
      'shared full-detail fleet service exhibits',
      'static biome ground cover',
    ]),
    backdropLayers: 5,
    horizonStyle: recipe.horizonStyle,
    horizonMaxHeightM: Number(horizon.geometry.userData.maxHeightM || 0),
    builtHorizonMassTopM: Number(horizon.geometry.userData.massTopM || 0),
    builtHorizonAccentTopM: Number(horizon.geometry.userData.accentTopM || 0),
    kitSkylineLandmarks: Object.freeze([...(horizon.geometry.userData.kitSkylineLandmarks as string[] ?? [])]),
    drawCalls: objects,
    enclosingSurfaces: 0,
    landmarkHeightM: recipe.landmark[1],
    objects,
    serviceFrame: recipe.serviceFrame,
    signature: `${variant.architecture}:${objects}:${Math.round(triangles)}:${recipe.structures.map((item) => item.label).join('|')}`,
    sourceBeat: recipe.sourceBeat,
    sourceLandmarkLocal: Object.freeze([
      landmarkWorld.x, recipe.landmark[1], landmarkWorld.z,
    ]) as readonly [number, number, number],
    sourceStructure: recipe.sourceStructure,
    terrainProfile: recipe.terrainProfile,
    terrainSourceAnchor: patch.sourceAnchor,
    terrainVertices: patch.width * patch.height,
    textureSets: Object.freeze([recipe.terrainSurface, 'cobble', 'plaster', 'brick', 'roof', 'wood']),
    treeSpecies: Object.freeze([...recipe.treeSpecies]),
    trees: recipe.treeCount,
    treeDetailTier,
    groundCover: groundCoverIndex,
    structures: recipe.structures.length,
    ...facilityDetails,
    ...approachDetails,
    approachTerrainGraded: true,
    approachMaxGrade,
    connectedExteriorParts: structureRecords.reduce((sum, record) => sum + record.exteriorParts, 0),
    connectedExteriorBuildings: structureRecords.filter((record) => record.exteriorParts > 0).length,
    maxExteriorSupportGapM: Number(Math.max(
      0,
      ...structureRecords.map((record) => record.exteriorSupportGap),
    ).toFixed(4)),
    collisionAuditedStructures: structureRecords.filter(
      (record) => record.collisionAudit.sourceParts > 0 && record.collisionAudit.footprints.length > 0,
    ).length,
    collisionFootprints: structureRecords.reduce(
      (sum, record) => sum + record.collisionAudit.footprints.length, 0,
    ),
    collisionEnvelopeFill: Number((structureRecords.reduce(
      (sum, record) => sum + record.collisionAudit.tightness, 0,
    ) / Math.max(1, structureRecords.length)).toFixed(4)),
    openCollisionMaxFill: Number(structureRecords.reduce(
      (maxFill, record) => structureCollisionOpenIds.has(record.placement.catalogId)
        ? Math.max(maxFill, record.collisionAudit.tightness)
        : maxFill,
      0,
    ).toFixed(4)),
    structurePerimeterSectors: perimeterSectors,
    treeTrunkMinRadialSegments: Math.min(
      ...treeTrunkQualities.map((quality) => Number(quality?.radialSegments || 0)),
    ),
    treeTrunksRooted: treeTrunkQualities.every((quality) => quality?.rootFlare === true),
    structureUnsupportedParts: structureRecords.reduce(
      (sum, record) => sum + record.assemblyAudit.unsupportedParts, 0,
    ),
    maxStructureConnectionGapM: Number(Math.max(
      0,
      ...structureRecords.map((record) => record.assemblyAudit.maxConnectionGapM),
    ).toFixed(4)),
    unsupportedParts: facilityDetails.unsupportedParts + structureRecords.reduce(
      (sum, record) => sum + record.assemblyAudit.unsupportedParts, 0,
    ),
    placementOverlaps,
    maxGroundContactErrorM: Number(maxGroundContactErrorM.toFixed(4)),
    platformGroundClearanceM: Number(platformGroundClearanceM.toFixed(4)),
    triangles: Math.round(triangles),
    kit: kit ? Object.freeze({ ...kit.stats, slideshow: kit.slideshow }) : null,
  });
  Object.assign(root.userData, stats);

  let disposed = false;
  const texturesReady = Promise.all(handles.map((handle) => handle.ready)).then(() => undefined);
  return {
    root,
    stats,
    texturesReady,
    groundAtWorld: (x, z) => samplePatch(patch, heights, x, z),
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const handle of handles) handle.release();
      handles.length = 0;
      for (const resource of disposables) resource.dispose();
      disposables.length = 0;
      root.clear();
    },
  };
}

/**
 * Split exact near-tree preparation across presentation frames before the
 * synchronous static pack bake. Card hover and selection share the same
 * architecture promise, so even a cold destination never builds two detailed
 * species inside one rendered frame.
 */
export async function prepareGarageEnvironmentAssets(
  assets: GarageEnvironmentAssetLibrary,
  variant: GarageVariant,
): Promise<void> {
  const recipe = GARAGE_ENVIRONMENT_RECIPES[variant.architecture];
  if (!recipe) throw new Error(`Unknown Garage architecture: ${variant.architecture}`);
  await assets.prepareTreeGroves(recipe.treeSpecies as readonly TreeSpecies[]);
}
