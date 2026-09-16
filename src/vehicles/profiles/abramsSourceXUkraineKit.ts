// M1A2 Abrams UA field kit (owner 2026-09-15: "change it to m1a2 UA and make it have a bunch
// of add ons and attachments like source material online"). The Ukrainian Abrams in the
// field carry Soviet Kontakt-1 reactive bricks on the turret cheeks, turret flanks and the
// glacis, ARAT-style cassettes on the skirts, a welded anti-drone cage over the whole turret
// roof, a slat screen behind the bustle rack, EW jammer masts and extra stowage. Every part is
// laid on the measured source planes of the X study (abramsSourceX.ts), in the hull frame,
// and re-seated into the turret frame where the turret owns it. The cassette courses are visual
// ERA clusters bound to the gameplay zones of abramsSourceXUkraineEraArmor.ts (one depletable
// bank per course); the cage, slats, jammers and stowage are passive.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { roundMember, type XYZ } from './abramsSourceXGeometry.ts';
import { ABRAMS_SOURCE_X_FRAME } from '../abramsSourceXDatums.ts';

/** Outward unit normal and offset: a point p lies on the plane when n·p = d. */
type Plane = readonly [number, number, number, number];
type Owner = 'hull' | 'turret';

const { box, cylY, cylX } = KIT;
const TURRET = ABRAMS_SOURCE_X_FRAME.turret;
/** Kontakt-1 4S20 cassette: 251.9 x 131.9 x 70 mm. */
const BRICK = Object.freeze({ w: .252, h: .132, t: .070 });
const ROOF_Y = 2.360795;
const CAGE_Y = ROOF_Y + .55;

// Measured source planes (hull frame) from buildTurretArmor / frontDeck.
const RIGHT_SIDE: Plane = [.861624, .507547, 0, 2.159152];
const LEFT_SIDE: Plane = [-.86164, .507521, 0, 2.276882];
const RIGHT_CHEEK: Plane = [.510997, .499844, .699312, 2.674797];
const LEFT_CHEEK: Plane = [-.363382, .515021, .776342, 2.888263];
// frontDeck(): y = 1.64504 - 0.12582 z on the upper glacis (z 1.72 .. 3.91).
const GLACIS: Plane = [0, .99217, .12483, 1.63216];

function tag(geometry: THREE.BufferGeometry, part: string): THREE.BufferGeometry {
  geometry.userData.uaKit = part;
  return geometry;
}

function seat(owner: Owner, p: XYZ): XYZ {
  return owner === 'turret' ? [p[0] - TURRET[0], p[1] - TURRET[1], p[2] - TURRET[2]] : p;
}

function put(P: TankBuilderPort, owner: Owner, bucket: string, part: string,
  geometry: THREE.BufferGeometry, center: XYZ, equipment = true): void {
  const c = seat(owner, center);
  const g = tag(geometry, part);
  if (equipment) P.addEquipment(bucket, g, c[0], c[1], c[2]);
  else P.add(bucket, g, c[0], c[1], c[2]);
}

/** Orthonormal frame on a plane: u horizontal along the plane, v up the plane, n outward. */
function planeFrame(plane: Plane): { u: THREE.Vector3; v: THREE.Vector3; n: THREE.Vector3 } {
  const n = new THREE.Vector3(plane[0], plane[1], plane[2]).normalize();
  const u = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  return { u, v, n };
}

/** Solve the plane for the missing coordinate so an authored (y, z) or (x, y) point sits on it. */
function onPlaneX(plane: Plane, y: number, z: number): XYZ {
  return [(plane[3] - plane[1] * y - plane[2] * z) / plane[0], y, z];
}
function onPlaneZ(plane: Plane, x: number, y: number): XYZ {
  return [x, y, (plane[3] - plane[0] * x - plane[1] * y) / plane[2]];
}
function onPlaneY(plane: Plane, x: number, z: number): XYZ {
  return [x, (plane[3] - plane[0] * x - plane[2] * z) / plane[1], z];
}

interface Course {
  owner: Owner;
  plane: Plane;
  origin: XYZ;
  cols: number;
  rows: number;
  pitchU: number;
  pitchV: number;
  part: string;
}

interface Rim { owner: Owner; part: string; geometry: THREE.BufferGeometry; center: XYZ }

/** A rectangular array of Kontakt-1 cassettes lying flat on a measured plane. The bodies are
 * emitted inside the caller's visual ERA cluster; the dark backing rims that draw the seams
 * between cassettes are collected and emitted by the caller outside the cluster. */
function brickCourse(P: TankBuilderPort, course: Course, rims: Rim[]): void {
  const { u, v, n } = planeFrame(course.plane);
  const basis = new THREE.Matrix4().makeBasis(u, v, n);
  const paint = course.owner === 'turret' ? 'turret' : 'hull';
  for (let i = 0; i < course.cols; i++) {
    for (let j = 0; j < course.rows; j++) {
      const du = (i - (course.cols - 1) / 2) * course.pitchU;
      const dv = (j - (course.rows - 1) / 2) * course.pitchV;
      const foot = new THREE.Vector3(...course.origin).addScaledVector(u, du).addScaledVector(v, dv);
      const center = foot.clone().addScaledVector(n, .010 + BRICK.t / 2);
      const body = box(BRICK.w, BRICK.h, BRICK.t).applyMatrix4(basis);
      put(P, course.owner, paint, course.part, body, center.toArray() as XYZ, false);
      // an oversize dark backing plate under each cassette reads as the seam line around it
      const rim = box(BRICK.w + .022, BRICK.h + .022, .008).applyMatrix4(basis);
      rims.push({ owner: course.owner, part: course.part, geometry: rim,
        center: foot.clone().addScaledVector(n, .006).toArray() as XYZ });
    }
  }
}

function emitRims(P: TankBuilderPort, rims: Rim[]): void {
  for (const rim of rims) {
    put(P, rim.owner, rim.owner === 'turret' ? 'turretDark' : 'hullDark', rim.part, rim.geometry, rim.center);
  }
}

function turretBricks(P: TankBuilderPort): void {
  const rims: Rim[] = [];
  P.visualEraCluster('ua-m1a2-k1-turret-era', 'turret', () => {
    // flanks: three courses between the loader's hatch line and the bustle, on the inclined walls
    brickCourse(P, { owner: 'turret', plane: RIGHT_SIDE, origin: onPlaneX(RIGHT_SIDE, 1.96, -.75),
      cols: 7, rows: 3, pitchU: .272, pitchV: .152, part: 'turret-brick' }, rims);
    brickCourse(P, { owner: 'turret', plane: LEFT_SIDE, origin: onPlaneX(LEFT_SIDE, 1.96, -.75),
      cols: 7, rows: 3, pitchU: .272, pitchV: .152, part: 'turret-brick' }, rims);
    // cheeks: the unequal composite fronts each take four cassettes per course
    brickCourse(P, { owner: 'turret', plane: RIGHT_CHEEK, origin: onPlaneZ(RIGHT_CHEEK, .79, 1.95),
      cols: 4, rows: 3, pitchU: .265, pitchV: .152, part: 'turret-brick' }, rims);
    brickCourse(P, { owner: 'turret', plane: LEFT_CHEEK, origin: onPlaneZ(LEFT_CHEEK, -.90, 1.95),
      cols: 4, rows: 3, pitchU: .265, pitchV: .152, part: 'turret-brick' }, rims);
  });
  emitRims(P, rims);
}

function glacisBricks(P: TankBuilderPort): void {
  const rims: Rim[] = [];
  P.visualEraCluster('ua-m1a2-k1-glacis-era', 'hull', () => {
    // two banks either side of the towing eyes, ahead of the driver's hatch
    for (const side of [-1, 1]) {
      brickCourse(P, { owner: 'hull', plane: GLACIS, origin: onPlaneY(GLACIS, side * .59, 3.05),
        cols: 3, rows: 5, pitchU: .300, pitchV: .152, part: 'glacis-brick' }, rims);
    }
  });
  emitRims(P, rims);
}

/** ARAT-style cassettes on the eight receiving skirt plates, as the TUSK study wears them. */
function skirtCassettes(P: TankBuilderPort): void {
  P.visualEraCluster('ua-m1a2-skirt-era', 'hull', () => {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const z = 2.655755 - i * .666455;
        put(P, 'hull', 'hull', 'skirt-cassette', box(.19032, .750506, .65729),
          [side * 1.93636, .990852, z], false);
        for (const dz of [-.275, .275]) {
          put(P, 'hull', 'hullDark', 'skirt-cassette-stud', cylX(.016, .025, 6), [side * 2.019, 1.358, z + dz]);
        }
      }
    }
  });
}

/** Welded anti-drone cage: eight posts, a tube frame and a rod lattice over the whole roof. */
function roofCage(P: TankBuilderPort): void {
  const x0 = -1.15, x1 = 1.02, z0 = -2.15, z1 = 1.15;
  const rod = .012;
  const posts: XYZ[] = [[x0, 0, z0], [x1, 0, z0], [x0, 0, z1], [x1, 0, z1],
    [x0, 0, (z0 + z1) / 2], [x1, 0, (z0 + z1) / 2], [(x0 + x1) / 2, 0, z0], [(x0 + x1) / 2, 0, z1]];
  for (const [x, , z] of posts) {
    put(P, 'turret', 'turretDark', 'cage-post',
      roundMember(seat('turret', [x, ROOF_Y + .01, z]), seat('turret', [x, CAGE_Y, z]), .022), [0, 0, 0]);
  }
  const corners: XYZ[] = [[x0, CAGE_Y, z0], [x1, CAGE_Y, z0], [x1, CAGE_Y, z1], [x0, CAGE_Y, z1]];
  for (let k = 0; k < 4; k++) {
    put(P, 'turret', 'turretDark', 'cage-frame',
      roundMember(seat('turret', corners[k]), seat('turret', corners[(k + 1) % 4]), .020), [0, 0, 0]);
  }
  // lattice: longitudinal rods every 164 mm, transverse rods every 157 mm
  for (let i = 0; i <= 12; i++) {
    const x = x0 + .1 + i * ((x1 - x0 - .2) / 12);
    put(P, 'turret', 'turretDark', 'cage-rod', box(rod, rod, z1 - z0), [x, CAGE_Y + .012, (z0 + z1) / 2]);
  }
  for (let j = 0; j <= 20; j++) {
    const z = z0 + .08 + j * ((z1 - z0 - .16) / 20);
    put(P, 'turret', 'turretDark', 'cage-rod', box(x1 - x0, rod, rod), [(x0 + x1) / 2, CAGE_Y + .024, z]);
  }
}

/** Slat screen hung behind the bustle rack: vertical bars on two rails and two brackets. */
function bustleSlats(P: TankBuilderPort): void {
  const z = -3.42, x0 = -1.05, x1 = .95, y0 = 1.85, y1 = 2.55;
  for (let i = 0; i <= 26; i++) {
    const x = x0 + .02 + i * ((x1 - x0 - .04) / 26);
    put(P, 'turret', 'turretDark', 'slat', box(.020, y1 - y0, .004), [x, (y0 + y1) / 2, z]);
  }
  for (const y of [y0 + .01, y1 - .01]) {
    put(P, 'turret', 'turretDark', 'slat-rail', box(x1 - x0, .022, .022), [(x0 + x1) / 2, y, z]);
  }
  for (const x of [-.85, .78]) {
    put(P, 'turret', 'turretDark', 'slat-bracket',
      roundMember(seat('turret', [x, 2.20, z]), seat('turret', [x, 2.20, -3.15]), .014), [0, 0, 0]);
  }
}

/** EW jammer masts and a dome jammer on the roof; the masts rise through the cage. */
function jammers(P: TankBuilderPort): void {
  for (const [x, z] of [[-.55, -1.35], [.45, -1.55]]) {
    put(P, 'turret', 'turretDark', 'jammer', box(.12, .14, .12), [x, ROOF_Y + .07, z]);
    put(P, 'turret', 'turretDark', 'jammer', box(.020, .85, .020), [x, ROOF_Y + .14 + .425, z]);
    put(P, 'turret', 'turretDetail', 'jammer', cylY(.028, .028, .11, 12), [x, ROOF_Y + .14 + .85 + .05, z]);
  }
  put(P, 'turret', 'turretDetail', 'jammer', cylY(.10, .10, .16, 16), [0, ROOF_Y + .08, -2.05]);
}

/** Crates under the cage, a camouflage-net roll across the bustle, tarp rolls low on the deck. */
function stowage(P: TankBuilderPort): void {
  for (const [x, z] of [[-.72, -1.80], [.62, -1.85]]) {
    put(P, 'turret', 'turretDetail', 'crate', box(.46, .30, .34), [x, ROOF_Y + .15, z]);
    put(P, 'turret', 'turretDark', 'crate', box(.48, .022, .36), [x, ROOF_Y + .30, z]);
  }
  // camouflage net rolled and lashed across the top of the bustle rack
  const net = cylY(.15, .15, 2.0, 14).rotateZ(Math.PI / 2);
  put(P, 'turret', 'turretDetail', 'net-roll', net, [-.05, 2.62, -2.72]);
  for (const x of [-.7, .6]) {
    put(P, 'turret', 'turretDark', 'net-strap', box(.025, .32, .32), [x, 2.62, -2.72]);
  }
  // low tarp rolls and a stack of spare track shoes on the rear deck, under the bustle sweep
  for (const side of [-1, 1]) {
    const roll = cylY(.10, .10, 1.10, 12).rotateX(Math.PI / 2);
    put(P, 'hull', 'hullRubber', 'tarp-roll', roll, [side * .82, 1.694 + .10, -3.15]);
  }
  put(P, 'hull', 'hullDark', 'track-shoes', box(.56, .13, .34), [0, 1.694 + .065, -3.55]);
}

export function buildAbramsSourceXUkraineKit(P: TankBuilderPort): void {
  turretBricks(P);
  glacisBricks(P);
  skirtCassettes(P);
  roofCage(P);
  bustleSlats(P);
  jammers(P);
  stowage(P);
}
