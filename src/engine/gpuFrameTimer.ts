/**
 * Sampled GPU time of the rendered frame for the resolution governor (2026-10-02, the frame-budget lane).
 *
 * A presented 60 Hz frame says nothing about headroom (vsync quantizes every interval to 16.7 ms), and a slow frame
 * does not say whether the GPU or the main thread is the slow lane. One EXT_disjoint_timer_query_webgl2
 * TIME_ELAPSED query around the post transaction every `every`-th frame answers both: the governor steps the render
 * scale up only when the measured GPU time predicts room at the next step, and does not trade resolution for a
 * main-thread overload. Results resolve asynchronously (a few frames later); a disjoint event drops the frames in
 * flight. Without the extension (Firefox, Safari) or after a failure, `median()` is null and the governor keeps its
 * wall-clock rules. A query is never begun while another owner's may be open: the caller pauses the timer for
 * probes that bring their own (`paused`).
 */

interface TimerGl {
  getExtension(name: string): unknown;
  createQuery(): WebGLQuery | null;
  deleteQuery(query: WebGLQuery | null): void;
  beginQuery(target: number, query: WebGLQuery): void;
  endQuery(target: number): void;
  getQueryParameter(query: WebGLQuery, name: number): unknown;
  getParameter(name: number): unknown;
  isContextLost(): boolean;
  readonly QUERY_RESULT_AVAILABLE: number;
  readonly QUERY_RESULT: number;
}

interface TimerExtension { readonly TIME_ELAPSED_EXT: number; readonly GPU_DISJOINT_EXT: number }

interface GpuFrameTimer {
  /** Before the frame's GPU work: begins a query on sampled frames. */
  beginFrame(): void;
  /** After the frame's GPU work. */
  endFrame(): void;
  /** Median GPU ms of the frames resolved since the last `takeWindow`, then a fresh window; null without samples. */
  takeWindow(): number | null;
  /** The last resolved frame's GPU ms (telemetry), null before one. */
  readonly lastMs: number | null;
  /** True when the extension is usable on this context. */
  readonly available: boolean;
  /** Probes that open their own TIME_ELAPSED queries pause the timer around them (queries cannot nest). */
  paused: boolean;
  reset(): void;
  dispose(): void;
}

const WINDOW_CAPACITY = 96;

export function createGpuFrameTimer(gl: TimerGl | null | undefined, { every = 4 }: { every?: number } = {}): GpuFrameTimer {
  let ext: TimerExtension | null = null;
  try { ext = (gl?.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null) ?? null; } catch { ext = null; }
  let failed = !gl || !ext;
  const stride = Math.max(1, Math.floor(every));
  const pending: WebGLQuery[] = [];
  const window = new Float64Array(WINDOW_CAPACITY);
  const sorted = new Float64Array(WINDOW_CAPACITY);
  let windowCount = 0;
  let open: WebGLQuery | null = null;
  let frame = 0;
  let lastMs: number | null = null;

  function drop(): void {
    for (const q of pending) { try { gl!.deleteQuery(q); } catch { /* lost context */ } }
    pending.length = 0;
  }

  function poll(): void {
    if (failed || !pending.length) return;
    try {
      if (gl!.isContextLost()) { pending.length = 0; return; }
      if (gl!.getParameter(ext!.GPU_DISJOINT_EXT)) { drop(); return; }
      while (pending.length && gl!.getQueryParameter(pending[0], gl!.QUERY_RESULT_AVAILABLE)) {
        const q = pending.shift()!;
        const ns = Number(gl!.getQueryParameter(q, gl!.QUERY_RESULT));
        gl!.deleteQuery(q);
        if (!(ns > 0) || !Number.isFinite(ns)) continue;
        lastMs = ns / 1e6;
        if (windowCount < WINDOW_CAPACITY) window[windowCount++] = lastMs;
      }
    } catch {
      failed = true;
      pending.length = 0;
    }
  }

  return {
    beginFrame() {
      poll();
      if (open) {
        // the last frame never reached its end (a pass threw): close and discard its query before anything else
        try { gl!.endQuery(ext!.TIME_ELAPSED_EXT); gl!.deleteQuery(open); } catch { failed = true; }
        open = null;
      }
      if (failed || this.paused) return;
      if ((frame++ % stride) !== 0) return;
      if (pending.length > 8) return; // results stalled (a hidden tab): do not pile up queries
      try {
        const q = gl!.createQuery();
        if (!q) return;
        gl!.beginQuery(ext!.TIME_ELAPSED_EXT, q);
        open = q;
      } catch { failed = true; }
    },
    endFrame() {
      if (!open) return;
      try { gl!.endQuery(ext!.TIME_ELAPSED_EXT); pending.push(open); } catch { failed = true; }
      open = null;
    },
    takeWindow() {
      poll();
      if (!windowCount) return null;
      sorted.set(window.subarray(0, windowCount));
      const view = sorted.subarray(0, windowCount).sort();
      const median = view[Math.floor((windowCount - 1) / 2)];
      windowCount = 0;
      return median;
    },
    get lastMs() { return lastMs; },
    get available() { return !failed; },
    paused: false,
    reset() {
      if (open) { try { gl!.endQuery(ext!.TIME_ELAPSED_EXT); gl!.deleteQuery(open); } catch { /* lost */ } open = null; }
      drop();
      windowCount = 0;
      lastMs = null;
      frame = 0;
      // a restored context must enable the extension again before its enums are valid
      try { ext = (gl?.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null) ?? null; } catch { ext = null; }
      failed = !gl || !ext;
    },
    dispose() {
      this.reset();
      failed = true;
    },
  };
}
