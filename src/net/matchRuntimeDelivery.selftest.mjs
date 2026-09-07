import assert from 'node:assert/strict';
import { AuthoritativeMatchRuntime, MatchClientRuntime } from './matchRuntime.ts';
import { createLoopbackTransportPair, TransportClosedError } from './loopbackTransport.ts';
import { createEnvelope, MESSAGE_TYPES, PLAYER_ACTION_BITS, normalizePlayerInput } from './protocol.ts';
import { captureWorldSnapshot, createSnapshotDelta } from './snapshot.ts';

function snapshot(tick, ackInputSeq = null, meta = null) {
  return captureWorldSnapshot({ tick, serverTimeMs: tick * 1000 / 60,
    entities: [], viewerId: 'driver', ackInputSeq, meta });
}

function sendSnapshot(link, value) {
  link.host.send(createEnvelope(MESSAGE_TYPES.SNAPSHOT, value,
    { seq: value.tick, tick: value.tick }));
}

function control(sequence, overrides = {}) {
  return createEnvelope(MESSAGE_TYPES.INPUT, normalizePlayerInput({
    inputSeq: sequence, clientTick: 0, snapshotAckTick: 0,
    throttle: 0, steer: 0, aimYaw: 0, aimPitch: 0, shellSlot: 0,
    ...overrides,
  }), { seq: sequence });
}

// Only newly accepted authority packets count as progress. Sampling an old
// frame, stale packets, and wrong-round snapshots cannot hide an open stall.
{
  let now = 100;
  const link = createLoopbackTransportPair({ direct: true });
  const sent = [];
  link.host.onMessage((message) => sent.push(message));
  const client = new MatchClientRuntime({ playerId: 'driver', transport: link.client,
    clock: () => now });
  sendSnapshot(link, snapshot(1));
  assert.equal(client.lastSnapshotReceivedAtMs, 100);
  now = 200;
  client.update(now);
  sendSnapshot(link, snapshot(1));
  assert.equal(client.lastSnapshotReceivedAtMs, 100);
  client.roomRound = 1;
  sendSnapshot(link, snapshot(2, null, { roomRound: 2 }));
  assert.equal(client.lastSnapshotReceivedAtMs, 100);
  sendSnapshot(link, snapshot(3, null, { roomRound: 1 }));
  assert.equal(client.lastSnapshotReceivedAtMs, 200);
  client.requestReconnect();
  assert.equal(client.closed, true);
  assert.equal(client.closeReason, 'authority_stalled');
  assert.equal(sent.some((message) => message.type === MESSAGE_TYPES.LEAVE), false,
    'a recovery request does not voluntarily remove the resumable seat');
  client.close('rtc_recovery_exhausted');
  const replacement = createLoopbackTransportPair({ direct: true });
  assert.equal(client.reconnectTransport(replacement.client), false,
    'terminal disposal cannot be revived by a late transport generation');
  assert.equal(replacement.client.readyState, 'closed');
}

{
  const messages = new Set();
  const closes = new Set();
  const transport = {
    readyState: 'open', send: () => true,
    onMessage(listener) { messages.add(listener); return () => messages.delete(listener); },
    onClose(listener) { closes.add(listener); return () => closes.delete(listener); },
    close(reason) {
      this.readyState = 'closed';
      for (const listener of [...closes]) listener(reason);
    },
  };
  const client = new MatchClientRuntime({ playerId: 'driver', transport });
  transport.close('native_closed');
  client.close('rtc_recovery_exhausted');
  client.close('duplicate_terminal');
  assert.equal(messages.size, 0);
  assert.equal(closes.size, 0, 'terminal cleanup disposes even an already-closed native channel');
}

// Losing the first input packet must not lose its action. An authority null
// receipt is distinct from a receipt for sequence zero across every lane.
{
  const link = createLoopbackTransportPair({ direct: true });
  let dropped = false;
  const received = [];
  const host = new AuthoritativeMatchRuntime({ simulation: {
    step({ inputs }) { received.push(inputs.get('driver')); },
    snapshot({ tick, ackInputSeq }) { return snapshot(tick, ackInputSeq); },
  } });
  host.attachPeer({ peerId: 'driver', transport: link.host });
  const client = new MatchClientRuntime({ playerId: 'driver', clock: () => 0,
    transport: { ...link.client, sendInput(message) {
      if (!dropped) { dropped = true; return true; }
      return link.client.send(message);
    } },
  });
  client.connect();
  client.readyForMatch();
  client.submitInput(control(0, { fire: true, actionBits: PLAYER_ACTION_BITS.REPAIR }).payload);
  host.advance(50);
  assert.equal(client.getStats().lastAckedInputSeq, null);
  assert.equal(client.getStats().pendingInputEdges, 2,
    'no-input snapshots preserve the first fire and repair intent');
  client.submitInput(control(0).payload);
  host.advance(50);
  assert.ok(received.some((input) => input?.fire), 'fire retries after the initial lost input');
  assert.equal(received.filter((input) => input?.actionBits === PLAYER_ACTION_BITS.REPAIR).length, 1);
  assert.equal(client.getStats().pendingInputEdges, 0, 'real input receipt retires the retries');
  client.close();
  host.close();
}

// Invalid data must not advance either sequence watermark. Retrying a valid
// lower sequence remains possible after malformed, future, or invalid-ACK input.
for (const invalid of [
  { clientTick: 999 },
  { snapshotAckTick: 999 },
  { aimYaw: Number.NaN },
]) {
  const link = createLoopbackTransportPair({ direct: true });
  const received = [];
  const host = new AuthoritativeMatchRuntime({ simulation: {
    step({ inputs }) { received.push(inputs.get('driver')); },
    snapshot({ tick, ackInputSeq }) { return snapshot(tick, ackInputSeq); },
  } });
  host.attachPeer({ peerId: 'driver', transport: link.host });
  link.client.send(createEnvelope(MESSAGE_TYPES.HELLO, { playerId: 'driver' }));
  const packet = control(1000);
  Object.assign(packet.payload, invalid);
  link.client.send(packet);
  link.client.send(control(1, { throttle: 1 }));
  link.client.send(createEnvelope(MESSAGE_TYPES.READY, { loaded: true }, { seq: 1 }));
  host.advance(50);
  assert.ok(received.every((input) => input?.throttle === 1),
    `rejected ${Object.keys(invalid)[0]} does not poison subsequent controls`);
  assert.equal(host.peers.get('driver').lastInputSeq, 1);
  assert.equal(host.peers.get('driver').lastInputEnvelopeSeq, 1);
  host.close();
}

// An older missing-baseline delta arriving after a newer keyframe is obsolete;
// it must not discard the usable receipt and force expensive keyframe recovery.
{
  const link = createLoopbackTransportPair({ direct: true });
  const client = new MatchClientRuntime({ playerId: 'driver', transport: link.client, clock: () => 0 });
  sendSnapshot(link, snapshot(9));
  sendSnapshot(link, createSnapshotDelta(snapshot(6), snapshot(3)));
  assert.equal(client.lastSnapshotTick, 9);
  assert.equal(client.missingSnapshotBaselines, 0);
  client.close();
}

// Delayed state from the previous round may not acknowledge this round's input.
{
  const link = createLoopbackTransportPair({ direct: true });
  const client = new MatchClientRuntime({ playerId: 'driver', transport: link.client, clock: () => 0 });
  client.resetForRound(2);
  client.submitInput(control(0, { actionBits: PLAYER_ACTION_BITS.REPAIR }).payload);
  sendSnapshot(link, snapshot(30, 0, { roomRound: 1 }));
  sendSnapshot(link, snapshot(33, null, { roomRound: 2 }));
  assert.equal(client.getStats().pendingInputEdges, 1);
  assert.equal(client.lastAckedInputSeq, null);
  client.close();
}

// An input send can race native closure or exhaust a reliable queue. Clients
// must trigger one recovery edge instead of throwing through the render pump.
for (const failure of ['closed', 'backpressure']) {
  const link = createLoopbackTransportPair({ direct: true });
  const client = new MatchClientRuntime({ playerId: 'driver', clock: () => 0,
    transport: { ...link.client, sendInput() {
      if (failure === 'closed') throw new TransportClosedError();
      return false;
    } },
  });
  let disconnected = 0;
  client.onConnection((connected) => { if (!connected) disconnected++; });
  assert.equal(client.submitInput(control(0).payload), false);
  assert.equal(client.closed, true);
  assert.equal(disconnected, 1, 'transport close and failed send share one recovery edge');
  assert.equal(client.lastSubmittedInputSeq, null, 'failed input is never reported uploaded');
  assert.equal(link.client.readyState, 'closed');
}

// Browser-host authority keeps controls through short loss, but only a fresh
// admitted INPUT extends the lease. Open channels, ACK/ping traffic, stale
// sequences and malformed/future input cannot keep a missing driver moving.
{
  const link = createLoopbackTransportPair({ direct: true });
  const received = [];
  const simulation = {
    step({ inputs }) { received.push(inputs.get('driver')); },
    snapshot({ tick, ackInputSeq }) { return snapshot(tick, ackInputSeq); },
  };
  const host = new AuthoritativeMatchRuntime({ simulation });
  host.attachPeer({ peerId: 'driver', transport: link.host });
  link.client.send(createEnvelope(MESSAGE_TYPES.HELLO, { playerId: 'driver' }));
  link.client.send(createEnvelope(MESSAGE_TYPES.READY, {}, { seq: 1 }));
  link.client.send(control(1, { throttle: 1, steer: 0.5, fire: true,
    aimYaw: 0.75, aimPitch: 0.2, aimDistance: 123, shellSlot: 2,
    actionBits: PLAYER_ACTION_BITS.REPAIR }));
  for (let tick = 0; tick < 15; tick++) host.advance(1000 / 60);
  assert.equal(received.at(-1).throttle, 1, '250 ms transient loss retains controls');
  for (const invalid of [{ clientTick: 999 }, { snapshotAckTick: 999 }, { aimYaw: NaN }]) {
    const packet = control(1000);
    Object.assign(packet.payload, invalid);
    link.client.send(packet);
  }
  link.client.send(control(1, { throttle: -1 }));
  const stalePayload = control(2, { throttle: -1 });
  stalePayload.payload.inputSeq = 1;
  link.client.send(stalePayload);
  link.client.send(createEnvelope(MESSAGE_TYPES.PING,
    { clientTimeMs: 250, snapshotAckTick: host.tick }, { seq: 2 }));
  for (let tick = 0; tick < 15; tick++) host.advance(1000 / 60);
  assert.equal(received.at(-1).throttle, 1, 'controls remain valid through the500 ms lease');
  host.advance(1000 / 60);
  const neutral = received.at(-1);
  assert.deepEqual({ throttle: neutral.throttle, steer: neutral.steer, brake: neutral.brake,
    fire: neutral.fire, actionBits: neutral.actionBits },
  { throttle: 0, steer: 0, brake: true, fire: false, actionBits: 0 });
  assert.deepEqual([neutral.aimYaw, neutral.aimPitch, neutral.aimDistance, neutral.shellSlot],
    [0.75, 0.2, 123, 2], 'expiry preserves aim and ammunition selection');
  assert.equal(neutral.aimLocked, true, 'expiry locks gun/casemate lay rather than chasing the stale sight');
  assert.equal(host.peers.get('driver').lastInputSeq, 1, 'expiry does not fabricate an input receipt');
  assert.equal(link.host.readyState, 'open', 'lease expiry does not disconnect a healthy transport');
  assert.equal(received.filter((input) => input.actionBits === PLAYER_ACTION_BITS.REPAIR).length, 1);
  link.client.send(control(2, { throttle: -1, actionBits: PLAYER_ACTION_BITS.REPAIR }));
  host.advance(1000 / 60);
  assert.equal(received.at(-1).throttle, -1, 'a fresh valid input immediately renews control');
  assert.equal(received.at(-1).actionBits, 0, 'a delayed held action is not consumed twice after expiry');
  link.client.send(control(3));
  host.advance(1000 / 60);
  link.client.send(control(4, { actionBits: PLAYER_ACTION_BITS.REPAIR }));
  host.advance(1000 / 60);
  assert.equal(received.at(-1).actionBits, PLAYER_ACTION_BITS.REPAIR, 'a real release enables a new action');
  host.replaceSimulation(simulation, { round: 1 });
  assert.equal(host.peers.get('driver').lastInputAtMs, null);
  assert.equal(host.peers.get('driver').input, null, 'round replacement retains no input lease');
  host.detachPeer('driver', 'test_reconnect');
  const replacement = createLoopbackTransportPair({ direct: true });
  host.attachPeer({ peerId: 'driver', transport: replacement.host });
  assert.equal(host.peers.get('driver').lastInputAtMs, null);
  assert.equal(host.peers.get('driver').lastInputSeq, null, 'replacement peer starts a fresh admission epoch');
  host.close();
}

// An explicit private-match human roster is a real readiness barrier. Missing
// or disconnected seats cannot disappear from it just because their RTC
// connection has not reached the host yet.
{
  const simulation = { requiredPeerIds: ['driver', 'late'], step() {},
    snapshot({ tick, ackInputSeq }) { return snapshot(tick, ackInputSeq); } };
  const host = new AuthoritativeMatchRuntime({ simulation });
  const first = createLoopbackTransportPair({ direct: true });
  host.attachPeer({ peerId: 'driver', transport: first.host });
  const driver = new MatchClientRuntime({ playerId: 'driver', transport: first.client });
  driver.connect(); driver.readyForMatch();
  host.advance(50);
  assert.equal(host.matchStarted, false, 'an absent roster seat cannot be silently omitted');
  const second = createLoopbackTransportPair({ direct: true });
  host.attachPeer({ peerId: 'late', transport: second.host });
  const late = new MatchClientRuntime({ playerId: 'late', transport: second.client });
  late.connect();
  host.advance(50);
  assert.equal(host.matchStarted, false, 'late attachment still requires asset-ready acknowledgement');
  driver.close(); late.readyForMatch();
  host.advance(50);
  assert.equal(host.matchStarted, false, 'a pre-start disconnect cannot shrink the roster');
  const replacement = createLoopbackTransportPair({ direct: true });
  host.attachPeer({ peerId: 'driver', transport: replacement.host });
  const recovered = new MatchClientRuntime({ playerId: 'driver', transport: replacement.client });
  recovered.connect();
  host.advance(50);
  assert.equal(host.matchStarted, false, 'a replacement channel must establish its own readiness');
  recovered.readyForMatch(); host.advance(50);
  assert.equal(host.matchStarted, true, 'all required seats can release the barrier after recovery');
  host.close();
}

// Controls sent before a loading barrier opens cannot activate stale queued
// fire/consumables half a second later when the actual match begins.
{
  const link = createLoopbackTransportPair({ direct: true });
  const received = [];
  const host = new AuthoritativeMatchRuntime({ simulation: {
    step({ inputs }) { received.push(inputs.get('driver')); },
    snapshot({ tick, ackInputSeq }) { return snapshot(tick, ackInputSeq); },
  } });
  host.attachPeer({ peerId: 'driver', transport: link.host });
  link.client.send(createEnvelope(MESSAGE_TYPES.HELLO, { playerId: 'driver' }));
  link.client.send(control(0, { throttle: 1, fire: true, actionBits: PLAYER_ACTION_BITS.REPAIR }));
  for (let tick = 0; tick < 31; tick++) host.advance(1000 / 60);
  link.client.send(createEnvelope(MESSAGE_TYPES.READY, {}, { seq: 1 }));
  host.advance(1000 / 60);
  assert.equal(received.at(-1).fire, false);
  assert.equal(received.at(-1).actionBits, 0, 'expired pre-ready action edges are discarded');
  host.close();
}

// Explicit focus relinquishment clears retransmitted edges, not sequence or
// snapshot baselines. Reconnect and round reset also discard pending intent.
{
  const link = createLoopbackTransportPair({ direct: true });
  const sent = [];
  link.host.onMessage((message) => { if (message.type === MESSAGE_TYPES.INPUT) sent.push(message); });
  const client = new MatchClientRuntime({ playerId: 'driver', transport: link.client, clock: () => 0 });
  client.lastSnapshotTick = 9;
  client.submitInput(control(0, { fire: true, actionBits: PLAYER_ACTION_BITS.REPAIR }).payload);
  assert.equal(client.getStats().pendingInputEdges, 2);
  client.clearPendingInputIntent();
  assert.equal(client.getStats().pendingInputEdges, 0);
  assert.equal(client.inputSeq, 1);
  assert.equal(client.lastSnapshotTick, 9);
  client.submitInput(control(0).payload);
  assert.equal(sent.at(-1).payload.inputSeq, 1);
  assert.equal(sent.at(-1).payload.snapshotAckTick, 9);
  assert.equal(sent.at(-1).payload.fire, false);
  assert.equal(sent.at(-1).payload.actionBits, 0);
  client.submitInput(control(0, { fire: true, actionBits: PLAYER_ACTION_BITS.REPAIR }).payload);
  const replacement = createLoopbackTransportPair({ direct: true });
  client.reconnectTransport(replacement.client);
  assert.equal(client.getStats().pendingInputEdges, 0, 'recovery never replays old focus intent');
  assert.equal(client.inputSeq, 3, 'recovery retains input sequence continuity');
  assert.equal(client.lastSnapshotTick, 9, 'recovery retains snapshot receipts');
  client.close();
}

// A real hydraulic casemate can steer without throttle/steer input just by
// chasing its sight. Expired intent must also lock aim, or UDES03 keeps moving.
{
  const { Vector3 } = await import('three');
  const { ensureTankBuilder } = await import('../vehicles/fleetFactory.ts');
  const { createAuthoritativeMatch } = await import('../sim/authoritativeMatch.ts');
  await ensureTankBuilder('udes03');
  const normal = new Vector3(0, 1, 0);
  const heightField = { getHeightAt: () => 0, getHeightAtFast: () => 0,
    getNormalAt: () => normal, getGroundType: () => 'hard' };
  const simulation = createAuthoritativeMatch({ players: [
    { id: 'driver', specId: 'udes03', team: 'alpha', spawn: { x: 0, z: 0, yaw: 0 } },
    { id: 'opponent', specId: 'udes03', team: 'bravo', spawn: { x: 0, z: 300, yaw: 0 } },
  ], mapId: 'verdant', seed: 17, countdownS: 0, worldCollision: { heightField } });
  const link = createLoopbackTransportPair({ direct: true });
  const host = new AuthoritativeMatchRuntime({ simulation });
  host.attachPeer({ peerId: 'driver', transport: link.host });
  const opponent = createLoopbackTransportPair({ direct: true });
  host.attachPeer({ peerId: 'opponent', transport: opponent.host });
  opponent.client.send(createEnvelope(MESSAGE_TYPES.HELLO, { playerId: 'opponent' }));
  opponent.client.send(createEnvelope(MESSAGE_TYPES.READY, {}, { seq: 1 }));
  link.client.send(createEnvelope(MESSAGE_TYPES.HELLO, { playerId: 'driver' }));
  link.client.send(createEnvelope(MESSAGE_TYPES.READY, {}, { seq: 1 }));
  link.client.send(control(0, { aimYaw: 1.5, aimPitch: 0.2, aimLocked: false }));
  for (let tick = 0; tick < 30; tick++) host.advance(1000 / 60);
  const entity = simulation.entityById.get('driver');
  assert.ok(entity.state.yaw > 0.001, 'fixture exercises actual sight-driven casemate traverse');
  host.advance(1000 / 60);
  assert.equal(entity.input.aimLocked, true, 'actual authority receives the expired aim lock');
  for (let tick = 0; tick < 120; tick++) host.advance(1000 / 60);
  const settledYaw = entity.state.yaw;
  for (let tick = 0; tick < 120; tick++) host.advance(1000 / 60);
  assert.ok(Math.abs(entity.state.yaw - settledYaw) < 1e-5,
    'silent UDES03 cannot continue auto-traversing toward an abandoned sight');
  entity.input.actionBits = PLAYER_ACTION_BITS.REPAIR;
  host.detachPeer('driver', 'test_disconnected_casemate');
  assert.equal(entity.input.aimLocked, true, 'disconnect immediately retains the gun/hull aim hold');
  assert.equal(entity.input.actionBits, 0, 'disconnect discards queued consumable intent');
  assert.equal(entity.connected, false);
  for (let tick = 0; tick < 120; tick++) host.advance(1000 / 60);
  assert.equal(entity.input.aimLocked, true, 'subsequent missing-input ticks must preserve the aim hold');
  assert.equal(entity.input.actionBits, 0);
  assert.ok(Math.abs(entity.state.yaw - settledYaw) < 1e-5,
    'missing transport cannot restart sight-driven movement after lease expiry');
  host.close();
}

console.log('matchRuntimeDelivery.selftest: null receipts, atomic input admission, reordered deltas, round isolation, input leases passed');
