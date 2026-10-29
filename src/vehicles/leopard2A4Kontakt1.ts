// The Ukrainian-service Leopard 2A4 under Kontakt-1 (leo2a4_v; the owner via Main, 2026-10-29: "the real Ukrainian-service
// Leopard 2A4 with the Kontakt-1 ERA kit, the tank the informal \"2A4V\" name means"). The service photographs (Praise The
// Steph, 2023-07-01, via armyrecognition.com; Oryx's "2A4V", a Canadian-origin 2A4) show 4S20 containers on both turret
// cheeks' faces, a course on the right cheek's bevel, grids down the turret's flanks ahead of the smoke rows and grids on the
// heavy fore skirt blocks; the glacis and the mantlet stay bare. One table of courses drives both the containers the kit
// lays (profiles/leopard2A4Kontakt1Kit.ts) and the ERA plates the record carries (leopard2A4FamilySpecs.ts).
import type { ArmorPlate } from './specHelpers.ts';
import { LEO2A4_TURRET, kitPlate, type KitPlate } from './leopard2A4FamilyArmor.ts';

const T = LEO2A4_TURRET;

/** The 4S20 container: 251.9 x 131.9 x 70 mm, bolted 10 mm off its plate (the Ukrainian M1A1's, abramsSourceXUkraineEraArmor). */
export const KONTAKT1_BRICK = Object.freeze({ long: 0.252, short: 0.132, t: 0.070, lift: 0.010 });

/** Kontakt-1 against kinetic rounds is a thin steel sandwich; against chemical energy it strips the jet (the fleet's
 *  Kontakt-1 values, as on the Ukrainian M1A1 and the T-72B3 / T-80BV). */
export const KONTAKT1_ERA = Object.freeze({ keReduction: 0.05, ceFlatMm: 280 });

const TAN_SWEEP = Math.tan(T.faceSweepDeg * Math.PI / 180);
/** The cheek faces' z at |x| (swept back from the slot's edge; leopard2A4Turret.ts). */
export const faceZAt = (absX: number): number => T.faceZ - TAN_SWEEP * Math.max(0, absX - T.slotHalfWidthM);
/** The bevel's upper edge at |x| (the sweep eases from the faces to nothing at the corner cut's station). */
export const bevelTopZAt = (absX: number): number =>
  T.bevelZ - ((T.bevelZ - T.cornerZ) / (T.faceZ - T.cornerZ)) * TAN_SWEEP * Math.max(0, absX - T.slotHalfWidthM);

/** Where a course lies: a cheek's vertical face, its bevel, a turret wall, or a fore skirt block's face. */
export type Kontakt1Surface = 'face' | 'bevel' | 'wall' | 'skirt';

/** One course of containers: on side sx (+1 is +X), each seat's centre in its rig's metres along the surface (|x| across a
 *  face or bevel; z along a wall or skirt) and up it (y on a face, wall or skirt; the bevel's middle). */
export interface Kontakt1Course {
  readonly name: string;
  readonly rig: 'hull' | 'turret';
  readonly surface: Kontakt1Surface;
  readonly sx: 1 | -1;
  /** The containers' long side up the surface (true) or along it. */
  readonly upright: boolean;
  readonly seats: readonly (readonly [number, number])[];
}

const grid = (us: readonly number[], vs: readonly number[]): Array<readonly [number, number]> =>
  vs.flatMap((v) => us.map((u) => [u, v] as const));

/** The face's columns from the slot's edge, 3 cm clear of the mantlet. */
const FACE_COLS = [0.571, 0.713, 0.855] as const;
/** The face's rows: upright containers from 8 cm over the floor to under the faces' top (0.61). */
const FACE_ROWS = [0.206, 0.468] as const;
/** The walls' columns from the corner cut back to clear the loader's welded ammunition hatch (z -0.64..-0.20). */
const WALL_COLS = [1.24, 0.97, 0.70, 0.43, 0.16] as const;
const WALL_ROWS = [0.16, 0.305, 0.45, 0.595] as const;
/** The fore skirt blocks' face (x 1.818, z 1.42-3.16, y 0.74-1.36): six columns, four rows. */
export const SKIRT_FACE_X = 1.818;
const SKIRT_COLS = [1.55, 1.82, 2.09, 2.36, 2.63, 2.90] as const;
const SKIRT_ROWS = [0.85, 0.995, 1.14, 1.285] as const;

export const LEO2A4V_KONTAKT1: readonly Kontakt1Course[] = Object.freeze([
  // the left (+X) cheek: three columns of two upright containers, and three up its bevel
  { name: 'k1_turret_face_R', rig: 'turret', surface: 'face', sx: 1, upright: true, seats: grid(FACE_COLS, FACE_ROWS) },
  { name: 'k1_turret_bevel_R', rig: 'turret', surface: 'bevel', sx: 1, upright: true,
    seats: [[0.56, 0], [0.70, 0], [0.84, 0]] },
  // the right (-X) cheek round the EMES 15 window's notch (x 0.50-0.94 from its sill, 0.42, up): four below it, one beside
  { name: 'k1_turret_face_L', rig: 'turret', surface: 'face', sx: -1, upright: true,
    seats: [...grid([...FACE_COLS, 0.997], [FACE_ROWS[0]]), [1.01, FACE_ROWS[1]]] },
  { name: 'k1_turret_wall_R', rig: 'turret', surface: 'wall', sx: 1, upright: false, seats: grid(WALL_COLS, WALL_ROWS) },
  { name: 'k1_turret_wall_L', rig: 'turret', surface: 'wall', sx: -1, upright: false, seats: grid(WALL_COLS, WALL_ROWS) },
  { name: 'k1_skirt_R', rig: 'hull', surface: 'skirt', sx: 1, upright: false, seats: grid(SKIRT_COLS, SKIRT_ROWS) },
  { name: 'k1_skirt_L', rig: 'hull', surface: 'skirt', sx: -1, upright: false, seats: grid(SKIRT_COLS, SKIRT_ROWS) },
]);

/** The wall's half-width ahead of the bustle (the 2A6 X's core walls: wider right of the gun). */
export const wallX = (sx: number): number => (sx > 0 ? T.wallLeftM : T.wallRightM);

/** A course's ERA plate: a quad over its containers' outer faces, carrying the Kontakt-1 values (a combat addition). */
function coursePlate(c: Kontakt1Course): KitPlate {
  const B = KONTAKT1_BRICK, out = B.lift + B.t;
  const [across, up] = c.upright ? [B.short / 2, B.long / 2] : [B.long / 2, B.short / 2];
  const us = c.seats.map(([u]) => u), vs = c.seats.map(([, v]) => v);
  const u0 = Math.min(...us) - across, u1 = Math.max(...us) + across, v0 = Math.min(...vs) - up, v1 = Math.max(...vs) + up;
  const s = c.sx;
  let kp: KitPlate;
  if (c.surface === 'face') {
    // the faces lean back 6 degrees in plan: the plate runs from the inner to the outer column on the swept face
    const za = faceZAt(u0) + out, zb = faceZAt(u1) + out;
    kp = s > 0
      ? kitPlate('turret', c.name, [u0, v0, za], [u1, v0, zb], [u0, v1, za], { kind: 'era' })
      : kitPlate('turret', c.name, [-u1, v0, zb], [-u0, v0, za], [-u1, v1, zb], { kind: 'era' });
  } else if (c.surface === 'bevel') {
    // the 40-degree bevel's outward normal is (0, cos 40, sin 40): the plate on its containers' outer faces
    const p = (x: number, onFace: boolean): readonly [number, number, number] => onFace
      ? [s * x, T.faceTopY + out * 0.766, faceZAt(x) + out * 0.643]
      : [s * x, T.blockTopY + out * 0.766, bevelTopZAt(x) + out * 0.643];
    kp = s > 0 ? kitPlate('turret', c.name, p(u0, true), p(u1, true), p(u0, false), { kind: 'era' })
      : kitPlate('turret', c.name, p(u1, true), p(u0, true), p(u1, false), { kind: 'era' });
  } else {
    const x = (c.surface === 'wall' ? wallX(s) : SKIRT_FACE_X) + out;
    // u runs along z; an outward (+X) normal winds front to back
    kp = s > 0
      ? kitPlate(c.rig, c.name, [x, v0, u1], [x, v0, u0], [x, v1, u1], { kind: 'era' })
      : kitPlate(c.rig, c.name, [-x, v0, u0], [-x, v0, u1], [-x, v1, u0], { kind: 'era' });
  }
  const era: ArmorPlate['era'] = { ...KONTAKT1_ERA };
  return { rig: kp.rig, plate: { ...kp.plate, physicalMm: 12, keMm: 12, ceMm: 12, kind: 'era', era, moduleLink: null, gunFollow: false } };
}

/** The leo2a4_v record's Kontakt-1 plates, by name (leopard2A4FamilySpecs.ts adds them: a combat change, release 265). */
export const LEO2A4V_KONTAKT1_PLATES: Readonly<Record<string, KitPlate>> = Object.freeze(
  Object.fromEntries(LEO2A4V_KONTAKT1.map((c) => [c.name, coursePlate(c)])));
