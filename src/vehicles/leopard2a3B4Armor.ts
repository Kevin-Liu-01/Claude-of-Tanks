// The Leopard 2A3 of the fourth batch (release 262; profiles/leopard2a3B4.ts draws it, leopard2a3B4Specs.ts carries this
// envelope): its turret datums and combat envelope, from one table; the hull is the release's Leopard 2-pattern hull
// (leopard2HullDatums.ts). The turret is measured from the Christian II concept model's Leopard 2 turret (proportions
// only): vertical faces, the gun slot between two cheek blocks, a stepped bustle. Protection is the 2A2's basic package
// (the first four batches share it). Boot-light: plain data and the shared plate helpers, no geometry. Turret metres from
// the ring's centre on the deck.
import {
  plate, rearPlate as rr, rightSidePlate as sR, leftSidePlate as sL, roofPlate as rf,
  rightCheekPlate as chR, leftCheekPlate as chL, moduleBox as mbox, crewBox as cbox, type ArmorEnvelope,
} from './specHelpers.ts';
import { LEOPARD2_HULL, leopard2HullArmor } from './leopard2HullDatums.ts';

/** The turret's datums (turret metres). */
export const LEO2A3B4_TURRET = Object.freeze({
  pivot: LEOPARD2_HULL.ring,
  /** Trunnion: the bore axis 2.00 m over the ground, the L/44's muzzle 5.71 m ahead of the hull's origin. */
  gunLocal: Object.freeze([0, 0.36, 1.04] as const),
  barrelLengthM: 4.29,
  barrelRadiusM: 0.084,
  /** The cheek blocks' vertical faces, their chamfered outer corners, the gun slot between them. */
  frontZ: 1.27,
  cornerZ: 1.03,
  frontHalfWidthM: 1.00,
  slotHalfWidthM: 0.47,
  halfWidthM: 1.27,
  stepZ: -1.62,
  bustleHalfWidthM: 1.15,
  rearZ: -2.73,
  rearHalfWidthM: 0.86,
  roofFrontY: 0.74,
  roofY: 0.83,
  floorY: 0.02,
  bustleFloorY: 0.21,
});

/** The 2A2's basic package (RHAe mm), carried by the first four batches; the 2A3's spec trims stand. */
export const LEO2A3B4_PROTECTION = Object.freeze({
  glacis: { ke: 400, ce: 600, phys: 450 }, lowerFront: { ke: 250, ce: 300 }, side: 80, rear: 45, roof: 40,
  skirtFore: { ke: 60, ce: 220 }, skirtAft: 8, cheek: { ke: 420, ce: 700, phys: 600 }, mantlet: { ke: 350, ce: 420 },
  turretSide: { ke: 300, ce: 420 }, bustleSide: { ke: 160, ce: 220 }, turretRear: 60, turretRoof: 40,
});

/** The combat envelope on the drawn hull and turret. */
export function leo2a3B4Armor(): ArmorEnvelope {
  const Td = LEO2A3B4_TURRET, A = LEO2A3B4_PROTECTION;
  const hull = leopard2HullArmor(A);
  const hwT = Td.halfWidthM, gy = Td.gunLocal[1];
  const turretPlates = [
    chR('turret_cheek_R', A.cheek.phys, Td.slotHalfWidthM, Td.frontZ, hwT, Td.cornerZ, 0.03, Td.roofFrontY, 0, 0, { keMm: A.cheek.ke, ceMm: A.cheek.ce }),
    chL('turret_cheek_L', A.cheek.phys, Td.slotHalfWidthM, Td.frontZ, hwT, Td.cornerZ, 0.03, Td.roofFrontY, 0, 0, { keMm: A.cheek.ke, ceMm: A.cheek.ce }),
    plate('mantlet', A.mantlet.ke, [-0.44, gy - 0.27, Td.gunLocal[2] + 0.31], [0.44, gy - 0.27, Td.gunLocal[2] + 0.31],
      [-0.44, gy + 0.30, Td.gunLocal[2] + 0.31], { keMm: A.mantlet.ke, ceMm: A.mantlet.ce, gunFollow: true }),
    sR('turret_side_R', A.turretSide.ke, hwT, Td.floorY, hwT, 0.76, Td.stepZ, Td.cornerZ, { ceMm: A.turretSide.ce }),
    sL('turret_side_L', A.turretSide.ke, hwT, Td.floorY, hwT, 0.76, Td.stepZ, Td.cornerZ, { ceMm: A.turretSide.ce }),
    sR('turret_bustle_side_R', A.bustleSide.ke, Td.bustleHalfWidthM, Td.bustleFloorY, Td.bustleHalfWidthM, 0.78, Td.rearZ + 0.28, Td.stepZ, { ceMm: A.bustleSide.ce }),
    sL('turret_bustle_side_L', A.bustleSide.ke, Td.bustleHalfWidthM, Td.bustleFloorY, Td.bustleHalfWidthM, 0.78, Td.rearZ + 0.28, Td.stepZ, { ceMm: A.bustleSide.ce }),
    rr('turret_rear', A.turretRear, Td.rearHalfWidthM, 0.27, Td.rearZ, 0.80, Td.rearZ),
    rf('turret_roof', A.turretRoof, hwT * 0.92, Td.roofY, Td.rearZ, Td.cornerZ),
  ];
  const modules = [
    ...hull.power,
    mbox('ammoRack', [-1.02, Td.bustleFloorY + 0.03, Td.rearZ + 0.08], [1.02, 0.76, Td.stepZ - 0.05], true),
    mbox('turretRing', [-1.02, 1.52, Td.pivot[2] - 1.02], [1.02, 1.70, Td.pivot[2] + 1.02]),
    hull.radio,
    mbox('optics', [-0.97, 0.42, 0.60], [-0.51, 0.86, 1.27], true),
    mbox('gun', [-0.20, gy - 0.22, -0.90], [0.20, gy + 0.26, Td.frontZ], true),
    ...hull.tracks,
  ];
  // four crew: the driver (right front), the gunner and the commander right of the gun, the loader left
  const crew = [
    hull.driver,
    cbox('gunner', [-0.95, 0.05, -0.10], [-0.30, 0.70, 0.70], true),
    cbox('commander', [-1.05, 0.10, -0.95], [-0.40, 0.82, -0.15], true),
    cbox('loader', [0.30, 0.05, -0.90], [1.00, 0.80, 0.10], true),
  ];
  return {
    boundingRadiusM: 6.1, // the muzzle 5.71 m ahead, 2.0 m up
    turretPivot: [Td.pivot[0], Td.pivot[1], Td.pivot[2]],
    gunPivot: [Td.gunLocal[0], Td.gunLocal[1], Td.gunLocal[2]],
    gunBarrel: { lengthM: Td.barrelLengthM, radiusM: 0.1025 }, // the thermal sleeve's radius (the rig census measures it)
    hullPlates: hull.hullPlates, turretPlates, modules, crew,
  };
}
