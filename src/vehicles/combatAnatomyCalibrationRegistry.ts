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
  /** The main plate this structure's front face stands on (a builder's authoring hint; combatAnatomy
   *  applyStructureFrontPlates): that face takes the plate's armour, its other faces the roof's. */
  readonly frontPlate?: string;
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
 * wreck's ring plate and a hulk's well are sized from it, and the anatomy's turretRing volume (a sim module) centres on
 * its seat and deck (combatAnatomy.ts alignTurretRing, 240). The generator does not publish it yet (233: a fleet anatomy
 * update would be needed): a visual without one measures its own build once (turretRingWell.ts measureTurretRing), and
 * the volume stands on the turret pivot's axis.
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
  /** The hull the turret traverses over (turretRingWell.ts measureTurretSweep): the first band's inner radius (m). */
  readonly sweepR0?: number;
  /** Per TURRET_SWEEP_BIN_M band out from sweepR0, the hull's highest top on any bearing over the deck (m). */
  readonly sweepDy?: readonly number[];
}

/**
 * 235 crew fit (tools/crew-seat-fit.mjs): a P50 (1.75 m) body seated at one crew station, in its frame (hull, or turret
 * at rest). The posture is the Gallery mannequin's joint angles (radians); `head` the head centre; `min`/`max` the
 * station box (the largest box inside the shell within the body's bounds); `shapes` the body's hit shapes (head first,
 * then torso, thighs and shins, held to the armour proper: a piece crossing the turret ring's open gap is cut out).
 * `relaxed` names the obstacles the seat had to ignore; `trimmed` is the body's outside share where no posture fitted.
 */
export interface AnatomyCrewSeatReceipt extends Record<string, RuntimeValue> {
  readonly crew: string;
  readonly frame: 'hull' | 'turret';
  readonly posture: {
    readonly kind: string;
    readonly tuck: number;
    readonly trunk: number;
    readonly hip: number;
    readonly knee: number;
    readonly shoulder: number;
    readonly elbow: number;
    readonly neck: number;
  };
  readonly pelvis: readonly number[];
  readonly head: readonly number[];
  readonly min: readonly number[];
  readonly max: readonly number[];
  readonly shapes: readonly (
    | { readonly kind: 'ellipsoid'; readonly center: readonly number[]; readonly radii: readonly number[] }
    | { readonly kind: 'capsule'; readonly a: readonly number[]; readonly b: readonly number[]; readonly radius: number }
  )[];
  /** Where HE splash strikes the body: head, torso, lap. */
  readonly blastPoints: readonly (readonly number[])[];
  readonly relaxed?: string;
  readonly trimmed?: number;
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
  /** Where each crew member sits (235 crew fit), in the internal layout's crew order. */
  readonly crewSeats?: readonly AnatomyCrewSeatReceipt[];
  /** Where each sketched module sits (266), placed around the seated crew in one priority order, inside its armour. */
  readonly moduleSeats?: readonly AnatomyModuleSeatReceipt[];
}

/**
 * 266 module placement (tools/crew-seat-fit.mjs placeModules): a sketched module's parts in its frame (hull, or turret
 * at rest), each the largest box inside its armour clear of the crew and of the modules placed before it.
 */
export interface AnatomyModuleSeatReceipt extends Record<string, RuntimeValue> {
  readonly module: string;
  readonly turretLocal: boolean;
  readonly parts: readonly AnatomyCalibrationBounds[];
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
