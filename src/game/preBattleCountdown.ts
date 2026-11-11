/**
 * Advance the local pre-battle countdown without allowing required visual
 * warmup to spill into live controls. Network matches do not use this helper;
 * their authoritative countdown arrives in snapshots.
 *
 * Countdown 2026-09-13 (owner: "it kind of lags at 1, and does not always
 * start visibly from 3"): the warm hold used to sit on the last second, so a
 * slow first world build showed "1" for as long as the shadow and streaming
 * warm took and then jumped to ROLL OUT. The hold now sits at the top of the
 * visible count (3 s): while warm work is pending the numeral waits on "3",
 * and 3 → 2 → 1 → ROLL OUT always runs on warmed frames at wall-clock pace.
 */
const PRE_BATTLE_WARM_HOLD_S = 3;

export function advancePreBattleCountdown(
  seconds: number,
  dtS: number,
  warmPending: boolean,
  holdAtS = PRE_BATTLE_WARM_HOLD_S,
): number {
  if (!Number.isFinite(seconds)) return seconds;
  if (seconds <= 0) return 0;
  const dt = Number.isFinite(dtS) ? Math.max(0, dtS) : 0;
  // A count already below the hold keeps its current value while warm work is pending.
  const floor = warmPending ? Math.min(seconds, Math.max(0, holdAtS)) : 0;
  return Math.max(floor, seconds - dt);
}

/**
 * (2026-11-02 audit F1) The warm hold's limit: seconds the count may wait at its hold for warm work. The hold
 * had no limit, so a warm whose release never came (a stale generation's slot, a lost release) left the count on
 * PREPARING for good. The warm is optional (a battle plays without it; its stages then link at first use), so past
 * the limit the count runs on and the warm finishes behind live play.
 */
export const PRE_BATTLE_WARM_HOLD_LIMIT_S = 30;

/**
 * The most one frame adds to the hold's elapsed time: the cap the frame owner puts on a frame's simulated delta
 * (mainFrameRuntime's dtR). The warm progresses only on frames that run, so a frame that follows a focus loss or a
 * hidden tab (one wall delta of many seconds) is one frame at the hold, not that many seconds of it.
 */
export const WARM_HOLD_FRAME_CAP_S = 0.1;

/** Seconds spent at the hold so far: a frame's `dtS` (capped) counts only while warm work holds a count at or below the hold. */
export function warmHoldElapsed(
  heldS: number,
  seconds: number,
  dtS: number,
  warmPending: boolean,
  holdAtS = PRE_BATTLE_WARM_HOLD_S,
): number {
  if (!warmPending || !Number.isFinite(seconds) || seconds <= 0 || seconds > Math.max(0, holdAtS)) return heldS;
  return heldS + (Number.isFinite(dtS) ? Math.min(WARM_HOLD_FRAME_CAP_S, Math.max(0, dtS)) : 0);
}

/** The warm still holds the count: pending, and its hold has not yet outlasted the limit. */
export function warmHoldActive(heldS: number, warmPending: boolean, limitS = PRE_BATTLE_WARM_HOLD_LIMIT_S): boolean {
  return warmPending && !(heldS >= limitS);
}

/**
 * The shortest count the player sees after the loader: three whole numerals,
 * so the deployment cue always reads 3 → 2 → 1 (was 2, which could open on "2"
 * or flash "3" for a fraction of a second).
 */
export const MIN_VISIBLE_PRE_BATTLE_S = 3;

/**
 * Convert time already spent behind the battle loader into countdown credit.
 * A short visible deployment cue remains so the camera handoff is readable,
 * while a slow first world build no longer pays the complete countdown again.
 * Countdown 2026-09-13: the result is a whole number of seconds (floored, never
 * below the minimum) so the first numeral shown gets its full second.
 */
export function resolveVisiblePreBattleSeconds(
  totalSeconds: number,
  loadingElapsedSeconds: number,
  minimumVisibleSeconds = MIN_VISIBLE_PRE_BATTLE_S,
): number {
  const total = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const elapsed = Number.isFinite(loadingElapsedSeconds)
    ? Math.max(0, loadingElapsedSeconds)
    : 0;
  const minimum = Number.isFinite(minimumVisibleSeconds)
    ? Math.min(total, Math.max(0, minimumVisibleSeconds))
    : 0;
  return Math.floor(Math.min(total, Math.max(minimum, total - elapsed)));
}

/**
 * The battle countdown (2026-11-02 audit F1): `game.preBattleS` is the battle's one written sub-phase, and this is
 * its one writer. Every move — the solo start's arm, the rollout's open, the frame's advance, the network snapshot's
 * follow, the Garage's clear — goes through `transitionBattleCountdown`, which checks the move against
 * BATTLE_COUNTDOWN_EDGES. A move that is not an edge from the current state is ignored (false, nothing written): a
 * second open, an advance with no count running, a count that would rise, a count that is not a count.
 * `appLifecycle.battleSubPhase` reads the state back with the verdict fields.
 * - armed (Infinity): a battle is set up and not yet opened; it is loading behind its cover
 * - counting (a finite count above 0): revealed, controls held
 * - open (0): no count holds the battle; it plays until its verdict (or no battle is on: the Garage)
 */
export type BattleCountdownState = 'armed' | 'counting' | 'open';

/**
 * - arm: a new battle's setup (the solo player-path start, a network round's reset). There is no battle identity in
 *   the count, so it is legal from every state: a rematch, a retained room's next round, a room that supersedes a solo
 *   battle all arm over a count that belongs to the battle they replace.
 * - open(seconds): the reveal opens an armed count (0 rolls out at once). Never reopens a running or open count.
 * - advance(seconds): the local frame's next count, never above the current one.
 * - live: a battle that skips the count (the debug entry).
 * - clear: no battle (the Garage return, a cleared roster).
 * - follow(seconds): the network authority's count from a snapshot (0 once it plays); the client only follows it.
 */
export type BattleCountdownMove = 'arm' | 'open' | 'advance' | 'live' | 'clear' | 'follow';

export const BATTLE_COUNTDOWN_EDGES: Readonly<Record<BattleCountdownState, readonly BattleCountdownMove[]>> = Object.freeze({
  armed: Object.freeze(['arm', 'open', 'live', 'clear', 'follow'] as const),
  counting: Object.freeze(['arm', 'advance', 'live', 'clear', 'follow'] as const),
  open: Object.freeze(['arm', 'live', 'clear', 'follow'] as const),
});

/** The countdown state a `preBattleS` value encodes. */
export function battleCountdownState(seconds: number): BattleCountdownState {
  if (seconds === Infinity) return 'armed';
  return seconds > 0 ? 'counting' : 'open';
}

/**
 * The one `preBattleS` writer. Returns true when it wrote the move, false when it ignored it: the move is not an edge
 * from the current state, an advance would raise the count, or the count of an open, advance or follow is not a
 * finite, non-negative number (never written: the network snapshot's path must not throw in a frame).
 */
// hot-path: the frame's advance and the network snapshot's follow run here every countdown frame
export function transitionBattleCountdown(game: { preBattleS: number }, move: BattleCountdownMove, seconds = 0): boolean {
  if ((move === 'open' || move === 'advance' || move === 'follow') && !(Number.isFinite(seconds) && seconds >= 0)) return false;
  const current = game.preBattleS;
  if (!BATTLE_COUNTDOWN_EDGES[battleCountdownState(current)].includes(move)) return false;
  if (move === 'advance' && seconds > current) return false;
  game.preBattleS = move === 'arm' ? Infinity : move === 'live' || move === 'clear' ? 0 : seconds;
  return true;
}
