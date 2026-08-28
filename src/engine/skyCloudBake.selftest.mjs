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
  '302872d5fc762a9d5fec7d31b24b216f09c6863a03fa73cfc1e00e10f6e59df9',
  'cumulus pixels remain deterministic across worker extraction',
);

console.log('skyCloudBake.selftest: deterministic cirrus and cumulus bytes passed');
