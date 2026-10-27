// Challenger 1 turret and L11A5 (release 262). The Chobham turret is a tall slab-sided box (0.86 m walls, 2.56 m wide,
// 77 % of the hull) with a long bustle and a stepped wedge front: the cheeks turn in at 35 degrees from the 1.10 m
// station to the gun nose, whose plates carry on at 18 degrees to the gun slot; the roof falls 26 cm over the same run.
// The L11A5 leaves through a slot in the nose behind a drum shield turning about the trunnion and a canvas boot; its
// thermal sleeve, fume extractor and muzzle reference mirror follow the published 6.6 m, 55-calibre tube.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween, blindTube } from './measuredPrimitives.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { CR1_HISTORIC as D, type Challenger1Mark } from './challenger1HistoricFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, torus } = KIT;
const [PX, PY, PZ] = D.turretPivot;
/** World-authored stock into the turret frame. */
const local = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.translate(-PX, -PY, -PZ);
const at = (x: number, y: number, z: number): [number, number, number] => [x - PX, y - PY, z - PZ];
function eq(P: TankBuilderPort, g: THREE.BufferGeometry, x: number, y: number, z: number, bucket = 'turretDetail', rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, g, ...at(x, y, z), rx, ry, rz);
}
function sided(ring: readonly SectionPoint[], side: number): SectionPoint[] {
  return side > 0 ? [...ring] : ring.map(([x, y]) => [-x, y] as const).reverse();
}
/** Slab-sided turret section: vertical walls, a 5 cm chamfered foot and an 8 cm roof chamfer. */
function turretRing(w: number, lo: number, hi: number): SectionPoint[] {
  const c = .05, r = .08;
  return [[-w + c, lo], [w - c, lo], [w, lo + c], [w, hi - r], [w - r, hi], [-w + r, hi], [-w, hi - r], [-w, lo + c]];
}

// [z, half-width, underside, roof] in the vehicle frame
type TurretStation = readonly [z: number, w: number, lo: number, hi: number];
const BODY: readonly TurretStation[] = [
  [-2.05, 1.06, 1.72, 2.43], [-1.55, 1.20, 1.67, 2.48], [-.50, 1.28, 1.62, 2.48],
  [1.10, 1.28, 1.62, 2.48], [1.70, .86, 1.64, 2.37], [2.06, .62, 1.70, 2.29],
];
/** The gun nose ahead of the 2.06 station: two plates either side of the slot (half-width SLOT). */
const NOSE: readonly TurretStation[] = [[2.06, .62, 1.70, 2.29], [2.36, .42, 1.80, 2.24]];
const SLOT = .175;

function shell(P: TankBuilderPort): void {
  P.add('turret', local(sectionSolid(BODY.map(([z, w, lo, hi]) => ({ z, ring: turretRing(w, lo, hi) })), { sideQuadDiagonal: 'convex' })));
  for (const side of [-1, 1]) {
    P.add('turret', local(sectionSolid(NOSE.map(([z, w, lo, hi]) => ({ z, ring: sided([
      [SLOT, lo + .04], [w - .04, lo], [w, lo + .05], [w, hi - .06], [w - .06, hi], [SLOT, hi],
    ], side) })), { sideQuadDiagonal: 'convex' })));
  }
  // The slot's floor under the gun (the chin) and its back wall, inside the nose.
  P.add('turret', box(SLOT * 2 + .02, .10, .30), ...at(0, 1.80, 2.20));
  // The race collar under the turret floor, inside the hull's ring well (2.10 m ring).
  P.add('turret', cylY(1.05, 1.05, .12, P.q ? 48 : 28), ...at(0, 1.565, D.turretPivot[2]));
}

function stowage(P: TankBuilderPort): void {
  // Long side bins on both flanks (lidded, on welded L-brackets), the rear bustle bin across the back.
  for (const side of [-1, 1]) {
    const z0 = -1.95, z1 = side > 0 ? .90 : .86, x0 = 1.28, x1 = 1.45, len = z1 - z0, zc = (z0 + z1) / 2;
    eq(P, box(x1 - x0, .52, len), side * (x0 + x1) / 2, 2.08, zc);
    eq(P, box(x1 - x0 + .02, .025, len + .02), side * (x0 + x1) / 2, 2.355, zc);
    for (const dz of [-len * .34, 0, len * .34]) eq(P, box(.02, .44, .05), side * (x1 + .008), 2.08, zc + dz, 'turretDark');
    for (const z of [z0 + .10, z1 - .10]) eq(P, box(.18, .04, .06), side * (x0 + .07), 1.83, z);
  }
  // the mesh-fronted bin on the left front corner, on the cheek
  eq(P, box(.42, .26, .40), 1.02, 2.15, 1.30, 'turretDetail', 0, .35, 0);
  eq(P, box(.40, .22, .015), 1.10, 2.15, 1.50, 'turretDark', 0, .35, 0);
  for (let i = 0; i < 5; i++) eq(P, box(.012, .22, .02), 1.00 + i * .075 * Math.cos(.35), 2.15, 1.535 - i * .075 * Math.sin(.35), 'turretDetail', 0, .35, 0);
  eq(P, box(2.04, .56, .42), 0, 2.09, -2.27);
  eq(P, box(2.06, .025, .44), 0, 2.38, -2.27);
  for (const x of [-.70, 0, .70]) eq(P, box(.05, .50, .02), x, 2.09, -2.49, 'turretDark');
  // basket rails over the bin and a strapped roll
  for (const x of [-1.0, 1.0]) P.addEquipment('turretDetail', beamBetween(at(x, 2.40, -2.47), at(x, 2.40, -2.07), .014, 8));
  eq(P, cylX(.11, 1.30, P.q ? 16 : 10), 0, 2.50, -2.30, 'turretCloth');
}

function togsBarbette(P: TankBuilderPort): void {
  // TOGS: the armoured thermal-sight barbette on the turret's right front corner, beside the gun at about trunnion
  // height, its front door sloping back; it stands on the right cheek and against the right wall.
  const xi = .80, xo = 1.31, rear = 1.02, front = 1.78, lo = 1.94, hi = 2.42;
  const ring = (top: number, bottom: number): SectionPoint[] => sided([[xi, bottom], [xo, bottom], [xo, top - .04], [xo - .04, top], [xi, top]], -1);
  P.addModuleVisual('optics', 'turret', local(sectionSolid([
    { z: rear, ring: ring(hi, lo) }, { z: front - .16, ring: ring(hi, lo) }, { z: front, ring: ring(hi - .10, lo + .06) },
  ])));
  const doorY = (lo + hi) / 2 - .02, doorZ = front - .075;
  eq(P, box(.40, .30, .025), -(xi + xo) / 2, doorY, doorZ + .012, 'turretDark', -.78, 0, 0);
  eq(P, box(.32, .20, .008), -(xi + xo) / 2, doorY + .01, doorZ + .03, 'turretGlass', -.78, 0, 0);
  for (const dx of [-.17, .17]) eq(P, box(.04, .05, .07), -(xi + xo) / 2 + dx, hi - .03, front - .26);
}

function roofFittings(P: TankBuilderPort): void {
  const roof = 2.48;
  // Commander's No. 15 cupola (right): race, rotating body with eight vision blocks, lid and the sight head ahead of it.
  const cx = -.50, cz = -.52;
  P.addCupola('turret', cylY(.44, .45, .10, P.q ? 32 : 18), ...at(cx, roof + .05, cz));
  P.addCupola('turret', cylY(.36, .38, .14, P.q ? 28 : 16), ...at(cx, roof + .17, cz));
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + Math.PI / 8;
    eq(P, box(.10, .07, .05), cx + Math.sin(a) * .37, roof + .17, cz + Math.cos(a) * .37, 'turretDark', 0, a, 0);
    P.addModuleVisual('optics', 'turretGlass', box(.08, .045, .01), ...at(cx + Math.sin(a) * .40, roof + .17, cz + Math.cos(a) * .40), 0, a, 0);
  }
  P.addHatch('turretDetail', cylY(.30, .32, .05, P.q ? 24 : 14), ...at(cx, roof + .265, cz - .02));
  eq(P, box(.26, .20, .24), cx + .02, roof + .36, cz + .30);
  eq(P, box(.20, .10, .02), cx + .02, roof + .39, cz + .425, 'turretDark');
  P.addModuleVisual('optics', 'turretGlass', box(.17, .07, .008), ...at(cx + .02, roof + .39, cz + .437));
  {
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'dark', scale: 1.0, seed: 8, riser: .08, working: true, ridingCradle: true });
    mg.name = 'challenger1CommanderL37';
    mg.position.set(...at(cx - .30, roof + .24, cz - .10));
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
  eq(P, box(.56, .12, .44), .62, roof + .06, -1.62);
  for (let i = 0; i < 5; i++) eq(P, box(.50, .012, .03), .62, roof + .123, -1.80 + i * .09, 'turretDark');
  eq(P, cylY(.09, .10, .06, 14), -.10, roof + .03, -1.35);
  // Aerial bases at the rear corners and lifting eyes on the roof edge.
  for (const [x, z] of [[-.92, -1.78], [.95, -1.20]] as const) {
    eq(P, cylY(.05, .06, .09, 12), x, roof + .045, z);
    eq(P, cylY(.009, .012, 1.9, 6), x, roof + 1.04, z, 'turretDark');
  }
  for (const [x, z] of [[-1.10, .80], [1.10, .80], [-.98, -1.70], [.98, -1.90]] as const) {
    eq(P, torus(.045, .014, 10, 6), x, roof + .045, z, 'turretDark');
  }
}

function smoke(P: TankBuilderPort): void {
  // Two L8 banks of five (three over two) on the cheek fronts either side of the gun, splayed outward.
  for (const side of [-1, 1]) {
    const bx = side * .70, bz = 1.95, by = side < 0 ? 2.16 : 2.12, yaw = side * .38;
    eq(P, box(.32, .22, .08), bx, by - .01, bz - .05, 'turretDetail', 0, yaw, 0);
    for (const [dx, dy] of [[-.10, .055], [0, .055], [.10, .055], [-.05, -.055], [.05, -.055]] as const) {
      const ox = Math.cos(yaw) * dx, oz = -Math.sin(yaw) * dx;
      eq(P, markSmokeTube(blindTube(.04, .028, .22, .12, P.q ? 14 : 8), [0, 0, 1], true).rotateX(-.20).rotateY(yaw),
        bx + ox, by + dy, bz + oz + .06);
    }
  }
}

/** L11A5 120 mm rifled gun on its trunnion: drum shield, canvas boot, strapped thermal sleeve, fume extractor and MRS. */
function gun(P: TankBuilderPort): void {
  const T = D.trunnion[2];
  const lathe = (rows: readonly (readonly [number, number])[], segments = P.q ? 32 : 18): THREE.BufferGeometry =>
    new THREE.LatheGeometry(rows.map(([z, r]) => new THREE.Vector2(r, z - T)), segments).rotateX(Math.PI / 2);
  // tube (inside the turret) and the sleeved run
  P.add('gun', lathe([[1.05, 0], [1.05, .125], [2.40, .125], [2.40, .118], [5.02, .114], [5.11, .150], [5.55, .150],
    [5.64, .110], [7.10, .102], [7.12, .088], [7.39, .088], [7.39, 0]]));
  // sleeve straps and the muzzle's bare steel
  const straps = [2.62, 3.12, 3.62, 4.12, 4.62, 5.90, 6.32, 6.74];
  for (const z of straps) {
    const r = z < 5.0 ? .122 : .108;
    P.add('gunDark', lathe([[z - .018, r - .01], [z - .018, r], [z + .018, r], [z + .018, r - .01]], P.q ? 24 : 14));
  }
  P.add('gunDark', lathe([[7.10, .092], [7.10, .096], [7.39, .096], [7.39, .092]], P.q ? 24 : 14));
  // muzzle reference system mirror on its bracket over the muzzle
  P.add('gunDark', box(.07, .05, .16), 0, .14, 7.25 - T);
  P.add('gunDark', box(.03, .05, .05), 0, .105, 7.28 - T);
  // drum shield behind the nose slot, turning with the gun about the trunnion, and the canvas boot onto the sleeve
  P.add('gunMount', cylX(.215, SLOT * 2 - .03, P.q ? 28 : 16), 0, 0, 0);
  P.add('gunMount', lathe([[2.20, 0], [2.20, .205], [2.42, .175], [2.56, .135], [2.56, 0]], P.q ? 24 : 14));
  P.muzzleZ = D.muzzleZ - T;
}

export function addChallenger1HistoricTurret(P: TankBuilderPort, mark: Challenger1Mark): void {
  shell(P);
  stowage(P);
  togsBarbette(P);
  roofFittings(P);
  smoke(P);
  gun(P);
  P.turretG.userData.challenger1Turret = Object.freeze({ mark, widthM: 2.56, roofY: 2.48, slotHalfWidthM: SLOT, noseZ: NOSE[NOSE.length - 1][0] });
}
