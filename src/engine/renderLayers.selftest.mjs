import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  SHADOW_ONLY_LAYER,
  markShadowOnly,
  routeShadowOnlyLayer,
  renderShadowOnlyWarm,
} from './renderLayers.ts';

const proxy = markShadowOnly(new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ colorWrite: false }),
));
const presentationCamera = new THREE.PerspectiveCamera();
let maskInsideShadowRender = 0;
const renderer = {
  shadowMap: {
    render(_lights, _scene, camera) { maskInsideShadowRender = camera.layers.mask; },
  },
};
routeShadowOnlyLayer(renderer);
routeShadowOnlyLayer(renderer);
const presentationMask = presentationCamera.layers.mask;
renderer.shadowMap.render([], new THREE.Scene(), presentationCamera);

assert.equal(SHADOW_ONLY_LAYER, 29, 'shadow proxies stay clear of late FX layer 30');
assert.equal(proxy.layers.test(presentationCamera.layers), false,
  'presentation cameras never submit invisible proxy geometry');
assert.notEqual(maskInsideShadowRender & (1 << SHADOW_ONLY_LAYER), 0,
  'native shadow traversal sees authored proxy casters');
assert.equal(presentationCamera.layers.mask, presentationMask,
  'the exact presentation mask is restored before forward rendering');
assert.equal(proxy.userData.shadowOnly, true, 'debug/audit semantics remain explicit');

function warmFixture({ routed = true } = {}) {
  const camera = new THREE.PerspectiveCamera();
  camera.layers.enable(3);
  const mask = camera.layers.mask;
  const scene = new THREE.Scene();
  const lights = [new THREE.DirectionalLight()];
  const order = [];
  let duringShadow = () => {};
  const shadowMap = {
    render(actualLights, actualScene, actualCamera) {
      assert.equal(this, shadowMap);
      assert.equal(actualLights, lights);
      assert.equal(actualScene, scene);
      assert.equal(actualCamera, camera);
      order.push(['shadow', actualCamera.layers.mask]);
      duringShadow();
    },
  };
  const renderer = { shadowMap };
  if (routed) routeShadowOnlyLayer(renderer);
  function render() {
    order.push(['collect', camera.layers.mask]);
    assert.ok(lights[0].layers.test(camera.layers), 'collect lights before narrowing any camera mask');
    renderer.shadowMap.render(lights, scene, camera);
    order.push(['forward', camera.layers.mask]);
  }
  return { camera, mask, scene, lights, order, renderer, shadowMap, render,
    set duringShadow(callback) { duringShadow = callback; } };
}

{
  const f = warmFixture();
  const hooks = [f.camera.onBeforeRender, f.camera.onAfterRender];
  const routed = f.shadowMap.render;
  renderShadowOnlyWarm(f.renderer, f.camera, f.render);
  assert.deepEqual(f.order, [['collect', f.mask], ['shadow', f.mask | (1 << SHADOW_ONLY_LAYER)], ['forward', 0]]);
  assert.equal(f.camera.layers.mask, f.mask);
  assert.equal(f.shadowMap.render, routed, 'the scope never installs a temporary renderer wrapper');
  assert.deepEqual([f.camera.onBeforeRender, f.camera.onAfterRender], hooks);
  f.order.length = 0;
  f.render();
  assert.deepEqual(f.order, [['collect', f.mask], ['shadow', f.mask | (1 << SHADOW_ONLY_LAYER)], ['forward', f.mask]],
    'the following ordinary render has no retained warm scope');
}

for (const failureStage of ['before', 'shadow', 'after']) {
  const f = warmFixture();
  const failure = new Error(failureStage);
  if (failureStage === 'shadow') f.duringShadow = () => { throw failure; };
  assert.throws(() => renderShadowOnlyWarm(f.renderer, f.camera, () => {
    if (failureStage === 'before') throw failure;
    f.render();
    if (failureStage === 'after') throw failure;
  }), error => error === failure);
  assert.equal(f.camera.layers.mask, f.mask);
  f.duringShadow = () => {};
  f.render();
  assert.deepEqual(f.order.at(-1), ['forward', f.mask], 'interrupted scope cannot mute a later render');
}

// Nested renders may start either inside native shadow traversal (+29) or
// after it (mask0). Each collects using the original caster mask and restores
// its caller's exact intermediate state, including on rejection.
for (const nestedAt of ['shadow', 'forward']) {
  for (const fail of [false, true]) {
    const f = warmFixture();
    const failure = new Error('nested warm');
    let nested = false;
    function renderNested() {
      const priorMask = f.camera.layers.mask;
      const invoke = () => renderShadowOnlyWarm(f.renderer, f.camera, () => {
        f.render();
        if (fail) throw failure;
      });
      if (fail) assert.throws(invoke, error => error === failure);
      else invoke();
      assert.equal(f.camera.layers.mask, priorMask);
    }
    if (nestedAt === 'shadow') f.duringShadow = () => {
      if (nested) return;
      nested = true;
      renderNested();
    };
    renderShadowOnlyWarm(f.renderer, f.camera, () => {
      f.render();
      if (nestedAt === 'forward') renderNested();
      assert.equal(f.camera.layers.mask, 0, 'inner cleanup restores the still-active outer scope');
    });
    assert.equal(f.camera.layers.mask, f.mask);
    assert.ok(f.order.filter(([stage]) => stage === 'collect').every(([, mask]) => mask === f.mask));
    assert.ok(f.order.filter(([stage]) => stage === 'forward').every(([, mask]) => mask === 0));
    f.duringShadow = () => {};
    f.render();
    assert.deepEqual(f.order.at(-1), ['forward', f.mask]);
  }
}

for (const ownershipLoss of ['missing', 'method-before', 'method-during', 'map-during']) {
  const f = warmFixture({ routed: ownershipLoss !== 'missing' });
  const replacement = function () { f.order.push(['replacement', f.camera.layers.mask]); };
  const replacementMap = { render: replacement };
  if (ownershipLoss === 'method-before') f.shadowMap.render = replacement;
  if (ownershipLoss === 'method-during') f.duringShadow = () => { f.shadowMap.render = replacement; };
  if (ownershipLoss === 'map-during') f.duringShadow = () => { f.renderer.shadowMap = replacementMap; };
  renderShadowOnlyWarm(f.renderer, f.camera, f.render);
  assert.deepEqual(f.order.at(-1), ['forward', f.mask], 'unknown or interrupted routing fails open to ordinary rendering');
  assert.equal(f.camera.layers.mask, f.mask);
  if (ownershipLoss.startsWith('method')) assert.equal(f.shadowMap.render, replacement);
  if (ownershipLoss === 'map-during') assert.equal(f.renderer.shadowMap, replacementMap);
}

{
  const f = warmFixture();
  const other = warmFixture();
  renderShadowOnlyWarm(f.renderer, f.camera, () => {
    other.render();
    assert.deepEqual(other.order.at(-1), ['forward', other.mask], 'another camera/renderer is never borrowed');
    f.render();
  });
  assert.equal(f.camera.layers.mask, f.mask);
  assert.equal(other.camera.layers.mask, other.mask);
}

{
  const f = warmFixture();
  const replacementMap = { render: f.shadowMap.render };
  // Context replacement needs its own native renderer and registration, not
  // an inherited marker or copied wrapper from the obsolete shadowMap.
  f.renderer.shadowMap = replacementMap;
  renderShadowOnlyWarm(f.renderer, f.camera, f.render);
  assert.deepEqual(f.order.at(-1), ['forward', f.mask]);
  assert.equal(f.camera.layers.mask, f.mask);
}

proxy.geometry.dispose();
proxy.material.dispose();
console.log('renderLayers.selftest: shadow routing and scoped warm suppression/restoration passed');
