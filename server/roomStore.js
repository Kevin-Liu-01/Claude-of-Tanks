/**
 * In-memory signaling membership for one Node process.
 *
 * It authenticates room membership by WebSocket connection, returns host
 * identity for invitation presentation, and relays only WebRTC rendezvous
 * messages. Gameplay state never enters this store.
 */
import { createRoomCode } from '../src/net/protocol.js';

const DEFAULT_ROOM_TTL_MS = 6 * 60 * 60 * 1000;

function cleanPlayer(player) {
  const id = String(player && player.id || '').trim();
  const name = String(player && player.name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(id) || !name) {
    throw Object.assign(new Error('invalid player'), { code: 'invalid_player' });
  }
  return { id, name };
}

function randomUnit() {
  const word = new Uint32Array(1);
  globalThis.crypto.getRandomValues(word);
  return word[0] / 0x100000000;
}

function randomPeerId() {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

export class SignalingRoomStore {
  constructor({
    now = () => Date.now(),
    roomCodeFactory = () => createRoomCode(randomUnit),
    peerIdFactory = randomPeerId,
    roomTtlMs = DEFAULT_ROOM_TTL_MS,
  } = {}) {
    this.now = now;
    this.roomCodeFactory = roomCodeFactory;
    this.peerIdFactory = peerIdFactory;
    this.roomTtlMs = roomTtlMs;
    this.rooms = new Map();
    this.membership = new Map();
  }

  #uniqueRoomCode() {
    for (let i = 0; i < 16; i++) {
      const code = this.roomCodeFactory();
      if (!this.rooms.has(code)) return code;
    }
    throw Object.assign(new Error('room code space is busy'), { code: 'room_code_exhausted' });
  }

  #uniquePeerId(room) {
    for (let i = 0; i < 16; i++) {
      const id = String(this.peerIdFactory());
      if (/^[a-zA-Z0-9_-]{8,48}$/.test(id) && !room.peers.has(id)) return id;
    }
    throw Object.assign(new Error('peer id collision'), { code: 'peer_id_exhausted' });
  }

  create(connection, { player, maxPlayers = 14, mode = 'private' } = {}) {
    if (this.membership.has(connection)) {
      throw Object.assign(new Error('connection already joined'), { code: 'already_joined' });
    }
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 14) {
      throw Object.assign(new Error('invalid room capacity'), { code: 'invalid_capacity' });
    }
    const roomCode = this.#uniqueRoomCode();
    const room = {
      roomCode,
      mode: String(mode || 'private').slice(0, 24),
      maxPlayers,
      hostId: null,
      createdAt: this.now(),
      touchedAt: this.now(),
      peers: new Map(),
    };
    const memberPlayer = cleanPlayer(player);
    const peerId = memberPlayer.id;
    room.hostId = peerId;
    room.peers.set(peerId, { peerId, connection, player: memberPlayer });
    this.rooms.set(roomCode, room);
    this.membership.set(connection, { roomCode, peerId });
    return {
      roomCode,
      peerId,
      hostId: peerId,
      hostName: memberPlayer.name,
      mode: room.mode,
      maxPlayers: room.maxPlayers,
      peers: [],
    };
  }

  join(connection, { roomCode, player } = {}) {
    if (this.membership.has(connection)) {
      throw Object.assign(new Error('connection already joined'), { code: 'already_joined' });
    }
    const room = this.rooms.get(String(roomCode || ''));
    if (!room) throw Object.assign(new Error('room not found'), { code: 'room_not_found' });
    const memberPlayer = cleanPlayer(player);
    const peerId = memberPlayer.id;
    const previous = room.peers.get(peerId);
    if (!previous && room.peers.size >= room.maxPlayers) {
      throw Object.assign(new Error('room is full'), { code: 'room_full' });
    }
    if (previous) this.membership.delete(previous.connection);
    const member = { peerId, connection, player: memberPlayer };
    const peers = [...room.peers.values()].filter((peer) => peer.peerId !== peerId).map((peer) => ({
      peerId: peer.peerId,
      player: { ...peer.player },
      isHost: peer.peerId === room.hostId,
    }));
    room.peers.set(peerId, member);
    room.touchedAt = this.now();
    this.membership.set(connection, { roomCode: room.roomCode, peerId });
    const hostName = room.peers.get(room.hostId)?.player?.name || '';
    return {
      result: {
        roomCode: room.roomCode,
        peerId,
        hostId: room.hostId,
        hostName,
        mode: room.mode,
        maxPlayers: room.maxPlayers,
        peers,
      },
      notify: [...room.peers.values()]
        .filter((peer) => peer.peerId !== peerId)
        .map((peer) => ({
          connection: peer.connection,
          message: { type: 'peer_joined', payload: {
            roomCode: room.roomCode,
            peerId,
            player: { ...member.player },
          } },
        })),
    };
  }

  relay(connection, { roomCode, toPeerId, signal } = {}) {
    const membership = this.membership.get(connection);
    if (!membership || membership.roomCode !== roomCode) {
      throw Object.assign(new Error('not a room member'), { code: 'not_in_room' });
    }
    const room = this.rooms.get(roomCode);
    const target = room && room.peers.get(String(toPeerId || ''));
    if (!target) throw Object.assign(new Error('target peer not found'), { code: 'peer_not_found' });
    room.touchedAt = this.now();
    return {
      connection: target.connection,
      message: {
        type: 'room_signal',
        payload: { roomCode, fromPeerId: membership.peerId, signal },
      },
    };
  }

  leave(connection, reason = 'peer_left') {
    const membership = this.membership.get(connection);
    if (!membership) return [];
    this.membership.delete(connection);
    const room = this.rooms.get(membership.roomCode);
    if (!room) return [];
    if (room.peers.get(membership.peerId)?.connection !== connection) return [];
    room.peers.delete(membership.peerId);
    if (membership.peerId === room.hostId) {
      this.rooms.delete(room.roomCode);
      const notifications = [...room.peers.values()].map((peer) => ({
        connection: peer.connection,
        message: { type: 'room_closed', payload: {
          roomCode: room.roomCode,
          reason: 'host_left',
        } },
      }));
      for (const peer of room.peers.values()) this.membership.delete(peer.connection);
      return notifications;
    }
    room.touchedAt = this.now();
    return [...room.peers.values()].map((peer) => ({
      connection: peer.connection,
      message: { type: 'peer_left', payload: {
        roomCode: room.roomCode,
        peerId: membership.peerId,
        reason,
      } },
    }));
  }

  sweepExpired() {
    const cutoff = this.now() - this.roomTtlMs;
    const notifications = [];
    for (const room of [...this.rooms.values()]) {
      if (room.touchedAt > cutoff) continue;
      this.rooms.delete(room.roomCode);
      for (const peer of room.peers.values()) {
        this.membership.delete(peer.connection);
        notifications.push({
          connection: peer.connection,
          message: { type: 'room_closed', payload: {
            roomCode: room.roomCode,
            reason: 'expired',
          } },
        });
      }
    }
    return notifications;
  }
}
