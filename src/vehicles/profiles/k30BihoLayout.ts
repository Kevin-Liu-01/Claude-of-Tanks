// Release 269: the K30 Biho's turret and guns, the measured datums the build (profiles/k30Biho.ts) and the combat spec
// (k30BihoSpecs.ts) share, so the ring, the trunnion, the fire axes and the turret's armour are one set of numbers. Pure
// data (no three.js). The hull is the K200 family's (k200HullLayout.ts K30_HULL).
//
// Frames: turret-local with the ring plane (the hull roof, 1.85 m) at y 0, +z forward, +x the vehicle's LEFT; gun-local
// with the trunnion axis at the origin. Sources (docs/references/tanks/k30_biho.md): photograph 07's side view at 4.07 mm
// a pixel (k200HullLayout.ts) gives every length and height; photographs 01 and 08 (front views) the widths, as ratios
// to the 1.32 m central body (photograph 01: 405 px wide by 215 px tall); photographs 02-05 the shapes.
// - the long, narrow turret on the rear half of the hull: the central front body between the two gun housings, its
//   front deck carrying the EOTS head; behind it the taller rear body (the turret roof 1.09 m over the ring, 2.94 m over
//   the ground), its flanks bulging out over a set-in base to the housings' width, the search radar's mast on its roof
//   and the stowage basket on its rear face;
// - the two KCB 30 mm in armoured housings that elevate with them on the central body's flanks (photograph 02 shows a
//   housing tilted with its barrel), the barrels 1.51 m apart (photograph 01: 1.46 m), the bores 0.60 m over the ring, the
//   muzzles 2.70 m ahead of the trunnion (photograph 07: 3.50 m ahead of the ring, 0.92 m short of the bow);
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
  /** the race collar under everything, small enough that the housings' lowest swing passes outside it */
  base: Object.freeze({ r: 0.78, topY: 0.14 }),
  /** the central front body between the housings: its front face, the chamfer up to the deck carrying the EOTS */
  front: Object.freeze({ halfX: 0.64, rearZ: 0.15, frontZ: 1.50, bottomY: 0.14, faceTopY: 0.70, deckY: 0.86,
    deckFrontZ: 1.40 }),
  /** the rear body: a set-in base, the flanks bulging out from the waist to the shoulder (photograph 07's sloping lower
   * panel), the roof edge chamfered; its front face (the step over the front deck) 5 cm behind the housings' sweep */
  rear: Object.freeze({ lowHalf: 0.70, upHalf: 0.95, roofHalf: 0.89, rearZ: -1.385, frontZ: 0.20, bottomY: 0.12,
    waistY: 0.38, shoulderY: 0.74, eaveY: 1.03, roofY: 1.09 }),
  /** the EOTS head on the front deck (photographs 01, 04): TV, FLIR and the laser behind a window sloped up and back */
  eots: Object.freeze({ halfX: 0.21, rearZ: 1.10, frontZ: 1.56, baseY: 0.85, sillY: 0.92, topY: 1.12, browZ: 1.40 }),
  /** the TPS-830K search antenna raised on its mast at the rear of the roof */
  radar: Object.freeze({ mastZ: -1.02, columnTopY: 1.36, pedestalTopY: 1.52, turntableTopY: 1.56, faceZ: -0.86,
    width: 1.50, height: 0.54, sagitta: 0.16, thick: 0.04, centreY: 1.83, iffTopY: 2.20 }),
  /** the stowage basket hung on the rear face */
  basket: Object.freeze({ half: 0.90, frontZ: -1.375, rearZ: -1.93, bottomY: 0.30, topY: 0.98 }),
});

/** The two KCB in their housings, gun-local. The housings' rear is an arc about the trunnion so that at full elevation
 * (85 degrees) and full depression (10 degrees) they swing clear of the turret's base and the hull roof. */
export const K30_GUNS = Object.freeze({
  /** the bores, each side (photograph 01: 1.46 m apart; 1.51 m keeps the barrel collars 3 cm off the central body),
   * inboard of the housings' middle */
  gunX: 0.755,
  housingInner: 0.665, housingOuter: 0.95,
  housingFrontZ: 0.54, housingTopY: 0.40, housingBottomY: -0.40, housingArcR: 0.55,
  /** the collar on the housing's front, the recoil spring ahead of it (photograph 07), the barrel's thick root */
  collarR: 0.085, collarFrontZ: 0.62, springR: 0.066, springFrontZ: 0.80, rootR: 0.056, rootFrontZ: 1.02,
  barrelR: 0.042, brakeR: 0.056, brakeRearZ: 2.45,
  /** the muzzle brake's mouth: the fire anchor plane */
  muzzleZ: 2.70,
});
