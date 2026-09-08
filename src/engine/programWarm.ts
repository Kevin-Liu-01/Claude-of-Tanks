import { Object3D } from 'three';
import type {
  Camera,
  Material,
  Scene,
  Texture,
  WebGLProgram as ThreeWebGLProgram,
  WebGLRenderTarget,
} from 'three';

type WarmYield = () => Promise<void>;

type LinkedProgram = Pick<ThreeWebGLProgram, 'getUniforms' | 'program'>;

interface RendererProgramInfo {
  programs?: readonly LinkedProgram[] | null;
}

export interface RendererWithPrograms {
  info?: RendererProgramInfo | null;
}

type RenderTarget = WebGLRenderTarget | WebGLRenderTarget<Texture[]> | null;

type ForwardWarmObject = Object3D & {
  isMesh?: boolean;
  isPoints?: boolean;
  isLine?: boolean;
  isSprite?: boolean;
};

interface ParallelShaderCompileExtension {
  COMPLETION_STATUS_KHR: number;
}

function isWebGLProgram(value: ThreeWebGLProgram['program']): value is WebGLProgram {
  return typeof value === 'object' && value !== null;
}

function firstPendingProgram(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  completionToken: number,
  programs: readonly LinkedProgram[],
  cursor: number,
  timing: ForwardProgramCompileTiming | undefined,
  now: () => number,
  existingPrograms?: ReadonlySet<LinkedProgram>,
): number {
  for (; cursor < programs.length; cursor += 1) {
    const program = programs[cursor]?.program;
    if (!isWebGLProgram(program)) continue;
    const queryAt = timing ? diagnosticNow(now) : NaN;
    let pending = false;
    try { pending = gl.getProgramParameter(program, completionToken) === false; }
    finally {
      if (timing) {
        const elapsed = diagnosticNow(now) - queryAt;
        recordCompileTiming(timing, 'queryMs', elapsed);
        recordCompileTiming(timing, 'maxQueryMs', elapsed, 'max');
        recordCompileTiming(timing, 'queryCount', 1);
        recordQueryCohort(timing, elapsed, existingPrograms?.has(programs[cursor]));
      }
    }
    if (pending) break;
  }
  return cursor;
}

interface ForwardWarmRenderer extends RendererWithPrograms, RendererWithTargets {
  getContext(): WebGLRenderingContext | WebGL2RenderingContext;
}

export interface ForwardProgramWarmStats {
  totalCompileMs?: number;
  maxCompileMs?: number;
  maxCompileObject?: string;
}

/** Opt-in numeric receipts; durations and counts accumulate without naming scene objects. */
export interface ForwardProgramCompileTiming {
  targetBindMs?: number;
  submissionMs?: number;
  maxSubmissionMs?: number;
  submissionSlices?: number;
  targetRestoreMs?: number;
  programsBefore?: number;
  programsAfter?: number;
  extensionMs?: number;
  queryMs?: number;
  maxQueryMs?: number;
  queryCount?: number;
  // Cohorts record membership before scene preparation, not readiness or GPU
  // compilation cost. Earlier calls may pay queued work from later programs;
  // programs added by other rendering between yields also count as new.
  existingQueryMs?: number;
  maxExistingQueryMs?: number;
  existingQueryCount?: number;
  newQueryMs?: number;
  maxNewQueryMs?: number;
  newQueryCount?: number;
  pollMs?: number;
  maxPollMs?: number;
  /** Synchronous linker rounds, including initial context/extension setup. */
  pollCount?: number;
  yields?: number;
}

export interface ForwardProgramWarmOwner {
  compile(root: Object3D, timing?: ForwardProgramCompileTiming): void;
  compileSceneSteps(options?: SceneProgramCompileOptions): Generator<void, void, void>;
  prepareSceneSteps(options?: SceneProgramCompileOptions): Generator<void, void, void>;
  initializeSteps(
    root?: Object3D,
    stats?: ForwardProgramWarmStats | null,
  ): Generator<void, void, void>;
  linkerBreathingSlices(maxSlices: number, timing?: ForwardProgramCompileTiming,
    signal?: AbortSignal, existingPrograms?: ReadonlySet<LinkedProgram>): Generator<void, void, void>;
  invalidate(): void;
}

export interface SceneProgramCompileOptions {
  signal?: AbortSignal;
  timing?: ForwardProgramCompileTiming;
  sliceMs?: number;
}

export interface ForwardProgramWarmOptions {
  renderer: ForwardWarmRenderer;
  scene: Scene;
  camera: Camera;
  getTarget(): RenderTarget;
  now?: () => number;
}

interface RendererWithTargets extends RendererWithPrograms {
  getRenderTarget(): RenderTarget;
  getActiveCubeFace?(): number;
  getActiveMipmapLevel?(): number;
  setRenderTarget(target: RenderTarget, activeCubeFace?: number, activeMipmapLevel?: number): void;
  compile(root: Object3D, camera: Camera, targetScene?: Scene | null): Set<Material>;
}

export interface ProgramUniformWarmReceipt {
  programs: number;
  totalMs: number;
  maxMs: number;
  failures: number;
}

export interface TargetCompileOptions {
  renderer: RendererWithTargets;
  root: Object3D;
  camera: Camera;
  targetScene?: Scene | null;
  target?: RenderTarget;
  timing?: ForwardProgramCompileTiming;
  now?: () => number;
}

function diagnosticNow(now: () => number): number {
  try { return now(); } catch { return NaN; }
}

function recordCompileTiming(
  timing: ForwardProgramCompileTiming | undefined,
  field: keyof ForwardProgramCompileTiming,
  value: number,
  mode: 'add' | 'max' | 'set' = 'add',
): void {
  if (!timing || !Number.isFinite(value) || value < 0) return;
  try {
    const previous = timing[field];
    const prior = typeof previous === 'number' && Number.isFinite(previous) && previous >= 0 ? previous : 0;
    const result = mode === 'set' ? value : mode === 'max' ? Math.max(prior, value) : prior + value;
    if (Number.isFinite(result)) timing[field] = result;
  } catch { /* Optional diagnostics cannot interrupt shader warming or restoration. */ }
}

function measureCompileOperation<Result>(
  timing: ForwardProgramCompileTiming | undefined,
  field: 'targetBindMs' | 'submissionMs' | 'targetRestoreMs' | 'extensionMs',
  now: () => number,
  run: () => Result,
): Result {
  if (!timing) return run();
  const startedAt = diagnosticNow(now);
  try { return run(); }
  finally { recordCompileTiming(timing, field, diagnosticNow(now) - startedAt); }
}

function recordQueryCohort(
  timing: ForwardProgramCompileTiming,
  elapsed: number,
  existing: boolean | undefined,
): void {
  if (existing === undefined) return;
  recordCompileTiming(timing, existing ? 'existingQueryMs' : 'newQueryMs', elapsed);
  recordCompileTiming(timing, existing ? 'maxExistingQueryMs' : 'maxNewQueryMs', elapsed, 'max');
  recordCompileTiming(timing, existing ? 'existingQueryCount' : 'newQueryCount', 1);
}

function recordProgramCount(
  renderer: RendererWithPrograms,
  timing: ForwardProgramCompileTiming | undefined,
  field: 'programsBefore' | 'programsAfter',
): void {
  if (!timing) return;
  try { recordCompileTiming(timing, field, renderer.info?.programs?.length ?? 0, 'set'); }
  catch { /* A diagnostic program count cannot change compile behavior. */ }
}

function isForwardRenderable(object: Object3D): boolean {
  const renderable = object as ForwardWarmObject;
  return !!(renderable.isMesh || renderable.isPoints || renderable.isLine || renderable.isSprite);
}

/**
 * A compile-only traversal view, never inserted into the scene. Native compile
 * visits all descendants (including hidden variants), but gets its lights,
 * environment and fog from the real target scene. Original objects retain their
 * parents, transforms and material identities throughout every checkpoint.
 */
function* compileSceneProgramSteps(
  options: ForwardProgramWarmOptions,
  isCurrent: () => boolean,
  { signal, timing, sliceMs = 8 }: SceneProgramCompileOptions,
): Generator<void, void, void> {
  signal?.throwIfAborted();
  const { renderer, scene, camera, getTarget, now = () => performance.now() } = options;
  const info = renderer.info;
  const gl = renderer.getContext();
  const valid = (): boolean => {
    signal?.throwIfAborted();
    return isCurrent() && renderer.info === info && !gl.isContextLost();
  };
  if (!valid()) return;
  const objects: Object3D[] = [];
  const facade = new Object3D();
  let start = 0;
  let end = 0;
  facade.traverseVisible = () => {}; // No additional lights beyond targetScene.
  facade.traverse = (visit) => {
    for (let index = start; index < end; index += 1) visit(objects[index]);
  };
  const before = renderer.info?.programs?.length ?? 0;
  recordCompileTiming(timing, 'programsAfter', before, 'set');
  const budget = Number.isFinite(sliceMs) ? Math.max(1, Math.min(16, sliceMs)) : 8;
  try {
    scene.traverse((object) => { if (isForwardRenderable(object)) objects.push(object); });
    let sliceAt = diagnosticNow(now);
    let submitted = 0;
    while (start < objects.length && valid()) {
      end = Math.min(start + 16, objects.length);
      compileForRenderTarget({ renderer, root: facade, camera, targetScene: scene,
        target: getTarget(), timing, now });
      submitted += end - start;
      start = end;
      // Abort only after native compile exits and restores the render target.
      if (!valid()) return;
      if (start === objects.length || diagnosticNow(now) - sliceAt >= budget || submitted >= 256) {
        recordCompileTiming(timing, 'maxSubmissionMs', diagnosticNow(now) - sliceAt, 'max');
        recordCompileTiming(timing, 'submissionSlices', 1);
        if (start < objects.length) yield;
        sliceAt = diagnosticNow(now);
        submitted = 0;
      }
    }
  } finally {
    objects.length = 0;
    start = end = 0;
    recordCompileTiming(timing, 'programsBefore', before, 'set');
  }
}

/**
 * Compile a subtree against the render target used by the eventual scene pass.
 *
 * Three includes the target color-space path in its program key. Compiling
 * against the default framebuffer therefore cannot warm an EffectComposer's
 * linear HDR variants. The caller's complete target state is restored even
 * when a driver rejects the compile.
 */
export function compileForRenderTarget({
  renderer,
  root,
  camera,
  targetScene,
  target = null,
  timing,
  now = () => performance.now(),
}: TargetCompileOptions): void {
  const priorTarget = renderer.getRenderTarget();
  const priorFace = renderer.getActiveCubeFace?.() ?? 0;
  const priorMip = renderer.getActiveMipmapLevel?.() ?? 0;
  recordProgramCount(renderer, timing, 'programsBefore');
  try {
    if (target) measureCompileOperation(timing, 'targetBindMs', now, () => renderer.setRenderTarget(target));
    measureCompileOperation(timing, 'submissionMs', now, () => renderer.compile(root, camera, targetScene));
  } finally {
    try {
      measureCompileOperation(timing, 'targetRestoreMs', now,
        () => renderer.setRenderTarget(priorTarget, priorFace, priorMip));
    } finally { recordProgramCount(renderer, timing, 'programsAfter'); }
  }
}

/** Capture the programs that were already resident before a scoped compile. */
export function snapshotRendererPrograms(
  renderer: RendererWithPrograms,
): ReadonlySet<LinkedProgram> {
  return new Set(renderer.info?.programs ?? []);
}

/**
 * Consume Three's lazy uniform-table initialization for newly linked programs.
 *
 * `WebGLRenderer.compile()` creates the programs but deliberately leaves
 * `WebGLProgram.getUniforms()` until first render. On ANGLE that can turn the
 * first complete scene pass into one large queue flush. Draining only the
 * programs added by the scoped compile, with a cooperative yield after each
 * one, preserves the exact programs while keeping the loading UI responsive.
 */
export async function warmNewRendererProgramUniforms(
  renderer: RendererWithPrograms,
  baseline: ReadonlySet<LinkedProgram>,
  yieldForBudget?: WarmYield | null,
  now: () => number = () => performance.now(),
): Promise<ProgramUniformWarmReceipt> {
  const receipt: ProgramUniformWarmReceipt = {
    programs: 0,
    totalMs: 0,
    maxMs: 0,
    failures: 0,
  };
  const startedAt = now();
  for (const program of renderer.info?.programs ?? []) {
    if (baseline.has(program) || typeof program.getUniforms !== 'function') continue;
    const programAt = now();
    try {
      program.getUniforms();
    } catch {
      // The following real render remains the compatibility fallback.
      receipt.failures += 1;
    }
    const programMs = now() - programAt;
    receipt.programs += 1;
    receipt.maxMs = Math.max(receipt.maxMs, programMs);
    if (yieldForBudget) await yieldForBudget();
  }
  receipt.totalMs = Math.round(now() - startedAt);
  receipt.maxMs = Math.round(receipt.maxMs);
  return receipt;
}

/**
 * Own gameplay-target program submission and bounded ANGLE linker draining.
 *
 * This keeps renderer-specific warm state out of the application orchestrator.
 * It deliberately submits the same objects to the same HDR target as gameplay;
 * no shader, material, quality, or visibility policy is changed here.
 */
export function createForwardProgramWarmOwner({
  renderer,
  scene,
  camera,
  getTarget,
  now = () => performance.now(),
}: ForwardProgramWarmOptions): ForwardProgramWarmOwner {
  let parallelCompile: ParallelShaderCompileExtension | null | undefined;
  let epoch = 0;

  const compileSceneSteps = function* (
    options: SceneProgramCompileOptions = {},
  ): Generator<void, void, void> {
    const ownedEpoch = epoch;
    yield* compileSceneProgramSteps({ renderer, scene, camera, getTarget, now },
      () => epoch === ownedEpoch, options);
  };

  const prepareSceneSteps = function* (
    options: SceneProgramCompileOptions = {},
  ): Generator<void, void, void> {
    options.signal?.throwIfAborted();
    const ownedEpoch = epoch;
    const info = renderer.info;
    const gl = renderer.getContext();
    const valid = (): boolean => {
      options.signal?.throwIfAborted();
      return epoch === ownedEpoch && renderer.info === info && !gl.isContextLost();
    };
    if (!valid()) return;
    const existingPrograms = options.timing ? snapshotRendererPrograms(renderer) : undefined;
    yield* compileSceneSteps(options);
    if (!valid()) return;
    // Caller crosses a rendering/task boundary before the first native query.
    // Keep the same renderer lifetime across submission AND this checkpoint.
    yield;
    if (!valid()) return;
    yield* linkerBreathingSlices(24, options.timing, options.signal, existingPrograms);
  };

  const compile = (root: Object3D, timing?: ForwardProgramCompileTiming): void => {
    compileForRenderTarget({
      renderer,
      root,
      camera,
      targetScene: scene,
      target: getTarget(),
      timing,
      now,
    });
  };

  const initializeSteps = function* (
    root: Object3D = scene,
    stats: ForwardProgramWarmStats | null = null,
  ): Generator<void, void, void> {
    let sliceAt = now();
    const objects: Object3D[] = [];
    root.traverseVisible((object) => {
      const renderable = object as ForwardWarmObject;
      if (renderable.isMesh || renderable.isPoints || renderable.isLine || renderable.isSprite) {
        objects.push(object);
      }
    });
    for (const object of objects) {
      const before = renderer.info?.programs?.length ?? 0;
      const compileAt = now();
      try { compile(object); } catch { /* the real render remains the fallback */ }
      if (stats) {
        const compileMs = now() - compileAt;
        stats.totalCompileMs = (stats.totalCompileMs ?? 0) + compileMs;
        if (compileMs > (stats.maxCompileMs ?? 0)) {
          stats.maxCompileMs = compileMs;
          stats.maxCompileObject = object.name || object.type || '(unnamed)';
        }
      }
      const programs = renderer.info?.programs ?? [];
      for (let index = before; index < programs.length; index += 1) {
        try { programs[index]?.getUniforms?.(); } catch { /* warm only */ }
        yield;
        sliceAt = now();
      }
      if (now() - sliceAt >= 8) {
        yield;
        sliceAt = now();
      }
    }
  };

  const linkerBreathingSlices = function* (
    maxSlices: number,
    timing?: ForwardProgramCompileTiming,
    signal?: AbortSignal,
    existingPrograms?: ReadonlySet<LinkedProgram>,
  ): Generator<void, void, void> {
    signal?.throwIfAborted();
    const ownedEpoch = epoch;
    const info = renderer.info;
    let polling = !!timing;
    let pollAt = timing ? diagnosticNow(now) : NaN;
    const finishPoll = (): void => {
      if (!polling) return;
      polling = false;
      const elapsed = diagnosticNow(now) - pollAt;
      recordCompileTiming(timing, 'pollMs', elapsed);
      recordCompileTiming(timing, 'maxPollMs', elapsed, 'max');
      recordCompileTiming(timing, 'pollCount', 1);
    };
    try {
      const gl = renderer.getContext();
      if (parallelCompile === undefined) {
        parallelCompile = measureCompileOperation(timing, 'extensionMs', now,
          () => gl.getExtension('KHR_parallel_shader_compile') as ParallelShaderCompileExtension | null);
      }
      if (!parallelCompile) return;
      let cursor = 0;
      // Program arrays can compact on material disposal between checkpoints.
      // Retain identities for this bounded warm job, not mutable array indices.
      const programs = [...(renderer.info?.programs ?? [])];
      for (let slice = 0; slice < maxSlices; slice += 1) {
        signal?.throwIfAborted();
        if (epoch !== ownedEpoch || renderer.info !== info || gl.isContextLost?.()) return;
        cursor = firstPendingProgram(gl, parallelCompile.COMPLETION_STATUS_KHR, programs, cursor, timing, now,
          existingPrograms);
        if (cursor === programs.length) return;
        finishPoll();
        recordCompileTiming(timing, 'yields', 1);
        yield;
        if (slice + 1 < maxSlices) {
          polling = !!timing;
          pollAt = timing ? diagnosticNow(now) : NaN;
        }
      }
    } catch {
      signal?.throwIfAborted();
      // Best effort: the following real render still resolves outstanding links.
    } finally { finishPoll(); }
  };

  return {
    compile,
    compileSceneSteps,
    prepareSceneSteps,
    initializeSteps,
    linkerBreathingSlices,
    invalidate() { epoch += 1; parallelCompile = undefined; },
  };
}
