import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3,
  WebGLRenderTarget } from 'three';
import { createArmorAimOverlay } from './armorAimOverlay.ts';
import { stageCombatFxProgramSubmission } from './battleWarmRuntime.ts';
import { createCombatWarmCoordinator } from './combatWarmCoordinator.ts';
import { createSoloBattleDeploymentRuntime } from './soloBattleDeploymentRuntime.ts';

// The deployment, FX staging/restoration, armor-visibility owner, readiness
// coordinator, and isolated cohort generator are production implementations.
// Only renderer I/O, effect emission into three real meshes, and unrelated
// world/entry ports are controlled. This is an ownership/error regression,
// not a native shader-readiness, texture, visual-quality, or timing benchmark.
function createFixture(failure) {
  const events = [];
  let generation = 0, nowMs = 0, compileAttempts = 0, fxDrawAttempts = 0;
  let openingRetries = 0, destructionWarmed = false, fxRestores = 0, armorRestores = 0;
  const scene = new Scene(), camera = new PerspectiveCamera();
  const initialCameraMask = camera.layers.mask;
  const sourceTarget = new WebGLRenderTarget(4, 4);
  const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
  const worldRoot = new Group(), playerRoot = new Group(), fxRoot = new Group(), retainedRoot = new Group();
  worldRoot.name = 'world'; playerRoot.name = 'player'; fxRoot.name = 'staged-fx';
  retainedRoot.name = 'inactive-retained-scene'; retainedRoot.visible = false;
  fxRoot.visible = false;
  const meshes = ['opening', 'shot-destruction', 'ammo-destruction'].map(name => {
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.visible = false;
    fxRoot.add(mesh);
    return mesh;
  });
  scene.add(worldRoot, playerRoot, fxRoot, retainedRoot);
  const originalSceneRoots = [...scene.children];
  const cell = { vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [{
    indices: [0, 1, 2], normal: [0, 0, 1], center: [1 / 3, 1 / 3, 0], internal: false,
  }] };
  const player = {
    id: 'player', specId: 'fixture', team: 'player', isPlayer: true,
    visual: { root: playerRoot }, state: { pos: new Vector3(), yaw: 0 },
    combat: { destroyed: false, shellSlot: 0 },
    spec: { armor: { collisionShells: { hull: [cell], turret: [] } },
      gun: { shells: [{ caliberMm: 120 }] } },
  };
  const game = { phase: 'battle', preBattleS: 4, player, tanks: [player] };
  const armor = createArmorAimOverlay();
  const armorEntry = armor.prime(player);
  assert.equal(armorEntry.frames.length, 1, 'positive control: actual overlay owns a borrowed mesh');
  const armorMesh = armorEntry.frames[0].mesh;
  const fx = {
    group: fxRoot,
    warmOpeningEffects() { meshes[0].visible = true; },
    impact() {}, dust() {}, exhaust() {}, propBreak() {}, propCrush() {}, update() {},
    destruction(_position, _visual, kind) { meshes[kind === 'shot' ? 1 : 2].visible = true; },
    resetAll() {
      for (const mesh of meshes) mesh.visible = false;
      if (failure === 'restore-fx') throw new Error('injected restore-fx renderer failure');
    },
  };
  const coordinator = createCombatWarmCoordinator({
    createOpening: function* () {
      openingRetries++;
      yield;
      coordinator.markOpeningReady();
    },
    createRare: function* () {},
    createYielder: () => async () => {},
  });
  const warmRender = () => {
    if (!fxRoot.visible) return; // Later world/player warm uses this same renderer port.
    fxDrawAttempts++;
    const selected = meshes.filter(mesh => mesh.visible && mesh.layers.test(camera.layers));
    assert.equal(selected.length, 1, 'actual isolated generator draws one real FX mesh per cohort');
    assert.equal(worldRoot.visible, false, 'private FX bind excludes unrelated world content');
    assert.equal(playerRoot.visible, false, 'private FX bind excludes the player/armor content');
    assert.equal(retainedRoot.visible, false);
    events.push(`fx-draw:${selected[0].name}`);
    if ((failure === 'first-draw' && fxDrawAttempts === 1)
      || (failure === 'later-draw' && fxDrawAttempts === 2)) {
      throw new Error(`injected ${failure} renderer failure`);
    }
  };
  const runtime = createSoloBattleDeploymentRuntime({
    game, scene, camera,
    battleLoad: { progress() {} },
    battleWarm: {
      warmBattleTerrainTiles: async () => {},
      primeOpeningTerrainPresentation: async ({ assertCurrent }) => assertCurrent(),
      async stageCombatFxProgramSubmission(options) {
        const submission = stageCombatFxProgramSubmission(options);
        assert.equal(submission.staged, true, 'real staging succeeds independently of renderer outcome');
        assert.equal(fxRoot.visible, true);
        assert.ok(meshes.every(mesh => mesh.visible));
        return { staged: submission.staged, restore() {
          fxRestores++;
          submission.restore();
          events.push('restore-fx');
        } };
      },
    },
    armorAimOverlay: { warm() {
      const restore = armor.warm();
      assert.equal(armorMesh.visible, true);
      return () => { armorRestores++; restore(); events.push('restore-armor'); };
    } },
    forwardProgramWarm: {
      compileSceneSteps: function* () {
        compileAttempts++;
        assert.equal(fxRoot.visible, true, 'compile sees the staged FX graph');
        assert.equal(armorMesh.visible, true, 'compile sees the borrowed armor geometry');
        try {
          yield;
          if (failure === 'compile') throw new Error('injected compile renderer failure');
          events.push('compile-complete');
        } finally { events.push('compile-closed'); }
      },
      prepareSceneSteps: function* () {
        throw new Error('fixture has no terrain/vegetation program-preparation root');
      },
    },
    combatWarm: { markOpeningReady() {
      events.push('opening-ready');
      coordinator.markOpeningReady();
    } },
    post: { sceneAA: { sceneTarget: sourceTarget }, prepareSoftParticles() {},
      warmFirstFrame: async () => ({ passes: 1 }) },
    lighting: { csm: { lights: [] } },
    createShell: () => ({ pos: new Vector3(), prevPos: new Vector3() }),
    getWorld: () => ({ group: worldRoot }),
    getBattleVisuals: () => ({ stream: async () => {} }),
    getFx: () => fx,
    getWarmRender: () => warmRender,
    getDeploymentShadowWarm: () => ({ prime: async () => ({}) }),
    getEntryLifecycle: () => ({ primeReveal: async () => { events.push('reveal'); }, coverRendering() {} }),
    prepareRevealCamera() {},
    runSceneWatchdog: async assertCurrent => { assertCurrent(); return { before: 10, after: null,
      rescued: false, stage: null }; },
    getGeneration: () => generation,
    advanceGeneration: () => ++generation,
    setPending() {},
    setDestructionWarmed(value) { destructionWarmed = value; events.push(`destruction-ready:${value}`); },
    now: () => ++nowMs,
    yieldFrame: async () => {},
    yieldProgramFrame: async () => {},
    createLoadingYielder: () => async () => {},
  });
  return {
    events, runtime, coordinator,
    get compileAttempts() { return compileAttempts; },
    get fxDrawAttempts() { return fxDrawAttempts; },
    get openingRetries() { return openingRetries; },
    get destructionWarmed() { return destructionWarmed; },
    assertCleanup() {
      assert.equal(fxRestores, 1, 'staged effects restore exactly once');
      assert.equal(armorRestores, 1, 'borrowed armor visibility restores exactly once');
      assert.equal(armorMesh.visible, false, 'the actual armor owner restored its mesh');
      assert.equal(fxRoot.visible, false, 'the real staging owner restored root visibility');
      assert.ok(meshes.every(mesh => !mesh.visible), 'real staging restore resets every emitted fixture effect');
      assert.deepEqual(meshes.map(mesh => mesh.layers.mask), [1, 1, 1], 'cohort masks do not leak');
      assert.equal(camera.layers.mask, initialCameraMask, 'late-FX camera mask does not leak');
      assert.equal(worldRoot.visible, true); assert.equal(playerRoot.visible, true);
      assert.equal(retainedRoot.visible, false);
      assert.deepEqual(scene.children, originalSceneRoots, 'all scene ownership survives renderer errors');
    },
    dispose() {
      coordinator.reset();
      armor.dispose();
      geometry.dispose(); material.dispose(); sourceTarget.dispose();
    },
  };
}

for (const failure of ['none', 'compile', 'first-draw', 'later-draw', 'restore-fx']) {
  await test(`solo FX readiness: ${failure}`, async () => {
    const receiptNames = ['__BATTLE_COUNTDOWN_WARM', '__COMBAT_OPENING_WARM'];
    const saved = receiptNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
    for (const name of receiptNames) delete globalThis[name];
    const priorCoveredReceipt = { covered: true, batches: 99, totalMs: 999 };
    globalThis.__COMBAT_OPENING_WARM = priorCoveredReceipt;
    const fixture = createFixture(failure);
    try {
      const result = await fixture.runtime.warm(Promise.resolve())
        .then(value => ({ value }), error => ({ error }));
      assert.equal(fixture.compileAttempts, 1, 'positive control: the tested compilation actually ran');
      assert.equal(fixture.fxDrawAttempts, { none: 3, compile: 0, 'first-draw': 1, 'later-draw': 2, 'restore-fx': 3 }[failure],
        'positive control: the requested first/partial FX renderer failure actually ran');
      fixture.assertCleanup();
      if (result.error) assert.match(String(result.error), new RegExp(`injected ${failure} renderer failure`),
        'an unrelated setup failure cannot masquerade as the intended renderer failure');
      if (failure === 'restore-fx') {
        assert.match(String(result.error), /injected restore-fx renderer failure/,
          'uncertain emitter cleanup must reach covered entry recovery, not optional warm fallback');
        assert.equal(fixture.events.includes('reveal'), false);
      }
      const readiness = {
        opening: fixture.coordinator.isOpeningReady(), destruction: fixture.destructionWarmed,
        coveredReceipt: globalThis.__COMBAT_OPENING_WARM?.covered === true,
      };
      assert.notStrictEqual(globalThis.__COMBAT_OPENING_WARM, priorCoveredReceipt,
        'a new generation must not retain the previous entry covered-success receipt');
      const fxReceipt = globalThis.__BATTLE_COUNTDOWN_WARM.deploymentFxForwardWarm;
      assert.equal(fxReceipt.completed, failure === 'none', 'only full cohort and cleanup completion is certified');
      if (failure !== 'none') {
        const error = failure === 'restore-fx' ? fxReceipt.cleanupError : fxReceipt.error;
        assert.match(error, new RegExp(`injected ${failure} renderer failure`), 'the bounded FX failure remains visible');
        assert.ok(error.length <= 320);
      }
      await fixture.coordinator.warmOpeningChunked(8, async () => {});
      if (failure === 'none') {
        assert.equal(result.error, undefined);
        assert.equal(result.value.revealPrimed, true);
        assert.deepEqual(readiness, { opening: true, destruction: true, coveredReceipt: true });
        assert.equal(fixture.openingRetries, 0, 'successful covered warming avoids a redundant opening job');
        assert.ok(fixture.events.indexOf('opening-ready') > fixture.events.indexOf('restore-armor'),
          'success is published only after renderer work and all restoration');
      } else {
        assert.deepEqual({ ...readiness, openingRetries: fixture.openingRetries },
          { opening: false, destruction: false, coveredReceipt: false, openingRetries: 1 },
          'staging or partial draws are not readiness: failed work stays eligible for the real coordinator retry');
      }
    } finally {
      fixture.dispose();
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    }
  });
}
