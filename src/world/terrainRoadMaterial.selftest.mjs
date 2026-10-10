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
// terrain v2 (2026-10-01, the cost pass): the soil sample takes the layer's measured mean (its far variant's tile mean),
// the packed-earth normal is skipped past the far band (nrmOn), and the block runs only on the carriageway (dW)
assert.match(terrainSource, /vec3 packedRoad = groundSamp\(uAlbD, uMeanD, uv \* 0\.210, df, mipB \+ 4\.0\)\.rgb;/,
  'the dirt-road palette keeps a smoothed mip: soil grain survives, no single source clod is stamped');
assert.match(terrainSource,
  /vec2 packedRoadN = nrmOn \? groundNrm\(uNrmD,[\s\S]{0,240}n\.xy = mix\(n\.xy, packedRoadN, dW\);/,
  'the dirt-road core replaces the open-ground normal with its shallow packed-earth response');
assert.match(terrainSource, /packedRoadN = mix\(vec2\(0\.5\), packedRoadN, 0\.30\);/,
  'the packed-earth normal stays shallow (30% of the smoothed sample)');
assert.doesNotMatch(terrainSource, /vec4 (?:grav|roadGrit) = texture2D\(uAlbR,[\s\S]{0,180}roadCore/,
  'near dirt roads cannot mix the raw rock tile (its cavities) into the carriageway');
// (2026-10-05, the road styles: every road term reads the styled paved share gRoadTex — the map's uRoadTex on every
// unstyled road, a styled path's own surface on a styled one; roadPathStyles pins the decode)
assert.match(terrainSource,
  // (map revival lane 2, Aegis Crossing, 2026-10-05: gRoadTex is uRoadTex, or 1 inside a map's paved town rect — SplatConfig
  // townPaving — so the dirt road's grain, lanes and ruts stop at the setts as they stop on a textured road)
  /clamp\(\(gvL - gvM\) \* 1\.4, -0\.16, 0\.20\) \* roadCore \* dNear \* \(1\.0 - gRoadTex\)/,
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
  /float laneD = \(dRoad - 1\.55 - \(n1 - 0\.5\) \* 0\.55\) \* uLaneK;[\s\S]{0,120}float lane = uLaneK > 0\.0 \? exp\(-laneD \* laneD\) : 1\.0 - smoothstep\(2\.6, 3\.6, dRoad\);/,
  'twin wheel lanes sit 1.55 m either side of the centreline on the 2 m mask, swinging a quarter metre along the road (wave 69); a coarse mask gets one bead-free plateau');
assert.match(terrainSource,
  /float rutAmp = \(0\.22 \+ 0\.78 \* smoothstep\(0\.28, 0\.70, n2 \* 0\.55 \+ n1 \* 0\.45\)\) \* \(0\.72 \+ 0\.28 \* n1hs\);/,
  'the wheel tracks come and go along the road: deep down one stretch, nearly gone on a hard dry one (wave 69)');
assert.match(terrainSource, /shader\.uniforms\.uLaneK = \{ value: roadLaneSharpness\(mask\.image\.width\) \};/,
  'lane sharpness follows the actual mask texel size');
assert.match(terrainSource,
  /min\(mix\(rut, trodMid \* 0\.55, laneFar\), 1\.0\) \* mix\(0\.34, 0\.26, gRoadTex\)/,
  'the two-track wear near the 1049e4e strength by the camera; past a 0.15 m footprint one trodden middle, no ruled lanes (waves 69, hold 26)');
assert.match(terrainSource, /float laneFar = smoothstep\(0\.08, 0\.28, gFootM\) \* \(1\.0 - gRoadTex\);/,
  'the lanes hand over to the trodden middle as they shrink under three pixels');
assert.match(terrainSource, /a\.a = mix\(a\.a, a\.a \* 0\.86, rut \* \(1\.0 - gRoadTex\)\);/,
  'compacted lanes run slightly less rough (damp) on dirt roads only');
// (the Redrock lane, round 10: a map's wheel lanes' relief gain, splat.roadRuts x — 1 unless a map authors it; Redrock's
// worn-deep tracks 2.6)
assert.match(terrainSource,
  /n\.xy \+= gradD \* laneSlope \* 0\.14 \* roadCore \* rutAmp \* \(1\.0 - df \* 0\.72\) \* uRoadRuts\.x;/,
  'lane relief comes from the analytic lane slope along the field gradient and stays shallow');
assert.match(terrainSource, /shader\.uniforms\.uRoadRuts = \{ value: new THREE\.Vector3\(\.\.\.\(S\.roadRuts \?\? \[1, 0, 0\]\)\) \};/,
  'the relief gain is 1 and the darkening and gravel nil unless a map authors splat.roadRuts');
assert.match(terrainSource, /\(streak - 0\.5\) \* 0\.16 \* max\(lane, 0\.35 \* crown\) \* roadCore \* \(1\.0 - df\)/,
  'tyre streaks are an along-lane modulation bounded to +/-8%');
assert.doesNotMatch(terrainSource, /rutG/, 'the mask-gradient emboss of the old rut bytes is gone');

// Round 29 (owner 2026-09-20, "see where the texture just stops") ran a road on into the horizon ring on the mask's
// clamped edge texels, fading between 24 and 96 m past the edge. The map-borders lane (2026-10-03) replaced that: the
// clamped texel bent every oblique road to the perpendicular and left it in the ground 96 m out, so the clamped road
// channels now fade within 10 m and a road that leaves the square runs on across the ring from the exit attribute
// (terrain.ts roadExits: [signed offset from the exit line, presence], the square's own road law on mk.g / mk.r);
// settlement wear keeps its short fade and the landform/marsh channel its edge value.
assert.match(terrainSource, /float edgeOut = max\(abs\(wp\.x\), abs\(wp\.z\)\) - 512\.0;/, 'the edge distance is measured once');
assert.match(terrainSource, /float outsideRoadW = smoothstep\(0\.0, 10\.0, edgeOut\);/, 'the clamped road texel fades within 10 m past the edge');
assert.match(terrainSource, /mk = vec4\(mk\.r \* \(1\.0 - outsideRoadW\), mk\.g \* \(1\.0 - outsideRoadW\), mk\.b, mk\.a \* \(1\.0 - outsideW\)\);/,
  'only the road channels take the clamped-texel fade; wear keeps the 36 m ramp and the landform/marsh channel its edge value');
// (the map-borders lane, wave 3: a road running out narrows to a track as it fades — its widths times mix(0.45, 1, presence))
assert.match(terrainSource, /if \(vRoadExit\.y > 0\.002\) \{\s*float dE = abs\(vRoadExit\.x\);[\s\S]{0,260}?float wE = mix\(0\.45, 1\.0, vRoadExit\.y\);\s*mk\.g = max\(mk\.g, max\(0\.0, 1\.0 - dE \/ \(12\.0 \* wE\)\) \* vRoadExit\.y\);\s*mk\.r = max\(mk\.r, \(1\.0 - smoothstep\(3\.2 \* wE, 4\.6 \* wE, dE\)\) \* vRoadExit\.y\);/,
  'past the edge the road exit attribute writes the centreline distance (mk.g, 12 m to byte 0 at full presence) the road law reads, narrowing as it fades');
assert.match(terrainSource, /attribute vec2 roadExit;\\nvarying vec2 vRoadExit;/, 'the exit attribute is a vertex attribute (a geometry without it reads no road)');
assert.doesNotMatch(terrainSource, /mk = mix\(mk, vec4\(0\.0, 0\.0, mk\.b, 0\.0\), outsideW\);/, 'the old all-channel 36 m fade is gone');

// (2026-10-07, waves 186/187, Ruinspires' kerb: "a spotless, perfectly regular grid of oversized, heavily bevelled setts")
// the setts at the kaldrma's scale — 0.14 m courses, 0.13–0.20 m stones, the bevel 0.30, a sett in thirty gone, the
// tarmac repairs over them — and the far stand-in near the near pattern's mean
for (const line of [
  'float course = rq.x / 0.14, ci = floor(course);',
  'float sw = 0.13 + 0.07 * cr.y;',
  'float settVis = tileVis(0.30);',
  'float gone = step(0.966, sh.y) * settVis;',
  '* 0.30 * settVis * (1.0 - jointS) * (1.0 - gone), 0.5, 1.0);',
  'float repair = step(rph.x, 0.06) * rpEdge * tileVis(1.0);',
]) assert.ok(terrainSource.includes(line), `the setts: ${line}`);
{
  // the near pattern's mean tone against its far stand-in (0.112): stones, joints and the gone setts over a course grid
  let sum = 0, n = 0;
  for (let i = 0; i < 4000; i++) {
    const tone = 0.72 + 0.56 * ((i * 0.618034) % 1), gone = ((i * 0.3819) % 1) > 0.966;
    const sw = 0.13 + 0.07 * ((i * 0.7548) % 1), jointShare = Math.min(1, 0.011 * 2 / 0.14 + 0.011 * 2 / sw);
    const stone = gone ? 0.0505 : 0.128 * tone;
    sum += stone * (1 - jointShare) + 0.040 * jointShare; n++;
  }
  const mean = sum / n;
  assert.ok(Math.abs(mean - 0.112) < 0.025, `the setts' far stand-in sits near their near mean (${mean.toFixed(3)} against 0.112)`);
}

console.log('terrainRoadMaterial self-test passed');
