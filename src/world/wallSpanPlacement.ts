import { Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { setObbShape, type CollisionRecord } from './collision.ts';

interface HeightSampler { getHeightAt(x: number, z: number): number }

export interface WallSpan {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

interface WallInstance {
  x: number;
  y: number;
  z: number;
  yaw: number;
  sc: number;
  h: number;
  ob: CollisionRecord | null;
  col?: CollisionRecord;
  groundSupport: { mode: 'pitched' | 'obb' | 'disc'; min: number; max: number; spread: number } | null;
}

const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();
const euler = new Euler();
const point = new Vector3();

/** Build-time span edges. Breach/road exclusions keep their original indexed
 * boundaries; only a retained island reaching the exterior run end absorbs
 * the final kit-length remainder. No obstacle is shifted into a skipped gap. */
export function wallIslandEdges(length: number, exclusions: Uint8Array, moduleLength: number): Float64Array {
  const count = exclusions.length;
  const edges = Float64Array.from({ length: count + 1 }, (_, index) => Math.min(index * moduleLength, length));
  for (let start = 0; start < count;) {
    if (exclusions[start]) { start++; continue; }
    let end = start + 1;
    while (end < count && !exclusions[end]) end++;
    const first = start * moduleLength, last = end === count ? length : end * moduleLength;
    for (let edge = start; edge <= end; edge++) {
      edges[edge] = edge === end ? last : first + (last - first) * (edge - start) / (end - start);
    }
    start = end;
  }
  return edges;
}

/** Build-time terraced masonry. Upright end faces overlap at shared span
 * boundaries even at a crest/valley; oppositely pitched rigid pieces cannot.
 * The buried foundation follows the lowest sampled support, while the cap
 * retains the original nominal cover above the highest support. Horizontal
 * span is independent of seeded width/height variation. The 3% joint overlap
 * covers the kit's 1.5% per-course length variation and slight course yaw;
 * it introduces no segments and never fills an authored breach. */
export function fitWallSpan(
  matrix: Matrix4,
  geometry: BufferGeometry,
  field: HeightSampler,
  span: WallSpan,
  instance: WallInstance,
  moduleLength: number,
): void {
  const length = Math.hypot(span.x1 - span.x0, span.z1 - span.z0);
  if (!(length > 0) || !(moduleLength > 0)) throw new TypeError('wall span must have positive length');
  rotation.setFromEuler(euler.set(0, instance.yaw, 0, 'YXZ'));
  matrix.compose(position.set(instance.x, 0, instance.z), rotation,
    scale.set(instance.sc, instance.sc, length / moduleLength * 1.03));
  const vertices = geometry.getAttribute('position');
  let min = Infinity, max = -Infinity;
  let localMin = Infinity, localMax = -Infinity;
  let halfWidth = 0, halfLength = 0;
  for (let index = 0; index < vertices.count; index++) {
    localMin = Math.min(localMin, vertices.getY(index));
    localMax = Math.max(localMax, vertices.getY(index));
    halfWidth = Math.max(halfWidth, Math.abs(vertices.getX(index)) * instance.sc);
    halfLength = Math.max(halfLength, Math.abs(vertices.getZ(index)) * scale.z);
    point.fromBufferAttribute(vertices, index).applyMatrix4(matrix);
    const ground = field.getHeightAt(point.x, point.z);
    min = Math.min(min, ground); max = Math.max(max, ground);
  }
  // Include interior terrain, not only corners: a shallow hollow below a
  // three-metre panel still needs a real foundation reaching the ground.
  const sin = Math.sin(instance.yaw), cos = Math.cos(instance.yaw);
  for (let along = -4; along <= 4; along++) for (let across = -1; across <= 1; across++) {
    const x = across * halfWidth, z = along * halfLength / 4;
    const ground = field.getHeightAt(instance.x + x * cos + z * sin, instance.z - x * sin + z * cos);
    min = Math.min(min, ground); max = Math.max(max, ground);
  }
  const height = localMax - localMin;
  if (!(height > 0)) throw new TypeError('wall geometry must have positive height');
  scale.y = instance.sc + (max - min) / height;
  matrix.compose(position.set(instance.x, min - .13 - localMin * scale.y, instance.z), rotation, scale);
  refitWallSpanCollision(matrix, geometry, instance);
  instance.groundSupport = { mode: 'pitched', min, max, spread: max - min };
}

/** Match slope-following visible cover, including the high endpoint. The
 * footprint stays a thin wall aligned with the authored run; no circular
 * blocker or AABB-wide route exclusion is introduced. */
function refitWallSpanCollision(matrix: Matrix4, geometry: BufferGeometry, instance: WallInstance): void {
  const vertices = geometry.getAttribute('position');
  const sin = Math.sin(instance.yaw), cos = Math.cos(instance.yaw);
  let minY = Infinity, maxY = -Infinity;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let index = 0; index < vertices.count; index++) {
    point.fromBufferAttribute(vertices, index).applyMatrix4(matrix);
    const dx = point.x - instance.x, dz = point.z - instance.z;
    const x = dx * cos - dz * sin, z = dx * sin + dz * cos;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
  }
  const x = (minX + maxX) * .5, z = (minZ + maxZ) * .5;
  instance.y = minY;
  instance.h = maxY - minY;
  for (const collider of [instance.ob, instance.col]) {
    if (!collider) continue;
    collider.min[1] = minY; collider.max[1] = maxY;
    setObbShape(collider, instance.x + x * cos + z * sin, instance.z - x * sin + z * cos,
      (maxX - minX) * .5, (maxZ - minZ) * .5, instance.yaw);
  }
}
