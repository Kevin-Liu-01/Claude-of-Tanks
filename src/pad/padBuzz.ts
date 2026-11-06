/**
 * The buzz each cue plays on the phone (docs/PHONE-CONTROLLER.md "Haptics"), pure and Node-runnable: the phone's side of
 * the cues, which padPage.ts plays. Which battle events become cues is the desktop's (padCues.ts).
 */
import type { PadCue } from './padProtocol.ts';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** The phone's own buzzes besides the battle's cues: a control under the thumb, the gun loaded, a trigger pulled
 *  while it loads. */
export type PadBuzz = PadCue | 'press' | 'ready' | 'unready';

/** Each buzz as the Vibration API plays it (on, off, on… in ms); `m` (0..1) scales the strong ones. */
export function padBuzzPattern(buzz: PadBuzz, m = 0.5): number[] {
  const k = clamp01(m);
  switch (buzz) {
    case 'press': return [8];
    case 'ready': return [10, 60, 10];
    case 'unready': return [6, 40, 6];
    case 'shot': return [Math.round(24 + 36 * k)];
    case 'hit': return [14, 50, 22];
    case 'deflect': return [6];
    case 'hurt': return [Math.round(30 + 90 * k)];
    case 'glance': return [10, 40, 10];
    case 'module': return [24, 40, 24, 40, 24];
    case 'burning': return [12, 90, 12, 90, 12, 90, 12];
    case 'impact': return [Math.round(16 + 54 * k)];
    case 'kill': return [20, 60, 20, 60, 60];
    case 'dead': return [200, 80, 300];
    case 'spotted': return [8, 120, 8];
    case 'denied': return [8, 40, 8, 40, 8];
    case 'lock': return [12, 30, 24];
    case 'unlock': return [8];
    default: return [];
  }
}

/** The longest gap between ticks a long buzz keeps on a phone that can only tick (iOS: one system tick per toggled
 *  switch), and the most ticks one buzz plays. */
const TICK_EVERY_MS = 50;
const MAX_TICKS = 6;

/** A pattern as ticks, for a phone with no Vibration API: each pulse starts a tick, and a long pulse ticks on through
 *  its length. The times are ms from the buzz's start. */
export function padBuzzTicks(pattern: readonly number[]): number[] {
  const ticks: number[] = [];
  let at = 0;
  for (let i = 0; i < pattern.length && ticks.length < MAX_TICKS; i++) {
    const length = Math.max(0, pattern[i] || 0);
    if (i % 2 === 0) for (let t = 0; t < Math.max(1, length - 20) && ticks.length < MAX_TICKS; t += TICK_EVERY_MS) ticks.push(at + t);
    at += length;
  }
  return ticks;
}
