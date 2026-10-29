// The early production Leopard 2s on the release-262 construction (profiles/leopard2a3B4.ts draws them: the 2A2, the
// 2A3 of the fourth batch and the 2A3 OTCO; their specs carry this envelope): the turret datums and combat envelope, from
// one table; the hull is the release's Leopard 2-pattern hull (leopard2HullDatums.ts). The turret is measured from the
// Christian II concept model's Leopard 2 turret (proportions only): vertical faces, the gun slot between two cheek
// blocks, a stepped bustle. Protection is the 2A2's basic package (the first four batches share it). Boot-light: plain
// data and the shared plate helpers, no geometry. Turret metres from the ring's centre on the deck.
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
  /**
   * The cheek blocks: their faces at the gun slot frontZ (hull z 2.02, over the driver's hatch: Björn Huber's 2A4 side
   * drawing registered by road-wheel pitch, the 2A4 lane 2026-10-28), straight across to 1.20 m off the bore and swept
   * back cheekSweepDeg toward the outer ends (the owner, 2026-10-28: "if you look top down, the chheeks are at a slight
   * slope, like \ / but not extreme"; shown both readings: "A built now is correct", the outer ends set back), a short
   * chamfer to the side walls; the faces vertical to faceTopY, then a bevel back cheekBevelM to the flat tops at cheekTopY
   * (the photographed 2A4 fronts; the owner via the 2A4 lane: "fronts of leo 2a4s are sloped though"); the welded shell
   * ends at cheekRootZ and the blocks stand in front of it.
   */
  frontZ: 1.65,
  cheekSweepDeg: 6,
  frontHalfWidthM: 1.20,
  slotHalfWidthM: 0.475,
  halfWidthM: 1.27,
  cheekRootZ: 1.03,
  cornerChamferM: 0.10,
  faceTopY: 0.60,
  cheekTopY: 0.775,
  cheekBevelM: 0.22,
  /**
   * The EMES 15's notch in the right cheek's top inboard corner, open to the front and the top through the bevel: its
   * walls 0.50 and 0.94 m right of the bore, its sill 6 cm over the bore, sightDepthM deep to the sight head; the head's
   * armoured housing on the cheek's top behind it, its foot sightLintelY, its top sightTopY. Measured from the cited photos
   * (docs/references/tanks/leo2a3_b4.md, "Turret front"); the lintel rose 5 cm after the photo critic (its face over the
   * opening is a thin lip in the owner's photo, not a deep brow).
   */
  sightInnerX: 0.50,
  sightOuterX: 0.94,
  sightSillY: 0.42,
  sightLintelY: 0.75,
  sightTopY: 0.86,
  sightDepthM: 0.22,
  stepZ: -1.62,
  bustleHalfWidthM: 1.15,
  /** The bustle's rear plate (hull z -2.27, the registered drawing's). */
  rearZ: -2.64,
  rearHalfWidthM: 0.86,
  /**
   * The mantlet (0.93 m wide, 0.20 m under the bore to 0.33 m over it), its face in the gun's frame 3 cm behind the
   * cheeks' faces at the slot (R4's photo critic and the 2A4 lane's four photographed 2A4s agree; the line reads as one
   * turret with the 2A4s); its round boss stands proud of it.
   */
  mantletFaceZ: 0.58,
  mantletHalfWidthM: 0.465,
  mantletBottomM: -0.20,
  mantletTopM: 0.33,
  roofY: 0.83,
  floorY: 0.02,
  bustleFloorY: 0.21,
});

/** The vertical cheek face's z at |x| off the bore (turret metres): frontZ at the slot, swept back cheekSweepDeg outward. */
export function cheekFaceZ(x: number): number {
  const T = LEO2A3B4_TURRET;
  return T.frontZ - Math.max(0, Math.abs(x) - T.slotHalfWidthM) * Math.tan(T.cheekSweepDeg * Math.PI / 180);
}

/** Where the chamfer meets the side wall (turret metres). */
export const LEO2A3B4_CORNER_Z = cheekFaceZ(LEO2A3B4_TURRET.frontHalfWidthM) - LEO2A3B4_TURRET.cornerChamferM;

/** The notch's back (the sight head's face): sightDepthM behind the face at the notch's centre. */
export const LEO2A3B4_SIGHT_BACK_Z = cheekFaceZ((LEO2A3B4_TURRET.sightInnerX + LEO2A3B4_TURRET.sightOuterX) / 2)
  - LEO2A3B4_TURRET.sightDepthM;

/** How much deeper the production Leopard 2's three heavy fore skirt blocks hang than the aft run (the photographed step). */
export const EARLY_LEOPARD2_FORE_SKIRT_DROP_M = 0.16;

/**
 * The forward lifting eyes on the upper glacis (hull z): the cheeks reaching over the driver's hatch sweep the roof's
 * front corners (1.98 m off the ring against the eyes' 1.76), and the depressed gun's boss met them; here they stand
 * 2.5 m off the ring, under the gun's -9 degree line by 3 cm.
 */
export const EARLY_LEOPARD2_FORWARD_LIFT_EYE_Z = 2.40;

/** The 2A2's basic package (RHAe mm), carried by the first four batches; the 2A3's spec trims stand. */
export const LEO2A3B4_PROTECTION = Object.freeze({
  glacis: { ke: 400, ce: 600, phys: 450 }, lowerFront: { ke: 250, ce: 300 }, side: 80, rear: 45, roof: 40,
  skirtFore: { ke: 60, ce: 220 }, skirtAft: 8, cheek: { ke: 420, ce: 700, phys: 600 }, mantlet: { ke: 350, ce: 420 },
  turretSide: { ke: 300, ce: 420 }, bustleSide: { ke: 160, ce: 220 }, turretRear: 60, turretRoof: 40, turretRoofFore: 70,
  // what a round through the EMES 15's notch meets along its line: the sight head, then the 660 mm block behind the
  // cavity, about 0.6 of the full cheek's 1.1 m (the 2A4 front's known weak spot; btvt/Militarysta via the source note)
  sightNotch: { ke: 250, ce: 420, phys: 360 },
});

/** The combat envelope on the drawn hull and turret. */
export function leo2a3B4Armor(): ArmorEnvelope {
  const Td = LEO2A3B4_TURRET, A = LEO2A3B4_PROTECTION;
  const hull = leopard2HullArmor(A, EARLY_LEOPARD2_FORE_SKIRT_DROP_M);
  // the mantlet rides the gun mount, outside the turret's collision shell: a round there lands on the shell's slot face, at
  // the cheeks' plane, and takes the mantlet's plate there (authored past the shell, it would squeeze every turret plate
  // back onto the calibrated envelope)
  const hwT = Td.halfWidthM, gy = Td.gunLocal[1], mz = Td.frontZ;
  // the cheeks: their swept vertical faces, the bevels back to their tops, the chamfers to the side walls
  const y0 = 0.03, yf = Td.faceTopY, yt = Td.cheekTopY, cheek = { keMm: A.cheek.ke, ceMm: A.cheek.ce };
  const fi = cheekFaceZ(Td.slotHalfWidthM), fo = cheekFaceZ(Td.frontHalfWidthM), bevel = Td.cheekBevelM;
  // the sight notch as the collision shell meets it: the notch's own lateral band (TURRET_LATERAL_CUTS in
  // tools/gen-combat-anatomy.mjs) closes over it from the sill's front edge to the sight housing's top front edge, so the
  // plate lies on that slope and carries the notch's line-of-sight protection onto it; its top on the roof's plane (the
  // calibrated envelope's)
  const sill = Td.sightSillY, back = LEO2A3B4_SIGHT_BACK_Z;
  const fso = cheekFaceZ(Td.sightOuterX), fsi = cheekFaceZ(Td.sightInnerX), fs = (fso + fsi) / 2;
  const rise = Td.sightTopY - sill, run = fs - back;
  const slope = rise / Math.hypot(rise, run), notch = A.sightNotch;
  const ny = Td.roofY, nz = fso - run * (ny - sill) / rise;
  const mhw = Td.mantletHalfWidthM;
  const turretPlates = [
    chR('turret_cheek_R', A.cheek.phys, Td.slotHalfWidthM, fi, Td.frontHalfWidthM, fo, y0, yf, 0, 0, cheek),
    chL('turret_cheek_L', A.cheek.phys, Td.slotHalfWidthM, fi, Td.frontHalfWidthM, fo, y0, yf, 0, 0, cheek),
    chR('turret_cheek_R_top', A.cheek.phys, Td.slotHalfWidthM, fi, Td.frontHalfWidthM, fo, yf, yt, bevel, 0, cheek),
    chL('turret_cheek_L_top', A.cheek.phys, Td.slotHalfWidthM, fi, Td.frontHalfWidthM, fo, yf, yt, bevel, 0, cheek),
    chR('turret_cheek_R_corner', A.cheek.phys, Td.frontHalfWidthM, fo, hwT, LEO2A3B4_CORNER_Z, y0, yf, 0, 0, cheek),
    chL('turret_cheek_L_corner', A.cheek.phys, Td.frontHalfWidthM, fo, hwT, LEO2A3B4_CORNER_Z, y0, yf, 0, 0, cheek),
    plate('turret_front_sight_notch', Math.round(notch.phys * slope), [-Td.sightOuterX, sill, fso], [-Td.sightInnerX, sill, fsi],
      [-Td.sightOuterX, ny, nz],
      { keMm: Math.round(notch.ke * slope), ceMm: Math.round(notch.ce * slope), moduleLink: 'optics' }),
    plate('mantlet', A.mantlet.ke, [-mhw, gy + Td.mantletBottomM, mz], [mhw, gy + Td.mantletBottomM, mz],
      [-mhw, gy + Td.mantletTopM, mz], { keMm: A.mantlet.ke, ceMm: A.mantlet.ce, gunFollow: true }),
    // the cheeks' tops, behind their bevels (btvt: the roof's front plates, 70 mm)
    rf('turret_roof_fore', A.turretRoofFore, hwT * 0.92, yt, Td.cheekRootZ, fo - bevel),
    sR('turret_side_R', A.turretSide.ke, hwT, Td.floorY, hwT, 0.76, Td.stepZ, LEO2A3B4_CORNER_Z, { ceMm: A.turretSide.ce }),
    sL('turret_side_L', A.turretSide.ke, hwT, Td.floorY, hwT, 0.76, Td.stepZ, LEO2A3B4_CORNER_Z, { ceMm: A.turretSide.ce }),
    sR('turret_bustle_side_R', A.bustleSide.ke, Td.bustleHalfWidthM, Td.bustleFloorY, Td.bustleHalfWidthM, 0.78, Td.rearZ + 0.28, Td.stepZ, { ceMm: A.bustleSide.ce }),
    sL('turret_bustle_side_L', A.bustleSide.ke, Td.bustleHalfWidthM, Td.bustleFloorY, Td.bustleHalfWidthM, 0.78, Td.rearZ + 0.28, Td.stepZ, { ceMm: A.bustleSide.ce }),
    rr('turret_rear', A.turretRear, Td.rearHalfWidthM, 0.27, Td.rearZ, 0.80, Td.rearZ),
    rf('turret_roof', A.turretRoof, hwT * 0.92, Td.roofY, Td.rearZ, Td.cheekRootZ),
  ];
  const modules = [
    ...hull.power,
    mbox('ammoRack', [-1.02, Td.bustleFloorY + 0.03, Td.rearZ + 0.08], [1.02, 0.76, Td.stepZ - 0.05], true),
    mbox('turretRing', [-1.02, 1.52, Td.pivot[2] - 1.02], [1.02, 1.70, Td.pivot[2] + 1.02]),
    hull.radio,
    // the EMES 15's head at the back of its notch, under its armoured housing
    mbox('optics', [-Td.sightOuterX - 0.03, Td.sightSillY, back - 0.60], [-Td.sightInnerX, Td.sightTopY, back], true),
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
