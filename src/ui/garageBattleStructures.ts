// src/ui/garageBattleStructures.ts — the Garage's scene packs build their structures the battlefield's way (garage-env-276).
//
// A pack's buildings once came from the shared structure builders alone, below the layer where a battlefield's look now
// lives: no regional architecture kit, no build context, no catalog cuts, and the Garage's own nine-surface re-skin with
// a flat grey `dark`. Here a pack reads its source map exactly as the world build does: the map's props settings
// (resolvePropsSettings), its kits (loadMapKits), the same bucket set and StructureBuildContext, the catalog exterior
// and its settled cuts, the map's regional kit rebuild, and the map's structure surfaces (buildStructureSurfaces), so a
// Verdant farmhouse or a Steinburg arsenal reads in the Garage as it reads in battle. The Garage keeps only its staging:
// where a building stands, at what scale, facing the hero axis.
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { getMapConfig } from '../world/maps/index.ts';
import { getDeviceTier } from '../engine/quality.ts';
import {
  createTerrainSurfaceMaterialSteps, type TerrainMapConfig, type TerrainSourceCheckpoint, type TerrainSurfaceMaterial,
} from '../world/terrain.ts';
import { prepareSourcedTerrain, type TerrainSourcePreparation } from '../world/sourcedTextures.ts';
import { loadMapKits } from '../world/worldKits.ts';
import {
  buildStructureSurfaces, createStructureBuckets, mulberry32, plannedKitRenderPaints, plannedSurfacePaints,
  resolvePropsSettings, structureBuildContextFor, type PropsMapConfig, type StructureSurfaces,
} from '../world/props.ts';
import { registerPaintNoise, startSurfacePaints, type SurfacePaintPrefetch } from '../world/surfacePaintPrefetch.ts';
import {
  addCatalogExterior, attachStructureBuildContext, type GeometryBuckets, type StructureBuilder,
  type StructureBuildContext, type StructureDimensions,
} from '../world/maps/exteriorDetailKit.ts';
import { settleCatalogCuts } from '../world/maps/railKit.ts';
import { rebuildRegionalStructureSteps, resolveRegionalArchitecture } from '../world/maps/regional/index.ts';
import { createGarageSlicer, type GarageSlicer } from './garageSlicer.ts';

/** The props seed every battlefield's world build uses (map.ts createProps / createPropsAsync). */
const WORLD_PROPS_SEED = 2002;

type ShaderHook = THREE.Material['onBeforeCompile'];

/** A source map as its world build reads it. */
export interface GarageMapStructures {
  readonly mapId: string;
  readonly cfg: PropsMapConfig;
  readonly P: ReturnType<typeof resolvePropsSettings>;
  readonly context: StructureBuildContext;
  readonly style: ReturnType<typeof resolveRegionalArchitecture>;
  readonly sunAzimuthDeg: number | undefined;
}

/**
 * The surface paint worker's prints for a map (surfacePaintPrefetch.ts), started as a battle entry starts them: its fixed
 * prints at once, its kit's render prints once the kits load. The two most recent maps keep theirs (a Garage pack and the
 * one it replaces); a third disposes the oldest.
 */
const surfacePaints = new Map<string, SurfacePaintPrefetch | null>();
export function startGarageSurfacePaints(mapId: string): void {
  if (surfacePaints.has(mapId) || typeof Worker === 'undefined') return;
  const cfg = getMapConfig(mapId) as unknown as PropsMapConfig;
  surfacePaints.set(mapId, startSurfacePaints(plannedSurfacePaints(cfg)));
  while (surfacePaints.size > 2) {
    const [oldest, prefetch] = surfacePaints.entries().next().value!;
    prefetch?.dispose();
    surfacePaints.delete(oldest);
  }
  // (D, 2026-11-24) and its ground's photographed layers start loading and decoding in the worker now, beside the
  // pack's other slices, as a battle entry starts them with its world build (taken by the ground material's prepare)
  startGarageTerrainSources(mapId, resolveGarageBattleGroundMode());
}

/**
 * (garage-env-276; Kevin 2026-11-24, option A) How a pack comes by its map's battle ground:
 * - 'wait': the prepare takes it whole (Node: its layers are painted, nothing is fetched);
 * - 'handover': the pack presents on the Garage library's ground and the battle ground, its photographed layers fetched
 *   and decoded off the switch's path, fades in where it lands (a desktop page);
 * - 'library': the pack keeps the Garage library's ground and the Garage never fetches the battle ground (a page on the
 *   battle's mobile tier: its photographed sets are the same 1K downloads as desktop's, 2-16 MB a map).
 * The tier is the battle's own (engine/quality.ts getDeviceTier), never the viewport.
 */
export type GarageBattleGroundMode = 'wait' | 'handover' | 'library';
export function resolveGarageBattleGroundMode(
  page: boolean = typeof document !== 'undefined',
  tier: ReturnType<typeof getDeviceTier> = getDeviceTier(),
): GarageBattleGroundMode {
  if (!page) return 'wait';
  return tier === 'mobile' ? 'library' : 'handover';
}

/**
 * (Main 2026-11-24, Kevin's option A: "phones skip the big download") One rule for every photographed set the Garage
 * would fetch, the ground's layers and the structures' building and rock sets alike: only a handover fetches them. A
 * phone's Garage ('library') and Node ('wait') fetch none; battles keep their own rule.
 */
export function garageFetchesPhotoSets(mode: GarageBattleGroundMode = resolveGarageBattleGroundMode()): boolean {
  return mode === 'handover' && !headless();
}

/**
 * A map's ground layers start loading and decoding ahead of its ground material's prepare, only where the pack hands its
 * ground over (a 'library' or 'wait' pack fetches nothing). `prepare` is the receipts' seam. Returns whether it started.
 */
export function startGarageTerrainSources(
  mapId: string,
  mode: GarageBattleGroundMode,
  prepare: typeof prepareSourcedTerrain = prepareSourcedTerrain,
): boolean {
  if (mode !== 'handover' || terrainSources.has(mapId) || terrainCache.has(mapId)) return false; // (garageFetchesPhotoSets' rule)
  const terrainCfg = getMapConfig(mapId) as unknown as TerrainMapConfig;
  terrainSources.set(mapId, prepare(mapId, terrainCfg.splat ?? {}, { worker: true }));
  while (terrainSources.size > 2) {
    const [oldest, sources] = terrainSources.entries().next().value!;
    sources.cancel();
    terrainSources.delete(oldest);
  }
  return true;
}
/** A map's ground layers started ahead (startGarageSurfacePaints), until its ground material's build takes them. */
const terrainSources = new Map<string, TerrainSourcePreparation>();

/** Load a map's kits (as a battle entry does), then resolve what its structure builders read. */
export async function loadGarageMapStructures(mapId: string): Promise<GarageMapStructures> {
  startGarageSurfacePaints(mapId);
  await loadMapKits(getMapConfig(mapId) as Parameters<typeof loadMapKits>[0]);
  const map = resolveGarageMapStructures(mapId);
  surfacePaints.get(mapId)?.add(plannedKitRenderPaints(map.cfg));
  return map;
}

/** What a map's structure builders read; its kits must be loaded (always so under Node: kitRegistryNode.ts). */
export function resolveGarageMapStructures(mapId: string): GarageMapStructures {
  const cfg = getMapConfig(mapId) as unknown as PropsMapConfig;
  const P = resolvePropsSettings(cfg);
  const sunAzimuthDeg = (cfg as { sky?: { sunAzimuthDeg?: number } }).sky?.sunAzimuthDeg;
  return {
    mapId,
    cfg,
    P,
    context: structureBuildContextFor(mapId, P, WORLD_PROPS_SEED),
    style: resolveRegionalArchitecture(P.architecture),
    sunAzimuthDeg,
  };
}

/** One staged building: where the Garage stands it. */
export interface GarageStructureStaging {
  readonly builder: StructureBuilder;
  readonly catalogId: string;
  /** The structure's index in its pack: its look and wall draw take their own streams by it. */
  readonly index: number;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

const WALL_BUCKETS = ['plaster', 'plaster2', 'plaster3'] as const;

/**
 * One building through the world build's pipeline, in slices: the bucket set and context, the builder on its wall
 * bucket, the catalog exterior and its settled cuts, then the map's regional kit (null when the kit has no version of
 * it: the base stands, as in battle). The builder draws from the pack's sequence (`rng`); the wall pick and the kit's
 * look draw from streams of their own, so the pack's later draws are unchanged.
 */
export function* buildGarageStructureSteps(
  map: GarageMapStructures,
  staging: GarageStructureStaging,
  rng: () => number,
): Generator<unknown, { buckets: GeometryBuckets; dimensions: StructureDimensions; rebuilt: boolean }, void> {
  let buckets: GeometryBuckets = createStructureBuckets();
  attachStructureBuildContext(buckets, map.context);
  const wallStream = mulberry32(WORLD_PROPS_SEED ^ (staging.index * 0x9e3779b1));
  const wallBucket = wallStream() < map.P.wallStoneChance ? 'stone' : WALL_BUCKETS[Math.floor(wallStream() * 3)];
  const dimensions = (staging.builder as (r: () => number, b: GeometryBuckets, wall?: string) => StructureDimensions)(
    rng, buckets, wallBucket);
  addCatalogExterior(buckets, { id: staging.catalogId, info: dimensions, variant: staging.index });
  settleCatalogCuts(buckets);
  yield undefined;
  let rebuilt = false;
  if (map.style) {
    const regional = yield* rebuildRegionalStructureSteps(map.style, staging.catalogId,
      buckets as Parameters<typeof rebuildRegionalStructureSteps>[2], dimensions, wallBucket,
      {
        mapId: map.mapId, snowCap: map.context.snowCap, seed: map.context.seed,
        ...(map.sunAzimuthDeg !== undefined ? { sunAzimuthDeg: map.sunAzimuthDeg } : {}),
      },
      staging.x, staging.z, staging.yaw);
    if (regional) { buckets = regional as GeometryBuckets; rebuilt = true; }
  }
  return { buckets, dimensions, rebuilt };
}

/** A map's structure surfaces, prepared ahead of the pack's bake. */
export interface GarageStructureSurfaces {
  readonly mapId: string;
  readonly surfaces: StructureSurfaces;
  /** The materials and shader-only textures the surfaces own (the surface cache disposes them). */
  readonly materials: readonly THREE.Material[];
  readonly textures: readonly THREE.Texture[];
  /**
   * The shadow-cascade registrations the surfaces asked for while they were painted, replayed by each bake on its pack's
   * engine context (which releases them with the pack; a later bake registers them again).
   */
  readonly shadowRegistrations: ReadonlyArray<readonly [THREE.Material, ShaderHook | null | undefined]>;
}

/**
 * The surface cache: one entry per map, painted once. A prepare steps its entry's build; one that stops part-way leaves
 * the build where it stood, and the next prepare of that map resumes it (nothing is painted twice). A pack holds its
 * map's entry from its prepare to its disposal; the two most recent maps stay painted when nothing holds them (a Garage
 * and the one it replaced, as the packs' own cache keeps two), a third unheld one is disposed.
 */
interface SurfaceEntry {
  readonly mapId: string;
  /** The material kinds it was painted for (a print none of them wears is a stand-in: buildStructureSurfaces' drawn). */
  readonly drawn: ReadonlySet<string>;
  readonly steps: ReturnType<typeof buildStructureSurfaces>;
  readonly shadowRegistrations: Array<readonly [THREE.Material, ShaderHook | null | undefined]>;
  readonly retained: { materials: THREE.Material[]; textures: THREE.Texture[] };
  /** The step the build stopped at (taken but not yet run on), or null before the first. */
  pending: IteratorResult<unknown, StructureSurfaces> | null;
  done: GarageStructureSurfaces | null;
  holds: number;
}
const surfaceCache = new Map<string, SurfaceEntry>();
const KEPT_UNHELD_SURFACES = 2;

function surfaceEntry(map: GarageMapStructures, anisotropy: number, drawn: ReadonlySet<string>): SurfaceEntry {
  let entry = surfaceCache.get(map.mapId);
  // an entry painted for fewer kinds than now drawn is painted again (a map's packs draw the same kinds, so this is rare)
  if (entry && ![...drawn].every((kind) => entry!.drawn.has(kind)) && entry.holds === 0) {
    surfaceCache.delete(map.mapId);
    if (!entry.done) entry.steps.return(undefined as never);
    disposeMaterials(entry.retained.materials, entry.retained.textures);
    entry = undefined;
  }
  if (entry) { surfaceCache.delete(map.mapId); surfaceCache.set(map.mapId, entry); return entry; } // most recent last
  const shadowRegistrations: Array<readonly [THREE.Material, ShaderHook | null | undefined]> = [];
  const retained: { materials: THREE.Material[]; textures: THREE.Texture[] } = { materials: [], textures: [] };
  const noi = new SimplexNoise({ random: mulberry32(WORLD_PROPS_SEED + 7) });
  registerPaintNoise(noi, WORLD_PROPS_SEED + 7);
  // the settings are the map's own; the build writes its kit's tones into them, so it takes a copy
  const steps = buildStructureSurfaces({
    mapId: map.mapId, cfg: map.cfg, P: { ...map.P }, noi, aniso: anisotropy,
    engineCtx: {
      setupShadowMaterial(material, hook) {
        shadowRegistrations.push([material, hook as ShaderHook | null | undefined]);
      },
    },
    // the battle's photographed building and rock sets only where the Garage fetches photo sets (garageFetchesPhotoSets:
    // a desktop page); a phone (Kevin's option A) and Node keep the procedural prints, the fallback of record
    sourceApplication: garageFetchesPhotoSets() ? {} : { signal: AbortSignal.abort() },
    onRetained: (materials, textures) => { retained.materials = materials; retained.textures = textures; },
    drawn,
  });
  entry = { mapId: map.mapId, drawn, steps, shadowRegistrations, retained, pending: null, done: null, holds: 0 };
  surfaceCache.set(map.mapId, entry);
  trimSurfaceCache();
  return entry;
}

/** One step of an entry's build (under the headless canvas when there is no DOM); its result when it is the last. */
function stepEntry(entry: SurfaceEntry): IteratorResult<unknown, StructureSurfaces> {
  entry.pending = withHeadlessCanvas(() => entry.steps.next());
  if (entry.pending.done) {
    entry.done = {
      mapId: entry.mapId, surfaces: entry.pending.value, materials: entry.retained.materials,
      textures: entry.retained.textures, shadowRegistrations: entry.shadowRegistrations,
    };
  }
  return entry.pending;
}


/**
 * A map's structure surfaces, painted in slices (the world build's own checkpoints, gathered into ~6 ms slices), or at
 * once from the cache. Resolves null when `wanted` turns false part-way: the build waits in the cache where it stopped.
 * A resolved surface set is held for the caller (releaseGarageStructureSurfaces).
 */
export async function prepareGarageStructureSurfaces(
  map: GarageMapStructures,
  anisotropy: number,
  wanted: () => boolean,
  drawn: ReadonlySet<string>,
  slicer: GarageSlicer = createGarageSlicer(),
): Promise<GarageStructureSurfaces | null> {
  const entry = surfaceEntry(map, anisotropy, drawn);
  entry.holds += 1; // held while it paints, so a trim never disposes a build in flight
  try {
    const prefetch = surfacePaints.get(map.mapId) ?? null;
    while (!entry.done) {
      // a print the worker painted ahead, as the world build takes it (props.ts createPropsAsync); a failed one is
      // painted where it stands
      const request = (entry.pending?.value as { surfacePaint?: { key: string; result: Record<string, unknown> | null } }
        | undefined)?.surfacePaint;
      const ahead = request && !request.result && prefetch ? prefetch.take(request.key) : null;
      if (ahead && request) {
        try { request.result = await ahead; } catch { request.result = null; }
        slicer.restart();
      }
      if (slicer.due()) {
        await slicer.yield();
        if (!wanted()) return null;
      }
      stepEntry(entry);
    }
    entry.holds += 1; // the caller's hold
    return entry.done;
  } finally {
    entry.holds -= 1;
    trimSurfaceCache();
  }
}

/** The same surfaces at once (a bake with nothing prepared: the receipts under Node), held for the caller. */
export function holdGarageStructureSurfacesNow(
  map: GarageMapStructures,
  anisotropy: number,
  drawn: ReadonlySet<string>,
): GarageStructureSurfaces {
  const entry = surfaceEntry(map, anisotropy, drawn);
  while (!entry.done) stepEntry(entry);
  entry.holds += 1;
  return entry.done;
}

/** A hold on a map's surfaces ends (its pack is disposed, or its prepare was never baked). */
export function releaseGarageStructureSurfaces(prepared: GarageStructureSurfaces): void {
  const entry = surfaceCache.get(prepared.mapId);
  if (!entry || entry.done !== prepared) return;
  entry.holds = Math.max(0, entry.holds - 1);
  trimSurfaceCache();
}

function trimSurfaceCache(): void {
  let unheld = [...surfaceCache.values()].filter((entry) => entry.holds === 0);
  while (unheld.length > KEPT_UNHELD_SURFACES) {
    const oldest = unheld.shift()!;
    surfaceCache.delete(oldest.mapId);
    if (!oldest.done) oldest.steps.return(undefined as never);
    disposeMaterials(oldest.retained.materials, oldest.retained.textures);
    unheld = [...surfaceCache.values()].filter((entry) => entry.holds === 0);
  }
}

/** Diagnostics: the maps whose surfaces the cache holds, and whether each is painted. */
export function garageStructureSurfaceCache(): ReadonlyArray<{ mapId: string; painted: boolean; holds: number }> {
  return [...surfaceCache.values()].map((entry) => ({ mapId: entry.mapId, painted: !!entry.done, holds: entry.holds }));
}

// ---- the ground: the map's battle terrain material on the yard's patch (class 2) -------------------------------------

/** A map's battle ground material for the Garage's patch, held for the caller (releaseGarageTerrainSurface). */
export interface GarageTerrainSurface extends TerrainSurfaceMaterial {
  readonly mapId: string;
  /** Its shader hook, for the pack to install (the engine's setupShadowMaterial), as the structure surfaces' are. */
  readonly shadowRegistrations: ReadonlyArray<readonly [THREE.Material, ShaderHook | null | undefined]>;
}
interface TerrainEntry {
  readonly mapId: string;
  readonly steps: Generator<void | TerrainSourceCheckpoint, TerrainSurfaceMaterial, void>;
  /** The battle's sourced layers, decoded in its worker (none under Node: the procedural fallback paints). */
  readonly sources: TerrainSourcePreparation | null;
  /** A worker checkpoint the build stopped at, for an async prepare to await (a synchronous hold steps past it). */
  checkpoint: TerrainSourceCheckpoint | null;
  readonly shadowRegistrations: Array<readonly [THREE.Material, ShaderHook | null | undefined]>;
  done: GarageTerrainSurface | null;
  holds: number;
}
const terrainCache = new Map<string, TerrainEntry>();

function terrainEntry(map: GarageMapStructures, anisotropy: number): TerrainEntry {
  let entry = terrainCache.get(map.mapId);
  if (entry) { terrainCache.delete(map.mapId); terrainCache.set(map.mapId, entry); return entry; } // most recent last
  const shadowRegistrations: Array<readonly [THREE.Material, ShaderHook | null | undefined]> = [];
  // (D, 2026-11-24) its layers as the battle's world build takes them: the photographed sets decoded in the worker, so
  // the hand-painted fallback layers (the prepare's main-thread bulk) are painted only where a set fails
  const cfg = map.cfg as unknown as TerrainMapConfig;
  const ahead = terrainSources.get(map.mapId) ?? null;
  terrainSources.delete(map.mapId);
  const sources = ahead ?? (headless() ? null : prepareSourcedTerrain(map.mapId, cfg.splat ?? {}, { worker: true }));
  const steps = createTerrainSurfaceMaterialSteps({
    anisotropy,
    setupShadowMaterial(material, hook) { shadowRegistrations.push([material, hook as ShaderHook]); },
  }, cfg, sources);
  entry = { mapId: map.mapId, steps, sources, checkpoint: null, shadowRegistrations, done: null, holds: 0 };
  terrainCache.set(map.mapId, entry);
  trimTerrainCache();
  return entry;
}

function stepTerrain(entry: TerrainEntry): void {
  entry.checkpoint = null;
  const step = withHeadlessCanvas(() => entry.steps.next());
  if (step.done) entry.done = { ...step.value, mapId: entry.mapId, shadowRegistrations: entry.shadowRegistrations };
  else if (typeof step.value === 'function') entry.checkpoint = step.value;
}

/**
 * A map's ground material, built in ~6 ms slices (the terrain build's own steps), or at once from the cache; null when
 * `wanted` turns false part-way (the build waits in the cache where it stopped). Held for the caller.
 */
export async function prepareGarageTerrainSurface(
  map: GarageMapStructures,
  anisotropy: number,
  wanted: () => boolean,
  slicer: GarageSlicer = createGarageSlicer(),
): Promise<GarageTerrainSurface | null> {
  const entry = terrainEntry(map, anisotropy);
  entry.holds += 1;
  try {
    while (!entry.done) {
      // the worker's layer, awaited off the thread (a failed decode leaves the fallback to paint), then a fresh slice
      const checkpoint = entry.checkpoint;
      if (checkpoint) {
        entry.checkpoint = null;
        try { await checkpoint(); } catch { /* the layer's fallback paints */ }
        if (!wanted()) return null;
        slicer.restart();
      }
      if (slicer.due()) {
        await slicer.yield();
        if (!wanted()) return null;
      }
      stepTerrain(entry);
    }
    entry.holds += 1;
    return entry.done;
  } finally {
    entry.holds -= 1;
    trimTerrainCache();
  }
}

/** The same ground material at once (a bake with nothing prepared: the receipts under Node), held for the caller. */
export function holdGarageTerrainSurfaceNow(map: GarageMapStructures, anisotropy: number): GarageTerrainSurface {
  const entry = terrainEntry(map, anisotropy);
  while (!entry.done) stepTerrain(entry);
  entry.holds += 1;
  return entry.done;
}

/** A hold on a map's ground material ends. */
export function releaseGarageTerrainSurface(surface: GarageTerrainSurface): void {
  const entry = terrainCache.get(surface.mapId);
  if (!entry || entry.done !== surface) return;
  entry.holds = Math.max(0, entry.holds - 1);
  trimTerrainCache();
}

function trimTerrainCache(): void {
  let unheld = [...terrainCache.values()].filter((entry) => entry.holds === 0);
  while (unheld.length > KEPT_UNHELD_SURFACES) {
    const oldest = unheld.shift()!;
    terrainCache.delete(oldest.mapId);
    if (oldest.done) disposeMaterials([oldest.done.material], oldest.done.textures);
    else {
      oldest.steps.return(undefined as never);
      oldest.sources?.cancel();
    }
    unheld = [...terrainCache.values()].filter((entry) => entry.holds === 0);
  }
}

/** Diagnostics: the maps whose ground material the cache holds. */
export function garageTerrainSurfaceCache(): ReadonlyArray<{ mapId: string; built: boolean; holds: number }> {
  return [...terrainCache.values()].map((entry) => ({ mapId: entry.mapId, built: !!entry.done, holds: entry.holds }));
}

function disposeMaterials(materials: readonly THREE.Material[], textures: readonly THREE.Texture[]): void {
  const owned = new Set<THREE.Texture>(textures);
  for (const material of materials) {
    for (const value of Object.values(material)) if ((value as THREE.Texture | null)?.isTexture) owned.add(value as THREE.Texture);
    material.dispose();
  }
  for (const texture of owned) texture.dispose();
}

// ---- no DOM (the receipts under Node) ------------------------------------------------------------------------------

function headless(): boolean {
  return typeof document === 'undefined' || typeof (document as { createElement?: unknown }).createElement !== 'function';
}

/**
 * Run one synchronous step of the surface build with a stand-in canvas when there is no DOM: the world's painters write
 * their texels into a canvas (proceduralTexture.ts), which Node lacks. The stand-in is in place only for the step, so
 * every other `typeof document` test in the Garage still sees what the receipt set up. In a browser it is never used.
 */
export function withHeadlessCanvas<T>(step: () => T): T {
  if (!headless()) return step();
  const scope = globalThis as { document?: unknown; ImageData?: unknown };
  const hadDocument = 'document' in scope, savedDocument = scope.document;
  const hadImageData = 'ImageData' in scope, savedImageData = scope.ImageData;
  scope.document = { createElement: () => headlessCanvas() };
  if (!hadImageData) {
    scope.ImageData = class {
      data: Uint8ClampedArray; width: number; height: number;
      constructor(data: Uint8ClampedArray, width: number, height: number) { this.data = data; this.width = width; this.height = height; }
    };
  }
  try { return step(); } finally {
    if (hadDocument) scope.document = savedDocument; else delete scope.document;
    if (hadImageData) scope.ImageData = savedImageData; else delete scope.ImageData;
  }
}

function headlessCanvas(): { width: number; height: number; getContext(): unknown } {
  const canvas = { width: 0, height: 0, getContext: (): unknown => context };
  const context: unknown = new Proxy({
    canvas,
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128), width: w, height: h }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}),
    measureText: () => ({ width: 0 }),
  }, { get: (target, key) => (target as Record<PropertyKey, unknown>)[key] ?? (() => {}) });
  return canvas;
}

/**
 * The material kinds a Garage pack draws besides its structures' and set pieces' own buckets: its kit, facility and
 * approach builders' (garage-env-276: none of them wears a print buildStructureSurfaces may leave undrawn).
 */
export const GARAGE_OWN_KINDS: ReadonlySet<string> = new Set([
  'plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked', 'steel',
  'structureMetal', 'structureWood',
]);

/** The kinds a pack draws: its own, and every bucket its structures and set pieces filled. */
export function garageDrawnKinds(...bucketSets: ReadonlyArray<Readonly<Record<string, unknown>>>): ReadonlySet<string> {
  const drawn = new Set(GARAGE_OWN_KINDS);
  for (const buckets of bucketSets) {
    for (const [key, list] of Object.entries(buckets)) if (Array.isArray(list) && list.length) drawn.add(key);
  }
  return drawn;
}
