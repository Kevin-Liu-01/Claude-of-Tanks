// src/world/hinterland/prefetch.ts — the Hinterland's build started with the world build (HL-3, the horizons stream,
// 2026-10-13; the ring prefetch's pattern, horizonRingPrefetch.ts): its worker runs the whole CPU pipeline while the
// battlefield's chunks, vegetation and props build on the page; the terrain build takes it last, through the hook
// (hinterlandHook.ts). Nothing waits for it: the scene object it hands the terrain fills the moment the worker answers
// (during the load in practice; in the battle's first seconds on a slow machine). The last map's answer is kept (a copy):
// a rematch on the same map takes it and skips the worker.
// (2026-11-02 audit R1) The source's life: pending (worker running) → answered | failed | disposed, then built once into
// its root. The world that built it owns it (map.ts: its dispose stops the source), so an answer that arrives after the
// world was released attaches nothing; a failure after the land's root was handed over builds the old ring in its place
// (the terrain's fallback), as a failure known before then does in the terrain build itself.
import * as THREE from 'three';
import type { HinterlandBuildContext, HinterlandSupply } from '../hinterlandHook.ts';
import { createHinterlandObjectSteps } from './install.ts';
import type { HinterlandJob, HinterlandReply, HinterlandRequest } from './worker.ts';
import { copyHinterlandWire, type HinterlandWire } from './wire.ts';
import { applyHinterlandTreeImpostors, hinterlandTreeBinding } from './trees.ts';

export type { HinterlandRequest } from './worker.ts';

interface HinterlandLoadStats {
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

interface HinterlandSource extends HinterlandSupply {
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
  let disposed = false, built = false;
  // the terrain's ring, built in the land's place when the worker fails after the root was handed over
  let fallback: HinterlandBuildContext['fallback'] | null = null;
  let resolveSettled: () => void = () => {};
  const settled = new Promise<void>((resolve) => { resolveSettled = resolve; });
  const finish = (): void => {
    stats.doneMs = Math.round(now() - t0);
    if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); worker = null; }
    resolveSettled();
  };
  /** A late failure: the ring the terrain left for it, built between tasks in 6 ms slices (never one long task). */
  const runFallback = (): void => {
    const make = fallback;
    fallback = null;
    if (!make || disposed) return;
    const steps = make();
    const slice = (): void => {
      if (disposed) { steps.return?.(undefined); return; }
      const started = now();
      while (now() - started < 6) if (steps.next().done) return;
      setTimeout(slice, 0);
    };
    slice();
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
        if (stats.failed) runFallback();
      };
      worker.onerror = (e) => { stats.failed = true; stats.message = (e as ErrorEvent)?.message ?? 'worker error'; finish(); runFallback(); };
      worker.postMessage({ ...request, id: 1 } satisfies HinterlandJob);
    } catch (error) {
      stats.failed = true; stats.message = error instanceof Error ? error.message : String(error);
      finish();
    }
  } else finish();

  return {
    request: { mapId: request.mapId, terrainVariant: request.terrainVariant },
    get pending() { return worker !== null; },
    get failed() { return stats.failed; },
    get stats() { return stats; },
    settled: () => settled,
    *buildSteps(context: HinterlandBuildContext): Generator<void, unknown, void> {
      // (audit R1) one root a source: a second build of the same supply drew an empty root (the wire is spent on the first)
      if (built) throw new Error(`the Hinterland of ${request.mapId} is built once`);
      const root = new THREE.Group();
      root.name = 'hinterland-root';
      root.matrixAutoUpdate = false;
      root.userData.hinterlandLoad = stats;
      // (260) the worker's answer in hand: the object in steps (installed later, on its answer: in one go)
      const attach = function* (): Generator<void, void, void> {
        if (!wire || disposed) return;
        const object = yield* createHinterlandObjectSteps(wire, context.engineCtx, context.ground);
        root.add(object);
        object.updateMatrixWorld(true);
        // (the world assembled first: its impostor atlas draws the near trees — trees.ts)
        const binding = hinterlandTreeBinding(root);
        if (binding) applyHinterlandTreeImpostors(object, binding);
        stats.attachedMs = Math.round(now() - t0);
        wire = null; // (the scene holds what it needs; the kept copy serves a rematch)
      };
      if (wire) { yield* attach(); yield; }
      else if (worker) {
        fallback = context.fallback ?? null;
        void settled.then(() => { for (const _ of attach()) { /* one task */ } });
      }
      built = true;
      return root;
    },
    dispose() {
      disposed = true;
      wire = null;
      fallback = null;
      if (worker) { stats.message ??= 'disposed before the worker answered'; finish(); }
    },
  };
}
