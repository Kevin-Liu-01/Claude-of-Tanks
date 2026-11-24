// (276) A state toggle's sound settles on the final state. Scoping in and out, auto-aim on and off, the lights, the roof
// gun and the sight's zoom steps used to sound on every edge through their cue's re-trigger cooldown (voicePool.ts), which
// dropped repeats: a fast in-and-out played both sounds, and three toggles inside the cooldown could end on the wrong one.
// Now a toggle is a trailing debounce: once its state has held SETTLE_S with no change, the sound of the state it holds
// plays once; a state that ends where it started plays nothing. Continuous one-shots (impacts, props) keep their
// cooldowns. Pure and DOM-free: the engine feeds it edges on its audio clock and plays what `due` returns.
// First-party: Kevin B. Liu (NOTICE.md).

/** How long a toggle's state must hold before it sounds (s). */
export const TOGGLE_SETTLE_S = 0.12;

export type ToggleState = string | number | boolean;

export interface SettledToggle {
  readonly id: string;
  /** the state it settled on */
  readonly state: ToggleState;
  /** the state it left (the one last sounded, or the first seen) */
  readonly from: ToggleState;
}

export interface ToggleSettle {
  /** A toggle's state moved from `from` to `to` at `nowS`. A toggle already moving keeps the state it started from. */
  change(id: string, from: ToggleState, to: ToggleState, nowS: number): void;
  /** The toggles that have held their state SETTLE_S by `nowS` and end somewhere new; each is forgotten as it is read. */
  due(nowS: number): SettledToggle[];
  /** Forgets a moving toggle (a scope edge resets the zoom's), or every one (a battle's end). */
  cancel(id?: string): void;
  /** Toggles still moving (a receipt's view). */
  readonly pending: number;
}

export function createToggleSettle(settleS = TOGGLE_SETTLE_S): ToggleSettle {
  const moving = new Map<string, { from: ToggleState; to: ToggleState; at: number }>();
  return {
    change(id, from, to, nowS) {
      const entry = moving.get(id);
      if (entry) { entry.to = to; entry.at = nowS; return; }
      if (from === to) return;
      moving.set(id, { from, to, at: nowS });
    },
    due(nowS) {
      const out: SettledToggle[] = [];
      for (const [id, entry] of moving) {
        if (nowS - entry.at < settleS - 1e-9) continue;
        moving.delete(id);
        if (entry.to !== entry.from) out.push({ id, state: entry.to, from: entry.from });
      }
      return out;
    },
    cancel(id) {
      if (id == null) moving.clear();
      else moving.delete(id);
    },
    get pending() { return moving.size; },
  };
}
