import type { GarageDressingAccess } from './garageDressingAccess.ts';

interface GarageDressingSchedulerOptions {
  dressing: GarageDressingAccess;
  getPhase(): string;
  isTransitionActive(): boolean;
  requestIdle(callback: () => void): unknown;
  scheduleDelay(callback: () => void, delayMs: number): unknown;
  acquireBackgroundWork?: (
    kind: 'dressing',
    stillValid: () => boolean,
  ) => Promise<{ release(): void } | null>;
  now?: () => number;
  warn?: (message: string, error: unknown) => void;
  onVisualChange?: () => void;
  quietMs?: number;
}

export interface GarageDressingScheduler {
  noteActivity(): void;
  getLastActivityAt(): number;
  schedule(): void;
  readonly scheduled: boolean;
}

function messageOf(error: unknown): string {
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
  requestIdle,
  scheduleDelay,
  acquireBackgroundWork = async () => ({ release() {} }),
  now = () => performance.now(),
  warn = (message, error) => console.warn(message, messageOf(error)),
  onVisualChange = () => {},
  quietMs = 900,
}: GarageDressingSchedulerOptions): GarageDressingScheduler {
  const required = [getPhase, isTransitionActive,
    requestIdle, scheduleDelay, acquireBackgroundWork, now, warn, onVisualChange];
  if (!dressing || required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('garage dressing scheduler requires every runtime port');
  }

  let lastActivityAt = now();
  let buildScheduled = false;

  const defer = (delayMs: number) => {
    scheduleDelay(schedule, delayMs);
  };

  const quiet = () => now() - lastActivityAt >= quietMs;

  const run = async () => {
    buildScheduled = false;
    if (dressing.isBuilt() || getPhase() !== 'garage') return;

    // A transition is never a garage-idle window. This specifically avoids
    // paying for an exhibit during the opaque veil's final "Ready" dwell.
    if (isTransitionActive()) {
      defer(350);
      return;
    }
    if (!quiet()) {
      defer(300);
      return;
    }

    const stillValid = () => getPhase() === 'garage'
      && !isTransitionActive() && quiet() && !dressing.isBuilt();
    const lease = await acquireBackgroundWork('dressing', stillValid);
    if (!lease) {
      if (!dressing.isBuilt() && getPhase() === 'garage') defer(200);
      return;
    }

    try {
      await dressing.preload();
      // Import/evaluation can overlap new input or a phase transition.
      if (getPhase() !== 'garage' || isTransitionActive()) return;
      if (!quiet()) {
        defer(300);
        return;
      }

      // Access preload resolves the three requested fleet families once. Each
      // later lease adds one complete static-preview tank or one cheap turret
      // clone, keeping exact workshop displays outside the visible boot path.
      await dressing.pump();
      onVisualChange();
    } catch (error: unknown) {
      warn('[garageDressing] quiet build failed —', error);
    } finally {
      lease.release();
    }

    if (!dressing.isBuilt() && getPhase() === 'garage') defer(140);
  };

  const schedule = () => {
    if (dressing.isBuilt() || buildScheduled) return;
    buildScheduled = true;
    requestIdle(() => { void run(); });
  };

  return {
    noteActivity() { lastActivityAt = now(); },
    getLastActivityAt() { return lastActivityAt; },
    schedule,
    get scheduled() { return buildScheduled; },
  };
}
