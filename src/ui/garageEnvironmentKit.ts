import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { GarageVariant } from '../game/garageVariants.ts';
import type { GeometryBuckets } from '../world/maps/exteriorDetailKit.ts';
import type { TreeSpecies } from '../world/treeSpecies.ts';
import { createGarageTreeKit } from '../world/vegetation.ts';
import {
  GARAGE_ENVIRONMENT_RECIPES,
  type GarageSurfaceKey,
} from './garageEnvironmentRecipes.ts';
import {
  getGarageTerrainPatch,
  type GarageTerrainPatch,
} from './garageTerrainPatches.generated.ts';
import { GARAGE_WRECK_ASSET } from './garageWreckGeometry.generated.ts';
import { addGarageFacilityDetails } from './garageFacilityDetails.ts';

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
  readonly backdropLayers: number;
  readonly groundCover: number;
  readonly structures: number;
  readonly wrecks: number;
  readonly facilityProps: number;
  readonly facilityStations: number;
  readonly looseParts: number;
  readonly railSegments: number;
  readonly serviceVehicles: number;
  readonly triangles: number;
}

export interface GarageEnvironmentBuild {
  readonly root: THREE.Group;
  readonly stats: GarageEnvironmentStats;
  dispose(): void;
}

interface TextureEntry {
  color: THREE.Texture | null;
  normal: THREE.Texture | null;
  references: number;
  lastUse: number;
  listeners: Set<() => void>;
}

interface TextureHandle {
  readonly color: THREE.Texture | null;
  readonly normal: THREE.Texture | null;
  release(): void;
}

export interface GarageEnvironmentAssetLibrary {
  acquire(key: GarageSurfaceKey, requestRender: () => void): TextureHandle;
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
  'plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'baked',
] as const;
type BucketKey = typeof BUCKET_KEYS[number];

/** Reference-counted PBR residency shared by the active and previous pack. */
export function createGarageEnvironmentAssetLibrary(
  engineCtx: GarageEnvironmentEngineContext,
): GarageEnvironmentAssetLibrary {
  const entries = new Map<GarageSurfaceKey, TextureEntry>();
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
  ): THREE.Texture | null => {
    if (!loader) return null;
    const texture = loader.load(url, () => {
      if (disposed || entries.get(key) !== entry) {
        texture.dispose();
        return;
      }
      for (const listener of entry.listeners) listener();
    }, undefined, () => {
      if (entries.get(key) === entry) for (const listener of entry.listeners) listener();
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
        entry = { color: null, normal: null, references: 0, lastUse: ++tick, listeners: new Set() };
        entries.set(key, entry);
        const [colorUrl, normalUrl] = SURFACE_FILES[key];
        entry.color = load(key, colorUrl, true, entry);
        entry.normal = load(key, normalUrl, false, entry);
      }
      entry.references += 1;
      entry.lastUse = ++tick;
      entry.listeners.add(requestRender);
      let released = false;
      return {
        color: entry.color,
        normal: entry.normal,
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
    warmAll(requestRender) {
      // Nine 512px albedo/normal pairs total roughly 18 MiB after GPU decode.
      // Warming them once after first paint trades 4 MiB over the old seven-set
      // cap for hitch-free biome switches on weak CPUs; no battle resource or
      // full-resolution source texture enters this library.
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

interface GarageAtmospherePalette {
  readonly zenith: number;
  readonly horizon: number;
  readonly silhouette: number;
}

function atmospherePalette(weather: GarageVariant['weather']): GarageAtmospherePalette {
  switch (weather) {
    case 'dust': return { zenith: 0x302923, horizon: 0x634c3b, silhouette: 0x49352b };
    case 'snow': return { zenith: 0x1e3444, horizon: 0x526978, silhouette: 0x354955 };
    case 'rain': return { zenith: 0x10242d, horizon: 0x304b53, silhouette: 0x253d37 };
    case 'industrial': return { zenith: 0x161e27, horizon: 0x3b4850, silhouette: 0x30363b };
    default: return { zenith: 0x112d40, horizon: 0x345664, silhouette: 0x385141 };
  }
}

function createSkyGeometry(zenithHex: number, horizonHex: number): THREE.BufferGeometry {
  // Keep the dome just beyond the 65 m relief skyline. The post stack applies
  // distance atmosphere from depth, so an infinite/no-depth sky is bleached
  // toward the clear color on bright presets.
  const geometry = new THREE.SphereGeometry(76, 24, 12);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const zenith = new THREE.Color(zenithHex);
  const horizon = new THREE.Color(horizonHex);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const vertical = THREE.MathUtils.clamp(positions.getY(index) / 70, -1, 1);
    const blend = Math.pow(Math.max(0, vertical), 0.55);
    color.copy(horizon).lerp(zenith, blend);
    color.toArray(colors, index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function createBackdropGeometry(
  patch: GarageTerrainPatch,
  values: Float32Array,
  seed: number,
  atmosphere: GarageAtmospherePalette,
): THREE.BufferGeometry {
  // Three map-derived relief bands replace the old single procedural wall.
  // They use perimeter samples from the exact Garage terrain excerpt, then
  // progressively exaggerate that map's broad shape into a near ridge,
  // midground shoulder and distant skyline. All three layers share one mesh,
  // one material and no runtime updates.
  const segments = 64;
  const layers = [
    { radius: 43, base: -5.5, lift: 2.2, relief: 0.34 },
    { radius: 54, base: -6.0, lift: 5.2, relief: 0.52 },
    { radius: 65, base: -7.0, lift: 8.0, relief: 0.72 },
  ] as const;
  const verticesPerLayer = (segments + 1) * 2;
  const positions = new Float32Array(verticesPerLayer * layers.length * 3);
  const colors = new Float32Array(verticesPerLayer * layers.length * 3);
  const indices = new Uint16Array(segments * layers.length * 6);
  const phase = ((seed >>> 8) % 6283) / 1000;
  const low = new THREE.Color(atmosphere.silhouette).multiplyScalar(0.60);
  const high = new THREE.Color(atmosphere.silhouette);
  const horizon = new THREE.Color(atmosphere.horizon);
  let vertex = 0;
  let indexCursor = 0;
  layers.forEach((layer, layerIndex) => {
    const crest = high.clone().lerp(horizon, 0.10 + layerIndex * 0.10)
      .multiplyScalar(0.88 + layerIndex * 0.04);
    for (let segment = 0; segment <= segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const sourceX = Math.cos(angle) * patch.sizeXM * 0.48;
      const sourceZ = Math.sin(angle) * patch.sizeZM * 0.48;
      const sampled = samplePatch(patch, values, sourceX, sourceZ);
      const broad = Math.sin(angle * 2 + phase) * (0.55 + layerIndex * 0.35)
        + Math.sin(angle * 5 - phase * 0.6) * (0.28 + layerIndex * 0.18);
      const shoulder = layer.lift + sampled * layer.relief + broad;
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

function decodeGarageWreckGeometry(): THREE.BufferGeometry {
  const binary = globalThis.atob(GARAGE_WRECK_ASSET.millimetersBase64);
  const positions = new Float32Array(binary.length / 2);
  for (let index = 0; index < positions.length; index += 1) {
    const raw = binary.charCodeAt(index * 2) | (binary.charCodeAt(index * 2 + 1) << 8);
    positions[index] = (raw & 0x8000 ? raw - 0x10000 : raw) / 1000;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
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
  return Object.fromEntries(BUCKET_KEYS.map((key) => [key, []])) as unknown as GeometryBuckets;
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
  if (reliefScale !== 1) {
    // Battlefield height is measured at kilometer scale. A Garage excerpt is
    // less than one hundred meters wide, so preserve the exact sampled shape
    // while compressing extreme vertical relief into the showroom camera's
    // readable range. This avoids snowbanks swallowing roofs or blocking the
    // hero without reverting to a fabricated flat plane.
    for (let index = 0; index < heights.length; index += 1) {
      heights[index] *= reliefScale;
    }
  }
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

  // One shared composition for every variant: atmosphere color and the exact
  // sampled terrain profile change, but the draw graph stays fixed. The sky
  // and three-layer terrain skyline close the excerpt without constructing a
  // battlefield horizon service or adding any per-frame work.
  const atmosphere = atmospherePalette(variant.weather);
  const sky = new THREE.Mesh(
    track(createSkyGeometry(atmosphere.zenith, atmosphere.horizon)),
    track(new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: true,
      fog: false,
      toneMapped: false,
    })),
  );
  sky.name = 'garage_shared_sky';
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  sky.matrixAutoUpdate = false;
  sky.updateMatrix();
  root.add(sky);

  const horizon = new THREE.Mesh(
    track(createBackdropGeometry(patch, heights, seed, atmosphere)),
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
  const structureRecords = recipe.structures.map((placement) => {
    // Convert semantic camera-space composition into world X/Z. This keeps
    // each environment's different buildings inside the same readable
    // Verdant-style frame instead of letting raw map axes hide them behind the
    // hero or send them under the side panels.
    const x = (placement.side - placement.depth) * Math.SQRT1_2;
    const z = (-placement.side - placement.depth) * Math.SQRT1_2;
    const local = createBuckets();
    const dimensions = placement.builder(rng, local);
    const y = samplePatch(patch, heights, x, z);
    return { placement, local, dimensions, x, z, y };
  });

  // Cut a compact, feathered service terrace beneath each real structure.
  // This preserves the sampled battlefield relief between buildings while
  // preventing a wide hall from bridging a steep slope or floating at one end.
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
  hardstand.position.y = -0.105;
  hardstand.receiveShadow = true;
  hardstand.matrixAutoUpdate = false;
  hardstand.updateMatrix();
  root.add(hardstand);

  // Static battlefield ground cover sits outside the service hardstand. A
  // single three-triangle tuft is instanced across the real terrain and color
  // graded to the selected biome. It is intentionally windless in Garage:
  // one draw, no alpha sorting, no animation wake-up and no shadow shimmer.
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
  while (groundCoverIndex < groundCoverCount && groundCoverAttempts < groundCoverCount * 12) {
    groundCoverAttempts += 1;
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(17 * 17 + rng() * (44 * 44 - 17 * 17));
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const insideStructure = structureRecords.some((record) => (
      Math.abs(x - record.x) < record.dimensions.w * record.placement.scale * 0.62 + 0.8
      && Math.abs(z - record.z) < record.dimensions.d * record.placement.scale * 0.62 + 0.8
    ));
    if (insideStructure) continue;
    const y = samplePatch(patch, heights, x, z);
    const size = (recipe.terrainSurface === 'grass' ? 0.52 : 0.34) * (0.68 + rng() * 0.62);
    coverPosition.set(x, y + 0.01, z);
    coverQuaternion.setFromAxisAngle(coverUp, rng() * Math.PI * 2);
    coverScale.set(size * (0.72 + rng() * 0.45), size, size * (0.72 + rng() * 0.45));
    groundCover.setMatrixAt(groundCoverIndex, coverMatrix.compose(coverPosition, coverQuaternion, coverScale));
    groundCover.setColorAt(groundCoverIndex, coverBase.clone().offsetHSL(
      (rng() - 0.5) * 0.035,
      (rng() - 0.5) * 0.08,
      (rng() - 0.5) * 0.09,
    ));
    groundCoverIndex += 1;
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

  const facilityDetails = variant.architecture === 'field_shed'
    ? Object.freeze({
        facilityProps: 0,
        facilityStations: 0,
        looseParts: 0,
        railSegments: 0,
        serviceVehicles: 0,
      })
    : addGarageFacilityDetails({
        buckets: combined,
        engineCtx,
        groundAtWorld: (x, z) => samplePatch(patch, heights, x, z),
        variant,
      });

  const materialForBucket = (key: BucketKey): THREE.Material => {
    // Source albedo already contains its own value range. Keep the material
    // multiplier close to white so shaded facades retain readable PBR detail.
    const building = new THREE.Color(recipe.buildingTint).lerp(new THREE.Color(0xffffff), 0.42);
    switch (key) {
      case 'plaster': return texturedMaterial('plaster', { color: building, roughness: 0.88 });
      case 'plaster2': return texturedMaterial('plaster', { color: building.clone().offsetHSL(0, -0.04, -0.08), roughness: 0.89 });
      case 'plaster3': return texturedMaterial('plaster', { color: building.clone().offsetHSL(0.02, -0.02, 0.05), roughness: 0.87 });
      case 'stone': return texturedMaterial('brick', { color: building.clone().multiplyScalar(0.78), roughness: 0.92 });
      case 'roof': return texturedMaterial('roof', { color: new THREE.Color(variant.accent).lerp(new THREE.Color(0x8a817a), 0.72), roughness: 0.82 });
      case 'wood': return texturedMaterial('wood', { color: 0xc1ad90, roughness: 0.89 });
      case 'glass': return plainMaterial({ color: 0x6b8790, roughness: 0.16, metalness: 0.08, transparent: true, opacity: 0.78 });
      case 'baked': return plainMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.88, metalness: 0.06 });
      default: return plainMaterial({ color: 0x55595a, roughness: 0.68, metalness: 0.30 });
    }
  };

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

  // Two distant hulks reuse the exact 208-triangle shadow proxy baked from
  // our first-party M1A2. The generated asset preserves the authored vehicle
  // silhouette while keeping every fleet builder and live wreck system out of
  // Garage loading. Both instances share one immutable draw call.
  const wreckGeometry = track(decodeGarageWreckGeometry());
  const wreckMaterial = plainMaterial({ color: 0x24201c, roughness: 0.96, metalness: 0.14 });
  const wrecks = new THREE.InstancedMesh(wreckGeometry, wreckMaterial, 2);
  wrecks.name = 'first_party_m1a2_background_wrecks';
  const wreckPlacements = [
    [-21, 24, 0.82, 0.76],
    [21, 24, -0.68, 0.70],
  ] as const;
  wreckPlacements.forEach(([side, depth, yaw, size], index) => {
    const x = (side - depth) * Math.SQRT1_2;
    const z = (-side - depth) * Math.SQRT1_2;
    const y = samplePatch(patch, heights, x, z);
    wrecks.setMatrixAt(index, new THREE.Matrix4().compose(
      new THREE.Vector3(x, y + 0.02, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(size, size, size),
    ));
  });
  wrecks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  wrecks.instanceMatrix.needsUpdate = true;
  wrecks.castShadow = false;
  wrecks.receiveShadow = true;
  wrecks.computeBoundingBox();
  wrecks.computeBoundingSphere();
  wrecks.matrixAutoUpdate = false;
  wrecks.updateMatrix();
  root.add(wrecks);

  const treeKits = recipe.treeSpecies.map((species, index) => createGarageTreeKit(
    engineCtx, null, species as TreeSpecies, seed + index * 97, index,
  ));
  treeKits.forEach((kit) => disposables.push(kit));
  const matrices = treeKits.map(() => [] as THREE.Matrix4[]);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let index = 0; index < recipe.treeCount; index += 1) {
    // The canonical camera sits on the +X/+Z diagonal, so distribute the real
    // tree kits across the opposite quadrant as a readable forest line rather
    // than sending alternating lanes outside the camera frustum.
    const t = recipe.treeCount <= 1 ? 0.5 : index / (recipe.treeCount - 1);
    const side = THREE.MathUtils.lerp(-23, 23, t) + (rng() - 0.5) * 2.8;
    const depth = 27 + (index % 4) * 3.7 + rng() * 2.8;
    const x = (side - depth) * Math.SQRT1_2;
    const z = (-side - depth) * Math.SQRT1_2;
    const y = samplePatch(patch, heights, x, z);
    const size = 0.84 + rng() * 0.30;
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

  root.updateMatrixWorld(true);
  let objects = 0;
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    objects += 1;
    const one = (object.geometry.index?.count || object.geometry.getAttribute('position')?.count || 0) / 3;
    triangles += one * (object instanceof THREE.InstancedMesh ? object.count : 1);
  });

  const stats: GarageEnvironmentStats = Object.freeze({
    distinctiveElements: Object.freeze([
      ...recipe.distinctiveElements,
      'three-layer map-derived terrain horizon',
      'first-party M1A2 wreck silhouettes',
      'static biome ground cover',
    ]),
    backdropLayers: 3,
    drawCalls: objects,
    enclosingSurfaces: 0,
    landmarkHeightM: recipe.landmark[1],
    objects,
    serviceFrame: recipe.serviceFrame,
    signature: `${variant.architecture}:${objects}:${Math.round(triangles)}:${recipe.structures.map((item) => item.label).join('|')}`,
    sourceBeat: recipe.sourceBeat,
    sourceLandmarkLocal: Object.freeze([...recipe.landmark]) as readonly [number, number, number],
    sourceStructure: recipe.sourceStructure,
    terrainProfile: recipe.terrainProfile,
    terrainSourceAnchor: patch.sourceAnchor,
    terrainVertices: patch.width * patch.height,
    textureSets: Object.freeze([recipe.terrainSurface, 'cobble', 'plaster', 'brick', 'roof', 'wood']),
    treeSpecies: Object.freeze([...recipe.treeSpecies]),
    trees: recipe.treeCount,
    groundCover: groundCoverIndex,
    structures: recipe.structures.length,
    wrecks: wreckPlacements.length,
    ...facilityDetails,
    triangles: Math.round(triangles),
  });
  Object.assign(root.userData, stats);

  let disposed = false;
  return {
    root,
    stats,
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
