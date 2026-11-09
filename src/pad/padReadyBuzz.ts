/**
 * The phone's gun-loaded buzz (docs/PHONE-CONTROLLER.md "Controls"): the phone plays `ready` when a long load ends, at
 * the end of the load the status names (each status re-arms it with the time left), or at the first status that says
 * loaded, whichever comes first; never with the trigger held (the shot's own kick follows). Its clock and its buzz are
 * the page's, handed in, so the rule runs in Node (padReadyBuzz.selftest.mjs).
 *
 * One declared machine (round 8 Y5 s3-06). `idle`: no long load to announce. `loading`: a long load runs and its timer
 * is armed for the time the status names. `paused`: a long load waits for its end with no timer: a paused battle (or a
 * hidden desktop tab, which the receiver reports as paused) freezes the reload while its status still arrives every 2 s,
 * and a timer re-armed from it buzzed `ready` every two seconds of the pause. The latch stays, so a resume that says
 * loaded (a network gun's load ran on) still announces once. A link that leaves `live` (away, ended, or any other
 * state) drops the load: a pairing that ended mid-load buzzes nothing afterwards. Only `move` writes the state, and only
 * a move out of `loading` or `paused` may announce.
 */
import type { PadStatus } from './padProtocol.ts';
import type { PadLinkKind } from './padLink.ts';

/** The gun's loaded buzz plays for a load this long or longer (an autocannon's round-to-round is not announced). */
export const READY_MIN_S = 1.5;

export const PAD_READY_STATES = ['idle', 'loading', 'paused'] as const;
export type PadReadyState = (typeof PAD_READY_STATES)[number];

/** The gun as the phone's panel shows it (`.pad-ctl[data-state]`): no battle, the tank down, loading, ready. */
export const PAD_GUN_STATES = ['idle', 'down', 'loading', 'ready'] as const;
export type PadGunState = (typeof PAD_GUN_STATES)[number];
export function padGunState(status: PadStatus): PadGunState {
  return !status.battle ? 'idle' : !status.alive ? 'down' : status.reloadS > 0 ? 'loading' : 'ready';
}

export interface PadReadyBuzzPorts {
  /** Play the `ready` buzz. */
  buzz(): void;
  /** The trigger is held: the shot's own kick follows, so the loaded buzz stays quiet. */
  fireHeld(): boolean;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface PadReadyBuzz {
  readonly state: PadReadyState;
  /** A status from the desktop. */
  status(next: PadStatus): void;
  /** The link's state changed: anything but `live` drops the load. */
  link(kind: PadLinkKind): void;
}

export function createPadReadyBuzz(ports: PadReadyBuzzPorts): PadReadyBuzz {
  let state: PadReadyState = 'idle';
  let timer: unknown;

  /** The one writer of the state. A timer runs only in `loading`; `announce` is honoured only out of a load. */
  function move(next: PadReadyState, { announce = false, reloadS = 0 } = {}): void {
    const from = state;
    if (from === 'loading') { ports.clearTimer(timer); timer = undefined; }
    state = next;
    if (next === 'loading') timer = ports.setTimer(onTimer, reloadS * 1000);
    if (announce && from !== 'idle' && !ports.fireHeld()) ports.buzz();
  }
  function onTimer(): void {
    timer = undefined;
    if (state === 'loading') move('idle', { announce: true });
  }

  return {
    get state() { return state; },
    status(next) {
      if (!next.battle || !next.alive) { move('idle'); return; }
      const long = next.reloadS > 0 && next.reloadTotalS >= READY_MIN_S;
      if (next.paused) {
        // the reload is frozen: a long load waits with no timer; a loaded gun waits for the resume to be announced
        if (long || (next.reloadS <= 0 && state !== 'idle')) move('paused');
        else move('idle');
        return;
      }
      if (long) move('loading', { reloadS: next.reloadS });
      else move('idle', { announce: next.reloadS <= 0 });
    },
    link(kind) {
      if (kind !== 'live') move('idle');
    },
  };
}
