// The Christian II's turret datums and combat envelope (release 262; profiles/christian2.ts draws the vehicle,
// christian2Specs.ts carries this envelope), from one table; its hull is the release's Leopard 2-pattern hull
// (leopard2HullDatums.ts). Boot-light: plain data and the shared plate helpers, no geometry. Turret metres from the
// ring's centre on the deck.
import {
  plate, rearPlate as rr, rightSidePlate as sR, leftSidePlate as sL, roofPlate as rf,
  rightCheekPlate as chR, leftCheekPlate as chL, moduleBox as mbox, crewBox as cbox, type ArmorEnvelope,
} from './specHelpers.ts';
import { LEOPARD2_HULL, leopard2HullArmor } from './leopard2HullDatums.ts';

/** The turret's datums (turret metres). */
export const CHRISTIAN2_TURRET = Object.freeze({
  pivot: LEOPARD2_HULL.ring,
  /** Trunnion: the bore axis 2.00 m over the ground, the muzzle at the model's 5.70 m. */
  gunLocal: Object.freeze([0, 0.36, 1.04] as const),
  barrelLengthM: 4.29,
  barrelRadiusM: 0.084,
  halfWidthM: 1.28,
  bustleHalfWidthM: 1.16,
  stepZ: -1.57,
  rearZ: -2.73,
  coreFrontZ: 1.04,
  /**
   * The frontal modules' faces at the gun slot's edges. From there they sweep back in plan to meet the side walls at the
   * shell's front, 33.8 degrees (the supplied model's faces measure 33.5 on the left and 35.4 on the right; sliced in the
   * christian2 lane, 2026-10-30). The owner, 2026-10-30: "christain 2 missinng thhe angled ness".
   */
  moduleFrontZ: 1.58,
  /** The modules' tops: the shell's front roof edge (roofFrontY) at its front, falling to the faces' tips. */
  moduleNoseTopY: 0.66,
  /** The gun slot between the modules, and the box mantlet in it, as wide as the supplied model's (0.95 m, 0.88 m). */
  slotHalfWidthM: 0.475,
  mantletHalfWidthM: 0.44,
  /** The mantlet's face, gun metres ahead of the trunnion: 6 cm proud of the modules' tips, as on the supplied model. */
  mantletFaceZ: 0.60,
  roofRearY: 0.83,
  roofFrontY: 0.74,
  bustleFloorY: 0.21,
  floorY: 0.03,
});

/** The frontal modules' vertical face at |x| off the bore: moduleFrontZ at the slot, swept back to the shell's front. */
export function christian2ModuleFaceZ(x: number): number {
  const T = CHRISTIAN2_TURRET, run = (T.moduleFrontZ - T.coreFrontZ) / (T.halfWidthM - T.slotHalfWidthM);
  return T.moduleFrontZ - Math.max(0, Math.abs(x) - T.slotHalfWidthM) * run;
}

/**
 * Protection (RHAe mm). The frontal turret modules and the composite mantlet insert are the concept's 2020s package, with
 * the Strv 122 and Leopard 2A5 class; the hull is a Leopard 2-pattern hull's; the bolted fore skirt blocks are spaced
 * armour, the aft panels thin.
 */
export const CHRISTIAN2_PROTECTION = Object.freeze({
  glacis: { ke: 420, ce: 640, phys: 460 }, lowerFront: { ke: 250, ce: 300 }, side: 80, rear: 45, roof: 40,
  skirtFore: { ke: 60, ce: 220 }, skirtAft: 8, cheek: { ke: 760, ce: 1100, phys: 700 }, mantlet: { ke: 850, ce: 1000 },
  turretSide: { ke: 300, ce: 420 }, bustleSide: { ke: 160, ce: 220 }, turretRear: 60, turretRoof: 40,
});

/** The combat envelope on the drawn hull and turret. */
export function christian2Armor(): ArmorEnvelope {
  const Td = CHRISTIAN2_TURRET, A = CHRISTIAN2_PROTECTION;
  const hull = leopard2HullArmor(A);
  const tf = Td.moduleFrontZ, hwT = Td.halfWidthM, gy = Td.gunLocal[1];
  // the modules' swept vertical faces; the mantlet's plate 4 cm inside its face
  const fo = christian2ModuleFaceZ(hwT), mz = Td.gunLocal[2] + Td.mantletFaceZ - 0.04;
  const turretPlates = [
    chR('turret_cheek_R', A.cheek.phys, Td.slotHalfWidthM, tf, hwT, fo, 0.04, 0.69, 0, 0, { keMm: A.cheek.ke, ceMm: A.cheek.ce }),
    chL('turret_cheek_L', A.cheek.phys, Td.slotHalfWidthM, tf, hwT, fo, 0.04, 0.69, 0, 0, { keMm: A.cheek.ke, ceMm: A.cheek.ce }),
    plate('mantlet', A.mantlet.ke, [-Td.mantletHalfWidthM, gy - 0.23, mz], [Td.mantletHalfWidthM, gy - 0.23, mz],
      [-Td.mantletHalfWidthM, gy + 0.20, mz], { keMm: A.mantlet.ke, ceMm: A.mantlet.ce, gunFollow: true }),
    sR('turret_side_R', A.turretSide.ke, hwT, 0.03, hwT, 0.77, Td.stepZ, Td.coreFrontZ, { ceMm: A.turretSide.ce }),
    sL('turret_side_L', A.turretSide.ke, hwT, 0.03, hwT, 0.77, Td.stepZ, Td.coreFrontZ, { ceMm: A.turretSide.ce }),
    sR('turret_bustle_side_R', A.bustleSide.ke, Td.bustleHalfWidthM, Td.bustleFloorY, Td.bustleHalfWidthM, 0.76, Td.rearZ + 0.30, Td.stepZ, { ceMm: A.bustleSide.ce }),
    sL('turret_bustle_side_L', A.bustleSide.ke, Td.bustleHalfWidthM, Td.bustleFloorY, Td.bustleHalfWidthM, 0.76, Td.rearZ + 0.30, Td.stepZ, { ceMm: A.bustleSide.ce }),
    rr('turret_rear', A.turretRear, 0.86, 0.27, Td.rearZ, 0.80, Td.rearZ),
    rf('turret_roof', A.turretRoof, hwT * 0.92, Td.roofRearY, Td.rearZ, Td.coreFrontZ),
  ];
  const modules = [
    ...hull.power,
    mbox('ammoRack', [-1.02, Td.bustleFloorY + 0.03, Td.rearZ + 0.08], [1.02, 0.74, Td.stepZ - 0.05], true),
    mbox('turretRing', [-1.02, 1.52, Td.pivot[2] - 1.02], [1.02, 1.70, Td.pivot[2] + 1.02]),
    hull.radio,
    mbox('optics', [-0.90, 0.60, 0.40], [-0.34, 1.10, 0.92], true),
    mbox('gun', [-0.20, gy - 0.22, -0.90], [0.20, gy + 0.26, tf], true),
    ...hull.tracks,
  ];
  const crew = [
    hull.driver,
    cbox('gunner', [-0.95, 0.05, -0.30], [-0.25, 0.70, 0.55], true),
    cbox('commander', [0.25, 0.08, -0.95], [0.95, 0.80, -0.05], true),
  ];
  return {
    boundingRadiusM: 6.1, // the muzzle 5.71 m ahead, 2.0 m up
    turretPivot: [Td.pivot[0], Td.pivot[1], Td.pivot[2]],
    gunPivot: [Td.gunLocal[0], Td.gunLocal[1], Td.gunLocal[2]],
    gunBarrel: { lengthM: Td.barrelLengthM, radiusM: 0.1025 }, // the thermal sleeve's radius (the rig census measures it)
    hullPlates: hull.hullPlates, turretPlates, modules, crew,
  };
}
