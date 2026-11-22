// The Olifant TTD's own construction datums and armour envelope (ttd-275; Kevin, 2026-11-21: "make the ttd its own tank
// instead of being based off of the leopard 2"; docs/references/tanks/ttd.md). The numbers are the TTD's as D. Bocquelet's
// side elevation draws it, scaled on tanks-encyclopedia's 7.78 m hull (77.8 px/m: 9.40 m over the gun, 0.70 m road wheels
// at 0.83 m), the widths from the parade and head-on photographs against TE's 3.62 m. profiles/ttd.ts draws them;
// southAfricaSpecs.ts seats the protection record on them. Hull metres: ground y 0, +Z forward, the hull's middle z 0;
// a +Z hull's right is -X (the commander and gunner sit at -X, the loader at +X).
// First-party procedural geometry and data: Kevin B. Liu (NOTICE.md).
import {
  plate, frontPlate as fr, rearPlate as rr, rightSidePlate as sR, leftSidePlate as sL, roofPlate as rf,
  moduleBox as mbox, crewBox as cbox, type ArmorEnvelope, type ArmorPlate,
} from './specHelpers.ts';

/** The hull: the deck line, the belly line, the nose, the raked stern, the sponsons and the skirts. */
export const TTD_HULL = Object.freeze({
  /** Deck line [z, y] stern to nose (the elevation: the raised engine deck on its ramp, the flat deck under the turret, the
   * long shallow upper glacis to the nose's top edge, the steep nose plate to its lip). */
  deck: Object.freeze([[-3.89, 1.90], [-3.72, 1.92], [-1.94, 1.92], [-1.80, 1.80], [-0.60, 1.78], [2.02, 1.76],
    [3.55, 1.56], [3.90, 1.10]] as const),
  /** Belly line [z, y]: the raked rear plate's foot, the lower rear plate, the flat belly, the lower glacis to the lip. */
  belly: Object.freeze([[-3.56, 0.80], [-3.30, 0.54], [3.30, 0.54], [3.90, 1.02]] as const),
  /** The stern: the raked rear plate's top edge (z -3.89) over its foot (z -3.56, y 0.80), 17 degrees from upright. */
  sternTopZ: -3.89, sternTopFootY: 1.84, rakeFootZ: -3.56, rakeFootY: 0.80,
  noseZ: 3.90, lipY: 1.02, noseTopZ: 3.55,
  /** The nose plate between the corner boxes stands this far behind the boxes' faces. */
  noseRecessM: 0.04,
  tubHalfWidthM: 1.02,
  sponsonFloorY: 1.12,
  /** The upper side leans in from the fender ledge to the deck's edge. */
  sponsonLedgeX: 1.70, sponsonDeckX: 1.60,
  /** The armoured corner boxes over the front fenders: inner edge, their tops' rise over the glacis, their rear edge. */
  boxInnerX: 1.02, boxRiseM: 0.07, boxRearZ: 2.90,
  /** The fender ledge the skirts hang from, the skirts' faces and hem (the elevation: 1.38 m and 0.77 m). */
  ledgeY: 1.40, skirtInX: 1.72, skirtOutX: 1.81, skirtLowY: 0.77,
  /** The skirts' panel joints (four panels a side) and the front panel's hem rising to the nose. */
  skirtJointZs: Object.freeze([1.70, -0.15, -2.00] as const), skirtHemRiseZ: 3.25,
  /** Seven dual road wheels at 0.83 m pitch, the raised front idler, the rear sprocket, four return rollers. */
  wheelZs: Object.freeze([2.58, 1.75, 0.92, 0.09, -0.74, -1.57, -2.40] as const),
  wheelR: 0.35, wheelY: 0.425, wheelW: 0.40,
  trackXc: 1.36, trackW: 0.635,
  idler: Object.freeze({ z: 3.42, y: 0.80, r: 0.27 }),
  sprocket: Object.freeze({ z: -3.28, y: 0.72, r: 0.31 }),
  rollers: Object.freeze([2.16, 0.50, -1.16, -2.82] as const), rollerY: 0.93, rollerR: 0.10,
  /** The turret ring's centre on the deck. */
  ring: Object.freeze([0, 1.78, 0.45] as const),
});

/** Linear interpolation along a [z, y] polyline sorted by z. */
export function ttdLineY(line: readonly (readonly [number, number])[], z: number): number {
  if (z <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    const [z1, y1] = line[i];
    if (z <= z1) {
      const [z0, y0] = line[i - 1];
      return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
    }
  }
  return line[line.length - 1][1];
}

/** The turret, ring frame (metres from the ring's centre on the deck): a long slab-sided box, its five-block front. */
export const TTD_TURRET = Object.freeze({
  /** Half-width of the slab sides (2.74 m across), the roof, the floor under the front. */
  halfWidthM: 1.37, roofY: 0.75, floorY: 0.02,
  /** The face (hull z 2.02) and the broad chamfer along the roof's front edge. */
  faceZ: 1.57, chamferBackM: 0.16, chamferDownM: 0.12,
  /** The front's blocks: the outer cheeks from the inner blocks' edge out, the inner blocks (their faces set back), the
   * mantlet's slot between them. */
  innerBlockX: 0.52, slotHalfWidthM: 0.18, innerRecessM: 0.04, slotBackZ: 1.20,
  /** The plan's corner cuts at the face and the bustle. */
  frontCornerM: 0.08, rearCornerM: 0.15,
  /** The bustle: the floor rising behind the ring (hull 1.94 m) and again to the rear (hull 2.03 m); the rear plate leans
   * back to the roof. */
  bustleStepZ: [-0.95, -1.35] as const, bustleFloorY: 0.16, bustleRearRiseZ: -2.25, rearFloorY: 0.25,
  rearRoofZ: -2.90, rearFootZ: -2.83,
  /** The 105 mm GT3's trunnion, the muzzle 4.02 m ahead of it (hull z 5.52: 9.41 m over the gun, TE's figure). */
  trunnion: Object.freeze([0, 0.42, 1.05] as const),
  barrelM: 4.02, barrelRadiusM: 0.112,
});

/** The muzzle's station ahead of the hull's middle with the gun level. */
export const TTD_MUZZLE_HULL_Z = TTD_HULL.ring[2] + TTD_TURRET.trunnion[2] + TTD_TURRET.barrelM;

/** The protection record (mm) of each named plate: [physical, KE, CE]. The names are the record's (the 269 build's), so
 * every value carries over onto the TTD's own surfaces. */
type TtdProtection = Readonly<Record<
  'upper_glacis' | 'lower_front' | 'hull_side' | 'skirt_heavy' | 'skirt_rear' | 'track' | 'hull_rear' | 'hull_roof' |
  'turret_cheek' | 'mantlet' | 'turret_side' | 'turret_rear' | 'turret_roof' | 'turret_sight_recess' | 'turret_wedge',
  readonly [number, number, number]>>;

/** The TTD's armour on its drawn construction: each plate on the part a shot meets (a plate's _R is the +X side). */
export function ttdArmor(A: TtdProtection): ArmorEnvelope {
  const H = TTD_HULL, T = TTD_TURRET;
  const at = (n: keyof TtdProtection, kind?: 'spaced' | 'external') => ({ keMm: A[n][1], ceMm: A[n][2], ...(kind ? { kind } : {}) });
  const tw = H.tubHalfWidthM, joint = H.skirtJointZs[0], so = H.skirtOutX + 0.005, sternLedgeZ = -3.75;
  const [nz, ny] = H.deck[6], [fz0, fy0] = H.deck[5], trackOut = H.trackXc + H.trackW / 2;
  const hullPlates: ArmorPlate[] = [
    // the long shallow upper glacis from the nose's top edge to the turret's face, across the corner boxes
    fr('upper_glacis', A.upper_glacis[0], H.skirtOutX, ny, nz, fy0, fz0, at('upper_glacis')),
    // the steep nose plate, its lip and the lower glacis under it, as one front between the tracks
    fr('lower_front', A.lower_front[0], tw, H.belly[2][1], H.belly[2][0], ny, nz + 0.10, at('lower_front')),
    // the upper sides leaning in from the fender ledge to the deck's edge, and the tub's sides between the tracks
    sR('hull_side_upper_R', A.hull_side[0], H.sponsonLedgeX, H.ledgeY, H.sponsonDeckX, 1.76, sternLedgeZ, H.boxRearZ, at('hull_side')),
    sL('hull_side_upper_L', A.hull_side[0], H.sponsonLedgeX, H.ledgeY, H.sponsonDeckX, 1.76, sternLedgeZ, H.boxRearZ, at('hull_side')),
    sR('hull_side_lower_R', A.hull_side[0], tw, H.belly[1][1], tw, H.sponsonFloorY, H.belly[1][0], H.belly[2][0], at('hull_side')),
    sL('hull_side_lower_L', A.hull_side[0], tw, H.belly[1][1], tw, H.sponsonFloorY, H.belly[1][0], H.belly[2][0], at('hull_side')),
    // the skirts: the front panel the heavy one (to its first joint), the three behind it the thin aft run
    sR('skirt_heavy_R', A.skirt_heavy[0], so, H.skirtLowY, so, H.ledgeY, joint, H.skirtHemRiseZ, at('skirt_heavy', 'spaced')),
    sL('skirt_heavy_L', A.skirt_heavy[0], so, H.skirtLowY, so, H.ledgeY, joint, H.skirtHemRiseZ, at('skirt_heavy', 'spaced')),
    sR('skirt_rear_R', A.skirt_rear[0], so, H.skirtLowY, so, H.ledgeY, H.rakeFootZ, joint, at('skirt_rear', 'spaced')),
    sL('skirt_rear_L', A.skirt_rear[0], so, H.skirtLowY, so, H.ledgeY, H.rakeFootZ, joint, at('skirt_rear', 'spaced')),
    sR('track_R', A.track[0], trackOut, 0.10, trackOut, H.skirtLowY, -3.55, 3.65, { ...at('track', 'external'), moduleLink: 'trackR' }),
    sL('track_L', A.track[0], trackOut, 0.10, trackOut, H.skirtLowY, -3.55, 3.65, { ...at('track', 'external'), moduleLink: 'trackL' }),
    // the raked rear plate, its top edge overhanging its foot
    rr('hull_rear', A.hull_rear[0], H.sponsonDeckX, H.rakeFootY, H.rakeFootZ, H.sternTopFootY, H.sternTopZ, at('hull_rear')),
    rf('hull_roof', A.hull_roof[0], H.sponsonDeckX - 0.04, 1.80, -3.70, fz0, at('hull_roof')),
  ];
  // the turret: the face across the outer cheeks and the inner blocks either side of the slot, the mantlet in it, the
  // spaced layer inside the right-hand block (the gunner's side, behind the GS60), the slab sides, the leaning rear plate,
  // the roof, the GS60's window
  const top = T.roofY - T.chamferDownM, fz = T.faceZ, hw = T.halfWidthM, g = T.trunnion, slot = T.slotHalfWidthM;
  const outer = hw - T.frontCornerM, side = fz - T.frontCornerM, rearSide = T.rearFootZ + T.rearCornerM;
  const turretPlates: ArmorPlate[] = [
    plate('turret_cheek_R', A.turret_cheek[0], [slot, T.floorY, fz], [outer, T.floorY, fz], [slot, top, fz], at('turret_cheek')),
    plate('turret_cheek_L', A.turret_cheek[0], [-outer, T.floorY, fz], [-slot, T.floorY, fz], [-outer, top, fz], at('turret_cheek')),
    // (the mantlet's face, 7 cm behind the cheeks', moves with the gun)
    plate('mantlet', A.mantlet[0], [-slot, g[1] - 0.33, fz - 0.07], [slot, g[1] - 0.33, fz - 0.07], [-slot, g[1] + 0.29, fz - 0.07],
      { ...at('mantlet'), gunFollow: true }),
    sR('turret_side_R', A.turret_side[0], hw, T.floorY, hw, T.roofY - 0.03, rearSide, side, at('turret_side')),
    sL('turret_side_L', A.turret_side[0], hw, T.floorY, hw, T.roofY - 0.03, rearSide, side, at('turret_side')),
    rr('turret_rear', A.turret_rear[0], hw - T.rearCornerM, T.rearFloorY, T.rearFootZ, T.roofY - 0.04, T.rearRoofZ, at('turret_rear')),
    rf('turret_roof', A.turret_roof[0], hw - 0.04, T.roofY, T.rearRoofZ + 0.05, fz - T.chamferBackM, at('turret_roof')),
    plate('turret_sight_recess', A.turret_sight_recess[0], [-0.40, T.roofY + 0.01, 0.765], [-0.84, T.roofY + 0.01, 0.765],
      [-0.40, T.roofY + 0.23, 0.765], at('turret_sight_recess')),
    plate('turret_wedge_L', A.turret_wedge[0], [-(hw - 0.15), 0.06, T.slotBackZ + 0.08], [-slot - 0.02, 0.06, T.slotBackZ + 0.08],
      [-(hw - 0.15), top - 0.02, T.slotBackZ + 0.08], at('turret_wedge', 'spaced')),
  ];
  const ring = H.ring;
  return {
    boundingRadiusM: Math.hypot(TTD_MUZZLE_HULL_Z, 2.0) + 0.25,
    turretPivot: [ring[0], ring[1], ring[2]],
    gunPivot: [g[0], g[1], g[2]],
    gunBarrel: { lengthM: T.barrelM, radiusM: T.barrelRadiusM * 1.10 },
    hullPlates, turretPlates,
    modules: [
      // the power pack under the raised engine deck, the cross-drive gearbox behind it, the 1,600 l fuel forward of the
      // engine; the hull magazine left of the driver (32 rounds; TE), the turret basket's and carousel's under the ring
      mbox('engine', [-0.95, 0.55, -3.30], [0.95, 1.80, -1.95]),
      mbox('transmission', [-0.95, 0.55, -3.52], [0.95, 1.30, -3.30]),
      mbox('fuelTank', [-0.95, 0.55, -1.95], [0.95, 1.55, -1.45]),
      mbox('ammoRack', [0.15, 0.55, 1.60], [1.00, 1.55, 3.05]),
      mbox('turretRing', [-1.05, ring[1] - 0.18, ring[2] - 1.05], [1.05, ring[1] + 0.02, ring[2] + 1.05]),
      mbox('radio', [0.30, 0.10, -2.40], [1.10, 0.60, -1.60], true),
      // the GS60 gunner's sight and the CS60N commander's head on the right of the roof
      mbox('optics', [-0.90, 0.40, 0.20], [-0.30, 1.00, 0.80], true),
      mbox('gun', [-0.20, g[1] - 0.22, -0.90], [0.20, g[1] + 0.26, fz - 0.07], true),
      mbox('trackL', [-(H.trackXc + H.trackW / 2), 0, -3.50], [-(H.trackXc - H.trackW / 2), 1.10, 3.60]),
      mbox('trackR', [H.trackXc - H.trackW / 2, 0, -3.50], [H.trackXc + H.trackW / 2, 1.10, 3.60]),
    ],
    crew: [
      // the driver right of the gun under his hatch ahead of the turret (DSCF3794), the commander and gunner right, the
      // loader left
      cbox('driver', [-0.75, 0.60, 2.10], [-0.05, 1.65, 3.00]),
      cbox('gunner', [-0.95, 0.05, 0.30], [-0.30, 0.70, 1.05], true),
      cbox('commander', [-1.00, 0.10, -0.95], [-0.25, 0.86, 0.10], true),
      cbox('loader', [0.25, 0.05, -0.85], [1.00, 0.82, 0.30], true),
    ],
  };
}
