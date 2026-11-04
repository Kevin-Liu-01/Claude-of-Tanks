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
 * skirt sloping out, the break a horizontal line 46 % of the way up (round 4: photo 01, the close side view, 45 %, the
 * louvred door filling the upper wall from just under the roof down to it; the photo-02 camera 51 %; from 57 %), the
 * skirt flaring 0.14 m from just
 * ahead of the guns' bearing discs to the front (behind it the wall runs straight down beside the discs, photo 01); the
 * guns' bearings on its flanks at the rear, the smoke dischargers on the skirt at the front, a low front block (the chin)
 * under the tracking radar's dark mount, its top 0.46 m up (photos 02, 04: the light block under the dark mount, its top
 * 0.69 m under the radome's centre on the radome's own scale); the commander right (-x), the gunner left (+x)
 * (pl.wikipedia). The roof stands 3.09 m over the ground.
 */
export const LOARA_TURRET = Object.freeze({
  floorY: 0.03, roofY: 1.28, roofChamfer: 0.06,
  halfW: 1.12, rearZ: -0.90, frontZ: 2.25, rearChamfer: 0.12, frontChamfer: 0.10,
  breakY: 0.60, skirtFlare: 0.14, skirtRearZ: 0.15, skirtFullZ: 0.35,
  chinHalfW: 0.62, chinTopY: 0.46, chinFrontZ: 2.80, chinChamfer: 0.10,
});

/** The elevation axis: the centre of the large bearing ring on each flank, turret-local, 0.27 m behind the ring (photo 01,
 * the close side view at 104 mm: the ring 0.81 m across, its centre 0.46-0.61 m ahead of the turret's rear edge by the
 * scale taken; the photo-02 camera: its lower edge 2.10-2.12 m up, 0.70 m over the turret's floor at the centre). */
export const LOARA_TRUNNION = Object.freeze([0, 0.70, -0.27] as const);

/** The two 35 mm KDA bores, gun-local (x either side of the turret, y over the elevation axis); index 0 on the right (-x).
 * Photo 02 through the fitted camera: the barrel leaves its pod 2.61-2.66 m up, half way down the pod's outer face. */
export const LOARA_BORE = Object.freeze({ x: 1.42, y: 0.16 });

/** The bore mouths, gun-local z: the muzzle brakes' faces, 3.10 m ahead of the hull origin with the guns forward (photos 02,
 * 04, 05: just ahead of the tracking radar's dish, inside the hull's length); 2.10 m of barrel out of the pod's nose, the
 * KDA's 3.15 m barrel (armedconflicts.com) running back into the pod. */
export const LOARA_MUZZLE_Z = 3.30;

/**
 * Each gun's armoured pod, gun-local (photos 01, 02, 04, 05), read on the photo-02 camera (its sound range: the pod lies
 * between the sprocket and the last road wheel): a square-cut rear half, 0.80 m long, with a hinged door on its outer
 * face and a broad bevel under it, and a long faceted front half tapering 0.72 m to the barrel's exit, 1.00 m ahead of
 * the hull origin (the barrel leaves the pod there, 2.61-2.64 m up). The outer face stands 0.54 m (0.42 m over the
 * axis to 0.12 m under it: the photograph's top and bottom edges at 2.93 and 2.37-2.42 m), the top rising inboard to a
 * ridge 0.56 m over the axis (the photo's dark upper facet, 3.10 m up, just under the roof's edge); the rear face 0.52 m
 * behind the hull origin (the photo's rear corner at -0.49 to -0.51 m), 0.31 m ahead of the turret's rear, so the dark
 * bearing ring shows behind the pod and under it (photo 02: the ring's lower edge 2.10-2.12 m up, 0.28 m under the
 * pod; photo 01, the gun raised: the ring's rear edge at the turret's rear corner). The judge's ratio read the pod's end
 * at 45 % of the turret's length; the camera puts the barrel's exit at 58 % and the square-cut half's end at 37 %, and
 * the camera is kept. Its tail stays inside 0.68 m of the axis, so it swings down beside the straight wall. Round 4: the
 * front half ends in a broad faceted face 0.35 x 0.30 m round the barrel's exit (photos 04, 05: the front narrows to
 * about half the pod's height and stays broad, not pointed); the rear kept where the camera puts it: photos 04 and 05,
 * through cameras fitted to the running gear and two roof points, put the pod's rear corner at hull z -0.52 to -0.58
 * and -0.64 to -0.72 (photo 02: -0.49 to -0.51), never at the turret's rear (-0.83).
 */
export const LOARA_GUN_HOUSING = Object.freeze({
  innerX: 1.175, outerX: 1.66, bottomY: -0.12, outerTopY: 0.42, topY: 0.56, rearZ: -0.32, shoulderZ: 0.48, noseZ: 1.20,
  noseX0: 1.25, noseX1: 1.60, noseY0: 0.00, noseY1: 0.30, discR: 0.40, discX: 1.16, discW: 0.04,
});

/** Each KDA's muzzle brake (photos 02, 04): a large perforated cylinder 0.40 m long and 0.176 m across (1.7 times the
 * barrel's tube), two rows of four rectangular ports round it; its face is the bore mouth (LOARA_MUZZLE_Z). */
export const LOARA_BRAKE = Object.freeze({ r: 0.088, length: 0.40 });

/**
 * The tracking radar's head (the Ericsson Eagle's round radome and the electro-optical drum, photos 02-05),
 * turret-local. The radome, 0.88 m across (0.7 of the turret's height, photos 04, 05: 0.65-0.76), its centre 0.20 m
 * under the roof line (photos 04, 05: 0.12-0.16 turret heights under it; the photo-02 camera: about 0.3 m; the critic:
 * level with it), its face level with the near muzzle brake's (photo 02, read ahead of the last road wheel where the
 * fit stretches lengths). Beside it on the right and behind its face, the large round camera drum (the Iris thermal and
 * KTVD-1 television cameras, the DL-1 rangefinder) across the turret, 0.52 m across (0.6 of the radome: photo 03 0.6-0.66,
 * photos 02, 04 0.45-0.5), its centre 0.08 m over the radome's, its lens forward beside the radome's rim, a two-tier box
 * perched on its crest to 0.38 m over the roof; a box on the radome's back. The radome and the drum stand on one dark
 * mount on the low front block (photos 02, 04: dark under the radome down to the block, from the block up under the drum,
 * and up behind the radome to its box), the head from the block to the sensors' top nearly the turret's height. Read on
 * the photo-02 camera against the radome (the fit's lengths ahead of z 2.03 m stretched 1.43 times, from the radome's and
 * the brakes' readings): the drum's centre 0.08-0.13 m over the radome's and 0.24-0.37 m behind its face, the boxes'
 * tops 0.54-0.56 m over the radome's centre, the mount's foot 0.56 m under it. The photo-02 camera puts the sensors 0.38 m
 * over the roof where the round-2 ratio from photos 04, 05 put them 0.50 m; the camera is kept. Round 4 (the judge on
 * photos 02, 03, 05: the drum 40-50 % over the roof line, about 10 % larger, standing on a neck): the drum 0.56 m across
 * (0.64 of the radome), its centre 0.15 m over the radome's (the camera's 0.08-0.13 range's top, plus 2 cm), 41 % of it
 * over the roof, on a narrow neck from the mount (photo 03); the sight a cylindrical head 0.20 m across at the drum's
 * upper front beside the radome's rim, the two boxes over it from the drum's crest to 0.42 m over the roof (photos 02,
 * 03).
 */
export const LOARA_TRACKING_RADAR = Object.freeze({
  y: 1.08, z: 2.60, r: 0.44, drumDepth: 0.20, domeDepth: 0.17,
  camX: -0.58, camY: 1.23, camZ: 2.30, camR: 0.28, camLength: 0.44, sightR: 0.10,
  mountTopY: 0.655, sensorTopY: 1.70,
});

/**
 * The 3D search radar on its mast over the roof (photos 02-05, deployed; pl.wikipedia: on a pylon at the rear),
 * turret-local: a stack of boxes (photo 02 through the fitted camera: a base, a lower column 0.46 m square, a ledge, the
 * middle box 0.58 m with a box on its right flank and ribs on its face, the upper housing; the stack 0.62-0.72 m across
 * at its widest, half the turret's height), wide to the top: the upper housing straight under the array and a broad
 * turntable box under its RADWAR housing (photo 02; no slim drive), and the flat array (the slotted face forward) 2.0 x
 * 0.95 m (photo 02: its ends 2.01 m apart) canted back 15 degrees, a deep housing half its width on its back carrying
 * the RADWAR plate (photos 04, 05). Round 4: its top 5.31 m over the ground (2.21 m over the roof), 0.17 m lower. The
 * near end of the array's top edge read three ways: the photo-02 camera 5.45-5.48 m (fitted to the running gear alone,
 * read 4.4 m over its highest point); photos 04 and 05 through cameras fitted to the running gear and two roof points
 * of the photo-02 build (the stowage tube's end, the panoramic sight's top; 2.3 and 2.1 px rms) 5.29-5.31 and 5.29-5.32
 * m. The two distant photos agree, and their readings sit 1.6-2.1 m over a fitted point, so the array follows them.
 */
export const LOARA_SEARCH_RADAR = Object.freeze({
  mastZ: -0.34, columnW: 0.46, stackW: 0.58, ledgeW: 0.64, housingTop: 1.13, stackY0: 0.43, stackY1: 0.86,
  arrayW: 2.00, arrayH: 0.95, arrayD: 0.10, tiltDeg: 15, arrayCentreY: 3.03, arrayZ: -0.24,
  housingW: 1.00, housingH: 0.50, housingD: 0.32,
});

/** The two blocks of six 81 mm smoke dischargers on the skirts (pl.wikipedia: 2 x 6; photos 01-05), turret-local: each a
 * deep mounting box 0.84 m along the skirt to the turret's front corner (photo 02 through the fitted camera: the box's
 * rear 1.45-1.49 m ahead of the ring, its front at the corner; the group with its tubes 29 % of the turret's length), two
 * rows of three tubes 0.30 m long and 0.11 m across (2.7 diameters) pointing out, up and ahead. */
export const LOARA_SMOKE = Object.freeze({ z0: 1.32, z1: 2.16, tubeR: 0.055, tubeLength: 0.30 });

/** The large louvred door on the left flank (photo 01, the close side view: its top 4 % under the roof, its height half
 * the turret's side, 0.58 of it across, over the smoke dischargers' rear end), turret-local. */
export const LOARA_LEFT_DOOR = Object.freeze({ z0: 1.17, z1: 1.55, y0: 0.615, y1: 1.235 });

/** The hull's side plate (the PT-91's steel screen) hung lower on the Loara (photos 04, 05: over the top 15-20 % of the
 * road wheels; buildPT91TwardyHull screenFootY): its foot 0.63 m up, 0.12 m over the wheels' tops (0.752 m). */
export const LOARA_SCREEN_FOOT_Y = 0.63;

/** The driver's seat, moved to the left (+x) of the T-72's middle (pl.wikipedia; armedconflicts.com: to the left as on the
 * T-55): his crew box, hatch and periscopes 0.45 m left of the hull's axis. */
export const LOARA_DRIVER_X = 0.45;
