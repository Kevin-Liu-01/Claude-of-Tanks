/**
 * Who drives a hull (Watch mode, watch-drone-244). A seat's `bot` flag is its role in the mode — a bot's seat or the
 * human's — and never changes; a watcher who takes a bot's seat drives it as the player (`isPlayer`, its controller
 * parked by game/watchSeat.ts). Control decisions — how an FPV drone steers, whether a launch is the controller's, who
 * may collect a cache — read this; role decisions (squads, the human's one life, the Horde's survivors) keep `bot`.
 * Outside Watch a bot is never the player, so this reads exactly as `bot` there. Copyright © 2026 Kevin B. Liu.
 */
export function botDriven(entity: { readonly bot?: boolean; readonly isPlayer?: boolean }): boolean {
  return !!entity.bot && !entity.isPlayer;
}

/**
 * Whether the rollover lifecycle rights this hull by itself after ROLLOVER_AUTO_RIGHT_S (sim/rollover.ts): every live hull
 * no player is at the keys of — a bot's seat, and the human seat while Watch has its brain drive it; a player keeps the
 * self-right key, a watcher's taken seat too. Both drivers gate their rollover step on this (2026-11-02 audit M6: the
 * authority read `!bot`, the solo step `isPlayer` — the same outside Watch, and only `isPlayer` follows a taken seat).
 */
export function autoRightsItself(entity: {
  readonly isPlayer?: boolean; readonly modeActive?: boolean; readonly combat?: { readonly destroyed?: boolean } | null;
}): boolean {
  return entity.modeActive !== false && !!entity.combat && !entity.combat.destroyed && !entity.isPlayer;
}
