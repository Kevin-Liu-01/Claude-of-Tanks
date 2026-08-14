import assert from 'node:assert/strict';
import {
  MESSAGE_TYPES,
  PLAYER_ACTION_BITS,
  ProtocolError,
  createEnvelope,
  createRoomCode,
  isSequenceNewer,
  normalizePlayerInput,
  normalizeRoomCode,
  validateEnvelope,
} from './protocol.js';
import {
  LOBBY_PHASES,
  LOBBY_TEAMS,
  LobbyError,
  addLobbyPlayer,
  applyLobbyCommand,
  createLobby,
  removeLobbyPlayer,
  serializeLobby,
} from './lobby.js';
import { createLoopbackTransportPair } from './loopbackTransport.js';
import { createWebRTCDataChannelTransport } from './channelTransport.js';
import {
  SnapshotBuffer,
  captureEntitySnapshot,
  captureWorldSnapshot,
  decodeEntitySnapshot,
} from './snapshot.js';
import { AuthoritativeMatchRuntime, MatchClientRuntime } from './matchRuntime.js';
import { createLocalMatchSession } from './localSession.js';
import { MATCH_CHANNEL_LABEL, createWebRTCPeer } from './webrtcPeer.js';
import { RoomSignalingClient } from './signalingClient.js';
import { LobbyClientRuntime, LobbyHostRuntime } from './lobbyRuntime.js';

function input(overrides = {}) {
  return {
    throttle: 0,
    steer: 0,
    brake: false,
    fire: false,
    aimYaw: 0,
    aimPitch: 0,
    shellSlot: 0,
    actionBits: 0,
    ...overrides,
  };
}

function entity(id, specId, team, x, { visible = false, yaw = 0, speed = 0 } = {}) {
  return {
    id,
    specId,
    team,
    spotted: visible,
    state: {
      pos: { x, y: 2, z: 3 },
      yaw,
      speed,
      visualPitch: 0,
      visualRoll: 0,
      turretYaw: 0,
      gunPitch: 0,
    },
    input: { fire: false },
    combat: {
      hp: 900,
      maxHp: 1000,
      destroyed: false,
      fire: { burning: false },
      reload: { t: 1.25 },
      shellSlot: 1,
    },
  };
}

function expectCode(fn, ErrorType, code) {
  assert.throws(fn, (error) => error instanceof ErrorType && error.code === code);
}

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
  }
}

class FakeChannel extends FakeEventTarget {
  constructor(label = MATCH_CHANNEL_LABEL) {
    super();
    this.label = label;
    this.readyState = 'open';
    this.ordered = true;
    this.maxRetransmits = null;
    this.maxPacketLifeTime = null;
    this.bufferedAmount = 0;
    this.sent = [];
  }
  send(value) { this.sent.push(value); }
  close() { this.readyState = 'closed'; this.emit('close'); }
}

// Protocol and room identity.
assert.equal(normalizeRoomCode(' ab-10 io '), 'ABLQLQ');
assert.equal(createRoomCode(() => 0), 'AAAAAA');
assert.equal(createRoomCode(() => 0.999999), '999999');
const envelope = createEnvelope(MESSAGE_TYPES.INPUT, { ok: true }, { seq: 3, ack: 2, tick: 9 });
assert.equal(validateEnvelope(envelope), envelope);
expectCode(() => validateEnvelope({ ...envelope, v: 999 }), ProtocolError, 'protocol_mismatch');
const normalizedInput = normalizePlayerInput({
  inputSeq: 2,
  clientTick: 3,
  throttle: 4,
  steer: -4,
  brake: 1,
  fire: 1,
  aimYaw: 7,
  aimPitch: 7,
  shellSlot: 2,
  actionBits: 3,
  ignored: 'drop me',
});
assert.equal(normalizedInput.throttle, 1);
assert.equal(normalizedInput.steer, -1);
assert.equal(normalizedInput.aimPitch, Math.PI / 2);
assert.equal(Object.hasOwn(normalizedInput, 'ignored'), false);
assert.equal(isSequenceNewer(0, 0x7fffffff), true, 'sequence wrap is newer');
assert.equal(isSequenceNewer(3, 3), false);

// Lobby policy: player identity is independent from vehicle identity.
const lobby = createLobby({
  roomCode: 'ABC234',
  hostId: 'kevin',
  hostName: 'Kevin',
  hostSpecId: 'm1a2',
});
addLobbyPlayer(lobby, { id: 'guest', name: 'Guest', specId: 'm1a2' });
assert.equal(lobby.players.get('guest').team, LOBBY_TEAMS.BRAVO);
assert.equal(lobby.players.get('kevin').specId, lobby.players.get('guest').specId,
  'two players may select the same tank');
expectCode(() => applyLobbyCommand(lobby, 'guest', { type: 'set_map', mapId: 'winter' }),
  LobbyError, 'host_only');
applyLobbyCommand(lobby, 'kevin', { type: 'set_ready', ready: true });
applyLobbyCommand(lobby, 'guest', {
  type: 'select_equipment', equipment: ['rammer', 'vstab', 'optics', 'toolbox'],
});
assert.deepEqual(lobby.players.get('guest').equipment, ['rammer', 'vstab', 'optics']);
applyLobbyCommand(lobby, 'guest', { type: 'set_ready', ready: true });
applyLobbyCommand(lobby, 'kevin', { type: 'start', matchSeed: 42 });
assert.equal(lobby.phase, LOBBY_PHASES.STARTING);
assert.equal(lobby.locked, true);
const lobbyWire = serializeLobby(lobby);
assert.equal(Array.isArray(lobbyWire.players), true);
assert.equal(Object.hasOwn(lobbyWire, 'players') && lobbyWire.players.length, 2);
const botLobby = createLobby({
  roomCode: 'BOT234', hostId: 'solo', hostName: 'Solo', hostSpecId: 'm1a2', teamSize: 3,
});
applyLobbyCommand(botLobby, 'solo', { type: 'set_ready', ready: true });
applyLobbyCommand(botLobby, 'solo', { type: 'start', matchSeed: 77 });
assert.equal(serializeLobby(botLobby).teamSize, 3, 'one human may start a bot-filled match');
const observerLobby = createLobby({
  roomCode: 'OBS234', hostId: 'observer', hostName: 'Observer', hostSpecId: 'm1a2', teamSize: 1,
});
applyLobbyCommand(observerLobby, 'observer', { type: 'set_team', team: 'spectator' });
applyLobbyCommand(observerLobby, 'observer', { type: 'start', matchSeed: 88 });
assert.equal(observerLobby.phase, LOBBY_PHASES.STARTING,
  'a spectator host may launch a bot-filled observed match');

const migrateLobby = createLobby({ roomCode: 'XYZ789', hostId: 'z-host', hostName: 'Host' });
addLobbyPlayer(migrateLobby, { id: 'a-next', name: 'Next' });
removeLobbyPlayer(migrateLobby, 'z-host');
assert.equal(migrateLobby.hostId, 'a-next');
assert.equal(migrateLobby.players.get('a-next').isHost, true);

// Loopback transport is ordered, cloned, bounded, and closes symmetrically.
{
  const { client, host } = createLoopbackTransportPair();
  const received = [];
  host.onMessage((message) => received.push(message));
  const mutable = { n: 1 };
  client.send(mutable);
  mutable.n = 99;
  client.send({ n: 2 });
  await Promise.resolve();
  assert.deepEqual(received, [{ n: 1 }, { n: 2 }]);
  client.close('done');
  assert.equal(host.readyState, 'closed');
}
{
  const { client, host } = createLoopbackTransportPair({ maxQueuedMessages: 1 });
  host.onMessage(() => {});
  assert.equal(client.send({ n: 1 }), true);
  assert.equal(client.send({ n: 2 }), false, 'bounded queue reports backpressure');
  await Promise.resolve();
}

// Real channel adapter: reliable ordering, JSON decoding, and byte backpressure.
{
  const channel = new FakeChannel();
  const transport = createWebRTCDataChannelTransport(channel, { maxBufferedBytes: 64 });
  const messages = [];
  transport.onMessage((message) => messages.push(message));
  assert.equal(transport.send({ type: 'ping' }), true);
  assert.deepEqual(JSON.parse(channel.sent[0]), { type: 'ping' });
  channel.emit('message', { data: JSON.stringify({ type: 'pong' }) });
  assert.deepEqual(messages, [{ type: 'pong' }]);
  channel.bufferedAmount = 64;
  assert.equal(transport.send({ type: 'blocked' }), false);
  transport.close('done');
  assert.equal(transport.readyState, 'closed');
}

// WebRTC negotiation keeps ICE/TURN policy and signaling outside game logic.
class FakePeerConnection {
  constructor(config) {
    this.config = config;
    this.connectionState = 'new';
    this.localDescription = null;
    this.remoteDescription = null;
    this.candidates = [];
  }
  createDataChannel(label) { this.channel = new FakeChannel(label); this.channel.readyState = 'connecting'; return this.channel; }
  async createOffer() { return { type: 'offer', sdp: 'offer-sdp' }; }
  async createAnswer() { return { type: 'answer', sdp: 'answer-sdp' }; }
  async setLocalDescription(value) { this.localDescription = value; }
  async setRemoteDescription(value) { this.remoteDescription = value; }
  async addIceCandidate(value) { this.candidates.push(value); }
  close() { this.connectionState = 'closed'; }
}
{
  assert.throws(() => createWebRTCPeer({
    role: 'host', onSignal() {}, relayOnly: true,
    RTCPeerConnectionImpl: FakePeerConnection,
  }), /TURN/);
  const hostSignals = [];
  const clientSignals = [];
  const host = createWebRTCPeer({
    role: 'host', onSignal: (signal) => hostSignals.push(signal),
    RTCPeerConnectionImpl: FakePeerConnection,
  });
  const client = createWebRTCPeer({
    role: 'client', onSignal: (signal) => clientSignals.push(signal),
    RTCPeerConnectionImpl: FakePeerConnection,
  });
  await host.start();
  assert.equal(hostSignals[0].description.type, 'offer');
  await client.handleSignal({ kind: 'ice', candidate: { candidate: 'early' } });
  await client.handleSignal(hostSignals[0]);
  assert.equal(clientSignals[0].description.type, 'answer');
  assert.equal(client.peerConnection.candidates.length, 1, 'early ICE drains after remote description');
  await host.handleSignal(clientSignals[0]);
  assert.equal(host.peerConnection.remoteDescription.type, 'answer');
}

// Signaling client is rendezvous-only and request/response correlated.
class FakeWebSocket extends FakeEventTarget {
  static instances = [];
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  open() { this.readyState = 1; this.emit('open'); }
  send(value) { this.sent.push(value); }
  receive(value) { this.emit('message', { data: JSON.stringify(value) }); }
  close() { this.readyState = 3; this.emit('close'); }
}
{
  const signaling = new RoomSignalingClient({
    url: 'ws://localhost:7777', WebSocketImpl: FakeWebSocket, requestTimeoutMs: 100,
  });
  const connecting = signaling.connect();
  const socket = FakeWebSocket.instances.at(-1);
  socket.open();
  await connecting;
  const roomPromise = signaling.createRoom({ player: { id: 'p1', name: 'Player One' } });
  await Promise.resolve();
  const request = JSON.parse(socket.sent.at(-1));
  socket.receive({
    type: 'room_created', requestId: request.requestId,
    payload: { roomCode: 'ABC234', peerId: 'p1', hostId: 'p1' },
  });
  const room = await roomPromise;
  assert.equal(room.roomCode, 'ABC234');
  signaling.sendSignal('p2', { kind: 'ice', candidate: { candidate: 'x' } });
  assert.equal(JSON.parse(socket.sent.at(-1)).type, 'room_signal');
  signaling.close();
}

// Lobby commands use the same channel and hand it off cleanly at match start.
{
  const room = createLobby({
    roomCode: 'LOBBY2', hostId: 'host', hostName: 'Host', hostSpecId: 'm1a2',
  });
  let started = null;
  const hostLobby = new LobbyHostRuntime({ lobby: room, onStart: (state) => { started = state; } });
  const pair = createLoopbackTransportPair();
  const clientLobby = new LobbyClientRuntime({ transport: pair.client });
  hostLobby.attachPeer({
    peerId: 'guest', transport: pair.host,
    player: { name: 'Guest', specId: 'm1a2' },
  });
  await Promise.resolve();
  assert.equal(clientLobby.state.players.length, 2);
  clientLobby.submit({ type: 'set_map', mapId: 'winter' });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(clientLobby.errors.at(-1).code, 'host_only');
  hostLobby.command('host', { type: 'set_ready', ready: true });
  clientLobby.submit({ type: 'set_ready', ready: true });
  await Promise.resolve();
  await Promise.resolve();
  hostLobby.command('host', { type: 'start', matchSeed: 99 });
  await Promise.resolve();
  assert.equal(started.phase, LOBBY_PHASES.STARTING);
  assert.equal(clientLobby.state.phase, LOBBY_PHASES.STARTING);
  const hostChannels = hostLobby.releaseTransports();
  const clientChannel = clientLobby.releaseTransport();
  assert.equal(hostChannels.length, 1);
  assert.equal(hostChannels[0].transport.readyState, 'open');
  assert.equal(clientChannel.readyState, 'open');
  clientChannel.close('test_done');
}

// Viewer-specific snapshot filtering and vehicle interpolation.
const own = entity('p1', 'm1a2', 'alpha', 0);
const hidden = entity('p2', 'm1a2', 'bravo', 20);
const filtered = captureWorldSnapshot({
  tick: 1,
  serverTimeMs: 0,
  entities: [own, hidden],
  viewerId: 'p1',
  canObserve: (_viewer, target) => target.team === 'alpha' || target.spotted,
});
assert.deepEqual(filtered.entities.map((entry) => entry.id), ['p1'],
  'hidden enemy coordinates never enter the payload');
hidden.spotted = true;
const visible = captureWorldSnapshot({
  tick: 2,
  serverTimeMs: 50,
  entities: [own, hidden],
  viewerId: 'p1',
  canObserve: (_viewer, target) => target.team === 'alpha' || target.spotted,
});
assert.deepEqual(visible.entities.map((entry) => entry.id), ['p1', 'p2']);
assert.equal(decodeEntitySnapshot(captureEntitySnapshot(hidden)).x, 20);

const before = entity('moving', 't90m', 'alpha', 0, {
  yaw: Math.PI - 0.02,
  speed: 20,
});
const after = entity('moving', 't90m', 'alpha', 1, {
  yaw: -Math.PI + 0.02,
  speed: 20,
});
const interpolation = new SnapshotBuffer({ interpolationDelayMs: 0 });
interpolation.push(captureWorldSnapshot({
  tick: 3, serverTimeMs: 0, entities: [before], viewerId: 'moving',
}));
interpolation.push(captureWorldSnapshot({
  tick: 6, serverTimeMs: 50, entities: [after], viewerId: 'moving',
}));
const halfway = interpolation.sample(25).entities[0];
assert.ok(Math.abs(halfway.x - 0.5) < 0.03, `Hermite x midpoint: ${halfway.x}`);
assert.ok(Math.abs(Math.abs(halfway.yaw) - Math.PI) < 0.03,
  `yaw interpolates across wrap: ${halfway.yaw}`);

const responsive = new SnapshotBuffer({
  interpolationDelayMs: 100,
  maxExtrapolationMs: 250,
  immediateEntityId: 'driver',
});
for (const [tickValue, serverTimeMs, x] of [[0, 0, 0], [3, 50, 0.5]]) {
  responsive.push(captureWorldSnapshot({
    tick: tickValue,
    serverTimeMs,
    entities: [entity('driver', 'm1a2', 'alpha', x, { yaw: Math.PI / 2, speed: 10 })],
    viewerId: 'driver',
  }));
}
const responsiveFrame = responsive.sample(100);
assert.ok(Math.abs(responsiveFrame.entities[0].x - 1) < 0.03,
  'owned tank bypasses the remote 100 ms jitter delay using bounded authority extrapolation');

const jitter = new SnapshotBuffer({ interpolationDelayMs: 100, maxExtrapolationMs: 250 });
for (const [tickValue, serverTimeMs] of [[0, 0], [3, 50], [6, 100], [12, 200], [15, 250]]) {
  jitter.push(captureWorldSnapshot({
    tick: tickValue,
    serverTimeMs,
    entities: [entity('remote', 't90m', 'bravo', serverTimeMs / 100,
      { yaw: Math.PI / 2, speed: 10 })],
    viewerId: 'remote',
  }));
}
assert.equal(jitter.push(captureWorldSnapshot({
  tick: 9,
  serverTimeMs: 150,
  entities: [entity('remote', 't90m', 'bravo', 1.5, { yaw: Math.PI / 2, speed: 10 })],
  viewerId: 'remote',
})), false, 'late out-of-order snapshots cannot rewind presentation');
let priorJitterX = -Infinity;
for (let localTimeMs = 100; localTimeMs <= 600; localTimeMs += 16) {
  const x = jitter.sample(localTimeMs).entities[0].x;
  assert.ok(Number.isFinite(x) && x + 1e-6 >= priorJitterX,
    `loss/jitter soak remains finite and monotonic at ${localTimeMs} ms`);
  priorJitterX = x;
}
assert.ok(priorJitterX <= 5.01,
  'remote extrapolation stops at the 250 ms loss bound instead of drifting indefinitely');

// Host/client modules share the same transport and enforce visibility.
function createTestSimulation() {
  const entities = new Map();
  const simulation = {
    entities,
    fireTicks: 0,
    actionFrames: [],
    onPeerJoin({ peerId, metadata }) {
      const team = metadata && metadata.team ? metadata.team :
        (peerId === 'p1' ? 'alpha' : 'bravo');
      entities.set(peerId, entity(peerId, 'm1a2', team, 0));
    },
    onPeerLeave({ peerId }) { entities.delete(peerId); },
    step({ dt, inputs }) {
      for (const [peerId, nextInput] of inputs) {
        const current = entities.get(peerId);
        if (current && nextInput) {
          current.state.pos.x += nextInput.throttle * 10 * dt;
          if (nextInput.fire) simulation.fireTicks++;
          if (nextInput.actionBits) simulation.actionFrames.push(nextInput.actionBits);
        }
      }
    },
    snapshot({ tick, serverTimeMs, viewerId, ackInputSeq }) {
      const viewer = entities.get(viewerId);
      return captureWorldSnapshot({
        tick,
        serverTimeMs,
        entities: [...entities.values()],
        viewerId,
        ackInputSeq,
        canObserve: (_id, target) => target.team === viewer.team || target.spotted,
      });
    },
  };
  return simulation;
}

{
  const simulation = createTestSimulation();
  const hostRuntime = new AuthoritativeMatchRuntime({ simulation, maxCatchUpTicks: 8 });
  const p1Transport = createLoopbackTransportPair();
  const p2Transport = createLoopbackTransportPair();
  const p1 = new MatchClientRuntime({
    transport: p1Transport.client,
    playerId: 'p1',
    interpolationDelayMs: 0,
    clock: () => 0,
  });
  const p2 = new MatchClientRuntime({
    transport: p2Transport.client,
    playerId: 'p2',
    interpolationDelayMs: 0,
    clock: () => 0,
  });
  hostRuntime.attachPeer({ peerId: 'p1', transport: p1Transport.host, metadata: { team: 'alpha' } });
  hostRuntime.attachPeer({ peerId: 'p2', transport: p2Transport.host, metadata: { team: 'bravo' } });
  p1.connect();
  p2.connect();
  await Promise.resolve();
  p1.readyForMatch();
  p2.readyForMatch();
  p1.submitInput(input({ throttle: 1 }), 0);
  await Promise.resolve();
  assert.equal(hostRuntime.advance(50), 3, '50 ms advances exactly three 60 Hz ticks');
  await Promise.resolve();
  const p1Frame = p1.update(50);
  const p2Frame = p2.update(50);
  assert.equal(hostRuntime.stats.snapshots, 2, 'one viewer-specific snapshot per peer');
  assert.deepEqual(p1Frame.entities.map((entry) => entry.id), ['p1']);
  assert.deepEqual(p2Frame.entities.map((entry) => entry.id), ['p2']);
  assert.ok(p1Frame.entities[0].x > 0, 'authoritative host applies client input');
  assert.equal(p1Frame.ackInputSeq, 0, 'snapshot acknowledges consumed input sequence');
  p1.submitInput(input({ fire: true }), hostRuntime.tick);
  p1.submitInput(input({ fire: false }), hostRuntime.tick);
  p1.submitInput(input({ actionBits: PLAYER_ACTION_BITS.REPAIR }), hostRuntime.tick);
  p1.submitInput(input({ actionBits: 0 }), hostRuntime.tick);
  await Promise.resolve();
  hostRuntime.advance(1000 / 60);
  assert.equal(simulation.fireTicks, 1, 'a short fire edge survives latest-input replacement');
  assert.deepEqual(simulation.actionFrames, [PLAYER_ACTION_BITS.REPAIR],
    'a short action-bit edge survives latest-input replacement exactly once');
  p1.submitInput(input({ actionBits: PLAYER_ACTION_BITS.FIRST_AID }), hostRuntime.tick);
  await Promise.resolve();
  hostRuntime.advance(50);
  assert.deepEqual(simulation.actionFrames, [
    PLAYER_ACTION_BITS.REPAIR,
    PLAYER_ACTION_BITS.FIRST_AID,
  ], 'an action bit is consumed once even when one input spans several authority steps');
  hostRuntime.close();
}

// Solo play is the same host/client path, not a direct simulation shortcut.
{
  const simulation = createTestSimulation();
  const session = createLocalMatchSession({ playerId: 'solo', simulation });
  await Promise.resolve();
  session.ready();
  const frame = await session.advance(50, input({ throttle: 0.5 }));
  assert.equal(session.host.stats.steps, 3);
  assert.equal(frame.entities[0].id, 'solo');
  assert.ok(frame.entities[0].x > 0);
  session.close();
}

console.log('net.selftest: protocol, lobby, loopback, visibility, interpolation, and authority passed');
