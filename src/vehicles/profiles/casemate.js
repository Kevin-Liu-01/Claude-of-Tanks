// Casemate / turretless procedural profiles (fidelity oracles: recovered
// ISU-152/122S, community Jagdtiger, JPz E100, Sturmtiger, T95, Strv 103).
// Owned by the casemate family agent.
import { CASEMATE } from './kit.js';

export const CASEMATE_PROFILES = {
  strv103: { ...CASEMATE, width: 3.18, hullLength: 7.04, roofY: 1.55, trackW: 0.55, wheels: 4, skirts: true, casemateWidth: 2.65, casemateHeight: 0.72, casemateDepth: 3.9, gunLength: 4.1, gunRadius: 0.065 },
  jagdtiger: { ...CASEMATE, width: 3.75, hullLength: 7.30, roofY: 2.38, trackW: 0.72, wheels: 9, casemateWidth: 3.05, casemateHeight: 1.25, casemateDepth: 4.40, gunLength: 5.6, gunRadius: 0.082 },
  jpz_e100: { ...CASEMATE, width: 4.05, hullLength: 8.60, roofY: 2.48, trackW: 0.78, wheels: 8, casemateWidth: 3.20, casemateHeight: 1.30, casemateDepth: 4.20, gunLength: 6.1, gunRadius: 0.10 },
  sturmtiger: { ...CASEMATE, width: 3.70, hullLength: 6.28, roofY: 2.32, trackW: 0.70, wheels: 8, casemateWidth: 2.95, casemateHeight: 1.35, casemateDepth: 3.60, gunLength: 1.05, gunRadius: 0.19, mantletWidth: 0.72, mantletHeight: 0.72 },
  t95: { ...CASEMATE, width: 4.55, hullLength: 7.24, roofY: 1.78, trackW: 0.78, wheels: 8, casemateWidth: 2.82, casemateHeight: 0.76, casemateDepth: 3.85, gunLength: 5.35, gunRadius: 0.078 },
  isu152: { ...CASEMATE, width: 3.07, hullLength: 6.80, roofY: 2.05, trackW: 0.55, wheels: 6, casemateWidth: 2.55, casemateHeight: 1.08, casemateDepth: 3.70, gunLength: 3.25, gunRadius: 0.09 },
  isu122s: { ...CASEMATE, width: 3.07, hullLength: 6.80, roofY: 2.05, trackW: 0.55, wheels: 6, casemateWidth: 2.55, casemateHeight: 1.08, casemateDepth: 3.70, gunLength: 4.75, gunRadius: 0.072 },
};
