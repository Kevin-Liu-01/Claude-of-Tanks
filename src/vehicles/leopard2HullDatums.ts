// The release-262 Leopard 2-pattern hull (profiles/leopard2Hull.ts draws it): the datums measured from the Christian II
// concept model's proportions (docs/references/tanks/christian2.md) and the combat envelope on them, shared by the
// Christian II and the early production Leopard 2s (2A2, 2A3, 2A3 OTCO) that ride it. Boot-light: plain data and the
// shared plate helpers, no geometry. Hull metres (+Z forward, y from the ground; the world's right of a +Z hull is -X).
import {
  frontPlate as fr, rearPlate as rr, rightSidePlate as sR, leftSidePlate as sL, roofPlate as rf,
  moduleBox as mbox, crewBox as cbox, type ArmorPlate, type CrewBox, type ModuleBox,
} from './specHelpers.ts';

export const LEOPARD2_HULL = Object.freeze({
  /** Deck line [z, y] from the engine deck's rear lip to the nose (the upper glacis falls from z 1.55). */
  deck: Object.freeze([[-3.80, 1.78], [-3.62, 1.80], [-2.80, 1.79], [-2.62, 1.72], [-2.00, 1.69], [-1.20, 1.64],
    [1.55, 1.63], [2.40, 1.494], [3.00, 1.404], [3.22, 1.33], [3.45, 1.25]] as const),
  /** Belly line [z, y]: the rear plate's foot, the flat belly, the lower glacis up to the nose. */
  belly: Object.freeze([[-3.80, 0.82], [-3.62, 0.62], [-3.40, 0.54], [2.45, 0.54], [2.80, 0.60], [3.20, 0.76],
    [3.45, 1.02]] as const),
  tubHalfWidthM: 1.0,
  sponsonHalfWidthM: 1.67,
  sponsonFloorY: 1.36,
  /** Seven road wheel stations (the mean of the model's staggered sides), radius, centre height; track centre and width. */
  wheelZs: Object.freeze([2.417, 1.592, 0.767, -0.058, -0.883, -1.708, -2.533] as const),
  wheelR: 0.348,
  wheelY: 0.425,
  trackXc: 1.359,
  trackW: 0.643,
  idler: Object.freeze({ z: 3.187, y: 0.895, r: 0.26 }),
  sprocket: Object.freeze({ z: -3.20, y: 0.895, r: 0.30 }),
  rollers: Object.freeze([2.035, 1.219, -0.311, -1.983] as const),
  rollerY: 1.088,
  rollerR: 0.11,
  /** The skirts hang from the sponson's floor, 0.46 m deep. */
  skirtTopY: 1.36,
  /** The turret ring's centre on the deck. */
  ring: Object.freeze([0, 1.64, 0.37] as const),
});

/** A hull's protection (RHAe mm): the glacis, the bolted fore skirt blocks (spaced), the thin aft panels. */
export interface Leopard2HullProtection {
  readonly glacis: { readonly ke: number; readonly ce: number; readonly phys: number };
  readonly lowerFront: { readonly ke: number; readonly ce: number };
  readonly side: number;
  readonly rear: number;
  readonly roof: number;
  readonly skirtFore: { readonly ke: number; readonly ce: number };
  readonly skirtAft: number;
}

/** The hull's plates, its modules and the driver (right front) on the drawn hull; `foreSkirtDropM` as the builder's. */
export function leopard2HullArmor(A: Leopard2HullProtection, foreSkirtDropM = 0): {
  hullPlates: ArmorPlate[];
  /** The power pack, the transmission and the fuel; the radio; the tracks (a vehicle orders its own list round them). */
  power: ModuleBox[]; radio: ModuleBox; tracks: ModuleBox[];
  driver: CrewBox;
} {
  const Hd = LEOPARD2_HULL, front = 3.45, rear = -3.80, deckMid = 1.64, hw = Hd.sponsonHalfWidthM, tw = Hd.tubHalfWidthM;
  const trackOut = Hd.trackXc + Hd.trackW / 2;
  return {
    hullPlates: [
      fr('upper_glacis', A.glacis.phys, hw * 0.96, 1.25, front, 1.63, 1.55, { keMm: A.glacis.ke, ceMm: A.glacis.ce }),
      fr('lower_front', 100, tw, 0.54, 2.45, 1.02, front, { keMm: A.lowerFront.ke, ceMm: A.lowerFront.ce }),
      sR('hull_side_upper_R', A.side, hw - 0.01, Hd.sponsonFloorY, hw - 0.01, deckMid, rear + 0.10, 3.20),
      sL('hull_side_upper_L', A.side, hw - 0.01, Hd.sponsonFloorY, hw - 0.01, deckMid, rear + 0.10, 3.20),
      sR('hull_side_lower_R', A.side, tw, 0.54, tw, Hd.sponsonFloorY, -3.40, 2.45),
      sL('hull_side_lower_L', A.side, tw, 0.54, tw, Hd.sponsonFloorY, -3.40, 2.45),
      sR('skirt_fore_R', A.skirtFore.ke, 1.818, Hd.skirtTopY - 0.46 - foreSkirtDropM, 1.818, Hd.skirtTopY, 1.42, 3.16, { kind: 'spaced', ceMm: A.skirtFore.ce }),
      sL('skirt_fore_L', A.skirtFore.ke, 1.818, Hd.skirtTopY - 0.46 - foreSkirtDropM, 1.818, Hd.skirtTopY, 1.42, 3.16, { kind: 'spaced', ceMm: A.skirtFore.ce }),
      sR('skirt_R', A.skirtAft, 1.72, Hd.skirtTopY - 0.46, 1.72, Hd.skirtTopY, -2.82, 1.40, { kind: 'spaced' }),
      sL('skirt_L', A.skirtAft, 1.72, Hd.skirtTopY - 0.46, 1.72, Hd.skirtTopY, -2.82, 1.40, { kind: 'spaced' }),
      sR('track_R', 20, trackOut, 0.08, trackOut, 1.30, -3.55, 3.45, { kind: 'external', moduleLink: 'trackR' }),
      sL('track_L', 20, trackOut, 0.08, trackOut, 1.30, -3.55, 3.45, { kind: 'external', moduleLink: 'trackL' }),
      rr('hull_rear', A.rear, hw * 0.96, 0.82, rear, 1.78, rear),
      rf('hull_roof', A.roof, hw * 0.96, 1.66, rear, 1.55),
    ],
    power: [
      mbox('engine', [-tw, 0.56, -3.70], [tw, 1.72, -2.10]),
      mbox('transmission', [-tw * 0.95, 0.60, -3.70], [tw * 0.95, 1.30, -3.20]),
      mbox('fuelTank', [tw * 0.45, 0.56, -2.05], [tw, 1.20, -0.95]),
    ],
    radio: mbox('radio', [-tw * 0.85, 0.90, -1.90], [-tw * 0.30, 1.40, -1.10]),
    tracks: [
      mbox('trackL', [-hw - 0.15, 0.0, -3.55], [-tw, 1.30, 3.45]),
      mbox('trackR', [tw, 0.0, -3.55], [hw + 0.15, 1.30, 3.45]),
    ],
    driver: cbox('driver', [-0.85, 0.62, 1.70], [-0.20, 1.40, 2.55]),
  };
}
