import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SHADOW_REFRESH_INTERVAL_S,
  canDormantShadowCascades,
  createShadowRefreshScheduler,
  resolveShadowPrimeCount,
} from './shadowRefresh.ts';

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

  const ready = [depth(), depth(), depth(), depth()];
  assert.equal(resolveShadowPrimeCount(ready, 2, true), 2,
    'an enclosed presentation may prime only its two visible cascade bands');
  assert.equal(resolveShadowPrimeCount(ready, 2, false), 4,
    'an active far range always receives a complete covered prime');
  assert.equal(resolveShadowPrimeCount([depth(), depth(), missing(), missing()], 2, true), 4,
    'missing native far depth targets fail open to a complete pass');
  assert.equal(resolveShadowPrimeCount(ready, Number.NaN, true), 4,
    'invalid limits cannot silently suppress shadow work');
  assert.equal(resolveShadowPrimeCount(null, 2, true), 0,
    'a missing lighting rig has no work to schedule');
}

const lightingSource = await readFile(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.match(lightingSource,
  /function applyFarCascadeDormancy\(\)[\s\S]{0,700}canDormantShadowCascades\(csm\.lights, FAR_CASCADE_START\)[\s\S]{0,500}shadow\.autoUpdate = false/,
  'the live CSM path must gate dormancy on native depth-map readiness');
assert.match(lightingSource,
  /function applyStaticPresentationDormancy\(\)[\s\S]{0,500}shadow\.autoUpdate = false[\s\S]{0,200}shadow\.needsUpdate = false/,
  'a proven-static presentation must suppress every redundant shadow submission');
assert.match(lightingSource,
  /setStaticPresentationDormant\(on[^)]*\)[\s\S]{0,700}else forceAllCascades\(\)/,
  'releasing static dormancy must force a complete cascade refresh');
assert.match(lightingSource,
  /applyStableCascadePoses\(csm, lastScheduledMask\)/,
  'each cascade fit must move only with the coherent depth-map cohort that owns it');

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

for (const hz of [60, 100, 120, 144]) {
  const r = sample(hz);
  for (let cascade = 0; cascade < 4; cascade++) {
    assert.equal(r.hits[cascade], hz * 2,
      `${hz} Hz cascade ${cascade} must refresh on every presented frame`);
  }
  assert.equal(r.maxPerFrame, 4,
    `${hz} Hz must render one coherent four-cascade shadow pass`);
}

{
  const scheduler = createShadowRefreshScheduler(4);
  assert.equal(scheduler.forceMask(), 0b1111, 'force refreshes every cascade');
  const first = scheduler.step(SHADOW_REFRESH_INTERVAL_S / 2);
  assert.equal(first, 0b1111,
    'post-force frames keep the complete cascade set current');
  const second = scheduler.step(SHADOW_REFRESH_INTERVAL_S / 2);
  assert.equal(second, 0b1111, 'every active frame remains a complete shadow pass');
  assert.equal(scheduler.step(0), 0, 'non-presented frames schedule no shadow work');
}

console.log('shadowRefresh.selftest: coherent full-frame shadows and safe dormancy passed');
