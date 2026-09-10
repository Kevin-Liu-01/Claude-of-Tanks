// Serialized into the owned probe page. Keep this function self-contained.
export function installGarageActionTiming() {
  const LIMIT = 512;
  let row = null, selector = '', lastFrame = 0, lastCallback = 0, lastContext = null, raf = 0;
  let taskObserver = null;
  let taskSupport = false;
  let taskObservationError = null;
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
    const ready = row.action === 'return-to-garage'
      ? d.game.phase === 'garage' && painted(document.querySelector('.cot-garage'))
        && d.pedestalOnStage && d.pedestalVisual?.specId === row.before.selectedSpecId
      : d.game.phase === 'battle' && !d.game.result && d.game.preBattleS <= 0
        && d.game.battleCount === row.before.battleOrdinal + 1;
    if (ready && uncovered) {
      row.totalMs = now - row.clickedAt;
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
  const finish = () => {
    collectTasks(taskObserver?.takeRecords() || []);
    if (!row) return null;
    row.diagnosticsCapturedAtMs = performance.now();
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
    } : { available: false, rescue: null, errors: null };
    return row;
  };
  document.addEventListener('click', onClick, true);
  document.addEventListener('visibilitychange', onVisibility);
  raf = requestAnimationFrame(tick);
  window.__ACTION_TRACE = {
    arm(action, target) {
      selector = target;
      previousAudio = null;
      row = { action, clickedAt: null, trusted: false, coverMs: null, totalMs: null, maxFrameGapMs: 0,
        audio: audioReceipt(),
        callbackSamples: 0, worstCallbackGap: null, frameGaps: [], frameGapsDropped: 0,
        longTaskSupported: taskSupport, longTaskObservationError: taskObservationError,
        longTasks: [], longTasksDropped: 0, visibilityEvents: [], visibilityEventsDropped: 0 };
    },
    done: () => row?.totalMs != null,
    finish,
    stop() {
      cancelAnimationFrame(raf);
      taskObserver?.disconnect();
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
  return { available: true, interval: 'callback-start-to-callback-start',
    worstGapStartMs: gap.startMs, worstGapEndMs: gap.endMs, worstGapMs: gap.durationMs,
    overlappingLongTaskCount: row.longTaskSupported ? tasks.length : null,
    overlappingLongTaskMs: overlap,
    unattributedGapMs: overlap == null ? null : Math.max(0, gap.durationMs - overlap),
    longTaskEvidenceIncomplete: !row.longTaskSupported || row.longTasksDropped > 0,
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
