import assert from 'node:assert/strict';
import { createShadowFitCache } from './shadowFitCache.ts';

const identity = () => [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];
const cameraWorld = identity();
const projection = identity();
const lightDirection = [0.2, -0.8, 0.55];
const inputs = { cameraWorld, projection, lightDirection };
const cache = createShadowFitCache();

assert.equal(cache.changed(inputs), true, 'the first cascade fit is required');
assert.equal(cache.changed(inputs), false, 'an identical frame reuses the fit');

cameraWorld[12] = 0.001;
assert.equal(cache.changed(inputs), true, 'camera translation invalidates the fit');
assert.equal(cache.changed(inputs), false, 'the translated pose is retained');

projection[0] = 1.01;
assert.equal(cache.changed(inputs), true, 'projection/FOV changes invalidate the fit');

lightDirection[1] = -0.79;
assert.equal(cache.changed(inputs), true, 'sun direction changes invalidate the fit');

cache.invalidate();
assert.equal(cache.changed(inputs), true, 'explicit map-size/frustum changes invalidate the fit');
assert.equal(cache.changed(inputs, true), true, 'forced captures always refresh the fit');
assert.equal(cache.changed(inputs), false, 'a forced refresh still records the current inputs');

console.log('shadowFitCache.selftest: camera, projection, sun, and explicit invalidation pass');
