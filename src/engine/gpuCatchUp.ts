/**
 * gpuCatchUp.ts — (battle-spikes-253) a non-blocking "has the GPU caught up?" answer for link polls.
 *
 * In Chrome every getProgramParameter, COMPLETION_STATUS_KHR included, is a synchronous round trip: the main thread waits
 * until the GPU process has worked through every command queued before it. Behind a deep queue (a room's Garage return,
 * its first frames' links and uploads) one such query blocked 1.3 s (nav-perf's root-r leave: programWarm →
 * getProgramParameter). A fence's status is not a round trip: Blink answers clientWaitSync(sync, 0, 0) from a status
 * it refreshes between tasks. A poll that queries only once the fence it left at its previous poll has signalled waits
 * for the commands since that fence, not for a GPU process seconds behind.
 *
 * One gate per drain (two drains sharing one would take each other's answers). Without fences (WebGL1, a fake context)
 * or on a lost context the gate always answers caught up, so the poll behaves as before.
 */

/** The fence calls a gate needs: WebGL2's. */
type FenceContext = Pick<WebGL2RenderingContext, 'fenceSync' | 'clientWaitSync' | 'deleteSync' | 'flush'
  | 'isContextLost' | 'SYNC_GPU_COMMANDS_COMPLETE' | 'TIMEOUT_EXPIRED'>;

export interface GpuCatchUpGate {
  /**
   * True once the GPU has completed every command issued before this gate's previous call (then a new fence marks
   * this call); false while it has not, and on the first call, which only places the fence.
   */
  caughtUp(): boolean;
  /** Delete the outstanding fence. */
  dispose(): void;
}

function hasFences(gl: object): gl is FenceContext {
  const candidate = gl as Partial<FenceContext>;
  return typeof candidate.fenceSync === 'function' && typeof candidate.clientWaitSync === 'function'
    && typeof candidate.deleteSync === 'function';
}

export function createGpuCatchUpGate(gl: WebGLRenderingContext | WebGL2RenderingContext): GpuCatchUpGate {
  const fences = hasFences(gl) ? gl : null;
  let fence: WebGLSync | null = null;
  let disabled = !fences;
  const release = (): void => {
    if (!fence || !fences) return;
    try { fences.deleteSync(fence); } catch { /* a lost context took it */ }
    fence = null;
  };
  const place = (): boolean => {
    try {
      fence = fences!.fenceSync(fences!.SYNC_GPU_COMMANDS_COMPLETE, 0);
      fences!.flush();
    } catch { fence = null; }
    // no fence to watch: answer as before rather than wait for nothing
    if (!fence) disabled = true;
    return !!fence;
  };
  return {
    caughtUp() {
      if (disabled) return true;
      try { if (fences!.isContextLost?.()) { release(); return true; } }
      catch { return true; }
      if (!fence) return !place();
      let status: number;
      try { status = fences!.clientWaitSync(fence, 0, 0); }
      catch { release(); disabled = true; return true; }
      if (status === fences!.TIMEOUT_EXPIRED) return false;
      // signalled (ALREADY_SIGNALED / CONDITION_SATISFIED) or WAIT_FAILED: no reason left to hold the query back
      release();
      place();
      return true;
    },
    dispose() { release(); },
  };
}
