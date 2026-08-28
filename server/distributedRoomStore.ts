/**
 * Redis-backed signaling membership for horizontally scaled deployments.
 *
 * Room commands use stateless Redis operations while publish/subscribe routes
 * WebRTC rendezvous to the function instance holding each connection. Host
 * identity is returned as room metadata; gameplay still travels peer to peer.
 */
import { Redis as RestRedis } from '@upstash/redis';
import IORedis from 'ioredis';
import { createRoomCode } from './roomCode.ts';
import type {
  CreateRoomOptions,
  JoinRoomOptions,
  RelaySignalOptions,
  SignalingConnection,
  SignalingJoinResult,
  SignalingMessage,
  SignalingNotification,
  SignalingPlayer,
} from './roomStore.ts';

const DEFAULT_ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DELIVERY_TTL_MS = 10 * 60 * 1000;
const REDIS_READY_TIMEOUT_MS = 6_000;
const MAX_MAILBOX_MESSAGES = 256;
const MAX_DRAIN_MESSAGES = 64;

// Pub/sub is a latency hint, not the source of truth. Serverless Redis
// subscribers can reconnect between a room mutation and its notification;
// retaining each delivery in a short-lived mailbox lets the owning WebSocket
// recover it on its next room_poll instead of hanging RTC negotiation forever.
const ENQUEUE_DELIVERY_SCRIPT = `
redis.call('RPUSH', KEYS[1], ARGV[1])
redis.call('LTRIM', KEYS[1], -tonumber(ARGV[2]), -1)
redis.call('PEXPIRE', KEYS[1], ARGV[3])
redis.call('PUBLISH', KEYS[2], ARGV[4])
return 1
`;

const DRAIN_DELIVERY_SCRIPT = `
local messages = {}
for index = 1, tonumber(ARGV[1]) do
  local message = redis.call('LPOP', KEYS[1])
  if not message then break end
  table.insert(messages, message)
end
if redis.call('LLEN', KEYS[1]) == 0 then redis.call('DEL', KEYS[1]) end
return messages
`;

const JOIN_ROOM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({ error = 'room_not_found' }) end
local room = cjson.decode(raw)
local member = cjson.decode(ARGV[1])
local peers = {}
local replacing = false
for _, peer in ipairs(room.peers) do
  if peer.peerId == member.peerId then replacing = true else table.insert(peers, peer) end
end
if not replacing and #room.peers >= tonumber(room.maxPlayers) then
  return cjson.encode({ error = 'room_full' })
end
table.insert(peers, member)
room.peers = peers
room.touchedAt = tonumber(ARGV[2])
redis.call('SET', KEYS[1], cjson.encode(room), 'PX', ARGV[3])
return cjson.encode({ room = room })
`;

const LEAVE_ROOM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({ missing = true }) end
local room = cjson.decode(raw)
local leaving = ARGV[1]
local kept = {}
local found = false
for _, peer in ipairs(room.peers) do
  if peer.peerId == leaving then found = true else table.insert(kept, peer) end
end
if not found then return cjson.encode({ missing = true }) end
room.peers = kept
if room.hostId == leaving then
  redis.call('DEL', KEYS[1])
  return cjson.encode({ closed = true, peers = kept })
end
room.touchedAt = tonumber(ARGV[2])
redis.call('SET', KEYS[1], cjson.encode(room), 'PX', ARGV[3])
return cjson.encode({ closed = false, peers = kept })
`;

type RedisCommandClient = Record<string, (...args: unknown[]) => Promise<unknown>>;
type DeliveryHandler = (connection: SignalingConnection, message: SignalingMessage) => boolean;

interface RedisSubscriber {
  status: string;
  connect(): Promise<unknown>;
  subscribe(channel: string): Promise<unknown>;
  unsubscribe(channel: string): Promise<unknown>;
  disconnect(): void;
  on(event: string, listener: (...args: string[]) => void): this;
  once(event: string, listener: () => void): this;
  off(event: string, listener: () => void): this;
}

interface RedisSubscriberConstructor {
  new(url: string, options: Record<string, unknown>): RedisSubscriber;
}

interface RestRedisConstructor {
  new(options: Record<string, unknown>): RedisCommandClient;
}

const DefaultRestRedis = RestRedis as unknown as RestRedisConstructor;
const DefaultSubscriber = IORedis as unknown as RedisSubscriberConstructor;

interface DistributedStoreOptions {
  redisUrl?: string;
  restUrl?: string;
  restToken?: string;
  namespace?: string;
  roomTtlMs?: number;
  deliveryTtlMs?: number;
  now?: () => number;
  roomCodeFactory?: () => string;
  RestRedisImpl?: RestRedisConstructor;
  SubscriberImpl?: RedisSubscriberConstructor;
  commandClient?: RedisCommandClient | null;
}

interface StoredPeer {
  peerId: string;
  player: SignalingPlayer;
  sessionId: string;
}

interface StoredRoom {
  roomCode: string;
  mode: string;
  maxPlayers: number;
  hostId: string;
  createdAt: number;
  touchedAt: number;
  peers: StoredPeer[];
}

interface LocalMembership {
  roomCode: string;
  peerId: string;
}

export interface DistributedNotification {
  peerId?: string;
  connection?: SignalingConnection | null;
  message: SignalingMessage;
}

export interface DistributedJoinResponse {
  result: SignalingJoinResult;
  notify: DistributedNotification[];
}

export interface DistributedStoreHealth {
  ok: boolean;
  command: 'ready' | 'unavailable';
  subscriber: 'ready' | 'polling_fallback';
  degraded?: boolean;
  code?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorCode(value: unknown): string | null {
  return isRecord(value) && typeof value.code === 'string' ? value.code : null;
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function cleanPlayer(player: unknown): SignalingPlayer {
  const source = isRecord(player) ? player : {};
  const id = String(source.id || '').trim();
  const name = String(source.name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(id) || !name) {
    throw codedError('invalid_player', 'invalid player');
  }
  return { id, name };
}

function cleanSessionId(value: unknown, playerId: string): string {
  const id = String(value || '').trim();
  if (!id && /^[a-zA-Z0-9_-]{1,48}$/.test(playerId)) return `legacy_${playerId}`;
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    throw codedError('invalid_session', 'invalid signaling session');
  }
  return id;
}

function randomUnit(): number {
  const word = new Uint32Array(1);
  globalThis.crypto.getRandomValues(word);
  return word[0] / 0x100000000;
}

function parseResult(raw: unknown): Record<string, unknown> {
  const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!isRecord(value)) throw codedError('store_invalid', 'invalid room store response');
  return value;
}

function readStoredPeer(value: unknown): StoredPeer {
  if (!isRecord(value) || !isRecord(value.player)) {
    throw codedError('store_invalid', 'invalid peer in room store response');
  }
  const peerId = String(value.peerId || '');
  const player = cleanPlayer(value.player);
  const sessionId = cleanSessionId(value.sessionId, player.id);
  if (!peerId) throw codedError('store_invalid', 'invalid peer in room store response');
  return { peerId, player, sessionId };
}

function readStoredRoom(value: unknown): StoredRoom {
  if (!isRecord(value) || !Array.isArray(value.peers)) {
    throw codedError('store_invalid', 'invalid room in store response');
  }
  return {
    roomCode: String(value.roomCode || ''),
    mode: String(value.mode || 'private'),
    maxPlayers: Number(value.maxPlayers) || 14,
    hostId: String(value.hostId || ''),
    createdAt: Number(value.createdAt) || 0,
    touchedAt: Number(value.touchedAt) || 0,
    peers: value.peers.map(readStoredPeer),
  };
}

function readSignalingMessage(value: unknown): SignalingMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string' || !isRecord(value.payload)) return null;
  return value as unknown as SignalingMessage;
}

function waitForRedisReady(
  client: RedisSubscriber,
  timeoutMs = REDIS_READY_TIMEOUT_MS,
): Promise<void> {
  if (client.status === 'ready') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      client.off('ready', onReady);
      client.off('end', onEnd);
    };
    const finish = (error: unknown = null): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onEnd = () => finish(Object.assign(new Error('Redis connection ended before ready'), {
      code: 'redis_connection_ended',
    }));
    const timer = setTimeout(() => finish(Object.assign(
      new Error(`Redis did not become ready within ${timeoutMs} ms`),
      { code: 'redis_ready_timeout' },
    )), timeoutMs);
    client.once('ready', onReady);
    client.once('end', onEnd);
    if (client.status === 'ready') {
      finish();
      return;
    }
    if (client.status === 'wait' || client.status === 'end') {
      Promise.resolve(client.connect()).catch((error) => {
        // ioredis can reject the first connect() promise while its configured
        // retry strategy is already reconnecting. Keep waiting in that case;
        // an actually-ended client fails immediately and is retryable by the
        // next start() call.
        if (client.status === 'end') finish(error);
      });
    }
  });
}

/**
 * Redis-backed room coordination for horizontally scaled WebSocket functions.
 * Connections remain instance-local; a single Redis pub/sub channel routes
 * notifications and RTC signals to the instance currently holding each peer.
 */
export class DistributedSignalingRoomStore {
  readonly namespace: string;
  readonly channel: string;
  readonly roomTtlMs: number;
  readonly deliveryTtlMs: number;
  readonly now: () => number;
  readonly roomCodeFactory: () => string;
  readonly membership = new Map<SignalingConnection, LocalMembership>();
  readonly connections = new Map<string, SignalingConnection>();
  deliveryHandler: DeliveryHandler | null = null;
  readonly command: RedisCommandClient;
  readonly subscriber: RedisSubscriber;
  private _startPromise: Promise<void> | null = null;
  private _subscribed = false;
  private _closed = false;
  private readonly _drains = new Map<string, Promise<SignalingMessage[]>>();
  private _lastErrorLogAt = 0;

  constructor({
    redisUrl,
    restUrl,
    restToken,
    namespace = 'cot:signaling:v1',
    roomTtlMs = DEFAULT_ROOM_TTL_MS,
    deliveryTtlMs = DEFAULT_DELIVERY_TTL_MS,
    now = () => Date.now(),
    roomCodeFactory = () => createRoomCode(randomUnit),
    RestRedisImpl = DefaultRestRedis,
    SubscriberImpl = DefaultSubscriber,
    commandClient = null,
  }: DistributedStoreOptions = {}) {
    if (!redisUrl) throw new TypeError('distributed signaling requires redisUrl');
    if (!commandClient && (!restUrl || !restToken)) {
      throw new TypeError('distributed signaling requires Upstash REST credentials');
    }
    this.namespace = namespace;
    this.channel = `${namespace}:delivery`;
    this.roomTtlMs = roomTtlMs;
    this.deliveryTtlMs = deliveryTtlMs;
    this.now = now;
    this.roomCodeFactory = roomCodeFactory;
    // Room CRUD is stateless HTTP. Only pub/sub retains a TCP connection,
    // avoiding one command socket plus one subscriber socket per Fluid
    // function instance.
    this.command = commandClient || new RestRedisImpl({
      url: restUrl,
      token: restToken,
      automaticDeserialization: false,
      readYourWrites: true,
      retry: {
        retries: 2,
        backoff: (attempt: number) => Math.min(800, 100 * (2 ** attempt)),
      },
      signal: () => AbortSignal.timeout(REDIS_READY_TIMEOUT_MS),
    });
    this.subscriber = new SubscriberImpl(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 4_000,
      enableReadyCheck: true,
      keepAlive: 10_000,
      retryStrategy: (attempt: number) => Math.min(2_000, 100 * (2 ** Math.min(attempt - 1, 5))),
    });
    const noteError = (role: string, error: unknown): void => {
      const now = Date.now();
      if (now - this._lastErrorLogAt < 5_000) return;
      this._lastErrorLogAt = now;
      console.warn(`[signal] Redis ${role} connection error:`, error);
    };
    this.subscriber.on('error', (error) => noteError('subscriber', error));
    this.subscriber.on('end', () => { this._subscribed = false; });
    this.subscriber.on('message', (channel: string, raw: string) => {
      if (channel !== this.channel) return;
      try {
        const delivery: unknown = JSON.parse(raw);
        const peerId = String(isRecord(delivery) ? delivery.peerId || '' : '');
        if (peerId && this.connections.has(peerId)) {
          this.#flushMailbox(peerId).catch((error) => {
            console.error('[signal] Failed to drain Redis delivery mailbox', error);
          });
        }
      } catch (error) {
        console.error('[signal] Invalid Redis delivery', error);
      }
    });
  }

  roomKey(roomCode: unknown): string {
    return `${this.namespace}:room:${roomCode}`;
  }

  mailboxKey(peerId: unknown): string {
    return `${this.namespace}:mailbox:${peerId}`;
  }

  setDeliveryHandler(handler: DeliveryHandler): void {
    this.deliveryHandler = handler;
  }

  start(timeoutMs = REDIS_READY_TIMEOUT_MS): Promise<void> {
    if (this._closed) return Promise.reject(codedError('store_closed', 'signaling room store is closed'));
    if (this.subscriber.status === 'ready' && this._subscribed) {
      return Promise.resolve();
    }
    if (this._startPromise) return this._startPromise;
    const attempt = (async () => {
      await waitForRedisReady(this.subscriber, timeoutMs);
      if (!this._subscribed) {
        await this.subscriber.subscribe(this.channel);
        this._subscribed = true;
      }
    })();
    const tracked = attempt.finally(() => {
      // A transient cold-start failure must never poison a warm function
      // instance. Clearing this latch lets the very next room request retry.
      if (this._startPromise === tracked) this._startPromise = null;
    });
    this._startPromise = tracked;
    return this._startPromise;
  }

  #warmSubscriber(): void {
    // Pub/sub only shortens mailbox latency. Room state and every delivery are
    // durable REST commands, so a blocked TCP subscription must never block a
    // first-time create/join/offer. Polling drains the same mailbox until the
    // subscriber reconnects on a later warm request.
    this.start().catch(() => {});
  }

  /** REST is required; pub/sub may degrade to the durable polling mailbox. */
  async health(timeoutMs = REDIS_READY_TIMEOUT_MS): Promise<DistributedStoreHealth> {
    const [subscription, command] = await Promise.allSettled([
      this.start(timeoutMs),
      this.command.ping(),
    ]);
    const pong = command.status === 'fulfilled' ? command.value : null;
    const commandReady = command.status === 'fulfilled' && String(pong).toUpperCase() === 'PONG';
    const subscriberReady = subscription.status === 'fulfilled' && this._subscribed;
    const error = subscription.status === 'rejected'
      ? subscription.reason
      : command.status === 'rejected' ? command.reason : null;
    return {
      ok: commandReady,
      command: commandReady ? 'ready' : 'unavailable',
      subscriber: subscriberReady ? 'ready' : 'polling_fallback',
      ...(!commandReady ? {
        code: errorCode(error) || 'redis_unavailable',
      } : !subscriberReady ? {
        degraded: true,
        code: errorCode(error) || 'redis_subscriber_unavailable',
      } : {}),
    };
  }

  async #runCommand(method: string, ...args: unknown[]): Promise<unknown> {
    try {
      const command = this.command[method];
      if (typeof command !== 'function') throw new Error(`unsupported Redis command: ${method}`);
      return await command.apply(this.command, args);
    } catch (cause) {
      throw Object.assign(new Error('signaling room store is unavailable'), {
        code: 'signaling_store_unavailable',
        cause,
      });
    }
  }

  async #drainMailbox(peerId: unknown): Promise<SignalingMessage[]> {
    const id = String(peerId || '');
    if (!id) return [];
    // Chain drains instead of sharing one result: a pub/sub wake and a client
    // poll can arrive together, and both consumers must not receive the same
    // RTC offer/candidate batch.
    const previous = this._drains.get(id) || Promise.resolve();
    const attempt = previous.catch(() => {}).then(async () => {
      const raw = await this.#runCommand('eval', DRAIN_DELIVERY_SCRIPT,
        [this.mailboxKey(id)], [MAX_DRAIN_MESSAGES]);
      if (!Array.isArray(raw)) return [];
      const messages: SignalingMessage[] = [];
      for (const item of raw) {
        try {
          const parsed: unknown = typeof item === 'string' ? JSON.parse(item) : item;
          const message = readSignalingMessage(parsed);
          if (message) messages.push(message);
        } catch (_) { /* discard malformed mailbox entries */ }
      }
      return messages;
    });
    this._drains.set(id, attempt);
    try {
      return await attempt;
    } finally {
      if (this._drains.get(id) === attempt) this._drains.delete(id);
    }
  }

  async #flushMailbox(peerId: unknown): Promise<number> {
    const id = String(peerId || '');
    const connection = this.connections.get(id);
    if (!connection || !this.deliveryHandler) return 0;
    const messages = await this.#drainMailbox(id);
    let delivered = 0;
    for (const message of messages) {
      if (this.connections.get(id) !== connection) break;
      if (this.deliveryHandler(connection, message)) delivered++;
    }
    return delivered;
  }

  #remember(connection: SignalingConnection, roomCode: string, peerId: string): void {
    const previous = this.connections.get(peerId);
    if (previous && previous !== connection) this.membership.delete(previous);
    this.membership.set(connection, { roomCode, peerId });
    this.connections.set(peerId, connection);
  }

  async create(
    connection: SignalingConnection,
    { player, sessionId, maxPlayers = 14, mode = 'private' }: CreateRoomOptions = {},
  ): Promise<SignalingJoinResult> {
    this.#warmSubscriber();
    if (this.membership.has(connection)) throw codedError('already_joined', 'connection already joined');
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 14) {
      throw codedError('invalid_capacity', 'invalid room capacity');
    }
    const memberPlayer = cleanPlayer(player);
    const memberSessionId = cleanSessionId(sessionId, memberPlayer.id);
    for (let attempt = 0; attempt < 16; attempt++) {
      const roomCode = this.roomCodeFactory();
      const peerId = memberPlayer.id;
      const now = this.now();
      const room: StoredRoom = {
        roomCode,
        mode: String(mode || 'private').slice(0, 24),
        maxPlayers,
        hostId: peerId,
        createdAt: now,
        touchedAt: now,
        peers: [{ peerId, player: memberPlayer, sessionId: memberSessionId }],
      };
      const created = await this.#runCommand('set',
        this.roomKey(roomCode), JSON.stringify(room), { px: this.roomTtlMs, nx: true },
      );
      if (created !== 'OK') continue;
      this.#remember(connection, roomCode, peerId);
      return {
        roomCode,
        peerId,
        sessionId: memberSessionId,
        hostId: peerId,
        hostName: memberPlayer.name,
        mode: room.mode,
        maxPlayers,
        peers: [],
      };
    }
    throw codedError('room_code_exhausted', 'room code space is busy');
  }

  async join(
    connection: SignalingConnection,
    { roomCode, player, sessionId }: JoinRoomOptions = {},
  ): Promise<DistributedJoinResponse> {
    this.#warmSubscriber();
    if (this.membership.has(connection)) throw codedError('already_joined', 'connection already joined');
    const code = String(roomCode || '');
    const memberPlayer = cleanPlayer(player);
    const memberSessionId = cleanSessionId(sessionId, memberPlayer.id);
    const peerId = memberPlayer.id;
    const member = { peerId, player: memberPlayer, sessionId: memberSessionId };
    const result = parseResult(await this.#runCommand('eval',
      JOIN_ROOM_SCRIPT,
      [this.roomKey(code)],
      [JSON.stringify(member), this.now(), this.roomTtlMs],
    ));
    if (result.error === 'room_not_found') throw codedError('room_not_found', 'room not found');
    if (result.error === 'room_full') throw codedError('room_full', 'room is full');
    if (result.error) throw codedError(String(result.error), 'could not join room');
    const room = readStoredRoom(result.room);
    const existing = room.peers.filter((peer) => peer.peerId !== peerId);
    const hostName = room.peers.find((peer) => peer.peerId === room.hostId)?.player?.name || '';
    this.#remember(connection, code, peerId);
    return {
      result: {
        roomCode: code,
        peerId,
        sessionId: memberSessionId,
        hostId: room.hostId,
        hostName,
        mode: room.mode,
        maxPlayers: room.maxPlayers,
        peers: existing.map((peer) => ({
          peerId: peer.peerId,
          player: { ...peer.player },
          sessionId: peer.sessionId || '',
          isHost: peer.peerId === room.hostId,
        })),
      },
      notify: existing.map((peer) => ({
        peerId: peer.peerId,
        message: { type: 'peer_joined', payload: {
          roomCode: code,
          peerId,
          player: { ...member.player },
          sessionId: memberSessionId,
        } },
      })),
    };
  }

  async relay(
    connection: SignalingConnection,
    { roomCode, toPeerId, toSessionId, signal }: RelaySignalOptions = {},
  ): Promise<DistributedNotification> {
    this.#warmSubscriber();
    const code = String(roomCode || '');
    const membership = this.membership.get(connection);
    if (!membership || membership.roomCode !== code) {
      throw codedError('not_in_room', 'not a room member');
    }
    const raw = await this.#runCommand('get', this.roomKey(code));
    if (!raw) throw codedError('room_not_found', 'room not found');
    const room = readStoredRoom(typeof raw === 'string' ? JSON.parse(raw) as unknown : raw);
    const sender = room.peers.find((peer) => peer.peerId === membership.peerId);
    if (!sender) {
      throw codedError('not_in_room', 'not a room member');
    }
    const target = String(toPeerId || '');
    const targetMember = room.peers.find((peer) => peer.peerId === target);
    if (!targetMember) {
      throw codedError('peer_not_found', 'target peer not found');
    }
    if (toSessionId && targetMember.sessionId !== toSessionId) {
      throw codedError('stale_target_session', 'target page session was replaced');
    }
    await this.#runCommand('pexpire', this.roomKey(code), this.roomTtlMs);
    return {
      peerId: target,
      message: {
        type: 'room_signal',
        payload: {
          roomCode: code,
          fromPeerId: membership.peerId,
          fromSessionId: sender.sessionId,
          toSessionId: targetMember.sessionId,
          signal,
        },
      },
    };
  }

  async deliver({
    peerId,
    connection,
    message,
  }: DistributedNotification): Promise<boolean> {
    if (connection && this.deliveryHandler && this.deliveryHandler(connection, message)) return true;
    const target = this.connections.get(String(peerId || ''));
    if (target && this.deliveryHandler && this.deliveryHandler(target, message)) return true;
    const id = String(peerId || '');
    if (!id || !message || typeof message.type !== 'string') {
      throw codedError('invalid_delivery', 'invalid signaling delivery');
    }
    this.#warmSubscriber();
    await this.#runCommand('eval', ENQUEUE_DELIVERY_SCRIPT,
      [this.mailboxKey(id), this.channel],
      [JSON.stringify(message), MAX_MAILBOX_MESSAGES, this.deliveryTtlMs, JSON.stringify({ peerId: id })],
    );
    return true;
  }

  /** Recover durable notifications when Redis pub/sub missed a wake-up. */
  async poll(connection: SignalingConnection): Promise<SignalingNotification[]> {
    const membership = this.membership.get(connection);
    if (!membership || this.connections.get(membership.peerId) !== connection) return [];
    await this.#runCommand('pexpire', this.roomKey(membership.roomCode), this.roomTtlMs);
    const messages = await this.#drainMailbox(membership.peerId);
    return messages.map((message) => ({ connection, message }));
  }

  /** Preserve Redis membership across an unclean WebSocket transport loss. */
  detach(connection: SignalingConnection): SignalingNotification[] {
    const membership = this.membership.get(connection);
    if (!membership) return [];
    this.membership.delete(connection);
    if (this.connections.get(membership.peerId) === connection) {
      this.connections.delete(membership.peerId);
    }
    return [];
  }

  async leave(
    connection: SignalingConnection,
    reason = 'peer_left',
  ): Promise<DistributedNotification[]> {
    const membership = this.membership.get(connection);
    if (!membership) return [];
    if (this.connections.get(membership.peerId) !== connection) {
      this.membership.delete(connection);
      return [];
    }
    this.membership.delete(connection);
    this.connections.delete(membership.peerId);
    this.#warmSubscriber();
    await this.#runCommand('del', this.mailboxKey(membership.peerId));
    const result = parseResult(await this.#runCommand('eval',
      LEAVE_ROOM_SCRIPT,
      [this.roomKey(membership.roomCode)],
      [membership.peerId, this.now(), this.roomTtlMs],
    ));
    if (result.missing) return [];
    if (result.closed) {
      const peers = Array.isArray(result.peers) ? result.peers.map(readStoredPeer) : [];
      return peers.map((peer) => ({
        peerId: peer.peerId,
        message: { type: 'room_closed', payload: {
          roomCode: membership.roomCode,
          reason: 'host_left',
        } },
      }));
    }
    const peers = Array.isArray(result.peers) ? result.peers.map(readStoredPeer) : [];
    return peers.map((peer) => ({
      peerId: peer.peerId,
      message: { type: 'peer_left', payload: {
        roomCode: membership.roomCode,
        peerId: membership.peerId,
        reason,
      } },
    }));
  }

  sweepExpired(): SignalingNotification[] {
    return [];
  }

  async close(): Promise<void> {
    this._closed = true;
    this.membership.clear();
    this.connections.clear();
    this._drains.clear();
    try { await this.subscriber.unsubscribe(this.channel); } catch (_) { /* already offline */ }
    this.subscriber.disconnect();
  }
}
