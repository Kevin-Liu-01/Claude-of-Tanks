// The Challenger 3 TD (release 262; the owner, 2026-10-27: "add these new tanks using our rigoorous tank generation
// workflow"; Main, the same day: "challenger 3 td should get a tonn of ghillie as well"): RBSL's Challenger 3 Advanced
// Technology Demonstrator in its trials fit, a Challenger 2 hull under the new turret with neither the APS nor a roof
// weapon station. Every solid here is first-party stock authored from the measured rows in
// docs/references/tanks/challenger3_td.md; the supplied model is the measurement oracle only and nothing of it ships.
//
// Frame: the rows are the oracle's own metres (+Z forward, +Y up, +X the hull's left, ground at the track's underside).
// One source-only shift, DZ, centres the fender span on the hull origin, and every add installs the rows at the
// Challenger family's 1.10 (S: the 248 ruling, one combat scale, what players see is what they hit). There is no rig
// scale: the buckets, the running gear and the pivots are all drawn at the installed size.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { KIT, muzzleBore } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { profileSkirtGeometry, type ProfileSkirt } from './profileSkirt.ts';
import { buildHollowPairedRoadWheel } from '../hollowRoadWheelStock.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';

const { box, cylX, cylY, cylZ, torus, buildRunningGear } = KIT;
type Transform = readonly [x?: number, y?: number, z?: number, rx?: number, ry?: number, rz?: number];
/** A half-space n.p <= d in the oracle frame. */
type Plane = readonly [nx: number, ny: number, nz: number, d: number];

/** The family's installed size (challenger.ts CHALLENGER3_FAMILY_SCALE, the 248 combat-scale ruling). */
const S = 1.10;
/** The oracle's fender span (3.848 front, -4.237 rear) centred on the hull origin. */
const DZ = 0.195;
/** Turret bearing (the concentric race and basket circles at z 0.451) and the race top. */
const PIVOT = [0, 1.80, 0.451] as const;
/** Trunnion: on the bore line (y 2.031), 0.85 m behind the mantlet's front face (2.40). */
const TRUNNION = [0, 2.031, 1.55] as const;
const MUZZLE_Z = 6.905;

/** The installed spec pivots (challengerSpecs.ts armorChallenger3Td) follow from the rows. */
export const CHALLENGER3_TD_FRAME = Object.freeze({
  scale: S, dz: DZ,
  turretPivot: Object.freeze([0, PIVOT[1] * S, (PIVOT[2] + DZ) * S]),
  gunPivot: Object.freeze([0, (TRUNNION[1] - PIVOT[1]) * S, (TRUNNION[2] - PIVOT[2]) * S]),
  muzzleZ: (MUZZLE_Z - TRUNNION[2]) * S,
});

/** Convex armour bounded by design planes (the Abrams pack's planeBoundedArmor law, kept here so this pack does not
 *  pull the Abrams chunk): every triple-plane vertex inside all planes, closed by ConvexGeometry. */
function planeSolid(planes: readonly Plane[]): THREE.BufferGeometry {
  const normals = planes.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const vertices: THREE.Vector3[] = [];
  for (let a = 0; a < planes.length - 2; a++) for (let b = a + 1; b < planes.length - 1; b++) {
    for (let c = b + 1; c < planes.length; c++) {
      const bc = new THREE.Vector3().crossVectors(normals[b], normals[c]);
      const det = normals[a].dot(bc);
      if (Math.abs(det) < 1e-9) continue;
      const p = bc.multiplyScalar(planes[a][3])
        .add(new THREE.Vector3().crossVectors(normals[c], normals[a]).multiplyScalar(planes[b][3]))
        .add(new THREE.Vector3().crossVectors(normals[a], normals[b]).multiplyScalar(planes[c][3]))
        .divideScalar(det);
      if (planes.some(([nx, ny, nz, d]) => nx * p.x + ny * p.y + nz * p.z - d > 1e-6)) continue;
      if (vertices.some((v) => v.distanceToSquared(p) < 1e-10)) continue;
      vertices.push(p);
    }
  }
  if (vertices.length < 4) throw new Error('challenger3_td: armour planes enclose no solid');
  const geometry = new ConvexGeometry(vertices);
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i), position.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

/** Oracle-frame placement into each owner: hull, turret (about the bearing) and gun (about the trunnion). */
function owners(P: TankBuilderPort) {
  const hull = (bucket: string, g: THREE.BufferGeometry, ...[x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0]: Transform): void =>
    P.add(bucket, g, x * S, y * S, (z + DZ) * S, rx, ry, rz, S);
  const turret = (bucket: string, g: THREE.BufferGeometry, ...[x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0]: Transform): void =>
    P.add(bucket, g, (x - PIVOT[0]) * S, (y - PIVOT[1]) * S, (z - PIVOT[2]) * S, rx, ry, rz, S);
  const gun = (bucket: string, g: THREE.BufferGeometry, ...[x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0]: Transform): void =>
    P.add(bucket, g, (x - TRUNNION[0]) * S, (y - TRUNNION[1]) * S, (z - TRUNNION[2]) * S, rx, ry, rz, S);
  return { hull, turret, gun };
}

// ---------------------------------------------------------------------------------------------------------------------
// Hull: the Challenger 2 tub, sponsons and decks as one joined loft (oracle stations, rear to front).
// row: z, belly, sponson floor, deck crown, deck edge (at |x| 1.64)
type HullRow = readonly [z: number, belly: number, floor: number, deck: number, edge: number];
const HULL_ROWS: readonly HullRow[] = [
  [-4.19, 1.78, 1.79, 1.87, 1.87],   // top of the overhung upper rear plate
  [-4.02, 1.20, 1.33, 1.875, 1.75],  // rear plate foot, the raked lower rear plate's top
  [-3.86, 0.85, 1.33, 1.89, 1.75],
  [-3.55, 0.57, 1.33, 1.92, 1.75],   // engine deck crown
  [-2.65, 0.575, 1.33, 1.895, 1.75], // held under the bustle's 1.94 floor
  [-1.95, 0.575, 1.33, 1.85, 1.74],
  [-1.60, 0.575, 1.33, 1.775, 1.735],
  [1.95, 0.575, 1.33, 1.785, 1.745], // upper glacis knee
  [2.30, 0.575, 1.33, 1.73, 1.715],  // the glacis crowns slightly between its two courses
  [2.70, 0.575, 1.33, 1.665, 1.655],
  [2.95, 0.575, 1.33, 1.55, 1.55],   // the glacis' lower 22 degree course begins
  [3.08, 0.60, 1.33, 1.497, 1.497],  // lower glacis foot
  [3.42, 1.28, 1.30, 1.375, 1.375],  // nose
];
const TUB = 0.92, SPONSON = 1.707;
/** Road-wheel stations, rear to front (the tire bottoms' clusters on both sides). */
const ROAD_WHEEL_Z = [-2.571, -1.448, -0.537, 0.540, 1.434, 2.363];
function hullRing([, belly, floor, deck, edge]: HullRow): SectionPoint[] {
  const chamfer = Math.min(0.12, floor - belly - 0.01);
  const shoulder = edge - 0.07;
  return [[-0.80, belly], [0.80, belly], [TUB, belly + chamfer], [TUB, floor], [SPONSON, floor], [SPONSON, shoulder],
    [1.64, edge], [0.60, deck], [-0.60, deck], [-1.64, edge], [-SPONSON, shoulder], [-SPONSON, floor], [-TUB, floor],
    [-TUB, belly + chamfer]];
}
/** The deck crown at z (linear between the hull rows). */
function deckAt(z: number): number {
  for (let k = 1; k < HULL_ROWS.length; k++) {
    const [z1, , , d1] = HULL_ROWS[k], [z0, , , d0] = HULL_ROWS[k - 1];
    if (z <= z1) return d0 + (d1 - d0) * (z - z0) / (z1 - z0);
  }
  return HULL_ROWS[HULL_ROWS.length - 1][3];
}

/** The skirt: one plate a side outside the track (outer face 1.743), its top stepping down aft of z -1.75 and its
 *  front panel raised over the idler (the oracle's 1.08..1.37 band forward of 3.35). */
const SKIRT: ProfileSkirt = {
  inner: 1.705, outer: 1.745,
  stations: [[-3.85, 0.94, 1.43], [-1.76, 0.94, 1.43], [-1.72, 0.95, 1.55], [3.30, 0.96, 1.55], [3.38, 1.08, 1.40],
    [3.80, 1.08, 1.30]],
};

function buildHull(P: TankBuilderPort): void {
  const { hull } = owners(P);
  hull('hull', sectionSolid(HULL_ROWS.map((row) => ({ z: row[0], ring: hullRing(row) }))));
  for (const side of [-1, 1] as const) {
    // front mudguards: the glacis plate carried over the track to the 3.80 fender line, falling with it
    hull('hull', planeSolid([
      [0, 1, 0.19, 1.37 + 0.19 * 3.42], [0, -1, -0.19, -(1.33 + 0.19 * 3.42)],
      [0, 0, 1, 3.846], [0, 0, -1, -3.40], [side, 0, 0, 1.745],
      [-side, 0, -0.4634, -2.694],                                  // inner edge, 0.91 at the bow to 1.10 at 3.44
    ]));
    // skirt plates and their top rail
    P.add('hull', profileSkirtGeometry(SKIRT, side), 0, 0, DZ * S, 0, 0, 0, S);
    hull('hullDetail', box(0.03, 0.03, 5.55), side * 1.752, 1.535, 0.95);
    hull('hullDetail', box(0.03, 0.03, 2.05), side * 1.752, 1.415, -2.80);
    for (const z of [-3.30, -2.30, -1.30, -0.30, 0.70, 1.70, 2.70]) hull('hullDetail', box(0.02, 0.05, 0.05), side * 1.752, 1.03, z);
    // rear stowage bins on the fenders behind the skirt
    hull('hullPaintedDetail', box(0.50, 0.28, 0.37), side * 1.42, 1.44, -4.135);
    hull('hullDetail', box(0.16, 0.10, 0.04), side * 1.30, 1.44, -4.34);
    const lamp = box(0.12, 0.06, 0.012);
    markVehicleNightLens(lamp, 'marker');
    hull('hullGlass', lamp, side * 1.30, 1.44, -4.365);
    // the skirt-top hooks ahead of and behind the turret
    for (const z of [2.60, -1.60]) hull('hullDetail', box(0.12, 0.10, 0.30), side * 1.80, 1.50, z);
    // Hydrogas units on the hull side above each station, inboard of the track
    for (const z of ROAD_WHEEL_Z) hull('hullRunningGearDark', box(0.15, 0.35, 0.34), side * 1.005, 1.025, z);
    // headlight clusters and guards on the glacis corners
    KIT.headlight(P, side * 0.55 * S, 1.43 * S, (3.31 + DZ) * S, -0.2, 0.06);
    hull('hullDetail', box(0.03, 0.16, 0.20), side * 0.66, 1.43, 3.27, -0.2);
    hull('hullDetail', box(0.03, 0.16, 0.20), side * 0.44, 1.43, 3.27, -0.2);
    // towing eyes on the lower glacis
    hull('hullDark', torus(0.07, 0.022, 12), side * 0.52, 0.86, 3.23, 0.4, Math.PI / 2, 0);
    hull('hullDetail', box(0.10, 0.12, 0.08), side * 0.52, 0.86, 3.20, -0.48);
    // engine-deck louvres on the flat crown either side of the centre access plate
    for (const z of [-2.35, -3.20]) {
      const y = deckAt(z);
      hull('hullDark', box(0.34, 0.012, 0.62), side * 0.39, y + 0.004, z);
      for (let k = 0; k < 6; k++) hull('hullDetail', box(0.34, 0.016, 0.03), side * 0.39, y + 0.012, z - 0.25 + k * 0.10);
    }
    // the external fuel drums lying across the stern
    hull('hullPaintedDetail', cylX(0.29, 0.86, P.q ? 20 : 12), side * 0.84, 1.55, -4.62);
    for (const dx of [-0.30, 0.30]) hull('hullDark', cylX(0.296, 0.035, P.q ? 20 : 12), side * 0.84 + dx, 1.55, -4.62);
    hull('hullDetail', box(0.05, 0.62, 0.05), side * 0.36, 1.53, -4.33);
  }
  // the drums' cradle between them, its rear plate brackets, the stern pole above it and the overhung rear deck lip
  hull('hullDetail', box(0.60, 0.60, 0.40), -0.05, 1.60, -4.55);
  hull('hullDetail', box(0.20, 0.10, 0.30), -0.25, 1.94, -4.55);
  hull('hullDetail', box(2.0, 0.06, 0.08), 0, 1.24, -4.34);
  hull('hullDark', cylY(0.022, 0.022, 0.88, 8), 0, 2.185, -4.77, -0.50, 0, 0);
  hull('hull', box(3.24, 0.08, 0.19), 0, 1.84, -4.265);
  // driver's hatch, periscope and the glacis' lifting eyes
  P.addHatch('hullHatch', box(0.62, 0.045, 0.52).scale(S, S, S), 0, 1.81 * S, (1.78 + DZ) * S);
  KIT.periscope(P, 'hullDetail', 0, (deckAt(2.10) + 0.035) * S, (2.10 + DZ) * S);
  for (const side of [-1, 1]) KIT.liftEye(P, 'hullDetail', side * 1.25 * S, 1.62 * S, (2.70 + DZ) * S);
  // rear plate: tow cable and its cleats
  KIT.towCable(P, [[-0.70, 1.46, -4.13], [-0.30, 1.40, -4.12], [0, 1.39, -4.12], [0.30, 1.40, -4.12], [0.70, 1.46, -4.13]]
    .map(([x, y, z]) => [x * S, y * S, (z + DZ) * S] as [number, number, number]));
  for (const side of [-1, 1]) hull('hullDetail', box(0.08, 0.08, 0.05), side * 0.70, 1.48, -4.12);
}

// ---------------------------------------------------------------------------------------------------------------------
// Running gear: six Hydrogas stations on the oracle's uneven pitch, front idler, rear sprocket, three return rollers.
function buildGear(P: TankBuilderPort): void {
  const z = (v: number): number => (v + DZ) * S;
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.40 * S, wheelW: 0.44 * S, wheelY: 0.478 * S, xc: 1.387 * S,
    roadWheelGeometry: buildHollowPairedRoadWheel({ radiusM: 0.40 * S, high: Boolean(P.q), fasteners: 8,
      fastenersAsInsets: true, axialWidthM: 0.44 * S }),
    wheelZs: ROAD_WHEEL_Z.map(z).reverse(),
    sprocket: { z: z(-3.414), y: 0.859 * S, r: 0.35 * S }, idler: { z: z(3.304), y: 0.946 * S, r: 0.31 * S },
    rollers: [1.945, 0.0, -2.0].map((r) => ({ z: z(r), y: 1.047 * S, r: 0.11 * S })),
    trackW: 0.585 * S, topY: 1.235 * S, contactZF: z(2.55), contactZR: z(-2.75),
    fitLoadedRun: true, shoeRadialScale: 0.55, paintedEnds: true, coveredTop: 1.20 * S,
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Turret: three convex volumes in the oracle frame. The main body ends at the 1.66 face behind the mantlet; the two
// cheeks run forward of it either side of the 0.88 m gun slot. Every face is a measured plane (packet, turret rows).
const ROOF: Plane = [0, 1, -0.0414, 2.6959];            // 2.70 at z 0.1, falling to 2.57 at the rear
const FLOOR: Plane = [0, -1, -0.0177, -1.8854];         // 1.85 under the cheeks to 1.935 under the bustle
const NOSE_UNDER: Plane = [0, -1, 1.2, 0.79];           // the cheek noses' underside chamfer (1.85 at 2.2, 2.09 at 2.4)
const REAR: Plane = [0, -0.258, -1, 2.3595];            // raked rear face, -2.86 at the floor to -3.02 at the roof
const SLOT_BROW: Plane = [0, 1, 0.25, 2.81];            // the brow over the slot, 2.41 at the 1.6 face
const sidePlanes = (s: number): Plane[] => [
  [s * 0.62, 0.053, 0, 0.9769],                          // side wall, 1.415 at the floor leaning to 1.362 at 2.50
  [s * 0.145, 0.19, 0, 0.676],                           // roof-edge chamfer to 1.17 at 2.665
  [s, 2.07, 1.53, 8.073],                                // cheek face, 56 degrees off the axis, 36 degrees up
  [s, 5.93, 1.53, 17.145],                               // cheek brow above 2.35, 14 degrees up to the roof
];
const SLOT_HALF = 0.44, SLOT_FACE = 1.66;
function buildTurret(P: TankBuilderPort): void {
  const { turret } = owners(P);
  const common = [ROOF, FLOOR, NOSE_UNDER, REAR, SLOT_BROW, ...sidePlanes(1), ...sidePlanes(-1)];
  turret('turret', planeSolid([...common, [0, 0, 1, SLOT_FACE]]));
  for (const side of [-1, 1]) turret('turret', planeSolid([...common, [-side, 0, 0, -SLOT_HALF], [0, 0, -1, -1.2]]));
  // the bearing race and its collar under the floor (covers the hull-to-turret gap at every bearing)
  turret('turret', cylY(1.15, 1.15, 0.10, P.q ? 64 : 32), 0, 1.835, 0.451);
  turret('turretDark', cylY(1.17, 1.17, 0.02, P.q ? 64 : 32), 0, 1.79, 0.451);

  // gunner's primary sight: the armoured box on the right front of the roof, its window to the front
  turret('turretDetail', box(0.45, 0.20, 0.32), -0.675, 2.73, 0.56);
  const gunnerPane = box(0.30, 0.11, 0.02);
  turret('turretGlass', gunnerPane, -0.675, 2.74, 0.725);
  // commander's cupola: the race, the hatch and eight vision blocks, on the right behind the sight
  turret('turretCupola', cylY(0.48, 0.50, 0.20, P.q ? 32 : 16), -0.53, 2.765, -0.68);
  P.addHatch('turretHatch', cylY(0.38, 0.38, 0.05, P.q ? 28 : 14).scale(S, S, S), -0.53 * S, (2.89 - PIVOT[1]) * S,
    (-0.68 - PIVOT[2]) * S);
  turret('turretDetail', box(0.14, 0.05, 0.10), -0.53, 2.925, -1.03);
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) / 8 * Math.PI * 2;
    KIT.periscope(P, 'turretDetail', (-0.53 + Math.sin(a) * 0.47) * S, (2.83 - PIVOT[1]) * S,
      (-0.68 + Math.cos(a) * 0.47 - PIVOT[2]) * S, a);
  }
  // commander's primary sight: the octagonal pedestal at the roof's rear centre and its stabilised head
  turret('turretDetail', cylY(0.33, 0.35, 0.40, 8), -0.175, 2.83, -1.825, 0, Math.PI / 8, 0);
  // head: front and rear top edges chamfered (3.36 at the window, 3.30 at the back)
  turret('turretDetail', planeSolid([[0, 1, 0, 3.42], [0, -1, 0, -3.03], [0, 0, 1, -1.64], [0, 0, -1, 2.04],
    [1, 0, 0, 0.07], [-1, 0, 0, 0.42], [0, 1, -1, 5.34], [0, 1, 1, 1.72]]));
  const commanderPane = box(0.34, 0.13, 0.02);
  turret('turretGlass', commanderPane, -0.175, 3.22, -1.635);
  turret('turretDark', box(0.40, 0.02, 0.36), -0.175, 3.04, -1.84);
  // the mast on the roof's left rear, beside the commander's sight
  turret('turretDetail', cylY(0.035, 0.04, 0.45, 10), 0.475, 2.82, -2.275);
  // loader's hatch on the left and its hinges
  turret('turretDetail', box(0.56, 0.05, 0.64), 0.70, 2.69, -0.58);
  P.addHatch('turretHatch', box(0.50, 0.04, 0.58).scale(S, S, S), 0.70 * S, (2.73 - PIVOT[1]) * S, (-0.58 - PIVOT[2]) * S);
  for (const x of [0.50, 0.90]) turret('turretDetail', box(0.06, 0.06, 0.10), x, 2.74, -0.29);
  KIT.periscope(P, 'turretDetail', 0.70 * S, (2.67 - PIVOT[1]) * S, (0.55 - PIVOT[2]) * S);
  // smoke dischargers: a bank of five low on each cheek face (3 under 2), facing out along the face's 0.58 rad normal
  for (const side of [-1, 1]) {
    const yaw = side * 0.58;
    const faceZ = (x: number, y: number): number => (8.073 - x - 2.07 * y) / 1.53;
    turret('turretDetail', box(0.34, 0.20, 0.08), side * 0.95, 2.03, faceZ(0.95, 2.03) + 0.02, 0, yaw, 0);
    for (const [col, row] of [[-1, 0], [0, 0], [1, 0], [-0.5, 1], [0.5, 1]]) {
      const x = 0.95 + col * 0.085 * Math.cos(0.58), y = 1.99 + row * 0.085;
      turret('turretDetail', markSmokeTube(cylZ(0.036, 0.22, 8)), side * x, y, faceZ(x, y) + 0.06, -0.45, yaw, 0);
    }
  }
  // the turret's side rails, bolt heads and lifting eyes; the two whips at the bustle's rear corners
  for (const side of [-1, 1]) {
    turret('turretDetail', box(0.03, 0.035, 3.10), side * 1.389, 2.36, -1.05);
    for (const z of [-2.40, -1.60, -0.70, 0.20]) turret('turretDetail', cylX(0.04, 0.02, 10), side * 1.392, 2.18, z);
    KIT.liftEye(P, 'turretDetail', side * 1.10 * S, (2.53 - PIVOT[1]) * S, (0.70 - PIVOT[2]) * S);
    KIT.liftEye(P, 'turretDetail', side * 1.10 * S, (2.59 - PIVOT[1]) * S, (-2.70 - PIVOT[2]) * S);
    const x = side > 0 ? 1.021 : -0.985;
    turret('turretDetail', cylY(0.055, 0.065, 0.08, 10), x, 2.62, -2.25);
    turret('turretDark', cylY(0.008, 0.012, 2.74, 6), x, 4.03, -2.25);
  }
  turret('turretPaintedDetail', box(1.10, 0.04, 0.40), 0, 2.585, -2.75);
}

// ---------------------------------------------------------------------------------------------------------------------
// Gun: the deep mantlet that fills the slot and pitches with the gun, the coax above-left of it, and the 120 mm L55A1.
function buildMainGun(P: TankBuilderPort): void {
  const { gun } = owners(P);
  const mantlet = sectionSolid(([[1.40, 1.80, 2.42], [2.05, 1.80, 2.42], [2.40, 1.875, 2.26]] as const)
    .map(([z, bottom, top]) => ({ z, ring: [[-0.42, bottom], [0.42, bottom], [0.42, top], [-0.42, top]] as SectionPoint[] })));
  gun('gunMount', mantlet);
  gun('gunMountDark', box(0.86, 0.04, 0.05), 0, 1.86, 2.39);
  // coax: its port in the mantlet's face, left of and above the bore, and the barrel's mouth in it
  gun('gunMountDark', cylZ(0.034, 0.03, 10), 0.285, 2.185, 2.395);
  gun('gunMountDark', cylZ(0.022, 0.10, 8), 0.285, 2.185, 2.38);
  // the root thermal jacket, bore evacuator and the clamp band on the tube (they recoil with it)
  const len = (MUZZLE_Z - TRUNNION[2]) * S;
  KIT.buildGun(P, { len, r: 0.095 * S, sleeve: false, evac: (3.55 - TRUNNION[2]) / (MUZZLE_Z - TRUNNION[2]),
    evacR: 1.75, collar: false, baseR: 0.15 * S });
  gun('gun', cylZ(0.14, 0.73, P.q ? 24 : 12), 0, 2.031, 2.765);
  gun('gun', cylZ(0.112, 0.08, P.q ? 24 : 12), 0, 2.031, 5.40);
  gun('gunDark', box(0.10, 0.06, 0.12), 0, 2.15, 6.70);
  muzzleBore(P, { len, r: 0.095 * S });
}

// ---------------------------------------------------------------------------------------------------------------------
function* buildChallenger3TdSteps(P: TankBuilderPort): TankProfileBuild {
  buildGear(P);
  yield 'challenger3_td running gear';
  buildHull(P);
  yield 'challenger3_td hull';
  buildTurret(P);
  buildMainGun(P);
  yield 'challenger3_td turret';
  P.decal('turret', 'number', P.spec.visual.number || 'TD', 0.34 * S, [1.395 * S, 0.40 * S, -1.95 * S], Math.PI / 2, 0, 0.05);
  P.decal('turret', 'number', P.spec.visual.number || 'TD', 0.34 * S, [-1.395 * S, 0.40 * S, -1.95 * S], -Math.PI / 2, 0, -0.05);
  P.topY = 1.80 * S;
  addVehicleGhillieSuit(P);
}

export const buildChallenger3Td = steppedBuilder(buildChallenger3TdSteps);
