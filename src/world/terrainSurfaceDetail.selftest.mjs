import { assertTerrainFetchExpressionCensus } from './terrainMaskShaderTestOracle.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectTerrainLandformMask } from './terrain.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';

const source = await readFile(new URL('./terrain.ts', import.meta.url), 'utf8');
const landform = () => 0.7;
for (const id of MAP_IDS) {
  const splat = getMapConfig(id).splat;
  assert.equal(selectTerrainLandformMask(splat, landform),
    splat?.seaLake || splat?.iceLake ? null : landform,
    `${id}: lake coverage cannot be overwritten by optional mesa weights`);
}
assert.equal(selectTerrainLandformMask(undefined, landform), landform);
assert.equal(selectTerrainLandformMask({}, null), null);
assert.match(source, /makeMaskTexture\(maskNoi, layout, rockMask, waterWetnessAt,/);
assert.match(source, /uRockGate = \{ value: rockMask \? 1 : 0 \}/,
  'mask bake and shader agree about the single blue-channel owner');
assertTerrainFetchExpressionCensus(source);
assert.deepEqual(source.match(/texSize\(\d+\)/g), [
  ...Array(6).fill('texSize(256)'), 'texSize(512)',
], 'terrain detail does not increase any procedural texture or mask dimensions');
for (const detail of [
  /n\.xy \+= dn\.xy \* ([\d.]+) \* openNear \* \(1\.0 - fMs\)/,
  /n\.xy \+= dn2\.xy \* ([\d.]+) \* nearG/,
  /n\.xy \+= gnF\.xy \* farG \* ([\d.]+)/,
]) {
  const gain = source.match(detail);
  assert.ok(gain, 'soil normals remain independently wetness-gated or ground-only');
  // 2026-09-12 visual restoration: the far coarse-turf octave (gnF) may run to
  // 0.45 (the 1049e4e meadow ran 1.5). Owner verdict later that day ("every
  // texture looks flat"): the near soil octaves return toward the 1049e4e
  // strengths (0.85/0.75 there): first octave <= 0.70, clod octave <= 0.60.
  // Both stay off the carriageway (openNear/nearG), which keeps the road's
  // shallow packed-earth response as the only near normal on a road.
  // Relief pass 2 (2026-09-12, late; owner: "flat, undetailed, less textured
  // than 1049e4e"): the near octaves run the full reference strengths
  // (0.85 / 0.75) and the far turf half way back (0.9 of the reference 1.5);
  // the carriageway and waterline gates stay, so a road or a bay never gets
  // a giant clod normal.
  const cap = detail.source.includes('gnF') ? 0.9 : detail.source.includes('dn2') ? 0.75 : 0.85;
  assert.ok(Number(gain[1]) <= cap,
    'signed normals added before x2 decode remain bounded, not giant terrain clods');
}
assert.match(source,
  /n\.xy -= \(ga \* 1\.1 \+ gb \* 1\.55\)[^;]+\(1\.0 - fMs\);/, // relief pass 2 (2026-09-12): ~80 % of the 1049e4e 1.4 / 2.0, still waterline-gated
  'mid-distance soil relief is bounded and cannot hammer the water surface');
assert.match(source,
  /float meadowG = [^;]+\(1\.0 - fMs\);/,
  'grass coloration cannot tint open water or lake ice');
assert.match(source,
  /float bedW = [^;]+\(1\.0 - fMs\) \* sandCoverage;/,
  'coastal water cannot inherit the neighboring sand dune bedforms');
assert.match(source, /float nearG = openNear2 \* meadowG \* \(1\.0 - fR\);/,
  'near turf relief uses existing dirt/projected/liquid coverage plus rock exclusion');
assert.match(source,
  /float farG = farM \* \(1\.0 - fR\) \* meadowG \* \(1\.0 - roadCore\);/,
  'distant turf relief inherits actual liquid coverage through meadowG and excludes other material owners');
assert.match(source,
  /mb \+ mix\(0\.85, 1\.6, min\(mb \* 0\.5, 1\.0\)\)/,
  'resolved midrange grains retain detail with the same distant anti-shimmer limit');
console.log('terrainSurfaceDetail self-test: shallow material relief, water isolation and fixed GPU budget passed');
