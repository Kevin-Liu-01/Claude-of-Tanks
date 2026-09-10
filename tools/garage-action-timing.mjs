// Serialized into the owned probe page. Keep this function self-contained.
export function installGarageActionTiming({ canvasActions = false } = {}) {
  const LIMIT = 512;
  let row = null, selector = '', lastFrame = 0, lastCallback = 0, lastContext = null, raf = 0;
  let canvasOwner = null;
  let taskObserver = null;
  let taskSupport = false;
  let taskObservationError = null;
  let animationObserver = null, animationSupport = false, animationError = null, animationStopped = false;
  const finite = value => Number.isFinite(value) ? value : null;
  const text = value => typeof value === 'string' ? value.slice(0, 512) : null;
  const finishCanvas = reason => {
    const owner = canvasOwner;
    if (!owner) return;
    canvasOwner = null;
    owner.recording = false;
    const receipt = owner.receipt;
    for (const { prototype, method, descriptor, wrapper } of owner.wrappers) {
      try {
        if (Object.getOwnPropertyDescriptor(prototype, method)?.value !== wrapper) {
          receipt.cleanup.notOwned.push(method);
        } else {
          Object.defineProperty(prototype, method, descriptor);
          receipt.cleanup.restored.push(method);
        }
      } catch { receipt.cleanup.failed.push(method); }
    }
    receipt.observationErrors = owner.errors;
    receipt.endMs = row?.totalMs == null ? null : row.clickedAt + row.totalMs;
    receipt.closed = true;
    receipt.stopReason = reason;
    receipt.completeCoverage = reason === 'finish' && row.trusted && receipt.endMs != null
      && receipt.available && !receipt.rowsDropped && !receipt.invalid && !owner.errors
      && !receipt.cleanup.notOwned.length && !receipt.cleanup.failed.length;
  };
  const armCanvas = () => {
    if (!canvasActions) return;
    const receipt = { protocol: 'garage-canvas-actions-v1', scope: 'main-page-canvas2d-prototype',
      available: false, completeCoverage: false, closed: false, startMs: null, endMs: null,
      rowLimit: 1024, rows: [], rowsDropped: 0, invalid: 0, observationErrors: 0,
      methods: {}, cleanup: { restored: [], notOwned: [], failed: [] } };
    row.canvasActions = receipt;
    const owner = canvasOwner = { receipt, wrappers: [], recording: false, errors: 0 };
    for (const method of ['getImageData', 'putImageData', 'drawImage']) {
      const stats = receipt.methods[method] = { available: false, calls: 0, nativeErrors: 0,
        totalMs: 0, maxMs: null };
      try {
        const prototype = globalThis.CanvasRenderingContext2D?.prototype;
        const descriptor = prototype && Object.getOwnPropertyDescriptor(prototype, method);
        if (typeof descriptor?.value !== 'function') continue;
        const original = descriptor.value;
        const wrapper = function (...args) {
          if (!owner.recording) return Reflect.apply(original, this, args);
          let startMs = null, threw = true;
          try { startMs = performance.now(); } catch { owner.errors++; }
          try {
            const result = Reflect.apply(original, this, args);
            threw = false;
            return result;
          } finally {
            // Logging must never replace a result or any thrown JS value.
            let endMs = null;
            try { endMs = performance.now(); } catch { owner.errors++; }
            try {
              stats.calls++;
              if (threw) stats.nativeErrors++;
              if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
                const durationMs = endMs - startMs;
                stats.totalMs += durationMs;
                stats.maxMs = Math.max(stats.maxMs ?? 0, durationMs);
                if (receipt.rows.length < receipt.rowLimit) {
                  receipt.rows.push({ method, startMs, endMs, durationMs, threw });
                } else receipt.rowsDropped++;
              } else receipt.invalid++;
            } catch { owner.errors++; }
          }
        };
        Object.defineProperty(prototype, method, { ...descriptor, value: wrapper });
        owner.wrappers.push({ prototype, method, descriptor, wrapper });
        stats.available = true;
      } catch { owner.errors++; }
    }
    receipt.available = Object.values(receipt.methods).every(stats => stats.available);
    if (!owner.wrappers.length) receipt.rows = null;
  };
  const failAnimation = error => {
    animationSupport = false;
    animationError = String(error).slice(0, 512);
    if (row) {
      row.longAnimationFrameSupported = false;
      row.longAnimationFrameObservationError = animationError;
      if (!row.longAnimationFrames?.length) row.longAnimationFrames = null;
    }
    try { animationObserver?.disconnect(); } catch { /* Preserve the first diagnostic failure. */ }
  };
  const copyAnimationScript = script => {
    // Empty source locations are explicitly unattributed, not foreign URLs.
    if (script.sourceURL) {
      try {
        if (script.sourceURL.length > 2048
          || new URL(script.sourceURL).origin !== window.location.origin) return null;
      } catch { return null; }
    }
    return { sourceURL: text(script.sourceURL), sourceFunctionName: text(script.sourceFunctionName),
      sourceCharPosition: finite(script.sourceCharPosition), invoker: text(script.invoker),
      invokerType: text(script.invokerType), windowAttribution: text(script.windowAttribution),
      startTime: finite(script.startTime), duration: finite(script.duration),
      executionStart: finite(script.executionStart),
      forcedStyleAndLayoutDuration: finite(script.forcedStyleAndLayoutDuration),
      pauseDuration: finite(script.pauseDuration) };
  };
  const collectAnimations = entries => {
    if (animationStopped || !animationSupport || !row?.trusted || row.clickedAt == null) return;
    const end = row.totalMs == null ? Infinity : row.clickedAt + row.totalMs;
    for (const entry of entries) {
      const startTime = finite(entry.startTime), duration = finite(entry.duration);
      if (startTime == null || duration == null || duration < 0 || !Number.isFinite(startTime + duration)) {
        row.longAnimationFramesDropped++; row.longAnimationFramesInvalid++; continue;
      }
      if (startTime + duration <= row.clickedAt || startTime >= end) continue;
      if (row.longAnimationFrames.length >= 128) { row.longAnimationFramesDropped++; continue; }
      const scripts = [], inputs = entry.scripts ?? [];
      let scriptsFiltered = 0;
      for (let index = 0; index < Math.min(inputs.length, 32); index++) {
        const script = copyAnimationScript(inputs[index]);
        if (script) scripts.push(script); else scriptsFiltered++;
      }
      row.longAnimationFrames.push({ startTime, duration,
        renderStart: finite(entry.renderStart), styleAndLayoutStart: finite(entry.styleAndLayoutStart),
        blockingDuration: finite(entry.blockingDuration), firstUIEventTimestamp: finite(entry.firstUIEventTimestamp),
        scripts, scriptsDropped: Math.max(0, inputs.length - 32), scriptsFiltered });
    }
  };
  const drainAnimations = () => {
    try { collectAnimations(animationObserver?.takeRecords() || []); }
    catch (error) { failAnimation(error); }
  };
  const audioContextIds = new WeakMap();
  let audioContextSerial = 0, previousAudio = null;
  const audioReceipt = () => ({ samples: [], samplesDropped: 0, unavailableSamples: 0,
    loadingActiveObserved: false, runningClockWitness: null, coveredLoadingClockWitness: null,
    last: null, completion: null, observationErrors: [] });
  const snapshot = () => {
    const d = window.__DEBUG;
    return { phase: d.game.phase, battleOrdinal: d.game.battleCount,
      selectedSpecId: d.selectedSpecId, selectedMapId: d.garage.getSelectedMap(),
      playerSpecId: d.game.player?.specId ?? null, mapId: d.game.mapId,
      pedestalSpecId: d.pedestalVisual?.specId ?? null,
      roster: d.game.tanks.map(t => ({ id: t.id, specId: t.specId, team: t.team })) };
  };
  const painted = element => !!element && element.getClientRects().length > 0
    && Number(getComputedStyle(element).opacity) >= 0.95;
  const observeAudio = (now, transition, battleLoad) => {
    const api = window.__COT_AUDIO, ctx = api?.ctx;
    if (!ctx || (typeof ctx !== 'object' && typeof ctx !== 'function')) {
      row.audio.unavailableSamples++;
      row.audio.last = previousAudio = null;
      return;
    }
    if (!audioContextIds.has(ctx)) audioContextIds.set(ctx, ++audioContextSerial);
    const sample = { atMs: now, contextId: audioContextIds.get(ctx), state: ctx.state,
      currentTimeS: Number.isFinite(ctx.currentTime) ? ctx.currentTime : null,
      loadingActive: typeof api.loadingActive === 'boolean' ? api.loadingActive : null,
      covered: painted(transition) || painted(battleLoad) };
    row.audio.loadingActiveObserved ||= sample.loadingActive === true;
    const advances = previousAudio?.contextId === sample.contextId
      && previousAudio.state === 'running' && sample.state === 'running'
      && previousAudio.currentTimeS != null && sample.currentTimeS != null
      && sample.currentTimeS > previousAudio.currentTimeS;
    if (advances) {
      const witness = { before: previousAudio, after: sample };
      row.audio.runningClockWitness ??= witness;
      if (previousAudio.loadingActive && sample.loadingActive && previousAudio.covered && sample.covered) {
        row.audio.coveredLoadingClockWitness ??= witness;
      }
    }
    if (row.audio.samples.length < 64) row.audio.samples.push(sample);
    else row.audio.samplesDropped++;
    row.audio.last = previousAudio = sample;
  };
  const finishAudio = () => {
    try {
      const ambientActive = window.__COT_AUDIO?.ambientState?.()?.active;
      row.audio.completion = { ...row.audio.last,
        ambientActive: typeof ambientActive === 'boolean' ? ambientActive : null };
    } catch (error) { row.audio.observationErrors.push(String(error)); }
  };
  const context = (transition, battleLoad) => ({
    phase: window.__DEBUG?.game?.phase ?? null,
    preBattleS: window.__DEBUG?.game?.preBattleS ?? null,
    transitionPresent: !!transition, battleLoaderPresent: !!battleLoad,
    loaderStage: battleLoad?.querySelector('.fstage')?.textContent?.slice(0, 160) ?? null,
    deferredWarmDone: window.__BATTLE_DEFERRED_WARM?.done ?? null,
    deferredWarmGeneration: window.__BATTLE_DEFERRED_WARM?.generation ?? null,
    visibilityState: document.visibilityState, hidden: document.hidden,
    focused: document.hasFocus(),
  });
  const collectTasks = entries => {
    if (!row || row.clickedAt == null) return;
    const end = row.totalMs == null ? Infinity : row.clickedAt + row.totalMs;
    for (const entry of entries) {
      if (entry.startTime + entry.duration <= row.clickedAt || entry.startTime >= end) continue;
      if (row.longTasks.length >= LIMIT) { row.longTasksDropped++; continue; }
      row.longTasks.push({ startMs: entry.startTime, endMs: entry.startTime + entry.duration,
        durationMs: entry.duration, name: entry.name,
        attribution: Array.from(entry.attribution || []).slice(0, 8).map(item => ({
          name: item.name, containerType: item.containerType,
          containerName: item.containerName?.slice(0, 256),
          containerId: item.containerId?.slice(0, 256), containerSrc: item.containerSrc?.slice(0, 512),
        })) });
    }
  };
  try {
    taskSupport = typeof PerformanceObserver !== 'undefined'
      && PerformanceObserver.supportedEntryTypes.includes('longtask');
    if (taskSupport) {
      taskObserver = new PerformanceObserver(list => collectTasks(list.getEntries()));
      taskObserver.observe({ type: 'longtask', buffered: true });
    }
  } catch (error) { taskSupport = false; taskObservationError = String(error); }
  // Independent observer: LoAF support/failure never changes the LongTask gate.
  // renderStart includes rAF/style/layout work; it is NOT a GPU timestamp.
  try {
    animationSupport = typeof PerformanceObserver !== 'undefined'
      && PerformanceObserver.supportedEntryTypes.includes('long-animation-frame');
    if (animationSupport) {
      animationObserver = new PerformanceObserver(list => {
        if (animationStopped) return;
        try { collectAnimations(list.getEntries()); } catch (error) { failAnimation(error); }
      });
      animationObserver.observe({ type: 'long-animation-frame', buffered: true });
    }
  } catch (error) {
    failAnimation(error);
    try { animationObserver?.disconnect(); } catch { /* Retain the original observer failure. */ }
  }

  const sampleGap = (now, nextContext) => {
    // Preserve the original end-of-sample→next-callback diagnostic. The new
    // interval explicitly measures callback-start→callback-start instead.
    row.maxFrameGapMs = Math.max(row.maxFrameGapMs, now - lastFrame);
    const gap = { startMs: lastCallback, endMs: now, durationMs: now - lastCallback,
      before: lastContext, after: nextContext };
    row.callbackSamples++;
    if (!row.worstCallbackGap || gap.durationMs > row.worstCallbackGap.durationMs) {
      row.worstCallbackGap = gap;
    }
    if (gap.durationMs >= 50) {
      if (row.frameGaps.length < LIMIT) row.frameGaps.push(gap);
      else row.frameGapsDropped++;
    }
  };
  const state = now => {
    const d = window.__DEBUG;
    if (!row || row.clickedAt == null || row.totalMs != null) return;
    const transition = document.querySelector('.cot-trans.on');
    const battleLoad = document.querySelector('.cot-bl.on, .cot-bl.leaving');
    const nextContext = context(transition, battleLoad);
    if (row.coverMs == null && (painted(transition) || painted(battleLoad))) {
      row.coverMs = now - row.clickedAt;
    }
    try { observeAudio(now, transition, battleLoad); }
    catch (error) {
      if (row.audio.observationErrors.length < 8) row.audio.observationErrors.push(String(error));
      previousAudio = row.audio.last = null;
    }
    sampleGap(now, nextContext);
    lastContext = nextContext;
    const uncovered = !transition && !battleLoad;
    window.__SOURCE_READINESS?.observe(now, uncovered);
    const ready = row.action === 'return-to-garage'
      ? d.game.phase === 'garage' && painted(document.querySelector('.cot-garage'))
        && d.pedestalOnStage && d.pedestalVisual?.specId === row.before.selectedSpecId
      : d.game.phase === 'battle' && !d.game.result && d.game.preBattleS <= 0
        && d.game.battleCount === row.before.battleOrdinal + 1;
    if (ready && uncovered) {
      row.totalMs = now - row.clickedAt;
      if (canvasOwner) canvasOwner.recording = false;
      row.after = snapshot();
      finishAudio();
    }
  };
  const tick = () => {
    const now = performance.now();
    state(now);
    lastCallback = now;
    lastFrame = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const onClick = event => {
    if (!row || row.clickedAt != null || !(event.target instanceof Element)
      || !event.target.closest(selector)) return;
    row.clickedAt = performance.now();
    row.trusted = event.isTrusted;
    if (canvasOwner) {
      canvasOwner.recording = event.isTrusted === true;
      canvasOwner.receipt.startMs = row.clickedAt;
    }
    row.before = snapshot();
    lastCallback = lastFrame = row.clickedAt;
    lastContext = context(document.querySelector('.cot-trans.on'),
      document.querySelector('.cot-bl.on, .cot-bl.leaving'));
  };
  const onVisibility = () => {
    if (!row || row.clickedAt == null || row.totalMs != null) return;
    if (row.visibilityEvents.length >= 64) { row.visibilityEventsDropped++; return; }
    row.visibilityEvents.push({ atMs: performance.now(),
      visibilityState: document.visibilityState, hidden: document.hidden, focused: document.hasFocus() });
  };
  const copyTrace = name => {
    const value = window[name];
    if (value == null) return null;
    try { return JSON.parse(JSON.stringify(value)); }
    catch (error) { return { captureError: String(error) }; }
  };
  const copySceneWatchdogs = history => {
    if (!history) return { available: false, rows: null };
    try {
      const numeric = (value, keys) => Object.fromEntries(keys.map(key => [key, finite(value?.[key])]));
      const rows = Array.isArray(history.rows) ? history.rows : [];
      return { available: true, rowLimit: 16, rowsDropped: finite(history.rowsDropped),
        captureRowsDropped: Math.max(0, rows.length - 16),
        caveat: 'Wall-clock stage timings, not GPU duration. Async wait includes task delay; sync rows are fresh fallback/rescue measurements. Match absolute timestamps to the action; retained rows can belong to earlier entries.',
        rows: rows.slice(-16).map(value => ({
          ...numeric(value, ['id', 'delayMs', 'queuedAtMs', 'startedAtMs', 'endedAtMs']),
          status: text(value.status), error: text(value.error), captureError: text(value.captureError),
          context: { phase: text(value.context?.phase), mapId: text(value.context?.mapId),
            entryGeneration: finite(value.context?.entryGeneration) },
          result: value.result ? { ...numeric(value.result, ['before', 'after', 'nightRadianceScale']),
            rescued: value.result.rescued === true, failed: value.result.failed === true,
            stage: text(value.result.stage) } : null,
          measurementsDropped: Math.max(0, (value.measurements?.length ?? 0) - 8),
          measurements: (Array.isArray(value.measurements) ? value.measurements : []).slice(0, 8).map(measurement => ({
            kind: text(measurement.kind), error: text(measurement.error),
            ...numeric(measurement, ['startTime', 'endTime', 'setupMs', 'renderMs', 'readbackMs',
              'enqueueMs', 'waitMs', 'reduceMs', 'restoreMs', 'programsBeforeRender', 'programsAfterRender']),
            readbackSteps: measurement.readbackSteps ? numeric(measurement.readbackSteps,
              ['contextQuery', 'createBuffer', 'bindingQuery', 'bindBuffer', 'bufferData', 'sizeQuery',
                'readPixels', 'fence', 'flush', 'wait', 'copy', 'release']) : null,
          })),
        })),
      };
    } catch (error) { return { available: true, rows: null, captureError: String(error).slice(0, 512) }; }
  };
  const finish = () => {
    finishCanvas('finish'); // Restore even if unrelated diagnostic collection fails.
    collectTasks(taskObserver?.takeRecords() || []);
    drainAnimations();
    if (!row) return null;
    row.diagnosticsCapturedAtMs = performance.now();
    if (window.__SOURCE_READINESS) row.sourceReadiness = window.__SOURCE_READINESS.finish();
    row.loadingTraces = {};
    for (const name of ['__BATTLE_LOAD', '__BATTLE_COUNTDOWN_WARM', '__COMBAT_OPENING_WARM',
      '__BATTLE_DEFERRED_WARM', '__COMBAT_RARE_WARM', '__COMBAT_WARM',
      '__START_BATTLE_TIMINGS', '__VISUAL_LOAD_TIMINGS', '__WORLD_LOAD', '__GARAGE_ENTRY', '__BATTLE_REVEAL']) {
      row.loadingTraces[name] = copyTrace(name);
    }
    const gl = window.__GL_DIAG;
    row.graphicsDiagnostics = gl ? {
      available: true, rescue: gl.rescue ?? null,
      // This bag includes shader failures AND diagnostic rescue notices.
      errors: Array.from(gl.errors || []).slice(0, 32).map(error => String(error).slice(0, 4096)),
      sceneWatchdogs: copySceneWatchdogs(gl.sceneWatchdogs),
    } : { available: false, rescue: null, errors: null, sceneWatchdogs: { available: false, rows: null } };
    return row;
  };
  document.addEventListener('click', onClick, true);
  document.addEventListener('visibilitychange', onVisibility);
  raf = requestAnimationFrame(tick);
  window.__ACTION_TRACE = {
    arm(action, target) {
      finishCanvas('rearmed');
      drainAnimations(); // Pending old-window records must not follow a rearm.
      selector = target;
      window.__SOURCE_READINESS?.arm(action);
      previousAudio = null;
      row = { action, clickedAt: null, trusted: false, coverMs: null, totalMs: null, maxFrameGapMs: 0,
        audio: audioReceipt(),
        callbackSamples: 0, worstCallbackGap: null, frameGaps: [], frameGapsDropped: 0,
        longTaskSupported: taskSupport, longTaskObservationError: taskObservationError,
        longAnimationFrameSupported: animationSupport, longAnimationFrameObservationError: animationError,
        longAnimationFrames: animationSupport ? [] : null,
        longAnimationFramesDropped: 0, longAnimationFramesInvalid: 0,
        longTasks: [], longTasksDropped: 0, visibilityEvents: [], visibilityEventsDropped: 0 };
      armCanvas();
    },
    done: () => row?.totalMs != null,
    finish,
    stop() {
      finishCanvas('stopped');
      cancelAnimationFrame(raf);
      window.__SOURCE_READINESS?.stop();
      taskObserver?.disconnect();
      if (!animationStopped) {
        drainAnimations();
        animationStopped = true;
        try { animationObserver?.disconnect(); } catch (error) { failAnimation(error); }
      }
      previousAudio = null;
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

function taskOverlapMs(gap, tasks) {
  const intervals = tasks.map(task => [Math.max(gap.startMs, task.startMs), Math.min(gap.endMs, task.endMs)])
    .filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0]);
  let total = 0, until = gap.startMs;
  for (const [start, end] of intervals) {
    total += Math.max(0, end - Math.max(start, until));
    until = Math.max(until, end);
  }
  return total;
}

export function summarizeGarageActionTiming(row) {
  const gap = row.worstCallbackGap;
  if (!gap) return { available: false };
  const tasks = row.longTasks.filter(task => task.startMs < gap.endMs && task.endMs > gap.startMs);
  const overlap = row.longTaskSupported ? taskOverlapMs(gap, tasks) : null;
  const animations = row.longAnimationFrameSupported && row.trusted
    ? row.longAnimationFrames.filter(frame => frame.startTime < gap.endMs
      && frame.startTime + frame.duration > gap.startMs) : null;
  return { available: true, interval: 'callback-start-to-callback-start',
    worstGapStartMs: gap.startMs, worstGapEndMs: gap.endMs, worstGapMs: gap.durationMs,
    overlappingLongTaskCount: row.longTaskSupported ? tasks.length : null,
    overlappingLongTaskMs: overlap,
    unattributedGapMs: overlap == null ? null : Math.max(0, gap.durationMs - overlap),
    longTaskEvidenceIncomplete: !row.longTaskSupported || row.longTasksDropped > 0,
    overlappingLongAnimationFrameCount: animations?.length ?? null,
    overlappingLongAnimationFrames: animations,
    longAnimationFrameEvidenceIncomplete: !animations || row.longAnimationFramesDropped > 0
      || animations.some(frame => frame.scriptsDropped > 0 || frame.scriptsFiltered > 0),
    longAnimationFrameCaveat: 'LoAF intervals may combine multiple short tasks and rendering work. Script locations identify entry points, not sampled hot functions; missing attribution is not idle. Rendering timing is not GPU duration or presentation acknowledgement.',
    hiddenAtEitherEndpoint: !!(gap.before?.hidden || gap.after?.hidden),
    visibilityEventsWithinGap: row.visibilityEvents.filter(event => event.atMs >= gap.startMs && event.atMs <= gap.endMs),
    caveat: 'Long-task overlap is main-thread scheduling evidence, not a JS function or GPU-duration attribution. Unattributed time does not identify OS/GPU/visibility as its cause.' };
}

/** Opt-in attribution only. Never profiles setup, screenshots or result staging. */
export async function withGarageActionProfile({
  page, cdp, enabled, action, onProfile, onCleanupError,
}, work) {
  if (!enabled) return work();
  let enabledProfiler = false, started = false, primaryError = null;
  const capture = { action, attributionOnly: true, completedAction: false,
    alignment: 'Profile start lies between beforeStartPageMs and afterStartPageMs; page clocks use performance.now milliseconds.' };
  try {
    await cdp.send('Profiler.enable');
    enabledProfiler = true;
    capture.beforeStartPageMs = await page.evaluate(() => performance.now());
    await cdp.send('Profiler.start');
    started = true;
    capture.afterStartPageMs = await page.evaluate(() => performance.now());
    const result = await work();
    capture.completedAction = true;
    return result;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    let cleanupError = null;
    try {
      if (started) {
        // An unavailable page clock must not prevent releasing the profiler.
        capture.beforeStopPageMs = await page.evaluate(() => performance.now()).catch(() => null);
        const { profile } = await cdp.send('Profiler.stop');
        capture.afterStopPageMs = await page.evaluate(() => performance.now()).catch(() => null);
        await onProfile(profile, capture);
      }
    } catch (error) { cleanupError = error; }
    if (enabledProfiler) {
      try { await cdp.send('Profiler.disable'); }
      catch (error) { cleanupError ??= error; }
    }
    if (cleanupError) {
      if (primaryError) onCleanupError(cleanupError);
      else throw cleanupError;
    }
  }
}

function garageActionTraceWindow(trace) {
  return { traceComplete: trace?.complete === true,
    baselinePageTimeMs: trace?.baselinePageTimeMs ?? null,
    captureEndPageTimeMs: trace?.captureEndPageTimeMs ?? null,
    clockDriftMs: trace?.clockDriftMs ?? null, rowsRecorded: trace?.rows?.length ?? null,
    rowsDropped: trace?.rowsDropped ?? null, dataLossOccurred: trace?.dataLossOccurred ?? null };
}

/** Bounded timeline attribution, separate from functional/readiness acceptance. */
export async function withGarageActionTrace({
  page, enabled, action, startTrace, onTrace, onOwner, onCleanupError,
}, work) {
  if (!enabled) return work();
  let owner = null, completion = null, actionFailed = false, result = null;
  const capture = { action, protocol: 'garage-action-frame-trace-v1', attributionOnly: true,
    durationLimitMs: 30000, completedAction: false };
  const stop = reason => {
    if (completion) return completion;
    completion = (async () => {
      let trace = null, failure = null;
      try { if (owner) trace = await owner.stop(reason); }
      catch { failure = new Error('action_trace_stop_failed'); }
      const clickedAt = result?.clickedAt, endedAt = clickedAt + result?.totalMs;
      const coversAction = Number.isFinite(clickedAt) && Number.isFinite(endedAt)
        && Number.isFinite(result?.totalMs) && result.totalMs >= 0
        && Number.isFinite(trace?.baselinePageTimeMs) && Number.isFinite(trace?.captureEndPageTimeMs)
        && trace.baselinePageTimeMs <= clickedAt && trace.captureEndPageTimeMs >= endedAt;
      const stopReason = trace?.stopReason ?? reason;
      Object.assign(capture, { ...garageActionTraceWindow(trace),
        completeForAction: capture.completedAction && coversAction && trace?.complete === true
          && stopReason === 'action-complete',
        censored: !capture.completedAction || !coversAction || stopReason !== 'action-complete',
        stopReason, observationError: failure ? failure.message : owner ? null : 'action_trace_start_failed' });
      // The collector already strips raw URLs, arguments, stacks and identities.
      try { await onTrace(trace, { ...capture }); }
      catch { failure ??= new Error('action_trace_write_failed'); }
      if (failure) throw failure;
    })();
    return completion;
  };
  try {
    owner = await startTrace(page, { durationMs: capture.durationLimitMs });
    onOwner?.({ stop });
    result = await work();
    capture.completedAction = true;
    return result;
  } catch (error) {
    actionFailed = true;
    throw error;
  } finally {
    try { await stop(actionFailed ? 'action-failed' : 'action-complete'); }
    catch (error) { if (actionFailed) onCleanupError(error); else throw error; }
    finally { onOwner?.(null); }
  }
}
