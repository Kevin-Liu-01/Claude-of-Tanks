// src/vehicles/specs.js — pure gameplay stat and armor data for the registered fleet.
// PURE data module: no three import, no side effects. Runs under plain node.
// Sources: docs/research/tank-roster.md (+ locked overrides in docs/ARCHITECTURE.md §3.3.1).
// Units per ARCHITECTURE §1.2 — suffixed fields keep human units; consumers convert.

import { tankLabelRecord } from './tankLabels.js';
import { vehicleMarkingRecord } from './vehicleMarkings.js';
import {
  DEV_FLEET_ACTIVE,
  DEV_FLEET_LABEL,
  RETIRED_EXTERNAL_PLACEHOLDER_IDS,
  developmentOnlyReason,
  isProductionHiddenTankId,
  isRetiredHistoricalTank,
} from './rosterPolicy.js';
import { FIRST_PARTY_VEHICLE_AUTHORSHIP } from '../authorship.ts';
import { applyVehicleTaxonomy } from './taxonomy.ts';
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
  communityArmor,
} from './specHelpers.js';

/** Foundational roster ids in their locked relative garage-carousel order. */
// leo2a7 REMOVED from the roster BY OWNER 2026-08-06 ('remove the leopard
// 2a7 and fully focus on the 2a7v') — its TANK_SPECS row STAYS as the
// leo2_revolution make() donor (userdrops5); it just never enters
// TANK_IDS/ALL_TANK_IDS, so no garage card, no ledger row.
export const TANK_IDS = ['m4a3e8', 'tiger1', 't34_85', 'is2', 'panther_g', 'm1a2', 't90m', 't90m_proryv'];


// controls_gunnery r2: afterShot 4/3 → 2.8/2.2 with the movement.js LN6
// shrink tau so a second aimed shot is possible ~2.3 s (modern) / ~3.5 s
// (WW2) after firing — the old pair needed ~4.6 s on an M1A2.
const BLOOM_WW2 = { move: 0.20, hullRot: 0.20, turret: 0.12, afterShot: 2.8 };
const BLOOM_MODERN = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };

// ---------------------------------------------------------------------------
// M4A3E8 Sherman "Easy Eight"
// ---------------------------------------------------------------------------
function armorM4() {
  // r4: roofY raised 1.93 -> 2.02 with the visual sponson (roster: the
  // tallest-proportioned WWII tank; height ~= hull length x 0.47)
  // tank_models r7: +8% again (2.02 -> 2.18) with the visual — the E8 still
  // read long-and-low next to the roster doc's proportions.
  const hw = 1.5, inW = 0.92, roofY = 2.18, trkTop = 1.10, floor = 0.43;
  return {
    boundingRadiusM: 4.1,
    turretPivot: [0, 2.18, 0.4],
    gunPivot: [0, 0.35, 0.55],
    // shadow-proxy true-up (m4a3e8.md residual): the built visible run is
    // 3.44 — the old 3.96 proxy overhung the muzzle (stale-proxy class).
    gunBarrel: { lengthM: 3.44, radiusM: 0.07 },
    hullPlates: [
      fr('upper_glacis', 63.5, 1.45, 1.0, 3.10, roofY, 2.10),          // 47 deg
      fr('lower_front', 89, 1.45, floor, 2.75, 1.0, 3.10),             // cast transmission nose
      sR('hull_side_upper_R', 38, hw, trkTop, hw, roofY, -3.13, 3.0),
      sL('hull_side_upper_L', 38, hw, trkTop, hw, roofY, -3.13, 3.0),
      sR('hull_side_lower_R', 38, inW, floor, inW, trkTop, -3.0, 2.9),
      sL('hull_side_lower_L', 38, inW, floor, inW, trkTop, -3.0, 2.9),
      sR('track_R', 20, 1.35, 0.15, 1.35, trkTop, -3.1, 3.1, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, 1.35, 0.15, 1.35, trkTop, -3.1, 3.1, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 38, 1.45, 0.5, -2.88, roofY, -3.13),             // 10 deg
      rf('hull_roof', 25, 1.45, roofY, -3.13, 2.10),
    ],
    turretPlates: [
      fr('turret_front', 63.5, 0.5, 0.05, 0.72, 0.62, 0.66),
      chR('turret_cheek_R', 63.5, 0.5, 0.72, 0.85, 0.30, 0.05, 0.62),
      chL('turret_cheek_L', 63.5, 0.5, 0.72, 0.85, 0.30, 0.05, 0.62),
      sR('turret_side_R', 63.5, 0.85, 0.02, 0.80, 0.66, -0.95, 0.30),
      sL('turret_side_L', 63.5, 0.85, 0.02, 0.80, 0.66, -0.95, 0.30),
      rr('turret_rear', 63.5, 0.72, 0.05, -1.0, 0.62, -1.05),
      rf('turret_roof', 25, 0.85, 0.70, -1.0, 0.6),
      par('mantlet', 89, [-0.65, 0.08, 0.86], [0.65, 0.08, 0.86], [-0.65, 0.62, 0.82],
        { kind: 'spaced', gunFollow: true }),
    ],
    modules: [
      mbox('engine', [-0.85, 0.5, -3.0], [0.85, 1.7, -1.6]),
      mbox('fuelTank', [-0.9, 0.5, -1.55], [0.9, 1.2, -0.9]),
      mbox('ammoRack', [-0.9, 0.5, -0.6], [0.9, 1.0, 0.9]),
      mbox('turretRing', [-0.8, 1.75, -0.45], [0.8, 1.95, 1.25]),
      mbox('radio', [0.2, 1.1, 1.7], [0.8, 1.6, 2.4]),
      mbox('optics', [0.15, 0.62, 0.15], [0.5, 0.85, 0.55], true),
      mbox('gun', [-0.15, 0.15, -0.3], [0.15, 0.55, 0.55], true),
      mbox('trackL', [-1.5, 0.0, -3.1], [-0.92, trkTop, 3.1]),
      mbox('trackR', [0.92, 0.0, -3.1], [1.5, trkTop, 3.1]),
    ],
    crew: [
      cbox('driver', [-0.85, 0.7, 1.6], [-0.15, 1.6, 2.6]),
      cbox('gunner', [0.15, 0.05, 0.0], [0.68, 0.62, 0.55], true),
      cbox('commander', [0.15, 0.05, -0.65], [0.72, 0.68, -0.05], true),
      cbox('loader', [-0.68, 0.05, -0.35], [-0.12, 0.62, 0.4], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// Tiger I
// ---------------------------------------------------------------------------
function armorTiger() {
  const hw = 1.855, inW = 1.13, roofY = 1.96, trkTop = 1.15, floor = 0.47;
  return {
    boundingRadiusM: 4.55,
    turretPivot: [0, 1.96, 0.25],
    gunPivot: [0, 0.40, 0.55],
    gunBarrel: { lengthM: 4.5, radiusM: 0.085 },
    hullPlates: [
      fr('lower_front', 100, 1.5, floor, 2.92, 1.0, 3.16),             // 24 deg
      fr('driver_plate', 100, 1.5, 1.0, 3.16, roofY, 3.01),            // ~9 deg
      sR('hull_side_upper_R', 80, hw, 1.05, hw, roofY, -3.16, 3.01),
      sL('hull_side_upper_L', 80, hw, 1.05, hw, roofY, -3.16, 3.01),
      sR('hull_side_lower_R', 60, inW, floor, inW, trkTop, -3.05, 2.95),
      sL('hull_side_lower_L', 60, inW, floor, inW, trkTop, -3.05, 2.95),
      sR('track_R', 20, 1.49, 0.15, 1.49, trkTop, -3.16, 3.1, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, 1.49, 0.15, 1.49, trkTop, -3.16, 3.1, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 80, 1.5, 0.6, -2.97, roofY, -3.16),              // 8 deg
      rf('hull_roof', 30, 1.7, roofY, -3.16, 3.01),
    ],
    turretPlates: [
      fr('turret_front', 100, 1.15, 0.02, 0.64, 0.80, 0.64),           // vertical slab
      sR('turret_side_R', 80, 1.26, 0.02, 1.26, 0.80, -1.1, 0.62),
      sL('turret_side_L', 80, 1.26, 0.02, 1.26, 0.80, -1.1, 0.62),
      rr('turret_rear', 80, 1.2, 0.02, -1.72, 0.80, -1.78),
      rf('turret_roof', 30, 1.26, 0.84, -1.78, 0.62),
      par('mantlet', 120, [-1.05, 0.06, 0.9], [1.05, 0.06, 0.9], [-1.05, 0.74, 0.88],
        { kind: 'spaced', gunFollow: true }),
    ],
    modules: [
      mbox('engine', [-0.95, 0.5, -3.0], [0.95, 1.8, -1.5]),
      mbox('fuelTank', [-1.05, 0.5, -1.45], [1.05, 1.3, -0.8]),
      mbox('ammoRack', [-1.6, 0.6, -0.3], [1.6, 1.15, 1.4]),           // sponson racks
      mbox('turretRing', [-0.85, 1.78, -0.65], [0.85, 1.98, 1.15]),
      mbox('radio', [0.3, 1.2, 2.0], [1.0, 1.8, 2.9]),
      mbox('optics', [0.15, 0.66, 0.2], [0.5, 0.9, 0.6], true),
      mbox('gun', [-0.16, 0.18, -0.35], [0.16, 0.62, 0.6], true),
      mbox('trackL', [-1.855, 0.0, -3.16], [-1.13, trkTop, 3.16]),
      mbox('trackR', [1.13, 0.0, -3.16], [1.855, trkTop, 3.16]),
    ],
    crew: [
      cbox('driver', [-1.0, 0.7, 1.9], [-0.25, 1.7, 2.95]),
      cbox('gunner', [-0.72, 0.05, 0.0], [-0.15, 0.65, 0.6], true),
      cbox('commander', [-0.75, 0.05, -0.7], [-0.15, 0.72, -0.1], true),
      cbox('loader', [0.15, 0.05, -0.3], [0.72, 0.65, 0.45], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// T-34-85
// ---------------------------------------------------------------------------
function armorT34() {
  const trkTop = 1.05, floor = 0.4, roofY = 1.70;
  return {
    boundingRadiusM: 4.35,
    turretPivot: [0, 1.70, 0.55],
    gunPivot: [0, 0.35, 0.5],
    // shadow-proxy true-up (t34_85.md residual): the built visible run is
    // 4.00 — the old 4.64 proxy overhung the muzzle (stale-proxy class).
    gunBarrel: { lengthM: 4.00, radiusM: 0.075 },
    hullPlates: [
      fr('upper_glacis', 45, 1.45, 0.7, 2.95, roofY, 1.30),            // 60 deg
      fr('lower_glacis', 45, 1.45, floor, 2.55, 0.7, 2.95),            // 53 deg
      sR('hull_side_upper_R', 45, 1.5, trkTop, 0.96, roofY, -2.9, 1.5),
      sL('hull_side_upper_L', 45, 1.5, trkTop, 0.96, roofY, -2.9, 1.5),
      sR('hull_side_lower_R', 45, 1.0, floor, 1.0, trkTop, -2.85, 2.55),
      sL('hull_side_lower_L', 45, 1.0, floor, 1.0, trkTop, -2.85, 2.55),
      sR('track_R', 15, 1.25, 0.15, 1.25, trkTop, -3.05, 3.05, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 15, 1.25, 0.15, 1.25, trkTop, -3.05, 3.05, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear_upper', 45, 1.35, 1.0, -2.30, roofY, -3.05),       // 47 deg
      rr('hull_rear_lower', 45, 1.35, floor, -2.15, 1.0, -2.30),
      rf('hull_roof', 20, 0.96, roofY, -2.9, 1.30),
    ],
    turretPlates: [
      // r8: shell resized with the visual turret scale-up (0.88 m cast)
      fr('turret_front', 90, 0.38, 0.05, 0.98, 0.84, 0.88),
      chR('turret_cheek_R', 90, 0.38, 0.98, 0.98, 0.40, 0.05, 0.84, 0.08),
      chL('turret_cheek_L', 90, 0.38, 0.98, 0.98, 0.40, 0.05, 0.84, 0.08),
      sR('turret_side_R', 75, 1.07, 0.02, 0.86, 0.86, -0.82, 0.40),    // ~20 deg inward
      sL('turret_side_L', 75, 1.07, 0.02, 0.86, 0.86, -0.82, 0.40),
      rr('turret_rear', 60, 0.9, 0.05, -1.0, 0.84, -1.05),
      rf('turret_roof', 20, 0.92, 0.90, -1.0, 0.62),
      par('mantlet', 90, [-0.38, 0.12, 1.10], [0.38, 0.12, 1.10], [-0.38, 0.58, 1.06],
        { kind: 'spaced', gunFollow: true }),
    ],
    modules: [
      mbox('engine', [-0.85, 0.45, -2.8], [0.85, 1.5, -1.3]),
      mbox('fuelTank', [0.55, 0.7, 0.6], [1.15, 1.4, 1.9]),            // front sponson fuel
      mbox('ammoRack', [-0.85, 0.4, -0.6], [0.85, 0.8, 0.9]),          // floor stowage
      mbox('turretRing', [-0.8, 1.52, -0.25], [0.8, 1.72, 1.35]),
      mbox('radio', [-1.05, 0.9, 1.3], [-0.45, 1.4, 2.0]),
      mbox('optics', [0.1, 0.6, 0.25], [0.45, 0.85, 0.6], true),
      mbox('gun', [-0.14, 0.15, -0.3], [0.14, 0.55, 0.5], true),
      mbox('trackL', [-1.5, 0.0, -3.05], [-1.0, trkTop, 3.05]),
      mbox('trackR', [1.0, 0.0, -3.05], [1.5, trkTop, 3.05]),
    ],
    crew: [
      cbox('driver', [-0.85, 0.6, 1.5], [-0.15, 1.5, 2.5]),
      cbox('gunner', [-0.7, 0.05, -0.1], [-0.15, 0.6, 0.5], true),
      cbox('commander', [-0.7, 0.05, -0.7], [-0.12, 0.65, -0.15], true),
      cbox('loader', [0.15, 0.05, -0.4], [0.7, 0.6, 0.35], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// IS-2 (model 1944)
// ---------------------------------------------------------------------------
function armorIS2() {
  const trkTop = 1.10, floor = 0.45, roofY = 1.80;
  return {
    boundingRadiusM: 5.25,
    turretPivot: [0, 1.80, 0.1],
    gunPivot: [0, 0.35, 0.55],
    gunBarrel: { lengthM: 5.85, radiusM: 0.095 },
    hullPlates: [
      fr('upper_glacis', 100, 1.45, 0.95, 3.30, roofY, 1.83),          // 60 deg
      fr('lower_glacis', 100, 1.45, floor, 3.01, 0.95, 3.30),          // 30 deg
      sR('hull_side_upper_R', 90, 1.545, trkTop, 1.42, roofY, -2.85, 1.85),
      sL('hull_side_upper_L', 90, 1.545, trkTop, 1.42, roofY, -2.85, 1.85),
      sR('hull_side_lower_R', 90, 0.9, floor, 0.9, trkTop, -2.85, 3.0),
      sL('hull_side_lower_L', 90, 0.9, floor, 0.9, trkTop, -2.85, 3.0),
      sR('track_R', 20, 1.28, 0.15, 1.28, trkTop, -3.38, 3.38, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, 1.28, 0.15, 1.28, trkTop, -3.38, 3.38, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear_upper', 60, 1.4, 1.2, -2.86, roofY, -3.38),        // 41 deg
      rr('hull_rear_lower', 60, 1.4, floor, -2.86, 1.2, -2.86),
      rf('hull_roof', 30, 1.42, roofY, -2.85, 1.83),
    ],
    turretPlates: [
      fr('turret_front', 100, 0.35, 0.05, 0.80, 0.58, 0.72),
      chR('turret_cheek_R', 100, 0.35, 0.80, 0.85, 0.30, 0.05, 0.58, 0.08),
      chL('turret_cheek_L', 100, 0.35, 0.80, 0.85, 0.30, 0.05, 0.58, 0.08),
      sR('turret_side_R', 90, 0.9, 0.02, 0.74, 0.66, -0.75, 0.30),
      sL('turret_side_L', 90, 0.9, 0.02, 0.74, 0.66, -0.75, 0.30),
      rr('turret_rear', 90, 0.75, 0.05, -0.95, 0.58, -1.0),
      rf('turret_roof', 30, 0.8, 0.68, -0.95, 0.5),
      par('mantlet', 100, [-0.42, 0.1, 0.95], [0.42, 0.1, 0.95], [-0.42, 0.58, 0.92],
        { kind: 'spaced', gunFollow: true }),
    ],
    modules: [
      mbox('engine', [-0.85, 0.5, -3.1], [0.85, 1.7, -1.6]),
      mbox('fuelTank', [-0.9, 0.5, -1.55], [0.9, 1.25, -0.9]),
      mbox('ammoRack', [-0.85, 0.5, -0.7], [0.85, 1.0, 0.8]),          // two-piece rounds, hull
      mbox('turretRing', [-0.82, 1.62, -0.7], [0.82, 1.82, 0.9]),
      mbox('radio', [0.3, 1.1, 1.9], [0.95, 1.6, 2.7]),
      mbox('optics', [-0.45, 0.6, 0.2], [-0.1, 0.85, 0.55], true),
      mbox('gun', [-0.18, 0.15, -0.45], [0.18, 0.58, 0.55], true),
      mbox('trackL', [-1.545, 0.0, -3.38], [-0.9, trkTop, 3.38]),
      mbox('trackR', [0.9, 0.0, -3.38], [1.545, trkTop, 3.38]),
    ],
    crew: [
      cbox('driver', [-0.35, 0.65, 1.9], [0.35, 1.55, 2.9]),
      cbox('gunner', [-0.72, 0.05, -0.15], [-0.15, 0.6, 0.45], true),
      cbox('commander', [-0.75, 0.05, -0.75], [-0.15, 0.68, -0.2], true),
      cbox('loader', [0.15, 0.05, -0.45], [0.72, 0.62, 0.3], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// Panther Ausf. G
// ---------------------------------------------------------------------------
function armorPanther() {
  const trkTop = 1.15, floor = 0.52, roofY = 1.85;
  return {
    boundingRadiusM: 4.65,
    turretPivot: [0, 1.85, -0.25],
    gunPivot: [0, 0.35, 0.5],
    gunBarrel: { lengthM: 5.25, radiusM: 0.07 },
    hullPlates: [
      fr('upper_glacis', 80, 1.55, 0.8, 3.30, roofY, 1.80),            // 55 deg
      fr('lower_glacis', 50, 1.55, floor, 2.90, 0.8, 3.30),            // 55 deg
      sR('hull_side_upper_R', 50, 1.71, trkTop, 1.32, roofY, -3.1, 2.3),  // 29 deg
      sL('hull_side_upper_L', 50, 1.71, trkTop, 1.32, roofY, -3.1, 2.3),
      sR('hull_side_lower_R', 40, 1.05, floor, 1.05, trkTop, -3.0, 2.8),
      sL('hull_side_lower_L', 40, 1.05, floor, 1.05, trkTop, -3.0, 2.8),
      sR('skirt_R', 5, 1.72, 0.6, 1.72, 1.2, -2.6, 2.4, { kind: 'spaced' }),
      sL('skirt_L', 5, 1.72, 0.6, 1.72, 1.2, -2.6, 2.4, { kind: 'spaced' }),
      sR('track_R', 20, 1.38, 0.15, 1.38, trkTop, -3.43, 3.43, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, 1.38, 0.15, 1.38, trkTop, -3.43, 3.43, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 40, 1.5, 0.55, -2.68, roofY, -3.43),             // 30 deg
      rf('hull_roof', 25, 1.32, roofY, -3.1, 1.80),
    ],
    turretPlates: [
      fr('turret_front', 100, 0.45, 0.05, 0.72, 0.75, 0.57),           // 12 deg
      chR('turret_side_R', 45, 0.5, 0.70, 0.95, -0.90, 0.02, 0.75, 0, 0.35),  // wedge + 25 deg in
      chL('turret_side_L', 45, 0.5, 0.70, 0.95, -0.90, 0.02, 0.75, 0, 0.35),
      rr('turret_rear', 45, 0.85, 0.02, -0.92, 0.75, -1.0),
      rf('turret_roof', 25, 0.62, 0.76, -0.95, 0.55),
      par('mantlet', 100, [-0.48, 0.1, 0.85], [0.48, 0.1, 0.85], [-0.48, 0.6, 0.80],
        { kind: 'spaced', gunFollow: true }),
    ],
    modules: [
      mbox('engine', [-0.95, 0.55, -3.1], [0.95, 1.75, -1.7]),
      mbox('fuelTank', [-1.0, 0.55, -1.65], [1.0, 1.3, -1.0]),
      mbox('ammoRack', [-1.45, 0.7, -0.3], [1.45, 1.3, 1.6]),          // sponson racks
      mbox('turretRing', [-0.85, 1.67, -1.1], [0.85, 1.87, 0.6]),
      mbox('radio', [0.3, 1.1, 2.0], [1.0, 1.6, 2.8]),
      mbox('optics', [0.1, 0.65, 0.15], [0.45, 0.9, 0.55], true),
      mbox('gun', [-0.15, 0.15, -0.35], [0.15, 0.58, 0.55], true),
      mbox('trackL', [-1.71, 0.0, -3.43], [-1.05, trkTop, 3.43]),
      mbox('trackR', [1.05, 0.0, -3.43], [1.71, trkTop, 3.43]),
    ],
    crew: [
      cbox('driver', [-1.0, 0.7, 1.7], [-0.25, 1.7, 2.7]),
      cbox('gunner', [-0.68, 0.05, -0.05], [-0.12, 0.65, 0.55], true),
      cbox('commander', [-0.7, 0.05, -0.75], [-0.12, 0.72, -0.15], true),
      cbox('loader', [0.15, 0.05, -0.4], [0.7, 0.65, 0.4], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// M1A2 Abrams SEPv3 (composite: keMm/ceMm are RHAe estimates; physicalMm for geometry)
// ---------------------------------------------------------------------------
function armorM1A2() {
  const trkTop = 1.05, floor = 0.45, roofY = 1.47;
  return {
    boundingRadiusM: 5.2,
    turretPivot: [0, 1.47, -0.2],
    gunPivot: [0, 0.30, 0.75],
    gunBarrel: { lengthM: 5.28, radiusM: 0.11 },
    hullPlates: [
      fr('upper_glacis', 38, 1.6, 1.0, 3.90, roofY, 1.60, { keMm: 120, ceMm: 120 }),  // ~76 deg
      fr('lower_front', 650, 1.6, floor, 3.50, 1.0, 3.90, { keMm: 600, ceMm: 750 }),
      sR('hull_side_upper_R', 40, 1.83, trkTop, 1.83, roofY, -3.9, 1.6),
      sL('hull_side_upper_L', 40, 1.83, trkTop, 1.83, roofY, -3.9, 1.6),
      sR('hull_side_lower_R', 40, 1.19, floor, 1.19, trkTop, -3.8, 3.5),
      sL('hull_side_lower_L', 40, 1.19, floor, 1.19, trkTop, -3.8, 3.5),
      sR('skirt_front_R', 70, 1.86, 0.6, 1.86, 1.07, 0.9, 3.9, { kind: 'spaced', keMm: 150, ceMm: 450 }),
      sL('skirt_front_L', 70, 1.86, 0.6, 1.86, 1.07, 0.9, 3.9, { kind: 'spaced', keMm: 150, ceMm: 450 }),
      sR('skirt_rear_R', 10, 1.86, 0.6, 1.86, 1.07, -3.9, 0.9, { kind: 'spaced' }),
      sL('skirt_rear_L', 10, 1.86, 0.6, 1.86, 1.07, -3.9, 0.9, { kind: 'spaced' }),
      sR('track_R', 25, 1.51, 0.15, 1.51, trkTop, -3.96, 3.96, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 25, 1.51, 0.15, 1.51, trkTop, -3.96, 3.96, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 30, 1.6, floor, -3.96, roofY, -3.96),
      rf('hull_roof', 40, 1.6, roofY, -3.96, 1.60),
    ],
    turretPlates: [
      chR('turret_cheek_R', 800, 0.24, 1.12, 1.66, 0.26, 0.0, 0.85, 0.13, 0, { keMm: 850, ceMm: 1250 }),
      chL('turret_cheek_L', 800, 0.24, 1.12, 1.66, 0.26, 0.0, 0.85, 0.13, 0, { keMm: 850, ceMm: 1250 }),
      par('mantlet', 300, [-0.28, 0.05, 1.12], [0.28, 0.05, 1.12], [-0.28, 0.52, 1.09],
        { keMm: 350, ceMm: 450, gunFollow: true }),
      sR('turret_side_R', 350, 1.66, 0.0, 1.66, 0.85, -2.62, 0.12, { keMm: 380, ceMm: 500 }),
      sL('turret_side_L', 350, 1.66, 0.0, 1.66, 0.85, -2.62, 0.12, { keMm: 380, ceMm: 500 }),
      rr('turret_rear', 40, 1.62, 0.0, -2.62, 0.85, -2.62),            // ammo blow-off zone
      rf('turret_roof', 40, 1.62, 0.86, -2.62, 0.6),
      rr('bustle_rack', 10, 1.58, 0.15, -3.34, 0.75, -3.34, { kind: 'external' }),
    ],
    modules: [
      mbox('engine', [-1.0, 0.5, -3.85], [1.0, 1.5, -2.0]),
      mbox('fuelTank', [-1.15, 0.5, 2.4], [-0.45, 1.4, 3.6]),          // front-left fuel cell
      mbox('ammoRack', [-0.85, 0.0, -2.55], [0.85, 0.75, -0.9], true),// turret bustle
      mbox('turretRing', [-0.95, 1.37, -1.3], [0.95, 1.57, 0.9]),
      mbox('radio', [-0.6, 0.1, -0.85], [-0.1, 0.5, -0.35], true),
      mbox('optics', [0.35, 0.82, 0.35], [0.8, 1.1, 0.85], true),      // GPS doghouse
      mbox('gun', [-0.18, 0.05, -0.5], [0.18, 0.55, 0.75], true),
      mbox('trackL', [-1.83, 0.0, -3.96], [-1.19, trkTop, 3.96]),
      mbox('trackR', [1.19, 0.0, -3.96], [1.83, trkTop, 3.96]),
    ],
    crew: [
      cbox('driver', [-0.35, 0.55, 2.3], [0.35, 1.15, 3.4]),
      cbox('gunner', [0.25, 0.0, -0.1], [0.85, 0.7, 0.6], true),
      cbox('commander', [0.25, 0.05, -0.85], [0.9, 0.78, -0.2], true),
      cbox('loader', [-0.9, 0.0, -0.55], [-0.25, 0.75, 0.4], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// T-90M Proryv (Relikt ERA: consumable tiles, keReduction 0.25 / ceFlat 500)
// ---------------------------------------------------------------------------
function armorT90M() {
  // r7: hull roof dropped 1.45 -> 1.40 with the barge-hull visual rebuild
  // (deck band rides just above the fender line; turret scaled up instead).
  const trkTop = 1.0, floor = 0.43, roofY = 1.40;
  const relikt = { keReduction: 0.30, ceFlatMm: 600 };
  const reliktSkirt = { keReduction: 0.18, ceFlatMm: 400 };
  return {
    boundingRadiusM: 5.1,
    turretPivot: [0, 1.40, 0.15],
    gunPivot: [0, 0.32, 0.55],
    gunBarrel: { lengthM: 6.0, radiusM: 0.105 },
    hullPlates: [
      fr('glacis_era_L', 15, 0.78, 0.95, 3.42, 1.42, 2.02, { kind: 'era', era: relikt }),
      fr('upper_glacis', 500, 1.55, 0.85, 3.35, roofY, 1.85, { keMm: 560, ceMm: 760 }), // 68 deg
      fr('lower_front', 80, 1.55, floor, 3.05, 0.85, 3.35, { keMm: 130, ceMm: 160 }),
      sR('hull_side_upper_R', 70, 1.89, trkTop, 1.89, roofY, -3.4, 1.9, { keMm: 90, ceMm: 110 }),
      sL('hull_side_upper_L', 70, 1.89, trkTop, 1.89, roofY, -3.4, 1.9, { keMm: 90, ceMm: 110 }),
      sR('hull_side_lower_R', 70, 1.31, floor, 1.31, trkTop, -3.3, 3.0, { keMm: 90, ceMm: 110 }),
      sL('hull_side_lower_L', 70, 1.31, floor, 1.31, trkTop, -3.3, 3.0, { keMm: 90, ceMm: 110 }),
      sR('skirt_era_R', 15, 1.90, 0.45, 1.90, 1.05, 0.2, 3.3, { kind: 'era', era: reliktSkirt }),
      sL('skirt_era_L', 15, 1.90, 0.45, 1.90, 1.05, 0.2, 3.3, { kind: 'era', era: reliktSkirt }),
      sR('skirt_rubber_R', 8, 1.90, 0.45, 1.90, 1.05, -3.3, 0.2, { kind: 'spaced' }),
      sL('skirt_rubber_L', 8, 1.90, 0.45, 1.90, 1.05, -3.3, 0.2, { kind: 'spaced' }),
      sR('track_R', 20, 1.60, 0.12, 1.60, trkTop, -3.43, 3.43, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, 1.60, 0.12, 1.60, trkTop, -3.43, 3.43, { kind: 'external', moduleLink: 'trackL' }),
      rr('slat_cage', 10, 1.5, 0.5, -3.6, 1.3, -3.6, { kind: 'spaced' }),
      rr('hull_rear', 45, 1.55, floor, -3.43, roofY, -3.43),
      rf('hull_roof', 40, 1.55, roofY, -3.4, 1.85),
    ],
    turretPlates: [
      chR('turret_era_R', 15, 0.28, 1.02, 1.10, 0.32, 0.05, 0.68, 0.08, 0, { kind: 'era', era: relikt }),
      chL('turret_era_L', 15, 0.28, 1.02, 1.10, 0.32, 0.05, 0.68, 0.08, 0, { kind: 'era', era: relikt }),
      chR('turret_cheek_R', 650, 0.22, 0.86, 1.06, 0.18, 0.0, 0.70, 0.08, 0, { keMm: 700, ceMm: 900 }),
      chL('turret_cheek_L', 650, 0.22, 0.86, 1.06, 0.18, 0.0, 0.70, 0.08, 0, { keMm: 700, ceMm: 900 }),
      par('mantlet', 300, [-0.22, 0.08, 0.92], [0.22, 0.08, 0.92], [-0.22, 0.48, 0.89],
        { keMm: 400, ceMm: 500, gunFollow: true }),
      sR('side_era_R', 15, 1.16, 0.1, 1.16, 0.55, -0.5, 0.2, { kind: 'era', era: reliktSkirt }),
      sL('side_era_L', 15, 1.16, 0.1, 1.16, 0.55, -0.5, 0.2, { kind: 'era', era: reliktSkirt }),
      sR('turret_side_R', 300, 1.10, 0.0, 1.10, 0.70, -0.95, 0.2, { keMm: 350, ceMm: 500 }),
      sL('turret_side_L', 300, 1.10, 0.0, 1.10, 0.70, -0.95, 0.2, { keMm: 350, ceMm: 500 }),
      rr('turret_bustle', 45, 0.95, 0.0, -1.92, 0.58, -1.92),
      rf('turret_roof', 45, 1.05, 0.74, -0.95, 0.55),
    ],
    modules: [
      mbox('engine', [-1.0, 0.45, -3.3], [1.0, 1.4, -1.7]),
      mbox('fuelTank', [0.6, 0.45, -1.65], [1.25, 1.05, -0.3]),
      mbox('ammoRack', [-0.7, 0.45, -0.5], [0.7, 0.95, 0.7]),          // carousel autoloader
      mbox('turretRing', [-0.85, 1.27, -0.75], [0.85, 1.47, 0.95]),
      mbox('radio', [-0.6, 0.05, -1.2], [-0.1, 0.5, -0.75], true),
      mbox('optics', [-0.6, 0.62, 0.25], [-0.15, 0.95, 0.7], true),    // Sosna-U
      mbox('gun', [-0.18, 0.05, -0.45], [0.18, 0.5, 0.6], true),
      mbox('trackL', [-1.89, 0.0, -3.43], [-1.31, trkTop, 3.43]),
      mbox('trackR', [1.31, 0.0, -3.43], [1.89, trkTop, 3.43]),
    ],
    crew: [
      cbox('driver', [-0.35, 0.5, 1.9], [0.35, 1.1, 2.9]),
      cbox('gunner', [-0.75, 0.0, -0.2], [-0.2, 0.6, 0.5], true),
      cbox('commander', [0.2, 0.0, -0.45], [0.78, 0.62, 0.3], true),
    ],
  };
}

// ---------------------------------------------------------------------------
// Leopard 2A7
// ---------------------------------------------------------------------------
function armorLeo2A7() {
  const trkTop = 1.08, floor = 0.5, roofY = 1.72;
  return {
    boundingRadiusM: 5.8,
    // tank_models r7 ("forward hull deck ~2x the turret length ... gun
    // overhanging a huge featureless slab"): ring moved 0.47 forward — the
    // real Leo 2 turret sits slightly AHEAD of hull center (wedge tips ~2.1 m
    // from the nose, not 2.7). Foredeck drops from ~35% to ~28% of hull.
    turretPivot: [0, 1.72, 0.12],
    gunPivot: [0, 0.32, 0.8],
    gunBarrel: { lengthM: 6.6, radiusM: 0.10 },
    hullPlates: [
      // r4 bow rebuild: high prow (beak 1.45) + short 81-deg glacis to the
      // deck crease at z 2.03 — matches the visual (buildLeo2A7)
      fr('upper_glacis', 45, 1.6, 1.45, 3.83, roofY, 2.03, { keMm: 120, ceMm: 150 }),  // ~81 deg
      fr('lower_front', 600, 1.6, floor, 3.42, 1.45, 3.83, { keMm: 620, ceMm: 820 }),
      sR('hull_side_upper_R', 40, 1.875, trkTop, 1.875, roofY, -3.86, 2.03),
      sL('hull_side_upper_L', 40, 1.875, trkTop, 1.875, roofY, -3.86, 2.03),
      sR('hull_side_lower_R', 40, 1.24, floor, 1.24, trkTop, -3.8, 3.45),
      sL('hull_side_lower_L', 40, 1.24, floor, 1.24, trkTop, -3.8, 3.45),
      sR('skirt_heavy_R', 110, 1.88, 0.45, 1.88, 1.15, 1.3, 3.8, { kind: 'spaced', keMm: 160, ceMm: 450 }),
      sL('skirt_heavy_L', 110, 1.88, 0.45, 1.88, 1.15, 1.3, 3.8, { kind: 'spaced', keMm: 160, ceMm: 450 }),
      sR('skirt_rear_R', 10, 1.88, 0.45, 1.88, 1.15, -3.8, 1.3, { kind: 'spaced' }),
      sL('skirt_rear_L', 10, 1.88, 0.45, 1.88, 1.15, -3.8, 1.3, { kind: 'spaced' }),
      sR('track_R', 25, 1.55, 0.15, 1.55, trkTop, -3.86, 3.86, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 25, 1.55, 0.15, 1.55, trkTop, -3.86, 3.86, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 40, 1.6, floor, -3.86, roofY, -3.86),
      rf('hull_roof', 40, 1.6, roofY, -3.86, 2.03),
    ],
    turretPlates: [
      // r5: resized with the visual turret rebuild (thin proud wedge shells
      // meeting at z 1.52, 2.44 m flat-roofed base box back to -2.05)
      chR('turret_wedge_R', 90, 0.04, 1.52, 1.30, 0.14, 0.08, 0.90, 0.52, 0,
        { kind: 'spaced', keMm: 220, ceMm: 750 }),
      chL('turret_wedge_L', 90, 0.04, 1.52, 1.30, 0.14, 0.08, 0.90, 0.52, 0,
        { kind: 'spaced', keMm: 220, ceMm: 750 }),
      chR('turret_cheek_R', 650, 0.18, 0.68, 1.22, 0.10, 0.0, 0.88, 0.06, 0, { keMm: 620, ceMm: 750 }),
      chL('turret_cheek_L', 650, 0.18, 0.68, 1.22, 0.10, 0.0, 0.88, 0.06, 0, { keMm: 620, ceMm: 750 }),
      par('turret_sight_recess', 250, [0.46, 0.76, 0.76], [1.02, 0.76, 0.55], [0.46, 1.02, 0.70],
        { keMm: 300, ceMm: 350 }),                                     // EMES 15 weak spot
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
      mbox('ammoRack', [-1.15, 0.55, 1.6], [-0.35, 1.5, 3.0]),         // hull rack, front-left
      mbox('turretRing', [-0.95, 1.54, -1.25], [0.95, 1.74, 0.85]),
      mbox('radio', [-0.6, 0.1, -1.4], [-0.1, 0.55, -0.9], true),
      mbox('optics', [0.35, 0.7, 0.5], [0.75, 1.0, 0.95], true),       // EMES 15
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
// The spec table (locked values from ARCHITECTURE §3.3.1 + roster tables)
// ---------------------------------------------------------------------------

export const TANK_SPECS = {
  m4a3e8: {
    id: 'm4a3e8', name: 'M4A3E8 Sherman', nation: 'USA', era: 'ww2', role: 'medium',
    hp: 720,
    enginePowerHp: 450, weightTons: 33.7, topSpeedKmh: 42, reverseSpeedKmh: 8,
    hullTraverseDegS: 36,
    terrainResistance: { hard: 1.0, medium: 1.2, soft: 2.2 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 24, gunPitchDegS: 19, gunElevationDeg: 25, gunDepressionDeg: 10,
    gun: {
      caliberMm: 76, reloadS: 4.6, baseAccuracy: 0.36, aimTimeS: 2.0,
      bloom: BLOOM_WW2,
      shells: [
        shell('M62 APCBC', 'AP', 76, 128, 96, 115, 792),
        shell('M93 HVAP', 'APCR', 76, 208, 150, 115, 1036),
        shell('M42A1 HE', 'HE', 76, 38, 38, 155, 800),
      ],
    },
    dims: { hullLengthM: 6.27, overallLengthM: 7.52, widthM: 3.0, heightM: 2.97 },
    armor: armorM4(),
    visual: {
      // tank_models r7 ("factory greens come out minty light-green vinyl"):
      // the saturated #4b5320 + BRIGHT #6b6b47 weather pair flared lime under
      // the warm garage key. Deeper, grayer WWII olive drab + a dust-khaki
      // weather tone one step darker.
      scheme: 'solid', base: '#3f4423', weather: '#54543e', patches: [],
      marking: 'star', number: '3070512', trackWidthM: 0.58,
    },
  },

  tiger1: {
    id: 'tiger1', name: 'Tiger I', nation: 'Germany', era: 'ww2', role: 'heavy',
    hp: 1000,
    enginePowerHp: 700, weightTons: 57, topSpeedKmh: 45.4, reverseSpeedKmh: 8,
    hullTraverseDegS: 22,
    terrainResistance: { hard: 1.1, medium: 1.3, soft: 2.3 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 14, gunPitchDegS: 11, gunElevationDeg: 17, gunDepressionDeg: 6.5,
    gun: {
      caliberMm: 88, reloadS: 6.5, baseAccuracy: 0.34, aimTimeS: 2.4,
      bloom: BLOOM_WW2,
      shells: [
        shell('PzGr. 39 APCBC', 'AP', 88, 120, 100, 220, 773),
        shell('PzGr. 40 APCR', 'APCR', 88, 171, 138, 190, 930),
        shell('Sprgr. 18 HE', 'HE', 88, 44, 44, 270, 770),
      ],
    },
    dims: { hullLengthM: 6.32, overallLengthM: 8.45, widthM: 3.71, heightM: 3.0 },
    armor: armorTiger(),
    visual: {
      // r8: dunkelgelb dropped a step darker — the old #9b8a55 rendered as
      // pale cream under the warm garage key; patches desaturated to sit
      // closer to sprayed RAL 6003/8017 instead of vinyl-sticker contrast.
      scheme: 'stripes', base: '#8d7a4a', weather: '#7e6e44',
      // r5: olive pulled greener + rotbraun warmer so the roster's THREE
      // tones separate (the old pair blended into "2-tone tan/brown").
      patches: ['#5c6a3b', '#6f4a32'],
      marking: 'cross', number: '212', zimmerit: true, trackWidthM: 0.725,
      camoScale: 0.6,
      // r5: single-plate hull — no tiled panel-join grid (materials.js)
      plateLines: false,
    },
  },

  t34_85: {
    id: 't34_85', name: 'T-34-85', nation: 'USSR', era: 'ww2', role: 'medium',
    hp: 750,
    enginePowerHp: 500, weightTons: 32, topSpeedKmh: 55, reverseSpeedKmh: 7,
    hullTraverseDegS: 40,
    terrainResistance: { hard: 0.9, medium: 1.1, soft: 2.0 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 26, gunPitchDegS: 21, gunElevationDeg: 22, gunDepressionDeg: 5,
    gun: {
      caliberMm: 85, reloadS: 7.0, baseAccuracy: 0.42, aimTimeS: 2.3,
      bloom: BLOOM_WW2,
      shells: [
        shell('BR-365K APHE', 'AP', 85, 119, 97, 180, 792),
        shell('BR-365P APCR', 'APCR', 85, 167, 110, 160, 1030),
        shell('O-365K HE', 'HE', 85, 43, 43, 240, 790),
      ],
    },
    dims: { hullLengthM: 6.10, overallLengthM: 8.10, widthM: 3.0, heightM: 2.72 },
    armor: armorT34(),
    visual: {
      // dark 4BO olive — the old light pea-green read as bare plastic (r6)
      // r4: another step deeper — with the top-face bake fix the pair lands
      // on wartime 4BO instead of pastel mint under the garage key
      // tank_models r7 ("pastel light-green vinyl"): base/weather darkened +
      // desaturated another ~15% toward weathered wartime 4BO.
      scheme: 'solid', base: '#374026', weather: '#434c34', patches: [],
      marking: 'number', number: '312', trackWidthM: 0.5,
    },
  },

  is2: {
    id: 'is2', name: 'IS-2', nation: 'USSR', era: 'ww2', role: 'heavy',
    hp: 1200,
    enginePowerHp: 520, weightTons: 46, topSpeedKmh: 37, reverseSpeedKmh: 5,
    hullTraverseDegS: 20,
    terrainResistance: { hard: 1.2, medium: 1.4, soft: 2.5 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 16, gunPitchDegS: 13, gunElevationDeg: 20, gunDepressionDeg: 3,
    gun: {
      caliberMm: 122, reloadS: 13.5, baseAccuracy: 0.46, aimTimeS: 3.2,
      bloom: BLOOM_WW2,
      shells: [
        shell('BR-471 APHE', 'AP', 122, 165, 143, 390, 795),
        shell('BR-471B APBC', 'AP', 122, 175, 152, 390, 800),
        shell('OF-471 HE', 'HE', 122, 61, 61, 450, 770),
      ],
    },
    dims: { hullLengthM: 6.77, overallLengthM: 9.90, widthM: 3.09, heightM: 2.73 },
    armor: armorIS2(),
    visual: {
      // dark 4BO olive (r6 — was a bright pea green)
      // tank_models r7: another ~15% down/grayer with the T-34 (pastel read)
      scheme: 'solid', base: '#333c27', weather: '#3f4834', patches: [],
      marking: 'number', number: '432', trackWidthM: 0.65,
    },
  },

  panther_g: {
    id: 'panther_g', name: 'Panther Ausf. G', nation: 'Germany', era: 'ww2', role: 'medium',
    hp: 900,
    enginePowerHp: 700, weightTons: 45.5, topSpeedKmh: 48, reverseSpeedKmh: 5,
    hullTraverseDegS: 30,
    terrainResistance: { hard: 1.0, medium: 1.2, soft: 2.2 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 18, gunPitchDegS: 14, gunElevationDeg: 18, gunDepressionDeg: 8,
    gun: {
      caliberMm: 75, reloadS: 5.5, baseAccuracy: 0.32, aimTimeS: 2.1,
      bloom: BLOOM_WW2,
      shells: [
        shell('PzGr. 39/42 APCBC', 'AP', 75, 138, 111, 135, 935),
        shell('PzGr. 40/42 APCR', 'APCR', 75, 194, 149, 135, 1120),
        shell('Sprgr. 42 HE', 'HE', 75, 38, 38, 175, 700),
      ],
    },
    dims: { hullLengthM: 6.87, overallLengthM: 8.66, widthM: 3.42, heightM: 2.99 },
    armor: armorPanther(),
    visual: {
      // r8: dunkelgelb base darkened with the Tiger (pale-cream garage read)
      scheme: 'ambush', base: '#8d7a4a', weather: '#80704a',
      patches: ['#6a713f', '#7a4a35'],
      marking: 'cross', number: '435', trackWidthM: 0.66,
      camoScale: 0.55,   // r6: default 0.34 painted hull-side blobs ~2x too large
    },
  },

  m1a2_legacy: {
    // Renamed from 'M1A2 Abrams SEPv3' (owner 2026-08-07: "theres two
    // m1a2 sepv3s. lets use M1a2 sepv3 and delete m1a2 abrams sepv3") —
    // the SEPv3 garage identity now belongs solely to m1a2_sepv3; this
    // base row keeps the id + geometry as the family anchor. If the owner
    // wants this TANK gone (not just the name), delist per the leo2a7
    // TANK_IDS mechanism.
    // §5.74: RETIRED-LEGACY (owner 2026-08-08) — carousel-delisted in
    // garage.js; name carries the LEGACY mark everywhere it still appears.
    id: 'm1a2_legacy', name: 'M1A2 (Legacy)', nation: 'USA', era: 'modern', role: 'mbt',
    hp: 2600,
    // Real SEPv3 reverses at ~40 km/h, but that reads arcade-y next to the
    // 5-8 km/h WW2 roster and sits far outside the WoT-feel envelope
    // (10-20 km/h reverse across all classes) — cap modern MBTs at 25.
    enginePowerHp: 1500, weightTons: 66.8, topSpeedKmh: 67, reverseSpeedKmh: 25,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 6.0, baseAccuracy: 0.30, aimTimeS: 1.8,
      bloom: BLOOM_MODERN,
      shells: [
        shell('M829A4 APFSDS', 'APFSDS', 120, apfsdsPens(750)[0], apfsdsPens(750)[1], 540, 1670, { pen2000Mm: apfsdsPens(750)[2] }),
        shell('M830A1 MPAT', 'HEAT', 120, 600, 600, 480, 1400),
        shell('M1147 AMP', 'HE', 120, 60, 60, 600, 1000),
      ],
    },
    dims: { hullLengthM: 7.93, overallLengthM: 9.77, widthM: 3.66, heightM: 2.44 },
    armor: armorM1A2(),
    visual: {
      scheme: 'nato', base: '#49543c', weather: '#525f45',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'number', number: 'B-24', trackWidthM: 0.635,
      camoScale: 0.5,
    },
  },

  t90m: {
    id: 't90m', name: 'T-90M', nation: 'Russia', era: 'modern', role: 'mbt',
    hp: 2700,
    enginePowerHp: 1130, weightTons: 48, topSpeedKmh: 65, reverseSpeedKmh: 12,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 32, gunElevationDeg: 14, gunDepressionDeg: 6,
    gun: {
      caliberMm: 125, reloadS: 6.4, baseAccuracy: 0.31, aimTimeS: 1.8,
      bloom: BLOOM_MODERN,
      shells: [
        shell('3BM60 Svinets-2', 'APFSDS', 125, 855, 800, 560, 1800, { pen2000Mm: 720 }),
        shell('3BK31 HEAT', 'HEAT', 125, 800, 800, 500, 905),
        shell('3OF82 HE-Frag', 'HE', 125, 55, 55, 600, 850),
      ],
    },
    dims: { hullLengthM: 6.86, overallLengthM: 9.63, widthM: 3.78, heightM: 2.39 },
    armor: armorT90M(),
    visual: {
      // r8: FACTORY is the roster-doc "Russian dark forest green overall"
      // solid — the digital speckle rendered as dithered confetti at garage
      // distance and killed the silhouette read; 'digital' stays available
      // as a picker pattern (nation-flavored, retuned scale).
      scheme: 'solid', base: '#3f5138', weather: '#4a5c42', patches: [],
      marking: 'number', number: '527', trackWidthM: 0.58,
    },
  },

  leo2a7: {
    id: 'leo2a7', name: 'Leopard 2A7', nation: 'Germany', era: 'modern', role: 'mbt',
    hp: 2500,
    // 2A7 reverses at ~31 km/h IRL — capped at 25 with the M1A2 (see above).
    enginePowerHp: 1500, weightTons: 67.5, topSpeedKmh: 68, reverseSpeedKmh: 25,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 32, gunElevationDeg: 20, gunDepressionDeg: 9,
    gun: {
      caliberMm: 120, reloadS: 6.0, baseAccuracy: 0.28, aimTimeS: 1.6,
      bloom: BLOOM_MODERN,
      shells: [
        shell('DM63 APFSDS', 'APFSDS', 120, apfsdsPens(730)[0], apfsdsPens(730)[1], 530, 1750, { pen2000Mm: apfsdsPens(730)[2] }),
        shell('DM12A2 HEAT-MP', 'HEAT', 120, 600, 600, 480, 1400),
        shell('DM11 HE', 'HE', 120, 40, 40, 590, 1000),
      ],
    },
    dims: { hullLengthM: 7.72, overallLengthM: 10.97, widthM: 3.75, heightM: 2.64 },
    armor: armorLeo2A7(),
    visual: {
      scheme: 'nato', base: '#49543c', weather: '#515e44',
      patches: ['#23261f', '#4a3a2c'],
      marking: 'cross', number: '124', trackWidthM: 0.635,
      camoScale: 0.5,
    },
  },
};

// OWNER IDENTITY SWAP (2026-08-14): Tejas is the canonical M1A2.  Keep the
// retired procedural build available under the explicit m1a2_legacy id so
// saved comparisons and visual regression work can still address it without
// letting it shadow the player-facing M1A2.
TANK_SPECS.m1a2 = structuredClone(TANK_SPECS.m1a2_legacy);
TANK_SPECS.m1a2.id = 'm1a2';
TANK_SPECS.m1a2.name = 'M1A2 Abrams';
TANK_SPECS.m1a2.dims.heightM = 3.30;
TANK_SPECS.m1a2.visual.number = '23';

// T-90M glacis ERA is split into two tiles so strips read locally.
{
  const t90 = TANK_SPECS.t90m.armor;
  const l = t90.hullPlates[0];
  // Re-place the single glacis ERA quad as two side-by-side tiles.
  const mk = (name, x0, x1) => par(name, 15,
    [x0, 0.95, 3.42], [x1, 0.95, 3.42], [x0, 1.42, 2.02],
    { kind: 'era', era: l.era });
  t90.hullPlates.splice(0, 1, mk('glacis_era_L', -1.5, -0.02), mk('glacis_era_R', 0.02, 1.5));
}

// The established Proryv reconstruction remains addressable as T-90M at
// tier IX.  Tier X is a distinct first-party configuration with the denser
// two-row Relikt chevron front; both share the corrected long T-90 chassis.
TANK_SPECS.t90m_proryv = structuredClone(TANK_SPECS.t90m);
TANK_SPECS.t90m_proryv.id = 't90m_proryv';
TANK_SPECS.t90m_proryv.name = 'T-90M Proryv';
TANK_SPECS.t90m_proryv.hp = 2850;
TANK_SPECS.t90m_proryv.visual.number = '623';

// ===========================================================================
// FIRST-PARTY PROCEDURAL EXPANSION TANKS.
//
// These gameplay rows began life beside isolated third-party measurement
// references, but the selectable models are now repository-authored
// procedural builds.  Reference credits belong in ATTRIBUTION/reference
// tooling, never on a playable spec: a `community` field used to make the UI
// imply that the reference mesh itself was shipping.  The owner-only roster
// finalizer below enforces that distinction after every extension pack loads.
// Armor models are parametric balance layouts, not copied mesh payloads.
// ===========================================================================


/** First-party expansion ids (garage carousel order, appended after core). */
const FIRST_PARTY_EXPANSION_TANK_IDS = [
  'strv103', 'is3', 't34_85_cad', 'newc_tiger', 'newc_pziii',
  'pziii_konserwa', 'leichttraktor',
  // wave 2 (print-model crawl, 2026-07-28)
  'kv2', 'tiger2', 'sherman_jumbo', 'jagdtiger',
  'jpz_e100', 'sturmtiger', 't95', 't30',
  // wave 3 (IS-series hunt, 2026-07-28)
  'is7', 'object279', 'is6b', 'is1',
];

const FIRST_PARTY_EXPANSION_SPECS = {
  strv103: {
    id: 'strv103', name: 'Stridsvagn 103', nation: 'Sweden', era: 'modern', role: 'td',
    community: {
      author: 'Lukasz Wesiora (canisferus)',
      source: 'https://opengameart.org/content/stridsvagn-103',
      license: 'CC-BY 3.0',
    },
    hp: 1100,
    enginePowerHp: 730, weightTons: 39.7, topSpeedKmh: 50, reverseSpeedKmh: 25,
    hullTraverseDegS: 44,
    terrainResistance: { hard: 0.85, medium: 1.0, soft: 1.8 },
    pivotStyle: 'neutral',
    // fixed gun (casemate): the sim's virtual turret slews fast — the S-tank
    // aims with the hull, so the "turret" is really the fire-control solution.
    turretTraverseDegS: 34, gunPitchDegS: 24, gunElevationDeg: 12, gunDepressionDeg: 6, gunArcDeg: 4,
    gun: {
      caliberMm: 105, reloadS: 4.0, baseAccuracy: 0.30, aimTimeS: 1.9,
      bloom: BLOOM_MODERN,
      shells: [
        shell('slpprj m/61 APDS', 'APCR', 105, 260, 235, 320, 1463),
        shell('slpgr m/66 HEAT', 'HEAT', 105, 400, 400, 300, 730),
        shell('sgr m/61 HE', 'HE', 105, 50, 50, 420, 730),
      ],
    },
    dims: { hullLengthM: 7.04, overallLengthM: 8.99, widthM: 3.63, heightM: 2.14 },
    armor: communityArmor({
      lenM: 7.04, widM: 3.63, hgtM: 2.14, turretPivot: [0, 1.5, 0.2],
      gunPivot: [0, 0.35, 0.4], barrelLenM: 4.2, barrelRadM: 0.075,
      frontMm: 100, sideMm: 30, rearMm: 25, roofMm: 20,
      tFrontMm: 60, tSideMm: 30, tRearMm: 20, mantletMm: 60, turretless: true,
    }),
    visual: {
      // r9: base pulled off the saturated forest green — the S-tank rendered
      // as the brightest, most toy-like material in the carousel.
      scheme: 'stripes', base: '#47513c', weather: '#525c46',
      patches: ['#2d3427', '#5c5a44'], marking: 'number', number: '103',
      trackWidthM: 0.67, camoScale: 0.5,
    },
  },

  is3: {
    id: 'is3', name: 'IS-3', nation: 'USSR', era: 'ww2', role: 'heavy',
    community: {
      author: 'Nick Tallon (PanzerFactory)',
      source: 'https://www.thingiverse.com/thing:4137773',
      license: 'CC-BY 4.0',
    },
    hp: 1250,
    enginePowerHp: 520, weightTons: 46.5, topSpeedKmh: 40, reverseSpeedKmh: 6,
    hullTraverseDegS: 22,
    terrainResistance: { hard: 1.15, medium: 1.35, soft: 2.4 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 18, gunPitchDegS: 13, gunElevationDeg: 19, gunDepressionDeg: 3,
    gun: {
      caliberMm: 122, reloadS: 13.0, baseAccuracy: 0.44, aimTimeS: 3.1,
      bloom: BLOOM_WW2,
      shells: [
        shell('BR-471B APBC', 'AP', 122, 178, 155, 390, 800),
        shell('BR-471 APHE', 'AP', 122, 165, 143, 390, 795),
        shell('OF-471 HE', 'HE', 122, 61, 61, 450, 770),
      ],
    },
    dims: { hullLengthM: 6.77, overallLengthM: 9.85, widthM: 3.15, heightM: 2.45 },
    armor: communityArmor({
      lenM: 6.77, widM: 3.15, hgtM: 2.45, turretPivot: [0, 1.62, -0.3],
      gunPivot: [0, 0.32, 0.5], barrelLenM: 5.7, barrelRadM: 0.095,
      frontMm: 110, sideMm: 90, rearMm: 60, roofMm: 30,
      tFrontMm: 155, tSideMm: 110, tRearMm: 100, mantletMm: 155,
    }),
    visual: {
      scheme: 'solid', base: '#445032', weather: '#4f5b3e', patches: [],
      marking: 'number', number: '703', trackWidthM: 0.65,
    },
  },

  t34_85_cad: {
    id: 't34_85_cad', name: 'T-34-85 (Wei He)', nation: 'USSR', era: 'ww2', role: 'medium',
    community: {
      author: 'Wei He (Xdhsqj)',
      source: 'https://www.thingiverse.com/thing:4326802',
      license: 'CC-BY 4.0',
    },
    hp: 750,
    enginePowerHp: 500, weightTons: 32, topSpeedKmh: 55, reverseSpeedKmh: 7,
    hullTraverseDegS: 40,
    terrainResistance: { hard: 0.9, medium: 1.1, soft: 2.0 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 26, gunPitchDegS: 21, gunElevationDeg: 22, gunDepressionDeg: 5,
    gun: {
      caliberMm: 85, reloadS: 7.2, baseAccuracy: 0.42, aimTimeS: 2.3,
      bloom: BLOOM_WW2,
      shells: [
        shell('BR-365K APHE', 'AP', 85, 119, 97, 180, 792),
        shell('BR-365P APCR', 'APCR', 85, 167, 110, 160, 1030),
        shell('O-365K HE', 'HE', 85, 43, 43, 240, 790),
      ],
    },
    dims: { hullLengthM: 6.10, overallLengthM: 8.10, widthM: 3.0, heightM: 2.72 },
    armor: communityArmor({
      lenM: 6.10, widM: 3.0, hgtM: 2.72, turretPivot: [0, 1.68, 0.5],
      gunPivot: [0, 0.32, 0.5], barrelLenM: 4.6, barrelRadM: 0.075,
      frontMm: 75, sideMm: 45, rearMm: 45, roofMm: 20,
      tFrontMm: 90, tSideMm: 75, tRearMm: 60, mantletMm: 90,
    }),
    visual: {
      // r5 content_breadth: the solid 4BO canvas rendered the CAD shell as a
      // flat untextured export in battle next to the weathered first-party
      // fleet — two-tone Soviet disruptive (same language as the IS-3
      // community Soviet) so it sits in one material world.
      scheme: 'stripes', base: '#3e4f22', weather: '#4a5a2e',
      patches: ['#2c3a20', '#57503a'],
      marking: 'number', number: '85', trackWidthM: 0.5, camoScale: 0.5,
    },
  },

  newc_tiger: {
    id: 'newc_tiger', name: 'Tiger I (Newc42)', nation: 'Germany', era: 'ww2', role: 'heavy',
    community: {
      author: 'Newc42',
      source: 'https://newc-42.itch.io/german-low-poly-wwii-tanks',
      license: 'CC0-1.0',
    },
    hp: 1000,
    enginePowerHp: 700, weightTons: 57, topSpeedKmh: 45, reverseSpeedKmh: 8,
    hullTraverseDegS: 22,
    terrainResistance: { hard: 1.1, medium: 1.3, soft: 2.3 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 14, gunPitchDegS: 11, gunElevationDeg: 17, gunDepressionDeg: 6.5,
    gun: {
      caliberMm: 88, reloadS: 6.5, baseAccuracy: 0.34, aimTimeS: 2.4,
      bloom: BLOOM_WW2,
      shells: [
        shell('PzGr. 39 APCBC', 'AP', 88, 120, 100, 220, 773),
        shell('PzGr. 40 APCR', 'APCR', 88, 171, 138, 190, 930),
        shell('Sprgr. 18 HE', 'HE', 88, 44, 44, 270, 770),
      ],
    },
    dims: { hullLengthM: 6.32, overallLengthM: 8.45, widthM: 3.71, heightM: 3.0 },
    armor: communityArmor({
      lenM: 6.32, widM: 3.71, hgtM: 3.0, turretPivot: [0, 1.95, -0.1],
      gunPivot: [0, 0.4, 0.55], barrelLenM: 4.5, barrelRadM: 0.085,
      frontMm: 100, sideMm: 80, rearMm: 80, roofMm: 30,
      tFrontMm: 100, tSideMm: 80, tRearMm: 80, mantletMm: 120,
    }),
    visual: {
      scheme: 'stripes', base: '#8d7a4a', weather: '#7e6e44',
      patches: ['#5f6539', '#6b4c38'], marking: 'cross', number: '131',
      trackWidthM: 0.725, camoScale: 0.6,
    },
  },

  newc_pziii: {
    id: 'newc_pziii', name: 'Panzer III Ausf. J', nation: 'Germany', era: 'ww2', role: 'medium',
    community: {
      author: 'Newc42',
      source: 'https://newc-42.itch.io/german-low-poly-wwii-tanks',
      license: 'CC0-1.0',
    },
    hp: 620,
    enginePowerHp: 300, weightTons: 21.5, topSpeedKmh: 40, reverseSpeedKmh: 7,
    hullTraverseDegS: 38,
    terrainResistance: { hard: 0.95, medium: 1.15, soft: 2.1 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 26, gunPitchDegS: 20, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 50, reloadS: 3.6, baseAccuracy: 0.38, aimTimeS: 1.9,
      bloom: BLOOM_WW2,
      shells: [
        shell('PzGr. 39 APC', 'AP', 50, 90, 62, 75, 835),
        shell('PzGr. 40 APCR', 'APCR', 50, 130, 72, 65, 1180),
        shell('Sprgr. 38 HE', 'HE', 50, 25, 25, 95, 550),
      ],
    },
    dims: { hullLengthM: 5.56, overallLengthM: 6.41, widthM: 2.9, heightM: 2.5 },
    armor: communityArmor({
      lenM: 5.56, widM: 2.9, hgtM: 2.5, turretPivot: [0, 1.66, 0.3],
      gunPivot: [0, 0.28, 0.4], barrelLenM: 3.0, barrelRadM: 0.05,
      frontMm: 50, sideMm: 30, rearMm: 30, roofMm: 17,
      tFrontMm: 57, tSideMm: 30, tRearMm: 30, mantletMm: 57,
    }),
    visual: {
      // r9: down to Panzergrau — the light grey thumb read near-white.
      scheme: 'solid', base: '#40474f', weather: '#4c535a', patches: [],
      marking: 'cross', number: '221', trackWidthM: 0.4,
    },
  },

  pziii_konserwa: {
    id: 'pziii_konserwa', name: 'Panzerkampfwagen III', nation: 'Germany', era: 'ww2', role: 'medium',
    community: {
      author: 'konserwa',
      source: 'https://opengameart.org/content/panzerkampfwagen-iii',
      license: 'CC0',
    },
    hp: 580,
    enginePowerHp: 285, weightTons: 20, topSpeedKmh: 40, reverseSpeedKmh: 7,
    hullTraverseDegS: 36,
    terrainResistance: { hard: 0.95, medium: 1.15, soft: 2.1 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 25, gunPitchDegS: 19, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 37, reloadS: 2.6, baseAccuracy: 0.40, aimTimeS: 1.8,
      bloom: BLOOM_WW2,
      shells: [
        shell('PzGr. 36 AP', 'AP', 37, 64, 41, 45, 745),
        shell('PzGr. 40 APCR', 'APCR', 37, 92, 46, 40, 1020),
        shell('Sprgr. 18 HE', 'HE', 37, 19, 19, 55, 745),
      ],
    },
    dims: { hullLengthM: 5.52, overallLengthM: 6.28, widthM: 2.9, heightM: 2.5 },
    armor: communityArmor({
      lenM: 5.52, widM: 2.9, hgtM: 2.5, turretPivot: [0, 1.66, 0.25],
      gunPivot: [0, 0.28, 0.4], barrelLenM: 1.9, barrelRadM: 0.04,
      frontMm: 30, sideMm: 30, rearMm: 21, roofMm: 12,
      tFrontMm: 30, tSideMm: 30, tRearMm: 30, mantletMm: 30,
    }),
    visual: {
      // r9: down to Panzergrau (critic: '#4a4d4f' class) from near-white.
      scheme: 'solid', base: '#3d454f', weather: '#49515a', patches: [],
      marking: 'cross', number: '111', trackWidthM: 0.38,
    },
  },

  leichttraktor: {
    id: 'leichttraktor', name: 'Leichttraktor', nation: 'Germany', era: 'ww2', role: 'light',
    community: {
      author: 'Newc42',
      source: 'https://newc-42.itch.io/german-low-poly-wwii-tanks',
      license: 'CC0-1.0',
    },
    hp: 340,
    enginePowerHp: 100, weightTons: 8.7, topSpeedKmh: 34, reverseSpeedKmh: 7,
    hullTraverseDegS: 40,
    terrainResistance: { hard: 0.9, medium: 1.1, soft: 2.0 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 30, gunPitchDegS: 22, gunElevationDeg: 25, gunDepressionDeg: 8,
    gun: {
      caliberMm: 37, reloadS: 2.4, baseAccuracy: 0.42, aimTimeS: 1.7,
      bloom: BLOOM_WW2,
      shells: [
        shell('PzGr. AP', 'AP', 37, 40, 30, 42, 700),
        shell('PzGr. 40 APCR', 'APCR', 37, 58, 34, 36, 920),
        shell('Sprgr. HE', 'HE', 37, 18, 18, 50, 700),
      ],
    },
    dims: { hullLengthM: 4.4, overallLengthM: 4.87, widthM: 2.28, heightM: 2.4 },
    armor: communityArmor({
      lenM: 4.4, widM: 2.28, hgtM: 2.4, turretPivot: [0, 1.62, -0.2],
      gunPivot: [0, 0.28, 0.3], barrelLenM: 1.6, barrelRadM: 0.035,
      frontMm: 14, sideMm: 12, rearMm: 12, roofMm: 8,
      tFrontMm: 14, tSideMm: 12, tRearMm: 12, mantletMm: 16,
    }),
    visual: {
      scheme: 'solid', base: '#5f6a52', weather: '#6d7860', patches: [],
      marking: 'cross', number: '1', trackWidthM: 0.28,
    },
  },

  recon_tank: {
    id: 'recon_tank', name: 'Recon Tank (Mophs)', nation: 'Community', era: 'modern', role: 'light',
    community: {
      author: 'Mophs (base mesh: MNDV.ecb / Eric Buisson)',
      source: 'https://opengameart.org/content/recon-tank-update',
      license: 'CC-BY 4.0',
    },
    hp: 700,
    enginePowerHp: 600, weightTons: 18, topSpeedKmh: 75, reverseSpeedKmh: 25,
    hullTraverseDegS: 48,
    terrainResistance: { hard: 0.65, medium: 0.85, soft: 1.7 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 44, gunPitchDegS: 34, gunElevationDeg: 18, gunDepressionDeg: 8,
    gun: {
      caliberMm: 57, reloadS: 2.2, baseAccuracy: 0.34, aimTimeS: 1.5,
      bloom: BLOOM_MODERN,
      shells: [
        shell('57mm APFSDS', 'APFSDS', 57, apfsdsPens(220)[0], apfsdsPens(220)[1], 160, 1500, { pen2000Mm: apfsdsPens(220)[2] }),
        shell('57mm HEAT', 'HEAT', 57, 250, 250, 140, 1000),
        shell('57mm HE', 'HE', 57, 30, 30, 190, 1000),
      ],
    },
    dims: { hullLengthM: 6.2, overallLengthM: 7.2, widthM: 3.0, heightM: 2.5 },
    armor: communityArmor({
      lenM: 6.2, widM: 3.0, hgtM: 2.5, turretPivot: [0, 1.7, 0.0],
      gunPivot: [0, 0.3, 0.4], barrelLenM: 3.0, barrelRadM: 0.05,
      frontMm: 45, sideMm: 25, rearMm: 20, roofMm: 15,
      tFrontMm: 55, tSideMm: 30, tRearMm: 20, mantletMm: 60,
    }),
    visual: {
      scheme: 'nato', base: '#4b5a48', weather: '#556351',
      patches: ['#2a2e27', '#4a3a2c'], marking: 'number', number: 'R-6',
      trackWidthM: 0.5, camoScale: 0.5,
    },
  },

  q_heavy: {
    id: 'q_heavy', name: 'Heavy Tank (Quaternius)', nation: 'Community', era: 'ww2', role: 'heavy',
    community: {
      author: 'Quaternius',
      source: 'https://poly.pizza/m/FA5daiyZQq',
      license: 'CC0 1.0',
    },
    hp: 1150,
    enginePowerHp: 650, weightTons: 55, topSpeedKmh: 40, reverseSpeedKmh: 8,
    hullTraverseDegS: 24,
    terrainResistance: { hard: 1.1, medium: 1.3, soft: 2.3 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 16, gunPitchDegS: 12, gunElevationDeg: 18, gunDepressionDeg: 7,
    gun: {
      caliberMm: 105, reloadS: 9.5, baseAccuracy: 0.40, aimTimeS: 2.8,
      bloom: BLOOM_WW2,
      shells: [
        shell('105mm APCBC', 'AP', 105, 145, 120, 300, 790),
        shell('105mm APCR', 'APCR', 105, 190, 150, 260, 980),
        shell('105mm HE', 'HE', 105, 53, 53, 380, 760),
      ],
    },
    dims: { hullLengthM: 7.2, overallLengthM: 8.8, widthM: 3.6, heightM: 3.0 },
    armor: communityArmor({
      lenM: 7.2, widM: 3.6, hgtM: 3.0, turretPivot: [0, 2.0, 0.0],
      gunPivot: [0, 0.35, 0.5], barrelLenM: 4.4, barrelRadM: 0.09,
      frontMm: 110, sideMm: 80, rearMm: 60, roofMm: 30,
      tFrontMm: 130, tSideMm: 90, tRearMm: 80, mantletMm: 140,
    }),
    visual: {
      scheme: 'stripes', base: '#7f7049', weather: '#8a7a52',
      patches: ['#5c6636', '#4a3a2c'], marking: 'number', number: '05',
      trackWidthM: 0.7, camoScale: 0.55,
    },
  },

  // =========================================================================
  // COMMUNITY WAVE 2 (print-model crawl, integrated 2026-07-28)
  // =========================================================================

  kv2: {
    id: 'kv2', name: 'KV-2', nation: 'USSR', era: 'ww2', role: 'heavy',
    community: {
      author: 'Comrade1280',
      source: 'https://sketchfab.com/3d-models/kv-2-heavy-tank-1940-ba8b84d78c0a42038cf2eaa4210ef296',
      license: 'CC-BY 4.0',
    },
    hp: 1150,
    enginePowerHp: 600, weightTons: 52, topSpeedKmh: 34, reverseSpeedKmh: 5,
    hullTraverseDegS: 18,
    terrainResistance: { hard: 1.25, medium: 1.45, soft: 2.6 },
    pivotStyle: 'pivot',
    // the giant slab turret slews painfully slowly — signature KV-2 feel
    turretTraverseDegS: 9, gunPitchDegS: 9, gunElevationDeg: 12, gunDepressionDeg: 5,
    gun: {
      caliberMm: 152, reloadS: 22.0, baseAccuracy: 0.60, aimTimeS: 4.0,
      bloom: BLOOM_WW2,
      shells: [
        shell('OF-530 HE', 'HE', 152, 86, 86, 860, 508),
        shell('BR-540 APHE', 'AP', 152, 125, 110, 640, 436),
        shell('G-530 semi-AP', 'AP', 152, 110, 98, 700, 436),
      ],
    },
    dims: { hullLengthM: 6.95, overallLengthM: 6.95, widthM: 3.32, heightM: 3.25 },
    armor: communityArmor({
      lenM: 6.95, widM: 3.32, hgtM: 3.25, turretPivot: [0, 1.75, -0.1],
      gunPivot: [0, 0.4, 0.4], barrelLenM: 3.2, barrelRadM: 0.1,
      frontMm: 75, sideMm: 75, rearMm: 60, roofMm: 30,
      tFrontMm: 75, tSideMm: 75, tRearMm: 75, mantletMm: 110,
    }),
    visual: {
      // r2: authored darker under the community paint-path lift (is7 note) —
      // the '#3e4a2e' 4BO rendered as pale flat sage on the pedestal
      scheme: 'solid', base: '#37412a', weather: '#404b33', patches: [],
      marking: 'number', number: '2', trackWidthM: 0.7,
    },
  },

  tiger2: {
    id: 'tiger2', name: 'Tiger II', nation: 'Germany', era: 'ww2', role: 'heavy',
    community: {
      author: 'maximus0075550',
      source: 'https://sketchfab.com/3d-models/tank-tiger-2',
      license: 'CC-BY 4.0',
    },
    hp: 1350,
    enginePowerHp: 700, weightTons: 69.8, topSpeedKmh: 38, reverseSpeedKmh: 7,
    hullTraverseDegS: 20,
    terrainResistance: { hard: 1.15, medium: 1.35, soft: 2.4 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 13, gunPitchDegS: 11, gunElevationDeg: 15, gunDepressionDeg: 8,
    gun: {
      caliberMm: 88, reloadS: 8.0, baseAccuracy: 0.30, aimTimeS: 2.2,
      bloom: BLOOM_WW2,
      shells: [
        shell('PzGr. 39/43 APCBC', 'AP', 88, 185, 165, 240, 1000),
        shell('PzGr. 40/43 APCR', 'APCR', 88, 217, 193, 215, 1130),
        shell('Sprgr. 43 HE', 'HE', 88, 44, 44, 295, 750),
      ],
    },
    dims: { hullLengthM: 7.38, overallLengthM: 10.29, widthM: 3.76, heightM: 3.09 },
    armor: communityArmor({
      lenM: 7.38, widM: 3.76, hgtM: 3.09, turretPivot: [0, 1.9, 0.1],
      gunPivot: [0, 0.35, 0.5], barrelLenM: 5.9, barrelRadM: 0.08,
      frontMm: 150, sideMm: 80, rearMm: 80, roofMm: 40,
      tFrontMm: 185, tSideMm: 80, tRearMm: 80, mantletMm: 200,
    }),
    visual: {
      // tank_models r7 ("monochrome sand-dip ... unpainted 3D print next to
      // the camo-painted fleet"): the solid dunkelgelb composite painted the
      // WHOLE asset one sand tone, gear included. The shell now rides the
      // per-spec camo canvas (paintUntextured+strip, kv2 rule) with the
      // 1944 factory language of the tiger1: Dunkelgelb + sprayed Olivgruen /
      // Rotbraun bands; running gear splits to dark steel in
      // applyCommunityFixes (generic Object_N node names — position split).
      scheme: 'stripes', base: '#8a7a52', weather: '#7e7049',
      patches: ['#5d6334', '#452c1e'],
      marking: 'cross', number: '204', trackWidthM: 0.8, camoScale: 0.5,
    },
  },

  sherman_jumbo: {
    id: 'sherman_jumbo', name: 'M4A3E2 Sherman Jumbo', nation: 'USA', era: 'ww2', role: 'heavy',
    community: {
      author: 'manifold_destiny (split by ZEUS_0815)',
      source: 'https://www.thingiverse.com/thing:1065360',
      license: 'CC-BY 4.0',
    },
    hp: 900,
    enginePowerHp: 450, weightTons: 38, topSpeedKmh: 35, reverseSpeedKmh: 7,
    hullTraverseDegS: 30,
    terrainResistance: { hard: 1.05, medium: 1.25, soft: 2.3 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 20, gunPitchDegS: 18, gunElevationDeg: 25, gunDepressionDeg: 10,
    gun: {
      caliberMm: 75, reloadS: 4.2, baseAccuracy: 0.40, aimTimeS: 2.1,
      bloom: BLOOM_WW2,
      shells: [
        shell('M61 APCBC', 'AP', 75, 92, 76, 110, 618),
        shell('M72 AP', 'AP', 75, 84, 66, 110, 619),
        shell('M48 HE', 'HE', 75, 38, 38, 175, 625),
      ],
    },
    dims: { hullLengthM: 6.27, overallLengthM: 6.35, widthM: 2.95, heightM: 2.95 },
    armor: communityArmor({
      lenM: 6.27, widM: 2.95, hgtM: 2.95, turretPivot: [0, 1.85, 0.0],
      gunPivot: [0, 0.35, 0.4], barrelLenM: 2.8, barrelRadM: 0.06,
      frontMm: 102, sideMm: 76, rearMm: 51, roofMm: 25,
      tFrontMm: 152, tSideMm: 152, tRearMm: 152, mantletMm: 178,
    }),
    visual: {
      scheme: 'solid', base: '#4b5320', weather: '#6b6b47', patches: [],
      marking: 'star', number: 'C-12', trackWidthM: 0.58,
    },
  },

  jagdtiger: {
    id: 'jagdtiger', name: 'Jagdtiger', nation: 'Germany', era: 'ww2', role: 'td',
    community: {
      author: 'Adi Priatna',
      source: 'https://sketchfab.com/adipriatna',
      license: 'CC-BY 4.0',
    },
    hp: 1400,
    enginePowerHp: 700, weightTons: 71.7, topSpeedKmh: 34, reverseSpeedKmh: 6,
    hullTraverseDegS: 18,
    terrainResistance: { hard: 1.2, medium: 1.4, soft: 2.5 },
    pivotStyle: 'neutral',
    // fixed casemate gun: the sim's virtual turret models the traverse arc
    turretTraverseDegS: 22, gunPitchDegS: 12, gunElevationDeg: 14, gunDepressionDeg: 7, gunArcDeg: 10,
    gun: {
      caliberMm: 128, reloadS: 11.0, baseAccuracy: 0.35, aimTimeS: 2.6,
      bloom: BLOOM_WW2,
      shells: [
        shell('PzGr. 43 APCBC', 'AP', 128, 200, 173, 460, 920),
        shell('PzGr. 40/43 APCR', 'APCR', 128, 237, 205, 400, 1080),
        shell('Sprgr. L/5 HE', 'HE', 128, 64, 64, 570, 920),
      ],
    },
    dims: { hullLengthM: 7.8, overallLengthM: 10.65, widthM: 3.7, heightM: 2.95 },
    armor: communityArmor({
      lenM: 7.8, widM: 3.7, hgtM: 2.95, turretPivot: [0, 1.8, 0.2],
      gunPivot: [0, 0.35, 0.4], barrelLenM: 4.7, barrelRadM: 0.09,
      frontMm: 150, sideMm: 80, rearMm: 80, roofMm: 40,
      tFrontMm: 250, tSideMm: 80, tRearMm: 80, mantletMm: 250, turretless: true,
    }),
    visual: {
      // solid steel-grey: the baked weathered texture carries the character;
      // a dunkelgelb stripe composite split the vehicle into a two-tone
      // sand-top / black-hull read (icon audit 2026-07-28).
      scheme: 'solid', base: '#5a6054', weather: '#666c60', patches: [],
      marking: 'cross', number: '314', trackWidthM: 0.8,
      // baked hull albedo is near-black — without this the composite skips
      // the hull sheets and the vehicle reads two-tone (tinted casemate over
      // a black hull). Named track/wheel mats still keep factory look.
      glbDarkPaintLuma: 0.03,
    },
  },

  jpz_e100: {
    id: 'jpz_e100', name: 'Jagdpanzer E100', nation: 'Germany', era: 'ww2', role: 'td',
    community: {
      author: 'Haphazard0587',
      source: 'https://www.thingiverse.com/thing:2624802',
      license: 'CC-BY 4.0',
    },
    hp: 2300,
    // Modernized 1,500 hp powerpack: still a deliberate 130-ton assault TD,
    // but no longer loses the match before it can reposition once.
    enginePowerHp: 1500, weightTons: 130, topSpeedKmh: 30, reverseSpeedKmh: 12,
    hullTraverseDegS: 20,
    terrainResistance: { hard: 1.05, medium: 1.25, soft: 2.05 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 24, gunPitchDegS: 14, gunElevationDeg: 15, gunDepressionDeg: 7, gunArcDeg: 12,
    gun: {
      // The 17 cm keeps the vehicle's high-alpha identity. Penetration and
      // handling now belong at Tier X, while a 22.5 s cycle prevents the
      // modernization from becoming a high-alpha DPM outlier.
      caliberMm: 170, reloadS: 22.5, baseAccuracy: 0.36, aimTimeS: 2.8,
      bloom: BLOOM_WW2,
      shells: [
        shell('17cm PzGr APCBC', 'AP', 170, 305, 270, 1150, 940),
        shell('17cm PzGr 50 APCR', 'APCR', 170, 352, 315, 1050, 1160),
        shell('17cm Sprgr HE', 'HE', 170, 95, 95, 1450, 900),
      ],
    },
    // 3.48 m is the as-modernized travel height through the low RWS; the
    // source-comparison fighting compartment itself remains ~3.3-3.4 m.
    dims: { hullLengthM: 8.7, overallLengthM: 11.1, widthM: 4.3, heightM: 3.48 },
    armor: communityArmor({
      lenM: 8.7, widM: 4.3, hgtM: 3.29, turretPivot: [0, 2.0, 0.2],
      gunPivot: [0, 0.4, 0.4], barrelLenM: 4.95, barrelRadM: 0.11,
      frontMm: 220, sideMm: 140, rearMm: 120, roofMm: 50,
      tFrontMm: 360, tSideMm: 150, tRearMm: 120, mantletMm: 420, turretless: true,
    }),
    visual: {
      scheme: 'nato', base: '#4c5740', weather: '#59634b',
      patches: ['#242820', '#57463a'], marking: 'cross', number: '100',
      trackWidthM: 0.9, camoScale: 0.48,
    },
  },

  sturmtiger: {
    id: 'sturmtiger', name: 'Sturmtiger', nation: 'Germany', era: 'ww2', role: 'td',
    community: {
      author: 'Tomrs',
      source: 'https://sketchfab.com/Tomrs',
      license: 'CC-BY 4.0',
    },
    hp: 1250,
    enginePowerHp: 700, weightTons: 65, topSpeedKmh: 40, reverseSpeedKmh: 6,
    hullTraverseDegS: 22,
    terrainResistance: { hard: 1.15, medium: 1.35, soft: 2.4 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 20, gunPitchDegS: 10, gunElevationDeg: 20, gunDepressionDeg: 4, gunArcDeg: 10,
    gun: {
      caliberMm: 380, reloadS: 30.0, baseAccuracy: 0.55, aimTimeS: 3.6,
      bloom: BLOOM_WW2,
      shells: [
        shell('RW61 38cm rocket HE', 'HE', 380, 95, 95, 1150, 250),
        shell('Raketen Hohlladung', 'HEAT', 380, 350, 350, 900, 250),
      ],
    },
    dims: { hullLengthM: 6.28, overallLengthM: 6.28, widthM: 3.57, heightM: 3.2 },
    armor: communityArmor({
      lenM: 6.28, widM: 3.57, hgtM: 3.2, turretPivot: [0, 2.0, 0.3],
      gunPivot: [0, 0.4, 0.3], barrelLenM: 2.5, barrelRadM: 0.19,
      frontMm: 150, sideMm: 80, rearMm: 80, roofMm: 40,
      tFrontMm: 150, tSideMm: 80, tRearMm: 80, mantletMm: 150, turretless: true,
    }),
    visual: {
      // factory dunkelgelb 3-tone + zimmerit is baked into the asset
      scheme: 'solid', base: '#8d7a4a', weather: '#7e6e44', patches: [],
      marking: 'cross', number: '1001', trackWidthM: 0.725,
    },
  },

  t95: {
    id: 't95', name: 'T95 Doomturtle', nation: 'USA', era: 'ww2', role: 'td',
    community: {
      author: 'Haphazard0587',
      source: 'https://www.thingiverse.com/thing:2326342',
      license: 'CC-BY 4.0',
    },
    hp: 1700,
    enginePowerHp: 500, weightTons: 86.2, topSpeedKmh: 14, reverseSpeedKmh: 4,
    hullTraverseDegS: 12,
    terrainResistance: { hard: 1.35, medium: 1.55, soft: 2.8 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 20, gunPitchDegS: 10, gunElevationDeg: 12, gunDepressionDeg: 5, gunArcDeg: 10,
    gun: {
      caliberMm: 105, reloadS: 9.0, baseAccuracy: 0.36, aimTimeS: 2.8,
      bloom: BLOOM_WW2,
      shells: [
        shell('T13 AP (105mm T5E1)', 'AP', 105, 210, 185, 400, 945),
        shell('T29E3 APCR', 'APCR', 105, 260, 230, 360, 1128),
        shell('105mm HE', 'HE', 105, 53, 53, 500, 945),
      ],
    },
    // §5.317: widthM 3.8 -> 3.86 (owner-ordered published datum — the T95's
    // shipping width; the fighting-trim stance over the outer tracks is 4.56,
    // documented as the packet two-datum note).
    dims: { hullLengthM: 7.6, overallLengthM: 10.7, widthM: 3.86, heightM: 2.9 },
    armor: communityArmor({
      lenM: 7.6, widM: 3.8, hgtM: 2.9, turretPivot: [0, 2.0, 0.3],
      gunPivot: [0, 0.35, 0.4], barrelLenM: 4.6, barrelRadM: 0.08,
      frontMm: 305, sideMm: 64, rearMm: 51, roofMm: 38,
      tFrontMm: 305, tSideMm: 64, tRearMm: 51, mantletMm: 305, turretless: true,
    }),
    visual: {
      scheme: 'solid', base: '#4b5320', weather: '#6b6b47', patches: [],
      marking: 'star', number: '95', trackWidthM: 0.5,
    },
  },

  t30: {
    id: 't30', name: 'T30', nation: 'USA', era: 'ww2', role: 'td',
    community: {
      author: 'Haphazard0587',
      source: 'https://www.thingiverse.com/thing:2363711',
      license: 'CC-BY 4.0',
    },
    hp: 1550,
    enginePowerHp: 704, weightTons: 64.7, topSpeedKmh: 35, reverseSpeedKmh: 6,
    hullTraverseDegS: 22,
    terrainResistance: { hard: 1.15, medium: 1.35, soft: 2.4 },
    pivotStyle: 'neutral',
    // The real T30 has a fully traversable turret. Asset limitations must not
    // rewrite vehicle mechanics; the fused source is retained only as a
    // rejected visual candidate below.
    turretTraverseDegS: 18, gunPitchDegS: 10, gunElevationDeg: 15, gunDepressionDeg: 6,
    gun: {
      caliberMm: 155, reloadS: 16.0, baseAccuracy: 0.42, aimTimeS: 3.0,
      bloom: BLOOM_WW2,
      shells: [
        shell('T35E1 APCBC (155mm)', 'AP', 155, 180, 160, 700, 723),
        shell('T29E1 APCR', 'APCR', 155, 220, 195, 620, 861),
        shell('M107 HE', 'HE', 155, 78, 78, 920, 723),
      ],
    },
    dims: { hullLengthM: 7.6, overallLengthM: 10.9, widthM: 3.8, heightM: 3.25 },
    armor: communityArmor({
      lenM: 7.6, widM: 3.8, hgtM: 3.25, turretPivot: [0, 2.3, 0.0],
      gunPivot: [0, 0.35, 0.5], barrelLenM: 4.9, barrelRadM: 0.1,
      frontMm: 102, sideMm: 76, rearMm: 51, roofMm: 38,
      tFrontMm: 203, tSideMm: 127, tRearMm: 102, mantletMm: 203,
    }),
    visual: {
      scheme: 'solid', base: '#4b5320', weather: '#6b6b47', patches: [],
      marking: 'star', number: '30', trackWidthM: 0.71,
    },
  },

  // =========================================================================
  // COMMUNITY WAVE 3 (IS-series hunt, integrated 2026-07-28)
  // =========================================================================

  is7: {
    id: 'is7', name: 'IS-7', nation: 'USSR', era: 'ww2', role: 'heavy',
    community: {
      author: 'Jt Steele (SnowLeopard101)',
      source: 'https://www.thingiverse.com/thing:4597176',
      license: 'CC-BY 4.0',
    },
    hp: 1550,
    enginePowerHp: 1050, weightTons: 68, topSpeedKmh: 59, reverseSpeedKmh: 8,
    hullTraverseDegS: 26,
    terrainResistance: { hard: 1.1, medium: 1.3, soft: 2.3 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 16, gunPitchDegS: 12, gunElevationDeg: 15, gunDepressionDeg: 6,
    gun: {
      caliberMm: 130, reloadS: 12.5, baseAccuracy: 0.40, aimTimeS: 3.0,
      bloom: BLOOM_WW2,
      shells: [
        shell('BR-482 APCBC (130mm S-70)', 'AP', 130, 240, 210, 530, 900),
        shell('BR-482B APCR', 'APCR', 130, 280, 245, 470, 1030),
        shell('OF-482 HE', 'HE', 130, 65, 65, 640, 900),
      ],
    },
    dims: { hullLengthM: 7.38, overallLengthM: 11.17, widthM: 3.4, heightM: 2.6 },
    armor: communityArmor({
      lenM: 7.38, widM: 3.4, hgtM: 2.6, turretPivot: [0, 1.7, -0.3],
      gunPivot: [0, 0.35, 0.5], barrelLenM: 5.6, barrelRadM: 0.1,
      frontMm: 150, sideMm: 105, rearMm: 70, roofMm: 30,
      tFrontMm: 240, tSideMm: 185, tRearMm: 94, mantletMm: 250,
    }),
    visual: {
      // tank_models r2 (critic: "uniform chartreuse/lime clay"): authored a
      // step darker/grayer — the community-GLB paint path (ambient floor +
      // view fill + dust overlay) lifts tones well above the procedural
      // fleet, so the shared 4BO family must be authored under it (strv103
      // rule). Lands beside the T-34/IS-2 greens on the pedestal.
      // tank_models r5 ("still a step too bright/lime next to KV-2's deeper
      // soviet green"): another step down + slightly grayer, landing on the
      // kv2 pedestal value.
      scheme: 'solid', base: '#333c27', weather: '#3b4530', patches: [],
      marking: 'number', number: '7', trackWidthM: 0.71,
    },
  },

  object279: {
    id: 'object279', name: 'Object 279', nation: 'USSR', era: 'ww2', role: 'heavy',
    community: {
      author: 'Jt Steele (SnowLeopard101)',
      source: 'https://www.thingiverse.com/thing:4598065',
      license: 'CC-BY 4.0',
    },
    hp: 1500,
    enginePowerHp: 950, weightTons: 60, topSpeedKmh: 55, reverseSpeedKmh: 7,
    // quad-track chassis: superb flotation on soft ground, ponderous traverse
    hullTraverseDegS: 16,
    terrainResistance: { hard: 1.2, medium: 1.3, soft: 1.9 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 14, gunPitchDegS: 10, gunElevationDeg: 15, gunDepressionDeg: 5,
    gun: {
      caliberMm: 130, reloadS: 13.5, baseAccuracy: 0.40, aimTimeS: 3.1,
      bloom: BLOOM_WW2,
      shells: [
        shell('BR-482M APCBC (130mm M-65)', 'AP', 130, 258, 225, 530, 950),
        shell('BR-482P APCR', 'APCR', 130, 305, 265, 470, 1080),
        shell('OF-482M HE', 'HE', 130, 65, 65, 640, 950),
      ],
    },
    dims: { hullLengthM: 6.99, overallLengthM: 10.24, widthM: 3.4, heightM: 2.6 },
    armor: communityArmor({
      lenM: 6.99, widM: 3.4, hgtM: 2.6, turretPivot: [0, 1.75, -0.2],
      gunPivot: [0, 0.35, 0.5], barrelLenM: 5.4, barrelRadM: 0.1,
      frontMm: 220, sideMm: 130, rearMm: 80, roofMm: 40,
      tFrontMm: 305, tSideMm: 217, tRearMm: 94, mantletMm: 305,
    }),
    visual: {
      scheme: 'solid', base: '#445032', weather: '#4f5b3e', patches: [],
      marking: 'number', number: '279', trackWidthM: 0.58,
    },
  },

  is6b: {
    id: 'is6b', name: 'IS-6B', nation: 'USSR', era: 'ww2', role: 'heavy',
    community: {
      author: 'Jt Steele (SnowLeopard101)',
      source: 'https://www.thingiverse.com/thing:4849489',
      license: 'CC-BY 4.0',
    },
    hp: 1300,
    enginePowerHp: 700, weightTons: 54, topSpeedKmh: 43, reverseSpeedKmh: 6,
    hullTraverseDegS: 20,
    terrainResistance: { hard: 1.15, medium: 1.35, soft: 2.4 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 16, gunPitchDegS: 12, gunElevationDeg: 18, gunDepressionDeg: 4,
    gun: {
      caliberMm: 122, reloadS: 12.0, baseAccuracy: 0.43, aimTimeS: 3.0,
      bloom: BLOOM_WW2,
      shells: [
        shell('BR-471D APBC (122mm D-30)', 'AP', 122, 190, 165, 390, 850),
        shell('BR-471 APHE', 'AP', 122, 175, 150, 390, 800),
        shell('OF-471 HE', 'HE', 122, 61, 61, 450, 800),
      ],
    },
    dims: { hullLengthM: 6.9, overallLengthM: 9.1, widthM: 3.2, heightM: 2.5 },
    armor: communityArmor({
      lenM: 6.9, widM: 3.2, hgtM: 2.5, turretPivot: [0, 1.65, -0.2],
      gunPivot: [0, 0.32, 0.5], barrelLenM: 4.8, barrelRadM: 0.09,
      frontMm: 100, sideMm: 100, rearMm: 60, roofMm: 30,
      tFrontMm: 150, tSideMm: 150, tRearMm: 100, mantletMm: 160,
    }),
    visual: {
      scheme: 'solid', base: '#445032', weather: '#4f5b3e', patches: [],
      marking: 'number', number: '6', trackWidthM: 0.65,
    },
  },

  is1: {
    // The IS-1 is a turreted heavy tank. The old fixed-gun handling described
    // the limitations of one fused print, not the real vehicle.
    id: 'is1', name: 'IS-1', nation: 'USSR', era: 'ww2', role: 'heavy', visualBase: 'is2',
    community: {
      author: 'AaronTMG',
      source: 'https://www.printables.com/model/925804-is-1-russian-heavy-tank',
      license: 'CC-BY 4.0',
    },
    hp: 1000,
    enginePowerHp: 520, weightTons: 44, topSpeedKmh: 37, reverseSpeedKmh: 5,
    hullTraverseDegS: 24,
    terrainResistance: { hard: 1.1, medium: 1.3, soft: 2.3 },
    pivotStyle: 'pivot',
    turretTraverseDegS: 24, gunPitchDegS: 14, gunElevationDeg: 20, gunDepressionDeg: 5,
    gun: {
      caliberMm: 85, reloadS: 5.5, baseAccuracy: 0.40, aimTimeS: 2.4,
      bloom: BLOOM_WW2,
      shells: [
        shell('BR-365 APCBC (85mm D-5T)', 'AP', 85, 120, 102, 220, 792),
        shell('BR-365P APCR', 'APCR', 85, 140, 120, 195, 1050),
        shell('O-365 HE', 'HE', 85, 43, 43, 280, 785),
      ],
    },
    dims: { hullLengthM: 6.77, overallLengthM: 8.56, widthM: 3.07, heightM: 2.73 },
    armor: communityArmor({
      lenM: 6.77, widM: 3.07, hgtM: 2.73, turretPivot: [0, 1.75, -0.1],
      gunPivot: [0, 0.35, 0.4], barrelLenM: 4.0, barrelRadM: 0.07,
      frontMm: 100, sideMm: 90, rearMm: 60, roofMm: 30,
      tFrontMm: 100, tSideMm: 100, tRearMm: 100, mantletMm: 120,
    }),
    visual: {
      scheme: 'solid', base: '#445032', weather: '#4f5b3e', patches: [],
      marking: 'number', number: '113', trackWidthM: 0.65,
    },
  },
};

Object.assign(TANK_SPECS, FIRST_PARTY_EXPANSION_SPECS);

/** Core + first-party expansion ids — the full selectable garage roster. */
export const ALL_TANK_IDS = [...TANK_IDS, ...FIRST_PARTY_EXPANSION_TANK_IDS];

// Canonical roster projections populated after every registration wave.
// ALL_TANK_IDS intentionally remains the established release/anatomy roster;
// consumers choose the projection matching their responsibility.
export const SAVED_TANK_IDS = Object.keys(TANK_SPECS);
export const DEVELOPMENT_TANK_IDS = SAVED_TANK_IDS.filter(
  (id) => !RETIRED_EXTERNAL_PLACEHOLDER_IDS.has(id),
);
export const PRODUCTION_TANK_IDS = ALL_TANK_IDS.filter((id) => !isProductionHiddenTankId(id));
export const VISIBLE_TANK_IDS = DEV_FLEET_ACTIVE
  ? [...DEVELOPMENT_TANK_IDS]
  : [...PRODUCTION_TANK_IDS];
export const RUNTIME_TANK_IDS = DEV_FLEET_ACTIVE
  ? [...DEVELOPMENT_TANK_IDS]
  : [...ALL_TANK_IDS];

// Generic externally-authored placeholders are useful archaeological/reference
// records, but they are not historical vehicles authored by this project and
// therefore cannot be selectable.  Keep their dormant spec/source notes out of
// ALL_TANK_IDS while retaining the audit trail in this file.
export { RETIRED_EXTERNAL_PLACEHOLDER_IDS };

const FIRST_PARTY_DISPLAY_NAMES = {
  t34_85_cad: 'T-34-85 obr. 1944',
  newc_tiger: 'Tiger I Early',
  newc_pziii: 'Panzer III Ausf. J',
  pziii_konserwa: 'Panzer III Ausf. E',
  is3_bergman: 'IS-3 Late',
};

/**
 * Seal the public roster after all extension packs register their rows.
 *
 * Geometry provenance is enforced separately by tank:native:check.  This
 * removes obsolete UI credit metadata that described retired comparison
 * references rather than the live procedural model, normalizes source-branded
 * display names, and makes generic third-party placeholders unselectable.
 */
export function finalizeFirstPartyRoster() {
  for (let i = TANK_IDS.length - 1; i >= 0; i -= 1) {
    const spec = TANK_SPECS[TANK_IDS[i]];
    if (isRetiredHistoricalTank(spec)) TANK_IDS.splice(i, 1);
  }
  for (let i = ALL_TANK_IDS.length - 1; i >= 0; i -= 1) {
    const id = ALL_TANK_IDS[i];
    if (RETIRED_EXTERNAL_PLACEHOLDER_IDS.has(id) || isRetiredHistoricalTank(TANK_SPECS[id])) {
      ALL_TANK_IDS.splice(i, 1);
    }
  }
  const activeRoster = new Set(ALL_TANK_IDS);
  const savedIds = Object.keys(TANK_SPECS);
  const developmentIds = savedIds.filter((id) => !RETIRED_EXTERNAL_PLACEHOLDER_IDS.has(id));
  const productionIds = ALL_TANK_IDS.filter((id) => !isProductionHiddenTankId(id));

  SAVED_TANK_IDS.splice(0, SAVED_TANK_IDS.length, ...savedIds);
  DEVELOPMENT_TANK_IDS.splice(0, DEVELOPMENT_TANK_IDS.length, ...developmentIds);
  PRODUCTION_TANK_IDS.splice(0, PRODUCTION_TANK_IDS.length, ...productionIds);
  VISIBLE_TANK_IDS.splice(
    0,
    VISIBLE_TANK_IDS.length,
    ...(DEV_FLEET_ACTIVE ? developmentIds : productionIds),
  );
  RUNTIME_TANK_IDS.splice(
    0,
    RUNTIME_TANK_IDS.length,
    ...(DEV_FLEET_ACTIVE ? developmentIds : ALL_TANK_IDS),
  );

  const productionSet = new Set(productionIds);
  for (const id of savedIds) {
    const spec = TANK_SPECS[id];
    if (!spec) continue;
    applyVehicleTaxonomy(spec);
    delete spec.community;
    delete spec.publicVisualFallback;
    if (FIRST_PARTY_DISPLAY_NAMES[id]) spec.name = FIRST_PARTY_DISPLAY_NAMES[id];
    const label = tankLabelRecord(spec);
    spec.name = label.displayName;
    spec.label = label;
    spec.markings = vehicleMarkingRecord(spec);
    spec.authorship = FIRST_PARTY_VEHICLE_AUTHORSHIP;
    const productionVisible = productionSet.has(id);
    spec.roster = Object.freeze({
      productionVisible,
      localVisible: !RETIRED_EXTERNAL_PLACEHOLDER_IDS.has(id),
      developmentOnly: !productionVisible,
      tag: productionVisible
        ? ''
        : RETIRED_EXTERNAL_PLACEHOLDER_IDS.has(id) ? 'REF' : DEV_FLEET_LABEL,
      reason: productionVisible
        ? 'production'
        : developmentOnlyReason(spec, { activeRoster: activeRoster.has(id) }),
    });
  }
}

// ---------------------------------------------------------------------------
// Visual source of truth per tank: 'procedural' | 'glb'.
// 'glb' additionally needs { glb: { path, yawOffset?, turretNode?, gunNode? } }
// (see src/vehicles/modelLoader.js). Deep-hunt verdict 2026-07: ONE sourced
// model beat its procedural counterpart — the dannzjs M1A2 SEPv3 (CC-BY-4.0,
// docs/ATTRIBUTION.md). The other 7 stay procedural: every other candidate on
// the allowed sources was either not recognizable as the specific vehicle,
// had no articulable turret node, had no usable materials, or was a ripped
// game asset (forbidden).
// ---------------------------------------------------------------------------
export const MODEL_SOURCE = {
  m4a3e8: { source: 'procedural' },
  tiger1: { source: 'procedural' },
  t34_85: { source: 'procedural' },
  is2: { source: 'procedural' },
  panther_g: { source: 'procedural' },
  // m1a2: DUAL-GATE GRADUATE (2026-08-04) — the program's 17th. Geometry
  // min 91.5 gatePassed x2 + graduation critic 9.0 on ALL FOURTEEN views
  // (floor 8.0 -> 8.6 -> 8.8 -> 9.0 across the SEPv2 realign + six visual
  // rounds; mean 9.08). ARC: the original dannzjs "SEPv3" oracle was a
  // MISLABELED LEOPARD 2A5 (owner-identified 2026-08-03) — honest reset to
  // 0, full realign vs the recovered SEPv2 exemplar, the shared-track-rig
  // owner directive, wheel anatomy rebuilt to the print. NO MODEL_SOURCE —
  // freeze hash bc225318 via tmp-hashgeo; the SEPv2 oracle stays on disk
  // (LOCAL-ONLY QUARANTINE) as the measurement reference in all three
  // override maps. The public-build gate below is now vacuous (kept as
  // documentation of the quarantine polarity).
  m1a2: { source: 'procedural' },
  m1a2_legacy: { source: 'procedural' },
  t90m: { source: 'procedural' },
  t90m_proryv: { source: 'procedural' },
  leo2a7: { source: 'procedural' },
};

// PUBLIC-BUILD GATE for the m1a2 exemplar: its GLB lives under
// community/recovered/ (LOCAL-ONLY QUARANTINE — strip-nc-assets deletes that
// whole tree from public dists, and its postbuild guard fails the build if a
// registered playable still points there). Same polarity as the userdrops
// gates: only an explicit local/dev vite env keeps the GLB; public builds and
// bare-node imports (the strip guard itself) fall back to the procedural
// m1a2, which ships everywhere.
// (graduation 2026-08-04: m1a2 is procedural everywhere — the gate below
// is retained as a no-op safety for any future recovered-path registration.)
{
  const allowLocalRecovered = typeof import.meta !== 'undefined'
    && import.meta.env && !import.meta.env.VITE_PUBLIC_BUILD;
  if (!allowLocalRecovered && MODEL_SOURCE.m1a2 && MODEL_SOURCE.m1a2.source === 'glb') delete MODEL_SOURCE.m1a2;
}

// COMMUNITY TANKS: all sourced GLBs (public/models/tanks/community/*.glb).
// Node names below were verified offline against each asset's node tree
// (GLTFLoader sanitizes names: dots stripped, e.g. 'Plane.000' -> 'Plane000').
// glb config extensions understood by modelLoader.applySwap:
//   fixedMount      — casemate vehicle: no turret node; whole model rides the
//                     hull, sim aims a virtual turret (muzzle anchors only)
//   autoPivot       — derive turret yaw / gun pitch pivots from the asset's
//                     node origins / subtree bounds (community assets carry
//                     ring-centered pivots or clean node splits)
//   pivot           — explicit [x,y,z] turret pivot override, in post-yaw raw
//                     model units (scaled by the normalization factor)
//   scaleToOverall  — normalize scale against dims.overallLengthM even when a
//                     gun node exists (single-skinned-mesh models where the
//                     barrel cannot be excluded from the bbox)
//   paintUntextured — box-UV untextured meshes onto the shared camo canvas
//                     (material-upgrade pass for flat-color / CAD assets)
Object.assign(MODEL_SOURCE, {
  // §5.31b ERA-GROUP FLIP (owner, 2026-08-08 — "im not seeing our custom
  // models on our deployed versions, only the actual comparison models"):
  // every era-placed community id below with a dedicated procedural profile
  // (ww2.js / casemate.js / soviet-heavy.js) flips to source 'procedural' —
  // OUR custom build is the render of record in every build, and the
  // community print retires to candidateGlb (kv2/t30 pattern: config kept
  // verbatim for the repeatable A/B audit and as the machine-readable feed
  // for the Sources print catalog). Every playable now resolves through our
  // authored procedural profile; comparison GLBs are candidate-only inputs.
  strv103: {
    source: 'procedural',
    // r9: paintUntextured routes the asset through the same material
    // normalization as the other community GLBs (tiny palette maps stripped,
    // shell box-UV'd onto the live camo canvas, gear split to dark steel) —
    // it was the one sourced tank skipping the cohesion pass.
    candidateGlb: {
      path: '/models/tanks/community/strv103_wesiora.glb', fixedMount: true,
      paintUntextured: true,
    },
  },
  is3: {
    source: 'procedural', // §5.31b flip — soviet-heavy.js profile renders
    // content_breadth r2: stripBakedTextures — same cohesion treatment as
    // kv2/is7 (r1 TM #188): the baked albedo rendered flat single-tone lime
    // clay next to the camo-painted fleet; route the shell onto the shared
    // camo canvas + weathering instead.
    candidateGlb: {
      path: '/models/tanks/community/is3_panzerfactory.glb',
      turretNode: '^turret$', gunNode: '^gun$', autoPivot: true,
      paintUntextured: true, stripBakedTextures: true,
    },
  },
  t34_85_cad: {
    source: 'procedural', // §5.31b flip — ww2.js profile renders
    candidateGlb: {
      path: '/models/tanks/community/t34_85_weihe.glb',
      turretNode: '^turret$', autoPivot: true, paintUntextured: true,
    },
  },
  // r7: the Newc42 assets carry an 8x1 palette atlas — every face samples ONE
  // texel, so the texture-space camo composite can never show a pattern
  // (Desert rendered the whole tank flat chocolate). paintUntextured now
  // strips tiny palette maps and box-UVs the shell onto the live camo canvas,
  // with node-name material separation for tracks/wheels.
  newc_tiger: {
    source: 'procedural',
    candidateGlb: {
      path: '/models/tanks/community/tiger_newc42.glb',
      turretNode: '^Turret$', gunNode: '^Barrel$', autoPivot: true,
      paintUntextured: true,
    },
  },
  newc_pziii: {
    source: 'procedural', // §5.31b flip — ww2.js profile renders
    candidateGlb: {
      path: '/models/tanks/community/pziii_newc42.glb',
      turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
      paintUntextured: true,
    },
  },
  pziii_konserwa: {
    source: 'procedural', // §5.31b flip — ww2.js profile renders
    // content_breadth r2: stripBakedTextures — kv2/is7 cohesion treatment;
    // the thumb rendered bare grey plastic next to the camo-painted fleet.
    candidateGlb: {
      path: '/models/tanks/community/pziii_konserwa.glb',
      turretNode: '^Plane000$', yawOffset: Math.PI, autoPivot: true,
      pivot: [0, 0.545, 0.12], paintUntextured: true, stripBakedTextures: true,
    },
  },
  leichttraktor: {
    source: 'procedural', // §5.31b flip — ww2.js profile renders
    candidateGlb: {
      path: '/models/tanks/community/leichttraktor_newc42.glb',
      turretNode: '^Turret$', gunNode: '^Gun$', autoPivot: true,
      paintUntextured: true,
    },
  },
  recon_tank: {
    source: 'procedural',
    candidateGlb: {
      path: '/models/tanks/community/recon_tank_mophs.glb',
      turretNode: '^Turret$', gunNode: '^Barrel$', autoPivot: true,
      scaleToOverall: true,
    },
  },
  q_heavy: {
    source: 'procedural',
    candidateGlb: {
      path: '/models/tanks/community/tank_quaternius_fa5.glb',
      turretNode: '^Tank_Turret$', gunNode: '^Tank_Gun$',
      yawOffset: Math.PI / 2, autoPivot: true,
      // r7: restyled with the shared camo canvas + dark gear materials — the
      // factory banana-cream palette read as a toy from a different game.
      paintUntextured: true,
    },
  },

  // -------------------------------------------------------------------------
  // COMMUNITY WAVE 2 (2026-07-28). Node names / orientations verified offline
  // against each GLB's node tree (scratch probe renders). Fused single-mesh
  // print models ship as fixed-gun TD-class vehicles per the integration rule.
  // -------------------------------------------------------------------------
  kv2: {
    // DUAL-GATE GRADUATE (2026-07-31): the procedural KV-2 passed the full
    // geometric gate (min 90.1) + shaded parity — it ships EVERYWHERE now
    // (local + public). The sourced print is retired to candidateGlb for the
    // repeatable A/B audit (t30 pattern); config notes preserved below.
    source: 'procedural',
    // named hull/turret/tracks/wheels groups; gun fused into the turret mesh
    // (yaw articulates, pitch stays virtual). Authored ring-center origin.
    // tank_models r1: paintUntextured + stripBakedTextures — the baked
    // rust-orange/carnival albedo and silver grille moiré read as a different
    // game next to the repainted fleet ("two material worlds" critique).
    // Baked normal maps are kept; tracks/wheels nodes take the gear split.
    candidateGlb: {
      path: '/models/tanks/community/kv2-full-comrade1280.glb',
      turretNode: '^turret$', autoPivot: true,
      paintUntextured: true, stripBakedTextures: true,
    },
  },
  tiger2: {
    source: 'procedural', // §5.31b flip — ww2.js profile renders
    // 20 flat sibling meshes; Object_2 = turret + gun (verified by isolation
    // render). Explicit pivot: the turret bbox includes the long 88 L/71, so
    // the footprint-center fallback would land ~1.3 m too far forward.
    // tank_models r7 ("monochrome sand-dip"): paintUntextured + strip routes
    // the baked one-tone albedo onto the per-spec camo canvas (kv2 rule);
    // running gear + welded-in hull furniture split in applyCommunityFixes
    // (the asset ships generic Object_N names, so the node-name gear regex
    // never fires — position classification instead).
    candidateGlb: {
      path: '/models/tanks/community/tiger2-maximus.glb',
      turretNode: '^Object_2$', autoPivot: true, pivot: [0, 1.9, -1.3],
      paintUntextured: true, stripBakedTextures: true,
    },
  },
  sherman_jumbo: {
    source: 'procedural', // §5.31b flip — ww2.js profile renders
    // print plates re-assembled by the scout: hull/turret/tracks_l/tracks_r
    // named nodes. Explicit pivot from the turret base-rim centroid (the
    // fused 75mm tube drags the bbox-center fallback forward).
    candidateGlb: {
      path: '/models/tanks/community/sherman-jumbo.glb',
      turretNode: '^turret$', autoPivot: true, pivot: [0, 1.25, 0.0],
      paintUntextured: true,
    },
  },
  jagdtiger: {
    source: 'procedural', // §5.31b flip — casemate.js profile renders
    candidateGlb: { path: '/models/tanks/community/jagdtiger-adipriatna.glb', fixedMount: true },
  },
  jpz_e100: {
    source: 'procedural', // §5.31b flip — casemate.js profile renders
    candidateGlb: {
      path: '/models/tanks/community/jagdpanzer_e100_haphazard.glb',
      fixedMount: true, paintUntextured: true,
    },
  },
  sturmtiger: {
    source: 'procedural', // §5.31b flip — casemate.js profile renders
    // asset faces +x — rotate to the +z convention
    candidateGlb: {
      path: '/models/tanks/community/sturmtiger-tomrs.glb',
      fixedMount: true, yawOffset: -Math.PI / 2,
    },
  },
  t95: {
    source: 'procedural', // §5.31b flip — casemate.js profile renders
    candidateGlb: {
      path: '/models/tanks/community/t95_doomturtle_haphazard.glb',
      fixedMount: true, yawOffset: Math.PI, paintUntextured: true,
    },
  },
  t30: {
    source: 'procedural',
    // Kept for the repeatable A/B audit, but never activated: it is one fused
    // hull mesh and cannot represent the real vehicle's turret or elevation.
    candidateGlb: {
      path: '/models/tanks/community/t30_haphazard.glb',
      yawOffset: Math.PI, paintUntextured: true,
    },
    qaReason: 'single fused mesh cannot articulate the real T30 turret',
  },

  // -------------------------------------------------------------------------
  // COMMUNITY WAVE 3 (IS-series hunt, 2026-07-28). Print STLs re-assembled
  // and normalized offline (Blender pipeline — see the LICENSE-RECORDs):
  // real-meter scale, grounded at y=0, gun facing +z, Hull/Turret node splits
  // preserved. Turret node origins are mesh offsets (not ring centers) and
  // the turret bboxes include the fused gun tube, so the footprint-center
  // fallback would seat the ring too far forward — explicit pivots below come
  // from base-band centroid probes (tools/tmp-glbprobe.html, tiger2 rule).
  // Guns are fused into the turret meshes: yaw articulates, pitch stays
  // virtual (kv2 rule). All untextured prints ride the shared camo canvas.
  // -------------------------------------------------------------------------
  is7: {
    source: 'procedural',
    candidateGlb: {
      path: '/models/tanks/community/is7-snowleopard.glb',
      turretNode: '^Turret$', autoPivot: true, pivot: [0, 1.08, -1.37],
      paintUntextured: true,
    },
  },
  object279: {
    source: 'procedural',
    // quad-track pods live under Hull (TracksL/TracksR nodes stay hull-fixed)
    candidateGlb: {
      path: '/models/tanks/community/object279-snowleopard.glb',
      turretNode: '^Turret$', autoPivot: true, pivot: [0, 1.4, -1.3],
      paintUntextured: true,
    },
  },
  is6b: {
    source: 'procedural', // §5.31b flip — soviet-heavy.js profile renders
    candidateGlb: {
      path: '/models/tanks/community/is6b-snowleopard.glb',
      turretNode: '^Turret$', autoPivot: true, pivot: [0, 1.02, -0.37],
      paintUntextured: true,
    },
  },
  is1: {
    source: 'procedural',
    candidateGlb: {
      path: '/models/tanks/community/is1-aarontmg.glb',
      paintUntextured: true,
    },
    qaReason: 'single fused mesh cannot articulate the real IS-1 turret',
  },
});

/**
 * TRACK-HITBOX SCHEMA (combat round 2026-08-06, owner order: "make track
 * hitboxes represented and look much more accurate ... theyre just a bunch
 * of rectangles"). Attach real track-shape volumes to an ArmorModel:
 *
 *   armor.trackShapes = [{
 *     module: 'trackL'|'trackR',       // combat module the prism damages
 *     x0, x1,                          // hull-local lateral slab (x0 < x1)
 *     poly: [[z,y], ...],              // convex CCW side-view silhouette
 *     plate: {name, physicalMm, keMm, ceMm, kind:'external',
 *             era:null, moduleLink, gunFollow:false},  // screen stats
 *   }, ...]
 *
 * Each entry is a convex prism (the polygon extruded across [x0,x1]) that
 * REPLACES, for ray tests only, the legacy hand-authored track pair — the
 * full-length rectangle plate (sR/sL 'track_R'/'track_L') and the trackL/R
 * module AABB. sim/armor.traceTank consumes it (prism entry face = the
 * external track screen with a TRUE surface normal — vertical band side,
 * angled approach/departure ramps, raised end-wheel wraps); the killcam
 * x-ray draws it. The legacy plates/boxes STAY in the model as authored:
 * plates keep feeding the HE nearest-face AABB, boxes keep feeding HE blast
 * targets, killcam shader bands and ghost anatomy — traceTank simply skips
 * them when trackShapes is present, and every armor model WITHOUT
 * trackShapes (headless probes, hand-built selftest models, gearless
 * community placeholders) keeps the legacy path bit-identical.
 *
 * `hulls` comes from the running gear actually built for this spec
 * (buildRunningGear publishes {x0,x1,poly} per unit — wheel positions/radii
 * and band profile truth), so the hitbox follows the real \____/ trapezoid
 * run per tank with zero hand-authoring. Idempotent: recomputes and
 * overwrites on every call. HAND-OVERRIDE HOOK for odd rigs: author
 * `armor.trackShapesOverride = [...]` (same entry shape, minus `plate`
 * which is still auto-wired) on a spec and it wins over the derived hulls.
 *
 * @param {object} armor ArmorModel (mutated in place)
 * @param {Array<{x0:number,x1:number,poly:Array}>} hulls derived per-unit
 *   track hulls, RIGHT-side coordinates (x0>0); mirrored here for the left
 * @returns {object} the same armor object
 */
export function attachTrackShapes(armor, hulls) {
  if (!armor) return armor;
  const src = Array.isArray(armor.trackShapesOverride) && armor.trackShapesOverride.length
    ? armor.trackShapesOverride
    : hulls;
  if (!Array.isArray(src) || !src.length) return armor;
  const shapes = [];
  for (const h of src) {
    if (!h || !Array.isArray(h.poly) || h.poly.length < 3) continue;
    const sides = h.module === 'trackL' ? [-1] : h.module === 'trackR' ? [1] : [-1, 1];
    for (const side of sides) {
      const module = side < 0 ? 'trackL' : 'trackR';
      const legacy = (armor.hullPlates || []).find(
        (p) => p.moduleLink === module && p.kind === 'external');
      const lo = Math.min(Math.abs(h.x0), Math.abs(h.x1));
      const hi = Math.max(Math.abs(h.x0), Math.abs(h.x1));
      shapes.push({
        module,
        x0: side < 0 ? -hi : lo,
        x1: side < 0 ? -lo : hi,
        poly: h.poly.map((v) => [v[0], v[1]]),
        plate: {
          name: legacy ? legacy.name : (side < 0 ? 'track_L' : 'track_R'),
          physicalMm: legacy ? legacy.physicalMm : 20,
          keMm: legacy ? legacy.keMm : 20,
          ceMm: legacy ? legacy.ceMm : 20,
          kind: 'external',
          era: null,
          moduleLink: module,
          gunFollow: false,
        },
      });
    }
  }
  if (shapes.length) armor.trackShapes = shapes;
  return armor;
}

/**
 * Fit a (deep-copied) donor armor model to a recipient's published dims
 * (module_hitbox r1). Recovered/derived vehicles copy their donor's spec and
 * patch `dims` — but the armor GEOMETRY (plates, module/crew boxes, pivots)
 * stayed donor-sized, so hit resolution disagreed with the rendered vehicle
 * by up to 1.2 m (m60a1 carried Leopard-1 armor: every shot at its rendered
 * upper hull/turret passed through air). The geometry gate pins every visual
 * to spec.dims, so a per-axis affine fit re-derives the armor envelope from
 * the same measured truth the visual is built to.
 *
 * Scales positions only — plate thickness/ratings (physicalMm/keMm/ceMm) and
 * ERA values are design stats and stay untouched. Slopes change by the axis
 * ratio (second-order next to the envelope error being fixed). MUTATES and
 * returns `armor`; call on a copy, never a shared donor reference.
 *
 * @param {object} armor ArmorModel (deep copy, mutated in place)
 * @param {object} fromDims donor spec.dims
 * @param {object} toDims recipient spec.dims
 * @returns {object} the same armor object, fitted
 */
export function fitArmorToDims(armor, fromDims, toDims) {
  if (!armor || !fromDims || !toDims) return armor;
  const ratio = (a, b) => (a > 0 && b > 0 ? b / a : 1);
  const sx = ratio(fromDims.widthM, toDims.widthM);
  const sy = ratio(fromDims.heightM, toDims.heightM);
  const sz = ratio(fromDims.hullLengthM, toDims.hullLengthM);
  if (Math.abs(sx - 1) < 1e-3 && Math.abs(sy - 1) < 1e-3 && Math.abs(sz - 1) < 1e-3) return armor;
  const v3 = (v) => { v[0] *= sx; v[1] *= sy; v[2] *= sz; };
  for (const plates of [armor.hullPlates, armor.turretPlates]) {
    for (const p of plates || []) for (const v of p.verts) v3(v);
  }
  for (const list of [armor.modules, armor.crew]) {
    for (const b of list || []) { v3(b.min); v3(b.max); }
  }
  // derived track prisms scale like every other armor position (plate stats
  // inside stay design values, same rule as plates)
  for (const s of armor.trackShapes || []) {
    s.x0 *= sx; s.x1 *= sx;
    for (const v of s.poly) { v[0] *= sz; v[1] *= sy; }
  }
  if (armor.turretPivot) v3(armor.turretPivot);
  if (armor.gunPivot) v3(armor.gunPivot);
  if (armor.gunBarrel) armor.gunBarrel.lengthM *= sz;
  if (armor.boundingRadiusM) armor.boundingRadiusM *= Math.max(sx, sz);
  return armor;
}

/**
 * Look up a tank spec by id.
 * @param {string} id one of TANK_IDS
 * @returns {object} TankSpec (ARCHITECTURE §2.2)
 * @throws {Error} on unknown id
 */
export function getSpec(id) {
  const s = TANK_SPECS[id];
  if (!s) throw new Error(`Unknown tank id: ${id}`);
  return s;
}
