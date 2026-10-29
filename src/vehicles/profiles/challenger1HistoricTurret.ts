// Challenger 1 turret and L11A5 (release 262). The Chobham turret is a slab-sided box (2.56 m wide, 77 % of the hull)
// with a long bustle and an arrowhead front (the drawing's plan, S1): full width to the 1.30 m station, then the cheeks
// run in at about 37 degrees to the gun nose, whose plates carry the wedge to the slot at its apex; the roof falls
// about 8 degrees over the front metre and the walls come down over the ring housing.
// The L11A5 leaves through a slot in the nose behind a drum shield turning about the trunnion and a recessed canvas
// boot; its thermal sleeve tapers to the muzzle, with the fume extractor at mid-length and the muzzle reference mirror.
// Turret stowage follows the Bovington vehicle: the TOGS barbette on the right cheek's top behind the wedge, the long
// mesh basket flush on the left wall, lidded bins behind both and the bustle bin hung across the back.
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
// (round 4, the drawing's plan and the Bovington front photo: the arrowhead front and walls down to 1.74 m, so only a
// shadow gap shows over the ring housing; round 3 had held the full width to 1.85 m and stood the walls on the collar)
const BODY: readonly TurretStation[] = [
  [-1.70, 1.06, 1.84, 2.43], [-1.30, 1.20, 1.80, 2.48], [-.50, 1.28, 1.74, 2.48],
  [1.00, 1.28, 1.74, 2.48], [1.30, 1.28, 1.74, 2.45], [2.06, .70, 1.72, 2.33],
];
/** The gun nose ahead of the 2.06 station: two plates either side of the slot (half-width SLOT), carrying the wedge on
 *  to the slot at its apex, flat underneath over the chin. */
const NOSE: readonly TurretStation[] = [[2.06, .70, 1.72, 2.33], [2.50, .40, 1.70, 2.24]];
const SLOT = .25;
/** The body's roof height at a station (linear between BODY stations), for fittings seated on the sloping roof. */
function roofAt(z: number): number {
  for (let i = 1; i < BODY.length; i++) {
    const [z0, , , h0] = BODY[i - 1], [z1, , , h1] = BODY[i];
    if (z <= z1) return h0 + (h1 - h0) * Math.max(0, (z - z0) / (z1 - z0));
  }
  return BODY[BODY.length - 1][3];
}

function shell(P: TankBuilderPort): void {
  P.add('turret', local(sectionSolid(BODY.map(([z, w, lo, hi]) => ({ z, ring: turretRing(w, lo, hi) })), { sideQuadDiagonal: 'convex' })));
  addChallenger1GunNose(P);
}

/** The gun nose ahead of the 2.06 m station (both plates either side of the slot), the slot's chin and the race
 *  collar: shared by every Challenger 1 turret, whose body meets the nose at that station (half-width 0.66, 1.70-2.29). */
export function addChallenger1GunNose(P: TankBuilderPort, nose: readonly TurretStation[] = NOSE): void {
  for (const side of [-1, 1]) {
    P.add('turret', local(sectionSolid(nose.map(([z, w, lo, hi]) => ({ z, ring: sided([
      [SLOT, lo + .04], [w - .03, lo], [w, lo + .04], [w, hi - .035], [w - .035, hi], [SLOT, hi],
    ], side) })), { sideQuadDiagonal: 'convex' })));
  }
  // The slot's floor under the gun (the chin), flush with the plates' underside and under the boot's sweep at full
  // depression, run into both nose plates.
  P.add('turret', box(SLOT * 2 + .10, .05, .44), ...at(0, 1.675, 2.28));
  // The ring housing under the slab walls: the race collar, recessed in their shadow, from the hull's ring well (2.10 m
  // ring) up into the turret floor.
  P.add('turret', cylY(1.05, 1.05, .34, P.q ? 48 : 28), ...at(0, 1.675, D.turretPivot[2]));
  // The gun well ahead of it, dark in the walls' shadow: the cradle's housing under the front, which holds the breech in
  // at full elevation and the recoil stroke (the tube's underside reaches 1.71 m at +20 degrees).
  P.addEquipment('turretDark', local(sectionSolid([
    { z: 1.25, ring: turretRing(.30, 1.66, 1.80) }, { z: 2.10, ring: turretRing(.30, 1.66, 1.80) },
  ], { sideQuadDiagonal: 'convex' })));
}

/** A lidded stowage bin welded to a wall: the body, its lid lapping 1 cm over, the hinge line and two latches. */
function bin(P: TankBuilderPort, x: number, y: number, z: number, w: number, h: number, len: number, side: number): void {
  eq(P, box(w, h, len), x, y, z);
  eq(P, box(w + .02, .022, len + .02), x + side * .005, y + h / 2 + .011, z);
  eq(P, cylX(.011, len - .06, 8).rotateY(Math.PI / 2), x - side * (w / 2 - .01), y + h / 2 + .018, z, 'turretDark');
  for (const dz of [-len * .32, len * .32]) eq(P, box(.024, .07, .05), x + side * (w / 2 + .010), y + h / 2 - .045, z + dz, 'turretDark');
}

function stowage(P: TankBuilderPort): void {
  // Flank bins: the right runs back from the barbette's foot, the left from the mesh basket; both to the bustle.
  bin(P, -1.365, 2.12, -.65, .17, .52, 1.50, -1);
  bin(P, 1.365, 2.12, -.86, .17, .52, 1.12, 1);
  // The bustle bin hung across the back at roof height on two hanger arms, lidded, with a jerrycan in a frame holder at
  // each end; nothing stands over the roof.
  const z0 = -1.69, z1 = -2.10, zc = (z0 + z1) / 2;
  eq(P, box(1.84, .40, z0 - z1), 0, 2.19, zc);
  eq(P, box(1.86, .022, z0 - z1 + .02), 0, 2.40, zc - .005);
  eq(P, cylX(.011, 1.76, 8), 0, 2.41, z0 - .015, 'turretDark');
  for (const x of [-.62, 0, .62]) eq(P, box(.10, .07, .024), x, 2.33, z1 - .012, 'turretDark');
  for (const x of [-.70, .70]) strut(P, [x, 2.06, -1.66], [x, 1.98, z1 + .04], .022);
  for (const side of [-1, 1]) {
    const x = side * 1.01;
    eq(P, box(.16, .44, .38), x, 2.17, zc, 'turretCloth');
    for (const y of [2.02, 2.34]) eq(P, box(.20, .02, z0 - z1 + .01), x, y, zc, 'turretDark');
    eq(P, box(.20, .46, .02), x, 2.18, z1 - .005, 'turretDark');
  }
}

/** An open mesh basket: a welded tube frame on its edges, wire mesh on its four walls, a floor plate, open on top. */
function basketBox(P: TankBuilderPort, [x0, x1]: readonly [number, number], [lo, hi]: readonly [number, number], [z0, z1]: readonly [number, number],
  pitch = .085, bar = .012): void {
  const edges: Array<[Vec3, Vec3]> = [];
  for (const y of [lo, hi]) edges.push([[x0, y, z0], [x1, y, z0]], [[x1, y, z0], [x1, y, z1]], [[x1, y, z1], [x0, y, z1]], [[x0, y, z1], [x0, y, z0]]);
  for (const x of [x0, x1]) for (const z of [z0, z1]) edges.push([[x, lo, z], [x, hi, z]]);
  for (const [a, b] of edges) strut(P, a, b, .016);
  const h = hi - lo, yc = (lo + hi) / 2;
  for (let z = z0 + pitch; z < z1 - .02; z += pitch) for (const x of [x0, x1]) eq(P, box(bar, h, bar), x, yc, z, 'turretDark');
  for (let x = x0 + pitch; x < x1 - .02; x += pitch) for (const z of [z0, z1]) eq(P, box(bar, h, bar), x, yc, z, 'turretDark');
  for (let y = lo + pitch; y < hi - .02; y += pitch) {
    for (const x of [x0, x1]) eq(P, box(bar, bar, z1 - z0), x, y, (z0 + z1) / 2, 'turretDark');
    for (const z of [z0, z1]) eq(P, box(x1 - x0, bar, bar), (x0 + x1) / 2, y, z, 'turretDark');
  }
  eq(P, box(x1 - x0, .02, z1 - z0), (x0 + x1) / 2, lo - .01, (z0 + z1) / 2);
}

/** The long fine-mesh basket flush on the left wall from the bins to the wedge (1.45 m long, 0.18 m deep), on welded
 *  arms, the crew's kit showing through it. */
function meshBasket(P: TankBuilderPort): void {
  const x0 = 1.29, x1 = 1.47, lo = 1.96, hi = 2.40, z0 = -.22, z1 = 1.23;
  basketBox(P, [x0, x1], [lo, hi], [z0, z1], .06, .008);
  for (const z of [z0 + .12, (z0 + z1) / 2, z1 - .12]) strut(P, [1.27, 1.93, z], [x1, lo - .015, z], .018);
  eq(P, box(.13, .26, .90), 1.355, lo + .13, .40, 'turretCloth');
  eq(P, box(.13, .18, .30), 1.355, lo + .09, -.02, 'turretCloth');
}

function togsBarbette(P: TankBuilderPort): void {
  // TOGS: the armoured thermal-sight barbette on the right cheek's top, set back behind the wedge (0.50 m wide, 0.95 m
  // long, its top 0.24 m over the roof, its outer face over the wall), the armoured door on its inner front half and the
  // right smoke bank on a bracket at its outer front corner (the Bovington front photo).
  const xi = .80, xo = 1.30, rear = .20, front = 1.15, lo = 2.44, hi = 2.72, c = .05;
  const ring: SectionPoint[] = sided([[xi, lo], [xo - c, lo], [xo, lo + c], [xo, hi - c], [xo - c, hi], [xi, hi]], -1);
  P.add('turret', local(sectionSolid([rear, front].map((z) => ({ z, ring })))));
  const dx = -.93, dy = 2.60;
  eq(P, box(.24, .20, .03), dx, dy, front + .012);
  eq(P, box(.18, .10, .012), dx, dy + .02, front + .03, 'turretDark');
  P.addModuleVisual('optics', 'turretGlass', box(.15, .07, .006), ...at(dx, dy + .02, front + .038));
  for (const ox of [-.10, .10]) eq(P, cylY(.014, .014, .16, 8), dx + ox, dy, front + .03, 'turretDark');
  eq(P, box(.10, .05, .16), -(xi + xo) / 2, hi + .025, rear + .20);
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
  // Loader's hatch (left); the one roof gun is the commander's L37.
  const lx = .48, lz = -.78;
  P.addHatch('turretDetail', cylY(.33, .34, .05, P.q ? 24 : 14), ...at(lx, roof + .025, lz));
  eq(P, torus(.33, .02, P.q ? 24 : 14, 6), lx, roof + .05, lz, 'turretDark');
  // Gunner's sight head ahead of the commander, the loader's periscope, the NBC pack and the vents.
  eq(P, box(.28, .17, .32), -.50, roof + .085, .78);
  eq(P, box(.22, .09, .02), -.50, roof + .11, .945, 'turretDark');
  P.addModuleVisual('optics', 'turretGlass', box(.18, .06, .008), ...at(-.50, roof + .11, .956));
  eq(P, box(.16, .08, .16), .55, roof + .04, .30);
  eq(P, box(.12, .04, .01), .55, roof + .05, .385, 'turretGlass');
  eq(P, box(.56, .12, .44), .62, roof + .06, -1.50);
  for (let i = 0; i < 5; i++) eq(P, box(.50, .012, .03), .62, roof + .123, -1.68 + i * .09, 'turretDark');
  eq(P, cylY(.09, .10, .06, 14), -.10, roof + .03, -1.30);
  // Aerial bases at the rear corners and lifting eyes on the roof edge.
  for (const [x, z] of [[-.92, -1.25], [.95, -1.10]] as const) {
    eq(P, cylY(.05, .06, .09, 12), x, roofAt(z) + .045, z);
    eq(P, cylY(.009, .012, 1.9, 6), x, roofAt(z) + 1.04, z, 'turretDark');
  }
  // lifting eyes lying on the roof, which falls toward the nose and the bustle
  for (const [x, z] of [[-.40, 1.45], [.98, .80], [-.98, -1.55], [.98, -1.55]] as const) {
    eq(P, torus(.045, .014, 10, 6), x, roofAt(z) + .010, z, 'turretDark');
  }
}

/** An L8 bank of five (three over two) standing proud on a bracket, the tubes angled up 35 degrees. */
export function challenger1SmokeBank(P: TankBuilderPort, bx: number, by: number, bz: number, yaw: number): void {
  const ux = Math.sin(yaw), uz = Math.cos(yaw);
  eq(P, box(.36, .26, .04), bx, by, bz, 'turretDetail', 0, yaw, 0);
  for (const s of [-1, 1]) eq(P, box(.04, .05, .14), bx + Math.cos(yaw) * s * .12 - ux * .07, by - .10, bz + Math.sin(-yaw) * s * .12 - uz * .07, 'turretDark', 0, yaw, 0);
  for (const [dx, dy] of [[-.11, .06], [0, .06], [.11, .06], [-.055, -.06], [.055, -.06]] as const) {
    const ox = Math.cos(yaw) * dx, oz = -Math.sin(yaw) * dx;
    eq(P, markSmokeTube(blindTube(.042, .029, .30, .14, P.q ? 14 : 8), [0, 0, 1], true).rotateX(-.61).rotateY(yaw),
      bx + ox + ux * .07, by + dy + .03, bz + oz + uz * .07);
  }
}

function smoke(P: TankBuilderPort): void {
  // The right bank at the barbette's outer front corner; the left on the left cheek, square to its 37-degree face.
  challenger1SmokeBank(P, -1.10, 2.56, 1.24, -.30);
  challenger1SmokeBank(P, 1.10, 2.16, 1.73, .92);
}

/** L11A5 120 mm rifled gun on its trunnion: drum shield, recessed canvas boot, a thermal sleeve tapering from 0.24 m to
 *  0.19 m with its straps, the fume extractor at mid-length and the muzzle reference mirror. */
export function addChallenger1Gun(P: TankBuilderPort): void {
  const T = D.trunnion[2];
  const lathe = (rows: readonly (readonly [number, number])[], segments = P.q ? 32 : 18): THREE.BufferGeometry =>
    new THREE.LatheGeometry(rows.map(([z, r]) => new THREE.Vector2(r, z - T)), segments).rotateX(Math.PI / 2);
  // (the tube's hidden rear ends just behind the drum shield, 0.30 m behind the trunnion: at full elevation it stays over
  // the turret's underside, which the seat lifts up to 12 cm over the engine deck, turretSeatRiseM)
  // (round 3: the sleeve 0.27 m over its rear half, the extractor 1.35 times the sleeve, the front half 0.22 to 0.19 m)
  const sleeve = (z: number): number => z < 4.9 ? .135 - .010 * (z - 2.40) / (4.58 - 2.40) : .112 - .016 * (z - 5.24) / (7.18 - 5.24);
  P.add('gun', lathe([[1.78, 0], [1.78, .135], [2.40, .135], [4.58, sleeve(4.58)], [4.64, .162],
    [5.18, .162], [5.24, sleeve(5.24)], [7.18, sleeve(7.18)], [7.20, .088], [7.39, .088], [7.39, 0]]));
  for (const z of [2.66, 3.16, 3.66, 4.16, 5.64, 6.14, 6.64]) {
    const r = sleeve(z) + .005;
    P.add('gunDark', lathe([[z - .016, r - .012], [z - .016, r], [z + .016, r], [z + .016, r - .012]], P.q ? 24 : 14));
  }
  // muzzle reference system mirror on a slim post over the muzzle: the mirror stands outside the 0.22 m round the bore
  // that the gun-barrel census cuts, the 3 cm post between two of its 4 cm stations (7.24 and 7.28 m), so the drawn
  // bore axis it fits stays the tube's
  P.add('gunDark', box(.08, .07, .18), 0, .27, 7.22 - T);
  P.add('gunDark', box(.02, .16, .028), 0, .165, 7.26 - T);
  // drum shield behind the nose slot, turning with the gun about the trunnion, and the canvas boot from inside the slot
  // onto the sleeve
  P.add('gunMount', cylX(.235, SLOT * 2 - .03, P.q ? 28 : 16), 0, 0, 0);
  // (round 4: the canvas cover nearly cylindrical, 0.38 m across, 0.30 m of it showing ahead of the nose, three low folds)
  const boot = (z: number): number => .19 - .025 * (z - 2.24) / .56;
  const bootRows: Array<[number, number]> = [[2.24, 0], [2.24, boot(2.24)]];
  for (const rib of [2.56, 2.66, 2.76]) bootRows.push([rib - .025, boot(rib - .025)], [rib, boot(rib) + .008], [rib + .025, boot(rib + .025)]);
  bootRows.push([2.80, boot(2.80)], [2.80, 0]);
  P.add('gunMountDark', lathe(bootRows, P.q ? 24 : 16));
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
export type { TurretStation as Challenger1TurretStation };
