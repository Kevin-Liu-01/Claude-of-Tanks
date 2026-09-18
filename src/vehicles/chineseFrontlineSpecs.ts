// Boot-light combat record for the independent VT-4A1 procedural build.
// The owner-supplied GLB is a local measurement oracle only; no runtime model
// or source payload participates in this tank.

import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { shell, apfsdsPenetration, modernArmor, crewBox as cbox } from './specHelpers.ts';
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
  // Type 100 IFV (owner 2026-09-17: "make the type 100 into a new chinese ifv and make its turret smaller and
  // less long"): the PLA's paraded next-generation tracked support vehicle — 30 mm autocannon and HJ-10 missiles
  // in a compact unmanned turret with a commander's sensor mast, Puma-class angular hull with the IFV prow.
  // First-party build (profiles/type100.ts).
  type100: {
    id: 'type100', name: 'Type 100 IFV', nation: 'China', era: 'next-generation', role: 'ifv',
    hp: 2700,
    enginePowerHp: 1100, weightTons: 38, topSpeedKmh: 76, reverseSpeedKmh: 32,
    hullTraverseDegS: 54,
    terrainResistance: { hard: 0.64, medium: 0.74, soft: 1.24 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 70, gunPitchDegS: 54, gunElevationDeg: 45, gunDepressionDeg: 10,
    gun: {
      caliberMm: 30, reloadS: 0.40, baseAccuracy: 0.24, aimTimeS: 1.0,
      muzzleBoreSegments: 14,
      soundProfile: 'mk30-2',
      bloom: { move: 0.036, hullRot: 0.050, turret: 0.034, afterShot: 1.30 },
      shells: [
        shell('DTW-30 APFSDS-T', 'APFSDS', 30, 235, 215, 92, 1400, { pen2000Mm: 195, reloadS: 0.40, count: 220 }),
        shell('HJ-10 ATGM', 'HEAT', 170, 1100, 1100, 700, 190,
          { reloadS: 2.2, count: 8, guided: true, soundProfile: 'spike-launch' }),
        shell('DTB-30 ABM', 'HE', 30, 14, 14, 105, 1100, { reloadS: 0.40, count: 220 }),
      ],
    },
    dims: { hullLengthM: 7.05, overallLengthM: 7.05, widthM: 3.66, heightM: 2.40, silhouetteHeightM: 3.65 },
    armor: (() => {
      const a = modernArmor({
        hl: 3.53, hw: 1.83, inW: 1.15, floor: 0.38, trkTop: 1.24, roofY: 1.80,
        turretPivot: [0, 1.80, -0.95], gunPivot: [0, 0.30, 1.30],
        barrelLenM: 2.85, barrelRadM: 0.045,
        glacis: [80, 300, 420], lower: [60, 220, 290], side: [50, 150, 210],
        skirt: [70, 250, 460], rear: 40, roof: 46,
        tw: 1.10, tFrontZ: 1.75, tRearZ: -2.05, tH: 0.62,
        cheek: [110, 280, 370], tSide: [75, 175, 255], tRear: 50, tRoof: 44,
        mantlet: [120, 290, 380], loader: false,
      });
      // Unmanned combat module: the three operating stations stay below the hull roof, clear of the turret.
      a.crew = [
        cbox('driver', [0.30, 0.56, 1.10], [1.00, 1.72, 2.20]),
        cbox('gunner', [-0.20, 0.56, -0.50], [0.58, 1.70, 0.60]),
        cbox('commander', [-1.00, 0.56, -0.50], [-0.20, 1.70, 0.60]),
      ];
      return a;
    })(),
    visual: {
      scheme: 'digital', base: '#59654a', weather: '#65704f',
      patches: ['#8a9370', '#3a452f', '#7f8477'],
      marking: 'number', number: 'LZ83', trackWidthM: 0.58, camoScale: 0.34,
    },
  },
  // ZTZ-100 (owner 2026-09-17): the PLA's next-generation main battle tank, generated from the owner's supplied
  // "[OD]ZTZ-20 Test-3" reference model (a local comparison oracle only, see
  // docs/references/tanks/ztz100_x.source-measurements.json). Seven road wheels, a 105 mm autoloaded gun in a
  // faceted unmanned turret with two sensor towers, a rear weapon station, a right-cheek missile bank and a stern
  // slat cage. First-party procedural build (profiles/ztz100X.ts).
  ztz100_x: {
    id: 'ztz100_x', name: 'ZTZ-100', nation: 'China', era: 'next-generation', role: 'mbt',
    hp: 2600,
    enginePowerHp: 1200, weightTons: 42, topSpeedKmh: 72, reverseSpeedKmh: 30,
    hullTraverseDegS: 48,
    terrainResistance: { hard: 0.66, medium: 0.76, soft: 1.30 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 50, gunPitchDegS: 40, gunElevationDeg: 15, gunDepressionDeg: 8,
    gun: {
      caliberMm: 105, reloadS: 4.8, baseAccuracy: 0.24, aimTimeS: 1.5,
      bloom: { move: 0.045, hullRot: 0.065, turret: 0.045, afterShot: 1.8 },
      shells: [
        shell('DTW-105 APFSDS', 'APFSDS', 105, 840, 780, 430, 1600, { pen2000Mm: 680 }),
        shell('DTP-105 HEAT-MP', 'HEAT', 105, 470, 470, 420, 1150),
        shell('DTB-105 HE', 'HE', 105, 42, 42, 500, 760),
      ],
    },
    dims: { hullLengthM: 6.94, overallLengthM: 8.98, widthM: 3.70, heightM: 2.31, silhouetteHeightM: 3.04 },
    armor: modernArmor({
      hl: 3.47, hw: 1.85, inW: 1.15, floor: 0.35, trkTop: 1.05, roofY: 1.41,
      turretPivot: [0, 1.41, -0.55], gunPivot: [0, 0.35, 1.10],
      barrelLenM: 4.625, barrelRadM: 0.072,
      glacis: [90, 540, 740], lower: [70, 340, 460], side: [55, 240, 360],
      skirt: [35, 110, 240], rear: 40, roof: 38,
      tw: 1.20, tFrontZ: 1.68, tRearZ: -2.05, tH: 0.90,
      cheek: [150, 620, 840], tSide: [85, 300, 400], tRear: 55, tRoof: 40,
      mantlet: [170, 560, 740], loader: false, bustleAmmo: true,
    }),
    visual: {
      scheme: 'digital', base: '#5b6a4d', weather: '#66714f',
      patches: ['#8f9a72', '#3b4830', '#7d8378'],
      marking: 'number', number: '100', trackWidthM: 0.515, camoScale: 0.34,
    },
  },
} satisfies Readonly<Record<string, FleetTankSpec>>;

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
registerFleetSpecs(registries, Object.keys(CHINESE_FRONTLINE_SPECS), CHINESE_FRONTLINE_SPECS);
