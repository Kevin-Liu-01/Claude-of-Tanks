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
 * (y 0.20) carried by four gusset brackets welded to those plates (the long ones out to its flank face and its
 * outboard rear corner), an open 10 cm gap under it over the raised troop
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
  // the brackets that carry it, welded to the chamfer and rear plates under the floor (u out of the plate, 14 mm thick):
  // two long gusset plates from the chamfer's foot out under the box to its flank face (one to its outboard rear
  // corner), two short ones on the rear plate; their top edge 3 mm into the floor, their inner edge down the plate's
  // undercut (inset by `foot` at y `y0`), 8 mm into it, the bottom edge raking up to the outer end
  const gusset = (reach: number, foot: number, y0: number): THREE.BufferGeometry => {
    const t = 0.007, q: Array<[number, number]> = [[-foot - 0.008, y0], [-0.018, FLOOR + 0.003],
      [reach, FLOOR + 0.003], [reach, FLOOR - 0.035]];
    return convexSlab(...q.map(([u, y]) => [u, y, -t]), ...q.map(([u, y]) => [u, y, t]));
  };
  const chamferYaw = Math.atan2(NQ[0], NQ[1]) - Math.PI / 2;
  for (const [sAlong, reach] of [[0.15, 0.34], [0.485, 0.56]] as Array<[number, number]>) {
    const px = J[0] + DH[0] * sAlong, pz = J[1] + DH[1] * sAlong;
    P.add('turretDetail', gusset(reach, 0.05, 0.13), px, 0, pz, 0, chamferYaw, 0);
  }
  for (const x of [0.32, 0.62]) P.add('turretDetail', gusset(0.12, 0.051, 0.105), x, 0, ZR, 0, Math.PI / 2, 0);
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

/** Welded mast bracket, a solid console (c1, c2: the bell base stands on a plate shelf hung outboard): a backing plate
 * on the face, a 28 mm shelf plate and a gusset plate under each of its edges; local x out of the face, the foot centre
 * at (reach, shelfY) in that frame. */
function mastBracket(P: TankBuilderPort, slot: string, reach: number, shelfY: number, depth: number,
  at: Vec2, yaw: number): void {
  const { box } = KIT;
  const put = (g: THREE.BufferGeometry, x: number, y: number, z: number): void =>
    P.add(slot, KIT.xform(g, x, y, z), at[0], 0, at[1], 0, yaw, 0);
  const len = reach + 0.09;
  put(box(0.022, 0.22, depth), 0.004, shelfY - 0.10, 0);
  put(box(len, 0.028, depth), len / 2 - 0.006, shelfY - 0.012, 0);
  const w = 0.007;
  for (const zc of [-(depth / 2 - w - 0.002), depth / 2 - w - 0.002]) {
    put(convexSlab(
      [-0.004, shelfY - 0.205, zc - w], [0.02, shelfY - 0.205, zc - w], [-0.004, shelfY - 0.02, zc - w], [len - 0.012, shelfY - 0.02, zc - w],
      [-0.004, shelfY - 0.205, zc + w], [0.02, shelfY - 0.205, zc + w], [-0.004, shelfY - 0.02, zc + w], [len - 0.012, shelfY - 0.02, zc + w],
    ), 0, 0, 0);
  }
}

/** The flags flown on the turret (c2: the 1st batch's vehicles fly a cluster of three cloth flags on their own thin
 * staffs from the turret roof behind the guns, beside a whip; a triangular pennant and two rectangles hanging folded,
 * all large beside their staffs). One cloth piece: stations along its fly, the fly axis drooping `droop` degrees from
 * the hoist, zig-zag folds (flag) or a travelling wave and a 20 degree bank (pennant: the wind lifts its foot, so it
 * reads as a sheet from above too), the foot sagging, the trailing edge ragged. `top` is the hoist's top on the staff. */
function clothFlag(P: TankBuilderPort, top: readonly [number, number, number], fly: Vec2, hoist: number, len: number,
  droop: number, kind: 'pennant' | 'flag', folds: number): void {
  const th = droop * Math.PI / 180, t = 0.003, n = 7, bank = kind === 'pennant' ? Math.tan(20 * Math.PI / 180) : 0;
  const sections = Array.from({ length: n }, (_, k) => {
    const u = k === 0 ? 0.006 : (k / (n - 1)) * len, f = u / len, yc = -u * Math.sin(th);
    const lateral = kind === 'flag' ? (k === 0 ? 0 : (k % 2 ? 1 : -1) * folds * (0.6 + 0.4 * f))
      : folds * Math.sin(f * Math.PI * 2.4) * (0.35 + 0.65 * f);
    let hi: number, lo: number;
    if (kind === 'pennant') {
      hi = yc - (hoist / 2) * f + 0.006 * Math.sin(f * 9);
      lo = yc - hoist + (hoist / 2) * f - 0.02 * Math.sin(Math.PI * f);
      if (k === n - 1) { hi = yc - hoist / 2 + 0.014; lo = hi - 0.034; }
    } else {
      hi = yc + 0.008 * Math.sin(f * 7);
      lo = yc - hoist - 0.03 * Math.sin(Math.PI * f) + (k === n - 1 ? 0.04 : 0) + (k === n - 2 ? -0.015 : 0);
    }
    const mid = (hi + lo) / 2, sh = (y: number): number => lateral + (y - mid) * bank;
    return { z: u * Math.cos(th), ring: ccw([[sh(lo) - t, lo], [sh(lo) + t, lo], [sh(hi) + t, hi], [sh(hi) - t, hi]]) };
  });
  P.add('turretCloth', sectionSolid(sections), top[0], top[1], top[2], 0, Math.atan2(fly[0], fly[1]), 0);
}

/** c2's flag cluster on the turret roof behind the guns, between the commander's hatch and the ventilator dome (where
 * it stands against the sky from the front quarter and the side): a welded socket block, three 13 mm staffs leaning
 * apart (0.88-0.92 m, their tops 12-13 cm apart) with finials, a triangular pennant (0.42 m) streaming from the middle
 * one, two flags (0.26 x 0.34 m) hanging folded from the others, each on a cloth sleeve. Every staff stands from the
 * roof; the cloth hangs 0.3 m and more over the roof, the dome and the hatches, clear of the commander's lid swing. */
function addFlagCluster(P: TankBuilderPort, roofY: number): void {
  const { box, cylY, sph } = KIT;
  const bx = -0.40, bz = -0.84, sockY = roofY + 0.05;
  P.add('turretDetail', box(0.16, 0.018, 0.09), bx, roofY + 0.004, bz);
  P.add('turretDetail', box(0.14, 0.042, 0.06), bx, roofY + 0.03, bz);
  const staffs: Array<{ dx: number; lean: [number, number]; len: number }> = [
    { dx: -0.05, lean: [-0.065, 0.035], len: 0.89 },
    { dx: 0.0, lean: [0.0, -0.055], len: 0.92 },
    { dx: 0.05, lean: [0.075, 0.025], len: 0.88 },
  ];
  const tops: Array<[number, number, number]> = [];
  for (const { dx, lean, len } of staffs) {
    const dir = new THREE.Vector3(lean[0], 1, lean[1]).normalize();
    const base: [number, number, number] = [bx + dx, sockY - 0.03, bz];
    P.add('turretDetail', cylY(0.014, 0.016, 0.05, 10), bx + dx, sockY, bz);
    const at = (d: number): [number, number, number] => [base[0] + dir.x * d, base[1] + dir.y * d, base[2] + dir.z * d];
    P.add('turretDark', tube(base, at(len), 0.0065));
    P.add('turretDetail', sph(0.013, 8), ...at(len));
    tops.push(at(len - 0.02));
  }
  // the hoist sleeves: on each staff over its flag's hoist
  const sleeve = (i: number, hoist: number): void => {
    const dir = new THREE.Vector3(staffs[i].lean[0], 1, staffs[i].lean[1]).normalize();
    const lo: [number, number, number] = [tops[i][0] - dir.x * hoist, tops[i][1] - dir.y * hoist, tops[i][2] - dir.z * hoist];
    P.add('turretCloth', tube(lo, tops[i], 0.011));
  };
  clothFlag(P, tops[1], WIND, 0.22, 0.42, 15, 'pennant', 0.03);
  sleeve(1, 0.22);
  clothFlag(P, tops[0], [WIND[0] * 0.5 - 0.5, WIND[1]], 0.26, 0.34, 64, 'flag', 0.034);
  sleeve(0, 0.26);
  clothFlag(P, tops[2], [WIND[0], WIND[1] * 0.6 + 0.4], 0.26, 0.34, 60, 'flag', 0.032);
  sleeve(2, 0.26);
}

/** The flags stream aft and to the vehicle's left (the wind). */
const WIND: Vec2 = [0.73, -0.683];

function addRadioMasts(P: TankBuilderPort, roofY: number): void {
  const shelfY = 0.400;
  // left flank, just behind the grab rail at the flank/quarter junction (r1: the mast's bell at the roof edge)
  const lz = -0.43, lreach = 0.09;
  mastBracket(P, 'turretDetail', lreach, shelfY, 0.15, [1.14, lz], 0);
  antennaMast(P, 1.14 + lreach, shelfY, lz, 0.63, 3260);
  // right rear corner, out along the corner's bisector (c1: the bell hung outboard of the corner, the mast standing
  // clear); the bracket's root is sunk 3 cm into the corner so its plate meets both faces
  const bx = -0.465, bz = -0.885, bl = Math.hypot(bx, bz);
  const b: Vec2 = [bx / bl, bz / bl];
  const root: Vec2 = [-0.72 - b[0] * 0.03, -1.08 - b[1] * 0.03], rreach = 0.15;
  mastBracket(P, 'turretDetail', rreach, shelfY, 0.17, root, Math.atan2(-b[1], b[0]));
  antennaMast(P, root[0] + b[0] * rreach, shelfY, root[1] + b[1] * rreach, 0.69, 3261);
  // the Russian left roof base stays as a low capped plate, its whip gone (r1: a dark stub on the rear-left roof)
  P.add('turretDetail', KIT.box(0.13, 0.035, 0.13), 0.80, roofY + 0.0075, -0.78);
  P.add('turretDark', KIT.cylY(0.042, 0.048, 0.03, 12), 0.80, roofY + 0.040, -0.78);
}

// ---- gunner station: the 1K13-2 head and the Vesna-K module, two blocks 0.55 m long, the new lamp on its stalk -------
/** c1 at its measure: the second batch's gunner housing is about 0.55 m long and 0.30 m tall over the roof, two blocks
 * one behind the other, the new IR lamp on a bent stalk on top. Front block: the 1K13-2 head (0.30 m wide), its leaning
 * face carrying the twin day/guidance windows under a brow (Tankograd: a Vesna-K sight head is double-windowed). Rear
 * block: the Vesna-K thermal module, wider (0.46 m) and a step taller, its own thermal window on the face that stands
 * clear outboard of the head, an access cover and a grab handle. A welded flange collars the head where it enters the
 * module. Each block lofted across x with chamfered ends and top edges. The rear block steps forward over the gunner's
 * hatch (>= 9.6 cm from its ring; the lid hinged aft swings clear). */
function addGunnerSightHousing(P: TankBuilderPort, d: Bmp3RokTurretDatums): void {
  const { box, cylZ, torus, xform } = KIT;
  const foot = d.roofY - 0.010;
  const block = (rear: number, fz: number, ftz: number, top: number, i: number): Vec2[] => [
    [rear + i, foot], [fz - i, foot], [ftz - i, top - 0.022 - i * 0.5], [ftz - 0.02 - i, top - i],
    [rear + 0.025 + i, top - i], [rear + i, top - 0.025 - i * 0.5],
  ];
  // rear block: the thermal module
  const rTop = 0.835, rF = 0.245, rFT = 0.228, rIn = 0.02, rOut = -0.07;
  const rb = (rear: number, i: number): Vec2[] => block(rear, rF, rFT, rTop, i);
  P.addEquipment('turret', sideLoft([
    { x: 0.40, section: rb(rIn, 0.02) }, { x: 0.42, section: rb(rIn, 0) }, { x: 0.60, section: rb(rIn, 0) },
    { x: 0.68, section: rb(rOut, 0) }, { x: 0.835, section: rb(rOut, 0) }, { x: 0.858, section: rb(rOut, 0.022) },
  ]));
  // front block: the 1K13-2 head, its rear 3 cm inside the thermal module
  const fTop = 0.785, fF = 0.48, fFT = 0.43, hx0 = 0.36, hx1 = 0.66;
  const fb = (i: number): Vec2[] => block(0.20, fF, fFT, fTop, i);
  P.addEquipment('turret', sideLoft([
    { x: hx0, section: fb(0.02) }, { x: hx0 + 0.02, section: fb(0) }, { x: hx1 - 0.02, section: fb(0) },
    { x: hx1, section: fb(0.02) },
  ]));
  // the welded flange collaring the head at the module's face: a band 10-16 mm proud round its top and sides
  const rLean = Math.atan2(rF - rFT, rTop - 0.022 - foot);
  const rFace = (y: number): number => rF - (y - foot) * Math.tan(rLean);
  const fy0 = foot + 0.012, fy1 = fTop - 0.006, fz = rFace((fy0 + fy1) / 2) + 0.004;
  P.add('turretDetail', box(hx1 - hx0 + 0.02, 0.024, 0.03), (hx0 + hx1) / 2, fy1, rFace(fy1) + 0.004);
  for (const x of [hx0 - 0.004, hx1 + 0.004]) P.add('turretDetail', box(0.024, fy1 - fy0, 0.03), x, (fy0 + fy1) / 2, fz);
  // the 1K13-2's twin windows on the front block's leaning face, a brow over them
  const fLean = Math.atan2(fF - fFT, fTop - 0.022 - foot);
  const fFace = (y: number): number => fF - (y - foot) * Math.tan(fLean);
  const onF = (g: THREE.BufferGeometry): THREE.BufferGeometry => xform(g, 0, 0, 0, -fLean, 0, 0);
  for (const [x, y, r] of [[0.448, 0.635, 0.058], [0.585, 0.642, 0.040]] as Array<[number, number, number]>) {
    P.add('turretDark', onF(cylZ(r + 0.018, 0.03, 14)), x, y, fFace(y) + 0.004);
    P.add('turretGlass', onF(cylZ(r, 0.012, 14)), x, y, fFace(y) + 0.016);
  }
  P.add('turretDetail', box(0.29, 0.016, 0.10), 0.51, fTop - 0.018, fFace(fTop - 0.018) + 0.035);
  // the thermal module's window on its face outboard of the front block, under its own hood on two cheek arms
  const onR = (g: THREE.BufferGeometry): THREE.BufferGeometry => xform(g, 0, 0, 0, -rLean, 0, 0);
  const tx = 0.765, ty = 0.665;
  P.add('turretDark', onR(box(0.13, 0.12, 0.03)), tx, ty, rFace(ty) + 0.004);
  P.add('turretGlass', onR(box(0.104, 0.092, 0.012)), tx, ty, rFace(ty) + 0.017);
  P.add('turretDetail', box(0.15, 0.016, 0.09), tx, rTop - 0.018, rFace(rTop - 0.018) + 0.032);
  for (const x of [tx - 0.068, tx + 0.068]) {
    const w = 0.006, yb = ty + 0.05, by = rTop - 0.026;
    P.add('turretDetail', convexSlab(
      [x - w, by, rFace(by) - 0.008], [x - w, by, rFace(by) + 0.07], [x - w, yb, rFace(yb) - 0.006], [x - w, by, rFace(by) - 0.004],
      [x + w, by, rFace(by) - 0.008], [x + w, by, rFace(by) + 0.07], [x + w, yb, rFace(yb) - 0.006], [x + w, by, rFace(by) - 0.004],
    ));
  }
  P.add('turretDetail', box(0.13, 0.15, 0.012), 0.76, foot + 0.17, rOut - 0.004);
  P.add('turretDetail', xform(hoop(0.05, 0.010, true), 0, 0, 0, 0, 0, -Math.PI / 2), 0.854, foot + 0.17, 0.08);

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
 * drum (~0.25 m across, deep) high over the roof, ~0.75 m ahead of the rear (bmp3 keeps it low beside the cupola). An
 * open frame: two 44 mm uprights either side of the drum with a cross tie and a head bar, two rear braces raking down to
 * their own feet, the bent-tube yoke under the drum up to its trunnions, the drum (0.20 m deep) with a rimmed back and
 * the lens, its centre 0.58 m over the roof. The inner upright stands 1.5 cm clear of the cupola's base ring and 7.8 cm
 * outboard of the hatch lid's swing; the TKN-3's view and the roof edge stay clear. */
function addCommanderSearchlight(P: TankBuilderPort, roofY: number): void {
  const { box, cylX, cylZ, torus, xform } = KIT;
  const lx = -0.87, lz = -0.33, ly = roofY + 0.58, r = 0.118, ry = r + 0.03, yb = ly - ry, hw = 0.085, rz = lz - 0.24;
  const kneeY = roofY + 0.24;
  for (const sx of [-1, 1]) {
    const ux = lx + sx * hw;
    P.add('turretDetail', box(0.06, 0.016, 0.07), ux, roofY + 0.004, lz);
    P.add('turretDetail', box(0.05, 0.016, 0.06), ux, roofY + 0.004, rz);
    P.add('turretDetail', tube([ux, roofY - 0.004, lz], [ux, yb + 0.012, lz], 0.022));
    P.add('turretDetail', tube([ux, roofY - 0.004, rz], [ux, kneeY, lz - 0.012], 0.016));
  }
  P.add('turretDetail', tube([lx - hw, kneeY, lz], [lx + hw, kneeY, lz], 0.016));
  P.add('turretDetail', box(2 * hw + 0.05, 0.03, 0.055), lx, yb, lz);
  // the yoke: a bent tube under the drum from trunnion to trunnion, and the trunnion bosses
  P.add('turretDetail', xform(hoop(ry, 0.026, true), 0, 0, 0, 0, 0, Math.PI), lx, ly, lz);
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
