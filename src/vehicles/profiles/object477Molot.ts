// The Object 477 Molot (release 269; owner 2026-11-04, 'Object 477 "Molot"'; DECISIONS "2026-11-04 Russian 152 mm
// line"; owner 2026-11-05, "fully improve the molot", "make the hulls much beter", "properly match sideskirts to hull
// side profiles"): KhKBM Kharkiv's OKR "Boxer", "Molot" from the late 1980s, on its own hull. Built from its project
// leader's account (Yu. Apukhtin, topwar.ru 2018), btvt.info's figures and profile drawing, the one photograph of a
// 477A and the owner's images 3 and 4: a high hull with a long, plain, shallow glacis over the built-in ERA and a flat
// wedge prow (the modular armour package more than a metre deep along the shot line); the multi-barrier side armour,
// one deep run of flat plates along the hull's own outline from the prow's wedge to the stern, over seven rubber-tyred
// road wheels a side as btvt's drawing spaces them (small, with gaps, the idler and sprocket low); a compact walled
// turret with the crew under it, and in its roof the 152 mm gun in its sloped armoured housing (the gun was first
// mounted in the open, then cased: the casing is the Molot's signature), the gunner's remote 7.62 mm on the housing's
// left shoulder (272: in place of the 30 mm cannon), the commander's sight in a dome on the housing's roof (btvt's
// drawing; Apukhtin: raised clear of the casing), the ready rounds' belt in the bustle; Shtora-1's dazzlers in the
// turret's front corners and the commander's remote NSVT on a pedestal behind his sight (owner 2026-11-07, "add shotra
// eyes to the molot and a machine gun to it"). 10,650 mm over the gun, 2,434 mm to the casing's roof, a 2,088 mm line
// of fire (btvt). First-party procedural geometry: Kevin B. Liu (NOTICE.md); sources in
// docs/references/photos/russia-152-20261104.json.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { sideSolid } from './russia152Kit.ts';
import { reserveDecorVolume } from './fieldChest.ts';
import { addShtoraEyes } from './shtora.ts';
import { libraryRoofMg, libraryStationGun } from './libraryRoofMg.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { captureAuxiliaryStock } from './auxiliaryStation.ts';
import { GUN_2A73, build152Gun } from './gun152.ts';
import { MOLOT_FRAME as F } from '../russia152Frames.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { antennaPart } from './antennaPart.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY, cylZ } = KIT;
type Knot = readonly [number, number];
type PrismStation = readonly [number, number, number, number, number];
const ty = (worldY: number) => worldY - F.ringY;
const tz = (worldZ: number) => worldZ - F.ringZ;

/** The value at z along a polyline of [z, value] knots (z increasing), held flat past its ends. */
function along(knots: readonly Knot[], z: number): number {
  if (z <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [z0, v0] = knots[i - 1], [z1, v1] = knots[i];
    if (z <= z1) return v0 + (v1 - v0) * (z - z0) / (z1 - z0);
  }
  return knots[knots.length - 1][1];
}

/** A closed prism along Z through stations [z, x0, x1, y0, y1]. */
function prism(stations: readonly PrismStation[]): ReturnType<typeof sectionSolid> {
  return sectionSolid(stations.map(([z, x0, x1, y0, y1]) => ({ z, ring: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] })));
}
/** A plain block about the origin (twelve triangles at any size). */
const block = (w: number, h: number, d: number) => prism([[-d / 2, -w / 2, w / 2, -h / 2, h / 2], [d / 2, -w / 2, w / 2, -h / 2, h / 2]]);

// The hull's side outline (hull frame), one line for the hull, its sponsons and the side armour that runs along it: the
// stern plate, the upper rear plate, the flat roof, the long shallow glacis from just ahead of the turret, and the prow's
// wedge down to the nose (btvt's drawing: a long glacis to a pointed prow), its upper face clear of the idler's wrap
const GLACIS_Z0 = 1.25, PROW_Z = 3.25, PROW_Y = 1.32, BROW: Knot = [3.50, 1.18];
const TOP: readonly Knot[] = [[F.hullRearZ, 1.42], [-3.50, 1.46], [-3.00, F.roofY], [GLACIS_Z0, F.roofY], [PROW_Z, PROW_Y],
  BROW, [F.hullFrontZ, .86]];
const topY = (z: number) => along(TOP, z);
const GLACIS_TILT = Math.atan2(F.roofY - PROW_Y, PROW_Z - GLACIS_Z0);
const DECK_TILT = Math.atan2(F.roofY - 1.46, 3.50 - 3.00);
/** The hull's side wall (the sponsons' outer face) and the side armour's run against it. */
const SIDE_X = 1.68, SKIRT_IN = 1.675, SKIRT_OUT = 1.789, BEVEL = .025;
/** The side armour's foot: level a hand over the road wheels' tops (btvt's drawing: the deep side over the wheels, the
 * suspension in shadow between), rising into the prow's point and cut up at the stern parallel to the lower stern plate. */
const FOOT: readonly Knot[] = [[-3.50, .96], [-3.36, .70], [PROW_Z, .70], [F.hullFrontZ, .80]];
const footY = (z: number) => along(FOOT, z);
const KNEES = [...new Set([...TOP, ...FOOT].map(([z]) => z))].sort((a, b) => a - b);

/** The closed hull: the centre body between the tracks (belly, lower nose plate, prow, glacis, roof, stern) and the
 * sponsons over the tracks, their floors over the track's top run, the glacis carried across them. */
function addHullBody(P: TankBuilderPort): void {
  const centre = (z: number, bottom: number, w: number): SolidSection => {
    const top = topY(z), c = Math.min(.10, (top - bottom) / 3);
    return { z, ring: [[-w + c, bottom], [w - c, bottom], [w, bottom + c], [w, top], [-w, top], [-w, bottom + c]] };
  };
  P.add('hull', sectionSolid([centre(F.hullRearZ, .84, 1.00), centre(-3.50, .75, 1.06), centre(-3.36, .50, 1.06),
    centre(-3.00, .46, 1.06), centre(GLACIS_Z0, .46, 1.06), centre(PROW_Z, .46, 1.06), centre(3.30, .46, 1.06),
    centre(BROW[0], .46 + (BROW[0] - 3.30) * (.80 - .46) / (F.hullFrontZ - 3.30), 1.06), centre(F.hullFrontZ, .80, .98)]));
  // the sponsons' floors clear of the track's guide horns on the top run, the idler and the sprocket
  const sponson = (z: number): SolidSection => ({ z, ring: [[1.03, 1.02], [SIDE_X, 1.02], [SIDE_X, topY(z)], [1.03, topY(z)]] });
  for (const s of [-1, 1]) P.add('hull', sideSolid([-3.50, -3.00, GLACIS_Z0, PROW_Z].map(sponson), s));
  // the fenders over the idlers, carried down the prow's faces to the nose so the prow is one wedge across the hull's width
  const fender = (z: number): SolidSection => ({ z, ring: [[1.03, topY(z) - .015], [SKIRT_IN, topY(z) - .015], [SKIRT_IN, topY(z)],
    [1.03, topY(z)]] });
  for (const s of [-1, 1]) P.addMudguard('molot-front-fender', 'hull', sideSolid([PROW_Z - .01, BROW[0], F.hullFrontZ].map(fender), s));
}

/** The glacis, plain as the drawing and the art show it: the built-in ERA's containers under it marked only by three flush
 * cross seams, the driver's hatch and periscopes at its head, the headlights in their guards at its front corners, the
 * prow's tow eyes and the folded dozer blade on the lower nose plate. Hull frame. */
function addGlacis(P: TankBuilderPort): void {
  const t = GLACIS_TILT;
  for (const z of [2.20, 2.65, 3.10]) P.add('hullDark', block(3.24, .006, .022), 0, topY(z) + .003, z, t, 0, 0);
  // the driver's hatch on the centreline at the glacis' head (the late layout's central driver), three periscopes ahead of
  // it under a splash strip
  P.addHatch('hullDetail', cylY(.25, .26, .05, 20), 0, topY(1.66) + .02, 1.66, t, 0, 0);
  P.addEquipment('hullDark', box(.24, .035, .05), 0, topY(1.42) + .035, 1.42, t, 0, 0);
  P.addEquipment('hullDetail', box(.05, .03, .16), .14, topY(1.70) + .055, 1.70, t, 0, 0);
  for (const dx of [-.22, 0, .22]) {
    P.addEquipment('hullDark', box(.16, .075, .10), dx, topY(1.98) + .035, 1.98, t, 0, 0);
    P.addEquipment('hullGlass', box(.13, .04, .008), dx, topY(2.03) + .045, 2.034);
  }
  P.add('hullDetail', block(.86, .05, .03), 0, topY(2.10) + .025, 2.10, t, 0, 0);
  // the headlights low at the glacis' front corners, each in its guard
  for (const s of [-1, 1]) {
    const x = s * 1.40, z = 3.02, y = topY(z) + .085;
    P.addEquipment('hullDetail', box(.10, .05, .10), x, topY(z) + .03, z - .02, t, 0, 0);
    P.addEquipment('hullDetail', cylZ(.075, .10, 16), x, y, z);
    P.addEquipment('hullGlass', markVehicleNightLens(cylZ(.064, .012, 16), 'headlight'), x, y, z + .051);
    for (const dx of [-.10, .10]) P.addEquipment('hullDetail', box(.014, .16, .014), x + dx, y, z + .10);
    P.addEquipment('hullDetail', box(.214, .014, .014), x, y + .08, z + .10);
  }
  // the prow's tow eyes on low bosses, and the self-entrenching blade folded flat on the lower nose plate
  const prow = Math.atan2(BROW[1] - .86, F.hullFrontZ - BROW[0]);
  for (const s of [-1, 1]) {
    P.addEquipment('hullDetail', box(.10, .02, .10), s * .62, topY(3.60) + .008, 3.60, prow, 0, 0);
    P.addEquipment('hullDark', cylX(.03, .12, 10), s * .62, topY(3.60) + .045, 3.60);
  }
  const low = Math.atan2(.80 - .46, F.hullFrontZ - 3.30), n = [-Math.cos(low), Math.sin(low)];
  const [cy, cz] = [.63 + .03 * n[0], 3.525 + .03 * n[1]];
  P.add('hullDetail', block(1.80, .03, .36), 0, cy, cz, -low, 0, 0);
  for (const x of [-.60, -.20, .20, .60]) P.addEquipment('hullDark', box(.03, .05, .32), x, cy + .035 * n[0], cz + .035 * n[1], -low, 0, 0);
  P.addEquipment('hullDark', box(1.70, .04, .04), 0, cy - .17 * Math.sin(low) + .02 * n[0], cz - .17 * Math.cos(low) + .02 * n[1]);
}

/** One side-armour plate's section: the inner face against the hull's side wall, the top on the hull's own line, the foot
 * on the run's foot, the outer face `out` (inset at a plate's ends for the bevelled seams), a groove at `groove`. */
function skirtRing(z: number, out: number, groove: number | null): SolidSection {
  const foot = footY(z), top = topY(z);
  const ring: SectionPoint[] = [[SKIRT_IN, foot], [out - BEVEL, foot], [out, foot + BEVEL]];
  if (groove !== null && groove - .03 > foot + BEVEL && groove + .03 < top) ring.push([out, groove - .014], [out - .018, groove], [out, groove + .014]);
  else if (groove !== null) ring.push([out, foot + BEVEL + .01], [out, foot + BEVEL + .02], [out, foot + BEVEL + .03]);
  ring.push([out, top], [SKIRT_IN, top]);
  return { z, ring };
}

/** One plate of the side armour from z0 to z1 on both sides: flat, its vertical edges bevelled into the next plate's. */
function addSkirtPlate(P: TankBuilderPort, z0: number, z1: number, groove: number | null): void {
  const zs = [z0, z0 + BEVEL, ...KNEES.filter((k) => k > z0 + BEVEL + .01 && k < z1 - BEVEL - .01), z1 - BEVEL, z1];
  const sections = zs.map((z, i) => skirtRing(z, i === 0 || i === zs.length - 1 ? SKIRT_OUT - BEVEL : SKIRT_OUT, groove));
  for (const s of [-1, 1]) P.add('hull', sideSolid(sections, s));
}

/** The multi-barrier side armour (btvt's drawing, the 477A photograph): one run of flat plates of one thickness standing
 * against the hull's side wall, their tops flush along the hull's own line (the roof, the glacis and the prow, the upper
 * stern plate), the first plate the prow's wedge, the last cut up parallel to the lower stern plate. Six deep plates from
 * the prow to under the turret, and three behind them grooved into the fender bins' lids over the skirt (the drawing's
 * upper and lower bands). Hull frame. */
const FRONT_EDGES = [F.hullFrontZ, PROW_Z, 2.63, 2.01, 1.39, .77, .15, -.46];
const REAR_EDGES = [-.46, -1.47, -2.48, -3.50];
function addSideArmour(P: TankBuilderPort): void {
  const gap = .006;
  for (let i = 0; i < FRONT_EDGES.length - 1; i++) {
    const z1 = FRONT_EDGES[i] - (i === 0 ? 0 : gap), z0 = FRONT_EDGES[i + 1] + gap;
    addSkirtPlate(P, z0, z1, null);
    // bolt rows along the top and the foot
    for (const s of [-1, 1]) for (const f of i === 0 ? [.18, .45] : [.15, .5, .85]) {
      const z = z0 + (z1 - z0) * f, x = s * (SKIRT_OUT + .004);
      P.addEquipment('hullDark', box(.012, .032, .032), x, topY(z) - .05, z);
      if (i > 0) P.addEquipment('hullDark', box(.012, .032, .032), x, footY(z) + .07, z);
    }
  }
  for (let i = 0; i < REAR_EDGES.length - 1; i++) {
    const z1 = REAR_EDGES[i] - gap, z0 = REAR_EDGES[i + 1] + (i === REAR_EDGES.length - 2 ? 0 : gap);
    addSkirtPlate(P, z0, z1, 1.14);
    for (const s of [-1, 1]) {
      const x = s * (SKIRT_OUT + .006), zc = (z0 + z1) / 2, len = Math.min(z1 - z0 - .30, .70);
      for (const dz of [-len / 2, len / 2]) P.addEquipment('hullDark', box(.012, .07, .05), x, 1.32, zc + dz);
      P.addEquipment('hullDetail', box(.012, .022, .30), s * (SKIRT_OUT + .006), 1.48, zc);
      for (const f of [.15, .5, .85]) P.addEquipment('hullDark', box(.012, .032, .032), s * (SKIRT_OUT + .004), .84, z0 + (z1 - z0) * f);
    }
  }
}

/** The engine deck, the stern and the fenders' boxes: the 6TDF's louvred grilles either side of the access hatch, the
 * air intake ahead of them, the exhaust louvre on the upper stern plate, the unditching log, tail lights and tow hooks, the
 * auxiliary diesel's box on the left of the deck and the stowage bin on the right (the main gun's measured depression over
 * the rear quarters is held off these two), the tow cable. Hull frame. */
function addDeckAndStern(P: TankBuilderPort): void {
  const deck = F.roofY;
  P.add('hullDark', block(1.60, .02, .30), 0, deck + .01, -1.55);
  for (let k = 0; k < 6; k++) P.addEquipment('hullDetail', box(.035, .02, .28), -.70 + k * .28, deck + .025, -1.55);
  for (const s of [-1, 1]) {
    P.add('hullDark', block(.78, .02, 1.10), s * .58, deck + .01, -2.45);
    for (let k = 0; k < 9; k++) P.addEquipment('hullDetail', box(.74, .02, .035), s * .58, deck + .025, -2.93 + k * .12);
    P.addEquipment('hullDetail', box(.82, .03, .03), s * .58, deck + .02, -1.88);
  }
  P.add('hullDetail', block(.30, .03, 1.10), 0, deck + .015, -2.45);
  for (const z of [-2.10, -2.80]) P.addEquipment('hullDark', box(.14, .03, .03), 0, deck + .04, z);
  for (const s of [-1, 1]) P.addEquipment('hullDark', cylY(.06, .06, .03, 12), s * 1.20, deck + .015, -1.50);
  // the exhaust louvre across the upper stern plate
  const zc = -3.25, yc = topY(zc);
  P.add('hullDark', block(1.30, .02, .40), 0, yc + .01, zc, -DECK_TILT, 0, 0);
  for (let k = 0; k < 6; k++) {
    const z = -3.43 + k * .07;
    P.addEquipment('hullDetail', box(1.26, .025, .012), 0, topY(z) + .025, z, -DECK_TILT, 0, 0);
  }
  // the unditching log on its brackets, the tail lights and tow hooks on the stern plate
  P.addEquipment('hullWood', cylZ(.11, 1.90, 10), 0, 1.45, -3.62, 0, Math.PI / 2, 0);
  for (const s of [-1, 1]) {
    P.addEquipment('hullDetail', box(.06, .12, .12), s * .72, 1.36, -3.59);
    P.addEquipment('hullDark', box(.04, .03, .20), s * .72, 1.567, -3.60);
    P.addEquipment('hullDark', box(.12, .08, .04), s * .86, 1.28, -3.565);
    P.addEquipment('hullGlass', box(.08, .04, .01), s * .86, 1.28, -3.588);
    P.addEquipment('hullDetail', box(.09, .09, .12), s * .55, .95, -3.59);
    P.addEquipment('hullDark', cylX(.032, .13, 10), s * .55, .92, -3.63);
  }
  // the auxiliary diesel's box on the left of the deck, the stowage bin on the right, their latches and the diesel's exhaust
  for (const s of [-1, 1]) {
    P.addEquipment('hullDetail', box(.40, .22, .90), s * 1.46, 1.71, -2.30);
    for (const dz of [-.25, .25]) P.addEquipment('hullDark', box(.012, .06, .05), s * 1.666, 1.75, -2.30 + dz);
    P.addEquipment('hullDark', box(.012, .02, .70), s * 1.666, 1.66, -2.30);
  }
  P.addEquipment('hullDark', cylZ(.035, .12, 10), 1.56, 1.70, -2.80);
  KIT.towCable(P, [[.95, 1.62, -3.00], [1.18, 1.62, -2.00], [1.55, 1.62, -1.60], [1.55, 1.62, -.30]], .02);
  // lifting eyes at the roof's corners
  for (const s of [-1, 1]) for (const z of [1.05, -2.95]) P.addEquipment('hullDetail', box(.03, .06, .08), s * 1.56, deck + .03, z);
}

function addRunningGear(P: TankBuilderPort): void {
  // seven rubber-tyred road wheels a side as btvt's profile drawing draws them: 0.54 m over the tyres, 0.82 m apart, so the
  // gaps between them show, with the idler and the sprocket low at the track's ends and the top run hidden behind the side
  // armour; the T-80UD's track, shoe and roller measures (Apukhtin; profiles/t80uX.ts)
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: .27, wheelY: .3438, wheelW: .347,
    wheelZs: [-2.45, -1.633, -.817, 0, .817, 1.633, 2.45], xc: 1.35185, trackW: .55684, trackTh: .030,
    sprocket: { z: -3.05, y: .63, r: .292985, trackR: .286 }, idler: { z: 3.20, y: .63, r: .292985, trackR: .286 },
    rollers: [{ z: -2.04, y: .83, r: .09 }, { z: -.41, y: .83, r: .09 }, { z: 1.22, y: .83, r: .09 }],
    rollerR: .09, returnRollerWidthM: .18, returnRollerInsetM: .10,
    topY: .92, botY: .082, paintedEnds: true, arms: true, coveredTop: true, linkPitchM: .143,
    sprocketDepthScale: .83, idlerDepthScale: .83,
    trackShoeDimensions: { padHeight: .036, grouserHeight: .012, webHeight: .018, hornHeight: .070, pinRadius: .011, pinCentreY: 0 },
  });
}

/** The gun housing's section: its flanks sloped in from the base to the roof's chamfer, each side its own base and roof
 * half-width (the left stepped in over the roof gun's well). */
function housingRing(z: number, bl: number, br: number, tl: number, tr: number, y0: number, y1: number): SolidSection {
  const c = .05;
  return { z, ring: [[-br, y0], [bl, y0], [tl, y1 - c], [tl - c, y1], [-(tr - c), y1], [-tr, y1 - c]] };
}

/** The compact walled turret the crew sits under (turret frame; btvt's drawing: a boxy body about a road wheel tall under
 * the casing): walls round a wedge nose and the roof's chamfer, a terrace on the left front for the roof gun, the ready
 * rounds' bustle stepped down behind; in the roof the gun's sloped armoured housing, the gunner's sight on its right
 * flank, the commander's sight in its dome on the housing's roof; the hatch, the smoke banks on the cheek walls, stowage. */
function addTurret(P: TankBuilderPort): void {
  // [z, base, wall top (at .36) and roof half-widths, the left and right roofs]: the left roof's front quarter a terrace for
  // the gunner's roof gun, its barrel clear over it at full depression; a 1 cm crown under the housing
  const body = (z: number, w0: number, w1: number, w2: number, rl: number, r: number): SolidSection => ({ z,
    ring: [[-w0, .05], [w0, .05], [w1, .36], [w2, rl], [.40, rl], [.30, r + .01], [-w2, r], [-w1, .36]] });
  P.add('turret', sectionSolid([body(-1.48, 1.02, 1.08, .96, .52, .52), body(-1.10, 1.12, 1.20, 1.06, .52, .52),
    body(.02, 1.12, 1.20, 1.06, .52, .52), body(.14, 1.12, 1.20, 1.06, .44, .52), body(.55, 1.12, 1.20, 1.06, .44, .52),
    body(1.10, .88, .94, .82, .44, .52), body(1.55, .60, .64, .56, .44, .50)]));
  P.add('turret', cylY(1.00, 1.02, .10, 36), 0, .03, 0);
  // the ready rounds' belt in the bustle (Apukhtin: eight rounds in the turret's rear niche), stepped down behind the
  // walls (btvt's drawing), its loading lid
  const oct = (z: number, hw: number, y0: number, y1: number, c = .05): SolidSection => ({ z, ring: [[-hw, y0], [hw, y0],
    [hw, y1 - c], [hw - c, y1], [-(hw - c), y1], [-hw, y1 - c]] });
  P.add('turret', sectionSolid([oct(-1.92, .72, .16, .38), oct(-1.82, .80, .11, .43), oct(-1.36, .80, .11, .43)]));
  P.addEquipment('turretDetail', box(.56, .02, .34), -.12, .44, -1.62);
  for (const x of [-.36, .12]) P.addEquipment('turretDark', box(.08, .03, .04), x, .45, -1.46);
  // the gun's housing (the "пенал", Apukhtin; btvt's drawing: the gun leaving the upper front of the turret): flanks
  // sloped into the roof, a raked face over the gun, the full 2,434 mm back over the breech's recoil, then a sloped tail
  // down into the roof; its left flank stepped in over the roof gun's well
  P.add('turret', sectionSolid([housingRing(-1.06, .34, .46, .28, .36, .44, .58), housingRing(-.40, .40, .58, .36, .44, .40, .834),
    housingRing(.58, .40, .58, .36, .44, .38, .834), housingRing(.70, .58, .58, .44, .44, .38, .834),
    housingRing(1.44, .58, .58, .44, .44, .16, .834), housingRing(1.66, .48, .48, .40, .40, .22, .60)]));
  const tail = Math.atan2(.834 - .58, 1.06 - .40);
  P.addEquipment('turretDetail', box(.36, .025, .30), -.04, .695, -.80, -tail, 0, 0);
  P.addEquipment('turretDark', box(.26, .03, .03), -.04, .76, -.62, -tail, 0, 0);
  P.addEquipment('turretDetail', box(.50, .02, .60), -.04, .844, .05);
  for (const z of [-.15, .25]) P.addEquipment('turretDark', box(.10, .03, .04), .14, .86, z);
  for (const [x, z] of [[-.32, 1.30], [.32, 1.30], [-.30, -.30], [.24, -.30]]) P.addEquipment('turretDetail', box(.03, .06, .08), x, .864, z);
  // the gunner's multichannel sight (optical, TV, laser rangefinder and the missile's guidance channel) on the housing's
  // right flank, its hooded head over the housing's roof, its windows forward behind armoured doors
  P.add('turret', prism([[.55, -.80, -.45, .44, .80], [1.05, -.80, -.45, .44, .80]]));
  P.add('turret', prism([[.62, -.77, -.48, .78, .90], [.96, -.77, -.48, .78, .95]]));
  P.addEquipment('turretDark', box(.26, .14, .02), -.625, .86, .965);
  P.addEquipment('turretGlass', box(.20, .09, .012), -.625, .86, .974);
  P.addEquipment('turretDark', box(.26, .22, .02), -.625, .62, 1.055);
  P.addEquipment('turretGlass', box(.10, .10, .012), -.70, .64, 1.064);
  P.addEquipment('turretGlass', box(.08, .08, .012), -.54, .64, 1.064);
  for (const s of [-1, 1]) P.addEquipment('turretDetail', box(.02, .24, .14), -.625 + s * .15, .62, 1.12, 0, s * -.6, 0);
  // the commander's panoramic sight in its armoured dome on the housing's roof, raised clear of the gun (Apukhtin; the
  // dome of btvt's drawing), its window forward under a brow
  const [dx, dz, dy] = [.20, .85, .894];
  P.add('turretDetail', cylY(.17, .18, .06, 20), dx, dy - .03, dz);
  P.add('turretDetail', KIT.lathe([[.001, 0], [.165, 0], [.15, .06], [.11, .11], [.05, .14], [.001, .15]], 20), dx, dy, dz);
  P.addEquipment('turretDark', box(.16, .06, .03), dx, dy + .036, dz + .135);
  P.addEquipment('turretGlass', box(.13, .04, .01), dx, dy + .036, dz + .152);
  P.addEquipment('turretDetail', box(.18, .012, .06), dx, dy + .081, dz + .14);
  // the commander's hatch and its periscopes on the roof right of the housing, the fighting compartment's ventilator
  P.addHatch('turretDetail', cylY(.26, .27, .05, 20), -.72, .545, -.55);
  P.addEquipment('turretDark', box(.10, .04, .06), -.72, .58, -.80);
  for (const [x, z] of [[-.98, -.40], [-.98, -.70], [-.72, -.24]]) {
    P.addEquipment('turretDark', box(.12, .07, .08), x, .55, z, 0, x < -.9 ? Math.PI / 2 : 0, 0);
    P.addEquipment('turretGlass', box(.10, .03, .008), x + (x < -.9 ? -.041 : 0), .56, z + (x < -.9 ? 0 : .041), 0, x < -.9 ? Math.PI / 2 : 0, 0);
  }
  P.add('turretDetail', cylY(.13, .16, .07, 18), -.62, .555, -1.12);
  P.addEquipment('turretDark', cylY(.10, .10, .025, 18), -.62, .60, -1.12);
  // the smoke banks on the cheek walls, under the roof gun's sweep
  for (const s of [-1, 1]) {
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: .040, len: .25, pitch: -.42, splay: .28, arc: .48, spacing: .088, seed: 477 + s });
    smoke.position.set(s * 1.16, .28, .70);
    smoke.rotation.y = s * .95;
    P.turretG.add(smoke);
    P.addEquipment('turretDetail', box(.10, .12, .26), s * 1.12, .26, .70, 0, s * .5, 0);
  }
  // stowage boxes on the walls, low under the roof gun's sweep, lifting eyes on the roof's edges
  for (const s of [-1, 1]) for (const z of [-.50, -1.12]) {
    P.addEquipment('turretDetail', box(.14, .22, .52), s * 1.24, .22, z);
    P.addEquipment('turretDark', box(.012, .04, .08), s * 1.316, .26, z);
  }
  for (const [x, y, z] of [[.84, .47, .98], [-.84, .55, .98], [.90, .55, -1.40], [-.90, .55, -1.40]]) P.addEquipment('turretDetail', box(.03, .06, .08), x, y, z);
  // the antennas on the roof's rear corners, the wind sensor's mast on the bustle
  for (const [x, z, h] of [[-1.00, -1.40, 1.03], [1.00, -1.40, .83]]) {
    P.addEquipment('turretDetail', antennaPart(cylY(.04, .05, .08, 12)), x, .53, z);
    P.addEquipment('turretDark', antennaPart(cylY(.009, .012, h, 8)), x, .57 + h / 2, z);
  }
  P.addEquipment('turretDark', cylY(.012, .015, .36, 8), -.62, .62, -1.60);
  P.addEquipment('turretDetail', box(.10, .04, .04), -.62, .80, -1.60);
  P.decal('turret', 'number', P.spec.visual.number || '', .26, [.807, .27, -1.62], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', .26, [-.807, .27, -1.62], -Math.PI / 2);
  // the gunner's remote 7.62 mm station on the housing's left shoulder, its race let into the terrace (addGunnerMg)
  addGunnerMg(P);
}

/** The gunner's remote 7.62 mm machine gun (owner 2026-11-11: "mak ethe autocannon onn it a lil smaller until its a
 * rregular remote machine gun emplacement"): the 30 mm GSh-30 that stood on the housing's left shoulder becomes a remote
 * PKT on the same race, Kharkiv's KT-7.62 open cradle as the Oplot-M carries it (oplotBM.ts cradleStation; the PKT drawn
 * as the fleet's 7.62 mm GPMG, libraryStationGun 'mag'): a low slewing base on the terrace, two cheeks to the trunnion,
 * the gun on its tray with the belt box outboard and the sight-and-camera head inboard. The 152 mm gun in its casing has
 * no coaxial gun, so the gunner's anti-infantry 7.62 rides here; the commander's NSVT behind his sight stays the
 * Molot's 12.7 mm (addCommanderMg). Its sweep is measured against the turret's stock (.qa-dev station-levels.mjs, the barrel lines of
 * tools/roof-station-arcs.mjs from level to full elevation): clear from 19 degrees inboard, where the casing's flank
 * stops it, to 170 degrees, past which the roof's left rear corner does; it turns from a degree short of each, at full
 * depression between, shallower only at its two stops (station-table.mjs). Turret frame. */
const MG = { x: .80, race: .46, z: .45, pivotY: .70, pivotZ: .52, muzzleZ: 1.36 } as const;
const MG_ARC: readonly [number, number] = [-0.3142, 2.9496];
const MG_DEPRESSION: readonly (readonly [number, number])[] = [[-0.3142, 0.036], [-0.2967, 0.126], [-0.2793, 0.18],
  [2.9322, 0.18], [2.9496, 0.014]];
function addGunnerMg(P: TankBuilderPort): void {
  const { x, race, z, pivotY, pivotZ, muzzleZ } = MG;
  P.add('turret', cylY(.18, .20, .03, 20), x, race - .015, z);
  const w = sourceMachineGun(P, [0, 0, 0], { name: 'molotGunnerMgStation', caliberMm: 7.62,
    yaw: [x, race, z], pivot: [x, pivotY, pivotZ], muzzle: [x, pivotY, muzzleZ] });
  w.stage('yaw');
  w.add('turretDetail', cylY(.15, .16, .05, 20), x, race + .025, z);
  // the slewing drive's low box behind the cradle, its cable gland
  w.add('turretDetail', block(.28, .09, .30), x, race + .095, z - .04);
  w.add('turretDark', box(.10, .05, .03), x, race + .09, z - .205);
  for (const side of [-1, 1]) {
    w.add('turretDetail', sectionSolid([
      { z: z - .10, ring: [[x + side * .10 - .013, race + .13], [x + side * .10 + .013, race + .13], [x + side * .10 + .013, pivotY - .02], [x + side * .10 - .013, pivotY - .02]] },
      { z: pivotZ + .07, ring: [[x + side * .10 - .013, race + .13], [x + side * .10 + .013, race + .13], [x + side * .10 + .013, pivotY + .04], [x + side * .10 - .013, pivotY + .04]] },
    ]), 0, 0, 0);
    w.add('turretDark', cylX(.03, .026, 14), x + side * .117, pivotY, pivotZ);
  }
  w.stage('pitch');
  libraryStationGun(w, { cls: 'mag', x, boreY: pivotY, pivotZ, muzzleZ });
  w.add('turretDetail', box(.15, .03, .52), x, pivotY - .075, pivotZ + .03);
  // the belt box outboard (the gun's feed is on its left), the sight-and-camera head inboard with its two windows
  w.add('turretAmmo', box(.12, .19, .30), x + .17, pivotY - .02, pivotZ - .04);
  w.add('turretDetail', box(.13, .14, .21), x - .17, pivotY + .02, pivotZ + .05);
  w.add('turretGlass', box(.06, .06, .012), x - .19, pivotY + .04, pivotZ + .161);
  w.add('turretGlass', box(.035, .035, .012), x - .14, pivotY, pivotZ + .161);
  w.add('turretDark', box(.15, .018, .24), x - .17, pivotY + .099, pivotZ + .06);
  const station = w.finish();
  station.userData.yawArc = [...MG_ARC];
  station.userData.depressionByYaw = MG_DEPRESSION.map(([y, d]) => [y, d]);
}

/** Shtora-1's eyes (owner 2026-11-07, "add shotra eyes to the molot"; the Molot art's two lamps level with the gun at
 * the corners of the turret's face; owner 2026-11-11: "make the shtora on thee molot blue and slit eyes instead oof
 * circles"): the two OTShU-1-7 infrared dazzlers, the fleet's emitter (profiles/shtora.ts) with its louvres, cheek
 * plates and cable boxes, their housings in the vehicle's paint as on the T-90, each eye a narrow blue slit in a dark
 * visor frame (shtora.ts slit, lens 'blue') under a painted brow that stands proud of the housing and shades the slit.
 * One in each front corner of the turret between the casing's flank and the cheek wall, set back so its housing is
 * buried in the corner and its face stands level with the casing's; the gun's sleeve passes 30 cm inboard. The left one
 * stands under the gunner's 7.62 mm station (addGunnerMg). The TShU-1-11 laser-warning heads on short posts at the
 * casing roof's front corners (profiles/object195X.ts warningHead). Turret frame. */
const SHTORA = { x: .62, y: .37, z: 1.505, scale: .95 } as const;
function addShtora(P: TankBuilderPort): void {
  addShtoraEyes({ mats: P.mats, turretG: P.turretG, disposables: P.disposables,
    add: (slot, geometry, x, y, z) => P.addEquipment(slot === 'turretDark' ? 'turretDetail' : slot, geometry, x, y, z),
  }, { ...SHTORA, round: false, slit: true, lens: 'blue', kit: true });
  // the brow: a plate over the slit from the housing's face to 6 cm ahead of it, tipped down 14 degrees, with two short
  // blinkers at its ends down past the slit
  const { x, y, z, scale: es } = SHTORA, face = z + .11 * es;
  for (const s of [-1, 1]) {
    P.addEquipment('turretDetail', box(.23 * es, .016, .075 * es), s * x, y + .055 * es, face + .03 * es, .24, 0, 0);
    for (const e of [-1, 1]) P.addEquipment('turretDetail', box(.012, .085 * es, .06 * es), s * x + e * .108 * es, y + .02 * es, face + .03 * es);
  }
  for (const s of [-1, 1]) {
    const hx = s * .33, hz = 1.16, foot = .834, post = .03, hy = foot + post;
    P.addEquipment('turretDetail', cylY(.035, .035, .015, 10), hx, foot + .0075, hz);
    P.addEquipment('turretDetail', cylY(.016, .016, post, 8), hx, foot + post / 2, hz);
    P.addEquipment('turretDetail', cylY(.05, .05, .05, 14), hx, hy + .025, hz);
    P.addEquipment('turretDark', cylY(.053, .053, .035, 14), hx, hy + .068, hz);
    P.addEquipment('turretDetail', cylY(.03, .05, .025, 14), hx, hy + .098, hz);
  }
}

/** The commander's remote 12.7 mm (owner 2026-11-07, "... and a machine gun to it"; btvt's profile drawing: a machine gun
 * on a pedestal at the rear of the casing's roof, its barrel along the roof towards the commander's sight): the fleet's
 * true-scale NSVT in its remote cradle (libraryRoofMg.ts) on a low cast pedestal (critics r12: the drawing's gun sits
 * low) standing on the casing's roof behind the roof plate, right of the centreline on the commander's side, its muzzle
 * at rest short of the sight's dome. It turns a
 * full circle at full depression (.qa-dev/r152/station-levels.mjs and station-table-full.mjs against the turret's stock:
 * no blocked degree, no shallower depression), so it needs no yawArc or depressionByYaw; it stands on the casing's roof
 * above the gunner's 7.62 mm station on the left shoulder (addGunnerMg), clear of its sweep. Turret frame. */
const MG_SEAT = [-.12, .86, -.36] as const, MG_RISER = 'molotCommanderMgRiser';
function addCommanderMg(P: TankBuilderPort): void {
  const { station } = libraryRoofMg(P, { station: 'molotCommanderMgStation', cls: 'nsvt', seat: MG_SEAT, remote: true });
  // the pedestal, the gun's mount and not the turret's body (t80uX.ts nsvtRiser): a static group under the station tagged
  // as a weapon-station mount, its stock merged into it, standing still while the gun turns on it: a boss bedded in the
  // roof where the casing's tail falls away behind it, three gusset webs, a tapered column round the gun's own post and a
  // collar 1 cm under its yaw ring
  const mount = new THREE.Group();
  mount.name = MG_RISER;
  Object.assign(mount.userData, { fitting: 'weaponStationMount', hasWeapon: false, supportAssembly: station.name });
  station.add(mount);
  const finish = captureAuxiliaryStock(P, MG_RISER, 'yaw');
  const [x, seat, z] = MG_SEAT, foot = .800, boss = .862, top = seat + .085;
  P.addEquipment('turretDetail', KIT.lathe([[0, foot], [.105, foot], [.105, boss - .008], [.097, boss], [.078, boss],
    [.072, boss + .01], [.058, top - .03], [.068, top - .024], [.068, top - .006], [.062, top], [0, top]], 20), x, 0, z);
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 3 + k * 2 * Math.PI / 3;
    P.addEquipment('turretDetail', box(.01, .06, .032), x + .086 * Math.sin(a), boss + .025, z + .086 * Math.cos(a), 0, a, 0);
  }
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    P.addEquipment('turretDark', cylY(.010, .009, .012, 6), x + .092 * Math.sin(a), boss + .003, z + .092 * Math.cos(a));
  }
  finish();
  // the decor's loads keep out of the gun's sweep over the casing (fieldChest.ts reserveDecorVolume; turret frame): the
  // decor's spare whip, which stood on the casing's tail 0.8 m behind the pivot, goes; the turret keeps its own two
  reserveDecorVolume(P.turretG, [x - 1.10, .80, z - 1.05], [x + 1.10, 1.50, z + 1.10]);
}

/** The gun's mount inside the housing, its armoured cradle sleeve out of the housing's face with the boresight's box on it,
 * and the 152 mm tube. Gun frame. */
function addGun(P: TankBuilderPort): void {
  P.addGunExtra(sectionSolid([
    { z: -.40, ring: [[-.30, -.24], [.30, -.24], [.34, -.10], [.34, .20], [.26, .28], [-.26, .28], [-.34, .20], [-.34, -.10]] },
    { z: .48, ring: [[-.30, -.24], [.30, -.24], [.34, -.10], [.34, .20], [.26, .28], [-.26, .28], [-.34, .20], [-.34, -.10]] },
    { z: .62, ring: [[-.24, -.18], [.24, -.18], [.27, -.07], [.27, .14], [.20, .20], [-.20, .20], [-.27, .14], [-.27, -.07]] },
  ]));
  const sleeve = (z: number, k: number): SolidSection => ({ z, ring: [[-.13 * k, -.17 * k], [.13 * k, -.17 * k], [.19 * k, -.11 * k],
    [.19 * k, .12 * k], [.13 * k, .18 * k], [-.13 * k, .18 * k], [-.19 * k, .12 * k], [-.19 * k, -.11 * k]] });
  P.addGunExtra(sectionSolid([sleeve(.74, 1), sleeve(1.06, 1), sleeve(1.13, .86)]));
  P.addGunExtra(cylZ(.20, .04, 24), 0, 0, 1.08);
  P.addGunExtra(block(.12, .09, .22), 0, .225, .95);
  P.addGunExtra(block(.07, .05, .012), 0, .225, 1.066);
  build152Gun(P, { ...GUN_2A73, len: F.muzzleZ - F.trunnionZ });
}

export function buildObject477Molot(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(0, F.ringY, F.ringZ);
  P.gunG.position.set(0, ty(F.trunnionY), tz(F.trunnionZ));
  addHullBody(P);
  addGlacis(P);
  addSideArmour(P);
  addDeckAndStern(P);
  addRunningGear(P);
  addTurret(P);
  addShtora(P);
  addCommanderMg(P);
  addGun(P);
  P.topY = 1.12;
}

export const OBJECT477_MOLOT_PROFILES = { object477_molot: { build: buildObject477Molot } };
