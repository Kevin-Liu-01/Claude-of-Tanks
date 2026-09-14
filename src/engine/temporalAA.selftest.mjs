import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  TAA_CLIP_GAMMA, TAA_HISTORY_WEIGHT, TAA_HISTORY_WEIGHT_MOVING, TAA_JITTER_LENGTH, TAA_MOVING_DELTA,
  TAA_RESOLVE_FRAGMENT, TemporalAAPass, applyProjectionJitter, halton, resolveTaaHistoryWeight, taaJitterOffset,
} from './temporalAA.ts';

// Temporal anti-aliasing (2026-09-12): jitter sequence, blend policy, resolve
// shader contract, pass lifecycle, post-chain wiring and preset gating.

// Halton(2, 3): the classic low-discrepancy pair, deterministic and centred
assert.deepEqual([1, 2, 3, 4].map((i) => halton(i, 2)), [0.5, 0.25, 0.75, 0.125]);
assert.deepEqual([1, 2, 3].map((i) => +halton(i, 3).toFixed(6)), [0.333333, 0.666667, 0.111111]);
const offsets = Array.from({ length: TAA_JITTER_LENGTH }, (_, f) => taaJitterOffset(f));
assert.equal(new Set(offsets.map((o) => o.join(','))).size, TAA_JITTER_LENGTH, 'eight distinct sub-pixel offsets');
for (const [jx, jy] of offsets) assert.ok(Math.abs(jx) <= 0.5 && Math.abs(jy) <= 0.5, 'jitter stays inside the pixel');
const mean = offsets.reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]).map((v) => v / TAA_JITTER_LENGTH);
assert.ok(Math.abs(mean[0]) < 0.07 && Math.abs(mean[1]) < 0.07, `the sequence is centred (${mean})`);
assert.deepEqual(taaJitterOffset(TAA_JITTER_LENGTH + 3), taaJitterOffset(3), 'the sequence wraps');
assert.deepEqual(taaJitterOffset(-1), taaJitterOffset(TAA_JITTER_LENGTH - 1), 'negative frames wrap too');

// projection jitter: a pixel offset moves the clip-space centre by 2/size, nothing else
{
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  const before = camera.projectionMatrix.clone();
  applyProjectionJitter(camera.projectionMatrix, 0.25, -0.5, 1600, 900);
  const e = camera.projectionMatrix.elements, b = before.elements;
  assert.ok(Math.abs(e[8] - (b[8] + 0.5 / 1600)) < 1e-12 && Math.abs(e[9] - (b[9] - 1 / 900)) < 1e-12, 'only the projection centre moves');
  for (let i = 0; i < 16; i++) if (i !== 8 && i !== 9) assert.equal(e[i], b[i]);
  camera.updateProjectionMatrix();
  assert.deepEqual(camera.projectionMatrix.elements, b, 'updateProjectionMatrix restores the unjittered projection');
}

// blend policy: seed frames show the current image, fast camera motion trusts history less
assert.equal(resolveTaaHistoryWeight(0, true), 0);
assert.equal(resolveTaaHistoryWeight(0.001, false), TAA_HISTORY_WEIGHT);
assert.equal(resolveTaaHistoryWeight(TAA_MOVING_DELTA * 2, false), TAA_HISTORY_WEIGHT_MOVING);
assert.equal(resolveTaaHistoryWeight(Number.NaN, false), 0);
assert.ok(TAA_HISTORY_WEIGHT >= TAA_HISTORY_WEIGHT_MOVING && TAA_HISTORY_WEIGHT_MOVING >= 0.88, 'history dominates; camera motion is reprojected, so it keeps (nearly) the full share');

// resolve shader contract: reprojection through depth, variance clipping, depth rejection, luminance weighting
assert.match(TAA_RESOLVE_FRAGMENT, /uInvViewProj \* vec4\(vUv \* 2\.0 - 1\.0, depth \* 2\.0 - 1\.0, 1\.0\)/, 'world position from depth');
assert.match(TAA_RESOLVE_FRAGMENT, /uPrevViewProj \* world/, 'reprojected into the previous frame');
assert.match(TAA_RESOLVE_FRAGMENT, new RegExp(`sigma \\* ${TAA_CLIP_GAMMA.toFixed(2).replace('.', '\\.')}`), 'variance clipping with the published gamma');
assert.match(TAA_RESOLVE_FRAGMENT, /clamp\(tmw\(max\(hs\.rgb, vec3\(0\.0\)\)\), lo, hi\)/, 'history is clipped to the current neighbourhood');
assert.match(TAA_RESOLVE_FRAGMENT, /depthMismatch/, 'history is rejected when its stored depth disagrees');
assert.match(TAA_RESOLVE_FRAGMENT, /depth >= 1\.0 \|\| pc\.w <= 0\.0/, 'sky and behind-camera samples take the current frame');
assert.match(TAA_RESOLVE_FRAGMENT, /vec3 tmw\(vec3 c\) \{ return c \/ \(1\.0 \+ max/, 'luminance weighting bounds HDR sparkles');
assert.match(TAA_RESOLVE_FRAGMENT, /gl_FragColor = vec4\(itmw\(mix\(now, hist, w\)\), linearDepth01\(depth\)\);/, 'the resolve stores linear depth beside the colour (half-float alpha keeps relative precision there)');
assert.match(TAA_RESOLVE_FRAGMENT, /abs\(hs\.a - expectedPrevLinear\)\n\s*> max\(0\.0200, expectedPrevLinear \* 0\.100\)/, 'rejection is a floor plus a relative share of linear depth — loose, because the neighbourhood clip already bounds ghosting and foliage disoccludes every pixel');

// pass lifecycle: history targets, texel uniform, size changes reseed, disposal
{
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  const depth = new THREE.DepthTexture(320, 180);
  const pass = new TemporalAAPass(camera, depth, 320, 180);
  assert.equal(pass.needsSwap, true, 'the composer swaps after the pass');
  assert.equal(pass.material.uniforms.tDepth.value, depth);
  assert.ok(pass.material.uniforms.uNearFar, 'near/far feed the linear depth');
  assert.deepEqual(pass.material.uniforms.uTexel.value.toArray(), [1 / 320, 1 / 180]);
  assert.equal(pass.material.uniforms.uSeed.value, 1, 'the first frame is a seed');
  pass.setSize(640, 360);
  assert.deepEqual(pass.material.uniforms.uTexel.value.toArray(), [1 / 640, 1 / 360]);
  assert.equal(pass.convergedFrames, 0);
  let disposed = 0;
  pass.material.addEventListener('dispose', () => disposed++);
  pass.copyMaterial.addEventListener('dispose', () => disposed++);
  pass.dispose();
  assert.equal(disposed, 2, 'both materials dispose');
  depth.dispose();
}

// wiring: after the late fx pass and before bloom, jittered scene render with restore, preset gating, published AA state
const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
const lateFxAt = post.indexOf('composer.addPass(lateFx);');
const taaAt = post.indexOf('composer.addPass(taa);');
const bloomAt = post.indexOf('composer.addPass(bloom);');
assert.ok(lateFxAt > 0 && taaAt > lateFxAt && bloomAt > taaAt, 'temporal AA sits after the late fx pass and before bloom');
assert.match(post, /new TemporalAAPass\(camera, sceneDepth, size\.x, size\.y\)/, 'the pass reprojects through the resolved scene depth');
assert.match(post, /const jittered = taa\.enabled;\n\s*if \(jittered\) \{\n\s*const \[jx, jy\] = taaJitterOffset\(taaFrame\+\+\);\n\s*applyProjectionJitter\(camera\.projectionMatrix, jx, jy, sceneTarget\.width, sceneTarget\.height\);\n\s*camera\.projectionMatrixInverse\.copy\(camera\.projectionMatrix\)\.invert\(\);/, 'the scene render is jittered at the internal resolution');
assert.match(post, /if \(jittered\) camera\.updateProjectionMatrix\(\);/, 'the unjittered projection is restored after every render');
assert.ok(post.indexOf('const jittered = taa.enabled;') < post.indexOf('if (canonicalPrefix) sceneAA.beginMatrixFrame(renderer);'), 'the late fx matrix capture sees the jittered projection');
assert.match(post, /taaEnabled = !!preset\.taa;\n\s*taa\.enabled = taaEnabled;\n\s*taa\.resetHistory\(\);/, 'preset changes gate the pass and reseed the history');
assert.match(post, /dataset\.postAa = `\$\{taaEnabled \? 'taa\+' : ''\}smaa-high\+fsr1`/, 'the published AA state names temporal AA');
const quality = readFileSync(new URL('./quality.ts', import.meta.url), 'utf8');
// 2026-09-14: temporal AA is OFF by default on every desktop tier (owner: the 1049e4e frame "looks a
// lot better … on low graphics too"; the shadow flashing it answered was the shadow-cull upload bug,
// fixed at the root). The pass, jitter and RCAS floor stay wired (pins above) — a preset re-enables
// it with `taa: true`. Comment lines may sit between msaaSamples and the flag.
for (const label of ['Ultra', 'High', 'Medium']) {
  assert.match(quality, new RegExp(`label: '${label}',\\n\\s*msaaSamples: \\d,\\n(\\s*//[^\\n]*\\n)*\\s*taa: false,`), `${label}: temporal AA off by default`);
}
assert.doesNotMatch(quality, /label: 'Low',\n\s*msaaSamples: \d,\n\s*taa: (true|false),/, 'Low never carried the flag');
assert.equal((quality.match(/taa: true,/g) ?? []).length, 0, 'no preset enables temporal AA by default');
assert.equal((quality.match(/taa: false,/g) ?? []).length, 3, 'the three desktop presets carry the explicit off flag; mobile presets have none');
console.log('temporalAA.selftest: jitter sequence, projection jitter, blend policy, resolve contract, lifecycle, wiring and preset gating PASS');
