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
  /** the vertical upper hull sides over the tracks, and the fender bands' outer faces */
  sideX: 1.50, fenderX: 1.62,
  /** the lower hull between the tracks, its belly and the sponsons' undersides over the track run */
  tubX: 1.06, bellyY: 0.45, sponsonY: 1.29,
  /** the flat roof plane (the turret ring's), the glacis' top edge, the nose edge and the lower glacis' foot */
  deckY: 2.00, glacisTopZ: 3.15, noseY: 1.40, lowerFootZ: 3.35,
  /** the stern: the deck's aft edge, the sloped rear deck's foot on the stern plate */
  deckRearZ: -3.40, sternTopY: 1.84, sternFootY: 0.95, sternBellyZ: -3.70,
  /** the fender band: its inner (hull-side) and outer bottom edges and its top */
  fenderInnerBottomY: 1.29, fenderOuterBottomY: 1.13, fenderTopY: 1.33, fenderOuterTopY: 1.28,
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

/** The 2K22M Tunguska-M turret, turret-local. */
export const TUNGUSKA = Object.freeze({
  /** the trunnion of both 2A38M cradles and both 9M311 racks (gun-local origin) */
  gunPivot: Object.freeze([0, 0.72, 0.18] as const),
  /** each 2A38M's centre, its two bores either side of it, and their mouths (gun-local) */
  gunX: 1.00, boreDx: 0.055, muzzleZ: 2.20,
  /** the wide octagonal lower turret, the upper body, the radar housing at the back */
  drum: Object.freeze({ bottomApothem: 1.12, topApothem: 1.06, bottomY: 0.012, topY: 0.26 }),
  body: Object.freeze({ halfWidth: 0.80, bottomY: 0.22, roofY: 1.02, rearZ: -1.30, frontZ: 1.20, browZ: 1.07, browY: 0.98 }),
  radarBox: Object.freeze({ halfWidth: 0.78, bottomY: 0.20, topY: 1.10, rearZ: -2.00, frontZ: -1.20 }),
  /** the 9M311M racks (gun-local): the rounded cradle box and its four containers, two columns by two rows */
  rack: Object.freeze({ innerX: 1.18, outerX: 1.62, rearZ: -0.42, frontZ: 0.70, bottomY: -0.34, topY: 0.16,
    tubeXs: Object.freeze([1.295, 1.505]), tubeYs: Object.freeze([-0.20, 0.02]), tubeR: 0.10, tubeRearZ: 0.40,
    mouthZ: 1.72 }),
});

/** The Pantsir-S1 combat module, turret-local. */
export const PANTSIR = Object.freeze({
  gunPivot: Object.freeze([0, 0.86, 0.12] as const),
  gunX: 0.80, boreDx: 0.055, muzzleZ: 2.35,
  platform: Object.freeze({ bottomApothem: 1.04, topApothem: 0.98, bottomY: 0.012, topY: 0.20 }),
  body: Object.freeze({ halfWidth: 0.55, bottomY: 0.18, topY: 0.95, rearZ: -1.25, frontZ: 0.55 }),
  /** the tracking radar's drum and its front radome */
  radar: Object.freeze({ r: 0.50, y: 0.80, rearZ: 0.30, frontZ: 1.05 }),
  /** the 57E6 banks (gun-local): six containers in two columns of three, on a cradle box with the armoured side box */
  bank: Object.freeze({ tubeXs: Object.freeze([1.20, 1.42]), tubeYs: Object.freeze([-0.19, 0.08, 0.35]), tubeR: 0.085,
    tubeRearZ: -0.50, mouthZ: 2.10, cradleInnerX: 1.07, cradleOuterX: 1.55, cradleRearZ: -0.55, cradleFrontZ: 0.45,
    cradleBottomY: -0.42, cradleTopY: -0.20, sideInnerX: 1.36, sideOuterX: 1.56, sideBottomY: -0.45, sideTopY: -0.05,
    sideRearZ: -0.55, sideFrontZ: 0.50 }),
  /** the search radar's mast and its flat panel at the module's back */
  searchRadar: Object.freeze({ z: -0.92, mastR: 0.22, mastTopY: 1.30, halfWidth: 0.65, panelBottomY: 1.15, panelTopY: 2.10,
    depth: 0.28 }),
});

/** Every launch exit (gun-local): one per drawn container, left to right, lower row first. */
export function rackMouths(xs: readonly number[], ys: readonly number[], z: number): { x: number; y: number; z: number }[] {
  return [-1, 1].flatMap((side) => xs.flatMap((x) => ys.map((y) => ({ x: side * x, y, z }))));
}
