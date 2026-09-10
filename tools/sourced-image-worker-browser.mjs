/** Tool-only browser acquisition. No imports or changes to game runtime owners. */
export function workerCompositionCases(cases) {
  const source = id => {
    const value = cases.find(row => row.set === id);
    if (!value) throw new Error(`Missing approved fixture family: ${id}`);
    return value;
  };
  const variant = (id, missing) => {
    const value = source(id);
    return { ...value, id: `${value.id}-without-${missing.join('-')}`, fixture: true,
      missingOptional: missing, images: { ...value.images, ...Object.fromEntries(missing.map(role => [role, null])) } };
  };
  return [...cases, variant('grass', ['ao']), variant('grass', ['rough']), variant('plaster', ['ao', 'rough'])];
}

/** Admission only: no performance threshold or claim of faster rendering. */
export function validateWorkerTrial(row, input) {
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const finite = value => Number.isFinite(value) && value >= 0;
  require(row.status === 'complete' && ['main', 'worker'].includes(row.policy), 'Incomplete worker comparison');
  require(row.caseId === input.id && row.kind === input.kind && row.size === 1024, 'Wrong source case');
  require(JSON.stringify(row.quality) === JSON.stringify({ tier: 'desktop', preset: 'high', textureSize: 1024 }), 'Quality changed');
  const expectedImages = Object.entries(input.images).filter(([, url]) => url);
  require(row.images.length === expectedImages.length, 'Missing image receipts');
  for (const [role, url] of expectedImages) {
    const image = row.images.find(value => value.role === role && value.url === url);
    require(image && image.width > 0 && image.height > 0 && finite(image.requestedAt)
      && image.onloadAt >= image.requestedAt && image.onloadAt <= row.readyAt, 'Invalid loaded image chronology');
  }
  const color = row.images.find(value => value.role === 'color');
  require(color.width === 1024 && color.height === (input.set === 'brick' ? 512 : 1024), 'Native input dimensions changed');
  require(row.graphics?.nativeObserved && !row.graphics.contextLost, 'Native renderer unavailable');
  require(row.measurements?.length === 2 && row.measurements[0].stage === 'first'
    && row.measurements[1].stage === 'delayed-reuse', 'Missing measured phase');
  const trace = row.responsiveness;
  require(trace?.overflow === false && trace.callbacks?.length >= 3 && trace.callbacks.length <= 8192,
    'Unusable responsiveness observation');
  require(trace.callbacks.every((value, index) => finite(value.callbackAt) && finite(value.frameTimestamp)
    && (!index || value.callbackAt >= trace.callbacks[index - 1].callbackAt)), 'Invalid raw RAF callbacks');
  require(Array.isArray(trace.longTasks) && trace.longTasks.length <= 128
    && trace.longTasks.every(value => finite(value.startTime) && finite(value.duration)), 'Invalid raw LongTasks');
  const expectedReads = 1 + Number(Boolean(input.images.ao)) + Number(Boolean(input.images.rough));
  const roles = input.kind === 'building' ? ['albedo', 'surface'] : ['albedo'];
  for (const measure of row.measurements) {
    for (const key of ['startedAt', 'endedAt', 'pipelineMs', 'compositionMs', 'readbackMs',
      'imageReadyToAdoptionMs', 'requestToCompositionEndMs']) require(finite(measure[key]), `Invalid ${key}`);
    require(measure.startedAt >= row.readyAt && measure.endedAt >= measure.startedAt, 'Invalid pipeline chronology');
    require(Math.abs(measure.pipelineMs - (measure.endedAt - measure.startedAt)) < 0.01, 'Incorrect end-to-end interval');
    require(measure.readbackMs <= measure.compositionMs + 0.01, 'Readback outside composition');
    const observed = measure.responsiveness;
    const windowStart = measure.stage === 'first' ? row.readyAt : measure.startedAt;
    require(observed && finite(observed.leadingCallbackAt) && observed.leadingCallbackAt <= windowStart
      && finite(observed.trailingCallbackAt) && observed.trailingCallbackAt >= measure.endedAt
      && observed.callbackIntervals.length > 0 && finite(observed.maxCallbackGapMs), 'Missing callback edge witness');
    const expectedIntervals = trace.callbacks.slice(1).map((value, index) => ({
      start: trace.callbacks[index].callbackAt, end: value.callbackAt,
      gapMs: value.callbackAt - trace.callbacks[index].callbackAt,
    })).filter(value => value.start < measure.endedAt && value.end > windowStart);
    require(JSON.stringify(observed.callbackIntervals) === JSON.stringify(expectedIntervals)
      && observed.maxCallbackGapMs === Math.max(0, ...expectedIntervals.map(value => value.gapMs)), 'RAF window differs from raw callbacks');
    require(measure.outputs?.length === roles.length && measure.outputs.every((output, index) =>
      output.role === roles[index] && output.width === 1024 && output.height === 1024
      && output.byteLength === 1024 * 1024 * 4), 'Wrong composed output shape');
    const reads = row.policy === 'main' ? measure.mainReadbacks : measure.worker?.timing?.readbacks;
    require(reads?.length === expectedReads && reads.every(read => read.width === 1024
      && read.height === 1024 && finite(read.durationMs)), 'Wrong actual composer readbacks');
    if (row.policy === 'main') continue;
    require(measure.mainReadbacks.length === 0, 'Worker pipeline performed a main Canvas readback');
    for (const key of ['bitmapMs', 'workerBootstrapMs', 'postMessageMs', 'replyWaitMs', 'adoptionMs']) {
      require(finite(measure[key]), `Invalid worker ${key}`);
    }
    const bitmap = measure.bitmapOwnership;
    require(bitmap && bitmap.created === expectedReads && bitmap.transferred === expectedReads
      && bitmap.detached === expectedReads && bitmap.pending === 0 && bitmap.owned === 0 && bitmap.stopped
      && bitmap.closeErrors.length === 0, 'Unreleased or untransferred main bitmaps');
    require(measure.lifecycle.terminationRequested && measure.lifecycle.urlRevoked
      && measure.lifecycle.errors.length === 0, 'Worker lifecycle cleanup failed');
    require(measure.worker.readyToTerminate && measure.worker.cleanup.complete
      && measure.worker.cleanup.bitmapsClosed === expectedReads, 'Worker did not close input bitmaps');
  }
  require(row.measurements[1].startedAt - row.measurements[0].endedAt >= row.reuseDelayMs - 1, 'Reuse was not delayed');
}

/** A late bitmap completion still releases its own native backing after cancellation. */
export function createBitmapOwner(createBitmap) {
  const owned = new Set();
  const counts = { created: 0, closed: 0, transferred: 0, detached: 0, pending: 0, closeErrors: [] };
  let stopped = false;
  const closeOne = bitmap => {
    try { bitmap.close(); counts.closed++; }
    catch (error) { counts.closeErrors.push(String(error)); }
  };
  const close = () => { stopped = true; for (const bitmap of owned) closeOne(bitmap); owned.clear(); };
  return {
    async prepare(images) {
      if (stopped) throw new Error('Bitmap owner is closed');
      try {
        return Object.fromEntries(await Promise.all(Object.entries(images).map(async ([role, image]) => {
          if (!image) return [role, null];
          counts.pending++;
          try {
            const bitmap = await createBitmap(image); counts.created++;
            if (stopped) { closeOne(bitmap); throw new Error('Late bitmap after cancellation'); }
            owned.add(bitmap); return [role, bitmap];
          } finally { counts.pending--; }
        })));
      } catch (error) { close(); throw error; }
    },
    transferList: () => [...owned],
    markTransferred() {
      for (const bitmap of owned) {
        counts.transferred++;
        if (bitmap.width === 0 && bitmap.height === 0) counts.detached++;
      }
      owned.clear();
    },
    close,
    snapshot: () => ({ ...counts, closeErrors: [...counts.closeErrors], owned: owned.size, stopped }),
  };
}

/** Worker lifetime is one composition, including bootstrap and result export. */
export async function runWorkerComposition({ images, input, requestId, workerSource, validateReply,
  timeoutMs, ports, signal }) {
  const now = ports.now;
  const bitmapOwner = createBitmapOwner(ports.createBitmap);
  const timing = { startedAt: now() };
  let worker, url, timer, outcome, failure, onAbort;
  const lifecycle = { terminationRequested: false, urlRevoked: false, errors: [] };
  try {
    if (signal?.aborted) throw new Error('Worker composition canceled');
    url = ports.createUrl(workerSource);
    worker = ports.createWorker(url);
    timing.workerConstructedAt = now();
    const reply = new Promise((resolve, reject) => {
      onAbort = () => { bitmapOwner.close(); reject(new Error('Worker composition canceled')); };
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = ports.schedule(() => reject(new Error('Worker/bitmap deadline')), timeoutMs);
      worker.onerror = event => reject(new Error(`Worker error: ${event.message ?? 'unknown'}`));
      worker.onmessageerror = () => reject(new Error('Worker message decode failed'));
      worker.onmessage = event => {
        timing.replyAt = now();
        try { resolve(validateReply(event.data, requestId, input)); }
        catch (error) { reject(error); }
      };
    });
    timing.bitmapStartedAt = now();
    // Startup failure/deadline interrupts bitmap waiting; late bitmaps close through their owner.
    const bitmaps = await Promise.race([bitmapOwner.prepare(images), reply.then(() => {
      throw new Error('Unexpected worker result before transfer');
    })]);
    timing.bitmapReadyAt = now();
    timing.postStartedAt = now();
    worker.postMessage({ type: 'compose', requestId, input: { kind: input.kind, options: input.options }, images: bitmaps },
      bitmapOwner.transferList());
    bitmapOwner.markTransferred();
    timing.postEndedAt = now();
    const result = await reply;
    const adoptionStartedAt = now();
    const outputs = ports.adopt(result.outputs);
    const endedAt = now();
    outcome = { outputs, startedAt: timing.startedAt, endedAt, pipelineMs: endedAt - timing.startedAt,
      pipelineEnd: 'main-canvas-adoption; excludes subsequent termination/revoke',
      bitmapMs: timing.bitmapReadyAt - timing.bitmapStartedAt,
      workerBootstrapMs: timing.workerConstructedAt - timing.startedAt,
      postMessageMs: timing.postEndedAt - timing.postStartedAt,
      replyWaitMs: timing.replyAt - timing.postStartedAt,
      adoptionMs: endedAt - adoptionStartedAt, transportTimeline: timing,
      worker: result, lifecycle };
    return outcome;
  } catch (error) {
    failure = error; throw error;
  } finally {
    lifecycle.cleanupStartedAt = now();
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    if (timer !== undefined) ports.cancelSchedule(timer);
    bitmapOwner.close();
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      try { worker.terminate(); lifecycle.terminationRequested = true; }
      catch (error) { lifecycle.errors.push(String(error)); }
    }
    if (url !== undefined) {
      try { ports.revokeUrl(url); lifecycle.urlRevoked = true; }
      catch (error) { lifecycle.errors.push(String(error)); }
    }
    lifecycle.cleanupEndedAt = now();
    const bitmapOwnership = bitmapOwner.snapshot();
    if (outcome) outcome.bitmapOwnership = bitmapOwnership;
    if (failure) failure.compositionReceipt = { timing, bitmapOwnership, lifecycle };
  }
}

function startResponsivenessObserver() {
  const callbacks = [], longTasks = [];
  let overflow = false, rafId;
  const frame = timestamp => {
    if (callbacks.length < 8192) callbacks.push({ callbackAt: performance.now(), frameTimestamp: timestamp });
    else overflow = true;
    rafId = requestAnimationFrame(frame);
  };
  if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) throw new Error('LongTask observation unavailable');
  const append = entries => {
    for (const entry of entries) {
      if (longTasks.length < 128) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      else overflow = true;
    }
  };
  const observer = new PerformanceObserver(list => append(list.getEntries()));
  observer.observe({ type: 'longtask' });
  rafId = requestAnimationFrame(frame);
  return { callbacks, stop() {
    append(observer.takeRecords()); observer.disconnect(); cancelAnimationFrame(rafId);
    return { callbacks, longTasks, overflow, clock: 'performance.now at callback entry; native RAF timestamp retained' };
  } };
}

function observeReads(operation) {
  const prototype = CanvasRenderingContext2D.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'getImageData');
  const original = descriptor.value, reads = [];
  const wrapper = function (...args) {
    const start = performance.now();
    try { return Reflect.apply(original, this, args); }
    finally { reads.push({ start, durationMs: performance.now() - start, width: args[2], height: args[3] }); }
  };
  Object.defineProperty(prototype, 'getImageData', { ...descriptor, value: wrapper });
  const restore = () => { if (prototype.getImageData === wrapper) Object.defineProperty(prototype, 'getImageData', descriptor); };
  try {
    const value = operation(reads);
    if (value?.then) return value.finally(restore);
    restore(); return value;
  } catch (error) { restore(); throw error; }
}

function packOutput({ canvas, role }) {
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let binary = '';
  for (let offset = 0; offset < pixels.length; offset += 32768) {
    binary += String.fromCharCode(...pixels.subarray(offset, offset + 32768));
  }
  return { role, width: canvas.width, height: canvas.height, byteLength: pixels.length, rgbaBase64: btoa(binary) };
}

function responsivenessWindows(report) {
  const { callbacks, longTasks } = report.responsiveness;
  const intervals = callbacks.slice(1).map((row, index) => ({ start: callbacks[index].callbackAt,
    end: row.callbackAt, gapMs: row.callbackAt - callbacks[index].callbackAt }));
  for (const measure of report.measurements) {
    const windowStart = measure.stage === 'first' ? report.readyAt : measure.startedAt;
    const overlaps = (start, end) => start < measure.endedAt && end > windowStart;
    const selected = intervals.filter(row => overlaps(row.start, row.end));
    measure.responsiveness = { callbackIntervals: selected,
      maxCallbackGapMs: Math.max(0, ...selected.map(row => row.gapMs)),
      leadingCallbackAt: callbacks.findLast(row => row.callbackAt <= windowStart)?.callbackAt ?? null,
      trailingCallbackAt: callbacks.find(row => row.callbackAt >= measure.endedAt)?.callbackAt ?? null,
      overlappingLongTasks: longTasks.filter(row => overlaps(row.startTime, row.startTime + row.duration)) };
  }
}

export async function measureWorkerComparison({ input, policy, reuseDelayMs, imageTimeoutMs,
  workerTimeoutMs, workerSource, validateReplySource }) {
  const now = () => performance.now();
  const report = window.__SOURCE_COMPOSITION = { caseId: input.id, policy, kind: input.kind,
    status: 'running', images: [], measurements: [], reuseDelayMs, size: 1024,
    workerLifetime: 'fresh-one-shot-per-composition; delayed stage reuses images, not worker', errors: [] };
  const canvases = [], pendingImages = new Set(), timers = new Set(), frameIds = new Set();
  const cancellation = new AbortController(), abortWaiters = new Set();
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const stop = () => {
    cancellation.abort();
    for (const abort of [...abortWaiters]) abort();
    return finished;
  };
  window.__STOP_SOURCE_COMPOSITION = stop;
  let observer;
  const wait = (ms, callback) => {
    const timer = setTimeout(() => { timers.delete(timer); callback(); }, ms); timers.add(timer); return timer;
  };
  const frameBoundary = () => new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Source composition canceled'));
    abortWaiters.add(abort);
    const deadline = wait(3000, () => reject(new Error('Observation frame boundary deadline')));
    const id = requestAnimationFrame(() => {
      frameIds.delete(id);
      wait(0, () => { clearTimeout(deadline); timers.delete(deadline); abortWaiters.delete(abort); resolve(); });
    });
    frameIds.add(id);
  });
  const load = (role, url) => new Promise((resolve, reject) => {
    if (!url) { resolve([role, null]); return; }
    const image = new Image(), receipt = { role, url, requestedAt: now() };
    pendingImages.add(image); report.images.push(receipt);
    const deadline = wait(imageTimeoutMs, () => { image.onload = image.onerror = null; reject(new Error(`Image deadline: ${url}`)); });
    const settle = error => {
      abortWaiters.delete(abort);
      clearTimeout(deadline); timers.delete(deadline); pendingImages.delete(image);
      image.onload = image.onerror = null;
      if (error) reject(error); else resolve([role, image]);
    };
    const abort = () => settle(new Error('Source image load canceled'));
    abortWaiters.add(abort);
    image.onload = () => {
      receipt.onloadAt = now(); receipt.width = image.naturalWidth; receipt.height = image.naturalHeight;
      settle(image.naturalWidth && image.naturalHeight ? null : new Error(`Empty image: ${url}`));
    };
    image.onerror = () => settle(new Error(`Image failed: ${url}`));
    image.src = url;
  });
  const adopt = outputs => outputs.map(output => {
    const canvas = document.createElement('canvas'); canvases.push(canvas);
    canvas.width = output.width; canvas.height = output.height;
    const context = canvas.getContext('2d', output.role === 'albedo' ? { willReadFrequently: true } : undefined);
    if (!context) throw new Error('Main adoption Canvas2D unavailable');
    context.putImageData(new ImageData(new Uint8ClampedArray(output.buffer), output.width, output.height), 0, 0);
    return { role: output.role, canvas };
  });
  try {
    const owner = await import('/src/world/sourcedTextures.ts');
    const quality = await import('/src/engine/quality.ts');
    quality.resolveDeviceTier(); quality.setPresetName('high');
    report.quality = { tier: quality.getDeviceTier(), preset: quality.resolvePresetName(), textureSize: quality.texSize(1024) };
    const validateReply = new Function(`return (${validateReplySource});`)();
    observer = startResponsivenessObserver();
    // Establish a leading callback before image IO, without warming image/composition paths.
    await frameBoundary(); await frameBoundary();
    report.requestedAt = now();
    const loaded = Object.fromEntries(await Promise.all(Object.entries(input.images).map(([role, url]) => load(role, url))));
    report.readyAt = now();
    const measure = async stage => {
      const startedAt = now();
      const result = await observeReads(async reads => {
        if (policy === 'worker') {
          const result = await runWorkerComposition({ input, requestId: stage, workerSource, validateReply,
            signal: cancellation.signal,
            images: { color: loaded.color, ao: loaded.ao, rough: loaded.rough }, timeoutMs: workerTimeoutMs,
            ports: { now, createBitmap: image => createImageBitmap(image),
              createUrl: source => URL.createObjectURL(new Blob([source], { type: 'text/javascript' })),
              createWorker: url => new Worker(url, { type: 'module' }), revokeUrl: url => URL.revokeObjectURL(url),
              schedule: (callback, ms) => setTimeout(callback, ms), cancelSchedule: timer => clearTimeout(timer), adopt } });
          return { ...result, mainReadbacks: reads, compositionMs: result.worker.timing.compositionMs,
            readbackMs: result.worker.timing.readbackMs };
        }
        const albedo = owner.composeAlbedo(loaded.color, input.kind === 'terrain' ? loaded.ao : null, loaded.rough, input.options);
        canvases.push(albedo);
        const outputs = [{ role: 'albedo', canvas: albedo }];
        if (input.kind === 'building') {
          const surface = owner.composeSurface(loaded.ao, loaded.rough, 1024, input.options.roughMul ?? 1);
          canvases.push(surface); outputs.push({ role: 'surface', canvas: surface });
        }
        const endedAt = now();
        return { outputs, startedAt, endedAt, pipelineMs: endedAt - startedAt, compositionMs: endedAt - startedAt,
          readbackMs: reads.reduce((sum, item) => sum + item.durationMs, 0), mainReadbacks: reads };
      });
      const outputs = result.outputs; delete result.outputs;
      // Transferred RGBA is only retained through the adopted canvas, not duplicated in receipts.
      if (result.worker) result.worker.outputs = result.worker.outputs.map(({ buffer, ...output }) => ({ ...output, byteLength: buffer.byteLength }));
      report.measurements.push({ stage, ...result, imageReadyToAdoptionMs: result.endedAt - report.readyAt,
        requestToCompositionEndMs: result.endedAt - report.requestedAt, outputs: [] });
      return outputs;
    };
    const first = await measure('first');
    await new Promise((resolve, reject) => {
      const abort = () => reject(new Error('Delayed composition canceled'));
      abortWaiters.add(abort);
      wait(reuseDelayMs, () => { abortWaiters.delete(abort); resolve(); });
    });
    const reuse = await measure('delayed-reuse');
    await frameBoundary(); await frameBoundary();
    report.responsiveness = observer.stop(); observer = null;
    responsivenessWindows(report);
    // Diagnostic readbacks and encoding are excluded from both pipelines and responsiveness observation.
    report.measurements[0].outputs = first.map(packOutput);
    report.measurements[1].outputs = reuse.map(packOutput);
    report.status = 'complete';
  } catch (error) {
    report.status = 'failed'; report.error = String(error);
    if (error.compositionReceipt) report.failedPipeline = error.compositionReceipt;
  }
  finally {
    if (observer) report.responsiveness = observer.stop();
    for (const timer of timers) clearTimeout(timer);
    for (const id of frameIds) cancelAnimationFrame(id);
    for (const image of pendingImages) image.onload = image.onerror = null;
    for (const canvas of canvases) canvas.width = canvas.height = 0;
    abortWaiters.clear();
    if (window.__STOP_SOURCE_COMPOSITION === stop) delete window.__STOP_SOURCE_COMPOSITION;
    finish();
  }
  return report;
}
