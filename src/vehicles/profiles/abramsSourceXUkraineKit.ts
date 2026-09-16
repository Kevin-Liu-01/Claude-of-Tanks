// M1A2 Abrams UA field kit (owner 2026-09-15: "change it to m1a2 UA and make it have a bunch
// of add ons and attachments like source material online"). The Ukrainian Abrams in the
// field carry Soviet Kontakt-1 reactive bricks on the turret cheeks, turret flanks and the
// glacis, ARAT-style cassettes on the skirts, a welded anti-drone cage over the whole turret
// roof, a slat screen behind the bustle rack, EW jammer masts and extra stowage. Every part is
// laid on the measured source planes of the X study (abramsSourceX.ts), in the hull frame,
// and re-seated into the turret frame where the turret owns it. The cassette courses are visual
// ERA clusters bound to the gameplay zones of abramsSourceXUkraineEraArmor.ts (one depletable
// bank per course); the cage, slats, jammers and stowage are passive.
// Cage rework (owner 2026-09-15, evening: "make its cage components much better and more properly
// attached to the tank instead of floating"): the posts stand on the real roof surface with
// bolted base plates, the frame follows the roof down toward the mantlet, mesh walls hang on
// the flanks and the rear, and struts tie the cage to the bustle rack.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { roundMember, type XYZ } from './abramsSourceXGeometry.ts';
import {
  GLACIS, LEFT_CHEEK, LEFT_SIDE, RIGHT_CHEEK, RIGHT_SIDE, ROOF_Y, type KitOwner as Owner, type Plane,
  onPlaneX, onPlaneY, onPlaneZ, planeFrame, putKit, seatKit, turretRoofY, turretSideX,
} from './abramsSourceXKitBase.ts';

const { box, cylY, cylX } = KIT;
/** Kontakt-1 4S20 cassette: 251.9 x 131.9 x 70 mm. */
const BRICK = Object.freeze({ w: .252, h: .132, t: .070 });

const seat = (owner: Owner, p: XYZ): XYZ => seatKit(owner, p);
function put(P: TankBuilderPort, owner: Owner, bucket: string, part: string,
  geometry: THREE.BufferGeometry, center: XYZ, equipment = true): void {
  putKit(P, owner, bucket, 'uaKit', part, geometry, center, equipment);
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

/** Welded anti-drone cage over the turret: posts on the real roof surface with bolted base plates,
 * a tube frame that follows the roof down toward the mantlet, a rod lattice welded into the frame,
 * mesh walls hanging on both flanks and the rear, and struts tying the cage to the bustle rack. */
function roofCage(P: TankBuilderPort): void {
  const CAGE_Y = ROOF_Y + 1.00; // 3.36 m: clears the CROWS-LP head (3.15 m); the jammer masts rise through
  const DROP = .20; // the forward bay follows the roof down toward the mantlet
  const zRear = -2.22, zBend = .30, zFront = 1.20;
  const xR = 1.30, xL = -1.40; // the frame overhangs the inclined walls (roof edges 1.115 / -1.252)
  const rod = .006;
  const frameY = (z: number): number => z <= zBend ? CAGE_Y : CAGE_Y - DROP * (z - zBend) / (zFront - zBend);
  // members are authored in the hull frame; put() seats the whole geometry once (the first cage seated the
  // endpoints AND the centre, which sank every post and tube 1.5 m into the hull and left the lattice floating)
  const member = (part: string, a: XYZ, b: XYZ, r: number): void =>
    put(P, 'turret', 'turretOpenLatticeDark', part, roundMember(a, b, r), [0, 0, 0]);
  // perimeter frame with a bend cross tube and a mid cross tube
  const ring: XYZ[] = [[xL, CAGE_Y, zRear], [xR, CAGE_Y, zRear], [xR, CAGE_Y, zBend], [xR, CAGE_Y - DROP, zFront],
    [xL, CAGE_Y - DROP, zFront], [xL, CAGE_Y, zBend]];
  for (let k = 0; k < ring.length; k++) member('cage-frame', ring[k], ring[(k + 1) % ring.length], .020);
  member('cage-frame', [xL, CAGE_Y, zBend], [xR, CAGE_Y, zBend], .020);
  member('cage-frame', [xL, CAGE_Y, -1.00], [xR, CAGE_Y, -1.00], .020);
  // posts stand on the roof inboard of the frame: base plate, four bolts, post, outrigger arm
  const feet: readonly (readonly [number, number])[] = [
    [-1.10, -2.05], [-1.14, -.95], [-1.10, .30], [-.95, 1.05],
    [.98, -2.05], [1.00, -.95], [.98, .30], [.85, 1.05],
  ];
  for (const [x, z] of feet) {
    const foot = turretRoofY(x, z), top = frameY(z);
    put(P, 'turret', 'turretDark', 'cage-foot', box(.14, .010, .14), [x, foot + .005, z]);
    for (const dx of [-.05, .05]) for (const dz of [-.05, .05]) {
      put(P, 'turret', 'turretDark', 'cage-bolt', cylY(.011, .011, .012, 8), [x + dx, foot + .016, z + dz]);
    }
    member('cage-post', [x, foot + .010, z], [x, top - .010, z], .024);
    member('cage-arm', [x, top, z], [x < 0 ? xL : xR, top, z], .018);
  }
  // diagonal braces between neighbouring posts on each flank, an X across the rear bay
  for (const side of [0, 4]) {
    for (let i = side; i < side + 3; i++) {
      const [xa, za] = feet[i], [xb, zb] = feet[i + 1];
      member('cage-brace', [xa, frameY(za) - .06, za], [xb, turretRoofY(xb, zb) + .16, zb], .014);
    }
  }
  member('cage-brace', [-1.10, frameY(-2.05) - .06, -2.05], [.98, turretRoofY(.98, -2.05) + .16, -2.05], .014);
  member('cage-brace', [.98, frameY(-2.05) - .06, -2.05], [-1.10, turretRoofY(-1.10, -2.05) + .16, -2.05], .014);
  // lattice: longitudinal rods bend with the frame, transverse rods sit on top of them
  for (let x = xL + .10; x <= xR - .10 + 1e-6; x += .155) {
    member('cage-rod', [x, CAGE_Y + .008, zRear + .01], [x, CAGE_Y + .008, zBend], rod);
    member('cage-rod', [x, CAGE_Y + .008, zBend], [x, CAGE_Y - DROP + .008, zFront - .01], rod);
  }
  for (let z = zRear + .08; z <= zFront - .08 + 1e-6; z += .155) {
    member('cage-rod', [xL + .02, frameY(z) + .016, z], [xR - .02, frameY(z) + .016, z], rod);
  }
  // mesh walls: flank rods from the frame edge down to a rail just off the wall, above the K-1 bricks
  for (const side of [-1, 1] as const) {
    const xFrame = side > 0 ? xR : xL;
    const railX = (y: number): number => turretSideX(side, y) + side * .07;
    for (let z = zRear + .06; z <= zFront - .06 + 1e-6; z += .155) {
      member('cage-mesh', [xFrame, frameY(z) - .012, z], [railX(2.20), 2.20, z], rod);
    }
    for (const y of [2.20, 2.75]) member('cage-rail', [railX(y), y, zRear + .04], [railX(y), y, zFront - .04], .010);
  }
  // rear wall down to a rail just behind the turret rear face, clear of the radio mast
  const zWall = zRear - .04;
  for (let x = xL + .10; x <= xR - .10 + 1e-6; x += .155) member('cage-mesh', [x, CAGE_Y - .012, zRear], [x, 2.45, zWall], rod);
  member('cage-rail', [xL + .05, 2.45, zWall], [xR - .05, 2.45, zWall], .010);
  // struts tie the cage to the bustle rack's top course
  member('cage-strut', [-1.10, CAGE_Y - .02, zRear], [-1.05, 2.28926, -2.7842], .016);
  member('cage-strut', [.98, CAGE_Y - .02, zRear], [.95, 2.28926, -2.7842], .016);
}

/** Slat screen hung behind the bustle rack: vertical bars on two rails, bracketed to the rack's third course.
 * Open lattice like the cage: exterior air for the body rasters. */
function bustleSlats(P: TankBuilderPort): void {
  const z = -2.96, x0 = -1.05, x1 = .95, y0 = 1.85, y1 = 2.55;
  for (let i = 0; i <= 26; i++) {
    const x = x0 + .02 + i * ((x1 - x0 - .04) / 26);
    put(P, 'turret', 'turretOpenLatticeDark', 'slat', box(.020, y1 - y0, .004), [x, (y0 + y1) / 2, z]);
  }
  for (const y of [y0 + .01, y1 - .01]) {
    put(P, 'turret', 'turretOpenLatticeDark', 'slat-rail', box(x1 - x0, .022, .022), [(x0 + x1) / 2, y, z]);
  }
  for (const x of [-.85, .78]) {
    put(P, 'turret', 'turretOpenLatticeDark', 'slat-bracket', roundMember([x, 2.159575, z], [x, 2.159575, -2.7842], .014), [0, 0, 0]);
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
  // camouflage net rolled and lashed across the top course of the bustle rack
  const net = cylY(.15, .15, 2.0, 14).rotateZ(Math.PI / 2);
  put(P, 'turret', 'turretDetail', 'net-roll', net, [-.05, 2.28926 + .15, -2.62]);
  for (const x of [-.7, .6]) {
    put(P, 'turret', 'turretDark', 'net-strap', box(.025, .32, .32), [x, 2.28926 + .15, -2.62]);
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
