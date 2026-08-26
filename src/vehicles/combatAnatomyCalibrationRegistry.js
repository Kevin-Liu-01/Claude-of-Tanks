// Runtime registry for geometry-derived armor/module/crew calibration data.
// Browser play registers only the families it is about to construct; fleet
// tools and the dedicated server register the complete generated set.

const calibrations = new Map();

export function registerCombatAnatomyCalibrations(nextCalibrations) {
  for (const [id, calibration] of Object.entries(nextCalibrations || {})) {
    if (!calibration?.hull || !calibration?.tracks?.left || !calibration?.tracks?.right) {
      throw new Error(`Invalid combat anatomy calibration: ${id}`);
    }
    calibrations.set(id, calibration);
  }
}

export function combatAnatomyCalibration(id) {
  return calibrations.get(id) || null;
}

export function hasCombatAnatomyCalibration(id) {
  return calibrations.has(id);
}
