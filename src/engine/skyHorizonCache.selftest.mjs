import assert from 'node:assert/strict';
import * as THREE from 'three';
import { sampleHorizonColor } from './sky.ts';

const sun = new THREE.Vector3(0.6, 0.5, 0.4).normalize();
const preset = {
  skyIntensity: 1, turbidity: 4, rayleigh: 1.2,
  mieCoefficient: 0.006, mieDirectionalG: 0.82,
};

function fixture() {
  const original = { target: new THREE.WebGLCubeRenderTarget(8), face: 4, mip: 2 };
  let bound = { ...original };
  let lost = false;
  let context = { isContextLost: () => lost };
  const counts = { render: 0, read: 0, targetDisposals: 0, geometryDisposals: 0, materialDisposals: 0 };
  const targets = new WeakSet();
  const resources = new WeakSet();
  let failure = '', black = false, bright = false;
  const renderer = {
    info: {}, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace, xr: { isPresenting: false },
    getContext: () => context,
    getRenderTarget: () => bound.target,
    getActiveCubeFace: () => bound.face,
    getActiveMipmapLevel: () => bound.mip,
    setRenderTarget(target, face = 0, mip = 0) {
      if (target !== original.target && !targets.has(target)) {
        targets.add(target);
        assert.equal(target.width, 16); assert.equal(target.height, 16);
        assert.equal(target.depthBuffer, false); assert.equal(target.stencilBuffer, false);
        target.addEventListener('dispose', () => counts.targetDisposals++);
      }
      if (target === original.target && failure === 'restore') throw new Error('restore failed');
      bound = { target, face, mip };
    },
    render(scene, camera) {
      counts.render++;
      const sky = scene.children[0];
      assert.equal(scene.children.length, 1, 'miss retains the isolated single-sky probe');
      assert.equal(sky.scale.x, 50);
      const direction = camera.getWorldDirection(new THREE.Vector3());
      const expected = sky.material.uniforms.sunPosition.value.clone();
      expected.y = 0; expected.negate().normalize();
      assert.ok(direction.distanceTo(expected) < 1e-12, 'camera retains the exact anti-sun horizon direction');
      for (const [resource, counter] of [[sky.geometry, 'geometryDisposals'], [sky.material, 'materialDisposals']]) {
        if (!resources.has(resource)) {
          resources.add(resource); resource.addEventListener('dispose', () => counts[counter]++);
        }
      }
      if (failure === 'render') throw new Error('render failed');
    },
    readRenderTargetPixels(target, x, y, width, height, row) {
      counts.read++;
      assert.deepEqual([x, y, width, height, row.length], [0, 8, 16, 1, 64]);
      assert.deepEqual(bound, original, 'readback restores the exact previous target/face/mip first');
      if (failure === 'read') throw new Error('read failed');
      const rgb = black || lost ? [0, 0, 0] : bright ? [255, 255, 255] : [60, 80, 100];
      for (let index = 0; index < row.length; index += 4) row.set([...rgb, 255], index);
    },
  };
  return {
    renderer, original, counts,
    setLost(value) { lost = value; },
    replaceContext() { context = { isContextLost: () => lost }; },
    setFailure(value) { failure = value; }, setBlack(value) { black = value; }, setBright(value) { bright = value; },
    sample(nextPreset = preset, nextSun = sun) { return sampleHorizonColor(renderer, nextSun, nextPreset); },
    assertRestored() { assert.deepEqual(bound, original); },
  };
}

const basic = fixture();
const first = basic.sample();
assert.deepEqual(first.toArray(), [60 / 255, 80 / 255, 100 / 255], 'original linear row average is unchanged');
const second = basic.sample({ ...preset }, sun.clone());
assert.deepEqual(first.toArray(), second.toArray());
assert.notEqual(first, second, 'callers never receive the cached color object');
first.setRGB(0, 0, 0); second.setRGB(1, 0, 0);
assert.deepEqual(basic.sample().toArray(), [60 / 255, 80 / 255, 100 / 255], 'caller mutation cannot poison a retained sample');
assert.equal(basic.counts.render, 1); assert.equal(basic.counts.read, 1);
assert.deepEqual(basic.counts, { render: 1, read: 1, targetDisposals: 1, geometryDisposals: 1, materialDisposals: 1 },
  'a cache retains only CPU RGB; all miss GPU resources are disposed');
basic.assertRestored();

for (const key of Object.keys(preset)) {
  const f = fixture(); f.sample();
  f.sample({ ...preset, [key]: preset[key] + 0.01 });
  assert.equal(f.counts.render, 2, `${key}: every sky shader scalar participates in the exact key`);
}
for (const key of ['x', 'y', 'z']) {
  const f = fixture(); f.sample();
  const moved = sun.clone(); moved[key] += 0.01;
  f.sample(preset, moved);
  assert.equal(f.counts.render, 2, `${key}: exact sun vector changes require a fresh sample`);
}
const unusedPreset = fixture(); unusedPreset.sample();
unusedPreset.sample({ ...preset, fogDensity: 0.001, cloudOpacity: 0.5, envIntensity: 0.2 });
assert.equal(unusedPreset.counts.render, 1, 'fog/cloud/environment-only fields do not affect this isolated sky shader');

for (const [key, value] of [['toneMapping', THREE.NoToneMapping], ['toneMappingExposure', 0.65], ['outputColorSpace', THREE.LinearSRGBColorSpace]]) {
  const f = fixture(); f.sample(); f.renderer[key] = value; f.sample();
  assert.equal(f.counts.render, 2, `${key}: renderer output settings are conservatively keyed`);
}
const wasColorManagementEnabled = THREE.ColorManagement.enabled;
const previousWorkingSpace = THREE.ColorManagement.workingColorSpace;
try {
  const f = fixture(); f.sample();
  THREE.ColorManagement.enabled = !wasColorManagementEnabled;
  f.sample(); assert.equal(f.counts.render, 2, 'color-management conversion mode participates in the key');
  THREE.ColorManagement.enabled = wasColorManagementEnabled;
  THREE.ColorManagement.workingColorSpace = THREE.SRGBColorSpace;
  f.sample(); assert.equal(f.counts.render, 3, 'working color-space changes cannot reuse an earlier conversion');
} finally {
  THREE.ColorManagement.enabled = wasColorManagementEnabled;
  THREE.ColorManagement.workingColorSpace = previousWorkingSpace;
}

const dayNight = fixture();
const day = dayNight.sample(); const nightPreset = { ...preset, skyIntensity: 0.018 };
dayNight.sample(nightPreset); dayNight.sample(preset); dayNight.sample(nightPreset);
assert.equal(dayNight.counts.render, 2, 'day/night/day retains separate exact atmosphere samples');
assert.deepEqual(dayNight.sample().toArray(), day.toArray());

const bounded = fixture();
for (let value = 0; value < 4; value++) bounded.sample({ ...preset, turbidity: value });
bounded.sample({ ...preset, turbidity: 0 }); // touch the oldest
bounded.sample({ ...preset, turbidity: 4 }); // evict 1
bounded.sample({ ...preset, turbidity: 0 });
assert.equal(bounded.counts.render, 5, 'recently reused results survive the four-entry bound');
bounded.sample({ ...preset, turbidity: 1 });
assert.equal(bounded.counts.render, 6, 'fifth unique signature evicts the least recently used entry');
assert.equal(fixture().sample().r, 60 / 255, 'different renderers sample independently');

for (const boundary of ['context', 'info', 'lost']) {
  const f = fixture(); f.sample();
  if (boundary === 'context') f.replaceContext();
  else if (boundary === 'info') f.renderer.info = {};
  else { f.setLost(true); f.sample(); f.setLost(false); }
  f.sample();
  assert.equal(f.counts.render, boundary === 'lost' ? 3 : 2,
    `${boundary}: restored/replaced/lost context cannot reuse stale samples`);
  f.sample();
  assert.equal(f.counts.render, boundary === 'lost' ? 3 : 2, 'only the newly healthy lifetime is retained');
}
const black = fixture(); black.setBlack(true); const fallback = black.sample(); black.sample();
assert.equal(black.counts.render, 2, 'black fallback never becomes a successful retained sample');
black.setBlack(false); assert.notDeepEqual(black.sample().toArray(), fallback.toArray());
assert.equal(black.counts.render, 3); black.sample(); assert.equal(black.counts.render, 3);

const bright = fixture(); bright.setBright(true);
const capped = bright.sample();
assert.ok(Math.abs(capped.r - 0.45) < 1e-12 && capped.r === capped.g && capped.g === capped.b,
  'the original luminance ceiling and hue preservation remain unchanged');
assert.deepEqual(bright.sample().toArray(), capped.toArray());

for (const failure of ['render', 'read', 'restore']) {
  const f = fixture(); f.setFailure(failure);
  assert.throws(() => f.sample(), new RegExp(`${failure} failed`));
  assert.equal(f.counts.targetDisposals, 1); assert.equal(f.counts.geometryDisposals, 1);
  assert.equal(f.counts.materialDisposals, 1, `${failure}: even restoration failure releases every temporary GPU resource`);
  if (failure !== 'restore') f.assertRestored();
  f.setFailure(''); f.renderer.setRenderTarget(f.original.target, f.original.face, f.original.mip);
  f.sample(); assert.equal(f.counts.render, 2, 'failed probes remain retryable');
  f.sample(); assert.equal(f.counts.render, 2);
}

const xr = fixture(); xr.renderer.xr.isPresenting = true; xr.sample(); xr.sample();
assert.equal(xr.counts.render, 2, 'XR camera overrides cannot enter the fixed-camera sample cache');

console.log('skyHorizonCache.selftest: exact bounded CPU reuse, context lifetime, and original probe cleanup passed');
