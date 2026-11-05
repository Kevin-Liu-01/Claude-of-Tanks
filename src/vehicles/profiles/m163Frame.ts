// M163 VADS (release 269, builder V): the measured frame both the build (profiles/m163.ts) and the combat record
// (m163Specs.ts) read, so the drawn turret, Vulcan, drum and radar and the spec's pivots, bore, plates, modules and crew
// never drift apart. Dependency-free data (the spec pack imports it at boot). Turret-local: the M741's roof plane y 0 at
// the race's centre (m741Datums.ts M741_RING, 1.95 m ahead of the stern), +z forward, +x the vehicle's LEFT. Sources and
// the photo reading behind each number: docs/references/tanks/m163_vads.md.
// First-party: Kevin B. Liu (NOTICE.md).

/**
 * The M157 mount's open turret (photos 03, 04, 07, 08): a low drum on the M741's 1.40 m race, its deck 0.25 m over the
 * roof; the Vulcan on the left front, its linkless drum on the left rear behind it, the gunner on his seat in the middle
 * with his sight before him, the AN/VPS-2 on the right rear (Military Periscope: "VPS-2 radar on the right"; photo 07 from
 * astern, photo 04 from the left where the gunner hides it), a tall curved shield round the left rear (photos 04, 07, 08)
 * and a lower one round the right front. The race's top stands 0.04 m over the roof; the drum's foot sits 1 cm into it.
 */
export const M163_TURRET = Object.freeze({
  drumR: 0.745, footR: 0.73, footY: 0.03, deckY: 0.25,
  /** the shields' outer radius, their plate, the left one's bearings (degrees from +z towards +x) and top, the right's */
  shieldR: 0.785, shieldT: 0.025,
  leftShield: Object.freeze({ fromDeg: 75, toDeg: 165, topY: 0.80 }),
  rightShield: Object.freeze({ fromDeg: -75, toDeg: -15, topY: 0.66 }),
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
  /** the rotor's front support ring at the housing's mouth, the mid clamp and the muzzle clamp (photos 02, 04, 08) */
  collarR: 0.084, collarZ: [0.21, 0.34] as const,
  midClampR: 0.066, midClampZ: [0.88, 0.94] as const,
  muzzleClampR: 0.0665, muzzleClampZ: [1.54, 1.62] as const,
  /** the clamp's hub on the cluster's centre line, standing 3.5 cm proud of its face to 5 mm short of the barrels' tips */
  hubR: 0.024,
  /** the two trunnion arms either side of the housing (turret-local x), their boss radius */
  armInnerX: 0.115, armOuterX: 0.525, armT: 0.03, bossR: 0.075,
});
/** The fire axis's mouth: the face of the muzzle clamp's hub on the cluster's centre line, 5 mm behind the barrels'
 * tips (the fleet carves the axis's mouth there, tankFactoryCore.ts: a 16 mm opening through the hub). */
export const M163_MUZZLE_Z = 1.655;
/** The hub's opening the fleet carves at the mouth (tankFactoryCore.ts P.muzzleMouth). */
export const M163_MUZZLE_MOUTH = Object.freeze({ outerRadiusM: 0.020, innerRadiusM: 0.008 });

/** The linkless drum on the turret's left rear (turret-local; photo 07: the round body behind the gun, its top level with
 * the left shield's), clear of the housing's drive at every pitch; the rest of the drum hangs in the basket. */
export const M163_AMMO_DRUM = Object.freeze({ x: 0.30, z: -0.38, r: 0.20, topY: 0.74 });

/** The gunner's seat and his sight (turret-local; photos 01, 03, 10). */
export const M163_GUNNER = Object.freeze({
  seat: Object.freeze({ x: -0.08, y: 0.52, z: -0.12 }),
  sight: Object.freeze({ x: -0.10, y: 0.84, z: 0.14, w: 0.16, h: 0.16, d: 0.20 }),
});

/**
 * The AN/VPS-2 range-only radar (turret-local, right rear): its round housing 0.44 m across on a yoke and post, its dish
 * face forward, and the two upright cases either side of it (photos 01, 03, 06; photo 07's dish ~0.45 m). Its cases'
 * tops give the published 2.90 m height (en.wikipedia: 115 in).
 */
export const M163_RADAR = Object.freeze({
  x: -0.50, y: 0.80, z: -0.48, r: 0.22, dishR: 0.205,
  caseR: 0.065, caseDx: 0.28, caseBottomY: 0.50, caseTopY: 1.04,
  postR: 0.05, yokeY: 0.55,
});
