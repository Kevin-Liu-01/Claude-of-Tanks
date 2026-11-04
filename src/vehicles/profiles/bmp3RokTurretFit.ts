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
import { KIT, FITTINGS, convexSlab, orientedSlab } from './kit.ts';
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
  const { box, cylZ } = KIT;
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
  // the face), a hasp on the middle panel under the lid, hinge knuckles on the lid's inner edge over the posts
  const faceY = (FLOOR + 0.03 + LID) / 2, faceH = LID - FLOOR - 0.035;
  const relief = (put: (slot: string, g: THREE.BufferGeometry, u: number, y: number, w: number) => void,
    out: number, w0: number, w1: number, inner: (w: number) => number): void => {
    const panel = (w1 - w0) / 5;
    for (const k of [1, 2, 3, 4]) put('turretPaintedDetail', box(0.040, faceH, 0.042), out + 0.012, faceY, w0 + k * panel);
    for (const k of [1, 4]) put('turretDetail', cylZ(0.013, 0.09, 8), inner(w0 + k * panel), TOP + 0.008, w0 + k * panel);
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
  const eTop = eq(TOP);
  relief((slot, g, u, y, w) => P.add(slot, g, 1.10 + u, y, w), BOX.xo - 1.10, BOX.zf, BOX.zb,
    (z) => J[0] + DH[0] * ((z - J[1] + eTop * NQ[1]) / DH[1]) - eTop * NQ[0] + 0.024 - 1.10);
  relief((slot, g, u, y, w) => P.add(slot, KIT.xform(g, 0, y, 0, 0, Math.PI / 2, 0), w, 0, -1.09 - u),
    -1.09 - BOX.zb, BOX.xi, BOX.xo, () => -1.09 - (ZR + er(TOP)) + 0.024);
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

function addRadioMasts(P: TankBuilderPort, roofY: number): void {
  const shelfY = 0.400;
  // left flank, just behind the grab rail at the flank/quarter junction (r1: the mast's bell at the roof edge)
  const lz = -0.41, lreach = 0.062;
  mastBracket(P, 'turretDetail', lreach, shelfY, 0.09, [1.14, lz], 0);
  antennaMast(P, 1.14 + lreach, shelfY, lz, 0.695, 0.03, 3260);
  // right rear corner, out along the corner's bisector (c1: the bell hung outboard of the corner, the mast standing
  // clear); the bracket's root is sunk 3 cm into the corner so its plate meets both faces
  const bx = -0.465, bz = -0.885, bl = Math.hypot(bx, bz);
  const b: Vec2 = [bx / bl, bz / bl];
  const root: Vec2 = [-0.72 - b[0] * 0.03, -1.08 - b[1] * 0.03], rreach = 0.13;
  mastBracket(P, 'turretDetail', rreach, shelfY, 0.09, root, Math.atan2(-b[1], b[0]));
  antennaMast(P, root[0] + b[0] * rreach, shelfY, root[1] + b[1] * rreach, 0.755, -0.04, 3261);
  // the Russian left roof base stays as a low capped plate, its whip gone (r1: a dark stub on the rear-left roof)
  P.add('turretDetail', KIT.box(0.13, 0.035, 0.13), 0.80, roofY + 0.0075, -0.78);
  P.add('turretDark', KIT.cylY(0.042, 0.048, 0.03, 12), 0.80, roofY + 0.040, -0.78);
}

// ---- gunner station: one long armoured sight housing (the 1K13-2 and the Vesna-K module), the new lamp on its top ---
/** c1: the second batch's gunner housing, much longer and taller than the Russian 1K13-2 box, its lamp on top. One welded
 * shell lofted across x: the front face leans back like the 1K13-2's and carries the day/guidance pair and the thermal
 * window; its rear steps forward over the gunner's hatch (>= 8 cm from its ring, the lid hinged aft swings clear); both
 * ends and the top edges chamfered. */
function addGunnerSightHousing(P: TankBuilderPort, d: Bmp3RokTurretDatums): void {
  const { box, cylX, cylZ, torus, xform } = KIT;
  const foot = d.roofY - 0.010, top = 0.850, fz = 0.385, lean = Math.atan2(0.073, 0.323);
  const sec = (rear: number, i: number): Vec2[] => [
    [rear + i, foot], [fz - i, foot], [fz - 0.073 - i, top - 0.022 - i * 0.5], [fz - 0.095 - i, top - i],
    [rear + 0.03 + i, top - i], [rear + i, top - 0.03 - i * 0.5],
  ];
  const rIn = d.sight.z0, rOut = -0.07, x0 = d.sight.x0, x1 = 0.858;
  P.addEquipment('turret', sideLoft([
    { x: x0, section: sec(rIn, 0.02) }, { x: x0 + 0.022, section: sec(rIn, 0) }, { x: 0.56, section: sec(rIn, 0) },
    { x: 0.66, section: sec(rOut, 0) }, { x: x1 - 0.026, section: sec(rOut, 0) }, { x: x1, section: sec(rOut, 0.024) },
  ]));
  const faceZ = (y: number): number => fz - (y - foot) * Math.tan(lean);
  const onFace = (g: THREE.BufferGeometry): THREE.BufferGeometry => xform(g, 0, 0, 0, -lean, 0, 0);
  // the 1K13-2's day and guidance windows (as on bmp3's box) and the Vesna-K's thermal window, one face
  for (const [x, y, r] of [[0.415, 0.66, 0.058], [0.545, 0.67, 0.042]] as Array<[number, number, number]>) {
    P.add('turretDark', onFace(cylZ(r + 0.018, 0.03, 14)), x, y, faceZ(y) + 0.004);
    P.add('turretGlass', onFace(cylZ(r, 0.012, 14)), x, y, faceZ(y) + 0.016);
  }
  const tx = 0.728, ty = 0.665;
  P.add('turretDark', onFace(box(0.17, 0.13, 0.03)), tx, ty, faceZ(ty) + 0.004);
  P.add('turretGlass', onFace(box(0.14, 0.10, 0.012)), tx, ty, faceZ(ty) + 0.017);
  // the brow over the face: the fixed visor over the 1K13-2 pair and the thermal window's armoured shutter, opened up
  // flat on its hinge (knuckles on the top edge) and held there by the cheek arms welded to the face (its stops)
  const by = top - 0.016, bz0 = faceZ(by) - 0.01, bz1 = bz0 + 0.12;
  P.add('turretDetail', box(0.245, 0.016, bz1 - bz0), 0.485, by, (bz0 + bz1) / 2);
  P.add('turretDetail', box(0.205, 0.018, bz1 - bz0), tx, by, (bz0 + bz1) / 2);
  for (const x of [0.67, 0.79]) P.add('turretDetail', cylX(0.012, 0.05, 8), x, by + 0.012, bz0 + 0.012);
  for (const x of [0.365, 0.612, 0.828]) {
    const w = 0.006, yb = foot + 0.235;
    P.add('turretDetail', convexSlab(
      [x - w, by - 0.008, bz0], [x - w, by - 0.008, bz1 - 0.012], [x - w, yb, faceZ(yb) - 0.008], [x - w, by - 0.008, bz0 + 0.004],
      [x + w, by - 0.008, bz0], [x + w, by - 0.008, bz1 - 0.012], [x + w, yb, faceZ(yb) - 0.008], [x + w, by - 0.008, bz0 + 0.004],
    ));
  }
  // rear access cover, the bolted top plate over the thermal module and a grab handle on the outboard end
  P.add('turretDetail', box(0.13, 0.15, 0.012), 0.75, foot + 0.17, rOut - 0.004);
  P.add('turretDetail', box(0.19, 0.008, 0.22), tx, top + 0.002, 0.11);
  P.add('turretDetail', xform(hoop(0.05, 0.010, true), 0, 0, 0, 0, 0, -Math.PI / 2), x1 - 0.004, foot + 0.17, 0.15);

  // the new gunner IR searchlight as c1 shows it on the housing's top (~0.15 m across): a short armoured base welded to
  // the housing, two cheek plates rising from it to the lamp head's trunnions, the head a drum deeper than it is wide
  // with a rimmed flat back
  const lx = 0.48, lz = 0.11, lr = 0.072, ll = 0.15, ly = top + 0.115;
  P.add('turretDetail', orientedSlab(
    [lx - 0.09, top - 0.006, lz + 0.08], [lx + 0.09, top - 0.006, lz + 0.08], [lx + 0.09, top - 0.006, lz - 0.08],
    [lx - 0.09, top - 0.006, lz - 0.08], [lx - 0.075, top + 0.04, lz + 0.065], [lx + 0.075, top + 0.04, lz + 0.065],
    [lx + 0.075, top + 0.04, lz - 0.065], [lx - 0.075, top + 0.04, lz - 0.065]));
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.014, ly - top - 0.02, 0.07), lx + s * (lr + 0.016), (ly + top + 0.04) / 2 - 0.005, lz);
    P.add('turretDetail', cylX(0.026, 0.024, 10), lx + s * (lr + 0.006), ly, lz);
  }
  P.addEquipment('turret', cylZ(lr, ll, 18, lr - 0.004), lx, ly, lz);
  P.add('turretDetail', cylZ(lr - 0.002, 0.016, 18), lx, ly, lz - ll / 2 - 0.006);
  P.add('turretDetail', cylZ(0.026, 0.02, 10), lx, ly, lz - ll / 2 - 0.022);
  P.add('turretDark', xform(torus(lr - 0.002, 0.010, 18, 6), 0, 0, 0, Math.PI / 2, 0, 0), lx, ly, lz + ll / 2);
  P.add('turretDark', cylZ(lr - 0.008, 0.010, 18), lx, ly, lz + ll / 2);
  P.add('turretGlass', cylZ(0.048, 0.008, 14), lx, ly, lz + ll / 2 + 0.005);
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
 * cupola). A 64 mm pedestal tube with a 40 mm rear brace (the A-frame), a bent-tube yoke (36 mm) under the drum up to
 * its trunnions, the drum (0.20 m deep) with a rimmed back and the lens. Clear of the cupola and the hatch lid's swing
 * (x <= -0.70), of the TKN-3's view and of the roof edge. */
function addCommanderSearchlight(P: TankBuilderPort, roofY: number): void {
  const { box, cylX, cylY, cylZ, torus, xform } = KIT;
  const lx = -0.86, lz = -0.33, ly = roofY + 0.31, r = 0.118, ry = r + 0.03, yb = ly - ry;
  // foot plates, the pedestal up into the yoke's bottom and the rear brace into the pedestal
  for (const [z, w] of [[lz, 0.10], [lz - 0.22, 0.08]] as Array<[number, number]>) {
    P.add('turretDetail', box(w, 0.018, w), lx, roofY + 0.005, z);
  }
  P.add('turretDetail', cylY(0.032, 0.036, yb - roofY + 0.01, 12), lx, (yb + roofY) / 2, lz);
  P.add('turretDetail', tube([lx, roofY - 0.004, lz - 0.22], [lx, yb - 0.04, lz - 0.02], 0.020));
  P.add('turretDetail', cylY(0.045, 0.045, 0.03, 12), lx, yb - 0.005, lz);
  // the yoke: a bent tube under the drum from trunnion to trunnion, and the trunnion bosses
  P.add('turretDetail', xform(hoop(ry, 0.018, true), 0, 0, 0, 0, 0, Math.PI), lx, ly, lz);
  for (const sx of [-1, 1]) P.add('turretDetail', cylX(0.034, 0.05, 10), lx + sx * (r + 0.012), ly, lz);
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
