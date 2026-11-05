/**
 * studioSession.ts — the Studio session's lifecycle and what holds it (2026-11-02 audit F9).
 *
 * One declared phase and one generation. Every asynchronous step a session starts (its entry, a battlefield change, a
 * scene load, a light change, a film export) takes a token and checks it after each await: an exit, or a failed entry,
 * moves the generation on and every token it handed out goes stale at once. The exit also runs the cancels registered
 * with the session (a film export's abort) and waits, bounded, for the work it holds (an atmosphere preparation, an
 * export's own end) before the Garage takes the battlefield back: nothing of a closed session lands after its teardown.
 * Held work that outlives the bound gets its undo (hold's afterEnd) once the teardown is done, unless a newer session is
 * live by then: the teardown's restore stays the last word however slow the work. Work the exit does not wait for at all
 * (a battlefield build, which the world runtime activates when it lands) is trailed: a late result gets its undo the same
 * way, once the teardown is done.
 *
 *   closed ──beginEntry──▶ entering ──open──▶ open
 *                            │                 │
 *                            └───beginExit─────┴──▶ exiting ──close──▶ closed
 *
 * A failed entry leaves through the same exit (beginExit, then the shared teardown). Any other move is refused (the
 * transition returns false and changes nothing). Node-runnable: no DOM, no renderer.
 */

export type StudioSessionPhase = 'closed' | 'entering' | 'open' | 'exiting';

const EDGES: Readonly<Record<StudioSessionPhase, readonly StudioSessionPhase[]>> = {
  closed: ['entering'],
  entering: ['open', 'exiting'],
  open: ['exiting'],
  exiting: ['closed'],
};

/** A step of a session that ended (an exit, a failed entry): named AbortError, so every caller reads it as a cancel. */
export class StudioSessionEnded extends Error {
  constructor() {
    super('The Studio session ended');
    this.name = 'AbortError';
  }
}

export const isStudioSessionEnded = (error: unknown): boolean => error instanceof StudioSessionEnded;

export interface StudioSessionToken {
  readonly generation: number;
  /** True while the session that issued the token is still the live one (entering or open). */
  current(): boolean;
  /** Throws StudioSessionEnded once that session ended. */
  check(): void;
}

export interface StudioSessionOptions {
  /** How long an exit waits for the session's held work before it tears down anyway (default 5 s). */
  readonly settleMs?: number;
  readonly setTimeout?: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout?: (handle: unknown) => void;
}

export interface StudioSession {
  readonly phase: StudioSessionPhase;
  readonly generation: number;
  /** A token for the live session; stale from the start when no session is entering or open. */
  token(): StudioSessionToken;
  /** closed → entering: a new generation. Null when a session is already running or still exiting. */
  beginEntry(): StudioSessionToken | null;
  /** entering → open, for the entry that holds `token` only. */
  open(token: StudioSessionToken): boolean;
  /** entering|open → exiting: every token goes stale and every registered cancel runs. */
  beginExit(): boolean;
  /** exiting → closed, once the teardown is done. */
  close(): boolean;
  /** Register in-flight work's cancel; an exit runs it. Returns its release. */
  onEnd(cancel: () => void): () => void;
  /**
   * Work the exit waits for (settled, never rethrown) before its teardown; returns `work` itself. `afterEnd` undoes work
   * that settles after the exit stopped waiting (the bound): it runs once the teardown is done (at close, or at once when
   * the Studio already closed), and never while a newer session is live (that session owns what the work touched).
   */
  hold<T>(work: Promise<T>, afterEnd?: () => void): Promise<T>;
  /**
   * Work the exit does not wait for (a battlefield build: Exit stays quick through one), whose late effect `afterEnd`
   * undoes: it runs when `work` fulfils after its session ended, once that teardown is done (at close, or at once when the
   * Studio already closed), and never while a newer session is live. A rejected work changed nothing: no undo. Returns
   * `work` itself.
   */
  trail<T>(work: Promise<T>, afterEnd: () => void): Promise<T>;
  /**
   * Resolves once the held work settled, or after settleMs (true when it all settled). During an exit that is the work of
   * the session it ends (and anything held since the exit began); an earlier session's is left to its own afterEnd.
   */
  settled(): Promise<boolean>;
}

export function createStudioSession(options: StudioSessionOptions = {}): StudioSession {
  const settleMs = options.settleMs ?? 5000;
  const schedule = options.setTimeout ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const unschedule = options.clearTimeout ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  let phase: StudioSessionPhase = 'closed';
  let generation = 0;
  const cancels = new Set<() => void>();
  // held work and the generation it was held under (round 2 U36: an exit waits for its own session's only)
  const held = new Map<Promise<unknown>, number>();
  // the generation of the session the running exit ends (beginExit moves the generation past it)
  let exitingFrom = -1;
  // the generation whose exit stopped waiting for held work (its teardown may run from then on), and the undos of work
  // that settled after that, waiting for the teardown to finish
  let waitedGeneration = -1;
  const afterClose: Array<() => void> = [];
  const undo = (afterEnd: () => void): void => {
    try { afterEnd(); } catch (error) { console.error('[studio] undoing late work failed', error); }
  };

  const move = (next: StudioSessionPhase): boolean => {
    if (!EDGES[phase].includes(next)) return false;
    phase = next;
    return true;
  };
  const live = (): boolean => phase === 'entering' || phase === 'open';
  const tokenFor = (issued: number, valid: boolean): StudioSessionToken => {
    const current = (): boolean => valid && issued === generation && live();
    return {
      generation: issued,
      current,
      check() { if (!current()) throw new StudioSessionEnded(); },
    };
  };

  return {
    get phase() { return phase; },
    get generation() { return generation; },
    token: () => tokenFor(generation, live()),
    beginEntry() {
      if (!move('entering')) return null;
      generation += 1;
      return tokenFor(generation, true);
    },
    open(token) {
      if (phase !== 'entering' || !token.current()) return false;
      return move('open');
    },
    beginExit() {
      if (!move('exiting')) return false;
      exitingFrom = generation;
      generation += 1;
      const pending = [...cancels];
      cancels.clear();
      for (const cancel of pending) {
        try { cancel(); } catch (error) { console.error('[studio] cancelling in-flight work failed', error); }
      }
      return true;
    },
    close() {
      if (!move('closed')) return false;
      for (const afterEnd of afterClose.splice(0)) undo(afterEnd);
      return true;
    },
    onEnd(cancel) {
      cancels.add(cancel);
      return () => { cancels.delete(cancel); };
    },
    hold(work, afterEnd) {
      const issued = generation;
      const owned = live(); // held by a live session (else it was stale from the start)
      const entry = work.then(() => undefined, () => undefined);
      held.set(entry, issued);
      void entry.then(() => {
        held.delete(entry);
        if (!afterEnd || (owned && issued === generation)) return; // still its own session's: nothing to undo
        if (phase === 'closed') undo(afterEnd);
        else if (phase === 'exiting' && waitedGeneration === generation) afterClose.push(afterEnd);
        // exiting and still waiting: the teardown runs after this work; entering or open: a newer session owns it
      });
      return work;
    },
    trail(work, afterEnd) {
      const issued = generation;
      const owned = live();
      void work.then(() => {
        if (owned && issued === generation) return; // still its own live session's
        if (phase === 'closed') undo(afterEnd);
        else if (phase === 'exiting') afterClose.push(afterEnd); // after the teardown, whatever it still waits for
        // entering or open: a newer session owns what the work touched
      }, () => undefined);
      return work;
    },
    settled() {
      const waited = (): void => { if (phase === 'exiting') waitedGeneration = generation; };
      // (round 2 U36) an exit waits for the work of the session it ends (and anything held since it began), never for an
      // earlier session's: that work's token is stale and its afterEnd covers it, and one that hung kept every later exit
      // under its veil for the full bound
      const since = phase === 'exiting' ? exitingFrom : -Infinity;
      const mine = [...held].filter(([, issued]) => issued >= since).map(([entry]) => entry);
      if (!mine.length) { waited(); return Promise.resolve(true); }
      return new Promise<boolean>((resolve) => {
        const handle = schedule(() => { waited(); resolve(false); }, settleMs);
        void Promise.all(mine).then(() => { unschedule(handle); waited(); resolve(true); });
      });
    },
  };
}

/** What holds the Studio, the first that applies (audit F9: one reading every entry point asks). */
export type StudioBusy = 'recording' | 'film' | 'export' | 'session' | 'scene' | 'map' | 'history' | 'light';

export interface StudioBusyFlags {
  /** The session is open (not closed, entering or exiting). */
  readonly open: boolean;
  readonly recording: boolean;
  /** The renderer is at film size (an open film, a film still). */
  readonly filming: boolean;
  /** A film export runs (from its request to its file or its cancel). */
  readonly exporting: boolean;
  /** A scene replacement: a load or a staging sequence. */
  readonly scene: boolean;
  readonly mapChange: boolean;
  /** An undo or redo is restoring a document. */
  readonly restoring: boolean;
  /** A time of day or sun change is preparing the battlefield's light (it lands inside its own awaits). */
  readonly lighting: boolean;
}

export function studioBusy(flags: StudioBusyFlags): StudioBusy | null {
  if (flags.recording) return 'recording';
  if (flags.filming) return 'film';
  if (flags.exporting) return 'export';
  if (!flags.open) return 'session';
  if (flags.scene) return 'scene';
  if (flags.mapChange) return 'map';
  if (flags.restoring) return 'history';
  if (flags.lighting) return 'light';
  return null;
}

/** The take owns the playhead (play, pause, rate, shuttle, seek, step) while it records, renders or exports a film. */
export const transportHeld = (busy: StudioBusy | null): boolean => busy === 'recording' || busy === 'film' || busy === 'export';

/**
 * (round 2 U36) What keeps an edit out of the history and the autosave: every holder but a battlefield change and a light
 * change. Neither touches the tanks, the storyboard or the effects, and the document names the battlefield and the time
 * as rendered until the change lands, so an exit or a page hide during one still commits the last edit (a commit refused
 * there was lost: the flush stops once the Studio closes). Read from the flags, not from busy()'s first holder, which a
 * battlefield change would rank above an undo in flight.
 */
export const historyHeld = (flags: StudioBusyFlags): StudioBusy | null => studioBusy({ ...flags, mapChange: false, lighting: false });
