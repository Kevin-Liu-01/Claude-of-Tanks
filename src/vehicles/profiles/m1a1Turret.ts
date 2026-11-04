// Kevin B. Liu — the M1A1 turret shell measured from the owner's model (release 268 builder E): two planar special-armour
// cheeks swept ~36 degrees in plan and raked ~35 degrees, a roof that runs flat from the bustle and falls 8 degrees to the
// cheek tops, side walls on one 26-degree plane, a bustle that ends at a near-vertical rear face over the engine deck,
// and the narrow gun slot between the cheeks. Planes are fitted to the registered source (abrams-bradley-268-evidence/
// m1fid/measure.md; the cheeks take the mean of its two faces so they stay mirrored). Turret-local metres (the ring rig),
// +x vehicle left, +z forward. The source never enters the repository.
import * as THREE from 'three';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';

type Vec3 = readonly [number, number, number];

/** Measured planes (turret-local): x + WALL_K y = WALL_C; FACE: z = FACE_C - FACE_X |x| - FACE_Y y; roof slope
 * y = SLOPE_C - SLOPE_K z; underside (chin) y = CHIN_Y0 + CHIN_X (|x| - SLOT) + CHIN_Z (z - CHIN_Z0). */
export const M1A1_TURRET = Object.freeze({
  SLOT: 0.319,
  WALL_C: 1.5734, WALL_K: 0.4835,
  FACE_C: 2.3131, FACE_X: 0.7269, FACE_Y: 0.7053,
  SLOPE_C: 0.7671, SLOPE_K: 0.1418,
  ROOF: 0.709,
  FLOOR: -0.102,
  TOE_Z: 1.90,
  CHIN_Y0: -0.030, CHIN_X: 0.0282, CHIN_Z: 0.090, CHIN_Z0: 2.10,
  /** where the roof slope meets the flat roof; the cheeks end and the body begins here */
  KNEE_Z: 0.41,
  /** the bustle's rear face */
  REAR_Z: -2.56,
  /** the rear underside: from (REAR_KNEE_Z, REAR_KNEE_Y) it climbs to REAR_FOOT_Y at the rear face */
  REAR_KNEE_Z: -2.20, REAR_KNEE_Y: 0.093, REAR_FOOT_Y: 0.43,
});
const T = M1A1_TURRET;

export const m1a1WallX = (y: number): number => T.WALL_C - T.WALL_K * y;
export const m1a1RoofAt = (z: number): number => Math.min(T.ROOF, T.SLOPE_C - T.SLOPE_K * z);
export const m1a1FaceZ = (x: number, y: number): number => T.FACE_C - T.FACE_X * Math.abs(x) - T.FACE_Y * y;

type Plane = readonly [number, number, number, number]; // n . p = d
const PLANES: Readonly<Record<string, Plane>> = {
  inner: [1, 0, 0, T.SLOT],
  wall: [1, T.WALL_K, 0, T.WALL_C],
  face: [T.FACE_X, T.FACE_Y, 1, T.FACE_C],
  toe: [0, 0, 1, T.TOE_Z],
  slope: [0, 1, T.SLOPE_K, T.SLOPE_C],
  rear: [0, 0, 1, T.KNEE_Z],
  chin: [T.CHIN_X, -1, T.CHIN_Z, T.CHIN_X * T.SLOT + T.CHIN_Z * T.CHIN_Z0 - T.CHIN_Y0],
  floor: [0, 1, 0, T.FLOOR],
};
function meet(a: string, b: string, c: string): Vec3 {
  const [p, q, r] = [PLANES[a], PLANES[b], PLANES[c]];
  const m = new THREE.Matrix3().set(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]).invert();
  const v = new THREE.Vector3(p[3], q[3], r[3]).applyMatrix3(m);
  return [v.x, v.y, v.z];
}

/** The cheek's corners (+x side). */
export const M1A1_CHEEK = (() => {
  const toeTop = meet('inner', 'face', 'toe');        // slot edge where the toe cut leaves the face
  const toeBottom = meet('face', 'toe', 'chin');       // toe cut meets the face's bottom edge
  const toeFoot = meet('inner', 'toe', 'chin');        // toe cut at the slot, on the chin
  const outerBottom = meet('face', 'wall', 'chin');
  const outerTop = meet('face', 'wall', 'slope');
  const innerTop = meet('inner', 'face', 'slope');
  const roofOuter = meet('wall', 'slope', 'rear');
  const roofInner = meet('inner', 'slope', 'rear');
  const wallKnee = meet('wall', 'chin', 'floor');       // the chin reaches the floor along the wall
  const innerKnee = meet('inner', 'chin', 'floor');     // ... and along the slot
  const rearOuter = meet('wall', 'floor', 'rear');
  const rearInner = meet('inner', 'floor', 'rear');
  return Object.freeze({ toeTop, toeBottom, toeFoot, outerBottom, outerTop, innerTop, roofOuter, roofInner,
    wallKnee, innerKnee, rearOuter, rearInner });
})();

/** One cheek as a closed planar polyhedron. Triangles 0-2 are the front plane and 10-11 the roof course (no diagonal
 * fold on either); the right side reflects the triangles (abramsPlanarCheek's rule) so both are physical mirrors. */
export function m1a1CheekGeometry(side: number): THREE.BufferGeometry {
  const C = M1A1_CHEEK;
  const positions: number[] = [];
  const tri = (p: Vec3, q: Vec3, r: Vec3): void => {
    for (const v of side < 0 ? [p, r, q] : [p, q, r]) positions.push(side * v[0], v[1], v[2]);
  };
  // front plane (pentagon, the toe cut takes its lower inner corner), outward +z
  tri(C.toeBottom, C.outerBottom, C.outerTop); tri(C.toeBottom, C.outerTop, C.innerTop); tri(C.toeBottom, C.innerTop, C.toeTop);
  // outer wall (pentagon), outward +x
  tri(C.outerBottom, C.wallKnee, C.rearOuter); tri(C.outerBottom, C.rearOuter, C.roofOuter); tri(C.outerBottom, C.roofOuter, C.outerTop);
  // toe (vertical, outward +z)
  tri(C.toeFoot, C.toeBottom, C.toeTop);
  // chin (underside, outward -y)
  tri(C.toeFoot, C.innerKnee, C.wallKnee); tri(C.toeFoot, C.wallKnee, C.outerBottom); tri(C.toeFoot, C.outerBottom, C.toeBottom);
  // roof course (outward +y)
  tri(C.innerTop, C.outerTop, C.roofOuter); tri(C.innerTop, C.roofOuter, C.roofInner);
  // floor (outward -y)
  tri(C.innerKnee, C.rearInner, C.rearOuter); tri(C.innerKnee, C.rearOuter, C.wallKnee);
  // rear (outward -z)
  tri(C.rearInner, C.roofInner, C.roofOuter); tri(C.rearInner, C.roofOuter, C.rearOuter);
  // slot wall (outward -x), hexagon toeFoot..innerKnee..rearInner..roofInner..innerTop..toeTop
  tri(C.toeFoot, C.toeTop, C.innerTop); tri(C.toeFoot, C.innerTop, C.roofInner);
  tri(C.toeFoot, C.roofInner, C.rearInner); tri(C.toeFoot, C.rearInner, C.innerKnee);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3) uv.push(positions[i], positions[i + 2]);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

/** Corners of the cheek's front plane for surface-seated armour (inner-bottom, outer-bottom, outer-top, inner-top). */
export const M1A1_CHEEK_FRAME = Object.freeze({
  innerBottom: M1A1_CHEEK.toeBottom, outerBottom: M1A1_CHEEK.outerBottom,
  outerTop: M1A1_CHEEK.outerTop, innerTop: M1A1_CHEEK.innerTop,
});

/** The body and bustle: one loft from the knee to the rear face. Its underside keeps 1.5 cm over the hull deck under
 * every point of its plan at any heading (deckAt(z) is the hull deck, world z; the ring sits at ringZ, height ringY)
 * and climbs to the rear face; a centre course (|x| <= 0.9) stays on the floor over the ring bearing. */
export function m1a1TurretBodyGeometry(deckAt: (zWorld: number) => number, ringZ: number, ringY: number): THREE.BufferGeometry {
  // the highest hull deck the plan point at radius r can pass over as the turret turns (behind or ahead of the ring)
  const deckLocalAtRadius = (r: number): number => Math.max(deckAt(ringZ - r), deckAt(ringZ + r)) - ringY;
  const rearRise = (z: number): number => T.REAR_KNEE_Y + (T.REAR_FOOT_Y - T.REAR_KNEE_Y) * (T.REAR_KNEE_Z - z) / (T.REAR_KNEE_Z - T.REAR_Z);
  const under = (x: number, z: number): number => Math.max(T.FLOOR, deckLocalAtRadius(Math.hypot(x, z)) + 0.015,
    z < T.REAR_KNEE_Z ? rearRise(z) : -Infinity);
  const zs = [T.REAR_Z, -2.45, -2.33, T.REAR_KNEE_Z, -2.0, -1.8, -1.6, -1.4, -1.2, -1.0, -0.6, 0.0, T.KNEE_Z];
  const sections: SolidSection[] = zs.map((z) => {
    // the side corner's height and the wall x there are coupled: two passes settle them
    let ys = under(m1a1WallX(T.FLOOR), z);
    ys = under(m1a1WallX(ys), z);
    const yc = Math.min(ys, under(0.9, z));
    ys = Math.max(ys, yc + 0.001);
    const xb = m1a1WallX(ys), xt = m1a1WallX(T.ROOF);
    return { z, ring: [[-xb, ys], [-0.9, yc], [0.9, yc], [xb, ys], [xt, T.ROOF], [-xt, T.ROOF]] };
  });
  // convex diagonals: the underside courses twist between stations, and a fixed diagonal would fold the two sides differently
  return sectionSolid(sections, { sideQuadDiagonal: 'convex' });
}

/** Bustle underside height at (x, z) (for kit seated under it). */
export function m1a1BustleUnderside(deckAt: (zWorld: number) => number, ringZ: number, ringY: number, x: number, z: number): number {
  const r = Math.hypot(x, z);
  const rearRise = T.REAR_KNEE_Y + (T.REAR_FOOT_Y - T.REAR_KNEE_Y) * (T.REAR_KNEE_Z - z) / (T.REAR_KNEE_Z - T.REAR_Z);
  return Math.max(T.FLOOR, Math.max(deckAt(ringZ - r), deckAt(ringZ + r)) - ringY + 0.015, z < T.REAR_KNEE_Z ? rearRise : -Infinity);
}

/** Side profile (z, y) of the fixed turret between the cheeks: floor, the elevation recess (an arc of radius `recessR`
 * about the trunnion at (gunZ, gunY)), then the roof slope back to the knee. Extruded across the slot. */
export function m1a1SlotRecessGeometry(gunZ: number, gunY: number, recessR: number, segments: number): THREE.BufferGeometry {
  const profile = new THREE.Shape();
  const floorDy = T.FLOOR - gunY;
  const zFloor = gunZ - Math.sqrt(Math.max(0, recessR * recessR - floorDy * floorDy));
  // where the arc meets the roof slope (rear intersection)
  const a = 1 + T.SLOPE_K * T.SLOPE_K, cy = T.SLOPE_C - T.SLOPE_K * gunZ - gunY;
  const b = -2 * T.SLOPE_K * cy, c = cy * cy - recessR * recessR;
  const dz = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);     // rear root, z relative to the trunnion
  const yTop = gunY + cy - T.SLOPE_K * dz;
  profile.moveTo(T.KNEE_Z, T.FLOOR);
  profile.lineTo(zFloor, T.FLOOR);
  const a0 = Math.atan2(floorDy, -(zFloor - gunZ)), a1 = Math.atan2(yTop - gunY, -dz);
  for (let i = 1; i < segments; i++) {
    const ang = a0 + (a1 - a0) * (i / segments);
    profile.lineTo(gunZ - recessR * Math.cos(ang), gunY + recessR * Math.sin(ang));
  }
  profile.lineTo(gunZ + dz, yTop);
  profile.lineTo(T.KNEE_Z, m1a1RoofAt(T.KNEE_Z));
  profile.closePath();
  return new THREE.ExtrudeGeometry(profile, { depth: T.SLOT * 2, steps: 1, bevelEnabled: false })
    .rotateY(-Math.PI / 2).translate(T.SLOT, 0, 0);
}
