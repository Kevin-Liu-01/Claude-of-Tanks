import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBattleEntryLifecycle } from '../game/battleEntryLifecycle.ts';
import { createGarageReturnRuntime } from '../game/garageReturnRuntime.ts';
import { createNetworkBattleLaunchRuntime } from './networkBattleLaunchRuntime.ts';
import { throwIfNetworkBattleEntryAborted } from './networkBattleEntryAbort.ts';
import { createNetworkRoundLifecycle } from './networkRoundLifecycle.ts';

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
    onPrivateEntryFailure: (reason, mode) => calls.push(['roomFailure', reason, mode]),
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
assert.deepEqual(failed.calls.at(-1), ['roomFailure', 'connection_failed', 'private'],
  'cold failure restores Garage before showing an actionable error');

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
cancelledRuntime.cancel('host_left');
assert.equal(cancelSignal.aborted, true);
assert.equal(await cancelledEntry, false);
assert.ok(cancelled.calls.some(([name, reason]) =>
  name === 'close' && reason === 'entry_cancelled'));
assert.ok(!cancelled.calls.some(([name, value]) => name === 'failure' && value),
  'intentional cancellation does not overwrite entry diagnostics');
assert.ok(!cancelled.calls.some(([name]) => name === 'error'),
  'intentional cancellation does not report a false load failure');
assert.deepEqual(cancelled.calls.at(-1), ['roomFailure', 'host_left', 'private'],
  'host departure during loading is presented only after the launcher restores Garage');

const leaving = createHarness({ loadPrivateMatch: () => {
  leavingRuntime.cancel('left_room');
  throw new Error('cancelled');
} });
const leavingRuntime = createNetworkBattleLaunchRuntime(leaving.options);
await leavingRuntime.beginPrivate({
  role: 'client', session: { roomInfo: { peerId: 'friend' } }, lobbyState: state,
});
assert.ok(!leaving.calls.some(([name]) => name === 'roomFailure'),
  'intentional departure must not display a broken-room error');

for (const entryKind of ['private', 'rematch']) {
  const late = createHarness();
  let lateRuntime;
  const present = late.options.presentBattle;
  late.options.presentBattle = async (request) => {
    await present(request);
    // A renderer promise may fulfill after its last internal abort check.
    lateRuntime.cancel('host_left');
  };
  lateRuntime = createNetworkBattleLaunchRuntime(late.options);
  if (entryKind === 'rematch') late.match = { playerId: 'host', role: 'host' };
  const result = entryKind === 'private'
    ? await lateRuntime.beginPrivate({ role: 'host',
      session: { roomInfo: { peerId: 'host' }, takeMatchChannels: () => [] }, lobbyState: state })
    : await lateRuntime.beginRematch(rematchState);
  assert.equal(result, false, `${entryKind}: a late abort cannot publish successful entry`);
  assert.equal(late.match, null);
  assert.equal(late.calls.filter(([name]) => name === 'close').length, 1);
  assert.equal(late.calls.filter(([name]) => name === 'garage').length, 1);
  assert.equal(late.calls.some(([name]) => name === 'attach'), false);
  assert.deepEqual(late.calls.filter(([name]) => name === 'roomFailure'),
    [['roomFailure', 'host_left', 'private']]);
}

// Exercise the actual main callback with real entry, round, and Garage owners.
// Importing all of main would require WebGL; only this synchronous wiring seam
// is extracted, so a future direct garageReturn.leave alias regresses this test.
const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const returnCallbackSource = mainSource.split('const leaveBattleToGarage = ')[1]
  .split('\nconst soloBattleEntry =')[0];
const createReturnCallback = new Function('networkComposition', 'input', 'garageReturn',
  `return ${returnCallbackSource.replace('(): Promise<void> =>', '() =>')}`);

function createEntryGarage(game, lifecycle, round, getMatch, calls) {
  const noop = () => {};
  return createGarageReturnRuntime({
    game, getSelectedSpecId: () => 'm1a2',
    presentation: {
      setAdaptiveSuspended: noop, clearBattle: noop, resetBattleTank: noop,
      suspendEffects: noop, setShotMode: noop, setCaptureHidden: noop,
      unfreezeEffects: noop, resetHudFrame: noop,
    },
    network: {
      shouldPreserveRoom: () => !!getMatch(),
      disposePresentation: round.disposePresentation, closeMatch: round.close,
    },
    warm: { invalidate: noop, cancel: noop, setPending: noop },
    work: { noteActivity: noop, resetFramePacer: noop, scheduleDressing: noop },
    world: {
      currentMapId: () => 'verdant', ensureGaragePlacement: noop,
      setDormant: noop, setFarCascadeDormant: noop, clearCamoOverrides: noop,
    },
    roster: { adoptBattlePlayer: () => null, clearBattle: noop, repaintHero: noop },
    settings: { isOpen: () => false, close: noop },
    ui: {
      setGarageSpots: noop, setGarageSunTrim: noop, emitGaragePhase: noop,
      hideEndOverlay: noop, exitPointerLock: noop, hideHud: noop,
      showGarage: () => calls.push(['garage']), poseGarageCamera: noop,
      startShowroom: noop, triggerBattle: noop,
    },
    audio: { ambientOn: noop, playGarageSting: noop },
    transition: { run: async (work) => work() },
    restoreGaragePresentation: async () => ({}),
    isBattleEntryPending: () => lifecycle.pending,
    isBattleEntryCovering: () => lifecycle.renderingCovered,
  });
}

for (const entryKind of ['private', 'rematch']) {
  const entry = createHarness();
  const game = { phase: 'battle', preBattleS: 0, mapId: 'verdant' };
  const lifecycle = createBattleEntryLifecycle({ nextFrame: async () => {} });
  let launcher;
  const round = createNetworkRoundLifecycle({
    game, getEntryOwner: () => launcher, getRoomOwner: () => null,
    session: {
      close: entry.options.closeMatch, clearRound: entry.options.clearNetworkRound,
      disposePresentation: entry.options.disposePresentation,
    },
  });
  const garage = createEntryGarage(game, lifecycle, round, () => entry.match, entry.calls);
  let releaseModule;
  const module = await entry.options.loadPrivateMatch();
  entry.options.loadPrivateMatch = () => new Promise((resolve) => {
    releaseModule = () => resolve(module);
  });
  entry.options.lifecycle = lifecycle;
  entry.options.closeMatch = round.close;
  entry.options.enterGarage = garage.enter;
  entry.options.presentBattle = async (request) => {
    throwIfNetworkBattleEntryAborted(request.signal);
    await request.connectMatch();
    game.phase = 'battle';
    entry.calls.push(['activate']);
  };
  launcher = createNetworkBattleLaunchRuntime(entry.options);
  assert.equal(launcher.pending, false);
  if (entryKind === 'rematch') entry.match = { playerId: 'host', role: 'host' };
  const starting = entryKind === 'rematch' ? launcher.beginRematch(rematchState)
    : launcher.beginPrivate({ role: 'host', lobbyState: state,
      session: { roomInfo: { peerId: 'host' }, takeMatchChannels: () => [] } });
  assert.equal(launcher.pending, true);
  const returnToGarage = createReturnCallback({ current: { launcher, round } },
    { setEnabled: (value) => entry.calls.push(['input', value]) }, garage);
  await returnToGarage();
  assert.equal(launcher.pending, true, 'cancellation retains entry ownership until cleanup finishes');
  assert.equal(entry.calls.filter(([name]) => name === 'garage').length, 0,
    'explicit Return delegates pending-entry cleanup rather than starting a second restore');
  releaseModule();
  assert.equal(await starting, false);
  assert.equal(launcher.pending, false);
  assert.equal(game.phase, 'garage');
  assert.equal(entry.calls.filter(([name]) => name === 'garage').length, 1);
  assert.equal(entry.calls.some(([name]) => name === 'activate'), false,
    `${entryKind}: an old entry cannot reactivate after the player returns to Garage`);
  assert.equal(entry.calls.some(([name]) => name === 'roomFailure'), false);

  // Normal exits still retain a healthy room instead of converting Return into
  // Leave Room. A generic lifecycle.pending flag must not classify solo entry.
  game.phase = 'battle';
  entry.match = { playerId: 'host', role: 'host' };
  const retained = entry.match;
  let releaseSolo;
  const soloEntry = lifecycle.run(() => new Promise((resolve) => { releaseSolo = resolve; }), false);
  assert.equal(lifecycle.pending, true);
  assert.equal(launcher.pending, false);
  await returnToGarage();
  assert.equal(entry.match, retained, 'only an actual pending network entry closes the room');
  assert.equal(game.phase, 'garage');
  releaseSolo(true);
  await soloEntry;
}

console.log('networkBattleLaunchRuntime.selftest: private, rematch, ranked, failure, and cancellation paths pass');
