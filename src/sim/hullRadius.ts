/**
 * The disc a vehicle's placement reserves: half its hull diagonal plus 0.6 m, at least 3.5 m. Dependency-free so the
 * mode controller (sim/matchModes.ts) reads the same radius the placement seats with (sim/matchPlacement.ts).
 */
export function placementTankRadius(spec: { dims?: { hullLengthM?: number; widthM?: number } }): number {
  return Math.max(3.5, Math.hypot((spec.dims?.hullLengthM ?? 7) * .5, (spec.dims?.widthM ?? 3.5) * .5) + .6);
}
