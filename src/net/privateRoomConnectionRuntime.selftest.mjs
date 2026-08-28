import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPrivateRoomConnectionRuntime } from './privateRoomConnectionRuntime.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function harness({ deferClientReady = false } = {}) {
  const calls = [];
  const createdSignals = [];
  const hostStarts = [];
  const clientCloses = [];
  const errors = [];
  const roomRequest = deferred();
  const iceRequest = deferred();
  const clientReadyRequest = deferred();
  let stateListener = null;

  const signaling = {
    createRoom: (request) => { calls.push(['create-room', request]); return roomRequest.promise; },
    joinRoom: (request) => { calls.push(['join-room', request]); return roomRequest.promise; },
    close: (reason) => calls.push(['signal-close', reason]),
  };
  const hostRuntime = {
    onState(listener) { stateListener = listener; return () => { stateListener = null; }; },
  };
  const clientRuntime = {
    roomState: { roomCode: 'ABC123', phase: 'waiting', players: [] },
    onState(listener) { stateListener = listener; return () => { stateListener = null; }; },
  };
  const hostSession = {
    roomInfo: null,
    lobby: { roomCode: 'ABC123', phase: 'waiting', players: new Map() },
    runtime: hostRuntime,
    command: (command) => calls.push(['host-command', command]),
    close: (reason) => calls.push(['host-close', reason]),
  };
  const clientSession = {
    roomInfo: null,
    ready: deferClientReady ? clientReadyRequest.promise : Promise.resolve(clientRuntime),
    submit: (command) => calls.push(['client-command', command]),
    close: (reason) => calls.push(['client-close', reason]),
  };
  let hostOptions = null;
  let clientOptions = null;
  const adapters = {
    createSignaling(url) {
      createdSignals.push(url);
      return signaling;
    },
    createHostSession(options) {
      hostOptions = options;
      hostSession.roomInfo = options.roomInfo;
      return hostSession;
    },
    createClientSession(options) {
      clientOptions = options;
      clientSession.roomInfo = options.roomInfo;
      return clientSession;
    },
    serializeLobby(lobby) {
      return { roomCode: lobby.roomCode, phase: lobby.phase, players: [] };
    },
  };
  const runtime = createPrivateRoomConnectionRuntime({
    loadIce: () => iceRequest.promise,
    isVehicleAllowed: () => true,
    isCamoAllowed: () => true,
    isMapAllowed: () => true,
    onHostStart: (state, connection) => hostStarts.push([state, connection.role]),
    onClientClose: (reason) => clientCloses.push(reason),
    onError: (error) => errors.push(error),
  }, adapters);
  return {
    runtime,
    calls,
    createdSignals,
    hostStarts,
    clientCloses,
    errors,
    roomRequest,
    iceRequest,
    clientReadyRequest,
    hostSession,
    clientSession,
    clientRuntime,
    get hostOptions() { return hostOptions; },
    get clientOptions() { return clientOptions; },
    emitState(state) { stateListener?.(state); },
  };
}

const request = {
  kind: 'create',
  mode: 'private',
  signalUrl: 'wss://example.test/api/signal',
  player: { id: 'player-host', name: 'Host' },
  selection: {
    specId: 'm1a2',
    mapId: 'winter',
    equipment: ['rammer'],
    camo: 'factory',
  },
  teamSize: 2,
};
const host = harness();
const hostPending = host.runtime.connect(request);
assert.equal(host.runtime.connecting, true);
host.roomRequest.resolve({
  roomCode: 'ABC123', peerId: 'player-host', hostId: 'player-host', mode: 'private',
});
host.iceRequest.resolve({
  iceServers: [{ urls: 'turn:relay.test' }],
  relayOnly: false,
  relayAvailable: true,
  source: 'service',
});
const hostConnection = await hostPending;
assert.equal(hostConnection.role, 'host');
assert.equal(host.runtime.current, hostConnection);
assert.equal(host.runtime.connecting, false);
assert.deepEqual(host.hostOptions.hostEquipment, ['rammer']);
const hostStates = [];
host.runtime.observe((state) => hostStates.push(state));
assert.equal(hostStates[0].roomCode, 'ABC123', 'host publishes its canonical initial lobby');
host.hostOptions.onStart({ phase: 'starting', players: [] });
assert.deepEqual(host.hostStarts, [[{ phase: 'starting', players: [] }, 'host']]);
host.runtime.close('host_done');
host.runtime.close('host_done_again');
assert.equal(host.calls.filter(([name]) => name === 'host-close').length, 1,
  'connected session teardown is idempotent');

const resumed = harness();
const resumedPending = resumed.runtime.connect({ ...request, kind: 'join', roomCode: 'ABC123' });
resumed.roomRequest.resolve({
  roomCode: 'ABC123', peerId: 'player-host', hostId: 'player-host', mode: 'private',
});
resumed.iceRequest.resolve({ iceServers: [], relayOnly: false, relayAvailable: false, source: 'lan' });
assert.equal((await resumedPending).role, 'host',
  'a stable host identity rebuilds authority instead of joining itself as a guest');
resumed.runtime.close('resumed_done');

const guest = harness();
const guestPending = guest.runtime.connect({
  ...request,
  kind: 'join',
  roomCode: 'ABC123',
  player: { id: 'player-guest', name: 'Guest' },
});
guest.roomRequest.resolve({
  roomCode: 'ABC123', peerId: 'player-guest', hostId: 'player-host', mode: 'private',
});
guest.iceRequest.resolve({ iceServers: [], relayOnly: false, relayAvailable: false, source: 'lan' });
const guestConnection = await guestPending;
assert.equal(guestConnection.role, 'client');
assert.deepEqual(guest.calls.filter(([name]) => name === 'client-command').map(([, command]) => command.type), [
  'select_vehicle', 'select_equipment', 'select_camo',
], 'cold guests replay the complete selection in reliable command order');
const guestStates = [];
guest.runtime.observe((state) => guestStates.push(state));
assert.equal(guestStates[0].roomCode, 'ABC123');
guest.clientOptions.onClose('host_closed');
assert.deepEqual(guest.clientCloses, ['host_closed']);
guest.runtime.close('already_closed', { transportAlreadyClosed: true });
assert.equal(guest.calls.filter(([name]) => name === 'client-close').length, 0,
  'an already-closed transport is forgotten without a second teardown');

const canceled = harness();
const canceledPending = canceled.runtime.connect(request);
canceled.runtime.close('mode_changed');
canceled.roomRequest.resolve({
  roomCode: 'LATE12', peerId: 'player-host', hostId: 'player-host', mode: 'private',
});
canceled.iceRequest.resolve({ iceServers: [], relayOnly: false, relayAvailable: false, source: 'lan' });
assert.equal(await canceledPending, null, 'a late room response cannot publish after mode change');
assert.equal(canceled.runtime.current, null);
assert.ok(canceled.calls.some(([name, reason]) =>
  name === 'signal-close' && reason === 'mode_changed'));

const clientReadyCanceled = harness({ deferClientReady: true });
const clientReadyPending = clientReadyCanceled.runtime.connect({
  ...request,
  kind: 'join',
  roomCode: 'ABC123',
  player: { id: 'late-guest', name: 'Late Guest' },
});
clientReadyCanceled.roomRequest.resolve({
  roomCode: 'ABC123', peerId: 'late-guest', hostId: 'player-host', mode: 'private',
});
clientReadyCanceled.iceRequest.resolve({
  iceServers: [], relayOnly: false, relayAvailable: false, source: 'lan',
});
while (!clientReadyCanceled.clientOptions) await new Promise((resolve) => setImmediate(resolve));
clientReadyCanceled.runtime.close('modal_closed');
clientReadyCanceled.clientReadyRequest.resolve(clientReadyCanceled.clientRuntime);
assert.equal(await clientReadyPending, null,
  'closing during cold peer readiness cannot publish the late runtime');
assert.equal(clientReadyCanceled.calls.filter(([name]) => name === 'client-close').length, 1,
  'the canceled peer-ready generation closes exactly once');

const failed = harness();
const failedPending = failed.runtime.connect(request);
failed.roomRequest.reject(new Error('signaling unavailable'));
failed.iceRequest.resolve({ iceServers: [], relayOnly: false, relayAvailable: false, source: 'lan' });
await assert.rejects(failedPending, /signaling unavailable/);
assert.equal(failed.runtime.current, null);
assert.ok(failed.calls.some(([name, reason]) =>
  name === 'signal-close' && reason === 'connection_failed'));

assert.deepEqual(host.errors, []);
const playMenuSource = await readFile(new URL('../ui/playMenu.ts', import.meta.url), 'utf8');
assert.match(playMenuSource, /createPrivateRoomConnectionRuntime\(\{/,
  'the play menu delegates private and LAN acquisition to the typed lifecycle owner');
assert.doesNotMatch(playMenuSource, /new RoomSignalingClient|new PrivateRoom(?:Host|Client)Session/,
  'the UI cannot reconstruct the signaling/session lifecycle in parallel');
assert.match(playMenuSource, /privateRoomConnection\.forget\(\);[\s\S]{0,80}activeRoom = adapter/,
  'battle handoff relinquishes menu ownership without closing the live transport');
console.log('privateRoomConnectionRuntime.selftest: host resume, cold join, cancellation and teardown passed');
