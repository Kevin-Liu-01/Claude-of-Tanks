import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3 } from 'three';
import { createGaragePhasePresentationRuntime } from '../game/garagePhasePresentationRuntime.ts';
import { SHOT_VIEWS } from './shotContract.ts';
import { setShotView } from './shotRuntime.ts';

const beforeRecipe = new Error('fixture reached the recipe boundary');
const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const restorePort = mainSource.match(/restoreGarageGpuIfSuspended:\s*(async \(\) => \{[\s\S]*?\n {6}\}),/);
assert.ok(restorePort, 'the capture context exposes the suspended-only Garage restore port');
// Execute the real composition-root adapter, not a test duplicate of its gate.
const restoreFor = new Function('garagePhasePresentation', `return (${restorePort[1]});`);

function createFixture(releaseTextures = false) {
  const scene = new Scene(), stage = new Group(), dressing = new Group();
  const geometry = new BoxGeometry(), stageMesh = new Mesh(geometry, new MeshBasicMaterial());
  stage.add(stageMesh);
  scene.add(stage, dressing);
  const events = [];
  let disposeCount = 0, restoreCount = 0, restoreHook = async () => {};
  geometry.addEventListener('dispose', () => { disposeCount++; });
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
    shouldReleaseGpuOnBattle: () => releaseTextures,
    posePedestal: noop, poseCamera: noop,
    restorePresentationGpu: async ({ resourcesReleased }) => {
      restoreCount++;
      assertOwned();
      assert.equal(resourcesReleased, true);
      assert.equal(phase.diagnostics().gpu.suspended, true,
        'suspension must remain latched throughout the actual asynchronous upload');
      assert.deepEqual(events.slice(-5), ['projection', 'matrix', 'frustums', 'lighting', 'fov-final'],
        'restoration sees the completed recipe, camera, projection and lighting');
      assert.deepEqual(camera.position.toArray(), [-1500, 8, -1520]);
      assert.equal(camera.fov, 48, 'restore renders the intended Garage recipe FOV');
      await restoreHook();
      return { resourcesReleased };
    },
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
    if (!isGarage) assert.equal(phase.diagnostics().gpu.suspended, true,
      'battle captures detach Garage owners and release their renewable buffers');
  };
  const recordRecipe = () => { assertOwned(); events.push('recipe'); };
  const camera = new PerspectiveCamera();
  const projection = camera.updateProjectionMatrix, matrix = camera.updateMatrixWorld;
  camera.updateProjectionMatrix = function () { events.push('projection'); return projection.call(this); };
  camera.updateMatrixWorld = function (force) { events.push('matrix'); return matrix.call(this, force); };
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
    showroom: { stop: noop, reset() {
      recordRecipe();
      camera.position.set(-1500, 8, -1520);
      camera.lookAt(-1500, 2, -1500);
      camera.fov = 48;
    } },
    setShotMode: value => events.push(`shot:${value}`), setCaptureHidden: noop,
    resetPostPerfTrims: noop, setShotHudFrame: noop,
    setGarageSunTrim: value => { assertOwned(); phase.setSunTrim(value); },
    restoreGarageGpuIfSuspended: restoreFor(phase),
    hideGarage: noop, hideEndOverlay: noop, setLastFov: () => events.push('fov-final'),
    getHud: () => ({ setMode: recordRecipe }),
    getFx: () => ({ resetAll: noop, resetSeed: noop, setFrozen: noop }),
    getKillcam: () => ({ cancel: noop }), getShellCards: () => [], game,
    rig: { mode: 'ARCADE', aimDist: 100, setExternalPose: recordRecipe },
    camera,
    lighting: { setFarCascadeDormant: noop,
      updateFrustums: () => events.push('frustums'), update: () => events.push('lighting') },
    scene, scratch1: new Vector3(), scratch2: new Vector3(), scratch3: new Vector3(),
    setPedestalTank: async () => recordRecipe(),
    garage: { show: recordRecipe, drainThumbs: noop },
    garageDressing: { ensureBuilt: async () => recordRecipe() },
  };
  return {
    context, events, phase, stage, dressing, scene, geometry, stageMesh,
    get disposeCount() { return disposeCount; },
    get restoreCount() { return restoreCount; },
    get world() { return world; },
    setRestoreHook(hook) { restoreHook = hook; },
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
assert.equal(complete.restoreCount, 1, 'desktop return renews the released Garage buffers once');
assert.equal(complete.disposeCount, 1, 'cached battle captures do not repeatedly release Garage buffers');
assert.equal(complete.phase.diagnostics().gpu.suspended, false);

// Use the real phase GPU owner and real geometry disposal events. Captures on
// both device policies must renew the suspended phase before reporting ready,
// otherwise a later battle entry mistakes reuploaded resources for suspended.
for (const releaseTextures of [false, true]) {
  const constrained = createFixture(releaseTextures);
  const positions = constrained.geometry.attributes.position.array;
  const positionBytes = positions.slice();
  async function capture(name) {
    constrained.setTarget(name);
    await setShotView(name, constrained.context);
    constrained.assertOwned();
  }
  await capture('garage');
  assert.equal(constrained.restoreCount, 0, 'cold resident Garage needs no restore');
  await capture('battlefield');
  assert.equal(constrained.disposeCount, 1);
  assert.equal(constrained.phase.diagnostics().gpu.suspended, true);
  let beganRestore, finishRestore;
  const restoreStarted = new Promise(resolve => { beganRestore = resolve; });
  const restorePending = new Promise(resolve => { finishRestore = resolve; });
  constrained.setRestoreHook(async () => { beganRestore(); await restorePending; });
  let captureComplete = false;
  const returning = capture('garage').then(() => { captureComplete = true; });
  await restoreStarted;
  assert.equal(captureComplete, false, 'shot readiness awaits actual GPU restoration');
  assert.equal(constrained.phase.diagnostics().gpu.suspended, true);
  assert.equal(constrained.phase.restoringGpu, true);
  finishRestore();
  await returning;
  assert.equal(constrained.phase.diagnostics().gpu.suspended, false);
  assert.equal(constrained.phase.diagnostics().gpu.resumes, 1);
  await capture('battlefield');
  assert.equal(constrained.disposeCount, 2, 'Garage → battle → Garage → battle reclaims twice');
  assert.equal(constrained.phase.diagnostics().gpu.releases, 2);
  assert.equal(constrained.phase.diagnostics().gpu.suspended, true);
  const restoreFailure = new Error('fixture GPU upload failed');
  constrained.setRestoreHook(async () => { throw restoreFailure; });
  await assert.rejects(capture('garage'), error => error === restoreFailure);
  assert.equal(constrained.phase.diagnostics().gpu.suspended, true, 'failed restoration cannot clear suspension');
  assert.equal(constrained.phase.diagnostics().gpu.resumeFailures, 1);
  assert.equal(constrained.phase.diagnostics().gpu.resumes, 1);
  assert.equal(constrained.phase.restoringGpu, false, 'failed upload releases the in-flight presentation cover');
  constrained.setRestoreHook(async () => {});
  await capture('garage');
  assert.equal(constrained.phase.diagnostics().gpu.suspended, false, 'a later capture retries the failed return');
  assert.equal(constrained.phase.diagnostics().gpu.resumes, 2);
  assert.equal(constrained.restoreCount, 3, 'two successful returns plus one failed attempt');
  await capture('garage');
  assert.equal(constrained.restoreCount, 3, 'same resident Garage does not add another warm frame');
  assert.equal(constrained.stageMesh.geometry, constrained.geometry);
  assert.equal(constrained.geometry.attributes.position.array, positions);
  assert.deepEqual(positions, positionBytes, 'GPU release/restore preserves authored CPU geometry bytes');

}
console.log(`shotRuntime: ${SHOT_VIEWS.length} phase owners; desktop and constrained disposal/awaited restore/failure/retry passed`);
