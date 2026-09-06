import type { RuntimeValue } from '../runtimeTypes.ts';
import type { NetworkRecoveryOwner } from './connectionRecovery.ts';

export interface NetworkSnapshot {
  tick: number;
  serverTimeMs?: RuntimeValue;
  ackInputSeq?: RuntimeValue;
  entities?: RuntimeValue;
  shells?: RuntimeValue;
  events?: RuntimeValue;
  immediateAuthority?: RuntimeValue;
  meta?: Record<string, RuntimeValue> | null;
}

export interface NetworkInputFrame {
  actionBits?: number;
  throttle?: number;
  steer?: number;
  brake?: boolean;
  fire?: boolean;
  aimLocked?: boolean;
}

export interface NetworkClientLike {
  closed: boolean;
  connected: boolean;
  readySent?: boolean;
  lastSubmittedInputSeq: number | null;
  lastSnapshotReceivedAtMs?: number | null;
  closeReason?: string | null;
  requestReconnect?(reason: string): void;
  onConnection?(listener: (connected: boolean) => void): (() => void) | void;
  drainEventsThrough?(tick: number, target: Record<string, RuntimeValue>[]): void;
  getStats?(): Record<string, RuntimeValue> | null;
  clearPendingInputIntent?(): void;
}

interface NetworkMatchBase {
  client: NetworkClientLike | null;
}

export interface NetworkHostMatchLike extends NetworkMatchBase {
  role: 'host';
  advance(dtMs: number, input: NetworkInputFrame | null): NetworkSnapshot | null;
}

export interface NetworkClientMatchLike extends NetworkMatchBase {
  role: 'client';
  update(nowMs: number): NetworkSnapshot | null;
  submitInput(input: NetworkInputFrame): boolean;
}

export type NetworkMatchLike = NetworkHostMatchLike | NetworkClientMatchLike;

export interface NetworkBridgeLike {
  apply(snapshot: NetworkSnapshot, dt: number, events?: RuntimeValue[]): void;
  advancePrediction(input: NetworkInputFrame | null, elapsedS: number): boolean;
  recordInput(
    input: NetworkInputFrame,
    elapsedS: number,
    sequence: number | null,
    presentationElapsedS?: number,
  ): boolean;
  endDisconnected?(): void;
  getPredictionStats?(): object | null;
  beginBackground?(): void;
  retainBackgroundState?(snapshot: NetworkSnapshot, events: RuntimeValue[]): void;
}

export interface NetworkStatusLike {
  readonly diagnosticsVisible?: boolean;
  set?(status: RuntimeValue): void;
  dispose?(): void;
  update(stats: Record<string, RuntimeValue> | null): void;
}

export interface NetworkInputRuntimeLike {
  frame(player: RuntimeValue): NetworkInputFrame | null;
  advance(dt: number): void;
  shouldSend(input: NetworkInputFrame): boolean;
  commit(input: NetworkInputFrame): number;
  acknowledge(actionBits: number): void;
  restore(actionBits: number): void;
  resetCadence(): void;
  reset(): void;
  queueAction(action: string): void;
  queueConsumable(slot: number): void;
}

interface NetworkFramePumpOptions {
  getMatch: () => NetworkMatchLike | null;
  getBridge: () => NetworkBridgeLike | null;
  getStatus: () => NetworkStatusLike | null;
  getPlayer: () => RuntimeValue;
  isBattleActive: () => boolean;
  shouldPresentDisconnect?: () => boolean;
  recovery: NetworkRecoveryOwner;
  nextFrame: () => Promise<RuntimeValue>;
  now?: () => number;
  onHostError?: (error: RuntimeValue) => void;
  onDisconnect?: (reason: string) => void;
  authorityStallMs?: number;
}

export interface NetworkFramePump {
  ensureInputRuntime(create: () => NetworkInputRuntimeLike): NetworkInputRuntimeLike;
  queueAction(action: string): void;
  queueConsumable(slot: number): void;
  pump(dt: number, nowMs: number): void;
  pumpBackground(nowMs: number): void;
  diagnostics(): Record<string, RuntimeValue> | null;
  waitForSnapshot(
    predicate: (snapshot: NetworkSnapshot) => boolean,
    timeoutMs: number,
    label: string,
  ): Promise<NetworkSnapshot>;
  clearRound(): void;
  dispose(): void;
  readonly latestSnapshot: NetworkSnapshot | null;
}

function authorityProgressTime(client: NetworkClientLike, startedAtMs: number | null, nowMs: number): number {
  const receivedAtMs = client.lastSnapshotReceivedAtMs;
  return receivedAtMs != null && Number.isFinite(receivedAtMs)
    ? receivedAtMs : startedAtMs ?? nowMs;
}

/** Own the complete per-frame browser match path and its reusable buffers. */
export function createNetworkFramePump({
  getMatch,
  getBridge,
  getStatus,
  getPlayer,
  isBattleActive,
  shouldPresentDisconnect = isBattleActive,
  recovery,
  nextFrame,
  now = () => performance.now(),
  onHostError = (error) => console.error('[network] host pump failed', error),
  onDisconnect,
  authorityStallMs = 5_000,
}: NetworkFramePumpOptions): NetworkFramePump {
  if ([getMatch, getBridge, getStatus, getPlayer, isBattleActive,
    shouldPresentDisconnect, nextFrame, now]
    .some((entry) => typeof entry !== 'function')) {
    throw new TypeError('network frame pump requires runtime accessors');
  }
  if (!Number.isFinite(authorityStallMs) || authorityStallMs <= 0) {
    throw new TypeError('authority stall grace must be positive milliseconds');
  }

  let inputRuntime: NetworkInputRuntimeLike | null = null;
  let latestSnapshot: NetworkSnapshot | null = null;
  const pendingEvents: Record<string, RuntimeValue>[] = [];
  let pumpClockMatch: NetworkMatchLike | null = null;
  let lastPumpNowMs: number | null = null;
  let backgroundActive = false;
  let backgroundInput: NetworkInputFrame | null = null;
  let authorityWatchStartedAtMs: number | null = null;
  let reconnectRequested = false;
  let inputUnavailable = false;
  let inputReceiptAtOutage: number | null = null;
  let terminal = false;
  let terminalReason = 'rtc_recovery_exhausted';

  const endConnection = (reason: string) => {
    if (terminal) return;
    terminal = true;
    terminalReason = reason;
    inputRuntime?.reset();
    getMatch()?.client?.clearPendingInputIntent?.();
    if (onDisconnect) onDisconnect(reason);
    else getBridge()?.endDisconnected?.();
  };

  const updateInputAvailability = (unavailable: boolean, client: NetworkClientLike): void => {
    if (unavailable && !inputUnavailable) {
      // Drop both unsubmitted browser edges and uploaded-but-unacknowledged
      // intent once per outage. Held controls are sampled anew after recovery.
      inputRuntime?.reset();
      client.clearPendingInputIntent?.();
      inputReceiptAtOutage = client.lastSnapshotReceivedAtMs ?? null;
    }
    if (unavailable) {
      inputUnavailable = true;
      return;
    }
    if (inputUnavailable && 'lastSnapshotReceivedAtMs' in client) {
      const receivedAtMs = client.lastSnapshotReceivedAtMs;
      if (receivedAtMs == null || !Number.isFinite(receivedAtMs) ||
          (inputReceiptAtOutage != null && receivedAtMs <= inputReceiptAtOutage)) return;
    }
    inputUnavailable = false;
    inputReceiptAtOutage = null;
  };

  const takeElapsed = (
    match: NetworkMatchLike, dt: number, nowMs: number, background = false,
  ): number => {
    if (!Number.isFinite(nowMs) || !Number.isFinite(dt) || dt < 0) {
      throw new TypeError('network pump timing must be finite and non-negative');
    }
    if (pumpClockMatch !== match) {
      pumpClockMatch = match;
      lastPumpNowMs = null;
      backgroundActive = false;
      backgroundInput = null;
      authorityWatchStartedAtMs = null;
      reconnectRequested = false;
      inputUnavailable = false;
      inputReceiptAtOutage = null;
      terminal = false;
    }
    const elapsed = Math.min(0.1, dt, lastPumpNowMs == null ? dt
      : nowMs <= lastPumpNowMs ? 0
      : background || backgroundActive ? (nowMs - lastPumpNowMs) / 1000 : dt);
    lastPumpNowMs = Math.max(lastPumpNowMs ?? nowMs, nowMs);
    return elapsed;
  };

  const connectionUnavailable = (match: NetworkMatchLike, nowMs: number): boolean => {
    const client = match.client;
    if (!client || terminal) return terminal;
    const eligible = shouldPresentDisconnect();
    const watchesAuthority = match.role === 'client' && eligible &&
      'lastSnapshotReceivedAtMs' in client;
    if (watchesAuthority && authorityWatchStartedAtMs === null) {
      authorityWatchStartedAtMs = nowMs;
    }
    const receivedAtMs = client.lastSnapshotReceivedAtMs;
    const lastProgressMs = authorityProgressTime(client, authorityWatchStartedAtMs, nowMs);
    const stalled = watchesAuthority && nowMs - lastProgressMs >= authorityStallMs;
    const awaitingAuthority = watchesAuthority && receivedAtMs == null &&
      recovery.snapshot(nowMs)?.recovering;
    const unavailable = client.closed || stalled || !!awaitingAuthority;
    updateInputAvailability(unavailable, client);
    if (stalled && !client.closed && !reconnectRequested) {
      reconnectRequested = true;
      client.requestReconnect?.('authority_stalled');
    }
    if (!unavailable) reconnectRequested = false;
    if (recovery.update(nowMs, unavailable, eligible,
      stalled ? 'authority_stalled' : client.closeReason || undefined)) {
      endConnection('rtc_recovery_exhausted');
    }
    return unavailable || terminal;
  };

  const acceptSnapshot = (snapshot: NetworkSnapshot | null, dt: number) => {
    if (!snapshot) return;
    latestSnapshot = snapshot;
    const bridge = getBridge();
    if (!bridge) return;
    pendingEvents.length = 0;
    getMatch()?.client?.drainEventsThrough?.(snapshot.tick, pendingEvents);
    bridge.apply(snapshot, dt, pendingEvents);
  };

  const diagnostics = () => {
    const stats = getMatch()?.client?.getStats?.() || null;
    if (!stats) return null;
    return { ...stats, prediction: getBridge()?.getPredictionStats?.() || null };
  };

  const pumpHost = (
    match: NetworkHostMatchLike,
    playerInput: NetworkInputFrame | null,
    bridge: NetworkBridgeLike | null,
    dt: number,
  ): void => {
    const submittedActionBits = playerInput?.actionBits || 0;
    if (submittedActionBits) inputRuntime?.acknowledge(submittedActionBits);
    try {
      const snapshot = match.advance(dt * 1000, playerInput);
      if (playerInput && match.client?.lastSubmittedInputSeq != null) {
        bridge?.recordInput(playerInput, dt, match.client.lastSubmittedInputSeq);
      } else if (!playerInput) {
        // A destroyed tank has no controls, but its terminal presentation still
        // settles on the display clock without advancing movement authority.
        bridge?.advancePrediction(null, dt);
      }
      acceptSnapshot(snapshot, dt);
    } catch (error) {
      inputRuntime?.restore(submittedActionBits);
      onHostError(error);
      endConnection('host_runtime_failed');
    }
  };

  const pumpClient = (
    match: NetworkClientMatchLike,
    playerInput: NetworkInputFrame | null,
    bridge: NetworkBridgeLike | null,
    dt: number,
    nowMs: number,
  ): void => {
    inputRuntime?.advance(dt);
    const client = match.client;
    let predictionAdvanced = false;
    if (playerInput && client?.connected && inputRuntime?.shouldSend(playerInput)) {
      if (match.submitInput(playerInput)) {
        const predictionElapsedS = inputRuntime.commit(playerInput);
        predictionAdvanced = bridge?.recordInput(
          playerInput,
          predictionElapsedS,
          client.lastSubmittedInputSeq,
          dt,
        ) || false;
      }
    } else if (!playerInput) {
      inputRuntime?.resetCadence();
    }
    // Packet upload cadence is intentionally independent from display refresh.
    // Advance local movement/articulation exactly once per rendered frame so
    // a 60 Hz display never alternates between a held pose and a batched jump.
    // Null controls still permit terminal correction-only presentation.
    if (!predictionAdvanced) bridge?.advancePrediction(playerInput, dt);
    acceptSnapshot(match.update(nowMs), dt);
  };

  const updateVisibleDiagnostics = (): void => {
    const status = getStatus();
    if (status?.diagnosticsVisible) status.update(diagnostics());
  };

  return {
    ensureInputRuntime(create) {
      if (!inputRuntime) inputRuntime = create();
      inputRuntime.reset();
      return inputRuntime;
    },

    queueAction(action) {
      if (!inputUnavailable && !terminal) inputRuntime?.queueAction(action);
    },
    queueConsumable(slot) {
      if (!inputUnavailable && !terminal) inputRuntime?.queueConsumable(slot);
    },

    pump(dt, nowMs) {
      const match = getMatch();
      if (!match) return;
      dt = takeElapsed(match, dt, nowMs);
      backgroundActive = false;
      backgroundInput = null;
      if (connectionUnavailable(match, nowMs)) return;

      const playerInput = isBattleActive() ? inputRuntime?.frame(getPlayer()) || null : null;
      const bridge = getBridge();
      if (match.role === 'host') {
        pumpHost(match, playerInput, bridge, dt);
      } else {
        pumpClient(match, playerInput, bridge, dt, nowMs);
      }
      updateVisibleDiagnostics();
    },

    pumpBackground(nowMs) {
      const match = getMatch();
      if (!match) return;
      const elapsed = takeElapsed(match, lastPumpNowMs == null ? 0 : 0.1, nowMs, true);
      if (backgroundActive && elapsed <= 0) return;
      if (!backgroundActive) {
        backgroundActive = true;
        // Relinquish local controls once per focus boundary. Keep the last
        // valid aim/ammo fields; only movement and queued action intent end.
        inputRuntime?.reset();
        match.client?.clearPendingInputIntent?.();
        getBridge()?.beginBackground?.();
        const sample = inputRuntime?.frame(getPlayer());
        backgroundInput = sample ? { ...sample, throttle: 0, steer: 0,
          brake: true, fire: false, aimLocked: true, actionBits: 0 } : null;
      }
      if (connectionUnavailable(match, nowMs)) return;
      let snapshot: NetworkSnapshot | null;
      if (match.role === 'host') {
        try { snapshot = match.advance(elapsed * 1000, backgroundInput); }
        catch (error) {
          onHostError(error);
          endConnection('host_runtime_failed');
          return;
        }
      } else {
        if (backgroundInput && match.client?.connected) match.submitInput(backgroundInput);
        snapshot = match.update(nowMs);
      }
      // No bridge.apply, prediction, HUD, FX or renderer work while hidden.
      // Transient presentation events are intentionally not replayed in a
      // burst on focus; persistent world/result state lives in snapshots.
      if (!snapshot) return;
      latestSnapshot = snapshot;
      pendingEvents.length = 0;
      match.client?.drainEventsThrough?.(snapshot.tick, pendingEvents);
      getBridge()?.retainBackgroundState?.(snapshot, pendingEvents);
      pendingEvents.length = 0;
    },

    diagnostics,

    async waitForSnapshot(predicate, timeoutMs, label) {
      if (typeof predicate !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
        throw new TypeError('snapshot wait requires a predicate and timeout');
      }
      const deadline = now() + timeoutMs;
      while (!latestSnapshot || !predicate(latestSnapshot)) {
        if (terminal) {
          throw Object.assign(new Error('The match connection could not recover.'), {
            code: terminalReason,
          });
        }
        const match = getMatch();
        if (!match) {
          throw new Error('The match connection closed while loading.');
        }
        if (now() >= deadline) throw new Error(label);
        // A closed transport generation is recoverable: private-room and
        // dedicated clients retain the same MatchClientRuntime while their
        // session replaces the underlying RTC/WebSocket channel. Keep the
        // covered loading barrier alive until the match owner disappears,
        // authority arrives, or the existing bounded timeout expires.
        await nextFrame();
      }
      return latestSnapshot;
    },

    clearRound() {
      latestSnapshot = null;
      pendingEvents.length = 0;
      backgroundActive = false;
      backgroundInput = null;
      authorityWatchStartedAtMs = null;
      reconnectRequested = false;
    },

    dispose() {
      inputRuntime?.reset();
      latestSnapshot = null;
      pendingEvents.length = 0;
      pumpClockMatch = null;
      lastPumpNowMs = null;
      backgroundActive = false;
      backgroundInput = null;
      authorityWatchStartedAtMs = null;
      reconnectRequested = false;
      inputUnavailable = false;
      inputReceiptAtOutage = null;
      terminal = false;
    },

    get latestSnapshot() { return latestSnapshot; },
  };
}
