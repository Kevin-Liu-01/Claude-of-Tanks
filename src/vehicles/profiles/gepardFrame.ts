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
 * 4.4 cm behind the farthest the guns' cover tails swing (0.656 m from the elevation axis, level with it at 38 degrees).
 */
export const GEPARD_TURRET = Object.freeze({
  floorY: 0.11, roofY: 1.08, roofChamfer: 0.05,
  bodyHalfW: 0.72, frontZ: 1.30, frontChamfer: 0.10,
  rearHalfW: 1.24, rearFrontZ: -1.10, rearZ: -1.86, rearChamfer: 0.12,
  cheekInnerX: 0.66, cheekOuterX: 1.22, cheekTopY: 0.38, cheekRearZ: 0.14, cheekFrontZ: 1.24, cheekChinZ: 1.12,
});

/** The elevation axis: the centre of the large bearing on each flank (turret-local), under the gun's cover. */
export const GEPARD_TRUNNION = Object.freeze([0, 0.66, -0.40] as const);

/** The two 35 mm KDA bores, gun-local (x either side, y over the elevation axis); index 0 on the right (-x). */
export const GEPARD_BORE = Object.freeze({ x: 0.96, y: 0.17 });

/** The bore mouths, gun-local z: the 3.15 m L/90 barrels with the v0 muzzle-velocity heads (3.71 m together). */
export const GEPARD_MUZZLE_Z = 4.05;

/** Each gun's armoured cover, gun-local: its section about the bore line and its length either side of the axis. */
export const GEPARD_GUN_COVER = Object.freeze({
  innerX: 0.78, outerX: 1.24, bottomY: -0.12, topY: 0.40, rearZ: -0.52, bodyFrontZ: 0.45, noseZ: 1.10,
  bearingR: 0.40,
});

/** The search radar raised on its arm over the rear section (turret-local): its reflector's top at the published 4.22 m. */
export const GEPARD_SEARCH_RADAR = Object.freeze({ z: -1.45, halfW: 0.68, bottomY: 2.00, topY: 2.62 });
