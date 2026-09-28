import type { RuntimeValue } from '../src/runtimeTypes.ts';
import { createHeadlessCollisionWorld } from '../src/world/headlessCollisionWorld.ts';
import { getMapConfig } from '../src/world/maps/index.ts';
import { createHeightField } from '../src/world/terrain.ts';
import { createCollisionManifestLoader } from './collisionManifestLoader.ts';
import { createMapResourceCache } from './mapResourceCache.ts';
export type { CollisionManifestCounts as DedicatedCollisionManifestStats } from './collisionManifestFormat.ts';

// Both caches are built on first use: the loader reads the manifest index from disk, and this module is on the match
// actor's import graph, which the browser host bundles into a Worker (src/mp/host) that never loads a shard from disk.
let manifestLoader: ReturnType<typeof createCollisionManifestLoader> | null = null;
let terrainCache: ReturnType<typeof createMapResourceCache<ReturnType<typeof createHeightField>>> | null = null;
function manifests(): ReturnType<typeof createCollisionManifestLoader> {
  return manifestLoader ??= createCollisionManifestLoader();
}
function terrain(): NonNullable<typeof terrainCache> {
  return terrainCache ??= createMapResourceCache((id) => createHeightField(manifests().terrainSeed, getMapConfig(id)), 2);
}

/**
 * Mutable collision state is always match-local. Registry owners retain a
 * terrain lease until teardown; ad-hoc callers only touch the bounded idle LRU.
 * Eviction drops a cache reference, never invalidates a field held by a world.
 */
export function createDedicatedWorldCollision(
  mapId: RuntimeValue,
  { retain = false }: { retain?: boolean } = {},
) {
  const id = String(mapId || 'verdant');
  const manifest = manifests().get(id); // validate the ID before config fallback
  const lease = retain ? terrain().acquire(id) : null;
  try {
    const heightField = lease ? lease.value : terrain().get(id);
    const world = createHeadlessCollisionWorld({ mapId: id, heightField, manifest });
    return Object.assign(world, { release: () => { lease?.release(); } });
  } catch (error) {
    lease?.release();
    throw error;
  }
}

export const dedicatedCollisionManifestStats = () => manifests().stats();

export function dedicatedCollisionCacheStats() {
  return { terrain: terrain().stats(), manifests: manifests().cacheStats() };
}
