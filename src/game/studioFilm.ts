/**
 * studioFilm.ts — Scene Studio's deterministic accumulation film renderer.
 *
 * One output frame = `samples` complete scene renders across the shutter
 * (studioFilmPlan.ts schedules the timeline instants), each with a sub-pixel
 * projection jitter, summed in linear HDR by FilmAccumulatePass. The post
 * chain after the accumulation point (bloom, light FX, display grade, the
 * picture finish, SMAA, reconstruction) runs once per output frame on the
 * average. TAA is bypassed (the jitter replaces it), every shadow cascade
 * re-renders per sample, temporal clouds settle at every frame (so cuts start
 * converged), and the lens-flare easing follows the film clock. Nothing here
 * runs outside a film session: the pass is inserted at begin() and removed at
 * end(), and this module ships only in the lazily loaded Studio chunk.
 */
import * as THREE from 'three';
import { FilmAccumulatePass } from '../engine/filmAccumulation.ts';
import { FilmDepthProbe } from '../engine/filmDepthProbe.ts';
import type { PostRuntime } from '../engine/post.ts';
import {
  adaptiveSampleCount,
  createFilmPlan,
  exposureSampleTimes,
  filmJitter,
  FILM_MAX_ADAPTIVE_SAMPLES,
  FILM_MAX_EXPOSURE_MS,
  normalizeFilm,
  type FilmPlan,
  type FilmSettings,
  type FilmSettingsInput,
} from './studioFilmPlan.ts';

interface FilmLighting {
  update(force?: boolean): void;
  updateFrustums(): void;
}

interface FilmClouds {
  beforeSceneRender(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, dt: number, width: number, height: number): void;
  settleForCapture(camera: THREE.PerspectiveCamera): boolean;
  /** Wind drift at scene time (s); `restart` begins a fresh trace sequence and history. */
  setCaptureTime?(timeS: number, restart?: boolean): void;
}

/** World points (x, y, z) of the surfaces nearest the lens in the last rendered frame. */
export interface FilmNearSurfaces {
  readonly points: Float32Array;
  readonly count: number;
}

/** Studio internals the film renderer drives (src/game/studio.ts wires them). */
export interface StudioFilmPorts {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly post: PostRuntime;
  readonly lighting: FilmLighting;
  /** Studio timeline clock (ms, unrounded). */
  clockMs(): number;
  /** Deterministic rebuild of the authored stack at `ms` (a seek). */
  seek(ms: number): void;
  /** Monotone, unrounded timeline advance to `ms`. */
  advanceTo(ms: number): void;
  /** Camera-facing FX (tracer ribbons, light cards) for the current camera; no time passes. */
  refreshFxForCamera(): void;
  /** World LOD/streaming for the current camera, completing pending terrain lookahead. */
  prepareWorld(complete: boolean): void;
  /** Hard camera cut times of the storyboard (timeline ms). */
  cutTimes(): number[];
  /**
   * Longest screen-space path (output pixels) any probe point (world depths
   * across the view, every actor, and `near`: the nearest rendered surfaces
   * of the last frame, filmDepthProbe.ts) travels between the first and last
   * of `count` sample instants: drives motion-adaptive sample counts.
   */
  motionPathPx(times: Float64Array, count: number, width: number, height: number, near?: FilmNearSurfaces | null): number;
  /** Studio-side film state: guides hidden, live tick suspended, exact sampling. */
  setFilmMode(active: boolean): void;
}

export interface FilmSessionOptions {
  readonly width: number;
  readonly height: number;
  readonly settings?: FilmSettingsInput | FilmSettings;
  readonly startMs?: number;
  readonly endMs?: number;
}

export interface FilmSessionInfo {
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly fps: number;
  readonly samples: number;
  readonly maxSamples: number;
  readonly shutterDeg: number;
  readonly filter: string;
  readonly filmDurationMs: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly speed: FilmSettings['speed'];
}

export interface FilmFrameInfo {
  readonly frame: number;
  readonly frames: number;
  /** Image travel across the shutter that chose the sample count (px). */
  readonly motionPx: number;
  /** Film (output) time of the frame. */
  readonly filmTimeMs: number;
  /** Timeline time of the frame's centre. */
  readonly timelineMs: number;
  /** First and last shutter sample on the timeline. */
  readonly openMs: number;
  readonly closeMs: number;
  readonly samples: number;
}

export interface FilmStillOptions {
  readonly width: number;
  readonly height: number;
  readonly samples?: number;
  readonly filter?: FilmSettings['filter'];
  /** Render this many times larger, then downsample (stills only). */
  readonly supersample?: number;
  readonly maxSize?: number;
  /**
   * Motion-blur still: integrate this much timeline (ms, ≤ 1000) centred on
   * the playhead while actors, camera and effects move (0 = frozen instant).
   */
  readonly exposureMs?: number;
  /** Motion-adaptive ceiling for an exposure (samples..128; default max(samples, 64)). */
  readonly maxSamples?: number;
  /** Storyboard length (ms): exposure samples stay inside it. */
  readonly durationMs?: number;
}

export interface FilmStill {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  /** Samples the still accumulated (an exposure adapts them to image motion). */
  readonly samples: number;
  /** Exposure integrated (ms); 0 for a frozen instant. */
  readonly exposureMs: number;
}

interface SavedState {
  width: number;
  height: number;
  pixelRatio: number;
  aspect: number;
  taaEnabled: boolean;
  temporalAccumulation: boolean;
  adaptiveSuspended: boolean;
  flareDt: number | null;
}

/**
 * Offset a projection by a sub-pixel sample (temporalAA.ts applyProjectionJitter, written here so the Studio chunk
 * imports nothing from the game's entry chunk: a shared module splits into a boot request of its own).
 */
function jitterProjection(projection: THREE.Matrix4, jx: number, jy: number, width: number, height: number): void {
  projection.elements[8] += (2 * jx) / Math.max(1, width);
  projection.elements[9] += (2 * jy) / Math.max(1, height);
}

/** The film renderer bound to one Studio. */
export function createStudioFilm(ports: StudioFilmPorts) {
  const { renderer, scene, camera, post, lighting } = ports;
  const size = new THREE.Vector2();
  let pass: FilmAccumulatePass | null = null;
  let saved: SavedState | null = null;
  let plan: FilmPlan | null = null;
  let info: FilmSessionInfo | null = null;
  let nextFrame = 0;
  let times = new Float64Array(1);
  let jitter: Float64Array = new Float64Array(2);
  let jitterFilter = '';
  const jitterSets = new Map<number, Float64Array>();
  let lastFov = camera.fov;
  let previousCloseMs = -Infinity;
  const tailEnabled: boolean[] = [];
  let depthProbe: FilmDepthProbe | null = null;

  /** The surfaces nearest the lens in the frame just rendered, for the next motion probe (filmDepthProbe.ts). */
  function readNearSurfaces(): void {
    const depth = post.sceneAA.sceneTarget.depthTexture;
    depthProbe ??= new FilmDepthProbe();
    if (!depth || !depthProbe.read(renderer, depth, camera)) depthProbe.clear();
  }

  function clouds(): FilmClouds | null {
    const candidate = scene.userData.volumetricClouds as FilmClouds | undefined;
    return candidate && typeof candidate.settleForCapture === 'function'
      && typeof candidate.beforeSceneRender === 'function' ? candidate : null;
  }

  /** Size the renderer and the whole chain to the exact output at pixel ratio 1. */
  function applyFilmSize(width: number, height: number): void {
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    post.setSize(width, height);
    lighting.updateFrustums();
  }

  /**
   * An in-browser export yields between frames: a window resize may have
   * re-sized the live canvas meanwhile. Adopt that size as the one to restore
   * and put the film size back before the next frame.
   */
  function ensureFilmSize(width: number, height: number): void {
    renderer.getSize(size);
    if (size.x === width && size.y === height && renderer.getPixelRatio() === 1) return;
    if (saved) {
      saved.width = size.x;
      saved.height = size.y;
      saved.pixelRatio = renderer.getPixelRatio();
      saved.aspect = camera.aspect;
    }
    applyFilmSize(width, height);
  }

  /** Resize the renderer and the whole chain to the exact output, then own the frame. */
  function enter(width: number, height: number): void {
    if (saved) throw new Error('A film render is already active');
    renderer.getSize(size);
    saved = {
      width: size.x,
      height: size.y,
      pixelRatio: renderer.getPixelRatio(),
      aspect: camera.aspect,
      taaEnabled: post.taa.enabled,
      temporalAccumulation: post.upscaler.temporalAccumulation,
      adaptiveSuspended: renderer.domElement.dataset.adaptiveSuspended === 'true',
      flareDt: post.lensFlare.fixedDt,
    };
    ports.setFilmMode(true);
    try {
      post.setAdaptiveSuspended(true);
      post.pinDynScale(1);
      post.resetPerfTrims();
      applyFilmSize(width, height);
      // The jittered accumulation replaces temporal AA (and its wall-clock history).
      post.taa.enabled = false;
      // Spatial RCAS only. The 0.5 temporal floor (TAA's box-filter softness)
      // printed a pixel stipple over the accumulated frame in the 2026-10-01
      // A/B; the jittered gaussian reconstruction needs no extra lift.
      post.upscaler.temporalAccumulation = false;
      pass = new FilmAccumulatePass(renderer, post.sceneAA.sceneTarget.width, post.sceneAA.sceneTarget.height);
      const passes = post.composer.passes;
      const at = passes.indexOf(post.lateFx);
      if (at < 0) throw new Error('Film renderer needs the late-FX pass in the composer');
      post.composer.insertPass(pass, at + 1);
      lastFov = camera.fov;
    } catch (error) {
      leave();
      throw error;
    }
  }

  function leave(): void {
    if (pass) {
      post.composer.removePass(pass);
      pass.dispose();
      pass = null;
    }
    depthProbe?.dispose();
    depthProbe = null;
    const state = saved;
    saved = null;
    plan = null;
    info = null;
    tailEnabled.length = 0;
    if (!state) { ports.setFilmMode(false); return; }
    post.lensFlare.fixedDt = state.flareDt;
    post.taa.enabled = state.taaEnabled;
    post.taa.resetHistory();
    post.upscaler.temporalAccumulation = state.temporalAccumulation;
    renderer.setPixelRatio(state.pixelRatio);
    renderer.setSize(state.width, state.height, false);
    camera.aspect = state.aspect;
    camera.updateProjectionMatrix();
    post.setSize(state.width, state.height);
    post.pinDynScale(null);
    post.setAdaptiveSuspended(state.adaptiveSuspended);
    lighting.updateFrustums();
    lighting.update(true);
    ports.setFilmMode(false);
  }

  /** Passes after the accumulation point stay off while samples accumulate. */
  function suspendTail(): void {
    const passes = post.composer.passes;
    tailEnabled.length = 0;
    for (let index = passes.indexOf(pass!) + 1; index < passes.length; index++) {
      tailEnabled.push(passes[index].enabled);
      passes[index].enabled = false;
    }
  }

  function restoreTail(): void {
    if (!tailEnabled.length || !pass) return;
    const passes = post.composer.passes;
    const start = passes.indexOf(pass) + 1;
    for (let k = 0; k < tailEnabled.length && start + k < passes.length; k++) passes[start + k].enabled = tailEnabled[k];
    tailEnabled.length = 0;
  }

  /** Camera-dependent state for the sample instant the timeline now holds. */
  function stageSample(complete: boolean): void {
    // Clouds drift with the timeline, not the wall clock.
    clouds()?.setCaptureTime?.(ports.clockMs() / 1000);
    camera.updateMatrixWorld(true);
    if (camera.fov !== lastFov) {
      lighting.updateFrustums();
      lastFov = camera.fov;
    }
    ports.prepareWorld(complete);
    lighting.update(true);
    ports.refreshFxForCamera();
  }

  /**
   * Render one accumulated frame: `count` jittered samples, sample i staged
   * by `stage(i)` (null: a still, staged once by the caller). The final
   * sample resolves through the post tail into the canvas.
   */
  function accumulate(count: number, stage: ((index: number) => void) | null): void {
    const accumulator = pass!;
    const target = post.sceneAA.sceneTarget;
    accumulator.begin();
    accumulator.weight = 1 / count;
    suspendTail();
    try {
      for (let index = 0; index < count; index++) {
        stage?.(index);
        const last = index === count - 1;
        accumulator.mode = last ? 'resolve' : 'accumulate';
        if (last) restoreTail();
        const jx = jitter[index * 2], jy = jitter[index * 2 + 1];
        const jittered = jx !== 0 || jy !== 0;
        if (jittered) {
          jitterProjection(camera.projectionMatrix, jx, jy, target.width, target.height);
          camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        }
        try {
          post.render(0);
        } finally {
          if (jittered) camera.updateProjectionMatrix();
        }
      }
    } finally {
      restoreTail();
    }
  }

  function ensureBuffers(samples: number): void {
    if (times.length < samples) times = new Float64Array(samples);
  }

  /** The jitter set for `count` samples (cached; deterministic per count and filter). */
  function useJitter(count: number, filter: FilmSettings['filter']): void {
    if (jitterFilter !== filter) { jitterSets.clear(); jitterFilter = filter; }
    let set = jitterSets.get(count);
    if (!set) {
      set = filmJitter(count, filter, new Float64Array(count * 2));
      jitterSets.set(count, set);
    }
    jitter = set;
  }

  /**
   * Bring temporal clouds to a converged state for the current camera. One
   * trace first lets the layer see a storyboard cut (it compares against the
   * previous camera), so the frame after a cut settles completely instead of
   * rebuilding its interleaved history across the frame's first samples.
   */
  function settleClouds(): void {
    const layer = clouds();
    if (!layer) return;
    const target = post.sceneAA.sceneTarget;
    layer.beforeSceneRender(renderer, camera, 0, target.width, target.height);
    layer.settleForCapture(camera);
  }

  return {
    get active() { return !!plan; },
    get info() { return info; },

    /**
     * Open a film: size the chain to the output, seek to the first shutter
     * instant and settle every temporal layer there. Frames then render in
     * order through renderNext(); end() restores the live Studio.
     */
    begin(options: FilmSessionOptions, durationMs: number): FilmSessionInfo {
      if (plan) throw new Error('A film render is already active');
      const width = Math.round(options.width), height = Math.round(options.height);
      const maxSize = Math.min(6144, renderer.capabilities.maxTextureSize || 6144);
      if (!(width >= 64 && height >= 64 && width <= maxSize && height <= maxSize)) {
        throw new RangeError(`Film size must be between 64 and ${maxSize} pixels`);
      }
      if (width % 2 || height % 2) throw new RangeError('Film dimensions must be even (4:2:0 video)');
      const settings = normalizeFilm(options.settings ?? {});
      const startMs = Math.round(Math.max(0, options.startMs ?? 0));
      const endMs = Math.min(durationMs, options.endMs ?? durationMs);
      const nextPlan = createFilmPlan(settings, startMs, endMs, ports.cutTimes());
      ensureBuffers(settings.maxSamples);
      enter(width, height);
      try {
        plan = nextPlan;
        nextFrame = 0;
        previousCloseMs = -Infinity;
        plan.sampleTimes(0, times);
        ports.seek(times[0]);
        // A fresh cloud trace sequence: the film never inherits the live layer's history.
        clouds()?.setCaptureTime?.(ports.clockMs() / 1000, true);
        // One complete warm frame at the new size: allocates targets, links
        // programs and gives the clouds their history size before settling.
        stageSample(true);
        post.lensFlare.fixedDt = 10;
        post.render(0);
        settleClouds();
        readNearSurfaces();
        info = {
          width,
          height,
          frames: plan.frames,
          fps: settings.fps,
          samples: settings.samples,
          maxSamples: settings.maxSamples,
          shutterDeg: settings.shutterDeg,
          filter: settings.filter,
          filmDurationMs: plan.map.durationMs,
          startMs,
          endMs,
          speed: settings.speed,
        };
        return info;
      } catch (error) {
        leave();
        throw error;
      }
    },

    /** Render the next output frame into the canvas (call in order). */
    renderNext(): FilmFrameInfo {
      if (!plan || !info) throw new Error('No film render is active');
      if (nextFrame >= plan.frames) throw new RangeError('The film has no frames left');
      const frame = nextFrame++;
      const settings = plan.settings;
      ensureFilmSize(info.width, info.height);
      // Motion-adaptive count: probe the image travel over the base shutter,
      // then sample densely enough that no copy steps more than ~1.5 px.
      plan.sampleTimes(frame, times, settings.samples);
      // the last frame's nearest surfaces belong to the shot before a cut
      for (const cut of ports.cutTimes()) if (cut > previousCloseMs && cut <= times[settings.samples - 1]) depthProbe?.clear();
      const motionPx = settings.samples > 1
        ? ports.motionPathPx(times, settings.samples, info.width, info.height, depthProbe) : 0;
      const samples = adaptiveSampleCount(motionPx, settings);
      plan.sampleTimes(frame, times, samples);
      useJitter(samples, settings.filter);
      // A camera cut (or the first frame) restarts the lens-flare easing, as a real lens would.
      let cutFrame = frame === 0;
      for (const cut of ports.cutTimes()) if (cut > previousCloseMs && cut <= times[samples - 1]) cutFrame = true;
      previousCloseMs = times[samples - 1];
      post.lensFlare.fixedDt = cutFrame ? 10 : plan.frameMs / 1000;
      accumulate(samples, (index) => {
        if (times[index] > ports.clockMs()) ports.advanceTo(times[index]);
        stageSample(index === 0);
        if (index === 0) settleClouds();
      });
      readNearSurfaces();
      return {
        frame,
        frames: plan.frames,
        motionPx,
        filmTimeMs: plan.frameFilmMs(frame),
        timelineMs: plan.frameTimelineMs(frame),
        openMs: times[0],
        closeMs: times[samples - 1],
        samples,
      };
    },

    /** Restore the live Studio (sizes, TAA, governor) and leave the timeline where the film ended. */
    end(): void {
      leave();
    },

    /**
     * Supersampled still at the current timeline instant: `samples` jittered
     * renders, optionally at `supersample` x resolution. With `exposureMs`
     * the shutter stays open across that much timeline centred on the
     * playhead: actors, camera rail and effects move between the samples (a
     * panning shot keeps its tracked tank sharp against a streaked world), the
     * count adapts to the image motion up to `maxSamples`, no sample crosses a
     * storyboard cut, and the playhead returns to its instant afterwards.
     * Returns the canvas holding the frame; the caller reads it back in the
     * same task (downsampling when supersampled).
     */
    renderStill(options: FilmStillOptions): FilmStill {
      if (plan || saved) throw new Error('Finish the film render first');
      const samples = Math.round(Math.min(FILM_MAX_ADAPTIVE_SAMPLES, Math.max(1, options.samples ?? 16)));
      const exposureMs = Math.min(FILM_MAX_EXPOSURE_MS, Math.max(0, Number(options.exposureMs) || 0));
      const moving = exposureMs > 0 && samples > 1;
      const maxSamples = moving
        ? Math.round(Math.min(FILM_MAX_ADAPTIVE_SAMPLES, Math.max(samples, options.maxSamples ?? Math.max(samples, 64))))
        : samples;
      const maxSize = Math.min(options.maxSize ?? 6144, renderer.capabilities.maxTextureSize || 6144);
      const scale = Math.max(1, Math.min(options.supersample ?? 1, maxSize / options.width, maxSize / options.height));
      const width = Math.round(options.width * scale), height = Math.round(options.height * scale);
      const centerMs = ports.clockMs();
      let count = samples;
      enter(width, height);
      try {
        if (moving) {
          // Film mode is on, so the probe sees the same cue attack and shake scale as the render.
          ensureBuffers(maxSamples);
          // the frame at the playhead first: its depth shows the surfaces nearest the lens (filmDepthProbe.ts)
          stageSample(true);
          post.render(0);
          readNearSurfaces();
          const cuts = ports.cutTimes(), durationMs = options.durationMs ?? Infinity;
          exposureSampleTimes(centerMs, exposureMs, samples, cuts, durationMs, times);
          const motionPx = ports.motionPathPx(times, samples, options.width, options.height, depthProbe);
          count = adaptiveSampleCount(motionPx, { samples, maxSamples });
          exposureSampleTimes(centerMs, exposureMs, count, cuts, durationMs, times);
          ports.seek(Math.floor(times[0]));
          if (times[0] > ports.clockMs()) ports.advanceTo(times[0]);
        }
        useJitter(count, options.filter ?? 'gaussian');
        clouds()?.setCaptureTime?.(ports.clockMs() / 1000, true);
        // A frozen still stages the camera, shadows and FX once and every
        // jittered sample reuses them (shadow fits never see the jitter); an
        // exposure stages every sample instant like a film frame.
        stageSample(true);
        post.lensFlare.fixedDt = 10;
        post.render(0);
        settleClouds();
        accumulate(count, moving ? (index) => {
          if (times[index] > ports.clockMs()) ports.advanceTo(times[index]);
          stageSample(index === 0);
          if (index === 0) settleClouds();
        } : null);
        const output = document.createElement('canvas');
        output.width = Math.round(options.width);
        output.height = Math.round(options.height);
        const context = output.getContext('2d');
        if (!context) throw new Error('2D canvas unavailable');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(renderer.domElement, 0, 0, output.width, output.height);
        return { canvas: output, width: output.width, height: output.height, samples: count, exposureMs: moving ? exposureMs : 0 };
      } finally {
        leave();
        // An exposure moved the timeline across its shutter: put the playhead back.
        if (moving) ports.seek(centerMs);
      }
    },
  };
}

export type StudioFilm = ReturnType<typeof createStudioFilm>;
