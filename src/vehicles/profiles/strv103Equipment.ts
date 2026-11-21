// The Strv 103 family's hull equipment (274): the fender bins, the fixed Ksp 58 box, the rear plate with the
// autoloader's loading doors, the recovery rope, the whips, lift eyes, shackles, the cleaning-rod tube and the tail lamps.
// First-party: Kevin B. Liu (NOTICE.md).

import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { mount } from './fittingMount.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { FRAMES, casemateFor, type Strv103Mark } from './strv103Frame.ts';

/** The fender run and its lidded stowage bins: three a side over the track (two on the left behind the Ksp 58 box).
 * The concept carries composite modules there instead. */
/** The hull's upper-body half-width at z (strv103Frame.ts CASEMATE), between its stations. */
function hullHalfW(z: number, mark: Strv103Mark): number {
  const st = casemateFor(mark);
  if (z <= st[0].z) return st[0].halfW;
  for (let i = 1; i < st.length; i++) {
    if (z <= st[i].z) return st[i - 1].halfW + (st[i].halfW - st[i - 1].halfW) * (z - st[i - 1].z) / (st[i].z - st[i - 1].z);
  }
  return st[st.length - 1].halfW;
}

/** The fender run (owner 2026-11-20: "make the sideskirts/fender stuff align with hulls"): the plate and its lip follow
 * the hull's own outline from the rear of the track to the beak, tucked 6 cm into the hull side, the outer edge 12 cm out
 * from it (3.60 m over the parallel run, narrowing with the nose); rubber mudflaps hang where the track run ends. The
 * bins stand on the parallel run only, all at one outer plane 4 cm inboard of the lip. The concept marks' modules and the
 * prototype's bare fenders take the same plate. */
export function fenderBins(P: TankBuilderPort, mark: Strv103Mark): void {
  const { box } = KIT;
  const FENDER_Y = 1.515, LIP_BOTTOM = 1.37;
  const zs = [-2.45, -2.02, -0.60, 0.62, 1.55, 2.36, 2.98, 3.30];
  const outAt = (z: number): number => Math.min(1.80, hullHalfW(z, mark) + 0.12);
  for (const s of [-1, 1]) {
    for (let i = 0; i + 1 < zs.length; i++) {
      const z0 = zs[i], z1 = zs[i + 1];
      const i0 = s * (hullHalfW(z0, mark) - 0.06), i1 = s * (hullHalfW(z1, mark) - 0.06), o0 = s * outAt(z0), o1 = s * outAt(z1);
      P.add('hull', orientedSlab(                                                       // the plate
        [i0, FENDER_Y - 0.03, z0], [o0, FENDER_Y - 0.03, z0], [o1, FENDER_Y - 0.03, z1], [i1, FENDER_Y - 0.03, z1],
        [i0, FENDER_Y, z0], [o0, FENDER_Y, z0], [o1, FENDER_Y, z1], [i1, FENDER_Y, z1]));
      const l0 = o0 - s * 0.03, l1 = o1 - s * 0.03;
      P.add('hull', orientedSlab(                                                       // the lip under its edge
        [l0, LIP_BOTTOM, z0], [o0, LIP_BOTTOM, z0], [o1, LIP_BOTTOM, z1], [l1, LIP_BOTTOM, z1],
        [l0, FENDER_Y - 0.03, z0], [o0, FENDER_Y - 0.03, z0], [o1, FENDER_Y - 0.03, z1], [l1, FENDER_Y - 0.03, z1]));
    }
    // the rear mudflap over the track's end, hung from the plate's rear edge
    P.add('hullRubber', box(0.64, 0.30, 0.02), s * 1.29, FENDER_Y - 0.17, -2.44);
  }
  if (mark === 'e' || mark === 'x' || mark === 'p') return;               // modules (e, x); the prototype's bare fenders
  const BIN_OUT = 1.76, BIN_IN = 1.49;
  if (mark === 'b') {
    // the 103B's folded flotation screen in its housing along each side (owner 2026-11-20, with the S-tank photographs:
    // "add more faithful features"): one continuous box on the fender from the tail to the nose boxes, its outer face
    // ribbed by the screen's folds, its lid; the left run starts behind the Ksp 58 box
    for (const s of [-1, 1]) {
      const z0 = s < 0 ? 1.52 : 2.30, z1 = -2.30, len = z0 - z1, zc = (z0 + z1) / 2, h = 0.34, y = FENDER_Y + h / 2;
      const x = s * (BIN_OUT + BIN_IN) / 2, w = BIN_OUT - BIN_IN;
      P.add('hull', box(w, h, len), x, y, zc);
      P.add('hull', box(w + 0.02, 0.025, len + 0.02), x, FENDER_Y + h + 0.0125, zc);
      for (let k = 0; k < 6; k++) P.add('hullPaintedDetail', box(0.016, 0.022, len - 0.06), s * (BIN_OUT + 0.006), FENDER_Y + 0.06 + k * 0.045, zc);
      for (const z of [z1 + 0.05, z0 - 0.05, zc]) P.add('hullDark', box(0.02, h - 0.04, 0.03), s * (BIN_OUT + 0.008), y, z); // strap posts
    }
    return;
  }
  const runs: Record<'l' | 'r', readonly [number, number][]> = {
    r: [[2.00, 0.90], [0.84, -0.36], [-0.42, -1.56]],
    l: [[1.52, 0.30], [0.24, -1.56]],
  };
  for (const [key, s] of [['r', 1], ['l', -1]] as const) {
    for (const [z0, z1] of runs[key]) {
      const len = z0 - z1, zc = (z0 + z1) / 2, x = s * (BIN_OUT + BIN_IN) / 2, w = BIN_OUT - BIN_IN, h = 0.30, y = FENDER_Y + h / 2;
      P.add('hull', box(w, h, len), x, y, zc);                                      // the bin
      P.add('hull', box(w + 0.02, 0.025, len + 0.02), x, y + h / 2 + 0.0125, zc);   // its lid, lapping the walls
      P.add('hullDark', box(0.006, 0.012, len - 0.04), s * (BIN_OUT + 0.002), y + h / 2 - 0.02, zc); // lid seam
      const latches = Math.max(2, Math.round(len / 0.55));
      for (let k = 0; k < latches; k++) {
        const z = z1 + 0.10 + (len - 0.20) * (latches === 1 ? 0.5 : k / (latches - 1));
        P.add('hullDetail', box(0.012, 0.06, 0.04), s * (BIN_OUT + 0.005), y + 0.08, z); // latch
        P.add('hullDark', box(0.03, 0.02, 0.07), s * (BIN_IN + 0.01), y + h / 2 + 0.03, z); // inboard hinge knuckle
      }
    }
  }
}
/** The fixed twin Ksp 58 in its armoured box on the left front fender, worked from inside (family MG identity). */
export function fenderMgBox(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  P.add('hull', box(0.24, 0.16, 0.62), -1.46, 1.595, 1.90);
  P.add('hullDark', box(0.20, 0.015, 0.58), -1.46, 1.68, 1.90);
  for (const dx of [-0.05, 0.05]) {
    P.add('hullDark', cylZ(0.020, 0.26, 6), -1.46 + dx, 1.62, 2.26);
    P.add('hullDetail', cylZ(0.034, 0.05, 10), -1.46 + dx, 1.62, 2.235);             // ball collar
  }
}
/** The rear plate: the autoloader's two loading doors on their hinges, the low exhaust outlets, the shackles and the
 * convoy light. Nothing stands past the tail plane (overall is muzzle to tail). */
export function tail(P: TankBuilderPort, TAIL_Z: number): void {
  const { box, cylZ, cylY } = KIT;
  for (const s of [-1, 1]) {
    const x = s * 0.48;
    P.add('hull', box(0.62, 0.36, 0.012), x, 1.48, TAIL_Z - 0.004);                  // loading door
    P.add('hullDark', box(0.64, 0.012, 0.008), x, 1.665, TAIL_Z - 0.008);
    P.add('hullDark', box(0.012, 0.37, 0.008), x - s * 0.31, 1.48, TAIL_Z - 0.008);
    for (const y of [1.36, 1.60]) P.add('hullDetail', cylY(0.016, 0.016, 0.08, 8), x + s * 0.30, y, TAIL_Z - 0.012);
    P.add('hullDetail', box(0.10, 0.03, 0.02), x - s * 0.18, 1.48, TAIL_Z - 0.010);  // handle
    P.add('hullDark', cylZ(0.075, 0.10, 10), s * 1.02, 1.32, TAIL_Z + 0.045);        // exhaust outlet
    P.add('hullDetail', box(0.26, 0.20, 0.016), s * 1.02, 1.32, TAIL_Z - 0.002);
    const plate = Math.max(TAIL_Z, -3.52);                                          // (the 152's bustle face: its shackles stay on the hull plate)
    P.add('hullDetail', box(0.10, 0.155, 0.10), s * 1.30, 1.3325, plate + 0.06);    // shackle blocks on the tail plate
    P.add('hullDark', KIT.torus(0.05, 0.015, 10), s * 1.30, 1.24, plate + 0.03, Math.PI / 2, 0, 0);
  }
  P.add('hullDetail', box(0.16, 0.07, 0.02), 0, 1.71, TAIL_Z - 0.004);              // convoy light
  P.add('hullGlass', box(0.10, 0.03, 0.006), 0, 1.71, TAIL_Z - 0.015);
}
/** Recovery rope on the right bins' lower face, its straps; the raked whips; lift eyes and bow shackles. */
export function hullFittings(P: TankBuilderPort, mark: Strv103Mark): void {
  const { box, cylY, cylZ, torus, liftEye } = KIT;
  const ropeX = 1.797;                                                              // on the plate, between the bins and the lip
  const rope = new THREE.Group();
  rope.name = 'strv103_side_tow_rope';
  rope.userData.owner = 'hull';
  rope.userData.orientation = 'longitudinal';
  rope.userData.fixedToFender = true;
  if (mark === 'a' || mark === 'b') {
    for (const [z0, z1] of [[-2.10, -0.42], [-0.36, 0.84], [0.90, 2.10]]) {
      const seg = new THREE.Mesh(cylZ(0.019, z1 - z0, P.q ? 12 : 8), P.mats.dark);
      seg.name = 'strv103_side_tow_rope_segment';
      seg.position.set(ropeX - 0.019, 1.54, (z0 + z1) / 2);
      seg.castShadow = true; seg.receiveShadow = true;
      rope.add(seg);
      for (const z of [z0 + 0.12, z1 - 0.12]) P.add('hullDark', box(0.036, 0.03, 0.07), ropeX - 0.019, 1.53, z);
    }
    P.hullG.add(rope);
  }
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.045, 0.055, 0.10, 10), s * 0.92, 1.91, -1.86);
    mount(P, 'hull', FITTINGS.antennaWhip({
      mats: P.mats, h: 1.02, r: 0.012, rake: -0.42, seed: 10440 + (s > 0 ? 1 : 0),
    }), s * 0.92, 1.94, -1.88);
  }
  liftEye(P, 'hullDetail', -1.50, 1.92, 0.55, 0.4); liftEye(P, 'hullDetail', 1.50, 1.906, 0.55, -0.4);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.10, 0.08, 0.10), s * 0.84, 1.06, 2.92);
    P.add('hullDark', torus(0.055, 0.016, 10), s * 0.84, 1.02, 2.98);
  }
  // owner 2026-11-20 ("add all equipment"): the gun's cleaning-rod tube in three clamps on the left bins' lids (the
  // concept's modules), its capped ends; the rear plate's two tail lamps either side of the convoy light
  const lidY = mark === 'e' || mark === 'x' ? 1.84 : 1.8775, rodX = -1.60, TAIL_Z = FRAMES[mark].tailZ;
  if (mark !== 'p') P.add('hullDetail', cylZ(0.045, 1.70, P.q ? 14 : 10), rodX, lidY + 0.045, -0.70);
  for (const z of mark === 'p' ? [] : [-1.50, 0.10]) P.add('hullDark', cylZ(0.050, 0.04, P.q ? 14 : 10), rodX, lidY + 0.045, z + (z < 0 ? -0.07 : 0.07));
  for (const z of mark === 'p' ? [] : [-1.30, -0.70, -0.10]) {
    P.add('hullDark', box(0.12, 0.022, 0.05), rodX, lidY + 0.011, z);
    P.add('hullDark', box(0.016, 0.09, 0.05), rodX + 0.053, lidY + 0.045, z);
    P.add('hullDark', box(0.016, 0.09, 0.05), rodX - 0.053, lidY + 0.045, z);
  }
  for (const s of hasRearBoxes(mark) ? [] : [-1, 1]) {
    P.add('hullDetail', box(0.14, 0.08, 0.02), s * 1.10, 1.70, TAIL_Z - 0.006);
    P.add('hullGlass', box(0.05, 0.04, 0.006), s * 1.10 - 0.03, 1.70, TAIL_Z - 0.018);
    P.add('hullGlass', box(0.05, 0.04, 0.006), s * 1.10 + 0.03, 1.70, TAIL_Z - 0.018);
  }
  if (mark === 'e' || mark === 'x') {
    // the fire control's crosswind sensor on its folding mast behind the radio hatch
    P.add('hullDetail', cylY(0.04, 0.05, 0.05, 10), -0.10, 1.905, -2.08);
    P.add('hullDark', cylY(0.012, 0.014, 0.42, 8), -0.10, 2.14, -2.08);
    P.addEquipment('hull', cylY(0.035, 0.035, 0.09, 10), -0.10, 2.39, -2.08);
    P.add('hullDark', box(0.12, 0.01, 0.01), -0.10, 2.44, -2.08);
  }
}

// ----------------------------------------------------------------------------------------------- the marks' kit --

/** The marks that carry the two rear boxes (the 103A, the 103B builds, the 103E). */
export function hasRearBoxes(mark: Strv103Mark): boolean {
  return mark === 'a' || mark === 'b' || mark === 'e';
}

/** A rounded box's section seen from behind: a rectangle with 6 cm chamfered corners, counter-clockwise. */
function roundedRect(x0: number, x1: number, y0: number, y1: number, c: number): SectionPoint[] {
  return [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]];
}

/** The two rear boxes behind the hull (owner 2026-11-20: "add the 2 rear trhings behind strvs", with the photographs):
 * big rounded stowage boxes on brackets off the rear plate either side of the convoy light, 0.46 m deep (the reference
 * print's rear boxes), inside the published hull length, their lids,
 * latches, red tail lamps and reflectors on their rear faces. */
export function rearBoxes(P: TankBuilderPort, plateZ: number): void {
  const { box } = KIT;
  const Z0 = plateZ, Z1 = plateZ - 0.462, Y0 = 1.26, Y1 = 1.78;            // lamps and reflectors end at the published -3.52
  for (const s of [-1, 1]) {
    const xa = s < 0 ? -1.30 : 0.18, xb = s < 0 ? -0.18 : 1.30, xc = (xa + xb) / 2;
    const full = roundedRect(xa, xb, Y0, Y1, 0.07), inset = roundedRect(xa + 0.03, xb - 0.03, Y0 + 0.03, Y1 - 0.03, 0.06);
    P.add('hull', sectionSolid([{ z: Z1, ring: inset }, { z: Z1 + 0.04, ring: full }, { z: Z0 + 0.02, ring: full }],
      { sideQuadDiagonal: 'convex' }));
    P.add('hullDark', box(xb - xa - 0.04, 0.012, 0.012), xc, Y1 - 0.08, Z1 + 0.025);      // lid seam across the rear face
    for (const dx of [-0.30, 0.30]) P.add('hullDetail', box(0.05, 0.06, 0.02), xc + dx, Y1 - 0.12, Z1 - 0.002); // latches
    const lx = s * 1.08;
    P.add('hullDetail', box(0.16, 0.09, 0.02), lx, 1.62, Z1 - 0.004);                    // tail lamp housing
    P.add('hullGlass', box(0.05, 0.05, 0.006), lx - 0.035, 1.62, Z1 - 0.016);
    P.add('hullGlass', box(0.05, 0.05, 0.006), lx + 0.035, 1.62, Z1 - 0.016);
    P.add('hullGlass', box(0.07, 0.04, 0.006), lx, 1.40, Z1 - 0.004);                   // reflector
    for (const dx of [-0.36, 0.36]) {                                                     // brackets under it to the plate
      P.add('hullDark', box(0.05, 0.05, 0.44), xc + dx, Y0 - 0.025, (Z0 + Z1) / 2 + 0.02);
    }
  }
}
