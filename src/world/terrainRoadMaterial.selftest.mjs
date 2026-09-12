import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const terrainSource = await readFile(new URL('./terrain.ts', import.meta.url), 'utf8');

// road pass 2026-09-12 (owner: "the roads are so flat"). The earlier receipt
// froze the carriageway at a blurred deep-mip palette with 10% rut wear after
// two artifacts: black source cavities repeating down the road, and the 2 m
// texel Gaussian lane bytes reading as chains of ovals. Both causes are gone
// (analytic lanes from a distance field; clamped zero-mean grain), so the
// road may carry real relief again. These pins keep the artifact guards.
assert.doesNotMatch(terrainSource, /roadGrit\s*=\s*texture2D/,
  'near dirt roads do not stamp any source-texture clod directly into the carriageway');
assert.match(terrainSource, /float openNear = dNear \* \(1\.0 - roadCore\);/,
  'the first near-detail octave is explicitly excluded from compacted roads');
assert.match(terrainSource, /float openNear2 = dNear2 \* \(1\.0 - roadCore\);/,
  'the closest clod-scale octave is explicitly excluded from compacted roads');
assert.match(terrainSource, /vec3 packedRoad = groundSamp\(uAlbD,/,
  'the continuous dirt-road core uses the smoothed packed-earth layer');
assert.match(terrainSource, /vec3 packedRoad = groundSamp\(uAlbD, uv \* 0\.210, df, mipB \+ 4\.0\)\.rgb;/,
  'the dirt-road palette keeps a smoothed mip: soil grain survives, no single source clod is stamped');
assert.match(terrainSource,
  /vec2 packedRoadN = groundNrm\(uNrmD,[\s\S]{0,240}n\.xy = mix\(n\.xy, packedRoadN, dW\);/,
  'the dirt-road core replaces the open-ground normal with its shallow packed-earth response');
assert.match(terrainSource, /packedRoadN = mix\(vec2\(0\.5\), packedRoadN, 0\.30\);/,
  'the packed-earth normal stays shallow (30% of the smoothed sample)');
assert.doesNotMatch(terrainSource, /vec4 (?:grav|roadGrit) = texture2D\(uAlbR,[\s\S]{0,180}roadCore/,
  'near dirt roads cannot mix the raw rock tile (its cavities) into the carriageway');
assert.match(terrainSource,
  /clamp\(\(gvL - gvM\) \* 1\.4, -0\.16, 0\.20\) \* roadCore \* dNear \* \(1\.0 - uRoadTex\)/,
  'carriageway gravel grain is a clamped zero-mean luminance high-pass, never darker than -16%');
assert.match(terrainSource,
  /float dapG = \(1\.0 - triW \* 0\.85\) \* \(1\.0 - roadCore \* 0\.5\);/,
  'half the landform dapple reaches the carriageway');
// Distance-field road profile: edge, lanes and crown are analytic per pixel.
assert.match(terrainSource, /float dRoad = \(1\.0 - mk\.g\) \* 12\.0;/,
  'the shader decodes the mask G byte as metres from the road centreline');
assert.match(terrainSource,
  /float roadCore = 1\.0 - smoothstep\(roadHalf - 0\.55, roadHalf \+ 0\.55, dRoad\);/,
  'the compacted core ends on an analytic gauge, not on a filtered byte threshold');
assert.match(terrainSource,
  /float laneD = \(dRoad - 1\.55\) \* uLaneK;[\s\S]{0,120}float lane = uLaneK > 0\.0 \? exp\(-laneD \* laneD\) : 1\.0 - smoothstep\(2\.6, 3\.6, dRoad\);/,
  'twin wheel lanes sit 1.55 m either side of the centreline on the 2 m mask; a coarse mask gets one bead-free plateau');
assert.match(terrainSource, /shader\.uniforms\.uLaneK = \{ value: roadLaneSharpness\(mask\.image\.width\) \};/,
  'lane sharpness follows the actual mask texel size');
assert.match(terrainSource,
  /min\(rut \* \(1\.0 \+ farM \* 0\.9\), 1\.0\) \* mix\(0\.34, 0\.26, uRoadTex\)/,
  'the two-track wear is back near the 1049e4e strength with its far boost');
assert.match(terrainSource, /a\.a = mix\(a\.a, a\.a \* 0\.86, rut \* \(1\.0 - uRoadTex\)\);/,
  'compacted lanes run slightly less rough (damp) on dirt roads only');
assert.match(terrainSource,
  /n\.xy \+= gradD \* laneSlope \* 0\.14 \* roadCore \* rutAmp \* \(1\.0 - df \* 0\.72\);/,
  'lane relief comes from the analytic lane slope along the field gradient and stays shallow');
assert.match(terrainSource, /\(streak - 0\.5\) \* 0\.16 \* max\(lane, 0\.35 \* crown\) \* roadCore \* \(1\.0 - df\)/,
  'tyre streaks are an along-lane modulation bounded to +/-8%');
assert.doesNotMatch(terrainSource, /rutG/, 'the mask-gradient emboss of the old rut bytes is gone');

console.log('terrainRoadMaterial self-test passed');
