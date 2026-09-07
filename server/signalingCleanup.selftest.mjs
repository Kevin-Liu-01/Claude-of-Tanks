import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { SignalingRoomStore, SIGNALING_DETACHED_GRACE_MS, SIGNALING_PEER_IDLE_TTL_MS } from './roomStore.ts';
import { createSignalingServer } from './signalingServer.ts';

const pause = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(read, label) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const result = read();
    if (result) return result;
    await pause();
  }
  assert.fail(`timed out: ${label}`);
}

async function fixture(run, options = {}) {
  let clock = 1000;
  const now = () => clock;
  const store = options.store?.(now) ?? new SignalingRoomStore({
    now, detachedGraceMs: 90, peerIdleTtlMs: 180,
  });
  const service = createSignalingServer({ host: '127.0.0.1', port: 0, now, store,
    cleanupIntervalMs: 10, unauthenticatedTimeoutMs: 150, ...options.server });
  const address = await service.listen();
  const peers = [];
  async function connect() {
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/signal`);
    const messages = [];
    const events = [];
    let closed = null;
    let requestSeq = 0;
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString());
      messages.push(message);
      events.push(message.type);
    });
    socket.on('close', (code, reason) => {
      closed = { code, reason: reason.toString() };
      events.push('socket_closed');
    });
    socket.on('error', () => {});
    const peer = { socket, messages, events,
      get closed() { return closed; },
      send(type, payload = {}) {
        const requestId = String(++requestSeq);
        socket.send(JSON.stringify({ type, requestId, payload }));
        return requestId;
      },
      async request(type, payload = {}) {
        const id = this.send(type, payload);
        return until(() => messages.find((message) => message.requestId === id), type);
      },
    };
    peers.push(peer);
    await until(() => socket.readyState === WebSocket.OPEN, 'native WebSocket open');
    return peer;
  }
  try {
    await run({ service, store, now, connect, at(value) { clock = value; } });
  } finally {
    for (const peer of peers) {
      if (peer.socket.readyState !== WebSocket.CLOSED) peer.socket.terminate();
    }
    if (service.server.listening) await service.close();
    assert.equal(service.webSocketServer.clients.size, 0, 'all owned native sockets are reclaimed');
  }
}

async function create(peer, id = 'host') {
  const result = await peer.request('room_create', { player: { id, name: id }, sessionId: `${id}-session-1` });
  assert.equal(result.type, 'room_created', JSON.stringify(result));
  return result.payload;
}

async function join(peer, roomCode, id = 'guest', extra = {}) {
  const result = await peer.request('room_join', {
    roomCode, player: { id, name: id }, sessionId: `${id}-session-1`, ...extra,
  });
  assert.equal(result.type, 'room_joined', JSON.stringify(result));
  return result.payload;
}

function assertTerminal(peer, reason) {
  assert.ok(peer.messages.some((message) => message.type === 'room_closed' && message.payload.reason === reason));
  assert.ok(peer.events.indexOf('room_closed') < peer.events.indexOf('socket_closed'),
    'terminal room notification is delivered before native close');
}

assert.equal(SIGNALING_DETACHED_GRACE_MS, 90_000);
assert.equal(SIGNALING_PEER_IDLE_TTL_MS, 180_000);
assert.throws(() => createSignalingServer({ cleanupIntervalMs: 0 }), /cleanupIntervalMs/);
assert.throws(() => createSignalingServer({ cleanupIntervalMs: 15_001 }), /cleanupIntervalMs/);
assert.throws(() => createSignalingServer({ unauthenticatedTimeoutMs: 0 }), /unauthenticatedTimeoutMs/);

await fixture(async ({ connect, at }) => {
  const peer = await connect();
  at(15_999);
  await pause(15);
  assert.equal(peer.closed, null, 'default unauthenticated timeout permits the full 15 seconds');
  at(16_000);
  await until(() => peer.closed, 'default 15-second unauthenticated deadline');
  assert.equal(peer.closed.reason, 'authentication_timeout');
}, { server: { unauthenticatedTimeoutMs: undefined } });

await fixture(async ({ connect, at, store }) => {
  const silent = await connect();
  const invalid = await connect();
  at(1149);
  const rejected = await invalid.request('room_join', {
    roomCode: 'AAAAAA', player: { id: 'unknown', name: 'Unknown' }, sessionId: 'unknown-1',
  });
  assert.equal(rejected.type, 'error');
  assert.equal(silent.closed, null, 'unauthenticated lease is not shortened');
  at(1150);
  await until(() => silent.closed && invalid.closed, 'unadmitted socket deadlines');
  assert.equal(silent.closed.reason, 'authentication_timeout');
  assert.equal(invalid.closed.reason, 'authentication_timeout', 'failed traffic never extends admission time');
  assert.equal(store.rooms.size, 0);
});

await fixture(async ({ connect, at, store }) => {
  const host = await connect();
  const guest = await connect();
  const room = await create(host);
  const seat = await join(guest, room.roomCode);
  at(1170);
  assert.equal((await host.request('room_poll', { roomCode: room.roomCode })).type, 'room_polled');
  at(1180);
  await until(() => guest.closed, 'silent attached guest expiry');
  assertTerminal(guest, 'expired');
  assert.ok(host.messages.some((message) => message.type === 'peer_left'
    && message.payload.peerId === 'guest' && message.payload.reason === 'expired'));
  assert.equal(host.closed, null);
  assert.equal(store.rooms.get(room.roomCode).peers.size, 1);
  assert.equal(store.rooms.get(room.roomCode).retiredPeers.size, 1);
  const intruder = await connect();
  assert.equal((await intruder.request('room_join', { roomCode: room.roomCode,
    player: { id: 'guest', name: 'Imposter' }, sessionId: 'imposter-session' })).payload.code, 'resume_denied');
  const returning = await connect();
  await join(returning, room.roomCode, 'guest', { resumeToken: seat.resumeToken, sessionId: 'guest-session-2' });
  assert.equal(store.rooms.get(room.roomCode).peers.size, 2, 'expired guest can explicitly return with its proof');
});

await fixture(async ({ connect, at, store }) => {
  const host = await connect();
  const guest = await connect();
  const room = await create(host);
  await join(guest, room.roomCode);
  at(1170);
  await guest.request('room_poll', { roomCode: room.roomCode });
  at(1180);
  await until(() => host.closed && guest.closed, 'host inactivity closes whole room');
  assertTerminal(host, 'expired');
  assertTerminal(guest, 'expired');
  assert.equal(store.rooms.size, 0, 'guest heartbeats cannot renew the host lease');
  assert.equal(store.membership.size, 0);
});

await fixture(async ({ connect, at, store }) => {
  const host = await connect();
  const guest = await connect();
  const room = await create(host);
  await join(guest, room.roomCode);
  host.socket.terminate();
  await until(() => store.rooms.get(room.roomCode).peers.get('host').disconnectedAt === 1000,
    'unclean host close detaches without immediate room destruction');
  at(1089);
  const replacement = await connect();
  await join(replacement, room.roomCode, 'host', { resumeToken: room.resumeToken, sessionId: 'host-session-2' });
  at(1090);
  assert.equal((await replacement.request('room_poll', { roomCode: room.roomCode })).type, 'room_polled');
  assert.equal(store.rooms.get(room.roomCode).peers.get('host').disconnectedAt, undefined);
  assert.equal(store.rooms.get(room.roomCode).peers.get('host').sessionId, 'host-session-2');
  assert.equal(guest.closed, null, 'valid resume inside the detached grace preserves the room');
});

await fixture(async ({ connect, at, store }) => {
  const host = await connect();
  const guest = await connect();
  const room = await create(host);
  await join(guest, room.roomCode);
  host.socket.terminate();
  await until(() => store.rooms.get(room.roomCode).peers.get('host').disconnectedAt === 1000,
    'host detach');
  at(1090);
  const id = guest.send('room_poll', { roomCode: room.roomCode });
  await until(() => guest.closed, 'message-time detached expiry');
  assertTerminal(guest, 'expired');
  assert.equal(guest.messages.some((message) => message.requestId === id), false,
    'expiry is checked before the command, even with the periodic timer far away');
  assert.equal(store.rooms.size, 0);
}, { server: { cleanupIntervalMs: 15_000 } });

await fixture(async ({ connect, at, store }) => {
  const host = await connect();
  const room = await create(host);
  at(1180);
  const id = host.send('room_poll', { roomCode: room.roomCode });
  await until(() => host.closed, 'attached half-open expiry before command');
  assertTerminal(host, 'expired');
  assert.equal(host.messages.some((message) => message.requestId === id), false);
  assert.equal(store.rooms.size, 0, 'a late heartbeat cannot revive an expired host');
}, { server: { cleanupIntervalMs: 15_000 } });

await fixture(async ({ connect, store }) => {
  const host = await connect();
  const guest = await connect();
  const room = await create(host);
  await join(guest, room.roomCode);
  // This is the real browser client's close contract: Leave is written before
  // native close, without an invented acknowledgment or arbitrary delay.
  guest.send('room_leave', { roomCode: room.roomCode });
  guest.socket.close(1000, 'explicit_guest_leave');
  await until(() => host.messages.some((message) => message.type === 'peer_left' &&
    message.payload.peerId === 'guest'), 'explicit guest Leave survives close transition');
  assert.equal(store.rooms.get(room.roomCode).peers.size, 1);
  assert.equal(store.membership.size, 1);
  const witness = await connect();
  await join(witness, room.roomCode, 'witness');
  host.send('room_leave', { roomCode: room.roomCode });
  host.socket.close(1000, 'explicit_host_leave');
  await until(() => witness.closed, 'explicit host Leave closes the exact room');
  assertTerminal(witness, 'host_left');
  assert.equal(store.rooms.size, 0);
  assert.equal(store.membership.size, 0);
});

await fixture(async ({ connect, store }) => {
  const host = await connect();
  const room = await create(host);
  const counts = { create: 0, join: 0, relay: 0 };
  for (const method of Object.keys(counts)) {
    const original = store[method].bind(store);
    store[method] = (...args) => { counts[method]++; return original(...args); };
  }
  const creating = await connect();
  creating.send('room_create', { player: { id: 'closed-create', name: 'Closed' }, sessionId: 'closed-create-1' });
  creating.socket.close(1000, 'closed_before_create');
  await until(() => creating.closed, 'closed creation socket');
  const joining = await connect();
  joining.send('room_join', { roomCode: room.roomCode, player: { id: 'closed-join', name: 'Closed' },
    sessionId: 'closed-join-1' });
  joining.socket.close(1000, 'closed_before_join');
  await until(() => joining.closed, 'closed joining socket');
  assert.equal(counts.create, 0, 'Leave exception must not admit a closed create');
  assert.equal(counts.join, 0, 'Leave exception must not admit a closed join');
  const guest = await connect();
  await join(guest, room.roomCode);
  guest.send('room_signal', { roomCode: room.roomCode, toPeerId: 'host', signal: { kind: 'restart' } });
  guest.socket.close(1000, 'closed_before_relay');
  await until(() => guest.closed, 'closed relay socket');
  assert.equal(counts.relay, 0, 'Leave exception must not forward a closed relay');
  assert.equal(host.messages.some((message) => message.type === 'room_signal'), false);
  assert.equal(store.rooms.size, 1);
});

await fixture(async ({ connect, store }) => {
  const original = await connect();
  const room = await create(original);
  const oldConnection = [...store.membership.keys()][0];
  const replacement = await connect();
  await join(replacement, room.roomCode, 'host', { resumeToken: room.resumeToken, sessionId: 'host-session-2' });
  await until(() => original.closed, 'replaced owner terminal close');
  assert.ok(original.messages.some((message) => message.type === 'error'
    && message.payload.code === 'resume_denied' && message.requestId == null));
  assert.ok(original.events.indexOf('error') < original.events.indexOf('socket_closed'));
  assert.equal(original.closed.reason, 'resume_denied');
  // A delayed/duplicate native close must remain fenced to its old connection.
  oldConnection.emit('close', 1006, Buffer.alloc(0));
  oldConnection.emit('message', Buffer.from(JSON.stringify({ type: 'room_leave', payload: {
    roomCode: room.roomCode,
  } })), false);
  await pause();
  assert.equal((await replacement.request('room_poll', { roomCode: room.roomCode })).type, 'room_polled');
  assert.equal(store.rooms.get(room.roomCode).peers.get('host').sessionId, 'host-session-2');
  assert.equal(store.membership.size, 1);
});

let finishAdmission;
await fixture(async ({ connect, at, store }) => {
  const peer = await connect();
  peer.send('room_create', { player: { id: 'slow-host', name: 'Slow Host' }, sessionId: 'slow-session-1' });
  await until(() => finishAdmission, 'asynchronous admission begins');
  at(1150);
  await until(() => peer.closed, 'unauthenticated deadline while admission awaits');
  finishAdmission();
  await until(() => store.rooms.size === 1 && store.membership.size === 0, 'late admission detached');
  assert.equal(peer.messages.some((message) => message.type === 'room_created'), false);
  at(1240);
  await until(() => store.rooms.size === 0, 'late detached admission is reclaimed');
}, { store: (now) => new class extends SignalingRoomStore {
  constructor() { super({ now, detachedGraceMs: 90, peerIdleTtlMs: 180 }); }
  create(connection, options) {
    return new Promise((resolve) => { finishAdmission = () => resolve(super.create(connection, options)); });
  }
}() });

let finishSupersededJoin;
await fixture(async ({ connect, store }) => {
  const host = await connect();
  const guest = await connect();
  const room = await create(host);
  const seat = await join(guest, room.roomCode);
  const first = await connect();
  const nextProof = 'a'.repeat(64);
  first.send('room_join', { roomCode: room.roomCode, player: { id: 'guest', name: 'First' },
    sessionId: 'guest-delayed', resumeToken: seat.resumeToken, nextResumeToken: nextProof });
  await until(() => finishSupersededJoin, 'first replacement committed but reply delayed');
  const second = await connect();
  await join(second, room.roomCode, 'guest', { resumeToken: nextProof, sessionId: 'guest-successor' });
  await until(() => host.messages.some((message) => message.type === 'peer_joined'
    && message.payload.sessionId === 'guest-successor'), 'successor announced');
  finishSupersededJoin();
  await until(() => first.closed, 'delayed superseded admission retired');
  assert.equal(host.messages.some((message) => message.type === 'peer_joined'
    && message.payload.sessionId === 'guest-delayed'), false,
  'an old post-commit continuation cannot announce an obsolete RTC epoch');
  assert.equal(first.messages.some((message) => message.type === 'room_joined'), false);
  assert.equal((await second.request('room_poll', { roomCode: room.roomCode })).type, 'room_polled');
  assert.equal(store.rooms.get(room.roomCode).peers.get('guest').sessionId, 'guest-successor');
}, { store: (now) => new class extends SignalingRoomStore {
  constructor() { super({ now, detachedGraceMs: 90, peerIdleTtlMs: 180 }); }
  join(connection, options) {
    const result = super.join(connection, options);
    return options.sessionId === 'guest-delayed'
      ? new Promise((resolve) => { finishSupersededJoin = () => resolve(result); }) : result;
  }
}() });

let legacySweeps = 0;
let finishSweep;
await fixture(async ({ connect, at }) => {
  at(61_000);
  await until(() => finishSweep, 'legacy distributed sweep starts');
  const silent = await connect();
  at(61_150);
  await until(() => silent.closed, 'socket deadlines are independent of a stalled optional sweep');
  assert.equal(legacySweeps, 1, 'one in-flight sweep is shared across timer ticks');
  finishSweep([]);
}, { store: () => ({ leave() { return []; }, sweepExpired() {
  legacySweeps++;
  return new Promise((resolve) => { finishSweep = resolve; });
} }) });
await pause(30);
assert.equal(legacySweeps, 1, 'closing the server clears its sole housekeeping timer');

let rejectShutdownSweep;
let shutdownStoreCloses = 0;
await fixture(async ({ connect, at, service }) => {
  const peer = await connect();
  at(61_000);
  await until(() => rejectShutdownSweep, 'shutdown fixture starts an optional sweep');
  const closed = service.close();
  assert.equal(service.close(), closed, 'concurrent shutdown shares one owner');
  await until(() => peer.closed && !service.server.listening, 'shutdown does not await optional sweep');
  await closed;
  await service.close();
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    rejectShutdownSweep(new Error('expected shutdown sweep rejection'));
    await pause();
  } finally {
    console.error = originalError;
  }
  assert.equal(errors.length, 1, 'the existing sweep catch consumes its rejection without reopening resources');
  assert.equal(shutdownStoreCloses, 1, 'the store is closed despite pending sweep work');
}, { store: () => ({ leave() { return []; }, sweepExpired() {
  return new Promise((_resolve, reject) => { rejectShutdownSweep = reject; });
}, async close() { shutdownStoreCloses++; } }) });

console.log('signalingCleanup.selftest: 14 native WebSocket cleanup cases passed');
