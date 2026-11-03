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

// ---- left rear quarter and rear: the chamfer face from the flank junction J to the rear corner R, and the rear face
// (z -1.07..-1.09 over y 0.17..0.40; both faces lean out ~6 mm over that height, the roof-edge chamfer above them) ----
const J: Vec2 = [1.14, -0.47];
const R: Vec2 = [0.72, -1.08];
const CH_LEN = Math.hypot(R[0] - J[0], R[1] - J[1]);
const DH: Vec2 = [(R[0] - J[0]) / CH_LEN, (R[1] - J[1]) / CH_LEN];   // along the chamfer, rearward
const NQ: Vec2 = [-DH[1], DH[0]];                                     // out of the chamfer face
const ZR = -1.08;
/** yaw that turns a local frame (x outward through the chamfer face, z forward along it) onto the left rear chamfer */
const CH_YAW = Math.atan2(J[0] - R[0], J[1] - R[1]);

/** The bin's plan at one level: out dq from the chamfer and dr from the rear face, its inner edges sunk eq / er into the
 * shell; from the front end (0.07 m behind J) round the outer corner to the inboard end (x 0.16) and back inside. */
function binPlan(dq: number, dr: number, eq: number, er: number): Vec2[] {
  const at = (s: number, off: number): Vec2 => [J[0] + DH[0] * s + NQ[0] * off, J[1] + DH[1] * s + NQ[1] * off];
  const sC = (ZR - dr - J[1] - dq * NQ[1]) / DH[1], sK = (ZR + er - J[1] + eq * NQ[1]) / DH[1];
  return [at(0.07, -eq), at(0.07, dq), at(sC, dq), [0.16, ZR - dr], [0.16, ZR + er], at(sK, -eq)];
}

/** The ribbed stowage bin wrapped round the turret's left rear corner (Commons r1: a tall box the full height of the
 * flank from the rear corner forward ~0.6 m with vertical ribs on its face, and stowage standing ~0.12 m proud of the
 * turret's rear behind it). A level loft: its inner faces are sunk 9-25 mm in the shell, its top runs in over the
 * roof-edge chamfer so no channel opens between bin and shell, a lid lip rings its outer faces, its floor (y 0.15)
 * clears the raised troop deck (turret y 0.10 beyond r 1.30) as the turret turns. */
function addLeftRearBin(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  const DQ = 0.20, DR = 0.12, LIP = 0.025;
  const eq = (y: number): number => 0.015 + Math.max(0, y - 0.40) * 0.83;
  const er = (y: number): number => 0.015 + Math.max(0, y - 0.40) * 0.60;
  // body, then the lid: a 51 mm band that overhangs the faces by 25 mm, its top edge chamfered
  const levels: Array<[number, number]> = [[0.150, -0.040], [0.190, 0], [0.400, 0], [0.414, 0], [0.415, LIP],
    [0.448, LIP], [0.466, 0.006]];
  P.add('turretPaintedDetail', KIT.xform(sectionSolid(levels.map(([y, o]) => ({
    z: y, ring: ccw(binPlan(DQ + o, DR + o, eq(y), er(y)).map(([x, z]) => [x, -z] as Vec2)),
  }))), 0, 0, 0, -Math.PI / 2, 0, 0));
  // one face's relief in its own frame (u out of the face, w along it): pressed ribs 32 mm proud at the panel joints,
  // a webbing strap in each outer panel (down the face, over the lid lip and across the lid, its buckle on the face),
  // a hasp on the middle panel under the lid, hinge knuckles on the lid's inner edge over the ribs
  const relief = (put: (slot: string, g: THREE.BufferGeometry, u: number, y: number, w: number) => void,
    out: number, w0: number, w1: number): void => {
    const panel = (w1 - w0) / 3;
    for (const k of [1, 2]) {
      put('turretPaintedDetail', box(0.040, 0.205, 0.045), out + 0.012, 0.295, w0 + k * panel);
      put('turretDetail', cylZ(0.013, 0.09, 8), -0.035, 0.474, w0 + k * panel);
    }
    for (const k of [0.5, 2.5]) {
      const w = w0 + k * panel;
      put('turretCloth', box(0.010, 0.215, 0.045), out + 0.004, 0.300, w);
      put('turretCloth', box(0.010, 0.051, 0.045), out + LIP + 0.004, 0.4405, w);
      const u0 = -0.029, u1 = out + LIP + 0.009;
      put('turretCloth', box(u1 - u0, 0.008, 0.045), (u0 + u1) / 2, 0.469, w);
      put('turretDetail', box(0.024, 0.05, 0.058), out + 0.012, 0.27, w);
    }
    put('turretDetail', box(0.026, 0.08, 0.06), out + 0.009, 0.37, w0 + 1.5 * panel);
    put('turretDark', box(0.02, 0.03, 0.03), out + 0.03, 0.35, w0 + 1.5 * panel);
  };
  // quarter face (local frame: x out of the chamfer, z forward along it from J)
  const qz1 = -(ZR - DR - J[1] - DQ * NQ[1]) / DH[1];
  relief((slot, g, u, y, w) => P.add(slot, KIT.xform(g, u, y, w), J[0], 0, J[1], 0, CH_YAW, 0),
    DQ, -0.07, qz1);
  // rear face (u = out of it, -z; w = x)
  relief((slot, g, u, y, w) => P.add(slot, KIT.xform(g, 0, y, 0, 0, Math.PI / 2, 0), w, 0, ZR - u),
    DR, 0.16, J[0] - DH[0] * qz1 + NQ[0] * DQ);
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

  // the new gunner IR searchlight, seated on the housing's top: a saddle, the drum held down by two clamp bands
  const lx = 0.48, lz = 0.14, lr = 0.088, ly = top + 0.022 + lr - 0.006;
  P.add('turretDetail', box(0.18, 0.025, 0.16), lx, top + 0.0095, lz);
  P.addEquipment('turret', cylZ(lr, 0.20, 18), lx, ly, lz);
  for (const dz of [-0.055, 0.055]) P.add('turretDetail', cylZ(lr + 0.006, 0.025, 18), lx, ly, lz + dz);
  P.add('turretDetail', cylZ(0.034, 0.03, 10), lx, ly, lz - 0.112);
  P.add('turretDark', xform(torus(lr - 0.004, 0.011, 18, 6), 0, 0, 0, Math.PI / 2, 0, 0), lx, ly, lz + 0.10);
  P.add('turretDark', cylZ(lr - 0.010, 0.012, 18), lx, ly, lz + 0.100);
  P.add('turretGlass', cylZ(0.058, 0.010, 16), lx, ly, lz + 0.106);
}

/** The ROK Army fit on the shared welded BMP-3 turret (bmp3_rok only). */
export function addBmp3RokTurretFit(P: TankBuilderPort, d: Bmp3RokTurretDatums): void {
  addGunnerSightHousing(P, d);
  addRadioMasts(P, d.roofY);
  addLeftRearBin(P);
}
