/** Native owned-window control only; never spoof focus, visibility or scheduling.
 * https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-setWindowBounds
 * Default is observation-only: two fresh contexts are not assumed to share focus.
 */
const realClock = { setTimeout, clearTimeout,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };
const MODES = ['dual-render-stress', 'single-foreground'];
const COUNTERS = ['animationTicks', 'backgroundTicks', 'snapshotPacketsReceived', 'inputPacketsSubmitted'];
const DELTAS = ['animationDelta', 'backgroundDelta', 'snapshotDelta', 'inputDelta'];
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const FAILURE_RECEIPTS = new WeakMap();

export function renderWorkloadFailureEvidence(error) {
  return FAILURE_RECEIPTS.get(error) ?? null;
}

function failure(code, receipt = null) {
  const error = new Error(code);
  if (receipt) FAILURE_RECEIPTS.set(error, receipt);
  return error;
}

/** Numeric counters and closed state only; no player, room, URL or target data. */
export function readRenderWorkloadState() {
  const debug = window.__DEBUG;
  const scheduler = debug?.frameLoopScheduler;
  const network = debug?.network;
  const number = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  return { pageTimeMs: performance.now(), focused: document.hasFocus(), hidden: document.hidden,
    phase: ['battle', 'garage'].includes(debug?.game?.phase) ? debug.game.phase : null,
    connected: network?.connected === true,
    animationTicks: number(scheduler?.animationTicks), backgroundTicks: number(scheduler?.backgroundTicks),
    snapshotPacketsReceived: number(network?.snapshotPacketsReceived), inputPacketsSubmitted: number(network?.inputPacketsSubmitted) };
}

function stateView(row) {
  return { focused: typeof row?.focused === 'boolean' ? row.focused : null,
    hidden: typeof row?.hidden === 'boolean' ? row.hidden : null,
    phase: ['battle', 'garage'].includes(row?.phase) ? row.phase : null,
    connected: row?.connected === true };
}

function delta(before, after) {
  return finite(before) && finite(after) && before >= 0 && after >= before ? after - before : null;
}

function peerObservation(before, after, role) {
  return { role, before: stateView(before), after: stateView(after),
    intervalMs: delta(before?.pageTimeMs, after?.pageTimeMs),
    ...Object.fromEntries(COUNTERS.map((key, index) => [DELTAS[index], delta(before?.[key], after?.[key])])) };
}

function live(row) {
  return row.intervalMs > 0 && row.snapshotDelta > 0 && row.inputDelta > 0 &&
    row.before.phase === 'battle' && row.after.phase === 'battle' && row.before.connected && row.after.connected;
}

function foreground(row) {
  return live(row) && row.animationDelta > 0 && row.before.focused === true && row.after.focused === true &&
    row.before.hidden === false && row.after.hidden === false;
}

function background(row) {
  return live(row) && row.animationDelta === 0 && row.backgroundDelta > 0 &&
    row.before.focused === false && row.after.focused === false && row.before.hidden === true && row.after.hidden === true;
}

export function classifyRenderWorkload(before, after, measuredRole) {
  const peers = ['host', 'guest'].map((role, index) => peerObservation(before?.[index], after?.[index], role));
  const selected = measuredRole === 'host' ? 0 : 1;
  let classification = 'mixed-or-unverified';
  if (peers.every(foreground)) classification = 'dual-render-observed';
  else if (foreground(peers[selected]) && background(peers[1 - selected])) {
    classification = 'single-foreground-live-background-observed';
  }
  return { classification, peers };
}

function settings(options) {
  const mode = options.mode ?? 'dual-render-stress';
  const commandTimeoutMs = options.commandTimeoutMs ?? 2000;
  if (!MODES.includes(mode) || !Number.isInteger(commandTimeoutMs) || commandTimeoutMs < 1 || commandTimeoutMs > 5000) {
    throw new TypeError('render_workload_invalid_options');
  }
  return { mode, commandTimeoutMs };
}

function commandRunner(clock, timeoutMs) {
  return (operation) => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (accept, value) => {
      if (settled) return;
      settled = true; clock.clearTimeout(timer); accept(value);
    };
    const timer = clock.setTimeout(() => finish(reject, new Error('render_workload_command_failed')), timeoutMs);
    Promise.resolve().then(operation).then((value) => finish(resolve, value),
      () => finish(reject, new Error('render_workload_command_failed')));
  });
}

function nativeWindow(response) {
  if (!Number.isSafeInteger(response?.windowId) || response.windowId < 0 ||
      !['normal', 'minimized', 'maximized', 'fullscreen'].includes(response.bounds?.windowState)) {
    throw new Error('render_workload_start_failed');
  }
  const bounds = { windowState: response.bounds.windowState };
  for (const key of ['left', 'top', 'width', 'height']) {
    const value = response.bounds[key];
    if (!Number.isSafeInteger(value) || Math.abs(value) > 100000 ||
        ((key === 'width' || key === 'height') && value <= 0)) throw new Error('render_workload_start_failed');
    bounds[key] = value;
  }
  return { windowId: response.windowId, bounds };
}

async function mutateWindow(owner, run, operation) {
  let started = false;
  let completed = false;
  try {
    return await run(async () => {
      started = true;
      try { return await operation(); } finally { completed = true; }
    });
  } catch (error) {
    // CDP commands cannot be cancelled. A timed-out operation may still mutate
    // the native window after restoration; never certify that state as restored.
    if (started && !completed) owner.mutationUncertain = true;
    throw error;
  }
}

async function restoreWindow(owner, run, originalState = true) {
  const { windowId, bounds } = owner.native;
  owner.changed = true;
  const send = (next) => mutateWindow(owner, run,
    () => owner.session.send('Browser.setWindowBounds', { windowId, bounds: next }));
  await send({ windowState: 'normal' });
  await send(Object.fromEntries(['left', 'top', 'width', 'height'].map((key) => [key, bounds[key]])));
  if (originalState && bounds.windowState !== 'normal') await send({ windowState: bounds.windowState });
  if (originalState) {
    const response = await run(() => owner.session.send('Browser.getWindowBounds', { windowId }));
    if (Object.keys(bounds).some((key) => bounds[key] !== response?.bounds?.[key])) {
      throw new Error('render_workload_cleanup_failed');
    }
  }
}

function releaseOwner(owner, run) {
  if (!owner.session) return Promise.resolve(true);
  owner.releasing ??= (async () => {
    let restored = true;
    if (owner.changed && owner.native) {
      try { await restoreWindow(owner, run); } catch { restored = false; }
    }
    try { await run(() => owner.session.detach()); } catch { restored = false; }
    return restored && !owner.mutationUncertain;
  })();
  return owner.releasing;
}

async function acquireOwner(page, owner, run, isClosed) {
  const creation = Promise.resolve().then(() => page.target().createCDPSession());
  void creation.then((session) => {
    owner.session = session;
    if (isClosed()) return releaseOwner(owner, run);
  }, () => {}).catch(() => {});
  owner.session = await run(() => creation);
  owner.native = nativeWindow(await run(() => owner.session.send('Browser.getWindowForTarget')));
}

/** Own only the supplied two pages. Call dispose in finally BEFORE closing them.
 * Admission costs 500 ms settling + 1 s observation only in explicit single mode.
 * Both admission and whole-sample checks require actual network/counter progress.
 */
export async function createMultiplayerRenderWorkload(pages, options = {}, clock = realClock) {
  const config = settings(options);
  if (!Array.isArray(pages) || pages.length !== 2 || pages[0] === pages[1]) {
    throw new TypeError('render_workload_invalid_options');
  }
  const run = commandRunner(clock, config.commandTimeoutMs);
  const owners = pages.map(() => ({ session: null, native: null, changed: false,
    releasing: null, mutationUncertain: false }));
  let closed = false;
  let disposal;
  let active = null;
  let running = null;
  const work = (operation) => run(async () => {
    if (closed) throw failure('render_workload_cleanup_failed');
    const result = await operation();
    if (closed) throw failure('render_workload_cleanup_failed');
    return result;
  });
  const read = () => Promise.all(pages.map((page) => work(() => page.evaluate(readRenderWorkloadState))));
  function dispose() {
    if (disposal) return disposal;
    closed = true;
    disposal = (async () => {
      // Fence in-flight admission before restoration. A cancelled settle/read may
      // finish, but cannot issue another native mutation after window cleanup.
      await running?.catch(() => {});
      const released = await Promise.all(owners.map((owner) => releaseOwner(owner, run)));
      if (released.some((ok) => !ok)) throw new Error('render_workload_cleanup_failed');
      return { windowsRestored: true, sessionsDetached: true };
    })();
    return disposal;
  }
  async function admit(role) {
    let admission = null;
    try {
      const index = role === 'host' ? 0 : 1;
      if (config.mode === 'single-foreground') {
        await restoreWindow(owners[index], work, false);
        const peer = owners[1 - index]; peer.changed = true;
        await mutateWindow(peer, work, () => peer.session.send('Browser.setWindowBounds', {
          windowId: peer.native.windowId, bounds: { windowState: 'minimized' },
        }));
        await mutateWindow(owners[index], work, () => pages[index].bringToFront());
        await clock.sleep(500);
        const before = await read();
        await clock.sleep(1000);
        const after = await read();
        admission = classifyRenderWorkload(before, after, role);
        if (admission.classification !== 'single-foreground-live-background-observed') {
          throw new Error('render_workload_admission_failed');
        }
        active = { role, before: after, admission };
      } else active = { role, before: await read(), admission };
      return admission;
    } catch {
      throw failure('render_workload_admission_failed', { requested: config.mode, measuredRole: role,
        admission, sample: null });
    }
  }
  async function observe(role) {
    let receipt = null;
    try {
      const after = await read();
      const sample = classifyRenderWorkload(active.before, after, role);
      receipt = { requested: config.mode, measuredRole: role, admission: active.admission, sample,
        observation: 'endpoint-states-and-monotonic-counter-deltas', nativePolicy: config.mode === 'single-foreground' };
      active = null;
      if (config.mode === 'single-foreground' && sample.classification !== 'single-foreground-live-background-observed') {
        throw new Error('render_workload_observation_failed');
      }
      return receipt;
    } catch { throw failure('render_workload_observation_failed', receipt); }
  }
  function startOperation(operation, permitted, code) {
    if (closed || running || !permitted) return Promise.reject(failure(code));
    running = operation().finally(() => { running = null; });
    return running;
  }
  try {
    if (config.mode === 'single-foreground') {
      for (let index = 0; index < owners.length; index++) await acquireOwner(pages[index], owners[index], run, () => closed);
      if (owners[0].native.windowId === owners[1].native.windowId) throw new Error('render_workload_start_failed');
    }
  } catch {
    let cleanupFailed = false;
    try { await dispose(); } catch { cleanupFailed = true; }
    throw Object.assign(new Error('render_workload_start_failed'), { cleanupFailed });
  }
  return {
    begin: (role) => startOperation(() => admit(role), !active && ['host', 'guest'].includes(role),
      'render_workload_admission_failed'),
    finish: (role) => startOperation(() => observe(role), active?.role === role,
      'render_workload_observation_failed'),
    dispose,
  };
}
