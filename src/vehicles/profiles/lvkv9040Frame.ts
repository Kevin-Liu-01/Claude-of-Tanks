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
  slotRearZ: 0.45, slotHalfW: 0.26, slotFloorY: 0.15, chinBreakZ: 1.00,
  /** the sloped front plate, 35 degrees from vertical (photo 01; fix round 1, the blind critic: 42 was too laid back and
   * its foot ran 0.4 m too far along the gun): from the roof's front edge down to the foot */
  roofFrontZ: 0.82, footZ: 1.30, footY: 0.12, footHalfW: 0.72, roofFrontHalfW: 0.84,
});

/** The elevation axis (turret-local): centred, 0.32 m under the front roof (photo 02's gun axis), 0.26 m behind the front
 * plate at its height. */
export const LVKV_TRUNNION = Object.freeze([0, 0.48, 0.78] as const);

/**
 * The 40 mm Bofors L/70 (gun-local, +z along the bore from the elevation axis). The mantlet drum about the elevation
 * axis fills the slot (3 cm from its walls, its rear wall and the chin at every pitch); the cradle's cover one long cone
 * (photos 01-02; fix round 1, the blind critic: thickest at the turret face, about 0.4 of the drum's width, tapering
 * steadily into the ribs); the band of eight ribs as thick as the cone's front (fix round 2, the A/B judge: 0.40 m from
 * 0.15 m further back), the barrel and the short flared tip (round 2: no slotted brake); the muzzle 3.40 m out, 3.14 m
 * ahead of the front plate.
 */
export const LVKV_GUN = Object.freeze({
  mantletR: 0.30, mantletHalfW: 0.23,
  coneRearZ: 0.20, coneRearR: 0.21, coneFrontZ: 1.15, coneFrontR: 0.11,
  ribsRearZ: 1.11, ribsFrontZ: 1.55, ribsCoreR: 0.095, ribR: 0.11, ribCount: 8,
  barrelRearZ: 1.00, barrelR: 0.057, barrelFrontR: 0.052, tipRearZ: 3.25, tipR: 0.08, tipRearR: 0.06,
});

/** The bore mouth, gun-local z: the flash eliminator's face. */
export const LVKV_MUZZLE_Z = 3.40;

/**
 * The PS-95 search radar's drum on the bustle roof, rear left (photo 02: on the far side of the turret, behind the
 * sight heads; ~1.06 m across, ~1.0 m tall, its top's edge rounded; fix round 1, the blind critic: low on a dark base
 * nearly its own width, open between its posts).
 */
export const LVKV_RADAR = Object.freeze({
  x: 0.45, z: -0.70, r: 0.53, bottomY: 0.89, topY: 1.85, rimR: 0.05, baseR: 0.46, postR: 0.39,
});

/** The sight heads on the front section's roof either side of the slot (photos 01-02; fix round 1, the blind critic: the
 * commander's chunkier, its raked window under a lid jutting forward; the gunner's a flat hood plate over an open sight):
 * the commander's on the right (-x), the gunner's on the left (+x); [x, z] of each head's centre. */
export const LVKV_SIGHTS = Object.freeze({
  commander: Object.freeze({ x: -0.55, z: 0.22, w: 0.34, d: 0.42, h: 0.46 }),
  // (fix round 2, the A/B judge: its hood 0.11 m lower and 0.16 m further forward, just behind the gun's sight pod)
  gunner: Object.freeze({ x: 0.56, z: 0.42, w: 0.30, d: 0.40, h: 0.27 }),
});
