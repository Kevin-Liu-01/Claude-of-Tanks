import type { RuntimeValue } from '../src/runtimeTypes.ts';
/**
 * In-memory signaling membership for one Node process.
 *
 * It authenticates room membership by WebSocket connection, returns host
 * identity for invitation presentation, and relays only WebRTC rendezvous
 * messages. Gameplay state never enters this store.
 */
import { createRoomCode } from './roomCode.ts';
import {
  newSignalingResumeToken, signalingResumeAllowed, signalingResumeHash,
} from './signalingMembership.ts';

const DEFAULT_ROOM_TTL_MS = 24 * 60 * 60 * 1000;
export const SIGNALING_DETACHED_GRACE_MS = 90_000;
export const SIGNALING_PEER_IDLE_TTL_MS = 180_000;
export const MAX_RETIRED_PEER_IDS = 128;

export type SignalingConnection = object;

export interface SignalingPlayer {
  id: string;
  name: string;
}

export interface SignalingMessage {
  type: string;
  requestId?: string;
  payload: Record<string, RuntimeValue>;
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
  resumeToken: string;
}

export interface SignalingJoinResponse {
  result: SignalingJoinResult;
  notify: SignalingNotification[];
}

export interface SignalingRoomStoreOptions {
  now?: () => number;
  roomCodeFactory?: () => string;
  roomTtlMs?: number;
  detachedGraceMs?: number;
  peerIdleTtlMs?: number;
}

export interface CreateRoomOptions {
  player?: RuntimeValue;
  sessionId?: RuntimeValue;
  maxPlayers?: number;
  mode?: RuntimeValue;
  nextResumeToken?: RuntimeValue;
}

export interface JoinRoomOptions {
  roomCode?: RuntimeValue;
  player?: RuntimeValue;
  sessionId?: RuntimeValue;
  resumeToken?: RuntimeValue;
  nextResumeToken?: RuntimeValue;
}

export interface RelaySignalOptions {
  roomCode?: RuntimeValue;
  toPeerId?: RuntimeValue;
  toSessionId?: RuntimeValue;
  signal?: RuntimeValue;
}

interface SignalingMember {
  peerId: string;
  connection: SignalingConnection | null;
  player: SignalingPlayer;
  sessionId: string;
  resumeTokenHash: string;
  lastActivityAt: number;
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
  retiredPeers: Map<string, string>;
}

interface SignalingMembership {
  roomCode: string;
  peerId: string;
}

/** Durable adapter state contains capability hashes, never bearer tokens or RTC payloads. */
export interface SignalingRoomSnapshot {
  version: 1;
  rooms: {
    roomCode: string;
    mode: string;
    maxPlayers: number;
    hostId: string;
    createdAt: number;
    touchedAt: number;
    retiredPeers?: { peerId: string; resumeTokenHash: string }[];
    peers: {
      peerId: string;
      connectionId: string | null;
      player: SignalingPlayer;
      sessionId: string;
      resumeTokenHash: string;
      lastActivityAt?: number;
      disconnectedAt?: number;
    }[];
  }[];
}

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return typeof value === 'object' && value !== null;
}

function cleanPlayer(player: RuntimeValue): SignalingPlayer {
  const source = isRecord(player) ? player : {};
  const id = String(source.id || '').trim();
  const name = String(source.name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(id) || !name) {
    throw Object.assign(new Error('invalid player'), { code: 'invalid_player' });
  }
  return { id, name };
}

function cleanSessionId(value: RuntimeValue, playerId: string): string {
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
  crypto.getRandomValues(word);
  return word[0] / 0x100000000;
}

function restoreRetiredPeers(value: RuntimeValue): Map<string, string> {
  if (value === undefined) return new Map();
  if (!Array.isArray(value) || value.length > MAX_RETIRED_PEER_IDS) {
    throw new Error('invalid retired signaling peers');
  }
  const retired = new Map<string, string>();
  for (const peer of value) {
    if (!isRecord(peer) || typeof peer.peerId !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,48}$/.test(peer.peerId) || typeof peer.resumeTokenHash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(peer.resumeTokenHash) || retired.has(peer.peerId)) {
      throw new Error('invalid retired signaling peer');
    }
    retired.set(peer.peerId, peer.resumeTokenHash);
  }
  return retired;
}

function restoreRoomHeader(entry: RuntimeValue): { room: SignalingRoom; peers: RuntimeValue[] } {
  if (!isRecord(entry) || typeof entry.roomCode !== 'string' ||
      !/^[A-Z0-9]{6}$/.test(entry.roomCode) || typeof entry.mode !== 'string' ||
      entry.mode.length > 24 || !Number.isInteger(entry.maxPlayers) ||
      Number(entry.maxPlayers) < 2 || Number(entry.maxPlayers) > 14 ||
      typeof entry.hostId !== 'string' || !Number.isFinite(entry.createdAt) ||
      !Number.isFinite(entry.touchedAt) || !Array.isArray(entry.peers) ||
      entry.peers.length > Number(entry.maxPlayers)) throw new Error('invalid signaling room snapshot');
  return { room: {
    roomCode: entry.roomCode, mode: entry.mode, maxPlayers: Number(entry.maxPlayers),
    hostId: entry.hostId, createdAt: Number(entry.createdAt), touchedAt: Number(entry.touchedAt),
    peers: new Map(), retiredPeers: restoreRetiredPeers(entry.retiredPeers),
  }, peers: entry.peers };
}

function restoreMember(
  raw: RuntimeValue,
  connectionForId: (id: string) => SignalingConnection | null,
  fallbackActivityAt: number,
): SignalingMember {
  if (!isRecord(raw) || typeof raw.peerId !== 'string' ||
      typeof raw.resumeTokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(raw.resumeTokenHash) ||
      typeof raw.sessionId !== 'string' ||
      (raw.connectionId !== null && (typeof raw.connectionId !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(raw.connectionId))) ||
      (raw.disconnectedAt != null && !Number.isFinite(raw.disconnectedAt)) ||
      (raw.lastActivityAt != null && !Number.isFinite(raw.lastActivityAt))) {
    throw new Error('invalid signaling member snapshot');
  }
  const player = cleanPlayer(raw.player);
  if (player.id !== raw.peerId) throw new Error('signaling snapshot identity mismatch');
  return {
    peerId: player.id, player, sessionId: cleanSessionId(raw.sessionId, player.id),
    connection: raw.connectionId === null ? null : connectionForId(raw.connectionId),
    resumeTokenHash: raw.resumeTokenHash,
    lastActivityAt: Number(raw.lastActivityAt ?? raw.disconnectedAt ?? fallbackActivityAt),
    ...(raw.disconnectedAt == null ? {} : { disconnectedAt: Number(raw.disconnectedAt) }),
  };
}

function restoreRoomPeers(
  room: SignalingRoom,
  peers: RuntimeValue[],
  connectionForId: (id: string) => SignalingConnection | null,
  membership: Map<SignalingConnection, SignalingMembership>,
): void {
  for (const raw of peers) {
    const peer = restoreMember(raw, connectionForId, room.touchedAt);
    if (room.peers.has(peer.peerId)) throw new Error('duplicate signaling member');
    if (room.retiredPeers.has(peer.peerId)) throw new Error('active signaling peer is retired');
    if (peer.connection && membership.has(peer.connection)) throw new Error('duplicate signaling connection');
    room.peers.set(peer.peerId, peer);
    if (peer.connection) membership.set(peer.connection, { roomCode: room.roomCode, peerId: peer.peerId });
  }
  if (!room.peers.has(room.hostId)) throw new Error('signaling snapshot host is missing');
  if (room.retiredPeers.size + room.peers.size - 1 > MAX_RETIRED_PEER_IDS) {
    throw new Error('signaling retirement capacity exceeded');
  }
}

export class SignalingRoomStore {
  readonly now: () => number;
  readonly roomCodeFactory: () => string;
  readonly roomTtlMs: number;
  readonly detachedGraceMs: number;
  readonly peerIdleTtlMs: number;
  readonly rooms = new Map<string, SignalingRoom>();
  readonly membership = new Map<SignalingConnection, SignalingMembership>();

  constructor({
    now = () => Date.now(),
    roomCodeFactory = () => createRoomCode(randomUnit),
    roomTtlMs = DEFAULT_ROOM_TTL_MS,
    detachedGraceMs = SIGNALING_DETACHED_GRACE_MS,
    peerIdleTtlMs = SIGNALING_PEER_IDLE_TTL_MS,
  }: SignalingRoomStoreOptions = {}) {
    if (![roomTtlMs, detachedGraceMs, peerIdleTtlMs].every((value) => Number.isFinite(value) && value > 0)) {
      throw new TypeError('signaling lifetimes must be positive finite milliseconds');
    }
    this.now = now;
    this.roomCodeFactory = roomCodeFactory;
    this.roomTtlMs = roomTtlMs;
    this.detachedGraceMs = detachedGraceMs;
    this.peerIdleTtlMs = peerIdleTtlMs;
  }

  exportState(connectionId: (connection: SignalingConnection) => string): SignalingRoomSnapshot {
    return {
      version: 1,
      rooms: [...this.rooms.values()].map((room) => ({
        roomCode: room.roomCode, mode: room.mode, maxPlayers: room.maxPlayers,
        hostId: room.hostId, createdAt: room.createdAt, touchedAt: room.touchedAt,
        retiredPeers: [...room.retiredPeers].map(([peerId, resumeTokenHash]) => ({ peerId, resumeTokenHash })),
        peers: [...room.peers.values()].map((peer) => ({
          peerId: peer.peerId, player: { ...peer.player }, sessionId: peer.sessionId,
          resumeTokenHash: peer.resumeTokenHash,
          lastActivityAt: peer.lastActivityAt,
          connectionId: peer.connection ? connectionId(peer.connection) : null,
          ...(peer.disconnectedAt == null ? {} : { disconnectedAt: peer.disconnectedAt }),
        })),
      })),
    };
  }

  /** Restore only validated adapter-owned data; missing sockets remain resumable seats. */
  restoreState(
    value: RuntimeValue,
    connectionForId: (id: string) => SignalingConnection | null,
  ): void {
    if (this.rooms.size || this.membership.size) throw new Error('restore requires an empty store');
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.rooms)) {
      throw new Error('invalid signaling snapshot');
    }
    const rooms = new Map<string, SignalingRoom>();
    const membership = new Map<SignalingConnection, SignalingMembership>();
    for (const entry of value.rooms) {
      const { room, peers } = restoreRoomHeader(entry);
      if (rooms.has(room.roomCode)) throw new Error('duplicate signaling room');
      restoreRoomPeers(room, peers, connectionForId, membership);
      rooms.set(room.roomCode, room);
    }
    for (const [code, room] of rooms) this.rooms.set(code, room);
    for (const [connection, member] of membership) this.membership.set(connection, member);
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
    { player, sessionId, maxPlayers = 14, mode = 'private', nextResumeToken }: CreateRoomOptions = {},
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
    const token = newSignalingResumeToken(nextResumeToken);
    const roomCode = this.#uniqueRoomCode();
    const room: SignalingRoom = {
      roomCode,
      mode: String(mode || 'private').slice(0, 24),
      maxPlayers,
      hostId: peerId,
      createdAt: this.now(),
      touchedAt: this.now(),
      peers: new Map<string, SignalingMember>(),
      retiredPeers: new Map<string, string>(),
    };
    room.peers.set(peerId, {
      peerId, connection, player: memberPlayer, sessionId: memberSessionId,
      resumeTokenHash: signalingResumeHash(token),
      lastActivityAt: this.now(),
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
      resumeToken: token,
    };
  }

  join(
    connection: SignalingConnection,
    { roomCode, player, sessionId, resumeToken, nextResumeToken }: JoinRoomOptions = {},
  ): SignalingJoinResponse {
    if (this.membership.has(connection)) {
      throw Object.assign(new Error('connection already joined'), { code: 'already_joined' });
    }
    const room = this.rooms.get(String(roomCode || ''));
    if (!room) throw Object.assign(new Error('room not found'), { code: 'room_not_found' });
    this.#assertRoomLive(room);
    const memberPlayer = cleanPlayer(player);
    const memberSessionId = cleanSessionId(sessionId, memberPlayer.id);
    const peerId = memberPlayer.id;
    const previous = room.peers.get(peerId);
    if (previous && this.#peerExpiryAt(previous) <= this.now()) {
      throw Object.assign(new Error('room seat expired'), { code: 'resume_denied' });
    }
    const token = newSignalingResumeToken(nextResumeToken);
    const nextHash = signalingResumeHash(token);
    // Accepting the already-installed next token makes a lost rotation reply
    // retryable. A stale token alone cannot mint a replacement capability.
    const requiredHash = previous?.resumeTokenHash ?? room.retiredPeers.get(peerId);
    if (requiredHash && !signalingResumeAllowed(requiredHash,
      signalingResumeHash(resumeToken), nextHash)) {
      throw Object.assign(new Error('room seat requires its private resume credential'), {
        code: 'resume_denied',
      });
    }
    if (!previous && room.peers.size >= room.maxPlayers) {
      throw Object.assign(new Error('room is full'), { code: 'room_full' });
    }
    // Reserve a tombstone for every active guest; simultaneous expirations
    // must never overflow the bound or evict a still-security-relevant proof.
    if (!previous && !room.retiredPeers.has(peerId) &&
        room.retiredPeers.size + room.peers.size - 1 >= MAX_RETIRED_PEER_IDS) {
      throw Object.assign(new Error('room identity capacity is exhausted'), { code: 'room_full' });
    }
    if (previous?.connection) this.membership.delete(previous.connection);
    const member: SignalingMember = {
      peerId, connection, player: memberPlayer, sessionId: memberSessionId,
      resumeTokenHash: nextHash,
      lastActivityAt: this.now(),
    };
    const peers = [...room.peers.values()].filter((peer) => peer.peerId !== peerId).map((peer) => ({
      peerId: peer.peerId,
      player: { ...peer.player },
      sessionId: peer.sessionId || '',
      isHost: peer.peerId === room.hostId,
    }));
    room.peers.set(peerId, member);
    room.retiredPeers.delete(peerId);
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
        resumeToken: token,
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
    this.#assertRoomLive(room);
    this.#assertPeerLive(sender);
    if (!target) throw Object.assign(new Error('target peer not found'), { code: 'peer_not_found' });
    if (this.#peerExpiryAt(target) <= this.now()) {
      throw Object.assign(new Error('target peer expired'), { code: 'peer_not_found' });
    }
    if (toSessionId && target.sessionId !== toSessionId) {
      throw Object.assign(new Error('target page session was replaced'), {
        code: 'stale_target_session',
      });
    }
    this.recoverActivity(connection, this.now());
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
    return [];
  }

  /** Keep an actively polling room alive without changing membership. */
  poll(connection: SignalingConnection): SignalingNotification[] {
    const membership = this.membership.get(connection);
    const room = membership && this.rooms.get(membership.roomCode);
    if (!membership || !room || room.peers.get(membership.peerId)?.connection !== connection) {
      throw Object.assign(new Error('room connection was replaced or expired'), { code: 'resume_denied' });
    }
    this.#assertRoomLive(room);
    this.#assertPeerLive(room.peers.get(membership.peerId)!);
    this.recoverActivity(connection, this.now());
    return [];
  }

  /** Restore verified socket activity without treating object wake as a heartbeat. */
  recoverActivity(connection: SignalingConnection, serverTimestamp: number): boolean {
    const membership = this.membership.get(connection);
    const room = membership && this.rooms.get(membership.roomCode);
    if (!membership || !room) return false;
    const member = room.peers.get(membership.peerId);
    if (!member || member.connection !== connection || !Number.isFinite(serverTimestamp)) return false;
    const activityAt = Math.min(serverTimestamp, this.now());
    member.lastActivityAt = Math.max(member.lastActivityAt, activityAt);
    room.touchedAt = Math.max(room.touchedAt, member.lastActivityAt);
    return true;
  }

  #peerExpiryAt(peer: SignalingMember): number {
    const idle = peer.lastActivityAt + this.peerIdleTtlMs;
    return peer.disconnectedAt == null ? idle : Math.min(idle, peer.disconnectedAt + this.detachedGraceMs);
  }

  #assertPeerLive(peer: SignalingMember): void {
    if (this.#peerExpiryAt(peer) <= this.now()) {
      throw Object.assign(new Error('room seat expired'), { code: 'resume_denied' });
    }
  }

  #assertRoomLive(room: SignalingRoom): void {
    const host = room.peers.get(room.hostId);
    if (room.touchedAt + this.roomTtlMs <= this.now() || !host || this.#peerExpiryAt(host) <= this.now()) {
      throw Object.assign(new Error('room expired'), { code: 'room_not_found' });
    }
  }

  nextExpiryAt(): number | null {
    let next = Infinity;
    for (const room of this.rooms.values()) {
      next = Math.min(next, room.touchedAt + this.roomTtlMs);
      for (const peer of room.peers.values()) next = Math.min(next, this.#peerExpiryAt(peer));
    }
    return Number.isFinite(next) ? next : null;
  }

  #expireRoom(room: SignalingRoom, detail?: string): SignalingNotification[] {
    this.rooms.delete(room.roomCode);
    const notifications: SignalingNotification[] = [];
    for (const peer of room.peers.values()) {
      if (peer.connection) this.membership.delete(peer.connection);
      notifications.push({ connection: peer.connection, message: { type: 'room_closed', payload: {
        roomCode: room.roomCode, reason: 'expired', ...(detail ? { detail } : {}),
      } } });
    }
    return notifications;
  }

  #expireGuest(room: SignalingRoom, peer: SignalingMember): SignalingNotification[] {
    room.peers.delete(peer.peerId);
    if (peer.connection) this.membership.delete(peer.connection);
    room.retiredPeers.set(peer.peerId, peer.resumeTokenHash);
    const notifications: SignalingNotification[] = [{ connection: peer.connection,
      message: { type: 'room_closed', payload: { roomCode: room.roomCode, reason: 'expired' } } }];
    for (const other of room.peers.values()) {
      notifications.push({ connection: other.connection, message: { type: 'peer_left', payload: {
        roomCode: room.roomCode, peerId: peer.peerId, reason: 'expired',
      } } });
    }
    return notifications;
  }

  sweepExpired(): SignalingNotification[] {
    const now = this.now();
    const notifications: SignalingNotification[] = [];
    for (const room of [...this.rooms.values()]) {
      if (room.touchedAt + this.roomTtlMs <= now) {
        notifications.push(...this.#expireRoom(room));
        continue;
      }
      const host = room.peers.get(room.hostId);
      if (!host || this.#peerExpiryAt(host) <= now) {
        notifications.push(...this.#expireRoom(room, 'host_timeout'));
        continue;
      }
      for (const peer of [...room.peers.values()]) {
        if (peer.peerId !== room.hostId && this.#peerExpiryAt(peer) <= now) {
          notifications.push(...this.#expireGuest(room, peer));
        }
      }
    }
    return notifications;
  }
}
