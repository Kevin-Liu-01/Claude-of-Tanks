/**
 * The countdown's warm hold (2026-11-02 audit F2): one owner for what four writers kept in a boolean and a counter.
 * A solo deployment arms a hold for its generation (the countdown then shows PREPARING); only that generation's
 * release lifts it (the deferred warm's, or the deployment's own on failure); invalidation (the Garage return, a
 * renderer reset) supersedes every hold at once. A stale owner's release can never lift a successor's hold.
 */
export interface BattleWarmHold {
  /** The current generation: a battle's warm work is current while this still equals the generation it armed. */
  readonly generation: number;
  /** The countdown is held for the current generation's warm work. */
  readonly pending: boolean;
  /** A new generation, held until its release. */
  arm(): number;
  /** Lift the hold armed for `generation`; any other generation releases nothing. */
  release(generation: number): boolean;
  /** Supersede every hold: a new generation, nothing held. */
  invalidate(): void;
}

export function createBattleWarmHold(): BattleWarmHold {
  let generation = 0;
  let held: number | null = null;
  return {
    get generation() { return generation; },
    get pending() { return held !== null && held === generation; },
    arm() {
      generation += 1;
      held = generation;
      return generation;
    },
    release(owner) {
      if (held === null || owner !== held || owner !== generation) return false;
      held = null;
      return true;
    },
    invalidate() {
      generation += 1;
      held = null;
    },
  };
}
