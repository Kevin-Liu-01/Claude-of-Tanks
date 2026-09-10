import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WebGLLights } from 'three/src/renderers/webgl/WebGLLights.js';
import { createNightLightingAccess } from '../engine/nightLightingAccess.ts';
import { registerNightLightEmitters } from '../engine/nightLightingRuntime.ts';
import { createOpaqueLoadingYielder } from '../engine/frameScheduler.ts';
import { createSoloBattleDeploymentRuntime } from './soloBattleDeploymentRuntime.ts';
import { primeOpeningTerrainPresentation } from './battleWarmRuntime.ts';
import { createBattleVisualStreamer } from './battleVisualStreamer.ts';
import { LATE_FX_LAYER } from '../fx/layers.ts';

function createHarness({ failAllies = false, failAtmosphere = false, pauseAtmosphere = false,
  night = false, failNight = false, pauseNight = false, cancelCover = false, failCover = false,
  compileSlices = 2, cancelCompile = false, lateCancelCompile = '', lateCancelWarm = '',
  streamedCadence = null, terrainPrograms = '', vegetationPrograms = '', failPost = false,
  watchdog = 'healthy', pauseWatchdog = false, failRevealCover = false } = {}) {
  const calls = [];
  let releaseAtmosphere;
  const atmosphereGate = new Promise((resolve) => { releaseAtmosphere = resolve; });
  let releaseNight;
  const nightGate = new Promise((resolve) => { releaseNight = resolve; });
  let releaseWatchdog;
  const watchdogGate = new Promise(resolve => { releaseWatchdog = resolve; });
  let generation = 0;
  let pending = false;
  let destructionWarmed = false;
  let clock = 0;
  let programFrames = 0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const worldGroup = new THREE.Group();
  worldGroup.name = 'world';
  scene.add(worldGroup);
  const terrain = new THREE.Group();
  terrain.name = 'terrain';
  if (terrainPrograms) worldGroup.add(terrain);
  const vegetation = new THREE.Group();
  vegetation.name = 'vegetation';
  vegetation.visible = vegetationPrograms !== 'hidden';
  if (vegetationPrograms) worldGroup.add(vegetation);
  const sourceTarget = new THREE.WebGLRenderTarget(4, 4);
  camera.layers.enable(LATE_FX_LAYER);
  const fxGroup = new THREE.Group();
  fxGroup.name = 'fx';
  scene.add(fxGroup);
  const warmResources = [];
  if (lateCancelWarm === 'fx') {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    warmResources.push(geometry, material);
    fxGroup.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  }
  const shadow = { autoUpdate: true, needsUpdate: true };
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
    camera,
    battleLoad: {
      progress: (fraction, label) => calls.push(['progress', fraction, label]),
    },
    battleWarm: {
      warmBattleTerrainTiles: async options => {
        assert.equal(options.primePresentation, false, 'terrain warm cannot guess the reveal camera');
        calls.push(['terrain']);
      },
      primeOpeningTerrainPresentation: async options => {
        assert.strictEqual(options.camera, camera);
        assert.equal(typeof options.assertCurrent, 'function', 'solo supplies its generation owner to terrain');
        assert.deepEqual(camera.position.toArray(), [20, 6, -0.3], 'ground cover consumes the snapped pose');
        calls.push(['groundCover']);
        if (lateCancelWarm === 'cover') return primeOpeningTerrainPresentation({
          ...options,
          game: { tanks: [], player: { state: { pos: new THREE.Vector3() } } },
          world: {
            update() { calls.push(['groundCoverUpdate']); },
            getGrassWorkState() {
              calls.push(['groundCoverState']);
              return { disposed: false, carpet: { cold: true, pending: true } };
            },
          },
        });
        if (cancelCover) generation++;
        await options.yieldForBudget(true);
        if (failCover) throw new Error('ground cover failed');
        calls.push(['groundCoverReady']);
      },
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
      compile: () => { throw new Error('deployment must not submit the whole scene atomically'); },
      compileSceneSteps: function* (options) {
        assert.equal(options.sliceMs, 8);
        compile();
        try {
          for (let index = 0; index < compileSlices; index++) {
            calls.push(['compileSlice', index]);
            yield;
          }
          options.timing.submissionSlices = compileSlices + 1;
          calls.push(['compileComplete']);
        } finally { calls.push(['compileClosed']); }
      },
      initializeSteps: function* () {},
      prepareSceneSteps: function* (options) {
        const root = options.visibleRoot;
        assert.ok(root === terrain || root === vegetation, 'only current terrain/vegetation roots are selected');
        assert.equal(root.visible, true, 'hidden world roots must not be prepared');
        const mode = root === terrain ? terrainPrograms : vegetationPrograms;
        const label = `${root.name}Programs`;
        assert.equal(options.strict, true);
        assert.equal(options.sliceMs, 4);
        assert.deepEqual(options.passes, [{ layerMask: 1, target: sourceTarget }],
          'prepare the source AA target, excluding the separate late-FX pass');
        calls.push([label]);
        try {
          yield;
          if (mode === 'pending-frames') {
            let remaining = 1023;
            while (programFrames < 3 && remaining-- > 0) yield;
            if (programFrames < 3) return { status: 'incomplete', pending: 2, reason: 'budget' };
          }
          calls.push([`${label}Resumed`]);
          if (mode === 'throw') throw new Error('native reflection failed');
          options.timing.uniformCount = 2;
          return mode === 'incomplete'
            ? { status: 'incomplete', pending: 2, reason: 'query' }
            : { status: 'complete', pending: 0 };
        } finally { calls.push([`${label}Closed`]); }
      },
      linkerBreathingSlices: function* () {},
      invalidate: () => {},
    },
    combatWarm: {
      markOpeningReady: () => calls.push(['openingReady']),
    },
    post: {
      sceneAA: { sceneTarget: sourceTarget },
      warmFirstFrame: async (yieldBeforePass) => {
        calls.push(['postWarm']);
        if (failPost) throw new Error('optional post warm failed');
        await yieldBeforePass('post-pass');
        calls.push(['postYielded']);
        return { passes: 1 };
      },
    },
    lighting: { csm: { lights: lateCancelWarm === 'forward' ? [{ shadow }] : [] } },
    createShell: () => {},
    getWorld: () => ({ group: worldGroup }),
    getBattleVisuals: () => streamedCadence?.create(game, scene) ?? ({
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
      coverRendering: () => {
        calls.push(['cover']);
        if (failRevealCover) throw new Error('reveal cover failed');
      },
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
    prepareRevealCamera: () => {
      camera.position.set(20, 6, -0.3);
      calls.push(['camera']);
    },
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
    runSceneWatchdog: async assertCurrent => {
      assertCurrent();
      calls.push(['watchdog']);
      if (pauseWatchdog) await watchdogGate;
      assertCurrent();
      if (watchdog === 'throw') throw new Error('watchdog readback failed');
      calls.push(['watchdogSettled']);
      return { before: watchdog === 'black' || watchdog === 'unrestorable' ? 0 : 18,
        after: null, rescued: false, stage: null,
        ...(watchdog === 'black' || watchdog === 'unrestorable' ? { failed: true } : {}) };
    },
    getGeneration: () => generation,
    advanceGeneration: () => ++generation,
    setPending: (value) => { pending = value; },
    setDestructionWarmed: (value) => { destructionWarmed = value; },
    now: streamedCadence?.now ?? (() => ++clock),
    yieldFrame: async () => calls.push(['frame']),
    yieldProgramFrame: async () => {
      programFrames++;
      const root = calls.at(-1)?.[0] === 'vegetationPrograms' ? vegetation : terrain;
      const mode = root === terrain ? terrainPrograms : vegetationPrograms;
      if (mode === 'cancel') generation++;
      if (mode === 'detach') worldGroup.remove(root);
      if (mode === 'late-cancel') {
        // This direct frame port has one await boundary (the ordinary
        // covered yielder below has an additional guarding wrapper).
        queueMicrotask(() => { generation++; });
      }
      calls.push(['programFrame']);
    },
    createLoadingYielder: streamedCadence?.createLoadingYielder ?? (() => async (force) => {
      const previous = calls.at(-1)?.[0];
      if (cancelCompile && previous === 'compileSlice') generation++;
      if ((lateCancelCompile === 'slice' && previous === 'compileSlice')
        || (lateCancelCompile === 'final' && previous === 'compileClosed')
        || (lateCancelWarm === 'cover' && previous === 'groundCoverUpdate')
        || (lateCancelWarm === 'fx' && previous === 'warmRender')
        || (lateCancelWarm === 'forward' && previous === 'warmRender')) {
        // The nested microtask runs after guardedCoveredYield's internal
        // post-check but before the outer warm continuation resumes.
        queueMicrotask(() => queueMicrotask(() => { generation++; }));
      }
      calls.push(['yield', force]);
    }),
  });

  return {
    runtime,
    calls,
    releaseAtmosphere,
    releaseWatchdog,
    releaseNight, lamps, lightSignatures,
    shadow, worldGroup, playerRoot, fxGroup, sourceTarget,
    disposeWarmResources() { sourceTarget.dispose(); for (const resource of warmResources) resource.dispose(); },
    get generation() { return generation; },
    set generation(value) { generation = value; },
    get pending() { return pending; },
    get destructionWarmed() { return destructionWarmed; },
  };
}

// Exercise the production streamer and scheduler together, not an always-
// yielding stand-in or a source-string assertion. Only private factory work
// is modeled: ten deterministic 4 ms checkpoints per exact allied actor.
// Recorded frames are scheduler requests, never physical paint acknowledgments.
function createStreamedCadence(cancelAt = '') {
  let clock = 0, privateEntity = null;
  const frames = [], tasks = [], checkpoints = [], closed = [], published = [];
  const settings = [], builderRequests = [], qualityRequests = [], timings = [];
  const fixture = {
    frames, tasks, checkpoints, closed, published, settings, builderRequests, qualityRequests, timings,
    cancel() {},
    now: () => clock,
    createLoadingYielder(budgetMs, maxDelayMs) {
      settings.push([budgetMs, maxDelayMs]);
      const recordYield = (rows, kind) => async () => {
        rows.push({ atMs: clock, privateId: privateEntity?.id ?? null });
        if (privateEntity && cancelAt === kind) fixture.cancel();
      };
      return createOpaqueLoadingYielder(budgetMs, maxDelayMs, {
        now: fixture.now,
        yieldTask: recordYield(tasks, 'task'),
        yieldFrame: recordYield(frames, 'frame'),
      });
    },
    create(game, scene) {
      fixture.game = game;
      fixture.playerVisual = game.player.visual;
      for (let index = 1; index <= 6; index++) {
        game.tanks.push({ id: `allied-${index}`, specId: `allied-spec-${index}`, team: 'player' });
        game.tanks.push({ id: `enemy-${index}`, specId: `enemy-spec-${index}`, team: 'enemy' });
      }
      fixture.roster = game.tanks.slice();
      const select = predicate => game.tanks.find(entity => !entity.visual && predicate(entity));
      return createBattleVisualStreamer({
        game, scene, renderer: { initTexture() {} }, anisotropy: 4,
        ensureTankBuilders: async ids => { builderRequests.push([...ids]); },
        nextStagedBake(_game, predicate) {
          const ent = select(predicate);
          return ent ? { ent, quality: 'ai' } : null;
        },
        *ensureStagedVisualsSteps(_game, count, predicate) {
          assert.equal(count, 1, 'streaming retains one complete actor per construction iterator');
          const entity = select(predicate), root = new THREE.Group();
          let complete = false;
          privateEntity = entity;
          try {
            for (let index = 0; index < 10; index++) {
              clock += 4;
              checkpoints.push([entity.id, index, clock]);
              assert.equal(entity.visual, undefined, 'every yielded graph remains private');
              if (cancelAt === 'before' && index === 1) fixture.cancel();
              yield;
            }
            entity.visual = { root, setVisible(visible) { root.visible = visible; } };
            complete = true;
            published.push(entity.id);
            return true;
          } finally {
            closed.push([entity.id, complete]);
            privateEntity = null;
          }
        },
        getSpec: id => ({ id }),
        async prebakeSharedTextures(spec, anisotropy, quality) {
          qualityRequests.push([spec.id, anisotropy, quality]);
        },
        armorAimOverlay: { prime() {}, warm: () => () => {} },
        forwardProgramWarm: { compile() {} },
        recordTiming: timing => timings.push(timing), now: fixture.now,
      });
    },
  };
  return fixture;
}

{
  const cadence = createStreamedCadence();
  const harness = createHarness({ streamedCadence: cadence });
  const warmed = await harness.runtime.warm(Promise.resolve());
  assert.equal(warmed.revealPrimed, true);
  assert.equal(cadence.tasks.find(row => row.privateId)?.atMs, 12,
    'private allied construction releases its task at the 12 ms budget, not old 18 ms');
  assert.deepEqual(cadence.frames.map(row => row.atMs), [32, 64, 96, 128, 160, 192, 224],
    'streamed construction requests frames every 32 ms instead of accumulating 80 ms of work');
  assert.deepEqual(cadence.settings, [[12, 32]], 'deployment selects the foreground covered-work policy');
  const ids = Array.from({ length: 6 }, (_, index) => `allied-${index + 1}`);
  assert.deepEqual(cadence.published, ids, 'cadence changes do not skip, repeat or reorder allied actors');
  assert.deepEqual(cadence.closed, ids.map(id => [id, true]));
  assert.deepEqual(cadence.builderRequests, [ids.map(id => id.replace('allied-', 'allied-spec-'))]);
  assert.deepEqual(cadence.qualityRequests,
    cadence.builderRequests[0].map(id => [id, 4, 'ai']), 'exact spec, quality and anisotropy survive streaming');
  assert.ok(cadence.timings.every(timing => timing.buildCheckpointCount === 10 && timing.buildMs === 40));
  assert.equal(cadence.game.tanks.length, 14);
  assert.deepEqual(cadence.game.tanks, cadence.roster, 'the full roster retains every entity identity');
  assert.equal(cadence.game.player.visual, cadence.playerVisual, 'the staged player is never rebuilt');
  assert.equal(cadence.game.tanks.filter(entity => entity.team === 'player' && entity.visual).length, 7);
  assert.ok(cadence.game.tanks.filter(entity => entity.team === 'enemy').every(entity => !entity.visual),
    'all seven hidden opponents remain deferred, not dropped or eagerly built');
}

for (const [cancelAt, admitted] of [['before', 2], ['task', 3], ['frame', 8]]) {
  const cadence = createStreamedCadence(cancelAt);
  const harness = createHarness({ streamedCadence: cadence });
  cadence.cancel = () => { harness.generation++; };
  await assert.rejects(harness.runtime.warm(Promise.resolve()), /superseded/);
  assert.equal(cadence.checkpoints.length, admitted,
    `${cancelAt}: a stale generation cannot resume the next private construction checkpoint`);
  assert.deepEqual(cadence.closed, [['allied-1', false]], 'await rejection closes the actual streamer iterator');
  assert.deepEqual(cadence.published, [], 'cancellation never publishes an unfinished visual');
  assert.ok(!harness.calls.some(([name]) => ['terrain', 'compile', 'shadowWarm', 'postWarm', 'reveal'].includes(name)),
    'stale allied construction cannot advance deployment warming or reveal');
  assert.equal(cadence.game.tanks.length, 14, 'cancellation leaves roster ownership intact');
}

const happy = createHarness();
const result = await happy.runtime.warm(Promise.resolve());
const happyTrace = globalThis.__BATTLE_COUNTDOWN_WARM;
const happyOpeningWarm = globalThis.__COMBAT_OPENING_WARM;
assert.equal(result.generation, 1);
assert.equal(result.revealPrimed, true);
assert.doesNotThrow(result.assertRevealReady);
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
  ['camera', 'groundCover'],
  ['groundCoverReady', 'shadowWarm'],
  ['shadowWarm', 'postWarm'],
  ['postWarm', 'postYielded'],
  ['postYielded', 'watchdog'],
  ['watchdogSettled', 'reveal'],
  ['reveal', 'cover'],
]) {
  assert.ok(order.indexOf(before) >= 0 && order.indexOf(before) < order.indexOf(after),
    `${before} precedes ${after}`);
}

{
  const h = createHarness({ failRevealCover: true });
  assert.equal((await h.runtime.warm(Promise.resolve())).revealPrimed, false,
    'a failed re-cover cannot certify reveal; the loading owner must retry under its existing cover');
  assert.match(globalThis.__BATTLE_COUNTDOWN_WARM.error, /reveal cover failed/);
  assert.equal(globalThis.__BATTLE_COUNTDOWN_WARM.doneBeforeRollout, false);
  assert.ok(h.calls.findIndex(([name]) => name === 'watchdogSettled')
    < h.calls.findIndex(([name]) => name === 'reveal'));
  h.disposeWarmResources();
}

for (const failPost of [false, true]) for (const watchdog of ['healthy', 'black', 'unrestorable', 'throw']) {
  const h = createHarness({ failPost, watchdog, pauseWatchdog: true });
  const pending = h.runtime.warm(Promise.resolve());
  const observed = pending.then(value => ({ value }), error => ({ error }));
  for (let index = 0; index < 100 && !h.calls.some(([name]) => name === 'watchdog'); index++) await Promise.resolve();
  assert.equal(h.calls.filter(([name]) => name === 'watchdog').length, 1, 'exactly one required check even after optional warm failure');
  assert.ok(!h.calls.some(([name]) => name === 'reveal'), 'pending readback retains the covered reveal barrier');
  h.releaseWatchdog();
  const outcome = await observed;
  if (watchdog === 'healthy') {
    assert.equal(outcome.error, undefined);
    assert.equal(outcome.value.revealPrimed, !failPost, 'optional-warm failure keeps the existing covered reveal retry');
    if (failPost) assert.match(globalThis.__BATTLE_COUNTDOWN_WARM.error, /optional post warm failed/);
  } else {
    assert.match(String(outcome.error), watchdog === 'throw' ? /watchdog readback failed/ : /could not validate/);
    assert.ok(!h.calls.some(([name]) => name === 'reveal'), 'known unhealthy/failing check cannot use optional-warm fallback');
    assert.equal(globalThis.__BATTLE_COUNTDOWN_WARM.doneBeforeRollout, false);
  }
  h.disposeWarmResources();
}

{
  const h = createHarness({ pauseWatchdog: true });
  const pending = h.runtime.warm(Promise.resolve());
  const rejected = assert.rejects(pending, /superseded/);
  for (let index = 0; index < 100 && !h.calls.some(([name]) => name === 'watchdog'); index++) await Promise.resolve();
  h.generation++;
  h.releaseWatchdog();
  await rejected;
  assert.ok(!h.calls.some(([name]) => name === 'reveal' || name === 'watchdogSettled'));
  h.disposeWarmResources();
}
assert.equal(order.includes('enemies'), false,
  'hidden opponents are deferred until the visible deployment countdown');
assert.equal(happyTrace.done, true);
assert.equal(happyTrace.doneBeforeRollout, true);
assert.equal(happyTrace.enemyVisualsDeferred, true);
assert.equal(happyTrace.deploymentUniformsDeferred, true);
assert.equal(happyOpeningWarm.covered, true);
assert.equal(happyTrace.deploymentProgramSubmission.submissionSlices, 3);
for (let index = 0; index < happy.calls.length; index++) {
  if (happy.calls[index][0] === 'compileSlice') {
    assert.deepEqual(happy.calls[index + 1], ['yield', true], 'every submission slice releases its task');
  }
}
assert.ok(order.indexOf('compileClosed') < order.indexOf('warmRender'));
assert.deepEqual(happy.calls[order.indexOf('compileClosed') + 1], ['yield', true],
  'final submission releases its task before the first native forward bind');
assert.deepEqual(happy.lightSignatures, [[0, 0], [0, 0]], 'day constructs no night light pool');
assert.equal(happy.lamps.current, null);

const shortCompile = createHarness({ compileSlices: 0 });
await shortCompile.runtime.warm(Promise.resolve());
const shortOrder = shortCompile.calls.map(([name]) => name);
assert.deepEqual(shortCompile.calls[shortOrder.indexOf('compileClosed') + 1], ['yield', true],
  'a short compiler with no checkpoints still separates submission from first bind');

for (const terrainPrograms of ['complete', 'incomplete', 'throw', 'cancel', 'late-cancel', 'detach']) {
  const harness = createHarness({ terrainPrograms });
  try {
    if (['cancel', 'late-cancel', 'detach'].includes(terrainPrograms)) {
      await assert.rejects(harness.runtime.warm(Promise.resolve()), /superseded/);
      assert.ok(!harness.calls.some(([name]) =>
        ['terrainProgramsResumed', 'warmRender', 'postWarm', 'reveal'].includes(name)),
      `${terrainPrograms}: stale root work cannot resume or reveal`);
    } else {
      assert.equal((await harness.runtime.warm(Promise.resolve())).revealPrimed, true);
      const names = harness.calls.map(([name]) => name);
      assert.ok(names.indexOf('shadowWarm') < names.indexOf('terrainPrograms'));
      assert.ok(names.indexOf('terrainProgramsClosed') < names.indexOf('warmRender'));
      assert.deepEqual(harness.calls[names.indexOf('terrainProgramsClosed') + 1], ['yield', true],
        'native reflection releases its task before first covered terrain draw');
      const receipt = globalThis.__BATTLE_COUNTDOWN_WARM.deploymentTerrainPrograms;
      assert.equal(receipt.result.status, terrainPrograms === 'complete' ? 'complete' : 'incomplete');
      if (terrainPrograms === 'throw') assert.match(receipt.error, /native reflection failed/);
      if (terrainPrograms === 'incomplete') assert.deepEqual(receipt.result,
        { status: 'incomplete', pending: 2, reason: 'query' }, 'never convert incomplete preparation into success');
    }
    assert.equal(harness.calls.filter(([name]) => name === 'terrainProgramsClosed').length, 1,
      'all paths close the terrain preparation iterator exactly once');
  } finally { harness.disposeWarmResources(); }
}
// Native readiness advances on rendering opportunities, not arbitrary task
// count. Replacing this checkpoint with the ordinary forced yielder consumes
// all 1,024 attempts and leaves the receipt incomplete in this regression.
const pendingPrograms = createHarness({ terrainPrograms: 'pending-frames', vegetationPrograms: 'complete' });
try {
  await pendingPrograms.runtime.warm(Promise.resolve());
  const names = pendingPrograms.calls.map(([name]) => name);
  assert.equal(names.filter(name => name === 'programFrame').length, 4);
  assert.deepEqual(globalThis.__BATTLE_COUNTDOWN_WARM.deploymentTerrainPrograms.result,
    { status: 'complete', pending: 0 });
  assert.deepEqual(globalThis.__BATTLE_COUNTDOWN_WARM.deploymentVegetationPrograms.result,
    { status: 'complete', pending: 0 });
  assert.ok(names.indexOf('terrainProgramsClosed') < names.indexOf('vegetationPrograms'));
  assert.ok(names.indexOf('vegetationProgramsClosed') < names.indexOf('warmRender'));
} finally { pendingPrograms.disposeWarmResources(); }
for (const vegetationPrograms of ['hidden', 'incomplete', 'detach']) {
  const harness = createHarness({ vegetationPrograms });
  try {
    if (vegetationPrograms === 'detach') {
      await assert.rejects(harness.runtime.warm(Promise.resolve()), /superseded/);
      assert.ok(!harness.calls.some(([name]) => ['warmRender', 'reveal'].includes(name)));
    } else {
      await harness.runtime.warm(Promise.resolve());
      const receipt = globalThis.__BATTLE_COUNTDOWN_WARM.deploymentVegetationPrograms;
      if (vegetationPrograms === 'hidden') assert.equal(receipt, undefined);
      else assert.deepEqual(receipt.result, { status: 'incomplete', pending: 2, reason: 'query' });
    }
  } finally { harness.disposeWarmResources(); }
}
const staleCompile = createHarness({ cancelCompile: true });
await assert.rejects(staleCompile.runtime.warm(Promise.resolve()), /superseded/);
for (const restored of ['compileClosed', 'restoreFx', 'restoreArmor']) {
  assert.equal(staleCompile.calls.filter(([name]) => name === restored).length, 1,
    `cancellation closes ${restored} exactly once`);
}
assert.ok(!staleCompile.calls.some(([name]) => ['compileComplete', 'warmRender', 'shadowWarm', 'reveal'].includes(name)),
  'a stale compile cannot bind, shadow-warm, or reveal');
for (const lateCancelCompile of ['slice', 'final']) {
  const late = createHarness({ lateCancelCompile });
  await assert.rejects(late.runtime.warm(Promise.resolve()), /superseded/);
  assert.ok(!late.calls.some(([name]) => ['warmRender', 'shadowWarm', 'reveal'].includes(name)),
    `late ${lateCancelCompile} cancellation cannot bind or reveal`);
  assert.equal(late.calls.filter(([name]) => name === 'compileClosed').length, 1);
  assert.equal(late.calls.filter(([name]) => name === 'restoreFx').length, 1);
  assert.equal(late.calls.filter(([name]) => name === 'restoreArmor').length, 1);
  if (lateCancelCompile === 'slice') {
    assert.equal(late.calls.filter(([name]) => name === 'compileSlice').length, 1,
      'late cancellation cannot admit another compiler batch');
  }
}

for (const option of ['cancelCover', 'failCover']) {
  const harness = createHarness({ [option]: true });
  await assert.rejects(harness.runtime.warm(Promise.resolve()),
    option === 'failCover' ? /ground cover failed/ : /superseded/);
  assert.ok(!harness.calls.some(([name]) => name === 'reveal' || name === 'shadowWarm'));
}

for (const lateCancelWarm of ['cover', 'fx', 'forward']) {
  const harness = createHarness({ lateCancelWarm });
  try {
    await assert.rejects(harness.runtime.warm(Promise.resolve()), /superseded/);
    const count = name => harness.calls.filter(([event]) => event === name).length;
    assert.equal(count('reveal'), 0, `${lateCancelWarm}: stale work cannot reveal`);
    assert.equal(count('postWarm'), 0, `${lateCancelWarm}: stale work cannot enter post warm`);
    if (lateCancelWarm === 'cover') {
      assert.equal(count('groundCoverUpdate'), 1, 'actual terrain producer stops at its outer generation boundary');
      assert.equal(count('groundCoverState'), 0, 'no readiness read after supersession');
      assert.equal(count('armorWarm'), 0, 'incomplete terrain never enters optional shader fallback');
    } else {
      assert.equal(count('warmRender'), 1, `${lateCancelWarm}: IteratorClose prevents another cohort render`);
      assert.equal(count('restoreFx'), 1);
      assert.equal(count('restoreArmor'), 1);
      assert.equal(harness.worldGroup.visible, true, 'world visibility restored');
      assert.equal(harness.playerRoot.visible, true, 'player visibility restored');
      assert.equal(harness.fxGroup.visible, false, 'private FX visibility restored');
      assert.ok(harness.fxGroup.children.every(child => child.visible), 'hidden cohort siblings restored');
      assert.deepEqual(harness.shadow, { autoUpdate: true, needsUpdate: true }, 'iterator finalizer restores CSM flags');
      if (lateCancelWarm === 'fx') assert.equal(count('shadowWarm'), 0, 'cancelled FX cannot advance to shadows');
    }
  } finally { harness.disposeWarmResources(); }
}

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
await assert.rejects(failedNight.runtime.warm(Promise.resolve()), /night lighting failed/);
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
await assert.rejects(pendingNight, /superseded/);
assert.equal(cancelledNight.calls.some(([name]) => ['allies', 'compile', 'reveal'].includes(name)), false);
cancelledNight.lamps.dispose();

const cancelled = createHarness();
let releaseCamo;
const camo = new Promise((resolve) => { releaseCamo = resolve; });
const cancelledWarm = cancelled.runtime.warm(camo);
cancelled.generation = 2;
releaseCamo();
await assert.rejects(cancelledWarm, /superseded/);
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
await assert.rejects(pendingAtmosphere, /superseded/);
assert.equal(cancelledAtmosphere.calls.some(([name]) => ['allies', 'compile', 'reveal'].includes(name)), false,
  'cancellation during atmosphere cannot compile or reveal an obsolete battle');

const failedAtmosphere = createHarness({ failAtmosphere: true });
await assert.rejects(failedAtmosphere.runtime.warm(Promise.resolve()), /atmosphere failed/);
assert.match(globalThis.__BATTLE_COUNTDOWN_WARM.error, /atmosphere failed/);
assert.equal(failedAtmosphere.calls.some(([name]) => ['compile', 'reveal'].includes(name)), false,
  'failed atmosphere preparation cannot be reported as a primed deployment');

const failed = createHarness({ failAllies: true });
await assert.rejects(failed.runtime.warm(Promise.resolve()), /allied warm failed/);
assert.match(globalThis.__BATTLE_COUNTDOWN_WARM.error, /allied warm failed/);
happy.generation++;
assert.throws(result.assertRevealReady, /superseded/, 'a returned receipt cannot outlive its generation');

delete globalThis.__BATTLE_COUNTDOWN_WARM;
delete globalThis.__COMBAT_OPENING_WARM;
console.log('soloBattleDeploymentRuntime.selftest: exact day/night light signatures, late actors, order, cancellation and fallback pass');
