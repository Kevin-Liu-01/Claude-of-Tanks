import assert from 'node:assert/strict';
import {
  FILM_SUPPORT_ON_GRID, captureFilmSupport, createFilmSupport, filmSupportAlpha, presentFilmSupport, resetFilmSupport,
} from './studioFilmSupport.ts';

const STEP_MS = 1000 / 60;
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

// A hull bouncing over rough ground: the support solver's pose at grid step k, and the timeline's pose at any instant.
const supportAt = (k) => ({
  y: 10 + 0.08 * Math.sin(k * 0.9), pitch: 0.02 * Math.sin(k * 1.3 + 0.4), roll: 0.01 * Math.cos(k * 0.7),
  susp: 0.004 * Math.sin(k * 2.1), flinch: k >= 30 ? 0.01 * Math.exp(-(k - 30) / 8) : 0,
});
const timelineAt = (tMs) => ({ x: 3 + 0.012 * tMs, z: -40 + 0.009 * tMs, yaw: 0.3 + 0.0001 * tMs, turret: 0.2 + 0.0004 * tMs, gun: 0.05 });
const state = {
  pos: { x: 0, y: 0, z: 0 }, yaw: 0, speed: 0, yawRate: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0,
  trackScroll: { l: 0, r: 0 }, _swayEst: 0, _susp: { p: 0, r: 0 }, _flinch: { p: 0, r: 0, pv: 0, rv: 0 },
};
const solve = (k) => { // what applyStoryboardActorSample(a, k * step, SIM_DT, true) leaves in the state
  const s = supportAt(k), t = timelineAt(k * STEP_MS);
  state.pos.x = t.x; state.pos.z = t.z; state.yaw = t.yaw; state.turretYaw = t.turret; state.gunPitch = t.gun;
  state.pos.y = s.y; state.visualPitch = s.pitch; state.visualRoll = s.roll; state._susp.p = s.susp; state._flinch.p = s.flinch;
  state.speed = 9; state.trackScroll.l = 9 * k * STEP_MS / 1000; state.trackScroll.r = state.trackScroll.l;
};
const pose = (tMs) => { // the exact timeline sample (applyStoryboardActorSample(a, tMs, 0, false))
  const t = timelineAt(tMs);
  state.pos.x = t.x; state.pos.z = t.z; state.yaw = t.yaw; state.turretYaw = t.turret; state.gunPitch = t.gun;
};

// The Studio's film path (studio.ts applyStoryboardActors while filming): catch up, solve one step ahead between grid
// lines, sample the timeline, blend.
const support = createFilmSupport();
let supportStep = 0;
solve(0); captureFilmSupport(support, state, 0);
const sampleAt = (tMs) => {
  const finalStep = Math.floor((tMs + 1e-7) / STEP_MS);
  while (supportStep < finalStep) { supportStep++; solve(supportStep); captureFilmSupport(support, state, supportStep); }
  if (supportStep === finalStep && tMs / STEP_MS - finalStep > FILM_SUPPORT_ON_GRID) {
    supportStep++; solve(supportStep); captureFilmSupport(support, state, supportStep);
  }
  pose(tMs);
  return filmSupportAlpha(support, tMs, STEP_MS);
};

// A 30 fps film at a 60° shutter, 24 samples a frame: each exposure is centred on a grid line (frame 90: 3000 ms)
const lerpSupport = (tMs, key) => {
  const k = Math.floor((tMs + 1e-7) / STEP_MS), f = Math.max(0, tMs / STEP_MS - k);
  return supportAt(k)[key] + (supportAt(k + 1)[key] - supportAt(k)[key]) * f;
};
let previousY = null, maxJump = 0;
for (let frame = 0; frame < 120; frame++) {
  const centre = frame * 1000 / 30, shutter = (60 / 360) * 1000 / 30;
  for (let i = 0; i < 24; i++) {
    const tMs = centre + ((i + 0.5) / 24 - 0.5) * shutter;
    if (tMs < 0) continue;
    const alpha = sampleAt(tMs);
    assert.ok(alpha >= 0, `frame ${frame} sample ${i} (${tMs.toFixed(3)} ms) is bracketed by captured support steps`);
    const p = presentFilmSupport(support, state, alpha, -0.01, 0.02);
    const t = timelineAt(tMs);
    close(p.pos.x, t.x, 1e-12, 'x is the timeline\'s, exact');
    close(p.pos.z, t.z, 1e-12, 'z is the timeline\'s, exact');
    close(p.yaw, t.yaw, 1e-12, 'heading is the timeline\'s, exact');
    close(p.turretYaw, t.turret, 1e-12, 'turret is the timeline\'s, exact');
    close(p.pos.y, lerpSupport(tMs, 'y'), 1e-9, `height between the support steps around ${tMs.toFixed(3)} ms`);
    close(p.visualPitch, lerpSupport(tMs, 'pitch'), 1e-9, 'pitch between the support steps');
    close(p.visualRoll, lerpSupport(tMs, 'roll'), 1e-9, 'roll between the support steps');
    close(p._susp.p, lerpSupport(tMs, 'susp'), 1e-9, 'suspension rock between the support steps');
    close(p._flinch.p, lerpSupport(tMs, 'flinch'), 1e-9, 'hit rock between the support steps');
    close(p.trackScroll.l, state.trackScroll.l - 0.01, 1e-12, 'track phase: the state\'s plus the film travel');
    close(p.trackScroll.r, state.trackScroll.r + 0.02, 1e-12, 'track phase: the state\'s plus the film travel');
    if (previousY !== null) maxJump = Math.max(maxJump, Math.abs(p.pos.y - previousY));
    previousY = p.pos.y;
  }
  previousY = null;
}
// within one exposure the hull moves smoothly: no sample jumps by a whole step's change (up to 8 cm here)
assert.ok(maxJump < 0.003, `consecutive samples in an exposure move the hull by under 3 mm (largest ${maxJump.toFixed(5)} m)`);

// on a grid line: the step itself
const on = createFilmSupport();
solve(5); captureFilmSupport(on, state, 5);
assert.equal(filmSupportAlpha(on, 5 * STEP_MS, STEP_MS), 1, 'on a captured grid line: that step');
assert.equal(filmSupportAlpha(on, 5.5 * STEP_MS, STEP_MS), -1, 'past it with no later step: the state stands');
solve(6); captureFilmSupport(on, state, 6);
close(filmSupportAlpha(on, 5.25 * STEP_MS, STEP_MS), 0.25, 1e-9, 'a quarter of the way to the next step');
assert.equal(filmSupportAlpha(on, 5 * STEP_MS, STEP_MS), 0, 'on the earlier grid line of a captured pair: the earlier step');
assert.equal(filmSupportAlpha(on, 7.5 * STEP_MS, STEP_MS), -1, 'outside the captured pair: the state stands');

// a gap (a seek, a replay) never blends across it
solve(9); captureFilmSupport(on, state, 9);
assert.equal(on.prevStep, -1, 'a capture after a gap has no earlier step');
assert.equal(filmSupportAlpha(on, 8.5 * STEP_MS, STEP_MS), -1, 'no blend across a gap');
resetFilmSupport(on);
assert.equal(filmSupportAlpha(on, 9 * STEP_MS, STEP_MS), -1, 'after a reset nothing is captured');

console.log('studioFilmSupport selftest: ok');
