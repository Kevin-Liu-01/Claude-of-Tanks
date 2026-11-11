// worldModuleLoadFailure.selftest.mjs — the world build coordinator's map module follows the one lazy-chunk policy
// (2026-11-02 audit R6, round 2 U35 review). Copyright © 2026 Kevin B. Liu.
//
// Every world build awaits the map module (main.ts `loadModule: () => import('./world/map.ts')`). The coordinator held it
// in a hand-made memo (`if (!modulePromise) modulePromise = dependencies.loadModule()`) that kept a rejection for the
// document: one failed transfer (a Garage speculation or an intent prefetch during an offline blip) failed every later
// battle's world build until a reload. Now it is an app/lazyChunk.ts chunk: the next build asks again at once after one
// failure, then past the policy's backoff (2, 4 ... s), never while offline, and builds once the network is back.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorldBuildCoordinator } from './worldBuildCoordinator.ts';

const chunkError = () => new TypeError('Failed to fetch dynamically imported module: ./world/map.ts');
let onLine = true;
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
Object.defineProperty(globalThis.navigator, 'onLine', { get: () => onLine, configurable: true });

function coordinatorWith(failFirst, clock) {
  const state = { asks: 0, builds: 0 };
  let left = failFirst;
  const coordinator = createWorldBuildCoordinator({
    engineContext: {}, scene: new THREE.Scene(), renderer: { renderLists: { dispose() {} } }, deviceTier: 'desktop',
    getCurrentWorld: () => null,
    getGarageActivity: () => ({ phase: 'garage', transitionActive: false, lastActivityAt: 0 }),
    releaseShadowMaterial() {},
    loadModule: () => {
      state.asks += 1;
      if (left > 0) { left -= 1; return Promise.reject(chunkError()); }
      return Promise.resolve({
        async createMapAsync(_engine, { mapId }) { state.builds += 1; return { group: new THREE.Group(), mapId }; },
      });
    },
    now: () => clock.t,
    sleep: () => Promise.resolve(),
    foregroundYielder: () => async () => {},
    backgroundYielder: () => async () => {},
    resourceLimits: { pedestalVisuals: 4, worldScenes: 4 },
  });
  return { coordinator, state };
}
/** A foreground build's outcome: its world, or its error's message. */
const build = (coordinator, mapId) => coordinator.beginBuild(mapId).promise
  .then((world) => ({ world }), (error) => ({ error: String(error?.message ?? error) }));

// ---- 1. one failed transfer (the Garage's intent prefetch) no longer fails the battle's build after it
{
  const clock = { t: 1000 };
  const { coordinator, state } = coordinatorWith(1, clock);
  assert.equal(await coordinator.prefetch('fjord', { intent: true }), null, 'the failed speculation settles empty');
  assert.equal(state.asks, 1);
  clock.t += 50;
  const battle = await build(coordinator, 'fjord');
  assert.ok(battle.world, `the next build after one failed transfer loads the module and builds (got ${battle.error}; `
    + `${state.asks} ask: the coordinator kept the first failure for the document)`);
  assert.equal(state.asks, 2, 'asked again once');
  assert.equal(state.builds, 1);
  const later = await build(coordinator, 'delta');
  assert.ok(later.world && state.asks === 2, 'a loaded module is asked for once');
}

// ---- 2. the policy's backoff: after two failures in a row, a build inside the backoff gets the kept failure (no ask),
// and the first build past it loads
{
  const clock = { t: 1000 };
  const { coordinator, state } = coordinatorWith(2, clock);
  assert.match((await build(coordinator, 'fjord')).error ?? '', /Failed to fetch/);
  assert.match((await build(coordinator, 'fjord')).error ?? '', /Failed to fetch/, 'the second build asks again at once');
  assert.equal(state.asks, 2);
  clock.t += 1500;
  const inside = await build(coordinator, 'fjord');
  assert.match(inside.error ?? '', /Failed to fetch/, 'a build inside the 2 s backoff gets the kept failure');
  assert.equal(state.asks, 2, 'and asks nothing');
  clock.t += 600;
  const past = await build(coordinator, 'fjord');
  assert.ok(past.world, `the first build past the backoff loads (got ${past.error})`);
  assert.equal(state.asks, 3);
}

// ---- 3. offline: a failure seen offline is never asked again while offline, and the first build back online asks at once
{
  const clock = { t: 1000 };
  const { coordinator, state } = coordinatorWith(2, clock);
  onLine = false;
  assert.match((await build(coordinator, 'fjord')).error ?? '', /Failed to fetch/);
  for (let i = 0; i < 5; i++) { clock.t += 30_000; await build(coordinator, 'fjord'); }
  assert.equal(state.asks, 1, 'no ask while the browser is offline');
  onLine = true;
  assert.match((await build(coordinator, 'fjord')).error ?? '', /Failed to fetch/, 'back online: asked at once (it fails again here)');
  assert.equal(state.asks, 2);
  clock.t += 2000;
  assert.ok((await build(coordinator, 'fjord')).world, 'past the backoff the module loads');
  assert.equal(state.asks, 3);
}

console.log('worldModuleLoadFailure.selftest: OK (a failed map module transfer is asked again under the lazy-chunk policy)');
