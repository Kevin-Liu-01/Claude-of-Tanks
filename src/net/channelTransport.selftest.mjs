import assert from 'node:assert/strict';
import { createWebSocketTransport } from './channelTransport.ts';
import { TransportClosedError } from './loopbackTransport.ts';
import { createEnvelope, MESSAGE_TYPES, normalizePlayerInput } from './protocol.ts';
import { captureWorldSnapshot } from './snapshot.ts';
import { snapshotWireCodec } from './snapshotWireCodec.ts';

class BufferedChannel {
  readyState = 'open';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  sent = [];
  listeners = new Map();
  fail = null;
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type) { for (const listener of this.listeners.get(type) || []) listener({}); }
  send(value) {
    if (this.fail) throw new DOMException('simulated native channel failure', this.fail);
    this.sent.push(value);
    this.bufferedAmount += typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength;
  }
  drain() { this.bufferedAmount = 0; this.emit('bufferedamountlow'); }
  close() { this.readyState = 'closed'; this.emit('close'); }
}

function state(tick) {
  return createEnvelope(MESSAGE_TYPES.SNAPSHOT, captureWorldSnapshot({
    tick, serverTimeMs: tick * 1000 / 60, entities: [], viewerId: 'driver',
  }), { seq: tick, tick });
}

function input(inputSeq) {
  return createEnvelope(MESSAGE_TYPES.INPUT, normalizePlayerInput({
    inputSeq, clientTick: 0, throttle: 1, steer: 0,
    aimYaw: 0, aimPitch: 0, shellSlot: 0,
  }), { seq: inputSeq });
}

// Native queues cannot replace bytes already admitted. Even a small buffer
// below the old byte watermark must coalesce to prevent a latency staircase.
for (const [method, packet, pending] of [
  ['sendState', state, 'statePending'], ['sendInput', input, 'inputPending'],
]) {
  const socket = new BufferedChannel();
  const transport = createWebSocketTransport(socket);
  assert.equal(transport[method](packet(1)), true);
  const firstBytes = socket.bufferedAmount;
  for (let sequence = 2; sequence <= 60; sequence++) {
    assert.equal(transport[method](packet(sequence)), true);
  }
  assert.equal(socket.sent.length, 1, 'a stalled second does not enqueue 60 obsolete packets');
  assert.equal(socket.bufferedAmount, firstBytes);
  assert.equal(transport.stats[pending], 1, 'replaceable queue remains one slot');
  assert.equal(transport.send({ type: 'ping' }), true, 'reliable control retains headroom');
  socket.drain();
  assert.equal(socket.sent.length, 3);
  assert.equal(snapshotWireCodec.decode(socket.sent.at(-1)).seq, 60, 'drain releases only latest state');
  assert.equal(transport.stats[pending], 0);
  transport.close();
}

// Packets larger than their lane budget are not accepted into a pending slot
// that can never become writable, even after the entire native queue drains.
for (const [method, packet, option, pending] of [
  ['sendState', state, 'maxStateBufferedBytes', 'statePending'],
  ['sendInput', input, 'maxInputBufferedBytes', 'inputPending'],
]) {
  const socket = new BufferedChannel();
  const transport = createWebSocketTransport(socket, { [option]: 1 });
  assert.equal(transport[method](packet(1)), false);
  assert.equal(transport.stats[pending], 0);
  assert.equal(transport.stats.rejected, 1);
  transport.close();
}

// Both replaceable slots may share a channel. Controls drain first, then the
// following empty-queue edge releases state without starving either slot.
{
  const socket = new BufferedChannel();
  const transport = createWebSocketTransport(socket);
  transport.sendState(state(1));
  transport.sendState(state(2));
  transport.sendInput(input(3));
  socket.drain();
  assert.equal(snapshotWireCodec.decode(socket.sent.at(-1)).type, MESSAGE_TYPES.INPUT);
  assert.equal(transport.stats.inputPending, 0);
  assert.equal(transport.stats.statePending, 1);
  socket.drain();
  assert.equal(snapshotWireCodec.decode(socket.sent.at(-1)).type, MESSAGE_TYPES.SNAPSHOT);
  assert.equal(transport.stats.statePending, 0);
  transport.close();
}

// Sustained bidirectional adapter use must not starve state when fresh input
// is already waiting at every native drain. Both latest-only slots share a
// bounded turn even if neither producer ever pauses.
{
  const socket = new BufferedChannel();
  const transport = createWebSocketTransport(socket);
  transport.sendState(state(0));
  const delivered = [];
  for (let sequence = 1; sequence <= 12; sequence++) {
    transport.sendState(state(sequence));
    transport.sendInput(input(sequence));
    const before = socket.sent.length;
    socket.drain();
    assert.equal(socket.sent.length, before + 1,
      'one drain admits only one native packet, even with both slots pending');
    const packet = snapshotWireCodec.decode(socket.sent.at(-1));
    assert.equal(packet.seq, sequence, 'each lane delivers its newest waiting packet');
    delivered.push(packet.type);
  }
  assert.equal(delivered[0], MESSAGE_TYPES.INPUT, 'the initial control drain stays input-first');
  for (let index = 0; index < delivered.length - 1; index++) {
    assert.deepEqual(new Set(delivered.slice(index, index + 2)),
      new Set([MESSAGE_TYPES.INPUT, MESSAGE_TYPES.SNAPSHOT]),
      'sustained mixed-lane traffic gives each lane a turn within two drains');
  }
  transport.close();
}

// The W3C native send queue can reject even while readyState reports open.
// Replaceable state retries, reliable delivery reports backpressure, and close
// races expose the transport-domain error rather than a browser exception.
{
  const socket = new BufferedChannel();
  const transport = createWebSocketTransport(socket);
  socket.fail = 'OperationError';
  assert.equal(transport.sendState(state(1)), true);
  assert.equal(transport.stats.statePending, 1);
  assert.equal(transport.send({ type: 'ping' }), false);
  socket.fail = null;
  transport.sendState(state(2));
  assert.equal(snapshotWireCodec.decode(socket.sent[0]).seq, 2);
  socket.fail = 'InvalidStateError';
  assert.throws(() => transport.send({ type: 'ping' }), TransportClosedError);
  transport.sendState(state(3));
  assert.doesNotThrow(() => socket.drain(), 'asynchronous drain handles its own close race');
  assert.equal(transport.readyState, 'closed');
}

console.log('channelTransport.selftest: single-packet native queues, latest-only drain, oversize rejection, native failures passed');
