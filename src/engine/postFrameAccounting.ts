/** Submitted scene, shadow and post work inside one completed post.render call.
 * This is not a GPU-completion or display-presentation acknowledgement.
 */
export interface CompletedPostFrame {
  readonly scope: 'last-completed-post-frame';
  readonly serial: number;
  readonly calls: number;
  readonly triangles: number;
  readonly lines: number;
  readonly points: number;
}

interface FrameInfo {
  autoReset: boolean;
  reset(): void;
  render: { calls: number; triangles: number; lines: number; points: number };
}

/** One retained receipt; no per-frame arrays, callbacks or objects. */
export function createPostFrameAccounting(
  renderer: { readonly info: FrameInfo },
  renderFrame: (dt: number, frameWallDtSeconds: number) => void,
) {
  const completed = {
    scope: 'last-completed-post-frame' as const,
    serial: 0, calls: 0, triangles: 0, lines: 0, points: 0,
  };
  return {
    /** Null before the first success; skipped/failed frames retain the last success.
     * Borrowed readonly view, updated in place only when a later frame completes.
     */
    get lastCompletedFrame(): CompletedPostFrame | null {
      return completed.serial === 0 ? null : completed;
    },
    render(dt: number, frameWallDtSeconds = dt): void {
      // Read info at entry: context restoration may replace Three's info owner.
      const info = renderer.info;
      const autoReset = info.autoReset;
      info.autoReset = false;
      try {
        // An outer probe may already own cumulative accounting. Never erase
        // its preceding work; use deltas and leave its complete totals intact.
        if (autoReset) info.reset();
        const calls = info.render.calls, triangles = info.render.triangles;
        const lines = info.render.lines, points = info.render.points;
        renderFrame(dt, frameWallDtSeconds);
        completed.calls = info.render.calls - calls;
        completed.triangles = info.render.triangles - triangles;
        completed.lines = info.render.lines - lines;
        completed.points = info.render.points - points;
        completed.serial++;
      } finally {
        info.autoReset = autoReset;
      }
    },
  };
}
