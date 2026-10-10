/**
 * studioFilmExport.ts — the in-browser "Export film" encoder (lazy chunk).
 *
 * Renders every frame of a Studio film through the deterministic
 * accumulation renderer (studioFilm.ts) and encodes it offline with
 * WebCodecs: H.264 in MP4 when the browser can encode it, VP9 in WebM
 * otherwise. Frames are submitted in order with explicit timestamps and the
 * encoder is drained with back-pressure, so nothing can drop and the file has
 * exactly the planned frame count at a constant rate, whatever the render
 * speed. No third-party code: the containers are studioFilmMux.ts.
 */
import { muxMp4, muxWebm, type MuxAudioTrack, type MuxColor, type MuxSample } from './studioFilmMux.ts';
import type { FilmFrameInfo, FilmSessionInfo } from './studioFilm.ts';

export interface FilmExportPorts {
  /** Open the film session at the export size (studio.beginFilm). */
  begin(): FilmSessionInfo;
  /** Render the next frame into `canvas` (studio.renderFilmFrame). */
  renderNext(): FilmFrameInfo;
  /** Close the session and restore the live Studio. */
  end(): void;
  readonly canvas: HTMLCanvasElement;
  /** Optional soundtrack of the rendered film (null: silent). Called after the last frame. */
  soundtrack?(session: FilmSessionInfo): Promise<AudioBuffer | null>;
}

export interface FilmExportProgress {
  readonly stage: 'preparing' | 'rendering' | 'finishing';
  readonly frame: number;
  readonly frames: number;
  readonly elapsedMs: number;
  /** Estimated time left, from the measured render rate (null until measured). */
  readonly remainingMs: number | null;
}

export interface FilmExportOptions {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  /** Target video bitrate (bits/s); default scales with pixels x frame rate. */
  readonly bitrate?: number;
  readonly container?: 'auto' | 'mp4' | 'webm';
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: FilmExportProgress) => void;
  /** Draw a preview of each finished frame (optional UI hook). */
  readonly onFrame?: (canvas: HTMLCanvasElement, frame: FilmFrameInfo) => void;
}

export interface FilmExportResult {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly codec: string;
  readonly container: 'mp4' | 'webm';
  readonly frames: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly bytes: number;
  readonly elapsedMs: number;
  /** The file carries the mixed game sound. */
  readonly audio: boolean;
}

interface EncoderChoice {
  readonly container: 'mp4' | 'webm';
  readonly config: VideoEncoderConfig;
}

// H.264 levels: [level_idc, MaxFS (macroblocks), MaxMBPS, MaxBR (High profile, bits/s)].
const AVC_LEVELS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0x28, 8192, 245760, 25_000_000],
  [0x2a, 8704, 522240, 62_500_000],
  [0x32, 22080, 589824, 168_750_000],
  [0x33, 36864, 983040, 300_000_000],
  [0x34, 36864, 2073600, 300_000_000],
];

/** Smallest High-profile level that fits the frame size, rate and bitrate. */
export function avcCodecString(width: number, height: number, fps: number, bitrate: number): string | null {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const longSide = Math.max(Math.ceil(width / 16), Math.ceil(height / 16));
  for (const [level, maxFs, maxMbps, maxBr] of AVC_LEVELS) {
    if (mbs <= maxFs && mbs * fps <= maxMbps && bitrate <= maxBr && longSide <= Math.sqrt(maxFs * 8)) {
      return `avc1.6400${level.toString(16).padStart(2, '0')}`;
    }
  }
  return null;
}

/** Default quality: ~0.2 bits per pixel per frame, 8–100 Mbit/s. */
export function defaultFilmBitrate(width: number, height: number, fps: number): number {
  return Math.round(Math.min(100_000_000, Math.max(8_000_000, width * height * fps * 0.2)));
}

async function chooseEncoder(options: FilmExportOptions, bitrate: number): Promise<EncoderChoice> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('This browser cannot encode video offline (WebCodecs is unavailable)');
  }
  const { width, height, fps } = options;
  const base = { width, height, framerate: fps, bitrate, bitrateMode: 'variable' as const, latencyMode: 'quality' as const };
  const candidates: EncoderChoice[] = [];
  const avc = avcCodecString(width, height, fps, bitrate);
  if (options.container !== 'webm' && avc) {
    candidates.push({ container: 'mp4', config: { ...base, codec: avc, avc: { format: 'avc' } } });
    // Some encoders accept only Main profile at 4K; same level, Main constraint.
    candidates.push({ container: 'mp4', config: { ...base, codec: avc.replace('avc1.6400', 'avc1.4d00'), avc: { format: 'avc' } } });
  }
  if (options.container !== 'mp4') {
    candidates.push({ container: 'webm', config: { ...base, codec: 'vp09.00.51.08' } });
    candidates.push({ container: 'webm', config: { ...base, codec: 'vp09.00.41.08' } });
  }
  for (const candidate of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported(candidate.config);
      if (support.supported) return candidate;
    } catch { /* an unknown codec string is simply unsupported */ }
  }
  throw new Error(`This browser cannot encode ${width}×${height} at ${fps} fps`);
}

function abortError(): Error {
  const error = new Error('Film export cancelled');
  error.name = 'AbortError';
  return error;
}

/**
 * Yield to the event loop (input, progress paint, encoder callbacks). A
 * message-channel task, not a timer: a backgrounded tab clamps timers to one
 * per second, which would stretch a long export into hours.
 */
function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
    channel.port2.postMessage(0);
  });
}

const COLOR_PRIMARIES: Record<string, number> = { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 };
const COLOR_TRANSFER: Record<string, number> = { bt709: 1, smpte170m: 6, linear: 8, 'iec61966-2-1': 13, pq: 16, hlg: 18 };
const COLOR_MATRIX: Record<string, number> = { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, 'bt2020-ncl': 9 };

function muxColor(space: VideoColorSpaceInit | undefined): MuxColor | null {
  if (!space) return null;
  const primaries = COLOR_PRIMARIES[space.primaries ?? ''];
  const transfer = COLOR_TRANSFER[space.transfer ?? ''];
  const matrix = COLOR_MATRIX[space.matrix ?? ''];
  if (primaries === undefined || transfer === undefined || matrix === undefined) return null;
  return { primaries, transfer, matrix, fullRange: !!space.fullRange };
}

/** Render and encode the whole film. Always closes the session, also on cancel or failure. */
export async function exportFilm(ports: FilmExportPorts, options: FilmExportOptions): Promise<FilmExportResult> {
  const started = performance.now();
  const report = (stage: FilmExportProgress['stage'], frame: number, frames: number, remainingMs: number | null) => {
    options.onProgress?.({ stage, frame, frames, elapsedMs: performance.now() - started, remainingMs });
  };
  report('preparing', 0, 0, null);
  const bitrate = Math.round(options.bitrate ?? defaultFilmBitrate(options.width, options.height, options.fps));
  const choice = await chooseEncoder(options, bitrate);
  if (options.signal?.aborted) throw abortError();
  const samples: MuxSample[] = [];
  let description: Uint8Array | null = null;
  let color: MuxColor | null = null;
  let failure: Error | null = null;
  let lastTimestamp = -Infinity;
  const encoder = new VideoEncoder({
    output(chunk, metadata) {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      if (chunk.timestamp < lastTimestamp) failure ??= new Error('The encoder reordered frames; this export path needs in-order output');
      lastTimestamp = chunk.timestamp;
      samples.push({ data, key: chunk.type === 'key' });
      const config = metadata?.decoderConfig;
      if (config?.description && !description) {
        const source = config.description;
        description = ArrayBuffer.isView(source)
          ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice()
          : new Uint8Array(source).slice();
      }
      if (config?.colorSpace && !color) color = muxColor(config.colorSpace);
    },
    error(error) { failure ??= error instanceof Error ? error : new Error(String(error)); },
  });
  let session: FilmSessionInfo | null = null;
  try {
    encoder.configure(choice.config);
    session = ports.begin();
    if (session.width !== options.width || session.height !== options.height || session.fps !== options.fps) {
      throw new Error('The film session does not match the encoder configuration');
    }
    const frames = session.frames, frameUs = 1e6 / session.fps, gop = session.fps * 2;
    let renderStart = performance.now();
    for (let index = 0; index < frames; index++) {
      if (options.signal?.aborted) throw abortError();
      if (failure) throw failure;
      const info = ports.renderNext();
      // Same task as the render: the drawing buffer is still the finished frame.
      const frame = new VideoFrame(ports.canvas, {
        timestamp: Math.round(index * frameUs),
        duration: Math.round(frameUs),
        alpha: 'discard',
      });
      try {
        encoder.encode(frame, { keyFrame: index % gop === 0 });
      } finally {
        frame.close();
      }
      options.onFrame?.(ports.canvas, info);
      if (index === 0) renderStart = performance.now();
      const perFrame = index > 0 ? (performance.now() - renderStart) / index : null;
      report('rendering', index + 1, frames, perFrame === null ? null : perFrame * (frames - index - 1));
      // Back-pressure keeps memory bounded on slow encoders; every frame yields once.
      while (encoder.encodeQueueSize > 3 && !failure) await nextTask();
      await nextTask();
    }
    report('finishing', frames, frames, 0);
    await encoder.flush();
    if (failure) throw failure;
    if (samples.length !== frames) throw new Error(`The encoder returned ${samples.length} of ${frames} frames`);
    let audio: MuxAudioTrack | null = null;
    if (ports.soundtrack) {
      const mix = await ports.soundtrack(session);
      if (options.signal?.aborted) throw abortError();
      if (mix) {
        const { encodeFilmSoundtrack } = await import('./studioFilmAudio.ts');
        audio = await encodeFilmSoundtrack(mix, choice.container);
      }
    }
    let parts: Uint8Array[];
    let mimeType: string;
    if (choice.container === 'mp4') {
      if (!description) throw new Error('The H.264 encoder did not provide its decoder configuration');
      parts = muxMp4({ width: session.width, height: session.height, fps: session.fps, description, samples, color }, audio);
      mimeType = 'video/mp4';
    } else {
      parts = muxWebm({ width: session.width, height: session.height, fps: session.fps, codec: 'V_VP9', samples }, audio);
      mimeType = 'video/webm';
    }
    const blob = new Blob(parts as BlobPart[], { type: mimeType });
    return {
      blob,
      mimeType,
      codec: choice.config.codec,
      container: choice.container,
      frames,
      width: session.width,
      height: session.height,
      fps: session.fps,
      bytes: blob.size,
      elapsedMs: performance.now() - started,
      audio: !!audio,
    };
  } finally {
    try { if (encoder.state !== 'closed') encoder.close(); } catch { /* already closed by an error */ }
    ports.end();
  }
}
