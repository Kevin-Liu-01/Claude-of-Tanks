import { endingHoldExpired, type MatchRuleset } from '../sim/matchRuleset.ts';
import { battleCountdownState } from './preBattleCountdown.ts';

/**
 * The app's lifecycle (2026-11-02 audit F1). `game.phase` says who owns the scene and the simulation; it is written
 * only through `transitionAppPhase`, which checks the edge, writes the phase and announces it as `phase:change`
 * through the lifecycle bound to that session. Everything finer — the Garage still behind the report, the battle's
 * loading, countdown, live, verdict hold and report — is derived here from the fields their own owners write (the
 * entry lifecycle, the Garage return, the countdown owner's `preBattleS` (preBattleCountdown.ts
 * `transitionBattleCountdown`, its one writer), the simulation's `result`, `resultTimeS`), so no second writer keeps a
 * copy that can disagree. Pure: no DOM, no WebGL (src/mp and Node selftests import it).
 */

/** Who owns the scene and the simulation (`game.phase`). */
export type AppPhase = 'garage' | 'battle' | 'shot' | 'studio';

/** The lifecycle as players, tools and tests see it. */
export type AppLifecycleState =
  /** The Garage is the screen and its presentation is restored. */
  | 'garage'
  /** The Garage owns the scene but not yet the screen: a return under its veil, a preparation behind the battle
   * report (perf-246), a handoff, a skipped or failed restore. */
  | 'returning'
  /** A battle entry covers the screen (solo loading, a network join), or a battle is armed and not yet opened. */
  | 'loading'
  /** The battle is revealed and counting down; controls are held. */
  | 'countdown'
  /** Controls are released and no verdict has landed. */
  | 'live'
  /** The verdict landed; the ruleset's ending hold still steps the world. */
  | 'verdict'
  /** The hold expired: the frozen report. */
  | 'report'
  | 'studio'
  | 'shot';

/** The battle's own sub-phase, from the authoritative fields alone. */
export type BattleSubPhase = 'loading' | 'countdown' | 'live' | 'verdict' | 'report';

/**
 * Legal scene hand-overs. Re-entering the same phase is allowed (a rematch in place, a retried return, a Studio map
 * switch); the Studio and a battle never hand over directly (each goes through the Garage), and a dev still (shot)
 * may start anything because it has no return of its own.
 */
export const APP_PHASE_EDGES: Readonly<Record<AppPhase, readonly AppPhase[]>> = Object.freeze({
  garage: Object.freeze(['garage', 'battle', 'studio', 'shot'] as const),
  battle: Object.freeze(['battle', 'garage', 'shot'] as const),
  studio: Object.freeze(['studio', 'garage'] as const),
  shot: Object.freeze(['shot', 'garage', 'battle', 'studio'] as const),
});

const APP_PHASES: readonly AppPhase[] = ['garage', 'battle', 'shot', 'studio'];

export function isAppPhase(value: unknown): value is AppPhase {
  return typeof value === 'string' && (APP_PHASES as readonly string[]).includes(value);
}

/** An illegal scene hand-over, refused before anything was written. */
export class AppPhaseTransitionError extends Error {
  readonly code = 'app_phase_illegal';
  readonly from: string;
  readonly to: string;
  readonly reason: string;
  constructor(from: string, to: string, reason: string) {
    super(`The ${from} cannot hand the scene to the ${to} directly (${reason}).`);
    this.name = 'AppPhaseTransitionError';
    this.from = from;
    this.to = to;
    this.reason = reason;
  }
}

export interface AppPhaseTransitionOptions {
  /** Who moved the phase, for the announcement and the lifecycle's receipt. */
  readonly reason: string;
  /**
   * false: the scene changes hands, the screen does not — a Garage return under the battle report or its veil writes
   * the Garage scene first and announces it at its screen handoff. Default true.
   */
  readonly announce?: boolean;
  /** Runs after the phase is written and before the announcement (the battle start's lighting swap). */
  readonly beforeAnnounce?: () => void;
}

/** The fields the lifecycle derives from (stateCore GameState satisfies it). */
export interface AppLifecycleGame {
  phase: AppPhase;
  preBattleS: number;
  result: string | null;
  resultTimeS: number | null;
  timeS: number;
  ruleset?: MatchRuleset | null;
}

export interface AppPhaseAnnouncement {
  readonly phase: AppPhase;
  readonly from: AppPhase;
  readonly reason: string;
}

export interface AppLifecycleReaders {
  /** A battle entry's cover is the screen (solo loading, a network join), before its reveal. */
  isEntryCovering?(): boolean;
  /** The Garage return still owes something: a return in flight, a handoff, a skipped or failed restore. */
  isReturnOwed?(): boolean;
}

export interface AppLifecycleSnapshot {
  readonly state: AppLifecycleState;
  readonly phase: AppPhase;
  readonly screenPhase: AppPhase;
  /** Accepted transitions so far (an epoch for tools that wait for the next one). */
  readonly transitions: number;
  readonly lastReason: string | null;
}

export interface AppLifecycle {
  readonly phase: AppPhase;
  /** The phase last announced as `phase:change`: what the screen belongs to. */
  readonly screenPhase: AppPhase;
  readonly state: AppLifecycleState;
  readonly transitions: number;
  transition(next: AppPhase, options: AppPhaseTransitionOptions): void;
  /** Late-bound readers (the entry and return owners are composed after the lifecycle). */
  setReaders(readers: AppLifecycleReaders): void;
  snapshot(): AppLifecycleSnapshot;
}

interface AppLifecycleOptions {
  game: AppLifecycleGame;
  /** The `phase:change` emitter. Its listeners run synchronously inside the transition. */
  announce(announcement: AppPhaseAnnouncement): void;
  readers?: AppLifecycleReaders;
}

const owners = new WeakMap<object, AppLifecycle>();

function assertEdge(from: AppPhase, to: AppPhase, reason: string): void {
  if (!isAppPhase(to)) throw new TypeError(`unknown app phase ${String(to)}`);
  // An unknown current value (a test double, a session written before this owner) may move anywhere.
  if (isAppPhase(from) && !APP_PHASE_EDGES[from].includes(to)) throw new AppPhaseTransitionError(from, to, reason);
}

/** The battle's sub-phase: the countdown owner's state (armed: loading, counting: countdown), then the verdict fields. */
export function battleSubPhase(game: Pick<AppLifecycleGame, 'preBattleS' | 'result' | 'resultTimeS' | 'timeS' | 'ruleset'>): BattleSubPhase {
  const countdown = battleCountdownState(game.preBattleS);
  if (countdown === 'armed') return 'loading';
  if (countdown === 'counting') return 'countdown';
  if (game.result === null || game.result === undefined) return 'live';
  if (!game.ruleset) return 'verdict';
  return endingHoldExpired(game.ruleset, game.resultTimeS, game.timeS) ? 'report' : 'verdict';
}

/** The lifecycle state from the scene phase, the screen phase and the entry/return owners' facts. */
export function deriveAppLifecycleState(
  game: AppLifecycleGame,
  screenPhase: AppPhase,
  { entryCovering = false, returnOwed = false }: { entryCovering?: boolean; returnOwed?: boolean } = {},
): AppLifecycleState {
  const phase = game.phase;
  if (phase === 'studio' || phase === 'shot') return phase;
  if (entryCovering) return 'loading';
  if (phase === 'garage') return screenPhase === 'garage' && !returnOwed ? 'garage' : 'returning';
  return battleSubPhase(game);
}

/** Bind the one lifecycle of a session; every phase writer reaches it through `transitionAppPhase`. */
export function createAppLifecycle({ game, announce, readers: initialReaders = {} }: AppLifecycleOptions): AppLifecycle {
  if (!game || typeof announce !== 'function') {
    throw new TypeError('app lifecycle requires a game session and an announcer');
  }
  let readers: AppLifecycleReaders = { ...initialReaders };
  let screenPhase: AppPhase = isAppPhase(game.phase) ? game.phase : 'garage';
  let transitions = 0;
  let lastReason: string | null = null;
  // A listener that moves the phase again is announced after the current announcement's listeners have all run, so
  // every listener sees the announcements in transition order.
  const queued: AppPhaseAnnouncement[] = [];
  let announcing = false;
  const drain = (): void => {
    announcing = true;
    try {
      for (let next = queued.shift(); next; next = queued.shift()) announce(next);
    } finally {
      announcing = false;
      queued.length = 0;
    }
  };

  const read = (reader: (() => boolean) | undefined): boolean => {
    try { return reader?.() === true; } catch { return false; }
  };
  const state = (): AppLifecycleState => deriveAppLifecycleState(game, screenPhase, {
    entryCovering: read(readers.isEntryCovering),
    returnOwed: read(readers.isReturnOwed),
  });

  const lifecycle: AppLifecycle = {
    get phase() { return game.phase; },
    get screenPhase() { return screenPhase; },
    get state() { return state(); },
    get transitions() { return transitions; },
    transition(next, { reason, announce: shouldAnnounce = true, beforeAnnounce }) {
      const from = game.phase;
      assertEdge(from, next, reason);
      game.phase = next;
      transitions += 1;
      lastReason = reason;
      beforeAnnounce?.();
      if (!shouldAnnounce) return;
      const previousScreen = screenPhase;
      screenPhase = next;
      queued.push(Object.freeze({ phase: next, from: previousScreen, reason }));
      if (!announcing) drain();
    },
    setReaders(next) { readers = { ...readers, ...next }; },
    snapshot() {
      return Object.freeze({ state: state(), phase: game.phase, screenPhase, transitions, lastReason });
    },
  };
  owners.set(game, lifecycle);
  return lifecycle;
}

/** The lifecycle bound to this session, if any. */
export function appLifecycleOf(game: object): AppLifecycle | null {
  return owners.get(game) ?? null;
}

/**
 * The player is at a settled Garage screen: the lifecycle's 'garage' state (not a return under its veil, a
 * preparation behind the battle report, or an entry's cover). A bare session (no lifecycle) reads its scene phase.
 * For readers that open something over the Garage UI (the Studio's F8).
 */
export function isGarageScreenSettled(game: { phase: AppPhase }): boolean {
  const owner = owners.get(game);
  return owner ? owner.state === 'garage' : game.phase === 'garage';
}

/**
 * The one phase writer. With a bound lifecycle it announces `phase:change`; a bare session (a Node selftest's game
 * double) still gets the edge check and the write, with nobody to announce to.
 */
export function transitionAppPhase(game: { phase: AppPhase }, next: AppPhase, options: AppPhaseTransitionOptions): void {
  const owner = owners.get(game);
  if (owner) { owner.transition(next, options); return; }
  assertEdge(game.phase, next, options.reason);
  game.phase = next;
  options.beforeAnnounce?.();
}
