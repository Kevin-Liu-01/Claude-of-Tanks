import * as THREE from 'three';

import type { GeometryBuckets } from '../world/maps/exteriorDetailKit.ts';
import type {
  GarageApproachRecipe,
  GarageApproachStyle,
} from './garageEnvironmentRecipes.ts';
import {
  GARAGE_CAMERA_AZIMUTH_RAD,
  garageViewPoint,
} from '../game/garagePresentationPose.ts';

interface GarageApproachBuildOptions {
  readonly approach: GarageApproachRecipe;
  readonly buckets: GeometryBuckets;
  readonly groundAtWorld: (x: number, z: number) => number;
}

export interface GarageApproachStats {
  readonly approachLabel: string;
  readonly approachStyle: GarageApproachStyle;
  readonly approachSegments: number;
  readonly approachDetails: number;
  readonly approachConnected: boolean;
  readonly approachGroundErrorM: number;
}

interface CameraPoint {
  readonly side: number;
  readonly depth: number;
}

const VIEW_YAW = GARAGE_CAMERA_AZIMUTH_RAD;
const LOCAL_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);

function cameraToWorld(side: number, depth: number): THREE.Vector2 {
  const point = garageViewPoint(side, depth);
  return new THREE.Vector2(point.x, point.z);
}

function paint(geometry: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const tint = new THREE.Color(color);
  for (let index = 0; index < positions.count; index += 1) tint.toArray(colors, index * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function scaledBox(
  width: number,
  height: number,
  length: number,
  matrix: THREE.Matrix4,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, length);
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, uv.getX(index) * Math.max(1, width * 0.7),
      uv.getY(index) * Math.max(1, length * 0.45));
  }
  geometry.applyMatrix4(matrix);
  return geometry;
}

/**
 * Add a terrain-following approach panel. The long axis follows the sampled
 * endpoint vector, so every panel meets its neighbours instead of bridging a
 * slope as a floating horizontal slab.
 */
function pathPanel(
  bucket: THREE.BufferGeometry[],
  groundAtWorld: (x: number, z: number) => number,
  a: CameraPoint,
  b: CameraPoint,
  width: number,
  thickness: number,
  lift = 0.035,
): number {
  const aw = cameraToWorld(a.side, a.depth);
  const bw = cameraToWorld(b.side, b.depth);
  const start = new THREE.Vector3(aw.x, groundAtWorld(aw.x, aw.y) + lift, aw.y);
  const end = new THREE.Vector3(bw.x, groundAtWorld(bw.x, bw.y) + lift, bw.y);
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length < 0.01) return 0;
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    LOCAL_FORWARD, direction.clone().normalize(),
  );
  const center = start.clone().lerp(end, 0.5);
  const matrix = new THREE.Matrix4().compose(center, rotation, new THREE.Vector3(1, 1, 1));
  bucket.push(scaledBox(width, thickness, length + 0.12, matrix));
  return Math.max(
    Math.abs(start.y - groundAtWorld(start.x, start.z) - lift),
    Math.abs(end.y - groundAtWorld(end.x, end.z) - lift),
  );
}

function subdividePath(
  points: readonly CameraPoint[],
  maxSegmentM = 3.2,
): CameraPoint[] {
  const result: CameraPoint[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const distance = Math.hypot(b.side - a.side, b.depth - a.depth);
    const divisions = Math.max(1, Math.ceil(distance / maxSegmentM));
    for (let step = 0; step < divisions; step += 1) {
      const t = step / divisions;
      result.push({
        side: THREE.MathUtils.lerp(a.side, b.side, t),
        depth: THREE.MathUtils.lerp(a.depth, b.depth, t),
      });
    }
  }
  result.push(points.at(-1)!);
  return result;
}

function samplePath(points: readonly CameraPoint[], depth: number): CameraPoint {
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (depth < a.depth || depth > b.depth) continue;
    const t = (depth - a.depth) / Math.max(0.001, b.depth - a.depth);
    return { side: THREE.MathUtils.lerp(a.side, b.side, t), depth };
  }
  return { ...points.at(-1)! };
}

/** Static route vocabulary shared by the nine open Garage environments. */
export function addGarageApproachDetails({
  approach,
  buckets,
  groundAtWorld,
}: GarageApproachBuildOptions): GarageApproachStats {
  const route = buckets.route || (buckets.route = []);
  const baked = buckets.baked || (buckets.baked = []);
  const wood = buckets.wood || (buckets.wood = []);
  const dark = buckets.dark || (buckets.dark = []);
  const points = subdividePath(approach.waypoints.map(([side, depth]) => ({ side, depth })));
  let approachSegments = 0;
  let approachDetails = 0;
  let approachGroundErrorM = 0;

  const addPath = (path: readonly CameraPoint[], width: number, thickness = 0.12): void => {
    for (let index = 0; index < path.length - 1; index += 1) {
      approachGroundErrorM = Math.max(approachGroundErrorM,
        pathPanel(route, groundAtWorld, path[index], path[index + 1], width, thickness));
      approachSegments += 1;
    }
  };

  const addGroundBox = (
    side: number,
    depth: number,
    width: number,
    height: number,
    length: number,
    color: number,
    yaw = 0,
    bucket: THREE.BufferGeometry[] = baked,
  ): void => {
    const world = cameraToWorld(side, depth);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(world.x, groundAtWorld(world.x, world.y) + height / 2 + 0.04, world.y),
      new THREE.Quaternion().setFromAxisAngle(LOCAL_UP, VIEW_YAW + yaw),
      new THREE.Vector3(1, 1, 1),
    );
    const geometry = scaledBox(width, height, length, matrix);
    bucket.push(bucket === baked ? paint(geometry, color) : geometry);
    approachDetails += 1;
  };

  const addGroundCylinder = (
    side: number,
    depth: number,
    radius: number,
    height: number,
    color: number,
    segments = 10,
  ): void => {
    const world = cameraToWorld(side, depth);
    const geometry = new THREE.CylinderGeometry(radius, radius * 1.08, height, segments, 1);
    geometry.translate(world.x, groundAtWorld(world.x, world.y) + height / 2 + 0.035, world.y);
    baked.push(paint(geometry, color));
    approachDetails += 1;
  };

  const addEdgeCourse = (offset: number, color: number, width = 0.22, height = 0.18): void => {
    const edge = points.map((point) => ({ side: point.side + offset, depth: point.depth }));
    for (let index = 0; index < edge.length - 1; index += 1) {
      approachGroundErrorM = Math.max(approachGroundErrorM,
        pathPanel(baked, groundAtWorld, edge[index], edge[index + 1], width, height, 0.09));
      const geometry = baked.at(-1)!;
      paint(geometry, color);
      approachDetails += 1;
    }
  };

  const addRuts = (offsets: readonly number[], color: number, width = 0.34): void => {
    for (const offset of offsets) {
      const rut = points.map((point) => ({ side: point.side + offset, depth: point.depth }));
      for (let index = 0; index < rut.length - 1; index += 1) {
        pathPanel(baked, groundAtWorld, rut[index], rut[index + 1], width, 0.035, 0.085);
        paint(baked.at(-1)!, color);
        approachDetails += 1;
      }
    }
  };

  const addRoadsidePosts = (
    spacing: number,
    offset: number,
    color: number,
    height = 1.65,
  ): void => {
    const firstDepth = approach.waypoints[0][1] + spacing;
    const lastDepth = approach.waypoints.at(-1)![1] - 1;
    for (let depth = firstDepth; depth <= lastDepth; depth += spacing) {
      const point = samplePath(points, depth);
      for (const side of [-1, 1]) {
        addGroundBox(point.side + side * offset, depth, 0.12, height, 0.12, color);
        addGroundBox(point.side + side * offset, depth, 0.34, 0.09, 0.16,
          side > 0 ? 0xe3b54a : 0xe9ece5, 0, baked);
      }
    }
  };

  const addRailRoad = (lane: number): void => {
    const fan = points.map((point, index) => {
      const t = index / Math.max(1, points.length - 1);
      return { side: point.side + lane * THREE.MathUtils.lerp(0.38, 1, t), depth: point.depth };
    });
    addPath(fan, 3.45, 0.18);
    for (const railOffset of [-0.76, 0.76]) {
      const rail = fan.map((point) => ({ side: point.side + railOffset, depth: point.depth }));
      for (let index = 0; index < rail.length - 1; index += 1) {
        pathPanel(dark, groundAtWorld, rail[index], rail[index + 1], 0.13, 0.20, 0.24);
        approachDetails += 1;
      }
    }
    const start = approach.waypoints[0][1];
    const end = approach.waypoints.at(-1)![1];
    for (let depth = start + 0.6; depth < end; depth += 0.92) {
      const point = samplePath(fan, depth);
      addGroundBox(point.side, depth, 2.55, 0.14, 0.28, 0x49392a, 0, wood);
    }
  };

  switch (approach.style) {
    case 'rail-fan':
      for (const lane of approach.lanes || [0]) addRailRoad(lane);
      for (const depth of [18, 34, 45]) {
        const point = samplePath(points, depth);
        addGroundBox(point.side - 10.2, depth, 0.26, 6.2, 0.26, 0x34383a);
        addGroundBox(point.side + 10.2, depth, 0.26, 6.2, 0.26, 0x34383a);
        addGroundBox(point.side, depth, 20.6, 0.24, 0.28, 0xd09a2f, 0, baked);
      }
      break;
    case 'desert-convoy':
      addPath(points, approach.width, 0.10);
      addRuts(approach.lanes || [-2.5, 2.5], 0x776044, 0.52);
      addRoadsidePosts(8, approach.width / 2 + 0.7, 0x4b4540, 1.3);
      for (const depth of [22, 39]) {
        const point = samplePath(points, depth);
        addGroundCylinder(point.side - approach.width / 2 - 1.8, depth, 0.44, 0.86, 0x8d6a3d, 12);
      }
      break;
    case 'snow-road':
      addPath(points, approach.width, 0.13);
      addRuts(approach.lanes || [-2.2, 2.2], 0x86949a, 0.46);
      addEdgeCourse(-approach.width / 2 - 0.45, 0xbec8ca, 0.68, 0.34);
      addEdgeCourse(approach.width / 2 + 0.45, 0xbec8ca, 0.68, 0.34);
      addRoadsidePosts(5.8, approach.width / 2 + 1.0, 0xc14f36, 1.85);
      break;
    case 'urban-street':
      addPath(points, approach.width, 0.16);
      addEdgeCourse(-approach.width / 2, 0x676b69, 0.38, 0.28);
      addEdgeCourse(approach.width / 2, 0x676b69, 0.38, 0.28);
      addRuts(approach.lanes || [-3, 3], 0x4f5351, 0.16);
      for (const depth of [17, 27, 37, 45]) {
        const point = samplePath(points, depth);
        for (const side of [-1, 1]) {
          addGroundBox(point.side + side * (approach.width / 2 + 1.2), depth,
            0.20, 4.6, 0.20, 0x303538);
          addGroundBox(point.side + side * (approach.width / 2 + 0.9), depth,
            0.9, 0.14, 0.14, 0xe0b35a);
        }
      }
      break;
    case 'drydock-lane':
      addPath(points, approach.width, 0.22);
      addEdgeCourse(-approach.width / 2, 0x56666a, 0.42, 0.46);
      addEdgeCourse(approach.width / 2, 0x56666a, 0.42, 0.46);
      addRuts(approach.lanes || [-3, 3], 0x39464a, 0.20);
      for (const depth of [17, 25, 33, 41]) {
        const point = samplePath(points, depth);
        for (const side of [-1, 1]) {
          addGroundCylinder(point.side + side * (approach.width / 2 + 1.0), depth,
            0.32, 0.72, 0x283337, 12);
          addGroundBox(point.side + side * (approach.width / 2 + 0.55), depth,
            1.0, 0.08, 0.22, 0xb59443);
        }
      }
      break;
    case 'monsoon-causeway':
      addPath(points, approach.width, 0.24);
      addEdgeCourse(-approach.width / 2 - 0.45, 0x344f49, 0.42, 0.34);
      addEdgeCourse(approach.width / 2 + 0.45, 0x344f49, 0.42, 0.34);
      addRuts(approach.lanes || [-2.6, 2.6], 0x3c4f45, 0.34);
      addRoadsidePosts(7, approach.width / 2 + 1.0, 0xd19a2e, 1.45);
      break;
    case 'alpine-pass':
      addPath(points, approach.width, 0.16);
      addRuts(approach.lanes || [-2.3, 2.3], 0x7b878c, 0.36);
      addEdgeCourse(-approach.width / 2 - 0.8, 0x61696c, 0.24, 0.30);
      addEdgeCourse(approach.width / 2 + 0.8, 0x61696c, 0.24, 0.30);
      addRoadsidePosts(5.5, approach.width / 2 + 1.2, 0xde603d, 1.9);
      for (const depth of [21, 33, 43]) {
        const point = samplePath(points, depth);
        addGroundBox(point.side + approach.width / 2 + 1.6, depth,
          3.2, 0.72, 0.75, 0x67696a);
      }
      break;
    case 'recovery-trail':
      addPath(points, approach.width, 0.10);
      addRuts(approach.lanes || [-2.7, 2.7], 0x5d4337, 0.58);
      addRoadsidePosts(8.5, approach.width / 2 + 0.9, 0xb87937, 1.2);
      for (const depth of [23, 38]) {
        const point = samplePath(points, depth);
        addGroundBox(point.side - approach.width / 2 - 1.6, depth,
          2.8, 0.32, 0.75, 0x55463b);
        addGroundBox(point.side - approach.width / 2 - 1.6, depth,
          1.9, 0.22, 1.3, 0x72503d);
      }
      break;
    case 'foundry-haul-road':
      addPath(points, approach.width, 0.18);
      addEdgeCourse(-approach.width / 2, 0x4e5051, 0.34, 0.30);
      addEdgeCourse(approach.width / 2, 0x4e5051, 0.34, 0.30);
      addRuts(approach.lanes || [-3.2, 3.2], 0x2b3032, 0.22);
      for (const lane of [-approach.width / 2 - 0.8, approach.width / 2 + 0.8]) {
        const service = points.map((point) => ({ side: point.side + lane, depth: point.depth }));
        for (let index = 0; index < service.length - 1; index += 1) {
          pathPanel(dark, groundAtWorld, service[index], service[index + 1], 0.18, 0.16, 0.18);
          approachDetails += 1;
        }
      }
      addRoadsidePosts(7, approach.width / 2 + 1.3, 0xd19a2e, 2.1);
      break;
    default:
      addPath(points, approach.width, 0.10);
      addRuts([-approach.width * 0.28, approach.width * 0.28], 0x5f624c, 0.34);
      addRoadsidePosts(9, approach.width / 2 + 0.7, 0x5f5d4c, 1.15);
      break;
  }

  return Object.freeze({
    approachLabel: approach.label,
    approachStyle: approach.style,
    approachSegments,
    approachDetails,
    approachConnected: points.length >= 2,
    approachGroundErrorM: Number(approachGroundErrorM.toFixed(4)),
  });
}
