// Boot-light combat record for the independent VT-4A1 procedural build.
// The owner-supplied GLB is a local measurement oracle only; no runtime model
// or source payload participates in this tank.

import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { shell, apfsdsPenetration, modernArmor } from './specHelpers.ts';
import { createType99Armor } from './profiles/type99Armor.ts';
import { bindFleetRegistries, registerFleetSpecs } from './fleetSpecRegistry.ts';
import type { FleetTankSpec } from './specContracts.ts';

const p = apfsdsPenetration(720);

const CHINESE_FRONTLINE_SPECS = {
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
  // Type 100 (owner 2026-09-15): the PLA's paraded next-generation medium tank — 105 mm
  // autoloaded gun, unmanned-style low turret with a commander's sensor mast and twin quad
  // launcher pods, Puma-class angular hull. First-party build (profiles/type100.ts).
  type100: {
    id: 'type100', name: 'Type 100', nation: 'China', era: 'next-generation', role: 'mbt',
    hp: 2500,
    enginePowerHp: 1200, weightTons: 40, topSpeedKmh: 75, reverseSpeedKmh: 30,
    hullTraverseDegS: 50,
    terrainResistance: { hard: 0.66, medium: 0.76, soft: 1.30 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 52, gunPitchDegS: 40, gunElevationDeg: 16, gunDepressionDeg: 8,
    gun: {
      caliberMm: 105, reloadS: 5.0, baseAccuracy: 0.25, aimTimeS: 1.5,
      bloom: { move: 0.045, hullRot: 0.065, turret: 0.045, afterShot: 1.8 },
      shells: [
        shell('DTW-105 APFSDS', 'APFSDS', 105, 840, 780, 430, 1600, { pen2000Mm: 680 }),
        shell('DTP-105 HEAT-MP', 'HEAT', 105, 470, 470, 420, 1150),
        shell('DTB-105 HE', 'HE', 105, 42, 42, 500, 760),
      ],
    },
    dims: { hullLengthM: 6.95, overallLengthM: 9.05, widthM: 3.66, heightM: 2.58, silhouetteHeightM: 3.78 },
    armor: modernArmor({
      hl: 3.48, hw: 1.66, inW: 1.15, floor: 0.38, trkTop: 1.20, roofY: 1.80,
      turretPivot: [0, 1.80, -0.40], gunPivot: [0, 0.42, 0.95],
      barrelLenM: 4.95, barrelRadM: 0.078,
      glacis: [90, 520, 720], lower: [70, 340, 460], side: [55, 240, 360],
      skirt: [35, 110, 240], rear: 40, roof: 38,
      tw: 1.40, tFrontZ: 1.70, tRearZ: -1.85, tH: 0.78,
      cheek: [150, 600, 820], tSide: [85, 300, 400], tRear: 55, tRoof: 40,
      mantlet: [170, 560, 740], loader: false, bustleAmmo: true,
    }),
    visual: {
      scheme: 'digital', base: '#b39a6c', weather: '#c2ab7c',
      patches: ['#7f8f5c', '#e3d6ab', '#5d6c48'],
      marking: 'number', number: '1262', trackWidthM: 0.58, camoScale: 0.40,
    },
  },
} satisfies Readonly<Record<string, FleetTankSpec>>;

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
registerFleetSpecs(registries, Object.keys(CHINESE_FRONTLINE_SPECS), CHINESE_FRONTLINE_SPECS);
