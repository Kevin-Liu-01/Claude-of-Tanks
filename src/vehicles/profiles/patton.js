// US Patton/Pershing lineage procedural profiles (fidelity oracles:
// recovered M26/M45/M46/M47/M60 GLBs). Owned by the Patton family agent.
import { CLASSIC } from './kit.js';

export const PATTON_PROFILES = {
  m60a1: {
    ...CLASSIC, width: 3.63, hullLength: 6.95, roofY: 1.48, trackTop: 0.82, trackW: 0.55,
    turretPivotY: 1.46, turretPivotZ: -0.16, turretWidth: 2.62, turretDepth: 3.35, turretHeight: 0.78,
    turretFront: 1.05, turretRear: -2.02, pano: false, gunY: 0.38, gunLength: 5.25, gunRadius: 0.066,
    mantletWidth: 0.56, mantletHeight: 0.48, cupolaR: 0.25, cupolaH: 0.38, commanderZ: -0.42,
  },
  m46_patton: {
    ...CLASSIC, width: 3.51, hullLength: 6.33, roofY: 1.50, trackTop: 0.84, trackW: 0.55, wheels: 6,
    turretPivotY: 1.49, turretPivotZ: -0.12, turretWidth: 2.64, turretDepth: 3.24, turretHeight: 0.76,
    turretFront: 1.02, turretRear: -1.98, pano: false, gunY: 0.37, gunLength: 4.55,
  },
  m47_patton: {
    ...CLASSIC, width: 3.51, hullLength: 6.33, roofY: 1.51, trackTop: 0.84, trackW: 0.55, wheels: 6,
    turretPivotY: 1.50, turretPivotZ: -0.12, turretWidth: 2.72, turretDepth: 3.42, turretHeight: 0.80,
    turretFront: 1.06, turretRear: -2.12, pano: false, gunY: 0.39, gunLength: 4.70,
  },
  m26_pershing: {
    ...CLASSIC, width: 3.51, hullLength: 6.33, roofY: 1.48, trackTop: 0.82, trackW: 0.54, wheels: 6,
    turretPivotY: 1.47, turretPivotZ: -0.10, turretWidth: 2.58, turretDepth: 3.18, turretHeight: 0.74,
    turretFront: 1.00, turretRear: -1.94, pano: false, gunY: 0.36, gunLength: 4.65,
  },
  m45_patton: {
    ...CLASSIC, width: 3.51, hullLength: 6.33, roofY: 1.48, trackTop: 0.82, trackW: 0.54, wheels: 6,
    turretPivotY: 1.47, turretPivotZ: -0.10, turretWidth: 2.60, turretDepth: 3.20, turretHeight: 0.76,
    turretFront: 1.02, turretRear: -1.96, pano: false, gunY: 0.37, gunLength: 3.85, gunRadius: 0.075,
  },
  m60a3: {
    ...CLASSIC, width: 3.63, hullLength: 6.95, roofY: 1.48, trackTop: 0.82, trackW: 0.55, wheels: 6,
    turretPivotY: 1.46, turretPivotZ: -0.16, turretWidth: 2.64, turretDepth: 3.38, turretHeight: 0.79,
    turretFront: 1.05, turretRear: -2.04, pano: true, gunY: 0.39, gunLength: 5.25,
    cupolaR: 0.25, cupolaH: 0.38, commanderZ: -0.42,
  },
};
