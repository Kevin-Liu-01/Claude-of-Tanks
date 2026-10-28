// Challenger 1 datums (release 262), from the published dimensions and the measured drawings in
// docs/references/tanks/challenger1_mk2.md. Vehicle frame: ground y = 0, hull nose z = +4.165, +x the vehicle's left.
/** The fictional FV4030/5 and FV4030/6 on the rebuilt hull (owner 2026-10-28: "use the weird turrets we invented to
 *  make new tanks like ... X variants"): 'x' carries the wide wedge turret and the applique kit, 'x_sleek' the sleek turret. The
 *  real Challenger 1 marks use the supplied-file build (challenger1X.ts). */
export type Challenger1Mark = 'x' | 'x_sleek';
type Point = readonly [number, number, number];

export const CR1_HISTORIC = Object.freeze({
  // hull 8.33, overall 11.55 (L11A5 forward), 3.52 over the skirts, 2.50 to the turret roof
  dims: Object.freeze({ hullLengthM: 8.33, overallLengthM: 11.555, widthM: 3.52, heightM: 2.50 }),
  structuralRoofY: 2.48,
  hull: Object.freeze({ innerHalfW: 1.04, sponsonHalfW: 1.70, skirtOuterX: 1.76, roofY: 1.58, engineDeckY: 1.68 }),
  // turret ring centre on the centre line 0.30 m ahead of mid-hull; the L11's trunnion 0.25 m inside the turret face
  turretPivot: [0, 1.58, .30] as Point,
  trunnion: [0, 1.99, 2.08] as Point,
  muzzleZ: 7.39,
  gear: Object.freeze({
    // 650 mm track on 2.77 m centres (3.42 m over the tracks); six ~0.80 m wheels on a 0.98 m pitch give the
    // published 4.9 m on the ground
    trackXc: 1.385, trackW: .65, wheelR: .42, wheelW: .36,
    wheelZs: Object.freeze([2.47, 1.49, .51, -.47, -1.45, -2.43]),
    idler: Object.freeze({ z: 3.66, y: .70, r: .27 }),
    sprocket: Object.freeze({ z: -3.30, y: .80, r: .30 }),
    // two return rollers a side, behind the skirts
    rollerZs: Object.freeze([1.00, -.96]), rollerY: .90, rollerR: .085,
    topY: 1.05,
  }),
});

/** The FV4030/5 applique cassettes outside the skirts, after the Op Granby fit (drawn, not yet charged as armour zones). */
export const CR1_GRANBY_APPLIQUE = Object.freeze({
  innerX: CR1_HISTORIC.hull.skirtOuterX, outerX: CR1_HISTORIC.hull.skirtOuterX + .24, low: .36, high: 1.44, rear: -2.58, front: 3.30,
});
/** Six box-section cassettes on a 0.77 m pitch with 6 cm joints, ahead of them the forward cassette over the idler. */
export const CR1_GRANBY_CASSETTES = 6, CR1_GRANBY_PITCH = .77, CR1_GRANBY_JOINT = .06;
/** The skirts: the armoured front section ([z, foot, top] stations, raked over the idler under the front guard) and the
 *  five thin rear panels, all hung from the 1.42 m track-guard ledge outside the 1.71 m track edge. */
export const CR1_SKIRT = Object.freeze({
  top: 1.42,
  front: Object.freeze([[1.56, .56, 1.42], [3.05, .56, 1.42], [3.40, .82, 1.33], [3.92, 1.02, 1.17]] as const),
  panels: 5, rear: -2.90, panelFront: 1.52, gap: .025, firstFoot: .62, foot: .58,
});
