import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

export type CoveredComposerOperation = 'render' | 'copyTextureToTexture' | 'setRenderTarget'
  | 'clear' | 'getUniformLocation' | 'getProgramParameter' | 'getLinkStatus' | 'getActiveUniform'
  | 'getParameter' | 'shaderDiagnostics';
export interface CoveredComposerOperationTiming { count: number; totalMs: number; maxMs: number }
type ProgramTypeCounts = Record<'depth' | 'distance' | 'standard' | 'basic' | 'shader' | 'raw' | 'other', number>;

export interface CoveredComposerPassTiming {
  index: number;
  label: string;
  renderMs: number;
  programsBefore: number;
  programsAfter: number;
  /** Inclusive synchronous times: nested operations must not be summed. */
  operations?: Partial<Record<CoveredComposerOperation, CoveredComposerOperationTiming>>;
  newProgramTypes?: ProgramTypeCounts;
}

export interface CoveredComposerWarmTiming {
  totalMs: number;
  passes: CoveredComposerPassTiming[];
}

const MAX_PASS_TIMINGS = 16;
type NativeArgument = object | number | string | boolean | bigint | symbol | null | undefined;
type NativeMethod = (this: object, ...args: NativeArgument[]) => NativeArgument | void;
interface OperationScope { active: CoveredComposerPassTiming | null }

function methodDescriptor(owner: object, name: string): PropertyDescriptor | undefined {
  let current: object | null = owner;
  for (let depth = 0; current && depth < 16; depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) return descriptor;
    current = Object.getPrototypeOf(current);
  }
}

function replaceMethod(
  owner: object, name: string, decorate: (original: NativeMethod) => NativeMethod,
): (() => void) | null {
  try {
    const descriptor = methodDescriptor(owner, name);
    if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'function') return null;
    const own = Object.getOwnPropertyDescriptor(owner, name);
    const wrapped = decorate(descriptor.value as NativeMethod);
    Object.defineProperty(owner, name, own ? { ...own, value: wrapped }
      : { configurable: true, writable: true, value: wrapped });
    return () => {
      if (own) Object.defineProperty(owner, name, own);
      else if (!Reflect.deleteProperty(owner, name)) throw new Error('covered_composer_restore_failed');
    };
  } catch { return null; } // Frozen, accessor or foreign owners still render normally.
}

function diagnosticNow(): number {
  try { return performance.now(); }
  catch { return NaN; }
}

function elapsedSince(start: number): number {
  const elapsed = diagnosticNow() - start;
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : NaN;
}

function programCount(composer: EffectComposer): number {
  try {
    const programs = composer.renderer.info.programs;
    return Array.isArray(programs) ? programs.length : NaN;
  } catch { return NaN; }
}

function passLabel(pass: Pass): string {
  try { return pass.constructor.name.slice(0, 64) || 'Pass'; }
  catch { return 'Pass'; }
}

function snapshotPrograms(composer: EffectComposer): Set<object> | null {
  try {
    const programs = composer.renderer.info.programs;
    return Array.isArray(programs) ? new Set(programs) : null;
  } catch { return null; }
}

function programType(program: object): keyof ProgramTypeCounts {
  switch (Object.getOwnPropertyDescriptor(program, 'type')?.value) {
    case 'MeshDepthMaterial': return 'depth';
    case 'MeshDistanceMaterial': return 'distance';
    case 'MeshStandardMaterial': return 'standard';
    case 'MeshBasicMaterial': return 'basic';
    case 'ShaderMaterial': return 'shader';
    case 'RawShaderMaterial': return 'raw';
    default: return 'other';
  }
}

function newProgramTypes(composer: EffectComposer, before: Set<object> | null): ProgramTypeCounts | undefined {
  const after = snapshotPrograms(composer);
  if (!before || !after) return;
  const counts: ProgramTypeCounts = { depth: 0, distance: 0, standard: 0, basic: 0, shader: 0, raw: 0, other: 0 };
  try {
    for (const program of after) if (!before.has(program)) counts[programType(program)]++;
    return counts;
  } catch { return; }
}

function recordOperation(pass: CoveredComposerPassTiming, name: CoveredComposerOperation, elapsed: number): void {
  try {
    const operations = pass.operations ??= {};
    const timing = operations[name] ??= { count: 0, totalMs: 0, maxMs: 0 };
    timing.count++;
    timing.totalMs += elapsed;
    timing.maxMs = Math.max(timing.maxMs, elapsed);
  } catch { /* Optional diagnostics cannot replace a native result or thrown value. */ }
}

function wrapOperation(
  owner: object, name: string, scope: OperationScope,
  classify: (args: NativeArgument[]) => CoveredComposerOperation | null,
): (() => void) | null {
  return replaceMethod(owner, name, (original) => function (...args) {
    const pass = scope.active;
    const operation = classify(args);
    if (!pass || !operation) return original.apply(this, args);
    const startedAt = diagnosticNow();
    try { return original.apply(this, args); }
    finally { recordOperation(pass, operation, elapsedSince(startedAt)); }
  });
}

function diagnosticContext(composer: EffectComposer): object | null {
  try {
    const descriptor = methodDescriptor(composer.renderer, 'getContext');
    if (!descriptor || typeof descriptor.value !== 'function') return null;
    const context = (descriptor.value as NativeMethod).call(composer.renderer);
    return typeof context === 'object' ? context : null;
  } catch { return null; }
}

function wrapOperations(composer: EffectComposer, scope: OperationScope, restores: Array<() => void>): void {
  const wrap = (owner: object, name: CoveredComposerOperation,
    classify?: (args: NativeArgument[]) => CoveredComposerOperation | null, method: string = name): void => {
    const restore = wrapOperation(owner, method, scope, classify ?? (() => name));
    if (restore) restores.push(restore);
  };
  for (const name of ['render', 'copyTextureToTexture', 'setRenderTarget', 'clear'] as const) {
    wrap(composer.renderer, name);
  }
  const gl = diagnosticContext(composer);
  if (!gl) return;
  wrap(gl, 'getUniformLocation');
  wrap(gl, 'getActiveUniform');
  wrap(gl, 'getParameter');
  wrap(gl, 'shaderDiagnostics', undefined, 'getProgramInfoLog');
  wrap(gl, 'shaderDiagnostics', undefined, 'getShaderInfoLog');
  try {
    const activeUniforms = methodDescriptor(gl, 'ACTIVE_UNIFORMS')?.value;
    const linkStatus = methodDescriptor(gl, 'LINK_STATUS')?.value;
    wrap(gl, 'getProgramParameter', (args) => {
      if (typeof activeUniforms === 'number' && args[1] === activeUniforms) return 'getProgramParameter';
      if (typeof linkStatus === 'number' && args[1] === linkStatus) return 'getLinkStatus';
      return null;
    });
  } catch { /* A foreign context may not expose this diagnostic constant. */ }
}

function wrapPass(
  composer: EffectComposer,
  pass: Pass,
  index: number,
  timings: CoveredComposerPassTiming[],
  scope: OperationScope,
): (() => void) | null {
  try {
    if (composer.passes.indexOf(pass) !== composer.passes.lastIndexOf(pass)) return null;
  } catch { return null; }
  return replaceMethod(pass, 'render', (original) => {
    const label = passLabel(pass);
    return function (...args) {
      if (timings.length >= MAX_PASS_TIMINGS) return original.apply(this, args);
      const row: CoveredComposerPassTiming = { index, label, renderMs: NaN,
        programsBefore: programCount(composer), programsAfter: NaN };
      const before = snapshotPrograms(composer);
      const prior = scope.active;
      scope.active = row;
      const startedAt = diagnosticNow();
      try { return original.apply(this, args); }
      finally {
        scope.active = prior;
        row.renderMs = elapsedSince(startedAt);
        row.programsAfter = programCount(composer);
        row.newProgramTypes = newProgramTypes(composer, before);
        timings.push(row);
      }
    };
  });
}

/**
 * Purely diagnostic covered submission: exactly one native composer.render(0),
 * no pass enablement/routing changes, yields, readiness claims or duplicate draw.
 * Time is synchronous wall time, not GPU completion. Missing diagnostics use
 * NaN; only the first sixteen unambiguous/wrappable pass slots can emit rows.
 * getProgramParameter attributes ACTIVE_UNIFORMS only; getLinkStatus separately
 * attributes LINK_STATUS. Other program queries are called but not recorded.
 */
export function renderCoveredComposerWarm(composer: EffectComposer): CoveredComposerWarmTiming {
  const renderer = composer.renderer;
  const target = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace();
  const mip = renderer.getActiveMipmapLevel();
  const renderToScreen = composer.renderToScreen;
  const passes: CoveredComposerPassTiming[] = [];
  const restores: (() => void)[] = [];
  const scope: OperationScope = { active: null };
  let failure: (() => never) | undefined;
  const attempt = (run: () => void): void => {
    try { run(); }
    catch (error) { failure ??= () => { throw error; }; }
  };
  const startedAt = diagnosticNow();
  try {
    wrapOperations(composer, scope, restores);
    const captured = composer.passes.slice(0, MAX_PASS_TIMINGS);
    for (const [index, pass] of captured.entries()) {
      const restore = wrapPass(composer, pass, index, passes, scope);
      if (restore) restores.push(restore);
    }
    composer.renderToScreen = false;
    composer.render(0);
  } catch (error) {
    failure = () => { throw error; };
  } finally {
    for (const restore of restores) attempt(restore);
    attempt(() => { composer.renderToScreen = renderToScreen; });
    attempt(() => renderer.setRenderTarget(target, face, mip));
  }
  const totalMs = elapsedSince(startedAt);
  failure?.();
  return { totalMs, passes };
}
