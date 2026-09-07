import assert from 'node:assert/strict';
import {
  createFrameBudgetYielder,
  createOpaqueLoadingYielder,
  nextFrame,
  nextPaintFrame,
} from './frameScheduler.ts';

async function withFrameHost({ animationFrame = true, taskScheduler = false } = {}, run) {
  const keys = ['requestAnimationFrame', 'setTimeout', 'scheduler'];
  const prior = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const frames = [];
  const timers = [];
  const tasks = [];
  const host = {
    requestAnimationFrame: animationFrame ? (callback) => { frames.push(callback); return frames.length; } : undefined,
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    scheduler: taskScheduler ? { yield: () => new Promise((resolve) => tasks.push(resolve)) } : undefined,
  };
  try {
    for (const key of keys) Object.defineProperty(globalThis, key, {
      configurable: true, writable: true, value: host[key],
    });
    await run({ frames, timers, tasks });
  } finally {
    for (const key of keys) {
      const descriptor = prior.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

await withFrameHost({}, async ({ frames, timers }) => {
  const pending = nextFrame();
  frames[0]();
  await pending;
  assert.deepEqual(timers.map(({ delay }) => delay), [34],
    'the existing nextFrame remains an animation checkpoint without a new task delay');
});

await withFrameHost({}, async ({ frames, timers }) => {
  const events = [];
  let completions = 0;
  const pending = nextPaintFrame().then(() => {
    completions += 1;
    events.push('continuation');
  });
  assert.equal(frames.length, 1);
  assert.deepEqual(timers.map(({ delay }) => delay), [34]);
  events.push('animation callback');
  frames[0]();
  await Promise.resolve();
  assert.equal(completions, 0, 'rAF and its microtasks cannot resume paint-sensitive work');
  assert.deepEqual(timers.map(({ delay }) => delay), [34, 0]);
  events.push('rendering opportunity');
  timers.find(({ delay }) => delay === 0).callback();
  await pending;
  assert.deepEqual(events, ['animation callback', 'rendering opportunity', 'continuation']);
  timers.find(({ delay }) => delay === 34).callback();
  frames[0]();
  await Promise.resolve();
  assert.equal(completions, 1, 'late frame/fallback callbacks cannot settle twice');
  assert.equal(timers.length, 2, 'late callbacks cannot queue another post-frame task');
});

for (const animationFrame of [false, true]) {
  await withFrameHost({ animationFrame }, async ({ frames, timers }) => {
    let completed = false;
    const pending = nextPaintFrame().then(() => { completed = true; });
    assert.deepEqual(timers.map(({ delay }) => delay), [34],
      'missing or throttled animation frames retain the bounded fallback');
    timers[0].callback();
    await Promise.resolve();
    assert.equal(completed, false, 'fallback still crosses a task boundary before continuation');
    timers.find(({ delay }) => delay === 0).callback();
    await pending;
    assert.equal(completed, true, 'hidden documents do not wait indefinitely for rAF');
    frames[0]?.();
    await Promise.resolve();
    assert.equal(timers.length, 2, 'a late hidden-frame callback cannot schedule extra work');
  });
}

await withFrameHost({ taskScheduler: true }, async ({ frames, timers, tasks }) => {
  let completed = false;
  const pending = nextPaintFrame().then(() => { completed = true; });
  frames[0]();
  await Promise.resolve();
  assert.equal(completed, false);
  assert.equal(tasks.length, 1, 'the native task scheduler supplies the post-frame boundary when available');
  assert.deepEqual(timers.map(({ delay }) => delay), [34], 'no redundant timer task is scheduled');
  tasks[0]();
  await pending;
  assert.equal(completed, true);
});

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
