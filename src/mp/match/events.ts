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
/**
 * The budget's deadline (world state audit, 2026-10-01): a beat the budget has held this many ticks past its own tick is
 * released whatever the budget says. One heavy event per display frame spread a volley or a hull plowing a tree line
 * over as many frames as it had beats — the audit read hits and impacts 13–20 ticks (220–330 ms) behind their tick on a
 * 30 Hz presenter — so the smoothing applies to the first four ticks (67 ms, one snapshot interval at 20 Hz) and the
 * tail lands together rather than late.
 */
const DEFAULT_MAX_LATE_TICKS = 4;
/** Events that allocate large audio, particle, light or debris graphs end a flush. */
export const HEAVY_EVENT_KINDS: ReadonlySet<string> = new Set([
  'shell_fired', 'shell_hit', 'shell_impact', 'tank_destroyed', 'world_prop_destroyed',
  // destruction (2026-10-07): a stage change brings dust, debris and a collapse; a crater its ejecta
  'structure_stage', 'structure_breach', 'terrain_crater',
]);

interface QueuedEvent {
  tick: number;
  event: WireEvent;
}

export interface ReliableEventQueueOptions {
  maxEventsPerFlush?: number;
  maxPending?: number;
  isHeavy?: (event: WireEvent) => boolean;
  /** Ticks past its own tick a beat may be held by the budget before it is released regardless (DEFAULT_MAX_LATE_TICKS). */
  maxLateTicks?: number;
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
  readonly maxLateTicks: number;
  readonly isHeavy: (event: WireEvent) => boolean;
  private pending: QueuedEvent[] = [];
  private pendingHead = 0;
  private staged: QueuedEvent[] = [];
  private stagedHead = 0;
  private emitted = 0;
  private peakPending = 0;
  /**
   * Obstacle indices of the `world_prop_destroyed` events this queue still owes the presentation — queued, staged, or
   * flushed into the frame being presented (released by `release`) — with a count per index (world state audit,
   * 2026-10-01): the persistent destroyed list a snapshot carries reaches the presentation ahead of the presented tick,
   * and a prop whose fall is still on its way here must not be laid down by that list first.
   */
  private readonly pendingObstacles = new Map<number, number>();
  /** Structure ids of the `structure_stage` and `structure_breach` events still owed to the presentation (destruction,
   * 2026-10-07; breaches P2): the snapshot's destruction log names a stage or a hole before its event is presented, and
   * the structure's entries belong to their events. */
  private readonly pendingStructures = new Map<number, number>();
  /** Crater ids of the `terrain_crater` events still owed to the presentation (P3): a crater belongs to its event too. */
  private readonly pendingCraters = new Map<number, number>();

  constructor({
    maxEventsPerFlush = DEFAULT_MAX_EVENTS_PER_FLUSH,
    maxPending = DEFAULT_MAX_PENDING,
    isHeavy = (event) => HEAVY_EVENT_KINDS.has(event.kind),
    maxLateTicks = DEFAULT_MAX_LATE_TICKS,
  }: ReliableEventQueueOptions = {}) {
    this.maxEventsPerFlush = maxEventsPerFlush;
    this.maxPending = maxPending;
    this.isHeavy = isHeavy;
    this.maxLateTicks = maxLateTicks;
  }

  get size(): number { return this.pending.length - this.pendingHead + this.staged.length - this.stagedHead; }

  /** Append a message's events (the socket already ordered them). Throws when the backlog is absurd. */
  push(message: EventMessage): void {
    for (const event of message.events) {
      this.pending.push({ tick: message.tick, event });
      this.notePending(event, 1);
    }
    if (this.pending.length - this.pendingHead > this.maxPending) {
      throw new RangeError('reliable event backlog exceeded its limit');
    }
    this.peakPending = Math.max(this.peakPending, this.size);
  }

  /** The events a frame finished presenting (the client calls it before the next flush): no longer owed. */
  release(events: readonly WireEvent[]): void {
    for (const event of events) this.notePending(event, -1);
  }

  /** Whether a `world_prop_destroyed` for this obstacle is still owed to the presentation (queued, staged or being presented). */
  isObstaclePending(index: number): boolean {
    return this.pendingObstacles.has(index);
  }

  /** Whether a `structure_stage` or `structure_breach` for this structure is still owed to the presentation. */
  isStructurePending(structureId: number): boolean {
    return this.pendingStructures.has(structureId);
  }

  /** Whether a `terrain_crater` with this crater id is still owed to the presentation. */
  isCraterPending(craterId: number): boolean {
    return this.pendingCraters.has(craterId);
  }

  private notePending(event: WireEvent, delta: number): void {
    const counted = event.kind === 'world_prop_destroyed' ? this.pendingObstacles
      : event.kind === 'structure_stage' || event.kind === 'structure_breach' ? this.pendingStructures
        : event.kind === 'terrain_crater' ? this.pendingCraters : null;
    if (!counted) return;
    const index = Number(event.kind === 'world_prop_destroyed' ? event.payload.obstacleIndex
      : event.kind === 'terrain_crater' ? event.payload.craterId : event.payload.structureId);
    if (!Number.isSafeInteger(index) || index < 0) return;
    const next = (counted.get(index) ?? 0) + delta;
    if (next > 0) counted.set(index, next);
    else counted.delete(index);
  }

  /**
   * Stage every event whose tick the presentation has reached, then emit up
   * to the budget (a heavy event ends the flush). Staged events carry over —
   * for at most `maxLateTicks` past their tick, then the rest of what is due
   * is released together.
   */
  flush(throughTick: number, out: WireEvent[]): number {
    while (this.pendingHead < this.pending.length && this.pending[this.pendingHead]!.tick <= throughTick) {
      this.staged.push(this.pending[this.pendingHead++]!);
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
      const event = this.staged[this.stagedHead++]!.event;
      out.push(event);
      count++;
      this.emitted++;
      if (this.isHeavy(event)) break;
    }
    // the deadline: whatever the budget has held past its tick for maxLateTicks lands now, together
    while (this.stagedHead < this.staged.length && throughTick - this.staged[this.stagedHead]!.tick >= this.maxLateTicks) {
      out.push(this.staged[this.stagedHead++]!.event);
      count++;
      this.emitted++;
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
      if (this.staged[index]!.event.kind === kind) return true;
    }
    return false;
  }

  clear(): void {
    this.pending.length = 0;
    this.pendingHead = 0;
    this.staged.length = 0;
    this.stagedHead = 0;
    this.pendingObstacles.clear();
    this.pendingStructures.clear();
    this.pendingCraters.clear();
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
