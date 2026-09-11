import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Group, HalfFloatType, LinearSRGBColorSpace, Mesh,
  MeshBasicMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderTarget } from 'three';
import { createOffscreenSceneWarmer } from '../engine/offscreenWarm.ts';
import { createForwardProgramWarmOwner } from '../engine/programWarm.ts';
import { nextPaintFrame } from '../engine/frameScheduler.ts';
import { createArmorAimOverlay } from './armorAimOverlay.ts';
import { stageCombatFxProgramSubmission } from './battleWarmRuntime.ts';
import { createCombatWarmCoordinator } from './combatWarmCoordinator.ts';
import { createSoloBattleDeploymentRuntime } from './soloBattleDeploymentRuntime.ts';

// Actual deployment, staging, strict private-target preparation, isolated draw,
// armor, coordinator and frame-plus-task owners. Only native I/O, effect emission
// and unrelated entry services are controlled. This is not a native benchmark.
function createHost() {
  let time = 0, nextId = 0;
  const frames = new Map(), tasks = [], events = new EventTarget();
  const globals = {
    performance: { now: () => time },
    document: { hidden: false, addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events) },
    requestAnimationFrame(callback) { frames.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: id => frames.delete(id),
    scheduler: { yield: () => new Promise(resolve => tasks.push(resolve)) },
  };
  const saved = Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  return {
    now: () => time,
    advance: ms => { time += ms; },
    async settle(pending, assertBetweenFrames) {
      let settled = false, outcome;
      pending.then(value => { outcome = { value }; settled = true; },
        error => { outcome = { error }; settled = true; });
      for (let turn = 0; !settled && turn < 3000; turn++) {
        await Promise.resolve();
        if (frames.size) {
          assertBetweenFrames();
          const [id, callback] = frames.entries().next().value;
          frames.delete(id);
          time += 16;
          callback(time);
          for (let index = 0; index < 8; index++) await Promise.resolve();
          assertBetweenFrames(); // rAF alone cannot admit a strict step or draw.
        }
        if (tasks.length) { time += 1; tasks.shift()(); }
      }
      assert.equal(settled, true, 'the controlled host must reach a terminal result');
      assert.equal(frames.size, 0); assert.equal(tasks.length, 0);
      return outcome;
    },
    restore() {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

function createFixture(mode, host) {
  const events = [], scene = new Scene(), camera = new PerspectiveCamera();
  const initialMask = camera.layers.mask, stagedMask = initialMask | (1 << 30);
  const sourceTarget = new WebGLRenderTarget(8, 8), callerTarget = new WebGLRenderTarget(2, 2);
  const worldRoot = new Group(), playerRoot = new Group(), fxRoot = new Group(), retained = new Group();
  worldRoot.name = 'world'; playerRoot.name = 'player'; fxRoot.name = 'fixture-fx';
  fxRoot.visible = false; retained.visible = false;
  scene.add(worldRoot, playerRoot, fxRoot, retained);
  const geometry = new BoxGeometry();
  const materials = [0, 1, 2].map(() => new MeshBasicMaterial());
  const meshes = materials.map((material, index) => {
    const mesh = new Mesh(geometry, material);
    mesh.name = ['opening', 'shot', 'ammo'][index]; mesh.visible = false;
    if (index === 2) mesh.layers.set(30);
    fxRoot.add(mesh);
    return mesh;
  });
  const initialMeshMasks = meshes.map(mesh => mesh.layers.mask);
  const cell = { vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [{ indices: [0, 1, 2],
    normal: [0, 0, 1], center: [1 / 3, 1 / 3, 0], internal: false }] };
  const player = { id: 'player', specId: 'fixture', team: 'player', isPlayer: true,
    visual: { root: playerRoot }, state: { pos: new Vector3(), yaw: 0 },
    combat: { destroyed: false, shellSlot: 0 },
    spec: { armor: { collisionShells: { hull: [cell], turret: [] } },
      gun: { shells: [{ caliberMm: 120 }] } } };
  const game = { phase: 'battle', preBattleS: 4, player, tanks: [player] };
  const armor = createArmorAimOverlay(), armorEntry = armor.prime(player);
  assert.equal(armorEntry.frames.length, 1);
  const armorMesh = armorEntry.frames[0].mesh;
  let generation = 0, draws = 0, programFrames = 0, programCompiles = 0;
  let fxRestores = 0, armorRestores = 0, programCloses = 0, openingRetries = 0;
  let destructionReady = false, invalidated = false, contextLost = false;
  let activeTarget = callerTarget, face = 3, mip = 2, privateTarget = null, inDraw = false;
  const properties = new Map(), programs = [];
  const gl = {
    isContextLost: () => contextLost,
    getExtension: () => ({ COMPLETION_STATUS_KHR: 123 }),
    getProgramParameter() { host.advance(1); return programFrames >= 2; },
  };
  let activeContext = gl;
  const programFor = (material, target) => {
    let cache = properties.get(material);
    if (!cache) {
      cache = { programs: new Map() };
      Object.defineProperty(cache, 'currentProgram', { get() {
        assert.fail('strict preparation must not depend on mutable currentProgram');
      } });
      properties.set(material, cache);
    }
    if (!cache.programs.has(target)) {
      let reflectionFailed = false;
      const program = { program: {},
        getUniforms() {
          host.advance(2);
          if (!inDraw) {
            assert.ok(materials.includes(material), 'no armor or renderer-wide reflection sweep');
            events.push(`uniform:${meshes[materials.indexOf(material)].name}`);
            if (mode === 'reflection-error' && !reflectionFailed) {
              reflectionFailed = true;
              throw new Error('controlled reflection failed');
            }
          }
          return {};
        },
        getAttributes() { host.advance(1); return {}; },
      };
      cache.programs.set(target, program); programs.push(program);
    }
    return cache.programs.get(target);
  };
  programs.push({ program: {}, getUniforms() { assert.fail('unrelated native program was reflected'); } });
  const renderer = {
    info: { programs }, getContext: () => activeContext,
    getDrawingBufferSize: size => size.set(800, 600),
    getRenderTarget: () => activeTarget, getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
    setRenderTarget(target, nextFace = 0, nextMip = 0) { activeTarget = target; face = nextFace; mip = nextMip; },
    properties: { get: material => properties.get(material) },
    compileAsync() { assert.fail('the strict integration must not call raw compileAsync'); },
    compile(root, selectedCamera, targetScene) {
      assert.equal(selectedCamera, camera); assert.equal(targetScene, scene);
      const selected = [];
      root.traverse(object => { if (object.material) selected.push(object); });
      if (activeTarget !== sourceTarget) {
        programCompiles++;
        privateTarget ??= activeTarget;
        assert.equal(activeTarget, privateTarget);
        assert.equal(privateTarget.texture.name, 'CombatWarm.color');
        assert.equal(privateTarget.texture.type, HalfFloatType);
        assert.equal(privateTarget.texture.colorSpace, LinearSRGBColorSpace);
        assert.deepEqual([privateTarget.width, privateTarget.height], [100, 75]);
        assert.deepEqual(selected, meshes, 'strict compilation selects the actual staged visible FX only');
        assert.equal(fxRoot.visible, true, 'prepare before isolated-draw hiding');
        assert.equal(camera.layers.mask, stagedMask);
        events.push('private-compile');
        if (mode === 'compile-error') { host.advance(7); throw new Error('controlled private compile failed'); }
      }
      host.advance(2);
      const selectedMaterials = new Set();
      for (const object of selected) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          selectedMaterials.add(material); programFor(material, activeTarget);
        }
      }
      return selectedMaterials;
    },
    render(renderScene, renderCamera) {
      assert.equal(renderScene, scene); assert.equal(renderCamera, camera);
      if (!fxRoot.visible) return; // Separate production world/player warm cohorts.
      draws++;
      assert.equal(activeTarget, privateTarget, 'draw uses the very same prepared private target');
      assert.equal(worldRoot.visible, false); assert.equal(playerRoot.visible, false);
      assert.equal(retained.visible, false);
      const selected = meshes.filter(mesh => mesh.visible && mesh.layers.test(camera.layers));
      assert.equal(selected.length, 1, 'real isolated cohorts draw exactly one FX object');
      assert.ok(globalThis.__BATTLE_COUNTDOWN_WARM.deploymentFxPrograms,
        'the program receipt exists before the first isolated draw');
      assert.equal(coordinator.isOpeningReady(), false, 'program success alone is not draw readiness');
      events.push(`draw:${selected[0].name}`);
      host.advance(5);
      if ((mode === 'first-draw' && draws === 1) || (mode === 'later-draw' && draws === 2)) {
        throw new Error(`controlled ${mode} failed`);
      }
      inDraw = true;
      try {
        const program = programFor(selected[0].material, activeTarget);
        program.getUniforms(); program.getAttributes();
      } finally { inDraw = false; }
    },
  };
  const fx = { group: fxRoot,
    warmOpeningEffects() { meshes[0].visible = true; },
    impact() {}, dust() {}, exhaust() {}, propBreak() {}, propCrush() {}, update() {},
    destruction(_position, _visual, kind) { meshes[kind === 'shot' ? 1 : 2].visible = true; },
    resetAll() {
      fxRestores++;
      for (const mesh of meshes) mesh.visible = false;
      events.push('restore-fx');
      if (mode.startsWith('handoff-')) queueMicrotask(invalidate);
      if (mode === 'cleanup-error') throw new Error('controlled FX cleanup failed');
    },
  };
  let currentFx = fx;
  const warmer = createOffscreenSceneWarmer(renderer, scene, camera, 0.125);
  const alternateWarmer = createOffscreenSceneWarmer(renderer, scene, camera, 0.125);
  let currentWarmer = warmer;
  const originalPrepare = warmer.prepareProgramsSteps;
  warmer.prepareProgramsSteps = (objects, timing) => {
    const steps = originalPrepare(objects, timing), originalReturn = steps.return.bind(steps);
    steps.return = value => { programCloses++; return originalReturn(value); };
    return steps; // Observe closure of the real generator; never replace its steps.
  };
  const coordinator = createCombatWarmCoordinator({
    createOpening: function* () { openingRetries++; yield; coordinator.markOpeningReady(); },
    createRare: function* () {}, createYielder: () => async () => {},
  });
  const alternateRoot = new Group(), alternateParent = new Group();
  const invalidate = () => {
    if ((!mode.startsWith('stale-') && !mode.startsWith('handoff-')) || invalidated) return;
    invalidated = true;
    if (mode === 'stale-generation') generation++;
    if (mode === 'stale-phase' || mode === 'handoff-phase') game.phase = 'garage';
    if (mode === 'stale-pool') currentFx = { ...fx, group: alternateRoot };
    if (mode === 'stale-detach') fxRoot.removeFromParent();
    if (mode === 'stale-reparent') { scene.add(alternateParent); alternateParent.add(fxRoot); }
    if (mode === 'stale-warmer') currentWarmer = alternateWarmer;
    if (mode === 'stale-info') renderer.info = { programs: [...programs] };
    if (mode === 'stale-context' || mode === 'handoff-context') activeContext = { ...gl };
    if (mode === 'stale-context-lost') contextLost = true;
    events.push(mode);
  };
  const assertProgramCheckpoint = () => {
    assert.equal(activeTarget, callerTarget); assert.equal(face, 3); assert.equal(mip, 2);
    assert.equal(camera.layers.mask, stagedMask, 'only the existing staging camera lease spans a wait');
    assert.equal(fxRoot.visible, true); assert.ok(meshes.every(mesh => mesh.visible));
    assert.deepEqual(meshes.map(mesh => mesh.layers.mask), initialMeshMasks);
    assert.deepEqual(meshes.map(mesh => mesh.material), materials);
    assert.ok(meshes.every(mesh => mesh.parent === fxRoot));
    assert.equal(worldRoot.visible, true); assert.equal(playerRoot.visible, true);
    assert.equal(retained.visible, false); assert.equal(armorMesh.visible, true);
    assert.equal(draws, 0, 'neither pending native links nor the rAF-only checkpoint may draw FX');
    assert.equal(coordinator.isOpeningReady(), false); assert.equal(destructionReady, false);
  };
  const runtime = createSoloBattleDeploymentRuntime({ game, scene, camera, renderer,
    battleLoad: { progress() {} },
    battleWarm: { warmBattleTerrainTiles: async () => {},
      primeOpeningTerrainPresentation: async ({ assertCurrent }) => assertCurrent(),
      stageCombatFxProgramSubmission(options) {
        const submission = stageCombatFxProgramSubmission(options);
        assert.equal(submission.staged, true); assertProgramCheckpoint();
        return submission;
      } },
    armorAimOverlay: { warm() {
      const restore = armor.warm();
      return () => { armorRestores++; restore(); events.push('restore-armor'); };
    } },
    forwardProgramWarm: createForwardProgramWarmOwner({ renderer, scene, camera,
      getTarget: () => sourceTarget, now: host.now }),
    combatWarm: { markOpeningReady() { events.push('ready'); coordinator.markOpeningReady(); } },
    post: { sceneAA: { sceneTarget: sourceTarget }, prepareSoftParticles() {},
      warmFirstFrame: async () => ({ passes: 1 }) },
    lighting: { csm: { lights: [] } },
    createShell: () => ({ pos: new Vector3(), prevPos: new Vector3() }),
    getWorld: () => ({ group: worldRoot }), getBattleVisuals: () => ({ stream: async () => {} }),
    getFx: () => currentFx, getWarmRender: () => currentWarmer,
    getDeploymentShadowWarm: () => ({ prime: async () => ({}) }),
    getEntryLifecycle: () => ({ primeReveal: async () => { events.push('reveal'); }, coverRendering() {} }),
    prepareRevealCamera() {},
    runSceneWatchdog: async assertCurrent => { assertCurrent(); events.push('watchdog');
      return { before: 10, after: null, rescued: false, stage: null }; },
    getGeneration: () => generation, advanceGeneration: () => ++generation, setPending() {},
    setDestructionWarmed: value => { destructionReady = value; }, now: host.now,
    yieldFrame: async () => {}, createLoadingYielder: () => async () => { host.advance(11); },
    yieldProgramFrame: async () => {
      programFrames++;
      assertProgramCheckpoint();
      await nextPaintFrame();
      assertProgramCheckpoint();
      if (mode === 'budget') host.advance(5001); // Exercise the real, unchanged five-second deadline.
      if (!mode.startsWith('handoff-')) invalidate();
    },
  });
  return { runtime, events, coordinator, assertProgramCheckpoint,
    get draws() { return draws; }, get programFrames() { return programFrames; },
    get programCompiles() { return programCompiles; }, get programCloses() { return programCloses; },
    get destructionReady() { return destructionReady; }, get openingRetries() { return openingRetries; },
    get invalidated() { return invalidated; },
    assertCleanup() {
      assert.equal(fxRestores, 1); assert.equal(armorRestores, 1);
      assert.equal(armorMesh.visible, false); assert.equal(fxRoot.visible, false);
      assert.ok(meshes.every(mesh => !mesh.visible));
      assert.deepEqual(meshes.map(mesh => mesh.layers.mask), initialMeshMasks);
      assert.equal(camera.layers.mask, initialMask);
      assert.equal(activeTarget, callerTarget); assert.equal(face, 3); assert.equal(mip, 2);
      assert.equal(worldRoot.visible, true); assert.equal(playerRoot.visible, true); assert.equal(retained.visible, false);
      assert.equal(alternateRoot.visible, true, 'stale predecessor cleanup cannot touch the successor FX root');
      const parent = mode === 'stale-detach' ? null : mode === 'stale-reparent' ? alternateParent : scene;
      assert.equal(fxRoot.parent, parent, 'cleanup must preserve externally changed root ownership');
    },
    dispose() {
      coordinator.reset(); armor.dispose(); warmer.dispose(); alternateWarmer.dispose();
      geometry.dispose(); materials.forEach(material => material.dispose());
      sourceTarget.dispose(); callerTarget.dispose();
    },
  };
}

const cases = ['complete', 'budget', 'compile-error', 'reflection-error', 'first-draw', 'later-draw',
  'cleanup-error', 'stale-generation', 'stale-phase', 'stale-pool', 'stale-detach', 'stale-reparent', 'stale-warmer',
  'stale-info', 'stale-context', 'stale-context-lost', 'handoff-phase', 'handoff-context'];
for (const mode of cases) {
  await test(`solo FX strict preparation integration: ${mode}`, async () => {
    const names = ['__BATTLE_COUNTDOWN_WARM', '__COMBAT_OPENING_WARM'];
    const saved = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
    const host = createHost();
    let fixture;
    globalThis.__COMBAT_OPENING_WARM = { covered: true, batches: 99, totalMs: 999 };
    try {
      fixture = createFixture(mode, host);
      const outcome = await host.settle(fixture.runtime.warm(Promise.resolve()), fixture.assertProgramCheckpoint);
      const trace = globalThis.__BATTLE_COUNTDOWN_WARM;
      fixture.assertCleanup();
      assert.equal(fixture.programCompiles, 1, 'positive control: the actual strict private submission ran');
      assert.equal(fixture.programCloses, 1, 'every outcome closes the actual strict generator');
      const handoff = mode.startsWith('handoff-');
      const stale = mode.startsWith('stale-') || handoff;
      const failedDraw = mode === 'first-draw' || mode === 'later-draw';
      const expectedDraws = stale && !handoff ? 0 : mode === 'first-draw' ? 1 : mode === 'later-draw' ? 2 : 3;
      assert.equal(fixture.draws, expectedDraws, 'the requested actual draw path was exercised');
      if (stale || mode === 'cleanup-error') {
        assert.ok(outcome.error, 'stale ownership or uncertain cleanup reaches covered entry recovery');
        assert.match(String(outcome.error), stale ? /superseded|stale/i : /controlled FX cleanup failed/);
        assert.equal(fixture.events.includes('reveal'), false);
        if (stale) {
          assert.equal(fixture.invalidated, true);
          if (handoff) assert.equal(trace.deploymentFxPrograms.result.status, 'complete',
            'past program completion cannot certify a later invalidated readiness handoff');
          else {
            assert.equal(fixture.programFrames, 1);
            assert.deepEqual(trace.deploymentFxPrograms.result,
              { status: 'incomplete', pending: null, reason: 'invalidated' });
          }
          assert.ok(trace.deploymentFxPrograms.totalMs >= 17, 'cancelled work retains its awaited elapsed receipt');
        }
      } else assert.equal(outcome.error, undefined, 'optional preparation/draw fallback does not reject healthy entry');
      const ready = !stale && !failedDraw && mode !== 'cleanup-error';
      assert.equal(trace.deploymentFxForwardWarm.completed, ready);
      assert.equal(fixture.coordinator.isOpeningReady(), ready);
      assert.equal(fixture.destructionReady, ready);
      assert.equal(globalThis.__COMBAT_OPENING_WARM?.covered === true, ready,
        'old covered success cannot survive a failed new generation');
      if (!stale) {
        const program = trace.deploymentFxPrograms, draw = trace.deploymentFxForwardWarm;
        assert.equal(program.objects, 3);
        const reason = mode === 'budget' ? 'budget' : ['compile-error', 'reflection-error'].includes(mode) ? 'reflection' : null;
        assert.equal(program.result.status, reason ? 'incomplete' : 'complete');
        if (reason) assert.equal(program.result.reason, reason);
        else assert.equal(program.result.pending, 0);
        if (mode === 'compile-error') assert.match(program.error, /controlled private compile failed/);
        if (mode === 'reflection-error') assert.ok(program.timing.uniformFailures > 0);
        assert.ok(program.syncMs > 0); assert.ok(program.maxStepMs > 0);
        assert.ok(program.totalMs >= program.syncMs);
        assert.ok(draw.programAndDrawTotalMs >= program.totalMs);
        assert.ok(draw.programAndDrawSyncMs >= program.syncMs + draw.totalMs);
        assert.ok(draw.programAndDrawMaxMs >= Math.max(program.maxStepMs, draw.maxMs));
        if (mode !== 'compile-error') assert.ok(fixture.programFrames >= 1);
        if (ready) assert.ok(fixture.events.indexOf('ready') > fixture.events.indexOf('restore-armor'));
      }
      await fixture.coordinator.warmOpeningChunked(8, async () => {});
      assert.equal(fixture.openingRetries, ready ? 0 : 1, 'only fully drawn and cleaned FX avoid coordinator retry');
    } finally {
      fixture?.dispose(); host.restore();
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    }
  });
}
