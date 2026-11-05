// M163 VADS (release 269, builder V; the owner 2026-11-04: "also add the m163 VADS", built on the South Africa/Australia
// session's M113 work, then "that m163 literally has a gatling gun/minigun on its turret so itll be so fun to have in game
// and play around with"): the M157 mount's open one-man turret and its M168 Vulcan on the M741, the M113A1 carrier the
// M113 builder draws (profiles/m113.ts buildM113HullSteps(P, 'm741')), from the photographs (photos/m163: 00/03 the owner's
// right-front quarter, 01/06 right front, 02 the gun close up, 04 the left side, 05 the front, 07 the rear, 08 the gun
// from the left, 10 the autotrack turret) and the published figures (docs/references/tanks/m163_vads.md):
//   - a low drum on the M741's race, its deck 0.25 m over the roof;
//   - the Vulcan on the left front between two trunnion arms: the rotor housing with its drive and feeder, the six
//     barrels in their cluster with the mid clamp and the muzzle clamp, the lamp on top, the linkless chute fed in through
//     the inboard trunnion; the barrels and their clamps one rotor about the bore (gunRotorSpin.ts turns it while it fires);
//   - the linkless drum on the left rear and its chute to the inboard trunnion;
//   - the gunner's seat in the middle, his lead-computing sight on its post before him, the hand rail arching over his
//     front;
//   - the AN/VPS-2 range-only radar on the right rear: its round housing on a yoke and post, the dish forward, the two
//     upright cases either side;
//   - a tall curved shield round the left rear and a lower one round the right front;
//   - on the hull, the long stowage case across the roof's left rear and the amber beacon at the right front (photo 03).
// Every datum the combat record shares is in profiles/m163Frame.ts (m163Specs.ts reads the same numbers).
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { latheY, sweptTube } from '../accessoryPrimitives.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import { buildM113HullSteps } from './m113.ts';
import { M113_BASE, m113Datums } from '../m113Datums.ts';
import { M741_RING } from '../m741Datums.ts';
import { GUN_ROTOR_KEY, type GunRotorTag } from '../gunRotorSpin.ts';
import {
  M163_AMMO_DRUM as DRUM, M163_GUN as G, M163_GUNNER, M163_MUZZLE_MOUTH, M163_MUZZLE_Z, M163_RADAR as R, M163_TRUNNION,
  M163_TURRET as T,
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
/** The drum on the race and the two shields round it (photos 03, 04, 07, 08). */
function addTurretBody(P: TankBuilderPort): void {
  const n = P.q ? 44 : 24;
  P.add('turret', latheY([[0.0005, T.footY], [T.footR, T.footY], [T.drumR, T.footY + 0.05], [T.drumR, T.deckY - 0.02],
    [T.drumR - 0.02, T.deckY], [0.0005, T.deckY]], n));
  const rIn = T.shieldR - T.shieldT, seg = P.q ? 14 : 8;
  // the left shield: full height over the drum, its top level (photos 04, 08); the right one lower, raked down astern
  const L = T.leftShield, Rs = T.rightShield;
  P.add('turret', arcWall(rIn, T.shieldR, T.deckY - 0.01, L.topY, L.topY, L.fromDeg, L.toDeg, seg));
  P.add('turret', arcWall(rIn, T.shieldR, T.deckY - 0.01, Rs.topY - 0.06, Rs.topY, Rs.fromDeg, Rs.toDeg, P.q ? 10 : 6));
  // the shields' rolled top lips and the drum's weld seam under the deck's edge
  P.add('turretDetail', arcWall(rIn - 0.012, T.shieldR + 0.006, L.topY - 0.025, L.topY + 0.004, L.topY + 0.004,
    L.fromDeg + 1, L.toDeg - 1, seg));
  P.add('turretDark', arcWall(T.drumR - 0.004, T.drumR + 0.004, T.deckY - 0.075, T.deckY - 0.065, T.deckY - 0.065,
    -178, 178, P.q ? 40 : 20));
}

/** The Vulcan's two trunnion arms on the deck either side of the housing, each with its boss; the linkless drum on the
 * left rear and its chute up to the inboard trunnion (photos 07, 08: the round body behind the gun, the ribbed chute). */
function addMountAndDrum(P: TankBuilderPort): void {
  const { box, cylX, cylY } = KIT;
  const armH = TY - T.deckY + 0.01, armY = T.deckY - 0.01 + armH / 2;
  for (const x of [G.armInnerX - G.armT / 2, G.armOuterX + G.armT / 2]) {
    P.add('turretDetail', box(G.armT, armH, 0.20), x, armY, TZ);
    P.add('turretDetail', box(G.armT + 0.04, 0.03, 0.26), x, T.deckY + 0.005, TZ);
    P.add('turretDetail', cylX(G.bossR, G.armT + 0.02, P.q ? 18 : 12), x, TY, TZ);
  }
  // the drum: its body down into the deck, its lid, two hoops, the exit spout at its top front
  const dh = DRUM.topY - T.deckY + 0.01;
  P.addEquipment('turret', cylY(DRUM.r, DRUM.r, dh, P.q ? 28 : 16), DRUM.x, T.deckY - 0.01 + dh / 2, DRUM.z);
  P.addEquipment('turret', cylY(DRUM.r * 0.86, DRUM.r - 0.005, 0.04, P.q ? 28 : 16), DRUM.x, DRUM.topY + 0.015, DRUM.z);
  for (const y of [T.deckY + 0.12, DRUM.topY - 0.10]) P.add('turretDark', cylY(DRUM.r + 0.006, DRUM.r + 0.006, 0.025, P.q ? 28 : 16), DRUM.x, y, DRUM.z);
  P.add('turretDark', box(0.12, 0.08, 0.10), DRUM.x - 0.06, DRUM.topY + 0.01, DRUM.z + 0.12);
  // the linkless chute from the spout over the gunner's left to the inboard arm, into the trunnion's feed joint
  P.add('turretDark', sweptTube([[DRUM.x - 0.06, DRUM.topY + 0.03, DRUM.z + 0.12], [0.14, 0.80, -0.12], [0.05, 0.74, 0.08],
    [0.03, 0.63, TZ - 0.07], [0.06, TY, TZ], [G.armInnerX - G.armT + 0.01, TY, TZ]], 0.04, P.q ? 10 : 7, P.q ? 20 : 12));
}

/** The gunner's seat, his sight on its post and the hand rail arching over his front (photos 01, 02, 03, 04, 10). */
function addGunnerStation(P: TankBuilderPort): void {
  const { box, cylY, cylZ, xform } = KIT;
  const { seat: S, sight: V } = M163_GUNNER;
  P.add('turretDetail', cylY(0.035, 0.045, S.y - T.deckY + 0.01, 12), S.x, (S.y + T.deckY) / 2 - 0.02, S.z);
  P.add('turretDark', box(0.38, 0.06, 0.34), S.x, S.y, S.z);
  P.add('turretDark', xform(box(0.36, 0.42, 0.05), 0, 0, 0, -0.12, 0, 0), S.x, S.y + 0.24, S.z - 0.19);
  P.add('turretDetail', box(0.04, 0.30, 0.04), S.x, S.y + 0.12, S.z - 0.17);
  // the sight: its post, the head, the front glass, the eyepiece and the combining glass on top
  P.add('turretDetail', cylY(0.028, 0.036, V.y - T.deckY - V.h / 2 + 0.02, 12), V.x, (T.deckY + V.y - V.h / 2) / 2, V.z - 0.02);
  P.addEquipment('turret', box(V.w, V.h, V.d), V.x, V.y, V.z);
  P.add('turretGlass', box(V.w - 0.04, V.h - 0.07, 0.012), V.x, V.y + 0.01, V.z + V.d / 2 + 0.004);
  P.add('turretDark', cylZ(0.03, 0.07, 12), V.x, V.y + 0.02, V.z - V.d / 2 - 0.03);
  P.add('turretDetail', box(0.10, 0.05, 0.04), V.x, V.y + V.h / 2 + 0.015, V.z + 0.02);
  P.add('turretGlass', xform(box(0.13, 0.10, 0.008), 0, 0, 0, -0.55, 0, 0), V.x, V.y + V.h / 2 + 0.075, V.z + 0.035);
  // the hand rail: from the deck at the gun's side, up and over the gunner's front, down to the deck on his right
  P.add('turretDetail', sweptTube([[0.02, T.deckY - 0.01, 0.46], [0.02, 0.76, 0.46], [-0.08, 0.98, 0.40], [-0.30, 0.98, 0.36],
    [-0.44, 0.74, 0.40], [-0.50, T.deckY - 0.01, 0.44]], 0.022, P.q ? 8 : 6, P.q ? 28 : 16));
}

/** The AN/VPS-2 on the right rear (photos 01, 03, 06, 07): the post and yoke, the round housing, the dish and its
 * horn forward, the two upright cases on arms either side with their straps. */
function addRadar(P: TankBuilderPort): void {
  const { box, cylY, cylZ, sph } = KIT;
  const postH = R.yokeY - T.deckY + 0.01;
  P.add('turretDetail', cylY(R.postR, R.postR + 0.015, postH, 14), R.x, T.deckY - 0.01 + postH / 2, R.z);
  P.add('turretDetail', box(0.16, 0.08, 0.16), R.x, R.yokeY, R.z);
  P.addEquipment('turret', sph(R.r, P.q ? 24 : 14), R.x, R.y, R.z);
  P.addEquipment('turretDark', cylZ(R.dishR, 0.05, P.q ? 28 : 16), R.x, R.y, R.z + R.r - 0.03);
  P.add('turretDark', cylZ(0.022, 0.12, 10), R.x, R.y, R.z + R.r + 0.045);
  const caseH = R.caseTopY - R.caseBottomY;
  for (const s of [-1, 1] as const) {
    const x = R.x + s * R.caseDx;
    P.addEquipment('turretEquipment', cylY(R.caseR, R.caseR, caseH, 14), x, (R.caseTopY + R.caseBottomY) / 2, R.z);
    for (const y of [R.caseBottomY + 0.12, R.caseTopY - 0.12]) P.add('turretDark', cylY(R.caseR + 0.005, R.caseR + 0.005, 0.03, 14), x, y, R.z);
    // the arm from the yoke out to the case
    const x0 = R.x + s * 0.07, x1 = x - s * (R.caseR - 0.01);
    P.add('turretDetail', box(Math.abs(x1 - x0), 0.05, 0.06), (x0 + x1) / 2, R.yokeY + 0.01, R.z);
  }
}

// ------------------------------------------------------------------------------------------------------------ gun --
/**
 * The Vulcan (gun-local; photos 02, 04, 08, 10). Pitching with the gun, not recoiling or turning: the rotor housing and
 * its drive, the cross shaft through both arms, the feeder on the housing's top inboard and its chute from the inboard
 * trunnion, the drive cylinder under it, the lamp on top. Turning (the rotor: the 'gun' and 'gunDark' buckets, gathered
 * into the rotor group after the merge): the six barrels, each bored at its muzzle, the rotor's front ring at the
 * housing's mouth, the mid clamp and the muzzle clamp.
 */
function addGun(P: TankBuilderPort): void {
  const { box, cylX, cylZ, xform } = KIT;
  const n = P.q ? 28 : 18;
  // the housing and its drive at the rear
  const hLen = G.housingFrontZ - G.housingRearZ;
  P.addGunExtra(cylZ(G.housingR, hLen, n), 0, 0, (G.housingFrontZ + G.housingRearZ) / 2);
  P.addGunExtraDark(cylZ(G.driveR, G.housingRearZ - G.driveRearZ + 0.01, P.q ? 18 : 12), 0, 0, (G.housingRearZ + G.driveRearZ) / 2);
  P.addGunExtraDark(cylZ(G.housingR + 0.006, 0.03, n), 0, 0, G.housingFrontZ - 0.05);
  // the cross shaft into both arms
  const inner = G.armInnerX - TX - 0.01, outer = G.armOuterX - TX + 0.01;
  P.addGunExtraDark(cylX(0.045, outer - inner, 14), (inner + outer) / 2, 0, 0);
  // the feeder and the chute from the inboard trunnion's feed joint
  P.addGunExtra(box(0.14, 0.10, 0.24), -0.06, 0.155, -0.05);
  P.addGunExtraDark(box(0.10, 0.02, 0.18), -0.06, 0.21, -0.05);
  P.addGunExtraDark(sweptTube([[inner, 0, 0], [-0.16, 0, 0], [-0.13, 0.08, -0.03], [-0.11, 0.15, -0.05]], 0.032,
    P.q ? 8 : 6, P.q ? 14 : 9));
  // the drive cylinder under the housing
  P.addGunExtraDark(cylZ(0.042, 0.50, 14), 0.06, -0.13, 0.15);
  // the lamp on its bracket on the housing's top outboard, its glass forward
  P.addGunExtra(box(0.04, 0.09, 0.04), 0.08, 0.125, 0.08);
  P.addGunExtra(cylZ(0.055, 0.10, 16), 0.08, 0.205, 0.08);
  P.add('gunMountGlass', cylZ(0.046, 0.01, 16), 0.08, 0.205, 0.134);
  // the rotor: the six barrels bored at their muzzles, its front ring, the mid clamp and the muzzle clamp
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
  // the muzzle clamp's hub on the centre line, the fire axis's mouth on its face
  P.add('gunDark', cylZ(G.hubR, M163_MUZZLE_Z - G.muzzleClampZ[1] + 0.005, P.q ? 18 : 12), 0, 0,
    (M163_MUZZLE_Z + G.muzzleClampZ[1] - 0.005) / 2);
  // the clamps' bolt bosses, one between each pair of barrels
  for (let k = 0; k < G.barrels; k++) {
    const a = (k / G.barrels) * Math.PI * 2;
    for (const [r, [z0, z1]] of [[G.midClampR, G.midClampZ], [G.muzzleClampR, G.muzzleClampZ]] as const) {
      P.add('gunDark', xform(box(0.016, 0.014, z1 - z0 - 0.01), 0, 0, 0, 0, 0, -a), Math.sin(a) * (r + 0.004), Math.cos(a) * (r + 0.004), (z0 + z1) / 2);
    }
  }
  // the fire axis's mouth on the hub's face, a small opening through it
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
  addMountAndDrum(P);
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
