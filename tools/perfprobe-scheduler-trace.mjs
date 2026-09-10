/** Opt-in, bounded diagnostic using the runtime's actual scheduling decisions.
 * No extra RAF, CDP polling, renderer mutation, or admission policy changes.
 * Self-contained because Puppeteer serializes this function into the page.
 */
export function installPerfSchedulerTrace({ capacity = 30000 } = {}) {
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 30000) throw new Error('Invalid scheduler trace capacity');
  if (window.__PERF_SCHEDULER_TRACE) throw new Error('Scheduler trace already installed');
  if (typeof window.__DEBUG?.observeFrameLoopScheduler !== 'function') throw new Error('Scheduler observation port unavailable');
  const columns = ['sequence', 'rafMs', 'entryMs', 'deadlineBeforeMs', 'deadlineAfterMs', 'decision', 'restartSequence', 'resetSequence'];
  const data = columns.map(() => new Float64Array(capacity));
  const boundaryRaf = new Float64Array(capacity), boundarySequence = new Float64Array(capacity);
  let size = 0, boundaries = 0, dropped = 0, boundaryDropped = 0, recording = false, stopped = false, completed = false;
  let start = null, end = null, result = null;
  const record = (sequence, rafMs, entryMs, before, after, decision, restarts, resets) => {
    if (!recording) return;
    if (size >= capacity) { dropped++; return; }
    data[0][size] = sequence; data[1][size] = rafMs; data[2][size] = entryMs;
    data[3][size] = before; data[4][size] = after; data[5][size] = decision;
    data[6][size] = restarts; data[7][size] = resets; size++;
  };
  const handle = window.__DEBUG.observeFrameLoopScheduler(record);
  const edge = rafMs => ({ rafMs, callbacks: handle.state.callbacks, restartSequence: handle.state.restartSequence,
    resetSequence: handle.state.resetSequence });
  const stop = () => {
    if (!stopped) { recording = false; handle.dispose(); stopped = true; }
    return { disposed: stopped && !handle.state.active, observerErrors: handle.state.observerErrors, error: handle.state.error };
  };
  const finish = rafMs => {
    if (result) return result;
    if (rafMs !== undefined && recording) { end = edge(rafMs); completed = true; }
    const wasActive = handle.state.active;
    const cleanup = stop();
    const reasons = [];
    if (!completed || !start || !end || !(end.rafMs > start.rafMs)) reasons.push('Incomplete sample edges');
    if (!wasActive) reasons.push('Observer detached before sample end');
    if (dropped || boundaryDropped) reasons.push('Bounded trace overflow');
    if (handle.state.observerErrors || handle.state.error) reasons.push('Runtime observer failed');
    if (!cleanup.disposed) reasons.push('Observer cleanup failed');
    if (!size || end?.callbacks - start?.callbacks !== size) reasons.push('Incomplete scheduler callback coverage');
    if (!boundaries || boundaryRaf[boundaries - 1] !== end?.rafMs
        || boundarySequence[boundaries - 1] !== end?.callbacks) reasons.push('Missing terminal sampler boundary');
    for (let i = 0; i < boundaries; i++) {
      if (!Number.isFinite(boundaryRaf[i]) || boundaryRaf[i] < start?.rafMs || boundaryRaf[i] > end?.rafMs
          || (i > 0 && boundaryRaf[i] <= boundaryRaf[i - 1])
          || !Number.isSafeInteger(boundarySequence[i]) || boundarySequence[i] < start?.callbacks
          || boundarySequence[i] > end?.callbacks || (i > 0 && boundarySequence[i] < boundarySequence[i - 1])) {
        reasons.push('Invalid sampler ordering'); break;
      }
    }
    for (let i = 0; i < size; i++) {
      if (data[0][i] !== start.callbacks + i + 1 || !Number.isFinite(data[1][i]) || !Number.isFinite(data[2][i])) {
        reasons.push('Invalid callback sequence or clocks'); break;
      }
    }
    result = { protocol: 'perfprobe-scheduler-decisions-v1', diagnosticOverhead: true, speedCertification: false,
      pass: reasons.length === 0, reasons, capacity, dropped, boundaryDropped, start, end, cleanup,
      intervalMs: handle.state.intervalMs, toleranceMs: handle.state.toleranceMs,
      initialDeadlineMs: handle.state.initialDeadlineMs,
      columns, decisions: Object.fromEntries(columns.map((name, i) => [name, Array.from(data[i].subarray(0, size))])),
      sampler: { rafMs: Array.from(boundaryRaf.subarray(0, boundaries)), callbacks: Array.from(boundarySequence.subarray(0, boundaries)) },
      ordering: 'Sampler boundaries contain observed scheduler sequence at sampler entry; do not infer callback ownership by shifted RAF timestamps.' };
    return result;
  };
  window.__PERF_SCHEDULER_TRACE = {
    start(rafMs) {
      if (recording || stopped || start) throw new Error('Scheduler trace cannot restart');
      start = edge(rafMs); recording = true;
    },
    frame(rafMs) {
      if (!recording) return;
      if (boundaries >= capacity) { boundaryDropped++; return; }
      boundaryRaf[boundaries] = rafMs; boundarySequence[boundaries] = handle.state.callbacks; boundaries++;
    },
    finish, stop,
  };
}
