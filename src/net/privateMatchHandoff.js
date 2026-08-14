import { resolveMapId } from '../world/maps/index.js';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.js';
import { createLoopbackTransportPair } from './loopbackTransport.js';
import { AuthoritativeMatchRuntime, MatchClientRuntime } from './matchRuntime.js';

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

/**
 * Switch a browser-hosted room from lobby messages to authoritative match
 * messages without replacing its established WebRTC channels.
 */
export function beginPrivateHostMatch({
  session,
  lobbyState,
  simulationFactory = createAuthoritativeMatch,
} = {}) {
  const lobby = validateStartingLobby(lobbyState);
  if (!session || typeof session.takeMatchChannels !== 'function' ||
      !session.roomInfo || !session.roomInfo.peerId) {
    throw new TypeError('private host session is required');
  }
  const hostId = String(session.roomInfo.peerId);
  const mapId = resolvePrivateMatchMap(lobby);
  const players = lobby.players
    .filter((player) => player.team !== 'spectator')
    .map((player) => ({ id: player.id, specId: player.specId, team: player.team }));
  const simulation = simulationFactory({ players, mapId, seed: lobby.matchSeed });
  const host = new AuthoritativeMatchRuntime({ simulation });
  const localLink = createLoopbackTransportPair();
  let wallTimeMs = 0;
  const client = new MatchClientRuntime({
    transport: localLink.client,
    playerId: hostId,
    clock: () => wallTimeMs,
  });
  host.attachPeer({ peerId: hostId, transport: localLink.host,
    metadata: { mode: lobby.mode || 'private' } });
  const playerById = new Map(lobby.players.map((player) => [player.id, player]));
  for (const channel of session.takeMatchChannels()) {
    const player = playerById.get(channel.peerId);
    host.attachPeer({ peerId: channel.peerId, transport: channel.transport,
      metadata: { mode: lobby.mode || 'private', spectator: player?.team === 'spectator' } });
  }
  client.connect({ mode: lobby.mode || 'private' });

  return {
    kind: lobby.mode || 'private',
    role: 'host',
    playerId: hostId,
    mapId,
    simulation,
    host,
    client,
    ready() { return client.readyForMatch(); },
    async advance(elapsedMs, input = null) {
      if (input) client.submitInput(input, host.tick);
      await Promise.resolve();
      host.advance(elapsedMs);
      await Promise.resolve();
      wallTimeMs += elapsedMs;
      return client.update(wallTimeMs);
    },
    close(reason = 'private_match_closed') {
      client.close(reason);
      host.close(reason);
    },
  };
}

/** Switch a joined peer's established WebRTC channel into match mode. */
export async function beginPrivateClientMatch({ session, playerId, lobbyState } = {}) {
  if (!session || typeof session.takeMatchTransport !== 'function') {
    throw new TypeError('private client session is required');
  }
  const id = String(playerId || (session.roomInfo && session.roomInfo.peerId) || '');
  if (!id) throw new TypeError('playerId is required');
  const transport = await session.takeMatchTransport();
  const client = new MatchClientRuntime({ transport, playerId: id });
  client.connect({ mode: session.roomInfo && session.roomInfo.mode || 'private' });
  return {
    kind: session.roomInfo && session.roomInfo.mode || 'private',
    role: 'client',
    playerId: id,
    mapId: lobbyState ? resolvePrivateMatchMap(lobbyState) : null,
    client,
    ready() { return client.readyForMatch(); },
    update(nowMs) { return client.update(nowMs); },
    submitInput(input, clientTick) { return client.submitInput(input, clientTick); },
    close(reason = 'private_match_closed') { client.close(reason); },
  };
}
