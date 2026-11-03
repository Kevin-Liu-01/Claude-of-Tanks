// worldActivationLatestWins.selftest.mjs — (2026-11-02 audit R1) the battlefield activation is a latest-request-wins owner
// and the world it warms stays resident. The real activation runtime over the real build coordinator (a fake map module,
// a frame clock the test owns, the mobile residency of one world):
// 1. ensure(A) still building when ensure(B) starts: B presents, A settles superseded and never swaps over B (before,
//    whichever finished last became current, and the budget then released B on mobile).
// 2. a direct activation or switchMap during an ensure's warm supersedes it the same way.
// 3. a world an ensure is warming is never evicted by the budget or by the dormant release meanwhile (before, the warm
//    went on to present a released world).
// 4. the overlap is real: the entry barriers are Promise.all, so a failed sibling leaves its entry's ensure running.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWorldActivationRuntime } from './worldActivationRuntime.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve)); };

function harness({ worldScenes = 1 } = {}) {
  const scene = new THREE.Scene();
  const gates = new Map(), disposed = [], swaps = [];
  let frameGate = null;
  const runtime = createWorldActivationRuntime({
    initialMapId: 'alpha',
    coordinatorDependencies: {
      engineContext: {}, scene, renderer: { renderLists: { dispose() {} } }, deviceTier: 'mobile',
      getGarageActivity: () => ({ phase: 'garage', transitionActive: false, lastActivityAt: 0 }),
      releaseShadowMaterial() {},
      loadModule: async () => ({
        async createMapAsync(_engine, { mapId }, progress) {
          await progress('Surveying terrain', 0.2);
          if (gates.has(mapId)) await gates.get(mapId).promise;
          const group = new THREE.Group();
          group.name = mapId;
          scene.add(group);
          const world = { mapId, group, config: { sky: { preset: mapId } }, raycast: () => null,
            released: false, dispose() { this.released = true; disposed.push(mapId); } };
          return world;
        },
      }),
      now: () => 0,
      foregroundYielder: () => async () => {},
      backgroundYielder: () => async () => {},
      resourceLimits: { pedestalVisuals: 1, worldScenes },
    },
    swapSceneWorld: (previous, next) => swaps.push([previous?.name ?? null, next.name]),
    setSceneWorldActive() {},
    ensureCloudTextures() {},
    awaitInitialCloudWarm: async () => {},
    applySkyPreset() {}, applySkyPresentation() {}, setSun() {},
    getFogDensity: () => 0, onFogDensityChanged() {},
    canCreateCollider: () => false, createCollider: () => null,
    placeGarage() {}, isMinimapReady: () => false, buildMinimap() {}, loadMinimapAsset: async () => false,
    compilePrograms() {}, linkerBreathingSlices: function* () {},
    updateShadowFrustums() {}, warmShadowFrame() {},
    nextFrame: () => (frameGate ? frameGate.promise : Promise.resolve()),
    now: () => 0,
  });
  return {
    runtime, disposed, swaps,
    gate(mapId) { const gate = deferred(); gates.set(mapId, gate); return gate; },
    holdFrames() { frameGate = deferred(); return frameGate; },
    releaseFrames() { const gate = frameGate; frameGate = null; gate?.resolve(); },
  };
}

// ---- 1. two overlapping ensures: the later request presents, the earlier never swaps over it
{
  const h = harness();
  const alphaGate = h.gate('alpha');
  const alpha = h.runtime.ensure('alpha', null, { precompile: false });
  const alphaResult = alpha.then((world) => ({ world }), (error) => ({ error }));
  await flush();
  const bravo = await h.runtime.ensure('bravo', null, { precompile: false });
  assert.equal(h.runtime.current, bravo, 'the later request presents its battlefield');
  alphaGate.resolve();
  const settled = await alphaResult;
  assert.equal(h.runtime.current, bravo, 'the earlier ensure, finishing last, never swaps its world over the later one');
  assert.equal(settled.error?.name, 'WorldActivationSuperseded', 'the superseded ensure settles rejected, not as a presented world');
  assert.deepEqual(h.swaps.map(([, next]) => next), ['bravo'], 'only the latest request swapped the scene');
  assert.equal(bravo.released, false, 'the mobile budget never releases the battlefield the latest request presents');
  await flush();
  assert.ok(!h.runtime.cache.has('alpha') && h.disposed.includes('alpha'),
    'the superseded build is released by the budget once nothing holds it (mobile keeps one world)');
}

// ---- 2. a direct activation, or switchMap, during an ensure's warm supersedes it
for (const later of ['activate', 'switchMap']) {
  const h = harness({ worldScenes: 2 });
  const bravo = await h.runtime.ensure('bravo', null, { precompile: false });
  const charlieGate = h.gate('charlie');
  const charlie = h.runtime.ensure('charlie', null, { precompile: true });
  const charlieResult = charlie.then((world) => ({ world }), (error) => ({ error }));
  await flush();
  h.holdFrames();
  charlieGate.resolve();
  await flush();
  if (later === 'activate') h.runtime.activate(bravo);
  else h.runtime.switchMap('bravo');
  h.releaseFrames();
  const settled = await charlieResult;
  assert.equal(h.runtime.current, bravo, `${later}: the battlefield asked for last stays on screen`);
  assert.equal(settled.error?.name, 'WorldActivationSuperseded', `${later}: the warming ensure is superseded`);
}

// ---- 3. a world being warmed is held: neither the budget nor the dormant release frees it mid-warm
{
  const h = harness();
  const alpha = await h.runtime.ensure('alpha', null, { precompile: false });
  h.runtime.setDormant(true);
  // the rematch on the dormant battlefield warms it ...
  const frames = h.holdFrames();
  const rematch = h.runtime.ensure('alpha', null, { precompile: true });
  await flush();
  // ... while the Garage's planned battle on another map releases the dormant battlefield, and the budget runs
  h.runtime.prefetch('bravo', { intent: true });
  h.runtime.enforceCacheBudget();
  assert.equal(alpha.released, false, 'the world an activation is warming is not released under it');
  frames.resolve();
  h.releaseFrames();
  assert.equal(await rematch, alpha);
  assert.equal(h.runtime.current, alpha);
  assert.equal(alpha.released, false, 'the warm presents a resident world, never a released one');
}
{
  // a cached world that is not current, warmed while the budget runs (mobile: one world)
  const h = harness({ worldScenes: 2 });
  await h.runtime.ensure('alpha', null, { precompile: false });
  const bravo = await h.runtime.ensure('bravo', null, { precompile: false });
  h.runtime.resourceLimits.worldScenes = 1;
  const frames = h.holdFrames();
  const back = h.runtime.ensure('alpha', null, { precompile: true });
  await flush();
  h.runtime.enforceCacheBudget();
  const alpha = h.runtime.cache.get('alpha');
  assert.ok(alpha && !alpha.released, 'the budget skips the world being warmed');
  frames.resolve();
  h.releaseFrames();
  assert.equal(await back, alpha);
  assert.equal(h.runtime.current, alpha);
  assert.equal(bravo.released, true, 'and releases the previous battlefield once the warmed one is current');
}

// ---- 4. the overlap the owner closes: the entry barriers are Promise.all, so a failed sibling leaves the ensure running
{
  const acquisition = readFileSync(new URL('../game/battleEntryAcquisition.ts', import.meta.url), 'utf8');
  assert.match(acquisition, /await Promise\.all\(tasks\.map\(\(task\) => run\(task\)\)\);/,
    'solo entry: one rejected task settles the barrier while the world task keeps running');
  assert.match(acquisition, /await Promise\.all\(\[modulesP, worldP, matchP\]\)/,
    'network entry: a failed connect settles the barrier while the world keeps loading');
}

console.log('worldActivationLatestWins.selftest: the latest request presents, an earlier ensure is superseded (never swaps over it), direct activation and switchMap supersede a warm, a warming world is held against the budget and the dormant release PASS');
