/**
 * freeFallStores.ts — the visual class of an unpowered store (air-support-runs-272; Main 2026-11-11: a laser-guided bomb
 * is unpowered, so it falls with no motor flame). A round whose spec says `flight: 'free_fall'` (sim/shellSpec.ts: a bomb
 * dropped from an aircraft) has no motor and burns no tracer: the tracer pass (projectileTracers.ts) and the missile looks
 * (missileLooks.ts) never draw it, and its body is drawn where it falls (game/airSupportWorld.ts). A networked client's
 * shell carries only its type on the wire, so the round's public announcement (mode_strike_round's `freeFall`, read by
 * game/airSupportBridge.ts) marks its id here. Pure: no three, no DOM. Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 */

type ShellId = string | number;
const marked = new Set<ShellId>();
/** The ids kept (the oldest dropped past it): a store falls for seconds, a battle drops a few. */
const MARKED_MAX = 64;

/** A round announced as a free-fall store (its id, as the shell the snapshot sends carries it). */
export function markFreeFallStore(id: ShellId): void {
  marked.add(id);
  if (marked.size > MARKED_MAX) marked.delete(marked.values().next().value!);
}

/** Whether a live shell is an unpowered store: by its own spec (a solo battle's, the authority's), else by its id's
 *  announcement (a networked client's). */
export function isFreeFallStore(shell: { id?: ShellId | null; spec?: { flight?: unknown } | null }): boolean {
  if (shell.spec?.flight === 'free_fall') return true;
  return shell.id != null && marked.has(shell.id);
}
