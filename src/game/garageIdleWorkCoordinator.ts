export type GarageIdleWorkKind =
  | 'world-intent'
  | 'pedestal-neighbors'
  | 'world'
  | 'dressing';

export interface GarageIdleWorkLease {
  readonly kind: GarageIdleWorkKind;
  release(): void;
}

export interface GarageIdleWorkStats {
  current: GarageIdleWorkKind | null;
  queued: number;
  maxQueued: number;
  completed: number;
  byKind: Record<GarageIdleWorkKind, number>;
}

interface PendingWork {
  kind: GarageIdleWorkKind;
  order: number;
  stillValid: () => boolean;
  resolve: (lease: GarageIdleWorkLease | null) => void;
}

const PRIORITY: Readonly<Record<GarageIdleWorkKind, number>> = Object.freeze({
  'world-intent': 0,
  'pedestal-neighbors': 1,
  world: 2,
  dressing: 3,
});

/**
 * Serialize optional garage construction without changing any authored work.
 *
 * Each producer keeps its own cancellation and frame-budget policy. This
 * owner supplies only mutual exclusion and deterministic priority, preventing
 * several individually cooperative jobs from saturating one main thread and
 * GPU at the same time.
 */
export function createGarageIdleWorkCoordinator(): {
  acquire(
    kind: GarageIdleWorkKind,
    stillValid?: () => boolean,
  ): Promise<GarageIdleWorkLease | null>;
  readonly stats: GarageIdleWorkStats;
} {
  const queue: PendingWork[] = [];
  const stats: GarageIdleWorkStats = {
    current: null,
    queued: 0,
    maxQueued: 0,
    completed: 0,
    byKind: {
      'world-intent': 0,
      'pedestal-neighbors': 0,
      world: 0,
      dressing: 0,
    },
  };
  let active: GarageIdleWorkLease | null = null;
  let order = 0;

  const updateQueueStats = (): void => {
    stats.queued = queue.length;
    stats.maxQueued = Math.max(stats.maxQueued, queue.length);
  };

  const drain = (): void => {
    if (active) return;
    queue.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.order - b.order);
    while (queue.length) {
      const request = queue.shift()!;
      updateQueueStats();
      if (!request.stillValid()) {
        request.resolve(null);
        continue;
      }
      let released = false;
      const lease: GarageIdleWorkLease = {
        kind: request.kind,
        release() {
          if (released) return;
          released = true;
          if (active !== lease) return;
          active = null;
          stats.current = null;
          stats.completed += 1;
          stats.byKind[request.kind] += 1;
          queueMicrotask(drain);
        },
      };
      active = lease;
      stats.current = request.kind;
      request.resolve(lease);
      return;
    }
  };

  const acquire = (
    kind: GarageIdleWorkKind,
    stillValid: () => boolean = () => true,
  ): Promise<GarageIdleWorkLease | null> => {
    if (!(kind in PRIORITY)) throw new TypeError(`unknown garage idle work kind: ${kind}`);
    if (typeof stillValid !== 'function') {
      throw new TypeError('garage idle work validity must be callable');
    }
    return new Promise((resolve) => {
      queue.push({ kind, order: order++, stillValid, resolve });
      updateQueueStats();
      drain();
    });
  };

  return { acquire, stats };
}
