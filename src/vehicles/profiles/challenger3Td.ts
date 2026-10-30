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
import { FITTINGS, KIT, muzzleBore } from './kit.ts';
import { beginAuxiliaryStation } from './auxiliaryStation.ts';
import { addPintleAmmo, addPintleBarrel, addPintleReceiver, createPintleLayout } from '../machineGunGeometry.ts';
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
// row: z, belly, sponson floor, deck crown, deck edge (at |x| 1.64), the centre trough's depth under the crown
type HullRow = readonly [z: number, belly: number, floor: number, deck: number, edge: number, trough: number];
const NO_TROUGH = 0.002;
const HULL_ROWS: readonly HullRow[] = [
  [-4.19, 1.78, 1.79, 1.87, 1.87, NO_TROUGH],   // top of the overhung upper rear plate
  [-4.02, 1.20, 1.33, 1.875, 1.75, NO_TROUGH],  // rear plate foot, the raked lower rear plate's top
  [-3.86, 0.85, 1.33, 1.89, 1.75, NO_TROUGH],
  [-3.55, 0.57, 1.33, 1.92, 1.75, NO_TROUGH],   // engine deck crown
  [-2.65, 0.575, 1.33, 1.895, 1.75, NO_TROUGH], // held under the bustle's 1.94 floor
  [-1.95, 0.575, 1.33, 1.85, 1.74, NO_TROUGH],
  [-1.60, 0.575, 1.33, 1.775, 1.735, NO_TROUGH],
  [1.53, 0.575, 1.33, 1.785, 1.745, NO_TROUGH],
  // the driver's well and the trough down the glacis' centreline (|x| < 0.45): the gun depresses into it
  [1.55, 0.575, 1.33, 1.785, 1.745, 0.185],
  [1.95, 0.575, 1.33, 1.785, 1.745, 0.165],     // upper glacis knee
  [2.30, 0.575, 1.33, 1.73, 1.715, 0.136],      // the glacis crowns slightly between its two courses
  [2.70, 0.575, 1.33, 1.665, 1.655, 0.15],
  [2.95, 0.575, 1.33, 1.55, 1.55, 0.075],       // the glacis' lower 22 degree course begins
  [3.08, 0.60, 1.33, 1.497, 1.497, 0.05],       // lower glacis foot
  [3.42, 1.28, 1.30, 1.375, 1.375, NO_TROUGH],  // nose
];
const TUB = 0.92, SPONSON = 1.707, TROUGH = 0.45;
/** Road-wheel stations, rear to front (the tire bottoms' clusters on both sides). */
const ROAD_WHEEL_Z = [-2.571, -1.448, -0.537, 0.540, 1.434, 2.363];
/** The oracle's Hydrogas unit (Object_17), one casting at every station, (z about the wheel centre, y) counter-clockwise:
 *  the web slanting from over the wheel down to the 0.555 sill ahead of it, and the pivot block ahead with its chamfered
 *  front; |x| from the tub wall to the track lane's inner edge (the oracle's 0.924-1.105). */
const UNIT_WEB = [[-0.273, 0.764], [0.273, 0.555], [0.273, 0.791], [0, 0.873], [-0.273, 0.900]] as const;
const UNIT_BLOCK = [[0.273, 0.555], [0.564, 0.555], [0.582, 0.573], [0.582, 0.764], [0.518, 0.927], [0.327, 0.927],
  [0.273, 0.809]] as const;
const UNIT_X = [0.915, 1.090] as const;
function unitPlanes(profile: readonly (readonly [number, number])[], side: number, wheelZ: number): Plane[] {
  const planes: Plane[] = side > 0 ? [[1, 0, 0, UNIT_X[1]], [-1, 0, 0, -UNIT_X[0]]] : [[-1, 0, 0, UNIT_X[1]], [1, 0, 0, -UNIT_X[0]]];
  for (let i = 0; i < profile.length; i++) {
    const [z0, y0] = profile[i], [z1, y1] = profile[(i + 1) % profile.length];
    const ny = -(z1 - z0), nz = y1 - y0;
    planes.push([0, ny, nz, ny * y0 + nz * (z0 + wheelZ)]);
  }
  return planes;
}
function hullRing([, belly, floor, deck, edge, trough]: HullRow): SectionPoint[] {
  const chamfer = Math.min(0.12, floor - belly - 0.01);
  const shoulder = edge - 0.07;
  return [[-0.80, belly], [0.80, belly], [TUB, belly + chamfer], [TUB, floor], [SPONSON, floor], [SPONSON, shoulder],
    [1.64, edge], [0.60, deck], [TROUGH, deck], [TROUGH, deck - trough], [-TROUGH, deck - trough], [-TROUGH, deck],
    [-0.60, deck], [-1.64, edge], [-SPONSON, shoulder], [-SPONSON, floor], [-TUB, floor], [-TUB, belly + chamfer]];
}
/** The trough's floor at z (the deck crown less the trough, linear between the rows). */
function troughAt(z: number): number {
  for (let k = 1; k < HULL_ROWS.length; k++) {
    const r1 = HULL_ROWS[k], r0 = HULL_ROWS[k - 1];
    if (z <= r1[0]) { const t = (z - r0[0]) / (r1[0] - r0[0]); return r0[3] - r0[5] + (r1[3] - r1[5] - r0[3] + r0[5]) * t; }
  }
  return HULL_ROWS[HULL_ROWS.length - 1][3];
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
      [-side, 0, 0, -0.95],                                         // inner edge straight at 0.95 (the oracle's, z 3.46-3.82)
    ]));
    // skirt plates and their top rail
    P.add('hull', profileSkirtGeometry(SKIRT, side), 0, 0, DZ * S, 0, 0, 0, S);
    hull('hullDetail', box(0.03, 0.03, 5.105), side * 1.752, 1.535, 0.7275);           // to 3.28, where the skirt drops
    // the rear skirt's rail stands flush with its plates (3 mm proud): under the bustle's sweep the suit's drapes are tied
    // low and hang plumb from the rail's line, so a proud rail left them 2 cm off the skirt (ghillieSuit.selftest)
    hull('hullDetail', box(0.03, 0.03, 2.05), side * 1.737, 1.415, -2.80);
    // the skirt's top fittings, the oracle's: bolt heads under the top edge and three brackets standing over it
    for (const [z, y] of [[-3.532, 1.346], [-2.503, 1.348], [-0.506, 1.365], [1.51, 1.365], [3.318, 1.32]]) {
      hull('hullDetail', box(0.02, 0.013, 0.055), side * 1.753, y, z);
    }
    for (const [z, y0, y1] of [[-0.908, 1.477, 1.612], [0.508, 1.358, 1.612], [1.898, 1.45, 1.585]]) {
      hull('hullDetail', box(0.03, y1 - y0, 0.10), side * 1.760, (y0 + y1) / 2, z);
    }
    // rear stowage bins on the fenders behind the skirt
    hull('hullPaintedDetail', box(0.50, 0.28, 0.37), side * 1.42, 1.44, -4.135);
    hull('hullDetail', box(0.16, 0.10, 0.04), side * 1.30, 1.44, -4.34);
    const lamp = box(0.12, 0.06, 0.012);
    markVehicleNightLens(lamp, 'marker');
    hull('hullGlass', lamp, side * 1.30, 1.44, -4.365);
    // the skirt-top hooks ahead of and behind the turret, the skirt's panel joints, the fender lockers and the tow cable
    // the oracle's hook blocks: 1.745-1.849 out, 1.41-1.57 high, z -1.72..-1.39 and 2.39..2.76
    hull('hullDetail', box(0.104, 0.156, 0.33), side * 1.797, 1.489, -1.552);
    hull('hullDetail', box(0.104, 0.145, 0.37), side * 1.797, 1.4955, 2.578);
    for (const z of [-2.62, -1.20, 0.10, 1.40, 2.70]) hull('hullDark', box(0.012, 0.45, 0.025), side * 1.749, 1.175, z);
    for (const z of [2.20, 0.95, -0.35, -1.45, -2.55]) hull('hullDetail', cylY(0.12, 0.12, 0.05, P.q ? 20 : 12), side * 1.46, 1.735, z);
    // the cable lies on the hull top's edge and follows it down the glacis to the front (the oracle's 1.52 at z 3.0)
    KIT.towCable(P, [[1.64, 1.55, 3.00], [1.65, 1.635, 2.40], [1.66, 1.72, 1.60], [1.67, 1.725, 0.0], [1.67, 1.73, -3.30]]
      .map(([x, y, z]) => [side * x * S, y * S, (z + DZ) * S] as [number, number, number]));
    // the mudguards' front lip, folded down to 1.10 (the oracle's), and the lamp guard blocks across the glacis edge
    // (the oracle's 1.54 band at z 3.14-3.26 over x 0.92-1.40) with their indicator lamps
    hull('hull', box(0.86, 0.19, 0.025), side * 1.35, 1.195, 3.834);
    hull('hullPaintedDetail', box(0.48, 0.16, 0.12), side * 1.16, 1.47, 3.20);
    const indicator = box(0.08, 0.05, 0.012);
    markVehicleNightLens(indicator, 'marker');
    hull('hullGlass', indicator, side * 1.32, 1.50, 3.266);
    // Hydrogas units on the hull side at each station, inboard of the track (the oracle's Object_17 casting)
    for (const z of ROAD_WHEEL_Z) for (const profile of [UNIT_WEB, UNIT_BLOCK]) {
      hull('hullRunningGearDark', planeSolid(unitPlanes(profile, side, z)));
    }
    // headlight clusters and guards on the glacis corners
    KIT.headlight(P, side * 0.55 * S, 1.43 * S, (3.31 + DZ) * S, -0.2, 0.06);
    hull('hullDetail', box(0.03, 0.16, 0.20), side * 0.66, 1.43, 3.27, -0.2);
    hull('hullDetail', box(0.03, 0.16, 0.20), side * 0.44, 1.43, 3.27, -0.2);
    // towing eyes on the lower glacis
    hull('hullDark', torus(0.07, 0.022, 12), side * 0.52, 0.86, 3.23, 0.4, Math.PI / 2, 0);
    hull('hullDetail', box(0.10, 0.12, 0.08), side * 0.52, 0.86, 3.20, -0.48);
    // the engine deck's long grille field on the flat crown, either side of the centre access plate
    for (const z of [-2.15, -2.75, -3.35]) {
      const y = deckAt(z);
      hull('hullDark', box(0.34, 0.012, 0.56), side * 0.39, y + 0.004, z);
      for (let k = 0; k < 6; k++) hull('hullDetail', box(0.34, 0.016, 0.03), side * 0.39, y + 0.012, z - 0.23 + k * 0.092);
    }
    // the external fuel drums lying across the stern, on the oracle's Object_16/18 (inner ends at 0.365, the end
    // faces 0.598 across about z -4.585, the hoops to 1.224-1.844)
    hull('hullPaintedDetail', cylX(0.30, 0.928, P.q ? 20 : 12), side * 0.829, 1.534, -4.585);
    for (const dx of [-0.30, 0.30]) hull('hullDark', cylX(0.306, 0.035, P.q ? 20 : 12), side * 0.829 + dx, 1.534, -4.585);
    hull('hullDetail', box(0.05, 0.62, 0.05), side * 0.36, 1.53, -4.33);
    // final-drive covers behind the sprockets (the rear plate stands vertical to 0.75 outboard) and the tow hooks
    hull('hull', box(0.30, 0.50, 0.42), side * 0.77, 1.00, -3.81);
    hull('hullDetail', box(0.10, 0.14, 0.16), side * 0.75, 1.10, -4.10);
  }
  // the drums' cradle between them, its rear plate brackets, the stern pole above it and the overhung rear deck lip
  // (the cradle's left face on the oracle's Object_13 at 0.351, 1.4 cm short of the drum: no plan slot for §B2)
  hull('hullDetail', box(0.701, 0.60, 0.40), 0.0005, 1.60, -4.55);
  hull('hullDetail', box(0.20, 0.10, 0.30), -0.25, 1.94, -4.55);
  hull('hullDetail', box(0.42, 0.25, 0.30), 0.11, 1.455, -4.90);
  hull('hullDetail', box(2.0, 0.06, 0.08), 0, 1.24, -4.34);
  hull('hullDark', cylY(0.0245, 0.0245, 0.83, 8), -0.0055, 2.19, -4.77, -0.51, 0, 0);   // the oracle's Object_2 bounds
  hull('hull', box(3.24, 0.08, 0.19), 0, 1.84, -4.265);
  // driver's hatch, periscope and the glacis' lifting eyes
  P.addHatch('hullHatch', box(0.62, 0.045, 0.40).scale(S, S, S), 0, (troughAt(1.75) + 0.0225) * S, (1.75 + DZ) * S);
  KIT.periscope(P, 'hullDetail', 0, (troughAt(2.10) + 0.035) * S, (2.10 + DZ) * S);
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
    // the end wheels' castings narrowed to the oracle's 1.795 outer face (the sprocket's hub sits inside its rim there;
    // the stock casting's boss stood out to 1.85, past the track): the rolling radii and the track lane are unchanged
    sprocket: { z: z(-3.414), y: 0.859 * S, r: 0.35 * S, axialScaleLeft: 0.83, axialScaleRight: 0.83 },
    idler: { z: z(3.304), y: 0.946 * S, r: 0.31 * S, axialScaleLeft: 0.91, axialScaleRight: 0.91 },
    rollers: [1.945, 0.0, -2.0].map((r) => ({ z: z(r), y: 1.047 * S, r: 0.11 * S })),
    trackW: 0.585 * S, topY: 1.235 * S, contactZF: z(2.55), contactZR: z(-2.75),
    fitLoadedRun: true, shoeRadialScale: 0.55, paintedEnds: true, coveredTop: 1.20 * S,
    // the trailing arms on the units' outer faces (installed metres): arm and axle boss in the track lane's shadow at
    // |x| 1.206-1.257, so nothing inboard of the track reaches under the units' 0.61 m sill (the oracle draws no arm
    // there), and the pivot boss back through the unit's block to the tub wall; the pattern's own lift and trail
    suspensionDimensions: {
      armWidthM: 0.05, armHeightM: 0.15, armAxleHeightM: 0.13, armCenterAbsXM: 1.231,
      anchorBossWidthM: 0.246, anchorBossRadiusM: 0.075, anchorBossCenterAbsXM: 1.133,
      axleBossWidthM: 0.052, axleBossRadiusM: 0.075, axleBossCenterAbsXM: 1.231,
      anchorLiftM: 0.82 * 0.40 * S, anchorTrailM: 1.05 * 0.40 * S,
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Turret: three convex volumes in the oracle frame. The main body ends at the 1.66 face behind the mantlet; the two
// cheeks run forward of it either side of the 0.88 m gun slot. Every face is a measured plane (packet, turret rows).
const ROOF: Plane = [0, 1, -0.0414, 2.6959];            // 2.70 at z 0.1, falling to 2.57 at the rear
const FLOOR: Plane = [0, -1, -0.0177, -1.8854];         // 1.85 under the cheeks to 1.935 under the bustle
const NOSE_UNDER: Plane = [0, -1, 1.2, 0.79];           // the cheek noses' underside chamfer (1.85 at 2.2, 2.09 at 2.4)
const REAR: Plane = [0, -0.258, -1, 2.3595];            // raked rear face, -2.86 at the floor to -3.02 at the roof
const SLOT_BROW: Plane = [0, 1, 0.2, 2.73];             // the brow over the slot, 2.41 at the 1.6 face, 2.57 at 0.8
const sidePlanes = (s: number): Plane[] => [
  [s * 0.62, 0.053, 0, 0.9769],                          // side wall, 1.415 at the floor leaning to 1.362 at 2.50
  [s * 0.145, 0.19, 0, 0.676],                           // roof-edge chamfer to 1.17 at 2.665
  [s, 2.07, 1.53, 8.073],                                // cheek face, 56 degrees off the axis, 36 degrees up
  [s, 5.93, 1.53, 17.145],                               // cheek brow above 2.35, 14 degrees up to the roof
];
const SLOT_HALF = 0.44, SLOT_FACE = 1.66, ROOF_STEP = 0.45;
function buildTurret(P: TankBuilderPort): void {
  const { turret } = owners(P);
  const common = [ROOF, FLOOR, NOSE_UNDER, REAR, SLOT_BROW, ...sidePlanes(1), ...sidePlanes(-1)];
  // the roof proper ends in a low step at z 0.45; ahead of it the brow plate stands at 2.571 to the slot face
  turret('turret', planeSolid([...common, [0, 0, 1, ROOF_STEP]]));
  turret('turret', planeSolid([...common, [0, 0, -1, -ROOF_STEP], [0, 0, 1, SLOT_FACE], [0, 1, 0, 2.571]]));
  for (const side of [-1, 1]) turret('turret', planeSolid([...common, [-side, 0, 0, -SLOT_HALF], [0, 0, -1, -1.2]]));
  // the slot's receipt (gunHullClearance.test-support.mjs gunSlotProbe): its face and half-width in the turret frame
  P.turretG.userData.gunSlot = Object.freeze({ faceZ: (SLOT_FACE - PIVOT[2]) * S, halfWidth: SLOT_HALF * S });
  // the hinge frame over the mantlet's top edge at the slot face: two posts on the cheeks' inner edges (the oracle's
  // 2.50 tops at x 0.46, z 1.60) and the bar between them, clear of the mantlet's top at full elevation
  for (const x of [-0.46, 0.46]) turret('turretDetail', box(0.07, 0.11, 0.12), x, 2.475, 1.60);
  turret('turretDark', cylX(0.022, 0.86, 10), 0, 2.50, 1.60);
  // the bearing race and its collar under the floor (covers the hull-to-turret gap at every bearing)
  turret('turret', cylY(1.15, 1.15, 0.10, P.q ? 64 : 32), 0, 1.835, 0.451);
  turret('turretDark', cylY(1.17, 1.17, 0.02, P.q ? 64 : 32), 0, 1.79, 0.451);

  // gunner's primary sight: one armoured assembly on the right front of the roof, a low base over the roof's step and
  // the head on its front with a raked window face (2.79 at its rear, 2.83 forward)
  turret('turretDetail', planeSolid([[0, 1, 0, 2.75], [0, -1, 0, -2.55], [0, 0, 1, 0.47], [0, 0, -1, 0.10],
    [1, 0, 0, -0.42], [-1, 0, 0, 0.95]]));
  turret('turretDetail', planeSolid([[0, 1, -0.4, 2.83 - 0.4 * 0.68], [0, -1, 0, -2.56], [0, 0, 1, 0.74], [0, 0, -1, -0.40],
    [1, 0, 0, -0.45], [-1, 0, 0, 0.90], [0, 0.5, 1, 0.5 * 2.83 + 0.70]]));
  const gunnerPane = box(0.30, 0.10, 0.02);
  turret('turretGlass', gunnerPane, -0.675, 2.735, 0.715, -0.46, 0, 0);
  // commander's cupola: the race, the hatch and eight vision blocks, on the right behind the sight
  // the cupola: a D-shaped base plate (its straight edge inboard), the periscope ring on it and the flat lid
  turret('turretCupola', planeSolid([[0, 1, 0, 2.73], [0, -1, 0, -2.64], [1, 0, 0, -0.04], [-1, 0, 0, 1.06],
    [0, 0, 1, -0.12], [0, 0, -1, 1.20], [0.71, 0, 0.71, 0.71 * (-0.04 - 0.30) + 0.71 * -0.12],
    [0.71, 0, -0.71, 0.71 * (-0.04 - 0.30) - 0.71 * -1.20]]));
  turret('turretCupola', cylY(0.40, 0.42, 0.13, P.q ? 32 : 16), -0.55, 2.795, -0.66);
  P.addHatch('turretHatch', cylY(0.33, 0.35, 0.04, P.q ? 28 : 14).scale(S, S, S), -0.55 * S, (2.88 - PIVOT[1]) * S,
    (-0.66 - PIVOT[2]) * S);
  // the lid: flat, 2.94 over the ring's 2.91 (the oracle's; a domed lid read as a bubble)
  turret('turretDetail', cylY(0.30, 0.31, 0.06, P.q ? 24 : 12), -0.55, 2.91, -0.66);
  turret('turretDetail', box(0.14, 0.05, 0.10), -0.55, 2.915, -0.98);
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) / 8 * Math.PI * 2;
    KIT.periscope(P, 'turretDetail', (-0.55 + Math.sin(a) * 0.41) * S, (2.83 - PIVOT[1]) * S,
      (-0.66 + Math.cos(a) * 0.41 - PIVOT[2]) * S, a);
  }
  // commander's primary sight: the octagonal pedestal at the roof's rear centre and its stabilised head
  turret('turretDetail', cylY(0.36, 0.37, 0.40, 8), -0.175, 2.83, -1.825, 0, Math.PI / 8, 0);
  // head: front and rear top edges chamfered (3.36 at the window, 3.30 at the back)
  turret('turretDetail', planeSolid([[0, 1, 0, 3.42], [0, -1, 0, -3.03], [0, 0, 1, -1.64], [0, 0, -1, 2.04],
    [1, 0, 0, 0.04], [-1, 0, 0, 0.44], [0, 1, -1, 5.34], [0, 1, 1, 1.72]]));                 // the oracle's x -0.44..0.04
  const commanderPane = box(0.34, 0.13, 0.02);
  turret('turretGlass', commanderPane, -0.20, 3.22, -1.635);
  turret('turretDark', box(0.40, 0.02, 0.36), -0.175, 3.04, -1.84);
  // the mast on the roof's left rear, beside the commander's sight
  turret('turretDetail', cylY(0.035, 0.04, 0.45, 10), 0.475, 2.82, -2.25);
  // loader's hatch on the left and its hinges
  turret('turretDetail', box(0.56, 0.05, 0.64), 0.70, 2.69, -0.58);
  P.addHatch('turretHatch', box(0.50, 0.04, 0.58).scale(S, S, S), 0.70 * S, (2.73 - PIVOT[1]) * S, (-0.58 - PIVOT[2]) * S);
  for (const x of [0.50, 0.90]) turret('turretDetail', box(0.06, 0.06, 0.10), x, 2.74, -0.29);
  KIT.periscope(P, 'turretDetail', 0.70 * S, (2.67 - PIVOT[1]) * S, (0.55 - PIVOT[2]) * S);
  // smoke dischargers: a bank of five low on each cheek face (3 under 2), facing out along the face's 0.58 rad normal
  for (const side of [-1, 1]) {
    const yaw = side * 0.58;
    const faceZ = (x: number, y: number): number => (8.073 - x - 2.07 * y) / 1.53;
    turret('turretDetail', box(0.36, 0.16, 0.06), side * 0.95, 2.03, faceZ(0.95, 2.03) + 0.02, 0, yaw, 0);
    // the tubes fan out across the bank (0.12 rad apart) and stand 0.30 m off the bracket, as the oracle's L8 banks do
    for (const [col, row] of [[-1, 0], [0, 0], [1, 0], [-0.5, 1], [0.5, 1]]) {
      const x = 0.95 + col * 0.10 * Math.cos(0.58), y = 1.99 + row * 0.095;
      turret('turretDetail', markSmokeTube(cylZ(0.042, 0.30, 10)), side * x, y, faceZ(x, y) + 0.13, -0.50, yaw + side * col * 0.12, 0);
    }
  }
  // the turret's lifting eyes and the two whips at the bustle's rear corners (its side walls are plain: the oracle's
  // sections at z -2.4..0.2 lean 1.41 to 1.36 with no rail or bolt heads standing off them)
  for (const side of [-1, 1]) {
    KIT.liftEye(P, 'turretDetail', side * 1.10 * S, (2.53 - PIVOT[1]) * S, (0.70 - PIVOT[2]) * S);
    KIT.liftEye(P, 'turretDetail', side * 1.10 * S, (2.59 - PIVOT[1]) * S, (-2.70 - PIVOT[2]) * S);
    const x = side > 0 ? 0.992 : -0.956;                    // the oracle's whip centres (its turret sits 1.8 cm left)
    turret('turretDetail', cylY(0.055, 0.065, 0.08, 10), x, 2.62, -2.25);
    turret('turretDark', cylY(0.008, 0.012, 2.74, 6), x, 4.03, -2.25);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Gun: the deep mantlet that fills the slot and pitches with the gun, the coax above-left of it, and the 120 mm L55A1.
function buildMainGun(P: TankBuilderPort): void {
  const { gun } = owners(P);
  // the mantlet's lower edge stands 4 cm over the oracle's (1.80): there it rode 12-16 mm over the hull deck once the
  // turret left the glacis trough, a standing mount conflict at yaw 6-48 (gun-depression-sweep); 1.84 still closes the
  // slot under the turret floor (1.86 at the slot face) and clears the deck by 6 cm at level
  // the body fills the slot (|x| 0.42): its top 2.41 to z 1.84, then its face raked 37 degrees down to 2.02 at 2.32
  // (the oracle's hmap at |x| 0.20-0.42); the nose over the jacket (|x| 0.18) holds 2.38 to z 2.12 and falls to the
  // jacket's top at 2.56
  const section = (half: number) => ([z, bottom, top]: readonly [number, number, number]) =>
    ({ z, ring: [[-half, bottom], [half, bottom], [half, top], [-half, top]] as SectionPoint[] });
  gun('gunMount', sectionSolid(([[1.40, 1.85, 2.42], [1.72, 1.84, 2.41], [1.84, 1.86, 2.38], [2.32, 1.91, 2.02]] as const)
    .map(section(0.42))));
  gun('gunMount', sectionSolid(([[1.84, 1.90, 2.38], [2.12, 1.91, 2.38], [2.56, 1.93, 2.17]] as const).map(section(0.18))));
  // the boresight port on the nose's slope
  gun('gunMountDark', box(0.10, 0.02, 0.16), 0, 2.30, 2.30, 0.445, 0, 0);
  // coax: its port in the body's raked face, left of and above the bore, and the barrel's mouth in it
  gun('gunMountDark', cylZ(0.034, 0.05, 10), 0.285, 2.185, 2.11);
  gun('gunMountDark', cylZ(0.022, 0.10, 8), 0.285, 2.185, 2.10);
  // the root thermal jacket, bore evacuator and the clamp band on the tube (they recoil with it)
  const len = (MUZZLE_Z - TRUNNION[2]) * S;
  KIT.buildGun(P, { len, r: 0.095 * S, sleeve: false, evac: null, collar: false, baseR: 0.15 * S });
  const seg = P.q ? 24 : 12;
  gun('gun', cylZ(0.14, 0.73, seg), 0, 2.031, 2.765);
  // the bore evacuator rides 3 cm high of the bore line (the oracle's 2.063 centre), with its tapered ends
  gun('gun', cylZ(0.166, 0.46, seg), 0, 2.061, 3.575);                  // 3.30-3.85 with its short rounded ends
  gun('gun', cylZ(0.166, 0.05, seg, 0.125), 0, 2.055, 3.32);
  gun('gun', cylZ(0.125, 0.05, seg, 0.166), 0, 2.055, 3.83);
  gun('gun', cylZ(0.112, 0.08, seg), 0, 2.031, 5.40);
  // (the oracle's muzzle reference box beside the tube, x -0.166..-0.100 at z 6.51-6.81, is left out: a one-sided box
  // that near the mouth moves the drawn bore line gun-barrel-align-census fits by 24 mm and 0.64 deg)
  muzzleBore(P, { len, r: 0.095 * S });
}

// ---------------------------------------------------------------------------------------------------------------------
// The field fit (challenger3_td_rws; the owner, 2026-10-27: "make a new version of this challeenger without the ghillie
// and with new remote machien gun tower systems and equipment"): a Protector-class remote station on the roof proper
// ahead of the loader's hatch, its M2 at true calibre on the fleet's machine-gun construction, and the crew's kit. Its
// sweep clears the commander's sight head (3.42 at 2 m), the cupola, the mast and both whips; its base stands clear of
// the loader's hatch and periscope and of the brow step.
const RWS_ID = 'challenger3_td_rws';
/** Yaw centre on the roof (oracle frame) and the station's true-metre heights above it. */
const RWS_SEAT = [0.80, 2.70, 0.13] as const;
function buildRemoteStation(P: TankBuilderPort): void {
  const { box, cylX: cx, cylY: cy } = KIT;
  const base = [RWS_SEAT[0] * S, (RWS_SEAT[1] - PIVOT[1]) * S, (RWS_SEAT[2] - PIVOT[2]) * S] as const;
  const at = (dx: number, dy: number, dz: number): [number, number, number] => [base[0] + dx, base[1] + dy, base[2] + dz];
  // every elevating part stays inside |x| 0.20 (the M2's right-hand feed reaches it) and 3 cm over the housing at the
  // station's whole pitch; the cheeks stand at |x| 0.26-0.30 and the pins' tips at 0.24; the trunnion stands 0.58 m over
  // the roof so the receiver's back, 0.58 m behind it, keeps over the loader's hatch at full elevation (43 deg):
  // roof-station-sweep.mjs holds the moving stock 25 mm off the fixed
  const pivot = at(0, 0.58, 0.02);
  // the gun: the fleet's Browning M2 construction, remote form (solenoid back plate, right-hand feed)
  const gun = new THREE.Group();
  gun.name = 'challenger3TdRemoteM2';
  // a new station publishes the muzzle it draws, so it carries the M2's true barrel (crewL), not the fleet's station datum
  const layout = createPintleLayout({ cls: 'm2', remote: true, ammo: true, feed: 'right', datumBarrel: false,
    detail: P.q ? 1 : 0 }, {
    add(slot, geometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
      const material = slot === 'detail' ? P.mats.detail : P.mats.weaponSteel ?? P.mats.dark;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = `challenger3TdRemoteM2_${slot}`;
      gun.add(mesh);
    },
  });
  addPintleReceiver(layout); addPintleBarrel(layout); addPintleAmmo(layout);
  // the trunnion on the station's pivot; the muzzle is the barrel's datum length ahead of it
  gun.position.set(pivot[0], pivot[1] - layout.trunY, pivot[2] - layout.trunZ);
  const muzzleZ = 0.10 * layout.s + layout.barrelLength + layout.cls.flashL * layout.s;
  const station = beginAuxiliaryStation(P, {
    name: 'challenger3TdRemoteStation', caliberMm: 12.7,
    yaw: at(0, 0, 0), pivot, muzzle: [pivot[0], pivot[1], pivot[2] + muzzleZ],
  });
  // traversing body: the turntable ring on the roof, the low housing (its top edges chamfered 4 cm) and the two cradle
  // cheeks; the ring's foot keeps 7 cm from the loader's hatch hinges and stays on the roof proper short of the brow step
  P.add('turretDark', cy(0.28, 0.30, 0.05, P.q ? 32 : 16), ...at(0, 0.025, 0));
  P.add('turretDetail', planeSolid([[1, 0, 0, 0.25], [-1, 0, 0, 0.25], [0, 0, 1, 0.22], [0, 0, -1, 0.22], [0, 1, 0, 0.10],
    [0, -1, 0, 0.07], [1, 1, 0, 0.31], [-1, 1, 0, 0.31], [0, 1, 1, 0.28], [0, 1, -1, 0.28]]), ...at(0, 0.12, 0));
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.04, 0.43, 0.26), ...at(side * 0.28, 0.435, 0.02));
    P.add('turretDark', cx(0.03, 0.03, 10), ...at(side * 0.255, 0.58, 0.02));              // trunnion pins, cheek-borne
  }
  station.mark('yaw');
  // elevating mass: the day/thermal sight head on a post over the receiver, its window forward, and the ready box
  const sight = new THREE.Group();
  const part = (g: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): void => {
    const mesh = new THREE.Mesh(g, material); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = 'challenger3TdRemoteSight'; sight.add(mesh);
  };
  part(box(0.04, 0.07, 0.06), P.mats.detail, pivot[0], pivot[1] + 0.115, pivot[2] - 0.04);
  part(box(0.15, 0.12, 0.24), P.mats.detail, pivot[0], pivot[1] + 0.20, pivot[2] + 0.02);
  part(box(0.11, 0.07, 0.012), P.mats.glass, pivot[0], pivot[1] + 0.20, pivot[2] + 0.146);
  part(box(0.10, 0.17, 0.26), P.mats.detail, pivot[0] + 0.10, pivot[1] - 0.04, pivot[2] - 0.02);
  const pitching = new THREE.Group();
  pitching.add(gun, sight);
  FITTINGS.markExact(gun, 'pintleMG');
  station.attachPitch(pitching);
  P.turretG.userData.challenger3TdRemoteStation = Object.freeze({ seat: base, pivot, muzzleZ });
}

/** The field fit's own carriers: stowage bins on both turret walls (the bustle basket and its load are the decor
 *  manifest's, decorations.ts, so its packs sit on its own frame). */
function buildFieldKit(P: TankBuilderPort): void {
  const { turret } = owners(P);
  for (const side of [-1, 1]) {
    // stowage bins on the side walls behind the cheeks (their inner faces on the wall, 1.395 at mid-height)
    turret('turretPaintedDetail', box(0.18, 0.30, 1.20), side * 1.485, 2.16, -1.30);
    turret('turretPaintedDetail', box(0.18, 0.26, 0.80), side * 1.485, 2.14, -2.45);
    for (const z of [-1.80, -0.80, -2.75, -2.15]) turret('turretDark', box(0.012, 0.04, 0.06), side * 1.578, 2.24, z);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
function* buildChallenger3TdSteps(P: TankBuilderPort): TankProfileBuild {
  buildGear(P);
  yield 'challenger3_td running gear';
  buildHull(P);
  yield 'challenger3_td hull';
  buildTurret(P);
  buildMainGun(P);
  if (P.spec.id === RWS_ID) { buildRemoteStation(P); buildFieldKit(P); }
  yield 'challenger3_td turret';
  P.topY = 1.80 * S;
  addVehicleGhillieSuit(P);
}

export const buildChallenger3Td = steppedBuilder(buildChallenger3TdSteps);
