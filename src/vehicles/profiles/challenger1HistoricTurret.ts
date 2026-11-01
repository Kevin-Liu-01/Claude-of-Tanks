// FV4030/5 turret and the Challenger 1's L11A5 (release 262; first built for the Challenger 1 Mk 2, then a fictional
// tank of its own, owner 2026-10-28). The turret (round 5; the owner: "the old challengerr 1 mk 2 has the better turret
// shape though, that is wider, very sloped, good things on side. combine ur new and the old") is main's wide wedge: a
// slab-sided box 2.96 m wide with a long bustle, and ahead of the 0.60 m station two broad cheek plates falling 20
// degrees off the roof to a low lip flush with the gun's face and away outward from the gun ridge, which runs level to
// 1.40 m and then falls 19 degrees to the slot's nose plates; a mesh basket and a lidded bin run each flank to the
// cheeks.
// The L11A5 leaves through a slot in the nose behind a drum shield turning about the trunnion and a recessed canvas
// boot; its thermal sleeve tapers to the muzzle, with the fume extractor at mid-length and the muzzle reference mirror.
// Turret stowage follows the Bovington vehicle: the TOGS barbette on the right cheek beside the gun, the right smoke bank
// on its face, baskets and bins down both walls and the bustle bin hung across the back.
import * as THREE from 'three';
import { antennaPart } from './antennaPart.ts';
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
// (round 5: main's width and wedge; round 4's arrowhead had narrowed the box to 2.56 m and pointed it from 1.30 m)
const BODY: readonly TurretStation[] = [
  [-1.70, 1.34, 1.84, 2.43], [-1.30, 1.48, 1.80, 2.48], [-.50, 1.48, 1.74, 2.48], [.60, 1.48, 1.74, 2.48],
];
/** The gun ridge between the cheeks: level with the roof to 1.40 m, then falling 19 degrees to the nose plates. */
const HOUSING: readonly TurretStation[] = [[.50, .70, 1.74, 2.48], [1.40, .70, 1.74, 2.48], [2.06, .70, 1.72, 2.25]];
/** The gun nose ahead of the ridge, carrying its fall on to the slot's face. */
const NOSE: readonly TurretStation[] = [[2.06, .70, 1.72, 2.25], [2.50, .40, 1.70, 2.08]];
/** The cheek plates either side of the ridge, [z, inner x, outer x, underside]: their top runs from the ridge's edge,
 *  falling with it, out to the wall, which falls 20 degrees from the 0.60 m station to the lip (main's V from the front). */
const CHEEK_FROM = .60, FALL_OUT = Math.tan(20 * Math.PI / 180);
const CHEEK: ReadonlyArray<readonly [z: number, xi: number, xo: number, lo: number]> = [
  [.50, .60, 1.48, 1.74], [CHEEK_FROM, .60, 1.48, 1.74], [1.00, .60, 1.47, 1.74], [1.40, .60, 1.46, 1.74],
  [1.73, .61, 1.45, 1.73], [2.06, .62, 1.44, 1.72],
  // the lip flush with the nose plates' face, its inner edge on their taper (0.40 there)
  [2.50, .38, 1.40, 1.70],
];
const cheekOuter = (z: number): number => 2.48 - Math.max(0, z - CHEEK_FROM) * FALL_OUT;
/** The ridge's edge the cheek's top starts from: the housing wall, then the nose plate's taper to the lip. */
const ridgeEdge = (z: number): number => z <= 2.06 ? .70 : .70 - (z - 2.06) * .30 / .44;
const ridgeTop = (z: number): number => z <= 2.06 ? housingTop(z) : topAt(NOSE, z);
/** The cheek's top at |x| between the ridge's edge and the wall (1.44 m). */
function cheekTop(z: number, x = 1.44): number {
  const e = ridgeEdge(z), t = Math.min(1, Math.max(0, (Math.abs(x) - e) / (1.44 - e)));
  return ridgeTop(z) + (cheekOuter(z) - ridgeTop(z)) * t;
}
const SLOT = .25;
/** The TOGS barbette's face (vehicle frame). */
const TOGS_FRONT = 1.75;
/** A station table's roof height at z (linear between stations), for fittings seated on a sloping roof. */
function topAt(stations: readonly TurretStation[], z: number): number {
  for (let i = 1; i < stations.length; i++) {
    const [z0, , , h0] = stations[i - 1], [z1, , , h1] = stations[i];
    if (z <= z1) return h0 + (h1 - h0) * Math.max(0, (z - z0) / (z1 - z0));
  }
  return stations[stations.length - 1][3];
}
const roofAt = (z: number): number => topAt(BODY, z), housingTop = (z: number): number => topAt(HOUSING, z);

function shell(P: TankBuilderPort): void {
  P.add('turret', local(sectionSolid(BODY.map(([z, w, lo, hi]) => ({ z, ring: turretRing(w, lo, hi) })), { sideQuadDiagonal: 'convex' })));
  P.add('turret', local(sectionSolid(HOUSING.map(([z, w, lo, hi]) => ({ z, ring: turretRing(w, lo, hi) })), { sideQuadDiagonal: 'convex' })));
  for (const side of [-1, 1]) {
    P.add('turret', local(sectionSolid(CHEEK.map(([z, xi, xo, lo]) => ({ z, ring: sided([
      [xi, lo], [xo - .03, lo], [xo, lo + .03], [xo, cheekOuter(z) - .03], [xo - .03, cheekOuter(z)], [ridgeEdge(z), ridgeTop(z)],
      [xi, ridgeTop(z)],
    ], side) })), { sideQuadDiagonal: 'convex' })));
  }
  addChallenger1GunNose(P, NOSE);
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

/** A lidded flank bin on the wall ahead of the basket, its nose raked down onto the cheek, latched. */
function flankBin(P: TankBuilderPort, side: number, z0: number, z1: number): void {
  const xi = 1.44, xo = 1.66, lo = 1.88, hi = 2.30;
  const ring = (top: number): SectionPoint[] => sided([[xi, lo], [xo - .02, lo], [xo, lo + .02], [xo, top], [xi, top]], side);
  P.addEquipment('turretDetail', local(sectionSolid([
    { z: z0, ring: ring(hi) }, { z: z1 - .40, ring: ring(hi) }, { z: z1, ring: ring(lo + .14) },
  ])));
  const x = side * (xi + xo) / 2, zc = (z0 + z1 - .40) / 2;
  eq(P, box(xo - xi + .02, .022, z1 - z0 - .38), x, hi + .011, zc);
  eq(P, cylX(.011, z1 - z0 - .46, 8).rotateY(Math.PI / 2), side * (xi + .02), hi + .018, zc, 'turretDark');
  for (const t of [.18, .50, .82]) eq(P, box(.024, .07, .05), side * (xo + .010), hi - .045, z0 + (z1 - .40 - z0) * t, 'turretDark');
}

/** A grab handle on a wall: a bar on two stand-offs. */
function grabHandle(P: TankBuilderPort, side: number, y: number, z: number): void {
  const x0 = side * 1.47, x1 = side * 1.53;
  for (const dz of [-.14, .14]) strut(P, [x0, y, z + dz], [x1, y, z + dz], .011);
  strut(P, [x1, y, z - .15], [x1, y, z + .15], .011);
}

function stowage(P: TankBuilderPort): void {
  // Flank stowage: on the right a mesh basket behind a lidded bin, on the left a short bin behind the long basket; grab
  // handles along both walls over them.
  flankBin(P, -1, .10, 1.40);
  bin(P, 1.56, 2.09, -.80, .22, .42, .90, 1);
  // a strapped camouflage-net roll on the right bin's lid
  eq(P, cylX(.085, .76, P.q ? 14 : 9).rotateY(Math.PI / 2), -1.55, 2.405, .50, 'turretCloth');
  for (const z of [.27, .73]) eq(P, torus(.090, .012, P.q ? 14 : 8, 5).rotateX(Math.PI / 2), -1.55, 2.405, z, 'turretDark');
  for (const side of [-1, 1]) for (const z of [-1.05, -.25, .35]) grabHandle(P, side, 2.40, z);
  // The bustle bin hung across the back at roof height on two hanger arms, lidded, with a jerrycan in a frame holder at
  // each end; nothing stands over the roof.
  const z0 = -1.69, z1 = -2.10, zc = (z0 + z1) / 2;
  eq(P, box(2.04, .40, z0 - z1), 0, 2.19, zc);
  eq(P, box(2.06, .022, z0 - z1 + .02), 0, 2.40, zc - .005);
  eq(P, cylX(.011, 1.96, 8), 0, 2.41, z0 - .015, 'turretDark');
  for (const x of [-.62, 0, .62]) eq(P, box(.10, .07, .024), x, 2.33, z1 - .012, 'turretDark');
  for (const x of [-.70, .70]) strut(P, [x, 2.06, -1.66], [x, 1.98, z1 + .04], .022);
  // a strapped bedroll across the lid
  eq(P, cylX(.095, 1.30, P.q ? 14 : 9), 0, 2.51, zc - .02, 'turretCloth');
  for (const x of [-.40, .40]) eq(P, torus(.100, .012, P.q ? 14 : 8, 5).rotateZ(Math.PI / 2), x, 2.51, zc - .02, 'turretDark');
  for (const side of [-1, 1]) {
    const x = side * 1.10;
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

/** The fine-mesh baskets on welded arms: the long one on the left wall from the bin to the cheek, the right one behind
 *  the right bin; the crew's kit shows through them. */
function meshBasket(P: TankBuilderPort): void {
  const x0 = 1.47, x1 = 1.67, lo = 1.90, hi = 2.30;
  for (const [side, z0, z1] of [[1, -.30, 1.25], [-1, -1.20, .05]] as const) {
    const [a, b] = side > 0 ? [x0, x1] : [-x1, -x0], xa = side * 1.44, xb = side * x1, xc = side * (x0 + x1) / 2;
    basketBox(P, [a, b], [lo, hi], [z0, z1], .06, .008);
    for (const z of [z0 + .12, (z0 + z1) / 2, z1 - .12]) strut(P, [xa, 1.87, z], [xb, lo - .015, z], .018);
    // bedding along it and a kit bag at its back
    eq(P, box(.15, .24, z1 - z0 - .65), xc, lo + .12, (z0 + z1) / 2 - .05, 'turretCloth');
    eq(P, box(.15, .16, .30), xc, lo + .08, z0 + .20, 'turretCloth');
  }
  // a jerrycan standing at the front of the left basket
  eq(P, box(.15, .32, .30), 1.57, lo + .16, 1.04, 'turretCloth');
  eq(P, box(.07, .03, .05), 1.57, lo + .335, .98, 'turretDark');
}

function togsBarbette(P: TankBuilderPort): void {
  // TOGS: the armoured thermal-sight barbette on the right cheek beside the gun (0.69 m wide, 1.05 m long, its top 0.24
  // m over the roof, its foot following the cheek's fall, the front's top edge chamfered), the armoured door on the inner
  // half of its face and the right smoke bank on the outer half.
  const xi = .69, xo = 1.38, rear = .70, front = TOGS_FRONT, c = .05;
  const ring = (lo: number, hi: number): SectionPoint[] => sided([[xi, lo], [xo - c, lo], [xo, lo + c], [xo, hi - c], [xo - c, hi], [xi, hi]], -1);
  P.add('turret', local(sectionSolid([[rear, 2.72], [1.20, 2.72], [front - .12, 2.72], [front, 2.62]].map(([z, hi]) => ({
    z, ring: ring(cheekOuter(z) - .04, hi) })))));
  const dx = -.84, dy = 2.36;
  eq(P, box(.24, .20, .03), dx, dy, front + .012);
  eq(P, box(.18, .10, .012), dx, dy + .02, front + .03, 'turretDark');
  P.addModuleVisual('optics', 'turretGlass', box(.15, .07, .006), ...at(dx, dy + .02, front + .038));
  for (const ox of [-.10, .10]) eq(P, cylY(.014, .014, .16, 8), dx + ox, dy, front + .03, 'turretDark');
  eq(P, box(.10, .05, .16), -(xi + xo) / 2, 2.745, rear + .20);
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
  // its hinge at the back, a handle and the periscope on the lid
  eq(P, cylX(.03, .34, 10), lx, roof + .06, lz - .34, 'turretDark');
  for (const dx of [-.12, .12]) eq(P, box(.04, .04, .14), lx + dx, roof + .06, lz - .26, 'turretDark');
  strut(P, [lx - .08, roof + .10, lz + .14], [lx + .08, roof + .10, lz + .14], .011, 'turretDark');
  for (const dx of [-.08, .08]) strut(P, [lx + dx, roof + .05, lz + .14], [lx + dx, roof + .10, lz + .14], .010, 'turretDark');
  eq(P, box(.14, .06, .10), lx, roof + .08, lz - .05);
  // Gunner's sight head on the gun housing ahead of the commander, the loader's periscope, the NBC pack and the vents.
  eq(P, box(.26, .17, .32), -.50, roof + .06, .78);
  eq(P, box(.22, .09, .02), -.50, roof + .10, .945, 'turretDark');
  P.addModuleVisual('optics', 'turretGlass', box(.18, .06, .008), ...at(-.50, roof + .10, .956));
  eq(P, box(.16, .08, .16), .55, roof + .04, .30);
  eq(P, box(.12, .04, .01), .55, roof + .05, .385, 'turretGlass');
  eq(P, box(.56, .12, .44), .62, roof + .06, -1.50);
  for (let i = 0; i < 5; i++) eq(P, box(.50, .012, .03), .62, roof + .123, -1.68 + i * .09, 'turretDark');
  eq(P, cylY(.09, .10, .06, 14), -.10, roof + .03, -1.30);
  // Aerial bases at the rear corners and lifting eyes on the roof edge.
  for (const [x, z] of [[-.92, -1.25], [.95, -1.10]] as const) {
    eq(P, cylY(.05, .06, .09, 12), x, roofAt(z) + .045, z);
    eq(P, antennaPart(cylY(.009, .012, 1.9, 6)), x, roofAt(z) + 1.04, z, 'turretDark');
  }
  // lifting eyes lying on the housing, a cheek and the bustle roof
  for (const [x, y, z] of [[-.40, housingTop(1.45), 1.45], [.98, cheekTop(.80, .98), .80], [-.98, roofAt(-1.55), -1.55],
    [.98, roofAt(-1.55), -1.55]] as const) {
    eq(P, torus(.045, .014, 10, 6), x, y + .010, z, 'turretDark');
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
  // The right bank on the barbette's face beside its door; the left low on the left cheek's front, on a bracket block
  // whose foot follows the cheek's fall and its outward slope, its top level just over the cheek's highest point under
  // it. Both fire forward and about 15 degrees out.
  challenger1SmokeBank(P, -1.17, 2.42, TOGS_FRONT + .025, -.26);
  const x = 1.08, z = 2.00, yaw = .26;
  const under = [-.19, .19].flatMap((dx) => [-.10, .10].map((dz) => cheekTop(z + dz, x + dx)));
  const top = Math.max(...under) + .01, foot = Math.min(...under) - .02;
  eq(P, box(.38, top - foot, .20), x, (top + foot) / 2, z - .03, 'turretDetail', 0, yaw, 0);
  challenger1SmokeBank(P, x, top + .13, z, yaw);
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
  P.turretG.userData.challenger1Turret = Object.freeze({ mark, widthM: 2.60, roofY: 2.48, slotHalfWidthM: SLOT, noseZ: NOSE[NOSE.length - 1][0] });
  // the gun-port receipt's face (turret frame): the nose plates' front, ahead of which the tube runs in the open
  P.turretG.userData.gunPort = Object.freeze({ faceZ: CHALLENGER1_PORT_FACE_Z - PZ, kind: 'slot' });
}
/** The nose plates' front (vehicle frame), the gun-port receipt's face. */
export const CHALLENGER1_PORT_FACE_Z = NOSE[NOSE.length - 1][0];
export type { TurretStation as Challenger1TurretStation };
