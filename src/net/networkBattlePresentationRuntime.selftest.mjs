import assert from 'node:assert/strict';
import { createNetworkBattlePresentationRuntime } from './networkBattlePresentationRuntime.ts';

function createHarness(failAt = '') {
  const events = [];
  const progress = [];
  let clock = 0;
  let disposed = false;
  let publishedBridge = null;
  let publishedMatch = null;
  let trace = null;
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
      if (failAt === 'roster') throw new Error('roster failed');
    },
    apply() { events.push('apply'); },
    dispose() { disposed = true; events.push('disposeBridge'); },
  };
  const match = { client: { id: 'client' } };
  const createBrowserBattleBridge = Symbol('bridge');
  const createNetworkStatus = Symbol('status');
  const createBrowserInputRuntime = Symbol('input');
  const modules = [
    { createBrowserBattleBridge },
    { createNetworkStatus },
    { createBrowserInputRuntime },
  ];
  const runtime = createNetworkBattlePresentationRuntime({
    load: {
      battleLoad: {
        show: () => events.push('show'),
        rosters: () => events.push('rosters'),
        progress: (fraction, label) => progress.push([fraction, label]),
        hide: async () => { events.push('hide'); },
      },
      audio: {
        resume: () => events.push('audioResume'),
        loadingOn: (active) => events.push(`loading:${active}`),
        ambientOn: (active) => events.push(`ambient:${active}`),
      },
      lighting: { setFarCascadeDormant: (value) => events.push(`far:${value}`) },
      ensureBattleVisuals: async () => events.push('visuals'),
      nextFrame: async () => events.push('frame'),
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
        events.push('createBridge');
        return preparedBridge;
      },
      publish: (value) => { publishedBridge = value; events.push('publishBridge'); },
      groundSampler: () => 0,
      waitForInitialSnapshot: async () => {
        events.push('initial');
        if (failAt === 'initial') throw new Error('initial failed');
        return { entities: [] };
      },
      waitForPeerReadiness: async () => events.push('ready'),
    },
    warm: {
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
      activate: () => events.push('activate'),
      runBlackWatchdog: () => ({ ok: true }),
    },
  });

  const request = {
    viewerId: 'viewer',
    own: { id: 'viewer', specId: 'm1a1', team: 'alpha' },
    mapId: 'verdant',
    matchPlayers: [
      { id: 'viewer', specId: 'm1a1', team: 'alpha' },
      { id: 'peer', specId: 't90m', team: 'bravo' },
    ],
    modeLabel: 'Private Battle',
    connectMatch: async () => { events.push('connect'); return match; },
  };
  return {
    runtime,
    request,
    events,
    progress,
    preparedBridge,
    get disposed() { return disposed; },
    get publishedBridge() { return publishedBridge; },
    get trace() { return trace; },
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
  assert.ok(harness.events.indexOf('ready') < harness.events.indexOf('activate'),
    'peer readiness is the final activation barrier');
  assert.ok(harness.events.indexOf('activate') < harness.events.indexOf('hide'),
    'activation completes while the opaque loader still owns the screen');
  assert.deepEqual(harness.trace.blackCheck, { ok: true });
  assert.ok(harness.trace.totalMs > 0, 'the complete network entry is timed');
  assert.ok(harness.progress.some(([fraction, label]) =>
    fraction === 1 && label === 'Ready'), 'the loader reaches its terminal state');
}

for (const failure of ['roster', 'initial']) {
  const harness = createHarness(failure);
  await assert.rejects(harness.runtime.present(harness.request), new RegExp(`${failure} failed`));
  assert.equal(harness.disposed, true, `${failure}: unpublished bridge is released`);
  assert.equal(harness.publishedBridge, null, `${failure}: partial bridge never becomes visible`);
  assert.ok(!harness.events.includes('activate'), `${failure}: battle never activates`);
}

assert.throws(
  () => createNetworkBattlePresentationRuntime({}),
  /requires every lifecycle port/,
  'the deep module fails closed when a required adapter is missing',
);

console.log('networkBattlePresentationRuntime.selftest: cold preparation, readiness, activation, and failure cleanup pass');
