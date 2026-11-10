// worldActivationLatestWins.selftest.mjs — (2026-11-02 audit R1) the battlefield activation is a latest-request-wins owner
// and the world it warms stays resident. The real activation runtime over the real build coordinator (a fake map module,
// a frame clock the test owns, the mobile residency of one world):
// 1. ensure(A) still building when ensure(B) starts: B presents, A settles superseded and never swaps over B (before,
//    whichever finished last became current, and the budget then released B on mobile).
// 2. a direct activation or switchMap during an ensure's warm supersedes it the same way.
// 3. a world an ensure is warming is never evicted by the budget or by the dormant release meanwhile (before, the warm
//    went on to present a released world).
// 4. the overlap is real (driven): the solo barrier is Promise.all, so a failed sibling leaves its entry's ensure running;
//    the network barrier waits for its world first.
// 5. (review) a request that ends without presenting hides the world it warmed again (every built world sits in the scene
//    hidden; before, the warm's lift stayed and a superseded world drew over the one presented), and a superseded warm
//    stops at its next wait (no program compile or shadow warm of a world nobody presents).
// 6. (review) the Garage taking the screen (setDormant(true): the entry's failure path restores the Garage while the
//    orphaned ensure still builds) supersedes it: the battlefield never presents, never applies its sky, over the Garage.
// The scene membership is the real phase residency (engine/phaseSceneResidency.ts), as main.ts wires it.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWorldActivationRuntime } from './worldActivationRuntime.ts';
import { createPhaseSceneResidency } from '../engine/phaseSceneResidency.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve)); };

function harness({ worldScenes = 1 } = {}) {
  const scene = new THREE.Scene();
  const garageRoot = new THREE.Group();
  garageRoot.name = 'garage';
  scene.add(garageRoot);
  const residency = createPhaseSceneResidency({ scene, garageRoots: [garageRoot] });
  const gates = new Map(), disposed = [], swaps = [], compiled = [], shadowWarms = [], skies = [];
  let frameGate = null, cloudGate = null;
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
    swapSceneWorld: (previous, next) => {
      swaps.push([previous?.name ?? null, next.name]);
      residency.swapWorld(previous, next);
    },
    setSceneWorldActive: (root, active) => residency.setWorldActive(root, active),
    ensureCloudTextures() {},
    awaitInitialCloudWarm: async () => { if (cloudGate) await cloudGate.promise; },
    applySkyPreset: (sky) => skies.push(['preset', sky.preset]),
    applySkyPresentation: (sky) => skies.push(['presentation', sky.preset]),
    setSun: (sky) => skies.push(['sun', sky.preset]),
    getFogDensity: () => 0, onFogDensityChanged() {},
    canCreateCollider: () => false, createCollider: () => null,
    placeGarage() {}, isMinimapReady: () => false, buildMinimap() {}, loadMinimapAsset: async () => false,
    compilePrograms: (root) => compiled.push(root.name), linkerBreathingSlices: function* () {},
    updateShadowFrustums() {},
    warmShadowFrame: () => {
      for (const child of scene.children) if (child !== garageRoot && child.visible) shadowWarms.push(child.name);
    },
    nextFrame: () => (frameGate ? frameGate.promise : Promise.resolve()),
    now: () => 0,
  });
  return {
    runtime, disposed, swaps, compiled, shadowWarms, skies, scene,
    /** The battlefield roots the scene would draw: mounted and visible. */
    drawn: () => scene.children.filter((child) => child !== garageRoot && child.visible).map((child) => child.name).sort(),
    gate(mapId) { const gate = deferred(); gates.set(mapId, gate); return gate; },
    holdFrames() { frameGate = deferred(); return frameGate; },
    releaseFrames() { const gate = frameGate; frameGate = null; gate?.resolve(); },
    holdClouds() { cloudGate = deferred(); return cloudGate; },
    releaseClouds() { const gate = cloudGate; cloudGate = null; gate?.resolve(); },
  };
}
const settle = (promise) => promise.then((world) => ({ world }), (error) => ({ error }));

// ---- 1. two overlapping ensures: the later request presents, the earlier never swaps over it (mobile, then desktop)
for (const worldScenes of [1, 2]) {
  const h = harness({ worldScenes });
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
  assert.deepEqual(h.drawn(), ['bravo'], `${worldScenes}: the superseded world never draws beside the one presented`);
  // (round 2 U26) the superseded build is speculative again and the later entry's request cancels it, on either tier: a
  // build nobody waits on never runs beside a demanded one (this pinned 'desktop keeps the superseded build cached', the
  // never-cancelled foreground build the audit names; worldActivationOrphans.selftest covers the orphan's pacing)
  assert.ok(!h.runtime.cache.has('alpha') && h.disposed.includes('alpha'),
    `${worldScenes}: the superseded build is cancelled by the later request and released, never cached`);
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
  // (review) desktop keeps two worlds: the superseded one stays cached, and it must not draw beside the one on screen
  assert.ok(h.runtime.cache.has('charlie'), `${later}: desktop keeps the superseded world cached`);
  assert.deepEqual(h.drawn(), ['bravo'], `${later}: the superseded world is hidden again, never drawn over the battlefield`);
  assert.deepEqual(h.compiled, [], `${later}: the superseded warm stops at its next wait: no program compile`);
  assert.deepEqual(h.shadowWarms, [], `${later}: and no shadow warm of a world nobody presents`);
}

// ---- 5. (review) the covered battle path (no precompile): superseded while its cloud warm is pending, desktop
{
  const h = harness({ worldScenes: 2 });
  h.holdClouds();
  const xray = settle(h.runtime.ensure('xray', null, { precompile: false, atmosphere: 'covered-battle' }));
  await flush();
  assert.deepEqual(h.swaps, [], 'xray waits on the cloud warm');
  const yankeeP = h.runtime.ensure('yankee', null, { precompile: false, atmosphere: 'covered-battle' });
  await flush();
  h.releaseClouds();
  const yankee = await yankeeP;
  const settled = await xray;
  assert.equal(settled.error?.name, 'WorldActivationSuperseded');
  assert.equal(h.runtime.current, yankee);
  assert.deepEqual([...h.runtime.cache.keys()].sort(), ['xray', 'yankee'], 'desktop keeps both');
  assert.deepEqual(h.drawn(), ['yankee'], 'only the battlefield presented draws: the superseded warm lowered its lift');
}
{
  // a warm that fails after lifting its world (the cloud wait rejects) hides it again too
  const h = harness({ worldScenes: 2 });
  const bravo = await h.runtime.ensure('bravo', null, { precompile: false });
  const clouds = h.holdClouds();
  const charlie = settle(h.runtime.ensure('charlie', null, { precompile: false }));
  await flush();
  clouds.reject(new Error('cloud warm failed'));
  assert.match((await charlie).error?.message ?? '', /cloud warm failed/);
  assert.equal(h.runtime.current, bravo);
  assert.deepEqual(h.drawn(), ['bravo'], 'a failed request never leaves the world it lifted drawn');
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

// ---- 6. (review) the Garage restore is a request: an orphaned ensure never presents over the Garage
{
  // the reviewer's path: a battle on alpha, back to the Garage, then an entry on bravo whose sibling task fails; the
  // entry's failure path restores the Garage (garageReturnRuntime: setDormant(true)) while bravo still builds
  for (const worldScenes of [1, 2]) {
    const h = harness({ worldScenes });
    await h.runtime.ensure('alpha', null, { precompile: false });
    h.runtime.setDormant(true);
    const bravoGate = h.gate('bravo');
    const orphan = settle(h.runtime.ensure('bravo', null, { precompile: false, atmosphere: 'covered-battle' }));
    await flush();
    assert.equal(h.runtime.current, null, 'the entry on another battlefield released the dormant one');
    h.skies.length = 0;
    h.runtime.setDormant(true); // the entry failed: the Garage is restored
    bravoGate.resolve();
    const settled = await orphan;
    assert.equal(settled.error?.name, 'WorldActivationSuperseded', `${worldScenes}: the orphaned ensure is superseded`);
    assert.equal(h.runtime.current, null, `${worldScenes}: the orphaned battlefield never becomes current`);
    assert.deepEqual(h.swaps.map(([, next]) => next), ['alpha'], `${worldScenes}: it never swaps into the scene`);
    assert.deepEqual(h.skies, [], `${worldScenes}: its sky, fog and sun never apply over the Garage`);
    assert.deepEqual(h.drawn(), [], `${worldScenes}: nothing of a battlefield draws under the Garage`);
  }
}
{
  // the rematch on the dormant battlefield, its entry failing during the warm: the battlefield stays dormant
  const h = harness({ worldScenes: 2 });
  const alpha = await h.runtime.ensure('alpha', null, { precompile: false });
  h.runtime.setDormant(true);
  h.holdFrames();
  const rematch = settle(h.runtime.ensure('alpha', null, { precompile: true }));
  await flush();
  h.runtime.setDormant(true);
  h.releaseFrames();
  const settled = await rematch;
  assert.equal(settled.error?.name, 'WorldActivationSuperseded', 'a Garage over the same world rejects the rematch');
  assert.equal(h.runtime.current, alpha, 'the dormant battlefield stays the resident one');
  assert.equal(h.runtime.dormant, true, 'and dormant: the Garage owns the screen');
  assert.deepEqual(h.drawn(), [], 'and it is hidden');
  assert.deepEqual(h.compiled, [], 'the abandoned warm compiles nothing');
}

// ---- 4. the overlap the owner closes, driven through the real barriers (round 2 U26: this was a source regex, and it named
// acquireNetwork's barrier, which never orphans its world). The solo barrier (acquireSolo) is Promise.all: a failed sibling
// settles it while the world task still runs, and the entry's failure path restores the Garage over that orphan. The
// network barrier (acquireNetwork) waits for its world task before it rethrows. The MP v2 round loader's own Promise.all
// (mp/session/browserComposition.ts) orphans its world the way acquireSolo does.
{
  const { createBattleEntryAcquisition } = await import('../game/battleEntryAcquisition.ts');
  const h = harness({ worldScenes: 1 });
  const bravoGate = h.gate('bravo');
  const failure = new Error('battle modules failed');
  let world = null;
  const barrier = createBattleEntryAcquisition({ now: () => 0 }).acquireSolo([
    () => Promise.reject(failure),
    () => (world = h.runtime.ensure('bravo', null, { precompile: false, atmosphere: 'covered-battle' })),
  ]);
  await assert.rejects(barrier, (error) => error === failure, 'solo: the failed sibling settles the barrier');
  let worldSettled = false;
  world.then(() => { worldSettled = true; }, () => { worldSettled = true; });
  await flush();
  assert.equal(worldSettled, false, 'solo: the world task still builds: the barrier orphaned it');
  h.runtime.setDormant(true); // the entry's failure path restores the Garage (garageReturnRuntime)
  bravoGate.resolve();
  assert.equal((await settle(world)).error?.name, 'WorldActivationSuperseded', 'solo: the orphan settles superseded');
  assert.equal(h.runtime.current, null, 'solo: and never presents over the Garage');
  assert.deepEqual(h.drawn(), [], 'solo: nothing of it draws');

  const worldGate = deferred();
  let networkWorld = false;
  const connectFailure = new Error('connect refused');
  const network = settle(createBattleEntryAcquisition({ now: () => 0 }).acquireNetwork({
    loadModules: async () => 'modules',
    loadWorld: () => worldGate.promise.then(() => { networkWorld = true; return 'world'; }),
    connect: async () => { throw connectFailure; },
    publishMatch() {},
  }));
  let networkSettled = false;
  network.then(() => { networkSettled = true; });
  await flush();
  assert.equal(networkSettled, false, 'network: a failed connect waits for its world task before it rethrows');
  worldGate.resolve();
  assert.equal((await network).error, connectFailure, 'network: then the first failure');
  assert.equal(networkWorld, true, 'network: its world task finished first (acquireNetwork never orphans the world)');
}

console.log('worldActivationLatestWins.selftest: the latest request presents, an earlier ensure is superseded (never swaps over it), direct activation, switchMap and the Garage restore supersede a warm, a request that never presents hides its world again and stops warming it, a warming world is held against the budget and the dormant release PASS');
