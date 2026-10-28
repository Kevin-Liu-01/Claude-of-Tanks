// Merkava family marks (release 262): the measured record of each of the six marks the family builder draws, matched to
// the owner-supplied source models (2026-10-27: "need to match the geometry of these"; Merkava Mk 1B, 2B, 2D, 3C, 3D
// and 4B; local comparison inputs, never redistributed or loaded). The running gear, turret stations, gun, mantlet and
// every detail part come from the source fit (merkavaFamilySource.ts); the hull's lines below are authored per chassis
// from the same fit (its deck, engine deck, nose, belly and stern courses, the sponsons' tops and undersides), since the
// sources' hull plates are open and carry the turret ring's and hatches' openings. Sources and gap tables:
// docs/references/tanks/<id>.md. Hull frame: ground y = 0, +Z the nose, +X the vehicle's left.
import type { MerkavaGearSpec, MerkavaHullSpec } from './merkavaFamilyHull.ts';
import type { MerkavaBasket, TurretRing } from './merkavaFamilyTurret.ts';
import type { MeasuredBox, MerkavaGunSpec, MerkavaOverGun, RevolveStation } from './merkavaFamilyGun.ts';
import { MERKAVA_SOURCE, type SourcePart } from './merkavaFamilySource.ts';

export type MerkavaMarkId = 'merkava1b' | 'merkava2b' | 'merkava2d' | 'merkava3c' | 'merkava3_baz' | 'merkava4b';

export interface MerkavaMark {
  readonly id: MerkavaMarkId;
  readonly hull: MerkavaHullSpec;
  readonly gear: MerkavaGearSpec;
  /** The turret ring centre in the hull frame: deck height and z. */
  readonly pivot: readonly [y: number, z: number];
  readonly rings: readonly TurretRing[];
  readonly parts: readonly SourcePart[];
  readonly gun: MerkavaGunSpec;
  /** The bustle basket: from the shell's rear (z0) to the rack's end (z1), half-width, floor and rail heights (hull frame). */
  readonly basket: MerkavaBasket;
  /** Roof machine guns at their measured mounts (x, foot y, z; hull frame). */
  readonly roofGuns: readonly (readonly [x: number, y: number, z: number])[];
  /** Whip antennas: x, z, height (their feet on the roof). */
  readonly antennas: readonly (readonly [x: number, z: number, h: number])[];
}

// ---------------------------------------------------------------------------------------------- the three chassis
// Mk 1 / Mk 2 (the Mk 1B, 2B and 2D sources share it): deck 1.68-1.71 with the raised rear course at 1.78-1.81, the
// driver's course to 1.76, the engine deck falling from z 1.45 to 1.50 at 2.45 and stepping to the grille at 1.24-1.28,
// the full-width brow at z 2.9-3.1 (1.58) and the upper glacis down to the nose at 1.12; belly 0.42; the stern
// raked from (-3.32, 1.72) to (-3.5, 0.92); sponsons to +-1.865 over the track, their undersides at 1.33.
const MK12_HULL: MerkavaHullSpec = {
  top: [[-3.70, 0.86], [-3.50, 0.92], [-3.42, 1.20], [-3.32, 1.72], [-3.00, 1.78], [-2.55, 1.81], [-2.45, 1.75],
    [-2.00, 1.71], [-1.85, 1.68], [0.35, 1.68], [0.65, 1.74], [1.30, 1.76], [1.45, 1.72], [2.00, 1.585], [2.45, 1.50],
    [2.50, 1.28], [2.85, 1.24], [2.92, 1.48], [3.00, 1.58], [3.10, 1.48], [3.20, 1.38], [3.30, 1.34], [3.40, 1.26],
    [3.50, 1.19], [3.60, 1.12], [3.76, 1.12]],
  bottom: [[-3.70, 0.69], [-3.20, 0.67], [-3.00, 0.46], [-2.90, 0.42], [2.60, 0.42], [2.70, 0.44], [3.00, 0.61],
    [3.20, 0.69], [3.35, 0.80], [3.42, 0.92], [3.76, 0.97]],
  sponsonTop: [[-3.79, 1.35], [-3.56, 1.36], [-3.52, 1.62], [-3.30, 1.73], [-2.70, 1.77], [-1.75, 1.70], [0.15, 1.69],
    [0.45, 1.76], [0.80, 1.80], [2.20, 1.66], [2.70, 1.57], [3.05, 1.556], [3.10, 1.39], [3.30, 1.07]],
  sponsonUnderY: 1.33, lowerHalfWidth: 1.15, upperHalfWidth: 1.865,
  noseTaper: [[3.40, 1.15], [3.55, 1.07], [3.60, 0.84], [3.76, 0.73]],
  rearDoor: [1.10, 0.60, 0.80], exhaust: [0.35, 1.35],
};

// Mk 3 (the 3C and 3D sources): deck 1.69 with the raised rear course at 1.80, the driver's course to 1.79, the engine
// deck at 1.52-1.55 from z 1.65 to 2.4, stepping to the grille at 1.23-1.28, the full-width brow at z 2.9-3.1 (1.58) and
// the upper glacis down to the nose at 1.05; belly 0.41.
const MK3_HULL: MerkavaHullSpec = {
  top: [[-3.70, 1.20], [-3.62, 1.64], [-3.40, 1.665], [-3.25, 1.745], [-2.95, 1.796], [-2.75, 1.79], [-2.65, 1.735],
    [-2.00, 1.69], [-1.90, 1.66], [0.40, 1.68], [0.70, 1.75], [1.30, 1.79], [1.40, 1.74], [1.50, 1.59], [1.65, 1.545],
    [2.40, 1.52], [2.48, 1.42], [2.52, 1.28], [2.85, 1.23], [2.92, 1.48], [3.00, 1.58], [3.10, 1.47], [3.20, 1.38],
    [3.30, 1.30], [3.40, 1.26], [3.50, 1.20], [3.60, 1.08], [3.70, 1.05], [3.75, 1.05]],
  bottom: [[-3.70, 0.67], [-3.30, 0.633], [-3.10, 0.426], [-2.90, 0.41], [2.60, 0.41], [2.75, 0.46], [3.00, 0.61],
    [3.20, 0.68], [3.35, 0.80], [3.45, 0.915], [3.75, 0.92]],
  sponsonTop: [[-3.75, 1.48], [-3.70, 1.63], [-2.95, 1.75], [-1.80, 1.695], [0.30, 1.686], [0.50, 1.73], [0.65, 1.797],
    [0.90, 1.79], [1.45, 1.743], [1.60, 1.70], [1.85, 1.675], [2.20, 1.651], [2.65, 1.585], [2.90, 1.521], [3.05, 1.44],
    [3.10, 1.12], [3.30, 1.06]],
  sponsonUnderY: 1.32, lowerHalfWidth: 1.15, upperHalfWidth: 1.865,
  noseTaper: [[3.45, 1.12], [3.60, 1.05], [3.65, 0.73], [3.75, 0.725]],
  rearDoor: [1.10, 0.60, 0.80], exhaust: [0.45, 1.50],
};

// Mk 4 (the 4B source): the raised rear deck at 1.84-1.85, the deck at 1.69-1.74, the driver's course to 1.80-1.87 from
// z 1.2 to 1.9, the glacis to 1.55 at 2.4-2.65 and the nose to 1.20 at z 4.1; belly 0.45; sponsons to +-1.915.
const MK4_HULL: MerkavaHullSpec = {
  top: [[-3.80, 1.20], [-3.40, 1.76], [-3.00, 1.84], [-2.25, 1.85], [-2.00, 1.83], [-1.85, 1.78], [-1.50, 1.74],
    [-1.45, 1.695], [0.90, 1.71], [1.20, 1.80], [1.90, 1.80], [1.95, 1.685], [2.40, 1.554], [2.65, 1.55], [2.80, 1.49],
    [3.40, 1.33], [3.80, 1.29], [3.95, 1.213], [4.10, 1.20]],
  bottom: [[-3.80, 1.10], [-3.40, 1.10], [-3.25, 1.086], [-3.20, 0.85], [-3.15, 0.733], [-3.05, 0.733], [-2.85, 0.685],
    [-2.65, 0.494], [-2.60, 0.46], [3.10, 0.45], [3.20, 0.52], [3.65, 0.814], [3.80, 0.888], [3.95, 0.98], [4.10, 0.99]],
  sponsonTop: [[-3.80, 1.71], [-2.55, 1.84], [-2.30, 1.81], [-2.25, 1.695], [0.60, 1.695], [0.80, 1.835],
    [1.95, 1.814], [2.40, 1.706], [2.85, 1.613], [3.00, 1.556], [3.20, 1.489], [3.25, 1.166], [3.55, 1.166], [3.75, 1.109]],
  sponsonUnderY: 1.36, lowerHalfWidth: 1.16, upperHalfWidth: 1.915,
  noseTaper: [[3.75, 1.16], [3.95, 1.07], [4.10, 0.70]],
  rearDoor: [1.30, 0.60, 0.70], exhaust: [0.45, 1.50],
};

// ---------------------------------------------------------------------------------------------- from the source fit
type SourceRecord = (typeof MERKAVA_SOURCE)[MerkavaMarkId]['record'];

function gearOf(r: SourceRecord): MerkavaGearSpec {
  const g = r.gear;
  return {
    wheelR: g.wheelR, wheelW: Math.min(0.28, g.wheelW), axleY: g.axleY, wheelZs: [...g.wheelZs],
    sprocket: { z: g.sprocket[0], y: g.sprocket[1], r: g.sprocket[2] },
    idler: { z: g.idler[0], y: g.idler[1], r: g.idler[2] },
    rollers: g.rollers.map(([z, y, r]) => [z, y, r] as const),
    trackW: g.trackW, trackTh: Math.max(0.06, g.axleY - g.wheelR - g.trackBottom), trackX: g.trackX,
  };
}

/** The over-gun mount as the source measures it (hull frame): the 12.7 mm M2 (its `mg_twin` group: back plate, muzzle,
 *  bore height), its cradle on the mantlet's crown and its side ammunition box. */
interface OverGunRecord {
  readonly m2: readonly [rearZ: number, muzzleZ: number, axisY: number] | null;
  readonly cradle: MeasuredBox;
  readonly ammoBox: MeasuredBox | null;
}

// the Mk 1B (in its gun bone), 2D, 3C and 3D sources share one M2 and box; the Mk 2B's cradle stands empty; the Mk 4B's
// M2 rides higher on its pointed housing, its ammunition fed from the right
const M2_MK1_3: Omit<OverGunRecord, 'm2'> = {
  cradle: [[-0.10, 2.39, 0.50], [0.10, 2.55, 1.15]], ammoBox: [[0.06, 2.55, 0.85], [0.423, 2.806, 1.15]],
};
const OVER_GUN: Readonly<Record<MerkavaMarkId, OverGunRecord>> = {
  merkava1b: { m2: [0.453, 2.112, 2.705], ...M2_MK1_3 },
  merkava2b: { m2: null, cradle: [[-0.21, 2.388, 0.512], [0.21, 2.50, 0.769]], ammoBox: null },
  merkava2d: { m2: [0.45, 2.11, 2.70], ...M2_MK1_3 },
  merkava3c: { m2: [0.449, 2.109, 2.70], ...M2_MK1_3 },
  merkava3_baz: { m2: [0.449, 2.109, 2.70], ...M2_MK1_3 },
  merkava4b: { m2: [1.152, 2.812, 2.814], cradle: [[-0.10, 2.46, 1.15], [0.10, 2.70, 1.85]], ammoBox: null },
};

/** The gun: the measured barrel and mantlet in the gun frame, the trunnion `trunnionBack` behind the shell's nose course
 *  (the OBJ sources carry no pivots: the trunnion sits in the gun mask at the nose slot). */
function gunOf(r: SourceRecord, pivot: readonly [number, number], trunnionBack: number, top: OverGunRecord): MerkavaGunSpec {
  const [, axisY] = r.barrelAxis;
  const tz = r.noseZ - trunnionBack;
  const trunnion: [number, number, number] = [0, axisY - pivot[0], tz - pivot[1]];
  const barrel: RevolveStation[] = [[r.barrel[0]![0] - tz, 0], ...r.barrel.map(([z, rr]): RevolveStation => [z - tz, rr]),
    [r.barrel[r.barrel.length - 1]![0] - tz, 0]];
  const mantlet = r.mantlet.map(([z, x0, x1, y0, y1]) => [z - tz, x0, x1, y0 - axisY, y1 - axisY] as const);
  const local = ([min, max]: MeasuredBox): MeasuredBox =>
    [[min[0], min[1] - axisY, min[2] - tz], [max[0], max[1] - axisY, max[2] - tz]];
  const overGun: MerkavaOverGun = {
    m2: top.m2 ? { rearZ: top.m2[0] - tz, muzzleZ: top.m2[1] - tz, axisY: top.m2[2] - axisY } : null,
    cradle: local(top.cradle), ammoBox: top.ammoBox ? local(top.ammoBox) : null,
  };
  return {
    model: r.barrel.some(([, rr]) => rr > 0.083) && r.barrel[r.barrel.length - 1]![1] > 0.079 ? 'MG25x' : 'M64',
    trunnion, muzzleZ: r.barrel[r.barrel.length - 1]![0] - tz, barrel, mantlet, overGun,
  };
}

function ringsOf(r: SourceRecord): TurretRing[] {
  return r.turretRings.map((g) => ({ z: g.z, side: g.side.map(([x, y]) => [x, y] as const), crown: g.crown }));
}

function mark(id: MerkavaMarkId, hull: MerkavaHullSpec, trunnionBack: number, basket: MerkavaMark['basket'],
  antennas: MerkavaMark['antennas']): MerkavaMark {
  const src = MERKAVA_SOURCE[id], r = src.record;
  const pivot: readonly [number, number] = [r.deck, r.pivotZ];
  return {
    id, hull, gear: gearOf(r), pivot, rings: ringsOf(r), parts: src.parts, gun: gunOf(r, pivot, trunnionBack, OVER_GUN[id]),
    basket, roofGuns: r.mgs.map(([x, , z, foot]) => [x, foot, z] as const), antennas,
  };
}

export const MERKAVA_MARKS: Readonly<Record<MerkavaMarkId, MerkavaMark>> = Object.freeze({
  merkava1b: mark('merkava1b', MK12_HULL, 0.42,
    { z0: -3.05, z1: -3.80, halfWidth: 1.10, floor: 2.00, rail: 2.50 }, [[-0.85, -2.25, 2.1], [0.85, -2.25, 2.1]]),
  merkava2b: mark('merkava2b', MK12_HULL, 0.42,
    { z0: -3.10, z1: -3.92, halfWidth: 1.12, floor: 2.00, rail: 2.50 }, [[-0.85, -2.30, 2.1], [0.85, -2.30, 2.1]]),
  merkava2d: mark('merkava2d', MK12_HULL, 0.42,
    { z0: -3.10, z1: -3.92, halfWidth: 1.12, floor: 2.00, rail: 2.50 }, [[-0.85, -2.30, 2.1], [0.85, -2.30, 2.1]]),
  merkava3c: mark('merkava3c', MK3_HULL, 0.40,
    { z0: -3.25, z1: -4.08, halfWidth: 1.10, floor: 2.00, rail: 2.45 }, [[-0.95, -2.40, 2.2], [0.95, -2.40, 2.2]]),
  merkava3_baz: mark('merkava3_baz', MK3_HULL, 0.40,
    { z0: -3.25, z1: -4.08, halfWidth: 1.10, floor: 2.00, rail: 2.45 }, [[-0.95, -2.40, 2.2], [0.95, -2.40, 2.2]]),
  merkava4b: mark('merkava4b', MK4_HULL, 0.45,
    { z0: -3.25, z1: -3.80, halfWidth: 1.15, floor: 2.08, rail: 2.56 }, [[-1.00, -2.60, 2.3], [1.00, -2.60, 2.3]]),
});
