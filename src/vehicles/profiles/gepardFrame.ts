// Flakpanzer Gepard 1A2 (release 268, builder G): the measured frame both the build (profiles/gepard.ts) and the combat
// record (gepardSpecs.ts) read, so the drawn turret, guns and radars and the spec's pivots, bores and plates never drift
// apart. Dependency-free data (the spec pack imports it at boot). Sources and the photographs each number came from:
// docs/references/tanks/gepard_1a2.md.
// First-party: Kevin B. Liu (NOTICE.md).

/** The Leopard 1 hull's turret station (profiles/leopard1Hull.ts: 0.50 m ahead of the hull origin, the 1.58 m deck). */
export const GEPARD_RING = Object.freeze([0, 1.60, 0.50] as const);

/**
 * The welded turret, turret-local (ring plane y 0, +z forward). A narrow upper body carries the tracking radar on its
 * front and a gun on each flank; the full-width rear section closes the gun bays behind the guns and carries the search
 * radar; a low full-width cheek under each bay's front carries the smoke dischargers. Its floor stands 0.11 m over the
 * ring so the outer corners sweep the hull's lift eyes (their top 1.68 m) with 3 cm to spare. The bays' rear wall stands
 * 7.9 cm behind the farthest the guns' cover tails swing (0.621 m from the elevation axis, level with it at 33 degrees);
 * the cheeks' top stands 6 cm under the covers at full depression (fix round 1: 0.38 -> 0.33 with the guns lowered).
 */
export const GEPARD_TURRET = Object.freeze({
  floorY: 0.11, roofY: 1.08, roofChamfer: 0.05,
  bodyHalfW: 0.72, frontZ: 1.30, frontChamfer: 0.10,
  rearHalfW: 1.24, rearFrontZ: -1.10, rearZ: -1.86, rearChamfer: 0.12,
  cheekInnerX: 0.66, cheekOuterX: 1.22, cheekTopY: 0.33, cheekRearZ: 0.14, cheekFrontZ: 1.24, cheekChinZ: 1.12,
});

/** The elevation axis: the centre of the large bearing on each flank (turret-local), under the gun's cover. Fix round 1
 * (critic A4; photo 08 read through its perspective: the axis 0.54 m and the bores 0.71 m over the turret's floor line,
 * the covers' tops 0.13 m under the roof): the plant 6 cm lower than round 1's 0.66. */
export const GEPARD_TRUNNION = Object.freeze([0, 0.60, -0.40] as const);

/** The two 35 mm KDA bores, gun-local (x either side, y over the elevation axis); index 0 on the right (-x). */
export const GEPARD_BORE = Object.freeze({ x: 0.96, y: 0.15 });

/** The bore mouths, gun-local z: the muzzle brakes' faces inside the v0 measuring heads' prongs (photos 03, 04). */
export const GEPARD_MUZZLE_Z = 3.74;

/** The v0 heads' prong tips, gun-local z: the 3.15 m L/90 barrels with the heads are 3.71 m (de.wikipedia); 7.71 m
 * overall with the guns forward (published 7.68 and 7.76 m). */
export const GEPARD_PRONG_TIP_Z = 4.05;

/** Each gun's armoured cover, gun-local: its section about the elevation axis and its length either side of it. Its top
 * 0.14 m under the roof (photos 08, 12), the bearing disc showing under it. Fix round 2 (A/B critic P, photos 09, 12,
 * 14): an angular armoured box, flat sides, a broad chamfer along its top outer edge, a faceted nose (a shoulder, then a
 * front face 0.20 x 0.19 m round the bore). */
export const GEPARD_GUN_COVER = Object.freeze({
  innerX: 0.78, outerX: 1.24, bottomY: -0.12, topY: 0.34, rearZ: -0.52, bodyFrontZ: 0.55, shoulderZ: 0.82, noseZ: 1.06,
  bearingR: 0.34,
});

/**
 * The MPDR 12 search radar raised over the rear section (turret-local; fix round 1, both critics, photos 06, 08, 09; fix
 * round 2, both A/B critics: 2:1 wide, photo 06's raised reflector 300 x 140 px and photo 10's covered one 200 x 100 px):
 * a squat drum 0.60 m across and 0.55 m tall on the rear roof (photo 09), a short elbow from its turntable to the
 * reflector's back, and a doubly curved reflector 1.50 m wide, 0.75 m tall and 0.30 m deep (its back pillowed), canted
 * back 22 degrees, concave forward, its top at the published 4.22 m raised height and its lower edge 0.85 m over the roof;
 * the feed horn in front of its lower half on a swan-neck waveguide from the drum.
 */
export const GEPARD_SEARCH_RADAR = Object.freeze({
  drumZ: -1.48, drumR: 0.30, drumH: 0.55,
  halfW: 0.75, halfH: 0.375, depth: 0.30, shell: 0.04, tiltDeg: 22, vertexY: 2.16, vertexZ: -1.62, topY: 2.62,
});
