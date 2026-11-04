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

/** The box's plan at one level, its outer faces grown by o and its inner edges sunk eq (chamfer) / er (rear face) into
 * the shell: front end inside, out to the flank face, round the square outer corner, along the rear face to the inboard
 * end and back inside along the shell. */
function boxPlan(o: number, eq: number, er: number): Vec2[] {
  const along = (s: number, off: number): Vec2 => [J[0] + DH[0] * s + NQ[0] * off, J[1] + DH[1] * s + NQ[1] * off];
  const zf = BOX.zf + o, sF = (zf - J[1] + eq * NQ[1]) / DH[1], sK = (ZR + er - J[1] + eq * NQ[1]) / DH[1];
  return [[along(sF, -eq)[0], zf], [BOX.xo + o, zf], [BOX.xo + o, BOX.zb - o], [BOX.xi - o, BOX.zb - o],
    [BOX.xi - o, ZR + er], along(sK, -eq)];
}

/** The ribbed, strapped stowage box squaring the turret's left rear corner (Commons r1, measured at 4x: a tall box as
 * high as the turret's side wall, its top level with the roof edge, from the rear forward ~0.6 m, four or five vertical
 * posts on its face, standing ~0.12 m proud of the turret's rear). Its faces run square with the hull (flank face 0.22 m
 * outboard of the turret's side, rear face 0.12 m behind its rear); it hangs on the turret: its inner faces sunk 9-25 mm
 * into the chamfer and rear plates, its lid meeting the roof edge (y 0.50, the roof plate 15 mm higher), its floor
 * (y 0.20) carried by four gusset brackets welded to those plates, an open 10 cm gap under it over the raised troop
 * deck (turret y 0.10) as the turret turns. */
function addLeftRearBox(P: TankBuilderPort): void {
  const { box } = KIT;
  const LIP = 0.025, FLOOR = 0.20, LID = 0.449, TOP = 0.50;
  const eq = (y: number): number => 0.015 + Math.max(0, y - 0.40) * 0.83;
  const er = (y: number): number => 0.015 + Math.max(0, y - 0.40) * 0.60;
  // body, then the lid: a 51 mm band that overhangs the faces by 25 mm, its top edge chamfered
  const levels: Array<[number, number]> = [[FLOOR, -0.030], [FLOOR + 0.03, 0], [0.400, 0], [LID - 0.001, 0],
    [LID, LIP], [TOP - 0.016, LIP], [TOP, 0.006]];
  P.add('turretPaintedDetail', KIT.xform(sectionSolid(levels.map(([y, o]) => ({
    z: y, ring: ccw(boxPlan(o, eq(y), er(y)).map(([x, z]) => [x, -z] as Vec2)),
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
}

// ---- Korean radio masts ---------------------------------------------------------------------------------------------
/** US-pattern antenna mount at AB-15 / MP-65 scale (a 10 cm flanged foot, the matching drum, the spring and the whip's
 * ferrule, 25 cm in all), its foot at y on its shelf. */
function antennaMast(P: TankBuilderPort, x: number, y: number, z: number, whipH: number, rake: number, seed: number): void {
  const { lathe, cylY } = KIT;
  P.add('turretDetail', lathe([
    [0.001, 0], [0.050, 0], [0.050, 0.010], [0.040, 0.022], [0.033, 0.040], [0.031, 0.060], [0.031, 0.112],
    [0.024, 0.124], [0.001, 0.126],
  ], 12), x, y, z);
  const coil: number[][] = [[0.001, 0.120]];
  for (let k = 0; k <= 7; k++) coil.push([k % 2 ? 0.0185 : 0.0155, 0.122 + k * 0.0143]);
  coil.push([0.001, 0.222]);
  P.add('turretDark', lathe(coil, 10), x, y, z);
  P.add('turretDark', cylY(0.011, 0.013, 0.03, 8), x, y + 0.235, z);
  mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: whipH, r: 0.010, rake, seed, base: false }),
    x, y + 0.25, z);
}

/** Welded mast bracket: a backing plate on the face, a shelf and a gusset; local x out of the face, foot centre at
 * (reach, shelfY) in that frame. */
function mastBracket(P: TankBuilderPort, slot: string, reach: number, shelfY: number, depth: number,
  at: Vec2, yaw: number): void {
  const { box } = KIT;
  const put = (g: THREE.BufferGeometry, x: number, y: number, z: number): void =>
    P.add(slot, KIT.xform(g, x, y, z), at[0], 0, at[1], 0, yaw, 0);
  put(box(0.016, 0.14, depth), 0.002, shelfY - 0.066, 0);
  put(box(reach + 0.062, 0.014, depth), (reach + 0.062) / 2 - 0.006, shelfY - 0.007, 0);
  const w = 0.006;
  put(convexSlab(
    [-0.004, shelfY - 0.13, -w], [0.014, shelfY - 0.13, -w], [-0.004, shelfY - 0.011, -w], [reach + 0.040, shelfY - 0.011, -w],
    [-0.004, shelfY - 0.13, w], [0.014, shelfY - 0.13, w], [-0.004, shelfY - 0.011, w], [reach + 0.040, shelfY - 0.011, w],
  ), 0, 0, 0);
}

/** A unit pennant flown from a whip (c2: the 1st batch's whips each fly cloth pennants): a cloth sleeve round the rod
 * over the hoist and an 8 mm cloth panel streaming `fly` (plan unit vector), drooping and rippled. The rod's own path
 * (whipAntennaParts at rake 0: bowed toward -side by amp at the tip) is followed so the sleeve rides the rod. */
function pennant(P: TankBuilderPort, base: readonly [number, number, number], h: number, seed: number, fly: Vec2,
  s0: number, s1: number, len: number): void {
  const side = seed % 2 ? 1 : -1, amp = h * 0.022 + 0.004;
  const shape = (u: number): number => (u * u * (6 - 4 * u + u * u)) / 3;
  const rodX = (u: number): number => base[0] - side * amp * shape(u);
  const hf = h * (s1 - s0), t = 0.004;
  P.add('turretCloth', KIT.cylY(0.016, 0.016, hf + 0.02, 10), (rodX(s0) + rodX(s1)) / 2, base[1] + h * (s0 + s1) / 2, base[2]);
  const wave = [0, 0.024, -0.016, 0.02], drop = [0, -0.012, -0.03, -0.055];
  const flag = sectionSolid(wave.map((xo, k) => ({
    z: 0.008 + k * (len - 0.008) / 3,
    ring: ccw([[xo - t, drop[k]], [xo + t, drop[k]], [xo + t, hf + drop[k] * 0.6], [xo - t, hf + drop[k] * 0.6]]),
  })));
  P.add('turretCloth', flag, rodX(s0), base[1] + h * s0, base[2], 0, Math.atan2(fly[0], fly[1]), 0);
}

/** Both pennants stream one way (the wind): aft and to the vehicle's left. */
const WIND: Vec2 = [0.73, -0.683];

function addRadioMasts(P: TankBuilderPort, roofY: number): void {
  const shelfY = 0.400;
  // left flank, just behind the grab rail at the flank/quarter junction (r1: the mast's bell at the roof edge)
  const lz = -0.41, lreach = 0.062, lh = 0.695;
  mastBracket(P, 'turretDetail', lreach, shelfY, 0.09, [1.14, lz], 0);
  antennaMast(P, 1.14 + lreach, shelfY, lz, lh, 0, 3260);
  pennant(P, [1.14 + lreach, shelfY + 0.25, lz], lh, 3260, WIND, 0.54, 0.92, 0.46);
  // right rear corner, out along the corner's bisector (c1: the bell hung outboard of the corner, the mast standing
  // clear); the bracket's root is sunk 3 cm into the corner so its plate meets both faces
  const bx = -0.465, bz = -0.885, bl = Math.hypot(bx, bz);
  const b: Vec2 = [bx / bl, bz / bl];
  const root: Vec2 = [-0.72 - b[0] * 0.03, -1.08 - b[1] * 0.03], rreach = 0.13, rh = 0.755;
  const rx = root[0] + b[0] * rreach, rz = root[1] + b[1] * rreach;
  mastBracket(P, 'turretDetail', rreach, shelfY, 0.09, root, Math.atan2(-b[1], b[0]));
  antennaMast(P, rx, shelfY, rz, rh, 0, 3261);
  pennant(P, [rx, shelfY + 0.25, rz], rh, 3261, WIND, 0.54, 0.92, 0.46);
  // the Russian left roof base stays as a low capped plate, its whip gone (r1: a dark stub on the rear-left roof)
  P.add('turretDetail', KIT.box(0.13, 0.035, 0.13), 0.80, roofY + 0.0075, -0.78);
  P.add('turretDark', KIT.cylY(0.042, 0.048, 0.03, 12), 0.80, roofY + 0.040, -0.78);
}

// ---- gunner station: the 1K13-2 head and the Vesna-K module, two blocks 0.55 m long, the new lamp on its stalk -------
/** c1 at its measure: the second batch's gunner housing is about 0.55 m long and 0.30 m tall over the roof, two blocks
 * one behind the other, the new IR lamp on a bent stalk on top. Front block: the 1K13-2 head, its leaning face carrying
 * the twin day/guidance windows under a brow (Tankograd: a Vesna-K sight head is double-windowed). Rear block: the
 * Vesna-K thermal module, taller and wider, its own thermal window on the face that stands clear outboard of the front
 * block, an access cover and a grab handle. Each block lofted across x with chamfered ends and top edges. The rear block
 * steps forward over the gunner's hatch (>= 9.6 cm from its ring; the lid hinged aft swings clear). */
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
  const fTop = 0.785, fF = 0.48, fFT = 0.43;
  const fb = (i: number): Vec2[] => block(0.20, fF, fFT, fTop, i);
  P.addEquipment('turret', sideLoft([
    { x: 0.36, section: fb(0.02) }, { x: 0.38, section: fb(0) }, { x: 0.64, section: fb(0) }, { x: 0.66, section: fb(0.02) },
  ]));
  // the 1K13-2's twin windows on the front block's leaning face, a brow over them
  const fLean = Math.atan2(fF - fFT, fTop - 0.022 - foot);
  const fFace = (y: number): number => fF - (y - foot) * Math.tan(fLean);
  const onF = (g: THREE.BufferGeometry): THREE.BufferGeometry => xform(g, 0, 0, 0, -fLean, 0, 0);
  for (const [x, y, r] of [[0.448, 0.635, 0.058], [0.585, 0.642, 0.040]] as Array<[number, number, number]>) {
    P.add('turretDark', onF(cylZ(r + 0.018, 0.03, 14)), x, y, fFace(y) + 0.004);
    P.add('turretGlass', onF(cylZ(r, 0.012, 14)), x, y, fFace(y) + 0.016);
  }
  P.add('turretDetail', box(0.29, 0.016, 0.10), 0.51, fTop - 0.018, fFace(fTop - 0.018) + 0.035);
  // the thermal module's window on its face outboard of the front block, under its own hood
  const rLean = Math.atan2(rF - rFT, rTop - 0.022 - foot);
  const rFace = (y: number): number => rF - (y - foot) * Math.tan(rLean);
  const onR = (g: THREE.BufferGeometry): THREE.BufferGeometry => xform(g, 0, 0, 0, -rLean, 0, 0);
  const tx = 0.758, ty = 0.665;
  P.add('turretDark', onR(box(0.145, 0.12, 0.03)), tx, ty, rFace(ty) + 0.004);
  P.add('turretGlass', onR(box(0.118, 0.092, 0.012)), tx, ty, rFace(ty) + 0.017);
  P.add('turretDetail', box(0.16, 0.016, 0.09), tx, rTop - 0.018, rFace(rTop - 0.018) + 0.032);
  for (const x of [tx - 0.075, tx + 0.072]) {
    const w = 0.006, yb = ty + 0.05, by = rTop - 0.026;
    P.add('turretDetail', convexSlab(
      [x - w, by, rFace(by) - 0.008], [x - w, by, rFace(by) + 0.07], [x - w, yb, rFace(yb) - 0.006], [x - w, by, rFace(by) - 0.004],
      [x + w, by, rFace(by) - 0.008], [x + w, by, rFace(by) + 0.07], [x + w, yb, rFace(yb) - 0.006], [x + w, by, rFace(by) - 0.004],
    ));
  }
  P.add('turretDetail', box(0.13, 0.15, 0.012), 0.76, foot + 0.17, rOut - 0.004);
  P.add('turretDetail', xform(hoop(0.05, 0.010, true), 0, 0, 0, 0, 0, -Math.PI / 2), 0.854, foot + 0.17, 0.08);

  // the new gunner IR searchlight on its bent stalk over the thermal module (c1: the lamp raised on a stalk): a base
  // flange, a 48 mm tube up and over into the lamp's belly, the head a drum about as deep as it is wide with a rimmed back
  const lx = 0.52, lz = 0.075, lr = 0.083, ll = 0.15, ly = rTop + 0.19;
  P.add('turretDetail', KIT.cylY(0.05, 0.055, 0.016, 14), lx, rTop + 0.004, lz - 0.05);
  P.add('turretDetail', tube([lx, rTop - 0.01, lz - 0.05], [lx, ly - lr - 0.03, lz - 0.05], 0.024));
  P.add('turretDetail', tube([lx, ly - lr - 0.035, lz - 0.052], [lx, ly - lr + 0.012, lz - 0.005], 0.024));
  P.add('turretDetail', KIT.cylY(0.03, 0.03, 0.03, 12), lx, ly - lr - 0.005, lz);
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
  addLeftRearBox(P);
}
