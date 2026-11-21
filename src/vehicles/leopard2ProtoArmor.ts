// The Leopard 2 Prototype's datums and combat envelope (leopard2_proto, PT 10 / T 17). Release 262 pinned the
// prototype's own envelope here (lane christian2-262), so it no longer follows leo2a2's (classicFleetSpecs.ts). Release 274
// (lane leo2-proto-274, the owner's "completely redesign the leopard 2 prototype") rebuilt the vehicle
// (profiles/leopard2Prototype.ts) and refitted every plate, module and crew box to the drawn hull and turret. Each
// plate's protection (physical, KE and CE millimetres) is the release-262 envelope's, unchanged. Boot-light: plain data
// and the shared plate helpers.
import {
  frontPlate as fr, rearPlate as rr, rightSidePlate as sR, leftSidePlate as sL, roofPlate as rf, plate,
  moduleBox as mbox, crewBox as cbox,
} from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';

/**
 * The Leopard 2 PT 10 / T 17 as drawn (profiles/leopard2Prototype.ts): hull metres (+Z forward, y up from the ground; the
 * world's right of a +Z hull is -X), turret metres from the ring's pivot. Measured from the Saumur and Strangnas
 * walkarounds (panzerplace.eu) at the published 3.70 m width and 2.48 m roof; the running gear is the production Leopard
 * 2's (profiles/leopard2Hull.ts) on the prototype's own stations.
 */
export const LEOPARD2_PROTO = Object.freeze({
  rearZ: -3.86,
  noseZ: 3.86,
  /** Deck line [z, y]: the stern lip, the raised engine deck, the turret deck, the long shallow upper glacis to the nose. */
  deck: Object.freeze([[-3.86, 1.70], [-3.74, 1.74], [-1.62, 1.74], [-1.50, 1.66], [1.80, 1.66], [3.86, 1.08]] as const),
  /** Belly line [z, y]: the lower rear plate raked under the sprocket, the flat belly, the lower glacis up to the nose. */
  belly: Object.freeze([[-3.86, 1.00], [-3.50, 0.52], [2.92, 0.52], [3.86, 1.00]] as const),
  tubHalfWidthM: 1.02,
  sponsonHalfWidthM: 1.70,
  sponsonFloorY: 1.30,
  /** The skirts' and fenders' outer face (the 3.70 m width), the skirts' scalloped foot and their run. */
  skirtOuterX: 1.85,
  skirtFootOverWheelY: 0.78,
  skirtFootBetweenY: 0.58,
  skirtZ: Object.freeze([-3.70, 3.62] as const),
  wheelZs: Object.freeze([2.60, 1.775, 0.95, 0.125, -0.70, -1.525, -2.35] as const),
  idler: Object.freeze({ z: 3.36, y: 0.86, r: 0.26 }),
  sprocket: Object.freeze({ z: -3.30, y: 0.90, r: 0.30 }),
  rollers: Object.freeze([2.19, 1.36, -0.29, -1.94] as const),
  /** The turret's pivot on the deck and the trunnion in it (the prototype's own rig, kept since release 262). */
  turretPivot: Object.freeze([0, 1.72, 0.55] as const),
  gunLocal: Object.freeze([0, 0.26, 1.00] as const),
  /** The 120 mm smoothbore's tube past the trunnion and its radius. */
  barrelLengthM: 4.30,
  barrelRadiusM: 0.07,
  /**
   * The turret ring (the owner, 2026-11-21: "turret looks like its glitching into hull. show turret ring"): the hull's race
   * collar on the deck to ringTopY (world), the turret's ring standing on it, the turret's floor over the ring at
   * turretFloorY (turret metres), so the walls stand 0.12 m clear of the deck with the ring showing under them.
   */
  ringRadiusM: 1.08,
  ringTopY: 1.71,
  turretFloorY: 0.06,
  /** Turret roof over the ring (turret metres; world 2.46) and the shell's front face, the gun slot's back. */
  roofY: 0.74,
  frontZ: 0.80,
});

const P = LEOPARD2_PROTO;

/** The turret's sections the plates are fitted to (turret metres; profiles/leopard2Prototype.ts draws them). */
const T = Object.freeze({
  wallHalfW: 1.27, bustleHalfW: 1.05, rearHalfW: 1.03, roofHalfW: 1.08,
  floorY: P.turretFloorY, bustleFloorY: 0.20, cheekFloorY: 0.14, roofY: 0.76,
  stepZ: -1.46, rearZ: -2.66,
  // the 2A2-pattern cheek front: the faces at the slot's edge, swept back 27 degrees to the chamfer at the walls, bevelled
  // back to flat tops
  cheekSlotHalfW: 0.52, cheekFaceZ: 1.32, cheekFaceOutW: 1.19, cheekOutZ: 0.98, cheekSideEndZ: 0.88, cheekTopY: 0.72,
  cheekBevelM: 0.18,
  // the block mantlet, its face 4 cm proud of the cheeks
  mantletHalfW: 0.48, mantletBottom: -0.17, mantletTop: 0.22, mantletFaceZ: 1.36,
});

/** The hull's extents the plates are fitted to (hull metres). */
const H = Object.freeze({ glacisFootZ: 1.80, deckY: 1.66, engineDeckY: 1.74, bellyY: 0.52, lowerFrontZ: 2.92, noseY: 1.08,
  noseBellyY: 1.00, rearBellyZ: -3.50, rearWallFootY: 1.00, trackOut: 1.68, skirtFoot: 0.60, skirtTop: 1.62 });

export const LEOPARD2_PROTO_ARMOR: Readonly<FleetTankSpec['armor']> = {
  // the muzzle 5.85 m ahead of the hull's centre, 1.98 m up, at any traverse
  boundingRadiusM: 6.3,
  turretPivot: [P.turretPivot[0], P.turretPivot[1], P.turretPivot[2]],
  gunPivot: [P.gunLocal[0], P.gunLocal[1], P.gunLocal[2]],
  gunBarrel: { lengthM: P.barrelLengthM, radiusM: P.barrelRadiusM },
  hullPlates: [
    fr('upper_glacis', 450, P.sponsonHalfWidthM, H.noseY, P.noseZ, H.deckY, H.glacisFootZ, { keMm: 400, ceMm: 600 }),
    fr('lower_front', 100, P.tubHalfWidthM, H.bellyY, H.lowerFrontZ, H.noseBellyY, P.noseZ, { keMm: 250, ceMm: 300 }),
    sR('hull_side_upper_R', 80, P.sponsonHalfWidthM, P.sponsonFloorY, P.sponsonHalfWidthM, H.deckY, P.rearZ, 2.87),
    sL('hull_side_upper_L', 80, P.sponsonHalfWidthM, P.sponsonFloorY, P.sponsonHalfWidthM, H.deckY, P.rearZ, 2.87),
    sR('hull_side_lower_R', 80, P.tubHalfWidthM, H.bellyY, P.tubHalfWidthM, P.sponsonFloorY, H.rearBellyZ, H.lowerFrontZ),
    sL('hull_side_lower_L', 80, P.tubHalfWidthM, H.bellyY, P.tubHalfWidthM, P.sponsonFloorY, H.rearBellyZ, H.lowerFrontZ),
    sR('skirt_R', 8, P.skirtOuterX, H.skirtFoot, P.skirtOuterX, H.skirtTop, P.skirtZ[0], P.skirtZ[1], { kind: 'spaced' }),
    sL('skirt_L', 8, P.skirtOuterX, H.skirtFoot, P.skirtOuterX, H.skirtTop, P.skirtZ[0], P.skirtZ[1], { kind: 'spaced' }),
    sR('track_R', 20, H.trackOut, 0.08, H.trackOut, 1.25, -3.67, 3.69, { kind: 'external', moduleLink: 'trackR' }),
    sL('track_L', 20, H.trackOut, 0.08, H.trackOut, 1.25, -3.67, 3.69, { kind: 'external', moduleLink: 'trackL' }),
    rr('hull_rear', 45, P.sponsonHalfWidthM * 0.98, H.rearWallFootY, P.rearZ, H.engineDeckY, P.rearZ),
    rf('hull_roof', 40, P.sponsonHalfWidthM * 0.96, H.deckY, P.rearZ, H.glacisFootZ),
  ],
  turretPlates: [
    // the cheek blocks' swept faces, from the slot's edge to the chamfer, leaning back by the bevel over their height
    plate('turret_cheek_R', 600, [T.cheekSlotHalfW, T.cheekFloorY, T.cheekFaceZ], [T.cheekFaceOutW, T.cheekFloorY, T.cheekOutZ],
      [T.cheekSlotHalfW, T.cheekTopY, T.cheekFaceZ - T.cheekBevelM], { keMm: 420, ceMm: 700 }),
    plate('turret_cheek_L', 600, [-T.cheekFaceOutW, T.cheekFloorY, T.cheekOutZ], [-T.cheekSlotHalfW, T.cheekFloorY, T.cheekFaceZ],
      [-T.cheekFaceOutW, T.cheekTopY, T.cheekOutZ - T.cheekBevelM], { keMm: 420, ceMm: 700 }),
    // the block mantlet's face in the slot, pitching with the gun
    plate('mantlet', 350, [-T.mantletHalfW, P.gunLocal[1] + T.mantletBottom, T.mantletFaceZ],
      [T.mantletHalfW, P.gunLocal[1] + T.mantletBottom, T.mantletFaceZ], [-T.mantletHalfW, P.gunLocal[1] + T.mantletTop, T.mantletFaceZ],
      { keMm: 350, ceMm: 420, gunFollow: true }),
    sR('turret_side_R', 300, T.wallHalfW, T.floorY, T.roofHalfW, T.roofY, T.stepZ, T.cheekSideEndZ, { ceMm: 420 }),
    sL('turret_side_L', 300, T.wallHalfW, T.floorY, T.roofHalfW, T.roofY, T.stepZ, T.cheekSideEndZ, { ceMm: 420 }),
    sR('turret_bustle_side_R', 300, T.bustleHalfW, T.bustleFloorY, T.roofHalfW - 0.08, T.roofY + 0.02, T.rearZ, T.stepZ, { ceMm: 420 }),
    sL('turret_bustle_side_L', 300, T.bustleHalfW, T.bustleFloorY, T.roofHalfW - 0.08, T.roofY + 0.02, T.rearZ, T.stepZ, { ceMm: 420 }),
    rr('turret_rear', 60, T.rearHalfW, T.bustleFloorY + 0.04, T.rearZ, T.roofY + 0.02, T.rearZ),
    rf('turret_roof', 40, T.roofHalfW, T.roofY, T.rearZ, T.cheekSideEndZ),
  ],
  modules: [
    mbox('engine', [-P.tubHalfWidthM, H.bellyY, P.rearZ + 0.05], [P.tubHalfWidthM, 1.70, -1.70]),
    mbox('fuelTank', [0.48, H.bellyY, -1.65], [P.tubHalfWidthM, 1.20, -0.60]),
    mbox('ammoRack', [-1.00, H.bellyY, -0.60], [1.00, 1.00, 0.70]),
    mbox('turretRing', [-1.00, 1.55, P.turretPivot[2] - 1.00], [1.00, 1.72, P.turretPivot[2] + 1.00]),
    mbox('radio', [-0.95, 0.85, -1.55], [-0.30, 1.35, -0.40]),
    // the EMES 12 runs across the turret's front between its armoured ends; the gunner's periscope sits right
    mbox('optics', [-1.20, 0.30, 0.45], [1.20, 0.56, 0.87], true),
    mbox('gun', [-0.20, P.gunLocal[1] - 0.22, -0.95], [0.20, P.gunLocal[1] + 0.26, T.mantletFaceZ], true),
    mbox('trackL', [-P.skirtOuterX, 0, -3.67], [-P.tubHalfWidthM, 1.30, 3.69]),
    mbox('trackR', [P.tubHalfWidthM, 0, -3.67], [P.skirtOuterX, 1.30, 3.69]),
  ],
  // four crew: the driver (right front), the gunner and the commander right of the gun, the loader left
  crew: [
    cbox('driver', [-0.85, 0.55, 1.55], [-0.25, 1.30, 2.75]),
    cbox('gunner', [-0.87, 0.05, 0.0], [-0.15, 0.58, 0.80], true),
    cbox('commander', [-0.93, 0.05, -1.27], [-0.15, 0.62, -0.35], true),
    cbox('loader', [0.15, 0.05, -1.15], [0.87, 0.58, 0.30], true),
  ],
};
