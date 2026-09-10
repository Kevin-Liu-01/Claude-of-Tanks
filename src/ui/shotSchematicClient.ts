import type { RuntimeValue } from '../runtimeTypes.ts';
import { createOpaqueLoadingYielder } from '../engine/frameScheduler.ts';
import { bakeSchematicSteps, validSchematicSize, type SchematicRequest } from './shotSchematic.ts';
import type { SchematicMessage, SchematicReply } from './shotSchematicWorker.ts';

export interface SchematicWorkerPort {
  onmessage: ((event: { data: RuntimeValue }) => void) | null;
  onerror: (() => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(message: SchematicMessage): void;
  terminate(): void;
}
export interface SchematicClientPorts {
  worker(): SchematicWorkerPort | null;
  fallback(request: SchematicRequest, signal: AbortSignal): Promise<Blob | null>;
  dataUrl(blob: Blob, signal: AbortSignal): Promise<string | null>;
  schedule(callback: () => void, delayMs: number): () => void;
}
interface Job extends SchematicMessage {
  key: string;
  resolve(value: string | null): void;
}

function requestMatches(value: RuntimeValue, request: SchematicRequest): boolean {
  return !!value && typeof value === 'object'
    && 'url' in value && value.url === request.url
    && 'width' in value && value.width === request.width
    && 'height' in value && value.height === request.height;
}
function readReply(data: RuntimeValue, job: Job): Blob | null {
  if (!data || typeof data !== 'object' || !('id' in data) || data.id !== job.id
    || !('request' in data) || !requestMatches(data.request, job.request) || !('blob' in data)) return null;
  return data.blob instanceof Blob && data.blob.type === 'image/png' && data.blob.size > 0 ? data.blob : null;
}

/** Native callbacks may never return after a device failure; abort still settles. */
function withAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const cancel = (): void => { signal.removeEventListener('abort', cancel); resolve(null); };
    signal.addEventListener('abort', cancel, { once: true });
    pending.then(value => { signal.removeEventListener('abort', cancel); resolve(signal.aborted ? null : value); },
      error => { signal.removeEventListener('abort', cancel); reject(error); });
    if (signal.aborted) cancel();
  });
}

/** One decode/paint/encode transaction at a time; no queue-wait timeout. */
export function createSchematicClient(
  ports: SchematicClientPorts,
  options: { timeoutMs?: number; idleMs?: number; maxPending?: number } = {},
) {
  const cache = new Map<string, Promise<string | null>>();
  const queue: Job[] = [];
  let active: Job | null = null;
  let abort: AbortController | null = null;
  let worker: SchematicWorkerPort | null = null;
  let reply: ((value: Blob | null) => void) | null = null;
  let cancelIdle: (() => void) | null = null;
  let workerFailed = false, disposed = false, nextId = 1;
  const timeoutMs = options.timeoutMs ?? 15_000;

  function closeWorker(): void {
    cancelIdle?.(); cancelIdle = null;
    const owned = worker; worker = null;
    if (!owned) return;
    owned.onmessage = owned.onerror = owned.onmessageerror = null;
    try { owned.terminate(); } catch { /* already lost */ }
  }
  function failWorker(): void {
    workerFailed = true;
    closeWorker();
    const settle = reply; reply = null; settle?.(null);
  }
  function receive(owned: SchematicWorkerPort, data: RuntimeValue): void {
    if (worker !== owned || !active || !reply) return;
    if (data && typeof data === 'object' && 'id' in data && typeof data.id === 'number' && data.id < active.id) return;
    const blob = readReply(data, active);
    if (!blob) { failWorker(); return; }
    const settle = reply; reply = null; settle(blob);
  }
  function paintWorker(job: Job): Promise<Blob | null> {
    if (workerFailed) return Promise.resolve(null);
    return new Promise(resolve => {
      reply = resolve;
      try {
        if (!worker) {
          const owned = ports.worker();
          if (!owned) { failWorker(); return; }
          worker = owned;
          owned.onmessage = event => receive(owned, event.data);
          owned.onerror = owned.onmessageerror = () => { if (worker === owned) failWorker(); };
        }
        worker.postMessage({ id: job.id, request: job.request });
      } catch { failWorker(); }
    });
  }
  async function run(job: Job, owner: AbortController): Promise<string | null> {
    // A worker timeout terminates only this worker transaction; the same job
    // may still succeed via the cooperative DOM path with its own deadline.
    const cancelWorker = ports.schedule(() => { if (active === job && reply) failWorker(); }, timeoutMs);
    let blob: Blob | null;
    try { blob = await paintWorker(job); }
    finally { cancelWorker(); }
    if (owner.signal.aborted) return null;
    const cancelFallback = ports.schedule(() => owner.abort(), timeoutMs);
    try {
      if (!blob) blob = await withAbort(ports.fallback(job.request, owner.signal), owner.signal);
      if (!blob || owner.signal.aborted) return null;
      return await withAbort(ports.dataUrl(blob, owner.signal), owner.signal);
    } finally { cancelFallback(); }
  }
  function advance(): void {
    if (disposed || active) return;
    const job = queue.shift();
    if (!job) {
      const owned = worker;
      try {
        cancelIdle = ports.schedule(() => {
          if (!active && !queue.length && worker === owned) { closeWorker(); workerFailed = false; }
        }, options.idleMs ?? 5000);
      } catch { closeWorker(); }
      return;
    }
    active = job;
    const owner = new AbortController(); abort = owner;
    void run(job, owner).catch(() => null).then(result => {
      if (active !== job) return;
      active = null; abort = null;
      if (!result) cache.delete(job.key);
      job.resolve(result);
      advance();
    });
  }
  function get(key: string, request: SchematicRequest): Promise<string | null> {
    if (disposed) return Promise.resolve(null);
    const cached = cache.get(key);
    if (cached) return cached;
    if (!validSchematicSize(request.width, request.height)
      || queue.length + Number(!!active) >= (options.maxPending ?? 64)) return Promise.resolve(null);
    cancelIdle?.(); cancelIdle = null;
    let resolve!: (value: string | null) => void;
    const pending = new Promise<string | null>(settle => { resolve = settle; });
    cache.set(key, pending);
    queue.push({ id: nextId++, key, request: { ...request }, resolve });
    advance();
    return pending;
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    abort?.abort(); abort = null;
    failWorker();
    active?.resolve(null); active = null;
    for (const job of queue.splice(0)) job.resolve(null);
    cache.clear();
  }
  return { get, dispose };
}

function abortError(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('Schematic preparation cancelled');
}
function loadImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = (): void => { image.onload = image.onerror = null; signal.removeEventListener('abort', cancel); };
    const cancel = (): void => { cleanup(); image.src = ''; reject(new Error('Schematic image cancelled')); };
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error('Schematic image unavailable')); };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel(); else image.src = url;
  });
}

export async function prepareSchematicFallback(request: SchematicRequest, signal: AbortSignal): Promise<Blob | null> {
  const image = await loadImage(request.url, signal);
  const yieldWork = createOpaqueLoadingYielder(2, 16);
  const steps = bakeSchematicSteps(image, image.naturalWidth, image.naturalHeight, request, (width, height) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
  });
  let target: HTMLCanvasElement | null = null;
  try {
    let count = 0;
    while (true) {
      abortError(signal);
      const step = steps.next();
      if (step.done) { target = step.value; break; }
      count += 1;
      await withAbort(yieldWork(count === 1 || count % 16 === 0), signal);
    }
    abortError(signal);
    if (!target) return null;
    const owned = target;
    return await new Promise<Blob | null>(resolve => {
      const cancel = (): void => { signal.removeEventListener('abort', cancel); resolve(null); };
      signal.addEventListener('abort', cancel, { once: true });
      try {
        owned.toBlob(blob => { signal.removeEventListener('abort', cancel); resolve(signal.aborted ? null : blob); }, 'image/png');
      } catch { cancel(); }
    });
  } finally {
    steps.return(null);
    image.src = '';
    if (target) { target.width = 0; target.height = 0; }
  }
}

function blobDataUrl(blob: Blob, signal: AbortSignal): Promise<string | null> {
  return new Promise(resolve => {
    const reader = new FileReader();
    const cleanup = (): void => { reader.onload = reader.onerror = reader.onabort = null; signal.removeEventListener('abort', cancel); };
    const finish = (value: string | null): void => { cleanup(); resolve(value); };
    const cancel = (): void => { cleanup(); reader.abort(); resolve(null); };
    reader.onload = () => finish(typeof reader.result === 'string' && !signal.aborted ? reader.result : null);
    reader.onerror = reader.onabort = () => finish(null);
    signal.addEventListener('abort', cancel, { once: true });
    try { if (signal.aborted) cancel(); else reader.readAsDataURL(blob); }
    catch { finish(null); }
  });
}

function browserWorker(): SchematicWorkerPort | null {
  if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function'
    || typeof createImageBitmap !== 'function') return null;
  const native = new Worker(new URL('./shotSchematicWorker.ts', import.meta.url), { type: 'module' });
  const port: SchematicWorkerPort = {
    onmessage: null, onerror: null, onmessageerror: null,
    postMessage: message => native.postMessage(message),
    terminate: () => { native.onmessage = native.onerror = native.onmessageerror = null; native.terminate(); },
  };
  native.onmessage = (event: MessageEvent<SchematicReply>) => port.onmessage?.({ data: event.data });
  native.onerror = () => port.onerror?.();
  native.onmessageerror = () => port.onmessageerror?.();
  return port;
}

let shared: ReturnType<typeof createSchematicClient> | null = null;
export function schematicUrl(key: string, request: SchematicRequest): Promise<string | null> {
  try {
    if (!shared) {
      shared = createSchematicClient({ worker: browserWorker, fallback: prepareSchematicFallback, dataUrl: blobDataUrl,
        schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); } });
    }
    return shared.get(key, { ...request, url: new URL(request.url, document.baseURI).href });
  } catch { return Promise.resolve(null); }
}
export function disposeSchematicPreparation(): void { shared?.dispose(); shared = null; }
if (typeof window !== 'undefined') window.addEventListener('pagehide', disposeSchematicPreparation);
