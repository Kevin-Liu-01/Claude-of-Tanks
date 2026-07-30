// Soviet heavy / breakthrough family procedural profiles (fidelity oracles:
// recovered IS-3/IS-7/Object 279/IS-6B/KV-2 GLBs). Owned by the
// Soviet-heavy family agent.
import { SOVIET, WW2 } from './kit.js';

export const SOVIET_HEAVY_PROFILES = {
  is3: { ...SOVIET, width: 3.15, hullLength: 6.90, roofY: 1.42, trackW: 0.58, wheels: 6, turretWidth: 2.35, turretDepth: 2.55, turretHeight: 0.70, bustle: 0, pano: false, smoke: false, antennas: false, sleeve: false, evac: null },
  is7: { ...SOVIET, width: 3.40, hullLength: 7.38, roofY: 1.50, trackW: 0.62, wheels: 7, turretWidth: 2.48, turretDepth: 2.72, turretHeight: 0.72, bustle: 0, pano: false, smoke: false, antennas: false, sleeve: false, evac: null },
  object279: { ...SOVIET, width: 3.60, hullLength: 6.77, roofY: 1.42, trackW: 0.48, wheels: 6, turretWidth: 2.38, turretDepth: 2.60, turretHeight: 0.68, bustle: 0, pano: false, smoke: false, antennas: false, sleeve: false, evac: null },
  is6b: { ...SOVIET, width: 3.10, hullLength: 6.30, roofY: 1.44, trackW: 0.58, wheels: 6, turretWidth: 2.30, turretDepth: 2.52, turretHeight: 0.70, bustle: 0, pano: false, smoke: false, antennas: false, sleeve: false, evac: null },
  is3_bergman: { ...SOVIET, width: 3.15, hullLength: 6.90, roofY: 1.42, trackW: 0.58, wheels: 6, turretWidth: 2.35, turretDepth: 2.55, turretHeight: 0.70, bustle: 0, pano: false, smoke: false, antennas: false, sleeve: false, evac: null },
  kv2: { ...WW2, width: 3.32, hullLength: 6.75, roofY: 1.52, trackW: 0.58, wheels: 6, turret: 'ifv', turretWidth: 2.55, turretDepth: 2.35, turretHeight: 1.55, turretFront: 0.98, turretRear: -1.18, gunLength: 3.15, gunRadius: 0.09 },
};
