import type { PerspectiveCamera, WebGLRenderer } from 'three';

import { onResize } from './renderer.ts';

interface PostViewportOwner {
  setSize(width: number, height: number): void;
}

interface LightingViewportOwner {
  updateFrustums(): void;
}

interface ViewportEnvironment {
  window: Pick<Window,
    'innerWidth' | 'innerHeight' | 'addEventListener' | 'removeEventListener'
  > & Partial<Pick<Window, 'devicePixelRatio' | 'matchMedia'>>;
  documentElement: Element;
  ResizeObserver?: typeof ResizeObserver;
  setInterval: typeof globalThis.setInterval;
  clearInterval: typeof globalThis.clearInterval;
}

interface ViewportRuntime {
  apply(): void;
  /** Repair a silent density change before a visible frame; inert otherwise. */
  syncPixelRatio(): boolean;
  dispose(): void;
  isRecovering(): boolean;
}

interface ViewportRuntimeOptions {
  container: HTMLElement;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  post: PostViewportOwner;
  lighting: LightingViewportOwner;
  environment?: ViewportEnvironment;
  resizeRenderer?: (renderer: WebGLRenderer, camera: PerspectiveCamera) => void;
}

/**
 * (2026-10-19, black-screen-228 RC2) the smallest layout the renderer follows, in CSS px. A momentary smaller report (a
 * window restore, Stage Manager, a display change, a capture's clipped screenshot reporting a 1 x 1 window for ~90 ms)
 * made every composer target a fraction of a pixel at a fractional render ratio (0.8 x 0.8 at Ultra Low):
 * glTexStorage2D refused it and the scene, aerial and late-FX renders drew into incomplete framebuffers. Such a size
 * keeps the last good one and is read again on the next resize event or recovery tick.
 */
export const MIN_VIEWPORT_CSS_PX = 16;

function browserEnvironment(): ViewportEnvironment {
  return {
    window,
    documentElement: document.documentElement,
    ResizeObserver: globalThis.ResizeObserver,
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
  };
}

/**
 * Owns renderer/post/shadow synchronization for layout and pixel-density
 * changes, plus first-layout recovery for hosts reporting 0x0 at boot.
 */
export function createViewportRuntime({
  container,
  renderer,
  camera,
  post,
  lighting,
  environment = browserEnvironment(),
  resizeRenderer = onResize,
}: ViewportRuntimeOptions): ViewportRuntime {
  const win = environment.window;
  let observer: ResizeObserver | null = null;
  let interval: ReturnType<typeof globalThis.setInterval> | null = null;
  let resolutionQuery: MediaQueryList | null = null;
  let watchedPixelRatio = win.devicePixelRatio ?? 1;
  let lastAppliedPixelRatio = watchedPixelRatio;
  let appliedViewport: { width: number; height: number; pixelRatio: number } | null = null;
  let disposed = false;

  const dimensions = () => ({
    width: container.clientWidth || win.innerWidth,
    height: container.clientHeight || win.innerHeight,
  });

  const tiny = (size: { width: number; height: number }): boolean =>
    !(size.width >= MIN_VIEWPORT_CSS_PX && size.height >= MIN_VIEWPORT_CSS_PX);

  const apply = () => {
    if (disposed) return;
    const { width, height } = dimensions();
    const parent = renderer.domElement.parentElement;
    if (tiny({ width, height }) || (parent && tiny({ width: parent.clientWidth || win.innerWidth, height: parent.clientHeight || win.innerHeight }))) {
      startRecovery();
      return;
    }
    resizeRenderer(renderer, camera);
    post.setSize(width, height);
    lighting.updateFrustums();
    lastAppliedPixelRatio = win.devicePixelRatio ?? 1;
    appliedViewport = { width, height, pixelRatio: lastAppliedPixelRatio };
    watchPixelRatio();
  };

  function onViewportChange(): void {
    if (disposed) return;
    const { width, height } = dimensions();
    if (tiny({ width, height })) {
      watchPixelRatio();
      return;
    }
    if (appliedViewport?.width === width && appliedViewport.height === height
      && appliedViewport.pixelRatio === (win.devicePixelRatio ?? 1)) return;
    apply();
  }

  function onPixelRatioChange(): void {
    // A window resize may already have applied this ratio. Ignore its queued
    // media event (and late events from queries detached during re-arming).
    if (disposed || (win.devicePixelRatio ?? 1) === watchedPixelRatio) return;
    onViewportChange();
  }

  function syncPixelRatio(): boolean {
    // Some hosts change DPR/query.matches without delivering either resize
    // or MediaQueryList events. The normal frame path is one scalar compare:
    // no layout reads, objects, query allocation, timers or scheduling.
    if (disposed || (win.devicePixelRatio ?? 1) === lastAppliedPixelRatio) return false;
    const { width, height } = dimensions();
    if (tiny({ width, height })) {
      watchPixelRatio();
      return false;
    }
    apply();
    stopRecovery();
    return true;
  }

  function watchPixelRatio(): void {
    if (!win.matchMedia) return;
    const pixelRatio = win.devicePixelRatio ?? 1;
    if (resolutionQuery && pixelRatio === watchedPixelRatio) return;
    resolutionQuery?.removeEventListener('change', onPixelRatioChange);
    watchedPixelRatio = pixelRatio;
    // DPR can change without a CSS resize when moving between displays or
    // changing host density. Events remain the immediate path; syncPixelRatio
    // covers silent hosts through the already-owned presentation cadence.
    resolutionQuery = win.matchMedia(`(resolution: ${pixelRatio}dppx)`);
    resolutionQuery.addEventListener('change', onPixelRatioChange);
  }

  const stopRecovery = () => {
    observer?.disconnect();
    observer = null;
    if (interval !== null) environment.clearInterval(interval);
    interval = null;
  };

  const tryRecover = () => {
    if (disposed || tiny(dimensions())) return false;
    stopRecovery();
    apply();
    return !observer && interval === null;
  };

  function startRecovery(): void {
    if (disposed || observer || interval !== null) return;
    const Observer = environment.ResizeObserver;
    if (typeof Observer === 'function') {
      observer = new Observer(tryRecover);
      observer.observe(container);
      observer.observe(environment.documentElement);
    }
    interval = environment.setInterval(tryRecover, 250);
  }

  win.addEventListener('resize', onViewportChange);
  // responsiveLayout.ts follows window.visualViewport directly because iOS
  // third-party browsers can change the visible height without dispatching a
  // window resize. Its event fires after #app has the corrected CSS size. A
  // pinch zoom is not a size change: that measurement ignores the pinch scale,
  // so it neither fires this event nor moves #app, and the canvas keeps its
  // backing store while the browser magnifies it.
  win.addEventListener('cot:layoutchange', onViewportChange);
  watchPixelRatio();

  if (tiny(dimensions()) || renderer.domElement.width <= 0 || renderer.domElement.height <= 0) {
    startRecovery();
    tryRecover();
  } else {
    // Renderer construction precedes awaited boot work. A resize in that gap
    // may leave a positive but stale canvas before our listeners exist. Rejoin
    // all size owners once at startup; unchanged frames still read only DPR.
    apply();
  }

  return {
    apply,
    syncPixelRatio,
    dispose() {
      if (disposed) return;
      disposed = true;
      win.removeEventListener('resize', onViewportChange);
      win.removeEventListener('cot:layoutchange', onViewportChange);
      resolutionQuery?.removeEventListener('change', onPixelRatioChange);
      resolutionQuery = null;
      stopRecovery();
    },
    isRecovering: () => observer !== null || interval !== null,
  };
}
