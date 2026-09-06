import assert from 'node:assert/strict';
import { Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import { createGaragePhasePresentationRuntime } from '../game/garagePhasePresentationRuntime.ts';
import { SHOT_VIEWS } from './shotContract.ts';
import { setShotView } from './shotRuntime.ts';

const beforeRecipe = new Error('fixture reached the recipe boundary');

function createFixture() {
  const scene = new Scene(), stage = new Group(), dressing = new Group();
  scene.add(stage, dressing);
  const events = [];
  const game = { phase: 'garage', tanks: [], allTanks: [], shells: [] };
  let world = null, target = 'garage', stopBeforeRecipe = false;
  const noop = () => {};
  const sky = { sunColorHex: 0xffffff, sunIntensity: 4 };
  const phase = createGaragePhasePresentationRuntime({
    scene, stageRoot: stage, dressingRoot: dressing,
    garagePosition: new Vector3(-1500, 0, -1500), sunDirection: new Vector3(0, 1, 0),
    lighting: { setFarCascadeDormant: noop, setSun: noop },
    // The same capture-only regression also runs on the pristine measurement
    // parent, whose phase owner still uses the older single sky callback.
    getSkyConfig: () => sky,
    getGarageSkyConfig: () => sky, getBattleSkyConfig: () => world ? sky : null,
    getGroundHeight: () => 0, getPhase: () => game.phase,
    shouldReleaseGpuOnBattle: () => false,
    posePedestal: noop, poseCamera: noop, restorePresentationGpu: async () => ({}),
  });
  const player = { spec: { id: 'm1a2' }, equip: {},
    input: { throttle: 1, steer: 1, brake: true, fire: true },
    visual: { setGroundSampler: noop } };
  game.player = player;
  game.tanks = game.allTanks = [player];
  const assertOwned = () => {
    const isGarage = target === 'garage';
    assert.equal(stage.parent === scene, isGarage, `${target}: stage ownership`);
    assert.equal(dressing.parent === scene, isGarage, `${target}: archive owner`);
    assert.equal(world.group.parent === scene, !isGarage, `${target}: world ownership`);
    assert.equal(scene.children.filter(object => object.isSpotLight && object.visible).length,
      isGarage ? 2 : 0, `${target}: only Garage owns the two spotlight shader inputs`);
    assert.equal(phase.diagnostics().gpu.suspended, false,
      'desktop capture detaches owners without discarding their resident GPU resources');
  };
  const recordRecipe = () => { assertOwned(); events.push('recipe'); };
  const context = {
    ensureFullFleet: async () => {}, ensureFxRuntime: async () => {},
    ensureKillcamRuntime: async () => {}, preloadBattleWarm: async () => {},
    preloadArmorAimOverlay: async () => {},
    preloadSoloBattleRuntime: async () => {
      events.push('world-preload');
      assert.equal(dressing.parent === scene, target === 'garage',
        'the actual phase owner runs before asynchronous world acquisition');
    },
    preloadBattleClientRuntime: async () => {}, ensureBattleHud: async () => {},
    ensureTouchControls: async () => {},
    switchMap: async mapId => {
      events.push(`switch:${mapId}`);
      const previous = world?.group;
      world = { mapId, group: new Group(),
        minimapTextureState: { promise: Promise.resolve(), settled: true,
          results: [{ target: 'terrain', applied: true, failures: [] }] },
        heightField: { getHeightAt: () => 0 },
        config: { shot: { pos: [0, 15, -30], look: [0, 2, 0] } },
        setSniperFade: noop, setWindTime: noop };
      phase.swapWorld(previous ?? null, world.group);
    },
    setGarageSpots: value => { events.push(`garage:${value}`); phase.setActive(value); },
    setWorldDormant: value => {
      events.push(`dormant:${value}`);
      phase.setWorldActive(world.group, !value);
    },
    getWorld: () => world, getSelectedSpecId: () => 'm1a2',
    setCamoBiome: noop, applyCamoPatterns: noop, setupBattle: noop,
    resetCombatWarm: noop,
    drainCombatWarm: () => {
      assertOwned();
      events.push('before-recipe');
      if (stopBeforeRecipe) throw beforeRecipe;
    },
    buildShellCards: noop, setDamagePanelTank: noop, setDamagePanelEquipment: noop,
    groundSampler: noop, input: { setEnabled: noop }, settings: { isOpen: () => false },
    showroom: { stop: noop, reset: recordRecipe },
    setShotMode: value => events.push(`shot:${value}`), setCaptureHidden: noop,
    resetPostPerfTrims: noop, setShotHudFrame: noop,
    setGarageSunTrim: value => { assertOwned(); phase.setSunTrim(value); },
    hideGarage: noop, hideEndOverlay: noop, setLastFov: noop,
    getHud: () => ({ setMode: recordRecipe }),
    getFx: () => ({ resetAll: noop, resetSeed: noop, setFrozen: noop }),
    getKillcam: () => ({ cancel: noop }), getShellCards: () => [], game,
    rig: { mode: 'ARCADE', aimDist: 100, setExternalPose: recordRecipe },
    camera: new PerspectiveCamera(),
    lighting: { setFarCascadeDormant: noop, updateFrustums: noop, update: noop },
    scene, scratch1: new Vector3(), scratch2: new Vector3(), scratch3: new Vector3(),
    setPedestalTank: async () => recordRecipe(),
    garage: { show: recordRecipe, drainThumbs: noop },
    garageDressing: { ensureBuilt: async () => recordRecipe() },
  };
  return {
    context, events, phase, stage, dressing, scene,
    get world() { return world; },
    setTarget(name, stop = false) { target = name; stopBeforeRecipe = stop; events.length = 0; },
    assertOwned,
  };
}

// Execute the real production transaction for every declared shot class. The
// complex combat/killcam recipes need separate FX fixtures; stop those only at
// the injected drain port, AFTER actual acquisition and final phase ownership.
// Garage and all battlefield recipes execute completely below as well.
const fixture = createFixture();
for (const name of SHOT_VIEWS) {
  fixture.setTarget(name, true);
  await assert.rejects(setShotView(name, fixture.context), error => error === beforeRecipe);
  assert.ok(fixture.events.indexOf(`garage:${name === 'garage'}`)
    < fixture.events.indexOf('world-preload'));
  assert.equal(fixture.events.at(-2), `dormant:${name === 'garage'}`);
  fixture.assertOwned();
}

// Cold Garage, Garage→battle, cached same-map battle, map-switch battle, then
// battle→Garage: the recipe and every later paint see one presentation owner.
const complete = createFixture();
for (const name of ['garage', 'battlefield', 'battlefield',
  ...SHOT_VIEWS.filter(name => name.startsWith('battlefield_')), 'garage']) {
  complete.setTarget(name);
  await setShotView(name, complete.context);
  complete.assertOwned();
  assert.ok(complete.events.includes('recipe'), `${name}: actual recipe executed`);
  assert.ok(complete.events.indexOf(`dormant:${name === 'garage'}`)
    < complete.events.indexOf('recipe'), 'final scene ownership precedes recipe work');
  assert.equal(complete.context.game.phase, 'shot');
}
assert.equal(complete.phase.diagnostics().scene.garageMounted, true);
assert.equal(complete.phase.diagnostics().scene.worldMounted, false);
assert.equal(complete.world.group.visible, false);
assert.equal(complete.dressing.visible, true);

console.log(`shotRuntime: actual phase owners before acquisition/recipes for ${SHOT_VIEWS.length} shot classes; cold, cached and bidirectional complete recipes passed`);
