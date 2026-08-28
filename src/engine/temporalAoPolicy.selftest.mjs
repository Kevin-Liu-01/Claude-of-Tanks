import assert from 'node:assert/strict';
import {
  TEMPORAL_AO_CURRENT_WEIGHT,
  TEMPORAL_AO_DARK_RELEASE_SLACK,
  resolveTemporalAoSample,
} from './temporalAoPolicy.ts';

assert.equal(TEMPORAL_AO_CURRENT_WEIGHT, 0.15);
assert.equal(TEMPORAL_AO_DARK_RELEASE_SLACK, 0);

assert.equal(resolveTemporalAoSample({
  current: 0.9,
  history: 0.2,
  neighborhoodMin: 0.1,
  neighborhoodMax: 1,
}), 0.9, 'stale darkness releases in the first exposed frame');

assert.equal(resolveTemporalAoSample({
  current: 0.35,
  history: 0.9,
  neighborhoodMin: 0.3,
  neighborhoodMax: 0.95,
}), 0.9 + (0.35 - 0.9) * TEMPORAL_AO_CURRENT_WEIGHT,
'bright history damps a transient dark occlusion sample');

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
