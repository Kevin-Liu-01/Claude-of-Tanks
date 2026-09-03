import type { RuntimeValue } from '../runtimeTypes.ts';
export interface BootProgressScreen {
  begin(stage: string): void;
  end(stage: string): void;
}

export type BootTimings = Record<string, number>;

export interface BootLifecycle {
  readonly startedAt: number;
  readonly timings: BootTimings;
  run<T>(stage: string, work: () => T | Promise<T>): Promise<T>;
  run(stage: string, work?: null): Promise<void>;
  completeManualStage(stage: string, stageStartedAt?: number): void;
}

interface BootLifecycleOptions {
  screen: BootProgressScreen;
  yieldFrame: () => Promise<RuntimeValue>;
  now?: () => number;
  heavyStageMs?: number;
}

/**
 * Own staged first-load progress and timing attribution. The runner records
 * work between named stages instead of letting it disappear from telemetry,
 * and only pays a second paint yield after genuinely heavy work.
 */
export function createBootLifecycle({
  screen,
  yieldFrame,
  now = () => performance.now(),
  heavyStageMs = 20,
}: BootLifecycleOptions): BootLifecycle {
  if (!screen || typeof screen.begin !== 'function' || typeof screen.end !== 'function') {
    throw new TypeError('boot lifecycle requires a progress screen');
  }
  if (typeof yieldFrame !== 'function' || typeof now !== 'function') {
    throw new TypeError('boot lifecycle requires frame and clock functions');
  }
  if (!Number.isFinite(heavyStageMs) || heavyStageMs < 0) {
    throw new TypeError('heavy boot stage threshold must be non-negative');
  }

  const timings: BootTimings = {};
  const startedAt = now();
  timings.imports = Math.round(startedAt);
  let lastMark = startedAt;

  const markGap = (stage: string, at: number) => {
    const gap = Math.round(at - lastMark);
    if (gap > 1) timings[`gap>${stage}`] = gap;
  };

  const completeManualStage = (stage: string, stageStartedAt = startedAt) => {
    const completedAt = now();
    screen.end(stage);
    timings[stage] = Math.round(completedAt - stageStartedAt);
    lastMark = completedAt;
  };

  async function run<T>(stage: string, work: () => T | Promise<T>): Promise<T>;
  async function run(stage: string, work?: null): Promise<void>;
  async function run<T>(
    stage: string,
    work?: (() => T | Promise<T>) | null,
  ): Promise<T | undefined> {
    markGap(stage, now());
    screen.begin(stage);
    await yieldFrame();
    const stageStartedAt = now();
    const output = work ? await work() : undefined;
    const completedAt = now();
    timings[stage] = Math.round(completedAt - stageStartedAt);
    screen.end(stage);
    if (completedAt - stageStartedAt > heavyStageMs) await yieldFrame();
    lastMark = now();
    return output;
  }

  return {
    startedAt,
    timings,

    run,

    completeManualStage,
  };
}
