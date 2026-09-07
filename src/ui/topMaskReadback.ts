/** Timing injection is for deterministic tests; delay must settle after its task. */
export interface TopMaskReadbackOptions {
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
  /** May shorten the default 5000 ms ownership limit, but never extend it. */
  timeoutMs?: number;
  pollIntervalMs?: number;
}

interface ReadbackResources {
  buffer: WebGLBuffer | null;
  sync: WebGLSync | null;
}

function withPackBuffer(gl: WebGL2RenderingContext, buffer: WebGLBuffer, run: () => void): void {
  const previous = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) as WebGLBuffer | null;
  let failed = false;
  try {
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
    run();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previous); }
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
  if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('top_mask_readback_timeout');
  return remaining;
}

function assertReadable(gl: WebGL2RenderingContext, deadline: number, now: () => number): void {
  if (gl.isContextLost()) throw new Error('top_mask_readback_context_lost');
  remainingTime(deadline, now);
}

async function waitForReadback(
  gl: WebGL2RenderingContext,
  sync: WebGLSync,
  deadline: number,
  now: () => number,
  delay: (milliseconds: number) => Promise<void>,
  interval: number,
): Promise<void> {
  for (;;) {
    // One awaited task at a time: timeout leaves no detached poll or late copy.
    await delay(Math.min(interval, remainingTime(deadline, now)));
    assertReadable(gl, deadline, now);
    const status = gl.clientWaitSync(sync, 0, 0);
    if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) return;
    if (status !== gl.TIMEOUT_EXPIRED) throw new Error('top_mask_readback_wait_failed');
  }
}

function readbackByteLength(width: number, height: number, pixels: Uint8Array): number {
  const byteLength = width * height * 4;
  if (!Number.isSafeInteger(width) || width <= 0 || width > 0x7fffffff
    || !Number.isSafeInteger(height) || height <= 0 || height > 0x7fffffff
    || !Number.isSafeInteger(byteLength) || pixels.byteLength < byteLength) {
    throw new Error('top_mask_readback_invalid_input');
  }
  return byteLength;
}

/**
 * Snapshot the currently bound RGBA8 framebuffer into an independently owned
 * PBO before returning. The caller owns framebuffer setup and tight/default
 * PACK layout, and must not reuse pixels until this promise settles. No GL
 * binding is retained across a task; concurrent calls need separate pixels.
 */
export async function beginTopMaskReadback(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  pixels: Uint8Array,
  options: TopMaskReadbackOptions = {},
): Promise<void> {
  const timeout = options.timeoutMs ?? 5000;
  const interval = options.pollIntervalMs ?? 4;
  const byteLength = readbackByteLength(width, height, pixels);
  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isFinite(interval) || interval <= 0) {
    throw new Error('top_mask_readback_invalid_input');
  }
  const now = options.now ?? (() => performance.now());
  const delay = options.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + Math.min(timeout, 5000);
  if (!Number.isFinite(deadline)) throw new Error('top_mask_readback_invalid_clock');
  const resources: ReadbackResources = { buffer: null, sync: null };
  let failed = false;
  try {
    assertReadable(gl, deadline, now);
    const buffer = resources.buffer = gl.createBuffer();
    if (!buffer) throw new Error('top_mask_readback_buffer_unavailable');
    withPackBuffer(gl, buffer, () => {
      gl.bufferData(gl.PIXEL_PACK_BUFFER, byteLength, gl.STREAM_READ);
      if (gl.getBufferParameter(gl.PIXEL_PACK_BUFFER, gl.BUFFER_SIZE) !== byteLength) {
        throw new Error('top_mask_readback_allocation_failed');
      }
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      resources.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!resources.sync) throw new Error('top_mask_readback_fence_unavailable');
      gl.flush();
    });
    if (!resources.sync) throw new Error('top_mask_readback_fence_unavailable');
    await waitForReadback(gl, resources.sync, deadline, now, delay, interval);
    assertReadable(gl, deadline, now);
    withPackBuffer(gl, buffer, () => {
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels, 0, byteLength);
    });
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try { releaseReadback(gl, resources); }
    catch (error) { if (!failed) throw error; }
  }
}
