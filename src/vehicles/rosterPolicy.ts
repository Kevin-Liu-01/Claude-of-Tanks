// Player-facing fleet policy.
//
// Source rows and builders remain available as archaeological/reference input,
// but only the owner-approved legacy vehicles below stay in the selectable
// roster. This keeps registration history intact while ensuring garage,
// battles, asset generation and release gates all consume the same policy.

import type { RuntimeValue } from '../runtimeTypes.ts';

const DEV_FLEET_ENV_KEY = 'VITE_COT_DEV_FLEET_KEY';
export const DEV_FLEET_KEY = 'claude-of-tanks-local-dev';
export const DEV_FLEET_LABEL = 'DEV';

// Records listed here stay registered for local vehicle/gallery tooling but
// never appear in production carousels or matchmaking. Owner 2026-09-22 ("we
// shouldn't have any hidden tanks"): the twelve curated exclusions retired
// from the saved fleet on 2026-09-23, so the set is deliberately empty; keep
// any future production exclusion here so UI surfaces cannot quietly diverge.
export const PRODUCTION_HIDDEN_TANK_IDS = new Set<string>([]);

// Generic externally-authored placeholders (the Mophs recon tank and the
// Quaternius heavy) retired with the hidden fleet on 2026-09-23.
export const RETIRED_EXTERNAL_PLACEHOLDER_IDS = new Set<string>([]);

interface DevelopmentFleetEnvironment {
  DEV?: RuntimeValue;
  [key: string]: RuntimeValue;
}

interface RosterPolicySpec {
  id?: RuntimeValue;
  era?: RuntimeValue;
}

/**
 * Unlock the full saved fleet only in Vite's local development server.
 *
 * This is a presentation/build gate, not a secret or an authorization layer:
 * VITE_* values are embedded into client code. Production builds remain
 * curated even if the variable is accidentally present in their environment.
 */
export function developmentFleetEnabled(env: DevelopmentFleetEnvironment = {}): boolean {
  return env?.DEV === true && env?.[DEV_FLEET_ENV_KEY] === DEV_FLEET_KEY;
}

const VITE_ENV = typeof import.meta !== 'undefined' && import.meta.env
  ? import.meta.env
  : {};

export const DEV_FLEET_ACTIVE = developmentFleetEnabled(VITE_ENV);

export function isProductionHiddenTankId(id: RuntimeValue): boolean {
  return typeof id === 'string' && PRODUCTION_HIDDEN_TANK_IDS.has(id);
}

export const RETAINED_WW2_IDS = Object.freeze([
  // Explicitly requested independent reconstruction of the archived original.
  'jpz_e100_x',
  'kv2',
]);

// The former garage Cold War catalog boundary. Variants intentionally treated
// as modern by that catalog (Abrams, T-80/T-90, post-1991 T-72s, Challengers,
// Merkavas and IFVs) remain in the modern fleet.
export const HISTORICAL_COLD_WAR_CANDIDATE_IDS = Object.freeze([
  'm46_patton', 'm47_patton', 'm48', 'm60a1', 'm60a2', 'm60a3', 'mbt70', 'm551_sheridan',
  'leo1a5',
  'type59', 't62mv1', 't64bv1',
  'centurion3', 'centurion5', 'chieftain5', 'chieftain_mk10', 'vickers_mk1',
  'amx30', 'amx30b2',
  'udes03', 'strv103', 'strv103a', 'type74',
]);

export const RETAINED_COLD_WAR_IDS = Object.freeze([
  'centurion3', 'centurion5',
  'chieftain5', 'chieftain_mk10', 'vickers_mk1',
  'amx30', 'amx30b2',
  'type59', 'type74', 'udes03', 'strv103', 'strv103a',
  't62mv1', 't64bv1', 'leo1a5',
  'm46_patton', 'm47_patton', 'm48',
  'm60a1', 'm60a2', 'm60a3', 'mbt70', 'm551_sheridan',
]);

const RETAINED_WW2 = new Set<string>(RETAINED_WW2_IDS);
const HISTORICAL_COLD_WAR_CANDIDATES = new Set<string>(HISTORICAL_COLD_WAR_CANDIDATE_IDS);
const RETAINED_COLD_WAR = new Set<string>(RETAINED_COLD_WAR_IDS);

/** Whether a registered spec is intentionally absent from the live roster. */
export function isRetiredHistoricalTank(spec: RosterPolicySpec | null | undefined): boolean {
  if (!spec || !spec.id) return false;
  const id = String(spec.id);
  if (HISTORICAL_COLD_WAR_CANDIDATES.has(id)) return !RETAINED_COLD_WAR.has(id);
  return spec.era === 'ww2' && !RETAINED_WW2.has(id);
}

/** Stable explanation used by developer tags and the roster report. */
export function developmentOnlyReason(
  spec: RosterPolicySpec | null | undefined,
  { activeRoster = false }: { activeRoster?: boolean } = {},
): string {
  if (!spec?.id) return 'unregistered';
  const id = String(spec.id);
  if (RETIRED_EXTERNAL_PLACEHOLDER_IDS.has(id)) return 'reference-placeholder';
  if (isProductionHiddenTankId(id)) return 'production-curation';
  if (isRetiredHistoricalTank(spec)) return 'historical-archive';
  return activeRoster ? 'development-only' : 'saved-development-model';
}
