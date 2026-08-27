import assert from 'node:assert/strict';
import { createBattleIntentRuntime } from './battleIntentRuntime.ts';

const flushTasks = () => new Promise((resolve) => setImmediate(resolve));

function createHarness(overrides = {}) {
  const log = [];
  const state = {
    bootComplete: true,
    phase: 'garage',
    pendingMapChoice: 'random',
    selectedSpecId: 'hero',
    battleCount: 3,
    randomMaps: ['alpine', 'desert', 'coast'],
    timers: new Map(),
    nextTimer: 1,
  };
  const options = {
    isBootComplete: () => state.bootComplete,
    getPhase: () => state.phase,
    getPendingMapChoice: () => state.pendingMapChoice,
    getSelectedSpecId: () => state.selectedSpecId,
    getBattleCount: () => state.battleCount,
    resolveMapId: (mapId) => {
      const resolved = mapId === 'random' ? state.randomMaps.shift() : mapId;
      log.push(`resolve:${mapId}:${resolved}`);
      return resolved;
    },
    loadWorldModule: async () => { log.push('world:module'); },
    prefetchWorld: async (mapId, settings) => {
      log.push(`world:${mapId}:${settings?.intent === true ? 'intent' : 'idle'}`);
    },
    ensureTankBuilder: async (specId) => { log.push(`builder:${specId}`); },
    ensureTankBuilders: async (ids) => { log.push(`builders:${ids.join(',')}`); },
    planRoster: (specId) => [specId, 'wing', 'wing'],
    getSpec: (specId) => ({ id: specId }),
    prebakeSharedTextures: async (spec, _anisotropy, quality) => {
      log.push(`texture:${spec.id}:${quality}`);
    },
    createBudgetYield: () => async () => undefined,
    anisotropy: 8,
    setCamoBiome: (mapId) => { log.push(`camo:biome:${mapId}`); },
    clearCamoOverrides: () => { log.push('camo:clear'); },
    setCamoOverride: (specId) => { log.push(`camo:auto:${specId}`); },
    applyCamoPatterns: async ({ priorityIds, onlySpecIds }) => {
      log.push(`camo:apply:${priorityIds.join(',')}:${onlySpecIds.join(',')}`);
    },
    preloadBattleVisuals: async () => { log.push('preload:visuals'); },
    preloadAudio: async () => { log.push('preload:audio'); },
    preloadSettings: async () => { log.push('preload:settings'); },
    preloadArmorOverlay: async () => { log.push('preload:armor'); },
    preloadBattleHud: async () => { log.push('preload:hud'); },
    preloadTouchControls: async () => { log.push('preload:touch'); },
    preloadSoloBattle: async () => { log.push('preload:solo'); },
    preloadBattleClient: async () => { log.push('preload:client'); },
    preloadKillcam: async () => { log.push('preload:killcam'); },
    ensureFxRuntime: async () => ({
      preloadTextures: async () => { log.push('preload:fx-textures'); },
    }),
    preloadMinimap: async (mapId) => { log.push(`preload:minimap:${mapId}`); },
    scheduleDelay: (callback, delayMs) => {
      const id = state.nextTimer++;
      state.timers.set(id, { callback, delayMs });
      return id;
    },
    cancelDelay: (id) => { state.timers.delete(id); },
    warn: (message, error) => { log.push(`warn:${message}:${error}`); },
    ...overrides,
  };
  return {
    log,
    state,
    runtime: createBattleIntentRuntime(options),
    fireTimer(id) {
      const timer = state.timers.get(id);
      assert.ok(timer, `timer ${id} exists`);
      state.timers.delete(id);
      timer.callback();
    },
  };
}

{
  const { runtime, log, state } = createHarness();
  runtime.preload({ specId: 'hero', mapId: 'random' });
  runtime.preload({ specId: 'hero', mapId: 'random' });
  await flushTasks();

  assert.equal(log.filter((entry) => entry.startsWith('resolve:random')).length, 1,
    'repeat intent reuses one concrete Random-map reservation');
  for (const owner of ['visuals', 'audio', 'settings', 'armor', 'hud', 'touch',
    'solo', 'client', 'killcam', 'fx-textures']) {
    assert.ok(log.includes(`preload:${owner}`), `${owner} starts from explicit intent`);
  }
  assert.ok(log.includes('builders:hero,wing,wing'),
    'intent transfers only the exact planned roster');
  assert.equal(log.filter((entry) => entry === 'texture:hero:preview').length, 1,
    'same-key intent coalesces the selected preview texture work');
  assert.equal(log.filter((entry) => entry === 'texture:wing:ai').length, 1,
    'duplicate roster ids produce one AI texture bake');
  assert.ok(log.includes('world:alpine:intent') && log.includes('preload:minimap:alpine'),
    'intent starts the concrete world and minimap without constructing either here');

  assert.equal(runtime.consumeMap('hero', 'random'), 'alpine',
    'the click consumes the exact world reserved by hover intent');
  assert.equal(runtime.consumeMap('hero', 'random'), 'desert',
    'a consumed reservation cannot leak into the next battle');
  state.battleCount++;
  runtime.preload({ specId: 'hero', mapId: 'random' });
  await flushTasks();
  assert.equal(runtime.consumeMap('hero', 'random'), 'coast',
    'a new battle count receives a new deterministic reservation');
}

{
  let releaseOldTexture;
  let oldTextureStartedResolve;
  const oldTextureStarted = new Promise((resolve) => { oldTextureStartedResolve = resolve; });
  const oldTextureGate = new Promise((resolve) => { releaseOldTexture = resolve; });
  let firstTexture = true;
  const harness = createHarness({
    prebakeSharedTextures: async (spec, _anisotropy, quality) => {
      harness.log.push(`texture:${spec.id}:${quality}`);
      if (firstTexture) {
        firstTexture = false;
        oldTextureStartedResolve();
        await oldTextureGate;
      }
    },
  });
  harness.runtime.preload({ specId: 'hero' });
  await oldTextureStarted;
  const prepare = harness.runtime.prepareRoster({
    specId: 'hero',
    mapId: 'verdant',
    rosterIds: ['hero', 'wing'],
    autoCamoIds: ['wing'],
    yieldForBudget: async () => undefined,
  });
  await flushTasks();
  assert.equal(harness.log.some((entry) => entry.startsWith('camo:')), false,
    'covered preparation waits for an in-flight hover bake before repainting shared canvases');
  releaseOldTexture();
  await prepare;

  const expectedOrder = [
    'camo:biome:verdant',
    'camo:clear',
    'camo:auto:wing',
    'camo:apply:hero:hero,wing',
    'builders:hero,wing',
    'texture:hero:preview',
    'texture:wing:ai',
  ];
  let cursor = -1;
  for (const entry of expectedOrder) {
    cursor = harness.log.indexOf(entry, cursor + 1);
    assert.notEqual(cursor, -1, `${entry} retains covered roster preparation order`);
  }
  assert.equal(harness.log.filter((entry) => entry === 'texture:wing:ai').length, 1,
    'cancelling hover intent prevents its stale second roster texture bake');
}

{
  const { runtime, state, log, fireTimer } = createHarness();
  runtime.scheduleIdleWorld('random', 600);
  assert.equal(state.timers.get(1)?.delayMs, 600, 'deliberate map intent uses its short idle delay');
  fireTimer(1);
  await flushTasks();
  assert.ok(log.includes('world:alpine:idle') && log.includes('builder:hero'),
    'a valid garage lull warms the reserved world and selected vehicle');

  runtime.scheduleIdleWorld('verdant');
  state.phase = 'battle';
  fireTimer(2);
  await flushTasks();
  assert.equal(log.includes('world:verdant:idle'), false,
    'a phase change invalidates quiet garage work at callback time');

  state.phase = 'garage';
  runtime.scheduleIdleWorld('verdant');
  assert.ok(state.timers.has(3));
  runtime.dispose();
  assert.equal(state.timers.has(3), false, 'dispose cancels pending world intent');
  runtime.preload({ specId: 'hero', mapId: 'verdant' });
  assert.equal(log.filter((entry) => entry === 'world:verdant:intent').length, 0,
    'disposed intent cannot start new speculative work');
}

console.log('battleIntentRuntime.selftest: map reservation, coalescing, handoff, and idle cancellation passed');
