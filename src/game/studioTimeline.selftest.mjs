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
// Film attack: the impulse starts from rest and matches the live kick once the attack has passed.
{
  const first = cinematic.cameraCues[0];
  const live = { rightM: 0, upM: 0, forwardM: 0, rollDeg: 0, fovKickDeg: 0 };
  const film = { rightM: 0, upM: 0, forwardM: 0, rollDeg: 0, fovKickDeg: 0 };
  sampleCameraCues(cinematic.cameraCues, first.tMs, film, 12);
  assert.ok([film.rightM, film.upM, film.forwardM, film.rollDeg, film.fovKickDeg].every((v) => v === 0), 'a film jolt starts from rest');
  sampleCameraCues(cinematic.cameraCues, first.tMs + 6, film, 12);
  sampleCameraCues(cinematic.cameraCues, first.tMs + 6, live, 0);
  assert.ok(Math.abs(film.fovKickDeg) < Math.abs(live.fovKickDeg), 'the attack eases the kick in');
  sampleCameraCues(cinematic.cameraCues, first.tMs + 20, film, 12);
  sampleCameraCues(cinematic.cameraCues, first.tMs + 20, live, 0);
  assert.deepEqual(film, live, 'after the attack the film and live impulses agree');
}
assert(Object.values(cueFrame).every((v) => v === 0), 'finished cues reset all reused scratch values');

// Spline rails (2026-10-05): a dense, unevenly spaced rail of keys (the shot tools sample a 3D camera track onto the
// 32-key cap) flies through every key with continuous velocity in position, aim and lens, where linear segments kink and
// smooth's eased aim stops at every key.
{
  const track = (t) => [12 * Math.sin(t / 900), 4 + 3 * Math.sin(t / 1300), 12 * Math.cos(t / 900)];
  const aim = (t) => [Math.sin(t / 700) * 5, 1.5, 20 + t / 400];
  const times = [0, 180, 420, 600, 900, 1250, 1400, 1800, 2300, 2500, 3000];
  const splineRail = normalizeStoryboard({
    version: 2, durationMs: 3000,
    shots: times.map((tMs, i) => ({ id: `k${i}`, tMs, pos: track(tMs), lookAt: aim(tMs), fov: 30 + tMs / 150,
      rollDeg: 14 * Math.sin(tMs / 600), transition: 'spline' })),
  });
  assert.ok(splineRail.shots.every((shot) => shot.transition === 'spline'), 'spline survives normalization');
  assert.deepEqual(normalizeStoryboard(JSON.parse(JSON.stringify(splineRail))), splineRail, 'spline rails round trip');
  const s = {}, before = {}, after = {};
  for (const [i, t] of times.entries()) {
    sampleCameraRail(splineRail.shots, t, s);
    const p = track(t), l = aim(t);
    assert.ok(Math.hypot(s.x - p[0], s.y - p[1], s.z - p[2]) < 1e-9 && Math.hypot(s.lookX - l[0], s.lookY - l[1], s.lookZ - l[2]) < 1e-9,
      `the spline passes through key ${i}`);
  }
  const velocity = (t, h) => {
    sampleCameraRail(splineRail.shots, t - h, before);
    sampleCameraRail(splineRail.shots, t + h, after);
    return [after.x - before.x, after.y - before.y, after.z - before.z, after.lookX - before.lookX, after.fov - before.fov,
      after.rollDeg - before.rollDeg].map((d) => d / (2 * h));
  };
  for (const t of times.slice(1, -1)) {
    const left = velocity(t - 0.6, 0.5), right = velocity(t + 0.6, 0.5);
    const scale = Math.max(1e-6, ...left.map(Math.abs));
    assert.ok(left.every((v, k) => Math.abs(v - right[k]) <= scale * 0.02 + 1e-6), `velocity is continuous across the key at ${t} ms`);
  }
  const eased = splineRail.shots.map((shot) => ({ ...shot, transition: 'smooth' }));
  const easedAim = (t) => { sampleCameraRail(eased, t - 0.5, before); sampleCameraRail(eased, t + 0.5, after); return Math.abs(after.lookX - before.lookX); };
  assert.ok(easedAim(900) < 1e-3 && Math.abs(velocity(900, 0.5)[3]) > 1e-3, 'smooth eases the aim to a stop at a key; spline keeps it moving');
}
console.log('studioTimeline.selftest: legacy rails/cuts, v2 round trips, Bezier and spline rails, tangent-aligned drive and deterministic cues passed');
