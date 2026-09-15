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
