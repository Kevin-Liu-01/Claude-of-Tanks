// Type 87 self-propelled anti-aircraft gun (release 269, builder J): the measured frame both the build
// (profiles/type87.ts) and the combat record (type87Specs.ts) read, so the drawn turret, pods, guns and radars and the
// spec's pivots, bores and plates never drift apart. Dependency-free data (the spec pack imports it at boot).
//
// Every number is read from the Camp Shimoshizu photographs (docs/references/tanks/type87_aw.md; photo numbers below)
// through one camera model of photo 01 (the right side, radar up): the five road wheels on the fleet Type 74's 1.01 m
// pitch give 205 px/m at the wheel plane; the two muzzles (one gun each side) put that plane 8.0 m from the lens, so the
// turret's centreline reads at 176 px/m and its flanks at 190-200; the horizon (the eye) stands at 1.27 m. Widths come
// from the telephoto front view (photo 05, 227-239 px/m), the rear block's from photo 07. Published (en/ja.wikipedia):
// 7.99 m with the guns forward, 3.18 m wide, 3.25 m with both radars folded and 4.40 m with them raised.
// Program frame: +z forward, metres; +x is the vehicle's LEFT (vehicleSide.ts), so the right-side kit of photo 01 sits
// at -x.
// First-party: Kevin B. Liu (NOTICE.md).

/** The Type 74 hull's turret ring datum (profiles/type74Family.ts TURRET_PIVOT): the Type 87 turns on the same ring. */
export const TYPE87_RING = Object.freeze([0, 1.60, 0.50] as const);

/**
 * The enlarged hull's stern (ja.wikipedia: "74式戦車の車体を拡大した新造車体", a new hull enlarged from the Type 74's):
 * photo 01 puts the deck's and sponsons' rear end 1.03 m behind the sprocket's axis (the Type 74's 0.17 m), the lower
 * hull 0.63 m behind it. The Type 74 builder's default-off overhung stern (Type74FamilyOptions.overhungSternZ) builds
 * it: the hull is 7.32 m against the Type 74's 6.77 m, and 7.95 m with the guns forward (the published 7.99).
 */
export const TYPE87_STERN_Z = -3.95;

/**
 * The welded turret, turret-local (ring plane y 0, +z forward):
 *   - a long central body the turret's full height (photos 01, 05-07), 1.40 m wide, its rear face 1.85 m behind the ring
 *     (photo 01: the rear block at 695 px), its nose 1.95 m ahead (1,418 px), the roof 1.02 m over the ring (photo 01: the
 *     front roof edge at 533 px, 2.62 m), the nose a wedge (an upper plate leaning back 11 degrees over a chin raked 30,
 *     the top edge bevelled, photos 01, 04, 06) with its vertical front edges chamfered to a 1.20 m face (photo 06);
 *   - a low cheek under each pod's front, 2.28 m across the pair (photo 05: 700-1,245 px), 0.40 m tall (photo 01: the
 *     smoke dischargers' block, 640-725 px), from the ring's line to 1.10 m ahead of it;
 *   - the gun pods: fixed armoured housings either side of the body's middle (photos 03-06: their front aspect is the
 *     same 0.60 x 0.65 m at 30, 75 and 90 degrees of elevation, so they do not pitch; the barrels rise out of their
 *     fronts), 0.60 m wide (photo 05: 650-790 px), 1.20 m long and their axis 7 degrees nose-up (photo 01: the top from
 *     532 to 500 px, the bottom from 640 to 615), the section faceted (a broad chamfer along the top outer edge);
 *   - under each pod, the large round cover on the body's flank whose lower half shows below it (photo 01: 0.46 m radius
 *     about 920/615 px).
 */
export const TYPE87_TURRET = Object.freeze({
  floorY: 0.02, roofY: 1.02, roofChamfer: 0.05,
  bodyHalfW: 0.70, rearZ: -1.85, rearChamfer: 0.10,
  // the nose: the roof's front edge, the bevel's foot, the upper plate's foot, the chin's foot and the underside's front
  noseRoofZ: 1.72, bevelZ: 1.86, bevelY: 0.94, faceZ: 1.95, faceY: 0.40, chinZ: 1.80, chinY: 0.17, bellyZ: 1.60,
  noseHalfW: 0.60, noseEdgeZ: 1.76,
  cheekInnerX: 0.66, cheekOuterX: 1.14, cheekTopY: 0.42, cheekRearZ: -0.10, cheekFrontZ: 1.10, cheekChamfer: 0.10,
  podInnerX: 0.69, podOuterX: 1.30, podRearZ: -1.40, podFrontZ: -0.22,
  // the pod's foot and top at its rear and front stations (the 7 degree rise)
  podRearBottomY: 0.44, podRearTopY: 0.96, podFrontBottomY: 0.56, podFrontTopY: 1.10,
  coverX: 0.72, coverR: 0.44, coverY: 0.56, coverZ: -0.66,
});

/**
 * The guns' elevation axis (turret-local): at the pods' fronts, on the bores (photo 01: the barrels' line through the
 * nose cones meets the pods' front faces at 546 px, 0.90 m over the ring). The pods do not pitch; each gun's cradle turns
 * in a drum on the axis standing 0.21 m proud of its pod's face, its faceted sleeve and barrel ahead of it.
 */
export const TYPE87_TRUNNION = Object.freeze([0, 0.90, 0.00] as const);

/**
 * The two 35 mm KDA (Oerlikon, Japan Steel Works licence; L/90, a 3.15 m barrel), gun-local: the bores either side
 * (photo 05: 0.94 m out, the pods' inner half) on the axis; the drum, the sleeve to the jacket, the barrel's rings, the
 * muzzle brake with its face flange (the bore mouth, muzzleZ) and the v0 measuring cage of three rods reaching past it to
 * its end ring (photo 01 at 4x: the brake 0.24 m, the cage 0.26 m). The cage's tip stands 3.50 m ahead of the axis:
 * photo 01 measures 3.39 m (the muzzles at 1,670/359 px), 3 % under what the published 7.99 m needs; 3.50 m makes 7.95 m
 * with the guns forward.
 */
export const TYPE87_GUNS = Object.freeze({
  boreX: 0.94, drumR: 0.19, drumW: 0.30,
  sleeveRearZ: 0.08, sleeveHalfW: 0.13, sleeveHalfH: 0.15, sleeveFrontZ: 0.60,
  jacketR: 0.062, jacketFrontZ: 1.30, barrelR: 0.046, barrelTipR: 0.038,
  ringZs: [2.55, 2.80] as readonly number[],
  brakeRearZ: 3.00, brakeR: 0.066, flangeR: 0.074, muzzleZ: 3.24,
  cageRodR: 0.011, cageRodRadius: 0.064, endRingR: 0.075, endRingZ: 3.44, cageTipZ: 3.50,
});

/**
 * The radars (turret-local; photos 01, 02, 05-08):
 *   - the tracking radar on a pedestal behind the hatches on the centreline (photo 01: 745-810 px, rising from between the
 *     rear boxes), a drum leaning forward on its top (photo 02), its covered dish 0.86 m across (photo 05: 200 px) centred
 *     1.95 m over the ring and 1.16 m behind it, facing forward and canted up 26 degrees (photo 01: 135 px tall for 0.86);
 *   - the search radar raised on its arm at the very rear (photo 01): a box-section arm from a hinge between the rear
 *     boxes, up and back to an elbow 0.37 m behind the rear face, a short upright to the turntable, and the antenna, a bar
 *     1.50 m across (photo 05: 350 px), 0.26 m tall and 0.30 m deep, its rounded radome forward (photo 02), its top at
 *     the published 4.40 m raised height (photo 01: 235 px reads 4.42 m).
 */
export const TYPE87_RADARS = Object.freeze({
  pedestalHalfW: 0.22, pedestalRearZ: -1.62, pedestalFrontZ: -1.28, pedestalTopY: 1.86, sightY: 1.55,
  dishR: 0.43, dishY: 1.95, dishZ: -1.16, dishTiltDeg: 26,
  hingeY: 1.12, hingeZ: -1.76, elbowY: 2.18, elbowZ: -2.22, armHalfW: 0.17, armDepth: 0.22,
  antennaY: 2.66, antennaZ: -2.26, antennaHalfW: 0.75, antennaHalfH: 0.13, antennaDepth: 0.30,
});

/** The rear roof's two stowage boxes either side of the arm's hinge (photos 07, 09: 0.39 m wide, 0.36 m tall). */
export const TYPE87_REAR_BOXES = Object.freeze({ innerX: 0.25, outerX: 0.65, rearZ: -1.82, frontZ: -1.30, topY: 1.36 });
