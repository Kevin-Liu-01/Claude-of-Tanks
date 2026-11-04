// Release 269: the K30 Biho's turret and guns, the measured datums the build (profiles/k30Biho.ts) and the combat spec
// (k30BihoSpecs.ts) share, so the ring, the trunnion, the fire axes and the turret's armour are one set of numbers. Pure
// data (no three.js). The hull is the K200 family's (k200HullLayout.ts K30_HULL).
//
// Frames: turret-local with the ring plane (the hull roof, 1.85 m) at y 0, +z forward, +x the vehicle's LEFT; gun-local
// with the trunnion axis at the origin. Sources (docs/references/tanks/k30_biho.md): photograph 07's side view at 4.07 mm
// a pixel (k200HullLayout.ts) gives every length and height; photographs 01 and 08 (front views) the widths, as ratios
// to the 1.32 m central body (photograph 01: 405 px wide by 215 px tall); photographs 02-05 the shapes.
// - the long, low turret on the rear half of the hull (fix round 1, the blind critic against photographs 02-08): the
//   central body running 0.81 m ahead of the gun housings' fronts (photograph 07: its nose block 0.6 m ahead of the left
//   housing; 04, 05: the nose with the EOTS head at its tip, 0.5-1.0 m ahead of the near gun root), its front deck under
//   the EOTS; the gun housings built into its flanks; behind them the rear body with a storage box overhanging each
//   flank, its underside sloping up toward the rear (04, 07), three smoke dischargers hung under its front (02, 04, 08);
//   the bodies coming down to 4 cm over the hull roof along the turret's length (05, 07); the roof 0.98 m over the ring
//   (photograph 07 reads 1.09 m over the front roof edge: the K200's roof stands 0.10 m higher at the rear, its published
//   1.83 m front and 1.93 m hull tops, so the turret's own height is about 1.0 m); the mesh baskets wrapping the rear
//   and both rear flanks out to 85 % of the hull's width (01, 02, 03, 06, 08); a tall whip at each rear corner (01, 05, 06);
// - the two KCB 30 mm in angular armoured housings that elevate with them (02: a housing tilted with its barrel), their
//   top front edges bevelled, their faces flat and bolted, two ports in each front face (02); the barrels 1.51 m apart
//   (photograph 01: 1.46 m), the bores 0.60 m over the ring, the muzzles 2.70 m ahead of the trunnion (07);
// - the TPS-830K antenna raised on its mast: 1.50 m by 0.54 m (photographs 01 and 08), the IFF box on its top the
//   published 4.05 m.

type P3 = readonly [number, number, number];

/** The ring at the hull roof, 1.20 m aft of the hull's middle (photograph 07: the turret body's middle). */
export const K30_TURRET_PIVOT = Object.freeze([0, 1.85, -1.20] as const) as P3;
/** The trunnion, turret-local: the housings' common pitch axis, 0.60 m over the ring (photograph 07's bore height,
 * 2.45 m over the ground) and 0.80 m ahead of it, the middle of the 1.14 m housings. */
export const K30_GUN_PIVOT = Object.freeze([0, 0.60, 0.80] as const) as P3;

/** The turret's bodies, turret-local. */
export const K30_TURRET = Object.freeze({
  /** the race collar on the ring, seated in the deck under the bodies */
  collar: Object.freeze({ r: 0.80, topY: 0.05 }),
  /** the central body: from the rear body's front face to its nose 0.81 m ahead of the housings, its front face, the
   * chamfer up to the deck carrying the EOTS head */
  front: Object.freeze({ halfX: 0.64, rearZ: 0.15, frontZ: 2.15, bottomY: 0.04, faceTopY: 0.62, deckY: 0.80,
    deckFrontZ: 2.05 }),
  /** the rear body between the storage boxes: its front face the step over the deck, its rear-bottom edge chamfered */
  rear: Object.freeze({ halfX: 0.70, roofHalf: 0.66, rearZ: -1.385, frontZ: 0.20, bottomY: 0.04, eaveY: 0.94, roofY: 0.98 }),
  /** the storage box on each flank, its front 3 cm behind the housings' sweep, its underside rising to the rear */
  boxes: Object.freeze({ inner: 0.68, outer: 0.98, frontZ: 0.23, rearZ: -1.385, topY: 0.98, eaveY: 0.94,
    frontBottomY: 0.22, rearBottomY: 0.56 }),
  /** the EOTS head at the nose's tip (photographs 01, 04, 05): TV, FLIR and the laser behind a window sloped up and back */
  eots: Object.freeze({ halfX: 0.21, rearZ: 1.70, frontZ: 2.18, baseY: 0.79, sillY: 0.86, topY: 1.04, browZ: 2.04 }),
  /** the TPS-830K search antenna raised on its mast at the rear of the roof */
  radar: Object.freeze({ mastZ: -1.02, columnTopY: 1.36, pedestalTopY: 1.52, turntableTopY: 1.56, faceZ: -0.86,
    width: 1.50, height: 0.54, sagitta: 0.16, thick: 0.04, centreY: 1.83, iffTopY: 2.20 }),
  /** the mesh basket round the rear: along both storage boxes' outer faces and across the rear face */
  basket: Object.freeze({ inner: 0.98, outer: 1.28, frontZ: -0.55, faceZ: -1.375, rearZ: -1.72, bottomY: 0.58, topY: 0.92 }),
  /** the whips on the storage boxes' rear corners, about twice the turret's height (photographs 01, 05, 06) */
  whip: Object.freeze({ x: 0.86, z: -1.28, h: 2.0 }),
});

/** The two KCB in their angular housings, gun-local. The housings' rear corners stay within housingReachR of the
 * trunnion so that from full depression (10 degrees) to full elevation (85 degrees) they swing clear of the hull roof
 * and the storage boxes behind them. */
export const K30_GUNS = Object.freeze({
  /** the bores, each side (photograph 01: 1.46 m apart; 1.51 m keeps the barrel collars 3 cm off the central body),
   * inboard of the housings' middle */
  gunX: 0.755,
  housingInner: 0.665, housingOuter: 0.95,
  /** the side profile (z, y): the bevelled top front edge, the front face, the bottom, the chamfered rear */
  housingProfile: Object.freeze([[0.36, 0.32], [0.54, 0.14], [0.54, -0.40], [-0.20, -0.42], [-0.50, -0.18], [-0.50, 0.20],
    [-0.36, 0.32]] as const),
  housingFrontZ: 0.54, housingTopY: 0.32, housingBottomY: -0.42, housingRearZ: -0.50, housingReachR: 0.54,
  /** the collar on the housing's front, the recoil spring ahead of it (photograph 07), the barrel's thick root */
  collarR: 0.085, collarFrontZ: 0.62, springR: 0.066, springFrontZ: 0.80, rootR: 0.056, rootFrontZ: 1.02,
  barrelR: 0.042, brakeR: 0.056, brakeRearZ: 2.45,
  /** the muzzle brake's mouth: the fire anchor plane */
  muzzleZ: 2.70,
});
