import type { RuntimeValue } from '../runtimeTypes.ts';
import type { SourcedComposeOptions } from './sourcedTextureComposer.ts';
import {
  SOURCED_TEXTURE_COMPOSITION_PROTOCOL,
  isSourcedTextureCompositionReady,
  validateSourcedTextureCompositionReply,
  type SourcedTextureCompositionComplete,
  type SourcedTextureCompositionRequest,
} from './sourcedTextureCompositionProtocol.ts';

export interface SourcedCompositionImages {
  color: HTMLImageElement;
  ao: HTMLImageElement | null;
  rough: HTMLImageElement | null;
}

export interface SourcedCompositionInput {
  /** Source-set identity; the client additionally keys every option and image owner. */
  key: string;
  size: number;
  options: SourcedComposeOptions;
  includeSurface: boolean;
  images: SourcedCompositionImages;
}

export interface SourcedCompositionWorkerPort {
  onmessage: ((event: { data: RuntimeValue }) => void) | null;
  onerror: (() => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(message: SourcedTextureCompositionRequest, transfer: ImageBitmap[]): void;
  terminate(): void;
}

export interface SourcedCompositionClientPorts {
  createWorker(): SourcedCompositionWorkerPort | null;
  createBitmap(image: HTMLImageElement): Promise<ImageBitmap>;
  schedule(callback: () => void, delay: number): () => void;
}

interface Consumer {
  resolve(result: SourcedTextureCompositionComplete | null): void;
  detach(): void;
}

interface CompositionJob {
  requestId: number;
  key: string;
  input: SourcedCompositionInput;
  consumers: Set<Consumer>;
  cancelTimer(): void;
  bitmaps: Set<ImageBitmap>;
  preparing: boolean;
  posted: boolean;
  finished: boolean;
}

export interface SourcedCompositionClient {
  compose(input: SourcedCompositionInput, signal?: AbortSignal): Promise<SourcedTextureCompositionComplete | null>;
  available(): boolean;
  dispose(): void;
}

function optionsSnapshot(options: SourcedComposeOptions): SourcedComposeOptions {
  return {
    roughInAlpha: options.roughInAlpha ?? false,
    separateSurface: options.separateSurface ?? false,
    roughMul: options.roughMul ?? 1,
    tint: options.tint ? [options.tint[0], options.tint[1], options.tint[2]] : null,
    desat: options.desat ?? 0,
    lift: options.lift ?? 0,
  };
}

function usedImages(input: SourcedCompositionInput): SourcedCompositionImages {
  return {
    color: input.images.color,
    ao: !input.options.separateSurface || input.includeSurface ? input.images.ao : null,
    rough: input.options.roughInAlpha || input.includeSurface ? input.images.rough : null,
  };
}

/** One serial worker and one bitmap preparation at a time. A joined consumer's
 * cancellation never interrupts another consumer. No textures or canvas cache
 * entries belong to this service; returned buffers belong to the caller. */
export function createSourcedCompositionClient(
  ports: SourcedCompositionClientPorts,
  { timeoutMs = 5_000, idleMs = 5_000, maxPending = 8 } = {},
): SourcedCompositionClient {
  if (![timeoutMs, idleMs, maxPending].every(value => Number.isFinite(value) && value > 0)
      || !Number.isInteger(maxPending)) throw new Error('Invalid sourced composition limits');
  const queue: CompositionJob[] = [];
  const pending = new Map<string, CompositionJob>();
  const imageIds = new WeakMap<HTMLImageElement, number>();
  let nextImageId = 0, nextRequestId = 0;
  let worker: SourcedCompositionWorkerPort | null = null;
  let ready = false, unavailable = false;
  let active: CompositionJob | null = null;
  let cancelIdle: (() => void) | null = null;
  let idleRevision = 0;

  function stopIdle(): void {
    idleRevision++;
    cancelIdle?.(); cancelIdle = null;
  }

  function closeWorker(): void {
    stopIdle();
    const owned = worker;
    worker = null; ready = false;
    if (!owned) return;
    owned.onmessage = owned.onerror = owned.onmessageerror = null;
    try { owned.terminate(); } catch { /* private realm is already unavailable */ }
  }

  function closeBitmaps(job: CompositionJob): void {
    for (const bitmap of job.bitmaps) {
      try { bitmap.close(); } catch { /* detached/lost backing is no longer usable */ }
    }
    job.bitmaps.clear();
  }

  function settle(job: CompositionJob, result: SourcedTextureCompositionComplete | null): void {
    if (job.finished) return;
    job.finished = true;
    job.cancelTimer();
    closeBitmaps(job);
    if (pending.get(job.key) === job) pending.delete(job.key);
    for (const consumer of job.consumers) {
      consumer.detach(); consumer.resolve(result);
    }
    job.consumers.clear();
  }

  function fail(): void {
    unavailable = true;
    closeWorker();
    const current = active; active = null;
    if (current) settle(current, null);
    for (const job of queue.splice(0)) settle(job, null);
  }

  function finishActive(job: CompositionJob, result: SourcedTextureCompositionComplete | null): void {
    if (active !== job || job.finished) return;
    active = null;
    settle(job, result);
    advance();
  }

  function receive(owned: SourcedCompositionWorkerPort, data: RuntimeValue): void {
    if (worker !== owned || unavailable) return;
    if (isSourcedTextureCompositionReady(data)) {
      if (ready) { fail(); return; }
      ready = true;
      advance();
      return;
    }
    const job = active;
    if (!job?.posted) { fail(); return; }
    try {
      const reply = validateSourcedTextureCompositionReply(data, {
        requestId: job.requestId, key: job.key, size: job.input.size,
        includeSurface: job.input.includeSurface,
        closedBitmaps: Object.values(usedImages(job.input)).filter(Boolean).length,
      });
      // A reported Canvas/cleanup failure may have closed the worker realm.
      // Do not assume an error reply proves it can service the next request.
      if (reply.type === 'error') closeWorker();
      finishActive(job, reply.type === 'complete' ? reply : null);
    } catch { fail(); }
  }

  function acquireWorker(): boolean {
    if (worker) return true;
    const owned = ports.createWorker();
    if (!owned) return false;
    worker = owned;
    owned.onmessage = event => receive(owned, event.data);
    owned.onerror = owned.onmessageerror = () => { if (worker === owned) fail(); };
    return true;
  }

  async function makeBitmap(job: CompositionJob, image: HTMLImageElement | null): Promise<ImageBitmap | null> {
    if (!image) return null;
    try {
      const bitmap = await ports.createBitmap(image);
      if (job.finished) { bitmap.close(); return null; }
      job.bitmaps.add(bitmap);
      return bitmap;
    } catch { return null; }
  }

  async function prepare(job: CompositionJob): Promise<void> {
    job.preparing = true;
    const images = usedImages(job.input);
    // Await all native conversions, including failures, before starting another
    // job. Late conversions after a deadline/dispose close in makeBitmap().
    const [color, ao, rough] = await Promise.all([
      makeBitmap(job, images.color), makeBitmap(job, images.ao), makeBitmap(job, images.rough),
    ]);
    if (job.finished || active !== job) return;
    if (!color || (images.ao && !ao) || (images.rough && !rough) || !job.consumers.size) {
      finishActive(job, null);
      return;
    }
    const transfer = [...job.bitmaps];
    const request: SourcedTextureCompositionRequest = {
      type: 'compose', protocol: SOURCED_TEXTURE_COMPOSITION_PROTOCOL,
      requestId: job.requestId, key: job.key, size: job.input.size,
      options: job.input.options, includeSurface: job.input.includeSurface,
      bitmaps: { color, ao, rough },
    };
    try {
      job.posted = true;
      worker!.postMessage(request, transfer);
      // Successful postMessage transfers every input backing to the worker.
      job.bitmaps.clear();
    } catch { fail(); }
  }

  function idle(): void {
    const owned = worker, revision = ++idleRevision;
    cancelIdle = ports.schedule(() => {
      if (revision === idleRevision && worker === owned && !active) closeWorker();
    }, idleMs);
  }

  function advance(): void {
    if (unavailable) return;
    try {
      if (!active) {
        if (!queue.length) { idle(); return; }
        active = queue.shift()!;
      }
      if (!acquireWorker()) { fail(); return; }
      if (ready && !active.preparing) void prepare(active).catch(fail);
    } catch { fail(); }
  }

  function snapshot(input: SourcedCompositionInput): { input: SourcedCompositionInput; key: string } {
    if (!input || typeof input.key !== 'string' || !input.key.length || input.key.length > 512
        || !Number.isInteger(input.size) || input.size < 1 || input.size > 1024
        || typeof input.includeSurface !== 'boolean'
        || !input.images?.color || typeof input.images.color !== 'object') {
      throw new Error('Invalid sourced composition input');
    }
    const copy = { ...input, options: optionsSnapshot(input.options), images: { ...input.images } };
    const ids = Object.values(usedImages(copy)).map(image => {
      if (!image) return null;
      if (!imageIds.has(image)) imageIds.set(image, ++nextImageId);
      return imageIds.get(image);
    });
    return { input: copy, key: JSON.stringify([input.key, input.size, copy.options, input.includeSurface, ids]) };
  }

  function attach(job: CompositionJob, signal?: AbortSignal): Promise<SourcedTextureCompositionComplete | null> {
    return new Promise(resolve => {
      const abort = (): void => {
        job.consumers.delete(consumer);
        consumer.detach(); resolve(null);
        if (job.consumers.size) return;
        if (pending.get(job.key) === job) pending.delete(job.key);
        // Active native work stays serial until completion or its original
        // deadline. An abandoned queued job owns no transferred resources.
        if (active === job) {
          if (!job.preparing) finishActive(job, null);
          return;
        }
        const index = queue.indexOf(job);
        if (index >= 0) queue.splice(index, 1);
        settle(job, null);
      };
      const consumer: Consumer = {
        resolve,
        detach: () => signal?.removeEventListener('abort', abort),
      };
      job.consumers.add(consumer);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }

  function compose(input: SourcedCompositionInput, signal?: AbortSignal): Promise<SourcedTextureCompositionComplete | null> {
    if (unavailable || signal?.aborted) return Promise.resolve(null);
    let copy: ReturnType<typeof snapshot>;
    try { copy = snapshot(input); } catch { return Promise.resolve(null); }
    const existing = pending.get(copy.key);
    if (existing) return attach(existing, signal);
    if (queue.length + Number(!!active) >= maxPending) return Promise.resolve(null);
    stopIdle();
    const job: CompositionJob = {
      requestId: ++nextRequestId, key: copy.key, input: copy.input,
      consumers: new Set(), cancelTimer: () => {}, bitmaps: new Set(),
      preparing: false, posted: false, finished: false,
    };
    const result = attach(job, signal);
    if (job.finished) return result;
    try { job.cancelTimer = ports.schedule(fail, timeoutMs); }
    catch { settle(job, null); fail(); return result; }
    pending.set(job.key, job); queue.push(job); advance();
    return result;
  }

  return { compose, available: () => !unavailable, dispose: fail };
}

let sharedClient: SourcedCompositionClient | null = null;

function browserWorker(): SourcedCompositionWorkerPort {
  const native = new Worker(new URL('./sourcedTextureCompositionWorker.ts', import.meta.url), { type: 'module' });
  const port: SourcedCompositionWorkerPort = {
    onmessage: null, onerror: null, onmessageerror: null,
    postMessage: (request, transfer) => native.postMessage(request, transfer),
    terminate() {
      native.onmessage = native.onerror = native.onmessageerror = null;
      native.terminate();
    },
  };
  native.onmessage = event => port.onmessage?.({ data: event.data });
  native.onerror = () => port.onerror?.();
  native.onmessageerror = () => port.onmessageerror?.();
  return port;
}

export function canComposeSourcedTextureInWorker(): boolean {
  return typeof Worker === 'function' && typeof OffscreenCanvas === 'function'
    && typeof createImageBitmap === 'function' && typeof ImageData === 'function'
    && typeof document !== 'undefined' && (!sharedClient || sharedClient.available());
}

export function tryComposeSourcedTexture(
  input: SourcedCompositionInput, signal?: AbortSignal,
): Promise<SourcedTextureCompositionComplete | null> {
  if (!canComposeSourcedTextureInWorker()) return Promise.resolve(null);
  sharedClient ??= createSourcedCompositionClient({
    createWorker: browserWorker,
    createBitmap: image => createImageBitmap(image),
    schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
  });
  return sharedClient.compose(input, signal);
}

/** Explicit application teardown; ordinary idle termination allows lazy reuse. */
export function disposeSourcedTextureCompositionWorker(): void {
  sharedClient?.dispose(); sharedClient = null;
}
