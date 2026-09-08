import type { RuntimeValue } from '../src/runtimeTypes.ts';
import { isMapId } from '../src/world/maps/catalog.ts';
import type { CollisionManifest, PackedCollisionRecord, PackedSimpleShape } from '../src/world/headlessCollisionWorld.ts';

export interface CollisionManifestCounts {
  obstacles: number;
  colliders: number;
  concealers: number;
}

export interface CollisionManifestEntry extends CollisionManifestCounts {
  bytes: number;
  sha256: string;
}

export interface CollisionManifestIndex {
  version: 2;
  terrainSeed: number;
  propsSeed: number;
  vegetationSeed: number;
  maps: Record<string, CollisionManifestEntry>;
}

export const MAX_COLLISION_SHARD_BYTES = 16 * 1024 * 1024;

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteTuple(value: RuntimeValue, length: number): value is number[] {
  return Array.isArray(value) && value.length === length &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

export function isSimpleShape(value: RuntimeValue): value is PackedSimpleShape {
  if (!Array.isArray(value)) return false;
  if (value[0] === 'o') return isFiniteTuple(value.slice(1), 5);
  if (value[0] === 'c') return isFiniteTuple(value.slice(1), 3);
  return value[0] === 'v' && value.length >= 7 && value.length <= 129 &&
    value.length % 2 === 1 &&
    value.slice(1).every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function isPackedShape(value: RuntimeValue): boolean {
  if (!Array.isArray(value)) return false;
  return value[0] === 'm'
    ? value.length >= 2 && value.length <= 65 && value.slice(1).every(isSimpleShape)
    : isSimpleShape(value);
}

function isNullableNumber(value: RuntimeValue): boolean {
  return value == null || (typeof value === 'number' && Number.isFinite(value));
}

/** Validate non-shape fields independently so decoded primitives are checked only once. */
export function isPackedCollisionMetadata(
  value: RuntimeValue,
): value is Omit<PackedCollisionRecord, 's'> & Record<string, RuntimeValue> {
  if (!isRecord(value) || !isFiniteTuple(value.b, 6)) return false;
  if (value.q !== undefined && typeof value.q !== 'boolean' && value.q !== 0 && value.q !== 1) return false;
  return isNullableNumber(value.m) && isNullableNumber(value.e) &&
    (value.k == null || typeof value.k === 'string') &&
    isNullableNumber(value.t) && isNullableNumber(value.p);
}

function isPackedCollisionRecord(value: RuntimeValue): value is PackedCollisionRecord {
  return isPackedCollisionMetadata(value) && (value.s === undefined || isPackedShape(value.s));
}

export function readCollisionConcealers(value: RuntimeValue): CollisionManifest['concealers'] {
  if (value !== undefined && (!Array.isArray(value) ||
      !value.every((entry) => isFiniteTuple(entry, 4)))) {
    throw new TypeError('world collision concealment is invalid');
  }
  return value as CollisionManifest['concealers'];
}

export function readCollisionManifest(value: RuntimeValue): CollisionManifest {
  if (!isRecord(value) || !Array.isArray(value.obstacles) ||
      !value.obstacles.every(isPackedCollisionRecord) || !Array.isArray(value.colliders) ||
      !value.colliders.every(isPackedCollisionRecord)) {
    throw new TypeError('world collision manifest is invalid');
  }
  return {
    obstacles: value.obstacles,
    colliders: value.colliders,
    concealers: readCollisionConcealers(value.concealers),
  };
}

export function collisionManifestCounts(manifest: CollisionManifest): CollisionManifestCounts {
  const packedTrees = new Set<number>();
  for (const record of manifest.colliders) {
    if (record.t != null) packedTrees.add(record.t);
  }
  let sharedTrees = 0;
  for (const record of manifest.obstacles) {
    if (record.t != null && !packedTrees.has(record.t)) sharedTrees++;
  }
  return {
    obstacles: manifest.obstacles.length,
    colliders: manifest.colliders.length + sharedTrees,
    concealers: manifest.concealers?.length || 0,
  };
}

function isCount(value: RuntimeValue): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isIndexEntry(value: RuntimeValue): value is CollisionManifestEntry {
  return isRecord(value) && isCount(value.bytes) && value.bytes > 0 &&
    value.bytes <= MAX_COLLISION_SHARD_BYTES && typeof value.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(value.sha256) && isCount(value.obstacles) &&
    isCount(value.colliders) && isCount(value.concealers);
}

export function readCollisionManifestIndex(value: RuntimeValue): CollisionManifestIndex {
  if (!isRecord(value) || value.version !== 2 || value.terrainSeed !== 1337 ||
      value.propsSeed !== 2002 || value.vegetationSeed !== 2001 || !isRecord(value.maps)) {
    throw new TypeError('world collision manifest index is invalid');
  }
  const maps: Record<string, CollisionManifestEntry> = {};
  const entries = Object.entries(value.maps);
  if (!entries.length) throw new TypeError('world collision manifest index contains no maps');
  for (const [id, entry] of entries) {
    if (!isMapId(id) || !isIndexEntry(entry)) {
      throw new TypeError('world collision manifest index contains an invalid map');
    }
    maps[id] = entry;
  }
  return { version: 2, terrainSeed: 1337, propsSeed: 2002, vegetationSeed: 2001, maps };
}

/** IDs are whitelisted before forming a path; never use getMapConfig's fallback. */
export function collisionManifestEntry(index: CollisionManifestIndex, id: string): CollisionManifestEntry {
  if (!isMapId(id) || !Object.hasOwn(index.maps, id)) {
    throw new Error(`missing compatible collision manifest for ${id}`);
  }
  return index.maps[id];
}

export function validateCollisionManifestCounts(
  manifest: CollisionManifest,
  entry: CollisionManifestEntry,
): void {
  const counts = collisionManifestCounts(manifest);
  if (counts.obstacles !== entry.obstacles || counts.colliders !== entry.colliders ||
      counts.concealers !== entry.concealers) {
    throw new Error('world collision manifest census mismatch');
  }
}
