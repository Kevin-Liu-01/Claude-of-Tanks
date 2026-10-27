import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { primeShadowCascades } from './shadowPrime.ts';
import { markVehicleShadowDetail } from './nearVehicleShadowDetail.ts';
import { createLighting } from './lighting.ts';
import { setPresetName } from './quality.ts';

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
    assert.ok(activeScene === scene);
    assert.equal(activeCamera.layers.mask, cameraMask);
    draws.push(selected.map((light) => lights.indexOf(light)));
    const cohort = [];
    scene.traverseVisible((object) => {
      if (!(object.isMesh || object.isLine || object.isPoints)) return;
      // the production router (renderLayers routeShadowOnlyLayer) exposes the shadow-only layer while the map traverses
      if (!(object.layers.mask & (activeCamera.layers.mask | (1 << 29)))) return;
      if (!object.castShadow && !(renderer.shadowMap.type === THREE.VSMShadowMap && object.receiveShadow)) return;
      // three's frustum test against the cascade's box, for casters a case places outside it, and a BatchedMesh's
      // per-item cull in its shadow hook (every item outside: an empty draw list, which the router skips)
      if (object.frustumCulled && object.userData.outsideCascade) return;
      if (object.isBatchedMesh && object.perObjectFrustumCulled && object.userData.outsideCascade) return;
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
      assert.ok(activeScene === scene);
      assert.ok(activeCamera === camera);
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
    if (options.outsideCascade) object.userData.outsideCascade = true;
    casters.push({ object, visible: object.visible, cast: object.castShadow, receive: object.receiveShadow,
      culled: object.frustumCulled });
    return object;
  };
  const addBatchedCaster = (name, options = {}) => {
    const material = new THREE.MeshBasicMaterial();
    const object = new THREE.BatchedMesh(1, 24, 36, material);
    object.addInstance(object.addGeometry(new THREE.BoxGeometry()));
    object.name = name;
    object.castShadow = true;
    object.frustumCulled = false;
    object.perObjectFrustumCulled = true;
    if (options.outsideCascade) object.userData.outsideCascade = true;
    scene.add(object);
    casters.push({ object, visible: true, cast: true, receive: false, culled: false, perObject: true });
    return object;
  };
  const casterFlagsRestored = () => {
    for (const { object, visible, cast, receive, culled, perObject } of casters) {
      if (perObject !== undefined) assert.equal(object.perObjectFrustumCulled, perObject, `${object.name}: per-item cull restored`);
      assert.equal(object.visible, visible, `${object.name}: visible restored`);
      assert.equal(object.castShadow, cast, `${object.name}: castShadow restored`);
      assert.equal(object.receiveShadow, receive, `${object.name}: receiveShadow restored`);
      assert.equal(object.frustumCulled, culled, `${object.name}: frustumCulled restored`);
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
    calls, draws, cohorts, addCaster, addBatchedCaster, bindingsRestored, casterFlagsRestored, restored, disposed: () => disposed,
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

// (battle-spikes-253) nav-perf's root-p program log: the horizon ring, far vegetation, the baked prop buckets and a rock
// pool's shadow-only proxy linked their depth programs in the first live frames, outside the first cascade's box at the
// warm and (the proxy) never batched. Each batch's casters draw unculled; shadow-only casters batch with the rest.
await withFixture(async (f) => {
  f.addCaster('near', 3);
  f.addCaster('far', 4, { outsideCascade: true });
  f.addCaster('proxy', 5, { layer: 29 });
  f.addCaster('far-proxy', 6, { layer: 29, outsideCascade: true });
  const batched = f.addBatchedCaster('far-batch', { outsideCascade: true });
  batched._visibilityChanged = false;
  await f.run({ casterWarmup: { maxCastersPerBatch: 1,
    yieldBeforeBatch() { f.bindingsRestored(); }, onBatch() { f.bindingsRestored(); },
  } });
  assert.deepEqual(f.cohorts, [['near'], ['far'], ['proxy'], ['far-proxy'], ['far-batch'],
    ['near', 'proxy'], ['near', 'proxy']], 'every caster draws in its own batch wherever it stands; the cascades after keep their cull');
  // three keeps a BatchedMesh's last draw list while per-item culling is off and no visibility changed
  assert.equal(batched._visibilityChanged, true, 'the batched caster rebuilt its list with every item in it');
  f.restored(true);
});

// (battle-spikes-253) a root the scene holds hidden (an unspotted actor) warms its casters inside the batches only:
// visible during its batch's synchronous render, hidden again at every yield, never drawn by the final cascades
await withFixture(async (f) => {
  f.addCaster('seen', 3);
  const hiddenTank = new THREE.Group();
  hiddenTank.name = 'hidden-tank';
  hiddenTank.visible = false;
  f.scene.add(hiddenTank);
  f.addCaster('hidden-wheels', 4, { parent: hiddenTank });
  const visibleAtYield = [];
  await f.run({ casterWarmup: { maxCastersPerBatch: 1,
    hiddenRoots: () => [hiddenTank, null, undefined],
    yieldBeforeBatch() { visibleAtYield.push(hiddenTank.visible); f.bindingsRestored(); },
    onBatch() { visibleAtYield.push(hiddenTank.visible); f.bindingsRestored(); },
  } });
  assert.deepEqual(f.cohorts, [['seen'], ['hidden-wheels'], ['seen'], ['seen']],
    'the hidden tank draws in its own warm batch and in no final cascade');
  assert.ok(visibleAtYield.length === 4 && visibleAtYield.every((visible) => visible === false), 'hidden at every yield');
  assert.equal(hiddenTank.visible, false);
  f.restored(true);
});

// (2026-10-27, the room-stalls lane) a hull's near shadow detail (castShadow false outside its cascade's pass) warms where
// a mesh brings a depth variant no caster before it has: it casts inside its own batch only and in no final cascade; a
// mesh repeating a warmed variant, and a hidden one, stay out
await withFixture(async (f) => {
  f.addCaster('seen', 3);
  const hull = new THREE.Group();
  hull.name = 'hull-root';
  f.scene.add(hull);
  const plain = f.addCaster('detail-plain', 3, { parent: hull, castShadow: false });
  const twin = f.addCaster('detail-twin', 3, { parent: hull, castShadow: false });
  // a detail mesh that shares the caster before it's material and variant stays out; one with its own material warms
  plain.material = f.scene.getObjectByName('seen').material;
  const cut = f.addCaster('detail-cut', 3, { parent: hull, castShadow: false });
  cut.material.map = new THREE.Texture();
  cut.material.alphaTest = 0.5;
  const stowed = new THREE.Group();
  stowed.visible = false;
  hull.add(stowed);
  const hidden = f.addCaster('detail-hidden', 3, { parent: stowed, castShadow: false });
  hidden.material.displacementMap = new THREE.Texture();
  // a detail mesh in a level its LOD holds hidden warms with its level shown inside each batch; the level's own caster
  // joins the list and casts only in its batch
  const lod = new THREE.LOD();
  hull.add(lod);
  const nearLevel = new THREE.Group(), farLevel = new THREE.Group();
  lod.addLevel(nearLevel, 0);
  lod.addLevel(farLevel, 50);
  const pads = f.addCaster('detail-pads', 3, { parent: farLevel, castShadow: false });
  pads.material.side = THREE.DoubleSide;
  f.addCaster('far-sibling', 3, { parent: farLevel });
  farLevel.visible = false;
  markVehicleShadowDetail(hull, { detail: [plain, twin, cut, hidden, pads], proxies: [] });
  const castAtYield = [];
  await f.run({ casterWarmup: { maxCastersPerBatch: 8,
    yieldBeforeBatch() { castAtYield.push(cut.castShadow); f.bindingsRestored(); },
    onBatch() { castAtYield.push(cut.castShadow); f.bindingsRestored(); },
  } });
  assert.deepEqual(f.cohorts, [['seen', 'detail-twin'], ['detail-cut'], ['detail-pads', 'far-sibling'], ['seen'], ['seen']],
    'the cut-out and the hidden level\'s double-sided detail warm in batches of their own; the plain one repeats a warmed '
    + 'variant; none reaches a final cascade');
  assert.ok(castAtYield.every((cast) => cast === false), 'the detail casts at no yield');
  assert.deepEqual([plain.castShadow, twin.castShadow, cut.castShadow, hidden.castShadow, pads.castShadow, stowed.visible,
    farLevel.visible], [false, false, false, false, false, false, false]);
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

// Changing the split range must not sample a static Garage's old depth maps.
await withFixture(async (f) => {
  const storage = new Map();
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { search: '' },
    localStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  } });
  setPresetName('low');
  const lighting = createLighting(f.scene, f.camera, new THREE.Vector3(1, 1, 1).normalize());
  try {
    lighting.update(true);
    lighting.update();
    lighting.setStaticPresentationDormant(true);
    lighting.update();
    assert.equal(lighting.scheduledMask, 0, 'settled Garage reuses its maps');
    setPresetName('medium');
    lighting.update();
    assert.equal(lighting.scheduledMask & 3, 3,
      'range change refreshes both near cascades before sampling the new projection');
    assert.ok(lighting.csm.lights.slice(0, 2).every(light => light.shadow.needsUpdate));
  } finally {
    lighting.csm.remove(); lighting.csm.dispose();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
  }
});

// Low -> Low context recovery does not change shadow dimensions. Surviving
// CPU DepthTextures must not authorize a two-cascade warm on a fresh renderer.
await withFixture(async (f) => {
  const lighting = createLighting(f.scene, f.camera, new THREE.Vector3(1, 1, 1).normalize());
  let disposed = 0;
  try {
    for (const light of lighting.csm.lights) {
      light.shadow.map = new THREE.WebGLRenderTarget(4, 4);
      light.shadow.map.depthTexture = new THREE.DepthTexture(4, 4);
      light.shadow.map.addEventListener('dispose', () => disposed++);
    }
    lighting.setFarCascadeDormant(true);
    f.renderer.render = () => {};
    assert.equal((await lighting.primeShadowMaps(f.renderer, f.scene, f.camera, { cascadeLimit: 2 })).length, 2,
      'negative control: old CPU texture objects authorize only the two near cascades');
    lighting.setStaticPresentationDormant(true);
    f.renderer.info = {};
    lighting.invalidateShadowMaps();
    assert.equal(disposed, lighting.csm.lights.length, 'every stale target is released');
    assert.ok(lighting.csm.lights.every(light => light.shadow.map === null && light.shadow.mapPass === null));
    lighting.update(false);
    assert.equal(lighting.scheduledMask, (1 << lighting.csm.lights.length) - 1,
      'static and primed latches cannot suppress the restored complete set');
    assert.equal((await lighting.primeShadowMaps(f.renderer, f.scene, f.camera, { cascadeLimit: 2 })).length,
      lighting.csm.lights.length, 'same-layout restoration requires every native depth target to be primed');
  } finally { lighting.csm.remove(); lighting.csm.dispose(); }
});
{
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  const recovery = main.slice(main.indexOf('async onRestored() {'), main.indexOf('// Some mobile browsers discard'));
  assert.ok(recovery.indexOf('lighting.invalidateShadowMaps();') >= 0
    && recovery.indexOf('lighting.invalidateShadowMaps();') < recovery.indexOf('applyGraphicsRecovery();'),
  'context owner invalidates shadow readiness before any quality or covered restore work');
}

// (2026-10-27, the room-stalls lane; a diagnostic room census: the prime's camera on its own layer counted none of the
// battle's 8 point lights, so its depth programs were keyed for a light set no live frame has, and the guard's first frame
// built the player's again, 580 ms) every prime render counts exactly the lights the live camera counts
{
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const cascades = [new THREE.DirectionalLight(), new THREE.DirectionalLight()];
  const points = [new THREE.PointLight(), new THREE.PointLight(), new THREE.PointLight()];
  const hemi = new THREE.HemisphereLight();
  const offLayer = new THREE.PointLight();
  offLayer.layers.set(7);
  scene.add(...cascades, ...points, hemi, offLayer);
  const live = [...cascades, ...points, hemi];
  const before = [...live, offLayer].map((light) => light.layers.mask);
  const cameraMask = camera.layers.mask;
  const counted = [];
  const prior = new THREE.WebGLRenderTarget(4, 4);
  const target = { value: prior, face: 0, mip: 0 };
  const renderer = Object.assign(Object.create(THREE.WebGLRenderer.prototype), {
    info: {},
    shadowMap: { render() {}, type: THREE.PCFSoftShadowMap },
    getContext: () => ({ isContextLost: () => false }),
    getRenderTarget: () => target.value,
    getActiveCubeFace: () => target.face,
    getActiveMipmapLevel: () => target.mip,
    setRenderTarget(next, face = 0, mip = 0) { Object.assign(target, { value: next, face, mip }); },
    render(activeScene, activeCamera) {
      const seen = [];
      activeScene.traverse((object) => { if (object.isLight && object.layers.test(activeCamera.layers)) seen.push(object); });
      counted.push(seen);
    },
  });
  await primeShadowCascades({ renderer, scene, camera, lights: cascades, count: cascades.length });
  assert.ok(counted.length > 0, 'the prime rendered');
  for (const seen of counted) {
    assert.deepEqual(new Set(seen), new Set(live), 'a prime render counts the live camera\'s lights, never one it cannot see');
  }
  assert.deepEqual([...live, offLayer].map((light) => light.layers.mask), before, 'every light\'s layers restored');
  assert.equal(camera.layers.mask, cameraMask);
}

// (the room census: one prime task held 307 ms of a depth program's link) a warm batch takes at most one depth-program
// variant no batch before it took: plain casters batch as before, a new variant opens its own batch
{
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), light = new THREE.DirectionalLight();
  scene.add(light);
  const caster = (name, material) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.castShadow = true;
    scene.add(mesh);
  };
  const plain = new THREE.MeshStandardMaterial();
  const cutout = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), alphaTest: 0.5 });
  const displaced = new THREE.MeshStandardMaterial({ displacementMap: new THREE.Texture() });
  caster('p1', plain); caster('p2', plain); caster('p3', plain); caster('cut', cutout); caster('p4', plain); caster('disp', displaced);
  caster('normals', plain);
  scene.getObjectByName('normals').geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
  const target = { value: null, face: 0, mip: 0 };
  const renderer = Object.assign(Object.create(THREE.WebGLRenderer.prototype), {
    info: {}, shadowMap: { render() {}, type: THREE.PCFSoftShadowMap },
    getContext: () => ({ isContextLost: () => false }),
    getRenderTarget: () => target.value, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    setRenderTarget(next) { target.value = next; },
    render() {},
  });
  const sizes = [];
  await primeShadowCascades({ renderer, scene, camera, lights: [light], count: 1,
    casterWarmup: { onBatch: (batch) => sizes.push(batch.casterCount) } });
  assert.deepEqual(sizes, [3, 2, 1, 1],
    'p1-p3 (one new variant), cut and p4 (cut new), disp (new), and a plain caster with normals (new): one new variant a batch');
}

console.log('shadowPrime.selftest: exact cascades, weighted caster warmup, task boundaries, lifetime and restoration passed; every prime render counts the live camera\'s lights; one new depth variant a warm batch; a hull\'s near shadow detail warms where it brings a new variant');
