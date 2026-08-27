import assert from 'node:assert/strict';
import { createMinimapAssetRuntime } from './minimapAssetRuntime.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(overrides = {}) {
  const worldA = { mapId: 'verdant' };
  const worldB = { mapId: 'desert' };
  const state = {
    ready: true,
    active: worldA,
    prepared: 'verdant',
    now: 100,
    traces: [],
    loads: [],
    fallbacks: [],
  };
  const runtime = createMinimapAssetRuntime({
    isReady: () => state.ready,
    getActiveWorld: () => state.active,
    isPrepared: (mapId) => state.prepared === mapId,
    loadAsset: async (world, url) => {
      state.loads.push({ world, url });
      return true;
    },
    buildFallback: (world) => { state.fallbacks.push(world); },
    assetUrl: (mapId) => `/minimaps/${mapId}.webp?v=test`,
    now: () => state.now,
    publishTrace: (trace) => { state.traces.push(trace); },
    ...overrides,
  });
  return { runtime, state, worldA, worldB };
}

{
  const gate = deferred();
  const h = harness({
    loadAsset: async (world, url) => {
      h.state.loads.push({ world, url });
      return gate.promise;
    },
  });
  const first = h.runtime.queue(h.worldA);
  const second = h.runtime.queue(h.worldA);
  assert.equal(second, first, 'repeated requests for one world coalesce');
  assert.equal(h.state.loads.length, 1, 'coalescing starts one asset request');
  assert.equal(h.state.traces[0].state, 'loading', 'the trace exposes active loading');
  h.state.now = 143.4;
  gate.resolve(true);
  assert.equal(await first, true);
  assert.equal(h.state.traces[0].state, 'ready');
  assert.equal(h.state.traces[0].totalMs, 43, 'ready timing is rounded consistently');
  assert.equal(h.state.loads[0].url, '/minimaps/verdant.webp?v=test');
  assert.equal(h.runtime.queue(h.worldA), null,
    'an installed map does not reload for the same active world');
}

{
  const gateA = deferred();
  const gateB = deferred();
  const h = harness({
    loadAsset: async (world) => (world.mapId === 'verdant' ? gateA.promise : gateB.promise),
  });
  const first = h.runtime.queue(h.worldA);
  h.state.active = h.worldB;
  h.state.prepared = 'desert';
  const second = h.runtime.queue(h.worldB);
  gateA.resolve(true);
  assert.equal(await first, false, 'a newer world generation rejects the old result');
  assert.equal(h.state.traces[0].state, 'stale');
  gateB.resolve(true);
  assert.equal(await second, true, 'the active prepared world may install');
  assert.equal(h.state.traces[1].state, 'ready');
}

{
  const h = harness({ loadAsset: async () => { throw new Error('decode failed'); } });
  assert.equal(await h.runtime.queue(h.worldA), false);
  assert.deepEqual(h.state.fallbacks, [h.worldA],
    'an active prepared world receives the procedural fallback after asset failure');
  assert.equal(h.state.traces[0].state, 'fallback');
  assert.match(h.state.traces[0].error, /decode failed/);
}

{
  const gate = deferred();
  const h = harness({ loadAsset: async () => gate.promise });
  const pending = h.runtime.queue(h.worldA);
  h.state.active = h.worldB;
  h.state.prepared = 'desert';
  gate.reject(new Error('late failure'));
  assert.equal(await pending, false);
  assert.deepEqual(h.state.fallbacks, [],
    'a stale failure cannot overwrite the new world with old fallback cartography');

  h.state.ready = false;
  assert.equal(h.runtime.queue(h.worldB), null, 'an unavailable HUD starts no work');
  h.state.ready = true;
  h.runtime.dispose();
  assert.equal(h.runtime.queue(h.worldB), null, 'disposed ownership starts no work');
}

console.log('minimapAssetRuntime.selftest: coalescing, stale guards, fallback, and disposal passed');
