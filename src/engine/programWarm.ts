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

type LinkedProgram = Pick<ThreeWebGLProgram, 'getUniforms' | 'program'>
  & Partial<Pick<ThreeWebGLProgram, 'getAttributes' | 'id'>>;

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
  context: FirstUseWarmContext,
  completionToken: number,
  programs: readonly CapturedProgram[],
  cursor: number,
): number {
  const { gl, timing, now, existingPrograms } = context;
  for (; cursor < programs.length; cursor += 1) {
    if (!context.valid()) return programs.length;
    const entry = programs[cursor];
    if (!capturedProgramIsLive(context.renderer, entry) || reuseReflectedProgram(context, entry)) continue;
    const queryAt = timing ? diagnosticNow(now) : NaN;
    let pending = false;
    try { pending = gl.getProgramParameter(entry.handle, completionToken) === false; }
    finally {
      if (timing) {
        const elapsed = diagnosticNow(now) - queryAt;
        recordCompileTiming(timing, 'queryMs', elapsed);
        recordCompileTiming(timing, 'maxQueryMs', elapsed, 'max');
        recordCompileTiming(timing, 'queryCount', 1);
        recordQueryCohort(timing, elapsed, existingPrograms?.has(entry.wrapper));
      }
    }
    if (!context.valid()) return programs.length;
    if (pending && capturedProgramIsLive(context.renderer, entry)) break;
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
  /** Exact prior successful uniform AND attribute reflection witnesses reused, not new calls. */
  uniformReused?: number;
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
  readonly creationId?: number;
  initialized: boolean;
  failed: boolean;
}

interface ProgramWarmLifetime {
  readonly info: RendererWithPrograms['info'];
  readonly gl: WebGLRenderingContext | WebGL2RenderingContext;
  readonly reflected: WeakMap<LinkedProgram, WebGLProgram>;
  parallelCompile?: ParallelShaderCompileExtension | null;
}

type ContextProgramRenderer = Pick<ForwardWarmRenderer, 'info' | 'getContext'>;

// A retained wrapper keeps its native handle anyway. Neither renderer nor
// wrapper is strongly retained by this shared, renderer-lifetime-only proof.
const programWarmLifetimes = new WeakMap<ContextProgramRenderer, ProgramWarmLifetime>();

function captureProgramWarmLifetime(renderer: ContextProgramRenderer): ProgramWarmLifetime {
  const gl = renderer.getContext();
  let lifetime = programWarmLifetimes.get(renderer);
  if (!lifetime || lifetime.info !== renderer.info || lifetime.gl !== gl) {
    lifetime = { info: renderer.info, gl, reflected: new WeakMap() };
    programWarmLifetimes.set(renderer, lifetime);
  }
  return lifetime;
}

function programWarmLifetimeIsCurrent(renderer: ContextProgramRenderer, lifetime: ProgramWarmLifetime): boolean {
  if (programWarmLifetimes.get(renderer) !== lifetime) return false;
  if (renderer.info !== lifetime.info || renderer.getContext() !== lifetime.gl || lifetime.gl.isContextLost?.()) {
    programWarmLifetimes.delete(renderer);
    return false;
  }
  return true;
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
  const lifetime = captureProgramWarmLifetime(renderer);
  const valid = (): boolean => {
    signal?.throwIfAborted();
    return isCurrent() && programWarmLifetimeIsCurrent(renderer, lifetime);
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
        cohort.set(wrapper, { wrapper, handle, creationId: programCreationId(wrapper), initialized: false, failed: false });
      }
    }
  }
}

interface FirstUseWarmContext {
  renderer: RendererWithPrograms;
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  valid(): boolean;
  now(): number;
  timing?: ForwardProgramCompileTiming;
  existingPrograms?: ReadonlySet<LinkedProgram>;
  lifetime: ProgramWarmLifetime;
}

function capturedProgramIsLive(renderer: RendererWithPrograms, entry: CapturedProgram): boolean {
  return entry.wrapper.program === entry.handle && !!renderer.info?.programs?.includes(entry.wrapper);
}

function reuseReflectedProgram(context: FirstUseWarmContext, entry: CapturedProgram): boolean {
  if (context.lifetime.reflected.get(entry.wrapper) !== entry.handle) return false;
  entry.initialized = true;
  recordCompileTiming(context.timing, 'uniformReused', 1);
  return true;
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
    const uniforms = entry.wrapper.getUniforms();
    if (!context.valid() || !capturedProgramIsLive(context.renderer, entry)) return;
    // Pinned Three assigns cachedUniforms BEFORE fetching attributes. A retry
    // can return cached uniforms after partial failure, so validate both tables.
    const attributes = entry.wrapper.getAttributes?.();
    if (!context.valid() || !capturedProgramIsLive(context.renderer, entry)) return;
    entry.initialized = true;
    if (typeof uniforms === 'object' && uniforms !== null
      && typeof attributes === 'object' && attributes !== null) {
      context.lifetime.reflected.set(entry.wrapper, entry.handle);
    }
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
  if (reuseReflectedProgram(context, entry)) return 'skip';
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
  newestFirst: boolean,
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
    const exhausted = slice.exhausted();
    // A failed native query has no usable readiness result, but may not gate
    // older independent work. Every genuine pending result releases this task.
    if (newestFirst && outcome === 'pending' && !entry.failed) break;
    if (!exhausted) continue;
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

function programCreationId(wrapper: LinkedProgram): number | undefined {
  try {
    const id = wrapper.id;
    return typeof id === 'number' && Number.isSafeInteger(id) && id >= 0 ? id : undefined;
  } catch { return undefined; } // Foreign wrappers retain the original scheduling order.
}

function orderRecentProgramLinks(entries: CapturedProgram[]): boolean {
  const ids = new Set<number>();
  for (const entry of entries) {
    if (entry.creationId === undefined || ids.has(entry.creationId)) return false;
    ids.add(entry.creationId);
  }
  // Three assigns monotonic IDs once after synchronous link submission. Chrome
  // retains only 128 async completion queries; newer pending links can precede
  // an evicted older handle's synchronous fallback. This changes scheduling,
  // never coverage: every unwitnessed older handle still needs its own query.
  entries.sort((a, b) => (b.creationId ?? 0) - (a.creationId ?? 0));
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
  const newestFirst = !!extension && orderRecentProgramLinks(entries);
  const startedAt = diagnosticNow(context.now);
  const expired = (): boolean => diagnosticNow(context.now) - startedAt >= 5_000;
  const slice = createFirstUseSliceBudget(context.now, sliceMs);
  for (const field of ['uniformMs', 'maxUniformMs', 'uniformCount', 'uniformFailures', 'uniformYields', 'uniformReused'] as const) {
    recordCompileTiming(context.timing, field, 0);
  }
  try {
    for (let round = 0; round < 120; round += 1) {
      const pending = yield* initializeMaterialProgramRound(context, entries, extension, expired, slice, newestFirst);
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

function captureNewProgramCohort(
  renderer: RendererWithPrograms,
  baseline: ReadonlySet<LinkedProgram>,
  captureCreationIds = false,
): MaterialProgramCohort {
  const cohort: MaterialProgramCohort = new Map();
  for (const wrapper of renderer.info?.programs ?? []) {
    const handle = wrapper.program;
    if (!baseline.has(wrapper) && isWebGLProgram(handle)) {
      cohort.set(wrapper, { wrapper, handle, initialized: false, failed: false,
        creationId: captureCreationIds ? programCreationId(wrapper) : undefined });
    }
  }
  return cohort;
}

interface NewProgramUniformWarmOptions {
  signal?: AbortSignal;
  isCurrent?(): boolean;
  now?: () => number;
  sliceMs?: number;
  timing?: ForwardProgramCompileTiming;
}

/**
 * Capture immediately after a synchronous compile, before restoring staged
 * visuals. Consuming the returned job happens only AFTER that restoration.
 * Exact new wrapper/native pairs include detached cosmetics; later renderer
 * additions and retained programs are never added to this finite cohort.
 */
export function captureNewProgramUniformSteps(
  renderer: Pick<ForwardWarmRenderer, 'info' | 'getContext'>,
  baseline: ReadonlySet<LinkedProgram>,
  { signal, isCurrent = () => true, now = () => performance.now(), sliceMs, timing }: NewProgramUniformWarmOptions = {},
): Generator<void, void, void> {
  signal?.throwIfAborted();
  const lifetime = captureProgramWarmLifetime(renderer);
  const { gl } = lifetime;
  const valid = (): boolean => {
    signal?.throwIfAborted();
    return isCurrent() && programWarmLifetimeIsCurrent(renderer, lifetime);
  };
  const cohort = valid() ? captureNewProgramCohort(renderer, baseline, true) : new Map<LinkedProgram, CapturedProgram>();
  return (function* () {
    const context = { renderer, gl, valid, now, timing, lifetime };
    try {
      if (!valid() || !cohort.size) return;
      yield; // Release submission before the first native query, with visual state already restored.
      if (!valid()) return;
      let extension: ParallelShaderCompileExtension | null;
      try {
        extension = measureCompileOperation(timing, 'extensionMs', now,
          () => gl.getExtension('KHR_parallel_shader_compile') as ParallelShaderCompileExtension | null);
      } catch {
        if (valid()) recordFirstUsePending(context, [...cohort.values()]);
        return; // A failed extension query is not proof of the unsupported-extension fallback.
      }
      if (!valid()) return;
      yield* initializeMaterialProgramSteps(context, cohort, extension, sliceMs);
    } finally { cohort.clear(); }
  })();
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

function recordForwardCompileStats(
  stats: ForwardProgramWarmStats | null,
  object: Object3D,
  compileMs: number,
): void {
  if (!stats) return;
  stats.totalCompileMs = (stats.totalCompileMs ?? 0) + compileMs;
  if (compileMs > (stats.maxCompileMs ?? 0)) {
    stats.maxCompileMs = compileMs;
    stats.maxCompileObject = object.name || object.type || '(unnamed)';
  }
}

function* initializeSubmittedProgramSteps(
  context: FirstUseWarmContext,
  programs: MaterialProgramCohort,
): Generator<void, boolean, void> {
  let yielded = false;
  try {
    for (const entry of programs.values()) {
      if (!context.valid()) return yielded;
      if (!capturedProgramIsLive(context.renderer, entry)) continue;
      if (!reuseReflectedProgram(context, entry)) reflectCapturedProgram(context, entry);
      if (!context.valid()) return yielded;
      yielded = true;
      yield;
      if (!context.valid()) return yielded;
    }
    return yielded;
  } finally { programs.clear(); }
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
    const lifetime = captureProgramWarmLifetime(renderer);
    const { gl } = lifetime;
    const valid = (): boolean => {
      options.signal?.throwIfAborted();
      return epoch === ownedEpoch && programWarmLifetimeIsCurrent(renderer, lifetime);
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
      const context = { renderer, gl, valid, now, timing: options.timing, existingPrograms, lifetime };
      try {
        if (cohort.size && lifetime.parallelCompile === undefined) {
          const extension = measureCompileOperation(options.timing, 'extensionMs', now,
            () => gl.getExtension('KHR_parallel_shader_compile') as ParallelShaderCompileExtension | null);
          if (!valid()) return;
          lifetime.parallelCompile = extension;
        }
      } catch {
        if (valid()) recordFirstUsePending(context, [...cohort.values()]);
        return; // Extension acquisition failure is not the unsupported-extension fallback.
      }
      if (!valid()) return;
      yield* initializeMaterialProgramSteps(context, cohort, lifetime.parallelCompile ?? null, options.sliceMs);
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
    const ownedEpoch = epoch;
    const lifetime = captureProgramWarmLifetime(renderer);
    const valid = (): boolean => epoch === ownedEpoch && programWarmLifetimeIsCurrent(renderer, lifetime);
    const context = { renderer, gl: lifetime.gl, valid, now, lifetime };
    if (!valid()) return;
    let sliceAt = now();
    const objects: Object3D[] = [];
    root.traverseVisible((object) => {
      const renderable = object as ForwardWarmObject;
      if (renderable.isMesh || renderable.isPoints || renderable.isLine || renderable.isSprite) {
        objects.push(object);
      }
    });
    try {
      for (const object of objects) {
        if (!valid()) return;
        const before = snapshotRendererPrograms(renderer);
        const compileAt = now();
        try { compile(object); } catch { /* the real render remains the fallback */ }
        if (!valid()) return;
        if (stats) recordForwardCompileStats(stats, object, now() - compileAt);
        // Freeze identities; disposal can swap-pop the live array at a yield.
        const programs = captureNewProgramCohort(renderer, before);
        if (yield* initializeSubmittedProgramSteps(context, programs)) sliceAt = now();
        if (!valid()) return;
        if (now() - sliceAt >= 8) {
          yield;
          if (!valid()) return;
          sliceAt = now();
        }
      }
    } finally { objects.length = 0; }
  };

  const linkerBreathingSlices = function* (
    maxSlices: number,
    timing?: ForwardProgramCompileTiming,
    signal?: AbortSignal,
    existingPrograms?: ReadonlySet<LinkedProgram>,
  ): Generator<void, void, void> {
    signal?.throwIfAborted();
    const ownedEpoch = epoch;
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
      const lifetime = captureProgramWarmLifetime(renderer);
      const { gl } = lifetime;
      const valid = (): boolean => {
        signal?.throwIfAborted();
        return epoch === ownedEpoch && programWarmLifetimeIsCurrent(renderer, lifetime);
      };
      if (!valid()) return;
      if (lifetime.parallelCompile === undefined) {
        const extension = measureCompileOperation(timing, 'extensionMs', now,
          () => gl.getExtension('KHR_parallel_shader_compile') as ParallelShaderCompileExtension | null);
        if (!valid()) return;
        lifetime.parallelCompile = extension;
      }
      if (!lifetime.parallelCompile) return;
      let cursor = 0;
      // Program arrays can compact on material disposal between checkpoints.
      // Retain identities for this bounded warm job, not mutable array indices.
      const programs = [...captureNewProgramCohort(renderer, new Set()).values()];
      const context = { renderer, gl, valid, now, timing, existingPrograms, lifetime };
      for (let slice = 0; slice < maxSlices; slice += 1) {
        if (!valid()) return;
        cursor = firstPendingProgram(context, lifetime.parallelCompile.COMPLETION_STATUS_KHR, programs, cursor);
        if (cursor === programs.length) return;
        finishPoll();
        recordCompileTiming(timing, 'yields', 1);
        yield;
        if (!valid()) return;
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
    invalidate() { epoch += 1; programWarmLifetimes.delete(renderer); },
  };
}
