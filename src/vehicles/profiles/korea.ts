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
// mantlet, corner smoke launchers and APS sensor heads (addK2BTurretFront), with the remote K6 and (r269) the export K2's
// bolted skirt-module run along the hull's flank line and two raised fuel cans on the bustle (k2bHullKit.ts).
//
// Fidelity map vs the resurrected source: addK2BPackage began as the verbatim old
// addPL01Package (r269: its skirt cassettes are gone); mount is the verbatim old module helper;
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
} from '../proceduralBuilderContracts.ts';
import { mount } from './fittingMount.ts';
import { addK2BFuelCans, addK2BSkirtRun, convexStock } from './k2bHullKit.ts';

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
 * The K2B's turret front (267, rounds 2-6; research/k2b photos 1, 4-6): the K2 development vehicles' add-on cheek
 * package as three cleanly stacked armour modules a side, a stepped V in plan converging on the K2's measured mantlet
 * (k2X.ts addK2GunFront): each module's raked face is swept back 60 degrees from it and set back 0.06 m from the module
 * inboard of it, so the steps show as faces of their own, and each module's top steps down outboard (all under the roof
 * line). Each module carries a proud add-on wedge plate (K2B_CHEEK).
 * The modules only meet on shared end planes (no interpenetration), mirror-exact either side; every module carries its
 * own bolt line. buildK2 builds this turret with `addOnFront`, so the K2's own blunt nose, cheek armour and banks are not
 * under it. An APS sensor head stands on the outer module; beside it, at each cheek corner, the bolted cheek pod (r268b:
 * launcher housing with the 2x3 smoke-grenade dischargers, armour boxes on brackets along the flank; addK2BCheekPod).
 * Turret frame: the K2 ring [0, 1.66, -0.30]; +x is the tank's left; the seat floor is 0.03 (deck 1.66 + the seam).
 */
const K2B_CHEEK = Object.freeze({
  footY: 0.04,
  /** Module x spans (inner to outer), their set-backs, and their tops at their inner and outer ends (all under the
   *  turret's roof line, 0.74-0.78 behind them). */
  modules: Object.freeze([
    Object.freeze({ x0: 0.47, x1: 0.78, step: 0.00, top0: 0.70, top1: 0.68 }),
    Object.freeze({ x0: 0.78, x1: 1.09, step: 0.06, top0: 0.64, top1: 0.61 }),
    Object.freeze({ x0: 1.09, x1: 1.40, step: 0.12, top0: 0.57, top1: 0.53 }),
  ]),
  /** The face line at the foot: from the mantlet side back along the sweep. The nose stays where rounds 4-5 had it: the
   *  gun's clearance sweep skips gun samples inside the turret body's plan outline, and a body set back 8 cm beside the
   *  mantlet exposed its lower corner (round 5: K2B 12 yaws shallower, 24.6 mm at yaw -54). Round 6 (critic: "a sharper
   *  arrowhead with the gun at the point") sweeps the faces 60 degrees from that nose, not 55. */
  noseZ: 2.68, sweep: Math.tan(60 * Math.PI / 180),
  /** The faces' lean: this far back per metre of height (round 6: 27 degrees, was 20; "too upright and boxy"). */
  lean: 0.50,
  /** The add-on wedge plate on each module (rounds 5-6). In plan a wedge: its foot this far ahead of the module face at
   *  its inner end (6 cm normal to it) and at its outer end (12 cm), so its thick outer end shows as a step. In section a
   *  wedge: a steep nose (plateNoseLean per metre) up to plateKneeY, then its upper face laid back 39-47 degrees to a
   *  narrow land plateLand ahead of the module face, plateTopDrop under the module's top. Its ends plateInset inside the
   *  module's, its back plateSeat into the module face. */
  plateDzIn: 0.107, plateDzOut: 0.214, plateNoseLean: 0.27, plateKneeY: 0.20, plateTopDrop: 0.04, plateLand: 0.02,
  plateInset: 0.02, plateSeat: 0.005,
  /** The common back line, buried in the turret loft and the roof skins; the module tops are the forward roof. */
  backZ0: 1.10, backZ1: 0.40, backX0: 0.47, backX1: 1.54,
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
  const { box } = KIT;
  const C = K2B_CHEEK;
  for (const side of [-1, 1]) {
    for (const m of C.modules) {
      const yb = C.footY;
      // the cheek body module: eight corners, six planar faces (raked front, falling top, two vertical ends, back, foot)
      P.add('turret', convexSlab(
        [side * m.x0, yb, cheekFaceZ(m.x0, yb, m.step)], [side * m.x1, yb, cheekFaceZ(m.x1, yb, m.step)],
        [side * m.x1, yb, cheekBackZ(m.x1)], [side * m.x0, yb, cheekBackZ(m.x0)],
        [side * m.x0, m.top0, cheekFaceZ(m.x0, m.top0, m.step)], [side * m.x1, m.top1, cheekFaceZ(m.x1, m.top1, m.step)],
        [side * m.x1, m.top1, cheekBackZ(m.x1)], [side * m.x0, m.top0, cheekBackZ(m.x0)]));
      // the add-on wedge plate standing proud of it, seated 5 mm into the face (see K2B_CHEEK)
      const topAt = (x: number): number => m.top0 + (m.top1 - m.top0) * (x - m.x0) / (m.x1 - m.x0);
      const xa = m.x0 + C.plateInset, xb = m.x1 - C.plateInset;
      const dz = (x: number): number => C.plateDzIn + (x - xa) * (C.plateDzOut - C.plateDzIn) / (xb - xa);
      const foot = (x: number): number => cheekFaceZ(x, yb, m.step);
      const knee = (x: number): THREE.Vector3 =>
        new THREE.Vector3(side * x, C.plateKneeY, foot(x) + dz(x) - (C.plateKneeY - yb) * C.plateNoseLean);
      const land = (x: number): THREE.Vector3 => {
        const y = topAt(x) - C.plateTopDrop;
        return new THREE.Vector3(side * x, y, cheekFaceZ(x, y, m.step) + C.plateLand);
      };
      const corners: Vec3Tuple[] = [];
      for (const x of [xa, xb]) {
        const y = topAt(x) - C.plateTopDrop;
        corners.push([side * x, yb, foot(x) - C.plateSeat], [side * x, yb, foot(x) + dz(x)], knee(x).toArray(),
          land(x).toArray(), [side * x, y, cheekFaceZ(x, y, m.step) - C.plateSeat]);
      }
      P.add('turret', convexStock(corners));
      // bolt line: four flush bolt heads across the laid-back upper face, under its land
      for (const t of [0.15, 0.38, 0.62, 0.85]) {
        const x = xa + (xb - xa) * t, e = 0.01;
        const at = (xx: number): THREE.Vector3 => knee(xx).lerp(land(xx), 0.62);
        const ex = at(x + e).sub(at(x - e)).normalize();
        const ey = land(x).sub(knee(x)).normalize();
        const ez = new THREE.Vector3().crossVectors(ex, ey).normalize();
        if (ez.z < 0) { ez.negate(); ex.negate(); }
        ey.crossVectors(ez, ex);
        const bolt = box(0.032, 0.032, 0.010);
        bolt.applyMatrix4(new THREE.Matrix4().makeBasis(ex, ey, ez).setPosition(at(x).addScaledVector(ez, 0.003)));
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
    const sx = 1.25, sy = outer.top0 + (outer.top1 - outer.top0) * (sx - outer.x0) / (outer.x1 - outer.x0);
    const sz = (cheekFaceZ(sx, sy, outer.step) + cheekBackZ(sx)) / 2;
    P.add('turretDetail', box(0.15, 0.13, 0.17), side * sx, sy + 0.055, sz);
    P.add('turretDark', box(0.11, 0.085, 0.012), side * sx, sy + 0.06, sz + 0.088);
    P.add('turretGlass', box(0.065, 0.045, 0.006), side * sx, sy + 0.06, sz + 0.095);
    // r268b: the round-6 side block and its loose 2x3 bank give way to the bolted cheek pods (addK2BCheekPod)
    addK2BCheekPod(P, side);
  }
}

/**
 * The K2B's cheek pods (r268b, owner 2026-11-02: "add back the protruding side bits on the k2bs cheeks as attachments";
 * research/k2b photos 1, 4, 6). The live K2B carried the K2's stepped side boxes with their smoke launchers standing out
 * of the cheek corners (buildK2's cheek side armour and banks, which `addOnFront` leaves out); round 268 had laid them
 * flat into the arrowhead. They come back as bolted add-on equipment beside the round-6 front, which is unchanged:
 * - a launcher housing at each cheek corner, butted 1 cm into the outer cheek module's end and standing 0.41 m out from
 *   it, its front swept back only 32 degrees in plan (the cheek's V is 60, so the housing steps out of it as the K2
 *   photographs' corner boxes do) and laid back 22 degrees, a step down from the module's top, the 2x3 smoke-grenade
 *   discharger tubes standing 0.28 m out of its face, up and out (photo 6's launcher wedge, photo 4's tube bundles);
 * - behind it two bolted armour boxes in line along the flank (photo 6's side modules), their outer faces 3 cm inboard of
 *   the housing's, a 1.5 cm joint between them, bolt heads in rows, an APS warning panel on the front box;
 * - the boxes stand on bracket plates off the turret's leaning wall: an open gap of 8-26 cm shows between box and wall.
 * Turret frame; +x is the tank's left. Everything stays under 0.47 (the roof line is 0.70-0.78) and over the 0.03 seat.
 */
const K2B_POD = Object.freeze({
  footY: 0.05,
  /** Launcher housing: inner face 1 cm into the outer module's end (x 1.40), front foot corners, back, tops, lean. */
  housing: Object.freeze({ xIn: 1.39, xOut: 1.80, zFrontIn: 1.12, zFrontOut: 0.86, zBack: 0.42,
    topIn: 0.47, topOut: 0.44, lean: 0.40, chamfer: 0.05 }),
  /** The armour boxes behind it (z spans), their faces and top, the outer top chamfer. */
  boxes: Object.freeze([Object.freeze({ z0: 0.02, z1: 0.415 }), Object.freeze({ z0: -0.40, z1: 0.005 })]),
  boxXIn: 1.53, boxXOut: 1.77, boxTop: 0.42, boxChamfer: 0.04,
  /** Bracket plates (z) carrying the boxes off the wall, and their height band. */
  brackets: Object.freeze([0.33, 0.10, -0.08, -0.31]), bracketY0: 0.08, bracketY1: 0.38,
});

/** buildK2's turret loft wall (stations z 0.45 and -0.35, roof lifted -0.05): its half-width at height y, station z. */
function k2TurretWallX(y: number, z: number): number {
  const t = Math.min(1, Math.max(0, (0.45 - z) / 0.80));
  const bw = 1.50 + 0.02 * t, by = -0.10 + 0.02 * t, tw = 1.18 + 0.07 * t, ty = 0.64;
  return bw + (tw - bw) * (y - by) / (ty - by);
}

function addK2BCheekPod(P: ProceduralBuilderPort & Modern3BuilderPort, side: number): void {
  const { box, cylX, cylZ } = KIT;
  const D = K2B_POD, H = D.housing, yb = D.footY, seg = P.q ? 12 : 8;
  const sx = (x: number): number => side * x;
  // the housing: a raked front (foot corners zFrontIn/zFrontOut, laid back `lean` per metre), a vertical outer face whose
  // top edge is chamfered, a top falling outboard, a vertical back
  const frontZ = (x: number, y: number): number =>
    H.zFrontIn + (H.zFrontOut - H.zFrontIn) * (x - H.xIn) / (H.xOut - H.xIn) - (y - yb) * H.lean;
  const topAt = (x: number): number => H.topIn + (H.topOut - H.topIn) * (x - H.xIn) / (H.xOut - H.xIn);
  const xc = H.xOut - H.chamfer, yc = H.topOut - H.chamfer;
  P.add('turret', convexStock([
    [sx(H.xIn), yb, frontZ(H.xIn, yb)], [sx(H.xOut), yb, frontZ(H.xOut, yb)], [sx(H.xOut), yb, H.zBack], [sx(H.xIn), yb, H.zBack],
    [sx(H.xIn), H.topIn, frontZ(H.xIn, H.topIn)], [sx(xc), topAt(xc), frontZ(xc, topAt(xc))],
    [sx(H.xOut), yc, frontZ(H.xOut, yc)], [sx(H.xOut), yc, H.zBack], [sx(xc), topAt(xc), H.zBack], [sx(H.xIn), H.topIn, H.zBack],
  ]));
  // a lid joint across the housing top and a bolt row along its outer face
  const lidZ = H.zBack + 0.13;
  P.add('turretDark', box(H.xOut - H.xIn - 0.08, 0.008, 0.018), sx((H.xIn + H.xOut) / 2 - 0.02), topAt((H.xIn + H.xOut) / 2) + 0.001, lidZ);
  for (const z of [0.48, 0.60, 0.72]) P.add('turretDark', cylX(0.016, 0.014, 6), sx(H.xOut + 0.004), 0.33, z);
  // the 2x3 dischargers (r268b round 2, both critics: round 1's 13 cm stubs read as "flat round discs pressed into the
  // cheek"): a bundle of real launcher tubes 0.28 m proud of the housing face, aimed up and out as the K2's are (27
  // degrees up, 43 out from dead ahead, 13 off the face's own normal), each seated 8 cm into the housing through a collar
  // buried in the face all round (4 cm deep, its rim at most 1.3 cm off the face plane), a dark band near the mouth and a
  // dark mouth
  const fi = new THREE.Vector3(sx(H.xIn), yb, frontZ(H.xIn, yb)), fo = new THREE.Vector3(sx(H.xOut), yb, frontZ(H.xOut, yb));
  const ex = fo.clone().sub(fi).normalize(), ey = new THREE.Vector3(0, 1, -H.lean).normalize();
  const ez = new THREE.Vector3().crossVectors(ex, ey).normalize();
  if (ez.z < 0) ez.negate();
  const faceMid = new THREE.Vector3(sx((H.xIn + H.xOut) / 2), 0.26, frontZ((H.xIn + H.xOut) / 2, 0.26));
  const aim = ez.clone().add(new THREE.Vector3(side * 0.25, 0.25, 0)).normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), aim);
  const tubeAt = (g: THREE.BufferGeometry, at: THREE.Vector3, along: number): THREE.BufferGeometry =>
    g.applyQuaternion(turn).translate(at.x + aim.x * along, at.y + aim.y * along, at.z + aim.z * along);
  const TUBE = Object.freeze({ r: 0.045, proud: 0.28, seat: 0.08 });
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const at = faceMid.clone().addScaledVector(ex, (col - 1) * 0.105).addScaledVector(ey, (row - 0.5) * 0.10);
    P.add('turretDark', tubeAt(cylZ(0.056, 0.06, seg), at, -0.01));                     // collar, 4 cm into the face
    P.add('turretDetail', tubeAt(markSmokeTube(cylZ(TUBE.r, TUBE.proud + TUBE.seat, seg)), at,
      (TUBE.proud - TUBE.seat) / 2));                                                  // tube, 8 cm into the housing
    P.add('turretDark', tubeAt(cylZ(TUBE.r + 0.004, 0.025, seg), at, TUBE.proud - 0.04)); // band near the mouth
    P.add('turretDark', tubeAt(new THREE.CircleGeometry(0.035, seg), at, TUBE.proud + 0.0015)); // mouth
  }
  // the armour boxes behind: chamfered outer top edge, bolt heads in two rows on the outer face, a joint between them
  for (const [k, b] of D.boxes.entries()) {
    const xo = D.boxXOut, xi = D.boxXIn, xh = xo - D.boxChamfer, yt = D.boxTop, yh = yt - D.boxChamfer;
    P.add('turret', convexStock([
      [sx(xi), yb, b.z0], [sx(xo), yb, b.z0], [sx(xo), yb, b.z1], [sx(xi), yb, b.z1],
      [sx(xi), yt, b.z0], [sx(xh), yt, b.z0], [sx(xh), yt, b.z1], [sx(xi), yt, b.z1],
      [sx(xo), yh, b.z0], [sx(xo), yh, b.z1],
    ]));
    for (const y of [0.11, 0.33]) for (const t of [0.12, 0.5, 0.88]) {
      P.add('turretDark', cylX(0.016, 0.014, 6), sx(xo + 0.004), y, b.z0 + (b.z1 - b.z0) * t);
    }
    if (k === 0) {                                                               // APS warning panel on the front box
      P.add('turretDark', box(0.012, 0.15, 0.20), sx(xo + 0.003), 0.22, (b.z0 + b.z1) / 2);
      P.add('turretGlass', box(0.008, 0.085, 0.12), sx(xo + 0.008), 0.22, (b.z0 + b.z1) / 2);
    }
  }
  // bracket plates from the leaning wall (buried 2 cm) out to the boxes' inner faces (5 mm into them), and a foot rail
  for (const z of D.brackets) {
    const w0 = k2TurretWallX(D.bracketY0, z) - 0.02, w1 = k2TurretWallX(D.bracketY1, z) - 0.02, xo = D.boxXIn + 0.005;
    P.add('turretDetail', convexSlab(
      [sx(w0), D.bracketY0, z - 0.015], [sx(xo), D.bracketY0, z - 0.015], [sx(xo), D.bracketY0, z + 0.015], [sx(w0), D.bracketY0, z + 0.015],
      [sx(w1), D.bracketY1, z - 0.015], [sx(xo), D.bracketY1, z - 0.015], [sx(xo), D.bracketY1, z + 0.015], [sx(w1), D.bracketY1, z + 0.015]));
  }
  const railZ0 = D.boxes[1].z0 + 0.02, railZ1 = H.zBack + 0.02, railX0 = k2TurretWallX(0.07, railZ0) - 0.02;
  P.add('turretDetail', convexSlab(
    [sx(railX0), 0.055, railZ0], [sx(D.boxXIn + 0.01), 0.055, railZ0], [sx(D.boxXIn + 0.01), 0.055, railZ1], [sx(railX0), 0.055, railZ1],
    [sx(railX0), 0.09, railZ0], [sx(D.boxXIn + 0.01), 0.09, railZ0], [sx(D.boxXIn + 0.01), 0.09, railZ1], [sx(railX0), 0.09, railZ1]));
}

/**
 * The K2B's front-corner fenders (267 rounds 3 and 6; research/k2b photos 1, 5): a matched pair of armoured fender
 * boxes over the track fronts, as wide as the fender (x 1.14..1.80, outer face on the guard flare's), each carrying a
 * lamp box with two headlights, with the K2's rubber mudflap hanging below. Round 6 (critics: "a plain ledge with no
 * fender structure"; "the corner fender boxes in photo 1"): each box now runs back to the front skirt cassette (z 2.97,
 * the fender line), its front raked 45 degrees from its top down to the bow, its 1.15 foot on the shoulder cap over the
 * track (the cap's own clearance), the lamp box standing on the raked face with its lenses on a vertical front. Its 1.40
 * top stands 0.30-0.48 m over the raked lower bow (0.90-1.10 at the track front); the gun's published depression over
 * the corners (to -9.6 degrees at yaw 23-27) holds it there. buildK2 builds the K2B hull with `k2bBow`, which leaves out
 * the K2's small glacis lamp housings and compact flaps and rakes the guard and bow-wedge feet back.
 * Hull frame.
 */
function addK2BCornerHousings(P: ProceduralBuilderPort & Modern3BuilderPort): void {
  for (const side of [-1, 1]) {
    // r269s3: the outer face 3 mm outboard of the guard flare's (x 1.80), which it shared over z 3.18-3.47
    const xi = side * 1.14, xo = side * 1.803;
    P.add('hull', convexSlab(                                                  // fender box: flat top, 45-degree front
      [xi, 1.15, 2.97], [xo, 1.15, 2.97], [xo, 1.15, 3.47], [xi, 1.15, 3.47],
      [xi, 1.40, 2.97], [xo, 1.40, 2.97], [xo, 1.40, 3.22], [xi, 1.40, 3.22]));
    // lamp box on the raked face (z 3.22 + (1.40 - y)), 5 mm into it, its front vertical
    // (r269s3: its outer end 3 mm inside the bow closure's x 1.70 face)
    const la = side * 1.24, lb = side * 1.697, faceZ = (y: number): number => 3.22 + (1.40 - y) - 0.005;
    P.add('hull', convexSlab(
      [la, 1.21, faceZ(1.21)], [lb, 1.21, faceZ(1.21)], [lb, 1.21, 3.43], [la, 1.21, 3.43],
      [la, 1.32, faceZ(1.32)], [lb, 1.32, faceZ(1.32)], [lb, 1.32, 3.43], [la, 1.32, 3.43]));
    for (const x of [1.34, 1.60]) {
      P.add('hullDark', KIT.box(0.13, 0.08, 0.012), side * x, 1.265, 3.434);
      P.add('hullGlass', markVehicleNightLens(KIT.cylZ(0.034, 0.010, 16), 'headlight'), side * x, 1.265, 3.440);
    }
    // 267 round 4: the housing's rubber curtain sat wholly inside the raked bow wedge; the K2's own front mudflap
    // (modern3.ts buildFrontGuards) now hangs from the wedge foot below this housing.
  }
}

function addK2BPackage(P: ProceduralBuilderPort & Modern3BuilderPort): void {
  const { box, cylY } = KIT;

  // r269 (owner 2026-11-04: "updae the sideskits for the k2b a lot to make them properly match with side profile of hull
  // and align with it and also just be more modernized"): the eight tall identical cassettes on their rail give way to the
  // export K2's bolted module run along the hull's own flank line (k2bHullKit.ts addK2BSkirtRun)
  addK2BSkirtRun(P);
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
  // (r269s3: the sight hood's side reveals 1 mm proud of the lid faces they shared, a coplanar flicker)
  addK2GunFront(gunFrontPort as Pick<TankBuilderPort, 'add' | 'addEquipment'>, 0.24, 0.001);
  P.add('turretDetail', cylY(0.11, 0.12, 0.08, 14), 0.56, 0.73, -0.22);
  // the hull number on the right side's armour group (k2bHullKit.ts; its upper tier's face x -1.885), inside the tile
  // -0.23..-0.61, clear of its corner bolts
  P.decal('hull', 'number', 'K2B', 0.24, [-1.888, 1.16, -0.43], -Math.PI / 2);
  // r269 (owner 2026-11-04: "add 2 fuel cans to back that are elevated to be visible from front"): two NATO cans in a
  // frame on the bustle's core roof, standing over the turret roof line (k2bHullKit.ts addK2BFuelCans)
  addK2BFuelCans(P);
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
