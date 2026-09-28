import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  SHADOW_ONLY_LAYER,
  markShadowOnly,
  routeShadowOnlyLayer,
  renderShadowOnlyWarm,
  registerShadowCascadeCamera,
  setShadowCascadePolicy,
  setShadowCasterCascades,
  shadowCasterCascadesOf,
  shadowCascadeIndexOfCamera,
  routeZeroCountDraws,
  SHADOW_CASTER_LAST_CASCADE,
  SHADOW_CASTER_ALL_CASCADES,
  setShadowCasterProfile,
  shadowCasterProfileOf,
  forEachShadowCasterProfile,
  setShadowCasterDynamicMask,
  shadowCasterDynamicMaskOf,
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

// Round 78 (2026-09-26): per-cascade caster masks — a caster registered with a bit mask renders into those cascades
// only: the router splits the lights (with or without a policy) and hides the caster around every other cascade's
// pass, restoring it before the forward render. A caster that is already hidden stays hidden; an unregistered one
// is never touched; forgetting the mask returns the router to three's single call.
{
  setShadowCascadePolicy(null);
  const lights = [0, 1, 2, 3].map(() => new THREE.DirectionalLight());
  lights.forEach((light, i) => registerShadowCascadeCamera(light.shadow.camera, i));
  assert.equal(shadowCascadeIndexOfCamera(lights[2].shadow.camera), 2);
  assert.equal(shadowCascadeIndexOfCamera(new THREE.OrthographicCamera()), -1, 'an unregistered shadow camera answers -1');
  const scene = new THREE.Scene();
  const gobos = [0, 1, 2, 3].map(() => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()));
  const nearOnly = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  const plain = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  const parked = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  parked.visible = false;
  scene.add(...gobos, nearOnly, plain, parked);
  const camera = new THREE.PerspectiveCamera();
  const calls = [];
  const renderer = { shadowMap: { render(actualLights) {
    calls.push({ lights: actualLights.slice(), visible: [...gobos.map((g) => g.visible), nearOnly.visible, plain.visible, parked.visible] });
  } } };
  routeShadowOnlyLayer(renderer);
  renderer.shadowMap.render(lights, scene, camera);
  assert.equal(calls.length, 1, 'no mask and no policy: three\'s single call');
  gobos.forEach((gobo, i) => setShadowCasterCascades(gobo, 1 << i));
  setShadowCasterCascades(nearOnly, 0b0011);
  assert.equal(shadowCasterCascadesOf(gobos[3]), 0b1000);
  assert.equal(shadowCasterCascadesOf(plain), null);
  calls.length = 0;
  renderer.shadowMap.render(lights, scene, camera);
  assert.equal(calls.length, 4, 'masked casters split the lights without a policy');
  calls.forEach((call, i) => {
    assert.deepEqual(call.lights, [lights[i]], `cascade ${i} rendered alone`);
    assert.deepEqual(call.visible.slice(0, 4), [0, 1, 2, 3].map((g) => g === i), `only gobo ${i} is visible in cascade ${i}`);
    assert.equal(call.visible[4], i < 2, 'the near-only caster casts into cascades 0 and 1');
    assert.equal(call.visible[5], true, 'an unregistered caster is never touched');
    assert.equal(call.visible[6], false, 'a hidden caster stays hidden');
  });
  assert.ok(gobos.every((g) => g.visible) && nearOnly.visible && plain.visible && !parked.visible, 'every flag restored after the pass');
  // the restore holds when three throws inside a cascade
  gobos[1].visible = true;
  const throwing = { shadowMap: { render(actualLights) { if (actualLights[0] === lights[1]) throw new Error('cascade 1'); } } };
  routeShadowOnlyLayer(throwing);
  assert.throws(() => throwing.shadowMap.render(lights, scene, camera), /cascade 1/);
  assert.ok(gobos.every((g) => g.visible), 'a throw inside a cascade still restores the hidden casters');
  // a single light (the deployment shadow warm) is never split
  calls.length = 0;
  renderer.shadowMap.render([lights[0]], scene, camera);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].visible.slice(0, 4), [true, true, true, true], 'one light: nothing hidden');
  // forgetting the masks returns the router to the single call
  gobos.forEach((gobo) => setShadowCasterCascades(gobo, null));
  setShadowCasterCascades(nearOnly, null);
  assert.equal(shadowCasterCascadesOf(gobos[0]), null);
  calls.length = 0;
  renderer.shadowMap.render(lights, scene, camera);
  assert.equal(calls.length, 1, 'no masks left: three\'s single call again');
}
// Round 78: the "last cascade only" flag is resolved against the light set at render time (three lights on the
// phones, four on the desktop), so a world that cannot know the tier's cascade count still names the far map.
{
  setShadowCascadePolicy(null);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  const scene = new THREE.Scene(); scene.add(rim);
  const camera = new THREE.PerspectiveCamera();
  setShadowCasterCascades(rim, SHADOW_CASTER_LAST_CASCADE);
  assert.equal(shadowCasterCascadesOf(rim), SHADOW_CASTER_LAST_CASCADE);
  for (const count of [3, 4]) {
    const lights = Array.from({ length: count }, () => new THREE.DirectionalLight());
    lights.forEach((light, i) => registerShadowCascadeCamera(light.shadow.camera, i));
    const seen = [];
    const renderer = { shadowMap: { render() { seen.push(rim.visible); } } };
    routeShadowOnlyLayer(renderer);
    renderer.shadowMap.render(lights, scene, camera);
    assert.deepEqual(seen, Array.from({ length: count }, (_, i) => i === count - 1), `${count} cascades: the rim casts into the last one only`);
    assert.equal(rim.visible, true);
  }
  setShadowCasterCascades(rim, null);
}
// Round 78: a zero-count InstancedMesh never reaches three's renderBufferDirect (whose program / uniform / binding
// setup runs before renderInstances returns on primcount 0); every other draw passes through unchanged.
{
  const calls = [];
  const renderer = {
    shadowMap: { render() {} },
    renderBufferDirect(camera, scene, geometry, material, object, group) { calls.push([object.name, this === renderer, group]); },
  };
  routeShadowOnlyLayer(renderer);
  const routed = renderer.renderBufferDirect;
  routeZeroCountDraws(renderer);
  assert.equal(renderer.renderBufferDirect, routed, 'routed once per renderer');
  const geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshBasicMaterial();
  const empty = new THREE.InstancedMesh(geometry, material, 4); empty.count = 0; empty.name = 'empty';
  const some = new THREE.InstancedMesh(geometry, material, 4); some.count = 2; some.name = 'some';
  const plain = new THREE.Mesh(geometry, material); plain.name = 'plain';
  const camera = new THREE.PerspectiveCamera(), scene = new THREE.Scene();
  for (const object of [empty, some, plain]) renderer.renderBufferDirect(camera, scene, geometry, material, object, null);
  assert.deepEqual(calls, [['some', true, null], ['plain', true, null]], 'the zero-count draw is skipped before the setup; the rest pass through with their receiver');
  assert.doesNotThrow(() => routeZeroCountDraws({ shadowMap: { render() {} } }), 'a renderer without the method is left alone');
}

// Round 79 (2026-09-28, the performance lane): caster profiles and dynamic masks. A profile is retained by
// reference and walked by the evaluator; the evaluator's dynamic mask hides a caster like a static mask does, and
// the two compose (a cascade is drawn only when both admit it); a profile awaiting its first evaluation is never
// touched; forgetting the last of a caster's mask, dynamic mask and profile unlists it and the router returns to
// three's single call.
{
  setShadowCascadePolicy(null);
  const lights = [0, 1, 2, 3].map(() => new THREE.DirectionalLight());
  lights.forEach((light, i) => registerShadowCascadeCamera(light.shadow.camera, i));
  const scene = new THREE.Scene();
  const bucket = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  const both = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  const pending = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  scene.add(bucket, both, pending);
  const camera = new THREE.PerspectiveCamera();
  const calls = [];
  const renderer = { shadowMap: { render(actualLights) { calls.push([bucket.visible, both.visible, pending.visible]); } } };
  routeShadowOnlyLayer(renderer);
  renderer.shadowMap.render(lights, scene, camera);
  assert.equal(calls.length, 1, 'nothing registered: the single call');
  assert.equal(SHADOW_CASTER_ALL_CASCADES & 0b1111, 0b1111);
  const profile = { heightM: 1.5, spheres: new Float32Array([0, 0, 0, 3]), reachM: 40 };
  setShadowCasterProfile(bucket, profile);
  setShadowCasterProfile(pending, { heightM: 2 });
  assert.equal(shadowCasterProfileOf(bucket), profile, 'the profile object is retained by reference');
  assert.equal(shadowCasterDynamicMaskOf(bucket), null, 'no dynamic mask before an evaluation');
  const walked = [];
  forEachShadowCasterProfile((object, p) => walked.push([object, p]));
  assert.deepEqual(walked, [[bucket, profile], [pending, shadowCasterProfileOf(pending)]], 'the walk visits every profile once, in registration order');
  calls.length = 0;
  renderer.shadowMap.render(lights, scene, camera);
  assert.equal(calls.length, 4, 'a registered profile splits the lights');
  assert.ok(calls.every((c) => c[0] && c[2]), 'profiles awaiting their first evaluation are never hidden');
  // the evaluator's answer: the bucket draws into cascades 1 and 2 only this frame
  setShadowCasterDynamicMask(bucket, 0b0110);
  assert.equal(shadowCasterDynamicMaskOf(bucket), 0b0110);
  // a caster with a static mask (near cascades) AND a dynamic mask (content in the far ones) draws where both admit
  setShadowCasterCascades(both, 0b0011);
  setShadowCasterDynamicMask(both, 0b1010);
  calls.length = 0;
  renderer.shadowMap.render(lights, scene, camera);
  assert.deepEqual(calls.map((c) => c[0]), [false, true, true, false], 'the dynamic mask hides the bucket around cascades 0 and 3');
  assert.deepEqual(calls.map((c) => c[1]), [false, true, false, false], 'static AND dynamic: cascade 1 alone');
  assert.deepEqual(calls.map((c) => c[2]), [true, true, true, true], 'the pending profile draws everywhere');
  assert.ok(bucket.visible && both.visible && pending.visible, 'every flag restored after the pass');
  // the last cascade flag and a dynamic mask compose the same way
  setShadowCasterCascades(both, SHADOW_CASTER_LAST_CASCADE);
  calls.length = 0;
  renderer.shadowMap.render(lights, scene, camera);
  assert.deepEqual(calls.map((c) => c[1]), [false, false, false, true], 'last-cascade flag with a dynamic mask admitting bit 3');
  setShadowCasterDynamicMask(both, 0b0111);
  calls.length = 0;
  renderer.shadowMap.render(lights, scene, camera);
  assert.deepEqual(calls.map((c) => c[1]), [false, false, false, false], 'last-cascade flag with a dynamic mask excluding bit 3: never drawn');
  // forgetting: the profile goes with its dynamic mask; a bare caster is unlisted; the router returns to one call
  setShadowCasterProfile(bucket, null);
  assert.equal(shadowCasterProfileOf(bucket), null);
  assert.equal(shadowCasterDynamicMaskOf(bucket), null, 'forgetting the profile clears its dynamic mask');
  setShadowCasterProfile(pending, null);
  setShadowCasterCascades(both, null);
  calls.length = 0;
  renderer.shadowMap.render(lights, scene, camera);
  assert.equal(calls.length, 4, 'a dynamic mask alone still splits the lights');
  setShadowCasterDynamicMask(both, null);
  calls.length = 0;
  renderer.shadowMap.render(lights, scene, camera);
  assert.equal(calls.length, 1, 'nothing left registered: three\'s single call again');
  // re-registering after a full forget lists the caster once
  setShadowCasterProfile(bucket, profile);
  setShadowCasterDynamicMask(bucket, 0b0001);
  setShadowCasterCascades(bucket, 0b0011);
  const seen = [];
  forEachShadowCasterProfile((object) => seen.push(object));
  assert.deepEqual(seen, [bucket], 'one listing per caster whatever the registration order');
  setShadowCasterProfile(bucket, null);
  setShadowCasterCascades(bucket, null);
}
console.log('renderLayers.selftest: the shadow-only layer, the warm scope, the round-78 per-cascade caster masks (with the last-cascade flag), the zero-count early-out and the round-79 caster profiles / dynamic masks pinned');
