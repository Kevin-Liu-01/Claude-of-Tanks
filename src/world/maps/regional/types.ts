// src/world/maps/regional/types.ts — the contract between props.ts and the regional architecture kits.
import type * as THREE from 'three';
import type { RegionalParts } from './geometry.ts';

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
  mapId: string;
  snowCap: boolean;
  /** 'mobile' builds leave out the finest dressing (never a structural part: collision stays tier-independent) */
  tier: 'desktop' | 'mobile';
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
}

export type RegionalGeometryBuckets = Record<string, THREE.BufferGeometry[]>;
