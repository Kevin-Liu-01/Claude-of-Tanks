// The tier the game shows, by vehicle id: each vehicle's column in its national tree (src/techTree/nations), twin
// builds included. Generated with the trees; src/techTree/techTree.selftest.mjs checks it against them. Every surface
// that shows a tier reads it (the Garage, the fleet strip, the Gallery and its filters, the HUD, the battle load, the
// killcam, the play menu, the Field Manual, the landing). Matchmaking does not: the solo battle's balance and the
// roster planner keep src/vehicles/tier.ts (owner 2026-10-25). Pure data, Node-runnable.
// First-party: Kevin B. Liu (NOTICE.md).

import type { TreeTier } from './model.ts';

const TIERS: Readonly<Record<string, TreeTier>> = Object.freeze({
  abramsx: 10, aft10: 3, ajax: 5, amx10p: 3, amx10p_25: 4, amx30: 1, amx30b: 1, amx30b2: 1, amx40: 3, amx40_proto: 3,
  amx56: 9, ares_apc: 2, bm_oplot_m: 10, bm_oplot_t: 10, bmp2: 1, bmp3: 2, bmp3_rok: 3, bmp3m_dragun125: 10, bmpt_t90: 6, bmpt_terminator2: 5,
  borsuk: 5, bwp1: 3, c1_ariete: 6, c1_ariete_preserie: 4, c1_ariete_proto_serie1: 6, c2_ariete: 7,
  c2_ariete_proto: 7, carro45t: 2, christian2: 8, centurion3: 2, centurion5_2: 3, centurion13: 3, centurion5_avre: 2, centurion5_1_aus: 2, challenger1_mk1: 8, challenger_x: 8, challenger_x_sleek: 8, challenger1_mk2: 8, challenger1_mk3: 8,
  challenger2: 9, challenger2e: 9, challenger3: 10, challenger3_proto: 8, challenger3_td: 8,
  challenger3_td_rws: 8, chieftain3: 2, chieftain5: 2,
  chieftain_mk10: 4, chieftain_mk9: 4, cv90: 4, cv90105_tml: 2, cv9040c: 4, cv90_mk4: 7, cv90_mk4_concept: 7,
  dardo: 4, fv4034: 4, fv510: 2, fv510_milan: 3, griffin50mm: 10, griffin_viper: 3, hayate_ifv: 2, jpz_e100: 1,
  k1a1: 8, k1e1: 4, k21: 5, k2_black_panther: 10, k2b: 7, kf41_lynx: 5, kf51_evo: 10, kf51_panther: 10, kf51_u: 10,
  kurganets25: 10, kv2: 1, leclerc_s1: 8, leclerc_s2: 9, leclerc_sxxi: 9, leclerc_xlr: 10, leo1a2a1: 1,
  leo1a5: 1, leo2_improved: 8, leo2_revolution: 8, leo2_revolution_proto: 8, leo2a2: 3, leo2a3: 4, leo2a3_b4: 4,
  leo2a4: 8, leo2a4_otco: 8, leo2a4_v: 8, leo2a4m: 8, leo2a4m_can: 8, leo2a5: 9, leo2a5m: 9, leo2a6: 9, leo2a6_ua: 9,
  leo2a6m: 9, leo2a7v: 10, leopard2_proto: 3, lrmv_lynx: 5, m1a1: 8, m1a1_abrams_aim: 8, m1a1_abrams_fep: 8, m1a1_abrams_hc: 8,
  m1a1_abrams_sa: 8, m1a1ha: 8, m1a2_abrams: 9, m1a2_abrams_sepv2: 9, m1a2_abrams_sepv3: 10, m1a2_abrams_tusk: 9,
  m1a3: 10, m2a2_bradley: 2, m3a3_bradley: 5, m46_patton: 1, m47_patton: 1, m48_super: 2, m48a2ga2: 1, m48a3_patton: 1,
  m48a5_patton: 1, m551_sheridan: 2,
  m551a1_tts: 4, m60a1: 1, m60a2: 2, m60a3: 1, m6_linebacker: 5, magach3: 1, marder1a3: 2, marder2: 5, mbt70: 3, merkava1b: 1,
  merkava2b: 3, merkava2d: 3, merkava3_baz: 8, merkava3c: 8, merkava3d: 8, merkava4: 9, merkava4_barak: 9,
  merkava4_trophy: 9, merkava4b: 9, namer_ifv: 4, object148_proto: 10, object695: 10, olifant_mk2: 3, pl01: 10,
  pl01_105: 10, pt64_tur: 4, pt84_orzel: 10, pt84_sokol: 9, pt84_zbik: 10, pt91a_twardy: 5, pt91m: 4, puma_s1: 6,
  raiju_ifv: 10, sabra_mk2: 2, shot_kal: 3, spz_puma: 4, spz_wotan: 6, stb1: 1, strv103a: 2, strv103b: 2, strv105: 3,
  strv121: 9, strv122: 9, strv81: 2, t14_armata: 10, t62_1975: 1, t62mv1: 2, t64b1v_2022: 4, t64bm1m: 4, t64bv: 3,
  t64bv1: 3, t64bv_donbas: 4,
  t72_rys: 5, t72b3: 6, t72b3_bastion_m: 8, t72b3_qilin: 7, t72b3_sich: 7, t72b3_zubr: 6, t72b3_zubr_ii: 6,
  t72b3m_2016: 6, t72b3m_2022: 6, t72b3m_bulat_m: 8, t72b3m_hetman: 7, t72b3m_hetman_ii: 7, t72b3m_kunlun: 7,
  t72b3m_wilk: 7, t72b_1987: 3, t72bu: 3, t72bu_1989: 3, t72m1_jaguar: 4, t80: 3, t80b: 4, t80bv: 4, t80u: 6,
  t80u_bars_m: 8, t80u_husarz: 7, t80u_kursk: 6, t80u_yun: 7, t80u_zoria: 7, t80uk: 6, t84: 6, t84bm_oplot_m: 6,
  t90: 7, t90_1992: 7, t90a: 9, t90a_2004: 9, t90a_2006: 9, t90a_burlak: 9, t90a_burlak_proto: 9, t90a_vladimir: 9,
  t90am: 9, t90m: 10, t90m_proryv: 10, t90ms_2011: 9, t90ms_tagil: 9, t90sm: 9, t90sm_2013: 9, tos1a_tagil: 5,
  type10: 10, type100: 10, type10_dozer: 10, type10_tk_x: 9, type10b: 9, type59: 1, t55a: 1, type74: 1, type89: 6, type90: 8,
  type90_kyumaru: 8, type90a: 8, type96_72_long: 5, type96_72m_lei: 6, type96_80_feng: 6, type96b: 6,
  ua_challenger2: 9, ua_m1a1: 9, ua_m1a2_abrams: 9, ua_m2a3_bradley: 4, ua_t80bv: 5, udes03: 1, upior: 10,
  vickers_mk1: 2, vt4a1: 8, warrior_tes_h: 5, xk2_black_panther: 6, ztz100: 10, ztz100_prototype: 10, ztz20: 10, ztz20_prototype: 10, ztz85_iii: 1,
  ztz99_longwei: 6, ztz99a: 9, ztz99a2: 10, ztz99a2_qinglong: 9, vt4a1_baihu: 7, t72b3_zhuque: 7, t72b3m_xuanwu: 7,
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
