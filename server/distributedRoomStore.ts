import type { RuntimeValue } from '../src/runtimeTypes.ts';
/**
 * Redis-backed signaling membership for horizontally scaled deployments.
 *
 * Room commands use stateless Redis operations while publish/subscribe routes
 * WebRTC rendezvous to the function instance holding each connection. Host
 * identity is returned as room metadata; gameplay still travels peer to peer.
 */
import {
  Redis as RestRedis,
  type RedisConfigNodejs,
} from '@upstash/redis';
import IORedis, { type RedisOptions } from 'ioredis';
import { createRoomCode } from './roomCode.ts';
import {
  newSignalingConnectionId, newSignalingResumeToken, signalingResumeHash,
} from './signalingMembership.ts';
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
const ROOM_REFRESH_INTERVAL_MS = 60_000;
const HEALTH_PROBE_INTERVAL_MS = 5_000;

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
local raw = redis.call('GET', KEYS[2])
if raw then
  local room = cjson.decode(raw)
  local current = false
  for _, peer in ipairs(room.peers) do
    if peer.peerId == ARGV[2] and peer.connectionId == ARGV[3] then current = true end
  end
  if not current then return false end
end
local messages = {}
for index = 1, tonumber(ARGV[1]) do
  local message = redis.call('LPOP', KEYS[1])
  if not message then break end
  table.insert(messages, message)
end
-- A host departure deletes the room before delivering room_closed. The
-- generation-specific mailbox still belongs to this authenticated socket.
if not raw and #messages == 0 then return false end
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
  if peer.peerId == member.peerId then
    if not peer.resumeTokenHash or (peer.resumeTokenHash ~= ARGV[4] and
        peer.resumeTokenHash ~= member.resumeTokenHash) then
      return cjson.encode({ error = 'resume_denied' })
    end
    replacing = true
  else table.insert(peers, peer) end
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
  if peer.peerId == leaving then
    if peer.connectionId ~= ARGV[4] then return cjson.encode({ missing = true }) end
    found = true
  else table.insert(kept, peer) end
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

type RedisCommandClient = Pick<
  RestRedis,
  'ping' | 'set' | 'get' | 'eval' | 'pexpire' | 'del'
>;
type DeliveryHandler = (connection: SignalingConnection, message: SignalingMessage) => boolean;

type RedisSubscriber = Pick<
  IORedis,
  'status' | 'connect' | 'subscribe' | 'unsubscribe' | 'disconnect' | 'on' | 'once' | 'off'
>;

interface RedisSubscriberConstructor {
  new(url: string, options: RedisOptions): RedisSubscriber;
}

interface RestRedisConstructor {
  new(options: RedisConfigNodejs): RedisCommandClient;
}

const DefaultRestRedis: RestRedisConstructor = RestRedis;
const DefaultSubscriber: RedisSubscriberConstructor = IORedis;

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
  connectionId: string;
  resumeTokenHash: string;
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
  connectionId: string;
  recipient: string;
  nextRefreshAtMs: number;
  refreshing: Promise<void> | null;
}

export interface DistributedNotification {
  peerId?: string;
  connection?: SignalingConnection | null;
  recipient?: string;
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

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return typeof value === 'object' && value !== null;
}

function errorCode(value: RuntimeValue): string | null {
  if (isRecord(value) && typeof value.message === 'string' &&
      /max requests limit exceeded/i.test(value.message)) return 'redis_request_limit_exceeded';
  return isRecord(value) && typeof value.code === 'string' ? value.code : null;
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function cleanPlayer(player: RuntimeValue): SignalingPlayer {
  const source = isRecord(player) ? player : {};
  const id = String(source.id || '').trim();
  const name = String(source.name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(id) || !name) {
    throw codedError('invalid_player', 'invalid player');
  }
  return { id, name };
}

function cleanSessionId(value: RuntimeValue, playerId: string): string {
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

function parseResult(raw: RuntimeValue): Record<string, RuntimeValue> {
  const value: RuntimeValue = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!isRecord(value)) throw codedError('store_invalid', 'invalid room store response');
  return value;
}

function readStoredPeer(value: RuntimeValue): StoredPeer {
  if (!isRecord(value) || !isRecord(value.player)) {
    throw codedError('store_invalid', 'invalid peer in room store response');
  }
  const peerId = String(value.peerId || '');
  const player = cleanPlayer(value.player);
  const sessionId = cleanSessionId(value.sessionId, player.id);
  if (!peerId) throw codedError('store_invalid', 'invalid peer in room store response');
  return { peerId, player, sessionId,
    connectionId: typeof value.connectionId === 'string' ? value.connectionId : '',
    resumeTokenHash: typeof value.resumeTokenHash === 'string' ? value.resumeTokenHash : '',
  };
}

function recipientKey(roomCode: string, peer: Pick<StoredPeer, 'peerId' | 'connectionId'>): string {
  return `${roomCode}:${peer.peerId}:${peer.connectionId}`;
}

function readStoredRoom(value: RuntimeValue): StoredRoom {
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

function readSignalingMessage(value: RuntimeValue): SignalingMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string' || !isRecord(value.payload)) return null;
  return {
    type: value.type,
    payload: value.payload,
    ...(typeof value.requestId === 'string' ? { requestId: value.requestId } : {}),
  };
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
    const finish = (error: RuntimeValue = null): void => {
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
  private _healthProbe: Promise<RuntimeValue> | null = null;
  private _healthProbeUntilMs = -Infinity;

  constructor({
    redisUrl,
    restUrl,
    restToken,
    // Capability-less v1 records must not be claimed during a rolling upgrade.
    // This deployment boundary intentionally requires existing rooms to recreate.
    namespace = 'cot:signaling:v2',
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
    const noteError = (role: string, error: RuntimeValue): void => {
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
        const delivery: RuntimeValue = JSON.parse(raw);
        const recipient = String(isRecord(delivery) ? delivery.recipient || '' : '');
        if (recipient && this.connections.has(recipient)) {
          this.#flushMailbox(recipient).catch((error) => {
            console.error('[signal] Failed to drain Redis delivery mailbox', error);
          });
        }
      } catch (error) {
        console.error('[signal] Invalid Redis delivery', error);
      }
    });
  }

  roomKey(roomCode: RuntimeValue): string {
    return `${this.namespace}:room:${roomCode}`;
  }

  mailboxKey(peerId: RuntimeValue): string {
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
    // PING may succeed after Upstash has rejected ordinary commands for an
    // exhausted monthly allowance. Prove actual write readiness using one
    // reserved short-lived key. Coalesce probes, including failures, so a
    // health checker cannot multiply command usage within this warm instance.
    if (!this._healthProbe || this.now() >= this._healthProbeUntilMs) {
      this._healthProbeUntilMs = this.now() + HEALTH_PROBE_INTERVAL_MS;
      this._healthProbe = this.command.set(`${this.namespace}:health`, 'ready', {
        px: HEALTH_PROBE_INTERVAL_MS * 2,
      });
    }
    const [subscription, command] = await Promise.allSettled([
      this.start(timeoutMs),
      this._healthProbe,
    ]);
    const pong = command.status === 'fulfilled' ? command.value : null;
    const commandReady = command.status === 'fulfilled' && String(pong).toUpperCase() === 'OK';
    const subscriberReady = subscription.status === 'fulfilled' && this._subscribed;
    // HTTP availability is decided by the REST command path. When both
    // connections fail, expose that cause, not an optional subscriber error
    // which would misdiagnose a production 503 as mere polling degradation.
    const error = !commandReady
      ? command.status === 'rejected' ? command.reason : null
      : subscription.status === 'rejected' ? subscription.reason : null;
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

  async #runCommand(command: () => Promise<RuntimeValue>): Promise<RuntimeValue> {
    try {
      return await command();
    } catch (cause) {
      const exhausted = errorCode(cause) === 'redis_request_limit_exceeded';
      throw Object.assign(new Error(exhausted
        ? 'Multiplayer signaling capacity is exhausted. The service needs its request allowance restored.'
        : 'signaling room store is unavailable'), {
        code: exhausted ? 'signaling_capacity_exhausted' : 'signaling_store_unavailable',
        cause,
      });
    }
  }

  async #drainMailbox(membership: LocalMembership): Promise<SignalingMessage[]> {
    const id = membership.recipient;
    // Chain drains instead of sharing one result: a pub/sub wake and a client
    // poll can arrive together, and both consumers must not receive the same
    // RTC offer/candidate batch.
    const previous = this._drains.get(id) || Promise.resolve();
    const attempt = previous.catch(() => {}).then(async () => {
      const raw = await this.#runCommand(() => this.command.eval(
        DRAIN_DELIVERY_SCRIPT,
        [this.mailboxKey(id), this.roomKey(membership.roomCode)],
        [MAX_DRAIN_MESSAGES, membership.peerId, membership.connectionId],
      ));
      if (raw == null || raw === false) throw codedError('resume_denied', 'room connection was replaced');
      if (!Array.isArray(raw)) return [];
      const messages: SignalingMessage[] = [];
      for (const item of raw) {
        try {
          const parsed: RuntimeValue = typeof item === 'string' ? JSON.parse(item) : item;
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

  async #flushMailbox(recipient: string): Promise<number> {
    const id = recipient;
    const connection = this.connections.get(id);
    if (!connection || !this.deliveryHandler) return 0;
    const membership = this.membership.get(connection);
    if (!membership) return 0;
    const messages = await this.#drainMailbox(membership);
    let delivered = 0;
    for (const message of messages) {
      if (this.connections.get(id) !== connection) break;
      if (this.deliveryHandler(connection, message)) delivered++;
    }
    return delivered;
  }

  #remember(connection: SignalingConnection, roomCode: string, peer: StoredPeer): void {
    for (const [previous, membership] of this.membership) {
      if (membership.roomCode === roomCode && membership.peerId === peer.peerId) {
        this.membership.delete(previous);
        this.connections.delete(membership.recipient);
      }
    }
    const recipient = recipientKey(roomCode, peer);
    this.membership.set(connection, {
      roomCode,
      peerId: peer.peerId,
      connectionId: peer.connectionId,
      recipient,
      nextRefreshAtMs: this.now() + Math.min(ROOM_REFRESH_INTERVAL_MS, this.roomTtlMs / 4),
      refreshing: null,
    });
    this.connections.set(recipient, connection);
  }

  async #refreshRoom(membership: LocalMembership): Promise<void> {
    if (membership.refreshing) return membership.refreshing;
    const now = this.now();
    if (now < membership.nextRefreshAtMs) return;
    const renewal = this.#runCommand(() => this.command.pexpire(
      this.roomKey(membership.roomCode), this.roomTtlMs,
    )).then(() => {
      membership.nextRefreshAtMs = now + Math.min(ROOM_REFRESH_INTERVAL_MS, this.roomTtlMs / 4);
    });
    membership.refreshing = renewal;
    try {
      await renewal;
    } finally {
      if (membership.refreshing === renewal) membership.refreshing = null;
    }
  }

  async create(
    connection: SignalingConnection,
    { player, sessionId, maxPlayers = 14, mode = 'private', nextResumeToken }: CreateRoomOptions = {},
  ): Promise<SignalingJoinResult> {
    this.#warmSubscriber();
    if (this.membership.has(connection)) throw codedError('already_joined', 'connection already joined');
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 14) {
      throw codedError('invalid_capacity', 'invalid room capacity');
    }
    const memberPlayer = cleanPlayer(player);
    const memberSessionId = cleanSessionId(sessionId, memberPlayer.id);
    const token = newSignalingResumeToken(nextResumeToken);
    const member: StoredPeer = { peerId: memberPlayer.id, player: memberPlayer,
      sessionId: memberSessionId, connectionId: newSignalingConnectionId(),
      resumeTokenHash: signalingResumeHash(token) };
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
        peers: [member],
      };
      const created = await this.#runCommand(() => this.command.set(
        this.roomKey(roomCode),
        JSON.stringify(room),
        { px: this.roomTtlMs, nx: true },
      ));
      if (created !== 'OK') continue;
      this.#remember(connection, roomCode, member);
      return {
        roomCode,
        peerId,
        sessionId: memberSessionId,
        hostId: peerId,
        hostName: memberPlayer.name,
        mode: room.mode,
        maxPlayers,
        peers: [],
        resumeToken: token,
      };
    }
    throw codedError('room_code_exhausted', 'room code space is busy');
  }

  async join(
    connection: SignalingConnection,
    { roomCode, player, sessionId, resumeToken, nextResumeToken }: JoinRoomOptions = {},
  ): Promise<DistributedJoinResponse> {
    this.#warmSubscriber();
    if (this.membership.has(connection)) throw codedError('already_joined', 'connection already joined');
    const code = String(roomCode || '');
    const memberPlayer = cleanPlayer(player);
    const memberSessionId = cleanSessionId(sessionId, memberPlayer.id);
    const peerId = memberPlayer.id;
    const token = newSignalingResumeToken(nextResumeToken);
    const member: StoredPeer = { peerId, player: memberPlayer, sessionId: memberSessionId,
      connectionId: newSignalingConnectionId(), resumeTokenHash: signalingResumeHash(token) };
    const result = parseResult(await this.#runCommand(() => this.command.eval(
      JOIN_ROOM_SCRIPT,
      [this.roomKey(code)],
      [JSON.stringify(member), this.now(), this.roomTtlMs, signalingResumeHash(resumeToken)],
    )));
    if (result.error === 'room_not_found') throw codedError('room_not_found', 'room not found');
    if (result.error === 'room_full') throw codedError('room_full', 'room is full');
    if (result.error) throw codedError(String(result.error), 'could not join room');
    const room = readStoredRoom(result.room);
    const existing = room.peers.filter((peer) => peer.peerId !== peerId);
    const hostName = room.peers.find((peer) => peer.peerId === room.hostId)?.player?.name || '';
    this.#remember(connection, code, member);
    return {
      result: {
        roomCode: code,
        peerId,
        sessionId: memberSessionId,
        hostId: room.hostId,
        hostName,
        mode: room.mode,
        maxPlayers: room.maxPlayers,
        resumeToken: token,
        peers: existing.map((peer) => ({
          peerId: peer.peerId,
          player: { ...peer.player },
          sessionId: peer.sessionId || '',
          isHost: peer.peerId === room.hostId,
        })),
      },
      notify: existing.map((peer) => ({
        peerId: peer.peerId,
        recipient: recipientKey(code, peer),
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
    const raw = await this.#runCommand(() => this.command.get(this.roomKey(code)));
    if (!raw) throw codedError('room_not_found', 'room not found');
    const room = readStoredRoom(typeof raw === 'string' ? JSON.parse(raw) as RuntimeValue : raw);
    const sender = room.peers.find((peer) => peer.peerId === membership.peerId);
    if (!sender || sender.connectionId !== membership.connectionId) {
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
    await this.#refreshRoom(membership);
    return {
      peerId: target,
      recipient: recipientKey(code, targetMember),
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
    recipient,
  }: DistributedNotification): Promise<boolean> {
    if (connection && this.deliveryHandler && this.deliveryHandler(connection, message)) return true;
    const target = this.connections.get(String(recipient || ''));
    if (target && this.deliveryHandler && this.deliveryHandler(target, message)) return true;
    const id = String(recipient || '');
    if (!id || !peerId || !message || typeof message.type !== 'string') {
      throw codedError('invalid_delivery', 'invalid signaling delivery');
    }
    this.#warmSubscriber();
    await this.#runCommand(() => this.command.eval(
      ENQUEUE_DELIVERY_SCRIPT,
      [this.mailboxKey(id), this.channel],
      [JSON.stringify(message), MAX_MAILBOX_MESSAGES, this.deliveryTtlMs, JSON.stringify({ recipient: id })],
    ));
    return true;
  }

  /** Recover durable notifications when Redis pub/sub missed a wake-up. */
  async poll(connection: SignalingConnection): Promise<SignalingNotification[]> {
    const membership = this.membership.get(connection);
    if (!membership || this.connections.get(membership.recipient) !== connection) {
      throw codedError('resume_denied', 'room connection was replaced or expired');
    }
    const messages = await this.#drainMailbox(membership);
    await this.#refreshRoom(membership);
    return messages.map((message) => ({ connection, message }));
  }

  /** Preserve Redis membership across an unclean WebSocket transport loss. */
  detach(connection: SignalingConnection): SignalingNotification[] {
    const membership = this.membership.get(connection);
    if (!membership) return [];
    this.membership.delete(connection);
    if (this.connections.get(membership.recipient) === connection) {
      this.connections.delete(membership.recipient);
    }
    return [];
  }

  async leave(
    connection: SignalingConnection,
    reason = 'peer_left',
  ): Promise<DistributedNotification[]> {
    const membership = this.membership.get(connection);
    if (!membership) return [];
    if (this.connections.get(membership.recipient) !== connection) {
      this.membership.delete(connection);
      return [];
    }
    this.membership.delete(connection);
    this.connections.delete(membership.recipient);
    this.#warmSubscriber();
    await this.#runCommand(() => this.command.del(this.mailboxKey(membership.recipient)));
    const result = parseResult(await this.#runCommand(() => this.command.eval(
      LEAVE_ROOM_SCRIPT,
      [this.roomKey(membership.roomCode)],
      [membership.peerId, this.now(), this.roomTtlMs, membership.connectionId],
    )));
    if (result.missing) return [];
    if (result.closed) {
      const peers = Array.isArray(result.peers) ? result.peers.map(readStoredPeer) : [];
      return peers.map((peer) => ({
        peerId: peer.peerId,
        recipient: recipientKey(membership.roomCode, peer),
        message: { type: 'room_closed', payload: {
          roomCode: membership.roomCode,
          reason: 'host_left',
        } },
      }));
    }
    const peers = Array.isArray(result.peers) ? result.peers.map(readStoredPeer) : [];
    return peers.map((peer) => ({
      peerId: peer.peerId,
      recipient: recipientKey(membership.roomCode, peer),
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
