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
import { dropSliverTriangles, hashSeed, streamFrom, REGIONAL_BUCKETS, type RegionalParts } from './geometry.ts';
import { DEFAULT_WEATHER, paintRatio, pickWeatherTints, weatherRegionalParts, type WeatherTints } from './weather.ts';
import { withHousePlans, withWear, type HousePlan } from './house.ts';
import { withRuinWalls, type WallPieceReading } from './shell.ts';
import { withLattices, type LatticeReading } from './lattice.ts';
import { registerHouseDamageKits } from './damage.ts';
import { setKitPlanReader } from '../../destructionKit.ts';
import { preloadEveryKit } from '../../kitRegistryNode.ts';
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

// ---- THE STYLE REGISTRY (2026-10-15, the perf lane) ----------------------------------------------------------------
// Every architecture style is ONE ROW of STYLE_TABLE: its id, the export its module defines it as, and the module's
// loader. A new kit (LOOKS, Lane C, MAPS) is one more row here; nothing else loads a style module on demand (a kit's own
// static imports of another style — eifel's of hessian, lorrainMill's of lorrain — stay the kits' business).
// - The browser loads a map's styles when its world build starts (worldKits.ts loadMapKits, from map.ts
//   createMapAsync), so a battle entry downloads and compiles the kits it builds, not all of them (the 10-15
//   census: the world chunk carried every kit, 1.52 M of its 3.8 M characters, the chunk 276 KB -> 1.92 MB since Sept 30).
// - Node (the headless collision builds, the server's world, the receipts, the bake tools) loads every style with this
//   module, in this table's order, before any module importing it runs (kitRegistryNode.ts), as the static imports did,
//   so every synchronous builder and every receipt that iterates ARCHITECTURE_STYLES sees every kit.
// A style asked for before it is loaded (the browser only) fails closed with its id: never a silent fallback.
interface StyleRow { readonly name: string; readonly load: () => Promise<Record<string, unknown>> }
const STYLE_TABLE: Readonly<Record<string, StyleRow>> = Object.freeze({
  hessian: { name: 'HESSIAN_STYLE', load: () => import('./hessian.ts') },
  savoyard: { name: 'SAVOYARD_STYLE', load: () => import('./savoyard.ts') },
  dalmatian: { name: 'DALMATIAN_STYLE', load: () => import('./dalmatian.ts') },
  breton: { name: 'BRETON_STYLE', load: () => import('./breton.ts') },
  kolkhoz: { name: 'KOLKHOZ_STYLE', load: () => import('./kolkhoz.ts') },
  goral: { name: 'GORAL_STYLE', load: () => import('./goral.ts') },
  polder: { name: 'POLDER_STYLE', load: () => import('./polder.ts') },
  eifel: { name: 'EIFEL_STYLE', load: () => import('./eifel.ts') },
  mekong: { name: 'MEKONG_STYLE', load: () => import('./mekong.ts') },
  nordland: { name: 'NORDLAND_STYLE', load: () => import('./nordland.ts') },
  bengal: { name: 'BENGAL_STYLE', load: () => import('./bengal.ts') },
  franconian: { name: 'FRANCONIAN_STYLE', load: () => import('./franconian.ts') },
  ksar: { name: 'KSAR_STYLE', load: () => import('./ksar.ts') },
  arctic: { name: 'ARCTIC_STYLE', load: () => import('./arctic.ts') },
  siwa: { name: 'SIWA_STYLE', load: () => import('./ksar.ts') },
  wadirum: { name: 'WADIRUM_STYLE', load: () => import('./wadirum.ts') },
  ruhr: { name: 'RUHR_STYLE', load: () => import('./ruhr.ts') },
  kohima: { name: 'KOHIMA_STYLE', load: () => import('./kohima.ts') },
  hostomel: { name: 'HOSTOMEL_STYLE', load: () => import('./hostomel.ts') },
  kyushu: { name: 'KYUSHU_STYLE', load: () => import('./kyushu.ts') },
  queenstown: { name: 'QUEENSTOWN_STYLE', load: () => import('./queenstown.ts') },
  glencanyon: { name: 'GLENCANYON_STYLE', load: () => import('./glencanyon.ts') },
  navajo: { name: 'NAVAJO_STYLE', load: () => import('./navajo.ts') },
  saar: { name: 'SAAR_STYLE', load: () => import('./saar.ts') },
  shanghai: { name: 'SHANGHAI_STYLE', load: () => import('./shanghai.ts') },
  longleaf: { name: 'LONGLEAF_STYLE', load: () => import('./longleaf.ts') },
  sarajevo: { name: 'SARAJEVO_STYLE', load: () => import('./sarajevo.ts') },
  andalusian: { name: 'ANDALUSIAN_STYLE', load: () => import('./andalusian.ts') },
  chouf: { name: 'CHOUF_STYLE', load: () => import('./chouf.ts') },
  lorrain: { name: 'LORRAIN_STYLE', load: () => import('./lorrain.ts') },
  tselina: { name: 'TSELINA_STYLE', load: () => import('./tselina.ts') },
});

const loadedStyles = new Map<string, ArchitectureStyle>();
export const ARCHITECTURE_STYLE_IDS: readonly string[] = Object.freeze(Object.keys(STYLE_TABLE));
/** Every loaded kit in the table's order (receipts iterate it): in Node every kit; in the browser the map's. */
export const ARCHITECTURE_STYLES: readonly ArchitectureStyle[] = [];
function admitStyle(id: string, style: ArchitectureStyle | undefined): void {
  if (loadedStyles.has(id)) return;
  if (!style || style.id !== id) throw new Error(`Architecture style ${id}: its module does not export it`);
  loadedStyles.set(id, style);
  const list = ARCHITECTURE_STYLES as ArchitectureStyle[];
  list.length = 0;
  for (const key of ARCHITECTURE_STYLE_IDS) { const loaded = loadedStyles.get(key); if (loaded) list.push(loaded); }
  // the destruction seam (docs/DESTRUCTION.md §16): each style's damage kit, as it loads
  registerHouseDamageKits([style]);
}
/** Load these styles (ids null/undefined are skipped); an unknown id fails as resolveRegionalArchitecture does. */
export async function loadRegionalArchitectures(ids: Iterable<string | null | undefined>): Promise<void> {
  const wanted = [...new Set([...ids].filter((id): id is string => id != null))];
  for (const id of wanted) if (!STYLE_TABLE[id]) throw unknownStyle(id);
  const modules = await Promise.all(wanted.map((id) => (loadedStyles.has(id) ? null : STYLE_TABLE[id].load())));
  // admitted in the table's order whatever order the modules arrived in
  wanted.forEach((id, k) => { if (modules[k]) admitStyle(id, modules[k]![STYLE_TABLE[id].name] as ArchitectureStyle); });
}
const unknownStyle = (id: string): Error => new Error(`Unknown architecture style ${id} (known: ${ARCHITECTURE_STYLE_IDS.join(', ')})`);
// Node: every style now, one module after another in the table's order (kitRegistryNode.ts)
if (preloadEveryKit()) {
  for (const id of ARCHITECTURE_STYLE_IDS) admitStyle(id, (await STYLE_TABLE[id].load())[STYLE_TABLE[id].name] as ArchitectureStyle);
}
// the destruction seam (docs/DESTRUCTION.md §16): every style's damage kit registers as the style loads (admitStyle:
// its anatomy read from the house plan), and the plan's reader the world's describe call sites use (kitPlanFor: the
// world builder imports no kit)
setKitPlanReader((parts) => regionalKitPlanOf(parts));

/** The kit a map authored (`props.architecture`), or null. An unknown id fails closed; so does one not loaded yet. */
export function resolveRegionalArchitecture(id: string | null | undefined): ArchitectureStyle | null {
  if (id == null) return null;
  if (!STYLE_TABLE[id]) throw unknownStyle(id);
  const style = loadedStyles.get(id);
  if (!style) {
    throw new Error(`Architecture style ${id} is not loaded: the world build loads its map's styles first `
      + '(maps/regional/index.ts loadRegionalArchitectures)');
  }
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

/** A folding kit's third-paint ratio, once per kit (weather.ts paintRatio of its own surfaces.tones). */
const folds = new WeakMap<ArchitectureStyle, ReturnType<typeof paintRatio>>();
function foldOf(style: ArchitectureStyle): ReturnType<typeof paintRatio> {
  let fold = folds.get(style);
  if (!fold) { fold = paintRatio(style.surfaces.tones?.plaster2, style.surfaces.tones?.plaster3); folds.set(style, fold); }
  return fold;
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
  /** a ruin builder's standing walls as it built them (shell.ts ruinWall; props census E11) */
  ruinWalls?: WallPieceReading[];
  /** the open lattice frames the builder laid (lattice.ts latticeFrame; props census #3) */
  lattices?: LatticeReading[];
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
  const [[[built, houses], ruinWalls], lattices] = withLattices(() => withRuinWalls(() => withHousePlans(() => withWear(wear, () => builder(ctx)))));
  // (the map-revival lane, 2026-10-07: a kit that folds its third plaster paint into its second's bucket,
  // ArchitectureStyle.foldThirdPlaster, by the colour of its own two paints)
  // (the looks lane, 2026-10-14, the 225 integrity ledger: a war-worn window's thin strips and the damp band's cut at a
  // sill that lies a float's breadth under it leave zero-area and sliver triangles; they cover nothing, so they go)
  const parts = dropSliverTriangles(weatherRegionalParts(built, tints, { damp: palette.damp, moss: palette.moss, mossTint: palette.mossTint, sun, legacy,
    ...(style.foldThirdPlaster ? { plaster3Fold: foldOf(style) } : {}) }));
  KIT_PLANS.set(parts, { kind: 'regional-house', style: style.id, builder: ctx.structureId, houses, tints, info: ctx.info,
    ...(ruinWalls.length ? { ruinWalls } : {}), ...(lattices.length ? { lattices } : {}) });
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
