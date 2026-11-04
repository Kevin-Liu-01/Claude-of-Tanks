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

/** The welded box: body over the ring, the bustle over the deck, the raked cheek boxes. Turret frame. */
function addBox(P: T80BuilderPort): void {
  // the bustle's floor rakes up to its tail; the body stands on the casting
  prism(P, 'turret', [
    [-2.30, -1.14, 1.14, .40, .79], [-1.95, -1.16, 1.16, .26, .80], [-1.05, -1.20, 1.20, .02, .80],
    [.20, -1.20, 1.20, .02, .80], [.70, -.62, .62, .40, .78],
  ]);
  // the raked cheek boxes standing proud of the casting's nose: full width to z 1.02, the outer corner swept back
  for (const s of [-1, 1]) {
    const st: [number, number, number, number, number][] = [[.10, .30, 1.22, .04, .78], [1.02, .30, 1.22, .04, .78],
      [1.42, .30, .62, .08, .72]];
    prism(P, 'turret', st.map(([z, a, b, y0, y1]): [number, number, number, number, number] => (s > 0 ? [z, a, b, y0, y1] : [z, -b, -a, y0, y1])));
    // the cheek's top plate seam and the lifting eyes
    P.addEquipment('turretDark', box(.86, .012, .02), s * .76, .785, 1.00);
    P.addEquipment('turretDetail', KIT.torus(.045, .012, 10, 6), s * .80, .80, .30, Math.PI / 2, 0, 0);
  }
  // the bustle's tail lip and the plate seams down the body's flanks
  P.addEquipment('turretDetail', box(2.14, .05, .05), 0, .78, -2.31);
  for (const s of [-1, 1]) for (const z of [-1.05, .20]) P.addEquipment('turretDark', box(.012, .70, .02), s * 1.205, .42, z);
}

/** The roof: commander's cupola (right), gunner's sight (left, forward), ventilator, loader's-side hatch, antenna. */
function addRoof(P: T80BuilderPort): void {
  const top = .80;
  P.add('turret', cylY(.30, .32, .14, 18), .52, top + .06, -.42);
  P.add('turretDark', KIT.torus(.30, .022, 18), .52, top + .13, -.42);
  P.add('turret', cylY(.25, .26, .04, 16), .52, top + .15, -.42);
  for (const [x, z, ry] of [[.30, -.18, .44], [.52, -.12, 0], [.74, -.20, -.44]]) {
    P.add('turretDark', box(.12, .06, .07), x, top + .11, z, 0, ry, 0);
    P.add('turretGlass', box(.09, .035, .012), x, top + .12, z + .04, 0, ry, 0);
  }
  // the gunner's sight head in its armoured box with a forward window
  P.add('turret', box(.44, .22, .50), -.50, top + .10, .32);
  P.add('turretDark', box(.32, .12, .02), -.50, top + .10, .575);
  P.add('turretGlass', box(.26, .08, .012), -.50, top + .10, .582);
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

/** Kubinka's full-height rubber skirts under the BV's skirt band (the band and its front plates are the BV's). Hull frame. */
function addRubberSkirts(P: T80BuilderPort): void {
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
    const z0 = -2.90 + i * .885;
    P.add('hullTrack', box(.03, .44, .87), s * 1.744, .82, z0 + .4425);
    P.add('hullDark', box(.006, .40, .012), s * 1.762, .82, z0 + .88);
  }
}

/** The glacis' Kontakt-1 mounting studs with no bricks on them (Kubinka): two studs at each of the T-80BV raft's 28
 * brick stations (profiles/t80.ts buildT80BVHullKit), standing on the plate along its normal. Hull frame. */
function addKontaktStuds(P: T80BuilderPort): void {
  const tilt = Math.atan2(.438, .899);                       // the plate's outward normal (0, .899, .438)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
    const y = .84 + r * .115 - .045, z = 3.21 - r * .235 - .022;
    for (const dx of [-.075, .075]) P.add('hullDetail', KIT.cylY(.022, .024, .05, 8), -.90 + c * .30 + dx, y, z, tilt, 0, 0);
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
  for (const s of [-1, 1]) P.decal('turret', 'number', P.spec.visual.number || '', .30, [s * 1.165, .55, -1.55], s * Math.PI / 2);
  yield 'object292Box';
  P.gunG.position.set(0, OBJECT292_GUN_FRAME.trunnionY - RING_Y, OBJECT292_GUN_FRAME.trunnionZ);
  addGun(P);
  P.topY = .95;
  yield 'object292Gun';
}

export const OBJECT292_PROFILES = { object292: { build: buildT80BVHullWithTurret({ build: buildObject292Turret }) } };
