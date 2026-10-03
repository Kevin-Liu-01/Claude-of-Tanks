// src/world/maps/regional/index.ts — regional architecture kits (regional-buildings lane, 2026-10-03).
//
// A map names its kit in `props.architecture` (one line in the map file). The plan builder of every planned building
// still runs first, exactly as before: it draws its seeded stream, the catalog exterior, the ground fit, the UV
// jitter and the road frontage all see the base geometry, so every placement on the map — this building's pose, every
// later building, every wall, rock and crate — stays where it was. Only then, before its collision is derived and its
// parts merge into the map's buckets, the kit REPLACES the building's geometry with the region's version of the same
// structure: same footprint, same door side, the region's construction. The kit draws from a stream forked from the
// building's identity (map, structure, world pose), never from the placement stream.
//
// Collision is derived from the regional geometry (structureCollision.ts), so a map that adopts or changes a kit
// regenerates its collision shard (tools/capture-world-collision-manifests.mjs --node --maps <id>).
import type * as THREE from 'three';
import { getDeviceTier } from '../../../engine/quality.ts';
import { hashSeed, streamFrom, REGIONAL_BUCKETS, type RegionalParts } from './geometry.ts';
import { DEFAULT_WEATHER, pickWeatherTints, weatherRegionalParts } from './weather.ts';
import { withWear } from './house.ts';
import { HESSIAN_STYLE } from './hessian.ts';
import { DALMATIAN_STYLE } from './dalmatian.ts';
import { BRETON_STYLE } from './breton.ts';
import { KOLKHOZ_STYLE } from './kolkhoz.ts';
import { POLDER_STYLE } from './polder.ts';
import { EIFEL_STYLE } from './eifel.ts';
import { MEKONG_STYLE } from './mekong.ts';
import { BENGAL_STYLE } from './bengal.ts';
import { FRANCONIAN_STYLE } from './franconian.ts';
import { KSAR_STYLE } from './ksar.ts';
import { WADIRUM_STYLE } from './wadirum.ts';
import { RUHR_STYLE } from './ruhr.ts';
import { KOHIMA_STYLE } from './kohima.ts';
import type { ArchitectureStyle, BaseBounds, RegionalBuildContext } from './types.ts';

export type { ArchitectureStyle } from './types.ts';

const STYLES: Readonly<Record<string, ArchitectureStyle>> = Object.freeze({
  hessian: HESSIAN_STYLE,
  dalmatian: DALMATIAN_STYLE,
  breton: BRETON_STYLE,
  kolkhoz: KOLKHOZ_STYLE,
  polder: POLDER_STYLE,
  eifel: EIFEL_STYLE,
  mekong: MEKONG_STYLE,
  bengal: BENGAL_STYLE,
  franconian: FRANCONIAN_STYLE,
  ksar: KSAR_STYLE,
  wadirum: WADIRUM_STYLE,
  ruhr: RUHR_STYLE,
  kohima: KOHIMA_STYLE,
});

export const ARCHITECTURE_STYLE_IDS: readonly string[] = Object.freeze(Object.keys(STYLES));
/** Every registered kit (receipts iterate it). */
export const ARCHITECTURE_STYLES: readonly ArchitectureStyle[] = Object.freeze(Object.values(STYLES));

/** The kit a map authored (`props.architecture`), or null. An unknown id fails closed. */
export function resolveRegionalArchitecture(id: string | null | undefined): ArchitectureStyle | null {
  if (id == null) return null;
  const style = STYLES[id];
  if (!style) throw new Error(`Unknown architecture style ${id} (known: ${ARCHITECTURE_STYLE_IDS.join(', ')})`);
  return style;
}

type Buckets = Record<string, THREE.BufferGeometry[]>;
/** The bucket set props.ts merges (exteriorDetailKit's GeometryBuckets: the five masonry/roof/timber families). */
type PropsLikeBuckets = Buckets & { plaster: THREE.BufferGeometry[]; stone: THREE.BufferGeometry[]; roof: THREE.BufferGeometry[];
  wood: THREE.BufferGeometry[]; dark: THREE.BufferGeometry[] };

function measure(buckets: Buckets): BaseBounds {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, maxY: -Infinity };
  for (const list of Object.values(buckets)) {
    if (!Array.isArray(list)) continue;
    for (const geometry of list) {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (!box || box.isEmpty()) continue;
      b.minX = Math.min(b.minX, box.min.x); b.maxX = Math.max(b.maxX, box.max.x);
      b.minZ = Math.min(b.minZ, box.min.z); b.maxZ = Math.max(b.maxZ, box.max.z);
      b.maxY = Math.max(b.maxY, box.max.y);
    }
  }
  return b;
}

/**
 * A kit's whole build of one structure: the builder's parts, then the building's own tint and weathering
 * (weather.ts) drawn from `weatherRng` (never the build stream). Receipts build through this too.
 */
export function buildRegionalParts(style: ArchitectureStyle, ctx: RegionalBuildContext, weatherRng: () => number): RegionalParts {
  const palette = style.weather ?? DEFAULT_WEATHER;
  const builder = style.builders[ctx.structureId];
  if (!builder) throw new Error(`${style.id} has no ${ctx.structureId}`);
  // war wear (burnt and boarded windows, stripped roof patches) draws from its own fork of the weather stream
  const wear = { amount: style.wear ?? 0.2, rng: streamFrom(Math.floor(weatherRng() * 4294967296)) };
  const tints = pickWeatherTints(palette, weatherRng);
  return weatherRegionalParts(withWear(wear, () => builder(ctx)), tints, { damp: palette.damp, moss: palette.moss, mossTint: palette.mossTint });
}

interface RebuildContext {
  mapId: string;
  snowCap: boolean;
  seed: number;
}

/**
 * Replace a placed building's base geometry with its regional version. Returns the new bucket set (the base parts are
 * disposed), or null when the kit has no version of this structure (the base geometry stays).
 */
export function rebuildRegionalStructure(
  style: ArchitectureStyle, structureId: string, base: Buckets, info: { w: number; d: number; h: number },
  wallBucket: string, context: RebuildContext, x: number, z: number, yaw: number,
): PropsLikeBuckets | null {
  const builder = style.builders[structureId];
  if (!builder) return null;
  const bounds = measure(base);
  const ctx: RegionalBuildContext = {
    structureId, info, bounds, wallBucket,
    rng: streamFrom(hashSeed(`${style.id}:${context.mapId}:${structureId}`, context.seed, x, z, yaw)),
    variant: streamFrom(hashSeed(`${style.id}:variant:${context.mapId}:${structureId}`, context.seed, x, z, yaw)),
    mapId: context.mapId, snowCap: context.snowCap, tier: getDeviceTier() === 'mobile' ? 'mobile' : 'desktop',
  };
  // the walls and roofs take the building's own tints and weathering (weather.ts), from a stream of their own
  const parts = buildRegionalParts(style, ctx,
    streamFrom(hashSeed(`${style.id}:weather:${context.mapId}:${structureId}`, context.seed, x, z, yaw)));
  for (const list of Object.values(base)) if (Array.isArray(list)) for (const geometry of list) geometry.dispose();
  const out = {} as PropsLikeBuckets;
  for (const name of REGIONAL_BUCKETS) out[name] = parts[name] ?? [];
  return out;
}
