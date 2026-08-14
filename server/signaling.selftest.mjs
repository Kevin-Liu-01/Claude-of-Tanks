import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createSignalingServer } from './signalingServer.js';

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
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

const signaling = createSignalingServer({ host: '127.0.0.1', port: 0 });
const address = await signaling.listen();
const url = `ws://127.0.0.1:${address.port}/signal`;
const host = await connect(url);
const guest = await connect(url);
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

const health = await fetch(`http://127.0.0.1:${address.port}/healthz`).then((response) => response.json());
assert.deepEqual(health, { ok: true, rooms: 1 });

host.close();
const closed = await guestInbox.next((message) => message.type === 'room_closed');
assert.equal(closed.payload.reason, 'host_left');
guest.close();
await new Promise((resolve) => guest.once('close', resolve));
await signaling.close();

console.log('signaling.selftest: room codes, join, relay, health, and host-loss closure passed');
