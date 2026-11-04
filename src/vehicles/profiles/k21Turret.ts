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

/** Four smoke dischargers on each cheek, on their own bracket: a 2 x 2 bank looking forward, outward and up, its
 * cradle welded to a wedge that seats it on the raked cheek. */
function addSmokeClusters(P: TankBuilderPort): void {
  const up = new THREE.Vector3(0, 1, 0);
  for (const side of [-1, 1]) {
    const ax = .78, ay = 2.21, base = new THREE.Vector3(side * ax, ay, cheekZ(ax, ay));
    const normal = new THREE.Vector3(side * 1.08, .266, 1).normalize();
    const aim = new THREE.Vector3(side * .50, .42, .76).normalize();
    const u = new THREE.Vector3().crossVectors(up, aim).normalize(), v = new THREE.Vector3().crossVectors(aim, u);
    const centre = base.clone().addScaledVector(normal, .09);
    const frame = new THREE.Matrix4().makeBasis(u, v, aim).setPosition(centre);
    const parts: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];
    parts.push(box(.27, .25, .06).translate(0, 0, -.03).applyMatrix4(frame));
    for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      parts.push(markSmokeTube(cylZ(.052, .24, P.q ? 14 : 9)).translate(i * .062, j * .062, .12).applyMatrix4(frame));
      dark.push(cylZ(.040, .012, P.q ? 14 : 9).translate(i * .062, j * .062, .236).applyMatrix4(frame));
    }
    // Wedge bracket: the cradle's rear face and its projection 6 mm into the cheek.
    const corners: THREE.Vector3[] = [];
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const p = new THREE.Vector3(a * .12, b * .11, -.055).applyMatrix4(frame);
      corners.push(p, p.clone().addScaledVector(normal, -(normal.dot(p.clone().sub(base)) + .006)));
    }
    parts.push(convexStock(corners));
    equipment(P, 'turret', 'Detail', KIT.mergeAll(parts), 0, 0, 0);
    equipment(P, 'turret', 'Dark', KIT.mergeAll(dark), 0, 0, 0);
  }
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
  addTwinSight(P);
}

/** The 40 mm gun's mantlet (owner 2026-11-04: "also the matnelt of k21 needs to be more prominent"), as Object_16 and
 * photos 4-7 show it, gun-local (trunnion origin, +z along the bore; the central panel crosses the bore 0.234 m ahead):
 * - the long flat-topped cradle housing, lying in the roof channel from 0.38 m behind the trunnion, its top rising to
 *   the rear and 0.05-0.07 m proud of the roof, then the square coaxial plate box on its front (0.37 x 0.22, 1.47 jacket
 *   diameters wide as photo 7 reads) with a hooded front whose recessed plate carries the coax port facing ahead;
 * - under it the round armoured jacket (r 0.118) from inside the slot to a rounded front flange (r 0.126) 0.37 m ahead of
 *   the panel, then a collar stepping down 0.095, 0.072 and a cone to the 0.036 tube.
 * Every part stays inside the slot's walls (0.15) or ahead of the panel and clear of the slot's floor and back wall from
 * full depression (-8) to full elevation (+37). */
export function addK21Mantlet(P: TankBuilderPort): void {
  const n = P.q ? 32 : 18;
  // One lathe per face between hard corners keeps the steps crisp; the flange's rounded front stays one run.
  const lathe = (profile: readonly (readonly [number, number])[], smooth: readonly number[], segments = n) =>
    KIT.mergeAll(profile.slice(0, -1).flatMap((_, i) => smooth.includes(i) ? [] : [i]).map((from, i, starts) => {
      const to = i + 1 < starts.length ? starts[i + 1] : profile.length - 1;
      return new THREE.LatheGeometry(profile.slice(from, Math.max(to, from + 1) + 1)
        .map(([r, z]) => new THREE.Vector2(r, z)), segments).rotateX(Math.PI / 2);
    }));
  P.addGunExtra(lathe([[0, .060], [.095, .060], [.118, .085], [.118, .545], [.126, .551], [.126, .585], [.122, .597],
    [.112, .605], [.095, .605], [.095, .646], [.089, .652], [.072, .652], [.072, .690], [.066, .696], [.052, .696],
    [.044, .730], [0, .730]], [5, 6]));
  const plate = (w: number, bottom: number, top: number, c: number) => [[-w, bottom], [w, bottom], [w, top - c],
    [w - c, top], [-w + c, top], [-w, top - c]] as const;
  // The long housing: a chamfered rear end in the channel, the top's crest over the trunnion, falling to the box.
  P.addGunExtra(sectionSolid([
    { z: -.380, ring: plate(.124, .135, .250, .016) },
    { z: -.300, ring: plate(.130, .105, .335, .024) },
    { z: -.150, ring: plate(.130, .100, .345, .024) },
    { z: .500, ring: plate(.130, .100, .300, .024) },
  ]));
  // The coaxial plate box and its hood: a frame 5 mm proud of the box all round, 40 mm deep.
  P.addGunExtra(sectionSolid([
    { z: .470, ring: plate(.180, .118, .318, .020) },
    { z: .700, ring: plate(.185, .110, .330, .022) },
  ]));
  const hood = new THREE.Shape(plate(.190, .105, .339, .024).map(([x, y]) => new THREE.Vector2(x, y)));
  hood.holes.push(new THREE.Path(plate(.152, .136, .300, .010).map(([x, y]) => new THREE.Vector2(x, y)).reverse()));
  P.addGunExtra(new THREE.ExtrudeGeometry(hood, { depth: .040, bevelEnabled: false, steps: 1 }), 0, 0, .694);
  // Coaxial port in the recessed plate, facing straight ahead: a flush dark mouth inside a low raised collar.
  const lip = [[.040, -.004], [.052, -.004], [.052, .006], [.048, .011], [.040, .011], [.040, -.004]] as const;
  P.addGunExtra(lathe(lip, [], P.q ? 20 : 12), 0, .222, .700);
  P.addGunExtraDark(cylZ(.040, .006, P.q ? 20 : 12), 0, .222, .700);
}
