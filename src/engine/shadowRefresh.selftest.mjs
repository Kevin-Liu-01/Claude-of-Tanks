import assert from 'node:assert/strict';
import {
  SHADOW_REFRESH_INTERVAL_S,
  createShadowRefreshScheduler,
  isContinuousShadowCascade,
  mergeRequiredShadowWork,
} from './shadowRefresh.js';

assert.equal(isContinuousShadowCascade(0), true, 'hero cascade refreshes every presented frame');
assert.equal(isContinuousShadowCascade(1), true, 'contact cascade refreshes every presented frame');
assert.equal(isContinuousShadowCascade(2), false, 'far cascade is eligible for rate limiting');
assert.equal(isContinuousShadowCascade(-1), false, 'invalid cascade is never continuous');

function sample(hz, seconds = 2, cascades = 4) {
  const scheduler = createShadowRefreshScheduler(cascades);
  const hits = Array(cascades).fill(0);
  let maxPerFrame = 0;
  for (let frame = 0; frame < hz * seconds; frame++) {
    const mask = scheduler.step(1 / hz);
    let frameHits = 0;
    for (let i = 0; i < cascades; i++) {
      if (mask & (1 << i)) { hits[i]++; frameHits++; }
    }
    maxPerFrame = Math.max(maxPerFrame, frameHits);
  }
  return { hits, maxPerFrame };
}

{
  const r = sample(120);
  assert.ok(Math.abs(r.hits[0] - 120) <= 1, `120 Hz near-0 cadence ${r.hits[0]}`);
  assert.ok(Math.abs(r.hits[1] - 120) <= 1, `120 Hz near-1 cadence ${r.hits[1]}`);
  assert.ok(Math.abs(r.hits[2] - 60) <= 1, `120 Hz far-2 cadence ${r.hits[2]}`);
  assert.ok(Math.abs(r.hits[3] - 60) <= 1, `120 Hz far-3 cadence ${r.hits[3]}`);
  assert.ok(r.maxPerFrame <= 2, `120 Hz scheduled ${r.maxPerFrame} cascades on one frame`);
}

{
  const r = sample(144);
  assert.ok(Math.abs(r.hits[0] - 120) <= 2, `144 Hz near-0 cadence ${r.hits[0]}`);
  assert.ok(Math.abs(r.hits[1] - 120) <= 2, `144 Hz near-1 cadence ${r.hits[1]}`);
  assert.ok(Math.abs(r.hits[2] - 60) <= 2, `144 Hz far-2 cadence ${r.hits[2]}`);
  assert.ok(Math.abs(r.hits[3] - 60) <= 2, `144 Hz far-3 cadence ${r.hits[3]}`);
  assert.ok(r.maxPerFrame <= 2, `144 Hz scheduled ${r.maxPerFrame} cascades on one frame`);
}

{
  const r = sample(100);
  assert.ok(Math.abs(r.hits[0] - 120) <= 1, `100 Hz near-0 cadence ${r.hits[0]}`);
  assert.ok(Math.abs(r.hits[1] - 120) <= 1, `100 Hz near-1 cadence ${r.hits[1]}`);
  assert.ok(r.hits[2] >= 38, `100 Hz far-2 recovery cadence ${r.hits[2]}`);
  assert.ok(r.hits[3] >= 38, `100 Hz far-3 recovery cadence ${r.hits[3]}`);
  assert.ok(r.maxPerFrame <= 2, `100 Hz scheduled ${r.maxPerFrame} cascades on one frame`);
}

{
  const scheduler = createShadowRefreshScheduler(4);
  let maxPerFrame = 0;
  // Establish a 120 Hz display cadence, inject two isolated 25 ms misses,
  // then return to nominal. Neither miss may flip into a three-map burst.
  for (let frame = 0; frame < 240; frame++) {
    const dt = frame === 70 || frame === 171 ? 0.025 : 1 / 120;
    const mask = scheduler.step(dt);
    let jobs = 0;
    for (let i = 0; i < 4; i++) if (mask & (1 << i)) jobs++;
    maxPerFrame = Math.max(maxPerFrame, jobs);
  }
  assert.ok(maxPerFrame <= 2,
    `isolated high-refresh hitches scheduled ${maxPerFrame} cascades on one frame`);
}

{
  assert.equal(mergeRequiredShadowWork(0b0110, 3, 4), 0b1010,
    'required live-resize cascade replaces excess scheduled work');
  assert.equal(mergeRequiredShadowWork(0b0110, 2, 4), 0b0110,
    'required cascade already in the schedule preserves its companion');
  assert.equal(mergeRequiredShadowWork(0b1111, 1, 4), 0b0011,
    'live transition never emits more than two cascade jobs');
}

{
  const scheduler = createShadowRefreshScheduler(4);
  let maxAfterDrop = 0;
  for (let frame = 0; frame < 120; frame++) scheduler.step(1 / 120);
  // Simulate sustained render pressure after the high-refresh display has
  // been identified. The scheduler must recover without a three-map spiral.
  for (let frame = 0; frame < 180; frame++) {
    const mask = scheduler.step(1 / 70);
    let jobs = 0;
    for (let i = 0; i < 4; i++) if (mask & (1 << i)) jobs++;
    maxAfterDrop = Math.max(maxAfterDrop, jobs);
  }
  assert.ok(maxAfterDrop <= 2,
    `render pressure relabeled a high-refresh display with ${maxAfterDrop} map frames`);
}

{
  const r = sample(60);
  assert.equal(r.hits[0], 120, '60 Hz keeps near cascade 0 every frame');
  assert.equal(r.hits[1], 120, '60 Hz keeps near cascade 1 every frame');
  assert.equal(r.hits[2] + r.hits[3], 120, '60 Hz keeps one far cascade every frame');
  assert.equal(r.maxPerFrame, 3, '60 Hz preserves the established three-map frame');
}

{
  const scheduler = createShadowRefreshScheduler(4);
  assert.equal(scheduler.forceMask(), 0b1111, 'force refreshes every cascade');
  const first = scheduler.step(SHADOW_REFRESH_INTERVAL_S / 2);
  assert.ok((first & 0b1100) !== 0, 'post-force phase schedules its first far update');
  assert.ok((first & 0b0011) === 0, 'post-force far update owns its frame');
  const second = scheduler.step(SHADOW_REFRESH_INTERVAL_S / 2);
  assert.equal(second, 0b0011, 'post-force near pair owns the next frame');
}

console.log('shadowRefresh.selftest: 60/120/144 Hz cadence and phase spreading passed');
