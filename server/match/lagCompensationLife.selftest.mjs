// lagCompensationLife.selftest — lag compensation never rewinds a hull into an earlier life (audit M4, 2026-11-02).
// The pose ring was cleared only when a seat unbound; a revive (a respawn, a Turbo Ball kick-off, the range's reset)
// kept the slot, so for up to MAX_REWIND_TICKS (250 ms) a seated shooter's sweep could test the respawned hull at its
// wreck's pose, the hit landing on the new life. The mode controller counts the lives a hull begins (modeLives, its life
// transition's one revive); the history forgets a slot whose life moved on, and refuses a rewind before it has recorded
// the new life.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createLagCompensation, MAX_REWIND_TICKS } from './lagCompensation.ts';

const pose = (z) => ({ pos: new Vector3(0, 0, z), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 });
const shooter = { id: 'shooter', modeActive: true, modeLives: 0, state: pose(-100) };
const target = { id: 'target', modeActive: true, modeLives: 0, state: pose(100) };
const lag = createLagCompensation({ entities: [shooter, target] });
lag.bind(shooter, 0); lag.bind(target, 1);
lag.setRewindTicks('shooter', 10);
const shell = { shooterId: 'shooter', ageS: 0, pos: new Vector3(0, 0, 0), roofStation: false };
const sweep = () => { lag.begin(shell); const z = target.state.pos.z; lag.end(); return z; };

for (let tick = 0; tick < 20; tick++) { target.state.pos.z = 100 + tick; lag.record(tick); }
target.state.pos.z = 130;
assert.equal(sweep(), 109, 'a live hull rewinds to the pose the shooter saw');
assert.equal(target.state.pos.z, 130, 'and is put back');

// the target dies at its last pose and is revived 300 m away inside the next step: a new life, a new state object
target.state = pose(400); target.modeLives = 1;
assert.equal(sweep(), 400, 'the step\'s own sweeps, before it records the new life, test the hull where it stands');
for (let tick = 20; tick <= 20 + MAX_REWIND_TICKS; tick++) {
  lag.record(tick);
  assert.equal(sweep(), 400, `tick ${tick}: no rewind reaches back into the wreck's poses`);
}
assert.equal(lag.history.oldestTick(1) >= 20, true, 'the slot forgot the earlier life');
// the new life's own poses rewind as before
target.state.pos.z = 450; lag.record(36);
assert.equal(sweep(), 400, 'the new life rewinds to its own pose');
assert.equal(target.state.pos.z, 450);

// a living hull revived where it stands is a new life too (a kick-off line-up moves every hull)
shooter.modeLives = 1; shooter.state = pose(-300);
lag.record(37);
target.modeLives = 2; target.state = pose(10);
assert.equal(sweep(), 10, 'a kick-off revive is a life boundary');
assert.ok(lag.stats.historyMisses >= 1, 'refused rewinds count as history misses');
console.log('lagCompensationLife: a revive is a life boundary for the pose history');
