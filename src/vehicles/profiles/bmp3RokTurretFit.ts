// First-party procedural ROK Army BMP-3 turret fit (release 269, the owner 2026-11-03: "make the bmp-3 rok have a lot
// more unique turret than the bmp-3 base"). bmp3_rok keeps the shared welded 2K23 turret (bmp3Family.ts
// buildBmp3WeldedTurret) and carries what the Republic of Korea Army's BMP-3s were photographed with
// (research/bmp3_rok/r269-photos/sources.md):
//   - the Korean radio fit's antenna masts: US-pattern bell bases with their matching drum and spring, hung outboard on
//     welded brackets, one on the left flank behind mid-length (Commons r1, cafe c2) and one on the right rear corner
//     (cafe c1), in place of the Russian roof bases; the left Russian base stays as a capped stub (r1);
//   - the second Bulgom batch's gunner station (namu.wiki and Tank Encyclopedia: the Vesna-K thermal module added for
//     the gunner, the gunner sight's IR searchlight replaced by a new type; cafe c1): the thermal module in its own
//     armoured head outboard of the 1K13-2 with its shutter open over the window, and the new IR searchlight on a yoke
//     over the sight;
//   - the ribbed stowage bin the 3rd Armoured Brigade's vehicles carry on the turret's left rear quarter (Commons r1).
// Frame: bmp3Family.ts's turret frame (+x the vehicle's left, +z forward, y up from the ring plane).
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, FITTINGS, orientedSlab, convexSlab } from './kit.ts';
import { mount } from './fittingMount.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { hoop } from './bentBarHoop.ts';

/** The shared turret's datums the fit seats against (bmp3Family.ts). */
export interface Bmp3RokTurretDatums {
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

// ---- left rear quarter: the chamfer face from the flank junction J to the rear corner R (y 0.17..0.40) -------------
const J: Vec2 = [1.14, -0.47];
const R: Vec2 = [0.72, -1.08];
const CH_LEN = Math.hypot(R[0] - J[0], R[1] - J[1]);
/** yaw that turns a local frame (x outward through the chamfer face, z forward along it) onto the left rear chamfer */
const CH_YAW = Math.atan2(J[0] - R[0], J[1] - R[1]);

/** The ribbed stowage bin on the left rear quarter (Commons r1: a tall box the full height of the turret flank from
 * the rear corner forward ~0.6 m, vertical ribs on its face). Local frame: x out of the chamfer face, z forward along it
 * (z 0 at J), y the turret's. Its inner face is buried 9-21 mm in the chamfer (the face leans out 6 mm over its height);
 * its top runs in over the roof-edge chamfer so no channel opens between bin and shell; its floor (y 0.15) clears the
 * raised troop deck (turret y 0.10 beyond r 1.30) as the turret turns. */
function addLeftQuarterBin(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  const z0 = -(CH_LEN - 0.06), z1 = -0.07;
  const section: Vec2[] = [
    [-0.015, 0.15], [0.160, 0.15], [0.200, 0.19], [0.200, 0.445], [0.186, 0.462], [-0.068, 0.462], [-0.015, 0.40],
  ];
  // the loft runs along local z: its ring is (x, y)
  const bin = sectionSolid([{ z: z0, ring: ccw(section) }, { z: z1, ring: ccw(section) }]);
  const put = (slot: string, g: THREE.BufferGeometry, x: number, y: number, z: number): void =>
    P.add(slot, KIT.xform(g, x, y, z), J[0], 0, J[1], 0, CH_YAW, 0);
  put('turretPaintedDetail', bin, 0, 0, 0);
  // lid: a plate laid on the bin's top with a 12 mm lip over the face, two hinge knuckles at its inner edge
  put('turretPaintedDetail', box(0.240, 0.016, (z1 - z0) + 0.012), 0.092, 0.468, (z0 + z1) / 2);
  for (const z of [z0 + 0.12, z1 - 0.12]) put('turretDetail', cylZ(0.013, 0.09, 8), -0.020, 0.480, z);
  // pressed vertical ribs dividing the face in three, and a hasp under the lid in the two outer panels
  const panel = (z1 - z0) / 3;
  for (const k of [1, 2]) put('turretPaintedDetail', box(0.024, 0.235, 0.028), 0.205, 0.315, z0 + k * panel);
  for (const k of [0.5, 2.5]) {
    put('turretDetail', box(0.022, 0.055, 0.045), 0.206, 0.425, z0 + k * panel);
    put('turretDark', box(0.012, 0.02, 0.026), 0.216, 0.41, z0 + k * panel);
  }
}

// ---- Korean radio masts ---------------------------------------------------------------------------------------------
/** US-pattern antenna mount (the AB-15 bell base, its matching drum and the spring), foot at y 0 on its shelf. */
function antennaMast(P: TankBuilderPort, x: number, y: number, z: number, whipH: number, rake: number, seed: number): void {
  const { lathe, cylY } = KIT;
  P.add('turretDetail', lathe([
    [0.001, 0], [0.072, 0], [0.072, 0.012], [0.058, 0.028], [0.047, 0.055], [0.044, 0.085], [0.044, 0.165],
    [0.034, 0.180], [0.001, 0.182],
  ], 14), x, y, z);
  // the spring: a ribbed coil from the drum's cap to the whip's ferrule
  const coil: number[][] = [[0.001, 0.176]];
  for (let k = 0; k <= 8; k++) coil.push([k % 2 ? 0.0245 : 0.0205, 0.18 + k * 0.0145]);
  coil.push([0.001, 0.30]);
  P.add('turretDark', lathe(coil, 10), x, y, z);
  P.add('turretDark', cylY(0.013, 0.016, 0.035, 8), x, y + 0.31, z);
  mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: whipH, r: 0.010, rake, seed, base: false }),
    x, y + 0.325, z);
}

/** Welded mast bracket: a backing plate on the face, a shelf and a gusset; local x out of the face, foot centre at
 * (reach, shelfY) in that frame. */
function mastBracket(P: TankBuilderPort, slot: string, reach: number, shelfY: number, depth: number,
  at: Vec2, yaw: number): void {
  const { box } = KIT;
  const put = (g: THREE.BufferGeometry, x: number, y: number, z: number): void =>
    P.add(slot, KIT.xform(g, x, y, z), at[0], 0, at[1], 0, yaw, 0);
  put(box(0.018, 0.17, depth), 0.003, shelfY - 0.077, 0);
  put(box(reach + 0.080, 0.016, depth), (reach + 0.080) / 2 - 0.006, shelfY - 0.008, 0);
  const w = 0.006;
  put(convexSlab(
    [-0.004, shelfY - 0.16, -w], [0.016, shelfY - 0.16, -w], [-0.004, shelfY - 0.012, -w], [reach + 0.050, shelfY - 0.012, -w],
    [-0.004, shelfY - 0.16, w], [0.016, shelfY - 0.16, w], [-0.004, shelfY - 0.012, w], [reach + 0.050, shelfY - 0.012, w],
  ), 0, 0, 0);
}

function addRadioMasts(P: TankBuilderPort, roofY: number): void {
  const shelfY = 0.400;
  // left flank, just behind the grab rail at the flank/quarter junction (r1: the mast's bell at the roof edge)
  const lz = -0.41, lreach = 0.075;
  mastBracket(P, 'turretDetail', lreach, shelfY, 0.11, [1.14, lz], 0);
  antennaMast(P, 1.14 + lreach, shelfY, lz, 0.62, 0.03, 3260);
  // right rear corner, out along the corner's bisector (c1: the bell hung outboard of the corner, the mast standing
  // clear); the bracket's root is sunk 3 cm into the corner so its plate meets both faces
  const bx = -0.465, bz = -0.885, bl = Math.hypot(bx, bz);
  const b: Vec2 = [bx / bl, bz / bl];
  const root: Vec2 = [-0.72 - b[0] * 0.03, -1.08 - b[1] * 0.03], rreach = 0.14;
  mastBracket(P, 'turretDetail', rreach, shelfY, 0.11, root, Math.atan2(-b[1], b[0]));
  antennaMast(P, root[0] + b[0] * rreach, shelfY, root[1] + b[1] * rreach, 0.68, -0.04, 3261);
  // the Russian left roof base stays, capped, its whip gone (r1: a dark stub on the rear-left roof)
  P.add('turretDetail', KIT.box(0.13, 0.05, 0.13), 0.80, roofY + 0.015, -0.78);
  P.add('turretDark', KIT.cylY(0.035, 0.045, 0.08, 10), 0.80, roofY + 0.075, -0.78);
  P.add('turretDark', KIT.cylY(0.024, 0.024, 0.02, 10), 0.80, roofY + 0.122, -0.78);
}

// ---- gunner station: the Vesna-K thermal head beside the 1K13-2 and the new IR searchlight over it -------------------
function addGunnerThermalStation(P: TankBuilderPort, d: Bmp3RokTurretDatums): void {
  const { box, cylX, cylY, cylZ, torus, xform } = KIT;
  const { roofY, sight } = d;
  const foot = roofY - 0.010;
  // thermal head: a welded box set 5 cm behind the 1K13-2's face, taller, its front leaning back like the sight's,
  // its outboard top edge chamfered (lofted across x from the 1K13-2's flank)
  const hx0 = sight.x1 - 0.022, hx1 = 0.855, top = sight.top + 0.035;
  const fz0 = sight.z1 - 0.05, fz1 = fz0 - 0.075, rz = -0.05;
  const head = (inset: number): Vec2[] => [
    [rz, foot], [fz0, foot], [fz1 - inset * 0.3, top - inset], [rz + inset, top - inset],
  ];
  P.addEquipment('turret', sideLoft([
    { x: hx0, section: head(0) }, { x: hx1 - 0.03, section: head(0) }, { x: hx1, section: head(0.03) },
  ]));
  const lean = Math.atan2(fz0 - fz1, top - foot);
  const faceZ = (y: number): number => fz0 - (y - foot) * Math.tan(lean);
  const wx = (hx0 + hx1 - 0.03) / 2, wy = foot + 0.165;
  P.add('turretDark', xform(box(0.165, 0.125, 0.03), 0, 0, 0, -lean, 0, 0), wx, wy, faceZ(wy) + 0.004);
  P.add('turretGlass', xform(box(0.135, 0.095, 0.012), 0, 0, 0, -lean, 0, 0), wx, wy, faceZ(wy) + 0.017);
  // its armoured shutter, open: hinged on the head's front top edge, standing up and leaning forward
  const hy = top - 0.004, hz = fz1 + 0.006, open = 0.36, sh = 0.135;
  P.add('turretDetail', cylX(0.014, 0.17, 8), wx, hy, hz);
  P.add('turretDetail', xform(box(0.195, sh, 0.016), 0, 0, 0, open, 0, 0),
    wx, hy + Math.cos(open) * sh / 2, hz + Math.sin(open) * sh / 2 + 0.006);
  // rear access cover, the bolted top plate and a grab handle on the outboard face
  P.add('turretDetail', box(0.17, 0.15, 0.012), wx, foot + 0.17, rz - 0.004);
  P.add('turretDetail', box(0.17, 0.010, 0.20), wx, top + 0.003, (rz + fz1) / 2 - 0.01);
  P.add('turretDetail', xform(hoop(0.05, 0.010, true), 0, 0, 0, 0, 0, -Math.PI / 2), hx1 - 0.004, foot + 0.17, 0.10);

  // the new gunner IR searchlight on a yoke over the 1K13-2 (c1: the drum on top of the sight housing)
  const lx = (sight.x0 + sight.x1) / 2 + 0.005, lz = (sight.z0 + sight.z1) / 2 - 0.005;
  P.add('turretDetail', cylY(0.032, 0.042, 0.075, 10), lx, sight.top + 0.027, lz);
  P.add('turretDetail', box(0.25, 0.022, 0.075), lx, sight.top + 0.072, lz);
  const ly = sight.top + 0.185;
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.022, 0.15, 0.05), lx + s * 0.117, sight.top + 0.145, lz);
    P.add('turretDetail', cylX(0.028, 0.03, 10), lx + s * 0.101, ly, lz);
  }
  P.addEquipment('turret', cylZ(0.098, 0.20, 18, 0.084), lx, ly, lz);
  P.add('turretDetail', cylZ(0.034, 0.03, 10), lx, ly, lz - 0.112);
  P.add('turretDark', xform(torus(0.094, 0.012, 18, 6), 0, 0, 0, Math.PI / 2, 0, 0), lx, ly, lz + 0.10);
  P.add('turretDark', cylZ(0.088, 0.012, 18), lx, ly, lz + 0.100);
  P.add('turretGlass', cylZ(0.060, 0.010, 16), lx, ly, lz + 0.106);
}

/** The ROK Army fit on the shared welded BMP-3 turret (bmp3_rok only). */
export function addBmp3RokTurretFit(P: TankBuilderPort, d: Bmp3RokTurretDatums): void {
  addGunnerThermalStation(P, d);
  addRadioMasts(P, d.roofY);
  addLeftQuarterBin(P);
}
