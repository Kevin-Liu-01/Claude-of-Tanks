// Opt-in browser input observation. No camera/input-state assignments, extra
// input consumption, render calls, GPU waits, or quality/smoothing overrides.
export const CAMERA_INPUT_PROTOCOL = 'trusted-mouse-camera-response-v1';

/** Standalone page function: observe trusted dispatch -> consumed delta -> pose
 * -> next RAF callback. These are NOT physical input-to-photon measurements. */
export function installCameraInputObserver({ responseTimeoutMs = 1000, maxSamples = 64 } = {}) {
  if (!Number.isFinite(responseTimeoutMs) || responseTimeoutMs <= 0
      || !Number.isInteger(maxSamples) || maxSamples < 1 || maxSamples > 256) {
    throw new Error('Invalid bounded camera-input observation settings');
  }
  if (window.__PERF_CAMERA_INPUT) throw new Error('Camera-input observer already installed');
  const D = window.__DEBUG;
  const canvas = D.renderer.domElement;
  const originalUpdate = D.rig.update;
  const records = [], errors = [];
  const waiters = new Map();
  let pending = null, timer = null, raf = null, disposed = false;
  let quietInputFrames = 0;
  const ignored = { untrusted: 0, zeroMovement: 0 };

  function activeReason() {
    if (document.hidden || !document.hasFocus()) return 'page-not-visible-focused';
    if (D.game.phase !== 'battle' || !(D.game.preBattleS <= 0)) return 'controls-not-released';
    if (!D.game.player || D.game.player.combat.destroyed) return 'player-unavailable';
    if (D.game.result) return 'battle-result';
    if (D.settings.isOpen() || D.killcam.isActive()) return 'paused-or-killcam';
    if (D.shotMode || D.rig.externalActive || D.rig.cinematicActive) return 'non-player-camera';
    if (D.rig.mode !== 'ARCADE') return 'unsupported-camera-mode';
    if (document.pointerLockElement !== canvas) return 'pointer-lock-unavailable';
    return null;
  }

  function cameraSnapshot() {
    return {
      at: performance.now(), quaternion: D.camera.quaternion.toArray(),
      rotation: D.camera.rotation.toArray(), position: D.camera.position.toArray(),
      renderFrame: D.renderer.info.render.frame,
    };
  }

  function angularChange(before, after) {
    const length = q => Math.hypot(...q);
    const a = length(before), b = length(after);
    if (!(a > 0) || !(b > 0)) return { radians: 0, yawRadians: 0 };
    const dot = before.reduce((sum, value, index) => sum + value * after[index], 0) / (a * b);
    const yaw = q => {
      const [x, y, z, w] = q, n = length(q) ** 2;
      return Math.atan2(-2 * (x * z + w * y) / n, -(1 - 2 * (x * x + y * y) / n));
    };
    const delta = yaw(after) - yaw(before);
    return {
      radians: 2 * Math.acos(Math.min(1, Math.abs(dot))),
      yawRadians: Math.atan2(Math.sin(delta), Math.cos(delta)),
    };
  }

  function settle(status, reason = null) {
    if (!pending) return;
    const record = pending;
    pending = null;
    clearTimeout(timer); timer = null;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    record.status = status;
    record.reason = reason;
    record.completedAt = performance.now();
    waiters.get(record.id)?.(record);
    waiters.delete(record.id);
  }

  function observeRaf(timestamp) {
    raf = null;
    if (!pending) return;
    const reason = activeReason();
    if (reason) { settle('missed', reason); return; }
    const at = performance.now();
    pending.raf = {
      timestamp, observedAt: at, camera: cameraSnapshot(),
      dispatchObservedToRafMs: at - pending.event.observedAt,
      // RAF timestamps can precede callback execution. Keep both clock reads;
      // never describe either as compositor presentation or monitor scanout.
    };
    settle('responded');
  }

  function observeCameraUpdate(dt, cameraInput, before) {
    if (!pending?.event || pending.response) return;
    const reason = activeReason();
    if (reason) { settle('missed', reason); return; }
    const dx = cameraInput?.mouseDX, dy = cameraInput?.mouseDY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx === 0) return;
    const after = cameraSnapshot();
    const change = angularChange(before.quaternion, after.quaternion);
    const consumed = { at: after.at, dt, mouseDX: dx, mouseDY: dy, before, after, ...change };
    if (pending.consumed.length < 64) pending.consumed.push(consumed);
    const sign = -Math.sign(pending.event.movementX);
    if (Math.sign(dx) !== sign || Math.sign(change.yawRadians) !== sign || change.radians <= 1e-6) return;
    pending.response = {
      ...consumed,
      dispatchObservedToCameraMs: after.at - pending.event.observedAt,
      eventTimestampToCameraMs: pending.event.timestampCompatible
        ? after.at - pending.event.timeStamp : null,
    };
    raf = requestAnimationFrame(observeRaf);
  }

  function observedUpdate(...args) {
    // The runtime still drains input exactly once. Observe the already-delivered
    // camera frame, never invoke consumeMouseDelta or the rig a second time.
    const watching = !!pending?.event && !pending.response;
    let before = null, cameraInput = null;
    try {
      if (watching) {
        before = cameraSnapshot();
        cameraInput = { mouseDX: args[1]?.mouseDX, mouseDY: args[1]?.mouseDY };
      }
    } catch (error) { errors.push(`Observer read failed: ${error}`); dispose(); }
    let result;
    try { result = originalUpdate.apply(this, args); }
    catch (error) {
      settle('missed', 'camera-update-error');
      errors.push(String(error));
      dispose();
      throw error;
    }
    quietInputFrames = args[1]?.mouseDX === 0 && args[1]?.mouseDY === 0
      ? Math.min(2, quietInputFrames + 1) : 0;
    if (watching && !disposed) {
      try { observeCameraUpdate(args[0], cameraInput, before); }
      catch (error) { errors.push(`Observer update failed: ${error}`); dispose(); }
    }
    return result;
  }

  function onMouseMove(event) {
    if (!pending) return;
    if (!event.isTrusted) { ignored.untrusted++; return; }
    if (event.movementX === 0 && event.movementY === 0) { ignored.zeroMovement++; return; }
    const reason = activeReason();
    if (reason) { settle('missed', reason); return; }
    if (pending.event) { pending.coalescedEvents++; settle('missed', 'multiple-mouse-events'); return; }
    const at = performance.now();
    pending.event = {
      timeStamp: event.timeStamp, observedAt: at, isTrusted: event.isTrusted,
      movementX: event.movementX, movementY: event.movementY,
      clientX: event.clientX, clientY: event.clientY,
      canvasLocked: document.pointerLockElement === canvas,
      targetIsCanvas: event.target === canvas,
      timestampCompatible: Number.isFinite(event.timeStamp) && event.timeStamp >= 0 && event.timeStamp <= at,
      camera: cameraSnapshot(),
    };
    if (event.target !== canvas || event.movementX !== pending.requested.movementX
        || event.movementY !== pending.requested.movementY) settle('missed', 'unexpected-mouse-event');
  }

  function arm({ id, movementX, movementY = 0, latestArmAt = Infinity }) {
    if (disposed) throw new Error('Camera-input observer is disposed');
    if (pending) throw new Error('Only one camera-input pulse may be pending');
    if (records.length >= maxSamples) throw new Error('Camera-input sample bound reached');
    if (!Number.isInteger(id) || records.some(record => record.id === id)
        || !Number.isFinite(movementX) || movementX === 0 || movementY !== 0) {
      throw new Error('Require a unique integer pulse ID and finite nonzero horizontal movement');
    }
    const settings = D.input.getSettings();
    const record = {
      id, requested: { movementX, movementY }, armedAt: performance.now(),
      status: 'armed', event: null, response: null, raf: null, consumed: [], coalescedEvents: 0,
      settings: { sensitivity: settings.sensitivity, aimSmoothing: settings.aimSmoothing, invertY: settings.invertY },
    };
    records.push(record);
    const reason = performance.now() > latestArmAt ? 'response-window-exhausted'
      : activeReason() || (quietInputFrames < 2 ? 'mouse-input-not-quiet' : null);
    if (reason) {
      Object.assign(record, { status: 'unsupported', reason, completedAt: performance.now() });
      return { status: 'unsupported', id, reason };
    }
    pending = record;
    timer = setTimeout(() => settle('missed', pending?.response ? 'no-response-raf'
      : pending?.event ? 'no-matching-camera-response' : 'no-trusted-mouse-event'), responseTimeoutMs);
    return { status: 'armed', id };
  }

  function wait(id) {
    const record = records.find(item => item.id === id);
    if (!record) return Promise.reject(new Error('Unknown camera-input pulse'));
    if (record.status !== 'armed') return Promise.resolve(record);
    if (waiters.has(id)) return Promise.reject(new Error('Camera-input pulse already has a waiter'));
    return new Promise(resolve => waiters.set(id, resolve));
  }

  function snapshot() {
    return {
      protocol: 'trusted-mouse-camera-response-v1',
      metric: 'browser dispatch observed to consumed camera change and next RAF; not input-to-photon',
      responseTimeoutMs, maxSamples, disposed,
      requestedInputCount: records.length,
      observedInputCount: records.filter(record => record.status === 'responded').length,
      missedInputCount: records.filter(record => record.status === 'missed').length,
      unsupportedInputCount: records.filter(record => record.status === 'unsupported').length,
      ignored: { ...ignored }, errors: [...errors], records,
    };
  }

  function dispose() {
    if (disposed) return snapshot();
    disposed = true;
    settle('missed', 'observer-disposed');
    window.removeEventListener('mousemove', onMouseMove, true);
    if (D.rig.update === observedUpdate) D.rig.update = originalUpdate;
    else errors.push('Camera rig update ownership changed; foreign wrapper preserved');
    if (window.__PERF_CAMERA_INPUT === controller) delete window.__PERF_CAMERA_INPUT;
    return snapshot();
  }

  function slotState({ offsetMs, notBeforeAt = null, sampleMs, requireQuiet = true }) {
    const sample = window.__PERF, checkedAt = performance.now();
    const state = { status: 'waiting', checkedAt, quietInputFrames, windowStartedAt: sample?.startedAt ?? null };
    if (!Number.isFinite(sample?.startedAt)) return state;
    state.notBeforeAt = Math.max(sample.startedAt + offsetMs, notBeforeAt ?? -Infinity);
    state.latestArmAt = sample.startedAt + sampleMs - responseTimeoutMs;
    state.effectiveOffsetMs = state.notBeforeAt - sample.startedAt;
    if (sample.done || Math.max(checkedAt, state.notBeforeAt) > state.latestArmAt) {
      return { ...state, status: 'dropped', reason: sample.done
        ? 'sample-ended-before-schedule' : 'response-window-exhausted' };
    }
    if (checkedAt < state.notBeforeAt) return state;
    if (requireQuiet && !activeReason() && quietInputFrames < 2) return state;
    return { ...state, status: 'ready' };
  }

  const controller = {
    arm, wait, snapshot, dispose, slotState,
    availability() {
      const rect = canvas.getBoundingClientRect();
      return { reason: activeReason(), locked: document.pointerLockElement === canvas,
        bounds: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
    },
    rejectDispatch(id, message) {
      if (pending?.id === id) { errors.push(message); settle('missed', 'browser-dispatch-failed'); }
    },
  };
  try {
    window.addEventListener('mousemove', onMouseMove, true);
    D.rig.update = observedUpdate;
    window.__PERF_CAMERA_INPUT = controller;
  } catch (error) {
    window.removeEventListener('mousemove', onMouseMove, true);
    if (D.rig.update === observedUpdate) D.rig.update = originalUpdate;
    throw error;
  }
  return { protocol: 'trusted-mouse-camera-response-v1', installed: true };
}

/** Acquire the ordinary canvas lock through a trusted browser click. Call only
 * in released stable battle, before arming a pulse. Retain the returned CDP
 * coordinates; moving to center AFTER lock would itself inject a large delta. */
export async function prepareCameraInput(page, { x = 0, y = 0, lockTimeoutMs = 2000 } = {}) {
  const state = await page.evaluate(() => window.__PERF_CAMERA_INPUT.availability());
  if (state.reason && state.reason !== 'pointer-lock-unavailable') {
    return { status: 'unsupported', reason: state.reason, x, y };
  }
  if (state.locked) return { status: 'ready', x, y, gesture: 'already-locked' };
  const bounds = state.bounds;
  if (!(bounds.width > 0 && bounds.height > 0)) {
    return { status: 'unsupported', reason: 'canvas-has-no-area', x, y };
  }
  x = Math.round(bounds.left + bounds.width * 0.5);
  y = Math.round(bounds.top + bounds.height * 0.5);
  await page.mouse.move(x, y, { steps: 1 });
  let downError;
  try { await page.mouse.down({ button: 'left' }); }
  catch (error) { downError = error; }
  try { await page.mouse.up({ button: 'left' }); }
  catch (error) { if (!downError) throw error; }
  if (downError) throw downError;
  try {
    await page.waitForFunction(() => document.pointerLockElement === window.__DEBUG.renderer.domElement,
      { timeout: lockTimeoutMs });
  } catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    return { status: 'unsupported', reason: 'pointer-lock-unavailable', error: String(error), x, y };
  }
  const after = await page.evaluate(() => window.__PERF_CAMERA_INPUT.availability());
  return after.reason ? { status: 'unsupported', reason: after.reason, x, y }
    : { status: 'ready', x, y, gesture: 'trusted-canvas-click' };
}

/** The caller retains CDP coordinates across pulses; do not recenter a locked
 * mouse. Node dispatch round-trip clocks stay separate from browser timing. */
export async function dispatchCameraInputPulse(page, { id, x, y, movementX, latestArmAt }) {
  const armed = await page.evaluate(pulse => window.__PERF_CAMERA_INPUT.arm(pulse),
    { id, movementX, movementY: 0, latestArmAt });
  if (armed.status !== 'armed') return { ...armed, x, y, nodeDispatch: null };
  const dispatchStartedAt = performance.now();
  try { await page.mouse.move(x + movementX, y, { steps: 1 }); }
  catch (error) {
    try {
      await page.evaluate(({ id, message }) => window.__PERF_CAMERA_INPUT.rejectDispatch(id, message),
        { id, message: String(error) });
    } catch { /* retain the original browser dispatch failure */ }
    throw error;
  }
  const dispatchAcknowledgedAt = performance.now();
  const record = await page.evaluate(id => window.__PERF_CAMERA_INPUT.wait(id), id);
  return {
    x: x + movementX, y, record,
    nodeDispatch: { clock: 'node-performance', dispatchStartedAt, dispatchAcknowledgedAt,
      roundTripMs: dispatchAcknowledgedAt - dispatchStartedAt },
  };
}

/** Fixed opt-in acquisition schedule; the last pulse reserves its full timeout
 * before the timed window ends. Long probes retain the same bounded 64 pulses. */
export function cameraInputSchedule(sampleMs) {
  if (!Number.isFinite(sampleMs) || sampleMs <= 0) throw new Error('Invalid camera-input sample duration');
  const pulses = [];
  for (let offsetMs = 2000; offsetMs + 1000 <= sampleMs && pulses.length < 64; offsetMs += 2000) {
    const id = pulses.length + 1;
    pulses.push({ id, offsetMs, movementX: id % 2 ? 24 : -24 });
  }
  return pulses;
}

function recordCameraInputTiming(report, pulse, sampleMs, previousEventAt) {
  pulse.record ||= report.observer?.records.find(record => record.id === pulse.id) ?? null;
  pulse.dispatchOffsetMs = pulse.record ? pulse.record.armedAt - pulse.windowStartedAt : null;
  pulse.dispatchLatenessMs = pulse.record ? Math.max(0, pulse.dispatchOffsetMs - pulse.offsetMs) : null;
  pulse.eventOffsetMs = pulse.record?.event ? pulse.record.event.observedAt - pulse.windowStartedAt : null;
  const eventAt = pulse.record?.event?.observedAt;
  pulse.eventSpacingMs = Number.isFinite(eventAt) && previousEventAt !== null ? eventAt - previousEventAt : null;
  pulse.spacingMaintained = pulse.eventSpacingMs === null
    || eventAt >= previousEventAt + report.scheduling.minimumEventSpacingMs;
  pulse.withinWindow = eventAt >= pulse.windowStartedAt
    && pulse.record?.raf?.observedAt <= pulse.windowStartedAt + sampleMs;
  return Number.isFinite(eventAt) ? eventAt : previousEventAt;
}

function finishCameraInputWindow(report, sampleMs) {
  let previousEventAt = null;
  for (const pulse of report.pulses) previousEventAt = recordCameraInputTiming(report, pulse, sampleMs, previousEventAt);
  report.plannedInputCount = report.plan.length;
  report.attemptedInputCount = report.observer?.requestedInputCount ?? 0;
  report.observedInputCount = report.observer?.observedInputCount ?? 0;
  report.missedInputCount = report.observer?.missedInputCount ?? 0;
  report.unsupportedInputCount = report.observer?.unsupportedInputCount ?? 0;
  report.unattemptedInputCount = report.plan.length - report.attemptedInputCount;
  report.droppedInputCount = report.pulses.filter(pulse => pulse.status === 'dropped').length;
  report.lateInputCount = report.pulses.filter(pulse => pulse.dispatchLatenessMs > 0).length;
  report.spacingViolationCount = report.pulses.filter(pulse => !pulse.spacingMaintained).length;
  report.coveragePass = report.plan.length > 0 && report.pulses.length === report.plan.length
    && report.errors.length === 0 && report.observer?.errors?.length === 0 && report.observer?.disposed === true
    && report.pulses.every(pulse => pulse.record?.status === 'responded' && pulse.withinWindow && pulse.spacingMaintained);
  if (report.status === 'pending') report.status = report.coveragePass ? 'complete' : 'incomplete';
  return report;
}

async function waitForCameraInputSlot(page, settings, signal) {
  let state;
  do {
    const ready = await page.waitForFunction(settings =>
      window.__PERF_CAMERA_INPUT.slotState(settings).status !== 'waiting',
    { timeout: settings.sampleMs + 30000, polling: 'raf', signal }, settings);
    await ready.dispose();
    signal?.throwIfAborted();
    state = await page.evaluate(settings => window.__PERF_CAMERA_INPUT.slotState(settings), settings);
    signal?.throwIfAborted();
  } while (state.status === 'waiting'); // CDP delivery may cross another input/frame boundary.
  return state;
}

function dropCameraInputTail(report, pulse, slot) {
  report.reason = slot.reason;
  for (const remaining of report.plan.slice(pulse.id - 1)) {
    report.pulses.push({ ...remaining, status: 'dropped', reason: slot.reason,
      schedule: slot, windowStartedAt: slot.windowStartedAt });
  }
}

async function collectCameraInputPulses(page, report, { sampleMs, signal }, { prepare, dispatch }) {
  let x = 0, y = 0, previousEventAt = null;
  for (const pulse of report.plan) {
    signal?.throwIfAborted();
    const settings = { offsetMs: pulse.offsetMs, sampleMs, requireQuiet: !!report.preparation,
      notBeforeAt: previousEventAt === null ? null : previousEventAt + 2000 };
    let slot = await waitForCameraInputSlot(page, settings, signal);
    if (slot.status === 'dropped') { dropCameraInputTail(report, pulse, slot); break; }
    if (!report.preparation) {
      report.preparation = await prepare(page, { x, y });
      if (report.preparation.status !== 'ready') {
        report.status = 'unsupported'; report.reason = report.preparation.reason; break;
      }
      ({ x, y } = report.preparation);
      signal?.throwIfAborted();
      // The lock click/move is genuine input too. Wait for its unmodified
      // smoothing tail; it must not contaminate the first measured pulse.
      slot = await waitForCameraInputSlot(page, { ...settings, requireQuiet: true }, signal);
      if (slot.status === 'dropped') { dropCameraInputTail(report, pulse, slot); break; }
    }
    signal?.throwIfAborted();
    const result = await dispatch(page, { id: pulse.id, x, y, movementX: pulse.movementX,
      latestArmAt: slot.latestArmAt });
    ({ x, y } = result);
    previousEventAt = result.record?.event?.observedAt ?? result.record?.armedAt ?? slot.checkedAt;
    report.pulses.push({ ...pulse, ...result, schedule: slot, windowStartedAt: slot.windowStartedAt });
  }
}

/** Runs alongside the existing W/A/D/forceFire sample, never before its clock.
 * Abort belongs to the caller's browser lifetime. Failures retain their raw
 * rows and return explicit coverage status without discarding the FPS sample. */
export async function runCameraInputWindow(page, { sampleMs, signal }, dependencies = {}) {
  const prepare = dependencies.prepare ?? prepareCameraInput;
  const dispatch = dependencies.dispatch ?? dispatchCameraInputPulse;
  const report = {
    requested: true, protocol: CAMERA_INPUT_PROTOCOL, status: 'pending',
    metric: 'browser dispatch observed to consumed camera change and next RAF; not input-to-photon',
    plan: cameraInputSchedule(sampleMs), responseTimeoutMs: 1000,
    scheduling: { policy: 'minimum-spacing-quiet-v2', minimumEventSpacingMs: 2000,
      quietInputFrames: 2, latePolicy: 'delay-without-catch-up; drop-slots-without-full-response-window' },
    preparation: null, observer: null, pulses: [], errors: [],
  };
  let installed = false;
  try {
    signal?.throwIfAborted();
    if (!report.plan.length) {
      report.status = 'unsupported'; report.reason = 'window-too-short';
    } else {
      await page.evaluate(installCameraInputObserver, { responseTimeoutMs: 1000, maxSamples: report.plan.length });
      installed = true;
      await collectCameraInputPulses(page, report, { sampleMs, signal }, { prepare, dispatch });
    }
  } catch (error) {
    report.status = 'failed'; report.errors.push(String(error));
  } finally {
    if (installed) {
      try { report.observer = await page.evaluate(() => window.__PERF_CAMERA_INPUT?.dispose() ?? null); }
      catch (error) { report.status = 'failed'; report.errors.push(`Observer cleanup failed: ${error}`); }
    }
  }
  return finishCameraInputWindow(report, sampleMs);
}
