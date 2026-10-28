// Boot-light Challenger combat records. Geometry remains in
// profiles/challenger.ts and is loaded only when this family is requested.
// Keeping gameplay registration here lets donor specs and the garage roster
// initialize without importing Three.js, the UK fitting kit, or any builder.

import { TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS } from './specs.ts';
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
  type ArmorEnvelope,
} from './specHelpers.ts';
import type { FleetTankSpec, ModelSourceRecord } from './specContracts.ts';

// ===========================================================================
// Modern-class residents (spec+build, the modern1.ts pattern): challenger2 +
// challenger3_proto. Armor tables, spec rows, helpers and builders below moved
// byte-intact from modern1.ts (§5.75).
// ===========================================================================

// Challenger 2 — §18.2 Dorchester L2: turret ~600/900, hull ~500/800,
// turret sides ~300/450, hull sides 100 + skirt.
function armorChallenger2(): ArmorEnvelope {
  const trkTop = 1.0, floor = 0.45, roofY = 1.55;
  return {
    boundingRadiusM: 5.95,
    // Leclerc-method rebuild: the corrected oracle resolves its authored
    // ring at world z 1.003 and the L30 axis at y 1.68. These are geometry
    // facts, not silhouette registration offsets.
    turretPivot: [0, 1.55, 1.00],
    gunPivot: [0, 0.13, 0.70],
    gunBarrel: { lengthM: 6.7, radiusM: 0.11 },
    hullPlates: [
      fr('upper_glacis', 500, 1.62, 0.95, 4.05, roofY, 1.40, { keMm: 500, ceMm: 800 }),
      fr('lower_front', 300, 1.70, floor, 3.70, 0.95, 4.10, { keMm: 300, ceMm: 400 }),
      sR('hull_side_upper_R', 60, 1.76, trkTop, 1.76, roofY, -4.1, 1.4, { keMm: 100, ceMm: 100 }),
      sL('hull_side_upper_L', 60, 1.76, trkTop, 1.76, roofY, -4.1, 1.4, { keMm: 100, ceMm: 100 }),
      sR('hull_side_lower_R', 60, 1.26, floor, 1.26, trkTop, -4.0, 3.7, { keMm: 100, ceMm: 100 }),
      sL('hull_side_lower_L', 60, 1.26, floor, 1.26, trkTop, -4.0, 3.7, { keMm: 100, ceMm: 100 }),
      sR('skirt_R', 60, 1.84, 0.5, 1.84, 1.12, -3.9, 3.9, { kind: 'spaced', keMm: 90, ceMm: 300 }),
      sL('skirt_L', 60, 1.84, 0.5, 1.84, 1.12, -3.9, 3.9, { kind: 'spaced', keMm: 90, ceMm: 300 }),
      sR('track_R', 25, 1.52, 0.14, 1.52, trkTop, -4.16, 4.16, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 25, 1.52, 0.14, 1.52, trkTop, -4.16, 4.16, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 45, 1.6, floor, -4.16, roofY, -4.16),
      rf('hull_roof', 45, 1.62, roofY, -4.1, 1.4),
    ],
    turretPlates: [
      chR('turret_cheek_R', 620, 0.16, 1.28, 1.26, 0.0, 0.0, 0.90, 0.55, 0, { keMm: 600, ceMm: 900 }),
      chL('turret_cheek_L', 620, 0.16, 1.28, 1.26, 0.0, 0.0, 0.90, 0.55, 0, { keMm: 600, ceMm: 900 }),
      par('mantlet_slot', 400, [-0.20, 0.10, 1.15], [0.20, 0.10, 1.15], [-0.20, 0.55, 1.08],
        { keMm: 450, ceMm: 550, gunFollow: true }),
      sR('turret_side_R', 300, 1.26, 0.0, 1.26, 0.90, -1.95, 0.0, { keMm: 300, ceMm: 450 }),
      sL('turret_side_L', 300, 1.26, 0.0, 1.26, 0.90, -1.95, 0.0, { keMm: 300, ceMm: 450 }),
      rr('turret_rear', 70, 1.2, 0.0, -2.0, 0.9, -2.0),
      rf('turret_roof', 50, 1.26, 0.92, -1.95, 1.0),
    ],
    modules: [
      mbox('engine', [-1.05, 0.5, -4.05], [1.05, 1.5, -2.1]),
      mbox('fuelTank', [-1.2, 0.5, -2.05], [-0.4, 1.3, -1.0]),
      mbox('ammoRack', [-0.9, 0.45, 0.6], [0.4, 1.2, 2.2]),           // charge bins, hull front
      mbox('turretRing', [-0.95, 1.37, -1.15], [0.95, 1.57, 0.85]),
      mbox('radio', [-0.6, 0.1, -1.5], [-0.1, 0.55, -1.0], true),
      mbox('optics', [0.3, 0.6, 0.3], [0.75, 0.95, 0.8], true),
      mbox('gun', [-0.18, 0.1, -0.5], [0.18, 0.6, 0.75], true),
      mbox('trackL', [-1.84, 0.0, -4.16], [-1.26, trkTop, 4.16]),
      mbox('trackR', [1.26, 0.0, -4.16], [1.84, trkTop, 4.16]),
    ],
    crew: [
      cbox('driver', [-0.35, 0.55, 2.3], [0.35, 1.2, 3.4]),
      cbox('gunner', [0.25, 0.0, 0.0], [0.85, 0.7, 0.7], true),
      cbox('commander', [0.25, 0.05, -0.85], [0.9, 0.8, -0.1], true),
      cbox('loader', [-0.9, 0.0, -0.45], [-0.25, 0.75, 0.5], true),
    ],
  };
}

const CR2E_ERA = Object.freeze({ keReduction: 0.24, ceFlatMm: 410 });

function armorChallenger2Enhanced(): ArmorEnvelope {
  const armor = armorChallenger2();
  armor.hullPlates.push(
    fr('cr2e_glacis_era_R', 18, 0.82, 1.19, 3.58, 1.50, 2.30,
      { kind: 'era', era: CR2E_ERA, keMm: 190, ceMm: 560 }),
    fr('cr2e_glacis_era_L', 18, 0.82, 1.19, 3.58, 1.50, 2.30,
      { kind: 'era', era: CR2E_ERA, keMm: 190, ceMm: 560 }),
    sR('cr2e_skirt_era_R', 18, 1.91, 0.72, 1.91, 1.36, -0.10, 3.30,
      { kind: 'era', era: CR2E_ERA, keMm: 160, ceMm: 500 }),
    sL('cr2e_skirt_era_L', 18, 1.91, 0.72, 1.91, 1.36, -0.10, 3.30,
      { kind: 'era', era: CR2E_ERA, keMm: 160, ceMm: 500 }),
  );
  armor.turretPlates.push(
    chR('cr2e_turret_era_R', 18, 0.30, 1.76, 1.30, 0.98, 0.10, 0.70, 0.16, 0,
      { kind: 'era', era: CR2E_ERA, keMm: 210, ceMm: 620 }),
    chL('cr2e_turret_era_L', 18, 0.30, 1.76, 1.30, 0.98, 0.10, 0.70, 0.16, 0,
      { kind: 'era', era: CR2E_ERA, keMm: 210, ceMm: 620 }),
  );
  armor.boundingRadiusM = 6.15;
  return armor;
}
// Challenger 3 — NEW VEHICLE (owner greenlight 2026-08-06). CR2 hull family
// (EPSOM modular appliqué) under the NEW Rheinmetall turret: big flat cheek
// plates, Trophy APS side modules, RWS. 120 mm L55A1 SMOOTHBORE — the key
// identity change from CR2's rifled L30. RHAe = CR2-class base + modular
// uplift estimates (no public CR3 armor data; game-design baseline).
function armorChallenger3(): ArmorEnvelope {
  const trkTop = 1.0, floor = 0.42, roofY = 1.55;
  return {
    boundingRadiusM: 5.95,
    // Turret seat per the NC-quarantined 42manako print (§B8 proportion
    // truth): ring well forward (print autoPivot z +1.31 on its 7.96 hull),
    // face ~2.45 from the ring, the huge squared bustle running to -2.13.
    turretPivot: [0, 1.55, 1.20],
    // print bore line 1.76 (low trunnion — the CR3 turret sits low over
    // the gun); visible run 5.58 -> muzzle +7.335 = 11.50 overall.
    gunPivot: [0, 0.21, 0.55],
    gunBarrel: { lengthM: 5.6, radiusM: 0.10 },
    hullPlates: [
      fr('upper_glacis', 500, 1.62, 0.95, 4.05, roofY, 1.40, { keMm: 500, ceMm: 800 }),
      fr('lower_front', 300, 1.70, floor, 3.70, 0.95, 4.10, { keMm: 300, ceMm: 400 }),
      sR('hull_side_upper_R', 60, 1.755, trkTop, 1.755, roofY, -4.1, 1.4, { keMm: 100, ceMm: 100 }),
      sL('hull_side_upper_L', 60, 1.755, trkTop, 1.755, roofY, -4.1, 1.4, { keMm: 100, ceMm: 100 }),
      sR('hull_side_lower_R', 60, 1.26, floor, 1.26, trkTop, -4.0, 3.7, { keMm: 100, ceMm: 100 }),
      sL('hull_side_lower_L', 60, 1.26, floor, 1.26, trkTop, -4.0, 3.7, { keMm: 100, ceMm: 100 }),
      sR('skirt_R', 60, 1.755, 0.5, 1.755, 1.12, -3.9, 3.6, { kind: 'spaced', keMm: 90, ceMm: 300 }),
      sL('skirt_L', 60, 1.755, 0.5, 1.755, 1.12, -3.9, 3.6, { kind: 'spaced', keMm: 90, ceMm: 300 }),
      sR('track_R', 25, 1.60, 0.14, 1.60, trkTop, -4.16, 4.16, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 25, 1.60, 0.14, 1.60, trkTop, -4.16, 4.16, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 45, 1.6, floor, -4.13, roofY, -4.13),
      rf('hull_roof', 45, 1.62, roofY, -4.1, 1.4),
    ],
    turretPlates: [
      // the new wedge: near-vertical big cheek plates over jutting lower
      // armor wedges; modular EPSOM appliqué values
      chR('turret_cheek_R', 650, 0.16, 1.30, 1.30, 0.10, 0.0, 0.85, 0.30, 0, { keMm: 650, ceMm: 950 }),
      chL('turret_cheek_L', 650, 0.16, 1.30, 1.30, 0.10, 0.0, 0.85, 0.30, 0, { keMm: 650, ceMm: 950 }),
      par('mantlet_slot', 400, [-0.20, 0.08, 1.30], [0.20, 0.08, 1.30], [-0.20, 0.50, 1.22],
        { keMm: 450, ceMm: 550, gunFollow: true }),
      // Trophy APS panels ride the sides (spaced modules)
      sR('trophy_R', 30, 1.72, 0.20, 1.72, 0.70, -2.6, -0.2, { kind: 'spaced', keMm: 60, ceMm: 200 }),
      sL('trophy_L', 30, 1.72, 0.20, 1.72, 0.70, -2.6, -0.2, { kind: 'spaced', keMm: 60, ceMm: 200 }),
      sR('turret_side_R', 300, 1.44, 0.0, 1.44, 0.85, -3.3, 0.0, { keMm: 300, ceMm: 450 }),
      sL('turret_side_L', 300, 1.44, 0.0, 1.44, 0.85, -3.3, 0.0, { keMm: 300, ceMm: 450 }),
      rr('turret_rear', 70, 1.2, 0.0, -3.33, 0.85, -3.33),
      rf('turret_roof', 50, 1.40, 0.86, -3.3, 1.0),
    ],
    modules: [
      mbox('engine', [-1.05, 0.5, -4.0], [1.05, 1.5, -2.1]),
      mbox('fuelTank', [-1.2, 0.5, -2.05], [-0.4, 1.3, -1.0]),
      mbox('ammoRack', [-0.9, 0.45, 0.6], [0.4, 1.2, 2.2]),           // charge bins, hull front
      mbox('turretRing', [-0.95, 1.37, 0.2], [0.95, 1.57, 2.2]),
      mbox('radio', [-0.6, 0.1, -2.6], [-0.1, 0.55, -2.1], true),
      mbox('optics', [0.3, 0.6, -0.3], [0.75, 0.95, 0.3], true),
      mbox('gun', [-0.18, 0.05, -0.6], [0.18, 0.55, 1.2], true),
      mbox('trackL', [-1.755, 0.0, -4.16], [-1.26, trkTop, 4.16]),
      mbox('trackR', [1.26, 0.0, -4.16], [1.755, trkTop, 4.16]),
    ],
    crew: [
      cbox('driver', [-0.35, 0.55, 2.3], [0.35, 1.2, 3.4]),
      cbox('gunner', [0.25, 0.0, -0.6], [0.85, 0.7, 0.1], true),
      cbox('commander', [0.25, 0.05, -1.45], [0.9, 0.8, -0.7], true),
      cbox('loader', [-0.9, 0.0, -1.05], [-0.25, 0.75, -0.1], true),
    ],
  };
}

const CHALLENGER3X_ERA = Object.freeze({ keReduction: 0.30, ceFlatMm: 460 });

function armorChallenger3X(): ArmorEnvelope {
  const armor = armorChallenger3();
  const era = { kind: 'era', era: CHALLENGER3X_ERA, keMm: 220, ceMm: 680 };

  armor.hullPlates.push(
    fr('c3x_glacis_era_R', 22, 1.42, 1.20, 3.62, 1.58, 2.28, era),
    fr('c3x_glacis_era_L', 22, 1.42, 1.20, 3.62, 1.58, 2.28, era),
    sR('c3x_skirt_era_R', 22, 1.96, 0.68, 1.96, 1.46, -3.62, 3.38, era),
    sL('c3x_skirt_era_L', 22, 1.96, 0.68, 1.96, 1.46, -3.62, 3.38, era),
  );
  armor.turretPlates.push(
    chR('c3x_turret_cheek_era_R', 22, 0.30, 1.62, 1.42, 0.92, 0.05, 0.80, 0.18, 0, era),
    chL('c3x_turret_cheek_era_L', 22, 0.30, 1.62, 1.42, 0.92, 0.05, 0.80, 0.18, 0, era),
    sR('c3x_turret_side_era_R', 22, 1.76, 0.16, 1.76, 0.78, -3.12, -0.30, era),
    sL('c3x_turret_side_era_L', 22, 1.76, 0.16, 1.76, 0.78, -3.12, -0.30, era),
  );
  armor.boundingRadiusM = 6.85;
  return armor;
}
// The TD's measured main-gun depression by absolute turret yaw (tools/gun-depression-sweep.mjs --no-suit, 26 mm, the
// whole gun in battery and recoiled): the full 10 degrees over the glacis trough, 8-9 off it, 5-6 over the front deck's
// edges, the full 10 over the flanks, easing over the engine deck and 8.7 up over the stern pole astern (its last
// three degrees re-measured with the pole on the oracle's Object_2 bounds, .qa-dev rear-floor probe). No mount
// conflict (the mantlet's lower edge stands 6 cm over the deck). The field fit shares the hull, turret and gun.
const CHALLENGER3_TD_GUN_PITCH_BY_YAW_DEG: readonly (readonly [number, number])[] = Object.freeze([
  [0, -10], [2, -8.9], [9, -8.5], [25, -8], [26, -6.9], [27, -6.2], [28, -6], [30, -6], [31, -6.2], [33, -7.1],
  [34, -6], [35, -5.2], [37, -4.7], [42, -4.7], [43, -4.8], [44, -5], [45, -5.4], [46, -6.1], [49, -6.2], [65, -8.8],
  [71, -9.6], [72, -10], [107, -10], [123, -7.5], [125, -7], [141, -4.1], [158, -1.3], [159, -0.5], [160, -0.2],
  [164, 0], [165, 0.6], [168, 1.4], [177, 1.5], [178, 8.4], [179, 8.7], [180, 8.7]
]);
// Challenger 3 TD (release 262, docs/references/tanks/challenger3_td.md): RBSL's Advanced Technology Demonstrator in
// its trials fit, a Challenger 2 hull under the new turret, no APS. Authored in the installed frame its builder draws
// (profiles/challenger3Td.ts: the oracle's metres x1.10, its fender span centred), so no plate needs a rig scale. The
// hull keeps the Challenger 2's Dorchester values; the turret is the new structure without the production package's
// appliqué (no public figures: game-design values a step under the prototype's).
function armorChallenger3Td(): ArmorEnvelope {
  const trkTop = 1.36, floor = 0.633, roofY = 1.958;
  return {
    boundingRadiusM: 6.70,
    turretPivot: [0, 1.98, 0.7106],
    gunPivot: [0, 0.2541, 1.2089],
    gunBarrel: { lengthM: 5.89, radiusM: 0.105 },
    hullPlates: [
      fr('upper_glacis', 500, 1.878, 1.43, 3.977, roofY, 2.36, { keMm: 500, ceMm: 800 }),
      fr('lower_front', 300, 1.012, 0.66, 3.603, 1.43, 3.977, { keMm: 300, ceMm: 400 }),
      sR('hull_side_upper_R', 60, 1.878, 1.463, 1.878, roofY, -4.395, 3.977, { keMm: 100, ceMm: 100 }),
      sL('hull_side_upper_L', 60, 1.878, 1.463, 1.878, roofY, -4.395, 3.977, { keMm: 100, ceMm: 100 }),
      sR('hull_side_lower_R', 60, 1.012, floor, 1.012, 1.463, -3.69, 3.603, { keMm: 100, ceMm: 100 }),
      sL('hull_side_lower_L', 60, 1.012, floor, 1.012, 1.463, -3.69, 3.603, { keMm: 100, ceMm: 100 }),
      sR('skirt_R', 60, 1.92, 1.034, 1.92, 1.705, -4.02, 4.39, { kind: 'spaced', keMm: 90, ceMm: 300 }),
      sL('skirt_L', 60, 1.92, 1.034, 1.92, 1.705, -4.02, 4.39, { kind: 'spaced', keMm: 90, ceMm: 300 }),
      sR('track_R', 25, 1.526, 0.15, 1.526, trkTop, -3.93, 4.19, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 25, 1.526, 0.15, 1.526, trkTop, -3.93, 4.19, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', 45, 1.70, floor, -4.21, 2.057, -4.21),
      rf('hull_roof', 45, 1.80, roofY, -4.39, 2.36),
    ],
    turretPlates: [
      // the cheek faces: 56 degrees off the axis in plan, 36 degrees up (the builder's cheek planes)
      chR('turret_cheek_R', 620, 0.484, 2.223, 1.551, 1.526, 0.066, 0.605, 0.729, 0, { keMm: 620, ceMm: 920 }),
      chL('turret_cheek_L', 620, 0.484, 2.223, 1.551, 1.526, 0.066, 0.605, 0.729, 0, { keMm: 620, ceMm: 920 }),
      par('mantlet_slot', 400, [-0.462, 0.083, 2.144], [0.462, 0.083, 2.144], [-0.462, 0.506, 2.144],
        { keMm: 450, ceMm: 550, gunFollow: true }),
      sR('turret_side_R', 300, 1.556, 0.066, 1.498, 0.77, -3.642, 1.528, { keMm: 300, ceMm: 450 }),
      sL('turret_side_L', 300, 1.556, 0.066, 1.498, 0.77, -3.642, 1.528, { keMm: 300, ceMm: 450 }),
      rr('turret_rear', 70, 1.52, 0.155, -3.642, 0.836, -3.818),
      rf('turret_roof', 50, 1.30, 0.97, -3.80, 0.60),
    ],
    modules: [
      mbox('engine', [-1.15, 0.66, -4.19], [1.15, 1.90, -2.10]),
      mbox('fuelTank', [-1.32, 0.66, -1.99], [-0.44, 1.43, -0.89]),
      mbox('ammoRack', [-0.99, 0.66, 0.87], [0.44, 1.32, 2.40]),       // charge bins, hull front
      mbox('turretRing', [-1.265, 1.88, -0.554], [1.265, 2.02, 1.976]),
      mbox('radio', [-0.66, 0.15, -3.30], [-0.11, 0.60, -2.70], true),
      mbox('optics', [-0.99, 0.80, -0.06], [-0.50, 1.13, 0.30], true),
      mbox('gun', [-0.22, 0.08, -0.30], [0.22, 0.58, 2.10], true),
      mbox('trackL', [-1.85, 0.0, -3.93], [-1.20, trkTop, 4.19]),
      mbox('trackR', [1.20, 0.0, -3.93], [1.85, trkTop, 4.19]),
    ],
    crew: [
      cbox('driver', [-0.38, 0.66, 2.60], [0.38, 1.40, 3.50]),
      cbox('gunner', [-0.94, 0.0, -0.15], [-0.28, 0.77, 0.70], true),
      cbox('commander', [-1.00, 0.05, -1.20], [-0.28, 0.88, -0.35], true),
      cbox('loader', [0.28, 0.0, -0.75], [0.99, 0.83, 0.20], true),
    ],
  };
}
// ---------------------------------------------------------------------------
// Specs (stats per roster §18.3-4; CR3 per its packet)
// ---------------------------------------------------------------------------
const CHALLENGER_SPEC_IDS = [
  'fv4034',
  'challenger2',
  'challenger2e',
  'ua_challenger2',
  'challenger3_proto',
  'challenger3',
  'challenger3_td',
  'challenger3_td_rws',
] as const;
type ChallengerSpecId = typeof CHALLENGER_SPEC_IDS[number];

const CHALLENGER_SPECS = {
  fv4034: {
    id: 'fv4034', name: 'FV4034', nation: 'UK', era: 'cold-war', role: 'mbt',
    hp: 2250,
    enginePowerHp: 1200, weightTons: 59.5, topSpeedKmh: 56, reverseSpeedKmh: 18,
    hullTraverseDegS: 34,
    terrainResistance: { hard: 0.72, medium: 0.84, soft: 1.55 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 32, gunPitchDegS: 28, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 7.2, baseAccuracy: 0.29, aimTimeS: 1.9,
      bloom: { move: 0.05, hullRot: 0.07, turret: 0.07, afterShot: 2.3 },
      shells: [
        shell('L23A1 APFSDS', 'APFSDS', 120, apfsdsPens(480)[0], apfsdsPens(480)[1], 500, 1535, { pen2000Mm: apfsdsPens(480)[2] }),
        shell('L31A7 HESH', 'HE', 120, 150, 150, 620, 670),
        shell('L34 WP Smoke', 'HE', 120, 10, 10, 100, 650),
      ],
    },
    dims: { hullLengthM: 8.33, overallLengthM: 11.50, widthM: 3.52, heightM: 2.50 },
    armor: armorChallenger2(),
    visual: {
      scheme: 'solid', base: '#46523a', weather: '#566146', patches: ['#30372a'],
      marking: 'number', number: '14', trackWidthM: 0.65, camoScale: 0.46,
    },
  },
  challenger2: {
    id: 'challenger2', name: 'Challenger 2', nation: 'UK', era: 'modern', role: 'mbt',
    hp: 2450,
    enginePowerHp: 1200, weightTons: 62.5, topSpeedKmh: 59, reverseSpeedKmh: 20,
    hullTraverseDegS: 36,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 36, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 6.8, baseAccuracy: 0.26, aimTimeS: 1.7,
      // Hydrogas suspension: best on-move gun handling in the roster (§18.3)
      bloom: { move: 0.04, hullRot: 0.06, turret: 0.06, afterShot: 2.2 },
      shells: [
        shell('L27A1 CHARM-3', 'APFSDS', 120, apfsdsPens(600)[0], apfsdsPens(600)[1], 520, 1650, { pen2000Mm: apfsdsPens(600)[2] }),
        shell('L31A7 HESH', 'HE', 120, 150, 150, 620, 670),
        shell('L34 WP Smoke', 'HE', 120, 10, 10, 100, 650),
      ],
    },
    // §5.73-1 P95 envelope: 3.04 m is the raw two-whip maximum, not a body
    // datum. The repaired oracle measures 2.54 m across the mandatory roof
    // kit; the two exact whips remain inside the permitted spike budget.
    dims: { hullLengthM: 8.33, overallLengthM: 11.50, widthM: 3.52, heightM: 2.54 },
    armor: armorChallenger2(),
    visual: {
      // British 2-tone: black stripe geometry over NATO green (§18.5)
      scheme: 'stripes', base: '#3f4a36', weather: '#48533e', patches: ['#1d1f1c'],
      marking: 'number', number: '22', trackWidthM: 0.65, camoScale: 0.45,
    },
  },
  challenger2e: {
    id: 'challenger2e', name: 'Challenger 2E', nation: 'UK', era: 'modern', role: 'mbt',
    hp: 2550,
    enginePowerHp: 1500, weightTons: 65.0, topSpeedKmh: 62, reverseSpeedKmh: 22,
    hullTraverseDegS: 38,
    terrainResistance: { hard: 0.68, medium: 0.78, soft: 1.42 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 38, gunPitchDegS: 31, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 6.4, baseAccuracy: 0.25, aimTimeS: 1.6,
      bloom: { move: 0.035, hullRot: 0.055, turret: 0.055, afterShot: 2.1 },
      shells: [
        shell('L28A1 APFSDS', 'APFSDS', 120, apfsdsPens(635)[0], apfsdsPens(635)[1], 525, 1680, { pen2000Mm: apfsdsPens(635)[2] }),
        shell('L31A7 HESH', 'HE', 120, 150, 150, 620, 670),
        shell('L34 WP Smoke', 'HE', 120, 10, 10, 100, 650),
      ],
    },
    dims: { hullLengthM: 8.33, overallLengthM: 11.50, widthM: 3.82, heightM: 2.78 },
    armor: armorChallenger2Enhanced(),
    visual: {
      scheme: 'stripes', base: '#4b513d', weather: '#5c6049', patches: ['#22251f', '#615642'],
      marking: 'number', number: '2E', trackWidthM: 0.65, camoScale: 0.48,
    },
  },
  ua_challenger2: {
    id: 'ua_challenger2', name: 'Challenger 2 (Ukraine)', nation: 'Ukraine', era: 'modern', role: 'mbt',
    hp: 2580,
    enginePowerHp: 1500, weightTons: 67.0, topSpeedKmh: 58, reverseSpeedKmh: 20,
    hullTraverseDegS: 36,
    terrainResistance: { hard: 0.7, medium: 0.82, soft: 1.48 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 36, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 6.5, baseAccuracy: 0.25, aimTimeS: 1.7,
      bloom: { move: 0.04, hullRot: 0.06, turret: 0.06, afterShot: 2.1 },
      shells: [
        shell('L28A1 APFSDS', 'APFSDS', 120, apfsdsPens(635)[0], apfsdsPens(635)[1], 525, 1680, { pen2000Mm: apfsdsPens(635)[2] }),
        shell('L31A7 HESH', 'HE', 120, 150, 150, 620, 670),
        shell('L34 WP Smoke', 'HE', 120, 10, 10, 100, 650),
      ],
    },
    dims: { hullLengthM: 8.33, overallLengthM: 11.50, widthM: 4.06, heightM: 2.95 },
    armor: armorChallenger2Enhanced(),
    visual: {
      scheme: 'digital', base: '#4a523d', weather: '#65684d',
      patches: ['#2e352b', '#77715a', '#91866d'], marking: 'cross', number: 'UA',
      trackWidthM: 0.65, camoScale: 0.42,
    },
  },
  challenger3_proto: {
    id: 'challenger3_proto', name: 'Challenger 3 Prototype', nation: 'UK', era: 'modern', role: 'mbt',
    hp: 2500,
    // CV12-9A uprate path (1,500 hp program figure), 66 t combat
    enginePowerHp: 1500, weightTons: 66, topSpeedKmh: 60, reverseSpeedKmh: 20,
    hullTraverseDegS: 38,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 38, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 10,
    gun: {
      // 120 mm L55A1 SMOOTHBORE — the identity change from CR2's rifled
      // L30: German KE family replaces CHARM/HESH.
      caliberMm: 120, reloadS: 6.5, baseAccuracy: 0.25, aimTimeS: 1.7,
      bloom: { move: 0.04, hullRot: 0.06, turret: 0.06, afterShot: 2.2 },
      shells: [
        shell('DM73 APFSDS', 'APFSDS', 120, apfsdsPens(680)[0], apfsdsPens(680)[1], 530, 1750, { pen2000Mm: apfsdsPens(680)[2] }),
        shell('DM12A2 HEAT-MP', 'HEAT', 120, 600, 600, 480, 1400),
        shell('DM11 HE-ABM', 'HE', 120, 40, 40, 590, 1000),
      ],
    },
    // ANCHOR CAVEAT (packet): no official CR3 dims sheet — CR2 hull family
    // figures anchor the row (CR3 reuses the CR2 hull; L55A1 is L/55).
    // heightM is the sensor-inclusive datum (packet-filed 2.49 -> ~2.95:
    // RWS/pano/whips carry the p95 on both the print and the build).
    dims: { hullLengthM: 9.16, overallLengthM: 12.65, widthM: 3.87, heightM: 3.25 },
    armor: armorChallenger3(),
    visual: {
      // British 2-tone black-over-green, distinct number from the CR2 (§H.3
      // variant variety: Trophy modules + RWS + smoothbore are the tells)
      scheme: 'stripes', base: '#414c38', weather: '#4a5540', patches: ['#1e201d'],
      marking: 'number', number: '30', trackWidthM: 0.65, camoScale: 0.48,
    },
  },
  challenger3: {
    id: 'challenger3', name: 'Challenger 3', nation: 'UK', era: 'modern', role: 'mbt',
    hp: 2780,
    enginePowerHp: 1800, weightTons: 76, topSpeedKmh: 58, reverseSpeedKmh: 22,
    hullTraverseDegS: 36,
    terrainResistance: { hard: 0.72, medium: 0.84, soft: 1.56 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 40, gunPitchDegS: 32, gunElevationDeg: 21, gunDepressionDeg: 10,
    gun: {
      caliberMm: 120, reloadS: 6.1, baseAccuracy: 0.23, aimTimeS: 1.55,
      bloom: { move: 0.035, hullRot: 0.055, turret: 0.05, afterShot: 2.0 },
      shells: [
        shell('DM73 APFSDS', 'APFSDS', 120, apfsdsPens(680)[0], apfsdsPens(680)[1], 530, 1750, { pen2000Mm: apfsdsPens(680)[2] }),
        shell('DM12A2 HEAT-MP', 'HEAT', 120, 600, 600, 480, 1400),
        shell('DM11 HE-ABM', 'HE', 120, 40, 40, 590, 1000),
      ],
    },
    dims: { hullLengthM: 9.16, overallLengthM: 12.65, widthM: 4.45, heightM: 3.58 },
    armor: armorChallenger3X(),
    visual: {
      scheme: 'digital', base: '#384436', weather: '#59624c',
      patches: ['#171d1a', '#69705a', '#2a322b'],
      marking: 'number', number: '3X', trackWidthM: 0.68, camoScale: 0.40,
    },
  },
  challenger3_td: {
    id: 'challenger3_td', name: 'Challenger 3 TD', nation: 'UK', era: 'modern', role: 'mbt',
    hp: 2450,
    // the Challenger 2 automotive set it was built on (CV12-9A, 1,200 hp; TN54E): the demonstrator proved the turret
    enginePowerHp: 1200, weightTons: 66, topSpeedKmh: 59, reverseSpeedKmh: 20,
    hullTraverseDegS: 36,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 38, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 10,
    gunPitchByYawDeg: CHALLENGER3_TD_GUN_PITCH_BY_YAW_DEG,
    gun: {
      // Rheinmetall's 120 mm L55A1 smoothbore; its 2021 release names temperature-independent KE and programmable HE
      caliberMm: 120, reloadS: 6.6, baseAccuracy: 0.25, aimTimeS: 1.7,
      bloom: { move: 0.04, hullRot: 0.06, turret: 0.06, afterShot: 2.2 },
      shells: [
        shell('DM63A1 APFSDS', 'APFSDS', 120, apfsdsPens(650)[0], apfsdsPens(650)[1], 525, 1720, { pen2000Mm: apfsdsPens(650)[2] }),
        shell('DM12A2 HEAT-MP', 'HEAT', 120, 600, 600, 480, 1400),
        shell('DM11 HE-ABM', 'HE', 120, 40, 40, 590, 1000),
      ],
    },
    // the built envelope at the family's installed 1.10 as the geometry gate measures it in the source-world frame
    // (hull 9.63 to the stern pole, 13.15 gun forward, 4.06 over the skirt hooks, 3.74 to the sights; MoD for the
    // Challenger 3: 11.55 m gun forward, 4.2 m wide with the add-on armour)
    dims: { hullLengthM: 9.63, overallLengthM: 13.15, widthM: 4.06, heightM: 3.74 },
    armor: armorChallenger3Td(),
    visual: {
      // the demonstrator's three-tone disruptive scheme (green, black, sand) and its RBSL trials number
      scheme: 'digital', base: '#4f5a3e', weather: '#626a4d',
      patches: ['#1c201b', '#8a7f5c', '#3a4632'],
      marking: 'number', number: 'TD', trackWidthM: 0.64, camoScale: 0.44,
    },
  },
  challenger3_td_rws: {
    // the owner, 2026-10-27: the demonstrator's field fit without the ghillie, with a remote weapon station and kit
    // (profiles/challenger3Td.ts buildRemoteStation, buildFieldKit): a project-authored fit, not a shown vehicle
    id: 'challenger3_td_rws', name: 'Challenger 3 TD (RWS)', nation: 'UK', era: 'modern', role: 'mbt',
    hp: 2450,
    enginePowerHp: 1200, weightTons: 67, topSpeedKmh: 58, reverseSpeedKmh: 20,
    hullTraverseDegS: 36,
    terrainResistance: { hard: 0.7, medium: 0.8, soft: 1.5 },
    pivotStyle: 'neutral',
    turretTraverseDegS: 38, gunPitchDegS: 30, gunElevationDeg: 20, gunDepressionDeg: 10,
    gunPitchByYawDeg: CHALLENGER3_TD_GUN_PITCH_BY_YAW_DEG,
    gun: {
      caliberMm: 120, reloadS: 6.6, baseAccuracy: 0.25, aimTimeS: 1.7,
      bloom: { move: 0.04, hullRot: 0.06, turret: 0.06, afterShot: 2.2 },
      shells: [
        shell('DM63A1 APFSDS', 'APFSDS', 120, apfsdsPens(650)[0], apfsdsPens(650)[1], 525, 1720, { pen2000Mm: apfsdsPens(650)[2] }),
        shell('DM12A2 HEAT-MP', 'HEAT', 120, 600, 600, 480, 1400),
        shell('DM11 HE-ABM', 'HE', 120, 40, 40, 590, 1000),
      ],
    },
    // the TD's envelope; the station's sight head stands 3.18 m (installed) over the roof, under the commander's sight
    dims: { hullLengthM: 9.63, overallLengthM: 13.15, widthM: 4.06, heightM: 3.74 },
    armor: armorChallenger3Td(),
    visual: {
      // British field green under black bands, sand edges: the field fit's own coat
      scheme: 'nato', base: '#475538', weather: '#596249',
      patches: ['#181b16', '#7d7053'],
      marking: 'number', number: 'T2', trackWidthM: 0.64, camoScale: 0.46,
    },
  },
} satisfies Readonly<Record<ChallengerSpecId, FleetTankSpec>>;

// The legacy registries are JavaScript-owned mutable records. Intersect their
// inferred keys with this family's optional keys so TypeScript can prove the
// writes without adding a runtime adapter to the boot path.
const tankSpecs: typeof TANK_SPECS & Partial<Record<ChallengerSpecId, FleetTankSpec>> = TANK_SPECS;
const modelSources: typeof MODEL_SOURCE & Partial<Record<ChallengerSpecId, ModelSourceRecord>> = MODEL_SOURCE;
const allTankIds: string[] = ALL_TANK_IDS;

// Register specs + model-source rows + garage roster ids (idempotent — vite
// HMR can re-evaluate this module; the modern1.ts mechanism, moved with its
// residents). §5.75 ORDER GUARD: modern1.ts registered challenger2 and
// challenger3_proto BEFORE merkava4/leo2a6, and the garage carousel is ordered by
// ALL_TANK_IDS (main.ts); modern1 always evaluates before this module (its
// helpers are imported above), so re-insert at the original slot instead of
// appending to the tail — a pure refactor must not reorder the roster.
for (const id of CHALLENGER_SPEC_IDS) {
  tankSpecs[id] ||= CHALLENGER_SPECS[id];
  modelSources[id] ||= { source: 'procedural' };
  // merkava4 never entered ALL_TANK_IDS (delisted donor, retired 2026-09-23),
  // so the historical re-insertion slot always resolved to an append.
  if (!allTankIds.includes(id)) allTankIds.push(id);
}

export { CHALLENGER_SPEC_IDS };
