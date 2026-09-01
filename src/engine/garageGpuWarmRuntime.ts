import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';
import { createFrameBudgetYielder } from './frameScheduler.ts';
import { warmSceneOffscreenBatched } from './offscreenWarm.ts';

type WarmYield = (force?: boolean) => Promise<unknown>;

interface ShadowPrimeOptions {
  yieldBeforeCascade?: ((index: number) => void | Promise<void>) | null;
  cascadeLimit?: number;
}

interface GarageLightingWarmPort {
  update(force?: boolean): void;
  primeShadowMaps(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    options?: ShadowPrimeOptions,
  ): Promise<number[]>;
}

interface GarageLightingRestorePort extends GarageLightingWarmPort {
  setStaticPresentationDormant(dormant: boolean): void;
}

interface ForwardProgramWarmPort {
  compile(root: Object3D): void;
}

interface GaragePostWarmPort {
  warmFirstFrame(
    yieldBeforePass?: (label: string) => Promise<void>,
  ): Promise<Array<{ label: string; ms: number }>>;
  render(dt: number): void;
}

export interface GarageGpuWarmTimings {
  [key: string]: unknown;
}

export interface GarageGpuWarmOptions {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  lighting: GarageLightingWarmPort;
  forwardPrograms: ForwardProgramWarmPort;
  post: GaragePostWarmPort;
  timings: GarageGpuWarmTimings;
  reportProgress(fraction: number): void;
  simDt: number;
  createYielder?: (budgetMs: number) => WarmYield;
  warmScene?: typeof warmSceneOffscreenBatched;
  now?: () => number;
}

export interface GarageGpuRestoreReceipt {
  totalMs: number;
  resourcesReleased: boolean;
  shadowPasses: number[];
  shadowPassMax: number;
  shadowCascadeCount: number;
  sceneUploadBatches: number[];
  sceneUploadMax: number;
}

export interface GarageGpuRestoreOptions {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  lighting: GarageLightingRestorePort;
  resourcesReleased: boolean;
  createYielder?: (budgetMs: number) => WarmYield;
  warmScene?: typeof warmSceneOffscreenBatched;
  now?: () => number;
}

const GARAGE_CRITICAL_SHADOW_CASCADES = 2;

/**
 * Restore evicted Garage resources without submitting one unbounded scene
 * frame. Shadow cascades and visible uploads are split into paintable slices
 * while the transition remains opaque, then the completed shadow maps are
 * frozen for the first presented Garage frame.
 */
export async function restoreGarageGpuPipeline({
  renderer,
  scene,
  camera,
  lighting,
  resourcesReleased,
  createYielder = createFrameBudgetYielder,
  warmScene = warmSceneOffscreenBatched,
  now = () => performance.now(),
}: GarageGpuRestoreOptions): Promise<GarageGpuRestoreReceipt> {
  const startedAt = now();
  const yieldGpu = createYielder(8);
  let shadowPasses: number[] = [];
  let sceneUploadBatches: number[] = [];

  lighting.setStaticPresentationDormant(false);
  try {
    lighting.update(true);
    shadowPasses = await lighting.primeShadowMaps(
      renderer,
      scene,
      camera,
      {
        // The enclosed showroom occupies only the two continuous near bands.
        // Lighting fails open to all cascades until its far depth maps exist,
        // so cold or context-restored sessions remain valid.
        cascadeLimit: GARAGE_CRITICAL_SHADOW_CASCADES,
        yieldBeforeCascade: async () => { await yieldGpu(); },
      },
    );
    if (resourcesReleased) {
      sceneUploadBatches = await warmScene(renderer, scene, camera, {
        scale: 0.0625,
        maxObjects: 24,
        maxWeight: 90_000,
        yieldBeforeBatch: async () => { await yieldGpu(); },
      });
    }
  } finally {
    lighting.setStaticPresentationDormant(true);
  }

  return {
    totalMs: Math.round(now() - startedAt),
    resourcesReleased,
    shadowPasses,
    shadowPassMax: Math.max(0, ...shadowPasses),
    shadowCascadeCount: shadowPasses.length,
    sceneUploadBatches,
    sceneUploadMax: Math.max(0, ...sceneUploadBatches),
  };
}

/**
 * Submit and upload the Garage through the exact production render path.
 *
 * Keeping this sequence in one typed owner prevents integration code from
 * accidentally compiling against the default sRGB framebuffer. The bounded
 * renders use Three's linear working space, matching SceneAAPass, and every
 * completed unit renews the first-visit progress watchdog.
 */
export async function warmGarageGpuPipeline({
  renderer,
  scene,
  camera,
  lighting,
  forwardPrograms,
  post,
  timings,
  reportProgress,
  simDt,
  createYielder = createFrameBudgetYielder,
  warmScene = warmSceneOffscreenBatched,
  now = () => performance.now(),
}: GarageGpuWarmOptions): Promise<void> {
  const compileAt = now();
  try { forwardPrograms.compile(scene); } catch { /* first real render is fallback */ }
  timings.postCompile = Math.round(now() - compileAt);

  lighting.update(true);
  const yieldGpuFrame = createYielder(16);
  let pulse = 0;
  const yieldGpuWarm: WarmYield = async (force = false) => {
    reportProgress(Math.min(0.94, 0.04 + pulse++ * 0.035));
    return yieldGpuFrame(force);
  };

  await yieldGpuWarm(true);
  const shadowPasses = await lighting.primeShadowMaps(
    renderer,
    scene,
    camera,
    { yieldBeforeCascade: async () => { await yieldGpuWarm(true); } },
  );
  timings.shadowPassMax = Math.max(0, ...shadowPasses);
  timings.shadowPasses = shadowPasses;

  const sceneUploadAt = now();
  const sceneUploadBatches = await warmScene(renderer, scene, camera, {
    maxObjects: 64,
    maxWeight: 240_000,
    yieldBeforeBatch: async () => { await yieldGpuWarm(); },
  });
  timings.sceneUpload = Math.round(now() - sceneUploadAt);
  timings.sceneUploadMax = Math.max(0, ...sceneUploadBatches);
  timings.sceneUploadBatches = sceneUploadBatches;

  const postWarmAt = now();
  const postPasses = await post.warmFirstFrame(async () => { await yieldGpuWarm(true); });
  timings.postWarm = Math.round(now() - postWarmAt);
  timings.postPassMax = Math.max(0, ...postPasses.map((pass) => pass.ms));
  timings.postPasses = postPasses;
  post.render(simDt);
}
