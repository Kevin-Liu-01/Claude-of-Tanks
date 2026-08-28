import assert from 'node:assert/strict';
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

console.log('shadowStability.selftest: texel snapping and cascade-scaled bias pass');
