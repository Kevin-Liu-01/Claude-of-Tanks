import { MAX_PLAYERS, MAX_SPECTATORS, normalizeRoomCode } from './protocol.js';
import { normalizePlayerName, uniquePlayerName } from './playerNames.js';
import { networkCamoId } from '../vehicles/camoPolicy.js';
import { normalizeGameMode, type GameModeId } from '../sim/matchModes.ts';

export const LOBBY_PHASES = {
  WAITING: 'waiting',
  STARTING: 'starting',
  PLAYING: 'playing',
  FINISHED: 'finished',
} as const;

export const LOBBY_TEAMS = {
  ALPHA: 'alpha',
  BRAVO: 'bravo',
  SPECTATOR: 'spectator',
} as const;

export type LobbyPhase = typeof LOBBY_PHASES[keyof typeof LOBBY_PHASES];
export type LobbyTeam = typeof LOBBY_TEAMS[keyof typeof LOBBY_TEAMS];

export interface LobbyPlayer {
  id: string;
  name: string;
  team: LobbyTeam;
  specId: string | null;
  equipment: string[];
  camo: string;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  rating: number | null;
}

export interface LobbyResult {
  round: number;
  result: string | null;
  reason: string | null;
}

export interface LobbyState {
  roomCode: string;
  mode: string;
  gameMode: GameModeId;
  phase: LobbyPhase;
  hostId: string;
  maxPlayers: number;
  maxSpectators: number;
  allowTeamSwitch: boolean;
  locked: boolean;
  mapId: string;
  teamSize: number;
  revision: number;
  updatedAtTick: number;
  matchSeed: number | null;
  round: number;
  lastResult: LobbyResult | null;
  players: Map<string, LobbyPlayer>;
}

export interface SerializedLobby extends Omit<LobbyState, 'players' | 'updatedAtTick'> {
  players: LobbyPlayer[];
}

interface LobbyPlayerInput {
  id?: unknown;
  name?: unknown;
  team?: unknown;
  specId?: unknown;
  equipment?: unknown;
  camo?: unknown;
  isHost?: boolean;
  rating?: unknown;
}

export interface CreateLobbyOptions {
  roomCode?: unknown;
  hostId?: unknown;
  hostName?: unknown;
  maxPlayers?: number;
  maxSpectators?: number;
  mode?: unknown;
  gameMode?: unknown;
  mapId?: unknown;
  allowTeamSwitch?: boolean;
  hostSpecId?: unknown;
  hostEquipment?: unknown;
  hostCamo?: unknown;
  teamSize?: number;
}

export interface AddLobbyPlayerOptions extends LobbyPlayerInput {
  id?: unknown;
  name?: unknown;
}

interface LobbyCommand extends Record<string, unknown> {
  type?: unknown;
  name?: unknown;
  specId?: unknown;
  equipment?: unknown;
  camo?: unknown;
  ready?: unknown;
  team?: unknown;
  gameMode?: unknown;
  teamSize?: unknown;
  mapId?: unknown;
  locked?: unknown;
  matchSeed?: unknown;
}

interface LobbyCommandGuards {
  isVehicleAllowed(specId: string, player: LobbyPlayer, lobby: LobbyState): boolean;
  isCamoAllowed(camo: string, player: LobbyPlayer, lobby: LobbyState): boolean;
  isMapAllowed(mapId: string, lobby: LobbyState): boolean;
}

export interface FinishLobbyRoundOptions {
  result?: unknown;
  reason?: unknown;
}

const normalizeName = normalizePlayerName as unknown as (value: unknown) => string;
const allocateUniqueName = uniquePlayerName as unknown as (
  requested: string,
  existingNames: string[],
) => string;
const normalizeCamo = networkCamoId as unknown as (value: string) => string;

const TEAM_SET = new Set<LobbyTeam>(Object.values(LOBBY_TEAMS));

function isLobbyTeam(value: unknown): value is LobbyTeam {
  return typeof value === 'string' && TEAM_SET.has(value as LobbyTeam);
}

export class LobbyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'LobbyError';
    this.code = code;
  }
}

function cleanId(value: unknown, field = 'playerId'): string {
  const id = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(id)) {
    throw new LobbyError('invalid_id', `${field} must be 1-48 safe characters`);
  }
  return id;
}

function cleanName(value: unknown): string {
  const name = normalizeName(value);
  if (!name) throw new LobbyError('invalid_name', 'player name is required');
  return name;
}

function availableName(
  lobby: LobbyState,
  value: unknown,
  excludingId: string | null = null,
): string {
  const requested = cleanName(value);
  return allocateUniqueName(requested, [...lobby.players.values()]
    .filter((player) => player.id !== excludingId)
    .map((player) => player.name));
}

function cleanSpecId(value: unknown): string {
  const id = String(value || '').trim();
  if (!/^[a-z0-9_-]{1,64}$/.test(id)) {
    throw new LobbyError('invalid_vehicle', 'vehicle id is invalid');
  }
  return id;
}

function cleanEquipment(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const clean: string[] = [];
  for (const entry of value) {
    const id = String(entry || '').trim();
    if (!/^[a-z0-9_-]{1,32}$/.test(id) || clean.includes(id)) continue;
    clean.push(id);
    if (clean.length === 3) break;
  }
  return clean;
}

function cleanCamo(value: unknown): string {
  const id = String(value || 'factory').trim();
  if (!/^[a-z0-9_-]{1,32}$/.test(id)) {
    throw new LobbyError('invalid_camo', 'camouflage id is invalid');
  }
  return id;
}

function countTeam(lobby: LobbyState, team: LobbyTeam, excluding: string | null = null): number {
  let count = 0;
  for (const player of lobby.players.values()) {
    if (player.id !== excluding && player.team === team) count++;
  }
  return count;
}

function activePlayers(lobby: LobbyState): LobbyPlayer[] {
  return [...lobby.players.values()].filter((player) => player.team !== LOBBY_TEAMS.SPECTATOR);
}

function autoTeam(lobby: LobbyState): typeof LOBBY_TEAMS.ALPHA | typeof LOBBY_TEAMS.BRAVO {
  if (lobby.gameMode === 'endless_horde') return LOBBY_TEAMS.ALPHA;
  const alpha = countTeam(lobby, LOBBY_TEAMS.ALPHA);
  const bravo = countTeam(lobby, LOBBY_TEAMS.BRAVO);
  return alpha <= bravo ? LOBBY_TEAMS.ALPHA : LOBBY_TEAMS.BRAVO;
}

function assertWaiting(lobby: LobbyState): void {
  if (lobby.phase !== LOBBY_PHASES.WAITING) {
    throw new LobbyError('lobby_locked', 'lobby can only be edited while waiting');
  }
}

function assertHost(lobby: LobbyState, playerId: string): void {
  if (lobby.hostId !== playerId) {
    throw new LobbyError('host_only', 'only the host may perform this action');
  }
}

function requirePlayer(lobby: LobbyState, playerId: string): LobbyPlayer {
  const player = lobby.players.get(playerId);
  if (!player) throw new LobbyError('unknown_player', `unknown player: ${playerId}`);
  return player;
}

function markChanged(lobby: LobbyState): LobbyState {
  lobby.revision++;
  lobby.updatedAtTick++;
  return lobby;
}

function assertPlayerEditable(player: LobbyPlayer): void {
  if (player.ready) {
    throw new LobbyError('vehicle_locked', 'unready before changing your vehicle or team');
  }
}

function createPlayer({
  id, name, team, specId = null, equipment = [], camo = 'factory', isHost = false, rating = null,
}: LobbyPlayerInput): LobbyPlayer {
  if (!isLobbyTeam(team)) throw new LobbyError('invalid_team', 'player team is required');
  return {
    id: cleanId(id),
    name: cleanName(name),
    team,
    specId: specId ? cleanSpecId(specId) : null,
    equipment: cleanEquipment(equipment),
    camo: normalizeCamo(cleanCamo(camo)),
    ready: false,
    connected: true,
    isHost,
    rating: Number.isFinite(rating) ? Math.round(Number(rating)) : null,
  };
}

/** Create the host-owned canonical lobby model. */
export function createLobby({
  roomCode,
  hostId,
  hostName,
  maxPlayers = MAX_PLAYERS,
  maxSpectators = MAX_SPECTATORS,
  mode = 'private',
  gameMode = 'standard',
  mapId = 'random',
  allowTeamSwitch = true,
  hostSpecId = null,
  hostEquipment = [],
  hostCamo = 'factory',
  teamSize = 1,
}: CreateLobbyOptions = {}): LobbyState {
  const code = normalizeRoomCode(roomCode);
  if (code.length !== 6) throw new LobbyError('invalid_room_code', 'room code must be 6 characters');
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > MAX_PLAYERS) {
    throw new LobbyError('invalid_capacity', `maxPlayers must be between 2 and ${MAX_PLAYERS}`);
  }
  if (!Number.isInteger(maxSpectators) || maxSpectators < 0 || maxSpectators > MAX_SPECTATORS) {
    throw new LobbyError('invalid_capacity',
      `maxSpectators must be between 0 and ${MAX_SPECTATORS}`);
  }
  if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 7) {
    throw new LobbyError('invalid_team_size', 'team size must be between 1 and 7');
  }
  const id = cleanId(hostId, 'hostId');
  const lobby: LobbyState = {
    roomCode: code,
    mode: String(mode || 'private'),
    gameMode: normalizeGameMode(gameMode),
    phase: LOBBY_PHASES.WAITING,
    hostId: id,
    maxPlayers,
    maxSpectators,
    allowTeamSwitch: !!allowTeamSwitch,
    locked: false,
    mapId: String(mapId || 'random'),
    teamSize,
    revision: 0,
    updatedAtTick: 0,
    matchSeed: null,
    round: 0,
    lastResult: null,
    players: new Map<string, LobbyPlayer>(),
  };
  lobby.players.set(id, createPlayer({
    id,
    name: hostName,
    team: LOBBY_TEAMS.ALPHA,
    specId: hostSpecId,
    equipment: hostEquipment,
    camo: hostCamo,
    isHost: true,
  }));
  return lobby;
}

/** Add one authenticated signaling peer. The host remains the policy owner. */
export function addLobbyPlayer(lobby: LobbyState, {
  id,
  name,
  team = null,
  specId = null,
  equipment = [],
  camo = 'factory',
  rating = null,
}: AddLobbyPlayerOptions = {}): LobbyState {
  assertWaiting(lobby);
  if (lobby.locked) throw new LobbyError('lobby_locked', 'lobby is locked');
  const playerId = cleanId(id);
  if (lobby.players.has(playerId)) throw new LobbyError('duplicate_player', 'player already joined');
  const requestedTeam: unknown = lobby.gameMode === 'endless_horde'
    ? LOBBY_TEAMS.ALPHA : team || autoTeam(lobby);
  if (!isLobbyTeam(requestedTeam)) throw new LobbyError('invalid_team', 'unknown team');
  let targetTeam: LobbyTeam = requestedTeam;
  if (targetTeam === LOBBY_TEAMS.SPECTATOR) {
    if (countTeam(lobby, targetTeam) >= lobby.maxSpectators) {
      throw new LobbyError('spectators_full', 'spectator slots are full');
    }
  } else {
    if (activePlayers(lobby).length >= lobby.maxPlayers) {
      throw new LobbyError('lobby_full', 'player slots are full');
    }
    if (lobby.gameMode === 'endless_horde') {
      const nextCount = activePlayers(lobby).length + 1;
      if (nextCount > 7) {
        throw new LobbyError('horde_capacity', 'Horde supports up to seven co-op players');
      }
      lobby.teamSize = Math.max(lobby.teamSize, nextCount);
    }
    const teamCap = lobby.gameMode === 'endless_horde' ? 7 : lobby.teamSize;
    if (lobby.gameMode !== 'endless_horde' &&
        activePlayers(lobby).length >= lobby.teamSize * 2) {
      throw new LobbyError('lobby_full', 'all human team slots are full');
    }
    if (countTeam(lobby, targetTeam) >= teamCap) targetTeam = autoTeam(lobby);
    if (countTeam(lobby, targetTeam) >= teamCap) {
      throw new LobbyError('team_full', 'both teams are full');
    }
  }
  lobby.players.set(playerId, createPlayer({
    id: playerId,
    name: availableName(lobby, name),
    team: targetTeam,
    specId,
    equipment,
    camo,
    rating,
  }));
  return markChanged(lobby);
}

/** Remove a player and deterministically migrate private/LAN host ownership. */
export function removeLobbyPlayer(lobby: LobbyState, playerId: unknown): LobbyState {
  const id = cleanId(playerId);
  if (!lobby.players.delete(id)) return lobby;
  if (lobby.hostId === id && lobby.players.size) {
    const next = [...lobby.players.values()]
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    lobby.hostId = next.id;
    next.isHost = true;
  }
  return markChanged(lobby);
}

/** Preserve a room seat while its RTC transport is being recovered. */
export function setLobbyPlayerConnected(
  lobby: LobbyState,
  playerId: unknown,
  connected: unknown,
): LobbyState {
  const player = requirePlayer(lobby, cleanId(playerId));
  const next = !!connected;
  if (player.connected === next) return lobby;
  player.connected = next;
  return markChanged(lobby);
}

/**
 * Apply one validated player command. Policy is centralized here so WebRTC,
 * WebSocket, and loopback sessions cannot disagree about lobby behavior.
 */
export function applyLobbyCommand(
  lobby: LobbyState,
  playerId: unknown,
  rawCommand: unknown,
  guards: Partial<LobbyCommandGuards> = {},
): LobbyState {
  const {
    isVehicleAllowed = () => true,
    isCamoAllowed = () => true,
    isMapAllowed = () => true,
  } = guards;
  assertWaiting(lobby);
  const id = cleanId(playerId);
  const player = requirePlayer(lobby, id);
  if (!rawCommand || typeof rawCommand !== 'object') {
    throw new LobbyError('invalid_command', 'lobby command must be an object');
  }
  const command = rawCommand as LobbyCommand;

  switch (command.type) {
    case 'set_name':
      player.name = availableName(lobby, command.name, id);
      break;
    case 'select_vehicle': {
      assertPlayerEditable(player);
      const specId = cleanSpecId(command.specId);
      if (!isVehicleAllowed(specId, player, lobby)) {
        throw new LobbyError('vehicle_not_allowed', 'vehicle is unavailable in this lobby');
      }
      player.specId = specId;
      player.ready = false;
      break;
    }
    case 'select_equipment':
      assertPlayerEditable(player);
      player.equipment = cleanEquipment(command.equipment);
      player.ready = false;
      break;
    case 'select_camo': {
      assertPlayerEditable(player);
      const camo = cleanCamo(command.camo);
      if (!isCamoAllowed(camo, player, lobby)) {
        throw new LobbyError('camo_not_allowed', 'camouflage is unavailable in this lobby');
      }
      player.camo = normalizeCamo(camo);
      player.ready = false;
      break;
    }
    case 'set_ready':
      if (player.team !== LOBBY_TEAMS.SPECTATOR && !player.specId) {
        throw new LobbyError('vehicle_required', 'select a vehicle before readying');
      }
      player.ready = !!command.ready;
      break;
    case 'set_team': {
      assertPlayerEditable(player);
      if (!lobby.allowTeamSwitch && id !== lobby.hostId) {
        throw new LobbyError('team_switch_disabled', 'team switching is disabled');
      }
      const team = command.team;
      if (!isLobbyTeam(team)) throw new LobbyError('invalid_team', 'unknown team');
      if (lobby.gameMode === 'endless_horde' && team === LOBBY_TEAMS.BRAVO) {
        throw new LobbyError('cooperative_team', 'Horde players deploy together on Alpha');
      }
      if (team === LOBBY_TEAMS.SPECTATOR) {
        if (countTeam(lobby, team, id) >= lobby.maxSpectators) {
          throw new LobbyError('spectators_full', 'spectator slots are full');
        }
      } else {
        const teamCap = lobby.teamSize;
        if (countTeam(lobby, team, id) >= teamCap) {
          throw new LobbyError('team_full', 'that team is full');
        }
      }
      player.team = team;
      player.ready = false;
      break;
    }
    case 'set_game_mode': {
      assertHost(lobby, id);
      const gameMode = normalizeGameMode(command.gameMode);
      if (gameMode === 'endless_horde') {
        const players = activePlayers(lobby);
        if (players.length > 7) {
          throw new LobbyError('horde_capacity', 'Horde supports up to seven co-op players');
        }
        lobby.teamSize = Math.max(lobby.teamSize, players.length);
        for (const entry of players) entry.team = LOBBY_TEAMS.ALPHA;
      }
      lobby.gameMode = gameMode;
      for (const entry of lobby.players.values()) entry.ready = false;
      break;
    }
    case 'set_team_size': {
      assertHost(lobby, id);
      const teamSize = Number(command.teamSize);
      if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 7) {
        throw new LobbyError('invalid_team_size', 'team size must be between 1 and 7');
      }
      if (countTeam(lobby, LOBBY_TEAMS.ALPHA) > teamSize ||
          countTeam(lobby, LOBBY_TEAMS.BRAVO) > teamSize) {
        throw new LobbyError('team_size_too_small', 'move players before reducing team size');
      }
      lobby.teamSize = teamSize;
      for (const entry of lobby.players.values()) entry.ready = false;
      break;
    }
    case 'set_map': {
      assertHost(lobby, id);
      const mapId = String(command.mapId || 'random').slice(0, 64);
      if (!isMapAllowed(mapId, lobby)) {
        throw new LobbyError('map_not_allowed', 'battlefield is unavailable in this lobby');
      }
      lobby.mapId = mapId;
      for (const entry of lobby.players.values()) entry.ready = false;
      break;
    }
    case 'set_locked':
      assertHost(lobby, id);
      lobby.locked = !!command.locked;
      break;
    case 'start': {
      assertHost(lobby, id);
      const players = activePlayers(lobby);
      if (players.some((entry) => !entry.ready || !entry.specId)) {
        throw new LobbyError('players_not_ready', 'every active player must be ready');
      }
      const matchSeed = command.matchSeed;
      if (typeof matchSeed !== 'number' || !Number.isSafeInteger(matchSeed) || matchSeed < 0) {
        throw new LobbyError('invalid_seed', 'host must provide an unsigned match seed');
      }
      lobby.matchSeed = matchSeed;
      lobby.round = (Number(lobby.round) || 0) + 1;
      lobby.phase = LOBBY_PHASES.STARTING;
      lobby.locked = true;
      break;
    }
    default:
      throw new LobbyError('invalid_command', `unknown lobby command: ${String(command.type)}`);
  }
  return markChanged(lobby);
}

/** Mark a fully loaded round live without rebuilding the persistent room. */
export function markLobbyRoundPlaying(lobby: LobbyState): LobbyState {
  if (lobby.phase !== LOBBY_PHASES.STARTING) return lobby;
  lobby.phase = LOBBY_PHASES.PLAYING;
  lobby.locked = true;
  return markChanged(lobby);
}

/** Return a completed room round to editable readiness while retaining peers. */
export function finishLobbyRound(
  lobby: LobbyState,
  { result = null, reason = null }: FinishLobbyRoundOptions = {},
): LobbyState {
  if (lobby.phase !== LOBBY_PHASES.PLAYING && lobby.phase !== LOBBY_PHASES.STARTING) {
    return lobby;
  }
  lobby.phase = LOBBY_PHASES.WAITING;
  lobby.locked = false;
  lobby.matchSeed = null;
  lobby.lastResult = {
    round: Number(lobby.round) || 0,
    result: result == null ? null : String(result),
    reason: reason == null ? null : String(reason),
  };
  for (const player of lobby.players.values()) player.ready = false;
  return markChanged(lobby);
}

/** Plain-data snapshot safe to send to every lobby participant. */
export function serializeLobby(lobby: LobbyState): SerializedLobby {
  return {
    roomCode: lobby.roomCode,
    mode: lobby.mode,
    gameMode: normalizeGameMode(lobby.gameMode),
    phase: lobby.phase,
    hostId: lobby.hostId,
    maxPlayers: lobby.maxPlayers,
    maxSpectators: lobby.maxSpectators,
    allowTeamSwitch: lobby.allowTeamSwitch,
    locked: lobby.locked,
    mapId: lobby.mapId,
    teamSize: lobby.teamSize,
    revision: lobby.revision,
    matchSeed: lobby.matchSeed,
    round: Number(lobby.round) || 0,
    lastResult: lobby.lastResult ? { ...lobby.lastResult } : null,
    players: [...lobby.players.values()].map((player) => ({ ...player })),
  };
}
