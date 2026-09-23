// Hollow paired road wheel — the fleet primitive behind the M1 Abrams X and
// Leclerc X "hollow" wheel read (wheel review 2026-09-13): two turned halves,
// each an open rubber annulus over a recessed pressed steel web, joined by a
// narrow axle with a real guide channel between them. The wheel reads as a
// volume with air through its middle instead of a solid painted disc.
// Stations are the Abrams SEP v2 source measurements (abramsSourceXWheels.ts)
// scaled to the requested radius, so any tank can draw the construction at
// its own wheel size.
import * as THREE from 'three';
import { cylX, mergeAll, xform } from './factoryGeometry.ts';
import { gearFastener, runningGearRadialSegments, turnedGearStock } from './runningGearPrimitives.ts';

type RadialStation = readonly [radiusM: number, axleXM: number];
const REF_RADIUS = .3166805;
const GAP_HALF = .03035;
const OUTER_HALF = .215435;

interface HollowPairedRoadWheelOptions {
  readonly radiusM: number;
  readonly high: boolean;
  /** Hub fasteners per half on the high tier (0 disables). */
  readonly fasteners?: number;
  /** Full axial width to fit; the paired construction is scaled along the axle (2026-09-14, Challenger families). */
  readonly axialWidthM?: number;
  /** Emit the hub fasteners as the inset layer (contrast-picked material) instead of dish steel (2026-09-14). */
  readonly fastenersAsInsets?: boolean;
}

/** Full axial width of the paired wheel at a given radius. */
export function hollowPairedRoadWheelWidth(radiusM: number): number {
  return 2 * OUTER_HALF * radiusM / REF_RADIUS;
}

export function buildHollowPairedRoadWheel({ radiusM, high, fasteners = 10, axialWidthM, fastenersAsInsets = false }: HollowPairedRoadWheelOptions): {
  tire: THREE.BufferGeometry; disc: THREE.BufferGeometry; dark: THREE.BufferGeometry | null;
} {
  const k = radiusM / REF_RADIUS;
  const segments = runningGearRadialSegments(high);
  const scale = (stations: readonly RadialStation[]): RadialStation[] => stations.map(([r, x]) => [r * k, x * k] as const);
  // Rubber: face from .25805 with the inner wall sloping to the web; the
  // crown rounds inward. Lathe contours run CCW in (radius, axle), so the
  // outside run is reversed before the closed annulus is turned. LOW keeps the
  // face, crown and channel wall but not the two inner-wall bevel stations
  // (roadWheelGeometry.ts WheelDetail: no inner bevels at LOW).
  const tire = scale([
    [.25805, OUTER_HALF], [.29336, OUTER_HALF], [REF_RADIUS, OUTER_HALF - .014],
    [REF_RADIUS, GAP_HALF + .014], [.283, GAP_HALF], [.280, GAP_HALF],
    ...(high ? [[.270, .08728], [.260, .15094]] as const : []),
    [.25805, OUTER_HALF],
  ]).reverse();
  // Steel: a ~160 mm recessed bowl, not a proud full-width disc.
  const web = scale([
    [0, GAP_HALF], [.278, GAP_HALF], [.278, .0682], [.270, .0682],
    [.255, .05689], [.198, .05683], [.166, .03365], [.096, .03365],
    ...(high
      ? [[.080, .085], [.060, .1378], [.050, .1492], [.028, .142], [.022, .13774], [0, .13774], [0, GAP_HALF]] as const
      : [[.060, .1492], [0, .13774], [0, GAP_HALF]] as const),
  ]);
  const tires: THREE.BufferGeometry[] = [], steel: THREE.BufferGeometry[] = [], insets: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    tires.push(turnedGearStock(tire, segments, side));
    steel.push(turnedGearStock(web, segments, side));
    for (let i = 0; i < (high ? fasteners : 0); i++) {
      const angle = i * Math.PI * 2 / fasteners;
      (fastenersAsInsets ? insets : steel).push(xform(gearFastener(.008 * k, .013 * k, high), side * .040 * k,
        Math.sin(angle) * .140 * k, Math.cos(angle) * .140 * k));
    }
  }
  // A narrow functional axle joins the paired webs; it never fills the guide gap.
  steel.push(cylX(.070 * k, (GAP_HALF * 2 + .012) * k, high ? 12 : 4));
  const tireStock = mergeAll(tires), steelStock = mergeAll(steel);
  const insetStock = insets.length ? mergeAll(insets) : null;
  if (axialWidthM !== undefined) {
    if (!(axialWidthM > 0)) throw new RangeError('Paired road wheel axial width must be positive');
    const sx = axialWidthM / hollowPairedRoadWheelWidth(radiusM);
    tireStock.scale(sx, 1, 1); steelStock.scale(sx, 1, 1); insetStock?.scale(sx, 1, 1);
  }
  return { tire: tireStock, disc: steelStock, dark: insetStock };
}
