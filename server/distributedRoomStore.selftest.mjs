import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { DistributedSignalingRoomStore } from './distributedRoomStore.js';

class QuietSubscriber extends EventEmitter {
  constructor() {
    super();
    this.status = 'wait';
  }

  connect() {
    this.status = 'ready';
    queueMicrotask(() => this.emit('ready'));
    return Promise.resolve();
  }

  subscribe() { return Promise.resolve(1); }
  unsubscribe() { return Promise.resolve(0); }
  disconnect() { this.status = 'end'; this.emit('end'); }
}

class SharedRedisCommands {
  constructor() {
    this.values = new Map();
    this.mailboxes = new Map();
  }

  ping() { return Promise.resolve('PONG'); }

  set(key, value, options = {}) {
    if (options.nx && this.values.has(key)) return Promise.resolve(null);
    this.values.set(key, value);
    return Promise.resolve('OK');
  }

  get(key) { return Promise.resolve(this.values.get(key) ?? null); }
  pexpire() { return Promise.resolve(1); }

  del(key) {
    this.values.delete(key);
    this.mailboxes.delete(key);
    return Promise.resolve(1);
  }

  eval(script, keys, args) {
    if (script.includes("redis.call('RPUSH'")) {
      const queued = this.mailboxes.get(keys[0]) || [];
      queued.push(args[0]);
      while (queued.length > Number(args[1])) queued.shift();
      this.mailboxes.set(keys[0], queued);
      // Deliberately omit the PUBLISH wake-up. The durable poll is the
      // behavior under test.
      return Promise.resolve(1);
    }
    if (script.includes("redis.call('LPOP'")) {
      const queued = this.mailboxes.get(keys[0]) || [];
      const drained = queued.splice(0, Number(args[0]));
      if (queued.length) this.mailboxes.set(keys[0], queued);
      else this.mailboxes.delete(keys[0]);
      return Promise.resolve(drained);
    }
    if (script.includes('table.insert(peers, member)')) {
      const room = JSON.parse(this.values.get(keys[0]));
      const member = JSON.parse(args[0]);
      room.peers = room.peers.filter((peer) => peer.peerId !== member.peerId);
      if (room.peers.length >= Number(room.maxPlayers)) {
        return Promise.resolve(JSON.stringify({ error: 'room_full' }));
      }
      room.peers.push(member);
      room.touchedAt = Number(args[1]);
      this.values.set(keys[0], JSON.stringify(room));
      return Promise.resolve(JSON.stringify({ room }));
    }
    throw new Error('unexpected fake Redis script');
  }
}

const commands = new SharedRedisCommands();
const common = {
  redisUrl: 'rediss://test.invalid',
  commandClient: commands,
  SubscriberImpl: QuietSubscriber,
  namespace: 'cot:test:durable-delivery',
  roomCodeFactory: () => 'ABC123',
};
const hostStore = new DistributedSignalingRoomStore(common);
const guestStore = new DistributedSignalingRoomStore(common);
const hostConnection = {};
const guestConnection = {};
hostStore.setDeliveryHandler(() => true);
guestStore.setDeliveryHandler(() => true);

const room = await hostStore.create(hostConnection, {
  player: { id: 'durable-host', name: 'Durable Host' },
  sessionId: 'durable-host-session',
  maxPlayers: 4,
});
hostStore.detach(hostConnection);
const resumedHostConnection = {};
const resumedHost = await hostStore.join(resumedHostConnection, {
  roomCode: room.roomCode,
  player: { id: 'durable-host', name: 'Durable Host' },
  sessionId: 'durable-host-session',
});
assert.equal(resumedHost.result.hostId, 'durable-host',
  'Redis room membership survives replacement of the host signaling socket');
const joined = await guestStore.join(guestConnection, {
  roomCode: room.roomCode,
  player: { id: 'durable-guest', name: 'Durable Guest' },
  sessionId: 'durable-guest-session',
});
assert.equal(joined.notify.length, 1);
await guestStore.deliver(joined.notify[0]);

const [firstPoll, racingPoll] = await Promise.all([
  hostStore.poll(resumedHostConnection),
  hostStore.poll(resumedHostConnection),
]);
const recovered = [...firstPoll, ...racingPoll];
assert.equal(recovered.length, 1,
  'concurrent pub/sub fallback drains deliver each notification exactly once');
assert.equal(recovered[0].connection, resumedHostConnection);
assert.equal(recovered[0].message.type, 'peer_joined');
assert.equal(recovered[0].message.payload.peerId, 'durable-guest');
assert.deepEqual(await hostStore.poll(resumedHostConnection), [],
  'durable delivery mailbox is empty after acknowledgement by drain');

const relayed = await guestStore.relay(guestConnection, {
  roomCode: room.roomCode,
  toPeerId: 'durable-host',
  toSessionId: 'durable-host-session',
  signal: { kind: 'restart' },
});
assert.equal(relayed.message.payload.fromSessionId, 'durable-guest-session');
assert.equal(relayed.message.payload.toSessionId, 'durable-host-session');
assert.equal(relayed.message.payload.signal.kind, 'restart',
  'distributed RTC rendezvous is scoped to both live page sessions');
await assert.rejects(guestStore.relay(guestConnection, {
  roomCode: room.roomCode,
  toPeerId: 'durable-host',
  toSessionId: 'obsolete-host-session',
  signal: { kind: 'restart' },
}), (error) => error.code === 'stale_target_session',
'distributed signaling rejects negotiation addressed to a replaced page session');

await hostStore.close();
await guestStore.close();
console.log('distributedRoomStore.selftest: missed pub/sub delivery recovers exactly once');
