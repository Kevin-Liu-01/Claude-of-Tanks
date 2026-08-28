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
  >;
  documentElement: Element;
  ResizeObserver?: typeof ResizeObserver;
  setInterval: typeof globalThis.setInterval;
  clearInterval: typeof globalThis.clearInterval;
}

export interface ViewportRuntime {
  apply(): void;
  dispose(): void;
  isRecovering(): boolean;
}

export interface ViewportRuntimeOptions {
  container: HTMLElement;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  post: PostViewportOwner;
  lighting: LightingViewportOwner;
  environment?: ViewportEnvironment;
  resizeRenderer?: (renderer: WebGLRenderer, camera: PerspectiveCamera) => void;
}

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
 * Owns renderer/post/shadow viewport synchronization and the first-layout
 * recovery path for hosts that temporarily report a 0x0 viewport at boot.
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
  let disposed = false;

  const dimensions = () => ({
    width: container.clientWidth || win.innerWidth,
    height: container.clientHeight || win.innerHeight,
  });

  const apply = () => {
    if (disposed) return;
    resizeRenderer(renderer, camera);
    const { width, height } = dimensions();
    post.setSize(width, height);
    lighting.updateFrustums();
  };

  const stopRecovery = () => {
    observer?.disconnect();
    observer = null;
    if (interval !== null) environment.clearInterval(interval);
    interval = null;
  };

  const tryRecover = () => {
    const { width, height } = dimensions();
    if (disposed || width <= 0 || height <= 0) return false;
    apply();
    stopRecovery();
    return true;
  };

  win.addEventListener('resize', apply);

  const initial = dimensions();
  if (
    initial.width <= 0 ||
    initial.height <= 0 ||
    renderer.domElement.width <= 0 ||
    renderer.domElement.height <= 0
  ) {
    const Observer = environment.ResizeObserver;
    if (typeof Observer === 'function') {
      observer = new Observer(tryRecover);
      observer.observe(container);
      observer.observe(environment.documentElement);
    }
    interval = environment.setInterval(tryRecover, 250);
    tryRecover();
  }

  return {
    apply,
    dispose() {
      if (disposed) return;
      disposed = true;
      win.removeEventListener('resize', apply);
      stopRecovery();
    },
    isRecovering: () => observer !== null || interval !== null,
  };
}
