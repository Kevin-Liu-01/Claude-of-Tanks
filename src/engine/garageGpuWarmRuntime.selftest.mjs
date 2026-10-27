import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BoxGeometry, Group, LOD, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from 'three';
import { createForwardProgramWarmOwner, ProgramUniformPreparationError } from './programWarm.ts';
import {
  GarageRestoreAbandonedError,
  restoreGarageGpuPipeline,
  warmGarageGpuPipeline,
  selectLodLevelsFor,
} from './garageGpuWarmRuntime.ts';

const scene = new Scene();
const camera = new PerspectiveCamera();
const renderer = {};
const calls = [];
const progress = [];
const timings = {};
let clock = 0;

await warmGarageGpuPipeline({
  renderer,
  scene,
  camera,
  lighting: {
    update(force) { calls.push(['light', force]); },
    async primeShadowMaps(activeRenderer, activeScene, activeCamera, options) {
      assert.equal(activeRenderer, renderer);
      assert.ok(activeScene === scene);
      assert.ok(activeCamera === camera);
      assert.equal(options.cascadeLimit, undefined);
      await options.yieldBeforeCascade();
      return [7, 3, 1];
    },
  },
  forwardPrograms: {
    compile(root) {
      assert.ok(root === scene);
      calls.push(['compile']);
    },
  },
  post: {
    msaaSamples: 4,
    async warmFirstFrame(yieldWarm) {
      await yieldWarm();
      return [{ label: 'scene', ms: 5 }, { label: 'grade', ms: 2 }];
    },
    render(dt) { calls.push(['render', dt]); },
  },
  timings,
  reportProgress(fraction) { progress.push(fraction); },
  simDt: 1 / 60,
  createYielder: () => async (force) => { calls.push(['yield', force]); },
  warmScene: async (activeRenderer, activeScene, activeCamera, options) => {
    assert.equal(activeRenderer, renderer);
    assert.ok(activeScene === scene);
    assert.ok(activeCamera === camera);
    assert.equal(options.maxObjects, 64);
    assert.equal(options.maxWeight, 240_000);
    // (2026-10-26, the boot census) every visible draw whatever the warm camera frames, at the scene pass's samples
    assert.equal(options.uncull, true, 'the boot warm draws what the showroom camera will frame, not only the warm\'s view');
    assert.equal(options.samples(), 4, 'into a target with the scene pass\'s samples');
    await options.yieldBeforeBatch(0);
    return [11, 4];
  },
  now: () => { clock += 10; return clock; },
});

assert.deepEqual(calls[0], ['compile'], 'production-target submission happens first');
assert.deepEqual(calls[1], ['light', true], 'shadow state follows forward submission');
assert.deepEqual(calls.at(-1), ['render', 1 / 60], 'one complete post frame seals the warm');
assert.equal(timings.postCompile, 10);
assert.equal(timings.shadowPassMax, 7);
assert.deepEqual(timings.sceneUploadBatches, [11, 4]);
assert.equal(timings.sceneUploadMax, 11);
assert.equal(timings.postPassMax, 5);
assert.ok(progress.length >= 4, 'each bounded GPU unit renews boot progress');

{
  // (2026-10-26, the boot census) an owner that can submit the scene a slice at a time does, against the visible scene,
  // before the shadow state's update: the one-task submission was 100-150 ms of a cold desktop's boot
  const order = [];
  const sliced = {};
  await warmGarageGpuPipeline({
    renderer, scene, camera,
    lighting: { update() { order.push('light'); }, async primeShadowMaps() { return [1]; } },
    forwardPrograms: {
      compile() { assert.fail('the sliced submission replaces the one-task compile'); },
      *compileSceneSteps(options) {
        assert.ok(options.visibleRoot === scene, 'the visible scene, as compile() selects it');
        assert.equal(options.sliceMs, 8);
        for (let slice = 0; slice < 3; slice++) { order.push('slice'); yield; }
      },
    },
    post: { async warmFirstFrame() { return []; }, render() { order.push('render'); } },
    timings: sliced,
    reportProgress() {},
    simDt: 1 / 60,
    createYielder: () => async () => { order.push('yield'); },
    warmScene: async () => [1],
    now: () => 0,
  });
  assert.deepEqual(order.slice(0, 6), ['slice', 'yield', 'slice', 'yield', 'slice', 'yield'], 'a yield between submission slices');
  assert.ok(order.indexOf('light') > order.lastIndexOf('slice'), 'shadow state follows the whole submission');
  assert.equal(sliced.postCompileSlices, 3);
  assert.equal(order.at(-1), 'render');
}

{
  // (2026-10-26, the live 258 census and the boot ABBA) the compiled programs' first use between frames, hidden LOD
  // levels included, after the link wait and before the shadow prime and the warm's draws (which reach only the selected
  // LOD level); initializeSteps would prepare only programs its own submission made, none after the full compile
  const order = [];
  const firstUse = {};
  await warmGarageGpuPipeline({
    renderer, scene, camera,
    lighting: { update() {}, async primeShadowMaps() { order.push('shadows'); return [1]; } },
    forwardPrograms: {
      compile() { order.push('compile'); },
      *initializeSteps() { assert.fail('the boot first-uses the compiled programs, not a second submission'); },
      *prepareCompiledSteps(root, options) {
        assert.ok(root === scene);
        for (let slice = 0; slice < 2; slice++) { order.push('first-use'); yield; }
        options.timing.uniformCount = 24;
        options.timing.uniformReused = 3;
        return { status: 'complete', pending: 0 };
      },
    },
    post: { async warmFirstFrame() { return []; }, render() { order.push('render'); } },
    timings: firstUse,
    reportProgress() {},
    simDt: 1 / 60,
    createYielder: () => async () => {},
    awaitProgramLinks: async () => { order.push('links'); },
    warmScene: async () => { order.push('draws'); return [1]; },
    now: () => 0,
  });
  assert.deepEqual(order.slice(0, 5), ['compile', 'links', 'first-use', 'first-use', 'shadows']);
  assert.ok(order.indexOf('draws') > order.lastIndexOf('first-use'));
  assert.equal(firstUse.firstUseSlices, 2);
  assert.equal(firstUse.firstUsePrograms, 24);
  assert.equal(firstUse.firstUseReused, 3);
  assert.equal(firstUse.firstUsePending, undefined, 'a complete first use records nothing pending');
}

{
  const restoreCalls = [];
  let restoreClock = 0;
  const receipt = await restoreGarageGpuPipeline({
    renderer,
    scene,
    camera,
    lighting: {
      setStaticPresentationDormant(value) {
        restoreCalls.push(['staticDormant', value]);
      },
      update(force) { restoreCalls.push(['light', force]); },
      async primeShadowMaps(activeRenderer, activeScene, activeCamera, options) {
        assert.equal(activeRenderer, renderer);
        assert.ok(activeScene === scene);
        assert.ok(activeCamera === camera);
        assert.equal(options.cascadeLimit, 2);
        await options.yieldBeforeCascade(0);
        return [13, 5];
      },
    },
    forwardPrograms: {
      *initializeSteps(root, stats, options) {
        assert.ok(root === scene, 'restore prepares background and fittings as well as the hero');
        assert.equal(options.requireCompletion, true, 'Garage cannot mistake owner cancellation for completion');
        restoreCalls.push(['programSteps']);
        stats.totalCompileMs = 6;
        stats.maxCompileMs = 4;
        stats.maxCompileObject = 'garage-hero';
        yield;
        yield;
      },
      *linkerBreathingSlices(maxSlices) {
        assert.equal(maxSlices, 240, 'the restore polls the links until done (bounded at about 4 s of covered frames)');
        restoreCalls.push(['linkerSteps']);
        yield;
      },
      compile() { assert.fail('bounded program steps should succeed'); },
    },
    post: {
      render(dt) { restoreCalls.push(['restoreRender', dt]); },
    },
    simDt: 1 / 60,
    resourcesReleased: true,
    createYielder: (budgetMs) => {
      assert.equal(budgetMs, 8);
      return async (force) => { restoreCalls.push(['yield', force]); };
    },
    yieldProgramReadiness: async () => { restoreCalls.push(['readiness-frame']); },
    warmScene: async (activeRenderer, activeScene, activeCamera, options) => {
      assert.equal(activeRenderer, renderer);
      assert.ok(activeScene === scene);
      assert.ok(activeCamera === camera);
      assert.equal(options.scale, 0.0625);
      assert.equal(options.maxObjects, 24);
      assert.equal(options.maxWeight, 90_000);
      await options.yieldBeforeBatch(0);
      return [9, 4, 2];
    },
    now: () => { restoreClock += 10; return restoreClock; },
  });
  assert.deepEqual(restoreCalls[0], ['staticDormant', false]);
  assert.deepEqual(restoreCalls[1], ['light', true]);
  assert.deepEqual(restoreCalls.filter(([name]) => name === 'yield'), [
    ['yield', undefined],
    ['yield', undefined],
  ], 'shadow/upload atoms retain their CPU task budget');
  assert.equal(restoreCalls.filter(([name]) => name === 'readiness-frame').length, 3,
    'program initialization and linker checkpoints use the distinct frame/task readiness scheduler');
  assert.deepEqual(restoreCalls.at(-1), ['staticDormant', true]);
  assert.deepEqual(receipt, {
    totalMs: 50,
    resourcesReleased: true,
    programWarmMs: 10,
    programWarmSlices: 2,
    programCompileMs: 6,
    programCompileMaxMs: 4,
    programCompileObject: 'garage-hero',
    programCohorts: 0,
    programsPrepared: 0,
    programCohortMax: 0,
    programBudgetSlices: 0,
    linkerSlices: 1,
    shadowPasses: [13, 5],
    shadowPassMax: 13,
    shadowCascadeCount: 2,
    sceneUploadBatches: [9, 4, 2],
    sceneUploadMax: 9,
    settleFrameMs: 10,
  });
}

{
  let warmCalls = 0;
  const residentProgramCalls = [];
  const receipt = await restoreGarageGpuPipeline({
    renderer,
    scene,
    camera,
    lighting: {
      setStaticPresentationDormant() {},
      update() {},
      async primeShadowMaps(_renderer, _scene, _camera, options) {
        assert.equal(options.cascadeLimit, 2);
        return [3, 2];
      },
    },
    forwardPrograms: {
      *initializeSteps() {
        residentProgramCalls.push('initialize');
      },
      *linkerBreathingSlices() {
        residentProgramCalls.push('linker');
      },
      compile() { assert.fail('resident programs must not be compiled again'); },
    },
    post: { render() {} },
    simDt: 1 / 60,
    resourcesReleased: false,
    programsNeedWarm: true,
    createYielder: () => async () => {},
    warmScene: async () => {
      warmCalls += 1;
      return [99];
    },
    now: () => 50,
  });
  assert.deepEqual(residentProgramCalls, ['initialize', 'linker'],
    'the current hero is submitted even when static Garage resources remain resident');
  assert.equal(warmCalls, 1, 'a changed resident hero still needs bounded first-draw texture and buffer preparation');
  assert.deepEqual(receipt, {
    totalMs: 0,
    resourcesReleased: false,
    programWarmMs: 0,
    programWarmSlices: 0,
    programCompileMs: 0,
    programCompileMaxMs: 0,
    programCompileObject: null,
    programCohorts: 0,
    programsPrepared: 0,
    programCohortMax: 0,
    programBudgetSlices: 0,
    linkerSlices: 0,
    shadowPasses: [3, 2],
    shadowPassMax: 3,
    shadowCascadeCount: 2,
    sceneUploadBatches: [99],
    sceneUploadMax: 99,
    settleFrameMs: 0,
  });
}

{
  const scene = new Scene();
  const hero = new Group();
  const heroMesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  const background = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  hero.add(heroMesh);
  scene.add(hero, background);
  const compiled = new Set();
  const reflected = new Set();
  const uploaded = new Set();
  const events = [];
  const gl = { getExtension: () => ({ COMPLETION_STATUS_KHR: 0x91b1 }), getProgramParameter: () => true };
  const actualRenderer = {
    info: { programs: [] }, getContext: () => gl,
    getRenderTarget: () => null, setRenderTarget() {},
    compile(root) {
      root.traverse((object) => {
        if (!object.isMesh || compiled.has(object)) return;
        compiled.add(object);
        actualRenderer.info.programs.push({ program: {},
          getUniforms() { reflected.add(object); return {}; }, getAttributes: () => ({}) });
      });
      return new Set([...compiled].map((object) => object.material));
    },
  };
  const owner = createForwardProgramWarmOwner({ renderer: actualRenderer, scene, camera,
    getTarget: () => null, now: () => 0 });
  const options = {
    renderer: actualRenderer, scene, camera, forwardPrograms: owner,
    resourcesReleased: false, simDt: 1 / 60, now: () => 0,
    lighting: { update() {}, setStaticPresentationDormant() {}, async primeShadowMaps() { return [1]; } },
    yieldProgramReadiness: async () => {},
    warmScene: async (_renderer, activeScene) => {
      events.push('upload');
      activeScene.traverseVisible((object) => { if (object.isMesh) uploaded.add(object); });
      return [1];
    },
    post: { render() {
      assert.deepEqual(reflected, new Set([heroMesh, background]),
        'negative control: hero-only preparation leaves the background cold at the exact settle frame');
      assert.deepEqual(uploaded, reflected, 'both resident/new first-draw resources are prepared before settle');
      events.push('settle');
    } },
  };
  // (2026-10-27, the room-stalls lane) the lateLinks receipt opens once the program warm and the shadow prime are done,
  // before the upload and settle draws
  const prepared = await restoreGarageGpuPipeline({ ...options, programsNeedWarm: true,
    lighting: { ...options.lighting, async primeShadowMaps() { events.push('shadows'); return [1]; } },
    onProgramsWarmed: () => { assert.deepEqual(reflected, new Set([heroMesh, background])); events.push('warmed'); } });
  assert.equal(prepared.programCohorts, 1, 'actual owner batches hero and background into one readiness cohort');
  assert.equal(prepared.programsPrepared, 2);
  assert.equal(prepared.programCohortMax, 2);
  assert.equal(prepared.programBudgetSlices, 0);
  assert.deepEqual(events, ['shadows', 'warmed', 'upload', 'settle']);
  events.length = 0;
  const repeat = await restoreGarageGpuPipeline({ ...options, programsNeedWarm: false,
    forwardPrograms: {
      *initializeSteps() { assert.fail('unchanged resident Garage must retain the fast path'); },
      *linkerBreathingSlices() { assert.fail('unchanged resident Garage needs no linker work'); },
      compile() { assert.fail('unchanged resident Garage needs no compile'); },
    },
    warmScene: async () => { assert.fail('unchanged resident Garage needs no upload pass'); },
  });
  assert.deepEqual(events, ['settle']);
  assert.deepEqual(repeat.sceneUploadBatches, []);
  assert.equal(repeat.programWarmSlices, 0);
  heroMesh.geometry.dispose(); heroMesh.material.dispose();
  background.geometry.dispose(); background.material.dispose();
}

// (2026-10-27, the room-stalls lane) a program warm's restore primes every visible caster's depth program (casterWarmup),
// and each upload batch waits, a frame at a time, until the GPU has passed the mark before the previous batch
{
  let primeOptions = null;
  let status = 0;
  const statuses = [0x9111, 0x9111, 0x911a, 0x911a]; // TIMEOUT_EXPIRED twice, then ALREADY_SIGNALED
  const fencedGl = {
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117, TIMEOUT_EXPIRED: 0x9111,
    fenceSync: () => ({}), flush() {}, deleteSync() {}, isContextLost: () => false,
    clientWaitSync: () => statuses[Math.min(status++, statuses.length - 1)],
  };
  let readinessFrames = 0;
  const run = (programsNeedWarm) => restoreGarageGpuPipeline({
    renderer: { info: { programs: [] }, getContext: () => fencedGl }, scene: new Scene(), camera,
    forwardPrograms: { *initializeSteps() {}, *linkerBreathingSlices() {}, compile() {} },
    post: { render() {} }, resourcesReleased: true, programsNeedWarm, simDt: 1 / 60, now: () => 0,
    lighting: { update() {}, setStaticPresentationDormant() {}, async primeShadowMaps(_r, _s, _c, options) { primeOptions = options; return [1]; } },
    createYielder: () => async () => {},
    yieldProgramReadiness: async () => { readinessFrames++; },
    warmScene: async (_renderer, _scene, _camera, { yieldBeforeBatch }) => { await yieldBeforeBatch(0); await yieldBeforeBatch(1); return [1, 1]; },
  });
  const warmed = await run(true);
  assert.ok(primeOptions.casterWarmup && typeof primeOptions.casterWarmup.yieldBeforeBatch === 'function',
    'a program warm\'s restore primes its casters\' depth programs');
  // the first poll places the mark (one frame), the next two find the GPU behind (two more), the fourth caught up; the
  // second batch's poll finds the GPU past the mark before the first batch and waits none
  assert.equal(warmed.uploadCatchUpFrames, 3);
  assert.equal(readinessFrames, 3);
  status = 2;
  readinessFrames = 0;
  const resident = await run(false);
  assert.equal(primeOptions.casterWarmup, undefined, 'a restore without a program warm keeps the prime as it was');
  assert.equal(resident.uploadCatchUpFrames, 1, 'a fresh mark still costs the first batch its frame');
}

// 2026-10-10 (the MP shader-prep lane; prod 211): a readiness proof that only ran out of time takes the same covered
// compatibility path as a legacy compile failure — it never leaves the Garage unready (every scene frame suppressed);
// a proof that cannot succeed (a failed query or reflection, a lost context) still fails closed.
for (const failure of ['budget', 'reflection', 'legacy']) {
  const readinessFailure = failure !== 'legacy';
  const error = readinessFailure
    ? new ProgramUniformPreparationError({ status: 'incomplete', pending: 1, reason: failure })
    : new Error('legacy compile compatibility');
  const events = [];
  const run = restoreGarageGpuPipeline({
    renderer, scene, camera, resourcesReleased: false, programsNeedWarm: true, simDt: 1 / 60,
    lighting: {
      setStaticPresentationDormant(value) { events.push(['dormant', value]); },
      update() {},
      async primeShadowMaps() { events.push(['shadows']); return [1, 1]; },
    },
    forwardPrograms: {
      *initializeSteps() { yield; throw error; },
      *linkerBreathingSlices() { assert.fail('failed preparation never reaches legacy polling'); },
      compile() { events.push(['fallback']); },
    },
    post: { render() { events.push(['render']); } },
    yieldProgramReadiness: async () => {},
    warmScene: async () => { events.push(['upload']); return [1]; },
  });
  if (failure === 'reflection') {
    await assert.rejects(run, (caught) => caught === error);
    assert.deepEqual(events, [['dormant', false], ['dormant', true]],
      'a readiness proof that cannot succeed fails closed before cold fallback/render and still restores static ownership');
  } else {
    const receipt = await run;
    assert.deepEqual(events, [['dormant', false], ['fallback'], ['shadows'], ['upload'], ['render'], ['dormant', true]],
      failure === 'budget'
        ? 'a readiness proof out of time takes the covered compatibility fallback: the settle frame links the rest'
        : 'unrelated legacy compile failures preserve the existing actual-render compatibility fallback');
    assert.equal(receipt.programWarmDeferred, failure === 'budget' ? 1 : undefined, 'the receipt names the deferred programs');
  }
}

for (const boundary of ['initial-loss', 'initial-context-error', 'submission-loss', 'pending-epoch',
  'pending-context', 'pending-context-error', 'after-reflection']) {
  const root = new Group();
  const scene = new Scene();
  scene.add(root);
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  root.add(mesh);
  const events = [];
  let clock = 0;
  let yields = 0;
  let lost = boundary === 'initial-loss';
  const program = { program: {}, getUniforms() { events.push('uniform'); clock += 7; return {}; },
    getAttributes: () => ({}) };
  const gl = {
    isContextLost: () => lost,
    getExtension: () => ({ COMPLETION_STATUS_KHR: 0x91b1 }),
    getProgramParameter: () => boundary === 'after-reflection',
  };
  const actualRenderer = {
    info: { programs: [] },
    getContext() { if (boundary === 'initial-context-error') throw new Error('context unavailable'); return gl; },
    getRenderTarget: () => null,
    setRenderTarget() {},
    compile() {
      events.push('compile');
      actualRenderer.info.programs.push(program);
      if (boundary === 'submission-loss') lost = true;
      return new Set([mesh.material]);
    },
  };
  const actualOwner = createForwardProgramWarmOwner({ renderer: actualRenderer, scene, camera,
    getTarget: () => null, now: () => clock });
  let compileFallback = false;
  await assert.rejects(restoreGarageGpuPipeline({
    renderer: actualRenderer, scene, camera, resourcesReleased: true, simDt: 1 / 60,
    lighting: {
      setStaticPresentationDormant(value) { events.push(`dormant:${value}`); }, update() {},
      primeShadowMaps() { assert.fail('invalidated initialization cannot reach shadows'); },
    },
    forwardPrograms: {
      initializeSteps: actualOwner.initializeSteps,
      linkerBreathingSlices() { assert.fail('invalidated initialization cannot start a fresh linker lifetime'); },
      compile() { compileFallback = true; },
    },
    post: { render() { assert.fail('invalidated initialization cannot render/reveal'); } },
    warmScene: async () => { assert.fail('invalidated initialization cannot upload'); },
    now: () => clock,
    yieldProgramReadiness: async () => {
      yields += 1;
      if (boundary === 'pending-epoch' || (boundary === 'after-reflection' && yields === 2)) actualOwner.invalidate();
      if (boundary === 'pending-context') lost = true;
      if (boundary === 'pending-context-error') actualRenderer.getContext = () => { throw new Error('lost context'); };
    },
  }), (error) => error instanceof ProgramUniformPreparationError && error.preparation.reason === 'invalidated', boundary);
  assert.equal(compileFallback, false, `${boundary}: no cold fallback after invalidation`);
  assert.equal(events.at(-1), 'dormant:true', `${boundary}: static ownership restored on rejection`);
  assert.equal(events.filter((event) => event === 'uniform').length, boundary === 'after-reflection' ? 1 : 0);
  mesh.geometry.dispose(); mesh.material.dispose();
}

for (const mode of ['task-only-negative', 'actual-frame-ready', 'cancel-during-frame']) {
  const root = new Group();
  const scene = new Scene();
  scene.add(root);
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  root.add(mesh);
  let painted = false;
  let queries = 0;
  let reflections = 0;
  let taskYields = 0;
  let rendered = false;
  const frames = [];
  const priorRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  const program = { program: {}, getUniforms() {
    assert.equal(painted, true, 'native reflection must not precede the simulated compositor completion');
    reflections += 1; return {};
  }, getAttributes: () => ({}) };
  const gl = { getExtension: () => ({ COMPLETION_STATUS_KHR: 0x91b1 }),
    getProgramParameter() { queries += 1; return painted; } };
  const actualRenderer = { info: { programs: [] }, getContext: () => gl,
    getRenderTarget: () => null, setRenderTarget() {},
    compile() { actualRenderer.info.programs.push(program); return new Set([mesh.material]); } };
  const actualOwner = createForwardProgramWarmOwner({ renderer: actualRenderer, scene, camera,
    getTarget: () => null, now: () => 0 });
  try {
    const run = restoreGarageGpuPipeline({
      renderer: actualRenderer, scene, camera, forwardPrograms: actualOwner,
      resourcesReleased: false, programsNeedWarm: true, simDt: 1 / 60,
      lighting: { update() {}, setStaticPresentationDormant() {},
        async primeShadowMaps() { if (mode !== 'task-only-negative') assert.equal(painted, true); return [1, 1]; } },
      post: { render() { rendered = true; } },
      warmScene: async () => [1],
      now: () => 0,
      ...(mode === 'task-only-negative'
        ? { yieldProgramReadiness: async () => { taskYields += 1; } } : {}),
    });
    if (mode === 'task-only-negative') {
      // The finite round cap with task-only progress still ends the readiness proof, without reflecting a pending
      // program; since 2026-10-10 the restore then completes through the covered settle frame instead of leaving the
      // Garage unready.
      const receipt = await run;
      assert.ok(taskYields >= 1000 && taskYields <= 1025,
        'negative control reproduces the unchanged finite round cap with task-only progress');
      assert.equal(reflections, 0, 'no pending program is reflected cold');
      assert.equal(rendered, true, 'the covered settle frame presents the Garage');
      assert.equal(receipt.programWarmDeferred, 1);
    } else {
      for (let i = 0; i < 20 && frames.length === 0; i += 1) await Promise.resolve();
      assert.equal(frames.length, 1, 'default actual Garage scheduler awaits the native frame port');
      assert.equal(queries, 0, 'initial shader submission has not started a task-only polling storm');
      if (mode === 'cancel-during-frame') actualOwner.invalidate();
      painted = true;
      frames.shift()(0);
      if (mode === 'cancel-during-frame') {
        await assert.rejects(run, (error) => error instanceof ProgramUniformPreparationError
          && error.preparation.reason === 'invalidated');
        assert.equal(reflections, 0);
        assert.equal(rendered, false);
      } else {
        await run;
        assert.equal(queries, 1, 'the unchanged readiness proof succeeds after real frame/task progress');
        assert.equal(reflections, 1);
        assert.equal(rendered, true);
      }
    }
  } finally {
    if (priorRaf) globalThis.requestAnimationFrame = priorRaf;
    else delete globalThis.requestAnimationFrame;
    mesh.geometry.dispose(); mesh.material.dispose();
  }
}

// perf-246: Battle Again over a Garage being prepared behind the report abandons the restore. It stops at the next
// program step: no compile fallback, no shadow pass, no upload, no settle frame; the static presentation re-sleeps.
for (const abandonAt of ['program', 'linker', 'shadow', 'upload']) {
  const seen = [];
  let current = true;
  const abandon = (stage) => { if (stage === abandonAt) current = false; };
  await assert.rejects(restoreGarageGpuPipeline({
    renderer,
    scene,
    camera,
    lighting: {
      setStaticPresentationDormant(value) { seen.push(['staticDormant', value]); },
      update() {},
      async primeShadowMaps(_renderer, _scene, _camera, options) {
        seen.push(['shadow']);
        abandon('shadow');
        await options.yieldBeforeCascade(0);
        seen.push(['shadowPass']);
        return [3];
      },
    },
    forwardPrograms: {
      *initializeSteps() {
        seen.push(['program']);
        abandon('program');
        yield;
        seen.push(['programAfterAbandon']);
        yield;
      },
      *linkerBreathingSlices() {
        seen.push(['linker']);
        abandon('linker');
        yield;
        seen.push(['linkerAfterAbandon']);
      },
      compile() { seen.push(['compileFallback']); },
    },
    post: { render() { seen.push(['settleFrame']); } },
    simDt: 1 / 60,
    resourcesReleased: true,
    programsNeedWarm: true,
    isCurrent: () => current,
    createYielder: () => async () => {},
    yieldProgramReadiness: async () => {},
    warmScene: async (_renderer, _scene, _camera, options) => {
      seen.push(['upload']);
      abandon('upload');
      await options.yieldBeforeBatch(0);
      seen.push(['uploadBatch']);
      return [1];
    },
  }), (error) => error instanceof GarageRestoreAbandonedError, `${abandonAt}: the abandoned restore rejects`);
  const names = seen.map(([name]) => name);
  const order = ['program', 'programAfterAbandon', 'linker', 'linkerAfterAbandon', 'shadow', 'shadowPass', 'upload',
    'uploadBatch', 'settleFrame'];
  for (const never of ['compileFallback', ...order.slice(order.indexOf(abandonAt) + 1)]) {
    assert.equal(names.includes(never), false, `${abandonAt}: an abandoned restore never runs ${never}`);
  }
  assert.deepEqual(seen.at(-1), ['staticDormant', true], `${abandonAt}: the static presentation sleeps again`);
}

// (2026-10-26, the room-stalls lane) the restore warms the LOD levels the first Garage frame will draw: a hero's levels as
// a far battle camera left them choose the close level for the Garage camera before any program is prepared
{
  const scene = new Scene(), lod = new LOD(), near = new Mesh(new BoxGeometry(), new MeshStandardMaterial()),
    far = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  lod.addLevel(near, 0); lod.addLevel(far, 40);
  const fixed = new LOD(), fixedNear = new Mesh(new BoxGeometry()), fixedFar = new Mesh(new BoxGeometry());
  fixed.addLevel(fixedNear, 0); fixed.addLevel(fixedFar, 40); fixed.autoUpdate = false;
  scene.add(lod, fixed);
  const battle = new PerspectiveCamera(); battle.position.set(0, 0, 200);
  assert.equal(selectLodLevelsFor(scene, battle), 1, 'an auto-updating LOD chooses; one held by its owner does not');
  assert.ok(!near.visible && far.visible, 'the battle camera left the far level shown');
  fixedNear.visible = false; fixedFar.visible = true;
  const garage = new PerspectiveCamera(); garage.position.set(0, 0, 6);
  assert.equal(selectLodLevelsFor(scene, garage), 1);
  assert.ok(near.visible && !far.visible, 'the Garage camera chooses the close level before the warm');
  assert.ok(!fixedNear.visible && fixedFar.visible, 'a LOD with autoUpdate off keeps its level');
  assert.equal(selectLodLevelsFor({}, garage), 0, 'a fake root has no LODs');
  const source = readFileSync(new URL('./garageGpuWarmRuntime.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export async function restoreGarageGpuPipeline'));
  assert.ok(body.indexOf('lodsSelected = selectLodLevelsFor(scene, camera);') > 0
    && body.indexOf('lodsSelected = selectLodLevelsFor(scene, camera);') < body.indexOf('forwardPrograms.initializeSteps(scene'),
    'the restore chooses the levels before it prepares their programs');
}

console.log('garageGpuWarmRuntime.selftest: bounded warms, real readiness scheduling, fail-closed cancellation and abandonment passed; the restore warms the LOD levels the Garage camera draws');
