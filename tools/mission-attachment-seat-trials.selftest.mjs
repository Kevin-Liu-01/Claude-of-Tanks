import assert from 'node:assert/strict';
import {missionSeatTrials} from './mission-attachment-seat-trials.mjs';

const authored = {frame:'turret', x:.07, z:.09, braced:true, payloadOffset:[-.24,-.24]};
const fallback = {frame:'turret', x:1, z:1};
const trials = [...missionSeatTrials([authored,fallback], {candidate:authored,riseM:.32})];
assert.equal(trials.length, 7);
assert.equal(trials[0].candidate, authored);
assert.equal(trials[0].rise, .32);
assert.deepEqual(trials.filter(t=>t.candidate===fallback).map(t=>t.rise), [.045,.085,.125]);
assert.equal(trials.filter(t=>t.rise===.32).length, 1);
assert.deepEqual([...missionSeatTrials([fallback])].map(t=>t.rise), [.045,.085,.125]);
for (const riseM of [.024,.351,NaN,Infinity]) {
  assert.throws(()=>[...missionSeatTrials([fallback], {candidate:authored,riseM})]);
}
assert.throws(()=>[...missionSeatTrials([fallback], {candidate:fallback,riseM:.32})]);
assert.equal([...missionSeatTrials([fallback], {candidate:fallback,riseM:.065})][0].rise,.065);
console.log('mission seat trials: authored height stays on its exact braced hardware; fallback and invalid-height controls pass');
