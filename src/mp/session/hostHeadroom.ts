/**
 * Host choice by headroom (plan step 10, 2026-10-13; MP-SINCE-0930 §5: every packet of a p2p match crosses the host
 * tab's main thread, and every seat skips control ticks below 15 fps). The room elects the admin, else the senior
 * willing commander, without knowing how each tab runs. This monitor reads the tab's own display frames while it waits
 * in the room and says when it is too slow to host well: p50 frame time over the last few seconds past `weakFrameMs`
 * (33 ms: under 30 fps), with hysteresis back below `recoverFrameMs` (25 ms: over 40 fps). The session turns that into a
 * preference decline — the room then names a willing seat and keeps this one only as the last resort. Pure: no DOM.
 */
export interface HostHeadroomOptions {
  /** p50 frame time past which the tab declines to host (ms). */
  weakFrameMs?: number;
  /** p50 frame time under which a declined tab offers to host again (ms). */
  recoverFrameMs?: number;
  /** Frames in the window (about four seconds at 60 fps). */
  windowFrames?: number;
  /** Frames between verdicts. */
  evaluateEvery?: number;
}

export interface HostHeadroomMonitor {
  /** One display frame's duration; true when the verdict (`weak`) changed. */
  frame(frameMs: number): boolean;
  readonly weak: boolean;
  /** The window's p50 frame time at the last verdict (ms), or null before the window filled. */
  readonly p50FrameMs: number | null;
  reset(): void;
}

/** Frames longer than this are a hidden or suspended tab, not a measure of its headroom. */
const IGNORED_FRAME_MS = 500;

export function createHostHeadroomMonitor({ weakFrameMs = 33, recoverFrameMs = 25, windowFrames = 240, evaluateEvery = 60 }: HostHeadroomOptions = {}): HostHeadroomMonitor {
  if (!(recoverFrameMs < weakFrameMs)) throw new TypeError('recoverFrameMs must be under weakFrameMs');
  const ring = new Float64Array(windowFrames);
  const sorted = new Float64Array(windowFrames);
  let count = 0;
  let next = 0;
  let sinceVerdict = 0;
  let weak = false;
  let p50: number | null = null;
  return {
    frame(frameMs: number): boolean {
      if (!(frameMs > 0) || frameMs > IGNORED_FRAME_MS) return false;
      ring[next] = frameMs;
      next = (next + 1) % windowFrames;
      if (count < windowFrames) count++;
      if (++sinceVerdict < evaluateEvery || count < windowFrames) return false;
      sinceVerdict = 0;
      sorted.set(ring);
      sorted.sort();
      p50 = sorted[windowFrames >> 1]!;
      const was = weak;
      if (!weak && p50 > weakFrameMs) weak = true;
      else if (weak && p50 < recoverFrameMs) weak = false;
      return weak !== was;
    },
    get weak() { return weak; },
    get p50FrameMs() { return p50; },
    reset() { count = 0; next = 0; sinceVerdict = 0; weak = false; p50 = null; },
  };
}
