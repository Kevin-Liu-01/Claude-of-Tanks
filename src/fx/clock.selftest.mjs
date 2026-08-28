import assert from 'node:assert/strict';
import {
  emitPopTrail,
  fxNow,
  noteFxClockShift,
  registerFxClock,
  registerPopTrail,
} from './clock.ts';

assert.equal(fxNow(), null, 'garage-only boots have no implicit FX wall clock');

let sourceTimeS = 12;
registerFxClock(() => sourceTimeS);
assert.equal(fxNow(), 12);
sourceTimeS = 14.5;
assert.equal(fxNow(), 14.5, 'live FX time follows the registered shared source');

noteFxClockShift(20);
sourceTimeS += 20;
assert.equal(fxNow(), 14.5, 'an age-preserving rebase keeps the public timeline continuous');

const trails = [];
registerPopTrail((x, y, z, heat, birthOffset) => {
  trails.push({ x, y, z, heat, birthOffset });
});
emitPopTrail(1, 2, 3, 0.75);
emitPopTrail(-4, 5, 6, 0.25, -0.2);
assert.deepEqual(trails, [
  { x: 1, y: 2, z: 3, heat: 0.75, birthOffset: 0 },
  { x: -4, y: 5, z: 6, heat: 0.25, birthOffset: -0.2 },
]);

console.log('clock.selftest: continuous FX time and pop-trail bridge passed');
