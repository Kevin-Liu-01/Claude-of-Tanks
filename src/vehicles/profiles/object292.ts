// The Object 292 (release 269; owner 2026-11-04, "object 292 for a full line of 152 mm variant tanks"; DECISIONS
// "2026-11-04 Russian 152 mm line"): VNIITransmash and the Kirov Plant's 1990 trials tank, one built, kept at Kubinka. Its
// hull is the T-80BV's (profiles/t80.ts, built on that builder), as the Kubinka tank shows it: the Kontakt-1 stud field
// on the glacis with no bricks, the rubber skirts, the dozer blade. Its turret keeps the T-80's cast lower turret and
// carries a welded box on it for the LP-83's breech and its autoloader: two raked cheek boxes either side of the gun, a
// tall flat-sided body over the ring and a long bustle over the engine deck. The LP-83 152 mm smoothbore leaves the cast
// nose on a thick root collar. First-party procedural geometry: Kevin B. Liu (NOTICE.md); photographs and sources in
// docs/references/photos/russia-152-20261104.json.
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { buildT80CastTurret } from './russia.ts';
import { buildT80BVHullWithTurret, type T80BuilderPort } from './t80.ts';
import { GUN_LP83, build152Gun } from './gun152.ts';
import { OBJECT292_GUN_FRAME } from '../russia152Frames.ts';
import type { TankProfileBuild } from '../tankBuildCooperation.ts';

const { box, cylY, cylZ } = KIT;
/** The T-80BV hull's ring datum (profiles/t80.ts HullStage2). */
const RING_Y = 1.45;

/** A prism along Z: each station [z, x0, x1, y0, y1] in the turret frame, x0 < x1. */
function prism(P: T80BuilderPort, bucket: string, stations: readonly (readonly [number, number, number, number, number])[]): void {
  P.add(bucket, sectionSolid(stations.map(([z, x0, x1, y0, y1]) => ({ z, ring: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] }))));
}

/** The welded box over the T-80 casting (Kubinka; the critics of round 1: the casting must read below it): its body sits
 * on the casting's shoulders from a hood over the gun's root back over the ring, the bustle overhangs the engine deck,
 * and flat applique blocks (the weight imitators) cover the casting's cheeks either side of the gun. Turret frame. */
function addBox(P: T80BuilderPort): void {
  // the bustle's floor rakes up to its tail; the body's floor is the casting's shoulder line
  prism(P, 'turret', [
    [-2.30, -1.08, 1.08, .40, .84], [-1.95, -1.10, 1.10, .28, .85], [-1.05, -1.10, 1.10, .26, .86],
    [.30, -1.06, 1.06, .30, .86], [.62, -.94, .94, .42, .84],
  ]);
  // the hood over the gun's root, its brow raked down to the mantlet
  prism(P, 'turret', [[.40, -.56, .56, .58, .84], [.88, -.52, .52, .58, .76], [1.02, -.46, .46, .60, .68]]);
  // the weight-imitator blocks on the casting's cheeks: flat applique faces, the outer corner swept back
  for (const s of [-1, 1]) {
    const st: [number, number, number, number, number][] = [[.50, .34, 1.02, .04, .50], [1.12, .34, 1.02, .04, .50],
      [1.42, .34, .62, .06, .46]];
    prism(P, 'turret', st.map(([z, a, b, y0, y1]): [number, number, number, number, number] => (s > 0 ? [z, a, b, y0, y1] : [z, -b, -a, y0, y1])));
    for (const dz of [.70, 1.05]) P.addEquipment('turretDark', KIT.cylY(.022, .022, .02, 8), s * .68, .505, dz);
    P.addEquipment('turretDetail', KIT.torus(.045, .012, 10, 6), s * .80, .83, .10, Math.PI / 2, 0, 0);
  }
  // the weld seam where the box meets the casting, the bustle's tail lip and the plate seams down its flanks
  for (const s of [-1, 1]) P.addEquipment('turretDark', box(.022, .022, 1.40), s * 1.08, .27, -.35);
  P.addEquipment('turretDetail', box(2.10, .05, .05), 0, .83, -2.31);
  for (const s of [-1, 1]) for (const z of [-1.05, -.20]) P.addEquipment('turretDark', box(.012, .50, .02), s * 1.105, .56, z);
}

/** The roof: commander's cupola (right), gunner's sight (left, forward), ventilator, loader's-side hatch, antenna. */
function addRoof(P: T80BuilderPort): void {
  const top = .86;
  // the commander's cupola raised on its collar (Kubinka: it stands well above the box's roof)
  P.add('turret', cylY(.30, .32, .24, 18), .52, top + .11, -.30);
  P.add('turretDark', KIT.torus(.30, .022, 18), .52, top + .23, -.30);
  P.add('turret', cylY(.25, .26, .05, 16), .52, top + .255, -.30);
  for (const [x, z, ry] of [[.30, -.06, .44], [.52, .00, 0], [.74, -.08, -.44]]) {
    P.add('turretDark', box(.12, .07, .07), x, top + .21, z, 0, ry, 0);
    P.add('turretGlass', box(.09, .04, .012), x, top + .22, z + .04, 0, ry, 0);
  }
  // the gunner's sight head in its tall armoured box at the roof's front left, its window forward
  P.add('turret', box(.40, .34, .44), -.48, top + .16, .46);
  P.add('turretDark', box(.30, .16, .02), -.48, top + .20, .685);
  P.add('turretGlass', box(.24, .11, .012), -.48, top + .20, .692);
  P.add('turretDetail', box(.44, .04, .48), -.48, top + .34, .46);
  // the second sight head (the commander's day/night sight) forward of the cupola
  P.add('turret', box(.22, .24, .26), .50, top + .11, .32);
  P.add('turretGlass', box(.15, .09, .012), .50, top + .15, .455);
  // the loader's hatch is the autoloader's service hatch here: a low plate with its hinge
  P.add('turretDetail', cylY(.24, .25, .03, 16), -.50, top + .015, -.62);
  P.add('turretDark', box(.32, .03, .05), -.50, top + .04, -.84);
  P.add('turret', cylY(.14, .16, .07, 14), .02, top + .035, -1.40);
  P.add('turretDark', cylY(.11, .12, .02, 12), .02, top + .08, -1.40);
  P.add('turret', cylY(.06, .07, .07, 10), -.82, top + .035, -1.70);
  const antenna = FITTINGS.antennaWhip({ mats: P.mats, h: 1.24, r: 0.011, rake: -0.025, seed: 292 });
  antenna.position.set(-.82, top + .07, -1.70);
  P.turretG.add(antenna);
}

/** The LP-83 on its cradle: the root collar out of the cast nose, then the sleeved tube. Gun frame. */
function addGun(P: T80BuilderPort): void {
  P.addGunExtra(cylZ(.27, .55, 20, .29), 0, 0, .05);
  P.addGunExtra(cylZ(.245, 1.10, 24, .265), 0, 0, .80);
  P.addGunExtraDark(cylZ(.25, .04, 20), 0, 0, 1.34);
  build152Gun(P, { ...GUN_LP83, len: OBJECT292_GUN_FRAME.muzzleZ - OBJECT292_GUN_FRAME.trunnionZ });
}

/** Kubinka's full-height rubber skirts under the BV's skirt band (the band and its front plates are the BV's), and the
 * large rubber flaps drooping over the front of the tracks. Hull frame. */
function addRubberSkirts(P: T80BuilderPort): void {
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
    const z0 = -2.90 + i * .885;
    P.add('hullTrack', box(.022, .44, .87), s * 1.744, .82, z0 + .4425);
    P.add('hullDark', box(.006, .40, .012), s * 1.757, .82, z0 + .88);
  }
  for (const s of [-1, 1]) P.add('hullTrack', box(.48, .46, .022), s * 1.40, .92, 3.46, .22, 0, 0);
}

/** The glacis' Kontakt-1 mounting studs with no bricks on them (Kubinka): two studs at each of the T-80BV raft's 28
 * brick stations (profiles/t80.ts buildT80BVHullKit), standing on the plate along its normal. Hull frame. */
function addKontaktStuds(P: T80BuilderPort): void {
  const tilt = Math.atan2(.438, .899);                       // the plate's outward normal (0, .899, .438)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
    const y = .84 + r * .115 - .045, z = 3.21 - r * .235 - .022;
    for (const dx of [-.075, .075]) P.add('hullDetail', KIT.cylY(.028, .032, .065, 8), -.90 + c * .30 + dx, y, z, tilt, 0, 0);
  }
}

function* buildObject292Turret(P: T80BuilderPort): TankProfileBuild {
  addRubberSkirts(P);
  addKontaktStuds(P);
  // the T-80BV's casting, as the BV builds it, under the box
  buildT80CastTurret(P, {
    scaleY: .90, sz: .88, cz: .22, curved: true, reference: 't80/t80b/ua_t80u_kursk',
    equipmentSeatRevision: 't80bv-family-reseat-r2', closeBase: true,
  });
  yield 'object292Casting';
  addBox(P);
  addRoof(P);
  for (const s of [-1, 1]) P.decal('turret', 'number', P.spec.visual.number || '', .30, [s * 1.105, .58, -1.55], s * Math.PI / 2);
  yield 'object292Box';
  P.gunG.position.set(0, OBJECT292_GUN_FRAME.trunnionY - RING_Y, OBJECT292_GUN_FRAME.trunnionZ);
  addGun(P);
  P.topY = .95;
  yield 'object292Gun';
}

export const OBJECT292_PROFILES = { object292: { build: buildT80BVHullWithTurret({ build: buildObject292Turret }) } };
