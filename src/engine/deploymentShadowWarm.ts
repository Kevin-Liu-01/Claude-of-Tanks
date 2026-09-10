import * as THREE from 'three';
import type {
  Camera,
  DirectionalLight,
  Material,
  Object3D,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { createOffscreenSceneWarmer, warmSceneOffscreenBatched, type OffscreenSceneWarmer } from './offscreenWarm.ts';
import { prepareDeploymentUploadPrograms, type DeploymentUploadProgramReceipt } from './deploymentUploadPrograms.ts';
import { nextPaintFrame } from './frameScheduler.ts';
import { renderShadowOnlyWarm, SHADOW_ONLY_LAYER } from './renderLayers.ts';

type BudgetYield = (covered?: boolean) => Promise<void>;
type WarmRender = (() => void) & { dispose?: () => void };

interface DeploymentLighting {
  csm?: { lights?: DirectionalLight[] | null } | null;
  updateFov(): void;
  update(force?: boolean, dt?: number): void;
  preservePrimedCascadesForNextFrame(): void;
}

interface CasterState {
  casters: Array<{ object: Object3D; weight: number }>;
  batches: Object3D[][];
  lods: Array<{ object: Object3D & { autoUpdate: boolean }; autoUpdate: boolean }>;
}

interface SavedShadowState {
  shadow: DirectionalLight['shadow'];
  autoUpdate: boolean;
  needsUpdate: boolean;
}

interface ShadowDrawSample {
  camera: 'shadow' | 'forward' | 'other';
  cameraId: number;
  objectId: number;
  objectName: string;
  objectType: string;
  materialUuid: string;
  materialName: string;
  materialType: string;
  customDepthMaterial: boolean;
  geometryId: number;
  vertices: number;
  indices: number;
  instances: number;
  groupStart: number | null;
  groupCount: number | null;
  programsBefore: number | null;
  programsAfter: number | null;
  elapsedMs: number | null;
}

interface ShadowRenderSample {
  phase: 'geometry-upload' | 'caster-batch' | 'cascade';
  index: number;
  available: boolean;
  unavailableReason?: 'missing-method' | 'unwrappable-method' | 'ownership-lost' | 'restore-failed';
  drawCount: number;
  drawsDropped: number;
  beforeFirstDrawMs: number | null;
  directDrawMs: number;
  residualMs: number | null;
  totalMs: number | null;
  programsBefore: number | null;
  programsAfter: number | null;
  draws: ShadowDrawSample[];
}

interface ShadowDrawAttribution {
  renderLimit: number;
  drawLimit: number;
  phaseLimits: Record<ShadowRenderSample['phase'], { renders: number; draws: number }>;
  rendersDropped: number;
  drawsDropped: number;
  renders: ShadowRenderSample[];
}

export interface DeploymentShadowWarmReceipt {
  cascades: number;
  cascadeMs?: number[];
  maxMs: number;
  casterCount?: number;
  casterBatches?: number;
  casterBatchMs?: number[];
  casterBatchMaxMs?: number;
  geometryUploadMs?: number;
  geometryUploadBatchMs?: number[];
  geometryUploadBatchMaxMs?: number;
  uploadProgramPreparation?: DeploymentUploadProgramReceipt;
  /** Warm-only CPU submission observations, never GPU duration or shader-cause proof. */
  drawAttribution?: ShadowDrawAttribution;
  totalMs: number;
}

export interface DeploymentShadowWarmOwner {
  warmDepthProgramSteps(): Generator<void, void, void>;
  prime(yieldForBudget?: BudgetYield | null): Promise<DeploymentShadowWarmReceipt>;
  dispose(): void;
}

export interface DeploymentShadowWarmOptions {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  lighting: DeploymentLighting;
  warmRender: (() => void) & Pick<OffscreenSceneWarmer, 'prepareProgramsSteps'>;
  getWorldGroup(): Object3D | null;
  noteFovPrimed(fov: number): void;
  simDt: number;
  now?: () => number;
  yieldProgramFrame?: () => Promise<void>;
  shadowOnlyWarmRender?: WarmRender;
}

type DirectDraw = WebGLRenderer['renderBufferDirect'];
type ObserveShadowWarm = (
  phase: ShadowRenderSample['phase'], index: number, light: DirectionalLight, render?: () => void,
) => void;
interface ShadowObservationContext {
  renderer: WebGLRenderer;
  shadowCamera: Camera;
  forwardCamera: Camera;
  now(): number;
}

function observationNow(now: () => number): number {
  try { return now(); } catch { return NaN; }
}

function elapsedObservation(start: number, end: number): number | null {
  const elapsed = end - start;
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
}

function observedProgramCount(renderer: WebGLRenderer): number | null {
  // Never call renderer.properties.get: it may allocate a material property bag.
  try { return renderer.info?.programs?.length ?? null; } catch { return null; }
}

function observeDrawIdentity(
  context: ShadowObservationContext,
  receiver: WebGLRenderer,
  [camera, , geometry, material, object, group]: Parameters<DirectDraw>,
): ShadowDrawSample | null {
  try {
    const caster = object as Object3D & { isInstancedMesh?: boolean; count?: number; customDepthMaterial?: Material };
    const instanced = geometry as THREE.BufferGeometry & { instanceCount?: number };
    return {
      camera: camera === context.shadowCamera ? 'shadow' : camera === context.forwardCamera ? 'forward' : 'other',
      cameraId: camera.id,
      objectId: object.id, objectName: object.name.slice(0, 120), objectType: object.type,
      materialUuid: material.uuid, materialName: material.name.slice(0, 120), materialType: material.type,
      customDepthMaterial: caster.customDepthMaterial === material,
      geometryId: geometry.id, vertices: geometry.attributes.position?.count ?? 0,
      indices: geometry.index?.count ?? 0,
      instances: caster.isInstancedMesh ? caster.count ?? 0 : instanced.instanceCount ?? 1,
      groupStart: group?.start ?? null, groupCount: group?.count ?? null,
      programsBefore: observedProgramCount(receiver), programsAfter: null, elapsedMs: null,
    };
  } catch { return null; } // Diagnostics cannot prevent the original submission.
}

function restoreObservedDirectDraw(
  renderer: WebGLRenderer,
  observed: DirectDraw,
  descriptor: PropertyDescriptor | undefined,
  sample: ShadowRenderSample,
): void {
  try {
    if (renderer.renderBufferDirect !== observed) {
      sample.available = false;
      sample.unavailableReason = 'ownership-lost';
      return;
    }
    if (descriptor) Object.defineProperty(renderer, 'renderBufferDirect', descriptor);
    else if (!Reflect.deleteProperty(renderer, 'renderBufferDirect')) {
      sample.available = false;
      sample.unavailableReason = 'restore-failed';
    }
  } catch {
    sample.available = false;
    sample.unavailableReason = 'restore-failed';
  } // Never replace the original render failure with a diagnostic failure.
}

function withObservedDirectDraws(
  context: ShadowObservationContext,
  sample: ShadowRenderSample,
  budget: { remaining: number },
  startedAt: number,
  render: () => void,
): void {
  const { renderer, now } = context;
  const original = renderer.renderBufferDirect;
  if (typeof original !== 'function') {
    sample.unavailableReason = 'missing-method';
    render();
    return;
  }
  const descriptor = Object.getOwnPropertyDescriptor(renderer, 'renderBufferDirect');
  const observed: DirectDraw = function (this: WebGLRenderer, ...args) {
    const enteredAt = observationNow(now);
    if (sample.drawCount++ === 0) sample.beforeFirstDrawMs = elapsedObservation(startedAt, enteredAt);
    const draw = budget.remaining > 0 ? observeDrawIdentity(context, this, args) : null;
    if (draw) { sample.draws.push(draw); budget.remaining--; }
    else sample.drawsDropped++;
    const drawStartedAt = observationNow(now);
    try { return original.apply(this, args); }
    finally {
      const elapsed = elapsedObservation(drawStartedAt, observationNow(now));
      sample.directDrawMs += elapsed ?? 0;
      if (draw) { draw.elapsedMs = elapsed; draw.programsAfter = observedProgramCount(this); }
    }
  };
  try {
    Object.defineProperty(renderer, 'renderBufferDirect', descriptor
      ? { ...descriptor, value: observed }
      : { value: observed, writable: true, configurable: true });
  } catch {
    sample.unavailableReason = 'unwrappable-method';
    render();
    return;
  }
  sample.available = true;
  try { render(); }
  finally { restoreObservedDirectDraw(renderer, observed, descriptor, sample); }
}

function observeShadowRender(
  context: ShadowObservationContext,
  attribution: ShadowDrawAttribution,
  budget: { remaining: number; rendersRemaining: number },
  phase: ShadowRenderSample['phase'],
  index: number,
  render: () => void,
): void {
  if (attribution.renders.length >= attribution.renderLimit || budget.rendersRemaining <= 0) {
    attribution.rendersDropped++;
    render();
    return;
  }
  budget.rendersRemaining--;
  const sample: ShadowRenderSample = {
    phase, index, available: false, drawCount: 0, drawsDropped: 0,
    beforeFirstDrawMs: null, directDrawMs: 0, residualMs: null, totalMs: null,
    programsBefore: observedProgramCount(context.renderer), programsAfter: null, draws: [],
  };
  attribution.renders.push(sample);
  const startedAt = observationNow(context.now);
  try { withObservedDirectDraws(context, sample, budget, startedAt, render); }
  finally {
    sample.totalMs = elapsedObservation(startedAt, observationNow(context.now));
    sample.programsAfter = observedProgramCount(context.renderer);
    attribution.drawsDropped += sample.drawsDropped;
    if (sample.available && sample.totalMs !== null) {
      sample.residualMs = Math.max(0, sample.totalMs - sample.directDrawMs - (sample.beforeFirstDrawMs ?? 0));
    }
  }
}

function ownsLight(root: Object3D): boolean {
  let result = false;
  root.traverse((object) => {
    if ((object as Object3D & { isLight?: boolean }).isLight) result = true;
  });
  return result;
}

function visibleContentRoots(scene: Scene): Object3D[] {
  const lightRoots = new Set(scene.children.filter(ownsLight));
  return scene.children.filter((candidate) =>
    candidate.visible !== false
      && !(candidate as Object3D & { isCamera?: boolean }).isCamera
      && !lightRoots.has(candidate));
}

function createCasterBatches(scene: Scene, camera: Camera): CasterState {
  const casters: CasterState['casters'] = [];
  const lods: CasterState['lods'] = [];
  // Match routeShadowOnlyLayer without exposing proxies to forward renders.
  // Otherwise omitted layer29 casters stay enabled in every warm cohort.
  const shadowLayerMask = camera.layers.mask | (1 << SHADOW_ONLY_LAYER);
  scene.traverseVisible((object) => {
    const candidate = object as Object3D & {
      isLOD?: boolean;
      isMesh?: boolean;
      isLine?: boolean;
      isPoints?: boolean;
      isInstancedMesh?: boolean;
      count?: number;
      autoUpdate?: boolean;
      geometry?: THREE.BufferGeometry;
      material?: Material | Material[];
      update?: (camera: Camera) => void;
    };
    if (candidate.isLOD) {
      try { candidate.update?.(camera); } catch { /* best-effort warm */ }
      const lod = candidate as typeof candidate & { autoUpdate: boolean };
      lods.push({ object: lod, autoUpdate: lod.autoUpdate });
      lod.autoUpdate = false;
    }
    if (!(candidate.isMesh || candidate.isLine || candidate.isPoints)
      || !candidate.castShadow
      || (candidate.layers.mask & shadowLayerMask) === 0) return;
    const materials = Array.isArray(candidate.material)
      ? candidate.material : [candidate.material];
    if (!materials.some((material) => material?.visible !== false)) return;
    const vertices = candidate.geometry?.index?.count
      || candidate.geometry?.attributes?.position?.count || 1;
    const instances = candidate.isInstancedMesh ? Math.max(1, candidate.count || 0) : 1;
    casters.push({ object: candidate, weight: vertices + instances * 16 + 2_000 });
  });

  const batches: Object3D[][] = [];
  let batch: Object3D[] = [];
  let weight = 0;
  for (const caster of casters) {
    if (batch.length && (batch.length >= 12 || weight + caster.weight > 45_000)) {
      batches.push(batch);
      batch = [];
      weight = 0;
    }
    batch.push(caster.object);
    weight += caster.weight;
  }
  if (batch.length) batches.push(batch);
  return { casters, batches, lods };
}

/**
 * Own the covered deployment CSM warm lifecycle.
 *
 * Every render uses the production scene, lights, casters, materials and
 * cascade maps. Temporary isolation only bounds first-use GPU work while the
 * opaque deployment transition owns presentation.
 */
export function createDeploymentShadowWarmOwner({
  renderer,
  scene,
  camera,
  lighting,
  warmRender,
  getWorldGroup,
  noteFovPrimed,
  simDt,
  now = () => performance.now(),
  yieldProgramFrame = nextPaintFrame,
  shadowOnlyWarmRender: injectedShadowWarm,
}: DeploymentShadowWarmOptions): DeploymentShadowWarmOwner {
  const shadowOnlyCamera = new THREE.PerspectiveCamera(1, 1, 0.5, 2);
  shadowOnlyCamera.position.set(100_000, 100_000, 100_000);
  shadowOnlyCamera.lookAt(100_000, 100_000, 100_001);
  shadowOnlyCamera.updateMatrixWorld(true);
  const nativeShadowWarm = injectedShadowWarm
    ?? createOffscreenSceneWarmer(renderer, scene, shadowOnlyCamera, 0.0625);
  const shadowOnlyWarm = injectedShadowWarm ?? Object.assign(
    () => renderShadowOnlyWarm(renderer, shadowOnlyCamera, nativeShadowWarm),
    { dispose: () => nativeShadowWarm.dispose?.() },
  );
  const uploadMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });
  uploadMaterial.name = 'DeploymentBufferUpload';
  let disposed = false;
  const disposedError = new Error('Deployment shadow warmer was disposed');

  const warmDepthProgramSteps = function* (): Generator<void, void, void> {
    const lights = lighting.csm?.lights ?? [];
    const light = lights[lights.length - 1];
    if (!light?.shadow) return;
    const siblingShadowState = [];
    for (const sibling of lights) {
      if (sibling === light || !sibling.shadow) continue;
      siblingShadowState.push({
        shadow: sibling.shadow,
        autoUpdate: sibling.shadow.autoUpdate,
      });
      sibling.shadow.autoUpdate = false;
      sibling.shadow.needsUpdate = false;
    }
    const shadowCamera = light.shadow.camera as OrthographicCamera;
    const saved = {
      left: shadowCamera.left,
      right: shadowCamera.right,
      top: shadowCamera.top,
      bottom: shadowCamera.bottom,
      near: shadowCamera.near,
      far: shadowCamera.far,
      autoUpdate: light.shadow.autoUpdate,
    };
    shadowCamera.left = -520;
    shadowCamera.right = 520;
    shadowCamera.top = 520;
    shadowCamera.bottom = -520;
    shadowCamera.near = 0.5;
    shadowCamera.far = 1_600;
    shadowCamera.updateProjectionMatrix();
    light.shadow.autoUpdate = false;

    const roots = visibleContentRoots(scene);
    const renderRoot = (root: Object3D, visibleChildren: Set<Object3D> | null = null): void => {
      const hiddenRoots: Object3D[] = [];
      const hiddenChildren: Object3D[] = [];
      for (const candidate of roots) {
        if (candidate === root || candidate.visible === false) continue;
        candidate.visible = false;
        hiddenRoots.push(candidate);
      }
      if (visibleChildren) {
        for (const child of root.children) {
          if (visibleChildren.has(child) || child.visible === false) continue;
          child.visible = false;
          hiddenChildren.push(child);
        }
      }
      try {
        light.shadow.needsUpdate = true;
        warmRender();
      } catch {
        // The following live shadow render remains the compatibility fallback.
      } finally {
        for (const child of hiddenChildren) child.visible = true;
        for (const candidate of hiddenRoots) candidate.visible = true;
      }
    };

    try {
      const worldGroup = getWorldGroup();
      for (const root of roots) {
        if (root === worldGroup && root.children.length > 1) {
          const visible = root.children.filter((child) => child.visible !== false);
          const cohortSize = Math.max(1, Math.ceil(visible.length / 4));
          for (let index = 0; index < visible.length; index += cohortSize) {
            renderRoot(root, new Set(visible.slice(index, index + cohortSize)));
            yield;
          }
        } else {
          renderRoot(root);
          yield;
        }
      }
    } finally {
      shadowCamera.left = saved.left;
      shadowCamera.right = saved.right;
      shadowCamera.top = saved.top;
      shadowCamera.bottom = saved.bottom;
      shadowCamera.near = saved.near;
      shadowCamera.far = saved.far;
      shadowCamera.updateProjectionMatrix();
      light.shadow.autoUpdate = saved.autoUpdate;
      light.shadow.needsUpdate = true;
      for (const state of siblingShadowState) {
        state.shadow.autoUpdate = state.autoUpdate;
        state.shadow.needsUpdate = true;
      }
    }
  };

  async function yieldCovered(yieldForBudget: BudgetYield | null): Promise<void> {
    if (disposed) throw disposedError;
    if (yieldForBudget) await yieldForBudget(true);
    if (disposed) throw disposedError;
  }

  function primeLighting(lights: readonly DirectionalLight[]): void {
    camera.updateMatrixWorld(true);
    lighting.updateFov();
    noteFovPrimed((camera as Camera & { fov?: number }).fov ?? 0);
    lighting.update(true, simDt);
    for (const light of lights) {
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = false;
    }
  }

  async function uploadDeploymentGeometry(
    observeRender: ObserveShadowWarm, light: DirectionalLight, yieldForBudget: BudgetYield | null,
  ): Promise<{ batchMs: number[]; preparation: DeploymentUploadProgramReceipt }> {
    let index = 0;
    let preparation!: DeploymentUploadProgramReceipt;
    // Use the existing production-object batch selector: layers isolate a draw
    // without pruning nested meshes, and are restored before yielding. A single
    // buffer upload is still atomic; this bounds cohorts, not native GL latency.
    const batchMs = await warmSceneOffscreenBatched(renderer, scene, camera, {
      maxObjects: 12,
      maxWeight: 45_000,
      async prepareObjects(objects) {
        preparation = await prepareDeploymentUploadPrograms(objects, uploadMaterial,
          warmRender, () => yieldCovered(yieldForBudget), now, yieldProgramFrame);
      },
      yieldBeforeBatch: () => yieldCovered(yieldForBudget),
      renderBatch() {
        const priorOverrideMaterial = scene.overrideMaterial;
        try {
          scene.overrideMaterial = uploadMaterial;
          observeRender('geometry-upload', index++, light, warmRender);
        } finally {
          scene.overrideMaterial = priorOverrideMaterial;
        }
      },
    });
    return { batchMs, preparation };
  }

  async function warmCasterBatches(
    state: CasterState,
    firstLight: DirectionalLight,
    yieldForBudget: BudgetYield | null,
    observeRender: ObserveShadowWarm,
  ): Promise<number[]> {
    const batchTimes: number[] = [];
    for (const { object } of state.casters) object.castShadow = false;
    shadowOnlyCamera.layers.mask = camera.layers.mask;
    for (const batch of state.batches) {
      for (const object of batch) object.castShadow = true;
      firstLight.shadow.needsUpdate = true;
      const startedAt = now();
      observeRender('caster-batch', batchTimes.length, firstLight);
      batchTimes.push(Math.round(now() - startedAt));
      firstLight.shadow.needsUpdate = false;
      for (const object of batch) object.castShadow = false;
      await yieldCovered(yieldForBudget);
    }
    for (const { object } of state.casters) object.castShadow = true;
    return batchTimes;
  }

  async function warmCascades(
    lights: readonly DirectionalLight[],
    yieldForBudget: BudgetYield | null,
    observeRender: ObserveShadowWarm,
  ): Promise<number[]> {
    const cascadeTimes: number[] = [];
    for (const light of lights) {
      light.shadow.needsUpdate = true;
      const startedAt = now();
      observeRender('cascade', cascadeTimes.length, light);
      cascadeTimes.push(Math.round(now() - startedAt));
      light.shadow.needsUpdate = false;
      await yieldCovered(yieldForBudget);
    }
    return cascadeTimes;
  }

  function restoreCasterState(state: CasterState): void {
    for (const { object } of state.casters) object.castShadow = true;
    for (const { object, autoUpdate } of state.lods) object.autoUpdate = autoUpdate;
  }

  function restoreShadowState(states: readonly SavedShadowState[]): void {
    for (const state of states) {
      state.shadow.autoUpdate = state.autoUpdate;
      state.shadow.needsUpdate = state.needsUpdate;
    }
  }

  function warmReceipt(
    startedAt: number,
    cascadeMs: number[],
    casterBatchMs: number[],
    casterState: CasterState,
    geometryUploadBatchMs: number[],
    drawAttribution: ShadowDrawAttribution,
  ): DeploymentShadowWarmReceipt {
    return {
      cascades: cascadeMs.length,
      cascadeMs,
      maxMs: cascadeMs.length ? Math.max(...cascadeMs) : 0,
      casterCount: casterState.casters.length,
      casterBatches: casterBatchMs.length,
      casterBatchMs,
      casterBatchMaxMs: casterBatchMs.length ? Math.max(...casterBatchMs) : 0,
      geometryUploadMs: geometryUploadBatchMs.reduce((sum, elapsed) => sum + elapsed, 0),
      geometryUploadBatchMs,
      geometryUploadBatchMaxMs: Math.max(0, ...geometryUploadBatchMs),
      drawAttribution,
      totalMs: Math.round(now() - startedAt),
    };
  }

  const prime = async (
    yieldForBudget: BudgetYield | null = null,
  ): Promise<DeploymentShadowWarmReceipt> => {
    const lights = lighting.csm?.lights ?? [];
    if (!lights.length) return { cascades: 0, totalMs: 0, maxMs: 0 };
    const prior: SavedShadowState[] = lights.map((light) => ({
      shadow: light.shadow,
      autoUpdate: light.shadow.autoUpdate,
      needsUpdate: light.shadow.needsUpdate,
    }));
    const startedAt = now();
    let geometryUploadBatchMs: number[] = [];
    let uploadProgramPreparation: DeploymentUploadProgramReceipt | undefined;
    let primed = false;
    let casterState: CasterState | null = null;
    let cascadeMs: number[] = [];
    let casterBatchMs: number[] = [];
    const drawAttribution: ShadowDrawAttribution = {
      renderLimit: 64, drawLimit: 256,
      phaseLimits: { 'geometry-upload': { renders: 32, draws: 128 },
        'caster-batch': { renders: 24, draws: 96 }, cascade: { renders: 8, draws: 32 } },
      rendersDropped: 0, drawsDropped: 0, renders: [],
    };
    // Large worlds can need >100 upload cohorts. Reserve diagnostics for the
    // later shadow passes instead of letting uploads consume their evidence.
    const drawBudgets = {
      'geometry-upload': { remaining: 128, rendersRemaining: 32 },
      'caster-batch': { remaining: 96, rendersRemaining: 24 },
      cascade: { remaining: 32, rendersRemaining: 8 },
    };
    const observeRender: ObserveShadowWarm = (phase, index, light, render = shadowOnlyWarm) => {
      observeShadowRender({ renderer, now, shadowCamera: light.shadow.camera,
        forwardCamera: phase === 'geometry-upload' ? camera : shadowOnlyCamera },
      drawAttribution, drawBudgets[phase], phase, index, render);
    };
    try {
      primeLighting(lights);
      const upload = await uploadDeploymentGeometry(observeRender, lights[0], yieldForBudget);
      geometryUploadBatchMs = upload.batchMs;
      uploadProgramPreparation = upload.preparation;
      await yieldCovered(yieldForBudget);
      casterState = createCasterBatches(scene, camera);
      casterBatchMs = await warmCasterBatches(casterState, lights[0], yieldForBudget, observeRender);
      cascadeMs = await warmCascades(lights, yieldForBudget, observeRender);
      lighting.preservePrimedCascadesForNextFrame();
      restoreCasterState(casterState);
      primed = true;
    } finally {
      if (casterState) restoreCasterState(casterState);
      if (!primed) restoreShadowState(prior);
    }
    return { ...warmReceipt(startedAt, cascadeMs, casterBatchMs, casterState, geometryUploadBatchMs, drawAttribution),
      uploadProgramPreparation };
  };

  return {
    warmDepthProgramSteps,
    prime,
    dispose() {
      if (disposed) return;
      disposed = true;
      shadowOnlyWarm.dispose?.();
      uploadMaterial.dispose();
    },
  };
}
