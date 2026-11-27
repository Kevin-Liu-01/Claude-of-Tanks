/**
 * The replay-trace parity receipt's planted control (replay-receipts-279; tools/replay-trace-parity.browser.selftest.mjs):
 * the page's replay indexer Worker with ONE getter keyed wrongly. Its world is the real one (replayIndexerWorker.ts
 * replayIndexWorld), but the world's `heightField` is a getter answering from a WeakMap keyed by the job, not the world,
 * and the job's entry is the field of the next terrain seed: the class "the page's re-simulation steps on another world
 * than Node's" (live 276-278: the Worker's Frontline field had no trenches). The receipt must name what parts.
 *
 * Served by the dev server only (the receipt swaps it in for the indexer's own Worker URL); never bundled.
 */
import { decodeReplay } from '../src/sim/replayFormat.ts';
import { createHeightField } from '../src/world/terrain.ts';
import { worldBuildConfig } from '../src/world/worldBuildConfig.ts';
import { indexReplay } from '../src/game/replay/replayIndexer.ts';
import { replayIndexWorld, type ReplayIndexJob } from '../src/game/replay/replayIndexerWorker.ts';
import { ensureReplayFleet } from '../src/game/replay/replayRunner.ts';
import { recordedTerrainVariant } from '../src/game/replay/replaySetup.ts';
import { unpackReplay } from '../src/game/replay/replayStore.ts';

declare const self: { onmessage: ((event: MessageEvent<ReplayIndexJob>) => void) | null; postMessage(reply: unknown, transfer?: ArrayBuffer[]): void };

self.onmessage = ({ data: job }) => {
  (async () => {
    const recording = decodeReplay(await unpackReplay(new Uint8Array(job.file)));
    await ensureReplayFleet(recording);
    const world = replayIndexWorld(recording, job);
    const fields = new WeakMap<object, unknown>();
    fields.set(world, world.heightField);
    const mapId = String(recording.header.setup.mapId);
    fields.set(job, createHeightField(job.terrainSeed + 1, worldBuildConfig(mapId, recordedTerrainVariant(recording.header))));
    // THE PLANT: keyed by the job instead of the world
    Object.defineProperty(world, 'heightField', { configurable: true, get: () => fields.get(job) });
    const index = indexReplay(recording, world as never, { onProgress: (tick, lastTick) => self.postMessage({ type: 'progress', tick, lastTick }) });
    const track = index.track;
    self.postMessage({ type: 'done', index }, track ? [track.data.buffer as ArrayBuffer, track.shellOffsets.buffer as ArrayBuffer, track.shellData.buffer as ArrayBuffer] : []);
  })().catch((error: unknown) => self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }));
};
