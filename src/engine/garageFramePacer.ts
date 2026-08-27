export interface GarageFrameRequest {
  /** A visible camera or scene animation is still moving. */
  animate?: boolean;
  /** The scene changed once and needs an immediate paint. */
  dirty?: boolean;
}

export interface GarageFramePacer {
  noteActivity(timestampMs: number): void;
  reset(timestampMs: number): void;
  shouldRender(timestampMs: number, request?: GarageFrameRequest): boolean;
  readonly stats: {
    rendered: number;
    skipped: number;
    idleFramesPerSecond: number;
  };
}

export interface GarageFramePacerOptions {
  idleFramesPerSecond?: number;
  activeTailMs?: number;
}

/**
 * Keep interactive Garage motion at display cadence while eliminating the
 * permanent 60 Hz render/simulation pipeline after the scene has settled.
 *
 * The browser continues to composite DOM/CSS transitions independently. A
 * low idle cadence remains as a fail-safe for async texture/model completion,
 * so work that does not emit a dirty signal still becomes visible within one
 * second without keeping the complete GPU pipeline hot.
 */
export function createGarageFramePacer({
  idleFramesPerSecond = 1,
  activeTailMs = 240,
}: GarageFramePacerOptions = {}): GarageFramePacer {
  const idleFps = Math.max(1, Math.min(30, idleFramesPerSecond));
  const idleIntervalMs = 1000 / idleFps;
  const tailMs = Math.max(0, activeTailMs);
  let lastRenderAt = -Infinity;
  let activeUntil = -Infinity;
  const stats = {
    rendered: 0,
    skipped: 0,
    idleFramesPerSecond: idleFps,
  };

  const noteActivity = (timestampMs: number): void => {
    if (!Number.isFinite(timestampMs)) return;
    activeUntil = Math.max(activeUntil, timestampMs + tailMs);
  };

  return {
    noteActivity,
    reset(timestampMs: number) {
      lastRenderAt = -Infinity;
      activeUntil = Number.isFinite(timestampMs) ? timestampMs + tailMs : -Infinity;
    },
    shouldRender(timestampMs: number, request: GarageFrameRequest = {}) {
      if (!Number.isFinite(timestampMs)) return true;
      if (request.animate) noteActivity(timestampMs);
      const active = timestampMs <= activeUntil;
      const idleDue = timestampMs - lastRenderAt >= idleIntervalMs;
      if (request.dirty || active || idleDue) {
        lastRenderAt = timestampMs;
        stats.rendered += 1;
        return true;
      }
      stats.skipped += 1;
      return false;
    },
    stats,
  };
}
