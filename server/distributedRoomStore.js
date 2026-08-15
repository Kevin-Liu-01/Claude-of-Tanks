/**
 * Redis-backed signaling membership for horizontally scaled deployments.
 *
 * Room commands use stateless Redis operations while publish/subscribe routes
 * WebRTC rendezvous to the function instance holding each connection. Host
 * identity is returned as room metadata; gameplay still travels peer to peer.
 */
import { randomUUID } from 'node:crypto';
import { Redis as RestRedis } from '@upstash/redis';
import IORedis from 'ioredis';
import { createRoomCode } from '../src/net/protocol.js';

const DEFAULT_ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const REDIS_READY_TIMEOUT_MS = 6_000;

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

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function cleanPlayer(player) {
  const id = String(player && player.id || '').trim();
  const name = String(player && player.name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(id) || !name) {
    throw codedError('invalid_player', 'invalid player');
  }
  return { id, name };
}

function randomUnit() {
  const word = new Uint32Array(1);
  globalThis.crypto.getRandomValues(word);
  return word[0] / 0x100000000;
}

function randomPeerId() {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

function parseResult(raw) {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!value || typeof value !== 'object') throw codedError('store_invalid', 'invalid room store response');
  return value;
}

function waitForRedisReady(client, timeoutMs = REDIS_READY_TIMEOUT_MS) {
  if (client.status === 'ready') return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      client.off('ready', onReady);
      client.off('end', onEnd);
    };
    const finish = (error = null) => {
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
  constructor({
    redisUrl,
    restUrl,
    restToken,
    namespace = 'cot:signaling:v1',
    roomTtlMs = DEFAULT_ROOM_TTL_MS,
    now = () => Date.now(),
    roomCodeFactory = () => createRoomCode(randomUnit),
    peerIdFactory = randomPeerId,
    RestRedisImpl = RestRedis,
    SubscriberImpl = IORedis,
    commandClient = null,
  } = {}) {
    if (!redisUrl) throw new TypeError('distributed signaling requires redisUrl');
    if (!commandClient && (!restUrl || !restToken)) {
      throw new TypeError('distributed signaling requires Upstash REST credentials');
    }
    this.namespace = namespace;
    this.channel = `${namespace}:delivery`;
    this.roomTtlMs = roomTtlMs;
    this.now = now;
    this.roomCodeFactory = roomCodeFactory;
    this.peerIdFactory = peerIdFactory;
    this.membership = new Map();
    this.connections = new Map();
    this.deliveryHandler = null;
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
        backoff: (attempt) => Math.min(800, 100 * (2 ** attempt)),
      },
      signal: () => AbortSignal.timeout(REDIS_READY_TIMEOUT_MS),
    });
    this.subscriber = new SubscriberImpl(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 4_000,
      enableReadyCheck: true,
      keepAlive: 10_000,
      retryStrategy: (attempt) => Math.min(2_000, 100 * (2 ** Math.min(attempt - 1, 5))),
    });
    this._startPromise = null;
    this._subscribed = false;
    this._closed = false;
    this._lastErrorLogAt = 0;
    const noteError = (role, error) => {
      const now = Date.now();
      if (now - this._lastErrorLogAt < 5_000) return;
      this._lastErrorLogAt = now;
      console.warn(`[signal] Redis ${role} connection error:`, error);
    };
    this.subscriber.on('error', (error) => noteError('subscriber', error));
    this.subscriber.on('end', () => { this._subscribed = false; });
    this.subscriber.on('message', (channel, raw) => {
      if (channel !== this.channel) return;
      try {
        const delivery = JSON.parse(raw);
        const connection = this.connections.get(String(delivery.peerId || ''));
        if (connection && this.deliveryHandler) this.deliveryHandler(connection, delivery.message);
      } catch (error) {
        console.error('[signal] Invalid Redis delivery', error);
      }
    });
  }

  roomKey(roomCode) {
    return `${this.namespace}:room:${roomCode}`;
  }

  setDeliveryHandler(handler) {
    this.deliveryHandler = handler;
  }

  start(timeoutMs = REDIS_READY_TIMEOUT_MS) {
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

  async #ready() {
    const deadline = Date.now() + REDIS_READY_TIMEOUT_MS;
    let cause = null;
    let attempt = 0;
    while (Date.now() < deadline) {
      try {
        await this.start(Math.max(500, deadline - Date.now()));
        return;
      } catch (error) {
        cause = error;
        attempt++;
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await new Promise((resolve) => setTimeout(resolve,
          Math.min(remaining, 100 * (2 ** Math.min(attempt - 1, 4)))));
      }
    }
    throw Object.assign(new Error('signaling room store is unavailable'), {
      code: 'signaling_store_unavailable', cause,
    });
  }

  /** A real readiness probe: REST commands and the sole pub/sub socket. */
  async health(timeoutMs = REDIS_READY_TIMEOUT_MS) {
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
      ok: commandReady && subscriberReady,
      command: commandReady ? 'ready' : 'unavailable',
      subscriber: subscriberReady ? 'ready' : 'unavailable',
      ...(!commandReady || !subscriberReady ? {
        code: typeof error?.code === 'string' ? error.code : 'redis_unavailable',
      } : {}),
    };
  }

  async #runCommand(method, ...args) {
    try {
      return await this.command[method](...args);
    } catch (cause) {
      throw Object.assign(new Error('signaling room store is unavailable'), {
        code: 'signaling_store_unavailable',
        cause,
      });
    }
  }

  #remember(connection, roomCode, peerId) {
    const previous = this.connections.get(peerId);
    if (previous && previous !== connection) this.membership.delete(previous);
    this.membership.set(connection, { roomCode, peerId });
    this.connections.set(peerId, connection);
  }

  async create(connection, { player, maxPlayers = 14, mode = 'private' } = {}) {
    await this.#ready();
    if (this.membership.has(connection)) throw codedError('already_joined', 'connection already joined');
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 14) {
      throw codedError('invalid_capacity', 'invalid room capacity');
    }
    const memberPlayer = cleanPlayer(player);
    for (let attempt = 0; attempt < 16; attempt++) {
      const roomCode = this.roomCodeFactory();
      const peerId = memberPlayer.id;
      const now = this.now();
      const room = {
        roomCode,
        mode: String(mode || 'private').slice(0, 24),
        maxPlayers,
        hostId: peerId,
        createdAt: now,
        touchedAt: now,
        peers: [{ peerId, player: memberPlayer }],
      };
      const created = await this.#runCommand('set',
        this.roomKey(roomCode), JSON.stringify(room), { px: this.roomTtlMs, nx: true },
      );
      if (created !== 'OK') continue;
      this.#remember(connection, roomCode, peerId);
      return {
        roomCode,
        peerId,
        hostId: peerId,
        hostName: memberPlayer.name,
        mode: room.mode,
        maxPlayers,
        peers: [],
      };
    }
    throw codedError('room_code_exhausted', 'room code space is busy');
  }

  async join(connection, { roomCode, player } = {}) {
    await this.#ready();
    if (this.membership.has(connection)) throw codedError('already_joined', 'connection already joined');
    const code = String(roomCode || '');
    const memberPlayer = cleanPlayer(player);
    const peerId = memberPlayer.id;
    const member = { peerId, player: memberPlayer };
    const result = parseResult(await this.#runCommand('eval',
      JOIN_ROOM_SCRIPT,
      [this.roomKey(code)],
      [JSON.stringify(member), this.now(), this.roomTtlMs],
    ));
    if (result.error === 'room_not_found') throw codedError(result.error, 'room not found');
    if (result.error === 'room_full') throw codedError(result.error, 'room is full');
    if (result.error) throw codedError(result.error, 'could not join room');
    const room = result.room;
    const existing = room.peers.filter((peer) => peer.peerId !== peerId);
    const hostName = room.peers.find((peer) => peer.peerId === room.hostId)?.player?.name || '';
    this.#remember(connection, code, peerId);
    return {
      result: {
        roomCode: code,
        peerId,
        hostId: room.hostId,
        hostName,
        mode: room.mode,
        maxPlayers: room.maxPlayers,
        peers: existing.map((peer) => ({
          peerId: peer.peerId,
          player: { ...peer.player },
          isHost: peer.peerId === room.hostId,
        })),
      },
      notify: existing.map((peer) => ({
        peerId: peer.peerId,
        message: { type: 'peer_joined', payload: {
          roomCode: code,
          peerId,
          player: { ...member.player },
        } },
      })),
    };
  }

  async relay(connection, { roomCode, toPeerId, signal } = {}) {
    await this.#ready();
    const membership = this.membership.get(connection);
    if (!membership || membership.roomCode !== roomCode) {
      throw codedError('not_in_room', 'not a room member');
    }
    const raw = await this.#runCommand('get', this.roomKey(roomCode));
    if (!raw) throw codedError('room_not_found', 'room not found');
    const room = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!room.peers.some((peer) => peer.peerId === membership.peerId)) {
      throw codedError('not_in_room', 'not a room member');
    }
    const target = String(toPeerId || '');
    if (!room.peers.some((peer) => peer.peerId === target)) {
      throw codedError('peer_not_found', 'target peer not found');
    }
    await this.#runCommand('pexpire', this.roomKey(roomCode), this.roomTtlMs);
    return {
      peerId: target,
      message: {
        type: 'room_signal',
        payload: { roomCode, fromPeerId: membership.peerId, signal },
      },
    };
  }

  async deliver({ peerId, connection, message }) {
    if (connection && this.deliveryHandler) return this.deliveryHandler(connection, message);
    const target = this.connections.get(String(peerId || ''));
    if (target && this.deliveryHandler) return this.deliveryHandler(target, message);
    await this.#ready();
    await this.#runCommand('publish', this.channel, JSON.stringify({ peerId, message }));
    return true;
  }

  async leave(connection, reason = 'peer_left') {
    const membership = this.membership.get(connection);
    if (!membership) return [];
    if (this.connections.get(membership.peerId) !== connection) {
      this.membership.delete(connection);
      return [];
    }
    this.membership.delete(connection);
    this.connections.delete(membership.peerId);
    await this.#ready();
    const result = parseResult(await this.#runCommand('eval',
      LEAVE_ROOM_SCRIPT,
      [this.roomKey(membership.roomCode)],
      [membership.peerId, this.now(), this.roomTtlMs],
    ));
    if (result.missing) return [];
    if (result.closed) {
      return result.peers.map((peer) => ({
        peerId: peer.peerId,
        message: { type: 'room_closed', payload: {
          roomCode: membership.roomCode,
          reason: 'host_left',
        } },
      }));
    }
    return result.peers.map((peer) => ({
      peerId: peer.peerId,
      message: { type: 'peer_left', payload: {
        roomCode: membership.roomCode,
        peerId: membership.peerId,
        reason,
      } },
    }));
  }

  sweepExpired() {
    return [];
  }

  async close() {
    this._closed = true;
    this.membership.clear();
    this.connections.clear();
    try { await this.subscriber.unsubscribe(this.channel); } catch (_) { /* already offline */ }
    this.subscriber.disconnect();
  }
}
