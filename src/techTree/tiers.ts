// The tier the game shows, by vehicle id: each vehicle's column in its national tree (src/techTree/nations), twin
// builds included. Generated with the trees; src/techTree/techTree.selftest.mjs checks it against them. Every surface
// that shows a tier reads it (the Garage, the fleet strip, the Gallery and its filters, the HUD, the battle load, the
// killcam, the play menu, the Field Manual, the landing). Matchmaking does not: the solo battle's balance and the
// roster planner keep src/vehicles/tier.ts (owner 2026-10-25). Pure data, Node-runnable.
// First-party: Kevin B. Liu (NOTICE.md).

import type { TreeTier } from './model.ts';

const TIERS: Readonly<Record<string, TreeTier>> = Object.freeze({
  abramsx: 9, aft10: 7, ajax: 8, amx10p: 4, amx10p_25: 5, amx30: 1, amx30b: 1, amx30b2: 3, amx40: 4, amx40_proto: 4,
  amx56: 7, ares_apc: 8, bmp2: 3, bmp3: 6, bmp3_rok: 6, bmp3m_dragun125: 8, bmpt_t90: 10, bmpt_terminator2: 9,
  borsuk: 9, bwp1: 4, c1_ariete: 6, c1_ariete_preserie: 4, c1_ariete_proto_serie1: 6, c2_ariete: 9,
  c2_ariete_proto: 10, carro45t: 1, centurion3: 1, centurion5_2: 2, challenger1_mk2: 5, challenger1_mk3: 6,
  challenger2: 7, challenger2e: 8, challenger3: 10, challenger3_proto: 9, chieftain3: 2, chieftain5: 2,
  chieftain_mk10: 5, chieftain_mk9: 5, cv90: 6, cv90105_tml: 5, cv9040c: 7, cv90_mk4: 10, cv90_mk4_concept: 10,
  dardo: 5, fv4034: 5, fv510: 4, fv510_milan: 6, griffin50mm: 9, griffin_viper: 8, hayate_ifv: 5, jpz_e100: 2,
  k1a1: 6, k1e1: 7, k21: 8, k2_black_panther: 9, k2b: 10, kf41_lynx: 9, kf51_evo: 10, kf51_panther: 10, kf51_u: 10,
  kurganets25: 9, kv2: 1, leclerc_s1: 6, leclerc_s2: 7, leclerc_sxxi: 8, leclerc_xlr: 9, leo1a5: 3, leo2_improved: 8,
  leo2_revolution: 8, leo2_revolution_proto: 8, leo2a2: 5, leo2a3: 5, leo2a4: 5, leo2a4_otco: 9, leo2a4_v: 6,
  leo2a4m: 9, leo2a4m_can: 8, leo2a5: 7, leo2a5m: 9, leo2a6: 7, leo2a6_ua: 10, leo2a6m: 8, leo2a7v: 9,
  leopard2_proto: 4, lrmv_lynx: 9, m1a1: 5, m1a1_abrams_aim: 7, m1a1_abrams_fep: 8, m1a1_abrams_hc: 6,
  m1a1_abrams_sa: 7, m1a1ha: 5, m1a2_abrams: 6, m1a2_abrams_sepv2: 7, m1a2_abrams_sepv3: 8, m1a2_abrams_tusk: 7,
  m1a3: 10, m2a2_bradley: 5, m3a3_bradley: 7, m46_patton: 1, m47_patton: 1, m48a5_patton: 2, m551_sheridan: 3,
  m551a1_tts: 6, m60a1: 2, m60a2: 3, m60a3: 4, m6_linebacker: 5, marder1a3: 4, marder2: 6, mbt70: 3, merkava1b: 3,
  merkava2b: 5, merkava2d: 6, merkava3_baz: 7, merkava3c: 6, merkava3d: 7, merkava4: 8, merkava4_barak: 10,
  merkava4_trophy: 9, merkava4b: 8, namer_ifv: 8, object148_proto: 7, object695: 9, pl01: 9, pl01_105: 9,
  pt91a_twardy: 5, pt91m: 6, puma_s1: 10, raiju_ifv: 10, sabra_mk2: 6, spz_puma: 8, spz_wotan: 10, stb1: 2,
  strv103a: 3, strv103b: 4, strv121: 7, strv122: 7, strv81: 2, t14_armata: 7, t62_1975: 2, t62mv1: 3, t64bv1: 3,
  t64bv_donbas: 7, t72_rys: 8, t72b3: 7, t72b3_bastion_m: 9, t72b3_qilin: 9, t72b3_sich: 9, t72b3_zubr: 9,
  t72b3_zubr_ii: 9, t72b3m_2016: 8, t72b3m_2022: 9, t72b3m_bulat_m: 9, t72b3m_hetman: 9, t72b3m_hetman_ii: 9,
  t72b3m_kunlun: 8, t72b3m_wilk: 8, t72b_1987: 4, t72bu: 5, t72bu_1989: 5, t72m1_jaguar: 5, t80: 4, t80b: 4, t80bv: 5,
  t80u: 5, t80u_bars_m: 8, t80u_husarz: 9, t80u_kursk: 6, t80u_yun: 10, t80u_zoria: 9, t80uk: 5, t84: 5,
  t84bm_oplot_m: 8, t90: 6, t90_1992: 6, t90a: 6, t90a_2004: 6, t90a_2006: 7, t90a_burlak: 8, t90a_burlak_proto: 8,
  t90a_vladimir: 7, t90am: 7, t90m: 8, t90m_proryv: 10, t90ms_2011: 7, t90ms_tagil: 7, t90sm: 8, t90sm_2013: 8,
  tos1a_tagil: 5, type10: 9, type100: 10, type10_dozer: 9, type10_tk_x: 8, type10b: 10, type59: 1, type74: 3,
  type89: 9, type90: 6, type90_kyumaru: 6, type90a: 7, type96_72_long: 6, type96_72m_lei: 8, type96_80_feng: 8,
  type96b: 7, ua_challenger2: 10, ua_m1a1: 9, ua_m1a2_abrams: 9, ua_m2a3_bradley: 9, ua_t80bv: 8, udes03: 3, upior: 8,
  vickers_mk1: 3, vt4a1: 9, warrior_tes_h: 7, xk2_black_panther: 7, ztz100: 10, ztz100_prototype: 9, ztz85_iii: 4,
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
