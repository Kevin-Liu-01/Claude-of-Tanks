// src/world/maps/regional/release/index.ts — Verdant's kit as the release carries it (the facades lane, 2026-10-09: r10vx,
// the ruling for tonight's deploy if both round ten and r10v drop on Verdant in the release wave). The kolkhoz kit and the
// shared kit kernel it builds on (geometry, house, facade, openings, dressing, weather, yards) are the release's own
// sources (integ/rc 9cd86e339), copied here unchanged but for their import paths, so the craft rounds three to ten never
// reach Verdant; props.ts builds Verdant's houses, yard sheds and gardens through this module (VERDANT_RELEASE_MAP).
import type * as THREE from 'three';
import { getDeviceTier } from '../../../../engine/quality.ts';
import { hashSeed, streamFrom, REGIONAL_BUCKETS, type RegionalParts } from './geometry.ts';
import { DEFAULT_WEATHER, pickWeatherTints, weatherRegionalParts } from './weather.ts';
import { withWear } from './house.ts';
import { KOLKHOZ_STYLE } from './kolkhoz.ts';
import type { ArchitectureStyle, BaseBounds, RegionalBuildContext } from './types.ts';

/** The map whose kit is the release's (props.ts builds its kit structures through this module). */
export const VERDANT_RELEASE_MAP = 'verdant';
/** The release's kolkhoz kit (Verdant's), surfaces, tones, builders and yards. */
export const RELEASE_KOLKHOZ_STYLE: ArchitectureStyle = KOLKHOZ_STYLE;
export { gardenParts as releaseGardenParts } from './yards.ts';

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
export function buildReleaseParts(style: ArchitectureStyle, ctx: RegionalBuildContext, weatherRng: () => number): RegionalParts {
  const palette = style.weather ?? DEFAULT_WEATHER;
  const builder = style.builders[ctx.structureId];
  if (!builder) throw new Error(`${style.id} has no ${ctx.structureId}`);
  // war wear (burnt and boarded windows, stripped roof patches) draws from its own fork of the weather stream
  const wearSeed = Math.floor(weatherRng() * 4294967296);
  // (and the facade craft's slot, house.ts withWear: window heads, thatch courses, gutter brackets ... on desktop builds, its
  // choices from a stream of its own forked from the same seed — the build, look, wear and weather streams draw as before)
  const wear = { amount: style.wear ?? 0.2, rng: streamFrom(wearSeed), spall: streamFrom((wearSeed ^ 0x9e3779b9) >>> 0),
    facade: { tier: ctx.tier, rng: streamFrom((wearSeed ^ 0x6a09e667) >>> 0) } };
  const tints = pickWeatherTints(palette, weatherRng);
  const parts = weatherRegionalParts(withWear(wear, () => builder(ctx)), tints, { damp: palette.damp, moss: palette.moss, mossTint: palette.mossTint });
  // map revival lane 2 (2026-10-05): a style's finer render (surfaces.relief) — the walls' tile repeats plasterUv times as
  // often; absent, every UV stays as it was
  const relief = style.surfaces.relief;
  if (relief) {
    for (const name of ['regionalPlaster', 'regionalPlaster2', 'regionalPlaster3'] as const) {
      for (const geometry of parts[name]) {
        const uv = geometry.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * relief.plasterUv, uv.getY(i) * relief.plasterUv);
      }
    }
  }
  // a phone never builds the fine joinery (geometry.ts EmitOptions.fine: frames, glazing bars, rails, door panels);
  // it is dressing, so the collision stays the desktop's
  if (ctx.tier === 'mobile') {
    for (const name of REGIONAL_BUCKETS) {
      const list = parts[name];
      if (!list?.some((g) => g.userData.fine)) continue;
      for (const g of list) if (g.userData.fine) g.dispose();
      parts[name] = list.filter((g) => !g.userData.fine);
    }
  }
  return parts;
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
export function rebuildReleaseStructure(
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
    // the world pose, for look and form choices only (types.ts RegionalBuildContext)
    x, z, yaw,
  };
  // the walls and roofs take the building's own tints and weathering (weather.ts), from a stream of their own
  const parts = buildReleaseParts(style, ctx,
    streamFrom(hashSeed(`${style.id}:weather:${context.mapId}:${structureId}`, context.seed, x, z, yaw)));
  for (const list of Object.values(base)) if (Array.isArray(list)) for (const geometry of list) geometry.dispose();
  const out = {} as PropsLikeBuckets;
  for (const name of REGIONAL_BUCKETS) out[name] = parts[name] ?? [];
  return out;
}
