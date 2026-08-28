// Runtime registry for geometry-derived armor/module/crew calibration data.
// Browser play registers only the families it is about to construct; fleet
// tools and the dedicated server register the complete generated set.

export interface CombatAnatomyCalibration extends Record<string, unknown> {
  hull: Record<string, unknown>;
  tracks: {
    left: Record<string, unknown>;
    right: Record<string, unknown>;
  };
}

const calibrations = new Map<string, CombatAnatomyCalibration>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isCalibration(value: unknown): value is CombatAnatomyCalibration {
  if (!isRecord(value) || !isRecord(value.hull) || !isRecord(value.tracks)) return false;
  return isRecord(value.tracks.left) && isRecord(value.tracks.right);
}

export function registerCombatAnatomyCalibrations(
  nextCalibrations: Readonly<Record<string, unknown>> | null | undefined,
): void {
  for (const [id, calibration] of Object.entries(nextCalibrations || {})) {
    if (!isCalibration(calibration)) {
      throw new Error(`Invalid combat anatomy calibration: ${id}`);
    }
    calibrations.set(id, calibration);
  }
}

export function combatAnatomyCalibration(id: string): CombatAnatomyCalibration | null {
  return calibrations.get(id) || null;
}

export function hasCombatAnatomyCalibration(id: string): boolean {
  return calibrations.has(id);
}
