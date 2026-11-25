/**
 * A replay filmed to a video file (replay-fixes-277, Kevin 11-24: "be able to export it as a mp4"): the film session the
 * Studio's offline encoder drives (game/studioFilmExport.ts exportFilm: WebCodecs H.264 into the first-party MP4 muxer).
 * Offline and fixed-step: the live frame loop is held, and every film frame is one main frame ticked by exactly 1/fps of
 * battle time at 1x, through the viewer's own camera and the full post chain, at the film's own size. So the file's
 * time is battle time, whatever the device's speed; nothing is a screen recording. The film is the 3D view (a clean
 * film); with `overlay` each frame is composited with the HUD drawn on a 2D canvas (replayFilmHud.ts).
 *
 * Node-runnable: the page is reached only through the ports (app/replayViewerRuntime.ts gives them).
 */

/** The page's side of a film: the renderer, its post chain and camera, the frame tick and the viewer's clock. */
export interface ReplayFilmPorts {
  readonly canvas: HTMLCanvasElement;
  /** The renderer's drawing size (CSS px) and pixel ratio, read before the film and restored after it. */
  readSize(): { width: number; height: number; pixelRatio: number };
  /** Size the renderer, its post chain, the camera's aspect and the shadow frustums to width x height at `pixelRatio`. */
  applySize(width: number, height: number, pixelRatio: number): void;
  /** Hold (true) or release the live frame loop and the viewport's own resize, so only the film ticks the page. */
  hold(on: boolean): void;
  /** One main frame at `nowMs` (app/mainFrameRuntime.ts tick): the replay advances by the gap since the last one. */
  tick(nowMs: number): void;
  /** The viewer's clock: seek, play at 1x, and where it stands. */
  readonly clock: { seek(timeS: number): void; play(): void; pause(): void; setSpeed(speed: number): void; readonly timeS: number; readonly durationS: number };
  /** A wall clock for the first synthetic tick's base (performance.now on the page). */
  now(): number;
  /** Composite the frame: the 3D canvas and the HUD drawn over it, into `target` (null: a clean film). */
  readonly overlay?: ((target: CanvasRenderingContext2D, source: HTMLCanvasElement, width: number, height: number, timeS: number) => void) | null;
  /** A 2D canvas of the film's size for the overlay (the page makes it; uiCanvas.ts owns offscreen canvases). */
  makeCanvas?(width: number, height: number): HTMLCanvasElement;
}

export interface ReplayFilmOptions {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  /** The range, in battle seconds (clamped to the replay). */
  readonly fromS: number;
  readonly toS: number;
}

/** The film's frames: the range at `fps`, at least one. */
export function replayFilmFrames(fromS: number, toS: number, fps: number): number {
  return Math.max(1, Math.round((Math.max(fromS, toS) - Math.min(fromS, toS)) * fps));
}

/** The resolutions and rates the export offers (Kevin 11-24: 720/1080, 30/60). */
export const REPLAY_FILM_SIZES = Object.freeze([
  Object.freeze({ id: '720p', width: 1280, height: 720 }),
  Object.freeze({ id: '1080p', width: 1920, height: 1080 }),
]);
export const REPLAY_FILM_RATES = Object.freeze([30, 60]);
/**
 * A replay film's video bitrate (bits/s): the common upload rates for game footage (720p30 5, 720p60 7.5, 1080p30 8,
 * 1080p60 12 Mbit/s), scaled by pixels for any other size. The Studio's 8 Mbit/s floor (studioFilmExport.ts
 * defaultFilmBitrate) is for its stills-grade films; at it a 30 s 720p30 replay was 30 MB, at this ~19 MB.
 */
export function replayFilmBitrate(width: number, height: number, fps: number): number {
  const pixels = width * height;
  const base = fps > 30 ? 12_000_000 : 8_000_000; // 1080p
  const scaled = base * (pixels / (1920 * 1080));
  return Math.round(Math.max(2_500_000, Math.min(20_000_000, pixels <= 1280 * 720 ? (fps > 30 ? 7_500_000 : 5_000_000) * (pixels / (1280 * 720)) : scaled)));
}

/** Above this length at 1080p60 the dialog suggests 720p (the render runs at about 1.5-3x real time). */
export const REPLAY_FILM_LONG_S = 5 * 60;

/**
 * The film session exportFilm drives: begin (hold the page, size it, seek), renderNext (one fixed step, one frame),
 * end (always: release, restore the size, pause). `canvas` is what the encoder reads: the renderer's, or the overlay's.
 */
export function createReplayFilmSession(ports: ReplayFilmPorts, options: ReplayFilmOptions) {
  const { width, height, fps } = options;
  const fromS = Math.max(0, Math.min(options.fromS, options.toS));
  const toS = Math.min(ports.clock.durationS, Math.max(options.fromS, options.toS));
  const frames = replayFilmFrames(fromS, toS, fps);
  const frameMs = 1000 / fps;
  const composite = ports.overlay && ports.makeCanvas ? ports.makeCanvas(width, height) : null;
  const context = composite?.getContext('2d') ?? null;
  let saved: { width: number; height: number; pixelRatio: number } | null = null;
  let nowMs = 0;
  let frame = 0;
  let open = false;

  return {
    canvas: composite ?? ports.canvas,
    frames,
    begin() {
      saved = ports.readSize();
      ports.hold(true);
      open = true;
      ports.applySize(width, height, 1);
      ports.clock.pause();
      ports.clock.setSpeed(1);
      ports.clock.seek(fromS);
      // one settle frame at the range's start (its draw is not filmed): the camera and the post chain meet the new size
      nowMs = ports.now();
      ports.tick(nowMs);
      ports.clock.seek(fromS);
      ports.clock.play();
      frame = 0;
      const filmDurationMs = frames * frameMs;
      return { width, height, fps, frames, samples: 1, maxSamples: 1, shutterDeg: 0, filter: 'none', filmDurationMs,
        startMs: fromS * 1000, endMs: fromS * 1000 + filmDurationMs, speed: [] };
    },
    /** One film frame: the page ticked by exactly 1/fps, then (with the HUD) composited. */
    renderNext() {
      nowMs += frameMs;
      ports.tick(nowMs);
      if (context && ports.overlay) ports.overlay(context, ports.canvas, width, height, ports.clock.timeS);
      frame++;
      const timelineMs = fromS * 1000 + frame * frameMs;
      return { frame, frames, motionPx: 0, filmTimeMs: frame * frameMs, timelineMs, openMs: timelineMs, closeMs: timelineMs, samples: 1 };
    },
    end() {
      if (!open) return;
      open = false;
      ports.clock.pause();
      if (saved) ports.applySize(saved.width, saved.height, saved.pixelRatio);
      ports.hold(false);
    },
  };
}
