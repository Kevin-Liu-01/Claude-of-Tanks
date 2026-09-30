/** Steady movement bloom; equipment scales excess over fully aimed dispersion.
 * Rates are km/h and degrees/s, matching the authored coefficients. */
export function movementDispersionFactor(move: number, hull: number, turret: number,
  speedKmh: number, hullDegS: number, turretDegS: number, equipment = 1): number {
  return 1 + (Math.sqrt(1 + (move * speedKmh) ** 2 + (hull * hullDegS) ** 2 + (turret * turretDegS) ** 2) - 1) * equipment;
}
