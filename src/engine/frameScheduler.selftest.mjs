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

{
  let clock = 0;
  let taskDelay = 66;
  const frames = [];
  const tasks = [];
  const yieldWork = createOpaqueLoadingYielder(24, 80, {
    now: () => clock,
    yieldFrame: async () => { frames.push(clock); clock += 17; },
    yieldTask: async () => { tasks.push(clock); clock += taskDelay; },
  });
  await yieldWork();
  clock = 23;
  await yieldWork();
  assert.deepEqual([tasks, frames], [[], []], 'cheap checkpoints preserve the initial work budget');

  clock = 24;
  await yieldWork();
  assert.equal(clock, 90, 'other work may consume wall time while the task yield is pending');
  assert.deepEqual(tasks, [24]);
  assert.deepEqual(frames, []);
  await yieldWork();
  assert.deepEqual(frames, [90],
    'an overdue paint wins even when task completion just reset the slice budget');
  assert.equal(clock, 107);

  taskDelay = 0;
  await yieldWork();
  clock = 130;
  await yieldWork();
  assert.deepEqual(tasks, [24], 'frame completion starts a fresh cheap-work budget');
  clock = 131;
  await yieldWork();
  assert.deepEqual(tasks, [24, 131], 'the fresh task budget expires at its exact boundary');
  clock = 186;
  await yieldWork();
  assert.deepEqual(frames, [90], 'the next paint deadline starts at frame completion, not request time');
  clock = 187;
  await yieldWork();
  assert.deepEqual(frames, [90, 187], 'the exact paint deadline bypasses a one-millisecond-old slice');
  assert.equal(clock, 204);

  await yieldWork(true);
  assert.deepEqual(tasks, [24, 131, 186, 204], 'force still yields a task before the paint deadline');
  clock = 284;
  await yieldWork(true);
  assert.deepEqual(frames, [90, 187, 284], 'force still selects a frame once the paint deadline is due');
}

for (const kind of ['task', 'frame']) {
  let clock = 0;
  const calls = [];
  const expected = new Error(`${kind} yield failed`);
  let failure = expected;
  const perform = async selected => {
    calls.push(selected);
    if (failure) throw failure;
  };
  const yieldWork = createOpaqueLoadingYielder(12, 80, {
    now: () => clock,
    yieldFrame: () => perform('frame'),
    yieldTask: () => perform('task'),
  });
  clock = kind === 'frame' ? 80 : 12;
  await assert.rejects(yieldWork(), error => error === expected,
    `${kind} rejection must reach the construction owner unchanged`);
  assert.deepEqual(calls, [kind]);
  failure = null;
  await yieldWork();
  assert.deepEqual(calls, [kind, kind], 'a failed yield does not pretend its deadline was serviced');
}

console.log('[frameScheduler] all tests passed');
