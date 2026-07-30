// WWII / inter-war community procedural profiles (fidelity oracles:
// recovered/community Tiger, Panzer III, T-34, Sherman Jumbo, Tiger II,
// Quaternius heavy, Leichttraktor GLBs). Owned by the WWII family agent.
import { WW2 } from './kit.js';

export const WW2_PROFILES = {
  t34_85_cad: { ...WW2, width: 3.00, hullLength: 6.10, roofY: 1.50, trackW: 0.50, wheels: 5, turretWidth: 2.08, turretDepth: 2.28, turretHeight: 0.72, gunLength: 4.15, gunRadius: 0.06 },
  newc_tiger: { ...WW2, width: 3.70, hullLength: 6.32, roofY: 1.62, trackW: 0.72, wheels: 8, turret: 'western', turretWidth: 2.65, turretDepth: 2.65, turretHeight: 0.72, turretFront: 0.88, turretRear: -1.45, gunLength: 4.65, gunRadius: 0.065 },
  newc_pziii: { ...WW2, width: 2.95, hullLength: 5.56, roofY: 1.42, trackW: 0.45, wheels: 6, turret: 'western', turretWidth: 1.92, turretDepth: 1.95, turretHeight: 0.62, turretFront: 0.75, turretRear: -0.95, gunLength: 2.65, gunRadius: 0.042 },
  pziii_konserwa: { ...WW2, width: 2.95, hullLength: 5.56, roofY: 1.42, trackW: 0.45, wheels: 6, turret: 'western', turretWidth: 1.92, turretDepth: 1.95, turretHeight: 0.62, turretFront: 0.75, turretRear: -0.95, gunLength: 2.65, gunRadius: 0.042 },
  leichttraktor: { ...WW2, width: 2.26, hullLength: 4.21, roofY: 1.25, trackW: 0.35, wheels: 4, turret: 'western', turretWidth: 1.45, turretDepth: 1.48, turretHeight: 0.52, turretFront: 0.58, turretRear: -0.72, gunLength: 1.55, gunRadius: 0.035 },
  q_heavy: { ...WW2, width: 3.55, hullLength: 7.20, roofY: 1.64, trackW: 0.62, wheels: 7, turret: 'western', turretWidth: 2.58, turretDepth: 2.85, turretHeight: 0.78, turretFront: 0.95, turretRear: -1.58, gunLength: 4.8, gunRadius: 0.075 },
  tiger2: { ...WW2, width: 3.75, hullLength: 7.38, roofY: 1.58, trackW: 0.72, wheels: 9, turret: 'western', turretWidth: 2.62, turretDepth: 3.05, turretHeight: 0.75, turretFront: 1.05, turretRear: -1.68, gunLength: 5.45, gunRadius: 0.07 },
  sherman_jumbo: { ...WW2, width: 2.99, hullLength: 5.84, roofY: 1.73, trackW: 0.48, wheels: 6, turretWidth: 2.10, turretDepth: 2.25, turretHeight: 0.80, gunLength: 3.35, gunRadius: 0.055 },
};
