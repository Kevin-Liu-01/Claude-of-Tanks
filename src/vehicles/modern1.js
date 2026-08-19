// src/vehicles/modern1.js — HD procedural builder #1: modern MBT roster wave.
// Vehicles: t72b3 (T-72B3), dormant merkava4 family donor, leo2a6
// (Leopard 2A6). Specs per docs/research/modern-roster.md §14 / §21 / §8;
// visual bar per Appendix B (trapezoidal track runs, silhouette identity,
// raised ERA, articulated turret+gun, weathering). challenger2/challenger_3
// moved to profiles/challenger.js (§5.75 family-module split) — that module
// imports the spec-table helpers exported below.
//
// Registration pattern: tankFactory.js imports MODERN1_BUILDERS and merges it
// into its BUILDERS table (clearly-marked extension hook there). Specs and
// model-source rows register HERE by mutating the exported tables from
// specs.js — specs.js itself is untouched (it is concurrently edited by the
// sourcing workflows). Builders draw on the shared geometry/greeble kit
// exported by tankFactory.js (KIT). NOTE: tankFactory <-> modern1 is a
// deliberate module cycle — this module must not READ tankFactory bindings at
// module scope (they are TDZ during our evaluation); builders destructure KIT
// at call time.

import * as THREE from 'three';
import { KIT } from './tankFactory.js';
import { muzzleBore } from './profiles/kit.js';
import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.js';
import {
  plate as par,
  frontPlate as fr,
  rearPlate as rr,
  rightSidePlate as sR,
  leftSidePlate as sL,
  roofPlate as rf,
  rightCheekPlate as chR,
  leftCheekPlate as chL,
  moduleBox as mbox,
  crewBox as cbox,
  shell,
  apfsdsPenetration as apfsdsPens,
} from './specHelpers.js';

const D2R = Math.PI / 180;

const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };

// ---------------------------------------------------------------------------
// Armor models (plate-by-plate, roster RHAe tables)
// ---------------------------------------------------------------------------

// T-72B3 — §14.2: turret ~480/500 + Kontakt-5, glacis ~450/500 + K-5,
// sides 80 mm + soft skirts with K-1 forward.
function armorT72B3() {
  const trkTop = 0.98, floor = 0.42, roofY = 1.38;
  const k5 = { keReduction: 0.20, ceFlatMm: 450 };
  const k1 = { keReduction: 0.05, ceFlatMm: 280 };
  return {
    boundingRadiusM: 4.95,
    turretPivot: [0, 1.38, 0.10],
    gunPivot: [0, 0.30, 0.55],
    gunBarrel: { lengthM: 6.0, radiusM: 0.10 },
    hullPlates: [
      // K-5 glacis array as two side-by-side strippable tiles (visual clusters
      // 'glacis_era_L'/'glacis_era_R' in buildT72B3 key off these names)
      par('glacis_era_L', 15, [-1.56, 0.92, 3.32], [-0.04, 0.92, 3.32], [-1.56, 1.36, 1.98],
        { kind: 'era', era: k5 }),
      par('glacis_era_R', 15, [0.04, 0.92, 3.32], [1.56, 0.92, 3.32], [0.04, 1.36, 1.98],
        { kind: 'era', era: k5 }),
      fr('upper_glacis', 480, 1.55, 0.82, 3.28, roofY, 1.90, { keMm: 450, ceMm: 500 }),
      fr('lower_front', 80, 1.55, floor, 2.98, 0.82, 3.28, { keMm: 100, ceMm: 100 }),
      sR('hull_side_upper_R', 70, 1.86, trkTop, 1.86, roofY, -3.3, 1.9, { keMm: 80, ceMm: 80 }),
      sL('hull_side_upper_L', 70, 1.86, trkTop, 1.86, roofY, -3.3, 1.9, { keMm: 80, ceMm: 80 }),
      sR('hull_side_lower_R', 70, 1.28, floor, 1.28, trkTop, -3.25, 2.95, { keMm: 80, ceMm: 80 }),
      sL('hull_side_lower_L', 70, 1.28, floor, 1.28, trkTop, -3.25, 2.95, { keMm: 80, ceMm: 80 }),
      sR('skirt_era_R', 12, 1.87, 0.45, 1.87, 1.02, 1.2, 3.2, { kind: 'era', era: k1 }),
      sL('skirt_era_L', 12, 1.87, 0.45, 1.87, 1.02, 1.2, 3.2, { kind: 'era', era: k1 }),
      sR('skirt_rubber_R', 8, 1.87, 0.45, 1.87, 1.02, -3.2, 1.2, { kind: 'spaced' }),
      sL('skirt_rubber_L', 8, 1.87, 0.45, 1.87, 1.02, -3.2, 1.2, { kind: 'spaced' }),
      sR('track_R', 20, 1.57, 0.12, 1.57, trkTop, -3.34, 3.34, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, 1.57, 0.12, 1.57, trkTop, -3.34, 3.34, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 45, 1.55, floor, -3.34, roofY, -3.34),
      rf('hull_roof', 40, 1.55, roofY, -3.3, 1.9),
    ],
    turretPlates: [
      chR('turret_era_R', 15, 0.24, 0.98, 1.02, 0.28, 0.05, 0.55, 0.10, 0, { kind: 'era', era: k5 }),
      chL('turret_era_L', 15, 0.24, 0.98, 1.02, 0.28, 0.05, 0.55, 0.10, 0, { kind: 'era', era: k5 }),
      chR('turret_cheek_R', 520, 0.20, 0.84, 1.00, 0.16, 0.0, 0.58, 0.10, 0, { keMm: 480, ceMm: 500 }),
      chL('turret_cheek_L', 520, 0.20, 0.84, 1.00, 0.16, 0.0, 0.58, 0.10, 0, { keMm: 480, ceMm: 500 }),
      par('mantlet', 300, [-0.20, 0.06, 0.90], [0.20, 0.06, 0.90], [-0.20, 0.44, 0.86],
        { keMm: 320, ceMm: 380, gunFollow: true }),
      sR('turret_side_R', 280, 1.04, 0.0, 0.86, 0.55, -0.9, 0.2, { keMm: 280, ceMm: 400 }),
      sL('turret_side_L', 280, 1.04, 0.0, 0.86, 0.55, -0.9, 0.2, { keMm: 280, ceMm: 400 }),
      rr('turret_rear', 45, 0.85, 0.0, -1.05, 0.5, -1.05),
      rf('turret_roof', 45, 0.95, 0.60, -1.0, 0.55),
    ],
    modules: [
      mbox('engine', [-1.0, 0.45, -3.2], [1.0, 1.38, -1.7]),
      mbox('fuelTank', [0.6, 0.45, -1.65], [1.22, 1.0, -0.3]),
      mbox('ammoRack', [-0.7, 0.42, -0.5], [0.7, 0.92, 0.7]),        // carousel autoloader
      mbox('turretRing', [-0.85, 1.25, -0.8], [0.85, 1.45, 0.9]),
      mbox('radio', [-0.6, 0.05, -1.1], [-0.1, 0.5, -0.7], true),
      mbox('optics', [-0.65, 0.55, 0.2], [-0.2, 0.9, 0.65], true),   // Sosna-U
      mbox('gun', [-0.18, 0.05, -0.45], [0.18, 0.5, 0.6], true),
      mbox('trackL', [-1.86, 0.0, -3.34], [-1.28, trkTop, 3.34]),
      mbox('trackR', [1.28, 0.0, -3.34], [1.86, trkTop, 3.34]),
    ],
    crew: [
      cbox('driver', [-0.32, 0.5, 1.85], [0.32, 1.1, 2.8]),
      cbox('gunner', [-0.75, 0.0, -0.2], [-0.2, 0.55, 0.5], true),
      cbox('commander', [0.2, 0.0, -0.45], [0.78, 0.58, 0.3], true),
    ],
  };
}

// Merkava IVm — §21.2: turret wedge ~650/1000, hull front ~500/750 + engine
// block behind (front engine soaks pens), rear = weak spot (troop door).
function armorMerkava4() {
  const trkTop = 1.02, floor = 0.45, roofY = 1.62;
  return {
    boundingRadiusM: 5.2,
    turretPivot: [0, 1.62, -0.35],
    gunPivot: [0, 0.35, 0.55],
    gunBarrel: { lengthM: 5.3, radiusM: 0.10 },
    hullPlates: [
      fr('upper_glacis', 520, 1.66, 0.75, 3.72, 1.50, 2.15, { keMm: 500, ceMm: 750 }),
      fr('lower_front', 250, 1.60, floor, 3.42, 0.75, 3.72, { keMm: 250, ceMm: 350 }),
      sR('hull_side_upper_R', 60, 1.80, trkTop, 1.80, roofY, -3.7, 2.1, { keMm: 100, ceMm: 100 }),
      sL('hull_side_upper_L', 60, 1.80, trkTop, 1.80, roofY, -3.7, 2.1, { keMm: 100, ceMm: 100 }),
      sR('hull_side_lower_R', 60, 1.30, floor, 1.30, trkTop, -3.65, 3.4, { keMm: 100, ceMm: 100 }),
      sL('hull_side_lower_L', 60, 1.30, floor, 1.30, trkTop, -3.65, 3.4, { keMm: 100, ceMm: 100 }),
      sR('skirt_R', 40, 1.88, 0.5, 1.88, 1.10, -3.5, 3.5, { kind: 'spaced', keMm: 70, ceMm: 280 }),
      sL('skirt_L', 40, 1.88, 0.5, 1.88, 1.10, -3.5, 3.5, { kind: 'spaced', keMm: 70, ceMm: 280 }),
      sR('track_R', 25, 1.55, 0.14, 1.55, trkTop, -3.8, 3.8, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 25, 1.55, 0.14, 1.55, trkTop, -3.8, 3.8, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear_door', 60, 1.55, floor, -3.8, roofY, -3.8),        // clamshell troop door
      rf('hull_roof', 45, 1.66, roofY, -3.7, 2.1),
    ],
    turretPlates: [
      chR('turret_wedge_R', 680, 0.14, 1.30, 1.14, -0.30, 0.0, 0.78, 0.42, 0, { keMm: 650, ceMm: 1000 }),
      chL('turret_wedge_L', 680, 0.14, 1.30, 1.14, -0.30, 0.0, 0.78, 0.42, 0, { keMm: 650, ceMm: 1000 }),
      par('gun_notch', 350, [-0.16, 0.08, 1.20], [0.16, 0.08, 1.20], [-0.16, 0.50, 1.12],
        { keMm: 380, ceMm: 450, gunFollow: true }),
      sR('trophy_R', 30, 1.12, 0.05, 1.12, 0.55, -1.2, -0.1, { kind: 'spaced', keMm: 60, ceMm: 200 }),
      sL('trophy_L', 30, 1.12, 0.05, 1.12, 0.55, -1.2, -0.1, { kind: 'spaced', keMm: 60, ceMm: 200 }),
      sR('turret_side_R', 320, 1.00, 0.0, 0.85, 0.78, -1.35, 0.2, { keMm: 350, ceMm: 500 }),
      sL('turret_side_L', 320, 1.00, 0.0, 0.85, 0.78, -1.35, 0.2, { keMm: 350, ceMm: 500 }),
      rr('turret_rear', 60, 0.85, 0.0, -1.45, 0.7, -1.45),
      rf('turret_roof', 45, 1.0, 0.80, -1.4, 0.9),
    ],
    modules: [
      // FRONT engine, right — the signature survivability layout
      mbox('engine', [0.0, floor, 1.5], [1.35, 1.55, 3.4]),
      mbox('fuelTank', [-1.25, floor, -3.0], [-0.4, 1.2, -1.8]),
      mbox('ammoRack', [-0.9, floor, -3.4], [0.9, 1.3, -2.2]),        // rear compartment racks
      mbox('turretRing', [-0.9, 1.44, -1.3], [0.9, 1.64, 0.6]),
      mbox('radio', [0.3, 0.1, -1.2], [0.8, 0.55, -0.7], true),
      mbox('optics', [0.0, 0.6, -0.2], [0.5, 0.95, 0.3], true),
      mbox('gun', [-0.18, 0.1, -0.4], [0.18, 0.6, 0.7], true),
      mbox('trackL', [-1.88, 0.0, -3.8], [-1.3, trkTop, 3.8]),
      mbox('trackR', [1.3, 0.0, -3.8], [1.88, trkTop, 3.8]),
    ],
    crew: [
      cbox('driver', [-1.0, 0.55, 0.9], [-0.35, 1.25, 2.0]),          // left of engine
      cbox('gunner', [0.25, 0.0, -0.1], [0.8, 0.68, 0.55], true),
      cbox('commander', [0.25, 0.05, -0.95], [0.85, 0.75, -0.2], true),
      cbox('loader', [-0.85, 0.0, -0.6], [-0.25, 0.72, 0.3], true),
    ],
  };
}

// Leopard 2A6 — §8.2: geometry identical to the shipped 2A7 armor model with
// the roster's 2A6 RHAe values (turret ~700/1000, hull ~620/750).
function armorLeo2A6() {
  const trkTop = 1.08, floor = 0.5, roofY = 1.72;
  return {
    boundingRadiusM: 5.8,
    turretPivot: [0, 1.72, -0.35],
    gunPivot: [0, 0.32, 0.8],
    gunBarrel: { lengthM: 6.6, radiusM: 0.10 },
    hullPlates: [
      fr('upper_glacis', 45, 1.6, 1.0, 3.83, roofY, 1.00, { keMm: 120, ceMm: 150 }),
      fr('lower_front', 600, 1.6, floor, 3.45, 1.0, 3.83, { keMm: 620, ceMm: 750 }),
      sR('hull_side_upper_R', 40, 1.875, trkTop, 1.875, roofY, -3.86, 1.0),
      sL('hull_side_upper_L', 40, 1.875, trkTop, 1.875, roofY, -3.86, 1.0),
      sR('hull_side_lower_R', 40, 1.24, floor, 1.24, trkTop, -3.8, 3.45),
      sL('hull_side_lower_L', 40, 1.24, floor, 1.24, trkTop, -3.8, 3.45),
      sR('skirt_heavy_R', 110, 1.88, 0.45, 1.88, 1.15, 1.3, 3.8, { kind: 'spaced', keMm: 160, ceMm: 450 }),
      sL('skirt_heavy_L', 110, 1.88, 0.45, 1.88, 1.15, 1.3, 3.8, { kind: 'spaced', keMm: 160, ceMm: 450 }),
      sR('skirt_rear_R', 10, 1.88, 0.45, 1.88, 1.15, -3.8, 1.3, { kind: 'spaced' }),
      sL('skirt_rear_L', 10, 1.88, 0.45, 1.88, 1.15, -3.8, 1.3, { kind: 'spaced' }),
      sR('track_R', 25, 1.55, 0.15, 1.55, trkTop, -3.86, 3.86, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 25, 1.55, 0.15, 1.55, trkTop, -3.86, 3.86, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 40, 1.6, floor, -3.86, roofY, -3.86),
      rf('hull_roof', 40, 1.6, roofY, -3.86, 1.00),
    ],
    turretPlates: [
      chR('turret_wedge_R', 90, 0.04, 1.52, 1.30, 0.14, 0.08, 0.90, 0.52, 0,
        { kind: 'spaced', keMm: 220, ceMm: 750 }),
      chL('turret_wedge_L', 90, 0.04, 1.52, 1.30, 0.14, 0.08, 0.90, 0.52, 0,
        { kind: 'spaced', keMm: 220, ceMm: 750 }),
      chR('turret_cheek_R', 700, 0.18, 0.68, 1.22, 0.10, 0.0, 0.88, 0.06, 0, { keMm: 700, ceMm: 1000 }),
      chL('turret_cheek_L', 700, 0.18, 0.68, 1.22, 0.10, 0.0, 0.88, 0.06, 0, { keMm: 700, ceMm: 1000 }),
      par('turret_sight_recess', 250, [0.46, 0.76, 0.76], [1.02, 0.76, 0.55], [0.46, 1.02, 0.70],
        { keMm: 300, ceMm: 350 }),
      par('mantlet', 350, [-0.26, 0.08, 1.24], [0.26, 0.08, 1.24], [-0.26, 0.52, 1.21],
        { keMm: 420, ceMm: 500, gunFollow: true }),
      sR('turret_side_R', 320, 1.22, 0.0, 1.22, 0.88, -2.05, 0.14, { keMm: 350, ceMm: 500 }),
      sL('turret_side_L', 320, 1.22, 0.0, 1.22, 0.88, -2.05, 0.14, { keMm: 350, ceMm: 500 }),
      rr('turret_rear', 80, 1.20, 0.0, -2.08, 0.88, -2.08),
      rf('turret_roof', 45, 1.22, 0.90, -2.05, 0.58),
    ],
    modules: [
      mbox('engine', [-1.05, 0.5, -3.75], [1.05, 1.55, -1.9]),
      mbox('fuelTank', [0.5, 0.5, -1.85], [1.2, 1.3, -0.9]),
      mbox('ammoRack', [-1.15, 0.55, 1.6], [-0.35, 1.5, 3.0]),
      mbox('turretRing', [-0.95, 1.54, -1.25], [0.95, 1.74, 0.85]),
      mbox('radio', [-0.6, 0.1, -1.4], [-0.1, 0.55, -0.9], true),
      mbox('optics', [0.35, 0.7, 0.5], [0.75, 1.0, 0.95], true),
      mbox('gun', [-0.18, 0.05, -0.5], [0.18, 0.55, 0.8], true),
      mbox('trackL', [-1.875, 0.0, -3.86], [-1.24, trkTop, 3.86]),
      mbox('trackR', [1.24, 0.0, -3.86], [1.875, trkTop, 3.86]),
    ],
    crew: [
      cbox('driver', [0.25, 0.55, 2.2], [0.9, 1.25, 3.3]),
      cbox('gunner', [0.25, 0.0, 0.0], [0.85, 0.7, 0.7], true),
      cbox('commander', [0.25, 0.05, -0.8], [0.9, 0.78, -0.1], true),
      cbox('loader', [-0.9, 0.0, -0.45], [-0.25, 0.75, 0.5], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// Specs (stats per roster §14.3-4 / §18.3-4 / §21.3-4 / §8.3-4)
// ---------------------------------------------------------------------------
const MODERN1_SPECS = {
  t72b3: {
    id: 't72b3', name: 'T-72B3', nation: 'Russia', era: 'modern', class: 'mbt',
    hp: 1850,
    enginePowerHp: 840, weightTons: 46.5, topSpeedKmh: 60, reverseSpeedKmh: 4.8,
    hullTraverseDegS: 36,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 30, gunPitchDegS: 24, gunElevationDeg: 14, gunDepressionDeg: 6,
    gun: {
      caliberMm: 125, reloadS: 7.8, baseAccuracy: 0.38, aimTimeS: 2.4,
      bloom: BLOOM_MODERN,
      shells: [
        shell('3BM46 Svinets', 'APFSDS', 125, apfsdsPens(570)[0], apfsdsPens(570)[1], 510, 1700, { pen2000Mm: apfsdsPens(570)[2] }),
        shell('3BK29 HEAT', 'HEAT', 125, 630, 630, 470, 905),
        shell('3OF26 HE-Frag', 'HE', 125, 50, 50, 570, 850),
      ],
    },
    dims: { hullLengthM: 6.67, overallLengthM: 9.53, widthM: 3.59, heightM: 2.23 },
    armor: armorT72B3(),
    visual: {
      scheme: 'solid', base: '#42513a', weather: '#4e5c45', patches: [],
      marking: 'number', number: '312', trackWidthM: 0.58,
    },
  },

  merkava4: {
    id: 'merkava4', name: 'Merkava IVm Windbreaker', nation: 'Israel', era: 'modern', class: 'mbt',
    hp: 2550,
    enginePowerHp: 1500, weightTons: 65, topSpeedKmh: 64, reverseSpeedKmh: 25,
    hullTraverseDegS: 38,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 38, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 7,
    gun: {
      caliberMm: 120, reloadS: 6.5, baseAccuracy: 0.31, aimTimeS: 1.9,
      bloom: BLOOM_MODERN,
      shells: [
        shell('M322 APFSDS', 'APFSDS', 120, apfsdsPens(650)[0], apfsdsPens(650)[1], 520, 1680, { pen2000Mm: apfsdsPens(650)[2] }),
        shell('M325 HEAT-MP', 'HEAT', 120, 600, 600, 480, 1400),
        shell('M339 HE-MP', 'HE', 120, 45, 45, 590, 950),
      ],
    },
    dims: { hullLengthM: 7.60, overallLengthM: 9.04, widthM: 3.72, heightM: 2.66 },
    armor: armorMerkava4(),
    visual: {
      // IDF Sinai grey single tone (§21.5)
      scheme: 'solid', base: '#6f7566', weather: '#7b8172', patches: [],
      marking: 'number', number: '11', trackWidthM: 0.64,
    },
  },

  leo2a6: {
    id: 'leo2a6', name: 'Leopard 2A6', nation: 'Germany', era: 'modern', class: 'mbt',
    hp: 2400,
    enginePowerHp: 1500, weightTons: 62.3, topSpeedKmh: 68, reverseSpeedKmh: 25,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 9,
    gun: {
      caliberMm: 120, reloadS: 6.0, baseAccuracy: 0.27, aimTimeS: 1.6,
      bloom: BLOOM_MODERN,
      shells: [
        shell('DM53 APFSDS', 'APFSDS', 120, apfsdsPens(700)[0], apfsdsPens(700)[1], 530, 1750, { pen2000Mm: apfsdsPens(700)[2] }),
        shell('DM12A2 HEAT-MP', 'HEAT', 120, 600, 600, 480, 1400),
        shell('DM11 HE-ABM', 'HE', 120, 40, 40, 590, 1000),
      ],
    },
    dims: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 3.75, heightM: 2.64 },
    armor: armorLeo2A6(),
    visual: {
      scheme: 'nato', base: '#49543c', weather: '#515e44',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'cross', number: '24', trackWidthM: 0.635, camoScale: 0.5,
    },
  },
};

// Register specs + model-source rows + garage roster ids (idempotent —
// vite HMR can re-evaluate this module).
// DELIST-KEEP-SPEC donors (the leo2a7 pattern, specs.js:7 precedent): their
// TANK_SPECS rows stay registered because later first-party variants clone
// them, but they never enter ALL_TANK_IDS and therefore have no garage card.
// - t72b3: owner removal 2026-08-06; donor for pt91m/t64bv1/t72b_1987.
// - merkava4: owner removal 2026-08-13; donor for the Mk.1B–Mk.3D family.
const MODERN1_DELISTED = new Set(['t72b3', 'merkava4']);
for (const [id, spec] of Object.entries(MODERN1_SPECS)) {
  TANK_SPECS[id] = TANK_SPECS[id] || spec;
  MODEL_SOURCE[id] = MODEL_SOURCE[id] || { source: 'procedural' };
  if (!MODERN1_DELISTED.has(id) && !ALL_TANK_IDS.includes(id)) ALL_TANK_IDS.push(id);
}

// ===========================================================================
// Builders
// ===========================================================================

// ---------------------------------------------------------------------------
// T-72B3 — §14.5: low Soviet pancake, full-width K-5 chevron glacis array,
// squat cast dome (NOT the T-90M welded box) with K-5 eyebrow wedges,
// Sosna-U box left of gun, 6 big stamped wheels + 3 rollers, saddle fuel
// drums, unditching log, snorkel. No Shtora eyes.
// ---------------------------------------------------------------------------
function buildT72B3(P) {
  const { box, cylX, cylY, cylZ, sph, lathe, frustum, fenders, headlight, liftEye,
    periscope, smokeCluster, towCable, stowage, jerryCan, spareTrackStrip,
    buildGun, buildRunningGear, cupola, xform, torus } = KIT;
  const { rng } = P;
  // hull: flat pancake — lower box + shallow tapered deck band to the 1.38 roof
  P.add('hull', box(2.35, 0.55, 6.45), 0, 0.70, -0.05);
  P.add('hull', frustum(1.70, 2.92, -3.22, 1.44, 2.86, -3.18, 1.06, 1.38));     // tapered deck band
  fenders(P, 1.28, 1.86, 1.045, -3.28, 3.12, 0.035);
  P.add('hull', frustum(1.60, 3.24, 1.92, 1.64, 1.88, 1.92, 0.80, 1.38));       // 68 deg glacis
  P.add('hull', frustum(1.60, 2.94, 3.0, 1.60, 3.24, 3.0, 0.42, 0.80));         // lower front
  for (const s of [-1, 1]) {                                                    // fender-underside AO
    P.add('hullShadow', new THREE.BoxGeometry(0.55, 0.026, 6.2), s * 1.52, 1.035, -0.05);
  }
  // driver centered on the glacis (§14.5) + V-splash board
  P.add('hull', box(0.5, 0.05, 0.45), 0, 1.27, 2.16, -1.19, 0, 0);
  periscope(P, 'hullDetail', 0, 1.40, 1.78);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.8, 0.05, 0.08), s * 0.38, 1.06, 2.55, -1.19, s * 0.5, 0);
  // Kontakt-5 glacis: 4 chevron wedge courses proud of the plate (raised
  // geometry per Appendix B) with strippable brick tiles riding them.
  const glz = (y) => 1.88 + (1.38 - y) * 2.43 + 0.045;                          // glacis plane + proud
  for (const s of [-1, 1]) {
    for (const xw of [0.42, 1.24]) {
      P.add('hull', box(0.78, 0.13, 0.10), s * xw, 1.10, glz(1.10), -68 * D2R, s * 0.30, 0);
      P.add('hull', box(0.78, 0.13, 0.10), s * xw, 1.26, glz(1.26), -68 * D2R, -s * 0.30, 0);
    }
  }
  P.eraCluster('glacis_era_R', (put) => {
    for (const [xw, row] of [[0.42, 0], [1.24, 0], [0.42, 1], [1.24, 1]]) {
      const y = row ? 1.26 : 1.10;
      for (let c = -1; c <= 1; c++) {
        put(xw + c * 0.26, y, glz(y) + 0.02, -68 * D2R, (row ? -1 : 1) * 0.30, 0);
      }
    }
  });
  P.eraCluster('glacis_era_L', (put) => {
    for (const [xw, row] of [[0.42, 0], [1.24, 0], [0.42, 1], [1.24, 1]]) {
      const y = row ? 1.26 : 1.10;
      for (let c = -1; c <= 1; c++) {
        put(-xw + c * 0.26, y, glz(y) + 0.02, -68 * D2R, (row ? 1 : -1) * 0.30, 0);
      }
    }
  });
  // rubber-flap skirts, K-1 brick clusters on the forward third (§14.5)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.035, 0.40, 6.25), s * 1.85, 0.84, -0.08);
    P.add('hullRubber', box(0.028, 0.10, 6.2), s * 1.85, 0.60, -0.08);          // dust lip
    for (let k = 0; k < 4; k++) {
      P.add('hullDark', box(0.042, 0.32, 0.02), s * 1.85, 0.82, -1.4 - k * 0.5);
    }
  }
  P.eraCluster('skirt_era_R', (put) => {
    for (let c = 0; c < 4; c++) for (let row = 0; row < 2; row++)
      put(1.885, 0.72 + row * 0.20, 2.85 - c * 0.42, 0, Math.PI / 2, 0);
  });
  P.eraCluster('skirt_era_L', (put) => {
    for (let c = 0; c < 4; c++) for (let row = 0; row < 2; row++)
      put(-1.885, 0.72 + row * 0.20, 2.85 - c * 0.42, 0, -Math.PI / 2, 0);
  });
  // rear plate: unditching log + twin saddle fuel drums on rails (§14.5)
  P.add('hullWood', cylX(0.11, 2.05, 12), 0, 1.18, -3.24);
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.145, 0.145, 1.0, 12), s * 0.82, 0.92, -3.42, 0, 0, s * 0.10);
    P.add('hullDetail', cylY(0.152, 0.152, 0.05, 12), s * 0.82, 1.32, -3.46, 0, 0, s * 0.10); // cap ring
    P.add('hullDark', box(0.05, 0.38, 0.03), s * 0.82, 0.92, -3.54);            // straps
    P.add('hullDetail', box(0.06, 0.06, 0.5), s * 1.15, 1.30, -3.30);           // saddle rails
  }
  // engine deck: grille inset + transverse louvers
  P.add('hullDark', box(1.55, 0.02, 0.85), 0, 1.385, -2.05);
  if (P.q) for (let k = 0; k < 5; k++) P.add('hullDetail', box(1.45, 0.02, 0.05), 0, 1.39, -1.75 - k * 0.15);
  P.add('hull', box(0.85, 0.08, 0.65), -0.55, 1.42, -1.25);                     // intake hump
  headlight(P, 1.42, 1.10, 3.02, -0.2, 0.05);                                   // right-fender light
  liftEye(P, 'hullDetail', -1.18, 1.40, 1.5);
  liftEye(P, 'hullDetail', 1.18, 1.40, 1.5);
  towCable(P, [[-1.25, 1.02, 2.9], [-0.35, 0.96, 3.06], [0.55, 1.0, 2.96]]);    // glacis lip cable
  spareTrackStrip(P, 'hull', -1.28, 1.14, 2.4, 2, -1.15, 0);
  // turret: squat CAST DOME (half-egg lathe, plan-stretched), not a welded box
  P.add('turret', lathe([
    [1.06, 0.0], [1.05, 0.10], [1.00, 0.22], [0.90, 0.33], [0.76, 0.43],
    [0.58, 0.51], [0.34, 0.565], [0.0, 0.59],
  ], P.q ? 30 : 14, 1.18), 0, 0, -0.02);
  const T72H = 0.59;
  // K-5 eyebrow wedges over the frontal 60 deg (chunky raised courses)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.74, 0.30, 0.24), s * 0.44, 0.24, 0.66, -0.24, s * 0.55, 0);
    P.add('turret', box(0.58, 0.16, 0.20), s * 0.42, 0.47, 0.56, -0.42, s * 0.55, 0);
  }
  const t72Brow = (put, s) => {
    const dx = Math.cos(0.55), dz = -Math.sin(0.55);
    const nx = Math.sin(0.55), nz = Math.cos(0.55);
    for (let row = 0; row < 2; row++) for (let c = 0; c < 4; c++) {
      const t = -0.28 + c * 0.19;
      put(s * (0.44 + dx * t + nx * 0.15), 1.60 + row * 0.16,
        0.66 + dz * t + nz * 0.15, -0.24, s * 0.55, 0);
    }
  };
  P.eraCluster('turret_era_R', (put) => t72Brow(put, 1), true);
  P.eraCluster('turret_era_L', (put) => t72Brow(put, -1), true);
  // Sosna-U gunner sight: boxy housing standing on the roof LEFT of the gun,
  // rectangular barn-door cover — THE B3 giveaway (§14.5)
  P.add('turret', box(0.44, 0.30, 0.40), -0.40, T72H + 0.12, 0.30);
  P.add('turret', box(0.48, 0.09, 0.10), -0.40, T72H + 0.30, 0.47);             // brow lid
  P.add('turretDark', box(0.38, 0.22, 0.05), -0.40, T72H + 0.11, 0.515);        // door recess
  P.add('turret', box(0.17, 0.22, 0.03), -0.53, T72H + 0.11, 0.545, 0, 0.55, 0); // swung barn door
  P.add('turretGlass', box(0.15, 0.12, 0.02), -0.32, T72H + 0.11, 0.535);       // lens
  // commander cupola (right) with AA MG ring, gunner hatch left
  cupola(P, 'turret', 0.42, T72H - 0.06, -0.30, 0.22, 0.12, 5);
  P.add('turret', cylY(0.20, 0.20, 0.04, 14), -0.44, T72H - 0.03, -0.28);
  P.add('turretDetail', torus(0.25, 0.02, P.q ? 20 : 10), 0.42, T72H + 0.10, -0.30);
  // flat meteo mast at the roof rear (§14.5) + whip antenna
  P.add('turretDetail', box(0.025, 0.38, 0.025), -0.28, T72H + 0.24, -0.78);
  P.add('turretDetail', box(0.03, 0.5, 0.03), 0.62, T72H + 0.22, -0.72, 0, 0, 0.10);
  // snorkel tube stowed across the turret rear + grab rails
  P.add('turretDetail', cylX(0.065, 1.5, 10), 0, 0.30, -0.98);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.025, 0.025, 0.6), s * 0.85, 0.30, -0.45);
    stowage(P, 'turretCloth', rng, [[s * 0.72, 0.34, -0.72, 0.34, 0.22, 0.4]]);
  }
  // r3 kit de-share: no NATO tan jerry can on a Russian turret — a dark
  // stowed tarp bundle breaks the identical-kit read across the moderns.
  stowage(P, 'turretDark', rng, [[-0.05, 0.40, -0.95, 0.34, 0.16, 0.30]]);
  // 902B smoke bank on the left cheek (T-72B3 carries them clustered left)
  smokeCluster(P, -0.92, 0.32, 0.42, 6, -0.85, 0.6);
  // gun: 125 mm 2A46M-5 with sleeve + evacuator; embrasure block + collar
  P.addGunExtra(box(0.42, 0.42, 0.28), 0, 0.02, 0.52);
  P.addGunExtra(cylZ(0.13, 0.32, 12, 0.16), 0, 0, 0.76);
  buildGun(P, { len: 6.0, r: 0.068, sleeve: true, evac: 0.48, baseR: 0.15 });
  muzzleBore(P, { len: 6.0, r: 0.068 });                      // §B3.1 (shadow-named, 3fca39b)
  // 6 big stamped wheels (bigger/flatter than T-90 — §14.5), 3 rollers,
  // sprocket REAR
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.39, wheelW: 0.21, xc: 1.58,
    wheelZs: [2.48, 1.49, 0.50, -0.49, -1.48, -2.47],
    sprocket: { z: -3.0, y: 0.53, r: 0.27 }, idler: { z: 2.95, y: 0.51, r: 0.25 },
    rollers: [1.45, 0, -1.45].map((z) => ({ z, y: 0.92, r: 0.09 })),
    // r3: rubber-flap skirts cover the T-72B3 return run — no horn comb.
    trackW: 0.58, topY: 0.85, arms: true, paintedEnds: true, coveredTop: true,
  });
  P.decal('turret', 'number', '312', 0.30, [0.98, 0.24, -0.30], Math.PI / 2, 0, 0.18);
  P.decal('turret', 'number', '312', 0.30, [-0.98, 0.24, -0.30], -Math.PI / 2, 0, -0.18);
  P.decal('hull', 'soot', null, 0.7, [-1.6, 0.95, -1.8], -Math.PI / 2);         // left exhaust soot
  P.topY = 0.85;
}

// ---------------------------------------------------------------------------
// Merkava IVm — §21.5: V-roof hull, front-right engine hump, rear troop door,
// arrowhead turret with ball-and-chain curtain + Trophy slabs, external
// coil-spring bogies, sprocket FRONT, Sinai grey.
// ---------------------------------------------------------------------------
function buildMerkava4(P) {
  const { box, cylX, cylY, cylZ, sph, slab, frustum, fenders, headlight, liftEye,
    periscope, smokeCluster, towCable, stowage, tarpRoll, buildGun,
    buildRunningGear, torus } = KIT;
  const { rng } = P;
  // hull: lower box + side walls, topped by the WIDE SHALLOW V roof — two
  // planes meeting at the centerline ridge (§21.5 "unlike anything NATO")
  P.add('hull', box(2.5, 0.55, 7.3), 0, 0.72, -0.05);
  P.add('hull', frustum(1.80, 2.35, -3.55, 1.80, 2.30, -3.55, 1.0, 1.50));      // upper side walls
  P.add('hull', slab(                                                            // RIGHT V-roof plane
    [0, 1.50, 2.35], [1.80, 1.30, 2.10], [1.80, 1.30, -3.55], [0, 1.50, -3.55],
    [0, 1.66, 2.35], [1.80, 1.46, 2.10], [1.80, 1.46, -3.55], [0, 1.66, -3.55]));
  P.add('hull', slab(                                                            // LEFT V-roof plane
    [-1.80, 1.30, 2.10], [0, 1.50, 2.35], [0, 1.50, -3.55], [-1.80, 1.30, -3.55],
    [-1.80, 1.46, 2.10], [0, 1.66, 2.35], [0, 1.66, -3.55], [-1.80, 1.46, -3.55]));
  // very long sloped glacis sweeping down off the V (§21.5)
  P.add('hull', frustum(1.66, 3.72, 2.2, 1.70, 2.15, 2.2, 0.75, 1.52));
  P.add('hull', frustum(1.60, 3.42, 3.72, 1.60, 3.72, 3.72, 0.42, 0.75));       // blunt lower nose
  fenders(P, 1.30, 1.88, 1.10, -3.65, 3.55, 0.035);
  for (const s of [-1, 1]) {
    P.add('hullShadow', new THREE.BoxGeometry(0.5, 0.026, 6.9), s * 1.55, 1.085, -0.05);
  }
  // engine hump FRONT-RIGHT with grilles on the right fender (§21.5)
  P.add('hull', box(1.05, 0.20, 1.6), 0.82, 1.56, 2.15, -0.10, 0, -0.06);
  P.add('hullDark', box(0.72, 0.02, 1.15), 0.86, 1.645, 2.05);                  // hump grille inset
  if (P.q) for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.66, 0.025, 0.06), 0.86, 1.65, 2.45 - k * 0.2);
  P.add('hullDark', box(0.55, 0.06, 0.9), 1.55, 1.13, 2.5);                     // right-fender exhaust grille
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(0.5, 0.05, 0.06), 1.55, 1.16, 2.75 - k * 0.18);
  P.add('hull', box(0.5, 0.13, 1.15), 1.42, 1.55, 0.9);                         // raised air-intake ridge
  P.decal('hull', 'soot', null, 0.6, [1.6, 1.05, 2.2], Math.PI / 2);            // exhaust staining
  // rear: vertical back plate with the CLAMSHELL troop door outline (§21.5)
  P.add('hull', box(3.0, 0.95, 0.1), 0, 0.95, -3.72);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.55, 0.82, 0.05), s * 0.31, 0.92, -3.78);                // door halves proud
    P.add('hullDetail', box(0.06, 0.10, 0.08), s * 0.58, 1.22, -3.79);          // hinge blocks
  }
  P.add('hullDark', box(0.035, 0.82, 0.06), 0, 0.92, -3.795);                   // split seam
  P.add('hullDark', box(1.1, 0.035, 0.06), 0, 0.53, -3.795);                    // sill seam
  P.add('hullDark', box(0.15, 0.08, 0.05), -1.25, 1.35, -3.78);                 // taillight
  // driver hatch front-LEFT on the roof plane + periscopes
  P.add('hull', box(0.55, 0.05, 0.6), -0.72, 1.54, 1.45, 0, 0, 0.12);
  periscope(P, 'hullDetail', -0.72, 1.60, 1.05);
  periscope(P, 'hullDetail', -0.45, 1.58, 1.05);
  headlight(P, -1.5, 1.14, 3.42, -0.25, 0.05);
  headlight(P, 1.5, 1.14, 3.42, -0.25, 0.05);
  towCable(P, [[-1.2, 1.0, 3.3], [0, 1.1, 3.55], [1.2, 1.0, 3.3]]);
  liftEye(P, 'hullDetail', -1.3, 1.52, -2.6);
  liftEye(P, 'hullDetail', 1.3, 1.52, -2.6);
  // skirts of overlapping angled slats + chunky mud flaps (§21.5)
  // tank_models r2 (critic major: "real Merkava wears side skirts covering
  // the gear" — they were ABSENT): the slat panels sat at x ±1.84 while the
  // running gear's track outer edge runs to ±1.90 (xc 1.58 + 0.64/2), so the
  // whole skirt run was buried INSIDE the track band and never rendered.
  // Pushed outboard of the gear, deepened, with a dark rubber lower fringe.
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const z = 2.95 - k * 1.02;
      P.add('hull', box(0.05, 0.56, 1.06), s * (1.955 + (k % 2) * 0.03), 0.86, z, 0, s * 0.05, -s * 0.06);
      P.add('hullRubber', box(0.04, 0.14, 1.0), s * (1.955 + (k % 2) * 0.03), 0.54, z, 0, s * 0.05, -s * 0.06);
    }
    P.add('hullRubber', box(0.55, 0.4, 0.035), s * 1.5, 0.55, 3.62, -0.15, 0, 0);
    P.add('hullRubber', box(0.55, 0.36, 0.035), s * 1.5, 0.52, -3.66, 0.15, 0, 0);
    // external coil-spring BOGIE pairs (Horstmann-style — §21.5 unique):
    // bracket + two visible vertical coil drums per station pair
    for (const zc of [2.15, -0.05, -2.0]) {
      P.add('hullDetail', box(0.20, 0.30, 1.35), s * 1.30, 0.62, zc);           // bogie bracket
      P.add('hullDark', cylY(0.085, 0.085, 0.34, 10), s * 1.38, 0.72, zc - 0.32);
      P.add('hullDark', cylY(0.085, 0.085, 0.34, 10), s * 1.38, 0.72, zc + 0.32);
      P.add('hullDetail', cylY(0.10, 0.10, 0.05, 10), s * 1.38, 0.93, zc - 0.32); // spring caps
      P.add('hullDetail', cylY(0.10, 0.10, 0.05, 10), s * 1.38, 0.93, zc + 0.32);
    }
  }
  // turret: the ARROWHEAD — small frontal cross-section widening rearward in
  // flat diamond facets, long tail bustle (§21.5)
  // tank_models r1 (critic: "undersized generic turret"): plan-form audit vs
  // §21.5 — the arrowhead scales to ~2.57 m wide x 3.1 m long (real Merkava
  // IVm turret dominates the hull), walls taller; roof kit repositioned with
  // it below.
  P.add('turret', KIT.polyTurret([
    [0.19, 1.56], [0.78, 0.85], [1.285, -0.18], [1.07, -1.12], [0.57, -1.56],
    [-0.57, -1.56], [-1.07, -1.12], [-1.285, -0.18], [-0.78, 0.85], [-0.19, 1.56],
  ], 0.86, 1.04, 0.74), 0, 0, 0);
  const MKH = 0.86;
  // NO exposed mantlet: gun pokes from a narrow V-notch (§21.5)
  P.add('turret', box(0.44, 0.50, 0.38), 0, 0.24, 1.24);                        // notch closer plate
  P.add('turretDark', box(0.50, 0.38, 0.05), 0, 0.24, 1.44);                    // notch shadow
  // Trophy APS: flat angled slab boxes each side with vent lines + radar
  // squares at the corners (§21.5)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.16, 0.50, 1.25), s * 1.26, 0.32, -0.72, 0, -s * 0.12, 0);
    for (let k = 0; k < 3; k++) {
      P.add('turretDark', box(0.17, 0.03, 1.0), s * 1.27, 0.18 + k * 0.15, -0.72, 0, -s * 0.12, 0);
    }
    P.add('turretDark', box(0.03, 0.20, 0.20), s * 1.16, 0.36, 0.36, 0, s * 0.35, 0);   // fwd radar face
    P.add('turretGlass', box(0.012, 0.16, 0.16), s * 1.185, 0.36, 0.37, 0, s * 0.35, 0);
    P.add('turretDark', box(0.03, 0.20, 0.20), s * 1.13, 0.36, -1.52, 0, -s * 0.35, 0); // rear radar face
  }
  // signature ball-and-chain curtain along the bustle underside (§21.5)
  P.add('turret', box(1.60, 0.34, 0.75), 0, 0.18, -1.80);                       // tail bustle box
  // signature ball-and-chain curtain (§21.5) — r1: enlarged + densified so it
  // actually reads as the Merkava's fringe at garage distance
  P.add('turretDetail', box(1.72, 0.05, 0.05), 0, 0.02, -2.18);                 // chain rail
  for (let k = 0; k < 17; k++) {
    const x = -0.80 + k * 0.10;
    P.add('turretDark', cylY(0.010, 0.010, 0.20, 6), x, -0.09, -2.20);
    P.add('turretDark', sph(0.042, 8), x, -0.22, -2.20);
  }
  // roof set: Rafael pano sight center-roof, gunner sight brow right-front,
  // 12.7 mm over the gun, 60 mm mortar hatch left (§21.5)
  P.add('turretDetail', cylY(0.07, 0.085, 0.18, 10), 0.24, MKH + 0.09, -0.55);  // pano pedestal
  P.add('turretDark', box(0.24, 0.24, 0.24), 0.24, MKH + 0.30, -0.55);          // pano head
  P.add('turretGlass', box(0.15, 0.11, 0.02), 0.24, MKH + 0.31, -0.42);
  P.addEquipment('turret', box(0.36, 0.22, 0.34), 0.46, MKH + 0.06, 0.42);               // gunner sight box
  P.add('turretDark', box(0.28, 0.14, 0.04), 0.46, MKH + 0.08, 0.60);
  P.add('turretGlass', box(0.22, 0.09, 0.02), 0.46, MKH + 0.08, 0.625);
  P.add('turretDark', box(0.09, 0.11, 0.44), 0.10, MKH + 0.16, 0.62);           // .50cal receiver
  P.add('turretDark', cylZ(0.022, 0.55, 8), 0.10, MKH + 0.16, 1.10);            // .50cal barrel
  P.add('turretDetail', box(0.10, 0.13, 0.18), -0.08, MKH + 0.13, 0.55);        // ammo box
  P.add('turret', cylY(0.14, 0.14, 0.05, 12), -0.52, MKH - 0.04, 0.10);         // 60 mm mortar hatch
  P.add('turretDark', torus(0.14, 0.012, 12), -0.52, MKH - 0.02, 0.10);
  // hatches: commander right / loader left
  P.add('turret', cylY(0.23, 0.23, 0.045, 14), 0.48, MKH - 0.06, -0.62);
  P.add('turret', cylY(0.21, 0.21, 0.045, 14), -0.50, MKH - 0.05, -0.55);
  P.add('turretDetail', box(0.03, 0.55, 0.03), -0.85, MKH + 0.18, -1.1, 0, 0, 0.12); // antenna L
  P.add('turretDetail', box(0.03, 0.5, 0.03), 0.85, MKH + 0.16, -1.15, 0, 0, -0.1);  // antenna R
  // stowage baskets across the full turret rear (§21.5) + IDF clutter
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.04, 0.04, 0.9), s * 1.16, 0.46, -1.55);
    P.add('turretDetail', box(0.04, 0.04, 0.9), s * 1.16, 0.12, -1.55);
    for (let k = 0; k < 4; k++) P.add('turretDetail', box(0.03, 0.34, 0.03), s * 1.16, 0.29, -1.2 - k * 0.25);
    stowage(P, 'turretCloth', rng, [[s * 1.05, 0.35, -1.55, 0.2, 0.3, 0.8]]);
  }
  stowage(P, 'turretCloth', rng, [[0, 0.44, -1.85, 1.25, 0.26, 0.5]]);
  tarpRoll(P, 'turretCloth', -0.35, 0.56, -1.70, 0.9, 0.09, true);
  smokeCluster(P, 0.88, 0.32, 1.02, 4, 0.95, 0.6);                              // CL-3030 launchers
  smokeCluster(P, -0.88, 0.32, 1.02, 4, -0.95, 0.6);
  // MG253 L/44: sleeve + evacuator NEAR THE MANTLET (§21.1 — evac at 28%)
  buildGun(P, { len: 5.3, r: 0.080, sleeve: true, evac: 0.28, baseR: 0.14 });
  // 6 large wheels, 5 return rollers, sprocket FRONT (front engine — §21.5)
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.37, wheelW: 0.22, xc: 1.58,
    wheelZs: [2.62, 1.60, 0.68, -0.36, -1.44, -2.52],
    sprocket: { z: 3.32, y: 0.52, r: 0.31 }, idler: { z: -3.28, y: 0.48, r: 0.28 },
    rollers: [2.2, 1.1, 0.05, -1.1, -2.2].map((z) => ({ z, y: 0.88, r: 0.08 })),
    trackW: 0.64, topY: 0.92, paintedEnds: true, coveredTop: 1.0,
  });
  for (const s of [-1, 1]) {                                                    // sponson gap covers (r1 zipper)
    P.add('hullShadow', new THREE.BoxGeometry(0.34, 0.03, 6.8), s * 1.68, 1.07, -0.05);
  }
  // white unit stencils on the slat skirts (§21.5 paint paragraph)
  P.decal('hull', 'number', '11', 0.34, [1.90, 0.84, 1.2], Math.PI / 2);
  P.decal('hull', 'number', '11', 0.34, [-1.90, 0.84, 1.2], -Math.PI / 2);
  P.decal('turret', 'number', '4', 0.30, [0.92, 0.35, -0.7], Math.PI / 2, 0, 0.12);
  P.topY = 0.95;
}

// ---------------------------------------------------------------------------
// Leopard 2A6 — §8.5: the shipped 2A7 family base MINUS the A7 kit (no roof
// RWS, no bustle climate/APU clutter) — wedge cheeks + the long L/55 stay.
// PERI R17 on the LEFT roof, crosswind mast rear RIGHT. Bundeswehr cross +
// 2-digit tactical number.
// ---------------------------------------------------------------------------
function buildLeo2A6(P) {
  const { box, cylX, cylY, cylZ, slab, frustum, fenders, headlight, liftEye,
    periscope, smokeCluster, towCable, stowage, jerryCan, tarpRoll, ammoCan,
    spareTrackStrip, buildGun, buildRunningGear, torus } = KIT;
  const { rng } = P;
  // ---- hull: 2A7 family base (mirrors the shipped buildLeo2A7 hull) ----
  P.add('hull', box(2.48, 0.58, 7.5), 0, 0.79, 0);
  P.add('hull', box(3.40, 0.42, 4.66), 0, 1.51, -1.38);
  fenders(P, 1.25, 1.88, 1.29, -3.72, 3.6, 0.035);
  P.add('hull', frustum(1.72, 3.83, 1.0, 1.72, 1.00, 1.0, 1.0, 1.72));          // sharp glacis
  P.add('hull', frustum(1.72, 3.45, 3.55, 1.72, 3.83, 3.55, 0.5, 1.0));
  P.add('hull', box(3.1, 0.52, 0.12), 0, 1.46, -3.70);                          // rear plate
  // rear deck: twin cooling fans + radiator louver + exhaust louvres
  for (const s of [-1, 1]) {
    P.add('hullDark', cylY(0.40, 0.40, 0.025, P.q ? 28 : 14), s * 0.80, 1.725, -2.55);
    P.add('hullDetail', torus(0.40, 0.035, P.q ? 26 : 14), s * 0.80, 1.735, -2.55);
    P.add('hullDetail', torus(0.24, 0.02, P.q ? 22 : 12), s * 0.80, 1.732, -2.55); // inner ring
    P.add('hullDetail', cylY(0.07, 0.08, 0.05, 10), s * 0.80, 1.74, -2.55);        // hub cap
    P.add('hullDetail', box(0.76, 0.02, 0.05), s * 0.80, 1.74, -2.55);
    P.add('hullDetail', box(0.05, 0.02, 0.76), s * 0.80, 1.74, -2.55);
    for (let k = 0; k < 5; k++) {
      P.add('hullDetail', box(0.66 - Math.abs(k - 2) * 0.14, 0.018, 0.05),
        s * 0.80, 1.737, -2.75 + k * 0.10);
    }
    P.add('hullDark', box(0.7, 0.4, 0.04), s * 0.95, 1.15, -3.78);
    for (let k = 0; k < 4; k++) {
      P.add('hullDetail', box(0.7, 0.05, 0.05), s * 0.95, 1.0 + k * 0.11, -3.795);
    }
    for (const zc of [-2.0, -1.15, -0.35]) {
      P.add('hullDetail', cylY(0.10, 0.10, 0.028, 12), s * 1.44, 1.728, zc);
      P.add('hullDark', torus(0.10, 0.012, 12), s * 1.44, 1.733, zc);
    }
    for (const off of [-0.08, 0.08]) {
      P.add('hullDetail', box(0.05, 0.24, 0.14), s * 1.12 + off, 0.98, -3.82);
    }
    P.add('hullDetail', cylX(0.034, 0.26, 8), s * 1.12, 1.0, -3.87);
    P.add('hullDark', box(0.16, 0.09, 0.05), s * 1.38, 1.32, -3.775);           // taillights
    P.add('hullRubber', box(0.56, 0.34, 0.03), s * 1.5, 0.52, -3.86, 0.12, 0, 0);
  }
  P.add('hullDark', box(2.9, 0.022, 0.56), 0, 1.717, -3.32);
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(2.74, 0.032, 0.07), 0, 1.732, -3.52 + k * 0.10);
  for (const s of [-1, 1]) {
    P.add('hullShadow', new THREE.BoxGeometry(0.5, 0.026, 7.0), s * 1.5, 1.27, 0);
  }
  // skirts: heavy sculpted front third + recessed rubber aft (family base)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.10, 0.62, 3.25), s * 1.85, 0.99, 2.18);
    P.add('hull', box(0.10, 0.14, 3.2), s * 1.85, 0.64, 2.18, 0, 0, -s * 0.28);
    if (P.q) for (let k = 0; k < 4; k++) {
      P.add('hullDark', box(0.104, 0.56, 0.016), s * 1.85, 0.99, 3.6 - k * 0.8);
    }
    P.add('hull', box(0.035, 0.55, 3.42), s * 1.865, 0.94, -1.28);
    P.add('hullRubber', box(0.028, 0.12, 3.4), s * 1.865, 0.63, -1.28);
    for (let k = 0; k < 4; k++) {
      P.add('hullDark', box(0.042, 0.5, 0.02), s * 1.865, 0.94, -0.3 - k * 0.7);
    }
  }
  towCable(P, [[-1.3, 1.6, -3.4], [0, 1.7, -3.7], [1.3, 1.6, -3.4]]);
  headlight(P, -1.3, 0.92, 3.68, -0.35);
  headlight(P, 1.3, 0.92, 3.68, -0.35);
  liftEye(P, 'hullDetail', -1.4, 1.75, -0.5);
  liftEye(P, 'hullDetail', 1.4, 1.75, -0.5);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(1.05, 0.045, 0.07), s * 0.47, 1.46, 2.15, -0.25, s * 0.42, 0);
    P.add('hullDetail', cylY(0.085, 0.085, 0.03, 12), s * 1.28, 1.735, 0.2);    // filler caps
  }
  P.add('hullDark', box(0.02, 0.012, 2.7), -1.7, 1.53, 2.35, -0.25, 0, 0);      // weld seams
  P.add('hullDark', box(0.02, 0.012, 2.7), 1.7, 1.53, 2.35, -0.25, 0, 0);
  P.add('hull', cylY(0.30, 0.30, 0.035, P.q ? 22 : 12), 0.62, 1.74, 0.72);      // driver hatch
  P.add('hullDark', torus(0.30, 0.015, P.q ? 22 : 12), 0.62, 1.745, 0.72);
  periscope(P, 'hullDetail', 0.40, 1.76, 1.05);
  periscope(P, 'hullDetail', 0.62, 1.76, 1.08);
  periscope(P, 'hullDetail', 0.84, 1.76, 1.05, 0.3);
  towCable(P, [[-1.15, 1.42, 2.5], [0, 1.56, 1.7], [1.15, 1.42, 2.5]]);
  // ---- turret: 2A7 wedge family — flat-roofed box + two-tier spaced wedges
  const LTW = 1.22, LTH = 0.88;
  P.add('turret', frustum(LTW, 0.62, -2.05, LTW * 0.94, 0.55, -2.02, 0.0, LTH));
  P.add('turret', slab(                                                          // R wedge, apex tier
    [0.04, 0.08, 1.52], [1.30, 0.08, 0.14], [1.30, 0.08, -0.02], [0.04, 0.08, 1.36],
    [0.04, 0.22, 1.43], [1.30, 0.22, 0.05], [1.30, 0.22, -0.11], [0.04, 0.22, 1.27]));
  P.add('turret', slab(                                                          // R wedge, upper tier
    [0.34, 0.22, 1.10], [1.30, 0.22, 0.05], [1.30, 0.22, -0.11], [0.34, 0.22, 0.94],
    [0.34, 0.90, 0.67], [1.30, 0.90, -0.38], [1.30, 0.90, -0.54], [0.34, 0.90, 0.51]));
  P.add('turret', slab(                                                          // L wedge, apex tier
    [-1.30, 0.08, 0.14], [-0.04, 0.08, 1.52], [-0.04, 0.08, 1.36], [-1.30, 0.08, -0.02],
    [-1.30, 0.22, 0.05], [-0.04, 0.22, 1.43], [-0.04, 0.22, 1.27], [-1.30, 0.22, -0.11]));
  P.add('turret', slab(                                                          // L wedge, upper tier
    [-1.30, 0.22, 0.05], [-0.34, 0.22, 1.10], [-0.34, 0.22, 0.94], [-1.30, 0.22, -0.11],
    [-1.30, 0.90, -0.38], [-0.34, 0.90, 0.67], [-0.34, 0.90, 0.51], [-1.30, 0.90, -0.54]));
  for (const s of [-1, 1]) {                                                    // wedge furniture
    P.add('turretDark', box(0.78, 0.035, 0.035), s * 0.80, 0.40, 0.50, -0.5, s * 0.83, 0);
    P.add('turret', box(0.09, 0.05, 0.12), s * 0.62, 0.80, 0.50, -0.5, s * 0.83, 0);
    P.add('turret', box(0.09, 0.05, 0.12), s * 1.08, 0.80, 0.02, -0.5, s * 0.83, 0);
  }
  P.add('turretDark', slab(                                                      // spaced-gap AO R
    [0.30, 0.38, 0.87], [1.24, 0.38, -0.16], [1.24, 0.38, -0.24], [0.30, 0.38, 0.79],
    [0.30, 0.86, 0.55], [1.24, 0.86, -0.48], [1.24, 0.86, -0.56], [0.30, 0.86, 0.47]));
  P.add('turretDark', slab(                                                      // spaced-gap AO L
    [-1.24, 0.38, -0.16], [-0.30, 0.38, 0.87], [-0.30, 0.38, 0.79], [-1.24, 0.38, -0.24],
    [-1.24, 0.86, -0.48], [-0.30, 0.86, 0.55], [-0.30, 0.86, 0.47], [-1.24, 0.86, -0.56]));
  P.add('turret', box(0.72, 0.56, 0.06), 0, 0.36, 0.60);                        // mantlet slot back wall
  // EMES 15 recessed into the right wedge roof edge (family weak spot)
  P.add('turretDark', box(0.62, 0.20, 0.52), 0.74, 0.84, 0.52);
  P.add('turret', box(0.50, 0.24, 0.40), 0.74, 0.88, 0.50);
  P.add('turretDetail', box(0.54, 0.05, 0.44), 0.74, 1.025, 0.48);
  P.add('turretDark', box(0.38, 0.16, 0.04), 0.74, 0.88, 0.715);
  P.add('turretGlass', box(0.30, 0.10, 0.02), 0.74, 0.88, 0.74);
  // PERI R17 panoramic periscope on the LEFT roof (§8.5 — A7 carries it right)
  P.add('turretDetail', cylY(0.055, 0.065, 0.30, 12), -0.42, LTH + 0.15, -1.05);
  P.add('turretDetail', cylY(0.08, 0.08, 0.07, 12), -0.42, LTH + 0.33, -1.05);
  P.add('turretDark', box(0.18, 0.20, 0.20), -0.42, LTH + 0.46, -1.05);
  P.add('turretGlass', box(0.12, 0.11, 0.02), -0.42, LTH + 0.48, -0.945);
  // hatches: commander right (ahead), loader left
  P.add('turret', cylY(0.24, 0.24, 0.045, 14), 0.62, LTH + 0.02, -0.72);
  P.add('turret', cylY(0.22, 0.22, 0.045, 14), -0.68, LTH + 0.02, -0.55);
  periscope(P, 'turretDetail', 0.62, LTH + 0.06, -0.38);
  liftEye(P, 'turretDetail', -1.08, LTH + 0.03, 0.05);
  liftEye(P, 'turretDetail', 1.08, LTH + 0.03, -0.6);
  // NO FLW 200 RWS, NO climate/APU boxes — the clean A6 roof (§8.5).
  // simple rear stowage rail + baskets instead of the A7 full-width rack
  const lrkT = 0.66, lrkB = 0.14, lrkZ = -2.55;
  P.add('turretDetail', box(2 * LTW - 0.2, 0.05, 0.05), 0, lrkT, lrkZ);
  P.add('turretDetail', box(2 * LTW - 0.2, 0.05, 0.05), 0, lrkB, lrkZ);
  for (let k = 0; k < 11; k++) {
    P.add('turretDetail', box(0.035, lrkT - lrkB, 0.035), -LTW + 0.13 + k * 0.22, (lrkT + lrkB) / 2, lrkZ);
  }
  P.add('turretDark', box(2 * LTW - 0.3, 0.02, 0.4), 0, lrkB + 0.03, -2.35);
  stowage(P, 'turretCloth', rng, [
    [-0.7, 0.38, -2.32, 0.7, 0.4, 0.38], [0.35, 0.34, -2.34, 0.6, 0.34, 0.36],
  ]);
  jerryCan(P, 'turretCloth', -1.15, 0.36, -2.35, 0.15);
  tarpRoll(P, 'turretCloth', 0.85, 0.52, -2.32, 0.9, 0.10, true);
  ammoCan(P, 'turretDark', 1.15, 0.32, -2.36, 0.22);
  spareTrackStrip(P, 'turret', -0.35, 0.56, -2.35, 2, 0, 0);
  for (const s of [-1, 1]) {                                                    // side mesh baskets
    P.add('turretDetail', box(0.05, 0.05, 1.35), s * (LTW + 0.12), 0.62, -1.32);
    P.add('turretDetail', box(0.05, 0.05, 1.35), s * (LTW + 0.12), 0.20, -1.32);
    for (let k = 0; k < 6; k++) {
      P.add('turretDetail', box(0.03, 0.42, 0.03), s * (LTW + 0.12), 0.41, -0.72 - k * 0.24);
    }
    stowage(P, 'turretCloth', rng, [[s * (LTW + 0.05), 0.40, -1.3, 0.16, 0.3, 1.05]]);
  }
  // 2x8 smoke dischargers in curved rows on the rear sides (family kit)
  // r1: banks lifted clear of the basket stowage on a visible mount plate
  // (mirror of the buildLeo2A7 fix — "missing 2x8 smoke rows" critique)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.06, 0.30, 0.72), s * (LTW + 0.05), 0.62, -1.42, 0, s * 0.28, 0);
    smokeCluster(P, s * (LTW + 0.10), 0.74, -1.24, 4, s * 1.05, 0.9);
    smokeCluster(P, s * (LTW + 0.12), 0.56, -1.44, 4, s * 1.2, 0.9);
  }
  // crosswind mast rear RIGHT (§8.5 — mirrored from the A7), antenna left
  P.add('turretDetail', box(0.03, 0.45, 0.03), 1.02, LTH + 0.3, -1.9);
  P.add('turretDetail', box(0.03, 0.55, 0.03), -1.02, LTH + 0.32, -1.95, 0, 0, -0.1);
  // flat plate mantlet in the arrow notch + the LONG Rh-120 L/55
  P.addGunExtra(box(0.56, 0.46, 0.30), 0, 0.02, 0.52);
  P.addGunExtra(box(0.84, 0.34, 0.16), 0, 0, 0.32);
  P.addGunExtra(cylZ(0.13, 0.3, 12, 0.155), 0, 0, 0.72);
  buildGun(P, { len: 6.6, r: 0.079, sleeve: true, evac: 0.62, collar: true, baseR: 0.16 });
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.35, wheelW: 0.22, xc: 1.55,
    wheelZs: [2.95, 2.0, 1.25, 0.28, -0.69, -1.66, -2.63],
    sprocket: { z: -3.5, y: 0.46, r: 0.34 }, idler: { z: 3.45, y: 0.44, r: 0.32 },
    trackW: 0.635, topY: 0.92, paintedEnds: true, coveredTop: true,
  });
  // Bundeswehr iron cross on the turret sides + 2-digit tactical number
  P.decal('turret', 'crossgrey', null, 0.38, [1.23, 0.44, -0.22], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.38, [-1.23, 0.44, -0.22], -Math.PI / 2);
  P.decal('turret', 'number', '24', 0.32, [1.23, 0.40, -1.05], Math.PI / 2);
  P.decal('turret', 'number', '24', 0.32, [-1.23, 0.40, -1.05], -Math.PI / 2);
  // r1: Y-plate moved off the engine deck onto the vertical hull rear plate
  P.decal('hull', 'number', 'Y-224', 0.30, [0.62, 1.44, -3.775], Math.PI, 0);
  P.decal('hull', 'number', 'Y-224', 0.26, [-1.05, 0.72, 3.79], 0, -0.35);
  P.topY = 1.08;
}

/** Builder table merged into tankFactory.BUILDERS by the extension hook. */
export const MODERN1_BUILDERS = {
  t72b3: buildT72B3,
  merkava4: buildMerkava4,
  leo2a6: buildLeo2A6,
};
