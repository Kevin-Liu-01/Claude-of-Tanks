// Type 87 self-propelled anti-aircraft gun (release 269, builder J; the owner 2026-11-03: "also add the Japanese type 87
// SPAAG"): the fleet's Type 74 hull and running gear (profiles/type74Family.ts, called with its default-off options: the
// hull alone, and the enlarged hull's overhung stern) under the Type 87's welded turret, built from the Camp Shimoshizu
// photographs (docs/references/tanks/type87_aw.md, photos 01-11):
//   - a long, narrow central body the turret's full height, its nose a wedge (a bevelled top edge, an upper plate leaning
//     back over a raked chin, the vertical front edges chamfered), a louvred vent on each flank;
//   - a low cheek under each pod's front carrying four smoke dischargers on its outer face;
//   - the two gun pods, fixed faceted housings either side of the body's middle (their front aspect does not change with
//     elevation: photos 03-06), the large round cover on the body's flank showing under each;
//   - in front of each pod, the 35 mm KDA's cradle turning in a drum on the elevation axis, its faceted sleeve, the L/90
//     barrel with its rings, the muzzle brake and the v0 measuring cage;
//   - on the roof the commander's and gunner's hatches, their sight heads at the front edge and the ventilator post; the
//     tracking radar's pedestal behind them with its drum, its covered dish and the two electro-optical sights on its
//     sides; the search radar raised on its cranked arm from a hinge between the two rear stowage boxes; the wire basket
//     and the radio whips at the rear.
// The enlarged hull's own stern kit rides on the Type 74 hull: the engine's outlet grille across the upper stern, the
// tail lamps, the tow shackles on the raked lower plate, the mudflaps and the rear deck's stowage boxes.
// Every datum the combat record shares is in profiles/type87Frame.ts (type87Specs.ts reads the same numbers).
// Program frame: +z forward, +x the vehicle's left (vehicleSide.ts).
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { KIT, MUDGUARDS } from './kit.ts';
import { antennaPart } from './antennaPart.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { tailLamp, towShackle } from './japaneseHullKit.ts';
import { buildType74Family, TYPE74_HULL_STATIONS as HULL } from './type74Family.ts';
import {
  TYPE87_GUNS as G, TYPE87_RADARS as R, TYPE87_REAR_BOXES as RB, TYPE87_STERN_Z, TYPE87_TURRET as T,
} from './type87Frame.ts';

type P3 = readonly [number, number, number];
const SIDES = [-1, 1] as const;

/** A closed convex solid over the points (UVs from x/z, as the fleet's convex slabs). */
function convex(points: readonly P3[]): THREE.BufferGeometry {
  const geometry = new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i), position.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

const mirror = (s: number, points: readonly P3[]): P3[] => points.map(([x, y, z]) => [s * x, y, z] as P3);

// ------------------------------------------------------------------- hull kit --
/** The enlarged hull's stern (photos 01, 07, 10): only this build draws it, on the Type 74 builder's overhung stern. */
function addSternKit(P: TankBuilderPort): void {
  const { box, openRackGrid, xform } = KIT;
  const Z = TYPE87_STERN_Z, { deckY, sponsonFloorY: floorY, overhungSternFootY: footY, overhungSternRakeZ: rakeZ } = HULL;
  // the engine's air outlet across the upper stern between the sponsons' ends (photo 07): a dark well, the mesh over it
  // and its frame, each seated 2 mm into what carries it
  const gw = 1.84, gh = 0.34, gy = (footY + deckY) / 2 + 0.01;
  P.add('hullDark', box(gw, gh, 0.012), 0, gy, Z - 0.004);
  P.add('hullDetail', xform(openRackGrid(gw - 0.06, gh - 0.06, 0.012, 4, 16), 0, 0, 0, Math.PI / 2, 0, 0), 0, gy, Z - 0.016);
  for (const dy of [-1, 1]) P.add('hull', box(gw, 0.035, 0.03), 0, gy + dy * (gh / 2 - 0.0175), Z - 0.013);
  for (const dx of [-1, 1]) P.add('hull', box(0.035, gh - 0.07, 0.03), dx * (gw / 2 - 0.0175), gy, Z - 0.013);
  // the raked lower plate's two tow shackles (photo 07), laid on the plate
  const rake = Math.atan2(rakeZ, footY - HULL.bellyY);
  const plateZ = (y: number): number => Z + rakeZ * (footY - y) / (footY - HULL.bellyY);
  for (const s of SIDES) towShackle(P, s * 0.48, 0.72, plateZ(0.72) - 0.01, -1, -rake);
  for (const s of SIDES) {
    // the tail lamps on the sponsons' rear faces, 1 cm into them
    tailLamp(P, s * 1.30, floorY + 0.04, Z - 0.03);
    // the rubber mudflaps behind the sprockets, hung from the sponson's floor (photo 01)
    MUDGUARDS.add(P, { hang: true, label: `type87-mudflap-${s > 0 ? 'left' : 'right'}-rear`,
      x: s * 1.2835, y: floorY - 0.10, z: -3.36, thickness: 0.035, length: 0.52, height: 0.18,
      material: 'rubber', rotation: [0, Math.PI / 2, 0], crown: 0.007, frontCut: 0.018, rearCut: 0.013 });
    // a stowage box on each rear corner of the deck (photos 01, 10), its lid seam and two hasps
    const bx = s * 1.00, bz = -3.48;
    P.addEquipment('hull', box(0.48, 0.22, 0.62), bx, deckY + 0.105, bz);
    P.add('hullDark', box(0.49, 0.008, 0.63), bx, deckY + 0.175, bz);
    for (const dx of [-0.12, 0.12]) P.add('hullDark', box(0.05, 0.06, 0.012), bx + dx, deckY + 0.15, bz - 0.314);
  }
}

// --------------------------------------------------------------------- turret --
function addTurretBody(P: TankBuilderPort): void {
  const { box, cylX, cylY } = KIT;
  // the ring collar on the hull's race, 2 cm into the deck and 3 cm into the body's floor
  P.add('turret', cylY(0.98, 1.02, 0.09, P.q ? 32 : 20), 0, 0.005, 0);
  // the central body: one welded shell, its rear corners chamfered, the roof's edges chamfered, the nose a wedge with its
  // vertical front edges chamfered (photos 01, 04, 06)
  const w = T.bodyHalfW, c = T.roofChamfer, wr = w - T.rearChamfer, wn = T.noseHalfW, edge = T.noseEdgeZ - T.bevelZ;
  const body: P3[] = [];
  for (const s of SIDES) {
    body.push(
      [s * wr, T.floorY, T.rearZ], [s * wr, T.roofY - c, T.rearZ], [s * (wr - c), T.roofY, T.rearZ],
      [s * w, T.floorY, T.rearZ + T.rearChamfer], [s * w, T.roofY - c, T.rearZ + T.rearChamfer],
      [s * (w - c), T.roofY, T.rearZ + T.rearChamfer],
      [s * w, T.roofY - c, T.noseRoofZ], [s * (w - c), T.roofY, T.noseRoofZ],
      [s * w, T.bevelY, T.bevelZ + edge], [s * w, T.faceY, T.faceZ + edge], [s * w, T.chinY, T.chinZ + edge],
      [s * w, T.floorY, T.bellyZ + edge],
      [s * wn, T.bevelY, T.bevelZ], [s * wn, T.faceY, T.faceZ], [s * wn, T.chinY, T.chinZ], [s * wn, T.floorY, T.bellyZ],
    );
  }
  P.add('turret', convex(body));
  // the low cheeks under the pods' fronts, 4 cm into the body: the outer bottom edge chamfered under the dischargers, the
  // top edge and the front's outer corner chamfered (photos 01, 05, 06)
  const { cheekInnerX: xi, cheekOuterX: xo, cheekTopY: yt, cheekRearZ: zr, cheekFrontZ: zf, cheekChamfer: k, floorY: yb } = T;
  for (const s of SIDES) {
    P.add('turret', convex(mirror(s, [
      [xi, yb, zr], [xi, yt, zr], [xo - k, yb, zr + 0.05], [xo - 0.05, yt, zr], [xo, yb + k, zr + 0.05], [xo, yt - 0.04, zr + 0.05],
      [xo, yb + k, zf - k], [xo, yt - 0.04, zf - k], [xo - k, yb, zf - k], [xo - 0.04, yt, zf - k],
      [xi, yb, zf], [xi, yt, zf], [xo - k, yt, zf], [xo - k, yb + k, zf],
    ])));
  }
  // the louvred vent on each flank of the nose (photos 01, 04): a frame 5 mm into the plate and four blades on it
  for (const s of SIDES) {
    P.add('turret', box(0.03, 0.32, 0.28), s * (w + 0.010), 0.66, 1.18);
    for (let k2 = 0; k2 < 4; k2++) P.add('turretDark', box(0.014, 0.034, 0.22), s * (w + 0.029), 0.55 + k2 * 0.073, 1.18);
  }
  // the large round cover on each flank under the pod (photo 01), 1 cm into the body
  for (const s of SIDES) P.add('turret', cylX(T.coverR, 0.06, P.q ? 32 : 20), s * T.coverX, T.coverY, T.coverZ);
}

/** One pod's section: an octagon whose top outer edge carries the broad chamfer (photos 01, 04, 06). */
function podSection(z: number, yb: number, yt: number, x0: number, x1: number, ci: number, coT: number, coB: number): P3[] {
  return [[x0, yb + ci, z], [x0 + ci, yb, z], [x1 - coB, yb, z], [x1, yb + coB, z],
    [x1, yt - coT, z], [x1 - coT, yt, z], [x0 + ci, yt, z], [x0, yt - ci, z]];
}

/** The fixed gun pods, their doors and handles (photos 01, 03-06, 09-11). */
function addPods(P: TankBuilderPort): void {
  const { box } = KIT;
  const x0 = T.podInnerX, x1 = T.podOuterX, z0 = T.podRearZ, z1 = T.podFrontZ;
  const along = (z: number): number => (z - z0) / (z1 - z0);
  const bottom = (z: number): number => T.podRearBottomY + (T.podFrontBottomY - T.podRearBottomY) * along(z);
  const top = (z: number): number => T.podRearTopY + (T.podFrontTopY - T.podRearTopY) * along(z);
  const rise = Math.atan2(T.podFrontTopY - T.podRearTopY, z1 - z0);
  for (const s of SIDES) {
    const zr = z0 + 0.14, zf = z1 - 0.06;
    P.add('turret', convex(mirror(s, [
      // the rear end drawn in to a narrow face, top and bottom (photo 01: the pointed tail)
      ...podSection(z0, bottom(z0) + 0.13, top(z0) - 0.11, x0 + 0.05, x1 - 0.06, 0.03, 0.06, 0.04),
      ...podSection(zr, bottom(zr), top(zr), x0, x1, 0.06, 0.16, 0.12),
      ...podSection(zf, bottom(zf), top(zf), x0, x1, 0.06, 0.16, 0.12),
      ...podSection(z1, bottom(z1) + 0.02, top(z1) - 0.02, x0 + 0.02, x1 - 0.02, 0.05, 0.14, 0.10),
    ])));
    // two hinged doors on the flat outer face (photo 01: the "24" panel and the door behind the nose), 2 mm into it,
    // each with its handle
    for (const z of [-1.00, -0.52]) {
      const y = (bottom(z) + 0.12 + top(z) - 0.16) / 2;
      P.add('turretDetail', box(0.012, 0.22, 0.36), s * (x1 + 0.004), y, z, -rise, 0, 0);
      P.add('turretDark', box(0.02, 0.025, 0.12), s * (x1 + 0.012), y, z + 0.08, -rise, 0, 0);
    }
  }
}

/** The four smoke dischargers on each cheek's outer face (photos 01, 04), on a bracket bar, raised forward and out. */
function addSmokeDischargers(P: TankBuilderPort): void {
  const { box, cylZ, xform } = KIT;
  const barX = T.cheekOuterX + 0.025, footY = 0.20, tubeZs = [0.22, 0.38, 0.54, 0.70];
  for (const s of SIDES) {
    P.addEquipment('turret', box(0.06, 0.05, 0.64), s * barX, footY - 0.03, 0.46);
    const bore = new THREE.Vector3(s * 0.35, 0.72, 0.60).normalize();
    const turn = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), bore));
    for (const z of tubeZs) {
      const foot = new THREE.Vector3(s * barX, footY, z);
      const tube = foot.clone().addScaledVector(bore, 0.11), mouth = foot.clone().addScaledVector(bore, 0.217);
      P.addEquipment('turret', xform(markSmokeTube(cylZ(0.042, 0.22, P.q ? 12 : 8)), 0, 0, 0, turn.x, turn.y, turn.z),
        tube.x, tube.y, tube.z);
      P.add('turretDark', xform(cylZ(0.033, 0.012, P.q ? 12 : 8), 0, 0, 0, turn.x, turn.y, turn.z), mouth.x, mouth.y, mouth.z);
    }
  }
}

/** The roof: the crew's hatches, their sight heads, the ventilator post, the lift eyes (photos 01, 03, 05, 06). */
function addRoofKit(P: TankBuilderPort): void {
  const { box, cylY, liftEye } = KIT;
  const n = P.q ? 20 : 14;
  for (const s of SIDES) {
    // the hatch, 5 mm into the roof, its hinge block and handle
    P.addHatch('turret', cylY(0.27, 0.28, 0.05, n), s * 0.33, T.roofY + 0.02, -0.40);
    P.add('turretDetail', box(0.18, 0.05, 0.08), s * 0.33, T.roofY + 0.04, -0.70);
    P.add('turretDark', box(0.14, 0.025, 0.03), s * 0.33, T.roofY + 0.055, -0.22);
    // the sight head at the roof's front edge, its window forward
    P.addEquipment('turret', box(0.22, 0.15, 0.24), s * 0.27, T.roofY + 0.07, 1.40);
    P.add('turretDark', box(0.17, 0.07, 0.02), s * 0.27, T.roofY + 0.09, 1.52);
    P.add('turretGlass', box(0.14, 0.05, 0.012), s * 0.27, T.roofY + 0.09, 1.532);
    liftEye(P, 'turretDetail', s * 0.60, T.roofY, 1.10, 0);
  }
  // the ventilator post on the right (-x) with its mushroom cap (photos 01, 06)
  P.addEquipment('turret', cylY(0.05, 0.055, 0.40, n), -0.55, T.roofY + 0.195, 0.67);
  P.addEquipment('turret', cylY(0.08, 0.09, 0.07, n), -0.55, T.roofY + 0.42, 0.67);
  P.add('turretDark', cylY(0.07, 0.07, 0.03, n), -0.55, T.roofY + 0.37, 0.67);
}

/** The rear: the stowage boxes either side of the arm's hinge, the wire basket, the radio whips (photos 01, 07, 09-11). */
function addRearKit(P: TankBuilderPort): void {
  const { box, cylY, openRackGrid, xform } = KIT;
  const bw = RB.outerX - RB.innerX, bh = RB.topY - T.roofY, bd = RB.frontZ - RB.rearZ;
  for (const s of SIDES) {
    const bx = s * (RB.innerX + RB.outerX) / 2, by = T.roofY - 0.005 + bh / 2, bz = (RB.rearZ + RB.frontZ) / 2;
    P.addEquipment('turret', box(bw, bh, bd), bx, by, bz);
    // the lid's seam and the carrying handle on its outer end
    P.add('turretDark', box(bw + 0.01, 0.008, bd + 0.01), bx, RB.topY - 0.06, bz);
    P.add('turretDark', box(0.02, 0.03, 0.18), s * (RB.outerX + 0.015), by + 0.02, bz);
    for (const dz of [-0.08, 0.08]) P.add('turretDark', box(0.03, 0.03, 0.02), s * (RB.outerX + 0.006), by + 0.02, bz + dz);
  }
  // the wire basket on the rear face's left (+x; photos 07, 10, 11): its open face, floor and four corner posts
  const bx = 0.34, bw2 = 0.48, y0 = 0.22, y1 = 0.80, depth = 0.20, face = T.rearZ - depth;
  P.add('turretOpenLattice', xform(openRackGrid(bw2, y1 - y0, 0.012, 5, 4), 0, 0, 0, Math.PI / 2, 0, 0), bx, (y0 + y1) / 2, face);
  P.add('turretOpenLattice', openRackGrid(bw2, depth, 0.012, 3, 4), bx, y0, T.rearZ - depth / 2 + 0.005);
  for (const dx of [-1, 1]) for (const y of [y0, y1]) {
    P.add('turretOpenLattice', beamBetween([bx + dx * bw2 / 2, y, T.rearZ + 0.01], [bx + dx * bw2 / 2, y, face], 0.009, 6));
  }
  // the radio whips on the pods' rear faces (photo 07), their spring bases half into the faces
  for (const s of SIDES) {
    P.addEquipment('turretDetail', cylY(0.035, 0.04, 0.16, 10), s * 0.95, 0.74, T.podRearZ);
    P.addEquipment('turretDetail', antennaPart(cylY(0.012, 0.016, 2.20, 6)), s * 0.95, 0.82 + 1.10, T.podRearZ);
  }
}

/**
 * The tracking radar on its pedestal and the two electro-optical sights on its sides (photos 01, 02, 05, 06, 09): the
 * dish a covered lens 0.86 m across, canted up 26 degrees, on a short arm from the pedestal's front.
 */
function addTrackingRadar(P: TankBuilderPort): void {
  const { box, cylY, cylZ, lathe, torus, xform } = KIT;
  const n = P.q ? 28 : 18, h = R.pedestalTopY - (T.roofY - 0.01), pz = (R.pedestalRearZ + R.pedestalFrontZ) / 2;
  P.addEquipment('turret', box(R.pedestalHalfW * 2, h, R.pedestalFrontZ - R.pedestalRearZ), 0, T.roofY - 0.01 + h / 2, pz);
  P.add('turretDetail', xform(cylY(0.12, 0.12, 0.01, n), 0, 0, 0, 0, 0, Math.PI / 2), R.pedestalHalfW + 0.003, 1.42, pz);
  // the drum on its top, leaning forward (photo 02)
  P.addEquipment('turret', xform(cylY(0.15, 0.15, 0.26, n), 0, 0, 0, 0.45, 0, 0), 0, R.pedestalTopY + 0.10, pz - 0.05);
  // the dish (its axis forward and up), its rim, and the arm from the pedestal into its back
  const tilt = Math.PI / 2 - (R.dishTiltDeg * Math.PI) / 180;
  const lens = lathe([[0.001, -0.05], [0.26, -0.046], [R.dishR, -0.022], [R.dishR, 0.022], [0.26, 0.044], [0.001, 0.052]], n);
  P.addEquipment('turret', xform(lens, 0, 0, 0, tilt, 0, 0), 0, R.dishY, R.dishZ);
  P.add('turretDark', xform(torus(R.dishR - 0.004, 0.012, n, 6), 0, 0, 0, tilt, 0, 0), 0, R.dishY, R.dishZ);
  const back = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt)).multiplyScalar(-0.05).add(new THREE.Vector3(0, R.dishY, R.dishZ));
  P.addEquipment('turret', box(0.12, 0.14, back.z - R.pedestalFrontZ + 0.04), 0, back.y, (back.z + R.pedestalFrontZ - 0.02) / 2);
  // the electro-optical sights on the pedestal's sides (photos 04-06): the camera box on the right (-x), the cylinder on
  // the left (+x), each 1 cm into the pedestal, low enough that their windows see forward past the dish's lower rim and
  // over the rear boxes
  P.addEquipment('turret', box(0.16, 0.22, 0.30), -(R.pedestalHalfW + 0.07), R.sightY, pz);
  P.add('turretGlass', box(0.10, 0.10, 0.012), -(R.pedestalHalfW + 0.07), R.sightY + 0.02, pz + 0.156);
  P.addEquipment('turret', cylZ(0.08, 0.32, n), R.pedestalHalfW + 0.075, R.sightY + 0.02, pz + 0.02);
  P.add('turretGlass', cylZ(0.06, 0.012, n), R.pedestalHalfW + 0.075, R.sightY + 0.02, pz + 0.185);
}

/**
 * The search radar raised on its arm (photos 01, 02, 05-09): the hinge between the rear boxes, the box-section arm up and
 * back to its elbow, the upright to the turntable, and the antenna bar, a flat back under a rounded radome forward.
 */
function addSearchRadar(P: TankBuilderPort): void {
  const { box, cylX, cylY, torus } = KIT;
  const n = P.q ? 20 : 14;
  P.addEquipment('turret', cylX(0.10, R.armHalfW * 2 + 0.04, n), 0, R.hingeY - 0.01, R.hingeZ);
  // the lower arm: its section square to its run, from inside the hinge to past the elbow
  const dy = R.elbowY - R.hingeY, dz = R.elbowZ - R.hingeZ, len = Math.hypot(dy, dz);
  const uy = dy / len, uz = dz / len, ny = -uz, nz = uy, half = R.armDepth / 2;
  const ends = [[R.hingeY - 0.06 * uy, R.hingeZ - 0.06 * uz], [R.elbowY + 0.10 * uy, R.elbowZ + 0.10 * uz]];
  const arm: P3[] = [];
  for (const [y, z] of ends) for (const sx of [-1, 1]) for (const sn of [-1, 1]) {
    arm.push([sx * R.armHalfW, y + sn * half * ny, z + sn * half * nz]);
  }
  P.addEquipment('turret', convex(arm));
  // the upright from the elbow to the turntable, the turntable and its scale ring
  const turnY = R.antennaY - R.antennaHalfH - 0.03;
  P.addEquipment('turret', box(R.armHalfW * 2 - 0.04, turnY - R.elbowY + 0.06, R.armDepth), 0, (turnY + R.elbowY - 0.06) / 2, R.antennaZ + 0.02);
  P.addEquipment('turret', cylY(0.14, 0.15, 0.08, n), 0, turnY + 0.02, R.antennaZ);
  P.add('turretDark', torus(0.152, 0.008, n, 4), 0, turnY - 0.01, R.antennaZ);
  // the antenna: the flat back box and the radome's half round forward, its ends 1 cm proud of the box's
  const back = R.antennaDepth - R.antennaHalfH;
  P.addEquipment('turret', box(R.antennaHalfW * 2 - 0.02, R.antennaHalfH * 2, back), 0, R.antennaY, R.antennaZ - back / 2 + 0.01);
  P.addEquipment('turret', cylX(R.antennaHalfH, R.antennaHalfW * 2, n), 0, R.antennaY, R.antennaZ + 0.01);
}

// ----------------------------------------------------------------------- guns --
/** Each KDA (gun-local, about the elevation axis): the drum, the faceted sleeve, the barrel, the brake and v0 cage. */
function addGuns(P: TankBuilderPort): void {
  const { cylX, cylZ, torus, xform } = KIT;
  const n = P.q ? 18 : 12;
  const ring = (z: number, hw: number, hh: number, ch: number): P3[] => [
    [-hw + ch, -hh, z], [hw - ch, -hh, z], [hw, -hh + ch, z], [hw, hh - ch, z],
    [hw - ch, hh, z], [-hw + ch, hh, z], [-hw, hh - ch, z], [-hw, -hh + ch, z]];
  for (const s of SIDES) {
    const index = s < 0 ? 0 : 1, bx = s * G.boreX, barrel = `gunBarrel${index}`, dark = `gunBarrel${index}Dark`;
    // the cradle's drum turning on the axis in front of the pod, and the trunnion shaft from the body's flank into it
    P.addGunExtra(cylX(G.drumR, G.drumW, P.q ? 28 : 18), bx, 0, 0);
    const shaftIn = T.bodyHalfW - 0.01, shaftOut = G.boreX - G.drumW / 2 + 0.02;
    P.addGunExtraDark(cylX(0.06, shaftOut - shaftIn, n), s * (shaftIn + shaftOut) / 2, 0, 0);
    // the faceted sleeve from inside the drum to the jacket (photo 01's nose cone)
    P.addGunExtra(convex([
      ...ring(G.sleeveRearZ, G.sleeveHalfW, G.sleeveHalfH, 0.04),
      ...ring(G.sleeveFrontZ, G.jacketR + 0.015, G.jacketR + 0.015, 0.02),
    ].map(([x, y, z]) => [bx + x, y, z] as P3)));
    // the jacket, the tapering L/90 barrel and its two rings
    P.add(barrel, cylZ(G.jacketR, G.jacketFrontZ - G.sleeveFrontZ + 0.04, n), bx, 0, (G.jacketFrontZ + G.sleeveFrontZ - 0.04) / 2);
    P.add(barrel, cylZ(G.barrelTipR, G.brakeRearZ - G.jacketFrontZ + 0.04, n, G.barrelR), bx, 0, (G.brakeRearZ + G.jacketFrontZ - 0.02) / 2);
    for (const z of G.ringZs) P.add(dark, cylZ(G.barrelR + 0.008, 0.05, n), bx, 0, z);
    // the muzzle brake, its collar and face flange (the bore mouth), the v0 cage's three rods past it and its end ring
    P.add(dark, cylZ(G.brakeR, G.muzzleZ - G.brakeRearZ - 0.03, n), bx, 0, (G.brakeRearZ + G.muzzleZ - 0.03) / 2);
    P.add(dark, cylZ(G.brakeR + 0.006, 0.04, n), bx, 0, G.brakeRearZ + 0.06);
    P.add(dark, cylZ(G.flangeR, 0.04, n), bx, 0, G.muzzleZ - 0.02);
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + (k * 2 * Math.PI) / 3, rx = bx + G.cageRodRadius * Math.cos(a), ry = G.cageRodRadius * Math.sin(a);
      P.add(dark, cylZ(G.cageRodR, G.endRingZ - G.muzzleZ + 0.04, 6), rx, ry, (G.endRingZ + G.muzzleZ) / 2);
    }
    for (const z of [G.endRingZ + 0.012, G.cageTipZ - 0.012]) {
      P.add(dark, xform(torus(G.endRingR - 0.012, 0.012, n, 6), 0, 0, 0, Math.PI / 2, 0, 0), bx, 0, z);
    }
  }
  P.muzzleZ = G.muzzleZ;
}

function* buildType87Steps(P: TankBuilderPort): TankProfileBuild {
  // the Type 74's hull and running gear (no cast turret), its stern the enlarged hull's
  buildType74Family(P, 'production', { hullOnly: true, overhungSternZ: TYPE87_STERN_Z });
  addSternKit(P);
  yield 'buildType87Hull';
  const [tx, ty, tz] = P.spec.armor.turretPivot;
  const [gx, gy, gz] = P.spec.armor.gunPivot;
  P.turretG.position.set(tx, ty, tz);
  P.gunG.position.set(gx, gy, gz);
  // turret-local from here; the guns' parts are gun-local about the elevation axis
  addTurretBody(P);
  addPods(P);
  addSmokeDischargers(P);
  yield 'buildType87Turret';
  addRoofKit(P);
  addRearKit(P);
  addTrackingRadar(P);
  addSearchRadar(P);
  yield 'buildType87TurretKit';
  addGuns(P);
  P.topY = T.roofY + 0.30;
}

const buildType87 = steppedBuilder(buildType87Steps);

export const TYPE87_PROFILES = {
  type87_aw: { build: buildType87 },
} as const;
