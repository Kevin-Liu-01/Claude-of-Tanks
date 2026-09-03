// Boot-light combat record for the independent VT-4A1 procedural build.
// The owner-supplied GLB is a local measurement oracle only; no runtime model
// or source payload participates in this tank.

import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { shell, apfsdsPenetration } from './specHelpers.ts';
import { createType99Armor } from './profiles/type99Armor.ts';
import { bindFleetRegistries, registerFleetSpecs } from './fleetSpecRegistry.ts';
import type { FleetTankSpec } from './specContracts.ts';

const p = apfsdsPenetration(720);

export const CHINESE_FRONTLINE_SPECS = {
  vt4a1: {
    id: 'vt4a1', name: 'VT-4A1', nation: 'China', era: 'modern', role: 'mbt',
    hp: 2650,
    enginePowerHp: 1300, weightTons: 52, topSpeedKmh: 70, reverseSpeedKmh: 18,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.70, medium: 0.80, soft: 1.45 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 31, gunElevationDeg: 14, gunDepressionDeg: 7,
    gun: {
      caliberMm: 125, reloadS: 6.4, baseAccuracy: 0.29, aimTimeS: 1.85,
      bloom: { move: 0.055, hullRot: 0.075, turret: 0.055, afterShot: 2.1 },
      shells: [
        shell('BTA4 APFSDS', 'APFSDS', 125, p[0], p[1], 550, 1780, { pen2000Mm: p[2] }),
        shell('BK-125 HEAT-MP', 'HEAT', 125, 700, 700, 490, 980),
        shell('DTB-125 HE', 'HE', 125, 55, 55, 600, 900),
      ],
    },
    // The VT-4A1 now uses the ZTZ-99A2 chassis as an exact shared build. Its
    // gameplay dimensions and collision body intentionally match that tank;
    // only the same-envelope turret shell and its equipment are independent.
    dims: {
      hullLengthM: 7.6, overallLengthM: 11.0, widthM: 3.7, heightM: 2.45,
      silhouetteHullLengthM: 8.18, silhouetteOverallLengthM: 11.60,
      // Slightly taller 0.82-scale turret and re-seated roof equipment P95 datum.
      silhouetteHeightM: 2.97,
    },
    armor: createType99Armor('vt4a1'),
    visual: {
      scheme: 'digital', base: '#4b563a', weather: '#59644b',
      patches: ['#6f6b4b', '#313b2b', '#242820'],
      marking: 'number', number: '401', trackWidthM: 0.63, camoScale: 0.46,
    },
  },
} satisfies Readonly<Record<string, FleetTankSpec>>;

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
registerFleetSpecs(registries, Object.keys(CHINESE_FRONTLINE_SPECS), CHINESE_FRONTLINE_SPECS);
