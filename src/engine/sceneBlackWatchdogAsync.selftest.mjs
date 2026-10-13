import assert from 'node:assert/strict';
import * as THREE from 'three';

globalThis.window = { __GL_DIAG: { errors: [] } };
const { runSceneBlackWatchdogAsync, runSceneWatchdogNow } = await import('./deviceDiag.ts');
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
  fog = true, failAt = null, restoreThrows = false, preRestoreFailures = 0, parallel = null } = {}) {
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
  let renderedAsyncSample;
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
      paint(pack.data, renderedAsyncSample);
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
      const sample = asyncSamples[buffers.length];
      renderedAsyncSample = typeof sample === 'function' ? sample(scene) : sample;
    },
    readRenderTargetPixels(readTarget, x, y, width, height, pixels) {
      assert.equal(readTarget, target);
      assert.deepEqual([x, y, width, height], [0, 0, 64, 22]);
      assert.ok(syncReads < syncSamples.length, 'fallback performs only the expected fresh sync checks');
      event('syncRead');
      paint(pixels, syncSamples[syncReads++]);
    },
  };
  if (parallel) {
    // 2026-10-09 (the black-screen lane): a renderer that submits a stage's programs without linking them on the main
    // thread and reports each one complete through KHR_parallel_shader_compile after `parallel.polls` pending queries.
    const COMPLETION_STATUS_KHR = 0x91B1;
    gl.getExtension = (name) => (name === 'KHR_parallel_shader_compile' ? { COMPLETION_STATUS_KHR } : null);
    gl.getProgramParameter = (program, key) => {
      assert.equal(key, COMPLETION_STATUS_KHR);
      assert.ok(program.native, 'poll the native program');
      event('linkPoll');
      program.queries = (program.queries ?? 0) + 1;
      return program.queries > parallel.polls;
    };
    renderer.compile = (compileScene, compileCamera) => {
      assertCurrent('compile');
      assert.equal(compileScene, scene);
      assert.equal(compileCamera, camera);
      assert.ok(targets.some((owned) => owned.target === target), 'stage programs are submitted into the probe target');
      event('compile', { ...compatibility });
      renderer.info.programs.push({ program: { native: true } }, { program: { native: true } });
      return new Set();
    };
  }
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

for (const outcome of ['healthy', 'cancelled', 'throw', 'skipped']) {
  await test(`covered immediate watchdog owns completion without a timer (${outcome})`, async clock => {
    const f = fixture();
    let current = outcome !== 'skipped';
    const pending = runSceneWatchdogNow({ isCurrent: () => current,
      diagnosticContext: { phase: 'battle', entryGeneration: 1, mapId: 'urban' },
      run: onMeasurements => {
        if (outcome === 'throw') throw new Error('covered measurement failed');
        return f.run({ measureTimings: true, isCurrent: () => current, onMeasurements });
      },
    });
    const observed = pending.then(value => ({ value }), error => ({ error }));
    if (outcome === 'healthy' || outcome === 'cancelled') {
      assert.ok(f.names().includes('enqueue'), 'real submission starts synchronously under the current cover');
      assert.equal(clock.waits.length, 1);
      assert.equal(clock.waits[0].ms, 4, 'the only timer is the existing owned PBO poll, never 1800ms');
      if (outcome === 'cancelled') { current = false; f.obsolete(); }
      await clock.resume();
    }
    const result = await observed;
    if (outcome === 'healthy') assert.equal(result.value.before, 12);
    else assert.match(String(result.error), outcome === 'throw' ? /covered measurement failed/ : /owner changed/);
    f.assertReleased(outcome === 'healthy' || outcome === 'cancelled' ? 1 : 0);
  });
}

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

// 2026-10-09 (the black-screen lane): a dark fresh reading is drawn once more under 8x the diagnostic light (the
// response draw); only a frame that stays black there enters the ladder, measured under that light.
const answered = (before, response) => ({ ...healthy(before), responseScale: .125, response });
for (const [label, samples, stage, keep] of [
  ['fresh healthy check', [15], null, []],
  ['dark frame answers the response light', [4, 32], null, []],
  ['shadows only', [0, 0, 18], 'shadows-off', ['shadows']],
  ['environment confirmed', [0, 0, 0, 18, 9], 'environment-off', ['environment']],
  ['fog confirmed', [0, 0, 0, 0, 18, 9], 'fog-off', ['fog']],
  ['environment reapply', [0, 0, 0, 18, 0], 'environment-off', ['shadows', 'environment']],
  ['fog reapply', [0, 0, 0, 0, 18, 0], 'fog-off', ['shadows', 'environment', 'fog']],
  ['all-black rollback', [0, 0, 0, 0, 0], null, []],
]) {
  await test(`black asynchronous result preserves the rescue ladder: ${label}`, async (clock) => {
    const f = fixture({ asyncSamples: [0], syncSamples: samples });
    const callbacks = [];
    const pending = f.run({ onRescue: (result) => callbacks.push(result) });
    await clock.resume();
    const result = await pending;
    const expected = stage ? { before: 0, after: 18, rescued: true, stage, responseScale: .125, response: 0 }
      : samples.length > 1 ? answered(samples[0], samples[1]) : healthy(samples[0]);
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
  const f = fixture({ asyncSamples: [0], syncSamples: [0, 0, 18], shadows: false, environment: false });
  const pending = f.run();
  await clock.resume();
  assert.deepEqual(await pending, { before: 0, after: 18, rescued: true, stage: 'fog-off', responseScale: .125, response: 0 });
  assert.deepEqual(f.compatibility, { shadows: false, environment: null, fog: null });
  f.assertReleased(2, 3);
});

await test('failed synchronous fallback measurement is explicitly failed', async (clock) => {
  const f = fixture({ asyncSamples: [0], syncSamples: [18], failAt: 'syncRead' });
  const pending = f.run();
  await clock.resume();
  assert.deepEqual(await pending, { ...healthy(0), failed: true });
  assert.deepEqual(f.compatibility, f.initial);
  f.assertReleased(2, 0);
});

await test('callback failure retains a confirmed compatibility rescue', async (clock) => {
  const f = fixture({ asyncSamples: [0], syncSamples: [0, 0, 0, 18, 9] });
  const pending = f.run({ onRescue() { throw new Error('callback failed after rescue'); } });
  await clock.resume();
  assert.deepEqual(await pending, { before: 0, after: 18, rescued: true, stage: 'environment-off', responseScale: .125, response: 0 });
  assert.deepEqual(f.compatibility, { ...f.initial, environment: null });
  f.assertReleased(2, 5);
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
  assert.deepEqual(result.measurements.map(row => row.kind), ['async', 'sync', 'sync', 'sync', 'sync', 'sync']);
  assert.equal(result.measurements[0].waitMs, 4);
  assert.equal(result.measurements[0].enqueueMs, 0);
  assert.equal(result.measurements[0].readbackMs, 4);
  for (const measurement of result.measurements) {
    const { kind, readbackSteps, ...outer } = measurement;
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

for (const outcome of ['healthy', 'fallback', 'cancelled', 'observer-throws']) {
  await test(`measurement publication follows owned cleanup (${outcome})`, async clock => {
    const f = fixture({ failAt: outcome === 'fallback' ? 'copy' : null, syncSamples: [18] });
    let current = true, observed, calls = 0;
    const pending = f.run({ measureTimings: true, isCurrent: () => current,
      onMeasurements(rows) {
        calls++;
        f.assertReleased(outcome === 'fallback' ? 2 : 1, outcome === 'fallback' ? 1 : 0);
        observed = structuredClone(rows);
        // The observer receives copies, never the returned timing rows.
        if (rows[0]) { rows[0].renderMs = 999; rows[0].readbackSteps.copy = 999; }
        if (outcome === 'observer-throws') throw new Error('diagnostic consumer failed');
      },
    });
    assert.equal(calls, 0, 'pending PBO is not published as a completed measurement');
    const rejection = outcome === 'cancelled' ? assert.rejects(pending, /watchdog owner changed/) : null;
    if (outcome === 'cancelled') { current = false; f.obsolete(); }
    await clock.resume();
    if (rejection) await rejection;
    else {
      const result = await pending;
      assert.equal(result.before, outcome === 'fallback' ? 18 : 12);
      assert.notEqual(result.measurements[0].renderMs, 999);
      assert.notEqual(result.measurements[0].readbackSteps.copy, 999);
      assert.equal(result.rescued, false);
    }
    assert.equal(calls, 1);
    assert.deepEqual(observed.map(row => row.kind), outcome === 'fallback' ? ['async', 'sync'] : ['async']);
    if (outcome === 'fallback') assert.match(observed[0].error, /injected copy/);
    assert.ok(observed.every(row => row.endTime >= row.startTime));
  });
}

await test('unavailable optional program count cannot trigger fallback', async clock => {
  const f = fixture();
  Object.defineProperty(f.renderer, 'info', { get() { throw new Error('program diagnostic unavailable'); } });
  const pending = f.run({ measureTimings: true });
  await clock.resume();
  const result = await pending;
  assert.equal(result.before, 12);
  assert.equal(result.measurements.length, 1);
  assert.equal(result.measurements[0].programsBeforeRender, undefined);
  assert.equal(result.measurements[0].programsAfterRender, undefined);
  f.assertReleased(1);
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

await test('obsolete delayed phase owner cannot read any scene state before submission', async () => {
  const f = fixture();
  f.obsolete();
  await assert.rejects(f.run({ isCurrent: () => false }), /watchdog owner changed/);
  assert.equal(f.names().length, 0);
  f.assertReleased(0);
});

for (const sample of [18, 0]) await test(`delayed owner invalidated during PBO band ${sample} drains before source access or repair`, async clock => {
  let current = true;
  const f = fixture({ asyncSamples: [sample] });
  const pending = f.run({ isCurrent: () => current });
  assert.ok(f.names().includes('enqueue'));
  current = false;
  f.obsolete();
  const rejection = assert.rejects(pending, /watchdog owner changed/);
  await clock.resume();
  await rejection;
  assert.ok(!f.names().includes('syncRead'), 'obsolete black pixels cannot start a synchronous rescue on the next phase');
  f.assertReleased(1);
});

for (const outcome of ['healthy', 'abort', 'context-lost', 'black']) {
  await test(`night ${outcome} restores radiance before PBO wait and retains real-black protection`, async clock => {
    const controller = new AbortController();
    let ambient, sun, renderedIntensity = null;
    const f = fixture({ asyncSamples: [scene => {
      renderedIntensity = ambient.intensity;
      assert.equal(ambient.intensity, .46 / .05);
      assert.equal(sun.intensity, .42 / .05);
      assert.equal(scene.environmentIntensity, .85 / .05);
      // Sample depends on illumination at renderer.render, not restored state
      // at later PBO copy. A normalization no-op must fail this healthy case.
      return outcome === 'black' ? 0 : ambient.intensity > 1 ? 18 : 3;
    }], syncSamples: outcome === 'black' || outcome === 'context-lost' ? [0, 0, 0, 0, 0] : [] });
    ambient = new THREE.AmbientLight(0x778899, .46);
    sun = new THREE.DirectionalLight(0xa6bce8, .42);
    f.scene.add(ambient, sun);
    f.scene.environmentIntensity = .85;
    const pending = f.run({ signal: controller.signal, nightRadianceScale: .05 });
    assert.equal(renderedIntensity, .46 / .05);
    const restored = () => {
      assert.deepEqual([ambient.intensity, sun.intensity, f.scene.environmentIntensity], [.46, .42, .85]);
      f.assertRestored();
    };
    restored();
    if (outcome === 'abort') controller.abort(new Error('night entry cancelled'));
    if (outcome === 'context-lost') f.gl.contextLost = true;
    const observed = pending.then(value => ({ value }), error => ({ error }));
    await clock.resume();
    const result = await observed;
    restored();
    if (outcome === 'abort') {
      assert.match(result.error.message, /night entry cancelled/);
      assert.ok(!f.names().includes('syncRead'));
      f.assertReleased(1);
    } else if (outcome === 'healthy') {
      assert.deepEqual(result.value, { ...healthy(18), nightRadianceScale: .05 });
      assert.ok(!f.names().includes('syncRead'), 'valid night never takes synchronous compatibility fallback');
      f.assertReleased(1);
    } else {
      assert.equal(result.value.failed, true, 'night metadata cannot certify a truly black or context-lost scene');
      assert.equal(result.value.rescued, false);
      assert.equal(result.value.responseScale, .01, 'night answers at the response floor');
      f.assertReleased(2, 5);
    }
  });
}

await test('a genuinely broken pipeline (forced black output) is still refused, its stages linked off the main thread', async (clock) => {
  const f = fixture({ asyncSamples: [0], syncSamples: [0, 0, 0, 0, 0], parallel: { polls: 1 } });
  const callbacks = [];
  const pending = f.run({ onRescue: (result) => callbacks.push(result) });
  await clock.resume(); // the PBO fence
  // each stage: submit its programs into the probe target, then poll completion between tasks before the judging draw
  for (let stage = 0; stage < 3; stage++) {
    assert.ok(clock.waits.length === 1 && clock.waits[0].ms === 16, `stage ${stage} yields while its programs link`);
    assert.ok(f.names().at(-1) === 'linkPoll', 'no judging draw before the links complete');
    await clock.resume();
  }
  const result = await pending;
  assert.equal(result.failed, true, 'a real black frame is refused');
  assert.deepEqual([result.before, result.response, result.rescued], [0, 0, false]);
  assert.equal(callbacks.length, 0);
  assert.deepEqual(f.compatibility, f.initial, 'every unconfirmed stage came off');
  const names = f.names();
  assert.equal(names.filter((name) => name === 'compile').length, 3, 'one program submission per stage');
  for (let index = 0; index < names.length; index++) {
    if (names[index] !== 'compile') continue;
    const judging = names.indexOf('syncRead', index);
    assert.ok(names.slice(index, judging).includes('linkPoll'), 'the judging draw follows the completion polls');
  }
  assert.ok(window.__GL_DIAG.errors.some((message) => message.includes('no ladder stage cured it')));
  f.assertReleased(2, 5);
});

await test('a stage cured by the ladder after its programs linked is kept (async ladder rescue)', async (clock) => {
  const f = fixture({ asyncSamples: [0], syncSamples: [0, 0, 0, 18, 9], parallel: { polls: 1 } });
  const pending = f.run();
  await clock.resume();
  for (let stage = 0; stage < 2; stage++) await clock.resume();
  assert.deepEqual(await pending, { before: 0, after: 18, rescued: true, stage: 'environment-off', responseScale: .125, response: 0 });
  assert.deepEqual(f.compatibility, { ...f.initial, environment: null });
  f.assertReleased(2, 5);
});

await test('cancellation while a stage links rejects and takes the tentative stage off', async (clock) => {
  let current = true;
  const f = fixture({ asyncSamples: [0], syncSamples: [0, 0], parallel: { polls: 5 } });
  const pending = f.run({ isCurrent: () => current });
  const observed = pending.then(value => ({ value }), error => ({ error }));
  await clock.resume();
  assert.equal(f.compatibility.shadows, false, 'shadows-off is tentatively applied while its programs link');
  current = false;
  await clock.resume();
  const result = await observed;
  assert.match(String(result.error?.message), /watchdog owner changed/);
  assert.deepEqual(f.compatibility, f.initial, 'the renderer and shared scene outlive the entry: the stage came off');
  f.assertReleased(2, 2);
});

await test('a newer owner\'s compatibility state survives a cancelled stage (compare-and-swap revert)', async (clock) => {
  let current = true;
  const f = fixture({ asyncSamples: [0], syncSamples: [0, 0, 0], parallel: { polls: 1 } });
  const pending = f.run({ isCurrent: () => current });
  const observed = pending.then(value => ({ value }), error => ({ error }));
  await clock.resume(); // the PBO fence; shadows-off links
  await clock.resume(); // shadows-off judged (black); environment-off applied and linking
  assert.equal(f.compatibility.environment, null);
  const next = new THREE.Texture();
  f.compatibility.environment = next; // the next phase installs its own environment
  current = false;
  await clock.resume();
  const result = await observed;
  assert.match(String(result.error?.message), /watchdog owner changed/);
  assert.equal(f.compatibility.environment, next, 'the stale stage never clobbers the newer environment');
  assert.equal(f.compatibility.shadows, f.initial.shadows);
  f.assertReleased(2, 3);
});

await test('a ladder whose programs never finish linking fails closed within its allowance', async (clock) => {
  const f = fixture({ asyncSamples: [0], syncSamples: [0, 0], parallel: { polls: Infinity } });
  const pending = f.run();
  await clock.resume();
  clock.advance(30001);
  await clock.resume();
  const result = await pending;
  assert.equal(result.failed, true);
  assert.deepEqual(f.compatibility, f.initial);
  assert.ok(window.__GL_DIAG.errors.some((message) => message.includes('still linking')));
  f.assertReleased(2, 2);
});

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

// 2026-10-09 (the black-screen lane): ?diagforce=blackout is a lit pipeline black under any light and any rescue stage,
// the per-deploy sweep's negative control (tools/battle-entry-sweep.mjs --force-black): it must always be refused.
let blackoutWatchdog;
try {
  globalThis.location = { search: '?diagforce=blackout' };
  ({ runSceneBlackWatchdogAsync: blackoutWatchdog } = await import('./deviceDiag.ts?blackout-async-selftest'));
} finally {
  if (previousLocation === undefined) delete globalThis.location;
  else globalThis.location = previousLocation;
}
for (const enabled of [false, true]) {
  await test(`forced blackout is refused whatever rescue stages exist (${enabled})`, async () => {
    const f = fixture({ shadows: enabled, environment: enabled, fog: enabled });
    const result = await blackoutWatchdog(f.renderer, f.scene, f.camera);
    assert.equal(result.failed, true, 'a genuinely black pipeline is refused');
    assert.deepEqual([result.before, result.response, result.rescued], [0, 0, false]);
    assert.deepEqual(f.compatibility, f.initial, 'every tried stage came off');
    assert.equal(f.targets.length, 0, 'forced diagnostics never allocate actual probes');
  });
}

console.log(`sceneBlackWatchdogAsync.selftest: ${passed} async ownership, cancellation and fallback cases passed`);
