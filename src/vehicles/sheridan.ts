// M551 Sheridan registration. The owner-supplied GLB is a local comparison
// oracle only; playable vehicles use first-party profiles/sheridan.ts geometry.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
import {
  crewBox,
  frontPlate,
  leftCheekPlate,
  leftSidePlate,
  moduleBox,
  plate,
  rearPlate,
  rightCheekPlate,
  rightSidePlate,
  roofPlate,
  shell,
  type ArmorEnvelope,
  type ArmorPlate,
  type CrewBox,
  type ModuleBox,
  type PlateOptions,
} from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';
import { bindFleetRegistries, registerFleetSpecs } from './fleetSpecRegistry.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
const SHERIDAN_IDS = Object.freeze(['m551_sheridan', 'm551a1_tts'] as const);

interface EraReduction {
  readonly keReduction: number;
  readonly ceFlatMm: number;
}

const ERA: EraReduction = Object.freeze({ keReduction: 0.18, ceFlatMm: 360 });
const eraOptions: PlateOptions = { kind: 'era', era: ERA, keMm: 15, ceMm: 15 };
const TTS_ERA: EraReduction = Object.freeze({ keReduction: 0.24, ceFlatMm: 520 });
const ttsEraOptions: PlateOptions = {
  kind: 'era', era: TTS_ERA, keMm: 22, ceMm: 22,
};

const clonePlate = (source: ArmorPlate): ArmorPlate => structuredClone(source);
const cloneVolume = <T extends ModuleBox | CrewBox>(source: T): T => structuredClone(source);

const armor: ArmorEnvelope = {
  boundingRadiusM: 4.75,
  turretPivot: [0, 1.466, 0],
  // The visible trunnion/tube starts at Z=1.10 m and terminates at Z=3.19 m
  // on a 1.906 m centerline.
  gunPivot: [0, 0.44, 1.10],
  gunBarrel: { lengthM: 2.09, radiusM: 0.115 },
  hullPlates: [
    frontPlate('sheridan_glacis_era', 15, 1.10, 0.87, 2.91, 1.30, 1.38, eraOptions),
    rightSidePlate('sheridan_skirt_era_R', 15, 1.43, 0.63, 1.43, 1.05,
      -2.25, 2.42, eraOptions),
    leftSidePlate('sheridan_skirt_era_L', 15, 1.43, 0.63, 1.43, 1.05,
      -2.25, 2.42, eraOptions),
    frontPlate('upper_glacis', 38, 1.31, 0.76, 3.05, 1.27, 1.28,
      { keMm: 74, ceMm: 92 }),
    frontPlate('lower_front', 30, 1.27, 0.31, 2.88, 0.76, 3.05,
      { keMm: 48, ceMm: 55 }),
    rightSidePlate('hull_side_upper_R', 28, 1.31, 0.80, 1.24, 1.27,
      -2.98, 1.34, { keMm: 40, ceMm: 46 }),
    leftSidePlate('hull_side_upper_L', 28, 1.31, 0.80, 1.24, 1.27,
      -2.98, 1.34, { keMm: 40, ceMm: 46 }),
    rightSidePlate('hull_side_lower_R', 25, 1.02, 0.25, 1.02, 0.82,
      -2.98, 2.88, { keMm: 32, ceMm: 36 }),
    leftSidePlate('hull_side_lower_L', 25, 1.02, 0.25, 1.02, 0.82,
      -2.98, 2.88, { keMm: 32, ceMm: 36 }),
    rightSidePlate('track_R', 20, 1.42, 0.08, 1.42, 1.00, -2.95, 2.95,
      { kind: 'external', moduleLink: 'trackR' }),
    leftSidePlate('track_L', 20, 1.42, 0.08, 1.42, 1.00, -2.95, 2.95,
      { kind: 'external', moduleLink: 'trackL' }),
    rearPlate('hull_rear', 25, 1.24, 0.31, -3.02, 1.20, -3.04,
      { keMm: 30, ceMm: 34 }),
    roofPlate('hull_roof', 20, 1.24, 1.27, -2.98, 1.28,
      { keMm: 26, ceMm: 30 }),
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
    rightSidePlate('turret_side_R', 32, 1.18, 0.08, 0.95, 0.78,
      -1.16, 0.42, { keMm: 48, ceMm: 56 }),
    leftSidePlate('turret_side_L', 32, 1.18, 0.08, 0.95, 0.78,
      -1.16, 0.42, { keMm: 48, ceMm: 56 }),
    rearPlate('turret_rear', 25, 0.92, 0.08, -1.16, 0.68, -1.22,
      { keMm: 32, ceMm: 38 }),
    roofPlate('turret_roof', 20, 0.92, 0.80, -0.88, 0.44,
      { keMm: 24, ceMm: 28 }),
  ],
  modules: [
    moduleBox('engine', [-0.52, 0.35, -2.67], [0.52, 0.64, -2.43]),
    moduleBox('fuelTank', [-0.72, 0.35, -1.25], [0.72, 0.75, -0.75]),
    moduleBox('ammoRack', [-0.60, 0.40, -0.70], [0.60, 0.70, -0.10]),
    moduleBox('missileRack', [-0.65, 0.40, -1.45], [0.65, 0.68, -0.85]),
    // The race remains on the real bearing footprint inside the narrow upper
    // hull instead of spanning the protruding turret basket.
    moduleBox('turretRing', [-0.82, 1.135, -0.46], [0.82, 1.235, -0.02]),
    moduleBox('radio', [-0.65, 0.42, -0.68], [-0.35, 0.62, -0.48], true),
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

const spec: FleetTankSpec = {
  id: 'm551_sheridan', name: 'M551 Sheridan', nation: 'USA',
  era: 'cold-war', role: 'light', hp: 2050, enginePowerHp: 400,
  weightTons: 18.6, topSpeedKmh: 70, reverseSpeedKmh: 24,
  hullTraverseDegS: 54,
  terrainResistance: { hard: 0.58, medium: 0.72, soft: 1.12 },
  pivotStyle: 'neutral', turretTraverseDegS: 46, gunPitchDegS: 36,
  gunElevationDeg: 19, gunDepressionDeg: 8,
  gun: {
    caliberMm: 152, reloadS: 3.0, baseAccuracy: 0.28, aimTimeS: 1.45,
    bloom: { move: 0.06, hullRot: 0.07, turret: 0.05, afterShot: 1.8 },
    primaryGuided: true,
    shells: [
      shell('MGM-51C Shillelagh ATGM', 'HEAT', 152, 900, 900, 800, 208, {
        guided: true, guidanceTurnRateRadS: 0.84, reloadS: 3.0, count: 14,
        soundProfile: 'shillelagh-launch',
      }),
    ],
  },
  dims: {
    hullLengthM: 6.30, overallLengthM: 6.30, widthM: 2.82, heightM: 2.29,
    silhouetteHeightM: 2.873, silhouetteHullLengthM: 6.06,
    silhouetteOverallLengthM: 6.33, silhouetteWidthM: 2.82,
  },
  armor,
  visual: {
    scheme: 'nato', base: '#4a5138', weather: '#62684d',
    patches: ['#252b20', '#66513a'], marking: 'star', number: '551',
    trackWidthM: 0.48, camoScale: 0.78,
  },
};

// Near-future demonstrator: the same five-wheel running gear with a protected
// engine deck, armored remote autocannon, and real damage-model ERA sectors.
const ttsArmor: ArmorEnvelope = {
  ...armor,
  turretPivot: [...armor.turretPivot],
  gunPivot: [...armor.gunPivot],
  gunBarrel: { ...armor.gunBarrel },
  boundingRadiusM: 5.15,
  hullPlates: [
    ...armor.hullPlates.map(clonePlate),
    frontPlate('m551a1_tts_glacis_era', 22, 1.16, 0.88, 2.94, 1.41, 1.34,
      ttsEraOptions),
    rightSidePlate('m551a1_tts_hull_era_R', 22, 1.45, 0.76, 1.45, 1.38,
      -3.34, 2.48, ttsEraOptions),
    leftSidePlate('m551a1_tts_hull_era_L', 22, 1.45, 0.76, 1.45, 1.38,
      -3.34, 2.48, ttsEraOptions),
    rearPlate('m551a1_tts_engine_deck_rear', 42, 1.30, 0.70, -3.52, 1.52,
      -3.58, { keMm: 70, ceMm: 94 }),
    roofPlate('m551a1_tts_engine_deck_roof', 32, 1.30, 1.50, -3.52, -2.45,
      { keMm: 48, ceMm: 64 }),
  ],
  turretPlates: [
    ...armor.turretPlates.map(clonePlate),
    rightCheekPlate('m551a1_tts_turret_era_R', 25, 0.20, 1.34, 1.42, 0.50,
      -0.02, 0.90, 0.12, 0.18, ttsEraOptions),
    leftCheekPlate('m551a1_tts_turret_era_L', 25, 0.20, 1.34, 1.42, 0.50,
      -0.02, 0.90, 0.12, 0.18, ttsEraOptions),
    roofPlate('m551a1_tts_turret_roof_era', 22, 1.02, 0.81, -0.88, 0.62,
      ttsEraOptions),
    rightSidePlate('m551a1_tts_bustle_R', 48, 1.30, 0.12, 1.30, 0.86,
      -1.78, -0.54, { keMm: 82, ceMm: 108 }),
    leftSidePlate('m551a1_tts_bustle_L', 48, 1.30, 0.12, 1.30, 0.86,
      -1.78, -0.54, { keMm: 82, ceMm: 108 }),
  ],
  modules: armor.modules.map((module) => {
    if (module.module === 'engine') {
      return moduleBox('engine', [-1.08, 0.72, -3.50], [1.08, 1.42, -2.52]);
    }
    if (module.module === 'radio') {
      return moduleBox('radio', [-1.05, 0.24, -1.70], [-0.18, 0.82, -0.92], true);
    }
    if (module.module === 'optics') {
      return moduleBox('optics', [0.42, 0.34, 0.72], [1.02, 1.05, 1.44], true);
    }
    return cloneVolume(module);
  }),
  crew: armor.crew.map(cloneVolume),
};

const ttsSpec: FleetTankSpec = {
  id: 'm551a1_tts', name: 'M551A1 TTS', nation: 'USA',
  era: 'next-generation', role: 'light', variantOf: 'm551_sheridan',
  hp: 2450, enginePowerHp: 520, weightTons: 24.8, topSpeedKmh: 68,
  reverseSpeedKmh: 28, hullTraverseDegS: 52,
  terrainResistance: { hard: 0.55, medium: 0.68, soft: 1.02 },
  pivotStyle: 'neutral', turretTraverseDegS: 50, gunPitchDegS: 40,
  gunElevationDeg: 22, gunDepressionDeg: 10,
  gun: {
    caliberMm: 152, reloadS: 3.0, baseAccuracy: 0.24, aimTimeS: 1.25,
    bloom: { move: 0.045, hullRot: 0.055, turret: 0.04, afterShot: 1.55 },
    primaryGuided: true,
    shells: [
      shell('MGM-51E TTS Shillelagh ATGM', 'HEAT', 152, 1050, 1050, 880,
        240.5, {
          guided: true, guidanceTurnRateRadS: 0.98, reloadS: 3.0, count: 18,
          soundProfile: 'shillelagh-launch',
        }),
    ],
  },
  dims: { hullLengthM: 7.16, overallLengthM: 7.16, widthM: 3.02, heightM: 3.45 },
  armor: ttsArmor,
  visual: {
    scheme: 'nato', base: '#4b5740', weather: '#687054',
    patches: ['#252d22', '#6b5940'], marking: 'star', number: '551A1',
    trackWidthM: 0.48, camoScale: 0.88,
  },
};

registerFleetSpecs(registries, SHERIDAN_IDS, {
  m551_sheridan: spec,
  m551a1_tts: ttsSpec,
});
