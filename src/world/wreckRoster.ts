// Static battlefield dressing follows the public garage roster, not the saved
// spec dictionary: saved records include hidden vehicles and builder donors.
// The existing world/fleet boundary registers metadata before selecting wrecks.
// Keep this policy builder-free and read the live catalog after registration.
import { PRODUCTION_TANK_IDS } from '../vehicles/specs.ts';
import { VEHICLE_ERAS, type VehicleEra } from '../vehicles/taxonomy.ts';

const HISTORICAL_WRECK_IDS = Object.freeze(['kv2', 'jpz_e100_x']);

export const WRECK_ROSTER_POOLS: Readonly<Record<VehicleEra, readonly string[]>> = Object.freeze({
  // No public interwar donor is currently available. Preserve the historical
  // fallback without reviving archived or production-hidden vehicle records.
  [VEHICLE_ERAS.INTERWAR]: HISTORICAL_WRECK_IDS,
  [VEHICLE_ERAS.WORLD_WAR_II]: HISTORICAL_WRECK_IDS,
  [VEHICLE_ERAS.COLD_WAR]: Object.freeze([
    'm60a1', 'm48', 't80u', 'type74', 'leo1a5', 'chieftain5',
    'type59', 'strv103', 'm1a1', 'bmp2', 'm60a2', 'm60a3',
    'm551_sheridan', 'marder1a3', 'bmp3', 'm2a2_bradley', 'type90',
    'amx30b2', 'centurion5', 'udes03',
  ]),
  // Contemporary battlefield casts include surviving Cold War equipment and
  // the existing prototype vocabulary. Distinct light/IFV/tank silhouettes
  // add variety without raising placement counts or importing their builders.
  [VEHICLE_ERAS.MODERN]: Object.freeze([
    'm1a2', 't90m', 'leo2a7v', 't90a', 'challenger2', 'leclerc',
    'merkava3d', 'k2', 'type99a', 'type10', 'kf51', 'ariete', 'pt91m', 'strv122',
    'm1a1', 't80u', 'm551_sheridan', 'm60a2', 'm60a3', 'marder1a3',
    'bmpt_t90', 'bmp3', 'm2a2_bradley', 'pl01', 'cv90', 'ua_t84_oplot_m',
    'leclerc_xlr', 'type90', 'm1a2_sepv3', 't72b3m', 'k1a1', 'merkava4b',
  ]),
  [VEHICLE_ERAS.NEXT_GENERATION]: Object.freeze([
    'kf51', 't14', 'challenger_3', 'm1a3', 'abramsx', 'ariete_c2', 'pl01', 'cv90_mkiv',
  ]),
});

export function isPublicWreckDonor(specId: string): boolean {
  return PRODUCTION_TANK_IDS.includes(specId);
}

function publicWreckIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(isPublicWreckDonor))];
}

/**
 * Preserve authored order, remove unavailable donors and repeated entries,
 * and use the era cast when no authored public donor remains. The returned
 * array is invocation-owned. An empty public catalog returns no wrecks; the
 * placement caller must skip it, never select an undefined or hidden donor.
 */
export function resolveWreckRoster(era: string, authoredIds?: readonly string[]): string[] {
  const candidates = Object.hasOwn(WRECK_ROSTER_POOLS, era)
    ? WRECK_ROSTER_POOLS[era as VehicleEra] : WRECK_ROSTER_POOLS[VEHICLE_ERAS.MODERN];
  if (authoredIds) {
    const authored = publicWreckIds(authoredIds);
    if (authored.length > 0) return authored;
  }
  return publicWreckIds(candidates);
}
