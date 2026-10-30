// The Christian II's turret datums and combat envelope (release 262; profiles/christian2.ts draws the vehicle,
// christian2Specs.ts carries this envelope), from one table; its hull is the release's Leopard 2-pattern hull
// (leopard2HullDatums.ts). Boot-light: plain data and the shared plate helpers, no geometry. Turret metres from the
// ring's centre on the deck.
import {
  plate, rearPlate as rr, rightSidePlate as sR, leftSidePlate as sL, roofPlate as rf,
  rightCheekPlate as chR, leftCheekPlate as chL, moduleBox as mbox, crewBox as cbox, type ArmorEnvelope,
} from './specHelpers.ts';
import { LEOPARD2_HULL, leopard2HullArmor } from './leopard2HullDatums.ts';
import { cheekCornerZ, cheekFaceZ, sightBackZ, type Leopard2CheekFront } from './leopard2CheekFrontDatums.ts';

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
  /** The welded shell's front, behind the cheek blocks' bevelled outer tops (the shared cheek front's rootZ). */
  coreFrontZ: 0.91,
  /**
   * The cheek blocks' faces at the gun slot's edges, swept back in plan toward the walls (the supplied model's faces
   * measure 33.5 degrees on the left and 35.4 on the right; sliced in the christian2 lane, 2026-10-30). The owner,
   * 2026-10-30: "christain 2 missinng thhe angled ness", then "make sure the christain has the winndow cutout and other
   * things on leopard 2a4 session": the cheeks are the early Leopards' and the 2A4 family's construction
   * (leopard2CheekFrontDatums.ts) on these datums, the EMES 15-pattern sight in the right one's window.
   */
  moduleFrontZ: 1.58,
  cheekSweepDeg: 33.8,
  /** The faces vertical to faceTopY (the model's to 2.27 m), a 10 cm bevel back to the blocks' flat tops. */
  faceTopY: 0.64,
  cheekTopY: 0.74,
  cheekBevelM: 0.10,
  /** The faces run straight to 1.17 m off the bore, then a 10 cm chamfer back to the walls. */
  faceHalfWidthM: 1.17,
  cornerChamferM: 0.10,
  /**
   * The gunner's sight window cut through the right cheek's top inboard corner (the model's: 0.52 to 0.90 m off the bore,
   * its sill 2.02 m over the ground, its back 0.35 m behind the face and parallel to it), the armoured housing behind it
   * standing low on the roof as the model's (the 2A4's height).
   */
  sight: Object.freeze({ innerX: 0.52, outerX: 0.90, sillY: 0.38, lintelY: 0.68, topY: 0.83, depthM: 0.35, housingDepthM: 0.62 }),
  /** The gun slot between the cheeks, and the box mantlet filling it to 2 cm a side, as the supplied model's (0.95 m). */
  slotHalfWidthM: 0.475,
  mantletHalfWidthM: 0.455,
  /** The mantlet's face, gun metres ahead of the trunnion: 6 cm proud of the faces' tips, as on the supplied model. */
  mantletFaceZ: 0.60,
  /** The mantlet's top (level with the cheeks' flat tops, its front bevelled to the faces' top) and underside, gun metres
   *  off the bore. */
  mantletTopM: 0.38,
  mantletBottomM: -0.26,
  roofRearY: 0.83,
  bustleFloorY: 0.21,
  floorY: 0.03,
});

/** The cheek front's datums (leopard2CheekFrontDatums.ts, shared with the early Leopards and the 2A4 family): both sides
 *  alike. */
export const CHRISTIAN2_CHEEK_FRONT: Leopard2CheekFront = Object.freeze({
  frontZ: CHRISTIAN2_TURRET.moduleFrontZ, slotHalfWidthM: CHRISTIAN2_TURRET.slotHalfWidthM,
  sweepDeg: CHRISTIAN2_TURRET.cheekSweepDeg, floorY: CHRISTIAN2_TURRET.floorY, faceTopY: CHRISTIAN2_TURRET.faceTopY,
  cheekTopY: CHRISTIAN2_TURRET.cheekTopY, cheekBevelM: CHRISTIAN2_TURRET.cheekBevelM, rootZ: CHRISTIAN2_TURRET.coreFrontZ,
  cornerChamferM: CHRISTIAN2_TURRET.cornerChamferM,
  right: Object.freeze({ faceHalfWidthM: CHRISTIAN2_TURRET.faceHalfWidthM, wallHalfWidthM: CHRISTIAN2_TURRET.halfWidthM }),
  left: Object.freeze({ faceHalfWidthM: CHRISTIAN2_TURRET.faceHalfWidthM, wallHalfWidthM: CHRISTIAN2_TURRET.halfWidthM }),
  sight: CHRISTIAN2_TURRET.sight,
});

/**
 * Protection (RHAe mm). The frontal turret modules and the composite mantlet insert are the concept's 2020s package, with
 * the Strv 122 and Leopard 2A5 class; the hull is a Leopard 2-pattern hull's; the bolted fore skirt blocks are spaced
 * armour, the aft panels thin.
 */
export const CHRISTIAN2_PROTECTION = Object.freeze({
  glacis: { ke: 420, ce: 640, phys: 460 }, lowerFront: { ke: 250, ce: 300 }, side: 80, rear: 45, roof: 40,
  // the mantlet 750/900 since R8 (its box now 0.91 by 0.64 m, filling the slot to the blocks' tops): at 850/1000 the
  // tier-fairness-259 round robin read 0.718 (12/34 in band), at 750/900 0.523 (21/34); the cheeks' 760 barely moves it
  skirtFore: { ke: 60, ce: 220 }, skirtAft: 8, cheek: { ke: 760, ce: 1100, phys: 700 }, mantlet: { ke: 750, ce: 900 },
  turretSide: { ke: 300, ce: 420 }, bustleSide: { ke: 160, ce: 220 }, turretRear: 60, turretRoof: 40,
  // what a round through the sight window meets along its line: the sight head, then the block behind the cavity, 0.6 of
  // the full cheek (the early Leopards' ratio, leopard2a3B4Armor.ts)
  sightNotch: { ke: 450, ce: 660, phys: 420 },
});

/** The combat envelope on the drawn hull and turret. */
export function christian2Armor(): ArmorEnvelope {
  const Td = CHRISTIAN2_TURRET, A = CHRISTIAN2_PROTECTION;
  const hull = leopard2HullArmor(A);
  const F = CHRISTIAN2_CHEEK_FRONT, tf = Td.moduleFrontZ, hwT = Td.halfWidthM, gy = Td.gunLocal[1];
  // the cheeks (the early Leopards' plates, leopard2a3B4Armor.ts): their swept vertical faces, the bevels back to their
  // tops, the chamfers to the side walls; the mantlet's plate 4 cm inside its face
  const y0 = 0.03, yf = F.faceTopY, yt = F.cheekTopY, cheek = { keMm: A.cheek.ke, ceMm: A.cheek.ce };
  const fw = F.right.faceHalfWidthM, fi = cheekFaceZ(F, F.slotHalfWidthM), fo = cheekFaceZ(F, fw);
  const corner = cheekCornerZ(F, F.right), bevel = F.cheekBevelM, mz = Td.gunLocal[2] + Td.mantletFaceZ - 0.04;
  // the sight window as the collision shell meets it: the window's lateral band closes over it from the sill's front edge
  // to the housing's top front edge, so the plate lies on that slope and carries the window's line-of-sight protection,
  // at its obliquity to a frontal round (the cosine of its normal on the bore's axis)
  const S = F.sight, back = sightBackZ(F), fso = cheekFaceZ(F, S.outerX), fsi = cheekFaceZ(F, S.innerX);
  const fs = (fso + fsi) / 2, rise = S.topY - S.sillY, run = fs - back, ny = Td.roofRearY, nz = fso - run * (ny - S.sillY) / rise;
  const ux = S.outerX - S.innerX, uz = fsi - fso, wy = ny - S.sillY, wz = nz - fso;
  const slope = Math.abs(ux * wy) / Math.hypot(uz * wy, ux * wz, ux * wy), notch = A.sightNotch;
  const turretPlates = [
    chR('turret_cheek_R', A.cheek.phys, F.slotHalfWidthM, fi, fw, fo, y0, yf, 0, 0, cheek),
    chL('turret_cheek_L', A.cheek.phys, F.slotHalfWidthM, fi, fw, fo, y0, yf, 0, 0, cheek),
    chR('turret_cheek_R_top', A.cheek.phys, F.slotHalfWidthM, fi, fw, fo, yf, yt, bevel, 0, cheek),
    chL('turret_cheek_L_top', A.cheek.phys, F.slotHalfWidthM, fi, fw, fo, yf, yt, bevel, 0, cheek),
    chR('turret_cheek_R_corner', A.cheek.phys, fw, fo, hwT, corner, y0, yf, 0, 0, cheek),
    chL('turret_cheek_L_corner', A.cheek.phys, fw, fo, hwT, corner, y0, yf, 0, 0, cheek),
    plate('turret_front_sight_notch', Math.round(notch.phys * slope), [-S.outerX, S.sillY, fso], [-S.innerX, S.sillY, fsi],
      [-S.outerX, ny, nz],
      { keMm: Math.round(notch.ke * slope), ceMm: Math.round(notch.ce * slope), moduleLink: 'optics' }),
    plate('mantlet', A.mantlet.ke, [-Td.mantletHalfWidthM, gy + Td.mantletBottomM, mz], [Td.mantletHalfWidthM, gy + Td.mantletBottomM, mz],
      [-Td.mantletHalfWidthM, gy + Td.mantletTopM, mz], { keMm: A.mantlet.ke, ceMm: A.mantlet.ce, gunFollow: true }),
    sR('turret_side_R', A.turretSide.ke, hwT, 0.03, hwT, 0.77, Td.stepZ, corner, { ceMm: A.turretSide.ce }),
    sL('turret_side_L', A.turretSide.ke, hwT, 0.03, hwT, 0.77, Td.stepZ, corner, { ceMm: A.turretSide.ce }),
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
    // the gunner's sight head at the back of its window, under its armoured housing
    mbox('optics', [-S.outerX - 0.03, S.sillY, back - 0.60], [-S.innerX, S.topY, back], true),
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
