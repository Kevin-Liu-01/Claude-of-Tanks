// Release 269: the K200 family's hull, drawn from its measured layout (k200HullLayout.ts) at either length: the K200A1's
// five stations or the K30 Biho's stretched six. A few welded convex bodies (the upper body over the tracks with its
// 23-degree glacis and the raked lower plate, the tub between the tracks) on the fleet's running gear (the drive sprocket
// at the front, the idler at the rear, no return rollers), the rubber skirt hanging from the sponson between the steel
// cheek plates over the sprocket and the idler, the folded trim vane across the nose between the guarded headlight
// housings, a rear-view mirror on each front corner, the trim vane's arms and the grab handle on the glacis, the power
// pack's air box lying on the glacis front right, the driver's hatch with its periscopes front left, the ramp with its
// door in the rear plate and the boxed tail lights.
// The roof behind the driver belongs to the vehicle: the K30 Biho's turret (profiles/k30Biho.ts), the K200A1's
// commander's cupola and troop hatch. First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { convexBody, mirrored, type P3 } from './plaAirDefenseChassis.ts';
import type { K200HullLayout } from './k200HullLayout.ts';

const { box, cylX, cylY, torus } = KIT;

/** A box laid on a plane through `at` whose up axis is tilted forward by `pitch` (rotation about x), sunk `sink` into it. */
function onPlane(geometry: THREE.BufferGeometry, height: number, at: P3, pitch: number, sink = 0.01): THREE.BufferGeometry {
  const lift = height / 2 - sink;
  return geometry.rotateX(pitch).translate(at[0], at[1] + lift * Math.cos(pitch), at[2] + lift * Math.sin(pitch));
}

/** The welded hull: the upper body over the tracks and the tub between them, the cheek plates and the skirts. */
function hullBodies(P: TankBuilderPort, L: K200HullLayout): void {
  const c = 0.03, glacisPitch = Math.atan2(L.roofY - L.noseY, L.noseZ - L.glacisBreakZ);
  // the upper body: the flat roof with its side edges chamfered, the glacis down to the nose, the lower plate's upper
  // part down to the sponson's underside, the vertical sides and the rear plate
  P.add('hull', convexBody(mirrored([
    [L.sideX, L.sponsonY, L.rearZ], [L.sideX, L.roofY - c, L.rearZ], [L.sideX - c, L.roofY, L.rearZ],
    [L.sideX - c, L.roofY, L.glacisBreakZ], [L.sideX, L.roofY - c, L.glacisBreakZ + c / Math.tan(glacisPitch)],
    [L.sideX, L.noseY, L.noseZ], [L.sideX, L.sponsonY, L.lowerZ(L.sponsonY)],
  ])));
  // the tub between the tracks, 1 cm up into the upper body; its lower plate and rear plate 5 mm inside the upper body's
  // (no coplanar faces), the belly's rear edge chamfered up to the ramp's hinge line
  const top = L.sponsonY + 0.01;
  P.add('hull', convexBody(mirrored([
    [L.tubX, L.bellyY, L.rearChinZ], [L.tubX, L.rearPlateBottomY, L.rearZ + 0.005], [L.tubX, top, L.rearZ + 0.005],
    [L.tubX, top, L.lowerZ(top) - 0.005], [L.tubX, L.bellyY, L.chinZ - 0.005],
  ])));
  // the steel cheek plates under the sponson's edge at the bow (over the sprocket, its leading edge on the lower plate's
  // line) and the stern (over the idler), between the skirt's ends; each 1 cm up into the sponson
  const xi = L.skirtInnerX, xo = L.skirtOuterX;
  for (const s of [-1, 1]) {
    const sheet = (profile: readonly (readonly [number, number])[]): THREE.BufferGeometry =>
      convexBody([xi, xo].flatMap((x) => profile.map(([z, y]) => [s * x, y, z] as P3)));
    P.add('hull', sheet([[L.lowerZ(top) - 0.005, top], [L.lowerZ(L.frontCheekBottomY) - 0.005, L.frontCheekBottomY],
      [L.skirtFrontZ - 0.01, L.frontCheekBottomY], [L.skirtFrontZ - 0.01, top]]));
    P.add('hull', sheet([[L.skirtRearZ + 0.01, top], [L.skirtRearZ + 0.01, L.rearCheekBottomY],
      [L.rearZ + 0.08, L.rearCheekBottomY], [L.rearZ + 0.005, L.rearCheekBottomY + 0.07], [L.rearZ + 0.005, top]]));
    // the rubber skirt between them (its inner face 4 mm inside the side's plane, its ends 1 cm into the cheeks) and the
    // steel strip it hangs from
    const run = L.skirtFrontZ - L.skirtRearZ;
    P.add('hullRubber', box(0.018, top - L.skirtBottomY, run), s * (L.sideX + 0.005), (top + L.skirtBottomY) / 2,
      (L.skirtFrontZ + L.skirtRearZ) / 2);
    P.add('hullDetail', box(0.019, 0.035, run), s * (L.sideX + 0.0075), top, (L.skirtFrontZ + L.skirtRearZ) / 2);
    // the tow eyes through the cheeks (photograph 07's round openings, the rope's loops through them)
    P.add('hullDark', cylX(0.055, 0.016, P.q ? 14 : 10), s * (xo + 0.004), 0.97, L.skirtFrontZ + 0.15);
    P.add('hullDark', cylX(0.055, 0.016, P.q ? 14 : 10), s * (xo + 0.004), 0.99, L.skirtRearZ - 0.20);
  }
}

/** The bow: the trim vane folded across the nose, the guarded headlight housings at its ends, the mirrors, the vane's arms and the grab handle on
 * the glacis, the tow hooks on the lower plate. */
function hullBow(P: TankBuilderPort, L: K200HullLayout): void {
  const glacisPitch = Math.atan2(L.roofY - L.noseY, L.noseZ - L.glacisBreakZ);
  const glacisAt = (y: number): number => L.glacisBreakZ + (L.roofY - y) / Math.tan(glacisPitch);
  // the vane between the headlight housings: its face ahead of the nose, its top lying back onto the glacis, its foot on
  // the lower plate, both 1 cm in
  const vaneHalf = 1.02, vaneBottom = 1.28, vaneTop = 1.46;
  P.add('hullDetail', convexBody(mirrored([
    [vaneHalf, vaneBottom, L.bowZ], [vaneHalf, vaneTop, L.bowZ - 0.01], [vaneHalf, vaneTop, glacisAt(vaneTop + 0.014)],
    [vaneHalf, vaneBottom, L.lowerZ(vaneBottom) - 0.01],
  ])));
  for (const x of [-0.62, 0, 0.62]) P.add('hullDark', box(0.12, 0.10, 0.016), x, (vaneBottom + vaneTop) / 2, L.bowZ + 0.002);
  // the headlight housings set into the nose at its ends (photographs 01, 02, 08): as deep as the vane and level with it,
  // a recessed opening with the lamp inboard and the amber marker outboard behind a three-bar guard; a rear-view mirror
  // on a stalk at each front corner (01, 02)
  for (const s of [-1, 1]) {
    const x0 = vaneHalf + 0.02, x1 = L.sideX - 0.01, xc = (x0 + x1) / 2, top = vaneTop, bottom = vaneBottom - 0.01;
    P.add('hull', convexBody([x0, x1].flatMap((x) => [
      [s * x, bottom, L.bowZ - 0.005], [s * x, top, L.bowZ - 0.012], [s * x, top, glacisAt(top + 0.012)],
      [s * x, bottom, L.lowerZ(bottom) - 0.01],
    ] as P3[])));
    P.add('hullDark', box(x1 - x0 - 0.08, 0.13, 0.02), s * xc, (top + bottom) / 2, L.bowZ - 0.012);
    KIT.headlight(P, s * (xc - 0.08), (top + bottom) / 2, L.bowZ - 0.035, 0, 0.055);
    P.add('hullDetail', box(0.07, 0.05, 0.02), s * (xc + 0.12), (top + bottom) / 2, L.bowZ - 0.010);
    for (const y of [bottom + 0.012, top - 0.012]) P.add('hullDark', box(x1 - x0 - 0.04, 0.014, 0.05), s * xc, y, L.bowZ + 0.008);
    for (const dx of [-0.12, 0, 0.12]) P.add('hullDark', box(0.014, top - bottom - 0.01, 0.014), s * (xc + dx), (top + bottom) / 2, L.bowZ + 0.032);
    const mz = glacisAt(top + 0.02) + 0.01, mx = s * (L.sideX - 0.08);
    P.add('hullDark', beamBetween([mx, top - 0.02, mz], [mx, 1.58, mz], 0.016, 8));
    P.add('hullDark', box(0.22, 0.30, 0.04), mx, 1.72, mz);
    P.add('hullGlass', box(0.19, 0.26, 0.006), mx, 1.72, mz - 0.022);
  }
  // the vane's two arms lying up the glacis on their brackets, and the grab handle in the middle
  for (const s of [-1, 1]) {
    const x = s * 0.74, z0 = L.noseZ - 0.14, z1 = L.noseZ - 0.72;
    const y0 = L.glacisY(z0) + 0.055, y1 = L.glacisY(z1) + 0.055;
    P.add('hullDetail', beamBetween([x, y0, z0], [x, y1, z1], 0.024, P.q ? 10 : 8));
    for (const z of [z0 + 0.04, z1 - 0.04]) {
      P.add('hullDetail', onPlane(box(0.06, 0.07, 0.07), 0.07, [x, L.glacisY(z), z], glacisPitch));
    }
  }
  // the grab handle: two posts standing off the glacis and the bar across them
  const handleZ = L.noseZ - 0.48, handleY = L.glacisY(handleZ);
  for (const dx of [-0.12, 0.12]) P.add('hullDark', onPlane(cylY(0.012, 0.012, 0.07, 6), 0.07, [dx, handleY, handleZ], glacisPitch));
  P.add('hullDark', onPlane(cylX(0.012, 0.26, 6), 0.024, [0, handleY, handleZ], glacisPitch, -0.048));
  // the tow hooks on the lower plate (photograph 02), laid on its rake
  const plateUp = Math.atan(0.61);
  for (const s of [-1, 1]) {
    const y = 0.60, z = L.lowerZ(y);
    const n: P3 = [0, -Math.sin(plateUp), Math.cos(plateUp)];
    const at = (d: number): P3 => [s * 0.46, y + n[1] * d, z + n[2] * d];
    P.add('hullDetail', box(0.18, 0.16, 0.10).rotateX(plateUp).translate(...at(0.04)));
    P.add('hullDark', box(0.06, 0.12, 0.06).rotateX(plateUp).translate(...at(0.06)).translate(0, -0.10, 0));
  }
}

/** The power pack's air box on the front right (photographs 01, 02, 08) and the driver's hatch front left. */
function hullDeck(P: TankBuilderPort, L: K200HullLayout): void {
  // the air box lying on the glacis, its top parallel to it 13 cm proud, its louvred front face near the nose
  const x0 = -1.30, x1 = -0.98, zb = L.glacisBreakZ + 0.30, zf = L.noseZ - 0.20, lift = 0.13;
  P.add('hull', convexBody([x0, x1].flatMap((x) => [
    [x, L.glacisY(zb) - 0.015, zb], [x, L.glacisY(zb) + lift, zb], [x, L.glacisY(zf) + lift, zf], [x, L.glacisY(zf) - 0.015, zf],
  ] as P3[])));
  P.add('hullDark', box(0.24, lift - 0.04, 0.012), (x0 + x1) / 2, L.glacisY(zf) + lift / 2, zf + 0.004);
  for (let k = 0; k < 2; k++) P.add('hullDetail', box(0.26, 0.014, 0.03), (x0 + x1) / 2, L.glacisY(zf) + 0.04 + k * 0.05, zf + 0.012);
  // the driver's hatch over his station, its three periscopes ahead of it at the roof's front edge, one to the left
  const hx = 0.55, hz = L.glacisBreakZ - 0.48;
  P.addHatch('hull', cylY(0.27, 0.27, 0.04, P.q ? 22 : 14), hx, L.roofY + 0.012, hz);
  P.add('hullDark', torus(0.27, 0.011, P.q ? 22 : 14, 4), hx, L.roofY + 0.032, hz);
  P.add('hullDark', box(0.06, 0.04, 0.10), hx, L.roofY + 0.045, hz - 0.20);
  for (const dx of [-0.17, 0, 0.17]) KIT.periscope(P, 'hullDetail', hx + dx, L.roofY + 0.025, L.glacisBreakZ - 0.11);
  KIT.periscope(P, 'hullDetail', hx + 0.32, L.roofY + 0.025, hz + 0.05, Math.PI / 2);
  // the power pack's access plate on the roof's front right, its two recessed handles (flush: the turret's nose sweeps
  // 4 cm over it)
  P.add('hullDetail', box(0.86, 0.012, 0.90), -0.55, L.roofY, L.glacisBreakZ - 0.57);
  for (const dz of [-0.27, 0.27]) P.add('hullDark', box(0.14, 0.008, 0.03), -0.55, L.roofY + 0.006, L.glacisBreakZ - 0.57 + dz);
  // lifting eyes at the roof's rear corners (the front pair would stand in the guns' depressed sweep on the K30)
  for (const s of [-1, 1]) KIT.liftEye(P, 'hullDetail', s * (L.sideX - 0.12), L.roofY + 0.012, L.rearZ + 0.12);
}

/** The rear plate: the ramp with its door in the left half, the hinge knuckles, the boxed tail lights, the tow eyes. */
function hullStern(P: TankBuilderPort, L: K200HullLayout): void {
  const z = L.rearZ, rampHalf = 0.72, rampBottom = L.rearPlateBottomY + 0.07, rampTop = L.roofY - 0.14;
  P.add('hullDetail', box(rampHalf * 2, rampTop - rampBottom, 0.024), 0, (rampTop + rampBottom) / 2, z - 0.007);
  P.add('hullDetail', box(0.56, 0.92, 0.014), 0.30, rampBottom + 0.10 + 0.46, z - 0.024);
  P.add('hullDark', box(0.04, 0.12, 0.03), 0.07, rampBottom + 0.58, z - 0.034);
  for (const x of [-0.55, 0, 0.55]) P.add('hullDark', cylX(0.05, 0.20, P.q ? 12 : 8), x, rampBottom - 0.01, z - 0.03);
  for (const s of [-1, 1]) {
    // the tail lights in their guard boxes on the upper corners
    P.add('hullDetail', box(0.26, 0.20, 0.10), s * 1.17, 1.60, z - 0.045);
    P.add('hullDark', box(0.18, 0.08, 0.012), s * 1.17, 1.62, z - 0.098);
    P.add('hullDark', box(0.20, 0.016, 0.10), s * 1.17, 1.71, z - 0.06);
    // the tow eyes low on the corners
    P.add('hullDetail', box(0.12, 0.14, 0.08), s * 0.88, 0.72, z - 0.035);
    P.add('hullDark', torus(0.045, 0.014, 10, 6).rotateZ(Math.PI / 2), s * 0.88, 0.70, z - 0.09);
  }
}

/** The K200 family's hull on the fleet's running gear. */
export function buildK200Hull(P: TankBuilderPort, L: K200HullLayout): void {
  hullBodies(P, L);
  hullBow(P, L);
  hullDeck(P, L);
  hullStern(P, L);
  const G = L.gear;
  KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: G.wheelR, wheelW: G.wheelW, wheelY: G.wheelY, xc: G.xc, dishR: 0.78,
    wheelZs: [...G.wheelZs], sprocket: { ...G.sprocket }, idler: { ...G.idler },
    rollers: [], deadSag: 0.12, trackW: G.trackW, topY: G.topY, arms: true, paintedEnds: true, sprocketTeeth: true,
    contactZF: G.wheelZs[0], contactZR: G.wheelZs[G.wheelZs.length - 1],
  });
}
