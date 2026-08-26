import assert from 'node:assert/strict';
import {
  createFrameBudgetYielder,
  createOpaqueLoadingYielder,
} from './frameScheduler.ts';

let now = 0;
let frameYields = 0;
let taskYields = 0;
const options = {
  now: () => now,
  yieldFrame: async () => { frameYields++; now += 1; },
  yieldTask: async () => { taskYields++; now += 1; },
};

const visibleYield = createFrameBudgetYielder(12, options);
await visibleYield();
assert.equal(frameYields, 0, 'visible work stays in its initial frame budget');
now = 12;
await visibleYield();
assert.equal(frameYields, 1, 'visible work yields on the budget boundary');
await visibleYield(true);
assert.equal(frameYields, 2, 'forced visible checkpoints always paint');

now = 0;
frameYields = 0;
taskYields = 0;
const coveredYield = createOpaqueLoadingYielder(12, 80, options);
now = 12;
await coveredYield();
assert.equal(taskYields, 1, 'covered work normally yields only its task');
assert.equal(frameYields, 0);
now = 80;
await coveredYield();
assert.equal(frameYields, 1, 'covered work guarantees a bounded progress paint');
now = 81;
await coveredYield(true);
assert.equal(taskYields, 2, 'forced checkpoints still avoid unnecessary paints');

console.log('[frameScheduler] all tests passed');
