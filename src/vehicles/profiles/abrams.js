// Abrams family procedural profiles (fidelity oracle: m1a2_sepv3_dannzjs,
// m1a2_tejas, m1a1/tusk dannzjs variants, recovered m1a2_sepv2, abramsx).
// Owned by the Abrams family agent — no other module registers these ids.
import { KIT, ABRAMS } from './kit.js';

function buildAbramsVariant(P, p) {
  // Preserve the project's most detailed native procedural tank: welded
  // cheeks, long bustle, blow-off panels, CITV/GPS/CROWS, turbine grilles,
  // seven-panel skirts and the correctly stepped M256. Variant hardware is
  // additive and remains merged into those same material buckets.
  KIT.buildM1A2(P);
  const { box, cylY } = KIT;

  if (p.abramsKit === 'tusk') {
    // ARAT-1/2 side tiles in two staggered courses plus the rear slat cage.
    for (const side of [-1, 1]) for (let i = 0; i < 8; i++) for (let row = 0; row < 2; row++) {
      const z = 3.25 - i * 0.86 + (row ? 0.10 : 0);
      P.add('hull', box(0.12, 0.22, 0.70), side * 1.98, 0.78 + row * 0.23, z, 0, 0, side * (row ? 0.04 : -0.04));
      P.add('hullDark', box(0.018, 0.18, 0.62), side * 2.045, 0.78 + row * 0.23, z);
    }
    for (const side of [-1, 1]) {
      P.add('hullDetail', box(0.04, 0.05, 1.35), side * 2.06, 1.16, -3.05);
      P.add('hullDetail', box(0.04, 0.05, 1.35), side * 2.06, 0.60, -3.05);
      for (let i = 0; i < 9; i++) P.add('hullDark', box(0.025, 0.52, 0.025), side * 2.06, 0.88, -2.48 - i * 0.14);
    }
    P.add('turretDetail', box(0.30, 0.32, 0.38), -0.52, 1.27, -0.20); // loader shield
  } else if (p.abramsKit === 'sepv2') {
    // Raised CROWS station and rear bustle electronics/APU boxes.
    P.add('turretDetail', cylY(0.18, 0.20, 0.10, 14), 0.48, 1.50, -0.55);
    P.add('turretDetail', box(0.34, 0.30, 0.36), 0.48, 1.69, -0.55);
    P.add('turretDark', box(0.21, 0.12, 0.04), 0.48, 1.68, -0.35);
    P.add('turret', box(0.52, 0.34, 0.58), 1.35, 0.38, -2.50);
  } else if (p.abramsKit === 'aim') {
    P.add('turretDetail', box(0.38, 0.22, 0.44), -0.88, 1.08, 0.22); // upgraded thermal housing
    P.add('turretDark', box(0.29, 0.12, 0.035), -0.88, 1.08, 0.46);
  }
}

const A = { ...ABRAMS, build: buildAbramsVariant };

export const ABRAMS_PROFILES = {
  m1a2: { ...A, width: 2.98, turretHeight: 0.74, pano: true },
  m1a1: { ...A, width: 2.92, turretHeight: 0.70, pano: false },
  m1a2_tusk: { ...A, width: 3.90, hullLength: 7.70, turretWidth: 2.76, turretHeight: 0.80, skirtPanels: 8, gunLength: 4.65, abramsKit: 'tusk' },
  m1a2_tejas: { ...A, width: 2.92, turretHeight: 0.72, pano: true },
  abramsx: { ...A, width: 3.05, turretWidth: 2.30, turretDepth: 3.15, turretHeight: 0.62, turretRear: -1.72, pano: true },
  m1a1ha: { ...A, width: 2.90, turretWidth: 2.48, turretDepth: 3.42, turretHeight: 0.72, pano: false },
  m1a2_sepv2: { ...A, width: 3.18, hullLength: 7.05, turretWidth: 2.62, turretDepth: 3.52, turretHeight: 0.78, turretRear: -2.00, pano: true, gunLength: 3.55, abramsKit: 'sepv2' },
  m1a1_aim: { ...A, width: 3.55, hullLength: 7.65, trackW: 0.62, turretWidth: 2.72, turretDepth: 3.55, turretHeight: 0.74, turretRear: -2.02, pano: false, gunLength: 6.15, abramsKit: 'aim' },
};
