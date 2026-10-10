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

export type { SurfacePaintRequest } from './surfacePaintWorker.ts';

/** A print by its exact arguments (the key the props build asks with). */
export function surfacePaintKey(request: SurfacePaintRequest): string {
  switch (request.kind) {
    case 'hay': return `hay|${request.size}|${request.seed}`;
    case 'fieldStone': return `fieldStone|${request.size}|${request.seed}|${request.lithology ?? 'fieldstone'}`;
    case 'rockDetail': return `rockDetail|${request.lithology}|${request.noiseSeed}`;
    case 'structureDetail': return `structureDetail|${request.detail}|${request.noiseSeed}`;
    default: throw new Error(`Unknown surface paint ${(request as { kind?: string }).kind}`);
  }
}

type PaintWorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror'>;

export interface SurfacePaintPrefetch {
  /** The print painted ahead for these exact arguments, or null (paint it where it stands). */
  take(key: string): Promise<Record<string, unknown>> | null;
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
): SurfacePaintPrefetch | null {
  if (!requests.length) return null;
  const startedAt = now();
  const stats = { planned: 0, taken: 0, missed: 0, failed: 0, doneMs: 0, settledTaken: 0 };
  const waiting = new Map<number, { key: string; resolve: (b: Record<string, unknown>) => void; reject: (e: Error) => void }>();
  const byKey = new Map<string, Promise<Record<string, unknown>>>();
  // a print taken synchronously is this prefetch's no more: neither an asynchronous take nor disposal sees it
  const owner = { onSettledTaken: (key: string) => { stats.settledTaken++; byKey.delete(key); } };
  let worker: PaintWorkerPort | null = makeWorker();
  const failAll = (message: string): void => {
    for (const w of waiting.values()) w.reject(new Error(message));
    waiting.clear();
  };
  worker.onmessage = (event: MessageEvent<SurfacePaintReply>) => {
    const reply = event.data, entry = waiting.get(reply?.id);
    if (!entry) return;
    waiting.delete(reply.id);
    stats.doneMs = Math.round(now() - startedAt);
    if (reply.ok) {
      // a print nobody has asked for yet is also a settled one a painter may take synchronously; the first taker wins
      if (byKey.has(entry.key)) settledPrints.set(entry.key, { buffers: reply.buffers, owner });
      entry.resolve(reply.buffers);
    } else { stats.failed++; entry.reject(new Error(reply.message)); }
  };
  worker.onerror = (event) => { stats.failed += waiting.size; failAll((event as ErrorEvent).message || 'Surface paint worker failed'); };
  let id = 0;
  for (const request of requests) {
    const key = surfacePaintKey(request);
    if (byKey.has(key)) continue;
    const jobId = ++id;
    const promise = new Promise<Record<string, unknown>>((resolve, reject) => { waiting.set(jobId, { key, resolve, reject }); });
    promise.catch(() => {});
    byKey.set(key, promise);
    stats.planned++;
    worker.postMessage({ ...request, id: jobId } as SurfacePaintJob);
  }
  return {
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
      failAll('Surface paint prefetch disposed');
      if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); worker = null; }
    },
    get stats() { return stats; },
  };
}
