import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from 'three';
import { createForwardProgramWarmOwner, ProgramUniformPreparationError } from './programWarm.ts';
import {
  restoreGarageGpuPipeline,
  warmGarageGpuPipeline,
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
      assert.equal(activeScene, scene);
      assert.equal(activeCamera, camera);
      assert.equal(options.cascadeLimit, undefined);
      await options.yieldBeforeCascade();
      return [7, 3, 1];
    },
  },
  forwardPrograms: {
    compile(root) {
      assert.equal(root, scene);
      calls.push(['compile']);
    },
  },
  post: {
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
    assert.equal(activeScene, scene);
    assert.equal(activeCamera, camera);
    assert.equal(options.maxObjects, 64);
    assert.equal(options.maxWeight, 240_000);
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
        assert.equal(activeScene, scene);
        assert.equal(activeCamera, camera);
        assert.equal(options.cascadeLimit, 2);
        await options.yieldBeforeCascade(0);
        return [13, 5];
      },
    },
    forwardPrograms: {
      *initializeSteps(root, stats, options) {
        assert.equal(root, scene, 'restore prepares background and fittings as well as the hero');
        assert.equal(options.requireCompletion, true, 'Garage cannot mistake owner cancellation for completion');
        restoreCalls.push(['programSteps']);
        stats.totalCompileMs = 6;
        stats.maxCompileMs = 4;
        stats.maxCompileObject = 'garage-hero';
        yield;
        yield;
      },
      *linkerBreathingSlices(maxSlices) {
        assert.equal(maxSlices, 8);
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
      assert.equal(activeScene, scene);
      assert.equal(activeCamera, camera);
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
  const prepared = await restoreGarageGpuPipeline({ ...options, programsNeedWarm: true });
  assert.equal(prepared.programCohorts, 1, 'actual owner batches hero and background into one readiness cohort');
  assert.equal(prepared.programsPrepared, 2);
  assert.equal(prepared.programCohortMax, 2);
  assert.equal(prepared.programBudgetSlices, 0);
  assert.deepEqual(events, ['upload', 'settle']);
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

for (const readinessFailure of [true, false]) {
  const error = readinessFailure
    ? new ProgramUniformPreparationError({ status: 'incomplete', pending: 1, reason: 'budget' })
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
  if (readinessFailure) {
    await assert.rejects(run, (caught) => caught === error);
    assert.deepEqual(events, [['dormant', false], ['dormant', true]],
      'unfinished readiness fails closed before cold fallback/render and still restores static ownership');
  } else {
    await run;
    assert.deepEqual(events, [['dormant', false], ['fallback'], ['shadows'], ['upload'], ['render'], ['dormant', true]],
      'unrelated legacy compile failures preserve the existing actual-render compatibility fallback');
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
        async primeShadowMaps() { assert.equal(painted, true); return [1, 1]; } },
      post: { render() { rendered = true; } },
      warmScene: async () => [1],
      now: () => 0,
      ...(mode === 'task-only-negative'
        ? { yieldProgramReadiness: async () => { taskYields += 1; } } : {}),
    });
    if (mode === 'task-only-negative') {
      await assert.rejects(run, (error) => error instanceof ProgramUniformPreparationError
        && error.preparation.reason === 'budget');
      assert.ok(taskYields >= 1000 && taskYields <= 1025,
        'negative control reproduces the unchanged finite round cap with task-only progress');
      assert.equal(reflections, 0);
      assert.equal(rendered, false);
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

console.log('garageGpuWarmRuntime.selftest: bounded warms, real readiness scheduling, and fail-closed cancellation passed');
