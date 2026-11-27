/**
 * lifeScope.ts — a seat's life (life-reset-279; Kevin 2026-11-24, live 276, a tray with HEAT 16 drawn in the red "out"
 * state after a respawn: "theres a bug where if youve expended an ammo it doesnt clear the state once you die and respawn
 * or even join another game. fix any kind of bugs like this with game state"). Copyright (c) 2026 Kevin B. Liu
 * (NOTICE.md).
 *
 * The class of the bug: per-life state with no owner that ends it. The battle has one (battleScope.ts: battle → Garage),
 * but a respawn inside a battle is no battle edge, so a slot's refusal, a tray's charges, a panel's damage or a view's
 * zoom set in one life was drawn over the next. A life is the battle scope's lifetime one level down:
 *
 * - A life opens when a seat's hull is first seen alive and ends when it is seen down, when the seat leaves the hull
 *   (Watch's drone, a seat swap) or when its battle ends (it is deferred on the battle's scope). The frame owner that
 *   draws a seat's HUD reports what it sees each frame (lifeScopeFrame), the one edge both drivers share: the solo
 *   step's revive and the room's own-hull mirror both reach the frame as a hull alive again.
 * - A revive the frame never saw down (a mode's 'mode:respawn' between two frames, a room's 'battle:restarted') is a new
 *   life too: attachLifeScopeEdges ends the old one and opens the next on the event, before the next frame draws.
 * - Lives are keyed by the seat's hull id, so a couch split's two seats live and die apart.
 * - What belongs to one life registers here: onLifeStart(run) runs at each new life (a module's per-life reset), and the
 *   live life's scope holds its timers, listeners and disposers (lifeScope(id)), all ended with it.
 * Battle-wide state (the score, the kill feed and counts, the battle record, the contact memory) stays on the battle.
 * Pure: no DOM (lifeScope.selftest.mjs drives it in Node).
 */
import { createScope, currentBattleScope, type BattleScope, type BattleScopeCounts } from './battleScope.ts';

export interface LifeScope extends BattleScope {
  /** The seat's hull whose life this is. */
  readonly entityId: string;
  /** The battle it lives in (null outside one: a receipt's bare life). */
  readonly battleId: number | null;
}

type LiveLife = LifeScope & { end(): void };
type LifeStart = (life: LifeScope) => void;

const lives = new Map<string, LiveLife>();
const lastEnded = new Map<string, { id: number; reason: string; battleId: number | null }>();
const starters = new Set<LifeStart>();
let serial = 0;

/** The seat's live life, or null (down, off the hull, outside a battle). */
export function lifeScope(entityId: string | null | undefined): LifeScope | null {
  return entityId ? lives.get(entityId) ?? null : null;
}

/** Runs `run` at every new life of any seat (the life is live when it runs); returns its unregister. */
export function onLifeStart(run: LifeStart): () => void {
  starters.add(run);
  return () => { starters.delete(run); };
}

/** Opens a seat's life (ending its last one first: a revive written over a life is a new life). */
export function openLifeScope(entityId: string, reason: string): LifeScope {
  endLifeScope(entityId, `superseded:${reason}`);
  const battle = currentBattleScope();
  const scope = createScope(++serial, `life:${reason}`);
  const life: LiveLife = Object.assign(scope, { entityId, battleId: battle?.id ?? null });
  lives.set(entityId, life);
  // the battle's end is every life's end (a quit while alive, a rematch, a still)
  const unhook = battle?.defer(() => endLifeScope(entityId, 'battle-end', life));
  if (unhook) life.defer(unhook);
  for (const run of [...starters]) {
    try { run(life); } catch (error) { console.error('[life scope] a life-start reset failed', error); }
  }
  return life;
}

/** Ends a seat's live life (or only `only`, if it is still the live one). Nothing when none is live. */
export function endLifeScope(entityId: string, reason: string, only?: LifeScope): void {
  const life = lives.get(entityId);
  if (!life || (only && life !== only)) return;
  // (cleared first: a disposer that reads the seat's life finds none)
  lives.delete(entityId);
  lastEnded.set(entityId, { id: life.id, reason, battleId: life.battleId });
  life.end();
}

/** What a frame owner saw of its seat's hull: a hull seen alive with no life opens one; one seen down ends it. */
interface LifeFrameEntity {
  readonly id: string;
  readonly combat?: { readonly destroyed?: boolean } | null;
}

/**
 * The frame edge (battleHudFrameRuntime.update, every battle frame, before anything else): `seat` is the frame's own
 * hull (game.player, a couch pane's tank) or null when the seat holds none. `previous` is the hull the same frame owner
 * reported last (its seat left it: that life ends).
 */
export function lifeScopeFrame(seat: LifeFrameEntity | null, previous: string | null = null): void {
  if (previous && previous !== seat?.id) endLifeScope(previous, seat ? 'seat-changed' : 'seat-left');
  if (!seat) return;
  const alive = !seat.combat?.destroyed;
  const live = lives.get(seat.id);
  if (alive && !live) openLifeScope(seat.id, livedHere(seat.id) ? 'revive' : 'spawn');
  else if (!alive && live) endLifeScope(seat.id, 'death');
}

/** A seat whose last life ended in the live battle (a bot's revive, never a seat's, opens no life). */
function livedHere(entityId: string): boolean {
  const ended = lastEnded.get(entityId);
  return !!ended && ended.battleId === (currentBattleScope()?.id ?? null);
}

interface LifeEdgeBus {
  on(type: string, listener: (payload?: unknown) => void): unknown;
}

/**
 * The event edges a frame can miss (main.ts wires the battle bus once; couch panes share it): a 'mode:respawn' of a
 * seat that has lived in this battle starts its next life now, ending one the frame never saw down; a room's
 * 'battle:restarted' starts every live seat's life over.
 */
export function attachLifeScopeEdges(bus: LifeEdgeBus): void {
  bus.on('mode:respawn', (payload) => {
    const id = (payload as { id?: unknown } | null | undefined)?.id;
    if (typeof id !== 'string' || !id) return;
    if (lives.has(id) || livedHere(id)) openLifeScope(id, 'respawn');
  });
  bus.on('battle:restarted', () => {
    for (const id of [...lives.keys()]) openLifeScope(id, 'restart');
  });
}

/** For receipts and tools: every live life (its seat, id, reason, holdings) and each seat's last ended one. */
export function lifeScopeSnapshot(): {
  readonly live: readonly { readonly entityId: string; readonly id: number; readonly reason: string; readonly counts: BattleScopeCounts }[];
  readonly lastEnded: Readonly<Record<string, { readonly id: number; readonly reason: string; readonly battleId: number | null }>>;
} {
  return Object.freeze({
    live: [...lives.values()].map((life) => Object.freeze({ entityId: life.entityId, id: life.id, reason: life.reason, counts: life.counts() })),
    lastEnded: Object.freeze(Object.fromEntries(lastEnded)),
  });
}
