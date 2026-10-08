/**
 * The surface paint prefetch (2026-10-07, the time-to-battle lane; the owner: "going into games takes a long time").
 *
 * The props build paints some of its prints from fixed inputs — the straw's (hayPrint.ts) and the dry-stone walls'
 * (fieldStoneSurface.ts): a size, a seed and a lithology, nothing of the map's ground — on the main thread, after the
 * terrain and the vegetation. The world build starts them here instead, in a worker (surfacePaintWorker.ts), when it
 * starts; the props build takes a print by its exact arguments when it reaches it (the same painter and the same
 * arguments: the same texels) and paints anything the prefetch does not hold where it stands, as before.
 */
import type { FieldStoneLithology } from './fieldStoneSurface.ts';
import type { SurfacePaintJob, SurfacePaintReply } from './surfacePaintWorker.ts';

/** A print by its exact arguments (the key the props build asks with). */
export function surfacePaintKey(kind: 'hay' | 'fieldStone', size: number, seed: number, lithology?: FieldStoneLithology): string {
  return kind === 'hay' ? `hay|${size}|${seed}` : `fieldStone|${size}|${seed}|${lithology ?? 'fieldstone'}`;
}

export type SurfacePaintRequest = Omit<SurfacePaintJob, 'id'>;

type PaintWorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror'>;

export interface SurfacePaintPrefetch {
  /** The print painted ahead for these exact arguments, or null (paint it where it stands). */
  take(key: string): Promise<Record<string, unknown>> | null;
  dispose(): void;
  readonly stats: { planned: number; taken: number; missed: number; failed: number; doneMs: number };
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
  const stats = { planned: 0, taken: 0, missed: 0, failed: 0, doneMs: 0 };
  const waiting = new Map<number, { resolve: (b: Record<string, unknown>) => void; reject: (e: Error) => void }>();
  const byKey = new Map<string, Promise<Record<string, unknown>>>();
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
    if (reply.ok) entry.resolve(reply.buffers);
    else { stats.failed++; entry.reject(new Error(reply.message)); }
  };
  worker.onerror = (event) => { stats.failed += waiting.size; failAll((event as ErrorEvent).message || 'Surface paint worker failed'); };
  let id = 0;
  for (const request of requests) {
    const key = surfacePaintKey(request.kind, request.size, request.seed, request.lithology);
    if (byKey.has(key)) continue;
    const jobId = ++id;
    const promise = new Promise<Record<string, unknown>>((resolve, reject) => { waiting.set(jobId, { resolve, reject }); });
    promise.catch(() => {});
    byKey.set(key, promise);
    stats.planned++;
    worker.postMessage({ ...request, id: jobId } satisfies SurfacePaintJob);
  }
  return {
    take(key) {
      const job = byKey.get(key);
      if (!job) { stats.missed++; return null; }
      byKey.delete(key);
      stats.taken++;
      return job;
    },
    dispose() {
      byKey.clear();
      failAll('Surface paint prefetch disposed');
      if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); worker = null; }
    },
    get stats() { return stats; },
  };
}
