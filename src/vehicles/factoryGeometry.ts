// Strict, cycle-free geometry primitives shared by the procedural vehicle factory.
// These functions intentionally contain no vehicle policy or runtime state.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cachedRoundedBoxGeometry } from './roundedBoxGeometryCache.ts';

// Existing authored profiles build points incrementally, so their inferred
// type is number[] rather than a fixed tuple. Named accessors inside this
// module keep that compatibility detail from spreading into factory policy.
export type Point2 = readonly number[];
export type Point3 = readonly number[];
export type Scale3 = readonly [x: number, y: number, z: number];
type LoftStation = readonly [x: number, z: number];

type StationValue = number | readonly number[]
  | ((point: LoftStation, index: number) => number);

export interface PolyMultiLoftRing {
  height: StationValue;
  inset?: StationValue;
  centerHeight?: number;
  offsetX?: number;
  offsetZ?: number;
}

interface StraightRidgeGunMaskOptions {
  rearHalfWidth: number;
  rearHalfHeight: number;
  ridgeHalfWidth: number;
  rearZ: number;
  ridgeZ: number;
}

export function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = state + 0x6D2B79F5 | 0;
    let mixed = Math.imul(state ^ state >>> 15, 1 | state);
    mixed = mixed + Math.imul(mixed ^ mixed >>> 7, 61 | mixed) ^ mixed;
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

export function xform<T extends THREE.BufferGeometry>(
  geometry: T,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  scale: number | Scale3 = 1,
): T {
  const resolvedScale: Scale3 = typeof scale === 'number'
    ? [scale, scale, scale]
    : scale;
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(resolvedScale[0], resolvedScale[1], resolvedScale[2]),
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}

export function box(width: number, height: number, depth: number): THREE.BufferGeometry {
  const minimumDimension = Math.min(width, height, depth);
  if (minimumDimension < 0.06) return new THREE.BoxGeometry(width, height, depth);
  const radius = Math.min(0.024, minimumDimension * 0.24);
  return cachedRoundedBoxGeometry(
    width,
    height,
    depth,
    minimumDimension > 0.5 ? 2 : 1,
    radius,
  );
}

export function cylY(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments = 16,
  openEnded = false,
  thetaStart = 0,
  thetaLength = Math.PI * 2,
): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(
    radiusTop,
    radiusBottom,
    height,
    segments,
    1,
    openEnded,
    thetaStart,
    thetaLength,
  );
}

export function cylX(
  radius: number,
  length: number,
  segments = 16,
  secondRadius?: number | null,
): THREE.BufferGeometry {
  return xform(cylY(radius, secondRadius ?? radius, length, segments), 0, 0, 0, 0, 0, Math.PI / 2);
}

export function cylZ(
  radius: number,
  length: number,
  segments = 16,
  secondRadius?: number | null,
): THREE.BufferGeometry {
  return xform(cylY(radius, secondRadius ?? radius, length, segments), 0, 0, 0, Math.PI / 2);
}

export function sph(
  radius: number,
  segments = 16,
  thetaLength?: number | null,
): THREE.BufferGeometry {
  return new THREE.SphereGeometry(
    radius,
    segments,
    Math.max(8, segments >> 1),
    0,
    Math.PI * 2,
    0,
    thetaLength ?? Math.PI,
  );
}

export function torus(
  radius: number,
  tube: number,
  radialSegments = 16,
  tubularSegments = 8,
): THREE.BufferGeometry {
  return xform(
    new THREE.TorusGeometry(radius, tube, tubularSegments, radialSegments),
    0,
    0,
    0,
    Math.PI / 2,
  );
}

export function lathe(
  profile: readonly (readonly number[])[],
  segments = 28,
  zScale = 1,
): THREE.BufferGeometry {
  const points = profile.map((station) => (
    new THREE.Vector2(Math.max(station[0], 0.001), station[1])
  ));
  return xform(new THREE.LatheGeometry(points, segments), 0, 0, 0, 0, 0, 0, [1, 1, zScale]);
}

export function slab(
  bottom0: Point3,
  bottom1: Point3,
  bottom2: Point3,
  bottom3: Point3,
  top0: Point3,
  top1: Point3,
  top2: Point3,
  top3: Point3,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const quad = (a: Point3, b: Point3, c: Point3, d: Point3): void => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  quad(bottom0, bottom1, top1, top0);
  quad(bottom1, bottom2, top2, top1);
  quad(bottom2, bottom3, top3, top2);
  quad(bottom3, bottom0, top0, top3);
  quad(top0, top1, top2, top3);
  quad(bottom3, bottom2, bottom1, bottom0);
  return geometryFromTriangles(positions);
}

export function frustum(
  bottomHalfWidth: number,
  bottomFrontZ: number,
  bottomRearZ: number,
  topHalfWidth: number,
  topFrontZ: number,
  topRearZ: number,
  bottomY: number,
  topY: number,
): THREE.BufferGeometry {
  return slab(
    [-bottomHalfWidth, bottomY, bottomFrontZ],
    [bottomHalfWidth, bottomY, bottomFrontZ],
    [bottomHalfWidth, bottomY, bottomRearZ],
    [-bottomHalfWidth, bottomY, bottomRearZ],
    [-topHalfWidth, topY, topFrontZ],
    [topHalfWidth, topY, topFrontZ],
    [topHalfWidth, topY, topRearZ],
    [-topHalfWidth, topY, topRearZ],
  );
}

function stationValue(value: StationValue, plan: readonly Point2[], index: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'function') {
    const point = plan[index];
    return value([point[0], point[1]], index);
  }
  const station = value[index];
  if (station === undefined) throw new RangeError(`Missing loft station ${index}`);
  return station;
}

function planCenter(plan: readonly Point2[]): Point2 {
  if (plan.length === 0) throw new RangeError('Loft plan must contain at least one point');
  const sums = plan.reduce<Point2>(
    ([sumX, sumZ], [x, z]) => [sumX + x, sumZ + z],
    [0, 0],
  );
  return [sums[0] / plan.length, sums[1] / plan.length];
}

function scaledRing(
  plan: readonly Point2[],
  height: StationValue,
  inset: StationValue,
  center: Point2,
  offsetX = 0,
  offsetZ = 0,
): Point3[] {
  const [centerX, centerZ] = center;
  return plan.map(([x, z], index) => {
    const scale = stationValue(inset, plan, index);
    return [
      centerX + (x - centerX) * scale + offsetX,
      stationValue(height, plan, index),
      centerZ + (z - centerZ) * scale + offsetZ,
    ];
  });
}

/** Triangulate an outward-ordered welded quad along its convex ridge.
 * All four authored corners remain fixed. This is opt-in for faceted armor;
 * cast surfaces keep their existing tessellation and normal treatment. */
export function pushConvexQuad(
  positions: number[], a: Point3, b: Point3, c: Point3, d: Point3,
): void {
  const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
  const ac = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
  const n = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
  const otherSide = n[0]*(d[0]-a[0])+n[1]*(d[1]-a[1])+n[2]*(d[2]-a[2]);
  if (otherSide > 1e-12) positions.push(...a,...b,...d,...b,...c,...d);
  else positions.push(...a,...b,...c,...a,...c,...d);
}

function pushOrientedSides(
  positions: number[],
  lower: readonly Point3[],
  upper: readonly Point3[],
  center: Point2,
  convexSideQuads = false,
): void {
  const [centerX, centerZ] = center;
  const triangle = (a: Point3, b: Point3, c: Point3): void => {
    positions.push(...a, ...b, ...c);
  };
  for (let index = 0; index < lower.length; index++) {
    const next = (index + 1) % lower.length;
    const midpointX = (lower[index][0] + lower[next][0]) / 2 - centerX;
    const midpointZ = (lower[index][2] + lower[next][2]) / 2 - centerZ;
    const edgeX = lower[next][0] - lower[index][0];
    const edgeZ = lower[next][2] - lower[index][2];
    if (convexSideQuads) {
      if (edgeX * midpointZ - edgeZ * midpointX > 0)
        pushConvexQuad(positions, lower[index], lower[next], upper[next], upper[index]);
      else pushConvexQuad(positions, lower[next], lower[index], upper[index], upper[next]);
    } else if (edgeX * midpointZ - edgeZ * midpointX > 0) {
      triangle(lower[index], lower[next], upper[next]);
      triangle(lower[index], upper[next], upper[index]);
    } else {
      triangle(lower[next], lower[index], upper[index]);
      triangle(lower[next], upper[index], upper[next]);
    }
  }
}

function pushTopFan(
  positions: number[],
  ring: readonly Point3[],
  center: Point2,
  centerHeight?: number,
): void {
  const [centerX, centerZ] = center;
  const y = centerHeight ?? ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
  const centerPoint: Point3 = [centerX, y, centerZ];
  for (let index = 0; index < ring.length; index++) {
    const next = (index + 1) % ring.length;
    const normalY = (ring[next][2] - ring[index][2]) * (centerX - ring[index][0])
      - (ring[next][0] - ring[index][0]) * (centerZ - ring[index][2]);
    if (normalY > 0) positions.push(...ring[index], ...ring[next], ...centerPoint);
    else positions.push(...ring[next], ...ring[index], ...centerPoint);
  }
}

export function polyTurret(
  plan: readonly Point2[],
  height: number,
  flare = 1.08,
  inset = 0.78,
  // TANK-OPT companions (227): a prism that hangs below the ring is seen from underneath once a cook-off throws the
  // turret, so it can close its bottom with an outward fan on the lower ring. Off by default: every existing caller
  // keeps its bytes.
  closeBottom = false,
): THREE.BufferGeometry {
  const center = planCenter(plan);
  const lower = scaledRing(plan, 0, flare, center);
  const upper = scaledRing(plan, height, inset, center);
  const positions: number[] = [];
  pushOrientedSides(positions, lower, upper, center);
  pushTopFan(positions, upper, center, height);
  if (closeBottom) pushOrientedFan(positions, lower, center, false, 0);
  return geometryFromTriangles(positions);
}

export function polyLoft(
  plan: readonly Point2[],
  bottom: StationValue,
  top: StationValue,
  inset: StationValue = 0.78,
): THREE.BufferGeometry {
  const center = planCenter(plan);
  const lower = plan.map(([x, z], index): Point3 => [
    x,
    stationValue(bottom, plan, index),
    z,
  ]);
  const upper = scaledRing(plan, top, inset, center);
  const positions: number[] = [];
  pushOrientedSides(positions, lower, upper, center);
  pushTopFan(positions, upper, center);
  return geometryFromTriangles(positions);
}

/**
 * A cast shell's plan and rings refined for a continuous casting (owner 2026-10-25: "update the type 74 and stb 1 tanks
 * completely fullly, making these tanks no longer look really outdated"; the 18-station, five-ring lofts rendered as
 * faceted polygons). Each plan segment gains `planSteps - 1` stations on a uniform Catmull-Rom spline through the
 * authored stations, which all stay exactly where they were; per-station ring values follow linearly. Between
 * consecutive rings, `ringSteps - 1` rings follow a Catmull-Rom curve through the rings' heights and insets at each
 * station, clamped to that ring pair's own range, so the shell rounds its shoulder and crown without ever standing
 * outside the measured envelope. Function-valued stations are not supported.
 */
export function refineCastLoft(
  plan: readonly Point2[],
  rings: readonly PolyMultiLoftRing[],
  { planSteps = 2, ringSteps = 2 }: { readonly planSteps?: number; readonly ringSteps?: number } = {},
): { plan: Point2[]; rings: PolyMultiLoftRing[] } {
  const n = plan.length;
  const spline = (a: number, b: number, c: number, d: number, t: number): number =>
    0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  const refinedPlan: Point2[] = [];
  const source: Array<readonly [number, number]> = [];
  for (let index = 0; index < n; index++) {
    const p0 = plan[(index - 1 + n) % n], p1 = plan[index], p2 = plan[(index + 1) % n], p3 = plan[(index + 2) % n];
    for (let step = 0; step < planSteps; step++) {
      const t = step / planSteps;
      refinedPlan.push(t === 0 ? [p1[0], p1[1]]
        : [spline(p0[0], p1[0], p2[0], p3[0], t), spline(p0[1], p1[1], p2[1], p3[1], t)]);
      source.push([index, t]);
    }
  }
  const stations = (value: StationValue): number[] => {
    if (typeof value === 'function') throw new TypeError('refineCastLoft: function-valued stations are not supported');
    return source.map(([index, t]) => {
      const a = typeof value === 'number' ? value : value[index];
      const b = typeof value === 'number' ? value : value[(index + 1) % n];
      if (a === undefined || b === undefined) throw new RangeError(`Missing loft station ${index}`);
      return a + (b - a) * t;
    });
  };
  const base = rings.map((ring) => ({ height: stations(ring.height), inset: stations(ring.inset ?? 1), ring }));
  const refinedRings: PolyMultiLoftRing[] = [];
  const last = base.length - 1;
  for (let index = 0; index < last; index++) {
    const r0 = base[Math.max(0, index - 1)], r1 = base[index], r2 = base[index + 1], r3 = base[Math.min(last, index + 2)];
    for (let step = 0; step < ringSteps + (index === last - 1 ? 1 : 0); step++) {
      const t = step / ringSteps;
      const curve = (key: 'height' | 'inset'): number[] => r1[key].map((value, station) => {
        const next = r2[key][station];
        const raw = spline(r0[key][station], value, next, r3[key][station], t);
        return Math.min(Math.max(raw, Math.min(value, next)), Math.max(value, next));
      });
      const ring: PolyMultiLoftRing = {
        height: curve('height'),
        inset: curve('inset'),
        offsetX: (r1.ring.offsetX ?? 0) + ((r2.ring.offsetX ?? 0) - (r1.ring.offsetX ?? 0)) * t,
        offsetZ: (r1.ring.offsetZ ?? 0) + ((r2.ring.offsetZ ?? 0) - (r1.ring.offsetZ ?? 0)) * t,
      };
      if (index === 0 && step === 0 && r1.ring.centerHeight !== undefined) ring.centerHeight = r1.ring.centerHeight;
      if (index === last - 1 && step === ringSteps && r2.ring.centerHeight !== undefined) ring.centerHeight = r2.ring.centerHeight;
      refinedRings.push(ring);
    }
  }
  return { plan: refinedPlan, rings: refinedRings };
}

export function polyMultiLoft(
  plan: readonly Point2[],
  rings: readonly PolyMultiLoftRing[],
  options: { readonly convexSideQuads?: boolean } = {},
): THREE.BufferGeometry {
  if (rings.length < 2) throw new Error('polyMultiLoft requires at least two rings');
  const center = planCenter(plan);
  const ringCenters = rings.map((ring): Point2 => [
    center[0] + (ring.offsetX ?? 0),
    center[1] + (ring.offsetZ ?? 0),
  ]);
  const resolved = rings.map((ring) => scaledRing(
    plan,
    ring.height,
    ring.inset ?? 1,
    center,
    ring.offsetX ?? 0,
    ring.offsetZ ?? 0,
  ));
  const positions: number[] = [];
  for (let index = 0; index < resolved.length - 1; index++) {
    pushOrientedSides(positions, resolved[index], resolved[index + 1], [
      (ringCenters[index][0] + ringCenters[index + 1][0]) * 0.5,
      (ringCenters[index][1] + ringCenters[index + 1][1]) * 0.5,
    ], options.convexSideQuads);
  }
  // sealed check 2026-09-13: the caps used to inherit the plan's winding, so a
  // counter-clockwise plan (the T-14 roof) produced an inside-out lid whose top
  // face was culled and let the camera look into the turret. Both caps are now
  // oriented from their own geometry — outward regardless of plan order.
  pushOrientedFan(positions, resolved[0], ringCenters[0], false, rings[0].centerHeight);
  const finalIndex = resolved.length - 1;
  pushOrientedFan(positions, resolved[finalIndex], ringCenters[finalIndex], true,
    rings[finalIndex].centerHeight);
  return geometryFromTriangles(positions);
}

/** Cap fan whose normal points up (top) or down (bottom) whatever the ring's winding. */
function pushOrientedFan(
  positions: number[],
  ring: readonly Point3[],
  center: Point2,
  top: boolean,
  centerHeight?: number,
): void {
  const [centerX, centerZ] = center;
  const y = centerHeight ?? ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
  const centerPoint: Point3 = [centerX, y, centerZ];
  for (let index = 0; index < ring.length; index++) {
    const next = (index + 1) % ring.length;
    const normalY = (ring[next][2] - ring[index][2]) * (centerX - ring[index][0])
      - (ring[next][0] - ring[index][0]) * (centerZ - ring[index][2]);
    const upward = normalY > 0;
    if (upward === top) positions.push(...ring[index], ...ring[next], ...centerPoint);
    else positions.push(...ring[next], ...ring[index], ...centerPoint);
  }
}

export function straightRidgeGunMask({
  rearHalfWidth,
  rearHalfHeight,
  ridgeHalfWidth,
  rearZ,
  ridgeZ,
}: StraightRidgeGunMaskOptions): THREE.BufferGeometry {
  if (rearHalfWidth <= 0 || rearHalfHeight <= 0
      || ridgeHalfWidth <= 0 || ridgeZ <= rearZ) {
    throw new RangeError('straightRidgeGunMask expects positive dimensions and a forward ridge');
  }
  const back: readonly Point3[] = [
    [-rearHalfWidth, -rearHalfHeight, rearZ],
    [rearHalfWidth, -rearHalfHeight, rearZ],
    [rearHalfWidth, rearHalfHeight, rearZ],
    [-rearHalfWidth, rearHalfHeight, rearZ],
  ];
  const ridgeLeft: Point3 = [-ridgeHalfWidth, 0, ridgeZ];
  const ridgeRight: Point3 = [ridgeHalfWidth, 0, ridgeZ];
  const positions: number[] = [];
  const triangle = (a: Point3, b: Point3, c: Point3): void => {
    positions.push(...a, ...b, ...c);
  };
  triangle(back[0], back[3], back[2]);
  triangle(back[0], back[2], back[1]);
  triangle(back[3], ridgeLeft, ridgeRight);
  triangle(back[3], ridgeRight, back[2]);
  triangle(back[0], back[1], ridgeRight);
  triangle(back[0], ridgeRight, ridgeLeft);
  triangle(back[0], ridgeLeft, back[3]);
  triangle(back[1], back[2], ridgeRight);
  return geometryFromTriangles(positions);
}

function geometryFromTriangles(positions: readonly number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2),
  );
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Vertex colour for a painted mesh that bypasses the camouflage buckets: the hull paint reads vertex colour, and the
 * buckets bake it (tankFactoryCore.ts bakeDirt); without one a mesh renders black. Bakes the buckets' face shading
 * (down faces 0.72, up faces 0.84 of a vertical face) so the part sits in the same paint family as the hull around it.
 */
export function paintedSurfaceShade(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const normal = geometry.getAttribute('normal');
  if (!normal) throw new Error('paintedSurfaceShade requires a normal attribute');
  const shade = new Float32Array(normal.count * 3);
  for (let index = 0; index < normal.count; index++) {
    const ny = normal.getY(index), ao = (1 - Math.max(0, -ny) * 0.28) * (1 - Math.max(0, ny) * 0.16);
    shade[index * 3] = shade[index * 3 + 1] = shade[index * 3 + 2] = ao;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  return geometry;
}

export function boxUV(geometry: THREE.BufferGeometry, scale = 0.35): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal) throw new Error('boxUV requires position and normal attributes');
  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index++) {
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const nz = Math.abs(normal.getZ(index));
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = position.getX(index);
      v = position.getZ(index);
    } else if (nx >= nz) {
      u = position.getZ(index);
      v = position.getY(index);
    } else {
      u = position.getX(index);
      v = position.getY(index);
    }
    uv[index * 2] = u * scale;
    uv[index * 2 + 1] = v * scale;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/**
 * boxUV with the projection axis chosen per triangle from its face normal, for non-indexed merged geometry.
 * A rounded box's bevels carry blended vertex normals, so boxUV could project one triangle's corners onto
 * different axes: the UVs jumped across the face and mipmapping smeared the camouflage to one flat tone
 * (the T-90AM's glacis and ERA blocks, 2026-10-11). Each triangle keeps one axis here.
 */
export function faceBoxUV(geometry: THREE.BufferGeometry, scale = 0.35): THREE.BufferGeometry {
  if (geometry.index) return boxUV(geometry, scale);
  const position = geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let index = 0; index + 2 < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    const normal = b.sub(a).cross(c.sub(a));
    const nx = Math.abs(normal.x), ny = Math.abs(normal.y), nz = Math.abs(normal.z);
    const axis = ny >= nx && ny >= nz ? 1 : nx >= nz ? 0 : 2;
    for (let corner = index; corner < index + 3; corner++) {
      const x = position.getX(corner), y = position.getY(corner), z = position.getZ(corner);
      uv[corner * 2] = (axis === 0 ? z : x) * scale;
      uv[corner * 2 + 1] = (axis === 1 ? z : y) * scale;
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/**
 * A profile's camouflage split on a merged surface, applied after its projection (253: the KF51's coarser turret and
 * finer hull, profiles/leopard.ts): each UV scaled by `k`, offset by (du, dv), then turned by `th` radians. The surface
 * records it (`geometry.userData.camoUvRemap`) so a later vertex edit re-projects into the same frame.
 */
export type CamoUvRemap = readonly [k: number, du: number, dv: number, th: number];

/** One UV through a camouflage split, in the profile's own arithmetic order (so re-projected values compare exactly). */
function camoUvRemapped(u: number, v: number, [k, du, dv, th]: CamoUvRemap): [number, number] {
  const c = Math.cos(th), s = Math.sin(th), U = u * k + du, V = v * k + dv;
  return [Math.fround(c * U - s * V), Math.fround(s * U + c * V)];
}

/** Apply a camouflage split to a merged surface's UVs and record it on the geometry (see CamoUvRemap). */
export function remapCamoUv(geometry: THREE.BufferGeometry, remap: CamoUvRemap): void {
  const uv = geometry.getAttribute('uv');
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) {
    const [u, v] = camoUvRemapped(uv.getX(i), uv.getY(i), remap);
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  geometry.userData.camoUvRemap = remap;
}

/**
 * 253 (camo sliding on seated turrets): re-project a face-projected surface's UVs where a later edit moved vertices
 * (the turret seat, turretSeatRace.ts, lifts a merged turret's low corners after faceBoxUV ran, so the camo stayed
 * where the corner had been). `before` is the geometry as projected, `after` its edited copy (same vertex order,
 * non-indexed); only triangles with a moved corner change. Each such corner takes the projection its stored UV came
 * from: the face projection (faceBoxUV) along the edited triangle's own axis; a thin part's whole-part axis
 * (thinPartBoxUV) along that axis; a shifted part's (shiftPartCamouflage) the new face projection plus its shift. A
 * surface with a camouflage split (`remap`, CamoUvRemap) compares and writes its projections through it.
 */
export function reprojectMovedFaceBoxUV(before: THREE.BufferGeometry, after: THREE.BufferGeometry, scale: number,
  remap: CamoUvRemap | null = null): number {
  if (before.index || after.index) return 0;
  const was = before.getAttribute('position'), now = after.getAttribute('position'), uv = after.getAttribute('uv');
  if (!was || !now || !uv || was.count !== now.count) return 0;
  const f = Math.fround;
  const axisOf = (position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, index: number): number => {
    const ax = position.getX(index), ay = position.getY(index), az = position.getZ(index);
    const e1x = position.getX(index + 1) - ax, e1y = position.getY(index + 1) - ay, e1z = position.getZ(index + 1) - az;
    const e2x = position.getX(index + 2) - ax, e2y = position.getY(index + 2) - ay, e2z = position.getZ(index + 2) - az;
    const nx = Math.abs(e1y * e2z - e1z * e2y), ny = Math.abs(e1z * e2x - e1x * e2z), nz = Math.abs(e1x * e2y - e1y * e2x);
    return ny >= nx && ny >= nz ? 1 : nx >= nz ? 0 : 2;
  };
  const project = (position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, axis: number): [number, number] => {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const u = f((axis === 0 ? z : x) * scale), v = f((axis === 1 ? z : y) * scale);
    return remap ? camoUvRemapped(u, v, remap) : [u, v];
  };
  let moved = 0;
  for (let index = 0; index + 2 < now.count; index += 3) {
    let edited = false;
    for (let i = index; i < index + 3 && !edited; i++) {
      edited = was.getX(i) !== now.getX(i) || was.getY(i) !== now.getY(i) || was.getZ(i) !== now.getZ(i);
    }
    if (!edited) continue;
    const oldAxis = axisOf(was, index), newAxis = axisOf(now, index);
    for (let i = index; i < index + 3; i++) {
      const stored: [number, number] = [uv.getX(i), uv.getY(i)];
      const same = (p: [number, number]): boolean => p[0] === stored[0] && p[1] === stored[1];
      const face = project(was, i, oldAxis);
      let next: [number, number];
      if (same(face)) next = project(now, i, newAxis);
      else {
        const part = [0, 1, 2].find((axis) => axis !== oldAxis && same(project(was, i, axis)));
        if (part !== undefined) next = project(now, i, part);
        else {
          const p = project(now, i, newAxis);
          next = [f(p[0] + stored[0] - face[0]), f(p[1] + stored[1] - face[1])];
        }
      }
      uv.setXY(i, next[0], next[1]);
    }
    moved++;
  }
  if (moved) uv.needsUpdate = true;
  return moved;
}

/**
 * The camouflage projection of a merged bucket's plate-like parts (2026-10-22, lane 240; critic on the M1A1 HC's
 * three-tone: "camo patches with hard straight edges"). faceBoxUV projects each triangle along its own normal, so the
 * narrow faces of a plate or a cassette (a skirt module's ends and top, a rib's edge, an armour tile's sides) sample
 * the tile along a single line: bars of whatever colour that line crosses, cut square at the module's corners, and a
 * skirt of cassettes reads as blocks of black and brown. A part that is plate-like (its thinnest dimension under
 * `plateK` of its middle one) and either thinner than `thinM` or small (at most `plateM` thick and `smallM` long) is
 * projected whole along its thin axis, so its edges carry on the paint of its face round the corner, as sprayed paint
 * does. Larger parts (hull and turret shells, long panels), blocks and rods keep their per-face projection. Parts are
 * in merge order (mergeAll).
 */
export function thinPartBoxUV(parts: readonly THREE.BufferGeometry[], merged: THREE.BufferGeometry, scale = 0.35,
  thinM = 0.06, plateM = 0.2, smallM = 1.2, plateK = 0.6): void {
  const position = merged.getAttribute('position'), uv = merged.getAttribute('uv');
  if (!position || !uv) return;
  const box = new THREE.Box3(), size = new THREE.Vector3();
  let offset = 0, changed = false;
  for (const part of parts) {
    const count = part.index ? part.index.count : (part.getAttribute('position')?.count || 0);
    const partPosition = part.getAttribute('position');
    if (!partPosition) { offset += count; continue; }
    box.setFromBufferAttribute(partPosition as THREE.BufferAttribute).getSize(size);
    const dims = [size.x, size.y, size.z].sort((a, b) => a - b);
    // a plate has one thin axis: a rod (two thin axes alike) keeps its per-face projection, having no face to follow
    const plate = dims[0] <= plateK * dims[1] && (dims[0] < thinM || (dims[0] <= plateM && dims[2] <= smallM));
    if (plate && count) {
      const axis = size.y === dims[0] ? 1 : size.x === dims[0] ? 0 : 2;
      for (let i = offset; i < offset + count && i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        uv.setXY(i, (axis === 0 ? z : x) * scale, (axis === 1 ? z : y) * scale);
      }
      changed = true;
    }
    offset += count;
  }
  if (changed) uv.needsUpdate = true;
}

export function mergeAll(geometries: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = geometries.map((geometry) => geometry.index ? geometry.toNonIndexed() : geometry);
  const merged = mergeGeometries(flat, false);
  for (const geometry of flat) geometry.dispose();
  if (!merged) throw new Error('Unable to merge procedural vehicle geometry');
  return merged;
}
