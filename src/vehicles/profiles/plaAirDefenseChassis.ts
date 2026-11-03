// Release 268: the two PLA air-defence chassis (profiles/chineseAirDefense.ts puts the turrets on them). Each hull is a
// few measured convex bodies (the upper body over the tracks, the tub between them, the corner fender boxes) on the
// fleet's running gear, which draws China's IFV road-wheel standard (nationWheelSets.ts: the Type 100 construction).
// - PGZ-95: the light front-engined chassis of the Beijing museum vehicle (photographs 01-02): the long engine deck
//   sloping down to a raked nose plate with two pairs of tow brackets, the upper sides leaning in over a narrow fender,
//   caged headlights on the front fender boxes, the driver's and the commander's raised hatches with three vision blocks
//   each on the left behind the deck, six road wheels, a front sprocket, a low rear idler and three return rollers.
// - PGZ-09: the PLZ-05-class chassis of the 2017 exhibition vehicle (photographs 01-03): straight vertical sides over
//   the tracks, a short glacis to a sharp nose and a lower plate raked back with two stowed track sections and the tow
//   rope, caged headlights on the glacis corners, the engine grille front right and the air louvre on the left side,
//   six large road wheels, a front sprocket, a high spoked rear idler standing behind the hull and three return rollers.
// Datums: profiles/chineseAirDefenseLayout.ts. First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { PGZ95_LAYOUT, PGZ09_LAYOUT } from './chineseAirDefenseLayout.ts';

export type P3 = readonly [number, number, number];

/** A welded convex body through measured corner points, with planar UVs for the camouflage projection. */
export function convexBody(points: readonly P3[]): THREE.BufferGeometry {
  const geometry = new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i) + position.getY(i), position.getZ(i) + position.getY(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

/** Every point and its mirror across the centre plane. */
export const mirrored = (points: readonly P3[]): P3[] => points.flatMap(([x, y, z]) => [[-x, y, z], [x, y, z]] as P3[]);

/** A grille panel laid on a plane tilted by `pitch` about x (the frame proud of the plate, the dark mesh and slats). */
function grille(P: TankBuilderPort, x: number, y: number, z: number, width: number, length: number, pitch: number,
  slats: number): void {
  const { box, xform } = KIT;
  const on = (geometry: THREE.BufferGeometry, lift: number, dz = 0): THREE.BufferGeometry =>
    xform(geometry, 0, lift, dz).rotateX(pitch).translate(x, y, z);
  P.add('hullDetail', on(box(width, 0.035, length), 0.004));
  P.add('hullDark', on(box(width - 0.07, 0.012, length - 0.07), 0.024));
  for (let k = 0; k < slats; k++) {
    const dz = -length / 2 + 0.06 + k * (length - 0.12) / Math.max(1, slats - 1);
    P.add('hullDetail', on(box(width - 0.05, 0.016, 0.022), 0.034, dz));
  }
}

/** A caged headlight standing on a flat top at y (the lamp, its lens and a three-bar guard). */
function cagedHeadlight(P: TankBuilderPort, x: number, y: number, z: number): void {
  const { box, cylZ } = KIT;
  P.add('hullDetail', box(0.20, 0.035, 0.20), x, y + 0.0125, z);
  KIT.headlight(P, x, y + 0.09, z, 0, 0.06);
  for (const dx of [-0.085, 0.085]) P.add('hullDark', box(0.018, 0.19, 0.018), x + dx, y + 0.12, z + 0.09);
  P.add('hullDark', box(0.19, 0.018, 0.018), x, y + 0.21, z + 0.09);
  P.add('hullDark', cylZ(0.009, 0.18, 6), x, y + 0.21, z);
}

/** A raised crew hatch block with three forward vision blocks on its sloped front and a round hatch on top. */
function crewCupola(P: TankBuilderPort, x0: number, x1: number, z0: number, z1: number, baseY: number, topY: number): void {
  const { box, cylY, torus } = KIT;
  const frontTop = z1 - 0.12;
  P.add('hull', convexBody([
    [x0, baseY, z0], [x1, baseY, z0], [x0, baseY, z1], [x1, baseY, z1],
    [x0 + 0.02, topY, z0 + 0.02], [x1 - 0.02, topY, z0 + 0.02], [x0 + 0.02, topY, frontTop], [x1 - 0.02, topY, frontTop],
  ]));
  const midY = (baseY + topY) / 2 + 0.03, midZ = z1 - 0.12 * (midY - baseY) / (topY - baseY) + 0.01;
  const slope = Math.atan2(0.12, topY - baseY);
  for (let k = 0; k < 3; k++) {
    const x = x0 + (x1 - x0) * (k + 1) / 4;
    P.addModuleVisual('optics', 'hullDetail', box(0.13, 0.075, 0.07), x, midY, midZ - 0.015, -slope, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', box(0.10, 0.032, 0.012), x, midY + 0.004, midZ + 0.022, -slope, 0, 0);
  }
  const cx = (x0 + x1) / 2, cz = (z0 + frontTop) / 2;
  P.addHatch('hull', cylY(0.22, 0.22, 0.035, P.q ? 20 : 12), cx, topY + 0.012, cz);
  P.add('hullDark', torus(0.22, 0.010, P.q ? 20 : 12, 4), cx, topY + 0.03, cz);
  P.add('hullDark', box(0.05, 0.04, 0.09), cx, topY + 0.035, cz - 0.24);
}

function taillights(P: TankBuilderPort, x: number, y: number, z: number): void {
  const { box } = KIT;
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.16, 0.09, 0.05), s * x, y, z);
    P.add('hullDetail', box(0.19, 0.022, 0.07), s * x, y + 0.055, z - 0.005);
  }
}

// ------------------------------------------------------------------------------------------------------- PGZ-95 --
export function buildPgz95Chassis(P: TankBuilderPort): void {
  const L = PGZ95_LAYOUT, G = L.gear;
  const { box, cylX, cylY } = KIT;
  // the upper sides lean in from the fender to the roof edge: the deck's front corner on that plane
  const sideX = (y: number): number => L.fenderHalf - (L.fenderHalf - L.roofHalf) * (y - L.fenderY) / (L.roofY - L.fenderY);
  const deckY = (z: number): number => L.roofY - (L.roofY - L.deckFrontY) * (z - L.deckBreakZ) / (L.deckFrontZ - L.deckBreakZ);
  const deckPitch = Math.atan2(L.roofY - L.deckFrontY, L.deckFrontZ - L.deckBreakZ);
  // Upper body over the tracks: the roof, the engine deck sloping to its front edge, the leaning sides, the rear plate
  P.add('hull', convexBody(mirrored([
    [L.fenderHalf, L.fenderY, L.rearZ], [L.roofHalf, L.roofY, L.rearZ], [L.roofHalf, L.roofY, L.deckBreakZ],
    [sideX(L.deckFrontY), L.deckFrontY, L.deckFrontZ], [L.fenderHalf, L.fenderY, L.deckFrontZ],
  ])));
  // The tub between the tracks: the raked nose plate from the deck's front edge, the chin, the belly and the rear
  // plate (5 mm inside the upper body's rear face: no coplanar faces)
  P.add('hull', convexBody(mirrored([
    [L.tubHalf, L.bellyY, L.rearChinZ], [L.tubHalf, L.rearPlateBottomY, L.rearZ + 0.005],
    [L.tubHalf, L.fenderY + 0.005, L.rearZ + 0.005], [L.tubHalf, L.deckFrontY, L.deckFrontZ],
    [L.tubHalf, L.noseBottomY, L.noseZ], [L.tubHalf, L.bellyY, L.chinZ],
  ])));
  // the front fender boxes over the sprockets with the headlights caged on them, and the mudguard plates hanging in
  // front of the sprockets' track wraps (3.7 cm clear at the bottom edge)
  for (const s of [-1, 1]) {
    P.add('hull', convexBody([1.12, L.fenderHalf].flatMap((x) => [
      [s * x, 1.00, 2.95], [s * x, 1.22, 2.95], [s * x, 1.00, 3.32], [s * x, 1.22, 3.22]] as P3[])));
    P.add('hull', convexBody([1.16, L.fenderHalf - 0.02].flatMap((x) => [
      [s * x, 0.74, 3.30], [s * x, 0.74, 3.345], [s * x, 1.02, 3.28], [s * x, 1.02, 3.325]] as P3[])));
    cagedHeadlight(P, s * 1.36, 1.22, 3.08);
  }
  // Engine deck: the two large grilles side by side and the small one behind them (the engine is front right)
  for (const [x, w, z0, z1, n] of [[-0.66, 0.66, 1.88, 2.66, 7], [0.06, 0.66, 1.88, 2.66, 7], [-0.30, 0.86, 1.36, 1.58, 3]] as const) {
    const zc = (z0 + z1) / 2;
    grille(P, x, deckY(zc), zc, w, (z1 - z0) / Math.cos(deckPitch), deckPitch, n);
  }
  // the driver (front left) and the commander behind him, each under a raised hatch with three vision blocks
  crewCupola(P, 0.38, 0.98, 0.84, 1.34, 1.555, 1.76);
  crewCupola(P, 0.38, 0.98, 0.22, 0.68, 1.60, 1.84);
  // Nose plate: two pairs of tow brackets with their hooks, raked with the plate
  const rake = Math.atan2(L.noseZ - L.deckFrontZ, L.deckFrontY - L.noseBottomY);
  const plateZ = (y: number): number => L.deckFrontZ + (L.deckFrontY - y) * Math.tan(rake);
  for (const s of [-1, 1]) {
    const y = 0.86, z = plateZ(y);
    P.add('hullDetail', box(0.24, 0.16, 0.09), s * 0.55, y, z, -rake, 0, 0);
    for (const dx of [-0.06, 0.06]) P.add('hullDark', box(0.035, 0.10, 0.14), s * 0.55 + dx, y - 0.04, z + 0.05, -rake + 0.5, 0, 0);
    P.add('hullDetail', cylX(0.045, 0.12, 10), s * 0.92, 0.66, plateZ(0.66) + 0.01);
  }
  // rear: the tail lights, a stowage box on the deck behind the turret and the tow pintle
  taillights(P, 1.05, 1.48, L.rearZ - 0.02);
  P.add('hullDetail', box(0.80, 0.22, 0.34), -0.60, L.roofY + 0.10, L.rearZ + 0.30);
  P.add('hullDark', box(0.82, 0.02, 0.36), -0.60, L.roofY + 0.215, L.rearZ + 0.30);
  P.add('hullDetail', box(0.24, 0.14, 0.10), 0, 0.78, L.rearZ - 0.03);
  P.add('hullDark', cylY(0.03, 0.03, 0.16, 8), 0, 0.78, L.rearZ - 0.06);
  // the tow rope slung along the left upper side (photograph 01), on the leaning plate
  const rope = [[-2.70, 1.46], [-1.90, 1.37], [-1.10, 1.44], [-0.30, 1.36], [0.40, 1.45]] as const;
  KIT.towCable(P, rope.map(([z, y]) => [sideX(y) + 0.02, y, z]), 0.022);
  for (const [z, y] of [rope[0], rope[2], rope[4]]) P.add('hullDetail', box(0.04, 0.06, 0.08), sideX(y) + 0.005, y + 0.035, z);
  // handrail across the front of the deck break and the antenna base on the rear right
  P.add('hullDark', cylX(0.014, 1.10, 6), -0.42, L.roofY + 0.07, L.deckBreakZ - 0.05);
  for (const x of [-0.95, 0.11]) P.add('hullDark', cylY(0.014, 0.014, 0.07, 6), x, L.roofY + 0.035, L.deckBreakZ - 0.05);
  P.add('hullDark', cylY(0.045, 0.055, 0.07, 10), -1.05, L.roofY + 0.035, -2.95);
  // the fenders' rubber flaps fore and aft of the track run
  for (const s of [-1, 1]) {
    P.hangMudguard('pgz95-rear-flap', 'hullRubber', box(0.38, 0.22, 0.03), s * G.xc, L.fenderY - 0.11, L.rearZ + 0.02);
  }
  KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: G.wheelR, wheelW: G.wheelW, wheelY: G.wheelY, xc: G.xc, dishR: 0.78,
    wheelZs: [...G.wheelZs], sprocket: { ...G.sprocket }, idler: { ...G.idler },
    rollers: G.rollerZs.map((z) => ({ z, y: G.rollerY, r: G.rollerR })),
    trackW: G.trackW, topY: G.topY, arms: true, paintedEnds: true,
    contactZF: G.wheelZs[0], contactZR: G.wheelZs[G.wheelZs.length - 1],
  });
}

// ------------------------------------------------------------------------------------------------------- PGZ-09 --
export function buildPgz09Chassis(P: TankBuilderPort): void {
  const L = PGZ09_LAYOUT, G = L.gear;
  const { box, cylX, cylY } = KIT;
  const glacisY = (z: number): number => L.roofY - (L.roofY - L.glacisFrontY) * (z - L.glacisZ) / (L.glacisFrontZ - L.glacisZ);
  const glacisPitch = Math.atan2(L.roofY - L.glacisFrontY, L.glacisFrontZ - L.glacisZ);
  const chamfer = 0.04, chamferZ = L.glacisZ + chamfer / Math.tan(glacisPitch);
  // Upper body: vertical sides over the tracks, the roof's edge chamfer, the glacis and the rear plate
  P.add('hull', convexBody(mirrored([
    [L.fenderHalf, L.fenderY, L.rearZ], [L.fenderHalf, L.roofY - chamfer, L.rearZ], [L.fenderHalf - chamfer, L.roofY, L.rearZ],
    [L.fenderHalf - chamfer, L.roofY, L.glacisZ], [L.fenderHalf, L.roofY - chamfer, chamferZ],
    [L.fenderHalf, L.glacisFrontY, L.glacisFrontZ], [L.fenderHalf, L.fenderY, L.glacisFrontZ],
  ])));
  // the tub: the sharp nose under the glacis, the lower plate raked back to the belly, the rear plate 2 cm inside
  P.add('hull', convexBody(mirrored([
    [L.tubHalf, L.bellyY, L.rearChinZ], [L.tubHalf, L.rearPlateBottomY, L.rearZ + 0.02],
    [L.tubHalf, L.fenderY + 0.005, L.rearZ + 0.02], [L.tubHalf, L.glacisFrontY, L.glacisFrontZ],
    [L.tubHalf, L.noseY, L.noseZ], [L.tubHalf, L.chinY, L.chinZ], [L.tubHalf, L.bellyY, 3.00],
  ])));
  // the front fender boxes closing the sponsons over the sprockets, the lamp boxes caged on the glacis corners
  for (const s of [-1, 1]) {
    P.add('hull', convexBody([L.tubHalf + 0.01, L.fenderHalf].flatMap((x) => [
      [s * x, 1.12, 3.00], [s * x, 1.30, 3.00], [s * x, 1.12, 3.52], [s * x, 1.30, L.glacisFrontZ + 0.02]] as P3[])));
    const z = 3.18, y = glacisY(z + 0.12);
    P.add('hull', convexBody([s * 1.22, s * 1.56].flatMap((x) => [
      [x, glacisY(z - 0.13) - 0.02, z - 0.13], [x, y + 0.13, z - 0.13], [x, glacisY(z + 0.12) - 0.02, z + 0.12], [x, y + 0.13, z + 0.12],
    ] as P3[])));
    cagedHeadlight(P, s * 1.39, y + 0.13, z);
  }
  // the deep side plates over the front 1.5 m (fix round 1, both critics, photograph 02): flush with the sponson side
  // above, down to 0.85 m with a vertical rear edge, standing 7 mm proud of the sprockets' hub faces; an access hatch on
  // each
  for (const s of [-1, 1]) {
    P.add('hull', convexBody([[1.596, 1.24, 2.06], [1.596, 1.24, L.glacisFrontZ], [1.614, 0.85, 2.06], [1.614, 0.85, 3.40],
      [1.628, 1.24, 2.06], [1.628, 1.24, L.glacisFrontZ], [1.628, 0.85, 2.06], [1.628, 0.85, 3.40]]
      .map(([x, y, z]) => [s * x, y, z] as P3)));
    P.add('hullDetail', box(0.012, 0.22, 0.30), s * 1.632, 0.99, 2.62);
    for (const z of [2.52, 2.72]) P.add('hullDark', box(0.010, 0.04, 0.05), s * 1.636, 1.11, z);
  }
  // the driver's hatch front left with its vision blocks, the engine grille front right, the left side's air louvre
  P.addHatch('hull', cylY(0.27, 0.27, 0.04, P.q ? 22 : 14), 0.66, L.roofY + 0.015, 2.20);
  P.add('hullDark', KIT.torus(0.27, 0.011, P.q ? 22 : 14, 4), 0.66, L.roofY + 0.035, 2.20);
  for (const dx of [-0.17, 0, 0.17]) {
    P.addModuleVisual('optics', 'hullDetail', box(0.13, 0.07, 0.09), 0.66 + dx, glacisY(2.70) + 0.02, 2.70, glacisPitch, 0, 0);
    P.addModuleVisual('optics', 'hullGlass', box(0.10, 0.03, 0.012), 0.66 + dx, glacisY(2.70) + 0.035, 2.75, glacisPitch, 0, 0);
  }
  grille(P, -0.82, L.roofY, 1.80, 0.86, 1.20, 0, 8);
  P.add('hullDetail', box(0.03, 0.30, 0.72), L.fenderHalf + 0.005, 1.47, 2.22);
  P.add('hullDark', box(0.02, 0.24, 0.66), L.fenderHalf + 0.018, 1.47, 2.22);
  for (let k = 0; k < 5; k++) P.add('hullDetail', box(0.03, 0.022, 0.64), L.fenderHalf + 0.024, 1.37 + k * 0.05, 2.22);
  // the lower plate: two stowed track sections and the tow rope looped across it, the tow eyes at the nose corners
  const chinRake = Math.atan2(L.noseZ - L.chinZ, L.noseY - L.chinY);
  const chinZ = (y: number): number => L.chinZ + (y - L.chinY) * Math.tan(chinRake);
  for (const s of [-1, 1]) {
    const y = 0.74, z = chinZ(y);
    P.add('hullDark', box(0.42, 0.30, 0.07), s * 0.36, y, z + 0.02, chinRake, 0, 0);
    for (const dy of [-0.08, 0.04]) P.add('hullDark', box(0.44, 0.035, 0.04), s * 0.36, y + dy, z + 0.06, chinRake, 0, 0);
    P.add('hullDetail', box(0.10, 0.12, 0.10), s * 0.86, 0.90, L.noseZ - 0.04);
    P.add('hullDark', cylX(0.03, 0.14, 8), s * 0.86, 0.90, L.noseZ + 0.02);
  }
  KIT.towCable(P, [[0.86, 0.92, L.noseZ + 0.02], [0.55, 0.62, chinZ(0.62) + 0.05], [0, 0.56, chinZ(0.56) + 0.06],
    [-0.55, 0.62, chinZ(0.62) + 0.05], [-0.86, 0.92, L.noseZ + 0.02]], 0.024);
  // the rear: tail lights, the tow pintle, the stowage drum standing on the rear right corner (photograph 02)
  taillights(P, 1.10, 1.58, L.rearZ - 0.02);
  P.add('hullDetail', box(0.26, 0.16, 0.10), 0, 0.92, L.rearZ - 0.03);
  // (kept 0.38 m tall: the guns depress over it at the rear, yaw 175-180)
  P.add('hullDetail', cylY(0.13, 0.13, 0.38, P.q ? 16 : 10), -1.32, L.roofY + 0.185, -3.28);
  P.add('hullDark', cylY(0.135, 0.135, 0.03, P.q ? 16 : 10), -1.32, L.roofY + 0.375, -3.28);
  P.add('hullDark', cylY(0.045, 0.055, 0.07, 10), 1.30, L.roofY + 0.035, -3.20);
  KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: G.wheelR, wheelW: G.wheelW, wheelY: G.wheelY, xc: G.xc, dishR: 0.78,
    wheelZs: [...G.wheelZs], sprocket: { ...G.sprocket }, idler: { ...G.idler },
    rollers: G.rollerZs.map((z) => ({ z, y: G.rollerY, r: G.rollerR })),
    trackW: G.trackW, topY: G.topY, arms: true, paintedEnds: true,
    contactZF: G.wheelZs[0], contactZR: G.wheelZs[G.wheelZs.length - 1],
  });
}
