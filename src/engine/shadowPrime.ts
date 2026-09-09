import {
  VSMShadowMap, WebGLRenderTarget,
  type BufferGeometry, type Camera, type DirectionalLight, type Material,
  type Object3D, type Scene, type WebGLRenderer,
} from 'three';

const SHADOW_PRIME_LAYER = 31;

export interface ShadowCasterWarmBatch {
  cascadeIndex: number;
  batchIndex: number;
  /** Candidate counts before the production shadow renderer's frustum cull. */
  casterCount: number;
  vertexCount: number;
}

export interface ShadowCasterWarmTiming extends ShadowCasterWarmBatch {
  elapsedMs: number;
}

export interface ShadowCasterWarmupOptions {
  maxVerticesPerBatch?: number;
  maxCastersPerBatch?: number;
  yieldBeforeBatch?: (batch: ShadowCasterWarmBatch) => void | Promise<void>;
  onBatch?: (timing: ShadowCasterWarmTiming) => void;
}

export interface ShadowPrimeOptions {
  yieldBeforeCascade?: ((index: number) => void | Promise<void>) | null;
  cascadeLimit?: number;
  signal?: AbortSignal;
  /** Work lease only: cancellation must still restore resources on the same context. */
  isCurrent?: () => boolean;
  /** Opt-in first-cascade first-use scheduling only; final full cascades are unchanged. */
  casterWarmup?: ShadowCasterWarmupOptions;
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

interface CasterState {
  object: Object3D;
  castShadow: boolean;
  receiveShadow: boolean;
  vertexCount: number;
}

type ShadowDrawable = Object3D & { geometry: BufferGeometry; material: Material | Material[] };

function isShadowDrawable(object: Object3D): object is ShadowDrawable {
  return ('isMesh' in object && object.isMesh === true)
    || ('isLine' in object && object.isLine === true)
    || ('isPoints' in object && object.isPoints === true);
}

function collectWarmCasters(state: PrimeState, scene: Scene): CasterState[] {
  const casters: CasterState[] = [];
  const vsm = state.shadowMap.type === VSMShadowMap;
  scene.traverseVisible(object => {
    if (!isShadowDrawable(object)) return;
    if (!(object.layers.mask & state.cameraMask)) return;
    if (!object.castShadow && !(vsm && object.receiveShadow)) return;
    const { geometry, material } = object;
    const vertexCount = geometry.getAttribute('position')?.count ?? 0;
    const cornerCount = geometry.index?.count ?? vertexCount;
    const start = geometry.drawRange.start;
    const end = Math.min(start + geometry.drawRange.count, cornerCount);
    if (vertexCount <= 0 || end <= start) return;
    const draws = Array.isArray(material)
      ? geometry.groups.some(group => material[group.materialIndex ?? 0]?.visible
        && Math.min(end, group.start + group.count) > Math.max(start, group.start))
      : material.visible;
    if (draws) casters.push({ object, castShadow: object.castShadow,
      receiveShadow: object.receiveShadow, vertexCount });
  });
  return casters;
}

function warmBatches(casters: readonly CasterState[], options: ShadowCasterWarmupOptions) {
  const maxVertices = options.maxVerticesPerBatch ?? 45000;
  const maxCasters = options.maxCastersPerBatch ?? 8;
  if (!Number.isSafeInteger(maxVertices) || maxVertices < 1
      || !Number.isSafeInteger(maxCasters) || maxCasters < 1) {
    throw new Error('shadow_prime_invalid_warmup_budget');
  }
  const batches: Array<{ start: number; end: number; vertexCount: number }> = [];
  let start = 0;
  let vertexCount = 0;
  for (let index = 0; index < casters.length; index++) {
    const vertices = casters[index]!.vertexCount;
    if (index > start && (index - start >= maxCasters || vertexCount + vertices > maxVertices)) {
      batches.push({ start, end: index, vertexCount });
      start = index;
      vertexCount = 0;
    }
    // A geometry is atomic: an oversized caster is an honest single-item batch.
    vertexCount += vertices;
  }
  if (start < casters.length) batches.push({ start, end: casters.length, vertexCount });
  return batches;
}

function restoreWarmCasters(casters: readonly CasterState[]): void {
  const cleanup = cleanupRunner();
  for (const prior of casters) {
    cleanup.run(() => { prior.object.castShadow = prior.castShadow; });
    cleanup.run(() => { prior.object.receiveShadow = prior.receiveShadow; });
  }
  cleanup.finish();
}

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

function renderWarmBatch(
  state: PrimeState, scene: Scene, target: WebGLRenderTarget,
  casters: readonly CasterState[], start: number, end: number,
): void {
  let failed = false;
  try {
    const vsm = state.shadowMap.type === VSMShadowMap;
    for (let index = 0; index < casters.length; index++) {
      if (index >= start && index < end) continue;
      const object = casters[index]!.object;
      // Never hide a parent: eligible child casters must still be traversed.
      // VSM also submits receive-only objects, so mute both eligibility flags.
      object.castShadow = false;
      if (vsm) object.receiveShadow = false;
    }
    renderPrimeCascade(state, scene, target, 0);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try { restoreWarmCasters(casters); }
    catch (error) { if (!failed) throw error; }
  }
}

async function warmFirstCascade(
  state: PrimeState, request: ShadowPrimeRequest, target: WebGLRenderTarget,
  options: ShadowCasterWarmupOptions,
): Promise<void> {
  const casters = collectWarmCasters(state, request.scene);
  const batches = warmBatches(casters, options);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]!;
    const detail: ShadowCasterWarmBatch = { cascadeIndex: 0, batchIndex,
      casterCount: batch.end - batch.start, vertexCount: batch.vertexCount };
    assertPrimeCurrent(state, request);
    if (options.yieldBeforeBatch) await options.yieldBeforeBatch(detail);
    assertPrimeCurrent(state, request);
    const startedAt = performance.now();
    renderWarmBatch(state, request.scene, target, casters, batch.start, batch.end);
    assertPrimeCurrent(state, request);
    options.onBatch?.({ ...detail, elapsedMs: performance.now() - startedAt });
    assertPrimeCurrent(state, request);
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

/** Quality and cascade selection remain with lighting. Optional first-use
 * cohorts visit only the first production cascade, with its normal culling;
 * later cascades may still have first-use cost. The same complete cascades
 * always render afterwards, and only those final render timings are returned.
 */
export async function primeShadowCascades(request: ShadowPrimeRequest): Promise<number[]> {
  request.signal?.throwIfAborted();
  if (!Number.isSafeInteger(request.count) || request.count < 0 || request.count > request.lights.length) {
    throw new Error('shadow_prime_invalid_count');
  }
  const state = capturePrimeState(request);
  assertPrimeCurrent(state, request);
  if (request.count === 0) return [];
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
    if (request.casterWarmup) {
      await warmFirstCascade(state, request, target, request.casterWarmup);
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
