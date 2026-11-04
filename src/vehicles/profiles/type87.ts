// Type 87 self-propelled anti-aircraft gun (release 269, builder J; the owner 2026-11-03: "also add the Japanese type 87
// SPAAG"): the fleet's Type 74 hull and running gear (profiles/type74Family.ts, called with its default-off options: the
// hull alone, and the enlarged hull's overhung stern) under the Type 87's welded turret, built from the Camp Shimoshizu
// photographs (docs/references/tanks/type87_aw.md, photos 01-11):
//   - a long, narrow central body the turret's full height, its nose a wedge (a bevelled top edge, an upper plate leaning
//     back over a raked chin, the vertical front edges chamfered), a louvred vent on each flank;
//   - a low cheek under each pod's front carrying four smoke dischargers on its outer face;
//   - the two gun pods, fixed faceted housings either side of the body's middle ending in angular wedge noses (their
//     front aspect does not change with elevation: photos 03-06), the large round cover on the body's flank showing under
//     each;
//   - at each pod's wedge nose, the 35 mm KDA's cradle turning on a trunnion block on the elevation axis, its square
//     sleeve, the L/90 barrel with its rings, the muzzle brake and the v0 measuring cage;
//   - on the roof the commander's and gunner's hatches, their sight heads at the front edge and the ventilator post; the
//     tracking radar's pedestal and head behind them with its covered dish, the sensor box on its left and the large
//     cylinder on its right; the search radar raised on its heavy cranked boom from a hinge between the two rear stowage
//     boxes, its antenna a flat-faced slab with a flat top plate and flared end plates; the wire basket and the radio
//     whips at the rear.
// The enlarged hull's own kit rides on the Type 74 hull: the raised mesh basket and lidded corner bins across the upper
// stern, the tail lamps, the tow shackles on the raked lower plate, the mudflaps, the rear deck's stowage boxes, the deep
// front fenders with their rubber flaps and the APU's intake grille on the front deck's right.
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
  TYPE87_GUNS as G, TYPE87_HULL as H, TYPE87_RADARS as R, TYPE87_REAR_BOXES as RB, TYPE87_TRUNNION, TYPE87_TURRET as T,
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
/**
 * The enlarged hull's stern (photos 01, 07, 10): only this build draws it, on the Type 74 builder's overhung stern. The
 * raised mesh basket across the upper stern between the two lidded corner bins (photo 07), the tail lamps on the bins,
 * two tow shackles on the raked lower plate, rubber mudflaps behind the sprockets and two stowage boxes inboard on the
 * rear deck (photos 01, 07).
 */
function addSternKit(P: TankBuilderPort): void {
  const { box, openRackGrid, xform } = KIT;
  const Z = H.sternZ, D = H.basketDepth;
  const { deckY, tubHalfW, sponsonX, sponsonFloorY: floorY, bellyY } = HULL;
  const { overhungSternKneeZ: kneeZ, overhungSternKneeY: kneeY, overhungSternToeZ: toeZ } = HULL;
  // the basket: a dark backing on the stern face, top and bottom rails out from the face, the mesh at the back between
  // posts (photo 07: eight bays, 0.39 m tall, its top rail level with the deck)
  const bw = 2 * (tubHalfW - 0.02), by0 = deckY - 0.38, by1 = deckY, bh = by1 - by0, back = Z - D;
  P.add('hullDark', box(bw, bh, 0.012), 0, (by0 + by1) / 2, Z - 0.004);
  for (const y of [by0 + 0.0175, by1 - 0.0175]) P.add('hull', box(bw, 0.035, D + 0.01), 0, y, Z - D / 2 + 0.005);
  for (let k = 0; k <= 8; k++) P.add('hull', box(0.03, bh - 0.07, 0.03), -bw / 2 + 0.015 + (k * (bw - 0.03)) / 8, (by0 + by1) / 2, back + 0.015);
  P.add('hullDetail', xform(openRackGrid(bw - 0.03, bh - 0.07, 0.008, 6, 30), 0, 0, 0, Math.PI / 2, 0, 0), 0, (by0 + by1) / 2, back + 0.022);
  for (const s of SIDES) {
    // the lidded bin on each sponson's end, 1 cm into it, its lid seam and two hinges, the tail lamp on its face
    const binW = sponsonX - tubHalfW - 0.01, binX = s * (tubHalfW + 0.005 + binW / 2), binH = deckY - floorY;
    P.addEquipment('hull', box(binW, binH, D + 0.01), binX, (deckY + floorY) / 2, Z - D / 2 + 0.005);
    P.add('hullDark', box(binW + 0.006, 0.008, D + 0.012), binX, deckY - 0.06, Z - D / 2 + 0.004);
    for (const dx of [-0.16, 0.16]) P.add('hullDark', box(0.06, 0.03, 0.02), binX + dx, deckY - 0.03, back - 0.004);
    tailLamp(P, s * 1.30, floorY + 0.02, back + 0.01);
    // the rubber mudflaps behind the sprockets, hung from the sponson's floor (photo 01)
    MUDGUARDS.add(P, { hang: true, label: `type87-mudflap-${s > 0 ? 'left' : 'right'}-rear`,
      x: s * 1.2835, y: floorY - 0.10, z: -3.36, thickness: 0.035, length: 0.52, height: 0.18,
      material: 'rubber', rotation: [0, Math.PI / 2, 0], crown: 0.007, frontCut: 0.018, rearCut: 0.013 });
    // a stowage box inboard on the rear deck behind the louvres (photos 01, 07), its lid seam and two hasps
    const bx = s * 0.74, bz = -3.36;
    P.addEquipment('hull', box(0.40, 0.24, 0.60), bx, deckY + 0.115, bz);
    P.add('hullDark', box(0.41, 0.008, 0.61), bx, deckY + 0.19, bz);
    for (const dx of [-0.10, 0.10]) P.add('hullDark', box(0.05, 0.06, 0.012), bx + dx, deckY + 0.16, bz - 0.304);
  }
  // the raked lower plate's two tow shackles (photo 07), laid on the plate
  const rake = Math.atan2(toeZ - kneeZ, kneeY - bellyY);
  const plateZ = (y: number): number => Z + kneeZ + (toeZ - kneeZ) * (kneeY - y) / (kneeY - bellyY);
  for (const s of SIDES) towShackle(P, s * 0.48, 0.74, plateZ(0.74) - 0.01, -1, -rake);
}

/**
 * The enlarged hull's front (photos 01, 04, 06): deep fenders out from the level sponsons' square fronts over the idlers,
 * a deep lip at their fronts, the rubber flaps under it; the auxiliary power unit's intake grille on the front deck's
 * right (-x; photo 06, ja.wikipedia: the APU at the front right), where the Type 74 has its driver.
 */
function addFrontKit(P: TankBuilderPort): void {
  const { box, openRackGrid } = KIT;
  const { deckY, tubHalfW, sponsonX, sponsonFloorY: floorY } = HULL;
  const L = H.sponsonFrontZ, w = sponsonX - tubHalfW - 0.01, front = 3.43;
  for (const s of SIDES) {
    const x = s * (tubHalfW + 0.005 + w / 2);
    // the fender plate, 3 cm into the sponson's front and 1 cm under its floor, and its deep lip ahead of the track
    P.add('hull', box(w, 0.035, front - L + 0.03), x, floorY + 0.0075, (front + L - 0.03) / 2);
    P.add('hull', box(w, 0.20, 0.03), x, floorY - 0.075, front - 0.015);
    MUDGUARDS.add(P, { hang: true, label: `type87-mudflap-${s > 0 ? 'left' : 'right'}-front`,
      x: s * 1.2835, y: floorY - 0.30, z: front - 0.02, thickness: 0.035, length: 0.50, height: 0.22,
      material: 'rubber', rotation: [0, Math.PI / 2, 0], crown: 0.007, frontCut: 0.018, rearCut: 0.013 });
  }
  // the APU intake: a framed grille laid on the glacis' right, below the turret's sweep
  const tilt = Math.atan2(deckY - 0.99, 3.35 - 1.87), z = 2.12, y = deckY - (z - 1.87) * Math.tan(tilt);
  P.addEquipment('hull', box(0.42, 0.04, 0.36), -0.55, y + 0.012, z, tilt, 0, 0);
  P.add('hullDark', box(0.36, 0.006, 0.30), -0.55, y + 0.033, z, tilt, 0, 0);
  P.add('hullDetail', openRackGrid(0.36, 0.30, 0.010, 4, 9), -0.55, y + 0.036, z, tilt, 0, 0);
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
  // the louvred vent on each flank of the nose (photos 01, 04: 0.31 x 0.39 m, 0.043 x 0.053 of the hull's length): a frame
  // 5 mm into the plate and five blades on it
  for (const s of SIDES) {
    P.add('turret', box(0.03, 0.40, 0.32), s * (w + 0.010), 0.67, 1.18);
    for (let k2 = 0; k2 < 5; k2++) P.add('turretDark', box(0.014, 0.036, 0.26), s * (w + 0.029), 0.52 + k2 * 0.075, 1.18);
  }
  // the large round cover on each flank under the pod (photo 01), 1 cm into the body
  for (const s of SIDES) P.add('turret', cylX(T.coverR, 0.06, P.q ? 32 : 20), s * T.coverX, T.coverY, T.coverZ);
}

/** One pod's section: an octagon whose top outer edge carries the broad chamfer (photos 01, 04, 06). */
function podSection(z: number, yb: number, yt: number, x0: number, x1: number, ci: number, coT: number, coB: number): P3[] {
  return [[x0, yb + ci, z], [x0 + ci, yb, z], [x1 - coB, yb, z], [x1, yb + coB, z],
    [x1, yt - coT, z], [x1 - coT, yt, z], [x0 + ci, yt, z], [x0, yt - ci, z]];
}

/**
 * The fixed gun pods (photos 01, 03-06, 09-11): the faceted body, then the angular wedge nose, its top falling a little
 * and its bottom rising steeply to the small face round the bore just behind the elevation axis; the doors and handles.
 */
function addPods(P: TankBuilderPort): void {
  const { box } = KIT;
  const x0 = T.podInnerX, x1 = T.podOuterX, z0 = T.podRearZ, z1 = T.podFrontZ;
  const along = (z: number): number => (z - z0) / (z1 - z0);
  const bottom = (z: number): number => T.podRearBottomY + (T.podFrontBottomY - T.podRearBottomY) * along(z);
  const top = (z: number): number => T.podRearTopY + (T.podFrontTopY - T.podRearTopY) * along(z);
  const rise = Math.atan2(T.podFrontTopY - T.podRearTopY, z1 - z0), [, ay] = TYPE87_TRUNNION;
  for (const s of SIDES) {
    const zr = z0 + 0.14, zf = z1, bx = G.boreX;
    P.add('turret', convex(mirror(s, [
      // the rear end drawn in to a narrow face, top and bottom (photo 01: the pointed tail)
      ...podSection(z0, bottom(z0) + 0.14, top(z0) - 0.12, x0 + 0.05, x1 - 0.06, 0.03, 0.06, 0.04),
      ...podSection(zr, bottom(zr), top(zr), x0, x1, 0.06, 0.16, 0.12),
      ...podSection(zf, bottom(zf), top(zf), x0, x1, 0.06, 0.16, 0.12),
      // the wedge nose's face round the bore
      ...podSection(T.noseTipZ, ay - T.noseTipHalfH, ay + T.noseTipHalfH, bx - T.noseTipHalfW, bx + T.noseTipHalfW, 0.03, 0.05,
        0.03),
    ])));
    // two hinged doors on the flat outer face (photo 01: the "24" panel and the door behind the nose), 2 mm into it,
    // each with its handle
    for (const z of [-1.04, -0.62]) {
      const y = (bottom(z) + 0.12 + top(z) - 0.16) / 2;
      P.add('turretDetail', box(0.012, 0.26, 0.34), s * (x1 + 0.004), y, z, -rise, 0, 0);
      P.add('turretDark', box(0.02, 0.025, 0.12), s * (x1 + 0.012), y, z + 0.08, -rise, 0, 0);
    }
  }
}

/**
 * The four smoke dischargers on each cheek's outer face (photos 01, 04): open tubes raised forward and out on a bracket
 * 0.72 m long (0.10 of the hull's length) standing off the cheek on two plates, each mouth a rim round a dark bore.
 */
function addSmokeDischargers(P: TankBuilderPort): void {
  const { box, cylZ, torus, xform } = KIT;
  const n = P.q ? 12 : 8, barX = T.cheekOuterX + 0.05, footY = 0.19, tubeZs = [0.20, 0.37, 0.54, 0.71];
  for (const s of SIDES) {
    P.addEquipment('turret', box(0.05, 0.05, 0.72), s * barX, footY - 0.03, 0.455);
    for (const z of [0.16, 0.75]) P.addEquipment('turret', box(0.07, 0.10, 0.04), s * (T.cheekOuterX + 0.025), footY - 0.03, z);
    const bore = new THREE.Vector3(s * 0.35, 0.72, 0.60).normalize();
    const turn = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), bore));
    const along = (foot: THREE.Vector3, d: number): THREE.Vector3 => foot.clone().addScaledVector(bore, d);
    for (const z of tubeZs) {
      const foot = new THREE.Vector3(s * barX, footY, z);
      const tube = along(foot, 0.13), rim = along(foot, 0.258), floor = along(foot, 0.237);
      P.addEquipment('turret', xform(markSmokeTube(cylZ(0.046, 0.26, n)), 0, 0, 0, turn.x, turn.y, turn.z), tube.x, tube.y, tube.z);
      P.add('turretDetail', xform(torus(0.040, 0.008, n, 6).rotateX(Math.PI / 2), 0, 0, 0, turn.x, turn.y, turn.z), rim.x, rim.y, rim.z);
      P.add('turretDark', xform(cylZ(0.036, 0.05, n), 0, 0, 0, turn.x, turn.y, turn.z), floor.x, floor.y, floor.z);
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
 * The tracking radar (photos 01, 02, 05, 06, 08, 09): the pedestal from the roof under a head 0.64 m across, the dish a
 * covered lens 0.86 m across canted up 26 degrees on a short arm from the head's front, the sensor box on the head's left
 * (+x) and the large cylinder on its right, its round end outboard.
 */
function addTrackingRadar(P: TankBuilderPort): void {
  const { box, cylX, lathe, torus, xform } = KIT;
  const n = P.q ? 28 : 18;
  const ph = R.headBottomY + 0.02 - (T.roofY - 0.01), pz = (R.pedestalRearZ + R.pedestalFrontZ) / 2;
  P.addEquipment('turret', box(R.pedestalHalfW * 2, ph, R.pedestalFrontZ - R.pedestalRearZ), 0, T.roofY - 0.01 + ph / 2, pz);
  P.add('turretDetail', cylX(0.10, 0.01, n), R.pedestalHalfW + 0.003, 1.30, pz);
  const hh = R.headTopY - R.headBottomY, hz = (R.headRearZ + R.headFrontZ) / 2, hd = R.headFrontZ - R.headRearZ;
  P.addEquipment('turret', box(R.headHalfW * 2, hh, hd), 0, (R.headTopY + R.headBottomY) / 2, hz);
  // the dish (its axis forward and up), its rim, and the arm from the head into its back
  const tilt = Math.PI / 2 - (R.dishTiltDeg * Math.PI) / 180;
  const lens = lathe([[0.001, -0.05], [0.26, -0.046], [R.dishR, -0.022], [R.dishR, 0.022], [0.26, 0.044], [0.001, 0.052]], n);
  P.addEquipment('turret', xform(lens, 0, 0, 0, tilt, 0, 0), 0, R.dishY, R.dishZ);
  P.add('turretDark', xform(torus(R.dishR - 0.004, 0.012, n, 6), 0, 0, 0, tilt, 0, 0), 0, R.dishY, R.dishZ);
  const back = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt)).multiplyScalar(-0.04).add(new THREE.Vector3(0, R.dishY, R.dishZ));
  P.addEquipment('turret', box(0.14, 0.16, back.z - R.headFrontZ + 0.04), 0, back.y, (back.z + R.headFrontZ - 0.02) / 2);
  // the sensor box on the head's left (photos 05, 08: a third of the dish wide), 1 cm into the head, behind the dish's
  // rim with its window forward clear of it
  const sx = R.headHalfW - 0.01 + R.sensorW / 2, sy = R.dishY - 0.12, sz = R.headFrontZ - 0.01 - R.sensorD / 2;
  P.addEquipment('turret', box(R.sensorW, R.sensorH, R.sensorD), sx, sy, sz);
  P.add('turretDark', box(R.sensorW - 0.10, 0.14, 0.012), sx + 0.04, sy + 0.08, sz + R.sensorD / 2 + 0.002);
  P.add('turretGlass', box(R.sensorW - 0.14, 0.10, 0.012), sx + 0.05, sy + 0.08, sz + R.sensorD / 2 + 0.008);
  // the large cylinder on its right (photos 01, 02, 08: a quarter to a third of the dish across), 1 cm into the head
  const cx = -(R.headHalfW - 0.01 + R.cylinderL / 2), cz = R.dishZ - 0.28;
  P.addEquipment('turret', cylX(R.cylinderR, R.cylinderL, n), cx, R.dishY - 0.03, cz);
  P.add('turretDark', cylX(R.cylinderR - 0.02, 0.012, n), cx - R.cylinderL / 2 - 0.004, R.dishY - 0.03, cz);
}

/**
 * The search radar raised on its boom (photos 01, 02, 05-09): the hinge between the rear boxes, the heavy box-section
 * boom widening into the turret, up and back to its elbow, the upright to the turntable, and the antenna 0.05 m over the
 * dish: a flat-faced slab under a flat top plate, its end plates flared out at the top, a feed box on its back.
 */
function addSearchRadar(P: TankBuilderPort): void {
  const { box, cylX, cylY, torus } = KIT;
  const n = P.q ? 20 : 14;
  P.addEquipment('turret', cylX(0.12, R.rootHalfW * 2, n), 0, R.hingeY - 0.01, R.hingeZ);
  // the boom: its section square to its run, 0.48 x 0.40 m at the root (inside the hinge) to 0.36 x 0.28 m past the elbow
  const dy = R.elbowY - R.hingeY, dz = R.elbowZ - R.hingeZ, len = Math.hypot(dy, dz);
  const uy = dy / len, uz = dz / len, ny = -uz, nz = uy;
  const ends = [[R.hingeY - 0.08 * uy, R.hingeZ - 0.08 * uz, R.rootHalfW, R.rootDepth / 2],
    [R.elbowY + 0.12 * uy, R.elbowZ + 0.12 * uz, R.armHalfW, R.armDepth / 2]] as const;
  const boom: P3[] = [];
  for (const [y, z, hw, hd] of ends) for (const sx of [-1, 1]) for (const sn of [-1, 1]) {
    boom.push([sx * hw, y + sn * hd * ny, z + sn * hd * nz]);
  }
  P.addEquipment('turret', convex(boom));
  // the upright from the elbow to the turntable, the turntable and its scale ring
  const turnTop = R.antennaBottomY + 0.01, turnBottom = turnTop - 0.09;
  P.addEquipment('turret', box(R.armHalfW * 2 - 0.02, turnBottom + 0.02 - (R.elbowY - 0.10), R.armDepth),
    0, (turnBottom + 0.02 + R.elbowY - 0.10) / 2, R.antennaZ + 0.02);
  P.addEquipment('turret', cylY(0.15, 0.16, turnTop - turnBottom, n), 0, (turnTop + turnBottom) / 2, R.antennaZ);
  P.add('turretDark', torus(0.162, 0.008, n, 4), 0, turnBottom + 0.03, R.antennaZ);
  // the antenna: the slab (a flat face leaning back 8 degrees, its back narrower), the flat top plate overhanging it, the
  // end plates flared out at the top, the feed box on its back (photos 02, 08)
  const y0 = R.antennaBottomY, y1 = R.antennaTopY - 0.025, zf = R.antennaZ + R.antennaDepth / 2, zb = R.antennaZ - R.antennaDepth / 2;
  const hw = R.antennaHalfW - 0.02, slab: P3[] = [];
  for (const sx of [-1, 1]) {
    slab.push([sx * hw, y0, zf], [sx * hw, y1, zf - 0.04], [sx * hw, y0, zb], [sx * hw, y1 - 0.03, zb]);
  }
  P.addEquipment('turret', convex(slab));
  P.addEquipment('turret', box(R.antennaHalfW * 2, 0.03, R.antennaDepth + 0.04), 0, R.antennaTopY - 0.015, R.antennaZ);
  for (const sx of [-1, 1]) {
    P.addEquipment('turret', box(0.02, R.antennaTopY - y0 + 0.02, R.antennaDepth + 0.02), sx * (hw + 0.005), (R.antennaTopY + y0) / 2 - 0.01,
      R.antennaZ, 0, 0, -sx * 0.12);
  }
  P.addEquipment('turret', box(0.40, 0.24, 0.16), 0, (y0 + y1) / 2 + 0.02, zb - 0.06);
}

// ----------------------------------------------------------------------- guns --
/** Each KDA (gun-local, about the elevation axis): the trunnion block, the square sleeve, the barrel, the brake and the v0
 * cage. */
function addGuns(P: TankBuilderPort): void {
  const { cylX, cylZ, torus, xform } = KIT;
  const n = P.q ? 18 : 12;
  const ring = (z: number, hw: number, hh: number, ch: number): P3[] => [
    [-hw + ch, -hh, z], [hw - ch, -hh, z], [hw, -hh + ch, z], [hw, hh - ch, z],
    [hw - ch, hh, z], [-hw + ch, hh, z], [-hw, hh - ch, z], [-hw, -hh + ch, z]];
  for (const s of SIDES) {
    const index = s < 0 ? 0 : 1, bx = s * G.boreX, barrel = `gunBarrel${index}`, dark = `gunBarrel${index}Dark`;
    // the trunnion block turning on the axis just ahead of the pod's nose, and the shaft from the body's flank into it
    P.addGunExtra(cylX(G.hubR, G.hubW, n), bx, 0, 0);
    const shaftIn = T.bodyHalfW - 0.01, shaftOut = G.boreX - G.hubW / 2 + 0.02;
    P.addGunExtraDark(cylX(0.06, shaftOut - shaftIn, n), s * (shaftIn + shaftOut) / 2, 0, 0);
    // the square barrel sleeve (photos 01, 04, 06), from the block to the jacket, its edges chamfered
    P.addGunExtra(convex([
      ...ring(G.sleeveRearZ, G.sleeveRearHalf, G.sleeveRearHalf, 0.02),
      ...ring(G.sleeveFrontZ, G.sleeveFrontHalf, G.sleeveFrontHalf, 0.015),
    ].map(([x, y, z]) => [bx + x, y, z] as P3)));
    // the jacket, the tapering L/90 barrel and its two rings
    P.add(barrel, cylZ(G.jacketR, G.jacketFrontZ - G.sleeveFrontZ + 0.03, n), bx, 0, (G.jacketFrontZ + G.sleeveFrontZ - 0.03) / 2);
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
  // the Type 74's hull and running gear (no cast turret) with the enlarged hull's stern, level sponsons, driver's side,
  // clear glacis and tensioned upper track run
  buildType74Family(P, 'production', {
    hullOnly: true, overhungSternZ: H.sternZ, levelSponsonFrontZ: H.sponsonFrontZ, driverSide: H.driverSide,
    glacisCable: false, trackSag: H.trackSag,
  });
  addSternKit(P);
  addFrontKit(P);
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
