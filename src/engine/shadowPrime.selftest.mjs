import assert from 'node:assert/strict';
import * as THREE from 'three';
import { primeShadowCascades } from './shadowPrime.ts';
import { createLighting } from './lighting.ts';

function fixture() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.layers.enable(30);
  const lights = [new THREE.DirectionalLight(), new THREE.DirectionalLight()];
  lights[0].layers.enable(4);
  lights[1].layers.enable(5);
  lights.forEach((light, index) => {
    light.shadow.autoUpdate = index === 0;
    light.shadow.needsUpdate = index === 1;
    scene.add(light);
  });
  const prior = new THREE.WebGLRenderTarget(4, 4);
  const target = { value: prior, face: 2, mip: 3 };
  const calls = [];
  const draws = [];
  const cohorts = [];
  const casters = [];
  const failures = { render: null, restore: null };
  const hooks = { restore: null, dispose: null };
  const context = { lost: false, isContextLost() { return this.lost; } };
  let disposed = 0;
  let warmTarget;
  const originalRender = function (selected, activeScene, activeCamera) {
    assert.equal(this, renderer.shadowMap);
    assert.equal(activeScene, scene);
    assert.equal(activeCamera.layers.mask, cameraMask);
    draws.push(selected.map((light) => lights.indexOf(light)));
    const cohort = [];
    scene.traverseVisible((object) => {
      if (!(object.isMesh || object.isLine || object.isPoints)) return;
      if (!object.layers.test(activeCamera.layers)) return;
      if (!object.castShadow && !(renderer.shadowMap.type === THREE.VSMShadowMap && object.receiveShadow)) return;
      const geometry = object.geometry;
      const positionCount = geometry.getAttribute('position')?.count ?? 0;
      const rangeStart = geometry.drawRange.start;
      const rangeEnd = Math.min(rangeStart + geometry.drawRange.count, geometry.index?.count ?? positionCount);
      if (!(positionCount > 0) || !(rangeEnd > rangeStart)) return;
      const drawable = Array.isArray(object.material)
        ? geometry.groups.some((group) => object.material[group.materialIndex ?? 0]?.visible
          && Math.min(group.start + group.count, rangeEnd) > Math.max(group.start, rangeStart))
        : object.material.visible;
      if (drawable) cohort.push(object.name);
    });
    cohorts.push(cohort);
    for (const { object, visible } of casters) {
      assert.equal(object.visible, visible, `${object.name}: batching must never hide a parent or child`);
    }
  };
  const renderer = Object.assign(Object.create(THREE.WebGLRenderer.prototype), {
    info: {},
    shadowMap: { render: originalRender, type: THREE.PCFSoftShadowMap },
    getContext: () => context,
    getRenderTarget: () => target.value,
    getActiveCubeFace: () => target.face,
    getActiveMipmapLevel: () => target.mip,
    setRenderTarget(next, face = 0, mip = 0) {
      calls.push(next === prior ? 'restore' : 'bind');
      if (next === prior && failures.restore) throw failures.restore;
      if (next !== prior && !warmTarget) {
        warmTarget = next;
        next.addEventListener('dispose', () => { disposed += 1; hooks.dispose?.(); });
      }
      Object.assign(target, { value: next, face, mip });
      if (next === prior) hooks.restore?.();
    },
    render(activeScene, activeCamera) {
      assert.equal(activeScene, scene);
      assert.equal(activeCamera, camera);
      assert.equal(camera.layers.mask, 2 ** 31);
      assert.equal(lights.filter((light) => light.shadow.needsUpdate).length, 1);
      renderer.shadowMap.render(lights, scene, camera);
      if (failures.render) throw failures.render;
    },
  });
  const cameraMask = camera.layers.mask;
  const saved = lights.map((light) => ({ mask: light.layers.mask,
    auto: light.shadow.autoUpdate, needs: light.shadow.needsUpdate }));
  const run = (options = {}) => primeShadowCascades({ renderer, scene, camera, lights,
    count: lights.length, ...options });
  const addCaster = (name, vertexCount = 3, options = {}) => {
    const geometry = new THREE.BufferGeometry();
    if (!options.noPosition) geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    if (options.drawCount !== undefined) geometry.setDrawRange(0, options.drawCount);
    const material = new THREE.MeshBasicMaterial({ visible: options.materialVisible ?? true });
    const Constructor = options.kind === 'line' ? THREE.Line : options.kind === 'points' ? THREE.Points : THREE.Mesh;
    const object = new Constructor(geometry, material);
    object.name = name;
    object.visible = options.visible ?? true;
    object.castShadow = options.castShadow ?? true;
    object.receiveShadow = options.receiveShadow ?? false;
    if (options.layer !== undefined) object.layers.set(options.layer);
    (options.parent ?? scene).add(object);
    casters.push({ object, visible: object.visible, cast: object.castShadow, receive: object.receiveShadow });
    return object;
  };
  const casterFlagsRestored = () => {
    for (const { object, visible, cast, receive } of casters) {
      assert.equal(object.visible, visible, `${object.name}: visible restored`);
      assert.equal(object.castShadow, cast, `${object.name}: castShadow restored`);
      assert.equal(object.receiveShadow, receive, `${object.name}: receiveShadow restored`);
    }
  };
  const bindingsRestored = () => {
    assert.equal(renderer.shadowMap.render, originalRender, 'restore exact wrapper identity');
    assert.equal(camera.layers.mask, cameraMask);
    lights.forEach((light, index) => assert.equal(light.layers.mask, saved[index].mask));
    assert.equal(target.value, prior);
    assert.equal(target.face, 2);
    assert.equal(target.mip, 3);
    casterFlagsRestored();
  };
  const restored = (success = false) => {
    assert.equal(renderer.shadowMap.render, originalRender, 'restore exact wrapper identity');
    assert.equal(camera.layers.mask, cameraMask);
    lights.forEach((light, index) => {
      assert.equal(light.layers.mask, saved[index].mask);
      assert.equal(light.shadow.autoUpdate, success ? false : saved[index].auto);
      assert.equal(light.shadow.needsUpdate, success ? false : saved[index].needs);
    });
    casterFlagsRestored();
  };
  return { run, renderer, scene, camera, lights, target, prior, context, failures, hooks,
    calls, draws, cohorts, addCaster, bindingsRestored, casterFlagsRestored, restored, disposed: () => disposed,
    cleanup() {
      for (const { object } of casters) {
        object.geometry.dispose();
        for (const material of [object.material].flat()) material.dispose();
      }
      prior.dispose();
    } };
}

async function withFixture(run) {
  const f = fixture();
  try { await run(f); } finally { f.cleanup(); }
}

await withFixture(async (f) => {
  const yields = [];
  const result = await f.run({ yieldBeforeCascade(index) {
    yields.push(index);
    assert.equal(f.target.value, f.prior);
    assert.equal(f.target.face, 2);
    assert.equal(f.target.mip, 3);
    assert.equal(f.draws.length, index);
  } });
  assert.deepEqual(yields, [0, 1]);
  assert.deepEqual(f.draws, [[0], [1]]);
  assert.equal(result.length, 2);
  assert.ok(result.every((ms) => Number.isFinite(ms) && ms >= 0));
  f.restored(true);
  assert.equal(f.disposed(), 1);
});

for (const abortAt of [0, 1]) await withFixture(async (f) => {
  const abort = new AbortController();
  const reason = new Error('owned cancellation');
  const work = f.run({ signal: abort.signal, async yieldBeforeCascade(index) {
    await Promise.resolve();
    if (index === abortAt) abort.abort(reason);
  } });
  await assert.rejects(work, (error) => error === reason);
  assert.equal(f.draws.length, abortAt);
  f.restored();
  assert.equal(f.disposed(), abortAt ? 1 : 0);
});

await withFixture(async (f) => {
  const abort = new AbortController();
  const reason = new Error('already aborted');
  abort.abort(reason);
  await assert.rejects(f.run({ signal: abort.signal }), (error) => error === reason);
  assert.equal(f.calls.length, 0);
  f.restored();
});

await withFixture(async (f) => {
  let current = true;
  await assert.rejects(f.run({ isCurrent: () => current, yieldBeforeCascade(index) {
    if (index === 1) current = false;
  } }), /shadow_prime_stale/);
  f.restored();
  assert.equal(f.draws.length, 1);
  assert.equal(f.disposed(), 1, 'same-context stale owner still releases its target');
});

for (const change of ['lost', 'restored']) await withFixture(async (f) => {
  let callsAtLoss;
  await assert.rejects(f.run({ yieldBeforeCascade(index) {
    if (index !== 1) return;
    if (change === 'lost') f.context.lost = true;
    else f.renderer.info = {};
    callsAtLoss = f.calls.length;
  } }), /shadow_prime_context_changed/);
  assert.equal(f.calls.length, callsAtLoss, 'never bind old targets after context invalidation');
  assert.equal(f.draws.length, 1);
  f.restored();
});

await withFixture(async (f) => {
  const reason = new Error('scheduler failed');
  await assert.rejects(f.run({ yieldBeforeCascade(index) {
    if (index === 1) throw reason;
  } }), (error) => error === reason);
  f.restored();
  assert.equal(f.disposed(), 1);
});

for (const renderFails of [false, true]) await withFixture(async (f) => {
  const original = new Error('draw failed');
  const restoration = new Error('target restoration failed');
  f.failures.render = renderFails ? original : null;
  f.failures.restore = restoration;
  await assert.rejects(f.run(), (error) => error === (renderFails ? original : restoration));
  assert.equal(f.draws.length, 1);
  f.restored();
  assert.equal(f.disposed(), 1, 'failed target restoration cannot skip target disposal');
});

await withFixture(async (f) => {
  const original = f.renderer.render;
  const abort = new AbortController();
  const reason = new Error('cancelled during final draw');
  f.renderer.render = (...args) => {
    original(...args);
    if (f.draws.length === 2) abort.abort(reason);
  };
  await assert.rejects(f.run({ signal: abort.signal }), (error) => error === reason);
  f.restored();
  assert.equal(f.disposed(), 1);
});

await withFixture(async (f) => {
  let settle;
  const gate = new Promise((resolve) => { settle = resolve; });
  const abort = new AbortController();
  const reason = new Error('cancelled while last yield is held');
  const pending = f.run({ signal: abort.signal, yieldBeforeCascade(index) {
    return index === 1 ? gate : undefined;
  } });
  // The first cascade settles synchronously after the first awaited callback.
  await Promise.resolve();
  assert.equal(f.draws.length, 1);
  assert.equal(f.target.value, f.prior);
  abort.abort(reason);
  const rejection = assert.rejects(pending, (error) => error === reason);
  settle();
  await rejection;
  assert.equal(f.draws.length, 1, 'cancellation after a deferred callback blocks the final draw');
  f.restored();
  assert.equal(f.disposed(), 1);
});

for (const count of [-1, 3, NaN, 1.5]) await withFixture(async (f) => {
  await assert.rejects(f.run({ count }), /shadow_prime_invalid_count/);
  assert.equal(f.calls.length, 0);
  f.restored();
});

for (const boundary of ['restore', 'dispose']) {
  for (const invalidation of ['lost', 'restored']) await withFixture(async (f) => {
    let restores = 0;
    const invalidate = () => {
      if (invalidation === 'lost') f.context.lost = true;
      else f.renderer.info = {};
    };
    if (boundary === 'dispose') f.hooks.dispose = invalidate;
    else f.hooks.restore = () => { if (++restores === 3) invalidate(); };
    await assert.rejects(f.run(), /shadow_prime_context_changed/,
      `${invalidation} during final ${boundary} cannot publish successful priming`);
    assert.equal(f.draws.length, 2);
    f.restored();
  });
}

for (const invalidation of ['lost', 'restored', 'shadowMap']) await withFixture(async (f) => {
  const lighting = createLighting(f.scene, f.camera, new THREE.Vector3(1, 1, 1).normalize());
  try {
    lighting.setStaticPresentationDormant(false);
    lighting.update(true);
    f.renderer.render = () => {};
    f.hooks.dispose = () => queueMicrotask(() => {
      // Runs after the helper has completed all synchronous cleanup, before
      // the lighting owner resumes its await. Garage supplies no work lease.
      if (invalidation === 'lost') f.context.lost = true;
      else if (invalidation === 'restored') f.renderer.info = {};
      else f.renderer.shadowMap = { render() {} };
    });
    await assert.rejects(lighting.primeShadowMaps(f.renderer, f.scene, f.camera),
      /shadow_prime_context_changed/, `${invalidation} at the await handoff cannot prime Garage`);
    lighting.update(false);
    assert.ok(lighting.scheduledMask > 0, 'failed handoff leaves no primed-frame suppression latch');
  } finally {
    lighting.csm.remove();
    lighting.csm.dispose();
  }
});

await withFixture(async (f) => {
  const names = Array.from({ length: 10 }, (_, index) => `unwarmed-${index}`);
  names.forEach((name) => f.addCaster(name, 50_000));
  const result = await f.run();
  assert.deepEqual(f.draws, [[0], [1]], 'existing callers never perform caster warmup');
  assert.deepEqual(f.cohorts, [names, names]);
  assert.equal(result.length, 2);
  f.restored(true);
});

for (const { vertices, limits, groups } of [
  { vertices: [23_000, 23_000], limits: {}, groups: [[0], [1]] },
  { vertices: Array(10).fill(3), limits: {}, groups: [[0, 1, 2, 3, 4, 5, 6, 7], [8, 9]] },
  { vertices: [4, 4, 20, 3, 3, 3], limits: { maxVerticesPerBatch: 10, maxCastersPerBatch: 2 },
    groups: [[0, 1], [2], [3, 4], [5]] },
  { vertices: [6, 4, 1, 1, 1], limits: { maxVerticesPerBatch: 10, maxCastersPerBatch: 2 },
    groups: [[0, 1], [2, 3], [4]] },
]) await withFixture(async (f) => {
  const names = vertices.map((count, index) => f.addCaster(`caster-${index}`, count).name);
  const expected = groups.map((indices, batchIndex) => ({ cascadeIndex: 0, batchIndex,
    casterCount: indices.length, vertexCount: indices.reduce((sum, index) => sum + vertices[index], 0) }));
  const yielded = [];
  const reported = [];
  const cascadeYields = [];
  const result = await f.run({
    casterWarmup: { ...limits,
      async yieldBeforeBatch(batch) {
        f.bindingsRestored();
        assert.equal(f.draws.length, batch.batchIndex, 'one task boundary per warm cohort');
        yielded.push({ ...batch });
        await Promise.resolve();
        f.bindingsRestored();
      },
      onBatch(timing) {
        f.bindingsRestored();
        assert.equal(f.draws.length, timing.batchIndex + 1);
        assert.ok(Number.isFinite(timing.elapsedMs) && timing.elapsedMs >= 0);
        const { elapsedMs, ...metadata } = timing;
        reported.push(metadata);
      },
    },
    yieldBeforeCascade(index) {
      f.bindingsRestored();
      assert.equal(f.draws.length, groups.length + index);
      cascadeYields.push(index);
    },
  });
  assert.deepEqual(yielded, expected, 'default and configured budgets preserve indivisible geometry');
  assert.deepEqual(reported, expected);
  assert.deepEqual(cascadeYields, [0, 1]);
  assert.deepEqual(f.draws, [...groups.map(() => [0]), [0], [1]], 'only the first production cascade warms');
  assert.deepEqual(f.cohorts, [...groups.map((indices) => indices.map((index) => names[index])), names, names],
    'every caster uploads exactly once before both unchanged full final draws');
  assert.equal(result.length, 2, 'warm timings must not replace or extend cascade timings');
  assert.ok(result.every((elapsedMs) => Number.isFinite(elapsedMs) && elapsedMs >= 0));
  f.restored(true);
  assert.equal(f.disposed(), 1);
});

for (const count of [0, 2]) await withFixture(async (f) => {
  if (count === 0) f.addCaster('not-requested', 3);
  let callbacks = 0;
  await f.run({ count, casterWarmup: {
    yieldBeforeBatch() { callbacks += 1; }, onBatch() { callbacks += 1; },
  } });
  assert.equal(callbacks, 0, 'zero cascades or no eligible casters must not schedule warm tasks');
  assert.deepEqual(f.draws, count === 0 ? [] : [[0], [1]]);
  if (count === 0) assert.equal(f.calls.length, 0, 'zero cascades leave renderer bindings untouched');
  f.restored(count > 0);
});

await withFixture(async (f) => {
  const parent = f.addCaster('parent', 3);
  f.addCaster('line-child', 4, { parent, kind: 'line' });
  f.addCaster('points', 5, { kind: 'points' });
  f.addCaster('shadow-layer', 6, { layer: 30 });
  const noncaster = f.addCaster('noncaster-parent', 3, { castShadow: false, receiveShadow: true });
  f.addCaster('nested-caster', 7, { parent: noncaster });
  const hidden = f.addCaster('hidden', 3, { visible: false });
  f.addCaster('hidden-child', 3, { parent: hidden });
  f.addCaster('other-layer', 3, { layer: 4 });
  f.addCaster('hidden-material', 3, { materialVisible: false });
  f.addCaster('no-position', 3, { noPosition: true });
  f.addCaster('empty-position', 0);
  f.addCaster('empty-range', 3, { drawCount: 0 });
  const emptyIndex = f.addCaster('empty-index', 3);
  emptyIndex.geometry.setIndex([]);
  const rangePastEnd = f.addCaster('range-past-end', 3);
  rangePastEnd.geometry.setDrawRange(3, 3);
  const hiddenGroups = f.addCaster('hidden-groups', 3, { materialVisible: false });
  hiddenGroups.material = [hiddenGroups.material];
  hiddenGroups.geometry.addGroup(0, 3, 0);
  const missingGroups = f.addCaster('missing-groups', 3);
  missingGroups.material = [missingGroups.material];
  const mixedGroups = f.addCaster('mixed-groups', 8, { drawCount: 3 });
  mixedGroups.material = [mixedGroups.material, new THREE.MeshBasicMaterial({ visible: false })];
  mixedGroups.geometry.addGroup(0, 3, 0);
  mixedGroups.geometry.addGroup(3, 5, 1);
  const names = ['parent', 'line-child', 'points', 'shadow-layer', 'nested-caster', 'mixed-groups'];
  const batches = [];
  await f.run({ casterWarmup: { maxCastersPerBatch: 1,
    yieldBeforeBatch() { f.bindingsRestored(); },
    onBatch(timing) { f.bindingsRestored(); batches.push(timing); },
  } });
  assert.deepEqual(f.cohorts, [...names.map((name) => [name]), names, names],
    'visible Mesh/Line/Points and camera shadow layers participate without suppressing child traversal');
  assert.deepEqual(batches.map((batch) => batch.vertexCount), [3, 4, 5, 6, 7, 8],
    'upload weight includes the entire position buffer even for a partial visible draw');
  f.restored(true);
});

await withFixture(async (f) => {
  f.renderer.shadowMap.type = THREE.VSMShadowMap;
  const parent = f.addCaster('vsm-parent', 3, { receiveShadow: true });
  f.addCaster('receive-only-child', 4, { parent, castShadow: false, receiveShadow: true });
  f.addCaster('receive-only-points', 5, { kind: 'points', castShadow: false, receiveShadow: true });
  f.addCaster('cast-only-line', 6, { kind: 'line' });
  f.addCaster('neither', 3, { castShadow: false });
  const names = ['vsm-parent', 'receive-only-child', 'receive-only-points', 'cast-only-line'];
  await f.run({ casterWarmup: { maxCastersPerBatch: 1,
    yieldBeforeBatch() { f.bindingsRestored(); }, onBatch() { f.bindingsRestored(); },
  } });
  assert.deepEqual(f.cohorts, [...names.map((name) => [name]), names, names],
    'VSM receive-only casters join their own batches and cannot leak into another cohort');
  f.restored(true);
});

for (const abortAt of [0, 1]) await withFixture(async (f) => {
  f.addCaster('warm-a', 3, { receiveShadow: true });
  f.addCaster('warm-b', 3);
  let release;
  let entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const held = new Promise((resolve) => { entered = resolve; });
  const abort = new AbortController();
  const reason = new Error('cancelled while warm batch yield is held');
  const pending = f.run({ signal: abort.signal, casterWarmup: { maxCastersPerBatch: 1,
    yieldBeforeBatch(batch) {
      f.bindingsRestored();
      if (batch.batchIndex === abortAt) { entered(); return gate; }
    },
  } });
  await held;
  assert.equal(f.draws.length, abortAt);
  f.bindingsRestored();
  const rejected = assert.rejects(pending, (error) => error === reason);
  abort.abort(reason);
  release();
  await rejected;
  assert.equal(f.draws.length, abortAt, 'a released stale batch must not render or begin final cascades');
  f.restored();
  assert.equal(f.disposed(), abortAt ? 1 : 0);
});

await withFixture(async (f) => {
  f.renderer.shadowMap.type = THREE.VSMShadowMap;
  f.addCaster('warm-a', 3, { receiveShadow: true });
  f.addCaster('warm-b', 3, { castShadow: false, receiveShadow: true });
  const abort = new AbortController();
  const reason = new Error('cancelled during warm render');
  const original = f.renderer.render;
  let reported = 0;
  f.renderer.render = (...args) => { original(...args); abort.abort(reason); };
  await assert.rejects(f.run({ signal: abort.signal, casterWarmup: { maxCastersPerBatch: 1,
    onBatch() { reported += 1; },
  } }), (error) => error === reason);
  assert.deepEqual(f.cohorts, [['warm-a']]);
  assert.equal(reported, 0, 'cancelled draws cannot publish successful warm timings');
  f.bindingsRestored();
  f.restored();
  assert.equal(f.disposed(), 1);
});

for (const boundary of ['yield', 'render', 'onBatch']) {
  for (const invalidation of ['lost', 'restored']) await withFixture(async (f) => {
    f.addCaster('warm-a', 3, { receiveShadow: true });
    f.addCaster('warm-b', 3);
    let callsAtInvalidation;
    const invalidate = () => {
      if (invalidation === 'lost') f.context.lost = true;
      else f.renderer.info = {};
      callsAtInvalidation = f.calls.length;
    };
    if (boundary === 'render') {
      const original = f.renderer.render;
      f.renderer.render = (...args) => { original(...args); invalidate(); };
    }
    await assert.rejects(f.run({ casterWarmup: { maxCastersPerBatch: 1,
      yieldBeforeBatch(batch) {
        f.bindingsRestored();
        if (boundary === 'yield' && batch.batchIndex === 1) invalidate();
      },
      onBatch() { f.bindingsRestored(); if (boundary === 'onBatch') invalidate(); },
    } }), /shadow_prime_context_changed/);
    assert.equal(f.calls.length, callsAtInvalidation, 'old targets must never bind after context invalidation');
    assert.deepEqual(f.draws, [[0]], 'invalidated warm work must never enter the final cascades');
    f.restored();
    assert.equal(f.disposed(), 0, 'old-context disposal hooks must not touch the new renderer lifetime');
  });
}

for (const renderFails of [false, true]) await withFixture(async (f) => {
  f.renderer.shadowMap.type = THREE.VSMShadowMap;
  f.addCaster('warm-a', 3, { receiveShadow: true });
  f.addCaster('warm-b', 3, { castShadow: false, receiveShadow: true });
  const original = new Error('warm draw failed');
  const restoration = new Error('warm target restoration failed');
  f.failures.render = renderFails ? original : null;
  f.failures.restore = restoration;
  let reported = 0;
  await assert.rejects(f.run({ casterWarmup: { maxCastersPerBatch: 1,
    onBatch() { reported += 1; },
  } }), (error) => error === (renderFails ? original : restoration));
  assert.deepEqual(f.cohorts, [['warm-a']]);
  assert.equal(reported, 0);
  f.restored();
  assert.equal(f.disposed(), 1, 'caster and wrapper restoration failures cannot skip disposal');
});

for (const callback of ['yieldBeforeBatch', 'onBatch']) await withFixture(async (f) => {
  f.addCaster('warm-a', 3, { receiveShadow: true });
  f.addCaster('warm-b', 3);
  const reason = new Error(`${callback} failed`);
  await assert.rejects(f.run({ casterWarmup: { maxCastersPerBatch: 1,
    [callback](batch) { f.bindingsRestored(); if (batch.batchIndex === 1) throw reason; },
  } }), (error) => error === reason);
  assert.equal(f.draws.length, callback === 'yieldBeforeBatch' ? 1 : 2);
  assert.ok(f.draws.every((draw) => draw.length === 1 && draw[0] === 0));
  f.bindingsRestored();
  f.restored();
  assert.equal(f.disposed(), 1);
});

await withFixture(async (f) => {
  f.addCaster('lighting-caster', 3);
  const lighting = createLighting(f.scene, f.camera, new THREE.Vector3(1, 1, 1).normalize());
  let renderCount = 0;
  const batches = [];
  try {
    lighting.setStaticPresentationDormant(false);
    lighting.update(true);
    f.renderer.render = () => { renderCount += 1; };
    const result = await lighting.primeShadowMaps(f.renderer, f.scene, f.camera, {
      casterWarmup: {
        yieldBeforeBatch() { f.bindingsRestored(); },
        onBatch(timing) { f.bindingsRestored(); batches.push(timing); },
      },
    });
    assert.equal(batches.length, 1, 'the public lighting owner forwards casterWarmup');
    const { elapsedMs, ...metadata } = batches[0];
    assert.deepEqual(metadata, { cascadeIndex: 0, batchIndex: 0, casterCount: 1, vertexCount: 3 });
    assert.ok(Number.isFinite(elapsedMs) && elapsedMs >= 0);
    assert.equal(result.length, lighting.csm.lights.length);
    assert.equal(renderCount, 1 + result.length, 'forwarded warmup preserves all final production cascades');
    f.bindingsRestored();
  } finally {
    lighting.csm.remove();
    lighting.csm.dispose();
  }
});

console.log('shadowPrime.selftest: exact cascades, weighted caster warmup, task boundaries, lifetime and restoration passed');
