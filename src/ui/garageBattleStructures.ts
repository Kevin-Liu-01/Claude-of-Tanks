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
}

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
  readonly surfaces: StructureSurfaces;
  /** The materials and shader-only textures the surfaces own (the pack disposes them). */
  readonly materials: readonly THREE.Material[];
  readonly textures: readonly THREE.Texture[];
  /**
   * The shadow-cascade registrations the surfaces asked for while they were prepared, replayed by the pack's bake on its
   * own engine context (which notes them for release with the pack).
   */
  readonly shadowRegistrations: ReadonlyArray<readonly [THREE.Material, ShaderHook | null | undefined]>;
}

const nextSlice = (): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, 0); });
/** A prepare slice's budget: the surfaces' checkpoints run until it is spent, then the frame gets the thread. */
const SLICE_MS = 6;

/**
 * Paint a map's structure surfaces in slices (the world build's own checkpoints, gathered into ~6 ms slices). Resolves
 * null when `wanted` turns false part-way: what it made is disposed.
 */
export async function prepareGarageStructureSurfaces(
  map: GarageMapStructures,
  anisotropy: number,
  wanted: () => boolean,
): Promise<GarageStructureSurfaces | null> {
  const { steps, shadowRegistrations, retained } = startStructureSurfaces(map, anisotropy);
  const prefetch = surfacePaints.get(map.mapId) ?? null;
  let sliceStart = performance.now();
  let step = steps.next();
  while (!step.done) {
    // a print the worker painted ahead, as the world build takes it (props.ts createPropsAsync); a failed one is painted
    // where it stands
    const request = (step.value as { surfacePaint?: { key: string; result: Record<string, unknown> | null } } | undefined)
      ?.surfacePaint;
    const ahead = request && prefetch ? prefetch.take(request.key) : null;
    if (ahead && request) {
      try { request.result = await ahead; } catch { request.result = null; }
      sliceStart = performance.now();
    }
    if (performance.now() - sliceStart >= SLICE_MS) {
      await nextSlice();
      if (!wanted()) {
        steps.return(undefined as never);
        disposeMaterials(retained.materials, retained.textures);
        return null;
      }
      sliceStart = performance.now();
    }
    step = steps.next();
  }
  return { surfaces: step.value, materials: retained.materials, textures: retained.textures, shadowRegistrations };
}

/** The same surfaces in one go (a bake with nothing prepared: the receipts under Node). */
export function buildGarageStructureSurfacesNow(map: GarageMapStructures, anisotropy: number): GarageStructureSurfaces {
  const { steps, shadowRegistrations, retained } = startStructureSurfaces(map, anisotropy);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return { surfaces: step.value, materials: retained.materials, textures: retained.textures, shadowRegistrations };
}

function startStructureSurfaces(map: GarageMapStructures, anisotropy: number) {
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
    // (no DOM, the receipts under Node: no photographed sets to fetch; the procedural prints are the fallback of record)
    sourceApplication: typeof document === 'undefined' ? { signal: AbortSignal.abort() } : {},
    onRetained: (materials, textures) => { retained.materials = materials; retained.textures = textures; },
  });
  return { steps, shadowRegistrations, retained };
}

/** Every texture a map's prepared surfaces draw (the pack disposes them with its materials). */
export function garageStructureSurfaceTextures(prepared: GarageStructureSurfaces): Set<THREE.Texture> {
  const owned = new Set<THREE.Texture>(prepared.textures);
  for (const material of prepared.materials) {
    for (const value of Object.values(material)) if ((value as THREE.Texture | null)?.isTexture) owned.add(value as THREE.Texture);
  }
  return owned;
}

function disposeMaterials(materials: readonly THREE.Material[], textures: readonly THREE.Texture[]): void {
  const owned = new Set<THREE.Texture>(textures);
  for (const material of materials) {
    for (const value of Object.values(material)) if ((value as THREE.Texture | null)?.isTexture) owned.add(value as THREE.Texture);
    material.dispose();
  }
  for (const texture of owned) texture.dispose();
}

/** Release a map's prepared surfaces (its materials and every texture they draw). */
export function disposeGarageStructureSurfaces(prepared: GarageStructureSurfaces): void {
  disposeMaterials(prepared.materials, prepared.textures);
}
