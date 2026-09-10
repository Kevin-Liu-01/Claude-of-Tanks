import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createBus } from '../game/stateCore.ts';

globalThis.window = { __GL_DIAG: { errors: [] } };
const { runSceneBlackWatchdog, scheduleSceneWatchdog, runSceneWatchdogNow } = await import('./deviceDiag.ts');

const failures = [];
let passed = 0;
function test(name, run) {
  try {
    run();
    passed++;
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL sceneBlackWatchdog: ${name}: ${error.message.split('\n')[0]}`);
  }
}

function fixture(samples, { shadows = true, environment = true, fog = true, fault = null } = {}) {
  const originalTarget = { name: 'caller-target' };
  const originalEnvironment = environment ? new THREE.Texture() : null;
  const originalFog = fog ? new THREE.Fog(0xffffff, 1, 100) : null;
  const scene = new THREE.Scene();
  scene.environment = originalEnvironment;
  scene.fog = originalFog;
  const geometry = new THREE.BoxGeometry();
  const materials = [new THREE.MeshStandardMaterial(), new THREE.MeshBasicMaterial()];
  scene.add(new THREE.Mesh(geometry, materials));
  const camera = new THREE.PerspectiveCamera();
  let sourceDisposals = 0;
  for (const resource of [geometry, ...materials, originalEnvironment].filter(Boolean)) {
    resource.addEventListener('dispose', () => { sourceDisposals++; });
  }
  const target = { value: originalTarget, face: 3, mip: 2 };
  const targets = new Set();
  const draws = [];
  const updates = [];
  let targetDisposals = 0;
  let readbacks = 0;
  let renders = 0;
  let clears = 0;
  let faultUsed = false;
  let renderedSample;
  const snapshot = () => ({
    shadows: renderer.shadowMap.enabled,
    environment: scene.environment,
    fog: scene.fog,
  });
  function maybeThrow(at, measurement) {
    if (!faultUsed && fault?.at === at && fault.measurement === measurement) {
      faultUsed = true;
      throw fault.error;
    }
  }
  const renderer = {
    shadowMap: { enabled: shadows },
    info: { programs: [] },
    getRenderTarget: () => target.value,
    getActiveCubeFace: () => target.face,
    getActiveMipmapLevel: () => target.mip,
    setRenderTarget(value, face = 0, mip = 0) {
      if (value !== originalTarget) {
        if (!targets.has(value)) {
          targets.add(value);
          value.addEventListener('dispose', () => { targetDisposals++; });
        }
        maybeThrow('target', renders + 1);
      }
      target.value = value;
      target.face = face;
      target.mip = mip;
    },
    clear() {
      clears++;
      maybeThrow('clear', renders + 1);
    },
    render(renderScene, renderCamera) {
      assert.equal(renderScene, scene, 'measure the actual caller scene');
      assert.equal(renderCamera, camera, 'measure the actual caller camera');
      renders++;
      draws.push(snapshot());
      maybeThrow('render', renders);
      renderedSample = typeof samples[renders - 1] === 'function'
        ? samples[renders - 1](scene) : samples[renders - 1];
    },
    readRenderTargetPixels(value, x, y, width, height, pixels) {
      readbacks++;
      assert.equal(value, target.value, 'read the bound probe target');
      assert.deepEqual([x, y, width, height], [0, 0, 64, 22]);
      assert.equal(pixels.length, 64 * 22 * 4);
      maybeThrow('readback', renders);
      assert.ok(renders <= samples.length, 'the ladder must not add undocumented measurements');
      const sample = renderedSample;
      const [red, green, blue, alpha] = Array.isArray(sample) ? sample : [sample, sample, sample, 255];
      for (let index = 0; index < pixels.length; index += 4) {
        pixels[index] = red;
        pixels[index + 1] = green;
        pixels[index + 2] = blue;
        pixels[index + 3] = alpha;
      }
    },
  };
  const needsUpdate = Object.getOwnPropertyDescriptor(THREE.Material.prototype, 'needsUpdate').set;
  for (const material of materials) {
    Object.defineProperty(material, 'needsUpdate', {
      set(value) {
        needsUpdate.call(this, value);
        if (material === materials[0] && value) updates.push(snapshot());
      },
    });
  }
  const initial = { shadows, environment: originalEnvironment, fog: originalFog };
  const bag = window.__GL_DIAG = { errors: [] };
  return {
    renderer, scene, camera, initial, snapshot, draws, updates, bag,
    run(options) { return runSceneBlackWatchdog(renderer, scene, camera, options); },
    assertReleased(expectedDraws) {
      assert.equal(renders, expectedDraws);
      assert.equal(target.value, originalTarget, 'restore the caller target');
      assert.equal(target.face, 3, 'restore the caller cube face');
      assert.equal(target.mip, 2, 'restore the caller mip level');
      assert.equal(targets.size, 1, 'one target is reused for the entire transaction');
      assert.equal(targetDisposals, 1, 'dispose the owned target exactly once');
      assert.equal(sourceDisposals, 0, 'never dispose caller geometry, materials or environment');
      const [probe] = targets;
      assert.equal(probe.width, 64);
      assert.equal(probe.height, 36);
      assert.equal(probe.depthBuffer, true);
      assert.equal(probe.texture.format, THREE.RGBAFormat);
      assert.equal(probe.texture.type, THREE.UnsignedByteType);
      assert.equal(probe.texture.colorSpace, THREE.NoColorSpace);
      assert.ok(clears >= renders);
      assert.ok(readbacks <= renders);
    },
  };
}

const healthy = (before) => ({ before, after: null, rescued: false, stage: null });
const rescued = (stage, after = 18) => ({ before: 0, after, rescued: true, stage });

for (const sample of [6, 255, [0, 0, 18, 0]]) {
  test(`healthy threshold and alpha independence: ${JSON.stringify(sample)}`, () => {
    const f = fixture([sample]);
    assert.deepEqual(f.run(), healthy(Array.isArray(sample) ? 6 : sample),
      'default result has no opt-in diagnostic fields');
    assert.deepEqual(f.snapshot(), f.initial);
    assert.equal(f.updates.length, 0, 'healthy probes do not invalidate materials');
    f.assertReleased(1);
  });
}

test('just below threshold enters the ladder', () => {
  const f = fixture([[17, 0, 0, 255], 18]);
  assert.deepEqual(f.run(), { ...rescued('shadows-off'), before: 17 / 3 });
  assert.deepEqual(f.snapshot(), { ...f.initial, shadows: false });
  f.assertReleased(2);
});

for (const [stage, samples, expectedDraws] of [
  ['shadows-off', [0, 18], 2],
  ['environment-off', [0, 0, 18, 9], 4],
  ['fog-off', [0, 0, 0, 18, 9], 5],
]) {
  test(`${stage} rescue retains only the confirmed required stage`, () => {
    const f = fixture(samples);
    const calls = [];
    const result = f.run({ onRescue: (value) => calls.push(value) });
    assert.deepEqual(result, rescued(stage), 'after reports the successful pre-confirm measurement');
    assert.equal(calls.length, 1);
    assert.equal(calls[0], result, 'callback receives the completed result object');
    assert.deepEqual(f.snapshot(), {
      shadows: stage === 'shadows-off' ? false : f.initial.shadows,
      environment: stage === 'environment-off' ? null : f.initial.environment,
      fog: stage === 'fog-off' ? null : f.initial.fog,
    });
    assert.match(f.bag.rescue, new RegExp(stage));
    f.assertReleased(expectedDraws);
  });
}

for (const [stage, samples] of [
  ['environment-off', [0, 0, 18, 0]],
  ['fog-off', [0, 0, 0, 18, 0]],
]) {
  test(`${stage} rescue reapplies prior stages when confirmation becomes black`, () => {
    const f = fixture(samples);
    assert.deepEqual(f.run(), rescued(stage));
    assert.deepEqual(f.snapshot(), {
      shadows: false, environment: null, fog: stage === 'fog-off' ? null : f.initial.fog,
    });
    assert.ok(f.bag.errors.some((message) => message.includes('keeping all stages')));
    f.assertReleased(samples.length);
  });
}

test('disabled stages are skipped without an extra confirmation', () => {
  const f = fixture([0, 18], { shadows: false, environment: false });
  assert.deepEqual(f.run(), rescued('fog-off'));
  assert.deepEqual(f.snapshot(), { shadows: false, environment: null, fog: null });
  f.assertReleased(2);
});

test('no eligible stage preserves the initial black result', () => {
  const f = fixture([0], { shadows: false, environment: false, fog: false });
  assert.deepEqual(f.run(), healthy(0));
  assert.deepEqual(f.snapshot(), f.initial);
  assert.equal(f.updates.length, 0);
  f.assertReleased(1);
});

test('all-black ladder rolls back stages in reverse order', () => {
  const f = fixture([0, 0, 0, 0]);
  let callbackCount = 0;
  assert.deepEqual(f.run({ onRescue: () => { callbackCount++; } }), healthy(0));
  assert.equal(callbackCount, 0);
  assert.deepEqual(f.snapshot(), f.initial);
  assert.deepEqual(f.updates.slice(-3), [
    { shadows: false, environment: null, fog: f.initial.fog },
    { shadows: false, environment: f.initial.environment, fog: f.initial.fog },
    f.initial,
  ]);
  f.assertReleased(4);
});

for (const at of ['target', 'clear', 'render', 'readback']) {
  test(`initial ${at} failure is nonfatal and restores renderer/resource ownership`, () => {
    const error = new Error(`initial ${at} failed`);
    const f = fixture([0], { fault: { at, measurement: 1, error } });
    assert.deepEqual(f.run(), healthy(0));
    assert.deepEqual(f.snapshot(), f.initial);
    assert.ok(f.bag.errors.some((message) => message.includes(error.message)));
    f.assertReleased(at === 'target' || at === 'clear' ? 0 : 1);
  });
}

for (const at of ['render', 'readback']) {
  for (const measurement of [2, 3, 4, 5]) {
    test(`${at} failure at rescue/confirmation measurement ${measurement} rolls back tentative changes`, () => {
      const error = new Error(`measurement ${measurement} ${at} failed`);
      const samples = measurement === 5 ? [0, 0, 0, 18, 9] : [0, 0, 0, 0];
      const f = fixture(samples, { fault: { at, measurement, error } });
      let callbackCount = 0;
      assert.deepEqual(f.run({ onRescue: () => { callbackCount++; } }), healthy(0));
      assert.equal(callbackCount, 0, 'failed measurement is never published as a confirmed rescue');
      assert.ok(f.bag.errors.some((message) => message.includes(error.message)));
      f.assertReleased(measurement);
      assert.deepEqual(f.snapshot(), f.initial,
        'a failed diagnostic must not leave an unconfirmed quality downgrade active');
    });
  }
}

test('callback failure after confirmed rescue retains the working compatibility choice', () => {
  const f = fixture([0, 0, 18, 9]);
  const result = f.run({ onRescue: () => { throw new Error('consumer callback failed'); } });
  assert.deepEqual(result, rescued('environment-off'));
  assert.deepEqual(f.snapshot(), { ...f.initial, environment: null });
  assert.ok(f.bag.errors.some((message) => message.includes('consumer callback failed')));
  f.assertReleased(4);
});

function nightInputs(f) {
  const ambient = new THREE.AmbientLight(0x778899, .46);
  const hemi = new THREE.HemisphereLight(0x667788, 0x334455, .2);
  const sun = new THREE.DirectionalLight(0xa6bce8, .42);
  const headlamp = new THREE.SpotLight(0xffffff, 17);
  const localLight = new THREE.PointLight(0xffffff, 8);
  f.scene.add(ambient, hemi, sun, headlamp, localLight);
  f.scene.environmentIntensity = .85;
  f.scene.background = new THREE.Color(.01, .02, .03);
  const background = f.scene.background.clone();
  const material = f.scene.children[0].material[0];
  material.emissive.setRGB(.1, .2, .3);
  const emissive = material.emissive.clone(), materialVersion = material.version;
  return { ambient, assertRestored() {
    assert.deepEqual([ambient.intensity, hemi.intensity, sun.intensity, headlamp.intensity, localLight.intensity],
      [.46, .2, .42, 17, 8]);
    assert.equal(f.scene.environmentIntensity, .85);
    assert.deepEqual(f.scene.background, background);
    assert.deepEqual(material.emissive, emissive);
  }, assertDiagnostic() {
    assert.deepEqual([ambient.intensity, hemi.intensity, sun.intensity], [.46 / .05, .2 / .05, .42 / .05]);
    assert.equal(f.scene.environmentIntensity, .85 / .05);
    assert.deepEqual([headlamp.intensity, localLight.intensity], [17, 8], 'local lamps cannot certify the broad lit pipeline');
    assert.deepEqual(f.scene.background, background, 'background is never brightened into passing');
    assert.deepEqual(material.emissive, emissive, 'emissives cannot certify the lit pipeline');
    assert.equal(material.version, materialVersion, 'radiance uniforms do not create new shader variants');
  } };
}

test('explicit night uses authored radiance on existing lit inputs, not a lower black threshold', () => {
  let lights;
  const f = fixture([() => { lights.assertDiagnostic(); return 18; }]);
  lights = nightInputs(f);
  assert.deepEqual(f.run({ nightRadianceScale: .05 }), { ...healthy(18), nightRadianceScale: .05 });
  lights.assertRestored();
  assert.equal(f.updates.length, 0, 'healthy night does not enter the invalidate/recompile ladder');
  assert.equal(f.bag.rescue, undefined);
  assert.deepEqual(f.bag.errors, []);
  f.assertReleased(1);
});

for (const sample of [0, 3]) test(`night black shader/unlit-only band ${sample} still fails the complete ladder`, () => {
  const f = fixture([sample, sample, sample, sample]);
  const lights = nightInputs(f);
  f.bag.errors.push('existing shader link failure receipt');
  assert.deepEqual(f.run({ nightRadianceScale: .05 }), { ...healthy(sample), nightRadianceScale: .05 });
  assert.equal(f.bag.rescue, undefined);
  assert.equal(f.bag.errors[0], 'existing shader link failure receipt', 'prior graphics evidence is never discarded');
  assert.ok(f.bag.errors.some(message => message.includes('no ladder stage cured it')));
  lights.assertRestored();
  assert.deepEqual(f.snapshot(), f.initial);
  f.assertReleased(4);
});

test('genuine night shadow failure retains the original confirmed compatibility rescue', () => {
  const f = fixture([0, 18]);
  const lights = nightInputs(f);
  assert.deepEqual(f.run({ nightRadianceScale: .05 }), { ...rescued('shadows-off'), nightRadianceScale: .05 });
  lights.assertRestored();
  assert.equal(f.renderer.shadowMap.enabled, false);
  f.assertReleased(2);
});

for (const scale of [0, -1, NaN, Infinity, 1.1]) test(`invalid night scale ${scale} fails without touching authored radiance`, () => {
  const f = fixture([]), lights = nightInputs(f);
  const result = f.run({ nightRadianceScale: scale });
  assert.equal(result.before, 0);
  assert.equal(result.rescued, false);
  assert.ok(f.bag.errors.some(message => message.includes('finite authored radiance scale')));
  lights.assertRestored();
  assert.deepEqual(f.snapshot(), f.initial);
  f.assertReleased(0);
});

for (const at of ['render', 'readback']) for (const measurement of [1, 2]) test(`night ${at} ${measurement} failure restores all authored radiance`, () => {
  const f = fixture([0, 0], { fault: { at, measurement, error: new Error(`night ${at} failure`) } });
  const lights = nightInputs(f);
  const result = f.run({ nightRadianceScale: .05 });
  assert.equal(result.rescued, false);
  lights.assertRestored();
  assert.ok(f.bag.errors.some(message => message.includes(`night ${at} failure`)));
  f.assertReleased(measurement);
});

test('queued diagnostics obey the exact production phase/world/entry guards', () => {
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  const battleExpression = main.match(/const isCurrentBattleWatchdog = \(\) => ([\s\S]+?);\n/)[1];
  const garageExpression = main.match(/const isCurrentGarage = \(\) => ([\s\S]+?);\n/)[1];
  const world = {}, other = {};
  let phase = 'battle', current = world, epoch = 1, pending = false, studioActive = false, callbacks = [], runs = 0;
  const battleGuard = new Function('game', 'currentWorld', 'requestedWorld', 'sceneWatchdogEntryGeneration',
    'entryGeneration', 'studio', `return ${battleExpression};`);
  const garageGuard = new Function('game', 'battleEntryLifecycle', 'currentWorld', 'garageWatchdogWorld',
    'sceneWatchdogEntryGeneration', 'garageWatchdogGeneration', 'studio', `return ${garageExpression};`);
  const queue = isCurrent => scheduleSceneWatchdog({ delayMs: 1800, isCurrent, run: () => runs++ },
    (callback, delayMs) => { assert.equal(delayMs, 1800); callbacks.push(callback); });
  const isBattle = () => battleGuard({ phase }, () => current, world, epoch, 1, { active: studioActive });
  const isGarage = () => garageGuard({ phase }, { pending }, () => current, world, epoch, 1, { active: studioActive });
  queue(isBattle); callbacks.shift()(); assert.equal(runs, 1, 'current battle retains its diagnostic');
  for (const mutate of [() => { phase = 'garage'; }, () => { current = other; }, () => { epoch = 2; }, () => { studioActive = true; }]) {
    phase = 'battle'; current = world; epoch = 1; studioActive = false;
    queue(isBattle); mutate(); callbacks.shift()(); assert.equal(runs, 1);
  }
  phase = 'garage'; current = world; epoch = 1; studioActive = false;
  queue(isGarage); callbacks.shift()(); assert.equal(runs, 2, 'stable Garage retains watchdog/reclaim');
  for (const mutate of [() => { phase = 'battle'; }, () => { pending = true; },
    () => { current = other; }, () => { epoch = 2; }, () => { studioActive = true; }]) {
    phase = 'garage'; current = world; epoch = 1; pending = false; studioActive = false;
    queue(isGarage); mutate(); callbacks.shift()(); assert.equal(runs, 2);
  }
  assert.match(main, /battleWatchdogRadianceScale = preset\.skyIntensity \?\? 1/);
  const optionsBody = main.match(/function currentSceneWatchdogOptions\(\) \{([\s\S]+?)\n\}/)[1];
  const options = new Function('game', 'battleAtmosphere', 'battleWatchdogRadianceScale', optionsBody);
  assert.deepEqual(options({ phase: 'battle' }, { current: { weather: { timeOfDay: 'night' } } }, .05), { nightRadianceScale: .05 });
  assert.deepEqual(options({ phase: 'battle' }, { current: { weather: { timeOfDay: 'day' } } }, .05), {});
  assert.deepEqual(options({ phase: 'garage' }, { current: { weather: { timeOfDay: 'night' } } }, .05), {});
  assert.match(main, /signal, measureTimings: true, \.\.\.currentSceneWatchdogOptions\(\)/);
});

test('real intent, Garage teardown and network activation invalidate old same-world timers', () => {
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  const bodies = [
    main.match(/bus\.on\('ui:battleStart', \(\) => \{([\s\S]*?)\n\}\);/)[1],
    main.match(/invalidate: \(\) => \{ (battleWarmGeneration \+= 1;[^}]+)\}/)[1],
    main.match(/setNetworkSpectator: \(value: boolean\) => \{([\s\S]*?)\n\s+\},/)[1],
  ];
  for (const body of bodies) {
    const invoke = new Function('value', `let sceneWatchdogEntryGeneration = 1, battleWarmGeneration = 1, coveredBattleWatchdog = () => {};
      const playSurface = { hideForBattle() {} }, networkSession = { setSpectator() {} };
      ${body}
      return sceneWatchdogEntryGeneration;`);
    assert.equal(invoke(true), 2, 'deleting an actual adapter invalidation must fail even when the generic guard is intact');
  }
});

for (const kind of ['sync', 'async', 'schedule', 'reporter']) {
  const errors = [], callbacks = [];
  const cause = new Error(`watchdog ${kind} failure`);
  const completion = scheduleSceneWatchdog({ delayMs: 1800, isCurrent: () => true,
    run: () => {
      if (kind === 'sync') throw cause;
      return Promise.reject(cause);
    },
    onError: error => { errors.push(error); if (kind === 'reporter') throw new Error('reporter failed'); },
  }, callback => { if (kind === 'schedule') throw cause; callbacks.push(callback); });
  callbacks.shift()?.();
  await completion;
  assert.deepEqual(errors, [cause], `${kind}: rejected diagnostic is observed without detaching a promise`);
  passed++;
}

{
  let current = true, release;
  const callbacks = [], calls = [], errors = [];
  const completion = scheduleSceneWatchdog({ delayMs: 1, isCurrent: () => current,
    run: () => { calls.push('submitted'); return new Promise((_resolve, reject) => { release = reject; }); },
    onError: error => errors.push(error),
  }, callback => callbacks.push(callback));
  callbacks.shift()();
  assert.deepEqual(calls, ['submitted'], 'current-owner probe submits synchronously at the timer guard');
  current = false;
  release(new Error('owner changed while draining'));
  await completion;
  assert.deepEqual(errors, [], 'stale cancellation is observed without reporting a new scene failure');
  passed++;
}

{
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  assert.match(main, /diagnosticContext: \{ phase: 'battle', entryGeneration, mapId: requestedWorld\?\.mapId \?\? null \}/);
  assert.match(main, /run: onMeasurements => runSceneBlackWatchdogAsync\(renderer, scene, camera, \{\s*\.\.\.currentSceneWatchdogOptions\(\), isCurrent: isCurrentBattleWatchdog, measureTimings: true, onMeasurements/);
  assert.match(main, /diagnosticContext: \{ phase: 'garage', entryGeneration: garageWatchdogGeneration, mapId: garageWatchdogWorld\?\.mapId \?\? null \}/);
  assert.match(main, /const garageWatchdogSettled = scheduleSceneWatchdog\([\s\S]+?runSceneBlackWatchdogAsync\(renderer, scene, camera, \{\s*isCurrent: isCurrentGarage, measureTimings: true, onMeasurements/);
  assert.doesNotMatch(main, /runSceneBlackWatchdog\(/, 'ordinary delayed main watchdogs cannot synchronously readPixels');
  const reclaimBody = main.match(/delayMs: 3400, isCurrent: isCurrentGarage,\s*run: async \(\) => \{([\s\S]*?)\n\s+\},/)[1];
  const runReclaim = new Function('garageWatchdogSettled', 'isCurrentGarage', 'reclaimShadows', 'renderer', 'scene', 'camera',
    `return (async () => { ${reclaimBody} })();`);
  for (const stillCurrent of [true, false]) {
    let resolveWatchdog, reclaimed = 0, current = true;
    const watchdog = new Promise(resolve => { resolveWatchdog = resolve; });
    const pending = runReclaim(watchdog, () => current, () => reclaimed++, {}, {}, {});
    assert.equal(reclaimed, 0, '3400 ms reclaim cannot overlap a pending Garage readback');
    current = stillCurrent; resolveWatchdog(); await pending;
    assert.equal(reclaimed, Number(stillCurrent), 'reclaim rechecks its actual adapter owner after the drain');
  }
  passed++;
}

{
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  const armBody = main.match(/scheduleBlackWatchdog: \(covered: boolean\) => \{([\s\S]+?)\n      \},\n    \},/)[1]
    .replace(": Omit<Parameters<typeof scheduleSceneWatchdog>[0], 'delayMs'>", '');
  const consumeBody = main.match(/runSceneWatchdog: async \(assertCurrent: \(\) => void\) => \{([\s\S]+?)\n    \},/)[1];
  const invalidateBody = main.match(/bus\.on\('ui:battleStart', \(\) => \{([\s\S]*?)\n\}\);/)[1];
  const timers = [], draws = [];
  const nav = { webdriver: false }, game = { phase: 'battle' }, world = { mapId: 'urban' };
  const create = new Function('navigator', 'game', 'currentWorld', 'runSceneWatchdogNow',
    'scheduleSceneWatchdog', 'runSceneBlackWatchdogAsync', `
      let sceneWatchdogEntryGeneration = 0, coveredBattleWatchdog = null;
      const studio = { active: false }, renderer = {}, scene = {}, camera = {}, playSurface = { hideForBattle() {} };
      const currentSceneWatchdogOptions = () => ({});
      return { arm: covered => { ${armBody} }, consume: async assertCurrent => { ${consumeBody} },
        pending: () => coveredBattleWatchdog, invalidate: () => { ${invalidateBody} } };
    `);
  const h = create(nav, game, () => world, runSceneWatchdogNow,
    options => timers.push(options), async (_renderer, _scene, _camera, options) => {
      assert.equal(options.isCurrent(), true); draws.push(options);
      return { before: 18, after: null, rescued: false, stage: null };
    });
  h.arm(true);
  assert.equal(timers.length, 0, 'actual held-entry adapter never also queues the legacy timer');
  assert.equal(draws.length, 0, 'arming never draws an incomplete deployment');
  const obsolete = h.pending();
  h.arm(true);
  await assert.rejects(obsolete(), /owner changed/, 'a same-world superseded request cannot draw');
  assert.equal(draws.length, 0);
  await h.consume(() => {});
  assert.equal(draws.length, 1);
  assert.equal(draws[0].measureTimings, true);
  assert.equal(h.pending(), null);
  await assert.rejects(h.consume(() => {}), /was not armed/, 'covered request is consumed once');
  h.arm(false);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delayMs, 1800, 'legacy direct/no-cover path retains its original delay');
  assert.equal(h.pending(), null);
  nav.webdriver = true;
  h.arm(true);
  await h.consume(() => {});
  assert.equal(draws.length, 1, 'webdriver keeps its explicit existing opt-out');
  nav.webdriver = false;
  const garage = readFileSync(new URL('../ui/garage.ts', import.meta.url), 'utf8');
  const launchBody = garage.match(/function launchBattle\([\s\S]+?\): void \{([\s\S]+?)\n  \}\n\n  function battle\(/)[1];
  const bus = createBus();
  bus.on('ui:battleStart', h.invalidate);
  const launch = new Function('emit', 'onBattle', `return (specId, mapId) => {
    const emitClick = true, gameMode = 'standard'; ${launchBody}
  };`)(bus.emit, () => h.arm(true));
  launch('m1a1', 'urban');
  assert.equal(typeof h.pending(), 'function', 'actual Garage launch invalidates BEFORE onBattle arms the new request');
  await h.consume(() => {});
  assert.equal(draws.length, 2, 'ui:battleStart cannot clear the newly armed held-entry request');
  passed++;
}

{
  const priorBag = window.__GL_DIAG, priorPerformance = globalThis.performance;
  let now = 10;
  window.__GL_DIAG = { errors: [] };
  globalThis.performance = { now: () => now };
  try {
    const callbacks = [], errors = [];
    const context = { phase: 'battle', entryGeneration: 7, mapId: 'urban' };
    let current = true, release, measurements;
    const completion = scheduleSceneWatchdog({ delayMs: 1800, diagnosticContext: context,
      isCurrent: () => current, onError: error => errors.push(error),
      run: measured => {
        assert.equal(now, 1810, 'publication does not move synchronous submission');
        measurements = [{ kind: 'async', startTime: now, endTime: now + 4,
          renderMs: 13, enqueueMs: 2, readbackSteps: { readPixels: 2 } }];
        return new Promise(resolve => { release = () => {
          measured(measurements);
          resolve({ before: 18, after: null, rescued: false, stage: null, measurements });
        }; });
      },
    }, (callback, delay) => { assert.equal(delay, 1800); callbacks.push(callback); });
    const history = window.__GL_DIAG.sceneWatchdogs;
    assert.equal(history.rows[0].status, 'queued');
    assert.equal(history.rows[0].queuedAtMs, 10);
    context.entryGeneration = 99;
    now = 1810; callbacks.shift()();
    assert.equal(history.rows[0].status, 'running');
    assert.equal(history.rows[0].startedAtMs, 1810);
    assert.equal(history.rows[0].endedAtMs, undefined);
    now = 1814; release(); await completion;
    assert.equal(history.rows[0].status, 'complete');
    assert.equal(history.rows[0].endedAtMs, 1814);
    assert.equal(history.rows[0].context.entryGeneration, 7);
    assert.deepEqual(history.rows[0].measurements, measurements);
    assert.equal(history.rows[0].result.measurements, undefined, 'large rows are not duplicated');
    measurements[0].readbackSteps.readPixels = 999;
    assert.equal(history.rows[0].measurements[0].readbackSteps.readPixels, 2, 'publication is an owned copy');

    for (const outcome of ['skipped', 'cancelled', 'error', 'failed']) {
      current = outcome !== 'skipped';
      const done = scheduleSceneWatchdog({ delayMs: 1, diagnosticContext: context,
        isCurrent: () => current, onError: error => errors.push(error),
        run: measured => {
          assert.notEqual(outcome, 'skipped');
          measured([{ kind: 'async', startTime: now, endTime: now, renderMs: 2 }]);
          if (outcome === 'cancelled') current = false;
          if (outcome === 'failed') return Promise.resolve({ before: 0, after: null, rescued: false, stage: null, failed: true });
          return Promise.reject(new Error(outcome));
        },
      }, callback => callbacks.push(callback));
      callbacks.shift()(); await done;
      assert.equal(history.rows.at(-1).status, outcome);
      assert.equal(history.rows.at(-1).measurements.length, outcome === 'skipped' ? 0 : 1);
    }
    assert.deepEqual(errors.map(error => error.message), ['error'], 'cancellation is not a graphics error');
    for (let index = 0; index < 20; index++) {
      await scheduleSceneWatchdog({ delayMs: 1, diagnosticContext: context, isCurrent: () => false,
        run: () => { throw new Error('stale run'); } }, callback => callback());
    }
    assert.equal(history.rows.length, 16);
    assert.equal(history.rowsDropped, 9);
    for (const diagnosticContext of [undefined, context]) {
      let reads = 0;
      await scheduleSceneWatchdog({ delayMs: 1, diagnosticContext, isCurrent: () => true,
        run: () => Promise.resolve({ get failed() { reads++; throw new Error('result getter failed'); } }),
      }, callback => callback());
      assert.equal(reads, diagnosticContext ? 1 : 0, 'optional result inspection cannot reject or strand completion');
    }
    assert.equal(history.rows.at(-1).captureError, 'watchdog result unavailable');
    Object.freeze(window.__GL_DIAG);
    Object.freeze(history.rows);
    let ran = false;
    await scheduleSceneWatchdog({ delayMs: 1, diagnosticContext: context, isCurrent: () => true,
      run: () => { ran = true; } }, callback => callback());
    assert.equal(ran, true, 'frozen optional publication cannot suppress an actual check');
    passed++;
  } finally {
    window.__GL_DIAG = priorBag;
    globalThis.performance = priorPerformance;
  }
}

assert.equal(failures.length, 0,
  `${failures.length} watchdog cases failed: ${failures.map(({ name }) => name).join('; ')}`);
console.log(`sceneBlackWatchdog.selftest: ${passed} threshold, rescue and ownership cases passed`);
