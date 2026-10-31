// Shared parts for the 2A4-era Leopard kits (leopard2A4Family.ts): where the release hull's and the 2A4 turret's
// surfaces stand, so every kit seats its add-ons on drawn geometry, and the few constructions several kits repeat (slat
// panels, ERA cassette fields, a bustle rack and its load, the crosswind mast). Hull metres on the hull (+Z forward, y up
// from the ground; the world's right of a +Z hull is -X); turret metres from the ring's centre on the deck.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { lineAt } from './leopard2Hull.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { LEOPARD2_HULL } from '../leopard2HullDatums.ts';
import { EARLY_LEOPARD2_FORE_SKIRT_DROP_M } from '../leopard2a3B4Armor.ts';
import { LEO2A4_TURRET } from '../leopard2A4FamilyArmor.ts';

const H = LEOPARD2_HULL, T = LEO2A4_TURRET;

/** The release hull's surfaces the kits seat on (leopard2Hull.ts draws them). */
export const HULL_SURFACES = Object.freeze({
  /** The heavy fore blocks' outer face, their run and their foot (the production drop below the aft run's). */
  foreSkirtX: 1.818,
  foreSkirtZ: Object.freeze([1.42, 3.16] as const),
  foreSkirtBottomY: H.skirtTopY - 0.46 - EARLY_LEOPARD2_FORE_SKIRT_DROP_M,
  /** The aft panels' proud band's outer face, their run and their foot. */
  aftSkirtX: 1.72,
  aftSkirtZ: Object.freeze([-3.66, 1.40] as const),
  aftSkirtBottomY: H.skirtTopY - 0.46,
  skirtTopY: H.skirtTopY,
  /** The sponson's outer wall and the deck's edge over it. */
  sponsonX: H.sponsonHalfWidthM,
  /** The front mudguard over the idler: its inner and outer edge, its run, its top falling to the nose. */
  mudguard: Object.freeze({ x0: 1.05, x1: 1.72, z0: 3.16, z1: 3.70 }),
  /** The rear plate's face, its foot and its top. */
  rearZ: -3.80,
  rearFootY: 0.82,
  rearTopY: 1.78,
  /** The flat belly. */
  bellyY: 0.54,
  /** The headlight pods on the glacis (x half-spacing, z) and the driver's hatch (x, z). */
  pods: Object.freeze([1.16, 3.08] as const),
  driverHatch: Object.freeze([-0.55, 2.06] as const),
});

/** The deck's height at z (the engine deck, the fighting compartment and the upper glacis are one station line). */
export const deckY = (z: number): number => lineAt(H.deck, z);
/** The front mudguard's top at z. */
export const mudguardY = (z: number): number => lineAt([[3.16, 1.40], [3.40, 1.33], [3.62, 1.26], [3.70, 1.24]], z);

/** A point on the deck or upper glacis and the Euler rotation that lays a part flat on it (+Y along the normal). */
export function deckFrame(x: number, z: number): { point: THREE.Vector3; normal: THREE.Vector3; rotation: THREE.Euler } {
  const e = 0.01, dydz = (deckY(z + e) - deckY(z - e)) / (2 * e);
  const normal = new THREE.Vector3(0, 1, -dydz).normalize();
  // turned about X nose-down by the slope (leopard2Hull.ts's glacisTilt), so the part's +Y stands on the normal
  return { point: new THREE.Vector3(x, deckY(z), z), normal, rotation: new THREE.Euler(Math.atan2(-dydz, 1), 0, 0) };
}

/** The 2A4 turret's surfaces in turret metres. */
export const TURRET_SURFACES = Object.freeze({
  faceZ: T.faceZ, slot: T.slotHalfWidthM, blockTopY: T.blockTopY, roofY: T.roofY, floorY: T.floorY,
  wallRight: T.wallRightM, wallLeft: T.wallLeftM, faceRight: T.faceRightM, faceLeft: T.faceLeftM,
  cornerZ: T.cornerZ, blockZ: T.blockZ, bustleEndZ: T.bustleEndZ, rearZ: T.rearZ,
  rearRight: T.rearRightM, rearLeft: T.rearLeftM, bustleFloorY: T.bustleFloorY,
  /** The wall's half-width at z (right, -X, steps in over the bustle). */
  wallAt(sx: number, z: number): number {
    if (sx > 0) return z > T.bustleEndZ ? T.wallLeftM : THREE.MathUtils.lerp(T.rearLeftM, 1.16, (z - T.rearZ) / (T.bustleEndZ - T.rearZ));
    if (z > -0.4664) return T.wallRightM;
    if (z > -1.023) return THREE.MathUtils.lerp(1.213, T.wallRightM, (z + 1.023) / (1.023 - 0.4664));
    if (z > -1.8062) return THREE.MathUtils.lerp(T.bustleRightM, 1.213, (z + 1.8062) / (1.8062 - 1.023));
    if (z > T.bustleEndZ) return THREE.MathUtils.lerp(1.10, T.bustleRightM, (z - T.bustleEndZ) / (-1.8062 - T.bustleEndZ));
    return THREE.MathUtils.lerp(T.rearRightM, 1.10, (z - T.rearZ) / (T.bustleEndZ - T.rearZ));
  },
});

/**
 * A slat (bar) armour panel: `rails` horizontal bars between two end posts, standing `standM` off a vertical face at
 * |x| = faceX on side sx, from z0 to z1 and y0 to y1, held by a stand-off arm at each post top and foot. Detail and dark
 * buckets only: the cage is equipment, never the vehicle's armour.
 */
export function slatPanel(P: TankBuilderPort, rig: 'hull' | 'turret', o: {
  sx: number; faceX: number; standM: number; z0: number; z1: number; y0: number; y1: number; rails: number; posts?: number;
}): void {
  const { box } = KIT;
  const detail = rig === 'hull' ? 'hullDetail' : 'turretDetail', dark = rig === 'hull' ? 'hullDark' : 'turretDark';
  const x = o.sx * (o.faceX + o.standM), len = o.z1 - o.z0, zc = (o.z0 + o.z1) / 2, posts = o.posts ?? 2;
  for (let k = 0; k < o.rails; k++) {
    const y = o.y0 + 0.03 + (o.y1 - o.y0 - 0.06) * (o.rails === 1 ? 0.5 : k / (o.rails - 1));
    P.addEquipment(detail, box(0.016, 0.03, len), x, y, zc);
  }
  for (let k = 0; k < posts; k++) {
    const z = o.z0 + 0.02 + (len - 0.04) * (posts === 1 ? 0.5 : k / (posts - 1));
    P.addEquipment(detail, box(0.03, o.y1 - o.y0, 0.03), x, (o.y0 + o.y1) / 2, z);
    for (const y of [o.y0 + 0.06, o.y1 - 0.06]) {
      P.addEquipment(dark, box(o.standM + 0.02, 0.025, 0.025), o.sx * (o.faceX + o.standM / 2), y, z);
    }
  }
}

/** One ERA cassette's placement: a centre, the rotation laying it on its host, its scale over the 0.28 x 0.13 x 0.07 base. */
export interface CassetteSeat {
  readonly center: THREE.Vector3;
  readonly rotation: THREE.Euler;
  readonly scale: readonly [number, number, number];
}

/**
 * A gameplay ERA field (P.eraCluster: each cassette is external armour of the named plate, spent and reset with it). Seats
 * are in hull metres for a hull field; a turret field's seats are in turret metres and handed to the port in hull metres
 * through the spec's turret pivot, as the port expects.
 */
export function eraField(P: TankBuilderPort, plateName: string, seats: readonly CassetteSeat[], turretLocal = false): void {
  const pivot = P.spec.armor.turretPivot;
  P.eraCluster(plateName, (place) => {
    for (const s of seats) {
      const [x, y, z] = turretLocal ? [s.center.x, s.center.y + pivot[1], s.center.z + pivot[2]] : s.center.toArray();
      place(x, y, z, s.rotation.x, s.rotation.y, s.rotation.z, s.scale[0], s.scale[1], s.scale[2]);
    }
  }, turretLocal);
}

/**
 * Cassettes on the upper glacis: `cols` across from -halfW to +halfW, `rows` up the slope from z0 to z1, each sunk
 * `embedM` into the plate, skipping any seat `keep` refuses (the driver's periscopes, the headlight pods).
 */
export function glacisCassettes(o: {
  halfW: number; z0: number; z1: number; cols: number; rows: number; scale: readonly [number, number, number];
  embedM?: number; keep?: (x: number, z: number) => boolean;
}): CassetteSeat[] {
  const seats: CassetteSeat[] = [];
  for (let r = 0; r < o.rows; r++) {
    for (let c = 0; c < o.cols; c++) {
      const x = -o.halfW + (2 * o.halfW) * (o.cols === 1 ? 0.5 : c / (o.cols - 1));
      const z = o.z0 + (o.z1 - o.z0) * (o.rows === 1 ? 0.5 : r / (o.rows - 1));
      if (o.keep && !o.keep(x, z)) continue;
      const f = deckFrame(x, z), half = 0.07 * o.scale[2] / 2;
      // the cassette's depth (its local z) along the plate's normal: tip the box back so its face lies on the slope
      const rotation = new THREE.Euler(f.rotation.x - Math.PI / 2, 0, 0);
      seats.push({ center: f.point.clone().addScaledVector(f.normal, half - (o.embedM ?? 0.015)), rotation, scale: o.scale });
    }
  }
  return seats;
}

/**
 * A floor in the release hull's stern rack (leopard2Hull.ts: its rails across at z -4.14, its sides at x ±0.55): a ledger
 * on the louvre band's face, a dark sheet under the low rail, four slats along it, as the 2A4 V's stern frame floors its
 * bay. Left empty the rack read through to the ground from above (the standard check's contiguity: 54 cells, release
 * 264's gate). Returns the floor's top and the bay's centre so a kit can load it.
 */
export function sternRackFloor(P: TankBuilderPort): { floorY: number; zc: number } {
  const { box } = KIT;
  // the sheet runs under the low rail to a 1 cm lip behind it: the rail's own back edge fell on a pixel boundary in the
  // Improved's census frame and read as a 30 px seam (the sealed check, release 264's gate)
  const front = -3.835, back = -4.165, zc = (front + back) / 2, depth = front - back;
  P.addEquipment('hullDetail', box(1.10, 0.04, 0.03), 0, 1.68, -3.839);
  P.addEquipment('hullDark', box(1.10, 0.012, depth), 0, 1.706, zc);
  for (let k = 0; k < 4; k++) P.addEquipment('hullDetail', box(0.035, 0.018, depth), -0.4125 + k * 0.275, 1.721, zc);
  // the rack's rails and back posts sleeved 5 mm fore and aft over the hull's 3 cm tubes, at their own heights: their faces
  // at z -4.125 fell on a column of pixel centres in the Improved's census frame, where the raster took the tubes'
  // undersides (38 px, the sealed check); a taller top rail took the OTCO's gun to 24 mm at yaw 180 (the 25 mm floor)
  for (const y of [1.72, 1.82]) P.addEquipment('hullDetail', box(1.11, 0.03, 0.04), 0, y, -4.14);
  for (const dx of [-0.55, 0.55]) P.addEquipment('hullDetail', box(0.04, 0.13, 0.04), dx, 1.765, -4.14);
  return { floorY: 1.730, zc };
}

/**
 * An open stowage rack on the bustle's rear plate: rails across, posts, a slatted floor; returns the floor's height and
 * the rack's depth so a kit can load it.
 */
export function bustleRack(P: TankBuilderPort, o: { halfW: number; depth: number; low: number; top: number; rails: number; bars: number }): { floorY: number; backZ: number } {
  const { box } = KIT;
  const z = T.rearZ, back = z - o.depth;
  for (let k = 0; k < o.rails; k++) {
    const y = o.low + (o.top - o.low) * (o.rails === 1 ? 0 : k / (o.rails - 1));
    P.addEquipment('turretDetail', box(o.halfW * 2, 0.03, 0.03), 0, y, back);
  }
  for (let k = 0; k <= o.bars; k++) {
    P.addEquipment('turretDetail', box(0.026, o.top - o.low, 0.026), -o.halfW + 0.01 + k * (2 * o.halfW - 0.02) / o.bars, (o.low + o.top) / 2, back);
  }
  for (const sx of [-1, 1]) {
    for (const y of [o.low, o.top]) P.addEquipment('turretDetail', box(0.03, 0.03, o.depth + 0.02), sx * o.halfW, y, z - o.depth / 2 + 0.01);
  }
  P.addEquipment('turretDark', KIT.openRackGrid(o.halfW * 2 - 0.04, o.depth - 0.02, 0.014, 5, o.bars + 1), 0, o.low + 0.015, z - o.depth / 2);
  return { floorY: o.low + 0.03, backZ: back };
}

/** The crosswind sensor's mast and head on the bustle roof. */
export function crosswindMast(P: TankBuilderPort, x: number, z: number, height = 0.16): void {
  const { box, cylY } = KIT;
  P.addEquipment('turretDetail', cylY(0.018, 0.024, height, 8), x, T.roofY + height / 2, z);
  P.addEquipment('turretDark', box(0.14, 0.02, 0.02), x, T.roofY + height + 0.01, z);
  P.addEquipment('turretDark', box(0.02, 0.02, 0.14), x, T.roofY + height + 0.01, z);
}

/** A whip laid folded along the roof from its base pot (the antenna struck for transport). */
export function foldedWhip(P: TankBuilderPort, x: number, z: number, length: number): void {
  const { box, cylY } = KIT;
  P.addEquipment('turretDetail', cylY(0.032, 0.04, 0.09, 10), x, T.roofY + 0.045, z);
  P.addEquipment('turretDark', box(0.014, 0.014, length), x, T.roofY + 0.10, z - length / 2 + 0.03, -0.02, 0, 0);
}
