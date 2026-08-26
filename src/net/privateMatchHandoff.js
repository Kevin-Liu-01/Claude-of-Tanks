import { resolveMapId } from '../world/maps/index.js';
import { VISIBLE_TANK_IDS, getSpec } from '../vehicles/specs.js';
import { isGarageVisibleTankId } from '../game/matchmaking.js';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.js';
import { createLoopbackTransportPair } from './loopbackTransport.js';
import { AuthoritativeMatchRuntime, MatchClientRuntime } from './matchRuntime.js';
import { maybeCreateAdverseNetworkTransport } from './adverseNetworkTransport.js';
import {
  applyLobbyCommand,
  addLobbyPlayer,
  finishLobbyRound,
  markLobbyRoundPlaying,
  removeLobbyPlayer,
  serializeLobby,
  setLobbyPlayerConnected,
} from './lobby.js';

function seededUnit(seed) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6D2B79F5) | 0;
    let out = Math.imul(value ^ (value >>> 15), 1 | value);
    out = (out + Math.imul(out ^ (out >>> 7), 61 | out)) ^ out;
    return ((out ^ (out >>> 14)) >>> 0) / 4294967296;
  };
}

function validateStartingLobby(lobbyState) {
  if (!lobbyState || lobbyState.phase !== 'starting' ||
      !Number.isSafeInteger(lobbyState.matchSeed) || !Array.isArray(lobbyState.players)) {
    throw new TypeError('a canonical starting lobby state is required');
  }
  return lobbyState;
}

/** Resolve a random lobby map identically on every peer before match handoff. */
export function resolvePrivateMatchMap(lobbyState) {
  const lobby = validateStartingLobby(lobbyState);
  return resolveMapId(lobby.mapId, seededUnit(lobby.matchSeed));
}

/** Deterministically fill empty lobby slots with authority-owned bots. */
export function buildPrivateMatchPlayers(lobbyState) {
  const lobby = validateStartingLobby(lobbyState);
  const humans = lobby.players
    .filter((player) => player.team !== 'spectator')
    .map((player) => ({ ...player, bot: false }));
  const teamSize = Math.max(1, Math.min(7, Number(lobby.teamSize) || 1));
  const counts = {
    alpha: humans.filter((player) => player.team === 'alpha').length,
    bravo: humans.filter((player) => player.team === 'bravo').length,
  };
  if (counts.alpha > teamSize || counts.bravo > teamSize) {
    throw new Error('human roster exceeds the selected team size');
  }
  const referenceEra = humans[0]?.specId ? getSpec(humans[0].specId)?.era : null;
  let pool = VISIBLE_TANK_IDS.filter((id) => isGarageVisibleTankId(id) &&
    (!referenceEra || getSpec(id)?.era === referenceEra));
  if (!pool.length) pool = VISIBLE_TANK_IDS.filter(isGarageVisibleTankId);
  const random = seededUnit(lobby.matchSeed ^ 0x5b07f11);
  pool = pool.slice();
  for (let index = pool.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [pool[index], pool[target]] = [pool[target], pool[index]];
  }
  const players = humans.slice();
  let poolIndex = 0;
  for (const team of ['alpha', 'bravo']) {
    for (let index = counts[team]; index < teamSize; index++) {
      const specId = pool[poolIndex++ % pool.length];
      players.push({
        id: `bot-${team}-${index}-${(lobby.matchSeed >>> 0).toString(36)}`,
        name: `Bot ${team === 'alpha' ? 'A' : 'B'}${index + 1}`,
        specId,
        camo: 'auto',
        team,
        equipment: null,
        bot: true,
        difficulty: 'normal',
        ready: true,
        connected: true,
        isHost: false,
      });
    }
  }
  return players;
}

function createPersistentRoomController(session) {
  const lobby = session?.lobby;
  if (!lobby || !(lobby.players instanceof Map)) return null;
  return {
    state: () => serializeLobby(lobby),
    command(playerId, command) {
      applyLobbyCommand(lobby, playerId, command, {
        isVehicleAllowed: session.isVehicleAllowed || (() => true),
        isCamoAllowed: session.isCamoAllowed || (() => true),
        isMapAllowed: session.isMapAllowed || (() => true),
      });
      return serializeLobby(lobby);
    },
    markPlaying() { markLobbyRoundPlaying(lobby); },
    finish(outcome) { finishLobbyRound(lobby, outcome); },
    disconnect(playerId) {
      if (lobby.players.has(String(playerId))) {
        setLobbyPlayerConnected(lobby, String(playerId), false);
      }
    },
    remove(playerId, reason = 'left') {
      removeLobbyPlayer(lobby, playerId);
      const rtcPeer = session.peers?.get?.(String(playerId));
      rtcPeer?.close?.(reason);
      session.peers?.delete?.(String(playerId));
    },
    rejoin(playerId, player = {}) {
      const id = String(playerId);
      const existing = lobby.players.get(id);
      if (!existing) {
        if (lobby.phase !== 'waiting') {
          throw Object.assign(new Error('This round no longer has a seat for that player.'), {
            code: 'room_seat_unavailable',
          });
        }
        addLobbyPlayer(lobby, { id, name: player.name || 'Player' });
      } else {
        setLobbyPlayerConnected(lobby, id, true);
      }
      return serializeLobby(lobby);
    },
    metadataFor(playerId) {
      const player = lobby.players.get(String(playerId));
      return player ? { spectator: player.team === 'spectator', team: player.team } : {};
    },
  };
}

/**
 * Switch a browser-hosted room from lobby messages to authoritative match
 * messages without replacing its established WebRTC channels.
 */
export function beginPrivateHostMatch({
  session,
  lobbyState,
  simulationFactory = createAuthoritativeMatch,
  worldCollision = null,
  battleLimitS = undefined,
} = {}) {
  const lobby = validateStartingLobby(lobbyState);
  if (!session || typeof session.takeMatchChannels !== 'function' ||
      !session.roomInfo || !session.roomInfo.peerId) {
    throw new TypeError('private host session is required');
  }
  const hostId = String(session.roomInfo.peerId);
  const mapId = resolvePrivateMatchMap(lobby);
  const players = buildPrivateMatchPlayers(lobby);
  if (battleLimitS !== undefined && (!Number.isFinite(battleLimitS) || battleLimitS <= 0)) {
    throw new TypeError('battleLimitS must be a positive finite number');
  }
  let simulation = simulationFactory({
    players,
    mapId,
    seed: lobby.matchSeed,
    worldCollision,
    ...(battleLimitS === undefined ? {} : { battleLimitS }),
  });
  const roomController = createPersistentRoomController(session);
  // The browser render loop already clamps one delayed frame to 100 ms.
  // Retain that same six-tick window in authority so a rare shader/OS frame
  // cannot discard 33-50 ms of match time and force every client to converge
  // on a timeline jump. Dedicated runtimes keep their own explicit policy.
  const host = new AuthoritativeMatchRuntime({
    simulation,
    roomController,
    maxCatchUpTicks: 6,
  });
  session.bindMatchRuntime?.(host);
  // The browser host's local player does not need an emulated network hop.
  // Keep the same protocol/runtime seam, but deliver its in-process envelopes
  // synchronously and zero-copy so host rendering never waits on microtasks.
  const localLink = createLoopbackTransportPair({ direct: true });
  let wallTimeMs = 0;
  const client = new MatchClientRuntime({
    transport: localLink.client,
    playerId: hostId,
    clock: () => wallTimeMs,
  });
  const playerById = new Map(lobby.players.map((player) => [player.id, player]));
  host.attachPeer({ peerId: hostId, transport: localLink.host,
    metadata: {
      mode: lobby.mode || 'private',
      spectator: playerById.get(hostId)?.team === 'spectator',
    } });
  for (const channel of session.takeMatchChannels()) {
    const player = playerById.get(channel.peerId);
    host.attachPeer({ peerId: channel.peerId, transport: channel.transport,
      metadata: { mode: lobby.mode || 'private', spectator: player?.team === 'spectator' } });
    for (const message of channel.pendingMessages || []) {
      host.acceptPeerMessage(channel.peerId, message);
    }
  }
  client.connect({ mode: lobby.mode || 'private' });

  return {
    kind: lobby.mode || 'private',
    role: 'host',
    playerId: hostId,
    mapId,
    get simulation() { return simulation; },
    host,
    client,
    ready() { return client.readyForMatch(); },
    onRoomState(listener) { return client.onRoomState(listener); },
    roomCommand(command) { return client.submitRoomCommand(command); },
    onRoomChat(listener) { return client.onRoomChat(listener); },
    getRoomChatHistory() { return client.getRoomChatHistory(); },
    sendRoomChat(text) { return client.sendRoomChat(text); },
    prepareRound({ lobbyState: nextLobby, worldCollision: nextCollision = null } = {}) {
      const next = validateStartingLobby(nextLobby);
      const nextMapId = resolvePrivateMatchMap(next);
      simulation = simulationFactory({
        players: buildPrivateMatchPlayers(next),
        mapId: nextMapId,
        seed: next.matchSeed,
        worldCollision: nextCollision,
      });
      host.replaceSimulation(simulation, { round: Number(next.round) || 1 });
      return { mapId: nextMapId, simulation };
    },
    advance(elapsedMs, input = null) {
      if (input) client.submitInput(input, host.tick);
      host.advance(elapsedMs);
      wallTimeMs += elapsedMs;
      return client.update(wallTimeMs);
    },
    close(reason = 'private_match_closed') {
      client.close(reason);
      host.close(reason);
      session.close?.(reason);
    },
  };
}

/** Switch a joined peer's established WebRTC channel into match mode. */
export async function beginPrivateClientMatch({ session, playerId, lobbyState } = {}) {
  if (!session || (typeof session.takeMatchClient !== 'function' &&
      typeof session.takeMatchTransport !== 'function')) {
    throw new TypeError('private client session is required');
  }
  const id = String(playerId || (session.roomInfo && session.roomInfo.peerId) || '');
  if (!id) throw new TypeError('playerId is required');
  let client;
  if (typeof session.takeMatchClient === 'function') {
    client = await session.takeMatchClient();
  } else {
    const transport = maybeCreateAdverseNetworkTransport(await session.takeMatchTransport());
    client = new MatchClientRuntime({ transport, playerId: id });
    client.connect({ mode: session.roomInfo && session.roomInfo.mode || 'private' });
  }
  return {
    kind: session.roomInfo && session.roomInfo.mode || 'private',
    role: 'client',
    playerId: id,
    mapId: lobbyState ? resolvePrivateMatchMap(lobbyState) : null,
    client,
    ready() { return client.readyForMatch(); },
    onRoomState(listener) { return client.onRoomState(listener); },
    roomCommand(command) { return client.submitRoomCommand(command); },
    onRoomChat(listener) { return client.onRoomChat(listener); },
    getRoomChatHistory() { return client.getRoomChatHistory(); },
    sendRoomChat(text) { return client.sendRoomChat(text); },
    update(nowMs) { return client.update(nowMs); },
    submitInput(input, clientTick) { return client.submitInput(input, clientTick); },
    close(reason = 'private_match_closed') {
      client.close(reason);
      session.close?.(reason);
    },
  };
}
