// src/world/brokenVehiclePool.ts — broken vehicle bodies built off the main thread during the world build (perf-248; the
// structure shells' pool is the model, structureShellPool.ts). A burnt civilian vehicle's or a broken cart's body is the
// one destructible pool build whose stream draws are fixed (the kits' `spending`): props.ts finalizeDestructiblePool takes
// the draws in order and posts the job here, the pools after it finalize meanwhile, and the build takes the bodies at its
// join (props.ts joinBrokenVehicles). A job whose answer has not arrived, failed, or whose worker could not start is
// built at the join on the main thread from the job (brokenVehicleBuild.ts), so the body is the same whichever made it.
//
// Workers run only in the browser's async build (createPropsAsync); `?inlineVehicles` keeps every body on the main
// thread (the A/B). The Node builds take the kits' `broken` as before, unless a receipt installs the deferred pool,
// which runs the pooled path in one thread through the wire (built and packed at take).
import type * as THREE from 'three';
import { buildBrokenVehicle } from './brokenVehicleBuild.ts';
import { packBrokenVehicleGeometry, unpackBrokenVehicleGeometry, type BrokenVehicleJob } from './brokenVehicleJob.ts';
import type { BrokenVehicleReply, BrokenVehicleRequest } from './brokenVehicleWorker.ts';

type WorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'>;

export interface BrokenVehiclePool {
  /** Post one body's job; returns its id. */
  post(job: BrokenVehicleJob): number;
  /** The job's body when its answer arrived, else null (the caller builds from `job(id)`). */
  take(id: number): THREE.BufferGeometry | null;
  /** The job as posted. */
  job(id: number): BrokenVehicleJob;
  /** Settles when every posted job has answered (or failed), or after `timeoutMs`. */
  settled(timeoutMs: number): Promise<void>;
  /** The newest job no answer has reached yet, now the caller's to build (it calls `complete` in the same task). */
  steal(): { id: number; job: BrokenVehicleJob } | null;
  /** The caller's own build of a stolen job: it stands as that job's answer. */
  complete(id: number, geometry: THREE.BufferGeometry): void;
  dispose(): void;
  readonly stats: { posted: number; answered: number; failed: number; stolen: number };
}

interface Job { job: BrokenVehicleJob; geometry: THREE.BufferGeometry | null; done: boolean }

// the bodies are few (a map's vehicle and cart roles) and about 0.1-0.2 s each: two workers keep up with the pools
const WORKER_COUNT_MAX = 2;

function createWorkerBrokenVehiclePool(
  size: number,
  makeWorker: () => WorkerPort = () => new Worker(new URL('./brokenVehicleWorker.ts', import.meta.url), {
    type: 'module', name: 'cot-broken-vehicles',
  }),
): BrokenVehiclePool {
  const jobs = new Map<number, Job>();
  const workers: WorkerPort[] = [];
  const stats = { posted: 0, answered: 0, failed: 0, stolen: 0 };
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
        worker.onmessage = ({ data }: MessageEvent<BrokenVehicleReply>) => {
          const job = jobs.get(data.id);
          if (!job || job.done) return;
          job.done = true;
          if (data.ok) {
            try { job.geometry = unpackBrokenVehicleGeometry(data.wire); stats.answered++; } catch { stats.failed++; }
          } else stats.failed++;
          wake();
        };
        // a worker that cannot run leaves every job to the build's join
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
    post(job) {
      const id = ++serial;
      jobs.set(id, { job, geometry: null, done: false });
      stats.posted++;
      const fail = (): void => {
        const entry = jobs.get(id)!;
        if (entry.done) return; // (a worker that failed to start has already failed every job, this one included)
        entry.done = true;
        stats.failed++;
        wake();
      };
      const worker = start();
      if (!worker) { fail(); return id; }
      try {
        worker.postMessage({ id, job } satisfies BrokenVehicleRequest);
      } catch {
        fail();
      }
      return id;
    },
    take(id) { return jobs.get(id)?.geometry ?? null; },
    job(id) {
      const entry = jobs.get(id);
      if (!entry) throw new Error(`broken vehicle job ${id} is unknown`);
      return entry.job;
    },
    steal() {
      for (let id = serial; id > 0; id--) {
        const entry = jobs.get(id);
        if (entry && !entry.done) return { id, job: entry.job };
      }
      return null;
    },
    complete(id, geometry) {
      const entry = jobs.get(id);
      if (!entry || entry.done) { geometry.dispose(); return; }
      // a worker's later reply for this job finds it done and is dropped (onmessage); the body is the same builder's
      entry.done = true;
      entry.geometry = geometry;
      stats.answered++;
      stats.stolen++;
      wake();
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

/** The pooled path in one thread (receipts): records at post, builds and sends each body through the wire at take. */
export function createDeferredBrokenVehiclePool(): BrokenVehiclePool {
  const jobs = new Map<number, BrokenVehicleJob>();
  const stats = { posted: 0, answered: 0, failed: 0, stolen: 0 };
  let serial = 0;
  return {
    stats,
    post(job) { const id = ++serial; jobs.set(id, job); stats.posted++; return id; },
    take(id) {
      const job = jobs.get(id);
      if (!job) return null;
      const { wire, transfer } = packBrokenVehicleGeometry(buildBrokenVehicle(job));
      stats.answered++;
      // (posted the way postMessage posts it: a structured clone, the arrays transferred)
      return unpackBrokenVehicleGeometry(structuredClone(wire, { transfer }));
    },
    job(id) { const job = jobs.get(id); if (!job) throw new Error(`broken vehicle job ${id} is unknown`); return job; },
    settled() { return Promise.resolve(); },
    steal() { return null; },
    complete(_id, geometry) { geometry.dispose(); },
    dispose() { jobs.clear(); },
  };
}

let poolFactory: (() => BrokenVehiclePool | null) | null = null;
/** Receipts: every props build from now on uses this pool (null restores the default choice). */
export function setBrokenVehiclePoolFactory(factory: (() => BrokenVehiclePool | null) | null): void {
  poolFactory = factory;
}

/** The props build's pool: a receipt's, else workers in the browser's async build, else none (the kits' `broken`). */
export function brokenVehiclePoolFor(asyncBuild: boolean): BrokenVehiclePool | null {
  if (poolFactory) return poolFactory();
  if (!asyncBuild || typeof Worker !== 'function') return null;
  if (typeof location !== 'undefined' && /[?&]inlineVehicles(?:=|&|$)/.test(location.search)) return null;
  const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : 4;
  return createWorkerBrokenVehiclePool(Math.max(1, Math.min(WORKER_COUNT_MAX, cores - 2)));
}
