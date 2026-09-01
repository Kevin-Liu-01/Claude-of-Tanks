import assert from 'node:assert/strict';
import { PerspectiveCamera, Scene } from 'three';
import {
  restoreGarageGpuPipeline,
  warmGarageGpuPipeline,
} from './garageGpuWarmRuntime.ts';

const scene = new Scene();
const camera = new PerspectiveCamera();
const renderer = {};
const calls = [];
const progress = [];
const timings = {};
let clock = 0;

await warmGarageGpuPipeline({
  renderer,
  scene,
  camera,
  lighting: {
    update(force) { calls.push(['light', force]); },
    async primeShadowMaps(activeRenderer, activeScene, activeCamera, options) {
      assert.equal(activeRenderer, renderer);
      assert.equal(activeScene, scene);
      assert.equal(activeCamera, camera);
      assert.equal(options.cascadeLimit, undefined);
      await options.yieldBeforeCascade();
      return [7, 3, 1];
    },
  },
  forwardPrograms: {
    compile(root) {
      assert.equal(root, scene);
      calls.push(['compile']);
    },
  },
  post: {
    async warmFirstFrame(yieldWarm) {
      await yieldWarm();
      return [{ label: 'scene', ms: 5 }, { label: 'grade', ms: 2 }];
    },
    render(dt) { calls.push(['render', dt]); },
  },
  timings,
  reportProgress(fraction) { progress.push(fraction); },
  simDt: 1 / 60,
  createYielder: () => async (force) => { calls.push(['yield', force]); },
  warmScene: async (activeRenderer, activeScene, activeCamera, options) => {
    assert.equal(activeRenderer, renderer);
    assert.equal(activeScene, scene);
    assert.equal(activeCamera, camera);
    assert.equal(options.maxObjects, 64);
    assert.equal(options.maxWeight, 240_000);
    await options.yieldBeforeBatch(0);
    return [11, 4];
  },
  now: () => { clock += 10; return clock; },
});

assert.deepEqual(calls[0], ['compile'], 'production-target submission happens first');
assert.deepEqual(calls[1], ['light', true], 'shadow state follows forward submission');
assert.deepEqual(calls.at(-1), ['render', 1 / 60], 'one complete post frame seals the warm');
assert.equal(timings.postCompile, 10);
assert.equal(timings.shadowPassMax, 7);
assert.deepEqual(timings.sceneUploadBatches, [11, 4]);
assert.equal(timings.sceneUploadMax, 11);
assert.equal(timings.postPassMax, 5);
assert.ok(progress.length >= 4, 'each bounded GPU unit renews boot progress');

{
  const restoreCalls = [];
  let restoreClock = 0;
  const receipt = await restoreGarageGpuPipeline({
    renderer,
    scene,
    camera,
    lighting: {
      setStaticPresentationDormant(value) {
        restoreCalls.push(['staticDormant', value]);
      },
      update(force) { restoreCalls.push(['light', force]); },
      async primeShadowMaps(activeRenderer, activeScene, activeCamera, options) {
        assert.equal(activeRenderer, renderer);
        assert.equal(activeScene, scene);
        assert.equal(activeCamera, camera);
        assert.equal(options.cascadeLimit, 2);
        await options.yieldBeforeCascade(0);
        return [13, 5];
      },
    },
    resourcesReleased: true,
    createYielder: (budgetMs) => {
      assert.equal(budgetMs, 8);
      return async (force) => { restoreCalls.push(['yield', force]); };
    },
    warmScene: async (activeRenderer, activeScene, activeCamera, options) => {
      assert.equal(activeRenderer, renderer);
      assert.equal(activeScene, scene);
      assert.equal(activeCamera, camera);
      assert.equal(options.scale, 0.0625);
      assert.equal(options.maxObjects, 24);
      assert.equal(options.maxWeight, 90_000);
      await options.yieldBeforeBatch(0);
      return [9, 4, 2];
    },
    now: () => { restoreClock += 10; return restoreClock; },
  });
  assert.deepEqual(restoreCalls[0], ['staticDormant', false]);
  assert.deepEqual(restoreCalls[1], ['light', true]);
  assert.deepEqual(restoreCalls.filter(([name]) => name === 'yield'), [
    ['yield', undefined],
    ['yield', undefined],
  ], 'the already-opaque transition yields only when restoration exhausts its budget');
  assert.deepEqual(restoreCalls.at(-1), ['staticDormant', true]);
  assert.deepEqual(receipt, {
    totalMs: 10,
    resourcesReleased: true,
    shadowPasses: [13, 5],
    shadowPassMax: 13,
    shadowCascadeCount: 2,
    sceneUploadBatches: [9, 4, 2],
    sceneUploadMax: 9,
  });
}

{
  let warmCalls = 0;
  const receipt = await restoreGarageGpuPipeline({
    renderer,
    scene,
    camera,
    lighting: {
      setStaticPresentationDormant() {},
      update() {},
      async primeShadowMaps(_renderer, _scene, _camera, options) {
        assert.equal(options.cascadeLimit, 2);
        return [3, 2];
      },
    },
    resourcesReleased: false,
    createYielder: () => async () => {},
    warmScene: async () => {
      warmCalls += 1;
      return [99];
    },
    now: () => 50,
  });
  assert.equal(warmCalls, 0, 'resident desktop Garage buffers are never uploaded again');
  assert.deepEqual(receipt, {
    totalMs: 0,
    resourcesReleased: false,
    shadowPasses: [3, 2],
    shadowPassMax: 3,
    shadowCascadeCount: 2,
    sceneUploadBatches: [],
    sceneUploadMax: 0,
  });
}

console.log('garageGpuWarmRuntime.selftest: bounded boot and return warms passed');
