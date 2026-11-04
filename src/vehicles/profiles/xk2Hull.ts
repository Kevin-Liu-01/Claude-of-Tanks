// The K2 hull's side skirts (267, owner 2026-11-01: "update ... K2B, xK2"), shared by the two buildK2 hulls: the
// XK2 (with the owner's K1A1 turret) and the K2B. Rebuilt from the XK2 prototype photographs (research/xk2_black_panther
// photos 1-2, hulls painted "XK2") and the K2 front close-up (photo 5): ONE continuous deep armoured skirt from the front
// guard to the sprocket, its hem level at the road-wheel tops, its top lip closing onto the deck and following the glacis
// edge down to the guard; six bolted heavy armour modules over its front half, a plain rear run with panel joints, and
// the rear end cut up and back clear of the drive sprocket. The pre-267 skirt was a game print's sawtooth: deep teeth
// alternating with open notches over the wheels that the real hull never had.
//
// Frame: buildK2's hull frame (modern3.ts; deck 1.66, glacis crest z 1.30, the track's outer edge x 1.675).
import * as THREE from 'three';
import { KIT, convexSlab } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { Modern3BuilderPort } from '../modern3.ts';

/** Skirt datums (m). */
const K2_SKIRT = Object.freeze({
  innerX: 1.70, outerX: 1.74, lipX: 1.64,
  /** Module faces: the two front modules stand 6 cm proud of the plate, the rest 3.3 cm (267 round 2: half the round-1
   *  standoff, which read as deep boxes against the thin segmented K2 skirt). */
  frontModuleOuterX: 1.80, moduleOuterX: 1.773,
  /** The run's top: the lower mid deck's 1.56 plane (the line the side guns were cleared over); the outer chamfer. */
  /** The hem overlaps the road wheels' top quarter (tires 0.07..0.71; 267 round 3: it sat at their tops, 0.74). */
  hemY: 0.56, topY: 1.565, chamfer: 0.09, crestZ: 1.30,
  /** The hem rakes up from the front module's joint into the guard's foot (0.82 at z 3.18, the flare's). */
  frontRakeZ: 2.54, guardFootZ: 3.18, guardFootY: 0.82,
  frontZ: 3.30, rearZ: -3.30, tailStartZ: -2.62, tailHemY: 1.04,
  /** The heavy armour modules' joints, rear to front. */
  moduleJoints: Object.freeze([-0.50, 0.10, 0.70, 1.30, 1.90, 2.54, 3.17]),
});

/** buildK2's glacis plane at its x 1.66 edge: 1.66 at the crest (z 1.30), 1.24 at the lip (z 3.53). */
const glacisEdgeAt = (z: number): number => Math.max(1.24, 1.66 - (z - K2_SKIRT.crestZ) * (0.42 / 2.23));
/** Where the glacis edge falls through the run's top line. */
export const TOP_BREAK_Z =K2_SKIRT.crestZ + (1.66 - K2_SKIRT.topY + 0.005) / (0.42 / 2.23);

/** The skirt's top at a station: the run's line (the 1.56 deck +5 mm), and the glacis edge (+5 mm) once it falls below.
 *  (r269: the K2B's add-on skirt run, k2bHullKit.ts, follows this same line.) */
export function k2SkirtTopAt(z: number): number {
  return Math.min(K2_SKIRT.topY, glacisEdgeAt(z) + 0.005);
}

/** The hem: level, raked up into the front guard and cut up and back over the sprocket. */
function hemAt(z: number): number {
  const S = K2_SKIRT;
  if (z > S.guardFootZ) return S.guardFootY + (z - S.guardFootZ) / (S.frontZ - S.guardFootZ) * 0.08;
  if (z > S.frontRakeZ) return S.hemY + (z - S.frontRakeZ) / (S.guardFootZ - S.frontRakeZ) * (S.guardFootY - S.hemY);
  if (z < S.tailStartZ) return S.hemY + (S.tailStartZ - z) / (S.tailStartZ - S.rearZ) * (S.tailHemY - S.hemY);
  return S.hemY;
}

function mirrorRing(side: number, ring: readonly (readonly [number, number])[]): [number, number][] {
  return side < 0 ? ring.map(([x, y]) => [-x, y] as [number, number]).reverse() : ring.map(([x, y]) => [x, y] as [number, number]);
}

function skirtSection(side: number, z: number): SolidSection {
  const S = K2_SKIRT;
  const top = k2SkirtTopAt(z), hem = hemAt(z);
  // the plate, its broad outer top chamfer, and the top lip running in over the deck edge (never down into the track
  // lane); the chamfer keeps the guns' side depression the pre-267 skirt line allowed
  return { z, ring: mirrorRing(side, [
    [S.innerX, hem], [S.outerX, hem], [S.outerX, top - S.chamfer], [S.innerX, top],
    [S.lipX, top], [S.lipX, top - 0.035], [S.innerX, top - 0.035],
  ]) };
}

/** `heavyModules` false (r269, the K2B): its own bolted add-on run (k2bHullKit.ts) hangs on the plate instead of the six
 *  heavy modules, so they are not built under it (the XK2 keeps them). */
export function addK2Skirts(P: Modern3BuilderPort, options: { heavyModules?: boolean } = {}): void {
  const { box } = KIT;
  const S = K2_SKIRT;
  // Bow closure under the glacis plate, between the track lanes: the plate's underside (1.20 at z 3.41, rising aft)
  // stood 2-3 cm over the nose lip, a slit into a metre-deep well under the glacis (a pre-267 roof pocket). Solid now,
  // from the lower-bow top to just under the plate; x ±1.04 stays 3.5 cm inside each track lane.
  P.add('hull', convexSlab(
    [-1.04, 1.02, 2.85], [1.04, 1.02, 2.85], [1.04, 1.02, 3.40], [-1.04, 1.02, 3.40],
    [-1.04, 1.300, 2.85], [1.04, 1.300, 2.85], [1.04, 1.195, 3.40], [-1.04, 1.195, 3.40]));
  const stations = [S.rearZ, -2.96, S.tailStartZ, TOP_BREAK_Z, S.frontRakeZ, S.guardFootZ, S.frontZ];
  for (const side of [-1, 1]) {
    P.add('hull', sectionSolid(stations.map((z) => skirtSection(side, z))));
    // Heavy armour modules over the front half: thick bolted blocks standing on the plate with a dark joint between
    // each, their tops carrying on the plate's chamfer line, their outer top edge chamfered, a lifting lug on each.
    const joints = options.heavyModules === false ? [] : S.moduleJoints;
    for (let k = 0; k < joints.length - 1; k++) {
      const z0 = joints[k] + 0.002, z1 = joints[k + 1] - 0.002;                   // 4 mm seams (267 round 3: 16 mm gaps)
      const t0 = k2SkirtTopAt(z0) - S.chamfer, t1 = k2SkirtTopAt(z1) - S.chamfer;
      const h0 = hemAt(z0) + 0.005, h1 = hemAt(z1) + 0.005;
      const outer = k >= joints.length - 3 ? S.frontModuleOuterX : S.moduleOuterX;
      const xi = side * (S.outerX - 0.012), xo = side * outer, xc = side * (outer - 0.015);
      P.add('hull', convexSlab(
        [xi, h0, z0], [xo, h0, z0], [xo, h1, z1], [xi, h1, z1],
        [xi, t0, z0], [xc, t0 - 0.02, z0], [xc, t1 - 0.02, z1], [xi, t1, z1]));
      const mid = (z0 + z1) / 2, top = (t0 + t1) / 2;
      P.add('hullDetail', box(0.028, 0.045, 0.07), side * (outer - 0.005), top - 0.09, mid);
      for (const dz of [-0.2, 0.2]) {
        P.add('hullDark', box(0.012, 0.022, 0.022), side * (outer + 0.002), (h0 + h1) / 2 + 0.06, mid + dz * (z1 - z0));
      }
      const joint = new THREE.PlaneGeometry(0.014, Math.min(t0, t1) - Math.max(h0, h1) - 0.02);
      joint.rotateY(side * Math.PI / 2);
      P.add('hullDark', joint, side * (S.outerX + 0.001), (Math.min(t0, t1) + Math.max(h0, h1)) / 2, joints[k]);
    }
    // Plain rear run: panel joints and a hinge strip under the lip.
    const faceTop = S.topY - S.chamfer;
    for (const z of [-1.18, -1.86]) {
      const joint = new THREE.PlaneGeometry(0.014, faceTop - S.hemY - 0.04);
      joint.rotateY(side * Math.PI / 2);
      P.add('hullDark', joint, side * (S.outerX + 0.001), (faceTop + S.hemY) / 2, z);
    }
    P.add('hullDetail', box(0.012, 0.03, 2.05), side * (S.outerX + 0.004), faceTop - 0.05, -1.55);
    // Bow shoulder closure: the skirt now walls the space under the glacis edge, over the shoulder caps, so that
    // space is filled solid up to the glacis plate (no forward-facing well); it stays 7 cm over the front track run.
    const glacisAt = (z: number): number => 1.24 + (3.53 - z) * (0.42 / 2.23) - 0.004;
    P.add('hull', convexSlab(
      [side * 1.40, 1.15, 2.70], [side * S.innerX, 1.15, 2.70], [side * S.innerX, 1.15, 3.40], [side * 1.40, 1.15, 3.40],
      [side * 1.40, glacisAt(2.70), 2.70], [side * S.innerX, glacisAt(2.70), 2.70],
      [side * S.innerX, glacisAt(3.40), 3.40], [side * 1.40, glacisAt(3.40), 3.40]));
  }
}

/** buildK2's upper glacis plane: 1.24 at its lip (z 3.53) rising 10.7 degrees to the 1.66 crest (z 1.30). */
const K2_GLACIS = Object.freeze({ lipY: 1.24, lipZ: 3.53, slope: 0.42 / 2.23 });
const k2GlacisY = (z: number): number => K2_GLACIS.lipY + (K2_GLACIS.lipZ - z) * K2_GLACIS.slope;
/** The glacis's rake about x: a part turned by it stands on the plate's normal. */
const K2_GLACIS_TILT = Math.atan(K2_GLACIS.slope);

/**
 * The K2 hull's upper glacis furniture (r268b, owner 2026-11-02: "add more upper glacis and roof details"), shared by
 * the two buildK2 hulls (XK2 and K2B; research/xk2_black_panther photos 1, 5 and research/k2b photo 1). The photographed
 * plate is smooth: only the real, seated items are on it (r268b round 2, both blind critics: the round-1 bolt rows, plate
 * joints and nose-plate lamp housings "read as clutter the real vehicle does not carry"; the lights are in the boxes on
 * the mudguard tips):
 * - the driver's vision block: the three periscopes in one low armoured frame at the crest (the pre-r268b two loose
 *   blocks), the hatch's hinge block and grab handle;
 * - a lifting eye on each front corner of the plate;
 * - the tow clevises with their shackles on the chin (they replace buildK2's plain hook blocks).
 * Every part stays inside the gun's swept floor at full depression (the before-tree's map: 17-24 cm of air over the front
 * half, 7-9 cm over the crest's periscopes) and under the turret's 1.69 seat plane.
 */
export function addK2GlacisFurniture(P: Modern3BuilderPort): void {
  const { box, cylY, cylZ, liftEye } = KIT;
  // driver's vision block: one low armoured frame over three periscopes at the crest, its foot 1 cm into the plate, its
  // top 1.655 (under the old blocks' 1.66: the gun keeps 6-7 cm over it at full depression), its forward face laid back
  // 35 degrees with the three dark glass blocks on it
  const zf = 1.60, zb = 1.46, yTop = 1.655, zTop = zf - 0.05;
  P.add('hull', convexSlab(
    [-0.70, k2GlacisY(zb) - 0.01, zb], [-0.22, k2GlacisY(zb) - 0.01, zb], [-0.22, k2GlacisY(zf) - 0.01, zf], [-0.70, k2GlacisY(zf) - 0.01, zf],
    [-0.70, yTop, zb], [-0.22, yTop, zb], [-0.22, yTop, zTop], [-0.70, yTop, zTop]));
  const faceTilt = -Math.atan2(zf - zTop, yTop - (k2GlacisY(zf) - 0.01));                   // the face's normal: up and forward
  const fy = (k2GlacisY(zf) + yTop) / 2, fz = zf - (fy - (k2GlacisY(zf) - 0.01)) / (yTop - (k2GlacisY(zf) - 0.01)) * (zf - zTop);
  const fn = new THREE.Vector3(0, -Math.sin(faceTilt), Math.cos(faceTilt));
  for (const x of [-0.62, -0.46, -0.30]) {
    P.add('hullDark', box(0.14, 0.040, 0.008), x, fy + fn.y * 0.002, fz + fn.z * 0.002, faceTilt, 0, 0);
    P.add('hullGlass', box(0.11, 0.024, 0.006), x, fy + fn.y * 0.005, fz + fn.z * 0.005, faceTilt, 0, 0);
  }
  // hatch hinge block (outboard side of the ring) and a grab handle on the lid, both on the bed plate's rake
  const hy = (z: number): number => k2GlacisY(z) + 0.004;
  P.add('hullDetail', box(0.07, 0.045, 0.20), -0.72, hy(2.02) + 0.02, 2.02, K2_GLACIS_TILT, 0, 0);
  P.add('hullDark', cylZ(0.016, 0.22, 8), -0.72, hy(2.02) + 0.04, 2.02, K2_GLACIS_TILT, 0, 0);
  for (const dz of [-0.06, 0.06]) P.add('hullDetail', cylY(0.009, 0.009, 0.03, 6), -0.42, hy(2.02 + dz) + 0.032, 2.02 + dz, K2_GLACIS_TILT, 0, 0);
  P.add('hullDetail', cylZ(0.009, 0.14, 6), -0.42, hy(2.02) + 0.046, 2.02, K2_GLACIS_TILT, 0, 0);
  // tow clevises on the chin under the nose plate (photo 5): two ear plates on the chin face, a pin, and a shackle hanging
  // from it, leaning off the face (they replace buildK2's plain hook blocks)
  const chinZ = (y: number): number => 3.33 + (y - 0.40) * 0.36, chinTilt = Math.atan(0.36 / 1.0);
  for (const s of [-1, 1]) {
    const cx = s * 0.62, cy = 0.77, cz = chinZ(cy);
    for (const dx of [-0.045, 0.045]) P.add('hullDetail', box(0.025, 0.11, 0.10), cx + dx, cy, cz + 0.025, chinTilt, 0, 0);
    P.add('hullDark', KIT.cylX(0.020, 0.13, 8), cx, cy - 0.01, cz + 0.05);
    const shackle = new THREE.TorusGeometry(0.045, 0.014, 6, P.q ? 12 : 8, Math.PI);
    shackle.rotateZ(Math.PI).rotateX(-0.35);
    P.add('hullDark', shackle, cx, cy - 0.01, cz + 0.05);
  }
  // lifting eyes on the glacis's front corners, inboard of the fenders
  for (const s of [-1, 1]) liftEye(P, 'hullDetail', s * 0.98, k2GlacisY(3.24) + 0.012, 3.24);
}
