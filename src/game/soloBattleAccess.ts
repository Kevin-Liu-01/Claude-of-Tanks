import type { RuntimeValue } from '../runtimeTypes.ts';
import { createLazyChunk } from '../app/lazyChunk.ts';
interface SoloBattleRuntime {
  setupBattle(...args: RuntimeValue[]): RuntimeValue;
  simStep(...args: RuntimeValue[]): RuntimeValue;
  createCollider(...args: RuntimeValue[]): RuntimeValue;
  prepareNextOpeningRoute(...args: RuntimeValue[]): RuntimeValue;
  /** The proving ground's quick reset and its moving-target switch (game/state.ts). */
  resetProvingRange(...args: RuntimeValue[]): RuntimeValue;
  setProvingTargetsMoving(...args: RuntimeValue[]): RuntimeValue;
}

/** The chunk as loaded: the runtime, and (round 3 X10) a wait for its world kernels (round 4 F3: each call its own bound). */
interface SoloBattleRuntimeChunk extends SoloBattleRuntime {
  soloKernelsSettled(): Promise<void>;
}

type SoloBattleRuntimeLoader = () => Promise<SoloBattleRuntimeChunk>;

interface SoloBattleRuntimeAccess extends SoloBattleRuntime {
  preload(): Promise<SoloBattleRuntime>;
  isReady(): boolean;
}

/**
 * Retryable lazy access to the legacy solo-authority graph. The composition
 * root receives stable call sites without owning promise/error state, while a
 * rejected transfer can be attempted again instead of permanently wedging
 * first battle entry.
 */
export function createSoloBattleRuntimeAccess(
  load: SoloBattleRuntimeLoader = () => import('./soloBattleRuntime.ts'),
): SoloBattleRuntimeAccess {
  let runtime: SoloBattleRuntime | null = null;
  // (2026-11-02 audit R6, round 2 U35) one app/lazyChunk.ts chunk: a failed transfer is asked again under the one policy
  // (at once after one failure, then past its backoff; a removed chunk shows the reload action), not at once by every call
  // (round 3 X10) A preload resolves once the chunk's world kernels have settled too, so a battle its caller sets up after
  // it rides them. (round 4 F3) The wait is each preload's own, outside the chunk's kept load, which stays the transfer
  // alone: its bound starts once that call has the chunk (after the transfer, when that is still in flight; the chunk's
  // body starts the kernels' load), not at the chunk's first load (the Battle intent, then the garage dwell). The wait
  // never rejects (soloBattleRuntime.ts). Ready (isReady) once any preload's wait has settled, the intent's included: the
  // covered entry's barrier awaits its own preload, and setupBattle comes after it.
  const chunk = createLazyChunk(load);
  const preload = () => {
    const waiting = chunk.load().then((loaded) => loaded.soloKernelsSettled().then(() => (runtime = loaded)));
    // a handled promise, as the chunk's own load is (app/lazyChunk.ts): a caller may drop it, and a failed transfer is
    // then no unhandled rejection (round 4 F3 review r1)
    waiting.catch(() => {});
    return waiting;
  };

  const requireRuntime = () => {
    if (!runtime) throw new Error('Solo battle runtime is not ready.');
    return runtime;
  };

  return {
    preload,
    isReady: () => runtime !== null,
    setupBattle: (...args) => requireRuntime().setupBattle(...args),
    simStep: (...args) => requireRuntime().simStep(...args),
    createCollider: (...args) => requireRuntime().createCollider(...args),
    prepareNextOpeningRoute: (...args) => requireRuntime().prepareNextOpeningRoute(...args),
    resetProvingRange: (...args) => requireRuntime().resetProvingRange(...args),
    setProvingTargetsMoving: (...args) => requireRuntime().setProvingTargetsMoving(...args),
  };
}
