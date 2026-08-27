type WarmYield = () => Promise<void>;

interface LinkedProgram {
  getUniforms?: () => unknown;
  program?: WebGLProgram | null;
}

interface RendererProgramInfo {
  programs?: readonly LinkedProgram[] | null;
}

export interface RendererWithPrograms {
  info?: RendererProgramInfo | null;
}

interface ForwardWarmObject {
  isMesh?: boolean;
  isPoints?: boolean;
  isLine?: boolean;
  isSprite?: boolean;
  name?: string;
  type?: string;
  traverseVisible(callback: (object: ForwardWarmObject) => void): void;
}

interface ParallelShaderCompileExtension {
  COMPLETION_STATUS_KHR: number;
}

interface ForwardWarmRenderer extends RendererWithPrograms, RendererWithTargets {
  getContext(): WebGLRenderingContext | WebGL2RenderingContext;
}

export interface ForwardProgramWarmStats {
  totalCompileMs?: number;
  maxCompileMs?: number;
  maxCompileObject?: string;
}

export interface ForwardProgramWarmOwner {
  compile(root: unknown): void;
  initializeSteps(
    root?: ForwardWarmObject,
    stats?: ForwardProgramWarmStats | null,
  ): Generator<void, void, unknown>;
  linkerBreathingSlices(maxSlices: number): Generator<void, void, unknown>;
  invalidate(): void;
}

export interface ForwardProgramWarmOptions {
  renderer: ForwardWarmRenderer;
  scene: ForwardWarmObject;
  camera: unknown;
  getTarget(): unknown;
  now?: () => number;
}

interface RendererWithTargets {
  getRenderTarget(): unknown;
  getActiveCubeFace?(): number;
  getActiveMipmapLevel?(): number;
  setRenderTarget(target: unknown, activeCubeFace?: number, activeMipmapLevel?: number): void;
  compile(root: unknown, camera: unknown, targetScene?: unknown): unknown;
}

export interface ProgramUniformWarmReceipt {
  programs: number;
  totalMs: number;
  maxMs: number;
  failures: number;
}

export interface TargetCompileOptions {
  renderer: RendererWithTargets;
  root: unknown;
  camera: unknown;
  targetScene?: unknown;
  target?: unknown;
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
}: TargetCompileOptions): void {
  const priorTarget = renderer.getRenderTarget();
  const priorFace = renderer.getActiveCubeFace?.() ?? 0;
  const priorMip = renderer.getActiveMipmapLevel?.() ?? 0;
  try {
    if (target) renderer.setRenderTarget(target);
    renderer.compile(root, camera, targetScene);
  } finally {
    renderer.setRenderTarget(priorTarget, priorFace, priorMip);
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

  const compile = (root: unknown): void => {
    compileForRenderTarget({
      renderer,
      root,
      camera,
      targetScene: scene,
      target: getTarget(),
    });
  };

  const initializeSteps = function* (
    root: ForwardWarmObject = scene,
    stats: ForwardProgramWarmStats | null = null,
  ): Generator<void, void, unknown> {
    let sliceAt = now();
    const objects: ForwardWarmObject[] = [];
    root.traverseVisible((object) => {
      if (object.isMesh || object.isPoints || object.isLine || object.isSprite) {
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
  ): Generator<void, void, unknown> {
    try {
      const gl = renderer.getContext();
      if (parallelCompile === undefined) {
        parallelCompile = gl.getExtension(
          'KHR_parallel_shader_compile',
        ) as ParallelShaderCompileExtension | null;
      }
      if (!parallelCompile) return;
      let cursor = 0;
      for (let slice = 0; slice < maxSlices; slice += 1) {
        const programs = renderer.info?.programs ?? [];
        let pending = false;
        for (; cursor < programs.length; cursor += 1) {
          const program = programs[cursor]?.program;
          if (program && gl.getProgramParameter(
            program,
            parallelCompile.COMPLETION_STATUS_KHR,
          ) === false) {
            pending = true;
            break;
          }
        }
        if (!pending) return;
        yield;
      }
    } catch {
      // Best effort: the following real render still resolves outstanding links.
    }
  };

  return {
    compile,
    initializeSteps,
    linkerBreathingSlices,
    invalidate() { parallelCompile = undefined; },
  };
}
