// src/world/structureShellPool.ts — structure shell bands derived off the main thread during the world build
// (2026-10-13, the perf stream: Plan W; the Plan A reader audit showed every structure's shells are read inside the
// loading window, so they cannot be deferred, only moved). The props build keeps each structure's collection and contact
// band inline and posts its geometry (structureShellWire.ts) here when it places it; the shells (84 % of the derivation
// on Urban) are derived by the same function (structureCollision.ts deriveRuntimeStructureShellBands) in a few module
// workers while the build goes on, and the build takes them at its join (props.ts joinStructureShells). A structure whose
// answer has not arrived by then, failed, or whose worker could not start is derived at the join on the main thread from
// the wire the pool kept, so the records are the same whichever path made them.
//
// Workers run only in the browser's async build (createPropsAsync). The Node builds (the collision manifests, the hosts'
// fixtures) derive inline, unless a receipt installs the deferred pool, which runs the same pooled code path in one
// thread: it packs at post and derives from the wire at take.
import type { StructureCollisionRuntimeBand } from './structureCollision.ts';
import { packStructureShellWire, type StructureShellWire } from './structureShellWire.ts';
import type { StructureShellReply, StructureShellRequest } from './structureShellWorker.ts';

type GeometryBuckets = Parameters<typeof packStructureShellWire>[0];
type WorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'>;

export interface StructureShellPool {
  /** Post one structure's geometry (copied now, before its placement transform); returns the job. */
  post(buckets: GeometryBuckets): number;
  /** The job's bands when its answer arrived, else null (the caller derives from `wire(job)`). */
  take(job: number): StructureCollisionRuntimeBand[] | null;
  /** The job's geometry as posted. */
  wire(job: number): StructureShellWire;
  /** Settles when every posted job has answered (or failed), or after `timeoutMs`. */
  settled(timeoutMs: number): Promise<void>;
  dispose(): void;
  readonly stats: { posted: number; answered: number; failed: number; packMs: number };
}

interface Job { wire: StructureShellWire; bands: StructureCollisionRuntimeBand[] | null; done: boolean }

const WORKER_COUNT_MAX = 4;

function createWorkerStructureShellPool(
  size: number,
  makeWorker: () => WorkerPort = () => new Worker(new URL('./structureShellWorker.ts', import.meta.url), {
    type: 'module', name: 'cot-structure-shells',
  }),
): StructureShellPool {
  const jobs = new Map<number, Job>();
  const workers: WorkerPort[] = [];
  const stats = { posted: 0, answered: 0, failed: 0, packMs: 0 };
  let serial = 0, cursor = 0, dead = false;
  const waiters: Array<() => void> = [];
  const wake = (): void => {
    if (stats.answered + stats.failed < stats.posted) return;
    for (const resolve of waiters.splice(0)) resolve();
  };
  const failAll = (): void => {
    dead = true;
    for (const job of jobs.values()) if (!job.done) { job.done = true; stats.failed++; }
    for (const worker of workers.splice(0)) { worker.onmessage = worker.onerror = worker.onmessageerror = null; worker.terminate(); }
    wake();
  };
  const start = (): WorkerPort | null => {
    if (dead) return null;
    if (workers.length < size) {
      try {
        const worker = makeWorker();
        worker.onmessage = ({ data }: MessageEvent<StructureShellReply>) => {
          const job = jobs.get(data.id);
          if (!job || job.done) return;
          job.done = true;
          if (data.ok) { job.bands = data.bands; stats.answered++; } else stats.failed++;
          wake();
        };
        // a worker that cannot run leaves every job to the main thread's join
        worker.onerror = () => failAll();
        worker.onmessageerror = () => failAll();
        workers.push(worker);
      } catch {
        failAll();
        return null;
      }
    }
    return workers[cursor++ % workers.length] ?? null;
  };
  return {
    stats,
    post(buckets) {
      const startedAt = performance.now();
      const { wire } = packStructureShellWire(buckets);
      stats.packMs += performance.now() - startedAt;
      const id = ++serial;
      jobs.set(id, { wire, bands: null, done: false });
      stats.posted++;
      const worker = start();
      if (!worker) { jobs.get(id)!.done = true; stats.failed++; return id; }
      try {
        // cloned, not transferred: the pool keeps the wire for the main thread's fallback until the join
        worker.postMessage({ id, wire } satisfies StructureShellRequest);
      } catch {
        jobs.get(id)!.done = true;
        stats.failed++;
      }
      return id;
    },
    take(job) { return jobs.get(job)?.bands ?? null; },
    wire(job) {
      const entry = jobs.get(job);
      if (!entry) throw new Error(`structure shell job ${job} is unknown`);
      return entry.wire;
    },
    settled(timeoutMs) {
      if (stats.answered + stats.failed >= stats.posted) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, timeoutMs);
        waiters.push(() => { clearTimeout(timer); resolve(); });
      });
    },
    dispose() {
      dead = true;
      for (const worker of workers.splice(0)) { worker.onmessage = worker.onerror = worker.onmessageerror = null; worker.terminate(); }
      jobs.clear();
      wake();
    },
  };
}

/** The pooled path in one thread (receipts): packs at post, answers nothing, so every take derives from the wire. */
export function createDeferredStructureShellPool(): StructureShellPool {
  const jobs = new Map<number, StructureShellWire>();
  const stats = { posted: 0, answered: 0, failed: 0, packMs: 0 };
  let serial = 0;
  return {
    stats,
    post(buckets) { const id = ++serial; jobs.set(id, packStructureShellWire(buckets).wire); stats.posted++; return id; },
    take() { return null; },
    wire(job) { const wire = jobs.get(job); if (!wire) throw new Error(`structure shell job ${job} is unknown`); return wire; },
    settled() { return Promise.resolve(); },
    dispose() { jobs.clear(); },
  };
}

let poolFactory: (() => StructureShellPool | null) | null = null;
/** Receipts: every props build from now on uses this pool (null restores the default choice). */
export function setStructureShellPoolFactory(factory: (() => StructureShellPool | null) | null): void {
  poolFactory = factory;
}

/** The props build's pool: a receipt's, else workers in the browser's async build, else none (inline). */
export function structureShellPoolFor(asyncBuild: boolean): StructureShellPool | null {
  if (poolFactory) return poolFactory();
  if (!asyncBuild || typeof Worker !== 'function') return null;
  if (typeof location !== 'undefined' && /[?&]inlineShells(?:=|&|$)/.test(location.search)) return null;
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : 4;
  return createWorkerStructureShellPool(Math.max(1, Math.min(WORKER_COUNT_MAX, cores - 2)));
}
