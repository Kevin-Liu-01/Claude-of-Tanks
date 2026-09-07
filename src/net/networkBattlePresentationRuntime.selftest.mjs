import assert from 'node:assert/strict';
import { createNetworkBattlePresentationRuntime } from './networkBattlePresentationRuntime.ts';
import { isNetworkBattleEntryAbortError } from './networkBattleEntryAbort.ts';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitForEvent(events, name) {
  for (let i = 0; i < 20 && !events.includes(name); i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(events.includes(name), `expected ${name} before continuing`);
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
    async prepareRoster() {
      events.push('prepareRoster');
      if (pauseAt === 'roster') await rosterGate.promise;
      if (failAt === 'roster') throw new Error('roster failed');
    },
    apply() { events.push('apply'); },
    dispose() { disposed = true; events.push('disposeBridge'); },
  };
  const match = {
    client: { id: 'client' },
    close: (reason) => events.push(`closeMatch:${reason}`),
  };
  const createBrowserBattleBridge = Symbol('bridge');
  const createNetworkStatus = Symbol('status');
  const createBrowserInputRuntime = Symbol('input');
  const modules = [
    { createBrowserBattleBridge },
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
      nextFrame: async () => events.push('frame'),
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
      loadModules: async () => { events.push('modules'); return modules; },
      loadWorld: async () => { events.push('world'); return {}; },
      publishMatch: (value) => { publishedMatch = value; events.push('publishMatch'); },
      getMatch: () => publishedMatch,
    },
    bridge: {
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
      create: (factory) => {
        assert.strictEqual(factory, createBrowserBattleBridge);
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
      openingEffects: async () => events.push('effects'),
      shotCards: () => events.push('cards'),
      compile: async () => events.push('compile'),
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
    ['compile', 'activate'],
  ]) assert.ok(harness.events.indexOf(before) >= 0
    && harness.events.indexOf(before) < harness.events.indexOf(after), `${before} precedes ${after}`);
  for (const [before, after] of [
    ['waiting:true', 'activate'], ['activate', 'blackWatchdog'],
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
  assert.ok(harness.trace.totalMs > 0, 'the complete network entry is timed');
  assert.ok(harness.progress.some(([fraction, label]) =>
    fraction === 1 && label === 'Ready'), 'the loader reaches its terminal state');
}

{
  const harness = createHarness('', 'ready', { revealMs: 2200, fadeMs: 230 });
  const pending = harness.runtime.present(harness.request);
  await waitForEvent(harness.events, 'ready');
  assert.equal(harness.elapsedMs, 2430, 'first visible frame and fade finish before READY');
  assert.equal(harness.readySentAt, 2430, 'local READY cannot spend authority countdown behind the loader');
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

assert.throws(
  () => createNetworkBattlePresentationRuntime({}),
  /requires every lifecycle port/,
  'the deep module fails closed when a required adapter is missing',
);

console.log('networkBattlePresentationRuntime.selftest: cold preparation, readiness, activation, and failure cleanup pass');
