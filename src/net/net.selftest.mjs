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
import {
  automaticPlayerName,
  normalizePlayerName,
  uniquePlayerName,
} from './playerNames.js';
import {
  createWebRTCDataChannelTransport,
  createWebRTCSplitTransport,
  createWebSocketTransport,
} from './channelTransport.js';
import {
  SnapshotAssembler,
  SnapshotBuffer,
  captureEntitySnapshot,
  captureWorldSnapshot,
  createSnapshotDelta,
  decodeEntitySnapshot,
} from './snapshot.js';
import { AuthoritativeMatchRuntime, MatchClientRuntime } from './matchRuntime.js';
import { snapshotWireCodec } from './snapshotWireCodec.js';
import { createLocalMatchSession } from './localSession.js';
import {
  MATCH_CHANNEL_LABEL,
  MATCH_CONTROL_CHANNEL_LABEL,
  MATCH_STATE_CHANNEL_LABEL,
  createWebRTCPeer,
} from './webrtcPeer.js';
import { RoomSignalingClient } from './signalingClient.js';
import { resolveSignalUrl } from './signalEndpoint.js';
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

function snapshotEnvelope(tick, x = tick) {
  return createEnvelope(MESSAGE_TYPES.SNAPSHOT, captureWorldSnapshot({
    tick,
    serverTimeMs: tick * 50,
    entities: [entity('driver', 'm1a2', 'alpha', x)],
    viewerId: 'driver',
  }), { seq: tick, tick });
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
  constructor(label = MATCH_CHANNEL_LABEL, options = {}) {
    super();
    this.label = label;
    this.readyState = 'open';
    this.ordered = options.ordered ?? true;
    this.maxRetransmits = options.maxRetransmits ?? null;
    this.maxPacketLifeTime = null;
    this.bufferedAmount = 0;
    this.bufferedAmountLowThreshold = 0;
    this.sent = [];
  }
  send(value) { this.sent.push(value); }
  close() { this.readyState = 'closed'; this.emit('close'); }
}

// Split WebRTC delivery keeps control reliable and makes stale state replaceable.
{
  const control = new FakeChannel(MATCH_CONTROL_CHANNEL_LABEL, { ordered: true });
  const state = new FakeChannel(MATCH_STATE_CHANNEL_LABEL, {
    ordered: false,
    maxRetransmits: 0,
  });
  const transport = createWebRTCSplitTransport(control, state, {
    maxStateBufferedBytes: 1024,
    maxMessageBytes: 4096,
  });
  assert.equal(transport.send({ type: 'input', payload: 1 }), true);
  assert.equal(JSON.parse(control.sent[0]).type, 'input');
  assert.equal(state.sent.length, 0, 'control never leaks onto the state lane');
  assert.equal(transport.sendState(snapshotEnvelope(1)), true);
  assert.equal(snapshotWireCodec.decode(state.sent[0]).tick, 1);

  state.bufferedAmount = 1024;
  transport.sendState(snapshotEnvelope(2));
  transport.sendState(snapshotEnvelope(3));
  assert.equal(state.sent.length, 1, 'blocked state is coalesced instead of queued');
  assert.ok(transport.stats.state.stateCoalesced >= 1);
  state.bufferedAmount = 0;
  state.emit('bufferedamountlow');
  assert.equal(snapshotWireCodec.decode(state.sent.at(-1)).tick, 3,
    'buffer drain sends only the newest authoritative state');

  const received = [];
  transport.onMessage((message) => received.push(message.type));
  control.emit('message', { data: JSON.stringify({ type: 'event' }) });
  state.emit('message', { data: snapshotWireCodec.encode(snapshotEnvelope(4)) });
  assert.deepEqual(received, ['event', 'snapshot']);
  transport.close('done');
  assert.equal(control.readyState, 'closed');
  assert.equal(state.readyState, 'closed');
}

// Ordered WebSockets cannot split lanes, but must stop stale snapshots from
// consuming all reliable control headroom.
{
  const socket = new FakeChannel('websocket');
  const transport = createWebSocketTransport(socket, {
    maxBufferedBytes: 2048,
    maxStateBufferedBytes: 1024,
    maxMessageBytes: 4096,
  });
  socket.bufferedAmount = 1024;
  transport.sendState(snapshotEnvelope(1));
  transport.sendState(snapshotEnvelope(2));
  assert.equal(socket.sent.length, 0);
  socket.bufferedAmount = 0;
  transport.sendState(snapshotEnvelope(3));
  assert.equal(snapshotWireCodec.decode(socket.sent[0]).tick, 3,
    'the next writable WebSocket snapshot replaces every stale pending state');
  transport.close('done');
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
assert.equal(normalizedInput.snapshotAckTick, 0);
assert.equal(Object.hasOwn(normalizedInput, 'ignored'), false);
assert.equal(isSequenceNewer(0, 0x7fffffff), true, 'sequence wrap is newer');
assert.equal(isSequenceNewer(3, 3), false);
assert.equal(normalizePlayerName('  Tank   Commander  '), 'Tank Commander');
assert.equal(automaticPlayerName('stable-browser-id'), automaticPlayerName('stable-browser-id'),
  'automatic callsigns are stable for one browser identity');
assert.notEqual(automaticPlayerName('stable-browser-id'), automaticPlayerName('other-browser-id'),
  'automatic callsigns differentiate independent browser identities');
assert.equal(uniquePlayerName('Commander', ['commander', 'Commander 2']), 'Commander 3');

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

const nameLobby = createLobby({
  roomCode: 'NAM234', hostId: 'name-host', hostName: 'Commander', teamSize: 3,
});
addLobbyPlayer(nameLobby, { id: 'name-a', name: 'commander' });
addLobbyPlayer(nameLobby, { id: 'name-b', name: 'Commander' });
assert.deepEqual([...nameLobby.players.values()].map((player) => player.name),
  ['Commander', 'commander 2', 'Commander 3'],
  'room authority disambiguates duplicate names case-insensitively');
applyLobbyCommand(nameLobby, 'name-b', { type: 'set_name', name: 'COMMANDER 2' });
assert.equal(new Set([...nameLobby.players.values()].map((player) =>
  player.name.toLocaleLowerCase('en-US'))).size, 3,
  'renaming cannot recreate a duplicate callsign');

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
{
  const { client, host } = createLoopbackTransportPair({ direct: true });
  let received = null;
  host.onMessage((message) => { received = message; });
  const message = { type: 'host-local-input' };
  client.send(message);
  assert.equal(received, message,
    'host-local direct transport delivers synchronously without cloning');
  client.close('done');
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

// An unordered state lane may deliver an older envelope sequence after a
// newer reliable message. Snapshot ticks, not cross-lane sequence order, own
// state freshness.
{
  const channel = new FakeChannel();
  const transport = createWebRTCDataChannelTransport(channel);
  const client = new MatchClientRuntime({ transport, playerId: 'driver', clock: () => 100 });
  channel.emit('message', { data: JSON.stringify(createEnvelope(MESSAGE_TYPES.WELCOME, {
    protocolVersion: 1,
    peerId: 'driver',
    tickHz: 60,
    snapshotHz: 20,
    serverTick: 10,
    serverTimeMs: 100,
  }, { seq: 10, tick: 10 })) });
  channel.emit('message', { data: JSON.stringify(createEnvelope(MESSAGE_TYPES.SNAPSHOT,
    captureWorldSnapshot({
      tick: 9,
      serverTimeMs: 90,
      entities: [entity('driver', 'm1a2', 'alpha', 4)],
      viewerId: 'driver',
    }), { seq: 9, tick: 9 })) });
  assert.equal(client.buffer.snapshots.length, 1,
    'state lane remains valid when reliable control arrives first');
  assert.equal(client.lastRecvSeq, 10, 'state lane never rewinds reliable ordering');
  client.close('done');
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
  createDataChannel(label, options = {}) {
    if (!this.channels) this.channels = [];
    const channel = new FakeChannel(label, options);
    channel.readyState = 'connecting';
    this.channels.push(channel);
    return channel;
  }
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
  assert.deepEqual(host.peerConnection.channels.map((channel) => channel.label),
    [MATCH_CONTROL_CHANNEL_LABEL, MATCH_STATE_CHANNEL_LABEL]);
  assert.equal(host.peerConnection.channels[1].ordered, false);
  assert.equal(host.peerConnection.channels[1].maxRetransmits, 0);
  for (const channel of host.peerConnection.channels) {
    channel.readyState = 'open';
    channel.emit('open');
  }
  const negotiatedTransport = await host.transportReady;
  assert.equal(negotiatedTransport.readyState, 'open',
    'match transport becomes ready only after both lanes open');
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

assert.equal(resolveSignalUrl({
  configured: 'wss://signal.example.test/signal',
  hostname: 'cot.example.test',
  protocol: 'https:',
}), 'wss://signal.example.test/signal');
assert.equal(resolveSignalUrl({ hostname: 'cot.example.test', protocol: 'https:' }),
  'wss://cot.example.test/api/signal',
  'production uses the same-origin WebSocket Function');
assert.equal(resolveSignalUrl({ hostname: 'cot.example.test', protocol: 'https:', lan: true }),
  'wss://cot.example.test/api/signal',
  'production LAN uses automatic same-origin rendezvous');
assert.equal(resolveSignalUrl({
  configured: 'wss://signal.example.test/signal',
  hostname: 'cot.example.test',
  protocol: 'https:',
  lan: true,
}), 'wss://signal.example.test/signal', 'LAN honors an explicitly configured signaling service');
assert.equal(resolveSignalUrl({ hostname: '192.168.1.44', protocol: 'http:', lan: true }),
  'ws://192.168.1.44:7777/signal');
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
  socket.receive({
    type: 'room_signal',
    payload: {
      roomCode: 'ABC234',
      fromPeerId: 'p2',
      signal: { kind: 'description', description: { type: 'offer', sdp: 'early-offer' } },
    },
  });
  const earlyEvents = [];
  signaling.onEvent((event) => earlyEvents.push(event));
  assert.equal(earlyEvents[0].payload.signal.description.sdp, 'early-offer',
    'RTC offers received between room_joined and session construction are replayed');
  signaling.sendSignal('p2', { kind: 'ice', candidate: { candidate: 'x' } });
  assert.equal(JSON.parse(socket.sent.at(-1)).type, 'room_signal');
  signaling.close();
}

// Transient distributed-store failures retry without making the player
// reopen the lobby dialog or creating a second WebSocket.
{
  const signaling = new RoomSignalingClient({
    url: 'ws://localhost:7777', WebSocketImpl: FakeWebSocket, requestTimeoutMs: 1000,
  });
  const connecting = signaling.connect();
  const socket = FakeWebSocket.instances.at(-1);
  socket.open();
  await connecting;
  const roomPromise = signaling.createRoom({ player: { id: 'retry', name: 'Retry Host' } });
  await Promise.resolve();
  const first = JSON.parse(socket.sent.at(-1));
  socket.receive({
    type: 'error', requestId: first.requestId,
    payload: { code: 'signaling_store_unavailable', message: 'temporarily unavailable' },
  });
  await new Promise((resolve) => setTimeout(resolve, 275));
  const second = JSON.parse(socket.sent.at(-1));
  assert.equal(second.type, 'room_create');
  assert.notEqual(second.requestId, first.requestId);
  assert.equal(FakeWebSocket.instances.at(-1), socket, 'store retry reuses the open signaling socket');
  socket.receive({
    type: 'room_created', requestId: second.requestId,
    payload: { roomCode: 'RETRY2', peerId: 'retry-peer', hostId: 'retry-peer' },
  });
  assert.equal((await roomPromise).roomCode, 'RETRY2');
  signaling.close();
}

// A failed WebSocket handshake is bounded and the same client can retry.
{
  const signaling = new RoomSignalingClient({
    url: 'ws://localhost:7777', WebSocketImpl: FakeWebSocket,
    connectTimeoutMs: 15, requestTimeoutMs: 100,
  });
  await assert.rejects(signaling.connect(), (error) => error.code === 'signaling_connect_timeout');
  assert.equal(signaling.state, 'closed');
  const retry = signaling.connect();
  FakeWebSocket.instances.at(-1).open();
  await retry;
  assert.equal(signaling.state, 'open', 'a timed-out client may reconnect');
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
  const clientChannel = clientLobby.releaseTransport();
  const earlyMatchClient = new MatchClientRuntime({
    transport: clientChannel,
    playerId: 'guest',
    interpolationDelayMs: 0,
    clock: () => 0,
  });
  earlyMatchClient.connect();
  earlyMatchClient.readyForMatch();
  await Promise.resolve();
  const hostChannels = hostLobby.releaseTransports();
  assert.equal(hostChannels.length, 1);
  assert.equal(hostChannels[0].transport.readyState, 'open');
  assert.equal(hostChannels[0].pendingMessages.length, 2,
    'a fast client handshake is preserved while the host finishes loading');
  const handoffAuthority = new AuthoritativeMatchRuntime({ simulation: createTestSimulation() });
  handoffAuthority.attachPeer({
    peerId: 'guest',
    transport: hostChannels[0].transport,
    metadata: { team: 'bravo' },
  });
  for (const message of hostChannels[0].pendingMessages) {
    handoffAuthority.acceptPeerMessage('guest', message);
  }
  await Promise.resolve();
  assert.equal(earlyMatchClient.connected, true,
    'replayed HELLO completes after authority takes ownership of the channel');
  handoffAuthority.advance(50);
  assert.equal(handoffAuthority.matchStarted, true,
    'replayed READY releases the authoritative readiness barrier');
  earlyMatchClient.close('test_done');
  handoffAuthority.close('test_done');
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

// ACK-based entity deltas preserve full client truth, including visibility
// removals, without retransmitting unchanged tanks.
{
  const base = captureWorldSnapshot({
    tick: 3,
    serverTimeMs: 50,
    entities: [
      entity('moving', 'm1a2', 'alpha', 0),
      entity('stable', 't90m', 'alpha', 10),
      entity('hidden-next', 'leo2a7', 'bravo', 30),
    ],
    viewerId: 'moving',
  });
  const current = captureWorldSnapshot({
    tick: 6,
    serverTimeMs: 100,
    entities: [
      entity('moving', 'm1a2', 'alpha', 1),
      entity('stable', 't90m', 'alpha', 10),
    ],
    viewerId: 'moving',
  });
  const keyframe = createSnapshotDelta(base);
  const delta = createSnapshotDelta(current, base);
  assert.equal(keyframe.baseTick, -1);
  assert.deepEqual(delta.entities.map((entry) => entry.id), ['moving']);
  assert.deepEqual(delta.removedEntityIds, ['hidden-next']);
  assert.ok(JSON.stringify(delta).length < JSON.stringify(createSnapshotDelta(current)).length,
    'unchanged tank rows reduce the wire payload');
  const assembler = new SnapshotAssembler();
  assert.deepEqual(assembler.accept(keyframe).entities.map((entry) => entry.id),
    ['moving', 'stable', 'hidden-next']);
  assert.deepEqual(assembler.accept(delta).entities.map((entry) => entry.id),
    ['moving', 'stable']);
  assert.equal(new SnapshotAssembler().accept(delta), null,
    'a delta without its acknowledged baseline is rejected safely');
}

{
  const full = createSnapshotDelta(captureWorldSnapshot({
    tick: 30,
    serverTimeMs: 500,
    entities: Array.from({ length: 14 }, (_, index) =>
      entity(`tank-${index}`, index % 2 ? 't90m' : 'm1a2',
        index % 2 ? 'bravo' : 'alpha', index * 7)),
    viewerId: 'tank-0',
  }));
  const envelopeValue = createEnvelope(MESSAGE_TYPES.SNAPSHOT, full, { seq: 9, ack: 7, tick: 30 });
  const binary = snapshotWireCodec.encode(envelopeValue);
  const decoded = snapshotWireCodec.decode(binary);
  assert.deepEqual(decoded, envelopeValue, 'compact snapshot codec round-trips the full envelope');
  assert.ok(binary.byteLength < new TextEncoder().encode(JSON.stringify(envelopeValue)).byteLength * 0.7,
    'binary array rows remove at least 30% of full-snapshot JSON bytes');
}

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
const reusedFrame = interpolation.sample(26);
const reusedEntity = reusedFrame.entities[0];
assert.equal(interpolation.sample(27), reusedFrame,
  'render sampling reuses its frame object instead of allocating at 120 Hz');
assert.equal(interpolation.sample(28).entities[0], reusedEntity,
  'render sampling reuses entity objects while updating their values');

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
assert.ok(Math.abs(responsiveFrame.immediateAuthority.entity.x - 0.5) < 0.03,
  'owned prediction receives the raw authority pose instead of its display extrapolation');

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

const adaptive = new SnapshotBuffer({
  interpolationDelayMs: 80,
  maxInterpolationDelayMs: 180,
});
for (const [tickValue, serverTimeMs, receivedAtMs] of [
  [0, 0, 100], [3, 50, 150], [6, 100, 260], [9, 150, 270], [12, 200, 320],
]) {
  adaptive.push(captureWorldSnapshot({
    tick: tickValue,
    serverTimeMs,
    entities: [entity('adaptive', 't90m', 'bravo', tickValue)],
    viewerId: 'adaptive',
  }), receivedAtMs);
}
const burstDelay = adaptive.getStats().interpolationDelayMs;
assert.ok(burstDelay > 80 && burstDelay <= 180,
  `arrival variance raises bounded interpolation delay: ${burstDelay}`);
let stableReceiveAtMs = 320;
for (let index = 5; index < 125; index++) {
  stableReceiveAtMs += 50;
  adaptive.push(captureWorldSnapshot({
    tick: index * 3,
    serverTimeMs: index * 50,
    entities: [entity('adaptive', 't90m', 'bravo', index)],
    viewerId: 'adaptive',
  }), stableReceiveAtMs);
}
const stableStats = adaptive.getStats();
assert.ok(stableStats.interpolationDelayMs < burstDelay,
  'adaptive delay releases gradually after sustained stable delivery');
assert.ok(stableStats.arrivalJitterMs < 1,
  `stable delivery converges measured jitter: ${stableStats.arrivalJitterMs}`);

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

// A pre-handshake packet must be rejected without making a later valid HELLO
// look stale. Real transports are ordered; this defense keeps a simulated or
// hostile first packet from permanently poisoning the connection.
{
  const simulation = createTestSimulation();
  const hostRuntime = new AuthoritativeMatchRuntime({ simulation });
  const transport = createLoopbackTransportPair();
  hostRuntime.attachPeer({ peerId: 'p1', transport: transport.host });
  transport.client.send(createEnvelope(MESSAGE_TYPES.INPUT, {}, { seq: 1, tick: 0 }));
  await Promise.resolve();
  assert.equal(hostRuntime.peers.get('p1').lastRecvSeq, null);
  assert.equal(hostRuntime.stats.invalidMessages, 1);
  transport.client.send(createEnvelope(MESSAGE_TYPES.HELLO, {
    playerId: 'p1', metadata: { team: 'alpha' },
  }, { seq: 0, tick: 0 }));
  await Promise.resolve();
  assert.equal(hostRuntime.peers.get('p1').welcomed, true,
    'valid HELLO recovers after rejected pre-handshake traffic');
  hostRuntime.close();
}

{
  const simulation = createTestSimulation();
  const hostRuntime = new AuthoritativeMatchRuntime({ simulation, maxCatchUpTicks: 8 });
  const p1Transport = createLoopbackTransportPair();
  const p2Transport = createLoopbackTransportPair();
  let stateLaneSends = 0;
  const p1HostTransport = {
    get readyState() { return p1Transport.host.readyState; },
    send(message) { return p1Transport.host.send(message); },
    sendState(message) {
      stateLaneSends++;
      return p1Transport.host.send(message);
    },
    onMessage(listener) { return p1Transport.host.onMessage(listener); },
    onClose(listener) { return p1Transport.host.onClose(listener); },
    close(reason) { return p1Transport.host.close(reason); },
  };
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
  hostRuntime.attachPeer({ peerId: 'p1', transport: p1HostTransport, metadata: { team: 'alpha' } });
  hostRuntime.attachPeer({ peerId: 'p2', transport: p2Transport.host, metadata: { team: 'bravo' } });
  p1.connect();
  p2.connect();
  await Promise.resolve();
  p1.readyForMatch();
  p2.readyForMatch();
  p1.submitInput(input({ throttle: 1 }), 0);
  assert.equal(p1.lastSubmittedInputSeq, 0,
    'client exposes the accepted input sequence for local prediction history');
  await Promise.resolve();
  assert.equal(hostRuntime.advance(50), 3, '50 ms advances exactly three 60 Hz ticks');
  await Promise.resolve();
  const p1Frame = p1.update(50);
  const p2Frame = p2.update(50);
  assert.equal(hostRuntime.stats.snapshots, 2, 'one viewer-specific snapshot per peer');
  assert.equal(hostRuntime.stats.snapshotKeyframes, 2, 'the first state for each peer is a keyframe');
  assert.equal(stateLaneSends, 1, 'authority routes snapshots through a replaceable state lane');
  assert.deepEqual(p1Frame.entities.map((entry) => entry.id), ['p1']);
  assert.deepEqual(p2Frame.entities.map((entry) => entry.id), ['p2']);
  assert.ok(p1Frame.entities[0].x > 0, 'authoritative host applies client input');
  assert.equal(p1Frame.ackInputSeq, 0, 'snapshot acknowledges consumed input sequence');
  assert.equal(p2Frame.ackInputSeq, null,
    'snapshot distinguishes no acknowledged input from sequence zero');
  const clientStats = p1.getStats();
  assert.equal(clientStats.snapshotPacketsReceived, 1,
    'network diagnostics count accepted snapshot packets');
  assert.equal(clientStats.buffer.acceptedSnapshots, 1,
    'network diagnostics expose jitter-buffer health');
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
  assert.ok(hostRuntime.stats.snapshotDeltas >= 2,
    'acknowledged peers receive entity deltas after their first keyframe');
  assert.deepEqual(simulation.actionFrames, [
    PLAYER_ACTION_BITS.REPAIR,
    PLAYER_ACTION_BITS.FIRST_AID,
  ], 'an action bit is consumed once even when one input spans several authority steps');
  hostRuntime.close();
}

// Replaceable state loss must never erase one-shot combat/lifecycle events.
// The first state snapshot is discarded while the reliable control lane stays
// intact; the event drains exactly once when the next state frame catches up.
{
  let pendingEvents = [{ type: 'match_ended', result: 'alpha', timeS: 1 }];
  const simulation = {
    requiredPeerIds: ['event-client'],
    onPeerJoin() {},
    onPeerReady() {},
    onMatchReady() {},
    onPeerLeave() {},
    step() {},
    snapshot({ tick, serverTimeMs, viewerId, ackInputSeq }) {
      return captureWorldSnapshot({
        tick,
        serverTimeMs,
        entities: [entity('event-client', 'm1a2', 'alpha', 0)],
        events: pendingEvents,
        viewerId,
        ackInputSeq,
        meta: { phase: 'playing', result: pendingEvents.length ? 'alpha' : null },
      });
    },
    afterSnapshotBroadcast() { pendingEvents = []; },
  };
  const link = createLoopbackTransportPair({ direct: true });
  let droppedStates = 0;
  const hostTransport = {
    get readyState() { return link.host.readyState; },
    send(message) { return link.host.send(message); },
    sendState(message) {
      if (droppedStates++ === 0) return true;
      return link.host.send(message);
    },
    onMessage(listener) { return link.host.onMessage(listener); },
    onClose(listener) { return link.host.onClose(listener); },
    close(reason) { return link.host.close(reason); },
  };
  const host = new AuthoritativeMatchRuntime({ simulation });
  const client = new MatchClientRuntime({
    transport: link.client,
    playerId: 'event-client',
    interpolationDelayMs: 0,
    clock: () => 0,
  });
  host.attachPeer({ peerId: 'event-client', transport: hostTransport });
  client.connect();
  client.readyForMatch();
  host.advance(50);
  assert.equal(client.update(50), null, 'the event-bearing state packet was actually dropped');
  assert.equal(client.getStats().pendingEventBatches, 1,
    'the reliable event batch survives independently of state loss');
  host.advance(50);
  const recoveredFrame = client.update(100);
  assert.ok(recoveredFrame && recoveredFrame.events.length === 0,
    'replaceable snapshots no longer duplicate reliable events');
  const recoveredEvents = client.drainEventsThrough(recoveredFrame.tick);
  assert.deepEqual(recoveredEvents.map((event) => event.type), ['match_ended']);
  assert.deepEqual(client.drainEventsThrough(recoveredFrame.tick), [],
    'reliable event batches drain exactly once');
  assert.equal(host.stats.reliableEvents, 1);
  client.close('test_done');
  host.close('test_done');
}

// Solo play is the same host/client path, not a direct simulation shortcut.
{
  const simulation = createTestSimulation();
  const session = createLocalMatchSession({ playerId: 'solo', simulation });
  assert.equal(session.role, 'host');
  assert.equal(session.simulation, simulation);
  await Promise.resolve();
  session.ready();
  const frame = await session.advance(50, input({ throttle: 0.5 }));
  assert.equal(session.host.stats.steps, 3);
  assert.equal(frame.entities[0].id, 'solo');
  assert.ok(frame.entities[0].x > 0);
  session.close();
}

console.log('net.selftest: protocol, lobby, loopback, visibility, interpolation, and authority passed');
