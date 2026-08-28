import assert from 'node:assert/strict';
import { createLoopbackTransportPair } from './loopbackTransport.ts';
import {
  beginPrivateClientMatch,
  beginPrivateHostMatch,
  buildPrivateMatchPlayers,
  resolvePrivateMatchMap,
} from './privateMatchHandoff.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { PrivateRoomClientSession, PrivateRoomHostSession } from './privateRoomSession.ts';
import { MatchClientRuntime } from './matchRuntime.ts';
import { MATCH_CONTROL_CHANNEL_LABEL, MATCH_STATE_CHANNEL_LABEL } from './webrtcPeer.ts';
import { addLobbyPlayer, applyLobbyCommand, createLobby, serializeLobby } from './lobby.ts';
import { MAP_IDS } from '../world/maps/index.ts';

class FakeRtcChannel {
  constructor(label) {
    this.label = label;
    this.readyState = 'open';
    this.ordered = label === MATCH_CONTROL_CHANNEL_LABEL;
    this.maxRetransmits = this.ordered ? null : 0;
    this.bufferedAmount = 0;
    this.sent = [];
    this.listeners = new Map();
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  send(value) { this.sent.push(value); }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    for (const listener of this.listeners.get('close') || []) listener();
  }
}

class FakeClientPeerConnection {
  constructor() { this.connectionState = 'connected'; }
  close() { this.connectionState = 'closed'; }
}

class RecoveringClientPeerConnection extends FakeClientPeerConnection {
  static instances = [];
  constructor() {
    super();
    RecoveringClientPeerConnection.instances.push(this);
  }
}

class FakeHostPeerConnection extends FakeClientPeerConnection {
  constructor() {
    super();
    this.localDescription = null;
    this.channels = [];
  }
  createDataChannel(label) {
    const channel = new FakeRtcChannel(label);
    this.channels.push(channel);
    return channel;
  }
  async createOffer() { return { type: 'offer', sdp: 'host-reload-offer' }; }
  async setLocalDescription(description) { this.localDescription = description; }
}

class FakeSignaling {
  constructor() {
    this.listeners = new Set(); this.closed = false; this.signals = [];
    this.restartCalls = 0;
  }
  onEvent(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  sendSignal(peerId, signal, toSessionId) { this.signals.push({ peerId, signal, toSessionId }); }
  restartRoomSession() { this.restartCalls++; return Promise.resolve(true); }
  close() { this.closed = true; }
  emit(message) { for (const listener of [...this.listeners]) listener(message); }
}

async function waitUntil(predicate, timeoutMs = 500) {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error('timed out waiting for test condition');
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

// A first-visit browser can lose its opening RTC generation while signaling,
// modules, or TURN credentials are still warming. The replacement generation
// must resolve the original public ready promise instead of connecting behind
// an already-rejected lobby entry.
{
  RecoveringClientPeerConnection.instances.length = 0;
  const signaling = new FakeSignaling();
  const session = new PrivateRoomClientSession({
    signaling,
    roomInfo: {
      roomCode: 'COLD22', peerId: 'guest', hostId: 'host', mode: 'private',
      peers: [{ peerId: 'host', player: { name: 'Host' }, sessionId: 'host_epoch_1' }],
    },
    RTCPeerConnectionImpl: RecoveringClientPeerConnection,
    connectTimeoutMs: 20,
    initialRebuildDelaysMs: [0],
  });
  const firstPeer = session.peer;
  await waitUntil(() => session.peer !== firstPeer);
  assert.equal(RecoveringClientPeerConnection.instances.length, 2,
    'a timed-out cold generation creates one fresh RTC peer');
  const nextControl = new FakeRtcChannel(MATCH_CONTROL_CHANNEL_LABEL);
  const nextState = new FakeRtcChannel(MATCH_STATE_CHANNEL_LABEL);
  session.peer.peerConnection.ondatachannel({ channel: nextControl });
  session.peer.peerConnection.ondatachannel({ channel: nextState });
  const runtime = await session.ready;
  assert.equal(signaling.restartCalls, 1,
    'cold recovery rotates the signaling epoch before renegotiating');
  assert.equal(runtime.closed, false,
    'the original room-ready promise resolves through the replacement generation');
  session.close('test_done');
}

// A terminal client ICE failure replaces the peer connection, rotates the
// signaling epoch, and revives the existing MatchClientRuntime instead of
// ending the battle or layering another presentation owner over it.
{
  const signaling = new FakeSignaling();
  const states = [];
  let iceRefreshes = 0;
  const session = new PrivateRoomClientSession({
    signaling,
    roomInfo: {
      roomCode: 'RECOV2', peerId: 'guest', hostId: 'host', mode: 'private',
      peers: [{ peerId: 'host', player: { name: 'Host' }, sessionId: 'host_epoch_1' }],
    },
    RTCPeerConnectionImpl: FakeClientPeerConnection,
    failedRebuildDelayMs: 0,
    refreshIceConfiguration: async () => {
      iceRefreshes += 1;
      return {
        iceServers: [{
          urls: 'turn:relay.example.test', username: 'fresh', credential: 'short-lived',
        }],
        relayOnly: false,
        relayAvailable: true,
        expiresInSeconds: 3_600,
      };
    },
    onConnectionState: (state) => states.push(state),
  });
  const firstControl = new FakeRtcChannel(MATCH_CONTROL_CHANNEL_LABEL);
  const firstState = new FakeRtcChannel(MATCH_STATE_CHANNEL_LABEL);
  session.peer.peerConnection.ondatachannel({ channel: firstControl });
  session.peer.peerConnection.ondatachannel({ channel: firstState });
  await session.ready;
  const runtime = session.runtime;
  const firstPeer = session.peer;
  firstPeer.peerConnection.connectionState = 'failed';
  firstPeer.peerConnection.onconnectionstatechange();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.notEqual(session.peer, firstPeer, 'failed ICE creates a replacement RTC peer');
  const nextControl = new FakeRtcChannel(MATCH_CONTROL_CHANNEL_LABEL);
  const nextState = new FakeRtcChannel(MATCH_STATE_CHANNEL_LABEL);
  session.peer.peerConnection.ondatachannel({ channel: nextControl });
  session.peer.peerConnection.ondatachannel({ channel: nextState });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(signaling.restartCalls, 1, 'replacement is announced through durable signaling');
  assert.equal(iceRefreshes, 1,
    'a replacement generation refreshes a missing or expired TURN lease');
  assert.equal(session.runtime, runtime, 'the match client and presentation identity remain stable');
  assert.equal(runtime.closed, false, 'the replacement channel revives the runtime');
  assert.ok(nextControl.sent.length >= 1, 'the revived runtime sends a fresh HELLO');
  assert.deepEqual(states, ['failed']);
  session.close('test_done');
}

// Chromium can report the aggregate PeerConnection as connected after one of
// the split data channels has closed. A previously welcomed match transport is
// terminal in that state and must rebuild instead of leaving a dead runtime.
{
  const signaling = new FakeSignaling();
  const session = new PrivateRoomClientSession({
    signaling,
    roomInfo: {
      roomCode: 'LANE22', peerId: 'guest', hostId: 'host', mode: 'private',
      peers: [{ peerId: 'host', player: { name: 'Host' }, sessionId: 'host_epoch_1' }],
    },
    RTCPeerConnectionImpl: FakeClientPeerConnection,
    failedRebuildDelayMs: 0,
  });
  const firstControl = new FakeRtcChannel(MATCH_CONTROL_CHANNEL_LABEL);
  const firstState = new FakeRtcChannel(MATCH_STATE_CHANNEL_LABEL);
  session.peer.peerConnection.ondatachannel({ channel: firstControl });
  session.peer.peerConnection.ondatachannel({ channel: firstState });
  await session.ready;
  const runtime = session.runtime;
  runtime.connected = true;
  for (const listener of [...runtime.connectionListeners]) listener(true);
  const firstPeer = session.peer;
  firstState.close();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(firstPeer.peerConnection.connectionState, 'closed',
    'closed data lane retires the stale RTC generation');
  assert.notEqual(session.peer, firstPeer,
    'data-lane closure rebuilds even when aggregate RTC state was connected');
  assert.equal(signaling.restartCalls, 1,
    'data-lane recovery rotates the durable signaling epoch');
  session.close('test_done');
}

// A new browser-host runtime reconstructs peer offers from the durable room
// membership returned by signaling. This is the host-side half of reload
// recovery; guests replace their RTC connection when the host epoch changes.
{
  const signaling = new FakeSignaling();
  const session = new PrivateRoomHostSession({
    signaling,
    roomInfo: {
      roomCode: 'HOST22', peerId: 'host', hostId: 'host', mode: 'private',
      peers: [{ peerId: 'guest', player: { name: 'Guest' }, sessionId: 'guest_epoch_1' }],
    },
    hostName: 'Host',
    hostSpecId: 'm1a2',
    RTCPeerConnectionImpl: FakeHostPeerConnection,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(session.peers.has('guest'), true,
    'host reload immediately rebuilds an RTC offer for each retained room member');
  assert.equal(signaling.signals[0]?.peerId, 'guest');
  assert.equal(signaling.signals[0]?.toSessionId, 'guest_epoch_1');
  assert.equal(signaling.signals[0]?.signal?.description?.type, 'offer');
  session.close('test_done');
}

// Match handoff retains rendezvous listening so a refreshed browser can build
// a replacement WebRTC channel into the persistent room. An explicit
// room_closed event still retires gameplay honestly.
{
  const signaling = new FakeSignaling();
  const closeReasons = [];
  const session = new PrivateRoomClientSession({
    signaling,
    roomInfo: { roomCode: 'LIFE22', peerId: 'guest', hostId: 'host', mode: 'private' },
    RTCPeerConnectionImpl: FakeClientPeerConnection,
    onClose: (reason) => closeReasons.push(reason),
  });
  const control = new FakeRtcChannel(MATCH_CONTROL_CHANNEL_LABEL);
  const state = new FakeRtcChannel(MATCH_STATE_CHANNEL_LABEL);
  session.peer.peerConnection.ondatachannel({ channel: control });
  session.peer.peerConnection.ondatachannel({ channel: state });
  await session.ready;
  const released = await session.takeMatchTransport();
  assert.equal(signaling.listeners.size, 1, 'handoff retains signaling for room rejoin');
  signaling.emit({ type: 'room_closed', payload: { roomCode: 'LIFE22', reason: 'host_left' } });
  assert.equal(released.readyState, 'closed', 'an explicitly closed room retires gameplay');
  assert.equal(session.peer.peerConnection.connectionState, 'closed');
  assert.deepEqual(closeReasons, ['host_left'],
    'remote room closure reaches the browser lifecycle owner exactly once');
  released.close('test_done');
}

// A host document reload advertises a different runtime epoch. The guest
// keeps its MatchClientRuntime (and prior lobby selection), but replaces the
// dead peer connection and performs a fresh HELLO on the new channels.
{
  const signaling = new FakeSignaling();
  const session = new PrivateRoomClientSession({
    signaling,
    roomInfo: {
      roomCode: 'EPOCH2', peerId: 'guest', hostId: 'host', mode: 'private',
      peers: [{ peerId: 'host', player: { name: 'Host' }, sessionId: 'host_epoch_1' }],
    },
    RTCPeerConnectionImpl: FakeClientPeerConnection,
  });
  const firstControl = new FakeRtcChannel(MATCH_CONTROL_CHANNEL_LABEL);
  const firstState = new FakeRtcChannel(MATCH_STATE_CHANNEL_LABEL);
  session.peer.peerConnection.ondatachannel({ channel: firstControl });
  session.peer.peerConnection.ondatachannel({ channel: firstState });
  await session.ready;
  const firstPeer = session.peer;
  const runtime = session.runtime;
  runtime.roomState = {
    players: [{
      id: 'guest', specId: 't90m', equipment: ['rammer'], camo: 'digital', team: 'bravo',
    }],
  };
  signaling.emit({
    type: 'peer_joined',
    payload: {
      roomCode: 'EPOCH2', peerId: 'host', player: { name: 'Host' }, sessionId: 'host_epoch_2',
    },
  });
  assert.notEqual(session.peer, firstPeer, 'host epoch replacement creates a new RTC peer');
  const nextControl = new FakeRtcChannel(MATCH_CONTROL_CHANNEL_LABEL);
  const nextState = new FakeRtcChannel(MATCH_STATE_CHANNEL_LABEL);
  session.peer.peerConnection.ondatachannel({ channel: nextControl });
  session.peer.peerConnection.ondatachannel({ channel: nextState });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(session.runtime, runtime, 'presentation state survives peer replacement');
  assert.equal(runtime.closed, false, 'replacement transport revives the client runtime');
  assert.ok(nextControl.sent.length >= 5,
    'replacement channel sends HELLO and retained vehicle, equipment, camo, and team commands');
  session.close('test_done');
}

const remote = createLoopbackTransportPair();
const lobbyState = {
  roomCode: 'ABC234',
  mode: 'lan',
  phase: 'starting',
  mapId: 'random',
  matchSeed: 42,
  players: [
    { id: 'host-1', specId: 'm1a2', team: 'alpha' },
    { id: 'peer-1', specId: 'm1a2', team: 'bravo' },
  ],
};
const privateRandomCoverage = new Set();
for (let matchSeed = 0; matchSeed < 4096; matchSeed++) {
  privateRandomCoverage.add(resolvePrivateMatchMap({ ...lobbyState, matchSeed }));
}
assert.deepEqual(
  [...privateRandomCoverage].sort(),
  [...MAP_IDS].sort(),
  'private/LAN Random Battle seeds can select every registered battlefield',
);
const filled = buildPrivateMatchPlayers({
  ...lobbyState,
  teamSize: 3,
  players: [lobbyState.players[0]],
});
assert.equal(filled.length, 6, 'bot fill reaches the selected team size');
assert.equal(filled.filter((player) => player.bot).length, 5);
assert.deepEqual(
  buildPrivateMatchPlayers({ ...lobbyState, teamSize: 3, players: [lobbyState.players[0]] }),
  filled,
  'bot roster is deterministic from the match seed',
);
const twoByTwo = buildPrivateMatchPlayers({
  ...lobbyState,
  teamSize: 2,
  players: [lobbyState.players[0]],
});
assert.equal(twoByTwo.length, 4, '2v2 creates exactly two authority-owned teams of two');
assert.deepEqual(twoByTwo.map((player) => player.team).sort(),
  ['alpha', 'alpha', 'bravo', 'bravo']);
const hordeRoster = buildPrivateMatchPlayers({
  ...lobbyState,
  gameMode: 'endless_horde',
  teamSize: 4,
  players: [
    { id: 'host-1', specId: 'm1a2', team: 'alpha' },
    { id: 'peer-1', specId: 'challenger3', team: 'bravo' },
  ],
});
assert.equal(hordeRoster.filter((player) => !player.bot).length, 2);
assert.ok(hordeRoster.filter((player) => !player.bot)
  .every((player) => player.team === 'alpha'), 'horde seats all humans cooperatively');
assert.equal(hordeRoster.filter((player) => player.team === 'bravo' && player.bot).length, 4,
  'horde fills only the enemy wave pool with authority-owned bots');
const hostSession = {
  roomInfo: { peerId: 'host-1', mode: 'lan' },
  takeMatchChannels: () => [{ peerId: 'peer-1', transport: remote.host }],
};
const clientSession = {
  roomInfo: { peerId: 'peer-1', mode: 'lan' },
  takeMatchTransport: async () => remote.client,
};
let receivedBattleLimitS = null;
const hosted = beginPrivateHostMatch({
  session: hostSession,
  lobbyState,
  battleLimitS: 120,
  simulationFactory: (options) => {
    receivedBattleLimitS = options.battleLimitS;
    return createAuthoritativeMatch({ ...options, countdownS: 0 });
  },
});
assert.equal(receivedBattleLimitS, 120,
  'browser authority forwards an explicit certification battle limit to the simulation');
assert.equal(hosted.client.connected, true,
  'host-local protocol handshake completes synchronously without a render-frame wait');
assert.equal(hosted.host.maxCatchUpTicks, 6,
  'browser authority retains the render loop\'s complete 100 ms clamp');
assert.equal(hosted.host.maxBacklogTicks, 300,
  'browser authority preserves up to five seconds of stalled match time');
assert.equal(hosted.host.longStallCatchUpTicks, 2,
  'long stalls recover at one extra simulation tick per presented frame');
const joined = await beginPrivateClientMatch({ session: clientSession });
await Promise.resolve();
hosted.ready();
joined.ready();
await Promise.resolve();
const hostFrame = hosted.advance(1000 / 60);
assert.equal(typeof hostFrame?.then, 'undefined',
  'host advance has no Promise or microtask barrier in the render loop');
await Promise.resolve();
assert.equal(joined.client.connected, true, 'client listener catches post-handoff welcome');
assert.equal(hosted.client.connected, true, 'host local player uses the same handshake');
assert.equal(hosted.host.peers.size, 2);
assert.ok(MAP_IDS.includes(hosted.mapId), 'random map resolves from the shared match seed');

joined.submitInput({
  throttle: 1, steer: 0, brake: false, fire: false,
  aimYaw: Math.PI, aimPitch: 0, shellSlot: 0, actionBits: 0,
}, hosted.host.tick);
await Promise.resolve();
for (let i = 0; i < 120; i++) hosted.host.advance(1000 / 60);
await Promise.resolve();
assert.ok(joined.client.buffer.snapshots.length > 0, 'remote receives authoritative snapshots');
assert.ok(hosted.simulation.entityById.get('peer-1').state.speed > 0,
  'remote controls feed host authority');

joined.close('test_done');
hosted.close('test_done');

const observedLobby = {
  roomCode: 'OBS234', mode: 'private', phase: 'starting', mapId: 'verdant',
  matchSeed: 99, teamSize: 1,
  players: [{ id: 'observer-1', name: 'Observer', specId: 'm1a2', team: 'spectator' }],
};
const observedRoster = buildPrivateMatchPlayers(observedLobby);
assert.equal(observedRoster.length, 2);
assert.ok(observedRoster.every((player) => player.bot),
  'spectator-only rooms still receive the selected bot team fill');
const observed = beginPrivateHostMatch({
  session: {
    roomInfo: { peerId: 'observer-1', mode: 'private' },
    takeMatchChannels: () => [],
  },
  lobbyState: observedLobby,
  simulationFactory: (options) => createAuthoritativeMatch({ ...options, countdownS: 0 }),
});
await Promise.resolve();
observed.ready();
await Promise.resolve();
const observerFrame = await observed.advance(50);
assert.equal(observed.host.matchStarted, true,
  'a ready observer releases bot-only authority without a player entity');
assert.deepEqual(observerFrame.entities.map((entity) => entity.id).sort(),
  observedRoster.map((player) => player.id).sort(),
  'observer snapshots include both teams without spotting redaction');
observed.close('test_done');

// A room survives its first result, enforces ready-time vehicle locking, and
// starts round two on the same transports without another signaling handoff.
{
  const link = createLoopbackTransportPair();
  const lobby = createLobby({
    roomCode: 'ROUND2', hostId: 'host-r', hostName: 'Host', hostSpecId: 'm1a2', teamSize: 1,
  });
  addLobbyPlayer(lobby, { id: 'guest-r', name: 'Guest', team: 'bravo', specId: 't90m' });
  applyLobbyCommand(lobby, 'host-r', { type: 'set_ready', ready: true });
  applyLobbyCommand(lobby, 'guest-r', { type: 'set_ready', ready: true });
  applyLobbyCommand(lobby, 'host-r', { type: 'start', matchSeed: 711 });
  let factoryCalls = 0;
  const simulationFactory = ({ players }) => {
    const shouldFinish = factoryCalls++ === 0;
    let result = null;
    return {
      requiredPeerIds: players.filter((player) => !player.bot && player.team !== 'spectator')
        .map((player) => player.id),
      get result() { return result; },
      get resultReason() { return result ? 'elimination' : null; },
      onPeerJoin() {}, onPeerLeave() {}, onPeerReady() {}, onMatchReady() {},
      step() { if (shouldFinish) result = 'alpha'; },
      snapshot({ tick, serverTimeMs, ackInputSeq }) {
        return {
          tick, serverTimeMs, ackInputSeq, entities: [], shells: [], events: [],
          meta: { phase: result ? 'ended' : 'playing', result },
        };
      },
    };
  };
  const hostSession = {
    roomInfo: { peerId: 'host-r', mode: 'private' },
    lobby,
    isVehicleAllowed: () => true,
    takeMatchChannels: () => [{ peerId: 'guest-r', transport: link.host }],
  };
  const clientSession = {
    roomInfo: { peerId: 'guest-r', mode: 'private' },
    takeMatchTransport: async () => link.client,
  };
  const hostedRound = beginPrivateHostMatch({
    session: hostSession,
    lobbyState: serializeLobby(lobby),
    simulationFactory,
  });
  const joinedRound = await beginPrivateClientMatch({ session: clientSession });
  await Promise.resolve();
  hostedRound.ready();
  joinedRound.ready();
  await Promise.resolve();
  hostedRound.advance(50);
  await Promise.resolve();
  assert.equal(hostedRound.client.roomState.phase, 'waiting');
  assert.equal(joinedRound.client.roomState.phase, 'waiting');
  assert.ok(hostedRound.client.roomState.players.every((player) => !player.ready),
    'completed round resets every rematch vote but retains the room roster');

  // Simulate a guest document reload after the result: the old transport
  // leaves, the stable browser id rejoins through a fresh channel, and the
  // authority sends the still-live waiting room without rebuilding it.
  joinedRound.close('page_reload');
  await Promise.resolve();
  assert.equal(hostedRound.client.roomState.players.find(
    (player) => player.id === 'guest-r')?.connected, false,
  'an unclean page loss reserves the room seat while RTC is replaced');
  const reloadLink = createLoopbackTransportPair();
  hostedRound.host.rejoinPeer({
    peerId: 'guest-r',
    transport: reloadLink.host,
    player: { name: 'Guest' },
    metadata: { mode: 'private' },
  });
  const rejoinedRound = new MatchClientRuntime({ transport: reloadLink.client, playerId: 'guest-r' });
  rejoinedRound.connect({ mode: 'private', resumed: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(rejoinedRound.roomState.phase, 'waiting');
  assert.equal(rejoinedRound.roomState.players.find(
    (player) => player.id === 'guest-r')?.connected, true,
  'reload reattaches the stable player id to the persistent room');
  rejoinedRound.submitRoomCommand({ type: 'select_vehicle', specId: 't90m' });
  await Promise.resolve();

  hostedRound.roomCommand({ type: 'set_ready', ready: true });
  hostedRound.roomCommand({ type: 'select_vehicle', specId: 't90m' });
  assert.equal(hostedRound.client.errors.at(-1)?.code, 'vehicle_locked',
    'authority rejects a tank swap while the commander is ready');
  rejoinedRound.submitRoomCommand({ type: 'set_ready', ready: true });
  await Promise.resolve();
  hostedRound.roomCommand({ type: 'start', matchSeed: 712 });
  await Promise.resolve();
  const roundTwo = hostedRound.client.roomState;
  assert.equal(roundTwo.phase, 'starting');
  assert.equal(roundTwo.round, 2);
  assert.equal(rejoinedRound.readySent, false,
    'new room round re-arms the client asset-ready barrier');
  rejoinedRound.readyForMatch(); // may arrive before the host finishes loading the map
  hostedRound.prepareRound({ lobbyState: roundTwo });
  hostedRound.ready();
  await Promise.resolve();
  hostedRound.advance(50);
  await Promise.resolve();
  assert.equal(hostedRound.host.matchStarted, true);
  assert.equal(hostedRound.client.roomState.phase, 'playing');
  assert.equal(hostedRound.host.peers.size, 2, 'round two reuses both established peers');
  rejoinedRound.close('test_done');
  hostedRound.close('test_done');
}

console.log('privateMatchHandoff.selftest: handoff, persistent room, and rematch passed');
