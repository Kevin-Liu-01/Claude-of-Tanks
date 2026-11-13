// Proof (implicit state machine audit M2, 2026-11-02): the transports' smaller lifecycle edges.
// (A) WebSocketTransport and (B) WebRtcTransport: a reconnect() while already reconnecting scheduled a second retry timer
//     over the first without cancelling it; the first one's callback then nulled the handle, so connect() could not
//     cancel the second, which fired an early extra attempt.
// (C) WebRtcTransport.close() unsubscribed the signaler while open() allows closed → connecting: a reopened transport
//     could never hear an answer (MigratingTransport.replace reopens a closed replacement).
// (D) MigratingTransport.close() set `closed` before reading its own state, so its `previous` was always 'closed';
//     replace() always named 'open' as the state it left.
import assert from 'node:assert/strict';
import { TRANSPORT_CLOSE, WebSocketTransport, WebRtcTransport } from './index.ts';
import { MigratingTransport } from './migratingTransport.ts';
import { FakeSignalRelay, RtcWorld } from './rtcDouble.test-support.ts';
import { Listeners } from './transport.ts';

function createVirtualTime() {
  let nowMs = 1000;
  let serial = 0;
  const timers = new Map();
  return {
    clock: () => nowMs,
    setTimer(callback, delayMs) { const handle = ++serial; timers.set(handle, { dueMs: nowMs + delayMs, callback, handle }); return handle; },
    clearTimer(handle) { timers.delete(handle); },
    advance(ms) {
      const target = nowMs + ms;
      for (;;) {
        const due = [...timers.values()].filter((timer) => timer.dueMs <= target).sort((a, b) => a.dueMs - b.dueMs || a.handle - b.handle)[0];
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

// ---- (A) WebSocket: a second reconnect() while reconnecting keeps one retry timer and makes one attempt
{
  const time = createVirtualTime();
  const sockets = [];
  class FakeSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.binaryType = 'blob'; this.bufferedAmount = 0; this.listeners = new Map(); sockets.push(this); }
    addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
    emit(type, event = {}) { for (const listener of [...(this.listeners.get(type) || [])]) listener(event); }
    accept() { this.readyState = 1; this.emit('open'); }
    send() {}
    close() { this.readyState = 3; }
  }
  const transport = new WebSocketTransport({
    url: 'wss://match.example/room/abc', resumeToken: 'seat', createSocket: (url) => new FakeSocket(url),
    clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer, random: () => 0.5,
  });
  transport.open();
  sockets[0].accept();
  assert.equal(transport.state, 'open');
  transport.reconnect(TRANSPORT_CLOSE.NETWORK, 'stall');
  assert.equal(transport.state, 'reconnecting');
  const pending = time.pending;
  transport.reconnect(TRANSPORT_CLOSE.NETWORK, 'stall again');
  assert.equal(time.pending, pending, 'the second reconnect replaces the pending retry, it does not add one');
  time.advance(600);
  assert.equal(sockets.length, 2, `the retry made one attempt (${sockets.length - 1} attempts)`);
  transport.close();
}

// ---- (B) WebRTC: the same, and (C) a closed transport reopened still hears its signals
const settle = async (world, relay, rounds = 6) => {
  for (let index = 0; index < rounds; index++) { await Promise.resolve(); await Promise.resolve(); relay?.flush(); world.flush(); }
};
function scriptedHost(world, relay, hostId) {
  const signaler = relay.signalerFor(hostId);
  const host = { offers: [] };
  signaler.onSignal((signal) => {
    if (signal.kind !== 'offer') return;
    host.offers.push(signal);
    const pc = world.createPeerConnection({});
    pc.ondatachannel = () => {};
    void (async () => {
      await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signaler.sendSignal({ to: signal.from, generation: signal.generation, kind: 'answer', sdp: answer.sdp });
    })();
  });
  return host;
}
{
  const time = createVirtualTime();
  const world = new RtcWorld();
  const relay = new FakeSignalRelay('host', 1);
  const host = scriptedHost(world, relay, 'host');
  const transport = new WebRtcTransport({ signaler: relay.signalerFor('peer'), createPeerConnection: world.createPeerConnection, clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer, random: () => 0.5 });
  transport.open();
  await settle(world, relay);
  transport.reconnect(TRANSPORT_CLOSE.NETWORK, 'stall');
  assert.equal(transport.state, 'reconnecting');
  const pending = time.pending;
  transport.reconnect(TRANSPORT_CLOSE.NETWORK, 'stall again');
  assert.equal(time.pending, pending, 'WebRTC: the second reconnect replaces the pending retry, it does not add one');
  const offersBefore = host.offers.length;
  time.advance(600);
  await settle(world, relay);
  assert.equal(host.offers.length - offersBefore, 1, 'the retry made one attempt: one offer');
  // (C) closed, then reopened: the signaler's listener is back
  const listeners = () => relay.listeners.get('peer')?.size ?? 0;
  transport.close();
  assert.equal(listeners(), 0, 'setup: a closed transport hears nothing');
  transport.open();
  assert.equal(listeners(), 1, 'a reopened transport listens to its signaler again');
  transport.close();
}

// ---- (D) MigratingTransport names the state it leaves
function scripted(state) {
  const states = new Listeners();
  const transport = {
    kind: 'scripted', state, bufferedBytes: 0, stats: { framesSent: 0, bytesSent: 0, framesReceived: 0, bytesReceived: 0, framesDropped: 0, framesRejected: 0, reconnects: 0, opens: 0 },
    open() { transport.state = 'open'; }, send: () => true, reconnect() {},
    close() { transport.state = 'closed'; }, onFrame: () => () => {}, onState: (listener) => states.add(listener), states,
  };
  return transport;
}
{
  const changes = [];
  const migrating = new MigratingTransport(scripted('open'));
  migrating.onState((change) => changes.push(change));
  migrating.close();
  assert.deepEqual(changes.map(({ state, previous }) => ({ state, previous })), [{ state: 'closed', previous: 'open' }], 'close names the open state it left');
  const replaced = [];
  const inner = scripted('open');
  const other = new MigratingTransport(inner);
  other.onState((change) => replaced.push(change));
  inner.state = 'reconnecting';
  other.replace(scripted('idle'), 'host migration');
  assert.equal(replaced[0].state, 'reconnecting');
  assert.equal(replaced[0].previous, 'reconnecting', 'replace names the state it left, not always open');
  other.close();
}
console.log('transportLifecycle.selftest: one retry timer per reconnect (WebSocket, WebRTC); a reopened WebRTC transport hears its signaler; MigratingTransport names the state it leaves');
