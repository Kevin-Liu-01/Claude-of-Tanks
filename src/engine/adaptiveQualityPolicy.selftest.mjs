import assert from 'node:assert/strict';
import { adaptiveFrameSeconds, AdaptiveQualityPolicy, HOLD_DOWN_STRIKES } from './adaptiveQualityPolicy.ts';

assert.equal(adaptiveFrameSeconds(.1, .5), 0, 'a true long hitch is excluded despite bounded presentation dt');
assert.equal(adaptiveFrameSeconds(.1, .12), .12, 'sustained 120ms frames remain real overload evidence');
assert.equal(adaptiveFrameSeconds(.1, .25), .25, 'the existing 250ms boundary remains inclusive');
assert.equal(adaptiveFrameSeconds(.1, .250001), 0);
assert.equal(adaptiveFrameSeconds(0, .12), 0, 'zero-delta warm renders cannot invent a timing sample');
assert.equal(adaptiveFrameSeconds(0), 0);
assert.equal(adaptiveFrameSeconds(1 / 60), 1 / 60, 'standalone rendered frames retain the explicit caller interval');
for (const invalid of [NaN, Infinity, -Infinity, -1, 0]) {
  assert.equal(adaptiveFrameSeconds(.1, invalid), 0);
  assert.equal(adaptiveFrameSeconds(invalid, .12), 0);
}

const healthy = (overrides = {}) => ({
  clockSeconds: 10,
  frameEmaMs: 16,
  frameBudgetMs: 16.7,
  missedFrameRatio: 0,
  achievedFps: 60,
  dynamicScaleFloor: 0.9,
  maximumTrim: 1,
  mayRaiseTier: false,
  ...overrides,
});

const overloaded = (overrides = {}) => healthy({
  frameEmaMs: 25,
  missedFrameRatio: 0.8,
  achievedFps: 40,
  ...overrides,
});

{
  const policy = new AdaptiveQualityPolicy(1);
  const sampled = adaptiveFrameSeconds(.1, .12);
  assert.equal(policy.evaluate(overloaded({ frameEmaMs: sampled * 1000,
    achievedFps: 1 / sampled, maximumTrim: 0 })), 'resolution-down',
  'real sustained low-FPS evidence still activates ordinary quality relief');
  assert.equal(policy.dynamicScale, .91);
}

function assertNoTrimAfterTwoWindows(windowFactory, message) {
  const policy = new AdaptiveQualityPolicy(1);
  policy.evaluate(windowFactory({ clockSeconds: 10 }));
  policy.evaluate(windowFactory({ clockSeconds: 12 }));
  assert.equal(policy.performanceTrim, 0, message);
}

{
  const policy = new AdaptiveQualityPolicy(1);
  assert.equal(policy.evaluate(healthy()), 'none');
  assert.equal(policy.learnedBaselineFps, 60, 'healthy evidence earns a cadence baseline');
  assert.equal(policy.evaluate(overloaded({ clockSeconds: 12 })), 'none',
    'one overloaded window cannot discard GTAO');
  assert.equal(policy.evaluate(overloaded({ clockSeconds: 14 })), 'trim-down',
    'two overloaded windows trim expensive shading before resolution');
  assert.equal(policy.performanceTrim, 1);
  assert.equal(policy.dynamicScale, 1);
  assert.equal(policy.evaluate(overloaded({ clockSeconds: 16 })), 'resolution-down');
  assert.ok(Math.abs(policy.dynamicScale - 0.91) < 1e-12,
    'resolution moves by one bounded step only after trim exhaustion');
  assert.equal(policy.evaluate(healthy({ clockSeconds: 17.5 })), 'resolution-up',
    'a non-flapping resolution cut recovers after the base interval');
}

assertNoTrimAfterTwoWindows(
  (time) => healthy({ ...time, frameEmaMs: 25, missedFrameRatio: 0 }),
  'high frame time alone is not enough to demote quality',
);
assertNoTrimAfterTwoWindows(
  (time) => healthy({ ...time, frameEmaMs: 16, missedFrameRatio: 0.8 }),
  'scheduler misses alone are not enough to demote quality',
);
assertNoTrimAfterTwoWindows(
  (time) => healthy({ ...time, frameEmaMs: 16.7 * 1.08, missedFrameRatio: 0.8 }),
  'the frame-time boundary is exclusive',
);
assertNoTrimAfterTwoWindows(
  (time) => healthy({ ...time, frameEmaMs: 25, missedFrameRatio: 0.15 }),
  'the missed-frame boundary is exclusive',
);

{
  const policy = new AdaptiveQualityPolicy(1);
  policy.evaluate(healthy({ achievedFps: 24 }));
  assert.equal(policy.evaluate(healthy({ clockSeconds: 12, achievedFps: 19 })), 'none');
  assert.equal(policy.learnedBaselineFps, 23.25,
    'the minimum learned cadence still classifies and decays a material decline');
}

assertNoTrimAfterTwoWindows(
  (time) => healthy({ ...time, achievedFps: 23 }),
  'an already-slow cadence cannot create a decline baseline',
);

{
  const policy = new AdaptiveQualityPolicy(1);
  policy.evaluate(healthy({ achievedFps: 23 }));
  policy.evaluate(healthy({ clockSeconds: 12, achievedFps: 10 }));
  policy.evaluate(healthy({ clockSeconds: 14, achievedFps: 10 }));
  assert.equal(policy.performanceTrim, 0,
    'cadence decline detection stays disabled below its minimum baseline');
}

{
  const policy = new AdaptiveQualityPolicy(1);
  policy.evaluate(healthy({ achievedFps: 100 }));
  policy.evaluate(healthy({ clockSeconds: 12, achievedFps: 80 }));
  assert.equal(policy.learnedBaselineFps, 99,
    'an exact twenty-percent boundary remains a normal slow-learning window');
  assert.equal(policy.evaluate(healthy({ clockSeconds: 14, achievedFps: 80 })), 'none',
    'the twenty-percent decline boundary is exclusive');
}

{
  const policy = new AdaptiveQualityPolicy(1);
  policy.evaluate(healthy({ achievedFps: 150 }));
  policy.evaluate(healthy({ clockSeconds: 12, achievedFps: 118 }));
  assert.equal(policy.learnedBaselineFps, 148.4,
    'the smooth-ceiling boundary remains outside decline classification');
  assert.equal(policy.evaluate(healthy({ clockSeconds: 14, achievedFps: 118 })), 'none',
    'smooth 118 fps delivery must not trigger a tier response');
}

{
  const policy = new AdaptiveQualityPolicy(1);
  assert.equal(policy.evaluate(healthy({ clockSeconds: 10 })), 'none');
  assert.equal(policy.evaluate(healthy({ clockSeconds: 12 })), 'none');
  assert.equal(policy.learnedBaselineFps, 60);
  policy.evaluate(healthy({ clockSeconds: 14, achievedFps: 90 }));
  assert.equal(policy.learnedBaselineFps, 69,
    'a faster clean cadence is learned at the fast rate');
  policy.reset(1, 20);
  policy.evaluate(healthy({ clockSeconds: 20, achievedFps: 60 }));
  policy.evaluate(healthy({ clockSeconds: 22, achievedFps: 50 }));
  assert.equal(policy.learnedBaselineFps, 59.5,
    'a small non-overloaded slowdown is learned reluctantly');
  policy.evaluate(overloaded({ clockSeconds: 24, achievedFps: 70 }));
  assert.equal(policy.learnedBaselineFps, 59.5,
    'absolute overload does not redefine a healthy baseline upward');
}

{
  const windows = [
    healthy({ frameEmaMs: 16.7 * 1.06 }),
    healthy({ missedFrameRatio: 0.04 }),
    healthy({ frameEmaMs: 16.7 * 1.07 }),
    healthy({ missedFrameRatio: 0.10 }),
  ];
  for (const window of windows) {
    const policy = new AdaptiveQualityPolicy(0.9);
    assert.equal(policy.evaluate(window), 'none',
      'resolution recovery requires both clean evidence thresholds');
    assert.equal(policy.dynamicScale, 0.9);
  }
}

{
  const policy = new AdaptiveQualityPolicy(1);
  for (let strike = 0; strike < 3; strike++) {
    assert.equal(policy.evaluate(healthy({
      clockSeconds: 45 + strike * 2,
      mayRaiseTier: true,
    })), 'none');
  }
  assert.equal(policy.evaluate(healthy({ clockSeconds: 51, mayRaiseTier: true })), 'tier-up',
    'four long-stable windows restore one hardware-permitted auto tier');
  assert.equal(policy.evaluate(healthy({ clockSeconds: 53, mayRaiseTier: false })), 'none',
    'hardware or user caps suppress tier recovery');
}

{
  const policy = new AdaptiveQualityPolicy(1);
  for (let strike = 0; strike < 4; strike++) {
    assert.equal(policy.evaluate(healthy({
      clockSeconds: 10 + strike * 2,
      mayRaiseTier: true,
    })), 'none');
  }
  assert.equal(policy.evaluate(healthy({ clockSeconds: 45, mayRaiseTier: true })), 'none',
    'stability before the long evidence window cannot restore a tier');
}

{
  const policy = new AdaptiveQualityPolicy(1);
  policy.reset(1, 30);
  for (let strike = 0; strike < 4; strike++) {
    assert.equal(policy.evaluate(healthy({
      clockSeconds: 40 + strike * 2,
      mayRaiseTier: true,
    })), 'none', 'tier stability is measured from the latest workload reset');
  }
}

{
  const policy = new AdaptiveQualityPolicy(1);
  for (let strike = 0; strike < 4; strike++) {
    assert.equal(policy.evaluate(healthy({
      clockSeconds: 45 + strike * 2,
      mayRaiseTier: false,
    })), 'none');
  }
}

{
  const policy = new AdaptiveQualityPolicy(1);
  const notClean = healthy({ frameEmaMs: 16.7 * 1.07, mayRaiseTier: true });
  for (let strike = 0; strike < 4; strike++) {
    assert.equal(policy.evaluate({ ...notClean, clockSeconds: 45 + strike * 2 }), 'none',
      'tier recovery requires clean frame-time evidence');
  }
}

{
  const policy = new AdaptiveQualityPolicy(0.9);
  policy.evaluate(healthy({ clockSeconds: 2, maximumTrim: 0 }));
  policy.evaluate(overloaded({ clockSeconds: 4, maximumTrim: 0 }));
  policy.evaluate(healthy({ clockSeconds: 7, maximumTrim: 0 }));
  policy.evaluate(overloaded({ clockSeconds: 8, maximumTrim: 0 }));
  policy.evaluate(healthy({ clockSeconds: 14, maximumTrim: 0 }));
  policy.evaluate(overloaded({ clockSeconds: 15, maximumTrim: 0 }));
  policy.evaluate(healthy({ clockSeconds: 27, maximumTrim: 0 }));
  policy.evaluate(healthy({ clockSeconds: 39, maximumTrim: 0 }));
  policy.evaluate(overloaded({ clockSeconds: 44, maximumTrim: 0 }));
  for (let strike = 0; strike < 4; strike++) {
    assert.equal(policy.evaluate(healthy({
      clockSeconds: 45 + strike * 2,
      maximumTrim: 0,
      mayRaiseTier: true,
    })), 'none', 'tier recovery cannot bypass reduced structural resolution');
  }
}

{
  const policy = new AdaptiveQualityPolicy(1);
  policy.evaluate(overloaded({ clockSeconds: 42 }));
  policy.evaluate(overloaded({ clockSeconds: 44 }));
  for (let strike = 0; strike < 4; strike++) {
    assert.equal(policy.evaluate(healthy({
      clockSeconds: 45 + strike * 2,
      mayRaiseTier: true,
    })), 'none', 'tier recovery cannot bypass an active shading trim');
  }
}

{
  const policy = new AdaptiveQualityPolicy(1);
  policy.evaluate(healthy());
  policy.forceTrim(1, 1);
  policy.setDynamicScale(0.9);
  assert.equal(policy.evaluate(overloaded({ clockSeconds: 8 })), 'none',
    'the boot grace period prevents an early tier drop');
  for (let strike = 1; strike < 4; strike++) {
    assert.equal(policy.evaluate(overloaded({ clockSeconds: 10 + strike * 2 })), 'none');
  }
  assert.equal(policy.evaluate(overloaded({ clockSeconds: 18 })), 'tier-down',
    'the exhausted ladder requires four evidence windows before an auto-tier drop');
}

{
  const policy = new AdaptiveQualityPolicy(0.9);
  assert.equal(policy.evaluate(healthy({ clockSeconds: 2 })), 'resolution-up',
    'clean evidence restores structural resolution before optional shading');
  assert.ok(Math.abs(policy.dynamicScale - 0.99) < 1e-12);
  assert.equal(policy.evaluate(healthy({ clockSeconds: 2.5 })), 'none',
    'resolution recovery remains rate limited');
}

{
  const policy = new AdaptiveQualityPolicy(1);
  assert.equal(policy.evaluate(overloaded({ clockSeconds: 2 })), 'none');
  assert.equal(policy.evaluate(overloaded({ clockSeconds: 4 })), 'trim-down');
  assert.equal(policy.evaluate(healthy({ clockSeconds: 14 })), 'none');
  assert.equal(policy.evaluate(healthy({ clockSeconds: 19 })), 'trim-up',
    'GTAO returns only after the longer clean-window backoff');
  assert.equal(policy.performanceTrim, 0);
  assert.equal(policy.evaluate(overloaded({ clockSeconds: 24 })), 'none');
  assert.equal(policy.evaluate(overloaded({ clockSeconds: 25 })), 'trim-down',
    'a trim that flaps shortly after restoration is reapplied');
  assert.equal(policy.evaluate(healthy({ clockSeconds: 40 })), 'none',
    'a flapped trim doubles its restoration backoff');
  assert.equal(policy.evaluate(healthy({ clockSeconds: 55 })), 'trim-up');
}

{
  const policy = new AdaptiveQualityPolicy(1);
  policy.evaluate(overloaded({ clockSeconds: 2 }));
  policy.evaluate(overloaded({ clockSeconds: 4 }));
  policy.evaluate(healthy({ clockSeconds: 19 }));
  policy.evaluate(overloaded({ clockSeconds: 34 }));
  policy.evaluate(overloaded({ clockSeconds: 35 }));
  assert.equal(policy.evaluate(healthy({ clockSeconds: 50 })), 'trim-up',
    'a trim reapplied exactly sixteen seconds after recovery is not a flap');
}

{
  const windows = [
    healthy({ clockSeconds: 19, frameEmaMs: 16.7 * 1.06 }),
    healthy({ clockSeconds: 19, missedFrameRatio: 0.10 }),
  ];
  for (const window of windows) {
    const policy = new AdaptiveQualityPolicy(1);
    policy.evaluate(overloaded({ clockSeconds: 2 }));
    policy.evaluate(overloaded({ clockSeconds: 4 }));
    assert.equal(policy.evaluate(window), 'none',
      'optional shading restoration keeps strict frame and miss boundaries');
    assert.equal(policy.performanceTrim, 1);
  }
}

{
  const policy = new AdaptiveQualityPolicy(1);
  policy.evaluate(overloaded({ clockSeconds: 2 }));
  policy.evaluate(overloaded({ clockSeconds: 4 }));
  policy.evaluate(healthy({ clockSeconds: 19 }));
  policy.forceTrim(1, 1);
  assert.equal(policy.evaluate(healthy({ clockSeconds: 30 })), 'none',
    'a forced trim cannot immediately undo a recent restoration');
  assert.equal(policy.evaluate(healthy({ clockSeconds: 34 })), 'trim-up',
    'the recent-restoration backoff is inclusive at its exact boundary');
}

{
  const policy = new AdaptiveQualityPolicy(1);
  policy.evaluate(overloaded({ clockSeconds: 2, maximumTrim: 2 }));
  policy.evaluate(overloaded({ clockSeconds: 4, maximumTrim: 2 }));
  assert.equal(policy.performanceTrim, 1,
    'one decision cannot skip across multiple trim rungs');
}

{
  const policy = new AdaptiveQualityPolicy(0.9);
  assert.equal(policy.evaluate(healthy({ clockSeconds: 2, maximumTrim: 0 })), 'resolution-up');
  assert.equal(policy.evaluate(overloaded({ clockSeconds: 4, maximumTrim: 0 })),
    'resolution-down', 'a recent recovery that fails is treated as a flap');
  assert.equal(policy.evaluate(healthy({ clockSeconds: 6, maximumTrim: 0 })), 'none',
    'a resolution flap doubles the next recovery delay');
  assert.equal(policy.evaluate(healthy({ clockSeconds: 7, maximumTrim: 0 })), 'resolution-up');
  policy.evaluate(overloaded({ clockSeconds: 8, maximumTrim: 0 }));
  assert.equal(policy.evaluate(healthy({ clockSeconds: 69, maximumTrim: 0 })), 'resolution-up',
    'a stable minute forgives resolution recovery backoff');
  policy.evaluate(overloaded({ clockSeconds: 70, maximumTrim: 0 }));
  assert.equal(policy.evaluate(healthy({ clockSeconds: 74, maximumTrim: 0 })), 'resolution-up',
    'the forgiven backoff restarts from the base interval after a new flap');
}

{
  const policy = new AdaptiveQualityPolicy(0.9);
  policy.evaluate(healthy({ clockSeconds: 2, maximumTrim: 0 }));
  policy.evaluate(overloaded({ clockSeconds: 10, maximumTrim: 0 }));
  assert.equal(policy.evaluate(healthy({ clockSeconds: 11.5, maximumTrim: 0 })), 'resolution-up',
    'a cut exactly eight seconds after recovery is not a flap');
}

{
  const policy = new AdaptiveQualityPolicy(0.9);
  policy.reset(0.9, 30);
  policy.evaluate(healthy({ clockSeconds: 32, maximumTrim: 0 }));
  policy.evaluate(overloaded({ clockSeconds: 34, maximumTrim: 0 }));
  policy.evaluate(healthy({ clockSeconds: 37, maximumTrim: 0 }));
  policy.evaluate(overloaded({ clockSeconds: 39, maximumTrim: 0 }));
  policy.evaluate(healthy({ clockSeconds: 45, maximumTrim: 0 }));
  policy.evaluate(overloaded({ clockSeconds: 46, maximumTrim: 0 }));
  assert.equal(policy.evaluate(healthy({ clockSeconds: 50, maximumTrim: 0 })), 'none',
    'backoff expiry uses elapsed time, not the sum of absolute timestamps');
}

{
  const policy = new AdaptiveQualityPolicy(0.95);
  assert.equal(policy.setDynamicScale(0.95), false);
  assert.equal(policy.setDynamicScale(0.9), true);
  assert.equal(policy.resetTrims(), false);
  assert.equal(policy.forceTrim(4, 1), true);
  assert.equal(policy.forceTrim(1, 1), false);
  assert.equal(policy.resetTrims(), true);
  policy.reset(1, 30);
  assert.equal(policy.dynamicScale, 1);
  assert.equal(policy.performanceTrim, 0);
  assert.equal(policy.learnedBaselineFps, 0);
}

{
  const policy = new AdaptiveQualityPolicy(1);
  policy.evaluate(healthy({ achievedFps: 100 }));
  const baseline = policy.learnedBaselineFps;
  policy.evaluate(overloaded({ clockSeconds: 12, achievedFps: 70 }));
  assert.ok(policy.learnedBaselineFps < baseline,
    'a material cadence decline decays the learned baseline toward reality');
}

{
  const policy = new AdaptiveQualityPolicy(1);
  policy.evaluate(healthy({ clockSeconds: 10 }));
  policy.evaluate(overloaded({ clockSeconds: 12 }));
  policy.evaluate(overloaded({ clockSeconds: 14 }));
  policy.evaluate(overloaded({ clockSeconds: 16 }));
  policy.evaluate(healthy({ clockSeconds: 17.5 }));
  policy.evaluate(overloaded({ clockSeconds: 18 }));
  assert.ok(Math.abs(policy.dynamicScale - 0.91) < 1e-12);
  assert.equal(policy.performanceTrim, 1);
  const { scale, ...evidence } = { ...policy };
  assert.equal(scale, policy.dynamicScale);
  assert.equal(policy.reconcileDynamicScaleFloor(0.9), false,
    'a legal DPR2 relief state must not be raised to the ordinary base');
  assert.equal(policy.reconcileDynamicScaleFloor(1), true,
    'DPR1 sizing reconciles the raw scalar with its already-effective floor');
  assert.equal(policy.dynamicScale, 1);
  assert.equal(policy.reconcileDynamicScaleFloor(1), false,
    'repeated sizing is idempotent');
  assert.equal(policy.reconcileDynamicScaleFloor(0.9), false,
    'a lower floor neither lowers scale nor resurrects stale relief');
  const { scale: reconciledScale, ...retainedEvidence } = { ...policy };
  assert.equal(reconciledScale, 1);
  assert.deepEqual(retainedEvidence, evidence,
    'sizing preserves every learned cadence, trim, strike, clock and backoff slot');
  assert.equal(policy.evaluate(overloaded({ clockSeconds: 19 })), 'resolution-down',
    'real overload can still reduce resolution immediately after returning to DPR2');
  assert.equal(policy.evaluate(healthy({ clockSeconds: 23 })), 'none',
    'the pre-resize flapping history still delays resolution recovery');
  assert.equal(policy.evaluate(healthy({ clockSeconds: 25 })), 'resolution-up');
}

// 2026-10-13 (the perf stream; the coordinator's DPR ruling): Auto High on a retina panel holds a 1.25 raster
// (0.8334 of its 1.5 cap) under load. One cut from the full raster lands on the hold; the raster goes toward the 1.0
// floor only after HOLD_DOWN_STRIKES consecutive overloaded windows; recovery climbs back to the hold first, then to
// the full raster in one step when the measured GPU time predicts room, with the anti-flap backoff as before.
{
  const held = (overrides = {}) => ({ dynamicScaleFloor: 0.667, dynamicScaleHold: 0.8334, maximumTrim: 0, ...overrides });
  const policy = new AdaptiveQualityPolicy(1);
  assert.equal(policy.evaluate(overloaded(held({ clockSeconds: 10 }))), 'resolution-down');
  assert.equal(policy.dynamicScale, 0.8334, 'one cut lands on the hold rung (1.5 -> 1.25), not on 0.91 (1.365)');
  for (let i = 1; i < HOLD_DOWN_STRIKES; i++) {
    assert.equal(policy.evaluate(overloaded(held({ clockSeconds: 10 + 1.5 * i }))), 'none', `held through window ${i}`);
    assert.equal(policy.dynamicScale, 0.8334);
  }
  assert.equal(policy.evaluate(overloaded(held({ clockSeconds: 10 + 1.5 * HOLD_DOWN_STRIKES }))), 'resolution-down',
    'a sustained overload takes the raster below the hold');
  assert.ok(Math.abs(policy.dynamicScale - 0.7434) < 1e-9, 'one ordinary step below the hold');
  // a clean window between overloaded ones restarts the count at the hold
  const brief = new AdaptiveQualityPolicy(0.8334);
  brief.evaluate(overloaded(held({ clockSeconds: 20 })));
  brief.evaluate(overloaded(held({ clockSeconds: 21.5 })));
  brief.evaluate(healthy(held({ clockSeconds: 23, frameEmaMs: 17.5, missedFrameRatio: 0.1 })));
  brief.evaluate(overloaded(held({ clockSeconds: 24.5 })));
  brief.evaluate(overloaded(held({ clockSeconds: 26 })));
  assert.equal(brief.dynamicScale, 0.8334, 'brief overloads never leave the hold');
  // recovery: back to the hold first, then the full raster in one step
  const up = new AdaptiveQualityPolicy(0.7434);
  assert.equal(up.evaluate(healthy(held({ clockSeconds: 40 }))), 'resolution-up');
  assert.equal(up.dynamicScale, 0.8334, 'below the hold, recovery climbs to the hold (not past it)');
  assert.equal(up.evaluate(healthy(held({ clockSeconds: 42 }))), 'resolution-up');
  assert.equal(up.dynamicScale, 1, 'the hold returns to the full raster in one step');
  // with a GPU sample the step up from the hold must fit: 1/0.8334 squared = 1.44x the pixels
  const gpuBound = new AdaptiveQualityPolicy(0.8334);
  assert.equal(gpuBound.evaluate(healthy(held({ clockSeconds: 50, gpuFrameMs: 11 }))), 'none',
    '11 ms at 1.25 predicts 15.8 ms at 1.5, over 0.85 of the budget: hold');
  assert.equal(gpuBound.evaluate(healthy(held({ clockSeconds: 52, gpuFrameMs: 9 }))), 'resolution-up',
    '9 ms predicts 13 ms: room');
  // a flapped return to the full raster backs off before the next try
  const flap = new AdaptiveQualityPolicy(0.8334);
  assert.equal(flap.evaluate(healthy(held({ clockSeconds: 60 }))), 'resolution-up');
  assert.equal(flap.evaluate(overloaded(held({ clockSeconds: 61.5 }))), 'resolution-down');
  assert.equal(flap.dynamicScale, 0.8334);
  assert.equal(flap.evaluate(healthy(held({ clockSeconds: 63 }))), 'none', 'the backoff doubled: no immediate retry');
  assert.equal(flap.evaluate(healthy(held({ clockSeconds: 64.6 }))), 'resolution-up');
  // without a declared hold (explicit High, native-density panels) the plain 0.09 ladder is unchanged
  const plain = new AdaptiveQualityPolicy(1);
  plain.evaluate(overloaded({ clockSeconds: 10, maximumTrim: 0, dynamicScaleFloor: 0.667 }));
  assert.equal(plain.dynamicScale, 0.91);
  const sameAsFloor = new AdaptiveQualityPolicy(1);
  sameAsFloor.evaluate(overloaded({ clockSeconds: 10, maximumTrim: 0, dynamicScaleFloor: 0.9, dynamicScaleHold: 0.9 }));
  assert.equal(sameAsFloor.dynamicScale, 0.91, 'a hold at the floor is the plain ladder');
}

console.log('adaptiveQualityPolicy.selftest: ordered relief and recovery policy passed');
