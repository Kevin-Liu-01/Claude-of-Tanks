import assert from 'node:assert/strict';
import { fillDriveTelemetry } from './driveTelemetry.js';

const out = {};
fillDriveTelemetry(out, { speed: 10 }, { topSpeedKmh: 60, reverseSpeedKmh: 18 });
assert.deepEqual(out, {
  speedKmh: 36,
  direction: 'FWD',
  limitKmh: 60,
  speedRatio: 0.6,
  sweepDeg: 162,
  needleDeg: 27,
});

fillDriveTelemetry(out, { speed: -5 }, { topSpeedKmh: 70, reverseSpeedKmh: 20 });
assert.equal(out.speedKmh, 18);
assert.equal(out.direction, 'REV');
assert.equal(out.limitKmh, 20);
assert.equal(out.speedRatio, 0.9);
assert.equal(out.sweepDeg, 243);
assert.equal(out.needleDeg, 108);

fillDriveTelemetry(out, { speed: 0 }, { topSpeedKmh: 50 });
assert.equal(out.direction, 'HOLD');
assert.equal(out.limitKmh, 50);
assert.equal(out.sweepDeg, 0);
assert.equal(out.needleDeg, -135);

console.log('driveTelemetry.selftest: circular speedometer sweep and directional limits passed');
