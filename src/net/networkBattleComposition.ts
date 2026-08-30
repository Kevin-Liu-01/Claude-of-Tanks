import {
  createNetworkBattleActivationRuntime,
  type NetworkBattleActivationOptions,
  type NetworkBattleActivationRuntime,
} from './networkBattleActivationRuntime.ts';
import {
  createNetworkBattleLaunchRuntime,
  type NetworkBattleLaunchOptions,
  type NetworkBattleLaunchRuntime,
} from './networkBattleLaunchRuntime.ts';
import { createNetworkBattlePresentationAccess } from './networkBattlePresentationAccess.ts';
import type { NetworkBattlePresentationOptions } from './networkBattlePresentationRuntime.ts';
import {
  createNetworkLobbyPreloader,
  type NetworkLobbyPreloader,
  type NetworkLobbyPreloaderOptions,
} from './networkLobbyPreloader.ts';
import {
  createNetworkRoomCoordinator,
  type NetworkRoomCoordinator,
  type NetworkRoomCoordinatorOptions,
} from './networkRoomCoordinator.ts';
import {
  createNetworkRoundLifecycle,
  type NetworkRoundLifecycle,
  type NetworkRoundLifecycleOptions,
} from './networkRoundLifecycle.ts';

type PresentationLifecyclePorts = Pick<
  NetworkBattlePresentationOptions['presentation'],
  'setGarageLighting' | 'runBlackWatchdog'
>;

export type NetworkBattleCompositionPresentationOptions = Omit<
  NetworkBattlePresentationOptions,
  'presentation'
> & {
  presentation: PresentationLifecyclePorts;
};

export interface NetworkBattleCompositionOptions {
  round: Pick<NetworkRoundLifecycleOptions, 'game' | 'session'>;
  presentation: NetworkBattleCompositionPresentationOptions;
  launcher: Omit<
    NetworkBattleLaunchOptions,
    | 'getRoomCoordinator'
    | 'resetBattleState'
    | 'presentBattle'
    | 'disposePresentation'
    | 'clearNetworkRound'
    | 'closeMatch'
  >;
  lobby: Omit<NetworkLobbyPreloaderOptions, 'preloadPresentation'>;
  room: Omit<
    NetworkRoomCoordinatorOptions,
    'preloadLobbyIntent' | 'onRematch' | 'onClose'
  >;
  activation: NetworkBattleActivationOptions;
}

type NetworkBattlePresentationAccess = ReturnType<
  typeof createNetworkBattlePresentationAccess
>;

export interface NetworkBattleCompositionRuntime {
  readonly room: NetworkRoomCoordinator;
  readonly round: NetworkRoundLifecycle;
  readonly launcher: NetworkBattleLaunchRuntime;
  readonly lobby: NetworkLobbyPreloader;
  readonly activation: NetworkBattleActivationRuntime;
  readonly presentation: NetworkBattlePresentationAccess;
}

export interface NetworkBattleCompositionFactories {
  createRound: typeof createNetworkRoundLifecycle;
  createPresentation: typeof createNetworkBattlePresentationAccess;
  createLauncher: typeof createNetworkBattleLaunchRuntime;
  createLobby: typeof createNetworkLobbyPreloader;
  createRoom: typeof createNetworkRoomCoordinator;
  createActivation: typeof createNetworkBattleActivationRuntime;
}

const defaultFactories: NetworkBattleCompositionFactories = {
  createRound: createNetworkRoundLifecycle,
  createPresentation: createNetworkBattlePresentationAccess,
  createLauncher: createNetworkBattleLaunchRuntime,
  createLobby: createNetworkLobbyPreloader,
  createRoom: createNetworkRoomCoordinator,
  createActivation: createNetworkBattleActivationRuntime,
};

/**
 * Assemble the one browser multiplayer lifecycle from transport-independent
 * owners. Circular references stay inside this typed boundary: main supplies
 * concrete game, renderer, UI and loader ports but cannot wire teardown,
 * rematch or activation in a different order.
 */
export function createNetworkBattleComposition(
  options: NetworkBattleCompositionOptions,
  factories: NetworkBattleCompositionFactories = defaultFactories,
): NetworkBattleCompositionRuntime {
  let launcher: NetworkBattleLaunchRuntime | null = null;
  let room: NetworkRoomCoordinator | null = null;

  const round = factories.createRound({
    ...options.round,
    getEntryOwner: () => launcher,
    getRoomOwner: () => room,
  });
  const activation = factories.createActivation(options.activation);
  const presentation = factories.createPresentation({
    options: () => ({
      ...options.presentation,
      presentation: {
        ...options.presentation.presentation,
        resetRoundState: round.resetBattleState,
        activate: activation.activate,
      },
    }),
  });
  launcher = factories.createLauncher({
    ...options.launcher,
    getRoomCoordinator: () => room,
    resetBattleState: round.resetBattleState,
    presentBattle: presentation.present,
    disposePresentation: round.disposePresentation,
    clearNetworkRound: round.clearRound,
    closeMatch: round.close,
  });
  const lobby = factories.createLobby({
    ...options.lobby,
    preloadPresentation: presentation.preload,
  });
  room = factories.createRoom({
    ...options.room,
    preloadLobbyIntent: lobby.preload,
    onRematch: launcher.beginRematch,
    onClose: round.close,
  });

  return {
    room,
    round,
    launcher,
    lobby,
    activation,
    presentation,
  };
}
