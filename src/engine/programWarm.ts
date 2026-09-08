import { Object3D } from 'three';
import type { RuntimeValue } from '../runtimeTypes.ts';
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
  properties?: { get(material: Material): RuntimeValue };
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
  /** Selected-material cache cohort reflection only; excludes readiness queries and caller waits. */
  uniformMs?: number;
  maxUniformMs?: number;
  /** Attempted getUniforms calls, including failures and the unproven-readiness no-KHR fallback. */
  uniformCount?: number;
  uniformFailures?: number;
  uniformYields?: number;
  /** Still-live captured programs not successfully reflected, including failed calls. */
  uniformPending?: number;
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
  /** Submission defaults to 8 ms; opt-in first use defaults to 4 ms and clamps to 1–8 ms. */
  sliceMs?: number;
  /** Opt-in real scene passes; omitted retains native all-descendant selection. */
  passes?: readonly SceneProgramCompilePass[];
  /** Opt-in first use of the selected materials' cached variants, including retained variants. */
  initializeUniforms?: boolean;
}

interface CapturedProgram {
  readonly wrapper: LinkedProgram;
  readonly handle: WebGLProgram;
  initialized: boolean;
  failed: boolean;
}

type MaterialProgramCohort = Map<LinkedProgram, CapturedProgram>;

export interface SceneProgramCompilePass {
  readonly layerMask: number;
  /** The actual scene-pass destination; null retains the current target. */
  readonly target: RenderTarget;
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

function compileScenePassBatch(
  { renderer, scene, camera, getTarget, now }: ForwardProgramWarmOptions,
  root: Object3D,
  timing: ForwardProgramCompileTiming | undefined,
  pass: SceneProgramCompilePass | undefined,
  cohort?: MaterialProgramCohort,
  valid: () => boolean = () => true,
): void {
  const priorMask = camera.layers.mask;
  try {
    if (pass) camera.layers.mask = pass.layerMask;
    const materials = compileForRenderTarget({ renderer, root, camera, targetScene: scene,
      target: pass ? pass.target : getTarget(), timing, now });
    if (cohort && valid()) captureMaterialPrograms(renderer, materials, cohort, valid);
  } finally {
    if (pass) camera.layers.mask = priorMask;
  }
}

/**
 * A compile-only traversal view, never inserted into the scene. Native compile
 * visits all selected descendants (including hidden variants), but gets its
 * lights, environment and fog from the real target scene. Original objects keep
 * their parents, transforms and material identities throughout every checkpoint.
 */
function* compileScenePassSteps(
  options: ForwardProgramWarmOptions,
  valid: () => boolean,
  { timing, sliceMs = 8 }: SceneProgramCompileOptions,
  pass: SceneProgramCompilePass | undefined,
  cohort?: MaterialProgramCohort,
): Generator<void, void, void> {
  const { scene, now = () => performance.now() } = options;
  const objects: Object3D[] = [];
  const facade = new Object3D();
  let start = 0;
  let end = 0;
  facade.traverseVisible = () => {}; // No additional lights beyond targetScene.
  facade.traverse = (visit) => {
    for (let index = start; index < end; index += 1) visit(objects[index]);
  };
  const budget = Number.isFinite(sliceMs) ? Math.max(1, Math.min(16, sliceMs)) : 8;
  try {
    scene.traverse((object) => {
      if (isForwardRenderable(object) && (!pass || (object.layers.mask & pass.layerMask) !== 0)) {
        objects.push(object);
      }
    });
    let sliceAt = diagnosticNow(now);
    let submitted = 0;
    while (start < objects.length && valid()) {
      end = Math.min(start + 16, objects.length);
      compileScenePassBatch(options, facade, timing, pass, cohort, valid);
      submitted += end - start;
      start = end;
      // Abort only after native compile restores both camera and render target.
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
  }
}

function* compileSceneProgramSteps(
  options: ForwardProgramWarmOptions,
  isCurrent: () => boolean,
  compileOptions: SceneProgramCompileOptions,
  cohort?: MaterialProgramCohort,
): Generator<void, void, void> {
  const { signal, timing, passes } = compileOptions;
  signal?.throwIfAborted();
  const { renderer } = options;
  const info = renderer.info;
  const gl = renderer.getContext();
  const valid = (): boolean => {
    signal?.throwIfAborted();
    return isCurrent() && renderer.info === info && !gl.isContextLost();
  };
  if (!valid()) return;
  const before = renderer.info?.programs?.length ?? 0;
  recordCompileTiming(timing, 'programsAfter', before, 'set');
  try {
    const workPasses = passes ?? [undefined];
    for (let index = 0; index < workPasses.length; index += 1) {
      if (index > 0) yield; // Each pass releases its facade and restores state first.
      if (!valid()) return;
      yield* compileScenePassSteps(options, valid, compileOptions, workPasses[index], cohort);
      if (!valid()) return;
    }
  } finally {
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
}: TargetCompileOptions): Set<Material> {
  const priorTarget = renderer.getRenderTarget();
  const priorFace = renderer.getActiveCubeFace?.() ?? 0;
  const priorMip = renderer.getActiveMipmapLevel?.() ?? 0;
  recordProgramCount(renderer, timing, 'programsBefore');
  try {
    if (target) measureCompileOperation(timing, 'targetBindMs', now, () => renderer.setRenderTarget(target));
    return measureCompileOperation(timing, 'submissionMs', now, () => renderer.compile(root, camera, targetScene));
  } finally {
    try {
      measureCompileOperation(timing, 'targetRestoreMs', now,
        () => renderer.setRenderTarget(priorTarget, priorFace, priorMip));
    } finally { recordProgramCount(renderer, timing, 'programsAfter'); }
  }
}

function isLinkedProgram(value: RuntimeValue): value is LinkedProgram {
  return typeof value === 'object' && value !== null && 'program' in value
    && 'getUniforms' in value && typeof value.getUniforms === 'function';
}

/**
 * Three 0.185.1 compile returns materials, not a used-program receipt. Snapshot
 * each material's entire cache immediately: currentProgram alone loses reused
 * double-sided/shared-object variants. This is a finite selected-material
 * cache cohort, including its historical variants, never a renderer-wide sweep.
 * Unsupported internals fail this optional warm job rather than claim coverage.
 */
function captureMaterialPrograms(
  renderer: ForwardWarmRenderer,
  materials: Set<Material>,
  cohort: MaterialProgramCohort,
  valid: () => boolean,
): void {
  for (const material of materials) {
    if (!valid()) return;
    const properties = renderer.properties?.get(material);
    if (typeof properties !== 'object' || properties === null || !('programs' in properties)
      || !(properties.programs instanceof Map)) {
      throw new Error('Compiled material program cache unavailable');
    }
    const programs: ReadonlyMap<RuntimeValue, RuntimeValue> = properties.programs;
    for (const wrapper of programs.values()) {
      if (!isLinkedProgram(wrapper)) throw new Error('Compiled material program reference unavailable');
      const handle = wrapper.program;
      if (isWebGLProgram(handle) && !cohort.has(wrapper)) {
        cohort.set(wrapper, { wrapper, handle, initialized: false, failed: false });
      }
    }
  }
}

interface FirstUseWarmContext {
  renderer: ForwardWarmRenderer;
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  valid(): boolean;
  now(): number;
  timing?: ForwardProgramCompileTiming;
  existingPrograms?: ReadonlySet<LinkedProgram>;
}

function capturedProgramIsLive(renderer: ForwardWarmRenderer, entry: CapturedProgram): boolean {
  return entry.wrapper.program === entry.handle && !!renderer.info?.programs?.includes(entry.wrapper);
}

function queryCapturedProgram(
  { gl, timing, now, existingPrograms }: FirstUseWarmContext,
  entry: CapturedProgram,
  extension: ParallelShaderCompileExtension,
): boolean {
  const startedAt = diagnosticNow(now);
  try { return gl.getProgramParameter(entry.handle, extension.COMPLETION_STATUS_KHR) === true; }
  finally {
    const elapsed = diagnosticNow(now) - startedAt;
    recordCompileTiming(timing, 'queryMs', elapsed);
    recordCompileTiming(timing, 'maxQueryMs', elapsed, 'max');
    recordCompileTiming(timing, 'queryCount', 1);
    if (timing) recordQueryCohort(timing, elapsed, existingPrograms?.has(entry.wrapper));
  }
}

function reflectCapturedProgram(context: FirstUseWarmContext, entry: CapturedProgram): void {
  const startedAt = diagnosticNow(context.now);
  try {
    entry.wrapper.getUniforms(); // Pinned Three initializes both uniform AND attribute tables here.
    entry.initialized = true;
  } catch {
    entry.failed = true;
    recordCompileTiming(context.timing, 'uniformFailures', 1);
  } finally {
    const elapsed = diagnosticNow(context.now) - startedAt;
    recordCompileTiming(context.timing, 'uniformMs', elapsed);
    recordCompileTiming(context.timing, 'maxUniformMs', elapsed, 'max');
    recordCompileTiming(context.timing, 'uniformCount', 1);
  }
}

function recordFirstUsePending(context: FirstUseWarmContext, entries: readonly CapturedProgram[]): void {
  const pending = entries.filter((entry) => !entry.initialized
    && capturedProgramIsLive(context.renderer, entry)).length;
  recordCompileTiming(context.timing, 'uniformPending', pending, 'set');
}

function firstUseProgramReady(
  context: FirstUseWarmContext,
  entry: CapturedProgram,
  extension: ParallelShaderCompileExtension | null,
): boolean {
  if (!extension) return true; // Three's no-KHR fallback; NOT an observed link-completion receipt.
  const startedAt = diagnosticNow(context.now);
  try { return queryCapturedProgram(context, entry, extension); }
  catch { entry.failed = true; return false; } // Never reflect after an unsuccessful native query.
  finally {
    const elapsed = diagnosticNow(context.now) - startedAt;
    recordCompileTiming(context.timing, 'pollMs', elapsed);
    recordCompileTiming(context.timing, 'maxPollMs', elapsed, 'max');
    recordCompileTiming(context.timing, 'pollCount', 1);
  }
}

function advanceFirstUseProgram(
  context: FirstUseWarmContext,
  entry: CapturedProgram,
  extension: ParallelShaderCompileExtension | null,
  expired: () => boolean,
): 'stop' | 'skip' | 'pending' | 'reflected' {
  if (!context.valid() || expired()) return 'stop';
  if (entry.initialized || entry.failed || !capturedProgramIsLive(context.renderer, entry)) return 'skip';
  if (!firstUseProgramReady(context, entry, extension)) return 'pending';
  if (!context.valid() || expired()) return 'stop';
  if (!capturedProgramIsLive(context.renderer, entry)) return 'skip';
  reflectCapturedProgram(context, entry);
  return context.valid() ? 'reflected' : 'stop';
}

function createFirstUseSliceBudget(now: () => number, sliceMs: number) {
  const budgetMs = Number.isFinite(sliceMs) ? Math.max(1, Math.min(8, sliceMs)) : 4;
  let sliceAt = diagnosticNow(now);
  let entries = 0;
  return {
    exhausted(): boolean {
      entries += 1; // Include pending, failed, already-complete and stale entries.
      return entries >= 32 || diagnosticNow(now) - sliceAt >= budgetMs;
    },
    hasWork(): boolean { return entries > 0; },
    reset(): void { entries = 0; sliceAt = diagnosticNow(now); },
  };
}

function* initializeMaterialProgramRound(
  context: FirstUseWarmContext,
  entries: readonly CapturedProgram[],
  extension: ParallelShaderCompileExtension | null,
  expired: () => boolean,
  slice: ReturnType<typeof createFirstUseSliceBudget>,
): Generator<void, boolean, void> {
  let pending = false;
  for (const entry of entries) {
    const outcome = advanceFirstUseProgram(context, entry, extension, expired);
    if (outcome === 'stop') {
      if (context.valid()) recordFirstUsePending(context, entries);
      return false;
    }
    pending ||= outcome === 'pending';
    if (!context.valid()) return false;
    if (!slice.exhausted()) continue;
    recordFirstUsePending(context, entries);
    recordCompileTiming(context.timing, 'uniformYields', 1);
    yield;
    if (!context.valid()) return false;
    slice.reset(); // Caller paint/task waits do not consume the next work slice.
  }
  if (!context.valid()) return false;
  recordFirstUsePending(context, entries);
  if (!pending || expired()) return false;
  if (!slice.hasWork()) return true; // A final-entry budget yield already released this pending round.
  recordCompileTiming(context.timing, 'uniformYields', 1);
  recordCompileTiming(context.timing, 'yields', 1);
  yield;
  if (!context.valid()) return false;
  slice.reset();
  return true;
}

/** Budget native queries and reflection together; indivisible native calls can exceed one slice. */
function* initializeMaterialProgramSteps(
  context: FirstUseWarmContext,
  cohort: MaterialProgramCohort,
  extension: ParallelShaderCompileExtension | null,
  sliceMs = 4,
): Generator<void, void, void> {
  const entries = [...cohort.values()];
  const startedAt = diagnosticNow(context.now);
  const expired = (): boolean => diagnosticNow(context.now) - startedAt >= 5_000;
  const slice = createFirstUseSliceBudget(context.now, sliceMs);
  for (const field of ['uniformMs', 'maxUniformMs', 'uniformCount', 'uniformFailures', 'uniformYields'] as const) {
    recordCompileTiming(context.timing, field, 0);
  }
  try {
    for (let round = 0; round < 120; round += 1) {
      const pending = yield* initializeMaterialProgramRound(context, entries, extension, expired, slice);
      if (!pending) return;
    }
  } finally { entries.length = 0; }
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
    const cohort = options.initializeUniforms ? new Map<LinkedProgram, CapturedProgram>() : undefined;
    try {
      if (cohort) {
        yield* compileSceneProgramSteps({ renderer, scene, camera, getTarget, now },
          () => epoch === ownedEpoch, options, cohort);
      } else yield* compileSceneSteps(options);
      if (!valid()) return;
      // Caller crosses a rendering/task boundary before the first native query.
      // Keep the same renderer lifetime across submission AND this checkpoint.
      yield;
      if (!valid()) return;
      if (!cohort) {
        yield* linkerBreathingSlices(24, options.timing, options.signal, existingPrograms);
        return;
      }
      const context = { renderer, gl, valid, now, timing: options.timing, existingPrograms };
      try {
        if (cohort.size && parallelCompile === undefined) {
          const extension = measureCompileOperation(options.timing, 'extensionMs', now,
            () => gl.getExtension('KHR_parallel_shader_compile') as ParallelShaderCompileExtension | null);
          if (!valid()) return;
          parallelCompile = extension;
        }
      } catch {
        if (valid()) recordFirstUsePending(context, [...cohort.values()]);
        return; // Extension acquisition failure is not the unsupported-extension fallback.
      }
      if (!valid()) return;
      yield* initializeMaterialProgramSteps(context, cohort, parallelCompile ?? null, options.sliceMs);
    } finally { cohort?.clear(); }
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
