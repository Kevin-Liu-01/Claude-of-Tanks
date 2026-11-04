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
 * The welded box turret, turret-local (ring plane y 0, +z forward). A long body (photo 02: its rear 1.05-1.19 m behind the
 * hull origin, its front corner at the smoke dischargers' front, its roof 3.1-3.3 m up) carries the guns' bearings on its
 * flanks and the smoke dischargers low on its flanks at the front; a low chin under the tracking radar on its front face;
 * the commander right (-x), the gunner left (+x) (pl.wikipedia). The roof stands 3.09 m over the ground.
 */
export const LOARA_TURRET = Object.freeze({
  floorY: 0.03, roofY: 1.28, roofChamfer: 0.06,
  halfW: 1.12, rearZ: -1.10, frontZ: 2.25, rearChamfer: 0.12, frontChamfer: 0.10,
  chinHalfW: 0.70, chinTopY: 0.46, chinFrontZ: 2.55, chinChamfer: 0.10,
});

/** The elevation axis: the centre of the large bearing disc on each flank (photo 01: 61 % of the housing's length behind
 * its nose), turret-local, 2 cm behind the ring. */
export const LOARA_TRUNNION = Object.freeze([0, 0.70, -0.02] as const);

/** The two 35 mm KDA bores, gun-local (x either side of the turret, y over the elevation axis); index 0 on the right (-x).
 * Photo 02: the barrel leaves its housing 2.66 m up, the housing's middle. */
export const LOARA_BORE = Object.freeze({ x: 1.42, y: 0.16 });

/** The bore mouths, gun-local z: the muzzle brakes' faces, 3.10 m ahead of the hull origin with the guns forward (photos 02,
 * 04, 05: just ahead of the tracking radar's dish, inside the hull's length); the KDA's 3.15 m barrel (armedconflicts.com)
 * from its breech just behind the elevation axis. */
export const LOARA_MUZZLE_Z = 3.05;

/**
 * Each gun's armoured housing, gun-local: the faceted box over the KDA's receiver and barrel root (photos 01, 02, 04), from
 * 0.48 m behind the hull origin to the barrel's exit 1.00 m ahead of it (photo 02), 0.63 m tall about the bore, its top 10
 * cm under the roof, its inner face on the bearing disc 2 cm off the flank. Its tail swings down beside the body and keeps
 * 14 cm over the deck at full elevation.
 */
export const LOARA_GUN_HOUSING = Object.freeze({
  innerX: 1.175, outerX: 1.66, bottomY: -0.15, topY: 0.48, rearZ: -0.53, noseZ: 0.95, shoulderZ: 0.72,
  discR: 0.40, discX: 1.16, discW: 0.04,
});

/** The tracking radar (the Ericsson Eagle's round radome, photos 02-05: 0.76-0.80 m across, its centre 2.7 m up) on its
 * yoke on the body's front face over the chin, turret-local. */
export const LOARA_TRACKING_RADAR = Object.freeze({ y: 0.95, z: 2.55, r: 0.40, drumDepth: 0.20, domeDepth: 0.16 });

/**
 * The 3D search radar on its mast over the roof (photos 02-05, deployed; pl.wikipedia: on a pylon at the rear): a square
 * column 0.34 m on a side with the folding joint's housing, the azimuth drive, and the flat array (the slotted face
 * forward, the RADWAR electronics box on its back) 2.0 x 0.95 m (photo 02: its ends 2.01 m apart), canted back 15 degrees,
 * its top 5.5 m over the ground (photo 02: 5.57 m, read where the camera is least sure; photo 04's mast and array ratio). Turret-local; the mast stands over the guns' bearings (photo 02: 0.27 m behind the hull
 * origin).
 */
export const LOARA_SEARCH_RADAR = Object.freeze({
  mastZ: -0.34, mastHalf: 0.17, mastH: 1.23, jointY0: 0.43, jointY1: 0.97,
  arrayW: 2.00, arrayH: 0.95, arrayD: 0.10, tiltDeg: 15, arrayCentreY: 3.20, arrayZ: -0.24,
});
