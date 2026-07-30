// Soviet/Russian modern family procedural profiles (fidelity oracles:
// t80u_javanilga, t90m_minehffd, recovered T-62/T-64/T-72/T-90 variants).
// Owned by the Russia-modern family agent.
import { KIT, SOVIET } from './kit.js';

function t72_1987Kit(P) {
  const { box } = KIT;
  // Kontakt-1 wedge arrays on glacis and turret circumference.
  for (let row = 0; row < 4; row++) for (let col = -3; col <= 3; col++)
    P.add('hullDetail', box(0.26, 0.10, 0.17), col * 0.34, 1.12 + row * 0.105, 3.02 - row * 0.20, -0.34, 0, 0);
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++)
    P.add('turretDetail', box(0.24, 0.12, 0.18), side * (0.36 + i * 0.22), 0.47, 0.65 - i * 0.11, 0, side * 0.13, side * 0.05);
}

function t72b3mKit(P) {
  const { box } = KIT;
  // Relikt side bags, Sosna-U housing and rear cage package.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) P.add('hull', box(0.13, 0.52, 0.63), side * 1.84, 0.70, 2.38 - i * 0.68);
    P.add('turretDetail', box(0.32, 0.42, 0.35), side * 0.72, 0.73, 0.45);
  }
  P.add('turretDark', box(0.23, 0.22, 0.04), -0.72, 0.75, 0.64);
}

function pt91mKit(P) {
  const { box, cylY } = KIT;
  for (const side of [-1, 1]) for (let i = 0; i < 7; i++)
    P.add('hull', box(0.12, 0.45, 0.66), side * 1.84, 0.72, 2.35 - i * 0.70);
  P.add('turretDetail', box(1.48, 0.42, 0.62), 0, 0.46, -1.38);
  P.add('turretDetail', cylY(0.16, 0.18, 0.12, 14), 0.53, 0.90, -0.24);
}

function t90smKit(P) {
  const { box, cylY } = KIT;
  // Export SM bustle and panoramic commander's sight.
  P.add('turret', box(1.62, 0.56, 0.92), 0, 0.42, -1.88);
  P.add('turretDetail', cylY(0.17, 0.20, 0.12, 14), 0.48, 0.98, -0.38);
  P.add('turretDetail', box(0.30, 0.30, 0.34), 0.48, 1.16, -0.38);
}

export const RUSSIA_PROFILES = {
  t90a: { ...SOVIET, width: 3.10, hullLength: 6.86, roofY: 1.42, trackW: 0.56, turretWidth: 2.18, turretDepth: 2.62, turretHeight: 0.67, bustle: 0.28, pano: true },
  pt91m: { base: 't72b3', kit: pt91mKit },
  t62mv1: { ...SOVIET, width: 3.30, hullLength: 6.63, roofY: 1.38, trackW: 0.55, wheels: 5, turretWidth: 2.18, turretDepth: 2.46, turretHeight: 0.64, bustle: 0 },
  t64bv1: { ...SOVIET, width: 3.35, hullLength: 6.54, roofY: 1.38, trackW: 0.56, turretWidth: 2.20, turretDepth: 2.52, turretHeight: 0.62, bustle: 0 },
  t72b_1987: { base: 't72b3', kit: t72_1987Kit },
  t72b3m: { base: 't72b3', kit: t72b3mKit },
  t72bu: { ...SOVIET, width: 3.25, hullLength: 6.86, roofY: 1.40, trackW: 0.56, turretWidth: 2.18, turretDepth: 2.56, turretHeight: 0.65, bustle: 0.35 },
  t90sm: { base: 't90m', kit: t90smKit },
  t90a_vladimir: { ...SOVIET, width: 3.10, hullLength: 6.86, roofY: 1.42, trackW: 0.56, turretWidth: 2.20, turretDepth: 2.62, turretHeight: 0.68, bustle: 0.26, pano: true },
};
