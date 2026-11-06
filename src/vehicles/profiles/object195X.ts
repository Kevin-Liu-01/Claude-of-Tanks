// The Object 195 (release 269; owner 2026-11-04, "make a new russian tank called object 195 ... because it has a 152 mm
// gun"; DECISIONS "2026-11-04 Russian 152 mm line"): UKBTM and Uralvagonzavod's T-95 of OKR "Sovershenstvovanie-88", built
// from its prototypes' photographs (the first prototype in its workshop, Gur Khan 2018, the owner's second image; the
// second prototype at Donguz, btvt) and the published layout (the 2010 patent: crew capsule forward, carousel amidships,
// engine aft). A long hull on seven T-90-type road wheels under a long, shallow glacis, flat skirt panels with recessed
// handles; amidships the tall, square unmanned module ("Угловатая, квадратная башня", Khlopotov) carrying the 2A83 on an
// exposed cradle, the gunner's sight block right of it, the 30 mm 2A42 on the left, the commander's panoramic sight on
// its mast and the first prototype's search radar and Shtandart active protection. First-party procedural geometry:
// Kevin B. Liu (NOTICE.md); sources in docs/references/photos/russia-152-20261104.json.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { addHullTub, add30mmCannon, sideSolid } from './russia152Kit.ts';
import { slatPanel } from './leopard2A4KitParts.ts';
import { GUN_2A83, build152Gun } from './gun152.ts';
import { OBJECT195_FRAME as F } from '../russia152Frames.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;
const ty = (worldY: number) => worldY - F.ringY;
const tz = (worldZ: number) => worldZ - F.ringZ;

/** The long, nearly flat upper glacis over the crew capsule: from the roof at z 1.60 to the nose's edge (Gur Khan's and
 * the Donguz photographs: it runs far ahead of the module). */
const GLACIS_Z0 = 1.60, NOSE_Y = 1.16;
const glacisY = (z: number) => F.roofY - (z - GLACIS_Z0) * ((F.roofY - NOSE_Y) / (F.hullFrontZ - GLACIS_Z0));
const GLACIS_RAKE = Math.atan2(F.roofY - NOSE_Y, F.hullFrontZ - GLACIS_Z0);

function addHull(P: TankBuilderPort): void {
  const R = F.roofY;
  // [z, roof, bottom, outer, inner, sponson floor]: the glacis falls 0.58 m over 2.35 m to the nose; the bow narrows inside
  // the idlers; the stern deck steps down over the sprockets. The sponson floors clear the track's top run and its shoes
  // (1.27 m at most on the run, 1.21 m over the idler: .qa-dev/r152/track-top.mjs; the release gate's track-clip stage)
  addHullTub(P, [
    [-3.95, R - .18, .86, 1.20, 1.04, 1.28],
    [-3.80, R - .08, .66, 1.66, 1.08, 1.28],
    [-3.45, R - .04, .50, 1.70, 1.10, 1.285],
    [-2.90, R, .45, 1.70, 1.10, 1.285],
    [GLACIS_Z0, R, .45, 1.70, 1.10, 1.285],
    [3.05, glacisY(3.05), .47, 1.70, 1.10, 1.235],
    [3.42, glacisY(3.42), .52, 1.66, 1.10, 1.219],
    [3.62, glacisY(3.62), .56, 1.14, 1.06, 1.18],
    [F.hullFrontZ, NOSE_Y, .70, 1.10, 1.02, .96],
  ]);
  // the heavy lower nose plate across the full width ahead of the tracks (round 6's critics, the owner's renders: a blunt,
  // tall front with a heavy lower plate), its chamfered top and its tow eyes
  P.add('hull', sectionSolid([
    { z: 3.72, ring: [[-1.70, .66], [1.70, .66], [1.70, 1.04], [-1.70, 1.04]] },
    { z: 3.96, ring: [[-1.66, .70], [1.66, .70], [1.66, .98], [-1.66, .98]] },
  ]));
  for (const s of [-1, 1]) P.addEquipment('hullDetail', torus(.07, .02, 12, 6), s * .78, .76, 4.00, Math.PI / 2, 0, 0);
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
  // the fender tips over the idlers (the headlights are in their armoured housings on the glacis, addHullKit)
  for (const s of [-1, 1]) {
    P.addMudguard('object195-front-guard', 'hull', box(.56, .04, .55), s * 1.42, 1.19, 3.75, .20, 0, 0);
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

/** The hull's kit (owner 2026-11-05, "make the hulls much better"; the owner's renders): the raised armour module on
 * the fore glacis with its seams and lifting eyes, the armoured headlight housings at the bow's corners, the bars across
 * the lower nose plate, grab rails along the glacis' edges, the louvred exhaust on the left flank and the unditching log on
 * the stern plate. Hull frame. */
function addHullKit(P: TankBuilderPort): void {
  // the fore glacis module: a plate laid on the glacis from ahead of the periscopes to the nose's edge, its three panels'
  // seams, its chamfered lip and two lifting eyes
  const z0 = 2.56, z1 = 3.58, zc = (z0 + z1) / 2, yc = glacisY(zc) + .045, len = Math.hypot(z1 - z0, glacisY(z0) - glacisY(z1));
  P.add('hull', box(2.36, .08, len), 0, yc, zc, GLACIS_RAKE, 0, 0);
  P.add('hull', box(2.30, .05, .10), 0, glacisY(z1) + .03, z1 + .02, GLACIS_RAKE + .55, 0, 0);
  for (const x of [-.40, .40]) P.addEquipment('hullDark', box(.014, .012, len - .04), x, yc + .042, zc, GLACIS_RAKE, 0, 0);
  for (const x of [-.80, .80]) P.addEquipment('hullDetail', KIT.torus(.05, .013, 10, 5), x, glacisY(2.80) + .11, 2.80, GLACIS_RAKE, 0, 0);
  // the armoured headlight housings: a box at each corner of the bow, the lamp in its hood and the guard's bars
  for (const s of [-1, 1]) {
    const x = s * 1.32, z = 3.38, y = glacisY(z) + .10;
    P.addEquipment('hullDetail', box(.30, .18, .26), x, y, z);
    P.addEquipment('hullDark', cylZ(.075, .03, 16), x, y + .01, z + .135);
    P.addEquipment('hullGlass', markVehicleNightLens(cylZ(.062, .008, 16), 'headlight'), x, y + .01, z + .154);
    for (const dx of [-.10, .10]) P.addEquipment('hullDetail', box(.018, .18, .018), x + dx, y + .02, z + .19);
    P.addEquipment('hullDetail', box(.24, .018, .018), x, y + .11, z + .19);
  }
  // the strips across the lower nose plate (the renders' slatted bow)
  for (const y of [.76, .84, .92]) P.addEquipment('hullDetail', box(3.10, .035, .04), 0, y, 3.975);
  // grab rails along the glacis' edges, each a bar on two stand-offs
  for (const s of [-1, 1]) {
    for (const z of [1.90, 2.40]) P.addEquipment('hullDetail', box(.02, .06, .02), s * 1.22, glacisY(z) + .03, z, GLACIS_RAKE, 0, 0);
    P.addEquipment('hullDetail', box(.022, .022, .54), s * 1.22, glacisY(2.15) + .06, 2.15, GLACIS_RAKE, 0, 0);
  }
  // the louvred exhaust on the left flank over the engine (the T-90's side, the photographs' grille)
  P.addEquipment('hullDark', box(.03, .30, .80), 1.705, 1.40, -2.55);
  for (let k = 0; k < 6; k++) P.addEquipment('hullDetail', box(.05, .03, .78), 1.715, 1.28 + k * .05, -2.55, 0, 0, .35);
  // the unditching log on the stern plate over the slat cage, below the deck's edge: the 2A83 keeps its full depression
  // over the stern (tools/gun-depression-sweep.mjs; on the deck the log held it to -2.5 degrees from 153 degrees)
  const log = FITTINGS.unditchingLog({ mats: P.mats, len: 2.30, r: .13, straps: 2, seed: 195 });
  log.position.set(0, 1.36, -4.10);
  P.hullG.add(log);
}

/** The hull side's top line (the tub's stations: the stern's steps, the flat roof, the glacis down to the nose). */
const SIDE_TOP: readonly (readonly [number, number])[] = [[-3.95, F.roofY - .18], [-3.80, F.roofY - .08], [-3.45, F.roofY - .04],
  [-2.90, F.roofY], [GLACIS_Z0, F.roofY], [3.05, glacisY(3.05)], [3.42, glacisY(3.42)], [3.62, glacisY(3.62)]];
/** The skirts' foot: level over the wheels, rising over the sprocket and the idler. */
const SKIRT_FOOT: readonly (readonly [number, number])[] = [[-3.86, .90], [-3.30, .70], [-3.10, .68], [3.10, .68], [3.62, .98]];
function along(line: readonly (readonly [number, number])[], z: number): number {
  for (let i = 1; i < line.length; i++) {
    const [z0, y0] = line[i - 1], [z1, y1] = line[i];
    if (z <= z1 || i === line.length - 1) return y0 + (y1 - y0) * Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
  }
  return line[0][1];
}
const skirtTop = (z: number) => along(SIDE_TOP, z) - .02;

/** The side skirts (owner 2026-11-05, "properly match sideskirts to hull side profiles"): one plate a side whose top edge
 * runs 2 cm under the hull side's own top line (the stern's steps, the roof, the glacis down to the nose) and whose foot
 * rises over the sprocket and the idler; panel seams, recessed handles, a top lip and bolt rows along it; over the crew
 * capsule the bolted armour modules (the owner's renders), their tops following the same line; a rubber strip along the
 * foot. */
function addSkirts(P: TankBuilderPort): void {
  // the plate 2.5 cm thick, its modules 6 cm proud of it: inside the packet's 3.59 m over the skirts
  const X0 = 1.715, X1 = 1.740;
  const zs = [...new Set([-3.86, -3.80, -3.45, -3.30, -3.10, -2.90, GLACIS_Z0, 2.0, 2.5, 3.05, 3.10, 3.42, 3.62])].sort((p, q) => p - q);
  const plate = zs.map((z): SolidSection => ({ z, ring: [[X0, along(SKIRT_FOOT, z)], [X1, along(SKIRT_FOOT, z)], [X1, skirtTop(z)], [X0, skirtTop(z)]] }));
  const seams = [-3.10, -2.067, -1.033, 0, 1.043, 2.07, 3.10];
  for (const s of [-1, 1]) {
    P.add('hull', sideSolid(plate, s));
    for (const z of seams) P.addEquipment('hullDark', box(.012, skirtTop(z) - along(SKIRT_FOOT, z) - .04, .016), s * (X1 + .006), (skirtTop(z) + along(SKIRT_FOOT, z)) / 2, z);
    // the top lip, laid along the line in its straight runs
    for (const [z0, z1] of [[-3.80, -3.45], [-3.45, -2.90], [-2.90, GLACIS_Z0], [GLACIS_Z0, 3.05], [3.05, 3.42]] as const) {
      const y0 = skirtTop(z0) - .04, y1 = skirtTop(z1) - .04;
      P.addEquipment('hullDetail', box(.016, .022, Math.hypot(z1 - z0, y1 - y0) - .04), s * (X1 + .008), (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(y0 - y1, z1 - z0), 0, 0);
    }
    // the plain panels' recessed handles and bolt rows
    for (let i = 0; i < 4; i++) {
      const zc = -3.10 + 1.033 * (i + .5);
      P.addEquipment('hullDark', box(.012, .05, .16), s * (X1 + .004), .86, zc);
      for (let k = 0; k < 5; k++) P.addEquipment('hullDetail', cylX(.02, .02, 8), s * (X1 + .01), .76, zc - .36 + k * .18);
    }
    // the armour modules over the crew capsule: six thick segments, each a sloped-top block to the line, its bolts below it
    for (let k = 0; k < 6; k++) {
      const za = 1.06 + k * .34, zb = za + .31, foot = .73;
      P.add('hull', sideSolid([za, zb].map((z): SolidSection => ({ z, ring: [[X1, foot], [X1 + .06, foot], [X1 + .06, skirtTop(z) - .07], [X1 + .03, skirtTop(z) - .04], [X1, skirtTop(z) - .04]] })), s));
      const zc = (za + zb) / 2, top = skirtTop(zb) - .07;
      for (let y = .80; y < top - .08; y += .20) for (const dz of [-.09, .09]) P.addEquipment('hullDetail', cylX(.024, .012, 8), s * (X1 + .063), y, zc + dz);
      if (k % 3 === 1) P.addEquipment('hullDetail', KIT.torus(.04, .011, 10, 5), s * (X1 + .02), top + .03, zc, 0, 0, Math.PI / 2);
    }
    P.addEquipment('hullRubber', box(.02, .12, 6.20), s * (X0 + .01), .63, 0);
  }
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
  addSkirts(P);
  // a slat cage across the stern plate over the engine's back, on posts from the plate, under the log
  for (let k = 0; k < 4; k++) P.addEquipment('hullDetail', box(2.70, .03, .016), 0, .80 + k * .12, -4.10);
  for (const x of [-1.30, -.45, .45, 1.30]) {
    P.addEquipment('hullDetail', box(.03, .44, .03), x, .98, -4.10);
    for (const y of [.84, 1.14]) P.addEquipment('hullDark', box(.025, .025, .14), x, y, -4.03);
  }
}

/** The module's turntable (owner 2026-11-05: "the object 195 should also be on a rotating disc thing"; the second
 * prototype at Donguz and the owner's renders): a wide armoured disc on the ring, and on it a thick drum ring wider than
 * the module, open ahead for the gun's cradle, a pedestal inside it carrying the module, the drum's face ringed with the
 * Shtandart's launcher tubes round the front and both sides. All of it turns with the module. */
function addTurntable(P: TankBuilderPort): void {
  P.add('turret', KIT.lathe([[0, 0], [1.30, 0], [1.34, .04], [1.34, .13], [1.27, .20], [1.10, .22], [0, .22]], 56));
  P.addEquipment('turretDark', torus(1.335, .012, 56, 4), 0, .085, 0);
  // the drum ring: 300 degrees of it round the back, its ends capped either side of the gun's 60-degree opening
  const OPEN = Math.PI / 6;
  P.add('turret', new THREE.LatheGeometry([[1.10, .20], [1.40, .20], [1.43, .24], [1.43, .40], [1.39, .44], [1.10, .44], [1.10, .20]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 50, OPEN, Math.PI * 2 - 2 * OPEN));
  for (const s of [-1, 1]) P.add('turret', box(.35, .25, .02), s * Math.sin(OPEN) * 1.265, .32, Math.cos(OPEN) * 1.265 - .01, 0, s * OPEN, 0);
  P.add('turret', cylY(1.10, 1.10, .24, 48), 0, .32, 0);
  // the drum's top seam and its foot bead
  P.addEquipment('turretDark', torus(1.432, .010, 50, 4), 0, .40, 0);
  // the launcher tubes: one every 15 degrees from 37 to 172 degrees either side of the gun, each a boss on the drum's
  // face with its tube raised 12 degrees and its dark muzzle
  for (const s of [-1, 1]) for (let deg = 37; deg <= 172; deg += 15) {
    const a = s * deg * Math.PI / 180, x = Math.sin(a), z = Math.cos(a);
    P.addEquipment('turretDetail', cylZ(.11, .06, 16), x * 1.45, .32, z * 1.45, 0, a, 0);
    P.addEquipment('turretDetail', cylZ(.078, .22, 14), x * 1.52, .34, z * 1.52, -.21, a, 0);
    P.addEquipment('turretDark', cylZ(.064, .012, 14), x * 1.63, .363, z * 1.63, -.21, a, 0);
  }
}

/** The unmanned module on its turntable (owner 2026-11-05, "the object 195 ... turrets look terrible"; the owner's
 * renders and the Donguz prototype; round 6's critics: taller and bulkier on a thick drum, a tall tower, a large
 * ammunition bustle): a tall, wide body over the autoloader's breech run, faceted cheeks either side of the gun's cradle, a
 * long ammunition bustle over the engine deck, the gunner's sight tower at the front left under its armoured shutter, the
 * commander's panoramic sight on its mast, the Shtandart's sensors, and the 2A42 on the roof's right. */
function addModule(P: TankBuilderPort): void {
  const TOP = 1.38, LOW = .42, HW = 1.00;
  // the body and the bustle: one solid from the bustle's chamfered tail to the cheeks' root; its floor steps up behind the
  // drum so the bustle clears the engine deck
  const body: [number, number, number, number][] = [
    // [z, half-width, floor, roof]
    [-2.40, HW - .22, .66, TOP - .18], [-2.26, HW - .06, .54, TOP - .03], [-1.40, HW, .46, TOP], [-1.22, HW, LOW, TOP],
    [.82, HW, LOW, TOP],
  ];
  P.add('turret', sectionSolid(body.map(([z, half, low, top]): SolidSection => ({ z, ring: [[-half, low], [half, low],
    [half, top - .12], [half - .12, top], [-half + .12, top], [-half, top - .12]] }))));
  // the faceted cheeks: each a pyramid of plates narrowing to a blunt nose ahead of the body (the renders' big facets)
  const cheek: SolidSection[] = [
    { z: .82, ring: [[.40, LOW], [HW, LOW], [HW, TOP - .12], [HW - .10, TOP], [.40, TOP]] },
    { z: 1.10, ring: [[.40, LOW + .02], [HW - .02, LOW + .05], [HW - .02, TOP - .42], [HW - .24, TOP - .16], [.40, TOP - .16]] },
    { z: 1.40, ring: [[.40, LOW + .06], [.66, LOW + .08], [.76, LOW + .34], [.62, TOP - .42], [.40, TOP - .38]] },
  ];
  for (const s of [-1, 1]) {
    P.add('turret', sideSolid(cheek, s));
    // the facet seams down each cheek's ridge
    P.addEquipment('turretDark', box(.012, .46, .34), s * .86, LOW + .44, 1.16, -.30, s * .55, 0);
  }
  // the flanks' bolted add-on panels, three a side between the cheeks and the bustle's grilles
  for (const s of [-1, 1]) for (const [z0, z1] of [[-1.15, -.55], [-.50, .10], [.15, .78]] as const) {
    P.add('turret', box(.06, .74, z1 - z0 - .03), s * (HW + .03), LOW + .46, (z0 + z1) / 2);
    for (const y of [LOW + .14, LOW + .78]) for (const z of [z0 + .08, z1 - .10]) P.addEquipment('turretDark', cylX(.022, .02, 8), s * (HW + .065), y, z);
  }
  // the lintel over the gun slot (down to the cradle's block at full elevation) and its brow
  P.add('turret', box(.80, TOP - 1.06, .56), 0, (TOP + 1.06) / 2, 1.08);
  P.addEquipment('turretDetail', box(.84, .05, .10), 0, 1.08, 1.35);
  // the gunner's sight tower at the front left: a tall armoured box, its window forward under an armoured shutter hinged
  // open at the brow, a slat cage round its outboard flank
  const tx = .58, tz = .48, tw = .25, th = .52;
  const towerRing: [number, number][] = [[tx - tw, TOP - .02], [tx + tw, TOP - .02], [tx + tw, TOP + th - .08], [tx + tw - .08, TOP + th],
    [tx - tw + .08, TOP + th], [tx - tw, TOP + th - .08]];
  P.add('turret', sectionSolid([{ z: tz - .28, ring: towerRing }, { z: tz + .24, ring: towerRing }]));
  P.addEquipment('turretDark', box(.36, .26, .02), tx, TOP + th - .26, tz + .25);
  P.addEquipment('turretGlass', box(.30, .19, .012), tx, TOP + th - .26, tz + .258);
  P.addEquipment('turretDetail', box(.42, .30, .03), tx, TOP + th + .10, tz + .32, -1.05, 0, 0);
  for (const s of [-1, 1]) P.addEquipment('turretDark', box(.02, .05, .18), tx + s * .20, TOP + th, tz + .26, -.55, 0, 0);
  slatPanel(P, 'turret', { sx: 1, faceX: tx + tw, standM: .10, z0: tz - .26, z1: tz + .22, y0: TOP + .02, y1: TOP + th - .06, rails: 6 });
  // the commander's panoramic sight on its mast behind the tower
  P.addEquipment('turretDetail', cylY(.07, .09, .34, 14), .26, TOP + .17, -.74);
  P.add('turret', cylY(.18, .18, .24, 20), .26, TOP + .46, -.74);
  P.addEquipment('turretDark', cylY(.185, .185, .04, 20), .26, TOP + .60, -.74);
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    P.addEquipment('turretGlass', box(.12, .08, .012), .26 + Math.sin(a) * .182, TOP + .47, -.74 + Math.cos(a) * .182, 0, a, 0);
  }
  // the ammunition bustle's ventilation grilles on both flanks, its loading door and its stowage box on the tail
  for (const s of [-1, 1]) {
    P.addEquipment('turretDark', box(.02, .36, .80), s * (HW + .005), LOW + .46, -1.72);
    for (let k = 0; k < 7; k++) P.addEquipment('turretDetail', box(.03, .36, .02), s * (HW + .015), LOW + .46, -2.08 + k * .12);
  }
  P.addEquipment('turretDark', box(1.10, .46, .02), 0, LOW + .52, -2.405);
  P.addEquipment('turretDetail', box(1.30, .32, .12), 0, TOP - .30, -2.44);
  // the Shtandart's sensor domes on the flanks under the roof's edge and its radar panels on the bustle's corners
  for (const s of [-1, 1]) {
    P.addEquipment('turretDetail', cylX(.085, .06, 16), s * (HW + .055), TOP - .16, .10);
    P.addEquipment('turretGlass', KIT.sph(.075, 14, Math.PI / 2), s * (HW + .085), TOP - .16, .10, 0, 0, s * -Math.PI / 2);
    P.addEquipment('turretDetail', box(.30, .46, .10), s * (HW - .06), LOW + .48, -1.24, 0, s * -.60, 0);
    P.addEquipment('turretDark', box(.24, .38, .02), s * (HW - .02), LOW + .48, -1.20, 0, s * -.60, 0);
    // the 2 x 2 smoke banks on the module's flanks behind the cheeks
    const tubes = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: .05, len: .26, pitch: -.30, splay: .25, arc: .40, spacing: .11, seed: 195 + s });
    tubes.position.set(s * (HW + .05), LOW + .44, .55);
    tubes.rotation.y = s * .70;
    P.turretG.add(tubes);
  }
  // roof: the loading hatch, its hinge and the stub antennas on the bustle
  P.addEquipment('turretDetail', box(.60, .03, .52), -.26, TOP + .015, -1.10);
  P.addEquipment('turretDark', box(.60, .01, .02), -.26, TOP + .033, -1.35);
  for (const [x, z, h] of [[.70, -2.05, .80], [-.70, -2.05, .65]]) {
    P.addEquipment('turretDetail', cylY(.04, .05, .08, 12), x, TOP - .06, z);
    P.addEquipment('turretDark', cylY(.009, .012, h, 8), x, TOP - .02 + h / 2, z);
  }
  P.decal('turret', 'number', P.spec.visual.number || '', .30, [HW + .062, LOW + .46, -.20], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', .30, [-HW - .062, LOW + .46, -.20], -Math.PI / 2);
  // the 2A42 in its low pod on the roof's right. Its barrel crosses the sight tower and the commander's mast from 37
  // degrees inboard and the bustle's roof kit past 161 degrees outboard (.qa-dev/r152/station-levels.mjs, barrel lines
  // against the module's stock from level to full elevation every 0.05 rad): it turns from a degree short of each; over
  // the cheek, the lintel and the bustle's tail it depresses only as far as the table lets it (each degree the smallest of
  // it and its neighbours)
  add30mmCannon(P, { name: 'object195_2a42', x: -.66, deck: TOP, z: -.40, axisY: TOP + .14, pivotZ: -.40, muzzleZ: 1.75,
    yawArc: [-2.7925, 0.6109],
    depressionByYaw: [[-2.7925, 0.132], [-2.7751, 0.14], [-2.7576, 0.146], [-2.7402, 0.151], [-2.7227, 0.16],
      [-2.7053, 0.165], [-2.6878, 0.171], [-2.6704, 0.177], [-2.6529, 0.18], [-0.4887, 0.18], [-0.4712, 0.177],
      [-0.4538, 0.171], [-0.4363, 0.165], [-0.4189, 0.16], [-0.4014, 0.151], [-0.384, 0.146], [-0.3665, 0.14],
      [-0.3491, 0.132], [-0.3316, 0.126], [-0.3142, 0.12], [-0.2967, 0.112], [-0.2793, 0.106], [-0.2618, 0.098],
      [-0.2443, 0.092], [-0.2269, 0.084], [-0.2094, 0.073], [0.1222, 0.073], [0.1396, 0.053], [0.1571, 0.05],
      [0.2618, 0.05], [0.2793, 0.047], [0.4189, 0.047], [0.4363, 0.045], [0.576, 0.045], [0.5934, 0.047],
      [0.6109, 0.047]] });
}

/** The 2A83 on its exposed cradle: the cradle's shield, the recoil cylinders' housings, the tube. Gun frame. */
function addGun(P: TankBuilderPort): void {
  P.addGunExtra(sectionSolid([
    { z: -.70, ring: [[-.34, -.30], [.34, -.30], [.38, -.10], [.38, .22], [.30, .30], [-.30, .30], [-.38, .22], [-.38, -.10]] },
    { z: .12, ring: [[-.34, -.30], [.34, -.30], [.38, -.10], [.38, .22], [.30, .30], [-.30, .30], [-.38, .22], [-.38, -.10]] },
    { z: .30, ring: [[-.26, -.22], [.26, -.22], [.29, -.08], [.29, .16], [.23, .22], [-.23, .22], [-.29, .16], [-.29, -.08]] },
  ]));
  for (const s of [-1, 1]) P.addGunExtraDark(cylZ(.055, .70, 14), s * .18, .24, -.10);
  // the stepped gun block over the shield (round 6's critics: "a thick stepped gun block"), rising with the gun
  P.addGunExtra(sectionSolid([
    { z: .00, ring: [[-.37, -.24], [.37, -.24], [.37, .36], [.30, .44], [-.30, .44], [-.37, .36]] },
    { z: .34, ring: [[-.37, -.24], [.37, -.24], [.37, .36], [.30, .44], [-.30, .44], [-.37, .36]] },
    { z: .46, ring: [[-.31, -.20], [.31, -.20], [.31, .28], [.25, .34], [-.25, .34], [-.31, .28]] },
  ]));
  // the cradle's big trunnion block across the gun, the round mantlet ahead of the block, and the tube's root collar
  P.addGunExtra(KIT.cylX(.24, .96, 24), 0, 0, -.12);
  P.addGunExtra(cylZ(.30, .26, 28, .27), 0, 0, .56);
  P.addGunExtra(cylZ(.215, .35, 24, .23), 0, 0, .80);
  build152Gun(P, { ...GUN_2A83, len: F.muzzleZ - F.trunnionZ });
}

export function buildObject195X(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(0, F.ringY, F.ringZ);
  P.gunG.position.set(0, ty(F.trunnionY), tz(F.trunnionZ));
  addHull(P);
  addHullKit(P);
  addRunningGear(P);
  addTurntable(P);
  addModule(P);
  addGun(P);
  P.topY = 1.64;
}

export const OBJECT195_X_PROFILES = { object195: { build: buildObject195X } };
