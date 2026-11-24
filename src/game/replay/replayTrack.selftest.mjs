// The replay viewer's track (replay-system-275, docs/REPLAY.md §3 P2): no world, no fleet. A synthetic battle of two hulls
// and a shell sampled every TRACK_EVERY steps; the track keeps every sampled number (as Float32), a hull off the field
// is NaN and not posed, poses blend between samples (a yaw across ±π the short way round), flags step rather than blend,
// and a shell in flight is drawn at the blend of its two samples.
import assert from 'node:assert/strict';
import { TRACK_EVERY, TRACK_FLAG_BURNING, TRACK_FLAG_DESTROYED, createReplayTrackBuilder, forEachTrackShell, trackDurationS, trackPose,
  trackSampleTimeS, trackValue } from './replayTrack.ts';

const hull = (id, team) => ({ id, specId: `${id}_spec`, team,
  state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0, speed: 0 },
  combat: { hp: 100, maxHp: 100, destroyed: false, fire: { burning: false } } });
const a = hull('a', 'alpha'), b = hull('b', 'bravo');
const game = { tanks: [a, b], shells: [], tick: 0 };
const builder = createReplayTrackBuilder(game);
const STEPS = 120;
for (let tick = 1; tick <= STEPS; tick++) {
  game.tick = tick;
  a.state.pos.x = tick * 0.5;
  a.state.yaw = 3.1 + tick * 0.01; // runs past π
  b.combat.hp = Math.max(0, 100 - tick);
  if (tick === 60) { b.combat.destroyed = true; b.combat.fire.burning = true; }
  if (tick === 90) b.state = null; // off the field
  game.shells = tick >= 30 && tick < 45 ? [{ id: 7, dead: false, pos: { x: tick, y: 2, z: -tick } }, { id: 8, dead: true, pos: { x: 0, y: 0, z: 0 } }] : [];
  builder.afterStep(game);
}
const track = builder.finish();
assert.equal(track.samples, STEPS / TRACK_EVERY, 'one sample every TRACK_EVERY steps');
assert.equal(track.sampleHz, 20);
assert.deepEqual(track.hulls.map((h) => [h.id, h.specId, h.team, h.maxHp]), [['a', 'a_spec', 'alpha', 100], ['b', 'b_spec', 'bravo', 100]]);
assert.equal(trackSampleTimeS(track, 0), TRACK_EVERY / 60, 'sample 0 is the battle after step TRACK_EVERY');
assert.equal(trackDurationS(track), STEPS / 60);

// a sampled moment reads back exactly (Float32 of the number); between samples, the blend
const at = (tick) => tick / 60;
assert.equal(trackValue(track, 0, 'x', at(30)), Math.fround(15));
assert.ok(Math.abs(trackValue(track, 0, 'x', at(31)) - 15.5) < 1e-5, 'x blends between samples');
// yaw: sampled at 3.40 and 3.43 rad (past π); the blend is between them, not the long way round
assert.ok(Math.abs(trackValue(track, 0, 'yaw', at(31)) - 3.41) < 1e-5, 'yaw blends the short way round');
const pose = { pos: [0, 0, 0], yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 };
assert.equal(trackPose(track, 0, at(60), pose), true);
assert.equal(pose.pos[0], Math.fround(30));
// flags step at the half, hp blends
assert.equal(trackValue(track, 1, 'flags', at(57)), 0, 'alive before the step it died');
assert.equal(trackValue(track, 1, 'flags', at(60)), TRACK_FLAG_DESTROYED | TRACK_FLAG_BURNING, 'destroyed and burning from its sample');
assert.equal(trackValue(track, 1, 'hp', at(30)), 70);
// off the field: not posed
assert.equal(trackPose(track, 1, at(99), pose), false, 'a hull off the field is not posed');
// before the first sample and after the last: clamped
assert.equal(trackValue(track, 0, 'x', 0), Math.fround(1.5));
assert.equal(trackValue(track, 0, 'x', 99), Math.fround(60));

// shells: only live ones, blended between their samples
const seen = [];
forEachTrackShell(track, at(31), (id, x, y, z) => seen.push([id, x, y, z]));
assert.equal(seen.length, 1, 'a dead shell is not drawn');
assert.equal(seen[0][0], 7);
assert.ok(Math.abs(seen[0][1] - 31) < 1e-5 && Math.abs(seen[0][3] + 31) < 1e-5, 'a shell is drawn at the blend of its samples');
const none = [];
forEachTrackShell(track, at(60), (id) => none.push(id));
assert.deepEqual(none, [], 'no shell after it landed');

console.log(`replayTrack.selftest: ${track.samples} samples of two hulls at ${track.sampleHz} Hz; exact at the samples, blended between (a yaw `
  + 'past π the short way round), flags stepped, a hull off the field unposed, a shell drawn between its samples');
