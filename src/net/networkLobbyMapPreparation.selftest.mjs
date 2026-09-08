import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { createNetworkRoomCoordinator } from './networkRoomCoordinator.ts';
import { createNetworkLobbyPreloader } from './networkLobbyPreloader.ts';
import { createWorldBuildCoordinator } from '../world/worldBuildCoordinator.ts';

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function waiting(mapId = 'winter', overrides = {}) {
  return {
    roomCode: 'ABC123', mode: 'private', gameMode: 'standard', phase: 'waiting',
    hostId: 'host', maxPlayers: 2, maxSpectators: 2, allowTeamSwitch: true,
    locked: false, round: 1, mapId, teamSize: 1, revision: 1,
    matchSeed: null, lastResult: null,
    players: ['host', 'guest'].map((id, index) => ({
      id, name: id, team: index ? 'bravo' : 'alpha', ready: false,
      specId: index ? 't90m' : 'm1a2', equipment: [], camo: 'factory',
      connected: true, isHost: index === 0, rating: null,
    })),
    ...overrides,
  };
}

function fixture({ worldScenes = 4, role = 'client' } = {}) {
  const builds = [];
  const requests = [];
  const cancellations = [];
  const transfers = [];
  const soloIntents = [];
  const disposed = [];
  const limits = { pedestalVisuals: 2, worldScenes };
  let phase = 'garage';
  let roomListener;
  const worlds = createWorldBuildCoordinator({
    engineContext: {}, scene: new THREE.Scene(),
    renderer: { renderLists: { dispose() {} } },
    deviceTier: 'desktop', resourceLimits: limits,
    getCurrentWorld: () => null,
    getGarageActivity: () => ({ phase, transitionActive: false, lastActivityAt: 0 }),
    releaseShadowMaterial() {}, now: () => 5000,
    sleep: () => { throw new Error('explicit lobby preparation must not await Garage idleness'); },
    foregroundYielder: () => async () => {},
    backgroundYielder: () => async () => {},
    loadModule: async () => ({
      async createMapAsync(_engine, { mapId }, progress) {
        const gate = deferred();
        const world = { group: new THREE.Group(), dispose: () => disposed.push(mapId) };
        world.group.name = mapId;
        builds.push({ mapId, gate, world });
        await progress('Surveying terrain', 0.1);
        await gate.promise;
        await progress('Sealing the battlefield', 1);
        return world;
      },
    }),
  });
  const transfer = (name) => async () => { transfers.push(name); };
  const preloader = createNetworkLobbyPreloader({
    getGamePhase: () => phase,
    preloadPresentation: transfer('presentation'), preloadVisuals: transfer('visuals'),
    preloadBattleModules: transfer('modules'), preloadChat: transfer('chat'),
    ensureTankBuilders: async (ids) => { transfers.push(`builders:${ids.join(',')}`); },
    loadWorldModule: () => worlds.loadModule(),
    cancelBackgroundWorldBuildsExcept(mapId) {
      cancellations.push(mapId);
      worlds.cancelBackgroundExcept(mapId);
    },
    prefetchWorld(mapId, options) {
      const promise = worlds.prefetch(mapId, options);
      requests.push({ mapId, options, promise });
      return promise;
    },
  });
  const match = {
    playerId: role === 'host' ? 'host' : 'guest', role, client: { closed: false },
    onRoomState(listener) { roomListener = listener; return () => { roomListener = null; }; },
  };
  const room = createNetworkRoomCoordinator({
    getMatch: () => match, getPlayMenu: () => null,
    loadRoomChat: async () => ({
      createRoomChat: () => ({ setPlayer() {}, setActive() {}, clear() {}, append() {} }),
    }),
    getPhase: () => phase, isSettingsOpen: () => false, hasResult: () => false,
    isKillcamActive: () => false, isSpectator: () => false, input: {},
    setGarageStatus() {}, emitRoomState() {},
    preloadLobbyIntent: (state) => preloader.preload(state),
    equipmentFor: () => [], camoFor: () => 'factory', onRematch() {}, onClose() {},
  });
  return {
    room, worlds, preloader, builds, requests, cancellations, transfers, soloIntents, disposed, limits,
    setPhase(value) { phase = value; },
    join(state = waiting()) {
      room.handleLobbyChange({ state, playerId: match.playerId, role });
    },
    packet(state) {
      if (room.activeRoom) roomListener(state);
      else this.join(state);
    },
    // These are the Garage routing contract below, with the actual room and
    // world owners. No source evaluation or private coordinator state access.
    browse(mapId) {
      if (!room.prepareLobby()) worlds.cancelBackgroundExcept(mapId === 'random' ? null : mapId);
    },
    battleIntent(mapId) {
      if (!room.prepareLobby()) soloIntents.push(mapId);
    },
  };
}

test('the next unchanged waiting packet retries a failed map build', async () => {
  const f = fixture();
  f.join();
  await nextTurn();
  assert.equal(f.builds.length, 1);
  f.builds[0].gate.reject(new Error('controlled optional world failure'));
  assert.equal(await f.requests[0].promise, null);
  assert.equal(f.worlds.cache.has('winter'), false);
  f.packet(waiting());
  await nextTurn();
  assert.equal(f.builds.length, 2,
    'room-map intent remains retryable after the world owner forgets a failed build');
  f.builds[1].gate.resolve();
  assert.equal(await f.requests.at(-1).promise, f.builds[1].world);
});

for (const acquisition of ['pending', 'retained']) {
  test(`${acquisition} Not Ready guest browsing preserves the exact in-flight Winter build`, async () => {
    const f = fixture();
    const state = waiting();
    f.join(state);
    if (acquisition === 'retained') {
      f.room.attach(state);
      f.room.handleLobbyChange(null);
    }
    await nextTurn();
    const original = f.requests.find((request) => request.promise);
    const winter = f.builds[0];
    assert.equal(state.players[1].ready, false);
    assert.equal(f.builds.length, 1, 'Not Ready guests start preparing without the host starting');

    f.browse('desert');
    f.battleIntent('desert');
    for (let index = 0; index < 8; index++) f.packet(waiting());
    await nextTurn();
    assert.equal(f.builds.length, 1, 'local browsing and repeated packets cannot duplicate construction');
    assert.deepEqual(f.requests.map((request) => request.mapId),
      Array(f.requests.length).fill('winter'), 'only the canonical room map owns prefetch intent');
    assert.equal(f.requests.filter((request) => request.promise).length, 1,
      'the world coordinator coalesces repeated lobby requests into one in-flight build');
    assert.deepEqual(f.soloIntents, [], 'the retained Solo button cannot warm a competing plan');
    assert.equal(f.worlds.stats.cancelled, 0);
    winter.gate.resolve();
    assert.equal(await original.promise, winter.world, 'the original promise resolves to its exact world');
    assert.equal(f.worlds.cache.get('winter'), winter.world);
    assert.equal(f.worlds.stats.cancelled, 0, 'a cancellation cannot be hidden by a replacement build');
    assert.equal(f.worlds.stats.requested, 1);
    assert.equal(f.worlds.stats.completed, 1);

    f.packet(waiting());
    f.browse('fjord');
    await nextTurn();
    assert.equal(f.builds.length, 1, 'a cached canonical map never rebuilds on another room packet');
    assert.equal(f.preloader.preparedBuilderCount, 2);
    assert.deepEqual(f.transfers, ['presentation', 'visuals', 'modules', 'chat', 'builders:m1a2,t90m'],
      'reasserting map intent does not repeat optional chunks or roster preparation');
  });
}

test('a host map change replaces Winter only after the canonical room accepts it', async () => {
  const f = fixture({ role: 'host' });
  f.room.attach(waiting());
  await nextTurn();
  const winterRequest = f.requests[0].promise;
  f.browse('desert');
  assert.equal(f.room.activeRoom.mapId, 'winter');
  assert.equal(f.worlds.stats.cancelled, 0);
  f.packet(waiting('desert', { revision: 2 }));
  await nextTurn();
  assert.deepEqual(f.builds.map((build) => build.mapId), ['winter', 'desert']);
  f.builds[0].gate.resolve();
  assert.equal(await winterRequest, null, 'only accepted room intent cancels the stale fixed map');
  assert.equal(f.worlds.cache.has('winter'), false);
  f.builds[1].gate.resolve();
  const desertRequest = f.requests.find((request) => request.mapId === 'desert');
  assert.equal(await desertRequest.promise, f.builds[1].world);
  f.packet(waiting('desert', { revision: 3 }));
  await nextTurn();
  assert.equal(f.builds.length, 2);
});

test('Random room intent is handled without constructing a local Solo map', async () => {
  const f = fixture();
  const staleSoloWorld = f.worlds.prefetch('desert', { intent: true });
  await nextTurn();
  f.join(waiting('random'));
  assert.equal(f.room.prepareLobby(), true, 'handled does not mean a fixed map was selected');
  f.browse('winter');
  f.battleIntent('winter');
  f.packet(waiting('random'));
  assert.deepEqual(f.soloIntents, []);
  assert.deepEqual(f.requests, [], 'Random has no canonical fixed-map prefetch');
  assert.ok(f.cancellations.every((mapId) => mapId === null));
  f.builds[0].gate.resolve();
  assert.equal(await staleSoloWorld, null, 'Random also releases stale fixed-map intent');
  assert.deepEqual(f.builds.map((build) => build.mapId), ['desert']);
});

test('the next unchanged waiting packet retries a settled cancellation', async () => {
  const f = fixture();
  f.join();
  await nextTurn();
  f.worlds.cancelBackgroundExcept(null);
  f.builds[0].gate.resolve();
  assert.equal(await f.requests[0].promise, null);
  assert.equal(f.worlds.stats.cancelled, 1);
  f.packet(waiting());
  await nextTurn();
  assert.equal(f.builds.length, 2, 'cancelled same-map intent is not permanently latched');
  f.builds[1].gate.resolve();
  assert.equal(await f.requests.at(-1).promise, f.builds[1].world);
});

test('capacity rejection remains retryable after a residency slot becomes available', async () => {
  const f = fixture({ worldScenes: 0 });
  f.join();
  await nextTurn();
  assert.equal(f.worlds.stats.skippedCapacity, 1);
  assert.equal(f.requests[0].promise, null);
  assert.equal(f.builds.length, 0, 'lobby preparation cannot override the world residency cap');
  f.limits.worldScenes = 1;
  f.packet(waiting());
  await nextTurn();
  assert.equal(f.builds.length, 1, 'a rejected request was intent, not permanent preparation');
  f.builds[0].gate.resolve();
  assert.equal(await f.requests.at(-1).promise, f.builds[0].world);
  assert.equal(f.worlds.cache.size, 1);
});

test('an evicted map is prepared again on the next unchanged waiting packet', async () => {
  const f = fixture({ worldScenes: 1 });
  f.join();
  await nextTurn();
  f.builds[0].gate.resolve();
  const evictedWinter = await f.requests[0].promise;
  f.limits.worldScenes = 0;
  f.worlds.enforceCacheBudget();
  assert.equal(f.worlds.cache.size, 0);
  assert.equal(f.worlds.lastRelease.id, 'winter');
  assert.deepEqual(f.disposed, ['winter'], 'eviction uses the actual world resource owner');
  f.limits.worldScenes = 1;
  f.packet(waiting());
  await nextTurn();
  assert.equal(f.builds.length, 2, 'room state cannot mistake a disposed map for a cached map');
  f.builds[1].gate.resolve();
  const replacementWinter = await f.requests.at(-1).promise;
  assert.notEqual(replacementWinter, evictedWinter);
  assert.equal(f.worlds.cache.get('winter'), replacementWinter);
});

test('leave, independent Solo activity, and same-room rejoin reacquire preparation', async () => {
  const f = fixture();
  f.join();
  await nextTurn();
  f.room.clear();
  assert.equal(f.room.prepareLobby(), false);
  f.browse('desert');
  f.battleIntent('desert');
  assert.deepEqual(f.soloIntents, ['desert'], 'leaving restores the existing Solo preparation path');
  f.builds[0].gate.resolve();
  assert.equal(await f.requests[0].promise, null);
  f.join();
  await nextTurn();
  assert.equal(f.builds.length, 2, 'rejoining the identical room/map retries its abandoned world');
  f.builds[1].gate.resolve();
  assert.equal(await f.requests.at(-1).promise, f.builds[1].world);
});

test('null lobby handoff does not cancel a pending or retained map build', async () => {
  const f = fixture();
  f.join();
  await nextTurn();
  const original = f.requests[0].promise;
  const beforeNull = f.cancellations.length;
  f.room.handleLobbyChange(null);
  assert.equal(f.cancellations.length, beforeNull, 'a null callback is not a map-cancellation signal');
  assert.equal(f.room.prepareLobby(), false, 'without an owner the request falls through');
  f.room.attach(waiting());
  const beforeRetainedNull = f.cancellations.length;
  f.room.handleLobbyChange(null);
  assert.equal(f.cancellations.length, beforeRetainedNull);
  assert.equal(f.room.prepareLobby(), true, 'retained authority still owns preparation after handoff');
  f.builds[0].gate.resolve();
  assert.equal(await original, f.builds[0].world);
  assert.equal(f.worlds.stats.cancelled, 0);
});

test('retained canonical state takes priority over an older pending lobby selection', async () => {
  const f = fixture();
  f.join(waiting('desert'));
  await nextTurn();
  const desertRequest = f.requests[0].promise;
  f.room.attach(waiting());
  await nextTurn();
  assert.equal(f.room.pendingLobby.state.mapId, 'desert');
  assert.equal(f.room.activeRoom.mapId, 'winter');
  assert.equal(f.room.prepareLobby(), true);
  assert.equal(f.requests.at(-1).mapId, 'winter');
  f.builds[0].gate.resolve();
  assert.equal(await desertRequest, null);
  f.builds[1].gate.resolve();
  const winterRequest = f.requests.find((request) => request.mapId === 'winter');
  assert.equal(await winterRequest.promise, f.builds[1].world);
});

test('battle and nonwaiting room states neither build nor cancel Garage worlds', async () => {
  const f = fixture();
  f.room.attach(waiting());
  await nextTurn();
  const original = f.requests[0].promise;
  const snapshot = () => [f.requests.length, f.cancellations.length, f.transfers.length];
  const before = snapshot();
  f.setPhase('battle');
  f.packet(waiting('desert'));
  assert.equal(f.room.prepareLobby(), false);
  assert.deepEqual(snapshot(), before);
  f.setPhase('garage');
  for (const phase of ['starting', 'playing', 'finished']) {
    f.packet(waiting('desert', { phase }));
    assert.equal(f.room.prepareLobby(), false);
    assert.deepEqual(snapshot(), before, `${phase} does not revoke an earlier map preparation`);
  }
  f.builds[0].gate.resolve();
  assert.equal(await original, f.builds[0].world);
});

test('the production Garage callbacks route competing work through room intent', () => {
  const source = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  assert.match(source,
    /onBattleIntent:\s*\(options\)\s*=>\s*\{[^]*?if\s*\(!currentNetworkRoom\(\)\?\.prepareLobby\(\)\)\s*battleIntent\.preload\(options\);/,
    'the live Solo-intent callback must honor joined-room preparation before local preload');
  assert.match(source,
    /onMapSelect:\s*\(mapId:\s*string\)\s*=>\s*\{[^]*?if\s*\(!currentNetworkRoom\(\)\?\.prepareLobby\(\)\)\s*\{\s*cancelBackgroundWorldBuildsExcept\(mapId === 'random' \? null : mapId\);\s*\}/,
    'the live map-selection callback must preserve room intent before cancelling local maps');
});
