// The T-14 152's field kit (owner 2026-11-05: "the t14 152 should look a lot more different to look like a true new
// variation of the normal t14 armata, should have a bunch of fuel canisters, new era, new machine gun tower, full net and
// ghillie etc", and "make the hulls much beter"): the 152 mm Armata as a heavily kitted field variant over the T-14's
// shared hull, running gear and turret shell (profiles/t14X.ts, unchanged). New explosive-reactive armour re-drawn on the
// T-14's own ERA plates (glacis_era_L/R, skirt_era_L/R): a staggered field of wedge cassettes over the glacis tiles and a
// two-by-three cassette facing on every skirt panel, each facing inside its panel's own outline (owner 2026-11-05: "also
// properly match sideskirts to hull side profiles"); a taller remote weapon tower with a 12.7 mm Kord in place of the
// T-14's low 7.62 mm station; two 200 L drums on a cradle hung from the bustle's rear face, jerry-can pairs in the
// bustle's roof rails and on a shelf in the stern's recess. The camouflage net is profiles/t14_152Suit.ts.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab } from './kit.ts';
import { antennaPart } from './antennaPart.ts';
import { captureAuxiliaryStock } from './auxiliaryStation.ts';
import { markEraFurniture, markEraHitFaces } from './eraHitFaces.ts';
import { fuelDrumHoop } from './chineseFuelDrum.ts';
import { stowagePart } from './stowagePart.ts';
import { T14X_RING } from './t14X.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY } = KIT;
type P3 = readonly [number, number, number];
const localY = (worldY: number) => worldY - T14X_RING.y;
const localZ = (worldZ: number) => worldZ - T14X_RING.z;
const slab = (c: readonly P3[]): THREE.BufferGeometry => orientedSlab(...c);

// ------------------------------------------------------------------------------------------------- explosive armour --

/** A cassette over a plane: its base quad `base` (four corners, counter-clockwise seen from outside), raised along `n`
 * by `t0` at the base quad's first edge (corners 0-1) and `t1` at its far edge (corners 2-3): a wedge that leans out. */
function cassette(base: readonly P3[], n: P3, t0: number, t1: number): THREE.BufferGeometry {
  const up = (p: P3, t: number): P3 => [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t];
  return slab([base[0]!, base[1]!, base[2]!, base[3]!, up(base[0]!, t0), up(base[1]!, t0), up(base[2]!, t1), up(base[3]!, t1)]);
}

/** The point `inset` in from each edge of a quad along its own edges (a lid's outline on a cassette's face). */
function insetQuad(q: readonly P3[], inset: number): P3[] {
  const c = [0, 1, 2].map((k) => q.reduce((s, p) => s + p[k]!, 0) / 4) as unknown as P3;
  return q.map((p) => {
    const d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
    const f = Math.max(0, (d - inset * 1.42) / d);
    return [c[0] + (p[0] - c[0]) * f, c[1] + (p[1] - c[1]) * f, c[2] + (p[2] - c[2]) * f] as P3;
  });
}

/** A cassette with its bolted lid: the wedge (hit faces outward), the lid 6 mm proud of its outer face, two lid bolts. */
function addCassette(P: TankBuilderPort, base: readonly P3[], n: P3, t0: number, t1: number, outward: P3): void {
  P.add('hull', markEraHitFaces(cassette(base, n, t0, t1), outward));
  const top: P3[] = base.map((p, i) => {
    const t = i < 2 ? t0 : t1;
    return [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t] as P3;
  });
  const lid = insetQuad(top, .028);
  P.addEquipment('hullDetail', markEraFurniture(cassette(lid.map((p) => [p[0] - n[0] * .002, p[1] - n[1] * .002, p[2] - n[2] * .002] as P3), n, .008, .008)));
  for (const [a, b] of [[0, 3], [1, 2]] as const) {
    const p = lid[a]!, q = lid[b]!, f = .2;
    const at: P3 = [p[0] + (q[0] - p[0]) * f + n[0] * .009, p[1] + (q[1] - p[1]) * f + n[1] * .009, p[2] + (q[2] - p[2]) * f + n[2] * .009];
    P.addEquipment('hullDark', markEraFurniture(box(.024, .024, .024)), at[0], at[1], at[2]);
  }
}

/**
 * The skirts' new ERA: each of the T-14's five skirt panels (t14X.ts addHullSides: 0.18 m boxes, outer face x 1.852,
 * from y 0.49 to the panel's own top, 1.66 m, the leading panel 1.505 m) carries a facing of six cassettes, two along by
 * three up, wedged 55 mm at the foot to 85 mm at the head so each course shades the one under it. The facing keeps the
 * panel's outline: 8 mm under its top, 10 mm over its foot and 5 mm in from both ends, seated 3 mm into its face, so the
 * skirt's top line along the hull side is the stock line, the facings' joints fall on the panels' own and no cassette
 * stands proud of the outline, short of it or off it.
 */
function addSkirtEra(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    P.destructibleCluster(`skirt_era_${side < 0 ? 'L' : 'R'}`, () => {
      for (let i = 0; i < 5; i++) {
        const z0 = -1.22 + i * .93, top = z0 > 2 ? 1.66 - (z0 - 2) * .31 : 1.66;
        const face = 1.852 - .003, gap = .014, zA = z0 + .0075, zB = z0 + .9125, yA = .50, yB = top - .008;
        const w = (zB - zA - gap) / 2, h = (yB - yA - 2 * gap) / 3;
        for (let col = 0; col < 2; col++) for (let row = 0; row < 3; row++) {
          const za = zA + col * (w + gap), zb = za + w, ya = yA + row * (h + gap), yb = ya + h;
          // base quad on the panel's face, counter-clockwise seen from outside, foot edge first
          const quad: P3[] = side > 0
            ? [[face, ya, zb], [face, ya, za], [face, yb, za], [face, yb, zb]]
            : [[-face, ya, za], [-face, ya, zb], [-face, yb, zb], [-face, yb, za]];
          addCassette(P, quad, [side, 0, 0], .055, .085, [side, 0, 0]);
        }
      }
    });
  }
}

/** The glacis tiles' top (t14X.ts addGlacisPanels: the long course's plane and the short course's). */
const longTop = (z: number) => 1.419614 - (z - 3.42) * .497925;
const shortTop = (z: number) => 1.471735 + (z - 3.13987) * (1.43102 - 1.471735) / (3.38505 - 3.13987);

/**
 * The glacis's new ERA: a staggered field of wedge cassettes laid over the T-14's seven long tiles and its short course
 * (t14X.ts addGlacisPanels, which stays under it), four courses up the plate, the second and fourth shifted half a
 * cassette with half cassettes closing their ends, so the field keeps the tiles' outline (x +-0.856, z 3.14 to 4.19)
 * and reads as bricks, not the stock's long strips. Each leans out 60 mm at its foot to 85 mm at its head; the gun's
 * -8 degree stop over the plate keeps more than 0.12 m over the tallest.
 */
function addGlacisEra(P: TankBuilderPort): void {
  const pitch = .2452, half = 3 * pitch + .12019, gap = .012;
  // courses: [z0 (foot, toward the bow), z1 (head), top(z), staggered]
  const courses: readonly (readonly [number, number, (z: number) => number, boolean])[] = [
    [4.190, 3.935, longTop, false], [3.925, 3.670, longTop, true], [3.660, 3.408, longTop, false],
    [3.383, 3.142, shortTop, true],
  ];
  for (const [zf, zh, topAt, stagger] of courses) {
    const slope = (topAt(zh) - topAt(zf)) / (zh - zf);
    const len = Math.hypot(1, slope), n: P3 = [0, 1 / len, -slope / len];
    const cells: [number, number][] = [];
    if (!stagger) for (let c = -3; c <= 3; c++) cells.push([c * pitch - pitch / 2 + gap / 2, c * pitch + pitch / 2 - gap / 2]);
    else {
      cells.push([-half, -3 * pitch - gap / 2]);
      for (let c = -3; c <= 2; c++) cells.push([(c + .5) * pitch - pitch / 2 + gap / 2, (c + .5) * pitch + pitch / 2 - gap / 2]);
      cells.push([3 * pitch + gap / 2, half]);
    }
    cells[0]![0] = Math.max(cells[0]![0], -half);
    cells[cells.length - 1]![1] = Math.min(cells[cells.length - 1]![1], half);
    for (const [x0, x1] of cells) {
      const y = (z: number) => topAt(z) - .003;
      // foot edge first (toward +z), counter-clockwise seen from above-front
      const quad: P3[] = [[x1, y(zf), zf], [x0, y(zf), zf], [x0, y(zh), zh], [x1, y(zh), zh]];
      P.destructibleCluster(`glacis_era_${(x0 + x1) / 2 < -1e-6 ? 'L' : 'R'}`, () => addCassette(P, quad, n, .06, .085, n));
    }
  }
}

// ------------------------------------------------------------------------------------------------------- the stern --

/**
 * Two pairs of 20 L cans on welded shelves in the stern's recess, outboard of the centre steps and inboard of the stern
 * lattices, their backs inside the stern's line (z -4.30; the T-14's hull length is kept) and their handles 1.59 m up,
 * under the 2A83's bore evacuator at its -6.5 degree stop over the stern with the gun-hull receipt's 25 mm to spare.
 * Each shelf is a 12 mm plate let into the raked stern plate on two gussets, with a lip behind the cans and a strap
 * round each pair.
 */
/** The raked stern plate's face at height y (t14X.ts addHull: the tub's stern stations, z -3.805 at 1.20 m, -3.703 at
 * 1.00 m, -3.602 at 0.80 m). */
const sternFaceZ = (y: number) => (y >= 1 ? -3.703 - (y - 1) * .51 : -3.602 - (y - .8) * .505);

function addSternCans(P: TankBuilderPort): void {
  const shelfY = 1.11, cz = -4.135, back = -4.315, front = sternFaceZ(shelfY) + .014, foot = .95;
  for (const side of [-1, 1]) {
    const x = side * .42;
    P.addEquipment('hullDetail', stowagePart(box(.35, .012, front - back)), x, shelfY - .006, (front + back) / 2);
    for (const gx of [x - .15, x + .15]) {
      const g = (s: number): P3[] => [[gx + s, shelfY - .004, front], [gx + s, shelfY - .004, -4.08],
        [gx + s, foot, sternFaceZ(foot) - .07], [gx + s, foot, sternFaceZ(foot) + .014]];
      P.addEquipment('hullDetail', stowagePart(slab([...g(-.006), ...g(.006)])));
    }
    P.addEquipment('hullDetail', stowagePart(box(.35, .05, .012)), x, shelfY + .025, back + .006);
    KIT.jerryCan(P, 'hullDetail', x, shelfY + .242, cz, 0);
    // the strap round the pair's waist
    for (const dz of [-.178, .178]) P.addEquipment('hullDark', stowagePart(box(.37, .03, .006)), x, shelfY + .25, cz + dz);
    for (const dx of [-.183, .183]) P.addEquipment('hullDark', stowagePart(box(.006, .03, .362)), x + dx, shelfY + .25, cz);
  }
}

// ------------------------------------------------------------------------------------------------- the turret's rear --

const DRUM_R = .295, DRUM_LEN = .88;

/** A closed band round the x axis (a strap), `width` wide and `depth` deep at radius r. */
function band(r: number, width: number, depth: number, segments = 24): THREE.BufferGeometry {
  const inner = r - depth, h = width / 2;
  return new THREE.LatheGeometry([[inner, -h], [r, -h], [r, h], [inner, h], [inner, -h]]
    .map(([a, b]) => new THREE.Vector2(a, b)), segments).rotateZ(Math.PI / 2);
}

/** One 200 L drum lying across the turret at (x, y, z), turret frame: shell, rolled end rims, two rolling hoops, the
 * bung on its outer end and the dark straps over its cradle's rails at `straps` (x). */
function addTurretDrum(P: TankBuilderPort, x: number, y: number, z: number, outer: number, straps: readonly number[]): void {
  P.addEquipment('turretDetail', stowagePart(cylX(DRUM_R, DRUM_LEN, 28)), x, y, z);
  for (const end of [-1, 1]) P.addEquipment('turretDetail', stowagePart(fuelDrumHoop(DRUM_R + .007, .024, .02, 24)), x + end * (DRUM_LEN / 2 - .012), y, z);
  for (const dx of [-.15, .15]) P.addEquipment('turretDetail', stowagePart(fuelDrumHoop(DRUM_R + .01, .022, .02, 24)), x + dx, y, z);
  for (const sx of straps) P.addEquipment('turretDark', stowagePart(band(DRUM_R + .006, .04, .012)), sx, y, z);
  P.addEquipment('turretDark', stowagePart(KIT.cylX(.03, .014, 12)), x + outer * (DRUM_LEN / 2 + .007), y + .17, z);
}

/**
 * Two 200 L drums across the bustle's rear face (z -2.78 world) on a welded cradle: three hanger brackets (one between
 * the drums on the rear face, one outboard of each on the bustle's rear chamfer) carry two cross rails the drums ride on,
 * a rear stop rail and a strap over each drum at each rail. The drums ride with the turret, behind the bustle, their
 * bottoms 0.29 m over the engine deck and its lattice through the whole traverse, clear of the 2A83 (which points the
 * other way). Turret frame.
 */
function addBustleDrums(P: TankBuilderPort): void {
  const yc = localY(2.36), zc = localZ(-3.10), railY = yc - Math.sqrt(DRUM_R ** 2 - .17 ** 2) - .025;
  for (const [x, faceZ, faceTop] of [[0, -2.775, 2.48], [-.935, -2.64, 2.40], [.935, -2.64, 2.40]] as const) {
    const t = x === 0 ? .008 : .007;
    const pts = (s: number): P3[] => [
      [x + s * t, localY(faceTop), localZ(faceZ + .01)], [x + s * t, localY(2.02), localZ(faceZ + .01)],
      [x + s * t, localY(2.02), localZ(-3.44)], [x + s * t, localY(2.10), localZ(-3.44)],
    ];
    const a = pts(-1), b = pts(1);
    P.addEquipment('turretDetail', stowagePart(slab([a[0]!, a[1]!, a[2]!, a[3]!, b[0]!, b[1]!, b[2]!, b[3]!])));
    // the rear stop post at the bracket's tail
    P.addEquipment('turretDetail', stowagePart(box(.04, .30, .04)), x, localY(2.20), localZ(-3.42));
  }
  for (const rz of [-2.93, -3.27]) P.addEquipment('turretDetail', stowagePart(box(1.90, .05, .05)), 0, railY, localZ(rz));
  P.addEquipment('turretDetail', stowagePart(box(1.90, .04, .04)), 0, localY(2.33), localZ(-3.42));
  for (const side of [-1, 1]) {
    const x = side * .46;
    addTurretDrum(P, x, yc, zc, side, [x - .21, x + .21]);
  }
}

/** Two jerry-can pairs standing in the bustle roof's stowage rails (x +-0.72, z -2.08 to -2.43 world), each on its own
 * base plate, behind the weapon tower and ahead of the rails' rear bar. Turret frame. */
function addBustleCans(P: TankBuilderPort): void {
  const roof = localY(2.55), z = localZ(-2.235);
  for (const x of [-.42, .42]) {
    P.addEquipment('turretDetail', stowagePart(box(.40, .012, .38)), x, roof + .006, z);
    KIT.jerryCan(P, 'turretDetail', x, roof + .012 + .242, z, 0);
  }
}

// -------------------------------------------------------------------------------------------- the roof and the tower --

/** The weapon tower's yaw axis on the roof (turret frame) and its station's name. */
const T14_152_TOWER = Object.freeze({ x: .40, z: localZ(-1.72), roof: localY(2.55), name: 't14_152KordTower' });

/**
 * The T-14's roof stations (t14X.ts addRoofEquipment with gun152) without its low 7.62 mm remote station and that
 * station's support box: the side columns of roof panels, the commander's panoramic sight, the two whips, the sensor
 * post and the bustle's stowage rails, at the T-14's own positions.
 */
function addRoofStations(P: TankBuilderPort): void {
  for (let row = 0; row < 3; row++) for (const col of [0, 2]) {
    const x = (col - 1) * .48, z = .12 - row * .49;
    P.snapGroup('t14-roof-panel', () => {
      P.addEquipment('turretDetail', box(.46, .017, .465), x, localY(2.563), localZ(z));
      for (const dx of [-.18, .18]) for (const dz of [-.17, .17]) {
        P.addEquipment('turretDark', cylY(.011, .011, .012, 6), x + dx, localY(2.574), localZ(z + dz));
      }
    }, { reachM: .06, mode: 'down' });
  }
  P.addEquipment('turretDetail', cylY(.2113, .3071, .055, 36), -.40938, localY(2.5375), localZ(-1.254));
  P.addEquipment('turretDetail', cylY(.21133, .21133, .249, 36), -.40938, localY(2.6805), localZ(-1.254));
  P.addEquipment('turretDetail', cylY(.198, .198, .061, 36), -.40938, localY(2.8355), localZ(-1.254));
  P.addEquipment('turretDetail', cylY(.19137, .19137, .201, 36), -.40938, localY(2.9665), localZ(-1.254));
  P.addEquipment('turretDetail', box(.1736, .24283, .08256), -.46588, localY(2.94737), localZ(-1.12036));
  P.addEquipment('turretGlass', box(.13, .17, .009), -.46588, localY(2.957), localZ(-1.0745));
  P.addEquipment('turretDetail', cylY(.197, .197, .013, 36), -.40938, localY(3.074), localZ(-1.254));
  for (const [x, z, height] of [[-.712, .156, .760], [.815, -2.346, 1.128]]) {
    P.addEquipment('turretDetail', cylY(.044, .055, .09, 14), x, localY(2.60), localZ(z));
    P.addEquipment('turretDark', antennaPart(cylY(.009, .013, height, 10)), x, localY(2.64 + height / 2), localZ(z));
  }
  P.addEquipment('turretDetail', cylY(.031, .040, .44, 12), .703, localY(2.771), localZ(.232));
  P.addEquipment('turretDark', box(.05, .060, .045), .703, localY(3.018), localZ(.232));
  for (const side of [-1, 1]) {
    P.addEquipment('turretDetail', box(.022, .022, .36), side * .72, localY(2.69), localZ(-2.25));
    for (const z of [-2.08, -2.42]) P.addEquipment('turretDetail', box(.022, .15, .022), side * .72, localY(2.615), localZ(z));
  }
  P.addEquipment('turretDetail', box(1.44, .022, .022), 0, localY(2.69), localZ(-2.43));
}

/**
 * The new weapon tower: an armoured octagonal column 0.6 m tall on a flared, bolted foot at the roof's rear right, a
 * slewing bearing on its head, and on it a remote 12.7 mm Kord station (FITTINGS.pintleMG, the fleet's Kord at true
 * scale on its riding cradle) whose turntable carries an armoured sight head (day and thermal windows) on the gun's left
 * and the drive box behind it on its right, all turning with the gun. The bore stands 0.95 m over the roof, over the
 * panoramic sight, the gun house and the cans at any bearing. Turret frame.
 */
function addWeaponTower(P: TankBuilderPort): void {
  const { x, z, roof, name } = T14_152_TOWER, oct = Math.PI / 8;
  const foot = roof - .005, flangeTop = foot + .05, collarTop = flangeTop + .09, colTop = collarTop + .45, bearingTop = colTop + .05;
  P.addEquipment('turretDetail', cylY(.25, .28, .05, 8), x, foot + .025, z, 0, oct);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    P.addEquipment('turretDark', cylY(.014, .014, .012, 6), x + Math.sin(a) * .232, flangeTop + .004, z + Math.cos(a) * .232);
  }
  P.addEquipment('turretDetail', cylY(.175, .235, .09, 8), x, flangeTop + .045, z, 0, oct);
  P.addEquipment('turretDetail', cylY(.168, .168, .45, 8), x, collarTop + .225, z, 0, oct);
  // the column's rear access door and its hinge bar, the cable conduit up its right-rear flat with two clamps
  const flat = .168 * Math.cos(oct);
  P.addEquipment('turretDark', box(.15, .28, .012), x, collarTop + .23, z - flat - .002);
  P.addEquipment('turretDetail', box(.016, .26, .02), x - .085, collarTop + .23, z - flat - .004);
  const cx = x + Math.sin(3 * Math.PI / 4) * (flat + .02), cz = z + Math.cos(3 * Math.PI / 4) * (flat + .02);
  P.addEquipment('turretDark', cylY(.02, .02, colTop - flangeTop, 8), cx, (colTop + flangeTop) / 2, cz);
  for (const t of [.3, .75]) P.addEquipment('turretDetail', box(.06, .025, .06), cx, flangeTop + (colTop - flangeTop) * t, cz, 0, Math.PI / 4);
  P.addEquipment('turretDetail', cylY(.205, .185, .05, 24), x, colTop + .025, z);
  // the turning head: turntable, the sight head on its arm (the gun's left, -x), the drive box behind on its right
  const finish = captureAuxiliaryStock(P, name);
  P.addEquipment('turretDetail', cylY(.20, .20, .03, 24), x, bearingTop + .015, z);
  P.addEquipment('turretDetail', box(.10, .05, .16), x - .25, bearingTop + .045, z + .02);
  P.addEquipment('turretDetail', slab([
    [x - .37, bearingTop + .07, z - .14], [x - .23, bearingTop + .07, z - .14], [x - .23, bearingTop + .07, z + .17], [x - .37, bearingTop + .07, z + .17],
    [x - .37, bearingTop + .30, z - .14], [x - .23, bearingTop + .30, z - .14], [x - .23, bearingTop + .30, z + .12], [x - .37, bearingTop + .30, z + .12],
  ]));
  P.addEquipment('turretDetail', box(.15, .012, .06), x - .30, bearingTop + .306, z + .14);
  P.addEquipment('turretDark', box(.11, .19, .008), x - .30, bearingTop + .185, z + .148, -Math.atan(.05 / .23));
  P.addEquipment('turretGlass', box(.08, .065, .006), x - .30, bearingTop + .235, z + .144, -Math.atan(.05 / .23));
  P.addEquipment('turretGlass', box(.065, .055, .006), x - .30, bearingTop + .14, z + .165, -Math.atan(.05 / .23));
  P.addEquipment('turretDetail', box(.12, .13, .16), x + .19, bearingTop + .095, z - .17);
  P.addEquipment('turretDark', cylX(.03, .03, 12), x + .265, bearingTop + .10, z - .17);
  finish();
  const weapon = FITTINGS.pintleMG({ mats: P.mats, cls: 'kord', scale: 1, remoteControlled: true, ridingCradle: true,
    tone: 'two-tone', elev: 0, ammo: true, shield: false, ring: false, barrelBridge: true, seed: 269152 });
  weapon.name = name;
  weapon.position.set(x, bearingTop + .03, z);
  P.turretG.add(weapon);
}

/** The whole field kit over the T-14 152's T-14 hull and turret shell. */
export function addT14_152FieldKit(P: TankBuilderPort): void {
  addSkirtEra(P);
  addGlacisEra(P);
  addSternCans(P);
  addRoofStations(P);
  addWeaponTower(P);
  addBustleDrums(P);
  addBustleCans(P);
}

/** The tower station's top (turret frame), for the build's topY. */
export const T14_152_TOWER_TOP = T14_152_TOWER.roof - .005 + .05 + .09 + .45 + .05 + .03 + .423;
