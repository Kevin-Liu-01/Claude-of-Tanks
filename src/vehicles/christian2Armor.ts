// The Christian II's datums and combat envelope (release 262; profiles/christian2.ts draws the vehicle, christian2Specs.ts
// carries this envelope), from one table. Boot-light: plain data and the shared plate helpers, no geometry. Hull metres on
// the hull (+Z forward, y from the ground); turret metres from the ring's centre on the deck.
import {
  plate, frontPlate as fr, rearPlate as rr, rightSidePlate as sR, leftSidePlate as sL, roofPlate as rf,
  rightCheekPlate as chR, leftCheekPlate as chL, moduleBox as mbox, crewBox as cbox, type ArmorEnvelope,
} from './specHelpers.ts';

/** The concept's measured hull datums, from the supplied model's proportions. */
export const CHRISTIAN2_HULL = Object.freeze({
  /** Deck line [z, y] from the engine deck's rear lip to the nose (the upper glacis falls from z 1.55). */
  deck: Object.freeze([[-3.80, 1.78], [-3.62, 1.80], [-2.80, 1.79], [-2.62, 1.72], [-2.00, 1.69], [-1.20, 1.64],
    [1.55, 1.63], [2.40, 1.494], [3.00, 1.404], [3.22, 1.33], [3.45, 1.25]] as const),
  /** Belly line [z, y]: the rear plate's foot, the flat belly, the lower glacis up to the nose. */
  belly: Object.freeze([[-3.80, 0.82], [-3.62, 0.62], [-3.40, 0.54], [2.45, 0.54], [2.80, 0.60], [3.20, 0.76],
    [3.45, 1.02]] as const),
  tubHalfWidthM: 1.0,
  sponsonHalfWidthM: 1.67,
  sponsonFloorY: 1.36,
  /** Seven road wheel stations (the mean of the model's staggered sides), radius, centre height; track centre and width. */
  wheelZs: Object.freeze([2.417, 1.592, 0.767, -0.058, -0.883, -1.708, -2.533] as const),
  wheelR: 0.348,
  wheelY: 0.425,
  trackXc: 1.359,
  trackW: 0.643,
  idler: Object.freeze({ z: 3.187, y: 0.895, r: 0.26 }),
  sprocket: Object.freeze({ z: -3.20, y: 0.895, r: 0.30 }),
  rollers: Object.freeze([2.035, 1.219, -0.311, -1.983] as const),
  rollerY: 1.088,
  rollerR: 0.11,
  skirtTopY: 1.50,
});

/** The turret's datums (turret metres). */
export const CHRISTIAN2_TURRET = Object.freeze({
  pivot: Object.freeze([0, 1.64, 0.37] as const),
  /** Trunnion: the bore axis 2.00 m over the ground, the muzzle at the model's 5.70 m. */
  gunLocal: Object.freeze([0, 0.36, 1.04] as const),
  barrelLengthM: 4.29,
  barrelRadiusM: 0.084,
  halfWidthM: 1.28,
  bustleHalfWidthM: 1.16,
  stepZ: -1.57,
  rearZ: -2.73,
  coreFrontZ: 1.04,
  moduleFrontZ: 1.32,
  slotHalfWidthM: 0.355,
  roofRearY: 0.83,
  roofFrontY: 0.74,
  bustleFloorY: 0.21,
  floorY: 0.03,
});

/**
 * Protection (RHAe mm). The frontal turret modules and the composite mantlet insert are the concept's 2020s package, with
 * the Strv 122 and Leopard 2A5 class; the hull is a Leopard 2-pattern hull's; the bolted fore skirt blocks are spaced
 * armour, the aft panels thin.
 */
export const CHRISTIAN2_PROTECTION = Object.freeze({
  glacis: { ke: 420, ce: 640, phys: 460 }, lowerFront: { ke: 250, ce: 300 }, side: 80, rear: 45, roof: 40,
  skirtFore: { ke: 60, ce: 220 }, skirtAft: 8, cheek: { ke: 760, ce: 1100, phys: 700 }, mantlet: { ke: 900, ce: 1050 },
  turretSide: { ke: 300, ce: 420 }, bustleSide: { ke: 160, ce: 220 }, turretRear: 60, turretRoof: 40,
});

/** The combat envelope on the drawn hull and turret. */
export function christian2Armor(): ArmorEnvelope {
  const Hd = CHRISTIAN2_HULL, Td = CHRISTIAN2_TURRET, A = CHRISTIAN2_PROTECTION;
  const front = 3.45, rear = -3.80, deckMid = 1.64, hw = Hd.sponsonHalfWidthM, tw = Hd.tubHalfWidthM;
  const hullPlates = [
    fr('upper_glacis', A.glacis.phys, hw * 0.96, 1.25, front, 1.63, 1.55, { keMm: A.glacis.ke, ceMm: A.glacis.ce }),
    fr('lower_front', 100, tw, 0.54, 2.45, 1.02, front, { keMm: A.lowerFront.ke, ceMm: A.lowerFront.ce }),
    sR('hull_side_upper_R', A.side, hw - 0.01, Hd.sponsonFloorY, hw - 0.01, deckMid, rear + 0.10, 3.20),
    sL('hull_side_upper_L', A.side, hw - 0.01, Hd.sponsonFloorY, hw - 0.01, deckMid, rear + 0.10, 3.20),
    sR('hull_side_lower_R', A.side, tw, 0.54, tw, Hd.sponsonFloorY, -3.40, 2.45),
    sL('hull_side_lower_L', A.side, tw, 0.54, tw, Hd.sponsonFloorY, -3.40, 2.45),
    sR('skirt_fore_R', A.skirtFore.ke, 1.818, 0.86, 1.818, Hd.skirtTopY, 1.42, 3.16, { kind: 'spaced', ceMm: A.skirtFore.ce }),
    sL('skirt_fore_L', A.skirtFore.ke, 1.818, 0.86, 1.818, Hd.skirtTopY, 1.42, 3.16, { kind: 'spaced', ceMm: A.skirtFore.ce }),
    sR('skirt_R', A.skirtAft, 1.72, 0.92, 1.72, Hd.skirtTopY, -3.66, 1.40, { kind: 'spaced' }),
    sL('skirt_L', A.skirtAft, 1.72, 0.92, 1.72, Hd.skirtTopY, -3.66, 1.40, { kind: 'spaced' }),
    sR('track_R', 20, Hd.trackXc + Hd.trackW / 2, 0.08, Hd.trackXc + Hd.trackW / 2, 1.30, -3.55, 3.45, { kind: 'external', moduleLink: 'trackR' }),
    sL('track_L', 20, Hd.trackXc + Hd.trackW / 2, 0.08, Hd.trackXc + Hd.trackW / 2, 1.30, -3.55, 3.45, { kind: 'external', moduleLink: 'trackL' }),
    rr('hull_rear', A.rear, hw * 0.96, 0.82, rear, 1.78, rear),
    rf('hull_roof', A.roof, hw * 0.96, 1.66, rear, 1.55),
  ];
  const tf = Td.moduleFrontZ, hwT = Td.halfWidthM, gy = Td.gunLocal[1];
  const turretPlates = [
    chR('turret_cheek_R', A.cheek.phys, Td.slotHalfWidthM, tf, hwT, Td.coreFrontZ, 0.04, 0.72, 0.06, 0, { keMm: A.cheek.ke, ceMm: A.cheek.ce }),
    chL('turret_cheek_L', A.cheek.phys, Td.slotHalfWidthM, tf, hwT, Td.coreFrontZ, 0.04, 0.72, 0.06, 0, { keMm: A.cheek.ke, ceMm: A.cheek.ce }),
    plate('mantlet', A.mantlet.ke, [-0.30, gy - 0.23, Td.gunLocal[2] + 0.30], [0.30, gy - 0.23, Td.gunLocal[2] + 0.30],
      [-0.30, gy + 0.20, Td.gunLocal[2] + 0.30], { keMm: A.mantlet.ke, ceMm: A.mantlet.ce, gunFollow: true }),
    sR('turret_side_R', A.turretSide.ke, hwT, 0.03, hwT, 0.77, Td.stepZ, Td.coreFrontZ, { ceMm: A.turretSide.ce }),
    sL('turret_side_L', A.turretSide.ke, hwT, 0.03, hwT, 0.77, Td.stepZ, Td.coreFrontZ, { ceMm: A.turretSide.ce }),
    sR('turret_bustle_side_R', A.bustleSide.ke, Td.bustleHalfWidthM, Td.bustleFloorY, Td.bustleHalfWidthM, 0.76, Td.rearZ + 0.30, Td.stepZ, { ceMm: A.bustleSide.ce }),
    sL('turret_bustle_side_L', A.bustleSide.ke, Td.bustleHalfWidthM, Td.bustleFloorY, Td.bustleHalfWidthM, 0.76, Td.rearZ + 0.30, Td.stepZ, { ceMm: A.bustleSide.ce }),
    rr('turret_rear', A.turretRear, 0.86, 0.27, Td.rearZ, 0.80, Td.rearZ),
    rf('turret_roof', A.turretRoof, hwT * 0.92, Td.roofRearY, Td.rearZ, Td.coreFrontZ),
  ];
  const modules = [
    mbox('engine', [-tw, 0.56, -3.70], [tw, 1.72, -2.10]),
    mbox('transmission', [-tw * 0.95, 0.60, -3.70], [tw * 0.95, 1.30, -3.20]),
    mbox('fuelTank', [tw * 0.45, 0.56, -2.05], [tw, 1.20, -0.95]),
    mbox('ammoRack', [-1.02, Td.bustleFloorY + 0.03, Td.rearZ + 0.08], [1.02, 0.74, Td.stepZ - 0.05], true),
    mbox('turretRing', [-1.02, 1.52, Td.pivot[2] - 1.02], [1.02, 1.70, Td.pivot[2] + 1.02]),
    mbox('radio', [-tw * 0.85, 0.90, -1.90], [-tw * 0.30, 1.40, -1.10]),
    mbox('optics', [-0.90, 0.60, 0.40], [-0.34, 1.10, 0.92], true),
    mbox('gun', [-0.20, gy - 0.22, -0.90], [0.20, gy + 0.26, tf], true),
    mbox('trackL', [-hw - 0.15, 0.0, -3.55], [-tw, 1.30, 3.45]),
    mbox('trackR', [tw, 0.0, -3.55], [hw + 0.15, 1.30, 3.45]),
  ];
  const crew = [
    cbox('driver', [-0.85, 0.62, 1.70], [-0.20, 1.40, 2.55]),
    cbox('gunner', [-0.95, 0.05, -0.30], [-0.25, 0.70, 0.55], true),
    cbox('commander', [0.25, 0.08, -0.95], [0.95, 0.80, -0.05], true),
  ];
  return {
    boundingRadiusM: 6.1, // the muzzle 5.71 m ahead, 2.0 m up
    turretPivot: [Td.pivot[0], Td.pivot[1], Td.pivot[2]],
    gunPivot: [Td.gunLocal[0], Td.gunLocal[1], Td.gunLocal[2]],
    gunBarrel: { lengthM: Td.barrelLengthM, radiusM: 0.1 }, // the thermal sleeve's 0.10 m
    hullPlates, turretPlates, modules, crew,
  };
}
