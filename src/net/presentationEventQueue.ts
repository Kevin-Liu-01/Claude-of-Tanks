import type { RuntimeValue } from '../runtimeTypes.ts';
// A 7v7 synchronized volley can carry fourteen shell reports in one network
// batch. Submitting eight full muzzle/audio graphs in one render beat caused
// 50-130 ms main-thread stalls on otherwise healthy clients. Three preserves
// the authored effects while draining a full volley over only a few 120 Hz
// frames instead of turning network simultaneity into one CPU burst.
const DEFAULT_MAX_EVENTS_PER_FLUSH = 3;
const HEAVY_EVENT_TYPES: ReadonlySet<string> = new Set([
  'shell_fired',
  'shell_hit',
  'shell_impact',
  'tank_destroyed',
  'world_prop_destroyed',
]);

export interface PresentationEvent extends Record<string, RuntimeValue> {
  type?: string;
}

export interface PresentationEventQueueOptions {
  emit?: (event: PresentationEvent) => void;
  maxEventsPerFlush?: number;
  isHeavy?: (event: PresentationEvent) => boolean;
}

export interface PresentationEventQueueStats {
  pending: number;
  emitted: number;
  peakPending: number;
}

function isPresentationEvent(value: RuntimeValue): value is PresentationEvent {
  return value !== null && typeof value === 'object';
}

/**
 * Preserve authoritative event order while admitting at most one expensive
 * full muzzle/impact/destruction beat per rendered frame. A penetrating hit
 * can create particles, a persistent scar, audio, and then a wreck in the
 * same reliable batch, so it must end the current flush before the adjacent
 * destruction event. State convergence remains snapshot-driven; this queue
 * only stages presentation work that can allocate large audio, light,
 * particle, or debris graphs.
 */
export class PresentationEventQueue {
  readonly emit: (event: PresentationEvent) => void;
  readonly maxEventsPerFlush: number;
  readonly isHeavy: (event: PresentationEvent) => boolean;
  private pending: PresentationEvent[] = [];
  private head = 0;
  private emitted = 0;
  private peakPending = 0;

  constructor({
    emit,
    maxEventsPerFlush = DEFAULT_MAX_EVENTS_PER_FLUSH,
    isHeavy = (event) => typeof event.type === 'string' && HEAVY_EVENT_TYPES.has(event.type),
  }: PresentationEventQueueOptions = {}) {
    if (typeof emit !== 'function') throw new TypeError('emit is required');
    if (!Number.isSafeInteger(maxEventsPerFlush) || maxEventsPerFlush < 1) {
      throw new TypeError('maxEventsPerFlush must be a positive integer');
    }
    this.emit = emit;
    this.maxEventsPerFlush = maxEventsPerFlush;
    this.isHeavy = isHeavy;
  }

  enqueue(events: RuntimeValue): number {
    if (!Array.isArray(events) || events.length === 0) return this.size;
    for (const event of events) {
      if (isPresentationEvent(event)) this.pending.push(event);
    }
    this.peakPending = Math.max(this.peakPending, this.size);
    return this.size;
  }

  flush(): number {
    let count = 0;
    while (this.head < this.pending.length && count < this.maxEventsPerFlush) {
      const event = this.pending[this.head++];
      if (!event) break;
      this.emit(event);
      count++;
      this.emitted++;
      if (this.isHeavy(event)) break;
    }
    if (this.head === this.pending.length) {
      this.pending.length = 0;
      this.head = 0;
    } else if (this.head > 256 && this.head * 2 > this.pending.length) {
      this.pending = this.pending.slice(this.head);
      this.head = 0;
    }
    return count;
  }

  hasType(type: string): boolean {
    for (let index = this.head; index < this.pending.length; index++) {
      if (this.pending[index]?.type === type) return true;
    }
    return false;
  }

  clear(): void {
    this.pending.length = 0;
    this.head = 0;
  }

  get size(): number { return this.pending.length - this.head; }

  getStats(): PresentationEventQueueStats {
    return { pending: this.size, emitted: this.emitted, peakPending: this.peakPending };
  }
}
