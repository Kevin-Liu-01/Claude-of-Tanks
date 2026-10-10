/**
 * studioFilmPlan.ts — the pure half of the Scene Studio film renderer.
 *
 * Node-runnable (no DOM, no WebGL): the scene JSON `film` block, speed ramps
 * (film output time <-> Studio timeline time), the shutter sample schedule of
 * every output frame and the sub-pixel jitter set that replaces TAA during
 * accumulation. `src/game/studioFilm.ts` owns the GPU side.
 *
 * Time model. The Studio timeline (`fxTimeMs`) is what actors, effects and
 * camera rails are authored against. A film is a sequence of output frames
 * at `fps`; output frame k sits at film time k * 1000 / fps. Speed keys are
 * authored on the TIMELINE ("slow to 0.2x around the knockout at 6200 ms"),
 * so film time is the integral of 1 / speed over timeline time; the inverse
 * maps every shutter sample back to the timeline.
 *
 * Shutter. Each output frame integrates `samples` stratified instants across
 * a shutter interval of `shutterDeg / 360` frames CENTRED on the frame's film
 * time: the motion-blur centroid lands exactly on the frame clock and one
 * sample reproduces the instantaneous frame. For any shutter <= 360 degrees
 * the last sample of a frame never passes the first sample of the next one,
 * so the timeline only ever advances (effects cannot step backward).
 */

export const FILM_FRAME_RATES = [24, 30, 60] as const;
export type FilmFps = typeof FILM_FRAME_RATES[number];
export const FILM_SPEED_EASES = ['smooth', 'linear', 'step'] as const;
export type FilmSpeedEase = typeof FILM_SPEED_EASES[number];
export const FILM_FILTERS = ['gaussian', 'box'] as const;
export type FilmFilter = typeof FILM_FILTERS[number];

export const FILM_MIN_SPEED = 0.05;
export const FILM_MAX_SPEED = 8;
export const FILM_MAX_SAMPLES = 64;
/** Ceiling for motion-adaptive sampling (fast pans, shakes, close passes). */
export const FILM_MAX_ADAPTIVE_SAMPLES = 128;
/** Adaptive sampling targets at most this much image motion between two samples. */
export const FILM_MOTION_STEP_PX = 1.5;
/** Film renders ease camera-cue impulses in over this long (studioTimeline.sampleCameraCues). */
export const FILM_CUE_ATTACK_MS = 12;
export const FILM_MAX_SPEED_KEYS = 32;
/** Standard deviation of the Gaussian reconstruction filter, in output pixels. */
export const FILM_GAUSSIAN_SIGMA_PX = 0.42;

export interface FilmSpeedKey {
  readonly tMs: number;
  readonly speed: number;
  /** Shape of the ramp INTO this key from the previous one. */
  readonly ease: FilmSpeedEase;
}

export interface FilmSettings {
  readonly fps: FilmFps;
  readonly shutterDeg: number;
  /** Samples per frame (1 = instantaneous frames, no motion blur). */
  readonly samples: number;
  /** Motion-adaptive ceiling: frames whose image moves fast take up to this many. */
  readonly maxSamples: number;
  readonly filter: FilmFilter;
  /** Scale of the storyboard's camera-shake cues while the film renders (1 = as authored). */
  readonly shake: number;
  readonly speed: readonly FilmSpeedKey[];
}

export interface FilmSettingsInput {
  readonly fps?: number;
  readonly shutterDeg?: number;
  readonly samples?: number;
  readonly maxSamples?: number;
  readonly filter?: string;
  readonly shake?: number;
  readonly speed?: ReadonlyArray<{ readonly tMs?: number; readonly speed?: number; readonly ease?: string }>;
}

export const FILM_DEFAULTS: FilmSettings = Object.freeze({
  fps: 30,
  shutterDeg: 180,
  samples: 8,
  maxSamples: 64,
  filter: 'gaussian',
  shake: 1,
  speed: Object.freeze([]) as readonly FilmSpeedKey[],
});

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Strict, JSON-safe film settings. Unknown frame rates, filters and eases are
 * errors (an export must not silently change cadence); ranges are clamped.
 */
export function normalizeFilm(input: FilmSettingsInput | null | undefined = {}): FilmSettings {
  const source = input ?? {};
  const fps = finite(source.fps, FILM_DEFAULTS.fps);
  if (!(FILM_FRAME_RATES as readonly number[]).includes(fps)) {
    throw new RangeError('Film frame rate must be 24, 30 or 60');
  }
  const filter = source.filter ?? FILM_DEFAULTS.filter;
  if (!(FILM_FILTERS as readonly string[]).includes(filter)) throw new RangeError('Unknown film filter');
  const samples = Math.round(Math.min(FILM_MAX_SAMPLES, Math.max(1, finite(source.samples, FILM_DEFAULTS.samples))));
  const maxSamples = Math.round(Math.min(FILM_MAX_ADAPTIVE_SAMPLES,
    Math.max(samples, finite(source.maxSamples, Math.max(samples, FILM_DEFAULTS.maxSamples)))));
  const shutterDeg = Math.min(360, Math.max(0, finite(source.shutterDeg, FILM_DEFAULTS.shutterDeg)));
  const shake = Math.min(2, Math.max(0, finite(source.shake, FILM_DEFAULTS.shake)));
  const rawKeys = Array.isArray(source.speed) ? source.speed : [];
  if (rawKeys.length > FILM_MAX_SPEED_KEYS) throw new RangeError(`A film supports at most ${FILM_MAX_SPEED_KEYS} speed keys`);
  const keys: FilmSpeedKey[] = [];
  for (const raw of rawKeys) {
    const ease = raw?.ease ?? 'smooth';
    if (!(FILM_SPEED_EASES as readonly string[]).includes(ease)) throw new RangeError('Unknown film speed ease');
    const tMs = Number(raw?.tMs);
    if (!Number.isFinite(tMs) || tMs < 0) throw new RangeError('Film speed keys need a timeline time');
    keys.push({
      tMs: Math.round(tMs * 1000) / 1000,
      speed: Math.min(FILM_MAX_SPEED, Math.max(FILM_MIN_SPEED, finite(raw?.speed, 1))),
      ease: ease as FilmSpeedEase,
    });
  }
  keys.sort((left, right) => left.tMs - right.tMs);
  // Same-time keys: the last authored one wins (matches storyboard upserts).
  const unique: FilmSpeedKey[] = [];
  for (const key of keys) {
    if (unique.length && Math.abs(unique[unique.length - 1].tMs - key.tMs) < 1e-6) unique[unique.length - 1] = key;
    else unique.push(key);
  }
  return { fps: fps as FilmFps, shutterDeg, samples, maxSamples, filter: filter as FilmFilter, shake, speed: unique };
}

// --- speed ramps --------------------------------------------------------------

interface SpeedSegment {
  /** Timeline bounds of this piece of the film. */
  readonly a: number;
  readonly b: number;
  /** Film time at `a`, relative to the film start. */
  readonly f0: number;
  /** Film duration of [a, b]. */
  readonly span: number;
  /** Speed model: constant, or an eased ramp from s0 at t0 to s1 at t1. */
  readonly s0: number;
  readonly s1: number;
  readonly t0: number;
  readonly t1: number;
  readonly ease: FilmSpeedEase | 'constant';
}

export interface FilmTimeMap {
  /** Timeline start/end (ms) the film covers. */
  readonly startMs: number;
  readonly endMs: number;
  /** Film (output) duration in ms. */
  readonly durationMs: number;
  /** Film ms (0 = first frame) -> timeline ms, clamped to the covered range. */
  timelineAt(filmMs: number): number;
  /** Timeline ms -> film ms. */
  filmAt(timelineMs: number): number;
  /** Playback speed (timeline ms per film ms) at a timeline time. */
  speedAt(timelineMs: number): number;
}

function easeValue(ease: FilmSpeedEase | 'constant', u: number): number {
  if (ease === 'linear') return u;
  if (ease === 'smooth') return u * u * (3 - 2 * u);
  return 0; // step and constant hold the starting speed
}

function segmentSpeed(segment: SpeedSegment, t: number): number {
  if (segment.ease === 'constant' || segment.ease === 'step') return segment.s0;
  const u = Math.min(1, Math.max(0, (t - segment.t0) / (segment.t1 - segment.t0)));
  return segment.s0 + (segment.s1 - segment.s0) * easeValue(segment.ease, u);
}

// 8-point Gauss-Legendre nodes/weights on [-1, 1].
const GL_X = [
  -0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498,
  0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363,
];
const GL_W = [
  0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620,
  0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763,
];
const GL_PANELS = 8;

/** Film duration of timeline [from, to] inside one segment: integral of 1 / speed. */
function segmentFilmSpan(segment: SpeedSegment, from: number, to: number): number {
  if (!(to > from)) return 0;
  if (segment.ease === 'constant' || segment.ease === 'step' || segment.s0 === segment.s1) {
    return (to - from) / segment.s0;
  }
  if (segment.ease === 'linear') {
    const slope = (segment.s1 - segment.s0) / (segment.t1 - segment.t0);
    return Math.log(segmentSpeed(segment, to) / segmentSpeed(segment, from)) / slope;
  }
  let sum = 0;
  const panel = (to - from) / GL_PANELS;
  for (let p = 0; p < GL_PANELS; p++) {
    const mid = from + (p + 0.5) * panel, half = panel / 2;
    for (let i = 0; i < GL_X.length; i++) sum += GL_W[i] * half / segmentSpeed(segment, mid + GL_X[i] * half);
  }
  return sum;
}

/** Timeline time inside `segment` whose film offset from `segment.a` is `filmOffset`. */
function segmentTimelineAt(segment: SpeedSegment, filmOffset: number): number {
  if (filmOffset <= 0) return segment.a;
  if (filmOffset >= segment.span) return segment.b;
  if (segment.ease === 'constant' || segment.ease === 'step' || segment.s0 === segment.s1) {
    return Math.min(segment.b, segment.a + filmOffset * segment.s0);
  }
  if (segment.ease === 'linear') {
    const slope = (segment.s1 - segment.s0) / (segment.t1 - segment.t0);
    const speed = segmentSpeed(segment, segment.a) * Math.exp(filmOffset * slope);
    return Math.min(segment.b, Math.max(segment.a, segment.t0 + (speed - segment.s0) / slope));
  }
  // Monotone: safeguarded Newton (derivative = 1 / speed) inside [a, b].
  let lo = segment.a, hi = segment.b;
  let t = segment.a + (segment.b - segment.a) * (filmOffset / segment.span);
  for (let iteration = 0; iteration < 48; iteration++) {
    const error = segmentFilmSpan(segment, segment.a, t) - filmOffset;
    if (Math.abs(error) < 1e-9) break;
    if (error > 0) hi = t; else lo = t;
    let next = t - error * segmentSpeed(segment, t);
    if (!(next > lo && next < hi)) next = (lo + hi) / 2;
    t = next;
  }
  return t;
}

/**
 * Build the film <-> timeline map for `[startMs, endMs]` of the timeline.
 * Without speed keys the film runs at 1x and the map is the identity
 * (shifted by `startMs`).
 */
export function createFilmTimeMap(
  keys: readonly FilmSpeedKey[],
  startMs: number,
  endMs: number,
): FilmTimeMap {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !(endMs > startMs) || startMs < 0) {
    throw new RangeError('A film needs a positive timeline range');
  }
  const speedModel = (t: number): Omit<SpeedSegment, 'a' | 'b' | 'f0' | 'span'> => {
    if (!keys.length) return { s0: 1, s1: 1, t0: 0, t1: 1, ease: 'constant' };
    if (t <= keys[0].tMs) return { s0: keys[0].speed, s1: keys[0].speed, t0: 0, t1: 1, ease: 'constant' };
    const last = keys[keys.length - 1];
    if (t >= last.tMs) return { s0: last.speed, s1: last.speed, t0: 0, t1: 1, ease: 'constant' };
    let index = 1;
    while (index < keys.length - 1 && keys[index].tMs <= t) index++;
    const from = keys[index - 1], to = keys[index];
    return { s0: from.speed, s1: to.speed, t0: from.tMs, t1: to.tMs, ease: to.ease };
  };
  const cuts = [startMs, endMs];
  for (const key of keys) if (key.tMs > startMs && key.tMs < endMs) cuts.push(key.tMs);
  cuts.sort((left, right) => left - right);
  const segments: SpeedSegment[] = [];
  let film = 0;
  for (let index = 0; index < cuts.length - 1; index++) {
    const a = cuts[index], b = cuts[index + 1];
    if (!(b > a)) continue;
    const model = speedModel((a + b) / 2);
    const draft: SpeedSegment = { a, b, f0: film, span: 0, ...model };
    const span = segmentFilmSpan(draft, a, b);
    segments.push({ ...draft, span });
    film += span;
  }
  const durationMs = film;
  const findByTimeline = (t: number): SpeedSegment => {
    let lo = 0, hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segments[mid].a <= t) lo = mid; else hi = mid - 1;
    }
    return segments[lo];
  };
  const findByFilm = (f: number): SpeedSegment => {
    let lo = 0, hi = segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segments[mid].f0 <= f) lo = mid; else hi = mid - 1;
    }
    return segments[lo];
  };
  return {
    startMs,
    endMs,
    durationMs,
    timelineAt(filmMs: number): number {
      if (!(filmMs > 0)) return startMs;
      if (filmMs >= durationMs) return endMs;
      const segment = findByFilm(filmMs);
      return segmentTimelineAt(segment, filmMs - segment.f0);
    },
    filmAt(timelineMs: number): number {
      if (!(timelineMs > startMs)) return 0;
      if (timelineMs >= endMs) return durationMs;
      const segment = findByTimeline(timelineMs);
      return segment.f0 + segmentFilmSpan(segment, segment.a, timelineMs);
    },
    speedAt(timelineMs: number): number {
      return segmentSpeed({ a: 0, b: 0, f0: 0, span: 0, ...speedModel(timelineMs) }, timelineMs);
    },
  };
}

// --- frames and shutter samples ---------------------------------------------------

export interface FilmPlan {
  readonly settings: FilmSettings;
  readonly map: FilmTimeMap;
  readonly frames: number;
  /** Film ms between output frames. */
  readonly frameMs: number;
  /** Film ms the shutter stays open per frame. */
  readonly shutterMs: number;
  /** Output frame k sits at film time k * frameMs. */
  frameFilmMs(frame: number): number;
  /** Timeline ms of frame k's centre (what an instantaneous render would show). */
  frameTimelineMs(frame: number): number;
  /**
   * Timeline ms of each of `count` (default: settings.samples) shutter
   * samples of frame k, non-decreasing, written into `out`. Monotone across
   * consecutive frames for any per-frame count.
   */
  sampleTimes(frame: number, out: Float64Array, count?: number): Float64Array;
}

/**
 * Samples for a frame whose fastest image point travels `pathPx` pixels
 * while the shutter is open: enough that consecutive samples land at most
 * FILM_MOTION_STEP_PX apart (no stepped copies), within [samples, maxSamples].
 * One sample stays one sample: blur off means instantaneous frames.
 */
export function adaptiveSampleCount(pathPx: number, settings: Pick<FilmSettings, 'samples' | 'maxSamples'>): number {
  if (settings.samples <= 1 || settings.maxSamples <= settings.samples || !(pathPx > 0)) return settings.samples;
  const needed = Math.ceil(pathPx / FILM_MOTION_STEP_PX) + 1;
  return Math.min(settings.maxSamples, Math.max(settings.samples, needed));
}

/** How far before a camera cut a clamped sample lands (timeline ms). */
export const FILM_CUT_EPSILON_MS = 1e-3;

/** Longest exposure a motion-blur still integrates (timeline ms). */
export const FILM_MAX_EXPOSURE_MS = 1000;

/**
 * Shutter instants of a motion-blur still centred on timeline `centerMs`:
 * `count` stratified samples across `exposureMs` (≤ FILM_MAX_EXPOSURE_MS),
 * inside [0, durationMs] and, like a film frame, on the centre's side of every
 * storyboard cut (a still never exposes two shots). Monotone; returns `out`.
 */
export function exposureSampleTimes(
  centerMs: number,
  exposureMs: number,
  count: number,
  cutsMs: readonly number[],
  durationMs: number,
  out: Float64Array,
): Float64Array {
  if (!(Number.isInteger(count) && count >= 1)) throw new RangeError('Sample count must be a positive integer');
  if (out.length < count) throw new RangeError('Sample buffer is too small');
  const exposure = Math.min(FILM_MAX_EXPOSURE_MS, Math.max(0, finite(exposureMs, 0)));
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : ((i + 0.5) / count - 0.5) * exposure;
    out[i] = Math.min(durationMs, Math.max(0, centerMs + offset));
  }
  if (count > 1) {
    for (const cut of cutsMs) {
      if (!Number.isFinite(cut) || !(out[0] < cut && out[count - 1] >= cut)) continue;
      for (let i = 0; i < count; i++) {
        if (centerMs < cut) out[i] = Math.min(out[i], cut - FILM_CUT_EPSILON_MS);
        else out[i] = Math.max(out[i], cut);
      }
    }
  }
  return out;
}

/**
 * Plan the frames of a film over timeline `[startMs, endMs]`. `cutsMs` are
 * the storyboard's hard camera cuts: a shutter never straddles one (that
 * would double-expose two shots), so a frame whose centre precedes the cut
 * closes just before it and the frame on the cut opens at it.
 */
export function createFilmPlan(
  settings: FilmSettings,
  startMs: number,
  endMs: number,
  cutsMs: readonly number[] = [],
): FilmPlan {
  const map = createFilmTimeMap(settings.speed, startMs, endMs);
  const frameMs = 1000 / settings.fps;
  const shutterMs = frameMs * settings.shutterDeg / 360;
  // The covered range is half-open: the final instant belongs to the next shot.
  const frames = Math.max(1, Math.floor(map.durationMs / frameMs + 1e-6));
  const samples = settings.samples;
  const cuts = [...cutsMs].filter(Number.isFinite).sort((left, right) => left - right);
  return {
    settings,
    map,
    frames,
    frameMs,
    shutterMs,
    frameFilmMs: (frame: number) => frame * frameMs,
    frameTimelineMs: (frame: number) => map.timelineAt(frame * frameMs),
    sampleTimes(frame: number, out: Float64Array, count = samples): Float64Array {
      if (!(Number.isInteger(count) && count >= 1)) throw new RangeError('Sample count must be a positive integer');
      if (out.length < count) throw new RangeError('Sample buffer is too small');
      const centre = frame * frameMs;
      for (let i = 0; i < count; i++) {
        const offset = count === 1 ? 0 : ((i + 0.5) / count - 0.5) * shutterMs;
        out[i] = map.timelineAt(centre + offset);
      }
      if (count > 1 && cuts.length) {
        const centreMs = map.timelineAt(centre);
        for (const cut of cuts) {
          if (!(out[0] < cut && out[count - 1] >= cut)) continue;
          for (let i = 0; i < count; i++) {
            if (centreMs < cut) out[i] = Math.min(out[i], cut - FILM_CUT_EPSILON_MS);
            else out[i] = Math.max(out[i], cut);
          }
        }
      }
      return out;
    },
  };
}

// --- sub-pixel jitter -------------------------------------------------------------

export function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  let i = Math.max(0, Math.floor(index));
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

/** Inverse standard normal CDF (Acklam), |relative error| < 1.2e-9. */
function probit(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Equal-weight sub-pixel offsets (pixels) for `samples` accumulation samples:
 * a Halton (2, 3) set, re-centred so the reconstruction filter has its
 * centroid exactly on the pixel. `box` spreads samples uniformly over the
 * pixel; `gaussian` places them through the inverse normal CDF (sigma
 * FILM_GAUSSIAN_SIGMA_PX), the smoother film reconstruction. One sample is
 * the unjittered instantaneous render.
 */
export function filmJitter(samples: number, filter: FilmFilter, out: Float64Array): Float64Array {
  if (out.length < samples * 2) throw new RangeError('Jitter buffer is too small');
  if (samples <= 1) {
    out[0] = 0; out[1] = 0;
    return out;
  }
  let mx = 0, my = 0;
  for (let i = 0; i < samples; i++) {
    const u = halton(i + 1, 2), v = halton(i + 1, 3);
    const x = filter === 'box' ? u - 0.5 : probit(u) * FILM_GAUSSIAN_SIGMA_PX;
    const y = filter === 'box' ? v - 0.5 : probit(v) * FILM_GAUSSIAN_SIGMA_PX;
    out[i * 2] = x; out[i * 2 + 1] = y;
    mx += x; my += y;
  }
  mx /= samples; my /= samples;
  for (let i = 0; i < samples; i++) { out[i * 2] -= mx; out[i * 2 + 1] -= my; }
  return out;
}

// --- output sizes -----------------------------------------------------------------

export const FILM_RESOLUTIONS = [1080, 1440, 2160] as const;
export type FilmResolution = typeof FILM_RESOLUTIONS[number];

/** Native export size for a production format at a short-side resolution. */
export function filmOutputSize(
  format: 'landscape' | 'portrait' | 'square',
  resolution: number,
): { width: number; height: number } {
  if (!(FILM_RESOLUTIONS as readonly number[]).includes(resolution)) throw new RangeError('Film resolution must be 1080, 1440 or 2160');
  const long = Math.round(resolution * 16 / 9);
  if (format === 'portrait') return { width: resolution, height: long };
  if (format === 'square') return { width: resolution, height: resolution };
  if (format !== 'landscape') throw new RangeError('Unknown production format');
  return { width: long, height: resolution };
}
