/**
 * The browser host's collision world (P2 client lane): the same manifest the match container loads from
 * `server/world-collision-manifests/<map>.json`, fetched from the build's static copy (`<base>/index.json`, then
 * `<base>/<map>.json`), verified against the index's byte count and SHA-256 with Web Crypto, decoded and validated by
 * the server's own codec, and built into the headless collision world over the map's height field — the container's
 * `createDedicatedWorldCollision` step for step, minus the disk. Runs in the Worker (and in Node for the receipt).
 */
import { createHeadlessCollisionWorld } from '../../world/headlessCollisionWorld.ts';
import { getMapConfig } from '../../world/maps/index.ts';
import { createHeightField } from '../../world/terrain.ts';
import { collisionManifestEntry, readCollisionManifestIndex, validateCollisionManifestCounts } from '../../../server/collisionManifestFormat.ts';
import { decodeCollisionManifest } from '../../../server/collisionManifestCodec.ts';
import type { ActorWorldCollision } from '../../../server/match/matchActor.ts';

/** The static route the build serves the manifests under (vite.config.ts copies `server/world-collision-manifests` there). */
export const COLLISION_MANIFEST_ROUTE = '/mp-collision';

type FetchLike = (url: string, init?: { cache?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer>; json(): Promise<unknown> }>;

interface LoadOptions {
  fetchImpl?: FetchLike;
  digest?: (algorithm: string, data: Uint8Array) => Promise<ArrayBuffer>;
  signal?: AbortSignal;
}

async function sha256Hex(bytes: Uint8Array, digest?: LoadOptions['digest']): Promise<string> {
  const run = digest ?? ((algorithm, data) => {
    const subtle = (globalThis as { crypto?: { subtle?: { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> } } }).crypto?.subtle;
    if (!subtle) throw new Error('Web Crypto is unavailable in this runtime');
    return subtle.digest(algorithm, data);
  });
  const hash = new Uint8Array(await run('SHA-256', bytes));
  let hex = '';
  for (const byte of hash) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/** Fetch, verify and build the collision world of `mapId` from the manifests under `base`. */
export async function loadCollisionWorld(mapId: string, base: string, { fetchImpl, digest, signal }: LoadOptions = {}): Promise<ActorWorldCollision> {
  const run = fetchImpl ?? ((globalThis as { fetch?: FetchLike }).fetch);
  if (typeof run !== 'function') throw new Error('fetch is unavailable in this runtime');
  const root = base.replace(/\/+$/, '');
  const indexResponse = await run(`${root}/index.json`, { cache: 'no-cache', signal });
  if (!indexResponse.ok) throw new Error(`collision manifest index: HTTP ${indexResponse.status}`);
  const index = readCollisionManifestIndex(await indexResponse.json());
  const entry = collisionManifestEntry(index, mapId);
  const response = await run(`${root}/${mapId}.json`, { cache: 'force-cache', signal });
  if (!response.ok) throw new Error(`collision manifest ${mapId}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== entry.bytes) throw new Error(`collision manifest size mismatch: ${mapId}`);
  if (await sha256Hex(bytes, digest) !== entry.sha256) throw new Error(`collision manifest checksum mismatch: ${mapId}`);
  const manifest = decodeCollisionManifest(JSON.parse(new TextDecoder().decode(bytes)));
  validateCollisionManifestCounts(manifest, entry);
  const heightField = createHeightField(index.terrainSeed, getMapConfig(mapId));
  const world = createHeadlessCollisionWorld({ mapId, heightField, manifest });
  return Object.assign(world, { release: () => { /* nothing leased: the Worker's world dies with the match */ } });
}
