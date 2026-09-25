import assert from 'node:assert/strict';
import { createGaragePedestalPreloader } from './garagePedestalPreloader.ts';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

let bootComplete = false;
let phase = 'garage';
let selectedId = 'a';
let neighbors = ['a', 'b', 'c'];
const cached = new Set();
const scheduled = [];
const familyLoads = [];
const prebakes = [];
const discarded = [];
let frames = 0;
const preloader = createGaragePedestalPreloader({
  getPhase: () => phase,
  isBootComplete: () => bootComplete,
  getSelectedId: () => selectedId,
  getNeighborIds: () => neighbors,
  hasCachedVisual: (id) => cached.has(id),
  ensureTankBuilder: async () => {},
  ensureTankBuilders: async (ids) => { familyLoads.push([...ids]); },
  getSpec: (id) => ({ id }),
  prebakeSharedTextures: async (spec, anisotropy, quality, yieldForBudget) => {
    prebakes.push({ id: spec.id, anisotropy, quality });
    await yieldForBudget?.();
  },
  discardSharedTextures: (id) => discarded.push(id),
  createBudgetYield: () => async () => {},
  nextFrame: async () => { frames += 1; },
  scheduleDelay: (callback, delayMs) => scheduled.push({ callback, delayMs }),
  anisotropy: 8,
});

preloader.queueNeighbors();
assert.equal(scheduled.length, 0, 'pre-ready sessions must not warm neighbors');
bootComplete = true;
preloader.queueNeighbors();
assert.equal(scheduled.length, 1);
assert.equal(scheduled[0].delayMs, 1800);
scheduled.shift().callback();
await flush();
assert.deepEqual(familyLoads, [['b', 'c']], 'selected and cached heroes must be filtered');
assert.deepEqual(prebakes.map((entry) => entry.id), ['b', 'c']);
assert(prebakes.every((entry) => entry.anisotropy === 8 && entry.quality === 'ai'));
assert.equal(frames, 2, 'each complete neighbor bake must yield a painted frame');
assert.deepEqual(preloader.retainedIds, ['b', 'c']);

neighbors = ['a', 'c'];
preloader.queueNeighbors();
scheduled.shift().callback();
await flush();
assert(discarded.includes('b'), 'neighbors outside the current warm window must release textures');

// Cancellation after the family transfer starts must prevent paint work.
const familyGate = deferred();
const cancelScheduled = [];
let cancelledBakeCount = 0;
const cancellable = createGaragePedestalPreloader({
  getPhase: () => 'garage',
  isBootComplete: () => true,
  getSelectedId: () => 'a',
  getNeighborIds: () => ['d'],
  hasCachedVisual: () => false,
  ensureTankBuilder: async () => {},
  ensureTankBuilders: () => familyGate.promise,
  getSpec: (id) => ({ id }),
  prebakeSharedTextures: async () => { cancelledBakeCount += 1; },
  discardSharedTextures: () => {},
  createBudgetYield: () => async () => {},
  nextFrame: async () => {},
  scheduleDelay: (callback) => cancelScheduled.push(callback),
  anisotropy: 4,
});
cancellable.queueNeighbors();
cancelScheduled.shift()();
cancellable.invalidate();
familyGate.resolve();
await flush();
assert.equal(cancelledBakeCount, 0, 'fresh input must cancel stale neighbor paint');

// Pointer intent coalesces exact builder/paint work and bounds idle textures.
let builderCount = 0;
let intentBakeCount = 0;
const intentDiscarded = [];
const intent = createGaragePedestalPreloader({
  getPhase: () => 'garage',
  isBootComplete: () => true,
  getSelectedId: () => 'selected',
  getNeighborIds: () => [],
  hasCachedVisual: () => false,
  ensureTankBuilder: async () => { builderCount += 1; },
  ensureTankBuilders: async () => {},
  getSpec: (id) => ({ id }),
  prebakeSharedTextures: async () => { intentBakeCount += 1; },
  discardSharedTextures: (id) => intentDiscarded.push(id),
  createBudgetYield: () => async () => {},
  nextFrame: async () => {},
  scheduleDelay: () => {},
  anisotropy: 4,
  retainedIntentLimit: 2,
});
const firstIntent = intent.preloadIntent('x');
assert.equal(intent.preloadIntent('x'), firstIntent, 'same-card intent must share one request');
await firstIntent;
await intent.preloadIntent('y');
await intent.preloadIntent('z');
assert.equal(builderCount, 3);
assert.equal(intentBakeCount, 3);
assert.deepEqual(intent.retainedIds, ['y', 'z']);
assert.deepEqual(intentDiscarded, ['x']);
assert.equal(intent.pendingIntents, 0);

// FSP-01 R2: after the neighbor textures are warm, the nearest cards are
// constructed ahead through the runtime's speculative port; fresh input
// cancels between constructions.
{
  const built = [];
  const specScheduled = [];
  let specFrames = 0;
  let specCached = new Set(['p']);
  const speculative = createGaragePedestalPreloader({
    getPhase: () => 'garage',
    isBootComplete: () => true,
    getSelectedId: () => 'sel',
    getNeighborIds: () => ['n', 'p', 'q', 'sel'],
    hasCachedVisual: (id) => specCached.has(id),
    ensureTankBuilder: async () => {},
    ensureTankBuilders: async () => {},
    getSpec: (id) => ({ id }),
    prebakeSharedTextures: async () => {},
    discardSharedTextures: () => {},
    createBudgetYield: () => async () => {},
    nextFrame: async () => { specFrames += 1; },
    scheduleDelay: (callback) => specScheduled.push(callback),
    anisotropy: 4,
    getSpeculativeIds: () => ['n', 'p', 'sel'],
    buildSpeculative: async (id, stillValid, protectedIds) => {
      built.push({ id, protectedIds: [...protectedIds], valid: stillValid() });
      if (id === 'n') speculative.invalidate();
      return true;
    },
  });
  speculative.queueNeighbors();
  specScheduled.shift()();
  await flush();
  assert.deepEqual(built, [{ id: 'n', protectedIds: ['n'], valid: true }],
    'only uncached, unselected nearest cards are built, after every texture bake, until fresh input cancels');
  assert.equal(specFrames, 3, 'two texture bakes and one construction each yield a frame');
  specCached = new Set();
  built.length = 0;
  speculative.queueNeighbors();
  specScheduled.shift()();
  await flush();
  assert.deepEqual(built.map((entry) => entry.id), ['n'], 'a cancelled pass stops before the second card');
}

console.log('garagePedestalPreloader.selftest: cancellation, coalescing, retention and speculative construction pass');
