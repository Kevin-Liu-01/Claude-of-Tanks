// The authorities' fleet (ARCH-P3, 2026-10-01): the browser host Worker, the
// Node match service and the headless audits read vehicle specs, never
// vehicle geometry. This is the shared ordered registration (the player's
// specs, in the player's order) plus combat anatomy on demand:
// `ensureAuthorityFleet(ids)` loads only those ids' calibration groups (one
// chunk per visual family) and finalizes their armor plates, modules, crew
// boxes and hit shells exactly as the player's fleet does when it ensures the
// same ids (fleetParity.selftest.mjs). No builders, no Three.js geometry, no
// interior fills or marking seats: the host Worker carries none of them.
import './fleetRegistration.ts';
import { SAVED_TANK_IDS, TANK_SPECS } from './specs.ts';
import {
  ensureAllCombatAnatomyGroups,
  ensureCombatAnatomyCalibrations,
  isCombatAnatomyCalibrationReady,
} from './combatAnatomyCalibrationLoader.ts';
import { finalizeCombatAnatomy } from './combatAnatomy.ts';

// Unknown ids are left to the authority, which rejects them with its own error.
const registeredIds = (specIds: readonly string[]): string[] =>
  [...new Set(specIds)].filter((id) => !!TANK_SPECS[id]);

/** Loads the calibration groups of `specIds` (every saved spec when omitted) and finalizes their combat anatomy. */
export async function ensureAuthorityFleet(specIds?: readonly string[] | null): Promise<void> {
  const ids = specIds ? registeredIds(specIds) : SAVED_TANK_IDS.slice();
  await (specIds ? ensureCombatAnatomyCalibrations(ids) : ensureAllCombatAnatomyGroups());
  for (const id of ids) finalizeCombatAnatomy(TANK_SPECS[id]);
}

/**
 * The synchronous gate before an authority reads a roster: finalizes every id whose calibration group is loaded
 * (a no-op when that already happened) and throws, naming the rest, when a group was never loaded.
 */
export function requireAuthorityFleet(specIds: readonly string[]): void {
  const ids = registeredIds(specIds);
  const missing = ids.filter((id) => !isCombatAnatomyCalibrationReady(id));
  if (missing.length) {
    throw new Error(`combat anatomy is not loaded for ${missing.join(', ')}: await ensureAuthorityFleet() with the roster first`);
  }
  for (const id of ids) finalizeCombatAnatomy(TANK_SPECS[id]);
}
