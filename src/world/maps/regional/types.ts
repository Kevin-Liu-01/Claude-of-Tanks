// src/world/maps/regional/types.ts — the contract between props.ts and the regional architecture kits.
import type * as THREE from 'three';
import type { RegionalParts } from './geometry.ts';
import type { WeatherPalette } from './weather.ts';

/** The base geometry's measured extent (building-local, before placement). */
export interface BaseBounds {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
  maxY: number;
}

/**
 * The ground a placed building stands on, in the building's own frame (props.ts; facades lane, 2026-10-07): the wall-foot
 * strip lies on it (house.ts groundSkirt). Read-only for the geometry: nothing structural ever asks it.
 */
export interface RegionalGround {
  /** the rendered terrain's height at a point of the building's frame, over the building's base (its local y = 0) */
  at(x: number, z: number): number;
  /** keep the world's grass, tall grass and litter off a disc of the building's frame (map.ts holds it with the yards') */
  hole?(x: number, z: number, r: number): void;
}

/** Everything a regional builder may read. It never draws from the props placement stream. */
export interface RegionalBuildContext {
  structureId: string;
  /** the base builder's footprint and height (placement already used them) */
  info: { w: number; d: number; h: number };
  bounds: BaseBounds;
  /** the wall family pickWall drew for this building (stone, plaster, plaster2, plaster3) */
  wallBucket: string;
  /** the building's own stream, forked from its identity (map seed, structure, world pose) */
  rng: () => number;
  /**
   * A second stream from the same identity for a kit's look-only choices (render or bare stone, a paint): a builder may
   * draw from it anywhere without moving the build stream, so a new choice never reshuffles the geometry after it.
   */
  variant: () => number;
  mapId: string;
  snowCap: boolean;
  /** 'mobile' builds leave out the finest dressing (never a structural part: collision stays tier-independent) */
  tier: 'desktop' | 'mobile';
  /**
   * The building's world pose (props.ts: its position and yaw, a turn about +Y), for a kit whose buildings answer to
   * the place rather than the plot: a hogan's door to the sunrise, a street row zoned by its distance from the valley
   * axis. Absent outside a placed rebuild (a yard's outbuilding, the receipts' harness).
   *
   * The rule: a kit uses x, z and yaw only for look and form choices inside the plot. It never draws from the placement
   * stream (the context holds no such stream; the receipt's placement harness checks the stream draws exactly as
   * without the kit) and never changes the footprint (regionalArchitecture.selftest.mjs builds every builder at several
   * poses and holds each pose's solid envelope to the plot and the unposed build's reach).
   */
  x?: number;
  z?: number;
  yaw?: number;
  /** the ground under the placed building (absent in a bare build: the receipts, a donor); see RegionalGround */
  ground?: RegionalGround;
  /**
   * The map's sun azimuth (degrees, its sky's sunAzimuthDeg: 0 toward +z, 90 toward +x), for the weathering only: the
   * slopes turned from the sun grow their moss and lichen (weather.ts). Absent (a bare build), no slope is favoured.
   */
  sunAzimuthDeg?: number;
}

export type RegionalBuilder = (ctx: RegionalBuildContext) => RegionalParts;

/** Procedural surface painters a style selects for the roof and stone buckets (regionalSurfaces.ts). */
export type RoofSurfaceKind = 'beavertail' | 'canal' | 'slate' | 'pantile' | 'sheet' | 'asbestos' | 'shingle';
/**
 * An HSL remap of a procedural surface (props.ts ToneFunction). A render tone may also name its painter: `paint`
 * lime-wash brushed over mud plaster (regionalSurfaces.ts paintLimewash, its own seed) in place of the plain render.
 */
export type SurfaceTone = ((hue: number, saturation: number, lightness: number) => readonly [number, number, number])
  & { paint?: { kind: RenderSurfaceKind; seed: number } };
/** Procedural painters of the render canvases (regionalSurfaces.ts): lime-wash over mud plaster, a town's lime render. */
export type RenderSurfaceKind = 'limewash' | 'limeRender';
export type StoneSurfaceKind = 'sandstone' | 'limestone' | 'granite' | 'brick' | 'greywacke' | 'rubble' | 'block' | 'gneiss' | 'fieldstone';
/** Poured concrete prints a style can paint its plaster2 bucket with (regionalSurfaces.ts makeRegionalConcrete). */
export type ConcreteSurfaceKind = 'boardFormed';

export interface ArchitectureSurfaces {
  roof: { kind: RoofSurfaceKind; tint: readonly [number, number, number] };
  /** `dressed`: a town's dressed stone — smaller courses, soiled (regionalSurfaces.ts DRESSED; the facades lane) */
  stone: { kind: StoneSurfaceKind; tint: readonly [number, number, number]; dressed?: boolean };
  /** the sourced CC0 photo sets the style keeps (the others stay procedural) */
  sourced: { plaster: boolean; wood: boolean };
  /** default tones of the procedural render / timber / thatch canvases; a map's own tones win */
  tones?: Partial<Record<'plaster' | 'plaster2' | 'plaster3' | 'wood' | 'straw', SurfaceTone>>;
  /** a style that pours its plaster2 walls: that bucket's print is the concrete's (its formwork's boards, lift lines and
   *  tie holes), toned by the plaster2 tone as the render was; absent = the render canvas */
  concrete?: ConcreteSurfaceKind;
  /** map revival lane 2 (2026-10-05): the walls' render finer and shallower than the shared tile (a limewash's skin, not a
   * coarse stucco): the tile repeats `plasterUv` times as often over the plaster buckets, its normal map at `normal`
   * strength and its cavities' occlusion at `ao`. Absent, the shared tile as it is (every other kit's surfaces unchanged). */
  relief?: { plasterUv: number; normal: number; ao: number };
  /** the facades lane (2026-10-08): the painter of the kit's three render canvases, under whatever tones the map gives
   *  them (props.ts; regionalSurfaces.ts paintLimeRender): the primary family on `seed`, plaster2 and plaster3 on one seed
   *  between them (plaster3 borrows plaster2's relief). Absent, each canvas is its tone's painter or the plain render. */
  render?: { kind: 'limeRender'; seed: number };
  /** the facades lane (2026-10-08; gauntlet wave 260): the print of the kit's thatched roofs (props.ts makeThatch): 'nipa',
   *  the Mekong delta's atap of nipa-palm leaf (regionalSurfaces.ts paintNipaThatch). Absent, the straw thatch print. */
  thatch?: { kind: 'nipa' };
}

export interface ArchitectureStyle {
  id: string;
  /** the real region the kit is drawn from (docs) */
  region: string;
  surfaces: ArchitectureSurfaces;
  builders: Readonly<Record<string, RegionalBuilder>>;
  /** per-building tint palettes and weathering strengths (weather.ts DEFAULT_WEATHER when absent) */
  weather?: WeatherPalette;
  /** share of houses showing war damage: burnt or boarded windows, a stripped roof patch (house.ts; default 0.2) */
  wear?: number;
  /**
   * The map-revival lane (2026-10-07): draw the third plaster paint from the second's bucket under a colour ratio
   * (weather.ts WeatherOptions.plaster3Fold; the two procedural renders share one relief): one draw and one shadow caster
   * fewer. Absent, the kit's three plaster buckets stay as they are.
   */
  foldThirdPlaster?: boolean;
  /**
   * the churchyard round the kit's church (the facades lane, 2026-10-06; wave 150: "both German churches stand on bare
   * dirt"): a yard on the church's freest side walled like a house's, its graves in place of the beds. A map opts in
   * (props `churchyard: true`): its walls are destructibles with colliders, so the map's collision shard regenerates
   */
  churchyard?: YardStyle;
  /** the yards round the kit's houses (yards.ts): absent, the houses stand in the open ground as before */
  yard?: YardStyle;
  /**
   * (the facades lane, round 10) the foot of the kit's houses as round 10 lays it — a plinth's water table, a wider apron
   * at the wall foot and longer door paths, the render's losses up the walls drawn no more (house.ts); false keeps the
   * foot as round 9 laid it (Verdant's khatas, the owner's favourite village). Absent: on
   */
  groundCraft?: boolean;
  /**
   * The kit's own versions of light-building families, built by the kit (props.ts swaps each in for its family's key,
   * after structureKit's REGIONAL_DESTRUCTIBLE_TYPES): absent, the families keep their generic builds.
   */
  lightVariants?: Readonly<Record<string, LightVariant>>;
}

/**
 * A kit's version of one light-building family (structureKit DESTRUCTIBLE_BUILDING_TYPES): the kit's parts and
 * weathering in one of the kit's renders, inside the family's footprint and height. It keeps the family's class, hit
 * points and collision (the family's box), so placement, cover and the layout brief never move.
 */
export interface LightVariant {
  /** the kit's render the whole building draws in: one instanced draw per family, no material of its own */
  mat: 'regionalPlaster' | 'regionalPlaster2' | 'regionalPlaster3' | 'regionalStone';
  /** the broken state's palette (structureKit debris: base, trim, dark), sRGB hex */
  pal: readonly [number, number, number];
  /**
   * The build: the building's parts, vertex-coloured (position, normal, uv, color), in the family's frame standing on
   * y = 0, no part below it and no lit window. Built once per world from the props stream: deterministic in `rng`.
   */
  parts(rng: () => number, style: ArchitectureStyle): THREE.BufferGeometry[];
}

/**
 * What a kit puts in the free ground round its houses (yards.ts plans it, props.ts places it): a yard on the house's
 * freest side, enclosed by a run of the fence or wall destructible with a gate, an outbuilding in a far corner and
 * kitchen-garden beds, each only where it clears the roads, the other plots, the objectives and the spawn pads.
 */
export interface YardStyle {
  /** the plan kinds that keep a yard */
  kinds: readonly string[];
  /** a churchyard's graves in place of the beds (yards.ts graveParts; the facades lane, 2026-10-06) */
  graves?: boolean;
  /** the yard never takes the plot's front (+z, the door's side): a church's approach stays open */
  keepFront?: boolean;
  /** the destructible kind of the enclosure's modules (a fence or a low wall) */
  fence: string;
  /** the destructible hung in the gate's gap, or none (an open gap) */
  gate: string | null;
  /** the kit builder of the outbuilding (a structure id it builds at a shed's size), or none */
  shed: string | null;
  /** the outbuilding's plot, width (along the yard) and depth (yards.ts YARD_SHED when absent): the size the kit's
   *  builder keeps to */
  shedSize?: readonly [number, number];
  /** kitchen-garden beds in the yard */
  garden: boolean;
}

export type RegionalGeometryBuckets = Record<string, THREE.BufferGeometry[]>;
