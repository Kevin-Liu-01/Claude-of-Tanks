// Release 268 (the twin-cannon air-defence round): the measured datums of the GM-352 chassis family and of the two
// combat modules it carries, the 2K22M Tunguska-M turret and the Pantsir-S1 module (docs/references/tanks/tunguska_m.md,
// pantsir_s1.md). One table, read by the builders (gm352Chassis.ts, tunguskaM.ts, pantsirS1.ts) and by the spec
// (gm352AirDefenseSpecs.ts), so the firing datums, the armour plates and the drawn geometry cannot drift apart.
//
// Frames: the hull's (y 0 the ground, +z forward, +x the vehicle's left); turret-local (the ring's centre on the deck
// plane, the same axes); gun-local (the trunnion axis, +z along the bores at rest). Metres throughout.
// Sources: Wikipedia "2K22 Tunguska" (7.93 x 3.24 m; 3.36 m with the search radar folded, 4.02 m raised), and the
// photographs listed in the packets, scaled on that length (Kuzmin's TankBiathlon 2014 side views: 229 px/m).
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).

/** The GM-352 hull: published 7.93 m long and 3.24 m wide over the fender bands. */
export const GM352_HULL = Object.freeze({
  /** half the hull's length: the bow's nose edge and the stern plate */
  halfLength: 3.965,
  /** the vertical upper hull sides over the tracks, and the fender bands' outer bottom edges */
  sideX: 1.50, fenderX: 1.62,
  /** the lower hull between the tracks, its belly and the sponsons' undersides over the track run */
  tubX: 1.06, bellyY: 0.45, sponsonY: 1.29,
  /** the flat roof plane (the turret ring's), the glacis' top edge, the nose edge and the lower glacis' foot */
  deckY: 2.00, glacisTopZ: 3.15, noseY: 1.40, lowerFootZ: 3.35,
  /** the stern: the deck's aft edge, the sloped rear deck's foot on the stern plate */
  deckRearZ: -3.40, sternTopY: 1.84, sternFootY: 0.95, sternBellyZ: -3.70,
  /** the fender band (TankBiathlon 2014 side view, photograph 02 at 229 px/m: 1.08-1.33 m up, the full length): a plate
   * sloping 27 degrees out and down from the hull side's foot to its outer edge, 3 cm thick; over the bow its lower edge
   * drops to 0.97 m and its top rises to the nose, the front end raked up to the nose's corner */
  fenderTopY: 1.335, fenderBottomY: 1.08, fenderThickness: 0.03, fenderBowZ: 3.40, fenderTipZ: 3.93, fenderTipBottomY: 0.97,
  fenderTipTopY: 1.40,
  /** the band's butt joints (photograph 02: x 405, 775, 1165, 1555) */
  fenderJointZs: Object.freeze([-2.44, -0.82, 0.88, 2.59]),
});

/** The GM-352 running gear: six road wheels a side on hydropneumatic arms, three return rollers, the rear drive
 * sprocket and the front idler (photographs: wheel pitch 0.99 m, wheel 0.69 m, sprocket and idler hubs 0.87 m up). */
export const GM352_GEAR = Object.freeze({
  wheelR: 0.34, wheelW: 0.18, xc: 1.29, trackW: 0.36, topY: 1.08,
  wheelZs: Object.freeze([2.43, 1.44, 0.45, -0.54, -1.53, -2.52]),
  sprocket: Object.freeze({ z: -3.30, y: 0.86, r: 0.32 }),
  idler: Object.freeze({ z: 2.98, y: 0.86, r: 0.30 }),
  rollers: Object.freeze([1.93, -0.05, -2.03]),
  rollerY: 0.94, rollerR: 0.075,
});

/** The turret ring: on the deck plane, 0.35 m ahead of the hull's middle (both modules, one GM-352 roof opening). */
export const GM352_RING: readonly [number, number, number] = Object.freeze([0, 2.00, 0.35]);

/** The 2K22M Tunguska-M turret, turret-local (TankBiathlon 2014 side views, photographs 02 and 05, 229 and 225 px/m). */
export const TUNGUSKA = Object.freeze({
  /** the trunnion of both 2A38M cradles and both 9M311 racks (gun-local origin) */
  gunPivot: Object.freeze([0, 0.72, 0.18] as const),
  /** each 2A38M's centre, its two bores either side of it, and their mouths (gun-local: photograph 02's muzzles 2.21 m
   * ahead of the ring, 0.28 m past the tracking radar's face) */
  gunX: 1.00, boreDx: 0.055, muzzleZ: 2.03,
  /** the broad round lower turret: an oval plan 2.76 x 2.94 m, its centre 0.27 m ahead of the ring (photograph 02:
   * z -0.93..1.78, photograph 05: its front 1.71), 0.30 m tall with a rounded top edge */
  tub: Object.freeze({ halfWidth: 1.38, halfLength: 1.47, centreZ: 0.27, bottomY: 0.012, topY: 0.305 }),
  /** the upper body on it, its roof's front edge rounded down onto the front plate (photograph 02: radius ~0.22 m) */
  body: Object.freeze({ halfWidth: 0.80, bottomY: 0.22, roofY: 1.02, rearZ: -1.30, frontZ: 1.20, browZ: 0.98, browY: 0.80 }),
  /** the search radar's tall housing at the back */
  radarBox: Object.freeze({ halfWidth: 0.78, bottomY: 0.20, topY: 1.10, rearZ: -2.00, frontZ: -1.20 }),
  /** the tracking radar's drum, standing ahead of the body on its neck (photograph 02: face 1.93 m ahead of the ring,
   * centre 2.57 m up) */
  trackRadar: Object.freeze({ r: 0.38, y: 0.58, rearZ: 1.52, frontZ: 1.90 }),
  /** the search radar folded for travel, as photographs 01-06 show it: its drive box over the housing's back, the
   * curved plate hinged low in the box and folded back out of its rear face over the engine deck (photograph 02: the
   * plate from 2.11 to 2.94 m behind the ring, 0.96 m over the deck at the box, 0.83 m at its outer edge; photograph 03:
   * 1.7 m across, arched, its ends drooping) */
  searchDrive: Object.freeze({ halfWidth: 0.30, bottomY: 0.92, topY: 1.22, rearZ: -2.55, frontZ: -1.95,
    columnHalfWidth: 0.18, columnBottomY: 0.30, columnDepth: 0.42 }),
  searchPlate: Object.freeze({ hingeY: 0.98, hingeZ: -2.30, halfWidth: 0.85, length: 0.78, fold: 0.20, arch: 0.16,
    thickness: 0.05 }),
  /** the 9M311M launchers (gun-local): one flat armoured side box a flank, 1.4 m long, 0.50 m tall, flush outboard
   * (photograph 02: z -1.00..0.40 ahead of the ring, 0.32-0.84 m over the deck), and the 2x2 containers ahead of it
   * (photographs 08, 12: their covers 0.27 m behind the drum's face). The box's front part elevates with the containers
   * (the cradle, its back an arc about the trunnion); its back part is fixed to the turret, its front a concave arc
   * 3 cm outside the cradle's, so the two read as one box at rest and never meet through the arc. */
  rack: Object.freeze({ innerX: 1.18, outerX: 1.60, frontZ: 0.22, bottomY: -0.38, topY: 0.12, arcR: 0.40,
    housingArcR: 0.43, housingRearZ: -1.18, tubeXs: Object.freeze([1.29, 1.49]), tubeYs: Object.freeze([-0.20, 0.02]),
    tubeR: 0.10, tubeRearZ: 0.05, mouthZ: 1.45 }),
});

/** The Pantsir-S1 combat module, turret-local. */
export const PANTSIR = Object.freeze({
  /** the trunnion: at the module's back, under the launchers' side slabs (photograph 09), so the long slabs and
   * banks swing up off it and never down into the deck */
  gunPivot: Object.freeze([0, 0.86, -0.70] as const),
  /** the 2A38M centres, bores and mouths (gun-local), the receivers 0.42 m out along the bores from the trunnion */
  gunX: 0.80, boreDx: 0.055, muzzleZ: 2.77, gunDz: 0.42,
  platform: Object.freeze({ bottomApothem: 1.04, topApothem: 0.98, bottomY: 0.012, topY: 0.20 }),
  body: Object.freeze({ halfWidth: 0.55, bottomY: 0.18, topY: 0.95, rearZ: -1.25, frontZ: 0.55 }),
  /** the tracking radar's drum and its front radome */
  radar: Object.freeze({ r: 0.50, y: 0.80, rearZ: 0.30, frontZ: 1.05 }),
  /** the 57E6 banks (gun-local): six containers in two columns of three on the cradle; outboard, the flat armoured slab
   * over their back 72 %, 2.2 x 0.70 m, its foot 0.30 m under the lowest container and its back at the search radar's
   * mast (photograph 09); the container covers 0.77 m past the drum's face */
  bank: Object.freeze({ tubeXs: Object.freeze([1.20, 1.42]), tubeYs: Object.freeze([-0.19, 0.08, 0.35]), tubeR: 0.085,
    tubeRearZ: -0.08, mouthZ: 2.52, cradleInnerX: 1.07, cradleOuterX: 1.515, cradleRearZ: -0.30, cradleFrontZ: 1.40,
    cradleBottomY: -0.45, cradleTopY: -0.27, slabInnerX: 1.515, slabOuterX: 1.615, slabBottomY: -0.575, slabTopY: 0.125,
    slabRearZ: -0.40, slabFrontZ: 1.80 }),
  /** the search radar on its mast at the module's back: a landscape box antenna 1.24 x 0.85 x 0.45 m with chamfered top
   * corners (photographs 06, 12), its IFF horns under the back face */
  searchRadar: Object.freeze({ z: -0.92, mastR: 0.22, mastTopY: 1.30, halfWidth: 0.62, panelBottomY: 1.20,
    panelTopY: 2.05, depth: 0.45, chamfer: 0.14 }),
});

/** Every launch exit (gun-local): one per drawn container, left to right, lower row first. */
export function rackMouths(xs: readonly number[], ys: readonly number[], z: number): { x: number; y: number; z: number }[] {
  return [-1, 1].flatMap((side) => xs.flatMap((x) => ys.map((y) => ({ x: side * x, y, z }))));
}
