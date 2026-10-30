// Static battlefield dressing follows the public garage roster, not the saved
// spec dictionary: saved records include hidden vehicles and builder donors.
// The existing world/fleet boundary registers metadata before selecting wrecks.
// Keep this policy builder-free and read the live catalog after registration.
import { PRODUCTION_TANK_IDS } from '../vehicles/specs.ts';
import { VEHICLE_ERAS, type VehicleEra } from '../vehicles/taxonomy.ts';

const HISTORICAL_WRECK_IDS = Object.freeze(['kv2', 'jpz_e100']);

export const WRECK_ROSTER_POOLS: Readonly<Record<VehicleEra, readonly string[]>> = Object.freeze({
  // No public interwar donor is currently available. Preserve the historical
  // fallback without reviving archived or production-hidden vehicle records.
  [VEHICLE_ERAS.INTERWAR]: HISTORICAL_WRECK_IDS,
  [VEHICLE_ERAS.WORLD_WAR_II]: HISTORICAL_WRECK_IDS,
  [VEHICLE_ERAS.COLD_WAR]: Object.freeze([
    'm60a1', 'm48a5_patton', 't80uk', 'type74', 'leo1a5', 'chieftain3',
    'type59', 'strv103b', 'm1a1', 'bmp2', 'm60a2', 'm60a3',
    'm551_sheridan', 'marder1a3', 'bmp3', 'm2a2_bradley', 'type90_kyumaru',
    'amx30b2', 'centurion5_2', 'udes03',
    // the map-vehicles lane (2026-10-06, the period ruling): the maps' own period casts — Fulda's T-80B, Hostomel's
    // T-80BV, the 1960s M47 and AMX-30s, Lebanon's Merkava Mk 1 and T-62, Jordan's Challenger 1, Japan's Type 89,
    // Franconia's Leopard 2
    't80b', 't80bv', 'm47_patton', 'amx30', 'amx30b', 'merkava1b', 't62_1975', 'challenger1_mk2', 'hayate_ifv', 'leo2a2',
  ]),
  // Contemporary battlefield casts include surviving Cold War equipment and
  // the existing prototype vocabulary. Distinct light/IFV/tank silhouettes
  // add variety without raising placement counts or importing their builders.
  [VEHICLE_ERAS.MODERN]: Object.freeze([
    'm1a1_abrams_hc', 't90am', 'leo2_improved', 't90a_2004', 'challenger2', 'leclerc_s2',
    'merkava3_baz', 'xk2_black_panther', 'ztz99_longwei', 'type10_tk_x', 'kf51_evo', 'c1_ariete_preserie', 'pt91m', 'strv121',
    'm1a1', 't80uk', 'm551_sheridan', 'm60a2', 'm60a3', 'marder1a3',
    'bmpt_t90', 'bmp3', 'm2a2_bradley', 'pl01', 'cv90', 't84bm_oplot_m',
    'leclerc_sxxi', 'type90_kyumaru', 'm1a1_abrams_fep', 't72b3m_2022', 'k1e1', 'merkava4b',
    // the period ruling (2026-10-06): the T-72M1 of the Yugoslav wars (the M-84's parent), Hostomel's T-72B3 and the
    // Ukrainian T-64BV
    't72m1_jaguar', 't72b3', 't64bv_donbas',
  ]),
  // (2026-10-28, the world-reds lane) the Challenger 3 and C2 Ariete prototypes and the CV90 Mk IV concept left with
  // vehicle-eras-254, which made them modern (Mars authors its own cast and keeps its Challenger 3)
  [VEHICLE_ERAS.NEXT_GENERATION]: Object.freeze([
    'kf51_evo', 'object148_proto', 'm1a3', 'abramsx', 'pl01',
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
