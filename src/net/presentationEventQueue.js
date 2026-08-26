// A 7v7 synchronized volley can carry fourteen shell reports in one network
// batch. Submitting eight full muzzle/audio graphs in one render beat caused
// 50-130 ms main-thread stalls on otherwise healthy clients. Three preserves
// the authored effects while draining a full volley over only a few 120 Hz
// frames instead of turning network simultaneity into one CPU burst.
const DEFAULT_MAX_EVENTS_PER_FLUSH = 3;
const HEAVY_EVENT_TYPES = new Set([
  'shell_fired',
  'tank_destroyed',
  'world_prop_destroyed',
]);

/**
 * Preserve authoritative event order while admitting at most one expensive
 * full shot/destruction beat per rendered frame. State convergence remains
 * snapshot-driven; this queue only stages presentation work that can allocate
 * large audio, light, particle, or debris graphs.
 */
export class PresentationEventQueue {
  constructor({
    emit,
    maxEventsPerFlush = DEFAULT_MAX_EVENTS_PER_FLUSH,
    isHeavy = (event) => HEAVY_EVENT_TYPES.has(event?.type),
  } = {}) {
    if (typeof emit !== 'function') throw new TypeError('emit is required');
    if (!Number.isSafeInteger(maxEventsPerFlush) || maxEventsPerFlush < 1) {
      throw new TypeError('maxEventsPerFlush must be a positive integer');
    }
    this.emit = emit;
    this.maxEventsPerFlush = maxEventsPerFlush;
    this.isHeavy = isHeavy;
    this.pending = [];
    this.head = 0;
    this.emitted = 0;
    this.peakPending = 0;
  }

  enqueue(events) {
    if (!Array.isArray(events) || events.length === 0) return this.size;
    for (const event of events) {
      if (event && typeof event === 'object') this.pending.push(event);
    }
    this.peakPending = Math.max(this.peakPending, this.size);
    return this.size;
  }

  flush() {
    let count = 0;
    while (this.head < this.pending.length && count < this.maxEventsPerFlush) {
      const event = this.pending[this.head++];
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

  hasType(type) {
    for (let index = this.head; index < this.pending.length; index++) {
      if (this.pending[index]?.type === type) return true;
    }
    return false;
  }

  clear() {
    this.pending.length = 0;
    this.head = 0;
  }

  get size() { return this.pending.length - this.head; }

  getStats() {
    return { pending: this.size, emitted: this.emitted, peakPending: this.peakPending };
  }
}
