import assert from 'node:assert/strict';
import {
  exposureSampleTimes,
  FILM_MAX_EXPOSURE_MS,
  FILM_DEFAULTS,
  FILM_GAUSSIAN_SIGMA_PX,
  FILM_MOTION_STEP_PX,
  adaptiveSampleCount,
  createFilmPlan,
  createFilmTimeMap,
  filmJitter,
  filmOutputSize,
  halton,
  normalizeFilm,
} from './studioFilmPlan.ts';

const close = (actual, expected, epsilon, message) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} vs ${expected}`);

// --- settings ---------------------------------------------------------------
assert.deepEqual(normalizeFilm(), FILM_DEFAULTS);
assert.deepEqual(normalizeFilm(null), FILM_DEFAULTS);
assert.throws(() => normalizeFilm({ fps: 25 }), /24, 30 or 60/);
assert.throws(() => normalizeFilm({ filter: 'lanczos' }), /filter/);
assert.throws(() => normalizeFilm({ speed: [{ tMs: 100, ease: 'bounce' }] }), /ease/);
assert.throws(() => normalizeFilm({ speed: [{ speed: 0.5 }] }), /timeline time/);
const clamped = normalizeFilm({ fps: 60, samples: 500, shutterDeg: 720, speed: [
  { tMs: 900, speed: 0 }, { tMs: 300, speed: 20, ease: 'linear' }, { tMs: 900, speed: 0.5, ease: 'step' },
] });
assert.equal(clamped.samples, 64);
assert.equal(clamped.maxSamples, 64, 'the adaptive ceiling never sits below the base count');
assert.equal(clamped.shutterDeg, 360);
assert.equal(normalizeFilm({ samples: 4 }).maxSamples, 64);
assert.equal(normalizeFilm({ samples: 4, maxSamples: 2 }).maxSamples, 4);
assert.equal(normalizeFilm({ maxSamples: 999 }).maxSamples, 128);
assert.equal(normalizeFilm({ shake: 0.4 }).shake, 0.4);
assert.equal(normalizeFilm({ shake: 9 }).shake, 2, 'shake clamps to 2');
assert.equal(normalizeFilm({ shake: -1 }).shake, 0, 'shake clamps to 0');
assert.deepEqual(clamped.speed, [
  { tMs: 300, speed: 8, ease: 'linear' },
  { tMs: 900, speed: 0.5, ease: 'step' },
], 'keys sort, clamp, and the last same-time key wins');
assert.deepEqual(normalizeFilm(JSON.parse(JSON.stringify(clamped))), clamped, 'normalized settings round-trip');

// --- time maps --------------------------------------------------------------
const identity = createFilmTimeMap([], 1000, 7000);
assert.equal(identity.durationMs, 6000);
for (const f of [0, 1, 1234.5, 5999.999]) close(identity.timelineAt(f), 1000 + f, 1e-9, 'identity map');
assert.equal(identity.timelineAt(-5), 1000, 'clamps before the film');
assert.equal(identity.timelineAt(9e9), 7000, 'clamps after the film');

const constant = createFilmTimeMap([{ tMs: 0, speed: 0.25, ease: 'smooth' }], 0, 2000);
close(constant.durationMs, 8000, 1e-9, 'constant 0.25x quadruples film time');
close(constant.timelineAt(4000), 1000, 1e-9, 'constant inverse');

// Linear ramp 1x -> 0.2x over [1000, 2000]: closed form of the integral of 1/s.
const linear = createFilmTimeMap([{ tMs: 1000, speed: 1, ease: 'linear' }, { tMs: 2000, speed: 0.2, ease: 'linear' }], 0, 3000);
const rampFilm = 1000 * Math.log(1 / 0.2) / 0.8;
close(linear.durationMs, 1000 + rampFilm + 1000 / 0.2, 1e-6, 'linear ramp duration');
close(linear.speedAt(1500), 0.6, 1e-12, 'linear ramp speed at the midpoint');

// The parent's example: 1x -> 0.2x around a knockout at 6200 ms -> 1x.
const knockout = normalizeFilm({ fps: 30, speed: [
  { tMs: 5600, speed: 1 }, { tMs: 6000, speed: 0.2 }, { tMs: 7000, speed: 0.2 }, { tMs: 7600, speed: 1 },
] });
const slow = createFilmTimeMap(knockout.speed, 0, 8000);
assert.ok(slow.durationMs > 8000 + 4000, `slow motion lengthens the film (${slow.durationMs})`);
close(slow.speedAt(6200), 0.2, 1e-12, 'hold speed');
close(slow.speedAt(5800), 0.6, 1e-12, 'smooth ramp midpoint');
assert.ok(slow.speedAt(5700) > 0.6 && slow.speedAt(5900) < 0.6, 'smooth ramp eases');
let previous = -1;
for (let f = 0; f <= slow.durationMs; f += 7.3) {
  const t = slow.timelineAt(f);
  assert.ok(t >= previous, 'timeline time never decreases');
  previous = t;
  close(slow.filmAt(t), f, 1e-6, 'film -> timeline -> film round trip');
}
for (const t of [0, 5599, 5600, 5777.7, 6000, 6200, 6999.5, 7300, 7600, 7999]) {
  close(slow.timelineAt(slow.filmAt(t)), t, 1e-6, 'timeline -> film -> timeline round trip');
}
// d(timeline)/d(film) equals the authored speed.
for (const t of [5650, 5800, 5950, 6500, 7100, 7500]) {
  const f = slow.filmAt(t), h = 0.01;
  close((slow.timelineAt(f + h) - slow.timelineAt(f - h)) / (2 * h), slow.speedAt(t), 2e-6, `slope at ${t}`);
}
const stepped = createFilmTimeMap(normalizeFilm({ speed: [{ tMs: 0, speed: 1 }, { tMs: 500, speed: 0.5, ease: 'step' }] }).speed, 0, 1000);
close(stepped.durationMs, 500 + 1000, 1e-9, 'step changes speed at the key');
assert.throws(() => createFilmTimeMap([], 500, 500), /positive timeline range/);

// --- plans and shutter samples ----------------------------------------------------
const plan = createFilmPlan(normalizeFilm({ fps: 30, samples: 16, shutterDeg: 180 }), 0, 6000);
assert.equal(plan.frames, 180, '6 s at 30 fps is 180 frames (half-open range)');
close(plan.shutterMs, 1000 / 60, 1e-12, '180 degrees at 30 fps');
const times = new Float64Array(16);
let last = -Infinity;
for (let frame = 0; frame < plan.frames; frame++) {
  plan.sampleTimes(frame, times);
  const centre = plan.frameTimelineMs(frame);
  let mean = 0;
  for (let i = 0; i < 16; i++) {
    assert.ok(times[i] >= last, `frame ${frame} sample ${i} is monotone`);
    last = times[i];
    mean += times[i] / 16;
  }
  if (frame > 0) close(mean, centre, 1e-9, `frame ${frame} blur centroid`);
  assert.ok(times[15] - times[0] < plan.shutterMs, 'samples stay inside the shutter');
}
plan.sampleTimes(0, times);
assert.equal(times[0], 0, 'frame 0 clamps its opening half to the film start');
close(plan.frameTimelineMs(179), 5966.666666666667, 1e-9, 'last frame clock');
const single = createFilmPlan(normalizeFilm({ fps: 24, samples: 1 }), 250, 2250);
assert.equal(single.frames, 48);
for (let frame = 0; frame < single.frames; frame++) {
  close(single.sampleTimes(frame, new Float64Array(1))[0], 250 + frame * 1000 / 24, 1e-9, 'one sample is the instantaneous frame');
}
const open = createFilmPlan(normalizeFilm({ fps: 60, samples: 8, shutterDeg: 360 }), 0, 1000);
const a = open.sampleTimes(10, new Float64Array(8)).slice(), b = open.sampleTimes(11, new Float64Array(8));
assert.ok(b[0] >= a[7], '360 degrees remains monotone between frames');
const ramped = createFilmPlan(knockout, 0, 8000);
assert.equal(ramped.frames, Math.floor(slow.durationMs * 30 / 1000 + 1e-6));
let lastRamp = -1;
const rampTimes = new Float64Array(8);
for (let frame = 0; frame < ramped.frames; frame++) {
  for (const t of ramped.sampleTimes(frame, rampTimes)) { assert.ok(t >= lastRamp); lastRamp = t; }
}
assert.ok(lastRamp < 8000, 'the final instant is never rendered');
assert.throws(() => plan.sampleTimes(0, new Float64Array(4)), /too small/);
assert.throws(() => plan.sampleTimes(0, times, 0), /positive integer/);
// Per-frame adaptive counts keep the timeline monotone and the blur centred.
let lastAdaptive = -1;
const adaptiveTimes = new Float64Array(128);
for (let frame = 0; frame < plan.frames; frame++) {
  const count = [4, 64, 9, 128, 16][frame % 5];
  plan.sampleTimes(frame, adaptiveTimes, count);
  let mean = 0;
  for (let i = 0; i < count; i++) {
    assert.ok(adaptiveTimes[i] >= lastAdaptive, 'adaptive counts stay monotone');
    lastAdaptive = adaptiveTimes[i];
    mean += adaptiveTimes[i] / count;
  }
  if (frame > 0) close(mean, plan.frameTimelineMs(frame), 1e-9, 'adaptive centroid');
}
// Motion-adaptive sample counts.
const base = normalizeFilm({ samples: 8 });
assert.equal(adaptiveSampleCount(0, base), 8, 'static frames keep the base count');
assert.equal(adaptiveSampleCount(5, base), 8);
assert.equal(adaptiveSampleCount(30, base), Math.ceil(30 / FILM_MOTION_STEP_PX) + 1);
assert.equal(adaptiveSampleCount(5000, base), 64, 'fast frames stop at the ceiling');
assert.equal(adaptiveSampleCount(5000, normalizeFilm({ samples: 1 })), 1, 'blur off stays instantaneous');
assert.equal(adaptiveSampleCount(5000, normalizeFilm({ samples: 16, maxSamples: 16 })), 16, 'fixed counts opt out');
// Hard camera cuts never fall inside a shutter: no double-exposed frames.
// 30 fps / 270 degrees: frame 30 exposes [987.5, 1012.5], frame 61 [2020.8, 2045.8].
const cutsAt = [1005, 2028];
const cutPlan = createFilmPlan(normalizeFilm({ fps: 30, samples: 8, shutterDeg: 270 }), 0, 3000, cutsAt);
let lastCut = -1;
const cutTimes = new Float64Array(8);
for (let frame = 0; frame < cutPlan.frames; frame++) {
  cutPlan.sampleTimes(frame, cutTimes);
  for (const cut of cutsAt) {
    const before = cutTimes.filter(t => t < cut).length;
    assert.ok(before === 0 || before === 8, `frame ${frame} stays on one side of the cut at ${cut}`);
  }
  for (const t of cutTimes) { assert.ok(t >= lastCut, 'cut clamping stays monotone'); lastCut = t; }
}
const early = cutPlan.sampleTimes(30, cutTimes);
assert.ok(early.every(t => t < 1005) && early[7] > 1004.99, 'the frame centred before a cut closes just before it');
const late = cutPlan.sampleTimes(61, cutTimes);
assert.ok(late.every(t => t >= 2028) && late[0] === 2028, 'the frame centred after a cut opens on it');

// --- jitter -----------------------------------------------------------------
assert.equal(halton(1, 2), 0.5);
assert.equal(halton(3, 2), 0.75);
close(halton(5, 3), 7 / 9, 1e-15, 'base-3 radical inverse');
assert.deepEqual([...filmJitter(1, 'gaussian', new Float64Array(2))], [0, 0], 'one sample is unjittered');
for (const filter of ['box', 'gaussian']) {
  for (const n of [2, 4, 8, 16, 32, 64]) {
    const jitter = filmJitter(n, filter, new Float64Array(n * 2));
    let mx = 0, my = 0, vx = 0;
    for (let i = 0; i < n; i++) { mx += jitter[i * 2]; my += jitter[i * 2 + 1]; vx += jitter[i * 2] ** 2; }
    close(mx / n, 0, 1e-12, `${filter} ${n} centroid x`);
    close(my / n, 0, 1e-12, `${filter} ${n} centroid y`);
    if (filter === 'box') {
      for (let i = 0; i < n * 2; i++) assert.ok(Math.abs(jitter[i]) < 0.6, 'box jitter stays near the pixel');
    }
    if (filter === 'gaussian' && n >= 16) {
      close(Math.sqrt(vx / n), FILM_GAUSSIAN_SIGMA_PX, 0.08, `gaussian ${n} spread`);
    }
  }
}
const repeat = filmJitter(16, 'gaussian', new Float64Array(32));
assert.deepEqual([...filmJitter(16, 'gaussian', new Float64Array(32))], [...repeat], 'jitter is deterministic');
assert.throws(() => filmJitter(8, 'box', new Float64Array(8)), /too small/);

// --- output sizes ---------------------------------------------------------------
assert.deepEqual(filmOutputSize('landscape', 2160), { width: 3840, height: 2160 });
assert.deepEqual(filmOutputSize('portrait', 1080), { width: 1080, height: 1920 });
assert.deepEqual(filmOutputSize('square', 1440), { width: 1440, height: 1440 });
assert.throws(() => filmOutputSize('landscape', 720), /1080, 1440 or 2160/);

// Motion-blur stills: stratified, centred, inside the storyboard, never across a cut.
{
  const out = new Float64Array(8);
  exposureSampleTimes(5000, 80, 8, [], 12000, out);
  assert.ok(Math.abs(out.reduce((sum, t) => sum + t, 0) / 8 - 5000) < 1e-9, 'centred on the playhead');
  assert.ok(Math.abs(out[0] - (5000 - 35)) < 1e-9 && Math.abs(out[7] - (5000 + 35)) < 1e-9, 'stratified across the exposure');
  for (let i = 1; i < 8; i++) assert.ok(out[i] > out[i - 1], 'monotone');
  exposureSampleTimes(20, 250, 8, [], 12000, out);
  assert.ok(out[0] === 0 && out[7] <= 20 + 125, 'clamped at the timeline start');
  exposureSampleTimes(11990, 250, 8, [], 12000, out);
  assert.equal(out[7], 12000, 'clamped at the storyboard end');
  exposureSampleTimes(5000, 250, 8, [4950], 12000, out);
  assert.ok(out.every((t) => t >= 4950), 'the shot that began inside the exposure owns it');
  exposureSampleTimes(5000, 250, 8, [5060], 12000, out);
  assert.ok(out.every((t) => t < 5060), 'the next shot never leaks in');
  assert.equal(exposureSampleTimes(5000, 250, 1, [], 12000, out)[0], 5000, 'one sample is the instant');
  exposureSampleTimes(5000, 1e6, 4, [], 1e7, out);
  assert.ok(Math.abs(out[3] - out[0] - FILM_MAX_EXPOSURE_MS * 0.75) < 1e-9, 'exposure is capped');
}
console.log('studioFilmPlan.selftest: settings, speed ramps, monotone shutter schedules, jitter and output sizes passed');
