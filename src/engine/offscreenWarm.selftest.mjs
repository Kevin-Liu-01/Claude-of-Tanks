import assert from 'node:assert/strict';
import { createOffscreenSceneWarmer } from './offscreenWarm.js';

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
}

{
  const renderer = fakeRenderer({ throwOnRender: true });
  const warm = createOffscreenSceneWarmer(renderer, {}, {});
  assert.throws(() => warm(), /synthetic render failure/);
  assert.deepEqual(renderer.calls.at(-1), {
    kind: 'target', target: renderer.prior, face: 3, mip: 2,
  }, 'the caller render target must be restored after a failed warm-up');
}

console.log('offscreenWarm self-test passed');
