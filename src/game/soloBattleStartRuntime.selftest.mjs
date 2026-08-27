import assert from 'node:assert/strict';
import { createSoloBattleStartRuntime } from './soloBattleStartRuntime.ts';

function createHarness({ playerCreated = true } = {}) {
  const events = [];
  let clock = 0;
  let trace = null;
  let setupOptions = null;
  let camoSweep = null;
  let snap = null;
  const world = {
    mapId: 'winter',
    resetDestructibles: () => events.push('world:reset'),
  };
  const player = {
    id: 'player-1', specId: 'm1a2', spec: { id: 'm1a2' },
    state: { yaw: 1.25 }, visual: { id: 'visual' }, equip: ['rammer'],
  };
  const game = { preBattleS: 0, mapId: '', phase: 'garage', player: null, tanks: [] };
  const runtime = createSoloBattleStartRuntime({
    state: {
      game,
      getPendingMapId: () => 'verdant',
      setSelectedSpecId: (id) => events.push(`selected:${id}`),
      rememberSpecId: (id) => events.push(`remember:${id}`),
      setShotMode: (value) => events.push(`shot:${value}`),
      setCaptureHidden: (value) => events.push(`capture:${value}`),
      setSimulationAccumulator: (value) => events.push(`sim:${value}`),
      setBattleStaged: (value) => events.push(`staged:${value}`),
      setCamoSweep: (work) => { camoSweep = work; events.push('camo:sweep'); },
    },
    world: {
      resolveMapId: (id) => id === 'random' ? 'winter' : id,
      switchMap: (id) => events.push(`world:switch:${id}`),
      getActive: () => world,
      setDormant: (value) => events.push(`world:dormant:${value}`),
      scheduleBlackWatchdog: () => events.push('world:watchdog'),
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
      lendPlayerVisual: (id) => events.push(`pedestal:lend:${id}`),
      setupBattle: (_game, id, activeWorld, options) => {
        assert.equal(id, 'm1a2');
        assert.strictEqual(activeWorld, world);
        setupOptions = options;
        game.tanks = [{ specId: 'm1a2' }, { specId: 't90m' }];
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
          priorityIds: ['m1a2'], onlySpecIds: ['m1a2', 't90m'],
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
        setTank: () => events.push('damage:tank'),
        setEquipment: () => events.push('damage:equipment'),
      },
      hideGarage: () => events.push('garage:hide'),
      hideEndOverlay: () => events.push('result:hide'),
      resetBattleResult: () => events.push('result:reset'),
      setGarageLighting: (value) => events.push(`garage:lighting:${value}`),
      emitPhaseChange: (phase) => events.push(`phase:${phase}`),
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
  harness.runtime.start('m1a2', 'random', {
    deferVisuals: true, preBattleHold: true, randomRoster: false,
  });
  assert.equal(harness.game.preBattleS, Infinity);
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
  assert.ok(harness.events.indexOf('round:setup') < harness.events.indexOf('camo:player:m1a2'));
  assert.ok(harness.events.indexOf('fx:reset') < harness.events.indexOf('phase:battle'));
  assert.ok(!harness.events.includes('warm:drain'));
  assert.ok(!harness.events.includes('battle:open'));
  assert.equal(harness.trace.specId, 'm1a2');
  assert.ok(harness.trace.totalMs > 0);
}

{
  const harness = createHarness();
  harness.runtime.start('m1a2');
  assert.equal(harness.game.preBattleS, 0);
  assert.ok(harness.events.indexOf('warm:drain') < harness.events.indexOf('battle:open'));
}

{
  const harness = createHarness({ playerCreated: false });
  assert.throws(() => harness.runtime.start('m1a2'), /did not create a player/);
  assert.ok(!harness.events.includes('phase:battle'));
}

assert.throws(
  () => createSoloBattleStartRuntime({}),
  /requires every activation port/,
);

console.log('soloBattleStartRuntime.selftest: activation order, covered start, and failure pass');
