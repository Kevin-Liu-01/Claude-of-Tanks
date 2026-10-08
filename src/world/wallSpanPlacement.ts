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

/** Build-time slope-following masonry. The scenery lane (wave 34: "walls on slopes step like battlements — courses
 * must follow slope"): a module is sheared along the run to the ground's fall under it (a least-squares line along
 * its centre, at most MAX_SHEAR), so its courses and its top follow the slope and its end faces stay upright — two
 * neighbours meet in one vertical plane at a crest or a valley (oppositely pitched rigid pieces cannot; the old
 * terraced fit stood each module level at its high end's height, a step at every joint). The buried foundation
 * follows the lowest sampled support under the shear, the cap keeps the nominal cover above the highest, so only the
 * ground's departure from the sheared line still stretches a module. Horizontal span is independent of seeded
 * width/height variation. The 3% joint overlap covers the kit's 1.5% per-course length variation and slight course
 * yaw; it introduces no segments and never fills an authored breach. */
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
  const sin = Math.sin(instance.yaw), cos = Math.cos(instance.yaw);
  const alongOf = (x: number, z: number) => (x - instance.x) * sin + (z - instance.z) * cos;
  const vertices = geometry.getAttribute('position');
  let localMin = Infinity, localMax = -Infinity;
  let halfWidth = 0, halfLength = 0;
  for (let index = 0; index < vertices.count; index++) {
    localMin = Math.min(localMin, vertices.getY(index));
    localMax = Math.max(localMax, vertices.getY(index));
    halfWidth = Math.max(halfWidth, Math.abs(vertices.getX(index)) * instance.sc);
    halfLength = Math.max(halfLength, Math.abs(vertices.getZ(index)) * scale.z);
  }
  // the ground's fall along the module (local +z, world metres): a least-squares line through its centre line
  let sz = 0, szz = 0, sg = 0, szg = 0, n = 0;
  for (let along = -4; along <= 4; along++) {
    const z = along * halfLength / 4, ground = field.getHeightAt(instance.x + z * sin, instance.z + z * cos);
    sz += z; szz += z * z; sg += ground; szg += z * ground; n++;
  }
  const fall = (szz * n - sz * sz) > 1e-9 ? (n * szg - sz * sg) / (n * szz - sz * sz) : 0;
  const shear = Math.max(-MAX_SHEAR, Math.min(MAX_SHEAR, fall));
  // the support under the sheared line: every vertex's ground and the interior terrain, less the line's own rise
  let min = Infinity, max = -Infinity, groundMin = Infinity, groundMax = -Infinity;
  const support = (x: number, z: number): void => {
    const ground = field.getHeightAt(x, z), residual = ground - shear * alongOf(x, z);
    min = Math.min(min, residual); max = Math.max(max, residual);
    groundMin = Math.min(groundMin, ground); groundMax = Math.max(groundMax, ground);
  };
  // (2026-10-08, the perf lane, time-to-battle: the matrix turns about y alone, so a vertex's ground depends on its x
  // and z only and every vertex of one column — the courses above and below it, the faces meeting at its corner —
  // reads the same sample: one per column, the first vertex of each, the same minimum and maximum; ~2.8 s of ground
  // samples in a Verdant props build)
  const columns = distinctColumns(vertices);
  for (let index = 0; index < columns.length; index += 3) {
    point.set(columns[index], columns[index + 1], columns[index + 2]).applyMatrix4(matrix);
    support(point.x, point.z);
  }
  // Include interior terrain, not only corners: a shallow hollow below a
  // three-metre panel still needs a real foundation reaching the ground.
  for (let along = -4; along <= 4; along++) for (let across = -1; across <= 1; across++) {
    const x = across * halfWidth, z = along * halfLength / 4;
    support(instance.x + x * cos + z * sin, instance.z - x * sin + z * cos);
  }
  const height = localMax - localMin;
  if (!(height > 0)) throw new TypeError('wall geometry must have positive height');
  scale.y = instance.sc + (max - min) / height;
  matrix.compose(position.set(instance.x, min - .13 - localMin * scale.y, instance.z), rotation, scale);
  // the shear: a vertex's height rises `shear` a metre along the module (column z's y; yaw leaves y alone)
  matrix.elements[9] += shear * scale.z;
  refitWallSpanCollision(matrix, geometry, instance);
  instance.groundSupport = { mode: 'pitched', min: groundMin, max: groundMax, spread: groundMax - groundMin };
}

type PositionAttribute = ReturnType<BufferGeometry['getAttribute']>;
const columnsOf = new WeakMap<PositionAttribute, { version: number; count: number; columns: Float64Array }>();

/** A module's vertex columns: the first vertex (x, y, z) of each distinct (x, z), in vertex order (one per wall pool). */
function distinctColumns(vertices: PositionAttribute): Float64Array {
  const version = (vertices as { version?: number }).version ?? 0;
  const cached = columnsOf.get(vertices);
  if (cached && cached.version === version && cached.count === vertices.count) return cached.columns;
  const seen = new Set<string>();
  const columns: number[] = [];
  for (let index = 0; index < vertices.count; index++) {
    const x = vertices.getX(index), z = vertices.getZ(index), key = `${x},${z}`;
    if (seen.has(key)) continue;
    seen.add(key);
    columns.push(x, vertices.getY(index), z);
  }
  const result = Float64Array.from(columns);
  columnsOf.set(vertices, { version, count: vertices.count, columns: result });
  return result;
}

/** The steepest fall a module is sheared to (rise over run); past it the module stretches, as the terraced fit did. */
const MAX_SHEAR = 0.45;

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
