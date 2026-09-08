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
  };
  const renderer = Object.assign(Object.create(THREE.WebGLRenderer.prototype), {
    info: {},
    shadowMap: { render: originalRender },
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
  const restored = (success = false) => {
    assert.equal(renderer.shadowMap.render, originalRender, 'restore exact wrapper identity');
    assert.equal(camera.layers.mask, cameraMask);
    lights.forEach((light, index) => {
      assert.equal(light.layers.mask, saved[index].mask);
      assert.equal(light.shadow.autoUpdate, success ? false : saved[index].auto);
      assert.equal(light.shadow.needsUpdate, success ? false : saved[index].needs);
    });
  };
  return { run, renderer, scene, camera, lights, target, prior, context, failures, hooks,
    calls, draws, restored, disposed: () => disposed,
    cleanup() { prior.dispose(); } };
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

console.log('shadowPrime.selftest: exact cascades, task boundaries, lifetime and restoration passed');
