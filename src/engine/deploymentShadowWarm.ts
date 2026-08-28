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
  warmDepthProgramSteps(): Generator<void, void, unknown>;
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

  const warmDepthProgramSteps = function* (): Generator<void, void, unknown> {
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

  const prime = async (
    yieldForBudget: BudgetYield | null = null,
  ): Promise<DeploymentShadowWarmReceipt> => {
    const lights = lighting.csm?.lights ?? [];
    if (!lights.length) return { cascades: 0, totalMs: 0, maxMs: 0 };
    const prior = lights.map((light) => ({
      shadow: light.shadow,
      autoUpdate: light.shadow.autoUpdate,
      needsUpdate: light.shadow.needsUpdate,
    }));
    const startedAt = now();
    const cascadeMs: number[] = [];
    const casterBatchMs: number[] = [];
    let geometryUploadMs = 0;
    let primed = false;
    let casterState: CasterState | null = null;
    try {
      camera.updateMatrixWorld(true);
      lighting.updateFov();
      noteFovPrimed((camera as Camera & { fov?: number }).fov ?? 0);
      lighting.update(true, simDt);
      for (const light of lights) {
        light.shadow.autoUpdate = false;
        light.shadow.needsUpdate = false;
      }

      const priorOverrideMaterial = scene.overrideMaterial;
      const geometryUploadAt = now();
      try {
        scene.overrideMaterial = uploadMaterial;
        warmRender();
      } finally {
        scene.overrideMaterial = priorOverrideMaterial;
      }
      geometryUploadMs = Math.round(now() - geometryUploadAt);
      if (yieldForBudget) await yieldForBudget(true);

      casterState = createCasterBatches(scene, camera);
      const firstLight = lights[0];
      for (const { object } of casterState.casters) object.castShadow = false;
      shadowOnlyCamera.layers.mask = camera.layers.mask;
      for (const batch of casterState.batches) {
        for (const object of batch) object.castShadow = true;
        firstLight.shadow.needsUpdate = true;
        const batchAt = now();
        shadowOnlyWarm();
        casterBatchMs.push(Math.round(now() - batchAt));
        firstLight.shadow.needsUpdate = false;
        for (const object of batch) object.castShadow = false;
        if (yieldForBudget) await yieldForBudget(true);
      }
      for (const { object } of casterState.casters) object.castShadow = true;

      for (const light of lights) {
        light.shadow.needsUpdate = true;
        const cascadeAt = now();
        shadowOnlyWarm();
        cascadeMs.push(Math.round(now() - cascadeAt));
        light.shadow.needsUpdate = false;
        if (yieldForBudget) await yieldForBudget(true);
      }
      lighting.preservePrimedCascadesForNextFrame();
      for (const { object, autoUpdate } of casterState.lods) object.autoUpdate = autoUpdate;
      primed = true;
    } finally {
      if (casterState) {
        for (const { object } of casterState.casters) object.castShadow = true;
        for (const { object, autoUpdate } of casterState.lods) object.autoUpdate = autoUpdate;
      }
      if (!primed) {
        for (const state of prior) {
          state.shadow.autoUpdate = state.autoUpdate;
          state.shadow.needsUpdate = state.needsUpdate;
        }
      }
    }
    return {
      cascades: cascadeMs.length,
      cascadeMs,
      maxMs: cascadeMs.length ? Math.max(...cascadeMs) : 0,
      casterCount: casterState?.casters.length ?? 0,
      casterBatches: casterBatchMs.length,
      casterBatchMs,
      casterBatchMaxMs: casterBatchMs.length ? Math.max(...casterBatchMs) : 0,
      geometryUploadMs,
      totalMs: Math.round(now() - startedAt),
    };
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
