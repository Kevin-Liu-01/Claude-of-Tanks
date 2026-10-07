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
}

export type RegionalBuilder = (ctx: RegionalBuildContext) => RegionalParts;

/** Procedural surface painters a style selects for the roof and stone buckets (regionalSurfaces.ts). */
export type RoofSurfaceKind = 'beavertail' | 'canal' | 'slate' | 'pantile' | 'sheet' | 'asbestos' | 'shingle';
/**
 * An HSL remap of a procedural surface (props.ts ToneFunction). A render tone may also name its painter: `paint`
 * lime-wash brushed over mud plaster (regionalSurfaces.ts paintLimewash, its own seed) in place of the plain render.
 */
export type SurfaceTone = ((hue: number, saturation: number, lightness: number) => readonly [number, number, number])
  & { paint?: { kind: 'limewash'; seed: number } };
export type StoneSurfaceKind = 'sandstone' | 'limestone' | 'granite' | 'brick' | 'greywacke' | 'rubble' | 'block' | 'fieldstone';
/** Poured concrete prints a style can paint its plaster2 bucket with (regionalSurfaces.ts makeRegionalConcrete). */
export type ConcreteSurfaceKind = 'boardFormed';

export interface ArchitectureSurfaces {
  /** map revival lane 2 (2026-10-06, Frosthollow's cost): 0 leaves out the wood and the joinery's cavity map (the AO
   * sample over a village of log walls; an in-page toggle read it at ~2 ms of the chase view). Absent, unchanged. */
  woodAo?: 0;
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
  /** the yards round the kit's houses (yards.ts): absent, the houses stand in the open ground as before */
  yard?: YardStyle;
}

/**
 * What a kit puts in the free ground round its houses (yards.ts plans it, props.ts places it): a yard on the house's
 * freest side, enclosed by a run of the fence or wall destructible with a gate, an outbuilding in a far corner and
 * kitchen-garden beds, each only where it clears the roads, the other plots, the objectives and the spawn pads.
 */
export interface YardStyle {
  /** the plan kinds that keep a yard */
  kinds: readonly string[];
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
