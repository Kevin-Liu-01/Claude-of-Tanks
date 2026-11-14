// The chase camera's first look (couch-panes-272): 10 degrees under the hull's own pitch, so a spawn on a slope opens
// with the sight up the slope (inside the gun's depression), not on the ground in front of a nose-up hull.
import assert from 'node:assert/strict';
import { chaseStartPitch } from './chaseStart.ts';

const DEG = Math.PI / 180;
const close = (a, b) => Math.abs(a - b) < 1e-12;
assert.ok(close(chaseStartPitch(0), -10 * DEG), 'level ground: the old start, 10 degrees down');
assert.ok(close(chaseStartPitch(8 * DEG), -2 * DEG), 'nose up 8 degrees: the look follows the slope up');
assert.ok(close(chaseStartPitch(-6 * DEG), -16 * DEG), 'nose down: under the hull as well');
assert.ok(close(chaseStartPitch(undefined), -10 * DEG), 'no pitch read: level');
assert.ok(close(chaseStartPitch(Number.NaN), -10 * DEG));
assert.ok(close(chaseStartPitch(80 * DEG), 30 * DEG), 'within the rig\'s range');
assert.ok(close(chaseStartPitch(-80 * DEG), -65 * DEG));
// and no deeper than the gun can follow: a shallow gun starts on a farther ground point
const look = (depression) => -chaseStartPitch(0, depression) / DEG;
assert.ok(Math.abs(look(10) - 8) < 1e-9, `a 10 degree gun: 8 degrees down, its depression less the margin (${look(10).toFixed(2)})`);
assert.ok(Math.abs(look(5) - 3) < 1e-9, `a 5 degree gun: 3 degrees down (${look(5).toFixed(2)})`);
assert.ok(Math.abs(look(14) - 10) < 1e-9, `a 14 degree gun: the 10 degree look (${look(14).toFixed(2)})`);
// a hull 8.3 degrees nose-up on a mound with a 9 degree gun: the look stays within the gun's reach under the hull
assert.ok(chaseStartPitch(8.3 * DEG, 9) >= (8.3 - 7) * DEG - 1e-12, 'nose-up on a mound: never past the gun\'s depression under the hull');
assert.ok(look(3) < look(5) && look(5) < look(8), 'shallower guns look farther out');
assert.ok(close(chaseStartPitch(0, 40), -10 * DEG), 'never deeper than 10 degrees');
assert.ok(chaseStartPitch(8 * DEG, 5) > 2 * DEG, 'on a slope, under the hull\'s pitch');
assert.ok(close(chaseStartPitch(0, undefined), -10 * DEG), 'no depression read: the 10 degree look');
for (const d of [3, 5, 6, 8, 10, 12]) {
  // the gun's need at the start look's ground point, from the muzzle: inside its depression less the margin
  const a = -chaseStartPitch(0, d);
  const ground = 6 / Math.tan(a) - 20;
  const need = Math.atan(2.5 / ground) / DEG;
  assert.ok(need <= d - 1.99, `a ${d} degree gun reaches the start point (needs ${need.toFixed(2)})`);
}
console.log('chaseStart.selftest: the first look is under the hull\'s pitch and within its gun\'s depression, within the rig\'s range PASS');
