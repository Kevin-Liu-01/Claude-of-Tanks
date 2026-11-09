// PZA Loara (release 269, builder P; the owner 2026-11-03: "also add ... PZA Loara (poland)"): the fleet's PT-91
// Twardy hull and running gear (profiles/pt91Twardy.ts buildPT91TwardyHull: the T-72B3 study's hull without its deck
// fittings or stern drums, the steel side screens without their ERAWA tiles, the dozer blade) under the Loara's raised
// superstructure and box turret, built from the Wikimedia Commons photographs of the third prototype at MSPO Kielce
// 2004 and 2007 (docs/references/tanks/pza_loara.md, photos 01-05):
//   - the raised hull: one welded box over the deck and the fenders, its roof 1.80 m up, its flanks with access doors and
//     a row of varied stowage boxes, its middle's front plate falling at 45 degrees onto the glacis between two cheeks
//     over the front fenders, the tall grille box on the right cheek and the hooded intake beside it, big curved shells
//     over the front of the tracks (photos 02-05);
//   - the long box turret on it, the commander right and the gunner left, a low front block under the tracking radar;
//   - on each flank at the rear, a 35 mm Oerlikon KDA in its faceted armoured pod (a square-cut rear half, a long tapering
//     front half), elevating on the large dark bearing ring that shows behind and under it (photos 01, 02), the barrel
//     along the turret's side to the large perforated brake just ahead of the radar's dish;
//   - the tracking head: the Eagle's round radome and, beside it on the right, the electro-optical drum (Iris thermal
//     camera, KTVD-1 television camera, DL-1 rangefinder) with its lens and a sensor box on it, on one dark mount;
//   - the 3D search radar on its stack of boxes over the guns' axis, the flat slotted array canted back, the RADWAR box
//     on its back;
//   - the two banks of six smoke dischargers on deep boxes low on the flanks at the front (pl.wikipedia: 2 x 6), the
//     louvred door and panel on the left flank, the commander's PSPD-1 panoramic sight, the hatches, the radio whips and
//     a stowage tube.
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
  LOARA_BORE as BORE, LOARA_BRAKE as BRAKE, LOARA_DECK as DECK, LOARA_DRIVER_X, LOARA_GUN_HOUSING as HOUSING,
  LOARA_LEFT_DOOR as DOOR, LOARA_MUZZLE_Z, LOARA_SCREEN_FOOT_Y, LOARA_SEARCH_RADAR as SEARCH, LOARA_SMOKE as SMOKE,
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

/** The superstructure's own fittings: a row of latched stowage boxes along each flank on the fender shelf, of varied
 * lengths, heights and lids, standing out over the side screens, and a raised box at the right rear corner (photos 01,
 * 02, 04, 05); the tall grille box with its sloped front on the right cheek (photos 02, 04, 05); the engine grilles on the
 * rear deck, the APU grille on the rear face; on the front plate the driver's hatch and periscopes (left of the middle,
 * pl.wikipedia) and the hooded intake at its right corner (photos 02, 04, 05). Everything on the deck and the front plate
 * inside the turret's sweep stays under its floor. */
function addSuperstructureKit(P: TankBuilderPort): void {
  const { box } = KIT;
  const W = DECK.halfW;
  // The boxes: each on the fender shelf (5 mm into it and the side screen's top), 1 cm into the flank, out over the
  // screen; [front-to-back z0, z1, lid height, outer face, the lid's fall to the outer edge]. A gap on the left over the
  // B3 study's exhaust (z -1.84 to -1.58).
  const bins: Record<number, readonly (readonly [number, number, number, number, number])[]> = {
    [-1]: [[-2.62, -2.02, 1.66, 1.82, 0], [-1.92, -1.08, 1.75, 1.84, 0.04], [-0.98, -0.56, 1.60, 1.81, 0],
      [-0.46, 0.46, 1.72, 1.83, 0], [0.56, 1.02, 1.64, 1.84, 0.03], [1.12, 1.86, 1.75, 1.82, 0]],
    [1]: [[-2.62, -1.84, 1.74, 1.83, 0.04], [-1.58, -1.12, 1.64, 1.82, 0], [-1.02, -0.30, 1.72, 1.84, 0],
      [-0.20, 0.52, 1.66, 1.82, 0.03], [0.62, 1.10, 1.75, 1.83, 0], [1.20, 1.86, 1.68, 1.82, 0]],
  };
  for (const s of SIDES) {
    for (const [z0, z1, top, out, fall] of bins[s]) {
      const lip = top - fall;
      const ring = (z: number): SectionPoint[] => {
        const foot = along(FENDER_TOP, z) - 0.005;
        return [[W - 0.01, foot], [out, foot], [out, lip - 0.03], [out - 0.03, lip], [W - 0.01, top]];
      };
      P.addEquipment('hullDetail', sectionSolid([z0, (z0 + z1) / 2, z1].map((z) => ({
        z, ring: s > 0 ? ring(z) : ring(z).map(([x, y]) => [-x, y] as SectionPoint).reverse(),
      }))));
      P.addEquipment('hullDark', box(0.006, 0.012, z1 - z0 - 0.04), s * (out + 0.002), lip - 0.06, (z0 + z1) / 2);
      for (const z of [z0 + 0.12, z1 - 0.12]) P.addEquipment('hullDark', box(0.02, 0.06, 0.04), s * (out + 0.008), lip - 0.11, z);
    }
  }
  // The grille box on the right cheek (photos 02, 04, 05): standing on the fender shelf, out past the side screens as the
  // stowage boxes and 4 cm under the deck's roof, its front falling at 48 degrees, a large framed louvre of eight slats
  // on its face.
  {
    const out = 1.83, top = DECK.topY - 0.04;
    const lid = (z: number): number => top - Math.max(0, z - 2.30) * 1.125;
    P.addEquipment('hullDetail', sectionSolid([1.98, 2.30, 2.46, 2.62].map((z) => {
      const foot = along(FENDER_TOP, z) - 0.005, y = lid(z);
      return { z, ring: ([[W - 0.01, foot], [out, foot], [out, y - 0.03], [out - 0.03, y], [W - 0.01, y]] as SectionPoint[])
        .map(([x, yy]) => [-x, yy] as SectionPoint).reverse() };
    })));
    P.addEquipment('hullDetail', box(0.016, 0.32, 0.30), -(out + 0.005), 1.56, 2.14);
    for (let k = 0; k < 8; k++) P.addEquipment('hullDark', box(0.030, 0.012, 0.26), -(out + 0.016), 1.43 + k * 0.037, 2.14, 0, 0, -0.5);
  }
  // the raised box at the right rear corner (photos 02, 04, 05), outside the turret's sweep (the chin reaches 2.87 m from
  // the ring), under the guns' depression
  P.addEquipment('hullDetail', box(0.36, 0.16, 0.50), -1.48, DECK.topY + 0.07, -2.80);
  for (const z of [-2.95, -2.65]) P.addEquipment('hullDark', box(0.02, 0.05, 0.04), -1.665, DECK.topY + 0.10, z);
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
  // on the front plate: the driver's hatch over his seat left of the middle, his periscope block above it at the deck's
  // edge, the hooded intake at the right corner (its lid under the deck's edge, its open face ahead)
  const tilt = Math.atan(FRONT_SLOPE);
  const normal = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
  const onPlate = (z: number, lift: number): P3 => [LOARA_DRIVER_X, deckTop(z) + normal.y * lift, z + normal.z * lift];
  const hatch = onPlate(2.24, 0.004);
  P.addHatch('hull', box(0.52, 0.025, 0.40), hatch[0], hatch[1], hatch[2], tilt, 0, 0);
  const down = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt));
  const head = onPlate(2.01, 0.035);
  P.addEquipment('hullDetail', box(0.40, 0.08, 0.10), head[0], head[1], head[2], tilt, 0, 0);
  P.add('hullDark', box(0.34, 0.012, 0.03), head[0], head[1] + normal.y * 0.04 + down.y * 0.03,
    head[2] + normal.z * 0.04 + down.z * 0.03, tilt, 0, 0);
  // the hood: a wedge on the plate, its lid level 4 cm under the deck, its open face 0.40 m tall ahead
  const front = 2.38, back = 2.00, lid = DECK.topY - 0.04;
  P.addEquipment('hull', convex(([-0.58, -1.12] as const).flatMap((x) => [
    [x, deckTop(front) - 0.01, front], [x, lid - 0.04, front], [x, lid, front - 0.04], [x, lid, back], [x, deckTop(back) - 0.01, back],
  ] as P3[])));
  P.add('hullDark', box(0.44, 0.24, 0.012), -0.84, (deckTop(front) + lid) / 2 - 0.02, front + 0.002);
}

/**
 * The front mudguards (photos 02-05): a big curved shell over the front of each track in place of the B3 study's flat
 * bent plate (buildPT91TwardyHull frontMudguards: false ends its fenders over the idlers). From under the cheek its top
 * runs level over the side screen's front end, then rolls down ahead of the track to a lip 0.84 m up and 0.3 m ahead of
 * the track; its outer side wraps down over the track's flank to 2 cm under the side plate's foot, 13 mm into the
 * plate. Solid down into the
 * fender as far as the fender runs (z 3.08), a sheet 2.5 cm thick ahead of it, its rolled front thickened up to 10 cm
 * where it falls steeply.
 */
function addFrontMudguards(P: TankBuilderPort): void {
  const xi = 1.105, zRoll = 3.27, top = 1.47, a = 0.32, b = 0.70;
  const fenderEnd = FENDER_TOP[FENDER_TOP.length - 1][0];
  const stations: { z: number; y: number; th: number }[] = [
    { z: 2.66, y: top, th: 0.025 }, { z: 3.00, y: top, th: 0.025 }, { z: fenderEnd, y: top, th: 0.025 },
    ...[0, 15, 30, 45, 58, 70, 78, 84].map((deg) => {
      const t = deg * DEG, slope = (b / a) * Math.tan(t);
      return { z: zRoll + a * Math.sin(t), y: top - b + b * Math.cos(t), th: Math.min(0.10, 0.025 * Math.hypot(1, slope)) };
    }),
  ];
  for (const s of SIDES) {
    const xs = (s < 0 ? 1.779 : 1.791) - 0.005, xo = xs + 0.04;
    P.addMudguard(`loara-front-mudguard-${s < 0 ? 'r' : 'l'}`, 'hull', sectionSolid(stations.map(({ z, y, th }) => {
      // over the fender the shell is solid down into it (no cavity under the cheek's foot), then its underside rises
      // from the fender's end to the sheet
      const bottom = z <= fenderEnd + 1e-9 ? along(FENDER_TOP, z) - 0.008 : y - th;
      const yb = Math.min(LOARA_SCREEN_FOOT_Y - 0.02, bottom - 0.04);
      const ring: SectionPoint[] = [
        [xi, bottom], [xs - 0.03, bottom], [xs, bottom - 0.03], [xs, yb], [xo, yb], [xo, y - 0.06], [xo - 0.025, y - 0.02],
        [xo - 0.08, y], [xi, y],
      ];
      return { z, ring: s > 0 ? ring : ring.map(([x, yy]) => [-x, yy] as SectionPoint).reverse() };
    })));
  }
}

// --------------------------------------------------------------- turret --
function addTurretBody(P: TankBuilderPort): void {
  const { cylY } = KIT;
  // the ring collar on the raised deck, sunk into it and 1 cm up into the body's floor: the race's own steel (as the BMPT's
  // turntable, bmpt72Station.ts), out of the armoured body's bucket, whose measured box it stretched 14 cm behind the
  // body's rear and under its floor (270: loara.selftest's turret plates)
  P.add('turretTrack', cylY(1.00, 1.04, 0.12, P.q ? 32 : 20), 0, -0.02, 0);
  // One welded shell (photos 01-03): a vertical upper wall over the lower skirt, the break a horizontal line 57 % of the way
  // up; the skirt flaring out from just ahead of the bearing discs (the wall runs straight down beside them, photo 01);
  // the rear corners chamfered in plan, the long top edges and the front roof edge chamfered.
  const ring = (w: number, flare: number, roof: number = T.roofY): SectionPoint[] => [
    [-(w + flare), T.floorY], [w + flare, T.floorY], [w, T.breakY], [w, roof - T.roofChamfer], [w - T.roofChamfer, roof],
    [-(w - T.roofChamfer), roof], [-w, roof - T.roofChamfer], [-w, T.breakY],
  ];
  const f = T.skirtFlare;
  P.add('turret', sectionSolid([
    { z: T.rearZ, ring: ring(T.halfW - T.rearChamfer, 0) },
    { z: T.rearZ + T.rearChamfer, ring: ring(T.halfW, 0) },
    { z: T.skirtRearZ, ring: ring(T.halfW, 0) },
    { z: T.skirtFullZ, ring: ring(T.halfW, f) },
    { z: T.frontZ - T.frontChamfer, ring: ring(T.halfW, f) },
    { z: T.frontZ, ring: ring(T.halfW - 0.03, f, T.roofY - T.frontChamfer) },
  ]));
  // the weld along the break from the skirt's rear to the front corner chamfer (photos 01-03: a visible horizontal line)
  for (const s of SIDES) {
    const z0 = T.skirtRearZ + 0.05, z1 = T.frontZ - T.frontChamfer;
    P.add('turretDark', KIT.box(0.022, 0.022, z1 - z0), s * (T.halfW + 0.006), T.breakY, (z0 + z1) / 2);
  }
  // The chin under the tracking radar (photo 02): low, its front corners chamfered in plan, raked back below, its back 10
  // cm inside the body's front plate.
  const { chinHalfW: w, chinTopY: top, chinFrontZ: front, chinChamfer: c, floorY: floor } = T;
  P.add('turret', convex(SIDES.flatMap((s) => ([
    [w, floor, T.frontZ - 0.10], [w, top, T.frontZ - 0.10],
    [w, top, front - c], [w - c, top, front], [w - c, floor + 0.12, front - 0.06], [w, floor, front - 0.16],
  ] as P3[]).map(([x, y, z]) => [s * x, y, z] as P3))));
}

/** The tracking radar's head (photos 02-05): the Eagle's round radome (a drum and its shallow dome, 0.88 m across,
 * facing ahead) and beside it on the right, behind its face, the electro-optical drum across the turret on its neck, the
 * sight's cylindrical head forward from the drum's upper front, two boxes over the sight; a box on the radome's back.
 * The radome and the drum stand on one dark mount on the low front block: under the radome, its neck behind the radome
 * up to the box, and under the drum. */
function addTrackingRadar(P: TankBuilderPort): void {
  const { box, cylX, cylZ, sph, xform } = KIT;
  const R = TRACK, n = P.q ? 32 : 20, face = T.frontZ - 0.015, floor = T.chinTopY - 0.015;
  // the dark mount: under the radome on the front block, the neck behind the radome up to the tall box, and the block
  // under the drum (out past the front block's right corner, on the body's front face)
  const dishRear = R.z - R.drumDepth / 2;
  P.addEquipment('turretDark', box(0.84, R.mountTopY - floor, dishRear + 0.22 - face), 0, (R.mountTopY + floor) / 2,
    (dishRear + 0.22 + face) / 2);
  const neckTop = R.y + R.r - 0.01;
  P.addEquipment('turretDark', box(0.48, neckTop - (R.mountTopY - 0.015), dishRear + 0.02 - (face + 0.005)), 0,
    (neckTop + R.mountTopY - 0.015) / 2, (dishRear + 0.02 + face + 0.005) / 2);
  // under the drum, a block on the front block and the narrow neck the drum stands on (photo 03)
  const camBottom = R.camY - R.camR, neckFoot = 0.70;
  P.addEquipment('turretDark', box(0.48, neckFoot - (floor - 0.005), dishRear + 0.025 - face), R.camX + 0.02,
    (neckFoot + floor - 0.005) / 2, (dishRear + 0.015 + face) / 2);
  P.addEquipment('turretDark', box(0.24, camBottom + 0.02 - (neckFoot - 0.01), 0.26), R.camX, (camBottom + 0.02 + neckFoot - 0.01) / 2,
    R.camZ);
  // the radome
  P.addEquipment('turret', cylZ(R.r, R.drumDepth, n), 0, R.y, R.z);
  P.addEquipment('turretDetail', cylZ(R.r + 0.012, 0.03, n), 0, R.y, R.z + R.drumDepth / 2 - 0.01);
  P.addEquipment('turretDetail', xform(sph(R.r - 0.01, n, Math.PI / 2), 0, 0, 0, Math.PI / 2, 0, 0, [1, R.domeDepth / R.r, 1]),
    0, R.y, R.z + R.drumDepth / 2 - 0.005);
  // the camera drum across the turret, its rear let into the body's front, a rim round its outer end
  P.addEquipment('turret', cylX(R.camR, R.camLength, n), R.camX, R.camY, R.camZ);
  P.addEquipment('turretDetail', cylX(R.camR + 0.006, 0.03, n), R.camX - R.camLength / 2 + 0.012, R.camY, R.camZ);
  // the sight (photos 02, 03): a cylindrical head forward from the drum's upper front beside the radome's rim, its top
  // at the drum's crest, its window on its face
  const sightX = R.camX - 0.04, sightY = R.camY + R.camR - R.sightR - 0.01;
  const sightRear = R.camZ + Math.sqrt(R.camR ** 2 - (sightY - R.camY) ** 2) - 0.01, sightLen = 0.24;
  P.addEquipment('turretDetail', cylZ(R.sightR, sightLen, P.q ? 20 : 14), sightX, sightY, sightRear + sightLen / 2);
  P.add('turretGlass', cylZ(R.sightR - 0.03, 0.012, P.q ? 20 : 14), sightX, sightY, sightRear + sightLen + 0.001);
  // the two boxes over the sight and the drum's crest, reaching ahead over the sight, the windows on the upper one's
  // face; the box on the radome's back, on its crest and the mount's neck
  const crest = R.camY + R.camR, lowerTop = crest + 0.075, boxZ = R.camZ + 0.20;
  P.addEquipment('turretDark', box(0.40, lowerTop - (crest - 0.015), 0.40), R.camX - 0.02, (lowerTop + crest - 0.015) / 2, boxZ);
  P.addModuleVisual('optics', 'turretDetail', box(0.46, R.sensorTopY - (lowerTop - 0.01), 0.44), R.camX - 0.02,
    (R.sensorTopY + lowerTop - 0.01) / 2, boxZ - 0.01);
  for (const dx of [-0.09, 0.09]) {
    P.add('turretGlass', box(0.12, 0.06, 0.012), R.camX - 0.02 + dx, (R.sensorTopY + lowerTop) / 2, boxZ - 0.01 + 0.22 + 0.001);
  }
  P.addEquipment('turretDetail', box(0.42, R.sensorTopY + 0.02 - (neckTop - 0.01), 0.38), 0.04,
    (R.sensorTopY + 0.02 + neckTop - 0.01) / 2, dishRear + 0.08 - 0.19);
}

/** The 3D search radar on its mast over the roof (photos 02-05): a stack of wide boxes to the top (a base, the lower
 * column, a ledge, the grilled box with a box on its right flank, the upper housing straight under the array with a box
 * on its left, a broad turntable), the bracket into the array's back, the RADWAR electronics box, and the slotted array
 * canted back. */
function addSearchRadar(P: TankBuilderPort): void {
  const { box, xform } = KIT;
  const R = SEARCH, roof = T.roofY, tilt = R.tiltDeg * DEG, z = R.mastZ;
  const level = (bucket: string, w: number, y0: number, y1: number, d: number, x = 0, dz = 0): void =>
    P.addEquipment(bucket, box(w, y1 - y0, d), x, roof + (y0 + y1) / 2, z + dz);
  level('turret', 0.56, -0.01, 0.07, 0.56);
  level('turret', R.columnW, 0.06, R.stackY0 - 0.06, R.columnW);
  level('turret', R.ledgeW, R.stackY0 - 0.07, R.stackY0 + 0.01, 0.58);
  level('turret', R.stackW, R.stackY0, R.stackY1, 0.50);
  level('turretDetail', 0.14, R.stackY0 + 0.04, R.stackY1 - 0.04, 0.40, -(R.stackW / 2 + 0.06));
  for (let k = 0; k < 7; k++) level('turretDark', 0.025, R.stackY0 + 0.05, R.stackY1 - 0.05, 0.02, -0.21 + k * 0.07, 0.25 + 0.005);
  level('turret', 0.56, R.stackY1 - 0.01, R.housingTop, 0.48);
  level('turretDetail', 0.14, R.stackY1 + 0.04, R.housingTop - 0.05, 0.30, 0.28 + 0.06);
  level('turretDark', 0.62, R.housingTop - 0.01, R.housingTop + 0.05, 0.54);
  const turntableTop = roof + R.housingTop + 0.05;
  // the array's frame: up its face (leaning back by the tilt) and out of its face (ahead and up)
  const up = new THREE.Vector3(0, Math.cos(tilt), -Math.sin(tilt)), out = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
  const centre = new THREE.Vector3(0, R.arrayCentreY, R.arrayZ);
  const at = (u: number, v: number, w: number): THREE.Vector3 =>
    centre.clone().addScaledVector(up, v).addScaledVector(out, w).add(new THREE.Vector3(u, 0, 0));
  const box3 = (bucket: string, size: P3, p: THREE.Vector3): void =>
    P.addEquipment(bucket, xform(box(size[0], size[1], size[2]), 0, 0, 0, -tilt, 0, 0), p.x, p.y, p.z);
  box3('turret', [R.arrayW, R.arrayH, R.arrayD], centre);
  // the deep housing on the array's back, half its width (photos 04, 05), let 1 cm into it, the RADWAR plate on its back,
  // and the bracket from the drive up into the housing
  const back = at(0, -0.02, -R.arrayD / 2 - R.housingD / 2 + 0.01);
  box3('turret', [R.housingW, R.housingH, R.housingD], back);
  box3('turretDetail', [0.62, 0.30, 0.012], at(0, -0.02, -R.arrayD / 2 - R.housingD + 0.005));
  const boxFoot = at(0, -0.02 - R.housingH / 2, -R.arrayD / 2 - R.housingD / 2).y;
  P.addEquipment('turret', box(0.50, boxFoot + 0.03 - (turntableTop - 0.01), 0.38), 0,
    (boxFoot + 0.03 + turntableTop - 0.01) / 2, back.z - 0.02);
  // the slotted face: seven radiating slots across it, half let into the face
  for (let k = 0; k < 7; k++) box3('turretDark', [R.arrayW - 0.12, 0.016, 0.012], at(0, -0.36 + k * 0.12, R.arrayD / 2));
}

function addRoofKit(P: TankBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  const roof = T.roofY, n = P.q ? 20 : 14;
  // the commander's PSPD-1 panoramic sight (right, -x): a tall box 0.61 m over the roof (photos 02, 04, 05), its window
  // and hood over the sensor boxes ahead,
  // and the gunner's sight head (left, +x) clear of the tracker head's left side
  P.addModuleVisual('optics', 'turretDetail', box(0.30, 0.62, 0.36), -0.48, roof - 0.01 + 0.31, 1.15);
  P.add('turretGlass', box(0.22, 0.10, 0.012), -0.48, roof + 0.49, 1.15 + 0.18 + 0.001);
  P.addEquipment('turretDark', box(0.30, 0.025, 0.08), -0.48, roof + 0.555, 1.15 + 0.18 + 0.03);
  P.addEquipment('turret', box(0.26, 0.20, 0.30), 0.62, roof + 0.09, 1.30);
  P.add('turretGlass', box(0.18, 0.07, 0.012), 0.62, roof + 0.12, 1.30 + 0.15);
  // the hatches behind them, either side of the mast
  for (const x of [-0.55, 0.55]) P.addCupola('turret', cylY(0.28, 0.29, 0.04, P.q ? 24 : 16), x, roof + 0.01, 0.40);
  // the stowage tube along the roof's right rear edge (photos 02, 04), on two saddles
  P.addEquipment('turretDetail', cylZ(0.10, 0.90, n), -0.95, roof + 0.09, -0.36);
  for (const z of [-0.68, -0.04]) P.addEquipment('turretDetail', box(0.26, 0.07, 0.08), -0.95, roof + 0.025, z);
  // the radio whips (the antenna seat role: tools/body-height-parts.mjs): one beside the radar's mast behind its housing,
  // one by the tracker head on the right (photos 02-05)
  for (const [x, z] of [[0.70, -0.72], [-0.80, 1.62]] as const) {
    P.addEquipment('turretDetail', antennaPart(cylY(0.05, 0.06, 0.08, 10)), x, roof + 0.03, z);
    P.addEquipment('turretDetail', antennaPart(cylY(0.010, 0.016, 2.20, 6)), x, roof + 1.16, z);
  }
  // the stowage box on the rear face, between the guns' tails
  P.addEquipment('turretDetail', box(1.00, 0.36, 0.26), 0, 0.72, T.rearZ - 0.12);
}

/** The skirt's slope from vertical, and a frame on it: across, up the slope, out of it (s the side). */
const SKIRT_TILT = Math.atan(T.skirtFlare / (T.breakY - T.floorY));
function skirtFrame(s: number, y: number, z: number, out: number): { at: THREE.Vector3; turn: number; up: THREE.Vector3; n: THREE.Vector3 } {
  const x = T.halfW + T.skirtFlare * (T.breakY - y) / (T.breakY - T.floorY);
  const n = new THREE.Vector3(s * Math.cos(SKIRT_TILT), Math.sin(SKIRT_TILT), 0);
  const up = new THREE.Vector3(-s * Math.sin(SKIRT_TILT), Math.cos(SKIRT_TILT), 0);
  return { at: new THREE.Vector3(s * x, y, z).addScaledVector(n, out), turn: s * SKIRT_TILT, up, n };
}

/** The two blocks of six 81 mm dischargers (pl.wikipedia; photos 01-05): a deep mounting box on the sloped skirt, a
 * third of the turret's length, two rows of three tubes three diameters long on its face, pointing out, up and ahead
 * together, outboard of and under the guns' depressed barrels. */
function addSmokeDischargers(P: TankBuilderPort): void {
  const { box, xform } = KIT;
  const S = SMOKE, mid = (S.z0 + S.z1) / 2, pitch = 0.30;
  for (const s of SIDES) {
    const mount = skirtFrame(s, 0.155, mid, 0.05);
    P.addEquipment('turret', box(0.12, 0.24, S.z1 - S.z0), mount.at.x, mount.at.y, mount.at.z, 0, 0, mount.turn);
    const face = skirtFrame(s, 0.155, mid, 0.11);
    const bore = new THREE.Vector3(s * 0.76, 0.35, 0.55).normalize();
    const turn = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), bore));
    for (const row of [-0.065, 0.05]) for (const dz of [-pitch, 0, pitch]) {
      const base = face.at.clone().addScaledVector(face.up, row).add(new THREE.Vector3(0, 0, dz));
      const tube = base.addScaledVector(bore, S.tubeLength / 2 - 0.01);
      P.addEquipment('turretDetail', xform(markSmokeTube(blindTube(S.tubeR, S.tubeR - 0.011, S.tubeLength, 0.12, P.q ? 16 : 10),
        [0, 0, 1], true), 0, 0, 0, turn.x, turn.y, turn.z), tube.x, tube.y, tube.z);
    }
  }
}

/** The left flank (photo 01): the large louvred door filling the upper wall from just under the roof to the break, over
 * the smoke dischargers' rear end, fourteen slats, hinged at its front edge, a handle at its rear; the six-slat panel on
 * the skirt under and behind it, against the dischargers' box. */
function addTurretSideKit(P: TankBuilderPort): void {
  const { box } = KIT;
  const x = T.halfW, { z0, z1, y0, y1 } = DOOR, mid = (z0 + z1) / 2, pitch = (y1 - y0 - 0.10) / 13;
  P.addEquipment('turretDetail', box(0.016, y1 - y0, z1 - z0), x + 0.005, (y0 + y1) / 2, mid);
  for (let k = 0; k < 14; k++) P.addEquipment('turretDark', box(0.030, 0.010, z1 - z0 - 0.06), x + 0.020, y0 + 0.05 + k * pitch, mid, 0, 0, 0.5);
  for (const y of [y0 + 0.12, y1 - 0.12]) P.addEquipment('turretDark', box(0.02, 0.06, 0.04), x + 0.014, y, z1 + 0.005);
  P.addEquipment('turretDark', box(0.02, 0.10, 0.025), x + 0.016, (y0 + y1) / 2, z0 + 0.03);
  const panelZ0 = 0.94, panelZ1 = SMOKE.z0 - 0.01, panelH = (T.breakY - T.floorY - 0.09) / Math.cos(SKIRT_TILT);
  const panel = skirtFrame(1, (T.floorY + T.breakY) / 2, (panelZ0 + panelZ1) / 2, 0.003);
  P.addEquipment('turretDetail', box(0.012, panelH, panelZ1 - panelZ0), panel.at.x, panel.at.y, panel.at.z, 0, 0, panel.turn);
  for (let k = 0; k < 6; k++) {
    const slat = panel.at.clone().addScaledVector(panel.up, -panelH / 2 + 0.05 + k * (panelH - 0.10) / 5).addScaledVector(panel.n, 0.009);
    P.addEquipment('turretDark', box(0.024, 0.012, panelZ1 - panelZ0 - 0.05), slat.x, slat.y, slat.z, 0, 0, panel.turn + 0.5);
  }
}

// ----------------------------------------------------------------- guns --
/** Each KDA's elevating plant (gun-local): the dark bearing ring and hub on the flank, the faceted pod, the barrel. */
function addGuns(P: TankBuilderPort): void {
  const { box, cylX, cylZ, xform } = KIT;
  const n = P.q ? 18 : 12, H = HOUSING;
  for (const s of SIDES) {
    const index = s < 0 ? 0 : 1;
    // the bearing ring (photos 01, 02) 2 cm off the flank, showing behind and under the pod, and its hub through the flank
    P.addGunExtraDark(cylX(H.discR, H.discW, P.q ? 32 : 20), s * H.discX, 0, 0);
    P.addGunExtra(cylX(0.14, 0.12, n), s * (T.halfW - 0.02), 0, 0);
    // The pod (photos 01, 02, 04, 05): the square-cut rear half (its rear edges chamfered), its outer face over a broad
    // bevel, its top rising inboard to a ridge; the long faceted front half tapering to the barrel's exit.
    const section = (z: number, x0: number, x1: number, y0: number, yo: number, yt: number, bevel: number): P3[] => [
      [x0, y0 + 0.04, z], [x0 + 0.05, y0, z], [x1 - bevel, y0, z], [x1, y0 + bevel, z], [x1, yo - 0.04, z], [x1 - 0.05, yo, z],
      [x0 + 0.14, yt, z], [x0, yt - 0.02, z],
    ];
    const { innerX: x0, outerX: x1, bottomY: y0, outerTopY: yo, topY: yt } = H;
    P.addGunExtra(convex([
      ...section(H.rearZ, x0, x1 - 0.04, y0 + 0.04, yo - 0.03, yt - 0.03, 0.10),
      ...section(H.rearZ + 0.04, x0, x1, y0, yo, yt, 0.12),
      ...section(H.shoulderZ, x0, x1, y0, yo, yt, 0.12),
      ...section(0.84, x0 + 0.045, x1 - 0.06, y0 + 0.08, yo - 0.08, yt - 0.14, 0.08),
      ...section(H.noseZ, H.noseX0, H.noseX1, H.noseY0, H.noseY1 - 0.03, H.noseY1, 0.06),
    ].map(([x, y, z]) => [s * x, y, z] as P3)));
    // the curved feed chute under the rear half (photo 01): a band 0.10 m wide from the pod's underside down round a
    // 0.13 m bend and back up toward the bearing ring
    {
      const zc = -0.14, yc = -0.235, rad = 0.13, x = s * 1.35, steps = 9;
      P.addGunExtra(box(0.10, y0 + 0.015 - (yc - 0.01), 0.025), x, (y0 + 0.015 + yc - 0.01) / 2, zc + rad);
      for (let k = 0; k < steps; k++) {
        const a0 = -k * (200 / steps) * DEG, a1 = -(k + 1) * (200 / steps) * DEG, am = (a0 + a1) / 2;
        const tz = -Math.sin(am), ty = Math.cos(am);
        P.addGunExtra(xform(box(0.10, 0.025, rad * (a0 - a1) + 0.012), 0, 0, 0, Math.atan2(-ty, tz), 0, 0),
          x, yc + rad * Math.sin(am), zc + rad * Math.cos(am));
      }
    }
    // the hinged door on the rear half's outer face and its handle (photos 01, 02)
    P.addGunExtra(box(0.014, 0.30, 0.44), s * (x1 + 0.004), 0.17, 0.06);
    P.addGunExtraDark(box(0.02, 0.03, 0.10), s * (x1 + 0.014), 0.17, 0.24);
    // The barrel (photos 02, 04): the jacket out of the nose, a clamp, the L/90 tube, the large perforated brake whose
    // face is the bore mouth, two rows of four ports round it.
    const bx = s * BORE.x, by = BORE.y, barrel = `gunBarrel${index}`, dark = `gunBarrel${index}Dark`;
    P.add(barrel, cylZ(0.068, 0.42, n), bx, by, H.noseZ + 0.16);
    P.add(dark, cylZ(0.078, 0.05, n), bx, by, H.noseZ + 0.38);
    const tubeFrom = H.noseZ + 0.40, brakeFrom = LOARA_MUZZLE_Z - BRAKE.length;
    P.add(barrel, cylZ(0.046, brakeFrom - tubeFrom + 0.02, n, 0.052), bx, by, (tubeFrom + brakeFrom) / 2);
    P.add(barrel, cylZ(BRAKE.r, BRAKE.length, P.q ? 24 : 16), bx, by, LOARA_MUZZLE_Z - BRAKE.length / 2);
    for (const z of [LOARA_MUZZLE_Z - 0.29, LOARA_MUZZLE_Z - 0.13]) for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      P.add(dark, box(0.022, 0.05, 0.08), bx + Math.cos(a) * (BRAKE.r - 0.006), by + Math.sin(a) * (BRAKE.r - 0.006), z, 0, 0, a);
    }
    P.add(dark, cylZ(0.030, 0.012, n), bx, by, LOARA_MUZZLE_Z - 0.004);
  }
  P.muzzleZ = LOARA_MUZZLE_Z;
}

export function buildLoara(P: TankBuilderPort): void {
  // the PT-91's hull and running gear; the Loara's hull carries no reactive tiles (photos 02-05), its raised deck covers the
  // B3 study's own deck fittings, the APU's housing at its rear (pl.wikipedia) stands where the B3's stern drums ride, and
  // its own curved front mudguards take the place of the B3's flat ones; its side plates hang over the road wheels
  buildPT91TwardyHull(P, {
    erawa: false, deckFittings: false, rearDrums: false, frontMudguards: false, screenFootY: LOARA_SCREEN_FOOT_Y,
  });
  addSuperstructure(P);
  addSuperstructureKit(P);
  addFrontMudguards(P);
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
  addTurretSideKit(P);
  addGuns(P);
  P.topY = T.roofY + 0.30;
  P.hullG.userData.familyRebuild = { donor: 'pt91a_twardy', revision: 1, variant: 'loara',
    features: ['raised-superstructure', 'box-turret', 'twin-kda-35', 'tracking-radar', 'search-radar-mast', 'smoke-2x6'] };
}

export const LOARA_PROFILES = {
  pza_loara: { build: buildLoara },
} as const;
