/**
 * The surface paint prefetch (2026-10-07, the time-to-battle lane; the owner: "going into games takes a long time").
 *
 * The props build paints some of its prints from fixed inputs — the straw's (hayPrint.ts) and the dry-stone walls'
 * (fieldStoneSurface.ts): a size, a seed and a lithology, nothing of the map's ground — on the main thread, after the
 * terrain and the vegetation. The world build starts them here instead, in a worker (surfacePaintWorker.ts), when it
 * starts; the props build takes a print by its exact arguments when it reaches it (the same painter and the same
 * arguments: the same texels) and paints anything the prefetch does not hold where it stands, as before.
 *
 * (2026-10-08) The tiles the props build paints from its own noise — the boulders' rock tile and the building kit's
 * detail tiles — go the same way: the build registers its noise with its seed (registerPaintNoise) and a painter whose
 * tile the worker has finished takes it synchronously (settledPaint) instead of painting; a tile not yet back, or a
 * noise nobody registered (every receipt, every other caller), is painted where it stands.
 */
import type { SurfacePaintJob, SurfacePaintReply, SurfacePaintRequest } from './surfacePaintWorker.ts';
import { createWorkerCalls, type WorkerCallPort, type WorkerCallTimers } from '../workerCalls.ts';

export type { SurfacePaintRequest } from './surfacePaintWorker.ts';

/** A print by its exact arguments (the key the props build asks with). */
export function surfacePaintKey(request: SurfacePaintRequest): string {
  switch (request.kind) {
    case 'hay': return `hay|${request.size}|${request.seed}`;
    case 'fieldStone': return `fieldStone|${request.size}|${request.seed}|${request.lithology ?? 'fieldstone'}`;
    case 'fieldMud': return `fieldMud|${request.size}|${request.seed}`;
    case 'limeRender': case 'limewash': return `${request.kind}|${request.size}|${request.seed}`;
    case 'rockDetail': return `rockDetail|${request.lithology}|${request.noiseSeed}`;
    case 'structureDetail': return `structureDetail|${request.detail}|${request.noiseSeed}`;
    default: throw new Error(`Unknown surface paint ${(request as { kind?: string }).kind}`);
  }
}

type PaintWorkerPort = WorkerCallPort;

/** (improve-271) How long the worker may stay silent while it holds a print (ms): the page's single-job workers' 15 s
 *  (materialPainterWorkerClient.ts). Past it, or on an error, every print it holds fails and is painted where it is
 *  taken (props.ts awaits a taken print with no deadline of its own), and nothing more is posted to it. */
const SURFACE_PAINT_SILENCE_MS = 15_000;

export interface SurfacePaintPrefetch {
  /** The print painted ahead for these exact arguments, or null (paint it where it stands). */
  take(key: string): Promise<Record<string, unknown>> | null;
  /** (battle-spikes-253) More prints for the same worker, planned later (a map's kit render prints, once its kits load). */
  add(requests: readonly SurfacePaintRequest[]): void;
  dispose(): void;
  readonly stats: { planned: number; taken: number; missed: number; failed: number; doneMs: number; settledTaken: number };
}

// ------------------------------------------------------------------------------------------------ settled prints

/** Prints back from a worker, not yet taken, by key (a print is a function of its key: any build may take it). */
const settledPrints = new Map<string, { buffers: Record<string, unknown>; owner: object }>();
/** A props build's noise and the seed it was made from (props.ts: new SimplexNoise({ random: mulberry32(seed) })). */
const paintNoiseSeeds = new WeakMap<object, number>();

/** The props build: this noise is the one made from `seed` (its tiles may be taken from the worker). */
export function registerPaintNoise(noise: object, seed: number): void {
  paintNoiseSeeds.set(noise, seed);
}

/**
 * A tile the worker has already painted for this noise (by its seed) and these arguments, taken once; null when the
 * noise is not a registered build's, or the tile is not back (the caller paints it where it stands).
 */
export function settledPaint(noise: object, keyOf: (noiseSeed: number) => string): Record<string, unknown> | null {
  const seed = paintNoiseSeeds.get(noise);
  if (seed === undefined) return null;
  const key = keyOf(seed);
  const hit = settledPrints.get(key);
  if (!hit) return null;
  settledPrints.delete(key);
  (hit.owner as { onSettledTaken?: (key: string) => void }).onSettledTaken?.(key);
  return hit.buffers;
}

export function startSurfacePaints(
  requests: readonly SurfacePaintRequest[],
  makeWorker: () => PaintWorkerPort = () => new Worker(new URL('./surfacePaintWorker.ts', import.meta.url), {
    type: 'module', name: 'cot-surface-paint',
  }),
  now: () => number = () => performance.now(),
  timers?: WorkerCallTimers,
): SurfacePaintPrefetch | null {
  if (!requests.length) return null;
  const startedAt = now();
  const stats = { planned: 0, taken: 0, missed: 0, failed: 0, doneMs: 0, settledTaken: 0 };
  const byKey = new Map<string, Promise<Record<string, unknown>>>();
  // a print taken synchronously is this prefetch's no more: neither an asynchronous take nor disposal sees it
  const owner = { onSettledTaken: (key: string) => { stats.settledTaken++; byKey.delete(key); } };
  let disposed = false;
  const calls = createWorkerCalls<SurfacePaintReply>({
    name: 'Surface paint worker',
    spawn: makeWorker,
    idOf: (reply) => reply?.id,
    silenceMs: SURFACE_PAINT_SILENCE_MS,
    timers,
  });
  calls.warm();
  let id = 0;
  const post = (more: readonly SurfacePaintRequest[]): void => {
    for (const request of more) {
      const key = surfacePaintKey(request);
      if (!calls.available || byKey.has(key)) continue;
      const jobId = ++id;
      let resolve: (b: Record<string, unknown>) => void = () => {}, reject: (e: Error) => void = () => {};
      const promise = new Promise<Record<string, unknown>>((res, rej) => { resolve = res; reject = rej; });
      promise.catch(() => {});
      byKey.set(key, promise);
      const posted = calls.post(jobId, { ...request, id: jobId } as SurfacePaintJob, undefined, {
        reply: (reply) => {
          stats.doneMs = Math.round(now() - startedAt);
          if (reply.ok) {
            // a print nobody has asked for yet is also a settled one a painter may take synchronously; the first taker wins
            if (byKey.has(key)) settledPrints.set(key, { buffers: reply.buffers, owner });
            resolve(reply.buffers);
          } else { stats.failed++; reject(new Error(reply.message)); }
          return true;
        },
        fail: (error) => { if (!disposed) stats.failed++; reject(error); },
      });
      if (!posted) { byKey.delete(key); continue; }
      stats.planned++;
    }
  };
  post(requests);
  return {
    add(more) { post(more); },
    take(key) {
      const job = byKey.get(key);
      if (!job) { stats.missed++; return null; }
      byKey.delete(key);
      // (taken the asynchronous way: no longer a settled print for a synchronous taker)
      if (settledPrints.get(key)?.owner === owner) settledPrints.delete(key);
      stats.taken++;
      return job;
    },
    dispose() {
      for (const key of byKey.keys()) if (settledPrints.get(key)?.owner === owner) settledPrints.delete(key);
      byKey.clear();
      disposed = true;
      calls.dispose(new Error('Surface paint prefetch disposed'));
    },
    get stats() { return stats; },
  };
}
