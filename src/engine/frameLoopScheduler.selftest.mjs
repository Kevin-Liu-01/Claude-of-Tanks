import assert from 'node:assert/strict';

import { createFrameLoopScheduler } from './frameLoopScheduler.ts';

function createHarness(background = {}) {
  let nowMs = 0;
  let bootComplete = false;
  let hidden = false;
  let focused = true;
  let nextFrameId = 1;
  let timerCallback = null;
  let delayedCallback = null;
  let delayedHandle = 0;
  let idle = false;
  const frames = new Map();
  const cancelled = [];
  const ticks = [];
  const listeners = new Map();
  const documentListeners = new Map();
  const removed = [];
  let clearedTimer = null;

  const scheduler = createFrameLoopScheduler({
    tick: (timestampMs) => ticks.push(timestampMs),
    isBootComplete: () => bootComplete,
    shouldUseIdleCadence: () => idle,
    idleIntervalMs: 1000,
    requestFrame(callback) {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      cancelled.push(id);
      frames.delete(id);
    },
    now: () => nowMs,
    setDelayed(callback, intervalMs) {
      assert.equal(intervalMs, 1000);
      delayedCallback = callback;
      delayedHandle = 91;
      return delayedHandle;
    },
    clearDelayed(handle) {
      assert.equal(handle, delayedHandle);
      delayedCallback = null;
    },
    setRecurring(callback, intervalMs) {
      assert.ok(intervalMs === 100 || (background.backgroundTick && intervalMs === 50));
      timerCallback = callback;
      return 41;
    },
    clearRecurring(handle) { clearedTimer = handle; },
    documentState: {
      get hidden() { return hidden; },
      hasFocus: () => focused,
      addEventListener(name, listener) { documentListeners.set(name, listener); },
      removeEventListener(name) { documentListeners.delete(name); },
    },
    inputTarget: {
      addEventListener(name, listener, options) {
        if (options) assert.equal(options.passive, true);
        listeners.set(name, listener);
      },
      removeEventListener(name) { removed.push(name); },
    },
    ...background,
  });

  return {
    scheduler,
    frames,
    cancelled,
    ticks,
    listeners,
    documentListeners,
    removed,
    setNow(value) { nowMs = value; },
    setBoot(value) { bootComplete = value; },
    setHidden(value) { hidden = value; },
    setFocused(value) { focused = value; },
    setIdle(value) { idle = value; },
    fireTimer() { timerCallback(); },
    fireDelayed() {
      const callback = delayedCallback;
      assert.ok(callback, 'an idle watchdog must be queued');
      delayedCallback = null;
      callback();
    },
    get delayed() { return delayedCallback; },
    fireFrame(id, timestampMs) {
      const callback = frames.get(id);
      assert.ok(callback, `frame ${id} must be queued`);
      frames.delete(id);
      callback(timestampMs);
    },
    get clearedTimer() { return clearedTimer; },
  };
}

// An unfocused network host retains only transport/authority work. The same
// policy covers visible side-by-side windows and genuinely hidden tabs; no
// GPU callback is allowed, and ordinary room-free suspension is unchanged.
{
  const backgroundTicks = [];
  let active = true;
  const harness = createHarness({
    hasBackgroundWork: () => active,
    backgroundTick: (at) => backgroundTicks.push(at),
  });
  harness.setBoot(true);
  harness.scheduler.schedule();
  harness.setFocused(false);
  harness.listeners.get('blur')();
  assert.deepEqual(backgroundTicks, [0], 'blur relinquishes controls immediately');
  for (let at = 50; at <= 1000; at += 50) {
    harness.setNow(at);
    harness.fireTimer();
  }
  assert.equal(backgroundTicks.length, 21, 'visible unfocused authority continues at 20 Hz');
  assert.equal(harness.frames.size, 0);
  assert.equal(harness.ticks.length, 0, 'background work never invokes the render callback');
  harness.setHidden(true);
  harness.documentListeners.get('visibilitychange')();
  harness.setNow(1050);
  harness.fireTimer();
  assert.equal(backgroundTicks.at(-1), 1050, 'hidden authority uses the same bounded timer owner');
  harness.setFocused(true);
  harness.setHidden(false);
  harness.listeners.get('focus')();
  harness.documentListeners.get('visibilitychange')();
  assert.equal(harness.frames.size, 1, 'focus and visibility races leave one render callback');
  const stoppedAt = backgroundTicks.length;
  harness.fireTimer();
  assert.equal(backgroundTicks.length, stoppedAt, 'foreground ownership stops background pumping');
  harness.setFocused(false);
  active = false;
  harness.listeners.get('blur')();
  harness.fireTimer();
  assert.equal(backgroundTicks.length, stoppedAt, 'solo and room-free Garage remain suspended');
  harness.scheduler.dispose();
}

{
  const harness = createHarness();
  harness.setBoot(true);
  harness.setIdle(true);
  harness.scheduler.schedule();
  assert.equal(harness.frames.size, 0,
    'settled visible phases do not request animation frames');
  assert.ok(harness.delayed, 'settled visible phases retain one watchdog tick');
  assert.equal(harness.scheduler.stats.queued, 'idle');
  harness.setNow(1000);
  harness.fireDelayed();
  assert.deepEqual(harness.ticks, [1000]);
  assert.equal(harness.scheduler.stats.idleTicks, 1);
  harness.scheduler.schedule(); // production tick() re-arms at its first line
  assert.ok(harness.delayed, 'the idle tick re-arms its bounded watchdog');

  harness.listeners.get('pointerdown')();
  assert.equal(harness.delayed, null, 'input cancels the sleeping watchdog');
  assert.equal(harness.frames.size, 1,
    'input wakes the next visible frame immediately');
  assert.equal(harness.scheduler.stats.inputWakeups, 1);
  harness.setIdle(false);
  harness.fireFrame(1, 1016);
  assert.deepEqual(harness.ticks, [1000, 1016]);
  assert.equal(harness.scheduler.stats.animationTicks, 1);
}

{
  const harness = createHarness();
  harness.scheduler.schedule();
  harness.fireFrame(1, 0);
  harness.scheduler.schedule();
  harness.fireFrame(2, 1000 / 120);
  assert.deepEqual(harness.ticks, [0],
    'a 120 Hz callback between simulation frames does not present duplicate work');
  assert.equal(harness.scheduler.stats.frameRateLimitedCallbacks, 1);
  harness.fireFrame(3, 1000 / 60);
  assert.deepEqual(harness.ticks, [0, 1000 / 60],
    'the next 60 Hz boundary presents normally');
}

{
  const harness = createHarness();
  harness.scheduler.schedule();
  harness.scheduler.schedule();
  assert.equal(harness.frames.size, 1, 'schedule coalesces duplicate requests');
  harness.fireFrame(1, 17);
  assert.deepEqual(harness.ticks, [17]);
  harness.scheduler.schedule();
  assert.equal(harness.frames.size, 1, 'completed callbacks release the queue latch');
}

{
  const harness = createHarness();
  harness.scheduler.schedule();
  harness.setHidden(true);
  harness.setFocused(false);
  harness.listeners.get('blur')();
  assert.deepEqual(harness.cancelled, [1],
    'a real background tab cancels its outstanding GPU callback');
  assert.equal(harness.frames.size, 0);
  assert.equal(harness.scheduler.stats.backgroundSuspensions, 1);
  harness.scheduler.schedule();
  assert.equal(harness.frames.size, 0,
    'background scheduling remains fully suspended');
  harness.setHidden(false);
  harness.setFocused(true);
  harness.listeners.get('focus')();
  assert.equal(harness.frames.size, 1,
    'returning to the tab starts exactly one fresh animation frame');
  harness.fireFrame(2, 1000);
  assert.deepEqual(harness.ticks, [1000],
    'resume does not replay any hidden wall-clock frames');
}

{
  const harness = createHarness();
  harness.scheduler.schedule();
  harness.scheduler.restart();
  assert.deepEqual(harness.cancelled, [1], 'restart cancels the old browser callback');
  assert.deepEqual([...harness.frames.keys()], [2], 'restart leaves exactly one callback');
}

{
  const harness = createHarness();
  harness.setHidden(true);
  harness.setNow(500);
  harness.fireTimer();
  assert.equal(harness.ticks.length, 0, 'timer rescue stays gated through boot');
  harness.setBoot(true);
  harness.fireTimer();
  assert.deepEqual(harness.ticks, [500], 'focused hidden panes recover after starvation');
  harness.setNow(650);
  harness.fireTimer();
  assert.equal(harness.ticks.length, 1, 'timer rescue respects its 200 ms cadence');
  harness.setNow(701);
  harness.setFocused(false);
  harness.fireTimer();
  assert.equal(harness.ticks.length, 1, 'background tabs do not run timer rescue');
}

{
  const harness = createHarness();
  harness.setBoot(true);
  harness.setHidden(true);
  harness.setNow(150);
  harness.listeners.get('mousedown')();
  assert.deepEqual(harness.ticks, [150], 'hidden input rescues a starved control edge');
  harness.setNow(220);
  harness.listeners.get('mousemove')();
  assert.equal(harness.ticks.length, 1, 'input rescue is bounded to 100 ms');
  harness.setNow(260);
  harness.setHidden(false);
  harness.listeners.get('keydown')();
  assert.equal(harness.ticks.length, 1, 'visible pages remain animation-frame owned');
}

{
  const harness = createHarness();
  harness.scheduler.schedule();
  harness.scheduler.dispose();
  assert.deepEqual(harness.cancelled, [1]);
  assert.equal(harness.clearedTimer, 41);
  assert.equal(harness.removed.length, 10,
    'dispose removes every recovery and focus listener');
  assert.equal(harness.documentListeners.size, 0,
    'dispose removes the visibility lifecycle listener');
  harness.scheduler.schedule();
  assert.equal(harness.frames.size, 0, 'disposed schedulers cannot re-arm');
}

console.log('frameLoopScheduler.selftest: 60 Hz pacing, background suspension, and hidden-pane recovery passed');
