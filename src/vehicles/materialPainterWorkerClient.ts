import type { RuntimeValue } from '../runtimeTypes.ts';
import {
  isMaterialPainterRequest, readMaterialPainterReply,
  type MaterialPainterMessage, type MaterialPainterRequest, type MaterialPainterResult,
} from './materialPainterProtocol.ts';

export type { MaterialPainterRequest, MaterialPainterResult } from './materialPainterProtocol.ts';

export interface MaterialPainterWorkerPort {
  onmessage: ((event: { data: RuntimeValue }) => void) | null;
  onerror: (() => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(message: MaterialPainterMessage): void;
  terminate(): void;
}
export interface MaterialPainterClientPorts {
  createWorker(): MaterialPainterWorkerPort | null;
  schedule(callback: () => void, delayMs: number): () => void;
  clone(request: MaterialPainterRequest): MaterialPainterRequest;
  fontUrl: string;
}
interface PendingPaint {
  requestId: number;
  request: MaterialPainterRequest;
  resolve(value: MaterialPainterResult | null): void;
  cancelTimer(): void;
}
export interface MaterialPainterClient {
  paint(request: MaterialPainterRequest): Promise<MaterialPainterResult | null>;
  dispose(): void;
  available(): boolean;
}

/** One serial private worker; one consumer never cancels another shared bake. */
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
  let unavailable = false;
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
  function fail(): void {
    unavailable = true;
    closeWorker();
    const current = active; active = null;
    if (current) settle(current, null);
    for (const job of queue.splice(0)) settle(job, null);
  }
  function receive(owned: MaterialPainterWorkerPort, data: RuntimeValue): void {
    if (worker !== owned || !active) return;
    const result = readMaterialPainterReply(data, active.requestId, active.request);
    if (!result) { fail(); return; }
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
    if (active || unavailable) return;
    try {
      if (!queue.length) {
        const revision = ++idleRevision, owned = worker;
        cancelIdle = ports.schedule(() => {
          if (revision === idleRevision && owned === worker && !active) closeWorker();
        }, idleMs);
        return;
      }
      const owned = acquire();
      if (!owned) { fail(); return; }
      active = queue.shift()!;
      owned.postMessage({ requestId: active.requestId, request: active.request, fontUrl: ports.fontUrl });
    } catch { fail(); }
  }
  function paint(request: MaterialPainterRequest): Promise<MaterialPainterResult | null> {
    if (unavailable || queue.length + Number(!!active) >= maxPending) return Promise.resolve(null);
    let snapshot: MaterialPainterRequest;
    try {
      snapshot = ports.clone(request);
      if (!isMaterialPainterRequest(snapshot)) return Promise.resolve(null);
    } catch { return Promise.resolve(null); }
    idleRevision++; cancelIdle?.(); cancelIdle = null;
    return new Promise(resolve => {
      const job: PendingPaint = { requestId: nextId++, request: snapshot, resolve, cancelTimer: () => {} };
      // Deadline includes time queued, so no caller waits indefinitely behind another bake.
      try { job.cancelTimer = ports.schedule(fail, timeoutMs); }
      catch { resolve(null); fail(); return; }
      queue.push(job); advance();
    });
  }
  return { paint, dispose: fail, available: () => !unavailable };
}

let sharedClient: MaterialPainterClient | null = null;

export function canPaintMaterialBaseInWorker(): boolean {
  return typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
    && typeof FontFace === 'function' && typeof Path2D === 'function' && typeof DOMMatrix === 'function'
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
        fontUrl: new URL(`${import.meta.env?.BASE_URL ?? '/'}fonts/abc-monument-grotesk/ABCMonumentGrotesk-Bold.woff2`, document.baseURI).href,
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
