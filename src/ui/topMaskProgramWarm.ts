/** Narrow view of the pinned Three program; the renderer owns its lifetime. */
export interface TopMaskProgram {
  id?: number;
  program?: WebGLProgram;
  isReady(): boolean;
  getUniforms?(): object;
  getAttributes?(): object;
}

export interface TopMaskProgramContext {
  isContextLost(): boolean;
  isCurrent(): boolean;
  hasProgram(program: TopMaskProgram): boolean;
}

export interface TopMaskProgramPreparation {
  /** Recheck after the caller's final await, immediately before the mask draw. */
  assertCurrent(): void;
}

/** Deterministic test timing; injected delay must settle after its task. */
export interface TopMaskProgramWarmOptions {
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
  /** May shorten, but never extend, the 5000 ms ownership limit. */
  timeoutMs?: number;
  pollIntervalMs?: number;
}

interface CapturedMaskProgram {
  program: TopMaskProgram;
  handle: WebGLProgram;
  initialized: boolean;
}

function captureProgram(program: TopMaskProgram): CapturedMaskProgram {
  if (typeof program?.program !== 'object' || program.program === null
    || typeof program.isReady !== 'function' || typeof program.getUniforms !== 'function'
    || typeof program.getAttributes !== 'function') {
    throw new Error('top_mask_program_unavailable');
  }
  return { program, handle: program.program, initialized: false };
}

function assertProgramAlive(entry: CapturedMaskProgram, context: TopMaskProgramContext): void {
  if (entry.program.program !== entry.handle || !context.hasProgram(entry.program)) {
    throw new Error('top_mask_program_unavailable');
  }
}

function remainingTime(deadline: number, now: () => number): number {
  const remaining = deadline - now();
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('top_mask_program_timeout');
  return remaining;
}

function assertContextCurrent(context: TopMaskProgramContext): void {
  if (!context.isCurrent()) throw new Error('top_mask_program_context_changed');
  if (context.isContextLost()) throw new Error('top_mask_program_context_lost');
}

function assertCapturedCurrent(entries: readonly CapturedMaskProgram[], context: TopMaskProgramContext): void {
  assertContextCurrent(context);
  // Previously reflected refs remain required while another program is pending.
  for (const entry of entries) assertProgramAlive(entry, context);
}

function initializeReadyProgram(
  entry: CapturedMaskProgram,
  context: TopMaskProgramContext,
  deadline: number,
  now: () => number,
): boolean {
  assertContextCurrent(context);
  assertProgramAlive(entry, context);
  remainingTime(deadline, now);
  const ready = entry.program.isReady();
  assertContextCurrent(context);
  assertProgramAlive(entry, context);
  remainingTime(deadline, now);
  if (ready !== true) return false;
  const uniforms = entry.program.getUniforms?.();
  assertContextCurrent(context);
  assertProgramAlive(entry, context);
  if (typeof uniforms !== 'object' || uniforms === null) throw new Error('top_mask_program_uniforms_unavailable');
  const attributes = entry.program.getAttributes?.();
  assertContextCurrent(context);
  assertProgramAlive(entry, context);
  if (typeof attributes !== 'object' || attributes === null) throw new Error('top_mask_program_attributes_unavailable');
  entry.initialized = true;
  return true;
}

function orderRecentPrograms(entries: CapturedMaskProgram[]): boolean {
  const ids = entries.map(({ program }) => program.id);
  if (ids.some((id) => typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0)
    || new Set(ids).size !== entries.length) return false;
  // Match the engine's newest-first KHR scheduling without dropping old variants.
  entries.sort((a, b) => (b.program.id ?? 0) - (a.program.id ?? 0));
  return true;
}

/**
 * Prepare only captured program identities, including actual uniform AND
 * attribute reflection. No renderer binding or native compileAsync timers are
 * owned here. One awaited task at a time leaves no poll after settlement;
 * neither success nor failure disposes borrowed renderer programs.
 */
export async function waitForTopMaskPrograms(
  programs: readonly TopMaskProgram[],
  context: TopMaskProgramContext,
  options: TopMaskProgramWarmOptions = {},
): Promise<TopMaskProgramPreparation> {
  const timeout = options.timeoutMs ?? 5000;
  const interval = options.pollIntervalMs ?? 4;
  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isFinite(interval) || interval <= 0) {
    throw new Error('top_mask_program_invalid_timing');
  }
  const now = options.now ?? (() => performance.now());
  const delay = options.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + Math.min(timeout, 5000);
  if (!Number.isFinite(deadline)) throw new Error('top_mask_program_invalid_clock');
  const pinned = [...new Set(programs)].map(captureProgram);
  const newestFirst = orderRecentPrograms(pinned);
  const receipt = { assertCurrent: () => assertCapturedCurrent(pinned, context) };
  receipt.assertCurrent();
  remainingTime(deadline, now);
  let checkpoints = 2048; // A frozen clock stays finite; 4 ms polls can still reach the real 5 s limit.
  const checkpoint = async (): Promise<void> => {
    if (checkpoints-- <= 0) throw new Error('top_mask_program_timeout');
    await delay(Math.min(interval, remainingTime(deadline, now)));
    receipt.assertCurrent();
    remainingTime(deadline, now);
  };
  let pending = pinned;
  while (pending.length) {
    await checkpoint();
    let sliceAt = now();
    let visits = 0;
    for (let index = 0; index < pending.length; index++) {
      const ready = initializeReadyProgram(pending[index], context, deadline, now);
      if (!ready && newestFirst) break;
      visits++;
      if (index + 1 < pending.length && (visits >= 32 || now() - sliceAt >= 4)) {
        await checkpoint();
        sliceAt = now();
        visits = 0;
      }
    }
    pending = pending.filter((entry) => !entry.initialized);
  }
  receipt.assertCurrent();
  return receipt;
}
