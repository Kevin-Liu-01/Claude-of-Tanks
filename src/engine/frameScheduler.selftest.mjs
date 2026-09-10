import assert from 'node:assert/strict';
import {
  createFrameBudgetYielder,
  createOpaqueLoadingYielder,
  nextFrame,
  nextPaintFrame,
} from './frameScheduler.ts';

async function withFrameHost({ animationFrame = true, taskScheduler = false,
  hidden = false, documentAvailable = true, frameError = null } = {}, run) {
  const keys = ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout',
    'clearTimeout', 'scheduler', 'document'];
  const prior = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const frames = [];
  const timers = [];
  const tasks = [];
  const cancelledFrames = [];
  const listeners = new Set();
  const paintDocument = {
    hidden,
    addEventListener(type, callback) { assert.equal(type, 'visibilitychange'); listeners.add(callback); },
    removeEventListener(type, callback) { assert.equal(type, 'visibilitychange'); listeners.delete(callback); },
  };
  const host = {
    document: documentAvailable ? paintDocument : undefined,
    requestAnimationFrame: animationFrame ? (callback) => {
      if (frameError) throw frameError;
      frames.push(callback); return frames.length;
    } : undefined,
    cancelAnimationFrame(id) { cancelledFrames.push(id); },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeout(id) { timers[id - 1].cancelled = true; },
    scheduler: taskScheduler ? { yield: () => new Promise((resolve, reject) => {
      tasks.push(Object.assign(resolve, { reject }));
    }) } : undefined,
  };
  try {
    for (const key of keys) Object.defineProperty(globalThis, key, {
      configurable: true, writable: true, value: host[key],
    });
    await run({ frames, timers, tasks, cancelledFrames, listeners,
      setHidden(value) { paintDocument.hidden = value; for (const callback of [...listeners]) callback(); } });
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

await withFrameHost({}, async ({ frames, timers, cancelledFrames, listeners }) => {
  const events = [];
  let completions = 0;
  const pending = nextPaintFrame().then(() => {
    completions += 1;
    events.push('continuation');
  });
  assert.equal(frames.length, 1);
  assert.deepEqual(timers.map(({ delay }) => delay), [1000],
    'a visible paint wait has no 34ms success fallback');
  events.push('animation callback');
  frames[0]();
  await Promise.resolve();
  assert.equal(completions, 0, 'rAF and its microtasks cannot resume paint-sensitive work');
  assert.deepEqual(timers.map(({ delay }) => delay), [1000, 0]);
  assert.equal(timers[0].cancelled, true);
  assert.deepEqual(cancelledFrames, [1]);
  assert.equal(listeners.size, 0, 'the real frame releases every owned wait resource');
  events.push('rendering opportunity');
  timers.find(({ delay }) => delay === 0).callback();
  await pending;
  assert.deepEqual(events, ['animation callback', 'rendering opportunity', 'continuation']);
  timers.find(({ delay }) => delay === 1000).callback();
  frames[0]();
  await Promise.resolve();
  assert.equal(completions, 1, 'late frame/fallback callbacks cannot settle twice');
  assert.equal(timers.length, 2, 'late callbacks cannot queue another post-frame task');
});

for (const options of [
  { animationFrame: false }, { hidden: true }, { documentAvailable: false },
]) {
  await withFrameHost(options, async ({ frames, timers, listeners }) => {
    let completed = false;
    const pending = nextPaintFrame().then(() => { completed = true; });
    assert.deepEqual(timers.map(({ delay }) => delay), [34],
      'only hidden, no-document or no-rAF hosts retain the bounded fallback');
    timers[0].callback();
    await Promise.resolve();
    assert.equal(completed, false, 'fallback still crosses a task boundary before continuation');
    timers.find(({ delay }) => delay === 0).callback();
    await pending;
    assert.equal(completed, true, 'hidden documents do not wait indefinitely for rAF');
    assert.equal(timers[0].cancelled, true);
    assert.equal(listeners.size, 0);
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
  assert.deepEqual(timers.map(({ delay }) => delay), [1000], 'no redundant timer task is scheduled');
  tasks[0]();
  await pending;
  assert.equal(completed, true);
});

await withFrameHost({}, async ({ frames, timers, cancelledFrames, listeners }) => {
  const pending = nextPaintFrame();
  const rejected = assert.rejects(pending, /Visible paint frame did not arrive within 1000 ms/);
  timers[0].callback();
  await rejected;
  assert.equal(timers[0].cancelled, true);
  assert.deepEqual(cancelledFrames, [1]);
  assert.equal(listeners.size, 0);
  frames[0](); timers[0].callback();
  await Promise.resolve();
  assert.equal(timers.length, 1, 'a failed or late visible frame cannot schedule heavy continuation');
});

await withFrameHost({}, async ({ frames, timers, cancelledFrames, listeners, setHidden }) => {
  let complete = false;
  const pending = nextPaintFrame().then(() => { complete = true; });
  setHidden(true);
  await Promise.resolve();
  assert.equal(complete, false, 'hidden transition still leaves the current task before continuing');
  assert.equal(listeners.size, 0);
  assert.deepEqual(cancelledFrames, [1]);
  assert.equal(timers[0].cancelled, true);
  assert.deepEqual(timers.map(({ delay }) => delay), [1000, 0]);
  timers[1].callback(); await pending;
  frames[0](); timers[0].callback();
  await Promise.resolve();
  assert.equal(timers.length, 2, 'late visibility/frame/deadline work cannot revive a settled wait');
});

await withFrameHost({ hidden: true }, async ({ frames, timers, setHidden, listeners }) => {
  const pending = nextPaintFrame();
  assert.equal(timers[0].delay, 34);
  setHidden(false);
  assert.equal(timers[0].cancelled, true);
  assert.equal(timers[1].delay, 1000, 'becoming visible replaces the hidden-only fallback');
  timers[0].callback(); await Promise.resolve();
  assert.equal(listeners.size, 1, 'an obsolete hidden timer cannot reject the new visible wait');
  setHidden(false);
  assert.equal(timers.length, 2, 'duplicate visibility events cannot extend the visible deadline');
  frames[0](); await Promise.resolve();
  assert.equal(timers[1].cancelled, true);
  assert.equal(listeners.size, 0);
  timers[2].callback(); await pending;
});

await withFrameHost({ taskScheduler: true }, async ({ frames, tasks, timers, listeners }) => {
  const expected = new Error('task owner aborted');
  const pending = nextPaintFrame();
  const rejected = assert.rejects(pending, error => error === expected);
  frames[0](); await Promise.resolve();
  tasks[0].reject(expected); await rejected;
  assert.equal(timers[0].cancelled, true);
  assert.equal(listeners.size, 0, 'task failure cannot leak the completed frame wait');
});

{
  const expected = new Error('rAF unavailable');
  await withFrameHost({ frameError: expected }, async ({ timers, listeners }) => {
    await assert.rejects(nextPaintFrame(), error => error === expected);
    assert.equal(timers[0].cancelled, true);
    assert.equal(listeners.size, 0, 'a native setup error also releases partial ownership');
    assert.equal(timers.length, 1, 'setup failure cannot enter the task continuation');
  });
}

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
