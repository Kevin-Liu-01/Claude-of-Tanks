import assert from 'node:assert/strict';
import { createContextRecovery } from './contextRecovery.ts';
import { Layers } from 'three';
import { routeShadowOnlyLayer, SHADOW_ONLY_LAYER } from './renderLayers.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(onRestored) {
  let timeout;
  const notices = [];
  let reloads = 0;
  let removals = 0;
  let prevented = 0;
  let losses = 0;
  const renderer = { shadowMap: { render() {} },
    userData: { contextRecovery: { onLost() { losses += 1; }, onRestored } } };
  routeShadowOnlyLayer(renderer);
  const controller = createContextRecovery({
    owner: () => renderer.userData.contextRecovery,
    beforeRestore: () => routeShadowOnlyLayer(renderer),
    recordLoss() {},
    notice(state) { notices.push(state); if (state === 'ready') removals++; },
    schedule(callback) { timeout = callback; return 1; },
    cancel() { timeout = undefined; },
  });
  return {
    lost() { controller.lost({ preventDefault() { prevented += 1; } }); },
    restored() { controller.restored(); },
    expire() { timeout?.(); },
    dispose() { controller.dispose(); },
    renderer, notices,
    get reloads() { return reloads; }, get removals() { return removals; },
    get prevented() { return prevented; }, get losses() { return losses; },
  };
}
async function flush() { for (let i = 0; i < 12; i += 1) await Promise.resolve(); }

for (const oldResult of ['reject', 'false', 'success']) {
  const old = deferred();
  const current = deferred();
  let calls = 0;
  const f = fixture(() => (++calls === 1 ? old.promise : current.promise));
  f.lost(); f.restored(); await flush();
  f.lost(); f.restored(); await flush();
  if (oldResult === 'reject') old.reject(new Error('expired context'));
  else old.resolve(oldResult !== 'false');
  await flush();
  assert.equal(f.reloads, 0, `${oldResult}: obsolete recovery cannot reload a newer device`);
  assert.equal(f.removals, 0, `${oldResult}: obsolete recovery cannot dismiss the newer cover`);
  current.resolve(true);
  await flush();
  assert.equal(f.removals, 1);
  assert.equal(f.reloads, 0);
  assert.equal(f.prevented, 2);
  assert.equal(f.losses, 2);
  assert.equal(f.notices.filter(state => state === 'waiting').length, 2);
}

{
  const old = deferred();
  let calls = 0;
  const f = fixture(() => (++calls === 1 ? old.promise : Promise.resolve(true)));
  f.lost(); f.restored(); await flush();
  f.lost(); f.restored(); await flush();
  assert.equal(f.removals, 1, 'newer successful context may complete before older rejection');
  old.reject(new Error('late obsolete rejection'));
  await flush();
  assert.equal(f.reloads, 0);
  assert.equal(f.removals, 1);
}

for (const onRestored of [undefined, () => false, () => { throw new Error('fresh failure'); },
  () => Promise.reject(new Error('fresh asynchronous failure'))]) {
  const f = fixture(onRestored);
  f.lost(); f.restored(); await flush();
  assert.equal(f.reloads, 0, 'recovery failures never automatically discard the match');
  assert.equal(f.notices.at(-1), 'failed', 'offer a manual reload after failure');
  assert.equal(f.removals, 0);
}

{
  let calls = 0;
  const f = fixture(() => { calls += 1; return true; });
  f.lost(); f.restored(); f.lost();
  await flush();
  assert.equal(calls, 0, 'already-obsolete queued callbacks cannot invoke an older application recovery');
  assert.equal(f.removals, 0);
  f.restored(); await flush();
  assert.equal(calls, 1);
  assert.equal(f.removals, 1);
}

// Three replaces shadowMap synchronously in its earlier restore listener.
// Route the replacement before the application hook, not the obsolete owner.
{
  const camera = { layers: new Layers() };
  camera.layers.enable(2); camera.layers.enable(30);
  const mask = camera.layers.mask;
  const lights = [], scene = {};
  const order = [];
  const nativeError = new Error('replacement native shadow failure');
  let fail = false;
  let map;
  const f = fixture(() => {
    order.push('application');
    assert.equal(f.renderer.shadowMap, map, 'recovery uses the replacement owner');
    map.render(lights, scene, camera);
    assert.equal(camera.layers.mask, mask, 'forward rendering retains its exact mask');
    return true;
  });
  const previousMap = f.renderer.shadowMap, previousRoute = previousMap.render;
  const nativeRender = function (actualLights, actualScene, actualCamera) {
    order.push('native-shadow');
    assert.equal(this, map, 'native replacement keeps its receiver');
    assert.equal(actualLights, lights); assert.equal(actualScene, scene); assert.equal(actualCamera, camera);
    assert.equal(camera.layers.mask, mask | (1 << SHADOW_ONLY_LAYER), 'shadow-only proxies participate');
    if (fail) throw nativeError;
  };
  map = { render: nativeRender };
  f.renderer.shadowMap = map;
  f.lost(); f.restored();
  const replacementRoute = map.render;
  assert.notEqual(replacementRoute, nativeRender, 'replacement is routed synchronously before recovery');
  assert.deepEqual(order, [], 'application recovery stays asynchronous');
  assert.equal(previousMap.render, previousRoute, 'obsolete map is not wrapped again');
  f.restored();
  assert.equal(map.render, replacementRoute, 'repeated restore notification never stacks wrappers');
  await flush();
  assert.deepEqual(order, ['application', 'native-shadow'], 'duplicate restore notifications share one recovery');
  assert.equal(f.reloads, 0);
  fail = true;
  assert.throws(() => map.render(lights, scene, camera), error => error === nativeError);
  assert.equal(camera.layers.mask, mask, 'throwing native shadow draw restores the exact mask');

  map = { render: nativeRender };
  f.renderer.shadowMap = map;
  f.lost(); f.restored();
  assert.notEqual(map.render, nativeRender, 'a subsequent fresh map receives its own route');
  await flush();
  assert.equal(f.reloads, 0);
  assert.equal(f.notices.at(-1), 'failed', 'shadow failure offers explicit fallback');
  assert.equal(camera.layers.mask, mask);
}

console.log('rendererContextRecovery.selftest: actual listener generation, replacement shadow routing, order, masks and fallback passed');

{
  const work = deferred();
  const f = fixture(() => work.promise);
  f.lost(); f.expire();
  assert.equal(f.notices.at(-1), 'delayed', 'a missing browser restoration gets a bounded fallback');
  f.restored(); await flush(); f.expire();
  assert.equal(f.notices.at(-1), 'delayed', 'a hung scene restore also offers a fallback');
  work.resolve(true); await flush();
  assert.equal(f.notices.at(-1), 'ready', 'slow recovery can still finish without a reload');
  const count = f.notices.length; f.expire();
  assert.equal(f.notices.length, count, 'completed recovery cancels its fallback timer');
}
{
  const work = deferred(); const f = fixture(() => work.promise);
  f.lost(); f.restored(); await flush(); f.dispose(); work.resolve(true); await flush();
  assert.equal(f.removals, 0, 'disposed renderer cannot finish stale recovery');
}
