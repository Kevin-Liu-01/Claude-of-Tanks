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
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
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
const TOP_BREAK_Z = K2_SKIRT.crestZ + (1.66 - K2_SKIRT.topY + 0.005) / (0.42 / 2.23);

/** The skirt's top at a station: the run's line (the 1.56 deck +5 mm), and the glacis edge (+5 mm) once it falls below. */
function k2SkirtTopAt(z: number): number {
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

export function addK2Skirts(P: Modern3BuilderPort): void {
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
    const joints = S.moduleJoints;
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
/** The nose lip face under the glacis edge (buildK2's nose slab, x +-1.08): 3.51 at y 0.90, 3.555 at its 1.18 top. */
const k2NoseZ = (y: number): number => 3.51 + (y - 0.90) * (0.045 / 0.28);
const K2_NOSE_TILT = Math.atan(0.045 / 0.28);

/**
 * The K2 hull's upper glacis and nose furniture (r268b, owner 2026-11-02: "add more upper glacis and roof details"),
 * shared by the two buildK2 hulls (XK2 and K2B; research/xk2_black_panther photos 1, 5 and research/k2b photo 1, the
 * K2/XK2 bows at the Hyundai Rotem displays):
 * - the bolted upper-glacis armour: two transverse plate joints and a bolt row aft of each, a bolt row along the lip and
 *   down both edges (the photographs' rows of bolt heads over the plate);
 * - the driver's vision block: the three periscopes in one low armoured frame at the crest (the pre-r268b two loose
 *   blocks), the hatch's hinge block and grab handle;
 * - the nose: a recessed lamp housing at each end of the upper nose plate (a headlight in each, the right-hand one with
 *   the driving camera beside it), the bolted lower nose plate's bolt rows and joints, lifting eyes on the front corners.
 * Every part stays inside the gun's swept floor at full depression (the before-tree's map: 17-24 cm of air over the front
 * half, 7-9 cm over the crest's periscopes) and under the turret's 1.69 seat plane.
 */
export function addK2GlacisFurniture(P: Modern3BuilderPort, k2bBow: boolean): void {
  const { box, cylY, cylZ, liftEye } = KIT;
  const bolt = (x: number, z: number): void => {                                // 5 mm into the plate, 9 mm proud
    P.add('hullDetail', cylY(0.017, 0.017, 0.014, 6), x, k2GlacisY(z) + 0.002, z, K2_GLACIS_TILT, 0, 0);
  };
  const seam = (x0: number, x1: number, z: number): void => {
    P.add('hullDark', box(x1 - x0, 0.008, 0.016), (x0 + x1) / 2, k2GlacisY(z) - 0.001, z, K2_GLACIS_TILT, 0, 0);
  };
  // the plate joints and their bolt rows; on the K2B the corner fender boxes (x 1.14..1.80, from z 2.97) close the
  // front corners, so the forward rows stop short of them
  const hatch = { x0: -0.74, x1: -0.10, z0: 1.70, z1: 2.34 };
  const clearOf = (x: number, z: number): boolean => !(x > hatch.x0 && x < hatch.x1 && z > hatch.z0 && z < hatch.z1);
  // (forward of z 2.80 the XK2's rows also stop short of the raised bow-shoulder plates at its corners)
  const reach = (z: number): number => (z > 2.92 && k2bBow ? 1.06 : z > 2.80 ? 1.30 : 1.52);
  for (const z of [3.06, 2.50]) {
    seam(-reach(z), reach(z), z);
    for (let x = -reach(z) + 0.06; x <= reach(z) - 0.05; x += 0.215) if (clearOf(x, z - 0.06)) bolt(x, z - 0.06);
  }
  for (let x = -reach(3.42) + 0.06; x <= reach(3.42) - 0.05; x += 0.215) bolt(x, 3.42);
  for (const s of [-1, 1]) for (let z = 1.86; z <= 2.75; z += 0.215) bolt(s * 1.50, z);
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
  // the nose: a recessed lamp housing at each end of the upper nose plate, under the glacis edge
  for (const s of [-1, 1]) {
    const lx = s * 0.80, ly = 1.065, lz = k2NoseZ(ly);
    P.add('hullDark', box(0.34, 0.15, 0.012), lx, ly, lz - 0.002, K2_NOSE_TILT, 0, 0);          // recess back
    for (const dy of [-0.082, 0.082]) P.add('hull', box(0.37, 0.02, 0.045), lx, ly + dy, lz + 0.016, K2_NOSE_TILT, 0, 0);
    for (const dx of [-0.175, 0.175]) P.add('hull', box(0.02, 0.18, 0.045), lx + dx, ly, lz + 0.016, K2_NOSE_TILT, 0, 0);
    const hx = lx + s * 0.05;
    P.add('hullDetail', cylZ(0.058, 0.05, P.q ? 14 : 10), hx, ly, lz + 0.018, K2_NOSE_TILT, 0, 0); // headlight body
    P.add('hullGlass', markVehicleNightLens(cylZ(0.044, 0.008, P.q ? 14 : 10), 'headlight'), hx, ly, lz + 0.044, K2_NOSE_TILT, 0, 0);
    if (s > 0) {                                                                // the driving camera beside the right-hand lamp
      P.add('hullDetail', box(0.08, 0.09, 0.06), lx - 0.09, ly, lz + 0.02, K2_NOSE_TILT, 0, 0);
      P.add('hullGlass', box(0.04, 0.04, 0.006), lx - 0.09, ly + 0.01, lz + 0.051, K2_NOSE_TILT, 0, 0);
    }
  }
  // the bolted lower nose plate: bolt rows along its top and foot and two vertical joints with their bolts
  const noseBolt = (x: number, y: number): void => {
    P.add('hullDetail', cylZ(0.016, 0.014, 6), x, y, k2NoseZ(y) + 0.002, K2_NOSE_TILT, 0, 0);
  };
  for (let x = -1.00; x <= 1.001; x += 0.125) {
    noseBolt(x, 0.935);
    if (Math.abs(Math.abs(x) - 0.80) > 0.22) noseBolt(x, 1.145);
  }
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.014, 0.25, 0.010), s * 0.42, 1.04, k2NoseZ(1.04) - 0.002, K2_NOSE_TILT, 0, 0);
    for (const y of [0.99, 1.09]) noseBolt(s * 0.46, y);
  }
  // tow clevises under the bolted nose plate (photo 5): two ear plates on the chin face, a pin, and a shackle hanging
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
  // the XK2's amber marker on each fender face (the canted wedge's upright face, z 3.715; photo 1's "PV"/"ADD" fenders);
  // the K2B's corner fender boxes carry its own lamps
  if (!k2bBow) for (const s of [-1, 1]) {
    P.add('hull', box(0.13, 0.10, 0.05), s * 1.53, 1.115, 3.705);
    P.add('hullGlass', markVehicleNightLens(cylZ(0.034, 0.012, 12), 'marker', { tint: 'warm' }), s * 1.53, 1.115, 3.733);
  }
  // lifting eyes on the glacis's front corners, inboard of the fenders
  for (const s of [-1, 1]) liftEye(P, 'hullDetail', s * 0.98, k2GlacisY(3.24) + 0.012, 3.24);
}
