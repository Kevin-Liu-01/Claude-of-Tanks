import type { RuntimeValue } from '../runtimeTypes.ts';
import { importRetryDelayMs, LAZY_IMPORT_RETRY, type ImportRetryPolicy } from '../app/lazyImportRetry.ts';
import type { GarageDressingAccess } from './garageDressingAccess.ts';

interface GarageDressingSchedulerOptions {
  dressing: GarageDressingAccess;
  getPhase(): string;
  isTransitionActive(): boolean;
  isBattleEntryPending?(): boolean;
  requestIdle(callback: () => void): RuntimeValue;
  scheduleDelay(callback: () => void, delayMs: number): RuntimeValue;
  acquireBackgroundWork?: (
    kind: 'dressing',
    stillValid: () => boolean,
  ) => Promise<{ release(): void } | null>;
  now?: () => number;
  warn?: (message: string, error: RuntimeValue) => void;
  onVisualChange?: () => void;
  quietMs?: number;
  /** 'missing' when a failure is a removed hashed chunk (app/lazyImportRetry.ts classifyChunkFailure). */
  classifyFailure?: (error: RuntimeValue) => Promise<'missing' | 'transient'>;
  /** A removed chunk: this document's deployment is gone; surface the reload path, never retry. */
  onChunkMissing?: (error: RuntimeValue) => void;
  retryPolicy?: ImportRetryPolicy;
}

interface GarageDressingScheduler {
  noteActivity(): void;
  getLastActivityAt(): number;
  schedule(): void;
  readonly scheduled: boolean;
}

function messageOf(error: RuntimeValue): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Stream optional workshop chunks only during a genuine garage lull.
 *
 * The owner is deliberately renderer- and DOM-free. Scheduling primitives,
 * phase state, the demand-loaded dressing, and fleet-family loading are ports,
 * which makes the exact retry/quiet-window ordering deterministic in Node.
 */
export function createGarageDressingScheduler({
  dressing,
  getPhase,
  isTransitionActive,
  isBattleEntryPending = () => false,
  requestIdle,
  scheduleDelay,
  acquireBackgroundWork = async () => ({ release() {} }),
  now = () => performance.now(),
  warn = (message, error) => console.warn(message, messageOf(error)),
  onVisualChange = () => {},
  quietMs = 900,
  classifyFailure = async () => 'transient',
  onChunkMissing = () => {},
  retryPolicy = LAZY_IMPORT_RETRY,
}: GarageDressingSchedulerOptions): GarageDressingScheduler {
  const required = [getPhase, isTransitionActive, isBattleEntryPending,
    requestIdle, scheduleDelay, acquireBackgroundWork, now, warn, onVisualChange, classifyFailure, onChunkMissing];
  if (!dressing || required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('garage dressing scheduler requires every runtime port');
  }

  let lastActivityAt = now();
  let buildScheduled = false;
  // INFRA-P11: consecutive failed attempts back off and stop; a removed chunk stops for good.
  let failures = 0;
  let stopped: 'exhausted' | 'chunk-missing' | null = null;

  const defer = (delayMs: number) => {
    scheduleDelay(queue, delayMs);
  };

  const quiet = () => now() - lastActivityAt >= quietMs;

  const run = async () => {
    buildScheduled = false;
    if (dressing.isBuilt() || getPhase() !== 'garage') return;

    // A transition is never a garage-idle window. This specifically avoids
    // paying for an exhibit during the opaque veil's final "Ready" dwell.
    if (isTransitionActive() || isBattleEntryPending()) {
      defer(350);
      return;
    }
    if (!quiet()) {
      defer(300);
      return;
    }

    const stillValid = () => getPhase() === 'garage'
      && !isTransitionActive() && !isBattleEntryPending() && quiet() && !dressing.isBuilt();
    const lease = await acquireBackgroundWork('dressing', stillValid);
    if (!lease) {
      if (!dressing.isBuilt() && getPhase() === 'garage') defer(200);
      return;
    }

    let failed: { error: RuntimeValue } | null = null;
    try {
      // Acquisition also yields. Do not even start the lazy import if Battle
      // took the Garage between the coordinator's grant and our continuation.
      if (!stillValid()) {
        if (getPhase() === 'garage') defer(350);
        return;
      }
      await dressing.preload();
      // Import/evaluation can overlap new input or a phase transition.
      if (getPhase() !== 'garage') return;
      if (isTransitionActive() || isBattleEntryPending()) {
        defer(350);
        return;
      }
      if (!quiet()) {
        defer(300);
        return;
      }

      // Each lease resolves at most one exact builder and adds at most one
      // complete static-preview tank or final optimization slice, keeping the
      // shared exhibits outside the visible boot and interaction paths.
      await dressing.pump(stillValid);
      if (getPhase() === 'garage' && !isBattleEntryPending()) onVisualChange();
      failures = 0;
    } catch (error) {
      warn('[garageDressing] quiet build failed —', error);
      failed = { error };
    } finally {
      lease.release();
    }

    if (failed) {
      failures += 1;
      if (await classifyFailure(failed.error) === 'missing') {
        stopped = 'chunk-missing';
        onChunkMissing(failed.error);
        return;
      }
      const retryInMs = importRetryDelayMs(failures, retryPolicy);
      if (retryInMs === null) {
        stopped = 'exhausted';
        warn(`[garageDressing] stopped after ${failures} failed attempts; the next garage visit retries —`, failed.error);
        return;
      }
      if (!dressing.isBuilt() && getPhase() === 'garage') defer(retryInMs);
      return;
    }
    if (!dressing.isBuilt() && getPhase() === 'garage') defer(140);
  };

  const queue = () => {
    if (dressing.isBuilt() || buildScheduled || stopped) return;
    buildScheduled = true;
    requestIdle(() => { void run(); });
  };

  // Garage entry and returns open a fresh retry budget; a removed chunk never retries in this document.
  const schedule = () => {
    if (stopped === 'exhausted') {
      stopped = null;
      failures = 0;
    }
    queue();
  };

  return {
    noteActivity() { lastActivityAt = now(); },
    getLastActivityAt() { return lastActivityAt; },
    schedule,
    get scheduled() { return buildScheduled; },
  };
}
