import assert from 'node:assert/strict';
import {
  PREDICTION_CORRECTION_KEYS,
  decayPredictionCorrection,
} from './predictionCorrection.ts';

const correction = Object.fromEntries(PREDICTION_CORRECTION_KEYS.map((key) => [key, 1]));
decayPredictionCorrection(correction, 1 / 60, {
  horizontalTauS: 0.18,
  verticalTauS: 0.24,
  aimTauS: 0.075,
});
assert.ok(correction.y > correction.x,
  'support height settles more heavily than horizontal correction');
assert.ok(correction.x > correction.turretYaw,
  'turret aim converges faster than hull translation');
assert.equal(correction.x, correction.z, 'horizontal axes share one stable decay');
assert.equal(correction.y, correction.pitch, 'support height and hull pitch share the heavy channel');

const held = Object.fromEntries(PREDICTION_CORRECTION_KEYS.map((key) => [key, 1]));
decayPredictionCorrection(held, 1, {
  horizontalTauS: 0.18,
  verticalTauS: 0.24,
  aimTauS: 0.075,
  holdRestingHull: true,
});
for (const key of ['x', 'y', 'z', 'yaw', 'pitch', 'roll']) {
  assert.equal(held[key], 1, `rest hold preserves ${key}`);
}
assert.ok(held.turretYaw < 0.001 && held.gunPitch < 0.001,
  'resting hull never freezes live aim correction');

const immediate = Object.fromEntries(PREDICTION_CORRECTION_KEYS.map((key) => [key, 1]));
decayPredictionCorrection(immediate, 1 / 60, {
  horizontalTauS: 0,
  verticalTauS: 0,
  aimTauS: 0,
});
assert.ok(PREDICTION_CORRECTION_KEYS.every((key) => immediate[key] === 0),
  'zero-time policy remains an exact immediate convergence mode');

console.log('predictionCorrection.selftest: grouped heavy-hull correction decay passed');
