export const SOURCE_PERSISTENT_PROTOCOL = 'urban-sourced-image-persistent-client-v1';
const RUNTIME_PROTOCOL = 'sourced-texture-composition-v1';

/** Transparent native-call observation; no changed bitmap/worker arguments. */
export function observePersistentSourceTransport(target = globalThis, now = () => performance.now()) {
  const receipt = { workers: [], bitmaps: [], errors: [], stopped: false };
  const owned = new Map();
  const workerDescriptor = Object.getOwnPropertyDescriptor(target, 'Worker');
  const bitmapDescriptor = Object.getOwnPropertyDescriptor(target, 'createImageBitmap');
  if (typeof workerDescriptor?.value !== 'function' || typeof bitmapDescriptor?.value !== 'function') {
    throw new Error('Native worker/bitmap observation unavailable');
  }
  const NativeWorker = workerDescriptor.value, nativeBitmap = bitmapDescriptor.value;
  const error = value => { if (receipt.errors.length < 8) receipt.errors.push(String(value).slice(0, 512)); };
  const WorkerProxy = new Proxy(NativeWorker, { construct(constructor, args, newTarget) {
    if (receipt.workers.length >= 2) throw new Error('Persistent worker recreation exceeds acquisition bound');
    const at = now(), worker = Reflect.construct(constructor, args, newTarget);
    const row = { id: receipt.workers.length + 1, constructedAt: at, returnedAt: now(),
      url: String(args[0]), readyAt: null, requests: [], replies: [], terminatedAt: null };
    receipt.workers.push(row);
    const post = worker.postMessage, terminate = worker.terminate;
    const postDescriptor = Object.getOwnPropertyDescriptor(worker, 'postMessage');
    const terminateDescriptor = Object.getOwnPropertyDescriptor(worker, 'terminate');
    const onMessage = event => {
      const value = event.data;
      if (value?.protocol !== RUNTIME_PROTOCOL) { error('Unexpected runtime worker protocol'); return; }
      if (value.type === 'ready') { row.readyAt = now(); return; }
      if (row.replies.length >= 4) { error('Reply observation limit exceeded'); return; }
      row.replies.push({ at: now(), type: value.type, requestId: value.requestId,
        size: value.size ?? null, closedBitmaps: value.closedBitmaps ?? null });
    };
    worker.addEventListener('message', onMessage);
    const postWrapper = function (...values) {
      const transferred = Array.isArray(values[1]) ? values[1] : [];
      const rowRequest = { at: now(), requestId: values[0]?.requestId,
        bitmaps: transferred.length, detached: null, endedAt: null };
      if (row.requests.length >= 4) throw new Error('Request observation limit exceeded');
      row.requests.push(rowRequest);
      try { return Reflect.apply(post, this, values); }
      finally {
        rowRequest.endedAt = now();
        rowRequest.detached = transferred.filter(value => value.width === 0 && value.height === 0).length;
      }
    };
    const terminateWrapper = function (...values) {
      try { return Reflect.apply(terminate, this, values); }
      finally { row.terminatedAt = now(); }
    };
    try {
      worker.postMessage = postWrapper; worker.terminate = terminateWrapper;
      owned.set(worker, { row, terminate, onMessage, postWrapper, terminateWrapper, postDescriptor, terminateDescriptor });
    } catch (failure) {
      worker.removeEventListener('message', onMessage);
      Reflect.apply(terminate, worker, []); row.terminatedAt = now();
      throw failure;
    }
    return worker;
  } });
  const bitmapWrapper = function (...args) {
    if (receipt.bitmaps.length >= 6) throw new Error('Bitmap observation limit exceeded');
    const row = { requestedAt: now(), settledAt: null, width: null, height: null, failed: false };
    receipt.bitmaps.push(row);
    const promise = Reflect.apply(nativeBitmap, this, args);
    // Return the original promise. This observer adds no await to the client.
    promise.then(bitmap => {
      if (receipt.stopped) return;
      row.settledAt = now(); row.width = bitmap.width; row.height = bitmap.height;
    }, failure => { row.failed = true; error(failure); });
    return promise;
  };
  try {
    Object.defineProperty(target, 'Worker', { ...workerDescriptor, value: WorkerProxy });
    Object.defineProperty(target, 'createImageBitmap', { ...bitmapDescriptor, value: bitmapWrapper });
  } catch (failure) {
    if (target.Worker === WorkerProxy) Object.defineProperty(target, 'Worker', workerDescriptor);
    throw failure;
  }
  return {
    stop() {
      if (receipt.stopped) return receipt;
      for (const [worker, owner] of owned) {
        worker.removeEventListener('message', owner.onMessage);
        if (owner.row.terminatedAt === null) {
          error('Client did not terminate its owned worker');
          try { Reflect.apply(owner.terminate, worker, []); owner.row.terminatedAt = now(); } catch (failure) { error(failure); }
        }
        for (const [name, wrapper, descriptor] of [
          ['postMessage', owner.postWrapper, owner.postDescriptor],
          ['terminate', owner.terminateWrapper, owner.terminateDescriptor],
        ]) {
          if (worker[name] !== wrapper) { error(`${name} observer ownership changed`); continue; }
          try {
            if (descriptor) Object.defineProperty(worker, name, descriptor); else delete worker[name];
          } catch (failure) { error(failure); }
        }
      }
      owned.clear();
      if (target.Worker === WorkerProxy) Object.defineProperty(target, 'Worker', workerDescriptor);
      else error('Worker observer ownership changed');
      if (target.createImageBitmap === bitmapWrapper) Object.defineProperty(target, 'createImageBitmap', bitmapDescriptor);
      else error('Bitmap observer ownership changed');
      receipt.stopped = true; return receipt;
    },
  };
}

export async function runPersistentSourceComposition({ input, images, signal, compose, adopt, now = () => performance.now() }) {
  const startedAt = now();
  const result = await compose({ key: input.set, size: 1024,
    options: { ...input.options, separateSurface: input.kind === 'building' },
    includeSurface: input.kind === 'building', images }, signal);
  if (!result) throw new Error('Actual persistent client returned fallback; this is not a successful worker trial');
  const adoptionStartedAt = now();
  const outputs = [{ role: 'albedo', canvas: adopt(result.albedo, 1024, true) }];
  if (result.surface) outputs.push({ role: 'surface', canvas: adopt(result.surface, 1024, false) });
  const endedAt = now();
  return { outputs, startedAt, endedAt, pipelineMs: endedAt - startedAt,
    pipelineEnd: 'actual production canvas adoption; client termination follows both measured phases',
    compositionMs: null, readbackMs: null, workerInternalTiming: 'unavailable',
    adoptionMs: endedAt - adoptionStartedAt, requestId: result.requestId, closedBitmaps: result.closedBitmaps };
}

export function validatePersistentSourceTrial(row, input) {
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const finite = value => Number.isFinite(value) && value >= 0;
  require(row.status === 'complete' && ['main', 'worker'].includes(row.policy), 'Incomplete persistent trial');
  require(row.caseId === input.id && row.size === 1024 && row.kind === input.kind, 'Incorrect fixture identity');
  require(JSON.stringify(row.quality) === JSON.stringify({ tier: 'desktop', preset: 'high', textureSize: 1024 }), 'Quality changed');
  require(row.graphics?.nativeObserved && !row.graphics.contextLost, 'Native graphics unavailable');
  const sourceImages = Object.entries(input.images).filter(([, url]) => url);
  require(row.images.length === sourceImages.length, 'Missing image receipts');
  for (const [role, url] of sourceImages) {
    const image = row.images.find(value => value.role === role && value.url === url);
    require(image && image.width > 0 && image.height > 0 && finite(image.requestedAt)
      && image.onloadAt >= image.requestedAt && image.onloadAt <= row.readyAt, 'Invalid image chronology');
  }
  const color = row.images.find(value => value.role === 'color');
  require(color.width === 1024 && color.height === (input.set === 'brick' ? 512 : 1024), 'Native dimensions changed');
  require(row.measurements.length === 2 && row.measurements[0].stage === 'first'
    && row.measurements[1].stage === 'delayed-reuse', 'Missing first/reuse trial');
  const trace = row.responsiveness;
  require(trace && !trace.overflow && trace.callbacks.length >= 3 && trace.callbacks.length <= 8192
    && trace.longTasks.length <= 128, 'Unusable responsiveness trace');
  require(trace.callbacks.every((value, index) => finite(value.callbackAt) && finite(value.frameTimestamp)
    && (!index || value.callbackAt >= trace.callbacks[index - 1].callbackAt))
    && trace.longTasks.every(value => finite(value.startTime) && finite(value.duration)), 'Invalid raw timing observation');
  const reads = 1 + Number(!!input.images.ao) + Number(!!input.images.rough);
  const roles = input.kind === 'building' ? ['albedo', 'surface'] : ['albedo'];
  for (const measure of row.measurements) {
    require(['startedAt', 'endedAt', 'pipelineMs', 'imageReadyToAdoptionMs', 'requestToCompositionEndMs'].every(key => finite(measure[key])), 'Invalid timing');
    require(measure.startedAt >= row.readyAt && measure.endedAt >= measure.startedAt
      && Math.abs(measure.pipelineMs - (measure.endedAt - measure.startedAt)) < 0.01
      && Math.abs(measure.imageReadyToAdoptionMs - (measure.endedAt - row.readyAt)) < 0.01
      && Math.abs(measure.requestToCompositionEndMs - (measure.endedAt - row.requestedAt)) < 0.01, 'Invalid pipeline chronology');
    require(measure.outputs.length === roles.length && measure.outputs.every((value, index) => value.role === roles[index]
      && value.width === 1024 && value.height === 1024 && value.byteLength === 1024 ** 2 * 4), 'Invalid pixel outputs');
    const start = measure.stage === 'first' ? row.readyAt : measure.startedAt;
    const intervals = trace.callbacks.slice(1).map((value, index) => ({ start: trace.callbacks[index].callbackAt,
      end: value.callbackAt, gapMs: value.callbackAt - trace.callbacks[index].callbackAt }))
      .filter(value => value.start < measure.endedAt && value.end > start);
    require(intervals.length && JSON.stringify(intervals) === JSON.stringify(measure.responsiveness.callbackIntervals)
      && finite(measure.responsiveness.leadingCallbackAt) && finite(measure.responsiveness.trailingCallbackAt)
      && measure.responsiveness.leadingCallbackAt <= start && measure.responsiveness.trailingCallbackAt >= measure.endedAt
      && measure.responsiveness.maxCallbackGapMs === Math.max(...intervals.map(value => value.gapMs)), 'Invalid callback edge witness');
    if (row.policy === 'main') {
      require(measure.mainReadbacks.length === reads && finite(measure.compositionMs) && finite(measure.readbackMs)
        && measure.mainReadbacks.every(value => finite(value.durationMs) && value.width === 1024 && value.height === 1024), 'Missing legacy readbacks');
    } else {
      require(measure.mainReadbacks.length === 0 && measure.compositionMs === null && measure.readbackMs === null
        && measure.workerInternalTiming === 'unavailable' && finite(measure.adoptionMs), 'Unverified worker timing/main readback');
      const owner = row.transport.workers[0];
      const request = owner.requests.find(value => value.requestId === measure.requestId);
      const reply = owner.replies.find(value => value.requestId === measure.requestId);
      require(request && reply?.type === 'complete' && request.bitmaps === reads && request.detached === reads
        && reply.closedBitmaps === reads && measure.closedBitmaps === reads
        && request.at >= measure.startedAt && reply.at <= measure.endedAt, 'Incomplete actual transport/bitmap ownership');
    }
  }
  require(row.measurements[1].startedAt - row.measurements[0].endedAt >= row.reuseDelayMs - 1, 'Reuse was not delayed');
  if (row.policy === 'worker') {
    const transport = row.transport, owner = transport?.workers[0];
    require(transport?.stopped && !transport.errors.length && transport.workers.length === 1
      && finite(owner.readyAt) && owner.readyAt >= owner.constructedAt && owner.terminatedAt >= row.measurements[1].endedAt
      && owner.requests.length === 2 && owner.replies.length === 2
      && transport.bitmaps.length === reads * 2 && transport.bitmaps.every(value => !value.failed && finite(value.settledAt)),
    'Persistent lifecycle did not complete cleanly');
  }
}
