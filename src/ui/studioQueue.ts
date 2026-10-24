/**
 * studioQueue.ts — the Studio's render queue (brand-ui SPEC 12.6 "Render queue"): its delivery presets, what each will
 * cost before it starts, and the names its files take. Copyright © 2026 Kevin B. Liu.
 *
 * studioPanel.ts runs the queue one job after another through the Studio's own film export and still capture, in the
 * scene's frame (a different frame reframes the shots, which is an edit, not a delivery). Size estimates use the
 * encoder's bitrate rule; time estimates use this browser's last measured render rate.
 */
import { filmOutputSize } from '../game/studioFilmPlan.ts';
import type { ProductionFormat } from '../game/studioProduction.ts';

export type QueuePresetId = 'film-1080' | 'film-1440-60' | 'film-2160' | 'stills-shots' | 'still-now';

export interface QueuePreset {
  readonly id: QueuePresetId;
  readonly kind: 'film' | 'stills';
  /** Film: short-side resolution and frame rate. */
  readonly resolution: number;
  readonly fps: number;
}

export const QUEUE_PRESETS: readonly QueuePreset[] = Object.freeze([
  { id: 'film-1080', kind: 'film', resolution: 1080, fps: 30 },
  { id: 'film-1440-60', kind: 'film', resolution: 1440, fps: 60 },
  { id: 'film-2160', kind: 'film', resolution: 2160, fps: 30 },
  { id: 'stills-shots', kind: 'stills', resolution: 2160, fps: 0 },
  { id: 'still-now', kind: 'stills', resolution: 2160, fps: 0 },
]);

/** A still's long side, and how many bytes a lossless frame of the battlefield takes per pixel (measured stills). */
const STILL_LONG_SIDE = 3840;
const STILL_BYTES_PER_PIXEL = 1.4;
const STILL_SECONDS = 2;
/** The mixed soundtrack's bitrate, and the render rate guessed until this browser has measured one. */
const AUDIO_BITRATE = 128_000;
const DEFAULT_MS_PER_MEGAPIXEL_SAMPLE = 60;
const RATE_KEY = 'cot.studio.renderRate';

/**
 * The encoder's bitrate when none is asked for (studioFilmExport.ts defaultFilmBitrate, which stays in its lazy chunk):
 * pixels x frame rate within 8 to 100 Mb/s. studioQueue.selftest.mjs holds the two equal.
 */
function filmBitrate(width: number, height: number, fps: number): number {
  return Math.round(Math.min(100_000_000, Math.max(8_000_000, width * height * fps * 0.2)));
}

/** A still's size in the scene's frame (its long side 3840 px, both sides even). */
export function stillSize(format: ProductionFormat): { width: number; height: number } {
  const film = filmOutputSize(format, 1080);
  const scale = STILL_LONG_SIDE / Math.max(film.width, film.height);
  return { width: Math.round((film.width * scale) / 2) * 2, height: Math.round((film.height * scale) / 2) * 2 };
}

/** This browser's measured render cost (ms per megapixel per motion-blur sample), or the default guess. */
function renderRate(): number {
  try {
    const value = Number(localStorage.getItem(RATE_KEY));
    return value > 0 && value < 10_000 ? value : DEFAULT_MS_PER_MEGAPIXEL_SAMPLE;
  } catch (_) { return DEFAULT_MS_PER_MEGAPIXEL_SAMPLE; }
}

/** Remember how fast a finished film rendered, so the next estimate is this machine's. */
export function recordRenderRate(elapsedMs: number, frames: number, samples: number, width: number, height: number): void {
  const work = frames * Math.max(1, samples) * ((width * height) / 1e6);
  if (!(work > 0 && elapsedMs > 0)) return;
  try { localStorage.setItem(RATE_KEY, String(Math.round((elapsedMs / work) * 10) / 10)); } catch (_) { /* private windows */ }
}

/** What a job will cost before it starts: seconds to render and bytes on disk. */
export function queueEstimate(preset: QueuePreset, format: ProductionFormat, durationMs: number, samples: number, shots: number):
{ seconds: number; bytes: number; files: number } {
  if (preset.kind === 'stills') {
    const files = preset.id === 'stills-shots' ? Math.max(1, shots) : 1;
    const { width, height } = stillSize(format);
    return { seconds: files * STILL_SECONDS, bytes: files * width * height * STILL_BYTES_PER_PIXEL, files };
  }
  const { width, height } = filmOutputSize(format, preset.resolution);
  const frames = Math.max(1, Math.floor((durationMs / 1000) * preset.fps));
  const seconds = 2 + (frames * Math.max(1, samples) * ((width * height) / 1e6) * renderRate()) / 1000;
  const bytes = ((filmBitrate(width, height, preset.fps) + AUDIO_BITRATE) * (durationMs / 1000)) / 8;
  return { seconds, bytes, files: 1 };
}

const slug = (text: string): string => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'scene';

/** A job's file name: the battlefield, what it is, and the frame (`verdant_1080p30_16x9.mp4`, `verdant_shot-02_16x9.png`). */
export function queueFileName(map: string, what: string, ratio: string, extension: string): string {
  return `${slug(map)}_${slug(what)}_${ratio.replace(':', 'x').replace('.', '')}.${extension}`;
}
