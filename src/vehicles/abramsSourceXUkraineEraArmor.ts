import type { ArmorEnvelope, ArmorPlate, Vec3Tuple } from './specHelpers.ts';
import { ABRAMS_SOURCE_X_FRAME } from './abramsSourceXDatums.ts';

// Gameplay ERA zones for the M1A2 Abrams UA field kit (owner 2026-09-15). The kit
// (profiles/abramsSourceXUkraineKit.ts) lays Kontakt-1 cassette courses on the measured
// turret flank, turret cheek and glacis planes and ARAT-style cassettes on the skirts as
// visual ERA clusters; every visible reactive package must own a depletable gameplay zone
// (eraGameplayRegistration receipt), so this module mirrors the kit's planes and course
// extents as one collision face per bank on the cassettes' outer faces, named like the rest of
// the Abrams family (<id>_skirt_era_L ...). No profile import
// is needed at boot; the kit receipt cross-checks the seating of every cassette body.

type Plane = readonly [number, number, number, number];
type Vec = [number, number, number];

const TURRET = ABRAMS_SOURCE_X_FRAME.turret;
/** Kontakt-1 4S20 cassette: 251.9 x 131.9 x 70 mm, seated 10 mm off its plane. */
const BRICK = Object.freeze({ w: .252, h: .132, t: .070, lift: .010 });

// Measured source planes (hull frame), identical to the kit's.
const RIGHT_SIDE: Plane = [.861624, .507547, 0, 2.159152];
const LEFT_SIDE: Plane = [-.86164, .507521, 0, 2.276882];
const RIGHT_CHEEK: Plane = [.510997, .499844, .699312, 2.674797];
const LEFT_CHEEK: Plane = [-.363382, .515021, .776342, 2.888263];
const GLACIS: Plane = [0, .99217, .12483, 1.63216];

/** Kontakt-1 against kinetic rounds is a thin steel sandwich; against chemical energy it
 * strips the jet (the T-72B3 / T-80BV values). ARAT-1 is licensed Kontakt-1 technology. */
export const UA_KONTAKT1_ERA = Object.freeze({ keReduction: 0.05, ceFlatMm: 280 });
export const UA_ARAT_ERA = Object.freeze({ keReduction: 0.05, ceFlatMm: 300 });

/** ARAT skirt cassette bank: eight 0.657 m cassettes per side at z 2.655755 - i * .666455. */
export const UA_SKIRT_BANK = Object.freeze({
  outerX: 1.93636 + .19032 / 2,
  y: .990852, halfHeight: .750506 / 2,
  z: (2.655755 + .65729 / 2 + (2.655755 - 7 * .666455 - .65729 / 2)) / 2,
  halfLength: (2.655755 + .65729 / 2 - (2.655755 - 7 * .666455 - .65729 / 2)) / 2,
});

interface Course {
  name: string;
  owner: 'hull' | 'turret';
  plane: Plane;
  origin: Vec;
  cols: number;
  rows: number;
  pitchU: number;
  pitchV: number;
}

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const add = (...vs: Vec[]): Vec => vs.reduce((acc, v) => [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]], [0, 0, 0]);
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec): Vec => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));

/** Orthonormal frame on a plane: u horizontal along the plane, v up the plane, n outward. */
export function planeFrame(plane: Plane): { u: Vec; v: Vec; n: Vec } {
  const n = normalize([plane[0], plane[1], plane[2]]);
  const u = normalize(cross([0, 1, 0], n));
  const v = cross(n, u);
  return { u, v, n };
}
const onPlaneX = (plane: Plane, y: number, z: number): Vec => [(plane[3] - plane[1] * y - plane[2] * z) / plane[0], y, z];
const onPlaneZ = (plane: Plane, x: number, y: number): Vec => [x, y, (plane[3] - plane[0] * x - plane[1] * y) / plane[2]];
const onPlaneY = (plane: Plane, x: number, z: number): Vec => [x, (plane[3] - plane[0] * x - plane[2] * z) / plane[1], z];

/** The kit's cassette courses (hull frame), one gameplay zone per bank. */
export const UA_KONTAKT1_COURSES: readonly Course[] = Object.freeze([
  { name: 'ua_m1a1_x_turret_era_R', owner: 'turret', plane: RIGHT_SIDE, origin: onPlaneX(RIGHT_SIDE, 1.96, -.75), cols: 7, rows: 3, pitchU: .272, pitchV: .152 },
  { name: 'ua_m1a1_x_turret_era_L', owner: 'turret', plane: LEFT_SIDE, origin: onPlaneX(LEFT_SIDE, 1.96, -.75), cols: 7, rows: 3, pitchU: .272, pitchV: .152 },
  { name: 'ua_m1a1_x_turret_cheek_era_R', owner: 'turret', plane: RIGHT_CHEEK, origin: onPlaneZ(RIGHT_CHEEK, .79, 1.95), cols: 4, rows: 3, pitchU: .265, pitchV: .152 },
  { name: 'ua_m1a1_x_turret_cheek_era_L', owner: 'turret', plane: LEFT_CHEEK, origin: onPlaneZ(LEFT_CHEEK, -.90, 1.95), cols: 4, rows: 3, pitchU: .265, pitchV: .152 },
  { name: 'ua_m1a1_x_glacis_era_R', owner: 'hull', plane: GLACIS, origin: onPlaneY(GLACIS, .59, 3.05), cols: 3, rows: 5, pitchU: .300, pitchV: .152 },
  { name: 'ua_m1a1_x_glacis_era_L', owner: 'hull', plane: GLACIS, origin: onPlaneY(GLACIS, -.59, 3.05), cols: 3, rows: 5, pitchU: .300, pitchV: .152 },
]);

/** One outward-wound quad centred on `center` (hull frame) spanning ±halfU/±halfV in the
 * plane frame; (v1 - v0) x (v3 - v0) is the plane normal, so the tracer sees its front face. */
function bankQuad(plane: Plane, center: Vec, halfU: number, halfV: number, owner: 'hull' | 'turret'): Vec3Tuple[] {
  const { u, v } = planeFrame(plane);
  const seat = (p: Vec): Vec3Tuple => owner === 'turret' ? sub(p, [TURRET[0], TURRET[1], TURRET[2]]) : p;
  return [
    seat(add(center, scale(u, -halfU), scale(v, -halfV))),
    seat(add(center, scale(u, halfU), scale(v, -halfV))),
    seat(add(center, scale(u, halfU), scale(v, halfV))),
    seat(add(center, scale(u, -halfU), scale(v, halfV))),
  ];
}

function eraPlate(name: string, verts: Vec3Tuple[], physicalMm: number, era: ArmorPlate['era']): ArmorPlate {
  return { name, verts, physicalMm, keMm: physicalMm, ceMm: physicalMm, kind: 'era', era, moduleLink: null, gunFollow: false };
}

/** The bank's collision face lies on the cassettes' outer faces. */
export function kontakt1BankPlate(course: Course): ArmorPlate {
  const { n } = planeFrame(course.plane);
  const center = add(course.origin, scale(n, BRICK.lift + BRICK.t));
  const halfU = ((course.cols - 1) * course.pitchU + BRICK.w) / 2;
  const halfV = ((course.rows - 1) * course.pitchV + BRICK.h) / 2;
  return eraPlate(course.name, bankQuad(course.plane, center, halfU, halfV, course.owner), 12, UA_KONTAKT1_ERA);
}

export function aratSkirtPlate(side: -1 | 1): ArmorPlate {
  const plane: Plane = [side, 0, 0, UA_SKIRT_BANK.outerX];
  const center: Vec = [side * UA_SKIRT_BANK.outerX, UA_SKIRT_BANK.y, UA_SKIRT_BANK.z];
  return eraPlate(`ua_m1a1_x_skirt_era_${side > 0 ? 'R' : 'L'}`,
    bankQuad(plane, center, UA_SKIRT_BANK.halfLength, UA_SKIRT_BANK.halfHeight, 'hull'), 15, UA_ARAT_ERA);
}

export const UA_ERA_PLATE_NAMES = Object.freeze([
  ...UA_KONTAKT1_COURSES.map((course) => course.name), 'ua_m1a1_x_skirt_era_L', 'ua_m1a1_x_skirt_era_R',
]);

/** Add the eight kit zones to a fresh ua_m1a1_x armor clone; an already-kitted record is
 * accepted unchanged, a partial one is refused. */
export function applyAbramsSourceXUkraineEraArmor(armor: ArmorEnvelope): void {
  const present = [...armor.hullPlates, ...armor.turretPlates].filter((plate) => UA_ERA_PLATE_NAMES.includes(plate.name));
  if (present.length === UA_ERA_PLATE_NAMES.length) return;
  if (present.length) throw new Error('Abrams UA kit ERA zones are partially registered');
  if ([...armor.hullPlates, ...armor.turretPlates].some((plate) => plate.kind === 'era')) {
    throw new Error('Abrams UA kit ERA expects a donor record without reactive zones');
  }
  for (const course of UA_KONTAKT1_COURSES) {
    (course.owner === 'turret' ? armor.turretPlates : armor.hullPlates).push(kontakt1BankPlate(course));
  }
  armor.hullPlates.push(aratSkirtPlate(-1), aratSkirtPlate(1));
}
