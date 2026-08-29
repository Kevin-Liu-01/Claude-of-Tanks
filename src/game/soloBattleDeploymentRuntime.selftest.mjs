import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSoloBattleDeploymentRuntime } from './soloBattleDeploymentRuntime.ts';

function createHarness({ failAllies = false } = {}) {
  const calls = [];
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
      { specId: 'ally', team: 'player', isPlayer: true, visual: { root: playerRoot } },
      { specId: 'enemy', team: 'enemy' },
    ],
  };
  game.player = game.tanks[0];

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
      compile: () => calls.push(['compile']),
      initializeSteps: function* () {},
      linkerBreathingSlices: function* () {},
      invalidate: () => {},
    },
    combatWarm: {
      markOpeningReady: () => calls.push(['openingReady']),
    },
    post: {
      setAdaptiveSuspended: (value) => calls.push(['adaptive', value]),
      warmFirstFrame: async () => {
        calls.push(['postWarm']);
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
        calls.push(['reveal']);
        return { primed: true, frameSerial: 1, waitMs: 0 };
      },
      pending: false,
      renderingCovered: false,
    }),
    prepareRevealCamera: () => calls.push(['camera']),
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
  ['allies', 'terrain'],
  ['terrain', 'camera'],
  ['camera', 'shadowWarm'],
  ['shadowWarm', 'postWarm'],
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

const cancelled = createHarness();
let releaseCamo;
const camo = new Promise((resolve) => { releaseCamo = resolve; });
const cancelledWarm = cancelled.runtime.warm(camo);
cancelled.generation = 2;
releaseCamo();
assert.deepEqual(await cancelledWarm, { generation: 1, revealPrimed: false });
assert.equal(cancelled.calls.some(([name]) => name === 'allies'), false,
  'a stale generation performs no visual work');

const failed = createHarness({ failAllies: true });
assert.deepEqual(await failed.runtime.warm(Promise.resolve()), {
  generation: 1,
  revealPrimed: false,
});
assert.match(globalThis.__BATTLE_COUNTDOWN_WARM.error, /allied warm failed/);

delete globalThis.__BATTLE_COUNTDOWN_WARM;
delete globalThis.__COMBAT_OPENING_WARM;
console.log('soloBattleDeploymentRuntime.selftest: order, cancellation, and fallback pass');
