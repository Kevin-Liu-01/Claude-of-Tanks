import assert from 'node:assert/strict';
import { PRESETS } from './quality.js';
import { snapShadowCoordinate } from './shadowStability.js';

const cascadeSpans = [82.5, 176.25, 391.5, 806.75];

for (const [name, preset] of Object.entries(PRESETS)) {
  preset.shadowMapSizes.forEach((size, index) => {
    const texel = cascadeSpans[index] / size;
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

console.log('shadowStability.selftest: ok');
