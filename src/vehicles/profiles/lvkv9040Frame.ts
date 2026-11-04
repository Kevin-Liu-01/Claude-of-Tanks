// Lvkv 9040 (release 269, builder S): the measured frame both the build (profiles/lvkv9040.ts) and the combat record
// (lvkv9040Specs.ts) read, so the drawn turret, gun and radar and the spec's pivots, bore, plates, modules and crew never
// drift apart. Dependency-free data (the spec pack imports it at boot). Turret-local: the CV90 hull's ring plane y 0
// (its deck stands 0.045 m over it out to 1.4 m from the axis), +z forward, +x the vehicle's LEFT. Sources and the photo
// reading behind each number: docs/references/tanks/lvkv9040.md.
// First-party: Kevin B. Liu (NOTICE.md).

/**
 * The welded turret body (photos 01-02, the right side; published: 2.5 m to the turret roof, 3.45 m over the radar,
 * weaponsystems.net), on the CV90 Mk IV's ring (the owner 2026-11-03), whose deck lies 1.3 cm under the ring plane round
 * the ring and 1.8 cm over it out to 1.95 m. A full-width low rear section (the bustle) and a taller front section whose
 * sloped front plate runs down to a foot over the driver's hatch; the gun works in a slot between the front section's two
 * cheeks, open to the roof for the high elevation. The floor stands 3.2 cm over the deck's highest fitting within the
 * turret's 1.85 m sweep, over the factory's 3 cm turret seat (turretSeatPlane.ts).
 */
export const LVKV_TURRET = Object.freeze({
  floorY: 0.05, bustleRoofY: 0.69, frontRoofY: 0.80, roofChamfer: 0.08,
  halfWBottom: 1.04, halfWTop: 0.98,
  rearZ: -1.32, rearChamfer: 0.12,
  /** the roof's 0.11 m rise from the rear section to the front section at the seam (photo 02, 35 % of the turret's length
   * from its rear) */
  stepZ0: -0.20, stepZ1: -0.02,
  /** the gun slot between the cheeks: its rear wall, its half-width and the chin under it */
  slotRearZ: 0.45, slotHalfW: 0.26, slotFloorY: 0.15, chinBreakZ: 1.40,
  /** the sloped front plate: from the roof's front edge down to the foot */
  roofFrontZ: 1.10, footZ: 1.70, footY: 0.12, footHalfW: 0.72, roofFrontHalfW: 0.84,
});

/** The elevation axis (turret-local): centred, 0.32 m under the front roof (photo 02's gun axis), 0.54 m behind the front
 * plate at its height. */
export const LVKV_TRUNNION = Object.freeze([0, 0.48, 0.78] as const);

/**
 * The 40 mm Bofors L/70 (gun-local, +z along the bore from the elevation axis). The mantlet drum about the elevation
 * axis fills the slot (3 cm from its walls, its rear wall and the chin at every pitch); the cradle's round cover (photo
 * 02: ~0.4 m across, 0.92 m out of the front plate), the ribbed jacket (0.37 m), the barrel and the flash eliminator; the
 * muzzle 3.40 m out, 0.8 m past the bow with the gun forward.
 */
export const LVKV_GUN = Object.freeze({
  mantletR: 0.30, mantletHalfW: 0.23,
  shroudR: 0.20, shroudRearZ: 0.20, shroudTaperZ: 1.10, shroudFrontZ: 1.48, shroudFrontR: 0.12,
  jacketRearZ: 1.43, jacketFrontZ: 1.73, jacketR: 0.085, ribR: 0.097,
  barrelRearZ: 1.30, barrelR: 0.057, barrelFrontR: 0.052, deviceRearZ: 3.16, deviceR: 0.074, deviceRearR: 0.066,
});

/** The bore mouth, gun-local z: the flash eliminator's face. */
export const LVKV_MUZZLE_Z = 3.40;

/**
 * The PS-95 search radar's drum on the bustle roof, rear left (photo 02: on the far side of the turret, behind the
 * sight heads; ~1.06 m across, ~1.0 m tall, raised ~0.3 m on its column, daylight under it; its top the published
 * 3.45 m overall).
 */
export const LVKV_RADAR = Object.freeze({
  x: 0.45, z: -0.70, r: 0.53, bottomY: 0.89, topY: 1.85, lipH: 0.06, columnR: 0.30,
});

/** The sight heads on the front section's roof either side of the slot (photo 02): the commander's on the right (-x),
 * the gunner's on the left (+x); [x, z] of each head's centre. */
export const LVKV_SIGHTS = Object.freeze({
  commander: Object.freeze({ x: -0.55, z: 0.22, w: 0.30, d: 0.40, h: 0.46 }),
  gunner: Object.freeze({ x: 0.56, z: 0.26, w: 0.30, d: 0.40, h: 0.38 }),
});
