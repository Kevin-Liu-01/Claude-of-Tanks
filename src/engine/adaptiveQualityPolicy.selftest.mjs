import assert from 'node:assert/strict';
import { AdaptiveQualityPolicy } from './adaptiveQualityPolicy.ts';

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

console.log('adaptiveQualityPolicy.selftest: ordered relief and recovery policy passed');
