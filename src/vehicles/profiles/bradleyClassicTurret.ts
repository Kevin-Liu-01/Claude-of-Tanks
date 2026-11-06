// Kevin B. Liu — the classic M2A2 Bradley turret, kept as its own part: the M3A2's in release 268, the M2A2's since 269
// (owner 2026-11-05: "the m3a2 bradley USA should be m2a2 bradley"; modern3.ts buildM2A2Bradley).
// Owner, 2026-11-02: "also make a new variant of the bradley based on the old turret we had before doing this. i liked the
// shape and all the stuff arounnd it". Release 268 extracted main's 7cc204ab32 m2a2_bradley turret (modern3.ts
// buildBradleySteps) verbatim, mirrored across x so the TOW stands on the turret's LEFT (+X; forward +Z, up +Y), the pod
// turret-fixed. 269 (round T2): in two blind A/B rounds against the photographs that turret lost every time, "buried under
// boxes", a box-stair mast at its left rear reading as an M3A3 commander's viewer, the TOW no longer a distinct box. It is
// rebuilt as an M2A2 ODS turret on the same plan, datums and gun: one welded, faceted body (a sectionSolid shell to a
// flat roof, two cheeks that close forward to the beak at the gun line round an open gun bay), the A2 appliqué bolted on
// the cheeks' upper plates, the ISU's armoured head on the left front of the roof, the commander's raised hatch ring on
// the right, the gunner's hatch behind the ISU, the stowed TOW launcher as one box flush on the left flank inside the roof
// line, a stowage bin low on the right wall, the bustle basket on the rear wall and two whips on low bases at the rear
// corners. The mast cluster, the commander's riser and every loose box and duffel are gone (the decor seats the crew's
// duffel in the basket: decorations.ts LIVED_IN_ROWS.m2a2_bradley).
// Turret frame: the ring plane at y 0, the gun pivot CLASSIC_GUN_PIVOT. The hull under it is the shared Bradley hull.
import type * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, FITTINGS, convexSlab } from './kit.ts';
import { weaponAssembly } from './weaponStock.ts';
import { launchCellParts, perforatedPlate } from './missileCanisterStock.ts';
import { sectionSolid } from './sectionSolid.ts';
import { CLASSIC_GUN_PIVOT, CLASSIC_MUZZLE_Z, CLASSIC_TOW_CELLS, CLASSIC_TOW_MOUTHS } from '../bradleyClassicTurretLayout.ts';

/** 7cc204ab32's deck under the ring, in the turret frame: the 1.905 roof plate over the 1.895 ring plane. */
const CLASSIC_DECK_Y = 0.01;

/** The welded body: its section (half-widths at the floor, the chine, the roof edge and the roof), its rear wall, the face
 *  the cheeks stand forward of, the beak at the gun line, the cheeks' knee (their floor rises to the beak from it) and the
 *  gun bay between the cheeks (gun axis x 0.075: the mantlet's -9..+30 deg sweep stays inside it). */
const BODY = Object.freeze({
  rearZ: -1.00, faceZ: 0.45, kneeZ: 0.62, cornerZ: 0.75, beakZ: 1.02,
  bottomY: 0.02, chineY: 0.22, edgeY: 0.60, roofY: 0.66,
  bottomHalfW: 0.66, chineHalfW: 0.76, edgeHalfW: 0.74, roofHalfW: 0.64,
  beakBottomY: 0.36, beakTopY: 0.44, beakHalfW: 0.48,
  bayLeftX: 0.30, bayRightX: -0.17,
});

/** The stowed TOW launcher (turret frame): the box flush on the left wall, its top inside the roof line, its two cells
 *  one over the other on the perforated front plate (CLASSIC_TOW_CELLS plus the gun pivot). */
const TOW_BOX = Object.freeze({ x0: 0.80, x1: 1.25, y0: 0.13, y1: 0.65, z0: -0.92, z1: 0.42 });

/** The stowage bin low on the right wall: floor chamfered up to its upright outer face, the lid sloping up to the wall;
 *  it ends square behind the right front corner plate. */
const BIN = Object.freeze({ innerX: -0.72, outerX: -1.28, bottomY: 0.15, shoulderY: 0.42, lidY: 0.56, lidInnerX: -0.90,
  z0: -0.80, z1: 0.24 });

export interface ClassicTurretRing {
  /** The hull deck's top under the ring, in the turret frame (the ring plane is y 0): the seat pan and collar follow it. */
  readonly deckY: number;
}

/** The turret-owned seat pan and collar (7cc204ab32 bradleyFlankDressing): a faceted pan and a collar under the shell
 *  that close the low sight-line between the turret's overhang and the deck; both stand on the deck as they stood on
 *  7cc204ab32's. */
function addClassicTurretSeat(P: TankBuilderPort, ring: ClassicTurretRing): void {
  const { cylY, polyMultiLoft } = KIT;
  const dy = ring.deckY - CLASSIC_DECK_Y;
  const turretSeatPlan = [
    [-0.68, 0.82], [0.68, 0.82], [0.90, 0.45], [0.92, -0.78],
    [0.70, -1.08], [-0.70, -1.08], [-0.92, -0.78], [-0.90, 0.45],
  ];
  P.add('turret', polyMultiLoft(turretSeatPlan, [
    { height: -0.07 + dy, inset: 0.90 },
    { height: 0.07 + dy, inset: 1.00 },
  ]));
  P.add('turret', cylY(0.82, 0.87, 0.16, P.q ? 22 : 14), 0, 0.005 + dy, -0.10);
}

/** The body's section at full size, or scaled in (`inset` off every half-width, the floor `lift` up and the roof `drop`
 *  down) for the chamfered rear wall. Counter-clockwise from +Z. */
function bodyRing(inset = 0, lift = 0, drop = 0): Array<[number, number]> {
  const B = BODY;
  return [[-(B.bottomHalfW - inset), B.bottomY + lift], [B.bottomHalfW - inset, B.bottomY + lift],
    [B.chineHalfW - inset, B.chineY], [B.edgeHalfW - inset, B.edgeY - drop], [B.roofHalfW - inset, B.roofY - drop],
    [-(B.roofHalfW - inset), B.roofY - drop], [-(B.edgeHalfW - inset), B.edgeY - drop], [-(B.chineHalfW - inset), B.chineY]];
}

const cheekLower = (z: number) => z <= BODY.kneeZ ? BODY.bottomY
  : BODY.bottomY + (BODY.beakBottomY - BODY.bottomY) * (z - BODY.kneeZ) / (BODY.beakZ - BODY.kneeZ);
const cheekUpper = (z: number) => z <= BODY.faceZ ? BODY.roofY
  : BODY.roofY - (BODY.roofY - BODY.beakTopY) * (z - BODY.faceZ) / (BODY.beakZ - BODY.faceZ);
/** The cheek's outer wall: square out to the face, then a front corner plate 47 deg off the bow in plan (it carries the
 *  smoke dischargers, ahead of the TOW launcher on the left) to the beak's width. */
const cheekOuter = (z: number) => z <= BODY.faceZ ? BODY.chineHalfW : z >= BODY.cornerZ ? BODY.beakHalfW
  : BODY.chineHalfW - (BODY.chineHalfW - BODY.beakHalfW) * (z - BODY.faceZ) / (BODY.cornerZ - BODY.faceZ);

/** One cheek (side +1 the left): the body's section carried forward from the face, its floor rising from the knee and its
 *  upper plate falling from the face to the beak at the gun line, its outer wall closing in plan; its inner face is the
 *  gun bay's. At the face it is the body's own section, so the two read as one welded shell. */
function classicCheek(side: 1 | -1): THREE.BufferGeometry {
  const B = BODY;
  const inner = side > 0 ? B.bayLeftX : -B.bayRightX;
  const station = (z: number) => {
    const yb = cheekLower(z), yt = cheekUpper(z), xo = cheekOuter(z), k = (yt - yb) / (B.roofY - B.bottomY);
    const left: Array<[number, number]> = [[inner, yb], [xo - (B.chineHalfW - B.bottomHalfW), yb],
      [xo, yb + (B.chineY - B.bottomY) * k], [xo - (B.chineHalfW - B.edgeHalfW), yt - (B.roofY - B.edgeY) * k],
      [xo - (B.chineHalfW - B.roofHalfW), yt], [inner, yt]];
    return { z, ring: side > 0 ? left : left.map(([x, y]) => [-x, y] as [number, number]).reverse() };
  };
  return sectionSolid([B.faceZ - 0.05, B.faceZ, B.kneeZ, B.cornerZ, B.beakZ].map(station), { sideQuadDiagonal: 'convex' });
}

/** A cheek's upper plate: its slope and outward normal (0, nY, nZ), and `at` a point `lift` off it along that normal. */
function cheekPlateFrame() {
  const B = BODY;
  const slope = Math.atan((B.roofY - B.beakTopY) / (B.beakZ - B.faceZ));
  const nY = Math.cos(slope), nZ = Math.sin(slope);
  const at = (x: number, z: number, lift: number): [number, number, number] => [x, cheekUpper(z) + nY * lift, z + nZ * lift];
  return { slope, at };
}

/** The A2 appliqué on a cheek's upper plate: one 35 mm plate on the plate's own plane, two rows of three bolts. */
function addCheekAppliqué(P: TankBuilderPort, side: 1 | -1): void {
  const B = BODY, { slope, at } = cheekPlateFrame(), t = 0.035, z0 = 0.56, z1 = 0.88;
  const inner = (side > 0 ? B.bayLeftX : -B.bayRightX) + 0.03;
  const outer = (z: number) => cheekOuter(z) - 0.10;
  const p = (x: number, z: number, lift: number) => { const [px, py, pz] = at(x, z, lift); return [side * px, py, pz]; };
  P.add('turret', convexSlab(
    p(inner, z1, -0.005), p(outer(z1), z1, -0.005), p(outer(z0), z0, -0.005), p(inner, z0, -0.005),
    p(inner, z1, t), p(outer(z1), z1, t), p(outer(z0), z0, t), p(inner, z0, t)));
  const bolts: THREE.BufferGeometry[] = [];
  for (const z of [z0 + 0.06, z1 - 0.06]) {
    const n = outer(z) - inner > 0.22 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const x = inner + 0.04 + (outer(z) - inner - 0.08) * k / (n - 1);
      bolts.push(KIT.xform(KIT.cylY(0.018, 0.018, 0.018, 6), ...p(x, z, t + 0.004), slope, 0, 0));
    }
  }
  P.add('turretDetail', KIT.mergeAll(bolts));
}

/** The body, the cheeks, the A2 plates, the gun-bay floor and the coax port. */
function addClassicBody(P: TankBuilderPort): void {
  const B = BODY, { box } = KIT;
  P.add('turret', sectionSolid([
    { z: B.rearZ, ring: bodyRing(0.03, 0.04, 0.03) },
    { z: B.rearZ + 0.05, ring: bodyRing() },
    { z: B.faceZ, ring: bodyRing() },
  ], { sideQuadDiagonal: 'convex' }));
  for (const side of [1, -1] as const) {
    P.add('turret', classicCheek(side));
    addCheekAppliqué(P, side);
  }
  // the gun-bay floor between the cheeks, under the mantlet's swept envelope (its front-bottom corner at -9 deg: 0.10)
  P.add('turret', box(B.bayLeftX - B.bayRightX, 0.06, B.beakZ - 0.10 - B.faceZ),
    (B.bayLeftX + B.bayRightX) / 2, B.bottomY + 0.03, (B.beakZ - 0.10 + B.faceZ) / 2);
  P.add('turretDark', box(0.07, 0.06, 0.10), B.bayRightX - 0.07, 0.40, B.beakZ - 0.04);   // M240C coax port
}

/** The ISU's armoured head on the left front of the roof (its front raked back, the window under its brow, the armoured
 *  doors' lid on top); the commander's raised hatch ring on the right with four vision blocks round its front; the
 *  gunner's hatch behind the ISU. */
function addClassicRoof(P: TankBuilderPort): void {
  const B = BODY, { box, cylY, periscope } = KIT;
  const r = B.roofY;
  const isu = Object.freeze({ x0: 0.12, x1: 0.54, z0: 0.08, z1: 0.48, top: r + 0.26, browZ: 0.36 });
  P.add('turret', convexSlab(
    [isu.x0, cheekUpper(isu.z1) - 0.01, isu.z1], [isu.x1, cheekUpper(isu.z1) - 0.01, isu.z1], [isu.x1, r - 0.01, isu.z0], [isu.x0, r - 0.01, isu.z0],
    [isu.x0 + 0.02, isu.top, isu.browZ], [isu.x1 - 0.02, isu.top, isu.browZ], [isu.x1 - 0.02, isu.top, isu.z0 + 0.02],
    [isu.x0 + 0.02, isu.top, isu.z0 + 0.02]));
  const rake = Math.atan2(isu.z1 - isu.browZ, isu.top - r);
  const face = (t: number, lift: number): [number, number, number] =>
    [(isu.x0 + isu.x1) / 2, r + (isu.top - r) * t + Math.sin(rake) * lift, isu.z1 - (isu.z1 - isu.browZ) * t + Math.cos(rake) * lift];
  P.add('turretDark', KIT.xform(box(0.30, 0.11, 0.02), ...face(0.62, 0.004), -rake, 0, 0));
  P.add('turretGlass', KIT.xform(box(0.26, 0.075, 0.012), ...face(0.62, 0.012), -rake, 0, 0));
  P.add('turretDetail', box(isu.x1 - isu.x0 - 0.06, 0.025, isu.browZ - isu.z0 - 0.06),
    (isu.x0 + isu.x1) / 2, isu.top + 0.0115, (isu.browZ + isu.z0) / 2);
  // the commander's station (right): raised ring, hatch lid, vision blocks round its front
  const cx = -0.36, cz = -0.25;
  P.add('turret', cylY(0.30, 0.32, 0.11, P.q ? 22 : 14), cx, r + 0.045, cz);
  P.add('turretDetail', cylY(0.27, 0.28, 0.04, P.q ? 22 : 14), cx, r + 0.115, cz);
  for (const a of [-0.9, -0.3, 0.3, 0.9]) periscope(P, 'turretDetail', cx + 0.30 * Math.sin(a), r + 0.075, cz + 0.30 * Math.cos(a), a);
  // the gunner's hatch (left, behind the ISU) and its handle
  P.add('turret', cylY(0.24, 0.25, 0.06, P.q ? 20 : 12), 0.38, r + 0.02, -0.42);
  P.add('turretDark', box(0.10, 0.03, 0.05), 0.38, r + 0.06, -0.62);
}

/** The bin low on the right wall, its lid seam and two latches. */
function addClassicBin(P: TankBuilderPort): void {
  const { box } = KIT, b = BIN;
  const ring = (outer: number, lidInner: number): Array<[number, number]> => [[Math.max(outer, -1.06), b.bottomY],
    [b.innerX, b.bottomY], [b.innerX, b.lidY], [lidInner, b.lidY], [outer, b.shoulderY], [outer, b.bottomY + 0.10]];
  P.add('turret', sectionSolid([
    { z: b.z0, ring: ring(b.outerX, b.lidInnerX) },
    { z: b.z1, ring: ring(b.outerX, b.lidInnerX) },
  ], { sideQuadDiagonal: 'convex' }));
  P.add('turretDark', box(0.014, 0.016, b.z1 - b.z0 - 0.08), b.outerX - 0.006, b.shoulderY - 0.02, (b.z0 + b.z1) / 2);
  for (const z of [-0.45, 0.05]) P.add('turretDetail', box(0.03, 0.06, 0.07), b.outerX - 0.012, (b.bottomY + b.shoulderY) / 2, z);
}

/** The stowed TOW launcher, turret-fixed (the real launcher's way, never riding the gun): the pack (four walls, a back
 *  plate, a perforated front plate 1 cm inside them), two cells whose rim collars stand proud round dark liners 45 cm deep
 *  (170 mm bore), the rib on its outer face (the erected launcher's lid), the hinge mount and drum along its inner top
 *  edge on the roof's edge and the cradle plate it lies against on the wall. */
function addClassicTow(P: TankBuilderPort): void {
  const { box, cylZ } = KIT, W = TOW_BOX;
  const [gx, gy, gz] = CLASSIC_GUN_PIVOT, T = CLASSIC_TOW_CELLS;
  const cx = (W.x0 + W.x1) / 2, cy = (W.y0 + W.y1) / 2, cz = (W.z0 + W.z1) / 2;
  const w = W.x1 - W.x0, h = W.y1 - W.y0, d = W.z1 - W.z0, plateZ = T.plateZ + gz;
  weaponAssembly(P, () => {
    for (const x of [W.x0 + 0.015, W.x1 - 0.015]) P.add('turretDetail', box(0.03, h, d), x, cy, cz);
    for (const y of [W.y0 + 0.015, W.y1 - 0.015]) P.add('turretDetail', box(w - 0.06, 0.03, d - 0.002), cx, y, cz);
    P.add('turretDetail', box(w - 0.03, h - 0.03, 0.03), cx, cy, W.z0 + 0.015);
    P.add('turretDetail', perforatedPlate(w - 0.03, h - 0.03, 0.02, T.ys.map((y) => [T.x + gx - cx, y + gy - cy] as const),
      0.0965, P.q ? 24 : 12), cx, cy, plateZ);
    for (const y of T.ys) {
      const tube = launchCellParts({ bore: 0.085, wall: 0.02, proud: T.proud, behind: 0.02, depth: 0.45,
        segments: [24, 12] }, P.q, T.x + gx, y + gy, plateZ);
      P.add('turretDetail', tube.rim); P.add('turretDark', tube.bore);
    }
    P.add('turretDetail', box(0.04, h - 0.14, d - 0.24), W.x1 + 0.02, cy, cz - 0.06);
  });
  P.add('turretDetail', box(0.10, 0.10, 0.70), W.x0 - 0.05, W.y1 - 0.06, cz + 0.10);
  P.add('turretDetail', cylZ(0.045, 0.78, P.q ? 16 : 10), W.x0, W.y1 - 0.035, cz + 0.10);
  // (down to the box's floor: from the chine it left a 4 cm slot roofed over the wall's lower slope, roof-pocket census)
  const cradleX = BODY.bottomHalfW + 0.04;
  P.add('turret', box(W.x0 - cradleX, W.y1 - 0.04 - W.y0, d - 0.10), (W.x0 + cradleX) / 2, (W.y0 + W.y1 - 0.04) / 2, cz);
}

/** The bustle basket on the rear wall (open aft), the two whips on low bases at the roof's rear corners and the 2x4
 *  smoke dischargers on the cheeks' outer corners (§6.5). */
function addClassicStowage(P: TankBuilderPort): void {
  const B = BODY;
  const rack = FITTINGS.stowageRack({
    mats: P.mats, w: 1.24, d: 0.36, h: 0.30, rails: 2, fill: 0.45, seed: 11,
    rotation: [0, Math.PI, 0],                                                    // open face aft
  });
  rack.position.set(-0.05, 0.30, B.rearZ - 0.17);
  P.turretG.add(rack);
  // the basket's sheet floor off the rear wall, under the rack's lattice: its crate stands on it
  P.add('turret', KIT.box(1.22, 0.02, 0.35), -0.05, 0.31, B.rearZ - 0.175);
  for (const [x, z, seed] of [[0.58, -0.74, 8], [-0.60, -0.74, 5]] as const) {
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.62, rake: 0.04, seed });
    whip.position.set(x, B.roofY, z);
    P.turretG.add(whip);
  }
  // VH.14 (2026-10-14): the Bradley carries no roof machine gun (roofWeaponPolicy.ts).
  for (const s of [-1, 1]) {
    const z = 0.50, x = s * (cheekOuter(z) - 0.22);
    const bank = FITTINGS.smokeBank({
      mats: P.mats, count: 4, r: 0.038, len: 0.24, pitch: -0.28, splay: s * 0.80, spacing: 0.095, seed: 6 - s,
    });
    bank.position.set(x, cheekUpper(z) + 0.02, z);
    P.turretG.add(bank);
  }
}

/** The classic M2A2 ODS turret on the shared Bradley hull: the seat, the ring collar, the welded body and its cheeks,
 *  the roof's sight and hatches, the right bin, the stowed TOW on the left, the basket, whips and smoke banks, and the
 *  M242. */
export function buildBradleyClassicTurret(P: TankBuilderPort, ring: ClassicTurretRing): void {
  const { box, cylY, cylZ, buildGun } = KIT;
  addClassicTurretSeat(P, ring);
  P.add('turret', cylY(0.60, 0.66, 0.09, 22), 0, 0.055, -0.10);                    // base ring collar
  addClassicBody(P);
  addClassicRoof(P);
  addClassicBin(P);
  addClassicTow(P);
  addClassicStowage(P);
  P.turretG.userData.bradleyClassicTurretReceipt = Object.freeze({
    revision: 'classic-7cc204ab32-ods-r2',
    source: '7cc204ab32 src/vehicles/modern3.ts buildBradleySteps (m2a2_bradley), mirrored across x; rebuilt as the ODS '
      + 'turret on its plan and datums (269 T2)',
    roofY: BODY.roofY,
    body: Object.freeze({ rearZ: BODY.rearZ, faceZ: BODY.faceZ, beakZ: BODY.beakZ, halfWidthM: BODY.chineHalfW,
      bayLeftX: BODY.bayLeftX, bayRightX: BODY.bayRightX }),
    towBox: TOW_BOX,
    bin: Object.freeze({ innerX: BIN.innerX, outerX: BIN.outerX, bottomY: BIN.bottomY }),
    deckY: ring.deckY,
    gunPivot: CLASSIC_GUN_PIVOT,
    towMouths: CLASSIC_TOW_MOUTHS,
  });
  // ---- 25 mm M242: the mantlet (a block chamfered to its face), its boot and gun bar, the tube to the 2.23 muzzle -----
  P.addGunExtra(convexSlab(
    [-0.22, -0.21, 0.02], [0.18, -0.21, 0.02], [0.18, 0.13, 0.02], [-0.22, 0.13, 0.02],
    [-0.19, -0.18, 0.44], [0.15, -0.18, 0.44], [0.15, 0.08, 0.44], [-0.19, 0.08, 0.44]));
  P.addGunExtra(box(0.165, 0.07, 0.48), 0.0375, -0.02, 0.68);                       // rotor boot forward of the block
  P.addGunExtra(box(0.10, 0.12, 0.42), 0.055, -0.01, 0.62);                         // cradle/gun bar
  buildGun(P, { len: 0.70, r: 0.038, baseR: 0.075 });                               // breech stub
  P.addGunExtra(cylZ(0.038, 1.53, 28), 0, 0, 1.425);                                // tube, 0.66..2.19
  P.addGunExtra(cylZ(0.041, 0.40, 12), 0, 0, 1.50);                                 // thermal-sleeve joint
  P.muzzleZ = CLASSIC_MUZZLE_Z;
  // VH.04 (2026-10-15): the suppressor mouth is the muzzle anchor (2.23)
  P.add('gunDark', cylZ(0.044, 0.13, 8), 0, 0, 2.165);                              // flash suppressor
  P.add('gunDark', cylZ(0.026, 0.012, 12), 0, 0, 2.2095);                           // muzzle bore disc on its face
  P.topY = 1.05;
}
