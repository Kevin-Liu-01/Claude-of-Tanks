// Challenger 1 Mk 1 turret (release 262; the owner, 2026-10-27: "i like the new cr ur building but i want a version
// like the onne i told u to modify with a very sleek turret and good looking hull. so we can have annother mk"). The
// earlier Challenger 1 design's language — the asymmetric crown (the commander's plateau high on the right, the loader's
// roof lower on the left), cheeks swept hard back from a pointed gun nose, long raked-nose bins and a stepped bustle —
// drawn as one low, lean cast loft: walls leaning in 9 degrees under rolled shoulders, 2.44 m over the foot, the crown
// 2.38-2.46 m. It shares the historical hull, the gun nose and slot and the L11A5 (challenger1HistoricTurret.ts).
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween, blindTube } from './measuredPrimitives.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { CR1_HISTORIC as D } from './challenger1HistoricFrame.ts';
import { addChallenger1GunNose, addChallenger1Gun, CHALLENGER1_PORT_FACE_Z } from './challenger1HistoricTurret.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, torus } = KIT;
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
  [-1.95, .90, .78, 1.74, 2.34, 2.30], [-1.55, 1.10, .97, 1.68, 2.42, 2.36], [-.60, 1.22, 1.07, 1.62, 2.46, 2.38],
  [.70, 1.22, 1.07, 1.62, 2.46, 2.38], [1.30, .99, .88, 1.63, 2.40, 2.35], [1.75, .80, .72, 1.66, 2.33, 2.31],
  // the front station meets the shared gun nose (half-width 0.66, 1.70 to 2.29)
  [2.06, .66, .66, 1.70, 2.29, 2.29],
];
function sleekRing([, wLo, wHi, lo, hiR, hiL]: SleekStation): SectionPoint[] {
  const roll = Math.min(.12, wHi * .14);
  return [
    [-wLo + .04, lo], [wLo - .04, lo], [wLo, lo + .05],
    [wHi, hiL - .09], [wHi - roll, hiL], [-.04, hiL], [-.22, hiR],
    [-(wHi - roll), hiR], [-wHi, hiR - .09], [-wLo, lo + .05],
  ];
}

function casting(P: TankBuilderPort): void {
  // the leaning walls, their rolled shoulders and the crown's ramp are one cast surface
  P.add('turret', local(sectionSolid(SLEEK.map((s) => ({ z: s[0], ring: sleekRing(s) })), { smoothSideEdges: [2, 3, 5, 7, 8] })));
  addChallenger1GunNose(P);
}

/** A long low bin hugging the leaning wall: its outer face leans with the wall, its nose rakes back to the cheek. */
function sleekBin(P: TankBuilderPort, side: number, z0: number, z1: number): void {
  const xi = 1.06, xo = 1.30, lo = 1.86, hi = 2.26, lean = .05;
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
  sleekBin(P, 1, -1.80, .55);
  sleekBin(P, -1, -1.80, .30);
  // TOGS: a flush armoured barbette on the right cheek, its outer face leaning with the wall, the door square across
  // its front
  const ring = (lo: number, hi: number): SectionPoint[] => [[-1.24, lo], [-.82, lo], [-.82, hi], [-1.19, hi]];
  P.addModuleVisual('optics', 'turret', local(sectionSolid([{ z: .42, ring: ring(1.95, 2.44) }, { z: 1.18, ring: ring(1.95, 2.44) },
    { z: 1.38, ring: ring(1.99, 2.36) }])));
  eq(P, box(.34, .30, .025), -1.02, 2.17, 1.39, 'turretDark', -.38, 0, 0);
  P.addModuleVisual('optics', 'turretGlass', box(.26, .16, .006), ...at(-1.02, 2.18, 1.405), -.38, 0, 0);
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
  const cx = -.50, cz = -.45, cy = 2.46;
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
  const lx = .50, lz = -.70, ly = 2.38;
  P.addHatch('turretDetail', cylY(.31, .32, .045, P.q ? 24 : 14), ...at(lx, ly + .022, lz));
  eq(P, torus(.31, .018, P.q ? 24 : 14, 6), lx, ly + .045, lz, 'turretDark', Math.PI / 2, 0, 0);
  // gunner's sight head on the right cheek roof, the loader's periscope, a vent, aerials and lifting eyes
  eq(P, box(.26, .14, .28), -.50, 2.36 + .07, .86, 'turretDetail', -.10, 0, 0);
  P.addModuleVisual('optics', 'turretGlass', box(.17, .05, .008), ...at(-.50, 2.44, 1.00), -.10, 0, 0);
  eq(P, box(.14, .07, .14), .52, ly + .035, .25);
  eq(P, cylY(.08, .09, .05, 14), .20, ly + .02, -1.25);
  for (const [x, z, y] of [[-.86, -1.55, 2.42], [.88, -1.20, 2.36]] as const) {
    eq(P, cylY(.045, .055, .08, 12), x, y + .04, z);
    eq(P, cylY(.009, .012, 1.9, 6), x, y + 1.03, z, 'turretDark');
  }
  for (const [x, z, y] of [[-.86, .70, 2.42], [.86, .70, 2.36], [-.70, -1.40, 2.43], [.72, -1.40, 2.37]] as const) {
    eq(P, torus(.04, .013, 10, 6), x, y + .03, z, 'turretDark');
  }
}

function smoke(P: TankBuilderPort): void {
  // five-tube banks set into the swept cheeks either side of the gun nose
  for (const side of [-1, 1]) {
    const bx = side * .80, bz = 1.66, by = 2.13, yaw = side * .62;
    eq(P, box(.30, .20, .07), bx, by, bz - .04, 'turretDetail', 0, yaw, 0);
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
  P.turretG.userData.challenger1Turret = Object.freeze({ mark: 'mk1', widthM: 2.44, roofY: 2.46, sleek: true });
  P.turretG.userData.gunPort = Object.freeze({ faceZ: CHALLENGER1_PORT_FACE_Z - PZ, kind: 'slot' });
}
