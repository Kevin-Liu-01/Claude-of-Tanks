import type { RuntimeValue } from '../src/runtimeTypes.ts';
import manifests from './world-collision-manifests.json' with { type: 'json' };
import { createHeadlessCollisionWorld } from '../src/world/headlessCollisionWorld.ts';
import type {
  CollisionManifest,
  PackedCollisionRecord,
} from '../src/world/headlessCollisionWorld.ts';
import { getMapConfig } from '../src/world/maps/index.ts';
import { createHeightField } from '../src/world/terrain.ts';

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

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteTuple(value: RuntimeValue, length: number): value is number[] {
  return Array.isArray(value) && value.length === length &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function isPackedShape(value: RuntimeValue): boolean {
  if (!Array.isArray(value) || typeof value[0] !== 'string') return false;
  if (value[0] === 'o') return isFiniteTuple(value.slice(1), 5);
  if (value[0] === 'c') return isFiniteTuple(value.slice(1), 3);
  if (value[0] === 'm') return value.length >= 2 && value.slice(1).every(isPackedShape) &&
    value.slice(1).every((part) => Array.isArray(part) && part[0] !== 'm');
  return value[0] === 'v' && value.length >= 7 && value.length % 2 === 1 &&
    value.slice(1).every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function isNullableNumber(value: RuntimeValue): boolean {
  return value == null || (typeof value === 'number' && Number.isFinite(value));
}

function isPackedCollisionRecord(value: RuntimeValue): value is PackedCollisionRecord {
  return isRecord(value) && isFiniteTuple(value.b, 6) &&
    (value.s === undefined || isPackedShape(value.s)) &&
    (value.q === undefined || typeof value.q === 'boolean' || value.q === 0 || value.q === 1) &&
    isNullableNumber(value.m) && isNullableNumber(value.e) &&
    (value.k == null || typeof value.k === 'string') &&
    isNullableNumber(value.t) && isNullableNumber(value.p);
}

function isCollisionManifest(value: RuntimeValue): value is CollisionManifest {
  return isRecord(value) && Array.isArray(value.obstacles) &&
    value.obstacles.every(isPackedCollisionRecord) &&
    Array.isArray(value.colliders) && value.colliders.every(isPackedCollisionRecord) &&
    (value.concealers === undefined || (Array.isArray(value.concealers) &&
      value.concealers.every((entry) => isFiniteTuple(entry, 4))));
}

function isCollisionManifestMap(
  value: RuntimeValue,
): value is Record<string, CollisionManifest> {
  return isRecord(value) && Object.values(value).every(isCollisionManifest);
}

function readCollisionManifests(value: RuntimeValue): CollisionManifestBundle {
  if (!isRecord(value) || value.version !== 2 ||
      typeof value.terrainSeed !== 'number' || !Number.isFinite(value.terrainSeed) ||
      !isCollisionManifestMap(value.maps)) {
    throw new TypeError('world collision manifest bundle is invalid');
  }
  return { version: value.version, terrainSeed: value.terrainSeed, maps: value.maps };
}

const collisionManifests = readCollisionManifests(manifests);
const terrainByMap = new Map<string, TerrainHeightField>();

/** Build match-local collision state from the exact captured visual map. */
export function createDedicatedWorldCollision(
  mapId: RuntimeValue,
): ReturnType<typeof createHeadlessCollisionWorld> {
  const id = String(mapId || 'verdant');
  const manifest = collisionManifests.maps[id];
  if (!manifest || collisionManifests.version !== 2) {
    throw new Error(`missing compatible collision manifest for ${id}`);
  }
  let heightField = terrainByMap.get(id);
  if (!heightField) {
    const mapConfig = getMapConfig(id);
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
