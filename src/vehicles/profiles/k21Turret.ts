// K21 (k21X.ts) — the turret, rebuilt 2026-11-04 (owner: "tbf the k21 turret just neds to be completely redesigined. it
// just wrong", after "also the matnelt of k21 needs to be more prominent").
//
// The old turret lofted five stations into a low rounded dome. This one is the real K21 turret as the source study
// (k21_x_source.glb, the 267 measuring oracle: Object_22 shell, Object_16 gun mount, Object_8 sights, Object_23 smoke)
// and the ROK Army photographs show it: a tall slab-sided box with a flat roof, a vertical rear wall under a short roof
// bevel, and a pointed front: a narrow central panel raked back 41 degrees, cut by a deep gun slot that runs on back
// through the roof, and two flat cheeks swept back 47 degrees in plan from it to the side walls. Every armour plate is a
// closed convex solid with flat welded facets, cut from one set of measured planes, so faces meet exactly. Builder metres
// in the source frame (world), +x the vehicle's left; the factory's 0.90 size policy scales them with the rest.
//
// Round 3 (blind A/Bs k21turretr269 and r269b): round 1's shell, with a mantlet a third larger so the gun root reads as
// an armoured block at overview scale, and smoke banks as compact blocks of five open tubes on flush brackets.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { equipment } from './easternSourceKit.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylZ } = KIT;

/** a·x + b·y + c·z <= d */
type Plane = readonly [number, number, number, number];

/** Measured shell datums (source Object_22, cross-checked against photos 1-7). */
export const K21_TURRET = Object.freeze({
  floorY: 2.03, roofY: 2.606, wallX: 1.10, rearZ: -1.717,
  /** the roof's rear bevel: flat to z -1.33, then down to the rear wall's top edge at 2.49 */
  bevelZ: -1.33, rearTopY: 2.49,
  /** the gun slot: half-width, back wall (behind the trunnion at z 0.30), floor and its chamfered corners */
  slotX: .15, slotBackZ: -.22, slotFloorY: 2.085, slotChamfer: .045,
});

const T = K21_TURRET;
/** The crew hatches (source Object_22's two round covers, photo 4): centre x, z and the outboard side. */
export const K21_HATCHES: readonly (readonly [number, number, -1 | 1])[] = [[-.555, -.905, -1], [.555, -.905, 1]];
const BEVEL = (T.roofY - T.rearTopY) / (T.bevelZ - T.rearZ);
/** Roof height at z (the flat roof, then the rear bevel). */
export function k21TurretRoofAt(z: number): number {
  return z >= T.bevelZ ? T.roofY : T.roofY - (T.bevelZ - z) * BEVEL;
}
/** The central panel: z = .782 - .868 (y - 2.05), raked 41 degrees. */
const panelZ = (y: number): number => .782 - .868 * (y - 2.05);
/** Each cheek: z = .043 - 1.08 (|x| - 1) - .266 (y - 2.05), 47 degrees in plan, raked 15 degrees. */
const cheekZ = (ax: number, y: number): number => .043 - 1.08 * (ax - 1) - .266 * (y - 2.05);

const BODY: readonly Plane[] = [
  [0, -1, 0, -T.floorY], [0, 1, 0, T.roofY],
  [1, 0, 0, T.wallX], [-1, 0, 0, T.wallX],
  // the side walls' lower bevel: 50 mm in at the floor, vertical from 2.09
  [1, -.05 / .06, 0, 1.05 - .05 / .06 * T.floorY], [-1, -.05 / .06, 0, 1.05 - .05 / .06 * T.floorY],
  [0, 0, -1, -T.rearZ],
  [0, 1, -BEVEL, T.roofY - BEVEL * T.bevelZ],
  [0, .868, 1, .782 + .868 * 2.05],
  [1.08, .266, 1, .043 + 1.08 + .266 * 2.05], [-1.08, .266, 1, .043 + 1.08 + .266 * 2.05],
];

/** Corners of the convex intersection of half-spaces (every triple of planes meeting inside all of them). */
function polytope(planes: readonly Plane[]): THREE.Vector3[] {
  const points: THREE.Vector3[] = [], m = new THREE.Matrix3(), v = new THREE.Vector3();
  for (let i = 0; i < planes.length; i++) for (let j = i + 1; j < planes.length; j++) for (let k = j + 1; k < planes.length; k++) {
    const [a, b, c] = [planes[i], planes[j], planes[k]];
    m.set(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    if (Math.abs(m.determinant()) < 1e-9) continue;
    v.set(a[3], b[3], c[3]).applyMatrix3(m.invert());
    if (planes.every(p => p[0] * v.x + p[1] * v.y + p[2] * v.z <= p[3] + 1e-7)
      && !points.some(q => q.distanceToSquared(v) < 1e-12)) points.push(v.clone());
  }
  return points;
}

/** A closed convex solid with flat welded facets; UVs in plan (x, z), as the fleet's convex stock. */
function convexStock(points: readonly THREE.Vector3[]): THREE.BufferGeometry {
  const geometry = new ConvexGeometry([...points]);
  const position = geometry.getAttribute('position'), uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i), position.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}
const solid = (planes: readonly Plane[]): THREE.BufferGeometry => convexStock(polytope(planes));

/** World-frame geometry into the turret's own armour bucket. */
function shell(P: TankBuilderPort, geometry: THREE.BufferGeometry, bucket = 'turret'): void {
  const p = P.turretG.position;
  P.add(bucket, geometry, -p.x, -p.y, -p.z);
}

/** The shell: the rear body behind the slot, the two front halves either side of it, the slot's floor and its two
 * chamfered lower corners. The slot runs from the floor at 2.085 up through the roof and back to z -0.22, so the gun's
 * cradle housing lies in a channel in the roof and its jacket leaves the central panel from a deep dark well. */
function addShell(P: TankBuilderPort): void {
  const ahead: Plane = [0, 0, -1, -T.slotBackZ], s = T.slotX, f = T.slotFloorY, c = T.slotChamfer;
  shell(P, solid([...BODY, [0, 0, 1, T.slotBackZ]]));
  shell(P, solid([...BODY, ahead, [-1, 0, 0, -s]]));
  shell(P, solid([...BODY, ahead, [1, 0, 0, -s]]));
  shell(P, solid([...BODY, ahead, [1, 0, 0, s], [-1, 0, 0, s], [0, 1, 0, f]]));
  for (const side of [-1, 1]) {
    // below the chamfer line from (side (s - c), f) to (side s, f + c), above the floor, inside the wall
    shell(P, solid([...BODY, ahead, [side, 0, 0, s], [0, -1, 0, -f], [-side, 1, 0, f - (s - c)]]));
  }
  // The slot's dark lining, 1.5 mm proud of each face it covers: walls, back, floor and the corner chamfers.
  const d = .0015, inPanel: Plane = [0, .868, 1, .782 + .868 * 2.05 - .002], top: Plane = [0, 1, 0, T.roofY - .003];
  const lining = (planes: readonly Plane[]) => equipment(P, 'turret', 'Dark', solid([...BODY, inPanel, top, ...planes]), 0, 0, 0);
  for (const side of [-1, 1]) {
    lining([[side, 0, 0, s + d], [-side, 0, 0, -(s - 2 * d)], [0, -1, 0, -(f + c)], ahead]);
    const k = d * Math.SQRT2;
    lining([[-side, 1, 0, f - (s - c) + k], [side, -1, 0, -(f - (s - c) - k)], [side, 0, 0, s - 2 * d], [0, -1, 0, -(f + d)], ahead]);
  }
  lining([[1, 0, 0, s - 2 * d], [-1, 0, 0, s - 2 * d], [0, -1, 0, -(f + d)], [0, 0, 1, T.slotBackZ + d], [0, 0, -1, -(T.slotBackZ - d)]]);
  lining([[1, 0, 0, s - c], [-1, 0, 0, s - c], [0, 1, 0, f + d], [0, -1, 0, -(f - d)], [0, 0, -1, -(T.slotBackZ + d)]]);
}

/** Side armour and stowage, measured from the source: an appliqué panel on the left wall (it also seats the launcher's
 * receiver), the tall stowage bin on the right wall with its chamfered front, and the filter box on the rear wall. */
function addSideKit(P: TankBuilderPort): void {
  const wall = T.wallX - .005;
  shell(P, solid([[-1, 0, 0, -wall], [1, 0, 0, 1.14], [0, -1, 0, -2.14], [0, 1, 0, 2.56], [0, 0, -1, 1.50], [0, 0, 1, -.50],
    [1, 1, 0, 1.14 + 2.53], [1, -1, 0, 1.14 - 2.17], [1, 0, 1, 1.14 - .53], [1, 0, -1, 1.14 + 1.47]]), 'turretExternalArmor');
  // the bin's lid falls 45 mm outboard; its front's top edge is chamfered back, its outer foot bevelled
  equipment(P, 'turret', 'PaintedDetail', solid([[1, 0, 0, -wall], [-1, 0, 0, 1.34], [0, -1, 0, -2.07],
    [-.1875, 1, 0, 2.575 + .1875 * 1.10], [0, 0, -1, 1.74], [0, 0, 1, -.84], [0, .8, 1, -.84 + .8 * 2.50],
    [-1, -1, 0, 1.34 - 2.12]]), 0, 0, 0);
  equipment(P, 'turret', 'PaintedDetail', solid([[1, 0, 0, -.48], [-1, 0, 0, .75], [0, -1, 0, -2.20], [0, 1, 0, 2.46],
    [0, 0, -1, 1.95], [0, 0, 1, T.rearZ + .005], [0, 1, -.5, 2.46 - .5 * -1.90]]), 0, 0, 0);
}

/** Boxes on the cheeks' upper outer corners (source and photo 4), square to the cheek, each with a dark window. The
 * rear face's top edge is 5 mm into the raked cheek, so its foot is buried deeper, never standing off. */
function addCheekBoxes(P: TankBuilderPort): void {
  const yaw = Math.atan2(1.08, 1), w = .22, h = .14, d = .15;
  for (const side of [-1, 1]) {
    const ax = .93, ay = 2.48, out = new THREE.Vector3(side * Math.sin(yaw), 0, Math.cos(yaw));
    const centre = new THREE.Vector3(side * ax, ay, cheekZ(ax, ay)).addScaledVector(out, d / 2 - .005 - .266 * h / 2 / Math.hypot(1.08, 1));
    equipment(P, 'turret', 'Detail', box(w, h, d), centre.x, centre.y, centre.z, 0, side * yaw, 0);
    const face = centre.clone().addScaledVector(out, d / 2 + .002);
    equipment(P, 'turret', 'Dark', box(w * .66, h * .5, .008), face.x, face.y, face.z, 0, side * yaw, 0);
  }
}

/** Five smoke dischargers on each cheek (photos 4 and 6: a compact block, two tubes over three), each tube open with a
 * rim round a dark bore. The block looks ahead, 18 degrees up and 5 degrees outboard (each tube fans 2.5 degrees more),
 * so it stays inside the turret's plan outline (x 1.0 at most) and never reads as a second gun. As the source's do, the
 * mouths stand forward of the cheek's outer half (z 0.71): the cradle rides an arm that runs back along the block's own
 * axis to a bracket plate lying flush on the cheek at mid height. */
function addSmokeClusters(P: TankBuilderPort): void {
  const up = new THREE.Vector3(0, 1, 0), seg = P.q ? 14 : 9;
  for (const side of [-1, 1]) {
    // the cheek plane N . p = d (unit normal n), and the block's frame: its cradle's front face at the origin
    const N = new THREE.Vector3(side * 1.08, .266, 1), d = .043 + 1.08 + .266 * 2.05, normal = N.clone().normalize();
    const aim = new THREE.Vector3(side * Math.sin(.087) * Math.cos(.314), Math.sin(.314), Math.cos(.087) * Math.cos(.314));
    const origin = new THREE.Vector3(side * .86, 2.40, .50);
    const u = new THREE.Vector3().crossVectors(up, aim).normalize(), v = new THREE.Vector3().crossVectors(aim, u);
    const frame = new THREE.Matrix4().makeBasis(u, v, aim).setPosition(origin);
    // back along the axis to the cheek (offset `o` from its plane)
    const toCheek = (p: THREE.Vector3, o: number) => p.clone().addScaledVector(aim, -(N.dot(p) - d - o * N.length()) / N.dot(aim));
    const base = toCheek(origin, 0);
    // the bracket plate: 30 x 22 cm, 20 mm proud of the cheek and 5 mm into it
    const across = new THREE.Vector3().crossVectors(up, normal).normalize(), along = new THREE.Vector3().crossVectors(normal, across);
    const plate: THREE.Vector3[] = [];
    for (const [a, b, c] of [[-1, -1, -.005], [1, -1, -.005], [-1, 1, -.005], [1, 1, -.005], [-1, -1, .020], [1, -1, .020], [-1, 1, .020], [1, 1, .020]] as const)
      plate.push(base.clone().addScaledVector(across, a * .15).addScaledVector(along, b * .11).addScaledVector(normal, c));
    const parts: THREE.BufferGeometry[] = [convexStock(plate)], dark: THREE.BufferGeometry[] = [];
    parts.push(box(.27, .19, .05).translate(0, 0, -.025).applyMatrix4(frame));
    // the arm: the cradle's rear face carried back along the axis onto the plate's face
    const arm: THREE.Vector3[] = [];
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const p = new THREE.Vector3(a * .10, b * .065, -.045).applyMatrix4(frame);
      arm.push(p, toCheek(p, .015));
    }
    parts.push(convexStock(arm));
    for (const [i, j] of [[-1, -1], [0, -1], [1, -1], [-.5, 1], [.5, 1]] as const) {
      const fan = new THREE.Matrix4().makeRotationY(i * .044).premultiply(new THREE.Matrix4().makeRotationX(-j * .03))
        .setPosition(i * .088, j * .046, -.010).premultiply(frame);
      // each tube is its own part: the factory reads its marked mouth as a smoke socket
      equipment(P, 'turret', 'Detail', markSmokeTube(cylZ(.041, .22, seg)).translate(0, 0, .11).applyMatrix4(fan), 0, 0, 0);
      dark.push(new THREE.CircleGeometry(.030, seg).translate(0, 0, .2212).applyMatrix4(fan));
    }
    equipment(P, 'turret', 'Detail', KIT.mergeAll(parts), 0, 0, 0);
    equipment(P, 'turret', 'Dark', KIT.mergeAll(dark), 0, 0, 0);
  }
}

/** A sparse bolt pattern on the front plates (photo 4): hex heads square to each face, 2 mm into it. */
function addFrontBolts(P: TankBuilderPort): void {
  const heads: THREE.BufferGeometry[] = [], up = new THREE.Vector3(0, 1, 0);
  const head = (x: number, y: number, z: number, n: THREE.Vector3) => heads.push(KIT.cylY(.019, .019, .012, 6)
    .applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up, n))
      .setPosition(x + n.x * .004, y + n.y * .004, z + n.z * .004)));
  const panelNormal = new THREE.Vector3(0, .868, 1).normalize();
  for (const side of [-1, 1]) {
    for (const y of [2.12, 2.28, 2.44]) head(side * .22, y, panelZ(y), panelNormal);
    const cheekNormal = new THREE.Vector3(side * 1.08, .266, 1).normalize();
    for (const [ax, y] of [[.52, 2.18], [.62, 2.40], [.79, 2.53], [1.02, 2.31], [1.04, 2.11]] as const)
      head(side * ax, y, cheekZ(ax, y), cheekNormal);
  }
  equipment(P, 'turret', 'Detail', KIT.mergeAll(heads), 0, 0, 0);
}

/** The gunner's twin-aperture sight on the roof behind the gun channel (source Object_8): a base plate, the body with
 * its side flanges, and two round windows high in its face. */
function addTwinSight(P: TankBuilderPort): void {
  const x = .09, roof = T.roofY, back = -.52, front = -.28;
  equipment(P, 'turret', 'Detail', box(.34, .012, front - back), x, roof + .004, (front + back) / 2);
  equipment(P, 'turret', 'Detail', sectionSolid([
    { z: back + .04, ring: [[-.15, 0], [.15, 0], [.15, .22], [.12, .26], [-.12, .26], [-.15, .22]] },
    { z: front - .03, ring: [[-.15, 0], [.15, 0], [.15, .24], [.12, .27], [-.12, .27], [-.15, .24]] },
  ]), x, roof + .008, 0);
  for (const s of [-1, 1]) {
    equipment(P, 'turret', 'Detail', box(.02, .22, .18), x + s * .16, roof + .12, front - .10);
    equipment(P, 'turret', 'Detail', cylZ(.052, .05, P.q ? 18 : 12), x + s * .062, roof + .205, front - .01);
    equipment(P, 'turret', 'Glass', cylZ(.040, .006, P.q ? 18 : 12), x + s * .062, roof + .205, front + .016);
  }
}

/** The new shell and everything welded to it (the roof's sights, hatches, whips, basket and launcher stay with the
 * builder in k21X.ts and k21DeckKit.ts). */
export function addK21Turret(P: TankBuilderPort): void {
  addShell(P);
  addSideKit(P);
  addCheekBoxes(P);
  addSmokeClusters(P);
  addFrontBolts(P);
  addTwinSight(P);
}

/** The 40 mm gun's mantlet (owner 2026-11-04: "also the matnelt of k21 needs to be more prominent"), as Object_16 and
 * photos 4, 5 and 7 stack it, a third larger than the source's so it reads as an armoured block at overview scale,
 * gun-local (trunnion origin, +z along the bore; the central panel crosses the bore 0.234 m ahead):
 * - the long flat-topped cradle housing, lying in the roof channel (0.26 wide) from 0.38 m behind the trunnion, its top
 *   cresting 0.085 m over the roof above the trunnion and falling forward under the coaxial box, as Object_16's does;
 * - the square coaxial box standing above the housing's front, 0.45 x 0.19 (the source's plate is 0.32 wide), its top
 *   edges chamfered, a hood round a recessed face whose port looks straight ahead, seated on the jacket, its face
 *   ahead of the jacket's flange;
 * - under it the round armoured jacket: a root (r 0.124) in the slot, then the sleeve (r 0.150) from just ahead of the
 *   panel to a rounded front flange (r 0.162), then a collar stepping down 0.124 and 0.094 and a cone to the tube.
 * The parts wider than the slot (0.15) stand ahead of the panel; everything clears the slot's walls, floor and back
 * wall, the roof, the sights and the hatches from full depression (-8) to full elevation (+37). */
export function addK21Mantlet(P: TankBuilderPort): void {
  const n = P.q ? 32 : 18;
  // One lathe per face between hard corners keeps the steps crisp; the flange's rounded front stays one run.
  const lathe = (profile: readonly (readonly [number, number])[], smooth: readonly number[], segments = n) =>
    KIT.mergeAll(profile.slice(0, -1).flatMap((_, i) => smooth.includes(i) ? [] : [i]).map((from, i, starts) => {
      const to = i + 1 < starts.length ? starts[i + 1] : profile.length - 1;
      return new THREE.LatheGeometry(profile.slice(from, Math.max(to, from + 1) + 1)
        .map(([r, z]) => new THREE.Vector2(r, z)), segments).rotateX(Math.PI / 2);
    }));
  P.addGunExtra(lathe([[0, .060], [.098, .060], [.124, .088], [.124, .340], [.150, .358], [.150, .545], [.162, .553],
    [.162, .590], [.157, .603], [.145, .612], [.124, .612], [.124, .662], [.117, .669], [.094, .669], [.094, .712],
    [.088, .718], [.068, .718], [.050, .760], [0, .760]], [7, 8]));
  const plate = (w: number, bottom: number, top: number, c: number) => [[-w, bottom], [w, bottom], [w, top - c],
    [w - c, top], [-w + c, top], [-w, top - c]] as const;
  // The long housing: a chamfered rear end in the channel, the crest over the trunnion, running on to the box.
  P.addGunExtra(sectionSolid([
    { z: -.380, ring: plate(.122, .150, .260, .020) },
    { z: -.300, ring: plate(.130, .110, .340, .035) },
    { z: -.150, ring: plate(.130, .100, .355, .035) },
    { z: .480, ring: plate(.130, .100, .240, .035) },
  ]));
  // The coaxial box, seated on the jacket's sleeve, its top edges chamfered; its hood: a frame 8 mm proud of the box,
  // 40 mm deep.
  P.addGunExtra(sectionSolid([
    { z: .470, ring: plate(.225, .135, .322, .038) },
    { z: .700, ring: plate(.225, .135, .327, .038) },
  ]));
  const hood = new THREE.Shape(plate(.233, .127, .335, .042).map(([x, y]) => new THREE.Vector2(x, y)));
  hood.holes.push(new THREE.Path(plate(.187, .160, .300, .014).map(([x, y]) => new THREE.Vector2(x, y)).reverse()));
  P.addGunExtra(new THREE.ExtrudeGeometry(hood, { depth: .040, bevelEnabled: false, steps: 1 }), 0, 0, .694);
  // Coaxial port in the recessed face, facing straight ahead: a flush dark mouth inside a low raised collar.
  const lip = [[.050, -.005], [.065, -.005], [.065, .007], [.060, .013], [.050, .013], [.050, -.005]] as const;
  P.addGunExtra(lathe(lip, [], P.q ? 20 : 12), 0, .229, .700);
  P.addGunExtraDark(cylZ(.050, .007, P.q ? 20 : 12), 0, .229, .700);
}
