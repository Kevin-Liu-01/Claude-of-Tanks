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
import { createOffscreenSceneWarmer } from './offscreenWarm.ts';

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

export interface DeploymentShadowWarmReceipt {
  cascades: number;
  cascadeMs?: number[];
  maxMs: number;
  casterCount?: number;
  casterBatches?: number;
  casterBatchMs?: number[];
  casterBatchMaxMs?: number;
  geometryUploadMs?: number;
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
  warmRender: () => void;
  getWorldGroup(): Object3D | null;
  noteFovPrimed(fov: number): void;
  simDt: number;
  now?: () => number;
  shadowOnlyWarmRender?: WarmRender;
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
      || !candidate.layers.test(camera.layers)) return;
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
  shadowOnlyWarmRender: injectedShadowWarm,
}: DeploymentShadowWarmOptions): DeploymentShadowWarmOwner {
  const shadowOnlyCamera = new THREE.PerspectiveCamera(1, 1, 0.5, 2);
  shadowOnlyCamera.position.set(100_000, 100_000, 100_000);
  shadowOnlyCamera.lookAt(100_000, 100_000, 100_001);
  shadowOnlyCamera.updateMatrixWorld(true);
  const shadowOnlyWarm = injectedShadowWarm
    ?? createOffscreenSceneWarmer(renderer, scene, shadowOnlyCamera, 0.0625);
  const uploadMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });
  uploadMaterial.name = 'DeploymentBufferUpload';

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
    if (yieldForBudget) await yieldForBudget(true);
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

  function uploadDeploymentGeometry(): number {
    const priorOverrideMaterial = scene.overrideMaterial;
    const startedAt = now();
    try {
      scene.overrideMaterial = uploadMaterial;
      warmRender();
    } finally {
      scene.overrideMaterial = priorOverrideMaterial;
    }
    return Math.round(now() - startedAt);
  }

  async function warmCasterBatches(
    state: CasterState,
    firstLight: DirectionalLight,
    yieldForBudget: BudgetYield | null,
  ): Promise<number[]> {
    const batchTimes: number[] = [];
    for (const { object } of state.casters) object.castShadow = false;
    shadowOnlyCamera.layers.mask = camera.layers.mask;
    for (const batch of state.batches) {
      for (const object of batch) object.castShadow = true;
      firstLight.shadow.needsUpdate = true;
      const startedAt = now();
      shadowOnlyWarm();
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
  ): Promise<number[]> {
    const cascadeTimes: number[] = [];
    for (const light of lights) {
      light.shadow.needsUpdate = true;
      const startedAt = now();
      shadowOnlyWarm();
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
    geometryUploadMs: number,
  ): DeploymentShadowWarmReceipt {
    return {
      cascades: cascadeMs.length,
      cascadeMs,
      maxMs: cascadeMs.length ? Math.max(...cascadeMs) : 0,
      casterCount: casterState.casters.length,
      casterBatches: casterBatchMs.length,
      casterBatchMs,
      casterBatchMaxMs: casterBatchMs.length ? Math.max(...casterBatchMs) : 0,
      geometryUploadMs,
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
    let geometryUploadMs = 0;
    let primed = false;
    let casterState: CasterState | null = null;
    let cascadeMs: number[] = [];
    let casterBatchMs: number[] = [];
    try {
      primeLighting(lights);
      geometryUploadMs = uploadDeploymentGeometry();
      await yieldCovered(yieldForBudget);
      casterState = createCasterBatches(scene, camera);
      casterBatchMs = await warmCasterBatches(casterState, lights[0], yieldForBudget);
      cascadeMs = await warmCascades(lights, yieldForBudget);
      lighting.preservePrimedCascadesForNextFrame();
      restoreCasterState(casterState);
      primed = true;
    } finally {
      if (casterState) restoreCasterState(casterState);
      if (!primed) restoreShadowState(prior);
    }
    return warmReceipt(startedAt, cascadeMs, casterBatchMs, casterState, geometryUploadMs);
  };

  return {
    warmDepthProgramSteps,
    prime,
    dispose() {
      shadowOnlyWarm.dispose?.();
      uploadMaterial.dispose();
    },
  };
}
