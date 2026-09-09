import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WebGLLights } from 'three/src/renderers/webgl/WebGLLights.js';
import { createNightLightingAccess } from '../engine/nightLightingAccess.ts';
import { registerNightLightEmitters } from '../engine/nightLightingRuntime.ts';
import { createSoloBattleDeploymentRuntime } from './soloBattleDeploymentRuntime.ts';

function createHarness({ failAllies = false, failAtmosphere = false, pauseAtmosphere = false,
  night = false, failNight = false, pauseNight = false } = {}) {
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
  const worldGroup = new THREE.Group();
  worldGroup.name = 'world';
  scene.add(worldGroup);
  const fxGroup = new THREE.Group();
  fxGroup.name = 'fx';
  scene.add(fxGroup);
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
    camera: new THREE.PerspectiveCamera(),
    battleLoad: {
      progress: (fraction, label) => calls.push(['progress', fraction, label]),
    },
    battleWarm: {
      warmBattleTerrainTiles: async () => calls.push(['terrain']),
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
      compile,
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
    lighting: { csm: { lights: [] } },
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
    prepareRevealCamera: () => calls.push(['camera']),
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
    createLoadingYielder: () => async () => calls.push(['yield']),
  });

  return {
    runtime,
    calls,
    releaseAtmosphere,
    releaseNight, lamps, lightSignatures,
    get generation() { return generation; },
    set generation(value) { generation = value; },
    get pending() { return pending; },
    get destructionWarmed() { return destructionWarmed; },
  };
}

const happy = createHarness();
const result = await happy.runtime.warm(Promise.resolve());
assert.deepEqual(result, { generation: 1, revealPrimed: true });
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
  ['camera', 'shadowWarm'],
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
assert.deepEqual(happy.lightSignatures, [[0, 0], [0, 0]], 'day constructs no night light pool');
assert.equal(happy.lamps.current, null);

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
assert.equal((await failedNight.runtime.warm(Promise.resolve())).revealPrimed, false);
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
assert.equal((await pendingNight).revealPrimed, false);
assert.equal(cancelledNight.calls.some(([name]) => ['allies', 'compile', 'reveal'].includes(name)), false);
cancelledNight.lamps.dispose();

const cancelled = createHarness();
let releaseCamo;
const camo = new Promise((resolve) => { releaseCamo = resolve; });
const cancelledWarm = cancelled.runtime.warm(camo);
cancelled.generation = 2;
releaseCamo();
assert.deepEqual(await cancelledWarm, { generation: 1, revealPrimed: false });
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
assert.deepEqual(await pendingAtmosphere, { generation: 1, revealPrimed: false });
assert.equal(cancelledAtmosphere.calls.some(([name]) => ['allies', 'compile', 'reveal'].includes(name)), false,
  'cancellation during atmosphere cannot compile or reveal an obsolete battle');

const failedAtmosphere = createHarness({ failAtmosphere: true });
assert.deepEqual(await failedAtmosphere.runtime.warm(Promise.resolve()), { generation: 1, revealPrimed: false });
assert.match(globalThis.__BATTLE_COUNTDOWN_WARM.error, /atmosphere failed/);
assert.equal(failedAtmosphere.calls.some(([name]) => ['compile', 'reveal'].includes(name)), false,
  'failed atmosphere preparation cannot be reported as a primed deployment');

const failed = createHarness({ failAllies: true });
assert.deepEqual(await failed.runtime.warm(Promise.resolve()), {
  generation: 1,
  revealPrimed: false,
});
assert.match(globalThis.__BATTLE_COUNTDOWN_WARM.error, /allied warm failed/);

delete globalThis.__BATTLE_COUNTDOWN_WARM;
delete globalThis.__COMBAT_OPENING_WARM;
console.log('soloBattleDeploymentRuntime.selftest: exact day/night light signatures, late actors, order, cancellation and fallback pass');
