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
}

export interface NetworkClientLike {
  closed: boolean;
  connected: boolean;
  readySent?: boolean;
  lastSubmittedInputSeq: number | null;
  onConnection?(listener: (connected: boolean) => void): (() => void) | void;
  drainEventsThrough?(tick: number, target: Record<string, RuntimeValue>[]): void;
  getStats?(): Record<string, RuntimeValue> | null;
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
  advancePrediction(input: NetworkInputFrame, elapsedS: number): boolean;
  recordInput(
    input: NetworkInputFrame,
    elapsedS: number,
    sequence: number | null,
    presentationElapsedS?: number,
  ): boolean;
  endDisconnected?(): void;
  getPredictionStats?(): object | null;
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
}

export interface NetworkFramePump {
  ensureInputRuntime(create: () => NetworkInputRuntimeLike): NetworkInputRuntimeLike;
  queueAction(action: string): void;
  queueConsumable(slot: number): void;
  pump(dt: number, nowMs: number): void;
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
}: NetworkFramePumpOptions): NetworkFramePump {
  if ([getMatch, getBridge, getStatus, getPlayer, isBattleActive,
    shouldPresentDisconnect, nextFrame, now]
    .some((entry) => typeof entry !== 'function')) {
    throw new TypeError('network frame pump requires runtime accessors');
  }

  let inputRuntime: NetworkInputRuntimeLike | null = null;
  let latestSnapshot: NetworkSnapshot | null = null;
  const pendingEvents: Record<string, RuntimeValue>[] = [];

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
      }
      acceptSnapshot(snapshot, dt);
    } catch (error) {
      inputRuntime?.restore(submittedActionBits);
      onHostError(error);
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
    if (playerInput && !predictionAdvanced) bridge?.advancePrediction(playerInput, dt);
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

    queueAction(action) { inputRuntime?.queueAction(action); },
    queueConsumable(slot) { inputRuntime?.queueConsumable(slot); },

    pump(dt, nowMs) {
      const match = getMatch();
      if (!match) return;
      if (match.client?.closed) {
        if (recovery.update(nowMs, true, shouldPresentDisconnect())) {
          getBridge()?.endDisconnected?.();
        }
        return;
      }

      const playerInput = isBattleActive() ? inputRuntime?.frame(getPlayer()) || null : null;
      const bridge = getBridge();
      if (match.role === 'host') {
        pumpHost(match, playerInput, bridge, dt);
      } else {
        pumpClient(match, playerInput, bridge, dt, nowMs);
      }
      updateVisibleDiagnostics();
    },

    diagnostics,

    async waitForSnapshot(predicate, timeoutMs, label) {
      if (typeof predicate !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
        throw new TypeError('snapshot wait requires a predicate and timeout');
      }
      const deadline = now() + timeoutMs;
      while (!latestSnapshot || !predicate(latestSnapshot)) {
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
    },

    dispose() {
      inputRuntime?.reset();
      latestSnapshot = null;
      pendingEvents.length = 0;
    },

    get latestSnapshot() { return latestSnapshot; },
  };
}
