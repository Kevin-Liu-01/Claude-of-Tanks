// One wheel-delta model for every zoom consumer (2026-09-19, owner: "when i do the thing on touchpad where i
// expand to zoom in with both fingers, the behavior is rlly messed up").
//
// A mouse wheel click arrives as one event of about 100 pixel units (three lines in line mode). A trackpad
// two-finger scroll arrives as dozens of events of a few units each, and a trackpad pinch arrives as ctrl+wheel
// events of a few units each (Chrome, Edge, Firefox synthesise it that way; Safari uses gesture events as well).
// Consumers that stepped once per EVENT raced through a whole zoom ladder on one pinch. Here every consumer
// reads the same normalised delta: discrete ladders (the gun sight, the spectator orbit) accumulate it into
// whole notches, continuous dollies (the Garage showroom) apply it proportionally.

export interface WheelDeltaSource {
  deltaY: number;
  deltaMode?: number;
  ctrlKey?: boolean;
}

/** Pixel units in one mouse-wheel click. */
export const WHEEL_NOTCH_PX = 100;
/** A pinch is a small motion for a large intent: its units count this many times a scroll's. */
export const PINCH_GAIN = 2.5;
/** Leftover accumulation is forgotten after this idle gap, so two gestures never add up. */
export const WHEEL_GESTURE_GAP_MS = 320;
const LINE_PX = 100 / 3;
const PAGE_PX = 400;

/** The event's vertical delta in pixel units, whatever the browser's delta mode. */
export function wheelDeltaPx(event: WheelDeltaSource): number {
  const raw = Number.isFinite(event.deltaY) ? event.deltaY : 0;
  if (event.deltaMode === 1) return raw * LINE_PX;
  if (event.deltaMode === 2) return raw * PAGE_PX;
  return raw;
}

/** Fractional notches: positive for deltaY > 0 (scroll down / pinch in). A mouse click is exactly 1. */
export function wheelNotchUnits(event: WheelDeltaSource): number {
  return (wheelDeltaPx(event) / WHEEL_NOTCH_PX) * (event.ctrlKey ? PINCH_GAIN : 1);
}

export interface WheelNotcher {
  /** Whole notches released by this event (sign of deltaY); the remainder carries to the next event. */
  push(event: WheelDeltaSource, nowMs?: number): number;
  reset(): void;
}

/** Accumulates fractional units into whole notches for discrete zoom ladders. */
export function createWheelNotcher(): WheelNotcher {
  let carried = 0;
  let lastMs = -Infinity;
  return {
    push(event, nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()) {
      const units = wheelNotchUnits(event);
      if (units === 0) return 0;
      if (nowMs - lastMs > WHEEL_GESTURE_GAP_MS || (carried !== 0 && Math.sign(carried) !== Math.sign(units))) {
        carried = 0;
      }
      lastMs = nowMs;
      carried += units;
      const whole = (carried > 0 ? Math.floor(carried) : Math.ceil(carried)) || 0; // never -0
      carried -= whole;
      return whole;
    },
    reset() { carried = 0; lastMs = -Infinity; },
  };
}
