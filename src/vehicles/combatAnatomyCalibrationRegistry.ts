// Runtime registry for geometry-derived armor/module/crew calibration data.
// Browser play registers only the families it is about to construct; fleet
// tools and the dedicated server register the complete generated set.

import type { RuntimeValue } from '../runtimeTypes.ts';
import type { TrackContactReceipt } from '../sim/trackContact.ts';

export interface AnatomyCalibrationBounds extends Record<string, RuntimeValue> {
  readonly min: readonly number[];
  readonly max: readonly number[];
}

export interface AnatomyCalibrationCell extends AnatomyCalibrationBounds {
  readonly vertices: readonly (readonly number[])[];
  readonly faces: readonly (readonly number[])[];
  readonly structureKind?: string | null;
  readonly structureIndex?: number;
  readonly interiorPoint?: readonly number[];
  readonly sourceStock?: string;
  readonly sourceStation?: number;
  /** Release 227 (gen-combat-anatomy HULL_LATERAL_CUTS): one band of a slice cut at a hull's glacis edges. */
  readonly lateralBand?: boolean;
}

export interface AnatomyCalibrationStructure extends AnatomyCalibrationBounds {
  readonly kind?: string;
  readonly sourceHash?: string;
  readonly index?: number;
}

export interface AnatomyModuleShapeReceipt extends Record<string, RuntimeValue> {
  readonly module: string;
  readonly turretLocal?: boolean;
  readonly gunFollow?: boolean;
  readonly parts: readonly AnatomyCalibrationBounds[];
}

export interface AnatomyEraPlateReceipt extends Record<string, RuntimeValue> {
  readonly name: string;
  readonly owner: 'hull' | 'turret';
  /** Exact visible cassette faces sharing one gameplay depletion id. */
  readonly surfaces?: readonly (readonly (readonly number[])[])[];
  /** r1 compatibility for receipts generated before multi-face ERA fitting. */
  readonly verts?: readonly (readonly number[])[];
  readonly visualSectors?: readonly string[];
}

/**
 * The turret ring as built (tools/gen-combat-anatomy.mjs, turretRingWell.ts measureTurretRing), in the rig_hull frame:
 * the rig_turret seat, the deck top under the ring, the hull-side race's outer radius (inside the turret base), how far
 * the deck falls away under the race's rim, the turret base's inscribed radius over the deck and the well's floor. A
 * wreck's ring plate and a hulk's well are sized from it; it is presentation only (the anatomy's turretRing volume, a
 * sim module, keeps its own law). The generator does not publish it yet (233: a fleet anatomy update would be needed):
 * a visual without one measures its own build once (turretRingWell.ts measureTurretRing).
 */
export interface AnatomyTurretRingReceipt extends Record<string, RuntimeValue> {
  readonly seat: readonly number[];
  readonly deckY: number;
  readonly rimR: number;
  readonly skirt: number;
  readonly footR: number;
  /** The well's floor: a floor plate over the highest of the hull's undersides under the opening, and over its skin. */
  readonly floorY?: number;
  /** The well's wall under the race's lip where the hull's skin keeps it narrower than the gear's band (a ledge). */
  readonly wellR?: number;
  /** The nearest the hull's skin comes to the ring's axis under the lip, when within a hulk crumple's reach of it. */
  readonly skinR?: number;
}

export interface CombatAnatomyCalibration extends Record<string, RuntimeValue> {
  readonly externalWeapons?: readonly AnatomyWeaponReceipt[];
  readonly hull: AnatomyCalibrationBounds;
  readonly turret?: AnatomyCalibrationBounds | null;
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
  /** The tracks' ground contact as the builder lays it (sim/trackContact.ts): the movement solve's receipt. */
  readonly trackContact?: TrackContactReceipt;
  /** The turret ring as built (turreted tanks). */
  readonly turretRing?: AnatomyTurretRingReceipt;
}

export interface AnatomyWeaponReceipt extends AnatomyCalibrationCell {
  readonly module: 'missileRack' | 'gun';
  readonly armorMm: number;
  readonly turretLocal: boolean;
  readonly gunFollow: boolean;
}

const calibrations = new Map<string, CombatAnatomyCalibration>();

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object';
}

function isCalibration(value: RuntimeValue): value is CombatAnatomyCalibration {
  if (!isRecord(value) || !isRecord(value.hull) || !isRecord(value.tracks)) return false;
  return isRecord(value.tracks.left) && isRecord(value.tracks.right);
}

export function registerCombatAnatomyCalibrations(
  nextCalibrations: Readonly<Record<string, RuntimeValue>> | null | undefined,
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
