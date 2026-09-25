import type { RuntimeValue } from '../runtimeTypes.ts';
import type { BattleEntryLifecycle } from './battleEntryLifecycle.ts';
import type {
  SoloBattleLoadingRuntime,
  SoloBattleLoadingStartOptions,
} from './soloBattleLoadingRuntime.ts';

interface EntryLoadScreen {
  showPending(): void;
  hide?(): Promise<RuntimeValue> | RuntimeValue;
}

interface EntryAudio {
  loadingOn(active: boolean): void;
}

export interface SoloBattleEntryRequest extends SoloBattleLoadingStartOptions {
  specId?: string;
  mapId?: string | null;
  /** Campaign ladder operation this sortie belongs to (mission brief copy); null for free sorties. */
  campaignOperationId?: string | null;
}

interface SoloBattleEntryRuntimeOptions {
  lifecycle: BattleEntryLifecycle;
  loading: SoloBattleLoadingRuntime;
  battleLoad: EntryLoadScreen;
  audio: EntryAudio;
  enterGarage(): Promise<void> | void;
  /** Leave the recovered Garage's pre-paint checkpoint before fading coverage. */
  nextFrame(): Promise<RuntimeValue>;
  isVisibleSpecId(specId: string): boolean;
  getSelectedSpecId(): string;
  getSelectedMapId(): string;
  reportError?(message: string, error: RuntimeValue): void;
  /**
   * Entry resilience (2026-09-25): show the player why the battle did not
   * start, after the recovered Garage is painted and the loader has faded.
   * Demand-loaded by the composition root; a failed notice never masks the
   * original failure.
   */
  presentFailure?(error: RuntimeValue): Promise<RuntimeValue> | RuntimeValue;
  /** Beacon port: the bounded outcome of a failed solo entry. */
  onFailure?(error: RuntimeValue): void;
}

interface SoloBattleEntryRuntime {
  begin(
    specId: string,
    mapId?: string | null,
    options?: SoloBattleLoadingStartOptions,
  ): Promise<void>;
  beginSelected(request?: SoloBattleEntryRequest): Promise<void>;
}

/**
 * Owns the player-facing solo entry transaction and its fail-safe return. A
 * failed cold import or world build paints the restored Garage while coverage
 * is still opaque, then dismisses the loader so a first visit cannot strand a
 * stale or black WebGL frame.
 */
export function createSoloBattleEntryRuntime({
  lifecycle,
  loading,
  battleLoad,
  audio,
  enterGarage,
  nextFrame,
  isVisibleSpecId,
  getSelectedSpecId,
  getSelectedMapId,
  reportError = (message, error) => console.error(message, error),
  presentFailure = () => {},
  onFailure = () => {},
}: SoloBattleEntryRuntimeOptions): SoloBattleEntryRuntime {
  const required = [battleLoad?.showPending, lifecycle?.run, lifecycle?.coverRendering,
    lifecycle?.uncoverRendering, loading?.begin, audio?.loadingOn, enterGarage,
    nextFrame, isVisibleSpecId, getSelectedSpecId, getSelectedMapId, reportError, presentFailure, onFailure];
  if (!battleLoad || required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('solo battle entry runtime requires every recovery port');
  }

  const begin = (
    specId: string,
    mapId: string | null = null,
    options: SoloBattleLoadingStartOptions | undefined = undefined,
  ): Promise<void> => lifecycle.run(async () => {
    try {
      // The loading transaction itself is demand-loaded. Own its canonical
      // surface inside the accepted entry latch before awaiting that import.
      battleLoad.showPending();
      lifecycle.coverRendering();
      await loading.begin(specId, mapId, options);
    } catch (error) {
      reportError('[battle] entry failed', error);
      try { onFailure(error); } catch (_) { /* a beacon never changes recovery */ }
      audio.loadingOn(false);
      await enterGarage();
      lifecycle.uncoverRendering();
      await nextFrame();
      await battleLoad.hide?.();
      // Entry resilience (2026-09-25): the player used to be returned to the
      // Garage with nothing but a console line. The notice comes last so it
      // opens over a painted Garage, and its own failure is only reported.
      try {
        await presentFailure(error);
      } catch (noticeError) {
        reportError('[battle] entry failure notice unavailable', noticeError);
      }
    }
  }, undefined);

  return Object.freeze({
    begin,
    beginSelected({
      specId,
      mapId,
      randomRoster = true,
      gameMode = 'standard',
      campaignOperationId = null,
    }: SoloBattleEntryRequest = {}) {
      const selected = specId && isVisibleSpecId(specId) ? specId : getSelectedSpecId();
      return begin(selected, mapId || getSelectedMapId(), {
        randomRoster, gameMode, ...(campaignOperationId ? { campaignOperationId } : {}),
      });
    },
  });
}
