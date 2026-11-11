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
// - the two KCB 30 mm in armoured housings built into the central body's flanks that elevate with them (02: a housing
//   tilted with its barrel), rounded on top, a recessed outer panel with two openings (02), the bore in the upper third
//   (04, 07), 1.26 m front to back (07: about 1.3 m), the feed openings in the recess under them (02); the barrels
//   1.51 m apart (photograph 01: 1.46 m), the bores 0.60 m over the ring, the muzzles 2.70 m ahead of the trunnion (07);
// - the TPS-830K antenna raised on its mast: 1.50 m by 0.54 m (photographs 01 and 08), the IFF box on its top the
//   published 4.05 m.

type P3 = readonly [number, number, number];

/** The ring at the hull roof, 0.90 m aft of the hull's middle (fix round 2, the blind judge against photographs 05 and
 * 07: the gun housings' fronts at 43 % of the hull's length from the bow, the radar mast at 74 %, the rear face at 82 %). */
export const K30_TURRET_PIVOT = Object.freeze([0, 1.85, -0.90] as const) as P3;
/** The trunnion, turret-local: the housings' common pitch axis, 0.60 m over the ring (photograph 07's bore height,
 * 2.45 m over the ground) and 0.80 m ahead of it, 0.50 m ahead of the housings' rear (their swing stays inside 0.54 m of
 * it behind and under the trunnion). */
export const K30_GUN_PIVOT = Object.freeze([0, 0.60, 0.80] as const) as P3;

/** The turret's bodies, turret-local. */
export const K30_TURRET = Object.freeze({
  /** the turret ring's radius (the hull's ring module) and the dark race collar drawn under the bodies */
  ringR: 0.80,
  collar: Object.freeze({ r: 0.68, topY: 0.05 }),
  /** the central body: from the rear body's front face to its nose 0.81 m ahead of the housings; its deck 0.15 m under
   * the housings' tops (photographs 04, 07), the chamfer from its front face up to the deck */
  front: Object.freeze({ halfX: 0.64, rearZ: 0.15, frontZ: 2.15, bottomY: 0.04, faceTopY: 0.50, deckY: 0.65,
    deckFrontZ: 2.05, cornerR: 0.18, lowerR: 0.15 }),
  /** the rear body between the storage boxes: its front face the step over the deck, its rear-bottom edge chamfered */
  rear: Object.freeze({ halfX: 0.70, roofHalf: 0.66, rearZ: -1.15, frontZ: 0.20, bottomY: 0.04, eaveY: 0.94, roofY: 0.98 }),
  /** the storage box on each flank, its front 4 cm behind the housings' sweep, its outer face's lower edge rising to
   * the rear, its underside sloping in to the rear body's foot */
  boxes: Object.freeze({ inner: 0.68, outer: 0.98, frontZ: 0.23, rearZ: -1.15, topY: 0.98, eaveY: 0.94,
    frontBottomY: 0.22, rearBottomY: 0.52, footY: 0.06 }),
  /** the EOTS housing at the nose's tip (photographs 01, 04, 05, 07): rising over the deck, its glass sloped at 45
   * degrees */
  eots: Object.freeze({ halfX: 0.25, rearZ: 1.62, frontZ: 2.18, baseY: 0.64, sillY: 0.74, topY: 1.02, browZ: 1.90 }),
  /** the gunner's sight head on its stand at the front of the roof, half the turret's height (photographs 02, 05) */
  sight: Object.freeze({ x: 0.30, z: 0.02, standR: 0.11, standTopY: 1.18, headR: 0.21, headTopY: 1.39 }),
  /** the TPS-830K search antenna raised on its mast at the rear of the roof (fix round 3, photographs 02, 03, 06: a pole
   * 0.13 m across for the lower half, a 0.25 m box just under the antenna, the support arms under it) */
  radar: Object.freeze({ mastZ: -0.60, poleR: 0.065, poleTopY: 1.40, boxTopY: 1.55, turntableTopY: 1.58, faceZ: -0.44,
    width: 1.50, height: 0.54, sagitta: 0.16, thick: 0.04, centreY: 1.83, iffTopY: 2.20 }),
  /** the commander's open roof position beside the mast (photographs 02, 03, 04): the open hatch ring, his seat raised
   * to the roof and its tall curved back */
  commander: Object.freeze({ x: -0.44, z: -0.22, ringR: 0.27, backR: 0.28, backTopY: 1.55, backHalfAngle: 0.85 }),
  /** the mesh basket round the rear (fix round 3, photographs 01, 02, 05, 06, 07): 65 % of the turret's height, its
   * sides 0.30 m out past the storage boxes, its back 0.30 m behind the rear face and across nearly its whole width */
  basket: Object.freeze({ boxFace: 0.98, outer: 1.28, inner: 0.45, frontZ: -0.50, rearZ: -1.45, bottomY: 0.30, topY: 0.94 }),
  /** two rows of three smoke dischargers low on each storage box's outer face toward the turret's rear corner, under the
   * basket's front end, fired forward and out (fix round 3, photographs 03, 04, 05, 08) */
  smoke: Object.freeze({ x: 1.07, ys: Object.freeze([0.36, 0.46] as const), zs: Object.freeze([-0.42, -0.33, -0.24] as const),
    yaw: 0.70, pitch: 0.30 }),
  /** the whips on the storage boxes' rear corners, about twice the turret's height, splayed outward in a V (photographs
   * 01, 05, 06) */
  whip: Object.freeze({ x: 0.86, z: -1.03, h: 2.0, splay: 0.30 }),
});

/** The two KCB in their housings, gun-local: built into the central body's flanks, rounded on top, a flat front round
 * the barrel's collar, the bore in the upper third (photographs 04, 07), 0.60 m tall (61 % of the turret's height). The
 * rear stays within housingReachR of the trunnion so that from full depression (10 degrees) to full elevation (85
 * degrees) the housings swing clear of the hull roof and the storage boxes behind them. */
export const K30_GUNS = Object.freeze({
  /** the bores, each side (photograph 01: 1.46 m apart; 1.51 m keeps the barrel collars 3 cm off the central body),
   * inboard of the housings' middle */
  gunX: 0.755,
  housingInner: 0.665, housingOuter: 0.95,
  /** 1.26 m front to back (fix round 3, photograph 07: about 1.3 m) */
  housingFrontZ: 0.76, housingTopY: 0.20, housingBottomY: -0.40, housingRearZ: -0.50, housingReachR: 0.54,
  /** the rounded top front edge and the rounded rear top */
  frontRound: 0.15, rearRound: 0.20,
  /** the collar on the housing's front, the recoil spring ahead of it (photograph 07), the barrel's thick root */
  collarR: 0.085, collarFrontZ: 0.84, springR: 0.066, springFrontZ: 1.00, rootR: 0.056, rootFrontZ: 1.20,
  barrelR: 0.042, brakeR: 0.056, brakeRearZ: 2.45,
  /** the muzzle brake's mouth: the fire anchor plane */
  muzzleZ: 2.70,
});
