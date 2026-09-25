/**
 * Reliable one-shot events (charter §4, v1 "Delivery model"): EVENT messages
 * arrive in order on the socket; they are released to the presentation only
 * once it renders the tick they belong to, and at most a few expensive beats
 * per rendered frame so a synchronized volley never turns into one CPU burst.
 * The viewer's own accepted shots bypass that delay (immediate feedback) and
 * the own-shot predictor decides when a trigger press may present a muzzle
 * flash before the authority confirms it: only when recent authority says
 * that exact slot is ready, alive, loaded and not weapon-disabled.
 */
import type { EventMessage, WireEvent } from '../wire/index.ts';

const DEFAULT_MAX_EVENTS_PER_FLUSH = 3;
const DEFAULT_MAX_PENDING = 4096;
/** Events that allocate large audio, particle, light or debris graphs end a flush. */
export const HEAVY_EVENT_KINDS: ReadonlySet<string> = new Set([
  'shell_fired', 'shell_hit', 'shell_impact', 'tank_destroyed', 'world_prop_destroyed',
]);

interface QueuedEvent {
  tick: number;
  event: WireEvent;
}

export interface ReliableEventQueueOptions {
  maxEventsPerFlush?: number;
  maxPending?: number;
  isHeavy?: (event: WireEvent) => boolean;
}

export interface ReliableEventQueueStats {
  pending: number;
  staged: number;
  emitted: number;
  peakPending: number;
}

export class ReliableEventQueue {
  readonly maxEventsPerFlush: number;
  readonly maxPending: number;
  readonly isHeavy: (event: WireEvent) => boolean;
  private pending: QueuedEvent[] = [];
  private pendingHead = 0;
  private staged: WireEvent[] = [];
  private stagedHead = 0;
  private emitted = 0;
  private peakPending = 0;

  constructor({
    maxEventsPerFlush = DEFAULT_MAX_EVENTS_PER_FLUSH,
    maxPending = DEFAULT_MAX_PENDING,
    isHeavy = (event) => HEAVY_EVENT_KINDS.has(event.kind),
  }: ReliableEventQueueOptions = {}) {
    this.maxEventsPerFlush = maxEventsPerFlush;
    this.maxPending = maxPending;
    this.isHeavy = isHeavy;
  }

  get size(): number { return this.pending.length - this.pendingHead + this.staged.length - this.stagedHead; }

  /** Append a message's events (the socket already ordered them). Throws when the backlog is absurd. */
  push(message: EventMessage): void {
    for (const event of message.events) this.pending.push({ tick: message.tick, event });
    if (this.pending.length - this.pendingHead > this.maxPending) {
      throw new RangeError('reliable event backlog exceeded its limit');
    }
    this.peakPending = Math.max(this.peakPending, this.size);
  }

  /**
   * Stage every event whose tick the presentation has reached, then emit up
   * to the budget (a heavy event ends the flush). Staged events carry over.
   */
  flush(throughTick: number, out: WireEvent[]): number {
    while (this.pendingHead < this.pending.length && this.pending[this.pendingHead]!.tick <= throughTick) {
      this.staged.push(this.pending[this.pendingHead++]!.event);
    }
    if (this.pendingHead > 256 && this.pendingHead * 2 > this.pending.length) {
      this.pending = this.pending.slice(this.pendingHead);
      this.pendingHead = 0;
    } else if (this.pendingHead === this.pending.length) {
      this.pending.length = 0;
      this.pendingHead = 0;
    }
    let count = 0;
    while (this.stagedHead < this.staged.length && count < this.maxEventsPerFlush) {
      const event = this.staged[this.stagedHead++]!;
      out.push(event);
      count++;
      this.emitted++;
      if (this.isHeavy(event)) break;
    }
    if (this.stagedHead === this.staged.length) {
      this.staged.length = 0;
      this.stagedHead = 0;
    } else if (this.stagedHead > 256 && this.stagedHead * 2 > this.staged.length) {
      this.staged = this.staged.slice(this.stagedHead);
      this.stagedHead = 0;
    }
    return count;
  }

  hasKind(kind: string): boolean {
    for (let index = this.pendingHead; index < this.pending.length; index++) {
      if (this.pending[index]!.event.kind === kind) return true;
    }
    for (let index = this.stagedHead; index < this.staged.length; index++) {
      if (this.staged[index]!.kind === kind) return true;
    }
    return false;
  }

  clear(): void {
    this.pending.length = 0;
    this.pendingHead = 0;
    this.staged.length = 0;
    this.stagedHead = 0;
  }

  stats(): ReliableEventQueueStats {
    return {
      pending: this.pending.length - this.pendingHead,
      staged: this.staged.length - this.stagedHead,
      emitted: this.emitted,
      peakPending: this.peakPending,
    };
  }
}

/** What the authority row says about the viewer's weapon right now (presentation eligibility only). */
export interface ShotAuthority {
  tick: number;
  alive: boolean;
  shellSlot: number;
  reloadS: number;
  ammo: number;
  magazineRounds: number;
  magazineCapacity: number;
  guided: boolean;
  weaponBlocked: boolean;
}

export interface PredictedShot {
  fireSeq: number;
  shellSlot: number;
  confirmed: boolean;
}

const MAX_RECENT_PREDICTIONS = 64;
/** Authority older than this cannot vouch for a ready weapon. */
export const MAX_SHOT_AUTHORITY_AGE_MS = 250;

/**
 * Immediate own-shot feedback rule (v1 "shotFeedbackVersion 1"): a new fire
 * edge presents a flash only when the newest authority is fresh and says this
 * exact slot is ready, and only once per ready-epoch; the `shell_fired` event
 * carrying the same fireSeq confirms it (and suppresses a duplicate flash).
 * Nothing here creates a shell, consumes ammunition or infers a hit.
 */
export class OwnShotPredictor {
  private readonly predictions = new Map<number, PredictedShot>();
  private authority: ShotAuthority | null = null;
  private authorityReceivedAtMs: number | null = null;
  private readyEpoch = 0;
  private predictedEpoch = -1;
  private pendingFireSeq: number | null = null;
  private predictedCount = 0;
  private confirmedCount = 0;

  get authorityTick(): number { return this.authority?.tick ?? -1; }
  get predicted(): number { return this.predictedCount; }
  get confirmed(): number { return this.confirmedCount; }

  observe(authority: ShotAuthority, receivedAtMs: number): void {
    const previous = this.authority;
    if (previous && authority.tick <= previous.tick) return;
    if (!previous || previous.alive !== authority.alive || previous.shellSlot !== authority.shellSlot ||
        previous.ammo !== authority.ammo || previous.magazineRounds !== authority.magazineRounds ||
        OwnShotPredictor.ready(previous) !== OwnShotPredictor.ready(authority)) {
      this.readyEpoch++;
      this.pendingFireSeq = null;
    }
    this.authority = { ...authority };
    this.authorityReceivedAtMs = receivedAtMs;
  }

  static ready(authority: ShotAuthority): boolean {
    return authority.alive && !authority.weaponBlocked && authority.reloadS <= 0 && authority.ammo > 0 &&
      (authority.guided || authority.magazineCapacity <= 0 || authority.magazineRounds > 0);
  }

  /** A fire edge with sequence `fireSeq` on `shellSlot` at local time `nowMs`. */
  predict(fireSeq: number, shellSlot: number, nowMs: number): PredictedShot | null {
    const authority = this.authority;
    if (!authority || this.authorityReceivedAtMs === null || nowMs < this.authorityReceivedAtMs ||
        nowMs - this.authorityReceivedAtMs > MAX_SHOT_AUTHORITY_AGE_MS ||
        shellSlot !== authority.shellSlot || !OwnShotPredictor.ready(authority) ||
        this.pendingFireSeq !== null || this.predictedEpoch === this.readyEpoch ||
        this.predictions.has(fireSeq)) return null;
    const record: PredictedShot = { fireSeq, shellSlot, confirmed: false };
    this.predictions.set(fireSeq, record);
    if (this.predictions.size > MAX_RECENT_PREDICTIONS) this.predictions.delete(this.predictions.keys().next().value!);
    this.pendingFireSeq = fireSeq;
    this.predictedEpoch = this.readyEpoch;
    this.predictedCount++;
    return record;
  }

  /** The authority's `shell_fired` for the viewer: returns the prediction it confirms, if any. */
  confirm(event: WireEvent): PredictedShot | null {
    const payload = event.payload;
    const seq = typeof payload.fireIntentSeq === 'number' ? payload.fireIntentSeq
      : typeof payload.fireSeq === 'number' ? payload.fireSeq : null;
    const slot = payload.shellSlot;
    if (seq === null || typeof slot !== 'number') return null;
    const record = this.predictions.get(seq);
    if (!record || record.confirmed || record.shellSlot !== slot) return null;
    record.confirmed = true;
    this.confirmedCount++;
    if (this.pendingFireSeq === seq) this.pendingFireSeq = null;
    return record;
  }

  /** Keep the dedup receipts, drop the pending intent (an outage or a background tab). */
  cancel(): void { this.pendingFireSeq = null; }

  reset(): void {
    this.predictions.clear();
    this.authority = null;
    this.authorityReceivedAtMs = null;
    this.readyEpoch = 0;
    this.predictedEpoch = -1;
    this.pendingFireSeq = null;
  }
}
