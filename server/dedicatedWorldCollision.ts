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
  // keyed `<map>` or `<map>@<variant>`: a mode's battlefield variant is its own field (Frontline's carved trenches)
  return terrainCache ??= createMapResourceCache((key) => {
    const at = key.indexOf('@');
    const id = at < 0 ? key : key.slice(0, at), variant = at < 0 ? null : key.slice(at + 1);
    return createHeightField(manifests().terrainSeed, variantMapConfig(id, variant));
  }, 2);
}

/** The map's config as the variant builds it (sim/matchRuleset.ts terrainVariant; the world's map.ts does the same). */
export function variantMapConfig(id: string, variant: string | null) {
  const config = getMapConfig(id);
  if (variant === null) return config;
  if (variant !== 'assault-trenches') throw new Error(`unknown battlefield variant ${variant}`);
  return { ...config, assaultTrenches: true };
}

/**
 * Mutable collision state is always match-local. Registry owners retain a
 * terrain lease until teardown; ad-hoc callers only touch the bounded idle LRU.
 * Eviction drops a cache reference, never invalidates a field held by a world.
 */
export function createDedicatedWorldCollision(
  mapId: RuntimeValue,
  { retain = false, variant = null }: { retain?: boolean; variant?: string | null } = {},
) {
  const id = String(mapId || 'verdant');
  const manifest = manifests().get(id, variant); // validate the ID before config fallback
  const key = variant ? `${id}@${variant}` : id;
  const lease = retain ? terrain().acquire(key) : null;
  try {
    const heightField = lease ? lease.value : terrain().get(key);
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
