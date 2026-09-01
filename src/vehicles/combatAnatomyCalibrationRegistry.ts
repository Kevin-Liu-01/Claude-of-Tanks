// Runtime registry for geometry-derived armor/module/crew calibration data.
// Browser play registers only the families it is about to construct; fleet
// tools and the dedicated server register the complete generated set.

export interface AnatomyCalibrationBounds extends Record<string, unknown> {
  readonly min: readonly number[];
  readonly max: readonly number[];
}

export interface AnatomyCalibrationCell extends AnatomyCalibrationBounds {
  readonly vertices: readonly (readonly number[])[];
  readonly faces: readonly (readonly number[])[];
  readonly structureKind?: string | null;
  readonly structureIndex?: number;
}

export interface AnatomyCalibrationStructure extends AnatomyCalibrationBounds {
  readonly kind?: string;
  readonly sourceHash?: string;
  readonly index?: number;
}

export interface AnatomyModuleShapeReceipt extends Record<string, unknown> {
  readonly module: string;
  readonly turretLocal?: boolean;
  readonly parts: readonly AnatomyCalibrationBounds[];
}

export interface AnatomyEraPlateReceipt extends Record<string, unknown> {
  readonly name: string;
  readonly owner: 'hull' | 'turret';
  /** Exact visible cassette faces sharing one gameplay depletion id. */
  readonly surfaces?: readonly (readonly (readonly number[])[])[];
  /** r1 compatibility for receipts generated before multi-face ERA fitting. */
  readonly verts?: readonly (readonly number[])[];
  readonly visualSectors?: readonly string[];
}

export interface CombatAnatomyCalibration extends Record<string, unknown> {
  readonly hull: AnatomyCalibrationBounds;
  readonly turret?: AnatomyCalibrationBounds;
  readonly hullCollision?: readonly AnatomyCalibrationCell[];
  readonly turretCollision?: readonly AnatomyCalibrationCell[];
  readonly hullStructureCollision?: readonly AnatomyCalibrationCell[];
  readonly turretStructureCollision?: readonly AnatomyCalibrationCell[];
  readonly hullStructures?: readonly AnatomyCalibrationStructure[];
  readonly turretStructures?: readonly AnatomyCalibrationStructure[];
  readonly moduleShapes?: readonly AnatomyModuleShapeReceipt[];
  readonly eraPlates?: readonly AnatomyEraPlateReceipt[];
  tracks: {
    readonly left: AnatomyCalibrationBounds;
    readonly right: AnatomyCalibrationBounds;
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
