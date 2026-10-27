// Challenger 1 Mk 1 turret (release 262; the owner, 2026-10-27: "i like the new cr ur building but i want a version
// like the onne i told u to modify with a very sleek turret and good looking hull. so we can have annother mk"). The
// earlier Challenger 1 design's language — the asymmetric crown (the commander's plateau high on the right, the loader's
// roof lower on the left), cheeks swept hard back from a pointed gun nose, long raked-nose bins and a stepped bustle —
// drawn as one low, lean cast loft: walls leaning in 15 degrees under 10 cm rolled shoulders, 2.40 m over the foot, the
// crown 2.36-2.40 m with the commander's plinth a deliberate 4 cm step, the rear wall raked and the bustle narrowed. It shares the historical hull, the gun nose and slot and the L11A5 (challenger1HistoricTurret.ts).
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween, blindTube } from './measuredPrimitives.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { CR1_HISTORIC as D } from './challenger1HistoricFrame.ts';
import { addChallenger1GunNose, addChallenger1Gun, CHALLENGER1_PORT_FACE_Z } from './challenger1HistoricTurret.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, cylZ, torus } = KIT;
type Vec3 = [number, number, number];
const [PX, PY, PZ] = D.turretPivot;
const local = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.translate(-PX, -PY, -PZ);
const at = (x: number, y: number, z: number): Vec3 => [x - PX, y - PY, z - PZ];
function eq(P: TankBuilderPort, g: THREE.BufferGeometry, x: number, y: number, z: number, bucket = 'turretDetail', rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, g, ...at(x, y, z), rx, ry, rz);
}

// [z, foot half-width, shoulder half-width, underside, commander's crown (right, -x), loader's roof (left, +x)]
type SleekStation = readonly [z: number, wLo: number, wHi: number, lo: number, hiR: number, hiL: number];
const SLEEK: readonly SleekStation[] = [
  // the raked rear wall: its foot 12 cm ahead of its top
  [-2.00, .70, .56, 2.12, 2.25, 2.23], [-1.88, .78, .62, 1.88, 2.30, 2.27],
  [-1.50, .98, .80, 1.84, 2.36, 2.32], [-.60, 1.20, 1.00, 1.80, 2.40, 2.36],
  [.70, 1.20, 1.00, 1.80, 2.40, 2.36], [1.30, .97, .81, 1.79, 2.35, 2.32], [1.75, .78, .67, 1.76, 2.30, 2.29],
  // the front station meets the shared gun nose (half-width 0.66, 1.70 to 2.29)
  [2.06, .66, .64, 1.70, 2.29, 2.29],
];
function sleekRing([, wLo, wHi, lo, hiR, hiL]: SleekStation): SectionPoint[] {
  const roll = Math.min(.10, wHi * .13), drop = Math.min(.10, (Math.min(hiR, hiL) - lo) * .4);
  return [
    [-wLo + .04, lo], [wLo - .04, lo], [wLo, lo + .04],
    [wHi, hiL - drop], [wHi - roll, hiL], [-.10, hiL], [-.16, hiR],
    [-(wHi - roll), hiR], [-wHi, hiR - drop], [-wLo, lo + .04],
  ];
}

function casting(P: TankBuilderPort): void {
  // the leaning walls, their rolled shoulders and the crown's ramp are one cast surface
  P.add('turret', local(sectionSolid(SLEEK.map((s) => ({ z: s[0], ring: sleekRing(s) })), { smoothSideEdges: [2, 3, 5, 7, 8] })));
  addChallenger1GunNose(P);
}

/** A long low bin hugging the leaning wall: its outer face leans with the wall, its nose rakes back to the cheek. */
function sleekBin(P: TankBuilderPort, side: number, z0: number, z1: number): void {
  const xi = .99, xo = 1.22, lo = 1.88, hi = 2.20, lean = .05;
  const ring = (top: number): SectionPoint[] => {
    const pts: SectionPoint[] = [[xi, lo], [xo, lo], [xo - lean, top], [xi, top]];
    return side > 0 ? pts : pts.map(([x, y]) => [-x, y] as const).reverse();
  };
  P.addEquipment('turretDetail', local(sectionSolid([
    { z: z0, ring: ring(hi) }, { z: z1 - .30, ring: ring(hi) }, { z: z1, ring: ring(lo + .12) },
  ])));
  const x = side * (xi + xo - lean) / 2;
  eq(P, box(xo - xi - .02, .018, z1 - z0 - .34), x, hi + .009, (z0 + z1 - .30) / 2, 'turretDetail', 0, 0, side * -.08);
  eq(P, cylX(.010, z1 - z0 - .40, 8).rotateY(Math.PI / 2), side * (xi + .02), hi + .014, (z0 + z1 - .30) / 2, 'turretDark');
  for (const t of [.25, .62]) eq(P, box(.022, .06, .045), side * (xo - lean / 2 + .004), hi - .05, z0 + (z1 - z0) * t, 'turretDark', 0, 0, side * -.12);
}

function boxes(P: TankBuilderPort): void {
  sleekBin(P, 1, -1.35, .52);
  sleekBin(P, -1, -1.35, .26);
  // TOGS: a low armoured box on the right cheek over the gun's line (0.42 x 0.95 m, 0.15 m over the roof, flatter than
  // the Mk 2's barbette), its door sloping back at the front, its outer face chamfered
  const ring = (lo: number, hi: number): SectionPoint[] => [[-1.18, lo], [-.76, lo], [-.76, hi], [-1.12, hi], [-1.18, hi - .06]];
  P.addModuleVisual('optics', 'turret', local(sectionSolid([{ z: .48, ring: ring(2.16, 2.55) }, { z: 1.20, ring: ring(2.16, 2.55) },
    { z: 1.42, ring: ring(2.16, 2.40) }])));
  eq(P, box(.32, .21, .025), -.97, 2.30, 1.33, 'turretDark', -.60, 0, 0);
  P.addModuleVisual('optics', 'turretGlass', box(.24, .12, .006), ...at(-.97, 2.31, 1.345), -.60, 0, 0);
  for (const dx of [-.14, .14]) eq(P, cylZ(.016, .08, 8), -.97 + dx, 2.42, 1.22, 'turretDark');
  // bustle: the rear rack, its rails and a strapped roll
  for (const x of [-.86, -.29, .29, .86]) {
    P.addEquipment('turretDetail', beamBetween(at(x, 1.86, -1.93), at(x, 1.86, -2.28), .016, 8));
    P.addEquipment('turretDetail', beamBetween(at(x, 1.86, -2.28), at(x, 2.24, -2.28), .016, 8));
  }
  for (const y of [1.86, 2.05, 2.24]) P.addEquipment('turretDetail', beamBetween(at(-.88, y, -2.28), at(.88, y, -2.28), .016, 8));
  eq(P, box(1.70, .02, .34), 0, 1.855, -2.11, 'turretDark');
  eq(P, box(1.50, .22, .26), 0, 1.98, -2.12, 'turretCloth');
  for (const x of [-.40, .40]) eq(P, box(.04, .24, .30), x, 1.99, -2.12, 'turretDark');
}

function roof(P: TankBuilderPort): void {
  // Commander's low cupola on the right plateau, its sight head ahead; the loader's hatch on the lower left roof.
  const cx = -.50, cz = -.45, cy = 2.40;
  P.addCupola('turret', cylY(.38, .41, .12, P.q ? 30 : 18), ...at(cx, cy + .06, cz));
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + Math.PI / 8;
    eq(P, box(.10, .055, .045), cx + Math.sin(a) * .385, cy + .075, cz + Math.cos(a) * .385, 'turretDark', 0, a, 0);
    P.addModuleVisual('optics', 'turretGlass', box(.075, .035, .008), ...at(cx + Math.sin(a) * .41, cy + .075, cz + Math.cos(a) * .41), 0, a, 0);
  }
  P.addHatch('turretDetail', cylY(.29, .31, .04, P.q ? 24 : 14), ...at(cx, cy + .14, cz));
  eq(P, box(.24, .16, .22), cx + .02, cy + .20, cz + .30);
  P.addModuleVisual('optics', 'turretGlass', box(.16, .06, .008), ...at(cx + .02, cy + .22, cz + .412));
  {
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'dark', scale: 1.0, seed: 8, riser: .08, working: true, ridingCradle: true });
    mg.name = 'challenger1Mk1CommanderL37';
    mg.position.set(...at(cx - .28, cy + .12, cz - .08));
    mg.rotation.y = .04;
    P.turretG.add(mg);
  }
  const lx = .50, lz = -.70, ly = 2.36;
  P.addHatch('turretDetail', cylY(.31, .32, .045, P.q ? 24 : 14), ...at(lx, ly + .022, lz));
  eq(P, torus(.31, .018, P.q ? 24 : 14, 6), lx, ly + .045, lz, 'turretDark', Math.PI / 2, 0, 0);
  // gunner's sight head on the right cheek roof, the loader's periscope, a vent, aerials and lifting eyes
  eq(P, box(.24, .13, .26), -.46, 2.30 + .065, .30, 'turretDetail');
  P.addModuleVisual('optics', 'turretGlass', box(.16, .05, .008), ...at(-.46, 2.38, .432));
  eq(P, box(.14, .07, .14), .52, ly + .035, .25);
  eq(P, cylY(.08, .09, .05, 14), .20, ly + .02, -1.25);
  for (const [x, z, y] of [[-.74, -1.50, 2.34], [.76, -1.15, 2.31]] as const) {
    eq(P, cylY(.045, .055, .08, 12), x, y + .04, z);
    eq(P, cylY(.009, .012, 1.9, 6), x, y + 1.03, z, 'turretDark');
  }
  for (const [x, z, y] of [[-.80, .70, 2.36], [.80, .70, 2.32], [-.62, -1.40, 2.35], [.62, -1.40, 2.31]] as const) {
    eq(P, torus(.04, .013, 10, 6), x, y + .03, z, 'turretDark');
  }
}

function smoke(P: TankBuilderPort): void {
  // five-tube banks set into the swept cheeks either side of the gun nose
  for (const side of [-1, 1]) {
    const bx = side * .80, bz = 1.66, by = 2.13, yaw = side * .62;
    eq(P, box(.34, .24, .03), bx, by, bz - .03, 'turretDetail', -.35, yaw, 0);
    eq(P, box(.10, .10, .08), bx, by - .02, bz - .08, 'turretDetail', 0, yaw, 0);
    for (const [dx, dy] of [[-.10, .05], [0, .05], [.10, .05], [-.05, -.05], [.05, -.05]] as const) {
      const ox = Math.cos(yaw) * dx, oz = -Math.sin(yaw) * dx;
      eq(P, markSmokeTube(blindTube(.038, .027, .20, .11, P.q ? 14 : 8), [0, 0, 1], true).rotateX(-.20).rotateY(yaw),
        bx + ox, by + dy, bz + oz + .05);
    }
  }
}

export function addChallenger1SleekTurret(P: TankBuilderPort): void {
  casting(P);
  boxes(P);
  roof(P);
  smoke(P);
  addChallenger1Gun(P);
  P.turretG.userData.challenger1Turret = Object.freeze({ mark: 'mk1', widthM: 2.40, roofY: 2.40, sleek: true });
  P.turretG.userData.gunPort = Object.freeze({ faceZ: CHALLENGER1_PORT_FACE_Z - PZ, kind: 'slot' });
}
