// PZA Loara (release 269, builder P): the measured frame both the build (profiles/loara.ts) and the combat record
// (loaraSpecs.ts) read, so the drawn superstructure, turret, guns and radars and the spec's pivots, bores and plates never
// drift apart. Dependency-free data (the spec pack imports it at boot). Sources, photographs and the reading of each
// number: docs/references/tanks/pza_loara.md. The photo readings are through a camera fitted to photo 02 (its EXIF 42 mm
// equivalent focal length, the PT-91 hull's six road-wheel hubs, its sprocket and track contacts: 6.8 px rms), sound
// from the sprocket to the last road wheel and stretched ahead of it, where the readings are cross-checked on photos 04, 05.
// First-party: Kevin B. Liu (NOTICE.md).

/**
 * The raised hull (armedconflicts.com: "box-shaped superstructure on an elevated hull"; the Polish page: the turret "in the
 * middle of the raised hull"), hull frame (ground y 0, +z forward): one welded box over the PT-91's deck and fenders, its
 * roof 1.80 m over the ground (photo 02: its top edge 1.77-1.80 m over 4.4 m of its length, the side screens' top read at
 * 1.45 against the drawn 1.444), its flanks 5 cm inside the side screens, from over the hull's rear plate (the APU's
 * housing there in place of the T-72's stern drums) to 1.95 m ahead of the hull origin. There its middle's front plate falls
 * at 45 degrees onto the T-72's glacis between the two cheeks, the boxes over the fenders, which run on at full height to
 * 2.60 m and fall at 50 degrees to the fenders (photos 02, 04, 05: the side boxes reach well ahead of the glacis' top, the
 * hooded intake at the glacis' right corner beside the right cheek).
 */
export const LOARA_DECK = Object.freeze({
  topY: 1.80, halfW: 1.72, rearZ: -3.10, edgeZ: 1.95, frontSlopeDeg: 45, frontFootZ: 2.66, coreHalfW: 1.115, chamfer: 0.04,
  cheekInnerX: 1.11, cheekEdgeZ: 2.60, cheekSlopeDeg: 50, cheekFootZ: 3.07,
});

/** The turret ring on the raised deck: the T-72's ring station (z 0.0656) lifted onto the deck, 5 mm over its roof. */
export const LOARA_RING = Object.freeze([0, 1.805, 0.0656] as const);

/**
 * The welded box turret, turret-local (ring plane y 0, +z forward). A long body (the photo-02 camera, laying the drawn
 * turret over the photograph: its rear 0.83 m behind the hull origin, its front corner at the smoke dischargers' front,
 * its roof 3.09 m up, the drawn roof on the photo's roof line along its length): a vertical upper wall over a lower
 * skirt sloping out, the break a horizontal line 57 % of the way up (photos 01-03), the skirt flaring 0.14 m from just
 * ahead of the guns' bearing discs to the front (behind it the wall runs straight down beside the discs, photo 01); the
 * guns' bearings on its flanks at the rear, the smoke dischargers on the skirt at the front, a low chin under the tracking
 * radar; the commander right (-x), the gunner left (+x) (pl.wikipedia). The roof stands 3.09 m over the ground.
 */
export const LOARA_TURRET = Object.freeze({
  floorY: 0.03, roofY: 1.28, roofChamfer: 0.06,
  halfW: 1.12, rearZ: -0.90, frontZ: 2.25, rearChamfer: 0.12, frontChamfer: 0.10,
  breakY: 0.74, skirtFlare: 0.14, skirtRearZ: 0.15, skirtFullZ: 0.35,
  chinHalfW: 0.62, chinTopY: 0.66, chinFrontZ: 2.80, chinChamfer: 0.10,
});

/** The elevation axis: the centre of the large bearing disc on each flank, turret-local, 0.27 m behind the ring (photo 01,
 * the close side view at 104 mm: the disc's centre 0.61 m ahead of the turret's rear edge, about 60 % of the pod's length
 * behind its nose; the photo-02 camera: the pod's rear flush with the turret's at 0.83 m behind the hull origin). */
export const LOARA_TRUNNION = Object.freeze([0, 0.70, -0.27] as const);

/** The two 35 mm KDA bores, gun-local (x either side of the turret, y over the elevation axis); index 0 on the right (-x).
 * Photo 02 through the fitted camera: the barrel leaves its pod 2.66 m up, a third of the way down the pod's front. */
export const LOARA_BORE = Object.freeze({ x: 1.42, y: 0.16 });

/** The bore mouths, gun-local z: the muzzle brakes' faces, 3.10 m ahead of the hull origin with the guns forward (photos 02,
 * 04, 05: just ahead of the tracking radar's dish, inside the hull's length); 2.10 m of barrel out of the pod's nose, the
 * KDA's 3.15 m barrel (armedconflicts.com) running back into the pod. */
export const LOARA_MUZZLE_Z = 3.30;

/**
 * Each gun's armoured pod, gun-local (photos 01, 02, 04, 05): a tall box of angled faces, 0.76 m tall (0.6 of the
 * turret's wall), its top 0.24 m over the bore and its deep lower body (the gun's body and feed) 0.52 m under it; 1.82 m
 * long, its rear flush with the turret's rear corner over the bearing disc, its pointed front a third of the way down at
 * the barrel's exit, 1.00 m ahead of the hull origin (the photo-02 camera: the pod's rear and nose on the photograph's).
 * The lower body is narrower (its inner face 0.105 m further out), clear of the flaring skirt; the underside rises to
 * the rear face, all of the tail inside 0.72 m of the axis, so it swings down beside the body and keeps 0.11 m over the
 * deck at full elevation.
 */
export const LOARA_GUN_HOUSING = Object.freeze({
  innerX: 1.175, lowerInnerX: 1.28, outerX: 1.66, bottomY: -0.36, topY: 0.40, rearZ: -0.62, shoulderZ: 0.85, noseZ: 1.20,
  discR: 0.40, discX: 1.16, discW: 0.04,
});

/**
 * The tracking radar (the Ericsson Eagle's round radome, photos 02-05), turret-local: on a raised tracker head at the front
 * of the roof, the head and its sensor boxes standing 0.50 m (40 % of the turret's height) over the roof, a hump at the
 * turret's front; the radome 0.88 m across (0.7 of the turret's height, photos 04, 05: 0.65-0.76), its centre 0.20 m
 * under the roof line (photos 04, 05: 0.12-0.16 turret heights under it; the photo-02 camera: about 0.3 m; the critic:
 * level with it), its drum resting 2 cm into the low front block, on a neck from the head 0.25 m ahead of the
 * body's front face, over the low front block (photos 02, 04: the block under the dish, its top half the turret's
 * height up). The photo-02 camera puts the dish's face level with the near muzzle brake's (0.4 m ahead of the first
 * build's), read ahead of the last road wheel where the fit stretches lengths, so the dish moved 0.27 m.
 */
export const LOARA_TRACKING_RADAR = Object.freeze({
  y: 1.08, z: 2.60, r: 0.44, drumDepth: 0.20, domeDepth: 0.17,
  headX0: -0.62, headX1: 0.30, headZ0: 1.55, headZ1: 2.15, headTopY: 1.56, sensorTopY: 1.78,
});

/**
 * The 3D search radar on its mast over the roof (photos 02-05, deployed; pl.wikipedia: on a pylon at the rear),
 * turret-local: a square column 0.34 m on a side with the folding joint's housing, the azimuth drive, and the flat array
 * (the slotted face forward) 2.0 x 0.95 m (photo 02: its ends 2.01 m apart) canted back 15 degrees, a deep housing half
 * its width on its back carrying the RADWAR plate (photos 04, 05). Its top 2.38 m over the roof (5.47 m over the
 * ground), kept on the photo-02 camera: laid over the photograph, the drawn turret roof lies on the photo's roof line
 * along its whole length and the mast stands in the fit's sound range (0.27 m behind the hull origin), and there the
 * array's top reads 5.45-5.57 m; 0.30 m lower, the drawn array sat 0.28 m under the photograph's
 * (P/r2/blend02_r2_turret_lowered_radar.png). The distant photos 04 and 05 read 1.40-1.53 turret heights by ratio, which
 * leans on the turret height and on the mast standing 1.2 m deeper than the roof edge they are scaled on.
 */
export const LOARA_SEARCH_RADAR = Object.freeze({
  mastZ: -0.34, mastHalf: 0.17, mastH: 1.23, jointY0: 0.43, jointY1: 0.97,
  arrayW: 2.00, arrayH: 0.95, arrayD: 0.10, tiltDeg: 15, arrayCentreY: 3.20, arrayZ: -0.24,
  housingW: 1.00, housingH: 0.50, housingD: 0.32,
});

/** The driver's seat, moved to the left (+x) of the T-72's middle (pl.wikipedia; armedconflicts.com: to the left as on the
 * T-55): his crew box, hatch and periscopes 0.45 m left of the hull's axis. */
export const LOARA_DRIVER_X = 0.45;
