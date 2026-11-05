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
// Round 2 (blind A/B k21turretr269, the photographs over the source where they differ):
// - Height. Side-on, the turret's wall is 1.15-1.30 road-wheel diameters tall in photos 1, 2 and 6 (the source's
//   0.96), with the hull's deck 3.35 wheel diameters up as the source's is; photo 7 puts the roof 1.5 jacket diameters
//   over the bore. The shell is stretched up about its floor by 1.226 (roof 2.606 -> 2.736) on the same plan, so the
//   front planes keep their footprints and steepen (central panel 41 -> 35 degrees).
// - Front width. Photos 4 and 5 show the central panel 0.33-0.39 of the turret's front width at its foot and 0.61-0.73
//   at the roof (the source's 0.29 and 0.54): its edges go out to x 0.38 and 0.70, the cheeks still 47 degrees in plan.
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

/** Measured shell datums (source Object_22, cross-checked against photos 1-7; heights stretched by LIFT). */
export const K21_TURRET = Object.freeze({
  floorY: 2.03, roofY: 2.736, wallX: 1.10, rearZ: -1.717,
  /** the roof's rear bevel: flat to z -1.33, then down to the rear wall's top edge (the source's 2.49, stretched) */
  bevelZ: -1.33, rearTopY: 2.594,
  /** the gun slot: half-width, back wall (behind the trunnion at z 0.30), floor and its chamfered corners */
  slotX: .15, slotBackZ: -.22, slotFloorY: 2.085, slotChamfer: .045,
});

const T = K21_TURRET;
/** The round-2 stretch about the floor: the photographs' wall height over the source's (roof 2.606). */
const LIFT = (T.roofY - T.floorY) / (2.606 - T.floorY);
/** A source-frame height on the stretched shell. */
const lift = (y: number): number => T.floorY + (y - T.floorY) * LIFT;
/** The crew hatches (source Object_22's two round covers, photo 4): centre x, z and the outboard side. */
export const K21_HATCHES: readonly (readonly [number, number, -1 | 1])[] = [[-.555, -.905, -1], [.555, -.905, 1]];
const BEVEL = (T.roofY - T.rearTopY) / (T.bevelZ - T.rearZ);
/** Roof height at z (the flat roof, then the rear bevel). */
export function k21TurretRoofAt(z: number): number {
  return z >= T.bevelZ ? T.roofY : T.roofY - (T.bevelZ - z) * BEVEL;
}
/** The central panel: the source's z = .782 - .868 (y - 2.05) (41 degrees), stretched: z = PANEL_C - PANEL_S y. */
const PANEL_S = .868 / LIFT, PANEL_C = .782 + .868 * (2.05 - T.floorY) + PANEL_S * T.floorY;
const panelZ = (y: number): number => PANEL_C - PANEL_S * y;
/** Each cheek, 47 degrees in plan (dz/dx 1.08 as the source), meeting the panel at x 0.38 on the floor and 0.70 at the
 * roof (photos 4 and 5): z = CHEEK_C - 1.08 |x| - CHEEK_R y. */
const CHEEK_R = (panelZ(T.floorY) + 1.08 * .38 - panelZ(T.roofY) - 1.08 * .70) / (T.roofY - T.floorY);
const CHEEK_C = panelZ(T.floorY) + 1.08 * .38 + CHEEK_R * T.floorY;
const cheekZ = (ax: number, y: number): number => CHEEK_C - 1.08 * ax - CHEEK_R * y;
const cheekNormal = (side: number): THREE.Vector3 => new THREE.Vector3(side * 1.08, CHEEK_R, 1).normalize();

const BODY: readonly Plane[] = [
  [0, -1, 0, -T.floorY], [0, 1, 0, T.roofY],
  [1, 0, 0, T.wallX], [-1, 0, 0, T.wallX],
  // the side walls' lower bevel: 50 mm in at the floor, vertical from 2.09
  [1, -.05 / .06, 0, 1.05 - .05 / .06 * T.floorY], [-1, -.05 / .06, 0, 1.05 - .05 / .06 * T.floorY],
  [0, 0, -1, -T.rearZ],
  [0, 1, -BEVEL, T.roofY - BEVEL * T.bevelZ],
  [0, PANEL_S, 1, PANEL_C],
  [1.08, CHEEK_R, 1, CHEEK_C], [-1.08, CHEEK_R, 1, CHEEK_C],
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
  const d = .0015, inPanel: Plane = [0, PANEL_S, 1, PANEL_C - .002], top: Plane = [0, 1, 0, T.roofY - .003];
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
  const wall = T.wallX - .005, a0 = lift(2.14), a1 = lift(2.56);
  shell(P, solid([[-1, 0, 0, -wall], [1, 0, 0, 1.14], [0, -1, 0, -a0], [0, 1, 0, a1], [0, 0, -1, 1.50], [0, 0, 1, -.50],
    [1, 1, 0, 1.14 + a1 - .03], [1, -1, 0, 1.14 - a0 - .03], [1, 0, 1, 1.14 - .53], [1, 0, -1, 1.14 + 1.47]]), 'turretExternalArmor');
  // the bin's lid falls outboard; its front's top edge is chamfered back, its outer foot bevelled
  const lid = lift(2.575), lidOut = lift(2.53), fall = (lid - lidOut) / .24, chamfer = lift(2.50), rake = .06 / (lid - chamfer);
  equipment(P, 'turret', 'PaintedDetail', solid([[1, 0, 0, -wall], [-1, 0, 0, 1.34], [0, -1, 0, -2.07],
    [-fall, 1, 0, lid + fall * 1.10], [0, 0, -1, 1.74], [0, 0, 1, -.84], [0, rake, 1, -.84 + rake * chamfer],
    [-1, -1, 0, 1.34 - 2.12]]), 0, 0, 0);
  const f0 = lift(2.20), f1 = lift(2.46);
  equipment(P, 'turret', 'PaintedDetail', solid([[1, 0, 0, -.48], [-1, 0, 0, .75], [0, -1, 0, -f0], [0, 1, 0, f1],
    [0, 0, -1, 1.95], [0, 0, 1, T.rearZ + .005], [0, 1, -.5, f1 - .5 * -1.90]]), 0, 0, 0);
}

/** Boxes on the cheeks' upper outer corners (source and photo 4), square to the cheek, each with a dark window. The
 * rear face's top edge is 5 mm into the raked cheek, so its foot is buried deeper, never standing off. */
function addCheekBoxes(P: TankBuilderPort): void {
  const yaw = Math.atan2(1.08, 1), w = .22, h = .14, d = .15;
  for (const side of [-1, 1]) {
    const ax = .93, ay = lift(2.48), out = new THREE.Vector3(side * Math.sin(yaw), 0, Math.cos(yaw));
    const centre = new THREE.Vector3(side * ax, ay, cheekZ(ax, ay)).addScaledVector(out, d / 2 - .005 - CHEEK_R * h / 2 / Math.hypot(1.08, 1));
    equipment(P, 'turret', 'Detail', box(w, h, d), centre.x, centre.y, centre.z, 0, side * yaw, 0);
    const face = centre.clone().addScaledVector(out, d / 2 + .002);
    equipment(P, 'turret', 'Dark', box(w * .66, h * .5, .008), face.x, face.y, face.z, 0, side * yaw, 0);
  }
}

/** Five smoke dischargers on each cheek (photos 4 and 6: two over three, domed grenade caps, the bank at mid-cheek and
 * tilted up, fanned out), on their own bracket: a plate welded flat to the cheek, a standoff block, and the cradle the
 * tubes stand in. The bank looks 10 degrees outboard and 35 degrees up, as the photographs' do (mostly ahead and up,
 * never out sideways past the cheek where it would read as a second gun); each tube fans a further 6 degrees. */
function addSmokeClusters(P: TankBuilderPort): void {
  const up = new THREE.Vector3(0, 1, 0), seg = P.q ? 14 : 9;
  for (const side of [-1, 1]) {
    const ax = .80, ay = 2.30, base = new THREE.Vector3(side * ax, ay, cheekZ(ax, ay)), normal = cheekNormal(side);
    // the bracket plate: 30 x 26 cm, 25 mm proud, square to the cheek
    const across = new THREE.Vector3().crossVectors(up, normal).normalize(), along = new THREE.Vector3().crossVectors(normal, across);
    const plate: THREE.Vector3[] = [];
    for (const [a, b, c] of [[-1, -1, -.005], [1, -1, -.005], [-1, 1, -.005], [1, 1, -.005], [-1, -1, .025], [1, -1, .025], [-1, 1, .025], [1, 1, .025]] as const)
      plate.push(base.clone().addScaledVector(across, a * .15).addScaledVector(along, b * .13).addScaledVector(normal, c));
    const aim = new THREE.Vector3(side * Math.sin(.17) * Math.cos(.61), Math.sin(.61), Math.cos(.17) * Math.cos(.61));
    const u = new THREE.Vector3().crossVectors(up, aim).normalize(), v = new THREE.Vector3().crossVectors(aim, u);
    const frame = new THREE.Matrix4().makeBasis(u, v, aim).setPosition(base.clone().addScaledVector(normal, .12));
    const parts: THREE.BufferGeometry[] = [convexStock(plate)], dark: THREE.BufferGeometry[] = [];
    parts.push(box(.31, .21, .06).translate(0, 0, -.03).applyMatrix4(frame));
    // the standoff: the cradle's rear face and its projection onto the plate's face
    const standoff: THREE.Vector3[] = [], face = base.clone().addScaledVector(normal, .020);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const p = new THREE.Vector3(a * .10, b * .07, -.055).applyMatrix4(frame);
      standoff.push(p, p.clone().addScaledVector(normal, -normal.dot(p.clone().sub(face))));
    }
    parts.push(convexStock(standoff));
    for (const [i, j] of [[-1, -1], [0, -1], [1, -1], [-.5, 1], [.5, 1]] as const) {
      const fan = new THREE.Matrix4().makeRotationY(i * .10).premultiply(new THREE.Matrix4().makeRotationX(-j * .05))
        .setPosition(i * .098, j * .05, -.010).premultiply(frame);
      // each tube is its own part: the factory reads its marked mouth as a smoke socket
      equipment(P, 'turret', 'Detail', markSmokeTube(cylZ(.046, .19, seg)).translate(0, 0, .095).applyMatrix4(fan), 0, 0, 0);
      dark.push(new THREE.SphereGeometry(.043, seg, 5, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).translate(0, 0, .186).applyMatrix4(fan));
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
  const panelNormal = new THREE.Vector3(0, PANEL_S, 1).normalize();
  for (const side of [-1, 1]) {
    for (const y of [2.12, 2.28, 2.44]) head(side * .26, lift(y), panelZ(lift(y)), panelNormal);
    for (const [ax, y] of [[.56, 2.18], [.64, 2.38], [.76, 2.55], [1.03, 2.31], [1.05, 2.11]] as const)
      head(side * ax, lift(y), cheekZ(ax, lift(y)), cheekNormal(side));
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
 * photos 4, 5 and 7 stack it, gun-local (trunnion origin, +z along the bore):
 * - the round armoured jacket wrapping the barrel root (r 0.124) from inside the slot to a rounded front flange (r 0.134,
 *   photo 7's ring) flush with the coaxial box's hooded face, then a collar stepping down 0.108 and 0.084 and a cone to
 *   the 0.036 tube, standing 0.13 m ahead of the box: the dominant mass round the barrel;
 * - above it, as photo 7 shows (the ring directly under the box's face), the coaxial box: 0.37 wide, 0.21 tall
 *   (1.4 and 0.8 flange diameters), its top edges chamfered, a hood round a recessed face whose port looks straight
 *   ahead, seated on the jacket;
 * - behind the box, the long cradle housing lying in the roof channel from 0.38 m behind the trunnion, its chamfered top
 *   rising to crest 0.03 m over the roof above the trunnion.
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
  P.addGunExtra(lathe([[0, .060], [.098, .060], [.124, .088], [.124, .636], [.134, .642], [.134, .684], [.129, .697],
    [.118, .706], [.108, .706], [.108, .752], [.101, .759], [.084, .759], [.084, .800], [.077, .807], [.062, .807],
    [.046, .842], [0, .842]], [5, 6]));
  const plate = (w: number, bottom: number, top: number, c: number) => [[-w, bottom], [w, bottom], [w, top - c],
    [w - c, top], [-w + c, top], [-w, top - c]] as const;
  // The long housing: a chamfered rear end in the channel, the top's crest over the trunnion, falling to the box.
  P.addGunExtra(sectionSolid([
    { z: -.380, ring: plate(.122, .150, .280, .020) },
    { z: -.300, ring: plate(.130, .110, .400, .035) },
    { z: -.150, ring: plate(.130, .100, .430, .035) },
    { z: .480, ring: plate(.130, .100, .330, .035) },
  ]));
  // The coaxial box, seated on the jacket, its top edges chamfered; its hood: a frame 5 mm proud of the box, 30 mm deep,
  // whose lower edge clears the flange's ring.
  P.addGunExtra(sectionSolid([
    { z: .470, ring: plate(.180, .118, .325, .036) },
    { z: .690, ring: plate(.180, .118, .330, .036) },
  ]));
  const hood = new THREE.Shape(plate(.186, .136, .336, .040).map(([x, y]) => new THREE.Vector2(x, y)));
  hood.holes.push(new THREE.Path(plate(.150, .160, .300, .012).map(([x, y]) => new THREE.Vector2(x, y)).reverse()));
  P.addGunExtra(new THREE.ExtrudeGeometry(hood, { depth: .030, bevelEnabled: false, steps: 1 }), 0, 0, .684);
  // Coaxial port in the recessed face, facing straight ahead: a flush dark mouth inside a low raised collar.
  const lip = [[.038, -.004], [.050, -.004], [.050, .006], [.046, .011], [.038, .011], [.038, -.004]] as const;
  P.addGunExtra(lathe(lip, [], P.q ? 20 : 12), 0, .232, .690);
  P.addGunExtraDark(cylZ(.038, .006, P.q ? 20 : 12), 0, .232, .690);
}
