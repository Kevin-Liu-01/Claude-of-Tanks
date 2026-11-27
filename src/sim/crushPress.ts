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
  /**
   * Every press held, for a migration keyframe (279): [the record's id by `idOf`, the hull, when it last pressed, how long
   * without a gap], each record's presses in their chain's order. A record `idOf` cannot name (no stable id) is left out.
   */
  capture(idOf: (record: object) => number | undefined): [recordId: number, hullId: string, lastS: number, pressedS: number][];
  /** A migrated host's presses: the old host's, whole, onto the records `recordOf` finds, each chain in its captured order;
   *  an entry malformed or naming no record is left out. */
  restore(entries: readonly (readonly [number, string, number, number])[], recordOf: (id: number) => object | null | undefined): void;
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
    capture(idOf) {
      const out: [number, string, number, number][] = [];
      for (const [record, head] of presses) {
        const id = idOf(record);
        if (id === undefined) continue;
        for (let entry: PressEntry | null = head; entry; entry = entry.next) {
          if (Number.isFinite(entry.lastS)) out.push([id, entry.hullId, entry.lastS, entry.pressedS]);
        }
      }
      return out;
    },
    restore(entries, recordOf) {
      presses.clear();
      const tails = new Map<object, PressEntry>();
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (!Array.isArray(entry) || !Number.isInteger(entry[0]) || typeof entry[1] !== 'string' || !Number.isFinite(entry[2]) || !Number.isFinite(entry[3])) continue;
        const record = recordOf(entry[0]);
        if (!record) continue;
        const press: PressEntry = { hullId: entry[1], lastS: entry[2], pressedS: entry[3], next: null };
        const tail = tails.get(record);
        if (tail) tail.next = press; else presses.set(record, press);
        tails.set(record, press);
      }
    },
    get size() { return presses.size; },
  };
}
