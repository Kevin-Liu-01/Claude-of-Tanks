import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createFrameLoopScheduler, PRESENTATION_MAX_FRAME_RATE,
  MAX_CALIBRATED_FRAME_BUDGET_MS, presentationFrameBudgetMs } from './frameLoopScheduler.ts';
import { AdaptiveQualityPolicy } from './adaptiveQualityPolicy.ts';

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
  let serviced = 0, harness;
  harness = createHarness({ hasBackgroundWork: () => true,
    backgroundTick() {
      serviced++;
      assert.equal(harness.scheduler.wakeBackground(), false, 'synchronous packet reentry cannot step recursively');
    } });
  harness.setBoot(true);
  assert.equal(harness.scheduler.wakeBackground(), false, 'foreground activity cannot service a second clock');
  harness.setFocused(false);
  harness.listeners.get('blur')();
  for (let at = 1; at <= 1000; at++) {
    harness.setNow(at);
    harness.scheduler.wakeBackground();
    if (at % 50 === 0) harness.fireTimer();
  }
  assert.ok(serviced >= 50 && serviced <= 61, 'network and timer activity share a 60 Hz admission ceiling');
  assert.equal(harness.frames.size, 0);
  assert.equal(harness.ticks.length, 0);
  harness.scheduler.dispose();
  assert.equal(harness.scheduler.wakeBackground(), false, 'retired scheduler ignores late network activity');
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

// Feed actual scheduler deliveries into the actual quality policy. A 60 Hz
// deadline grid may catch up at 8.3 ms after a late 25 ms callback; p10 is not
// permission for the governor to demand 120 Hz from this capped producer.
function deliveredTicks(timestamps, options = {}) {
  const harness = createHarness(options);
  harness.scheduler.schedule();
  for (const timestamp of timestamps) {
    const id = harness.frames.keys().next().value;
    assert.notEqual(id, undefined);
    harness.fireFrame(id, timestamp);
    harness.scheduler.schedule();
  }
  harness.scheduler.dispose();
  return harness.ticks;
}

function cadenceEvidence(ticks, earlierCadence = Infinity) {
  const intervals = ticks.slice(1).map((time, index) => time - ticks[index]);
  const sorted = intervals.toSorted((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)];
  const frameBudgetMs = presentationFrameBudgetMs(Math.min(earlierCadence, p10));
  let frameEmaMs = intervals[0];
  for (const interval of intervals) frameEmaMs += (interval - frameEmaMs) * 0.06;
  return { p10, window: { clockSeconds: 10, frameEmaMs, frameBudgetMs,
    missedFrameRatio: intervals.filter(value => value > frameBudgetMs * 1.12).length / intervals.length,
    achievedFps: 1000 * intervals.length / (ticks.at(-1) - ticks[0]),
    dynamicScaleFloor: 0.9, maximumTrim: 0, mayRaiseTier: false } };
}

assert.equal(PRESENTATION_MAX_FRAME_RATE, 60);
assert.equal(MAX_CALIBRATED_FRAME_BUDGET_MS, 34);
assert.equal(presentationFrameBudgetMs(0), 1000 / 60);
assert.equal(presentationFrameBudgetMs(1000 / 120), 1000 / 60);
assert.equal(presentationFrameBudgetMs(1000 / 30), 1000 / 30);
assert.equal(presentationFrameBudgetMs(100), 34, 'Starvation cannot redefine a lax target');

const paced60 = cadenceEvidence(deliveredTicks(Array.from({ length: 720 }, (_, i) => i * 1000 / 120)));
assert.ok(Math.abs(paced60.window.achievedFps - 60) < 0.01);
assert.equal(new AdaptiveQualityPolicy(1).evaluate(paced60.window), 'none');

// Offline timestamp counterfactual, not measured native gameplay improvement.
// A 120 Hz callback 1.1 ms early misses the former 0.75 ms deadline tolerance,
// creating a 25 -> 8.3 ms catch-up pair. The next absolute deadline must remain
// on its original grid, including through many repeated jitter cycles.
function previousToleranceTicks(timestamps) {
  const interval = 1000 / 60;
  const ticks = [];
  let deadline = -Infinity;
  for (const at of timestamps) {
    if (at + 0.75 < deadline) continue;
    if (!Number.isFinite(deadline)) deadline = at + interval;
    else {
      const late = at - deadline;
      deadline += (late >= 0 ? Math.floor(late / interval) + 1 : 1) * interval;
    }
    ticks.push(at);
  }
  return ticks;
}
function shortLongPairs(ticks) {
  let pairs = 0;
  for (let index = 2; index < ticks.length; index++) {
    const previous = ticks[index - 1] - ticks[index - 2];
    const current = ticks[index] - ticks[index - 1];
    if (previous > 22 && previous < 30 && current < 12) pairs++;
  }
  return pairs;
}
const earlyJitterTimestamps = Array.from({ length: 120 * 60 }, (_, index) =>
  index * 1000 / 120 - (index % 4 === 2 ? 1.1 : 0));
const previousTolerance = previousToleranceTicks(earlyJitterTimestamps);
const boundedTolerance = deliveredTicks(earlyJitterTimestamps);
assert.ok(shortLongPairs(previousTolerance) > 1700, 'negative control must reproduce repeated short/long pairs');
assert.equal(shortLongPairs(boundedTolerance), 0, 'bounded early admission removes this injected jitter pattern');
assert.equal(boundedTolerance.length, previousTolerance.length, 'smoother delivery does not buy extra ticks');
assert.equal(boundedTolerance.length, 3600);
assert.equal(new AdaptiveQualityPolicy(1).evaluate(cadenceEvidence(boundedTolerance).window), 'none');

// Long perfect callback streams cover both integer and fractional refresh
// ratios. Resetting each deadline from the accepted timestamp would drop
// 90 Hz to 45 fps and 144 Hz to 48 fps; retain the absolute 60 Hz admission grid.
for (const refreshHz of [30, 59.94, 60, 75, 90, 119.88, 120, 144, 165, 240]) {
  const timestamps = Array.from({ length: Math.ceil(refreshHz * 120) }, (_, index) => index * 1000 / refreshHz);
  const ticks = deliveredTicks(timestamps);
  const expectedRate = Math.min(refreshHz, PRESENTATION_MAX_FRAME_RATE);
  const rate = (ticks.length - 1) * 1000 / (ticks.at(-1) - ticks[0]);
  assert.ok(Math.abs(rate - expectedRate) < 0.02, `${refreshHz} Hz must retain its expected capped admission rate: ${rate}`);
  const callbacks = new Set(timestamps);
  for (let index = 0; index < ticks.length; index++) {
    assert.ok(callbacks.has(ticks[index]), 'admission cannot invent a callback or rewrite its timestamp');
    assert.ok(ticks[index] + 1.5 + 1e-6 >= ticks[0] + index * 1000 / 60,
      `${refreshHz} Hz must never admit beyond the original 60 Hz deadline budget`);
    if (index > 0) assert.ok(ticks[index] > ticks[index - 1], 'one callback cannot tick twice');
  }
}

// The 1.5 ms ceiling and 10%-of-interval bound are both active. A callback
// outside either allowance must wait, without rebasing the following deadline.
for (const [maximumFrameRate, earlyMs] of [[30, 1.6], [60, 1.6], [120, 0.9], [240, 0.5]]) {
  const interval = 1000 / maximumFrameRate;
  const ticks = deliveredTicks([0, interval - earlyMs, interval, interval * 2], { maximumFrameRate });
  assert.deepEqual(ticks, [0, interval, interval * 2], `${maximumFrameRate} Hz keeps bounded early admission`);
}

const jittered = cadenceEvidence(deliveredTicks(Array.from({ length: 120 }, (_, i) =>
  [i * 1000 / 30, i * 1000 / 30 + 1000 / 120, i * 1000 / 30 + 25]).flat()));
assert.ok(jittered.p10 < 8.5, 'Actual capped scheduler still produces short catch-up intervals');
assert.ok(Math.abs(jittered.window.achievedFps - 60) < 0.2);
assert.equal(jittered.window.frameBudgetMs, 1000 / 60);
assert.equal(new AdaptiveQualityPolicy(1).evaluate(jittered.window), 'none',
  'Healthy capped delivery must not sacrifice quality to meet an impossible 120 Hz target');
assert.equal(new AdaptiveQualityPolicy(1).evaluate({ ...jittered.window, frameBudgetMs: 8.5 }), 'resolution-down',
  'Negative control reproduces the previous budget/producer mismatch');

const overloaded60 = cadenceEvidence(deliveredTicks(Array.from({ length: 240 }, (_, i) => i * 22)), paced60.p10);
const relief = new AdaptiveQualityPolicy(1);
assert.equal(relief.evaluate(paced60.window), 'none');
assert.equal(relief.evaluate({ ...overloaded60.window, clockSeconds: 12 }), 'resolution-down',
  'A genuine 22 ms workload remains overloaded against the source-owned 60 Hz target');
assert.equal(relief.dynamicScale, 0.91);
assert.equal(relief.evaluate({ ...paced60.window, clockSeconds: 14 }), 'resolution-up',
  'Genuine return to clean capped delivery retains ordinary resolution recovery');
assert.equal(relief.dynamicScale, 1);
const paced30 = cadenceEvidence(deliveredTicks(Array.from({ length: 240 }, (_, i) => i * 1000 / 30)));
assert.ok(Math.abs(paced30.window.frameBudgetMs - 1000 / 30) < 1e-10);
const slowDisplay = new AdaptiveQualityPolicy(1);
assert.equal(slowDisplay.evaluate(paced30.window), 'none', 'A genuine 30 Hz display keeps its calibrated budget');
const overloaded30 = cadenceEvidence(deliveredTicks(Array.from({ length: 240 }, (_, i) => i * 45)), paced30.p10);
assert.equal(slowDisplay.evaluate({ ...overloaded30.window, clockSeconds: 12 }), 'resolution-down');
assert.equal(slowDisplay.evaluate({ ...paced30.window, clockSeconds: 14 }), 'resolution-up');

// Wire checks complement the real scheduler/policy regression: duplicating an
// old literal at either composition seam must not silently bypass this owner.
const postSource = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(postSource, /const DYN_TARGET_MS = presentationFrameBudgetMs\(0\)/);
assert.match(postSource, /dynBudgetMs = presentationFrameBudgetMs\(dynBestCadenceMs\)/);
assert.match(mainSource, /maximumFrameRate: PRESENTATION_MAX_FRAME_RATE/);
console.log('frameLoopScheduler.selftest: capped cadence/governor agreement, real overload/recovery, background suspension, and hidden-pane recovery passed');
