import type {
  NetworkRoomCoordinator,
  NetworkRoomPlayer,
  NetworkRoomState,
} from './networkRoomCoordinator.ts';
import type { RankedQueueState } from './rankedServiceClient.ts';
import { isNetworkBattleEntryAbortError } from './networkBattleEntryAbort.ts';

interface BattleEntryLifecyclePort {
  run<T>(task: () => Promise<T>, busyValue: T): Promise<T>;
  readonly pending: boolean;
}

interface BattleLoadPort {
  show(options: Record<string, unknown>): void;
  progress(fraction: number, label: string): void;
  hide(): Promise<unknown> | unknown;
}

interface AudioLoadingPort {
  resume(): unknown;
  loadingOn(active: boolean): unknown;
}

interface NetworkMatchPort {
  playerId?: string;
  role?: string;
  client?: { connected?: boolean; readySent?: boolean };
  host?: {
    matchStarted?: boolean;
    peers?: Map<string, {
      id?: string;
      welcomed?: boolean;
      ready?: boolean;
      pendingRoundReady?: boolean;
      lastRecvSeq?: number;
      transport?: { kind?: string };
    }>;
  };
  prepareRound?(options: Record<string, unknown>): unknown;
}

interface PrivateMatchModule {
  beginPrivateHostMatch(options: Record<string, unknown>): unknown;
  beginPrivateClientMatch(options: Record<string, unknown>): unknown;
  buildPrivateMatchPlayers(state: NetworkRoomState): NetworkRoomPlayer[];
  resolvePrivateMatchMap(state: NetworkRoomState): string;
}

interface DedicatedMatchModule {
  beginDedicatedClientMatch(options: Record<string, unknown>): unknown;
}

interface MapPresentation {
  name: string;
  thumb: string;
  biome: string;
}

interface PresentNetworkBattleRequest {
  viewerId: string;
  own: NetworkRoomPlayer;
  mapId: string;
  matchPlayers: NetworkRoomPlayer[];
  modeLabel: string;
  transitionShown: boolean;
  signal?: AbortSignal;
  connectAfterWorld?: boolean;
  connectMatch: () => unknown;
}

export interface NetworkEntryFailure {
  message: string;
  role?: string;
  clientConnected: boolean;
  clientReadySent: boolean;
  matchStarted: boolean;
  peers: Array<{
    id?: string;
    welcomed?: boolean;
    ready?: boolean;
    pendingRoundReady?: boolean;
    lastRecvSeq?: number;
    transportKind: string | null;
  }>;
}

interface NetworkBattleLaunchOptions {
  lifecycle: BattleEntryLifecyclePort;
  battleLoad: BattleLoadPort;
  audio: AudioLoadingPort;
  getMatch: () => NetworkMatchPort | null;
  getRoomCoordinator: () => NetworkRoomCoordinator | null;
  getWorldCollision: () => unknown;
  getMapPresentation: (mapId: string | null, fallback: string) => MapPresentation;
  rosterRows: (state: NetworkRoomState, team: string, viewerId: string) => unknown[];
  emitBattleStart: (payload: { playerId: string; specId?: string; mapId?: string }) => void;
  resetBattleState: () => void;
  presentBattle: (request: PresentNetworkBattleRequest) => Promise<unknown>;
  loadPrivateMatch: () => Promise<PrivateMatchModule>;
  loadDedicatedMatch: () => Promise<DedicatedMatchModule>;
  disposePresentation: () => void;
  clearNetworkRound: () => void;
  closeMatch: (reason: string) => void;
  enterGarage: () => void;
  setNetworkStatus: (status: unknown) => void;
  recordEntryFailure: (failure: NetworkEntryFailure | null) => void;
  reportError?: (scope: string, error: unknown) => void;
}

export interface PrivateBattleLaunchRequest {
  role?: string;
  session?: { roomInfo?: { peerId?: string } };
  lobbyState?: NetworkRoomState;
  battleLimitS?: number;
}

export interface RankedBattleLaunchRequest {
  serviceUrl?: string;
  state?: RankedQueueState;
}

export interface NetworkBattleLaunchRuntime {
  beginPrivate(request?: PrivateBattleLaunchRequest): Promise<boolean>;
  beginRematch(state: NetworkRoomState): Promise<boolean>;
  beginRanked(request?: RankedBattleLaunchRequest): Promise<void>;
  cancel(reason?: string): void;
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Own private/LAN, rematch, and ranked entry policy above the renderer seam. */
export function createNetworkBattleLaunchRuntime({
  lifecycle,
  battleLoad,
  audio,
  getMatch,
  getRoomCoordinator,
  getWorldCollision,
  getMapPresentation,
  rosterRows,
  emitBattleStart,
  resetBattleState,
  presentBattle,
  loadPrivateMatch,
  loadDedicatedMatch,
  disposePresentation,
  clearNetworkRound,
  closeMatch,
  enterGarage,
  setNetworkStatus,
  recordEntryFailure,
  reportError = (scope, error) => console.error(`[${scope}] entry failed`, error),
}: NetworkBattleLaunchOptions): NetworkBattleLaunchRuntime {
  const required = [lifecycle?.run, battleLoad?.show, battleLoad?.progress,
    battleLoad?.hide, audio?.resume, audio?.loadingOn, getMatch,
    getRoomCoordinator, getWorldCollision, getMapPresentation, rosterRows,
    emitBattleStart, resetBattleState, presentBattle, loadPrivateMatch,
    loadDedicatedMatch, disposePresentation, clearNetworkRound, closeMatch,
    enterGarage, setNetworkStatus, recordEntryFailure, reportError];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('network battle launch runtime requires every lifecycle port');
  }

  const coordinator = (): NetworkRoomCoordinator => {
    const owner = getRoomCoordinator();
    if (!owner) throw new Error('The network room coordinator is unavailable.');
    return owner;
  };
  let activeEntry: AbortController | null = null;

  const beginEntry = () => {
    const controller = new AbortController();
    activeEntry = controller;
    return controller;
  };

  const finishEntry = (controller: AbortController) => {
    if (activeEntry === controller) activeEntry = null;
  };

  const cancel = (reason = 'Network room closed during battle entry.') => {
    if (!activeEntry || activeEntry.signal.aborted) return;
    activeEntry.abort(reason);
  };

  const displayTeamFor = (player: NetworkRoomPlayer): string =>
    player.team === 'spectator' ? 'alpha' : String(player.team || 'alpha');

  const showRoomLoad = (
    state: NetworkRoomState,
    viewerId: string,
    own: NetworkRoomPlayer,
    specId: string,
    modeLabel: string,
    fallback: string,
  ) => {
    const requestedMapId = String(state.mapId || 'random');
    const fixedMapId = requestedMapId === 'random' ? null : requestedMapId;
    const map = getMapPresentation(fixedMapId, fallback);
    const displayTeam = displayTeamFor(own);
    emitBattleStart({ playerId: viewerId, specId, mapId: requestedMapId });
    battleLoad.show({
      mapName: map.name,
      thumb: map.thumb,
      biome: fixedMapId ? map.biome : 'none',
      mode: modeLabel,
      allies: rosterRows(state, displayTeam, viewerId),
      enemies: rosterRows(state, displayTeam === 'alpha' ? 'bravo' : 'alpha', viewerId),
    });
  };

  const stopLoading = async (reason: string) => {
    audio.loadingOn(false);
    closeMatch(reason);
    await battleLoad.hide();
    enterGarage();
  };

  const diagnosticFor = (
    error: unknown,
    role?: string,
  ): NetworkEntryFailure => {
    const match = getMatch();
    return {
      message: messageFor(error),
      role,
      clientConnected: !!match?.client?.connected,
      clientReadySent: !!match?.client?.readySent,
      matchStarted: !!match?.host?.matchStarted,
      peers: match?.host?.peers
        ? [...match.host.peers.values()].map((peer) => ({
          id: peer.id,
          welcomed: peer.welcomed,
          ready: peer.ready,
          pendingRoundReady: peer.pendingRoundReady,
          lastRecvSeq: peer.lastRecvSeq,
          transportKind: peer.transport?.kind || null,
        }))
        : [],
    };
  };

  return {
    async beginPrivate({ role, session, lobbyState, battleLimitS } = {}) {
      if (getMatch()) return false;
      return lifecycle.run(async () => {
        const entryController = beginEntry();
        let entered = false;
        recordEntryFailure(null);
        const viewerId = String(session?.roomInfo?.peerId || '');
        const own = lobbyState?.players?.find((player) => player.id === viewerId);
        try {
          if (!viewerId || !own?.specId || !lobbyState) {
            throw new Error('The lobby identity is unavailable.');
          }
          resetBattleState();
          const modeLabel = lobbyState.mode === 'lan'
            ? 'LAN Battle · Direct Wi-Fi' : 'Private Battle · Room Code';
          showRoomLoad(lobbyState, viewerId, own, own.specId, modeLabel, 'Battle');
          audio.resume();
          audio.loadingOn(true);
          battleLoad.progress(0.01, 'Opening battle channel');
          const privateMatch = await loadPrivateMatch();
          const mapId = privateMatch.resolvePrivateMatchMap(lobbyState);
          const matchPlayers = privateMatch.buildPrivateMatchPlayers(lobbyState);
          await presentBattle({
            viewerId,
            own,
            mapId,
            matchPlayers,
            modeLabel,
            transitionShown: true,
            signal: entryController.signal,
            connectAfterWorld: role === 'host',
            connectMatch: () => role === 'host'
              ? privateMatch.beginPrivateHostMatch({
                session, lobbyState, worldCollision: getWorldCollision(), battleLimitS,
              })
              : privateMatch.beginPrivateClientMatch({ session, playerId: viewerId, lobbyState }),
          });
          coordinator().attach(lobbyState);
          entered = true;
        } catch (error) {
          const cancelled = entryController.signal.aborted
            || isNetworkBattleEntryAbortError(error);
          if (!cancelled) {
            recordEntryFailure(diagnosticFor(error, role));
            reportError('network', error);
          }
          await stopLoading(cancelled ? 'entry_cancelled' : 'entry_failed');
        } finally {
          finishEntry(entryController);
        }
        return entered;
      }, false);
    },

    async beginRematch(lobbyState) {
      const room = coordinator();
      const round = Number(lobbyState?.round) || 0;
      const existingMatch = getMatch();
      if (!existingMatch || !room.claimRematch(lobbyState, lifecycle.pending)) return false;
      return lifecycle.run(async () => {
        const entryController = beginEntry();
        const viewerId = String(existingMatch.playerId || '');
        const own = lobbyState.players.find((player) => player.id === viewerId);
        try {
          if (!viewerId || !own) throw new Error('Your player is no longer in this room.');
          const modeLabel = lobbyState.mode === 'lan'
            ? `LAN Battle · Round ${round}` : `Private Battle · Round ${round}`;
          if (!own.specId) throw new Error('Your selected vehicle is unavailable.');
          showRoomLoad(lobbyState, viewerId, own, own.specId, modeLabel, 'Next battle');
          audio.resume();
          audio.loadingOn(true);
          battleLoad.progress(0.01, 'Preparing the next round');
          disposePresentation();
          clearNetworkRound();
          const privateMatch = await loadPrivateMatch();
          const mapId = privateMatch.resolvePrivateMatchMap(lobbyState);
          const matchPlayers = privateMatch.buildPrivateMatchPlayers(lobbyState);
          await presentBattle({
            viewerId,
            own,
            mapId,
            matchPlayers,
            modeLabel,
            transitionShown: true,
            signal: entryController.signal,
            connectMatch: () => {
              const match = getMatch();
              if (!match) throw new Error('The retained room transport is unavailable.');
              if (match.role === 'host') {
                match.prepareRound?.({ lobbyState, worldCollision: getWorldCollision() });
              }
              return match;
            },
          });
          return true;
        } catch (error) {
          const cancelled = entryController.signal.aborted
            || isNetworkBattleEntryAbortError(error);
          if (!cancelled) reportError('network rematch', error);
          await stopLoading(cancelled ? 'entry_cancelled' : 'rematch_entry_failed');
          return false;
        } finally {
          finishEntry(entryController);
          room.finishRematch();
        }
      }, false);
    },

    async beginRanked({ serviceUrl, state } = {}) {
      if (getMatch()) return;
      await lifecycle.run(async () => {
        const entryController = beginEntry();
        const ticket = state?.match;
        const viewerId = String(ticket?.playerId || '');
        const own = ticket?.roster?.find((player) => player.id === viewerId);
        try {
          if (!ticket || !ticket.mapId || !viewerId || !own?.specId || !ticket.roster) {
            throw new Error('Ranked match ticket is incomplete.');
          }
          resetBattleState();
          const modeLabel = `Ranked · ${Number(own.rating) || 1000} rating`;
          const displayTeam = displayTeamFor(own);
          emitBattleStart({ playerId: viewerId, specId: own.specId, mapId: ticket.mapId });
          battleLoad.show({
            mapName: 'Ranked operation',
            thumb: '',
            biome: ticket.mapId,
            mode: modeLabel,
            allies: rosterRows({ players: ticket.roster }, displayTeam, viewerId),
            enemies: rosterRows({ players: ticket.roster },
              displayTeam === 'alpha' ? 'bravo' : 'alpha', viewerId),
          });
          audio.resume();
          audio.loadingOn(true);
          battleLoad.progress(0.01, 'Opening dedicated channel');
          const dedicatedMatch = await loadDedicatedMatch();
          await presentBattle({
            viewerId,
            own,
            mapId: ticket.mapId,
            matchPlayers: ticket.roster,
            modeLabel,
            transitionShown: true,
            signal: entryController.signal,
            connectMatch: () => dedicatedMatch.beginDedicatedClientMatch({
              url: serviceUrl,
              ticket,
              onStatus: setNetworkStatus,
            }),
          });
        } catch (error) {
          const cancelled = entryController.signal.aborted
            || isNetworkBattleEntryAbortError(error);
          if (!cancelled) reportError('ranked', error);
          await stopLoading(cancelled ? 'entry_cancelled' : 'entry_failed');
        } finally {
          finishEntry(entryController);
        }
      }, undefined);
    },

    cancel,
  };
}
