import manifests from './world-collision-manifests.json' with { type: 'json' };
import { createHeadlessCollisionWorld } from '../src/world/headlessCollisionWorld.ts';
import { getMapConfig } from '../src/world/maps/index.ts';
import { createHeightField } from '../src/world/terrain.ts';

type HeadlessWorldOptions = NonNullable<Parameters<typeof createHeadlessCollisionWorld>[0]>;
type CollisionManifest = NonNullable<HeadlessWorldOptions['manifest']>;
type TerrainHeightField = ReturnType<typeof createHeightField>;

interface CollisionManifestBundle {
  version: number;
  terrainSeed: number;
  maps: Record<string, CollisionManifest>;
}

export interface DedicatedCollisionManifestStats {
  obstacles: number;
  colliders: number;
  concealers: number;
}

const collisionManifests = manifests as unknown as CollisionManifestBundle;
const terrainByMap = new Map<string, TerrainHeightField>();

/** Build match-local collision state from the exact captured visual map. */
export function createDedicatedWorldCollision(
  mapId: unknown,
): ReturnType<typeof createHeadlessCollisionWorld> {
  const id = String(mapId || 'verdant');
  const manifest = collisionManifests.maps[id];
  if (!manifest || collisionManifests.version !== 2) {
    throw new Error(`missing compatible collision manifest for ${id}`);
  }
  let heightField = terrainByMap.get(id);
  if (!heightField) {
    const mapConfig = getMapConfig(id) as unknown as Parameters<typeof createHeightField>[1];
    heightField = createHeightField(collisionManifests.terrainSeed, mapConfig);
    terrainByMap.set(id, heightField);
  }
  return createHeadlessCollisionWorld({ mapId: id, heightField, manifest });
}

export function dedicatedCollisionManifestStats(): Record<string, DedicatedCollisionManifestStats> {
  return Object.fromEntries(Object.entries(collisionManifests.maps).map(([id, manifest]) => {
    const packedTreeIds = new Set(
      manifest.colliders.flatMap((record) => record.t == null ? [] : [record.t]),
    );
    let sharedTreeColliders = 0;
    for (const record of manifest.obstacles) {
      if (record.t != null && !packedTreeIds.has(record.t)) sharedTreeColliders++;
    }
    return [id, {
      obstacles: manifest.obstacles.length,
      colliders: manifest.colliders.length + sharedTreeColliders,
      concealers: manifest.concealers?.length || 0,
    }];
  }));
}
