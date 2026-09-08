import { WebGLRenderTarget, type Camera, type DirectionalLight, type Scene, type WebGLRenderer } from 'three';

const SHADOW_PRIME_LAYER = 31;

export interface ShadowPrimeOptions {
  yieldBeforeCascade?: ((index: number) => void | Promise<void>) | null;
  cascadeLimit?: number;
  signal?: AbortSignal;
  /** Work lease only: cancellation must still restore resources on the same context. */
  isCurrent?: () => boolean;
}

interface ShadowPrimeRequest extends ShadowPrimeOptions {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  lights: readonly DirectionalLight[];
  count: number;
}

function cleanupRunner() {
  let failure: (() => never) | undefined;
  return {
    run(operation: () => void): void {
      try { operation(); }
      catch (error) { failure ??= () => { throw error; }; }
    },
    get failed() { return failure !== undefined; },
    finish(): void { failure?.(); },
  };
}

function capturePrimeState({ renderer, camera, lights }: ShadowPrimeRequest) {
  const info = renderer.info;
  const gl = renderer.getContext();
  const shadowMap = renderer.shadowMap;
  const originalRender = shadowMap.render;
  const state = {
    renderer, camera, lights, shadowMap, originalRender,
    target: renderer.getRenderTarget(),
    face: renderer.getActiveCubeFace?.() ?? 0,
    mip: renderer.getActiveMipmapLevel?.() ?? 0,
    cameraMask: camera.layers.mask,
    prior: lights.map((light) => ({ light, shadow: light.shadow,
      mask: light.layers.mask, auto: light.shadow.autoUpdate, needs: light.shadow.needsUpdate })),
    contextCurrent(): boolean {
      try { return renderer.info === info && renderer.shadowMap === shadowMap && !gl.isContextLost(); }
      catch { return false; }
    },
  };
  return state;
}

type PrimeState = ReturnType<typeof capturePrimeState>;

function assertPrimeCurrent(state: PrimeState, options: ShadowPrimeOptions): void {
  options.signal?.throwIfAborted();
  if (!state.contextCurrent()) throw new Error('shadow_prime_context_changed');
  if (options.isCurrent?.() === false) throw new Error('shadow_prime_stale');
}

function restorePrimeBindings(state: PrimeState): void {
  const cleanup = cleanupRunner();
  if (state.contextCurrent()) {
    cleanup.run(() => state.renderer.setRenderTarget(state.target, state.face, state.mip));
  }
  cleanup.run(() => { state.shadowMap.render = state.originalRender; });
  cleanup.run(() => { state.camera.layers.mask = state.cameraMask; });
  for (const prior of state.prior) cleanup.run(() => { prior.light.layers.mask = prior.mask; });
  cleanup.finish();
}

function renderPrimeCascade(
  state: PrimeState, scene: Scene, target: WebGLRenderTarget, index: number,
): void {
  const { camera, shadowMap, renderer } = state;
  const light = state.lights[index]!;
  let failed = false;
  try {
    camera.layers.set(SHADOW_PRIME_LAYER);
    light.layers.enable(SHADOW_PRIME_LAYER);
    // Enter through the public renderer to rebuild Three's current render
    // state after each task. Only the selected production cascade draws;
    // its traversal still sees the original camera and shadow-only layers.
    shadowMap.render = (_lights, activeScene, activeCamera) => {
      const mask = activeCamera.layers.mask;
      activeCamera.layers.mask = state.cameraMask;
      try { state.originalRender.call(shadowMap, [light], activeScene, activeCamera); }
      finally { activeCamera.layers.mask = mask; }
    };
    renderer.setRenderTarget(target);
    light.shadow.needsUpdate = true;
    renderer.render(scene, camera);
    light.shadow.needsUpdate = false;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try { restorePrimeBindings(state); }
    catch (error) { if (!failed) throw error; }
  }
}

function restorePrimeFlags(state: PrimeState, success: boolean): void {
  const cleanup = cleanupRunner();
  for (const prior of state.prior) cleanup.run(() => {
    prior.shadow.autoUpdate = success ? false : prior.auto;
    prior.shadow.needsUpdate = success ? false : prior.needs;
  });
  cleanup.finish();
}

function releasePrimeState(
  state: PrimeState, target: WebGLRenderTarget, complete: boolean, options: ShadowPrimeOptions,
): void {
  const cleanup = cleanupRunner();
  cleanup.run(() => restorePrimeBindings(state));
  // Context loss destroys native resources. Do not dispatch old target
  // disposal hooks into a restored renderer lifetime.
  if (state.contextCurrent()) cleanup.run(() => target.dispose());
  cleanup.run(() => assertPrimeCurrent(state, options));
  const success = complete && !cleanup.failed;
  cleanup.run(() => restorePrimeFlags(state, success));
  cleanup.finish();
}

/** Exact cascade scheduling only; quality and cascade selection remain with lighting. */
export async function primeShadowCascades(request: ShadowPrimeRequest): Promise<number[]> {
  request.signal?.throwIfAborted();
  if (!Number.isSafeInteger(request.count) || request.count < 0 || request.count > request.lights.length) {
    throw new Error('shadow_prime_invalid_count');
  }
  const state = capturePrimeState(request);
  assertPrimeCurrent(state, request);
  const target = new WebGLRenderTarget(8, 8, { depthBuffer: false, stencilBuffer: false });
  const timings: number[] = [];
  let complete = false;
  let failed = false;
  try {
    request.scene.updateMatrixWorld(true);
    request.camera.updateMatrixWorld(true);
    for (const light of request.lights) {
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = false;
    }
    for (let index = 0; index < request.count; index++) {
      assertPrimeCurrent(state, request);
      if (request.yieldBeforeCascade) await request.yieldBeforeCascade(index);
      assertPrimeCurrent(state, request);
      const startedAt = performance.now();
      renderPrimeCascade(state, request.scene, target, index);
      assertPrimeCurrent(state, request);
      timings.push(Math.round(performance.now() - startedAt));
    }
    complete = true;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try { releasePrimeState(state, target, complete, request); }
    catch (error) { if (!failed) throw error; }
  }
  try { assertPrimeCurrent(state, request); }
  catch (error) {
    try { restorePrimeFlags(state, false); } catch { /* Preserve the invalidation reason. */ }
    throw error;
  }
  return timings;
}
