type WarmYield = () => Promise<void>;

interface LinkedProgram {
  getUniforms?: () => unknown;
}

interface RendererProgramInfo {
  programs?: readonly LinkedProgram[] | null;
}

interface RendererWithPrograms {
  info?: RendererProgramInfo | null;
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
