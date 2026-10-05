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
   * The building's world yaw (props.ts rot, a turn about +Y), for a kit whose buildings face a compass point rather than
   * the plot's front (a hogan's door to the sunrise); absent outside a placed rebuild (a yard's shed, the receipts).
   */
  yaw?: number;
  /** The building's world position (props.ts settled it before the kit runs), for a kit that zones a city by where its
   *  buildings stand (Sarajevo: the valley floor's blocks, the slopes' mahalas); absent outside a placed rebuild. */
  x?: number;
  z?: number;
}

export type RegionalBuilder = (ctx: RegionalBuildContext) => RegionalParts;

/** Procedural surface painters a style selects for the roof and stone buckets (regionalSurfaces.ts). */
export type RoofSurfaceKind = 'beavertail' | 'canal' | 'slate' | 'pantile' | 'sheet' | 'asbestos' | 'shingle';
/** An HSL remap of a procedural surface (props.ts ToneFunction). */
export type SurfaceTone = (hue: number, saturation: number, lightness: number) => readonly [number, number, number];
export type StoneSurfaceKind = 'sandstone' | 'limestone' | 'granite' | 'brick' | 'greywacke' | 'rubble' | 'block';

export interface ArchitectureSurfaces {
  roof: { kind: RoofSurfaceKind; tint: readonly [number, number, number] };
  stone: { kind: StoneSurfaceKind; tint: readonly [number, number, number] };
  /** the sourced CC0 photo sets the style keeps (the others stay procedural) */
  sourced: { plaster: boolean; wood: boolean };
  /** default tones of the procedural render / timber / thatch canvases; a map's own tones win */
  tones?: Partial<Record<'plaster' | 'plaster2' | 'plaster3' | 'wood' | 'straw', SurfaceTone>>;
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
