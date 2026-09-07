/**
 * Bounded, opt-in Chrome trace for attribution, NOT an uninstrumented timing gate.
 * Raw trace names/arguments, URLs, stacks and identities never leave the collector.
 * A page performance mark aligns actual Chrome timestamps, not CDP reply time.
 * CPU-side GPU/compositor events are not GPU hardware duration measurements.
 * https://chromedevtools.github.io/devtools-protocol/tot/Tracing/
 */
const MARK = 'cot-multiplayer-trace-start';
const END_MARK = 'cot-multiplayer-trace-end';
const KINDS = new Map(Object.entries({
  RunTask: 'task', 'ThreadControllerImpl::RunTask': 'task',
  'ThreadPool_RunTask': 'worker-task', FunctionCall: 'function',
  FireAnimationFrame: 'animation-frame', TimerFire: 'timer', EventDispatch: 'event',
  MinorGC: 'minor-gc', MajorGC: 'major-gc', GCEvent: 'gc',
  Layout: 'layout', UpdateLayoutTree: 'style', Paint: 'paint', RasterTask: 'raster',
  DrawFrame: 'draw-frame', GPUTask: 'gpu-task', Commit: 'commit',
  BeginFrame: 'begin-frame', SubmitCompositorFrame: 'submit-frame',
}));
const THREADS = new Map([['CrGpuMain', 'gpu'], ['Compositor', 'compositor'],
  ['VizCompositorThread', 'viz'], ['CrRendererMain', 'other-page-main']]);
const number = value => typeof value === 'number' && Number.isFinite(value);
const clock = { setTimeout, clearTimeout };

function limits(options) {
  const maxRows = options.maxRows ?? 50000;
  const durationMs = options.durationMs ?? 30000;
  const commandTimeoutMs = options.commandTimeoutMs ?? 5000;
  const flushTimeoutMs = options.flushTimeoutMs ?? 30000;
  if ([[maxRows, 1, 50000], [durationMs, 1, 30000], [commandTimeoutMs, 1, 5000],
    [flushTimeoutMs, 1, 30000]]
    .some(([value, min, max]) => !Number.isInteger(value) || value < min || value > max)) {
    throw new TypeError('frame_trace_invalid_options');
  }
  return { maxRows, durationMs, commandTimeoutMs, flushTimeoutMs };
}

function kindOf(name) {
  if (typeof name !== 'string') return null;
  return KINDS.get(name) || (/^V8\.GC[_A-Z.]+$/.test(name) ? 'v8-gc' : null);
}

/** ReportEvents flushes in batches: sanitize immediately and bound all retained state. */
export function createFrameTraceCollector(options = {}) {
  const config = limits(options);
  const rows = [];
  const stacks = new Map();
  const overflowDepth = new Map();
  const threads = new Map();
  let anchor = null;
  let endAnchor = null;
  let duplicateMarker = false;
  let rowsDropped = 0;
  let malformed = 0;
  let stackOverflow = 0;
  let subThresholdEvents = 0;
  function retain(event, kind, duration) {
    if (!kind) return;
    if (!number(duration) || duration < 0 || duration > 60_000_000) { malformed++; return; }
    // Keep meaningful sub-millisecond work and EVERY GC duration. Unfiltered
    // scheduler bookkeeping overwhelmed the row budget in full-game captures.
    if (duration < 100 && !kind.includes('gc')) { subThresholdEvents++; return; }
    if (rows.length >= config.maxRows) { rowsDropped++; return; }
    rows.push({ at: event.ts, duration, pid: event.pid, tid: event.tid, kind });
  }
  function mark(event, key) {
    if ((event.name !== MARK && event.name !== END_MARK) || typeof event.cat !== 'string' ||
        !event.cat.split(',').includes('blink.user_timing')) return false;
    if (event.name === MARK) {
      if (anchor) duplicateMarker = true;
      else anchor = { at: event.ts, key };
    } else {
      if (endAnchor) duplicateMarker = true;
      else endAnchor = { at: event.ts, key };
    }
    return true;
  }
  function begin(event, key, kind) {
    if (!stacks.has(key)) {
      if (stacks.size >= 256) { stackOverflow++; return; }
      stacks.set(key, []);
    }
    const stack = stacks.get(key);
    if (stack.length >= 128) {
      stackOverflow++; overflowDepth.set(key, (overflowDepth.get(key) || 0) + 1); return;
    }
    stack.push({ ts: event.ts, pid: event.pid, tid: event.tid, kind });
  }
  function end(event, key) {
    if (overflowDepth.get(key)) { overflowDepth.set(key, overflowDepth.get(key) - 1); return; }
    const start = stacks.get(key)?.pop();
    // A trace can legitimately start mid-task; unmatched ends are ignored.
    if (start) retain(start, start.kind, event.ts - start.ts);
  }
  function addEvent(event) {
    const kind = kindOf(event?.name);
    // Unknown begin/end events still determine nesting of retained durations.
    // Dropping malformed structural evidence cannot yield a complete capture.
    const durationEvent = event?.ph === 'B' || event?.ph === 'E' || (event?.ph === 'X' && kind !== null);
    if (!event || !Number.isSafeInteger(event.pid) || !Number.isSafeInteger(event.tid)) {
      if (durationEvent) malformed++;
      return;
    }
    const key = `${event.pid}:${event.tid}`;
    if (event.ph === 'M' && event.name === 'thread_name') {
      const name = THREADS.get(event.args?.name);
      if (name && threads.size < 256) threads.set(key, name);
      return;
    }
    if (!number(event.ts) || event.ts < 0) {
      if (durationEvent) malformed++;
      return;
    }
    if (mark(event, key)) return;
    if (event.ph === 'X') retain(event, kind, event.dur);
    else if (event.ph === 'B') begin(event, key, kind);
    else if (event.ph === 'E') end(event, key);
  }
  return {
    add(batch) {
      if (!Array.isArray(batch)) { malformed++; return; }
      for (const event of batch) addEvent(event);
    },
    finish(baselinePageTimeMs, dataLossOccurred, captureEndPageTimeMs) {
      const open = [...stacks.values()].flat().filter(row => row.kind);
      // Stopping Chrome's trace itself starts tasks after our end mark. These
      // boundary tasks do not remove any evidence from the measured interval.
      const openDurationEvents = open.filter(row => !endAnchor || row.ts < endAnchor.at).length;
      const openBoundaryEvents = open.length - openDurationEvents;
      const aligned = !!anchor && number(baselinePageTimeMs) && baselinePageTimeMs >= 0 && !duplicateMarker;
      const covered = aligned && !!endAnchor && endAnchor.key === anchor.key && endAnchor.at >= anchor.at &&
        number(captureEndPageTimeMs) && captureEndPageTimeMs >= baselinePageTimeMs;
      const threadOf = row => `${row.pid}:${row.tid}` === anchor?.key ? 'page-main'
        : threads.get(`${row.pid}:${row.tid}`) || 'other';
      return { baselinePageTimeMs: aligned ? baselinePageTimeMs : null,
        captureEndPageTimeMs: covered ? captureEndPageTimeMs : null,
        clockDriftMs: covered ? (endAnchor.at - anchor.at) / 1000 -
          (captureEndPageTimeMs - baselinePageTimeMs) : null,
        complete: covered && !dataLossOccurred && !rowsDropped && !malformed && !stackOverflow && !openDurationEvents,
        dataLossOccurred: dataLossOccurred === true, rowsDropped, malformed, stackOverflow,
        openDurationEvents, openBoundaryEvents, subThresholdEvents,
        durationThresholdMs: 0.1, gcDurationThresholdMs: 0, gcDetail: 'top-level-pause-events',
        openIntervals: aligned ? open.slice(0, 256).map(row => ({ kind: row.kind,
          startOffsetMs: (row.ts - anchor.at) / 1000, thread: threadOf(row) })) : [],
        diagnosticOverhead: true, gpuMeaning: 'CPU-side events, not GPU hardware duration',
        rows: aligned ? rows.map(row => ({ kind: row.kind, startOffsetMs: (row.at - anchor.at) / 1000,
          durationMs: row.duration / 1000,
          thread: threadOf(row),
        })).sort((a, b) => a.startOffsetMs - b.startOffsetMs) : [] };
    },
  };
}

function bounded(operation, timeoutMs, timerClock) {
  let timer;
  return Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
    timer = timerClock.setTimeout(() => reject(new Error('frame_trace_timeout')), timeoutMs);
  })]).finally(() => timerClock.clearTimeout(timer));
}

/** Only use with an owned browser and the shared capture lock: Chrome tracing is browser-wide. */
export async function startMultiplayerFrameTrace(page, options = {}, timerClock = clock) {
  const config = limits(options);
  const collector = createFrameTraceCollector(config);
  let session;
  let ownsTrace = false;
  let abandoned = false;
  let baseline;
  let captureEnd;
  let deadline;
  let completion;
  let releasing;
  let flushResolve;
  let traceCompleteSeen = false;
  const flushed = new Promise(resolve => { flushResolve = resolve; });
  const collect = packet => collector.add(packet?.value);
  const flush = packet => { traceCompleteSeen = true; flushResolve(packet?.dataLossOccurred === true); };
  const run = operation => bounded(operation, config.commandTimeoutMs, timerClock);
  async function release() {
    if (!session) return;
    if (!releasing) {
      session.off('Tracing.dataCollected', collect);
      session.off('Tracing.tracingComplete', flush);
      releasing = run(() => session.detach());
    }
    await releasing;
  }
  // Late successful startup still belongs to this probe, not the next capture.
  const creation = Promise.resolve().then(() => page.target().createCDPSession());
  void creation.then(async late => {
    // Record ownership before consulting abandonment: the timeout may already
    // have won while its catch has not run yet. Either that catch or this late
    // handler releases the same owner, with one shared detach attempt.
    session = late;
    if (abandoned) await release();
  }, () => {}).catch(() => {});
  try {
    session = await run(() => creation);
    session.on('Tracing.dataCollected', collect);
    session.on('Tracing.tracingComplete', flush);
    const starting = Promise.resolve().then(() => session.send('Tracing.start', {
      transferMode: 'ReportEvents',
      traceConfig: { recordMode: 'recordUntilFull', traceBufferSizeInKb: 32768,
        // Verbose GPU/V8 phase categories overflowed measured WebGL captures.
        // V8 DevToolsTraceEventScope emits MinorGC/MajorGC in devtools.timeline;
        // retain those pauses without collecting disabled-by-default-v8.gc phases.
        // https://chromium.googlesource.com/v8/v8/+/master/src/heap/heap.cc
        includedCategories: ['devtools.timeline', 'blink.user_timing', 'toplevel'],
        excludedCategories: ['*'], enableArgumentFilter: true },
    }));
    void starting.then(() => {
      ownsTrace = true;
    }, () => {}).catch(() => {});
    await run(() => starting);
    baseline = await run(() => page.evaluate(() => {
      const name = 'cot-multiplayer-trace-start';
      performance.clearMarks(name);
      const entry = performance.mark(name);
      performance.clearMarks(name);
      return entry.startTime;
    }));
    if (!number(baseline) || baseline < 0) throw new Error('frame_trace_invalid_clock');
  } catch {
    abandoned = true;
    if (ownsTrace) { try { await run(() => session.send('Tracing.end')); } catch { /* fixed error below */ } }
    try { await release(); } catch { /* fixed error below */ }
    throw new Error('frame_trace_start_failed');
  }
  function stop(reason = 'manual') {
    if (completion) return completion;
    timerClock.clearTimeout(deadline);
    completion = (async () => {
      let traceStage = 'end-mark';
      let primaryFailure;
      const completeBeforeStop = traceCompleteSeen;
      try {
        captureEnd = await run(() => page.evaluate(() => {
          const name = 'cot-multiplayer-trace-end';
          performance.clearMarks(name);
          const entry = performance.mark(name);
          performance.clearMarks(name);
          return entry.startTime;
        }));
        traceStage = 'end-command';
        await run(() => session.send('Tracing.end'));
        traceStage = 'flush';
        // Full-game trace export is substantially larger than a command reply.
        // Its separate bounded budget is AFTER the sample and cannot hide a slow frame.
        const loss = await bounded(() => flushed, config.flushTimeoutMs, timerClock);
        return { ...collector.finish(baseline, loss, captureEnd), stopReason: reason, completeBeforeStop };
      } catch (error) {
        const traceFailure = error?.message === 'frame_trace_timeout' ? 'timeout'
          : typeof error?.message === 'string' && /Tracing is not started/.test(error.message)
            ? 'not-started' : 'protocol-or-target-error';
        primaryFailure = Object.assign(new Error('frame_trace_stop_failed'), { traceStage, traceFailure, completeBeforeStop });
        throw primaryFailure;
      }
      finally {
        try { await release(); }
        catch {
          if (primaryFailure) primaryFailure.cleanupFailed = true;
          else throw Object.assign(new Error('frame_trace_cleanup_failed'), { cleanupFailed: true });
        }
      }
    })();
    void completion.catch(() => {});
    return completion;
  }
  deadline = timerClock.setTimeout(() => { void stop('deadline'); }, config.durationMs);
  return { stop };
}
