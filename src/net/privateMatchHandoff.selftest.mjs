import assert from 'node:assert/strict';
import { createLoopbackTransportPair } from './loopbackTransport.js';
import {
  beginPrivateClientMatch,
  beginPrivateHostMatch,
  buildPrivateMatchPlayers,
} from './privateMatchHandoff.js';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.js';

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
const hostSession = {
  roomInfo: { peerId: 'host-1', mode: 'lan' },
  takeMatchChannels: () => [{ peerId: 'peer-1', transport: remote.host }],
};
const clientSession = {
  roomInfo: { peerId: 'peer-1', mode: 'lan' },
  takeMatchTransport: async () => remote.client,
};
const hosted = beginPrivateHostMatch({
  session: hostSession,
  lobbyState,
  simulationFactory: (options) => createAuthoritativeMatch({ ...options, countdownS: 0 }),
});
assert.equal(hosted.client.connected, true,
  'host-local protocol handshake completes synchronously without a render-frame wait');
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
assert.ok(['verdant', 'desert', 'winter', 'urban', 'coastal', 'autumn', 'steppe', 'railyard']
  .includes(hosted.mapId), 'random map resolves from the shared match seed');

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

console.log('privateMatchHandoff.selftest: listener-safe player and spectator handoff passed');
