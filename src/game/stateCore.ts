import type { RuntimeValue } from '../runtimeTypes.ts';
import { matchRulesetFor, type MatchRuleset } from '../sim/matchRuleset.ts';
import type { AppPhase } from './appLifecycle.ts';
import type { WatchSession } from './watchSeat.ts';
import { endCouchSession, type CouchSession } from './couchSeats.ts';
/**
 * Lightweight integration state shared by the garage, Studio, and battle
 * runtime. This module deliberately has no Three.js, DOM, WebGL, vehicle, or
 * simulation imports (the ruleset table is pure data, couchSeats.ts the couch
 * session's pure owner) so presentation-only entry points do not acquire the
 * combat graph merely to create a bus or an empty session.
 */

// The frame-stage hook (game/frameStages.ts; battle-spikes-253): re-exported here so the boot's existing shared chunk
// carries it (its own module became a boot request of its own when the frame and the step both imported it)
export { FRAME_STAGE, FRAME_STAGE_NAMES, frameStages, setFrameStageSink, type FrameStageSink } from './frameStages.ts';

export type RandomSource = () => number;
export type EventListener = (payload: RuntimeValue) => void;
type EventRecorder = (event: string, payload: RuntimeValue) => void;

export interface EventBus {
  on(event: string, listener: EventListener): () => void;
  off(event: string, listener: EventListener): void;
  emit(event: string, payload: RuntimeValue): void;
}

export interface GameState<Entity = RuntimeValue, Spotting = RuntimeValue, MatchModeState = RuntimeValue> {
  /**
   * Who owns the scene and the simulation. Written only through appLifecycle.ts `transitionAppPhase` (2026-11-02
   * audit F1); a battle's end is its `result`, the finer states (loading, countdown, verdict hold, report, the Garage
   * behind the report) are the lifecycle's derived `state`.
   */
  phase: AppPhase;
  preBattleS: number;
  mapId: string;
  tanks: Entity[];
  /** Complete announced multiplayer roster for names/scores; never use for world visibility or targeting. */
  rosterTanks?: Entity[];
  allTanks: Entity[];
  battleCount: number;
  /** Injected once at app entry; roster planning stays deterministic within a session. */
  rosterSeed: number;
  tankById: Map<string, Entity>;
  player: Entity | null;
  shells: RuntimeValue[];
  nextShellId: number;
  timeS: number;
  fireTickAcc: number;
  combatRng: RandomSource;
  result: 'victory' | 'defeat' | 'draw' | null;
  resultReason: string | null;
  /** Sim time of the verdict (battle endings, 2026-09-25): the ruleset's post-verdict hold counts from here. */
  resultTimeS: number | null;
  spotting: Spotting | null;
  openingRouteJobs: RuntimeValue[];
  gameMode: string;
  matchModeState: MatchModeState | null;
  matchModeController: RuntimeValue | null;
  modeEvents: Array<{ type: string; payload: Record<string, RuntimeValue> }>;
  /** The rules the current battle plays by (sim/matchRuleset.ts); Standard between battles. */
  ruleset: MatchRuleset;
  /** Campaign ladder operation of the current sortie; null for free sorties. */
  campaignOperationId: string | null;
  /** Watch mode (game/watchSeat.ts): a watched battle's seat ledger; null otherwise. */
  watch?: WatchSession | null;
  /** Couch mode (game/couchSeats.ts): which tank each phone drives; null otherwise. */
  couch?: CouchSession<Entity> | null;
  /** The dev battle hold's switch (dev/battleHold.ts; game/devBattleHold.ts reads it); absent in a player's session. */
  devBattleHold?: boolean;
}

/**
 * Whether a couch battle's phones drive its seats now (round 8 Y1 s2-01): a session (couchSeats.ts, its one owner), the
 * ruleset's couch rules and the battle phase. The page's gates on whether the phones drive ask this: the keyboard's frame
 * input (battleFrameRuntime), the HUD's and the keys' actions (playerBattleActions), the shared screen's reveal
 * (watchRevealsAll) and the seats' Pause (main.ts's couch togglePause port; round 8 merge review r1). setupBattle's own
 * seating reads the session it just began (the phase is still the Garage's there).
 * src/app/couchRuntime.ts (app-couch's) still reads game.couch with gates of its own until it asks this one: frame() checks
 * all three terms inline, source() the phase and the couch rules for a seat's tank, and beforeStep() only the session and
 * the couch rules, which holds because main.ts calls it only from the local battle step (stepSimulation, which
 * battleFrameRuntime runs in the battle phase alone).
 */
export function couchSeatsActive(game: {
  phase?: string;
  ruleset?: { readonly couch?: unknown } | null;
  couch?: unknown;
}): boolean {
  return !!game.couch && !!game.ruleset?.couch && game.phase === 'battle';
}

/**
 * Watch mode (game/watchSeat.ts): the local view shows every hull — a watched battle, opened, with no seat taken (nothing to hide from a watcher with
 * no side). A taken seat sees as its side does, spotting and all.
 */
export function watchRevealsAll(game: {
  phase?: string;
  player: unknown;
  ruleset?: { readonly watch?: { readonly revealAll: boolean } | null; readonly couch?: unknown } | null;
  watch?: { readonly opened: boolean } | null;
  couch?: { readonly sides: string } | null;
}): boolean {
  // a couch battle with seats on both sides shares one screen, and each seat sees its own side: the screen shows every
  // hull (docs/COUCH-MODE.md; one pane per seat draws only its side's spotting)
  if (couchSeatsActive(game) && game.couch?.sides === 'teams') return true;
  return !!game.ruleset?.watch?.revealAll && !!game.watch?.opened && !game.player;
}

/** Canonical deterministic PRNG used by the legacy solo runtime. */
export function mulberry32(seed: number): RandomSource {
  let state = seed | 0;
  return function random(): number {
    state |= 0;
    state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Synchronous event bus. Listeners are copied before dispatch so subscribing
 * or unsubscribing from inside a callback cannot corrupt the active delivery.
 */
export function createBus(onEmit: EventRecorder | null = null): EventBus {
  const listeners = new Map<string, EventListener[]>();
  return {
    on(event, listener) {
      let group = listeners.get(event);
      if (!group) {
        group = [];
        listeners.set(event, group);
      }
      group.push(listener);
      return () => this.off(event, listener);
    },
    off(event, listener) {
      const group = listeners.get(event);
      if (!group) return;
      const index = group.indexOf(listener);
      if (index >= 0) group.splice(index, 1);
    },
    emit(event, payload) {
      if (onEmit) {
        try {
          onEmit(event, payload);
        } catch {
          // Diagnostics are observational and must never affect gameplay.
        }
      }
      const group = listeners.get(event);
      if (group) {
        for (const listener of group.slice()) listener(payload);
      }
    },
  };
}

/** Create an empty mutable session without loading any battle implementation. */
export function createGameState<
  Entity = RuntimeValue,
  Spotting = RuntimeValue,
  MatchModeState = RuntimeValue,
>({ rosterSeed = 0 }: { rosterSeed?: number } = {}): GameState<Entity, Spotting, MatchModeState> {
  return {
    phase: 'garage',
    preBattleS: 0,
    mapId: 'verdant',
    tanks: [],
    allTanks: [],
    battleCount: 0,
    rosterSeed: rosterSeed >>> 0,
    tankById: new Map(),
    player: null,
    shells: [],
    nextShellId: 1,
    timeS: 0,
    fireTickAcc: 0,
    combatRng: mulberry32(6000),
    result: null,
    resultReason: null,
    resultTimeS: null,
    spotting: null,
    openingRouteJobs: [],
    gameMode: 'standard',
    matchModeState: null,
    matchModeController: null,
    modeEvents: [],
    ruleset: matchRulesetFor('standard'),
    campaignOperationId: null,
  };
}

/**
 * Garage return (2026-09-14): drop the finished match's objective state so nothing of it — markers,
 * events, the campaign operation, a bent ruleset, a couch battle's seats (round 8 Y1 s2-01) — leaks into the garage or
 * the next sortie, a network round's included.
 */
export function clearMatchSession(game: Pick<GameState,
  'gameMode' | 'matchModeState' | 'matchModeController' | 'modeEvents' | 'ruleset' | 'campaignOperationId' | 'couch'>): void {
  endCouchSession(game);
  game.matchModeController = null;
  game.matchModeState = null;
  game.modeEvents.length = 0;
  game.gameMode = 'standard';
  game.ruleset = matchRulesetFor('standard');
  game.campaignOperationId = null;
}
