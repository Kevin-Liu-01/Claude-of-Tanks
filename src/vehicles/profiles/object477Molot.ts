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
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { addHullTub, addSkirtPanels, add30mmCannon, sideSolid } from './russia152Kit.ts';
import { GUN_2A73, build152Gun } from './gun152.ts';
import { MOLOT_FRAME as F } from '../russia152Frames.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylY, cylZ } = KIT;
/** The glacis: from the roof at z 1.60 down to the prow's edge (0.92 m at z 3.75). */
const NOSE_Z0 = 1.60;
const noseY = (z: number) => F.roofY - (z - NOSE_Z0) * ((F.roofY - .92) / (F.hullFrontZ - NOSE_Z0));
const ty = (worldY: number) => worldY - F.ringY;
const tz = (worldZ: number) => worldZ - F.ringZ;

function addHull(P: TankBuilderPort): void {
  // [z, roof, bottom, outer, inner, sponson floor]: the long raked upper nose rises from the prow's edge (0.88 m, z 3.75)
  // to the roof at z 1.60, ahead of the turret; the lower plate rakes back under it to the belly (btvt's drawing: a long
  // glacis to a pointed prow)
  addHullTub(P, [
    [-3.55, 1.40, .80, 1.62, 1.06, 1.22],
    [-3.38, 1.56, .55, 1.68, 1.08, 1.20],
    [-2.95, 1.60, .46, 1.68, 1.08, 1.20],
    [NOSE_Z0, 1.60, .46, 1.68, 1.08, 1.20],
    [3.05, noseY(3.05), .50, 1.68, 1.08, 1.15],
    [3.42, noseY(3.42), .62, 1.64, 1.08, 1.00],
    [3.75, noseY(3.75), .84, 1.12, 1.04, .88],
  ]);
  // the nose's built-in armour package under its plain plate (btvt's drawing and the owner's images: no external tiles), its
  // lid seams across the glacis
  for (const z of [2.10, 2.60, 3.10]) {
    P.addEquipment('hullDark', box(2.10, .012, .03), 0, noseY(z) + .004, z, Math.atan2(F.roofY - .92, F.hullFrontZ - NOSE_Z0), 0, 0);
  }
  // the driver's hatch and periscopes on the centreline at the glacis' head (the late layout's central driver)
  P.addHatch('hullDetail', cylY(.26, .26, .04, 18), 0, 1.615, 1.36);
  for (const dx of [-.20, 0, .20]) {
    P.addEquipment('hullDark', box(.14, .08, .09), dx, 1.64, 1.56);
    P.addEquipment('hullGlass', box(.11, .035, .01), dx, 1.655, 1.605);
  }
  for (const s of [-1, 1]) {
    P.addEquipment('hullDark', box(.16, .10, .08), s * 1.26, noseY(3.30) + .04, 3.30);
    P.addEquipment('hullGlass', box(.12, .06, .01), s * 1.26, noseY(3.30) + .04, 3.345);
    P.addMudguard('molot-front-guard', 'hull', box(.56, .04, .55), s * 1.40, 1.12, 3.58, -.12, 0, 0);
    P.addMudguard('molot-front-flap', 'hullRubber', box(.50, .26, .03), s * 1.40, .97, 3.86);
    P.addMudguard('molot-rear-flap', 'hullRubber', box(.50, .30, .03), s * 1.40, 1.05, -3.55);
    // the auxiliary diesel's box on the left rear fender, the stowage bin on the right
    P.addEquipment('hullDetail', box(.40, .22, .90), s * 1.46, 1.71, -2.30);
  }
  // the 6TDF's louvred deck, the exhaust slot and the stern plate's fuel drums and unditching log
  P.addEquipment('hullDark', box(2.10, .02, 1.50), 0, 1.59, -2.55);
  for (let k = 0; k < 10; k++) P.addEquipment('hullDetail', box(2.04, .02, .04), 0, 1.602, -1.88 - k * .14);
  for (const s of [-1, 1]) P.addEquipment('hullDark', box(.70, .12, .30), s * 1.20, 1.50, -3.42);
  P.addEquipment('hullWood', cylZ(.11, 1.90, 10), 0, 1.45, -3.62, 0, Math.PI / 2, 0);
  KIT.towCable(P, [[.95, 1.61, -2.90], [1.30, 1.615, -1.20], [1.25, 1.615, .60]], .02);
}

/** The flank's front run: six pillowed panels (z 0.45 to 3.00), each bulging 4 cm at its middle, the tops at the roof and
 * down along the glacis ahead of z 1.60. Hull frame. */
function addBulgedPanels(P: TankBuilderPort): void {
  const [z0, z1, n, y0] = [.45, 3.00, 6, .62], len = (z1 - z0) / n;
  const top = (z: number) => Math.min(1.58, noseY(z) + .06);
  const ring = (z: number, out: number, inset: number): SolidSection => ({ z, ring: [[1.675, y0 + inset], [out, y0 + inset],
    [out, top(z) - inset], [1.675, top(z) - inset]] });
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
    const a = z0 + i * len + .01, b = a + len - .02;
    P.add('hull', sideSolid([ring(a, 1.745, .03), ring((a + b) / 2, 1.785, 0), ring(b, 1.745, .03)], s));
  }
}

function addRunningGear(P: TankBuilderPort): void {
  // seven large rubber-tyred road wheels a side from just behind the nose (btvt's profile drawing; the owner's images) on the
  // T-80UD's "Leningrad" running gear (Apukhtin), at the T-80U's wheel, shoe and roller measures (profiles/t80uX.ts)
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: .35247, wheelY: .42629, wheelW: .347,
    wheelZs: [-2.45, -1.633, -.817, 0, .817, 1.633, 2.45], xc: 1.35185, trackW: .55684, trackTh: .030,
    sprocket: { z: -3.05, y: .917215, r: .292985, trackR: .286 }, idler: { z: 3.20, y: .917215, r: .292985, trackR: .286 },
    rollers: [{ z: -2.04, y: 1.073, r: .10 }, { z: -.41, y: 1.073, r: .10 }, { z: 1.22, y: 1.073, r: .10 }],
    rollerR: .10, returnRollerWidthM: .18, returnRollerInsetM: .10,
    topY: 1.173, botY: .082, paintedEnds: true, arms: true, coveredTop: true, linkPitchM: .143,
    sprocketDepthScale: .83, idlerDepthScale: .83,
    trackShoeDimensions: { padHeight: .036, grouserHeight: .012, webHeight: .018, hornHeight: .070, pinRadius: .011, pinCentreY: 0 },
  });
  // the multi-barrier flanks (btvt's drawing): six bulged armour panels from the turret's front to the nose, their tops
  // following the glacis down, and plain plates behind them
  addBulgedPanels(P);
  addSkirtPanels(P, { x: 1.71, z0: -3.30, z1: .45, y0: .70, y1: 1.58, n: 2, th: .04 });
  // the skirts' raked front panel down toward the prow
  for (const s of [-1, 1]) {
    P.add('hull', sideSolid([
      { z: 3.00, ring: [[1.685, .62], [1.775, .62], [1.775, noseY(3.00) + .06], [1.685, noseY(3.00) + .06]] },
      { z: 3.50, ring: [[1.685, .95], [1.775, .95], [1.775, noseY(3.50) + .06], [1.685, noseY(3.50) + .06]] },
    ], s));
  }
}

/** The low, wide turret the crew sits under, the gun's armoured casing on its roof, the sights and the 30 mm. */
function addTurret(P: TankBuilderPort): void {
  // the low body: a wedge in plan to its nose, a flat roof, a short bustle with the ready rounds' belt
  P.add('turret', sectionSolid([
    { z: -1.70, ring: [[-.95, .04], [.95, .04], [.95, .36], [-.95, .36]] },
    { z: -1.45, ring: [[-1.18, .02], [1.18, .02], [1.18, .42], [-1.18, .42]] },
    { z: .55, ring: [[-1.22, .02], [1.22, .02], [1.22, .44], [-1.22, .44]] },
    { z: 1.25, ring: [[-.62, .04], [.62, .04], [.62, .26], [-.62, .26]] },
  ]));
  P.add('turret', cylY(1.00, 1.02, .10, 36), 0, .03, 0);
  // the casing ("пенал") round the gun's cradle and breech (btvt's drawing): a tall, blocky front over the mantlet standing
  // ahead of the sloped turret face, to btvt's 2,434 mm, and a lower run back along the roof over the breech
  const oct = (z: number, hw: number, y0: number, y1: number): SolidSection => ({ z, ring: [[-hw, y0], [hw, y0], [hw, y1 - .06],
    [hw - .06, y1], [-(hw - .06), y1], [-hw, y1 - .06]] });
  P.add('turret', sectionSolid([oct(-1.40, .34, .34, .66), oct(.40, .38, .30, .70), oct(.48, .50, .26, .834),
    oct(1.40, .50, .24, .834), oct(1.70, .46, .24, .74)]));
  const rearHw = (z: number) => .34 + .04 * (z + 1.40) / 1.80, rearTop = (z: number) => .66 + .04 * (z + 1.40) / 1.80;
  for (const s of [-1, 1]) for (const z of [-1.10, -.20]) P.addEquipment('turretDark', box(.012, .30, .02), s * (rearHw(z) + .004), .50, z);
  P.addEquipment('turretDetail', box(.56, .02, .80), 0, rearTop(-.80) + .005, -.80);
  // the sabot petals' ejection hatch at the casing's tail
  P.addEquipment('turretDetail', box(.50, .03, .30), 0, rearTop(-1.25) + .01, -1.25);
  // the gunner's multichannel sight on the casing's left flank, its window forward
  P.add('turret', box(.30, .34, .46), -.56, .62, .70);
  P.addEquipment('turretDark', box(.24, .22, .02), -.56, .62, .935);
  P.addEquipment('turretGlass', box(.18, .14, .012), -.56, .63, .945);
  // the commander's panoramic sight, low on a short pedestal beside the casing ahead of the ring's middle (btvt's drawing)
  P.add('turret', cylY(.16, .18, .22, 20), .58, .54, -.15);
  P.addEquipment('turretDetail', cylY(.21, .21, .08, 22), .58, .69, -.15);
  P.addEquipment('turretDetail', KIT.sph(.20, 18, Math.PI / 2), .58, .73, -.15);
  P.addEquipment('turretDark', box(.22, .10, .10), .58, .81, .01);
  P.addEquipment('turretGlass', box(.17, .07, .01), .58, .81, .063);
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
  add30mmCannon(P, { name: 'molot_gsh30', x: .80, deck: .44, z: .45, axisY: .68, pivotZ: .45, muzzleZ: 2.35 });
}

/** The gun's armoured mantlet at the casing's brow and the 152 mm tube. Gun frame. */
function addGun(P: TankBuilderPort): void {
  P.addGunExtra(sectionSolid([
    { z: -.40, ring: [[-.30, -.24], [.30, -.24], [.34, -.10], [.34, .20], [.26, .28], [-.26, .28], [-.34, .20], [-.34, -.10]] },
    { z: .48, ring: [[-.30, -.24], [.30, -.24], [.34, -.10], [.34, .20], [.26, .28], [-.26, .28], [-.34, .20], [-.34, -.10]] },
    { z: .62, ring: [[-.24, -.18], [.24, -.18], [.27, -.07], [.27, .14], [.20, .20], [-.20, .20], [-.27, .14], [-.27, -.07]] },
  ]));
  P.addGunExtra(cylZ(.20, .20, 24, .22), 0, 0, .96);
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
  P.topY = 1.12;
}

export const OBJECT477_MOLOT_PROFILES = { object477_molot: { build: buildObject477Molot } };
