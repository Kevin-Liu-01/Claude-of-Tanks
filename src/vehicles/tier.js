// One source of truth for vehicle tiers across matchmaking, garage cards,
// battle loading, HUD target panels, killcam and generated asset manifests.

export const TANK_TIER = Object.freeze({
  m4a3e8: 6, tiger1: 7, t34_85: 6, is2: 7, panther_g: 7,
  m1a2: 10, t90m: 10, leo2a7: 10,
  strv103: 9, is3: 8, t34_85_cad: 6, newc_tiger: 7,
  newc_pziii: 4, pziii_konserwa: 3, leichttraktor: 1, recon_tank: 8, q_heavy: 9,
  kv2: 6, tiger2: 8, sherman_jumbo: 6, jagdtiger: 9, jpz_e100: 10,
  sturmtiger: 8, t95: 9, t30: 9, is7: 10, object279: 10, is6b: 8, is1: 5,
  m1a1: 9, t90a: 9, m1a2_tusk: 10,
  t72b3: 8, challenger2: 9, challenger_3: 10, merkava4: 9, leo2a6: 9,
  leo2a4: 8, t80u: 8, leclerc: 9, type99a: 9, leo1a5: 7, t14: 10,
  chieftain_mk10: 7, k2: 9, type10: 9, m2a2_bradley: 8, bmp2: 7, ariete: 8,
  k1a1: 8, type89: 7, spz_puma: 8, amx40: 9,
  type74: 8, bmp1: 6, m1128: 8, m1296: 7, kf51: 10,
  m1a2_tejas: 10, abramsx: 10,
  challenger1: 8, chieftain5: 7, fv510: 7,
  leo2_revolution: 10, leo2a5: 9, leo2a7v: 10,
  m1a1ha: 9, m1a2_sepv2: 10, m1a2_sepv3: 10, m60a1: 7, pt91m: 8,
  merkava1b: 7, merkava2b: 7, merkava2d: 8,
  merkava3b: 8, merkava3c: 8, merkava3d: 9, merkava4b: 9,
  t62mv1: 7, t64bv1: 8, t72b_1987: 8, t72b3m: 9,
  t72bu: 8, t90sm: 9, type90: 9, t90a_vladimir: 9,
  t90: 9, t90ms: 9, t90a_burlak: 9,
  is3_bergman: 8, isu152: 8, isu122s: 8,
  centurion3: 7, centurion5: 8, comet: 7, challenger_cruiser: 6, charioteer: 8,
  leopard2_proto: 8, m1a1_aim: 9, m46_patton: 7, m47_patton: 7,
  m26_pershing: 8, m45_patton: 8, m60a3: 8,
  t44: 7, t54: 7, type59: 7, t80: 8, t80b: 9, t80bv: 9,
  amx30: 7, amx30b2: 8, m48: 7, m60a2: 8, vickers_mk1: 7, t84: 9,
});

export const ROMAN_TIER = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);

/** Numeric tier for gameplay ordering; unknown developer rows default to VI. */
export function tankTier(id) {
  return TANK_TIER[id] ?? 6;
}

/** Roman tier for UI; unknown rows stay blank so missing data is visible. */
export function tierNumeral(id) {
  return ROMAN_TIER[TANK_TIER[id]] || '';
}
