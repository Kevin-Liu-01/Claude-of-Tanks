// src/vehicles/modern1.ts — spec row of the first modern MBT roster wave.
// Vehicle: leo2a6 (Leopard 2A6). The T-72B3 and Merkava IVm rows this pack
// used to register as delisted family donors moved to donorSpecs.ts on
// 2026-09-23 (hidden-fleet cleanup). Specs per docs/history/research/modern-roster.md §8.
// challenger2/challenger_3 moved to profiles/challenger.ts (§5.75 family-module
// split). The canonical builders left on 2026-10-01: the Leopard family
// profile owns leo2a6 in every factory, and the t72b3/merkava4 donors were
// never playable rows.
//
// Registration pattern: MODERN1_SPECS below is the source
// tools/gen-legacy-fleet-specs.mjs serializes; the registry holds the
// generated metadata (modern1Specs.generated.ts, imported below), never these
// live rows, on every path. tankFactory.ts imports this module for that
// registration at its historical catalog position.

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
} from './specHelpers.ts';
// Spec rows register from their generated metadata whichever facade
// evaluates this file (fleetRegistration.ts: live rows may share vertices).
import './modern1Specs.generated.ts';
import type { ArmorEnvelope } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';

const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };

// ---------------------------------------------------------------------------
// Armor models (plate-by-plate, roster RHAe tables)
// ---------------------------------------------------------------------------

// Leopard 2A6 — §8.2: geometry identical to the shipped 2A7 armor model with
// the roster's 2A6 RHAe values (turret ~700/1000, hull ~620/750).
function armorLeo2A6(): ArmorEnvelope {
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
// Specs (stats per roster §14.3-4 / §18.3-4 / §21.3-4 / §8.3-4); the
// generator's source, the registry holds modern1Specs.generated.ts.
// ---------------------------------------------------------------------------
export const MODERN1_SPECS = {
  leo2a6: {
    id: 'leo2a6', name: 'Leopard 2A4', nation: 'Germany', era: 'modern', role: 'mbt',
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
} satisfies Record<string, FleetTankSpec>;
