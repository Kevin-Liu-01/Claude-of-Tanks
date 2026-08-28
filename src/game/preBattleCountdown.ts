/**
 * Advance the local pre-battle countdown without allowing required visual
 * warmup to spill into live controls. Network matches do not use this helper;
 * their authoritative countdown arrives in snapshots.
 */
export function advancePreBattleCountdown(
  seconds: number,
  dtS: number,
  warmPending: boolean,
  holdAtS = 1,
): number {
  if (!Number.isFinite(seconds)) return seconds;
  if (seconds <= 0) return 0;
  const dt = Number.isFinite(dtS) ? Math.max(0, dtS) : 0;
  const floor = warmPending ? Math.max(0, holdAtS) : 0;
  return Math.max(floor, seconds - dt);
}

/**
 * Convert time already spent behind the battle loader into countdown credit.
 * A short visible deployment cue remains so the camera handoff is readable,
 * while a slow first world build no longer pays the complete countdown again.
 */
export function resolveVisiblePreBattleSeconds(
  totalSeconds: number,
  loadingElapsedSeconds: number,
  minimumVisibleSeconds = 2,
): number {
  const total = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const elapsed = Number.isFinite(loadingElapsedSeconds)
    ? Math.max(0, loadingElapsedSeconds)
    : 0;
  const minimum = Number.isFinite(minimumVisibleSeconds)
    ? Math.min(total, Math.max(0, minimumVisibleSeconds))
    : 0;
  return Math.min(total, Math.max(minimum, total - elapsed));
}
