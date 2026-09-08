import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import {
  collisionManifestEntry,
  readCollisionManifestIndex,
  validateCollisionManifestCounts,
  type CollisionManifestCounts,
} from './collisionManifestFormat.ts';
import { createMapResourceCache } from './mapResourceCache.ts';
import { decodeCollisionManifest } from './collisionManifestCodec.ts';

/** Node-only I/O seam. JSON is parsed on demand, never retained by the ESM cache. */
export function createCollisionManifestLoader(
  directory = new URL('./world-collision-manifests/', import.meta.url),
) {
  const indexUrl = new URL('index.json', directory);
  if (statSync(indexUrl).size > 64 * 1024) throw new Error('collision manifest index is too large');
  const index = readCollisionManifestIndex(JSON.parse(readFileSync(indexUrl, 'utf8')));
  const manifests = createMapResourceCache((id) => {
    const entry = collisionManifestEntry(index, id);
    const url = new URL(`${id}.json`, directory);
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
    get: manifests.get,
    cacheStats: manifests.stats,
    stats(): Record<string, CollisionManifestCounts> {
      return Object.fromEntries(Object.entries(index.maps).map(([id, entry]) => [id, {
        obstacles: entry.obstacles, colliders: entry.colliders, concealers: entry.concealers,
      }]));
    },
  };
}
