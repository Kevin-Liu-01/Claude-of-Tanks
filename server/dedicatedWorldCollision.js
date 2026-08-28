import manifests from './world-collision-manifests.json' with { type: 'json' };
import { createHeadlessCollisionWorld } from '../src/world/headlessCollisionWorld.ts';
import { getMapConfig } from '../src/world/maps/index.js';
import { createHeightField } from '../src/world/terrain.js';

const terrainByMap = new Map();

/** Build match-local collision state from the exact captured visual map. */
export function createDedicatedWorldCollision(mapId) {
  const id = String(mapId || 'verdant');
  const manifest = manifests.maps[id];
  if (!manifest || manifests.version !== 1) {
    throw new Error(`missing compatible collision manifest for ${id}`);
  }
  let heightField = terrainByMap.get(id);
  if (!heightField) {
    heightField = createHeightField(manifests.terrainSeed, getMapConfig(id));
    terrainByMap.set(id, heightField);
  }
  return createHeadlessCollisionWorld({ mapId: id, heightField, manifest });
}

export function dedicatedCollisionManifestStats() {
  return Object.fromEntries(Object.entries(manifests.maps).map(([id, manifest]) => [id, {
    obstacles: manifest.obstacles.length,
    colliders: manifest.colliders.length,
    concealers: manifest.concealers.length,
  }]));
}
