// BMPT Terminator weapon module: the original Ob'yekt 199 "Ramka" station of the 2009-2013 standard (the Russian Arms
// Expo 2009 vehicle, the Engineering Technologies 2012 vehicle and Kazakhstan's 2015 parade vehicles;
// docs/references/tanks/bmpt_terminator.md). 267 (lane bmpt-family-267, builder T). Its look is not the 2018 serial's
// armoured hammerhead (bmptT90Station.ts): one compact rounded armoured body, a box-like base carrying two rounded humps
// (the cannons' cradle housings) close either side of the twin 2A42 30 mm, each cannon in its own canvas-bagged mantlet
// with a multi-baffle muzzle brake; on the common trunnion through the humps, outside each, a compact housing carrying a
// pair of OPEN 9M120 Ataka tubes with their end caps (two a side, one over the other). The commander's panoramic sight
// stands on the right hump, the meteo sensor on the left one; the gunner's big square sight block with its window stands
// at the module's front below the left-hand (vehicle's left) cannon, the commander's stowage box beside it, the two
// hatches on the low base between them and the humps (photos 04, 07, 08, 10, 11, 13, 15).
// Round 2 (the coordinator's two blind photo critics on round 1: "two tall slim flat-sided pillars on an oversized round
// drum", "a recessed black slot between them"): the pillars are the humps of one body, the drum a low compact base, the
// slot closed by the cradle and a block under it; the box tips are baffle brakes in bagged mantlets, the tall arm fins
// compact trunnion housings at tube height.
//
// The cradle and both Ataka housings ride the gun group (gunG), so the launchers elevate with the cannons (their published
// arc is +25/-5; the game's one gun pitch carries them through the cannons' +45/-5). Launch exits: fleetLauncherMuzzles.ts
// bmpt_terminator (gun frame, these ATAKA numbers). Twin bores: spec.gun.muzzles at x +-RAMKA_BARREL_X.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, FITTINGS } from './kit.ts';
import { mount } from './fittingMount.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { weaponAssembly } from './weaponStock.ts';
import { hull } from './bmptT90Station.ts';

type P3 = readonly [number, number, number];

/** The base's yaw axis in the hull frame: on the T-72 hull roof (1.5295), 0.51 m aft of the T-72's own ring, where the
 * photographs stand the module over the rearmost road wheels (side views 07, 09, 14, 15). */
export const RAMKA_RING: P3 = Object.freeze([0, 1.5295, -0.40] as const);
/** The common trunnion of the cradle and both Ataka housings, from the yaw axis (turret frame). */
export const RAMKA_TRUNNION: P3 = Object.freeze([0, 0.95, -0.90] as const);
/** The twin 2A42 bores, either side of the cradle's centre line (gun frame). */
export const RAMKA_BARREL_X = 0.15;
/** The bore mouths' face (gun frame): the baffle brakes' end rings with their dark bore discs flush in them (the factory
 * carves each bore from that rim). */
export const RAMKA_MUZZLE_Z = 2.711;
/** The open Ataka tubes in the gun frame: column x, the two axes (upper, lower), radius, rear and front ends. */
export const RAMKA_ATAKA = Object.freeze({ x: 0.95, ys: [0.135, -0.135] as const, r: 0.08, rearZ: 0.20, frontZ: 2.00 });

/** The low base's deck (turret frame). */
const BASE_TOP_Y = 0.16;
/** The body's box-like lower part under the humps: half-width, rear and front, top. */
const BODY = Object.freeze({ w: 0.74, rear: -1.02, front: -0.15, top: 0.52 });
/** Each hump (cradle housing): inner and outer face, foot (into the body), crown, rear and front; its corner radii. */
const HUMP = Object.freeze({ inner: 0.19, outer: 0.72, foot: 0.50, top: 1.15, rear: -1.38, front: -0.21, rOut: 0.20, rIn: 0.02 });
/** The cradle's half-width (1 cm off the humps' inner faces), its run from the trunnion and its domed crown's peak over
 * the trunnion, 3.5 cm over the humps' crowns (gun frame). */
const CRADLE = Object.freeze({ w: 0.18, rear: -0.32, front: 0.70, crown: 0.235 });
/** Behind the cradle, the radius about the trunnion the module's rear wall between the humps keeps (3 cm outside the
 * cradle's rear corners at every pitch). */
const BRIDGE_R = 0.43;

/** Counter-clockwise (x, y) ring of a box section with chamfered top corners, seen from +z. */
function chamferedRing(x0: number, x1: number, bottom: number, top: number, chamfer: number): SectionPoint[] {
  return [[x0, bottom], [x1, bottom], [x1, top - chamfer], [x1 - chamfer, top], [x0 + chamfer, top], [x0, top - chamfer]];
}

/** Counter-clockwise ring of the cradle's section: flat sides to a shoulder, a domed crown peaking at `crown`. */
function domeRing(w: number, bottom: number, shoulder: number, crown: number): SectionPoint[] {
  const k = Math.min(0.035, (crown - shoulder) * 0.6);
  return [[-w, bottom], [w, bottom], [w, shoulder], [w - 0.03, shoulder + k], [0.06, crown], [-0.06, crown],
    [-w + 0.03, shoulder + k], [-w, shoulder]];
}

/** Counter-clockwise twelve-point ellipse ring (x, y) round (cx, cy). */
function ellipseRing(cx: number, cy: number, w: number, h: number): SectionPoint[] {
  return Array.from({ length: 12 }, (_, k) => {
    const a = -Math.PI / 2 + k * Math.PI / 6;
    return [cx + w * Math.cos(a), cy + h * Math.sin(a)] as const;
  });
}

/** A regular polygon ring at height y (x, y, z points), first corner off the +z axis by half a step. */
function ring(radius: number, y: number, sides: number): P3[] {
  return Array.from({ length: sides }, (_, k) => {
    const a = Math.PI / sides + k * 2 * Math.PI / sides;
    return [radius * Math.sin(a), y, radius * Math.cos(a)] as P3;
  });
}

/** One hump's cross-section for its side: the rounded-off armour box (a large radius on the outer top edge, a small one on
 * the inner), its crown lowered by `drop` and its walls moved in by `inset` (the rounded front and the rear chamfer). */
function humpRing(side: number, drop: number, inset: number): SectionPoint[] {
  const x0 = HUMP.inner + inset, x1 = HUMP.outer - inset, yb = HUMP.foot, yt = HUMP.top - drop;
  const pts: SectionPoint[] = [[x0, yb], [x1, yb]];
  for (let k = 0; k <= 4; k++) {
    const a = k * Math.PI / 8;
    pts.push([x1 - HUMP.rOut + HUMP.rOut * Math.cos(a), yt - HUMP.rOut + HUMP.rOut * Math.sin(a)]);
  }
  for (let k = 0; k <= 2; k++) {
    const a = Math.PI / 2 + k * Math.PI / 4;
    pts.push([x0 + HUMP.rIn + HUMP.rIn * Math.cos(a), yt - HUMP.rIn + HUMP.rIn * Math.sin(a)]);
  }
  const m = pts.map(([x, y]) => [side * x, y] as const);
  return side < 0 ? m.reverse() : m;
}

function addBaseAndBody(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  // The low compact base on the ring: its collar in the well, its underside 35 mm over the roof (the seat's seam).
  P.add('turret', cylY(0.86, 0.88, 0.11, 32), 0, -0.015, 0);
  P.add('turret', hull([...ring(0.92, 0.035, 24), ...ring(0.88, BASE_TOP_Y, 24)]));
  P.add('turretDark', cylY(0.915, 0.915, 0.012, 24), 0, 0.041, 0);
  // the vision blocks along the base's front quarters (photo 15), facing out
  for (const deg of [-70, -50, 50, 70]) {
    const a = deg * Math.PI / 180, x = 0.80 * Math.sin(a), z = 0.80 * Math.cos(a);
    P.add('turret', box(0.13, 0.07, 0.09), x, BASE_TOP_Y + 0.03, z, 0, a, 0);
    P.add('turretGlass', box(0.10, 0.035, 0.012), x + 0.046 * Math.sin(a), BASE_TOP_Y + 0.035, z + 0.046 * Math.cos(a), 0, a, 0);
  }
  // The body: the box-like lower part under the humps, its top edges chamfered, its ends chamfered.
  const { w, rear, front, top } = BODY, c = 0.05;
  const section = (inset: number) => chamferedRing(-w + inset, w - inset, BASE_TOP_Y - 0.01, top - inset, c);
  P.add('turret', sectionSolid([{ z: rear, ring: section(0.04) }, { z: rear + 0.04, ring: section(0) },
    { z: front - 0.04, ring: section(0) }, { z: front, ring: section(0.04) }]));
  // The humps: the cannons' cradle housings, rounded off over their crowns and their fronts, one each side of the cradle.
  for (const side of [-1, 1]) {
    const hump = sectionSolid([
      { z: HUMP.rear, ring: humpRing(side, 0.05, 0.03) }, { z: HUMP.rear + 0.04, ring: humpRing(side, 0, 0) },
      { z: -0.44, ring: humpRing(side, 0, 0) }, { z: -0.32, ring: humpRing(side, 0.05, 0.005) },
      { z: -0.25, ring: humpRing(side, 0.14, 0.015) }, { z: HUMP.front, ring: humpRing(side, 0.25, 0.03) },
    ]);
    hump.userData.rangeSilhouette = true;
    P.add('turret', hump);
    // the crown's bolted cover, its four bolts and a lifting eye
    P.add('turretDetail', box(0.30, 0.016, 0.80), side * 0.40, HUMP.top + 0.004, -0.88);
    for (const z of [-0.52, -1.30]) for (const dx of [-0.11, 0.11]) {
      P.add('turretDark', cylY(0.014, 0.014, 0.012, 6), side * 0.40 + dx, HUMP.top + 0.016, z);
    }
    P.add('turretDetail', KIT.torus(0.035, 0.009, 14, 6).rotateZ(Math.PI / 2), side * 0.48, HUMP.top + 0.045, -0.50);
  }
  // Under the cradle's front, between the humps' fronts, the block that closes the body there (its top 5 cm under the
  // cradle's lowest pass at full depression); the cradle's breech swings down behind it, open to the rear (photo 08).
  P.add('turret', box(0.39, 0.16, 0.42), 0, HUMP.foot + 0.08, -0.41);
  P.add('turretDark', KIT.cylX(0.010, 0.36, 8), 0, HUMP.foot + 0.165, -0.24);
  // Behind the cradle, the rear wall that joins the humps into one body, from their feet (onto the body's rear edge) to
  // their crowns: its front an arc about the trunnion 3 cm clear of the cradle's rear at every pitch, so the receiver
  // swings down inside it as the cannons elevate.
  const [, ty, tz] = RAMKA_TRUNNION, arc = (y: number) => -Math.sqrt(BRIDGE_R * BRIDGE_R - y * y), foot = HUMP.foot - ty;
  const gun: Array<readonly [number, number]> = [[HUMP.rear - tz, foot], [BODY.rear + 0.02 - tz, foot],
    ...[-0.40, -0.35, -0.30, -0.25, -0.15, -0.05, 0.05, 0.10, 0.15].map(y => [arc(y), y] as const),
    [arc(HUMP.top - ty), HUMP.top - ty], [HUMP.rear + 0.04 - tz, HUMP.top - ty], [HUMP.rear - tz, HUMP.top - ty - 0.05]];
  let area = 0;
  for (let i = 0; i < gun.length; i++) area += gun[i][0] * gun[(i + 1) % gun.length][1] - gun[(i + 1) % gun.length][0] * gun[i][1];
  const outline = (area > 0 ? gun : [...gun].reverse()).map(([z, y]) => [z + tz, y + ty] as const);
  const bridge = sectionSolid([{ z: -(HUMP.inner + 0.01), ring: outline }, { z: HUMP.inner + 0.01, ring: outline }]).rotateY(-Math.PI / 2);
  bridge.userData.rangeSilhouette = true;
  P.add('turret', bridge);
}

function addCannonPlant(P: TankBuilderPort): void {
  const { box, cylX, cylY, cylZ } = KIT;
  // The common cradle between the humps (2.5 cm off their inner faces): the tall receiver box over both breeches at its
  // rear, swinging down into the open space behind the closing block as the cannons elevate, lower towards its mouth.
  const { w, rear, front, crown } = CRADLE;
  // the cradle's crown fills the space between the humps' crowns and rounds down at its front with theirs into the
  // mantlet face both cannons leave from
  P.addGunExtra(sectionSolid([
    { z: rear, ring: domeRing(w - 0.02, -0.20, 0.13, crown - 0.04) },
    { z: rear + 0.03, ring: domeRing(w, -0.20, 0.195, crown) },
    { z: 0.50, ring: domeRing(w, -0.20, 0.195, crown) },
    { z: 0.58, ring: domeRing(w, -0.19, 0.15, 0.19) },
    { z: 0.65, ring: domeRing(w, -0.17, 0.03, 0.09) },
    { z: front, ring: domeRing(w - 0.01, -0.15, -0.08, -0.03) },
  ]), 0, 0, 0);
  // under the bags, the mantlet's lower plate on a bracket from the cradle's front, closing the space between the humps'
  // fronts over the closing block (2 cm ahead of that block at full depression)
  P.addGunExtra(box(0.34, 0.17, 0.03), 0, -0.215, 0.765);
  P.addGunExtra(box(0.30, 0.03, 0.08), 0, -0.145, 0.72);
  for (const x of [-0.12, 0, 0.12]) P.addGunExtraDark(cylZ(0.012, 0.012, 6), x, -0.255, 0.784);
  P.addGunExtraDark(cylX(0.05, 0.46, 12), 0, 0, 0);                        // trunnion pins into both humps
  P.addGunExtra(box(0.12, 0.012, 0.56), 0, crown + 0.004, 0.08);            // cover strip along the crown
  for (const z of [-0.14, 0.30]) for (const x of [-0.04, 0.04]) P.addGunExtraDark(cylY(0.012, 0.012, 0.012, 6), x, crown + 0.012, z);
  for (const x of [-0.10, 0.10]) {                                          // lifting handles on the receiver's back
    P.addGunExtraDark(beamBetween([x - 0.04, 0.08, rear + 0.005], [x - 0.04, 0.08, rear - 0.04], 0.010));
    P.addGunExtraDark(beamBetween([x + 0.04, 0.08, rear + 0.005], [x + 0.04, 0.08, rear - 0.04], 0.010));
    P.addGunExtraDark(beamBetween([x - 0.04, 0.08, rear - 0.04], [x + 0.04, 0.08, rear - 0.04], 0.010));
  }
  for (const side of [-1, 1]) {
    const barrel = side < 0 ? 0 : 1, x = side * RAMKA_BARREL_X;
    // each cannon's own rounded canvas-bagged mantlet (photo 10) out of the common rounded front, bulging and sagging a
    // little, gathered to the collar; within the cradle's width until it is ahead of the humps' fronts
    P.add('gunMountCloth', sectionSolid([
      { z: 0.69, ring: ellipseRing(x, -0.01, 0.030, 0.085) },
      { z: 0.73, ring: ellipseRing(x, -0.01, 0.072, 0.110) },
      { z: 0.80, ring: ellipseRing(x, -0.015, 0.087, 0.125) },
      { z: 0.88, ring: ellipseRing(x, -0.02, 0.087, 0.120) },
      { z: 0.96, ring: ellipseRing(x, -0.012, 0.072, 0.090) },
      { z: 1.03, ring: ellipseRing(x, 0, 0.052, 0.054) },
    ]));
    for (const z of [0.84, 0.92]) {                                       // the bag's two tie straps
      P.add('gunMountDark', sectionSolid([{ z: z - 0.007, ring: ellipseRing(x, -0.018, 0.091, 0.127) },
        { z: z + 0.007, ring: ellipseRing(x, -0.018, 0.091, 0.127) }]));
    }
    P.add(`gunBarrel${barrel}`, cylZ(0.055, 0.06, 16), x, 0, 1.05);         // collar
    P.add(`gunBarrel${barrel}`, cylZ(0.045, 0.30, 14), x, 0, 1.22);         // thick root
    P.add(`gunBarrel${barrel}`, cylZ(0.035, 1.16, 14), x, 0, 1.94);         // barrel
    // the cylindrical multi-baffle muzzle brake: its body, three baffle rings, the end ring and the bore disc
    P.add(`gunBarrel${barrel}`, cylZ(0.048, 0.22, 16), x, 0, 2.60);
    for (const z of [2.525, 2.585, 2.645]) P.add(`gunBarrel${barrel}Dark`, cylZ(0.064, 0.022, 16), x, 0, z);
    P.add(`gunBarrel${barrel}`, cylZ(0.056, 0.02, 16), x, 0, 2.70);
    P.add(`gunBarrel${barrel}Dark`, cylZ(0.022, 0.012, 12), x, 0, RAMKA_MUZZLE_Z - 0.006);
  }
  P.muzzleZ = RAMKA_MUZZLE_Z;
}

function addAtakaPairs(P: TankBuilderPort): void {
  const { box, cylX, cylZ } = KIT, A = RAMKA_ATAKA;
  const length = A.frontZ - A.rearZ, midZ = (A.rearZ + A.frontZ) / 2;
  for (const side of [-1, 1]) {
    const x = side * A.x;
    // The hub on the hump's outer face (a disc about the trunnion axis) and the compact trunnion housing between the two
    // tubes at their height, which carries them.
    P.addGunExtra(cylX(0.13, 0.115, 28), side * 0.7175, 0, 0);
    P.addGunExtra(box(0.15, 0.20, 0.46), side * 0.845, 0, 0.13);
    P.addGunExtraDark(cylX(0.05, 0.03, 16), side * 0.93, 0, 0);             // the housing's bearing nut
    // the spine between the tubes from the housing forward, and the two quick-release clamps that grip both (photo 12)
    P.addGunExtra(box(0.10, 0.06, 1.22), x, 0, 0.82);
    for (const z of [0.48, 1.30]) {
      P.addGunExtra(box(0.14, 0.15, 0.10), x, 0, z);
      P.addGunExtraDark(box(0.012, 0.03, 0.08), side * 1.026, 0, z);        // the release lever
    }
    for (const y of A.ys) {
      // the transport-launch tube: a thicker rear sleeve over the body, two strap bands, the end caps proud of both ends
      P.addGunExtra(cylZ(A.r, length, 20), x, y, midZ);
      P.addGunExtra(cylZ(A.r + 0.007, 0.56, 20), x, y, A.rearZ + 0.30);
      for (const z of [1.30, 1.72]) P.addGunExtra(cylZ(A.r + 0.005, 0.03, 20), x, y, z);
      for (const end of [A.rearZ, A.frontZ]) {
        P.addGunExtra(cylZ(A.r + 0.008, 0.028, 20), x, y, end + (end === A.frontZ ? 0.008 : -0.008));
        P.addGunExtraDark(cylZ(A.r - 0.012, 0.012, 20), x, y, end + (end === A.frontZ ? 0.026 : -0.026));
      }
    }
  }
  // guided-load rule (owner 2026-09-18): the spec's Ataka load is at least one round per tube; the profile publishes its
  // tube census for guidedLauncherTubes.selftest
  P.turretG.userData.launcherTubes = A.ys.length * 2;
}

function addSightsAndKit(P: TankBuilderPort): void {
  const { box, cylY, cylZ } = KIT, top = HUMP.top;
  // The commander's panoramic sight on the right hump (-x, the vehicle's right): a square pedestal, its collar, the drum
  // and the head with its big forward window and a lid, the module's highest point (photos 03, 04, 10).
  const px = -0.40, pz = -1.10;
  const pedestal = box(0.30, 0.31, 0.30);
  pedestal.userData.rangeSilhouette = true;
  P.add('turret', pedestal, px, top + 0.155, pz);
  P.add('turretDetail', box(0.36, 0.03, 0.36), px, top + 0.325, pz);
  P.add('turret', cylY(0.175, 0.175, 0.10, 28), px, top + 0.39, pz);
  const head = box(0.30, 0.30, 0.30);
  head.userData.rangeSilhouette = true;
  P.add('turret', head, px, top + 0.59, pz);
  P.add('turretGlass', box(0.20, 0.20, 0.02), px, top + 0.59, pz + 0.155);
  P.add('turretDetail', box(0.32, 0.025, 0.32), px, top + 0.7525, pz);
  P.add('turretDetail', box(0.18, 0.20, 0.03), px, top + 0.155, pz - 0.162);   // the pedestal's rear door
  // The left hump: the meteo sensor's round housing at the rear (its face aft, photo 08) and its tall post.
  P.add('turretDetail', box(0.12, 0.10, 0.14), 0.40, top + 0.05, -1.22);
  P.add('turret', cylZ(0.105, 0.20, 20), 0.40, top + 0.18, -1.22);
  P.add('turretDetail', cylZ(0.090, 0.012, 20), 0.40, top + 0.18, -1.326);
  P.add('turret', cylY(0.032, 0.040, 0.42, 12), 0.47, top + 0.21, -0.92);
  P.add('turretDetail', cylY(0.050, 0.050, 0.07, 12), 0.47, top + 0.445, -0.92);
  // Antennae: one on each hump's crown, clear of the pano head.
  for (const [x, z, h, seed] of [[0.33, -0.62, 1.10, 3920], [-0.33, -0.62, 0.80, 3921]] as const) {
    P.add('turretDetail', cylY(0.038, 0.046, 0.05, 12), x, top + 0.025, z);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.011, rake: x > 0 ? -0.04 : 0.04, seed }),
      x, top + 0.045, z);
  }
  // The gunner's sight: the big square armoured block at the module's front below the left cannon (+x; photo 10), its large
  // window in a dark frame under a brow, a round sensor head on either side.
  const gx = 0.27, gy = BASE_TOP_Y + 0.24, gz = 0.48;
  const sight = box(0.40, 0.48, 0.36);
  sight.userData.rangeSilhouette = true;
  P.add('turret', sight, gx, gy, gz);
  P.add('turretDark', box(0.32, 0.28, 0.012), gx, gy + 0.03, gz + 0.181);
  P.add('turretGlass', box(0.28, 0.24, 0.02), gx, gy + 0.03, gz + 0.185);
  P.add('turretDetail', box(0.44, 0.03, 0.12), gx, gy + 0.255, gz + 0.14);
  for (const dx of [-0.25, 0.25]) {
    P.add('turret', cylZ(0.065, 0.14, 16), gx + dx, gy + 0.06, gz + 0.07);
    P.add('turretGlass', cylZ(0.045, 0.012, 16), gx + dx, gy + 0.06, gz + 0.142);
  }
  // The commander's stowage box on the front right: lid, two latches.
  P.add('turret', box(0.40, 0.28, 0.30), -0.26, BASE_TOP_Y + 0.14, 0.47);
  P.add('turretDetail', box(0.42, 0.02, 0.32), -0.26, BASE_TOP_Y + 0.285, 0.47);
  for (const dx of [-0.10, 0.10]) P.add('turretDark', box(0.04, 0.06, 0.014), -0.26 + dx, BASE_TOP_Y + 0.20, 0.622);
  // The commander's and gunner's hatches on the base between the front kit and the body (photos 13, 15).
  for (const side of [-1, 1]) {
    const hx = side * 0.52, hz = 0.08;
    P.add('turret', cylY(0.20, 0.215, 0.06, 24), hx, BASE_TOP_Y + 0.03, hz);
    P.add('turretDetail', cylY(0.17, 0.185, 0.035, 24), hx, BASE_TOP_Y + 0.075, hz);
    P.add('turretDark', box(0.05, 0.03, 0.10), hx + side * 0.15, BASE_TOP_Y + 0.07, hz - 0.08);   // the hinge
  }
  // the number on the meteo sensor's rear face (photo 08)
  P.decal('turret', 'number', '01', 0.09, [0.40, top + 0.18, -1.333], Math.PI);
}

/** The Ramka station on an empty turret rig (the caller builds the hull without a turret). */
export function buildRamkaStation(P: TankBuilderPort): void {
  P.turretG.scale.set(1, 1, 1);
  P.gunG.scale.set(1, 1, 1);
  P.turretG.position.set(...RAMKA_RING);
  P.gunG.position.set(...RAMKA_TRUNNION);
  addBaseAndBody(P);
  addCannonPlant(P);
  // the real vehicle carries two 2A42, four Ataka and a coaxial PKTM, and no roof machine gun (roofWeaponPolicy.ts)
  weaponAssembly(P, () => addAtakaPairs(P));
  addSightsAndKit(P);
  P.topY = Math.max(P.topY || 0, HUMP.top + 0.765);
}
