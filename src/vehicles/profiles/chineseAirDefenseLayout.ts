// Release 268, the PLA's twin-cannon air defence (owner 2026-11-02, "we should add more double barrel vehicels"): the
// measured datums the PGZ-95 and PGZ-09 builds (profiles/chineseAirDefense.ts) and their combat specs
// (chineseAirDefenseSpecs.ts) share, so the turret ring, the trunnions, the fire axes and the launch exits are one set of
// numbers. Pure data (no three.js): the authority loads it with the specs.
//
// Frames: hull metres with the ground at y 0, +z forward and +x the vehicle's LEFT; turret-local with the ring plane at
// y 0; gun-local with the trunnion axis at the origin. Sources (docs/references/tanks/pgz95.md, pgz09.md):
// - PGZ-95: Wikipedia "Type 95 SPAAA" and Army Technology "PGZ95": 6.71 m long, 3.20 m wide, 3.40 m radar down and
//   4.82 m radar up, front engine with the driver front left and the commander behind him, the one-man turret on the
//   rear of the hull, six road wheels, three return rollers, the guns two a side, the QW-2 above them, the EO director
//   in an armoured box on the turret front, the CLC-1 search radar on the turret rear. Proportions not published (hull
//   height, wheel size, turret, gun layout) are read from the two Beijing museum photographs (Max Smith, 2007).
// - PGZ-09: the three 2017 Beijing exhibition photographs (Tyg728, CC BY-SA 4.0); photograph 02 is a square side view,
//   scaled by the published 3.40 m radar-down height (the folded search antenna's top): 4.8 mm a pixel at 1600 wide.
//   That scale gives a 7.06 m hull (the 0.74 m road wheels and 0.15 m track pitch agree with it), not the 6.7 m the
//   encyclopaedia pages repeat from the PGZ-95.

type P3 = readonly [number, number, number];

/** The over-under 25 mm pair of one PGZ-95 side and the QW-2 pair above it, gun-local (trunnion at the origin). */
export const PGZ95_GUNS = Object.freeze({
  /** pod centreline, each side */
  podX: 1.08,
  /** the over-under pair: upper and lower bores */
  boreY: Object.freeze([0.17, -0.17] as const),
  receiverRearZ: -0.29, receiverFrontZ: 0.63,
  jacketFrontZ: 0.95, brakeRearZ: 2.24,
  /** the flash hider's mouth: the fire anchor plane */
  muzzleZ: 2.43,
  barrelR: 0.026, jacketR: 0.040, brakeR: 0.038,
  /** QW-2 launch tubes, stacked over the pair, slightly outboard */
  tubeX: 1.11, tubeY: Object.freeze([0.41, 0.56] as const), tubeR: 0.046, tubeRearZ: 0.06, headRearZ: 1.40,
  /** the seeker caps' front faces: the launch exits */
  launchZ: 1.58,
});

/** PGZ-95: the hull (6.71 x 3.20 m), the running gear, the turret ring and the trunnion. */
export const PGZ95_LAYOUT = Object.freeze({
  rearZ: -3.355, noseZ: 3.355, bellyY: 0.40, tubHalf: 1.13,
  fenderY: 1.05, fenderHalf: 1.60, roofY: 1.62, roofHalf: 1.36,
  /** the flat roof's front edge, where the engine deck starts down to the nose plate */
  deckBreakZ: 1.20, deckFrontZ: 3.02, deckFrontY: 1.16, noseBottomY: 0.46, chinZ: 3.16,
  rearChinZ: -3.10, rearPlateBottomY: 0.62,
  /** ring at the hull roof, the turret on the rear half */
  turretPivot: Object.freeze([0, 1.62, -1.20] as const) as P3,
  /** turret-local trunnion: the pods' common elevation axis */
  gunPivot: Object.freeze([0, 0.62, 0.15] as const) as P3,
  gear: Object.freeze({
    wheelR: 0.31, wheelW: 0.20, wheelY: 0.37, xc: 1.38, trackW: 0.40, topY: 0.97,
    wheelZs: Object.freeze([2.22, 1.33, 0.44, -0.45, -1.34, -2.23] as const),
    sprocket: Object.freeze({ z: 2.95, y: 0.62, r: 0.26 }),
    idler: Object.freeze({ z: -2.98, y: 0.52, r: 0.25 }),
    rollerY: 0.82, rollerR: 0.075, rollerZs: Object.freeze([1.70, 0, -1.70] as const),
  }),
  /** turret-local body: base and roof outlines */
  turret: Object.freeze({ baseHalf: 0.84, roofHalf: 0.74, rearZ: -1.15, frontZ: 0.95, roofY: 0.92, roofFrontZ: 0.55,
    noseY: 0.40, sideX: 0.84 }),
  /** the CLC-1 search antenna raised as photographed, turret-local: centre, width, height, depth of the reflector */
  radar: Object.freeze({ x: 0, y: 2.30, z: -0.78, width: 1.40, height: 1.10, depth: 0.22, thick: 0.03, mastZ: -0.92 }),
});

/** The PGZ-09's PG99 35 mm guns, one a side in its armoured housing, gun-local. */
export const PGZ09_GUNS = Object.freeze({
  gunX: 1.25, housingInner: 1.06, housingOuter: 1.44,
  housingRearZ: -0.76, housingFrontZ: 0.47, housingTopY: 0.22, housingBottomY: -0.24, housingRearBottomY: -0.04,
  collarFrontZ: 0.66, brakeRearZ: 2.98,
  /** the velocity booster's mouth: the fire anchor plane */
  muzzleZ: 3.40,
  barrelR: 0.046, collarR: 0.085, brakeR: 0.072,
});

/** PGZ-09: the PLZ-05-class hull (7.06 x 3.20 m), the running gear, the turret ring and the trunnion. */
export const PGZ09_LAYOUT = Object.freeze({
  rearZ: -3.50, noseZ: 3.56, bellyY: 0.45, tubHalf: 1.05,
  fenderY: 1.22, fenderHalf: 1.60, roofY: 1.74,
  glacisZ: 2.65, glacisFrontZ: 3.47, glacisFrontY: 1.32, noseY: 0.95, chinZ: 3.18, chinY: 0.52,
  rearChinZ: -3.20, rearPlateBottomY: 0.72,
  turretPivot: Object.freeze([0, 1.74, -1.10] as const) as P3,
  gunPivot: Object.freeze([0, 0.84, -0.45] as const) as P3,
  gear: Object.freeze({
    wheelR: 0.37, wheelW: 0.26, wheelY: 0.45, xc: 1.34, trackW: 0.48, topY: 1.16,
    wheelZs: Object.freeze([2.19, 1.276, 0.362, -0.552, -1.466, -2.38] as const),
    sprocket: Object.freeze({ z: 2.95, y: 0.70, r: 0.29 }),
    idler: Object.freeze({ z: -3.34, y: 0.76, r: 0.33 }),
    rollerY: 0.99, rollerR: 0.09, rollerZs: Object.freeze([1.74, 0, -1.74] as const),
  }),
  /** turret-local: the lower band (base to beltY), the upper body to the roof, the front column under the EO head */
  turret: Object.freeze({ baseHalf: 0.92, bodyHalf: 1.00, roofHalf: 0.84, rearZ: -1.78, frontZ: 1.27, baseFrontZ: 1.55,
    beltY: 0.45, beltFrontZ: 1.80, shoulderY: 1.15, roofY: 1.30 }),
  /** the tracking radar's round antenna at the front, turret-local */
  trackingRadar: Object.freeze({ y: 0.77, z: 1.93, r: 0.29 }),
  /** the folded search antenna on its pedestal, turret-local: its top is the published 3.40 m */
  searchRadar: Object.freeze({ z: -0.62, width: 1.36, depth: 0.74, thick: 0.13, topY: 1.66 }),
});

/** Launch exits, gun frame (they pitch with the guns): two QW-2 a side on the PGZ-95. */
export const PGZ95_LAUNCHER_MUZZLES = Object.freeze([-1, 1].flatMap((side) => PGZ95_GUNS.tubeY.map((y) =>
  Object.freeze({ x: side * PGZ95_GUNS.tubeX, y, z: PGZ95_GUNS.launchZ }))));
