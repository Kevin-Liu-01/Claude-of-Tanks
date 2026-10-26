// The tier the game shows, by vehicle id: each vehicle's column in its national tree (src/techTree/nations), twin
// builds included. Generated with the trees; src/techTree/techTree.selftest.mjs checks it against them. Every surface
// that shows a tier reads it (the Garage, the fleet strip, the Gallery and its filters, the HUD, the battle load, the
// killcam, the play menu, the Field Manual, the landing). Matchmaking does not: the solo battle's balance and the
// roster planner keep src/vehicles/tier.ts (owner 2026-10-25). Pure data, Node-runnable.
// First-party: Kevin B. Liu (NOTICE.md).

import type { TreeTier } from './model.ts';

const TIERS: Readonly<Record<string, TreeTier>> = Object.freeze({
  abramsx: 10, aft10: 7, ajax: 8, amx10p: 5, amx10p_25: 7, amx30: 1, amx30b: 1, amx30b2: 3, amx40: 5, amx40_proto: 5,
  amx56: 7, ares_apc: 3, bmp2: 3, bmp3: 5, bmp3_rok: 5, bmp3m_dragun125: 10, bmpt_t90: 10, bmpt_terminator2: 7,
  borsuk: 9, bwp1: 5, c1_ariete: 7, c1_ariete_preserie: 5, c1_ariete_proto_serie1: 7, c2_ariete: 9,
  c2_ariete_proto: 9, carro45t: 3, centurion3: 1, centurion5_2: 3, challenger1_mk2: 5, challenger1_mk3: 6,
  challenger2: 7, challenger2e: 8, challenger3: 10, challenger3_proto: 9, chieftain3: 2, chieftain5: 2,
  chieftain_mk10: 5, chieftain_mk9: 5, cv90: 6, cv90105_tml: 6, cv9040c: 7, cv90_mk4: 10, cv90_mk4_concept: 10,
  dardo: 6, fv4034: 5, fv510: 3, fv510_milan: 6, griffin50mm: 10, griffin_viper: 8, hayate_ifv: 3, jpz_e100: 1,
  k1a1: 8, k1e1: 6, k21: 8, k2_black_panther: 10, k2b: 7, kf41_lynx: 9, kf51_evo: 10, kf51_panther: 10, kf51_u: 10,
  kurganets25: 10, kv2: 1, leclerc_s1: 6, leclerc_s2: 7, leclerc_sxxi: 7, leclerc_xlr: 9, leo1a5: 3, leo2_improved: 8,
  leo2_revolution: 7, leo2_revolution_proto: 7, leo2a2: 5, leo2a3: 5, leo2a4: 6, leo2a4_otco: 9, leo2a4_v: 6,
  leo2a4m: 9, leo2a4m_can: 7, leo2a5: 7, leo2a5m: 9, leo2a6: 7, leo2a6_ua: 10, leo2a6m: 8, leo2a7v: 9,
  leopard2_proto: 4, lrmv_lynx: 9, m1a1: 5, m1a1_abrams_aim: 7, m1a1_abrams_fep: 8, m1a1_abrams_hc: 7,
  m1a1_abrams_sa: 7, m1a1ha: 5, m1a2_abrams: 7, m1a2_abrams_sepv2: 7, m1a2_abrams_sepv3: 8, m1a2_abrams_tusk: 7,
  m1a3: 10, m2a2_bradley: 5, m3a3_bradley: 7, m46_patton: 1, m47_patton: 1, m48a5_patton: 3, m551_sheridan: 5,
  m551a1_tts: 7, m60a1: 3, m60a2: 5, m60a3: 4, m6_linebacker: 7, marder1a3: 4, marder2: 7, mbt70: 7, merkava1b: 3,
  merkava2b: 5, merkava2d: 5, merkava3_baz: 7, merkava3c: 6, merkava3d: 7, merkava4: 7, merkava4_barak: 10,
  merkava4_trophy: 9, merkava4b: 7, namer_ifv: 7, object148_proto: 10, object695: 10, pl01: 10, pl01_105: 10,
  pt91a_twardy: 6, pt91m: 5, puma_s1: 10, raiju_ifv: 10, sabra_mk2: 6, spz_puma: 7, spz_wotan: 10, stb1: 3,
  strv103a: 5, strv103b: 7, strv121: 7, strv122: 7, strv81: 2, t14_armata: 10, t62_1975: 2, t62mv1: 3, t64bv1: 3,
  t64bv_donbas: 5, t72_rys: 7, t72b3: 5, t72b3_bastion_m: 9, t72b3_qilin: 9, t72b3_sich: 9, t72b3_zubr: 9,
  t72b3_zubr_ii: 9, t72b3m_2016: 7, t72b3m_2022: 7, t72b3m_bulat_m: 9, t72b3m_hetman: 9, t72b3m_hetman_ii: 9,
  t72b3m_kunlun: 8, t72b3m_wilk: 8, t72b_1987: 5, t72bu: 5, t72bu_1989: 5, t72m1_jaguar: 5, t80: 4, t80b: 5, t80bv: 5,
  t80u: 5, t80u_bars_m: 8, t80u_husarz: 9, t80u_kursk: 6, t80u_yun: 10, t80u_zoria: 9, t80uk: 5, t84: 6,
  t84bm_oplot_m: 8, t90: 7, t90_1992: 7, t90a: 7, t90a_2004: 7, t90a_2006: 7, t90a_burlak: 8, t90a_burlak_proto: 8,
  t90a_vladimir: 7, t90am: 7, t90m: 8, t90m_proryv: 10, t90ms_2011: 8, t90ms_tagil: 8, t90sm: 7, t90sm_2013: 7,
  tos1a_tagil: 7, type10: 10, type100: 10, type10_dozer: 10, type10_tk_x: 9, type10b: 9, type59: 1, type74: 4,
  type89: 9, type90: 6, type90_kyumaru: 6, type90a: 6, type96_72_long: 6, type96_72m_lei: 8, type96_80_feng: 8,
  type96b: 7, ua_challenger2: 10, ua_m1a1: 7, ua_m1a2_abrams: 7, ua_m2a3_bradley: 7, ua_t80bv: 7, udes03: 3, upior: 7,
  vickers_mk1: 3, vt4a1: 9, warrior_tes_h: 7, xk2_black_panther: 9, ztz100: 10, ztz100_prototype: 7, ztz85_iii: 4,
  ztz99_longwei: 7, ztz99a: 8, ztz99a2: 9,
});

const NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;

/** The tier a vehicle shows, 1-10; 0 for an id no tree draws (a development row), which sorts last. */
export function displayTier(id: string): number {
  return Object.hasOwn(TIERS, id) ? TIERS[id]! : 0;
}

/** The shown tier as a Roman numeral; '' for an id no tree draws, so missing data is visible. */
export function tierNumeral(id: string): string {
  return NUMERALS[displayTier(id)];
}
