import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

export interface CoveredComposerPassTiming {
  index: number;
  label: string;
  renderMs: number;
  programsBefore: number;
  programsAfter: number;
}

export interface CoveredComposerWarmTiming {
  totalMs: number;
  passes: CoveredComposerPassTiming[];
}

const MAX_PASS_TIMINGS = 16;

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

function wrapPass(
  composer: EffectComposer,
  pass: Pass,
  index: number,
  timings: CoveredComposerPassTiming[],
): (() => void) | null {
  try {
    const own = Object.getOwnPropertyDescriptor(pass, 'render');
    // Do not replace accessor behavior or layer diagnostic wrappers onto a
    // repeated identity: a repeated pass has no single truthful slot index.
    if (own && !('value' in own)) return null;
    if (composer.passes.indexOf(pass) !== composer.passes.lastIndexOf(pass)) return null;
    const original = pass.render;
    const label = passLabel(pass);
    const wrapped: Pass['render'] = function (this: Pass, ...args: Parameters<Pass['render']>): void {
      if (timings.length >= MAX_PASS_TIMINGS) return original.apply(this, args);
      const programsBefore = programCount(composer);
      const startedAt = diagnosticNow();
      try { return original.apply(this, args); }
      finally {
        timings.push({ index, label, renderMs: elapsedSince(startedAt),
          programsBefore, programsAfter: programCount(composer) });
      }
    };
    Object.defineProperty(pass, 'render', own ? { ...own, value: wrapped }
      : { configurable: true, writable: true, value: wrapped });
    return () => {
      if (own) Object.defineProperty(pass, 'render', own);
      else if (!Reflect.deleteProperty(pass, 'render')) throw new Error('covered_composer_restore_failed');
    };
  } catch {
    // A frozen/foreign pass still renders normally; diagnostics are optional.
    return null;
  }
}

/**
 * Purely diagnostic covered submission: exactly one native composer.render(0),
 * no pass enablement/routing changes, yields, readiness claims or duplicate draw.
 * Time is synchronous wall time, not GPU completion. Missing diagnostics use
 * NaN; only the first sixteen unambiguous/wrappable pass slots can emit rows.
 */
export function renderCoveredComposerWarm(composer: EffectComposer): CoveredComposerWarmTiming {
  const renderer = composer.renderer;
  const target = renderer.getRenderTarget();
  const face = renderer.getActiveCubeFace();
  const mip = renderer.getActiveMipmapLevel();
  const renderToScreen = composer.renderToScreen;
  const passes: CoveredComposerPassTiming[] = [];
  const restores: (() => void)[] = [];
  let failure: (() => never) | undefined;
  const attempt = (run: () => void): void => {
    try { run(); }
    catch (error) { failure ??= () => { throw error; }; }
  };
  const startedAt = diagnosticNow();
  try {
    const captured = composer.passes.slice(0, MAX_PASS_TIMINGS);
    for (const [index, pass] of captured.entries()) {
      const restore = wrapPass(composer, pass, index, passes);
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
