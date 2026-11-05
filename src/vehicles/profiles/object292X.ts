// The Object 292 (release 269; owner 2026-11-04, "object 292 for a full line of 152 mm variant tanks"; DECISIONS
// "2026-11-04 Russian 152 mm line"): VNIITransmash and the Kirov Plant's 1990 trials tank, one built, kept at Kubinka.
// Owner 2026-11-04 ("use our proper tank generation procedure and dont use the old t80 hull only use modern new hulls like
// the nnew t80 x hulll"): it is built on the T-80U X hull and casting (profiles/t80uX.ts), by recipe reuse at that build's
// own datums, with no legacy T-80 builder. Kubinka's tank carries what that hull already measures: the rubber bow apron,
// the rubber side skirts, the empty drum cradles at the stern. Its glacis is the T-80BV pattern's: the Kontakt-1 studs with
// no bricks, so the hull is the T-80U X base without its Kontakt-5. On the T-80U X casting stands the welded box for the
// LP-83's breech and its loading gear: two raked steel cheek blocks either side of the gun (the weight imitators), a hood
// over the gun's root, a tall flat-sided body as wide as the casting and a long bustle over the engine deck. The LP-83 152 mm
// smoothbore leaves the casting's embrasure on a thick root collar. First-party procedural geometry: Kevin B. Liu
// (NOTICE.md); photographs and sources in docs/references/photos/russia-152-20261104.json, the run packet in
// docs/references/tanks/object292.md.
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { buildT80UXCasting, buildT80UXHullBase, T80U_X_TRUNNION, T80U_X_YAW } from './t80uX.ts';
import { GUN_LP83, build152Gun } from './gun152.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { machinedRing } from '../machineGunGeometry.ts';
import { OBJECT292_FRAME as F } from '../russia152Frames.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ } = KIT;
/** The welded box's roof (turret frame: metres over the T-80U X casting's ring datum). */
const BOX_ROOF = F.boxRoof;

/** A prism along Z: each station [z, x0, x1, y0, y1] in the turret frame, x0 < x1. */
function prism(P: TankBuilderPort, bucket: string, stations: readonly (readonly [number, number, number, number, number])[]): void {
  P.add(bucket, sectionSolid(stations.map(([z, x0, x1, y0, y1]) => ({ z, ring: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] }))));
}

/** The T-80U X glacis' top (hull frame; its hull core's stations, profiles/t80uX.ts buildT80UXHullCore). */
const GLACIS: readonly (readonly [number, number])[] = [[1.84, 1.487], [2.10, 1.387], [2.40, 1.252], [2.70, 1.150], [3.015, 1.010]];
function glacisAt(z: number): { y: number; tilt: number } {
  for (let i = 1; i < GLACIS.length; i++) {
    const [z0, y0] = GLACIS[i - 1], [z1, y1] = GLACIS[i];
    if (z <= z1 || i === GLACIS.length - 1) return { y: y0 + (y1 - y0) * (z - z0) / (z1 - z0), tilt: Math.atan2(y0 - y1, z1 - z0) };
  }
  return { y: GLACIS[0][1], tilt: 0 };
}

/** The glacis' fit, the T-80BV pattern Kubinka keeps: the Kontakt-1 mounting studs with no bricks on them across the
 * plate's width (five rows of eight pairs, standing along its normal, clear of the headlights), the headlights in their
 * guards and the splash strip. Hull frame. */
function addGlacis(P: TankBuilderPort): void {
  for (const z of [1.95, 2.17, 2.39, 2.61, 2.83]) {
    const { y, tilt } = glacisAt(z);
    for (let c = 0; c < 8; c++) for (const dx of [-.075, .075]) {
      const x = -.875 + c * .25 + dx;
      if (Math.hypot(Math.abs(x) - .8475, z - 2.62) < .17) continue;
      P.add('hullDetail', cylY(.028, .032, .065, 8), x, y + .025, z, tilt, 0, 0);
    }
  }
  for (const s of [-1, 1]) {
    const { y, tilt } = glacisAt(2.62);
    P.addEquipment('hullDetail', markVehicleNightLens(cylZ(.0735, .074, 24), 'headlight'), s * .8475, y + .085, 2.62);
    P.addEquipment('hullDetail', box(.17, .03, .12), s * .8475, y + .012, 2.60, tilt, 0, 0);
    for (const dx of [-.066, .066]) P.addEquipment('hullDetail', box(.016, .16, .016), s * .8475 + dx, y + .085, 2.665);
    P.addEquipment('hullDetail', box(.148, .016, .016), s * .8475, y + .165, 2.665);
  }
  const { y, tilt } = glacisAt(2.40);
  P.addEquipment('hullDetail', box(.80, .022, .089), 0, y + .011, 2.40, tilt, 0, 0);
}

/** The T-80U X side apron's lower edge (profiles/t80uX.ts skirt): the rubber skirt hangs from it. */
const APRON_FOOT: readonly (readonly [number, number])[] = [[-2.882, .886], [-2.45, .815], [-1.22, .782], [1.75, .762], [2.886, .782]];
function apronFoot(z: number): number {
  for (let i = 1; i < APRON_FOOT.length; i++) {
    const [z0, y0] = APRON_FOOT[i - 1], [z1, y1] = APRON_FOOT[i];
    if (z <= z1 || i === APRON_FOOT.length - 1) return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
  }
  return APRON_FOOT[0][1];
}

/** Kubinka's rubber skirts, deeper than the T-80U X apron: seven bolted rubber panels a side hanging from the apron's foot
 * over the top of the road wheels, and the broad rubber flaps over the front of the tracks from the fenders' noses. */
function addRubberSkirts(P: TankBuilderPort): void {
  const z0 = -2.88, n = 7, len = 5.76 / n;
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const z = z0 + len * (i + .5), top = apronFoot(z) + .03;
      P.addMudguard('object292-rubber-skirt', 'hullRubber', box(.014, top - .50, len - .012), s * 1.795, (top + .50) / 2, z);
      P.addEquipment('hullDetail', box(.012, .022, len - .08), s * 1.805, top - .035, z);
    }
    P.addMudguard('object292-front-flap', 'hullRubber', box(.50, .42, .012), s * 1.45, .72, 3.33);   // under the fender's nose
  }
}

/** The welded box over the T-80U X casting (Kubinka: the casting's lower rim shows beneath it): its body as wide as the
 * casting with near-vertical flanks from the casting's shoulders, back over the ring, the bustle overhanging the engine
 * deck; the hood over the gun's root standing above the cheek blocks; the steel weight-imitator blocks raked back either
 * side of the gun in a V. Turret frame. */
function addBox(P: TankBuilderPort): void {
  const r = BOX_ROOF;
  prism(P, 'turret', [
    [-2.22, -1.30, 1.30, .34, r - .02], [-1.90, -1.42, 1.42, .14, r], [-1.10, -1.42, 1.42, .06, r],
    [-.10, -1.42, 1.42, .06, r], [.30, -1.38, 1.38, .10, r], [.58, -1.22, 1.22, .30, r - .02],
  ]);
  prism(P, 'turret', [[.45, -.50, .50, .30, r], [.95, -.46, .46, .30, r - .06], [1.12, -.40, .40, .32, r - .14]]);
  // each block is a square steel box on the casting's cheek beside the gun, its face raked back 26 degrees from the
  // gun's side (x .40, z 1.20) to the casting's flank, 0.55 m deep
  const [ix, iz, len, depth, yaw] = [.40, 1.20, .86, .55, .45];
  for (const s of [-1, 1]) {
    const nx = s * Math.sin(yaw), nz = Math.cos(yaw);
    const cx = s * (ix + len * Math.cos(yaw) / 2) - nx * depth / 2, cz = iz - len * Math.sin(yaw) / 2 - nz * depth / 2;
    P.add('turret', box(len, .46, depth), cx, .33, cz, 0, s * yaw, 0);
    P.addEquipment('turretDark', box(len - .06, .016, .016), cx + nx * (depth / 2 + .004), .52, cz + nz * (depth / 2 + .004), 0, s * yaw, 0);
    P.addEquipment('turretDetail', KIT.torus(.045, .012, 10, 6), cx, .565, cz, Math.PI / 2, 0, 0);
  }
  // the weld seam where the box meets the casting, the bustle's tail lip and the plate seams down its flanks
  for (const s of [-1, 1]) P.addEquipment('turretDark', box(.022, .022, 1.60), s * 1.42, .07, -.55);
  P.addEquipment('turretDetail', box(2.50, .05, .05), 0, r - .05, -2.23);
  for (const s of [-1, 1]) for (const z of [-1.20, -.20]) P.addEquipment('turretDark', box(.012, r - .10, .02), s * 1.425, (r + .06) / 2, z);
}

/** The roof: the commander's cupola (right) and his sight ahead of it, the gunner's sight box (left, forward), the
 * loading gear's service hatch, the ventilator and the antenna. Turret frame. */
function addRoof(P: TankBuilderPort): void {
  const top = BOX_ROOF;
  P.add('turret', cylY(.30, .32, .24, 18), -.52, top + .11, -.30);
  P.add('turretDark', KIT.torus(.30, .022, 18), -.52, top + .23, -.30);
  P.add('turret', cylY(.25, .26, .05, 16), -.52, top + .255, -.30);
  for (const [x, z, ry] of [[-.74, -.08, .44], [-.52, .00, 0], [-.30, -.06, -.44]]) {
    P.add('turretDark', box(.12, .07, .07), x, top + .21, z, 0, ry, 0);
    P.add('turretGlass', box(.09, .04, .012), x, top + .22, z + .04, 0, ry, 0);
  }
  P.add('turret', box(.22, .24, .26), -.50, top + .11, .32);
  P.add('turretGlass', box(.15, .09, .012), -.50, top + .15, .455);
  P.add('turret', box(.40, .34, .44), .48, top + .16, .46);
  P.add('turretDark', box(.30, .16, .02), .48, top + .20, .685);
  P.add('turretGlass', box(.24, .11, .012), .48, top + .20, .692);
  P.add('turretDetail', box(.44, .04, .48), .48, top + .34, .46);
  P.add('turretDetail', cylY(.24, .25, .03, 16), .50, top + .015, -.62);
  P.add('turretDark', box(.32, .03, .05), .50, top + .04, -.84);
  P.add('turret', cylY(.14, .16, .07, 14), -.02, top + .035, -1.40);
  P.add('turretDark', cylY(.11, .12, .02, 12), -.02, top + .08, -1.40);
  P.add('turret', cylY(.06, .07, .07, 10), .82, top + .035, -1.70);
  const antenna = FITTINGS.antennaWhip({ mats: P.mats, h: 1.24, r: 0.011, rake: -0.025, seed: 292 });
  antenna.position.set(.82, top + .07, -1.70);
  P.turretG.add(antenna);
}

/** The LP-83 on its cradle: the root collar out of the casting's embrasure, then the sleeved tube. Gun frame. */
function addGun(P: TankBuilderPort): void {
  // the T-80U X's own trunnion block across the casting's embrasure (its cheeks at x .222): a cylinder round the pitch
  // axis keeps its envelope at every pitch, so the mount clears the X's deck as the T-80U's does
  P.addGunExtra(cylX(.203, .446, 28), 0, 0, -.004);
  P.addGunExtra(cylZ(.165, 1.10, 24, .18), 0, 0, .80);    // the cradle's sleeve: a modest step over the tube
  P.addGunExtraDark(cylZ(.17, .04, 20), 0, 0, 1.34);
  build152Gun(P, { ...GUN_LP83, len: F.muzzleZ - F.trunnionZ });
}

function buildObject292X(P: TankBuilderPort): void {
  // the T-80U X ring datum on its raised race (as profiles/t80uX.ts seats its own casting); turret parts are authored
  // against the casting's yaw datum and rise with it
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(T80U_X_YAW[0], F.ringY, F.ringZ);
  P.addEquipment('hullDetail', machinedRing(.90, 1.01, F.ringY - .030 - 1.522, .004, P.q ? 32 : 20), T80U_X_YAW[0], 1.522, F.ringZ);
  P.gunG.position.set(T80U_X_TRUNNION[0] - T80U_X_YAW[0], F.trunnionY - F.ringY, F.trunnionZ - F.ringZ);
  buildT80UXHullBase(P);
  addGlacis(P);
  addRubberSkirts(P);
  buildT80UXCasting(P);
  addBox(P);
  addRoof(P);
  for (const s of [-1, 1]) P.decal('turret', 'number', P.spec.visual.number || '', .26, [s * 1.425, (BOX_ROOF + .06) / 2, -1.55], s * Math.PI / 2);
  addGun(P);
  P.muzzleZ = F.muzzleZ - F.trunnionZ;
  P.topY = BOX_ROOF + .28;   // the cupola's lid
}

export const OBJECT292_X_PROFILES = { object292: { build: buildObject292X } } as const;
