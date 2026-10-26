/**
 * postLazyPasses.ts — the post chain's demand-loaded half (engine/post.ts imports it once, as the boot's post stage
 * awaits `post.ready`): three's SMAA pass (its area and search lookup images are base64, 34 KB of brotli that stays out of
 * the game entry) and the chain's first-frame warm, which only covered loads and the Garage boot run.
 *
 * The warm (2026-10-19, black-screen-228 RC4): every fullscreen program is compiled and every target allocated one pass
 * per browser frame, so a cold ANGLE session never links the whole chain in one task. It used to switch every pass off
 * for the length of the warm and await between passes with them off, so a frame the browser presented between two steps
 * drew nothing, and a second warm that overlapped the first snapshotted the all-off flags and restored them, leaving the
 * chain off for good. Now each step is one synchronous transaction: only the warmed pass is on inside its own
 * composer.render, and every flag (and renderToScreen) is back before the call returns, so every frame between steps
 * sees the canonical chain, and two warms that overlap are each safe. (Round 2, 2026-10-20: a second call used to return
 * the first call's promise, so it inherited that caller's fate: a superseded covered entry's warm rejected with its stale
 * marker, and the entry that replaced it took the rejection for its own supersession and never revealed. Every call now
 * runs its own warm.)
 */
import type { Material, WebGLRenderTarget } from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { compileFullscreenPrograms, type FullscreenCompileRenderer } from './fullscreenProgramWarm.ts';
import { createGpuCatchUpGate, type GpuCatchUpGate } from './gpuCatchUp.ts';
import { createVisionWarmSteps } from './visionWarm.ts';

export { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

export interface PostWarmTiming {
  label: string;
  ms: number;
}

type WarmComposer = Pick<EffectComposer, 'passes' | 'renderToScreen' | 'render'>
  & { renderer?: LinkRenderer; readBuffer?: WebGLRenderTarget };

/** The renderer calls a pass's link wait needs (three's; absent on the receipts' fake composers). */
type LinkRenderer = FullscreenCompileRenderer & {
  info: { programs: ReadonlyArray<object> | null };
  getContext(): WebGLRenderingContext | WebGL2RenderingContext;
};

/** A pass's own materials: its fields, its arrays of them, and the `material` of a field (a FullScreenQuad). */
function passMaterials(pass: Pass): Material[] {
  const found = new Set<Material>();
  const take = (value: unknown): void => {
    if (value && typeof value === 'object' && (value as { isMaterial?: boolean }).isMaterial === true) found.add(value as Material);
  };
  for (const value of Object.values(pass as unknown as Record<string, unknown>)) {
    take(value);
    if (Array.isArray(value)) for (const item of value) take(item);
    else if (value && typeof value === 'object') take((value as { material?: unknown }).material);
  }
  return [...found];
}

/** The longest a pass's link wait holds its draw back; a link still pending then links at the draw, as before. */
const PASS_LINK_WAIT_MS = 3_000;

/**
 * (battle-spikes-253) A pass's programs linked between tasks before it draws: its materials compiled against the
 * composer's buffer with no draw, then one completion query a poll on the programs that compile made, each poll held
 * until the GPU caught up to the last (gpuCatchUp.ts). A pass's first draw linked its program inside the warm's one
 * synchronous render (nav-perf's root-w solo entry: renderPassAlone, getProgramParameter 560 ms).
 */
async function linkPassPrograms(composer: WarmComposer, pass: Pass, gate: GpuCatchUpGate | null,
  yieldBeforePass: YieldBeforePass, label: string): Promise<void> {
  const renderer = composer.renderer;
  const programs = renderer?.info?.programs;
  if (!renderer || !programs || !yieldBeforePass) return;
  const before = new Set(programs);
  const target = composer.readBuffer ?? null;
  if (!compileFullscreenPrograms(renderer, passMaterials(pass).map((material) => ({ material, target })))) return;
  // three's WebGLProgram.isReady: COMPLETION_STATUS once, cached true after
  const fresh = (renderer.info.programs?.filter((program) => !before.has(program)) ?? []) as Array<{ isReady?(): boolean }>;
  const deadline = performance.now() + PASS_LINK_WAIT_MS;
  let cursor = 0;
  while (cursor < fresh.length && performance.now() < deadline) {
    if (!gate || gate.caughtUp()) while (cursor < fresh.length && fresh[cursor].isReady?.() !== false) cursor++;
    if (cursor < fresh.length) await yieldBeforePass(`${label}-links`);
  }
}
type GradePass = Pass & { uniforms: Record<string, { value: unknown }> };
type YieldBeforePass = ((label: string) => Promise<void>) | null | undefined;

/** Render `pass` alone through the composer; every flag and renderToScreen restored before returning. */
export function renderPassAlone(composer: WarmComposer, pass: Pass): void {
  const passes = composer.passes;
  const enabled = passes.map((entry) => entry.enabled);
  const renderToScreen = composer.renderToScreen;
  try {
    composer.renderToScreen = false;
    for (const entry of passes) entry.enabled = entry === pass;
    composer.render(1 / 60);
  } finally {
    composer.renderToScreen = renderToScreen;
    for (let index = 0; index < passes.length; index++) passes[index].enabled = enabled[index];
  }
}

async function warmPasses(composer: WarmComposer, grade: GradePass, yieldBeforePass: YieldBeforePass): Promise<PostWarmTiming[]> {
  const timings: PostWarmTiming[] = [];
  // the passes the chain runs as the warm begins (a pass it turns on later warms at its first frame, as before)
  const passes = composer.passes.filter((pass) => pass.enabled);
  let gate: GpuCatchUpGate | null = null;
  try { if (composer.renderer?.getContext) gate = createGpuCatchUpGate(composer.renderer.getContext()); } catch { gate = null; }
  try {
  for (const pass of passes) {
    const label = pass.constructor?.name || `post-pass-${composer.passes.indexOf(pass) + 1}`;
    if (yieldBeforePass) await yieldBeforePass(label);
    // a pass the chain dropped during the wait (the SMAA slot's swap, a Studio pass) is not drawn
    if (!composer.passes.includes(pass)) continue;
    try { await linkPassPrograms(composer, pass, gate, yieldBeforePass, label); }
    catch (error) { if (!composer.passes.includes(pass)) continue; throw error; }
    if (!composer.passes.includes(pass)) continue;
    const startedAt = performance.now();
    if (pass === grade) {
      for (const mode of createVisionWarmSteps(grade.uniforms.uThermal as { value: number }, () => renderPassAlone(composer, pass))) {
        if (yieldBeforePass) await yieldBeforePass(`vision-${mode}`);
      }
    } else {
      // (2026-10-24, perf-245) a pass whose draws wait on the view (the sun shafts' mask and blur, the lens flare: the sun
      // on screen) draws them once here with no colour (warmGated), or a camera turned or thrown toward the sun made
      // their pipelines on that live frame
      const gated = pass as Pass & { warmGated?: (on: boolean) => void };
      gated.warmGated?.(true);
      try { renderPassAlone(composer, pass); } finally { gated.warmGated?.(false); }
    }
    timings.push({ label, ms: Math.round(performance.now() - startedAt) });
  }
  } finally { gate?.dispose(); }
  return timings;
}

/** The chain's first-frame warm (post.warmFirstFrame): each call its own, with its own yields and its own outcome. */
export function warmPostFirstFrame(composer: WarmComposer, grade: GradePass, yieldBeforePass: YieldBeforePass): Promise<PostWarmTiming[]> {
  return warmPasses(composer, grade, yieldBeforePass);
}
