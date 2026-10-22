// One source of truth for vehicle tiers across matchmaking, garage cards,
// battle loading, HUD target panels, killcam and generated asset manifests.

export const TANK_TIER = Object.freeze({
  tos1a_tagil: 10, griffin_viper: 10,
  ares_apc: 7,
  leo2a6: 10, // owner 2026-09-15 (evening): the Leopard 2A6 study is tier X
  k1a1: 10, amx30b: 7, t62mv1: 7,
  t72b_1987: 8, t80u: 8, leclerc_xlr: 10, amx56: 10, // owner 2026-09-16: the Leclerc XLR / AMX 56 studies are tier X
  chieftain_mk10: 8,
  t72b3: 8,
  jpz_e100: 7, // owner 2026-09-15 (evening): the Jagdpanzer E100 study is tier VII
  type10: 10,
  type90: 9,
  amx40: 9,
  c1_ariete: 10, c2_ariete: 10,
  strv122: 10,
  t72b3m_2016: 9,
  t72b3m_hetman_ii:10, t72b3_zubr_ii:10,
  t80u_zoria:10,
  t72b3m_hetman:10,
  t72b3_sich:10,
  t80u_husarz:10,
  t72b3m_wilk:10,
  t72b3_zubr:10,
  t80u_yun:10,
  t72b3m_kunlun:10,
  t72b3_qilin:10,
  t80u_bars_m:10,
  t72b3m_bulat_m:10,
  t72b3_bastion_m:10,
  type96_72_long:9,type96_80_feng:10,type96_72m_lei:10,t72_rys:9,
  challenger1_mk3: 9,
  t72bu: 8,
  chieftain5: 7,
  t90: 10,
  t90a_burlak: 10,
  t90ms_tagil: 10,
  leo2a7v: 10, leo2a6m: 10, leo2a5m: 10, leo2a5: 10, // owner 2026-09-15 (evening): 2A5M and 2A5 studies tier X
  merkava4: 9, merkava3d: 9,
  merkava4_trophy: 10, merkava4_barak: 10, namer_ifv: 9,
  k2_black_panther: 10, kf51_panther: 10,
  m1a2_abrams: 10, m1a2_abrams_tusk: 10,
  m1a2_abrams_sepv2: 10, m1a2_abrams_sepv3: 10, ua_m1a2_abrams: 9,
  // 2026-09-15 owner: the four T-90 X studies are tier X and lead the Russian garage
  t90a: 10, t90a_vladimir: 10, t90m: 10, t90sm: 10, t14_armata: 10,
  kurganets25: 10,
  warrior_tes_h: 10, // owner 2026-10-13 (VEH-11): the Warrior TES(H) is a tier-X Warrior type
  griffin50mm: 10, ajax: 10, aft10: 10,
  bmp3m_dragun125: 10, k21: 9, type96b: 10,
  kf41_lynx: 10, cv90_mk4: 10, cv90105_tml: 9, sabra_mk2: 9,
  m1a1_abrams_hc: 10, t90am: 9, t90m_proryv: 10,
  strv103b: 10,
  kv2: 7,
  mbt70: 10, m1a1: 9, t90a_2004: 9, m1a1_abrams_sa: 10,
  m551_sheridan: 9,
  m551a1_tts: 10,
  fv4034: 8, challenger2: 9, challenger2e: 10, ua_challenger2: 10,
  challenger3_proto: 10, challenger3: 10, leo2a4: 9,
  leo2a2: 8, t80uk: 8, leclerc_s2: 9, leclerc_sxxi: 9, leclerc_s1: 9, // owner 2026-09-16: the legacy Leclerc SXXI / S1 hulls drop to IX
  ztz99_longwei: 9, leo1a5: 7, object148_proto: 10, object695: 10,
  chieftain_mk9: 8, xk2_black_panther: 9, k2b: 9, type10_tk_x: 10, m2a2_bradley: 8, bmp2: 7,
  carro45t: 8, c1_ariete_preserie: 8, c1_ariete_proto_serie1: 9, c2_ariete_proto: 10,
  m6_linebacker: 10,
  marder2: 10,
  amx10p: 9, amx10p_25: 10,
  dardo: 9, lrmv_lynx: 10, borsuk: 10,
  puma_s1: 10, cv9040c: 9, type89: 10,
  k1e1: 8, hayate_ifv: 7, raiju_ifv: 10, spz_puma: 9, spz_wotan: 10, amx40_proto: 9,
  type74: 8, kf51_evo: 10, kf51_u: 10,
  m1a3: 10, abramsx: 10,
  challenger1_mk2: 9, chieftain3: 7, fv510: 7, fv510_milan: 9,
  leo2_revolution_proto: 9, leo2_revolution: 10, leo2a4_v: 9, leo2a4m: 10, leo2_improved: 10,
  m1a1ha: 9, m1a1_abrams_aim: 10, m1a1_abrams_fep: 10, m60a1: 8, pt91m: 8,
  merkava1b: 7, merkava2b: 8, merkava2d: 8,
  merkava3c: 9, merkava3_baz: 9, merkava4b: 9,
  t62_1975: 7, t64bv1: 8, t72b3m_2022: 9,
  t72bu_1989: 8, t90sm_2013: 9, type90_kyumaru: 9, t90a_2006: 9,
  t90_1992: 10, t90ms_2011: 10, t90a_burlak_proto: 10,
  centurion3: 7, centurion5_2: 8,
  leopard2_proto: 8, m46_patton: 7, m47_patton: 7,
  m60a3: 8,
  type59: 7, t80: 8, t80b: 9, t80bv: 9,
  amx30: 7, amx30b2: 8, m48a5_patton: 8, m60a2: 9, vickers_mk1: 7, t84: 9,
  t64bv_donbas: 8, ua_t80bv: 9, t80u_kursk: 9, t84bm_oplot_m: 10, ua_m1a1: 9,
  ztz85_iii: 8, ztz99a: 10, ztz99a2: 10, vt4a1: 10, type100: 10, ztz100: 10, ztz100_prototype: 9,
  // Dedicated Swedish siege-TD progression: prototype -> A -> B.
  strv81: 7, udes03: 8, strv103a: 9, cv90: 9, strv121: 10, cv90_mk4_concept: 10,
  t72m1_jaguar: 8, pt91a_twardy: 9, pl01: 10, pl01_105: 10,
  stb1: 7, type90a: 9, type10b: 10, type10_dozer: 10,
  leo2a3: 8, leo2a4m_can: 9, leo2a4_otco: 10, leo2a6_ua: 10,
  bmp3_rok: 8, ua_m2a3_bradley: 9, bmpt_terminator2: 9,
  bwp1: 9, marder1a3: 8, m3a3_bradley: 10,
  bmp3: 8, upior: 9,
  // §5.363: the T-90-hull Terminator sits one over bmpt_terminator2.
  bmpt_t90: 10,
} as const);

export const ROMAN_TIER = Object.freeze([
  '', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
] as const);

const TIER_BY_ID: Readonly<Record<string, number>> = TANK_TIER;
const NUMERAL_BY_TIER: Readonly<Record<number, string>> = ROMAN_TIER;

/** Numeric tier for gameplay ordering; unknown developer rows default to VI. */
export function tankTier(id: string): number {
  return TIER_BY_ID[id] ?? 6;
}

/** Roman tier for UI; unknown rows stay blank so missing data is visible. */
export function tierNumeral(id: string): string {
  return NUMERAL_BY_TIER[TIER_BY_ID[id]] || '';
}
