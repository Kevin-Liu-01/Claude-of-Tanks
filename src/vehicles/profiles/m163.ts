// M163 VADS (release 269, builder V; the owner 2026-11-04: "also add the m163 VADS", built on the South Africa/Australia
// session's M113 work, then "that m163 literally has a gatling gun/minigun on its turret so itll be so fun to have in game
// and play around with"): the M157 mount's open one-man turret and its M168 Vulcan on the M741, the M113A1 carrier the
// M113 builder draws (profiles/m113.ts buildM113HullSteps(P, 'm741')), from the photographs (photos/m163: 00/03 the owner's
// right-front quarter, 01/06 right front, 02 the gun close up, 04 the left side, 05 the front, 07 the rear, 08 the gun
// from the left, 09 a museum vehicle from the left, 10 the autotrack turret) and the published figures
// (docs/references/tanks/m163_vads.md); r2 after a blind photo critic:
//   - a low slotted ring on the M741's race, its deck 0.20 m over the roof;
//   - the gunner's column, an open tub 0.90 m across and 0.54 m tall at the ring's rear right quarter, the ring's front and
//     the gun's side open; a flat-sided box shield on its left-rear face, its ends leaning out; a tall narrow plate at its
//     right carrying the radar's arm;
//   - the Vulcan on the left front between two trunnion arms (the inboard one the feed's pedestal): the rotor housing with
//     its drive and feeder, the ribbed linkless chute arching from the inboard trunnion's feed joint over the housing into
//     the feeder, the cylinder under the housing pointing forward, the round lamp on top; the six barrels in their cluster
//     with the mid clamp 30 % along and the muzzle clamp 0.12 m short of the tips, one rotor about the bore
//     (gunRotorSpin.ts turns it while it fires); the linkless drum lives in the hull under the turret;
//   - the gunner's seat in his column, his sight head on a post on the column's front rim above the breech, the roll bar
//     rising at the mount's front and running back level at his shoulder to the column;
//   - the AN/VPS-2 range-only radar outboard of the ring's right rear on its arm and brace: its round housing 0.56 m
//     across, its flat face to the right front, the two upright cases fore and aft on it;
//   - on the hull, the long stowage case across the roof's left rear and the amber beacon at the right front (photo 03).
// Every datum the combat record shares is in profiles/m163Frame.ts (m163Specs.ts reads the same numbers).
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { latheY, sweptTube } from '../accessoryPrimitives.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import { buildM113HullSteps } from './m113.ts';
import { M113_BASE, m113Datums } from '../m113Datums.ts';
import { M741_RING } from '../m741Datums.ts';
import { GUN_ROTOR_KEY, type GunRotorTag } from '../gunRotorSpin.ts';
import {
  M163_GUN as G, M163_GUNNER, M163_MUZZLE_MOUTH, M163_MUZZLE_Z, M163_RADAR as R, M163_TRUNNION, M163_TURRET as T,
} from './m163Frame.ts';

type P3 = readonly [number, number, number];
const DEG = Math.PI / 180;
const [TX, TY, TZ] = M163_TRUNNION;

/**
 * A closed curved wall round the turret's axis (turret frame): the annular sector between two radii from one bearing to
 * another (degrees from +z towards +x), from its foot to a top that may slope from one end to the other. Smooth on its
 * curved faces, sharp at its edges; its faces wound outward.
 */
function arcWall(rIn: number, rOut: number, y0: number, top0: number, top1: number, fromDeg: number, toDeg: number,
  seg: number): THREE.BufferGeometry {
  const position: number[] = [], normal: number[] = [], uv: number[] = [];
  const at = (r: number, th: number, y: number): P3 => [r * Math.sin(th), y, r * Math.cos(th)];
  const push = (p: P3, n: P3, u: number, v: number): void => { position.push(...p); normal.push(...n); uv.push(u, v); };
  const tri = (a: [P3, P3], b: [P3, P3], c: [P3, P3]): void => {
    for (const [p, n] of [a, b, c]) push(p, n, p[0] + p[2], p[1]);
  };
  const th0 = fromDeg * DEG, th1 = toDeg * DEG;
  const topAt = (k: number): number => top0 + (top1 - top0) * (k / seg);
  for (let k = 0; k < seg; k++) {
    const a = th0 + (th1 - th0) * (k / seg), b = th0 + (th1 - th0) * ((k + 1) / seg);
    const ya = topAt(k), yb = topAt(k + 1);
    const na: P3 = [Math.sin(a), 0, Math.cos(a)], nb: P3 = [Math.sin(b), 0, Math.cos(b)];
    const ia: P3 = [-na[0], 0, -na[2]], ib: P3 = [-nb[0], 0, -nb[2]];
    // outer face
    const A = at(rOut, a, y0), B = at(rOut, b, y0), C = at(rOut, b, yb), D = at(rOut, a, ya);
    tri([A, na], [B, nb], [C, nb]); tri([A, na], [C, nb], [D, na]);
    // inner face
    const Ai = at(rIn, a, y0), Bi = at(rIn, b, y0), Ci = at(rIn, b, yb), Di = at(rIn, a, ya);
    tri([Ai, ia], [Ci, ib], [Bi, ib]); tri([Ai, ia], [Di, ia], [Ci, ib]);
    // top and foot
    const up: P3 = [0, 1, 0], down: P3 = [0, -1, 0];
    tri([D, up], [C, up], [Ci, up]); tri([D, up], [Ci, up], [Di, up]);
    tri([A, down], [Bi, down], [B, down]); tri([A, down], [Ai, down], [Bi, down]);
  }
  // the two ends
  const end = (th: number, y1: number, sign: number): void => {
    const n: P3 = [-sign * Math.cos(th), 0, sign * Math.sin(th)];
    const o0 = at(rOut, th, y0), o1 = at(rOut, th, y1), i1 = at(rIn, th, y1), i0 = at(rIn, th, y0);
    if (sign > 0) { tri([o0, n], [o1, n], [i1, n]); tri([o0, n], [i1, n], [i0, n]); }
    else { tri([o0, n], [i1, n], [o1, n]); tri([o0, n], [i0, n], [i1, n]); }
  };
  end(th0, top0, 1);
  end(th1, top1, -1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

// ---------------------------------------------------------------------------------------------------- the hull kit --
/** The long stowage case across the roof's left rear (photo 03: beyond the commander's open hatch, inboard of the
 * whip) on two skids, its lid's seam and strap; the amber beacon at the roof's right front (photo 03) on its post, its
 * lens in a cage. */
function addHullKit(P: TankBuilderPort): void {
  const { box, cylX, cylY, sph, xform } = KIT;
  const D = m113Datums('fsv'), roof = M113_BASE.roofY;
  const cx = 0.40, cz = D.sternZ + 0.42, len = 0.90, h = 0.24, d = 0.36;
  for (const dx of [-0.30, 0.30]) P.add('hullDetail', box(0.06, 0.03, d - 0.04), cx + dx, roof + 0.010, cz);
  P.addEquipment('hull', box(len, h, d), cx, roof + 0.02 + h / 2, cz);
  P.add('hullDark', box(len + 0.004, 0.012, d + 0.004), cx, roof + 0.02 + h * 0.72, cz);
  for (const dx of [-0.26, 0.26]) P.add('hullDark', box(0.04, h + 0.012, d + 0.012), cx + dx, roof + 0.02 + h / 2, cz);
  P.add('hullDark', cylX(0.012, 0.16, 8), cx, roof + 0.02 + h * 0.45, cz + d / 2 + 0.006);
  // the beacon
  const bx = -1.08, bz = 0.40;
  P.addEquipment('hullDark', cylY(0.055, 0.065, 0.03, 12), bx, roof + 0.010, bz);
  P.addEquipment('hullDark', cylY(0.016, 0.016, 0.12, 8), bx, roof + 0.08, bz);
  P.addEquipment('hullDark', cylY(0.05, 0.05, 0.025, 12), bx, roof + 0.150, bz);
  P.add('hullGlass', xform(sph(0.045, 12), 0, 0, 0, 0, 0, 0, [1, 1.35, 1]), bx, roof + 0.205, bz);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    P.add('hullDark', cylY(0.005, 0.005, 0.12, 6), bx + Math.sin(a) * 0.052, roof + 0.215, bz + Math.cos(a) * 0.052);
  }
  P.add('hullDark', cylY(0.054, 0.054, 0.008, 12), bx, roof + 0.278, bz);
}

// ------------------------------------------------------------------------------------------------------ the turret --
type PlanPoint = readonly [number, number];
/** A solid lofted upward between plan outlines (turret frame, [x, z] corners, the same corners at every height): a
 * sectionSolid built with its stations along +z, then stood up (rx -90 degrees: local (x, y, z) -> (x, z, -y)). */
function standing(stations: readonly { y: number; plan: readonly PlanPoint[] }[]): THREE.BufferGeometry {
  const rings = stations.map(({ y, plan }) => ({ z: y, ring: plan.map(([x, z]) => [x, -z] as SectionPoint) }));
  const ring0 = rings[0].ring;
  let area = 0;
  for (let i = 0; i < ring0.length; i++) {
    const a = ring0[i], b = ring0[(i + 1) % ring0.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sections = area > 0 ? rings : rings.map((s) => ({ z: s.z, ring: [...s.ring].reverse() }));
  return KIT.xform(sectionSolid(sections), 0, 0, 0, -Math.PI / 2, 0, 0);
}

/** The box shield's plan at one height: its inner edge on the column's face (1 cm into it), its flat outer face. */
function boxShieldPlan(halfW: number, depth: number, seg: number): PlanPoint[] {
  const C = T.column, B = T.boxShield, b = B.bearingDeg * DEG;
  const n: PlanPoint = [Math.sin(b), Math.cos(b)], t: PlanPoint = [Math.cos(b), -Math.sin(b)];
  const at = (u: number, s: number): PlanPoint => [C.x + n[0] * s + t[0] * u, C.z + n[1] * s + t[1] * u];
  const plan: PlanPoint[] = [];
  for (let k = 0; k <= seg; k++) {
    const u = halfW - (2 * halfW * k) / seg;
    plan.push(at(u, Math.sqrt(C.r * C.r - u * u) - 0.01));
  }
  plan.push(at(-halfW, C.r + depth), at(halfW, C.r + depth));
  return plan;
}

/**
 * The open mount (r2; photos 04, 07, 08, 09): the low slotted ring on the race, the gunner's column at its rear right
 * quarter with its rim bead, the box shield on the column's left-rear face, the tall plate at its right that carries the
 * radar's arm.
 */
function addTurretBody(P: TankBuilderPort): void {
  const { box, torus, xform } = KIT;
  const n = P.q ? 44 : 24;
  P.add('turret', latheY([[0.0005, T.footY], [T.footR, T.footY], [T.drumR, T.footY + 0.05], [T.drumR, T.deckY - 0.02],
    [T.drumR - 0.02, T.deckY], [0.0005, T.deckY]], n));
  // the ring's side slots (photo 09), the weld seam under the deck's edge
  for (const deg of [-70, -35, 0, 35, 70, 110]) {
    P.add('turretDark', xform(box(0.11, 0.05, 0.012), 0, 0, 0, 0, deg * DEG, 0),
      Math.sin(deg * DEG) * (T.drumR + 0.002), T.footY + 0.085, Math.cos(deg * DEG) * (T.drumR + 0.002));
  }
  P.add('turretDark', arcWall(T.drumR - 0.004, T.drumR + 0.004, T.deckY - 0.055, T.deckY - 0.045, T.deckY - 0.045,
    -178, 178, P.q ? 40 : 20));
  // the column: an open tub on the deck, its wall, rim and floor, a bead round the rim
  const C = T.column, cn = P.q ? 36 : 22;
  P.add('turret', latheY([[0.0005, T.deckY - 0.01], [C.r, T.deckY - 0.01], [C.r, C.topY], [C.r - C.wall, C.topY],
    [C.r - C.wall, T.deckY + 0.03], [0.0005, T.deckY + 0.03]], cn), C.x, 0, C.z);
  P.add('turretDetail', torus(C.r - C.wall / 2, 0.021, cn, 6), C.x, C.topY, C.z);
  // the box shield, its ends leaning out (two stations: its foot and its top) and a lip round its open top
  const B = T.boxShield, seg = P.q ? 10 : 6;
  P.add('turret', standing([{ y: B.footY, plan: boxShieldPlan(B.footHalfW, B.footDepth, seg) },
    { y: B.topY, plan: boxShieldPlan(B.topHalfW, B.topDepth, seg) }]));
  P.add('turretDetail', standing([{ y: B.topY - 0.03, plan: boxShieldPlan(B.topHalfW - 0.02, B.topDepth + 0.012, seg) },
    { y: B.topY + 0.006, plan: boxShieldPlan(B.topHalfW - 0.01, B.topDepth + 0.012, seg) }]));
  // the tall plate at the column's right, a stiffener down its outboard face
  const Rp = T.radarPlate, ph = Rp.topY - T.deckY + 0.01;
  P.add('turret', box(Rp.t, ph, Rp.z1 - Rp.z0), Rp.x, T.deckY - 0.01 + ph / 2, (Rp.z0 + Rp.z1) / 2);
  P.add('turretDetail', box(0.03, ph - 0.06, 0.04), Rp.x - Rp.t / 2 - 0.008, T.deckY + ph / 2 - 0.02, (Rp.z0 + Rp.z1) / 2);
}

/** The Vulcan's two trunnion arms on the deck either side of the housing, each with its boss; the inboard one the feed's
 * pedestal (the linkless drum lives in the hull under the turret and feeds up through it into the trunnion's joint). */
function addMount(P: TankBuilderPort): void {
  const { box, cylX } = KIT;
  const armH = TY - T.deckY + 0.01, armY = T.deckY - 0.01 + armH / 2;
  for (const [x, t] of [[G.armInnerX - G.armInnerT / 2, G.armInnerT], [G.armOuterX + G.armT / 2, G.armT]] as const) {
    P.add('turretDetail', box(t, armH, 0.20), x, armY, TZ);
    P.add('turretDetail', box(t + 0.04, 0.03, 0.26), x, T.deckY + 0.005, TZ);
    P.add('turretDetail', cylX(G.bossR, t + 0.02, P.q ? 18 : 12), x, TY, TZ);
  }
}

/** The gunner's seat in his column; his sight head on its post on the column's front rim, above the breech and inboard of
 * the gun's sweep (photos 00/01, 06); the roll bar rising at the mount's front, bending back and running level at his
 * shoulder over the gun's side to the column (photos 02, 04, 08). */
function addGunnerStation(P: TankBuilderPort): void {
  const { box, cylY, cylZ, xform } = KIT;
  const { seat: S, sight: V } = M163_GUNNER, C = T.column, floor = T.deckY + 0.03;
  P.add('turretDetail', cylY(0.035, 0.045, S.y - floor + 0.01, 12), S.x, (S.y + floor) / 2 - 0.02, S.z);
  P.add('turretDark', box(0.36, 0.06, 0.32), S.x, S.y, S.z);
  P.add('turretDark', xform(box(0.34, 0.20, 0.05), 0, 0, 0, -0.12, 0, 0), S.x, S.y + 0.13, S.z - 0.17);
  P.add('turretDetail', box(0.04, 0.16, 0.04), S.x, S.y + 0.07, S.z - 0.15);
  // the sight: its post standing in the column's front rim, the head, the front glass, the eyepiece and a hood
  const rimZ = C.z + Math.sqrt((C.r - C.wall / 2) ** 2 - (V.x - C.x) ** 2), postH = V.y - V.h / 2 - C.topY + 0.03;
  P.add('turretDetail', cylY(0.025, 0.032, postH, 12), V.x, C.topY - 0.01 + postH / 2, rimZ);
  P.addEquipment('turret', box(V.w, V.h, V.d), V.x, V.y, V.z);
  P.add('turretGlass', box(V.w - 0.05, V.h - 0.08, 0.012), V.x, V.y + 0.01, V.z + V.d / 2 + 0.004);
  P.add('turretDark', cylZ(0.032, 0.08, 12), V.x, V.y + 0.02, V.z - V.d / 2 - 0.03);
  P.add('turretDetail', box(V.w + 0.02, 0.02, 0.10), V.x, V.y + V.h / 2 + 0.006, V.z + V.d / 2 - 0.03);
  // the roll bar
  const bx = -0.16, barRimZ = C.z + Math.sqrt((C.r - C.wall / 2) ** 2 - (bx - C.x) ** 2);
  P.add('turretDetail', sweptTube([[bx, T.deckY - 0.01, 0.60], [bx, 0.62, 0.60], [bx, 0.93, 0.46], [bx, 0.99, 0.30],
    [bx, 0.97, 0.12], [bx, 0.82, barRimZ + 0.03], [bx, C.topY - 0.005, barRimZ]], 0.022, P.q ? 8 : 6, P.q ? 32 : 18));
}

/** The AN/VPS-2 (photos 01, 03, 06, 07): the arm from the tall plate out past the ring's edge with its brace, the yoke,
 * the round housing, its dish and horn forward, the two upright cases seated fore and aft on it, their straps. */
function addRadar(P: TankBuilderPort): void {
  const { box, cylY, cylZ, sph, xform } = KIT;
  const Rp = T.radarPlate;
  const ax = Rp.x - Rp.t / 2 + 0.01, az = (Rp.z0 + Rp.z1) / 2, dx = R.x - ax, dz = R.z - az, len = Math.hypot(dx, dz);
  P.add('turretDetail', xform(box(0.06, 0.05, len + 0.04), 0, 0, 0, 0, Math.atan2(dx, dz), 0), (ax + R.x) / 2, R.armY, (az + R.z) / 2);
  P.add('turretDetail', sweptTube([[ax, R.armY - 0.24, az], [R.x - dx * 0.15, R.armY - 0.01, R.z - dz * 0.15]], 0.018, 6, 4));
  P.add('turretDetail', box(0.16, 0.05, 0.16), R.x, R.yokeY, R.z);
  P.addEquipment('turret', sph(R.r, P.q ? 24 : 14), R.x, R.y, R.z);
  // the flat face and its horn, looking out to the right front (photo 03)
  const db = R.dishBearingDeg * DEG, face = (geometry: THREE.BufferGeometry) => xform(xform(geometry, 0, 0, 0, Math.PI / 2, 0, 0), 0, 0, 0, 0, db, 0);
  P.addEquipment('turretDark', face(latheY([[0.0005, 0.16], [R.dishR - 0.02, 0.16], [R.dishR, R.r - 0.03], [R.dishR, R.r + 0.01],
    [0.0005, R.r + 0.01]], P.q ? 24 : 14)), R.x, R.y, R.z);
  const hornAt = R.r + 0.065;
  P.add('turretDark', xform(cylZ(0.022, 0.12, 10), 0, 0, 0, 0, db, 0), R.x + Math.sin(db) * hornAt, R.y, R.z + Math.cos(db) * hornAt);
  const caseH = R.caseTopY - R.caseBottomY;
  for (const s of [-1, 1] as const) {
    const z = R.z + s * R.caseDz;
    P.addEquipment('turretEquipment', cylY(R.caseR, R.caseR, caseH, 14), R.x, (R.caseTopY + R.caseBottomY) / 2, z);
    for (const y of [R.caseBottomY + 0.12, R.caseTopY - 0.12]) P.add('turretDark', cylY(R.caseR + 0.005, R.caseR + 0.005, 0.03, 14), R.x, y, z);
  }
}

// ------------------------------------------------------------------------------------------------------------ gun --
/** One ring of a ribbed chute: a short collar laid across the curve at `u` (0..1). */
function chuteRib(curve: THREE.CatmullRomCurve3, u: number, r: number): THREE.BufferGeometry {
  const at = curve.getPointAt(u), along = curve.getTangentAt(u);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
  return KIT.cylY(r, r, 0.014, 12).applyMatrix4(new THREE.Matrix4().compose(at, q, new THREE.Vector3(1, 1, 1)));
}

/**
 * The Vulcan (gun-local; photos 02, 04, 06, 08, 10). Pitching with the gun, not recoiling or turning: the rotor housing and
 * its drive, the cross shaft through both arms, the feeder on the housing's top inboard and the ribbed linkless chute
 * arching from the inboard trunnion's feed joint over the housing into it, the cylinder under the housing pointing
 * forward, the round lamp on top. Turning (the rotor: the 'gun' and 'gunDark' buckets, gathered into the rotor group after
 * the merge): the six barrels, each bored at its muzzle, the rotor's front ring at the housing's mouth, the mid clamp 30 %
 * along and the muzzle clamp 0.12 m short of the tips, their spindle on the centre line.
 */
function addGun(P: TankBuilderPort): void {
  const { box, cylX, cylZ, torus, xform } = KIT;
  const n = P.q ? 28 : 18;
  // the housing and its drive at the rear
  const hLen = G.housingFrontZ - G.housingRearZ;
  P.addGunExtra(cylZ(G.housingR, hLen, n), 0, 0, (G.housingFrontZ + G.housingRearZ) / 2);
  P.addGunExtraDark(cylZ(G.driveR, G.housingRearZ - G.driveRearZ + 0.01, P.q ? 18 : 12), 0, 0, (G.housingRearZ + G.driveRearZ) / 2);
  P.addGunExtraDark(cylZ(G.housingR + 0.006, 0.03, n), 0, 0, G.housingFrontZ - 0.05);
  // the cross shaft into both arms
  const inner = G.armInnerX - TX - 0.01, outer = G.armOuterX - TX + 0.01;
  P.addGunExtraDark(cylX(0.045, outer - inner, 14), (inner + outer) / 2, 0, 0);
  // the feeder, and the ribbed chute from the inboard trunnion's feed joint arching 0.2 m over the housing into it
  P.addGunExtra(box(0.14, 0.10, 0.24), -0.06, 0.155, -0.05);
  P.addGunExtraDark(box(0.10, 0.02, 0.18), -0.06, 0.21, -0.05);
  // (along the elevation axis out of the joint until it is clear of the pedestal, then up and over)
  const chute: [number, number, number][] = [[inner, 0, 0], [-0.13, 0, 0], [-0.125, 0.10, -0.05], [-0.10, 0.27, -0.10],
    [-0.04, 0.30, -0.03], [-0.04, 0.19, 0.01]];
  P.addGunExtraDark(sweptTube(chute, G.chuteR, P.q ? 12 : 8, P.q ? 24 : 14));
  const curve = new THREE.CatmullRomCurve3(chute.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  for (let u = 0.2; u < 0.9; u += 0.075) P.addGunExtraDark(chuteRib(curve, u, G.chuteR + 0.007));
  // the cylinder under the housing pointing forward
  P.addGunExtraDark(cylZ(G.underR, G.underZ[1] - G.underZ[0], 14), 0, G.underY, (G.underZ[0] + G.underZ[1]) / 2);
  P.addGunExtraDark(cylZ(G.underR + 0.008, 0.03, 14), 0, G.underY, G.underZ[1] - 0.02);
  // the round lamp on its bracket on the housing's top outboard: its body, rim and glass forward
  P.addGunExtra(box(0.05, 0.08, 0.05), G.lampX, G.lampY - G.lampR - 0.02, G.lampZ);
  P.addGunExtra(cylZ(G.lampR, 0.12, 18, G.lampR * 0.8), G.lampX, G.lampY, G.lampZ);
  P.addGunExtraDark(xform(torus(G.lampR, 0.008, 18, 6), 0, 0, 0, Math.PI / 2, 0, 0), G.lampX, G.lampY, G.lampZ + 0.06);
  P.add('gunMountGlass', cylZ(G.lampR - 0.01, 0.01, 18), G.lampX, G.lampY, G.lampZ + 0.063);
  // the rotor: the six barrels bored at their muzzles, its front ring, the mid clamp and the muzzle clamp, their spindle
  const seg = P.q ? 12 : 8;
  for (let k = 0; k < G.barrels; k++) {
    const a = (k / G.barrels) * Math.PI * 2 + Math.PI / G.barrels;
    const bx = Math.sin(a) * G.pitchR, by = Math.cos(a) * G.pitchR;
    const tube = latheY([[0.0005, G.barrelRearZ], [G.barrelRearR, G.barrelRearZ], [G.barrelR, G.barrelTipZ],
      [G.boreR, G.barrelTipZ], [G.boreR, G.barrelTipZ - G.boreDepth], [0.0005, G.barrelTipZ - G.boreDepth]], seg);
    P.add('gun', xform(tube, 0, 0, 0, Math.PI / 2, 0, 0), bx, by, 0);
  }
  for (const [r, [z0, z1]] of [[G.collarR, G.collarZ], [G.midClampR, G.midClampZ], [G.muzzleClampR, G.muzzleClampZ]] as const) {
    P.add('gunDark', cylZ(r, z1 - z0, n), 0, 0, (z0 + z1) / 2);
  }
  P.add('gunDark', cylZ(G.hubR, M163_MUZZLE_Z - G.muzzleClampZ[1] + 0.005, P.q ? 14 : 10), 0, 0,
    (M163_MUZZLE_Z + G.muzzleClampZ[1] - 0.005) / 2);
  // the rotor's centre tie between the clamps, inside the cluster (it keeps the fire axis one line, gun-junction census)
  const tie0 = G.collarZ[1] - 0.01, tie1 = G.muzzleClampZ[0] + 0.01;
  P.add('gunDark', cylZ(0.012, tie1 - tie0, 8), 0, 0, (tie0 + tie1) / 2);
  // the clamps' bolt bosses, one between each pair of barrels
  for (let k = 0; k < G.barrels; k++) {
    const a = (k / G.barrels) * Math.PI * 2;
    for (const [r, [z0, z1]] of [[G.midClampR, G.midClampZ], [G.muzzleClampR, G.muzzleClampZ]] as const) {
      P.add('gunDark', xform(box(0.016, 0.014, z1 - z0 - 0.01), 0, 0, 0, 0, 0, -a), Math.sin(a) * (r + 0.004), Math.cos(a) * (r + 0.004), (z0 + z1) / 2);
    }
  }
  // the fire axis's mouth on the spindle's face, a small opening through it
  P.muzzleZ = M163_MUZZLE_Z;
  P.muzzleMouth = { ...M163_MUZZLE_MOUTH };
}

/**
 * The rotor group about the bore (recoil-local +z, through the trunnion), tagged for the spin owner (gunRotorSpin.ts):
 * after the merge, the merged barrel and clamp meshes (the 'gun' and 'gunDark' buckets, which carry only the rotor) move
 * into it at its identity frame, so every receipt reads them where they were drawn.
 */
function addRotor(P: TankBuilderPort): void {
  const rotor = new THREE.Group();
  rotor.name = 'm163_vulcan_rotor';
  const tag: GunRotorTag = Object.freeze({ barrels: G.barrels, cycleS: P.spec.gun.autoloader?.intraClipS ?? P.spec.gun.reloadS });
  rotor.userData[GUN_ROTOR_KEY] = tag;
  rotor.userData.weaponName = 'M168 20 mm Vulcan rotor';
  rotor.userData.caliberMm = 20;
  P.recoilG.add(rotor);
  const previous = P.postAssemble;
  P.postAssemble = (rig) => {
    previous?.(rig);
    for (const child of [...rig.recoilG.children]) {
      if (child === rotor) continue;
      const mesh = child instanceof THREE.Mesh ? child : null;
      if (mesh && (mesh.name === 'gun' || mesh.name === 'gunDark')) rotor.add(mesh);
    }
    if (!rotor.children.some((child) => child.name === 'gun')) throw new Error('m163_vads: the Vulcan\'s barrels must ride its rotor');
  };
}

function* buildM163Steps(P: TankBuilderPort): TankProfileBuild {
  yield* buildM113HullSteps(P, 'm741');
  addHullKit(P);
  yield 'buildM163HullKit';
  // the turret on the M741's race
  P.turretG.position.set(M741_RING.x, M741_RING.roofY, M741_RING.z);
  P.gunG.position.set(TX, TY, TZ);
  addTurretBody(P);
  addMount(P);
  addGunnerStation(P);
  addRadar(P);
  yield 'buildM163Turret';
  addGun(P);
  addRotor(P);
  P.turretG.userData.m163TurretReceipt = Object.freeze({
    carrier: 'm741', rotorBarrels: G.barrels, radarSide: 'right', gunSide: 'left', muzzleZ: M163_MUZZLE_Z, barrelTipZ: G.barrelTipZ,
  });
  P.topY = R.caseTopY;
  yield 'buildM163Vulcan';
}

const buildM163 = steppedBuilder((P: TankBuilderPort) => buildM163Steps(P));

export const M163_PROFILES = {
  m163_vads: { build: buildM163 },
} as const;
