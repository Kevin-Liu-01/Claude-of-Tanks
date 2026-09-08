import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bakeCirrusPixels, bakeCumulusPixels } from './skyCloudBake.ts';

const config = Object.freeze({
  seed: 777,
  warp: 0.09,
  macroAniso: 2,
  threshold: 0.488,
  cluster: 0.17,
  edge: 0.030,
  edgeWisp: 0.055,
  coreWidth: 0.16,
  marchSteps: 12,
  marchStepPx: 3,
  shadeK: 0.80,
  lit: [1.0, 0.98, 0.94],
  shade: [0.40, 0.48, 0.67],
  silver: 0.38,
  detailAmp: 0.68,
  alphaVariation: 0.26,
  maxAlpha: 0.94,
});

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

assert.equal(
  digest(bakeCirrusPixels(64, 64, config)),
  '4bc3463debf0ab5b5cf3ce82316f68f75ddf959c85a1805b096cd8a8dd6533ee',
  'cirrus pixels remain deterministic across worker extraction',
);
assert.equal(
  digest(bakeCumulusPixels(64, 64, config)),
  'ae6f83e53b294f0babcc0a382dc51d346da576bfbfcfacd69cdddc1fd6500ee9',
  'coherent periodic cumulus pixels remain byte-identical in main and worker bakes',
);

const cumulus = bakeCumulusPixels(128, 128, config);
assert.equal(cumulus.byteLength, 128 * 128 * 4, 'richer billows do not add texture channels or size');
let covered = 0;
let dense = 0;
for (let i = 3; i < cumulus.length; i += 4) {
  covered += Number(cumulus[i] > 12);
  dense += Number(cumulus[i] > 100);
}
assert.ok(covered / (128 * 128) > 0.35 && covered / (128 * 128) < 0.55,
  'fair-weather cloud banks retain generous open-sky gaps');
assert.ok(dense / (128 * 128) > 0.10 && dense / (128 * 128) < 0.25,
  'the deck has coherent opaque bodies without becoming uniform overcast');

console.log('skyCloudBake.selftest: deterministic cirrus and cumulus bytes passed');
