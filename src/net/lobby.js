import { MAX_PLAYERS, MAX_SPECTATORS, normalizeRoomCode } from './protocol.js';
import { normalizePlayerName, uniquePlayerName } from './playerNames.js';

export const LOBBY_PHASES = Object.freeze({
  WAITING: 'waiting',
  STARTING: 'starting',
  PLAYING: 'playing',
  FINISHED: 'finished',
});

export const LOBBY_TEAMS = Object.freeze({
  ALPHA: 'alpha',
  BRAVO: 'bravo',
  SPECTATOR: 'spectator',
});

const TEAM_SET = new Set(Object.values(LOBBY_TEAMS));

export class LobbyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LobbyError';
    this.code = code;
  }
}

function cleanId(value, field = 'playerId') {
  const id = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(id)) {
    throw new LobbyError('invalid_id', `${field} must be 1-48 safe characters`);
  }
  return id;
}

function cleanName(value) {
  const name = normalizePlayerName(value);
  if (!name) throw new LobbyError('invalid_name', 'player name is required');
  return name;
}

function availableName(lobby, value, excludingId = null) {
  const requested = cleanName(value);
  return uniquePlayerName(requested, [...lobby.players.values()]
    .filter((player) => player.id !== excludingId)
    .map((player) => player.name));
}

function cleanSpecId(value) {
  const id = String(value || '').trim();
  if (!/^[a-z0-9_-]{1,64}$/.test(id)) {
    throw new LobbyError('invalid_vehicle', 'vehicle id is invalid');
  }
  return id;
}

function cleanEquipment(value) {
  if (!Array.isArray(value)) return [];
  const clean = [];
  for (const entry of value) {
    const id = String(entry || '').trim();
    if (!/^[a-z0-9_-]{1,32}$/.test(id) || clean.includes(id)) continue;
    clean.push(id);
    if (clean.length === 3) break;
  }
  return clean;
}

function countTeam(lobby, team, excluding = null) {
  let count = 0;
  for (const player of lobby.players.values()) {
    if (player.id !== excluding && player.team === team) count++;
  }
  return count;
}

function activePlayers(lobby) {
  return [...lobby.players.values()].filter((player) => player.team !== LOBBY_TEAMS.SPECTATOR);
}

function autoTeam(lobby) {
  const alpha = countTeam(lobby, LOBBY_TEAMS.ALPHA);
  const bravo = countTeam(lobby, LOBBY_TEAMS.BRAVO);
  return alpha <= bravo ? LOBBY_TEAMS.ALPHA : LOBBY_TEAMS.BRAVO;
}

function assertWaiting(lobby) {
  if (lobby.phase !== LOBBY_PHASES.WAITING) {
    throw new LobbyError('lobby_locked', 'lobby can only be edited while waiting');
  }
}

function assertHost(lobby, playerId) {
  if (lobby.hostId !== playerId) {
    throw new LobbyError('host_only', 'only the host may perform this action');
  }
}

function requirePlayer(lobby, playerId) {
  const player = lobby.players.get(playerId);
  if (!player) throw new LobbyError('unknown_player', `unknown player: ${playerId}`);
  return player;
}

function markChanged(lobby) {
  lobby.revision++;
  lobby.updatedAtTick++;
  return lobby;
}

function assertPlayerEditable(player) {
  if (player.ready) {
    throw new LobbyError('vehicle_locked', 'unready before changing your vehicle or team');
  }
}

function createPlayer({
  id, name, team, specId = null, equipment = [], isHost = false, rating = null,
}) {
  return {
    id: cleanId(id),
    name: cleanName(name),
    team,
    specId: specId ? cleanSpecId(specId) : null,
    equipment: cleanEquipment(equipment),
    ready: false,
    connected: true,
    isHost,
    rating: Number.isFinite(rating) ? Math.round(rating) : null,
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
  mapId = 'random',
  allowTeamSwitch = true,
  hostSpecId = null,
  hostEquipment = [],
  teamSize = 1,
} = {}) {
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
  const lobby = {
    roomCode: code,
    mode: String(mode || 'private'),
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
    players: new Map(),
  };
  lobby.players.set(id, createPlayer({
    id,
    name: hostName,
    team: LOBBY_TEAMS.ALPHA,
    specId: hostSpecId,
    equipment: hostEquipment,
    isHost: true,
  }));
  return lobby;
}

/** Add one authenticated signaling peer. The host remains the policy owner. */
export function addLobbyPlayer(lobby, {
  id,
  name,
  team = null,
  specId = null,
  equipment = [],
  rating = null,
} = {}) {
  assertWaiting(lobby);
  if (lobby.locked) throw new LobbyError('lobby_locked', 'lobby is locked');
  const playerId = cleanId(id);
  if (lobby.players.has(playerId)) throw new LobbyError('duplicate_player', 'player already joined');
  let targetTeam = team || autoTeam(lobby);
  if (!TEAM_SET.has(targetTeam)) throw new LobbyError('invalid_team', 'unknown team');
  if (targetTeam === LOBBY_TEAMS.SPECTATOR) {
    if (countTeam(lobby, targetTeam) >= lobby.maxSpectators) {
      throw new LobbyError('spectators_full', 'spectator slots are full');
    }
  } else {
    if (activePlayers(lobby).length >= lobby.maxPlayers) {
      throw new LobbyError('lobby_full', 'player slots are full');
    }
    const teamCap = lobby.teamSize;
    if (activePlayers(lobby).length >= lobby.teamSize * 2) {
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
    rating,
  }));
  return markChanged(lobby);
}

/** Remove a player and deterministically migrate private/LAN host ownership. */
export function removeLobbyPlayer(lobby, playerId) {
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

/**
 * Apply one validated player command. Policy is centralized here so WebRTC,
 * WebSocket, and loopback sessions cannot disagree about lobby behavior.
 */
export function applyLobbyCommand(lobby, playerId, command, {
  isVehicleAllowed = () => true,
} = {}) {
  assertWaiting(lobby);
  const id = cleanId(playerId);
  const player = requirePlayer(lobby, id);
  if (!command || typeof command !== 'object') {
    throw new LobbyError('invalid_command', 'lobby command must be an object');
  }

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
      if (!TEAM_SET.has(team)) throw new LobbyError('invalid_team', 'unknown team');
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
    case 'set_map':
      assertHost(lobby, id);
      lobby.mapId = String(command.mapId || 'random').slice(0, 64);
      for (const entry of lobby.players.values()) entry.ready = false;
      break;
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
      if (!Number.isSafeInteger(command.matchSeed) || command.matchSeed < 0) {
        throw new LobbyError('invalid_seed', 'host must provide an unsigned match seed');
      }
      lobby.matchSeed = command.matchSeed;
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
export function markLobbyRoundPlaying(lobby) {
  if (lobby.phase !== LOBBY_PHASES.STARTING) return lobby;
  lobby.phase = LOBBY_PHASES.PLAYING;
  lobby.locked = true;
  return markChanged(lobby);
}

/** Return a completed room round to editable readiness while retaining peers. */
export function finishLobbyRound(lobby, { result = null, reason = null } = {}) {
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
export function serializeLobby(lobby) {
  return {
    roomCode: lobby.roomCode,
    mode: lobby.mode,
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
