// The Ariete prototypes' turrets (release 269; the owner, 2026-11-03: "make the c1 arietee proto annd c2 ariete hhave
// completeely new turrets"): c1_ariete_proto_serie1 (the C1 prototype) and c2_ariete_proto (the C2 / AMV prototype), both
// built by profiles/italy.ts buildArieteMkSteps. First-party procedural geometry authored from the lane's photographs
// (~/cot-lanes/italy-korea-bmp-267-evidence/research/<id>/photos and research/c1_ariete_preserie/raw) and measured
// against the registered series-C1 print's turret shell (ariete-dustymojito.glb: sliced, never shipped or copied). Every
// coordinate below is the turret rig's frame before the family's x1.10 (italy.ts): x left, y up from the ring seat, z
// forward, the ring's axis at x = z = 0, the gun's trunnion at (0, 0.35, 1.05).
//
// The C1 turret (series C1 photographs 1, 2, 4, 5, 6, the Cavalry School, Hohenfels, SETC and rear views):
// - a long, low welded box with flat vertical walls (+-1.28) and a gently crowned roof (0.86 on the centre, 0.82 at the
//   eaves), falling forward 0.11 m per metre ahead of the hatches;
// - the front: two big composite cheek faces raked 51 degrees from vertical and swept 17 degrees back toward the walls,
//   so the plan is a shallow arrow; an inner bevel each side turns into the narrow gun slot, where the round gun shield
//   collar sits on a squared mantlet block under a sloped brow;
// - the cheek modules' bolted side plates, their rear seam running diagonally down and forward (photographs 1 and 6);
// - the bustle overhanging the engine deck on a raked underside (photograph 6's shadow wedge, the rear view's dark gap);
//   behind it the stowage box tapering to the rear, its top at the eaves, with two bins on its rear face (the rear view);
// - on the roof: the gunner's TURMS sight box at the right front with its windows forward under the raised armoured
//   cover, the commander's panoramic periscope behind it, the commander's raised cupola (right) and the loader's flat
//   hatch (left) side by side, the loader's MG 42/59 on its pintle ahead of his hatch, the long stowage boxes on the
//   rear roof, the whip bases, lifting eyes, a fume vent and the folded crosswind mast;
// - the four 80 mm smoke tubes on each wall, on a bracket shelf at mid-height.
// The C2 turret (C2 photographs 1-5): the same shell under the AMV package: thick bolted wedge plates over both cheek
// faces (more upright than the C1's raked faces, an inner and a main plate each side), a bolted plate over each cheek
// module's side, two-door add-on boxes on the walls behind them, the smoke tubes moved aft onto the bustle, the
// Lothar-SD gunner's sight box with its round lens, the Attila-D commander's sight drum behind it, the loader's 12.7 mm
// behind its two-leaf shield, the meteorological mast, the APU at the right rear and two whips.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { mount as addFitting } from './fittingMount.ts';
import { convexBlock } from './arieteTurretParts.ts';
import { boltHeads } from './arieteMkParts.ts';
import { sampleArmorFace } from './armorFaceSampling.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type V3 = [number, number, number];
type Mark = 'c1' | 'c2';

export type ArieteTurretPort = Omit<TankBuilderPort, 'addGunExtra' | 'addGunExtraDark'> & {
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
};

/** italy.ts's face-seated cassette (faceSeatedArmorCassette on the turret), bound to its builder. */
export type SeatTurretCassette = (face: { point: THREE.Vector3; normal: THREE.Vector3; dv?: THREE.Vector3 },
  courseAxis: THREE.Vector3, w: number, h: number, d: number, embed: number) => void;

// ---- the shell's measured lines ----------------------------------------------------------------------------------
// print slices (r269/turrets/print): walls +-1.335 x 0.974 = +-1.30 (held at the spec's +-1.28), roof 2.34 (centre) to
// 2.30 at the eaves, falling to 2.24 at z 1.3; the cheek faces' contours at 1.85 / 2.02 / 2.20 m give the rake and sweep.
const W = 1.28;                 // wall half-width
const FOOT = 1.23;              // the walls' foot, chamfered in under them
const FLOOR = 0.20;             // the underside, 3 cm over the hull's slab
const CHAMF = 0.06;             // the foot chamfer's height
const CROWN = 0.86, EAVE = 0.82, FLAT = 0.55;   // the roof: flat centre to |x| 0.55, falling to the eaves
const SZ0 = 0.45, SLOPE = 0.11;                 // the roof falls 0.11 per metre ahead of z 0.45
const FZ0 = 2.00, FX0 = 0.29, FY0 = 0.383, FSW = 0.30, FRK = 1.23; // cheek face: z = FZ0 - FSW(|x| - FX0) - FRK(y - FY0)
const BEV_X = 0.46, SLOT_X = 0.235, BEV_BACK = 0.12;                // inner bevel from |x| 0.46 to the slot, 12 cm back
const SLOT_BACK = 1.40, BROW_Y = 0.58;                              // the slot's back wall and the brow over the mantlet
const REAR = -1.95, UNDER_Z0 = -0.85, UNDER_Z1 = -1.30, UNDER_Y = 0.33; // the main box's rear and the bustle's underside
const BOX_FRONT = -1.93, BOX_REAR = -2.45, BOX_TOP = 0.82, BOX_BOT = 0.35, BOX_W1 = 1.16; // rear stowage box
// the C2's add-on front: a plane 4 cm proud of the cheek faces' foot, raked 38 degrees (C2 photographs 2 and 4: its front
// stands more upright than the C1's), so the plates thicken toward the roof, where their tops carry the roof forward
const C2_RAKE = Math.tan(38 * Math.PI / 180), C2_YB = 0.24, C2_PROUD = 0.04;

const crown = (ax: number): number => (ax <= FLAT ? CROWN : CROWN - (CROWN - EAVE) * (ax - FLAT) / (W - FLAT));
/** The roof's height at (x, z). */
export const arieteProtoRoofY = (x: number, z: number): number => crown(Math.abs(x)) - SLOPE * Math.max(0, z - SZ0);
const faceZ = (ax: number, y: number): number => FZ0 - FSW * (ax - FX0) - FRK * (y - FY0);
/** The front's z at |x|, y: the cheek face outboard of the bevel, the bevel inboard of it. */
const frontZ = (ax: number, y: number): number => (ax >= BEV_X ? faceZ(ax, y)
  : faceZ(BEV_X, y) - BEV_BACK * (BEV_X - ax) / (BEV_X - SLOT_X));
/** Where the front meets the roof at |x|: [z, y]. */
function topFront(ax: number): [number, number] {
  const a = frontZ(ax, 0), c = crown(ax), rs = FRK * SLOPE;
  const z = (a - FRK * c - rs * SZ0) / (1 - rs);
  return [z, c - SLOPE * (z - SZ0)];
}
const c2FrontZ = (ax: number, y: number): number => faceZ(ax, C2_YB) + C2_PROUD - C2_RAKE * (y - C2_YB);

const mirror = (pts: readonly V3[], s: number): V3[] => pts.map(([x, y, z]) => [x * s, y, z]);

// ---- the shell ---------------------------------------------------------------------------------------------------
/** The turret body shared by both marks: the welded box, the cheeks, the slot and brow, the rear stowage box and the
 * ring collar. */
export function arieteProtoTurretShell(P: ArieteTurretPort): void {
  const section = (z: number, yb: number): V3[] => [[-FOOT, yb, z], [FOOT, yb, z], [-W, yb + CHAMF, z], [W, yb + CHAMF, z],
    [-W, EAVE, z], [W, EAVE, z], [-FLAT, CROWN, z], [FLAT, CROWN, z]];
  // the welded box from the roof's break back to the bustle's rear plate, its underside raked up behind the ring
  P.add('turret', convexBlock([...section(SZ0, FLOOR), ...section(UNDER_Z0, FLOOR), ...section(UNDER_Z1, UNDER_Y),
    ...section(REAR, UNDER_Y)]));
  // the cheeks: per side three convex pieces between the slot, the bevel's edge, the roof's crease and the wall
  for (const s of [-1, 1]) {
    for (const [xa, xb] of [[SLOT_X, BEV_X], [BEV_X, FLAT], [FLAT, W]] as const) {
      const pts: V3[] = [];
      for (const ax of [xa, xb]) {
        const feet: Array<[number, number]> = ax === W ? [[FOOT, FLOOR], [W, FLOOR + CHAMF]] : [[ax, FLOOR]];
        for (const [bx, by] of feet) pts.push([bx, by, SZ0], [bx, by, frontZ(bx, by)]);
        const [tz, ty] = topFront(ax);
        pts.push([ax, crown(ax), SZ0], [ax, ty, tz]);
      }
      P.add('turret', convexBlock(mirror(pts, s)));
    }
  }
  // the centre between the slot walls, its front the slot's back wall under the brow
  const [tfz, tfy] = topFront(SLOT_X);
  const yk = (frontZ(SLOT_X, 0) - SLOT_BACK) / FRK;
  P.add('turret', convexBlock([-1, 1].flatMap((s) => mirror([[SLOT_X, FLOOR, SZ0], [SLOT_X, FLOOR, SLOT_BACK],
    [SLOT_X, yk, SLOT_BACK], [SLOT_X, CROWN, SZ0], [SLOT_X, tfy, tfz]], s))));
  // the brow over the mantlet: the bevels' inner edge plane across the slot, its underside 6 cm over the gun shield
  const bz = SLOT_BACK - 0.01, byk = (frontZ(SLOT_X, 0) - bz) / FRK, bx = SLOT_X + 0.004;
  P.add('turret', convexBlock([-1, 1].flatMap((s) => mirror([[bx, BROW_Y, bz], [bx, BROW_Y, frontZ(SLOT_X, BROW_Y)],
    [bx, byk, bz]], s))));
  // the rear stowage box (rear view: a full-width box behind the bustle, tapering aft, its top level with the eaves)
  const taper = (z: number): number => W - 0.005 - (W - 0.005 - BOX_W1) * (BOX_FRONT - z) / (BOX_FRONT - BOX_REAR);
  P.add('turret', convexBlock([-1, 1].flatMap((s) => mirror([
    [taper(BOX_FRONT), BOX_BOT, BOX_FRONT], [taper(BOX_REAR), BOX_BOT, BOX_REAR],
    [taper(BOX_FRONT), BOX_TOP, BOX_FRONT], [taper(BOX_REAR + 0.04), BOX_TOP, BOX_REAR + 0.04],
    [taper(BOX_REAR), BOX_TOP - 0.04, BOX_REAR]], s))));
  // the ring collar under the turret, inside the hull's slab and the dark race at every bearing
  P.add('turret', KIT.cylY(0.98, 0.98, 0.305, P.q ? 32 : 18), 0, 0.0525, 0);
}

/** The gun's shield (gun frame: origin on the trunnion): the round collar on its squared mantlet block in the slot. The
 * collar's underside is cut flat at -0.145 and the block's at -0.145 (the accepted 0.15 m keep over the hull slab at the
 * front arc's depression); the coax MG 42/59 keeps its port at (0.165, 0.10). */
export function arieteProtoMantlet(P: ArieteTurretPort): void {
  const seg = P.q ? 18 : 12;
  const ring = (r: number, z: number, cut = -0.145): V3[] => {
    const pts: V3[] = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2, y = Math.sin(a) * r;
      if (y >= cut) pts.push([Math.cos(a) * r, y, z]);
    }
    const xc = Math.sqrt(Math.max(0, r * r - cut * cut));
    pts.push([xc, cut, z], [-xc, cut, z]);
    return pts;
  };
  // collar (photographs 2 and 4: a fat round shield sleeve, its front edge chamfered)
  P.addGunExtra(convexBlock([...ring(0.17, 0.58), ...ring(0.17, 0.98), ...ring(0.150, 1.06, -0.13)]));
  // mantlet block filling the slot behind and under it (photograph 4: squared under the collar), its back on the slot's
  // wall, its top under the brow, its upper front raked back behind the collar
  P.addGunExtra(convexBlock([-0.225, 0.225].flatMap((x) => [[x, -0.145, 0.35], [x, -0.145, 0.64], [x, 0.02, 0.64],
    [x, 0.23, 0.44], [x, 0.23, 0.35]] as V3[])));
  // coax MG 42/59: its port housing on the collar's flank, the throat, the stub muzzle and booster
  P.addGunExtra(KIT.cylZ(0.046, 0.20, 10), 0.165, 0.10, 0.80);
  P.addGunExtraDark(KIT.cylZ(0.030, 0.03, 8), 0.165, 0.10, 0.895);
  P.addGunExtraDark(KIT.cylZ(0.014, 0.06, 8), 0.165, 0.10, 0.92);
  P.addGunExtraDark(KIT.cylZ(0.019, 0.025, 8), 0.165, 0.10, 0.955);
  // the collar's front lip ring and the sleeve's root ring where the tube leaves it
  P.addGunExtraDark(KIT.cylZ(0.115, 0.025, seg), 0, 0, 1.07);
}

// ---- small shared parts -------------------------------------------------------------------------------------------
/** A D-ring lifting eye on its base plate, standing on a surface at y (its plate 6 mm into it). */
function liftingEye(P: ArieteTurretPort, x: number, y: number, z: number, ry = 0): void {
  P.add('turretDetail', KIT.box(0.10, 0.025, 0.07), x, y + 0.006, z, 0, ry, 0);
  P.add('turretDetail', KIT.xform(KIT.torus(0.042, 0.013, P.q ? 12 : 8, 6), 0, 0, 0, Math.PI / 2, 0, 0), x, y + 0.055, z,
    0, ry, 0);
}

/** A periscope head on the roof facing `ry`: armoured housing, dark brow and glass. */
function roofPeriscope(P: ArieteTurretPort, x: number, y: number, z: number, ry = 0): void {
  P.addModuleVisual('optics', 'turret', KIT.box(0.15, 0.09, 0.12), x, y + 0.035, z, 0, ry, 0);
  const f = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
  P.add('turretGlass', KIT.box(0.11, 0.035, 0.008), x + f.x * 0.061, y + 0.045, z + f.z * 0.061, 0, ry, 0);
  P.add('turretDark', KIT.box(0.13, 0.012, 0.03), x + f.x * 0.06, y + 0.074, z + f.z * 0.06, 0, ry, 0);
}

/** Seat a plate's outer-face bolts: points on the face, normal outward. */
function bolts(P: ArieteTurretPort, pts: readonly THREE.Vector3[], n: THREE.Vector3): void {
  if (P.q) boltHeads(P, 'turretDetail', pts, n);
}

// ---- C1 fittings ---------------------------------------------------------------------------------------------------
/** The C1's TURMS gunner's sight (series C1 front view: a box at the roof's right front, the day window and the square
 * thermal window side by side in a dark recess, its armoured cover swung up to stand over them). Foot on the roof. */
function c1TurmsSight(P: ArieteTurretPort, x: number, z: number): void {
  const w = 0.40, d = 0.48, h = 0.21, zf = z + d / 2, zb = z - d / 2;
  const yb = (zz: number): number => arieteProtoRoofY(x, zz) - 0.02;
  const top = arieteProtoRoofY(x, z) + h;
  P.addModuleVisual('optics', 'turret', convexBlock([
    [x - w / 2, yb(zf), zf], [x + w / 2, yb(zf), zf], [x - w / 2, yb(zb), zb], [x + w / 2, yb(zb), zb],
    [x - w / 2, top - 0.04, zf], [x + w / 2, top - 0.04, zf], [x - w / 2, top, zf - 0.05], [x + w / 2, top, zf - 0.05],
    [x - w / 2, top, zb], [x + w / 2, top, zb],
  ]));
  const wy = top - 0.115;
  P.add('turretDark', KIT.box(w * 0.84, 0.10, 0.02), x, wy, zf - 0.004);
  P.add('turretGlass', KIT.box(w * 0.42, 0.072, 0.012), x + w * 0.17, wy, zf + 0.004);        // day window (outboard)
  P.add('turretGlass', KIT.box(w * 0.26, 0.072, 0.012), x - w * 0.22, wy, zf + 0.004);        // thermal window
  P.add('turret', KIT.box(0.018, 0.09, 0.022), x - w * 0.05, wy, zf + 0.002);                 // mullion
  // the armoured cover hinged at the top's front edge, swung up to stand 12 degrees past vertical
  const hz = zf - 0.05;
  P.add('turret', KIT.xform(KIT.xform(KIT.box(w * 0.92, 0.022, 0.20), 0, 0.011, -0.10), 0, 0, 0, Math.PI / 2 - 0.21, 0, 0),
    x, top, hz);
  P.add('turretDark', KIT.box(w * 0.8, 0.03, 0.03), x, top + 0.01, hz);                       // hinge barrel
}

/** The C1 commander's SP-T-694 panoramic periscope (series C1 photographs 1 and 6: a squat drum head on an armoured
 * pedestal, its forward window under a hood). Foot on the roof. */
function c1PanoSight(P: ArieteTurretPort, x: number, z: number): void {
  const seg = P.q ? 18 : 10, y0 = arieteProtoRoofY(x, z) - 0.015;
  P.add('turret', KIT.cylY(0.14, 0.16, 0.08, seg), x, y0 + 0.04, z);                          // armoured pedestal
  P.add('turretDetail', KIT.cylY(0.10, 0.11, 0.08, seg), x, y0 + 0.12, z);                    // turntable column
  const hy = y0 + 0.16;
  P.addModuleVisual('optics', 'turret', KIT.cylY(0.15, 0.15, 0.20, seg), x, hy + 0.10, z);   // drum head
  P.add('turret', KIT.cylY(0.12, 0.15, 0.04, seg), x, hy + 0.22, z);                          // chamfered cap
  P.add('turret', KIT.box(0.22, 0.13, 0.07), x, hy + 0.10, z + 0.14);                          // window housing
  P.add('turretDark', KIT.box(0.18, 0.08, 0.012), x, hy + 0.095, z + 0.172);
  P.add('turretGlass', KIT.box(0.15, 0.055, 0.008), x, hy + 0.095, z + 0.178);
  P.add('turret', KIT.box(0.24, 0.018, 0.07), x, hy + 0.17, z + 0.16);                        // hood
}

/** A raised cupola ring with periscopes round its forward arc and a domed lid hinged aft (the commander's, series C1
 * top view and photograph 1). */
function cupola(P: ArieteTurretPort, x: number, z: number, o: { r: number; h: number; periscopes: number; arc: number;
  arcCentre: number; hinge: V3 }): void {
  const seg = P.q ? 24 : 12, y0 = arieteProtoRoofY(x, z) - 0.02;
  P.addCupola('turret', KIT.cylY(o.r + 0.075, o.r + 0.10, o.h, seg), x, y0 + o.h / 2, z);
  P.add('turretDark', KIT.cylY(o.r + 0.004, o.r + 0.004, 0.012, seg), x, y0 + o.h + 0.003, z);
  P.addHatch('turret', KIT.cylY(o.r - 0.01, o.r, 0.03, seg), x, y0 + o.h + 0.012, z);
  P.addHatch('turret', KIT.xform(KIT.sph(o.r * 0.9, seg, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.16, 1]), x, y0 + o.h + 0.026, z);
  const [hx, , hz] = o.hinge;
  P.add('turretDetail', KIT.box(0.20, 0.05, 0.08), x + hx * (o.r + 0.02), y0 + o.h + 0.02, z + hz * (o.r + 0.02),
    0, Math.atan2(hx, hz), 0);
  for (const dz of [-0.07, 0.07]) {
    P.add('turretDetail', KIT.box(0.014, 0.05, 0.014), x - hx * o.r * 0.4 + dz * hz, y0 + o.h + 0.06, z - hz * o.r * 0.4 + dz * hx);
  }
  P.add('turretDetail', KIT.box(0.16, 0.014, 0.016), x - hx * o.r * 0.4, y0 + o.h + 0.085, z - hz * o.r * 0.4, 0, Math.atan2(hx, hz), 0);
  for (let i = 0; i < o.periscopes; i++) {
    const a = o.arcCentre + (o.periscopes === 1 ? 0 : -o.arc / 2 + o.arc * i / (o.periscopes - 1));
    const px = x + Math.sin(a) * (o.r + 0.075), pz = z + Math.cos(a) * (o.r + 0.075);
    P.addModuleVisual('optics', 'turret', KIT.box(0.13, 0.07, 0.07), px, y0 + o.h - 0.01, pz, 0, a, 0);
    const g = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.037);
    P.add('turretGlass', KIT.box(0.10, 0.03, 0.006), px + g.x, y0 + o.h - 0.008, pz + g.z, 0, a, 0);
  }
}

/** A flat hatch in a low coaming, hinged outboard (the loader's). */
function flatHatch(P: ArieteTurretPort, x: number, z: number, r: number, hingeX: number): void {
  const seg = P.q ? 22 : 12, y0 = arieteProtoRoofY(x, z) - 0.015, ch = 0.06;
  P.addCupola('turret', KIT.cylY(r + 0.06, r + 0.08, ch, seg), x, y0 + ch / 2, z);
  P.add('turretDark', KIT.cylY(r + 0.004, r + 0.004, 0.01, seg), x, y0 + ch + 0.002, z);
  P.addHatch('turret', KIT.cylY(r - 0.012, r, 0.03, seg), x, y0 + ch + 0.012, z);
  P.add('turretDetail', KIT.box(0.08, 0.05, 0.24), x + hingeX * (r + 0.025), y0 + ch + 0.018, z);
  P.add('turretDetail', KIT.box(r * 0.9, 0.012, 0.05), x + hingeX * r * 0.5, y0 + ch + 0.031, z);
  for (const dz of [-0.07, 0.07]) P.add('turretDetail', KIT.box(0.014, 0.045, 0.014), x - hingeX * r * 0.35, y0 + ch + 0.05, z + dz);
  P.add('turretDetail', KIT.box(0.016, 0.014, 0.16), x - hingeX * r * 0.35, y0 + ch + 0.07, z);
}

/** Four 80 mm smoke tubes in a row on a wall's bracket shelf, each pitched up and splayed out toward the bow (series C1
 * photographs 1 and 6; C2 photographs 1 and 4, where the row sits further aft). */
function smokeRow(P: ArieteTurretPort, s: number, zc: number, wallX: number, seed: number, y = 0.54): void {
  P.add('turret', KIT.box(0.11, 0.035, 0.70), s * (wallX + 0.05), y, zc);                     // shelf (1 cm into the wall)
  P.add('turret', KIT.box(0.035, 0.07, 0.06), s * (wallX + 0.015), y - 0.04, zc - 0.30);      // shelf knees
  P.add('turret', KIT.box(0.035, 0.07, 0.06), s * (wallX + 0.015), y - 0.04, zc + 0.30);
  for (const [k, dz] of [-0.24, -0.08, 0.08, 0.24].entries()) {
    addFitting(P, 'turret', FITTINGS.smokeBank({ mats: P.mats, count: 1, r: 0.04, len: 0.26, splay: s * 0.62, pitch: -0.52,
      slot: 'detail', base: false, seed: seed + k }), s * (wallX + 0.055), y + 0.055, zc + dz);
  }
}

/** A stowage box hung on a wall (outer face at |x| wall + depth): body, lid seam, two latches. */
function wallBox(P: ArieteTurretPort, s: number, wallX: number, z0: number, z1: number, y0: number, y1: number, depth: number): void {
  const zc = (z0 + z1) / 2, len = z1 - z0;
  P.addEquipment('turret', convexBlock(mirror([[wallX - 0.01, y0, z0], [wallX - 0.01, y0, z1], [wallX + depth, y0 + 0.02, z0],
    [wallX + depth, y0 + 0.02, z1], [wallX - 0.01, y1, z0], [wallX - 0.01, y1, z1], [wallX + depth - 0.02, y1, z0],
    [wallX + depth - 0.02, y1, z1], [wallX + depth, y1 - 0.02, z0], [wallX + depth, y1 - 0.02, z1]], s)));
  P.add('turretDark', KIT.box(0.006, 0.012, len - 0.04), s * (wallX + depth + 0.001), y1 - 0.06, zc);
  for (const dz of [-len * 0.3, len * 0.3]) P.add('turretDetail', KIT.box(0.02, 0.05, 0.05), s * (wallX + depth + 0.006), y1 - 0.09, zc + dz);
}

/** A louvred panel on a vertical wall at |x| = wallX: a dark recess and raked slats. */
function wallLouvre(P: ArieteTurretPort, s: number, wallX: number, z0: number, z1: number, y0: number, y1: number, slats: number): void {
  const h = y1 - y0, len = z1 - z0;
  P.add('turret', KIT.box(0.02, h + 0.04, len + 0.04), s * (wallX + 0.004), (y0 + y1) / 2, (z0 + z1) / 2); // frame plate
  P.add('turretDark', KIT.box(0.012, h, len), s * (wallX + 0.011), (y0 + y1) / 2, (z0 + z1) / 2);
  for (let k = 0; k < slats; k++) {
    P.add('turretDetail', KIT.box(0.014, Math.min(0.03, h / slats * 0.55), len - 0.02), s * (wallX + 0.016),
      y0 + h * (k + 0.5) / slats, (z0 + z1) / 2, 0, 0, s * 0.35);
  }
}

/** The rear roof's stowage: the long box along the right eave and the transverse box behind the hatches (print roof
 * map; series C1 photographs 1 and 6). Tops 12 cm over the roof. */
function rearRoofBoxes(P: ArieteTurretPort): { transverseTop: number } {
  const eave = arieteProtoRoofY(W, -1.4), top = CROWN + 0.10;
  P.addEquipment('turret', convexBlock([[-1.25, eave - 0.02, -0.95], [-1.25, eave - 0.02, -1.90], [-1.02, crown(1.02) - 0.02, -0.95],
    [-1.02, crown(1.02) - 0.02, -1.90], [-1.25, top - 0.03, -0.95], [-1.25, top - 0.03, -1.90], [-1.02, top, -0.95], [-1.02, top, -1.90]]));
  // the left eave's box (series C1 photograph 1, C2 photograph 4), shorter, ahead of the bustle's corner
  P.addEquipment('turret', convexBlock([[1.25, eave - 0.02, -1.05], [1.25, eave - 0.02, -1.85], [1.02, crown(1.02) - 0.02, -1.05],
    [1.02, crown(1.02) - 0.02, -1.85], [1.25, top - 0.03, -1.05], [1.25, top - 0.03, -1.85], [1.02, top, -1.05], [1.02, top, -1.85]]));
  P.add('turretDark', KIT.box(0.20, 0.006, 0.012), 1.135, top + 0.001, -1.45);
  P.addEquipment('turret', convexBlock([[-1.03, crown(1.03) - 0.02, -1.02], [-1.03, crown(1.03) - 0.02, -1.31],
    [0.20, CROWN - 0.02, -1.02], [0.20, CROWN - 0.02, -1.31], [-1.03, top, -1.02], [-1.03, top, -1.31], [0.20, top, -1.02], [0.20, top, -1.31]]));
  // lid seams and latches
  P.add('turretDark', KIT.box(0.20, 0.006, 0.012), -1.135, top + 0.001, -1.42);
  P.add('turretDark', KIT.box(0.012, 0.006, 0.26), -0.42, top + 0.001, -1.165);
  for (const xx of [-0.80, -0.05]) P.add('turretDetail', KIT.box(0.05, 0.05, 0.02), xx, top - 0.05, -1.315);
  return { transverseTop: top };
}

/** The rear box's two bins on its rear face (rear view), a centre pair of brackets; `apu` puts the C2's APU on the
 * right instead of the bin. */
function rearBins(P: ArieteTurretPort, apu: boolean): void {
  for (const s of [-1, 1]) {
    if (apu && s < 0) continue;
    P.addEquipment('turret', KIT.box(0.46, 0.38, 0.13), s * 0.82, 0.565, BOX_REAR - 0.05);
    P.add('turretDark', KIT.box(0.44, 0.008, 0.008), s * 0.82, 0.70, BOX_REAR - 0.116);         // lid seam
    for (const dx of [-0.13, 0.13]) P.add('turretDetail', KIT.box(0.05, 0.045, 0.02), s * 0.82 + dx, 0.66, BOX_REAR - 0.12);
  }
  for (const xx of [-0.22, 0.22]) {
    P.add('turretDetail', KIT.box(0.07, 0.10, 0.05), xx, 0.52, BOX_REAR - 0.015);
    P.add('turretDark', KIT.box(0.03, 0.06, 0.02), xx, 0.52, BOX_REAR - 0.04);
  }
  if (apu) {
    // C2 photograph 1: the auxiliary power unit in the right rear corner box, louvred on its rear and side
    const x0 = -1.12, x1 = -0.50, z0 = BOX_REAR - 0.17;
    P.addEquipment('turret', convexBlock([[x0, 0.35, BOX_REAR + 0.02], [x1, 0.35, BOX_REAR + 0.02], [x0, 0.35, z0], [x1, 0.35, z0],
      [x0, 0.80, BOX_REAR + 0.02], [x1, 0.80, BOX_REAR + 0.02], [x0, 0.80, z0 + 0.03], [x1, 0.80, z0 + 0.03],
      [x0, 0.77, z0], [x1, 0.77, z0]]));
    P.add('turretDark', KIT.box(0.40, 0.24, 0.012), (x0 + x1) / 2, 0.55, z0 - 0.003);
    for (let k = 0; k < 5; k++) P.add('turretDetail', KIT.box(0.38, 0.018, 0.016), (x0 + x1) / 2, 0.45 + k * 0.05, z0 - 0.009, 0.35, 0, 0);
  }
}

// ---- C2 fittings ---------------------------------------------------------------------------------------------------
/** The C2's Lothar-SD gunner's sight (C2 photographs 3 and 5): a square armoured box at the roof's right front, its face
 * a framed recess holding the big round lens and the square window, the frame's side ears and the brow over them. */
function c2LotharSight(P: ArieteTurretPort, x: number, z: number): void {
  const w = 0.44, d = 0.44, h = 0.27, zf = z + d / 2, zb = z - d / 2;
  const yb = (zz: number): number => arieteProtoRoofY(x, zz) - 0.02;
  const top = arieteProtoRoofY(x, z) + h;
  P.addModuleVisual('optics', 'turret', convexBlock([
    [x - w / 2, yb(zf), zf], [x + w / 2, yb(zf), zf], [x - w / 2, yb(zb), zb], [x + w / 2, yb(zb), zb],
    [x - w / 2, top, zf], [x + w / 2, top, zf], [x - w / 2, top, zb], [x + w / 2, top, zb],
  ]));
  const wy = top - 0.13;
  P.add('turretDark', KIT.box(w * 0.80, 0.17, 0.03), x, wy, zf - 0.01);                         // the face's recess
  P.add('turret', KIT.box(w + 0.03, 0.03, 0.06), x, top - 0.03, zf + 0.02);                     // brow
  for (const s of [-1, 1]) P.add('turret', KIT.box(0.035, 0.20, 0.07), x + s * (w / 2 + 0.005), wy, zf + 0.01); // ears
  const seg = P.q ? 18 : 10;
  P.add('turretGlass', KIT.cylZ(0.055, 0.02, seg), x + 0.07, wy, zf + 0.008);                  // round lens (outboard)
  P.add('turretDark', KIT.cylZ(0.068, 0.012, seg), x + 0.07, wy, zf - 0.002);
  P.add('turretGlass', KIT.box(0.11, 0.10, 0.012), x - 0.09, wy, zf + 0.004);                  // square window
}

/** The C2's Attila-D commander's sight (C2 photographs 1-5): a tall armoured drum on a collar, its forward window behind a
 * mesh guard, a low domed cap with two lifting rings. Foot on the roof. */
function c2AttilaDrum(P: ArieteTurretPort, x: number, z: number): void {
  const seg = P.q ? 22 : 12, y0 = arieteProtoRoofY(x, z) - 0.015, r = 0.19, h = 0.40;
  P.add('turret', KIT.cylY(r + 0.025, r + 0.04, 0.06, seg), x, y0 + 0.03, z);
  P.addModuleVisual('optics', 'turret', KIT.cylY(r, r, h, seg), x, y0 + 0.06 + h / 2, z);
  P.add('turret', KIT.xform(KIT.sph(r, seg, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.28, 1]), x, y0 + 0.06 + h - 0.005, z);
  const wy = y0 + 0.06 + h * 0.6;
  P.add('turret', KIT.box(0.26, 0.20, 0.07), x, wy, z + r - 0.01);                              // window pod
  P.add('turretGlass', KIT.box(0.19, 0.13, 0.012), x, wy, z + r + 0.027);
  P.add('turretDark', KIT.openRackGrid(0.22, 0.17, 0.008, 5, 6), x, wy, z + r + 0.037, Math.PI / 2, 0, 0);
  for (const s of [-1, 1]) {
    P.add('turretDetail', KIT.xform(KIT.torus(0.03, 0.008, P.q ? 10 : 6, 5), 0, 0, 0, Math.PI / 2, 0, 0),
      x + s * 0.12, y0 + 0.06 + h + 0.045, z - 0.02);
  }
}

/** The C2's meteorological mast: a post and its sensor head with three splayed rods (C2 photographs 1, 2 and 4). */
function c2MetMast(P: ArieteTurretPort, x: number, y: number, z: number): void {
  P.add('turretDetail', KIT.cylY(0.035, 0.045, 0.06, 8), x, y + 0.025, z);
  P.add('turretDetail', KIT.cylY(0.018, 0.018, 0.34, 8), x, y + 0.22, z);
  P.add('turretDetail', KIT.cylY(0.035, 0.030, 0.07, 8), x, y + 0.40, z);
  for (let k = 0; k < 3; k++) {
    const a = k * 2 * Math.PI / 3;
    P.add('turretDetail', KIT.xform(KIT.cylY(0.006, 0.006, 0.20, 5), 0, -0.10, 0, 0, 0, 0.75), x, y + 0.42, z, 0, a, 0);
  }
}

// ---- C2 package ------------------------------------------------------------------------------------------------------
/** The C2's add-on cheek front, side plates and wall boxes. Each plate is one visual ERA course (italy.ts's cluster
 * name), counted on the receipt; the boxes are equipment. */
function c2Package(P: ArieteTurretPort, receipt: ArieteProtoTurretReceipt, c2Era: C2EraCounts): void {
  const cluster = (fill: () => void): void => P.visualEraCluster('italy-layered-turret', 'turret', fill);
  const yb = C2_YB;
  for (const s of [-1, 1]) {
    // the front: an inner plate beside the gun and the main plate to the corner (C2 photographs 3 and 5), each a wedge
    // from the cheek face (12 mm into it) to the more upright add-on front, its front edges chamfered
    for (const [xa, xb] of [[BEV_X + 0.01, 0.68], [0.69, W - 0.03]] as const) {
      const pts: V3[] = [];
      for (const [ax, inset] of [[xa, 0.02], [xb, -0.02]] as const) {
        const yt = topFront(ax)[1] - 0.012, xi = ax + inset;
        pts.push([ax, yb, faceZ(ax, yb) - 0.012], [ax, yt, faceZ(ax, yt) - 0.012],
          [ax, yb + 0.02, c2FrontZ(ax, yb + 0.02) - 0.02], [ax, yt - 0.02, c2FrontZ(ax, yt - 0.02) - 0.02],
          [xi, yb + 0.02, c2FrontZ(xi, yb + 0.02)], [xi, yt - 0.02, c2FrontZ(xi, yt - 0.02)],
          [xi, yb, c2FrontZ(xi, yb) - 0.02], [xi, yt, c2FrontZ(xi, yt) - 0.02]);
      }
      cluster(() => {
        P.add('turret', convexBlock(mirror(pts, s)));
        // big bolt heads on the plates (C2 photograph 5: five or six on each cheek's main plate)
        const n = new THREE.Vector3(s * FSW, C2_RAKE, 1).normalize();
        const at = (ax: number, y: number): THREE.Vector3 => new THREE.Vector3(s * ax, y, c2FrontZ(ax, y));
        bolts(P, xb - xa > 0.3 ? [at(xa + 0.09, 0.32), at(xb - 0.09, 0.32), at((xa + xb) / 2, 0.47), at(xa + 0.09, 0.62),
          at(xb - 0.09, 0.62)] : [at((xa + xb) / 2, 0.34), at((xa + xb) / 2, 0.62)], n);
      });
      receipt.c2CheekPlates++;
      c2Era.turretCheekCassettes++;
      c2Era.turretCheekForwardNormalDotMin = Math.min(c2Era.turretCheekForwardNormalDotMin,
        new THREE.Vector3(FSW, C2_RAKE, 1).normalize().z);
    }
    // the cheek module's side: one bolted plate 5 cm proud, its rear edge raked like the C1's seam, its front on the
    // add-on front (C2 photographs 1 and 4), with the oval access panel on it
    const zt = 0.30, zbk = 0.80, yBot = FLOOR + CHAMF;
    const [tz, ty] = [topFront(W)[0], topFront(W)[1] - 0.01];
    const side = (x: number): V3[] => [[x, EAVE - 0.01, zt], [x, EAVE - 0.01, SZ0], [x, ty, tz], [x, ty, c2FrontZ(W, ty) - 0.004],
      [x, yBot, c2FrontZ(W, yBot) - 0.004], [x, yBot, zbk]];
    cluster(() => {
      P.add('turret', convexBlock(mirror([...side(W - 0.045), ...side(W + 0.05)], s)));
      P.add('turret', KIT.box(0.02, 0.24, 0.42), s * (W + 0.058), 0.47, 1.12);                   // access panel
      bolts(P, [[0.85, 0.34], [0.62, 0.62], [1.45, 0.34], [1.70, 0.34], [1.30, 0.68]].map(([zz, yy]) =>
        new THREE.Vector3(s * (W + 0.05), yy, zz)), new THREE.Vector3(s, 0, 0));
    });
    receipt.c2SidePlates++;
    c2Era.turretSideCassettes++;
    // two add-on boxes on the wall behind it (C2 photograph 4: two doors side by side, handles and hinges), each faced
    // with a bolted 25 mm plate (the old shoulder modules' four)
    for (const [z0, z1] of [[-0.52, -0.07], [-0.05, 0.40]] as const) {
      wallBox(P, s, W, z0, z1, 0.25, 0.80, 0.13);
      cluster(() => {
        P.add('turret', KIT.box(0.025, 0.46, z1 - z0 - 0.06), s * (W + 0.13 + 0.0075), 0.52, (z0 + z1) / 2);
        bolts(P, [[z0 + 0.05, 0.31], [z1 - 0.05, 0.31], [z0 + 0.05, 0.73], [z1 - 0.05, 0.73]].map(([zz, yy]) =>
          new THREE.Vector3(s * (W + 0.145), yy, zz)), new THREE.Vector3(s, 0, 0));
      });
      receipt.shoulderModules++;
      c2Era.turretSideCassettes++;
    }
  }
}

// ---- the build -------------------------------------------------------------------------------------------------------
export interface C2EraCounts {
  turretCheekCassettes: number;
  turretSideCassettes: number;
  turretBustleCassettes: number;
  turretCheekForwardNormalDotMin: number;
}

/** What the new turret is, for the receipts (arieteProportions.selftest.mjs). Metres in the builder's frame. */
export interface ArieteProtoTurretReceipt {
  revision: 'r269-photo-turret';
  owner: 'turret';
  mark: Mark;
  wallHalfWidthM: number;
  roofCrownM: number;
  roofEaveM: number;
  cheekRakeDeg: number;
  cheekSweepDeg: number;
  cheekTipZM: number;
  mainRearZM: number;
  stowageRearZM: number;
  bustleUndersideM: number;
  slotHalfWidthM: number;
  c1CheekEra: number;
  c2CheekPlates: number;
  c2SidePlates: number;
  shoulderModules: number;
  smokeTubesPerSide: number;
  maxSupportGapM: number;
}

export function arieteProtoTurretReceipt(mark: Mark): ArieteProtoTurretReceipt {
  return {
    revision: 'r269-photo-turret', owner: 'turret', mark, wallHalfWidthM: W, roofCrownM: CROWN, roofEaveM: EAVE,
    cheekRakeDeg: Math.round(Math.atan(FRK) * 180 / Math.PI), cheekSweepDeg: Math.round(Math.atan(FSW) * 180 / Math.PI),
    cheekTipZM: Math.round(frontZ(BEV_X, FLOOR) * 1000) / 1000, mainRearZM: REAR, stowageRearZM: BOX_REAR,
    bustleUndersideM: UNDER_Y, slotHalfWidthM: SLOT_X, c1CheekEra: 0, c2CheekPlates: 0, c2SidePlates: 0, shoulderModules: 0,
    smokeTubesPerSide: 4, maxSupportGapM: 0,
  };
}

/** The C1's cheek ERA (release 240, the owner's order; italy.ts c1EraReceipt): four columns by two rows of the trials
 * cassettes on each raked cheek face, outboard of the bevel. */
function c1CheekEra(seat: SeatTurretCassette, receipt: ArieteProtoTurretReceipt): number {
  let n = 0;
  for (const s of [-1, 1]) {
    const yt0 = topFront(BEV_X)[1], yt1 = topFront(W - 0.03)[1];
    const q: [V3, V3, V3, V3] = [[s * BEV_X, FLOOR, faceZ(BEV_X, FLOOR)], [s * (W - 0.03), FLOOR + CHAMF, faceZ(W - 0.03, FLOOR + CHAMF)],
      [s * (W - 0.03), yt1, faceZ(W - 0.03, yt1)], [s * BEV_X, yt0, faceZ(BEV_X, yt0)]];
    for (const u of [0.17, 0.39, 0.61, 0.83]) for (const v of [0.27, 0.68]) {
      const face = sampleArmorFace(...q, u, v, [s, 1, 1]);
      seat(face, face.dv, 0.13, 0.055, 0.20, 0.012);
      n++;
    }
  }
  receipt.c1CheekEra = n;
  return n;
}

/** Everything on the shell for one mark: roof, walls, rear and (C2) the package. Returns the receipt. */
export function arieteProtoTurretFittings(P: ArieteTurretPort, o: { mark: Mark; seat: SeatTurretCassette;
  c2Era: C2EraCounts | null }): ArieteProtoTurretReceipt {
  const c2 = o.mark === 'c2';
  const receipt = arieteProtoTurretReceipt(o.mark);
  // ---- walls ----
  for (const s of [-1, 1]) {
    if (!c2) {
      // the cheek module's bolted side plate, 15 mm proud, its rear seam raked down and forward (series C1 photographs 1,
      // 2 and 6, the Cavalry School photograph)
      const zt = 0.28, zbk = 0.86, yBot = FLOOR + CHAMF + 0.005;
      const [tz, ty] = topFront(W);
      const plate = (x: number): V3[] => [[x, EAVE - 0.012, zt], [x, EAVE - 0.012, SZ0], [x, ty - 0.012, tz - 0.012],
        [x, yBot, faceZ(W, yBot) - 0.006], [x, yBot, zbk]];
      P.add('turret', convexBlock(mirror([...plate(W - 0.02), ...plate(W + 0.015)], s)));
      const n = new THREE.Vector3(s, 0, 0);
      bolts(P, [[0.42, 0.74], [0.64, 0.52], [0.85, 0.32], [1.10, 0.30], [1.50, 0.30]].map(([zz, yy]) =>
        new THREE.Vector3(s * (W + 0.015), yy, zz)), n);
      smokeRow(P, s, -0.55, W, 30 + (s > 0 ? 4 : 0));
    } else {
      // (C2 photographs 1 and 4: the row lower on the bustle's wall, at about half its height)
      smokeRow(P, s, -1.02, W, 30 + (s > 0 ? 4 : 0), 0.45);
    }
  }
  if (!c2) {
    // the right bustle side's louvred vent and, behind it on the stowage box, the upright canister (photograph 6); the
    // left bustle side's stowage box and cable hooks (SETC photograph)
    wallLouvre(P, -1, W, -1.84, -1.50, 0.50, 0.72, 5);
    const xc = W - 0.005 - (W - 0.005 - BOX_W1) * (BOX_FRONT + 2.04) / (BOX_FRONT - BOX_REAR) + 0.062;
    P.add('turretDetail', KIT.cylY(0.065, 0.065, 0.34, P.q ? 12 : 8), -xc, 0.58, -2.04);
    for (const yy of [0.47, 0.69]) P.add('turretDark', KIT.box(0.05, 0.02, 0.10), -(xc - 0.04), yy, -2.04);
    wallBox(P, 1, W, -1.55, -1.12, 0.42, 0.78, 0.09);
  }
  for (const zz of [-1.88, -1.66]) P.add('turretDetail', KIT.box(0.05, 0.08, 0.04), W + 0.02, 0.52, zz);
  // ---- roof ----
  liftingEye(P, 1.02, arieteProtoRoofY(1.02, 0.95), 0.95);
  liftingEye(P, -1.08, arieteProtoRoofY(1.08, 1.05), 1.05);
  liftingEye(P, -0.92, arieteProtoRoofY(0.92, -1.75), -1.75, Math.PI / 2);
  const { transverseTop } = rearRoofBoxes(P);
  roofPeriscope(P, 0.30, arieteProtoRoofY(0.30, 0.92) - 0.005, 0.92);
  roofPeriscope(P, -0.30, arieteProtoRoofY(0.30, 0.92) - 0.005, 0.92);
  // fume extractor vent between the hatches, aft
  {
    const seg = P.q ? 14 : 8, y0 = CROWN - 0.012;
    P.add('turretDetail', KIT.cylY(0.075, 0.085, 0.05, seg), 0.0, y0 + 0.025, -0.80);
    P.add('turretDark', KIT.cylY(0.072, 0.072, 0.02, seg), 0.0, y0 + 0.058, -0.80);
    P.add('turretDetail', KIT.xform(KIT.sph(0.11, seg, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.28, 1]), 0.0, y0 + 0.07, -0.80);
  }
  // commander (right): cupola with six periscopes; loader (left): flat hatch
  cupola(P, -0.76, -0.29, { r: 0.28, h: c2 ? 0.10 : 0.12, periscopes: 6, arc: 3.6, arcCentre: -0.35, hinge: [0, 0, -1] });
  flatHatch(P, 0.72, -0.24, 0.29, 1);
  const whip = (x: number, y: number, z: number, h: number, seed: number): void => {
    P.add('turretDark', KIT.cylY(0.04, 0.05, 0.07, 8), x, y + 0.03, z);
    addFitting(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.02, rake: 0, seed }), x, y + 0.06, z);
  };
  if (!c2) {
    c1TurmsSight(P, -0.73, 0.80);
    c1PanoSight(P, -0.93, 0.27);
    // loader's AA MG 42/59 on its pintle ahead of his hatch (series C1 photographs 1 and 4, the Cavalry School photograph)
    const loaderMg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mg3', tone: 'two-tone', elev: 0, shield: false, scale: 0.62,
      seed: 45, working: true, ridingCradle: true });
    loaderMg.name = 'arieteC1LoaderMg';
    addFitting(P, 'turret', loaderMg, 0.78, arieteProtoRoofY(0.78, 0.22), 0.22, [0, 0.3, 0]);
    // folded crosswind mast on the rear roof, its sensor head aft
    P.add('turretDetail', KIT.box(0.06, 0.08, 0.06), 0.35, CROWN + 0.03, -1.18);
    P.add('turretDetail', KIT.cylZ(0.02, 0.50, 8), 0.35, CROWN + 0.04, -1.45);
    P.add('turretDark', KIT.box(0.085, 0.02, 0.02), 0.35, CROWN + 0.06, -1.68);
    P.add('turretDark', KIT.cylY(0.016, 0.016, 0.03, 6), 0.35, CROWN + 0.035, -1.68);
    // one working whip on the right; the left base stowed (the prototype's single set)
    whip(-0.30, transverseTop, -1.16, 1.27, 48);
    P.add('turretDark', KIT.cylY(0.035, 0.045, 0.09, 8), 1.135, transverseTop + 0.04, -1.15);
    receipt.c1CheekEra = c1CheekEra(o.seat, receipt);
  } else {
    c2LotharSight(P, -0.74, 0.86);
    c2AttilaDrum(P, -0.80, 0.36);
    const mg = FITTINGS.pintleMG({ working: true, ridingCradle: true, mats: P.mats, cls: 'm2', tone: 'two-tone', elev: -0.02,
      ammo: true, shield: 'split', scale: 0.95, seed: 46 });
    mg.name = 'arieteC2RemoteRws';
    mg.userData.remoteControlled = true;
    addFitting(P, 'turret', mg, 0.76, arieteProtoRoofY(0.76, 0.22), 0.22, [0, 0, 0]);
    c2MetMast(P, 0.05, transverseTop, -1.17);
    whip(-0.30, transverseTop, -1.16, 1.27, 48);
    whip(1.135, transverseTop, -1.15, 1.05, 52);
    if (o.c2Era) c2Package(P, receipt, o.c2Era);
  }
  rearBins(P, c2);
  return receipt;
}
