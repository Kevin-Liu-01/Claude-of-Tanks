import assert from 'node:assert/strict';
import {
  STUDIO_MAX_DURATION_MS,
  STUDIO_MIN_DURATION_MS,
  clampStudioDuration,
  normalizeStoryboard,
  upsertCameraShot,
  removeCameraShot,
  upsertActorKey,
  clearActorTrack,
  sampleCameraRail,
  sampleActorTrack,
  sampleCameraCues,
} from './studioTimeline.ts';

assert.equal(clampStudioDuration(-4), STUDIO_MIN_DURATION_MS);
assert.equal(clampStudioDuration(99_000), STUDIO_MAX_DURATION_MS);

const normalized = normalizeStoryboard({
  durationMs: 25_000,
  shots: [
    { id: 'late', tMs: 30_000, pos: [20, 5, 0], lookAt: [0, 2, 0], fov: 500 },
    { id: 'start', tMs: -5, pos: [0, 4, -10], lookAt: [0, 2, 0], transition: 'linear' },
    { id: 'replace-late', tMs: 20_000, pos: [22, 6, 0], lookAt: [1, 2, 0] },
  ],
  actorTracks: [
    { actor: 'alpha', keys: [
      { id: 'a1', tMs: 0, pos: [0, 0], facingDeg: 350 },
      { id: 'a2', tMs: 20_000, pos: [10, 5], facingDeg: 10 },
    ] },
  ],
});
assert.equal(normalized.durationMs, 20_000);
assert.deepEqual(normalized.shots.map((shot) => shot.id), ['start', 'replace-late']);
assert.equal(normalized.shots[1].fov, 50, 'same-time replacement keeps the last authored shot');

let board = normalizeStoryboard({ durationMs: 10_000 });
board = upsertCameraShot(board, {
  id: 'wide', tMs: 0, pos: [0, 4, -12], lookAt: [0, 2, 0], fov: 50,
});
board = upsertCameraShot(board, {
  id: 'close', tMs: 10_000, pos: [12, 6, 0], lookAt: [0, 2, 0], fov: 30,
});
assert.equal(board.shots.length, 2);
board = removeCameraShot(board, 'wide');
assert.deepEqual(board.shots.map((shot) => shot.id), ['close']);

board = upsertActorKey(board, 'alpha', {
  id: 'key-1', tMs: 0, pos: [0, 0], facingDeg: 350, turretDeg: 170, gunDeg: -4,
});
board = upsertActorKey(board, 'alpha', {
  id: 'key-2', tMs: 10_000, pos: [10, 0], facingDeg: 10, turretDeg: -170, gunDeg: 6,
});
board = upsertActorKey(board, 'alpha', {
  id: 'key-2b', tMs: 10_000, pos: [12, 0], facingDeg: 10, turretDeg: -170, gunDeg: 6,
});
assert.equal(board.actorTracks[0].keys.length, 2, 'one actor key per timestamp');
assert.equal(board.actorTracks[0].keys[1].pos[0], 12);

const actorFrame = {};
assert(sampleActorTrack(board.actorTracks[0].keys, 5_000, actorFrame));
assert(Math.abs(actorFrame.x - 6) < 1e-9);
assert(Math.abs(actorFrame.facingDeg - 360) < 1e-9, 'angles take the shortest arc');
assert(Math.abs(actorFrame.turretDeg - 180) < 1e-9, 'turret takes the shortest arc');
assert.equal(actorFrame.gunDeg, 1);
board = clearActorTrack(board, 'alpha');
assert.equal(board.actorTracks.length, 0);

const rail = normalizeStoryboard({
  durationMs: 10_000,
  shots: [
    { id: 's0', tMs: 0, pos: [0, 2, 0], lookAt: [0, 1, 10], fov: 60 },
    { id: 's1', tMs: 5_000, pos: [10, 4, 0], lookAt: [5, 1, 10], fov: 45 },
    { id: 's2', tMs: 10_000, pos: [20, 2, 0], lookAt: [10, 1, 10], fov: 30 },
  ],
}).shots;
const cameraFrame = {};
assert(sampleCameraRail(rail, 0, cameraFrame));
assert.deepEqual([cameraFrame.x, cameraFrame.y, cameraFrame.z], [0, 2, 0]);
assert(sampleCameraRail(rail, 5_000, cameraFrame));
assert.deepEqual([cameraFrame.x, cameraFrame.y, cameraFrame.z], [10, 4, 0]);
assert(sampleCameraRail(rail, 10_000, cameraFrame));
assert.equal(cameraFrame.fov, 30);

const cutRail = normalizeStoryboard({
  durationMs: 4_000,
  shots: [
    { id: 'a', tMs: 0, pos: [0, 0, 0], lookAt: [0, 0, 1] },
    { id: 'b', tMs: 4_000, pos: [20, 0, 0], lookAt: [20, 0, 1], transition: 'cut' },
  ],
}).shots;
sampleCameraRail(cutRail, 3_999, cameraFrame);
assert.equal(cameraFrame.x, 0);
sampleCameraRail(cutRail, 4_000, cameraFrame);
assert.equal(cameraFrame.x, 20);

const cinematic = normalizeStoryboard({
  version: 2, durationMs: 3000,
  shots: [
    { tMs: 0, pos: [0, 0, 0], handleOut: [0, 6, 0] },
    { tMs: 3000, pos: [6, 0, 0], handleIn: [6, 6, 0], transition: 'bezier' },
  ],
  cameraCues: [{ tMs: 500, durationMs: 1000, amplitudeM: 0.5,
    rollDeg: 3, fovKickDeg: 4, frequencyHz: 12, seed: 42 }],
  actorTracks: [{ actor: 'turn', keys: [
    { tMs: 0, pos: [0, 0], facingDeg: 0, turretDeg: 90 },
    { tMs: 3000, pos: [6, 6], facingDeg: 90, turretDeg: 0, transition: 'drive' },
  ] }],
});
assert.deepEqual(normalizeStoryboard(JSON.parse(JSON.stringify(cinematic))), cinematic,
  'v2 round trips handles, cues and drive transitions');
assert.equal(normalizeStoryboard({ version: 1 }).version, 2, 'legacy boards migrate without losing old behavior');
sampleCameraRail(cinematic.shots, 1500, cameraFrame);
assert.deepEqual([cameraFrame.x, cameraFrame.y, cameraFrame.z], [3, 4.5, 0],
  'Bezier control handles bend the path away from its straight chord');
const turning = cinematic.actorTracks[0].keys;
for (const t of [150, 750, 1500, 2250, 2850]) {
  const before = {}, after = {}, current = {};
  sampleActorTrack(turning, t - 0.1, before);
  sampleActorTrack(turning, t + 0.1, after);
  sampleActorTrack(turning, t, current);
  const travel = Math.atan2(after.x - before.x, after.z - before.z) * 180 / Math.PI;
  assert(Math.abs(travel - current.facingDeg) < 0.001, 'hull follows actual curved travel without side slip');
  assert(Math.abs(current.facingDeg + current.turretDeg - 90) < 1e-8,
    'turret holds its world bearing while the hull turns');
}
const cueFrame = {}, repeat = {};
assert.equal(sampleCameraCues(cinematic.cameraCues, 400, cueFrame), false);
sampleCameraCues(cinematic.cameraCues, 750, cueFrame);
sampleCameraCues(cinematic.cameraCues, 1200, repeat);
sampleCameraCues(cinematic.cameraCues, 750, repeat);
assert.deepEqual(repeat, cueFrame, 'scrubbing back yields the same deterministic cue');
assert.equal(cueFrame.fovKickDeg, 2.25);
assert.equal(sampleCameraCues(cinematic.cameraCues, 1600, cueFrame), false);
assert(Object.values(cueFrame).every((v) => v === 0), 'finished cues reset all reused scratch values');
console.log('studioTimeline.selftest: legacy rails/cuts, v2 round trips, Bezier rails, tangent-aligned drive and deterministic cues passed');
