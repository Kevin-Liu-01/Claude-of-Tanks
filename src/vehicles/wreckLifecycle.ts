/**
 * wreckLifecycle.ts — a tank visual's wreck as one declared state and one transition owner (2026-11-02 audit F10).
 *
 * The visual (tankFactoryCore.ts) used to hold its wreck in one boolean latch: `setDestroyed` returned early once set,
 * so a second call with a different cause was dropped. A network peer learns a kill from two paths that race (the
 * row's DESTROYED flag and the `tank_destroyed` event that carries the cause), so a cook-off whose flag landed first
 * stayed a plain wreck: the slow char, the plain gun bend, no turret trail. And nothing latched a disposed visual, so
 * a late FX timer could wreck one whose GPU resources were gone.
 *
 *  - intact  → plain | cookoff   (destroy)
 *  - plain   → cookoff           (destroy with pop AND lateCause, while the wreck is younger than WRECK_POP_UPGRADE_S):
 *                                the cause arrived after the flag. Only the network presentation says so (battlePresentation
 *                                updateDestruction, on its repeat call when the cause flips the pop); every other repeat —
 *                                an FX timer's deferred wreck after the Studio laid its own plain one, a killcam re-wreck —
 *                                is ignored, as the old latch ignored it, and so is a late cause past the window.
 *  - cookoff                     never un-pops (a plain repeat is ignored)
 *  - any     → intact            (reset: a rematch, a respawn, a killcam restage; also safe on an intact visual)
 *  - any     → disposed          (dispose); a disposed visual takes nothing again
 *
 * Node-only module (no three), so selftests can read the table directly.
 */

export type TankWreckState = 'intact' | 'plain' | 'cookoff' | 'disposed';

export type TankWreckEvent =
  /** `lateCause`: this destroy is the kill's own cause arriving after its wreck was laid (a network peer's
   *  tank_destroyed event after the row's DESTROYED flag), so it may upgrade a young plain wreck */
  | { readonly kind: 'destroy'; readonly pop: boolean; readonly lateCause?: boolean }
  | { readonly kind: 'reset' }
  | { readonly kind: 'dispose' };

/** What the owner does for an event: lay a wreck, upgrade plain to cook-off, restore, tear down, or nothing. */
export type TankWreckMove = 'wreck' | 'upgrade' | 'reset' | 'dispose' | 'ignore';

/**
 * How long after the kill (wreck age, s) a plain wreck still takes a late cook-off cause. A peer's event queue lands
 * an event at most a few ticks after its row (mp events.ts); a second is well past that, and short enough that the
 * re-thrown turret still reads as the kill's own.
 */
export const WRECK_POP_UPGRADE_S = 1;

/** The move an event makes from `state` (`wreckAgeS`: the current wreck's age, s; ignored while intact). */
export function tankWreckMove(state: TankWreckState, event: TankWreckEvent, wreckAgeS: number): TankWreckMove {
  if (state === 'disposed') return 'ignore';
  if (event.kind === 'dispose') return 'dispose';
  if (event.kind === 'reset') return 'reset';
  if (state === 'intact') return 'wreck';
  if (state === 'plain' && event.pop && event.lateCause === true && wreckAgeS < WRECK_POP_UPGRADE_S) return 'upgrade';
  return 'ignore';
}

/** The state after `move` (from tankWreckMove) with the event's pop. */
export function tankWreckNext(state: TankWreckState, move: TankWreckMove, pop: boolean): TankWreckState {
  switch (move) {
    case 'wreck': return pop ? 'cookoff' : 'plain';
    case 'upgrade': return 'cookoff';
    case 'reset': return 'intact';
    case 'dispose': return 'disposed';
    default: return state;
  }
}

/** A wreck stands (plain or cook-off). */
export function isWreckState(state: TankWreckState): boolean {
  return state === 'plain' || state === 'cookoff';
}
