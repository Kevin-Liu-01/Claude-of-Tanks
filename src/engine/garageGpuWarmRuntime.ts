import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';
import {
  createFrameBudgetYielder,
  createOpaqueLoadingYielder,
  type WorkYielder,
} from './frameScheduler.ts';
import { warmSceneOffscreenBatched } from './offscreenWarm.ts';
import type {
  ForwardProgramWarmOwner,
  ForwardProgramWarmStats,
} from './programWarm.ts';

type WarmYield = WorkYielder;

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

interface ForwardProgramCompilePort {
  compile(root: Object3D): void;
}

type ForwardProgramRestorePort = Pick<
  ForwardProgramWarmOwner,
  'compile' | 'initializeSteps' | 'linkerBreathingSlices'
>;

interface GaragePostRenderPort {
  render(dt: number): void;
}

interface GaragePostWarmPort extends GaragePostRenderPort {
  warmFirstFrame(
    yieldBeforePass?: (label: string) => Promise<void>,
  ): Promise<Array<{ label: string; ms: number }>>;
}

export interface GarageGpuWarmTimings {
  postCompile?: number;
  shadowPassMax?: number;
  shadowPasses?: number[];
  sceneUpload?: number;
  sceneUploadMax?: number;
  sceneUploadBatches?: number[];
  postWarm?: number;
  postPassMax?: number;
  postPasses?: Array<{ label: string; ms: number }>;
}

export interface GarageGpuWarmOptions {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  lighting: GarageLightingWarmPort;
  forwardPrograms: ForwardProgramCompilePort;
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
  programWarmMs: number;
  programWarmSlices: number;
  programCompileMs: number;
  programCompileMaxMs: number;
  programCompileObject: string | null;
  linkerSlices: number;
  shadowPasses: number[];
  shadowPassMax: number;
  shadowCascadeCount: number;
  sceneUploadBatches: number[];
  sceneUploadMax: number;
  settleFrameMs: number;
}

export interface GarageGpuRestoreOptions {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  lighting: GarageLightingRestorePort;
  programRoot: Object3D;
  forwardPrograms: ForwardProgramRestorePort;
  post: GaragePostRenderPort;
  simDt: number;
  resourcesReleased: boolean;
  createYielder?: (budgetMs: number) => WarmYield;
  warmScene?: typeof warmSceneOffscreenBatched;
  now?: () => number;
}

const GARAGE_CRITICAL_SHADOW_CASCADES = 2;
const GARAGE_LINKER_BREATHING_SLICES = 8;

/**
 * Garage return is already covered by a fully painted transition. Yielding
 * back to the task queue keeps input, timers, and the transition watchdog
 * responsive without asking the saturated GPU for another animation frame
 * between every shader or shadow checkpoint. The exact post frame below is
 * still the sole reveal gate.
 */
function createGarageReturnYielder(budgetMs: number): WarmYield {
  return createOpaqueLoadingYielder(budgetMs, Number.POSITIVE_INFINITY);
}

async function drainWarmSteps(
  steps: Generator<void, void, void>,
  yieldGpu: WarmYield,
): Promise<number> {
  let slices = 0;
  for (const _ of steps) {
    slices += 1;
    await yieldGpu();
  }
  return slices;
}

/**
 * Restore evicted Garage resources without submitting one unbounded scene
 * frame. Shadow cascades and visible uploads are split into cooperative task
 * slices while the transition remains opaque, then the completed shadow maps
 * are frozen for the first presented Garage frame.
 */
export async function restoreGarageGpuPipeline({
  renderer,
  scene,
  camera,
  lighting,
  programRoot,
  forwardPrograms,
  post,
  simDt,
  resourcesReleased,
  createYielder = createGarageReturnYielder,
  warmScene = warmSceneOffscreenBatched,
  now = () => performance.now(),
}: GarageGpuRestoreOptions): Promise<GarageGpuRestoreReceipt> {
  const startedAt = now();
  const yieldGpu = createYielder(8);
  const programStats: ForwardProgramWarmStats = {};
  let programWarmSlices = 0;
  let linkerSlices = 0;
  let programWarmMs = 0;
  let shadowPasses: number[] = [];
  let sceneUploadBatches: number[] = [];
  let settleFrameMs = 0;

  lighting.setStaticPresentationDormant(false);
  try {
    lighting.update(true);
    const programWarmAt = now();
    try {
      programWarmSlices = await drainWarmSteps(
        forwardPrograms.initializeSteps(programRoot, programStats),
        yieldGpu,
      );
      linkerSlices = await drainWarmSteps(
        forwardPrograms.linkerBreathingSlices(GARAGE_LINKER_BREATHING_SLICES),
        yieldGpu,
      );
    } catch {
      // Scoped compile remains the compatibility fallback. The covered exact
      // frame below still proves every draw-time path before reveal.
      try { forwardPrograms.compile(programRoot); } catch { /* exact frame is fallback */ }
    }
    programWarmMs = Math.round(now() - programWarmAt);
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
    const settleFrameAt = now();
    post.render(simDt);
    settleFrameMs = Math.round(now() - settleFrameAt);
  } finally {
    lighting.setStaticPresentationDormant(true);
  }

  return {
    totalMs: Math.round(now() - startedAt),
    resourcesReleased,
    programWarmMs,
    programWarmSlices,
    programCompileMs: Math.round(programStats.totalCompileMs ?? 0),
    programCompileMaxMs: Math.round(programStats.maxCompileMs ?? 0),
    programCompileObject: programStats.maxCompileObject ?? null,
    linkerSlices,
    shadowPasses,
    shadowPassMax: Math.max(0, ...shadowPasses),
    shadowCascadeCount: shadowPasses.length,
    sceneUploadBatches,
    sceneUploadMax: Math.max(0, ...sceneUploadBatches),
    settleFrameMs,
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
