/**
 * Snapshot assembly (charter §4 "Interest management"): packets are deltas
 * against the viewer's last acknowledged frame or keyframes; this stream
 * keeps the assembled frames a delta may reference, resolves baselines for
 * the decoder, tracks the acknowledgement it owes the server, and turns a
 * missing baseline into a keyframe request (an ack of NO_TICK: the server
 * sends a keyframe whenever it holds no acked baseline). Persistent facts —
 * the destroyed obstacle list and its revision, the verdict — ride every
 * frame, so a recovering client converges without replaying history.
 */
import { NO_TICK, WireError, applySnapshotPacket } from '../wire/index.ts';
import type { SnapshotFrame, SnapshotPacket } from '../wire/index.ts';

export interface SnapshotStreamOptions {
  /** Frames retained for baseline lookups; keyframes go every 2 s, so 96 covers 3 s at 30 Hz. */
  ringSize?: number;
  /** Ticks between snapshots (tickHz / snapshotHz), for the loss estimate. */
  ticksPerSnapshot?: number;
}

export type SnapshotAccept =
  | { ok: true; frame: SnapshotFrame; keyframe: boolean }
  | { ok: false; reason: 'stale' | 'missing_baseline' };

export interface SnapshotStreamStats {
  received: number;
  keyframes: number;
  stale: number;
  missingBaselines: number;
  /** Snapshots the tick sequence says were never received (ordered link: server drops or a reconnect gap). */
  estimatedMissing: number;
  lossRate: number;
  latestTick: number;
  awaitingKeyframe: boolean;
}

export class SnapshotStream {
  readonly ringSize: number;
  readonly ticksPerSnapshot: number;
  private readonly ring = new Map<number, SnapshotFrame>();
  private readonly order: number[] = [];
  private latestFrame: SnapshotFrame | null = null;
  private awaitingKeyframe = true;
  private received = 0;
  private keyframes = 0;
  private stale = 0;
  private missingBaselines = 0;
  private estimatedMissing = 0;
  private lastGapAtTick = -1;

  constructor({ ringSize = 96, ticksPerSnapshot = 2 }: SnapshotStreamOptions = {}) {
    this.ringSize = ringSize;
    this.ticksPerSnapshot = ticksPerSnapshot;
  }

  get latest(): SnapshotFrame | null { return this.latestFrame; }
  get isAwaitingKeyframe(): boolean { return this.awaitingKeyframe; }
  /** The tick to acknowledge: the newest assembled frame, or NO_TICK to ask for a keyframe. */
  get ackTick(): number { return this.awaitingKeyframe || !this.latestFrame ? NO_TICK : this.latestFrame.tick; }
  /** Tick of the last observed sequence gap (the interpolator's loss term). */
  get lastGapTick(): number { return this.lastGapAtTick; }

  /** Baseline lookup for `decodeMessage({ resolveBaseline })`. */
  readonly resolveBaseline = (tick: number): SnapshotFrame | null => this.ring.get(tick) ?? null;

  accept(packet: SnapshotPacket): SnapshotAccept {
    if (this.latestFrame && packet.tick <= this.latestFrame.tick) {
      this.stale++;
      return { ok: false, reason: 'stale' };
    }
    let frame: SnapshotFrame;
    if (packet.keyframe) {
      frame = applySnapshotPacket(packet, null);
    } else {
      const baseline = this.ring.get(packet.baseTick) ?? null;
      if (!baseline) return this.missBaseline();
      try {
        frame = applySnapshotPacket(packet, baseline);
      } catch (error) {
        if (error instanceof WireError && error.code === 'missing_baseline') return this.missBaseline();
        throw error;
      }
    }
    if (this.latestFrame) {
      const expectedNext = this.latestFrame.tick + this.ticksPerSnapshot;
      if (frame.tick > expectedNext) {
        this.estimatedMissing += Math.round((frame.tick - expectedNext) / this.ticksPerSnapshot);
        this.lastGapAtTick = frame.tick;
      }
    }
    this.received++;
    if (packet.keyframe) { this.keyframes++; this.awaitingKeyframe = false; }
    this.ring.set(frame.tick, frame);
    this.order.push(frame.tick);
    while (this.order.length > this.ringSize) this.ring.delete(this.order.shift()!);
    this.latestFrame = frame;
    return { ok: true, frame, keyframe: packet.keyframe };
  }

  /** The decoder rejected a delta before this stream saw it (relative groups without the acked rows). */
  noteMissingBaseline(): void { this.missBaseline(); }

  private missBaseline(): SnapshotAccept {
    this.missingBaselines++;
    this.awaitingKeyframe = true;
    return { ok: false, reason: 'missing_baseline' };
  }

  /** A reconnect: the server holds no baseline for the new socket. */
  reset(): void {
    this.ring.clear();
    this.order.length = 0;
    this.latestFrame = null;
    this.awaitingKeyframe = true;
  }

  stats(): SnapshotStreamStats {
    const total = this.received + this.estimatedMissing;
    return {
      received: this.received,
      keyframes: this.keyframes,
      stale: this.stale,
      missingBaselines: this.missingBaselines,
      estimatedMissing: this.estimatedMissing,
      lossRate: total > 0 ? this.estimatedMissing / total : 0,
      latestTick: this.latestFrame?.tick ?? -1,
      awaitingKeyframe: this.awaitingKeyframe,
    };
  }
}
