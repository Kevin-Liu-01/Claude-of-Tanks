// M163 VADS (release 269, builder V): the measured frame both the build (profiles/m163.ts) and the combat record
// (m163Specs.ts) read, so the drawn turret, Vulcan, column and radar and the spec's pivots, bore, plates, modules and crew
// never drift apart. Dependency-free data (the spec pack imports it at boot). Turret-local: the M741's roof plane y 0 at
// the race's centre (m741Datums.ts M741_RING, 1.95 m ahead of the stern), +z forward, +x the vehicle's LEFT. Sources and
// the photo reading behind each number: docs/references/tanks/m163_vads.md.
// First-party: Kevin B. Liu (NOTICE.md).

/**
 * The M157 mount's open turret (r4, the blind critics' reads checked against photos 01, 03, 04, 07, 08, 09): the raised
 * base on the M741's 1.40 m race, a frustum 0.22 m tall flaring slightly to its foot, its deck 0.25 m over the roof
 * (03, 08: a base ~0.25 m high; 09: its slotted side; the race's top, 0.04 m over the roof, is the hull's datum,
 * m741Datums.ts M741_RING.raceTopY, so the height is built here, the foot sitting 1 cm into the race); the gunner's
 * column, an open cylindrical tub at the ring's rear right quarter (07 from astern: the round body just right of centre;
 * 08, 09 from the left: behind the gun), so the ring's front and the gun's side open (01, 06); the box shield square to
 * the hull against the column's left side and running aft past it (08: one broad flared face from the left, its ends
 * leaning out; 07: its narrower end from astern), an open-topped box 1.0 m long and 0.5 m wide, its top 4 cm over the
 * column's rim and its foot 0.46 m under it (3.8 cm over the hull's beacon as it sweeps past); the upright slab at the
 * ring's right front between the gun and the radar's boom, the boom rooted on it (01, 03: a flat slab ~0.45 m long and
 * 4 cm thick from the deck to over the gun, its rear top corner cut off); a whip at each rear corner (03, 04: two whips
 * about 2.5 m tall rising from the turret's rear, one each side, raked aft).
 */
export const M163_TURRET = Object.freeze({
  /** the base: its foot's radius and height (the flare's end), its top's radius under the deck's edge, the deck */
  footR: 0.79, footY: 0.03, drumR: 0.745, deckY: 0.25,
  /** the column: its centre, outer radius, wall and rim (0.90 m across, 0.49 m over the deck) */
  column: Object.freeze({ x: -0.16, z: -0.44, r: 0.45, wall: 0.03, topY: 0.74 }),
  /** the box shield (turret-local, square to the hull): its flat inner face 3 cm into the column's left wall, its foot and
   * top, and at each its outer face's x and its front and rear ends' z (the outer face and both ends leaning out) */
  boxShield: Object.freeze({ innerX: 0.255, footY: 0.32, topY: 0.78,
    foot: Object.freeze({ outX: 0.72, z0: -0.36, z1: -1.12 }), top: Object.freeze({ outX: 0.80, z0: -0.27, z1: -1.25 }) }),
  /** the upright slab at the ring's right front that carries the radar's boom (r4: the r2/r3 "tall plate" at the column's
   * right was this part, drawn 0.15 m long and too far aft): its outer face's x, its thickness, its rear and front ends'
   * z, its top, and the cut off its rear top corner (back along the top, down the rear edge) */
  radarPlate: Object.freeze({ x: -0.58, t: 0.04, z0: -0.17, z1: 0.28, topY: 0.80, cutZ: 0.17, cutY: 0.20 }),
  /** the whips (FITTINGS.antennaWhip, its 0.12 m pot under a 2.40 m rod: 2.47 m from foot to tip, raked 12 degrees aft),
   * the left one on the box shield's top at its rear outer corner, the right one on a bracket off the column's rear right
   * wall (at a bearing from the column's centre, its foot's radius and height) */
  whip: Object.freeze({ h: 2.40, rakeAft: 0.21, left: Object.freeze({ x: 0.68, z: -1.14 }),
    right: Object.freeze({ bearingDeg: -150, r: 0.515, y: 0.66 }) }),
});

/** The elevation axis (turret-local): the Vulcan's trunnion on the left front at the rotor housing's rear third, 0.58 m
 * over the roof and 0.30 m ahead of the race's centre (photo 04, the left side at 20 degrees: the barrels' tips 1.95 m
 * ahead of the race's centre and 1.18 m over the roof, the feeder 0.41 m ahead and 0.72 m up). */
export const M163_TRUNNION = Object.freeze([0.32, 0.58, 0.30] as const);

/**
 * The M168 Vulcan (gun-local, +z along the bore from the elevation axis). The M61A1: 1.827 m long, six 1.52 m barrels
 * (en.wikipedia "M61 Vulcan"); the muzzle clamp 5.25 in (0.133 m) across (an M61A1 clamp, ima-usa.com); the barrels on a
 * 0.104 m circle inside it, 31 mm across at the muzzle and 37 mm at the breech. The rotor housing 0.236 m across holds
 * the barrels' breeches 0.10 m deep; the feeder rides its top inboard, fed through the inboard trunnion. The barrels'
 * tips 1.66 m out, 4 cm proud of the muzzle clamp; the housing's rear 0.22 m behind the trunnion and the drive's 0.27 m,
 * which clear the deck by 5 cm at full elevation.
 */
export const M163_GUN = Object.freeze({
  barrels: 6, pitchR: 0.052, barrelR: 0.0155, barrelRearR: 0.0185, barrelRearZ: 0.14, barrelTipZ: 1.66, boreR: 0.0101,
  boreDepth: 0.045,
  housingR: 0.118, housingFrontZ: 0.24, housingRearZ: -0.22, driveR: 0.075, driveRearZ: -0.27,
  /** the rotor's front support ring at the housing's mouth; the mid clamp 30 % along the barrels from their breeches and
   * the muzzle clamp 0.12 m back from their tips, so the tips stand proud (r2: photos 02, 08) */
  collarR: 0.084, collarZ: [0.21, 0.34] as const,
  midClampR: 0.066, midClampZ: [0.57, 0.63] as const,
  muzzleClampR: 0.0665, muzzleClampZ: [1.47, 1.54] as const,
  /** the clamps' spindle on the cluster's centre line, from the muzzle clamp to 5 mm short of the barrels' tips */
  hubR: 0.016,
  /** the two trunnion arms either side of the housing (turret-local x): the inboard one the feed's pedestal; their bosses */
  armInnerX: 0.115, armOuterX: 0.525, armT: 0.03, armInnerT: 0.05, bossR: 0.075,
  /** the cradle round the housing, elevating with it (r4: photos 03, 10, a heavy box with flat side plates): two side
   * plates 0.49 m long and 0.33 m tall at x +/-0.165 (2.75 cm inside the arms), their outline [z, y] (the rear foot cut
   * so the cradle clears the deck straight under the trunnion), joined by a floor under the housing and a front plate
   * under the rotor */
  cradle: Object.freeze({ x: 0.165, t: 0.025, floorY: -0.1875, floorZ0: -0.13,
    outline: Object.freeze([[0.25, -0.20], [0.25, 0.10], [0.12, 0.13], [-0.19, 0.13], [-0.24, 0.07], [-0.24, -0.05],
      [-0.13, -0.20]] as const) }),
  /** the cylinder under the housing pointing forward (r3: photos 03, 04): 0.09 m across (0.64 of the cluster's 0.14 m),
   * 0.50 m long (a third of the barrels' length), its nose ring */
  underR: 0.045, underY: -0.15, underZ: [-0.03, 0.47] as const,
  /** the round lamp on the mount's top (r2: photo 06), 0.15 m across */
  lampR: 0.075, lampX: 0.09, lampY: 0.235, lampZ: 0.15,
  /** the segmented linkless chute from the inboard trunnion's feed joint rising aft of the housing and arching 0.38 m over
   * the axis forward into the feeder on the housing's top (r3: photos 08, 10, a thick segmented chute 0.7 of the
   * cluster's 0.14 m, its arch 0.42 m fore and aft, its rear kept inside 0.38 m of the axis, clear of the column's front
   * as the gun elevates): 0.12 m across, a segment's rib every 4.5 cm standing 1.2 cm proud */
  chuteR: 0.06, chuteRibR: 0.072, chuteRibStep: 0.045,
});
/** The fire axis's mouth: the face of the clamps' spindle on the cluster's centre line, 5 mm behind the barrels' tips
 * (the fleet carves the axis's mouth there, tankFactoryCore.ts: a 12 mm opening through the spindle). */
export const M163_MUZZLE_Z = 1.655;
/** The spindle's opening the fleet carves at the mouth (tankFactoryCore.ts P.muzzleMouth). */
export const M163_MUZZLE_MOUTH = Object.freeze({ outerRadiusM: 0.013, innerRadiusM: 0.006 });

/** The gunner's seat in his column and his sight head on its post on the column's front rim, above the gun's breech and
 * inboard of its sweep (r2: photos 00/01, 06: a box 0.20 x 0.20 x 0.30 m, its top 1.1 m over the roof). The linkless
 * drum lives in the hull under the turret (m163Specs.ts). */
export const M163_GUNNER = Object.freeze({
  seat: Object.freeze({ x: -0.16, y: 0.50, z: -0.40 }),
  sight: Object.freeze({ x: 0.02, y: 1.00, z: -0.02, w: 0.20, h: 0.20, d: 0.30 }),
});

/**
 * The AN/VPS-2 range-only radar (turret-local, right rear; r3/r4, the critics' reads of photos 01, 03, 06, 07, 10): its
 * round housing 0.56 m across outboard of the ring's edge on a horizontal boom from the upright slab at the ring's right
 * front, its dome looking forward along the gun and its flat round back plate square across the turret's rear with a
 * stub aft (07: the round plate facing straight aft; 01, 06: a case at the housing's rear edge in side view; 10: the
 * round face forward; 03 at 45 degrees fits either), the two upright cases left and right on the back plate's edges,
 * 0.4 of the housing across and longer than it, reaching under it (r4: 01, 03). The housing's top stands 1.16 m over the
 * roof (the back plate's rim 1.17 m), 3.03 m overall: the published 2.90 m (115 in) sits 4 % under it, the photographs
 * over it (01: the housing ~0.6 m across, its top ~1.3 m up).
 */
export const M163_RADAR = Object.freeze({
  x: -0.90, y: 0.88, z: -0.56, r: 0.28,
  /** the back plate: its distance behind the housing's centre, its radius and thickness */
  backZ: 0.175, backR: 0.29, backT: 0.03,
  /** the cases either side of the back plate (r4: photos 01, 03, each 0.41 of the housing's diameter across and 1.1 of it
   * long, reaching under it): their radius, x from the housing's centre, z behind it, foot and top */
  caseR: 0.115, caseDx: 0.28, caseDz: 0.27, caseBottomY: 0.50, caseTopY: 1.12,
  armY: 0.56, yokeY: 0.585,
});
