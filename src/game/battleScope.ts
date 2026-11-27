/**
 * battleScope.ts — the battle's lifetime (battle-teardown-276; Kevin 2026-11-24, a Garage screenshot with the battle's
 * "Gunship overhead · NOW" still over it: "notifications till here in garage - properly clear game state stuff after
 * leaving"). Copyright (c) 2026 Kevin B. Liu (NOTICE.md).
 *
 * The class of the bug: battle-scoped state with no owner that ends it. A notice raised by a frame was taken down only
 * by a later frame, and leaving the battle (quit, the report's return, a Leave, a dropped room, a still or the Studio)
 * stops the frames; a timer, a listener, a body attribute or a memo did the same. One owner ends them all now:
 *
 * - The scope opens when a battle takes the scene and ends when the scene goes anywhere else. Its one opener and closer
 *   is the one phase writer (appLifecycle.ts transitionAppPhase → battleScopeEdge), so every exit path ends it: the
 *   Garage return's write (the Leave, the report's return, the room's return, the prepare behind the report), a dev
 *   still's and a rematch's (a battle written over a battle is a new battle: the old scope ends first). A dev still
 *   ('shot') stages the battle's HUD, so it runs a scope of its own too.
 * - Everything battle-scoped registers with the live scope: its timers (setTimeout, setInterval, requestAnimationFrame),
 *   its listeners (listen(), on the scope's AbortSignal), its disposers (defer()), and its memos (battleScoped(): a value
 *   made fresh for each scope, so a producer's "already raised" can never carry into the next battle).
 * - A producer cannot outlive the scope: defer() on an ended scope runs at once, a timer asked of it never starts, and a
 *   reader with no live scope (currentBattleScope() null) raises nothing.
 * Pure: no DOM (Node receipts drive it; battleScope.selftest.mjs).
 */

/** A disposer, a timer's run, a listener. */
type Run = () => void;
type TimerHandle = ReturnType<typeof setTimeout>;

/** What a scope holds while it lives (a receipt reads it: none once it has ended). */
export interface BattleScopeCounts {
  readonly timers: number;
  readonly intervals: number;
  readonly frames: number;
  readonly listeners: number;
  readonly deferred: number;
}

export interface BattleScope {
  /** Which battle (1, 2, …): a memo keyed by it is the battle's own. */
  readonly id: number;
  /** Why it opened (the phase writer's reason). */
  readonly reason: string;
  /** Aborted when the scope ends: a listener or fetch given it ends with the battle. */
  readonly signal: AbortSignal;
  /** False once ended. */
  readonly live: boolean;
  /** Runs `dispose` when the scope ends (at once if it has); returns its unregister. Disposers run newest first. */
  defer(dispose: Run): Run;
  /** A timer that dies with the battle (never started on an ended scope). */
  setTimeout(run: Run, ms: number): TimerHandle | null;
  clearTimeout(handle: TimerHandle | null | undefined): void;
  setInterval(run: Run, ms: number): TimerHandle | null;
  clearInterval(handle: TimerHandle | null | undefined): void;
  requestAnimationFrame(run: (timeMs: number) => void): number | null;
  cancelAnimationFrame(handle: number | null | undefined): void;
  /** A DOM listener removed when the battle ends (the scope's signal). */
  listen(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions): void;
  /** What it holds now. */
  counts(): BattleScopeCounts;
}

const raf = (run: (timeMs: number) => void): number => (typeof requestAnimationFrame === 'function'
  ? requestAnimationFrame(run)
  : Number(setTimeout(() => run(Date.now()), 16)));
const caf = (handle: number): void => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
  else clearTimeout(handle as unknown as TimerHandle);
};

/** A lifetime's holdings and its end (the battle's here, a life's in lifeScope.ts: one implementation of both). */
export function createScope(id: number, reason: string): BattleScope & { end(): void } {
  const abort = new AbortController();
  const timers = new Set<TimerHandle>();
  const intervals = new Set<TimerHandle>();
  const frames = new Set<number>();
  const deferred: Run[] = [];
  let listeners = 0;
  let live = true;
  const scope: BattleScope & { end(): void } = {
    id,
    reason,
    signal: abort.signal,
    get live() { return live; },
    defer(dispose) {
      if (!live) { dispose(); return () => {}; }
      deferred.push(dispose);
      return () => {
        const at = deferred.indexOf(dispose);
        if (at >= 0) deferred.splice(at, 1);
      };
    },
    setTimeout(run, ms) {
      if (!live) return null;
      const handle = setTimeout(() => { timers.delete(handle); run(); }, ms);
      timers.add(handle);
      return handle;
    },
    clearTimeout(handle) {
      if (handle == null) return;
      clearTimeout(handle);
      timers.delete(handle);
    },
    setInterval(run, ms) {
      if (!live) return null;
      const handle = setInterval(run, ms);
      intervals.add(handle);
      return handle;
    },
    clearInterval(handle) {
      if (handle == null) return;
      clearInterval(handle);
      intervals.delete(handle);
    },
    requestAnimationFrame(run) {
      if (!live) return null;
      const handle = raf((timeMs) => { frames.delete(handle); run(timeMs); });
      frames.add(handle);
      return handle;
    },
    cancelAnimationFrame(handle) {
      if (handle == null) return;
      caf(handle);
      frames.delete(handle);
    },
    listen(target, type, listener, options = {}) {
      if (!live) return;
      target.addEventListener(type, listener, { ...options, signal: abort.signal });
      listeners += 1;
    },
    counts() {
      return Object.freeze({ timers: timers.size, intervals: intervals.size, frames: frames.size, listeners, deferred: deferred.length });
    },
    end() {
      if (!live) return;
      live = false;
      abort.abort();
      listeners = 0;
      for (const handle of timers) clearTimeout(handle);
      timers.clear();
      for (const handle of intervals) clearInterval(handle);
      intervals.clear();
      for (const handle of frames) caf(handle);
      frames.clear();
      // newest first (a later producer may lean on an earlier one); one failing never keeps the rest
      for (let dispose = deferred.pop(); dispose; dispose = deferred.pop()) {
        try { dispose(); } catch (error) { console.error(`[scope ${reason}] a disposer failed`, error); }
      }
    },
  };
  return scope;
}

let current: (BattleScope & { end(): void }) | null = null;
let serial = 0;
/** Counts every open and end: a battle and the stretch after it each have their own (battleScoped's key). */
let epoch = 0;
let lastEnded: { id: number; reason: string } | null = null;

/** The live battle's scope, or null outside a battle (the Garage, the Studio, the boot). */
export function currentBattleScope(): BattleScope | null {
  return current;
}

/** Opens a battle's scope (ending the one before: a battle written over a battle is a new battle). */
export function openBattleScope(reason: string): BattleScope {
  endBattleScope(`superseded:${reason}`);
  current = createScope(++serial, reason);
  epoch += 1;
  return current;
}

/** Ends the live scope: its listeners, timers and frames stop, then its disposers run. Nothing when none is live. */
export function endBattleScope(reason: string): void {
  const scope = current;
  if (!scope) return;
  // (cleared first: a disposer that reads the live scope, or raises something, finds none)
  current = null;
  epoch += 1;
  lastEnded = { id: scope.id, reason };
  scope.end();
}

/** The phases whose scene runs a battle's presentation (a dev still stages the battle HUD). */
const BATTLE_PHASES: ReadonlySet<string> = new Set(['battle', 'shot']);

/**
 * The one phase writer's hook (appLifecycle.ts transitionAppPhase), between its write and its announcement, so
 * phase:change listeners see the new battle's scope (or none): a battle written opens a fresh scope (a rematch in place
 * too); a still re-written keeps its own; any other phase ends it.
 */
export function battleScopeEdge(from: string, next: string, reason: string): void {
  if (next === 'battle' || (next === 'shot' && from !== 'shot')) openBattleScope(reason);
  else if (!BATTLE_PHASES.has(next)) endBattleScope(reason);
}

/**
 * A value that is the battle's own (a producer's memo: the plates it raised, the key it last sent): made by `make` the
 * first time it is read in a scope, and made again in the next one. The stretch outside a battle has its own (a receipt
 * that drives a producer with no battle keeps one memo), dropped when the next battle opens.
 */
export function battleScoped<T>(make: () => T): () => T {
  let made = -1;
  let value: T | undefined;
  return () => {
    if (made !== epoch) { made = epoch; value = make(); }
    return value as T;
  };
}

/** For receipts and tools: the live scope (its id, reason, holdings) and the last one ended. */
export function battleScopeSnapshot(): {
  readonly live: { readonly id: number; readonly reason: string; readonly counts: BattleScopeCounts } | null;
  readonly lastEnded: { readonly id: number; readonly reason: string } | null;
} {
  return Object.freeze({
    live: current ? Object.freeze({ id: current.id, reason: current.reason, counts: current.counts() }) : null,
    lastEnded,
  });
}
