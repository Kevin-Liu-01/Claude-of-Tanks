/**
 * spottingStats.ts — a vehicle's spotting statistics: view range, base camo and the equipment's vision/concealment
 * effects (split from spotting.ts in the 232 bundle diet). The Garage and its equipment preview read only these, so the
 * boot graph no longer carries the spotting system (the checks, the bloom, the sightlines), which only a battle's
 * simulation loads; spotting.ts re-exports every name and keeps the model's documentation. Pure, node-runnable.
 */
import { VEHICLE_ROLE_PROFILES } from '../vehicles/roleProfiles.ts';

export interface SpottingTankSpec {
  id: string;
  role?: string;
  dims?: { heightM: number };
  gun?: { caliberMm?: number | null };
}

interface CamoRow {
  still: number;
  moving: number;
}

interface EquipmentVisionEffect {
  label: string;
  camo?: number;
  camoStill?: number;
  view?: number;
  viewStill?: number;
}

/** Explicit fleet profiles are shared by the garage and authoritative spotting. */
export const VIEW_RANGE_M: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(Object.entries(VEHICLE_ROLE_PROFILES).map(([id, profile]) => [id, profile.viewM])),
);
export const BASE_CAMO: Readonly<Record<string, CamoRow>> = VEHICLE_ROLE_PROFILES;

/** Mechanical-role fallbacks for specs not in the tables. */
const ROLE_CAMO: Readonly<Record<string, CamoRow>> = {
  light:  { still: 0.34, moving: 0.34 },
  ifv:    { still: 0.27, moving: 0.21 },
  medium: { still: 0.23, moving: 0.17 },
  heavy:  { still: 0.12, moving: 0.08 },
  mbt:    { still: 0.18, moving: 0.13 },
  td:     { still: 0.30, moving: 0.18 },
  spg:    { still: 0.08, moving: 0.05 },
};
const ROLE_VIEW_M: Readonly<Record<string, number>> = {
  light: 390, ifv: 435, medium: 370, heavy: 360, mbt: 440, td: 370, spg: 340,
};
const DEFAULT_CAMO: CamoRow = { still: 0.23, moving: 0.17 };

/**
 * View range for a spec (table → mechanical-role fallback → medium default).
 * @param {object} spec TankSpec-like ({ id, role })
 * @returns {number} meters
 */
export function viewRangeOf(spec: SpottingTankSpec | null | undefined): number {
  const exact = spec ? VIEW_RANGE_M[spec.id] : undefined;
  if (exact != null) return exact;
  return (spec?.role ? ROLE_VIEW_M[spec.role] : undefined) || 370;
}

/**
 * Base camo for a spec.
 * @param {object} spec TankSpec-like
 * @param {boolean} moving hull is moving
 * @returns {number} camo in [0,1]
 */
export function baseCamoOf(
  spec: SpottingTankSpec | null | undefined,
  moving: boolean,
): number {
  const row = (spec && (BASE_CAMO[spec.id] || (spec.role ? ROLE_CAMO[spec.role] : undefined)))
    || DEFAULT_CAMO;
  return moving ? row.moving : row.still;
}

// ---------------------------------------------------------------------------
// Equipment layer (concealment/vision loadout builds — r7 depth item).
// deps.getEquipment(ent) returns an array of ids from this table; effects:
//   camo      — flat own-camo bonus, always active           (vents)
//   camoStill — own-camo bonus while the TANK sits still     (camo net)
//   view      — view-range multiplier bonus, always active   (vents/optics)
//   viewStill — view-range bonus while the SPOTTER is still  (binoculars)
// Wire-up lives in game/state.ts (getEquipment dep) + the garage loadout UI.
// EQUIPMENT SYSTEM: this table owns only the VISION/CONCEALMENT effects; the
// full catalog (reload/aim/repair/durability/fire gear + slot logic + AI
// defaults) lives in game/equipment.ts and references these same ids.
// ---------------------------------------------------------------------------
export const EQUIPMENT: Readonly<Record<string, EquipmentVisionEffect>> = {
  camo_net:   { label: 'Camouflage Net',       camoStill: 0.12 },
  binoculars: { label: 'Binocular Telescope',  viewStill: 0.25 },
  vents:      { label: 'Improved Ventilation', camo: 0.02, view: 0.025 },
  optics:     { label: 'Coated Optics',        view: 0.10 },
};

/**
 * Own-camo bonus from equipment (additive with base + paint, so it is
 * stripped by fire bloom like the rest of the tank's own camo).
 * @param {?Array<string>} equipIds ids into EQUIPMENT
 * @param {boolean} moving hull is moving (disables *Still effects)
 * @returns {number} camo bonus in [0, ~0.14]
 */
export function equipCamoBonus(
  equipIds: readonly string[] | null | undefined,
  moving: boolean,
): number {
  if (!equipIds) return 0;
  let b = 0;
  for (let i = 0; i < equipIds.length; i++) {
    const e = EQUIPMENT[equipIds[i]];
    if (!e) continue;
    if (e.camo) b += e.camo;
    if (e.camoStill && !moving) b += e.camoStill;
  }
  return b;
}

/**
 * View-range multiplier from equipment (applied to the spotter).
 * @param {?Array<string>} equipIds ids into EQUIPMENT
 * @param {boolean} moving spotter hull is moving (disables *Still effects)
 * @returns {number} multiplier >= 1
 */
export function equipViewMult(
  equipIds: readonly string[] | null | undefined,
  moving: boolean,
): number {
  if (!equipIds) return 1;
  let m = 1;
  for (let i = 0; i < equipIds.length; i++) {
    const e = EQUIPMENT[equipIds[i]];
    if (!e) continue;
    if (e.view) m *= 1 + e.view;
    if (e.viewStill && !moving) m *= 1 + e.viewStill;
  }
  return m;
}
