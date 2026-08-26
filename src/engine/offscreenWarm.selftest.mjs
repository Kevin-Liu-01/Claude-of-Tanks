import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOffscreenSceneWarmer, warmSceneOffscreenBatched } from './offscreenWarm.js';

function fakeRenderer({ throwOnRender = false } = {}) {
  const prior = { name: 'prior-target' };
  const calls = [];
  let current = prior;
  return {
    prior,
    calls,
    getDrawingBufferSize(out) { return out.set(2000, 1000); },
    getRenderTarget() { return current; },
    getActiveCubeFace() { return 3; },
    getActiveMipmapLevel() { return 2; },
    setViewport() { assert.fail('warm-up must not mutate the canvas viewport'); },
    setRenderTarget(target, face = 0, mip = 0) {
      current = target;
      calls.push({ kind: 'target', target, face, mip });
    },
    render(scene, camera) {
      assert.notEqual(current, null, 'warm-up rendered to the default framebuffer');
      assert.notEqual(current, prior, 'warm-up rendered into the caller target');
      assert.equal(current.width, 500);
      assert.equal(current.height, 250);
      calls.push({ kind: 'render', scene, camera, target: current });
      if (throwOnRender) throw new Error('synthetic render failure');
    },
  };
}

{
  const renderer = fakeRenderer();
  const scene = { name: 'scene' };
  const camera = { name: 'camera' };
  const warm = createOffscreenSceneWarmer(renderer, scene, camera);
  warm();

  assert.equal(renderer.calls[0].kind, 'target');
  assert.equal(renderer.calls[1].kind, 'render');
  assert.deepEqual(renderer.calls.at(-1), {
    kind: 'target', target: renderer.prior, face: 3, mip: 2,
  });
  const firstTarget = renderer.calls.find((call) => call.kind === 'render').target;
  warm.dispose();
  warm();
  const renderCalls = renderer.calls.filter((call) => call.kind === 'render');
  assert.notEqual(renderCalls.at(-1).target, firstTarget,
    'disposing a temporary warmer releases and recreates its private target');
}

{
  const renderer = fakeRenderer({ throwOnRender: true });
  const warm = createOffscreenSceneWarmer(renderer, {}, {});
  assert.throws(() => warm(), /synthetic render failure/);
  assert.deepEqual(renderer.calls.at(-1), {
    kind: 'target', target: renderer.prior, face: 3, mip: 2,
  }, 'the caller render target must be restored after a failed warm-up');
}

{
  const renderer = fakeRenderer();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const meshes = Array.from({ length: 3 }, () =>
    new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  scene.add(...meshes);
  const masks = meshes.map((mesh) => mesh.layers.mask);
  let yields = 0;
  const timings = await warmSceneOffscreenBatched(renderer, scene, camera, {
    scale: 0.25,
    maxObjects: 1,
    maxWeight: Infinity,
    yieldBeforeBatch: async () => { yields++; },
  });
  assert.equal(timings.length, 3, 'one-object limit creates bounded warm batches');
  assert.equal(yields, 3, 'each upload batch yields before submitting work');
  assert.deepEqual(meshes.map((mesh) => mesh.layers.mask), masks,
    'batched warm restores every production layer mask');
}

console.log('offscreenWarm self-test passed');
