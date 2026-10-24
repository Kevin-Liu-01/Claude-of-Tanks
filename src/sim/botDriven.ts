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
