import assert from 'node:assert/strict';
import { AdaptiveQualityPolicy } from './adaptiveQualityPolicy.ts';

// 2026-11-02 audit R4 (governor warmup): the tier-down warmup (8 s) compared the absolute clock post.ts hands the policy,
// which is never reset, so it guarded only the first 8 s of the page: after a workload reset (a new battle, a Garage
// return, a released governor hold) a run of overloaded windows began striking at once. The warmup is now measured
// from the policy's reset.

const window = (clockSeconds) => ({
  clockSeconds, frameEmaMs: 40, frameBudgetMs: 16.7, missedFrameRatio: 0.9, achievedFps: 20,
  dynamicScaleFloor: 1, dynamicScaleHold: 1, maximumTrim: 0, mayRaiseTier: false, gpuFrameMs: null,
});

function strikesAfterReset(resetAt) {
  const policy = new AdaptiveQualityPolicy(1);
  policy.reset(1, resetAt);
  const actions = [];
  // overloaded windows from the reset on, 2 s apart, through the first 8 s of the new workload
  for (let t = resetAt + 2; t <= resetAt + 8; t += 2) actions.push(policy.evaluate(window(t)));
  return { policy, actions };
}

{
  // at page start (as before) and after a reset deep into the session: the same 8 s of grace
  const early = strikesAfterReset(0);
  const late = strikesAfterReset(600);
  assert.ok(early.actions.every((action) => action === 'none'));
  assert.ok(late.actions.every((action) => action === 'none'));
  assert.equal(late.policy['tierDownStrikes'], 0,
    'no tier strike lands inside a new workload\'s warmup');
  // the warmup ends: the next overloaded window is a strike
  late.policy.evaluate(window(610));
  assert.equal(late.policy['tierDownStrikes'], 1);
}

console.log('governorWarmup selftest: the tier-down warmup is each workload\'s, measured from its reset');
