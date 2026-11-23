import { Vector3 } from 'three';
import { createObstacleGrid, nearestColliderHitAlongRay as nearestRecordHitAlongRay, setCrushedRecords } from './collision.ts';
import { unpackCollisionRecord, type PackedCollisionRecord } from './collisionRecordCodec.ts';
import type { ColliderRayHit, CollisionRecord } from './collision.ts';
import type { HeightField } from './terrain.ts';
import { createDeformedHeightField, type TerrainDeformation } from '../sim/terrainDeformation.ts';
import { unpackMapCraterStamps, type MapCraterStamp } from './mapCraters.ts';
import { instantiateWorldKernels, type WorldKernelModule } from './wasmWorldKernels.ts';
import type { StructureSupportField, SupportHeightField } from '../sim/structureSupport.ts';
import { createConcealerIndex } from './concealerIndex.ts';

interface ConcealmentRecord {
  x: number;
  z: number;
  r: number;
  add: number;
}

export interface CollisionManifest {
  obstacles: PackedCollisionRecord[];
  colliders: PackedCollisionRecord[];
  concealers?: Array<readonly [number, number, number, number]>;
  /** DST-04 (2026-10-15): the map's pre-placed craters as its build decided them (world/mapCraters.ts
   *  packMapCraterStamps: [x, z, radius, depth, rim, deforms]); absent in a shard captured before them. */
  craters?: Array<readonly [number, number, number, number, number, number]>;
}

interface HeadlessCollisionWorldOptions {
  mapId?: string;
  heightField?: HeightField;
  manifest?: CollisionManifest;
  /** The WebAssembly kernels (wasmWorldKernels.ts): this world's contact surface and obstacle grids on its own
   * instance, bit for bit the TypeScript's. Off when absent. */
  kernels?: WorldKernelModule | null;
}

interface HeadlessRayHit {
  point: Vector3;
  normal: Vector3;
  dist: number;
  kind: 'terrain' | 'prop';
  record: CollisionRecord | null;
}

interface HeadlessCollisionWorld {
  mapId?: string;
  heightField: HeightField;
  raycast(origin: Vector3, direction: Vector3, maxDistance: number): HeadlessRayHit | null;
  /** The match's ground overlay (docs/DESTRUCTION.md §7): the ray march reads it as the rendered world's does. */
  bindGroundOverlay(overlay: TerrainDeformation | null): void;
  /** The map's pre-placed craters from the shard (world/mapCraters.ts). */
  getMapCraters(): readonly MapCraterStamp[];
  getObstacles(): CollisionRecord[];
  getColliders(): CollisionRecord[];
  getConcealment(): ConcealmentRecord[];
  queryObstacles(
    minX: number, minZ: number, maxX: number, maxZ: number, out: CollisionRecord[],
  ): CollisionRecord[];
  crushObstacle(obstacle: CollisionRecord | null | undefined): boolean;
  /** With kernels: the structure support field over the match's deformed field, on the kernel (authoritativeMatch.ts). */
  kernelSupportField?(terrain: SupportHeightField): StructureSupportField;
}

/** Inflate one captured visual-world manifest into a match-local facade. */
export function createHeadlessCollisionWorld(
  { mapId, heightField, manifest, kernels: kernelModule = null }: HeadlessCollisionWorldOptions = {},
): HeadlessCollisionWorld {
  if (!heightField || typeof heightField.getHeightAt !== 'function') {
    throw new TypeError('heightField is required');
  }
  if (!manifest || !Array.isArray(manifest.obstacles) || !Array.isArray(manifest.colliders)) {
    throw new TypeError('collision manifest is required');
  }
  const kernels = kernelModule ? instantiateWorldKernels(kernelModule, heightField.getHeightAt) : null;
  // the shared field (a cached map field serves several worlds) stays as it is: this world reads its own lattice
  const contact = kernels && heightField.getContactHeightAt ? kernels.contactSurface() : null;
  const worldHeightField: HeightField = contact
    ? { ...heightField, getContactHeightAt: contact.heightAt, getContactCellFlippedAt: contact.cellFlippedAt }
    : heightField;
  const obstacles = manifest.obstacles.map(unpackCollisionRecord);
  const colliders = manifest.colliders.map(unpackCollisionRecord);
  const packedTreeIds = new Set(
    colliders.filter((record) => record.treeIdx != null).map((record) => record.treeIdx),
  );
  for (const obstacle of obstacles) {
    if (obstacle.treeIdx != null && !packedTreeIds.has(obstacle.treeIdx)) {
      colliders.push(obstacle);
    }
  }
  const concealers = (manifest.concealers || []).map(([x, z, r, add]) => ({ x, z, r, add }));
  // (2026-11-02 audit M9) a felled tree's canopy by its trunk's centre in constant time: a whole destroyed set restored
  // at once (restoreDestroyedObstacles) stays linear in trees, not trees x discs (concealerIndex.ts)
  const canopy = createConcealerIndex(concealers);
  const mapCraters = unpackMapCraterStamps(manifest.craters);
  // (the obstacles are what hulls stand on: the kernel keeps their table beside their grid)
  const queryObstacles = kernels ? kernels.obstacleGrid(obstacles, 24, true) : createObstacleGrid(obstacles);
  const queryColliders = kernels ? kernels.obstacleGrid(colliders) : createObstacleGrid(colliders);
  const candidates: CollisionRecord[] = [];
  const point = new Vector3();
  const bisectPoint = new Vector3();
  const bestNormal = new Vector3();
  const nearestHit: ColliderRayHit = { distance: Infinity, record: null };
  const fastHeightAt = worldHeightField.getHeightAtFast || worldHeightField.getHeightAt;
  // destruction (docs/DESTRUCTION.md §6, §7; 2026-10-15): the match's ground overlay as drawn (world/map.ts's march, the
  // same law), bound by the authority that owns it
  let rayOverlay: TerrainDeformation | null = null;
  let rayNormalField: HeightField = worldHeightField;
  const rayHeightAt = (x: number, z: number): number => (
    rayOverlay ? fastHeightAt(x, z) + rayOverlay.contactOffsetAt(x, z) : fastHeightAt(x, z)
  );

  function nearestColliderHit(
    origin: Vector3,
    direction: Vector3,
    maxDistance: number,
  ): { distance: number; record: CollisionRecord | null } {
    // the rendered world's narrow phase (world/collision.ts): dead records skipped, a structure with openings as a whole;
    // the broad phase marches along the ray as the rendered world's does (nearestColliderHitAlongRay: the same hit)
    nearestRecordHitAlongRay(queryColliders, origin, direction, maxDistance, bestNormal, nearestHit, candidates);
    return { distance: nearestHit.distance, record: nearestHit.record };
  }

  function terrainHitDistance(
    origin: Vector3,
    direction: Vector3,
    maxDistance: number,
  ): number {
    const refineHit = (lowDistance: number, highDistance: number): number => {
      let low = lowDistance;
      let high = highDistance;
      for (let index = 0; index < 6; index++) {
        const mid = (low + high) * 0.5;
        bisectPoint.copy(direction).multiplyScalar(mid).add(origin);
        if (bisectPoint.y - rayHeightAt(bisectPoint.x, bisectPoint.z) <= 0) high = mid;
        else low = mid;
      }
      return (low + high) * 0.5;
    };
    let distance = 0;
    let clearance = origin.y - rayHeightAt(origin.x, origin.z);
    if (clearance <= 0) return 0;
    while (distance < maxDistance) {
      const step = Math.min(Math.max(clearance * 0.5, 0.5), 2);
      const priorDistance = distance;
      distance = Math.min(distance + step, maxDistance);
      point.copy(direction).multiplyScalar(distance).add(origin);
      if (direction.y > 0 && point.y > worldHeightField.maxY + (rayOverlay ? rayOverlay.maxRaiseM : 0) + 2) return -1;
      clearance = point.y - rayHeightAt(point.x, point.z);
      if (clearance <= 0) return refineHit(priorDistance, distance);
      if (distance >= maxDistance) return -1;
    }
    return -1;
  }

  function raycast(origin: Vector3, direction: Vector3, maxDistance: number): HeadlessRayHit | null {
    const propHit = nearestColliderHit(origin, direction, maxDistance);
    const terrainDistance = terrainHitDistance(
      origin,
      direction,
      Math.min(maxDistance, propHit.distance),
    );

    let hitDistance: number;
    let kind: 'terrain' | 'prop';
    if (terrainDistance >= 0 && terrainDistance < propHit.distance) {
      hitDistance = terrainDistance;
      kind = 'terrain';
    } else if (propHit.record && propHit.distance <= maxDistance) {
      hitDistance = propHit.distance;
      kind = 'prop';
    } else {
      return null;
    }
    const hitPoint = new Vector3().copy(direction).multiplyScalar(hitDistance).add(origin);
    const normal = kind === 'terrain'
      ? rayNormalField.getNormalAt(hitPoint.x, hitPoint.z).clone()
      : bestNormal.clone();
    return {
      point: hitPoint,
      normal,
      dist: hitDistance,
      kind,
      record: kind === 'prop' ? propHit.record : null,
    };
  }

  // (physics stream, 2026-10-16) a prop's and a tree's records by their index, built at the first crush: a crush marks
  // its own records without scanning the world's (a keyframe restoring Saltwind's 4,641 crushed wall spans scanned every
  // record for each, 9-20 s; restoreDestroyedObstacles). The lists are fixed once the world is built.
  let byProp: Map<number, { obstacles: CollisionRecord[]; colliders: CollisionRecord[] }> | null = null;
  let byTree: Map<number, { obstacles: CollisionRecord[]; colliders: CollisionRecord[] }> | null = null;
  function recordIndex(): void {
    byProp = new Map(); byTree = new Map();
    const slot = (map: typeof byProp, key: number) => {
      let entry = map!.get(key);
      if (!entry) { entry = { obstacles: [], colliders: [] }; map!.set(key, entry); }
      return entry;
    };
    for (const record of obstacles) {
      if (record.propIdx != null) slot(byProp, record.propIdx).obstacles.push(record);
      if (record.treeIdx != null) slot(byTree, record.treeIdx).obstacles.push(record);
    }
    for (const record of colliders) {
      if (record.propIdx != null) slot(byProp, record.propIdx).colliders.push(record);
      if (record.treeIdx != null) slot(byTree, record.treeIdx).colliders.push(record);
    }
  }

  function crushObstacle(obstacle: CollisionRecord | null | undefined) {
    if (!obstacle || obstacle.crushed) return false;
    obstacle.crushed = true;
    if (obstacle.propIdx != null || obstacle.treeIdx != null) {
      if (!byProp) recordIndex();
      const same = obstacle.propIdx != null ? byProp!.get(obstacle.propIdx) : byTree!.get(obstacle.treeIdx!);
      // (2026-11-02 audit M9) the page world's transition, on every record of the prop or tree (collision.ts)
      if (same) setCrushedRecords(same.obstacles, same.colliders, true);
      // and a felled tree's canopy stops concealing with it, as the page world's felled trees own it (felledTrees.ts)
      if (obstacle.treeIdx != null && obstacle.shape2) canopy.fellAt(obstacle.shape2.cx, obstacle.shape2.cz);
    }
    return true;
  }

  return {
    mapId,
    heightField: worldHeightField,
    raycast,
    bindGroundOverlay(overlay: TerrainDeformation | null) {
      kernels?.mirrorOverlay(overlay);
      rayOverlay = overlay;
      rayNormalField = overlay ? createDeformedHeightField(worldHeightField, overlay) : worldHeightField;
    },
    ...(kernels ? { kernelSupportField: (terrain: SupportHeightField) => kernels.supportField(terrain) } : {}),
    getObstacles: () => obstacles,
    getColliders: () => colliders,
    getConcealment: () => concealers,
    getMapCraters: () => mapCraters,
    queryObstacles,
    crushObstacle,
  };
}
