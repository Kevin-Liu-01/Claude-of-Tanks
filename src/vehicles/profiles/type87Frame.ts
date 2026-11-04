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
 * The enlarged hull (ja.wikipedia: "74式戦車の車体を拡大した新造車体", a new hull enlarged from the Type 74's), built by the
 * Type 74 builder's default-off options (profiles/type74Family.ts Type74FamilyOptions):
 *   - the stern: photo 01 puts the rear end (the stern basket's and the corner bins' backs) 1.03 m behind the sprocket's
 *     axis (the Type 74's 0.17 m); photo 07 shows the upper stern as a raised mesh basket 0.39 m tall across the middle
 *     between two lidded corner bins, over the rear plate. The overhung stern's upper face stands at sternZ, the basket and
 *     bins basketDepth behind it: the hull is 7.35 m against the Type 74's 6.77 m;
 *   - the front: the sponsons' tops run level at the deck to sponsonFrontZ (photo 01: the side's top edge to 1,480 px,
 *     89 % of the hull's length; photos 04, 06), square-ended, the lamp boxes on them at the deck, deep fenders with rubber
 *     flaps over the idlers (photos 04, 06) and the central glacis sloping between them;
 *   - the upper track run nearly straight over the wheels (photos 01, 04: 0.2 m clear of the wheel tops), trackSag;
 *   - the driver on the left (photos 03, 05), the auxiliary power unit's grille on the front deck's right (photo 06), no
 *     tow cable across the glacis.
 */
export const TYPE87_HULL = Object.freeze({
  sternZ: -3.88, basketDepth: 0.10, sponsonFrontZ: 2.61, trackSag: 0.015, driverSide: 1 as const,
});

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
 *     fronts), 0.60 m wide (photo 05: 650-790 px), 0.66 m deep, 1.0 m long to an angular wedge nose, their axis 7 degrees
 *     nose-up (photo 01: the top from 532 to 500 px, the bottom from 640 to 615), the section faceted (a broad chamfer
 *     along the top outer edge);
 *   - under each pod, the large round cover on the body's flank whose lower half shows below it (photo 01: 0.46 m radius
 *     about 920/615 px).
 */
export const TYPE87_TURRET = Object.freeze({
  floorY: 0.02, roofY: 1.02, roofChamfer: 0.05,
  bodyHalfW: 0.70, rearZ: -1.85, rearChamfer: 0.10,
  // the nose: the roof's front edge, the bevel's foot, the upper plate's foot, the chin's foot and the underside's front
  noseRoofZ: 1.72, bevelZ: 1.86, bevelY: 0.94, faceZ: 1.95, faceY: 0.40, chinZ: 1.80, chinY: 0.17, bellyZ: 1.48,
  noseHalfW: 0.60, noseEdgeZ: 1.76,
  cheekInnerX: 0.66, cheekOuterX: 1.14, cheekTopY: 0.42, cheekRearZ: -0.10, cheekFrontZ: 1.10, cheekChamfer: 0.10,
  podInnerX: 0.69, podOuterX: 1.30, podRearZ: -1.40, podFrontZ: -0.55,
  // the pod's foot and top at its rear and front stations (the 7 degree rise; 0.61-0.66 m deep, 0.09 of the hull's
  // length in photo 01, its underside kept clear over the cheek's top so no pocket forms under it), then its front third
  // tapering, mostly from the underside, straight into the barrel's collar (round 3, photos 01, 04): the top falling
  // 0.14 m, the bottom rising 0.32 m and the sides closing to a 0.20 x 0.20 m face round the bore 0.11 m behind the
  // elevation axis
  podRearBottomY: 0.39, podRearTopY: 1.00, podFrontBottomY: 0.48, podFrontTopY: 1.14,
  noseTipZ: -0.11, noseTipHalfW: 0.10, noseTipHalfH: 0.10,
  // the trunnion drum on the body's flank, its lower half under the pod (photo 01: 0.46 m radius about 920/615 px), a
  // drum 0.06 m proud with a chamfered rim and a hub (a deeper one roofs a see-through pocket over the cheek)
  coverX: 0.72, coverR: 0.44, coverW: 0.06, coverY: 0.56, coverZ: -0.66,
});

/**
 * The guns' elevation axis (turret-local): at the tips of the pods' tapered noses, on the bores (photo 01: the barrels'
 * line meets the pods' fronts at 546 px, 0.90 m over the ring). The pods do not pitch; each barrel's collar turns just
 * ahead of its pod's nose, the barrel ahead of it.
 */
export const TYPE87_TRUNNION = Object.freeze([0, 0.90, 0.00] as const);

/**
 * The two 35 mm KDA (Oerlikon, Japan Steel Works licence; L/90, a 3.15 m barrel), gun-local: the bores either side
 * (photo 05: 0.94 m out, the pods' inner half) on the axis; the collar the pod's nose tapers into (photos 01, 04, 06),
 * the jacket, the barrel's rings, the
 * muzzle brake with its face flange (the bore mouth, muzzleZ) and the v0 measuring cage of three rods reaching past it to
 * its end ring (photo 01 at 4x: the brake 0.24 m, the cage 0.26 m). The cage's tip stands 3.50 m ahead of the axis:
 * photo 01 measures 3.39 m (the muzzles at 1,670/359 px), 3 % under what the published 7.99 m needs; 3.50 m makes 7.95 m
 * with the guns forward.
 */
export const TYPE87_GUNS = Object.freeze({
  boreX: 0.94, collarR: 0.08, collarRearZ: -0.04, collarFrontZ: 0.14,
  jacketR: 0.062, jacketFrontZ: 1.30, barrelR: 0.046, barrelTipR: 0.038,
  ringZs: [2.55, 2.80] as readonly number[],
  brakeRearZ: 3.00, brakeR: 0.066, flangeR: 0.074, muzzleZ: 3.24,
  cageRodR: 0.011, cageRodRadius: 0.064, endRingR: 0.075, endRingZ: 3.44, cageTipZ: 3.50,
});

/**
 * The radars (turret-local; photos 01, 02, 05-08):
 *   - the tracking radar behind the hatches on the centreline: a pedestal rising from between the rear boxes (photo 01:
 *     745-810 px) under a head 0.64 m across (photo 08), its covered dish 0.86 m across (photo 05: 200 px) centred 2.01 m
 *     over the ring (photo 05: 1.0 m over the roof) and 1.12 m behind it, facing forward and canted up 26 degrees (photo
 *     01: 135 px tall for 0.86); on the head's left the sensor box a third of the dish wide (photos 05, 08), on its right
 *     the large cylinder (0.26 m across, its round end outboard: photos 01, 02, 08);
 *   - the search radar raised on its boom at the very rear (photos 01, 02, 08): a heavy box-section boom from a hinge
 *     between the rear boxes, 0.48 x 0.40 m at its root narrowing to 0.36 x 0.28 m, leaning back 25 degrees (photo 01)
 *     to an elbow, a short upright to the turntable, and the antenna 0.06 m over the dish's rim (photos 03, 05, 06): 1.52 m
 *     across, 0.56 m deep and 0.33 m tall (round 3, photos 01, 02, 08), a flat back and top running into a curved front,
 *     its ends D-shaped, a feed box on its back, its top at the published 4.40 m raised height (photo 01: 235 px reads
 *     4.42 m).
 */
export const TYPE87_RADARS = Object.freeze({
  pedestalHalfW: 0.22, pedestalRearZ: -1.56, pedestalFrontZ: -1.26, headHalfW: 0.32, headBottomY: 1.52, headTopY: 2.06,
  headRearZ: -1.50, headFrontZ: -1.24,
  dishR: 0.43, dishY: 2.01, dishZ: -1.12, dishTiltDeg: 26,
  sensorW: 0.26, sensorH: 0.40, sensorD: 0.34, cylinderR: 0.13, cylinderL: 0.30,
  hingeY: 1.11, hingeZ: -1.80, elbowY: 2.22, elbowZ: -2.32, rootHalfW: 0.24, rootDepth: 0.40, armHalfW: 0.18,
  armDepth: 0.28,
  antennaBottomY: 2.46, antennaTopY: 2.79, antennaZ: -2.30, antennaHalfW: 0.76, antennaDepth: 0.56, antennaFlatDepth: 0.22,
});

/** The rear roof's two stowage boxes either side of the arm's hinge (photos 07, 09: 0.39 m wide, 0.36 m tall). */
export const TYPE87_REAR_BOXES = Object.freeze({ innerX: 0.25, outerX: 0.65, rearZ: -1.82, frontZ: -1.30, topY: 1.36 });
