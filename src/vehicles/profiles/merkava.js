// Merkava family procedural profiles (fidelity oracles: merkava4_arlassar
// plus recovered merkava1b..merkava4b marks). Owned by the Merkava agent.
import { KIT, MERKAVA } from './kit.js';

function merkava4bKit(P) {
  const { smokeCluster, pintleMG } = KIT;
  // Mk.4B without Trophy: preserve the accurate Mk.4 armor casting but
  // keep the roof cleaner and add the twin hatch/MG fit.
  pintleMG(P, -0.58, 1.12, -0.52, true);
  smokeCluster(P, 1.10, 0.55, -0.18, 6, 1.15, 0.55);
  smokeCluster(P, -1.10, 0.55, -0.18, 6, -1.15, 0.55);
}

export const MERKAVA_PROFILES = {
  // Merkava generations: narrower early castings, progressively larger
  // modular wedges, all with front-engine hulls and six-wheel suspensions.
  merkava1b: { ...MERKAVA, width: 3.70, hullLength: 7.45, roofY: 1.58, trackW: 0.58, turretWidth: 2.38, turretDepth: 3.16, turretHeight: 0.68, turretFront: 1.06, turretRear: -1.92, pano: false, gunLength: 4.85 },
  merkava2b: { ...MERKAVA, width: 3.70, hullLength: 7.45, roofY: 1.59, trackW: 0.58, turretWidth: 2.46, turretDepth: 3.28, turretHeight: 0.70, turretFront: 1.08, turretRear: -2.02, pano: false, gunLength: 4.85 },
  merkava2d: { ...MERKAVA, width: 3.70, hullLength: 7.45, roofY: 1.60, trackW: 0.58, turretWidth: 2.62, turretDepth: 3.42, turretHeight: 0.80, turretFront: 1.14, turretRear: -2.12, pano: false, gunLength: 4.85 },
  merkava3b: { ...MERKAVA, width: 3.72, hullLength: 7.60, roofY: 1.62, trackW: 0.59, turretWidth: 2.70, turretDepth: 3.52, turretHeight: 0.82, turretFront: 1.18, turretRear: -2.18, gunLength: 5.25 },
  merkava3c: { ...MERKAVA, width: 3.72, hullLength: 7.60, roofY: 1.62, trackW: 0.59, turretWidth: 2.74, turretDepth: 3.56, turretHeight: 0.83, turretFront: 1.18, turretRear: -2.22, gunLength: 5.25 },
  merkava3d: { ...MERKAVA, width: 3.72, hullLength: 7.60, roofY: 1.63, trackW: 0.60, turretWidth: 2.86, turretDepth: 3.68, turretHeight: 0.86, turretFront: 1.22, turretRear: -2.30, gunLength: 5.30 },
  merkava4b: { base: 'merkava4', kit: merkava4bKit },
};
