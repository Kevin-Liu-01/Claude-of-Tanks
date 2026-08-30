import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SHADOW_REFRESH_INTERVAL_S,
  canDormantShadowCascades,
  createShadowRefreshScheduler,
  isContinuousShadowCascade,
  mergeRequiredShadowWork,
} from './shadowRefresh.ts';

assert.equal(isContinuousShadowCascade(0), true, 'hero cascade refreshes every presented frame');
assert.equal(isContinuousShadowCascade(1), true, 'contact cascade refreshes every presented frame');
assert.equal(isContinuousShadowCascade(2), false, 'far cascade is eligible for rate limiting');
assert.equal(isContinuousShadowCascade(-1), false, 'invalid cascade is never continuous');

{
  const depth = () => ({ shadow: { map: { depthTexture: { isDepthTexture: true } } } });
  const missing = () => ({ shadow: { map: null } });
  assert.equal(canDormantShadowCascades([depth(), depth(), missing(), missing()]), false,
    'unallocated PCF cascades must render before dormancy can bind their samplers');
  assert.equal(canDormantShadowCascades([depth(), depth(), depth(), depth()]), true,
    'initialized native depth maps may be safely reused while dormant');
  assert.equal(canDormantShadowCascades([depth(), depth(), depth()], 2), true,
    'the mobile three-cascade rig follows the same native-depth contract');
  assert.equal(canDormantShadowCascades(null), false,
    'missing light state must fail closed');
}

const lightingSource = await readFile(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.match(lightingSource,
  /function applyFarCascadeDormancy\(\)[\s\S]{0,700}canDormantShadowCascades\(csm\.lights, FAR_CASCADE_START\)[\s\S]{0,500}shadow\.autoUpdate = false/,
  'the live CSM path must gate dormancy on native depth-map readiness');
assert.match(lightingSource,
  /function applyStaticPresentationDormancy\(\)[\s\S]{0,500}shadow\.autoUpdate = false[\s\S]{0,200}shadow\.needsUpdate = false/,
  'a proven-static presentation must suppress every redundant shadow submission');
assert.match(lightingSource,
  /setStaticPresentationDormant\(on[^)]*\)[\s\S]{0,700}else forceRateCappedCascades\(\)/,
  'releasing static dormancy must force a complete cascade refresh');
assert.match(lightingSource,
  /applyStableCascadePoses\(csm, continuousCascadeMask \| lastScheduledMask\)/,
  'a far-cascade fit must move only with the depth-map frame that owns it');

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

function assertFarCohort(hz, seconds = 2) {
  const scheduler = createShadowRefreshScheduler(4);
  for (let frame = 0; frame < hz * seconds; frame++) {
    const far = scheduler.step(1 / hz) & 0b1100;
    assert.ok(far === 0 || far === 0b1100,
      `${hz} Hz split the blended far-cascade cohort on frame ${frame}: ${far.toString(2)}`);
  }
}

{
  const r = sample(120);
  assert.equal(r.hits[0], 240, `120 Hz near-0 cadence ${r.hits[0]}`);
  assert.equal(r.hits[1], 240, `120 Hz near-1 cadence ${r.hits[1]}`);
  assert.ok(Math.abs(r.hits[2] - 60) <= 1, `120 Hz far-2 cadence ${r.hits[2]}`);
  assert.ok(Math.abs(r.hits[3] - 60) <= 1, `120 Hz far-3 cadence ${r.hits[3]}`);
  assert.equal(r.maxPerFrame, 4, `120 Hz scheduled ${r.maxPerFrame} cascades on one frame`);
  assertFarCohort(120);
}

{
  const r = sample(144);
  assert.equal(r.hits[0], 288, `144 Hz near-0 cadence ${r.hits[0]}`);
  assert.equal(r.hits[1], 288, `144 Hz near-1 cadence ${r.hits[1]}`);
  assert.ok(Math.abs(r.hits[2] - 60) <= 2, `144 Hz far-2 cadence ${r.hits[2]}`);
  assert.ok(Math.abs(r.hits[3] - 60) <= 2, `144 Hz far-3 cadence ${r.hits[3]}`);
  assert.equal(r.maxPerFrame, 4, `144 Hz scheduled ${r.maxPerFrame} cascades on one frame`);
  assertFarCohort(144);
}

{
  const r = sample(100);
  assert.equal(r.hits[0], 200, `100 Hz near-0 cadence ${r.hits[0]}`);
  assert.equal(r.hits[1], 200, `100 Hz near-1 cadence ${r.hits[1]}`);
  assert.ok(Math.abs(r.hits[2] - 60) <= 2, `100 Hz far-2 cadence ${r.hits[2]}`);
  assert.ok(Math.abs(r.hits[3] - 60) <= 2, `100 Hz far-3 cadence ${r.hits[3]}`);
  assert.equal(r.maxPerFrame, 4, `100 Hz scheduled ${r.maxPerFrame} cascades on one frame`);
  assertFarCohort(100);
}

{
  const scheduler = createShadowRefreshScheduler(4);
  let maxPerFrame = 0;
  // Establish a 120 Hz display cadence, inject two isolated 25 ms misses,
  // then return to nominal. Hitches must not split or starve the far cohort.
  for (let frame = 0; frame < 240; frame++) {
    const dt = frame === 70 || frame === 171 ? 0.025 : 1 / 120;
    const mask = scheduler.step(dt);
    let jobs = 0;
    for (let i = 0; i < 4; i++) if (mask & (1 << i)) jobs++;
    maxPerFrame = Math.max(maxPerFrame, jobs);
  }
  assert.equal(maxPerFrame, 4,
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
  // Simulate sustained render pressure after a high-refresh run. The far
  // cohort must retain cadence instead of freezing behind always-due near work.
  for (let frame = 0; frame < 180; frame++) {
    const mask = scheduler.step(1 / 70);
    let jobs = 0;
    for (let i = 0; i < 4; i++) if (mask & (1 << i)) jobs++;
    maxAfterDrop = Math.max(maxAfterDrop, jobs);
  }
  assert.equal(maxAfterDrop, 4,
    `render pressure lost the coherent far refresh with ${maxAfterDrop} map frames`);
}

{
  const r = sample(60);
  assert.equal(r.hits[0], 120, '60 Hz keeps near cascade 0 every frame');
  assert.equal(r.hits[1], 120, '60 Hz keeps near cascade 1 every frame');
  assert.equal(r.hits[2], 60, '60 Hz keeps far cascade 2 at 30 updates/s');
  assert.equal(r.hits[3], 60, '60 Hz keeps far cascade 3 at 30 updates/s');
  assert.equal(r.maxPerFrame, 4, '60 Hz refreshes the blended far cohort atomically');
  assertFarCohort(60);
}

{
  const scheduler = createShadowRefreshScheduler(4);
  assert.equal(scheduler.forceMask(), 0b1111, 'force refreshes every cascade');
  const first = scheduler.step(SHADOW_REFRESH_INTERVAL_S / 2);
  assert.equal(first & 0b1100, 0b1100,
    'post-force phase schedules the complete far cohort');
  assert.equal(first & 0b0011, 0b0011,
    'continuous near cascades remain represented on a far-cohort frame');
  const second = scheduler.step(SHADOW_REFRESH_INTERVAL_S / 2);
  assert.equal(second, 0b0011, 'post-force near pair remains continuous');
}

console.log('shadowRefresh.selftest: coherent far cohorts and 60/120/144 Hz cadence passed');
