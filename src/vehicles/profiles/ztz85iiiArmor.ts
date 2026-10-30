// ZTZ-85-III combat envelope (release 263): the plates follow the rebuilt hull and welded turret of profiles/ztz85iii.ts
// (hull frame: y 0 = ground, +Z forward, +X the vehicle's left; turret plates in the ring frame). Strengths keep the
// tier's values from before the rebuild; the 1995 package adds first-generation reactive plates where the builder draws
// its bricks (the upper glacis, the turret's front faces). Node-runnable: no rendering imports.

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
  type ArmorEnvelope,
} from '../specHelpers.ts';

/** First-generation explosive reactive armour (the Kontakt-1 class the 85-III's bricks belong to). */
const FY1_ERA = Object.freeze({ keReduction: 0.05, ceFlatMm: 280 });

export function createZTZ85IIIArmor(): ArmorEnvelope {
  const era = { kind: 'era' as const, era: FY1_ERA };
  const hullPlates = [
    fr('glacis_era', 15, 1.10, 1.06, 2.866, 1.46, 2.17, era),
    fr('upper_glacis', 70, 1.30, 0.80, 3.165, 1.45, 2.04, { keMm: 80, ceMm: 80 }),
    fr('lower_front', 100, 1.04, 0.47, 2.72, 0.80, 3.165, { keMm: 80, ceMm: 80 }),
    sR('hull_side_upper_R', 35, 1.56, 1.07, 1.56, 1.45, -3.10, 2.58, { keMm: 40, ceMm: 40 }),
    sL('hull_side_upper_L', 35, 1.56, 1.07, 1.56, 1.45, -3.10, 2.58, { keMm: 40, ceMm: 40 }),
    sR('hull_side_lower_R', 35, 1.04, 0.47, 1.04, 1.07, -3.05, 2.72, { keMm: 40, ceMm: 40 }),
    sL('hull_side_lower_L', 35, 1.04, 0.47, 1.04, 1.07, -3.05, 2.72, { keMm: 40, ceMm: 40 }),
    sR('track_R', 20, 1.36, 0.10, 1.36, 0.95, -3.20, 3.00, { kind: 'external', moduleLink: 'trackR' }),
    sL('track_L', 20, 1.36, 0.10, 1.36, 0.95, -3.20, 3.00, { kind: 'external', moduleLink: 'trackL' }),
    rr('hull_rear', 25, 1.50, 0.68, -3.165, 1.37, -3.165, { keMm: 28, ceMm: 28 }),
    rf('hull_roof', 20, 1.50, 1.45, -1.62, 2.04, { keMm: 23, ceMm: 23 }),
    rf('engine_deck', 20, 1.50, 1.53, -3.00, -1.74, { keMm: 23, ceMm: 23 }),
  ];
  const turretPlates = [
    chR('turret_era_R', 15, 0.45, 1.30, 1.24, 0.40, 0.22, 0.54, 0.15, 0.03, era),
    chL('turret_era_L', 15, 0.45, 1.30, 1.24, 0.40, 0.22, 0.54, 0.15, 0.03, era),
    // the two-brick pairs on each side of the front slope (seeds: the combat anatomy fits the bricks themselves)
    par('turret_slope_era_R', 15, [0.66, 0.50, 0.79], [1.10, 0.50, 0.30], [0.65, 0.60, 0.41], era),
    par('turret_slope_era_L', 15, [-1.10, 0.50, 0.30], [-0.66, 0.50, 0.79], [-1.09, 0.60, -0.08], era),
    chR('turret_cheek_R', 120, 0.42, 1.24, 1.19, 0.36, 0.05, 0.50, 0.15, 0.04, { keMm: 137, ceMm: 137 }),
    chL('turret_cheek_L', 120, 0.42, 1.24, 1.19, 0.36, 0.05, 0.50, 0.15, 0.04, { keMm: 137, ceMm: 137 }),
    // the long front slope from the brow (0.50 m) up to the roof (0.68 m)
    fr('turret_upper_front', 70, 1.14, 0.50, 1.09, 0.68, 0.18, { keMm: 100, ceMm: 100 }),
    par('mantlet', 120, [-0.25, 0.14, 1.52], [0.25, 0.14, 1.52], [-0.25, 0.50, 1.50],
      { keMm: 137, ceMm: 137, gunFollow: true }),
    sR('turret_side_R', 45, 1.22, 0.05, 1.16, 0.68, -1.36, 0.32, { keMm: 51, ceMm: 51 }),
    sL('turret_side_L', 45, 1.22, 0.05, 1.16, 0.68, -1.36, 0.32, { keMm: 51, ceMm: 51 }),
    rr('turret_rear', 35, 1.00, 0.05, -1.38, 0.68, -1.34, { keMm: 40, ceMm: 40 }),
    rf('turret_roof', 20, 1.14, 0.69, -1.34, 0.18, { keMm: 23, ceMm: 23 }),
  ];
  const modules = [
    mbox('engine', [-1.04, 0.47, -3.10], [1.04, 1.45, -1.80]),
    mbox('transmission', [-0.96, 0.55, -3.10], [0.96, 1.20, -2.75]),
    mbox('fuelTank', [0.45, 0.47, -1.75], [1.04, 1.00, -1.05]),
    // the carousel autoloader under the turret floor
    mbox('ammoRack', [-0.92, 0.47, -0.78], [0.92, 0.80, 0.88]),
    mbox('turretRing', [-0.95, 1.32, -0.95], [0.95, 1.56, 1.05]),
    mbox('radio', [-1.00, 0.70, -1.75], [-0.45, 1.20, -1.10]),
    mbox('optics', [0.26, 0.50, 0.14], [0.58, 0.90, 0.52], true),
    mbox('gun', [-0.22, 0.10, -0.90], [0.22, 0.54, 1.40], true),
    mbox('trackL', [-1.635, 0.02, -3.20], [-1.085, 0.98, 3.00]),
    mbox('trackR', [1.085, 0.02, -3.20], [1.635, 0.98, 3.00]),
  ];
  // three crew: the autoloader replaced the loader
  const crew = [
    cbox('driver', [0.18, 0.62, 1.30], [0.80, 1.30, 2.40]),
    cbox('gunner', [0.15, -0.55, -0.20], [0.80, 0.62, 0.60], true),
    cbox('commander', [-0.90, -0.50, -0.78], [-0.15, 0.66, 0.15], true),
  ];
  return {
    boundingRadiusM: 7.0,
    turretPivot: [0, 1.45, 0.05],
    gunPivot: [0, 0.32, 0.96],
    gunBarrel: { lengthM: 6.195, radiusM: 0.098 },
    hullPlates, turretPlates, modules, crew,
  };
}
