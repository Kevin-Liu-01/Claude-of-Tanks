import assert from 'node:assert/strict';
import {
  TEMPORAL_AO_BRIGHT_RETENTION_SLACK,
  TEMPORAL_AO_CURRENT_WEIGHT,
  TEMPORAL_AO_DARK_RELEASE_SLACK,
  TEMPORAL_AO_STABLE_FRAMES_BEFORE_SETTLE,
  resolveTemporalAoCurrentWeight,
  resolveTemporalAoSample,
} from './temporalAoPolicy.ts';

assert.equal(TEMPORAL_AO_BRIGHT_RETENTION_SLACK, 0.03);
assert.equal(TEMPORAL_AO_CURRENT_WEIGHT, 0.15);
assert.equal(TEMPORAL_AO_DARK_RELEASE_SLACK, 0);
assert.equal(TEMPORAL_AO_STABLE_FRAMES_BEFORE_SETTLE, 4);
assert.equal(resolveTemporalAoCurrentWeight(0), TEMPORAL_AO_CURRENT_WEIGHT);
assert.equal(resolveTemporalAoCurrentWeight(1), TEMPORAL_AO_CURRENT_WEIGHT,
  'one repeated presentation frame must not snap a 60 Hz camera on 120 Hz output');
assert.equal(resolveTemporalAoCurrentWeight(3), TEMPORAL_AO_CURRENT_WEIGHT);
assert.equal(resolveTemporalAoCurrentWeight(4), 1,
  'a genuinely stationary camera settles to an exact current-AO frame');

assert.equal(resolveTemporalAoSample({
  current: 0.9,
  history: 0.2,
  neighborhoodMin: 0.1,
  neighborhoodMax: 1,
}), 0.9, 'stale darkness releases in the first exposed frame');

const brightHistory = resolveTemporalAoSample({
  current: 0.35,
  history: 0.9,
  neighborhoodMin: 0.3,
  neighborhoodMax: 0.95,
});
const cappedBrightHistory = 0.35 + TEMPORAL_AO_BRIGHT_RETENTION_SLACK;
assert.equal(
  brightHistory,
  cappedBrightHistory
    + (0.35 - cappedBrightHistory) * TEMPORAL_AO_CURRENT_WEIGHT,
  'bright history is bounded before damping a transient dark sample',
);

const nextBrightHistory = resolveTemporalAoSample({
  current: 0.35,
  history: brightHistory,
  neighborhoodMin: 0.3,
  neighborhoodMax: 0.95,
});
assert.ok(nextBrightHistory < brightHistory,
  'a repeated camera pose converges gradually instead of snapping to current AO');
assert.ok(nextBrightHistory > 0.35,
  'a repeated camera pose retains bounded temporal smoothing');

assert.equal(resolveTemporalAoSample({
  current: 0.55,
  history: 0.1,
  neighborhoodMin: 0.4,
  neighborhoodMax: 0.7,
  historyValid: false,
}), 0.55, 'invalid history resolves to the current frame');

assert.equal(resolveTemporalAoSample({
  current: 0.5,
  history: Number.NaN,
  neighborhoodMin: 0.4,
  neighborhoodMax: 0.6,
}), 0.5, 'non-finite history fails open to current AO');

console.log('temporalAoPolicy.selftest: asymmetric dark-pulse rejection passed');
