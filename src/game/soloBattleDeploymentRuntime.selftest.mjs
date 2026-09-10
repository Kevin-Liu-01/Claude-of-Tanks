import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WebGLLights } from 'three/src/renderers/webgl/WebGLLights.js';
import { createNightLightingAccess } from '../engine/nightLightingAccess.ts';
import { registerNightLightEmitters } from '../engine/nightLightingRuntime.ts';
import { createSoloBattleDeploymentRuntime } from './soloBattleDeploymentRuntime.ts';
import { primeOpeningTerrainPresentation } from './battleWarmRuntime.ts';

function createHarness({ failAllies = false, failAtmosphere = false, pauseAtmosphere = false,
  night = false, failNight = false, pauseNight = false, cancelCover = false, failCover = false,
  compileSlices = 2, cancelCompile = false, lateCancelCompile = '', lateCancelWarm = '' } = {}) {
  const calls = [];
  let releaseAtmosphere;
  const atmosphereGate = new Promise((resolve) => { releaseAtmosphere = resolve; });
  let releaseNight;
  const nightGate = new Promise((resolve) => { releaseNight = resolve; });
  let generation = 0;
  let pending = false;
  let destructionWarmed = false;
  let clock = 0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const worldGroup = new THREE.Group();
  worldGroup.name = 'world';
  scene.add(worldGroup);
  const fxGroup = new THREE.Group();
  fxGroup.name = 'fx';
  scene.add(fxGroup);
  const warmResources = [];
  if (lateCancelWarm === 'fx') {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    warmResources.push(geometry, material);
    fxGroup.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  }
  const shadow = { autoUpdate: true, needsUpdate: true };
  const playerRoot = new THREE.Group();
  const game = {
    phase: 'battle',
    preBattleS: 4,
    tanks: [
      { id: 'player', specId: 'ally', team: 'player', isPlayer: true,
        visual: { root: playerRoot }, combat: { destroyed: false } },
      { specId: 'enemy', team: 'enemy' },
    ],
  };
  game.player = game.tanks[0];
  scene.add(playerRoot);
  registerNightLightEmitters(playerRoot, [{ kind: 'headlight', position: [0, 1, 2] }]);
  let atmosphereReady = false;
  const lamps = createNightLightingAccess({
    scene, getWorldRoot: () => worldGroup, getEntities: () => game.tanks,
    getCameraPosition: () => new THREE.Vector3(),
    isNight: () => atmosphereReady && night,
    isBattlePresentation: () => true, isEntityVisible: () => true,
  });
  const lightState = new WebGLLights({ has: () => false });
  const lightSignatures = [];
  const compile = () => {
    const lights = [];
    scene.traverseVisible(object => { if (object.isLight) lights.push(object); });
    lightState.setup(lights);
    lightSignatures.push([lightState.state.spot.length, lightState.state.point.length]);
    calls.push(['compile']);
  };

  const runtime = createSoloBattleDeploymentRuntime({
    game,
    scene,
    camera,
    battleLoad: {
      progress: (fraction, label) => calls.push(['progress', fraction, label]),
    },
    battleWarm: {
      warmBattleTerrainTiles: async options => {
        assert.equal(options.primePresentation, false, 'terrain warm cannot guess the reveal camera');
        calls.push(['terrain']);
      },
      primeOpeningTerrainPresentation: async options => {
        assert.strictEqual(options.camera, camera);
        assert.equal(typeof options.assertCurrent, 'function', 'solo supplies its generation owner to terrain');
        assert.deepEqual(camera.position.toArray(), [20, 6, -0.3], 'ground cover consumes the snapped pose');
        calls.push(['groundCover']);
        if (lateCancelWarm === 'cover') return primeOpeningTerrainPresentation({
          ...options,
          game: { tanks: [], player: { state: { pos: new THREE.Vector3() } } },
          world: {
            update() { calls.push(['groundCoverUpdate']); },
            getGrassWorkState() {
              calls.push(['groundCoverState']);
              return { disposed: false, carpet: { cold: true, pending: true } };
            },
          },
        });
        if (cancelCover) generation++;
        await options.yieldForBudget(true);
        if (failCover) throw new Error('ground cover failed');
        calls.push(['groundCoverReady']);
      },
      stageCombatFxProgramSubmission: async () => ({
        staged: true,
        restore: () => calls.push(['restoreFx']),
      }),
    },
    armorAimOverlay: {
      warm: () => {
        calls.push(['armorWarm']);
        return () => calls.push(['restoreArmor']);
      },
    },
    forwardProgramWarm: {
      compile: () => { throw new Error('deployment must not submit the whole scene atomically'); },
      compileSceneSteps: function* (options) {
        assert.equal(options.sliceMs, 8);
        compile();
        try {
          for (let index = 0; index < compileSlices; index++) {
            calls.push(['compileSlice', index]);
            yield;
          }
          options.timing.submissionSlices = compileSlices + 1;
          calls.push(['compileComplete']);
        } finally { calls.push(['compileClosed']); }
      },
      initializeSteps: function* () {},
      linkerBreathingSlices: function* () {},
      invalidate: () => {},
    },
    combatWarm: {
      markOpeningReady: () => calls.push(['openingReady']),
    },
    post: {
      warmFirstFrame: async (yieldBeforePass) => {
        calls.push(['postWarm']);
        await yieldBeforePass('post-pass');
        calls.push(['postYielded']);
        return { passes: 1 };
      },
    },
    lighting: { csm: { lights: lateCancelWarm === 'forward' ? [{ shadow }] : [] } },
    createShell: () => {},
    getWorld: () => ({ group: worldGroup }),
    getBattleVisuals: () => ({
      stream: async (predicate, _yield, onProgress, hidden) => {
        const entity = hidden ? game.tanks[1] : game.tanks[0];
        assert.equal(predicate(entity), true);
        calls.push([hidden ? 'enemies' : 'allies']);
        onProgress?.(1);
        if (!hidden && failAllies) throw new Error('allied warm failed');
        const ally = { id: 'late-ally', team: 'player', specId: 'late-ally',
          visual: { root: new THREE.Group() }, combat: { destroyed: false } };
        registerNightLightEmitters(ally.visual.root, [{ kind: 'headlight', position: [2, 1, 2] }]);
        scene.add(ally.visual.root); game.tanks.push(ally);
        lamps.appendEntity(ally); // same explicit production construction hook
        compile();
        return 1;
      },
      stageRootTextureUploads: async () => ({ textures: 0, totalMs: 0 }),
      stageBattleVisualReveal: async () => {},
    }),
    getFx: () => ({ group: fxGroup }),
    getWarmRender: () => () => calls.push(['warmRender']),
    getDeploymentShadowWarm: () => ({
      warmDepthProgramSteps: function* () {},
      prime: async () => {
        calls.push(['shadowWarm']);
        return { cascades: 4, maxMs: 0, totalMs: 0 };
      },
      dispose: () => {},
    }),
    getEntryLifecycle: () => ({
      run: async (task) => task(),
      coverRendering: () => calls.push(['cover']),
      uncoverRendering: () => {},
      noteBattleFrame: () => {},
      primeReveal: async () => {
        lamps.update();
        calls.push(['reveal']);
        return { primed: true, frameSerial: 1, waitMs: 0 };
      },
      pending: false,
      renderingCovered: false,
    }),
    prepareRevealCamera: () => {
      camera.position.set(20, 6, -0.3);
      calls.push(['camera']);
    },
    prepareAtmosphere: async () => {
      calls.push(['atmosphere']);
      if (pauseAtmosphere) await atmosphereGate;
      if (failAtmosphere) throw new Error('atmosphere failed');
      atmosphereReady = true;
      calls.push(['atmosphereReady']);
    },
    prepareNightLighting: async () => {
      calls.push(['nightLighting']);
      if (pauseNight) await nightGate;
      if (failNight) throw new Error('night lighting failed');
      await lamps.prepare();
    },
    getGeneration: () => generation,
    advanceGeneration: () => ++generation,
    setPending: (value) => { pending = value; },
    setDestructionWarmed: (value) => { destructionWarmed = value; },
    now: () => ++clock,
    yieldFrame: async () => calls.push(['frame']),
    createLoadingYielder: () => async (force) => {
      const previous = calls.at(-1)?.[0];
      if (cancelCompile && previous === 'compileSlice') generation++;
      if ((lateCancelCompile === 'slice' && previous === 'compileSlice')
        || (lateCancelCompile === 'final' && previous === 'compileClosed')
        || (lateCancelWarm === 'cover' && previous === 'groundCoverUpdate')
        || (lateCancelWarm === 'fx' && previous === 'warmRender')
        || (lateCancelWarm === 'forward' && previous === 'warmRender')) {
        // The nested microtask runs after guardedCoveredYield's internal
        // post-check but before the outer warm continuation resumes.
        queueMicrotask(() => queueMicrotask(() => { generation++; }));
      }
      calls.push(['yield', force]);
    },
  });

  return {
    runtime,
    calls,
    releaseAtmosphere,
    releaseNight, lamps, lightSignatures,
    shadow, worldGroup, playerRoot, fxGroup,
    disposeWarmResources() { for (const resource of warmResources) resource.dispose(); },
    get generation() { return generation; },
    set generation(value) { generation = value; },
    get pending() { return pending; },
    get destructionWarmed() { return destructionWarmed; },
  };
}

const happy = createHarness();
const result = await happy.runtime.warm(Promise.resolve());
assert.equal(result.generation, 1);
assert.equal(result.revealPrimed, true);
assert.doesNotThrow(result.assertRevealReady);
assert.equal(happy.pending, true, 'deferred warm owns the pending latch after entry warm');
assert.equal(happy.destructionWarmed, true);
const order = happy.calls.map(([name]) => name);
for (const [before, after] of [
  ['atmosphere', 'atmosphereReady'],
  ['atmosphereReady', 'allies'],
  ['atmosphereReady', 'compile'],
  ['allies', 'terrain'],
  ['nightLighting', 'allies'],
  ['nightLighting', 'terrain'],
  ['nightLighting', 'compile'],
  ['terrain', 'camera'],
  ['camera', 'groundCover'],
  ['groundCoverReady', 'shadowWarm'],
  ['shadowWarm', 'postWarm'],
  ['postWarm', 'postYielded'],
  ['postWarm', 'reveal'],
  ['reveal', 'cover'],
]) {
  assert.ok(order.indexOf(before) >= 0 && order.indexOf(before) < order.indexOf(after),
    `${before} precedes ${after}`);
}
assert.equal(order.includes('enemies'), false,
  'hidden opponents are deferred until the visible deployment countdown');
assert.equal(globalThis.__BATTLE_COUNTDOWN_WARM.done, true);
assert.equal(globalThis.__BATTLE_COUNTDOWN_WARM.doneBeforeRollout, true);
assert.equal(globalThis.__BATTLE_COUNTDOWN_WARM.enemyVisualsDeferred, true);
assert.equal(globalThis.__BATTLE_COUNTDOWN_WARM.deploymentUniformsDeferred, true);
assert.equal(globalThis.__COMBAT_OPENING_WARM.covered, true);
assert.equal(globalThis.__BATTLE_COUNTDOWN_WARM.deploymentProgramSubmission.submissionSlices, 3);
for (let index = 0; index < happy.calls.length; index++) {
  if (happy.calls[index][0] === 'compileSlice') {
    assert.deepEqual(happy.calls[index + 1], ['yield', true], 'every submission slice releases its task');
  }
}
assert.ok(order.indexOf('compileClosed') < order.indexOf('warmRender'));
assert.deepEqual(happy.calls[order.indexOf('compileClosed') + 1], ['yield', true],
  'final submission releases its task before the first native forward bind');
assert.deepEqual(happy.lightSignatures, [[0, 0], [0, 0]], 'day constructs no night light pool');
assert.equal(happy.lamps.current, null);

const shortCompile = createHarness({ compileSlices: 0 });
await shortCompile.runtime.warm(Promise.resolve());
const shortOrder = shortCompile.calls.map(([name]) => name);
assert.deepEqual(shortCompile.calls[shortOrder.indexOf('compileClosed') + 1], ['yield', true],
  'a short compiler with no checkpoints still separates submission from first bind');
const staleCompile = createHarness({ cancelCompile: true });
await assert.rejects(staleCompile.runtime.warm(Promise.resolve()), /superseded/);
for (const restored of ['compileClosed', 'restoreFx', 'restoreArmor']) {
  assert.equal(staleCompile.calls.filter(([name]) => name === restored).length, 1,
    `cancellation closes ${restored} exactly once`);
}
assert.ok(!staleCompile.calls.some(([name]) => ['compileComplete', 'warmRender', 'shadowWarm', 'reveal'].includes(name)),
  'a stale compile cannot bind, shadow-warm, or reveal');
for (const lateCancelCompile of ['slice', 'final']) {
  const late = createHarness({ lateCancelCompile });
  await assert.rejects(late.runtime.warm(Promise.resolve()), /superseded/);
  assert.ok(!late.calls.some(([name]) => ['warmRender', 'shadowWarm', 'reveal'].includes(name)),
    `late ${lateCancelCompile} cancellation cannot bind or reveal`);
  assert.equal(late.calls.filter(([name]) => name === 'compileClosed').length, 1);
  assert.equal(late.calls.filter(([name]) => name === 'restoreFx').length, 1);
  assert.equal(late.calls.filter(([name]) => name === 'restoreArmor').length, 1);
  if (lateCancelCompile === 'slice') {
    assert.equal(late.calls.filter(([name]) => name === 'compileSlice').length, 1,
      'late cancellation cannot admit another compiler batch');
  }
}

for (const option of ['cancelCover', 'failCover']) {
  const harness = createHarness({ [option]: true });
  await assert.rejects(harness.runtime.warm(Promise.resolve()),
    option === 'failCover' ? /ground cover failed/ : /superseded/);
  assert.ok(!harness.calls.some(([name]) => name === 'reveal' || name === 'shadowWarm'));
}

for (const lateCancelWarm of ['cover', 'fx', 'forward']) {
  const harness = createHarness({ lateCancelWarm });
  try {
    await assert.rejects(harness.runtime.warm(Promise.resolve()), /superseded/);
    const count = name => harness.calls.filter(([event]) => event === name).length;
    assert.equal(count('reveal'), 0, `${lateCancelWarm}: stale work cannot reveal`);
    assert.equal(count('postWarm'), 0, `${lateCancelWarm}: stale work cannot enter post warm`);
    if (lateCancelWarm === 'cover') {
      assert.equal(count('groundCoverUpdate'), 1, 'actual terrain producer stops at its outer generation boundary');
      assert.equal(count('groundCoverState'), 0, 'no readiness read after supersession');
      assert.equal(count('armorWarm'), 0, 'incomplete terrain never enters optional shader fallback');
    } else {
      assert.equal(count('warmRender'), 1, `${lateCancelWarm}: IteratorClose prevents another cohort render`);
      assert.equal(count('restoreFx'), 1);
      assert.equal(count('restoreArmor'), 1);
      assert.equal(harness.worldGroup.visible, true, 'world visibility restored');
      assert.equal(harness.playerRoot.visible, true, 'player visibility restored');
      assert.equal(harness.fxGroup.visible, false, 'private FX visibility restored');
      assert.ok(harness.fxGroup.children.every(child => child.visible), 'hidden cohort siblings restored');
      assert.deepEqual(harness.shadow, { autoUpdate: true, needsUpdate: true }, 'iterator finalizer restores CSM flags');
      if (lateCancelWarm === 'fx') assert.equal(count('shadowWarm'), 0, 'cancelled FX cannot advance to shadows');
    }
  } finally { harness.disposeWarmResources(); }
}

const nocturnal = createHarness({ night: true });
assert.equal((await nocturnal.runtime.warm(Promise.resolve())).revealPrimed, true);
assert.deepEqual(nocturnal.lightSignatures, [[2, 1], [2, 1]],
  'real Three light signatures are final before BOTH allied and scene/player submissions');
assert.equal(nocturnal.lamps.current.emitterCount, 2,
  'player collected before streaming and late ally appended without another prepare');
assert.equal(nocturnal.calls.filter(([name]) => name === 'nightLighting').length, 1);
assert.equal(nocturnal.lamps.current.lights.filter(light => light.isSpotLight && light.intensity > 0).length, 2,
  'late allied headlight is active by the final covered reveal');
assert.ok(nocturnal.lamps.current.lights.every(light => light.castShadow === false));
nocturnal.lamps.dispose();

const failedNight = createHarness({ night: true, failNight: true });
await assert.rejects(failedNight.runtime.warm(Promise.resolve()), /night lighting failed/);
assert.match(globalThis.__BATTLE_COUNTDOWN_WARM.error, /night lighting failed/);
assert.equal(failedNight.calls.some(([name]) => ['allies', 'compile', 'reveal'].includes(name)), false,
  'failed night setup cannot compile the day signature or reveal the battle');

const cancelledNight = createHarness({ night: true, pauseNight: true });
const pendingNight = cancelledNight.runtime.warm(Promise.resolve());
for (let i = 0; i < 20 && !cancelledNight.calls.some(([name]) => name === 'nightLighting'); i++) {
  await new Promise(resolve => setImmediate(resolve));
}
assert.ok(cancelledNight.calls.some(([name]) => name === 'nightLighting'));
cancelledNight.generation = 2; cancelledNight.releaseNight();
await assert.rejects(pendingNight, /superseded/);
assert.equal(cancelledNight.calls.some(([name]) => ['allies', 'compile', 'reveal'].includes(name)), false);
cancelledNight.lamps.dispose();

const cancelled = createHarness();
let releaseCamo;
const camo = new Promise((resolve) => { releaseCamo = resolve; });
const cancelledWarm = cancelled.runtime.warm(camo);
cancelled.generation = 2;
releaseCamo();
await assert.rejects(cancelledWarm, /superseded/);
assert.equal(cancelled.calls.some(([name]) => name === 'allies'), false,
  'a stale generation performs no visual work');
assert.equal(cancelled.calls.some(([name]) => name === 'atmosphere'), false,
  'a stale pre-authority/camouflage generation cannot acquire atmosphere');

const cancelledAtmosphere = createHarness({ pauseAtmosphere: true });
const pendingAtmosphere = cancelledAtmosphere.runtime.warm(Promise.resolve());
for (let i = 0; i < 20 && !cancelledAtmosphere.calls.some(([name]) => name === 'atmosphere'); i++) {
  await new Promise((resolve) => setImmediate(resolve));
}
assert.ok(cancelledAtmosphere.calls.some(([name]) => name === 'atmosphere'));
assert.equal(cancelledAtmosphere.calls.some(([name]) => name === 'compile'), false,
  'first compile waits for atmosphere acquisition');
cancelledAtmosphere.generation = 2;
cancelledAtmosphere.releaseAtmosphere();
await assert.rejects(pendingAtmosphere, /superseded/);
assert.equal(cancelledAtmosphere.calls.some(([name]) => ['allies', 'compile', 'reveal'].includes(name)), false,
  'cancellation during atmosphere cannot compile or reveal an obsolete battle');

const failedAtmosphere = createHarness({ failAtmosphere: true });
await assert.rejects(failedAtmosphere.runtime.warm(Promise.resolve()), /atmosphere failed/);
assert.match(globalThis.__BATTLE_COUNTDOWN_WARM.error, /atmosphere failed/);
assert.equal(failedAtmosphere.calls.some(([name]) => ['compile', 'reveal'].includes(name)), false,
  'failed atmosphere preparation cannot be reported as a primed deployment');

const failed = createHarness({ failAllies: true });
await assert.rejects(failed.runtime.warm(Promise.resolve()), /allied warm failed/);
assert.match(globalThis.__BATTLE_COUNTDOWN_WARM.error, /allied warm failed/);
happy.generation++;
assert.throws(result.assertRevealReady, /superseded/, 'a returned receipt cannot outlive its generation');

delete globalThis.__BATTLE_COUNTDOWN_WARM;
delete globalThis.__COMBAT_OPENING_WARM;
console.log('soloBattleDeploymentRuntime.selftest: exact day/night light signatures, late actors, order, cancellation and fallback pass');
