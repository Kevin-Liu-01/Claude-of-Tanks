// Strict, cycle-free geometry primitives shared by the procedural vehicle factory.
// These functions intentionally contain no vehicle policy or runtime state.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

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
}

export interface StraightRidgeGunMaskOptions {
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
  return new RoundedBoxGeometry(
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
): Point3[] {
  const [centerX, centerZ] = center;
  return plan.map(([x, z], index) => {
    const scale = stationValue(inset, plan, index);
    return [
      centerX + (x - centerX) * scale,
      stationValue(height, plan, index),
      centerZ + (z - centerZ) * scale,
    ];
  });
}

function pushOrientedSides(
  positions: number[],
  lower: readonly Point3[],
  upper: readonly Point3[],
  center: Point2,
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
    if (edgeX * midpointZ - edgeZ * midpointX > 0) {
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

function pushOrderedFan(
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
    if (top) positions.push(...ring[index], ...ring[next], ...centerPoint);
    else positions.push(...ring[next], ...ring[index], ...centerPoint);
  }
}

export function polyTurret(
  plan: readonly Point2[],
  height: number,
  flare = 1.08,
  inset = 0.78,
): THREE.BufferGeometry {
  const center = planCenter(plan);
  const lower = scaledRing(plan, 0, flare, center);
  const upper = scaledRing(plan, height, inset, center);
  const positions: number[] = [];
  pushOrientedSides(positions, lower, upper, center);
  pushTopFan(positions, upper, center, height);
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

export function polyMultiLoft(
  plan: readonly Point2[],
  rings: readonly PolyMultiLoftRing[],
): THREE.BufferGeometry {
  if (rings.length < 2) throw new Error('polyMultiLoft requires at least two rings');
  const center = planCenter(plan);
  const resolved = rings.map((ring) => scaledRing(plan, ring.height, ring.inset ?? 1, center));
  const positions: number[] = [];
  for (let index = 0; index < resolved.length - 1; index++) {
    pushOrientedSides(positions, resolved[index], resolved[index + 1], center);
  }
  pushOrderedFan(positions, resolved[0], center, false, rings[0].centerHeight);
  const finalIndex = resolved.length - 1;
  pushOrderedFan(positions, resolved[finalIndex], center, true, rings[finalIndex].centerHeight);
  return geometryFromTriangles(positions);
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

export function mergeAll(geometries: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = geometries.map((geometry) => geometry.index ? geometry.toNonIndexed() : geometry);
  const merged = mergeGeometries(flat, false);
  for (const geometry of flat) geometry.dispose();
  if (!merged) throw new Error('Unable to merge procedural vehicle geometry');
  return merged;
}
