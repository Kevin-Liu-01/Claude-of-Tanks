/**
 * crushPress.ts — the press a hull's tracks put on a crushable record it is driven or turned into (physics DST-02,
 * 2026-10-17): CRUSH_PRESS_S of contact under throttle or steer fells it, and a gap longer than CRUSH_PRESS_GAP_S starts
 * the count again. Shared by the solo step (game/state.ts shouldCrushObstacle) and the network authority
 * (sim/authoritativeMatch.ts obstacleIsPressedThrough), so both fell a pressed prop on the same tick.
 *
 * (2026-11-02 audit M6) The count lived on the world's collision records (`_pressT` / `_pressS`). A cached world is reused
 * across battles while each battle's clock restarts at 0, so `0 - _pressT` was negative, the gap reset never fired, and a
 * prop pressed in one battle fell after a tick in the next on the same map; it was also one count per record, so two
 * hulls pressing it ran it at twice the rate. The count now belongs to the battle: each driver makes one ledger per battle
 * (the solo step clears its own at reset), and it counts per hull and record, at most once a tick. Node-runnable.
 */

export const CRUSH_PRESS_S = 0.45;      // s of contact under throttle or steer (DST-02) that fells a trunk
export const CRUSH_PRESS_GAP_S = 0.2;   // press bookkeeping resets after this gap

/** One hull's press on one record: when it last pressed (this battle's seconds) and for how long without a gap. */
interface PressEntry {
  readonly hullId: string;
  lastS: number;
  pressedS: number;
  next: PressEntry | null;
}

export interface CrushPressLedger {
  /**
   * `hullId` presses `record` for one step of `dt` seconds at `timeS` (the battle's clock): true once the hull has pressed
   * it CRUSH_PRESS_S without a gap. A second call for the same hull and record on the same tick adds nothing.
   */
  press(record: object, hullId: string, timeS: number, dt: number): boolean;
  /** Forget every press (a new battle). */
  clear(): void;
  /** The pressed records held (a receipt reads it). */
  readonly size: number;
}

export function createCrushPressLedger(): CrushPressLedger {
  const presses = new Map<object, PressEntry>();
  return {
    press(record, hullId, timeS, dt) {
      let entry = presses.get(record) ?? null;
      while (entry && entry.hullId !== hullId) entry = entry.next;
      if (!entry) {
        entry = { hullId, lastS: -Infinity, pressedS: 0, next: presses.get(record) ?? null };
        presses.set(record, entry);
      }
      if (timeS === entry.lastS) return entry.pressedS >= CRUSH_PRESS_S;
      // a gap, or a clock that ran backwards (it never does within one battle), starts the count again
      if (!(timeS - entry.lastS <= CRUSH_PRESS_GAP_S) || timeS < entry.lastS) entry.pressedS = 0;
      entry.lastS = timeS;
      entry.pressedS += dt;
      return entry.pressedS >= CRUSH_PRESS_S;
    },
    clear() { presses.clear(); },
    get size() { return presses.size; },
  };
}
