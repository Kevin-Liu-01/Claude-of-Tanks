/**
 * Per-viewer snapshot publisher: keeps the frames a viewer may still
 * acknowledge, chooses keyframe or delta against the acknowledged baseline
 * (keyframe every KEYFRAME_INTERVAL_TICKS or when the baseline is gone), and
 * encodes the wire bytes. Backpressure accounting lives with the link.
 *
 * Keyframes the viewer forces (no usable baseline, or a NO_TICK request) draw
 * on a small bucket (security audit 2026-10-22, NV-11): FORCED_KEYFRAME_BURST
 * at once, which covers an honest viewer's first round trip after a join or a
 * recovery, then one per FORCED_KEYFRAME_REFILL_TICKS. A seat or spectator
 * that withholds, freezes or retracts its acknowledgements otherwise drew a
 * full keyframe on every snapshot, about 8x an honest stream on the host
 * player's uplink. With the bucket empty it gets nothing until a token
 * returns: without a baseline it has nothing to apply a delta to. The periodic
 * cadence never draws on the bucket.
 *
 * Each viewer's periodic keyframes land on its own slot of the cycle
 * (mp-scale-251, docs/MULTIPLAYER-V2.md §13.30): every viewer welcomed at a
 * match's start otherwise drew its keyframe on the same snapshot, and a 14v14
 * host sent 28 keyframes (≈ 90 KB) in one tick, a burst seven times the median
 * tick's on a home uplink. A periodic keyframe is due on the viewer's slot,
 * once a cycle; a snapshot skipped on the slot puts it on the next one, which is
 * never more than a cycle after the last keyframe. A forced keyframe off the
 * slot costs at most one more keyframe, at the next slot.
 */
import { NO_TICK, TICK_HZ } from '../../src/mp/wire/constants.ts';
import { buildSnapshotPacket, encodeMessage } from '../../src/mp/wire/codec.ts';
import type { SnapshotFrame } from '../../src/mp/wire/messages.ts';

/**
 * A viewer's periodic keyframe (mp-scale-251): every six seconds, was two. A delta against the viewer's acknowledged
 * frame is exact, a viewer that loses its baseline asks for a keyframe at once (NO_TICK, the bucket above), and the
 * room's two-second keyframe contract is the host's sealed migration keyframe (matchHostCore broadcastKeyframe), not
 * this one. The two-second cadence cost a 14v14 viewer 13 of its 92 kbit/s of snapshots, a 32v32 viewer 27 of 144.
 */
export const KEYFRAME_INTERVAL_TICKS = TICK_HZ * 6;
const FORCED_KEYFRAME_BURST = 8;
const FORCED_KEYFRAME_REFILL_TICKS = TICK_HZ / 2;
const HISTORY_FRAMES = 64;

export interface ViewerPublisher {
  readonly ackedTick: number;
  readonly lastKeyframeTick: number;
  readonly stats: {
    keyframes: number; deltas: number; bytes: number; missingBaselines: number; keyframeRequests: number;
    /** Snapshots withheld because the viewer forced a keyframe with the bucket empty. */
    forcedKeyframesWithheld: number;
  };
  /**
   * Acknowledge a sent frame. Returns the round trip (ms) measured from the
   * frame's send time the first time that tick is acknowledged, else null —
   * the server's own latency measurement, never a client-reported number.
   * NO_TICK means "I hold no baseline": the acknowledged baseline is dropped
   * and the next snapshot is a keyframe (a client recovering from a missing
   * delta baseline asks this way instead of waiting for the 2 s cadence).
   */
  ack(tick: number, nowMs: number): number | null;
  /**
   * Encode `frame` for this viewer; the frame is retained until acknowledged or aged out. Null when the viewer forced
   * a keyframe with its bucket empty: nothing is sent this snapshot.
   */
  publish(frame: SnapshotFrame, nowMs: number): { bytes: Uint8Array; keyframe: boolean } | null;
  reset(): void;
}

interface HeldFrame { frame: SnapshotFrame; sentAtMs: number; acked: boolean }

export interface ViewerPublisherOptions {
  /** The viewer's slot in the keyframe cycle (ticks, 0 to KEYFRAME_INTERVAL_TICKS - 1; keyframeSlotFor). */
  keyframeSlotTicks?: number;
  /** Ticks between this viewer's snapshots: a slot is met by the snapshot that falls in it. */
  snapshotEveryTicks?: number;
}

/** A viewer's keyframe slot from its seat: seats spread over the cycle by the golden ratio, so any number of them stays apart. */
export function keyframeSlotFor(seat: number): number {
  return Math.floor(((seat * 0.6180339887498949) % 1) * KEYFRAME_INTERVAL_TICKS);
}

export function createViewerPublisher({ keyframeSlotTicks = 0, snapshotEveryTicks = 1 }: ViewerPublisherOptions = {}): ViewerPublisher {
  const history = new Map<number, HeldFrame>();
  const stats = { keyframes: 0, deltas: 0, bytes: 0, missingBaselines: 0, keyframeRequests: 0, forcedKeyframesWithheld: 0 };
  let ackedTick = NO_TICK;
  let lastKeyframeTick = -Infinity;
  // latched so a later acknowledgement of an older baseline cannot cancel the request
  let keyframeRequested = false;
  let forcedTokens = FORCED_KEYFRAME_BURST;
  let refilledAtTick = -Infinity;
  const refill = (tick: number): void => {
    if (forcedTokens >= FORCED_KEYFRAME_BURST) { refilledAtTick = tick; return; }
    const earned = Math.floor((tick - refilledAtTick) / FORCED_KEYFRAME_REFILL_TICKS);
    if (earned > 0) {
      forcedTokens = Math.min(FORCED_KEYFRAME_BURST, forcedTokens + earned);
      refilledAtTick += earned * FORCED_KEYFRAME_REFILL_TICKS;
    }
  };
  return {
    get ackedTick() { return ackedTick; },
    get lastKeyframeTick() { return lastKeyframeTick; },
    stats,
    ack(tick, nowMs) {
      if (tick === NO_TICK) {
        // a viewer that never acknowledged anything is already on keyframes until it does;
        // one that held a baseline drops it and gets a keyframe next, whatever it acknowledges meanwhile
        if (ackedTick !== NO_TICK) {
          stats.keyframeRequests++;
          ackedTick = NO_TICK;
          keyframeRequested = true;
        }
        return null;
      }
      const held = history.get(tick);
      if (!held) return null;
      let rtt: number | null = null;
      if (!held.acked) { held.acked = true; rtt = Math.max(0, nowMs - held.sentAtMs); }
      if (ackedTick === NO_TICK || tick > ackedTick) {
        ackedTick = tick;
        // everything older than the acknowledged frame can no longer be a baseline
        for (const key of history.keys()) if (key < ackedTick) history.delete(key);
      }
      return rtt;
    },
    publish(frame, nowMs) {
      const baseline = ackedTick === NO_TICK ? null : history.get(ackedTick)?.frame ?? null;
      if (ackedTick !== NO_TICK && !baseline) stats.missingBaselines++;
      // on the viewer's slot; two seconds after the last keyframe only when a skipped snapshot missed the slot (the
      // next slot is then less than two seconds on, so the cadence is back on it)
      const due = frame.tick - lastKeyframeTick >= KEYFRAME_INTERVAL_TICKS
        || (frame.tick + KEYFRAME_INTERVAL_TICKS - keyframeSlotTicks) % KEYFRAME_INTERVAL_TICKS < snapshotEveryTicks;
      const forced = keyframeRequested || !baseline;
      refill(frame.tick);
      if (forced && !due) {
        if (forcedTokens < 1) {
          // the request stays latched: the keyframe goes out with the next token
          stats.forcedKeyframesWithheld++;
          return null;
        }
        forcedTokens--;
      }
      const keyframe = forced || due;
      keyframeRequested = false;
      const packet = buildSnapshotPacket(frame, keyframe ? null : baseline);
      const bytes = encodeMessage(packet, keyframe ? null : baseline);
      history.set(frame.tick, { frame, sentAtMs: nowMs, acked: false });
      while (history.size > HISTORY_FRAMES) history.delete(history.keys().next().value!);
      if (keyframe) { lastKeyframeTick = frame.tick; stats.keyframes++; } else stats.deltas++;
      stats.bytes += bytes.byteLength;
      return { bytes, keyframe };
    },
    reset() {
      history.clear();
      ackedTick = NO_TICK;
      lastKeyframeTick = -Infinity;
      keyframeRequested = false;
      forcedTokens = FORCED_KEYFRAME_BURST;
      refilledAtTick = -Infinity;
    },
  };
}
