import assert from 'node:assert/strict';
import { createNetworkBattleLaunchRuntime } from './networkBattleLaunchRuntime.ts';
import { throwIfNetworkBattleEntryAborted } from './networkBattleEntryAbort.ts';

function createHarness(overrides = {}) {
  const calls = [];
  let match = null;
  const room = {
    attach: (state) => calls.push(['attach', state.round || 0]),
    claimRematch: (_state, blocked) => !blocked,
    finishRematch: () => calls.push(['finishRematch']),
  };
  const privateModule = {
    resolvePrivateMatchMap: (state) => state.mapId === 'random' ? 'verdant' : state.mapId,
    buildPrivateMatchPlayers: (state) => state.players,
    beginPrivateHostMatch: (options) => {
      calls.push(['hostConnect', options.worldCollision]);
      return { playerId: 'host', role: 'host', prepareRound: (next) => {
        calls.push(['prepareRound', next.worldCollision]);
      } };
    },
    beginPrivateClientMatch: () => ({ playerId: 'client', role: 'client' }),
  };
  const options = {
    lifecycle: {
      pending: false,
      run: async (task) => task(),
      coverRendering: () => calls.push(['cover']),
      uncoverRendering: () => calls.push(['uncover']),
      primeReveal: async () => calls.push(['primeReveal']),
    },
    battleLoad: {
      show: (value) => calls.push(['show', value]),
      progress: (fraction, label) => calls.push(['progress', fraction, label]),
      hide: async () => calls.push(['hide']),
    },
    audio: {
      resume: () => calls.push(['resume']),
      loadingOn: (active) => calls.push(['loading', active]),
    },
    getMatch: () => match,
    getRoomCoordinator: () => room,
    getWorldCollision: () => 'world-collision',
    getMapPresentation: (mapId, fallback) => ({
      name: mapId ? `Map ${mapId}` : fallback,
      thumb: mapId ? `${mapId}.webp` : '',
      biome: mapId || 'none',
    }),
    rosterRows: (state, team, viewerId) => state.players
      .filter((player) => player.team === team)
      .map((player) => ({ id: player.id, isPlayer: player.id === viewerId })),
    emitBattleStart: (payload) => calls.push(['battleStart', payload]),
    resetBattleState: () => calls.push(['reset']),
    presentBattle: async (request) => {
      calls.push(['present', request.modeLabel, request.mapId]);
      match = await request.connectMatch();
    },
    loadPrivateMatch: async () => privateModule,
    loadDedicatedMatch: async () => ({
      beginDedicatedClientMatch: (request) => {
        calls.push(['dedicatedConnect', request.url]);
        request.onStatus({ state: 'connected' });
        return { playerId: request.ticket.playerId, role: 'client' };
      },
    }),
    disposePresentation: () => calls.push(['disposePresentation']),
    clearNetworkRound: () => calls.push(['clearRound']),
    closeMatch: (reason) => { calls.push(['close', reason]); match = null; },
    enterGarage: () => calls.push(['garage']),
    setNetworkStatus: (status) => calls.push(['status', status]),
    recordEntryFailure: (failure) => calls.push(['failure', failure]),
    reportError: (scope, error) => calls.push(['error', scope, error.message]),
    ...overrides,
  };
  return {
    calls,
    room,
    options,
    get match() { return match; },
    set match(value) { match = value; },
  };
}

const state = {
  roomCode: 'ABC123',
  mode: 'private',
  phase: 'starting',
  round: 1,
  mapId: 'verdant',
  players: [
    { id: 'host', team: 'alpha', specId: 'm1a1' },
    { id: 'friend', team: 'bravo', specId: 't90m' },
  ],
};

const host = createHarness();
const runtime = createNetworkBattleLaunchRuntime(host.options);
assert.equal(await runtime.beginPrivate({
  role: 'host',
  session: { roomInfo: { peerId: 'host' }, takeMatchChannels: () => [] },
  lobbyState: state,
}), true);
assert.equal(host.match.role, 'host');
assert.equal(host.calls[0]?.[0], 'cover',
  'private entry covers rendering before its first lazy acquisition');
assert.ok(host.calls.some(([name]) => name === 'battleStart'));
assert.ok(host.calls.some(([name, world]) => name === 'hostConnect' && world === 'world-collision'));
assert.ok(host.calls.some(([name]) => name === 'attach'),
  'successful private entry retains the room coordinator');

const invalidHandoff = createHarness();
const invalidHandoffRuntime = createNetworkBattleLaunchRuntime(invalidHandoff.options);
assert.equal(await invalidHandoffRuntime.beginPrivate({
  role: 'host', session: { roomInfo: { peerId: 'host' } }, lobbyState: state,
}), false);
assert.match(
  invalidHandoff.calls.find(([name, value]) => name === 'failure' && value)?.[1]?.message || '',
  /host session cannot enter match mode/,
  'a weak cold-session adapter fails visibly before match publication',
);

const rematchState = { ...state, round: 2 };
assert.equal(await runtime.beginRematch(rematchState), true);
assert.ok(host.calls.some(([name]) => name === 'disposePresentation'));
assert.ok(host.calls.some(([name]) => name === 'clearRound'));
assert.ok(host.calls.some(([name, world]) => name === 'prepareRound' && world === 'world-collision'));
assert.ok(host.calls.some(([name]) => name === 'finishRematch'));
assert.ok(host.calls.filter(([name]) => name === 'cover').length >= 2,
  'rematch entry reacquires the covered rendering owner');

host.match = null;
await runtime.beginRanked({
  serviceUrl: 'wss://ranked.example',
  state: {
    match: {
      playerId: 'host',
      mapId: 'desert',
      roster: [
        { id: 'host', team: 'alpha', specId: 'm1a1', rating: 1420 },
        { id: 'enemy', team: 'bravo', specId: 't90m' },
      ],
    },
  },
});
assert.ok(host.calls.some(([name, url]) =>
  name === 'dedicatedConnect' && url === 'wss://ranked.example'));
assert.ok(host.calls.some(([name, status]) =>
  name === 'status' && status.state === 'connected'));
assert.ok(host.calls.filter(([name]) => name === 'cover').length >= 3,
  'ranked entry shares the covered rendering owner');

const failed = createHarness({
  loadPrivateMatch: async () => { throw new Error('cold chunk unavailable'); },
});
const failedRuntime = createNetworkBattleLaunchRuntime(failed.options);
assert.equal(await failedRuntime.beginPrivate({
  role: 'client', session: { roomInfo: { peerId: 'friend' } }, lobbyState: state,
}), false);
const diagnostic = failed.calls.find(([name, value]) => name === 'failure' && value)?.[1];
assert.equal(diagnostic.message, 'cold chunk unavailable');
assert.equal(diagnostic.role, 'client');
assert.deepEqual(diagnostic.peers, []);
assert.ok(failed.calls.some(([name, reason]) => name === 'close' && reason === 'entry_failed'));
assert.ok(failed.calls.some(([name]) => name === 'hide'));
assert.ok(failed.calls.some(([name]) => name === 'garage'));
assert.ok(failed.calls.some(([name]) => name === 'uncover'),
  'failed cold entry releases the render cover before restoring Garage');

let cancelSignal = null;
let presentStarted;
const presentStartedP = new Promise((resolve) => { presentStarted = resolve; });
const cancelled = createHarness({
  presentBattle: (request) => new Promise((resolve, reject) => {
    cancelSignal = request.signal;
    presentStarted();
    request.signal.addEventListener('abort', () => {
      try {
        throwIfNetworkBattleEntryAborted(request.signal);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, { once: true });
  }),
});
const cancelledRuntime = createNetworkBattleLaunchRuntime(cancelled.options);
const cancelledEntry = cancelledRuntime.beginPrivate({
  role: 'client', session: { roomInfo: { peerId: 'friend' } }, lobbyState: state,
});
await presentStartedP;
cancelledRuntime.cancel('room closed during cold entry');
assert.equal(cancelSignal.aborted, true);
assert.equal(await cancelledEntry, false);
assert.ok(cancelled.calls.some(([name, reason]) =>
  name === 'close' && reason === 'entry_cancelled'));
assert.ok(!cancelled.calls.some(([name, value]) => name === 'failure' && value),
  'intentional cancellation does not overwrite entry diagnostics');
assert.ok(!cancelled.calls.some(([name]) => name === 'error'),
  'intentional cancellation does not report a false load failure');

console.log('networkBattleLaunchRuntime.selftest: private, rematch, ranked, failure, and cancellation paths pass');
