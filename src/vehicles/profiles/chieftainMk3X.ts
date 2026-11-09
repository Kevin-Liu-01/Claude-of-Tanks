// The Chieftain Mk 3 on the source-built Mk 5 X (chieftain5X.ts): the earlier tank on the same hull and turret
// castings. Release 268b (owner 2026-11-02: "the cheiftain mk 3 and mk 9s look identical and way way too smimilar to the
// inspirations, make them look much more different inn editing the turret and hull appearances to like like
// precessors"). The Mk 3 (1969-72) against the Mk 5 (1972):
// - the 12.7 mm L21 ranging gun over the main gun (Royal_Ordnance_L11; the laser sight replaced it from the Mk 3/3);
// - no large NBC case across the turret rear ("the large NBC pack that the Mk5 has fitted to the rear of the turret" is
//   the modellers' clearest Mk 3/Mk 5 difference): the original, smaller pack low on the bustle's rear wall inside an
//   open bar basket across the bustle (the 1968 Leusderheide Mk 2s: the grille-sided basket at the turret rear);
// - two jerry cans on the right of the turret where later marks carry a stowage box (kitmaker forum, the Mk 2 cue;
//   period-plausible on an early Mk 3);
// - Larkspur whips in sockets on the turret, without the tuning boxes the Mk 5 standard brought (kitmaker forum);
// - the early engine deck with fewer covers (armortek forum: "less deck covers and access covers") -
//   chieftain5XSourceHullEquipment.ts's early option;
// - the glacis splash board and the tubular rail behind it, and the nose's towing clevises (the Iranian Mk 3P, 1980s);
// - lifting eyes on the glacis corners and the turret's shoulders.
// Sources and photographs: ~/cot-lanes/italy-korea-bmp-267-evidence/research/chieftain3/. First-party: Kevin B. Liu.
import * as THREE from 'three';
import { antennaPart } from './antennaPart.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { chamferedCase, grabRail, liftingEye, periscopeHead, sightBox, stowedRods, tubeThrough } from './chieftainMarksX.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
type Add = (bucket: string, g: THREE.BufferGeometry, x: number, y: number, z: number, rx?: number, ry?: number, rz?: number) => void;
const { box, cylX, cylY, cylZ } = KIT;

/** A lathe about +Z from [radius, z] pairs (a closed profile turns into a solid of revolution). */
function latheZ(profile: readonly (readonly [number, number])[], segments: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), segments).rotateX(Math.PI / 2);
}

/** A welded case: a box whose top edges are chamfered (the Mk 5 X's caseSolid section). */
const caseSolid = chamferedCase;

/**
 * The L21 ranging gun on the main gun's cradle (it elevates with the gun and does not recoil with it): an armoured
 * housing seated in the crown of the root hood (2.027 at z 1.78 falling to 1.990 at 2.18), the .50 heavy barrel out of
 * its front, 0.9 m of it clear of the cover, and an open flash hider whose mouth is a real recess. The axis is parallel
 * to the bore, 17 cm over it, and clears the main tube's crown by 8-30 mm.
 */
function rangingGun(P: TankBuilderPort, trunnion: Point): void {
  const part = (bucket: string, g: THREE.BufferGeometry, x: number, y: number, z: number): void =>
    P.add(bucket, g, x - trunnion[0], y - trunnion[1], z - trunnion[2]);
  const x = -.004, y = 2.032;
  part('gunMount', caseSolid(.118, .100, .42), x, y + .006, 2.00);
  part('gunMount', latheZ([[0, 0], [.040, 0], [.040, .014], [.030, .046], [0, .046]], 16), x, y, 2.206);
  part('gunMountDark', cylZ(.0200, .86, 12), x, y, 2.66);
  // Flash hider: outer wall to the mouth, a lip and a 34 mm deep bore.
  part('gunMountDark', latheZ([[.0190, 0], [.0275, .008], [.0275, .086], [.0130, .086],
    [.0130, .052], [0, .052]], 14), x, y, 3.084);
}

/** The original NBC pack on the back of the turret: a 0.86 m case low on the bustle's rear wall (the Mk 5's is a
 * 1.44 m case standing to the roof line), its rear top edge rolled, its front seated 12 mm into the casting's rear
 * (z -1.659), its filter louvres and clamp handles on its rear face. */
function earlyNbcPack(add: Add): void {
  const x0 = -.43, x1 = .43, front = 1.647, rear = 1.925, bottom = 1.842, top = 2.182, roll = .10;
  const ring: [number, number][] = [[front, bottom], [rear, bottom], [rear, top - roll]];
  for (let k = 1; k < 6; k++) {
    const a = k * Math.PI / 12;
    ring.push([rear - roll + roll * Math.cos(a), top - roll + roll * Math.sin(a)]);
  }
  ring.push([front, top]);
  // the ring is drawn in (depth aft, height): turned so its loft runs along +X, depth lands on -Z
  const g = sectionSolid([x0, x1].map((z) => ({ z, ring: ring.map(([u, v]): [number, number] => [u, v]) }))).rotateY(Math.PI / 2);
  add('turretDetail', g, 0, 0, 0);
  const w = x1 - x0;
  for (let i = 0; i < 4; i++) add('turretDark', box(w * .56, .020, .014), 0, bottom + .07 + i * .05, -rear - .004);
  for (const dx of [-w * .40, w * .40]) add('turretDetail', box(.026, .060, .020), dx, top - .17, -rear - .008);
}

/** The open bar basket across the bustle behind the pack, closing the two side baskets' rear ends (z -1.721): rails
 * that carry on at each side basket's own floor and top heights (starboard 1.850/2.195, port 1.802/2.255), uprights
 * on the rear rail, floor bars, two feet bearing on the casting's rear, and a rolled tarpaulin and a kit bag inside. */
function rearBasket(add: Add): void {
  const x0 = -1.402, x1 = 1.686, front = -1.721, rear = -2.235;
  const low = (x: number): number => 1.850 + (1.802 - 1.850) * (x - x0) / (x1 - x0);
  const high = (x: number): number => 2.195 + (2.255 - 2.195) * (x - x0) / (x1 - x0);
  for (const y of [low, high]) {
    add('turretOpenLattice', tubeThrough([[x0, y(x0), rear], [x1, y(x1), rear]], .011, 8), 0, 0, 0);
    for (const x of [x0, x1]) add('turretOpenLattice', cylZ(.011, front - rear, 10), x, y(x), (front + rear) / 2);
  }
  for (let i = 0; i <= 10; i++) {
    const x = x0 + (x1 - x0) * i / 10;
    add('turretOpenLattice', cylY(.007, .007, high(x) - low(x), 8), x, (high(x) + low(x)) / 2, rear);
  }
  for (let i = 0; i < 6; i++) {
    const x = x0 + .11 + (x1 - x0 - .22) * i / 5;
    add('turretOpenLattice', box(.026, .012, front - rear), x, low(x), (front + rear) / 2);
  }
  for (const x of [-.70, .70]) add('turretDetail', box(.050, .080, .070), x, low(x) - .029, -1.690);
  add('turretCloth', sectionSolid([-.29, .29].map((dz) => ({ z: dz, ring: Array.from({ length: 10 }, (_, k): [number, number] => {
    const a = k * Math.PI / 5;
    return [Math.cos(a) * .115, Math.sin(a) * .105];
  }) }))).rotateY(Math.PI / 2), -.86, low(-.86) + .105, -1.98);
  add('turretCloth', caseSolid(.30, .25, .30), .80, low(.80) + .131, -1.99);
}

/** Two jerry cans in a welded rack on the right of the turret (where the Mk 5 carries its stowage box): a tray on two
 * brackets from the casting, the pressed cans (FITTINGS.jerryCans) facing outboard, a back bar to the casting. */
function jerryCans(P: TankBuilderPort, add: Add, pivot: Point): void {
  const x = -1.335, y = 1.832, z = -.205;
  add('turretDetail', box(.20, .016, .74), x + .005, y - .008, z);
  for (const dz of [-.30, .30]) add('turretDetail', box(.20, .060, .030), x + .045, y - .044, z + dz);
  add('turretDetail', box(.030, .030, .74), -1.205, y + .30, z);
  if (!P.mats || !P.turretG) return;
  const cans = FITTINGS.jerryCans({ mats: P.mats, count: 2, gap: .05, seed: 1969, slot: 'canvasCloth',
    rotation: [0, -Math.PI / 2, 0] });
  cans.name = 'chieftainMk3JerryCans';
  cans.position.set(x - pivot[0], y - pivot[1], z - pivot[2]);
  P.turretG.add(cans);
}

/** Larkspur whips in sockets on the casting's rear shoulders: a socket boss bedded in the stock and its insulator, no
 * tuning box. */
function larkspurWhips(add: Add): void {
  for (const [x, y, z] of [[.80, 2.268, -1.40], [-.84, 2.262, -1.38]]) {
    add('turretDetail', cylY(.050, .056, .040, 14), x, y + .012, z);
    add('turretDark', new THREE.LatheGeometry([[0, 0], [.034, 0], [.034, .030], [.022, .085], [.010, .130], [0, .130]]
      .map(([r, h]) => new THREE.Vector2(r, h)), 12), x, y + .030, z);
    add('turretDark', antennaPart(cylY(.0032, .010, 2.05, 8)), x, y + .155 + 1.025, z);
  }
}

/** The Mk 5 X tub's top at (x, z) (chieftain5XSourceHull.ts rows: [z, roof, crown]; the section falls by 0.3 crown to
 * x 0.398 and by the whole crown to the 0.978 edge). */
function hullRoof(x: number, z: number): number {
  const rows = [[1.25, 1.409, 0], [1.65, 1.523, .075], [2.15, 1.393, .090], [2.57, 1.324, .118], [2.73, 1.265, .023],
    [3.02, 1.141, .026]] as const;
  const i = Math.max(1, Math.min(rows.length - 1, rows.findIndex((r) => r[0] >= z)));
  const a = rows[i - 1], b = rows[i], t = Math.max(0, Math.min(1, (z - a[0]) / (b[0] - a[0])));
  const roof = a[1] + (b[1] - a[1]) * t, crown = a[2] + (b[2] - a[2]) * t, u = Math.abs(x);
  return u < .3976 ? roof - .3 * crown * u / .3976 : roof - crown * (.3 + .7 * Math.min(1, (u - .3976) / .5804));
}

/** The glacis: the splash board standing on the upper plate ahead of the driver's hatch, the tubular rail behind it on
 * its uprights (both under the gun's lowest sweep), the nose's towing clevises in the tow eyes and two lifting eyes at
 * the glacis corners. */
function glacis(P: TankBuilderPort): void {
  const add: Add = (bucket, g, x, y, z, rx = 0, ry = 0, rz = 0) => P.addEquipment(bucket, g, x, y, z, rx, ry, rz);
  const roof = (z: number, x = 0): number => hullRoof(x, z);
  // Splash board: 1.10 m, 13 cm tall, leaning 20 degrees forward, its foot 10 mm into the plate.
  add('hullDetail', box(1.10, .135, .014), 0, roof(2.66, .40) + .055, 2.66, -.35);
  for (const x of [-.48, 0, .48]) add('hullDetail', box(.014, .090, .080), x, roof(2.63, x) + .035, 2.625, -.35);
  // The rail: a 32 mm tube 11 cm over the plate, across ahead of the hatch and back along both edges.
  const rail: [number, number, number][] = [];
  for (const [x, z] of [[-.84, 2.06], [-.82, 2.36], [-.70, 2.50], [0, 2.53], [.70, 2.50], [.82, 2.36], [.84, 2.06]] as const) {
    rail.push([x, roof(z, x) + .110, z]);
  }
  add('hullDetail', tubeThrough(rail, .016, 8), 0, 0, 0);
  for (const [x, z] of [[-.84, 2.08], [-.74, 2.47], [0, 2.53], [.74, 2.47], [.84, 2.08]] as const) {
    add('hullDetail', cylY(.012, .012, .118, 6), x, roof(z, x) + .052, z);
  }
  // Towing clevises hung in the nose's tow eyes (torus .058 at x +-.862, y 1.047, z 3.218): a U through the eye's
  // lower bow and the pin across its mouth.
  for (const side of [-1, 1]) {
    const u = new THREE.TorusGeometry(.040, .014, 6, 10, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI);
    add('hullDetail', u, side * .862, .995, 3.218);
    add('hullDetail', cylX(.012, .118, 8), side * .862, .990, 3.218);
  }
  for (const side of [-1, 1]) liftingEye(add, 'hullDetail', side * .86, roof(2.30, .86) - .002, 2.30, Math.PI / 2);
  // The Mk 5 hull's rear deck leaves slots down to the ground (chieftain5 lists them in contig-hidden.json): 4 cm at
  // x +-0.93 between the louvre frame and the deck block (z -3.29..-3.57), and 5 cm across x +-0.80..0.92 between the
  // roof's rear edge and the louvres (z -3.29..-3.34). A gutter floor 2 cm thick closes both under them (270, B2 on
  // the Mk 3).
  for (const side of [-1, 1]) {
    add('hullDetail', box(.07, .02, .28), side * .93, 1.45, -3.43);
    add('hullDetail', box(.16, .02, .09), side * .85, 1.45, -3.32);
  }
}

/**
 * Release 269 (the owner, 2026-11-03: "for the cheiftain mk 3 and mk 9, add on all the equipment we had on teh turrets
 * from before onto the currennt mk 3 and mk 9"): the retired upper assembly's turret kit (chieftainMarksX.ts) seated on
 * the Mk 5 X casting, where that build carried it. What this Mk 3 already carries keeps its current part: the searchlight
 * box on the left (it takes the old light's lens), the smoke banks, the side baskets, the bar basket with its tarpaulin
 * and kit bag, the two Larkspur whips, the cupola's L37. The casting's surfaces are read from its rows
 * (chieftain5XSourceTurret.ts, chieftain5XSourceApplique.ts) and measured on the build (heights within 3 mm).
 */
function oldTurretKit(P: TankBuilderPort, place: Add, pivot: Point): void {
  // each part tagged with its item (chieftainFidelity.selftest.mjs reads the tags)
  const item = (name: string): Add => (bucket, g, x, y, z, rx = 0, ry = 0, rz = 0) => {
    g.userData.chieftainOldKit = name;
    place(bucket, g, x, y, z, rx, ry, rz);
  };
  const add = item('grabRail');
  searchlightLens(item('searchlightLens'));
  sideBin(item('sideBin'));
  // the loader's two periscopes ahead of his hatch (the old build's roof boxes ahead of the cupola), turned out a little
  periscopeHead(item('periscope'), 'turretDetail', 'turretGlass', .34, 2.311, .08, -.10);
  periscopeHead(item('periscope'), 'turretDetail', 'turretGlass', .57, 2.311, .06, .12);
  // the sight box beside the cupola, behind the loader's hatch, its window forward
  sightBox(item('sightBox'), 'turretDetail', 'turretDark', 'turretGlass', .10, 2.314, -.86, 0, .20, .14, .20);
  // the roof grab rails where the old build's bars crossed the roof shoulders: forward of the loader's periscopes and
  // beside the gunner's sight, and behind the cupola and the loader's hatch
  grabRail(add, 'turretDetail', [.30, 2.309, .40], [.64, 2.307, .40]);
  grabRail(add, 'turretDetail', [-.12, 2.307, .62], [-.44, 2.307, .62]);
  grabRail(add, 'turretDetail', [.42, 2.311, -1.15], [.80, 2.311, -1.15]);
  grabRail(add, 'turretDetail', [-.42, 2.311, -1.12], [-.80, 2.311, -1.12]);
  // the ammunition can from the old bustle shelf, on the bar basket's floor bar beside the NBC pack
  if (P.mats) KIT.ammoCan(P, 'turretDark', .429 - pivot[0], 1.9245 - pivot[1], -2.08 - pivot[2], 0);
}

/** The searchlight's lens on the front of the Mk 5 X's searchlight box (its front face at z 0.2376, x 0.953-1.744, y
 * 1.724-2.299): a 0.37 m bezel standing 6 cm proud, its glass 3.5 cm back in it over a dark reflector, the retaining
 * ring at its mouth and a brow over it (the old build's lens, ring and lid). Outboard of the starboard cheek cover. */
function searchlightLens(add: Add): void {
  const x = 1.37, y = 2.00, face = .2376;
  const bezel = new THREE.LatheGeometry([[.150, 0], [.186, 0], [.186, .058], [.172, .068], [.150, .068], [.150, 0]]
    .map(([r, h]) => new THREE.Vector2(r, h)), 28).rotateX(Math.PI / 2);
  add('turretDetail', bezel, x, y, face - .010);
  add('turretDark', cylZ(.151, .012, 28), x, y, face + .012);
  add('turretGlass', cylZ(.149, .004, 28), x, y, face + .024);
  add('turretDetail', KIT.torus(.166, .012, 28, 6), x, y, face + .055, Math.PI / 2);
  add('turretDetail', box(.42, .016, .09), x, y + .205, face + .040, -.25);
}

/** The side bin on the right of the turret ahead of the jerry cans (z 0.24-0.84; the old build's long side bins): a
 * welded box hung on the casting and the cheek cover, its inboard face 12 mm into them as they curve in (x 1.223 at
 * the foot to 1.113 at the lid at z 0.24, 1.278 to 1.198 at z 0.84), its outer face leaning in with the flank, a door with
 * its hinges and hasps, two shoes under it into the casting, and stowed rods in cradles on its lid. */
function sideBin(add: Add): void {
  const yb = 1.80, yt = 2.07, out0 = 1.52, out1 = 1.49;
  const rows: readonly (readonly [z: number, inLow: number, inTop: number])[] = [[.24, 1.223, 1.113], [.54, 1.250, 1.150],
    [.84, 1.278, 1.198]];
  const g = sectionSolid(rows.map(([z, inLow, inTop]) => {
    const ring: [number, number][] = [[inLow, yb], [out0, yb], [out1, yt - .028], [out1 - .028, yt], [inTop, yt]];
    return { z, ring: ring.reverse().map(([x, yy]): [number, number] => [-x, yy]) };
  }));
  add('turretDetail', g, 0, 0, 0);
  const lean = Math.atan2(out0 - out1, yt - .028 - yb), mid = (yb + yt - .028) / 2;
  const faceX = -(out0 + (out1 - out0) * (mid - yb) / (yt - .028 - yb));
  add('turretDetail', box(.010, .175, .48), faceX - .004, mid, .54, 0, 0, -lean);
  add('turretDark', box(.006, .19, .50), faceX - .001, mid, .54, 0, 0, -lean);
  for (const z of [.38, .70]) {
    add('turretDark', cylZ(.011, .07, 8), faceX - .014, mid + .094, z);
    add('turretDark', box(.016, .034, .022), faceX - .016, mid - .070, z);
  }
  for (const z of [.30, .78]) add('turretDetail', box(.26, .030, .060), -1.355, yb - .012, z);
  stowedRods(add, 'turretDetail', 'turretDark', -1.35, yt, .58, .66);
}

export function addChieftainMk3Kit(P: TankBuilderPort, pivot: Point, trunnion: Point): void {
  const add: Add = (bucket, g, x, y, z, rx = 0, ry = 0, rz = 0) =>
    P.addEquipment(bucket, g, x - pivot[0], y - pivot[1], z - pivot[2], rx, ry, rz);
  rangingGun(P, trunnion);
  earlyNbcPack(add);
  rearBasket(add);
  jerryCans(P, add, pivot);
  larkspurWhips(add);
  for (const side of [-1, 1]) liftingEye(add, 'turretDetail', side * .78, 2.282, .55, 0);
  glacis(P);
  oldTurretKit(P, add, pivot);
  // release 269 (the owner, 2026-11-03: "for the mk3 add. abunch of nts and ghillie on the guns and turret and hull
  // coverinng all suerfaces"): the field net, garnish and barrel scrim (ghillieFleetSuits.ts chieftain3), laid on the
  // assembled build
  addVehicleGhillieSuit(P);
}
