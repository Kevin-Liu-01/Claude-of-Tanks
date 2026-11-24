/**
 * The replay viewer's transport (replay-system, docs/REPLAY.md §5 "Transport"): one battle clock the viewer advances
 * by the frame's real time times the speed, and every control the bar and the keys have: play, pause, speed (0.25x to
 * 4x), frame step (one track sample), 5 s jumps, seek, and the previous or next mark. The clock never runs past what
 * the indexer has reached (`availableS`, which grows while the Worker works) and stops at the end. `advance` says
 * whether the frame moved the battle on continuously, so the viewer re-emits the marks it crossed (the kill feed, the
 * sounds) only then and never on a seek. Reverse play is P4. Node-runnable, no DOM.
 */
import { TRACK_EVERY } from './replayTrack.ts';
import { REPLAY_STEP_HZ } from './replayTimeline.ts';

export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
const NORMAL_SPEED = REPLAY_SPEEDS.indexOf(1);
export const FRAME_STEP_S = TRACK_EVERY / REPLAY_STEP_HZ;
export const JUMP_S = 5;
/** A previous-mark press this soon after a mark goes to the one before it (as a track's back button does). */
const PREVIOUS_GRACE_S = 0.75;
/** A frame longer than this (a hidden tab, a stall) moves the battle on but crosses no marks. */
const LONGEST_FRAME_S = 0.25;

export interface ReplayAdvance {
  readonly fromS: number;
  readonly toS: number;
  /** The battle moved on by play, not by a seek or a stall: the marks in (fromS, toS] happened on screen. */
  readonly continuous: boolean;
}

export interface ReplayClock {
  readonly timeS: number;
  readonly playing: boolean;
  readonly speed: number;
  readonly speedIndex: number;
  readonly durationS: number;
  readonly availableS: number;
  /** The indexer reached `seconds` of the battle (it only grows). */
  setAvailable(seconds: number): void;
  play(): void;
  pause(): void;
  toggle(): void;
  setSpeedIndex(index: number): void;
  seek(seconds: number): void;
  jump(deltaS: number): void;
  frameStep(direction: 1 | -1): void;
  /** The next or previous of `markTimes` (sorted, seconds) from now; false when there is none. */
  toMark(markTimes: readonly number[], direction: 1 | -1): boolean;
  /** The frame's real seconds: the battle moves on by them times the speed while playing. */
  advance(realS: number): ReplayAdvance;
}

export function createReplayClock(durationS: number, availableS = durationS): ReplayClock {
  let timeS = 0, playing = false, speedIndex = NORMAL_SPEED, available = Math.min(durationS, Math.max(0, availableS));
  const clamp = (seconds: number) => Math.min(available, Math.max(0, seconds));
  const play = () => {
    if (timeS >= durationS) timeS = 0; // play at the end starts over
    playing = true;
  };
  return {
    get timeS() { return timeS; },
    get playing() { return playing; },
    get speed() { return REPLAY_SPEEDS[speedIndex]!; },
    get speedIndex() { return speedIndex; },
    durationS,
    get availableS() { return available; },
    setAvailable(seconds) { available = Math.min(durationS, Math.max(available, seconds)); },
    play,
    pause() { playing = false; },
    toggle() { if (playing) playing = false; else play(); },
    setSpeedIndex(index) { speedIndex = Math.min(REPLAY_SPEEDS.length - 1, Math.max(0, Math.round(index))); },
    seek(seconds) { timeS = clamp(seconds); },
    jump(deltaS) { timeS = clamp(timeS + deltaS); },
    frameStep(direction) {
      playing = false;
      // to the next sample in that direction (the track's own moments, so each press shows a new pose)
      const sample = timeS / FRAME_STEP_S;
      const next = direction > 0 ? Math.floor(sample + 1e-6) + 1 : Math.ceil(sample - 1e-6) - 1;
      timeS = clamp(next * FRAME_STEP_S);
    },
    toMark(markTimes, direction) {
      let target: number | undefined;
      if (direction > 0) target = markTimes.find((t) => t > timeS + 1e-6 && t <= available);
      else for (let i = markTimes.length - 1; i >= 0; i--) if (markTimes[i]! < timeS - PREVIOUS_GRACE_S) { target = markTimes[i]; break; }
      if (target === undefined) return false;
      timeS = clamp(target);
      return true;
    },
    advance(realS) {
      const fromS = timeS;
      if (!playing || !(realS > 0)) return { fromS, toS: fromS, continuous: false };
      timeS = clamp(timeS + realS * REPLAY_SPEEDS[speedIndex]!);
      if (timeS >= durationS) playing = false;
      return { fromS, toS: timeS, continuous: realS <= LONGEST_FRAME_S };
    },
  };
}

export type ReplayKeyAction = 'toggle' | 'back' | 'forward' | 'framePrevious' | 'frameNext' | 'markPrevious' | 'markNext'
  | `speed:${number}`;

/** The viewer's keys (docs/REPLAY.md §5): Space, the arrows, comma and period, the brackets, 1-5. `code` is a
 *  KeyboardEvent.code, so the keys stay where they are on any layout. */
export function replayKeyAction(code: string): ReplayKeyAction | null {
  switch (code) {
    case 'Space': return 'toggle';
    case 'ArrowLeft': return 'back';
    case 'ArrowRight': return 'forward';
    case 'Comma': return 'framePrevious';
    case 'Period': return 'frameNext';
    case 'BracketLeft': return 'markPrevious';
    case 'BracketRight': return 'markNext';
  }
  const digit = /^Digit([1-9])$/.exec(code);
  if (digit && Number(digit[1]) <= REPLAY_SPEEDS.length) return `speed:${Number(digit[1]) - 1}`;
  return null;
}

/** `action` applied to `clock` (the viewer's key handler and the bar's buttons share it). */
export function applyReplayKey(clock: ReplayClock, action: ReplayKeyAction, markTimes: readonly number[]): void {
  switch (action) {
    case 'toggle': clock.toggle(); return;
    case 'back': clock.jump(-JUMP_S); return;
    case 'forward': clock.jump(JUMP_S); return;
    case 'framePrevious': clock.frameStep(-1); return;
    case 'frameNext': clock.frameStep(1); return;
    case 'markPrevious': clock.toMark(markTimes, -1); return;
    case 'markNext': clock.toMark(markTimes, 1); return;
    default: clock.setSpeedIndex(Number(action.slice('speed:'.length)));
  }
}

/** The marks a continuous advance crossed: those in (fromS, toS], in order. A seek or a stall crosses none. */
export function crossedMarks<T extends { readonly timeS: number }>(marks: readonly T[], step: ReplayAdvance): T[] {
  if (!step.continuous || step.toS <= step.fromS) return [];
  return marks.filter((mark) => mark.timeS > step.fromS && mark.timeS <= step.toS);
}
