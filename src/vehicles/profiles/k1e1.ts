// K1E1 turret (267, owner 2026-11-01: "update ... k1e1"): the 105 mm K1's low welded "baby Abrams" turret as the
// K1E1 upgrade carries it, rebuilt from K1E1-era photographs (research/k1e1: ROK Army/Marine K1s of 2024-2025 and the
// K1 close-ups). Turret frame: the spec ring [0, 1.50, 0.10] (unchanged), +z forward, +x the tank's LEFT.
//
// What the photographs show and this builds:
// - one low angular shell: vertical side walls with a chamfered roof edge, a tapered undercut bustle, and two cheek
//   blocks whose vertical front faces are swept back in plan either side of a deep gun slot;
// - the narrow K1 gun shield standing in that slot (modern3.ts finishK1A1Turret builds it on the elevating mount);
// - the gunner's primary-sight doghouse on the RIGHT front roof, the commander's cupola with the K6 behind it on the
//   right, the loader's hatch with the M60 on the left (the pre-267 build had all three mirrored onto the left);
// - 2x3 smoke-grenade banks on the side walls just behind the cheek corners, splayed out and up;
// - the wrap-around open pipe basket round the sides and bustle, its arms welded to the walls.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { KIT, FITTINGS } from './kit.ts';
import { antennaPart } from './antennaPart.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import type { Modern3BuilderPort } from '../modern3.ts';

type V3 = readonly [number, number, number];

/** Shell datums (turret frame, m). */
const K1E1_TURRET = Object.freeze({
  bottomY: 0.03, wallTopY: 0.52, roofY: 0.66,
  wallX: 1.47, roofX: 1.31,
  cheekFrontZ: 1.66, cheekCornerZ: 1.02, cheekRootZ: 0.80, slotX: 0.40, slotBackZ: 1.20,
  bustleRearZ: -1.80,
  basketRailX: 1.64,
});

/** A closed convex solid of the given corners (flat welded facets); UVs as convexSlab's (plan x/z). */
function convexStock(points: readonly V3[]): THREE.BufferGeometry {
  const geometry = new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i), position.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

/** The side walls' lower bevel: the foot runs in this far from the wall to the floor, from this height. */
const UNDERCUT = 0.10, FOOT_Y = 0.16;

const bothSides = (points: readonly V3[]): V3[] =>
  [...points, ...points.map(([x, y, z]): V3 => [-x, y, z])];

/** The shell's side-wall half-width and roof height at a station behind the cheeks (the body stations below). */
function shellHalfWidthAt(z: number): number {
  const T = K1E1_TURRET;
  if (z >= -0.95) return T.wallX;
  if (z >= -1.42) return T.wallX + (1.30 - T.wallX) * (-0.95 - z) / 0.47;
  return 1.30 + (1.00 - 1.30) * Math.min(1, (-1.42 - z) / (-1.42 - T.bustleRearZ));
}
function shellRoofAt(z: number): number {
  const T = K1E1_TURRET;
  if (z >= -0.95) return T.roofY;
  if (z >= -1.42) return T.roofY + (0.65 - T.roofY) * (-0.95 - z) / 0.47;
  return 0.65 + (0.62 - 0.65) * Math.min(1, (-1.42 - z) / (-1.42 - T.bustleRearZ));
}

function addShell(P: Modern3BuilderPort): void {
  const T = K1E1_TURRET;
  // Main body, ring to bustle: the side walls stand vertical to 0.52 and chamfer in to the 0.66 roof; behind the ring
  // the walls taper into the bustle and its floor rises (the bustle's undercut over the engine deck).
  const stations: readonly (readonly [number, number, number, number, number, number])[] = [
    // z, wall half-width, floor y, wall-top y, roof half-width, roof y
    [T.cheekRootZ, T.wallX, T.bottomY, T.wallTopY, T.roofX, T.roofY],
    [-0.95, T.wallX, T.bottomY, T.wallTopY, T.roofX, T.roofY],
    [-1.42, 1.30, 0.12, T.wallTopY, 1.15, 0.65],
    [T.bustleRearZ, 1.00, 0.17, 0.50, 0.88, 0.62],
  ];
  // The wall's foot is undercut 0.10 m back to the floor (the Abrams-pattern lower bevel the K1 photos show).
  const body: V3[] = [];
  for (const [z, w, floor, wallTop, roofW, roof] of stations) {
    body.push([w - UNDERCUT, floor, z], [w, Math.max(floor + 0.06, FOOT_Y), z], [w, wallTop, z], [roofW, roof, z]);
  }
  P.add('turret', convexStock(bothSides(body)));
  // Gun-slot back: the column between the cheeks ends in a raked wall behind the gun shield.
  P.add('turret', convexStock(bothSides([
    [T.slotX, T.bottomY, T.cheekRootZ], [T.slotX, T.roofY, T.cheekRootZ],
    [T.slotX, T.bottomY, T.slotBackZ + 0.04], [T.slotX, T.roofY, T.slotBackZ - 0.06],
  ])));
  // A closed 8 mm plate, not a one-sided plane: the wall rakes back 9 degrees, so at 10 degrees of elevation the gun-line
  // census (it looks perpendicular to the gun) saw the plane's back face from above (270 gun-junction receipt)
  const slotBack = KIT.box(T.slotX * 2 - 0.02, 0.56, 0.008);
  slotBack.rotateX(-Math.atan2(0.10, 0.63));
  P.add('turretDark', slotBack, 0, 0.34, T.slotBackZ - 0.005);
  for (const s of [-1, 1]) {
    // Cheek block: a vertical front face swept back in plan from the slot to the side corner, a chamfered top edge,
    // the wall and roof chamfer carried on from the body.
    P.add('turret', convexStock([
      [s * T.slotX, T.bottomY, T.cheekFrontZ - 0.04], [s * (1.41 - UNDERCUT), T.bottomY, T.cheekCornerZ - 0.06],
      [s * (T.wallX - UNDERCUT), T.bottomY, T.cheekRootZ], [s * T.slotX, T.bottomY, T.cheekRootZ],
      [s * T.slotX, FOOT_Y, T.cheekFrontZ], [s * 1.41, FOOT_Y, T.cheekCornerZ], [s * T.wallX, FOOT_Y, T.cheekRootZ],
      [s * T.slotX, 0.50, T.cheekFrontZ - 0.03], [s * 1.44, T.wallTopY, T.cheekCornerZ - 0.03],
      [s * T.wallX, T.wallTopY, T.cheekRootZ],
      [s * T.slotX, T.roofY, T.cheekFrontZ - 0.22], [s * T.roofX, T.roofY, 0.90],
      [s * T.roofX, T.roofY, T.cheekRootZ], [s * T.slotX, T.roofY, T.cheekRootZ],
    ]));
  }
  // The rotating ring seat under the shell (the race and seam are the hull's, turretSeatRace.ts).
  P.add('turret', KIT.cylY(1.05, 1.05, 0.10, P.q ? 32 : 18), 0, -0.02, -0.05);
}

function addGunnerSight(P: Modern3BuilderPort): void {
  const { box } = KIT;
  // Right-front roof: an armoured box ("doghouse") over the cheek root, a raised head with the window in front and its
  // two armoured doors folded open.
  const x = -0.66, z = 0.86, roof = K1E1_TURRET.roofY;
  P.addEquipment('turret', convexStock([
    [x - 0.27, roof - 0.04, z - 0.24], [x + 0.27, roof - 0.04, z - 0.24],
    [x - 0.27, roof - 0.04, z + 0.30], [x + 0.27, roof - 0.04, z + 0.30],
    [x - 0.27, roof + 0.13, z - 0.24], [x + 0.27, roof + 0.13, z - 0.24],
    [x - 0.27, roof + 0.13, z + 0.22], [x + 0.27, roof + 0.13, z + 0.22],
  ]), 0, 0, 0);
  P.add('turret', convexStock([
    [x - 0.19, roof + 0.12, z - 0.18], [x + 0.19, roof + 0.12, z - 0.18],
    [x - 0.19, roof + 0.12, z + 0.18], [x + 0.19, roof + 0.12, z + 0.18],
    [x - 0.19, roof + 0.25, z - 0.18], [x + 0.19, roof + 0.25, z - 0.18],
    [x - 0.19, roof + 0.25, z + 0.18], [x + 0.19, roof + 0.25, z + 0.18],
  ]));
  const face = z + 0.18;
  P.add('turretDark', box(0.30, 0.10, 0.008), x, roof + 0.185, face);           // window frame, half sunk in the face
  P.add('turretGlass', box(0.26, 0.075, 0.006), x, roof + 0.185, face + 0.002);
  for (const s of [-1, 1]) {
    // armoured doors hinged at the head's front corners, swung out 50 degrees
    const a = 0.87, half = 0.085;
    P.add('turretDetail', box(0.022, 0.12, 2 * half), x + s * (0.19 + Math.sin(a) * half), roof + 0.185,
      face + Math.cos(a) * half, 0, s * a, 0);
  }
  P.add('turretDetail', box(0.42, 0.018, 0.07), x, roof + 0.259, face - 0.005);   // rain lip over the window
}

function addCrewStations(P: Modern3BuilderPort): void {
  const { box, cylY, torus, periscope } = KIT;
  const roof = K1E1_TURRET.roofY;
  // Commander (right): a raised drum with six vision blocks, the hatch lid, and the K6 on its ring.
  const cx = -0.62, cz = -0.42;
  P.add('turretCupola', cylY(0.36, 0.38, 0.12, P.q ? 28 : 16), cx, roof + 0.04, cz);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    P.add('turretDark', box(0.11, 0.045, 0.03), cx + Math.cos(a) * 0.355, roof + 0.07, cz + Math.sin(a) * 0.355, 0, -a + Math.PI / 2, 0);
  }
  P.add('turretHatch', cylY(0.29, 0.30, 0.045, P.q ? 24 : 14), cx, roof + 0.12, cz);
  P.add('turretDark', torus(0.30, 0.008, P.q ? 24 : 14), cx, roof + 0.10, cz);
  const k6 = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', seed: 14,
    elev: 0.02, ammo: true, ring: { r: 0.25, stubs: 4 }, working: true, ridingCradle: true });
  k6.name = 'k1CommanderK6';
  k6.position.set(cx, roof + 0.142, cz);
  P.turretG.add(k6);
  // Loader (left): a flush hatch ring and lid, one periscope ahead of it, the M60 on its pintle.
  const lx = 0.56, lz = -0.36;
  P.add('turretHatch', cylY(0.31, 0.32, 0.05, P.q ? 24 : 14), lx, roof + 0.015, lz);
  P.add('turretHatch', cylY(0.26, 0.27, 0.04, P.q ? 24 : 14), lx, roof + 0.055, lz);
  P.add('turretDark', box(0.30, 0.012, 0.03), lx, roof + 0.077, lz);
  periscope(P, 'turretDetail', lx, roof + 0.035, lz + 0.42);
  const m60 = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', seed: 15,
    elev: 0.02, ammo: false, ring: { r: 0.18, stubs: 3 }, working: true, ridingCradle: true });
  m60.name = 'k1LoaderM60';
  m60.position.set(lx, roof + 0.075, lz);
  P.turretG.add(m60);
  // Gunner's and commander's roof periscopes either side of the sight and ahead of the cupola.
  for (const [x, z, ry] of [[-0.30, 0.46, 0.25], [-0.98, 0.28, -0.30]] as const) {
    periscope(P, 'turretDetail', x, roof + 0.035, z, ry);
  }
}

function addSmokeBanks(P: Modern3BuilderPort): void {
  const { box, cylZ } = KIT;
  const T = K1E1_TURRET;
  for (const s of [-1, 1]) {
    // Bracket plate welded to the wall just behind the cheek corner; the 2x3 bank looks forward, out and up.
    const yaw = s * 0.62, pitch = -0.38;
    const bx = s * (T.wallX + 0.05), by = 0.36, bz = 0.66;
    P.add('turretDetail', box(0.10, 0.26, 0.30), s * (T.wallX + 0.02), by, bz);
    const bank = new THREE.Group();
    bank.position.set(bx, by, bz);
    bank.rotation.set(pitch, yaw, 0, 'YXZ');
    bank.updateMatrix();
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      const tube = markSmokeTube(cylZ(0.040, 0.24, P.q ? 12 : 8));
      tube.translate((col - 1) * 0.088, (row - 0.5) * 0.088, 0.10);
      tube.applyMatrix4(bank.matrix);
      P.add('turretDetail', tube);
      const mouth = new THREE.CircleGeometry(0.030, P.q ? 12 : 8);
      mouth.translate((col - 1) * 0.088, (row - 0.5) * 0.088, 0.2205);
      mouth.applyMatrix4(bank.matrix);
      P.add('turretDark', mouth);
    }
    const cradle = box(0.30, 0.21, 0.08);
    cradle.translate(0, 0, -0.03);
    cradle.applyMatrix4(bank.matrix);
    P.add('turretDetail', cradle);
  }
}

function addBasket(P: Modern3BuilderPort): void {
  const { box, cylY, cylZ, stowage, ammoCan } = KIT;
  const T = K1E1_TURRET;
  // the rear basket runs 0.35 m past the bustle wall (267 round 2: the K1's deep bustle rack; 0.26 m before)
  const railX = T.basketRailX, rearZ = -2.15, cornerX = 1.40, cornerZ = -1.94;
  const railYs = [0.24, 0.40, 0.56];
  const rod = (a: V3, b: V3, r = 0.017) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), axis = end.clone().sub(start);
    const g = cylY(r, r, axis.length(), P.q ? 8 : 6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()));
    const c = start.add(end).multiplyScalar(0.5);
    P.add('turretOpenLattice', g, c.x, c.y, c.z);
  };
  const sideFrontZ = -0.08, sideRearZ = -1.62;
  for (const s of [-1, 1]) {
    for (const y of railYs) {
      rod([s * railX, y, sideFrontZ], [s * railX, y, sideRearZ]);
      rod([s * railX, y, sideRearZ], [s * cornerX, y, cornerZ]);
      rod([s * cornerX, y, cornerZ], [s * 0.70, y, rearZ]);
    }
    for (const z of [sideFrontZ, -0.62, -1.12, sideRearZ]) rod([s * railX, railYs[0] - 0.03, z], [s * railX, railYs[2] + 0.02, z]);
    rod([s * cornerX, railYs[0] - 0.03, cornerZ], [s * cornerX, railYs[2] + 0.02, cornerZ]);
  }
  rod([-0.70, railYs[0], rearZ], [0.70, railYs[0], rearZ]);
  rod([-0.70, railYs[1], rearZ], [0.70, railYs[1], rearZ]);
  rod([-0.70, railYs[2], rearZ], [0.70, railYs[2], rearZ]);
  for (const x of [-0.70, 0, 0.70]) rod([x, railYs[0] - 0.03, rearZ], [x, railYs[2] + 0.02, rearZ]);
  // Arms: flat bars from the welded wall feet out to the rails, four a side; the rear basket hangs on two more.
  const armZs = [-0.08, -0.62, -1.12, -1.62];
  const ARM_BURY = 0.12;                                                     // each arm runs this far into the wall
  const shellFootXs: number[] = [];
  for (const s of [-1, 1]) for (const z of armZs) {
    const wallX = shellHalfWidthAt(z);
    shellFootXs.push(Number(wallX.toFixed(3)));
    for (const y of [railYs[0], railYs[2]]) {
      P.add('turretDetail', box(railX - wallX + ARM_BURY, 0.035, 0.035), s * (railX + wallX - ARM_BURY) / 2, y, z);
    }
    P.add('turretDetail', box(0.05, railYs[2] - railYs[0] + 0.08, 0.10), s * (wallX + 0.005), (railYs[0] + railYs[2]) / 2, z);
  }
  const tieLength = T.bustleRearZ - rearZ + 0.10;
  for (const x of [-0.55, 0.55]) for (const y of [railYs[0], railYs[2]]) {
    P.add('turretDetail', box(0.035, 0.035, tieLength), x, y, rearZ + tieLength / 2 - 0.02);
  }
  P.add('turretOpenLattice', KIT.openRackGrid(1.36, T.bustleRearZ - rearZ + 0.04, 0.02, 3, 6), 0, 0.20, (rearZ + T.bustleRearZ) / 2 + 0.01);
  // Stowage: rolled tarps and packs along the sides, cases and cans in the rear basket.
  stowage(P, 'turretCloth', P.rng, [
    [-1.55, 0.40, -0.95, 0.15, 0.24, 0.70], [1.55, 0.40, -1.05, 0.15, 0.22, 0.80],
    [-1.55, 0.38, -0.30, 0.14, 0.20, 0.36],
  ]);
  if (P.q) P.add('turretCloth', cylZ(0.085, 0.62, 14), 1.55, 0.40, -0.36);
  for (const [x, w] of [[-0.36, 0.46], [0.34, 0.40]] as const) {
    P.add('turretDetail', box(w, 0.26, 0.20), x, 0.33, rearZ + 0.13);
    P.add('turretDark', box(w + 0.01, 0.015, 0.21), x, 0.463, rearZ + 0.13);
  }
  ammoCan(P, 'turretDark', -1.555, 0.34, -1.55, Math.PI / 2);
  if (P.geometryReceipt) {
    P.turretG.userData.k1a1SideCageSeating = Object.freeze({
      outerRailX: railX,
      bracketInnerX: Number((Math.min(...shellFootXs) - ARM_BURY).toFixed(3)),
      bracketOuterX: railX,
      shellFootXs: Object.freeze([...new Set(shellFootXs)]),
      bracketStationsZ: Object.freeze(armZs),
      bracketCount: armZs.length * 2,
      weldFootCount: armZs.length * 2,
    });
  }
}

function addRoofFittings(P: Modern3BuilderPort): void {
  const { box, cylY, liftEye } = KIT;
  const roof = K1E1_TURRET.roofY;
  // Bustle blow-off panels over the ready rounds: two lids with their hairline seams on the falling bustle roof.
  for (const x of [-0.42, 0.42]) {
    for (const z of [-0.98, -1.38]) P.add('turretDark', box(0.66, 0.006, 0.018), x, shellRoofAt(z) + 0.001, z);
    for (const dx of [-0.33, 0.33]) {
      const seam = box(0.018, 0.006, 0.40);
      seam.rotateX(-Math.atan2(shellRoofAt(-0.98) - shellRoofAt(-1.38), 0.40));
      P.add('turretDark', seam, x + dx, (shellRoofAt(-0.98) + shellRoofAt(-1.38)) / 2 + 0.001, -1.18);
    }
  }
  // Crosswind sensor mast (right rear) and the two whip antennas on the rear corners.
  const mastY = shellRoofAt(-1.18);
  P.add('turretDetail', box(0.10, 0.06, 0.10), -0.30, mastY + 0.02, -1.18);
  P.add('turretDetail', cylY(0.016, 0.022, 0.36, 8), -0.30, mastY + 0.22, -1.18);
  P.add('turretDark', box(0.05, 0.05, 0.05), -0.30, mastY + 0.42, -1.18);
  for (const [x, z, h] of [[-0.92, -1.36, 1.9], [0.92, -1.36, 1.6]] as const) {
    const y = shellRoofAt(z);
    P.add('turretDark', cylY(0.040, 0.050, 0.10, 10), x, y + 0.04, z);
    P.add('turretDetail', antennaPart(cylY(0.007, 0.011, h, 6)), x, y + 0.09 + h / 2, z);
  }
  for (const [x, z] of [[1.18, 0.62], [-1.18, 0.62], [0.98, -1.40], [-0.98, -1.40]] as const) {
    liftEye(P, 'turretDetail', x, (z > -0.95 ? roof : shellRoofAt(z)) + 0.005, z);
  }
}

/** The K1 gun shield on the elevating mount (gun frame: the trunnion at the spec gunPivot [0, 0.265, 1.45]): a tall
 * block standing in the turret's gun slot, its face 0.20 m ahead of the trunnion (flush with the cheek faces' line; 267
 * round 2: it stood 7 cm proud, its collars 26 cm). Its lower rear runs on an arc round
 * the trunnion, so at full elevation it keeps 4 cm over the deck's pioneer-tool rail at every bearing (the sweep's
 * 2.6 cm); its raised front foot clears the driver's periscopes as it depresses. */
export function k1e1GunShield(): THREE.BufferGeometry {
  return convexStock(bothSides([
    [0.30, 0.33, -0.24], [0.30, -0.10, -0.24], [0.30, -0.18, -0.10],
    [0.27, -0.16, 0.20], [0.27, 0.27, 0.20],
  ]));
}

/** The K1's boxed front fender on one side (hull frame; research/k1e1 photos 1, 3, 6): a top plate over the track that
 * falls a little to the front, a vertical face plate ahead of the idler and an outer cheek closing the corner over the
 * flare wall, with the wide rubber flap hanging under the face. The pre-267 hull had only a thin outer flare there, so
 * the track tops showed from the front. The plates keep 4 cm over the track's wrap round the idler (z 3.00, r 0.33). */
export function addK1E1FrontFender(P: Modern3BuilderPort, side: number): void {
  const inner = side * 1.12, outer = side * 1.80;
  P.add('hull', convexStock([
    [inner, 1.23, 2.95], [outer, 1.23, 2.95], [outer, 1.21, 3.53], [inner, 1.21, 3.53],
    [inner, 1.29, 2.95], [outer, 1.29, 2.95], [outer, 1.265, 3.53], [inner, 1.265, 3.53],
  ]));
  P.add('hull', convexStock([
    [inner, 1.00, 3.47], [outer, 1.00, 3.47], [outer, 1.00, 3.53], [inner, 1.00, 3.53],
    [inner, 1.25, 3.47], [outer, 1.25, 3.47], [outer, 1.25, 3.53], [inner, 1.25, 3.53],
  ]));
  P.add('hull', convexStock([
    [side * 1.77, 1.00, 3.20], [outer, 1.00, 3.20], [outer, 1.00, 3.53], [side * 1.77, 1.00, 3.53],
    [side * 1.77, 1.28, 3.20], [outer, 1.28, 3.20], [outer, 1.25, 3.53], [side * 1.77, 1.25, 3.53],
  ]));
  P.hangMudguard('k1e1-front-flap', 'hullRubber', KIT.box(0.64, 0.36, 0.024), side * 1.46, 0.83, 3.505);
}

/**
 * r268b (owner 2026-11-02: "add more upper glacis and roof details"; research/k1e1 photos 3, 4, 6): the K1 turret's bolted
 * cheek armour shows a row of bolt heads along the top of each cheek face and short columns at its ends; the roof carries
 * the bolted gun-removal plate over the breech, and the loader's hatch lifts on a hinge block at its rear.
 */
function addCheekBoltsAndHinges(P: Modern3BuilderPort): void {
  const { box } = KIT;
  const T = K1E1_TURRET, roof = T.roofY;
  // the cheek face: from the slot (x 0.40, z 1.66) swept back to the corner (x 1.41, z 1.02), leaning back 3 cm by 0.50
  const faceZ = (x: number, y: number): number => T.cheekFrontZ - (x - T.slotX) * (0.64 / 1.01) - (y - FOOT_Y) * (0.03 / 0.34);
  const yaw = Math.atan2(0.64, 1.01);                                        // the face normal's angle off +z
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  for (const s of [-1, 1]) {
    const bolt = (x: number, y: number): void => {
      // a domed head (a dot from every side; a hex prism seen across the swept face read as a chevron), 4 mm into the face
      P.add('turretDetail', new THREE.SphereGeometry(0.022, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), s * (x - nx * 0.004), y, faceZ(x, y) - nz * 0.004, 0, s * yaw, 0);
    };
    for (let k = 0; k < 8; k++) bolt(0.48 + k * 0.122, 0.455);
    for (const y of [0.235, 0.345]) { bolt(0.48, y); bolt(1.334, y); }
  }
  // the bolted gun-removal plate over the breech (the Abrams-pattern roof the K1 shares), between the sight's periscope and
  // the loader's, 1 cm proud of the roof, a bolt ring round it
  const gx0 = -0.19, gx1 = 0.35, gz0 = 0.10, gz1 = 0.62;
  P.add('turret', box(gx1 - gx0, 0.014, gz1 - gz0), (gx0 + gx1) / 2, roof + 0.003, (gz0 + gz1) / 2);
  for (let k = 0; k <= 4; k++) for (const z of [gz0 + 0.035, gz1 - 0.035]) {
    P.add('turretDetail', KIT.cylY(0.016, 0.016, 0.012, 6), gx0 + 0.035 + k * (gx1 - gx0 - 0.07) / 4, roof + 0.012, z);
  }
  for (let k = 1; k <= 3; k++) for (const x of [gx0 + 0.035, gx1 - 0.035]) {
    P.add('turretDetail', KIT.cylY(0.016, 0.016, 0.012, 6), x, roof + 0.012, gz0 + 0.035 + k * (gz1 - gz0 - 0.07) / 4);
  }
  // loader's hatch hinge block behind the lid (the hatch at x 0.56, z -0.36, ring r 0.32), its pin across
  P.add('turretDetail', box(0.22, 0.05, 0.08), 0.56, roof + 0.035, -0.70);
  P.add('turretDark', KIT.cylX(0.016, 0.26, 8), 0.56, roof + 0.05, -0.70);
}

/**
 * r268b: the K1E1's upper nose (hull frame, modern3.ts buildK1A1Hull's nose): a lamp housing at each end of the upper
 * nose plate under the glacis lip (photos 1, 3, 4: the K1's headlights inboard of the fenders, the left-hand one paired
 * with a square driving lamp), an amber marker on each fender face, and the weld bead where the nose plate meets the
 * chin. Everything on the nose stays under the 1.24 lip, the line the gun depresses to over the bow.
 */
export function addK1E1HullFurniture(P: Modern3BuilderPort): void {
  const { box, cylX, cylZ } = KIT;
  const noseZ = (y: number): number => 3.68 + (y - 1.02) * (0.04 / 0.22), tilt = Math.atan(0.04 / 0.22);
  for (const s of [-1, 1]) {
    const lx = s * 0.84, ly = 1.115, lz = noseZ(ly);
    P.add('hullDark', box(0.24, 0.15, 0.012), lx, ly, lz - 0.002, tilt, 0, 0);
    for (const dy of [-0.082, 0.082]) P.add('hull', box(0.27, 0.02, 0.05), lx, ly + dy, lz + 0.018, tilt, 0, 0);
    for (const dx of [-0.125, 0.125]) P.add('hull', box(0.02, 0.18, 0.05), lx + dx, ly, lz + 0.018, tilt, 0, 0);
    P.add('hullDetail', box(0.29, 0.012, 0.08), lx, ly + 0.098, lz + 0.032, tilt, 0, 0);               // rain visor
    const hx = s > 0 ? lx + 0.045 : lx;                                       // the left-hand housing pairs it with a square lamp
    P.add('hullDetail', cylZ(0.055, 0.05, P.q ? 14 : 10), hx, ly - 0.005, lz + 0.02, tilt, 0, 0);
    P.add('hullGlass', markVehicleNightLens(cylZ(0.042, 0.008, P.q ? 14 : 10), 'headlight'), hx, ly - 0.005, lz + 0.046, tilt, 0, 0);
    if (s > 0) {
      P.add('hullDetail', box(0.075, 0.075, 0.045), lx - 0.068, ly - 0.005, lz + 0.018, tilt, 0, 0);
      P.add('hullGlass', box(0.05, 0.05, 0.006), lx - 0.068, ly - 0.005, lz + 0.042, tilt, 0, 0);
    }
  }
  P.add('hullDetail', cylX(0.012, 1.94, 6), 0, 1.022, 3.684);                                       // nose-to-chin weld bead
  // the driver's hatch pivots on a hinge block on its left (the hatch at x 0, z 2.30 on its 6.4-degree bed plate, top 1.435);
  // its top 1.465 stays under the ring's 1.471, and 3.5 cm under the gun's floor where the barrel crosses it (yaw 24)
  P.add('hullDetail', box(0.06, 0.04, 0.20), 0.29, 1.445, 2.30, 0.112, 0, 0);
  P.add('hullDark', cylZ(0.014, 0.22, 8), 0.29, 1.452, 2.30, 0.112, 0, 0);
  for (const s of [-1, 1]) {                                                    // amber markers on the fender faces (z 3.53)
    P.add('hull', box(0.12, 0.09, 0.04), s * 1.60, 1.175, 3.545);
    P.add('hullGlass', markVehicleNightLens(cylZ(0.032, 0.012, 12), 'marker', { tint: 'warm' }), s * 1.60, 1.175, 3.569);
  }
}

/** r268b: the K1E1's engine deck (top 1.61): a frame round the grille field (2.30 x 1.30 at z -2.85) and bolt rows on
 * its edge plates, its top 1.627 (4 mm over the grille plate, under the 1.629 slats that set the gun's floor astern); modern3.ts builds it in the grille's seat role (the spare-link solver's). */
export function addK1E1DeckFrame(P: Modern3BuilderPort): void {
  const { box, cylY } = KIT;
  for (const z of [-2.185, -3.515]) P.add('hull', box(2.36, 0.02, 0.035), 0, 1.617, z);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.035, 0.02, 1.30), s * 1.165, 1.617, -2.85);
    P.add('hullDark', box(0.016, 0.006, 1.32), s * 1.36, 1.611, -2.85);                              // edge-plate joint
    for (let k = 0; k < 6; k++) P.add('hullDetail', cylY(0.016, 0.016, 0.012, 6), s * 1.44, 1.612, -2.30 - k * 0.235);
  }
}

/** The complete K1E1 turret shell and roof (the gun and its shield: modern3.ts finishK1A1Turret). */
export function buildK1E1Turret(P: Modern3BuilderPort): void {
  addShell(P);
  addGunnerSight(P);
  addCrewStations(P);
  addSmokeBanks(P);
  addBasket(P);
  addRoofFittings(P);
  addCheekBoltsAndHinges(P);
}
