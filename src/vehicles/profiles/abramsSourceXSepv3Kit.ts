// M1A2 Abrams SEPv3 field configuration (owner 2026-09-15: "make the m1a2 sepv3 look much better and
// much more detailed. it needs to be better than the sepv2 in terms of detail"). The M1A2C as fielded
// from 2020: Trophy HV active protection — a launcher assembly bracketed to each inclined turret flank,
// four radar panels at the turret corners and two counterweights hung on the bustle rack extension —
// the under-armour auxiliary power unit on the left rear sponson with its louvred exhaust, the ammunition
// data link and Trophy electronics on the roof, and the crew's stowage on the fenders. Every part is
// laid in the hull frame on the study's measured planes and re-seated into the turret frame where the
// turret owns it (abramsSourceXKitBase.ts). Passive detail: the gameplay armour record is unchanged.
// The study's urban set (rectangular ARAT on skirts and turret, belly add-on, counter-assault mount,
// loader shields — owner 2026-09-16 "add all the side turret and sideskirt armor and attachments")
// comes from the hull/equipment modules; the rear ARAT courses leave three stations for each launcher.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { roundMember, type XYZ } from './abramsSourceXGeometry.ts';
import {
  LEFT_CHEEK, LEFT_SIDE, RIGHT_CHEEK, RIGHT_SIDE, type KitOwner as Owner, type Plane,
  onPlaneX, onPlaneZ, planeFrame, putKit, seatKit, turretRoofY, turretSideX,
} from './abramsSourceXKitBase.ts';

const { box, cylY, cylX, cylZ } = KIT;
const seat = (owner: Owner, p: XYZ): XYZ => seatKit(owner, p);
function put(P: TankBuilderPort, owner: Owner, bucket: string, part: string,
  geometry: THREE.BufferGeometry, center: XYZ, equipment = true): void {
  putKit(P, owner, bucket, 'sepv3Kit', part, geometry, center, equipment);
}
/** Round member between two hull-frame points; put() seats the geometry once. */
const member = (P: TankBuilderPort, owner: Owner, bucket: string, part: string, a: XYZ, b: XYZ, r: number): void =>
  put(P, owner, bucket, part, roundMember(a, b, r), [0, 0, 0]);
const add3 = (p: XYZ, v: THREE.Vector3, s: number): XYZ => [p[0] + v.x * s, p[1] + v.y * s, p[2] + v.z * s];

/** Trophy HV launcher assembly on one inclined turret flank: wall plate with bolts, four arms, the
 * launcher body with its armoured lid, dark countermeasure face and two MEFP muzzles, a bumper bar and
 * the cable run to the roof. Outer face at |x| 1.79 m, inside the 1.83 m skirt width. */
function trophyLauncher(P: TankBuilderPort, side: -1 | 1): void {
  const plane: Plane = side > 0 ? RIGHT_SIDE : LEFT_SIDE;
  const { u, v, n } = planeFrame(plane);
  const basis = new THREE.Matrix4().makeBasis(u, v, n);
  const zc = -1.15, yc = 2.125, L = .78, H = .35, D = .29, outer = 1.79;
  const xc = side * (outer - D / 2);
  const s = (x: number): number => side * x;
  // wall plate on the measured side plane, four bolts through it
  const foot = onPlaneX(plane, 2.05, zc);
  put(P, 'turret', 'turret', 'trophy-mount', box(.90, .34, .04).applyMatrix4(basis), add3(foot, n, .020));
  for (const du of [-.40, .40]) for (const dv of [-.13, .13]) {
    put(P, 'turret', 'turretDark', 'trophy-bolt', cylZ(.012, .016, 8).applyMatrix4(basis),
      add3(add3(add3(foot, u, du), v, dv), n, .046));
  }
  // arms from the wall to the box's inner face at both ends, top and bottom
  for (const dz of [-.30, .30]) for (const y of [1.99, 2.26]) {
    const wall = Math.abs(turretSideX(side, y)) + .02, inner = outer - D;
    const len = Math.max(.05, inner - wall);
    put(P, 'turret', 'turretDark', 'trophy-arm', box(len, .05, .06), [s(inner - len / 2), y, zc + dz]);
  }
  // launcher body, armoured lid, countermeasure face and muzzles
  put(P, 'turret', 'turret', 'trophy-launcher', box(D, H, L), [xc, yc, zc]);
  put(P, 'turret', 'turretDark', 'trophy-lid', box(D + .04, .018, L + .04), [xc, yc + H / 2 + .009, zc]);
  put(P, 'turret', 'turretDark', 'trophy-face', box(.012, H - .08, L - .10), [s(outer + .006), yc, zc]);
  for (const dz of [-.18, .18]) {
    put(P, 'turret', 'turretDark', 'trophy-muzzle', cylX(.058, .030, 12), [s(outer + .010), yc, zc + dz]);
    put(P, 'turret', 'turretDetail', 'trophy-muzzle', cylX(.040, .034, 12), [s(outer + .012), yc, zc + dz]);
  }
  // bumper bar along the outer top edge and the cable run to the roof
  member(P, 'turret', 'turretDark', 'trophy-bumper', [s(outer - .01), yc + H / 2 + .05, zc - L / 2 + .04],
    [s(outer - .01), yc + H / 2 + .05, zc + L / 2 - .04], .012);
  for (const dz of [-L / 2 + .06, L / 2 - .06]) {
    member(P, 'turret', 'turretDark', 'trophy-bumper', [s(outer - .01), yc + H / 2 + .05, zc + dz], [s(outer - .01), yc + H / 2 + .012, zc + dz], .010);
  }
  const roofZ = zc - .45, roofX = s(1.02);
  member(P, 'turret', 'turretDark', 'trophy-cable', [s(outer - D + .04), yc + H / 2 + .02, roofZ],
    [roofX, turretRoofY(roofX, roofZ) + .03, roofZ], .016);
}

/** Four Trophy radar panels: a forward pair flush on the composite cheeks, a rear pair on posts at the
 * rack's rear corners, facing rearward-outward. */
function trophyRadars(P: TankBuilderPort): void {
  for (const side of [-1, 1] as const) {
    const cheek: Plane = side > 0 ? RIGHT_CHEEK : LEFT_CHEEK;
    const { n } = planeFrame(cheek);
    const basis = new THREE.Matrix4().makeBasis(...Object.values(planeFrame(cheek)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
    const foot = onPlaneZ(cheek, side * 1.02, 2.12);
    put(P, 'turret', 'turretDark', 'trophy-radar-mount', box(.18, .16, .026).applyMatrix4(basis), add3(foot, n, .013));
    put(P, 'turret', 'turret', 'trophy-radar', box(.34, .30, .07).applyMatrix4(basis), add3(foot, n, .026 + .035));
    put(P, 'turret', 'turretDark', 'trophy-radar-face', box(.28, .24, .008).applyMatrix4(basis), add3(foot, n, .026 + .07 + .004));
    // rear pair above the rack's top course
    const x = side * 1.42, z = -2.70, yaw = side * 3 * Math.PI / 4;
    member(P, 'turret', 'turretDark', 'trophy-radar-mount', [x, 2.28926, z], [x, 2.36, z], .020);
    put(P, 'turret', 'turret', 'trophy-radar', box(.34, .30, .07).rotateY(yaw), [x, 2.36 + .15, z]);
    put(P, 'turret', 'turretDark', 'trophy-radar-face', box(.28, .24, .008).translate(0, 0, .039).rotateY(yaw), [x, 2.36 + .15, z]);
  }
}

/** The two Trophy counterweights hung on the bustle rack extension's rear stiles. */
function trophyCounterweights(P: TankBuilderPort): void {
  for (const side of [-1, 1] as const) {
    const xc = side * .78, yc = 2.10, zc = -3.50;
    const stile = side > 0 ? .96195 : -1.1008;
    put(P, 'turret', 'turret', 'trophy-counterweight', box(.92, .52, .24), [xc, yc, zc]);
    put(P, 'turret', 'turretDark', 'trophy-cw-face', box(.90, .50, .008), [xc, yc, zc - .124]);
    for (const y of [1.98, 2.24]) put(P, 'turret', 'turretDark', 'trophy-cw-arm', box(.05, .05, .09), [stile, y, -3.335]);
    for (const dx of [-.28, .28]) put(P, 'turret', 'turretDark', 'trophy-cw-strap', box(.03, .54, .26), [xc + dx, yc, zc]);
    for (const dx of [-.30, .30]) put(P, 'turret', 'turretDark', 'trophy-cw-eye', box(.06, .05, .02), [xc + dx, yc + .285, zc]);
  }
}

/** Under-armour auxiliary power unit on the left rear sponson: armoured box on the fender, louvred
 * exhaust on top, exhaust stack, access door with hinges and latches, lifting eyes, bolt row and a
 * rear grille. Top at 1.80 m, under the rack floor (1.887 m) so the turret sweeps clear. */
function auxiliaryPowerUnit(P: TankBuilderPort): void {
  const x0 = -1.78, x1 = -1.16, z0 = -3.55, z1 = -2.25, y0 = 1.405, y1 = 1.80;
  const xc = (x0 + x1) / 2, zc = (z0 + z1) / 2;
  put(P, 'hull', 'hull', 'uaapu-box', box(x1 - x0, y1 - y0, z1 - z0), [xc, (y0 + y1) / 2, zc]);
  for (let i = 0; i < 9; i++) {
    put(P, 'hull', 'hullDark', 'uaapu-louver', box(.44, .012, .030).rotateX(.55), [xc, y1 + .012, z0 + .12 + i * .062]);
  }
  put(P, 'hull', 'hullDark', 'uaapu-stack', cylY(.045, .045, .09, 12), [xc + .12, y1 + .045, z1 - .16]);
  put(P, 'hull', 'hullDark', 'uaapu-door', box(.008, .30, .70), [x0 - .004, 1.60, zc + .10]);
  for (const dz of [-.30, .30]) put(P, 'hull', 'hullDark', 'uaapu-hinge', box(.020, .06, .03), [x0 - .010, 1.60, zc + .10 + dz]);
  for (const dy of [-.09, .09]) put(P, 'hull', 'hullDark', 'uaapu-latch', cylX(.015, .020, 8), [x0 - .014, 1.60 + dy, zc + .10 + .30]);
  for (const dz of [-.45, .45]) put(P, 'hull', 'hullDark', 'uaapu-eye', box(.05, .04, .02), [xc - .18, y1 + .02, zc + dz]);
  for (let i = 0; i < 8; i++) put(P, 'hull', 'hullDark', 'uaapu-bolt', cylY(.009, .009, .008, 6), [x0 + .035, y1 + .004, z0 + .10 + i * .157]);
  put(P, 'hull', 'hullDark', 'uaapu-grille', box(.44, .20, .008), [xc, 1.62, z0 - .004]);
  for (let i = 0; i < 4; i++) put(P, 'hull', 'hullDetail', 'uaapu-grille-slat', box(.42, .012, .012), [xc, 1.55 + i * .045, z0 - .010]);
}

/** Right rear sponson stowage box on the service cover, lid and latches. */
function sponsonBox(P: TankBuilderPort): void {
  const yc = 1.709765 + .075;
  put(P, 'hull', 'hull', 'sponson-box', box(.50, .15, .66), [1.34, yc, -2.98]);
  put(P, 'hull', 'hullDark', 'sponson-box-lid', box(.52, .012, .68), [1.34, yc + .081, -2.98]);
  for (const dz of [-.22, .22]) put(P, 'hull', 'hullDark', 'sponson-box-latch', cylX(.012, .02, 8), [1.60, yc, -2.98 + dz]);
}

/** Roof electronics: Trophy controller with its conduit, two ammunition data link boxes, a GPS antenna
 * and the wind sensor. */
function roofElectronics(P: TankBuilderPort): void {
  const at = (x: number, z: number, lift: number): XYZ => [x, turretRoofY(x, z) + lift, z];
  put(P, 'turret', 'turret', 'trophy-controller', box(.34, .22, .30), at(-.40, -1.75, .11));
  put(P, 'turret', 'turretDark', 'trophy-controller-lid', box(.36, .014, .32), at(-.40, -1.75, .227));
  member(P, 'turret', 'turretDark', 'trophy-cable', at(-.58, -1.75, .05), at(-1.02, -1.60, .03), .016);
  for (const x of [.35, .55]) put(P, 'turret', 'turretDark', 'adl-box', box(.16, .09, .12), at(x, -1.95, .045));
  put(P, 'turret', 'turretDetail', 'gps-antenna', cylY(.07, .07, .045, 16), at(.20, -2.08, .0225));
  put(P, 'turret', 'turretDark', 'wind-sensor', cylY(.012, .012, .36, 8), at(-.95, -1.85, .18));
  put(P, 'turret', 'turretDark', 'wind-sensor', box(.10, .03, .03), at(-.95, -1.85, .375));
}

/** Fender stowage: the tow cable clamped along the left fender, pioneer tools on the right, two water
 * cans on the right rear fender. */
function fenderStowage(P: TankBuilderPort): void {
  const stations = [-1.90, -1.05, -.20, .65, 1.50, 2.35];
  for (let i = 0; i < stations.length - 1; i++) {
    member(P, 'hull', 'hullDark', 'tow-cable', [-1.80, 1.44, stations[i]], [-1.80, 1.44, stations[i + 1]], .020);
  }
  for (const z of [-1.50, .20, 1.90]) put(P, 'hull', 'hull', 'tow-clamp', box(.06, .05, .05), [-1.80, 1.435, z]);
  member(P, 'hull', 'hullDark', 'pioneer-tool', [1.74, 1.43, .25], [1.74, 1.43, 1.15], .015);
  put(P, 'hull', 'hullDark', 'pioneer-tool', box(.10, .02, .32), [1.74, 1.43, 1.32]);
  for (const z of [-2.45, -2.05]) put(P, 'hull', 'hullDetail', 'jerry-can', box(.18, .42, .35), [1.52, 1.405 + .21, z]);
}

export function buildAbramsSourceXSepv3Kit(P: TankBuilderPort): void {
  for (const side of [-1, 1] as const) trophyLauncher(P, side);
  trophyRadars(P);
  trophyCounterweights(P);
  auxiliaryPowerUnit(P);
  sponsonBox(P);
  roofElectronics(P);
  fenderStowage(P);
}
