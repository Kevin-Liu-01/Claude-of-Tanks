import type { Camera, Object3D, Scene, WebGLRenderer } from 'three';
import {
  createFrameBudgetYielder,
  createOpaqueLoadingYielder,
  nextPaintFrame,
  type WorkYielder,
} from './frameScheduler.ts';
import { warmSceneOffscreenBatched } from './offscreenWarm.ts';
import { createGpuCatchUpGate } from './gpuCatchUp.ts';
import { ProgramUniformPreparationError } from './programWarm.ts';
import type { ProgramReceipt } from './programReceipt.ts';
import type {
  ForwardProgramCompileTiming,
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
  /** The same submission a slice at a time (programWarm.ts compileSceneSteps); the boot's warm prefers it. */
  compileSceneSteps?(options: { visibleRoot?: Object3D; sliceMs?: number }): Generator<void, void, void>;
  /** The compiled programs' first use between frames, hidden objects included (programWarm.ts prepareCompiledSteps). */
  prepareCompiledSteps?: ForwardProgramWarmOwner['prepareCompiledSteps'];
}

type ForwardProgramRestorePort = Pick<
  ForwardProgramWarmOwner,
  'compile' | 'initializeSteps' | 'linkerBreathingSlices'
>;

interface GaragePostRenderPort {
  render(dt: number): void;
}

interface GaragePostWarmPort extends GaragePostRenderPort {
  /** The live scene pass's MSAA sample count (post.msaaSamples). */
  readonly msaaSamples?: number;
  warmFirstFrame(
    yieldBeforePass?: (label: string) => Promise<void>,
  ): Promise<Array<{ label: string; ms: number }>>;
}

interface GarageGpuWarmTimings {
  postCompile?: number;
  postCompileSlices?: number;
  firstUse?: number;
  /** Programs first-used, and those already reflected, by the boot's first-use step; pending when its budget ended. */
  firstUsePrograms?: number;
  firstUseReused?: number;
  firstUsePending?: number;
  firstUseSlices?: number;
  shadowPassMax?: number;
  shadowPasses?: number[];
  sceneUpload?: number;
  sceneUploadMax?: number;
  sceneUploadBatches?: number[];
  postWarm?: number;
  postPassMax?: number;
  postPasses?: Array<{ label: string; ms: number }>;
  postLinkWait?: number;
}

interface GarageGpuWarmOptions {
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
  /** (2026-10-26, the boot census) Wait between frames until the submitted programs have linked (main.ts
   *  awaitRendererProgramLinks): the warm's renders and the Garage's first frame otherwise waited on them inside one
   *  task (1.4 s on a desktop, 11 s on a 4x phone, under the boot screen). */
  awaitProgramLinks?: (yieldForBudget: WarmYield) => Promise<void>;
}

export interface GarageGpuRestoreReceipt {
  totalMs: number;
  resourcesReleased: boolean;
  programWarmMs: number;
  programWarmSlices: number;
  programCompileMs: number;
  programCompileMaxMs: number;
  programCompileObject: string | null;
  programCohorts?: number;
  /** Completed cohort entries, including reused/disposed entries; not unique newly reflected shaders. */
  programsPrepared?: number;
  programCohortMax?: number;
  programBudgetSlices?: number;
  linkerSlices: number;
  shadowPasses: number[];
  shadowPassMax: number;
  shadowCascadeCount: number;
  sceneUploadBatches: number[];
  sceneUploadMax: number;
  settleFrameMs: number;
  /** Programs still linking when the readiness proof ran out of time; the covered settle frame linked them (2026-10-10). */
  programWarmDeferred?: number | null;
  /** LODs whose level was chosen for the Garage camera before the program warm (selectLodLevelsFor); absent with none */
  lodsSelected?: number;
  /** the link poll's completion queries: how many, the longest and their total (ms); absent when it asked none */
  linkerQueries?: { count: number; maxMs: number; totalMs: number };
  /**
   * (2026-10-27, the room-stalls lane) the programs linked after the program warm and the shadow prime: through the
   * restore's upload and settle draws and the Garage's first frames (main.ts fills it from onProgramsWarmed;
   * programReceipt.ts). 0 is the receipt: the rooms census's leave linked one program in the upload warm, 0.4-1.1 s.
   */
  lateLinks?: ProgramReceipt;
  /** the workshop dressing's chunks the covered restore finished before its program warm (main.ts); absent with none */
  dressingChunksFinished?: number;
  /** the shadow prime's caster warm batches (a program warm's restore only), and the frames the uploads waited for the GPU */
  shadowCasterBatches?: number;
  uploadCatchUpFrames?: number;
  /** objects whose program warm compile threw, and the first (programWarm's compileFailures); absent with none */
  programCompileFailures?: { count: number; first: string | null };
}

/**
 * (2026-10-26, the room-stalls lane) Every auto-updating LOD under `root` chooses its level for `camera`, as the next
 * frame drawn from that camera will. Leaving a room, the Garage restore warmed the hero's LOD levels as the battle's
 * camera last chose them; the first Garage frames switched them and made the close level's programs inside the frame
 * (the rooms census, the leave: gear suspension bosses, track pads, decor steel, turret cloth, decor canvas, 0.7-1.15 s
 * each on their links). Returns how many LODs chose.
 */
export function selectLodLevelsFor(root: Object3D, camera: Camera): number {
  if (typeof root.traverse !== 'function') return 0;
  camera.updateMatrixWorld?.();
  root.updateMatrixWorld?.();
  let selected = 0;
  root.traverse((object) => {
    const lod = object as Object3D & { isLOD?: boolean; autoUpdate?: boolean; update?(camera: Camera): void };
    if (lod.isLOD && lod.autoUpdate !== false && typeof lod.update === 'function') { lod.update(camera); selected += 1; }
  });
  return selected;
}

interface GarageGpuRestoreOptions {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  lighting: GarageLightingRestorePort;
  forwardPrograms: ForwardProgramRestorePort;
  post: GaragePostRenderPort;
  simDt: number;
  resourcesReleased: boolean;
  programsNeedWarm?: boolean;
  /**
   * (perf-246) False once the caller abandoned the restore — Battle Again over a Garage being prepared behind the
   * report. Checked after every program step, shadow cascade and upload batch; the settle frame never runs.
   */
  isCurrent?: () => boolean;
  createYielder?: (budgetMs: number) => WarmYield;
  /** GPU readiness needs frame/task progress, not a task-only polling loop. */
  yieldProgramReadiness?: () => Promise<void>;
  warmScene?: typeof warmSceneOffscreenBatched;
  now?: () => number;
  /**
   * The program warm and the shadow prime are done: every forward and depth program the Garage draws should exist from
   * here (the lateLinks receipt opens; the prime's own caster batches link the depth programs, a variant a batch).
   */
  onProgramsWarmed?: () => void;
}

/** The most frames an upload batch of a Garage restore waits for the GPU to catch up (half a second at 60 Hz). */
const UPLOAD_CATCH_UP_MAX_FRAMES = 30;

/** The restore's caller abandoned it (perf-246); never a reason to fall back to an unbounded compile. */
export class GarageRestoreAbandonedError extends Error {
  constructor() {
    super('The Garage restore was abandoned by its caller.');
    this.name = 'GarageRestoreAbandonedError';
  }
}

const GARAGE_CRITICAL_SHADOW_CASCADES = 2;
/**
 * (2026-10-26, the room-stalls lane: leaving a room for the Garage, four frames bound programs whose links were not done,
 * 670-923 ms each) the restore polls the links under the cover until every one reports done: the breathing slices end
 * the moment the last link completes (programWarm.ts linkerBreathingSlices), so this many frames (about 4 s) bounds only
 * a link that never reports, where the covered exact frame links it as before. Was 8, which let a deep queue's links
 * reach the Garage's frames.
 */
const GARAGE_LINKER_BREATHING_SLICES = 240;

/**
 * Garage return is already covered by a fully painted transition. Yielding
 * back to the task queue keeps input, timers, and the transition watchdog
 * responsive for bounded shadow/upload atoms. Shader readiness is separate:
 * it crosses a frame AND task boundary so a high-priority task loop cannot
 * exhaust the finite readiness guard before compositor/driver progress.
 * Neither yield is readiness evidence; KHR completion and the exact post
 * frame below remain the respective initialization/reveal gates.
 */
function createGarageReturnYielder(budgetMs: number): WarmYield {
  return createOpaqueLoadingYielder(budgetMs, Number.POSITIVE_INFINITY);
}

async function drainWarmSteps(
  steps: Generator<void, void, void>,
  yieldReadiness: () => Promise<void>,
  assertCurrent: () => void = () => {},
): Promise<number> {
  let slices = 0;
  for (const _ of steps) {
    slices += 1;
    await yieldReadiness();
    assertCurrent();
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
  forwardPrograms,
  post,
  simDt,
  resourcesReleased,
  programsNeedWarm = resourcesReleased,
  isCurrent,
  createYielder = createGarageReturnYielder,
  yieldProgramReadiness = nextPaintFrame,
  warmScene = warmSceneOffscreenBatched,
  now = () => performance.now(),
  onProgramsWarmed,
}: GarageGpuRestoreOptions): Promise<GarageGpuRestoreReceipt> {
  const startedAt = now();
  const assertCurrent = (): void => {
    if (isCurrent && !isCurrent()) throw new GarageRestoreAbandonedError();
  };
  const budgetYield = createYielder(8);
  const yieldGpu = async (): Promise<void> => {
    await budgetYield();
    assertCurrent();
  };
  const programStats: ForwardProgramWarmStats = {};
  let programWarmSlices = 0;
  let linkerSlices = 0;
  let programWarmMs = 0;
  let shadowPasses: number[] = [];
  let sceneUploadBatches: number[] = [];
  let settleFrameMs = 0;
  let programWarmDeferred: number | null | undefined;
  let shadowCasterBatches = 0;
  let uploadCatchUpFrames = 0;

  lighting.setStaticPresentationDormant(false);
  let lodsSelected = 0;
  const linkerTiming: ForwardProgramCompileTiming = {};
  try {
    lighting.update(true);
    // the levels the first Garage frame will draw, chosen before the warm prepares their programs (selectLodLevelsFor)
    lodsSelected = selectLodLevelsFor(scene, camera);
    // A changed hero can also change the Garage's material/light program set.
    // Residency alone is not a readiness proof for the background, fittings or
    // workshop vehicles. Prepare every visible draw against the real Garage
    // target before the exact settle frame; unchanged returns keep the fast path.
    if (programsNeedWarm) {
      const programWarmAt = now();
      try {
        programWarmSlices = await drainWarmSteps(
          forwardPrograms.initializeSteps(scene, programStats, { requireCompletion: true }),
          yieldProgramReadiness,
          assertCurrent,
        );
        linkerSlices = await drainWarmSteps(
          forwardPrograms.linkerBreathingSlices(GARAGE_LINKER_BREATHING_SLICES, linkerTiming),
          yieldProgramReadiness,
          assertCurrent,
        );
      } catch (error) {
        if (error instanceof GarageRestoreAbandonedError) throw error;
        // A failed readiness proof (a lost or replaced context, a failed query or reflection) is not permission to
        // force the same cold reflection in an unbounded fallback render.
        if (error instanceof ProgramUniformPreparationError && error.preparation.reason !== 'budget') throw error;
        // 2026-10-10 (prod 211: a refused network entry's Garage restore threw here under load, leaving the Garage
        // unready forever: every scene frame suppressed, the loader on, no Rejoin): a proof that only ran out of time is
        // slow, not broken. Scoped compile remains the compatibility fallback, and the covered exact frame below links
        // what is still pending under the opaque transition before reveal.
        if (error instanceof ProgramUniformPreparationError) programWarmDeferred = error.preparation.pending ?? null;
        try { forwardPrograms.compile(scene); } catch { /* exact frame is fallback */ }
      }
      programWarmMs = Math.round(now() - programWarmAt);
    }
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
        // (2026-10-27, the room-stalls lane) every visible caster's depth program at the Garage's light set, a batch at a
        // time under the cover, a new variant a batch (shadowPrime.ts): the rooms census's leave linked the dressing's
        // depth programs (the Leopard bay's removed road wheels, the T-90 gun assembly) in the Garage's first frames, past
        // the two cascades this prime renders. Most programs exist by then; the batches are wider than the entry's.
        ...(programsNeedWarm ? { casterWarmup: { maxCastersPerBatch: 24, maxVerticesPerBatch: 120_000,
          yieldBeforeBatch: async () => { shadowCasterBatches++; await yieldGpu(); } } } : {}),
      },
    );
    onProgramsWarmed?.();
    if (resourcesReleased || programsNeedWarm) {
      // (2026-10-27, the room-stalls lane) each upload batch waits, a frame at a time, until the GPU has done the commands
      // before the previous batch (gpuCatchUp.ts): behind a GPU process still building the links' pipelines, the rooms
      // census's leave held a batch's bufferData 919 ms. A GPU that keeps up costs no frame.
      const gl = renderer.getContext?.();
      const uploadGate = gl ? createGpuCatchUpGate(gl) : null;
      uploadGate?.beginDrain();
      try {
        sceneUploadBatches = await warmScene(renderer, scene, camera, {
          scale: 0.0625,
          maxObjects: 24,
          maxWeight: 90_000,
          yieldBeforeBatch: async () => {
            await yieldGpu();
            for (let frames = 0; uploadGate && frames < UPLOAD_CATCH_UP_MAX_FRAMES && !uploadGate.caughtUp(); frames++) {
              uploadCatchUpFrames++;
              await yieldProgramReadiness();
              assertCurrent();
            }
          },
        });
      } finally { uploadGate?.dispose(); }
    }
    assertCurrent();
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
    programCohorts: programStats.programCohorts ?? 0,
    programsPrepared: programStats.programsPrepared ?? 0,
    programCohortMax: programStats.programCohortMax ?? 0,
    programBudgetSlices: programStats.programBudgetSlices ?? 0,
    ...(shadowCasterBatches ? { shadowCasterBatches } : {}),
    ...(uploadCatchUpFrames ? { uploadCatchUpFrames } : {}),
    ...(programStats.compileFailures ? { programCompileFailures: { count: programStats.compileFailures,
      first: programStats.firstCompileFailure ?? null } } : {}),
    linkerSlices,
    shadowPasses,
    shadowPassMax: Math.max(0, ...shadowPasses),
    shadowCascadeCount: shadowPasses.length,
    sceneUploadBatches,
    sceneUploadMax: Math.max(0, ...sceneUploadBatches),
    settleFrameMs,
    ...(programWarmDeferred === undefined ? {} : { programWarmDeferred }),
    ...(lodsSelected ? { lodsSelected } : {}),
    ...(linkerTiming.queryCount ? { linkerQueries: { count: linkerTiming.queryCount,
      maxMs: Math.round(linkerTiming.maxQueryMs ?? 0), totalMs: Math.round(linkerTiming.queryMs ?? 0) } } : {}),
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
  awaitProgramLinks,
}: GarageGpuWarmOptions): Promise<void> {
  const yieldGpuFrame = createYielder(16);
  let pulse = 0;
  const yieldGpuWarm: WarmYield = async (force = false) => {
    reportProgress(Math.min(0.94, 0.04 + pulse++ * 0.035));
    return yieldGpuFrame(force);
  };
  // (2026-10-26, the boot census) the visible scene's submission a slice at a time when the owner can (one task of
  // 100-150 ms on a cold desktop otherwise), against the same production target
  const compileAt = now();
  let compileSlices = 0;
  try {
    if (forwardPrograms.compileSceneSteps) {
      for (const _ of forwardPrograms.compileSceneSteps({ visibleRoot: scene, sliceMs: 8 })) {
        compileSlices += 1;
        await yieldGpuWarm();
      }
    } else forwardPrograms.compile(scene);
  } catch { /* first real render is fallback */ }
  timings.postCompile = Math.round(now() - compileAt);
  timings.postCompileSlices = compileSlices;

  lighting.update(true);

  await yieldGpuWarm(true);
  if (awaitProgramLinks) {
    const linkAt = now();
    try { await awaitProgramLinks(yieldGpuWarm); } catch { /* the renders below wait for them as before */ }
    timings.postLinkWait = Math.round(now() - linkAt);
  }
  // (2026-10-26, the live 258 census and the boot ABBA) every compiled program's first use, between frames, hidden
  // objects included: the compile above reaches every LOD level of the hero, but the warm's draws below only the level
  // its camera selects. On a 4x phone the showroom's camera then framed another level, and the first live frames
  // first-used its ~20 programs (686 + 1144 ms); with a busy GPU process the warm's own upload draws first-used the
  // rest (24 at ~60 ms, each behind a GPU flush)
  if (forwardPrograms.prepareCompiledSteps) {
    const firstUseAt = now();
    const firstUseTiming: { uniformCount?: number; uniformReused?: number } = {};
    let firstUseSlices = 0;
    try {
      const steps = forwardPrograms.prepareCompiledSteps(scene, { timing: firstUseTiming });
      let step = steps.next();
      for (; !step.done; step = steps.next()) {
        firstUseSlices += 1;
        await yieldGpuWarm(true);
      }
      if (step.value.status !== 'complete') timings.firstUsePending = step.value.pending ?? -1;
    } catch { /* the draws below and the first frame remain the fallback */ }
    timings.firstUse = Math.round(now() - firstUseAt);
    timings.firstUseSlices = firstUseSlices;
    timings.firstUsePrograms = firstUseTiming.uniformCount ?? 0;
    timings.firstUseReused = firstUseTiming.uniformReused ?? 0;
  }
  const shadowPasses = await lighting.primeShadowMaps(
    renderer,
    scene,
    camera,
    { yieldBeforeCascade: async () => { await yieldGpuWarm(true); } },
  );
  timings.shadowPassMax = Math.max(0, ...shadowPasses);
  timings.shadowPasses = shadowPasses;

  const sceneUploadAt = now();
  // (2026-10-26, the boot census) every visible draw, whatever the warm camera frames, into a target with the scene
  // pass's samples: on the 4x phone the Garage's stage materials met their first use in the first live frames (764 and
  // 1194 ms, each first use ~55 ms behind a GPU flush) as the showroom's camera moved past the warm's framing
  const sceneUploadBatches = await warmScene(renderer, scene, camera, {
    maxObjects: 64,
    maxWeight: 240_000,
    uncull: true,
    samples: () => post.msaaSamples ?? 0,
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
  // the shadow and post passes made programs of their own: their links too, before the frame that binds them
  if (awaitProgramLinks) { try { await awaitProgramLinks(yieldGpuWarm); } catch { /* the frame waits for them as before */ } }
  post.render(simDt);
}
