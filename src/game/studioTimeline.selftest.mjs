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
} from './studioTimeline.js';

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

console.log('studioTimeline.selftest: duration, normalization, rails, cuts, and actor tracks passed');
