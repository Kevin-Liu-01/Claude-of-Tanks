/**
 * The phone's gun-loaded buzz (docs/PHONE-CONTROLLER.md "Controls"): the phone plays `ready` when a long load ends, at
 * the end of the load the status names (each status re-arms it with the time left), or at the first status that says
 * loaded, whichever comes first; never with the trigger held (the shot's own kick follows). Its clock and its buzz are
 * the page's, handed in, so the rule runs in Node.
 */
import type { PadStatus } from './padProtocol.ts';

/** The gun's loaded buzz plays for a load this long or longer (an autocannon's round-to-round is not announced). */
export const READY_MIN_S = 1.5;

export interface PadReadyBuzzPorts {
  /** Play the `ready` buzz. */
  buzz(): void;
  /** The trigger is held: the shot's own kick follows, so the loaded buzz stays quiet. */
  fireHeld(): boolean;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface PadReadyBuzz {
  /** A status from the desktop. */
  status(next: PadStatus): void;
}

export function createPadReadyBuzz(ports: PadReadyBuzzPorts): PadReadyBuzz {
  let readyTimer: unknown;
  let loadingLong = false;
  function gunLoaded(): void {
    if (!loadingLong) return;
    loadingLong = false;
    if (!ports.fireHeld()) ports.buzz();
  }
  return {
    status(next) {
      ports.clearTimer(readyTimer);
      const loading = next.battle && next.alive && next.reloadS > 0 && next.reloadTotalS >= READY_MIN_S;
      if (loading) {
        loadingLong = true;
        readyTimer = ports.setTimer(gunLoaded, next.reloadS * 1000);
      } else if (next.battle && next.alive && next.reloadS <= 0) gunLoaded();
      else loadingLong = false;
    },
  };
}
