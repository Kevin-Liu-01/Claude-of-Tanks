// M551 Sheridan registration. The owner-supplied GLB is a local comparison
// oracle only; the playable vehicle is the original procedural construction
// in profiles/sheridan.js.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';
import {
  plate,
  frontPlate,
  rearPlate,
  rightSidePlate,
  leftSidePlate,
  roofPlate,
  rightCheekPlate,
  leftCheekPlate,
  moduleBox,
  crewBox,
  shell,
} from './specHelpers.ts';

const ERA = Object.freeze({ keReduction: 0.18, ceFlatMm: 360 });
const eraOptions = { kind: 'era', era: ERA, keMm: 15, ceMm: 15 };

const armor = {
  boundingRadiusM: 4.75,
  turretPivot: [0, 1.466, 0],
  // Source-oracle measurement: the visible trunnion/tube starts at vehicle
  // Z=1.10 m and terminates at Z=3.19 m on a 1.906 m centerline.
  gunPivot: [0, 0.44, 1.10],
  gunBarrel: { lengthM: 2.09, radiusM: 0.115 },
  hullPlates: [
    frontPlate('sheridan_glacis_era', 15, 1.10, 0.87, 2.91, 1.30, 1.38, eraOptions),
    rightSidePlate('sheridan_skirt_era_R', 15, 1.43, 0.63, 1.43, 1.05, -2.25, 2.42, eraOptions),
    leftSidePlate('sheridan_skirt_era_L', 15, 1.43, 0.63, 1.43, 1.05, -2.25, 2.42, eraOptions),
    frontPlate('upper_glacis', 38, 1.31, 0.76, 3.05, 1.27, 1.28, { keMm: 74, ceMm: 92 }),
    frontPlate('lower_front', 30, 1.27, 0.31, 2.88, 0.76, 3.05, { keMm: 48, ceMm: 55 }),
    rightSidePlate('hull_side_upper_R', 28, 1.31, 0.80, 1.24, 1.27, -2.98, 1.34, { keMm: 40, ceMm: 46 }),
    leftSidePlate('hull_side_upper_L', 28, 1.31, 0.80, 1.24, 1.27, -2.98, 1.34, { keMm: 40, ceMm: 46 }),
    rightSidePlate('hull_side_lower_R', 25, 1.02, 0.25, 1.02, 0.82, -2.98, 2.88, { keMm: 32, ceMm: 36 }),
    leftSidePlate('hull_side_lower_L', 25, 1.02, 0.25, 1.02, 0.82, -2.98, 2.88, { keMm: 32, ceMm: 36 }),
    rightSidePlate('track_R', 20, 1.42, 0.08, 1.42, 1.00, -2.95, 2.95,
      { kind: 'external', moduleLink: 'trackR' }),
    leftSidePlate('track_L', 20, 1.42, 0.08, 1.42, 1.00, -2.95, 2.95,
      { kind: 'external', moduleLink: 'trackL' }),
    rearPlate('hull_rear', 25, 1.24, 0.31, -3.02, 1.20, -3.04, { keMm: 30, ceMm: 34 }),
    roofPlate('hull_roof', 20, 1.24, 1.27, -2.98, 1.28, { keMm: 26, ceMm: 30 }),
  ],
  turretPlates: [
    rightCheekPlate('sheridan_turret_era_R', 15, 0.18, 1.15, 1.18, 0.40,
      0.12, 0.70, 0.10, 0.12, eraOptions),
    leftCheekPlate('sheridan_turret_era_L', 15, 0.18, 1.15, 1.18, 0.40,
      0.12, 0.70, 0.10, 0.12, eraOptions),
    rightCheekPlate('turret_cheek_R', 38, 0.16, 1.23, 1.20, 0.36,
      0.02, 0.78, 0.11, 0.10, { keMm: 70, ceMm: 82 }),
    leftCheekPlate('turret_cheek_L', 38, 0.16, 1.23, 1.20, 0.36,
      0.02, 0.78, 0.11, 0.10, { keMm: 70, ceMm: 82 }),
    plate('mantlet', 70,
      [-0.34, 0.10, 1.28], [0.34, 0.10, 1.28], [-0.34, 0.64, 1.22],
      { keMm: 92, ceMm: 110, gunFollow: true }),
    rightSidePlate('turret_side_R', 32, 1.18, 0.08, 0.95, 0.78, -1.16, 0.42, { keMm: 48, ceMm: 56 }),
    leftSidePlate('turret_side_L', 32, 1.18, 0.08, 0.95, 0.78, -1.16, 0.42, { keMm: 48, ceMm: 56 }),
    rearPlate('turret_rear', 25, 0.92, 0.08, -1.16, 0.68, -1.22, { keMm: 32, ceMm: 38 }),
    roofPlate('turret_roof', 20, 0.92, 0.80, -0.88, 0.44, { keMm: 24, ceMm: 28 }),
  ],
  modules: [
    moduleBox('engine', [-1.00, 0.30, -2.90], [1.00, 1.16, -1.35]),
    moduleBox('fuelTank', [-0.95, 0.28, -1.30], [0.95, 0.85, -0.56]),
    moduleBox('ammoRack', [-0.90, 0.30, -0.45], [0.90, 0.92, 0.38]),
    moduleBox('missileRack', [-0.92, 0.22, -1.05], [0.92, 0.72, -0.20], true),
    moduleBox('turretRing', [-1.03, 1.08, -0.78], [1.03, 1.29, 1.12]),
    moduleBox('radio', [-0.88, 0.12, -1.08], [-0.18, 0.62, -0.42], true),
    moduleBox('optics', [0.20, 0.40, 0.25], [0.92, 0.84, 0.94], true),
    moduleBox('gun', [-0.30, 0.10, -0.20], [0.30, 0.67, 1.30], true),
    moduleBox('trackL', [-1.48, 0.02, -3.02], [-1.02, 1.02, 3.02]),
    moduleBox('trackR', [1.02, 0.02, -3.02], [1.48, 1.02, 3.02]),
  ],
  crew: [
    crewBox('driver', [-0.38, 0.50, 1.45], [0.38, 1.20, 2.45]),
    crewBox('gunner', [0.12, 0.08, 0.05], [0.88, 0.70, 0.82], true),
    crewBox('commander', [0.12, 0.08, -0.82], [0.90, 0.72, -0.18], true),
    crewBox('loader', [-0.90, 0.08, -0.60], [-0.12, 0.70, 0.34], true),
  ],
};

const spec = {
  id: 'm551_sheridan',
  name: 'M551 Sheridan',
  nation: 'USA',
  era: 'cold-war',
  role: 'light',
  hp: 1750,
  enginePowerHp: 300,
  weightTons: 18.6,
  topSpeedKmh: 70,
  reverseSpeedKmh: 18,
  hullTraverseDegS: 50,
  terrainResistance: { hard: 0.62, medium: 0.78, soft: 1.32 },
  pivotStyle: 'neutral',
  turretTraverseDegS: 40,
  gunPitchDegS: 31,
  gunElevationDeg: 19,
  gunDepressionDeg: 8,
  gun: {
    caliberMm: 152,
    reloadS: 9.4,
    baseAccuracy: 0.33,
    aimTimeS: 1.75,
    bloom: { move: 0.075, hullRot: 0.085, turret: 0.065, afterShot: 2.05 },
    primaryGuided: true,
    shells: [
      shell('MGM-51C Shillelagh ATGM', 'HEAT', 152, 800, 800, 730, 208, {
        guided: true,
        guidanceTurnRateRadS: 0.76,
        reloadS: 9.4,
        count: 10,
        soundProfile: 'shillelagh-launch',
      }),
    ],
  },
  dims: {
    hullLengthM: 6.30,
    overallLengthM: 6.30,
    widthM: 2.82,
    heightM: 2.29,
    // Visual-gate dimensions are measured from the procedural render rather
    // than the published transport envelope (which includes loose fittings).
    silhouetteHeightM: 2.873,
    silhouetteHullLengthM: 6.06,
    silhouetteOverallLengthM: 6.33,
    silhouetteWidthM: 2.82,
  },
  armor,
  visual: {
    scheme: 'nato',
    base: '#4a5138',
    weather: '#62684d',
    patches: ['#252b20', '#66513a'],
    marking: 'star',
    number: '551',
    trackWidthM: 0.48,
    camoScale: 0.78,
  },
};

TANK_SPECS[spec.id] = spec;
MODEL_SOURCE[spec.id] ||= { source: 'procedural' };
if (!ALL_TANK_IDS.includes(spec.id)) ALL_TANK_IDS.push(spec.id);
