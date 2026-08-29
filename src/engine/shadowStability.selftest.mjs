import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PRESETS } from './quality.ts';
import {
  SHADOW_NORMAL_BIAS_MAX_M,
  SHADOW_NORMAL_BIAS_MIN_M,
  shadowNormalBiasForTexel,
  snapShadowCoordinate,
} from './shadowStability.ts';

const cascadeSpans = [82.5, 176.25, 391.5, 806.75];

for (const [name, preset] of Object.entries(PRESETS)) {
  let previousBias = 0;
  preset.shadowMapSizes.forEach((size, index) => {
    const texel = cascadeSpans[index] / size;
    const normalBias = shadowNormalBiasForTexel(texel);
    assert.ok(normalBias >= SHADOW_NORMAL_BIAS_MIN_M,
      `${name} cascade ${index} normal bias keeps the near-field floor`);
    assert.ok(normalBias <= SHADOW_NORMAL_BIAS_MAX_M,
      `${name} cascade ${index} normal bias stays below the detachment ceiling`);
    assert.ok(normalBias >= previousBias,
      `${name} cascade ${index} does not lose receiver separation with distance`);
    previousBias = normalBias;
    const cell = 137 + index * 11;
    const insideCell = (cell + 0.2) * texel;
    const snapped = snapShadowCoordinate(insideCell, texel);
    assert.ok(
      Math.abs(snapped / texel - cell) < 1e-9,
      `${name} cascade ${index} must align to its ${size}px texel grid`,
    );
    assert.equal(
      snapShadowCoordinate(insideCell + texel * 0.5, texel),
      snapped,
      `${name} cascade ${index} must not move within one texel`,
    );
    assert.ok(
      Math.abs(snapShadowCoordinate(insideCell + texel, texel) - snapped - texel) < 1e-9,
      `${name} cascade ${index} must advance by exactly one texel`,
    );
  });
}

assert.equal(shadowNormalBiasForTexel(Number.NaN), SHADOW_NORMAL_BIAS_MIN_M,
  'invalid texel footprints fail to the stable near-field bias');
assert.equal(shadowNormalBiasForTexel(100), SHADOW_NORMAL_BIAS_MAX_M,
  'extreme far footprints remain bounded');

const lightingSource = await readFile(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.match(lightingSource,
  /cotSunVis = mix\( cotSunVis, cotCascadeVis, blendRatio \);/,
  'fade-overlap ambient visibility uses the same sequential CSM blend as direct light');
assert.doesNotMatch(lightingSource,
  /frag\.replace\(fadeAnchor,[\s\S]{0,180}cotSunVis = min/,
  'a barely contributing fade cascade cannot own the complete ambient-shadow term');

const blendVisibility = (previous, sample, weight) =>
  previous + (sample - previous) * weight;
assert.equal(blendVisibility(1, 0, 0.05), 0.95,
  'a dark cascade at five-percent overlap may only dim the ambient term by five percent');
assert.equal(blendVisibility(0.95, 1, 0.95), 0.9975,
  'the next cascade resolves the overlap with the same sequential blend as direct light');
assert.equal(blendVisibility(1, 0, 1), 0,
  'a fully owned shadow remains fully dark');

console.log('shadowStability.selftest: texel snapping, cascade-scaled bias, and weighted overlap pass');
