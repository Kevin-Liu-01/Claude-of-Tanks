/** Narrow view of the pinned Three program; the renderer owns its lifetime. */
export interface TopMaskProgram {
  program?: WebGLProgram;
  isReady(): boolean;
}

export interface TopMaskProgramContext {
  isContextLost(): boolean;
}

/** Deterministic test timing; injected delay must settle after its task. */
export interface TopMaskProgramWarmOptions {
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
  /** May shorten, but never extend, the 5000 ms ownership limit. */
  timeoutMs?: number;
  pollIntervalMs?: number;
}

function assertProgramAlive(program: TopMaskProgram): void {
  if (!program?.program || typeof program.isReady !== 'function') {
    throw new Error('top_mask_program_unavailable');
  }
}

function remainingTime(deadline: number, now: () => number): number {
  const remaining = deadline - now();
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('top_mask_program_timeout');
  return remaining;
}

function assertContextReady(context: TopMaskProgramContext, deadline: number, now: () => number): void {
  if (context.isContextLost()) throw new Error('top_mask_program_context_lost');
  remainingTime(deadline, now);
}

function programsReady(programs: readonly TopMaskProgram[]): boolean {
  let ready = true;
  for (const program of programs) {
    // Keep checking previously-ready refs: their owner can dispose them while
    // another program is pending. Never substitute material.currentProgram.
    assertProgramAlive(program);
    if (!program.isReady()) ready = false;
    assertProgramAlive(program);
  }
  return ready;
}

/**
 * Wait only for captured program identities, with no renderer binding or
 * native compileAsync timer ownership. Failure never disposes borrowed GL
 * programs, and one awaited delay at a time leaves no poll after settlement.
 */
export async function waitForTopMaskPrograms(
  programs: readonly TopMaskProgram[],
  context: TopMaskProgramContext,
  options: TopMaskProgramWarmOptions = {},
): Promise<void> {
  const timeout = options.timeoutMs ?? 5000;
  const interval = options.pollIntervalMs ?? 4;
  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isFinite(interval) || interval <= 0) {
    throw new Error('top_mask_program_invalid_timing');
  }
  const now = options.now ?? (() => performance.now());
  const delay = options.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + Math.min(timeout, 5000);
  if (!Number.isFinite(deadline)) throw new Error('top_mask_program_invalid_clock');
  const pinned = [...new Set(programs)];
  for (const program of pinned) assertProgramAlive(program);
  assertContextReady(context, deadline, now);
  if (pinned.length === 0) return;
  for (;;) {
    await delay(Math.min(interval, remainingTime(deadline, now)));
    assertContextReady(context, deadline, now);
    const ready = programsReady(pinned);
    assertContextReady(context, deadline, now);
    if (ready) return;
  }
}
