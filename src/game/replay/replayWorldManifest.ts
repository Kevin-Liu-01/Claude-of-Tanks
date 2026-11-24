/**
 * The replay indexer's world from the page's own (replay-system, docs/REPLAY.md §3 P2): the battle's collision records
 * packed exactly as the shard capture packs them (tools/capture-world-collision-manifests.mjs collisionCaptureScript),
 * so the Worker collides on what the recording's battle collided on with no fetch. Since sim-world-packed (276) the
 * page's records are the packer's rounded form already, so packing them again is idempotent. Read the world before
 * anything crushes it: the viewer never steps, so a replay battle's world stays as its setup left it.
 */
import type { CollisionManifest } from '../../world/headlessCollisionWorld.ts';
import { packCollisionRecord } from '../../world/collisionRecordPacking.ts';

type PackableRecord = Parameters<typeof packCollisionRecord>[0];

/** The terrain seed every battle world is built with (world/map.ts createMap; the shards' index pins it). */
export const REPLAY_TERRAIN_SEED = 1337;

interface ManifestWorld {
  getObstacles(): readonly PackableRecord[];
  getColliders(): readonly (PackableRecord & { treeIdx?: number | null })[];
  getConcealment(): readonly { x: number; z: number; r: number; add: number }[];
  getMapCraters?(): readonly { x: number; z: number; radiusM: number; depthM: number; rimM: number; deforms?: boolean }[];
}

const tenth = (value: number) => Math.round(value * 10000) / 10000;

export function replayCollisionManifest(world: ManifestWorld): CollisionManifest {
  return {
    obstacles: world.getObstacles().map((record) => packCollisionRecord(record)),
    // a tree trunk is one record for movement and shells: the obstacles carry it once (as the shards do)
    colliders: world.getColliders().filter((record) => record.treeIdx == null).map((record) => packCollisionRecord(record)),
    concealers: world.getConcealment().map((entry) => [tenth(entry.x), tenth(entry.z), tenth(entry.r), tenth(entry.add)] as const),
    craters: (world.getMapCraters?.() ?? []).map((s) => [s.x, s.z, s.radiusM, s.depthM, s.rimM, s.deforms ? 1 : 0] as const),
  };
}
