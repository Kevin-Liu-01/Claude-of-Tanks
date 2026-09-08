import assert from 'node:assert/strict';
import * as THREE from 'three';

globalThis.window = { __GL_DIAG: { errors: [] } };
const { runSceneBlackWatchdog } = await import('./deviceDiag.ts');

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
    },
    readRenderTargetPixels(value, x, y, width, height, pixels) {
      readbacks++;
      assert.equal(value, target.value, 'read the bound probe target');
      assert.deepEqual([x, y, width, height], [0, 0, 64, 22]);
      assert.equal(pixels.length, 64 * 22 * 4);
      maybeThrow('readback', renders);
      assert.ok(renders <= samples.length, 'the ladder must not add undocumented measurements');
      const sample = samples[renders - 1];
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

assert.equal(failures.length, 0,
  `${failures.length} watchdog cases failed: ${failures.map(({ name }) => name).join('; ')}`);
console.log(`sceneBlackWatchdog.selftest: ${passed} threshold, rescue and ownership cases passed`);
