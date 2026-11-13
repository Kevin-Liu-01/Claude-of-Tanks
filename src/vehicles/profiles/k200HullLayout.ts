// Release 269: the K200 family's hull (the Korean Infantry Fighting Vehicle, Doosan), measured once for every vehicle on
// it: the K200A1 itself (five road wheels, 5.49 m) and the K30 Biho's stretched chassis (one station more, 6.43 m). The
// K242 mortar carrier and the K263 Vulcan share the K200A1's numbers. Pure data (no three.js): the specs (k30BihoSpecs.ts)
// read the armour envelope from here and profiles/k200Hull.ts draws the same numbers.
//
// Frames: hull metres with the ground at y 0, +z forward, +x the vehicle's LEFT, z 0 halfway between the bow and the rear
// plate. Sources (docs/references/tanks/k30_biho.md):
// - published K200/K200A1 figures (Janes via Weapon Systems, Army Guide, Wikipedia "K200 KIFV"): 5.49 m long, 2.85 m wide,
//   the hull top 1.93 m, ground clearance 0.41 m, the 381 mm track, five dual rubber-tyred road wheels of 610 mm a side
//   on torsion bars, no return rollers, the drive sprocket at the front and the idler at the rear, the power pack front
//   right beside the driver, the trim vane on the bow, the hydraulic rear ramp with a door in its left half; welded
//   aluminium with spaced steel bolted on the front and the flanks (proof against 12.7 mm AP);
// - the K30 Biho side photograph (photos/k30/07, Spc. J. Rumedon, public domain), a square telephoto side view scaled by
//   the track's 152 mm pitch (37.4 px, autocorrelated over the lower run): 4.07 mm a pixel. It gives the 1.85 m roof, the
//   0.63 m road wheels, the 1.12 m long glacis at 23 degrees down to the nose at 1.40 m, the lower plate raked 31 degrees
//   back to the belly, the rubber skirt from the sponson's underside (1.16 m) to 0.835 m, and every station below; the
//   published 4.05 m (radar raised) agrees with it. The hull it measures (bow to rear plate) is 6.43 m: the published
//   K30 length is 6.77 m (the packet records the conflict). Less one 0.94 m station bay it is the K200A1's 5.49 m.
import { frontPlate, leftSidePlate, moduleBox, crewBox, rearPlate, rightSidePlate, roofPlate, type ArmorPlate,
  type CrewBox, type ModuleBox } from '../specHelpers.ts';

/** The K200A1's stations, as distances behind the bow tip (the trim vane's face), 5.49 m long. */
const K200A1 = Object.freeze({
  lengthM: 5.49,
  wheelD: Object.freeze([1.351, 2.039, 2.784, 3.541, 4.322] as const),
  sprocketD: 0.602,
  idlerD: 5.051,
});

/** The K30 Biho's stretch (photograph 07): a 0.94 m bay with one more road wheel, behind the second station. */
const K30_BAY = Object.freeze({ afterD: 2.40, lengthM: 0.94, wheelD: 2.946 });

/** Every section the hull and its armour share; heights and half-widths are the same at either length. */
const SECTION = Object.freeze({
  roofY: 1.85,
  /** the upper body's (sponson's) vertical sides: 2.96 m, the skirts' outer faces 3.00 m (the published K30 width) */
  sideX: 1.48, skirtOuterX: 1.50, skirtInnerX: 1.475,
  sponsonY: 1.16, skirtBottomY: 0.835,
  /** the tub between the tracks */
  tubX: 1.00, bellyY: 0.41,
  /** the glacis: 1.12 m long from the roof's front edge down to the nose at 1.40 m (23 degrees) */
  glacisBreakD: 1.12, noseD: 0.045, noseY: 1.40,
  /** the lower plate raked 31 degrees from the vertical, back to the belly */
  lowerRake: 0.61,
  /** the rear plate (the ramp) down to its hinge line, the belly's rear edge 0.12 m ahead of it */
  rearPlateBottomY: 0.55, rearChinD: 0.12,
  /** the side plates under the sponson at the bow and the stern, down past the sprocket's and the idler's tops */
  frontCheekBottomY: 0.86, rearCheekBottomY: 0.88,
  /** where the rubber skirt runs (photograph 07: 0.61 m behind the bow to 0.45 m short of the rear plate) */
  skirtFrontD: 0.61, skirtRearInsetD: 0.45,
});

export interface K200Gear {
  readonly wheelR: number;
  readonly wheelW: number;
  readonly wheelY: number;
  readonly xc: number;
  readonly trackW: number;
  readonly topY: number;
  readonly wheelZs: readonly number[];
  readonly sprocket: { readonly z: number; readonly y: number; readonly r: number };
  readonly idler: { readonly z: number; readonly y: number; readonly r: number };
}

export interface K200HullLayout {
  readonly roadWheels: 5 | 6;
  readonly lengthM: number;
  /** the bow tip (the trim vane's face) and the rear plate */
  readonly bowZ: number;
  readonly rearZ: number;
  readonly roofY: number;
  readonly sideX: number;
  readonly skirtOuterX: number;
  readonly skirtInnerX: number;
  readonly sponsonY: number;
  readonly skirtBottomY: number;
  readonly tubX: number;
  readonly bellyY: number;
  /** the roof's front edge (top of the glacis), the nose edge (glacis over the lower plate), the chin (lower plate over
   * the belly) */
  readonly glacisBreakZ: number;
  readonly noseZ: number;
  readonly noseY: number;
  readonly chinZ: number;
  readonly rearPlateBottomY: number;
  readonly rearChinZ: number;
  readonly frontCheekBottomY: number;
  readonly rearCheekBottomY: number;
  readonly skirtFrontZ: number;
  readonly skirtRearZ: number;
  readonly gear: K200Gear;
  /** hull z of a station measured on the K200A1 (behind its bow tip): the stretch moves the stations behind the bay */
  readonly at: (d: number) => number;
  /** the glacis's height at hull z (between the nose and the roof's front edge) */
  readonly glacisY: (z: number) => number;
  /** the lower plate's z at height y (between the belly and the nose) */
  readonly lowerZ: (y: number) => number;
}

/**
 * The K200-family hull at its K200A1 length (five road wheels) or the K30 Biho's (six): the stretch inserts one station
 * bay behind the second road wheel and moves the rest of the hull back with it.
 */
export function k200HullLayout(roadWheels: 5 | 6): K200HullLayout {
  const S = SECTION;
  const bay = roadWheels === 6 ? K30_BAY.lengthM : 0;
  const lengthM = +(K200A1.lengthM + bay).toFixed(3);
  const half = lengthM / 2;
  const stretched = (d: number): number => d + (d >= K30_BAY.afterD ? bay : 0);
  const at = (d: number): number => +(half - stretched(d)).toFixed(4);
  // the inserted station is measured on the stretched hull (photograph 07), the others on the K200A1's
  const wheelZs = roadWheels === 6
    ? [...K200A1.wheelD.filter((d) => d < K30_BAY.afterD).map(at), +(half - K30_BAY.wheelD).toFixed(4),
      ...K200A1.wheelD.filter((d) => d >= K30_BAY.afterD).map(at)]
    : K200A1.wheelD.map(at);
  const noseZ = at(S.noseD), glacisBreakZ = at(S.glacisBreakD);
  const glacisSlope = (S.roofY - S.noseY) / (noseZ - glacisBreakZ);
  const glacisY = (z: number): number => S.roofY - (z - glacisBreakZ) * glacisSlope;
  const lowerZ = (y: number): number => noseZ - (S.noseY - y) * S.lowerRake;
  return Object.freeze({
    roadWheels, lengthM, bowZ: half, rearZ: -half,
    roofY: S.roofY, sideX: S.sideX, skirtOuterX: S.skirtOuterX, skirtInnerX: S.skirtInnerX,
    sponsonY: S.sponsonY, skirtBottomY: S.skirtBottomY, tubX: S.tubX, bellyY: S.bellyY,
    glacisBreakZ, noseZ, noseY: S.noseY, chinZ: +lowerZ(S.bellyY).toFixed(4),
    rearPlateBottomY: S.rearPlateBottomY, rearChinZ: -half + S.rearChinD,
    frontCheekBottomY: S.frontCheekBottomY, rearCheekBottomY: S.rearCheekBottomY,
    skirtFrontZ: at(S.skirtFrontD), skirtRearZ: -half + S.skirtRearInsetD,
    gear: Object.freeze({
      // the 610 mm dual road wheels (photograph 07: 0.63 m over the tyres), the 381 mm track, its lane flush under the
      // sponson's edge with 5 cm to the skirt
      wheelR: 0.31, wheelW: 0.30, wheelY: 0.35, xc: 1.26, trackW: 0.38, topY: 0.93,
      wheelZs: Object.freeze(wheelZs),
      sprocket: Object.freeze({ z: at(K200A1.sprocketD), y: 0.67, r: 0.27 }),
      idler: Object.freeze({ z: at(K200A1.idlerD), y: 0.60, r: 0.25 }),
    }),
    at, glacisY, lowerZ,
  });
}

/** The K30 Biho's stretched hull (six road wheels). */
export const K30_HULL = k200HullLayout(6);

type Armour = readonly [physical: number, ke: number, ce: number];

/** The hull's protection: the K200A1's aluminium with the spaced steel, proof against 12.7 mm AP on the front and the
 * flanks, credited as the fleet credits the ROK Army's other light hull (the BMP-3 (ROK)'s balanced values). */
const HULL_ARMOUR = Object.freeze({
  glacis: [33, 70, 70] as Armour, lower: [26, 56, 56] as Armour, side: [17, 36, 36] as Armour,
  rear: [16, 32, 32] as Armour, roof: [6, 12, 12] as Armour,
});

const armour = ([, ke, ce]: Armour) => ({ keMm: ke, ceMm: ce });

/** The hull's armour plates (the same names the fleet's light hulls carry). */
export function k200HullPlates(L: K200HullLayout): ArmorPlate[] {
  const A = HULL_ARMOUR, G = L.gear;
  const trackOut = G.xc + G.trackW / 2;
  const side = (name: string, xB: number, yB: number, xT: number, yT: number, zR: number, zF: number): ArmorPlate[] => [
    rightSidePlate(`${name}_R`, A.side[0], xB, yB, xT, yT, zR, zF, armour(A.side)),
    leftSidePlate(`${name}_L`, A.side[0], xB, yB, xT, yT, zR, zF, armour(A.side)),
  ];
  return [
    frontPlate('upper_glacis', A.glacis[0], L.sideX, L.noseY, L.noseZ, L.roofY, L.glacisBreakZ, armour(A.glacis)),
    frontPlate('lower_front', A.lower[0], L.tubX, L.bellyY, L.chinZ, L.noseY, L.noseZ, armour(A.lower)),
    ...side('hull_side_upper', L.sideX, L.sponsonY, L.sideX, L.roofY, L.rearZ, L.noseZ),
    ...side('hull_side_lower', L.tubX, L.bellyY, L.tubX, L.sponsonY, L.rearChinZ, L.chinZ),
    rightSidePlate('track_R', 20, trackOut, 0.10, trackOut, G.topY, L.rearZ + 0.20, L.bowZ - 0.30,
      { kind: 'external', moduleLink: 'trackR' }),
    leftSidePlate('track_L', 20, trackOut, 0.10, trackOut, G.topY, L.rearZ + 0.20, L.bowZ - 0.30,
      { kind: 'external', moduleLink: 'trackL' }),
    rearPlate('hull_rear', A.rear[0], L.sideX, L.rearPlateBottomY, L.rearZ, L.roofY, L.rearZ, armour(A.rear)),
    roofPlate('hull_roof', A.roof[0], L.sideX, L.roofY, L.rearZ, L.glacisBreakZ, armour(A.roof)),
  ];
}

/**
 * The hull's modules: the power pack front right beside the driver (the D2840L in the K30), the transmission across the
 * bow driving the front sprockets, the fuel aft, the turret ring at `ringZ` (radius `ringR`) and the two track runs.
 */
export function k200HullModules(L: K200HullLayout, ringZ: number, ringR: number): ModuleBox[] {
  const G = L.gear, inner = G.xc - G.trackW / 2 - 0.02, outer = G.xc + G.trackW / 2 + 0.02;
  const front = L.chinZ - 0.05;
  return [
    moduleBox('engine', [-L.tubX + 0.04, L.bellyY + 0.06, front - 1.45], [-0.10, L.roofY - 0.22, front - 0.36]),
    moduleBox('transmission', [-L.tubX + 0.06, L.bellyY + 0.05, front - 0.34], [L.tubX - 0.06, L.bellyY + 0.58, front]),
    moduleBox('fuelTank', [-L.tubX + 0.06, L.bellyY + 0.05, L.rearZ + 0.14], [L.tubX - 0.06, L.bellyY + 0.62, L.rearZ + 0.74]),
    moduleBox('turretRing', [-ringR, L.roofY - 0.16, ringZ - ringR], [ringR, L.roofY + 0.04, ringZ + ringR]),
    moduleBox('trackL', [-outer, 0, L.rearZ + 0.20], [-inner, G.topY + 0.06, L.bowZ - 0.30]),
    moduleBox('trackR', [inner, 0, L.rearZ + 0.20], [outer, G.topY + 0.06, L.bowZ - 0.30]),
  ];
}

/** The driver, front left (+x) beside the power pack, under his hatch. */
export function k200Driver(L: K200HullLayout): CrewBox {
  const front = L.chinZ - 0.40;
  return crewBox('driver', [0.08, L.bellyY + 0.12, front - 1.05], [L.tubX - 0.04, L.roofY - 0.06, front]);
}
