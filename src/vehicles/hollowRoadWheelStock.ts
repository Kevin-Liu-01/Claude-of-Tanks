// Hollow paired road wheel — the fleet primitive behind the M1 Abrams X and
// Leclerc X "hollow" wheel read (wheel review 2026-09-13): two turned halves,
// each an open rubber annulus over a recessed pressed steel web, joined by a
// narrow axle with a real guide channel between them. The wheel reads as a
// volume with air through its middle instead of a solid painted disc.
// Stations are the Abrams SEP v2 source measurements (abramsSourceXWheels.ts)
// scaled to the requested radius, so any tank can draw the construction at
// its own wheel size.
import * as THREE from 'three';
import { KIT } from './profiles/kit.ts';
import { gearFastener, runningGearRadialSegments, turnedGearStock } from './runningGearPrimitives.ts';

type RadialStation = readonly [radiusM: number, axleXM: number];
const REF_RADIUS = .3166805;
const GAP_HALF = .03035;
const OUTER_HALF = .215435;

export interface HollowPairedRoadWheelOptions {
  readonly radiusM: number;
  readonly high: boolean;
  /** Hub fasteners per half on the high tier (0 disables). */
  readonly fasteners?: number;
}

/** Full axial width of the paired wheel at a given radius. */
export function hollowPairedRoadWheelWidth(radiusM: number): number {
  return 2 * OUTER_HALF * radiusM / REF_RADIUS;
}

export function buildHollowPairedRoadWheel({ radiusM, high, fasteners = 10 }: HollowPairedRoadWheelOptions): {
  tire: THREE.BufferGeometry; disc: THREE.BufferGeometry; dark: null;
} {
  const k = radiusM / REF_RADIUS;
  const segments = runningGearRadialSegments(high);
  const scale = (stations: readonly RadialStation[]): RadialStation[] => stations.map(([r, x]) => [r * k, x * k] as const);
  // Rubber: face from .25805 with the inner wall sloping to the web; the
  // crown rounds inward. Lathe contours run CCW in (radius, axle), so the
  // outside run is reversed before the closed annulus is turned.
  const tire = scale([
    [.25805, OUTER_HALF], [.29336, OUTER_HALF], [REF_RADIUS, OUTER_HALF - .014],
    [REF_RADIUS, GAP_HALF + .014], [.283, GAP_HALF], [.280, GAP_HALF],
    [.270, .08728], [.260, .15094], [.25805, OUTER_HALF],
  ]).reverse();
  // Steel: a ~160 mm recessed bowl, not a proud full-width disc.
  const web = scale([
    [0, GAP_HALF], [.278, GAP_HALF], [.278, .0682], [.270, .0682],
    [.255, .05689], [.198, .05683], [.166, .03365], [.096, .03365],
    ...(high
      ? [[.080, .085], [.060, .1378], [.050, .1492], [.028, .142], [.022, .13774], [0, .13774], [0, GAP_HALF]] as const
      : [[.060, .1492], [0, .13774], [0, GAP_HALF]] as const),
  ]);
  const tires: THREE.BufferGeometry[] = [], steel: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    tires.push(turnedGearStock(tire, segments, side));
    steel.push(turnedGearStock(web, segments, side));
    for (let i = 0; i < (high ? fasteners : 0); i++) {
      const angle = i * Math.PI * 2 / fasteners;
      steel.push(KIT.xform(gearFastener(.008 * k, .013 * k, high), side * .040 * k,
        Math.sin(angle) * .140 * k, Math.cos(angle) * .140 * k));
    }
  }
  // A narrow functional axle joins the paired webs; it never fills the guide gap.
  steel.push(KIT.cylX(.070 * k, (GAP_HALF * 2 + .012) * k, high ? 12 : 4));
  return { tire: KIT.mergeAll(tires), disc: KIT.mergeAll(steel), dark: null };
}
