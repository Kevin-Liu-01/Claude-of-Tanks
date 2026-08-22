// Player-facing fleet policy.
//
// Source rows and builders remain available as archaeological/reference input,
// but only the owner-approved legacy vehicles below stay in the selectable
// roster. This keeps registration history intact while ensuring garage,
// battles, asset generation and release gates all consume the same policy.

export const DEV_FLEET_ENV_KEY = 'VITE_COT_DEV_FLEET_KEY';
export const DEV_FLEET_KEY = 'claude-of-tanks-local-dev';
export const DEV_FLEET_LABEL = 'DEV';

// These records stay registered and usable by local vehicle/gallery tooling,
// but do not appear in production carousels or matchmaking. Keep every
// production exclusion here so UI surfaces cannot quietly diverge.
export const PRODUCTION_HIDDEN_TANK_IDS = new Set([
  'panther_g', 'tiger1', 'sturmtiger', 'jpz_e100',
  'm26_pershing', 'm45_patton', 't95', 'isu122s', 'isu152',
  'newc_tiger', 'newc_pziii', 'bmp1', 'm1128', 'm1296', 'm1a2_legacy',
  'recon_tank', 'q_heavy',
]);

export const RETIRED_EXTERNAL_PLACEHOLDER_IDS = new Set(['recon_tank', 'q_heavy']);

/**
 * Unlock the full saved fleet only in Vite's local development server.
 *
 * This is a presentation/build gate, not a secret or an authorization layer:
 * VITE_* values are embedded into client code. Production builds remain
 * curated even if the variable is accidentally present in their environment.
 */
export function developmentFleetEnabled(env = {}) {
  return env?.DEV === true && env?.[DEV_FLEET_ENV_KEY] === DEV_FLEET_KEY;
}

const VITE_ENV = typeof import.meta !== 'undefined' && import.meta.env
  ? import.meta.env
  : {};

export const DEV_FLEET_ACTIVE = developmentFleetEnabled(VITE_ENV);

export function isProductionHiddenTankId(id) {
  return typeof id === 'string' && PRODUCTION_HIDDEN_TANK_IDS.has(id);
}

export const RETAINED_WW2_IDS = Object.freeze([
  'tiger1',
  'panther_g',
  'kv2',
  'jpz_e100',
  'sturmtiger',
  'isu122s',
  'isu152',
  'm26_pershing',
  'm45_patton',
  't95',
]);

// The former garage Cold War catalog boundary. Variants intentionally treated
// as modern by that catalog (Abrams, T-80/T-90, post-1991 T-72s, Challengers,
// Merkavas and IFVs) remain in the modern fleet.
export const HISTORICAL_COLD_WAR_CANDIDATE_IDS = Object.freeze([
  'm46_patton', 'm47_patton', 'm48', 'm60a1', 'm60a2', 'm60a3', 'mbt70',
  'leo1a5',
  't54', 'type59', 't62mv1', 't64bv1', 't72b_1987',
  'centurion3', 'centurion5', 'chieftain5', 'chieftain_mk10', 'vickers_mk1',
  'amx30', 'amx30b2',
  'udes03', 'strv103', 'strv103a', 'type74',
  't95',
]);

export const RETAINED_COLD_WAR_IDS = Object.freeze([
  'centurion3', 'centurion5',
  'chieftain5', 'chieftain_mk10', 'vickers_mk1',
  'amx30', 'amx30b2',
  'type59', 'type74', 'udes03', 'strv103', 'strv103a',
  't62mv1', 't64bv1', 'leo1a5',
  'm46_patton', 'm47_patton', 'm48',
  'm60a1', 'm60a2', 'm60a3', 'mbt70',
  't95',
]);

const RETAINED_WW2 = new Set(RETAINED_WW2_IDS);
const HISTORICAL_COLD_WAR_CANDIDATES = new Set(HISTORICAL_COLD_WAR_CANDIDATE_IDS);
const RETAINED_COLD_WAR = new Set(RETAINED_COLD_WAR_IDS);

/** Whether a registered spec is intentionally absent from the live roster. */
export function isRetiredHistoricalTank(spec) {
  if (!spec || !spec.id) return false;
  if (HISTORICAL_COLD_WAR_CANDIDATES.has(spec.id)) return !RETAINED_COLD_WAR.has(spec.id);
  return spec.era === 'ww2' && !RETAINED_WW2.has(spec.id);
}

/** Stable explanation used by developer tags and the roster report. */
export function developmentOnlyReason(spec, { activeRoster = false } = {}) {
  if (!spec?.id) return 'unregistered';
  if (RETIRED_EXTERNAL_PLACEHOLDER_IDS.has(spec.id)) return 'reference-placeholder';
  if (isProductionHiddenTankId(spec.id)) return 'production-curation';
  if (isRetiredHistoricalTank(spec)) return 'historical-archive';
  return activeRoster ? 'development-only' : 'saved-development-model';
}
