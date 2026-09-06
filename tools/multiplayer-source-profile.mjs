/** Opt-in statistical V8 sampling, never precise coverage (which deoptimizes code).
 * https://chromedevtools.github.io/devtools-protocol/tot/Profiler/
 * Times below are sample weights, not exact CPU durations or GPU execution time.
 * Only generated application locations leave the collector; no source-map fetch.
 */
const realClock = { now: () => performance.now(), setTimeout, clearTimeout };
const MAX_NODES = 20000;
const MAX_SAMPLES = 40000;
const MAX_FUNCTIONS = 64;
const BIN_MS = 100;
const CATEGORIES = ['application', 'idle', 'program', 'gc', 'other'];
const emptyTotals = () => Object.fromEntries(CATEGORIES.map((key) => [key, 0]));
const invalid = () => { throw new Error('source_profile_invalid_profile'); };
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const integer = (value) => Number.isSafeInteger(value) && value >= 0;

function parseOrigin(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.pathname !== '/' ||
        url.username || url.password || url.search || url.hash) throw new Error();
    return url.origin;
  } catch { throw new TypeError('source_profile_invalid_options'); }
}

function settings(options) {
  const origin = parseOrigin(options.origin);
  const durationMs = options.durationMs ?? 25000;
  const samplingIntervalUs = options.samplingIntervalUs ?? 2000;
  const commandTimeoutMs = options.commandTimeoutMs ?? 1500;
  if ([[durationMs, 1, 25000], [samplingIntervalUs, 1000, 10000], [commandTimeoutMs, 1, 5000]]
    .some(([value, min, max]) => !integer(value) || value < min || value > max)) {
    throw new TypeError('source_profile_invalid_options');
  }
  return { origin, durationMs, samplingIntervalUs, commandTimeoutMs };
}

function applicationLocation(frame, origin) {
  if (!frame || typeof frame.url !== 'string' || frame.url.length > 512) return null;
  let url;
  try { url = new URL(frame.url); } catch { return null; }
  if (url.origin !== origin || url.username || url.password || url.search || url.hash) return null;
  if (!/^\/(?:assets\/[A-Za-z0-9_-]+\.(?:m?js)|src\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.[cm]?[jt]sx?)$/.test(url.pathname)) return null;
  if (url.pathname.length > 200 || !integer(frame.lineNumber) || !integer(frame.columnNumber)) return null;
  const functionName = typeof frame.functionName === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]{0,95}$/.test(frame.functionName)
    ? frame.functionName : '(anonymous)';
  return { path: url.pathname, functionName, line: frame.lineNumber + 1, column: frame.columnNumber + 1 };
}

function category(frame, location) {
  if (location) return 'application';
  // Synthetic V8 roots only: a user script cannot label its code as idle/GC.
  if (frame?.url) return 'other';
  if (frame?.functionName === '(idle)') return 'idle';
  if (frame?.functionName === '(program)') return 'program';
  return frame?.functionName === '(garbage collector)' ? 'gc' : 'other';
}

function validateProfile(profile) {
  if (!Array.isArray(profile?.nodes) || !profile.nodes.length || profile.nodes.length > MAX_NODES ||
      !Array.isArray(profile.samples) || profile.samples.length > MAX_SAMPLES ||
      !Array.isArray(profile.timeDeltas) || profile.samples.length !== profile.timeDeltas.length) invalid();
  if (!finite(profile.startTime) || !finite(profile.endTime) || profile.startTime < 0 ||
      profile.endTime < profile.startTime || profile.endTime - profile.startTime > 40000000) invalid();
  return (profile.endTime - profile.startTime) / 1000;
}

function indexNodes(profile, origin) {
  const nodes = new Map();
  const functions = new Map();
  for (const node of profile.nodes) {
    if (!integer(node?.id) || nodes.has(node.id) || !Array.isArray(node.children ?? []) ||
        (node.children?.length ?? 0) > MAX_NODES) invalid();
    const location = applicationLocation(node.callFrame, origin);
    const key = location ? JSON.stringify(location) : null;
    if (key && !functions.has(key)) functions.set(key, { ...location, selfSampledMs: 0, inclusiveSampledMs: 0 });
    nodes.set(node.id, { children: node.children ?? [], parent: null, key,
      category: category(node.callFrame, location), lineage: null });
  }
  let edges = 0;
  for (const [id, node] of nodes) for (const child of node.children) {
    if (++edges >= nodes.size || !nodes.has(child) || nodes.get(child).parent !== null) invalid();
    nodes.get(child).parent = id;
  }
  const root = profile.nodes[0].id;
  if (nodes.get(root).parent !== null || edges !== nodes.size - 1) invalid();
  return { nodes, functions, root };
}

function lineageOf(id, index) {
  const leaf = index.nodes.get(id);
  if (!leaf) return invalid();
  if (leaf.lineage) return leaf.lineage;
  const seen = new Set();
  const keys = new Set();
  let current = id;
  while (current !== null) {
    if (seen.has(current) || seen.size >= 128) invalid();
    seen.add(current);
    const node = index.nodes.get(current);
    if (node.key) keys.add(node.key);
    if (node.parent === null && current !== index.root) invalid();
    current = node.parent;
  }
  leaf.lineage = [...keys];
  return leaf.lineage;
}

function addBins(bins, from, to, leaf) {
  while (from < to) {
    const index = Math.floor(from / BIN_MS);
    const end = Math.min(to, (index + 1) * BIN_MS);
    const bin = bins[index] ??= { startAtMs: index * BIN_MS, ...emptyTotals(), functions: new Map() };
    bin[leaf.category] += end - from;
    if (leaf.key) bin.functions.set(leaf.key, (bin.functions.get(leaf.key) ?? 0) + end - from);
    from = end;
  }
}

function accumulate(profile, index, durationMs) {
  const sampledMs = emptyTotals();
  const bins = [];
  let elapsed = 0;
  let applicationInclusiveSampledMs = 0;
  let maxSampleIntervalMs = 0;
  for (let sample = 0; sample < profile.samples.length; sample++) {
    const delta = profile.timeDeltas[sample];
    if (!integer(delta)) invalid();
    const weight = delta / 1000;
    if (elapsed + weight > durationMs + 0.001) invalid();
    const id = profile.samples[sample];
    const lineage = lineageOf(id, index);
    const leaf = index.nodes.get(id);
    sampledMs[leaf.category] += weight;
    maxSampleIntervalMs = Math.max(maxSampleIntervalMs, weight);
    if (leaf.key) index.functions.get(leaf.key).selfSampledMs += weight;
    for (const key of lineage) index.functions.get(key).inclusiveSampledMs += weight;
    if (lineage.length) applicationInclusiveSampledMs += weight;
    addBins(bins, elapsed, elapsed + weight, leaf);
    elapsed += weight;
  }
  return { bins, sampledMs, sampledDurationMs: elapsed, applicationInclusiveSampledMs, maxSampleIntervalMs };
}

function selectFunctions(functions) {
  const all = [...functions.entries()].filter(([, value]) => value.inclusiveSampledMs > 0);
  const by = (field) => [...all].sort((a, b) => b[1][field] - a[1][field]);
  const self = by('selfSampledMs');
  const selected = new Map([...self.slice(0, 32), ...by('inclusiveSampledMs').slice(0, 32)]);
  for (const entry of self) {
    if (selected.size >= MAX_FUNCTIONS) break;
    selected.set(...entry);
  }
  return { selected, total: all.length };
}

function exportBins(bins, keys) {
  return bins.map((bin) => {
    const functions = [...bin.functions].filter(([key]) => keys.has(key))
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([key, selfSampledMs]) => ({ functionIndex: keys.get(key), selfSampledMs }));
    return { ...bin, functions,
      otherApplicationSelfMs: Math.max(0, bin.application - functions.reduce((sum, row) => sum + row.selfSampledMs, 0)) };
  });
}

/** Self/inclusive weights are not additive. Inclusive recursion is deduplicated.
 * A long sample delta is explicitly reported; sampling cannot prove when within
 * that interval a function ran. Non-app strings and all raw node IDs are dropped.
 */
export function summarizeMultiplayerSourceProfile(profile, options) {
  const origin = parseOrigin(options?.origin);
  const profileDurationMs = validateProfile(profile);
  const index = indexNodes(profile, origin);
  // Validate even unsampled nodes; malformed cycles cannot be hidden off-path.
  for (const id of index.nodes.keys()) lineageOf(id, index);
  const accumulated = accumulate(profile, index, profileDurationMs);
  const { bins, ...totals } = accumulated;
  const { selected, total } = selectFunctions(index.functions);
  const keys = new Map([...selected.keys()].map((key, offset) => [key, offset]));
  return { profileDurationMs, ...totals,
    nonIdleSampledMs: totals.sampledDurationMs - totals.sampledMs.idle,
    unsampledTailMs: Math.max(0, profileDurationMs - totals.sampledDurationMs),
    sampleCount: profile.samples.length, nodeCount: profile.nodes.length,
    functions: [...selected.values()], functionsOmitted: total - selected.size,
    bins: exportBins(bins, keys), binMs: BIN_MS,
    locationCoordinates: 'generated-one-based', attribution: 'statistical-sample-weights-not-exact-cpu-time' };
}

function commandRunner(clock, timeoutMs) {
  return (operation) => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (accept, value) => {
      if (settled) return;
      settled = true; clock.clearTimeout(timer); accept(value);
    };
    const timer = clock.setTimeout(() => finish(reject, new Error('source_profile_command_timeout')), timeoutMs);
    Promise.resolve().then(operation).then((value) => finish(resolve, value),
      () => finish(reject, new Error('source_profile_command_failed')));
  });
}

async function releaseSession(session, run, stopNeeded) {
  let failed = false;
  if (stopNeeded) try { await run(() => session.send('Profiler.stop')); } catch { failed = true; }
  try { await run(() => session.send('Profiler.disable')); } catch { failed = true; }
  try { await run(() => session.detach()); } catch { failed = true; }
  return failed;
}

/** Selected target only. No broad Tracing, Debugger, coverage, or polling domain.
 * The configured deadline initiates stop; each stop/cleanup command is separately
 * bounded. Owner stop and deadline share one promise and one session disposal.
 */
export async function startMultiplayerSourceProfile(page, options = {}, clock = realClock) {
  const config = settings(options);
  const run = commandRunner(clock, config.commandTimeoutMs);
  let session;
  let releasing;
  let abandoned = false;
  let stopNeeded = false;
  let beforeStart;
  let afterStart;
  let startRequestedAt;
  const pageTime = async () => {
    const value = await run(() => page.evaluate(() => performance.now()));
    if (!finite(value) || value < 0) throw new Error('source_profile_invalid_clock');
    return value;
  };
  function release() {
    if (!session) return Promise.resolve(false);
    releasing ??= releaseSession(session, run, stopNeeded);
    return releasing;
  }
  const creation = Promise.resolve().then(() => page.target().createCDPSession());
  void creation.then((late) => {
    session = late;
    if (abandoned) return release();
  }, () => {}).catch(() => {});
  try {
    session = await run(() => creation);
    await run(() => session.send('Profiler.enable'));
    await run(() => session.send('Profiler.setSamplingInterval', { interval: config.samplingIntervalUs }));
    beforeStart = await pageTime();
    stopNeeded = true;
    startRequestedAt = clock.now();
    await run(() => session.send('Profiler.start'));
    afterStart = await pageTime();
    if (afterStart < beforeStart) throw new Error('source_profile_invalid_clock');
  } catch {
    abandoned = true;
    await release();
    throw new Error('source_profile_start_failed');
  }

  let completion;
  let deadline;
  function stop(reason = 'owner') {
    if (completion) return completion;
    clock.clearTimeout(deadline);
    completion = (async () => {
      let output;
      let failure = null;
      try {
        stopNeeded = false;
        const result = await run(() => session.send('Profiler.stop'));
        const stopReceiptPageTimeMs = await pageTime();
        output = { ...summarizeMultiplayerSourceProfile(result?.profile, config), stopReceiptPageTimeMs };
      } catch { failure = 'source_profile_stop_failed'; }
      const cleanupFailed = await release();
      if (failure || cleanupFailed) throw Object.assign(new Error(failure ?? 'source_profile_cleanup_failed'), { cleanupFailed });
      return { ...output, samplingIntervalUs: config.samplingIntervalUs, durationLimitMs: config.durationMs,
        baselinePageTimeMs: (beforeStart + afterStart) / 2,
        startClockUncertaintyMs: (afterStart - beforeStart) / 2,
        startBeforePageTimeMs: beforeStart, startAfterPageTimeMs: afterStart,
        stopReason: reason === 'deadline' ? 'deadline' : 'owner', diagnosticOverhead: true };
    })();
    void completion.catch(() => {});
    return completion;
  }
  deadline = clock.setTimeout(() => { void stop('deadline'); },
    Math.max(0, config.durationMs - (clock.now() - startRequestedAt)));
  return { stop };
}
