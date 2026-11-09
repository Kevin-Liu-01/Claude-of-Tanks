import type { RuntimeValue } from '../runtimeTypes.ts';
import { createWorkerClientHealth } from '../workerClientHealth.ts';
import {
  isMaterialPainterRequest, readMaterialPainterReply,
  type MaterialPainterMessage, type MaterialPainterRequest, type MaterialPainterResult,
} from './materialPainterProtocol.ts';

export type { MaterialPainterRequest, MaterialPainterResult } from './materialPainterProtocol.ts';

interface MaterialPainterWorkerPort {
  onmessage: ((event: { data: RuntimeValue }) => void) | null;
  onerror: (() => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(message: MaterialPainterMessage): void;
  terminate(): void;
}
interface MaterialPainterClientPorts {
  createWorker(): MaterialPainterWorkerPort | null;
  schedule(callback: () => void, delayMs: number): () => void;
  clone(request: MaterialPainterRequest): MaterialPainterRequest;
}
interface PendingPaint {
  requestId: number;
  request: MaterialPainterRequest;
  resolve(value: MaterialPainterResult | null): void;
  cancelTimer(): void;
}
interface MaterialPainterClient {
  paint(request: MaterialPainterRequest): Promise<MaterialPainterResult | null>;
  dispose(): void;
  available(): boolean;
}

/** One serial private worker; one consumer never cancels another shared bake. (2026-11-02 audit R6) The worker-client
 *  pattern (src/workerClientHealth.ts): a job's deadline runs from its dispatch, never its queueing (with 16 queued, or
 *  a laptop that slept mid-bake, the old absolute deadline tripped on a healthy worker); a failure closes the worker and
 *  settles what it held with the main-thread fallback, and the next bake starts a fresh worker (glacis-269: no font
 *  to load); three in a row leave the client unavailable. Before, one failure turned it off for the session. */
export function createMaterialPainterClient(
  ports: MaterialPainterClientPorts,
  options: { timeoutMs?: number; idleMs?: number; maxPending?: number } = {},
): MaterialPainterClient {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const idleMs = options.idleMs ?? 5_000;
  const maxPending = options.maxPending ?? 16;
  const queue: PendingPaint[] = [];
  let worker: MaterialPainterWorkerPort | null = null;
  let active: PendingPaint | null = null;
  let cancelIdle: (() => void) | null = null;
  let idleRevision = 0;
  const health = createWorkerClientHealth();
  let nextId = 1;

  function closeWorker(): void {
    idleRevision++;
    cancelIdle?.(); cancelIdle = null;
    const owned = worker; worker = null;
    if (!owned) return;
    owned.onmessage = owned.onerror = owned.onmessageerror = null;
    try { owned.terminate(); } catch { /* already lost; private ownership released */ }
  }
  function settle(job: PendingPaint, result: MaterialPainterResult | null): void {
    job.cancelTimer(); job.resolve(result);
  }
  function drain(): void {
    closeWorker();
    const current = active; active = null;
    if (current) settle(current, null);
    for (const job of queue.splice(0)) settle(job, null);
  }
  /** The worker failed: what it held takes the fallback; the next bake starts a fresh worker, unless that was the last. */
  function fail(): void {
    health.failed();
    drain();
  }
  function dispose(): void {
    health.close();
    drain();
  }
  function receive(owned: MaterialPainterWorkerPort, data: RuntimeValue): void {
    if (worker !== owned || !active) return;
    const result = readMaterialPainterReply(data, active.requestId, active.request);
    if (!result) { fail(); return; }
    health.succeeded();
    const current = active; active = null;
    settle(current, result);
    advance();
  }
  function acquire(): MaterialPainterWorkerPort | null {
    if (worker) return worker;
    const owned = ports.createWorker();
    if (!owned) return null;
    worker = owned;
    owned.onmessage = event => receive(owned, event.data);
    owned.onerror = owned.onmessageerror = () => { if (worker === owned) fail(); };
    return owned;
  }
  function advance(): void {
    if (active || health.state === 'unavailable') return;
    try {
      if (!queue.length) {
        const revision = ++idleRevision, owned = worker;
        cancelIdle = ports.schedule(() => {
          if (revision === idleRevision && owned === worker && !active) closeWorker();
        }, idleMs);
        return;
      }
      const owned = acquire();
      if (!owned) { dispose(); return; }
      const job = active = queue.shift()!;
      // the deadline runs from the job's dispatch (its turn at the serial worker), not from its request
      job.cancelTimer = ports.schedule(() => { if (active === job) fail(); }, timeoutMs);
      owned.postMessage({ requestId: job.requestId, request: job.request });
    } catch { fail(); }
  }
  function paint(request: MaterialPainterRequest): Promise<MaterialPainterResult | null> {
    if (health.state === 'unavailable' || queue.length + Number(!!active) >= maxPending) return Promise.resolve(null);
    let snapshot: MaterialPainterRequest;
    try {
      snapshot = ports.clone(request);
      if (!isMaterialPainterRequest(snapshot)) return Promise.resolve(null);
    } catch { return Promise.resolve(null); }
    idleRevision++; cancelIdle?.(); cancelIdle = null;
    return new Promise(resolve => {
      const job: PendingPaint = { requestId: nextId++, request: snapshot, resolve, cancelTimer: () => {} };
      // no caller waits indefinitely: the queue is bounded (maxPending) and every job's turn has its own deadline
      queue.push(job); advance();
    });
  }
  return { paint, dispose, available: () => health.state === 'available' };
}

let sharedClient: MaterialPainterClient | null = null;

export function canPaintMaterialBaseInWorker(): boolean {
  return typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
    && typeof Path2D === 'function' && typeof DOMMatrix === 'function'
    && typeof document !== 'undefined' && typeof structuredClone === 'function'
    && (!sharedClient || sharedClient.available());
}
function browserWorker(): MaterialPainterWorkerPort {
  const native = new Worker(new URL('./materialPainterWorker.ts', import.meta.url), { type: 'module' });
  const port: MaterialPainterWorkerPort = {
    onmessage: null, onerror: null, onmessageerror: null,
    postMessage: message => native.postMessage(message),
    terminate: () => {
      native.onmessage = native.onerror = native.onmessageerror = null;
      native.terminate();
    },
  };
  native.onmessage = event => port.onmessage?.({ data: event.data });
  native.onerror = () => port.onerror?.();
  native.onmessageerror = () => port.onmessageerror?.();
  return port;
}
export function tryPaintMaterialBase(request: MaterialPainterRequest): Promise<MaterialPainterResult | null> {
  let owner = sharedClient;
  try {
    if (!canPaintMaterialBaseInWorker()) return Promise.resolve(null);
    if (!sharedClient) {
      sharedClient = createMaterialPainterClient({
        createWorker: browserWorker,
        clone: value => structuredClone(value),
        schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
      });
    }
    owner = sharedClient;
    return owner.paint(request).catch(() => { owner?.dispose(); return null; });
  } catch {
    // Settle the same owner, not a replacement singleton; no queued job is orphaned.
    owner?.dispose();
    return Promise.resolve(null);
  }
}
/** Explicit application teardown; normal idle shutdown automatically permits a later fresh worker. */
export function disposeMaterialPainterWorker(): void {
  sharedClient?.dispose(); sharedClient = null;
}
