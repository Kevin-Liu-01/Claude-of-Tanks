import type { RoomChatInput, RoomChatOptions, RoomChatRuntime } from '../ui/roomChat.ts';
import type {
  ActiveRoomAdapter,
  PlayMenuRuntime,
} from '../ui/playMenu.ts';
import type { SerializedLobby } from './lobby.ts';

export interface NetworkRoomPlayer {
  id: string;
  name?: string;
  team?: string;
  ready?: boolean;
  specId?: string | null;
  equipment?: string[];
  camo?: string;
  connected?: boolean;
  isHost?: boolean;
  rating?: number | null;
}

export interface NetworkRoomState {
  roomCode?: string;
  mode?: string;
  gameMode?: string;
  phase?: string;
  hostId?: string;
  maxPlayers?: number;
  maxSpectators?: number;
  allowTeamSwitch?: boolean;
  locked?: boolean;
  round?: number;
  mapId?: string;
  teamSize?: number;
  revision?: number;
  matchSeed?: number | null;
  lastResult?: unknown;
  players: NetworkRoomPlayer[];
}

export interface NetworkLobbyContext {
  state: NetworkRoomState;
  playerId: string;
  role?: string;
}

interface NetworkRoomMatch {
  playerId?: string;
  role?: string;
  client?: { closed?: boolean };
  roomCommand?(command: Record<string, unknown>): unknown;
  onRoomState?(listener: (state: NetworkRoomState) => void): (() => void) | void;
  onRoomChat?(listener: (message: unknown) => void): (() => void) | void;
  getRoomChatHistory?(): unknown[];
  sendRoomChat?(text: string): boolean;
}

interface RoomChatModule {
  createRoomChat(options: RoomChatOptions): RoomChatRuntime;
}

interface GarageRoomStatus {
  roomCode?: string;
  mode?: string;
  ready: boolean;
  readyCount: number;
  total: number;
}

interface NetworkRoomCoordinatorOptions {
  getMatch: () => NetworkRoomMatch | null;
  getPlayMenu: () => Promise<PlayMenuRuntime> | null;
  loadRoomChat: () => Promise<RoomChatModule>;
  getPhase: () => string;
  isSettingsOpen: () => boolean;
  hasResult: () => boolean;
  isKillcamActive: () => boolean;
  isSpectator: () => boolean;
  input: RoomChatInput;
  setGarageStatus: (status: GarageRoomStatus | null) => void;
  emitRoomState: (payload: unknown) => void;
  preloadLobbyIntent: (state: NetworkRoomState) => void;
  equipmentFor: (specId: string) => unknown;
  camoFor: (specId: string) => string;
  onRematch: (state: NetworkRoomState) => unknown;
  onClose: (reason: string) => void;
  schedule?: (callback: () => void) => void;
  randomUint32?: () => number;
}

export interface NetworkRoomCoordinator {
  handleLobbyChange(context: NetworkLobbyContext | null): void;
  syncPendingLobbySelection(): void;
  syncVehicle(specId: string): void;
  syncCamo(specId: string): void;
  attach(initialState: NetworkRoomState): void;
  clear(): void;
  syncChatVisibility(): void;
  showActiveRoom(): Promise<boolean>;
  setReady(ready: boolean): boolean;
  startRound(): boolean;
  claimRematch(state: NetworkRoomState, blocked?: boolean): boolean;
  finishRematch(): void;
  shouldPreserveAfterResult(): boolean;
  readonly activeRoom: NetworkRoomState | null;
  readonly pendingLobby: NetworkLobbyContext | null;
  readonly activePlayer: NetworkRoomPlayer | null;
}

function defaultRandomUint32(): number {
  const words = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(words);
  else words[0] = (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
  return words[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isLobbyPhase(value: unknown): value is SerializedLobby['phase'] {
  return value === 'waiting' || value === 'starting' ||
    value === 'playing' || value === 'finished';
}

function isGameMode(value: unknown): value is SerializedLobby['gameMode'] {
  return value === 'standard' || value === 'capture_the_flag' ||
    value === 'zone_control' || value === 'turbo_ball' ||
    value === 'endless_horde';
}

/**
 * Match transport deliberately exposes a small room-state view. The lobby UI
 * needs the complete canonical state, so validate that stronger contract at
 * the presentation boundary instead of casting a partial packet into it.
 */
function isSerializedLobbyState(
  state: NetworkRoomState,
): state is NetworkRoomState & SerializedLobby {
  const result = state.lastResult;
  const validResult = result === null || (
    isRecord(result) &&
    Number.isSafeInteger(result.round) && Number(result.round) >= 0 &&
    (result.result === null || typeof result.result === 'string') &&
    (result.reason === null || typeof result.reason === 'string')
  );
  const validPlayers = state.players.every((player) =>
    typeof player.id === 'string' && /^[a-zA-Z0-9_-]{1,48}$/.test(player.id) &&
    typeof player.name === 'string' && player.name.length > 0 &&
    (player.team === 'alpha' || player.team === 'bravo' || player.team === 'spectator') &&
    (player.specId === null || typeof player.specId === 'string') &&
    Array.isArray(player.equipment) &&
    player.equipment.every((entry) => typeof entry === 'string') &&
    typeof player.camo === 'string' &&
    typeof player.ready === 'boolean' &&
    typeof player.connected === 'boolean' &&
    typeof player.isHost === 'boolean' &&
    (player.rating === null || (typeof player.rating === 'number' &&
      Number.isFinite(player.rating))));
  const playerIds = validPlayers ? state.players.map((player) => player.id) : [];
  return typeof state.roomCode === 'string' && /^[A-Z0-9]{6}$/.test(state.roomCode) &&
    typeof state.mode === 'string' &&
    isGameMode(state.gameMode) &&
    isLobbyPhase(state.phase) &&
    typeof state.hostId === 'string' && playerIds.includes(state.hostId) &&
    Number.isSafeInteger(state.maxPlayers) && Number(state.maxPlayers) >= 0 &&
    Number.isSafeInteger(state.maxSpectators) && Number(state.maxSpectators) >= 0 &&
    typeof state.allowTeamSwitch === 'boolean' &&
    typeof state.locked === 'boolean' &&
    typeof state.mapId === 'string' &&
    Number.isSafeInteger(state.teamSize) && Number(state.teamSize) > 0 &&
    Number.isSafeInteger(state.revision) && Number(state.revision) >= 0 &&
    (state.matchSeed === null || (Number.isSafeInteger(state.matchSeed) &&
      Number(state.matchSeed) >= 0)) &&
    Number.isSafeInteger(state.round) && Number(state.round) >= 0 &&
    validResult &&
    validPlayers && new Set(playerIds).size === playerIds.length;
}

/** Own the browser room lifecycle from lobby handoff through repeated rounds. */
export function createNetworkRoomCoordinator({
  getMatch,
  getPlayMenu,
  loadRoomChat,
  getPhase,
  isSettingsOpen,
  hasResult,
  isKillcamActive,
  isSpectator,
  input,
  setGarageStatus,
  emitRoomState,
  preloadLobbyIntent,
  equipmentFor,
  camoFor,
  onRematch,
  onClose,
  schedule = queueMicrotask,
  randomUint32 = defaultRandomUint32,
}: NetworkRoomCoordinatorOptions): NetworkRoomCoordinator {
  const required = [getMatch, getPlayMenu, loadRoomChat, getPhase,
    isSettingsOpen, hasResult, isKillcamActive, isSpectator, setGarageStatus,
    emitRoomState, preloadLobbyIntent, equipmentFor, camoFor, onRematch,
    onClose, schedule, randomUint32];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('network room coordinator requires all runtime hooks');
  }

  let pendingLobby: NetworkLobbyContext | null = null;
  let activeRoom: NetworkRoomState | null = null;
  let unsubscribeRoom: (() => void) | null = null;
  let unsubscribeChat: (() => void) | null = null;
  let menuAttached = false;
  let presentedRound = 0;
  let rematchPending = false;
  const pendingChat: unknown[] = [];
  let roomChat: RoomChatRuntime | null = null;
  let roomChatPromise: Promise<RoomChatRuntime> | null = null;

  const matchPlayer = (state = activeRoom): NetworkRoomPlayer | null => {
    const playerId = getMatch()?.playerId;
    return state?.players?.find((player) => player.id === playerId) || null;
  };

  const roomStatus = (state: NetworkRoomState | null, playerId?: string): GarageRoomStatus | null => {
    const me = state?.players?.find((player) => player.id === playerId);
    if (!state || !me) return null;
    const active = state.players.filter((player) => player.team !== 'spectator');
    return {
      roomCode: state.roomCode,
      mode: state.mode,
      ready: !!me.ready,
      readyCount: active.filter((player) => player.ready).length,
      total: active.length,
    };
  };

  const chatVisible = () => !!(getMatch() && activeRoom && getPhase() === 'battle');

  const syncChatVisibility = () => {
    if (!roomChat) return;
    roomChat.setPlayer(getMatch()?.playerId || '');
    roomChat.setActive(chatVisible());
  };

  const handleChat = (message: unknown) => {
    if (roomChat) roomChat.append(message);
    else {
      pendingChat.push(message);
      if (pendingChat.length > 48) pendingChat.shift();
    }
  };

  const ensureChat = (): Promise<RoomChatRuntime> => {
    if (roomChat) return Promise.resolve(roomChat);
    if (roomChatPromise) return roomChatPromise;
    const request = loadRoomChat().then(({ createRoomChat }) => {
      roomChat = createRoomChat({
        input,
        onSend: (text: string) => getMatch()?.sendRoomChat?.(text) || false,
        isAvailable: () => chatVisible() && !isSettingsOpen(),
        shouldRelock: () => chatVisible() && !isSettingsOpen() && !hasResult() &&
          !isKillcamActive() && !isSpectator(),
      });
      roomChat.setPlayer(getMatch()?.playerId || '');
      for (const message of getMatch()?.getRoomChatHistory?.() || []) roomChat.append(message);
      for (const message of pendingChat.splice(0)) roomChat.append(message);
      syncChatVisibility();
      return roomChat;
    }).catch((error: unknown) => {
      if (roomChatPromise === request) roomChatPromise = null;
      throw error;
    });
    roomChatPromise = request;
    return request;
  };

  const syncMenuPresentation = (
    menu: PlayMenuRuntime,
    state: NetworkRoomState,
  ): boolean => {
    if (!isSerializedLobbyState(state)) return false;
    const adapter: ActiveRoomAdapter = {
      state,
      playerId: getMatch()?.playerId || '',
      role: getMatch()?.role === 'host' ? 'host' : 'client',
      command: (command: Record<string, unknown>) => getMatch()?.roomCommand?.(command),
      leave: (reason?: string) => onClose(reason || 'left_room'),
    };
    if (!menuAttached) {
      menu.attachActiveRoom(adapter);
      menuAttached = true;
    } else menu.updateActiveRoom(state);
    return true;
  };

  const present = (state: NetworkRoomState) => {
    preloadLobbyIntent(state);
    const match = getMatch();
    setGarageStatus(roomStatus(state, match?.playerId));
    emitRoomState({
      state,
      playerId: match?.playerId || '',
      role: match?.role || 'client',
    });
    syncChatVisibility();
    // Room authority commonly publishes the waiting/rematch state just before
    // the final combat snapshot. Rebuilding the hidden 14-player lobby at that
    // edge caused a 62 ms live frame and then a presentation backlog. Preserve
    // the state and lightweight garage reminder, but defer the invisible DOM
    // rebuild until results/garage can display it or the player opens the room.
    if (getPhase() === 'battle' && !hasResult()) return;
    const menuPromise = getPlayMenu();
    if (!menuPromise) return;
    menuPromise.then((menu) => {
      if (!activeRoom) return;
      syncMenuPresentation(menu, activeRoom);
    }).catch(() => { /* optional room presentation retries on the next state */ });
  };

  const handleState = (state: NetworkRoomState) => {
    if (!state || !Array.isArray(state.players)) return;
    activeRoom = state;
    present(state);
    const round = Number(state.round) || 0;
    if (state.phase === 'starting' && round > presentedRound && !rematchPending) {
      rematchPending = true;
      schedule(() => { void onRematch(state); });
    }
  };

  const coordinator: NetworkRoomCoordinator = {
    handleLobbyChange(context) {
      pendingLobby = context?.state ? context : null;
      if (pendingLobby) preloadLobbyIntent(pendingLobby.state);
      if (activeRoom) return;
      setGarageStatus(pendingLobby
        ? roomStatus(pendingLobby.state, pendingLobby.playerId)
        : null);
    },

    syncPendingLobbySelection() {
      const menuPromise = getPlayMenu();
      if (!pendingLobby || !menuPromise) return;
      menuPromise.then((menu) => menu.syncGarageSelection()).catch(() => null);
    },

    syncVehicle(specId) {
      const me = matchPlayer();
      if (!me || me.ready || activeRoom?.phase !== 'waiting') return;
      const match = getMatch();
      if (me.specId !== specId) match?.roomCommand?.({ type: 'select_vehicle', specId });
      match?.roomCommand?.({ type: 'select_equipment', equipment: equipmentFor(specId) });
      coordinator.syncCamo(specId);
    },

    syncCamo(specId) {
      const me = matchPlayer();
      if (!me || me.ready || activeRoom?.phase !== 'waiting') return;
      const camo = camoFor(specId);
      if (me.camo !== camo) getMatch()?.roomCommand?.({ type: 'select_camo', camo });
    },

    attach(initialState) {
      const match = getMatch();
      if (!match?.onRoomState) return;
      unsubscribeRoom?.();
      unsubscribeChat?.();
      activeRoom = initialState;
      presentedRound = Number(initialState?.round) || 1;
      rematchPending = false;
      present(initialState);
      unsubscribeRoom = match.onRoomState(handleState) || null;
      unsubscribeChat = match.onRoomChat?.(handleChat) || null;
      void ensureChat().catch(() => null);
    },

    clear() {
      unsubscribeRoom?.();
      unsubscribeChat?.();
      unsubscribeRoom = null;
      unsubscribeChat = null;
      activeRoom = null;
      presentedRound = 0;
      rematchPending = false;
      pendingChat.length = 0;
      if (roomChat) {
        roomChat.setActive(false);
        roomChat.clear();
      }
      setGarageStatus(null);
      getPlayMenu()?.then((menu) => menu.detachActiveRoom()).catch(() => null);
      menuAttached = false;
      emitRoomState(null);
    },

    syncChatVisibility,

    async showActiveRoom() {
      const match = getMatch();
      const menuPromise = getPlayMenu();
      if (!activeRoom || !match || match.client?.closed || !menuPromise) return false;
      const menu = await menuPromise;
      if (!syncMenuPresentation(menu, activeRoom)) return false;
      return !!menu.showActiveRoom();
    },

    setReady(ready) {
      if (activeRoom?.phase !== 'waiting') return false;
      getMatch()?.roomCommand?.({ type: 'set_ready', ready: !!ready });
      return true;
    },

    startRound() {
      const match = getMatch();
      if (match?.role !== 'host' || activeRoom?.phase !== 'waiting') return false;
      match.roomCommand?.({ type: 'start', matchSeed: randomUint32() >>> 0 });
      return true;
    },

    claimRematch(state, blocked = false) {
      const round = Number(state?.round) || 0;
      const match = getMatch();
      if (!match || match.client?.closed || blocked || state?.phase !== 'starting' ||
          round <= presentedRound) {
        rematchPending = false;
        return false;
      }
      presentedRound = round;
      return true;
    },

    finishRematch() { rematchPending = false; },

    shouldPreserveAfterResult() {
      const match = getMatch();
      return !!(activeRoom && match && !match.client?.closed && hasResult());
    },

    get activeRoom() { return activeRoom; },
    get pendingLobby() { return pendingLobby; },
    get activePlayer() { return matchPlayer(); },
  };

  return coordinator;
}
