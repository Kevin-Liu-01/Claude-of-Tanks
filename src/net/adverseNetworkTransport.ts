import type { RuntimeValue } from '../runtimeTypes.ts';
import { isSequenceNewer } from './protocol.ts';
type Unsubscribe = () => void;
type Lane = 'control' | 'input' | 'state';
type Direction = 'send' | 'receive';
type TimerHandle = ReturnType<typeof setTimeout>;

export interface NetworkSimulationOptions {
  latencyMs: number;
  jitterMs: number;
  stateLossRate: number;
  inputLossRate: number;
  /** QA only; each transport owns its own repeatable random stream. */
  netSeed?: number;
}

export interface AdverseNetworkOptions extends Partial<NetworkSimulationOptions> {
  rng?: () => number;
  clock?: () => number;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancel?: (handle: TimerHandle) => void;
}

export interface SimulatableTransport {
  readonly kind?: string;
  readonly readyState?: string;
  readonly bufferedAmount?: number;
  readonly stats?: RuntimeValue;
  send(message: RuntimeValue): boolean;
  sendInput?(message: RuntimeValue): boolean;
  sendState?(message: RuntimeValue): boolean;
  onMessage(listener: (message: RuntimeValue) => void): Unsubscribe;
  onClose?(listener: (reason: string) => void): Unsubscribe;
  onError?(listener: (error: RuntimeValue) => void): Unsubscribe;
  close?(reason?: string): void;
}

export interface AdverseNetworkStats {
  delayedOutgoing: number;
  delayedIncoming: number;
  droppedState: number;
  droppedInput: number;
  /** Stale sequence completions accepted by the base, not physical wire acknowledgements. */
  reorderedOutgoingInput: number;
  reorderedOutgoingState: number;
  /** Stale decoded sequences actually delivered to this wrapper's message listeners. */
  reorderedIncomingInput: number;
  reorderedIncomingState: number;
  netSeed: number | null;
  pending: number;
  base: RuntimeValue;
}

export interface AdverseNetworkTransport {
  readonly kind: string;
  readonly readyState: string;
  readonly bufferedAmount: number;
  readonly stats: AdverseNetworkStats;
  readonly rawTransport: SimulatableTransport;
  send(message: RuntimeValue): boolean;
  sendInput(message: RuntimeValue): boolean;
  sendState(message: RuntimeValue): boolean;
  onMessage(listener: (message: RuntimeValue) => void): Unsubscribe;
  onClose(listener: (reason: string) => void): Unsubscribe;
  onError(listener: (error: RuntimeValue) => void): Unsubscribe;
  close(reason?: string): void;
  dispose(): void;
}

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Browsers quantize timers to whole milliseconds (and may clamp them further
// in background tabs). A sub-millisecond due-time delta is therefore not an
// ordering guarantee even when the logical queue is reliable.
const RELIABLE_TIMER_GAP_MS = 1;

function numberParam(query: URLSearchParams, name: string, fallback = 0): number {
  if (!query.has(name)) return fallback;
  const value = Number(query.get(name));
  return Number.isFinite(value) ? value : fallback;
}

function assertSimulationSeed(seed: number): number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('netSeed must be a uint32 seed');
  }
  return seed;
}

/** Shared strict decimal parser for the browser query and explicit QA CLI. */
export function parseNetworkSimulationSeed(value: string): number {
  if (!/^\d+$/.test(value)) throw new TypeError('netSeed must be a decimal uint32 seed');
  return assertSimulationSeed(Number(value));
}

function seededRandom(seed: number): () => number {
  let state = assertSimulationSeed(seed);
  // Mulberry32 is a QA PRNG, never a source of IDs, capabilities or security entropy.
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Parse the browser QA query surface; netSeed alone never enables impairment. */
export function networkSimulationOptions(
  search = globalThis.location?.search || '',
): NetworkSimulationOptions | null {
  const query = new URLSearchParams(search);
  const enabled = query.get('netSim') === '1' ||
    ['netLatency', 'netJitter', 'netLoss', 'netInputLoss'].some((key) => query.has(key));
  if (!enabled) return null;
  const seeds = query.getAll('netSeed');
  if (seeds.length > 1) throw new TypeError('netSeed must specify one seed');
  return {
    latencyMs: clamp(numberParam(query, 'netLatency', 90), 0, 2000),
    jitterMs: clamp(numberParam(query, 'netJitter', 25), 0, 1000),
    stateLossRate: clamp(numberParam(query, 'netLoss', 5) / 100, 0, 1),
    inputLossRate: clamp(numberParam(query, 'netInputLoss', 0) / 100, 0, 1),
    ...(seeds.length ? { netSeed: parseNetworkSimulationSeed(seeds[0]) } : {}),
  };
}

/**
 * Deterministic-capable latency/jitter/loss wrapper used by browser QA and
 * headless soaks. Reliable control stays ordered; replaceable snapshots may
 * be delayed, reordered, or dropped like the production WebRTC state lane.
 */
export function createAdverseNetworkTransport(
  transport: SimulatableTransport,
  {
    latencyMs = 0,
    jitterMs = 0,
    stateLossRate = 0,
    inputLossRate = 0,
    netSeed,
    rng,
    clock = () => performance.now(),
    schedule = (callback, delayMs) => setTimeout(callback, delayMs),
    cancel = (handle) => clearTimeout(handle),
  }: AdverseNetworkOptions = {},
): AdverseNetworkTransport {
  if (!transport || typeof transport.send !== 'function' ||
      typeof transport.onMessage !== 'function') {
    throw new TypeError('transport is required');
  }
  for (const [label, value] of Object.entries({ stateLossRate, inputLossRate })) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new TypeError(`${label} must be in [0, 1]`);
    }
  }
  if (netSeed !== undefined && rng !== undefined) {
    throw new TypeError('choose netSeed or an injected rng, not both');
  }
  const random = rng ?? (netSeed === undefined ? Math.random : seededRandom(netSeed));
  const messages = new Set<(message: RuntimeValue) => void>();
  const closes = new Set<(reason: string) => void>();
  const errors = new Set<(error: RuntimeValue) => void>();
  const timers = new Set<TimerHandle>();
  let closed = false;
  let reliableSendDueMs = -Infinity;
  let reliableReceiveDueMs = -Infinity;
  const stats = {
    delayedOutgoing: 0,
    delayedIncoming: 0,
    droppedState: 0,
    droppedInput: 0,
    reorderedOutgoingInput: 0,
    reorderedOutgoingState: 0,
    reorderedIncomingInput: 0,
    reorderedIncomingState: 0,
  };
  const lastCompleted: Record<Direction, Record<'input' | 'state', number | null>> = {
    send: { input: null, state: null }, receive: { input: null, state: null },
  };
  const reorderCounters = {
    send: { input: 'reorderedOutgoingInput', state: 'reorderedOutgoingState' },
    receive: { input: 'reorderedIncomingInput', state: 'reorderedIncomingState' },
  } as const;

  function recordCompletion(direction: Direction, lane: Lane, message: RuntimeValue): void {
    if (lane === 'control' || !isRecord(message)) return;
    const sequence = message.seq;
    if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) ||
        sequence < 0 || sequence > 0x7fffffff) return;
    const previous = lastCompleted[direction][lane];
    if (previous === null || isSequenceNewer(sequence, previous)) {
      lastCompleted[direction][lane] = sequence;
    } else if (sequence !== previous) {
      stats[reorderCounters[direction][lane]]++;
    }
  }

  function shouldDrop(lane: Lane): boolean {
    const loss = lane === 'state' ? stateLossRate : lane === 'input' ? inputLossRate : 0;
    if (!(loss > 0 && random() < loss)) return false;
    if (lane === 'state') stats.droppedState++;
    else stats.droppedInput++;
    return true;
  }

  function delayFor(): number {
    const unit = Number(random());
    const centered = (Number.isFinite(unit) ? clamp(unit, 0, 1) : 0.5) * 2 - 1;
    return Math.max(0, latencyMs + centered * jitterMs);
  }

  function later(callback: () => void, delayMs: number): TimerHandle {
    let handle: TimerHandle;
    handle = schedule(() => {
      timers.delete(handle);
      if (!closed) callback();
    }, delayMs);
    timers.add(handle);
    return handle;
  }

  function orderedDelay(direction: Direction): number {
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

  function reportError(error: RuntimeValue): void {
    for (const listener of [...errors]) listener(error);
  }

  function scheduleSend(message: RuntimeValue, lane: Lane = 'control'): boolean {
    if (closed || transport.readyState === 'closed') return false;
    const state = lane === 'state';
    const input = lane === 'input';
    if (shouldDrop(lane)) return true;
    const delay = state || input ? delayFor() : orderedDelay('send');
    stats.delayedOutgoing++;
    later(() => {
      try {
        const accepted = state && typeof transport.sendState === 'function'
          ? transport.sendState(message)
          : input && typeof transport.sendInput === 'function'
            ? transport.sendInput(message) : transport.send(message);
        if (accepted) recordCompletion('send', lane, message);
      } catch (error) {
        reportError(error);
      }
    }, delay);
    return true;
  }

  const removeMessage = transport.onMessage((message) => {
    const lane: Lane = isRecord(message) && message.type === 'snapshot' ? 'state'
      : isRecord(message) && message.type === 'input' ? 'input' : 'control';
    if (shouldDrop(lane)) return;
    const delay = lane === 'control' ? orderedDelay('receive') : delayFor();
    stats.delayedIncoming++;
    later(() => {
      // Handoff may remove every consumer while this packet is delayed.
      // Only observed delivery may advance the receive-order watermark.
      if (messages.size === 0) return;
      recordCompletion('receive', lane, message);
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
    ? transport.onError(reportError)
    : () => {};

  return {
    kind: `${transport.kind || 'transport'}-simulated`,
    send(message: RuntimeValue): boolean { return scheduleSend(message, 'control'); },
    sendInput(message: RuntimeValue): boolean { return scheduleSend(message, 'input'); },
    sendState(message: RuntimeValue): boolean { return scheduleSend(message, 'state'); },
    onMessage(listener: (message: RuntimeValue) => void): Unsubscribe {
      messages.add(listener);
      return () => messages.delete(listener);
    },
    onClose(listener: (reason: string) => void): Unsubscribe {
      closes.add(listener);
      return () => closes.delete(listener);
    },
    onError(listener: (error: RuntimeValue) => void): Unsubscribe {
      errors.add(listener);
      return () => errors.delete(listener);
    },
    close(reason = 'closed'): void {
      if (closed) return;
      closed = true;
      for (const handle of timers) cancel(handle);
      timers.clear();
      transport.close?.(reason);
    },
    dispose(): void {
      removeMessage();
      removeClose();
      removeError();
      for (const handle of timers) cancel(handle);
      timers.clear();
      messages.clear();
      closes.clear();
      errors.clear();
    },
    get readyState() { return closed ? 'closed' : transport.readyState || 'open'; },
    get bufferedAmount() { return Number(transport.bufferedAmount) || 0; },
    get stats(): AdverseNetworkStats {
      return { ...stats, netSeed: netSeed ?? null, pending: timers.size, base: transport.stats || null };
    },
    rawTransport: transport,
  };
}

export function maybeCreateAdverseNetworkTransport<T extends SimulatableTransport>(
  transport: T,
  search?: string,
): T | AdverseNetworkTransport {
  const options = networkSimulationOptions(search);
  return options ? createAdverseNetworkTransport(transport, options) : transport;
}
