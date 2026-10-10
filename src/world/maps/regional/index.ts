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
import { DEFAULT_WEATHER, pickWeatherTints, weatherRegionalParts, type WeatherTints } from './weather.ts';
import { withHousePlans, withWear, type HousePlan } from './house.ts';
import { registerHouseDamageKits } from './damage.ts';
import { setKitPlanReader } from '../../destructionKit.ts';
import { HESSIAN_STYLE } from './hessian.ts';
import { SAVOYARD_STYLE } from './savoyard.ts';
import { DALMATIAN_STYLE } from './dalmatian.ts';
import { BRETON_STYLE } from './breton.ts';
import { KOLKHOZ_STYLE } from './kolkhoz.ts';
import { POLDER_STYLE } from './polder.ts';
import { EIFEL_STYLE } from './eifel.ts';
import { MEKONG_STYLE } from './mekong.ts';
import { BENGAL_STYLE } from './bengal.ts';
import { FRANCONIAN_STYLE } from './franconian.ts';
import { KSAR_STYLE, SIWA_STYLE } from './ksar.ts';
import { WADIRUM_STYLE } from './wadirum.ts';
import { RUHR_STYLE } from './ruhr.ts';
import { KOHIMA_STYLE } from './kohima.ts';
import { HOSTOMEL_STYLE } from './hostomel.ts';
import { KYUSHU_STYLE } from './kyushu.ts';
import { QUEENSTOWN_STYLE } from './queenstown.ts';
import { GLENCANYON_STYLE } from './glencanyon.ts';
import { NAVAJO_STYLE } from './navajo.ts';
import { SAAR_STYLE } from './saar.ts';
import { SHANGHAI_STYLE } from './shanghai.ts';
import { LONGLEAF_STYLE } from './longleaf.ts';
import { SARAJEVO_STYLE } from './sarajevo.ts';
import { ANDALUSIAN_STYLE } from './andalusian.ts';
import { CHOUF_STYLE } from './chouf.ts';
import type { ArchitectureStyle, BaseBounds, RegionalBuildContext, RegionalGround } from './types.ts';

export type { ArchitectureStyle } from './types.ts';

/**
 * (the facades lane, round 10, 2026-10-09) the maps whose kit is gated back to the craft's older layers: no wall-foot
 * apron, strip or water table, the plain render losses, the roofs weathered without their age, the straw print on the
 * thatch, and the props' own grime on the walls (facade.ts facadeLegacy; props.ts, weather.ts). A map lands here when
 * its view drops in a gauntlet wave against the release; empty, every kit map takes the whole craft
 */
// (2026-10-09, the release's wave: the owner's favourite village keeps the look it ships with) Verdant
export const KIT_LEGACY_MAPS: ReadonlySet<string> = new Set<string>(['verdant']);
/** True when a map's kit is gated back (KIT_LEGACY_MAPS). */
export function kitLegacy(mapId: string): boolean {
  return KIT_LEGACY_MAPS.has(mapId);
}

const STYLES: Readonly<Record<string, ArchitectureStyle>> = Object.freeze({
  hessian: HESSIAN_STYLE,
  savoyard: SAVOYARD_STYLE,
  dalmatian: DALMATIAN_STYLE,
  breton: BRETON_STYLE,
  kolkhoz: KOLKHOZ_STYLE,
  polder: POLDER_STYLE,
  eifel: EIFEL_STYLE,
  mekong: MEKONG_STYLE,
  bengal: BENGAL_STYLE,
  franconian: FRANCONIAN_STYLE,
  ksar: KSAR_STYLE,
  siwa: SIWA_STYLE,
  wadirum: WADIRUM_STYLE,
  ruhr: RUHR_STYLE,
  kohima: KOHIMA_STYLE,
  hostomel: HOSTOMEL_STYLE,
  kyushu: KYUSHU_STYLE,
  queenstown: QUEENSTOWN_STYLE,
  glencanyon: GLENCANYON_STYLE,
  navajo: NAVAJO_STYLE,
  saar: SAAR_STYLE,
  shanghai: SHANGHAI_STYLE,
  longleaf: LONGLEAF_STYLE,
  sarajevo: SARAJEVO_STYLE,
  andalusian: ANDALUSIAN_STYLE,
  chouf: CHOUF_STYLE,
});

export const ARCHITECTURE_STYLE_IDS: readonly string[] = Object.freeze(Object.keys(STYLES));
/** Every registered kit (receipts iterate it). */
export const ARCHITECTURE_STYLES: readonly ArchitectureStyle[] = Object.freeze(Object.values(STYLES));
// the destruction seam (docs/DESTRUCTION.md §16): every style's damage kit, its anatomy read from the house plan, and
// the plan's reader the world's describe call sites use (kitPlanFor: the world builder imports no kit)
registerHouseDamageKits(ARCHITECTURE_STYLES);
setKitPlanReader((parts) => regionalKitPlanOf(parts));

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
 * A regional build's plan, handed back beside its parts for the destruction seam (docs/DESTRUCTION.md §16.2
 * StructureDescribeInput.kitPlan; damage.ts describe reads it): the style and builder, every house body the builder
 * built (house.ts HousePlan: its spec, frame, placement, uv offset and Fachwerk members), the building's weather tints
 * and its plan footprint. A builder that builds no house body hands back an empty `houses` (the default kit reads it).
 */
export interface RegionalKitPlan {
  kind: 'regional-house';
  style: string;
  builder: string;
  houses: HousePlan[];
  tints: WeatherTints;
  info: { w: number; d: number; h: number };
}
const KIT_PLANS = new WeakMap<object, RegionalKitPlan>();
/** The plan a regional build (buildRegionalParts, rebuildRegionalStructure) handed back beside these parts. */
export function regionalKitPlanOf(parts: object): RegionalKitPlan | undefined {
  return KIT_PLANS.get(parts);
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
  const wearSeed = Math.floor(weatherRng() * 4294967296);
  // (and the facade craft's slot, house.ts withWear: window heads, thatch courses, gutter brackets ... on desktop builds, its
  // choices from a stream of its own forked from the same seed — the build, look, wear and weather streams draw as before)
  const legacy = kitLegacy(ctx.mapId);
  const wear = { amount: style.wear ?? 0.2, rng: streamFrom(wearSeed), spall: streamFrom((wearSeed ^ 0x9e3779b9) >>> 0),
    facade: { tier: ctx.tier, rng: streamFrom((wearSeed ^ 0x6a09e667) >>> 0), stone: style.surfaces.stone, ground: ctx.ground,
      groundCraft: style.groundCraft !== false && !legacy, legacy } };
  const tints = pickWeatherTints(palette, weatherRng);
  // (the facades lane, round 6) the sun's horizontal direction in the building's frame: the slopes turned from it
  // weather greener (a world direction turned back through the building's yaw, as props.ts places it)
  const sun = ctx.sunAzimuthDeg !== undefined ? (() => {
    const a = ctx.sunAzimuthDeg * Math.PI / 180, wx = Math.sin(a), wz = Math.cos(a), yaw = ctx.yaw ?? 0, c = Math.cos(yaw), s = Math.sin(yaw);
    return [wx * c - wz * s, wx * s + wz * c] as const;
  })() : null;
  const [built, houses] = withHousePlans(() => withWear(wear, () => builder(ctx)));
  const parts = weatherRegionalParts(built, tints, { damp: palette.damp, moss: palette.moss, mossTint: palette.mossTint, sun, legacy });
  KIT_PLANS.set(parts, { kind: 'regional-house', style: style.id, builder: ctx.structureId, houses, tints, info: ctx.info });
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
  /** the ground the building is seated on, in its frame (RegionalBuildContext.ground) */
  ground?: RegionalGround;
  /** the map's sun azimuth, degrees (RegionalBuildContext.sunAzimuthDeg) */
  sunAzimuthDeg?: number;
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
    // the world pose, for look and form choices only (types.ts RegionalBuildContext)
    x, z, yaw,
    ...(context.ground ? { ground: context.ground } : {}),
    ...(context.sunAzimuthDeg !== undefined ? { sunAzimuthDeg: context.sunAzimuthDeg } : {}),
  };
  // the walls and roofs take the building's own tints and weathering (weather.ts), from a stream of their own
  const parts = buildRegionalParts(style, ctx,
    streamFrom(hashSeed(`${style.id}:weather:${context.mapId}:${structureId}`, context.seed, x, z, yaw)));
  for (const list of Object.values(base)) if (Array.isArray(list)) for (const geometry of list) geometry.dispose();
  const out = {} as PropsLikeBuckets;
  for (const name of REGIONAL_BUCKETS) out[name] = parts[name] ?? [];
  const plan = KIT_PLANS.get(parts);
  if (plan) KIT_PLANS.set(out, plan);
  return out;
}
