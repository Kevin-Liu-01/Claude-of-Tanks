import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import IORedis from 'ioredis';
import { DistributedSignalingRoomStore } from './distributedRoomStore.ts';

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
      const raw = this.values.get(keys[1]);
      const room = raw ? JSON.parse(raw) : null;
      if (room && !room.peers.some((peer) => peer.peerId === args[1] && peer.connectionId === args[2])) {
        return Promise.resolve(null);
      }
      const queued = this.mailboxes.get(keys[0]) || [];
      const drained = queued.splice(0, Number(args[0]));
      if (queued.length) this.mailboxes.set(keys[0], queued);
      else this.mailboxes.delete(keys[0]);
      return Promise.resolve(!room && !drained.length ? null : drained);
    }
    if (script.includes('table.insert(peers, member)')) {
      const raw = this.values.get(keys[0]);
      if (!raw) return Promise.resolve(JSON.stringify({ error: 'room_not_found' }));
      const room = JSON.parse(raw);
      const member = JSON.parse(args[0]);
      const previous = room.peers.find((peer) => peer.peerId === member.peerId);
      if (previous && (!previous.resumeTokenHash ||
          (previous.resumeTokenHash !== args[3] && previous.resumeTokenHash !== member.resumeTokenHash))) {
        return Promise.resolve(JSON.stringify({ error: 'resume_denied' }));
      }
      room.peers = room.peers.filter((peer) => peer.peerId !== member.peerId);
      if (room.peers.length >= Number(room.maxPlayers)) {
        return Promise.resolve(JSON.stringify({ error: 'room_full' }));
      }
      room.peers.push(member);
      room.touchedAt = Number(args[1]);
      this.values.set(keys[0], JSON.stringify(room));
      return Promise.resolve(JSON.stringify({ room }));
    }
    if (script.includes('local leaving = ARGV[1]')) {
      const raw = this.values.get(keys[0]);
      const room = raw ? JSON.parse(raw) : null;
      const peer = room?.peers.find((entry) => entry.peerId === args[0]);
      if (!peer || peer.connectionId !== args[3]) {
        return Promise.resolve(JSON.stringify({ missing: true }));
      }
      room.peers = room.peers.filter((entry) => entry !== peer);
      const closed = room.hostId === peer.peerId;
      if (closed) this.values.delete(keys[0]);
      else this.values.set(keys[0], JSON.stringify(room));
      return Promise.resolve(JSON.stringify({ closed, peers: room.peers }));
    }
    throw new Error('unexpected fake Redis script');
  }
}

class ActualRedisCommands {
  constructor(url) { this.redis = new IORedis(url, { maxRetriesPerRequest: 0 }); }
  ping() { return this.redis.ping(); }
  set(key, value, options = {}) {
    const flags = [];
    if (options.px) flags.push('PX', options.px);
    if (options.nx) flags.push('NX');
    return this.redis.set(key, value, ...flags);
  }
  get(key) { return this.redis.get(key); }
  pexpire(key, ttl) { return this.redis.pexpire(key, ttl); }
  del(key) { return this.redis.del(key); }
  eval(script, keys, args) { return this.redis.eval(script, keys.length, ...keys, ...args); }
  close() { return this.redis.quit(); }
}

const actualRedisUrl = process.env.COT_TEST_REDIS_URL;
const commands = actualRedisUrl ? new ActualRedisCommands(actualRedisUrl) : new SharedRedisCommands();
const common = {
  redisUrl: 'rediss://test.invalid',
  commandClient: commands,
  SubscriberImpl: QuietSubscriber,
  namespace: `cot:test:durable-delivery:${process.pid}`,
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
  resumeToken: room.resumeToken,
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

const replacementStore = new DistributedSignalingRoomStore(common);
for (const forged of ['', 'f'.repeat(64)]) {
  await assert.rejects(replacementStore.join({}, {
    roomCode: room.roomCode, player: { id: 'durable-host', name: 'Imposter' },
    sessionId: 'forged-host-session', resumeToken: forged, nextResumeToken: 'a'.repeat(64),
  }), (error) => error.code === 'resume_denied', 'public host identity is not a resume credential');
}
const replacement = {};
const rotation = { roomCode: room.roomCode, player: { id: 'durable-host', name: 'Host' },
  sessionId: 'durable-host-session', resumeToken: resumedHost.result.resumeToken,
  nextResumeToken: 'b'.repeat(64) };
await replacementStore.join(replacement, rotation);
const retriedConnection = {};
const retried = await replacementStore.join(retriedConnection, rotation);
assert.equal(retried.result.resumeToken, rotation.nextResumeToken,
  'retrying an unacknowledged rotation proves the already-installed next credential');
await assert.rejects(hostStore.join({}, { ...rotation, nextResumeToken: 'c'.repeat(64) }),
  (error) => error.code === 'resume_denied', 'stale token cannot mint a new capability');
await assert.rejects(hostStore.relay(resumedHostConnection, {
  roomCode: room.roomCode, toPeerId: 'durable-guest', signal: { kind: 'restart' },
}), (error) => error.code === 'not_in_room', 'old process-local sockets cannot impersonate replacement');
await assert.rejects(hostStore.poll(resumedHostConnection),
  (error) => error.code === 'resume_denied', 'retired socket cannot drain new-generation messages');
assert.deepEqual(await hostStore.leave(resumedHostConnection), [],
  'retired host leave cannot delete the replacement room');
assert.ok(await commands.get(hostStore.roomKey(room.roomCode)));

const otherConnection = {};
const otherStore = new DistributedSignalingRoomStore({ ...common, roomCodeFactory: () => 'XYZ789' });
const otherRoom = await otherStore.create(otherConnection, {
  player: { id: 'durable-host', name: 'Other room host' }, sessionId: 'other-room-session',
});
await assert.rejects(otherStore.join({}, { ...rotation, resumeToken: otherRoom.resumeToken,
  nextResumeToken: 'd'.repeat(64) }), (error) => error.code === 'resume_denied',
  'a capability for another room cannot authorize a same-player-ID takeover');
const afterRotation = await guestStore.relay(guestConnection, {
  roomCode: room.roomCode, toPeerId: 'durable-host', signal: { kind: 'restart' },
});
await guestStore.deliver(afterRotation);
assert.deepEqual(await otherStore.poll(otherConnection), [],
  'same player ID in another room never drains the first room mailbox');
const ownSignals = await replacementStore.poll(retriedConnection);
assert.equal(ownSignals.length, 1);
assert.equal(ownSignals[0].message.type, 'room_signal');
const secretReceipt = JSON.stringify({ peers: retried.result.peers, notifications: retried.notify });
assert.equal(secretReceipt.includes(rotation.nextResumeToken), false);
assert.equal(secretReceipt.includes('resumeTokenHash'), false);

const contenders = [new DistributedSignalingRoomStore(common), new DistributedSignalingRoomStore(common)];
const contenderConnections = [{}, {}];
const race = await Promise.allSettled(contenders.map((candidate, index) => candidate.join(
  contenderConnections[index], { ...rotation, resumeToken: rotation.nextResumeToken,
    nextResumeToken: (index === 0 ? 'e' : 'f').repeat(64) },
)));
assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1,
  'two distinct rotations of one credential have exactly one atomic winner');
assert.equal(race.find((result) => result.status === 'rejected').reason.code, 'resume_denied');
const winner = race.findIndex((result) => result.status === 'fulfilled');
assert.deepEqual(await replacementStore.leave(retriedConnection), [],
  'the losing old connection cannot delete the race winner');
const closeNotifications = await contenders[winner].leave(contenderConnections[winner]);
for (const notification of closeNotifications) await contenders[winner].deliver(notification);
const terminal = await guestStore.poll(guestConnection);
assert.equal(terminal.length, 1,
  'cross-instance host closure remains drainable after the room itself was deleted');
assert.equal(terminal[0].message.type, 'room_closed');
assert.equal(terminal[0].message.payload.reason, 'host_left');
assert.ok(await commands.get(otherStore.roomKey(otherRoom.roomCode)), 'other room remains untouched');

await hostStore.close();
await guestStore.close();
await replacementStore.close();
await otherStore.close();
for (const contender of contenders) await contender.close();
await commands.close?.();
console.log(`distributedRoomStore.selftest: ${actualRedisUrl ? 'real Redis Lua' : 'injected Redis'} capability rotation, generation/room fences, and durable terminal delivery passed`);
