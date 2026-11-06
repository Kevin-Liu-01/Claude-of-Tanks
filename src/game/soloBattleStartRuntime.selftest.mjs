import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyBurnHook, makeBurnUniforms } from '../vehicles/materials.ts';
import { createSoloBattleStartRuntime } from './soloBattleStartRuntime.ts';
import { createAppLifecycle } from './appLifecycle.ts';
import { createStudioLeftWorld } from '../world/studioLeftWorld.test-support.mjs';

/** (ac130-fx-228) the harness roster adds a bot on the player's own spec (a valid duplicate pick) */
let dupEscort = false;

function createHarness({ playerCreated = true, visual = { id: 'visual' }, onMaskStart = () => {}, world: givenWorld = null } = {}) {
  const events = [];
  let clock = 0;
  let trace = null;
  let setupOptions = null;
  let camoSweep = null;
  let snap = null;
  const world = givenWorld ?? {
    mapId: 'winter',
    resetDestructibles: () => events.push('world:reset'),
  };
  const player = {
    id: 'player-1', specId: 'm1a1_abrams_hc', spec: { id: 'm1a1_abrams_hc' },
    state: { yaw: 1.25 }, visual, equip: ['rammer'],
  };
  const game = { preBattleS: 0, mapId: '', phase: 'garage', player: null, tanks: [] };
  // (2026-11-02 audit F1) the session's lifecycle announces the phase the start runtime moves
  createAppLifecycle({ game, announce: ({ phase }) => events.push(`phase:${phase}`) });
  const runtime = createSoloBattleStartRuntime({
    state: {
      game,
      getPendingMapId: () => 'verdant',
      setSelectedSpecId: (id) => events.push(`selected:${id}`),
      rememberSpecId: (id) => events.push(`remember:${id}`),
      setShotMode: (value) => events.push(`shot:${value}`),
      setCaptureHidden: (value) => events.push(`capture:${value}`),
      setSimulationAccumulator: (value) => events.push(`sim:${value}`),
      setCamoSweep: (work) => { camoSweep = work; events.push('camo:sweep'); },
    },
    world: {
      resolveMapId: (id) => id === 'random' ? 'winter' : id,
      switchMap: (id) => events.push(`world:switch:${id}`),
      getActive: () => world,
      setDormant: (value) => events.push(`world:dormant:${value}`),
      scheduleBlackWatchdog: covered => events.push(`world:watchdog:${covered}`),
    },
    round: {
      getFx: () => ({
        setFrozen: (value) => events.push(`fx:frozen:${value}`),
        resetAll: () => events.push('fx:reset'),
      }),
      settings: {
        isOpen: () => true,
        close: (options) => { assert.deepEqual(options, { noRelock: true }); events.push('settings:close'); },
      },
      killcam: { cancel: () => events.push('killcam:cancel') },
      armorAim: { clear: () => events.push('armor:clear') },
      resetDriveAim: () => events.push('drive:reset'),
      setCamoBiome: (id) => events.push(`camo:biome:${id}`),
      lendPlayerVisual: (id, useTank = true) => events.push(`pedestal:${useTank ? 'lend' : 'park'}:${id}`),
      setupBattle: (_game, id, activeWorld, options) => {
        assert.equal(id, 'm1a1_abrams_hc');
        assert.strictEqual(activeWorld, world);
        setupOptions = options;
        game.tanks = [{ specId: 'm1a1_abrams_hc', isPlayer: true }, { specId: 't90am' }, ...(dupEscort ? [{ specId: 'm1a1_abrams_hc' }] : [])];
        if (playerCreated) game.player = player;
        events.push('round:setup');
      },
      combatWarm: {
        reset: () => events.push('warm:reset'),
        drain: () => events.push('warm:drain'),
      },
      presentation: {
        primeDeploymentTerrainTiles: () => events.push('terrain:prime'),
        resetSoloPoses: () => events.push('poses:reset'),
      },
      applyPlayerCamo: (id) => events.push(`camo:player:${id}`),
      applyRosterCamo: (options) => {
        assert.deepEqual(options, {
          priorityIds: setupOptions.gameMode === 'ac130' ? [] : ['m1a1_abrams_hc'],
          onlySpecIds: setupOptions.gameMode === 'ac130' ? ['t90am', ...(dupEscort ? ['m1a1_abrams_hc'] : [])]
            : ['m1a1_abrams_hc', 't90am', ...(dupEscort ? ['m1a1_abrams_hc'] : [])],
        });
        events.push('camo:roster');
        return Promise.resolve('painted');
      },
    },
    ui: {
      hud: {
        shotInfo: { setPlayer: (id) => events.push(`hud:player:${id}`) },
        setMode: (mode) => events.push(`hud:${mode}`),
      },
      playerActions: {
        setTank: () => events.push('actions:tank'),
        resetConsumables: () => events.push('actions:consumables'),
      },
      damagePanel: {
        setTank: (_spec, borrowedVisual) => {
          assert.strictEqual(borrowedVisual, player.visual, 'mask borrows the actual player visual');
          onMaskStart(borrowedVisual);
          events.push('damage:tank');
        },
        setEquipment: () => events.push('damage:equipment'),
      },
      hideGarage: () => events.push('garage:hide'),
      hideEndOverlay: () => events.push('result:hide'),
      resetBattleResult: () => events.push('result:reset'),
      setGarageLighting: (value) => events.push(`garage:lighting:${value}`),
      emitConsumableReset: () => events.push('consumable:event'),
      rig: {
        release: () => events.push('rig:release'),
        snapArcade: (...args) => { snap = args; events.push('rig:snap'); },
      },
      stopShowroom: () => events.push('showroom:stop'),
      openBattle: () => events.push('battle:open'),
    },
    now: () => (clock += 5),
    recordTrace: (value) => { trace = value; },
  });
  return {
    runtime, game, events, get trace() { return trace; },
    get setupOptions() { return setupOptions; },
    get camoSweep() { return camoSweep; }, get snap() { return snap; },
  };
}

{
  const harness = createHarness();
  harness.runtime.start('m1a1_abrams_hc', 'random', {
    deferVisuals: true, preBattleHold: true, randomRoster: false,
  });
  assert.equal(harness.game.preBattleS, Infinity);
  assert.ok(harness.events.includes('world:watchdog:true'), 'held entry arms a joined covered watchdog');
  assert.equal(harness.game.mapId, 'winter');
  assert.equal(harness.game.phase, 'battle');
  assert.deepEqual(harness.setupOptions, {
    random: false, deferVisuals: true,
    deferCamoRepaint: true, deferOpeningRoutes: true,
  });
  assert.ok(harness.camoSweep instanceof Promise);
  assert.deepEqual(harness.snap, [2, 1.25, -10 * Math.PI / 180]);
  assert.ok(harness.events.indexOf('killcam:cancel') < harness.events.indexOf('round:setup'));
  assert.ok(harness.events.indexOf('world:reset') < harness.events.indexOf('round:setup'));
  assert.ok(harness.events.indexOf('round:setup') < harness.events.indexOf('camo:player:m1a1_abrams_hc'));
  assert.ok(harness.events.indexOf('fx:reset') < harness.events.indexOf('phase:battle'));
  assert.ok(!harness.events.includes('warm:drain'));
  assert.ok(!harness.events.includes('battle:open'));
  assert.equal(harness.trace.specId, 'm1a1_abrams_hc');
  assert.ok(harness.trace.totalMs > 0);
}

{
  const harness = createHarness();
  harness.runtime.start('m1a1_abrams_hc');
  assert.equal(harness.game.preBattleS, 0);
  assert.ok(harness.events.includes('world:watchdog:false'), 'legacy direct entry retains delayed scheduling');
  assert.ok(harness.events.indexOf('warm:drain') < harness.events.indexOf('battle:open'));
}

{
  const harness = createHarness({ playerCreated: false });
  assert.throws(() => harness.runtime.start('m1a1_abrams_hc'), /did not create a player/);
  assert.ok(!harness.events.includes('phase:battle'));
}

{
  // (2026-11-02 audit F1 review) a start over the Studio's scene (studio -> battle is no edge) is refused before the
  // count, the roster, the map, the Garage or the HUD move: the phase write used to throw only after all of them
  const harness = createHarness();
  harness.game.phase = 'studio';
  harness.game.preBattleS = 0;
  assert.throws(() => harness.runtime.start('m1a1_abrams_hc', 'winter', { preBattleHold: true }),
    (error) => error?.name === 'AppPhaseTransitionError' && error.from === 'studio' && error.to === 'battle');
  assert.deepEqual(harness.events, [], 'nothing moved');
  assert.equal(harness.game.phase, 'studio');
  assert.equal(harness.game.preBattleS, 0, 'the count was not armed');
}


for (const deferVisuals of [false, true]) {
  // Exercise actual activation plus the production in-place shader hook. The
  // panel starts its borrowed-material job synchronously, then later staging
  // repeats the idempotent hook while that job is awaiting native completion.
  const material = new THREE.MeshStandardMaterial();
  const burn = makeBurnUniforms(4242);
  const initialVersion = material.version;
  let hookCalls = 0;
  let submittedRevision = null;
  let finishMask;
  const maskDone = new Promise((resolve) => { finishMask = resolve; });
  const visual = {
    material,
    prewarmBurn() {
      hookCalls++;
      assert.equal(applyBurnHook(material, burn), true);
    },
  };
  const harness = createHarness({
    visual,
    onMaskStart(borrowed) {
      assert.ok(borrowed.material === material);
      assert.equal(hookCalls, 1, 'install the disarmed hook before requesting masks');
      assert.match(material.customProgramCacheKey(), /\|burn-r8$/);
      submittedRevision = { version: material.version, key: material.customProgramCacheKey() };
    },
  });
  try {
    harness.runtime.start('m1a1_abrams_hc', 'winter', { deferVisuals, preBattleHold: deferVisuals });
    await Promise.resolve(); // the mask compile is now waiting on native readiness
    visual.prewarmBurn(); // later battle-visual streamer/combat warm
    finishMask();
    await maskDone;
    assert.equal(hookCalls, 2);
    assert.equal(material.version, initialVersion + 1, 'later warm must not invalidate the compiled cohort');
    assert.deepEqual({ version: material.version, key: material.customProgramCacheKey() }, submittedRevision);
    assert.equal(burn.uBurnT.value, -1, 'preparation does not activate wreck shading');
    assert.equal(burn.uBurnGlow.value, 0);
    assert.strictEqual(material.userData.__burnU, burn, 'material identity and burn ownership are preserved');
  } finally {
    material.dispose();
  }
}

{
  const harness = createHarness({ visual: null });
  harness.runtime.start('m1a1_abrams_hc', 'winter', { deferVisuals: true, preBattleHold: true });
  assert.equal(harness.game.phase, 'battle', 'deferred missing visuals retain the existing mask fallback');
}

assert.throws(
  () => createSoloBattleStartRuntime({}),
  /requires every activation port/,
);

// (round 3 A7/M4) A battlefield the Studio planned crushes on and never gave back (its teardown threw before
// releaseCrushes): the solo start takes its falls and sweeps for the battle. The world stayed on the Studio's timeline, so
// every felled tree of the battle opened its collision and never fell, and its sweeps stayed off.
{
  const left = createStudioLeftWorld({ mapId: 'winter' });
  const harness = createHarness({ world: left.world });
  harness.runtime.start('m1a1_abrams_hc', 'winter', { deferVisuals: true, preBattleHold: true });
  assert.equal(harness.game.phase, 'battle');
  assert.equal(left.fallsWithUpdate(), true, 'a tree the battle fells falls with its frames (before: the Studio\'s timeline held it)');
  assert.equal(left.world.sweeps, true, 'the battle\'s crush sweeps run');
}

console.log('soloBattleStartRuntime.selftest: activation order, covered start, failure and a Studio-left world pass');

{
 const h = createHarness();h.runtime.start('m1a1_abrams_hc','winter',{gameMode:'ac130',deferVisuals:true});
 assert.equal(h.game.phase,'battle');
 for(const event of ['pedestal:lend:m1a1_abrams_hc','camo:player:m1a1_abrams_hc','damage:tank','damage:equipment'])
   assert.ok(!h.events.includes(event), `aircraft entry skips ${event}`);
 assert.ok(h.events.includes('camo:roster'),'ground escorts still prepare');
 assert.ok(h.events.includes('pedestal:park:m1a1_abrams_hc'),'garage hero stays out of the aircraft battlefield');
}
