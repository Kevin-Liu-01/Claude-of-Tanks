// The anatomy generator must measure authored geometry and authored combat
// data, never the result of its previous generated calibration. Keeping this
// tiny switch in a dependency-free module lets the Node tool opt out before
// the eager fleet factory evaluates, without exposing a production factory
// option or relying on process/global environment state in browser builds.
let measurementMode = false;

export function enableCombatAnatomyMeasurementMode(): void {
  measurementMode = true;
}

export function isCombatAnatomyMeasurementMode(): boolean {
  return measurementMode;
}
