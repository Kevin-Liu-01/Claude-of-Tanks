/**
 * In-memory signaling membership for one Node process.
 *
 * It authenticates room membership by WebSocket connection, returns host
 * identity for invitation presentation, and relays only WebRTC rendezvous
 * messages. Gameplay state never enters this store.
 */
import { createRoomCode } from './roomCode.ts';

const DEFAULT_ROOM_TTL_MS = 24 * 60 * 60 * 1000;

export type SignalingConnection = object;

export interface SignalingPlayer {
  id: string;
  name: string;
}

export interface SignalingMessage {
  type: string;
  requestId?: string;
  payload: Record<string, unknown>;
}

export interface SignalingNotification {
  connection: SignalingConnection | null;
  message: SignalingMessage;
}

export interface SignalingPeerSummary {
  peerId: string;
  player: SignalingPlayer;
  sessionId: string;
  isHost: boolean;
}

export interface SignalingJoinResult {
  roomCode: string;
  peerId: string;
  sessionId: string;
  hostId: string;
  hostName: string;
  mode: string;
  maxPlayers: number;
  peers: SignalingPeerSummary[];
}

export interface SignalingJoinResponse {
  result: SignalingJoinResult;
  notify: SignalingNotification[];
}

export interface SignalingRoomStoreOptions {
  now?: () => number;
  roomCodeFactory?: () => string;
  roomTtlMs?: number;
}

export interface CreateRoomOptions {
  player?: unknown;
  sessionId?: unknown;
  maxPlayers?: number;
  mode?: unknown;
}

export interface JoinRoomOptions {
  roomCode?: unknown;
  player?: unknown;
  sessionId?: unknown;
}

export interface RelaySignalOptions {
  roomCode?: unknown;
  toPeerId?: unknown;
  toSessionId?: unknown;
  signal?: unknown;
}

interface SignalingMember {
  peerId: string;
  connection: SignalingConnection | null;
  player: SignalingPlayer;
  sessionId: string;
  disconnectedAt?: number;
}

interface SignalingRoom {
  roomCode: string;
  mode: string;
  maxPlayers: number;
  hostId: string;
  createdAt: number;
  touchedAt: number;
  peers: Map<string, SignalingMember>;
}

interface SignalingMembership {
  roomCode: string;
  peerId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cleanPlayer(player: unknown): SignalingPlayer {
  const source = isRecord(player) ? player : {};
  const id = String(source.id || '').trim();
  const name = String(source.name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(id) || !name) {
    throw Object.assign(new Error('invalid player'), { code: 'invalid_player' });
  }
  return { id, name };
}

function cleanSessionId(value: unknown, playerId: string): string {
  const id = String(value || '').trim();
  // Cached pre-session clients can overlap a server deploy. Give those older
  // chunks a stable compatibility epoch instead of rejecting the room join;
  // current clients always send a cryptographically random runtime id.
  if (!id && /^[a-zA-Z0-9_-]{1,48}$/.test(playerId)) return `legacy_${playerId}`;
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    throw Object.assign(new Error('invalid signaling session'), { code: 'invalid_session' });
  }
  return id;
}

function randomUnit(): number {
  const word = new Uint32Array(1);
  globalThis.crypto.getRandomValues(word);
  return word[0] / 0x100000000;
}

export class SignalingRoomStore {
  readonly now: () => number;
  readonly roomCodeFactory: () => string;
  readonly roomTtlMs: number;
  readonly rooms = new Map<string, SignalingRoom>();
  readonly membership = new Map<SignalingConnection, SignalingMembership>();

  constructor({
    now = () => Date.now(),
    roomCodeFactory = () => createRoomCode(randomUnit),
    roomTtlMs = DEFAULT_ROOM_TTL_MS,
  }: SignalingRoomStoreOptions = {}) {
    this.now = now;
    this.roomCodeFactory = roomCodeFactory;
    this.roomTtlMs = roomTtlMs;
  }

  #uniqueRoomCode(): string {
    for (let i = 0; i < 16; i++) {
      const code = this.roomCodeFactory();
      if (!this.rooms.has(code)) return code;
    }
    throw Object.assign(new Error('room code space is busy'), { code: 'room_code_exhausted' });
  }

  create(
    connection: SignalingConnection,
    { player, sessionId, maxPlayers = 14, mode = 'private' }: CreateRoomOptions = {},
  ): SignalingJoinResult {
    if (this.membership.has(connection)) {
      throw Object.assign(new Error('connection already joined'), { code: 'already_joined' });
    }
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 14) {
      throw Object.assign(new Error('invalid room capacity'), { code: 'invalid_capacity' });
    }
    const memberPlayer = cleanPlayer(player);
    const memberSessionId = cleanSessionId(sessionId, memberPlayer.id);
    const peerId = memberPlayer.id;
    const roomCode = this.#uniqueRoomCode();
    const room: SignalingRoom = {
      roomCode,
      mode: String(mode || 'private').slice(0, 24),
      maxPlayers,
      hostId: peerId,
      createdAt: this.now(),
      touchedAt: this.now(),
      peers: new Map<string, SignalingMember>(),
    };
    room.peers.set(peerId, {
      peerId, connection, player: memberPlayer, sessionId: memberSessionId,
    });
    this.rooms.set(roomCode, room);
    this.membership.set(connection, { roomCode, peerId });
    return {
      roomCode,
      peerId,
      sessionId: memberSessionId,
      hostId: peerId,
      hostName: memberPlayer.name,
      mode: room.mode,
      maxPlayers: room.maxPlayers,
      peers: [],
    };
  }

  join(
    connection: SignalingConnection,
    { roomCode, player, sessionId }: JoinRoomOptions = {},
  ): SignalingJoinResponse {
    if (this.membership.has(connection)) {
      throw Object.assign(new Error('connection already joined'), { code: 'already_joined' });
    }
    const room = this.rooms.get(String(roomCode || ''));
    if (!room) throw Object.assign(new Error('room not found'), { code: 'room_not_found' });
    const memberPlayer = cleanPlayer(player);
    const memberSessionId = cleanSessionId(sessionId, memberPlayer.id);
    const peerId = memberPlayer.id;
    const previous = room.peers.get(peerId);
    if (!previous && room.peers.size >= room.maxPlayers) {
      throw Object.assign(new Error('room is full'), { code: 'room_full' });
    }
    if (previous?.connection) this.membership.delete(previous.connection);
    const member: SignalingMember = {
      peerId, connection, player: memberPlayer, sessionId: memberSessionId,
    };
    const peers = [...room.peers.values()].filter((peer) => peer.peerId !== peerId).map((peer) => ({
      peerId: peer.peerId,
      player: { ...peer.player },
      sessionId: peer.sessionId || '',
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
        sessionId: memberSessionId,
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
            sessionId: memberSessionId,
          } },
        })),
    };
  }

  relay(
    connection: SignalingConnection,
    { roomCode, toPeerId, toSessionId, signal }: RelaySignalOptions = {},
  ): SignalingNotification {
    const requestedRoomCode = String(roomCode || '');
    const membership = this.membership.get(connection);
    if (!membership || membership.roomCode !== requestedRoomCode) {
      throw Object.assign(new Error('not a room member'), { code: 'not_in_room' });
    }
    const room = this.rooms.get(requestedRoomCode);
    const sender = room && room.peers.get(membership.peerId);
    const target = room && room.peers.get(String(toPeerId || ''));
    if (!sender || sender.connection !== connection) {
      throw Object.assign(new Error('not a room member'), { code: 'not_in_room' });
    }
    if (!target) throw Object.assign(new Error('target peer not found'), { code: 'peer_not_found' });
    if (toSessionId && target.sessionId !== toSessionId) {
      throw Object.assign(new Error('target page session was replaced'), {
        code: 'stale_target_session',
      });
    }
    room.touchedAt = this.now();
    return {
      connection: target.connection,
      message: {
        type: 'room_signal',
        payload: {
          roomCode: requestedRoomCode,
          fromPeerId: membership.peerId,
          fromSessionId: sender.sessionId,
          toSessionId: target.sessionId,
          signal,
        },
      },
    };
  }

  leave(connection: SignalingConnection, reason = 'peer_left'): SignalingNotification[] {
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
      for (const peer of room.peers.values()) {
        if (peer.connection) this.membership.delete(peer.connection);
      }
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

  /** Preserve room membership across an unclean signaling transport loss. */
  detach(connection: SignalingConnection): SignalingNotification[] {
    const membership = this.membership.get(connection);
    if (!membership) return [];
    this.membership.delete(connection);
    const room = this.rooms.get(membership.roomCode);
    const member = room?.peers.get(membership.peerId);
    if (!room || member?.connection !== connection) return [];
    member.connection = null;
    member.disconnectedAt = this.now();
    room.touchedAt = this.now();
    return [];
  }

  /** Keep an actively polling room alive without changing membership. */
  poll(connection: SignalingConnection): SignalingNotification[] {
    const membership = this.membership.get(connection);
    const room = membership && this.rooms.get(membership.roomCode);
    if (room && room.peers.get(membership.peerId)?.connection === connection) {
      room.touchedAt = this.now();
    }
    return [];
  }

  sweepExpired(): SignalingNotification[] {
    const cutoff = this.now() - this.roomTtlMs;
    const notifications: SignalingNotification[] = [];
    for (const room of [...this.rooms.values()]) {
      if (room.touchedAt > cutoff) continue;
      this.rooms.delete(room.roomCode);
      for (const peer of room.peers.values()) {
        if (peer.connection) this.membership.delete(peer.connection);
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
