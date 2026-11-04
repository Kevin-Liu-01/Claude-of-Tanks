// PZA Loara (release 269, builder P; the owner 2026-11-03: "also add ... PZA Loara (poland)"): the fleet's PT-91
// Twardy hull and running gear (profiles/pt91Twardy.ts buildPT91TwardyHull: the T-72B3 study's hull without its deck
// fittings or stern drums, the steel side screens without their ERAWA tiles, the dozer blade) under the Loara's raised
// superstructure and box turret, built from the Wikimedia Commons photographs of the third prototype at MSPO Kielce
// 2004 and 2007 (docs/references/tanks/pza_loara.md, photos 01-05):
//   - the raised hull: one welded box over the deck and the fenders, its roof 1.80 m up, its flanks with access doors,
//     its middle's front plate falling at 45 degrees onto the glacis between two cheeks over the front fenders, the
//     louvred intake on the right cheek and the hooded intake beside it (photos 02-05);
//   - the long box turret on it, the commander right and the gunner left, a low chin under the tracking radar;
//   - on each flank at the rear, a 35 mm Oerlikon KDA in its faceted armoured housing, elevating on the large bearing
//     disc (photo 01), the barrel along the turret's side to the multi-port brake just ahead of the radar's dish;
//   - the Eagle tracking radar's round radome on the turret's front face over the chin, the electro-optical head (Iris
//     thermal camera, KTVD-1 television camera, DL-1 rangefinder) beside it on the right;
//   - the 3D search radar on its mast over the guns' axis, the flat slotted array canted back, the RADWAR box on its
//     back;
//   - the two banks of six smoke dischargers low on the flanks at the front (pl.wikipedia: 2 x 6), the commander's
//     PSPD-1 panoramic sight, the hatches, the radio whips and a stowage tube.
// Every datum the combat record shares is in profiles/loaraFrame.ts (loaraSpecs.ts reads the same numbers).
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { KIT } from './kit.ts';
import { antennaPart } from './antennaPart.ts';
import { blindTube } from './measuredPrimitives.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { buildPT91TwardyHull } from './pt91Twardy.ts';
import {
  LOARA_BORE as BORE, LOARA_DECK as DECK, LOARA_GUN_HOUSING as HOUSING, LOARA_MUZZLE_Z, LOARA_SEARCH_RADAR as SEARCH,
  LOARA_TRACKING_RADAR as TRACK, LOARA_TURRET as T,
} from './loaraFrame.ts';

type P3 = readonly [number, number, number];
const SIDES = [-1, 1] as const;
const DEG = Math.PI / 180;

/** A closed convex solid over the points (UVs from x/z, as the fleet's convex slabs). */
function convex(points: readonly P3[]): THREE.BufferGeometry {
  const geometry = new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i), position.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

/** Linear interpolation through measured stations [z, y]. */
function along(stations: readonly (readonly [number, number])[], z: number): number {
  if (z <= stations[0][0]) return stations[0][1];
  for (let i = 1; i < stations.length; i++) {
    const [z1, y1] = stations[i];
    if (z <= z1) {
      const [z0, y0] = stations[i - 1];
      return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
    }
  }
  return stations[stations.length - 1][1];
}

// ------------------------------------------------------------------ hull --
// The B3 study's surfaces the superstructure is seated on (t72b3X.ts): its fender shelf's top and its hull core's roof.
const FENDER_TOP: readonly (readonly [number, number])[] = [
  [-3.36035, 1.118], [-3.18, 1.2395], [-2.96, 1.400], [-2.76, 1.422], [-1.89, 1.444], [0.395, 1.4438], [1.70, 1.392],
  [2.50, 1.30735], [3.08, 1.242],
];
const HULL_TOP: readonly (readonly [number, number])[] = [
  [-3.17815, 1.222], [-3.10, 1.285], [-2.93, 1.390], [-2.70, 1.3925], [-2.46, 1.3949], [-1.402, 1.4053], [-1.401, 1.4571],
  [1.81, 1.4599], [2.20, 1.3078], [2.49, 1.1637], [2.80, 1.0096],
];
const FRONT_SLOPE = Math.tan(DECK.frontSlopeDeg * DEG);
/** The superstructure's roof line: flat to the deck edge, then the front plate's fall. */
const deckTop = (z: number): number => DECK.topY - Math.max(0, z - DECK.edgeZ) * FRONT_SLOPE;
/** The cheeks' roof line: flat to their front edge, then their front faces' fall. */
const cheekTop = (z: number): number => DECK.topY - Math.max(0, z - DECK.cheekEdgeZ) * Math.tan(DECK.cheekSlopeDeg * DEG);

/**
 * The raised hull (photos 02-05): one welded box over the B3 study's deck and fenders, 5 cm inside the side screens. Its
 * flanks stand on the fender shelf (seated 12 mm into its 20 mm plate), its middle sinks into the hull core under it; its
 * rear face over the hull's rear plate, its top rear edge and its long top edges chamfered. Ahead of the deck's edge the
 * middle's front plate falls at 45 degrees into the glacis between the cheeks over the front fenders, which run on at full
 * height and fall at 50 degrees to the fenders. The three abut at the deck's edge.
 */
function addSuperstructure(P: TankBuilderPort): void {
  const W = DECK.halfW, core = 1.09, shelf = 1.11, ch0 = DECK.chamfer;
  const sideFoot = (z: number): number => along(FENDER_TOP, z) - 0.012;
  const coreFoot = (z: number): number => Math.min(1.36, along(HULL_TOP, z) - 0.03);
  const section = (z: number, top: number): { z: number; ring: SectionPoint[] } => {
    const side = sideFoot(z), middle = coreFoot(z), ch = Math.min(ch0, (top - side) * 0.4);
    return { z, ring: [
      [-W, side], [-shelf, side], [-core, middle], [core, middle], [shelf, side], [W, side],
      [W, top - ch], [W - ch, top], [-(W - ch), top], [-W, top - ch],
    ] };
  };
  P.add('hull', sectionSolid([
    section(DECK.rearZ, DECK.topY - ch0),
    section(DECK.rearZ + ch0, DECK.topY),
    ...[-2.93, -2.76, -1.89, -1.40, 0.395, 1.70, DECK.edgeZ].map((z) => section(z, DECK.topY)),
  ]));
  // the middle's front plate, from the deck's edge into the glacis (its sides 5 mm into the cheeks)
  const c = DECK.coreHalfW;
  P.add('hull', sectionSolid([DECK.edgeZ, 2.10, 2.25, 2.42, 2.55, DECK.frontFootZ].map((z) => ({ z, ring: [
    [-c, coreFoot(z)], [c, coreFoot(z)], [c, deckTop(z)], [-c, deckTop(z)],
  ] as SectionPoint[] }))));
  // the cheeks over the fenders, on at full height and then down to the fenders
  const x0 = DECK.cheekInnerX;
  for (const s of SIDES) {
    P.add('hull', sectionSolid([DECK.edgeZ, 2.30, DECK.cheekEdgeZ, 2.75, 2.90, DECK.cheekFootZ].map((z) => {
      const top = cheekTop(z), foot = sideFoot(z), ch = Math.min(ch0, (top - foot) * 0.4);
      const ring: SectionPoint[] = [[x0, foot], [W, foot], [W, top - ch], [W - ch, top], [x0, top]];
      return { z, ring: s > 0 ? ring : ring.map(([x, y]) => [-x, y] as SectionPoint).reverse() };
    })));
  }
}

/** The superstructure's own fittings: access doors on its flanks, the louvred intake at the right front (photos 02, 05),
 * the engine grilles on its rear deck, the APU grille on its rear face; on its front plate the driver's hatch and
 * periscopes, and the hooded intake at its right corner (photos 02, 04, 05). Everything on the deck and the front plate
 * stays under the turret's floor, which sweeps them. */
function addSuperstructureKit(P: TankBuilderPort): void {
  const { box } = KIT;
  const W = DECK.halfW, flankY = DECK.topY - 0.20;
  // doors on each flank between the fender shelf and the roof's chamfer, 12 mm plates let 3 mm in, a handle on each
  const doors: readonly (readonly [number, number])[] = [[-2.62, -1.82], [-1.60, -0.70], [-0.45, 0.45], [0.70, 1.62], [2.00, 2.52]];
  for (const s of SIDES) {
    doors.forEach(([z0, z1], i) => {
      const mid = (z0 + z1) / 2;
      if (i === doors.length - 1) {
        if (s > 0) return;
        // the right cheek: the louvred intake (photos 02, 05), a frame round six slats
        P.addEquipment('hullDetail', box(0.016, 0.26, z1 - z0), s * (W + 0.005), flankY, mid);
        for (let k = 0; k < 6; k++) {
          P.addEquipment('hullDark', box(0.030, 0.014, z1 - z0 - 0.06), s * (W + 0.018), flankY - 0.10 + k * 0.04, mid, 0, 0, s * 0.5);
        }
        return;
      }
      P.addEquipment('hullDetail', box(0.012, 0.26, z1 - z0), s * (W + 0.003), flankY, mid);
      P.addEquipment('hullDark', box(0.022, 0.03, 0.16), s * (W + 0.015), flankY, z1 - 0.14);
    });
  }
  // the engine grilles over the power pack on the rear deck: two framed panels 1 cm proud, eight slats each
  for (const x of [-0.50, 0.50]) {
    P.addEquipment('hullDetail', box(0.78, 0.02, 1.05), x, DECK.topY, -2.18);
    for (let k = 0; k < 8; k++) P.addEquipment('hullDark', box(0.70, 0.008, 0.035), x, DECK.topY + 0.012, -2.62 + k * 0.125);
  }
  // the heat shield over the B3 study's exhaust outlet on the left (+x): it fills the 3 cm slot between the outlet and the
  // fender from the inner apron to the side screen (5 mm into each), which the roof-pocket census read as a 60 cm2 pocket
  P.addEquipment('hullDetail', box(0.098, 0.043, 0.65), 1.727, 1.4065, -1.705);
  // the APU's grille on the rear face (pl.wikipedia: an auxiliary power unit at the rear)
  P.addEquipment('hullDetail', box(0.90, 0.30, 0.016), 0.55, 1.56, DECK.rearZ - 0.005);
  for (let k = 0; k < 5; k++) P.addEquipment('hullDark', box(0.84, 0.014, 0.024), 0.55, 1.44 + k * 0.06, DECK.rearZ - 0.012);
  // on the front plate: the driver's hatch over his seat, his periscope block above it at the deck's edge, the hooded
  // intake at the right corner (its lid under the deck's edge, its open face ahead)
  const tilt = Math.atan(FRONT_SLOPE);
  const normal = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
  const onPlate = (z: number, lift: number): P3 => [0, deckTop(z) + normal.y * lift, z + normal.z * lift];
  const hatch = onPlate(2.24, 0.004);
  P.addHatch('hull', box(0.52, 0.025, 0.40), hatch[0], hatch[1], hatch[2], tilt, 0, 0);
  const down = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt));
  const head = onPlate(2.01, 0.035);
  P.addEquipment('hullDetail', box(0.40, 0.08, 0.10), 0, head[1], head[2], tilt, 0, 0);
  P.add('hullDark', box(0.34, 0.012, 0.03), 0, head[1] + normal.y * 0.04 + down.y * 0.03,
    head[2] + normal.z * 0.04 + down.z * 0.03, tilt, 0, 0);
  // the hood: a wedge on the plate, its lid level 4 cm under the deck, its open face 0.40 m tall ahead
  const front = 2.38, back = 2.00, lid = DECK.topY - 0.04;
  P.addEquipment('hull', convex(([-0.58, -1.12] as const).flatMap((x) => [
    [x, deckTop(front) - 0.01, front], [x, lid - 0.04, front], [x, lid, front - 0.04], [x, lid, back], [x, deckTop(back) - 0.01, back],
  ] as P3[])));
  P.add('hullDark', box(0.44, 0.24, 0.012), -0.84, (deckTop(front) + lid) / 2 - 0.02, front + 0.002);
}

// --------------------------------------------------------------- turret --
function addTurretBody(P: TankBuilderPort): void {
  const { cylY } = KIT;
  // the ring collar on the raised deck, sunk into it and 1 cm up into the body's floor
  P.add('turret', cylY(1.00, 1.04, 0.12, P.q ? 32 : 20), 0, -0.02, 0);
  // One welded shell: the rear corners chamfered in plan, the long top edges and the front roof edge chamfered.
  const ring = (w: number, roof: number = T.roofY): SectionPoint[] => [
    [-w, T.floorY], [w, T.floorY], [w, roof - T.roofChamfer], [w - T.roofChamfer, roof],
    [-(w - T.roofChamfer), roof], [-w, roof - T.roofChamfer],
  ];
  P.add('turret', sectionSolid([
    { z: T.rearZ, ring: ring(T.halfW - T.rearChamfer) },
    { z: T.rearZ + T.rearChamfer, ring: ring(T.halfW) },
    { z: T.frontZ - T.frontChamfer, ring: ring(T.halfW) },
    { z: T.frontZ, ring: ring(T.halfW - 0.03, T.roofY - T.frontChamfer) },
  ]));
  // The chin under the tracking radar (photo 02): low, its front corners chamfered in plan, raked back below, its back 10
  // cm inside the body's front plate.
  const { chinHalfW: w, chinTopY: top, chinFrontZ: front, chinChamfer: c, floorY: floor } = T;
  P.add('turret', convex(SIDES.flatMap((s) => ([
    [w, floor, T.frontZ - 0.10], [w, top, T.frontZ - 0.10],
    [w, top, front - c], [w - c, top, front], [w - c, floor + 0.12, front - 0.06], [w, floor, front - 0.16],
  ] as P3[]).map(([x, y, z]) => [s * x, y, z] as P3))));
}

/** The Eagle tracking radar on the body's front face (photos 02-05): its electronics body let into the front plate, the
 * round radome (a drum and its shallow dome, 0.80 m across, facing ahead) over the chin; and the electro-optical head
 * (Iris thermal camera, KTVD-1 television camera, DL-1 rangefinder) beside it on the right. */
function addTrackingRadar(P: TankBuilderPort): void {
  const { box, cylX, cylZ, sph, xform } = KIT;
  const n = P.q ? 32 : 20;
  const drumRear = TRACK.z - TRACK.drumDepth / 2;
  P.addEquipment('turret', box(0.56, 0.50, drumRear + 0.02 - (T.frontZ - 0.05)), 0, TRACK.y, (drumRear + 0.02 + T.frontZ - 0.05) / 2);
  P.addEquipment('turret', cylZ(TRACK.r, TRACK.drumDepth, n), 0, TRACK.y, TRACK.z);
  P.addEquipment('turretDetail', cylZ(TRACK.r + 0.012, 0.03, n), 0, TRACK.y, TRACK.z + TRACK.drumDepth / 2 - 0.01);
  P.addEquipment('turretDetail', xform(sph(TRACK.r - 0.01, n, Math.PI / 2), 0, 0, 0, Math.PI / 2, 0, 0,
    [1, TRACK.domeDepth / TRACK.r, 1]), 0, TRACK.y, TRACK.z + TRACK.drumDepth / 2 - 0.005);
  // the electro-optical head beside the radome on the right (photos 02, 03): a bracket let into the front plate, the
  // elevating sensor drum with its two windows ahead, the rangefinder's housing on top
  const x = -0.66, z = TRACK.z - 0.13;
  P.addEquipment('turret', box(0.30, 0.27, 0.22), x, 0.735, T.frontZ + 0.09);
  P.addModuleVisual('optics', 'turretDetail', cylX(0.17, 0.30, P.q ? 20 : 14), x, 1.02, z);
  for (const dx of [-0.07, 0.07]) P.add('turretGlass', box(0.10, 0.09, 0.02), x + dx, 1.04, z + 0.165);
  P.addEquipment('turretDetail', box(0.22, 0.14, 0.30), x, 1.24, z - 0.02);
  P.add('turretGlass', box(0.12, 0.06, 0.012), x, 1.24, z + 0.135);
}

/** The 3D search radar on its mast over the roof (photos 02-05): the plinth, the column, the folding joint's housing, the
 * azimuth drive, the bracket to the array's back, the RADWAR electronics box, and the slotted array canted back. */
function addSearchRadar(P: TankBuilderPort): void {
  const { box, cylY, xform } = KIT;
  const R = SEARCH, roof = T.roofY, tilt = R.tiltDeg * DEG;
  const columnTop = roof + 0.06 + R.mastH;
  P.addEquipment('turret', box(0.50, 0.08, 0.50), 0, roof + 0.03, R.mastZ);
  P.addEquipment('turret', box(R.mastHalf * 2, R.mastH + 0.02, R.mastHalf * 2), 0, roof + 0.05 + R.mastH / 2 + 0.01, R.mastZ);
  P.addEquipment('turret', box(0.56, R.jointY1 - R.jointY0, 0.44), 0, roof + (R.jointY0 + R.jointY1) / 2, R.mastZ);
  P.addEquipment('turretDark', cylY(0.20, 0.22, 0.14, P.q ? 24 : 16), 0, columnTop + 0.06, R.mastZ);
  // the array's frame: up its face (leaning back by the tilt) and out of its face (ahead and up)
  const up = new THREE.Vector3(0, Math.cos(tilt), -Math.sin(tilt)), out = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
  const centre = new THREE.Vector3(0, R.arrayCentreY, R.arrayZ);
  const at = (u: number, v: number, w: number): THREE.Vector3 =>
    centre.clone().addScaledVector(up, v).addScaledVector(out, w).add(new THREE.Vector3(u, 0, 0));
  const box3 = (bucket: string, size: P3, p: THREE.Vector3): void =>
    P.addEquipment(bucket, xform(box(size[0], size[1], size[2]), 0, 0, 0, -tilt, 0, 0), p.x, p.y, p.z);
  box3('turret', [R.arrayW, R.arrayH, R.arrayD], centre);
  // the RADWAR box on the array's back (photos 03-05), let 1 cm into it, and the bracket from the drive up into the box
  const back = at(0, -0.02, -R.arrayD / 2 - 0.08);
  box3('turret', [0.75, 0.40, 0.18], back);
  const boxFoot = at(0, -0.22, -R.arrayD / 2 - 0.08).y;
  P.addEquipment('turretDark', box(0.24, boxFoot + 0.03 - (columnTop + 0.11), 0.24), 0,
    (boxFoot + 0.03 + columnTop + 0.11) / 2, back.z);
  // the slotted face: seven radiating slots across it, half let into the face
  for (let k = 0; k < 7; k++) box3('turretDark', [R.arrayW - 0.12, 0.016, 0.012], at(0, -0.36 + k * 0.12, R.arrayD / 2));
}

function addRoofKit(P: TankBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  const roof = T.roofY, n = P.q ? 20 : 14;
  // the commander's PSPD-1 panoramic sight (right, -x; photo 02: 0.5 m tall) and the gunner's sight head (left, +x), their
  // windows ahead
  P.addEquipment('turret', cylY(0.12, 0.13, 0.22, n), -0.48, roof + 0.10, 1.15);
  P.addModuleVisual('optics', 'turretDetail', box(0.30, 0.26, 0.34), -0.48, roof + 0.33, 1.15);
  P.add('turretGlass', box(0.22, 0.08, 0.012), -0.48, roof + 0.36, 1.15 + 0.17);
  P.addEquipment('turret', box(0.26, 0.20, 0.30), 0.50, roof + 0.09, 1.30);
  P.add('turretGlass', box(0.18, 0.07, 0.012), 0.50, roof + 0.12, 1.30 + 0.15);
  // the hatches behind them, either side of the mast
  for (const x of [-0.55, 0.55]) P.addCupola('turret', cylY(0.28, 0.29, 0.04, P.q ? 24 : 16), x, roof + 0.01, 0.40);
  // the stowage tube along the roof's right rear edge (photos 02, 04), on two saddles
  P.addEquipment('turretDetail', cylZ(0.10, 1.00, n), -0.95, roof + 0.09, -0.55);
  for (const z of [-0.90, -0.20]) P.addEquipment('turretDetail', box(0.26, 0.07, 0.08), -0.95, roof + 0.025, z);
  // the radio whips at the roof's rear corners (the antenna seat role: tools/body-height-parts.mjs)
  for (const x of [-0.62, 0.62]) {
    P.addEquipment('turretDetail', antennaPart(cylY(0.05, 0.06, 0.08, 10)), x, roof + 0.03, -0.95);
    P.addEquipment('turretDetail', antennaPart(cylY(0.010, 0.016, 2.20, 6)), x, roof + 1.16, -0.95);
  }
  // the stowage box on the rear face, between the guns' tails
  P.addEquipment('turretDetail', box(1.00, 0.36, 0.26), 0, 0.72, T.rearZ - 0.12);
}

/** The two banks of six 81 mm dischargers low on the flanks at the front (pl.wikipedia, photos 01-05): a bracket plate let
 * into the flank, two rows of three tubes raised outboard and ahead, kept under the guns' depressed barrels. */
function addSmokeDischargers(P: TankBuilderPort): void {
  const { box, xform } = KIT;
  // two rows of three, fanned from the rear tube's outboard to the front tube's forward (photo 02), the upper row steeper
  const zs = [1.40, 1.58, 1.76], fans = [-0.15, 0.30, 0.70], rows = [[0.11, 0.55], [0.26, 0.80]] as const;
  for (const s of SIDES) {
    P.addEquipment('turret', box(0.06, 0.34, 0.60), s * (T.halfW + 0.02), 0.21, 1.58);
    for (const [y, elevation] of rows) zs.forEach((z, k) => {
      const a = fans[k], bore = new THREE.Vector3(s * Math.cos(elevation) * Math.cos(a), Math.sin(elevation),
        Math.cos(elevation) * Math.sin(a));
      const turn = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), bore));
      const tube = new THREE.Vector3(s * (T.halfW + 0.05), y, z).addScaledVector(bore, 0.12);
      P.addEquipment('turretDetail', xform(markSmokeTube(blindTube(0.046, 0.038, 0.27, 0.14, P.q ? 14 : 10), [0, 0, 1], true),
        0, 0, 0, turn.x, turn.y, turn.z), tube.x, tube.y, tube.z);
    });
  }
}

// ----------------------------------------------------------------- guns --
/** Each KDA's elevating plant (gun-local): the bearing disc and hub on the flank, the faceted housing, the barrel. */
function addGuns(P: TankBuilderPort): void {
  const { box, cylX, cylZ } = KIT;
  const n = P.q ? 18 : 12, H = HOUSING;
  for (const s of SIDES) {
    const index = s < 0 ? 0 : 1;
    // the bearing disc (photo 01) 2 cm off the flank, and its hub through the flank
    P.addGunExtraDark(cylX(H.discR, H.discW, P.q ? 32 : 20), s * H.discX, 0, 0);
    P.addGunExtra(cylX(0.14, 0.12, n), s * (T.halfW - 0.02), 0, 0);
    // the housing (photos 01, 02, 04): flat inner and outer faces, a broad chamfer along its top outer edge; its tail
    // tapered; a shoulder, then a front face round the bore
    const section = (z: number, x0: number, x1: number, y0: number, y1: number, outer: number, low: number): P3[] => [
      [x0, y0 + low, z], [x0 + low, y0, z], [x1 - low, y0, z], [x1, y0 + low, z],
      [x1, y1 - outer, z], [x1 - outer, y1, z], [x0 + 0.03, y1, z], [x0, y1 - 0.03, z],
    ];
    const { innerX: x0, outerX: x1, bottomY: y0, topY: y1 } = H;
    P.addGunExtra(convex([
      ...section(H.rearZ, x0 + 0.02, x1 - 0.02, y0 + 0.08, y1 - 0.08, 0.10, 0.03),
      ...section(H.rearZ + 0.13, x0, x1, y0, y1, 0.14, 0.04),
      ...section(H.shoulderZ, x0, x1, y0, y1, 0.14, 0.04),
      ...section(H.noseZ, BORE.x - 0.12, BORE.x + 0.12, BORE.y - 0.12, BORE.y + 0.12, 0.04, 0.02),
    ].map(([x, y, z]) => [s * x, y, z] as P3)));
    // a hinged access door on the outer face and its handle (photo 01)
    P.addGunExtra(box(0.014, 0.34, 0.50), s * (x1 + 0.004), BORE.y, 0.12);
    P.addGunExtraDark(box(0.02, 0.03, 0.10), s * (x1 + 0.014), BORE.y, 0.30);
    // The barrel (photos 02, 04): the jacket out of the nose, a clamp, the L/90 tube, the multi-port brake whose face is
    // the bore mouth, two rings of ports round it.
    const bx = s * BORE.x, by = BORE.y, barrel = `gunBarrel${index}`, dark = `gunBarrel${index}Dark`;
    P.add(barrel, cylZ(0.068, 0.42, n), bx, by, H.noseZ + 0.16);
    P.add(dark, cylZ(0.078, 0.05, n), bx, by, H.noseZ + 0.38);
    const tubeFrom = H.noseZ + 0.40, brakeFrom = LOARA_MUZZLE_Z - 0.30;
    P.add(barrel, cylZ(0.046, brakeFrom - tubeFrom + 0.02, n, 0.052), bx, by, (tubeFrom + brakeFrom) / 2);
    P.add(barrel, cylZ(0.072, 0.30, n), bx, by, LOARA_MUZZLE_Z - 0.15);
    for (const z of [LOARA_MUZZLE_Z - 0.21, LOARA_MUZZLE_Z - 0.09]) P.add(dark, cylZ(0.0745, 0.035, n), bx, by, z);
  }
  P.muzzleZ = LOARA_MUZZLE_Z;
}

export function buildLoara(P: TankBuilderPort): void {
  // the PT-91's hull and running gear; the Loara's hull carries no reactive tiles (photos 02-05), its raised deck covers the
  // B3 study's own deck fittings, and the APU's housing at its rear (pl.wikipedia) stands where the B3's stern drums ride
  buildPT91TwardyHull(P, { erawa: false, deckFittings: false, rearDrums: false });
  addSuperstructure(P);
  addSuperstructureKit(P);
  const [tx, ty, tz] = P.spec.armor.turretPivot;
  const [gx, gy, gz] = P.spec.armor.gunPivot;
  P.turretG.position.set(tx, ty, tz);
  P.gunG.position.set(gx, gy, gz);
  // turret-local from here; the guns' parts are gun-local about the elevation axis
  addTurretBody(P);
  addTrackingRadar(P);
  addSearchRadar(P);
  addRoofKit(P);
  addSmokeDischargers(P);
  addGuns(P);
  P.topY = T.roofY + 0.30;
  P.hullG.userData.familyRebuild = { donor: 'pt91a_twardy', revision: 1, variant: 'loara',
    features: ['raised-superstructure', 'box-turret', 'twin-kda-35', 'tracking-radar', 'search-radar-mast', 'smoke-2x6'] };
}

export const LOARA_PROFILES = {
  pza_loara: { build: buildLoara },
} as const;
