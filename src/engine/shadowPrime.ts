import {
  VSMShadowMap, WebGLRenderTarget,
  type BufferGeometry, type Camera, type DirectionalLight, type Material,
  type Object3D, type Scene, type WebGLRenderer,
} from 'three';
import { vehicleShadowDetailOf } from './nearVehicleShadowDetail.ts';
import { SHADOW_ONLY_LAYER } from './renderLayers.ts';

const SHADOW_PRIME_LAYER = 31;

interface ShadowCasterWarmBatch {
  cascadeIndex: number;
  batchIndex: number;
  /** Candidate counts; a batch's casters draw without the frustum cull. */
  casterCount: number;
  vertexCount: number;
}

interface ShadowCasterWarmTiming extends ShadowCasterWarmBatch {
  elapsedMs: number;
}

interface ShadowCasterWarmupOptions {
  maxVerticesPerBatch?: number;
  maxCastersPerBatch?: number;
  yieldBeforeBatch?: (batch: ShadowCasterWarmBatch) => void | Promise<void>;
  onBatch?: (timing: ShadowCasterWarmTiming) => void;
  /**
   * (battle-spikes-253) Roots the scene holds hidden at the prime (a network view's unspotted actors), whose casters the
   * warm batches draw as well: shown only inside each synchronous batch render (and the caster collection), never across
   * a yield, and never for the final cascades, so no hidden actor's shadow reaches a map anyone sees. nav-perf's root-v
   * room: a guest linked an unspotted M1A3's four depth programs in a live frame, the frame it was first spotted.
   */
  hiddenRoots?: () => Iterable<Object3D | null | undefined>;
}

/** Show the hidden roots for one synchronous call; every one is hidden again before it returns or throws. */
function withRootsShown<T>(roots: readonly Object3D[], run: () => T): T {
  const shown: Object3D[] = [];
  try {
    for (const root of roots) if (!root.visible) { root.visible = true; shown.push(root); }
    return run();
  } finally {
    for (const root of shown) root.visible = false;
  }
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

function capturePrimeState({ renderer, scene, camera, lights }: ShadowPrimeRequest) {
  const info = renderer.info;
  // (2026-10-27, the room-stalls lane) every other light the live camera counts: a prime render keeps them on its layer
  // too (renderPrimeCascade), so the depth programs it builds carry the live frame's light counts
  const cascades = new Set<Object3D>(lights);
  const live: Array<{ light: Object3D; mask: number }> = [];
  scene.traverse((object) => {
    if ((object as Object3D & { isLight?: boolean }).isLight && !cascades.has(object) && (object.layers.mask & camera.layers.mask) !== 0) {
      live.push({ light: object, mask: object.layers.mask });
    }
  });
  const gl = renderer.getContext();
  const shadowMap = renderer.shadowMap;
  const originalRender = shadowMap.render;
  const state = {
    renderer, camera, lights, shadowMap, originalRender,
    target: renderer.getRenderTarget(),
    face: renderer.getActiveCubeFace?.() ?? 0,
    mip: renderer.getActiveMipmapLevel?.() ?? 0,
    cameraMask: camera.layers.mask,
    live,
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
  frustumCulled: boolean;
  /** A BatchedMesh's own per-item cull (null for any other caster). */
  perObjectCulled: boolean | null;
  vertexCount: number;
  /** what keys its depth program apart from another caster's (depthVariant) */
  variant: string;
  /** a near-vehicle detail mesh (castShadow false outside its cascade's pass): it casts inside its own batch only */
  forceCast?: boolean;
}

/**
 * (2026-10-27, the room-stalls lane) What makes three build a caster's depth program apart from another's, as far as the
 * caster shows it: instancing, skinning, batching, morph targets, and per material an alpha-tested map, a displacement
 * map, the side it casts from and a custom depth material. A warm batch takes at most one variant no batch before it
 * did (warmBatches), so one task links at most one new depth program (the room census: a prime task held 307 ms of link).
 */
function depthVariant(object: Object3D): string {
  const caster = object as Object3D & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean; isBatchedMesh?: boolean;
    instanceColor?: unknown; morphTexture?: unknown; geometry?: BufferGeometry; material?: Material | Material[];
    customDepthMaterial?: Material };
  const morph = caster.geometry?.morphAttributes;
  const morphs = `${morph?.position?.length ?? 0}${morph?.normal ? 'n' : ''}${morph?.color ? 'c' : ''}`;
  // (the geometry's own attributes key the program too: vertexNormals and vertexUv1s-3s; the 260 census's last receipt
  // program, an instanced plain caster, matched a warmed variant here and its program did not)
  const attributes = caster.geometry?.attributes;
  const geometry = `${attributes?.normal ? 'N' : ''}${attributes?.uv1 ? '1' : ''}${attributes?.uv2 ? '2' : ''}`
    + `${attributes?.uv3 ? '3' : ''}`;
  const materials = Array.isArray(caster.material) ? caster.material : caster.material ? [caster.material] : [];
  const parts = materials.map((material) => {
    const m = material as Material & { map?: unknown; alphaMap?: unknown; displacementMap?: unknown; displacementScale?: number };
    return `${(m.map || m.alphaMap) && m.alphaTest > 0 ? 'a' : ''}${m.displacementMap && m.displacementScale !== 0 ? 'd' : ''}`
      + `${m.shadowSide ?? m.side}`;
  });
  return `${caster.isInstancedMesh ? 'i' : ''}${caster.instanceColor ? 'c' : ''}${caster.morphTexture ? 'M' : ''}`
    + `${caster.isSkinnedMesh ? 's' : ''}${caster.isBatchedMesh ? 'b' : ''}m${morphs}${geometry}`
    + `:${caster.customDepthMaterial?.uuid ?? ''}:${[...new Set(parts)].sort().join(',')}`;
}

/** Three's BatchedMesh keeps its last draw list while per-item culling is off and no visibility changed. */
type BatchedCaster = Object3D & { isBatchedMesh?: boolean; perObjectFrustumCulled?: boolean; _visibilityChanged?: boolean };

type ShadowDrawable = Object3D & { geometry: BufferGeometry; material: Material | Material[] };

function isShadowDrawable(object: Object3D): object is ShadowDrawable {
  return ('isMesh' in object && object.isMesh === true)
    || ('isLine' in object && object.isLine === true)
    || ('isPoints' in object && object.isPoints === true);
}

/** A drawable's warm state, or null where it would submit nothing (no vertices, an empty range, no visible material). */
function warmCasterState(object: ShadowDrawable): CasterState | null {
  const { geometry, material } = object;
  const vertexCount = geometry.getAttribute('position')?.count ?? 0;
  const cornerCount = geometry.index?.count ?? vertexCount;
  const start = geometry.drawRange.start;
  const end = Math.min(start + geometry.drawRange.count, cornerCount);
  if (vertexCount <= 0 || end <= start) return null;
  const draws = Array.isArray(material)
    ? geometry.groups.some(group => material[group.materialIndex ?? 0]?.visible
      && Math.min(end, group.start + group.count) > Math.max(start, group.start))
    : material.visible;
  if (!draws) return null;
  const batched = object as BatchedCaster;
  return { object, castShadow: object.castShadow,
    receiveShadow: object.receiveShadow, frustumCulled: object.frustumCulled,
    perObjectCulled: batched.isBatchedMesh ? batched.perObjectFrustumCulled === true : null, vertexCount,
    variant: depthVariant(object) };
}

function collectWarmCasters(state: PrimeState, scene: Object3D): CasterState[] {
  const casters: CasterState[] = [];
  const vsm = state.shadowMap.type === VSMShadowMap;
  // (battle-spikes-253) The shadow router exposes the shadow-only proxies while the shadow map traverses: batch them with
  // the rest, or they sit in every batch and their own depth programs wait for a live frame (nav-perf's RockDepth).
  const casterMask = state.cameraMask | (1 << SHADOW_ONLY_LAYER);
  scene.traverseVisible(object => {
    if (!isShadowDrawable(object)) return;
    if (!(object.layers.mask & casterMask)) return;
    if (!object.castShadow && !(vsm && object.receiveShadow)) return;
    const caster = warmCasterState(object);
    if (caster) casters.push(caster);
  });
  return casters;
}

/**
 * (2026-10-27, the room-stalls lane) A near hull's real armour and running gear (nearVehicleShadowDetail.ts) cast only
 * inside the cascade pass that covers it, castShadow false outside it: the collection above never met them, and the
 * first live frame that framed the player's tank linked their depth programs (the 260 rooms census, both seats, traced
 * to their draws: gearRoadWheelTires, gearEndWheelBody and m1a3_ghillie_hull_net of rig_hull<tank_m1a3, each 34:8/7
 * from the Garage's light set; the 580-590 ms guard frame). Each visible detail mesh that brings a variant no caster
 * before it has joins the warm batches, casting inside its own batch's render only.
 */
/** A caster's depth variant with its materials' identities (addNearDetailCasters' skip key). */
function detailKey(caster: CasterState): string {
  const material = (caster.object as Object3D & { material?: Material | Material[] }).material;
  const materials = Array.isArray(material) ? material : material ? [material] : [];
  return `${caster.variant}|${materials.map((entry) => entry.uuid).join(',')}`;
}

function addNearDetailCasters(state: PrimeState, scene: Scene, casters: CasterState[]): Object3D[] {
  const casterMask = state.cameraMask | (1 << SHADOW_ONLY_LAYER);
  // (2026-10-27) a detail mesh is skipped only where a caster before it shares its variant AND its materials: the variant
  // reads what the caster shows of three's depth key, and two meshes alike in it still linked different programs (the
  // census of 0ce9681c30: gearRoadWheelTires skipped behind a sibling of its variant, then linked after the reveal);
  // a material in common makes the same depth material, so the rest of the key is the geometry's and the object's
  const seen = new Set(casters.map(detailKey));
  const listed = new Set(casters.map((caster) => caster.object));
  // (a detail mesh in a level its LOD holds hidden, gearTrackPadsSimplified<LOD among them: the level is shown inside each
  // batch render as a hidden root is, and its own casters join the list so they cast in their own batch only)
  const levels: Object3D[] = [];
  for (const root of scene.children) {
    const detail = root.visible ? vehicleShadowDetailOf(root) : null;
    if (!detail) continue;
    for (const mesh of detail.detail) {
      if (listed.has(mesh) || !isShadowDrawable(mesh) || !(mesh.layers.mask & casterMask)) continue;
      const hiddenLevels: Object3D[] = [];
      let shown = true;
      for (let node: Object3D | null = mesh; node && node !== root; node = node.parent) {
        if (node.visible) continue;
        if ((node.parent as (Object3D & { isLOD?: boolean }) | null)?.isLOD) { hiddenLevels.push(node); continue; }
        shown = false;
        break;
      }
      const caster = shown ? warmCasterState(mesh) : null;
      if (!caster || seen.has(detailKey(caster))) continue;
      seen.add(detailKey(caster));
      listed.add(mesh);
      casters.push({ ...caster, forceCast: true });
      for (const level of hiddenLevels) {
        if (levels.includes(level)) continue;
        levels.push(level);
        for (const other of withRootsShown([level], () => collectWarmCasters(state, level))) {
          if (!listed.has(other.object)) { listed.add(other.object); seen.add(detailKey(other)); casters.push(other); }
        }
      }
    }
  }
  return levels;
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
  // (one new depth-program variant a batch: depthVariant)
  const seen = new Set<string>();
  let newInBatch = false;
  for (let index = 0; index < casters.length; index++) {
    const vertices = casters[index]!.vertexCount;
    const fresh = !seen.has(casters[index]!.variant);
    if (index > start && (index - start >= maxCasters || vertexCount + vertices > maxVertices || (fresh && newInBatch))) {
      batches.push({ start, end: index, vertexCount });
      start = index;
      vertexCount = 0;
      newInBatch = false;
    }
    if (fresh) { seen.add(casters[index]!.variant); newInBatch = true; }
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
    cleanup.run(() => { prior.object.frustumCulled = prior.frustumCulled; });
    if (prior.perObjectCulled !== null) {
      cleanup.run(() => { (prior.object as BatchedCaster).perObjectFrustumCulled = prior.perObjectCulled!; });
    }
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
  for (const live of state.live) cleanup.run(() => { live.light.layers.mask = live.mask; });
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
    // (2026-10-27, the room-stalls lane; a diagnostic room census: the prime's camera on its own layer counted none of the
    // battle's 8 point lights, its hemisphere or the other cascades, and three keys every depth program by the light counts
    // of the render that builds it, so the first live frame built every caster variant again: the guard frame's 580 ms of
    // the player's depth programs) the live camera's lights stand on the prime layer as well: the forward pass still draws
    // nothing (no drawable is on that layer) and only the selected cascade renders its map (shadowMap.render below)
    for (const { light: other } of state.live) other.layers.enable(SHADOW_PRIME_LAYER);
    for (const cascade of state.lights) cascade.layers.enable(SHADOW_PRIME_LAYER);
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
      const object = casters[index]!.object;
      // (battle-spikes-253) The batch's own casters draw wherever they stand: a caster outside the first cascade's box
      // (the horizon ring, far vegetation, the baked prop buckets) otherwise links its depth program in the first live
      // frame that frames it, at the battle's light counts (nav-perf's program log, root-p: five such programs at 1.2 s).
      if (index >= start && index < end) {
        object.frustumCulled = false;
        if (casters[index]!.forceCast) object.castShadow = true;
        // a batched caster (the field boundary works) culls its items again inside its own shadow hook: all of them
        // outside the box submit nothing, so its depth program waited too. Rebuild its list with every item in it.
        if (casters[index]!.perObjectCulled) {
          const batched = object as BatchedCaster;
          batched.perObjectFrustumCulled = false;
          batched._visibilityChanged = true;
        }
        continue;
      }
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
  const hidden: Object3D[] = [];
  for (const root of options.hiddenRoots?.() ?? []) if (root && !root.visible) hidden.push(root);
  const casters = withRootsShown(hidden, () => collectWarmCasters(state, request.scene));
  hidden.push(...withRootsShown(hidden, () => addNearDetailCasters(state, request.scene, casters)));
  const batches = warmBatches(casters, options);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]!;
    const detail: ShadowCasterWarmBatch = { cascadeIndex: 0, batchIndex,
      casterCount: batch.end - batch.start, vertexCount: batch.vertexCount };
    assertPrimeCurrent(state, request);
    if (options.yieldBeforeBatch) await options.yieldBeforeBatch(detail);
    assertPrimeCurrent(state, request);
    const startedAt = performance.now();
    withRootsShown(hidden, () => renderWarmBatch(state, request.scene, target, casters, batch.start, batch.end));
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
 * cohorts visit only the first production cascade, without frustum culling, so
 * every visible caster's depth program compiles there; later cascades'
 * per-cascade state may still have first-use cost. The same complete cascades
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
