import type { GarageVariant } from '../game/garageVariants.ts';
import type { GarageHorizonSink } from './garageLandmarkMesh.ts';
import { buildSiroccoHorizon, siroccoDuneClearance, siroccoStarDunes } from './garageSiroccoHorizon.ts';
import { buildSteinburgHorizon, steinburgBandClearance } from './garageSteinburgHorizon.ts';

/**
 * The outdoor Garages' map landmarks on their horizons (garage r9, K10): a Garage that has them shapes its backdrop bands
 * around them (the land in front of a mesa or a town sinks so it stands clear; the far bands carry a map's star dunes),
 * pays for them with fewer band columns, and writes them into the horizon's one draw.
 *
 * - `land` landmarks (mesas, an escarpment, a ksar, palms) count in the horizon's skyline height and keep it under the
 *   biome ceiling;
 * - `built` landmarks replace a built horizon (Steinburg's town in place of the generic blocks) and report its masses' and
 *   accents' tops.
 */
interface GarageHorizonLandmarks {
  readonly kind: 'land' | 'built';
  /** Band columns per layer (nearest first), in place of the shared five. */
  readonly layerSegments?: readonly number[];
  /** A multiplier (0..1) on a band's crest at a bearing: the land in front of a landmark sinks. */
  readonly clearance?: (angle: number, layer: number, radius: number) => number;
  /** Metres added to a band's crest (a map's star dunes). */
  readonly lift?: (angle: number, layer: number) => number;
  readonly build: (sink: GarageHorizonSink) => {
    readonly triangles: number;
    readonly maxHeightM?: number;
    readonly massTopM?: number;
    readonly accentTopM?: number;
  };
}

const LANDMARKS: Readonly<Partial<Record<GarageVariant['architecture'], GarageHorizonLandmarks>>> = Object.freeze({
  shade_depot: Object.freeze({
    kind: 'land' as const,
    layerSegments: [112, 104, 80, 56, 48],
    clearance: siroccoDuneClearance,
    lift: siroccoStarDunes,
    build: buildSiroccoHorizon,
  }),
  brick_arsenal: Object.freeze({
    kind: 'built' as const,
    layerSegments: [120, 112, 88, 64, 56],
    clearance: steinburgBandClearance,
    build: buildSteinburgHorizon,
  }),
});

/** The Garage's horizon landmarks, or null when its backdrop is bands alone. */
export function garageHorizonLandmarks(architecture: GarageVariant['architecture']): GarageHorizonLandmarks | null {
  return LANDMARKS[architecture] ?? null;
}
