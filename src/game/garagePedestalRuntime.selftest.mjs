import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGaragePedestalRuntime } from './garagePedestalRuntime.ts';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function createHarness({ residentLimit = 2, delayedBuilders = new Map(), delayedFrames = [] } = {}) {
  const scene = new THREE.Scene();
  const garagePosition = new THREE.Vector3(10, 5, -12);
  const debugTarget = {};
  const visuals = [];
  const visualOptions = [];
  const disposed = [];
  const releasedResources = [];
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

  const makeVisual = (specId, options) => {
    visualOptions.push(options);
    const root = new THREE.Object3D();
    const geometry = new THREE.BoxGeometry();
    const texture = new THREE.Texture();
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    root.add(mesh);
    for (const [kind, resource] of [['geometry', geometry], ['material', material], ['texture', texture]]) {
      resource.addEventListener('dispose', () => releasedResources.push(`${specId}/${kind}`));
    }
    const visual = {
      specId,
      root,
      setVisible(visible) { root.visible = visible; },
      centerOnPresentationPoint(x, z) {
        root.position.x = x;
        root.position.z = z;
      },
      seatOnFloor(y) {
        this.envelopeSeatCalls = (this.envelopeSeatCalls || 0) + 1;
        root.position.y = y + 10;
      },
      seatRunningGearOnFloor(y) {
        this.trackSeatCalls = (this.trackSeatCalls || 0) + 1;
        root.position.y = y;
      },
      prepareForSimulation() { this.prepared = true; },
      setGroundSampler(sampler) { this.groundSampler = sampler; },
      dispose() {
        disposed.push(specId);
        geometry.dispose(); material.dispose(); texture.dispose();
        root.removeFromParent();
      },
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
    garagePosition,
    podiumTopY: 0.36,
    trackAxisYawRad: Math.PI / 3,
    residentLimit,
    anisotropy: 4,
    createVisual: makeVisual,
    getSpec: (specId) => ({ id: specId }),
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
    nextFrame: async () => { frameCalls += 1; await delayedFrames.shift()?.promise; },
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
    garagePosition,
    debugTarget,
    visuals,
    visualOptions,
    disposed,
    releasedResources,
    makeVisual,
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
  assert.ok(h.runtime.current?.trackSeatCalls >= 1,
    'garage heroes seat their running gear on the podium');
  assert.equal(h.runtime.current?.envelopeSeatCalls || 0, 0,
    'garage heroes do not use protruding belly fittings as the podium contact');
  assert.deepEqual(h.runtime.current?.root.rotation.toArray().slice(0, 3), [
    0,
    Math.PI / 3,
    0,
  ], 'fresh garage visuals use the canonical stage heading');
  assert.equal(h.prebakes[0], 'preview', 'initial hero must preserve preview-quality paint');
  assert.equal(h.visuals.length, 1);
  assert.equal(h.visualOptions[0].batchStatic, true,
    'garage heroes collapse exact articulation-local static draws before upload');
  assert.equal(h.presentationInvalidations, 1,
    'initial reveal invalidates the event-driven Garage frame');

  h.setBootComplete(true);
  h.setSelected('bravo');
  await h.runtime.set('bravo');
  assert.equal(h.runtime.current?.specId, 'bravo');
  assert.equal(h.compileCalls, 1, 'cold interactive hero must submit its exact programs');
  assert.equal(h.frameCalls, 2, 'shader submission must settle behind two painted frames');
  assert.equal(h.visuals[0].root.visible, false, 'outgoing hero must be parked after reveal');
  assert.equal(h.visuals[0].root.parent, null, 'parked hero leaves the active scene graph');
  assert.deepEqual(h.scene.children, [h.runtime.current.root]);
  let attachedObjects = 0;
  h.scene.traverse(() => { attachedObjects += 1; });
  assert.equal(attachedObjects, 3, 'scene + current root + mesh, down from 5 with an attached parked root');
  assert.equal(h.runtime.cacheIds.length, 2, 'detachment does not shrink the warm cache');
  assert.deepEqual(h.releasedResources, [], 'parking preserves every GPU resource');
  assert.equal(h.presentationInvalidations, 2,
    'cold hero reveal requests one immediate presentation frame');

  const built = h.visuals.length;
  h.setSelected('alpha');
  await h.runtime.set('alpha');
  assert.equal(h.visuals.length, built, 'warm LRU selection must not rebuild the hero');
  assert.equal(h.runtime.current?.specId, 'alpha');
  assert.equal(h.runtime.current, h.visuals[0], 'cached reveal restores the exact original visual');
  assert.deepEqual(h.scene.children, [h.visuals[0].root]);
  assert.equal(h.visuals[1].root.parent, null);
  assert.equal(h.compileCalls, 1, 'cached reattachment requires no shader rewarm');
  assert.deepEqual(h.releasedResources, []);
  assert.equal(h.presentationInvalidations, 3,
    'cached hero reveal follows the same invalidation contract');

  h.setSelected('charlie');
  await h.runtime.set('charlie');
  assert.deepEqual(h.runtime.cacheIds, ['alpha', 'charlie']);
  assert.deepEqual(h.disposed, ['bravo'], 'speculative/LRU victim must release its visual');
  assert.deepEqual(h.releasedResources, ['bravo/geometry', 'bravo/material', 'bravo/texture'],
    'only the true LRU eviction releases its owned resources');
  assert.ok(h.debugTarget.__SWITCH_TIMINGS.some((row) => row.path === 'cached'));
  assert.ok(h.debugTarget.__PED_TRACE.some((row) => row.ev === 'reveal'));
  assert.equal(h.watchdog.delayMs, 500);

  const fielded = h.makeVisual('delta');
  fielded.root.rotation.set(0.38, -1.74, -0.21, 'ZXY');
  h.setPlayer({ visual: fielded });
  assert.equal(h.runtime.adoptBattlePlayer('delta'), true);
  assert.equal(h.runtime.current, fielded);
  assert.deepEqual(h.scene.children, [fielded.root], 'return mounts the fielded hero, not cached alternatives');
  assert.deepEqual(fielded.root.rotation.toArray(), [
    0,
    Math.PI / 3,
    0,
    'YXZ',
  ], 'battle pitch, yaw, and roll must not leak into the garage pose');
  assert.equal(h.presentationInvalidations, 5,
    'LRU reveal and adopted battle hero each invalidate the presentation');
  h.entities.set('delta', {});
  assert.equal(h.runtime.lendToBattle('delta'), true);
  assert.equal(h.entities.get('delta').visual, fielded);
  assert.equal(fielded.prepared, true);
  assert.equal(fielded.groundSampler, 'terrain-sampler');

  fielded.root.rotation.set(-0.52, 2.3, 0.17, 'XYZ');
  h.runtime.poseCurrent();
  assert.deepEqual(fielded.root.rotation.toArray(), [
    0,
    Math.PI / 3,
    0,
    'YXZ',
  ], 'pedestal resync restores the canonical pose after later drift');

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

// No parent alone is not permission to revive an unknown or disposed root.
{
  const h = createHarness();
  await h.runtime.set('alpha');
  const original = h.runtime.current;
  await h.runtime.set('bravo');
  h.garagePosition.y = 18;
  await h.runtime.set('alpha');
  assert.equal(h.runtime.current, original, 'changing the Garage floor does not invalidate a parked visual');
  assert.equal(original.root.position.y, 18.36, 'reused root is seated on the new Garage floor');
  assert.equal(h.visuals.length, 2);
  assert.deepEqual(h.releasedResources, []);
  h.runtime.dispose();
}
{
  const h = createHarness();
  h.setPhase('studio');
  h.setBootComplete(true);
  await h.runtime.set('alpha');
  const warmed = h.runtime.current;
  assert.ok(warmed, 'direct Studio idle work still warms the future Garage hero');
  h.setPhase('garage');
  await h.runtime.set('alpha');
  assert.equal(h.runtime.current, warmed);
  assert.equal(h.visuals.length, 1);
  assert.equal(h.compileCalls, 1, 'Studio-to-Garage reuse does not rebuild or rewarm');
  h.runtime.dispose();
}
{
  const h = createHarness();
  await h.runtime.set('alpha');
  const original = h.runtime.current;
  delete original.setVisible;
  await h.runtime.set('bravo');
  assert.equal(original.root.visible, false);
  await h.runtime.set('alpha');
  assert.equal(h.runtime.current, original);
  assert.equal(original.root.visible, true, 'reattachment reveals roots without an optional visibility hook');
  assert.equal(h.runtime.isOnStage(), true);
  assert.deepEqual(h.releasedResources, []);
  h.runtime.dispose();
}
{
  const h = createHarness();
  await h.runtime.set('alpha');
  const original = h.runtime.current;
  const resources = original.root.children[0];
  await h.runtime.set('bravo');
  assert.equal(h.scene.children.length, 1);
  original.dispose();
  assert.equal(h.runtime.hasCached('alpha'), false, 'external disposal invalidates an intentionally parked entry');
  await h.runtime.set('alpha');
  assert.notEqual(h.runtime.current, original);
  assert.notEqual(h.runtime.current.root.children[0].geometry, resources.geometry);
  assert.deepEqual(h.disposed, ['alpha']);
  original.dispose();
  assert.equal(h.runtime.hasCached('alpha'), true, 'old identity disposal cannot invalidate its replacement');
  assert.deepEqual(h.disposed, ['alpha'], 'an evicted/disposed resource is never disposed twice');
  h.runtime.dispose();
}
{
  const h = createHarness();
  await h.runtime.set('alpha');
  const original = h.runtime.current;
  original.root.removeFromParent();
  await h.runtime.set('alpha', true);
  assert.notEqual(h.runtime.current, original, 'unexpected detached current root still purges');
  assert.ok(h.debugTarget.__PED_TRACE.some(row => row.ev === 'purge-detached'));
  assert.deepEqual(h.disposed, [], 'purging an externally owned root adds no disposal');
  h.runtime.dispose();
}
{
  const h = createHarness();
  await h.runtime.set('alpha');
  const original = h.runtime.current;
  await h.runtime.set('bravo');
  const foreignOwner = new THREE.Group();
  foreignOwner.add(original.root);
  await h.runtime.set('alpha');
  assert.notEqual(h.runtime.current, original);
  assert.equal(original.root.parent, foreignOwner, 'an externally reparented visual is not stolen');
  original.dispose();
  assert.equal(h.runtime.hasCached('alpha'), true);
  h.runtime.dispose();
}

async function flushMicrotasks() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

// Late warm producers may finish after another selection, but never remount.
{
  const frame = deferred(), delayedFrames = [];
  const h = createHarness({ delayedFrames });
  await h.runtime.set('alpha');
  h.setBootComplete(true);
  delayedFrames.push(frame);
  const pending = h.runtime.set('bravo');
  await flushMicrotasks();
  const incoming = h.visuals.find(visual => visual.specId === 'bravo');
  assert.equal(incoming.__pedestalCompiling, true);
  await h.runtime.set('charlie');
  frame.resolve();
  await pending;
  assert.equal(h.runtime.current.specId, 'charlie');
  assert.equal(incoming.root.parent, null, 'superseded completed warm root detaches');
  assert.deepEqual(h.scene.children, [h.runtime.current.root]);
  h.runtime.dispose();
}
{
  const frame = deferred(), delayedFrames = [];
  const h = createHarness({ delayedFrames });
  await h.runtime.set('alpha');
  h.setBootComplete(true);
  delayedFrames.push(frame);
  const first = h.runtime.set('bravo');
  await flushMicrotasks();
  const incoming = h.visuals[1];
  const repeated = h.runtime.set('bravo');
  frame.resolve();
  await Promise.all([first, repeated]);
  assert.equal(h.runtime.current, incoming, 'newest cached warm continuation reuses the same object');
  assert.equal(h.visuals.length, 2);
  assert.deepEqual(h.scene.children, [incoming.root]);
  assert.deepEqual(h.releasedResources, []);
  h.runtime.dispose();
}

// Handoff ownership and generation fences protect simulation from stale UI.
{
  const slow = deferred();
  const h = createHarness({ delayedBuilders: new Map([['bravo', slow]]) });
  await h.runtime.set('alpha');
  const player = h.runtime.current;
  h.entities.set('alpha', {});
  const pending = h.runtime.set('bravo');
  assert.equal(h.runtime.lendToBattle('alpha'), true);
  h.setPlayer({ visual: player });
  h.setPhase('battle');
  player.root.position.set(84, 19, 121);
  player.root.rotation.set(.2, .5, -.3);
  player.root.updateMatrix();
  const pose = player.root.matrix.clone();
  await h.runtime.set('charlie');
  slow.resolve(); await pending;
  assert.equal(h.visuals.length, 1);
  assert.deepEqual(player.root.position.toArray(), [84, 19, 121]);
  assert.deepEqual(player.root.rotation.toArray().slice(0, 3), [.2, .5, -.3]);
  assert.ok(player.root.matrix.equals(pose));
  assert.equal(player.root.parent, h.scene);
  h.runtime.trim(1);
  assert.deepEqual(h.disposed, []);
  h.setPhase('garage');
  assert.equal(h.runtime.adoptBattlePlayer('alpha'), true);
  assert.equal(h.runtime.current, player);
  assert.deepEqual(h.scene.children, [player.root]);
  h.runtime.dispose();
}
{
  const h = createHarness();
  await h.runtime.set('alpha');
  const parkedAlpha = h.runtime.current;
  await h.runtime.set('bravo');
  h.setPlayer({ visual: h.makeVisual('alpha') });
  assert.equal(h.runtime.adoptBattlePlayer('alpha'), false,
    'intentionally parked cache retains the old duplicate-adoption safety');
  await h.runtime.set('alpha');
  assert.equal(h.runtime.current, parkedAlpha);
  h.runtime.dispose();
}

// Disposal cancels producers, not retained visual/GPU residency.
{
  const frame = deferred(), delayedFrames = [];
  const h = createHarness({ delayedFrames });
  await h.runtime.set('alpha');
  const current = h.runtime.current;
  h.setBootComplete(true);
  delayedFrames.push(frame);
  const pending = h.runtime.set('bravo');
  await flushMicrotasks();
  const incoming = h.visuals[1];
  h.runtime.dispose();
  frame.resolve(); await pending;
  assert.equal(h.runtime.current, current);
  assert.equal(incoming.root.parent, null);
  assert.deepEqual(h.scene.children, [current.root]);
  assert.deepEqual(h.releasedResources, []);
  await h.runtime.set('charlie');
  h.watchdog.callback();
  assert.equal(h.visuals.length, 2);
  assert.equal(h.cancelledWatchdog, 'watchdog');
}
{
  const frame = deferred(), delayedFrames = [];
  const h = createHarness({ delayedFrames });
  await h.runtime.set('alpha');
  h.setBootComplete(true);
  delayedFrames.push(frame);
  const pending = h.runtime.set('bravo');
  await flushMicrotasks();
  h.visuals[1].dispose();
  frame.resolve(); await pending;
  assert.equal(h.runtime.current.specId, 'alpha');
  assert.equal(h.runtime.hasCached('bravo'), false);
  assert.deepEqual(h.scene.children, [h.runtime.current.root]);
  h.runtime.dispose();
}

{
  const frame = deferred(), delayedFrames = [];
  const h = createHarness({ delayedFrames });
  await h.runtime.set('alpha');
  h.setBootComplete(true);
  delayedFrames.push(frame);
  const pending = h.runtime.set('bravo');
  await flushMicrotasks();
  const discarded = h.visuals[1];
  discarded.dispose();
  await h.runtime.set('bravo');
  const replacement = h.runtime.current;
  assert.notEqual(replacement, discarded);
  frame.resolve(); await pending;
  assert.equal(h.runtime.current, replacement, 'old same-spec producer cannot replace or retire its new identity');
  assert.equal(h.runtime.hasCached('bravo'), true);
  assert.equal(discarded.root.parent, null);
  assert.deepEqual(h.scene.children, [replacement.root]);
  assert.deepEqual(h.disposed, ['bravo']);
  h.runtime.dispose();
}

{
  const h = createHarness();
  await h.runtime.prepareInitial('alpha', {
    builderReady: Promise.resolve(), yieldForBudget: async () => undefined,
  });
  const hero = h.runtime.current, built = h.visuals.length;
  const geometry = hero.root.children[0].geometry;
  h.entities.set('bravo', {});
  assert.equal(h.runtime.lendToBattle('bravo'), false);
  assert.equal(hero.root.parent, null, 'a different battle selection detaches the unborrowed podium hero');
  assert.equal(hero.root.visible, false);
  assert.equal(h.runtime.current, hero, 'detachment retains the cache identity for return');
  assert.deepEqual(h.releasedResources, [], 'scene detachment preserves the warm GPU lease');
  h.setPhase('battle');
  assert.deepEqual(h.scene.children, [], 'the unborrowed hero contributes no battle scene resources');
  h.setPhase('garage');
  const parkedY = hero.root.position.y;
  h.runtime.poseCurrent();
  assert.equal(hero.root.position.y, parkedY, 'environment activation preserves the parked ownership sentinel');
  await h.runtime.set('alpha');
  assert.equal(h.runtime.current, hero);
  assert.equal(hero.root.parent, h.scene);
  assert.equal(hero.root.visible, true);
  assert.equal(hero.root.children[0].geometry, geometry);
  assert.equal(h.visuals.length, built, 'return reuses the exact cached geometry without rebuilding');
  h.entities.set('alpha', {});
  assert.equal(h.runtime.lendToBattle('alpha'), true);
  assert.equal(h.entities.get('alpha').visual, hero, 'matching handoff still lends the visible actor');
  assert.equal(hero.root.parent, h.scene);
  h.runtime.dispose();
}

console.log('garagePedestalRuntime.selftest: detached warm LRU, exact resource preservation, invalidation/disposal, matching and mismatched battle handoff and async convergence passed');
