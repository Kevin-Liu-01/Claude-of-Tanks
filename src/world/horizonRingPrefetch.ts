/**
 * The horizon ring prefetch (2026-10-08, the time-to-battle lane; the owner: "going into games takes a long time").
 *
 * The ring's geometry pipeline (maps/horizon.ts horizonRingGeometrySteps) is a pure function of the map's config, the
 * height field's seed and the ring's seed, and it was about 85 % of the ring's build — over a third of the terrain
 * stage — on the main thread. The world build starts it here, in a worker (horizonRingWorker.ts), when it starts; the
 * terrain build builds its chunks first and takes the worker's pipeline when it reaches the ring (waiting for it if it
 * must), and builds it where it stands when there is no worker or it failed. The same function either way: the same
 * arrays (src/world/horizonRingWorker.selftest.mjs).
 *
 * The last map's pipeline is kept (a copy): a rematch on the same map, the commonest next battle, takes a copy of it and
 * skips the pipeline altogether.
 */
import type { HorizonRingPipeline } from './maps/horizon.ts';
import { copyHorizonRingWire, packHorizonRing, unpackHorizonRing, type HorizonRingWire } from './horizonRingWire.ts';
import type { HorizonRingJob, HorizonRingReply, HorizonRingRequest } from './horizonRingWorker.ts';

export type { HorizonRingRequest } from './horizonRingWorker.ts';

/** A ring request by everything its pipeline depends on. */
export function horizonRingKey(request: HorizonRingRequest): string {
  return [request.mapId, request.terrainVariant ?? '', request.fieldSeed, request.ringSeed, request.vista ? 1 : 0, request.debugColors ? 1 : 0].join('|');
}

/** The last ring built (its own copy), for a rematch on the same map. */
let lastRing: { key: string; wire: HorizonRingWire } | null = null;

/** Forget the kept ring (a receipt's fresh start). */
export function forgetHorizonRing(): void {
  lastRing = null;
}

type RingWorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror'>;

interface HorizonRingSource {
  readonly request: HorizonRingRequest;
  /** The worker has not answered yet. */
  readonly pending: boolean;
  /** Resolves once the worker has answered (or failed, or the source was disposed); never rejects. */
  settled(): Promise<void>;
  /** The pipeline, once: the kept ring's copy or the worker's; null when there is none (build it where it stands). */
  take(): HorizonRingPipeline | null;
  /** Keep a pipeline the build made where it stood (no worker, or it failed) for a rematch. */
  remember(pipeline: HorizonRingPipeline): void;
  dispose(): void;
  /**
   * Where the ring came from and when (ms from the start): 'kept' or 'worker' when the terrain build took that pipeline,
   * 'inline' when it built its own (no worker, a failure, or no answer before the build finished it); the worker's own
   * run (workerMs) and its answer (doneMs, failed or disposed included); when the terrain build first asked (askedMs) and
   * when it took a pipeline (takenMs; -1 when it built its own). The world build leaves this record on the terrain group
   * (userData.horizonRingLoad) for the load probes.
   */
  readonly stats: HorizonRingStats;
}

interface HorizonRingStats {
  source: 'kept' | 'worker' | 'inline';
  failed: boolean;
  workerMs: number;
  doneMs: number;
  askedMs: number;
  takenMs: number;
}

export function startHorizonRingBuild(
  request: HorizonRingRequest,
  makeWorker: (() => RingWorkerPort) | null = typeof Worker === 'undefined' ? null
    : () => new Worker(new URL('./horizonRingWorker.ts', import.meta.url), { type: 'module', name: 'cot-horizon-ring' }),
  now: () => number = () => performance.now(),
): HorizonRingSource {
  const key = horizonRingKey(request);
  const startedAt = now();
  const stats: HorizonRingStats = { source: 'inline', failed: false, workerMs: 0, doneMs: 0, askedMs: -1, takenMs: -1 };
  let kept = false;
  let pipeline: HorizonRingPipeline | null = null;
  let worker: RingWorkerPort | null = null;
  let resolveSettled: () => void = () => {};
  const settledPromise = new Promise<void>((resolve) => { resolveSettled = resolve; });
  const finish = (): void => {
    stats.doneMs = Math.round(now() - startedAt);
    if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); worker = null; }
    resolveSettled();
  };
  if (lastRing && lastRing.key === key) {
    pipeline = unpackHorizonRing(copyHorizonRingWire(lastRing.wire));
    kept = true;
    finish();
  } else if (makeWorker) {
    try {
      worker = makeWorker();
      worker.onmessage = (event: MessageEvent<HorizonRingReply>) => {
        const reply = event.data;
        if (reply?.id !== 1) return;
        if (reply.ok) {
          lastRing = { key, wire: copyHorizonRingWire(reply.wire) };
          pipeline = unpackHorizonRing(reply.wire);
          stats.workerMs = reply.ms;
        } else stats.failed = true;
        finish();
      };
      worker.onerror = () => { stats.failed = true; finish(); };
      worker.postMessage({ ...request, id: 1 } satisfies HorizonRingJob);
    } catch {
      stats.failed = true;
      finish();
    }
  } else finish();
  return {
    request,
    get pending() { return worker !== null; },
    settled: () => settledPromise,
    take() {
      if (stats.askedMs < 0) stats.askedMs = Math.round(now() - startedAt);
      const taken = pipeline;
      pipeline = null;
      if (taken) {
        stats.takenMs = Math.round(now() - startedAt);
        stats.source = kept ? 'kept' : 'worker';
      }
      return taken;
    },
    remember(built) {
      stats.source = 'inline';
      lastRing = { key, wire: copyHorizonRingWire(packHorizonRing(built).wire) };
    },
    dispose() {
      pipeline = null;
      if (worker) finish();
    },
    get stats() { return stats; },
  };
}
