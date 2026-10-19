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
 * sees the canonical chain. A second call while one runs returns the first call's promise.
 */
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { createVisionWarmSteps } from './visionWarm.ts';

export { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

export interface PostWarmTiming {
  label: string;
  ms: number;
}

type WarmComposer = Pick<EffectComposer, 'passes' | 'renderToScreen' | 'render'>;
type GradePass = Pass & { uniforms: Record<string, { value: unknown }> };
type YieldBeforePass = ((label: string) => Promise<void>) | null | undefined;

const running = new WeakMap<object, Promise<PostWarmTiming[]>>();

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
  for (const pass of passes) {
    const label = pass.constructor?.name || `post-pass-${composer.passes.indexOf(pass) + 1}`;
    if (yieldBeforePass) await yieldBeforePass(label);
    // a pass the chain dropped during the wait (the SMAA slot's swap, a Studio pass) is not drawn
    if (!composer.passes.includes(pass)) continue;
    const startedAt = performance.now();
    if (pass === grade) {
      for (const mode of createVisionWarmSteps(grade.uniforms.uThermal as { value: number }, () => renderPassAlone(composer, pass))) {
        if (yieldBeforePass) await yieldBeforePass(`vision-${mode}`);
      }
    } else {
      renderPassAlone(composer, pass);
    }
    timings.push({ label, ms: Math.round(performance.now() - startedAt) });
  }
  return timings;
}

/** The chain's first-frame warm (post.warmFirstFrame); one at a time per composer. */
export function warmPostFirstFrame(composer: WarmComposer, grade: GradePass, yieldBeforePass: YieldBeforePass): Promise<PostWarmTiming[]> {
  const current = running.get(composer);
  if (current) return current;
  const warm = warmPasses(composer, grade, yieldBeforePass);
  running.set(composer, warm);
  const release = (): void => { if (running.get(composer) === warm) running.delete(composer); };
  warm.then(release, release);
  return warm;
}
