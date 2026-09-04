import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { GarageVariant } from '../game/garageVariants.ts';
import {
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
  getGarageFacilityTerraces,
} from './garageFacilityDetails.ts';
import {
  addGarageApproachDetails,
  type GarageApproachStats,
} from './garageApproachDetails.ts';

interface GarageEnvironmentEngineContext {
  anisotropy?: number;
  setupShadowMaterial?(material: THREE.Material): void;
}

export interface GarageEnvironmentStats {
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
}

export interface GarageEnvironmentBuild {
  readonly root: THREE.Group;
  readonly stats: GarageEnvironmentStats;
  readonly texturesReady?: Promise<void>;
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
        entry.color = load(key, colorUrl, true, entry, settle);
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

function createBackdropGeometry(
  patch: GarageTerrainPatch,
  values: Float32Array,
  seed: number,
  atmosphere: GarageAtmospherePalette,
  recipe: GarageEnvironmentRecipe,
): THREE.BufferGeometry {
  // Five map-derived bands close the terrain without becoming the opaque,
  // one-height wall that previously swallowed half the outdoor view. Relief
  // is authored by biome: rail/coastal/urban facilities stay low and broad,
  // mesas terrace, and only the alpine recipe receives a mountain skyline.
  // The exact sampled patch still perturbs every crest, so the result remains
  // grounded in its source battlefield rather than becoming generic scenery.
  const segments = 96;
  const layers = [
    { radius: 44, base: -5.4, height: 0.26, relief: 0.10 },
    { radius: 54, base: -6.2, height: 0.44, relief: 0.16 },
    { radius: 66, base: -7.0, height: 0.62, relief: 0.22 },
    { radius: 80, base: -8.0, height: 0.82, relief: 0.28 },
    { radius: 96, base: -9.2, height: 1.00, relief: 0.34 },
  ] as const;
  const verticesPerLayer = (segments + 1) * 2;
  const positions = new Float32Array(verticesPerLayer * layers.length * 3);
  const colors = new Float32Array(verticesPerLayer * layers.length * 3);
  const indices = new Uint16Array(segments * layers.length * 6);
  const phase = ((seed >>> 8) % 6283) / 1000;
  const datum = samplePatch(patch, values, 0, 0);
  const low = new THREE.Color(atmosphere.silhouette)
    .lerp(new THREE.Color(atmosphere.horizon), 0.34)
    .multiplyScalar(0.78);
  const high = new THREE.Color(atmosphere.silhouette);
  const horizon = new THREE.Color(atmosphere.horizon);
  let maxHeightM = -Infinity;
  let vertex = 0;
  let indexCursor = 0;
  layers.forEach((layer, layerIndex) => {
    const crest = high.clone().lerp(horizon, 0.34 + layerIndex * 0.12)
      .multiplyScalar(0.90 + layerIndex * 0.035);
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const sourceX = Math.cos(angle) * patch.sizeXM * 0.48;
      const sourceZ = Math.sin(angle) * patch.sizeZM * 0.48;
      const sampled = THREE.MathUtils.clamp(
        samplePatch(patch, values, sourceX, sourceZ) - datum,
        -2.4,
        4.8,
      );
      const broad = Math.sin(angle * 2 + phase) * 0.22
        + Math.sin(angle * 5 - phase * 0.6) * 0.12
        + Math.sin(angle * 9 + phase * 0.34) * 0.055;
      const wrappedSegment = segment === segments ? 0 : segment;
      const skylineCell = Math.floor(wrappedSegment / segments * 24);
      const skylineHash = (() => {
        let value = Math.imul(skylineCell + 17 + layerIndex * 29, 0x45d9f3b);
        value = Math.imul(value ^ value >>> 16, 0x45d9f3b);
        return ((value ^ value >>> 16) >>> 0) / 4294967295;
      })();
      const profile = (() => {
        switch (recipe.horizonStyle) {
          case 'alpine': {
            const peakA = Math.pow(Math.max(0, Math.sin(angle * 3 + phase)), 2.2);
            const peakB = Math.pow(Math.max(0, Math.sin(angle * 5 - phase * 0.7)), 3.0);
            const crag = Math.pow(Math.max(0, Math.sin(angle * 11 + phase * 1.4)), 5.0);
            const passCut = Math.pow(Math.max(0, Math.cos(angle * 2 - phase * 0.4)), 8.0);
            return broad * 1.35 + peakA * 0.62 + peakB * 0.38 + crag * 0.20 - passCut * 0.18;
          }
          case 'mesa': {
            const shelf = Math.sin(angle * 2 + phase) * 0.52
              + Math.sin(angle * 4 - phase) * 0.20;
            const canyon = Math.pow(Math.max(0, Math.sin(angle * 3 - phase * 0.7)), 10);
            const butte = Math.pow(Math.max(0, Math.cos(angle * 5 + phase)), 14);
            return Math.round(shelf * 3) / 3 + broad * 0.28 - canyon * 0.30 + butte * 0.42;
          }
          case 'rolling': {
            const woodedShoulder = Math.pow(Math.max(0, Math.sin(angle * 4 + phase)), 3) * 0.20;
            return broad * 1.30 + woodedShoulder;
          }
          case 'urban': {
            const tower = 0.08 + skylineHash * 0.62;
            const ruined = skylineCell % 7 === 0 ? -0.18 : 0;
            const aerial = skylineCell % 11 === 0 ? 0.22 : 0;
            return tower + ruined + aerial + broad * 0.12;
          }
          case 'coastal': {
            const headland = Math.pow(Math.max(0, Math.sin(angle * 2.2 + phase)), 4) * 0.38;
            return broad * 0.25 - 0.12 + headland;
          }
          default: {
            if (recipe.approach.style === 'rail-fan') {
              const shedRoof = skylineCell % 5 < 3 ? 0.22 : 0.05;
              const waterTower = skylineCell % 13 === 0 ? 0.66 : 0;
              return shedRoof + waterTower + broad * 0.16;
            }
            if (recipe.approach.style === 'foundry-haul-road') {
              const sawtooth = skylineCell % 3 === 0 ? 0.34 : 0.15;
              const stack = skylineCell % 9 === 0 ? 0.78 : 0;
              return sawtooth + stack + broad * 0.12;
            }
            return broad * 0.42;
          }
        }
      })();
      const nominal = recipe.horizonHeightM * layer.height;
      const shoulder = THREE.MathUtils.clamp(
        nominal + sampled * layer.relief + profile * recipe.horizonHeightM,
        -0.15,
        recipe.horizonHeightM,
      );
      maxHeightM = Math.max(maxHeightM, shoulder);
      const x = Math.cos(angle) * layer.radius;
      const z = Math.sin(angle) * layer.radius;
      positions.set([x, layer.base, z, x, shoulder, z], vertex * 3);
      low.toArray(colors, vertex * 3);
      crest.toArray(colors, (vertex + 1) * 3);
      if (segment < segments) {
        const base = layerIndex * verticesPerLayer + segment * 2;
        indices.set([base, base + 1, base + 2, base + 2, base + 1, base + 3], indexCursor);
        indexCursor += 6;
      }
      vertex += 2;
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.horizonStyle = recipe.horizonStyle;
  geometry.userData.maxHeightM = Number(maxHeightM.toFixed(3));
  return geometry;
}

function createGroundCoverGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let blade = 0; blade < 3; blade += 1) {
    const angle = blade * Math.PI / 3;
    const dx = Math.cos(angle) * 0.12;
    const dz = Math.sin(angle) * 0.12;
    positions.push(-dx, 0, -dz, dx, 0, dz, 0, 0.72, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
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

function createTerrainGeometry(patch: GarageTerrainPatch, values: Float32Array): THREE.BufferGeometry {
  const positions = new Float32Array(patch.width * patch.height * 3);
  const uvs = new Float32Array(patch.width * patch.height * 2);
  let vertex = 0;
  for (let row = 0; row < patch.height; row += 1) {
    for (let column = 0; column < patch.width; column += 1) {
      const index = row * patch.width + column;
      positions[vertex * 3] = -patch.sizeXM / 2 + (column / (patch.width - 1)) * patch.sizeXM;
      positions[vertex * 3 + 1] = values[index];
      positions[vertex * 3 + 2] = -patch.sizeZM / 2 + (row / (patch.height - 1)) * patch.sizeZM;
      uvs[vertex * 2] = (column / (patch.width - 1)) * 10;
      uvs[vertex * 2 + 1] = (row / (patch.height - 1)) * 9;
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
    track(createBackdropGeometry(patch, heights, seed, atmosphere, recipe)),
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
    const y = terrace.label.startsWith('fleet-service-')
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

  const terrainGeometry = track(createTerrainGeometry(patch, heights));
  const terrain = new THREE.Mesh(terrainGeometry, texturedMaterial(recipe.terrainSurface, {
    color: recipe.terrainTint, roughness: 0.94, metalness: 0,
  }));
  terrain.name = 'map_derived_terrain_patch';
  terrain.receiveShadow = true;
  root.add(terrain);

  const hardstand = new THREE.Mesh(
    track(new THREE.BoxGeometry(29, 0.16, 24)),
    texturedMaterial('cobble', { color: recipe.hardstandTint, roughness: 0.92, metalness: 0.02 }),
  );
  hardstand.name = 'connected_service_hardstand';
  hardstand.position.y = GARAGE_PLATFORM_GEOMETRY.groundSurfaceYM - 0.08;
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
    const coverBase = recipe.terrainSurface === 'grass' ? new THREE.Color(recipe.terrainTint).offsetHSL(0.02, 0.08, -0.22)
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

  const buildFacilityPresentation = () => {
    const facilitySurfaceHandles = variant.architecture === 'field_shed'
      ? null
      : Object.freeze({
          structure: assets.acquire('roof', requestRender),
          painted: assets.acquire('plaster', requestRender),
          equipment: assets.acquire('wood', requestRender),
          masonry: assets.acquire('brick', requestRender),
        });
    if (facilitySurfaceHandles) handles.push(...Object.values(facilitySurfaceHandles));
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

  const materialForBucket = (key: BucketKey): THREE.Material => {
    // Source albedo already contains its own value range. Keep the material
    // multiplier close to white so shaded facades retain readable PBR detail.
    const building = new THREE.Color(recipe.buildingTint).lerp(new THREE.Color(0xffffff), 0.62);
    switch (key) {
      case 'plaster': return texturedMaterial('plaster', { color: building, roughness: 1 });
      case 'plaster2': return texturedMaterial('plaster', { color: building.clone().offsetHSL(0, -0.04, -0.08), roughness: 1 });
      case 'plaster3': return texturedMaterial('plaster', { color: building.clone().offsetHSL(0.02, -0.02, 0.05), roughness: 1 });
      case 'stone': return texturedMaterial('brick', { color: building.clone().multiplyScalar(0.86), roughness: 1 });
      case 'roof': return texturedMaterial('roof', { color: new THREE.Color(variant.accent).lerp(new THREE.Color(0xaaa19a), 0.74), roughness: 0.96 });
      case 'wood': return texturedMaterial('wood', { color: 0xd2c3aa, roughness: 1 });
      case 'glass': return plainMaterial({ color: 0x6b8790, roughness: 0.16, metalness: 0.08, transparent: true, opacity: 0.78 });
      case 'baked': return plainMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.88, metalness: 0.06 });
      case 'route': return texturedMaterial(recipe.approach.surface, {
        color: new THREE.Color(recipe.hardstandTint).lerp(new THREE.Color(0xffffff), 0.10),
        roughness: 0.94,
        metalness: recipe.approach.style === 'drydock-lane' ? 0.08 : 0.01,
      });
      default: return plainMaterial({ color: 0x55595a, roughness: 0.68, metalness: 0.30 });
    }
  };

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
      // Garage scenery is static and already carries textured/vertex-color
      // contact definition. Keep it out of the live CSM caster set: compiling
      // nine new bucket shadow programs on the first outdoor selection caused a
      // half-second hitch, while cascade refreshes made fine station geometry
      // shimmer. The hero tank and podium remain the only dynamic Garage
      // casters; scenery still receives their stable contact shadow.
      mesh.castShadow = false;
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
    for (let attempt = 0;
      attempt < groveCount * 80 && grovePoints.length < groveCount;
      attempt += 1) {
      const angle = rng() * Math.PI * 2;
      const radiusScale = 0.90 + rng() * 0.10;
      const x = Math.cos(angle) * 42 * radiusScale;
      const z = Math.sin(angle) * 36 * radiusScale;
      const { side, depth } = garageWorldPointToView(x, z);
      // Preserve only the narrow canonical approach lane. The old whole-half-
      // plane exclusion left alternate orbit angles looking unfinished even
      // though the environment owned enough vegetation for a complete ring.
      if (depth < 5 && Math.abs(side) < 16) continue;
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
      if (nearStructure || nearFacility
          || grovePoints.some((point) => Math.hypot(x - point.x, z - point.z) < 7.0)) continue;
      grovePoints.push({ x, z });
    }
    for (let index = 0; index < groveCount; index += 1) {
      const fallbackSide = THREE.MathUtils.lerp(-31, 31,
        groveCount <= 1 ? 0.5 : index / (groveCount - 1));
      const fallbackDepth = 38 + Math.sin((index / Math.max(1, groveCount - 1)) * Math.PI) * 7;
      const fallback = cameraPoint(fallbackSide, fallbackDepth);
      const { x, z } = grovePoints[index] || fallback;
      const y = samplePatch(patch, heights, x, z);
      const size = 0.82 + rng() * 0.26;
      position.set(x, y, z);
      quaternion.setFromAxisAngle(up, rng() * Math.PI * 2);
      scale.set(size, size * (0.94 + rng() * 0.12), size);
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
  });
  Object.assign(root.userData, stats);

  let disposed = false;
  const texturesReady = Promise.all(handles.map((handle) => handle.ready)).then(() => undefined);
  return {
    root,
    stats,
    texturesReady,
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
