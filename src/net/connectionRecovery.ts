export type NetworkConnectionState =
  | 'connected'
  | 'reconnecting'
  | 'reconnected'
  | 'failed'
  | 'closed';

export interface NetworkConnectionStatusSink {
  set(update: { state: NetworkConnectionState; attempt?: number; reason?: string }): void;
}

export interface RecoverableMatchClient {
  readonly closed?: boolean;
  readonly closeReason?: string | null;
  readonly lastSnapshotReceivedAtMs?: number | null;
  onConnection?(listener: (connected: boolean) => void): (() => void) | void;
}

export interface NetworkRecoverySnapshot {
  recovering: boolean;
  failed: boolean;
  attempt: number;
  disconnectedForMs: number;
}

export interface NetworkRecoveryOwner {
  attach(client: RecoverableMatchClient | null, status: NetworkConnectionStatusSink | null): void;
  update(nowMs: number, unavailable: boolean, eligibleToFail: boolean, reason?: string): boolean;
  snapshot(nowMs: number): NetworkRecoverySnapshot;
  dispose(): void;
}

interface NetworkRecoveryOptions {
  graceMs?: number;
  attemptIntervalMs?: number;
  now?: () => number;
}

/**
 * Own the presentation policy for a recoverable match connection.
 *
 * Transport replacement stays in the networking session. This owner only
 * keeps one status surface stable, advances its bounded attempt label, and
 * emits one expiry edge after the recovery grace. Repeated close events are
 * intentionally idempotent so a flapping data channel cannot make the UI
 * pulse or mount parallel disconnect flows.
 */
export function createNetworkRecoveryOwner({
  graceMs = 60_000,
  attemptIntervalMs = 5_000,
  now = () => performance.now(),
}: NetworkRecoveryOptions = {}): NetworkRecoveryOwner {
  if (!Number.isFinite(graceMs) || graceMs < 0 ||
      !Number.isFinite(attemptIntervalMs) || attemptIntervalMs <= 0) {
    throw new TypeError('network recovery timings must be valid milliseconds');
  }
  if (typeof now !== 'function') throw new TypeError('network recovery clock must be a function');

  let status: NetworkConnectionStatusSink | null = null;
  let unsubscribe: (() => void) | null = null;
  let disconnectedAtMs: number | null = null;
  let attempt = 0;
  let failed = false;
  let generation = 0;
  let failureReason: string | undefined;

  const reset = () => {
    disconnectedAtMs = null;
    attempt = 0;
    failed = false;
    failureReason = undefined;
  };

  const markDisconnected = (atMs: number, reason?: string) => {
    if (reason) failureReason = reason;
    if (disconnectedAtMs !== null) return;
    disconnectedAtMs = atMs;
    attempt = 1;
    status?.set({ state: 'reconnecting', attempt,
      ...(failureReason ? { reason: failureReason } : {}) });
  };

  const handleConnection = (connected: boolean) => {
    if (failed) return;
    if (!connected) {
      markDisconnected(now());
      return;
    }
    const wasRecovering = disconnectedAtMs !== null;
    reset();
    if (wasRecovering) status?.set({ state: 'reconnected' });
  };

  const dispose = () => {
    generation++;
    unsubscribe?.();
    unsubscribe = null;
    status = null;
    reset();
  };

  return {
    attach(client, nextStatus) {
      dispose();
      status = nextStatus;
      if (!client?.onConnection) return;
      const attachedGeneration = generation;
      unsubscribe = client.onConnection((connected) => {
        if (generation !== attachedGeneration || failed) return;
        if (!connected) markDisconnected(now(), client.closeReason || undefined);
        // WELCOME alone does not prove a stalled authority resumed. The frame
        // pump clears this grace only when a fresh snapshot has arrived.
        else if (!('lastSnapshotReceivedAtMs' in client)) handleConnection(true);
      }) || null;
    },

    update(nowMs, unavailable, eligibleToFail, reason) {
      if (!Number.isFinite(nowMs)) throw new TypeError('network recovery time must be finite');
      if (failed) return false;
      if (!unavailable) {
        handleConnection(true);
        return false;
      }
      markDisconnected(nowMs, reason);
      const disconnectedForMs = Math.max(0, nowMs - (disconnectedAtMs ?? nowMs));
      const nextAttempt = Math.max(1, Math.floor(disconnectedForMs / attemptIntervalMs) + 1);
      if (nextAttempt !== attempt) {
        attempt = nextAttempt;
        status?.set({ state: 'reconnecting', attempt,
          ...(failureReason ? { reason: failureReason } : {}) });
      }
      if (!eligibleToFail || failed || disconnectedForMs < graceMs) return false;
      failed = true;
      status?.set({ state: 'failed', ...(failureReason ? { reason: failureReason } : {}) });
      return true;
    },

    snapshot(nowMs) {
      if (!Number.isFinite(nowMs)) throw new TypeError('network recovery time must be finite');
      return {
        recovering: disconnectedAtMs !== null,
        failed,
        attempt,
        disconnectedForMs: disconnectedAtMs === null
          ? 0 : Math.max(0, nowMs - disconnectedAtMs),
      };
    },

    dispose,
  };
}
