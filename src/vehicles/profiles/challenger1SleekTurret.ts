// FV4030/6 turret (release 262; built as the Challenger 1 Mk 1's, the owner, 2026-10-27: "i like the new cr ur building but i want a version
// like the onne i told u to modify with a very sleek turret and good looking hull. so we can have annother mk"). The
// earlier Challenger 1 design's language — the asymmetric crown (the commander's plateau high on the right, the loader's
// roof lower on the left), cheeks swept hard back from a pointed gun nose, long raked-nose bins and a stepped bustle —
// drawn as one low, lean faceted loft: an undercut foot hiding the ring (a shadow line, not a collar), a vertical lower
// band to a crease, the upper wall raked in 24 degrees under an even 6 cm roll, 2.40 m over the crease; the crown falls
// from 2.40 m at the cupola to 2.28 m at the nose (the commander's plinth a deliberate 4 cm step), the rear wall
// undercut 25 cm and the bustle narrowed to 1.1 m. It shares the historical hull, the gun slot, its drum shield and boot
// and the L11A5 (challenger1HistoricTurret.ts), with its own lower nose plates.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { CR1_HISTORIC as D } from './challenger1HistoricFrame.ts';
import { addChallenger1GunNose, addChallenger1Gun, challenger1SmokeBank, CHALLENGER1_PORT_FACE_Z, type Challenger1TurretStation } from './challenger1HistoricTurret.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, torus } = KIT;
type Vec3 = [number, number, number];
const [PX, PY, PZ] = D.turretPivot;
const local = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.translate(-PX, -PY, -PZ);
const at = (x: number, y: number, z: number): Vec3 => [x - PX, y - PY, z - PZ];
function eq(P: TankBuilderPort, g: THREE.BufferGeometry, x: number, y: number, z: number, bucket = 'turretDetail', rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(bucket, g, ...at(x, y, z), rx, ry, rz);
}

// [z, crease half-width, underside, commander's crown (right, -x), loader's roof (left, +x)]
type SleekStation = readonly [z: number, w: number, lo: number, hiR: number, hiL: number];
const SLEEK: readonly SleekStation[] = [
  // the rear wall undercut 25 cm: its top edge at -2.00, its foot at -1.75; the bustle 1.1 m across
  [-2.00, .55, 2.15, 2.27, 2.25], [-1.75, .64, 1.80, 2.32, 2.29],
  [-1.50, .96, 1.78, 2.37, 2.33], [-.60, 1.20, 1.76, 2.40, 2.36],
  [.70, 1.20, 1.74, 2.37, 2.34], [1.30, .97, 1.72, 2.34, 2.32], [1.75, .82, 1.72, 2.31, 2.30],
  // the front station meets the Mk 1's nose plates (half-width 0.70, 1.72 to 2.28)
  [2.06, .70, 1.72, 2.28, 2.28],
];
/** The Mk 1's lower nose plates either side of the shared slot: the crown's rake carried on to the apex. */
const SLEEK_NOSE: readonly Challenger1TurretStation[] = [[2.06, .70, 1.72, 2.28], [2.50, .40, 1.70, 2.18]];
const RAKE = Math.tan(24 * Math.PI / 180), ROLL = .06;
function sleekRing([, w, lo, hiR, hiL]: SleekStation): SectionPoint[] {
  const h = Math.min(hiR, hiL) - lo;
  const cut = Math.min(.12, h * .25), inset = cut * .8;
  const crease = Math.min(lo + .30, lo + h * .45, Math.min(hiR, hiL) - ROLL - .01);
  const wTop = (hi: number): number => w - Math.max(0, hi - ROLL - crease) * RAKE;
  return [
    [-(w - inset), lo], [w - inset, lo], [w, lo + cut], [w, crease],
    [wTop(hiL), hiL - ROLL], [wTop(hiL) - ROLL, hiL], [-.10, hiL], [-.16, hiR],
    [-(wTop(hiR) - ROLL), hiR], [-wTop(hiR), hiR - ROLL], [-w, crease], [-w, lo + cut],
  ];
}

function casting(P: TankBuilderPort): void {
  // the undercut foot, the crease and the raked upper walls are crisp facets of one cast loft
  P.add('turret', local(sectionSolid(SLEEK.map((s) => ({ z: s[0], ring: sleekRing(s) })))));
  addChallenger1GunNose(P, SLEEK_NOSE);
}

/** A long low bin on the wall's vertical band: its outer face leans with the upper wall, its nose rakes back to the cheek. */
function sleekBin(P: TankBuilderPort, side: number, z0: number, z1: number): void {
  const xi = 1.13, xo = 1.34, lo = 1.90, hi = 2.20, lean = .05;
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
  sleekBin(P, 1, -1.05, .52);
  sleekBin(P, -1, -1.05, .26);
  // TOGS: a flat armoured box inside the right cheek line over the gun's side (0.36 x 0.75 m, 9 cm over the roof), its
  // front raked back 55 degrees with the door and glass on the slope
  const ring = (lo: number, hi: number): SectionPoint[] => [[-.82, lo], [-.46, lo], [-.46, hi], [-.78, hi], [-.82, hi - .03]];
  P.add('turret', local(sectionSolid([{ z: .50, ring: ring(2.30, 2.43) }, { z: 1.05, ring: ring(2.30, 2.43) },
    { z: 1.25, ring: ring(2.30, 2.335) }])));
  eq(P, box(.24, .15, .02), -.64, 2.38, 1.155, 'turretDark', -.96, 0, 0);
  P.addModuleVisual('optics', 'turretGlass', box(.18, .09, .006), ...at(-.64, 2.385, 1.165), -.96, 0, 0);
  // bustle: a basket hung off the undercut rear wall on two arms, clear of the deck, a strapped roll in it
  const r0 = -1.86, r1 = -2.16;
  for (const x of [-.52, .52]) {
    P.addEquipment('turretDetail', beamBetween(at(x, 2.02, -1.80), at(x, 2.02, r1), .016, 8));
    P.addEquipment('turretDetail', beamBetween(at(x, 2.02, r1), at(x, 2.24, r1), .016, 8));
    P.addEquipment('turretDetail', beamBetween(at(x, 2.24, r1), at(x, 2.24, -2.02), .016, 8));
  }
  for (const y of [2.02, 2.13, 2.24]) P.addEquipment('turretDetail', beamBetween(at(-.54, y, r1), at(.54, y, r1), .014, 8));
  eq(P, box(1.06, .02, r0 - r1 + .04), 0, 2.01, (r0 + r1) / 2 - .02, 'turretDark');
  eq(P, cylX(.10, .96, P.q ? 16 : 10), 0, 2.12, (r0 + r1) / 2 - .03, 'turretCloth');
  for (const x of [-.30, .30]) eq(P, torus(.105, .012, P.q ? 14 : 8, 5).rotateZ(Math.PI / 2), x, 2.12, (r0 + r1) / 2 - .03, 'turretDark');
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
  eq(P, torus(.31, .018, P.q ? 24 : 14, 6), lx, ly + .045, lz, 'turretDark');
  // gunner's sight head on the right cheek roof, the loader's periscope, a vent, aerials and lifting eyes
  eq(P, box(.22, .11, .22), -.28, 2.36 + .05, .28, 'turretDetail');
  P.addModuleVisual('optics', 'turretGlass', box(.15, .045, .008), ...at(-.28, 2.42, .392));
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
  // the L8 banks proud on their brackets on the swept cheeks either side of the gun nose
  for (const side of [-1, 1]) challenger1SmokeBank(P, side * .98, 2.06, 1.62, side * .70);
}

export function addChallenger1SleekTurret(P: TankBuilderPort): void {
  casting(P);
  boxes(P);
  roof(P);
  smoke(P);
  addChallenger1Gun(P);
  P.turretG.userData.challenger1Turret = Object.freeze({ mark: 'x_sleek', widthM: 2.40, roofY: 2.40, sleek: true });
  P.turretG.userData.gunPort = Object.freeze({ faceZ: CHALLENGER1_PORT_FACE_Z - PZ, kind: 'slot' });
}
