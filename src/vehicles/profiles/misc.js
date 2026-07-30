// Remaining sourced-variant procedural profiles that have no family group
// yet: Japanese Type 90 and the Mophs recon tank. Owned by the misc agent.
import { WESTERN } from './kit.js';

export const MISC_PROFILES = {
  recon_tank: {
    hull: 'ifv', width: 2.22, hullLength: 5.25, roofY: 1.70, trackTop: 0.66, trackW: 0.34, wheels: 5, skirts: true,
    turret: 'ifv', turretWidth: 1.42, turretDepth: 1.55, turretHeight: 0.50, turretFront: 0.62, turretRear: -0.78, gunLength: 2.25, gunRadius: 0.035, sleeve: false, evac: null, pano: false, mg: false, smoke: false,
  },
  type90: {
    ...WESTERN, hull: 'type90', width: 3.43, hullLength: 7.45, roofY: 1.43, trackTop: 0.76,
    trackW: 0.56, wheels: 6, wheelR: 0.37, wheelY: 0.46, wheelSpan: 5.55, frontSprocket: false,
    skirts: true, skirtPanels: 6, skirtHeight: 0.33, skirtY: 0.86, skirtLength: 6.30,
    turret: 'type90', turretWidth: 2.72, turretDepth: 3.62, turretHeight: 0.68, turretFront: 1.13, turretRear: -2.16,
    turretPivotY: 1.42, turretPivotZ: -0.18, gunY: 0.33, pano: false, gunLength: 5.30, gunRadius: 0.079,
    mantletWidth: 0.50, mantletHeight: 0.38, antennaHeight: 0.82, smokeCount: 4,
  },
};
