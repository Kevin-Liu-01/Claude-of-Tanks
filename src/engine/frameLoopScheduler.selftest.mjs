import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { createFrameLoopScheduler, PRESENTATION_MAX_FRAME_RATE,
  MAX_CALIBRATED_FRAME_BUDGET_MS, presentationFrameBudgetMs } from './frameLoopScheduler.ts';
import { AdaptiveQualityPolicy } from './adaptiveQualityPolicy.ts';

function createHarness(background = {}) {
  let nowMs = 0;
  let nowReads = 0;
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
    now: () => { nowReads++; return nowMs; },
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
    get nowReads() { return nowReads; },
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
    fireFrame(id, timestampMs, entryMs = timestampMs) {
      const callback = frames.get(id);
      assert.ok(callback, `frame ${id} must be queued`);
      frames.delete(id);
      nowMs = entryMs;
      callback(timestampMs);
    },
    get clearedTimer() { return clearedTimer; },
  };
}

// Entry time owns eligibility even without diagnostics. The same one read is
// retained by diagnostics and tick-wall bookkeeping, never substituted for RAF dt.
{
  const h = createHarness();
  const fire = (rafMs, entryMs) => {
    h.scheduler.schedule();
    h.fireFrame(h.frames.keys().next().value, rafMs, entryMs);
  };
  fire(0, 0.2);
  fire(8, 8.2);
  assert.equal(h.nowReads, 2, 'each callback reads entry once, including rate-limited callbacks');
  assert.deepEqual(h.ticks, [0]);
  const rows = [];
  const observation = h.scheduler.observeAnimationDecisions((...row) => rows.push(row));
  assert.equal(observation.state.initialDeadlineMs, 1000 / 60);
  assert.equal(observation.state.intervalMs, 1000 / 60);
  assert.equal(observation.state.toleranceMs, 1.5);
  fire(15, 15.16);
  assert.deepEqual(rows[0], [1, 15, 15.16, 1000 / 60, 1000 / 60, 1, 0, 0]);
  assert.equal(h.nowReads, 3, 'observed skip reads only callback entry');
  fire(15.05, 15.22);
  assert.deepEqual(rows[1], [2, 15.05, 15.22, 1000 / 60, 2000 / 60, 0, 0, 0]);
  assert.equal(h.nowReads, 4, 'tick-wall bookkeeping reuses the sampled entry clock');
  assert.deepEqual(h.ticks, [0, 15.05], 'entry time never replaces the RAF timestamp');
  h.scheduler.restart();
  fire(40, 40.2);
  assert.deepEqual(rows[2], [3, 40, 40.2, -Infinity, 40 + 1000 / 60, 0, 1, 1]);
  h.scheduler.schedule();
  h.setFocused(false);
  h.fireFrame(h.frames.keys().next().value, 50, 50.2);
  assert.deepEqual(rows[3], [4, 50, 50.2, 40 + 1000 / 60, -Infinity, 2, 1, 2]);
  h.listeners.get('blur')();
  h.documentListeners.get('visibilitychange')();
  h.scheduler.schedule();
  assert.equal(observation.state.resetSequence, 5, 'every background deadline reset is visible');
  assert.equal(observation.state.restartSequence, 1, 'background reset is not mislabeled as restart');
  observation.dispose();
  const reads = h.nowReads;
  h.setFocused(true);
  h.scheduler.restart();
  fire(60, 60.2);
  assert.equal(h.nowReads, reads + 1, 'disposing diagnostics retains only the one eligibility clock read');
  assert.equal(rows.length, 4);
  assert.equal(observation.state.callbacks, 4);
  assert.equal(observation.state.active, false);
  h.scheduler.dispose();
}

// Both successful and throwing observers leave the actual scheduling stream
// unchanged on integer and fractional display ratios, including late entry.
for (const refreshHz of [75, 90, 120, 144]) {
  const plain = createHarness();
  const traced = createHarness();
  const broken = createHarness();
  let observed = 0;
  const observation = traced.scheduler.observeAnimationDecisions(() => observed++);
  const failed = broken.scheduler.observeAnimationDecisions(() => { throw new Error('observer failure'); });
  for (let index = 0; index < 360; index++) {
    const rafMs = index * 1000 / refreshHz;
    for (const h of [plain, traced, broken]) {
      h.scheduler.schedule();
      h.fireFrame(h.frames.keys().next().value, rafMs, rafMs + (index % 11 === 0 ? 40 : 0.2));
    }
  }
  assert.equal(observed, 360);
  assert.deepEqual(traced.ticks, plain.ticks);
  assert.deepEqual(broken.ticks, plain.ticks);
  assert.deepEqual(traced.scheduler.stats, plain.scheduler.stats);
  assert.deepEqual(broken.scheduler.stats, plain.scheduler.stats);
  assert.equal(plain.nowReads, 360);
  assert.equal(traced.nowReads, plain.nowReads);
  assert.equal(broken.nowReads, plain.nowReads, 'observer failure does not add/retry clock reads');
  assert.equal(failed.state.active, false);
  assert.equal(failed.state.observerErrors, 1);
  assert.equal(failed.state.error, 'Frame scheduler decision observer threw');
  assert.equal(failed.state.callbacks, 1, 'failed observers detach rather than retry each frame');
  observation.dispose();
  for (const h of [plain, traced, broken]) h.scheduler.dispose();
}

{
  const h = createHarness();
  assert.throws(() => h.scheduler.observeAnimationDecisions(null), /must be a function/);
  const first = h.scheduler.observeAnimationDecisions(() => {});
  assert.throws(() => h.scheduler.observeAnimationDecisions(() => {}), /already has/);
  first.dispose();
  const second = h.scheduler.observeAnimationDecisions(() => {});
  first.dispose();
  assert.equal(second.state.active, true, 'late old-owner cleanup cannot detach the new observer');
  h.scheduler.schedule();
  h.fireFrame(h.frames.keys().next().value, 0);
  assert.equal(second.state.callbacks, 1);
  h.scheduler.dispose();
  assert.equal(second.state.active, false, 'scheduler disposal detaches its diagnostic owner');
  assert.throws(() => h.scheduler.observeAnimationDecisions(() => {}), /disposed/);
  second.dispose();
}

{
  const sentinel = new Error('original tick error');
  const h = createHarness({ tick() { throw sentinel; } });
  const observation = h.scheduler.observeAnimationDecisions(() => {});
  h.scheduler.schedule();
  assert.throws(() => h.fireFrame(h.frames.keys().next().value, 0), error => error === sentinel);
  assert.equal(observation.state.observerErrors, 0, 'runtime errors retain original identity and ownership');
  assert.equal(observation.state.callbacks, 1);
  h.scheduler.dispose();
}

function clockDelivery(rafTimes, entryTimes, options = {}) {
  const h = createHarness(options), rows = [];
  const observation = h.scheduler.observeAnimationDecisions((...row) => rows.push(row));
  for (let index = 0; index < rafTimes.length; index++) {
    h.scheduler.schedule();
    h.fireFrame(h.frames.keys().next().value, rafTimes[index], entryTimes[index]);
  }
  observation.dispose(); h.scheduler.dispose();
  return { ticks: h.ticks, rows, reads: h.nowReads };
}

{
  const raf = [0, 1000 / 120, 15, 15.05, 25, 1000 / 30];
  const entry = [0.2, 8.4, 15.16, 15.22, 25.2, 33.5];
  const delivered = clockDelivery(raf, entry);
  assert.deepEqual(delivered.ticks, [0, 15.05, 1000 / 30]);
  assert.deepEqual(delivered.rows.map(row => row[5]), [0, 1, 1, 0, 1, 0],
    'unchanged 1.5ms allowance rejects the intermediate slot and admits only a due entry');
  assert.deepEqual(delivered.rows[3].slice(3, 5), [1000 / 60, 2000 / 60]);
  assert.equal(delivered.reads, raf.length, 'diagnostics and accepted ticks share exactly one entry read');
  const legacy = timestampPolicyTicks(raf, 1.5);
  assert.deepEqual(legacy, [0, 25, 1000 / 30], 'negative control retains the avoidable 25/8.3ms RAF pair');
  assert.equal(delivered.ticks.length, legacy.length, 'this clock-edge correction does not buy extra ticks');
}

// Same-origin monotonic clocks are required by the injected port. Invalid,
// behind-RAF or regressing samples fail back to the original timestamp policy;
// diagnostics retain the bad raw sample instead of concealing it.
for (const badEntry of [NaN, Infinity, -Infinity, -500, 14.9]) {
  const raf = [0, 15, 25, 1000 / 30];
  const result = clockDelivery(raf, [0.2, badEntry, 25.2, 33.5]);
  assert.deepEqual(result.ticks, timestampPolicyTicks(raf, 1.5));
  assert.ok(Object.is(result.rows[1][2], badEntry));
}
{
  const raf = [0, 15, 16, 25, 1000 / 30];
  const result = clockDelivery(raf, [20, 15.2, 16.2, 25.2, 33.5]);
  assert.deepEqual(result.ticks, [0, 16, 1000 / 30],
    'regressing entry samples cannot bypass admission until the monotonic watermark recovers');
  assert.equal(result.rows[1][5], 1);
  assert.equal(result.rows[2][5], 0, 'RAF fallback still admits a genuinely due callback');
}

// Eligibility is not a rolling minimum spacing rule. A genuinely late callback
// can still be followed closely by another native callback. Preserve that
// limitation and the RAF-based skip-ahead rather than silently adding a clamp.
{
  const result = clockDelivery([0, 15, 83.5, 91.8], [0.2, 80, 83.7, 92]);
  assert.deepEqual(result.ticks, [0, 15, 83.5]);
  assert.equal(result.rows[2][4], 100, 'skip ahead on the original RAF deadline grid, not entry + interval');
  assert.equal(result.rows[3][5], 1, 'a late entry cannot leave catch-up callbacks endlessly admitted');
  assert.ok(result.rows[2][2] - result.rows[1][2] < 7, 'retain the real late-callback short-pair caveat');
}

{
  let h;
  h = createHarness({ tick() { h.setNow(1000); } });
  const rows = [];
  h.scheduler.observeAnimationDecisions((...row) => rows.push(row));
  h.scheduler.schedule(); h.fireFrame(h.frames.keys().next().value, 0, 0.2);
  assert.equal(rows[0][4], 1000 / 60, 'render cost cannot move the initial RAF-anchored deadline');
  assert.equal(h.nowReads, 1, 'there is no post-observer or post-tick entry-clock read');
  h.scheduler.dispose();
}

{
  const h = createHarness();
  h.setBoot(true); h.setHidden(true); h.scheduler.schedule();
  h.fireFrame(h.frames.keys().next().value, 0, 10);
  h.setNow(110); h.listeners.get('mousedown')();
  assert.deepEqual(h.ticks, [0], 'hidden input rescue measures elapsed time from callback entry, not RAF time');
  h.setNow(111); h.listeners.get('mousedown')();
  assert.deepEqual(h.ticks, [0, 111]);
  h.scheduler.dispose();
}

{
  const h = createHarness();
  h.setBoot(true); h.setHidden(true); h.scheduler.schedule();
  h.fireFrame(h.frames.keys().next().value, 0, NaN);
  h.setNow(201); h.fireTimer();
  assert.deepEqual(h.ticks, [0, 201], 'invalid entry cannot poison the starvation watchdog wall latch');
  h.scheduler.dispose();
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
  harness.fireFrame(1, 1016, 1016.3);
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
  harness.fireFrame(2, 1000, 1000.2);
  assert.deepEqual(harness.ticks, [1000],
    'resume does not replay any hidden wall-clock frames');
  harness.scheduler.schedule();
  harness.fireFrame(3, 1008, 1008.2);
  harness.fireFrame(4, 1016, 1016.2);
  assert.deepEqual(harness.ticks, [1000, 1016], 'focus resets to one fresh RAF grid without a recovery burst');
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
function timestampPolicyTicks(timestamps, toleranceMs) {
  const interval = 1000 / 60;
  const ticks = [];
  let deadline = -Infinity;
  for (const at of timestamps) {
    if (at + toleranceMs < deadline) continue;
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
const previousTolerance = timestampPolicyTicks(earlyJitterTimestamps, 0.75);
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

// Independent same-origin entry clocks may change WHICH display callback is
// admitted, not the long-run absolute 60Hz budget. Keep zero-lag equivalence
// with the previous policy and cover noninteger display/cap ratios as well.
for (const refreshHz of [30, 59.94, 60, 75, 90, 119.88, 120, 144, 165, 240]) {
  const raf = Array.from({ length: Math.ceil(refreshHz * 10) }, (_, index) => index * 1000 / refreshHz);
  for (const lagMode of ['zero', 'small', 'variable']) {
    const entry = raf.map((at, index) => at + (lagMode === 'zero' ? 0
      : lagMode === 'small' || index % 11 !== 0 ? 0.2 : 2.6));
    const result = clockDelivery(raf, entry);
    if (lagMode === 'zero') assert.deepEqual(result.ticks, timestampPolicyTicks(raf, 1.5));
    const expected = Math.min(refreshHz, PRESENTATION_MAX_FRAME_RATE) * 10;
    assert.ok(result.ticks.length >= Math.floor(expected) - 1 && result.ticks.length <= Math.ceil(expected) + 1,
      `${refreshHz}/${lagMode}: entry eligibility retains the source-owned long-run cap`);
    assert.equal(new Set(result.ticks).size, result.ticks.length, 'one source callback cannot tick twice');
    let admitted = 0;
    for (const row of result.rows) {
      const [, timestamp, entered, before, after, decision] = row;
      if (decision === 1) {
        assert.equal(after, before, 'a rejected callback cannot consume or rebase a deadline');
        continue;
      }
      assert.equal(result.ticks[admitted], timestamp, 'ticks retain exact native RAF timestamps');
      assert.ok(entered + 1.5 + 1e-6 >= raf[0] + admitted * 1000 / 60,
        'the unchanged tolerance applies to actual entry, not a widened RAF allowance');
      const behind = timestamp - before;
      const expectedDeadline = !Number.isFinite(before) ? timestamp + 1000 / 60
        : before + (behind >= 0 ? Math.floor(behind / (1000 / 60)) + 1 : 1) * (1000 / 60);
      assert.equal(after, expectedDeadline, 'deadline progression remains based solely on RAF time');
      admitted++;
    }
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
// Execute the actual composition callbacks and listener registration against
// the real scheduler. Source extraction keeps these tiny inline owners honest
// without booting DOM/WebGL or introducing another runtime phase policy.
function mainBlock(start, end) {
  const begin = mainSource.indexOf(start), finish = mainSource.indexOf(end, begin);
  assert.ok(begin >= 0 && finish > begin, `main source block missing: ${start}`);
  return mainSource.slice(begin, finish + end.length);
}
const garageBoot = mainBlock('let garagePresentationDirty = true;',
  'let invalidateGaragePresentation = () => { garagePresentationDirty = true; };');
const garageInvalidate = mainBlock('\ninvalidateGaragePresentation = () => {', '\n};');
const garageActivity = mainBlock('const noteGarageActivity = () => {', '\n};');
const garageListeners = mainBlock("for (const type of ['pointerdown', 'wheel', 'keydown', 'touchstart', 'resize']) {", '\n}');
assert.equal(runInNewContext(`${garageBoot}\ngaragePresentationDirty = false;
  invalidateGaragePresentation(); garagePresentationDirty;`), true,
'the early boot callback only marks dirty, without reading later live owners');

function garageActivityFixture(harness, phase, legacy = false) {
  const game = { phase }, effects = [], listeners = new Map();
  const callbacks = `${garageInvalidate}\n${garageActivity}`;
  const body = legacy ? callbacks.replaceAll("  if (game.phase !== 'garage') return;\n", '') : callbacks;
  const api = runInNewContext(`${garageBoot}\n${body}\n${garageListeners}
    ({ invalidate: () => invalidateGaragePresentation(),
       isDirty: () => garagePresentationDirty, clearDirty: () => { garagePresentationDirty = false; } });`, {
    game, frameLoop: harness.scheduler, performance: { now: () => 1234 },
    garageFramePacer: { noteActivity: at => effects.push(['pacer', at]) },
    lighting: { setStaticPresentationDormant: value => effects.push(['lighting', value]) },
    garageDressingScheduler: { noteActivity: () => effects.push(['dressing']) },
    pedestal: { invalidatePreload: () => effects.push(['preload']) },
    window: { addEventListener(type, listener, options) {
      assert.equal(options.capture, true); assert.equal(options.passive, true);
      listeners.set(type, listener);
    } },
  });
  api.clearDirty();
  return { ...api, game, effects, listeners };
}

for (const phase of ['battle', 'studio']) {
  const harness = createHarness(), activity = garageActivityFixture(harness, phase);
  harness.setBoot(true); harness.scheduler.schedule();
  const queued = [...harness.frames.keys()];
  for (const listener of activity.listeners.values()) listener();
  assert.deepEqual(activity.effects, [], `${phase} input cannot touch Garage owners`);
  assert.equal(activity.isDirty(), false, `${phase} input is not Garage presentation activity`);
  activity.invalidate(); // A retained asynchronous Garage producer, not input.
  assert.equal(activity.isDirty(), true, 'late visual completion remains dirty for eventual Garage return');
  assert.deepEqual(activity.effects, [], 'late Garage completion cannot touch the active phase');
  assert.deepEqual([...harness.frames.keys()], queued, 'including resize, no foreign phase cancels or requeues its RAF');
  assert.equal(harness.cancelled.length, 0);
  activity.game.phase = 'garage'; harness.setIdle(true);
  harness.scheduler.restart(); harness.fireFrame(harness.frames.keys().next().value, 0); harness.scheduler.schedule();
  assert.ok(harness.delayed);
  activity.listeners.get('keydown')();
  assert.equal(harness.delayed, null, 'Garage input still wakes the sleeping presentation clock');
  assert.equal(harness.frames.size, 1);
  assert.deepEqual(activity.effects, [['pacer', 1234], ['lighting', false], ['dressing'], ['preload']]);
  harness.scheduler.dispose();
}

function battleInputTicks(legacy) {
  const harness = createHarness(), activity = garageActivityFixture(harness, 'battle', legacy);
  harness.setBoot(true); harness.scheduler.schedule();
  for (let index = 0; index < 720; index++) {
    const at = index * 1000 / 120;
    harness.setNow(at);
    if (index % 240 === 1) { // Repeated A/D keydown at the intervening display slot.
      activity.listeners.get('keydown')();
      harness.listeners.get('keydown')();
    }
    harness.fireFrame(harness.frames.keys().next().value, at);
    harness.scheduler.schedule();
  }
  const result = { ticks: harness.ticks, cancellations: harness.cancelled.length };
  harness.scheduler.dispose();
  return result;
}
const uninterrupted = deliveredTicks(Array.from({ length: 720 }, (_, index) => index * 1000 / 120));
const guardedInputs = battleInputTicks(false), legacyInputs = battleInputTicks(true);
assert.deepEqual(guardedInputs.ticks, uninterrupted, 'battle keydown preserves the exact native 60 Hz deadline grid');
assert.equal(guardedInputs.cancellations, 0);
assert.notDeepEqual(legacyInputs.ticks, uninterrupted, 'negative control reproduces the former input-driven clock rebasing');
assert.equal(legacyInputs.cancellations, 3, 'each old global Garage callback cancelled the active battle RAF');
assert.match(postSource, /const DYN_TARGET_MS = presentationFrameBudgetMs\(0\)/);
assert.match(postSource, /dynBudgetMs = presentationFrameBudgetMs\(dynBestCadenceMs\)/);
assert.match(mainSource, /maximumFrameRate: PRESENTATION_MAX_FRAME_RATE/);
console.log('frameLoopScheduler.selftest: capped cadence/governor agreement, real overload/recovery, background suspension, and hidden-pane recovery passed');
