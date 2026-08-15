import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { DistributedSignalingRoomStore } from './distributedRoomStore.js';
import { createSignalingServer } from './signalingServer.js';

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
  maxPlayers: 4,
});
assert.equal(recoveredRoom.roomCode.length, 6,
  'the room request that sees a cold Redis failure must retry and recover');
assert.equal(retryStore.subscriber.status, 'ready',
  'a failed cold Redis startup must be retryable on the same function instance');
assert.deepEqual(await retryStore.health(), {
  ok: true, command: 'ready', subscriber: 'ready',
});
await retryStore.close();

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
});
const address = await signaling.listen();
const url = `ws://127.0.0.1:${address.port}/api/signal`;
await assert.rejects(connect(url, 'https://attacker.example'), /Unexpected server response: 403/);
const host = await connect(url, productionOrigin);
const guest = await connect(url, productionOrigin);
const hostInbox = inbox(host);
const guestInbox = inbox(guest);

send(host, {
  type: 'room_create',
  requestId: 'create-1',
  payload: { player: { id: 'host-player', name: 'Host' }, maxPlayers: 4 },
});
const created = await hostInbox.next((message) => message.requestId === 'create-1');
assert.equal(created.type, 'room_created');
assert.equal(created.payload.roomCode.length, 6);
assert.equal(created.payload.hostId, created.payload.peerId);

send(guest, {
  type: 'room_join',
  requestId: 'join-1',
  payload: {
    roomCode: created.payload.roomCode,
    player: { id: 'guest-player', name: 'Guest' },
  },
});
const joined = await guestInbox.next((message) => message.requestId === 'join-1');
const peerJoined = await hostInbox.next((message) => message.type === 'peer_joined');
assert.equal(joined.type, 'room_joined');
assert.equal(joined.payload.hostId, created.payload.hostId);
assert.equal(joined.payload.peers.length, 1);
assert.equal(peerJoined.payload.peerId, joined.payload.peerId);

send(guest, {
  type: 'room_signal',
  payload: {
    roomCode: created.payload.roomCode,
    toPeerId: created.payload.peerId,
    signal: { kind: 'ice', candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host' } },
  },
});
const relayed = await hostInbox.next((message) => message.type === 'room_signal');
assert.equal(relayed.payload.fromPeerId, joined.payload.peerId);
assert.equal(relayed.payload.signal.kind, 'ice');

const health = await fetch(`http://127.0.0.1:${address.port}/api/signal`).then((response) => response.json());
assert.deepEqual(health, { ok: true, rooms: 1 });

host.close();
const closed = await guestInbox.next((message) => message.type === 'room_closed');
assert.equal(closed.payload.reason, 'host_left');
guest.close();
await new Promise((resolve) => guest.once('close', resolve));
await signaling.close();

console.log('signaling.selftest: room codes, join, relay, health, and host-loss closure passed');
