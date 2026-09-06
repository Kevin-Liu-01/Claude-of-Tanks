/**
 * Opt-in CDP counters, not a CPU profile or a causal explanation for a frame gap.
 * Relative times use CDP Timestamp when present, else monotonic receipt time. Duration
 * counters use CDP timeTicks (seconds converted to milliseconds); heap deltas
 * may be negative. No page paths, identities, URLs or raw protocol data escape.
 * https://chromedevtools.github.io/devtools-protocol/tot/Performance/
 */
const COUNTERS = ['TaskDuration', 'ScriptDuration', 'LayoutDuration',
  'RecalcStyleDuration', 'JSHeapUsedSize'];
const FIELDS = ['taskDurationMs', 'scriptDurationMs', 'layoutDurationMs',
  'recalcStyleDurationMs', 'jsHeapUsedSizeDeltaBytes'];
const realClock = { now: () => performance.now(), setTimeout, clearTimeout };

function settings(options) {
  const sampleIntervalMs = options.sampleIntervalMs ?? 100;
  const durationMs = options.durationMs ?? 30000;
  const maxRows = options.maxRows ?? 350;
  const commandTimeoutMs = options.commandTimeoutMs ?? 1500;
  const limits = [[sampleIntervalMs, 50, 1000], [durationMs, 1, 30000],
    [maxRows, 1, 350], [commandTimeoutMs, 1, 5000]];
  if (limits.some(([value, min, max]) => !Number.isInteger(value) || value < min || value > max)) {
    throw new TypeError('cpu_timeline_invalid_options');
  }
  return { sampleIntervalMs, durationMs, maxRows, commandTimeoutMs };
}

function readCounters(response) {
  if (!Array.isArray(response?.metrics) || response.metrics.length > 512) {
    throw new Error('cpu_timeline_invalid_metrics');
  }
  const result = [];
  for (const name of COUNTERS) {
    const matches = response.metrics.filter((metric) => metric?.name === name);
    const value = matches[0]?.value;
    if (matches.length !== 1 || typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error('cpu_timeline_invalid_metrics');
    }
    result.push(value);
  }
  const timestamp = response.metrics.find((metric) => metric?.name === 'Timestamp')?.value;
  const timestampMs = typeof timestamp === 'number' && Number.isFinite(timestamp)
    && timestamp >= 0 && Number.isFinite(timestamp * 1000) ? timestamp * 1000 : null;
  return { values: result, timestampMs };
}

function rowFor(relativeTimeMs, previous, current) {
  const row = { relativeTimeMs };
  for (let index = 0; index < COUNTERS.length; index++) {
    const delta = current[index] - previous[index];
    if (index < 4 && delta < 0) throw new Error('cpu_timeline_counter_reset');
    const scaled = index < 4 ? delta * 1000 : delta;
    if (!Number.isFinite(scaled)) throw new Error('cpu_timeline_invalid_metrics');
    row[FIELDS[index]] = scaled;
  }
  return row;
}

/** Every owned command timer can be cancelled without awaiting a stuck CDP reply. */
function commandRunner(clock, timeoutMs) {
  const pending = new Set();
  return {
    run(operation) {
      return new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        const finish = (accept, value) => {
          if (settled) return;
          settled = true;
          clock.clearTimeout(timer);
          pending.delete(cancel);
          accept(value);
        };
        const cancel = () => finish(reject, new Error('cpu_timeline_command_interrupted'));
        pending.add(cancel);
        timer = clock.setTimeout(cancel, timeoutMs);
        Promise.resolve().then(operation).then(
          (value) => finish(resolve, value), () => finish(reject, new Error('cpu_timeline_command_failed')),
        );
      });
    },
    cancel() { for (const cancel of pending) cancel(); },
  };
}

async function releaseSession(session, commands) {
  let failed = false;
  try { await commands.run(() => session.send('Performance.disable')); }
  catch { failed = true; }
  try { await commands.run(() => session.detach()); }
  catch { failed = true; }
  return failed;
}

/**
 * Start immediately before the timed native-control segment, then await stop()
 * in its finally. Deadline and row bounds also stop automatically. A failed
 * sample rejects stop() with a fixed diagnostic instead of presenting a partial
 * capture as successful. Repeated stop() calls share cleanup and the receipt.
 */
export async function startMultiplayerCpuTimeline(page, options = {}, clock = realClock) {
  const config = settings(options);
  const commands = commandRunner(clock, config.commandTimeoutMs);
  let session;
  let previous;
  let baselinePageTimeMs;
  let baselineRequestSpanMs;
  let abandoned = false;
  const creation = Promise.resolve().then(() => page.target().createCDPSession());
  // A session that arrives after startup timed out still belongs to this probe.
  void creation.then((late) => {
    if (abandoned) return releaseSession(late, commands);
  }, () => {}).catch(() => {});
  try {
    session = await commands.run(() => creation);
    await commands.run(() => session.send('Performance.enable', { timeDomain: 'timeTicks' }));
    const requestedAt = clock.now();
    const [metrics, pageTime] = await Promise.all([
      commands.run(() => session.send('Performance.getMetrics')),
      commands.run(() => page.evaluate(() => performance.now())),
    ]);
    previous = readCounters(metrics);
    baselinePageTimeMs = pageTime;
    baselineRequestSpanMs = clock.now() - requestedAt;
    if (typeof pageTime !== 'number' || !Number.isFinite(pageTime) || pageTime < 0
      || !Number.isFinite(baselineRequestSpanMs) || baselineRequestSpanMs < 0) {
      throw new Error('cpu_timeline_invalid_clock');
    }
  } catch {
    abandoned = true;
    commands.cancel();
    if (session) await releaseSession(session, commands);
    throw new Error('cpu_timeline_start_failed');
  }

  const startedAt = clock.now();
  const baselineTimestampMs = previous.timestampMs;
  const rows = [rowFor(0, previous.values, previous.values)];
  let stopped = false;
  let failure = null;
  let tickTimer;
  let deadlineTimer;
  let completion = null;

  function stop() {
    if (completion) return completion;
    stopped = true;
    clock.clearTimeout(tickTimer);
    clock.clearTimeout(deadlineTimer);
    commands.cancel();
    completion = (async () => {
      const cleanupFailed = await releaseSession(session, commands);
      if (failure) throw new Error(failure);
      if (cleanupFailed) throw new Error('cpu_timeline_cleanup_failed');
      return { sampleIntervalMs: config.sampleIntervalMs,
        baselinePageTimeMs, baselineRequestSpanMs, rows };
    })();
    // An automatic deadline/failure may precede the owner's eventual stop().
    void completion.catch(() => {});
    return completion;
  }

  function schedule() {
    tickTimer = clock.setTimeout(() => { void sample(); }, config.sampleIntervalMs);
  }

  async function sample() {
    if (stopped) return;
    try {
      const current = readCounters(await commands.run(() => session.send('Performance.getMetrics')));
      if (stopped) return;
      const elapsed = baselineTimestampMs === null ? clock.now() - startedAt
        : current.timestampMs === null ? NaN : current.timestampMs - baselineTimestampMs;
      if (!Number.isFinite(elapsed) || elapsed < rows.at(-1).relativeTimeMs) {
        throw new Error('cpu_timeline_invalid_clock');
      }
      if (clock.now() - startedAt >= config.durationMs || elapsed >= config.durationMs) {
        void stop(); return;
      }
      rows.push(rowFor(elapsed, previous.values, current.values));
      previous = current;
      if (rows.length >= config.maxRows) { void stop(); return; }
      schedule();
    } catch {
      if (stopped) return;
      failure = 'cpu_timeline_sample_failed';
      void stop();
    }
  }

  deadlineTimer = clock.setTimeout(() => { void stop(); }, config.durationMs);
  if (rows.length >= config.maxRows) void stop();
  else schedule();
  return { stop };
}
