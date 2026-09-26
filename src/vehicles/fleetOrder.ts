// Canonical garage order for related native vehicle families.
//
// Registration is intentionally distributed across the modern packs and the
// recovered-spec waves, so append order is an implementation detail rather
// than a useful player-facing lineage.  Keep each family contiguous and sort
// its members by historical/design progression after every pack has loaded.
// This changes no builder or gameplay spec; it only normalizes ALL_TANK_IDS.

import { ALL_TANK_IDS, TANK_CATALOGS } from './specs.ts';

export const NATIVE_VARIANT_FAMILIES = Object.freeze({
  t72: Object.freeze([
    // The T-72B3 donor and the T-72B obr. 1985 are unregistered combat
    // templates (donorSpecs.ts); only battle-playable members order here.
    't72b3m', 't72bu', 'pt91m',
  ]),
  t80: Object.freeze([
    't80', 't80b', 't80bv', 't80u', 't84',
  ]),
  t90: Object.freeze([
    't90', 't90a', 't90a_vladimir', 't90a_burlak', 't90sm', 't90m', 't90ms', 't90m_proryv',
  ]),
} as const);

export const NATIVE_FAMILY_ORDER = Object.freeze({
  abramsSourceX: Object.freeze(['m1a2_x', 'm1a2_tusk_x', 'm1a2_sepv2_x', 'm1a2_sepv3_x', 'ua_m1a1_x']),
  abrams: Object.freeze([
    'm1a1', 'm1a1ha', 'm1a2', 'm1a2_tusk',
    'm1a2_sepv2', 'm1a2_sepv3', 'm1a3', 'abramsx',
  ]),
  sheridan: Object.freeze([
    'm551_sheridan', 'm551a1_tts',
  ]),
  soviet_modern_mbt: Object.freeze([
    't62mv1', 't64bv1',
    ...NATIVE_VARIANT_FAMILIES.t72,
    ...NATIVE_VARIANT_FAMILIES.t80,
    ...NATIVE_VARIANT_FAMILIES.t90,
  ]),
  leopard: Object.freeze([
    'leo1a5', 'leopard2_proto', 'leo2a4', 'leo2a4_otco', 'leo2a4m',
    'leo2a5', 'leo2a5_a5nl', 'leo2a6', 'leo2a6m',
    'leo2_revolution_proto', 'leo2_revolution', 'leo2a7v',
  ]),
  challenger: Object.freeze([
    'chieftain5', 'chieftain_mk10', 'challenger1', 'fv4034', 'challenger2',
    'challenger2e', 'ua_challenger2', 'challenger_3', 'challenger_3x',
  ]),
  israel: Object.freeze([
    'merkava1b', 'merkava2b', 'merkava2d', 'sabra_mk2_x', 'merkava3c', 'merkava3d', 'merkava3d_x',
    'merkava4_x', 'merkava4b', 'namer_ifv', 'merkava4_trophy', 'merkava4_barak',
  ]),
  japan_mbt: Object.freeze([
    'stb1', 'type74', 'type90', 'type90a', 'type10', 'type10b',
  ]),
  italy: Object.freeze([
    'dardo', 'lrmv_lynx', 'carro45t', 'ariete', 'ariete_c1', 'ariete_c2', 'ariete_c1_x', 'ariete_c2_x',
  ]),
  ukraine: Object.freeze([
    'ua_t64bv', 'ua_t80bv', 'ua_t80u_kursk', 'ua_t84_oplot_m', 'ua_m1a1', 'leo2a6_ua',
  ]),
  china: Object.freeze([
    'type59', 'ztz85_iii', 'type99a', 'type96b_x', 'aft10_x', 'ztz99a2_prototype', 'ztz99a2', 'vt4a1', 'type100', 'ztz100_x', 'ztz100_prototype',
  ]),
  sweden: Object.freeze([
    'strv81', 'udes03', 'strv103a', 'strv103', 'cv90', 'cv90_x', 'cv90105_tml_x', 'strv122', 'cv90_mkiv', 'cv90_mkiv_x',
  ]),
  suppliedBritish: Object.freeze(['fv510', 'fv510_milan', 'fv510_milan_x', 'ajax_x', 'ares_apc_x']),
  suppliedRussian: Object.freeze(['bmp3', 'bmp3m_dragun125_x', 'kurganets25_x', 'tos1a_tagil']),
  poland: Object.freeze([
    't72m1_jaguar', 'pt91_twardy', 'pl01', 'borsuk',
  ]),
} as const);

export function applyNativeFamilyOrder(ids: string[] = ALL_TANK_IDS): string[] {
  for (const family of Object.values(NATIVE_FAMILY_ORDER)) {
    const present = family.filter((id) => ids.includes(id));
    if (present.length < 2) continue;
    const familySet = new Set(present);
    const first = ids.findIndex((id) => familySet.has(id));
    const rest = ids.filter((id) => !familySet.has(id));
    rest.splice(first, 0, ...present);
    ids.splice(0, ids.length, ...rest);
  }
  return ids;
}

/** Apply presentation order once to every distinct authoritative catalog. */
export function applyNativeFamilyOrderToCatalogs(
  catalogs: Readonly<Record<string, string[]>> = TANK_CATALOGS,
): void {
  const ordered = new Set<string[]>();
  for (const ids of Object.values(catalogs)) {
    if (ordered.has(ids)) continue;
    applyNativeFamilyOrder(ids);
    ordered.add(ids);
  }
}
