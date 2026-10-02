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
};
/** Public names for callouts (from the fleet specs) and nations. */
export const CAST_NAMES = {
  ztz100_x: ['ZTZ-100', 'China'], kf51_x: ['KF51 Panther', 'Germany'], leclerc_x: ['Leclerc XLR', 'France'],
  m1a2_sepv3_x: ['M1A2 Abrams SEPv3', 'USA'], leo2a7v_x: ['Leopard 2A7V', 'Germany'], t90m_x: ['T-90M', 'Russia'],
  ariete_c2_x: ['C2 Ariete', 'Italy'], t14_x: ['T-14 Armata', 'Russia'], k2_x: ['K2 Black Panther', 'South Korea'],
  type10_x: ['Type 10', 'Japan'], t72b3m_x: ['T-72B3M', 'Russia'], merkava4_x: ['Merkava Mk 4', 'Israel'],
  type96b_x: ['Type 96B', 'China'], kf41_lynx_x: ['KF41 Lynx', 'Germany'], cv90_mkiv_x: ['CV90 Mk IV', 'Sweden'],
  griffin50_x: ['Griffin 50 mm', 'USA'], kurganets25_x: ['Kurganets-25', 'Russia'],
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
