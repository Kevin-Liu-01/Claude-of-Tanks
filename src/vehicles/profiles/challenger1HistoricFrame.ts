// Challenger 1 datums (release 262), from the published dimensions and the measured drawings in
// docs/references/tanks/challenger1_mk2.md. Vehicle frame: ground y = 0, hull nose z = +4.165, +x the vehicle's left.
export type Challenger1Mark = 'mk2' | 'mk3';
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
    trackXc: 1.385, trackW: .65, wheelR: .40, wheelW: .36,
    wheelZs: Object.freeze([2.47, 1.49, .51, -.47, -1.45, -2.43]),
    idler: Object.freeze({ z: 3.66, y: .70, r: .27 }),
    sprocket: Object.freeze({ z: -3.30, y: .80, r: .30 }),
    // two return rollers a side, behind the skirts
    rollerZs: Object.freeze([1.00, -.96]), rollerY: .90, rollerR: .085,
    topY: 1.05,
  }),
});

/** Op Granby applique cassettes outside the skirts (the Mk 3; its armour zones read them: sourceXWesternAuxArmor.ts). */
export const CR1_GRANBY_APPLIQUE = Object.freeze({
  innerX: CR1_HISTORIC.hull.skirtOuterX, outerX: CR1_HISTORIC.hull.skirtOuterX + .16, low: .50, high: 1.55, rear: -2.58, front: 3.30,
});
