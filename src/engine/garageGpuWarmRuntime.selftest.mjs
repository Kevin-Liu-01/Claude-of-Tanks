import assert from 'node:assert/strict';
import { PerspectiveCamera, Scene } from 'three';
import { warmGarageGpuPipeline } from './garageGpuWarmRuntime.ts';

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
    async primeShadowMaps(activeRenderer, activeScene, activeCamera, yieldWarm) {
      assert.equal(activeRenderer, renderer);
      assert.equal(activeScene, scene);
      assert.equal(activeCamera, camera);
      await yieldWarm();
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

console.log('garageGpuWarmRuntime.selftest: target-correct bounded boot warm passed');
