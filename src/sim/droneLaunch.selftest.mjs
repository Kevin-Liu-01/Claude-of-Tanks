// The launch climb's thrust profile (round 4, 2026-10-11; coordinator-approved sim curve; round 4b: the seated spool
// lengthened to 0.6 s, also approved, so the clamp release and disc spin-up read before the lift). Pins the profile both
// authorities, the client and the presentation share: a pure function of the flight's age with the launch time and
// height unchanged, seated through the spool, monotonic, continuous in speed and acceleration, and inside the certified
// vertical column (0 to launchHeightM above the dock, never above it).
import assert from 'node:assert/strict';
import { droneLaunchHeight, droneClimbFraction, DRONE_SPOOL_S, DRONE_CLIMB_PROFILE } from './droneLaunch.ts';
import { AERIAL_RULES } from './matchRuleset.ts';

const { launchS, launchHeightM } = AERIAL_RULES.drone;
assert.equal(launchS, 2.4, 'launch time unchanged');
assert.equal(launchHeightM, 12, 'launch height unchanged');
assert.equal(DRONE_SPOOL_S, .6, 'seated spool (round 4b)');

// Endpoints: seated through the spool, at the launch height from the launch time on.
for (const t of [-1, 0, .1, DRONE_SPOOL_S]) assert.equal(droneLaunchHeight(t), 0, `seated at ${t} s`);
for (const t of [launchS, launchS + .5, 40]) assert.equal(droneLaunchHeight(t), launchHeightM, `at the launch height at ${t} s`);
assert.equal(droneClimbFraction(0), 0); assert.ok(Math.abs(droneClimbFraction(1) - 1) < 1e-12, 'the profile closes at the launch height');

// Pinned heights (metres above the dock) at fixed ages: any change to the curve is deliberate.
const PINNED = [[.7, .148397], [.8, .82959], [1, 2.630631], [1.5, 7.135135], [2, 11.196728], [2.2, 11.880282]];
for (const [t, h] of PINNED) assert.ok(Math.abs(droneLaunchHeight(t) - h) < 1e-5, `height at ${t} s is ${droneLaunchHeight(t)} (pinned ${h})`);

// Monotonic and inside the certified column at every 1/600 s; speed continuous, zero at lift-off and at the top.
let previous = 0, peak = 0;
const speed = (t) => (droneLaunchHeight(t + 1e-5) - droneLaunchHeight(t - 1e-5)) / 2e-5;
for (let t = 0; t <= launchS + .2; t += 1 / 600) {
  const h = droneLaunchHeight(t);
  assert.ok(h >= previous - 1e-12, `never descends (${t.toFixed(3)} s)`);
  assert.ok(h >= 0 && h <= launchHeightM + 1e-12, 'inside the certified vertical column');
  previous = h; peak = Math.max(peak, speed(t));
}
assert.ok(Math.abs(speed(DRONE_SPOOL_S + 1e-4)) < .05 && Math.abs(speed(launchS - 1e-4)) < .05, 'leaves the skids and arrives at rest');
for (const u of [DRONE_CLIMB_PROFILE.rampU, 1 - DRONE_CLIMB_PROFILE.brakeU]) {
  const t = DRONE_SPOOL_S + u * (launchS - DRONE_SPOOL_S);
  assert.ok(Math.abs(speed(t - 2e-4) - speed(t + 2e-4)) < .02, `speed continuous at the profile joint u=${u}`);
}
// The character the critics asked for: off the skids fast once the spool is done (3 m within 0.45 s of the lift, by
// 1.05 s), a near-constant climb near 9 m/s, braking over the last 0.7 s.
let at3 = null; for (let t = 0; t < launchS; t += 1 / 600) if (droneLaunchHeight(t) >= 3) { at3 = t; break; }
assert.ok(at3 < 1.05, `clears the carrier's kit envelope (3 m) by ${at3.toFixed(3)} s`);
assert.ok(peak > 8.5 && peak < 9.5, `cruise climb ${peak.toFixed(2)} m/s`);
console.log(`droneLaunch: thrust profile pinned (3 m at ${at3.toFixed(3)} s, peak ${peak.toFixed(2)} m/s), seated spool, endpoints, monotonic, continuous, inside the certified column`);
