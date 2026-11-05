// M163 VADS (release 269, builder V): the measured frame both the build (profiles/m163.ts) and the combat record
// (m163Specs.ts) read, so the drawn turret, Vulcan, column and radar and the spec's pivots, bore, plates, modules and crew
// never drift apart. Dependency-free data (the spec pack imports it at boot). Turret-local: the M741's roof plane y 0 at
// the race's centre (m741Datums.ts M741_RING, 1.95 m ahead of the stern), +z forward, +x the vehicle's LEFT. Sources and
// the photo reading behind each number: docs/references/tanks/m163_vads.md.
// First-party: Kevin B. Liu (NOTICE.md).

/**
 * The M157 mount's open turret (r2, the blind critic's read checked against photos 04, 07, 08, 09): a low ring on the
 * M741's 1.40 m race (0.20 m: photo 09's slotted ring); the gunner's column, an open cylindrical tub at the ring's rear
 * right quarter (photo 07 from astern: the round body just right of centre; 08, 09 from the left: behind the gun), so the
 * ring's front and the gun's side stand open (01, 06); a flat-sided box shield on the column's left-rear face, its ends
 * leaning out (07, 08, 09: the tray with its top level with the column's rim and above it); a tall narrow plate at the
 * column's right that carries the radar's arm (00/03, 06). The race's top stands 0.04 m over the roof; the ring's foot
 * sits 1 cm into it.
 */
export const M163_TURRET = Object.freeze({
  drumR: 0.745, footR: 0.73, footY: 0.03, deckY: 0.20,
  /** the column: its centre, outer radius, wall and rim (0.90 m across, 0.54 m over the ring) */
  column: Object.freeze({ x: -0.16, z: -0.44, r: 0.45, wall: 0.03, topY: 0.74 }),
  /** the box shield on the column's face at a bearing from its centre (degrees from +z towards +x): its foot and top,
   * its half-widths there (the ends leaning out 15 degrees) and its depth out from the column */
  boxShield: Object.freeze({ bearingDeg: 135, footY: 0.40, topY: 0.80, footHalfW: 0.26, topHalfW: 0.36, footDepth: 0.28,
    topDepth: 0.34 }),
  /** the tall plate at the column's right that carries the radar's arm: x, its z span, its foot and top, its thickness */
  radarPlate: Object.freeze({ x: -0.66, z0: -0.22, z1: -0.07, topY: 0.89, t: 0.035 }),
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
  /** the cylinder under the housing pointing forward (r2: photos 00/01, 04): 0.08 m across, 40 % of the barrels' length */
  underR: 0.038, underY: -0.145, underZ: [-0.04, 0.62] as const,
  /** the round lamp on the mount's top (r2: photo 06), 0.15 m across */
  lampR: 0.075, lampX: 0.07, lampY: 0.235, lampZ: 0.15,
  /** the ribbed linkless chute from the inboard trunnion's feed joint arching 0.2 m over the housing into the feeder
   * (r2: photos 08, 10), 0.11 m across */
  chuteR: 0.055,
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
 * The AN/VPS-2 range-only radar (turret-local, right rear; r2, the critic's read of photos 01, 06, 07): its round housing
 * 0.56 m across outboard of the ring's edge on a horizontal arm from the tall plate, its flat face looking out to the
 * right front (03), and the two upright cases seated fore and aft on it. Its top and the cases' stand 1.16 m over the roof, 3.02 m overall: the published 2.90 m
 * (115 in) sits 4 % under it, the photographs over it (01: the housing ~0.6 m across, its top ~1.3 m up).
 */
export const M163_RADAR = Object.freeze({
  x: -0.90, y: 0.88, z: -0.56, r: 0.28, dishR: 0.17, dishBearingDeg: -60,
  caseR: 0.065, caseDz: 0.335, caseBottomY: 0.60, caseTopY: 1.16,
  armY: 0.56, yokeY: 0.585,
});
