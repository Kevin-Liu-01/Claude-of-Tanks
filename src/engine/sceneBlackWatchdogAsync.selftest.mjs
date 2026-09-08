import assert from 'node:assert/strict';
import * as THREE from 'three';

globalThis.window = { __GL_DIAG: { errors: [] } };
const { runSceneBlackWatchdogAsync } = await import('./deviceDiag.ts');
const nextTask = () => new Promise((resolve) => setImmediate(resolve));
let passed = 0;

async function microtasks() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

async function test(name, run) {
  const originalTimeout = globalThis.setTimeout;
  const originalPerformance = globalThis.performance;
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  let now = 0;
  const waits = [];
  const clock = {
    waits,
    beforeNow: null,
    advance(ms) { now += ms; },
    async resume(index = 0) {
      const [wait] = waits.splice(index, 1);
      assert.ok(wait, 'an owned poll task is pending');
      now += wait.ms;
      wait.callback();
      await microtasks();
    },
  };
  globalThis.performance = { now: () => { clock.beforeNow?.(); return now; } };
  globalThis.setTimeout = (callback, ms) => {
    const wait = { callback, ms };
    waits.push(wait);
    return wait;
  };
  try {
    await run(clock);
    await nextTask();
    assert.deepEqual(unhandled, [], `${name}: no detached rejection`);
    assert.equal(waits.length, 0, `${name}: no leaked poll tasks`);
    passed++;
  } finally {
    globalThis.setTimeout = originalTimeout;
    globalThis.performance = originalPerformance;
    process.off('unhandledRejection', onUnhandled);
  }
}

function fixture({ asyncSamples = [12], syncSamples = [], shadows = true, environment = true,
  fog = true, failAt = null, restoreThrows = false, preRestoreFailures = 0 } = {}) {
  const events = [];
  const targets = [];
  const buffers = [];
  const syncs = [];
  const originalTarget = { name: 'caller-target' };
  const externalPack = { name: 'caller-pbo' };
  let target = originalTarget;
  let face = 3;
  let mip = 2;
  let pack = externalPack;
  let obsolete = false;
  let obsoleteTouches = 0;
  let sourceDisposals = 0;
  let expectedSourceDisposals = 0;
  let syncReads = 0;
  let failUsed = false;
  let restoreFailed = false;
  const initial = {
    shadows,
    environment: environment ? new THREE.Texture() : null,
    fog: fog ? new THREE.Fog(0xffffff, 1, 100) : null,
  };
  const compatibility = { ...initial };
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(geometry, material));
  for (const resource of [geometry, material]) {
    resource.addEventListener('dispose', () => { sourceDisposals++; });
  }
  const camera = new THREE.PerspectiveCamera();
  const shadowMap = {};
  function assertCurrent(operation) {
    if (obsolete) obsoleteTouches++;
    assert.equal(obsolete, false, `no ${operation} after source cancellation`);
  }
  for (const [owner, key, stateKey] of [
    [scene, 'environment', 'environment'], [scene, 'fog', 'fog'], [shadowMap, 'enabled', 'shadows'],
  ]) {
    Object.defineProperty(owner, key, {
      get() {
        assertCurrent('compatibility access');
        return compatibility[stateKey];
      },
      set(value) {
        assertCurrent('rescue mutation');
        compatibility[stateKey] = value;
      },
    });
  }
  const traverse = scene.traverse;
  scene.traverse = function visit(callback) {
    assertCurrent('scene traversal');
    return traverse.call(this, callback);
  };
  function event(name, ...args) {
    events.push([name, ...args]);
    if (!failUsed && failAt === name) {
      failUsed = true;
      throw new Error(`injected ${name}`);
    }
  }
  function paint(pixels, sample) {
    const rgba = Array.isArray(sample) ? sample : [sample, sample, sample, 255];
    for (let index = 0; index < pixels.length; index += 4) pixels.set(rgba, index);
  }
  const gl = {
    PIXEL_PACK_BUFFER: 35051, PIXEL_PACK_BUFFER_BINDING: 35053,
    STREAM_READ: 35041, BUFFER_SIZE: 34660, RGBA: 6408, UNSIGNED_BYTE: 5121,
    SYNC_GPU_COMMANDS_COMPLETE: 37143,
    ALREADY_SIGNALED: 37146, TIMEOUT_EXPIRED: 37147,
    CONDITION_SATISFIED: 37148, WAIT_FAILED: 37149,
    contextLost: false,
    isContextLost() { return gl.contextLost; },
    createBuffer() {
      event('createBuffer');
      const buffer = { data: null, disposed: 0 };
      buffers.push(buffer);
      return buffer;
    },
    getParameter(key) {
      assert.equal(key, gl.PIXEL_PACK_BUFFER_BINDING);
      return pack;
    },
    bindBuffer(key, buffer) {
      assert.equal(key, gl.PIXEL_PACK_BUFFER);
      event('bindPack', buffer);
      pack = buffer;
    },
    bufferData(key, length, usage) {
      assert.deepEqual([key, usage], [gl.PIXEL_PACK_BUFFER, gl.STREAM_READ]);
      assert.equal(length, 64 * 22 * 4);
      pack.data = new Uint8Array(length);
    },
    getBufferParameter(key, parameter) {
      assert.deepEqual([key, parameter], [gl.PIXEL_PACK_BUFFER, gl.BUFFER_SIZE]);
      return pack.data.length;
    },
    readPixels(x, y, width, height, format, type, offset) {
      assert.deepEqual([x, y, width, height, format, type, offset],
        [0, 0, 64, 22, gl.RGBA, gl.UNSIGNED_BYTE, 0]);
      assert.notEqual(target, originalTarget, 'enqueue while the sampled target is still bound');
      assert.ok(targets.some((owned) => owned.target === target));
      event('enqueue', target);
      assert.ok(buffers.length <= asyncSamples.length, 'each async transaction consumes its own sample');
      paint(pack.data, asyncSamples[buffers.length - 1]);
    },
    fenceSync(condition, flags) {
      assert.deepEqual([condition, flags], [gl.SYNC_GPU_COMMANDS_COMPLETE, 0]);
      event('fence');
      const sync = { status: gl.CONDITION_SATISFIED, disposed: 0 };
      syncs.push(sync);
      return sync;
    },
    flush() { event('flush'); },
    clientWaitSync(sync, flags, timeout) {
      assert.deepEqual([flags, timeout], [0, 0]);
      assert.equal(sync.disposed, 0);
      event('poll');
      return sync.status;
    },
    getBufferSubData(key, offset, pixels, destinationOffset, length) {
      assert.deepEqual([key, offset, destinationOffset, length],
        [gl.PIXEL_PACK_BUFFER, 0, 0, 64 * 22 * 4]);
      assert.equal(pack.disposed, 0);
      event('copy');
      pixels.set(pack.data);
    },
    deleteSync(sync) { sync.disposed++; event('deleteSync'); },
    deleteBuffer(buffer) { buffer.disposed++; event('deleteBuffer'); },
  };
  const renderer = {
    shadowMap,
    info: { programs: [{}, {}] },
    getContext: () => gl,
    getRenderTarget: () => target,
    getActiveCubeFace: () => face,
    getActiveMipmapLevel: () => mip,
    setRenderTarget(next, nextFace = 0, nextMip = 0) {
      if (next === originalTarget && preRestoreFailures > 0) {
        preRestoreFailures--;
        event('rejectRestore');
        throw new Error('injected pre-restore failure');
      }
      if (next !== originalTarget && !targets.some((owned) => owned.target === next)) {
        const owned = { target: next, disposed: 0 };
        targets.push(owned);
        next.addEventListener('dispose', () => {
          owned.disposed++;
          event('disposeTarget', next);
        });
      }
      target = next;
      face = nextFace;
      mip = nextMip;
      event(next === originalTarget ? 'restoreTarget' : 'bindTarget', next);
      if (next === originalTarget && restoreThrows && !restoreFailed) {
        restoreFailed = true;
        throw new Error('injected post-restore failure');
      }
    },
    clear() { event('clear'); },
    render(renderScene, renderCamera) {
      assertCurrent('render');
      assert.equal(renderScene, scene);
      assert.equal(renderCamera, camera);
      event('render', { ...compatibility });
    },
    readRenderTargetPixels(readTarget, x, y, width, height, pixels) {
      assert.equal(readTarget, target);
      assert.deepEqual([x, y, width, height], [0, 0, 64, 22]);
      assert.ok(syncReads < syncSamples.length, 'fallback performs only the expected fresh sync checks');
      event('syncRead');
      paint(pixels, syncSamples[syncReads++]);
    },
  };
  window.__GL_DIAG = { errors: [] };
  return {
    gl, renderer, scene, camera, targets, buffers, syncs, events, initial, compatibility, externalPack,
    run(options) { return runSceneBlackWatchdogAsync(renderer, scene, camera, options); },
    names: () => events.map(([name]) => name),
    pack: () => pack,
    obsolete() {
      geometry.dispose();
      material.dispose();
      expectedSourceDisposals += 2;
      obsolete = true;
    },
    assertRestored() {
      assert.equal(target, originalTarget);
      assert.deepEqual([face, mip], [3, 2]);
    },
    assertReleased(expectedTargets, expectedSyncReads = 0, restored = true) {
      if (restored) this.assertRestored();
      assert.equal(targets.length, expectedTargets);
      for (const owned of targets) {
        assert.equal(owned.disposed, 1, 'owned target disposed exactly once');
        assert.deepEqual([owned.target.width, owned.target.height, owned.target.depthBuffer], [64, 36, true]);
        assert.deepEqual([owned.target.texture.format, owned.target.texture.type, owned.target.texture.colorSpace],
          [THREE.RGBAFormat, THREE.UnsignedByteType, THREE.NoColorSpace]);
      }
      for (const buffer of buffers) assert.equal(buffer.disposed, 1, 'owned PBO disposed exactly once');
      for (const sync of syncs) assert.equal(sync.disposed, 1, 'owned fence disposed exactly once');
      assert.equal(syncReads, expectedSyncReads);
      assert.equal(sourceDisposals, expectedSourceDisposals, 'diagnostic never disposes borrowed source resources');
      assert.equal(obsoleteTouches, 0, 'caught exceptions cannot hide stale source access');
    },
  };
}

const healthy = (before) => ({ before, after: null, rescued: false, stage: null });

await test('healthy submission is synchronous and restores all bindings before the poll task', async (clock) => {
  const f = fixture({ asyncSamples: [[0, 0, 18, 0]] });
  const pending = f.run();
  assert.ok(pending instanceof Promise);
  assert.ok(f.names().includes('enqueue') && f.names().includes('fence') && f.names().includes('flush'));
  assert.ok(!f.names().includes('poll') && !f.names().includes('copy'));
  f.assertRestored();
  assert.equal(f.pack(), f.externalPack);
  assert.equal(clock.waits.length, 1);
  assert.equal(clock.waits[0].ms, 4);
  assert.equal(f.targets[0].disposed, 0);
  assert.equal(f.buffers[0].disposed, 0);
  const currentPack = { name: 'intervening-owner-pbo' };
  f.gl.bindBuffer(f.gl.PIXEL_PACK_BUFFER, currentPack);
  await clock.resume();
  assert.deepEqual(await pending, healthy(6), 'same RGB threshold and alpha independence; no default diagnostics');
  assert.equal(f.pack(), currentPack, 'completion restores the current PBO binding');
  assert.ok(f.names().indexOf('deleteBuffer') < f.names().indexOf('disposeTarget'));
  f.assertReleased(1);
});

await test('concurrent healthy checks own independent targets, pixels, buffers and fences', async (clock) => {
  const f = fixture({ asyncSamples: [12, 21] });
  const first = f.run();
  const second = f.run();
  assert.equal(clock.waits.length, 2);
  assert.notEqual(f.targets[0].target, f.targets[1].target);
  assert.notEqual(f.buffers[0], f.buffers[1]);
  assert.notEqual(f.syncs[0], f.syncs[1]);
  await clock.resume(1);
  assert.deepEqual(await second, healthy(21));
  assert.equal(f.targets[0].disposed, 0);
  assert.equal(f.buffers[0].disposed, 0);
  await clock.resume();
  assert.deepEqual(await first, healthy(12));
  f.assertReleased(2);
});

for (const failCopy of [false, true]) {
  await test(`cancelled pending readback drains without any later scene access (copy failure=${failCopy})`, async (clock) => {
    const f = fixture({ asyncSamples: [0], failAt: failCopy ? 'copy' : null });
    const controller = new AbortController();
    const reason = new Error('room closed');
    const pending = f.run({ signal: controller.signal });
    const rejected = assert.rejects(pending, (error) => error === reason);
    let settled = false;
    pending.then(() => { settled = true; }, () => { settled = true; });
    f.syncs[0].status = f.gl.TIMEOUT_EXPIRED;
    controller.abort(reason);
    f.obsolete();
    await clock.resume();
    assert.equal(settled, false, 'abort cannot race away from live readback ownership');
    assert.equal(f.targets[0].disposed, 0);
    assert.equal(f.buffers[0].disposed, 0);
    f.syncs[0].status = f.gl.CONDITION_SATISFIED;
    await clock.resume();
    await rejected;
    assert.equal(f.names().filter((name) => name === 'render').length, 1);
    f.assertReleased(1);
  });
}

await test('already-aborted entry touches no renderer or scene', async () => {
  const f = fixture();
  const controller = new AbortController();
  const reason = new Error('cancelled before probe');
  controller.abort(reason);
  f.obsolete();
  await assert.rejects(f.run({ signal: controller.signal }), (error) => error === reason);
  assert.deepEqual(f.events, []);
  f.assertReleased(0);
});

for (const failure of ['enqueue', 'poll', 'copy', 'context-loss', 'timeout']) {
  await test(`${failure} uses a fresh synchronous measurement after owned readback release`, async (clock) => {
    const f = fixture({ asyncSamples: [0], syncSamples: [15],
      failAt: ['enqueue', 'poll', 'copy'].includes(failure) ? failure : null });
    const pending = f.run();
    if (failure === 'context-loss') f.gl.contextLost = true;
    if (failure === 'timeout') clock.advance(5000);
    if (clock.waits.length) await clock.resume();
    assert.deepEqual(await pending, healthy(15), 'PBO failure is not evidence of a black scene');
    assert.ok(f.names().indexOf('deleteBuffer') < f.names().indexOf('syncRead'));
    assert.ok(f.names().indexOf('disposeTarget') < f.names().indexOf('syncRead'));
    f.assertReleased(2, 1);
  });
}

for (const [label, samples, stage, keep] of [
  ['fresh healthy check', [15], null, []],
  ['shadows only', [0, 18], 'shadows-off', ['shadows']],
  ['environment confirmed', [0, 0, 18, 9], 'environment-off', ['environment']],
  ['fog confirmed', [0, 0, 0, 18, 9], 'fog-off', ['fog']],
  ['environment reapply', [0, 0, 18, 0], 'environment-off', ['shadows', 'environment']],
  ['fog reapply', [0, 0, 0, 18, 0], 'fog-off', ['shadows', 'environment', 'fog']],
  ['all-black rollback', [0, 0, 0, 0], null, []],
]) {
  await test(`black asynchronous result preserves synchronous ladder: ${label}`, async (clock) => {
    const f = fixture({ asyncSamples: [0], syncSamples: samples });
    const callbacks = [];
    const pending = f.run({ onRescue: (result) => callbacks.push(result) });
    await clock.resume();
    const result = await pending;
    const expected = stage
      ? { before: 0, after: 18, rescued: true, stage } : healthy(samples[0]);
    if (label === 'all-black rollback') expected.failed = true;
    assert.deepEqual(result, expected);
    assert.equal(callbacks.length, stage ? 1 : 0);
    if (stage) assert.equal(callbacks[0], result);
    assert.deepEqual(f.compatibility, {
      shadows: keep.includes('shadows') ? false : f.initial.shadows,
      environment: keep.includes('environment') ? null : f.initial.environment,
      fog: keep.includes('fog') ? null : f.initial.fog,
    });
    f.assertReleased(2, samples.length);
  });
}

for (const changed of ['shadows', 'environment', 'fog']) {
  await test(`compatibility ${changed} change during wait requires a fresh synchronous check`, async (clock) => {
    const f = fixture({ asyncSamples: [12], syncSamples: [24] });
    const pending = f.run();
    const value = changed === 'shadows' ? false : changed === 'environment'
      ? new THREE.Texture() : new THREE.Fog(0, 2, 20);
    f.compatibility[changed] = value;
    await clock.resume();
    assert.deepEqual(await pending, healthy(24));
    assert.equal(f.compatibility[changed], value, 'fresh check preserves the current compatibility owner');
    f.assertReleased(2, 1);
  });
}

await test('fallback skips unavailable rescue stages', async (clock) => {
  const f = fixture({ asyncSamples: [0], syncSamples: [0, 18], shadows: false, environment: false });
  const pending = f.run();
  await clock.resume();
  assert.deepEqual(await pending, { before: 0, after: 18, rescued: true, stage: 'fog-off' });
  assert.deepEqual(f.compatibility, { shadows: false, environment: null, fog: null });
  f.assertReleased(2, 2);
});

await test('failed synchronous fallback measurement is explicitly failed', async (clock) => {
  const f = fixture({ asyncSamples: [0], syncSamples: [18], failAt: 'syncRead' });
  const pending = f.run();
  await clock.resume();
  assert.deepEqual(await pending, { ...healthy(0), failed: true });
  assert.deepEqual(f.compatibility, f.initial);
  f.assertReleased(2, 0);
});

await test('callback failure retains a confirmed synchronous compatibility rescue', async (clock) => {
  const f = fixture({ asyncSamples: [0], syncSamples: [0, 0, 18, 9] });
  const pending = f.run({ onRescue() { throw new Error('callback failed after rescue'); } });
  await clock.resume();
  assert.deepEqual(await pending, { before: 0, after: 18, rescued: true, stage: 'environment-off' });
  assert.deepEqual(f.compatibility, { ...f.initial, environment: null });
  f.assertReleased(2, 4);
});

for (const failCopy of [false, true]) {
  await test(`renderer restoration failure drains pending readback before target release (copy failure=${failCopy})`, async (clock) => {
    const f = fixture({ asyncSamples: [12], syncSamples: [27], restoreThrows: true,
      failAt: failCopy ? 'copy' : null });
    const pending = f.run();
    await microtasks();
    assert.equal(f.targets[0].disposed, 0);
    assert.equal(f.buffers[0].disposed, 0);
    assert.ok(!f.names().includes('syncRead'));
    await clock.resume();
    assert.deepEqual(await pending, healthy(failCopy ? 27 : 12));
    assert.ok(f.names().indexOf('deleteBuffer') < f.names().indexOf('disposeTarget'));
    f.assertReleased(failCopy ? 2 : 1, failCopy ? 1 : 0);
  });
}

await test('transient pre-restore failure retries exact renderer state before yielding', async (clock) => {
  const f = fixture({ preRestoreFailures: 1 });
  const pending = f.run();
  assert.equal(f.names().filter((name) => name === 'rejectRestore').length, 1);
  f.assertRestored();
  assert.equal(f.pack(), f.externalPack);
  assert.ok(!f.names().includes('poll'));
  assert.equal(f.targets[0].disposed, 0);
  await clock.resume();
  assert.deepEqual(await pending, healthy(12));
  f.assertReleased(1);
});

for (const failCopy of [false, true]) {
  await test(`persistent pre-restore failure drains and fails closed without a fresh draw (copy failure=${failCopy})`, async (clock) => {
    const f = fixture({ preRestoreFailures: Infinity, failAt: failCopy ? 'copy' : null });
    const pending = f.run();
    let settled = false;
    pending.then(() => { settled = true; }, () => { settled = true; });
    await microtasks();
    assert.equal(f.names().filter((name) => name === 'rejectRestore').length, 2,
      'restoration retries once, with no unbounded repair loop');
    assert.equal(settled, false, 'failed restoration does not abandon live PBO ownership');
    assert.equal(f.targets[0].disposed, 0);
    assert.equal(f.buffers[0].disposed, 0);
    assert.equal(f.pack(), f.externalPack);
    await clock.resume();
    assert.deepEqual(await pending, { ...healthy(0), failed: true });
    assert.equal(f.names().filter((name) => name === 'render').length, 1);
    assert.ok(!f.names().includes('syncRead'), 'never restore a fallback to the disposed async target');
    assert.ok(f.names().indexOf('deleteBuffer') < f.names().indexOf('disposeTarget'));
    f.assertReleased(1, 0, false);
  });
}

await test('opt-in operation timing includes awaited work and bounded fallback measurements', async (clock) => {
  const f = fixture({ asyncSamples: [0], syncSamples: [0, 0, 0, 18, 9] });
  const pending = f.run({ measureTimings: true });
  await clock.resume();
  const result = await pending;
  assert.equal(result.measurements.length, 6);
  assert.equal(result.measurements[0].waitMs, 4);
  assert.equal(result.measurements[0].enqueueMs, 0);
  assert.equal(result.measurements[0].readbackMs, 4);
  for (const measurement of result.measurements) {
    const { readbackSteps, ...outer } = measurement;
    assert.ok(Object.values(outer).every((value) => Number.isFinite(value) && value >= 0));
    if (readbackSteps) {
      assert.ok(Object.values(readbackSteps).every((value) => Number.isFinite(value) && value >= 0));
    }
    assert.equal(measurement.programsBeforeRender, 2);
    assert.equal(measurement.programsAfterRender, 2);
  }
  assert.equal(result.measurements[0].readbackSteps.wait, 4);
  assert.equal(result.measurements[0].readbackSteps.readPixels, 0);
  assert.equal(result.measurements[0].readbackSteps.copy, 0);
  assert.equal(result.measurements[0].readbackSteps.release, 0);
  f.assertReleased(2, 5);
});

for (const [label, faultCall] of [['after enqueue', 1], ['before restoration', 2]]) {
  await test(`optional clock failure ${label} cannot detach readback or skip restoration`, async (clock) => {
    const f = fixture();
    let outerCalls = 0;
    let faultUsed = false;
    clock.beforeNow = () => {
      // Helper deadline reads happen before it schedules the poll. Once that
      // task exists but before renderer restoration, these two reads are the
      // outer enqueue-end and restore-start timing clocks, respectively.
      if (clock.waits.length !== 1 || f.names().at(-1) !== 'bindPack') return;
      outerCalls++;
      if (outerCalls === faultCall) {
        faultUsed = true;
        throw new Error(`optional outer clock failed ${label}`);
      }
    };
    const pending = f.run({ measureTimings: true });
    assert.equal(faultUsed, true, 'the intended outer diagnostic clock fault was exercised');
    f.assertRestored();
    assert.equal(f.pack(), f.externalPack);
    await microtasks();
    assert.equal(f.targets[0].disposed, 0, 'timing cannot erase ownership of the pending PBO promise');
    assert.equal(f.buffers[0].disposed, 0);
    assert.ok(!f.names().includes('syncRead'));
    await clock.resume();
    const { measurements, ...result } = await pending;
    assert.deepEqual(result, healthy(12), 'optional timing failure does not force a fallback draw');
    assert.equal(measurements.length, 1);
    assert.ok(f.names().indexOf('deleteBuffer') < f.names().indexOf('disposeTarget'));
    f.assertReleased(1);
  });
}

const previousLocation = globalThis.location;
let forcedWatchdog;
try {
  globalThis.location = { search: '?diagforce=blackscene' };
  ({ runSceneBlackWatchdogAsync: forcedWatchdog } = await import('./deviceDiag.ts?forced-async-selftest'));
} finally {
  if (previousLocation === undefined) delete globalThis.location;
  else globalThis.location = previousLocation;
}
for (const enabled of [false, true]) {
  await test(`forced diagnostic keeps fail-closed policy with rescue stages ${enabled}`, async () => {
    const f = fixture({ shadows: enabled, environment: enabled, fog: enabled });
    const result = await forcedWatchdog(f.renderer, f.scene, f.camera);
    assert.equal(result.failed === true, !enabled);
    assert.equal(result.rescued, enabled);
    assert.equal(f.targets.length, 0, 'forced diagnostics never allocate actual probes');
    assert.equal(f.buffers.length, 0);
  });
}

console.log(`sceneBlackWatchdogAsync.selftest: ${passed} async ownership, cancellation and fallback cases passed`);
