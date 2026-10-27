// Challenger 1 turret and L11A5 (release 262). The Chobham turret is a tall slab-sided box (0.86 m walls, 2.56 m wide,
// 77 % of the hull) with a long bustle and a stepped wedge front: the cheeks turn in at 35 degrees from the 1.10 m
// station to the gun nose, whose plates carry on at 18 degrees to the gun slot; the roof falls 26 cm over the same run.
// The L11A5 leaves through a slot in the nose behind a drum shield turning about the trunnion and a recessed canvas
// boot; its thermal sleeve tapers to the muzzle, with the fume extractor at mid-length and the muzzle reference mirror.
// Turret stowage follows the Bovington vehicle: the TOGS barbette on the right front corner, the mesh basket wrapping
// the left front cheek, lidded bins down both flanks and the bustle bin across the back.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween, blindTube } from './measuredPrimitives.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { CR1_HISTORIC as D, type Challenger1Mark } from './challenger1HistoricFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, torus } = KIT;
type Vec3 = [number, number, number];
const [PX, PY, PZ] = D.turretPivot;
/** World-authored stock into the turret frame. */
const local = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.translate(-PX, -PY, -PZ);
const at = (x: number, y: number, z: number): Vec3 => [x - PX, y - PY, z - PZ];
function eq(P: TankBuilderPort, g: THREE.BufferGeometry, x: number, y: number, z: number, bucket = 'turretDetail', rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, g, ...at(x, y, z), rx, ry, rz);
}
/** A beam between two vehicle-frame points, in the turret frame. */
function strut(P: TankBuilderPort, a: Vec3, b: Vec3, r: number, bucket = 'turretDetail'): void {
  P.addEquipment(bucket, beamBetween(at(...a), at(...b), r, 8));
}
function sided(ring: readonly SectionPoint[], side: number): SectionPoint[] {
  return side > 0 ? [...ring] : ring.map(([x, y]) => [-x, y] as const).reverse();
}
/** Slab-sided turret section: vertical walls, a 4 cm chamfered foot and a narrow 3.5 cm roof bevel. */
function turretRing(w: number, lo: number, hi: number): SectionPoint[] {
  const c = .04, r = .035;
  return [[-w + c, lo], [w - c, lo], [w, lo + c], [w, hi - r], [w - r, hi], [-w + r, hi], [-w, hi - r], [-w, lo + c]];
}

// [z, half-width, underside, roof] in the vehicle frame
type TurretStation = readonly [z: number, w: number, lo: number, hi: number];
const BODY: readonly TurretStation[] = [
  [-1.85, 1.06, 1.72, 2.43], [-1.40, 1.20, 1.67, 2.48], [-.50, 1.28, 1.62, 2.48],
  [1.10, 1.28, 1.62, 2.48], [1.70, .86, 1.64, 2.37], [2.06, .66, 1.70, 2.29],
];
/** The gun nose ahead of the 2.06 station: two plates either side of the slot (half-width SLOT). */
const NOSE: readonly TurretStation[] = [[2.06, .66, 1.70, 2.29], [2.36, .50, 1.80, 2.24]];
const SLOT = .25;

function shell(P: TankBuilderPort): void {
  P.add('turret', local(sectionSolid(BODY.map(([z, w, lo, hi]) => ({ z, ring: turretRing(w, lo, hi) })), { sideQuadDiagonal: 'convex' })));
  addChallenger1GunNose(P);
}

/** The gun nose ahead of the 2.06 m station (both plates either side of the slot), the slot's chin and the race
 *  collar: shared by every Challenger 1 turret, whose body meets the nose at that station (half-width 0.66, 1.70-2.29). */
export function addChallenger1GunNose(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    P.add('turret', local(sectionSolid(NOSE.map(([z, w, lo, hi]) => ({ z, ring: sided([
      [SLOT, lo + .04], [w - .03, lo], [w, lo + .04], [w, hi - .035], [w - .035, hi], [SLOT, hi],
    ], side) })), { sideQuadDiagonal: 'convex' })));
  }
  // The slot's floor under the gun (the chin), 1.5 cm under the drum shield's sweep.
  P.add('turret', box(SLOT * 2 + .02, .05, .26), ...at(0, 1.71, 2.23));
  // The race collar under the turret floor, inside the hull's ring well (2.10 m ring).
  P.add('turret', cylY(1.05, 1.05, .12, P.q ? 48 : 28), ...at(0, 1.565, D.turretPivot[2]));
}

/** A lidded stowage bin welded to a wall: the body, its lid lapping 1 cm over, the hinge line and two latches. */
function bin(P: TankBuilderPort, x: number, y: number, z: number, w: number, h: number, len: number, side: number): void {
  eq(P, box(w, h, len), x, y, z);
  eq(P, box(w + .02, .022, len + .02), x + side * .005, y + h / 2 + .011, z);
  eq(P, cylX(.011, len - .06, 8).rotateY(Math.PI / 2), x - side * (w / 2 - .01), y + h / 2 + .018, z, 'turretDark');
  for (const dz of [-len * .32, len * .32]) eq(P, box(.024, .07, .05), x + side * (w / 2 + .010), y + h / 2 - .045, z + dz, 'turretDark');
}

function stowage(P: TankBuilderPort): void {
  // Flank bins: the right runs back from the barbette, the left from the mesh basket; both to the bustle.
  bin(P, -1.365, 2.07, -.80, .17, .54, 2.10, -1);
  bin(P, 1.365, 2.07, -.98, .17, .54, 1.74, 1);
  // The bustle bin across the back, over its welded shelf, and the cam-net roll strapped on top.
  eq(P, box(2.08, .05, .46), 0, 1.80, -2.06);
  eq(P, box(2.04, .52, .42), 0, 2.08, -2.06);
  eq(P, box(2.08, .022, .44), 0, 2.351, -2.08);
  for (const x of [-.68, 0, .68]) eq(P, box(.10, .07, .03), x, 2.24, -2.282, 'turretDark');
  eq(P, cylX(.11, 1.30, P.q ? 16 : 10), 0, 2.47, -2.10, 'turretCloth');
  for (const x of [-.42, .42]) eq(P, torus(.115, .012, P.q ? 14 : 8, 5).rotateY(Math.PI / 2), x, 2.47, -2.10, 'turretDark');
}

/** The mesh basket wrapping the left front cheek: a welded tube frame, mesh on its outer face and front, a floor. */
function meshBasket(P: TankBuilderPort): void {
  const x0 = 1.28, x1 = 1.50, z0 = -.06, z1 = 1.02, lo = 1.74, hi = 2.40, bar = .012, pitch = .085;
  const frame: Array<readonly [Vec3, Vec3]> = [];
  for (const y of [lo, hi]) frame.push([[x1, y, z0], [x1, y, z1]], [[x0, y, z1 + .02], [x1, y, z1]]);
  for (const z of [z0, (z0 + z1) / 2, z1]) frame.push([[x1, lo, z], [x1, hi, z]]);
  frame.push([[x0, lo, z1 + .02], [x0, hi, z1 + .02]]);
  for (const [a, b] of frame) strut(P, a, b, .016);
  // outer face: vertical and horizontal wires on the grid
  for (let z = z0 + pitch; z < z1 - .02; z += pitch) eq(P, box(bar, hi - lo, bar), x1, (lo + hi) / 2, z, 'turretDark');
  for (let y = lo + pitch; y < hi - .02; y += pitch) eq(P, box(bar, bar, z1 - z0), x1, y, (z0 + z1) / 2, 'turretDark');
  // front face back to the cheek
  for (let x = x0 + .06; x < x1 - .02; x += pitch) eq(P, box(bar, hi - lo, bar), x, (lo + hi) / 2, z1 + .01, 'turretDark');
  for (let y = lo + pitch; y < hi - .02; y += pitch) eq(P, box(x1 - x0, bar, bar), (x0 + x1) / 2, y, z1 + .01, 'turretDark');
  // floor plate on two brackets to the wall, and a stowed load seen through the mesh
  eq(P, box(x1 - x0, .02, z1 - z0), (x0 + x1) / 2, lo - .01, (z0 + z1) / 2);
  for (const z of [z0 + .12, z1 - .12]) eq(P, box(x1 - x0 + .01, .07, .04), (x0 + x1) / 2, lo - .05, z);
  eq(P, box(.16, .30, .70), 1.385, lo + .16, .45, 'turretCloth');
}

function togsBarbette(P: TankBuilderPort): void {
  // TOGS: the armoured thermal-sight barbette on the right front corner, 0.55 m wide and 1.0 m long, standing 0.14 m
  // over the roof, its armoured door square across the front, the outer face chamfered; it stands on the right cheek
  // and wall and on two struts where it overhangs the cheek's turn.
  const xi = .80, xo = 1.35, rear = .52, front = 1.52, lo = 1.94, hi = 2.62, c = .06;
  const ring: SectionPoint[] = sided([[xi, lo], [xo - c, lo], [xo, lo + c], [xo, hi - c], [xo - c, hi], [xi, hi]], -1);
  P.addModuleVisual('optics', 'turret', local(sectionSolid([rear, front].map((z) => ({ z, ring })))));
  const cx = -(xi + xo) / 2;
  eq(P, box(xo - xi - .08, hi - lo - .10, .03), cx, (lo + hi) / 2, front + .012);
  eq(P, box(xo - xi - .16, .16, .012), cx, (lo + hi) / 2 + .06, front + .03, 'turretDark');
  P.addModuleVisual('optics', 'turretGlass', box(xo - xi - .20, .12, .006), ...at(cx, (lo + hi) / 2 + .06, front + .038));
  for (const dx of [-.20, .20]) eq(P, cylY(.018, .018, hi - lo - .14, 8), cx + dx, (lo + hi) / 2, front + .03, 'turretDark');
  for (const z of [front - .16, front - .02]) strut(P, [-.92, 1.80, z], [-1.22, lo - .01, z], .022);
  eq(P, box(.10, .06, .18), cx, hi + .03, rear + .30);
}

function roofFittings(P: TankBuilderPort): void {
  const roof = 2.48;
  // Commander's cupola (right): one low drum with eight vision blocks, its hatch and the sight head ahead of it.
  const cx = -.50, cz = -.52;
  P.addCupola('turret', cylY(.42, .45, .17, P.q ? 32 : 18), ...at(cx, roof + .085, cz));
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + Math.PI / 8;
    eq(P, box(.11, .07, .05), cx + Math.sin(a) * .42, roof + .10, cz + Math.cos(a) * .42, 'turretDark', 0, a, 0);
    P.addModuleVisual('optics', 'turretGlass', box(.08, .045, .01), ...at(cx + Math.sin(a) * .447, roof + .10, cz + Math.cos(a) * .447), 0, a, 0);
  }
  P.addHatch('turretDetail', cylY(.31, .33, .045, P.q ? 24 : 14), ...at(cx, roof + .19, cz - .02));
  eq(P, box(.26, .20, .24), cx + .02, roof + .27, cz + .30);
  eq(P, box(.20, .10, .02), cx + .02, roof + .30, cz + .425, 'turretDark');
  P.addModuleVisual('optics', 'turretGlass', box(.17, .07, .008), ...at(cx + .02, roof + .30, cz + .437));
  {
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'dark', scale: 1.0, seed: 8, riser: .08, working: true, ridingCradle: true });
    mg.name = 'challenger1CommanderL37';
    mg.position.set(...at(cx - .30, roof + .17, cz - .10));
    mg.rotation.y = .04;
    P.turretG.add(mg);
  }
  // Loader's hatch (left) with its pintle GPMG.
  const lx = .48, lz = -.78;
  P.addHatch('turretDetail', cylY(.33, .34, .05, P.q ? 24 : 14), ...at(lx, roof + .025, lz));
  eq(P, torus(.33, .02, P.q ? 24 : 14, 6), lx, roof + .05, lz, 'turretDark', Math.PI / 2, 0, 0);
  {
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'dark', elev: .05, scale: 1.0, seed: 7, riser: .10, working: true, ridingCradle: true });
    mg.name = 'challenger1LoaderGPMG';
    mg.position.set(...at(lx + .30, roof + .05, lz + .05));
    mg.rotation.y = -.05;
    P.turretG.add(mg);
  }
  // Gunner's sight head ahead of the commander, the loader's periscope, the NBC pack and the vents.
  eq(P, box(.28, .17, .32), -.56, roof + .085, .78);
  eq(P, box(.22, .09, .02), -.56, roof + .11, .945, 'turretDark');
  P.addModuleVisual('optics', 'turretGlass', box(.18, .06, .008), ...at(-.56, roof + .11, .956));
  eq(P, box(.16, .08, .16), .55, roof + .04, .30);
  eq(P, box(.12, .04, .01), .55, roof + .05, .385, 'turretGlass');
  eq(P, box(.56, .12, .44), .62, roof + .06, -1.50);
  for (let i = 0; i < 5; i++) eq(P, box(.50, .012, .03), .62, roof + .123, -1.68 + i * .09, 'turretDark');
  eq(P, cylY(.09, .10, .06, 14), -.10, roof + .03, -1.30);
  // Aerial bases at the rear corners and lifting eyes on the roof edge.
  for (const [x, z] of [[-.92, -1.62], [.95, -1.10]] as const) {
    eq(P, cylY(.05, .06, .09, 12), x, roof + .045, z);
    eq(P, cylY(.009, .012, 1.9, 6), x, roof + 1.04, z, 'turretDark');
  }
  for (const [x, z] of [[-.66, 1.30], [.98, .80], [-.98, -1.55], [.98, -1.75]] as const) {
    eq(P, torus(.045, .014, 10, 6), x, roof + .045, z, 'turretDark');
  }
}

function smoke(P: TankBuilderPort): void {
  // Two L8 banks of five (three over two) on the cheek fronts either side of the gun, splayed outward.
  for (const side of [-1, 1]) {
    const bx = side * .74, bz = 1.92, by = 2.12, yaw = side * .38;
    eq(P, box(.32, .22, .08), bx, by - .01, bz - .05, 'turretDetail', 0, yaw, 0);
    for (const [dx, dy] of [[-.10, .055], [0, .055], [.10, .055], [-.05, -.055], [.05, -.055]] as const) {
      const ox = Math.cos(yaw) * dx, oz = -Math.sin(yaw) * dx;
      eq(P, markSmokeTube(blindTube(.04, .028, .22, .12, P.q ? 14 : 8), [0, 0, 1], true).rotateX(-.20).rotateY(yaw),
        bx + ox, by + dy, bz + oz + .06);
    }
  }
}

/** L11A5 120 mm rifled gun on its trunnion: drum shield, recessed canvas boot, a thermal sleeve tapering from 0.24 m to
 *  0.19 m with its straps, the fume extractor at mid-length and the muzzle reference mirror. */
export function addChallenger1Gun(P: TankBuilderPort): void {
  const T = D.trunnion[2];
  const lathe = (rows: readonly (readonly [number, number])[], segments = P.q ? 32 : 18): THREE.BufferGeometry =>
    new THREE.LatheGeometry(rows.map(([z, r]) => new THREE.Vector2(r, z - T)), segments).rotateX(Math.PI / 2);
  const sleeve = (z: number): number => .12 - .025 * (z - 2.40) / (7.18 - 2.40);
  // (the tube's hidden rear ends just behind the drum shield, 0.30 m behind the trunnion: at full elevation it stays over
  // the turret's underside, which the seat lifts up to 12 cm over the engine deck, turretSeatRiseM)
  P.add('gun', lathe([[1.78, 0], [1.78, .125], [2.40, .125], [2.40, sleeve(2.40)], [4.58, sleeve(4.58)], [4.62, .138],
    [5.20, .138], [5.24, sleeve(5.24)], [7.18, sleeve(7.18)], [7.20, .088], [7.39, .088], [7.39, 0]]));
  for (const z of [2.66, 3.16, 3.66, 4.16, 5.64, 6.14, 6.64]) {
    const r = sleeve(z) + .005;
    P.add('gunDark', lathe([[z - .016, r - .012], [z - .016, r], [z + .016, r], [z + .016, r - .012]], P.q ? 24 : 14));
  }
  // muzzle reference system mirror on a slim strut over the muzzle (held clear of the tube's own section, so the drawn
  // bore axis the gun-barrel census fits stays the tube's)
  P.add('gunDark', box(.07, .05, .14), 0, .175, 7.25 - T);
  P.add('gunDark', box(.02, .07, .03), 0, .12, 7.27 - T);
  // drum shield behind the nose slot, turning with the gun about the trunnion, and the canvas boot from inside the slot
  // onto the sleeve
  P.add('gunMount', cylX(.235, SLOT * 2 - .03, P.q ? 28 : 16), 0, 0, 0);
  P.add('gunMountCloth', lathe([[2.22, 0], [2.22, .225], [2.30, .232], [2.40, .222], [2.50, .185], [2.60, .14], [2.60, 0]], P.q ? 24 : 14));
  P.muzzleZ = D.muzzleZ - T;
}

export function addChallenger1HistoricTurret(P: TankBuilderPort, mark: Challenger1Mark): void {
  shell(P);
  stowage(P);
  meshBasket(P);
  togsBarbette(P);
  roofFittings(P);
  smoke(P);
  addChallenger1Gun(P);
  P.turretG.userData.challenger1Turret = Object.freeze({ mark, widthM: 2.56, roofY: 2.48, slotHalfWidthM: SLOT, noseZ: NOSE[NOSE.length - 1][0] });
  // the gun-port receipt's face (turret frame): the nose plates' front, ahead of which the tube runs in the open
  P.turretG.userData.gunPort = Object.freeze({ faceZ: CHALLENGER1_PORT_FACE_Z - PZ, kind: 'slot' });
}
/** The nose plates' front (vehicle frame), the gun-port receipt's face. */
export const CHALLENGER1_PORT_FACE_Z = NOSE[NOSE.length - 1][0];
