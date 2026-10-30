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
    't72b3m_2022', 't72bu_1989', 'pt91m',
  ]),
  t80: Object.freeze([
    't80', 't80b', 't80bv', 't80uk', 't84',
  ]),
  t90_1992: Object.freeze([
    't90_1992', 't90a_2004', 't90a_2006', 't90a_burlak_proto', 't90sm_2013', 't90am', 't90ms_2011', 't90m_proryv',
  ]),
} as const);

export const NATIVE_FAMILY_ORDER = Object.freeze({
  abramsSourceX: Object.freeze(['m1a2_abrams', 'm1a2_abrams_tusk', 'm1a2_abrams_sepv2', 'm1a2_abrams_sepv3', 'ua_m1a2_abrams']),
  abrams: Object.freeze([
    'm1a1', 'm1a1ha', 'm1a1_abrams_hc', 'm1a1_abrams_sa',
    'm1a1_abrams_aim', 'm1a1_abrams_fep', 'm1a3', 'abramsx',
  ]),
  sheridan: Object.freeze([
    'm551_sheridan', 'm551a1_tts',
  ]),
  soviet_modern_mbt: Object.freeze([
    't55a', 't62_1975', 't64bv1', 't64bv',
    ...NATIVE_VARIANT_FAMILIES.t72,
    ...NATIVE_VARIANT_FAMILIES.t80,
    ...NATIVE_VARIANT_FAMILIES.t90_1992,
  ]),
  leopard: Object.freeze([
    'leo1a5', 'leopard2_proto', 'leo2a2', 'leo2a3', 'leo2a4m_can',
    'leo2a4_v', 'leo2a4m', 'leo2a4', 'leo2a4_otco',
    'leo2_revolution_proto', 'leo2_revolution', 'leo2_improved',
  ]),
  challenger: Object.freeze([
    'chieftain3', 'chieftain_mk9', 'challenger1_mk1', 'challenger1_mk2', 'challenger_x', 'challenger_x_sleek', 'fv4034', 'challenger2',
    'challenger2e', 'ua_challenger2', 'challenger3_td', 'challenger3_td_rws', 'challenger3_proto', 'challenger3',
  ]),
  // 258: in shown-tier order (matchmaking reads it): the Sabra at II and the Namer at IV come before the Merkava 2 and 3
  israel: Object.freeze([
    'merkava1b', 'sabra_mk2', 'merkava2b', 'merkava2d', 'namer_ifv', 'merkava3c', 'merkava3_baz', 'merkava3d',
    'merkava4', 'merkava4b', 'merkava4_trophy', 'merkava4_barak',
  ]),
  japan_mbt: Object.freeze([
    'stb1', 'type74', 'type90_kyumaru', 'type90a', 'type10_tk_x', 'type10_dozer', 'type10b',
  ]),
  national_ua: Object.freeze(["t80u_zoria", "t72b3m_hetman", "t72b3m_hetman_ii", "t72b3_sich"]),
  national_pl: Object.freeze(["t80u_husarz", "t72b3m_wilk", "t72b3_zubr", "t72b3_zubr_ii", "pt64_tur"]),
  national_cn: Object.freeze(["t80u_yun", "t72b3m_kunlun", "t72b3_qilin"]),
  national_ru: Object.freeze(["t80u_bars_m", "t72b3m_bulat_m", "t72b3_bastion_m"]),
  french_ifv: Object.freeze(['amx10p', 'amx10p_25']),
  italy: Object.freeze([
    'dardo', 'lrmv_lynx', 'carro45t', 'c1_ariete_preserie', 'c1_ariete_proto_serie1', 'c2_ariete_proto', 'c1_ariete', 'c2_ariete',
  ]),
  ukraine: Object.freeze([
    't64bv_donbas', 't64b1v_2022', 't64bm1m', 'ua_t80bv', 't80u_kursk', 't84bm_oplot_m', 'bm_oplot_m', 'bm_oplot_t', 'ua_m1a1', 'leo2a6_ua',
  ]),
  china: Object.freeze([
    'type59', 'ztz85_iii', 'ztz99_longwei', 'type96b', 'type96_72_long', 'type96_80_feng', 'type96_72m_lei', 'aft10', 'ztz99a', 'ztz99a2', 'vt4a1', 'type100', 'ztz100', 'ztz100_prototype', 'ztz20_prototype', 'ztz20',
  ]),
  sweden: Object.freeze([
    'strv81', 'udes03', 'strv103a', 'strv103b', 'cv90', 'cv9040c', 'cv90105_tml', 'strv121', 'christian2', 'cv90_mk4_concept', 'cv90_mk4',
  ]),
  suppliedBritish: Object.freeze(['fv510', 'fv510_milan', 'warrior_tes_h', 'ajax', 'ares_apc']),
  suppliedRussian: Object.freeze(['bmp3', 'bmp3m_dragun125', 'kurganets25', 'tos1a_tagil']),
  poland: Object.freeze([
    't72m1_jaguar', 't72_rys', 'pt91a_twardy', 'pl01', 'borsuk',
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
