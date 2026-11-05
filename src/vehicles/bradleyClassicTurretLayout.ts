// Kevin B. Liu — the classic M2A2 Bradley turret's datums, shared by its builder (profiles/bradleyClassicTurret.ts), the
// M2A2's spec (m3a2BradleySpecs.ts; 269: the M2A2 carries this turret, the M3A2 the source turret) and its launcher mouths
// (fleetLauncherMuzzles.ts). Plain data: no builders, no geometry. The values are main's m2a2_bradley turret at 7cc204ab32, mirrored across x so the TOW pod stands on the
// turret's LEFT (+X) as on the real Bradley.

/** The gun pivot in the turret frame (7cc204ab32 m2a2_bradley gunPivot [−0.075, 0.375, 0.60], mirrored). */
export const CLASSIC_GUN_PIVOT = Object.freeze([0.075, 0.375, 0.60] as const);
/** The 25 mm muzzle (gun frame, the flash suppressor's mouth) and the spec's barrel, as 7cc204ab32 carried them. */
export const CLASSIC_MUZZLE_Z = 2.23;
export const CLASSIC_BARREL_LENGTH_M = 2.30;
export const CLASSIC_BARREL_RADIUS_M = 0.038;
/** The turret's armour envelope inputs (7cc204ab32 m2a2_bradley modernArmor: tw, tFrontZ, tRearZ, tH). */
export const CLASSIC_TURRET_ENVELOPE = Object.freeze({ tw: 0.82, tFrontZ: 0.98, tRearZ: -1.05, tH: 0.87 });
/** The TOW pod's cell centres in the gun frame as 7cc204ab32 hung it on the mount (mirrored): x, the two cell heights,
 *  the perforated front plate's z, and the collars' 4 cm proud. The pod is now turret-fixed at these plus the pivot. */
export const CLASSIC_TOW_CELLS = Object.freeze({ x: 0.97, ys: Object.freeze([0.04, -0.20] as const), plateZ: 0.19, proud: 0.04 });
/** The two TOW collar mouths, turret frame. */
export const CLASSIC_TOW_MOUTHS = Object.freeze(CLASSIC_TOW_CELLS.ys.map((y) => Object.freeze({
  x: CLASSIC_TOW_CELLS.x + CLASSIC_GUN_PIVOT[0],
  y: y + CLASSIC_GUN_PIVOT[1],
  z: CLASSIC_TOW_CELLS.plateZ + CLASSIC_TOW_CELLS.proud + CLASSIC_GUN_PIVOT[2],
})));
/** The 25 mm's depression stops by turret yaw over the shared hull (tools/gun-depression-sweep.mjs at 26 mm, 2026-11-02):
 *  from 149 deg of yaw the barrel passes over the hull's raised troop-compartment roof (2.24 m, z -3.0..-2.1) from the
 *  classic turret's 2.435 m axis; the full 9 deg everywhere ahead of that. No mount conflict at any yaw. */
export const CLASSIC_GUN_PITCH_BY_YAW_DEG = Object.freeze([
  [0, -9], [148, -9], [149, -6.7], [150, -5.8], [153, -4.9], [159, -3.4], [164, -3.3], [180, -3.6],
] as const);
