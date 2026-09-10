import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Layers } from 'three';
import { routeShadowOnlyLayer, SHADOW_ONLY_LAYER } from './renderLayers.ts';

// Execute the actual installed listeners without constructing a GPU. Keeping
// the source boundary explicit catches omissions in success, false and catch.
const source = await readFile(new URL('./renderer.ts', import.meta.url), 'utf8');
const listenersSource = source.match(/  let contextRecoveryGeneration = 0;([\s\S]*?)\n\n  const width =/)?.[0];
assert.ok(listenersSource, 'production renderer context listeners remain directly exercised');
const install = new Function('renderer', 'window', 'document', 'showContextLossOverlay', 'routeShadowOnlyLayer',
  listenersSource.slice(0, listenersSource.lastIndexOf('\n\n  const width =')));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(onRestored) {
  const listeners = new Map();
  const notices = [];
  let reloads = 0;
  let removals = 0;
  let prevented = 0;
  let losses = 0;
  const renderer = { domElement: { addEventListener(name, callback) { listeners.set(name, callback); } },
    shadowMap: { render() {} },
    userData: { contextRecovery: { onLost() { losses += 1; }, onRestored } } };
  routeShadowOnlyLayer(renderer); // Match the initially installed renderer adapter.
  install(renderer, { location: { reload() { reloads += 1; } } },
    { getElementById(id) { assert.equal(id, 'cot-ctxlost'); return { remove() { removals += 1; } }; } },
    (recovering) => notices.push(recovering), routeShadowOnlyLayer);
  return {
    lost() { listeners.get('webglcontextlost')({ preventDefault() { prevented += 1; } }); },
    restored() { listeners.get('webglcontextrestored')(); },
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
  assert.deepEqual(f.notices, [true, true]);
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
  assert.equal(f.reloads, 1, 'current-generation failures preserve the existing reload fallback');
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
  assert.deepEqual(order, ['application', 'native-shadow', 'application', 'native-shadow']);
  assert.equal(f.reloads, 0);
  fail = true;
  assert.throws(() => map.render(lights, scene, camera), error => error === nativeError);
  assert.equal(camera.layers.mask, mask, 'throwing native shadow draw restores the exact mask');

  map = { render: nativeRender };
  f.renderer.shadowMap = map;
  f.lost(); f.restored();
  assert.notEqual(map.render, nativeRender, 'a subsequent fresh map receives its own route');
  await flush();
  assert.equal(f.reloads, 1, 'current shadow failure retains the existing application-recovery fallback');
  assert.equal(camera.layers.mask, mask);
}

console.log('rendererContextRecovery.selftest: actual listener generation, replacement shadow routing, order, masks and fallback passed');
