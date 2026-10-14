// src/world/hinterland/prefetch.ts — the Hinterland's build started with the world build (HL-3, the horizons stream,
// 2026-10-13; the ring prefetch's pattern, horizonRingPrefetch.ts): its worker runs the whole CPU pipeline while the
// battlefield's chunks, vegetation and props build on the page; the terrain build takes it last, through the hook
// (hinterlandHook.ts). Nothing waits for it: the scene object it hands the terrain fills the moment the worker answers
// (during the load in practice; in the battle's first seconds on a slow machine). The last map's answer is kept (a copy):
// a rematch on the same map takes it and skips the worker.
import * as THREE from 'three';
import type { HinterlandBuildContext, HinterlandSupply } from '../hinterlandHook.ts';
import { createHinterlandObject } from './install.ts';
import type { HinterlandJob, HinterlandReply, HinterlandRequest } from './worker.ts';
import { copyHinterlandWire, type HinterlandWire } from './wire.ts';

export type { HinterlandRequest } from './worker.ts';

export interface HinterlandLoadStats {
  source: 'kept' | 'worker' | 'none';
  failed: boolean;
  message: string | null;
  /** The worker's own run and its answer (ms from the start), and when the land was attached. */
  workerMs: number;
  doneMs: number;
  attachedMs: number;
  /** The pipeline's stages as the worker timed them. */
  stages: HinterlandWire['ms'] | null;
}

const keyOf = (r: HinterlandRequest): string => [r.mapId, r.terrainVariant ?? '', r.fieldSeed, r.search, r.tier].join('|');
let kept: { key: string; wire: HinterlandWire } | null = null;

type Port = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror'>;

export interface HinterlandSource extends HinterlandSupply {
  readonly stats: HinterlandLoadStats;
  settled(): Promise<void>;
  dispose(): void;
}

export function startHinterlandBuild(
  request: HinterlandRequest,
  makeWorker: (() => Port) | null = typeof Worker === 'undefined' ? null
    : () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'cot-hinterland' }),
  now: () => number = () => performance.now(),
): HinterlandSource {
  const key = keyOf(request);
  const t0 = now();
  const stats: HinterlandLoadStats = { source: 'none', failed: false, message: null, workerMs: 0, doneMs: 0, attachedMs: -1, stages: null };
  let wire: HinterlandWire | null = null;
  let worker: Port | null = null;
  let resolveSettled: () => void = () => {};
  const settled = new Promise<void>((resolve) => { resolveSettled = resolve; });
  const finish = (): void => {
    stats.doneMs = Math.round(now() - t0);
    if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); worker = null; }
    resolveSettled();
  };
  if (kept && kept.key === key) {
    wire = copyHinterlandWire(kept.wire);
    stats.source = 'kept'; stats.stages = wire.ms;
    finish();
  } else if (makeWorker) {
    try {
      worker = makeWorker();
      worker.onmessage = (event: MessageEvent<HinterlandReply>) => {
        const reply = event.data;
        if (reply?.id !== 1) return;
        if (reply.ok) {
          wire = reply.wire;
          kept = { key, wire: copyHinterlandWire(reply.wire) };
          stats.source = 'worker'; stats.workerMs = reply.ms; stats.stages = reply.wire.ms;
        } else { stats.failed = true; stats.message = reply.message; }
        finish();
      };
      worker.onerror = (e) => { stats.failed = true; stats.message = (e as ErrorEvent)?.message ?? 'worker error'; finish(); };
      worker.postMessage({ ...request, id: 1 } satisfies HinterlandJob);
    } catch (error) {
      stats.failed = true; stats.message = error instanceof Error ? error.message : String(error);
      finish();
    }
  } else finish();

  return {
    request: { mapId: request.mapId, terrainVariant: request.terrainVariant },
    get pending() { return worker !== null; },
    get stats() { return stats; },
    settled: () => settled,
    *buildSteps(context: HinterlandBuildContext): Generator<void, unknown, void> {
      const root = new THREE.Group();
      root.name = 'hinterland-root';
      root.matrixAutoUpdate = false;
      root.userData.hinterlandLoad = stats;
      const attach = (): void => {
        if (!wire) return;
        const object = createHinterlandObject(wire, context.engineCtx);
        root.add(object);
        object.updateMatrixWorld(true);
        stats.attachedMs = Math.round(now() - t0);
        wire = null; // (the scene holds what it needs; the kept copy serves a rematch)
      };
      if (wire) { attach(); yield; }
      else void settled.then(attach);
      return root;
    },
    dispose() { if (worker) finish(); },
  };
}

/** Forget the kept answer (a receipt's fresh start). */
export function forgetHinterland(): void {
  kept = null;
}
