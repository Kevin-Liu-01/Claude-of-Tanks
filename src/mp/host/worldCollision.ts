/**
 * The browser host's collision world (P2 client lane): the manifest `server/dedicatedWorldCollision.ts` reads from
 * `server/world-collision-manifests/<map>.json` on disk, here fetched from the build's static copy (`<base>/index.json`, then
 * `<base>/<map>.json`), verified against the index's byte count and SHA-256 with Web Crypto, decoded and validated by
 * the server's own codec, and built into the headless collision world over the map's height field —
 * `createDedicatedWorldCollision` step for step, minus the disk. Runs in the Worker (and in Node for the receipt).
 */
import { createHeadlessCollisionWorld } from '../../world/headlessCollisionWorld.ts';
import { getMapConfig } from '../../world/maps/index.ts';
import { createHeightField } from '../../world/terrain.ts';
import { collisionManifestEntry, readCollisionManifestIndex, validateCollisionManifestCounts } from '../../../server/collisionManifestFormat.ts';
import { decodeCollisionManifest } from '../../../server/collisionManifestCodec.ts';
import type { ActorWorldCollision } from '../../../server/match/matchActor.ts';
import type { ObstacleIdentity } from '../presentation/authorityObstacles.ts';

/**
 * The static route the build serves the manifests under (vite.config.ts emits `server/world-collision-manifests` there:
 * `index.json`, then every map content-addressed as `<map>.<sha256[0..12]>.json` so a cached file is always the indexed one).
 */
export const COLLISION_MANIFEST_ROUTE = '/mp-collision';

/** The file name of a map's manifest (or of its battlefield variant's) under the route, from its index entry. */
export function collisionManifestFileName(mapId: string, sha256: string, variant: string | null = null): string {
  // (the id and the variant were whitelisted by the index lookup that produced `sha256`)
  return `${variant ? `${mapId}@${variant}` : mapId}.${sha256.slice(0, 12)}.json`;
}

type FetchLike = (url: string, init?: { cache?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer>; json(): Promise<unknown> }>;

interface LoadOptions {
  fetchImpl?: FetchLike;
  digest?: (algorithm: string, data: Uint8Array) => Promise<ArrayBuffer>;
  signal?: AbortSignal;
  /** The mode's battlefield variant (sim/matchRuleset.ts terrainVariantFor): its own manifest and its own field. */
  variant?: string | null;
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

/** Fetch, verify and decode the collision manifest of `mapId` from the manifests under `base`, with the index's terrain seed. */
async function loadCollisionManifest(mapId: string, base: string, { fetchImpl, digest, signal, variant = null }: LoadOptions = {}) {
  const run = fetchImpl ?? ((globalThis as { fetch?: FetchLike }).fetch);
  if (typeof run !== 'function') throw new Error('fetch is unavailable in this runtime');
  const root = base.replace(/\/+$/, '');
  const indexResponse = await run(`${root}/index.json`, { cache: 'no-cache', signal });
  if (!indexResponse.ok) throw new Error(`collision manifest index: HTTP ${indexResponse.status}`);
  const index = readCollisionManifestIndex(await indexResponse.json());
  const entry = collisionManifestEntry(index, mapId, variant);
  const response = await run(`${root}/${collisionManifestFileName(mapId, entry.sha256, variant)}`, { cache: 'force-cache', signal });
  if (!response.ok) throw new Error(`collision manifest ${mapId}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== entry.bytes) throw new Error(`collision manifest size mismatch: ${mapId}`);
  if (await sha256Hex(bytes, digest) !== entry.sha256) throw new Error(`collision manifest checksum mismatch: ${mapId}`);
  const manifest = decodeCollisionManifest(JSON.parse(new TextDecoder().decode(bytes)));
  validateCollisionManifestCounts(manifest, entry);
  return { manifest, terrainSeed: index.terrainSeed };
}

/** Fetch, verify and build the collision world of `mapId` from the manifests under `base`. */
export async function loadCollisionWorld(mapId: string, base: string, options: LoadOptions = {}): Promise<ActorWorldCollision> {
  const { manifest, terrainSeed } = await loadCollisionManifest(mapId, base, options);
  // a variant's field is built from its own config (Frontline's trenches carved), as every client's world builds it
  const config = getMapConfig(mapId);
  const heightField = createHeightField(terrainSeed, options.variant === 'assault-trenches' ? { ...config, assaultTrenches: true } : config);
  const world = createHeadlessCollisionWorld({ mapId, heightField, manifest });
  return Object.assign(world, { release: () => { /* nothing leased: the Worker's world dies with the match */ } });
}

/**
 * The authority's obstacles by index as any world can find them — box centre on the ground plane and kind — from the
 * same verified manifest the host plays on (ghost-crunch lane, 2026-10-02). A peer whose world is laid out otherwise
 * (the mobile tier, Frontline Assault's trench works) reads the persistent destroyed list through it
 * (battlePresentation.setAuthorityObstacles). No height field, no world: the records' bounds alone.
 */
export async function loadObstacleIdentities(mapId: string, base: string, options: LoadOptions = {}): Promise<(index: number) => ObstacleIdentity | null> {
  const { manifest } = await loadCollisionManifest(mapId, base, options);
  const records = manifest.obstacles;
  return (index) => {
    const record = Number.isSafeInteger(index) && index >= 0 ? records[index] : undefined;
    if (!record) return null;
    const bounds = record.b;
    return { x: (bounds[0] + bounds[3]) * 0.5, z: (bounds[2] + bounds[5]) * 0.5, kind: record.k ?? null };
  };
}
