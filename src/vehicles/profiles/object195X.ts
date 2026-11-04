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
import { sectionSolid } from './sectionSolid.ts';
import { addHullTub, addSkirtPanels, add30mmCannon } from './russia152Kit.ts';
import { GUN_2A83, build152Gun } from './gun152.ts';
import { OBJECT195_FRAME as F } from '../russia152Frames.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylY, cylZ, torus } = KIT;
const ty = (worldY: number) => worldY - F.ringY;
const tz = (worldZ: number) => worldZ - F.ringZ;

function addHull(P: TankBuilderPort): void {
  // [z, roof, bottom, outer, inner, sponson floor]: the long shallow glacis falls from the roof at z 2.35 to the nose
  // at 0.98; the bow narrows inside the idlers; the stern deck steps down over the sprockets
  addHullTub(P, [
    [-3.95, 1.52, .86, 1.20, 1.04, 1.30],
    [-3.80, 1.62, .66, 1.66, 1.08, 1.22],
    [-3.45, 1.66, .50, 1.70, 1.10, 1.20],
    [-2.90, 1.70, .45, 1.70, 1.10, 1.20],
    [2.35, 1.72, .45, 1.70, 1.10, 1.20],
    [3.05, 1.40, .47, 1.70, 1.10, 1.20],
    [3.42, 1.24, .52, 1.66, 1.10, 1.18],
    [3.62, 1.14, .56, 1.14, 1.06, 1.12],
    [3.95, .98, .68, 1.10, 1.02, .96],
  ]);
  // the nose's lower plate and its tow eyes
  P.add('hull', box(2.04, .26, .10), 0, .80, 3.90, -.45, 0, 0);
  for (const s of [-1, 1]) P.addEquipment('hullDetail', torus(.07, .02, 12, 6), s * .78, .78, 3.97, Math.PI / 2, 0, 0);
  // the glacis' armour modules: two courses of bolted plates over the capsule's nose
  const glacisY = (z: number) => 1.72 - (z - 2.35) * (.74 / 1.60);
  for (let row = 0; row < 2; row++) for (let col = -3; col <= 3; col++) {
    const z0 = 2.55 + row * .66, z1 = z0 + .60, x = col * .30;
    P.add('hull', sectionSolid([
      { z: z0, ring: [[x - .14, glacisY(z0) - .02], [x + .14, glacisY(z0) - .02], [x + .14, glacisY(z0) + .045], [x - .14, glacisY(z0) + .045]] },
      { z: z1, ring: [[x - .14, glacisY(z1) - .02], [x + .14, glacisY(z1) - .02], [x + .14, glacisY(z1) + .045], [x - .14, glacisY(z1) + .045]] },
    ]));
  }
  // the crew capsule's three hatches side by side behind the glacis, with their periscopes
  for (const x of [-.72, 0, .72]) {
    P.addHatch('hullDetail', cylY(.27, .27, .04, 18), x, 1.735, 1.95);
    P.addEquipment('hullDark', box(.20, .02, .05), x, 1.76, 1.72);
    for (const dx of [-.16, .16]) {
      P.addEquipment('hullDark', box(.13, .08, .09), x + dx, 1.76, 2.26);
      P.addEquipment('hullGlass', box(.10, .035, .01), x + dx, 1.775, 2.31);
    }
  }
  // headlights and the fender tips over the idlers
  for (const s of [-1, 1]) {
    P.addEquipment('hullDark', box(.16, .10, .08), s * 1.30, 1.36, 3.44);
    P.addEquipment('hullGlass', box(.12, .06, .01), s * 1.30, 1.36, 3.485);
    P.addMudguard('object195-front-guard', 'hull', box(.56, .04, .55), s * 1.42, 1.215, 3.75, -.10, 0, 0);
    P.addMudguard('object195-front-flap', 'hullRubber', box(.50, .26, .03), s * 1.42, 1.06, 4.02);
    P.addMudguard('object195-rear-flap', 'hullRubber', box(.50, .30, .03), s * 1.42, 1.10, -3.93);
  }
  // the engine deck's grilles and the stern plate's fittings
  P.addEquipment('hullDark', box(2.30, .02, 1.40), 0, 1.71, -2.80);
  for (let k = 0; k < 9; k++) P.addEquipment('hullDetail', box(2.24, .02, .04), 0, 1.722, -2.20 - k * .135);
  P.addEquipment('hullDark', box(1.30, .30, .04), 0, 1.26, -3.97);
  for (const s of [-1, 1]) {
    P.addEquipment('hullDetail', cylY(.14, .14, .50, 12), s * .95, 1.30, -4.02, 0, 0, Math.PI / 2);
    P.addEquipment('hullDetail', torus(.06, .018, 10, 6), s * .70, .95, -3.99, Math.PI / 2, 0, 0);
  }
  KIT.towCable(P, [[-.95, 1.73, -3.10], [-1.25, 1.735, -1.60], [-1.20, 1.735, .20]], .02);
  P.decal('hull', 'number', P.spec.visual.number || '', .32, [1.806, 1.30, -1.20], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', .32, [-1.806, 1.30, -1.20], -Math.PI / 2);
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
  addSkirtPanels(P, { x: 1.755, z0: -3.10, z1: 3.10, y0: .66, y1: 1.70, n: 6, th: .05 });
  addSkirtPanels(P, { x: 1.755, z0: -3.86, z1: -3.10, y0: .86, y1: 1.62, n: 1, th: .05 });
}

/** The unmanned module: its ring collar, the tall square body, the gun cradle's shield, the sights, radar and APS. */
function addModule(P: TankBuilderPort): void {
  P.add('turret', cylY(1.02, 1.04, .14, 40), 0, .06, 0);
  // the square body: the rear tall over the autoloader's breech run, chamfered along its roof
  P.add('turret', sectionSolid([-1.45, -1.30, .25, .95].map((z, i) => {
    const half = i === 0 ? 1.04 : 1.12, top = i === 0 ? .94 : 1.02, low = .10;
    return { z, ring: [[-half, low], [half, low], [half, top - .10], [half - .10, top], [-half + .10, top], [-half, top - .10]] };
  })));
  // the front face either side of the gun slot, raked back, and the slot's lintel over the cradle
  for (const s of [-1, 1]) {
    P.add('turret', sectionSolid([
      { z: .95, ring: [[.40, .10], [1.12, .10], [1.12, .92], [.40, .92]] },
      { z: 1.30, ring: [[.40, .14], [1.02, .14], [1.02, .66], [.40, .66]] },
    ].map(({ z, ring }) => ({ z, ring: s > 0 ? ring : ring.map(([x, y]) => [-x, y] as [number, number]).reverse() }))));
  }
  P.add('turret', box(.80, .26, .40), 0, .86, 1.10);
  // the gunner's sight block right of the gun: its armoured head, windows and wipers' hoods
  P.add('turret', box(.40, .40, .50), .74, 1.14, .80);
  P.addEquipment('turretDark', box(.32, .26, .02), .74, 1.14, 1.06);
  P.addEquipment('turretGlass', box(.13, .11, .012), .66, 1.17, 1.072);
  P.addEquipment('turretGlass', box(.09, .09, .012), .84, 1.17, 1.072);
  P.addEquipment('turretDetail', box(.36, .04, .10), .74, 1.30, 1.04);
  // the commander's panoramic sight on its mast at the back left, as tall as the photographs show it
  P.add('turret', cylY(.16, .18, .30, 20), -.55, 1.17, -.95);
  P.addEquipment('turretDetail', cylY(.20, .20, .24, 24), -.55, 1.44, -.95);
  P.addEquipment('turretDetail', box(.26, .16, .14), -.55, 1.49, -.80);
  P.addEquipment('turretGlass', box(.20, .10, .01), -.55, 1.49, -.728);
  P.addEquipment('turretDetail', cylY(.21, .21, .03, 24), -.55, 1.575, -.95);
  // the search radar's antenna boxes on the module's rear corners and the Shtandart's sensor domes and launchers
  for (const s of [-1, 1]) {
    P.addEquipment('turretDetail', box(.30, .42, .12), s * 1.06, .70, -1.38, 0, s * -.45, 0);
    P.addEquipment('turretDark', box(.24, .34, .02), s * 1.10, .70, -1.43, 0, s * -.45, 0);
    for (const dz of [.55, .10]) {
      P.addEquipment('turretDetail', cylY(.09, .09, .06, 16), s * 1.05, .14, dz);
      P.addEquipment('turretGlass', KIT.sph(.085, 14, Math.PI / 2), s * 1.05, .21, dz);
    }
    const tubes = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: .045, len: .30, pitch: -.30, splay: .20, arc: .42, spacing: .10, seed: 195 + s });
    tubes.position.set(s * 1.13, .60, .35);
    tubes.rotation.y = s * 1.15;
    P.turretG.add(tubes);
  }
  // roof: the loading and service hatches, the stub antennas and the meteorological mast
  P.addEquipment('turretDetail', box(.70, .03, .56), .30, 1.035, -.65);
  P.addEquipment('turretDark', box(.70, .01, .02), .30, 1.053, -.92);
  for (const [x, z, h] of [[.95, -1.30, .95], [-.95, -1.30, .80]]) {
    P.addEquipment('turretDetail', cylY(.04, .05, .08, 12), x, 1.06, z);
    P.addEquipment('turretDark', cylY(.009, .012, h, 8), x, 1.10 + h / 2, z);
  }
  P.decal('turret', 'number', P.spec.visual.number || '', .28, [1.125, .56, -.50], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', .28, [-1.125, .56, -.50], -Math.PI / 2);
  add30mmCannon(P, { name: 'object195_2a42', x: -.74, deck: 1.02, z: .55, axisY: 1.22, pivotZ: .55, muzzleZ: 2.35 });
}

/** The 2A83 on its exposed cradle: the cradle's shield, the recoil cylinders' housings, the tube. Gun frame. */
function addGun(P: TankBuilderPort): void {
  P.addGunExtra(sectionSolid([
    { z: -.70, ring: [[-.34, -.30], [.34, -.30], [.38, -.10], [.38, .22], [.30, .30], [-.30, .30], [-.38, .22], [-.38, -.10]] },
    { z: .12, ring: [[-.34, -.30], [.34, -.30], [.38, -.10], [.38, .22], [.30, .30], [-.30, .30], [-.38, .22], [-.38, -.10]] },
    { z: .30, ring: [[-.26, -.22], [.26, -.22], [.29, -.08], [.29, .16], [.23, .22], [-.23, .22], [-.29, .16], [-.29, -.08]] },
  ]));
  for (const s of [-1, 1]) P.addGunExtraDark(cylZ(.055, .70, 14), s * .18, .24, -.10);
  P.addGunExtra(cylZ(.215, .35, 24, .23), 0, 0, .46);
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
  P.topY = 1.62;
}

export const OBJECT195_X_PROFILES = { object195: { build: buildObject195X } };
