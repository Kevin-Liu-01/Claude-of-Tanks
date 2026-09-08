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
assert.equal((source.match(/texture2D\(/g) || []).length, 78,
  'the surface pass preserves the existing texture fetch expression budget');
assert.deepEqual(source.match(/texSize\(\d+\)/g), [
  ...Array(6).fill('texSize(256)'), 'texSize(512)',
], 'terrain detail does not increase any procedural texture or mask dimensions');
for (const detail of [
  /n\.xy \+= dn\.xy \* ([\d.]+) \* openNear \* \(1\.0 - fMs\)/,
  /n\.xy \+= dn2\.xy \* ([\d.]+) \* openNear2 \* \(1\.0 - fMs\)/,
  /n\.xy \+= gnF\.xy \* farG \* ([\d.]+)/,
]) {
  const gain = source.match(detail);
  assert.ok(gain, 'soil normals remain independently wetness-gated or ground-only');
  assert.ok(Number(gain[1]) <= 0.25,
    'signed normals added before x2 decode remain shallow, not giant terrain clods');
}
assert.match(source,
  /n\.xy -= \(ga \* 0\.40 \+ gb \* 0\.58\)[^;]+\(1\.0 - fMs\);/,
  'mid-distance soil relief is bounded and cannot hammer the water surface');
assert.match(source,
  /float meadowG = [^;]+\(1\.0 - fMs\);/,
  'grass coloration cannot tint open water or lake ice');
assert.match(source,
  /float bedW = [^;]+\(1\.0 - fMs\);/,
  'coastal water cannot inherit the neighboring sand dune bedforms');
assert.match(source,
  /float farG = [^;]+\(1\.0 - fMs\)/,
  'distant turf relief uses actual liquid coverage rather than its wider shore ramp');
assert.match(source,
  /mb \+ mix\(0\.85, 1\.6, min\(mb \* 0\.5, 1\.0\)\)/,
  'resolved midrange grains retain detail with the same distant anti-shimmer limit');
console.log('terrainSurfaceDetail self-test: shallow material relief, water isolation and fixed GPU budget passed');
