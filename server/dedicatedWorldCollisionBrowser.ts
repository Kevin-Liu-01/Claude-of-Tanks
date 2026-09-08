import { createHeadlessCollisionWorld } from '../src/world/headlessCollisionWorld.ts';
import { getMapConfig } from '../src/world/maps/index.ts';
import { createHeightField } from '../src/world/terrain.ts';
import {
  collisionManifestEntry,
  readCollisionManifestIndex,
  validateCollisionManifestCounts,
} from './collisionManifestFormat.ts';
import { decodeCollisionManifest } from './collisionManifestCodec.ts';

/** Browser-only capture/authority fixture. Never imports the Node filesystem loader. */
export async function createBrowserDedicatedWorldCollision(mapId: string) {
  const directory = new URL('./world-collision-manifests/', import.meta.url);
  // Fetch plain JSON rather than an ESM JSON import; its decoded records must
  // become collectible with this fixture, not enter the permanent module cache.
  const request = { cache: 'no-store' as const, headers: { Accept: 'application/json' } };
  const indexResponse = await fetch(new URL('index.json', directory), request);
  if (!indexResponse.ok) throw new Error('collision manifest index could not be loaded');
  const index = readCollisionManifestIndex(await indexResponse.json());
  const entry = collisionManifestEntry(index, mapId);
  const response = await fetch(new URL(`${mapId}.json`, directory), request);
  if (!response.ok) throw new Error(`collision manifest could not be loaded: ${mapId}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== entry.bytes) throw new Error('collision manifest size mismatch');
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const digest = Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
  if (digest !== entry.sha256) throw new Error('collision manifest checksum mismatch');
  const manifest = decodeCollisionManifest(JSON.parse(new TextDecoder().decode(bytes)));
  validateCollisionManifestCounts(manifest, entry);
  const heightField = createHeightField(index.terrainSeed, getMapConfig(mapId));
  return createHeadlessCollisionWorld({ mapId, heightField, manifest });
}
