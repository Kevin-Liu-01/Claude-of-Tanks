// First-party procedural BMP-3 parts (release 268 round b, the owner 2026-11-02: "make a new bmp 3 turret. or add a lot
// more decorations to it", "fix the rectaunglar prisms in teh bmp 3 hulls that look like jutting out from bottom", and
// more upper-glacis and roof detail). Shared by `bmp3` and `bmp3_rok` (round 269: plus bmp3RokTurretFit.ts on the ROK):
//   - buildBmp3WeldedTurret: the welded, faceted two-man turret of the 2K23 complex in place of the round dome: flat
//     undercut sides under a chamfered roof edge, front cheeks swept back either side of the deep gun recess (canvas
//     boot), the 1K13-2 gunner's sight box (left), the commander's cupola with its TKN-3 head and the OU-3GA2 infrared
//     searchlight on its frame (right), 902V Tucha 3+3 on the front cheeks, the rear ventilator dome, antenna bases on
//     the rear corners, grab rails and lifting eyes. Each variant keeps its own gun plant, whips and markings.
//   - addBmp3HullDetail: the folded wave-breaker board over the nose with its hinge line, the two glacis headlights in
//     their bent-tube hoop guards, tow hooks at the nose corners, hatch hinges, handles and bow-gunner periscopes, the
//     right flank's long exhaust slot, the rear doors' firing ports.
//   - addBmp3SternWaterJetFlaps: the stern water-jet outlet flaps, flush under the fender ends (they replace the plain
//     rubber boxes that hung below the stern in the side view).
// Photos followed (research/bmp3/r268b-photos, research/bmp3_rok/photos): Kuzmin BMP-3 (1), (3), (5), ETIF-2010
// (1)-(5); Mike1979 Engineering Technologies 2012 01-04; the ROK Army 3rd Armoured Brigade photograph.
// Frame: +x is the vehicle's LEFT, +z forward, y up; turret parts in the turret frame (ring plane y 0 at world 1.85).
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, FITTINGS, orientedSlab, muzzleBore, muzzleTipDot } from './kit.ts';
import { mount } from './fittingMount.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { hoop } from './bentBarHoop.ts';
import { addBmp3RokTurretFit } from './bmp3RokTurretFit.ts';

type Vec3Tuple = [number, number, number];
export type Bmp3TurretVariant = 'bmp3' | 'bmp3_rok';

interface TurretLevel {
  readonly y: number;
  /** half outline (x >= 0) from the gun recess's back corner forward and round to the rear corner, (x, z) */
  readonly half: ReadonlyArray<readonly [number, number]>;
}

/** Horizontal-section loft: each level is a plan polygon at height y (mirrored about x = 0). */
function levelLoft(levels: readonly TurretLevel[]): THREE.BufferGeometry {
  const sections = levels.map((level) => {
    const right = level.half.map(([x, z]) => [x, -z] as SectionPoint);
    const left = level.half.slice().reverse().map(([x, z]) => [-x, -z] as SectionPoint);
    return { z: level.y, ring: [...right, ...left] };
  });
  // the loft runs along its own +z; turn it upright (loft z -> y, ring y = -plan z -> plan z)
  return KIT.xform(sectionSolid(sections), 0, 0, 0, -Math.PI / 2, 0, 0);
}

/** Shrink a half outline towards (0, zc) by `inset` metres (approximately: along the radius). */
function insetHalf(half: TurretLevel['half'], inset: number, zc = -0.05): Array<[number, number]> {
  return half.map(([x, z]) => {
    const dx = x, dz = z - zc, r = Math.hypot(dx, dz) || 1;
    return [x - (dx / r) * inset, z - (dz / r) * inset];
  });
}

// ---- turret --------------------------------------------------------------------------------------------------------
// Plan from the photographs at the print's envelope (body z -1.09..+1.06, half-width 1.14, roof 0.50 = 2.35 world):
// the shell's foot stays inside r 1.25 below y 0.10 (the raised mid strip's turret-sweep law, 1.29 m off the axis).
const SHELL: readonly TurretLevel[] = [
  { y: 0.06, half: [[0.34, 0.99], [0.36, 1.00], [0.80, 0.74], [1.00, 0.40], [1.02, -0.40], [0.64, -1.00]] },
  { y: 0.17, half: [[0.38, 1.04], [0.40, 1.06], [0.88, 0.78], [1.12, 0.42], [1.14, -0.46], [0.72, -1.07]] },
  { y: 0.40, half: [[0.36, 0.72], [0.40, 1.01], [0.86, 0.75], [1.12, 0.40], [1.14, -0.48], [0.72, -1.09]] },
  { y: 0.50, half: [[0.34, 0.66], [0.38, 0.91], [0.80, 0.68], [1.04, 0.35], [1.06, -0.44], [0.68, -1.03]] },
];
const ROOF_Y = 0.515; // the inset roof plate's top

export function buildBmp3WeldedTurret(P: TankBuilderPort, variant: Bmp3TurretVariant): void {
  const { box, cylX, cylY, cylZ, lathe, torus, xform, periscope, buildGun } = KIT;
  const rok = variant === 'bmp3_rok';
  if (rok) P.gunG.position.set(0, 0.34, 0.62);
  // ring collar on the deck under the shell's foot, the crew basket (a registered turret follower) below
  P.add('turret', cylY(0.975, 1.035, 0.12, 30), 0, 0.0, 0.0);
  P.add('turret', cylY(0.66, 0.70, 1.08, 20), 0, -0.60, 0.02);
  // welded faceted shell and the inset roof plate (its edge reads as the plate joint along the roof chamfer)
  P.add('turret', levelLoft(SHELL));
  const roof = insetHalf(SHELL[3].half, 0.045);
  P.add('turret', levelLoft([{ y: 0.495, half: roof }, { y: ROOF_Y, half: roof }]));
  // canvas boot over the gun recess, from the recess walls onto the mantlet
  const boot = (s: number, y0: number, y1: number): SectionPoint[] => [
    [-0.35 * s, y0], [0.35 * s, y0], [0.35 * s, y1 - 0.06], [0.29 * s, y1 - 0.01], [0.14 * s, y1 + 0.02],
    [-0.14 * s, y1 + 0.02], [-0.29 * s, y1 - 0.01], [-0.35 * s, y1 - 0.06],
  ];
  P.add('turretCloth', sectionSolid([
    { z: 0.62, ring: boot(1.0, 0.30, 0.48) },
    { z: 0.70, ring: boot(1.04, 0.22, 0.52) },
    { z: 0.80, ring: boot(1.02, 0.18, 0.51) },
    { z: 0.88, ring: boot(0.94, 0.18, 0.46) },
    { z: 0.93, ring: boot(0.84, 0.22, 0.40) },
  ]));
  // lifting eyes on the roof edge (bent bars standing on the plate)
  for (const [x, z] of [[0.86, 0.36], [-0.86, 0.36], [0.58, -0.86], [-0.58, -0.86]] as Array<[number, number]>) {
    if (rok && x > 0 && z > 0) continue;                                            // ROK: its sight housing stands here
    P.add('turretDetail', hoop(0.045, 0.012, false), x, ROOF_Y - 0.008, z);
  }

  // ---- gunner (+x, the vehicle's left): hatch with a forward vision block, the 1K13-2 sight box ahead of it --------
  P.add('turret', cylY(0.25, 0.265, 0.045, 20), 0.44, ROOF_Y + 0.012, -0.34);
  P.add('turretHatch', cylY(0.225, 0.235, 0.035, 20), 0.44, ROOF_Y + 0.050, -0.34);
  P.add('turretDark', torus(0.232, 0.008, 20), 0.44, ROOF_Y + 0.036, -0.34);
  P.add('turretDetail', cylX(0.024, 0.17, 10), 0.44, ROOF_Y + 0.045, -0.585);          // hinge knuckle
  P.add('turretDetail', box(0.12, 0.022, 0.024), 0.44, ROOF_Y + 0.078, -0.20);          // lid handle
  periscope(P, 'turretDetail', 0.44, ROOF_Y + 0.040, -0.08, 0);
  // 1K13-2: armoured box leaning back at the front, day and guidance windows side by side, its lamp on top (ROK: one
  // long sight housing that carries the 1K13-2 and the Vesna-K module, its new lamp seated on top, bmp3RokTurretFit.ts)
  const sx0 = 0.33, sx1 = 0.62, sz0 = 0.02, sz1 = 0.36, sTop = 0.79;
  if (!rok) {
    P.addEquipment('turret', orientedSlab(
      [sx0, ROOF_Y - 0.010, sz1], [sx1, ROOF_Y - 0.010, sz1], [sx1, ROOF_Y - 0.010, sz0], [sx0, ROOF_Y - 0.010, sz0],
      [sx0 + 0.02, sTop, sz1 - 0.07], [sx1 - 0.02, sTop, sz1 - 0.07], [sx1 - 0.02, sTop, sz0 + 0.02],
      [sx0 + 0.02, sTop, sz0 + 0.02]));
    const lean = Math.atan2(0.07, sTop - ROOF_Y);
    const faceZ = (y: number): number => sz1 - (y - ROOF_Y) * Math.tan(lean);
    for (const [x, y, r] of [[0.415, 0.66, 0.058], [0.545, 0.67, 0.042]] as Array<[number, number, number]>) {
      P.add('turretDark', xform(cylZ(r + 0.018, 0.03, 14), 0, 0, 0, -lean, 0, 0), x, y, faceZ(y) + 0.004);
      P.add('turretGlass', xform(cylZ(r, 0.012, 14), 0, 0, 0, -lean, 0, 0), x, y, faceZ(y) + 0.016);
    }
    P.add('turretDetail', xform(box(0.27, 0.02, 0.09), 0, 0, 0, -lean, 0, 0), 0.475, 0.745, faceZ(0.745) + 0.035); // visor
    P.add('turretDetail', cylY(0.03, 0.035, 0.06, 10), 0.475, sTop + 0.02, 0.17);
    P.add('turretDetail', cylZ(0.062, 0.11, 14), 0.475, sTop + 0.10, 0.19);
    P.add('turretGlass', cylZ(0.050, 0.012, 14), 0.475, sTop + 0.10, 0.248);
  }

  // ---- commander (-x, the vehicle's right): cupola with vision blocks, the TKN-3 head ahead, OU-3GA2 searchlight ----
  const cx = -0.44, cz = -0.30;
  P.add('turretCupola', cylY(0.285, 0.30, 0.075, 22), cx, ROOF_Y + 0.025, cz);
  P.add('turretHatch', cylY(0.235, 0.245, 0.035, 20), cx, ROOF_Y + 0.078, cz);
  P.add('turretDark', torus(0.242, 0.008, 20), cx, ROOF_Y + 0.064, cz);
  P.add('turretDetail', cylX(0.024, 0.17, 10), cx, ROOF_Y + 0.072, cz - 0.255);
  P.add('turretDetail', box(0.12, 0.022, 0.024), cx, ROOF_Y + 0.106, cz + 0.13);
  for (const a of [-0.95, -0.35, 0.35, 0.95]) {                                       // TNPO blocks in the ring
    const bx = cx + Math.sin(a) * 0.272, bz = cz + Math.cos(a) * 0.272;
    P.add('turretDark', box(0.10, 0.05, 0.05), bx, ROOF_Y + 0.040, bz, 0, a, 0);
    P.add('turretGlass', box(0.08, 0.026, 0.012), bx + Math.sin(a) * 0.025, ROOF_Y + 0.045, bz + Math.cos(a) * 0.025, 0, a, 0);
  }
  P.addEquipment('turret', box(0.20, 0.17, 0.20), cx + 0.02, ROOF_Y + 0.075, 0.04);     // TKN-3 head
  P.add('turretDark', box(0.15, 0.06, 0.02), cx + 0.02, ROOF_Y + 0.105, 0.145);
  P.add('turretGlass', box(0.12, 0.04, 0.012), cx + 0.02, ROOF_Y + 0.105, 0.155);
  P.add('turretDetail', box(0.22, 0.025, 0.06), cx + 0.02, ROOF_Y + 0.170, 0.12);       // rain hood
  // searchlight frame: two posts on the roof right of the cupola, a cradle, the drum and lens, a link to the head
  const lx = -0.80, lz = -0.06, ly = ROOF_Y + 0.27;
  for (const dz of [-0.08, 0.08]) P.add('turretDetail', cylY(0.018, 0.022, 0.22, 8), lx, ROOF_Y + 0.10, lz + dz);
  P.add('turretDetail', box(0.08, 0.04, 0.22), lx, ly - 0.115, lz);
  P.addEquipment('turret', cylZ(0.105, 0.20, 18, 0.09), lx, ly, lz);
  P.add('turretDark', xform(torus(0.098, 0.012, 18, 6), 0, 0, 0, Math.PI / 2, 0, 0), lx, ly, lz + 0.10);
  P.add('turretGlass', cylZ(0.090, 0.012, 18), lx, ly, lz + 0.098);
  P.add('turretDetail', box(0.36, 0.025, 0.03), (lx + cx) / 2 + 0.02, ly - 0.10, lz + 0.05);

  // ---- 902V Tucha: 3+3 on the front cheeks, raised forward and out, each bank on a welded shelf ---------------------
  for (const s of [-1, 1]) {
    const bx = s * 0.655, bz = 0.90;
    P.add('turret', box(0.40, 0.04, 0.16), bx - s * 0.02, 0.405, bz - 0.06, 0, s * 0.52, 0);
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 3, r: 0.05, len: 0.34, spacing: 0.115,
      splay: s * 0.46, pitch: -0.45, arc: 0.20, slot: 'detail',
      seed: 3820 + (s > 0 ? 1 : 0) + (rok ? 10 : 0),
    }), bx, 0.485, bz);
  }

  // ---- rear: ventilator dome, antenna bases on the rear corners, grab rails along the sides -------------------------
  P.add('turret', lathe([[0.15, 0], [0.15, 0.03], [0.12, 0.065], [0.06, 0.085], [0, 0.09]], 18), 0, ROOF_Y - 0.008, -0.74);
  P.add('turretDark', torus(0.152, 0.008, 18), 0, ROOF_Y + 0.004, -0.74);
  for (const s of [-1, 1]) {
    const ax = s * 0.80, az = -0.78;
    if (!rok) {                                     // ROK: the Korean radios' masts on brackets (bmp3RokTurretFit.ts)
      P.add('turretDetail', box(0.13, 0.05, 0.13), ax, ROOF_Y + 0.015, az);
      mount(P, 'turret', FITTINGS.antennaWhip({
        mats: P.mats, h: s < 0 ? 0.72 : 0.60, r: 0.011, rake: -s * 0.04, seed: 3830 + (s > 0 ? 1 : 0),
      }), ax, ROOF_Y + 0.040, az);
    }
    // grab rail along the upper side: two standoffs welded to the side plate and the bar
    for (const z of [-0.30, 0.22]) P.add('turretDetail', box(0.075, 0.024, 0.024), s * 1.165, 0.33, z);
    P.add('turretDetail', cylZ(0.013, 0.60, 8), s * 1.195, 0.33, -0.04);
  }

  // ---- gun plant: each variant keeps its own (calibres, positions, muzzles); a chamfered mantlet replaces the box ----
  // (cb: the lower edges' chamfer; the BMP-3's 0.12 keeps the depressed mantlet's lower corners over the fore-deck
  // crown's edges as the turret turns, where the round dome used to cover them)
  const mantlet = (w: number, h: number, z0: number, z1: number, cb = 0.06): THREE.BufferGeometry => {
    const c = 0.06;
    const ring = (k: number): SectionPoint[] => {
      const hw = w / 2 * k, hh = h / 2 * k;
      return [[-hw + cb, -hh], [hw - cb, -hh], [hw, -hh + cb], [hw, hh - c], [hw - c, hh], [-hw + c, hh], [-hw, hh - c],
        [-hw, -hh + cb]];
    };
    return sectionSolid([{ z: z0, ring: ring(1) }, { z: z1 - 0.06, ring: ring(1) }, { z: z1, ring: ring(0.90) }]);
  };
  if (rok) {
    P.addGunExtra(mantlet(0.68, 0.42, 0.17, 0.45), 0, 0, 0);
    P.addGunExtra(cylZ(0.14, 0.34, 18, 0.12), 0, 0, 0.62);
    // 2A70: the plain 100 mm tube, 15 cm across as photographed, the 2A72 standing clear beside it
    buildGun(P, { len: 2.72, r: 0.075, sleeve: false, collar: true, baseR: 0.16 });
    muzzleBore(P, { len: 2.72, r: 0.075 });
    P.addGunExtraDark(cylZ(0.034, 1.62, 12), -0.22, 0.03, 1.25);
    P.addGunExtraDark(cylZ(0.046, 0.16, 12), -0.22, 0.03, 2.08);
    muzzleBore(P, { z: 2.16, x: -0.22, y: 0.03, r: 0.034 });
    P.addGunExtraDark(cylZ(0.016, 0.95, 8), 0.21, 0.02, 0.92);
    muzzleTipDot(P, 0.21, 0.02, 1.395, 0.010, { parent: 'gunG' });
    P.decal('turret', 'number', 'ROK 3', 0.18, [1.146, 0.27, 0.27] as Vec3Tuple, Math.PI / 2);
    addBmp3RokTurretFit(P, { roofY: ROOF_Y, sight: { x0: sx0, x1: sx1, z0: sz0, z1: sz1, top: sTop } });
    P.topY = Math.max(P.topY || 0, 1.14);
    return;
  }
  P.addGunExtra(mantlet(0.56, 0.40, 0.12, 0.48, 0.12), 0, 0, 0);
  P.addGunExtra(cylZ(0.13, 0.30, 16, 0.10), 0, 0, 0.58);
  buildGun(P, { len: 2.68, r: 0.058, sleeve: false, collar: true, baseR: 0.135 });
  muzzleBore(P, { len: 2.68, r: 0.058 });
  P.addGunExtraDark(cylZ(0.030, 1.40, 10), -0.16, 0.01, 1.50);                        // 30 mm 2A72
  P.addGunExtraDark(cylZ(0.040, 0.22, 10), -0.16, 0.01, 2.10);
  muzzleBore(P, { z: 2.21, x: -0.16, y: 0.01, r: 0.036 });
  P.addGunExtraDark(cylZ(0.014, 0.55, 8), 0.20, 0.04, 1.00);                          // coaxial PKT
  muzzleTipDot(P, 0.20, 0.04, 1.29, 0.010, { parent: 'gunG' });
  P.decal('turret', 'number', '331', 0.22, [1.146, 0.27, -0.05] as Vec3Tuple, Math.PI / 2);
  P.decal('turret', 'number', '331', 0.22, [-1.146, 0.27, -0.05] as Vec3Tuple, -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.86);
}

// ---- hull ----------------------------------------------------------------------------------------------------------
/** Nose lip face (buildBMP3Hull's raked lip): z at height y, and its outward normal (y, z). */
const LIP_Z = (y: number): number => 3.57 - (y - 1.10) * (0.15 / 0.42);
const LIP_N: [number, number] = (() => { const l = Math.hypot(0.15 / 0.42, 1); return [(0.15 / 0.42) / l, 1 / l]; })();
/** Upper glacis face (y at z), 2.34..3.00. */
const GLACIS_Y = (z: number): number => 1.66 + (3.00 - z) * (0.14 / 0.66);

export function addBmp3HullDetail(P: TankBuilderPort): void {
  const { box, cylX, cylY, cylZ, xform, periscope } = KIT;
  const lip = (x: number, y: number, off: number): Vec3Tuple => [x, y + off * LIP_N[0], LIP_Z(y) + off * LIP_N[1]];
  const lipLean = Math.atan2(0.15, 0.42);
  // folded wave-breaker board over the nose: a clean plate (12 mm buried, 18 mm proud) and its hinges along the top
  // (photo p7: no bolt rows or joint strips on its face)
  const board = (x0: number, x1: number, y0: number, y1: number, a: number, b: number): THREE.BufferGeometry =>
    orientedSlab(lip(x0, y0, a), lip(x1, y0, a), lip(x1, y0, b), lip(x0, y0, b),
      lip(x0, y1, a), lip(x1, y1, a), lip(x1, y1, b), lip(x0, y1, b));
  P.add('hull', board(-0.96, 0.96, 1.16, 1.49, -0.012, 0.018));
  for (const x of [-0.66, 0.0, 0.66]) {
    P.add('hullDetail', xform(cylX(0.030, 0.20, 10), 0, 0, 0, 0, 0, 0), x, 1.525, LIP_Z(1.525) - 0.012);
    P.add('hullDetail', xform(box(0.16, 0.06, 0.03), 0, 0, 0, -lipLean, 0, 0), x, 1.47, LIP_Z(1.47) + 0.022);
  }
  // tow hooks on the nose corners: a seat block in the lip and vane and the open hook
  for (const s of [-1, 1]) {
    const x = s * 0.99, y = 1.40;
    P.add('hullDetail', box(0.10, 0.11, 0.10), x, y, LIP_Z(y) + 0.03);
    // the U hangs under the block, its ends inside it
    P.add('hullDark', xform(hoop(0.045, 0.015, true), 0, 0, 0, Math.PI, 0, 0), x, 1.37, LIP_Z(y) + 0.052);
  }
  // headlights in bent-tube hoop guards on the glacis foot, right of the driver and on the left shoulder
  // (between wave-breaker ribs 1 and 2; the hoops' crown stays 3.8 cm under the depressed 2A70 sweeping over them)
  for (const [x, seed] of [[-0.34, 3810], [0.62, 3811]] as Array<[number, number]>) {
    const z = 2.76, yg = GLACIS_Y(z);
    P.add('hullDetail', box(0.09, 0.04, 0.07), x, yg + 0.008, z);
    const lamp = FITTINGS.lightCluster({ nightKind: 'headlight', mats: P.mats, pods: 1, r: 0.045, guard: false,
      rake: -0.12, seed });
    mount(P, 'hull', lamp, x, yg + 0.058, z);
    for (const dz of [-0.052, 0.052]) {
      for (const dx of [-0.060, 0.060]) P.add('hullDetail', cylY(0.011, 0.011, 0.066, 6), x + dx, yg + 0.025, z + dz);
      P.add('hullDetail', hoop(0.060, 0.010, true), x, yg + 0.056, z + dz);
    }
    P.add('hullDetail', cylZ(0.010, 0.115, 6), x, yg + 0.116, z);
  }
  // driver's hatch (centre) and the bow gunners' hatches: hinge knuckles, handles, the gunners' vision blocks
  P.add('hullDetail', cylX(0.024, 0.20, 10), -0.04, 1.868, 1.615);
  P.add('hullDetail', box(0.12, 0.022, 0.024), -0.04, 1.876, 1.99);
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylZ(0.022, 0.16, 10), s * 0.925, 1.815, 2.06);
    P.add('hullDetail', box(0.022, 0.022, 0.11), s * 0.60, 1.822, 2.06);
    periscope(P, 'hullDetail', s * 0.66, 1.83, 2.27, s * 0.20);
  }
  // rear troop hatches: a second hinge knuckle and the lock handle on each
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylZ(0.022, 0.14, 10), s * 0.69, 1.872, -2.85);
    P.add('hullDetail', box(0.024, 0.022, 0.16), s * 0.12, 1.896, -2.45);
    // firing port in each rear door (photo: the plug and its lever, here under the stern grille band)
    P.add('hullDetail', cylZ(0.055, 0.03, 14), s * 0.40, 1.24, -3.605);
    P.add('hullDark', cylZ(0.028, 0.012, 10), s * 0.40, 1.24, -3.622);
    P.add('hullDetail', box(0.10, 0.018, 0.018), s * 0.40 + s * 0.05, 1.24, -3.627, 0, 0, s * 0.5);
  }
  // the right flank's long exhaust slot (photo: dark louvred opening high on the upper side behind the fender bins)
  {
    const x = -1.50, y = 1.63, z = -2.05, len = 1.10, h = 0.18;
    P.add('hullDark', box(0.016, h, len), x - 0.002, y, z);
    for (const dy of [-1, 1]) P.add('hull', box(0.035, 0.03, len + 0.06), x - 0.010, y + dy * (h / 2 + 0.012), z);
    for (const dz of [-1, 1]) P.add('hull', box(0.035, h + 0.054, 0.03), x - 0.010, y, z + dz * (len / 2 + 0.015));
    for (let k = 1; k < 4; k++) P.add('hullDetail', box(0.03, h, 0.025), x - 0.008, y, z - len / 2 + k * len / 4);
  }
}

/** Water-jet outlet flaps at the stern corners: painted steel covers hinged to the rear plate's corner, their lower
 * edge on the fender end's flat underside (y 0.88), outboard of the track's wrap round the sprocket. */
export function addBmp3SternWaterJetFlaps(P: TankBuilderPort): void {
  const { cylX, box } = KIT;
  for (const s of [-1, 1]) {
    const m = (x: number): number => s * x;
    const ring = (x0: number, x1: number, y0: number, y1: number): SectionPoint[] => {
      const r = 0.07;
      const pts: SectionPoint[] = [[x0, y0], [x1 - r, y0]];
      for (let k = 1; k < 4; k++) {
        const a = -Math.PI / 2 + (k / 4) * (Math.PI / 2);
        pts.push([x1 - r + Math.cos(a) * r, y0 + r + Math.sin(a) * r]);
      }
      pts.push([x1, y0 + r], [x1, y1], [x0, y1]);
      return s > 0 ? pts : pts.slice().reverse().map(([x, y]) => [-x, y] as SectionPoint);
    };
    P.add('hull', sectionSolid([
      { z: -3.565, ring: ring(1.21, 1.595, 0.885, 1.315) },
      { z: -3.525, ring: ring(1.21, 1.605, 0.88, 1.32) },
      { z: -3.44, ring: ring(1.21, 1.605, 0.88, 1.32) },
    ]));
    P.add('hullDark', box(0.34, 0.016, 0.02), m(1.40), 1.10, -3.567);                  // stiffener seam
    for (const x of [1.30, 1.52]) P.add('hullDetail', cylX(0.022, 0.08, 10), m(x), 1.315, -3.575); // hinge knuckles
  }
}
