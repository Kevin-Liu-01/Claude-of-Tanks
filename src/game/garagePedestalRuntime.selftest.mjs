import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGaragePedestalRuntime } from './garagePedestalRuntime.ts';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function createHarness({ residentLimit = 2, delayedBuilders = new Map() } = {}) {
  const scene = new THREE.Scene();
  const debugTarget = {};
  const visuals = [];
  const disposed = [];
  const prebakes = [];
  const ensured = [];
  const delayed = [];
  const entities = new Map();
  let player = null;
  let selectedId = 'alpha';
  let phase = 'garage';
  let bootComplete = false;
  let nowMs = 0;
  let watchdog = null;
  let cancelledWatchdog = null;
  let compileCalls = 0;
  let frameCalls = 0;
  let presentationInvalidations = 0;

  const makeVisual = (specId) => {
    const root = new THREE.Object3D();
    const visual = {
      specId,
      root,
      setVisible(visible) { root.visible = visible; },
      centerOnPresentationPoint(x, z) {
        root.position.x = x;
        root.position.z = z;
      },
      seatOnFloor(y) { root.position.y = y; },
      prepareForSimulation() { this.prepared = true; },
      setGroundSampler(sampler) { this.groundSampler = sampler; },
      dispose() { disposed.push(specId); },
    };
    visuals.push(visual);
    return visual;
  };

  const runtime = createGaragePedestalRuntime({
    scene,
    compilePrograms(root) {
      assert.ok(root);
      compileCalls += 1;
    },
    garagePosition: new THREE.Vector3(10, 5, -12),
    podiumTopY: 0.36,
    trackAxisYawRad: Math.PI / 3,
    residentLimit,
    anisotropy: 4,
    createVisual: makeVisual,
    getSpec: (specId) => ({ id: specId, visual: { garageYawDeg: 2 } }),
    ensureTankBuilder: (specId) => {
      ensured.push(specId);
      return delayedBuilders.get(specId)?.promise || Promise.resolve();
    },
    ensureTankBuilders: async () => undefined,
    prebakeSharedTextures: async (_spec, _anisotropy, quality) => {
      prebakes.push(quality);
    },
    discardSharedTextures: () => undefined,
    createBudgetYield: () => async () => undefined,
    nextFrame: async () => { frameCalls += 1; },
    getDeviceTier: () => 'desktop',
    getPhase: () => phase,
    isBootComplete: () => bootComplete,
    getSelectedId: () => selectedId,
    getNeighborIds: () => [],
    getBattlePlayer: () => player,
    getBattleEntity: (specId) => entities.get(specId),
    groundSampler: 'terrain-sampler',
    scheduleDelay: (callback, delayMs) => {
      delayed.push({ callback, delayMs });
      return delayed.length;
    },
    scheduleWatchdog: (callback, delayMs) => {
      watchdog = { callback, delayMs };
      return 'watchdog';
    },
    cancelWatchdog: (handle) => { cancelledWatchdog = handle; },
    now: () => nowMs,
    debugTarget,
    invalidatePresentation: () => { presentationInvalidations += 1; },
  });

  return {
    runtime,
    scene,
    debugTarget,
    visuals,
    disposed,
    prebakes,
    ensured,
    delayed,
    entities,
    get compileCalls() { return compileCalls; },
    get frameCalls() { return frameCalls; },
    get presentationInvalidations() { return presentationInvalidations; },
    get watchdog() { return watchdog; },
    get cancelledWatchdog() { return cancelledWatchdog; },
    setPlayer(value) { player = value; },
    setSelected(value) { selectedId = value; },
    setPhase(value) { phase = value; },
    setBootComplete(value) { bootComplete = value; },
    advance(ms) { nowMs += ms; },
  };
}

{
  const h = createHarness();
  await h.runtime.prepareInitial('alpha', {
    builderReady: Promise.resolve(),
    yieldForBudget: async () => undefined,
  });
  assert.equal(h.runtime.current?.specId, 'alpha');
  assert.equal(h.runtime.isOnStage(), true);
  assert.equal(h.runtime.current?.root.position.y, 5.36);
  assert.equal(h.prebakes[0], 'preview', 'initial hero must preserve preview-quality paint');
  assert.equal(h.visuals.length, 1);
  assert.equal(h.presentationInvalidations, 1,
    'initial reveal invalidates the event-driven Garage frame');

  h.setBootComplete(true);
  h.setSelected('bravo');
  await h.runtime.set('bravo');
  assert.equal(h.runtime.current?.specId, 'bravo');
  assert.equal(h.compileCalls, 1, 'cold interactive hero must submit its exact programs');
  assert.equal(h.frameCalls, 2, 'shader submission must settle behind two painted frames');
  assert.equal(h.visuals[0].root.visible, false, 'outgoing hero must be parked after reveal');
  assert.equal(h.presentationInvalidations, 2,
    'cold hero reveal requests one immediate presentation frame');

  const built = h.visuals.length;
  h.setSelected('alpha');
  await h.runtime.set('alpha');
  assert.equal(h.visuals.length, built, 'warm LRU selection must not rebuild the hero');
  assert.equal(h.runtime.current?.specId, 'alpha');
  assert.equal(h.presentationInvalidations, 3,
    'cached hero reveal follows the same invalidation contract');

  h.setSelected('charlie');
  await h.runtime.set('charlie');
  assert.deepEqual(h.runtime.cacheIds, ['alpha', 'charlie']);
  assert.deepEqual(h.disposed, ['bravo'], 'speculative/LRU victim must release its visual');
  assert.ok(h.debugTarget.__SWITCH_TIMINGS.some((row) => row.path === 'cached'));
  assert.ok(h.debugTarget.__PED_TRACE.some((row) => row.ev === 'reveal'));
  assert.equal(h.watchdog.delayMs, 500);

  const fielded = {
    ...h.visuals[0],
    specId: 'delta',
    root: new THREE.Object3D(),
  };
  h.setPlayer({ visual: fielded });
  assert.equal(h.runtime.adoptBattlePlayer('delta'), true);
  assert.equal(h.runtime.current, fielded);
  assert.equal(h.presentationInvalidations, 5,
    'LRU reveal and adopted battle hero each invalidate the presentation');
  h.entities.set('delta', {});
  assert.equal(h.runtime.lendToBattle('delta'), true);
  assert.equal(h.entities.get('delta').visual, fielded);
  assert.equal(fielded.prepared, true);
  assert.equal(fielded.groundSampler, 'terrain-sampler');

  h.runtime.dispose();
  assert.equal(h.cancelledWatchdog, 'watchdog');
}

{
  const slowBravo = deferred();
  const h = createHarness({ delayedBuilders: new Map([['bravo', slowBravo]]) });
  await h.runtime.set('alpha');
  h.setSelected('bravo');
  const bravo = h.runtime.set('bravo');
  h.setSelected('charlie');
  await h.runtime.set('charlie');
  slowBravo.resolve();
  await bravo;
  assert.equal(h.runtime.current?.specId, 'charlie',
    'a superseded cold builder must never replace the latest requested hero');
  assert.equal(h.visuals.some((visual) => visual.specId === 'bravo'), false,
    'stale builder completion must stop before visual construction');
  assert.ok(h.debugTarget.__PED_TRACE.some((row) => row.ev === 'prebake-stale'));
  h.runtime.dispose();
}

console.log('garagePedestalRuntime.selftest: typed lifecycle, LRU, shader warm, handoff, and convergence passed');
