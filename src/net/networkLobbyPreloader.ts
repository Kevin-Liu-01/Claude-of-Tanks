import type { RuntimeValue } from '../runtimeTypes.ts';
import type { NetworkRoomState } from './networkRoomCoordinator.ts';

export interface NetworkLobbyPreloaderOptions {
  getGamePhase(): string;
  preloadPresentation(): Promise<RuntimeValue>;
  preloadVisuals(): Promise<RuntimeValue>;
  preloadBattleModules(): Promise<RuntimeValue>;
  preloadChat(): Promise<RuntimeValue>;
  ensureTankBuilders(specIds: string[]): Promise<RuntimeValue>;
  loadWorldModule(): Promise<RuntimeValue>;
  cancelBackgroundWorldBuildsExcept(mapId: string | null): void;
  prefetchWorld(mapId: string): RuntimeValue;
}

export interface NetworkLobbyPreloader {
  preload(state: NetworkRoomState | null | undefined): boolean;
  readonly pendingCount: number;
  readonly preparedBuilderCount: number;
}

/**
 * Own fire-and-forget room preparation without repeating transfers on every
 * lobby state packet. Failed transfers leave their key retryable.
 */
export function createNetworkLobbyPreloader({
  getGamePhase,
  preloadPresentation,
  preloadVisuals,
  preloadBattleModules,
  preloadChat,
  ensureTankBuilders,
  loadWorldModule,
  cancelBackgroundWorldBuildsExcept,
  prefetchWorld,
}: NetworkLobbyPreloaderOptions): NetworkLobbyPreloader {
  const prepared = new Set<string>();
  const pending = new Map<string, Promise<void>>();
  const preparedBuilders = new Set<string>();
  const pendingBuilders = new Set<string>();
  let mapIntentInitialized = false;
  let requestedMapId: string | null = null;

  const request = (key: string, start: () => Promise<RuntimeValue>): void => {
    if (prepared.has(key) || pending.has(key)) return;
    let transfer: Promise<RuntimeValue>;
    try {
      transfer = Promise.resolve(start());
    } catch (error) {
      transfer = Promise.reject(error);
    }
    const tracked = transfer.then(() => {
      prepared.add(key);
    }).catch(() => {
      // Optional lobby preparation never blocks room interaction. A later
      // state packet retries this exact failed transfer.
    }).finally(() => {
      if (pending.get(key) === tracked) pending.delete(key);
    });
    pending.set(key, tracked);
  };

  const preload = (state: NetworkRoomState | null | undefined): boolean => {
    if (!state || getGamePhase() !== 'garage' || state.phase !== 'waiting') return false;

    request('presentation', preloadPresentation);
    request('visuals', preloadVisuals);
    request('battle-modules', preloadBattleModules);
    request('chat', preloadChat);
    request('world-module', loadWorldModule);

    const missingBuilders: string[] = [];
    for (const player of state.players || []) {
      const specId = player.specId;
      if (!specId || preparedBuilders.has(specId) || pendingBuilders.has(specId)) continue;
      pendingBuilders.add(specId);
      missingBuilders.push(specId);
    }
    if (missingBuilders.length) {
      const key = `builders:${missingBuilders.slice().sort().join(',')}`;
      request(key, () => ensureTankBuilders(missingBuilders).then(() => {
        for (const specId of missingBuilders) preparedBuilders.add(specId);
      }).finally(() => {
        for (const specId of missingBuilders) pendingBuilders.delete(specId);
      }));
    }

    const mapId = state.mapId;
    const nextMapId = !mapId || mapId === 'random' ? null : mapId;
    if (!mapIntentInitialized || nextMapId !== requestedMapId) {
      mapIntentInitialized = true;
      requestedMapId = nextMapId;
      cancelBackgroundWorldBuildsExcept(nextMapId);
      if (nextMapId) prefetchWorld(nextMapId);
    }
    return true;
  };

  return {
    preload,
    get pendingCount() { return pending.size; },
    get preparedBuilderCount() { return preparedBuilders.size; },
  };
}
