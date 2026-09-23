// src/vehicles/donorSpecs.ts — unregistered combat-data donors.
// PURE data module: no three import, no side effects. Runs under plain node.
//
// Owner 2026-09-22 ("we shouldn't have any hidden tanks"): the saved fleet no
// longer carries development-only vehicle records. Four retired hulls were
// the stat/armor donors of live vehicles, so their rows survive here as plain
// spec data that is never registered: no id, garage card, builder, icon,
// anchor, anatomy receipt or gate packet exists for them.
//
//   leo2a7   -> leo2_revolution_proto, leo2_revolution, leo2a7v (additionalFleetSpecs.ts make())
//   t72b3    -> pt91m, t64bv1, t72b3m (make()), t72b3_x (sourceXSecondWaveSpecs.ts) and the
//               derived t72b_1987 donor below
//   merkava4 -> merkava1b, merkava2b, merkava2d, merkava3c, merkava3d, merkava4b (make(),
//               merkavaGun(), merkavaArmor()) and merkava4_x (sourceXFleetSpecs.ts)
//   jpz_e100 -> jpz_e100_x (sourceXSecondWaveSpecs.ts)
//   t72b_1987 -> t72m1_jaguar (poland.ts) and t72b_1987_x; itself a make('t72b3', ...) clone,
//               registered into this table by additionalFleetSpecs.ts so the derivation order
//               is unchanged.
//
// Every clone copies (JSON / structuredClone) its donor, so the live specs are
// byte-identical to the rows the registered donors used to produce. The fleet
// balance pass never touched these four ids, so the X-hull combat
// synchronisation reads the same values it always did.

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
} from './specHelpers.ts';
import type { ArmorEnvelope } from './specHelpers.ts';
import type { AimBloom, FleetTankSpec, TankSpecRegistry } from './specContracts.ts';

// The same bloom values specs.ts and modern1.ts authored for these rows.
const BLOOM_WW2: AimBloom = { move: 0.20, hullRot: 0.20, turret: 0.12, afterShot: 2.8 };
const BLOOM_MODERN: AimBloom = { move: 0.06, hullRot: 0.08, turret: 0.06, afterShot: 2.2 };

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Leopard 2A7
// ---------------------------------------------------------------------------
function armorLeo2A7(): ArmorEnvelope {
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


// T-72B3 — §14.2: turret ~480/500 + Kontakt-5, glacis ~450/500 + K-5,
// sides 80 mm + soft skirts with K-1 forward.
function armorT72B3(): ArmorEnvelope {
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
function armorMerkava4(): ArmorEnvelope {
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

// ---------------------------------------------------------------------------
// Donor rows (verbatim from the retired registered records)
// ---------------------------------------------------------------------------
export const DONOR_SPECS: TankSpecRegistry = {
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

  t72b3: {
    id: 't72b3', name: 'T-72B3 obr. 2011', nation: 'Russia', era: 'modern', role: 'mbt',
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
    id: 'merkava4', name: 'Merkava IVm Windbreaker', nation: 'Israel', era: 'modern', role: 'mbt',
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

  jpz_e100: {
    id: 'jpz_e100', name: 'Jagdpanzer E100 Prototype', nation: 'Germany', era: 'ww2', role: 'td',
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
};

/**
 * Resolve a combat donor: a registered spec first, then an unregistered donor
 * template. Registrars call this so a donor may leave the saved fleet without
 * moving the live vehicles that were cloned from it.
 */
export function donorSpec(registry: Readonly<Record<string, FleetTankSpec>>, id: string): FleetTankSpec {
  const spec = registry[id] ?? DONOR_SPECS[id];
  if (!spec) throw new Error(`Fleet donor missing or incomplete: ${id}`);
  return spec;
}
