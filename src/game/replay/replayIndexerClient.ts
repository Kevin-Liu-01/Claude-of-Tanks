/**
 * The page's side of the replay indexer (replay-system-275, docs/REPLAY.md §3 P2): starts the Worker
 * (replayIndexerWorker.ts) for one recording, reports its progress, resolves with the index, and stops the Worker when
 * the job ends or the viewer closes (cancel). One Worker per job: an index is minutes of battle in seconds of work, and
 * a closed viewer must not leave a re-simulation running.
 */
import type { CollisionManifest } from '../../world/headlessCollisionWorld.ts';
import type { ReplayIndex } from './replayIndexer.ts';
import type { ReplayIndexJob, ReplayIndexReply } from './replayIndexerWorker.ts';

interface WorkerLike {
  onmessage: ((event: { data: ReplayIndexReply }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  postMessage(job: ReplayIndexJob, transfer?: ArrayBuffer[]): void;
  terminate(): void;
}

export interface ReplayIndexTask {
  readonly done: Promise<ReplayIndex>;
  cancel(): void;
}

export function indexReplayInWorker(
  file: Uint8Array,
  world: { manifest: CollisionManifest; terrainSeed: number },
  { onProgress, makeWorker = () => new Worker(new URL('./replayIndexerWorker.ts', import.meta.url), { type: 'module', name: 'cot-replay-indexer' }) as unknown as WorkerLike }:
    { onProgress?(tick: number, lastTick: number): void; makeWorker?: () => WorkerLike } = {},
): ReplayIndexTask {
  const worker = makeWorker();
  let settle: ((error: Error | null, index?: ReplayIndex) => void) | null = null;
  const done = new Promise<ReplayIndex>((resolve, reject) => {
    settle = (error, index) => { settle = null; worker.terminate(); if (error) reject(error); else resolve(index!); };
  });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') onProgress?.(data.tick, data.lastTick);
    else if (data.type === 'done') settle?.(null, data.index);
    else settle?.(new Error(`replay index: ${data.message}`));
  };
  worker.onerror = (event) => settle?.(new Error(`replay index: ${event.message ?? 'the worker failed'}`));
  // the file's own copy goes to the Worker (the caller keeps its bytes)
  const copy = file.slice().buffer as ArrayBuffer;
  worker.postMessage({ file: copy, manifest: world.manifest, terrainSeed: world.terrainSeed }, [copy]);
  return { done, cancel: () => settle?.(new Error('replay index: cancelled')) };
}
