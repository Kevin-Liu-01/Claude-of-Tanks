// Flakpanzer Gepard 1A2 (release 268, builder G; the owner 2026-11-02: "we should add more double barrel vehicels"): the
// fleet's Leopard 1 hull and running gear (profiles/leopard1Hull.ts, shared and unchanged) under the Gepard's welded
// turret, built from the Panzermuseum Munster photographs (docs/references/tanks/gepard_1a2.md, photos 06, 08-12):
//   - a narrow slab-sided upper body, its front carrying the Albis tracking radar (a lateral drum under a forward dome on a
//     pedestal and a rounded tub), its roof the commander's and gunner's sights and hatches;
//   - a full-width rear section closing the gun bays behind the guns, the MPDR 12 search radar raised on its arm over it;
//   - in each bay, a 35 mm Oerlikon KDA in its long faceted armoured cover, elevating on the large bearing on the body's
//     flank (the black disc of photo 08) whose axis runs under the bore, so the cover's tail swings down beside the body;
//     the L/90 barrel with its muzzle brake and v0 measuring head;
//   - a low full-width cheek under each bay's front with the four Wegmann 76 mm smoke dischargers on its top.
// The hull keeps the Leopard 1's build; the Gepard's own hull kit rides on it from here: the long stowage bins along the
// sloped side plates (photos 09, 11, 14), the grouser blocks on the glacis (06, 10, 12) and the APU intake grille on the
// deck's front left (the APU replaces the Leopard 1's ammunition there).
// Every datum the combat record shares is in profiles/gepardFrame.ts (gepardSpecs.ts reads the same numbers).
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { KIT } from './kit.ts';
import { antennaPart } from './antennaPart.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { buildLeo1HullSteps, type Leo1HullDatums } from './leopard1Hull.ts';
import {
  GEPARD_BORE as BORE, GEPARD_GUN_COVER as COVER, GEPARD_MUZZLE_Z, GEPARD_SEARCH_RADAR as SEARCH,
  GEPARD_TURRET as T,
} from './gepardFrame.ts';

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

/** An octagonal section (a rectangle with its four edges chamfered) at station z. */
function octagon(z: number, cx: number, cy: number, hw: number, hh: number, ch: number): P3[] {
  return [
    [cx - hw, cy - hh + ch, z], [cx - hw + ch, cy - hh, z], [cx + hw - ch, cy - hh, z], [cx + hw, cy - hh + ch, z],
    [cx + hw, cy + hh - ch, z], [cx + hw - ch, cy + hh, z], [cx - hw + ch, cy + hh, z], [cx - hw, cy + hh - ch, z],
  ];
}

// ------------------------------------------------------------------ hull kit --
/** The Gepard's own hull kit on the shared Leopard 1 hull (only this build draws it). */
function addGepardHullKit(P: TankBuilderPort, hull: Leo1HullDatums): void {
  const { box, cylX } = KIT;
  const { fenderY, sponsonX, deckEdgeX, deckEdgeY, deckTopY, upperGlacisY } = hull;
  // The stowage bins along the sloped side plates (photos 09, 11, 14): a vertical outer face over the fender's edge, a
  // flat lid, the inner face the side plate itself (each bin sunk 12 mm into it and 2 mm into the fender shelf).
  const slopeX = (y: number, z: number): number =>
    sponsonX - (sponsonX - deckEdgeX) * (y - (fenderY - 0.02)) / (deckEdgeY(z) - (fenderY - 0.02));
  const binOuterX = 1.672, binFootY = fenderY - 0.002, binLidY = 1.46;
  const bins: readonly (readonly [number, number])[] = [[-2.34, -1.30], [-1.26, 0.10], [0.14, 1.46], [1.50, 2.66]];
  for (const s of SIDES) {
    for (const [z0, z1] of bins) {
      const ends = [z0, z1].flatMap((z) => [
        [s * binOuterX, binFootY, z], [s * binOuterX, binLidY, z],
        [s * (slopeX(binLidY, z) - 0.012), binLidY, z], [s * (slopeX(binFootY, z) - 0.012), binFootY, z],
      ] as P3[]);
      P.addEquipment('hullDetail', convex(ends));
      // the lid's front lip and two latches on the outer face
      const length = z1 - z0, mid = (z0 + z1) / 2;
      P.addEquipment('hullDetail', box(0.016, 0.03, length - 0.06), s * (binOuterX + 0.006), binLidY - 0.02, mid);
      for (const dz of [-0.30, 0.30]) {
        P.addEquipment('hullDark', box(0.014, 0.07, 0.05), s * (binOuterX + 0.005), binLidY - 0.09, mid + dz * length / 1.2);
      }
    }
  }
  // Four grouser blocks stowed two by two on the upper glacis (photos 06, 10, 12), on two clamp bars.
  const glacisTilt = Math.atan2(upperGlacisY(3.00) - upperGlacisY(3.40), 0.40);
  for (const z of [3.02, 3.24]) {
    const y = upperGlacisY(z) + 0.06;
    P.addEquipment('hullDark', box(0.62, 0.025, 0.04), 0.06, y + 0.008, z, glacisTilt, 0, 0);
    for (const x of [-0.10, 0.22]) P.addEquipment('hullDark', box(0.26, 0.07, 0.17), x, y + 0.03, z, glacisTilt, 0, 0);
  }
  // The APU's intake grille on the deck's front left (+x), beside the driver: a low framed panel with slats, under every
  // part of the turret that sweeps it.
  const apuZ = 2.22, apuY = deckTopY(apuZ), deckTilt = Math.atan2(deckTopY(2.0) - deckTopY(2.4), 0.40);
  P.addEquipment('hull', box(0.56, 0.04, 0.42), 0.56, apuY + 0.012, apuZ, deckTilt, 0, 0);
  P.add('hullDark', box(0.48, 0.006, 0.34), 0.56, apuY + 0.033, apuZ, deckTilt, 0, 0);
  for (let k = 0; k < 5; k++) {
    P.addEquipment('hull', cylX(0.009, 0.48, 6), 0.56, apuY + 0.036, apuZ - 0.14 + k * 0.07);
  }
}

// --------------------------------------------------------------------- turret --
function addTurretBody(P: TankBuilderPort): void {
  const { cylY } = KIT;
  // The ring collar on the hull's race (as the Leopard 1A5's, sunk into the deck), up into the turret's floor.
  P.add('turret', cylY(0.98, 1.04, T.floorY + 0.12, P.q ? 28 : 18), 0, (T.floorY + 0.01) / 2 - 0.05, 0);
  // One welded shell: the rear section full width with chamfered rear corners, the step to the narrow upper body at the
  // gun bays' rear wall, the upper body to its chamfered front corners and front roof edge.
  const ring = (w: number, roof: number = T.roofY): SectionPoint[] => [
    [-w, T.floorY], [w, T.floorY], [w, roof - T.roofChamfer], [w - T.roofChamfer, roof],
    [-(w - T.roofChamfer), roof], [-w, roof - T.roofChamfer],
  ];
  P.add('turret', sectionSolid([
    { z: T.rearZ, ring: ring(T.rearHalfW - T.rearChamfer) },
    { z: T.rearZ + T.rearChamfer, ring: ring(T.rearHalfW) },
    { z: T.rearFrontZ, ring: ring(T.rearHalfW) },
    { z: T.rearFrontZ + 0.004, ring: ring(T.bodyHalfW) },
    { z: T.frontZ - T.frontChamfer, ring: ring(T.bodyHalfW) },
    { z: T.frontZ, ring: ring(T.bodyHalfW - T.frontChamfer, T.roofY - 0.04) },
  ]));
  // The low cheeks under the bays' front: full width, the chin raked back, the outer front corner chamfered.
  for (const s of SIDES) {
    const { cheekInnerX: xi, cheekOuterX: xo, cheekTopY: yt, cheekRearZ: zr, cheekFrontZ: zf, cheekChinZ: zc, floorY: yb } = T;
    P.add('turret', convex(([
      [xi, yb, zr], [xo, yb, zr], [xo, yt - 0.04, zr], [xo - 0.04, yt, zr], [xi, yt, zr],
      [xi, yb, zc], [xo - 0.10, yb, zc], [xo, yb, zc - 0.10], [xo, yt - 0.04, zf - 0.18], [xo - 0.04, yt, zf - 0.12],
      [xo - 0.12, yt, zf], [xi, yt, zf],
    ] as P3[]).map(([x, y, z]) => [s * x, y, z] as P3)));
  }
}

/** The Albis tracking radar on the upper body's front (photos 06, 10, 12): tub, pedestal, the lateral drum and its dome. */
function addTrackingRadar(P: TankBuilderPort): void {
  const { box, cylX, cylZ, sph, xform } = KIT;
  const tub = (y: number, front: number): P3[] => [
    [-0.46, y, T.frontZ - 0.08], [0.46, y, T.frontZ - 0.08],
    ...Array.from({ length: 5 }, (_, k) => {
      const a = (k / 4) * Math.PI;
      return [0.46 * Math.cos(a), y, front - 0.24 + 0.24 * Math.sin(a)] as P3;
    }),
  ];
  P.addEquipment('turret', convex([...tub(T.floorY + 0.02, 1.60), ...tub(0.40, 1.72)]));
  P.addEquipment('turret', box(0.70, 0.20, 0.36), 0, 0.48, 1.47);
  const headY = 0.80, headZ = 1.60;
  // (photo 10: the drum and its bearing caps span some 70 % of the body's front)
  P.addEquipment('turret', cylX(0.27, 0.80, P.q ? 24 : 16), 0, headY, headZ);
  for (const s of SIDES) P.addEquipment('turretDark', cylX(0.14, 0.06, P.q ? 16 : 12), s * 0.425, headY, headZ);
  // the radome: a forward dome a little over the drum, on its rim
  P.addEquipment('turretDetail', cylZ(0.30, 0.05, P.q ? 28 : 18), 0, headY, headZ + 0.02);
  P.addEquipment('turretDetail', xform(sph(0.295, P.q ? 28 : 18, Math.PI / 2), 0, 0, 0, Math.PI / 2, 0, 0, [1, 0.92, 1]),
    0, headY, headZ + 0.04);
}

/** The MPDR 12 search radar raised over the rear section (photos 08, 09, 11): pedestal, arm, reflector, feed. */
function addSearchRadar(P: TankBuilderPort): void {
  const { box, cylY, cylZ, xform } = KIT;
  const z = SEARCH.z;
  P.addEquipment('turret', cylY(0.24, 0.26, 0.32, P.q ? 24 : 16), 0, T.roofY + 0.14, z);
  P.addEquipment('turretDark', cylY(0.20, 0.22, 0.06, P.q ? 24 : 16), 0, T.roofY + 0.33, z);
  // the arm: a tapered column from the turntable into the reflector's foot
  P.addEquipment('turretDark', convex([
    ...octagon(0, 0, 0, 0.11, 0.12, 0.03).map(([x, y]) => [x, T.roofY + 0.34, z - 0.06 + y] as P3),
    ...octagon(0, 0, 0, 0.07, 0.08, 0.02).map(([x, y]) => [x, SEARCH.bottomY + 0.05, z - 0.04 + y] as P3),
  ]));
  // the reflector: a doubly curved shell (focal length 0.55 m) concave forward, its outline an ellipse cut square at the
  // ends; drawn as a loft across the vehicle (local z = lateral), then turned so it spans x
  const focal = 0.55, shell = 0.03, centreY = (SEARCH.bottomY + SEARCH.topY) / 2, halfH = (SEARCH.topY - SEARCH.bottomY) / 2;
  const samples = 6;
  const sections = Array.from({ length: 9 }, (_, i) => {
    const u = -SEARCH.halfW + (2 * SEARCH.halfW * i) / 8;
    const h = halfH * Math.sqrt(1 - 0.72 * (u / SEARCH.halfW) ** 2);
    const face = (v: number): number => (u * u * 0.5 + v * v) / (4 * focal);
    const front: SectionPoint[] = Array.from({ length: samples + 1 }, (_, k) => {
      const v = -h + (2 * h * k) / samples;
      return [face(v), v];
    });
    const back: SectionPoint[] = front.slice().reverse().map(([d, v]) => [d - shell, v]);
    return { z: u, ring: [...front, ...back] };
  });
  const vertexZ = z - 0.04;
  P.addEquipment('turretDark', xform(sectionSolid(sections), 0, 0, 0, 0, -Math.PI / 2, 0), 0, centreY, vertexZ);
  // the feed horn on its waveguide strut at the focus
  const strutFrom = new THREE.Vector3(0, SEARCH.bottomY + 0.02, vertexZ);
  const horn = new THREE.Vector3(0, centreY - 0.02, vertexZ + focal);
  const strut = horn.clone().sub(strutFrom), strutPitch = Math.atan2(-strut.y, strut.z);
  P.addEquipment('turretDark', xform(cylZ(0.022, strut.length(), 8), 0, 0, 0, strutPitch, 0, 0),
    (strutFrom.x + horn.x) / 2, (strutFrom.y + horn.y) / 2, (strutFrom.z + horn.z) / 2);
  P.addEquipment('turretDark', box(0.18, 0.12, 0.12), 0, horn.y, horn.z);
}

function addRoofAndRearKit(P: TankBuilderPort): void {
  const { box, cylY, liftEye } = KIT;
  // The commander's (right, -x) and gunner's (left, +x) sight heads at the roof's front edge either side of the radar,
  // their windows forward (photos 10, 12), and their hatches behind them.
  for (const [x, head] of [[-0.42, [0.26, 0.20, 0.30]], [0.42, [0.22, 0.16, 0.26]]] as const) {
    P.addEquipment('turret', cylY(0.12, 0.13, 0.10, P.q ? 18 : 12), x, T.roofY + 0.045, 0.98);
    P.addEquipment('turret', box(head[0], head[1], head[2]), x, T.roofY + 0.09 + head[1] / 2, 1.00);
    P.add('turretDark', box(head[0] - 0.05, head[1] * 0.45, 0.02), x, T.roofY + 0.09 + head[1] * 0.55, 1.00 + head[2] / 2 + 0.005);
    P.add('turretGlass', box(head[0] - 0.08, head[1] * 0.30, 0.012), x, T.roofY + 0.09 + head[1] * 0.55, 1.00 + head[2] / 2 + 0.017);
    P.addCupola('turret', cylY(0.25, 0.26, 0.05, P.q ? 20 : 14), x, T.roofY + 0.02, 0.22);
    P.addCupola('turret', cylY(0.20, 0.22, 0.03, P.q ? 20 : 14), x, T.roofY + 0.055, 0.22);
  }
  for (const [x, z, yaw] of [[0.60, 0.70, 0.45], [-0.60, 0.70, -0.45], [1.05, -1.62, 2.4], [-1.05, -1.62, -2.4]] as const) {
    liftEye(P, 'turretDetail', x, T.roofY, z, yaw);
  }
  // The rear section: stowage boxes on its rear face, a box on each flank, the radio whips at its rear corners.
  for (const s of SIDES) {
    P.addEquipment('turretDetail', box(0.72, 0.40, 0.22), s * 0.56, 0.62, T.rearZ - 0.10);
    P.addEquipment('turretDetail', box(0.15, 0.30, 0.44), s * (T.rearHalfW + 0.065), 0.46, -1.42);
    P.addEquipment('turretDetail', box(0.10, 0.12, 0.14), s * 0.98, T.roofY + 0.055, -1.70);
    P.addEquipment('turretDetail', antennaPart(cylY(0.014, 0.016, 2.20, 8)), s * 0.98, T.roofY + 1.21, -1.70);
  }
}

/** The four 76 mm dischargers on each cheek's top (photos 08, 11, 12): a bracket bar, the tubes raised outboard and forward. */
function addSmokeDischargers(P: TankBuilderPort): void {
  const { box, cylZ, xform } = KIT;
  const footY = T.cheekTopY + 0.03, tubeX = 1.13, tubeZs = [0.74, 0.86, 0.98, 1.10];
  for (const s of SIDES) {
    P.addEquipment('turret', box(0.15, 0.05, 0.50), s * tubeX, T.cheekTopY + 0.015, 0.92);
    const bore = new THREE.Vector3(s * 0.30, 0.90, 0.30).normalize();
    const turn = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), bore));
    for (const z of tubeZs) {
      const foot = new THREE.Vector3(s * tubeX, footY, z);
      const tube = foot.clone().addScaledVector(bore, 0.11), mouth = foot.clone().addScaledVector(bore, 0.217);
      P.addEquipment('turret', xform(markSmokeTube(cylZ(0.042, 0.22, P.q ? 12 : 8)), 0, 0, 0, turn.x, turn.y, turn.z),
        tube.x, tube.y, tube.z);
      P.add('turretDark', xform(cylZ(0.033, 0.012, P.q ? 12 : 8), 0, 0, 0, turn.x, turn.y, turn.z), mouth.x, mouth.y, mouth.z);
    }
  }
}

// ----------------------------------------------------------------------- guns --
/** Each KDA's elevating plant (gun-local): the bearing disc and hub on the body's flank, the faceted cover, the barrel. */
function addGuns(P: TankBuilderPort): void {
  const { box, cylX, cylZ, torus, xform } = KIT;
  const n = P.q ? 18 : 12;
  for (const s of SIDES) {
    const index = s < 0 ? 0 : 1;
    const cx = (COVER.innerX + COVER.outerX) / 2, hw = (COVER.outerX - COVER.innerX) / 2;
    const cy = (COVER.bottomY + COVER.topY) / 2, hh = (COVER.topY - COVER.bottomY) / 2;
    // The bearing (photo 08's black disc): the turning disc 20 mm off the body's flank, its hub into the body.
    P.addGunExtraDark(cylX(COVER.bearingR, 0.05, P.q ? 32 : 20), s * (T.bodyHalfW + 0.045), 0, 0);
    P.addGunExtra(cylX(0.15, 0.08, n), s * (T.bodyHalfW + 0.01), 0, 0);
    // The cover: full section from its tail to the receiver's front, the nose tapering onto the barrel.
    const mirror = (points: readonly P3[]): P3[] => points.map(([x, y, z]) => [s * x, y, z] as P3);
    P.addGunExtra(convex(mirror([
      // (the tail's lower edge cut back under a longer top, as photo 08's)
      ...octagon(COVER.rearZ, cx, cy + 0.085, hw - 0.03, hh - 0.085, 0.07),
      ...octagon(COVER.rearZ + 0.12, cx, cy, hw, hh, 0.07),
      ...octagon(COVER.bodyFrontZ, cx, cy, hw, hh, 0.07),
      ...octagon(COVER.noseZ, BORE.x, BORE.y, 0.085, 0.085, 0.03),
    ])));
    // two hinged access doors and their handles on the cover's outer face
    for (const z of [-0.17, 0.23]) {
      P.addGunExtra(box(0.012, 0.24, 0.36), s * (COVER.outerX + 0.004), cy - 0.01, z);
      P.addGunExtraDark(box(0.02, 0.03, 0.09), s * (COVER.outerX + 0.014), cy - 0.01, z + 0.10);
    }
    // The barrel (photos 03, 04, 08): a jacket out of the nose, a clamp, the L/90 tube, the brake and the v0 head's cage.
    const bx = s * BORE.x, by = BORE.y, barrel = `gunBarrel${index}`, dark = `gunBarrel${index}Dark`;
    P.add(barrel, cylZ(0.064, 0.56, n), bx, by, 1.24);
    P.add(dark, cylZ(0.075, 0.05, n), bx, by, 1.52);
    P.add(dark, cylZ(0.050, 2.02, n, 0.056), bx, by, 2.54);
    P.add(dark, cylZ(0.092, 0.08, n), bx, by, 3.58);
    P.add(dark, cylZ(0.060, 0.43, n), bx, by, GEPARD_MUZZLE_Z - 0.215);
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + (k * 2 * Math.PI) / 3;
      P.add(dark, cylZ(0.011, 0.40, 6), bx + Math.cos(a) * 0.088, by + Math.sin(a) * 0.088, 3.82);
    }
    P.add(dark, xform(torus(0.088, 0.012, n, 6), 0, 0, 0, -Math.PI / 2, 0, 0), bx, by, 4.01);
  }
  P.muzzleZ = GEPARD_MUZZLE_Z;
}

function* buildGepard1A2Steps(P: TankBuilderPort): TankProfileBuild {
  // The Leopard 1 hull without the A5's glacis grousers, deck tools and side tools: the Gepard stows grouser blocks and
  // side bins instead, and its turret sweeps that deck.
  const hull = yield* buildLeo1HullSteps(P, { grouserRack: false, deckTools: false, sideTools: false });
  addGepardHullKit(P, hull);
  yield 'buildGepardHullKit';
  const [tx, ty, tz] = P.spec.armor.turretPivot;
  const [gx, gy, gz] = P.spec.armor.gunPivot;
  P.turretG.position.set(tx, ty, tz);
  P.gunG.position.set(gx, gy, gz);
  // turret-local from here; the guns' parts are gun-local about the elevation bearing
  addTurretBody(P);
  addTrackingRadar(P);
  yield 'buildGepardTurret';
  addSearchRadar(P);
  addRoofAndRearKit(P);
  addSmokeDischargers(P);
  yield 'buildGepardTurretKit';
  addGuns(P);
  P.topY = T.roofY + 0.30;
}

export const buildGepard1A2 = steppedBuilder(buildGepard1A2Steps);

export const GEPARD_PROFILES = {
  gepard_1a2: { build: buildGepard1A2 },
} as const;
