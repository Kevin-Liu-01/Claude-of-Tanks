// First-party procedural ROK Army BMP-3 turret fit (release 269, the owner 2026-11-03: "make the bmp-3 rok have a lot
// more unique turret than the bmp-3 base"). bmp3_rok keeps the shared welded 2K23 turret (bmp3Family.ts
// buildBmp3WeldedTurret) and carries what the Republic of Korea Army's BMP-3s were photographed with
// (research/bmp3_rok/r269-photos/sources.md):
//   - the Korean radio fit's antenna masts: US-pattern bases (AB-15 / MP-65 scale) with their matching drum and spring,
//     hung outboard on welded brackets, one on the left flank behind mid-length (Commons r1, cafe c2) and one on the
//     right rear corner (cafe c1), in place of the Russian roof bases; the left Russian base stays as a low capped plate;
//   - the second Bulgom batch's gunner station (namu.wiki and Tank Encyclopedia: the Vesna-K thermal module added for
//     the gunner, the gunner sight's IR searchlight replaced by a new type; cafe c1: the housing much longer and taller
//     than the 1K13-2, the lamp on its top): one long armoured sight housing in place of bmp3's 1K13-2 box, its face
//     carrying the day/guidance pair and the thermal window under a brow, the new IR searchlight seated on its top;
//   - the ribbed, strapped stowage bin the 3rd Armoured Brigade's vehicles carry round the turret's left rear corner
//     (Commons r1). The right flank stays plain (c1).
// Round 2 (the coordinator's blind-critic notes): the station is one housing, not stacked boxes on a yoked lamp; the
// thermal shutter is held open by hinge arms; the bases are AB-15 sized; the bin has a lid lip, ribs, straps and hasps.
// Frame: bmp3Family.ts's turret frame (+x the vehicle's left, +z forward, y up from the ring plane).
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, FITTINGS, convexSlab } from './kit.ts';
import { mount } from './fittingMount.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { hoop } from './bentBarHoop.ts';

/** The shared turret's datums the fit seats against (bmp3Family.ts). */
interface Bmp3RokTurretDatums {
  /** top of the inset roof plate */
  readonly roofY: number;
  /** the 1K13-2 sight box: plan x0..x1, z0..z1 at its foot, its top */
  readonly sight: { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number; readonly top: number };
}

type Vec2 = readonly [number, number];

/** Counter-clockwise copy of a section contour (sectionSolid's contract). */
function ccw(ring: readonly Vec2[]): SectionPoint[] {
  let area2 = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    area2 += a[0] * b[1] - b[0] * a[1];
  }
  const out = ring.map(([u, v]) => [u, v] as SectionPoint);
  return area2 > 0 ? out : out.reverse();
}

/** A side section (z, y) lofted through x stations (sectionSolid along x: its z is x, its x is -z). */
function sideLoft(stations: ReadonlyArray<{ readonly x: number; readonly section: readonly Vec2[] }>): THREE.BufferGeometry {
  const g = sectionSolid(stations.map(({ x, section }) => ({ z: x, ring: ccw(section.map(([z, y]) => [-z, y] as Vec2)) })));
  g.rotateY(Math.PI / 2);
  return g;
}

// ---- left rear corner: the chamfer face from the flank junction J to the rear corner R, and the rear face (z -1.07 to
// -1.09 over y 0.17..0.40; both faces lean out ~6 mm over that height, the roof-edge chamfer above them) -------------
const J: Vec2 = [1.14, -0.47];
const R: Vec2 = [0.72, -1.08];
const CH_LEN = Math.hypot(R[0] - J[0], R[1] - J[1]);
const DH: Vec2 = [(R[0] - J[0]) / CH_LEN, (R[1] - J[1]) / CH_LEN];   // along the chamfer, rearward
const NQ: Vec2 = [-DH[1], DH[0]];                                     // out of the chamfer face
const ZR = -1.08;
/** The stowage box's outer faces: its flank face, front end, rear face (0.12 behind the turret's) and inboard end. */
const BOX = { xo: 1.36, zf: -0.55, zb: -1.21, xi: 0.15 } as const;

/** The box's plan at one level, its outer faces grown by o and its inner faces standing `so` off the chamfer and rear
 * plates: front end inside, out to the flank face, round the square outer corner, along the rear face to the inboard
 * end and back inside along the plates. */
function boxPlan(o: number, so: number): Vec2[] {
  const along = (s: number, off: number): Vec2 => [J[0] + DH[0] * s + NQ[0] * off, J[1] + DH[1] * s + NQ[1] * off];
  const zf = BOX.zf + o, sF = (zf - J[1] - so * NQ[1]) / DH[1], sK = (ZR - so - J[1] - so * NQ[1]) / DH[1];
  return [[along(sF, so)[0], zf], [BOX.xo + o, zf], [BOX.xo + o, BOX.zb - o], [BOX.xi - o, BOX.zb - o],
    [BOX.xi - o, ZR - so], along(sK, so)];
}

/** The ribbed, strapped stowage box squaring the turret's left rear corner (Commons r1, measured at 4x: a tall box as
 * high as the turret's side wall, its top level with the roof edge, from the rear forward ~0.6 m, four or five vertical
 * posts on its face, standing ~0.12 m proud of the turret's rear). Its faces run square with the hull (flank face 0.22 m
 * outboard of the turret's side, rear face 0.12 m behind its rear); it hangs on the turret wall: its inner faces stand
 * 4 cm off the chamfer and rear plates on eight stand-off arms, its lid level with the roof edge (y 0.50), its floor
 * (y 0.20) carried by four gusset brackets welded to those plates, an open 10 cm gap under it over the raised troop
 * deck (turret y 0.10) as the turret turns. */
function addLeftRearBox(P: TankBuilderPort): void {
  const { box } = KIT;
  const LIP = 0.025, FLOOR = 0.20, LID = 0.449, TOP = 0.50, SO = 0.04;
  // body, then the lid: a 51 mm band that overhangs the faces by 25 mm, its top edge chamfered
  const levels: Array<[number, number]> = [[FLOOR, -0.030], [FLOOR + 0.03, 0], [0.400, 0], [LID - 0.001, 0],
    [LID, LIP], [TOP - 0.016, LIP], [TOP, 0.006]];
  P.add('turretPaintedDetail', KIT.xform(sectionSolid(levels.map(([y, o]) => ({
    z: y, ring: ccw(boxPlan(o, SO).map(([x, z]) => [x, -z] as Vec2)),
  }))), 0, 0, 0, -Math.PI / 2, 0, 0));
  // one face's relief in its own frame (u out of the face from its plate, w along it): five panels between four
  // pressed posts 32 mm proud (r1), a webbing strap in each end panel (down the face and over the lid lip, its buckle on
  // the face), a hasp on the middle panel under the lid
  const faceY = (FLOOR + 0.03 + LID) / 2, faceH = LID - FLOOR - 0.035;
  const relief = (put: (slot: string, g: THREE.BufferGeometry, u: number, y: number, w: number) => void,
    out: number, w0: number, w1: number): void => {
    const panel = (w1 - w0) / 5;
    for (const k of [1, 2, 3, 4]) put('turretPaintedDetail', box(0.040, faceH, 0.042), out + 0.012, faceY, w0 + k * panel);
    for (const k of [0.5, 4.5]) {
      const w = w0 + k * panel;
      put('turretCloth', box(0.010, faceH + 0.005, 0.05), out + 0.004, faceY, w);
      put('turretCloth', box(0.010, TOP - LID, 0.05), out + LIP + 0.004, (LID + TOP) / 2, w);
      put('turretDetail', box(0.026, 0.055, 0.062), out + 0.012, FLOOR + 0.11, w);
    }
    put('turretDetail', box(0.026, 0.08, 0.06), out + 0.009, LID - 0.042, w0 + 2.5 * panel);
    put('turretDark', box(0.02, 0.03, 0.03), out + 0.03, LID - 0.062, w0 + 2.5 * panel);
  };
  // flank face (u = x - 1.10, w = z) and rear face (u = -1.09 - z, w = x)
  relief((slot, g, u, y, w) => P.add(slot, g, 1.10 + u, y, w), BOX.xo - 1.10, BOX.zf, BOX.zb);
  relief((slot, g, u, y, w) => P.add(slot, KIT.xform(g, 0, y, 0, 0, Math.PI / 2, 0), w, 0, -1.09 - u),
    -1.09 - BOX.zb, BOX.xi, BOX.xo);
  // gusset brackets welded to the chamfer and rear plates under the floor (u out of the plate, 14 mm thick), their
  // top edge 3 mm into the floor, their inner edge down the plate's undercut (inset by `foot` at y 0.105), 8 mm into it
  const gusset = (reach: number, foot: number): THREE.BufferGeometry => {
    const t = 0.007, q: Array<[number, number]> = [[-foot - 0.008, 0.105], [-0.018, FLOOR + 0.003],
      [reach, FLOOR + 0.003], [reach, FLOOR - 0.012]];
    return convexSlab(...q.map(([u, y]) => [u, y, -t]), ...q.map(([u, y]) => [u, y, t]));
  };
  const chamferYaw = Math.atan2(NQ[0], NQ[1]) - Math.PI / 2;
  for (const sAlong of [0.22, 0.58]) {
    const px = J[0] + DH[0] * sAlong, pz = J[1] + DH[1] * sAlong;
    P.add('turretDetail', gusset(0.16, 0.076), px, 0, pz, 0, chamferYaw, 0);
  }
  for (const x of [0.32, 0.62]) P.add('turretDetail', gusset(0.10, 0.051), x, 0, ZR, 0, Math.PI / 2, 0);
  // stand-off arms across the 4 cm gap, 12 mm into the plate and 15 mm into the box, under the lid and low on the box
  const arm = (): THREE.BufferGeometry => box(SO + 0.027, 0.03, 0.05);
  for (const y of [FLOOR + 0.06, LID - 0.03]) {
    for (const sAlong of [0.22, 0.56]) {
      P.add('turretDetail', KIT.xform(arm(), (SO + 0.003) / 2, y, 0), J[0] + DH[0] * sAlong, 0, J[1] + DH[1] * sAlong,
        0, chamferYaw, 0);
    }
    for (const x of [0.30, 0.60]) P.add('turretDetail', KIT.xform(arm(), (SO + 0.003) / 2, y, 0), x, 0, ZR, 0, Math.PI / 2, 0);
  }
}

// ---- Korean radio masts ---------------------------------------------------------------------------------------------
/** US-pattern antenna mount (c1, c2: a wide flared foot, the matching unit's drum, the spring, the whip's ferrule; 0.30 m
 * in all), its foot at y on its shelf: a thick spring-loaded cylinder that stands proud of the turret wall. */
function antennaMast(P: TankBuilderPort, x: number, y: number, z: number, whipH: number, seed: number): void {
  const { lathe, cylY } = KIT;
  P.add('turretDetail', lathe([
    [0.001, 0], [0.068, 0], [0.068, 0.012], [0.056, 0.026], [0.048, 0.040], [0.046, 0.052], [0.046, 0.160],
    [0.038, 0.172], [0.001, 0.175],
  ], 14), x, y, z);
  P.add('turretDark', KIT.torus(0.047, 0.006, 14, 6), x, y + 0.10, z);
  const coil: number[][] = [[0.001, 0.166]];
  for (let k = 0; k <= 8; k++) coil.push([k % 2 ? 0.028 : 0.023, 0.168 + k * 0.0145]);
  coil.push([0.001, 0.285]);
  P.add('turretDark', lathe(coil, 12), x, y, z);
  P.add('turretDark', cylY(0.014, 0.017, 0.035, 8), x, y + 0.30, z);
  mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: whipH, r: 0.010, rake: 0, seed, base: false }),
    x, y + 0.315, z);
}

/** Welded mast bracket: a backing plate on the face, a shelf and a gusset; local x out of the face, foot centre at
 * (reach, shelfY) in that frame. */
function mastBracket(P: TankBuilderPort, slot: string, reach: number, shelfY: number, depth: number,
  at: Vec2, yaw: number): void {
  const { box } = KIT;
  const put = (g: THREE.BufferGeometry, x: number, y: number, z: number): void =>
    P.add(slot, KIT.xform(g, x, y, z), at[0], 0, at[1], 0, yaw, 0);
  put(box(0.018, 0.16, depth), 0.003, shelfY - 0.076, 0);
  put(box(reach + 0.08, 0.018, depth), (reach + 0.08) / 2 - 0.006, shelfY - 0.009, 0);
  const w = 0.007;
  put(convexSlab(
    [-0.004, shelfY - 0.15, -w], [0.016, shelfY - 0.15, -w], [-0.004, shelfY - 0.014, -w], [reach + 0.055, shelfY - 0.014, -w],
    [-0.004, shelfY - 0.15, w], [0.016, shelfY - 0.15, w], [-0.004, shelfY - 0.014, w], [reach + 0.055, shelfY - 0.014, w],
  ), 0, 0, 0);
}

/** The flags flown on the turret (c2: the 1st batch's vehicles fly a cluster of three cloth flags on their own thin
 * staffs from one bracket beside the gunner's station and a whip; a triangular pennant and two rectangles hanging
 * folded). One cloth piece: stations along its fly, the fly axis drooping `droop` degrees from the hoist, `pleat`
 * zig-zagging it across (folds) or `wave` rippling it, the foot sagging, the trailing edge ragged; its hoist edge rides
 * a cloth sleeve on the staff. `top` is the hoist's top on the staff. */
function clothFlag(P: TankBuilderPort, top: readonly [number, number, number], fly: Vec2, hoist: number, len: number,
  droop: number, kind: 'pennant' | 'flag', folds: number): void {
  const th = droop * Math.PI / 180, t = 0.003, n = 6;
  const sections = Array.from({ length: n }, (_, k) => {
    const u = k === 0 ? 0.006 : (k / (n - 1)) * len, f = u / len, yc = -u * Math.sin(th);
    const lateral = kind === 'flag' ? (k === 0 ? 0 : (k % 2 ? 1 : -1) * folds * (0.6 + 0.4 * f))
      : folds * Math.sin(f * Math.PI * 2.4) * (0.35 + 0.65 * f);
    let hi: number, lo: number;
    if (kind === 'pennant') {
      hi = yc - (hoist / 2) * f + 0.005 * Math.sin(f * 9);
      lo = yc - hoist + (hoist / 2) * f - 0.016 * Math.sin(Math.PI * f);
      if (k === n - 1) { hi = yc - hoist / 2 + 0.012; lo = hi - 0.03; }
    } else {
      hi = yc + 0.006 * Math.sin(f * 7);
      lo = yc - hoist - 0.022 * Math.sin(Math.PI * f) + (k === n - 1 ? 0.03 : 0);
    }
    return { z: u * Math.cos(th), ring: ccw([[lateral - t, lo], [lateral + t, lo], [lateral + t, hi], [lateral - t, hi]]) };
  });
  P.add('turretCloth', sectionSolid(sections), top[0], top[1], top[2], 0, Math.atan2(fly[0], fly[1]), 0);
}

/** c2's flag cluster on the turret roof outboard of the gunner's station, ahead of the left radio mast: a welded socket
 * block, three 18 mm staffs leaning a few degrees apart (0.87-0.92 m) with finials, a triangular pennant streaming from
 * the tallest, two small flags hanging folded from the others. Every staff stands from the roof; the cloth hangs clear
 * above the roof, the housing and the box. */
function addFlagCluster(P: TankBuilderPort, roofY: number): void {
  const { box, cylY, sph } = KIT;
  const bx = 0.93, bz = -0.18, sockY = roofY + 0.05;
  P.add('turretDetail', box(0.17, 0.02, 0.10), bx, roofY + 0.004, bz);
  P.add('turretDetail', box(0.14, 0.045, 0.06), bx, roofY + 0.032, bz);
  const staffs: Array<{ dx: number; lean: [number, number]; len: number }> = [
    { dx: -0.045, lean: [-0.06, 0.03], len: 0.90 },
    { dx: 0.0, lean: [0.0, -0.05], len: 0.92 },
    { dx: 0.045, lean: [0.07, 0.02], len: 0.87 },
  ];
  const tops: Array<[number, number, number]> = [];
  for (const { dx, lean, len } of staffs) {
    const dir = new THREE.Vector3(lean[0], 1, lean[1]).normalize();
    const base: [number, number, number] = [bx + dx, sockY - 0.03, bz];
    P.add('turretDetail', cylY(0.016, 0.018, 0.05, 10), bx + dx, sockY, bz);
    const end: [number, number, number] = [base[0] + dir.x * len, base[1] + dir.y * len, base[2] + dir.z * len];
    P.add('turretDark', tube(base, end, 0.009));
    P.add('turretDetail', sph(0.016, 8), end[0], end[1], end[2]);
    tops.push([base[0] + dir.x * (len - 0.025), base[1] + dir.y * (len - 0.025), base[2] + dir.z * (len - 0.025)]);
    // the hoist sleeve, 0.16 m down from the top
    const lo: [number, number, number] = [base[0] + dir.x * (len - 0.19), base[1] + dir.y * (len - 0.19), base[2] + dir.z * (len - 0.19)];
    P.add('turretCloth', tube(lo, tops[tops.length - 1], 0.013));
  }
  clothFlag(P, tops[1], WIND, 0.18, 0.32, 18, 'pennant', 0.024);
  clothFlag(P, tops[0], [WIND[0] * 0.6 - 0.4, WIND[1]], 0.16, 0.26, 62, 'flag', 0.03);
  clothFlag(P, tops[2], [WIND[0], WIND[1] * 0.7 + 0.3], 0.16, 0.26, 58, 'flag', 0.028);
}

/** The flags stream aft and to the vehicle's left (the wind). */
const WIND: Vec2 = [0.73, -0.683];

function addRadioMasts(P: TankBuilderPort, roofY: number): void {
  const shelfY = 0.400;
  // left flank, just behind the grab rail at the flank/quarter junction (r1: the mast's bell at the roof edge)
  const lz = -0.41, lreach = 0.09;
  mastBracket(P, 'turretDetail', lreach, shelfY, 0.12, [1.14, lz], 0);
  antennaMast(P, 1.14 + lreach, shelfY, lz, 0.63, 3260);
  // right rear corner, out along the corner's bisector (c1: the bell hung outboard of the corner, the mast standing
  // clear); the bracket's root is sunk 3 cm into the corner so its plate meets both faces
  const bx = -0.465, bz = -0.885, bl = Math.hypot(bx, bz);
  const b: Vec2 = [bx / bl, bz / bl];
  const root: Vec2 = [-0.72 - b[0] * 0.03, -1.08 - b[1] * 0.03], rreach = 0.15;
  mastBracket(P, 'turretDetail', rreach, shelfY, 0.12, root, Math.atan2(-b[1], b[0]));
  antennaMast(P, root[0] + b[0] * rreach, shelfY, root[1] + b[1] * rreach, 0.69, 3261);
  // the Russian left roof base stays as a low capped plate, its whip gone (r1: a dark stub on the rear-left roof)
  P.add('turretDetail', KIT.box(0.13, 0.035, 0.13), 0.80, roofY + 0.0075, -0.78);
  P.add('turretDark', KIT.cylY(0.042, 0.048, 0.03, 12), 0.80, roofY + 0.040, -0.78);
}

// ---- gunner station: the 1K13-2 head and the Vesna-K module, two blocks 0.55 m long, the new lamp on its stalk -------
/** c1 at its measure: the second batch's gunner housing is about 0.55 m long and 0.30 m tall over the roof, two blocks
 * one behind the other, the new IR lamp on a bent stalk on top. One stepped housing running fore and aft, both blocks
 * the same width: the front block is the sight head, its leaning face carrying the twin windows (the 1K13-2's day window
 * and the Vesna-K's thermal window; Tankograd: a Vesna-K head is double-windowed) under a brow; the rear block is the
 * thermal module's body, a step taller, with an access cover and a grab handle; a welded flange rings the joint. Each
 * block lofted across x with chamfered ends and top edges. The rear block steps forward over the gunner's hatch
 * (>= 9.6 cm from its ring; the lid hinged aft swings clear). */
function addGunnerSightHousing(P: TankBuilderPort, d: Bmp3RokTurretDatums): void {
  const { box, cylZ, torus, xform } = KIT;
  const foot = d.roofY - 0.010;
  const block = (rear: number, fz: number, ftz: number, top: number, i: number): Vec2[] => [
    [rear + i, foot], [fz - i, foot], [ftz - i, top - 0.022 - i * 0.5], [ftz - 0.02 - i, top - i],
    [rear + 0.025 + i, top - i], [rear + i, top - 0.025 - i * 0.5],
  ];
  const X0 = 0.38, X1 = 0.74;
  // rear block: the thermal module's body
  const rTop = 0.835, rF = 0.245, rFT = 0.232, rIn = 0.02, rOut = -0.07;
  const rb = (rear: number, i: number): Vec2[] => block(rear, rF, rFT, rTop, i);
  P.addEquipment('turret', sideLoft([
    { x: X0, section: rb(rIn, 0.02) }, { x: X0 + 0.02, section: rb(rIn, 0) }, { x: 0.60, section: rb(rIn, 0) },
    { x: 0.68, section: rb(rOut, 0) }, { x: X1 - 0.02, section: rb(rOut, 0) }, { x: X1, section: rb(rOut, 0.02) },
  ]));
  // front block: the sight head, a step lower, its rear 3 cm inside the body
  const fTop = 0.785, fF = 0.48, fFT = 0.43;
  const fb = (i: number): Vec2[] => block(0.215, fF, fFT, fTop, i);
  P.addEquipment('turret', sideLoft([
    { x: X0 - 0.005, section: fb(0.02) }, { x: X0 + 0.015, section: fb(0) }, { x: X1 - 0.015, section: fb(0) },
    { x: X1 + 0.005, section: fb(0.02) },
  ]));
  // the welded flange round the joint: a band 10 mm proud of both blocks at the body's face
  const fl = 0.01, fy0 = foot + 0.01, fy1 = rTop - 0.012;
  P.add('turretDetail', box(X1 - X0 + 2 * fl, 0.022, 0.026), (X0 + X1) / 2, fy1, rF - 0.004);
  for (const x of [X0 - fl / 2, X1 + fl / 2]) P.add('turretDetail', box(0.022, fy1 - fy0, 0.026), x, (fy0 + fy1) / 2, rF - 0.004);
  // the twin windows on the head's leaning face: the 1K13-2's round day window and the Vesna-K's square thermal window,
  // a brow over both
  const fLean = Math.atan2(fF - fFT, fTop - 0.022 - foot);
  const fFace = (y: number): number => fF - (y - foot) * Math.tan(fLean);
  const onF = (g: THREE.BufferGeometry): THREE.BufferGeometry => xform(g, 0, 0, 0, -fLean, 0, 0);
  P.add('turretDark', onF(cylZ(0.074, 0.03, 16)), 0.475, 0.64, fFace(0.64) + 0.004);
  P.add('turretGlass', onF(cylZ(0.056, 0.012, 16)), 0.475, 0.64, fFace(0.64) + 0.016);
  P.add('turretDark', onF(box(0.13, 0.12, 0.03)), 0.645, 0.64, fFace(0.64) + 0.004);
  P.add('turretGlass', onF(box(0.104, 0.094, 0.012)), 0.645, 0.64, fFace(0.64) + 0.017);
  P.add('turretDetail', box(X1 - X0 - 0.02, 0.016, 0.10), (X0 + X1) / 2, fTop - 0.018, fFace(fTop - 0.018) + 0.035);
  for (const x of [X0 + 0.012, X1 - 0.012]) {
    const w = 0.006, yb = 0.72, by = fTop - 0.026;
    P.add('turretDetail', convexSlab(
      [x - w, by, fFace(by) - 0.008], [x - w, by, fFace(by) + 0.08], [x - w, yb, fFace(yb) - 0.006], [x - w, by, fFace(by) - 0.004],
      [x + w, by, fFace(by) - 0.008], [x + w, by, fFace(by) + 0.08], [x + w, yb, fFace(yb) - 0.006], [x + w, by, fFace(by) - 0.004],
    ));
  }
  // rear access cover and a grab handle on the outboard end of the body
  P.add('turretDetail', box(0.055, 0.15, 0.012), 0.708, foot + 0.17, rOut - 0.004);
  P.add('turretDetail', xform(hoop(0.05, 0.010, true), 0, 0, 0, 0, 0, -Math.PI / 2), X1 - 0.004, foot + 0.17, 0.08);

  // the new gunner IR searchlight on its cranked stalk over the thermal module (c1: the lamp held up on a bent arm): a
  // base flange outboard of the lamp, a 52 mm post up from the block's top, an elbow, the arm angled in and forward into
  // the lamp's belly (the crank reads from the side, the rear and the quarters), the head a drum about as deep as it is
  // wide with a rimmed back
  const lx = 0.52, lz = 0.16, lr = 0.083, ll = 0.15, ly = rTop + 0.19;
  const fx = lx + 0.10, footZ = 0.07, kneeY = rTop + 0.09;
  P.add('turretDetail', KIT.cylY(0.05, 0.055, 0.016, 14), fx, rTop + 0.004, footZ);
  P.add('turretDetail', tube([fx, rTop - 0.01, footZ], [fx, kneeY, footZ], 0.026));
  P.add('turretDetail', KIT.sph(0.032, 10), fx, kneeY, footZ);
  P.add('turretDetail', tube([fx, kneeY, footZ], [lx + 0.01, ly - lr + 0.016, lz - 0.03], 0.026));
  P.add('turretDetail', KIT.cylY(0.034, 0.034, 0.03, 12), lx + 0.01, ly - lr + 0.004, lz - 0.03);
  P.addEquipment('turret', cylZ(lr, ll, 18, lr - 0.004), lx, ly, lz);
  P.add('turretDetail', cylZ(lr - 0.002, 0.016, 18), lx, ly, lz - ll / 2 - 0.006);
  P.add('turretDetail', cylZ(0.026, 0.02, 10), lx, ly, lz - ll / 2 - 0.022);
  P.add('turretDark', xform(torus(lr - 0.002, 0.010, 18, 6), 0, 0, 0, Math.PI / 2, 0, 0), lx, ly, lz + ll / 2);
  P.add('turretDark', cylZ(lr - 0.008, 0.010, 18), lx, ly, lz + ll / 2);
  P.add('turretGlass', cylZ(0.056, 0.008, 14), lx, ly, lz + ll / 2 + 0.005);
}

/** A round bar between two points (turret frame). */
function tube(a: readonly [number, number, number], b: readonly [number, number, number], r: number): THREE.BufferGeometry {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), dir = to.clone().sub(from);
  const g = KIT.cylY(r, r, dir.length(), 8);
  g.applyMatrix4(new THREE.Matrix4().compose(from.clone().add(to).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()), new THREE.Vector3(1, 1, 1)));
  return g;
}

// ---- commander's IR searchlight where the ROK photographs show it ----------------------------------------------------
/** c1 and r1: the commander's OU-3GA2 searchlight stands on a tall bent-tube frame over the turret's rear right, its
 * drum (~0.25 m across, deep) centred ~0.30 m over the roof, ~0.75 m ahead of the rear (bmp3 keeps it beside the
 * cupola). A 90-100 mm pedestal with a 56 mm rear brace (the A-frame), a 56 mm bent-tube yoke under the drum up to
 * its trunnions, the drum (0.20 m deep) with a rimmed back and the lens. Clear of the cupola and the hatch lid's swing
 * (x <= -0.70), of the TKN-3's view and of the roof edge. */
function addCommanderSearchlight(P: TankBuilderPort, roofY: number): void {
  const { box, cylX, cylY, cylZ, torus, xform } = KIT;
  const lx = -0.86, lz = -0.33, ly = roofY + 0.31, r = 0.118, ry = r + 0.03, yb = ly - ry;
  // foot plates, the pedestal up into the yoke's bottom and the rear brace into the pedestal
  for (const [z, w] of [[lz, 0.10], [lz - 0.22, 0.08]] as Array<[number, number]>) {
    P.add('turretDetail', box(w, 0.018, w), lx, roofY + 0.005, z);
  }
  P.add('turretDetail', cylY(0.044, 0.05, yb - roofY + 0.01, 14), lx, (yb + roofY) / 2, lz);
  P.add('turretDetail', tube([lx, roofY - 0.004, lz - 0.22], [lx, yb - 0.04, lz - 0.025], 0.028));
  P.add('turretDetail', cylY(0.06, 0.06, 0.036, 14), lx, yb - 0.005, lz);
  // the yoke: a bent tube under the drum from trunnion to trunnion, and the trunnion bosses
  P.add('turretDetail', xform(hoop(ry, 0.028, true), 0, 0, 0, 0, 0, Math.PI), lx, ly, lz);
  for (const sx of [-1, 1]) P.add('turretDetail', cylX(0.044, 0.056, 12), lx + sx * (r + 0.014), ly, lz);
  // the drum, its rimmed back and boss, the bezel and lens
  P.addEquipment('turret', cylZ(r, 0.20, 20, r - 0.008), lx, ly, lz);
  P.add('turretDetail', cylZ(r - 0.004, 0.022, 20), lx, ly, lz - 0.108);
  P.add('turretDetail', cylZ(0.04, 0.03, 12), lx, ly, lz - 0.132);
  P.add('turretDark', xform(torus(r - 0.004, 0.013, 20, 6), 0, 0, 0, Math.PI / 2, 0, 0), lx, ly, lz + 0.10);
  P.add('turretDark', cylZ(r - 0.012, 0.012, 20), lx, ly, lz + 0.100);
  P.add('turretGlass', cylZ(r - 0.035, 0.010, 18), lx, ly, lz + 0.106);
}

/** The ROK Army fit on the shared welded BMP-3 turret (bmp3_rok only). */
export function addBmp3RokTurretFit(P: TankBuilderPort, d: Bmp3RokTurretDatums): void {
  addGunnerSightHousing(P, d);
  addCommanderSearchlight(P, d.roofY);
  addRadioMasts(P, d.roofY);
  addFlagCluster(P, d.roofY);
  addLeftRearBox(P);
}
