import type { RuntimeValue } from '../runtimeTypes.ts';
import type { BattleEntryLifecycle } from './battleEntryLifecycle.ts';
import type {
  SoloBattleLoadingRuntime,
  SoloBattleLoadingStartOptions,
} from './soloBattleLoadingRuntime.ts';

interface EntryLoadScreen {
  hide?(): Promise<RuntimeValue> | RuntimeValue;
}

interface EntryAudio {
  loadingOn(active: boolean): void;
}

export interface SoloBattleEntryRequest extends SoloBattleLoadingStartOptions {
  specId?: string;
  mapId?: string | null;
}

export interface SoloBattleEntryRuntimeOptions {
  lifecycle: BattleEntryLifecycle;
  loading: SoloBattleLoadingRuntime;
  battleLoad: EntryLoadScreen;
  audio: EntryAudio;
  enterGarage(): Promise<void> | void;
  nextFrame(): Promise<RuntimeValue>;
  isVisibleSpecId(specId: string): boolean;
  getSelectedSpecId(): string;
  getSelectedMapId(): string;
  reportError?(message: string, error: RuntimeValue): void;
}

export interface SoloBattleEntryRuntime {
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
}: SoloBattleEntryRuntimeOptions): SoloBattleEntryRuntime {
  const required = [lifecycle?.run, lifecycle?.coverRendering,
    lifecycle?.uncoverRendering, loading?.begin, audio?.loadingOn, enterGarage,
    nextFrame, isVisibleSpecId, getSelectedSpecId, getSelectedMapId, reportError];
  if (!battleLoad || required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('solo battle entry runtime requires every recovery port');
  }

  const begin = (
    specId: string,
    mapId: string | null = null,
    options: SoloBattleLoadingStartOptions | undefined = undefined,
  ): Promise<void> => lifecycle.run(async () => {
    try {
      lifecycle.coverRendering();
      await loading.begin(specId, mapId, options);
    } catch (error) {
      reportError('[battle] entry failed', error);
      audio.loadingOn(false);
      await enterGarage();
      lifecycle.uncoverRendering();
      await nextFrame();
      await battleLoad.hide?.();
    }
  }, undefined);

  return Object.freeze({
    begin,
    beginSelected({
      specId,
      mapId,
      randomRoster = true,
      gameMode = 'standard',
    }: SoloBattleEntryRequest = {}) {
      const selected = specId && isVisibleSpecId(specId) ? specId : getSelectedSpecId();
      return begin(selected, mapId || getSelectedMapId(), { randomRoster, gameMode });
    },
  });
}
