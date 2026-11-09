/**
 * strikeLooks.ts — what a round throws off the part of a tank it struck (impact-materials-269; Main 2026-11-04: "sparks
 * only where steel was struck"). One look per plate material (sim/plateMaterial.ts), exhaustive, so a new material
 * fails the typecheck until it has one. Steel sparks and steel chips off armour, sheet steel, track links, road wheels,
 * ERA cassettes, slat cages and a wreck's burnt hull (dull, few); torn rubber off a rubber skirt; canvas and kit off a
 * stowage rack, no spark. The running gear and the skirt over it carry the ground they roll through, so a hit there
 * throws that ground too, in its own colour (surfaceLooks.ts): caked earth, sand, snow, mud, a splash of water.
 *
 * The audio's resolver (audio/impactMaterials.ts) rings steel on exactly the materials that spark here:
 * strikeLooks.selftest.mjs holds the two tables to one another. Pure data: no three, no DOM.
 */
import { PLATE_MATERIALS, type PlateMaterial } from '../sim/plateMaterial.ts';
import type { ChunkShape } from './debrisChunks.ts';
import { linearHex } from './surfaceLooks.ts';

type Rgb = readonly [number, number, number];

interface StrikeChip {
  /** linear rgb */
  readonly col: Rgb;
  readonly shape: ChunkShape;
}

export interface StrikeLook {
  /** the spark showers' weight against an armour plate's (0: nothing struck was steel, and no hot flash either) */
  readonly sparks: number;
  /** the two chips that fly, and how many against an armour hit's; null keeps the hit kind's own steel chips */
  readonly chips: readonly [StrikeChip, StrikeChip] | null;
  readonly chipK: number;
  /** the puff knocked off the face, near and far (sRGB hex); null keeps the hit kind's own paint and scale dust */
  readonly puff: readonly [number, number] | null;
  /** how much of the ground under the hull the part carries and throws (0 none; 1 a track's caked load) */
  readonly ground: number;
}

const RUBBER: Rgb = linearHex(0x1d1c1b);
const WHEEL_PAINT: Rgb = linearHex(0x3a3c31);
const CANVAS: Rgb = linearHex(0x5c5a40);
const KIT_WOOD: Rgb = linearHex(0x76583b);
const BURNT: Rgb = linearHex(0x3b2b21);

const steel = (sparks: number, chipK: number, ground = 0): StrikeLook => Object.freeze({ sparks, chips: null, chipK, puff: null, ground });

export const STRIKE_LOOKS: Readonly<Record<PlateMaterial, StrikeLook>> = Object.freeze({
  armour: steel(1, 1),
  thinSteel: steel(0.8, 1),
  // steel links under a load of the ground they run through
  trackLinks: steel(0.5, 0.6, 1),
  // the painted steel disc and its rubber tyre, the ground caked between them
  roadWheel: Object.freeze({ sparks: 0.6, chips: Object.freeze([{ col: WHEEL_PAINT, shape: 'shard' }, { col: RUBBER, shape: 'clod' }] as const),
    chipK: 0.8, puff: Object.freeze([0x403d39, 0x6e6a63] as const), ground: 0.5 }),
  era: steel(1, 1),
  cage: steel(0.7, 0.8),
  stowage: Object.freeze({ sparks: 0, chips: Object.freeze([{ col: CANVAS, shape: 'sheet' }, { col: KIT_WOOD, shape: 'splinter' }] as const),
    chipK: 1, puff: Object.freeze([0x6f6a52, 0x9c967e] as const), ground: 0 }),
  // torn rubber and the mud on it; no spark, no flash
  rubberSkirt: Object.freeze({ sparks: 0, chips: Object.freeze([{ col: RUBBER, shape: 'clod' }, { col: RUBBER, shape: 'sheet' }] as const),
    chipK: 1, puff: Object.freeze([0x2f2d2a, 0x5f5b55] as const), ground: 0.5 }),
  // a burnt hull: a few dull sparks, flakes of scale and ash
  wreck: Object.freeze({ sparks: 0.35, chips: Object.freeze([{ col: BURNT, shape: 'sheet' }, { col: BURNT, shape: 'shard' }] as const),
    chipK: 1, puff: Object.freeze([0x2b2724, 0x5a544e] as const), ground: 0 }),
});

const PLATES: ReadonlySet<string> = new Set(PLATE_MATERIALS);

/** The look of what the event says was struck; an older peer's event names none: armour, as before. */
export function strikeLookOf(material: unknown): StrikeLook {
  return typeof material === 'string' && PLATES.has(material) ? STRIKE_LOOKS[material as PlateMaterial] : STRIKE_LOOKS.armour;
}
