import { withGarageActionProfile } from './garage-action-timing.mjs';

const clock = { setTimeout, clearTimeout };

function bounded(operation, milliseconds, timers) {
  return new Promise((resolve, reject) => {
    const timer = timers.setTimeout(() => reject(new Error('Gameplay profile command timed out')), milliseconds);
    Promise.resolve().then(operation).then(resolve, reject).finally(() => timers.clearTimeout(timer));
  });
}

/** Raw CPU sampling envelope; the sampler's exact page-clock edges identify
 * gameplay within it. Early mode starts before entry, never at control release.
 * Reuses the maintained action profiler, not coverage, tracing, or new polling.
 */
export async function startPerfWindowProfile(page, {
  writeProfile, timeoutMs, timers = clock,
}) {
  const receipt = { requested: true, diagnosticOverhead: true, status: 'starting',
    completedWindow: false, cleanupErrors: [], rawProfile: null,
    caveat: 'Statistical CPU samples are not exact function/GPU durations. The raw envelope includes its page-clock brackets; analyze only explicit gameplay edges for gameplay claims.' };
  let session, abandoned = false;
  const creation = Promise.resolve().then(() => page.target().createCDPSession());
  void creation.then(async value => {
    if (abandoned) await bounded(() => value.detach(), 5000, timers);
  }).catch(() => {});
  try { session = await bounded(() => creation, 5000, timers); }
  catch (error) { abandoned = true; throw error; }

  let resolveStarted, rejectStarted, resolveWindow, rejectWindow, timer;
  const started = new Promise((resolve, reject) => { resolveStarted = resolve; rejectStarted = reject; });
  const windowDone = new Promise((resolve, reject) => { resolveWindow = resolve; rejectWindow = reject; });
  void windowDone.catch(() => {});
  const commandPage = { evaluate: fn => bounded(() => page.evaluate(fn), 5000, timers) };
  const cdp = { send: command => bounded(() => session.send(command), 5000, timers) };
  const capture = withGarageActionProfile({
    page: commandPage, cdp, enabled: true, action: 'gameplay-window',
    onProfile: async (profile, alignment) => {
      receipt.alignment = alignment;
      receipt.rawProfile = await writeProfile(profile);
    },
    onCleanupError: error => receipt.cleanupErrors.push(String(error)),
  }, async () => {
    receipt.status = 'recording';
    resolveStarted();
    timer = timers.setTimeout(() => rejectWindow(new Error('Gameplay profile envelope timed out')), timeoutMs);
    await windowDone;
  });
  const completion = capture.then(() => { receipt.status = 'complete'; }, error => {
    receipt.status = 'failed'; receipt.error = String(error); rejectStarted(error);
  }).finally(async () => {
    timers.clearTimeout(timer);
    try { await bounded(() => session.detach(), 5000, timers); }
    catch (error) { receipt.cleanupErrors.push(String(error)); }
    if (receipt.cleanupErrors.length) receipt.status = 'failed';
  });
  await started.catch(async error => { await completion; throw error; });
  let stopping;
  return { receipt, readPage: fn => commandPage.evaluate(fn),
    stop(edges = null, failure = null) {
      if (!stopping) {
        receipt.window = edges;
        receipt.completedWindow = !!edges?.done && failure == null;
        if (failure) rejectWindow(new Error(String(failure)));
        else resolveWindow();
        stopping = completion.then(() => receipt);
      }
      return stopping;
    },
  };
}

/** Installed only for --profile-window. Receives the *existing* sampler's RAF
 * callbacks: no second loop, renderer mutation, or per-frame DOM inspection.
 */
export function installPerfWindowTiming() {
  const limit = 512;
  const evidence = { longTaskSupported: false, longTaskError: null, longTasks: [], longTasksDropped: 0,
    callbackGaps: [], callbackGapsDropped: 0, worstCallbackGap: null, callbackSamples: 0,
    startPageMs: null, endPageMs: null, startRafMs: null, endRafMs: null, complete: false };
  let observer = null, previous = null;
  const collect = entries => {
    if (evidence.startPageMs == null) return;
    const end = evidence.endPageMs ?? Infinity;
    for (const entry of entries) {
      const endMs = entry.startTime + entry.duration;
      if (endMs <= evidence.startPageMs || entry.startTime >= end) continue;
      if (evidence.longTasks.length >= limit) { evidence.longTasksDropped++; continue; }
      evidence.longTasks.push({ startMs: entry.startTime, endMs, durationMs: entry.duration,
        name: entry.name, straddlesStart: entry.startTime < evidence.startPageMs,
        straddlesEnd: endMs > end,
        attributionDropped: Math.max(0, (entry.attribution?.length ?? 0) - 8),
        attribution: Array.from(entry.attribution || []).slice(0, 8).map(item => ({
          name: item.name, containerType: item.containerType, containerName: item.containerName?.slice(0, 256),
          containerId: item.containerId?.slice(0, 256), containerSrc: item.containerSrc?.slice(0, 512),
        })) });
    }
  };
  const begin = () => {
    try {
      evidence.longTaskSupported = typeof PerformanceObserver !== 'undefined'
        && PerformanceObserver.supportedEntryTypes.includes('longtask');
      if (evidence.longTaskSupported) {
        observer = new PerformanceObserver(list => collect(list.getEntries()));
        observer.observe({ type: 'longtask', buffered: true });
      }
    } catch (error) { evidence.longTaskSupported = false; evidence.longTaskError = String(error); }
  };
  window.__PERF_WINDOW_TIMING = {
    evidence,
    start(rafMs, pageMs) {
      evidence.startRafMs = rafMs; evidence.startPageMs = pageMs;
    },
    frame(rafMs, pageMs) {
      const current = { rafMs, pageMs, phase: window.__DEBUG?.game?.phase ?? null,
        preBattleS: window.__DEBUG?.game?.preBattleS ?? null,
        hidden: document.hidden, visibilityState: document.visibilityState };
      evidence.callbackSamples++;
      if (previous) {
        const gap = { startMs: previous.pageMs, endMs: pageMs, durationMs: pageMs - previous.pageMs,
          before: previous, after: current };
        if (!evidence.worstCallbackGap || gap.durationMs > evidence.worstCallbackGap.durationMs) evidence.worstCallbackGap = gap;
        if (gap.durationMs >= 50) {
          if (evidence.callbackGaps.length < limit) evidence.callbackGaps.push(gap);
          else evidence.callbackGapsDropped++;
        }
      }
      previous = current;
    },
    end(rafMs, pageMs) { evidence.endRafMs = rafMs; evidence.endPageMs = pageMs; evidence.complete = true; },
    finish() {
      collect(observer?.takeRecords() || []);
      observer?.disconnect();
      for (const task of evidence.longTasks) {
        task.straddlesEnd = evidence.endPageMs != null && task.endMs > evidence.endPageMs;
      }
      return evidence;
    },
  };
  begin(); // Before arming/entry, never an observer startup at control release.
}
