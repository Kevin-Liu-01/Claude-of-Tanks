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
import { addShtoraEyes } from './shtora.ts';
import { GUN_2A83, build152Gun } from './gun152.ts';
import { OBJECT195_FRAME as F } from '../russia152Frames.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { antennaPart } from './antennaPart.ts';
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
 * prototype at Donguz and the owner's renders): a wide armoured disc on the ring, and on it a thick drum ring, open ahead
 * for the gun's cradle, a pedestal inside it carrying the module, the Shtandart's launcher clusters on the drum's flanks
 * and lamp domes across its front. All of it turns with the module. */
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
  // the Shtandart's launchers (critics, round 9: the even ring of tubes read as a cogwheel): four clusters of three short
  // tubes on bosses close to the drum's rim on its flanks, under the module's lower tier, and across its front either side
  // of the gun's opening four lamp domes (the first prototype's photograph)
  for (const s of [-1, 1]) {
    for (const deg of [70, 102]) {
      const a = s * deg * Math.PI / 180, x = Math.sin(a), z = Math.cos(a), cx = Math.cos(a), cz = -Math.sin(a);
      P.addEquipment('turretDetail', box(.32, .14, .10), x * 1.46, .32, z * 1.46, 0, a, 0);
      for (const t of [-.10, 0, .10]) {
        P.addEquipment('turretDetail', cylZ(.045, .14, 12), x * 1.53 + cx * t, .335, z * 1.53 + cz * t, -.21, a, 0);
        P.addEquipment('turretDark', cylZ(.036, .01, 12), x * 1.60 + cx * t, .35, z * 1.60 + cz * t, -.21, a, 0);
      }
    }
    for (const deg of [37, 48]) {
      const a = s * deg * Math.PI / 180, x = Math.sin(a), z = Math.cos(a);
      P.addEquipment('turretDetail', cylZ(.10, .05, 16), x * 1.445, .32, z * 1.445, 0, a, 0);
      P.addEquipment('turretGlass', KIT.sph(.075, 14), x * 1.47, .32, z * 1.47);
    }
  }
}

/** The module's levels (turret frame): its floor and roof (the roof 2.98 m over the ground: the 2A42's deck), the core's
 * half-width, the bustle's, the line between the module's two tiers, how far the armour round the core stands further out
 * than round round 2's narrower core (owner 2026-11-06, "use the old version of the turret just make it wider": W), and
 * the bustle rack (its sides, floor rail, low top rail, the tall cage's top, its front and tail). */
const TOP = 1.38, LOW = .42, HC = 1.02, HB = .90, TIER = .84, W = .12;
const RACK = { x: 1.12, y0: .58, y1: 1.24, cage: 1.58, z0: -1.22, z1: -2.40 } as const;

/** A hard-edged core station (owner 2026-11-06, "squarish": flat faces and crisp bevels, not the old body's broad
 * rounded corners): a vertical wall `half` out from the floor to the shoulder, then the upper wall raked in to the roof's
 * edge `roofHalf` out (the T-14's tumblehome), a 4 cm bevel along the roof's edge and a 5 cm one along the floor's. */
function coreRing(half: number, low: number, top: number, shoulder: number, roofHalf: number): [number, number][] {
  return [[-half + .05, low], [half - .05, low], [half, low + .05], [half, shoulder], [roofHalf + .04, top - .04],
    [roofHalf, top], [-roofHalf, top], [-roofHalf - .04, top - .04], [-half, shoulder], [-half, low + .05]];
}
/** The core's shoulder and roof edge, and its wall's distance out at height y. */
const SHOULDER = 1.02, ROOF_HALF = .82;
const coreX = (y: number) => y <= SHOULDER ? HC : HC - (y - SHOULDER) * (HC - ROOF_HALF - .04) / (TOP - .04 - SHOULDER);

/** A bar between two corners, axis-aligned (frames, rails, posts, brackets). */
function bar(P: TankBuilderPort, slot: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  P.addEquipment(slot, box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** A TShU laser-warning head: a squat drum with its dark sensor band and a bevelled cap, on a post from `foot`. */
function warningHead(P: TankBuilderPort, x: number, foot: number, z: number, post: number): void {
  P.addEquipment('turretDetail', cylY(.035, .035, .015, 10), x, foot + .0075, z);
  P.addEquipment('turretDetail', cylY(.016, .016, post, 8), x, foot + post / 2, z);
  const y = foot + post;
  P.addEquipment('turretDetail', cylY(.05, .05, .05, 14), x, y + .025, z);
  P.addEquipment('turretDark', cylY(.053, .053, .035, 14), x, y + .068, z);
  P.addEquipment('turretDetail', cylY(.03, .05, .025, 14), x, y + .098, z);
}

/** A cluster of the Shtora's grenade launchers (the owner's renders 3 and 4: 2 x 2 and 3 x 2 groups of round tubes on
 * the cheeks and flanks under the upper armour): `rows` banks of `cols` tubes stacked on a mounting block, the block's
 * face square to the tubes, aimed `aim` radians off the bow towards side s. */
function launcherCluster(P: TankBuilderPort, s: number, x: number, y: number, z: number, cols: number, rows: number, aim: number, seed: number): void {
  const pitch = .12, yaw = s * aim, back = .19;
  P.addEquipment('turretDetail', box(cols * pitch + .03, rows * pitch + .03, .18), x - Math.sin(yaw) * back, y + (rows - 1) * pitch / 2, z - Math.cos(yaw) * back, 0, yaw, 0);
  for (let r = 0; r < rows; r++) {
    const tubes = FITTINGS.smokeBank({ mats: P.mats, count: cols, r: .048, len: .22, pitch: -.18, splay: 0, arc: 0, spacing: pitch, base: false, seed: seed + r });
    tubes.position.set(x, y + r * pitch, z);
    tubes.rotation.y = yaw;
    P.turretG.add(tubes);
  }
}

/** A flank wedge's stations (left side), `k` 0 at its ends and 1 at its middle: the lower layer from the tier line out
 * along its underside and up its lower facet to the ridge, a narrow ledge over the ridge and in to the core's wall; the
 * upper layer set in on that ledge, its own outer face, its top facet rising to the core's raked wall under the roof's
 * edge. */
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function flankLower(k: number): [number, number][] {
  return [[.80, TIER], [lerp(.94, .98, k) + W, TIER], [lerp(1.02, 1.14, k) + W, lerp(.94, .98, k)], [lerp(1.01, 1.12, k) + W, lerp(1.02, 1.06, k)], [.80, lerp(1.06, 1.08, k)]];
}
function flankUpper(k: number): [number, number][] {
  return [[.78, 1.04], [lerp(.94, 1.00, k) + W, 1.04], [lerp(.96, 1.02, k) + W, lerp(1.08, 1.10, k)], [lerp(.90, .94, k) + W, lerp(1.18, 1.22, k)], [.76, lerp(1.28, 1.30, k)]];
}

/** A small sensor box with a glass face towards `yaw` (the renders' corner cameras and vision blocks). */
function sensorBox(P: TankBuilderPort, x: number, y: number, z: number, yaw: number): void {
  P.addEquipment('turretDetail', box(.12, .09, .10), x, y, z, 0, yaw, 0);
  P.addEquipment('turretGlass', box(.08, .05, .01), x + Math.sin(yaw) * .052, y + .005, z + Math.cos(yaw) * .052, 0, yaw, 0);
  P.addEquipment('turretDark', box(.13, .012, .05), x + Math.sin(yaw) * .04, y + .05, z + Math.cos(yaw) * .04, 0, yaw, 0);
}

/** The core, the bustle, and the module's two tiers (owner 2026-11-06, "we need more layers to the turret and match the
 * photo a lot better"; the owner's renders 3 and 4): a square-sectioned core over the breech run with a raked upper wall
 * and the narrower bustle stepped in behind it; on the gun line, the lower tier's cheek blocks either side of the gun's
 * slot (the Shtora's dazzlers on their noses, launcher clusters on their flanks); over them the upper tier's chiselled
 * armour wedges, each a pyramid of facets bulging out over the cheek and narrowing to a nose, stepped back and up from the
 * lower tier so each layer casts its own edge; and the lintel over the slot. */
function addModuleCore(P: TankBuilderPort): void {
  const core = coreRing(HC, LOW, TOP, SHOULDER, ROOF_HALF);
  P.add('turret', sectionSolid([{ z: -1.30, ring: core }, { z: .62, ring: core }]));
  P.add('turret', sectionSolid([
    { z: -2.12, ring: coreRing(HB - .08, .68, TOP - .18, SHOULDER - .04, ROOF_HALF - .20) },
    { z: -1.96, ring: coreRing(HB, .60, TOP, SHOULDER, ROOF_HALF - .10) },
    { z: -1.40, ring: coreRing(HB, .48, TOP, SHOULDER, ROOF_HALF - .10) },
    { z: -1.26, ring: coreRing(HB, .45, TOP, SHOULDER, ROOF_HALF - .10) },
  ]));
  const lowerCheek: SolidSection[] = [
    { z: .60, ring: [[.40, LOW + .02], [.96 + W, LOW + .02], [.98 + W, LOW + .04], [.98 + W, TIER + .02], [.40, TIER + .02]] },
    { z: 1.30, ring: [[.40, LOW + .04], [.82 + W, LOW + .04], [.86 + W, LOW + .08], [.86 + W, TIER + .02], [.40, TIER + .02]] },
    { z: 1.40, ring: [[.40, LOW + .08], [.74 + W, LOW + .08], [.78 + W, LOW + .12], [.78 + W, TIER - .02], [.40, TIER - .02]] },
  ];
  // the upper wedge: a pyramid of facets bulging over the lower block and closing to a narrow nose over the gun's slot,
  // its top 10 cm under the roof at the core's face (the roof tier steps up behind it)
  const upperCheek: SolidSection[] = [
    { z: .58, ring: [[.40, TIER], [.98 + W, TIER], [1.04 + W, .92], [1.04 + W, 1.14], [.90 + W, 1.28], [.40, 1.28]] },
    { z: .90, ring: [[.40, TIER + .02], [1.00 + W, TIER + .02], [1.16 + W, .98], [1.10 + W, 1.14], [.82 + W, 1.24], [.40, 1.24]] },
    { z: 1.36, ring: [[.40, TIER + .12], [.52, TIER + .12], [.64, .99], [.64, 1.03], [.54, 1.06], [.40, 1.06]] },
  ];
  for (const s of [-1, 1]) {
    P.add('turret', sideSolid(lowerCheek, s));
    P.add('turret', sideSolid(upperCheek, s));
    // the lower block's nose bolts and a lifting eye on the upper wedge's crown
    for (const y of [.56, .76]) P.addEquipment('turretDark', cylZ(.02, .016, 6), s * .45, y, 1.405);
    P.addEquipment('turretDetail', torus(.035, .01, 10, 5), s * .72, 1.255, .80);
    // the vision blocks in the core's face over the upper wedge (v10)
    P.addEquipment('turretDark', box(.22, .07, .02), s * .62, 1.33, .628);
    P.addEquipment('turretGlass', box(.18, .04, .01), s * .62, 1.33, .637);
  }
  // the roof's plate seams (flush: the 2A42 sweeps the roof's right and front)
  for (const x of [-.24, .24]) P.addEquipment('turretDark', box(.012, .003, 1.84), x, TOP + .0015, -.34);
  for (const z of [.10, -.75]) P.addEquipment('turretDark', box(1.60, .003, .012), 0, TOP + .0015, z);
  // the lintel over the gun's slot (down to the gun block at full elevation), from the core's face to the cheeks' noses,
  // its front raked back, and its brow
  const lintel = (top: number): [number, number][] => [[-.40, 1.06], [.40, 1.06], [.40, top], [-.40, top]];
  P.add('turret', sectionSolid([{ z: .60, ring: lintel(TOP) }, { z: 1.14, ring: lintel(TOP) }, { z: 1.36, ring: lintel(1.17) }]));
  P.addEquipment('turretDetail', box(.84, .05, .10), 0, 1.08, 1.35);
}

/** The flanks' two tiers (render 4's right flank, render 3's left): on the upper tier two chiselled wedges a side, each
 * bulging to a ridge at its middle and narrowing to both ends, the gap between them carrying the Shtandart's sensor dome
 * on its arm; on the left the front wedge's place taken by render 3's mesh grille box under the sight tower; on the lower
 * tier, in their shadow, the launcher clusters and the number. Under the 2A42's lines on the right (its depression table:
 * the wedges top out 13 cm or more under its lowest barrel line). */
function addModuleFlanks(P: TankBuilderPort): void {
  const layer = (ring: (k: number) => [number, number][], z0: number, z1: number): SolidSection[] =>
    [{ z: z0, ring: ring(0) }, { z: (z0 + z1) / 2, ring: ring(1) }, { z: z1, ring: ring(0) }];
  const wedge = (s: number, z0: number, z1: number) => {
    P.add('turret', sideSolid(layer(flankLower, z0, z1), s));
    P.add('turret', sideSolid(layer(flankUpper, z0 + .06, z1 - .06), s));
  };
  for (const s of [-1, 1]) {
    if (s < 0) wedge(s, -.30, .54);
    else {
      // the mesh grille box (render 3): a box off the core's wall, its outer face a framed mesh over a dark recess
      P.add('turret', box(.16, .38, .74), .94 + W, TIER + .21, .13);
      P.addEquipment('turretDark', box(.012, .30, .64), 1.022 + W, TIER + .21, .13);
      for (let k = 0; k <= 10; k++) P.addEquipment('turretDetail', box(.012, .30, .012), 1.032 + W, TIER + .21, -.19 + k * .064);
      for (let k = 0; k <= 4; k++) P.addEquipment('turretDetail', box(.012, .012, .64), 1.034 + W, TIER + .07 + k * .07, .13);
      for (const y of [TIER + .02, TIER + .40]) P.addEquipment('turretDetail', box(.03, .03, .74), 1.03 + W, y, .13);
      for (const z of [-.23, .49]) P.addEquipment('turretDetail', box(.03, .38, .03), 1.03 + W, TIER + .21, z);
      // a corner camera on the grille box's front corner (v10)
      sensorBox(P, 1.08 + W, TIER + .40 + .045, .44, Math.PI * .25);
    }
    wedge(s, -1.22, -.36);
    // bolt rows along the lower layers' ridges
    for (const [z0, z1] of [[-1.22, -.36], [-.30, .54]] as const) if (s < 0 || z0 < -1) {
      for (const t of [.30, .42, .58, .70]) {
        const k = 1 - Math.abs(t - .5) * 2, z = lerp(z0, z1, t);
        P.addEquipment('turretDark', cylX(.016, .02, 6), s * (lerp(1.015, 1.13, k) + W + .004), lerp(.98, 1.02, k), z);
      }
    }
    // the Shtandart's sensor dome on its arm in the gap between the wedges
    bar(P, 'turretDark', s * (HC - .01), .97, -.35, s * (1.08 + W), 1.01, -.31);
    P.addEquipment('turretDetail', cylX(.075, .06, 16), s * (1.09 + W), .99, -.33);
    P.addEquipment('turretGlass', KIT.sph(.07, 14, Math.PI / 2), s * (1.12 + W), .99, -.33, 0, 0, s * -Math.PI / 2);
    // the lower tier's launcher clusters: a 2 x 2 on the cheek's flank, a 3 x 2 and a 2 x 2 on the module's flank
    launcherCluster(P, s, s * (.99 + W), .55, 1.06, 2, 2, .80, 1950 + s * 10);
    launcherCluster(P, s, s * (1.00 + W + .02), .55, .26, 3, 2, 1.15, 1960 + s * 10);
    launcherCluster(P, s, s * (1.00 + W + .02), .55, -.86, 2, 2, 1.25, 1970 + s * 10);
    // the cable conduit along the lower tier's top on its clamps, under the wedges (v10)
    P.addEquipment('turretDark', cylZ(.022, 1.86, 10), s * (HC + .03), TIER - .04, -.34);
    for (const z of [-1.20, -.62, -.20, .14, .52]) P.addEquipment('turretDetail', box(.05, .05, .03), s * (HC + .02), TIER - .04, z);
  }
  // a row of three launchers on the left upper wedge's crown, aimed ahead and out (v10's row on its left cheek)
  launcherCluster(P, 1, .80, 1.20, 1.04, 3, 1, .35, 1980);
  P.decal('turret', 'number', P.spec.visual.number || '', .26, [HC + .006, .66, -.30], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', .26, [-HC - .006, .66, -.30], -Math.PI / 2);
}

/** The bustle's sides and rack (render 3's angular bustle on the left, render 4's tall slat cage on the right): on the
 * left a chiselled armour block down the bustle's flank, its top edge and tail chamfered and its underside rising aft; on
 * the right a low bay carrying the Shtandart's radar panel, then a tall open cage of square tube and slats round the
 * bustle's after quarter, its top framed across to the sight box on the roof; across the tail a low rack with cans. */
function addModuleRack(P: TankBuilderPort): void {
  const { x: RX, y0: Y0, y1: Y1, cage: YC, z0: Z0, z1: Z1 } = RACK, T = .04;
  // the left bustle armour, its radar panel, a handle and a louvre strip
  P.add('turret', sectionSolid([
    { z: -2.12, ring: [[.60, .82], [.82 + W, .82], [.88 + W, .88], [.88 + W, 1.02], [.80 + W, 1.14], [.60, 1.14]] },
    { z: -1.80, ring: [[.70, .60], [.94 + W, .60], [1.02 + W, .70], [1.02 + W, 1.10], [.92 + W, 1.26], [.70, 1.26]] },
    { z: -1.26, ring: [[.70, .56], [.94 + W, .56], [1.02 + W, .66], [1.02 + W, 1.10], [.92 + W, 1.26], [.70, 1.26]] },
  ]));
  P.addEquipment('turretDetail', box(.03, .40, .36), RX + .03, .88, -1.48);
  P.addEquipment('turretDark', box(.012, .32, .28), RX + .05, .88, -1.48);
  P.addEquipment('turretDark', box(.012, .012, .52), RX + .024, 1.08, -1.54);
  P.addEquipment('turretDark', box(.012, .04, .16), RX + .026, .80, -1.70);
  for (let k = 0; k < 3; k++) P.addEquipment('turretDetail', box(.02, .012, .16), RX + .028, .90 + k * .035, -1.70);
  // the stowage bin on the left bustle's flank on two brackets (v10)
  P.addEquipment('turretDetail', box(.12, .28, .30), RX + .02, .90, -1.98);
  P.addEquipment('turretDark', box(.13, .02, .26), RX + .02, 1.045, -1.98);
  for (const z of [-1.88, -2.08]) bar(P, 'turretDark', RX - .10, .76, z - .02, RX - .04, .80, z + .02);
  // the right side: the low front bay and its radar panel, the tall cage behind it
  // (the cage starts at z -1.95: its front post at x -1.12 stays outside the 2A42's arc, ending it at -162 degrees)
  const ZC = -1.95;
  const posts: [number, number][] = [[Z0, Y1], [ZC, YC], [-2.18, YC], [Z1, YC]];
  for (const [z, top] of posts) bar(P, 'turretDetail', -RX - T / 2, Y0, z - T / 2, -RX + T / 2, top, z + T / 2);
  bar(P, 'turretDetail', -RX - T / 2, Y0 - T / 2, Z1, -RX + T / 2, Y0 + T / 2, Z0);
  bar(P, 'turretDetail', -RX - T / 2, Y1 - T / 2, ZC, -RX + T / 2, Y1 + T / 2, Z0);
  bar(P, 'turretDetail', -RX - T / 2, YC - T / 2, Z1, -RX + T / 2, YC + T / 2, ZC);
  P.add('turret', box(.05, .42, .40), -RX - .01, .92, -1.50);
  P.addEquipment('turretDark', box(.012, .32, .30), -RX - .04, .92, -1.50);
  const slats = [.70, .815, .93, 1.045, 1.16, 1.275, 1.39, 1.505];
  for (const y of slats) bar(P, 'turretDetail', -RX - .008, y - .015, Z1, -RX + .008, y + .015, ZC);
  // the cage's tail face to x -0.40 and its top frame across to the sight box
  bar(P, 'turretDetail', -.42, Y0, Z1 - T / 2, -.38, YC, Z1 + T / 2);
  bar(P, 'turretDetail', -RX, YC - T / 2, Z1 - T / 2, -.38, YC + T / 2, Z1 + T / 2);
  for (const y of slats) if (y > Y1) bar(P, 'turretDetail', -RX, y - .015, Z1 - .008, -.40, y + .015, Z1 + .008);
  bar(P, 'turretDetail', -RX, YC - .015, ZC - .035, -.50, YC + .015, ZC - .005);
  bar(P, 'turretDetail', -.53, TOP - .03, ZC - .035, -.50, YC, ZC - .005);
  // the brackets from the bustle's flank, the floor bars inside the cage and two bins on them
  for (const z of [-1.70, -2.05]) for (const y of [Y0, Y1 - .04]) bar(P, 'turretDark', -(HB - .01), y - .02, z - .02, -(RX - T / 2), y + .02, z + .02);
  for (const x of [.96, 1.04]) bar(P, 'turretDetail', -(x - .015), Y0 - .015, Z1, -(x + .015), Y0 + .015, -1.30);
  for (const z of [-2.06, -2.30]) {
    P.addEquipment('turretDetail', box(.16, .30, .20), -1.01, Y0 + .165, z);
    P.addEquipment('turretDark', box(.17, .02, .16), -1.01, Y0 + .31, z);
  }
  // the left tail bay behind the armour
  for (const z of [-2.12, Z1]) bar(P, 'turretDetail', RX - T / 2, Y0, z - T / 2, RX + T / 2, Y1, z + T / 2);
  for (const y of [Y0, Y1, .86, 1.04]) bar(P, 'turretDetail', RX - T / 2, y - .015, Z1, RX + T / 2, y + .015, -2.12);
  // the tail: its rails, posts and slats across, its floor behind the bustle, a row of cans on it
  for (const y of [Y0, Y1]) bar(P, 'turretDetail', -RX, y - T / 2, Z1 - T / 2, RX, y + T / 2, Z1 + T / 2);
  bar(P, 'turretDetail', .38, Y0, Z1 - T / 2, .42, Y1, Z1 + T / 2);
  for (const x of [-.40, .40]) for (const y of [Y0, 1.10]) bar(P, 'turretDark', x - .02, y - .02, Z1, x + .02, y + .02, -2.10);
  for (const y of [.72, .86, 1.00, 1.12]) bar(P, 'turretDetail', -RX, y - .015, Z1 - .008, RX, y + .015, Z1 + .008);
  for (const z of [-2.20, -2.32]) bar(P, 'turretDetail', -RX, Y0 - .015, z - .015, RX, Y0 + .015, z + .015);
  for (const x of [-.62, -.22, .22, .62]) {
    P.addEquipment('turretDetail', box(.16, .34, .20), x, Y0 + .185, -2.26);
    P.addEquipment('turretDark', box(.05, .03, .06), x - .03, Y0 + .37, -2.26);
  }
}

/** The bustle's own fittings: the ventilation grille on its right flank (seen through the cage), the loading door in its
 * tail, the roof's loading hatch, a fan housing, the bolted roof plates, render 3's T-shaped periscope, the grab rail on
 * the left, the wind sensor and the antennas. */
function addModuleBustleFittings(P: TankBuilderPort): void {
  P.addEquipment('turretDark', box(.02, .26, .62), -(HB + .005), .86, -1.72);
  for (let k = 0; k < 6; k++) P.addEquipment('turretDetail', box(.03, .26, .02), -(HB + .012), .86, -1.99 + k * .108);
  P.addEquipment('turretDark', box(.80, .36, .02), 0, .94, -2.125);
  for (const x of [-.36, .36]) P.addEquipment('turretDetail', box(.03, .30, .03), x, .94, -2.14);
  P.addEquipment('turretDetail', box(.60, .03, .52), -.26, TOP + .015, -1.10);
  P.addEquipment('turretDark', box(.60, .01, .02), -.26, TOP + .033, -1.35);
  P.addEquipment('turretDetail', box(.36, .10, .36), .36, TOP + .05, -1.62);
  for (let k = 0; k < 5; k++) P.addEquipment('turretDark', box(.30, .012, .03), .36, TOP + .104, -1.74 + k * .06);
  for (const [x, z, w, d] of [[.50, -.20, .40, .46], [.45, -1.22, .40, .34]] as const) {
    P.addEquipment('turretDetail', box(w, .016, d), x, TOP + .008, z);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) P.addEquipment('turretDark', cylY(.012, .012, .012, 6), x + dx * (w / 2 - .04), TOP + .02, z + dz * (d / 2 - .04));
  }
  // render 3's T-shaped periscope on the roof's left
  P.addEquipment('turretDetail', cylY(.05, .06, .03, 12), .22, TOP + .015, -.72);
  P.addEquipment('turretDetail', cylY(.03, .03, .22, 10), .22, TOP + .14, -.72);
  P.addEquipment('turretDetail', box(.16, .06, .07), .22, TOP + .28, -.72);
  P.addEquipment('turretGlass', box(.10, .03, .01), .22, TOP + .28, -.684);
  for (const z of [-.30, -.80, -1.30]) bar(P, 'turretDetail', .70, TOP, z - .012, .725, TOP + .08, z + .012);
  bar(P, 'turretDetail', .70, TOP + .08, -1.31, .725, TOP + .105, -.29);
  // the corner cameras at the roof's rear corners (v10)
  sensorBox(P, .78, TOP + .045, -1.22, Math.PI * .75);
  sensorBox(P, -.66, TOP + .045, -1.90, -Math.PI * .75);
  P.addEquipment('turretDetail', cylY(.03, .04, .03, 10), .45, TOP + .031, -1.30);
  P.addEquipment('turretDetail', cylY(.012, .014, .40, 8), .45, TOP + .24, -1.30);
  P.addEquipment('turretDetail', cylY(.035, .035, .05, 12), .45, TOP + .465, -1.30);
  P.addEquipment('turretDark', box(.012, .06, .10), .45, TOP + .50, -1.36);
  // the whips on the bustle's roof (their tips 3.76 m over the ground, as before)
  for (const [x, h] of [[.48, .70], [-.48, .55]]) {
    P.addEquipment('turretDetail', antennaPart(cylY(.04, .05, .08, 12)), x, TOP + .04, -1.88);
    P.addEquipment('turretDark', antennaPart(cylY(.009, .012, h, 8)), x, TOP + .08 + h / 2, -1.88);
  }
}

/** The roof tier's sights (renders 3 and 4: boxes with glass faces, small heads on posts): the gunner's sight box on its
 * post at the front left, glass on its front and outer faces, its armoured shutter hinged open at the brow, an open slat
 * cage round its outer flank and back and a small sight head on a post on its roof; the commander's sight at the rear
 * right inside the tall cage's top frame, a box with glass faces carrying the panoramic head on its post. */
function addModuleSights(P: TankBuilderPort): void {
  const tx = .58, tz = .48, th = .52;
  P.addEquipment('turretDetail', box(.30, .04, .36), tx, TOP + .02, tz);
  P.add('turret', box(.22, .14, .22), tx, TOP + .10, tz);
  const head: [number, number][] = [[.34, TOP + .16], [.82, TOP + .16], [.82, TOP + .44], [.76, TOP + .50], [.40, TOP + .50], [.34, TOP + .44]];
  P.add('turret', sectionSolid([{ z: .24, ring: head }, { z: .72, ring: head }]));
  P.addEquipment('turretDark', box(.36, .22, .02), tx, TOP + .33, .725);
  P.addEquipment('turretGlass', box(.30, .16, .012), tx, TOP + .33, .733);
  P.addEquipment('turretDark', box(.02, .20, .32), .825, TOP + .31, .48);
  P.addEquipment('turretGlass', box(.012, .15, .26), .832, TOP + .31, .48);
  P.addEquipment('turretDetail', box(.42, .30, .03), tx, TOP + th + .10, tz + .32, -1.05, 0, 0);
  for (const s of [-1, 1]) P.addEquipment('turretDark', box(.02, .05, .18), tx + s * .20, TOP + th, tz + .26, -.55, 0, 0);
  slatPanel(P, 'turret', { sx: 1, faceX: .82, standM: .11, z0: .14, z1: .72, y0: TOP + .02, y1: TOP + .50, rails: 6 });
  for (let k = 0; k < 6; k++) bar(P, 'turretDetail', .36, TOP + .05 + k * .084 - .015, .142, .93, TOP + .05 + k * .084 + .015, .158);
  bar(P, 'turretDetail', .345, TOP, .135, .375, TOP + .50, .165);
  P.addEquipment('turretDetail', cylY(.025, .03, .14, 10), .64, TOP + .57, .36);
  P.addEquipment('turretDetail', box(.16, .10, .15), .64, TOP + .69, .38);
  P.addEquipment('turretGlass', box(.10, .05, .01), .64, TOP + .70, .456);
  // the commander's sight box at the rear right (render 4), its glass faces, its post and panoramic head
  const cx = -.42, cz = -1.60;
  P.add('turret', box(.40, .30, .40), cx, TOP + .15, cz);
  P.addEquipment('turretDark', box(.30, .16, .02), cx, TOP + .17, cz + .205);
  P.addEquipment('turretGlass', box(.24, .11, .01), cx, TOP + .17, cz + .214);
  P.addEquipment('turretDark', box(.02, .16, .28), cx - .205, TOP + .17, cz);
  P.addEquipment('turretGlass', box(.01, .11, .22), cx - .214, TOP + .17, cz);
  P.addEquipment('turretDetail', cylY(.06, .08, .14, 14), cx, TOP + .37, cz);
  P.add('turret', cylY(.14, .14, .18, 18), cx, TOP + .53, cz);
  P.addEquipment('turretDark', cylY(.145, .145, .03, 18), cx, TOP + .635, cz);
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    P.addEquipment('turretGlass', box(.10, .07, .012), cx + Math.sin(a) * .142, TOP + .54, cz + Math.cos(a) * .142, 0, a, 0);
  }
}

/** Shtora-1 (owner 2026-11-06: "that object 195 should have shtora"): the two OTShU-1-7 dazzlers on the lower cheek
 * blocks' noses either side of the gun (the fleet's emitter, profiles/shtora.ts) and the TShU-1-11 laser-warning heads:
 * the front pair on the upper wedges' noses (under the 2A42's lines by 10 cm), the rear pair on the left bustle armour and
 * on the tall cage's top. Its grenade launchers are the clusters on the flanks (addModuleFlanks). */
function addModuleShtora(P: TankBuilderPort): void {
  addShtoraEyes({ mats: P.mats, turretG: P.turretG, disposables: P.disposables,
    add: (slot, geometry, x, y, z) => P.addEquipment(slot, geometry, x, y, z),
  }, { x: .57, y: .66, z: 1.44, scale: 1.15, round: true, kit: true });
  for (const s of [-1, 1]) warningHead(P, s * .58, 1.11, 1.20, .03);
  warningHead(P, .90, 1.25, -1.66, .12);
  warningHead(P, -RACK.x, RACK.cage + .02, -2.18, .06);
}

/** The unmanned module on its turntable (owner 2026-11-05, "the object 195 ... turrets look terrible"; 2026-11-06, "too
 * boxy instead of squarish and technical skeletal like the t14 152 ... should have shtora", then "we need more layers to
 * the turret and match the photo a lot better"): the core and its bustle in two tiers of armour, the flanks' wedges and
 * launcher clusters, the bustle's armour and cage, the sights, Shtora-1, and the 2A42 on the roof's right. */
function addModule(P: TankBuilderPort): void {
  addModuleCore(P);
  addModuleFlanks(P);
  addModuleRack(P);
  addModuleBustleFittings(P);
  addModuleSights(P);
  addModuleShtora(P);
  // the 2A42's deck: a plate flush with the roof under its mount, cantilevered out over the raked wall, on a web plate
  // standing on the flank wedges
  P.add('turret', box(.52, .05, .52), -.66, TOP - .025, -.40);
  P.add('turret', box(.04, .12, .36), -.90, TOP - .10, -.40);
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
