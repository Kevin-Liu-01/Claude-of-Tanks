type PlayMenuModule = typeof import('../ui/playMenu.js');
type BrowserBattleBridgeModule = typeof import('../net/browserBattleBridge.ts');
type NetworkStatusModule = typeof import('../ui/networkStatus.ts');
type BrowserInputRuntimeModule = typeof import('../net/browserInputRuntime.ts');
type PrivateMatchHandoffModule = typeof import('../net/privateMatchHandoff.ts');
type DedicatedClientModule = typeof import('../net/dedicatedClient.ts');
type RoomChatModule = typeof import('../ui/roomChat.js');

export type NetworkBattleModules = [
  BrowserBattleBridgeModule,
  NetworkStatusModule,
  BrowserInputRuntimeModule,
];

interface BattleModuleLoaders {
  playMenu(): Promise<PlayMenuModule>;
  networkBattle(): Promise<NetworkBattleModules>;
  privateMatchHandoff(): Promise<PrivateMatchHandoffModule>;
  dedicatedClient(): Promise<DedicatedClientModule>;
  roomChat(): Promise<RoomChatModule>;
}

export interface BattleModuleAccess {
  loadPlayMenuModule(): Promise<PlayMenuModule>;
  preloadNetworkBattleModules(): Promise<NetworkBattleModules>;
  preloadPrivateMatchHandoffModule(): Promise<PrivateMatchHandoffModule>;
  preloadDedicatedClientModule(): Promise<DedicatedClientModule>;
  preloadNetworkRoomChatModule(): Promise<RoomChatModule>;
}

const DEFAULT_LOADERS: BattleModuleLoaders = {
  playMenu: async () => await import('../ui/playMenu.js'),
  networkBattle: async () => await Promise.all([
    import('../net/browserBattleBridge.ts'),
    import('../ui/networkStatus.ts'),
    import('../net/browserInputRuntime.ts'),
  ]),
  privateMatchHandoff: async () => await import('../net/privateMatchHandoff.ts'),
  dedicatedClient: async () => await import('../net/dedicatedClient.ts'),
  roomChat: async () => await import('../ui/roomChat.js'),
};

function retryable<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (pending) return pending;
    const request = load().catch((error: unknown) => {
      if (pending === request) pending = null;
      throw error;
    });
    pending = request;
    return request;
  };
}

/**
 * Own every battle-only dynamic import shared by garage intent and entry.
 * Failed transfers are retryable; concurrent intent and click paths share one
 * request so slow clients never download or evaluate the same chunk twice.
 */
export function createBattleModuleAccess(
  loaders: BattleModuleLoaders = DEFAULT_LOADERS,
): BattleModuleAccess {
  if (!loaders || Object.values(loaders).some((load) => typeof load !== 'function')) {
    throw new TypeError('battle module access requires all loaders');
  }
  return {
    loadPlayMenuModule: retryable(loaders.playMenu),
    preloadNetworkBattleModules: retryable(loaders.networkBattle),
    preloadPrivateMatchHandoffModule: retryable(loaders.privateMatchHandoff),
    preloadDedicatedClientModule: retryable(loaders.dedicatedClient),
    preloadNetworkRoomChatModule: retryable(loaders.roomChat),
  };
}
