function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Browsers quantize timers to whole milliseconds (and may clamp them further
// in background tabs). A sub-millisecond due-time delta is therefore not an
// ordering guarantee even when the logical queue is reliable.
const RELIABLE_TIMER_GAP_MS = 1;

function numberParam(query, name, fallback = 0) {
  if (!query.has(name)) return fallback;
  const value = Number(query.get(name));
  return Number.isFinite(value) ? value : fallback;
}

/** Parse the browser QA query surface (`netLatency`, `netJitter`, `netLoss`). */
export function networkSimulationOptions(search = globalThis.location?.search || '') {
  const query = new URLSearchParams(search);
  const enabled = query.get('netSim') === '1' ||
    ['netLatency', 'netJitter', 'netLoss', 'netInputLoss'].some((key) => query.has(key));
  if (!enabled) return null;
  return {
    latencyMs: clamp(numberParam(query, 'netLatency', 90), 0, 2000),
    jitterMs: clamp(numberParam(query, 'netJitter', 25), 0, 1000),
    stateLossRate: clamp(numberParam(query, 'netLoss', 5) / 100, 0, 1),
    inputLossRate: clamp(numberParam(query, 'netInputLoss', 0) / 100, 0, 1),
  };
}

/**
 * Deterministic-capable latency/jitter/loss wrapper used by browser QA and
 * headless soaks. Reliable control stays ordered; replaceable snapshots may
 * be delayed, reordered, or dropped like the production WebRTC state lane.
 */
export function createAdverseNetworkTransport(transport, {
  latencyMs = 0,
  jitterMs = 0,
  stateLossRate = 0,
  inputLossRate = 0,
  rng = Math.random,
  clock = () => performance.now(),
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancel = (handle) => clearTimeout(handle),
} = {}) {
  if (!transport || typeof transport.send !== 'function' ||
      typeof transport.onMessage !== 'function') {
    throw new TypeError('transport is required');
  }
  for (const [label, value] of Object.entries({ stateLossRate, inputLossRate })) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new TypeError(`${label} must be in [0, 1]`);
    }
  }
  const messages = new Set();
  const closes = new Set();
  const errors = new Set();
  const timers = new Set();
  let closed = false;
  let reliableSendDueMs = -Infinity;
  let reliableReceiveDueMs = -Infinity;
  const stats = {
    delayedOutgoing: 0,
    delayedIncoming: 0,
    droppedState: 0,
    droppedInput: 0,
  };

  function delayFor() {
    const unit = Number(rng());
    const centered = (Number.isFinite(unit) ? clamp(unit, 0, 1) : 0.5) * 2 - 1;
    return Math.max(0, latencyMs + centered * jitterMs);
  }

  function later(callback, delayMs) {
    let handle = null;
    handle = schedule(() => {
      timers.delete(handle);
      if (!closed) callback();
    }, delayMs);
    timers.add(handle);
    return handle;
  }

  function orderedDelay(direction) {
    const now = clock();
    let due = now + delayFor();
    if (direction === 'send') {
      due = Math.max(due, reliableSendDueMs + RELIABLE_TIMER_GAP_MS);
      reliableSendDueMs = due;
    } else {
      due = Math.max(due, reliableReceiveDueMs + RELIABLE_TIMER_GAP_MS);
      reliableReceiveDueMs = due;
    }
    return Math.max(0, due - now);
  }

  function scheduleSend(message, lane = 'control') {
    if (closed || transport.readyState === 'closed') return false;
    const state = lane === 'state';
    const input = lane === 'input';
    const loss = state ? stateLossRate : input ? inputLossRate : 0;
    if (loss > 0 && rng() < loss) {
      if (state) stats.droppedState++;
      else if (input) stats.droppedInput++;
      return true;
    }
    const delay = state || input ? delayFor() : orderedDelay('send');
    stats.delayedOutgoing++;
    later(() => {
      try {
        if (state && typeof transport.sendState === 'function') transport.sendState(message);
        else if (input && typeof transport.sendInput === 'function') transport.sendInput(message);
        else transport.send(message);
      } catch (error) {
        for (const listener of [...errors]) listener(error);
      }
    }, delay);
    return true;
  }

  const removeMessage = transport.onMessage((message) => {
    const state = message?.type === 'snapshot';
    if (state && stateLossRate > 0 && rng() < stateLossRate) {
      stats.droppedState++;
      return;
    }
    const delay = state ? delayFor() : orderedDelay('receive');
    stats.delayedIncoming++;
    later(() => {
      for (const listener of [...messages]) listener(message);
    }, delay);
  });
  const removeClose = typeof transport.onClose === 'function'
    ? transport.onClose((reason) => {
      closed = true;
      for (const handle of timers) cancel(handle);
      timers.clear();
      for (const listener of [...closes]) listener(reason);
    })
    : () => {};
  const removeError = typeof transport.onError === 'function'
    ? transport.onError((error) => {
      for (const listener of [...errors]) listener(error);
    })
    : () => {};

  return {
    kind: `${transport.kind || 'transport'}-simulated`,
    send(message) { return scheduleSend(message, 'control'); },
    sendInput(message) { return scheduleSend(message, 'input'); },
    sendState(message) { return scheduleSend(message, 'state'); },
    onMessage(listener) { messages.add(listener); return () => messages.delete(listener); },
    onClose(listener) { closes.add(listener); return () => closes.delete(listener); },
    onError(listener) { errors.add(listener); return () => errors.delete(listener); },
    close(reason = 'closed') {
      if (closed) return;
      closed = true;
      for (const handle of timers) cancel(handle);
      timers.clear();
      transport.close(reason);
    },
    dispose() {
      removeMessage();
      removeClose();
      removeError();
      for (const handle of timers) cancel(handle);
      timers.clear();
      messages.clear();
      closes.clear();
      errors.clear();
    },
    get readyState() { return closed ? 'closed' : transport.readyState; },
    get bufferedAmount() { return Number(transport.bufferedAmount) || 0; },
    get stats() { return { ...stats, pending: timers.size, base: transport.stats || null }; },
    rawTransport: transport,
  };
}

export function maybeCreateAdverseNetworkTransport(transport, search) {
  const options = networkSimulationOptions(search);
  return options ? createAdverseNetworkTransport(transport, options) : transport;
}
