// worldActivationOneWorld.selftest.mjs — (mp-one-map-274; the owner, 2026-11-19: "in multiplayer, the map literally was
// like merged together with another map with a town, like a map in another map. fix that") One battlefield is drawn per
// frame. The real activation runtime over the real build coordinator and the real phase residency, with a frame source
// and a cloud bake the test holds (a hidden tab gives no animation frame, so the boot cloud bake an entry waits on stays
// open for as long as the tab is hidden):
// 1. a round after a battle: the last battlefield is presented awake while the next one warms under a held cloud bake.
//    Only the presented one is drawn until the next one presents, then only the next one (before: the warm lifted the
//    next world beside the last, and both stayed drawn for the whole wait).
// 2. the same with the precompile warm and no frames at all: the warmed world is drawn inside its program compile (the
//    compile sees it) and never between frames beside the presented one.
// 3. the Garage takes the screen from such a warm and hands it back: the woken battlefield is drawn alone, and the
//    superseded warm never draws.
// 4. the invariant itself: seeded runs of entries, prefetches, dormancy, map switches and held cloud bakes in random order
//    never draw two worlds at any step, and once everything settles the drawn world is the presented one (or none).
// 5. the owner's source: a world's group is drawn only by the lift rule and the residency (no other `visible = true`).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWorldActivationRuntime } from './worldActivationRuntime.ts';
import { createPhaseSceneResidency } from '../engine/phaseSceneResidency.ts';

function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve)); };
const settle = (promise) => promise.then((world) => ({ world }), (error) => ({ error }));
const STEPS = 3;

function harness({ worldScenes = 2 } = {}) {
  const scene = new THREE.Scene();
  const garageRoot = new THREE.Group();
  garageRoot.name = 'garage';
  scene.add(garageRoot);
  const residency = createPhaseSceneResidency({ scene, garageRoots: [garageRoot] });
  let pace = deferred();
  let cloudGate = null;
  let framesPaused = false;
  let frameWaiters = [];
  let clock = 0;
  const garage = { phase: 'garage', transitionActive: false, lastActivityAt: 0 };
  const sleeps = [];
  const compiledDrawn = [];
  const drawn = () => scene.children.filter((child) => child !== garageRoot && child.visible).map((child) => child.name).sort();
  const runtime = createWorldActivationRuntime({
    initialMapId: 'alpha',
    coordinatorDependencies: {
      engineContext: {}, scene, renderer: { renderLists: { dispose() {} } }, deviceTier: 'desktop',
      getGarageActivity: () => garage,
      releaseShadowMaterial() {},
      loadModule: async () => ({
        async createMapAsync(_engine, { mapId, terrainVariant }, progress) {
          for (let step = 0; step < STEPS; step++) await progress('Surveying terrain', step / STEPS);
          const group = new THREE.Group();
          group.name = terrainVariant ? `${mapId}#${terrainVariant}` : mapId;
          group.add(new THREE.Object3D());
          scene.add(group);
          return { mapId, group, config: { sky: {} }, raycast: () => null, dispose() {} };
        },
      }),
      now: () => clock,
      sleep: () => { const wait = deferred(); sleeps.push(wait); return wait.promise; },
      foregroundYielder: () => () => pace.promise,
      backgroundYielder: () => () => pace.promise,
      resourceLimits: { pedestalVisuals: 1, worldScenes },
    },
    swapSceneWorld: (previous, next) => residency.swapWorld(previous, next),
    setSceneWorldActive: (root, active) => residency.setWorldActive(root, active),
    ensureCloudTextures() {},
    awaitInitialCloudWarm: async () => { if (cloudGate) await cloudGate.promise; },
    applySkyPreset() {}, applySkyPresentation() {}, setSun() {},
    getFogDensity: () => 0, onFogDensityChanged() {},
    canCreateCollider: () => false, createCollider: () => null,
    placeGarage() {}, isMinimapReady: () => false, buildMinimap() {}, loadMinimapAsset: async () => false,
    // the program compile records what a frame drawn at that moment would draw
    compilePrograms() { compiledDrawn.push(drawn()); },
    linkerBreathingSlices: function* () {},
    updateShadowFrustums() {}, warmShadowFrame() {},
    // the frame source: a hidden tab's frames never come until the tab is shown
    nextFrame: () => {
      if (!framesPaused) return Promise.resolve();
      const wait = deferred();
      frameWaiters.push(wait);
      return wait.promise;
    },
    now: () => clock,
  });
  return {
    runtime, drawn, compiledDrawn,
    /** Loading slices for every build waiting on the pace, and the Garage's lull for the speculative ones. */
    async pump(times = STEPS + 2) {
      for (let i = 0; i < times; i++) {
        clock += 5000;
        for (const wait of sleeps.splice(0)) wait.resolve();
        const slice = pace; pace = deferred(); slice.resolve(); await flush();
      }
    },
    holdClouds() { if (!cloudGate) cloudGate = deferred(); },
    releaseClouds() { const gate = cloudGate; cloudGate = null; gate?.resolve(); },
    hideTab() { framesPaused = true; },
    showTab() { framesPaused = false; for (const wait of frameWaiters.splice(0)) wait.resolve(); },
  };
}

/** A battle on `mapId` presented awake (the result screen's battlefield, before the next round). */
async function presentBattle(h, mapId) {
  const entry = h.runtime.ensure(mapId, null, { precompile: false });
  await h.pump();
  const world = await entry;
  assert.equal(h.runtime.current, world, `${mapId} presents`);
  assert.deepEqual(h.drawn(), [mapId], `${mapId} alone is drawn`);
  return world;
}

// ---- 1. the next round warms under a held cloud bake beside the battlefield still presented
{
  const h = harness();
  await presentBattle(h, 'town');
  h.hideTab();
  h.holdClouds();
  const next = settle(h.runtime.ensure('bravo', null, { precompile: false, atmosphere: 'covered-battle' }));
  await h.pump();
  assert.equal(h.runtime.current?.mapId, 'town', 'the next round still waits on its cloud bake');
  assert.deepEqual(h.drawn(), ['town'],
    'while the next battlefield waits on the cloud bake, only the presented one is drawn (before: town and bravo, one scene)');
  h.showTab();
  h.releaseClouds();
  await flush();
  const { world, error } = await next;
  assert.ok(!error && world === h.runtime.current, 'the next battlefield presents once the bake ends');
  assert.deepEqual(h.drawn(), ['bravo'], 'and the last one left in the same step');
}

// ---- 2. the precompile warm with no frames: drawn inside the compile, never between frames beside the presented one
{
  const h = harness();
  await presentBattle(h, 'town');
  // the build first (it needs no frame), then the tab hides before the warm's first frame wait
  const built = h.runtime.prefetch('bravo', { intent: true });
  await h.pump();
  assert.ok(await built, 'bravo is built and cached');
  h.hideTab();
  const next = settle(h.runtime.ensure('bravo', null, { compilePrograms: true }));
  await flush();
  assert.deepEqual(h.drawn(), ['town'], 'waiting on its first frame, the warmed world is not drawn beside the presented one');
  h.showTab();
  await flush();
  for (let i = 0; i < 4; i++) { h.showTab(); await flush(); }
  const { world, error } = await next;
  assert.ok(!error && world === h.runtime.current, 'the warmed battlefield presents');
  assert.ok(h.compiledDrawn.some((names) => names.includes('bravo')), 'its program compile saw it drawn');
  assert.deepEqual(h.drawn(), ['bravo'], 'one battlefield drawn after the present');
}

// ---- 3. the Garage takes the screen from a warm beside the presented battlefield, then hands it back
{
  const h = harness();
  await presentBattle(h, 'town');
  h.holdClouds();
  const next = settle(h.runtime.ensure('bravo', null, { precompile: false, atmosphere: 'covered-battle' }));
  await h.pump();
  assert.deepEqual(h.drawn(), ['town'], 'the warm beside the presented battlefield keeps its world hidden');
  h.runtime.setDormant(true); // the entry failed: the Garage is restored (it supersedes the warm)
  assert.deepEqual(h.drawn(), [], 'the Garage: no battlefield drawn');
  h.runtime.setDormant(false); // back to the battlefield on screen
  assert.deepEqual(h.drawn(), ['town'], 'the woken battlefield is drawn alone');
  h.releaseClouds();
  await flush();
  assert.equal((await next).error?.name, 'WorldActivationSuperseded', 'the superseded warm never presents');
  assert.deepEqual(h.drawn(), ['town'], 'and never draws');
}

// ---- 4. the invariant over seeded random runs
{
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const maps = ['alpha', 'bravo', 'town', 'delta'];
  let runs = 0;
  for (let seed = 1; seed <= 6; seed++) {
    for (const worldScenes of [1, 2]) {
      const rand = rng(seed * 7919 + worldScenes);
      const h = harness({ worldScenes });
      const pick = () => maps[Math.floor(rand() * maps.length)];
      const inFlight = [];
      const history = [];
      for (let step = 0; step < 30; step++) {
        const r = rand();
        let op;
        if (r < 0.22) {
          const mapId = pick(), variant = rand() < 0.2 ? 'assault-trenches' : null;
          op = `covered ${mapId}${variant ? '#' + variant : ''}`;
          inFlight.push(h.runtime.ensure(mapId, null, { precompile: false, atmosphere: 'covered-battle', terrainVariant: variant }).catch(() => {}));
        } else if (r < 0.32) { const mapId = pick(); op = `ensure ${mapId}`; inFlight.push(h.runtime.ensure(mapId, null, { precompile: rand() < 0.5 ? false : undefined }).catch(() => {})); }
        else if (r < 0.42) { const mapId = pick(); op = `prefetch ${mapId}`; h.runtime.prefetch(mapId, { intent: rand() < 0.5 })?.catch?.(() => {}); }
        else if (r < 0.52) { op = 'dormant'; h.runtime.setDormant(true); }
        else if (r < 0.60) { op = 'awake'; h.runtime.setDormant(false); }
        else if (r < 0.66) { const mapId = pick(); op = `switch ${mapId}`; const p = h.runtime.switchMap(mapId); if (p?.catch) inFlight.push(p.catch(() => {})); }
        else if (r < 0.72) { op = 'hold clouds'; h.holdClouds(); }
        else if (r < 0.78) { op = 'release clouds'; h.releaseClouds(); }
        else if (r < 0.84) { op = 'hide tab'; h.hideTab(); }
        else if (r < 0.90) { op = 'show tab'; h.showTab(); }
        else op = 'pump';
        await h.pump(2);
        const drawn = h.drawn();
        history.push(`${op} -> [${drawn}]`);
        assert.ok(drawn.length <= 1, `seed ${seed}/${worldScenes}: two battlefields drawn at once\n${history.join('\n')}`);
        if (rand() < 0.2) {
          h.showTab(); h.releaseClouds();
          await h.pump(12);
          await Promise.all(inFlight.splice(0));
          const now = h.drawn(), current = h.runtime.current?.group.name ?? null;
          history.push(`  settled -> [${now}] current ${current} dormant ${h.runtime.dormant}`);
          const expected = h.runtime.dormant || !current ? [] : [current];
          assert.deepEqual(now, expected, `seed ${seed}/${worldScenes}: settled, the drawn world is the presented one\n${history.join('\n')}`);
        }
      }
      h.showTab(); h.releaseClouds();
      await h.pump(12);
      await Promise.all(inFlight.splice(0));
      runs++;
    }
  }
  assert.equal(runs, 12, 'every seeded run finished');
}

// ---- 5. the owner's source: no other path draws a world's group
{
  const source = readFileSync(new URL('./worldActivationRuntime.ts', import.meta.url), 'utf8');
  const lifts = source.split('\n').filter((line) => /\.group\.visible\s*=\s*(true|drawn)\b/.test(line) || /\.visible\s*=\s*true\s*;/.test(line) && /group/.test(line));
  assert.deepEqual(lifts.map((line) => line.trim()), [
    "if (world === current && !dormant) { world.group.visible = true; return; }",
    'world.group.visible = drawn;',
    'world.group.visible = true;',
  ], 'a world group is drawn only by settleLift and whileDrawn (the lift rule); the residency mounts the presented one');
}

// ---- 6. (mp-fixes-277) the runtime is the battlefield's one owner: activeWorld() is its presented world, never the first
// world the scene holds. The Garage's planned battlefield is built first (first in the scene, hidden); the room's
// battlefield presents after it; the reference names the room's, and both are battlefield roots, the Garage's are not.
{
  const { activeWorld, isBattlefieldRoot } = await import('./activeWorld.ts');
  const h = harness();
  const planned = settle(h.runtime.prefetch('desert', { intent: true }));
  await h.pump();
  await planned;
  const room = await presentBattle(h, 'verdant');
  const scene = room.group.parent;
  const worlds = scene.children.filter((child) => child.name && child.name !== 'garage');
  assert.equal(worlds[0]?.name, 'desert', 'the planned battlefield is the first world in the scene (what a name search found)');
  assert.equal(activeWorld()?.mapId, 'verdant', 'the reference is the presented battlefield');
  assert.equal(activeWorld()?.group, room.group);
  assert.ok(isBattlefieldRoot(worlds[0]) && isBattlefieldRoot(room.group), 'both are battlefield roots');
  assert.equal(isBattlefieldRoot(scene.children.find((child) => child.name === 'garage')), false, 'the Garage is not');
  h.runtime.setDormant(true);
  assert.equal(activeWorld()?.mapId, 'verdant', 'dormant under the Garage, the reference stays the owner\'s');
}

console.log('worldActivationOneWorld.selftest: one battlefield drawn per frame (a round warming beside the presented battlefield under a held cloud bake or with no frames, the Garage taking and handing back the screen during a warm, 12 seeded runs at every step and once settled), lifts only through the rule, the active world from its owner (mp-fixes-277) PASS');
process.exit(0);
