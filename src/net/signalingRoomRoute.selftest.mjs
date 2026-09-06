import assert from 'node:assert/strict';
import { RoomSignalingClient } from './signalingClient.ts';
import { createSignalingRoomCode, MAX_ROOM_ROUTE_CANDIDATES,
  ROOM_ROUTE_POLL_INTERVAL_MS, roomSignalingSocketUrl, usesRoomSignalingRoute } from './signalingRoomRoute.ts';

const endpoint = 'wss://signal.example.test/rooms';
for (const url of [endpoint, `${endpoint}/`, 'wss://signal.example.test/prefix/rooms']) {
  assert.equal(usesRoomSignalingRoute(url), true);
  assert.equal(roomSignalingSocketUrl(url, null), null);
  assert.equal(roomSignalingSocketUrl(url, 'ABC234'), `${url.replace(/\/$/, '')}/ABC234`);
}
for (const url of ['ws://localhost:7777/signal', 'wss://game.example.test/api/signal',
  'wss://signal.example.test/rooms-other', 'wss://signal.example.test/rooms/ABC234']) {
  assert.equal(usesRoomSignalingRoute(url), false);
  assert.equal(roomSignalingSocketUrl(url, null), url);
  assert.equal(roomSignalingSocketUrl(url, 'ABC234'), url);
}
for (const url of [`${endpoint}?token=secret`, `${endpoint}#`,
  'wss://user:secret@signal.example.test/rooms']) {
  assert.throws(() => roomSignalingSocketUrl(url, null), /credentials, query or fragment/);
}
for (const code of ['abc234', 'ABC23', '../ABC234', 'ABC234/']) {
  assert.throws(() => roomSignalingSocketUrl(endpoint, code), /canonical room code/);
}
for (let index = 0; index < 256; index++) {
  assert.match(createSignalingRoomCode(), /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, label) {
  const end = performance.now() + 2000;
  while (!predicate() && performance.now() < end) await wait(2);
  assert.ok(predicate(), label);
}

function fixture(handler = null, options = {}) {
  const sockets = [];
  const frames = [];
  const storage = new Map();
  class Socket {
    readyState = 0;
    listeners = new Map();
    constructor(url) {
      this.url = url;
      sockets.push(this);
      queueMicrotask(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1;
        this.emit('open', {});
      });
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    emit(type, value) { for (const fn of [...(this.listeners.get(type) || [])]) fn(value); }
    receive(message) { this.emit('message', { data: JSON.stringify(message) }); }
    send(encoded) {
      assert.equal(this.readyState, 1);
      const frame = JSON.parse(encoded);
      frames.push({ socket: this, ...frame });
      if (handler?.(this, frame) === true) return;
      if (frame.type === 'room_create' || frame.type === 'room_join') {
        this.receive({ type: frame.type === 'room_create' ? 'room_created' : 'room_joined',
          requestId: frame.requestId, payload: {
            roomCode: frame.payload.roomCode || 'LEG234', peerId: frame.payload.player.id,
            hostId: frame.payload.player.id, sessionId: frame.payload.sessionId,
            peers: [], resumeToken: frame.payload.nextResumeToken,
          } });
      } else if (frame.type === 'room_poll') {
        this.receive({ type: 'room_polled', requestId: frame.requestId,
          payload: { roomCode: frame.payload.roomCode } });
      }
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.emit('close', {});
    }
  }
  const client = new RoomSignalingClient({ url: endpoint, WebSocketImpl: Socket,
    sessionId: 'route-session-123', requestTimeoutMs: 40, eventPollIntervalMs: 1000,
    reconnectDelaysMs: [0], resumeStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    }, ...options });
  return { client, sockets, frames, storage };
}
const player = { id: 'route-host', name: 'Route Host' };
const creates = (test) => test.frames.filter((frame) => frame.type === 'room_create');
const joins = (test) => test.frames.filter((frame) => frame.type === 'room_join');

// The real acquisition runtime awaits connect() before it knows its room.
{
  const test = fixture();
  assert.equal(test.client.eventPollIntervalMs, ROOM_ROUTE_POLL_INTERVAL_MS);
  test.client.setEventPollInterval(2000);
  assert.equal(test.client.eventPollIntervalMs, ROOM_ROUTE_POLL_INTERVAL_MS,
    'battle cadence cannot restore the legacy frequent signaling poll');
  test.client.setEventPollInterval(30_000);
  assert.equal(test.client.eventPollIntervalMs, 30_000, 'slower explicit heartbeats remain allowed');
  await Promise.all([test.client.connect(), test.client.connect()]);
  assert.equal(test.sockets.length, 0, 'pre-connect never opens an unroutable namespace socket');
  assert.equal(test.client.state, 'idle', 'lazy pre-connect does not claim an open socket');
  const result = await test.client.createRoom({ player });
  const create = creates(test)[0];
  assert.equal(test.sockets.length, 1);
  assert.equal(test.sockets[0].url, `${endpoint}/${result.roomCode}`);
  assert.equal(create.payload.roomCode, result.roomCode);
  assert.match(create.payload.nextResumeToken, /^[a-f0-9]{64}$/);
  assert.equal(test.sockets[0].url.includes(create.payload.nextResumeToken), false);
  assert.equal(test.sockets[0].url.includes(test.client.sessionId), false);
  assert.equal('resumeToken' in result, false);
  await assert.rejects(test.client.joinRoom({ roomCode: 'OTHER2', player }),
    (error) => error.code === 'already_joined');
  assert.equal(test.sockets.length, 1, 'another acquisition cannot abandon a healthy room');
  test.client.close();
}

{
  const test = fixture();
  await test.client.connect();
  await test.client.joinRoom({ roomCode: ' abc-234 ', player });
  assert.equal(test.sockets[0].url, `${endpoint}/ABC234`);
  assert.equal(joins(test)[0].payload.roomCode, 'ABC234');
  const firstToken = joins(test)[0].payload.nextResumeToken;
  test.sockets[0].close();
  await until(() => joins(test).length === 2 && test.client.state === 'open', 'automatic room resume');
  assert.equal(test.sockets[1].url, `${endpoint}/ABC234`);
  assert.equal(joins(test)[1].payload.resumeToken, firstToken);
  assert.notEqual(joins(test)[1].payload.nextResumeToken, firstToken);
  assert.equal(await test.client.restartRoomSession(), true);
  assert.equal(test.sockets[2].url, `${endpoint}/ABC234`);
  assert.notEqual(joins(test)[2].payload.sessionId, joins(test)[0].payload.sessionId);
  test.client.close();
}

// A real lost create receipt is a connection retry, not a code collision.
for (const failure of ['close', 'timeout']) {
  let first = true;
  const test = fixture((socket, frame) => {
    if (frame.type !== 'room_create' || !first) return false;
    first = false;
    if (failure === 'close') queueMicrotask(() => socket.close());
    return true;
  });
  const result = await test.client.createRoom({ player });
  const [initial, retry] = creates(test);
  assert.equal(creates(test).length, 2);
  assert.equal(initial.socket.url, retry.socket.url);
  assert.deepEqual(initial.payload, retry.payload, `${failure}: candidate and proof survive lost receipt`);
  assert.equal(result.roomCode, initial.payload.roomCode);
  test.client.close();
}

{
  let first = true;
  const test = fixture((socket, frame) => {
    if (frame.type !== 'room_create' || !first) return false;
    first = false;
    socket.receive({ type: 'error', requestId: frame.requestId,
      payload: { code: 'room_code_exhausted', message: 'occupied code' } });
    return true;
  });
  await test.client.createRoom({ player });
  const [collision, success] = creates(test);
  assert.equal(test.sockets.length, 2);
  assert.equal(collision.socket.readyState, 3);
  assert.notEqual(collision.payload.nextResumeToken, success.payload.nextResumeToken,
    'different candidate attempts never reuse the rejected room capability');
  assert.equal(success.socket.url, `${endpoint}/${success.payload.roomCode}`);
  assert.equal(JSON.parse([...test.storage.values()][0]).length, 1,
    'rejected candidates leave no persistent capability records');
  test.client.close();
}

{
  const test = fixture((socket, frame) => {
    if (frame.type !== 'room_create') return false;
    socket.receive({ type: 'error', requestId: frame.requestId,
      payload: { code: 'room_code_exhausted', message: 'occupied code' } });
    return true;
  });
  await assert.rejects(test.client.createRoom({ player }),
    (error) => error.code === 'room_code_exhausted');
  assert.equal(creates(test).length, MAX_ROOM_ROUTE_CANDIDATES);
  assert.ok(test.sockets.every((socket) => socket.readyState === 3));
  assert.equal(test.client.roomCode, null);
  test.client.close();
}

// Cancellation during retry backoff must not open the old DO after a new join.
for (const failure of ['signaling_closed', 'signaling_store_unavailable']) {
  let first = true;
  const test = fixture((socket, frame) => {
    if (frame.type !== 'room_create' || !first) return false;
    first = false;
    if (failure === 'signaling_closed') queueMicrotask(() => socket.close());
    else socket.receive({ type: 'error', requestId: frame.requestId,
      payload: { code: failure, message: 'try later' } });
    return true;
  });
  const old = assert.rejects(test.client.createRoom({ player }), (error) => error.code === 'signaling_closed');
  await until(() => creates(test).length === 1, 'first create sent before cancellation');
  test.client.close('cancelled');
  await test.client.joinRoom({ roomCode: 'FRESH2', player });
  const current = test.sockets.at(-1);
  await old;
  assert.equal(creates(test).length, 1, 'cancelled request cannot send on the successor socket');
  assert.equal(test.client.roomCode, 'FRESH2');
  assert.equal(current.readyState, 1);
  test.client.close();
}

{
  const test = fixture((_socket, frame) => frame.type === 'room_create');
  const pending = assert.rejects(test.client.createRoom({ player }),
    (error) => error.code === 'signaling_closed');
  await until(() => creates(test).length === 1, 'pending direct admission');
  await assert.rejects(test.client.joinRoom({ roomCode: 'OTHER2', player }),
    (error) => error.code === 'already_joined');
  assert.equal(test.sockets.length, 1, 'parallel acquisition cannot switch the pending route');
  test.client.close('cancel_lost_create');
  await pending;
  const leave = test.frames.find((frame) => frame.type === 'room_leave');
  assert.equal(leave.payload.roomCode, creates(test)[0].payload.roomCode,
    'explicit cancellation releases a server admission even when its receipt was lost');
}

{
  const test = fixture((socket, frame) => {
    if (frame.type !== 'room_join') return false;
    socket.receive({ type: 'room_joined', requestId: frame.requestId, payload: {
      roomCode: 'WRONG2', peerId: player.id, hostId: player.id,
      resumeToken: frame.payload.nextResumeToken,
    } });
    return true;
  });
  await assert.rejects(test.client.joinRoom({ roomCode: 'RIGHT2', player }),
    (error) => error.code === 'invalid_room_response');
  assert.equal(test.client.roomCode, null);
  test.client.close();
}

for (const missingField of ['resumeToken', 'roomCode']) {
  const test = fixture((socket, frame) => {
    if (frame.type !== 'room_join') return false;
    const payload = { roomCode: frame.payload.roomCode, peerId: player.id, hostId: player.id,
      resumeToken: frame.payload.nextResumeToken };
    delete payload[missingField];
    socket.receive({ type: 'room_joined', requestId: frame.requestId, payload });
    return true;
  });
  await assert.rejects(test.client.joinRoom({ roomCode: 'ABC234', player }),
    (error) => error.code === 'invalid_room_response');
  assert.equal(test.client.roomCode, null, `direct route cannot accept a missing ${missingField}`);
  test.client.close();
}

{
  const test = fixture();
  const events = [];
  test.client.onEvent((event) => {
    events.push(event);
    if (event.type === 'room_closed') test.client.close('session_closed');
  });
  await test.client.createRoom({ player });
  const saved = [...test.storage.entries()];
  const socket = test.sockets[0];
  socket.receive({ type: 'error', payload: { code: 'resume_denied', message: 'membership replaced' } });
  socket.close();
  await wait(10);
  assert.equal(test.client.roomCode, null);
  assert.equal(socket.readyState, 3);
  assert.equal(test.sockets.length, 1, 'a fenced socket must not fight its successor by reconnecting');
  assert.deepEqual([...test.storage.entries()], saved,
    'a lost-reply successor may own the same current proof; terminal callbacks must not erase it');
  assert.equal(events.filter((event) => event.type === 'room_closed').length, 1);
  assert.equal(events.find((event) => event.type === 'room_closed').payload.reason, 'resume_denied');
}

for (const url of ['ws://localhost:7777/signal', 'wss://game.example.test/api/signal']) {
  const test = fixture(null, { url });
  await test.client.connect();
  assert.equal(test.sockets.length, 1, 'legacy pre-connect is still eager');
  assert.equal(test.sockets[0].url, url);
  await test.client.createRoom({ player });
  assert.equal('roomCode' in creates(test)[0].payload, false, 'legacy server still allocates its room code');
  assert.equal(test.client.roomCode, 'LEG234');
  test.client.close();
}

console.log('signalingRoomRoute.selftest: direct room routing, lazy connect, idempotent retries, bounded collisions, cancellation, resume and legacy endpoints passed');
