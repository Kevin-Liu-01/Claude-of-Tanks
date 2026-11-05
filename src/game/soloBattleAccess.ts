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

type SoloBattleRuntimeLoader = () => Promise<SoloBattleRuntime>;

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
  const chunk = createLazyChunk(() => load().then((loaded) => (runtime = loaded)));
  const preload = () => chunk.load();

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
