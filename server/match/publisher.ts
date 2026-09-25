/**
 * Per-viewer snapshot publisher: keeps the frames a viewer may still
 * acknowledge, chooses keyframe or delta against the acknowledged baseline
 * (keyframe every KEYFRAME_INTERVAL_TICKS or when the baseline is gone), and
 * encodes the wire bytes. Backpressure accounting lives with the link.
 */
import { NO_TICK, TICK_HZ } from '../../src/mp/wire/constants.ts';
import { buildSnapshotPacket, encodeMessage } from '../../src/mp/wire/codec.ts';
import type { SnapshotFrame } from '../../src/mp/wire/messages.ts';

export const KEYFRAME_INTERVAL_TICKS = TICK_HZ * 2;
const HISTORY_FRAMES = 64;

export interface ViewerPublisher {
  readonly ackedTick: number;
  readonly lastKeyframeTick: number;
  readonly stats: { keyframes: number; deltas: number; bytes: number; missingBaselines: number; keyframeRequests: number };
  /**
   * Acknowledge a sent frame. Returns the round trip (ms) measured from the
   * frame's send time the first time that tick is acknowledged, else null —
   * the server's own latency measurement, never a client-reported number.
   * NO_TICK means "I hold no baseline": the acknowledged baseline is dropped
   * and the next snapshot is a keyframe (a client recovering from a missing
   * delta baseline asks this way instead of waiting for the 2 s cadence).
   */
  ack(tick: number, nowMs: number): number | null;
  /** Encode `frame` for this viewer; the frame is retained until acknowledged or aged out. */
  publish(frame: SnapshotFrame, nowMs: number): { bytes: Uint8Array; keyframe: boolean };
  reset(): void;
}

interface HeldFrame { frame: SnapshotFrame; sentAtMs: number; acked: boolean }

export function createViewerPublisher(): ViewerPublisher {
  const history = new Map<number, HeldFrame>();
  const stats = { keyframes: 0, deltas: 0, bytes: 0, missingBaselines: 0, keyframeRequests: 0 };
  let ackedTick = NO_TICK;
  let lastKeyframeTick = -Infinity;
  // latched so a later acknowledgement of an older baseline cannot cancel the request
  let keyframeRequested = false;
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
      const keyframe = keyframeRequested || !baseline || frame.tick - lastKeyframeTick >= KEYFRAME_INTERVAL_TICKS;
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
    },
  };
}
