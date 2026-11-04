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
import { ownFittingGeometry } from '../ownedFittingGeometry.ts';
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
// the slot's back wall, where the old turret's mantlet cavity wall stood (1.67): the gun's breech root and the mantlet
// block's rear stay inside the turret's plan at every bearing (gunHullClearance skips gun stock 6.5 cm inside it), so the
// gun keeps its published side stops over the hull slab's edge; above 0.512 the bevels' inner plane carries it back to the
// roof as the brow over the mantlet
const SLOT_BACK = 1.67;
const REAR = -1.95, UNDER_Z0 = -0.85, UNDER_Z1 = -1.30, UNDER_Y = 0.33; // the main box's rear and the bustle's underside
const BOX_FRONT = -1.93, BOX_REAR = -2.45, BOX_TOP = 0.82, BOX_BOT = 0.35, BOX_W1 = 1.16; // rear stowage box
// the C2's add-on front (r269 round 2, C2 photographs 3 and 5 and the blind critics: "blocky add-on modules with flat
// vertical faces either side of the mantlet, reaching about roof height and projecting ahead of the gun cradle"): a front
// raked only 20 degrees, standing 14 cm off the cheek faces' foot and 0.57 m off their top edge, its top flat at 0.76,
// carried back over the roof's front edge; it keeps the cheeks' 17 degree sweep
const C2_RAKE = Math.tan(20 * Math.PI / 180), C2_YB = 0.24, C2_FRONT_Z = 2.26, C2_FRONT_X = 0.47;
// r269 round 3 (C2 photographs 1, 2 and 4, the coordinator's read: "the cheek modules' tops slope DOWN toward the mantlet
// as a wedge in side view, from the roof line to the gun root"): the upright bolted face stands to 0.44, the gun root's
// height, and the module's top slopes from there back up to the roof's front edge (about 22 degrees); the cheek's side
// module slopes from the eave over the flank modules down to the same front edge (about 14 degrees)
const C2_FACE_TOP = 0.44;

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
const c2FrontZ = (ax: number, y: number): number => C2_FRONT_Z - FSW * (ax - C2_FRONT_X) - C2_RAKE * (y - C2_YB);

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
  // the centre between the slot walls: its front the slot's back wall to 0.512, then the brow, the bevels' inner edge
  // plane carried across the slot back to the roof
  const [tfz, tfy] = topFront(SLOT_X);
  const yk = (frontZ(SLOT_X, 0) - SLOT_BACK) / FRK;
  P.add('turret', convexBlock([-1, 1].flatMap((s) => mirror([[SLOT_X, FLOOR, SZ0], [SLOT_X, FLOOR, SLOT_BACK],
    [SLOT_X, yk, SLOT_BACK], [SLOT_X, CROWN, SZ0], [SLOT_X, tfy, tfz]], s))));
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
 * collar's underside is cut flat at -0.145 and the block's at -0.145 (the old mantlet plate's 0.15, so its keep over the
 * hull slab and the glacis at the depression stops holds); the coax MG 42/59 keeps its port at (0.165, 0.10). */
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
  // wall (inside the turret), its top under the brow, its upper front raked back behind the collar
  // (its lower outer edges chamfered 11 cm in, the old mantlet plate's footprint ahead of the slot's back wall: the gun keeps
  // its measured stops at the arcs' ends, where the hull slab's corners pass under the mantlet)
  P.addGunExtra(convexBlock([-1, 1].flatMap((s) => [[s * 0.12, -0.145, 0.35], [s * 0.12, -0.145, 0.64], [s * 0.225, -0.035, 0.35],
    [s * 0.225, -0.035, 0.64], [s * 0.225, 0.02, 0.64], [s * 0.225, 0.20, 0.545], [s * 0.225, 0.20, 0.35]] as V3[])));
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
  // the armoured cover hinged at the top's front edge, swung up to stand leaning 12 degrees back from vertical
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

/** The rear roof's stowage: the long boxes along both eaves and the transverse box behind the hatches (print roof map;
 * series C1 photographs 1 and 6, C2 photograph 4). Tops 10 cm over the crown. */
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
  // the stowage box's lid: its seam across the top and two hinges at its front edge
  P.add('turretDark', KIT.box(2.15, 0.006, 0.012), 0, BOX_TOP + 0.002, -2.36);
  for (const xx of [-0.6, 0.6]) P.add('turretDetail', KIT.box(0.12, 0.025, 0.04), xx, BOX_TOP + 0.008, -1.97);
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

/** The C2's Attila-D commander's sight (C2 photographs 1-5): a tall armoured drum on a short stout base and collar
 * standing behind the Lothar box (photograph 1: no mast; the drum about twice the box's height), its forward window behind
 * a mesh guard over the box's top (photograph 3), a low domed cap with two lifting rings. */
function c2AttilaDrum(P: ArieteTurretPort, x: number, z: number, col = 0.08): void {
  const seg = P.q ? 22 : 12, r = 0.19, h = 0.40;
  // (the base as wide as the collar it carries: no overhang to hold water, the roof-pocket census)
  P.add('turret', KIT.cylY(r + 0.025, r + 0.04, col + 0.02, seg), x, arieteProtoRoofY(x, z) - 0.015 + (col + 0.02) / 2, z);
  const y0 = arieteProtoRoofY(x, z) - 0.015 + col;
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

/** The C2's meteorological mast: a post, its sensor drum and flat head, and three rods hanging down and out from the head,
 * each with its small sensor at the tip (C2 photographs 1 and 3: an umbrella frame, not a star). */
function c2MetMast(P: ArieteTurretPort, x: number, y: number, z: number): void {
  P.add('turretDetail', KIT.cylY(0.035, 0.045, 0.06, 8), x, y + 0.025, z);
  P.add('turretDetail', KIT.cylY(0.018, 0.018, 0.34, 8), x, y + 0.22, z);
  P.add('turretDetail', KIT.cylY(0.034, 0.030, 0.07, 8), x, y + 0.40, z);
  P.add('turretDetail', KIT.cylY(0.05, 0.05, 0.014, 10), x, y + 0.442, z);
  const len = 0.20, tilt = 0.80;
  for (let k = 0; k < 3; k++) {
    const a = k * 2 * Math.PI / 3 + 0.5;
    // each rod hangs from the drum's top (its top end there), tilted 46 degrees out from the post (photographs 1 and 3)
    P.add('turretDetail', KIT.xform(KIT.xform(KIT.cylY(0.006, 0.006, len, 5), 0, -len / 2, 0), 0, 0, 0, 0, 0, tilt),
      x, y + 0.43, z, 0, a, 0);
    const tip = new THREE.Vector3(len * Math.sin(tilt), 0.43 - len * Math.cos(tilt), 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    P.add('turretDark', KIT.box(0.03, 0.025, 0.03), x + tip.x, y + tip.y, z + tip.z, 0, a, 0);
  }
}

/** The C2 loader's 12.7 mm shield (C2 photographs 1 and 3): two tall flat leaves either side of the barrel, 0.45 m from
 * under the receiver to well over it with a 9 cm gap for the barrel (1 cm off its jacket, ahead of the receiver: the gun
 * recoils away from them), each stiffened down its outer edge, joined under the gun by a cross plate. They are drawn into the station's painted cradle mesh (its pitch group: origin on the trunnion, +z
 * firing), so they ride the gun's pitch and the station's yaw as the fleet's shields do, ahead of the receiver and its
 * can, their feet clear of the mount at full depression. */
function c2LoaderShield(mg: THREE.Group): void {
  const pitch = mg.getObjectByName('auxiliaryWeaponPitch');
  const host = pitch?.children.find((o) => (o as THREE.Mesh).isMesh && o.userData.fittingSlot === 'detail') as THREE.Mesh | undefined;
  if (!host) throw new Error('arieteProtoTurret: the C2 loader station has no painted cradle mesh');
  const z0 = 0.30, z1 = 0.325, yb = -0.23, yt = 0.22, xi = 0.043, xo = 0.225;
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    parts.push(convexBlock(mirror([[xi, yb, z0], [xi, yb, z1], [xi, yt, z0], [xi, yt, z1], [xo, yb + 0.03, z0], [xo, yb + 0.03, z1],
      [xo - 0.03, yb, z0], [xo - 0.03, yb, z1], [xo, yt - 0.05, z0], [xo, yt - 0.05, z1], [xo - 0.05, yt, z0], [xo - 0.05, yt, z1]], s)));
    parts.push(KIT.xform(KIT.box(0.02, yt - yb - 0.10, 0.04), s * (xo - 0.02), (yb + yt) / 2 - 0.02, z0 - 0.02));
  }
  parts.push(KIT.xform(KIT.box(2 * xo - 0.04, 0.05, 0.025), 0, -0.11, z1 + 0.0125));
  const want = Object.keys(host.geometry.attributes);
  const flat = parts.map((g) => {
    const f = g.index ? g.toNonIndexed() : g;
    if (f !== g) g.dispose();
    if (!f.getAttribute('normal')) f.computeVertexNormals();
    for (const name of Object.keys(f.attributes)) if (!want.includes(name)) f.deleteAttribute(name);
    const n = f.getAttribute('position').count;
    if (want.includes('uv') && !f.getAttribute('uv')) f.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (want.includes('color') && !f.getAttribute('color')) f.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    return f;
  });
  const userData = { ...host.geometry.userData };
  const merged = KIT.mergeAll([host.geometry, ...flat]);
  merged.userData = userData;
  const camoUvScale = Number((host.material as THREE.Material).userData?.camoUvScale);
  if (Number.isFinite(camoUvScale) && camoUvScale > 0) KIT.boxUV(merged, camoUvScale);
  ownFittingGeometry(merged);
  host.geometry = merged;
  mg.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(mg);
  mg.userData.aabb = { min: bb.min.toArray(), max: bb.max.toArray() };
}

// ---- C2 package ------------------------------------------------------------------------------------------------------
/** The C2's add-on cheek wedges, their side modules and the flank modules. Each plate is one visual ERA course (italy.ts's
 * cluster name), counted on the receipt; the flank modules' boxes are equipment. */
function c2Package(P: ArieteTurretPort, receipt: ArieteProtoTurretReceipt, c2Era: C2EraCounts): void {
  const cluster = (fill: () => void): void => P.visualEraCluster('italy-layered-turret', 'turret', fill);
  const yb = C2_YB, yf = C2_FACE_TOP;
  for (const s of [-1, 1]) {
    // the front: an inner module beside the gun and the main module to the corner (C2 photographs 3 and 5), each a wedge
    // from the cheek face (12 mm into it): its upright bolted face to the gun root's height, its top sloping from there
    // up and back to the roof's front edge, which it caps (photographs 1, 2 and 4)
    for (const [xa, xb] of [[BEV_X + 0.01, 0.68], [0.69, W - 0.03]] as const) {
      const pts: V3[] = [];
      const front = (ax: number): V3 => [ax, yf, c2FrontZ(ax, yf)];
      const rear = (ax: number): V3 => { const [tz, ty] = topFront(ax); return [ax, ty + 0.012, tz - 0.03]; };
      for (const [ax, inset] of [[xa, 0.02], [xb, -0.02]] as const) {
        const [, ty] = topFront(ax), xi = ax + inset;
        pts.push([ax, yb, faceZ(ax, yb) - 0.012], [ax, ty - 0.012, faceZ(ax, ty - 0.012) - 0.012], rear(ax),
          [ax, yb + 0.02, c2FrontZ(ax, yb + 0.02) - 0.02], [ax, yf - 0.01, c2FrontZ(ax, yf - 0.01) - 0.02],
          [xi, yb + 0.02, c2FrontZ(xi, yb + 0.02)], [xi, yb, c2FrontZ(xi, yb) - 0.02], front(xi));
      }
      cluster(() => {
        P.add('turret', convexBlock(mirror(pts, s)));
        // bolt rows on the face (C2 photograph 5) and on the slope (photograph 4)
        const n = new THREE.Vector3(s * FSW, C2_RAKE, 1).normalize();
        const at = (ax: number, y: number): THREE.Vector3 => new THREE.Vector3(s * ax, y, c2FrontZ(ax, y));
        const main = xb - xa > 0.3, mid = (xa + xb) / 2;
        bolts(P, (main ? [xa + 0.08, mid, xb - 0.08] : [mid]).flatMap((ax) => [at(ax, 0.30), at(ax, 0.395)]), n);
        const f0 = new THREE.Vector3(...front(xa)), f1 = new THREE.Vector3(...front(xb)), r0 = new THREE.Vector3(...rear(xa));
        const ns = new THREE.Vector3().subVectors(f1, f0).cross(new THREE.Vector3().subVectors(r0, f0)).normalize();
        if (ns.y < 0) ns.negate();
        const onSlope = (ax: number, t: number): THREE.Vector3 => {
          const f = new THREE.Vector3(...front(ax)), r = new THREE.Vector3(...rear(ax));
          return f.lerp(r, t).addScaledVector(ns, 0.002).multiply(new THREE.Vector3(s, 1, 1));
        };
        bolts(P, (main ? [[xa + 0.08, 0.2], [mid, 0.2], [xb - 0.08, 0.2], [xa + 0.08, 0.65], [xb - 0.08, 0.65]] : [[mid, 0.25], [mid, 0.65]])
          .map(([ax, t]) => onSlope(ax, t)), ns.clone().multiply(new THREE.Vector3(s, 1, 1)));
      });
      receipt.c2CheekPlates++;
      c2Era.turretCheekCassettes++;
      c2Era.turretCheekForwardNormalDotMin = Math.min(c2Era.turretCheekForwardNormalDotMin,
        new THREE.Vector3(FSW, C2_RAKE, 1).normalize().z);
    }
    // the cheek's side module: one bolted module 20 cm proud (C2 photograph 3: the side modules' fronts stand proud at the
    // turret's corners), its front on the add-on front, its top along the eave to the roof's front edge and from there the
    // wedge down to the face's top with the front modules (photographs 1, 2 and 4: the bolted side plate under the sloping
    // edge), the oval access panel on it
    // (its top keeps within a centimetre of the eave: a wall strip left bare over it took the old turret's designation
    // seat, re-found within reach of the prior record)
    const zt = 0.38, zbk = 0.42, yBot = FLOOR + CHAMF, zf = c2FrontZ(W, yf) - 0.004;
    const [tzW, tyW] = topFront(W), ze = tzW - 0.02, ye = tyW + 0.005;
    const topAt = (z: number): number => (z <= ze ? EAVE - 0.01 + (ye - EAVE + 0.01) * (z - SZ0) / (ze - SZ0)
      : ye + (yf - ye) * (z - ze) / (zf - ze));
    const side = (x: number): V3[] => [[x, EAVE - 0.01, zt], [x, EAVE - 0.01, SZ0], [x, ye, ze], [x, yf, zf],
      [x, yBot, c2FrontZ(W, yBot) - 0.004], [x, yBot, zbk]];
    cluster(() => {
      P.add('turret', convexBlock(mirror([...side(W - 0.045), ...side(W + 0.20)], s)));
      P.add('turret', KIT.box(0.02, 0.18, 0.40), s * (W + 0.208), 0.42, 1.05);                   // access panel
      // a bolt row under its sloping top edge and one along its foot (photographs 1 and 4)
      const row: Array<[number, number]> = [0.55, 0.80, 1.05, 1.30, 1.55, 1.80].map((zz) => [zz, topAt(zz) - 0.035]);
      for (const zz of [0.55, 0.85, 1.15, 1.45, 1.75]) row.push([zz, yBot + 0.04]);
      bolts(P, row.map(([zz, yy]) => new THREE.Vector3(s * (W + 0.20), yy, zz)), new THREE.Vector3(s, 0, 0));
    });
    receipt.c2SidePlates++;
    c2Era.turretSideCassettes++;
    // the flank modules behind it (C2 photographs 1, 2 and 4: an even row of three separate boxed modules, flush top and
    // bottom with the wall, shadow gaps between them; photograph 2's order from the rear: a long one, a medium one with the
    // square sensor window, a narrow one), each a box standing 3 cm off the wall on its brackets, faced with a bolted 25 mm
    // plate: the long one carries its door with the cut top corner, latches and hinge (photograph 4) and a lifting eye on
    // its top, the others a handle each
    // (the long module spans round 2's aft box, a single face under the fleet decor's rear side load: shorter modules
    // there left its arms straddling a module's end, its straps crossing them)
    const gap = 0.03, d = 0.22, y0 = 0.205, y1 = EAVE, xo = W + d + 0.023;
    const modules = [[-0.98, -0.30], [-0.26, 0.16], [0.20, 0.36]] as const;
    modules.forEach(([z0, z1], k) => {
      const zc = (z0 + z1) / 2, len = z1 - z0;
      P.addEquipment('turret', convexBlock(mirror([[W + gap, y0, z0], [W + gap, y0, z1], [W + d, y0, z0], [W + d, y0, z1],
        [W + gap, y1, z0], [W + gap, y1, z1], [W + d - 0.03, y1, z0], [W + d - 0.03, y1, z1],
        [W + d, y1 - 0.03, z0], [W + d, y1 - 0.03, z1]], s)));
      for (const zz of [z0 + 0.05, z1 - 0.05]) for (const yy of [0.30, 0.68]) {
        P.addEquipment('turret', KIT.box(gap + 0.02, 0.06, 0.05), s * (W + gap / 2), yy, zz);   // stand-off brackets
      }
      if (k === 0) liftingEye(P, s * (W + 0.125), y1, zc, Math.PI / 2);
      cluster(() => {
        P.add('turret', KIT.box(0.025, y1 - 0.04 - y0, len - 0.02), s * (W + d + 0.0125 - 0.002), (y0 + y1 - 0.04) / 2, zc);
        const nb = Math.max(2, Math.round(len / 0.11));
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < nb; i++) {
          const zz = z0 + 0.04 + (len - 0.08) * i / (nb - 1);
          pts.push(new THREE.Vector3(s * xo, y0 + 0.045, zz), new THREE.Vector3(s * xo, y1 - 0.085, zz));
        }
        bolts(P, pts, new THREE.Vector3(s, 0, 0));
        const xd = s * (W + d + 0.026);
        if (k > 0) P.add('turretDetail', KIT.box(0.03, 0.12, 0.025), s * (W + d + 0.033), 0.46, z1 - 0.05);                // handle
        if (k === 1) {
          P.add('turretDark', KIT.box(0.008, 0.13, 0.15), xd, 0.60, zc - 0.03);                // sensor window
          P.add('turretGlass', KIT.box(0.006, 0.10, 0.12), xd + s * 0.002, 0.60, zc - 0.03);
        }
        if (k === 0) {
          // the door: a seam round it, its top rear corner cut (photograph 4), two latches and the hinge strip
          const za = z0 + 0.07, zb = z1 - 0.07, ya = 0.27, yt = 0.70, cut = 0.14;
          P.add('turretDark', KIT.box(0.006, 0.012, zb - za), xd, ya, (za + zb) / 2);
          P.add('turretDark', KIT.box(0.006, 0.012, zb - za - cut), xd, yt, (za + cut + zb) / 2);
          P.add('turretDark', KIT.box(0.006, yt - ya, 0.012), xd, (ya + yt) / 2, zb);
          P.add('turretDark', KIT.box(0.006, yt - ya - cut, 0.012), xd, (ya + yt - cut) / 2, za);
          P.add('turretDark', KIT.box(0.006, cut * Math.SQRT2, 0.012), xd, yt - cut / 2, za + cut / 2, Math.PI / 4, 0, 0);
          for (const yy of [0.38, 0.60]) P.add('turretDetail', KIT.box(0.025, 0.05, 0.06), s * (W + d + 0.033), yy, zb - 0.06);
          P.add('turretDark', KIT.box(0.014, yt - ya - 0.04, 0.03), s * (W + d + 0.03), (ya + yt) / 2, za + 0.035);
        }
      });
      receipt.shoulderModules++;
      c2Era.turretSideCassettes++;
    });
  }
}

/** The C2's rear stowage box sides: a louvred grille panel on each (C2 photograph 1), on the box's tapered side. */
function c2BoxGrille(P: ArieteTurretPort): void {
  const taper = (z: number): number => W - 0.005 - (W - 0.005 - BOX_W1) * (BOX_FRONT - z) / (BOX_FRONT - BOX_REAR);
  const ry = Math.atan((W - 0.005 - BOX_W1) / (BOX_FRONT - BOX_REAR)), zc = -2.17, yc = 0.58;
  for (const s of [-1, 1]) {
    const x = taper(zc);
    P.add('turretDark', KIT.box(0.012, 0.24, 0.30), s * (x + 0.001), yc, zc, 0, s * ry, 0);
    for (let k = 0; k < 6; k++) {
      P.add('turretDetail', KIT.box(0.014, 0.016, 0.28), s * (x + 0.006), yc - 0.10 + k * 0.04, zc, 0, s * ry, 0);
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
      // photograph 6's wall fittings: the tow-hook pair low on the cheek module, a grab bracket over it and a hook high on
      // the wall behind the seam
      const xo = s * (W + 0.015);
      for (const dz of [-0.06, 0.06]) P.add('turretDetail', KIT.box(0.035, 0.09, 0.03), xo + s * 0.015, 0.33, 1.32 + dz);
      P.add('turretDetail', KIT.xform(KIT.torus(0.035, 0.011, P.q ? 10 : 6, 5), 0, 0, 0, 0, 0, Math.PI / 2), xo + s * 0.03, 0.31, 1.32);
      P.add('turretDetail', KIT.box(0.03, 0.16, 0.025), xo + s * 0.03, 0.58, 1.02);
      for (const dy of [-0.07, 0.07]) P.add('turretDetail', KIT.box(0.035, 0.025, 0.025), xo + s * 0.012, 0.58 + dy, 1.02);
      P.add('turretDetail', KIT.box(0.035, 0.05, 0.06), s * (W + 0.015), 0.73, -0.02);
      P.add('turretDetail', KIT.xform(KIT.torus(0.03, 0.009, P.q ? 10 : 6, 5), 0, 0, 0, 0, 0, Math.PI / 2), s * (W + 0.035), 0.70, -0.02);
    } else {
      // (C2 photographs 1 and 4: the row aft on the bustle's wall behind the add-on boxes, at about half its height)
      smokeRow(P, s, -1.40, W, 30 + (s > 0 ? 4 : 0), 0.45);
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
  // the whips stand on the rear roof boxes, their tips where the old roof-mounted rods' were (the photo packets' envelope)
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
    whip(-0.30, transverseTop, -1.16, 1.11, 48);
    P.add('turretDark', KIT.cylY(0.035, 0.045, 0.09, 8), 1.135, transverseTop + 0.04, -1.15);
    receipt.c1CheekEra = c1CheekEra(o.seat, receipt);
  } else {
    // (r269 round 2, C2 photographs 1, 3 and 5: the Lothar box at the roof's front edge, the Attila drum behind it on a
    // short base so its window stands over the box)
    c2LotharSight(P, -0.74, 1.10);
    c2AttilaDrum(P, -0.80, 0.64);
    // the loader's 12.7 mm (C2 photographs 1 and 3: not a remote station but a crew pintle M2 behind a tall two-leaf
    // shield, the leaves about 0.45 m tall either side of the barrel; photograph 1: its pintle on a squat base): the
    // riding pintle on a stout 12 cm armoured plinth, the gun 0.40 m and the leaves' tops 0.63 m over the roof (the class
    // gun at 0.95, as in round 1: at 1.0 in this 1.1 rig its trigger block stands 15.4 mm off the receiver, over the
    // fleet contact receipt's 15 mm)
    const mx = 0.70, mz = 0.40, my = arieteProtoRoofY(mx, mz), ph = 0.12;
    P.add('turret', convexBlock([-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [[mx + sx * 0.15, my - 0.02, mz + sz * 0.15],
      [mx + sx * 0.15, my + ph - 0.03, mz + sz * 0.15], [mx + sx * 0.12, my + ph, mz + sz * 0.12]] as V3[]))));
    P.add('turretDark', KIT.box(0.31, 0.012, 0.31), mx, my + 0.05, mz);                         // pedestal's base seam
    const mg = FITTINGS.pintleMG({ working: true, ridingCradle: true, mats: P.mats, cls: 'm2', tone: 'two-tone', elev: -0.02,
      ammo: true, scale: 0.95, seed: 46 });
    c2LoaderShield(mg);
    mg.name = 'arieteC2RemoteRws';
    mg.userData.remoteControlled = true;
    addFitting(P, 'turret', mg, mx, my + ph - 0.005, mz, [0, 0, 0]);
    c2MetMast(P, 0.05, transverseTop, -1.17);
    whip(-0.30, transverseTop, -1.16, 1.11, 48);
    whip(1.135, transverseTop, -1.15, 0.89, 52);
    if (o.c2Era) c2Package(P, receipt, o.c2Era);
    c2BoxGrille(P);
  }
  rearBins(P, c2);
  return receipt;
}
