// The Object 477 Molot (release 269; owner 2026-11-04, 'Object 477 "Molot"'; DECISIONS "2026-11-04 Russian 152 mm
// line"; owner 2026-11-05, "fully improve the molot", "make the hulls much beter", "properly match sideskirts to hull side
// profiles"): KhKBM Kharkiv's OKR "Boxer", "Molot" from the late 1980s, on its own hull. Built from its project leader's
// account (Yu. Apukhtin, topwar.ru 2018), btvt.info's figures and profile drawing, the one photograph of a 477A and the
// owner's images 3 and 4: a high hull with a long, shallow glacis tiled with the built-in ERA's lids and a flat wedge prow
// (the modular armour package more than a metre deep along the shot line); the multi-barrier side armour, one run of flat
// plates along the hull's own outline from the prow's wedge to the stern, over T-80UD-type running gear on seven large
// rubber-tyred road wheels a side; a low, wide, wedge-nosed turret with the crew under it, and on its roof the 152 mm gun
// in its armoured casing (the gun was first mounted in the open, then cased: the casing is the Molot's signature); the
// 30 mm cannon beside the casing; the commander's panoramic sight raised clear of it; the ready rounds' belt in the bustle.
// 10,650 mm over the gun, 2,434 mm to the casing's roof, a 2,088 mm line of fire (btvt). First-party procedural geometry:
// Kevin B. Liu (NOTICE.md); sources in docs/references/photos/russia-152-20261104.json.
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { add30mmCannon, sideSolid } from './russia152Kit.ts';
import { GUN_2A73, build152Gun } from './gun152.ts';
import { MOLOT_FRAME as F } from '../russia152Frames.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
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
/** The side armour's foot: level over the road wheels' tops, rising into the prow's point and cut up at the stern parallel
 * to the lower stern plate. */
const FOOT: readonly Knot[] = [[-3.50, .96], [-3.38, .76], [PROW_Z, .76], [F.hullFrontZ, .80]];
const footY = (z: number) => along(FOOT, z);
const KNEES = [...new Set([...TOP, ...FOOT].map(([z]) => z))].sort((a, b) => a - b);

/** The closed hull: the centre body between the tracks (belly, lower nose plate, prow, glacis, roof, stern) and the
 * sponsons over the tracks, their floors lifted over the idler and the sprocket, the glacis carried across them. */
function addHullBody(P: TankBuilderPort): void {
  const centre = (z: number, bottom: number, w: number): SolidSection => {
    const top = topY(z), c = Math.min(.10, (top - bottom) / 3);
    return { z, ring: [[-w + c, bottom], [w - c, bottom], [w, bottom + c], [w, top], [-w, top], [-w, bottom + c]] };
  };
  P.add('hull', sectionSolid([centre(F.hullRearZ, .84, 1.00), centre(-3.50, .75, 1.06), centre(-3.36, .50, 1.06),
    centre(-3.00, .46, 1.06), centre(GLACIS_Z0, .46, 1.06), centre(PROW_Z, .46, 1.06), centre(3.30, .46, 1.06),
    centre(BROW[0], .46 + (BROW[0] - 3.30) * (.80 - .46) / (F.hullFrontZ - 3.30), 1.06), centre(F.hullFrontZ, .80, .98)]));
  // the sponsons' floors clear of the track's guide horns on the top run and over the idler and the sprocket
  const sponson = (z: number): SolidSection => ({ z, ring: [[1.03, 1.28], [SIDE_X, 1.28], [SIDE_X, topY(z)], [1.03, topY(z)]] });
  for (const s of [-1, 1]) P.add('hull', sideSolid([-3.50, -3.00, GLACIS_Z0, PROW_Z].map(sponson), s));
  // the fenders over the idlers, carried down the prow's faces to the nose so the prow is one wedge across the hull's width
  const fender = (z: number): SolidSection => ({ z, ring: [[1.03, topY(z) - .015], [SKIRT_IN, topY(z) - .015], [SKIRT_IN, topY(z)],
    [1.03, topY(z)]] });
  for (const s of [-1, 1]) P.addMudguard('molot-front-fender', 'hull', sideSolid([PROW_Z - .01, BROW[0], F.hullFrontZ].map(fender), s));
}

/** The glacis: the built-in ERA's titanium lids in four rows across it (owner's image 4; Apukhtin), the driver's hatch and
 * periscopes at its head, the headlights in armoured boxes at its front corners, the prow's tow hooks and the folded dozer
 * blade on the lower nose plate. Hull frame. */
function addGlacis(P: TankBuilderPort): void {
  const t = GLACIS_TILT, lidLen = .24 / Math.cos(t);
  for (const z of [2.255, 2.525, 2.795, 3.065]) for (const x of [-1.28, -.64, 0, .64, 1.28]) {
    if (Math.abs(x) > 1 && z > 2.7) continue;
    P.add('hullDetail', block(.60, .022, lidLen), x, topY(z) + .011, z, t, 0, 0);
    for (const dx of [-.25, .25]) for (const dz of [-.085, .085]) {
      P.addEquipment('hullDark', box(.03, .012, .03), x + dx, topY(z + dz) + .026, z + dz, t, 0, 0);
    }
  }
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
  // the headlights in their armoured boxes on the glacis' front corners, guards ahead of the lenses
  for (const s of [-1, 1]) {
    const x = s * 1.44, [z0, z1] = [2.90, 3.12];
    P.add('hullDetail', prism([[z0, -.15, .15, topY(z0) - .03, topY(z0) + .15], [z1, -.15, .15, topY(z1) - .03, topY(z1) + .13]]), x, 0, 0);
    P.addEquipment('hullDark', box(.20, .10, .012), x, topY(z1) + .07, z1 + .004);
    P.addEquipment('hullGlass', markVehicleNightLens(box(.13, .065, .01), 'headlight'), x - s * .02, topY(z1) + .07, z1 + .012);
    P.addEquipment('hullGlass', box(.035, .035, .01), x + s * .075, topY(z1) + .07, z1 + .012);
    for (const dx of [-.11, .11]) P.addEquipment('hullDetail', box(.016, .15, .016), x + dx, topY(z1) + .07, z1 + .07);
    P.addEquipment('hullDetail', box(.24, .016, .016), x, topY(z1) + .145, z1 + .07);
    P.addEquipment('hullDetail', box(.24, .016, .07), x, topY(z1) + .145, z1 + .035);
  }
  // the prow's tow hooks and lifting eyes, and the self-entrenching blade folded flat on the lower nose plate
  const prow = Math.atan2(BROW[1] - .86, F.hullFrontZ - BROW[0]);
  for (const s of [-1, 1]) {
    P.addEquipment('hullDetail', box(.08, .07, .14), s * .62, topY(3.55) + .02, 3.55, prow, 0, 0);
    P.addEquipment('hullDark', cylX(.035, .12, 10), s * .62, topY(3.60) + .06, 3.60);
    P.addEquipment('hullDetail', box(.03, .06, .08), s * 1.50, topY(2.82) + .03, 2.82, t, 0, 0);
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
}

/** The armoured casing's section: chamfered along its roof, its lid's joint a groove along both flanks at .56 (lower at
 * the tail). */
function casingRing(z: number, hw: number, y0: number, y1: number): SolidSection {
  const c = .06, yl = Math.min(.56, y1 - c - .03), g = .012;
  return { z, ring: [[-hw, y0], [hw, y0], [hw, yl - g], [hw - .016, yl], [hw, yl + g], [hw, y1 - c], [hw - c, y1],
    [-(hw - c), y1], [-hw, y1 - c], [-hw, yl + g], [-hw + .016, yl], [-hw, yl - g]] };
}

/** The low, wide turret the crew sits under (turret frame): a wedge-nosed body with raked flanks over an undercut skirt,
 * the ready rounds' bustle, the armoured casing along its roof with the gunner's sight on its right flank, the commander's
 * raised panoramic sight, hatches, smoke banks, stowage and the 30 mm. */
function addTurret(P: TankBuilderPort): void {
  const body = (z: number, w0: number, ws: number, ys: number, wr: number, yr: number): SolidSection => ({ z,
    ring: [[-w0, .01], [w0, .01], [ws, ys], [wr, yr], [-wr, yr], [-ws, ys]] });
  P.add('turret', sectionSolid([body(-1.80, .86, .96, .13, .82, .33), body(-1.45, 1.04, 1.13, .14, .95, .37),
    body(-1.05, 1.12, 1.22, .14, 1.02, .38), body(.55, 1.12, 1.22, .14, 1.02, .38), body(1.00, .90, .98, .13, .80, .34),
    body(1.32, .46, .52, .11, .42, .26)]));
  P.add('turret', cylY(1.00, 1.02, .10, 36), 0, .03, 0);
  // the ready rounds' belt in the bustle (Apukhtin: eight rounds in the turret's rear niche), its loading lid and the
  // stowage rack on its back
  const oct = (z: number, hw: number, y0: number, y1: number, c = .05): SolidSection => ({ z, ring: [[-hw, y0], [hw, y0],
    [hw, y1 - c], [hw - c, y1], [-(hw - c), y1], [-hw, y1 - c]] });
  P.add('turret', sectionSolid([oct(-1.92, .72, .16, .38), oct(-1.82, .80, .11, .43), oct(-1.30, .80, .11, .43)]));
  P.addEquipment('turretDetail', box(.56, .02, .34), -.12, .44, -1.58);
  for (const x of [-.36, .12]) P.addEquipment('turretDark', box(.08, .03, .04), x, .45, -1.42);
  P.addEquipment('turretDetail', box(1.30, .02, .24), 0, .20, -2.04);
  for (const x of [-.64, -.21, .21, .64]) P.addEquipment('turretDetail', box(.02, .28, .02), x, .33, -2.15);
  P.addEquipment('turretDetail', box(1.30, .02, .02), 0, .46, -2.15);
  for (const s of [-1, 1]) P.addEquipment('turretDetail', box(.02, .02, .24), s * .64, .46, -2.04);
  P.addEquipment('turretDark', box(1.10, .20, .16), 0, .31, -2.04);
  // the casing ("пенал") round the gun's cradle and breech (Apukhtin; btvt's drawing): a tall front block over the mantlet
  // standing ahead of the turret's nose, a long run back over the breech's recoil at the full 2,434 mm, then down to the
  // sabot petals' ejection hatch at its tail
  P.add('turret', sectionSolid([casingRing(-1.52, .33, .36, .60), casingRing(-1.15, .36, .34, .72), casingRing(-.45, .38, .32, .834),
    casingRing(.44, .38, .32, .834), casingRing(.56, .50, .30, .834), casingRing(1.00, .50, .14, .834),
    casingRing(1.56, .50, .14, .834), casingRing(1.74, .44, .20, .74)]));
  const tail = Math.atan2(.72 - .60, 1.52 - 1.15), mid = Math.atan2(.834 - .72, 1.15 - .45);
  P.addEquipment('turretDetail', box(.40, .025, .26), 0, .684, -1.30, -tail, 0, 0);
  P.addEquipment('turretDark', box(.30, .03, .03), 0, .725, -1.18, -tail, 0, 0);
  P.addEquipment('turretDetail', box(.50, .02, .55), 0, .79, -.80, -mid, 0, 0);
  P.addEquipment('turretDetail', box(.56, .02, .70), 0, .844, .05);
  for (const z of [-.20, .30]) P.addEquipment('turretDark', box(.10, .03, .04), .20, .86, z);
  for (const [x, z] of [[-.36, 1.45], [.36, 1.45], [-.30, -.30], [.30, -.30]]) P.addEquipment('turretDetail', box(.03, .06, .08), x, .864, z);
  // the casing's bolted flank plates on its right side, clear of the 30 mm's sweep on its left
  for (const z of [.80, 1.30]) P.addEquipment('turretDetail', box(.02, .22, .40), -.51, .70, z);
  // the gunner's multichannel sight (optical, TV, laser rangefinder and the missile's guidance channel) on the casing's
  // right flank, its hooded head over the casing's roof (btvt's drawing), its windows forward behind armoured doors
  P.add('turret', prism([[.55, -.80, -.45, .34, .80], [1.05, -.80, -.45, .34, .80]]));
  P.add('turret', prism([[.62, -.77, -.48, .78, .90], [.96, -.77, -.48, .78, .95]]));
  P.addEquipment('turretDark', box(.26, .14, .02), -.625, .86, .965);
  P.addEquipment('turretGlass', box(.20, .09, .012), -.625, .86, .974);
  P.addEquipment('turretDark', box(.26, .22, .02), -.625, .60, 1.055);
  P.addEquipment('turretGlass', box(.10, .10, .012), -.70, .62, 1.064);
  P.addEquipment('turretGlass', box(.08, .08, .012), -.54, .62, 1.064);
  for (const s of [-1, 1]) P.addEquipment('turretDetail', box(.02, .24, .14), -.625 + s * .15, .60, 1.12, 0, s * -.6, 0);
  // the commander's panoramic sight on its pedestal, raised clear of the casing (Apukhtin), at the left of the roof
  const [cx, cz] = [.58, -.15];
  P.add('turret', cylY(.15, .17, .42, 20), cx, .57, cz);
  P.addEquipment('turretDetail', cylY(.185, .185, .08, 22), cx, .80, cz);
  P.add('turretDetail', prism([[cz - .14, -.12, .12, .84, .99], [cz + .12, -.12, .12, .84, 1.00]]), cx, 0, 0);
  P.addEquipment('turretDetail', box(.26, .02, .10), cx, 1.005, cz + .14);
  P.addEquipment('turretDark', box(.22, .10, .02), cx, .92, cz + .125);
  P.addEquipment('turretGlass', box(.17, .065, .01), cx, .92, cz + .136);
  // the commander's hatch and its periscopes on the low roof right of the casing
  P.addHatch('turretDetail', cylY(.26, .27, .05, 20), -.72, .405, -.55);
  P.addEquipment('turretDark', box(.10, .04, .06), -.72, .44, -.80);
  for (const [x, z] of [[-.98, -.40], [-.98, -.70], [-.72, -.24]]) {
    P.addEquipment('turretDark', box(.12, .07, .08), x, .41, z, 0, x < -.9 ? Math.PI / 2 : 0, 0);
    P.addEquipment('turretGlass', box(.10, .03, .008), x + (x < -.9 ? -.041 : 0), .42, z + (x < -.9 ? 0 : .041), 0, x < -.9 ? Math.PI / 2 : 0, 0);
  }
  // the fighting compartment's ventilator behind the hatch, a grab rail along the casing's right flank
  P.add('turretDetail', cylY(.13, .16, .07, 18), -.62, .415, -1.12);
  P.addEquipment('turretDark', cylY(.10, .10, .025, 18), -.62, .46, -1.12);
  P.addEquipment('turretDetail', box(.012, .018, .62), -.392, .70, -.05);
  for (const z of [-.33, .23]) P.addEquipment('turretDetail', box(.03, .018, .018), -.382, .70, z);
  // the smoke banks on the cheeks on their brackets
  for (const s of [-1, 1]) {
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: .040, len: .25, pitch: -.42, splay: .28, arc: .48, spacing: .088, seed: 477 + s });
    smoke.position.set(s * 1.05, .40, .62);
    smoke.rotation.y = s * .95;
    P.turretG.add(smoke);
    P.addEquipment('turretDetail', box(.20, .12, .40), s * 1.04, .33, .62, 0, s * .4, 0);
  }
  // stowage boxes along the flanks, low under the 30 mm's sweep, lifting eyes on the roof's edges
  const flank = Math.atan2(1.22 - 1.02, .38 - .14), [nx, ny] = [Math.cos(flank), Math.sin(flank)];
  for (const s of [-1, 1]) for (const z of [-.50, -1.12]) {
    const [bx, by] = [1.12 + .08 * nx, .26 + .08 * ny];
    P.addEquipment('turretDetail', box(.16, .18, .52), s * bx, by, z, 0, 0, s * flank);
    P.addEquipment('turretDark', box(.012, .04, .08), s * (bx + .086 * nx), by + .086 * ny, z, 0, 0, s * flank);
  }
  for (const [x, z] of [[.96, .80], [-.96, .80], [.90, -1.62], [-.90, -1.62]]) P.addEquipment('turretDetail', box(.03, .06, .08), x, .37, z);
  // the antennas on their mounts at the bustle's corners, the wind sensor's mast at the right
  for (const [x, z, h] of [[-1.00, -1.40, 1.10], [1.00, -1.40, .90]]) {
    P.add('turretDetail', cylY(.05, .06, .14, 10), x, .35, z);
    P.addEquipment('turretDetail', cylY(.04, .05, .08, 12), x, .46, z);
    P.addEquipment('turretDark', cylY(.009, .012, h, 8), x, .50 + h / 2, z);
  }
  P.addEquipment('turretDark', cylY(.012, .015, .36, 8), -.62, .62, -1.60);
  P.addEquipment('turretDetail', box(.10, .04, .04), -.62, .80, -1.60);
  P.decal('turret', 'number', P.spec.visual.number || '', .26, [.382, .58, -.80], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', .26, [-.382, .58, -.80], -Math.PI / 2);
  // the GSh-30 beside the gun's casing on its raised race: its barrel crosses the casing from 14 degrees inboard
  // (tools/roof-station-arcs.mjs, barrel lines against the turret's stock), so it turns from a degree short of that round
  // its outboard side to 172 degrees; over the turret's rear quarter it depresses only as far as the table lets it (each
  // degree the smallest of it and its neighbours)
  P.add('turret', cylY(.22, .24, .08, 22), .80, .40, .45);
  add30mmCannon(P, { name: 'molot_gsh30', x: .80, deck: .44, z: .45, axisY: .68, pivotZ: .45, muzzleZ: 2.35,
    yawArc: [-0.2094, 3.0020],
    depressionByYaw: [[1.1694, 0.18], [1.1868, 0.174], [1.2043, 0.163], [1.2217, 0.154], [1.2566, 0.154], [1.2741, 0.157],
      [1.2915, 0.177], [1.309, 0.18], [1.3265, 0.18], [1.3439, 0.177], [1.3614, 0.163], [1.3788, 0.151],
      [1.4137, 0.151], [1.4312, 0.154], [1.4486, 0.165], [1.4661, 0.18], [1.4835, 0.18], [1.501, 0.177],
      [1.5184, 0.16], [1.5359, 0.149], [1.5882, 0.149], [1.6057, 0.16], [1.6232, 0.18], [1.6406, 0.18],
      [1.6581, 0.165], [1.6755, 0.149], [1.693, 0.14], [1.7279, 0.14], [1.7453, 0.146], [1.7628, 0.163],
      [1.7802, 0.18], [1.7977, 0.157], [1.8151, 0.14], [1.8326, 0.132], [1.8675, 0.132], [1.885, 0.143],
      [1.9024, 0.16], [1.9199, 0.149], [1.9373, 0.132], [1.9548, 0.126], [1.9897, 0.126], [2.0071, 0.137],
      [2.0246, 0.154], [2.042, 0.168], [2.0595, 0.18], [2.7576, 0.18], [2.7751, 0.171], [2.7925, 0.165],
      [2.81, 0.157], [2.8274, 0.149], [2.8449, 0.143], [2.8623, 0.135], [2.8798, 0.129], [2.8972, 0.12],
      [2.9147, 0.112], [2.9322, 0.109], [2.9671, 0.109], [2.9845, 0.008], [3.002, 0.008]] });
}

/** The gun's mount inside the casing, its armoured cradle sleeve ahead of the casing's face with the boresight's box on it,
 * and the 152 mm tube. Gun frame. */
function addGun(P: TankBuilderPort): void {
  P.addGunExtra(sectionSolid([
    { z: -.40, ring: [[-.30, -.24], [.30, -.24], [.34, -.10], [.34, .20], [.26, .28], [-.26, .28], [-.34, .20], [-.34, -.10]] },
    { z: .48, ring: [[-.30, -.24], [.30, -.24], [.34, -.10], [.34, .20], [.26, .28], [-.26, .28], [-.34, .20], [-.34, -.10]] },
    { z: .62, ring: [[-.24, -.18], [.24, -.18], [.27, -.07], [.27, .14], [.20, .20], [-.20, .20], [-.27, .14], [-.27, -.07]] },
  ]));
  const sleeve = (z: number, k: number): SolidSection => ({ z, ring: [[-.13 * k, -.17 * k], [.13 * k, -.17 * k], [.19 * k, -.11 * k],
    [.19 * k, .12 * k], [.13 * k, .18 * k], [-.13 * k, .18 * k], [-.19 * k, .12 * k], [-.19 * k, -.11 * k]] });
  P.addGunExtra(sectionSolid([sleeve(.80, 1), sleeve(1.22, 1), sleeve(1.30, .86)]));
  P.addGunExtra(cylZ(.21, .05, 24), 0, 0, 1.25);
  P.addGunExtra(block(.12, .09, .26), 0, .225, 1.02);
  P.addGunExtra(block(.07, .05, .012), 0, .225, 1.156);
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
  addGun(P);
  P.topY = 1.12;
}

export const OBJECT477_MOLOT_PROFILES = { object477_molot: { build: buildObject477Molot } };
