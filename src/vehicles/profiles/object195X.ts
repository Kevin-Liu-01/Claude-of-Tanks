// The Object 195 (release 269; owner 2026-11-04, "make a new russian tank called object 195 ... because it has a 152 mm
// gun"; DECISIONS "2026-11-04 Russian 152 mm line"): UKBTM and Uralvagonzavod's T-95 of OKR "Sovershenstvovanie-88", built
// from its prototypes' photographs (the first prototype in its workshop, Gur Khan 2018, the owner's second image; the
// second prototype at Donguz, btvt) and the published layout (the 2010 patent: crew capsule forward, carousel amidships,
// engine aft). A long hull on seven T-90-type road wheels under a long, shallow glacis, flat skirt panels with recessed
// handles; amidships the tall, square unmanned module ("Угловатая, квадратная башня", Khlopotov) carrying the 2A83 on an
// exposed cradle, the gunner's sight block right of it, the 30 mm 2A42 on the left, the commander's panoramic sight on
// its mast and the first prototype's search radar and Shtandart active protection. First-party procedural geometry:
// Kevin B. Liu (NOTICE.md); sources in docs/references/photos/russia-152-20261104.json.
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { addHullTub, addSkirtPanels, add30mmCannon, sideSolid } from './russia152Kit.ts';
import { GUN_2A83, build152Gun } from './gun152.ts';
import { OBJECT195_FRAME as F } from '../russia152Frames.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylY, cylZ, torus } = KIT;
const ty = (worldY: number) => worldY - F.ringY;
const tz = (worldZ: number) => worldZ - F.ringZ;

/** The long, nearly flat upper glacis over the crew capsule: from the roof at z 1.60 to the nose's edge (Gur Khan's and
 * the Donguz photographs: it runs far ahead of the module). */
const GLACIS_Z0 = 1.60, NOSE_Y = 1.02;
const glacisY = (z: number) => F.roofY - (z - GLACIS_Z0) * ((F.roofY - NOSE_Y) / (F.hullFrontZ - GLACIS_Z0));
const GLACIS_RAKE = Math.atan2(F.roofY - NOSE_Y, F.hullFrontZ - GLACIS_Z0);

function addHull(P: TankBuilderPort): void {
  const R = F.roofY;
  // [z, roof, bottom, outer, inner, sponson floor]: the glacis falls 0.58 m over 2.35 m to the nose; the bow narrows inside
  // the idlers; the stern deck steps down over the sprockets
  addHullTub(P, [
    [-3.95, R - .18, .86, 1.20, 1.04, 1.28],
    [-3.80, R - .08, .66, 1.66, 1.08, 1.22],
    [-3.45, R - .04, .50, 1.70, 1.10, 1.20],
    [-2.90, R, .45, 1.70, 1.10, 1.20],
    [GLACIS_Z0, R, .45, 1.70, 1.10, 1.20],
    [3.05, glacisY(3.05), .47, 1.70, 1.10, 1.18],
    [3.42, glacisY(3.42), .52, 1.66, 1.10, 1.10],
    [3.62, glacisY(3.62), .56, 1.14, 1.06, 1.06],
    [F.hullFrontZ, NOSE_Y, .70, 1.10, 1.02, .96],
  ]);
  // the nose's lower plate and its tow eyes
  P.add('hull', box(2.04, .28, .10), 0, .84, 3.90, -.45, 0, 0);
  for (const s of [-1, 1]) P.addEquipment('hullDetail', torus(.07, .02, 12, 6), s * .78, .80, 3.97, Math.PI / 2, 0, 0);
  // the glacis' plate seams (Gur Khan's photograph: a plain sloped plate)
  for (const z of [2.70, 3.30]) P.addEquipment('hullDark', box(2.10, .012, .03), 0, glacisY(z) + .004, z, GLACIS_RAKE, 0, 0);
  // the crew capsule's three hatches side by side on the glacis, with their periscopes
  for (const x of [-.72, 0, .72]) {
    const z = 2.05, y = glacisY(z);
    P.addHatch('hullDetail', cylY(.27, .27, .04, 18), x, y + .015, z, GLACIS_RAKE, 0, 0);
    P.addEquipment('hullDark', box(.20, .02, .05), x, glacisY(1.80) + .03, 1.80, GLACIS_RAKE, 0, 0);
    for (const dx of [-.16, .16]) {
      P.addEquipment('hullDark', box(.13, .08, .09), x + dx, glacisY(2.38) + .03, 2.38, GLACIS_RAKE, 0, 0);
      P.addEquipment('hullGlass', box(.10, .035, .01), x + dx, glacisY(2.38) + .045, 2.43, GLACIS_RAKE, 0, 0);
    }
  }
  // headlights and the fender tips over the idlers
  for (const s of [-1, 1]) {
    P.addEquipment('hullDark', box(.16, .10, .08), s * 1.30, glacisY(3.44) - .02, 3.44);
    P.addEquipment('hullGlass', box(.12, .06, .01), s * 1.30, glacisY(3.44) - .02, 3.485);
    P.addMudguard('object195-front-guard', 'hull', box(.56, .04, .55), s * 1.42, 1.13, 3.75, -.10, 0, 0);
    P.addMudguard('object195-front-flap', 'hullRubber', box(.50, .26, .03), s * 1.42, .98, 4.02);
    P.addMudguard('object195-rear-flap', 'hullRubber', box(.50, .30, .03), s * 1.42, 1.04, -3.93);
  }
  // the engine deck's grilles and the stern plate's fittings
  P.addEquipment('hullDark', box(2.30, .02, 1.40), 0, R - .01, -2.80);
  for (let k = 0; k < 9; k++) P.addEquipment('hullDetail', box(2.24, .02, .04), 0, R + .002, -2.20 - k * .135);
  P.addEquipment('hullDark', box(1.30, .30, .04), 0, 1.20, -3.97);
  for (const s of [-1, 1]) {
    P.addEquipment('hullDetail', cylY(.14, .14, .50, 12), s * .95, 1.24, -4.02, 0, 0, Math.PI / 2);
    P.addEquipment('hullDetail', torus(.06, .018, 10, 6), s * .70, .95, -3.99, Math.PI / 2, 0, 0);
  }
  KIT.towCable(P, [[-.95, R + .01, -3.10], [-1.25, R + .015, -1.60], [-1.20, R + .015, .20]], .02);
  P.decal('hull', 'number', P.spec.visual.number || '', .32, [1.806, 1.22, -1.20], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', .32, [-1.806, 1.22, -1.20], -Math.PI / 2);
}

function addRunningGear(P: TankBuilderPort): void {
  // seven T-90-type road wheels a side (btvt: «катки аналогичны применяемым на танке Т-90»), torsion bars, the
  // sprocket aft and the idler forward; the T-90's own wheel, shoe and roller measures (profiles/t90AwX.ts)
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: .39405, wheelY: .44845, wheelW: .4106,
    wheelZs: [-2.58, -1.72, -.86, 0, .86, 1.72, 2.58], xc: 1.4426, trackW: .4942, trackTh: .030,
    idler: { z: 3.38, y: .8773, r: .2617, trackR: .251 }, sprocket: { z: -3.42, y: .8285, r: .385, trackR: .347 },
    rollers: [{ z: -2.15, y: 1.07865, r: .12335 }, { z: -.43, y: 1.07865, r: .12335 }, { z: 1.29, y: 1.07865, r: .12335 }],
    rollerR: .12335, returnRollerWidthM: .0982, returnRollerInsetM: .1086, topY: 1.221, botY: .045,
    arms: true, coveredTop: true, paintedEnds: true, sprocketDepthScale: .82, idlerDepthScale: .82, linkPitchM: .138,
    trackShoeDimensions: { padHeight: .036, grouserHeight: .010, webHeight: .018, hornHeight: .040, pinRadius: .009, pinCentreY: 0 },
  });
  // the flat skirt panels with recessed handles, the stern's last panel stepped down (Gur Khan photograph)
  addSkirtPanels(P, { x: 1.755, z0: -3.10, z1: 3.10, y0: .68, y1: F.roofY - .02, n: 6, th: .05 });
  addSkirtPanels(P, { x: 1.755, z0: -3.86, z1: -3.10, y0: .86, y1: F.roofY - .10, n: 1, th: .05 });
  // the skirts' angled front panel down to the nose (both photographs)
  for (const s of [-1, 1]) {
    P.add('hull', sideSolid([
      { z: 3.10, ring: [[1.73, .68], [1.78, .68], [1.78, F.roofY - .02], [1.73, F.roofY - .02]] },
      { z: 3.62, ring: [[1.73, .98], [1.78, .98], [1.78, glacisY(3.62) + .02], [1.73, glacisY(3.62) + .02]] },
    ], s));
  }
}

/** The unmanned module (round 2, the critics: narrow and tall, the gun high, its face crowded): the ring collar, the
 * square body, the gun slot's lintel over the round mantlet, the stacked sight boxes, the square sight tower on its roof,
 * the search radar's boxes and the Shtandart's domes and launchers, and the 2A42 in its pod on the roof's left. */
function addModule(P: TankBuilderPort): void {
  P.add('turret', cylY(1.00, 1.02, .14, 40), 0, .06, 0);
  // the square body: the rear tall over the autoloader's breech run, chamfered along its roof
  P.add('turret', sectionSolid([-1.45, -1.30, .25, .95].map((z, i): SolidSection => {
    const half = i === 0 ? .88 : .95, top = i === 0 ? 1.12 : 1.20, low = .10;
    return { z, ring: [[-half, low], [half, low], [half, top - .10], [half - .10, top], [-half + .10, top], [-half, top - .10]] };
  })));
  // the front faces either side of the gun slot, raked back, and the lintel over the mantlet
  const faces: SolidSection[] = [
    { z: .95, ring: [[.40, .10], [.95, .10], [.95, 1.10], [.40, 1.10]] },
    { z: 1.25, ring: [[.40, .14], [.88, .14], [.88, .80], [.40, .80]] },
  ];
  for (const s of [-1, 1]) {
    P.add('turret', sectionSolid(faces.map(({ z, ring }) => ({ z, ring: s > 0 ? ring : ring.map(([x, y]) => [-x, y] as [number, number]).reverse() }))));
  }
  // the lintel over the mantlet closes the gun slot down to the shield's top at full elevation (0.81)
  P.add('turret', box(.80, .32, .36), 0, 1.02, 1.10);
  // the gunner's sight boxes stacked right of the gun, their windows and hoods
  for (const [y, h] of [[.50, .30], [.86, .30]]) {
    P.add('turret', box(.34, h, .30), .66, y, 1.32);
    P.addEquipment('turretDark', box(.26, h - .08, .02), .66, y, 1.475);
    P.addEquipment('turretGlass', box(.18, h - .14, .012), .66, y, 1.484);
    P.addEquipment('turretDetail', box(.32, .03, .08), .66, y + h / 2, 1.46);
  }
  // the square sight tower on the roof (both photographs), its window forward
  P.add('turret', box(.42, .40, .44), -.36, 1.40, .30);
  P.addEquipment('turretDark', box(.32, .22, .02), -.36, 1.43, .525);
  P.addEquipment('turretGlass', box(.26, .16, .012), -.36, 1.43, .533);
  P.addEquipment('turretDetail', box(.46, .04, .48), -.36, 1.62, .30);
  // the tall sight and sensor box stepped up at the module's rear right
  P.add('turret', box(.40, .46, .56), .62, 1.40, -1.00);
  P.addEquipment('turretDark', box(.30, .24, .02), .62, 1.44, -.715);
  P.addEquipment('turretGlass', box(.22, .16, .012), .62, 1.44, -.707);
  // the commander's panoramic sight in its armoured box at the back left
  P.add('turret', box(.36, .30, .36), -.50, 1.35, -.85);
  P.addEquipment('turretDetail', cylY(.15, .15, .14, 20), -.50, 1.57, -.85);
  P.addEquipment('turretGlass', box(.18, .08, .01), -.50, 1.57, -.698);
  // the search radar's antenna boxes on the module's rear corners and the Shtandart's sensor domes and launchers
  for (const s of [-1, 1]) {
    P.addEquipment('turretDetail', box(.30, .42, .12), s * .90, .80, -1.38, 0, s * -.45, 0);
    P.addEquipment('turretDark', box(.24, .34, .02), s * .94, .80, -1.43, 0, s * -.45, 0);
    for (const dz of [.55, .10]) {
      P.addEquipment('turretDetail', cylY(.09, .09, .06, 16), s * .99, .14, dz);
      P.addEquipment('turretGlass', KIT.sph(.085, 14, Math.PI / 2), s * .99, .21, dz);
    }
    const tubes = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: .045, len: .30, pitch: -.30, splay: .20, arc: .42, spacing: .10, seed: 195 + s });
    tubes.position.set(s * .97, .98, .98);
    tubes.rotation.y = s * .55;
    P.turretG.add(tubes);
    P.addEquipment('turretDetail', box(.26, .06, .30), s * .97, .90, .98, 0, s * .55, 0);
  }
  // roof: the loading hatch and the stub antennas
  P.addEquipment('turretDetail', box(.60, .03, .52), .30, 1.215, -.70);
  P.addEquipment('turretDark', box(.60, .01, .02), .30, 1.233, -.95);
  for (const [x, z, h] of [[.80, -1.30, .95], [-.80, -1.30, .80]]) {
    P.addEquipment('turretDetail', cylY(.04, .05, .08, 12), x, 1.16, z);
    P.addEquipment('turretDark', cylY(.009, .012, h, 8), x, 1.20 + h / 2, z);
  }
  P.decal('turret', 'number', P.spec.visual.number || '', .28, [.955, .62, -.50], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', .28, [-.955, .62, -.50], -Math.PI / 2);
  // the 2A42 in its low pod on the roof's left, beside the sight tower
  add30mmCannon(P, { name: 'object195_2a42', x: -.74, deck: 1.20, z: -.20, axisY: 1.34, pivotZ: -.20, muzzleZ: 1.85 });
}

/** The 2A83 on its exposed cradle: the cradle's shield, the recoil cylinders' housings, the tube. Gun frame. */
function addGun(P: TankBuilderPort): void {
  P.addGunExtra(sectionSolid([
    { z: -.70, ring: [[-.34, -.30], [.34, -.30], [.38, -.10], [.38, .22], [.30, .30], [-.30, .30], [-.38, .22], [-.38, -.10]] },
    { z: .12, ring: [[-.34, -.30], [.34, -.30], [.38, -.10], [.38, .22], [.30, .30], [-.30, .30], [-.38, .22], [-.38, -.10]] },
    { z: .30, ring: [[-.26, -.22], [.26, -.22], [.29, -.08], [.29, .16], [.23, .22], [-.23, .22], [-.29, .16], [-.29, -.08]] },
  ]));
  for (const s of [-1, 1]) P.addGunExtraDark(cylZ(.055, .70, 14), s * .18, .24, -.10);
  // the cradle's big trunnion block across the gun, the round mantlet ahead of the shield, and the tube's root collar
  P.addGunExtra(KIT.cylX(.24, .96, 24), 0, 0, -.12);
  P.addGunExtra(cylZ(.30, .26, 28, .27), 0, 0, .40);
  P.addGunExtra(cylZ(.215, .35, 24, .23), 0, 0, .66);
  build152Gun(P, { ...GUN_2A83, len: F.muzzleZ - F.trunnionZ });
}

export function buildObject195X(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(0, F.ringY, F.ringZ);
  P.gunG.position.set(0, ty(F.trunnionY), tz(F.trunnionZ));
  addHull(P);
  addRunningGear(P);
  addModule(P);
  addGun(P);
  P.topY = 1.64;
}

export const OBJECT195_X_PROFILES = { object195: { build: buildObject195X } };
