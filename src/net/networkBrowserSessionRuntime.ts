import type { RuntimeValue } from '../runtimeTypes.ts';
import { createNetworkBattleBarrier } from './networkBattleBarrier.ts';
import { createNetworkRecoveryOwner } from './connectionRecovery.ts';
import {
  createNetworkFramePump,
  type NetworkBridgeLike,
  type NetworkInputRuntimeLike,
  type NetworkMatchLike,
  type NetworkSnapshot,
  type NetworkStatusLike,
} from './networkFramePump.ts';
import type { SampledSnapshotFrame } from './snapshot.ts';

export type NetworkBrowserMatch = NetworkMatchLike & {
  playerId?: string;
  ready(): RuntimeValue;
  close(reason?: string): RuntimeValue;
};

export interface NetworkBrowserBridge extends NetworkBridgeLike {
  entities: Map<string, RuntimeValue>;
  dispose(): void;
  getPresentationEventStats?(): Record<string, RuntimeValue> | null;
}

export interface NetworkBrowserStatus extends NetworkStatusLike {
  set(status: RuntimeValue): void;
  dispose(): void;
}

interface NetworkBrowserSessionOptions {
  getPlayer(): RuntimeValue;
  isBattleActive(): boolean;
  shouldPresentDisconnect(): boolean;
  nextFrame(): Promise<RuntimeValue>;
  onHostError?: (error: RuntimeValue) => void;
  onDisconnect?: (reason: string) => void;
}

export interface NetworkBrowserSessionRuntime {
  publishMatch(match: NetworkBrowserMatch): void;
  publishBridge(bridge: NetworkBrowserBridge): void;
  publishStatus(status: NetworkBrowserStatus): void;
  attachRecovery(): void;
  ensureInputRuntime(create: () => NetworkInputRuntimeLike): NetworkInputRuntimeLike;
  queueAction(action: string): void;
  queueConsumable(slot: number): void;
  pump(dt: number, nowMs: number): void;
  pumpBackground(nowMs: number): void;
  waitForInitialSnapshot(
    request: { viewerId: string; spectator?: boolean },
  ): Promise<SampledSnapshotFrame>;
  waitForPeerReadiness(): Promise<SampledSnapshotFrame>;
  clearRound(): void;
  disposePresentation(): void;
  close(reason?: string): void;
  setSpectator(spectator: boolean): void;
  resolveEntity(id: string): RuntimeValue;
  diagnostics(): Record<string, RuntimeValue> | null;
  readonly match: NetworkBrowserMatch | null;
  readonly bridge: NetworkBrowserBridge | null;
  readonly status: NetworkBrowserStatus | null;
  readonly spectator: boolean;
  readonly latestSnapshot: SampledSnapshotFrame | null;
}

function isSampledSnapshotFrame(
  snapshot: NetworkSnapshot | null,
): snapshot is SampledSnapshotFrame {
  return !!snapshot && Number.isSafeInteger(snapshot.tick) && snapshot.tick >= 0 &&
    Number.isFinite(snapshot.serverTimeMs) &&
    (snapshot.ackInputSeq === null || Number.isSafeInteger(snapshot.ackInputSeq)) &&
    Array.isArray(snapshot.entities) && Array.isArray(snapshot.shells) &&
    Array.isArray(snapshot.events) &&
    (snapshot.meta === null ||
      (typeof snapshot.meta === 'object' && !Array.isArray(snapshot.meta))) &&
    (snapshot.immediateAuthority === null ||
      (typeof snapshot.immediateAuthority === 'object' &&
        !Array.isArray(snapshot.immediateAuthority)));
}

function requireSampledSnapshot(snapshot: NetworkSnapshot): SampledSnapshotFrame {
  if (!isSampledSnapshotFrame(snapshot)) {
    throw new TypeError('network session received an incomplete sampled snapshot');
  }
  return snapshot;
}

/**
 * Owns the mutable browser-network session and the exact teardown order for
 * its frame pump, readiness lease, recovery listener, status, and bridge.
 * Callers can compose presentation ports without independently retaining any
 * of those resources or republishing a second live session.
 */
export function createNetworkBrowserSessionRuntime({
  getPlayer,
  isBattleActive,
  shouldPresentDisconnect,
  nextFrame,
  onHostError,
  onDisconnect,
}: NetworkBrowserSessionOptions): NetworkBrowserSessionRuntime {
  if ([getPlayer, isBattleActive, shouldPresentDisconnect, nextFrame]
    .some((entry) => typeof entry !== 'function')) {
    throw new TypeError('network browser session requires player, phase, and frame ports');
  }

  let match: NetworkBrowserMatch | null = null;
  let bridge: NetworkBrowserBridge | null = null;
  let status: NetworkBrowserStatus | null = null;
  let spectator = false;

  const recovery = createNetworkRecoveryOwner();
  const framePump = createNetworkFramePump({
    getMatch: () => match,
    getBridge: () => bridge,
    getStatus: () => status,
    getPlayer,
    isBattleActive,
    shouldPresentDisconnect,
    recovery,
    nextFrame,
    onHostError,
    onDisconnect,
  });
  const barrier = createNetworkBattleBarrier({
    getMatch: () => match,
    waitForSnapshot: (predicate, timeoutMs, label) =>
      framePump.waitForSnapshot(predicate, timeoutMs, label),
  });

  const disposePresentation = () => {
    barrier.cancel();
    recovery.dispose();
    framePump.dispose();
    bridge?.dispose();
    status?.dispose();
    bridge = null;
    status = null;
    spectator = false;
  };

  return {
    publishMatch(nextMatch) {
      if (!nextMatch || typeof nextMatch.close !== 'function') {
        throw new TypeError('network browser session requires a closeable match');
      }
      if (match && match !== nextMatch) {
        nextMatch.close('superseded_before_publish');
        throw new Error('A different network match already owns this browser session.');
      }
      match = nextMatch;
    },

    publishBridge(nextBridge) {
      if (!nextBridge || typeof nextBridge.dispose !== 'function') {
        throw new TypeError('network browser session requires a disposable bridge');
      }
      if (bridge && bridge !== nextBridge) {
        nextBridge.dispose();
        throw new Error('A different network bridge already owns presentation.');
      }
      bridge = nextBridge;
    },

    publishStatus(nextStatus) {
      if (!nextStatus || typeof nextStatus.dispose !== 'function') {
        throw new TypeError('network browser session requires a disposable status surface');
      }
      if (status && status !== nextStatus) {
        nextStatus.dispose();
        throw new Error('A different network status surface already owns presentation.');
      }
      status = nextStatus;
    },

    attachRecovery() { recovery.attach(match?.client ?? null, status); },
    ensureInputRuntime: (create) => framePump.ensureInputRuntime(create),
    queueAction: (action) => framePump.queueAction(action),
    queueConsumable: (slot) => framePump.queueConsumable(slot),
    pump: (dt, nowMs) => framePump.pump(dt, nowMs),
    pumpBackground: (nowMs) => framePump.pumpBackground(nowMs),
    waitForInitialSnapshot: async (request) =>
      requireSampledSnapshot(await barrier.waitForInitialSnapshot(request)),
    waitForPeerReadiness: async () =>
      requireSampledSnapshot(await barrier.waitForPeerReadiness()),
    clearRound: () => framePump.clearRound(),
    disposePresentation,

    close(reason = 'network_match_closed') {
      const closing = match;
      match = null;
      closing?.close(reason);
      disposePresentation();
    },

    setSpectator(value) { spectator = !!value; },
    resolveEntity(id) { return bridge?.entities.get(id) ?? null; },
    diagnostics: () => framePump.diagnostics(),

    get match() { return match; },
    get bridge() { return bridge; },
    get status() { return status; },
    get spectator() { return spectator; },
    get latestSnapshot() {
      const snapshot = framePump.latestSnapshot;
      return isSampledSnapshotFrame(snapshot) ? snapshot : null;
    },
  };
}
