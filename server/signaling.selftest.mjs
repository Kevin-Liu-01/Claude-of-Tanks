import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { DistributedSignalingRoomStore } from './distributedRoomStore.ts';
import { SignalingRoomStore } from './roomStore.ts';
import { createRoomCode } from './roomCode.ts';
import { createSignalingServer } from './signalingServer.ts';
import { createIceConfigHandler } from '../api/ice.ts';
import { RoomSignalingClient } from '../src/net/signalingClient.ts';

assert.equal(createRoomCode(() => 0), 'AAAAAA');
assert.equal(createRoomCode(() => 0.999999), '999999');
assert.throws(() => createRoomCode(() => Number.NaN), (error) => error.code === 'invalid_rng');
const productionStoreSources = await Promise.all([
  readFile(new URL('./roomStore.ts', import.meta.url), 'utf8'),
  readFile(new URL('./distributedRoomStore.ts', import.meta.url), 'utf8'),
]);
for (const source of productionStoreSources) {
  assert.doesNotMatch(source, /from\s+['"][^'"]+\.js['"]/,
    'the typed Vercel signaling closure must not fall back into uncompiled JavaScript leaves');
}

class FlakySubscriber extends EventEmitter {
  static failuresRemaining = 0;

  constructor() {
    super();
    this.status = 'wait';
  }

  connect() {
    this.status = 'connecting';
    if (FlakySubscriber.failuresRemaining-- > 0) {
      const error = new Error('simulated cold Redis timeout');
      this.status = 'end';
      queueMicrotask(() => this.emit('end'));
      return Promise.reject(error);
    }
    this.status = 'ready';
    queueMicrotask(() => this.emit('ready'));
    return Promise.resolve();
  }

  subscribe() { return Promise.resolve(1); }
  unsubscribe() { return Promise.resolve(0); }
  disconnect() { this.status = 'end'; this.emit('end'); }
}

class OfflineSubscriber extends EventEmitter {
  constructor() { super(); this.status = 'wait'; }
  connect() {
    this.status = 'end';
    queueMicrotask(() => this.emit('end'));
    return Promise.reject(Object.assign(new Error('subscriber offline'), {
      code: 'subscriber_offline',
    }));
  }
  subscribe() { return Promise.reject(new Error('subscriber offline')); }
  unsubscribe() { return Promise.resolve(0); }
  disconnect() { this.status = 'end'; }
}

class FakeRestRedis {
  ping() { return Promise.resolve('PONG'); }
  set() { return Promise.resolve('OK'); }
}

FlakySubscriber.failuresRemaining = 1;
const retryStore = new DistributedSignalingRoomStore({
  redisUrl: 'rediss://test.invalid',
  commandClient: new FakeRestRedis(),
  SubscriberImpl: FlakySubscriber,
});
retryStore.setDeliveryHandler(() => {});
assert.equal(retryStore.subscriber.status, 'wait',
  'registering delivery must not open Redis during an unrelated HTTP cold start');
const recoveredRoom = await retryStore.create({}, {
  player: { id: 'cold-host', name: 'Cold Host' },
  sessionId: 'cold-host-session',
  maxPlayers: 4,
});
assert.equal(recoveredRoom.roomCode.length, 6,
  'room creation must succeed through REST while the optional subscriber is cold');
assert.equal(retryStore.subscriber.status, 'end',
  'room creation does not wait for a failed pub/sub connection');
assert.deepEqual(await retryStore.health(), {
  ok: true, command: 'ready', subscriber: 'ready',
}, 'the same warm store retries and restores its pub/sub accelerator');
await retryStore.close();

const pollingFallbackStore = new DistributedSignalingRoomStore({
  redisUrl: 'rediss://test.invalid',
  commandClient: new FakeRestRedis(),
  SubscriberImpl: OfflineSubscriber,
});
const fallbackRoom = await pollingFallbackStore.create({}, {
  player: { id: 'fallback-host', name: 'Fallback Host' },
  maxPlayers: 4,
});
assert.equal(fallbackRoom.sessionId, 'legacy_fallback-host',
  'cached pre-session clients retain compatibility across the server deploy');
const fallbackHealth = await pollingFallbackStore.health(25);
assert.equal(fallbackHealth.ok, true,
  'durable REST commands keep signaling healthy while pub/sub is offline');
assert.equal(fallbackHealth.subscriber, 'polling_fallback');
assert.equal(fallbackHealth.degraded, true);
await pollingFallbackStore.close();

const healthStore = {
  setDeliveryHandler() {},
  sweepExpired() { return []; },
  async health() {
    return { ok: false, command: 'unavailable', subscriber: 'unavailable', code: 'probe_down' };
  },
};
const unhealthy = createSignalingServer({ host: '127.0.0.1', port: 0, store: healthStore });
const unhealthyAddress = await unhealthy.listen();
const unhealthyResponse = await fetch(`http://127.0.0.1:${unhealthyAddress.port}/healthz`);
assert.equal(unhealthyResponse.status, 503, 'health returns unavailable when Redis is unavailable');
assert.equal((await unhealthyResponse.json()).ok, false);
await unhealthy.close();

function connect(url, origin = null) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, origin ? { origin } : undefined);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function inbox(socket) {
  const queued = [];
  const waiters = [];
  socket.on('message', (data) => {
    const message = JSON.parse(data.toString());
    const index = waiters.findIndex((waiter) => waiter.match(message));
    if (index >= 0) {
      const waiter = waiters.splice(index, 1)[0];
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else queued.push(message);
  });
  return {
    next(match, timeoutMs = 1000) {
      const index = queued.findIndex(match);
      if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { match, resolve, reject, timer: null };
        waiter.timer = setTimeout(() => {
          const at = waiters.indexOf(waiter);
          if (at >= 0) waiters.splice(at, 1);
          reject(new Error('signaling test message timeout'));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
  };
}

function send(socket, message) {
  socket.send(JSON.stringify(message));
}

const productionOrigin = 'https://cot.kevinliu.studio';
const signaling = createSignalingServer({
  host: '127.0.0.1',
  port: 0,
  allowedOrigins: [productionOrigin],
  webSocketPaths: ['/api/signal'],
  healthPaths: ['/api/signal'],
  iceConfigHandler: createIceConfigHandler({
    env: {
      COT_ALLOWED_ORIGINS: productionOrigin,
      COT_TURN_URLS: 'turn:turn.self-host.test:3478',
      COT_TURN_SHARED_SECRET: 'self-host-secret',
    },
    now: () => 100_000_000,
  }),
});
const address = await signaling.listen();
const url = `ws://127.0.0.1:${address.port}/api/signal`;
const iceResponse = await fetch(`http://127.0.0.1:${address.port}/api/ice`, {
  headers: { origin: productionOrigin },
});
assert.equal(iceResponse.status, 200, 'standalone signaling also serves local TURN credentials');
const iceBody = await iceResponse.json();
assert.equal(iceBody.iceServers[0].urls, 'turn:turn.self-host.test:3478');
assert.match(iceBody.iceServers[0].username, /^\d+:cot$/);
await assert.rejects(connect(url, 'https://attacker.example'), /Unexpected server response: 403/);
const host = await connect(url, productionOrigin);
const guest = await connect(url, productionOrigin);
const hostInbox = inbox(host);
const guestInbox = inbox(guest);

send(host, {
  type: 'room_create',
  requestId: 'create-1',
  payload: {
    player: { id: 'host-player', name: 'Host' },
    sessionId: 'host-session-one',
    maxPlayers: 4,
  },
});
const created = await hostInbox.next((message) => message.requestId === 'create-1');
assert.equal(created.type, 'room_created');
assert.equal(created.payload.roomCode.length, 6);
assert.equal(created.payload.hostId, created.payload.peerId);
assert.equal(created.payload.hostName, 'Host');
assert.equal(created.payload.peerId, 'host-player',
  'signaling preserves stable browser identity for room recovery');
assert.equal(created.payload.sessionId, 'host-session-one');

send(guest, {
  type: 'room_join',
  requestId: 'join-1',
  payload: {
    roomCode: created.payload.roomCode,
    player: { id: 'guest-player', name: 'Guest' },
    sessionId: 'guest-session-one',
  },
});
const joined = await guestInbox.next((message) => message.requestId === 'join-1');
const peerJoined = await hostInbox.next((message) => message.type === 'peer_joined');
assert.equal(joined.type, 'room_joined');
assert.equal(joined.payload.peerId, 'guest-player');
assert.equal(joined.payload.hostId, created.payload.hostId);
assert.equal(joined.payload.hostName, 'Host',
  'join responses identify the room host for invitation presentation');
assert.equal(joined.payload.peers.length, 1);
assert.equal(peerJoined.payload.peerId, joined.payload.peerId);
assert.equal(peerJoined.payload.sessionId, 'guest-session-one');
assert.equal(joined.payload.peers[0].sessionId, 'host-session-one');

send(guest, {
  type: 'room_signal',
  payload: {
    roomCode: created.payload.roomCode,
    toPeerId: created.payload.peerId,
    toSessionId: 'host-session-one',
    signal: { kind: 'ice', candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host' } },
  },
});
const relayed = await hostInbox.next((message) => message.type === 'room_signal');
assert.equal(relayed.payload.fromPeerId, joined.payload.peerId);
assert.equal(relayed.payload.fromSessionId, 'guest-session-one');
assert.equal(relayed.payload.toSessionId, 'host-session-one');
assert.equal(relayed.payload.signal.kind, 'ice');
send(guest, {
  type: 'room_signal',
  requestId: 'stale-signal-1',
  payload: {
    roomCode: created.payload.roomCode,
    toPeerId: created.payload.peerId,
    toSessionId: 'obsolete-host-session',
    signal: { kind: 'restart' },
  },
});
const staleRelay = await guestInbox.next((message) => message.requestId === 'stale-signal-1');
assert.equal(staleRelay.type, 'error');
assert.equal(staleRelay.payload.code, 'stale_target_session',
  'a sender cannot negotiate against a replacement page session by peer id alone');

const health = await fetch(`http://127.0.0.1:${address.port}/api/signal`).then((response) => response.json());
assert.deepEqual(health, { ok: true, rooms: 1 });

const hostDisconnected = new Promise((resolve) => host.once('close', resolve));
host.close();
await hostDisconnected;
const resumedHost = await connect(url, productionOrigin);
const resumedHostInbox = inbox(resumedHost);
send(resumedHost, {
  type: 'room_join',
  requestId: 'resume-host-1',
  payload: {
    roomCode: created.payload.roomCode,
    player: { id: 'host-player', name: 'Host' },
    sessionId: 'host-session-one',
  },
});
const resumed = await resumedHostInbox.next((message) => message.requestId === 'resume-host-1');
const hostResumed = await guestInbox.next((message) => message.type === 'peer_joined');
assert.equal(resumed.type, 'room_joined');
assert.equal(resumed.payload.hostId, 'host-player');
assert.equal(hostResumed.payload.peerId, 'host-player',
  'an unclean signaling close keeps the room resumable by stable identity');
assert.equal(hostResumed.payload.sessionId, 'host-session-one',
  'transport reconnect preserves the runtime epoch used to retain healthy RTC');
send(resumedHost, {
  type: 'room_leave',
  payload: { roomCode: created.payload.roomCode },
});
const closed = await guestInbox.next((message) => message.type === 'room_closed');
assert.equal(closed.payload.reason, 'host_left');
resumedHost.close();
guest.close();
await new Promise((resolve) => guest.once('close', resolve));
await signaling.close();

function clientEvent(client, match, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    let off = () => {};
    const timer = setTimeout(() => {
      off();
      reject(new Error('signaling client event timeout'));
    }, timeoutMs);
    off = client.onEvent((message) => {
      if (!match(message)) return;
      clearTimeout(timer);
      off();
      resolve(message);
    });
  });
}

const resumeServer = createSignalingServer({ host: '127.0.0.1', port: 0 });
const resumeAddress = await resumeServer.listen();
const resumeUrl = `ws://127.0.0.1:${resumeAddress.port}/signal`;
const resumeHost = new RoomSignalingClient({
  url: resumeUrl,
  WebSocketImpl: WebSocket,
  eventPollIntervalMs: 20,
  reconnectDelaysMs: [10, 20, 40],
});
const resumeGuest = new RoomSignalingClient({
  url: resumeUrl,
  WebSocketImpl: WebSocket,
  eventPollIntervalMs: 20,
  reconnectDelaysMs: [10, 20, 40],
});
const resumeRoom = await resumeHost.createRoom({
  player: { id: 'resume-host', name: 'Resume Host' },
  maxPlayers: 4,
});
const resumeGuestInfo = await resumeGuest.joinRoom({
  roomCode: resumeRoom.roomCode,
  player: { id: 'resume-guest', name: 'Resume Guest' },
});
const reconnecting = clientEvent(resumeHost,
  (message) => message.type === 'signaling_state' && message.payload?.state === 'reconnecting');
const signalingResumed = clientEvent(resumeHost, (message) => message.type === 'signaling_resumed');
const hostRejoined = clientEvent(resumeGuest,
  (message) => message.type === 'peer_joined' && message.payload?.peerId === 'resume-host');
const queuedSignal = clientEvent(resumeGuest,
  (message) => message.type === 'room_signal' && message.payload?.fromPeerId === 'resume-host');
resumeHost.socket.terminate();
await reconnecting;
assert.equal(resumeHost.sendSignal(resumeGuestInfo.peerId, {
  kind: 'ice',
  candidate: { candidate: 'candidate:2 1 udp 1 127.0.0.1 9 typ host' },
}, resumeGuest.sessionId), false, 'RTC rendezvous is queued while signaling reconnects');
assert.equal((await signalingResumed).payload.peerId, 'resume-host');
await hostRejoined;
const deliveredQueuedSignal = await queuedSignal;
assert.equal(deliveredQueuedSignal.payload.signal.kind, 'ice',
  'queued RTC rendezvous flushes after the durable membership resumes');
assert.equal(deliveredQueuedSignal.payload.fromSessionId, resumeHost.sessionId);
assert.equal(deliveredQueuedSignal.payload.toSessionId, resumeGuest.sessionId);
assert.equal(resumeHost.state, 'open');
const previousSessionId = resumeHost.sessionId;
const rebuiltMembership = clientEvent(resumeGuest,
  (message) => message.type === 'peer_joined' && message.payload?.peerId === 'resume-host' &&
    message.payload?.sessionId !== previousSessionId);
assert.equal(await resumeHost.restartRoomSession('test_rtc_rebuild'), true,
  'terminal RTC recovery re-announces the same room membership');
const rebuiltPeer = await rebuiltMembership;
assert.notEqual(resumeHost.sessionId, previousSessionId,
  'terminal RTC recovery rotates the runtime epoch');
assert.equal(rebuiltPeer.payload.sessionId, resumeHost.sessionId,
  'other peers receive the replacement epoch and can rebuild their RTC connection');
resumeHost.close('resume_test_complete');
resumeGuest.close('resume_test_complete');
await resumeServer.close();

// Pub/sub delivery is intentionally modeled as fully unavailable here. A
// room_poll must recover the durable notification so an RTC offer is never
// contingent on a transient subscriber wake-up.
class PollOnlyRoomStore extends SignalingRoomStore {
  constructor() {
    super();
    this.deliveryHandler = null;
    this.mailboxes = new Map();
    this.pollCount = 0;
  }

  setDeliveryHandler(handler) { this.deliveryHandler = handler; }

  deliver({ connection, message, fromPoll = false }) {
    if (fromPoll) return this.deliveryHandler(connection, message);
    const queued = this.mailboxes.get(connection) || [];
    queued.push(message);
    this.mailboxes.set(connection, queued);
    return true;
  }

  poll(connection) {
    this.pollCount++;
    const queued = this.mailboxes.get(connection) || [];
    this.mailboxes.delete(connection);
    return queued.map((message) => ({ connection, message, fromPoll: true }));
  }
}

const pollStore = new PollOnlyRoomStore();
const pollServer = createSignalingServer({ host: '127.0.0.1', port: 0, store: pollStore });
const pollAddress = await pollServer.listen();
const pollUrl = `ws://127.0.0.1:${pollAddress.port}/signal`;
const pollHost = new RoomSignalingClient({
  url: pollUrl,
  WebSocketImpl: WebSocket,
  eventPollIntervalMs: 20,
});
const pollGuest = new RoomSignalingClient({
  url: pollUrl,
  WebSocketImpl: WebSocket,
  eventPollIntervalMs: 20,
});
const pollRoom = await pollHost.createRoom({
  player: { id: 'poll-host', name: 'Poll Host' },
  maxPlayers: 4,
});
const recoveredJoin = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('durable signaling poll timed out')), 1_000);
  pollHost.onEvent((message) => {
    if (message.type !== 'peer_joined') return;
    clearTimeout(timer);
    resolve(message);
  });
});
await pollGuest.joinRoom({
  roomCode: pollRoom.roomCode,
  player: { id: 'poll-guest', name: 'Poll Guest' },
});
assert.equal((await recoveredJoin).payload.peerId, 'poll-guest');
assert.ok(pollStore.pollCount > 0, 'room clients poll when pub/sub delivery is missed');
pollHost.close('poll_test_complete');
pollGuest.close('poll_test_complete');
await pollServer.close();

console.log('signaling.selftest: room codes, join, relay, health, transport resume, and explicit host closure passed');
