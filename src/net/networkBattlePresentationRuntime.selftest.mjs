import assert from 'node:assert/strict';
import { createNetworkBattlePresentationRuntime } from './networkBattlePresentationRuntime.ts';
import { isNetworkBattleEntryAbortError } from './networkBattleEntryAbort.ts';
import { createBattleEntryAcquisition } from '../game/battleEntryAcquisition.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

async function waitForEvent(events, name) {
  for (let i = 0; i < 20 && !events.includes(name); i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(events.includes(name), `expected ${name} before continuing`);
}

function assertPreparationCovered(harness, label) {
  assert.equal(harness.loaderVisible, true, `${label}: the opaque loader remains owned`);
  assert.equal(harness.countdownMs, 5000, `${label}: preparation cannot spend the authority countdown`);
  for (const event of ['effects', 'activate', 'finalShadows', 'blackWatchdog', 'primeReveal',
    'hide', 'ready', 'loading:false', 'ambient:true', 'adaptive:false']) {
    assert.ok(!harness.events.includes(event), `${label}: preparation cannot reach ${event}`);
  }
  assert.ok(!harness.progress.some(([fraction, text]) => fraction === 1 || text === 'Ready'),
    `${label}: pending or failed preparation cannot claim Ready`);
}

function assertClosedPreparation(harness) {
  for (const row of harness.trace.preparationSlices) {
    assert.ok(Number.isFinite(row.startTime) && Number.isFinite(row.endTime));
    assert.ok(row.endTime >= row.startTime && row.endTime <= harness.trace.endedAt,
      `${row.stage}: actual preparation lifetime closes before entry settlement`);
  }
}

function useRealAcquisition(harness) {
  const acquisition = createBattleEntryAcquisition();
  harness.options.entry.acquire = (options) => acquisition.acquireNetwork(options);
}

function assertAssetsReleased(harness) {
  assert.equal(harness.assetReleased, true, 'the temporary paint lease is released');
  assert.equal(harness.events.filter((event) => event === 'assetsReleased').length, 1,
    'lease release is idempotent across normal and failure cleanup');
  assert.ok(harness.events.indexOf('assetsReleased') > harness.events.indexOf('assetsSettled'),
    'the current asset job settles before releasing its material owner');
  assertClosedPreparation(harness);
}

function createHarness(failAt = '', pauseAt = '', timing = {}) {
  const events = [];
  const progress = [];
  let clock = 0;
  let elapsedMs = 0;
  let waitingForPeers = false;
  let loaderVisible = true;
  let readySentAt = null;
  let countdownStartedAt = timing.phase === 'countdown' ? 0 : null;
  let disposed = false;
  let publishedBridge = null;
  let publishedMatch = null;
  let trace = null;
  const connectGate = deferred();
  const rosterGate = deferred();
  const revealGate = deferred();
  const atmosphereGate = deferred();
  const initialGate = deferred();
  const visualsGate = deferred();
  const readinessGate = deferred();
  const compileGate = deferred();
  const panelGate = deferred();
  const modulesGate = deferred();
  const worldGate = deferred();
  const assetsGate = deferred();
  const assetsDisposeGate = deferred();
  const panelRequests = [];
  const assetRequests = [];
  const rosterRequests = [];
  let assetHandle = null;
  let assetReleased = false;
  const initial = {
    entities: [],
    meta: { weatherSeed: 0, phase: timing.phase ?? 'loading', countdownMs: timing.countdownMs ?? 5000 },
  };
  const countdownRemaining = () => countdownStartedAt === null
    ? initial.meta.countdownMs
    : Math.max(0, initial.meta.countdownMs - (elapsedMs - countdownStartedAt));
  const entity = (specId) => ({
    specId,
    visual: { setGroundSampler: () => events.push(`ground:${specId}`) },
  });
  const preparedBridge = {
    entities: new Map([
      ['viewer', entity('m1a1')],
      ['peer', entity('t90m')],
    ]),
    async prepareRoster(players) {
      rosterRequests.push(players);
      events.push('prepareRoster');
      assert.ok(events.includes('worldReady') && events.includes('connected'),
        'roster geometry requires the selected world and transport');
      assert.strictEqual(players, assetHandle.players, 'geometry consumes the exact concrete asset roster');
      assert.equal(assetReleased, false, 'paint leases remain borrowed throughout roster construction');
      if (pauseAt === 'roster') await rosterGate.promise;
      if (failAt === 'roster') throw new Error('roster failed');
      assert.equal(assetReleased, false, 'a paused roster keeps its paint lease until visuals acquire');
      events.push('rosterAcquired');
    },
    apply() { events.push('apply'); },
    dispose() { disposed = true; events.push('disposeBridge'); },
  };
  const match = {
    client: { id: 'client' },
    close: (reason) => events.push(`closeMatch:${reason}`),
  };
  const createBrowserBattleBridge = Symbol('bridge');
  const prepareBrowserBattleRosterAssets = Symbol('roster-assets');
  const createNetworkStatus = Symbol('status');
  const createBrowserInputRuntime = Symbol('input');
  const modules = [
    { createBrowserBattleBridge, prepareBrowserBattleRosterAssets },
    { createNetworkStatus },
    { createBrowserInputRuntime },
  ];
  const options = {
    load: {
      battleLoad: {
        show: () => events.push('show'),
        rosters: () => events.push('rosters'),
        progress: (fraction, label) => progress.push([fraction, label]),
        hide: async () => {
          events.push('hide');
          if (pauseAt === 'hide') await revealGate.promise;
          if (failAt === 'hide') throw new Error('hide failed');
          elapsedMs += timing.fadeMs ?? 0;
          loaderVisible = false;
          events.push('hidden');
        },
      },
      audio: {
        resume: () => events.push('audioResume'),
        loadingOn: (active) => events.push(`loading:${active}`),
        ambientOn: (active) => events.push(`ambient:${active}`),
      },
      lighting: { setFarCascadeDormant: (value) => events.push(`far:${value}`) },
      ensureBattleVisuals: async () => {
        events.push('visuals');
        if (pauseAt === 'visuals') await visualsGate.promise;
        if (failAt === 'visuals') throw new Error('visuals failed');
        events.push('visualsReady');
      },
      nextFrame: async () => {
        events.push('frame');
        if (pauseAt === 'compileFrame' && progress.at(-1)?.[1] === 'Compiling combat shaders') {
          events.push('compileFrame');
          await compileGate.promise;
        }
      },
      primeReveal: async () => {
        events.push('primeReveal');
        if (pauseAt === 'primeReveal') await revealGate.promise;
        if (failAt === 'primeReveal') throw new Error('primeReveal failed');
        elapsedMs += timing.revealMs ?? 0;
        events.push('primed');
      },
      now: () => (clock += 10),
      recordTrace: (value) => { trace = value; },
      setAdaptiveSuspended: (value) => events.push(`adaptive:${value}`),
    },
    roster: {
      getMap: (mapId) => ({ name: mapId, thumb: 'thumb', biome: mapId }),
      rows: (_players, team) => [team],
      vehicleName: (specId) => `vehicle:${specId}`,
      emitBattleStart: () => events.push('battleStart'),
      setCamoBiome: () => events.push('camo'),
    },
    entry: {
      acquire: async ({
        loadModules, loadWorld, connect, publishMatch, timings,
      }) => {
        events.push('acquire');
        const [loadedModules, world, connected] = await Promise.all([
          loadModules(), loadWorld(), connect(),
        ]);
        timings.modulesMs = 1;
        timings.worldMs = 2;
        timings.connectMs = 3;
        publishMatch(connected);
        return { modules: loadedModules, world, match: connected };
      },
      loadModules: async () => {
        events.push('modules');
        if (pauseAt === 'modules') await modulesGate.promise;
        events.push('modulesReady');
        return modules;
      },
      loadWorld: async () => {
        events.push('world');
        if (pauseAt === 'world') await worldGate.promise;
        if (failAt === 'world') throw new Error('world failed');
        events.push('worldReady');
        return {};
      },
      publishMatch: (value) => { publishedMatch = value; events.push('publishMatch'); },
      getMatch: () => publishedMatch,
    },
    bridge: {
      prepareRosterAssets: (factory, assetRequest, spectator) => {
        assert.strictEqual(factory, prepareBrowserBattleRosterAssets);
        assert.strictEqual(assetRequest.signal, request.signal, 'asset preparation receives the exact entry signal');
        assert.equal(spectator, request.own.team === 'spectator');
        assert.ok(events.includes('modulesReady') && events.includes('visualsReady'),
          'asset admission requires both lazy modules and the visual facade');
        assert.equal(assetHandle, null, 'one entry owns one roster preparation handle');
        assetRequests.push(assetRequest);
        events.push('rosterAssets');
        const players = assetRequest.matchPlayers.map((player) => ({
          ...player, specId: player.specId === 'random' ? 'm1a1' : player.specId,
        }));
        const ready = (async () => {
          try {
            if (pauseAt === 'assets') await assetsGate.promise;
            if (failAt === 'assets') throw new Error('optional paint failed');
            events.push('assetsReady');
          } finally { events.push('assetsSettled'); }
        })();
        let disposal;
        assetHandle = {
          players,
          ready,
          dispose() {
            disposal ??= (async () => {
              events.push('disposeAssets');
              await ready.catch(() => {});
              if (pauseAt === 'assetsDispose') await assetsDisposeGate.promise;
              assetReleased = true;
              events.push('assetsReleased');
            })();
            return disposal;
          },
        };
        return assetHandle;
      },
      installInputRuntime: (factory) => {
        assert.strictEqual(factory, createBrowserInputRuntime);
        events.push('input');
      },
      createStatus: (factory) => {
        assert.strictEqual(factory, createNetworkStatus);
        return { id: 'status' };
      },
      publishStatus: () => events.push('status'),
      attachRecovery: () => events.push('recovery'),
      create: (factory, bridgeRequest) => {
        assert.strictEqual(factory, createBrowserBattleBridge);
        assert.strictEqual(bridgeRequest.signal, request.signal, 'the geometry adapter receives the entry signal');
        assert.strictEqual(bridgeRequest.matchPlayers, assetHandle.players,
          'the bridge and its roster share the same concrete selection');
        assert.ok(events.includes('visualsReady'), 'bridge requires the loaded visual facade');
        events.push('createBridge');
        return preparedBridge;
      },
      publish: (value) => { publishedBridge = value; events.push('publishBridge'); },
      groundSampler: () => 0,
      waitForInitialSnapshot: async () => {
        events.push('initial');
        if (pauseAt === 'initial') await initialGate.promise;
        if (failAt === 'initial') throw new Error('initial failed');
        events.push('initialReady');
        return initial;
      },
      waitForPeerReadiness: async () => {
        events.push('ready');
        readySentAt = elapsedMs;
        if (pauseAt === 'ready') await readinessGate.promise;
        if (failAt === 'ready') throw new Error('ready failed');
        if (initial.meta.phase === 'loading') {
          initial.meta.phase = 'countdown';
          countdownStartedAt = elapsedMs;
        }
        events.push('peersReady');
      },
    },
    warm: {
      atmosphere: async (snapshot) => {
        assert.strictEqual(snapshot, initial, 'atmosphere consumes the actual initial authority frame');
        events.push('atmosphere');
        if (pauseAt === 'atmosphere') await atmosphereGate.promise;
        if (failAt === 'atmosphere') throw new Error('atmosphere failed');
        events.push('atmosphereReady');
      },
      nightLighting: async () => events.push('nightLighting'),
      getFx: () => ({ id: 'fx' }),
      terrain: async () => events.push('terrain'),
      wrecks: async () => events.push('wrecks'),
      playerPanel: async (bridge, viewerId) => {
        panelRequests.push({ bridge, viewerId, entity: bridge.entities.get(viewerId) });
        events.push('playerPanel');
        if (pauseAt === 'playerPanel') await panelGate.promise;
        if (failAt === 'playerPanel') throw new Error('playerPanel failed');
        events.push('panelReady');
        return true;
      },
      openingEffects: async (_fx, _bridge, signal) => {
        assert.strictEqual(signal, request.signal, 'opening effects receive the exact entry signal');
        events.push('effects');
        return { uniformCount: 1, uniformMs: 3, uniformPending: 0 };
      },
      shotCards: () => events.push('cards'),
      compile: async (signal) => {
        events.push('compile');
        if (pauseAt === 'compile') await compileGate.promise;
        signal?.throwIfAborted();
        if (failAt === 'compile') throw new Error('compile failed');
        events.push('compiled');
        return { submissionMs: 15, pollMs: 2, yields: 1 };
      },
      finalShadows: async (signal) => {
        assert.strictEqual(signal, request.signal, 'final shadows receive the exact entry signal');
        assert.equal(loaderVisible, true, 'final shadows run under the opaque loader');
        events.push('finalShadows');
        elapsedMs += timing.shadowMs ?? 0;
        events.push('shadowsReady');
        return { draws: 1, durationMs: 12 };
      },
    },
    presentation: {
      resetRoundState: () => events.push('reset'),
      setGarageLighting: (active) => events.push(`garageLights:${active}`),
      setWaitingForPeers: (active) => {
        waitingForPeers = active;
        events.push(`waiting:${active}`);
      },
      activate: () => events.push('activate'),
      runBlackWatchdog: () => { events.push('blackWatchdog'); return { ok: true }; },
    },
  };
  const runtime = createNetworkBattlePresentationRuntime(options);

  const request = {
    viewerId: 'viewer',
    own: { id: 'viewer', specId: 'm1a1', team: 'alpha' },
    mapId: 'verdant',
    matchPlayers: [
      { id: 'viewer', specId: 'm1a1', team: 'alpha' },
      { id: 'peer', specId: 't90m', team: 'bravo' },
    ],
    modeLabel: 'Private Battle',
    connectMatch: async () => {
      events.push('connect');
      if (pauseAt === 'connect') await connectGate.promise;
      events.push('connected');
      return match;
    },
  };
  return {
    runtime,
    options,
    request,
    events,
    progress,
    preparedBridge,
    panelRequests,
    assetRequests,
    rosterRequests,
    get assetHandle() { return assetHandle; },
    get assetReleased() { return assetReleased; },
    revealGate,
    get disposed() { return disposed; },
    get publishedBridge() { return publishedBridge; },
    get trace() { return trace; },
    get elapsedMs() { return elapsedMs; },
    get countdownMs() { return countdownRemaining(); },
    get phase() { return initial.meta.phase; },
    get waitingForPeers() { return waitingForPeers; },
    get loaderVisible() { return loaderVisible; },
    get readySentAt() { return readySentAt; },
    releaseConnect: () => connectGate.resolve(),
    releaseRoster: () => rosterGate.resolve(),
    releaseAtmosphere: () => atmosphereGate.resolve(),
    releaseInitial: () => initialGate.resolve(),
    releaseVisuals: () => visualsGate.resolve(),
    releaseReadiness: () => readinessGate.resolve(),
    releaseCompile: () => compileGate.resolve(),
    releasePanel: () => panelGate.resolve(),
    releaseModules: () => modulesGate.resolve(),
    releaseWorld: () => worldGate.resolve(),
    releaseAssets: () => assetsGate.resolve(),
    releaseAssetDisposal: () => assetsDisposeGate.resolve(),
  };
}

{
  const harness = createHarness();
  await harness.runtime.present(harness.request);
  assert.equal(harness.publishedBridge, harness.preparedBridge,
    'only the fully prepared bridge is published');
  assert.equal(harness.disposed, false, 'the live bridge remains owned after activation');
  assert.ok(harness.events.indexOf('initial') < harness.events.indexOf('publishBridge'),
    'authority must arrive before the bridge becomes render-visible');
  for (const [before, after] of [
    ['initialReady', 'atmosphere'], ['apply', 'atmosphere'],
    ['garageLights:false', 'atmosphere'], ['atmosphere', 'atmosphereReady'],
    ['atmosphereReady', 'terrain'], ['atmosphereReady', 'compile'],
    ['atmosphereReady', 'nightLighting'], ['nightLighting', 'terrain'],
    ['nightLighting', 'compile'],
    ['terrain', 'wrecks'],
    ['wrecks', 'playerPanel'], ['playerPanel', 'compile'],
    ['panelReady', 'effects'], ['compiled', 'effects'], ['effects', 'activate'],
  ]) assert.ok(harness.events.indexOf(before) >= 0
    && harness.events.indexOf(before) < harness.events.indexOf(after), `${before} precedes ${after}`);
  for (const [before, after] of [
    ['waiting:true', 'activate'], ['activate', 'finalShadows'],
    ['finalShadows', 'shadowsReady'], ['shadowsReady', 'blackWatchdog'],
    ['blackWatchdog', 'primeReveal'], ['primed', 'hide'],
    ['hidden', 'ready'], ['peersReady', 'waiting:false'],
    ['waiting:false', 'adaptive:false'],
  ]) assert.ok(harness.events.indexOf(before) >= 0
    && harness.events.indexOf(before) < harness.events.indexOf(after), `${before} precedes ${after}`);
  assert.ok(harness.events.indexOf('activate') < harness.events.indexOf('hide'),
    'activation completes while the opaque loader still owns the screen');
  assert.ok(harness.events.indexOf('activate') < harness.events.indexOf('primeReveal') &&
    harness.events.indexOf('primeReveal') < harness.events.indexOf('hide'),
  'one complete battle frame is presented before the opaque loader exits');
  assert.deepEqual(harness.trace.blackCheck, { ok: true });
  assert.deepEqual(harness.trace.shadowPrime, { draws: 1, durationMs: 12 },
    'the trace retains the resolved final shadow receipt, not its promise');
  assert.deepEqual(harness.trace.programCompile, { submissionMs: 15, pollMs: 2, yields: 1 },
    'the trace retains the resolved compile receipt, not its promise');
  assert.deepEqual(harness.trace.scarCompile, { uniformCount: 1, uniformMs: 3, uniformPending: 0 },
    'the post-scene scar cohort receipt is separate from the full-scene compile receipt');
  assert.ok(harness.trace.totalMs > 0, 'the complete network entry is timed');
  assert.equal(harness.trace.status, 'complete');
  assert.equal(harness.trace.totalMs, Math.round(harness.trace.endedAt - harness.trace.startedAt));
  assert.deepEqual(harness.trace.stageIntervals.map((row) => row.stage), Object.keys(harness.trace.stages));
  harness.trace.stageIntervals.forEach((row, index, rows) => {
    assert.equal(row.startTime, index ? rows[index - 1].endTime : harness.trace.startedAt);
    assert.equal(harness.trace.stages[row.stage], Math.round(row.endTime - row.startTime),
      `${row.stage}: absolute intervals retain the original aggregate duration`);
  });
  assert.deepEqual(harness.trace.revealSlices.map((row) => row.stage),
    ['activation', 'finalShadows', 'blackWatchdog', 'primeReveal', 'loaderFade']);
  assert.deepEqual(harness.trace.preparationSlices.map((row) => row.stage),
    ['rosterAssets', 'panelMasks', 'compile']);
  assertAssetsReleased(harness);
  assert.equal(harness.trace.rosterAssetsFailed, false);
  assert.ok(harness.events.indexOf('assetsReleased') > harness.events.indexOf('rosterAcquired'));
  assertClosedPreparation(harness);
  const revealStage = harness.trace.stageIntervals.find((row) => row.stage === 'reveal');
  harness.trace.revealSlices.forEach((row, index, rows) => {
    assert.ok(row.startTime >= (index ? rows[index - 1].endTime : revealStage.startTime));
    assert.ok(row.endTime >= row.startTime && row.endTime <= revealStage.endTime);
  });
  const stages = Object.keys(harness.trace.stages);
  assert.deepEqual(stages.slice(stages.indexOf('terrainGrid'), stages.indexOf('combatWarm') + 1),
    ['terrainGrid', 'wreckWarm', 'compile', 'panelJoin', 'combatWarm'],
    'scene compile overlaps panel work; the ordered stage retains only residual panel wait');
  assert.ok(harness.progress.every(([fraction], index) =>
    index === 0 || fraction >= harness.progress[index - 1][0]),
  'moving scene compilation earlier keeps displayed progress monotonic');
  assert.ok(harness.progress.some(([fraction, label]) =>
    fraction === 1 && label === 'Ready'), 'the loader reaches its terminal state');
}

for (const prerequisite of ['modules', 'visuals']) {
  const harness = createHarness('', prerequisite);
  useRealAcquisition(harness);
  const result = harness.runtime.present(harness.request);
  try {
    await waitForEvent(harness.events, prerequisite);
    await waitForEvent(harness.events, 'connected');
    assert.ok(harness.events.includes('worldReady'));
    assert.equal(harness.assetHandle, null, `${prerequisite}: both prerequisites gate asset admission`);
    assert.ok(!harness.events.includes('createBridge'));
    if (prerequisite === 'modules') harness.releaseModules();
    else harness.releaseVisuals();
    await result;
    assert.equal(harness.assetRequests.length, 1);
    assertAssetsReleased(harness);
  } finally {
    harness.releaseModules(); harness.releaseVisuals();
    await result;
  }
}

for (const waitingOn of ['world', 'connect']) {
  const harness = createHarness('', waitingOn);
  useRealAcquisition(harness);
  const result = harness.runtime.present(harness.request);
  try {
    await waitForEvent(harness.events, 'assetsReady');
    assert.equal(harness.assetReleased, false, `${waitingOn}: completed paints retain their lease`);
    assert.ok(Number.isFinite(harness.trace.modulesMs), 'module acquisition does not join asset readiness');
    assert.equal(harness.trace.stageIntervals.at(-1).stage, 'modulesWorldAndConnect');
    assert.ok(!harness.events.includes('createBridge'), `${waitingOn}: no early scene geometry`);
    assertPreparationCovered(harness, waitingOn);
    harness.releaseWorld(); harness.releaseConnect();
    await result;
    const assets = harness.trace.preparationSlices.find((row) => row.stage === 'rosterAssets');
    const acquisition = harness.trace.stageIntervals.find((row) => row.stage === 'modulesWorldAndConnect');
    assert.ok(assets.startTime >= acquisition.startTime && assets.endTime <= acquisition.endTime,
      'asset lifetime overlaps and completes inside the still-pending acquisition interval');
    assertAssetsReleased(harness);
  } finally {
    harness.releaseWorld(); harness.releaseConnect();
    await result;
  }
}

{
  const harness = createHarness('', 'assets');
  useRealAcquisition(harness);
  const result = harness.runtime.present(harness.request);
  try {
    await waitForEvent(harness.events, 'input');
    assert.ok(Number.isFinite(harness.trace.modulesMs), 'lazy module callback returns while assets are pending');
    assert.ok(harness.events.includes('worldReady') && harness.events.includes('connected'));
    assert.equal(harness.trace.stageIntervals.at(-1).stage, 'roster');
    const assets = harness.trace.preparationSlices.find((row) => row.stage === 'rosterAssets');
    assert.equal(assets.endTime, undefined, 'the asset slice remains open through the residual join');
    assert.ok(!harness.events.includes('createBridge'), 'geometry cannot race a pending painter');
    assertPreparationCovered(harness, 'residual asset wait');
    harness.releaseAssets();
    await result;
    const acquisition = harness.trace.stageIntervals.find((row) => row.stage === 'modulesWorldAndConnect');
    assert.ok(assets.startTime < acquisition.endTime && assets.endTime > acquisition.endTime,
      'the full asset lifetime spans acquisition and residual roster wait without a fabricated early end');
    assertAssetsReleased(harness);
  } finally { harness.releaseAssets(); await result; }
}

{
  const harness = createHarness('', 'roster');
  const worldGate = deferred();
  useRealAcquisition(harness);
  harness.request.matchPlayers[0].specId = 'random';
  harness.options.entry.loadWorld = async () => {
    harness.events.push('world');
    await worldGate.promise;
    harness.events.push('worldReady');
    return {};
  };
  const result = harness.runtime.present(harness.request);
  try {
    await waitForEvent(harness.events, 'assetsReady');
    const concrete = harness.assetHandle.players;
    assert.notStrictEqual(concrete, harness.request.matchPlayers);
    assert.notStrictEqual(concrete[0], harness.request.matchPlayers[0]);
    assert.equal(concrete[0].specId, 'm1a1', 'random selection becomes concrete exactly once');
    harness.request.matchPlayers[0].specId = 't90m';
    harness.request.matchPlayers[1].name = 'later lobby edit';
    worldGate.resolve();
    await waitForEvent(harness.events, 'prepareRoster');
    assert.strictEqual(harness.rosterRequests[0], concrete);
    assert.equal(concrete[0].specId, 'm1a1');
    assert.equal(concrete[1].name, undefined, 'later input mutation cannot alter the copied roster');
    assert.equal(harness.assetReleased, false, 'a paused visual borrower retains the prepared paint');
    assert.ok(!harness.events.includes('disposeAssets'));
    assertPreparationCovered(harness, 'paused roster borrowing paints');
    harness.releaseRoster();
    await result;
    assertAssetsReleased(harness);
    assert.ok(harness.events.indexOf('assetsReleased') > harness.events.indexOf('rosterAcquired'));
    assert.ok(harness.events.indexOf('assetsReleased') < harness.events.indexOf('initial'));
  } finally { worldGate.resolve(); harness.releaseRoster(); await result; }
}

{
  const harness = createHarness('assets', 'world');
  useRealAcquisition(harness);
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  const result = harness.runtime.present(harness.request);
  try {
    await waitForEvent(harness.events, 'assetsSettled');
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, [], 'optional painting rejection is observed while world acquisition waits');
    assert.ok(!harness.events.includes('prepareRoster'));
    harness.releaseWorld();
    await result;
    assert.equal(harness.trace.rosterAssetsFailed, true);
    assert.ok(harness.events.includes('rosterAcquired') && harness.events.includes('ready'),
      'an ordinary paint warm failure retains normal roster preparation and verified reveal');
    assert.equal(harness.trace.status, 'complete');
    assertAssetsReleased(harness);
    assert.deepEqual(unhandled, []);
  } finally {
    harness.releaseWorld(); await result;
    process.removeListener('unhandledRejection', onUnhandled);
  }
}

for (const pendingPrerequisite of ['modules', 'visuals']) {
  const harness = createHarness('world', pendingPrerequisite);
  useRealAcquisition(harness);
  const result = harness.runtime.present(harness.request).then(
    () => ({ ok: true }), (error) => ({ ok: false, error }),
  );
  try {
    const completed = await result;
    assert.equal(completed.ok, false);
    assert.match(completed.error.message, /world failed/);
    assert.equal(harness.trace.status, 'failed');
    assert.equal(harness.assetHandle, null, 'failed acquisition settles without waiting on an unrelated import');
    const endedAt = harness.trace.endedAt;
    harness.releaseModules(); harness.releaseVisuals();
    await waitForEvent(harness.events, 'modulesReady');
    await waitForEvent(harness.events, 'visualsReady');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.assetHandle, null, 'late prerequisites cannot admit an abandoned asset owner');
    assert.deepEqual(harness.trace.preparationSlices, []);
    assert.equal(harness.trace.endedAt, endedAt);
    assert.ok(!harness.events.includes('createBridge'));
    assertPreparationCovered(harness, `world failed before ${pendingPrerequisite}`);
  } finally { harness.releaseModules(); harness.releaseVisuals(); await result; }
}

for (const [failure, assetOutcome] of [
  ['world', 'resolve'], ['world', 'reject'], ['cancel', 'resolve'], ['cancel', 'reject'],
]) {
  const harness = createHarness(assetOutcome === 'reject' ? 'assets' : '', 'assets');
  const worldGate = deferred();
  const controller = new AbortController();
  const primary = new Error('selected world failed during painting');
  harness.request.signal = controller.signal;
  useRealAcquisition(harness);
  if (failure === 'world') harness.options.entry.loadWorld = () => worldGate.promise;
  let settled = false;
  const result = harness.runtime.present(harness.request).then(
    () => { settled = true; return { ok: true }; },
    (error) => { settled = true; harness.events.push('launcherCleanup'); return { ok: false, error }; },
  );
  try {
    await waitForEvent(harness.events, 'rosterAssets');
    if (failure === 'world') worldGate.reject(primary);
    else controller.abort('leave while current asset paint is pending');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false, `${failure}/${assetOutcome}: active painting drains before rejection`);
    assert.equal(harness.assetReleased, false, 'cancellation/failure cannot release paint beneath its current writer');
    assert.equal(harness.trace.status, 'pending');
    assert.equal(harness.trace.preparationSlices[0].endTime, undefined);
    assert.ok(!harness.events.includes('createBridge'));
    assertPreparationCovered(harness, failure);
    harness.releaseAssets();
    const completed = await result;
    assert.equal(completed.ok, false);
    if (failure === 'world') assert.strictEqual(completed.error, primary);
    else assert.ok(isNetworkBattleEntryAbortError(completed.error));
    assertAssetsReleased(harness);
    assert.ok(harness.events.indexOf('launcherCleanup') > harness.events.indexOf('assetsReleased'));
    assert.equal(harness.trace.status, 'failed');
    assertPreparationCovered(harness, failure);
  } finally { worldGate.resolve(); harness.releaseAssets(); await result; }
}

{
  const harness = createHarness('roster', 'assetsDispose');
  let settled = false;
  const result = harness.runtime.present(harness.request).then(
    () => { settled = true; return { ok: true }; },
    (error) => { settled = true; return { ok: false, error }; },
  );
  try {
    await waitForEvent(harness.events, 'disposeAssets');
    assert.equal(settled, false, 'roster failure awaits temporary material cleanup');
    assert.equal(harness.trace.status, 'pending', 'failure timing includes the actual resource drain');
    assert.equal(harness.disposed, true, 'failed unpublished visuals are disposed');
    assert.equal(harness.publishedBridge, null);
    assertPreparationCovered(harness, 'roster failure draining paint leases');
    harness.releaseAssetDisposal();
    const completed = await result;
    assert.equal(completed.ok, false);
    assert.match(completed.error.message, /roster failed/);
    assertAssetsReleased(harness);
    assert.equal(harness.trace.status, 'failed');
  } finally { harness.releaseAssetDisposal(); await result; }
}

{
  const harness = createHarness('', 'assetsDispose');
  const controller = new AbortController();
  const reason = 'leave while successful roster paint leases are releasing';
  harness.request.signal = controller.signal;
  let settled = false;
  const result = harness.runtime.present(harness.request).then(
    () => { settled = true; return { ok: true }; },
    (error) => { settled = true; harness.events.push('launcherCleanup'); return { ok: false, error }; },
  );
  try {
    await waitForEvent(harness.events, 'disposeAssets');
    assert.ok(harness.events.includes('rosterAcquired'), 'visuals successfully acquire before the paused disposal');
    assert.equal(harness.disposed, false, 'the fully built bridge remains privately owned during disposal');
    assert.equal(harness.publishedBridge, null);
    controller.abort(reason);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false, 'cancellation must finish the current disposal before returning');
    assert.equal(harness.trace.status, 'pending');
    assert.equal(harness.assetReleased, false);
    assertPreparationCovered(harness, 'cancelled successful roster disposal');
    harness.releaseAssetDisposal();
    const completed = await result;
    assert.equal(completed.ok, false);
    assert.ok(isNetworkBattleEntryAbortError(completed.error));
    assert.equal(completed.error.message, reason);
    assert.equal(harness.disposed, true, 'cancellation disposes the still-unpublished completed bridge');
    assert.equal(harness.publishedBridge, null);
    assertAssetsReleased(harness);
    assert.ok(harness.events.indexOf('launcherCleanup') > harness.events.indexOf('assetsReleased'));
    for (const event of ['initial', 'initialReady', 'publishBridge', 'activate', 'ready']) {
      assert.ok(!harness.events.includes(event), `post-disposal cancellation cannot reach ${event}`);
    }
    assertPreparationCovered(harness, 'post-disposal cancellation checkpoint');
    assert.equal(harness.trace.status, 'failed');
    assert.equal(harness.trace.stageIntervals.at(-1).stage, 'roster');
    assert.equal(harness.trace.stageIntervals.at(-1).endTime, harness.trace.endedAt);
    assert.equal(harness.trace.revealSlices.length, 0);
  } finally { harness.releaseAssetDisposal(); await result; }
}

for (const outcome of ['resolve', 'reject', 'cancel-resolve', 'cancel-reject']) {
  const harness = createHarness();
  const controller = new AbortController();
  harness.request.signal = controller.signal;
  const gate = deferred();
  const receipt = { draws: 1, durationMs: 12 };
  const failure = new Error('final shadow render failed');
  const cancelled = outcome.startsWith('cancel-');
  const rejected = outcome.endsWith('reject');
  const forbidden = ['blackWatchdog', 'loading:false', 'ambient:true', 'primeReveal',
    'hide', 'ready', 'waiting:false', 'adaptive:false'];
  let settled = false;
  harness.options.warm.finalShadows = (signal) => {
    assert.strictEqual(signal, controller.signal);
    harness.events.push('finalShadows');
    return gate.promise;
  };
  const result = harness.runtime.present(harness.request).then(
    () => { settled = true; return { ok: true }; },
    (error) => { settled = true; return { ok: false, error }; },
  );
  try {
    await waitForEvent(harness.events, 'finalShadows');
    assert.equal(settled, false, `${outcome}: final shadow work is joined`);
    assert.equal(harness.events.filter((event) => event === 'activate').length, 1,
      'the final camera is activated exactly once before shadow preparation');
    assert.equal(harness.loaderVisible, true);
    assert.equal(harness.trace.status, 'pending');
    assert.equal(harness.trace.shadowPrime, undefined, 'a pending receipt is never a Promise');
    assert.equal(harness.trace.endedAt, undefined);
    assert.equal(harness.trace.stageIntervals.at(-1).stage, 'reveal');
    assert.equal(harness.trace.stageIntervals.at(-1).endTime, undefined);
    assert.deepEqual(harness.trace.revealSlices.map((row) => row.stage),
      ['activation', 'finalShadows']);
    assert.equal(harness.trace.revealSlices.at(-1).endTime, undefined);
    for (const event of forbidden) {
      assert.ok(!harness.events.includes(event), `${outcome}: pending shadows cannot reach ${event}`);
    }
    if (cancelled) {
      controller.abort('leave while final shadows are pending');
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(settled, false, 'cancellation must drain owned shadow work before returning');
      assert.equal(harness.trace.status, 'pending');
    }
    harness.events.push('shadowsSettled');
    if (rejected) gate.reject(failure);
    else gate.resolve(receipt);
    const completed = await result;
    assert.equal(harness.events.filter((event) => event === 'activate').length, 1);
    assert.strictEqual(harness.trace.shadowPrime, rejected ? undefined : receipt);
    const slice = harness.trace.revealSlices.find((row) => row.stage === 'finalShadows');
    assert.ok(slice.endTime > slice.startTime && slice.endTime <= harness.trace.endedAt);
    if (cancelled || rejected) {
      assert.equal(completed.ok, false);
      if (rejected) assert.strictEqual(completed.error, failure,
        'fatal shadow failures propagate unchanged, including cancellation while draining');
      else assert.ok(isNetworkBattleEntryAbortError(completed.error));
      assert.equal(harness.trace.status, 'failed');
      assert.equal(harness.trace.stageIntervals.at(-1).endTime, harness.trace.endedAt);
      assert.deepEqual(harness.trace.revealSlices.map((row) => row.stage),
        ['activation', 'finalShadows']);
      assert.equal(harness.loaderVisible, true, 'the launcher retains opaque Garage recovery ownership');
      assert.strictEqual(harness.publishedBridge, harness.preparedBridge);
      assert.equal(harness.disposed, false, 'the presentation owner does not double-dispose its published bridge');
      for (const event of forbidden) {
        assert.ok(!harness.events.includes(event), `${outcome}: failed shadows cannot reach ${event}`);
      }
      assert.ok(!harness.progress.some(([fraction, label]) => fraction === 1 || label === 'Ready'));
    } else {
      assert.deepEqual(completed, { ok: true });
      assert.equal(harness.trace.status, 'complete');
      assert.ok(harness.events.indexOf('blackWatchdog') > harness.events.indexOf('shadowsSettled'));
      assert.ok(harness.events.indexOf('hidden') < harness.events.indexOf('ready'));
    }
  } finally {
    gate.resolve(receipt);
    await result;
  }
}

for (const outcome of ['return', 'throw']) {
  const harness = createHarness();
  const receipt = { draws: 0, skipped: true };
  const failure = new Error('synchronous shadow failure');
  harness.options.warm.finalShadows = () => {
    if (outcome === 'throw') throw failure;
    return receipt;
  };
  if (outcome === 'return') {
    await harness.runtime.present(harness.request);
    assert.strictEqual(harness.trace.shadowPrime, receipt, 'synchronous shadow adapters are supported');
  } else {
    await assert.rejects(harness.runtime.present(harness.request), (error) => error === failure);
    assert.equal(harness.trace.status, 'failed');
    assert.equal(harness.trace.revealSlices.at(-1).stage, 'finalShadows');
    assert.equal(harness.trace.revealSlices.at(-1).endTime, harness.trace.endedAt);
    assert.equal(harness.loaderVisible, true);
    assert.ok(!harness.events.includes('blackWatchdog') && !harness.events.includes('ready'));
  }
}

{
  const harness = createHarness();
  const controller = new AbortController();
  harness.request.signal = controller.signal;
  harness.options.presentation.activate = () => controller.abort('closed during atomic activation');
  await assert.rejects(harness.runtime.present(harness.request), isNetworkBattleEntryAbortError);
  assert.deepEqual(harness.trace.revealSlices.map((row) => row.stage), ['activation']);
  assert.equal(harness.loaderVisible, true);
  for (const event of ['finalShadows', 'blackWatchdog', 'primeReveal', 'hide', 'ready']) {
    assert.ok(!harness.events.includes(event), `obsolete activation cannot reach ${event}`);
  }
}

for (const outcome of ['success', 'cancel', 'failure']) {
  const harness = createHarness(outcome === 'failure' ? 'playerPanel' : '', 'playerPanel');
  const controller = new AbortController();
  harness.request.signal = controller.signal;
  const pending = harness.runtime.present(harness.request);
  const observed = pending.then(() => ({ ok: true }), (error) => ({ ok: false, error }));
  await waitForEvent(harness.events, 'compiled');
  assertPreparationCovered(harness, outcome);
  assert.equal(harness.trace.status, 'pending');
  assert.equal(harness.trace.stageIntervals.at(-1).stage, 'panelJoin');
  assert.equal(harness.trace.stageIntervals.at(-1).endTime, undefined);
  assert.ok(harness.events.indexOf('wrecks') < harness.events.indexOf('playerPanel'));
  assert.ok(harness.events.indexOf('playerPanel') < harness.events.indexOf('compile'));
  const panel = harness.trace.preparationSlices.find((row) => row.stage === 'panelMasks');
  const compile = harness.trace.preparationSlices.find((row) => row.stage === 'compile');
  assert.ok(panel.startTime <= compile.startTime, 'panel work begins before scene compile');
  assert.equal(panel.endTime, undefined, 'pending panel lifetime is not closed by compile completion');
  assert.ok(compile.endTime >= compile.startTime, 'scene compilation progresses while masks remain pending');
  assert.ok(harness.trace.stageIntervals.at(-1).startTime >= compile.endTime,
    'panelJoin measures only the remaining wait after compilation');
  if (outcome === 'cancel') controller.abort('leave while preparing panel masks');
  harness.releasePanel();
  const result = await observed;
  assertClosedPreparation(harness);
  assert.ok(panel.endTime > compile.endTime, 'the full mask slice retains the overlapping job lifetime');
  if (outcome === 'success') {
    assert.equal(result.ok, true);
    assert.ok(harness.events.indexOf('compiled') < harness.events.indexOf('panelReady'));
    assert.ok(harness.events.indexOf('panelReady') < harness.events.indexOf('effects'));
    assert.ok(harness.trace.stages.panelJoin < panel.endTime - panel.startTime,
      'residual stage duration does not double-count the full overlapping mask lifetime');
  } else {
    assert.equal(result.ok, false);
    if (outcome === 'cancel') assert.ok(isNetworkBattleEntryAbortError(result.error));
    else assert.match(result.error.message, /playerPanel failed/);
    assert.equal(harness.trace.status, 'failed');
    assert.equal(harness.trace.stageIntervals.at(-1).stage, 'panelJoin');
    assert.equal(harness.trace.stageIntervals.at(-1).endTime, harness.trace.endedAt);
    assertPreparationCovered(harness, outcome);
  }
}

{
  const harness = createHarness('', 'compile');
  const pending = harness.runtime.present(harness.request);
  await waitForEvent(harness.events, 'compile');
  assert.ok(harness.events.includes('panelReady'), 'the panel can finish before scene compilation');
  assertPreparationCovered(harness, 'compile still pending');
  const panel = harness.trace.preparationSlices.find((row) => row.stage === 'panelMasks');
  const compile = harness.trace.preparationSlices.find((row) => row.stage === 'compile');
  assert.ok(Number.isFinite(panel.endTime));
  assert.equal(compile.endTime, undefined);
  harness.releaseCompile();
  await pending;
  assertClosedPreparation(harness);
  assert.ok(compile.endTime > panel.endTime);
  assert.ok(harness.events.indexOf('compiled') < harness.events.indexOf('effects'),
    'completed masks cannot bypass the pending scene job');
}

for (const outcome of ['synchronous-throw', 'early-rejection']) {
  const harness = createHarness('', 'compile');
  const panelGate = deferred();
  const original = new Error(`panel ${outcome}`);
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  let settled = false;
  harness.options.warm.playerPanel = () => {
    harness.events.push('playerPanel');
    if (outcome === 'synchronous-throw') throw original;
    return panelGate.promise;
  };
  const result = harness.runtime.present(harness.request).then(
    () => { settled = true; return { ok: true }; },
    (error) => { settled = true; return { ok: false, error }; },
  );
  try {
    await waitForEvent(harness.events, 'compile');
    if (outcome === 'early-rejection') panelGate.reject(original);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, [], `${outcome}: panel rejection is observed while compile is held`);
    assert.equal(settled, false, 'a failed panel cannot abandon the still-owned compile job');
    assertPreparationCovered(harness, outcome);
    const panel = harness.trace.preparationSlices.find((row) => row.stage === 'panelMasks');
    assert.ok(Number.isFinite(panel.endTime), 'failed panel timing closes at its own settlement');
    harness.releaseCompile();
    const completed = await result;
    assert.equal(completed.ok, false);
    assert.strictEqual(completed.error, original, 'the panel failure is preserved after compile joins');
    assert.equal(harness.trace.status, 'failed');
    assertClosedPreparation(harness);
    assertPreparationCovered(harness, outcome);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
  } finally {
    panelGate.resolve();
    harness.releaseCompile();
    await result;
    process.removeListener('unhandledRejection', onUnhandled);
  }
}

for (const failure of ['compile-frame', 'abort-frame', 'abort-compile', 'optional-compile']) {
  for (const panelOutcome of ['resolve', 'reject']) {
    const harness = createHarness('', failure === 'abort-compile' ? 'compile' : '');
    const controller = new AbortController();
    const panelGate = deferred();
    const frameFailure = new Error('compile frame failed');
    const panelFailure = new Error('panel failed while cleanup waited');
    harness.request.signal = controller.signal;
    harness.options.warm.playerPanel = async () => {
      harness.events.push('playerPanel');
      await panelGate.promise;
      harness.events.push('panelReady');
    };
    if (failure === 'compile-frame' || failure === 'abort-frame') {
      const nextFrame = harness.options.load.nextFrame;
      harness.options.load.nextFrame = async () => {
        await nextFrame();
        if (harness.progress.at(-1)?.[1] !== 'Compiling combat shaders') return;
        harness.events.push('compileBoundary');
        if (failure === 'compile-frame') throw frameFailure;
        controller.abort('cancelled at compile paint boundary');
      };
    } else if (failure === 'optional-compile') {
      harness.options.warm.compile = async () => {
        harness.events.push('compile');
        throw new Error('optional shader warm failed');
      };
    }
    let settled = false;
    const result = harness.runtime.present(harness.request).then(
      () => { settled = true; return { ok: true }; },
      (error) => { settled = true; harness.events.push('launcherCleanup'); return { ok: false, error }; },
    );
    try {
      await waitForEvent(harness.events, failure.endsWith('frame') ? 'compileBoundary' : 'compile');
      if (failure === 'abort-compile') {
        controller.abort('cancelled during native shader warm');
        harness.releaseCompile();
      }
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(settled, false, `${failure}/${panelOutcome}: entry drains outstanding panel work`);
      assert.equal(harness.trace.status, 'pending');
      assert.ok(!harness.events.includes('launcherCleanup'));
      assertPreparationCovered(harness, failure);
      harness.events.push('panelSettling');
      if (panelOutcome === 'reject') panelGate.reject(panelFailure);
      else panelGate.resolve();
      const completed = await result;
      assertClosedPreparation(harness);
      if (failure === 'optional-compile' && panelOutcome === 'resolve') {
        assert.equal(completed.ok, true, 'ordinary compile failure remains a soft warm fallback');
        assert.ok(harness.events.indexOf('panelReady') < harness.events.indexOf('effects'));
        assert.ok(harness.events.includes('primeReveal') && harness.events.includes('ready'));
      } else {
        assert.equal(completed.ok, false);
        if (failure === 'compile-frame') assert.strictEqual(completed.error, frameFailure,
          'draining a later panel rejection preserves the primary compile-frame error');
        else if (failure === 'optional-compile') assert.strictEqual(completed.error, panelFailure,
          'a fatal panel failure wins over an optional compile failure');
        else assert.ok(isNetworkBattleEntryAbortError(completed.error),
          'entry cancellation remains authoritative after draining panel rejection');
        assert.ok(harness.events.indexOf('launcherCleanup') > harness.events.indexOf('panelSettling'));
        assert.equal(harness.trace.status, 'failed');
        assertPreparationCovered(harness, failure);
      }
    } finally {
      panelGate.resolve();
      harness.releaseCompile();
      await result;
    }
  }
}

{
  const harness = createHarness();
  const controller = new AbortController();
  const reason = 'cancelled while the final observed panel result drains';
  harness.request.signal = controller.signal;
  const now = harness.options.load.now;
  let queued = false;
  const runtime = createNetworkBattlePresentationRuntime({
    ...harness.options,
    load: { ...harness.options.load, now: () => {
      if (!queued && harness.trace?.stageIntervals.at(-1)?.stage === 'panelJoin') {
        const panel = harness.trace.preparationSlices.find((row) => row.stage === 'panelMasks');
        assert.ok(Number.isFinite(panel.endTime), 'panel completion precedes the final drain checkpoint');
        queued = true;
        queueMicrotask(() => controller.abort(reason));
      }
      return now();
    } },
  });
  await assert.rejects(runtime.present(harness.request), (error) =>
    isNetworkBattleEntryAbortError(error) && error.name === 'AbortError' && error.message === reason,
  'cancellation during the final drain normalizes before any opening-effects submission');
  assert.equal(queued, true, 'the injected clock schedules cancellation when panelJoin closes');
  assert.ok(harness.events.includes('panelReady') && harness.events.includes('compiled'));
  assert.equal(harness.trace.status, 'failed');
  assertClosedPreparation(harness);
  assertPreparationCovered(harness, 'final reflected-panel drain cancellation');
  assert.equal(harness.trace.revealSlices.length, 0);
}

{
  const harness = createHarness();
  harness.request.viewerId = 'peer';
  harness.preparedBridge.entities.get('peer').specId = 'm1a1';
  await harness.runtime.present(harness.request);
  assert.equal(harness.panelRequests.length, 1);
  assert.strictEqual(harness.panelRequests[0].bridge, harness.preparedBridge);
  assert.equal(harness.panelRequests[0].viewerId, 'peer', 'viewer identity is independent from own/spec ID');
  assert.strictEqual(harness.panelRequests[0].entity, harness.preparedBridge.entities.get('peer'),
    'duplicate tank picks still prepare the exact viewer visual');
}

for (const kind of ['spectator', 'missing-viewer']) {
  const harness = createHarness();
  if (kind === 'spectator') harness.request.own.team = 'spectator';
  else harness.preparedBridge.entities.delete(harness.request.viewerId);
  await harness.runtime.present(harness.request);
  assert.equal(harness.panelRequests.length, 0, `${kind}: do not prepare another player panel`);
  assert.ok(harness.trace.stageIntervals.some((row) => row.stage === 'panelJoin'));
  assert.deepEqual(harness.trace.preparationSlices.map((row) => row.stage), ['rosterAssets', 'compile'],
    `${kind}: skipped panel work cannot claim an actual preparation interval`);
  assert.ok(harness.events.includes('compile'), `${kind}: the normal scene warm still runs`);
  assert.equal(harness.events.includes('finalShadows'), kind !== 'spectator',
    'only a player has the snapped final-camera pose required for covered shadow reuse');
}

for (const pauseAt of ['primeReveal', 'hide']) {
  const harness = createHarness('', pauseAt, { revealMs: 2200, fadeMs: 230 });
  harness.request.own.team = 'spectator';
  harness.options.warm.finalShadows = () => {
    assert.fail('a blending spectator camera cannot reuse player-primed shadows');
  };
  const pending = harness.runtime.present(harness.request);
  await waitForEvent(harness.events, pauseAt);
  assert.ok(harness.events.indexOf('blackWatchdog') > harness.events.indexOf('activate'));
  assert.ok(harness.events.indexOf('primeReveal') > harness.events.indexOf('blackWatchdog'));
  assert.equal(harness.loaderVisible, true, `${pauseAt}: spectator entry remains covered`);
  assert.equal(harness.trace.status, 'pending');
  assert.equal(harness.trace.shadowPrime, undefined, 'spectators do not claim a shadow-prime receipt');
  assert.ok(!harness.trace.revealSlices.some((row) => row.stage === 'finalShadows'));
  assert.ok(!harness.events.includes('ready'), `${pauseAt}: spectators retain the complete reveal barrier`);
  assert.equal(harness.countdownMs, 5000, 'spectator preparation cannot spend the shared countdown');
  harness.revealGate.resolve();
  await pending;
  assert.equal(harness.trace.status, 'complete');
  assert.deepEqual(harness.trace.revealSlices.map((row) => row.stage),
    ['activation', 'blackWatchdog', 'primeReveal', 'loaderFade']);
  assert.ok(harness.events.indexOf('ready') > harness.events.indexOf('hidden'));
  assert.equal(harness.readySentAt, 2430, 'spectator READY follows its real frame and full loader fade');
  assert.equal(harness.countdownMs, 5000, 'spectators retain the full five-second authority countdown');
}

for (const outcome of ['resolve', 'reject', 'cancel']) {
  const harness = createHarness();
  const controller = new AbortController();
  const gate = deferred();
  harness.request.signal = controller.signal;
  harness.options.warm.wrecks = async (_bridge, signal) => {
    assert.strictEqual(signal, controller.signal, 'wreck work receives the entry cancellation signal');
    harness.events.push('wrecksDeferred');
    await gate.promise;
    signal.throwIfAborted();
  };
  const pending = harness.runtime.present(harness.request);
  await waitForEvent(harness.events, 'wrecksDeferred');
  assert.equal(harness.loaderVisible, true);
  assert.equal(harness.trace.stageIntervals.at(-1).stage, 'wreckWarm');
  assert.ok(!harness.events.includes('compile'));
  assert.ok(!harness.events.includes('playerPanel'), 'panel work cannot race unfinished wreck material preparation');
  assert.deepEqual(harness.trace.preparationSlices.map((row) => row.stage), ['rosterAssets'],
    'panel/compile work cannot start before wreck warm joins; roster assets already completed');
  assert.ok(!harness.events.includes('ready'));
  assert.equal(harness.countdownMs, 5000, 'pending wreck warm cannot spend the countdown');
  if (outcome === 'cancel') controller.abort('return during wreck preparation');
  if (outcome === 'reject') gate.reject(new Error('wreck preparation failed'));
  else gate.resolve();
  if (outcome === 'resolve') await pending;
  else {
    await assert.rejects(pending, outcome === 'cancel'
      ? (error) => error === controller.signal.reason : /wreck preparation failed/);
    assert.equal(harness.trace.status, 'failed');
    assert.equal(harness.trace.stageIntervals.at(-1).endTime, harness.trace.endedAt);
    for (const stage of ['compile', 'effects', 'activate', 'hide', 'ready']) {
      assert.ok(!harness.events.includes(stage), `${outcome}: wreck failure cannot reach ${stage}`);
    }
  }
}

for (const outcome of ['resolve', 'reject', 'cancel']) {
  const harness = createHarness();
  const controller = new AbortController();
  const gate = deferred();
  const scarCompile = { uniformCount: 1, uniformPending: 0 };
  const laterStages = ['cards', 'activate', 'finalShadows', 'blackWatchdog', 'hide', 'ready'];
  harness.request.signal = controller.signal;
  harness.options.warm.openingEffects = async (_fx, _bridge, signal) => {
    assert.strictEqual(signal, controller.signal, 'scar work receives the entry cancellation signal');
    harness.events.push('effectsDeferred');
    await gate.promise;
    signal.throwIfAborted();
    return scarCompile;
  };
  const pending = harness.runtime.present(harness.request);
  await waitForEvent(harness.events, 'effectsDeferred');
  assert.equal(harness.loaderVisible, true, 'deferred scar warming remains covered');
  assert.equal(harness.trace.stageIntervals.at(-1).stage, 'combatWarm');
  assert.equal(harness.trace.scarCompile, undefined, 'pending work cannot claim a completed receipt');
  assert.equal(harness.countdownMs, 5000, 'pending scar warm cannot spend the countdown');
  for (const stage of laterStages) assert.ok(!harness.events.includes(stage), `pending scar warm cannot reach ${stage}`);
  if (outcome === 'cancel') controller.abort('return during scar preparation');
  if (outcome === 'reject') gate.reject(new Error('scar preparation failed'));
  else gate.resolve();
  if (outcome === 'resolve') {
    await pending;
    assert.deepEqual(harness.trace.scarCompile, scarCompile);
    assert.equal(harness.trace.status, 'complete');
    assert.ok(harness.events.indexOf('ready') > harness.events.indexOf('hidden'));
    assert.equal(harness.countdownMs, 5000, 'completed scar warm preserves the full countdown');
  } else {
    await assert.rejects(pending, outcome === 'cancel'
      ? (error) => error === controller.signal.reason : /scar preparation failed/);
    assert.equal(harness.trace.status, 'failed');
    assert.equal(harness.trace.stageIntervals.at(-1).endTime, harness.trace.endedAt);
    for (const stage of laterStages) {
      assert.ok(!harness.events.includes(stage), `${outcome}: scar failure cannot reach ${stage}`);
    }
  }
}

for (const pauseAt of ['compileFrame', 'compile']) {
  const harness = createHarness('', pauseAt);
  const controller = new AbortController();
  harness.request.signal = controller.signal;
  const pending = harness.runtime.present(harness.request);
  await waitForEvent(harness.events, pauseAt);
  assert.equal(harness.trace.status, 'pending');
  assert.equal(harness.trace.stageIntervals.at(-1).stage, 'compile');
  assert.equal(harness.trace.stageIntervals.at(-1).endTime, undefined);
  assert.ok(harness.events.includes('wrecks'), 'wreck hooks are installed before the final scene compile');
  assert.ok(!harness.events.includes('effects'), 'the compositor cannot draw while scene compile is deferred');
  assert.equal(harness.loaderVisible, true, 'deferred scene compilation remains covered');
  controller.abort('return to Garage during scene compile');
  harness.releaseCompile();
  await assert.rejects(pending, (error) => isNetworkBattleEntryAbortError(error));
  assert.equal(harness.trace.status, 'failed');
  assert.equal(harness.trace.stageIntervals.at(-1).endTime, harness.trace.endedAt);
  assert.equal(harness.trace.revealSlices.length, 0);
  if (pauseAt === 'compileFrame') assert.ok(!harness.events.includes('compile'),
    'cancellation at the compile frame boundary skips expensive shader work');
  else assert.ok(!harness.events.includes('compiled'),
    'the scene warm port receives the entry cancellation signal');
  for (const stage of ['effects', 'activate', 'primeReveal', 'hide', 'ready', 'adaptive:false']) {
    assert.ok(!harness.events.includes(stage), `${pauseAt}: cancelled compile cannot reach ${stage}`);
  }
}

for (const [failure, slice] of [['primeReveal', 'primeReveal'], ['hide', 'loaderFade']]) {
  const harness = createHarness(failure, failure);
  const pending = harness.runtime.present(harness.request);
  await waitForEvent(harness.events, failure);
  assert.equal(harness.trace.status, 'pending');
  assert.equal(harness.trace.stageIntervals.at(-1).stage, 'reveal');
  assert.equal(harness.trace.revealSlices.at(-1).stage, slice);
  assert.equal(harness.trace.revealSlices.at(-1).endTime, undefined,
    'a blocked reveal operation remains visibly pending');
  harness.revealGate.resolve();
  await assert.rejects(pending, new RegExp(`${failure} failed`));
  assert.equal(harness.trace.status, 'failed');
  assert.equal(harness.trace.stageIntervals.at(-1).endTime, harness.trace.endedAt);
  assert.equal(harness.trace.revealSlices.at(-1).endTime, harness.trace.endedAt);
  assert.ok(!harness.events.includes('ready'), 'partial failure cannot reach READY');
}

{
  const harness = createHarness();
  const original = new Error('activation failed');
  harness.options.presentation.activate = () => { throw original; };
  await assert.rejects(harness.runtime.present(harness.request), (error) => error === original);
  assert.equal(harness.trace.status, 'failed');
  assert.deepEqual(harness.trace.revealSlices.map((row) => row.stage), ['activation']);
  assert.equal(harness.trace.revealSlices[0].endTime, harness.trace.endedAt);
  assert.ok(!harness.events.includes('blackWatchdog'));
}

{
  const harness = createHarness();
  harness.options.presentation.runBlackWatchdog = () => { throw new Error('watchdog failed'); };
  await assert.rejects(harness.runtime.present(harness.request), /Battle graphics could not be verified/);
  assert.equal(harness.trace.status, 'failed', 'unexpected watchdog failure cannot verify the battle frame');
  assert.deepEqual(harness.trace.blackCheck, { failed: true, error: 'watchdog failed' });
  assert.ok(harness.trace.revealSlices.some((row) => row.stage === 'blackWatchdog' && row.endTime > 0),
    'the caught watchdog failure still closes its timing interval');
  assert.equal(harness.loaderVisible, true, 'an unverified battle frame remains covered');
  assert.equal(harness.countdownMs, 5000, 'failed verification cannot spend the authority countdown');
  for (const event of ['loading:false', 'ambient:true', 'primeReveal', 'hide', 'ready',
    'waiting:false', 'adaptive:false']) {
    assert.ok(!harness.events.includes(event), `unexpected watchdog failure cannot reach ${event}`);
  }
  assert.ok(!harness.progress.some(([fraction, label]) => fraction === 1 || label === 'Ready'));
}

{
  const harness = createHarness();
  const failed = { before: 0, after: null, rescued: false, stage: null, failed: true };
  harness.options.presentation.runBlackWatchdog = async () => failed;
  await assert.rejects(harness.runtime.present(harness.request), /Battle graphics could not be verified/);
  assert.equal(harness.trace.blackCheck, failed);
  assert.equal(harness.trace.status, 'failed');
  assert.equal(harness.loaderVisible, true, 'known-black or unrestorable frames remain covered');
  for (const event of ['loading:false', 'ambient:true', 'primeReveal', 'hide', 'ready']) {
    assert.ok(!harness.events.includes(event), `failed graphics verification cannot reach ${event}`);
  }
}

for (const outcome of ['resolve', 'reject', 'cancel-resolve', 'cancel-reject']) {
  const harness = createHarness();
  const controller = new AbortController();
  harness.request.signal = controller.signal;
  const gate = deferred();
  const receipt = { ok: true, checked: 2 };
  const failure = new Error('async watchdog failed');
  const signals = [];
  const cancelled = outcome.startsWith('cancel-');
  const rejected = outcome.endsWith('reject');
  let settled = false;
  harness.options.presentation.runBlackWatchdog = (signal) => {
    signals.push(signal);
    harness.events.push('blackWatchdog');
    return gate.promise;
  };
  const pending = harness.runtime.present(harness.request);
  // Observe settlement without leaving a rejected entry promise unhandled.
  const result = pending.then(
    () => { settled = true; return { ok: true }; },
    (error) => { settled = true; return { ok: false, error }; },
  );
  try {
    await waitForEvent(harness.events, 'blackWatchdog');
    assert.equal(settled, false, `${outcome}: entry awaits the watchdog result`);
    assert.deepEqual(signals, [controller.signal], 'the watchdog receives the exact entry signal');
    assert.equal(harness.loaderVisible, true, 'a pending watchdog remains under the opaque loader');
    assert.equal(harness.trace.status, 'pending');
    assert.equal(harness.trace.blackCheck, undefined, 'pending telemetry never stores a Promise');
    assert.equal(harness.trace.endedAt, undefined);
    assert.equal(harness.trace.stageIntervals.at(-1).stage, 'reveal');
    assert.equal(harness.trace.stageIntervals.at(-1).endTime, undefined);
    assert.deepEqual(harness.trace.revealSlices.map((row) => row.stage),
      ['activation', 'finalShadows', 'blackWatchdog']);
    assert.ok(harness.trace.revealSlices[0].endTime > 0);
    assert.equal(harness.trace.revealSlices.at(-1).endTime, undefined);
    const forbidden = ['loading:false', 'ambient:true', 'primeReveal', 'hide', 'ready',
      'waiting:false', 'adaptive:false'];
    for (const event of forbidden) {
      assert.ok(!harness.events.includes(event), `${outcome}: pending watchdog cannot reach ${event}`);
    }
    assert.ok(!harness.progress.some(([fraction, label]) => fraction === 1 || label === 'Ready'),
      'a pending watchdog cannot publish terminal loading progress');

    if (cancelled) {
      controller.abort('leave while checking the first battle frame');
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(settled, false, 'cancellation still joins the owned watchdog work');
      assert.equal(harness.trace.status, 'pending');
    }
    harness.events.push('watchdogSettled');
    if (rejected) gate.reject(failure);
    else gate.resolve(receipt);
    const completed = await result;
    assert.deepEqual(harness.trace.blackCheck, rejected ? { failed: true, error: failure.message } : receipt,
      'telemetry records the settled receipt or ordinary rejection, never the pending Promise');
    if (!rejected) assert.strictEqual(harness.trace.blackCheck, receipt);
    const slice = harness.trace.revealSlices.find((row) => row.stage === 'blackWatchdog');
    assert.ok(slice.endTime > slice.startTime, 'resolution and rejection both close watchdog timing');
    if (cancelled || rejected) {
      assert.equal(completed.ok, false);
      if (cancelled) {
        assert.ok(isNetworkBattleEntryAbortError(completed.error),
          'entry cancellation wins even when the watchdog rejects');
        assert.equal(completed.error.message, 'leave while checking the first battle frame');
      } else {
        assert.match(completed.error.message, /Battle graphics could not be verified/,
          'unexpected rejection fails graphics verification');
      }
      assert.equal(harness.trace.status, 'failed');
      assert.equal(harness.trace.stageIntervals.at(-1).stage, 'reveal');
      assert.equal(harness.trace.stageIntervals.at(-1).endTime, harness.trace.endedAt);
      assert.deepEqual(harness.trace.revealSlices.map((row) => row.stage),
        ['activation', 'finalShadows', 'blackWatchdog']);
      assert.ok(slice.endTime <= harness.trace.endedAt);
      assert.equal(harness.loaderVisible, true);
      assert.equal(harness.countdownMs, 5000, 'failed verification cannot spend the authority countdown');
      for (const event of forbidden) {
        assert.ok(!harness.events.includes(event), `${outcome}: failed watchdog cannot reach ${event}`);
      }
      assert.ok(!harness.progress.some(([fraction, label]) => fraction === 1 || label === 'Ready'));
    } else {
      assert.deepEqual(completed, { ok: true }, 'a verified async watchdog result permits reveal');
      assert.equal(harness.trace.status, 'complete');
      for (const event of ['loading:false', 'ambient:true', 'primeReveal', 'hide', 'ready']) {
        assert.ok(harness.events.indexOf(event) > harness.events.indexOf('watchdogSettled'),
          `${outcome}: ${event} follows the settled watchdog`);
      }
      assert.ok(harness.events.indexOf('hidden') < harness.events.indexOf('ready'));
      assert.equal(harness.loaderVisible, false);
    }
  } finally {
    gate.resolve(receipt);
    await result;
  }
}

{
  const harness = createHarness('compile');
  await harness.runtime.present(harness.request);
  assert.ok(!harness.events.includes('compiled'), 'the injected scene compile failed');
  assert.ok(harness.events.indexOf('compile') < harness.events.indexOf('effects'),
    'the covered compositor draw remains the best-effort shader fallback');
  assert.ok(harness.events.includes('primeReveal') && harness.events.includes('ready'),
    'a shader warm failure does not bypass or prevent the real-frame and readiness barriers');
  assert.equal(harness.waitingForPeers, false);
  assert.ok(harness.events.includes('adaptive:false'));
}

{
  const harness = createHarness('', 'ready', { shadowMs: 1700, revealMs: 2200, fadeMs: 230 });
  const pending = harness.runtime.present(harness.request);
  await waitForEvent(harness.events, 'ready');
  assert.equal(harness.elapsedMs, 4130, 'final shadows, first visible frame, and fade finish before READY');
  assert.equal(harness.readySentAt, 4130, 'local READY cannot spend authority countdown behind the loader');
  assert.equal(harness.loaderVisible, false, 'waiting happens in the visible battlefield');
  assert.equal(harness.waitingForPeers, true, 'the visible battlefield explains peer loading');
  assert.equal(harness.countdownMs, 5000, 'expensive reveal and fade consume no authority countdown');
  assert.ok(!harness.events.includes('adaptive:false'), 'peer readiness still owns adaptive suspension');
  harness.releaseReadiness();
  await pending;
  assert.equal(harness.countdownMs, 5000, 'the complete five-second countdown starts once peers are ready');
  assert.equal(harness.waitingForPeers, false);
}

for (const phase of ['countdown', 'playing']) {
  const harness = createHarness('', 'primeReveal', {
    phase, countdownMs: phase === 'countdown' ? 2000 : 0, revealMs: 250, fadeMs: 230,
  });
  const pending = harness.runtime.present(harness.request);
  await waitForEvent(harness.events, 'primeReveal');
  assert.equal(harness.waitingForPeers, false, `${phase}: do not label a late join as peer loading`);
  assert.ok(harness.events.includes('waiting:false'), `${phase}: clear any previous round's waiting state`);
  harness.revealGate.resolve();
  await pending;
  assert.equal(harness.phase, phase, `${phase}: do not reset authority phase`);
  assert.equal(harness.countdownMs, phase === 'countdown' ? 1520 : 0,
    `${phase}: preserve authority time instead of restarting a five-second countdown`);
}

{
  const harness = createHarness('', 'visuals');
  const pending = harness.runtime.present(harness.request);
  await waitForEvent(harness.events, 'visuals');
  assert.ok(harness.events.includes('modules'), 'network modules transfer alongside visual facade');
  assert.ok(harness.events.includes('world'), 'world starts while the visual facade is deferred');
  assert.ok(harness.events.includes('connect'), 'transport starts while the visual facade is deferred');
  assert.ok(!harness.events.includes('createBridge'), 'deferred visuals cannot create a bridge');
  harness.releaseVisuals();
  await pending;
  assert.ok(harness.events.includes('createBridge'));
}

{
  const harness = createHarness('visuals');
  await assert.rejects(harness.runtime.present(harness.request), /visuals failed/);
  assert.ok(!harness.events.includes('createBridge'), 'failed visuals cannot create a bridge');
  assert.ok(!harness.events.includes('ready'), 'failed visuals cannot send local READY');
}

for (const failure of ['primeReveal', 'hide', 'ready']) {
  const harness = createHarness(failure);
  await assert.rejects(harness.runtime.present(harness.request), new RegExp(`${failure} failed`));
  if (failure !== 'ready') assert.ok(!harness.events.includes('ready'), `${failure}: no false local READY`);
  assert.ok(!harness.events.includes('peersReady'), `${failure}: no false peer readiness`);
  assert.ok(!harness.events.includes('waiting:false'), `${failure}: do not clear waiting as if readiness succeeded`);
  assert.ok(!harness.events.includes('adaptive:false'), `${failure}: no adaptive release after failure`);
}

for (const failure of ['roster', 'initial']) {
  const harness = createHarness(failure);
  await assert.rejects(harness.runtime.present(harness.request), new RegExp(`${failure} failed`));
  assert.equal(harness.disposed, true, `${failure}: unpublished bridge is released`);
  assert.equal(harness.publishedBridge, null, `${failure}: partial bridge never becomes visible`);
  assert.ok(!harness.events.includes('activate'), `${failure}: battle never activates`);
  assert.ok(!harness.events.includes('atmosphere'), `${failure}: no weather without initial authority`);
}

{
  const harness = createHarness('atmosphere');
  await assert.rejects(harness.runtime.present(harness.request), /atmosphere failed/);
  for (const stage of ['compile', 'activate', 'primeReveal', 'hide']) {
    assert.ok(!harness.events.includes(stage), `failed atmosphere cannot reach ${stage}`);
  }
}

for (const pauseAt of ['initial', 'atmosphere']) {
  const harness = createHarness('', pauseAt);
  const controller = new AbortController();
  harness.request.signal = controller.signal;
  const pending = harness.runtime.present(harness.request);
  await waitForEvent(harness.events, pauseAt);
  assert.ok(!harness.events.includes('compile'), `${pauseAt}: first compile remains covered`);
  controller.abort('return to Garage during weather acquisition');
  if (pauseAt === 'initial') harness.releaseInitial();
  else harness.releaseAtmosphere();
  await assert.rejects(pending, (error) => isNetworkBattleEntryAbortError(error));
  for (const stage of ['compile', 'activate', 'primeReveal', 'hide']) {
    assert.ok(!harness.events.includes(stage), `${pauseAt}: aborted weather entry cannot reach ${stage}`);
  }
  if (pauseAt === 'initial') assert.ok(!harness.events.includes('atmosphere'));
}

{
  const harness = createHarness('', 'connect');
  const controller = new AbortController();
  harness.request.signal = controller.signal;
  const pending = harness.runtime.present(harness.request);
  await waitForEvent(harness.events, 'connect');
  controller.abort('room closed during transport acquisition');
  harness.releaseConnect();
  await assert.rejects(pending, (error) => isNetworkBattleEntryAbortError(error));
  assert.ok(harness.events.includes('closeMatch:network_entry_cancelled'),
    'a transport resolving after cancellation is closed before publication');
  assert.ok(!harness.events.includes('publishMatch'),
    'a cancelled transport never becomes the browser session owner');
  assert.ok(!harness.events.includes('createBridge'),
    'cancelled acquisition cannot begin visual preparation');
}

{
  const harness = createHarness('', 'roster');
  const controller = new AbortController();
  harness.request.signal = controller.signal;
  const pending = harness.runtime.present(harness.request);
  await waitForEvent(harness.events, 'prepareRoster');
  controller.abort('page session replaced during roster preparation');
  harness.releaseRoster();
  await assert.rejects(pending, (error) => isNetworkBattleEntryAbortError(error));
  assert.equal(harness.disposed, true,
    'a bridge prepared by an obsolete page session is disposed');
  assertAssetsReleased(harness);
  assert.equal(harness.publishedBridge, null,
    'an obsolete bridge never becomes render-visible');
  assert.ok(!harness.events.includes('activate'),
    'an obsolete cold load cannot remount battle presentation');
}

for (const pauseAt of ['primeReveal', 'hide', 'ready']) {
  const harness = createHarness('', pauseAt);
  const controller = new AbortController();
  harness.request.signal = controller.signal;
  const pending = harness.runtime.present(harness.request);
  await waitForEvent(harness.events, pauseAt);
  controller.abort('host_left');
  if (pauseAt === 'ready') harness.releaseReadiness();
  else harness.revealGate.resolve();
  await assert.rejects(pending, (error) => isNetworkBattleEntryAbortError(error),
    `${pauseAt}: even a final renderer await must reject obsolete entry`);
  if (pauseAt === 'primeReveal') assert.ok(!harness.events.includes('hide'));
  if (pauseAt !== 'ready') assert.ok(!harness.events.includes('ready'), `${pauseAt}: no false local READY`);
  assert.ok(!harness.events.includes('waiting:false'), 'an aborted entry cannot clear waiting as a success');
  assert.ok(!harness.events.includes('adaptive:false'),
    'an aborted reveal leaves terminal Garage cleanup to the entry owner');
}

{
  const harness = createHarness();
  delete harness.options.presentation.setWaitingForPeers;
  assert.throws(() => createNetworkBattlePresentationRuntime(harness.options),
    /requires every lifecycle port/, 'the peer-waiting presentation port is required');
}

{
  const harness = createHarness();
  delete harness.options.warm.playerPanel;
  assert.throws(() => createNetworkBattlePresentationRuntime(harness.options),
    /requires every lifecycle port/, 'the covered player-panel preparation port is required');
}

for (const invalid of [undefined, null, true]) {
  const harness = createHarness();
  harness.options.bridge.prepareRosterAssets = invalid;
  assert.throws(() => createNetworkBattlePresentationRuntime(harness.options),
    /requires every lifecycle port/, 'the optional-work roster asset owner is a required integration port');
}

for (const invalid of [undefined, null, true]) {
  const harness = createHarness();
  harness.options.warm.finalShadows = invalid;
  assert.throws(() => createNetworkBattlePresentationRuntime(harness.options),
    /requires every lifecycle port/, 'the final-camera shadow preparation port must be a function');
}

assert.throws(
  () => createNetworkBattlePresentationRuntime({}),
  /requires every lifecycle port/,
  'the deep module fails closed when a required adapter is missing',
);

console.log('networkBattlePresentationRuntime.selftest: overlapping roster assets, cold preparation, readiness, activation, and failure cleanup pass');
