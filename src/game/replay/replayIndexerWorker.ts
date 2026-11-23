/**
 * The replay indexer's Worker (replay-system-275, docs/REPLAY.md §3 P2): a recording and its battle's collision records
 * in, the track out (replayIndexer.ts), so a five-minute battle's re-simulation never holds the page. A lazy chunk of its
 * own (replayIndexerClient.ts starts it; main.ts never imports it). The local driver only: it never reaches src/mp.
 *
 * The collision records are the ones the page's battle stepped on, packed (headlessCollisionWorld.ts CollisionManifest):
 * the page sends them, so the replay collides with exactly what the battle did, without a fetch.
 */
import { decodeReplay } from '../../sim/replayFormat.ts';
import { createHeadlessCollisionWorld, type CollisionManifest } from '../../world/headlessCollisionWorld.ts';
import { getMapConfig } from '../../world/maps/index.ts';
import { createHeightField } from '../../world/terrain.ts';
import { indexReplay, type ReplayIndex } from './replayIndexer.ts';
import { ensureReplayFleet, withLayoutSpawnPoints } from './replayRunner.ts';
import { unpackReplay } from './replayStore.ts';

/** The page's request: a recording's file bytes (gzipped or raw) and its battle's world. */
export interface ReplayIndexJob {
  file: ArrayBuffer;
  manifest: CollisionManifest;
  /** The height field's seed (the world build's; world/map.ts createMap's default). */
  terrainSeed: number;
}

export type ReplayIndexReply =
  | { type: 'progress'; tick: number; lastTick: number }
  | { type: 'done'; index: ReplayIndex }
  | { type: 'error'; message: string };

declare const self: {
  onmessage: ((event: MessageEvent<ReplayIndexJob>) => void) | null;
  postMessage(reply: ReplayIndexReply, transfer?: ArrayBuffer[]): void;
};

/** The job, done: the reply to post and the buffers it hands over. */
export async function runReplayIndexJob(job: ReplayIndexJob, post: (reply: ReplayIndexReply) => void): Promise<{ index: ReplayIndex; transfer: ArrayBuffer[] }> {
  const recording = decodeReplay(await unpackReplay(new Uint8Array(job.file)));
  await ensureReplayFleet(recording);
  const mapId = String(recording.header.setup.mapId);
  const world = withLayoutSpawnPoints(createHeadlessCollisionWorld({ mapId, heightField: createHeightField(job.terrainSeed, getMapConfig(mapId)),
    manifest: job.manifest }));
  const index = indexReplay(recording, world as never, { onProgress: (tick, lastTick) => post({ type: 'progress', tick, lastTick }) });
  const track = index.track;
  return { index, transfer: track ? [track.data.buffer as ArrayBuffer, track.shellOffsets.buffer as ArrayBuffer, track.shellData.buffer as ArrayBuffer] : [] };
}

// (a worker scope only: never a page, whose window would take the handler)
if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof (self as { postMessage?: unknown }).postMessage === 'function') {
  self.onmessage = ({ data }) => {
    runReplayIndexJob(data, (reply) => self.postMessage(reply)).then(
      ({ index, transfer }) => self.postMessage({ type: 'done', index }, transfer),
      (error: unknown) => self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
  };
}
