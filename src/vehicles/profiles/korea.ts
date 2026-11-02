// Korean armored family — first-party procedural expansion.
//
// K2B (§5.299, owner order verbatim: "make our old pl-01 from before our
// changes into a new K2B tank in korea"): the pre-§5.248-wave PL-01 build is
// resurrected here as a NEW Korean fleet id. The geometry is the K2-donor
// variant exactly as it shipped before the poland ground-up wave landed
// (source of truth: `git show d7ba844f^:src/vehicles/profiles/poland.js`,
// buildPL01 = buildK2 + addPL01Package). The current pl01 (ratified §5.267
// ground-up stealth build) is untouched and remains Poland's.
//
// 267 (owner 2026-11-01, "update ... K2B"; 2026-10-25: "a proper mantlet and turret front that aligns with what a
// prototype of a k2 would look like"): the K2B now reads as a K2 development vehicle (research/k2b): the PL-01 diamond
// overlay is gone, so the K2's own arrowhead turret shows, and it carries the development package of the K2s on the
// Hyundai Rotem stand: bolted add-on cassettes with vertical faces over the cheeks either side of the K2's measured
// mantlet, corner smoke launchers and APS sensor heads (addK2BTurretFront), with the remote K6 and the skirt cassettes.
//
// Fidelity map vs the resurrected source: addK2BPackage is the verbatim old
// addPL01Package; mount/cassette are the verbatim old module helpers;
// addRoofWhips/addRoofRWS are the verbatim old addPolishWhips/addPolishRWS
// (renamed — the hardware is generic roof furniture, and this module is
// Korean). The ONLY functional delta is the baked hull number decal text:
// 'PL-01' -> 'K2B'.

import * as THREE from 'three';
import { KIT, FITTINGS, convexSlab } from './kit.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { addK2GunFront } from './k2X.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { buildK2 } from '../modern3.ts';
import type { Modern3BuilderPort } from '../modern3.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import type {
  ProceduralBuilderPort,
  Vec3Tuple,
  VehicleAssemblyOwner,
} from '../proceduralBuilderContracts.ts';
import { mount } from './fittingMount.ts';

function cassette(
  P: ProceduralBuilderPort,
  owner: VehicleAssemblyOwner,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  rotation: Vec3Tuple | null = null,
  cap = true,
): void {
  const r = rotation || [0, 0, 0];
  const armor = owner === 'hull' ? 'hull' : 'turret';
  const detail = owner === 'hull' ? 'hullDark' : 'turretDark';
  P.add(armor, KIT.box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (cap) P.add(detail, KIT.box(w * 0.70, 0.016, Math.max(0.024, d * 0.07)),
    x, y + h * 0.5 + 0.010, z + d * 0.27, r[0], r[1], r[2]);
}

function addRoofWhips(
  P: ProceduralBuilderPort,
  y: number,
  z: number,
  seed: number,
  spread = 1.02,
): void {
  for (const side of [-1, 1]) {
    P.add('turretDetail', KIT.cylY(0.034, 0.045, 0.060, 10), side * spread, y, z);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h: side < 0 ? 0.80 : 0.68, r: 0.012,
      rake: -side * 0.045, seed: seed + (side > 0 ? 1 : 0),
    }), side * spread, y + 0.03, z);
  }
}

function addOpenYokeAuxRWS(P: ProceduralBuilderPort): void {
  const x = 0.70;
  const y = 0.70;
  const z = -0.68;
  const yaw = -0.025;
  const station = FITTINGS.openYokeRws({
    mats: P.mats,
    bodySlot: 'hull',
    // K2B carries the same complete open-yoke mechanism as the M1A3 family,
    // but its low stealth roof needs a slightly tighter installation. Keep
    // every receiver/feed/optic/shield detail while trimming the whole tower
    // by roughly ten percent and shortening its powered riser.
    sizeStandard: 'k2b-compact-tower',
    scale: 1.14,
    towerRise: 0.12,
    variant: 'korean-twin',
    ammoSide: 1,
    sensorSide: -1,
    elev: 0.055,
    weaponName: 'K6 remote machine gun',
    seed: 1040,
  });
  station.name = 'k2bAuxOpenYokeRws';
  station.userData.hostVariant = 'k2b';
  station.userData.weaponRole = 'auxiliary';
  mount(P, 'turret', station, x, y, z, [0, yaw, 0]);
  P.turretG.userData.auxiliaryOpenYokeRwsReceipt = Object.freeze({
    host: 'k2b',
    designFamily: station.userData.designFamily,
    variant: station.userData.stationVariant,
    mountLocal: Object.freeze([x, y, z]),
    scale: station.userData.scale,
    sizeStandard: station.userData.sizeStandard,
    towerRiseM: station.userData.towerRise,
    yaw,
    caliberMm: station.userData.caliberMm,
    ammoSide: station.userData.ammoSide,
    sensorSide: station.userData.sensorSide,
    weaponRole: 'auxiliary',
    visibleFeedBelt: station.userData.hasVisibleFeedBelt,
    firingAxis: station.userData.firingAxis,
    equipmentOwned: true,
    turretOwned: true,
  });
}

/**
 * The K2B's turret front (267, rounds 2-3; research/k2b photos 1, 4-6): the K2 development vehicles' add-on cheek
 * package as three cleanly stacked armour modules a side, a stepped V in plan: each module's raked face is swept back
 * 55 degrees from the K2's measured mantlet (k2X.ts addK2GunFront) and set back 0.10 m from the module inboard of it,
 * so the steps show as faces of their own, and each module's top steps down outboard (all at or under the roof line).
 * The modules only meet on shared end planes (no interpenetration), mirror-exact either side; every module carries its
 * own bolt line. buildK2 builds this turret with `addOnFront`, so the K2's own blunt nose, cheek armour and banks are not
 * under it. Behind the modules a side armour block runs back along each flank, with the 2x3 smoke-grenade bank on its
 * front shoulder and an APS sensor head on the outer module.
 * Turret frame: the K2 ring [0, 1.66, -0.30]; +x is the tank's left; the seat floor is 0.03 (deck 1.66 + the seam).
 */
const K2B_CHEEK = Object.freeze({
  footY: 0.04,
  /** Module x spans (inner to outer), their set-backs, and their tops at their inner and outer ends. */
  modules: Object.freeze([
    Object.freeze({ x0: 0.47, x1: 0.82, step: 0.00, top0: 0.70, top1: 0.68 }),
    Object.freeze({ x0: 0.82, x1: 1.18, step: 0.10, top0: 0.64, top1: 0.60 }),
    Object.freeze({ x0: 1.18, x1: 1.54, step: 0.20, top0: 0.56, top1: 0.50 }),
  ]),
  /** The face line at the foot: from the mantlet side back along the sweep. Round 5 keeps the cheek body's faces where
   *  round 4 had them: the gun's clearance sweep skips gun samples inside the turret body's plan outline, and a body
   *  set back 8 cm beside the mantlet exposed its lower corner (K2B 12 yaws shallower, 24.6 mm at yaw -54). */
  noseZ: 2.68, sweep: Math.tan(55 * Math.PI / 180),
  /** The faces' lean: this far back per metre of height. */
  lean: 0.24 / 0.66,
  /** Round 5, the add-on wedge plate on each module, a wedge in plan: its foot this far ahead of the module face at its
   *  inner end (6 cm normal to the face) and at its outer end (12 cm), so each plate's face turns nearer the front than
   *  the cheek and its thick outer end shows as a step; its front leans back only plateLean per metre (steeper than the
   *  face, 2 cm prouder at its top); its top rakes forward and down like a wedge's, from plateBackDrop under the module's
   *  top at the face to plateFrontDrop at its front edge; its ends plateInset inside the module's, its back 5 mm into the
   *  module face. */
  plateDzIn: 0.107, plateDzOut: 0.214, plateLean: 0.27, plateBackDrop: 0.03, plateFrontDrop: 0.17, plateInset: 0.02,
  plateSeat: 0.005,
  /** The common back line, buried in the turret loft and the second roof skin; the module tops are the forward roof. */
  backZ0: 1.10, backZ1: 0.80, backX0: 0.47, backX1: 1.54,
});

function cheekFaceZ(x: number, y: number, step: number): number {
  const C = K2B_CHEEK;
  return C.noseZ - (x - C.backX0) * C.sweep - (y - C.footY) * C.lean - step;
}

function cheekBackZ(x: number): number {
  const C = K2B_CHEEK;
  return C.backZ0 + (C.backZ1 - C.backZ0) * (x - C.backX0) / (C.backX1 - C.backX0);
}

function addK2BTurretFront(P: ProceduralBuilderPort & Modern3BuilderPort): void {
  const { box, cylZ } = KIT;
  const C = K2B_CHEEK;
  for (const side of [-1, 1]) {
    const pv = new THREE.Vector3(0, 1, -C.plateLean).normalize();
    for (const m of C.modules) {
      const yb = C.footY;
      // the cheek body module: eight corners, six planar faces (raked front, falling top, two vertical ends, back, foot)
      P.add('turret', convexSlab(
        [side * m.x0, yb, cheekFaceZ(m.x0, yb, m.step)], [side * m.x1, yb, cheekFaceZ(m.x1, yb, m.step)],
        [side * m.x1, yb, cheekBackZ(m.x1)], [side * m.x0, yb, cheekBackZ(m.x0)],
        [side * m.x0, m.top0, cheekFaceZ(m.x0, m.top0, m.step)], [side * m.x1, m.top1, cheekFaceZ(m.x1, m.top1, m.step)],
        [side * m.x1, m.top1, cheekBackZ(m.x1)], [side * m.x0, m.top0, cheekBackZ(m.x0)]));
      // round 5: the add-on wedge plate standing proud of it, seated 5 mm into the face
      const topAt = (x: number): number => m.top0 + (m.top1 - m.top0) * (x - m.x0) / (m.x1 - m.x0);
      const xa = m.x0 + C.plateInset, xb = m.x1 - C.plateInset;
      const dzPerX = (C.plateDzOut - C.plateDzIn) / (xb - xa);
      const front = (x: number, y: number): number =>
        cheekFaceZ(x, yb, m.step) + C.plateDzIn + (x - xa) * dzPerX - (y - yb) * C.plateLean;
      const back = (x: number, y: number): number => cheekFaceZ(x, y, m.step) - C.plateSeat;
      // the plate face's frame: u along its foot edge, pv up its lean, pn out of it
      const u = new THREE.Vector3(side, 0, -(C.sweep - dzPerX)).normalize();
      const xAxis = side > 0 ? u.clone() : u.clone().negate();
      const pn = new THREE.Vector3().crossVectors(u, pv).normalize();
      if (pn.z < 0) pn.negate();
      const plateBasis = (origin: THREE.Vector3): THREE.Matrix4 =>
        new THREE.Matrix4().makeBasis(xAxis, new THREE.Vector3().crossVectors(pn, xAxis), pn).setPosition(origin);
      const ba = topAt(xa) - C.plateBackDrop, bb = topAt(xb) - C.plateBackDrop;      // top edge on the module face
      const fa = topAt(xa) - C.plateFrontDrop, fb = topAt(xb) - C.plateFrontDrop;    // top edge of the plate's front
      P.add('turret', convexSlab(
        [side * xa, yb, back(xa, yb)], [side * xb, yb, back(xb, yb)], [side * xb, yb, front(xb, yb)], [side * xa, yb, front(xa, yb)],
        [side * xa, ba, back(xa, ba)], [side * xb, bb, back(xb, bb)], [side * xb, fb, front(xb, fb)], [side * xa, fa, front(xa, fa)]));
      // bolt line: four flush bolt heads along the plate face, 0.07 m under its top edge
      for (const t of [0.15, 0.38, 0.62, 0.85]) {
        const x = xa + (xb - xa) * t, y = fa + (fb - fa) * t - 0.07;
        const bolt = box(0.032, 0.032, 0.010);
        bolt.applyMatrix4(plateBasis(new THREE.Vector3(side * x, y, front(x, y)).addScaledVector(pn, 0.003)));
        P.add('turretDark', bolt);
      }
    }
    if (side < 0) {
      // Round 5: the gun well's right-hand cheek. The K2 mantlet is narrower on its right (the gun mount to x 0.34,
      // against 0.43 on the sight side), so a 13 cm slot beside it looked down past the loft nose onto the driver's hatch
      // ring (the "faint arc" in plan). This frontal block on the inner module's face plane closes it, 1.5 cm clear of
      // the gun mount at every pitch (gun pitch keeps x), its back in the loft nose and its outer end 2 cm into the module.
      const yb = C.footY, wellTop = 0.60;
      const fz = (y: number): number => cheekFaceZ(C.backX0, y, 0);
      P.add('turret', convexSlab(
        [-0.355, yb, 2.30], [-0.49, yb, 2.30], [-0.49, yb, fz(yb)], [-0.355, yb, fz(yb)],
        [-0.355, wellTop, 2.30], [-0.49, wellTop, 2.30], [-0.49, wellTop, fz(wellTop)], [-0.355, wellTop, fz(wellTop)]));
    }
    // APS sensor head centred on the outer module's top (between its face edge and its back line)
    const outer = C.modules[2];
    const sx = 1.34, sy = outer.top0 + (outer.top1 - outer.top0) * (sx - outer.x0) / (outer.x1 - outer.x0);
    const sz = (cheekFaceZ(sx, sy, outer.step) + cheekBackZ(sx)) / 2;
    P.add('turretDetail', box(0.15, 0.13, 0.17), side * sx, sy + 0.055, sz);
    P.add('turretDark', box(0.11, 0.085, 0.012), side * sx, sy + 0.06, sz + 0.088);
    P.add('turretGlass', box(0.065, 0.045, 0.006), side * sx, sy + 0.06, sz + 0.095);
    // Side armour block from the modules' back along the flank, its foot buried in the loft wall, an APS panel on it
    P.add('turret', convexSlab(
      [side * 1.30, 0.04, 0.90], [side * 1.58, 0.04, 0.90], [side * 1.58, 0.06, -0.22], [side * 1.36, 0.06, -0.22],
      [side * 1.30, 0.44, 0.90], [side * 1.52, 0.44, 0.90], [side * 1.52, 0.44, -0.22], [side * 1.32, 0.46, -0.22]));
    P.add('turretDark', box(0.012, 0.18, 0.24), side * 1.582, 0.24, 0.20);
    P.add('turretGlass', box(0.008, 0.10, 0.14), side * 1.588, 0.24, 0.20);
    for (const z of [-0.08, 0.46]) P.add('turretDark', box(0.010, 0.30, 0.016), side * 1.581, 0.23, z);
    // 2x3 smoke-grenade bank on the side block's front shoulder, just behind the modules, looking forward, out and up
    const bank = new THREE.Matrix4().compose(new THREE.Vector3(side * 1.61, 0.30, 0.66),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.32, side * 0.55, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    const bracket = box(0.30, 0.22, 0.10);
    bracket.translate(side * -0.02, 0, -0.03);
    bracket.applyMatrix4(bank);
    P.add('turretDetail', bracket);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      const tube = markSmokeTube(cylZ(0.045, 0.24, P.q ? 12 : 8));
      tube.translate((col - 1) * 0.095, (row - 0.5) * 0.095, 0.12);
      tube.applyMatrix4(bank);
      P.add('turretDetail', tube);
      const mouth = new THREE.CircleGeometry(0.034, P.q ? 12 : 8);
      mouth.translate((col - 1) * 0.095, (row - 0.5) * 0.095, 0.2415);
      mouth.applyMatrix4(bank);
      P.add('turretDark', mouth);
    }
  }
}

/**
 * The K2B's front-corner fender/lamp housings (267 round 3; research/k2b photos 1, 5): a matched pair of armoured
 * boxes on the front corners, as wide as the fender (x 1.14..1.78), each with two lamps in recessed bezels on its
 * slightly raked face, and a wide rubber flap under it. buildK2 builds the K2B hull with `k2bBow`, which leaves out the K2's
 * small glacis lamp housings and compact flaps and rakes the guard and bow-wedge feet back.
 * Hull frame; the housing tops stay at 1.40 m, under the gun's published depression over the corners.
 */
function addK2BCornerHousings(P: ProceduralBuilderPort & Modern3BuilderPort): void {
  const { box } = KIT;
  for (const side of [-1, 1]) {
    const xi = side * 1.14, xo = side * 1.78;
    P.add('hull', convexSlab(
      [xi, 1.20, 3.52], [xo, 1.20, 3.52], [xo, 1.20, 3.08], [xi, 1.20, 3.08],
      [xi, 1.37, 3.49], [xo, 1.37, 3.49], [xo, 1.40, 3.08], [xi, 1.40, 3.08]));
    P.add('hullDark', box(0.62, 0.012, 0.012), side * 1.46, 1.372, 3.488);  // lid seam along the face's top edge
    for (const x of [1.30, 1.60]) {
      const lean = Math.atan2(0.03, 0.17);
      P.add('hullDark', box(0.13, 0.10, 0.012), side * x, 1.29, 3.508, -lean, 0, 0);
      P.add('hullGlass', markVehicleNightLens(KIT.cylZ(0.038, 0.010, 16), 'headlight'), side * x, 1.29, 3.514, -lean, 0, 0);
    }
    // 267 round 4: the housing's rubber curtain sat wholly inside the raked bow wedge; the K2's own front mudflap
    // (modern3.ts buildFrontGuards) now hangs from the wedge foot below this housing.
  }
}

function addK2BPackage(P: ProceduralBuilderPort & Modern3BuilderPort): void {
  const { box, cylY } = KIT;

  // Full-height modular stealth sides: the panels overlap the intact K2
  // skirt/fender structure but remain outside the animated shoe envelope.
  // Their upper bevel follows the source's single long shoulder fold.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const z = 2.58 - i * 0.78;
      // 267 round 3: the panels close up to 15 mm seams (they stood 8 cm apart) and, between the end panels, come down
      // with the skirt hem over the road wheels' top quarter (0.56; they stopped at 0.65)
      const end = i === 0 || i === 7;
      const h = end ? 0.82 : 1.03, y = end ? 1.12 : 1.075 + (i % 2) * 0.008;
      cassette(P, 'hull', side * 1.86, y, z,
        0.075, h, 0.765, [0, 0, side * (i < 2 ? 0.035 : -0.012)], false);
      // the two bow cassettes lean in 0.035 rad: their top strip follows the leaning face (it stood 10 mm off it)
      P.add('hullDark', box(0.020, 0.040, 0.56), side * (i < 2 ? 1.8925 : 1.905),
        1.48, z);
      P.add('hullDetail', box(0.020, 0.54, 0.025), side * 1.907,
        1.13, z + 0.33);
    }
    // The cassettes stand 10 cm outboard of the K2 skirt (outer face 1.72): a mounting rail along the skirt top carries
    // them (owner 2026-10-19 sweep: they floated beside it with nothing joining them to the hull).
    P.add('hull', box(0.12, 0.05, 6.10), side * 1.77, 1.46, -0.15);
  }
  P.add('hullDark', box(2.72, 0.055, 0.12), 0, 1.22, 3.48, -0.26, 0, 0);
  addK2BCornerHousings(P);                                             // 267 round 3: replaces the K2B's glacis lamp clusters

  // Joined station loft for the source's low diamond turret. These pieces
  // intersect the K2 crown and each other, forming one closed stealth mass.
  // 2026-10-25 (the owner: "give the k2b a proper mantlet and turret front that aligns with what a prototype of a k2
  // would look like"): the diamond's front no longer buries the gun. It parts into the K2's two raked cheek wedges
  // (the diamond's own outer faces, cut at x 0.45) round a gun well, a gun housing at its back, and the K2's measured
  // mantlet, sight hood and collar (k2X.ts addK2GunFront) standing proud in it.
  // 267 (owner 2026-11-01, "update ... K2B"): the PL-01 diamond overlay and its paired roof heads are gone; the K2's own
  // arrowhead turret (buildK2) carries the development package instead (addK2BTurretFront).
  addK2BTurretFront(P);
  // VH.14 (coordinator ruling 2026-10-14): the K2's one roof gun is the loader's K6 on its working open-yoke station;
  // the second roof RWS gun is gone
  addOpenYokeAuxRWS(P);
  addRoofWhips(P, 0.705, -1.72, 1030, 1.00);

  // The K2's gun front (the K2 X measured mantlet, sight hood and collar) on the K2B's trunnion. The K2B carries its
  // trunnion 1.72 m ahead of its ring (the K2 1.15 m), so turned aft the mantlet hangs over the engine deck: its lower
  // rear corner, 0.354 m under the bore, stood under the deck's top (the gun held -0.9 deg over the stern), and is
  // trimmed to the old gun plant's 0.24 m.
  const gunFrontPort = P as ProceduralBuilderPort & Partial<Pick<TankBuilderPort, 'addEquipment'>>;
  if (!gunFrontPort.addEquipment) throw new Error('K2B gun front requires the builder equipment slots');
  addK2GunFront(gunFrontPort as Pick<TankBuilderPort, 'add' | 'addEquipment'>, 0.24);
  P.add('turretDetail', cylY(0.11, 0.12, 0.08, 14), 0.56, 0.73, -0.22);
  P.decal('hull', 'number', 'K2B', 0.24, [-1.90, 1.18, -0.42], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.48);
}

function buildK2B(P: ProceduralBuilderPort & Modern3BuilderPort): void {
  buildK2(P, { addOnFront: true, k2bBow: true });
  addK2BPackage(P);
  // Release 240 (the owner: "make sure all tank turrets are clear of hulls"): the ring receipt reads the deck at its
  // well's floor (1.56), so its seat (turretSeatRace.ts) stopped at 1.63, 3 cm into the 1.66 roof round the ring, and the
  // loft's underside swept the roof and its kit (to 1.679) at every bearing. The seat takes that roof's plane with its
  // 3 cm seam as a floor.
  P.turretG.userData.turretSeatMinY = 1.69;
}

export const KOREA_PROFILES = {
  k2b: { build: buildK2B },
} satisfies VehicleProfileRecord;
