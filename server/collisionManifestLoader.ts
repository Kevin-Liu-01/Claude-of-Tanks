import {
  collisionManifestEntry,
  collisionManifestShardName,
  readCollisionManifestIndex,
  validateCollisionManifestCounts,
  type CollisionManifestCounts,
} from './collisionManifestFormat.ts';
import { createMapResourceCache } from './mapResourceCache.ts';
import { decodeCollisionManifest } from './collisionManifestCodec.ts';

/**
 * The Node built-ins, resolved at call time (`process.getBuiltinModule`, Node >= 22.3) so this module carries no static
 * `node:` import: the browser host's Worker bundle (src/mp/host) reaches the match actor through the same module graph
 * and never calls the loader (it builds its world from a fetched manifest).
 */
function nodeIo(): { createHash: typeof import('node:crypto').createHash; readFileSync: typeof import('node:fs').readFileSync; statSync: typeof import('node:fs').statSync } {
  const builtin = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process?.getBuiltinModule;
  if (typeof builtin !== 'function') throw new Error('collision manifests are read by the Node loader only');
  const crypto = builtin('node:crypto') as typeof import('node:crypto');
  const fs = builtin('node:fs') as typeof import('node:fs');
  return { createHash: crypto.createHash, readFileSync: fs.readFileSync, statSync: fs.statSync };
}

/** Node-only I/O seam. JSON is parsed on demand, never retained by the ESM cache. */
export function createCollisionManifestLoader(
  directory = new URL('./world-collision-manifests/', import.meta.url),
) {
  const { createHash, readFileSync, statSync } = nodeIo();
  const indexUrl = new URL('index.json', directory);
  if (statSync(indexUrl).size > 64 * 1024) throw new Error('collision manifest index is too large');
  const index = readCollisionManifestIndex(JSON.parse(readFileSync(indexUrl, 'utf8')));
  // keyed by the shard name: `<map>` or `<map>@<variant>` (a mode's battlefield variant, its own manifest)
  const manifests = createMapResourceCache((key) => {
    const at = key.indexOf('@');
    const id = at < 0 ? key : key.slice(0, at), variant = at < 0 ? null : key.slice(at + 1);
    const entry = collisionManifestEntry(index, id, variant);
    const url = new URL(`${collisionManifestShardName(id, variant)}.json`, directory);
    if (statSync(url).size !== entry.bytes) throw new Error(`collision manifest size mismatch: ${id}`);
    const bytes = readFileSync(url);
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
      throw new Error(`collision manifest checksum mismatch: ${id}`);
    }
    const manifest = decodeCollisionManifest(JSON.parse(bytes.toString('utf8')));
    validateCollisionManifestCounts(manifest, entry);
    return manifest;
  }, 2);

  return {
    terrainSeed: index.terrainSeed,
    /** The manifest of `id`, or of its `variant` (null: the base map). */
    // (the factory validates: the index lookup first, as before, then the shard's name)
    get: (id: string, variant: string | null = null) => manifests.get(variant ? `${id}@${variant}` : id),
    cacheStats: manifests.stats,
    stats(): Record<string, CollisionManifestCounts> {
      return Object.fromEntries(Object.entries(index.maps).map(([id, entry]) => [id, {
        obstacles: entry.obstacles, colliders: entry.colliders, concealers: entry.concealers,
      }]));
    },
  };
}
