// Media r5 cast: the newest source-backed tanks in the fleet (their spec ids end in _x), plus
// road helpers for driving shots (map features dumped by lab --features).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SHOTS } from './paths.mjs';

/** The newest main battle tanks first, then the next-generation IFVs that escort them. */
export const CAST = {
  ztz100: 'ztz100_x', kf51: 'kf51_x', leclerc: 'leclerc_x', sepv3: 'm1a2_sepv3_x', leo: 'leo2a7v_x',
  t90m: 't90m_x', ariete: 'ariete_c2_x', t14: 't14_x', k2: 'k2_x', type10: 'type10_x',
  t72b3m: 't72b3m_x', merkava: 'merkava4_x', type96b: 'type96b_x',
  lynx: 'kf41_lynx_x', cv90: 'cv90_mkiv_x', griffin: 'griffin50_x', kurganets: 'kurganets25_x',
  // owner 2026-10-02 ("use more tanks, we have a lot of really high quality tanks"): the rest of the source-backed fleet
  strv122: 'strv122_x', cv9040: 'cv90_x', cv90105: 'cv90105_tml_x', arieteC1: 'ariete_c1_x', aft10: 'aft10_x',
  warrior: 'fv510_milan_x', ajax: 'ajax_x', ares: 'ares_apc_x', sabra: 'sabra_mk2_x', merkava3d: 'merkava3d_x',
  obj695: 'object695_x', dragun: 'bmp3m_dragun125_x', leo2a6m: 'leo2a6m_x', leo2a5m: 'leo2a4m_x', leo2a5: 'leo2a5_x',
  leo2a6: 'leo2a6_x', t90a: 't90a_x', t90vladimir: 't90a_vladimir_x', t90sm: 't90sm_x', t90ms: 't90ms_x', t90: 't90_x',
  k21: 'k21_x', k1a1: 'k1a1_x', amx30: 'amx30_x', amx40: 'amx40_x', amx56: 'leclerc_classic_x', t62: 't62mv1_x',
  t72b: 't72b_1987_x', t80u: 't80u_x', t72b3: 't72b3_x', t72bu: 't72bu_x', chieftain10: 'chieftain_mk10_x',
  chieftain5: 'chieftain5_x', challenger1: 'challenger1_x', type90: 'type90_x', type89: 'type89_x', m1a2: 'm1a2_x',
  tusk: 'm1a2_tusk_x', sepv2: 'm1a2_sepv2_x', abramsUA: 'ua_m1a1_x', puma: 'spz_puma_s1_x', arieteC2: 'ariete_c2_x',
  // owner 2026-10-06 ("id like to see … as well!"): the rest of the list, each a hero of its own take
  burlak: 't90a_burlak_x', husarz: 'pl_t80u_modern', pl01: 'pl01_105', hetman2: 'ua_t72b3m_hetman_ii', leo2a6UA: 'leo2a6_ua',
  challenger2UA: 'ua_challenger2', challenger3: 'challenger_3', challenger2e: 'challenger2e', tos1a: 'tos1a_tagil', m551: 'm551a1_tts',
  m1a3: 'm1a3', vt4a1: 'vt4a1', type96_72m: 'type96_72m_lei',
  // the M6 Linebacker from the same list, in the fleet since the 2026-10-07 merge (it was not on 2026-10-06)
  m6: 'm6_linebacker',
};
/** Public names for callouts (from the fleet specs) and nations. */
export const CAST_NAMES = {
  ztz100_x: ['ZTZ-100', 'China'], kf51_x: ['KF51 Panther', 'Germany'], leclerc_x: ['Leclerc XLR', 'France'],
  m1a2_sepv3_x: ['M1A2 Abrams SEPv3', 'USA'], leo2a7v_x: ['Leopard 2A7V', 'Germany'], t90m_x: ['T-90M', 'Russia'],
  ariete_c2_x: ['C2 Ariete', 'Italy'], t14_x: ['T-14 Armata', 'Russia'], k2_x: ['K2 Black Panther', 'South Korea'],
  type10_x: ['Type 10', 'Japan'], t72b3m_x: ['T-72B3M', 'Russia'], merkava4_x: ['Merkava Mk 4', 'Israel'],
  type96b_x: ['Type 96B', 'China'], kf41_lynx_x: ['KF41 Lynx', 'Germany'], cv90_mkiv_x: ['CV90 Mk IV', 'Sweden'],
  griffin50_x: ['Griffin 50 mm', 'USA'], kurganets25_x: ['Kurganets-25', 'Russia'],
  strv122_x: ['Stridsvagn 122', 'Sweden'], cv90_x: ['CV9040C', 'Sweden'], cv90105_tml_x: ['CV90105', 'Sweden'], ariete_c1_x: ['C1 Ariete', 'Italy'],
  aft10_x: ['AFT-10', 'China'], fv510_milan_x: ['Warrior MILAN', 'UK'], ajax_x: ['Ajax', 'UK'], ares_apc_x: ['Ares', 'UK'], sabra_mk2_x: ['Sabra Mk 2', 'Israel'],
  merkava3d_x: ['Merkava Mk 3D', 'Israel'], object695_x: ['Object 695', 'Russia'], bmp3m_dragun125_x: ['BMP-3M Dragun', 'Russia'],
  leo2a6m_x: ['Leopard 2A6M', 'Germany'], leo2a4m_x: ['Leopard 2A5M', 'Germany'], leo2a5_x: ['Leopard 2A5', 'Germany'], leo2a6_x: ['Leopard 2A6', 'Germany'],
  t90a_x: ['T-90A', 'Russia'], t90a_vladimir_x: ['T-90A Vladimir', 'Russia'], t90sm_x: ['T-90SM', 'Russia'], t90ms_x: ['T-90MS Tagil', 'Russia'], t90_x: ['T-90', 'Russia'],
  k21_x: ['K21', 'South Korea'], k1a1_x: ['K1A1', 'South Korea'], amx30_x: ['AMX-30B', 'France'], amx40_x: ['AMX-40', 'France'], leclerc_classic_x: ['AMX 56 Leclerc', 'France'],
  t62mv1_x: ['T-62MV-1', 'Russia'], t72b_1987_x: ['T-72B', 'Russia'], t80u_x: ['T-80U', 'Russia'], t72b3_x: ['T-72B3', 'Russia'], t72bu_x: ['T-72BU', 'Russia'],
  chieftain_mk10_x: ['Chieftain Mk 10', 'UK'], chieftain5_x: ['Chieftain Mk 5', 'UK'], challenger1_x: ['Challenger 1', 'UK'], type90_x: ['Type 90', 'Japan'],
  type89_x: ['Type 89', 'Japan'], m1a2_x: ['M1A2 Abrams', 'USA'], m1a2_tusk_x: ['M1A2 Abrams TUSK', 'USA'], m1a2_sepv2_x: ['M1A2 Abrams SEPv2', 'USA'],
  ua_m1a1_x: ['M1A2 Abrams (Ukraine)', 'Ukraine'], spz_puma_s1_x: ['Puma S1', 'Germany'],
  m6_linebacker: ['M6 Linebacker', 'USA'], t90a_burlak_x: ['T-90A Burlak', 'Russia'], pl_t80u_modern: ['T-80U Husarz', 'Poland'], pl01_105: ['PL-01 105', 'Poland'],
  ua_t72b3m_hetman_ii: ['T-72B3M Hetman II', 'Ukraine'], leo2a6_ua: ['Leopard 2A6 UA', 'Ukraine'], ua_challenger2: ['Challenger 2 UA', 'Ukraine'],
  challenger_3: ['Challenger 3 Prototype', 'UK'], challenger2e: ['Challenger 2E', 'UK'], tos1a_tagil: ['TOS-1A Tagil', 'Russia'],
  m551a1_tts: ['M551A1 TTS', 'USA'], m1a3: ['M1A3 Abrams', 'USA'], vt4a1: ['VT-4A1', 'China'], type96_72m_lei: ['Type 96-72M Léi', 'China'],
};

const featureCache = new Map();
export function features(map) {
  if (!featureCache.has(map)) {
    const f = join(SHOTS, 'features', `features-${map}.json`);
    featureCache.set(map, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);
  }
  return featureCache.get(map);
}
/** A point `frac` (0..1) along road `idx` of `map`, heading along the road (reverse flips it),
 * offset `lat` metres to the driver's right. Returns { anchor, heading }. */
export function road(map, idx, frac, { reverse = false, lat = 0 } = {}) {
  const pts = features(map)?.roads?.[idx];
  if (!pts) throw Error(`no road ${idx} on ${map}`);
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
  let want = frac * total, i = 0;
  while (i < seg.length - 1 && want > seg[i]) { want -= seg[i]; i++; }
  const a = pts[i], b = pts[i + 1], u = seg[i] ? want / seg[i] : 0;
  let dx = b[0] - a[0], dz = b[1] - a[1]; if (reverse) { dx = -dx; dz = -dz; }
  const n = Math.hypot(dx, dz) || 1, f = [dx / n, dz / n], r = [-f[1], f[0]];
  const p = [a[0] + (b[0] - a[0]) * u + r[0] * lat, a[1] + (b[1] - a[1]) * u + r[1] * lat];
  return { anchor: [+p[0].toFixed(2), +p[1].toFixed(2)], heading: +(Math.atan2(f[0], f[1]) * 180 / Math.PI).toFixed(2) };
}
