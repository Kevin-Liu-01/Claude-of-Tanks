// The T-14 152's field kit (owner 2026-11-05: "the t14 152 should look a lot more different to look like a true new
// variation of the normal t14 armata, should have a bunch of fuel canisters, new era, new machine gun tower, full net and
// ghillie etc", and "make the hulls much beter"): the 152 mm Armata as a heavily kitted field variant over the T-14's
// shared hull, running gear and turret shell (profiles/t14X.ts, unchanged). New explosive-reactive armour re-drawn on the
// T-14's own ERA plates (glacis_era_L/R, skirt_era_L/R): a framed field of wedge and gabled cassettes of several sizes
// over the glacis tiles and a framed, three-course facing on every skirt panel, each inside its panel's own outline
// (owner 2026-11-05: "also properly match sideskirts to hull side profiles"); a taller remote weapon tower with a 12.7 mm
// Kord in place of the T-14's low 7.62 mm station; four 200 L drums on brackets along the bustle's flanks, jerry-can pairs
// in the bustle's roof rails and on a shelf in the stern's recess. The camouflage net is profiles/t14_152Suit.ts.
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

const add3 = (p: P3, q: P3, k = 1): P3 => [p[0] + q[0] * k, p[1] + q[1] * k, p[2] + q[2] * k];
const mid3 = (p: P3, q: P3): P3 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];

/** A wedge cassette (hit faces outward): `t0` thick at its base quad's first edge, `t1` at its far edge. */
function wedge(P: TankBuilderPort, base: readonly P3[], n: P3, t0: number, t1: number, outward: P3): void {
  P.add('hull', markEraHitFaces(cassette(base, n, t0, t1), outward));
}

/** A cassette's lid on its outer face, 6 mm proud, 28 mm in from the cassette's edges. */
function lid(P: TankBuilderPort, base: readonly P3[], n: P3, t0: number, t1: number): void {
  const top = base.map((p, i) => add3(p, n, i < 2 ? t0 : t1));
  P.addEquipment('hullDetail', markEraFurniture(cassette(insetQuad(top, .028).map((p) => add3(p, n, -.002)), n, .008, .008)));
}

/** A gabled cassette: two wedges meeting at a ridge across its middle, `edge` thick at its foot and head, `ridge` at the
 * ridge (base corners 0-1 its foot, 2-3 its head). */
function gable(P: TankBuilderPort, base: readonly P3[], n: P3, edge: number, ridge: number, outward: P3): void {
  const m0 = mid3(base[0]!, base[3]!), m1 = mid3(base[1]!, base[2]!);
  wedge(P, [base[0]!, base[1]!, m1, m0], n, edge, ridge, outward);
  wedge(P, [m0, m1, base[2]!, base[3]!], n, ridge, edge, outward);
}

/** A flat bar `w` wide and `h` proud of a plane (normal n) from a to b: a facing's bolted frame (`era`: furniture of the
 * cassettes it frames, removed with them; otherwise welded to the hull). */
function bar(P: TankBuilderPort, a: P3, b: P3, n: P3, w: number, h: number, era = true): void {
  const d: P3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const c: P3 = [n[1] * d[2] - n[2] * d[1], n[2] * d[0] - n[0] * d[2], n[0] * d[1] - n[1] * d[0]];
  const k = w / 2 / Math.hypot(c[0], c[1], c[2]);
  const g = cassette([add3(a, c, -k), add3(b, c, -k), add3(b, c, k), add3(a, c, k)].map((p) => add3(p, n, -.003)), n, h, h);
  P.addEquipment('hullDetail', era ? markEraFurniture(g) : g);
}

/** A bolt head standing on a plane at p. */
function bolt(P: TankBuilderPort, p: P3, n: P3, h: number, era = true): void {
  const at = add3(p, n, h);
  P.addEquipment('hullDark', era ? markEraFurniture(box(.024, .024, .024)) : box(.024, .024, .024), at[0], at[1], at[2]);
}

/**
 * The skirts' new ERA (looks round 2, the critics: "a grid of identical boxes ... plain Lego-style cladding"): each of
 * the T-14's five skirt panels (t14X.ts addHullSides: 0.18 m boxes, outer face x 1.852, from y 0.49 to the panel's own
 * top, 1.66 m, the leading panel 1.505 m) carries a bolted frame and three courses of cassettes of three sizes: a foot
 * course of small flat bricks, a middle course of large gabled bricks (their faces ridged across the middle) and a head
 * course of wedges leaning out to 95 mm under bolted lids. The panels alternate two and three cassettes in their middle
 * and head courses, so the run along the flank does not repeat panel by panel. The frame keeps the panel's outline: 8 mm
 * under its top, 10 mm over its foot and 5 mm in from both ends, seated 3 mm into its face, so the skirt's top line along
 * the hull side is the stock line, the facings' joints fall on the panels' own and nothing stands proud of the outline,
 * short of it or off it.
 */
function addSkirtEra(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    const face = 1.852 - .003, n: P3 = [side, 0, 0];
    const on = (z: number, y: number): P3 => [side * face, y, z];
    // counter-clockwise seen from outside, foot edge first
    const quad = (za: number, zb: number, ya: number, yb: number): P3[] => side > 0
      ? [on(zb, ya), on(za, ya), on(za, yb), on(zb, yb)] : [on(za, ya), on(zb, ya), on(zb, yb), on(za, yb)];
    P.destructibleCluster(`skirt_era_${side < 0 ? 'L' : 'R'}`, () => {
      for (let i = 0; i < 5; i++) {
        const z0 = -1.22 + i * .93, top = z0 > 2 ? 1.66 - (z0 - 2) * .31 : 1.66;
        const zA = z0 + .0075, zB = z0 + .9125, yA = .50, yB = top - .008, fw = .028, gap = .012;
        // the frame: head, foot and both ends, bolted at its corners and along its head and foot
        bar(P, on(zA, yB - fw / 2), on(zB, yB - fw / 2), n, fw, .02);
        bar(P, on(zA, yA + fw / 2), on(zB, yA + fw / 2), n, fw, .02);
        for (const z of [zA + fw / 2, zB - fw / 2]) bar(P, on(z, yA + fw), on(z, yB - fw), n, fw, .02);
        for (const z of [zA + fw / 2, (zA + zB) / 2, zB - fw / 2]) for (const y of [yA + fw / 2, yB - fw / 2]) bolt(P, on(z, y), n, .024);
        const zi0 = zA + fw + gap, zi1 = zB - fw - gap, yi0 = yA + fw + gap, yi1 = yB - fw - gap;
        const span = yi1 - yi0 - 2 * gap, hFoot = span * .27, hMid = span * .40;
        const yMid = yi0 + hFoot + gap, yHead = yMid + hMid + gap;
        const cells = (n0: number): [number, number][] => Array.from({ length: n0 }, (_, k) => {
          const w = (zi1 - zi0 - (n0 - 1) * gap) / n0, a = zi0 + k * (w + gap);
          return [a, a + w];
        });
        const [nMid, nHead] = i % 2 ? [3, 2] : [2, 3];
        for (const [za, zb] of cells(4)) wedge(P, quad(za, zb, yi0, yi0 + hFoot), n, .045, .045, n);
        for (const [za, zb] of cells(nMid)) gable(P, quad(za, zb, yMid, yMid + hMid), n, .05, .092, n);
        for (const [za, zb] of cells(nHead)) {
          const q = quad(za, zb, yHead, yi1);
          wedge(P, q, n, .055, .095, n);
          lid(P, q, n, .055, .095);
        }
      }
    });
  }
}

/** The glacis tiles' top (t14X.ts addGlacisPanels: the long course's plane and the short course's). */
const longTop = (z: number) => 1.419614 - (z - 3.42) * .497925;
const shortTop = (z: number) => 1.471735 + (z - 3.13987) * (1.43102 - 1.471735) / (3.38505 - 3.13987);

/**
 * The glacis's new ERA (looks round 2: varied sizes, wedge faces, bolted frames): a field laid over the T-14's seven long
 * tiles and its short course (t14X.ts addGlacisPanels, which stays under it), framed by bolted flat bars along its sides
 * and head, in four courses up the plate: a foot course of seven lidded wedges, a course of gabled doubles closed by
 * half bricks, another of lidded wedges, and on the short course four gabled bricks, wide at the corners and narrower
 * at the centre. The field keeps the tiles' outline (x +-0.856, z 3.14 to 4.19); the 2A83's -8 degree stop over the
 * plate keeps more than 0.12 m over the tallest.
 */
function addGlacisEra(P: TankBuilderPort): void {
  const pitch = .2452, half = 3 * pitch + .12019, fw = .028, gap = .012, inner = half - fw - gap;
  const planeN = (topAt: (z: number) => number, za: number, zb: number): P3 => {
    const slope = (topAt(zb) - topAt(za)) / (zb - za), len = Math.hypot(1, slope);
    return [0, 1 / len, -slope / len];
  };
  // courses: [foot z (toward the bow), head z, top(z), brick widths in pitches (summing to the field's 7), gabled]
  const courses: readonly (readonly [number, number, (z: number) => number, readonly number[], boolean])[] = [
    [4.190 - fw - gap, 3.935, longTop, [1, 1, 1, 1, 1, 1, 1], false],
    [3.925, 3.670, longTop, [.5, 2, 2, 2, .5], true],
    [3.660, 3.408, longTop, [1, 1, 1, 1, 1, 1, 1], false],
    [3.383, 3.142 + fw + gap, shortTop, [2, 1.5, 1.5, 2], true],
  ];
  for (const [zf, zh, topAt, widths, gabled] of courses) {
    const n = planeN(topAt, zf, zh), y = (z: number) => topAt(z) - .003, scale = 2 * inner / 7;
    let x0 = -inner;
    for (const w of widths) {
      const xa = x0 + gap / 2, xb = x0 + w * scale - gap / 2;
      x0 += w * scale;
      const quad: P3[] = [[xb, y(zf), zf], [xa, y(zf), zf], [xa, y(zh), zh], [xb, y(zh), zh]];
      P.destructibleCluster(`glacis_era_${(xa + xb) / 2 < -1e-6 ? 'L' : 'R'}`, () => {
        if (gabled) gable(P, quad, n, .055, .095, n);
        else { wedge(P, quad, n, .06, .085, n); lid(P, quad, n, .06, .085); }
      });
    }
  }
  // the bolted frame, welded to the plate: both sides on each plane, the head across the short course's top and the foot
  // across the bow
  {
    const nLong = planeN(longTop, 4.19, 3.408), nShort = planeN(shortTop, 3.383, 3.142);
    const pt = (x: number, z: number, topAt: (z: number) => number): P3 => [x, topAt(z) - .003, z];
    for (const s of [-1, 1]) {
      const x = s * (half - fw / 2);
      bar(P, pt(x, 4.19, longTop), pt(x, 3.408, longTop), nLong, fw, .022, false);
      bar(P, pt(x, 3.383, shortTop), pt(x, 3.142, shortTop), nShort, fw, .022, false);
      for (const z of [4.15, 3.80, 3.45]) bolt(P, pt(x, z, longTop), nLong, .026, false);
      bolt(P, pt(x, 3.26, shortTop), nShort, .026, false);
    }
    bar(P, pt(-inner, 3.142 + fw / 2, shortTop), pt(inner, 3.142 + fw / 2, shortTop), nShort, fw, .022, false);
    bar(P, pt(-inner, 4.19 - fw / 2, longTop), pt(inner, 4.19 - fw / 2, longTop), nLong, fw, .022, false);
    for (const x of [-.6, -.2, .2, .6]) {
      bolt(P, pt(x, 3.142 + fw / 2, shortTop), nShort, .026, false);
      bolt(P, pt(x, 4.19 - fw / 2, longTop), nLong, .026, false);
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

// ------------------------------------------------------------------------------------------------ the turret's flanks --

const DRUM_R = .295, DRUM_LEN = .88;

/**
 * One 200 L drum lying along the turret's flank at (x, y, z), turret frame (axis along z): its shell, the rolled chimes at
 * both ends, two rolling hoops, the dark straps over its brackets at `straps` (z), and on its outer end (`end`: +1 its
 * front, -1 its back) the filler bung and the vent.
 */
function addFlankDrum(P: TankBuilderPort, x: number, y: number, z: number, side: number, end: number, straps: readonly number[]): void {
  const along = Math.PI / 2;
  P.addEquipment('turretDetail', stowagePart(KIT.cylZ(DRUM_R, DRUM_LEN, 24)), x, y, z);
  for (const e of [-1, 1]) P.addEquipment('turretDetail', stowagePart(fuelDrumHoop(DRUM_R + .016, .03, .03, 20)), x, y, z + e * (DRUM_LEN / 2 - .015), 0, along);
  for (const dz of [-.17, .17]) P.addEquipment('turretDetail', stowagePart(fuelDrumHoop(DRUM_R + .022, .03, .03, 20)), x, y, z + dz, 0, along);
  for (const sz of straps) P.addEquipment('turretDark', stowagePart(fuelDrumHoop(DRUM_R + .006, .04, .012, 20)), x, y, sz, 0, along);
  const face = z + end * (DRUM_LEN / 2 + .006);
  P.addEquipment('turretDark', stowagePart(KIT.cylZ(.034, .014, 12)), x - side * .13, y + .15, face);
  P.addEquipment('turretDark', stowagePart(KIT.cylZ(.02, .014, 10)), x + side * .15, y + .13, face);
}

/**
 * Four 200 L drums (looks round 2, the critics: "the external fuel drums are almost invisible ... none can be seen in the
 * front three-quarter view"): two lying end to end along each of the bustle's flanks, outboard of its side bins, each on
 * two welded L brackets (an upright plate bolted to the bin's face and hanging under it, an arm under the drum and a
 * keeper at the arm's end) with a strap over each bracket. Their ends face the bow and the stern, their sides fill the
 * turret's flank from the shroud back to the bustle's end, 0.6 m out past the bins: drums from the side, the front three
 * quarters and the rear. They ride with the turret 0.24 m over everything on the hull through its whole traverse and
 * stand clear of the 2A83, the roof's launcher caps and the forward launchers' line of fire. Turret frame.
 */
function addFlankDrums(P: TankBuilderPort): void {
  const y = localY(2.34), out = 1.215, drumX = out + .03 + DRUM_R;
  for (const side of [-1, 1]) {
    for (const [cz, end] of [[localZ(-1.24), 1], [localZ(-2.25), -1]] as const) {
      const brackets = [cz - .30, cz + .30];
      for (const bz of brackets) {
        P.addEquipment('turretDetail', stowagePart(box(.02, .30, .07)), side * (out + .008), localY(2.15), bz);
        P.addEquipment('turretDetail', stowagePart(box(.64, .035, .07)), side * (out + .32), y - DRUM_R - .0175, bz);
        P.addEquipment('turretDetail', stowagePart(box(.03, .17, .07)), side * (out + .655), localY(2.105), bz);
        for (const by of [2.18, 2.26]) P.addEquipment('turretDark', stowagePart(KIT.cylX(.012, .014, 6)), side * (out + .02), localY(by), bz);
      }
      addFlankDrum(P, side * drumX, y, cz, side, end, brackets);
    }
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
 * station's support box: the outer strips of the side columns of roof panels (the gun house covers their inner halves),
 * the commander's panoramic sight, the two whips, the sensor post and the bustle's stowage rails, at the T-14's own
 * positions.
 */
function addRoofStations(P: TankBuilderPort): void {
  // (looks round 2: the wider gun house takes the panels' inner halves; each column keeps its outer strip)
  for (let row = 0; row < 3; row++) for (const col of [0, 2]) {
    const x = (col - 1) * .635, z = .12 - row * .49;
    P.snapGroup('t14-roof-panel', () => {
      P.addEquipment('turretDetail', box(.17, .017, .465), x, localY(2.563), localZ(z));
      for (const dx of [-.055, .055]) for (const dz of [-.17, .17]) {
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
  addFlankDrums(P);
  addBustleCans(P);
}

/** The tower station's top (turret frame), for the build's topY. */
export const T14_152_TOWER_TOP = T14_152_TOWER.roof - .005 + .05 + .09 + .45 + .05 + .03 + .423;
