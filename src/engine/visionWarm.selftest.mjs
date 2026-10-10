import assert from 'node:assert/strict';
import { createVisionWarmSteps } from './visionWarm.ts';
const uniform = { value: 2 }, rendered = [];
const steps = createVisionWarmSteps(uniform, () => rendered.push(uniform.value));
for (const mode of steps) {
  assert.equal(rendered.at(-1), mode);
  assert.equal(uniform.value, 2, 'selected thermal view survives every checkpoint');
}
assert.deepEqual(rendered, [0, 1, 2, 3], 'daylight, infrared, thermal and night shaders execute');
const cancelled = createVisionWarmSteps(uniform, () => {});
cancelled.next(); cancelled.return();
assert.equal(uniform.value, 2);
assert.throws(() => createVisionWarmSteps(uniform, () => { throw Error('lost context'); }).next(), /lost context/);
assert.equal(uniform.value, 2, 'failed draw restores selected mode');
console.log('visionWarm: all modes, checkpoint restoration, cancellation and renderer failure passed');
