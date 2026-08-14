import { resolveMapId } from '../world/maps/index.js';
import { ALL_TANK_IDS, getSpec } from '../vehicles/specs.js';
import { isGarageVisibleTankId } from '../game/matchmaking.js';
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
  let pool = ALL_TANK_IDS.filter((id) => isGarageVisibleTankId(id) &&
    (!referenceEra || getSpec(id)?.era === referenceEra));
  if (!pool.length) pool = ALL_TANK_IDS.filter(isGarageVisibleTankId);
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

/**
 * Switch a browser-hosted room from lobby messages to authoritative match
 * messages without replacing its established WebRTC channels.
 */
export function beginPrivateHostMatch({
  session,
  lobbyState,
  simulationFactory = createAuthoritativeMatch,
  worldCollision = null,
} = {}) {
  const lobby = validateStartingLobby(lobbyState);
  if (!session || typeof session.takeMatchChannels !== 'function' ||
      !session.roomInfo || !session.roomInfo.peerId) {
    throw new TypeError('private host session is required');
  }
  const hostId = String(session.roomInfo.peerId);
  const mapId = resolvePrivateMatchMap(lobby);
  const players = buildPrivateMatchPlayers(lobby);
  const simulation = simulationFactory({
    players,
    mapId,
    seed: lobby.matchSeed,
    worldCollision,
  });
  const host = new AuthoritativeMatchRuntime({ simulation });
  const localLink = createLoopbackTransportPair();
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
