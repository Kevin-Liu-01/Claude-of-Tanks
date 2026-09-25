import assert from 'node:assert/strict';
import {
  DEFAULT_RECONNECT, TRANSPORT_CLOSE, WebSocketTransport, createLoopbackPair, reconnectDelayMs, resumeUrl,
} from './index.ts';

// ------------------------------------------------------------ virtual time
function createVirtualTime() {
  let nowMs = 1000;
  let serial = 0;
  const timers = new Map();
  return {
    clock: () => nowMs,
    setTimer(callback, delayMs) {
      const handle = ++serial;
      timers.set(handle, { dueMs: nowMs + delayMs, callback, handle });
      return handle;
    },
    clearTimer(handle) { timers.delete(handle); },
    /** Advance the clock, firing due timers in due order. */
    advance(ms) {
      const target = nowMs + ms;
      for (;;) {
        const due = [...timers.values()].filter((timer) => timer.dueMs <= target)
          .sort((a, b) => a.dueMs - b.dueMs || a.handle - b.handle)[0];
        if (!due) break;
        timers.delete(due.handle);
        nowMs = Math.max(nowMs, due.dueMs);
        due.callback();
      }
      nowMs = target;
    },
    get pending() { return timers.size; },
  };
}

// ------------------------------------------------------------ fake socket
const sockets = [];
class FakeSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.binaryType = 'blob';
    this.bufferedAmount = 0;
    this.sent = [];
    this.listeners = new Map();
    this.closedWith = null;
    sockets.push(this);
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, event = {}) { for (const listener of [...(this.listeners.get(type) || [])]) listener(event); }
  accept() { this.readyState = 1; this.emit('open'); }
  send(data) { this.sent.push(data); this.bufferedAmount += data.byteLength; }
  close(code, reason) { this.closedWith = { code, reason }; this.readyState = 3; }
  /** The far end (or the network) closed the socket. */
  drop(code = 1006, reason = '') { this.readyState = 3; this.emit('close', { code, reason }); }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

function createTransport(time, options = {}) {
  const changes = [];
  const frames = [];
  const transport = new WebSocketTransport({
    url: 'wss://match.example/room/abc',
    resumeToken: 'seat-token-1',
    createSocket: (url) => new FakeSocket(url),
    clock: time.clock,
    setTimer: time.setTimer,
    clearTimer: time.clearTimer,
    random: () => 0.5,
    ...options,
  });
  transport.onState((change) => changes.push(change));
  transport.onFrame((frame) => frames.push(frame));
  return { transport, changes, frames };
}

// ------------------------------------------------------------ backoff table
assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map((attempt) => reconnectDelayMs(DEFAULT_RECONNECT, attempt, 0.5)),
  [250, 500, 1000, 2000, 4000, 8000, 8000, 8000], 'backoff doubles from 250 ms and caps at 8 s');
assert.equal(reconnectDelayMs(DEFAULT_RECONNECT, 1, 0), 200, 'jitter reaches -20 %');
assert.equal(reconnectDelayMs(DEFAULT_RECONNECT, 1, 1), 300, 'jitter reaches +20 %');
assert.equal(resumeUrl('wss://h/x', 'tok', 0), 'wss://h/x', 'the first connect carries no resume token');
assert.equal(resumeUrl('wss://h/x', 'tok', 2), 'wss://h/x?resume=tok&attempt=2');
assert.equal(resumeUrl('wss://h/x?room=1', 'a b', 1), 'wss://h/x?room=1&resume=a%20b&attempt=1');

// ------------------------------------------------------------ state machine
{
  sockets.length = 0;
  const time = createVirtualTime();
  const { transport, changes, frames } = createTransport(time);
  assert.equal(transport.state, 'idle');
  assert.equal(transport.send(new Uint8Array([1])), false, 'nothing is sent before open');
  transport.open();
  assert.equal(transport.state, 'connecting');
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].binaryType, 'arraybuffer', 'binary frames are requested as ArrayBuffers');
  assert.equal(sockets[0].url, 'wss://match.example/room/abc');
  transport.open();
  assert.equal(sockets.length, 1, 'open() is idempotent while connecting');
  sockets[0].accept();
  assert.equal(transport.state, 'open');
  assert.deepEqual(changes.map((c) => c.state), ['connecting', 'open']);
  assert.equal(changes[1].resumed, false);
  assert.equal(time.pending, 0, 'the attempt timer is cleared once the socket opens');

  const frame = new Uint8Array([1, 2, 3, 4]);
  assert.equal(transport.send(frame), true);
  assert.equal(sockets[0].sent.length, 1);
  assert.equal(transport.stats.framesSent, 1);
  assert.equal(transport.stats.bytesSent, 4);
  assert.equal(transport.bufferedBytes, 4, 'bufferedBytes mirrors the socket bufferedAmount');

  sockets[0].emit('message', { data: new Uint8Array([9, 8]).buffer });
  sockets[0].emit('message', { data: new Uint8Array([7]) });
  sockets[0].emit('message', { data: 'text frames are not part of the wire' });
  sockets[0].emit('message', { data: new Uint8Array(70 * 1024).buffer });
  assert.equal(frames.length, 2, 'ArrayBuffer and view frames arrive; text and oversized frames are rejected');
  assert.deepEqual([...frames[0]], [9, 8]);
  assert.equal(transport.stats.framesReceived, 2);
  assert.equal(transport.stats.bytesReceived, 3);
  assert.equal(transport.stats.framesRejected, 2);

  // An unsolicited close starts the backoff with the resume token on the URL.
  sockets[0].drop(1006);
  assert.equal(transport.state, 'reconnecting');
  const reconnecting = changes.at(-1);
  assert.equal(reconnecting.reason, TRANSPORT_CLOSE.NETWORK);
  assert.equal(reconnecting.attempt, 1);
  assert.equal(reconnecting.code, 1006);
  assert.equal(sockets[0].listenerCount, 0, 'the dead socket keeps no listeners');
  assert.equal(transport.send(frame), false, 'sends are refused while reconnecting');
  time.advance(249);
  assert.equal(sockets.length, 1, 'no attempt before the 250 ms backoff');
  time.advance(1);
  assert.equal(sockets.length, 2);
  assert.equal(sockets[1].url, 'wss://match.example/room/abc?resume=seat-token-1&attempt=1');
  assert.equal(transport.state, 'connecting');
  sockets[1].drop(1006);
  assert.equal(transport.state, 'reconnecting');
  assert.equal(changes.at(-1).attempt, 2);
  time.advance(500);
  assert.equal(sockets.length, 3);
  assert.equal(sockets[2].url.endsWith('attempt=2'), true);
  // An attempt that never opens times out and counts as a failure.
  time.advance(DEFAULT_RECONNECT.attemptTimeoutMs);
  assert.equal(transport.state, 'reconnecting');
  assert.equal(changes.at(-1).reason, TRANSPORT_CLOSE.TIMEOUT);
  assert.equal(changes.at(-1).attempt, 3);
  assert.equal(sockets[2].closedWith?.code, 1000, 'a timed-out socket is closed explicitly');
  time.advance(1000);
  assert.equal(sockets.length, 4);
  sockets[3].accept();
  assert.equal(transport.state, 'open');
  assert.equal(changes.at(-1).resumed, true, 'a reconnect opens as resumed so the owner re-handshakes');
  assert.equal(changes.at(-1).attempt, 3);
  assert.equal(transport.stats.reconnects, 3);
  assert.equal(transport.stats.opens, 2);
  assert.equal(transport.send(frame), true, 'sends resume on the new socket');
  assert.equal(sockets[3].sent.length, 1);

  // The owner asks for a fresh connection (authority stalled on an open socket).
  transport.reconnect(TRANSPORT_CLOSE.STALLED, 'no snapshot for 5 s');
  assert.equal(transport.state, 'reconnecting');
  assert.equal(changes.at(-1).reason, TRANSPORT_CLOSE.STALLED);
  assert.equal(changes.at(-1).attempt, 1, 'a fresh loss restarts the backoff from the first step');
  assert.equal(sockets[3].closedWith?.code, 1000);
  sockets[3].drop(1000, 'late close event from the retired socket');
  assert.equal(transport.state, 'reconnecting', 'a retired socket cannot move the state machine');
  time.advance(250);
  sockets[4].accept();
  assert.equal(transport.state, 'open');

  // A deliberate close never reconnects and drops every listener.
  transport.close(TRANSPORT_CLOSE.SERVER, 'match_ended');
  assert.equal(transport.state, 'closed');
  assert.deepEqual([changes.at(-1).reason, changes.at(-1).detail], [TRANSPORT_CLOSE.SERVER, 'match_ended']);
  assert.equal(sockets[4].closedWith?.code, 1000);
  assert.equal(time.pending, 0);
  time.advance(10_000);
  assert.equal(sockets.length, 5, 'nothing reconnects after a close');
  transport.reconnect(TRANSPORT_CLOSE.STALLED);
  assert.equal(transport.state, 'closed');
}

// ------------------------------------------------------------ reconnect window
{
  sockets.length = 0;
  const time = createVirtualTime();
  const { transport, changes } = createTransport(time, { reconnect: { windowMs: 3_000, attemptTimeoutMs: 100 } });
  transport.open();
  sockets[0].accept();
  sockets[0].drop();
  // 250 + 100, 500 + 100, 1000 + 100, 2000 → the window (3 s) is exceeded before the next attempt.
  time.advance(20_000);
  assert.equal(transport.state, 'closed');
  assert.equal(changes.at(-1).reason, TRANSPORT_CLOSE.EXHAUSTED);
  assert.ok(sockets.length >= 3 && sockets.length <= 5, `attempts inside the window: ${sockets.length}`);
  assert.equal(time.pending, 0);
}

// ------------------------------------------------------------ autoReconnect off
{
  sockets.length = 0;
  const time = createVirtualTime();
  const { transport, changes } = createTransport(time, { autoReconnect: false });
  transport.open();
  sockets[0].accept();
  sockets[0].drop(1006, 'link lost');
  assert.equal(transport.state, 'closed');
  assert.equal(changes.at(-1).reason, TRANSPORT_CLOSE.NETWORK);
  assert.equal(changes.at(-1).detail, 'link lost');
}

// ------------------------------------------------------------ socket construction failure
{
  sockets.length = 0;
  const time = createVirtualTime();
  let failures = 2;
  const { transport } = createTransport(time, {
    createSocket: (url) => { if (failures-- > 0) throw new Error('refused'); return new FakeSocket(url); },
  });
  transport.open();
  assert.equal(transport.state, 'reconnecting', 'a constructor failure enters the backoff');
  time.advance(250);
  assert.equal(transport.state, 'reconnecting');
  time.advance(500);
  assert.equal(transport.state, 'connecting');
  sockets[0].accept();
  assert.equal(transport.state, 'open');
}

// ------------------------------------------------------------ backpressure
{
  sockets.length = 0;
  const time = createVirtualTime();
  const { transport, changes } = createTransport(time, { backpressure: { maxBufferedBytes: 100, sustainedMs: 1000 } });
  transport.open();
  sockets[0].accept();
  const socket = sockets[0];
  const frame = new Uint8Array(40);
  assert.equal(transport.send(frame), true);
  assert.equal(transport.send(frame), true);
  assert.equal(transport.bufferedBytes, 80);
  assert.equal(transport.send(frame), false, 'a frame that would exceed the ceiling is refused');
  assert.equal(transport.stats.framesDropped, 1);
  assert.equal(transport.state, 'open', 'one refusal is not a failure');
  socket.bufferedAmount = 0;
  assert.equal(transport.send(frame), true, 'draining the socket admits frames again');
  socket.bufferedAmount = 120;
  time.advance(10);
  assert.equal(transport.send(frame), false, 'the first refusal starts the sustained window');
  time.advance(999);
  assert.equal(transport.send(frame), false);
  assert.equal(transport.state, 'open', 'refusals shorter than the sustained window keep the transport');
  time.advance(1);
  assert.equal(transport.send(frame), false);
  assert.equal(transport.state, 'closed', 'sustained backpressure fails visibly');
  assert.equal(changes.at(-1).reason, TRANSPORT_CLOSE.BACKPRESSURE);
  assert.equal(transport.stats.framesDropped, 4);
}

// ------------------------------------------------------------ loopback: link semantics
{
  let nowMs = 0;
  const pair = createLoopbackPair({
    clock: () => nowMs,
    clientToServer: { latencyMs: 50, jitterMs: 20 },
    serverToClient: { latencyMs: 50, jitterMs: 20, loss: 0.03 },
  });
  const { client, server } = pair;
  const clientStates = [];
  const serverStates = [];
  client.onState((c) => clientStates.push(c));
  server.onState((c) => serverStates.push(c));
  assert.equal(client.state, 'idle');
  client.open();
  assert.equal(client.state, 'closed', 'a client cannot connect while no server endpoint is open');
  server.open();
  client.open();
  assert.equal(client.state, 'open');
  assert.equal(server.state, 'open');

  const received = [];
  server.onFrame((frame) => received.push(frame[0]));
  for (let n = 0; n < 200; n++) {
    assert.equal(client.send(new Uint8Array([n & 0xff, 1, 2])), true);
    nowMs += 5;
    pair.pump();
  }
  assert.equal(received.length < 200, true, 'frames still in flight after 1 s of sends');
  nowMs += 200;
  pair.pump();
  assert.equal(received.length, 200, 'the client→server link loses nothing');
  assert.deepEqual(received, Array.from({ length: 200 }, (_, n) => n),
    'jitter delays frames, it never reorders them (WebSocket semantics)');
  assert.ok(pair.links.clientToServer.maxDelayMs <= 70 + 1e-9, `max one-way delay ${pair.links.clientToServer.maxDelayMs}`);
  assert.equal(client.stats.framesSent, 200);
  assert.equal(server.stats.framesReceived, 200);
  assert.equal(client.bufferedBytes, 0, 'delivered frames leave the unsent count');

  const down = [];
  client.onFrame((frame) => down.push(frame));
  const sent = 10_000;
  for (let n = 0; n < sent; n++) {
    server.send(new Uint8Array([n & 0xff]));
    nowMs += 1;
    pair.pump();
  }
  nowMs += 500;
  pair.pump();
  const lostFraction = pair.links.serverToClient.lost / sent;
  assert.ok(lostFraction > 0.02 && lostFraction < 0.04, `3 % loss injected: ${lostFraction}`);
  assert.equal(down.length + pair.links.serverToClient.lost, sent, 'every frame is either delivered or counted lost');
  assert.equal(server.stats.framesSent, sent, 'loss is the link\'s, not a refusal of the sender');
  assert.equal(pair.inFlight, 0);

  // Reconnect models a new socket: in-flight frames vanish, both ends see resumed.
  const impaired = createLoopbackPair({ clock: () => nowMs, clientToServer: { latencyMs: 100 }, reconnectDelayMs: 250 });
  impaired.server.open();
  impaired.client.open();
  const serverSeen = [];
  impaired.server.onState((c) => serverSeen.push(c));
  impaired.client.send(new Uint8Array([1]));
  assert.equal(impaired.inFlight, 1);
  impaired.client.reconnect(TRANSPORT_CLOSE.STALLED, 'test');
  assert.equal(impaired.inFlight, 0, 'a dropped socket discards frames in flight');
  assert.equal(impaired.client.state, 'reconnecting');
  assert.equal(impaired.server.state, 'reconnecting');
  nowMs += 249;
  impaired.pump();
  assert.equal(impaired.client.state, 'reconnecting');
  nowMs += 1;
  impaired.pump();
  assert.equal(impaired.client.state, 'open');
  assert.equal(impaired.server.state, 'open');
  assert.deepEqual(serverSeen.map((c) => [c.state, c.resumed ?? null]), [['reconnecting', null], ['open', true]]);
  assert.equal(impaired.client.stats.reconnects, 1);

  // Either end closing closes the other's socket with the matching reason, after the frames sent before it.
  const lastWords = [];
  impaired.client.onFrame((frame) => lastWords.push(frame[0]));
  impaired.server.send(new Uint8Array([42]));
  impaired.server.close(TRANSPORT_CLOSE.SERVER, 'match_ended');
  assert.equal(impaired.client.state, 'open', 'the close travels behind the data');
  nowMs += 100;
  impaired.pump();
  assert.deepEqual(lastWords, [42], 'the frame sent before the close arrived');
  assert.equal(impaired.client.state, 'closed');
  const other = createLoopbackPair({ clock: () => nowMs });
  other.server.open();
  other.client.open();
  other.client.close();
  other.pump();
  assert.equal(other.server.state, 'closed');
  assert.equal(other.client.send(new Uint8Array(1)), false);
}

// ------------------------------------------------------------ loopback: backpressure
{
  let nowMs = 0;
  const pair = createLoopbackPair({
    clock: () => nowMs,
    clientToServer: { latencyMs: 1000 },
    backpressure: { maxBufferedBytes: 64, sustainedMs: 500 },
  });
  pair.server.open();
  pair.client.open();
  const frame = new Uint8Array(30);
  assert.equal(pair.client.send(frame), true);
  assert.equal(pair.client.send(frame), true);
  assert.equal(pair.client.bufferedBytes, 60, 'unsent bytes are the frames still on the delay line');
  assert.equal(pair.client.send(frame), false);
  nowMs += 501;
  assert.equal(pair.client.send(frame), false);
  assert.equal(pair.client.state, 'closed');
  assert.equal(pair.client.stats.framesDropped, 2);
}

console.log('mp transport: contract, WebSocket state machine, backoff + resume, backpressure, loopback impairment pass');
