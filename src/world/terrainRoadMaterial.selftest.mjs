import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const terrainSource = await readFile(new URL('./terrain.ts', import.meta.url), 'utf8');

assert.doesNotMatch(terrainSource, /roadGrit\s*=\s*texture2D/,
  'near dirt roads do not stamp any source-texture clod directly into the carriageway');
assert.match(terrainSource, /float openNear = dNear \* \(1\.0 - roadCore\);/,
  'the first near-detail octave is explicitly excluded from compacted roads');
assert.match(terrainSource, /float openNear2 = dNear2 \* \(1\.0 - roadCore\);/,
  'the closest clod-scale octave is explicitly excluded from compacted roads');
assert.match(terrainSource, /vec3 packedRoad = groundSamp\(uAlbD,/,
  'the continuous dirt-road core uses the smoothed packed-earth layer');
assert.match(terrainSource, /mipB \+ 7\.0\)\.rgb;/,
  'the dirt-road palette comes from a deep mip with no individually visible clods');
assert.match(terrainSource,
  /vec2 packedRoadN = groundNrm\(uNrmD,[\s\S]{0,240}n\.xy = mix\(n\.xy, packedRoadN, dW\);/,
  'the dirt-road core suppresses repeating open-ground normal cavities');
assert.doesNotMatch(terrainSource, /vec4 (?:grav|roadGrit) = texture2D\(uAlbR,[\s\S]{0,180}roadCore/,
  'near dirt roads cannot reintroduce repeated black rock cavities');
assert.match(terrainSource,
  /float dapG = \(1\.0 - triW \* 0\.85\) \* \(1\.0 - roadCore\);/,
  'large-scale landform normal dapple is excluded from compacted roads');
assert.match(terrainSource,
  /min\(rut \* \(1\.0 \+ farM \* 0\.45\), 1\.0\) \* mix\(0\.10, 0\.22, uRoadTex\)/,
  'the low-resolution rut mask can only apply subtle dirt-road tonal wear');
assert.match(terrainSource,
  /n\.xy \+= rutG \* 0\.30 \* \(1\.0 - df \* 0\.72\);/,
  'wheel-rut relief stays shallow enough to avoid fake pothole shadows');

console.log('terrainRoadMaterial self-test passed');
