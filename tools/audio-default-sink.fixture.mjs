// Standalone opt-in experiment. No game modules, device discovery or permissions.
// https://developer.chrome.com/blog/audiocontext-setsinkid/
// https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext
export const AUDIO_SINK_MODES = Object.freeze(['default', 'silent-then-default']);

export function audioSinkOrder(blocks = 3) {
  if (!Number.isInteger(blocks) || blocks < 1 || blocks > 6) throw new Error('blocks must be 1 through 6');
  return Array.from({ length: blocks }, (_, block) => ['default', 'silent-then-default', 'silent-then-default', 'default']
    .map((mode, position) => ({ block, position, mode }))).flat();
}

export function audioSinkOptions(mode) {
  if (!AUDIO_SINK_MODES.includes(mode)) throw new Error('Unknown audio sink mode');
  return mode === 'default' ? { latencyHint: 'interactive' }
    : { latencyHint: 'interactive', sinkId: { type: 'none' } };
}

function sinkState(context) {
  const sink = context.sinkId;
  return typeof sink === 'string' ? (sink === '' ? 'default' : 'unexpected-device')
    : sink?.type === 'none' ? 'none' : 'unavailable';
}

function contextState(context, now) {
  const output = typeof context.getOutputTimestamp === 'function' ? context.getOutputTimestamp() : null;
  return { atMs: now(), state: context.state, sink: sinkState(context), sampleRate: context.sampleRate,
    baseLatency: context.baseLatency, outputLatency: context.outputLatency ?? null,
    currentTime: context.currentTime, outputTimestamp: output ? {
      contextTime: output.contextTime, performanceTime: output.performanceTime,
    } : null };
}

export async function deadline(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: timeout`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

function timedCall(call, now, receipt, key) {
  const timing = receipt[key] = { startMs: now(), returnedMs: null, settledMs: null, error: null };
  let promise;
  try { promise = call(); }
  catch (error) { timing.returnedMs = now(); timing.error = String(error); return Promise.reject(error); }
  timing.returnedMs = now();
  return Promise.resolve(promise).then(value => { timing.settledMs = now(); return value; }, error => {
    timing.settledMs = now(); timing.error = String(error); throw error;
  });
}

export function audioSinkReadiness(row) {
  const start = row.graphStart, end = row.graphEnd;
  if (!start || !end) return { ok: false, reasons: ['missing-graph-witness'] };
  const wallSeconds = (end.atMs - start.atMs) / 1000;
  const clockSeconds = end.currentTime - start.currentTime;
  const outputSeconds = end.outputTimestamp && start.outputTimestamp
    ? end.outputTimestamp.contextTime - start.outputTimestamp.contextTime : null;
  const reasons = [];
  if (end.state !== 'running' || end.sink !== 'default') reasons.push('not-running-on-default-output');
  if (!(row.signalPeak >= 0.001)) reasons.push('silent-graph');
  if (!(clockSeconds >= 0.25 && clockSeconds >= wallSeconds * 0.5 && clockSeconds <= wallSeconds * 1.5)) reasons.push('clock-regression');
  if (!(outputSeconds >= 0.15)) reasons.push('output-clock-unverified');
  if (start.sampleRate !== end.sampleRate) reasons.push('sample-rate-changed');
  return { ok: reasons.length === 0, reasons, wallSeconds, clockSeconds, outputSeconds };
}

/** Called only by the actual button listener. The injected environment is for
 * deterministic CPU tests; the native runner uses the untouched window APIs. */
export async function runAudioSinkAttempt(event, mode, env = globalThis, onContext = () => {}) {
  const now = () => env.performance.now();
  const row = { mode, ok: false, timeOrigin: env.performance.timeOrigin, clickedAtMs: now(), trusted: event.isTrusted === true,
    userActivation: env.navigator.userActivation?.isActive === true, constructor: null,
    initial: null, route: null, graphStart: null, graphEnd: null, signalPeak: 0,
    events: [], error: null, cleanupErrors: [], closed: false, fallbackRequired: false };
  let context, oscillator, gain, analyser, stateChange, sinkChange, cancelled = false;
  try {
    if (!row.trusted || !row.userActivation) throw new Error('trusted active user click required');
    const options = audioSinkOptions(mode);
    row.constructor = { options, startMs: now(), endMs: null };
    try { context = new env.AudioContext(options); }
    finally { row.constructor.endMs = now(); }
    onContext(context);
    row.initial = contextState(context, now);
    if (mode !== 'default' && (row.initial.sink !== 'none' || typeof context.setSinkId !== 'function')) {
      throw new Error('silent sink or setSinkId unsupported/ignored');
    }
    const recordEvent = type => {
      if (row.events.length < 24) row.events.push({ type, ...contextState(context, now) });
    };
    stateChange = () => recordEvent('statechange'); sinkChange = () => recordEvent('sinkchange');
    context.addEventListener('statechange', stateChange);
    context.addEventListener('sinkchange', sinkChange);
    // Both calls begin before the first await in this trusted click handler.
    // A rejected candidate is never quietly reconstructed as a successful B.
    const resumed = timedCall(() => context.resume(), now, row, 'resume');
    const routed = mode === 'default' ? Promise.resolve()
      : timedCall(() => context.setSinkId(''), now, row, 'setSink');
    row.handlerSyncEndMs = now();
    await deadline(Promise.all([resumed, routed]), 8000, 'resume/default route');
    row.route = contextState(context, now);
    if (row.route.sink !== 'default' || row.route.state !== 'running') throw new Error('default output not running');
    oscillator = context.createOscillator(); gain = context.createGain(); analyser = context.createAnalyser();
    oscillator.frequency.value = 440; gain.gain.value = 0.01; analyser.fftSize = 256;
    oscillator.connect(gain); gain.connect(analyser); analyser.connect(context.destination);
    const waveform = new Float32Array(analyser.fftSize);
    row.graphStart = contextState(context, now);
    oscillator.start(); oscillator.stop(context.currentTime + 0.8);
    // Same nonzero, quietly audible graph and observation window in both arms.
    // This is graph/default-route readiness, never physical speaker loopback.
    await deadline((async () => {
      do {
        await new Promise(resolve => env.requestAnimationFrame(resolve));
        if (cancelled) return;
        analyser.getFloatTimeDomainData(waveform);
        for (const value of waveform) row.signalPeak = Math.max(row.signalPeak, Math.abs(value));
        row.graphEnd = contextState(context, now);
      } while (row.graphEnd.atMs - row.graphStart.atMs < 600);
    })(), 3000, 'audio clock/graph observation');
    row.readiness = audioSinkReadiness(row);
    if (!row.readiness.ok) throw new Error(row.readiness.reasons.join(', '));
    row.ok = true;
  } catch (error) {
    row.error = String(error); row.fallbackRequired = mode !== 'default';
  } finally {
    cancelled = true;
    row.measurementEndMs = now();
    if (context) {
      context.removeEventListener('statechange', stateChange);
      context.removeEventListener('sinkchange', sinkChange);
      for (const node of [oscillator, gain, analyser]) {
        try { node?.disconnect(); } catch (error) { row.cleanupErrors.push(String(error)); }
      }
      try {
        await deadline(context.close(), 3000, 'audio close');
        row.closed = context.state === 'closed';
      } catch (error) { row.cleanupErrors.push(String(error)); }
    } else row.closed = true;
    row.finishedAtMs = now();
    row.ok &&= row.closed && row.cleanupErrors.length === 0;
    onContext(null);
  }
  return row;
}

function createFrameObserver(env) {
  const frames = [], longTasks = [];
  let frameId, previous = null, context = null, closed = false, droppedFrames = 0, droppedLongTasks = 0;
  const now = () => env.performance.now();
  const callback = rafAt => {
    if (closed) return;
    const atMs = now();
    if (frames.length < 1800) frames.push({ atMs, rafAt, gapMs: previous === null ? null : atMs - previous,
      contextTime: context?.currentTime ?? null, state: context?.state ?? null });
    else droppedFrames++;
    previous = atMs; frameId = env.requestAnimationFrame(callback);
  };
  const append = entries => {
    for (const entry of entries) {
      if (longTasks.length < 128) longTasks.push({ startMs: entry.startTime, durationMs: entry.duration });
      else droppedLongTasks++;
    }
  };
  const supported = env.PerformanceObserver?.supportedEntryTypes?.includes('longtask') === true;
  const observer = supported ? new env.PerformanceObserver(list => append(list.getEntries())) : null;
  observer?.observe({ type: 'longtask' });
  frameId = env.requestAnimationFrame(callback);
  return {
    setContext(value) { context = value; },
    stop() {
      closed = true; env.cancelAnimationFrame(frameId);
      if (observer) { append(observer.takeRecords()); observer.disconnect(); }
      return { frames, longTasks, longTasksSupported: supported, droppedFrames, droppedLongTasks };
    },
  };
}

export function installAudioSinkFixture(mode) {
  audioSinkOptions(mode);
  const button = document.createElement('button'); button.id = 'audio-sink-start';
  button.textContent = `Start ${mode} (quiet 440 Hz tone)`;
  document.body.append(button);
  let busy = false, used = false, observer, resolveDone;
  const finished = new Promise(resolve => { resolveDone = resolve; });
  const state = { finished, result: null, disposed: false };
  observer = createFrameObserver(window);
  button.addEventListener('click', async event => {
    if (busy || used || state.disposed) return;
    busy = true; used = true; button.disabled = true;
    state.result = await runAudioSinkAttempt(event, mode, window, value => observer.setContext(value));
    // Let the final render-task/LongTask delivery complete before snapshotting.
    await new Promise(resolve => setTimeout(resolve, 100));
    Object.assign(state.result, observer.stop());
    state.result.maxCallbackGapMs = Math.max(0, ...state.result.frames.filter(frame =>
      frame.atMs >= state.result.clickedAtMs && frame.atMs <= state.result.measurementEndMs + 50)
      .map(frame => frame.gapMs ?? 0));
    busy = false; resolveDone(state.result);
  });
  state.dispose = () => {
    if (busy) throw new Error('fixture is still measuring; close the owned browser context to cancel');
    observer.stop(); button.remove(); state.disposed = true;
  };
  return state;
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export function summarizeAudioSinkExperiment(rows) {
  const reasons = [];
  if (rows.length < 4 || rows.length % 4) reasons.push('incomplete-ABBA');
  for (let index = 0; index < rows.length; index++) {
    if (rows[index].mode !== audioSinkOrder(1)[index % 4].mode) reasons.push('invalid-order');
  }
  const groups = AUDIO_SINK_MODES.map(mode => rows.filter(row => row.mode === mode));
  if (rows.some(row => !row.ok || !row.closed || !row.trusted || !row.userActivation)) reasons.push('functional-or-gesture-failure');
  if (rows.some(row => row.droppedFrames || row.droppedLongTasks || !row.longTasksSupported)) reasons.push('incomplete-timing-evidence');
  if (new Set(rows.map(row => row.route?.sampleRate)).size !== 1) reasons.push('sample-rate-parity-failure');
  const metrics = groups.map(group => ({ mode: group[0]?.mode, count: group.length,
    constructorMedianMs: median(group.map(row => row.constructor?.endMs - row.constructor?.startMs)),
    constructorMaxMs: Math.max(...group.map(row => row.constructor?.endMs - row.constructor?.startMs)),
    syncHandlerMedianMs: median(group.map(row => row.handlerSyncEndMs - row.clickedAtMs)),
    routeMedianMs: median(group.map(row => row.route?.atMs - row.clickedAtMs)),
    maxCallbackGapMs: Math.max(...group.map(row => row.maxCallbackGapMs ?? Infinity)),
  }));
  const [a, b] = metrics;
  if (b.constructorMaxMs >= 50 || b.maxCallbackGapMs >= 50) reasons.push('candidate-still-blocks-main-thread');
  if (!(b.routeMedianMs <= a.routeMedianMs + 50)) reasons.push('default-route-readiness-regression');
  const exercised = a.constructorMaxMs >= 50;
  const improved = a.syncHandlerMedianMs - b.syncHandlerMedianMs >= 20;
  return { verdict: reasons.length ? 'reject' : exercised && improved ? 'promising-microprobe-only' : 'inconclusive',
    reasons: [...new Set(reasons)], metrics, baselineConstructorStallExercised: exercised,
    physicalAudibility: 'not measured; no microphone or loopback capture',
    inferenceLimit: 'Fresh browser contexts, shared browser audio service and unspecified OS/driver cache. Not production or cold-OS proof.' };
}
