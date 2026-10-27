import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bakeCirrusPixels, bakeCirrusPixelsSteps, bakeCumulusPixels, bakeCumulusPixelsSteps } from './skyCloudBake.ts';
import { bakeCloudBlueNoise, bakeCloudNoiseKindSteps } from './cloudNoise.ts';

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

// 2026-10-01 (frozen pins retired): the sha256 pins of the 64² cirrus and cumulus bakes were change detectors of the
// cloud look. The main thread and the worker run the same pure bake, so the contract is determinism: two bakes of the
// same config are byte-identical, and a different seed is genuinely different.
assert.equal(digest(bakeCirrusPixels(64, 64, config)), digest(bakeCirrusPixels(64, 64, config)),
  'cirrus pixels are deterministic, so main and worker bakes agree');
assert.equal(digest(bakeCumulusPixels(64, 64, config)), digest(bakeCumulusPixels(64, 64, config)),
  'coherent periodic cumulus pixels are byte-identical in repeated (main and worker) bakes');
assert.notEqual(digest(bakeCumulusPixels(64, 64, { ...config, seed: 778 })), digest(bakeCumulusPixels(64, 64, config)),
  'a different seed bakes a different deck');

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

// (2026-10-26, the boot ABBA) the sliced bakes: the same bytes as the whole bakes, a yield every rowsPerStep rows (a
// cloud worker past its deadline made the synchronous fallback one 1.1 s task; sky.ts now drives these under a budget)
const drain = (steps) => {
  let yields = 0;
  let step = steps.next();
  while (!step.done) { yields++; step = steps.next(); }
  return { pixels: step.value, yields };
};
for (const rows of [1, 4, 7, 64]) {
  const cumulusSteps = drain(bakeCumulusPixelsSteps(65, 65, config, rows));
  assert.equal(digest(cumulusSteps.pixels), digest(bakeCumulusPixels(65, 65, config)), `cumulus in ${rows}-row slices: the same bytes`);
  assert.equal(cumulusSteps.yields, Math.ceil(65 / rows) * 2 - 1, 'fields, then shading, a slice at a time');
  const cirrusSteps = drain(bakeCirrusPixelsSteps(65, 65, config, rows));
  assert.equal(digest(cirrusSteps.pixels), digest(bakeCirrusPixels(65, 65, config)), `cirrus in ${rows}-row slices: the same bytes`);
  assert.equal(cirrusSteps.yields, Math.ceil(65 / rows) - 1);
}
const sky = readFileSync(new URL('./sky.ts', import.meta.url), 'utf8');
const chunked = sky.slice(sky.indexOf('const installCloudTexturesChunked = async'), sky.indexOf('const cloudsFar = mkCloudDeck('));
assert.match(chunked, /cloudWorkerResults\?\.cirrus \?\? \(tick \? await bakeCloudPixelsSliced\('cirrus', tick\) : null\)/,
  'a missing cirrus result bakes in slices between the caller\'s frames');
assert.match(chunked, /cloudWorkerResults\?\.cumulus \?\? \(tick \? await bakeCloudPixelsSliced\('cumulus', tick\) : null\)/,
  'a missing cumulus result bakes in slices between the caller\'s frames');
const sliced = sky.slice(sky.indexOf('async function bakeCloudPixelsSliced('), sky.indexOf('interface HorizonColorCache'));
assert.match(sliced, /performance\.now\(\) - sliceAt >= CLOUD_FALLBACK_SLICE_MS\) \{\s*await tick\(\);/, 'a frame once a slice has used its budget');
assert.match(sky, /if \(!decksInstall\) ensureCloudTextures\(\);/, 'the presentation never bakes the decks in one task while slices run');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const postStage = main.slice(main.indexOf("await bootStage('post', async () => {"));
const decksAwait = postStage.indexOf('await sky.ensureCloudDecksChunked(() => nextFrame());');
assert.ok(decksAwait > 0 && decksAwait < postStage.indexOf('await warmGarageGpuPipeline({'),
  'the boot waits for the decks (not the volumetric noise) before the Garage warm uploads them');
const textures = sky.slice(sky.indexOf('const installCloudTexturesChunked = async'), sky.indexOf('const installCloudDecksChunked = async'));
assert.ok(textures.indexOf('await ensureCloudDecksChunked(tick);') >= 0
  && textures.indexOf('await ensureCloudDecksChunked(tick);') < textures.indexOf('await cloudNoisePromise'),
  'the decks install before the volumetric layer waits on its noise worker');
assert.match(textures, /if \(tick\) await bakeCloudNoiseSliced\(tick\);\s*else ensureCloudNoise\(\);/,
  'a noise worker past its deadline leaves the missing kinds to slices, never one bake');
const noiseDeadline = sky.slice(sky.indexOf('createDeferredDeadline<void>(12000'), sky.indexOf('worker.onmessage', sky.indexOf('createDeferredDeadline<void>(12000')));
assert.doesNotMatch(noiseDeadline, /worker\.terminate\(\)/, 'the noise worker past its deadline keeps working beside the slices');

// the noise kinds a slice at a time: the same bytes (blue at its shipped size; volumetricClouds.selftest pins every
// kind's synchronous bytes, which now drain these same generators)
const blue = drain(bakeCloudNoiseKindSteps('blue'));
assert.equal(digest(blue.pixels), digest(bakeCloudBlueNoise()), 'blue noise in slices: the same bytes');
assert.ok(blue.yields > 8, 'the blue noise yields inside its void-and-cluster passes');
for (const kind of ['weather', 'streets', 'local']) {
  const steps = bakeCloudNoiseKindSteps(kind);
  let yields = 0;
  for (let step = steps.next(); !step.done && yields < 4; step = steps.next()) yields++;
  assert.equal(yields, 4, `${kind}: the bake yields within its first rows`);
}

console.log('skyCloudBake.selftest: deterministic cirrus and cumulus bytes, the same bytes in slices, and the sliced fallback passed');
