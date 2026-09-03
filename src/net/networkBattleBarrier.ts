import type { RuntimeValue } from '../runtimeTypes.ts';
import type { NetworkSnapshot } from './networkFramePump.ts';

interface ReadyClientLike {
  readonly closed?: boolean;
}

interface ReadyMatchLike {
  readonly client?: ReadyClientLike | null;
  ready(): RuntimeValue;
}

type WaitForSnapshot = (
  predicate: (snapshot: NetworkSnapshot) => boolean,
  timeoutMs: number,
  label: string,
) => Promise<NetworkSnapshot>;

interface NetworkBattleBarrierOptions {
  getMatch: () => ReadyMatchLike | null;
  waitForSnapshot: WaitForSnapshot;
  scheduleRepeating?: (callback: () => void, intervalMs: number) => RuntimeValue;
  cancelRepeating?: (handle: RuntimeValue) => void;
  retryMs?: number;
  timeoutMs?: number;
}

interface InitialSnapshotRequest {
  viewerId: string;
  spectator?: boolean;
}

export interface NetworkBattleBarrier {
  waitForInitialSnapshot(request: InitialSnapshotRequest): Promise<NetworkSnapshot>;
  waitForPeerReadiness(): Promise<NetworkSnapshot>;
  cancel(): void;
}

/**
 * Own both authoritative load barriers and the idempotent READY retry lease.
 * A rematch/disconnect can cancel the lease without leaving a timer from the
 * previous match able to announce readiness into the next round.
 */
export function createNetworkBattleBarrier({
  getMatch,
  waitForSnapshot,
  scheduleRepeating = (callback, intervalMs) => setInterval(callback, intervalMs),
  cancelRepeating = (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  retryMs = 1000,
  timeoutMs = 60000,
}: NetworkBattleBarrierOptions): NetworkBattleBarrier {
  if (typeof getMatch !== 'function' || typeof waitForSnapshot !== 'function'
    || typeof scheduleRepeating !== 'function' || typeof cancelRepeating !== 'function') {
    throw new TypeError('network battle barrier requires match, snapshot, and timer ports');
  }
  if (!Number.isFinite(retryMs) || retryMs <= 0
    || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('network battle barrier intervals must be positive and finite');
  }

  let readyLease: RuntimeValue = null;
  let generation = 0;

  const cancel = () => {
    generation += 1;
    if (readyLease !== null) cancelRepeating(readyLease);
    readyLease = null;
  };

  return {
    waitForInitialSnapshot({ viewerId, spectator = false }) {
      if (!spectator && !viewerId) {
        throw new TypeError('network battle barrier requires a viewer identity');
      }
      return waitForSnapshot(
        (snapshot) => {
          const entities = Array.isArray(snapshot.entities) ? snapshot.entities : [];
          return spectator
            ? entities.length > 0
            : entities.some((entity: RuntimeValue) => entity
              && typeof entity === 'object'
              && 'id' in entity
              && entity.id === viewerId);
        },
        timeoutMs,
        'Timed out waiting for the first authoritative snapshot.',
      );
    },

    async waitForPeerReadiness() {
      cancel();
      const match = getMatch();
      if (!match || typeof match.ready !== 'function') {
        throw new Error('The match connection closed while loading.');
      }
      const leaseGeneration = generation;
      match.ready();
      readyLease = scheduleRepeating(() => {
        if (generation !== leaseGeneration || getMatch() !== match || match.client?.closed) return;
        match.ready();
      }, retryMs);
      try {
        return await waitForSnapshot(
          (snapshot) => snapshot.meta?.phase === 'countdown'
            || snapshot.meta?.phase === 'playing',
          timeoutMs,
          'Another player did not finish loading in time.',
        );
      } finally {
        if (generation === leaseGeneration) cancel();
      }
    },

    cancel,
  };
}
