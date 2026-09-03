import type { RuntimeValue } from '../runtimeTypes.ts';
// Shared, allocation-free world collision primitives.
//
// World props keep min/max AABBs for cheap broad-phase consumers, but may
// carry a tighter `shape2` footprint for the movement and shell narrow phases:
//   { kind:'obb', cx,cz, hw,hl,yaw }
//   { kind:'circle', cx,cz,r }
//   { kind:'convex', cx,cz, points:[x0,z0,...] }  // CCW world points

const EPS = 1e-9;

export type Bounds3 = [number, number, number];

export type SimpleCollisionShape =
  | { kind: 'obb'; cx: number; cz: number; hw: number; hl: number; yaw: number }
  | { kind: 'circle'; cx: number; cz: number; r: number }
  | { kind: 'convex'; cx: number; cz: number; points: number[] };

export type CollisionShape = SimpleCollisionShape | {
  kind: 'compound';
  cx: number;
  cz: number;
  parts: SimpleCollisionShape[];
};

export interface CollisionRecord {
  min: Bounds3;
  max: Bounds3;
  shape2?: CollisionShape;
  crushable?: boolean;
  crushMin?: number;
  crushKeep?: number;
  kind?: string;
  treeIdx?: number;
  propIdx?: number;
  crushed?: boolean;
  dead?: boolean;
  __gridStamp?: number;
}

interface Position2 {
  x: number;
  z: number;
}

interface Vector3Like extends Position2 {
  y: number;
}

interface MutableVector3Like extends Vector3Like {
  set(x: number, y: number, z: number): RuntimeValue;
}

interface Push2 extends Position2 {
  x: number;
  z: number;
}

interface AxisOverlap {
  overlap: number;
  nx: number;
  nz: number;
}

interface CirclePush extends Position2 {
  depth: number;
}

interface RayInterval {
  t0: number;
  t1: number;
  nx: number;
  ny: number;
  nz: number;
  axis: number;
  sign: number;
}

export type ObstacleQuery = (
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  out: CollisionRecord[],
) => CollisionRecord[];

/** Attach a tight oriented-box footprint while retaining a world AABB. */
export function setObbShape(
  rec: CollisionRecord,
  cx: number,
  cz: number,
  halfWidth: number,
  halfLength: number,
  yaw = 0,
) {
  const hw = Math.max(0, halfWidth);
  const hl = Math.max(0, halfLength);
  const cs = Math.abs(Math.cos(yaw));
  const sn = Math.abs(Math.sin(yaw));
  const ex = hw * cs + hl * sn;
  const ez = hw * sn + hl * cs;
  rec.min[0] = cx - ex; rec.max[0] = cx + ex;
  rec.min[2] = cz - ez; rec.max[2] = cz + ez;
  rec.shape2 = { kind: 'obb', cx, cz, hw, hl, yaw };
  return rec;
}

/** Attach a circular footprint (finite vertical cylinder in ray tests). */
export function setCircleShape(rec: CollisionRecord, cx: number, cz: number, radius: number) {
  const r = Math.max(0, radius);
  rec.min[0] = cx - r; rec.max[0] = cx + r;
  rec.min[2] = cz - r; rec.max[2] = cz + r;
  rec.shape2 = { kind: 'circle', cx, cz, r };
  return rec;
}

/** Monotone-chain convex hull of [x,z] pairs. Returns CCW flat coordinates. */
export function convexHull2(points: ReadonlyArray<readonly [number, number]>) {
  if (!points || points.length < 3) return [];
  const p = points.map((v) => [v[0], v[1]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: readonly number[], a: readonly number[], b: readonly number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: number[][] = [];
  for (const v of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], v) <= 0) lower.pop();
    lower.push(v);
  }
  const upper: number[][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const v = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], v) <= 0) upper.pop();
    upper.push(v);
  }
  lower.pop(); upper.pop();
  const out: number[] = [];
  for (const v of lower.concat(upper)) out.push(v[0], v[1]);
  return out;
}

/** Attach a convex projected footprint while retaining its enclosing AABB. */
export function setConvexShape(rec: CollisionRecord, points: number[]) {
  if (!points || points.length < 6) return rec;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let sx = 0, sz = 0;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i], z = points[i + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    sx += x; sz += z;
  }
  rec.min[0] = minX; rec.max[0] = maxX;
  rec.min[2] = minZ; rec.max[2] = maxZ;
  const n = points.length / 2;
  rec.shape2 = { kind: 'convex', cx: sx / n, cz: sz / n, points };
  return rec;
}

function simpleShapeBounds(shape: SimpleCollisionShape) {
  if (shape.kind === 'circle') {
    return [shape.cx - shape.r, shape.cz - shape.r, shape.cx + shape.r, shape.cz + shape.r];
  }
  if (shape.kind === 'obb') {
    const cs = Math.abs(Math.cos(shape.yaw));
    const sn = Math.abs(Math.sin(shape.yaw));
    const ex = shape.hw * cs + shape.hl * sn;
    const ez = shape.hw * sn + shape.hl * cs;
    return [shape.cx - ex, shape.cz - ez, shape.cx + ex, shape.cz + ez];
  }
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let index = 0; index < shape.points.length; index += 2) {
    minX = Math.min(minX, shape.points[index]);
    minZ = Math.min(minZ, shape.points[index + 1]);
    maxX = Math.max(maxX, shape.points[index]);
    maxZ = Math.max(maxZ, shape.points[index + 1]);
  }
  return [minX, minZ, maxX, maxZ];
}

/** Attach a union of tight convex primitives while retaining one broad-phase record. */
export function setCompoundShape(rec: CollisionRecord, parts: SimpleCollisionShape[]) {
  if (!parts.length) return rec;
  if (parts.length === 1) {
    const part = parts[0];
    if (part.kind === 'circle') return setCircleShape(rec, part.cx, part.cz, part.r);
    if (part.kind === 'obb') return setObbShape(rec, part.cx, part.cz, part.hw, part.hl, part.yaw);
    return setConvexShape(rec, part.points);
  }
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const part of parts) {
    const bounds = simpleShapeBounds(part);
    minX = Math.min(minX, bounds[0]); minZ = Math.min(minZ, bounds[1]);
    maxX = Math.max(maxX, bounds[2]); maxZ = Math.max(maxZ, bounds[3]);
  }
  rec.min[0] = minX; rec.min[2] = minZ;
  rec.max[0] = maxX; rec.max[2] = maxZ;
  rec.shape2 = {
    kind: 'compound',
    cx: (minX + maxX) * 0.5,
    cz: (minZ + maxZ) * 0.5,
    parts,
  };
  return rec;
}

function simpleFootprintContainsPoint(
  shape: SimpleCollisionShape,
  x: number,
  z: number,
  margin: number,
) {
  if (shape.kind === 'circle') {
    const dx = x - shape.cx, dz = z - shape.cz;
    const radius = shape.r + margin;
    return dx * dx + dz * dz <= radius * radius;
  }
  if (shape.kind === 'obb') {
    const dx = x - shape.cx, dz = z - shape.cz;
    const forwardX = Math.sin(shape.yaw), forwardZ = Math.cos(shape.yaw);
    const rightX = forwardZ, rightZ = -forwardX;
    return Math.abs(dx * rightX + dz * rightZ) <= shape.hw + margin
      && Math.abs(dx * forwardX + dz * forwardZ) <= shape.hl + margin;
  }
  for (let index = 0; index < shape.points.length; index += 2) {
    const next = (index + 2) % shape.points.length;
    const edgeX = shape.points[next] - shape.points[index];
    const edgeZ = shape.points[next + 1] - shape.points[index + 1];
    const cross = edgeX * (z - shape.points[index + 1])
      - edgeZ * (x - shape.points[index]);
    if (cross < -margin * Math.hypot(edgeX, edgeZ)) return false;
  }
  return true;
}

/** Exact point/clearance query shared by navigation and runtime collision. */
export function collisionFootprintContainsPoint(
  record: CollisionRecord,
  x: number,
  z: number,
  margin = 0,
) {
  const shape = record.shape2;
  if (!shape) {
    return x >= record.min[0] - margin && x <= record.max[0] + margin
      && z >= record.min[2] - margin && z <= record.max[2] + margin;
  }
  if (shape.kind !== 'compound') return simpleFootprintContainsPoint(shape, x, z, margin);
  return shape.parts.some((part) => simpleFootprintContainsPoint(part, x, z, margin));
}

function rayCircleEntry2(
  shape: Extract<SimpleCollisionShape, { kind: 'circle' }>,
  sourceX: number,
  sourceZ: number,
  directionX: number,
  directionZ: number,
  maxDistance: number,
  margin: number,
) {
  const ox = sourceX - shape.cx, oz = sourceZ - shape.cz;
  const radius = shape.r + margin;
  const along = -(ox * directionX + oz * directionZ);
  const closestSq = ox * ox + oz * oz - along * along;
  const radiusSq = radius * radius;
  if (closestSq > radiusSq) return null;
  const halfChord = Math.sqrt(Math.max(0, radiusSq - closestSq));
  const entry = Math.max(0, along - halfChord);
  const exit = along + halfChord;
  return exit >= 0 && entry < maxDistance ? entry : null;
}

function raySlabNear(origin: number, direction: number, min: number, max: number) {
  if (Math.abs(direction) < EPS) return origin >= min && origin <= max ? -Infinity : Infinity;
  return Math.min((min - origin) / direction, (max - origin) / direction);
}

function raySlabFar(origin: number, direction: number, min: number, max: number) {
  if (Math.abs(direction) < EPS) return origin >= min && origin <= max ? Infinity : -Infinity;
  return Math.max((min - origin) / direction, (max - origin) / direction);
}

function rayObbEntry2(
  shape: Extract<SimpleCollisionShape, { kind: 'obb' }>,
  sourceX: number,
  sourceZ: number,
  directionX: number,
  directionZ: number,
  maxDistance: number,
  margin: number,
) {
  const forwardX = Math.sin(shape.yaw), forwardZ = Math.cos(shape.yaw);
  const rightX = forwardZ, rightZ = -forwardX;
  const dx = sourceX - shape.cx, dz = sourceZ - shape.cz;
  const localX = dx * rightX + dz * rightZ;
  const localZ = dx * forwardX + dz * forwardZ;
  const localDirectionX = directionX * rightX + directionZ * rightZ;
  const localDirectionZ = directionX * forwardX + directionZ * forwardZ;
  const entry = Math.max(
    0,
    raySlabNear(localX, localDirectionX, -shape.hw - margin, shape.hw + margin),
    raySlabNear(localZ, localDirectionZ, -shape.hl - margin, shape.hl + margin),
  );
  const exit = Math.min(
    maxDistance,
    raySlabFar(localX, localDirectionX, -shape.hw - margin, shape.hw + margin),
    raySlabFar(localZ, localDirectionZ, -shape.hl - margin, shape.hl + margin),
  );
  return entry <= exit && exit >= 0 && entry < maxDistance ? entry : null;
}

function rayConvexEntry2(
  shape: Extract<SimpleCollisionShape, { kind: 'convex' }>,
  sourceX: number,
  sourceZ: number,
  directionX: number,
  directionZ: number,
  maxDistance: number,
  margin: number,
) {
  let entry = 0, exit = maxDistance;
  for (let index = 0; index < shape.points.length; index += 2) {
    const next = (index + 2) % shape.points.length;
    const edgeX = shape.points[next] - shape.points[index];
    const edgeZ = shape.points[next + 1] - shape.points[index + 1];
    const offset = edgeX * (sourceZ - shape.points[index + 1])
      - edgeZ * (sourceX - shape.points[index])
      + margin * Math.hypot(edgeX, edgeZ);
    const velocity = edgeX * directionZ - edgeZ * directionX;
    if (Math.abs(velocity) < EPS) {
      if (offset < 0) return null;
      continue;
    }
    const crossing = -offset / velocity;
    if (velocity > 0) entry = Math.max(entry, crossing);
    else exit = Math.min(exit, crossing);
    if (entry > exit) return null;
  }
  return exit >= 0 && entry < maxDistance ? Math.max(0, entry) : null;
}

function raySimpleFootprintEntry2(
  shape: SimpleCollisionShape,
  sourceX: number,
  sourceZ: number,
  directionX: number,
  directionZ: number,
  maxDistance: number,
  margin: number,
) {
  if (shape.kind === 'circle') {
    return rayCircleEntry2(
      shape, sourceX, sourceZ, directionX, directionZ, maxDistance, margin,
    );
  }
  if (shape.kind === 'obb') {
    return rayObbEntry2(
      shape, sourceX, sourceZ, directionX, directionZ, maxDistance, margin,
    );
  }
  return rayConvexEntry2(
    shape, sourceX, sourceZ, directionX, directionZ, maxDistance, margin,
  );
}

/** First 2D ray entry into the exact footprint, optionally inflated for clearance. */
export function rayCollisionFootprintEntry2(
  record: CollisionRecord,
  sourceX: number,
  sourceZ: number,
  directionX: number,
  directionZ: number,
  maxDistance: number,
  margin = 0,
) {
  const length = Math.hypot(directionX, directionZ);
  if (length < EPS || maxDistance <= 0) return null;
  directionX /= length; directionZ /= length;
  const shape = record.shape2;
  if (!shape) {
    const entry = Math.max(
      0,
      raySlabNear(sourceX, directionX, record.min[0] - margin, record.max[0] + margin),
      raySlabNear(sourceZ, directionZ, record.min[2] - margin, record.max[2] + margin),
    );
    const exit = Math.min(
      maxDistance,
      raySlabFar(sourceX, directionX, record.min[0] - margin, record.max[0] + margin),
      raySlabFar(sourceZ, directionZ, record.min[2] - margin, record.max[2] + margin),
    );
    return entry <= exit && exit >= 0 && entry < maxDistance ? entry : null;
  }
  if (shape.kind !== 'compound') {
    return raySimpleFootprintEntry2(
      shape, sourceX, sourceZ, directionX, directionZ, maxDistance, margin,
    );
  }
  let best: number | null = null;
  for (const part of shape.parts) {
    const entry = raySimpleFootprintEntry2(
      part, sourceX, sourceZ, directionX, directionZ, maxDistance, margin,
    );
    if (entry != null && (best == null || entry < best)) best = entry;
  }
  return best;
}

/** Copy a shape record without sharing mutable min/max arrays. */
export function cloneCollisionRecord(rec: CollisionRecord): CollisionRecord {
  const out: CollisionRecord = { ...rec, min: [...rec.min], max: [...rec.max] };
  if (rec.shape2) {
    out.shape2 = { ...rec.shape2 } as CollisionShape;
    if (rec.shape2.kind === 'convex' && out.shape2.kind === 'convex') {
      out.shape2.points = rec.shape2.points.slice();
    } else if (rec.shape2.kind === 'compound' && out.shape2.kind === 'compound') {
      out.shape2.parts = rec.shape2.parts.map((part) => part.kind === 'convex'
        ? { ...part, points: part.points.slice() }
        : { ...part });
    }
  }
  return out;
}

function testAxis(
  nx: number, nz: number, pos: Position2,
  fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number, minB: number, maxB: number,
  centerBX: number, centerBZ: number, best: AxisOverlap,
) {
  const ll = Math.hypot(nx, nz);
  if (ll < EPS) return true;
  nx /= ll; nz /= ll;
  const centerA = pos.x * nx + pos.z * nz;
  const radiusA = halfL * Math.abs(fx * nx + fz * nz) +
    halfW * Math.abs(rx * nx + rz * nz);
  const ov = Math.min(centerA + radiusA, maxB) - Math.max(centerA - radiusA, minB);
  if (ov <= 0) return false;
  if (ov < best.overlap) {
    const towardHull = (pos.x - centerBX) * nx + (pos.z - centerBZ) * nz;
    const sign = towardHull >= 0 ? 1 : -1;
    best.overlap = ov; best.nx = nx * sign; best.nz = nz * sign;
  }
  return true;
}

function testConvexAxis(
  ax: number, az: number, pts: number[], shape: Extract<CollisionShape, { kind: 'convex' }>,
  pos: Position2, fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number, best: AxisOverlap,
) {
  const ll = Math.hypot(ax, az);
  if (ll < EPS) return true;
  const nx = ax / ll, nz = az / ll;
  let minB = Infinity, maxB = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const p = pts[i] * nx + pts[i + 1] * nz;
    if (p < minB) minB = p; if (p > maxB) maxB = p;
  }
  return testAxis(nx, nz, pos, fx, fz, rx, rz, halfL, halfW,
    minB, maxB, shape.cx, shape.cz, best);
}

function testObbAxis(
  nx: number, nz: number, box: Extract<CollisionShape, { kind: 'obb' }>,
  ofx: number, ofz: number, orx: number, orz: number,
  pos: Position2, fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number, best: AxisOverlap,
) {
  const c = box.cx * nx + box.cz * nz;
  const r = box.hl * Math.abs(ofx * nx + ofz * nz) +
    box.hw * Math.abs(orx * nx + orz * nz);
  return testAxis(nx, nz, pos, fx, fz, rx, rz, halfL, halfW,
    c - r, c + r, box.cx, box.cz, best);
}

/**
 * Tight hull-OBB vs environment-footprint push-out. Adds the minimum
 * translation to `outPush`; returns false when separated.
 */
export function pushHullFromObstacle(
  pos: Position2,
  fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number,
  ob: CollisionRecord,
  outPush: Push2,
) {
  const sh = ob.shape2;
  if (sh && sh.kind === 'compound') {
    const startX = outPush.x;
    const startZ = outPush.z;
    let hit = false;
    _compoundRec.min[1] = ob.min[1]; _compoundRec.max[1] = ob.max[1];
    for (const part of sh.parts) {
      _compoundRec.shape2 = part;
      _compoundPos.x = pos.x + outPush.x - startX;
      _compoundPos.z = pos.z + outPush.z - startZ;
      if (pushHullFromObstacle(
        _compoundPos, fx, fz, rx, rz, halfL, halfW, _compoundRec, outPush,
      )) hit = true;
    }
    return hit;
  }
  if (sh?.kind === 'circle') {
    return pushHullFromCircle(pos, fx, fz, rx, rz, halfL, halfW, sh, outPush);
  }

  const best = _pushBest;
  best.overlap = Infinity; best.nx = 0; best.nz = 0;
  const overlaps = sh?.kind === 'convex'
    ? overlapsConvexObstacle(sh, pos, fx, fz, rx, rz, halfL, halfW, best)
    : overlapsBoxObstacle(ob, sh?.kind === 'obb' ? sh : null,
      pos, fx, fz, rx, rz, halfL, halfW, best);
  if (!overlaps) return false;
  outPush.x += best.nx * best.overlap;
  outPush.z += best.nz * best.overlap;
  return true;
}

function pushHullFromCircle(
  pos: Position2,
  fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number,
  circle: Extract<CollisionShape, { kind: 'circle' }>,
  outPush: Push2,
): boolean {
  const dx = circle.cx - pos.x;
  const dz = circle.cz - pos.z;
  const centerX = dx * rx + dz * rz;
  const centerZ = dx * fx + dz * fz;
  const closestX = Math.max(-halfW, Math.min(centerX, halfW));
  const closestZ = Math.max(-halfL, Math.min(centerZ, halfL));
  const deltaX = closestX - centerX;
  const deltaZ = closestZ - centerZ;
  const distanceSq = deltaX * deltaX + deltaZ * deltaZ;
  if (distanceSq >= circle.r * circle.r) return false;
  circlePushLocal(centerX, centerZ, deltaX, deltaZ, distanceSq,
    halfL, halfW, circle.r, _circlePush);
  outPush.x += (rx * _circlePush.x + fx * _circlePush.z) * _circlePush.depth;
  outPush.z += (rz * _circlePush.x + fz * _circlePush.z) * _circlePush.depth;
  return true;
}

function circlePushLocal(
  centerX: number, centerZ: number,
  deltaX: number, deltaZ: number,
  distanceSq: number, halfL: number, halfW: number, radius: number,
  out: CirclePush,
): void {
  if (distanceSq > EPS) {
    const distance = Math.sqrt(distanceSq);
    out.x = deltaX / distance;
    out.z = deltaZ / distance;
    out.depth = radius - distance;
    return;
  }
  const overlapX = halfW + radius - Math.abs(centerX);
  const overlapZ = halfL + radius - Math.abs(centerZ);
  if (overlapX < overlapZ) {
    out.x = centerX >= 0 ? -1 : 1;
    out.z = 0;
    out.depth = overlapX;
    return;
  }
  out.x = 0;
  out.z = centerZ >= 0 ? -1 : 1;
  out.depth = overlapZ;
}

function overlapsConvexObstacle(
  shape: Extract<CollisionShape, { kind: 'convex' }>,
  pos: Position2,
  fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number, best: AxisOverlap,
): boolean {
  const points = shape.points;
  if (!testConvexAxis(fx, fz, points, shape, pos,
    fx, fz, rx, rz, halfL, halfW, best)) return false;
  if (!testConvexAxis(rx, rz, points, shape, pos,
    fx, fz, rx, rz, halfL, halfW, best)) return false;
  for (let index = 0; index < points.length; index += 2) {
    const next = (index + 2) % points.length;
    const axisX = -(points[next + 1] - points[index + 1]);
    const axisZ = points[next] - points[index];
    if (!testConvexAxis(axisX, axisZ, points, shape, pos,
      fx, fz, rx, rz, halfL, halfW, best)) return false;
  }
  return true;
}

function obstacleBox(
  obstacle: CollisionRecord,
  shape: Extract<CollisionShape, { kind: 'obb' }> | null,
): Extract<CollisionShape, { kind: 'obb' }> {
  if (shape) return shape;
  _fallbackBox.cx = (obstacle.min[0] + obstacle.max[0]) * 0.5;
  _fallbackBox.cz = (obstacle.min[2] + obstacle.max[2]) * 0.5;
  _fallbackBox.hw = (obstacle.max[0] - obstacle.min[0]) * 0.5;
  _fallbackBox.hl = (obstacle.max[2] - obstacle.min[2]) * 0.5;
  _fallbackBox.yaw = 0;
  return _fallbackBox;
}

function overlapsBoxObstacle(
  obstacle: CollisionRecord,
  shape: Extract<CollisionShape, { kind: 'obb' }> | null,
  pos: Position2,
  fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number, best: AxisOverlap,
): boolean {
  const box = obstacleBox(obstacle, shape);
  const obstacleForwardX = Math.sin(box.yaw);
  const obstacleForwardZ = Math.cos(box.yaw);
  const obstacleRightX = obstacleForwardZ;
  const obstacleRightZ = -obstacleForwardX;
  return testObbAxis(fx, fz, box, obstacleForwardX, obstacleForwardZ,
    obstacleRightX, obstacleRightZ, pos, fx, fz, rx, rz, halfL, halfW, best)
    && testObbAxis(rx, rz, box, obstacleForwardX, obstacleForwardZ,
      obstacleRightX, obstacleRightZ, pos, fx, fz, rx, rz, halfL, halfW, best)
    && testObbAxis(obstacleForwardX, obstacleForwardZ, box,
      obstacleForwardX, obstacleForwardZ, obstacleRightX, obstacleRightZ,
      pos, fx, fz, rx, rz, halfL, halfW, best)
    && testObbAxis(obstacleRightX, obstacleRightZ, box,
      obstacleForwardX, obstacleForwardZ, obstacleRightX, obstacleRightZ,
      pos, fx, fz, rx, rz, halfL, halfW, best);
}

/**
 * Tight OBB-vs-OBB hull contact. Unlike the historical capsule approximation,
 * this does not round away solid shoulder/track corners. All arguments are
 * scalars so the fixed-step pair loop can reuse existing state without
 * allocating temporary obstacle records.
 */
export function pushHullFromHull(
  ax: number, az: number, afx: number, afz: number,
  arx: number, arz: number, aHalfL: number, aHalfW: number,
  bx: number, bz: number, bfx: number, bfz: number,
  brx: number, brz: number, bHalfL: number, bHalfW: number,
  outPush: Push2,
) {
  const best = _pushBest;
  best.overlap = Infinity; best.nx = 0; best.nz = 0;
  if (!testHullAxis(afx, afz, ax, az, afx, afz, arx, arz, aHalfL, aHalfW,
    bx, bz, bfx, bfz, brx, brz, bHalfL, bHalfW, best) ||
      !testHullAxis(arx, arz, ax, az, afx, afz, arx, arz, aHalfL, aHalfW,
        bx, bz, bfx, bfz, brx, brz, bHalfL, bHalfW, best) ||
      !testHullAxis(bfx, bfz, ax, az, afx, afz, arx, arz, aHalfL, aHalfW,
        bx, bz, bfx, bfz, brx, brz, bHalfL, bHalfW, best) ||
      !testHullAxis(brx, brz, ax, az, afx, afz, arx, arz, aHalfL, aHalfW,
        bx, bz, bfx, bfz, brx, brz, bHalfL, bHalfW, best)) return false;
  outPush.x += best.nx * best.overlap;
  outPush.z += best.nz * best.overlap;
  return true;
}

function testHullAxis(
  nx: number, nz: number,
  ax: number, az: number, afx: number, afz: number,
  arx: number, arz: number, aHalfL: number, aHalfW: number,
  bx: number, bz: number, bfx: number, bfz: number,
  brx: number, brz: number, bHalfL: number, bHalfW: number,
  best: AxisOverlap,
) {
  const length = Math.hypot(nx, nz);
  if (length < EPS) return true;
  nx /= length; nz /= length;
  const radiusA = aHalfL * Math.abs(afx * nx + afz * nz) +
    aHalfW * Math.abs(arx * nx + arz * nz);
  const radiusB = bHalfL * Math.abs(bfx * nx + bfz * nz) +
    bHalfW * Math.abs(brx * nx + brz * nz);
  const separation = (ax - bx) * nx + (az - bz) * nz;
  const overlap = radiusA + radiusB - Math.abs(separation);
  if (overlap <= 0) return false;
  if (overlap < best.overlap) {
    const sign = separation >= 0 ? 1 : -1;
    best.overlap = overlap;
    best.nx = nx * sign;
    best.nz = nz * sign;
  }
  return true;
}

const _pushBest = { overlap: Infinity, nx: 0, nz: 0 };
const _circlePush: CirclePush = { x: 0, z: 0, depth: 0 };
const _fallbackBox: Extract<CollisionShape, { kind: 'obb' }> = {
  kind: 'obb', cx: 0, cz: 0, hw: 0, hl: 0, yaw: 0,
};
const _localO = { x: 0, y: 0, z: 0 };
const _localD = { x: 0, y: 0, z: 0 };
const _localRec: CollisionRecord = { min: [0, 0, 0], max: [0, 0, 0] };
const _compoundRec: CollisionRecord = { min: [0, 0, 0], max: [0, 0, 0] };
const _compoundPos = { x: 0, z: 0 };
const _localN: MutableVector3Like = {
  x: 0, y: 0, z: 0,
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; },
};
const _rayInterval: RayInterval = {
  t0: 0, t1: 0, nx: 0, ny: 0, nz: 0, axis: -1, sign: 1,
};

function clipAabbAxis(
  origin: number,
  direction: number,
  lower: number,
  upper: number,
  axis: number,
  interval: RayInterval,
): boolean {
  if (Math.abs(direction) < EPS) return origin >= lower && origin <= upper;
  const inverse = 1 / direction;
  let entry = (lower - origin) * inverse;
  let exit = (upper - origin) * inverse;
  let sign = -1;
  if (entry > exit) {
    const swap = entry;
    entry = exit;
    exit = swap;
    sign = 1;
  }
  if (entry > interval.t0) {
    interval.t0 = entry;
    interval.axis = axis;
    interval.sign = sign;
  }
  if (exit < interval.t1) interval.t1 = exit;
  return interval.t0 <= interval.t1;
}

function rayAabb(
  origin: Vector3Like,
  dir: Vector3Like,
  rec: CollisionRecord,
  maxDist: number,
  outNormal: MutableVector3Like,
) {
  const interval = _rayInterval;
  interval.t0 = 0;
  interval.t1 = maxDist;
  interval.axis = -1;
  interval.sign = 1;
  if (!clipAabbAxis(origin.x, dir.x, rec.min[0], rec.max[0], 0, interval)
      || !clipAabbAxis(origin.y, dir.y, rec.min[1], rec.max[1], 1, interval)
      || !clipAabbAxis(origin.z, dir.z, rec.min[2], rec.max[2], 2, interval)) return -1;
  if (interval.axis >= 0) {
    outNormal.set(0, 0, 0);
    if (interval.axis === 0) outNormal.x = interval.sign;
    else if (interval.axis === 1) outNormal.y = interval.sign;
    else outNormal.z = interval.sign;
  } else outNormal.set(-dir.x, -dir.y, -dir.z);
  return interval.t0;
}

function initializeExtrudedInterval(
  origin: Vector3Like,
  dir: Vector3Like,
  rec: CollisionRecord,
  maxDist: number,
  againstRay: boolean,
): RayInterval | null {
  const interval = _rayInterval;
  interval.t0 = 0;
  interval.t1 = maxDist;
  interval.nx = againstRay ? -dir.x : 0;
  interval.ny = againstRay ? -dir.y : 0;
  interval.nz = againstRay ? -dir.z : 0;
  if (Math.abs(dir.y) < EPS) {
    return origin.y >= rec.min[1] && origin.y <= rec.max[1] ? interval : null;
  }
  let entry = (rec.min[1] - origin.y) / dir.y;
  let exit = (rec.max[1] - origin.y) / dir.y;
  let signY = -1;
  if (entry > exit) {
    const swap = entry;
    entry = exit;
    exit = swap;
    signY = 1;
  }
  if (entry > interval.t0) {
    interval.t0 = entry;
    interval.nx = 0;
    interval.ny = signY;
    interval.nz = 0;
  }
  if (exit < interval.t1) interval.t1 = exit;
  return interval;
}

function rayObb(
  origin: Vector3Like,
  dir: Vector3Like,
  rec: CollisionRecord,
  shape: Extract<CollisionShape, { kind: 'obb' }>,
  maxDist: number,
  outNormal: MutableVector3Like,
): number {
  const sine = Math.sin(shape.yaw);
  const cosine = Math.cos(shape.yaw);
  const deltaX = origin.x - shape.cx;
  const deltaZ = origin.z - shape.cz;
  _localO.x = deltaX * cosine - deltaZ * sine;
  _localO.y = origin.y;
  _localO.z = deltaX * sine + deltaZ * cosine;
  _localD.x = dir.x * cosine - dir.z * sine;
  _localD.y = dir.y;
  _localD.z = dir.x * sine + dir.z * cosine;
  _localRec.min[0] = -shape.hw;
  _localRec.min[1] = rec.min[1];
  _localRec.min[2] = -shape.hl;
  _localRec.max[0] = shape.hw;
  _localRec.max[1] = rec.max[1];
  _localRec.max[2] = shape.hl;
  const distance = rayAabb(_localO, _localD, _localRec, maxDist, _localN);
  if (distance < 0) return -1;
  outNormal.set(
    _localN.x * cosine + _localN.z * sine,
    _localN.y,
    -_localN.x * sine + _localN.z * cosine,
  );
  return distance;
}

function clipCircleSides(
  origin: Vector3Like,
  dir: Vector3Like,
  shape: Extract<CollisionShape, { kind: 'circle' }>,
  interval: RayInterval,
): boolean {
  const originX = origin.x - shape.cx;
  const originZ = origin.z - shape.cz;
  const directionSq = dir.x * dir.x + dir.z * dir.z;
  if (directionSq < EPS) return originX * originX + originZ * originZ <= shape.r * shape.r;
  const linear = 2 * (originX * dir.x + originZ * dir.z);
  const constant = originX * originX + originZ * originZ - shape.r * shape.r;
  const discriminant = linear * linear - 4 * directionSq * constant;
  if (discriminant < 0) return false;
  const root = Math.sqrt(discriminant);
  const entry = (-linear - root) / (2 * directionSq);
  const exit = (-linear + root) / (2 * directionSq);
  if (entry > interval.t0) {
    interval.t0 = entry;
    const hitX = originX + dir.x * entry;
    const hitZ = originZ + dir.z * entry;
    const inverseLength = 1 / Math.max(Math.hypot(hitX, hitZ), EPS);
    interval.nx = hitX * inverseLength;
    interval.ny = 0;
    interval.nz = hitZ * inverseLength;
  }
  if (exit < interval.t1) interval.t1 = exit;
  return true;
}

function rayCircle(
  origin: Vector3Like,
  dir: Vector3Like,
  rec: CollisionRecord,
  shape: Extract<CollisionShape, { kind: 'circle' }>,
  maxDist: number,
  outNormal: MutableVector3Like,
): number {
  const interval = initializeExtrudedInterval(origin, dir, rec, maxDist, false);
  if (!interval || !clipCircleSides(origin, dir, shape, interval)) return -1;
  if (interval.t0 > interval.t1 || interval.t1 < 0 || interval.t0 > maxDist) return -1;
  outNormal.set(interval.nx, interval.ny, interval.nz);
  return Math.max(0, interval.t0);
}

function clipConvexEdge(
  origin: Vector3Like,
  dir: Vector3Like,
  points: number[],
  index: number,
  interval: RayInterval,
): boolean {
  const next = (index + 2) % points.length;
  const edgeX = points[next] - points[index];
  const edgeZ = points[next + 1] - points[index + 1];
  const inverseLength = 1 / (Math.hypot(edgeX, edgeZ) || 1);
  const inwardX = -edgeZ * inverseLength;
  const inwardZ = edgeX * inverseLength;
  const originSide = (origin.x - points[index]) * inwardX
    + (origin.z - points[index + 1]) * inwardZ;
  const directionSide = dir.x * inwardX + dir.z * inwardZ;
  if (Math.abs(directionSide) < EPS) return originSide >= 0;
  const distance = -originSide / directionSide;
  if (directionSide > 0 && distance > interval.t0) {
    interval.t0 = distance;
    interval.nx = -inwardX;
    interval.ny = 0;
    interval.nz = -inwardZ;
  } else if (directionSide < 0 && distance < interval.t1) {
    interval.t1 = distance;
  }
  return interval.t0 <= interval.t1;
}

function rayConvex(
  origin: Vector3Like,
  dir: Vector3Like,
  rec: CollisionRecord,
  shape: Extract<CollisionShape, { kind: 'convex' }>,
  maxDist: number,
  outNormal: MutableVector3Like,
): number {
  const interval = initializeExtrudedInterval(origin, dir, rec, maxDist, true);
  if (!interval) return -1;
  for (let index = 0; index < shape.points.length; index += 2) {
    if (!clipConvexEdge(origin, dir, shape.points, index, interval)) return -1;
  }
  if (interval.t1 < 0 || interval.t0 > maxDist) return -1;
  outNormal.set(interval.nx, interval.ny, interval.nz);
  return Math.max(0, interval.t0);
}

/** Ray against the tight footprint extruded from minY to maxY. */
export function rayCollisionRecord(
  origin: Vector3Like,
  dir: Vector3Like,
  rec: CollisionRecord,
  maxDist: number,
  outNormal: MutableVector3Like,
) {
  const sh = rec.shape2;
  if (!sh) return rayAabb(origin, dir, rec, maxDist, outNormal);
  if (sh.kind === 'compound') {
    let best = -1;
    _compoundRayRec.min[1] = rec.min[1]; _compoundRayRec.max[1] = rec.max[1];
    for (const part of sh.parts) {
      _compoundRayRec.shape2 = part;
      const hit = rayCollisionRecord(
        origin, dir, _compoundRayRec, best < 0 ? maxDist : best, _compoundCandidateNormal,
      );
      if (hit < 0 || (best >= 0 && hit >= best)) continue;
      best = hit;
      _compoundBestNormal.set(
        _compoundCandidateNormal.x, _compoundCandidateNormal.y, _compoundCandidateNormal.z,
      );
    }
    if (best >= 0) outNormal.set(
      _compoundBestNormal.x, _compoundBestNormal.y, _compoundBestNormal.z,
    );
    return best;
  }
  if (sh.kind === 'obb') return rayObb(origin, dir, rec, sh, maxDist, outNormal);
  if (sh.kind === 'circle') return rayCircle(origin, dir, rec, sh, maxDist, outNormal);
  if (sh.kind === 'convex') return rayConvex(origin, dir, rec, sh, maxDist, outNormal);
  return rayAabb(origin, dir, rec, maxDist, outNormal);
}

const _compoundRayRec: CollisionRecord = { min: [0, 0, 0], max: [0, 0, 0] };
const _compoundCandidateNormal: MutableVector3Like = {
  x: 0, y: 0, z: 0,
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; },
};
const _compoundBestNormal: MutableVector3Like = {
  x: 0, y: 0, z: 0,
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; },
};

/** Static uniform-grid broad phase. Query writes into the caller-owned array. */
export function createObstacleGrid(records: CollisionRecord[], cellSize = 24): ObstacleQuery {
  const cells = new Map<number, CollisionRecord[]>();
  const inv = 1 / cellSize;
  // Numeric signed-16 packing avoids allocating "x,z" strings in every
  // per-tank query. Battlefield cell coordinates are comfortably inside it.
  const key = (x: number, z: number) => (x + 32768) * 65536 + (z + 32768);
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const x0 = Math.floor(r.min[0] * inv), x1 = Math.floor(r.max[0] * inv);
    const z0 = Math.floor(r.min[2] * inv), z1 = Math.floor(r.max[2] * inv);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const k = key(x, z);
      let a = cells.get(k);
      if (!a) { a = []; cells.set(k, a); }
      a.push(r);
    }
  }
  let stamp = 0;
  return function query(
    minX: number, minZ: number, maxX: number, maxZ: number, out: CollisionRecord[],
  ) {
    out.length = 0;
    stamp++;
    if (stamp >= 0x7fffffff) { stamp = 1; for (const r of records) r.__gridStamp = 0; }
    const x0 = Math.floor(minX * inv), x1 = Math.floor(maxX * inv);
    const z0 = Math.floor(minZ * inv), z1 = Math.floor(maxZ * inv);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const a = cells.get(key(x, z));
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const r = a[i];
        if (r.__gridStamp === stamp) continue;
        r.__gridStamp = stamp;
        if (r.max[0] < minX || r.min[0] > maxX || r.max[2] < minZ || r.min[2] > maxZ) continue;
        out.push(r);
      }
    }
    return out;
  };
}
