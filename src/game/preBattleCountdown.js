/**
 * Advance the local pre-battle countdown without allowing required visual
 * warmup to spill into live controls. Network matches do not use this helper;
 * their authoritative countdown arrives in snapshots.
 */
export function advancePreBattleCountdown(seconds, dtS, warmPending, holdAtS = 1) {
  if (!Number.isFinite(seconds)) return seconds;
  if (seconds <= 0) return 0;
  const dt = Number.isFinite(dtS) ? Math.max(0, dtS) : 0;
  const floor = warmPending ? Math.max(0, holdAtS) : 0;
  return Math.max(floor, seconds - dt);
}
