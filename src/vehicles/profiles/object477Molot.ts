// The Object 477 Molot (release 269; owner 2026-11-04, 'Object 477 "Molot"'; DECISIONS "2026-11-04 Russian 152 mm
// line"): KhKBM Kharkiv's OKR "Boxer", "Molot" from the late 1980s, on its own hull. Built from its project leader's
// account (Yu. Apukhtin, topwar.ru 2018), btvt.info's figures and drawings and the one photograph of a 477A: a high hull
// with a long, shallow nose (the modular armour package more than a metre deep along the shot line) and full-length
// skirts over T-80UD-type running gear, six large rubber-tyred road wheels a side; a low, wide turret with the crew under
// it, and on its roof the 152 mm gun in its armoured casing (the gun was first mounted in the open, then cased: the
// casing is the Molot's signature, and the owner's images 3 and 4 show it); the 30 mm cannon right of the casing; the
// commander's panoramic sight raised clear of it. 10,650 mm over the gun, 2,434 mm to the casing's roof, a 2,088 mm line
// of fire (btvt). First-party procedural geometry: Kevin B. Liu (NOTICE.md); sources in
// docs/references/photos/russia-152-20261104.json.
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { addHullTub, addSkirtPanels, add30mmCannon } from './russia152Kit.ts';
import { GUN_2A73, build152Gun } from './gun152.ts';
import { MOLOT_FRAME as F } from '../russia152Frames.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylY, cylZ, torus } = KIT;
const ty = (worldY: number) => worldY - F.ringY;
const tz = (worldZ: number) => worldZ - F.ringZ;

function addHull(P: TankBuilderPort): void {
  // [z, roof, bottom, outer, inner, sponson floor]: the long shallow nose rises from 1.00 at the bow to the roof at z 2.20
  addHullTub(P, [
    [-3.55, 1.40, .80, 1.62, 1.06, 1.22],
    [-3.38, 1.56, .55, 1.68, 1.08, 1.20],
    [-2.95, 1.60, .46, 1.68, 1.08, 1.20],
    [2.20, 1.60, .46, 1.68, 1.08, 1.20],
    [3.05, 1.30, .50, 1.68, 1.08, 1.18],
    [3.40, 1.16, .56, 1.64, 1.08, 1.12],
    [3.75, 1.00, .70, 1.12, 1.04, .96],
  ]);
  P.add('hull', box(2.02, .28, .10), 0, .82, 3.70, -.50, 0, 0);
  // the nose's armour package under its bolted titanium lids (built-in ERA): three courses over the driver's station
  const noseY = (z: number) => 1.60 - (z - 2.20) * (.60 / 1.55);
  for (let row = 0; row < 3; row++) for (let col = -2; col <= 2; col++) {
    const z0 = 2.32 + row * .46, z1 = z0 + .42, x = col * .40;
    P.add('hull', sectionSolid([
      { z: z0, ring: [[x - .18, noseY(z0) - .02], [x + .18, noseY(z0) - .02], [x + .18, noseY(z0) + .05], [x - .18, noseY(z0) + .05]] },
      { z: z1, ring: [[x - .18, noseY(z1) - .02], [x + .18, noseY(z1) - .02], [x + .18, noseY(z1) + .05], [x - .18, noseY(z1) + .05]] },
    ]));
    for (const dx of [-.12, .12]) P.addEquipment('hullDark', cylY(.012, .012, .01, 6), x + dx, noseY(z0 + .21) + .056, z0 + .21);
  }
  // the driver's hatch and periscopes on the centreline behind the nose (the late layout's central driver)
  P.addHatch('hullDetail', cylY(.28, .28, .04, 18), 0, 1.615, 2.00);
  for (const dx of [-.20, 0, .20]) {
    P.addEquipment('hullDark', box(.14, .08, .09), dx, 1.64, 2.32);
    P.addEquipment('hullGlass', box(.11, .035, .01), dx, 1.655, 2.37);
  }
  for (const s of [-1, 1]) {
    P.addEquipment('hullDark', box(.16, .10, .08), s * 1.26, 1.28, 3.30);
    P.addEquipment('hullGlass', box(.12, .06, .01), s * 1.26, 1.28, 3.345);
    P.addMudguard('molot-front-guard', 'hull', box(.56, .04, .55), s * 1.40, 1.12, 3.58, -.12, 0, 0);
    P.addMudguard('molot-front-flap', 'hullRubber', box(.50, .26, .03), s * 1.40, .97, 3.86);
    P.addMudguard('molot-rear-flap', 'hullRubber', box(.50, .30, .03), s * 1.40, 1.05, -3.55);
    // the auxiliary diesel's box on the left rear fender, the stowage bin on the right
    P.addEquipment('hullDetail', box(.40, .34, .95), s * 1.46, 1.77, -2.30);
  }
  // the 6TDF's louvred deck, the exhaust slot and the stern plate's fuel drums and unditching log
  P.addEquipment('hullDark', box(2.10, .02, 1.50), 0, 1.59, -2.55);
  for (let k = 0; k < 10; k++) P.addEquipment('hullDetail', box(2.04, .02, .04), 0, 1.602, -1.88 - k * .14);
  for (const s of [-1, 1]) P.addEquipment('hullDark', box(.70, .12, .30), s * 1.20, 1.50, -3.42);
  P.addEquipment('hullWood', cylZ(.11, 1.90, 10), 0, 1.45, -3.62, 0, Math.PI / 2, 0);
  KIT.towCable(P, [[.95, 1.61, -2.90], [1.30, 1.615, -1.20], [1.25, 1.615, .60]], .02);
}

function addRunningGear(P: TankBuilderPort): void {
  // six large rubber-tyred road wheels a side on the T-80UD's "Leningrad" running gear (Apukhtin), at the T-80U's wheel,
  // shoe and roller measures (profiles/t80uX.ts) along the Molot's longer hull
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: .35247, wheelY: .42629, wheelW: .347,
    wheelZs: [-2.30, -1.44, -.58, .28, 1.14, 2.00], xc: 1.35185, trackW: .55684, trackTh: .030,
    sprocket: { z: -3.02, y: .917215, r: .292985, trackR: .286 }, idler: { z: 3.18, y: .917215, r: .292985, trackR: .286 },
    rollers: [{ z: -1.87, y: 1.073, r: .10 }, { z: -.15, y: 1.073, r: .10 }, { z: 1.57, y: 1.073, r: .10 }],
    rollerR: .10, returnRollerWidthM: .18, returnRollerInsetM: .10,
    topY: 1.173, botY: .082, paintedEnds: true, arms: true, coveredTop: true, linkPitchM: .143,
    sprocketDepthScale: .83, idlerDepthScale: .83,
    trackShoeDimensions: { padHeight: .036, grouserHeight: .012, webHeight: .018, hornHeight: .070, pinRadius: .011, pinCentreY: 0 },
  });
  // the multi-barrier flanks: full-length skirt panels, the front three thicker over their ERA
  addSkirtPanels(P, { x: 1.73, z0: .55, z1: 3.10, y0: .62, y1: 1.58, n: 3, th: .09 });
  addSkirtPanels(P, { x: 1.71, z0: -3.30, z1: .55, y0: .70, y1: 1.58, n: 5, th: .04 });
}

/** The low, wide turret the crew sits under, the gun's armoured casing on its roof, the sights and the 30 mm. */
function addTurret(P: TankBuilderPort): void {
  // the low body: a wedge in plan to its nose, a flat roof, a short bustle with the ready rounds' belt
  P.add('turret', sectionSolid([
    { z: -1.70, ring: [[-.95, .04], [.95, .04], [.95, .36], [-.95, .36]] },
    { z: -1.45, ring: [[-1.18, .02], [1.18, .02], [1.18, .42], [-1.18, .42]] },
    { z: .55, ring: [[-1.22, .02], [1.22, .02], [1.22, .44], [-1.22, .44]] },
    { z: 1.25, ring: [[-.62, .04], [.62, .04], [.62, .38], [-.62, .38]] },
  ]));
  P.add('turret', cylY(1.00, 1.02, .10, 36), 0, .03, 0);
  // the casing ("пенал"): a long armoured box on the roof's centreline round the gun's cradle and breech, its brow raked
  P.add('turret', sectionSolid([
    { z: -1.72, ring: [[-.36, .36], [.36, .36], [.36, .74], [.30, .80], [-.30, .80], [-.36, .74]] },
    { z: .90, ring: [[-.40, .36], [.40, .36], [.40, .78], [.34, .834], [-.34, .834], [-.40, .78]] },
    { z: 1.32, ring: [[-.40, .64], [.40, .64], [.40, .74], [.34, .79], [-.34, .79], [-.40, .74]] },
  ]));
  for (const s of [-1, 1]) for (const z of [-1.10, -.20]) P.addEquipment('turretDark', box(.012, .38, .02), s * .395, .58, z);
  P.addEquipment('turretDetail', box(.60, .02, .80), 0, .835, -.80);
  // the sabot petals' ejection hatch at the casing's tail
  P.addEquipment('turretDetail', box(.50, .03, .30), 0, .82, -1.50);
  // the gunner's multichannel sight on the casing's left flank, its window forward
  P.add('turret', box(.30, .34, .46), -.56, .62, .70);
  P.addEquipment('turretDark', box(.24, .22, .02), -.56, .62, .935);
  P.addEquipment('turretGlass', box(.18, .14, .012), -.56, .63, .945);
  // the commander's panoramic sight on its raised pedestal at the back right (raised clear of the casing)
  P.add('turret', cylY(.15, .17, .44, 20), .62, .64, -.78);
  P.addEquipment('turretDetail', cylY(.19, .19, .20, 22), .62, .96, -.78);
  P.addEquipment('turretDetail', box(.22, .14, .12), .62, 1.00, -.64);
  P.addEquipment('turretGlass', box(.17, .09, .01), .62, 1.00, -.578);
  P.addEquipment('turretDetail', cylY(.20, .20, .03, 22), .62, 1.075, -.78);
  // the commander's and gunner's hatches on the low roof either side of the casing
  P.addHatch('turretDetail', cylY(.26, .27, .04, 18), -.72, .46, -.55);
  for (const s of [-1, 1]) {
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: .040, len: .25, pitch: -.42, splay: .28, arc: .48, spacing: .088, seed: 477 + s });
    smoke.position.set(s * 1.05, .40, .62);
    smoke.rotation.y = s * .95;
    P.turretG.add(smoke);
    P.addEquipment('turretDetail', box(.20, .06, .40), s * 1.04, .37, .62, 0, s * .4, 0);
  }
  for (const [x, z, h] of [[-1.00, -1.40, 1.10], [1.00, -1.40, .90]]) {
    P.addEquipment('turretDetail', cylY(.04, .05, .08, 12), x, .46, z);
    P.addEquipment('turretDark', cylY(.009, .012, h, 8), x, .50 + h / 2, z);
  }
  P.decal('turret', 'number', P.spec.visual.number || '', .26, [1.205, .24, -.70], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', .26, [-1.205, .24, -.70], -Math.PI / 2);
  add30mmCannon(P, { name: 'molot_gsh30', x: .78, deck: .44, z: .45, axisY: .66, pivotZ: .45, muzzleZ: 2.20 });
}

/** The gun's armoured mantlet at the casing's brow and the 152 mm tube. Gun frame. */
function addGun(P: TankBuilderPort): void {
  P.addGunExtra(sectionSolid([
    { z: -.40, ring: [[-.30, -.24], [.30, -.24], [.34, -.10], [.34, .20], [.26, .28], [-.26, .28], [-.34, .20], [-.34, -.10]] },
    { z: .48, ring: [[-.30, -.24], [.30, -.24], [.34, -.10], [.34, .20], [.26, .28], [-.26, .28], [-.34, .20], [-.34, -.10]] },
    { z: .62, ring: [[-.24, -.18], [.24, -.18], [.27, -.07], [.27, .14], [.20, .20], [-.20, .20], [-.27, .14], [-.27, -.07]] },
  ]));
  P.addGunExtra(cylZ(.21, .40, 24, .23), 0, 0, .80);
  build152Gun(P, { ...GUN_2A73, len: F.muzzleZ - F.trunnionZ });
}

export function buildObject477Molot(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(0, F.ringY, F.ringZ);
  P.gunG.position.set(0, ty(F.trunnionY), tz(F.trunnionZ));
  addHull(P);
  addRunningGear(P);
  addTurret(P);
  addGun(P);
  P.topY = 1.08;
}

export const OBJECT477_MOLOT_PROFILES = { object477_molot: { build: buildObject477Molot } };
