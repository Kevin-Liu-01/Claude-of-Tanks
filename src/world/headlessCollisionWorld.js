import { Vector3 } from 'three';
import { createObstacleGrid, rayCollisionRecord } from './collision.js';

function unpackRecord(packed) {
  const bounds = packed.b;
  const record = {
    min: [bounds[0], bounds[1], bounds[2]],
    max: [bounds[3], bounds[4], bounds[5]],
  };
  const shape = packed.s;
  if (shape?.[0] === 'o') {
    record.shape2 = {
      kind: 'obb', cx: shape[1], cz: shape[2], hw: shape[3], hl: shape[4], yaw: shape[5],
    };
  } else if (shape?.[0] === 'c') {
    record.shape2 = { kind: 'circle', cx: shape[1], cz: shape[2], r: shape[3] };
  } else if (shape?.[0] === 'v') {
    const points = shape.slice(1);
    let cx = 0;
    let cz = 0;
    for (let index = 0; index < points.length; index += 2) {
      cx += points[index];
      cz += points[index + 1];
    }
    const count = Math.max(1, points.length / 2);
    record.shape2 = { kind: 'convex', cx: cx / count, cz: cz / count, points };
  }
  if (packed.q) record.crushable = true;
  if (packed.m != null) record.crushMin = packed.m;
  if (packed.e != null) record.crushKeep = packed.e;
  if (packed.k != null) record.kind = packed.k;
  if (packed.t != null) record.treeIdx = packed.t;
  if (packed.p != null) record.propIdx = packed.p;
  return record;
}

/** Inflate one captured visual-world manifest into a match-local facade. */
export function createHeadlessCollisionWorld({ mapId, heightField, manifest } = {}) {
  if (!heightField || typeof heightField.getHeightAt !== 'function') {
    throw new TypeError('heightField is required');
  }
  if (!manifest || !Array.isArray(manifest.obstacles) || !Array.isArray(manifest.colliders)) {
    throw new TypeError('collision manifest is required');
  }
  const obstacles = manifest.obstacles.map(unpackRecord);
  const colliders = manifest.colliders.map(unpackRecord);
  const concealers = (manifest.concealers || []).map(([x, z, r, add]) => ({ x, z, r, add }));
  const queryObstacles = createObstacleGrid(obstacles);
  const queryColliders = createObstacleGrid(colliders);
  const candidates = [];
  const point = new Vector3();
  const bisectPoint = new Vector3();
  const hitNormal = new Vector3();
  const bestNormal = new Vector3();
  const fastHeightAt = heightField.getHeightAtFast || heightField.getHeightAt;

  function raycast(origin, direction, maxDistance) {
    let bestDistance = Infinity;
    let bestKind = null;
    let bestRecord = null;
    const endX = origin.x + direction.x * maxDistance;
    const endZ = origin.z + direction.z * maxDistance;
    queryColliders(
      Math.min(origin.x, endX), Math.min(origin.z, endZ),
      Math.max(origin.x, endX), Math.max(origin.z, endZ),
      candidates,
    );
    for (const collider of candidates) {
      if (collider.dead) continue;
      const distance = rayCollisionRecord(
        origin, direction, collider, Math.min(maxDistance, bestDistance), hitNormal,
      );
      if (distance >= 0 && distance < bestDistance) {
        bestDistance = distance;
        bestKind = 'prop';
        bestRecord = collider;
        bestNormal.copy(hitNormal);
      }
    }

    let terrainDistance = -1;
    let distance = 0;
    let clearance = origin.y - fastHeightAt(origin.x, origin.z);
    if (clearance <= 0) {
      terrainDistance = 0;
    } else {
      const limit = Math.min(maxDistance, bestDistance);
      let priorDistance = 0;
      while (distance < limit) {
        const step = Math.min(Math.max(clearance * 0.5, 0.5), 2);
        priorDistance = distance;
        distance = Math.min(distance + step, limit);
        point.copy(direction).multiplyScalar(distance).add(origin);
        if (direction.y > 0 && point.y > heightField.maxY + 2) break;
        clearance = point.y - fastHeightAt(point.x, point.z);
        if (clearance <= 0) {
          let lo = priorDistance;
          let hi = distance;
          for (let index = 0; index < 6; index++) {
            const mid = (lo + hi) * 0.5;
            bisectPoint.copy(direction).multiplyScalar(mid).add(origin);
            if (bisectPoint.y - fastHeightAt(bisectPoint.x, bisectPoint.z) <= 0) hi = mid;
            else lo = mid;
          }
          terrainDistance = (lo + hi) * 0.5;
          break;
        }
        if (distance >= limit) break;
      }
    }

    let hitDistance;
    let kind;
    if (terrainDistance >= 0 && terrainDistance < bestDistance) {
      hitDistance = terrainDistance;
      kind = 'terrain';
    } else if (bestKind && bestDistance <= maxDistance) {
      hitDistance = bestDistance;
      kind = bestKind;
    } else {
      return null;
    }
    const hitPoint = new Vector3().copy(direction).multiplyScalar(hitDistance).add(origin);
    const normal = kind === 'terrain'
      ? heightField.getNormalAt(hitPoint.x, hitPoint.z).clone()
      : bestNormal.clone();
    return {
      point: hitPoint,
      normal,
      dist: hitDistance,
      kind,
      record: kind === 'prop' ? bestRecord : null,
    };
  }

  function crushObstacle(obstacle) {
    if (!obstacle || obstacle.crushed) return false;
    obstacle.crushed = true;
    if (obstacle.propIdx != null) {
      for (const record of obstacles) {
        if (record.propIdx === obstacle.propIdx) record.crushed = true;
      }
      for (const record of colliders) {
        if (record.propIdx === obstacle.propIdx) record.dead = true;
      }
    }
    return true;
  }

  return {
    mapId,
    heightField,
    raycast,
    getObstacles: () => obstacles,
    getColliders: () => colliders,
    getConcealment: () => concealers,
    queryObstacles,
    crushObstacle,
  };
}
