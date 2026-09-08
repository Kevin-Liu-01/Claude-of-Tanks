export type Rgba8ReadbackStage = 'contextQuery' | 'createBuffer' | 'bindingQuery' | 'bindBuffer'
  | 'bufferData' | 'sizeQuery' | 'readPixels' | 'fence' | 'flush' | 'wait' | 'copy' | 'release';
type ReadbackTimings = Partial<Record<Rgba8ReadbackStage, number>>;
type ReadbackMeasure = <Result>(stage: Rgba8ReadbackStage, run: () => Result) => Result;

/** Timing injection is for deterministic tests; delay must settle after its task. */
export interface Rgba8ReadbackOptions {
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
  /** May shorten the default 5000 ms ownership limit, but never extend it. */
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Opt-in accumulated milliseconds. Wait is wall time, including poll context queries. */
  timings?: ReadbackTimings;
}

interface ReadbackResources {
  buffer: WebGLBuffer | null;
  sync: WebGLSync | null;
}

function timingClock(now: () => number): number {
  try { return now(); } catch { return NaN; }
}

function recordTiming(
  timings: ReadbackTimings | undefined,
  stage: Rgba8ReadbackStage,
  startedAt: number,
  now: () => number,
): void {
  if (!timings || !Number.isFinite(startedAt)) return;
  try {
    const elapsed = now() - startedAt;
    if (!Number.isFinite(elapsed) || elapsed < 0) return;
    const prior = timings[stage];
    const total = (typeof prior === 'number' && Number.isFinite(prior) && prior >= 0 ? prior : 0) + elapsed;
    if (Number.isFinite(total)) timings[stage] = total;
  } catch { /* Optional diagnostics cannot change readback or cleanup outcomes. */ }
}

function createReadbackMeasure(timings: ReadbackTimings | undefined, now: () => number): ReadbackMeasure {
  return (stage, run) => {
    if (!timings) return run();
    const startedAt = timingClock(now);
    try { return run(); }
    finally { recordTiming(timings, stage, startedAt, now); }
  };
}

function withPackBuffer(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  run: () => void,
  measure: ReadbackMeasure,
): void {
  const previous = measure('bindingQuery', () => gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING)) as WebGLBuffer | null;
  let failed = false;
  try {
    measure('bindBuffer', () => gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer));
    run();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try { measure('bindBuffer', () => gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previous)); }
    catch (error) { if (!failed) throw error; }
  }
}

function releaseReadback(gl: WebGL2RenderingContext, resources: ReadbackResources): void {
  let failed = false;
  try { if (resources.sync) gl.deleteSync(resources.sync); }
  catch (error) {
    failed = true;
    throw error;
  } finally {
    try { if (resources.buffer) gl.deleteBuffer(resources.buffer); }
    catch (error) { if (!failed) throw error; }
  }
}

function remainingTime(deadline: number, now: () => number): number {
  const remaining = deadline - now();
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('rgba8_readback_timeout');
  return remaining;
}

function assertReadable(
  gl: WebGL2RenderingContext, deadline: number, now: () => number, measure: ReadbackMeasure,
): void {
  if (measure('contextQuery', () => gl.isContextLost())) throw new Error('rgba8_readback_context_lost');
  remainingTime(deadline, now);
}

async function waitForReadback(
  gl: WebGL2RenderingContext,
  sync: WebGLSync,
  deadline: number,
  now: () => number,
  delay: (milliseconds: number) => Promise<void>,
  interval: number,
  measure: ReadbackMeasure,
): Promise<void> {
  for (;;) {
    // One awaited task at a time: timeout leaves no detached poll or late copy.
    await delay(Math.min(interval, remainingTime(deadline, now)));
    assertReadable(gl, deadline, now, measure);
    const status = gl.clientWaitSync(sync, 0, 0);
    if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) return;
    if (status !== gl.TIMEOUT_EXPIRED) throw new Error('rgba8_readback_wait_failed');
  }
}

function readbackByteLength(width: number, height: number, pixels: Uint8Array): number {
  const byteLength = width * height * 4;
  if (!Number.isSafeInteger(width) || width <= 0 || width > 0x7fffffff
    || !Number.isSafeInteger(height) || height <= 0 || height > 0x7fffffff
    || !Number.isSafeInteger(byteLength) || pixels.byteLength < byteLength) {
    throw new Error('rgba8_readback_invalid_input');
  }
  return byteLength;
}

/**
 * Snapshot the currently bound RGBA8 framebuffer into an independently owned
 * PBO before returning. The caller owns framebuffer setup and tight/default
 * PACK layout, and must not reuse pixels until this promise settles. No GL
 * binding is retained across a task; concurrent calls need separate pixels.
 */
export async function beginRgba8Readback(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  pixels: Uint8Array,
  options: Rgba8ReadbackOptions = {},
): Promise<void> {
  const timeout = options.timeoutMs ?? 5000;
  const interval = options.pollIntervalMs ?? 4;
  const byteLength = readbackByteLength(width, height, pixels);
  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isFinite(interval) || interval <= 0) {
    throw new Error('rgba8_readback_invalid_input');
  }
  const now = options.now ?? (() => performance.now());
  const delay = options.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timings = options.timings;
  const measure = createReadbackMeasure(timings, now);
  const deadline = now() + Math.min(timeout, 5000);
  if (!Number.isFinite(deadline)) throw new Error('rgba8_readback_invalid_clock');
  const resources: ReadbackResources = { buffer: null, sync: null };
  let failed = false;
  try {
    assertReadable(gl, deadline, now, measure);
    const buffer = resources.buffer = measure('createBuffer', () => gl.createBuffer());
    if (!buffer) throw new Error('rgba8_readback_buffer_unavailable');
    withPackBuffer(gl, buffer, () => {
      measure('bufferData', () => gl.bufferData(gl.PIXEL_PACK_BUFFER, byteLength, gl.STREAM_READ));
      measure('readPixels', () => gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0));
      resources.sync = measure('fence', () => gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0));
      if (!resources.sync) throw new Error('rgba8_readback_fence_unavailable');
      measure('flush', () => gl.flush());
    }, measure);
    if (!resources.sync) throw new Error('rgba8_readback_fence_unavailable');
    const waitStartedAt = timings ? timingClock(now) : NaN;
    try { await waitForReadback(gl, resources.sync, deadline, now, delay, interval, measure); }
    finally { recordTiming(timings, 'wait', waitStartedAt, now); }
    assertReadable(gl, deadline, now, measure);
    withPackBuffer(gl, buffer, () => {
      // A size query during enqueue can flush preceding render work. Keep the
      // OOM/storage check, but perform it only after the owned fence signals.
      if (measure('sizeQuery', () => gl.getBufferParameter(gl.PIXEL_PACK_BUFFER, gl.BUFFER_SIZE)) !== byteLength) {
        throw new Error('rgba8_readback_allocation_failed');
      }
      assertReadable(gl, deadline, now, measure);
      measure('copy', () => gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels, 0, byteLength));
    }, measure);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try { measure('release', () => releaseReadback(gl, resources)); }
    catch (error) { if (!failed) throw error; }
  }
}
