// shadowCascadeLayout.selftest — 2026-10-09 (the shadows lane, overhaul r2): the cascades' explicit breaks and their seams.
// The split (a preset's breaks, else three's practical split, exactly), the fade margin law and its GLSL twin, the boxes
// three's own split and bounds law give the High tier before and after (the near cascade's texel), the presets, and the
// wiring in lighting.ts (the custom split, the patched CSM chunk, the box override, the live preset switch).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CSMFrustum } from 'three/examples/jsm/csm/CSMFrustum.js';
import { CSMShader } from 'three/examples/jsm/csm/CSMShader.js';
import { CSM_FADE_CAP, CSM_FADE_K, CSM_FADE_MARGIN_GLSL, cascadeBreaks, csmFadeKFor, csmFadeMargin } from './shadowCascadeLayout.ts';
import { PRESETS } from './quality.ts';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ---- 1. the split
const camNear = 0.5;
assert.deepEqual(cascadeBreaks([], 4, camNear, 700, [28, 110, 320]), [28 / 700, 110 / 700, 320 / 700, 1], 'the explicit breaks');
const practical = (n, far) => {
  const out = [];
  for (let i = 1; i < n; i++) out.push(THREE.MathUtils.lerp((camNear + (far - camNear) * i / n) / far, (camNear * (far / camNear) ** (i / n)) / far, 0.5));
  out.push(1);
  return out;
};
for (const [n, far] of [[4, 520], [4, 380], [3, 300]]) {
  cascadeBreaks([], n, camNear, far, null).forEach((b, i) => near(b, practical(n, far)[i], 1e-12, `no breaks: three's practical split (${n} over ${far} m, ${i})`));
}
for (const bad of [[28, 110], [110, 28, 320], [0.2, 110, 320], [28, 110, 900], [28, Number.NaN, 320]]) {
  cascadeBreaks([], 4, camNear, 700, bad).forEach((b, i) => near(b, practical(4, 700)[i], 1e-12, `unusable breaks ${JSON.stringify(bad)}: the practical split`));
}
const reused = [9, 9, 9, 9, 9, 9];
assert.equal(cascadeBreaks(reused, 4, camNear, 700, [28, 110, 320]).length, 4, 'the target is refilled, not appended to');

// ---- 2. the fade margin and its GLSL twin
near(csmFadeMargin(28 / 700), CSM_FADE_K * 28 / 700, 1e-12, 'near the camera: a share of the seam\'s own distance');
near(csmFadeMargin(28 / 700) * 699.5, 4.2, 0.05, 'the 28 m seam fades over about 4 m (three: 0.3 m)');
near(csmFadeMargin(110 / 700) * 699.5, 16.5, 0.1, 'the 110 m seam over about 16 m');
near(csmFadeMargin(320 / 700), 0.25 * (320 / 700) ** 2, 1e-12, 'the 320 m seam: three\'s law (wider than the capped share)');
assert.ok(csmFadeMargin(0.2) <= Math.max(0.25 * 0.04, CSM_FADE_CAP) + 1e-12, 'the share is capped');
assert.equal(csmFadeMargin(1), 0.25, 'the last cascade\'s fade-out keeps three\'s 0.25');
assert.equal(csmFadeMargin(-1), 0, 'a negative break has no margin');
for (const x of [0.04, 0.127, 0.3]) assert.equal(csmFadeMargin(x, 0), 0.25 * x * x, 'k 0: three\'s law exactly');
assert.equal(csmFadeKFor([28, 110, 320]), CSM_FADE_K, 'explicit breaks fade by the share');
assert.equal(csmFadeKFor(null), 0, 'no breaks: three\'s law');
const glsl = (closestEdge, uCotCsmFadeK) => Function('closestEdge', 'uCotCsmFadeK',
  `const max = Math.max, min = Math.min, pow = Math.pow; return ${CSM_FADE_MARGIN_GLSL.replace(/(\d)\.0\b/g, '$1')};`)(closestEdge, uCotCsmFadeK);
for (const k of [0, CSM_FADE_K]) for (const x of [0, 0.02, 28 / 700, 0.157, 0.457, 0.6, 1]) near(glsl(x, k), csmFadeMargin(x, k), 1e-4, `GLSL margin at ${x} (k ${k})`);
assert.ok(CSMShader.lights_fragment_begin.includes('margin = 0.25 * pow( closestEdge, 2.0 );'), 'three\'s chunk still carries the anchor the patch replaces');

// ---- 3. the boxes (three's split and bounds law; 16:9, 60° vertical fov): the High tier's near texel
const cam = new THREE.PerspectiveCamera(60, 16 / 9, camNear, 4000);
cam.updateProjectionMatrix();
function boxWidths(breaks, far, k) {
  const main = new CSMFrustum({ webGL: true, projectionMatrix: cam.projectionMatrix, maxFar: far });
  const frustums = [];
  main.split(breaks, frustums);
  return frustums.map((f, i) => {
    const p1 = f.vertices.far[0];
    const p2 = p1.distanceTo(f.vertices.far[2]) > p1.distanceTo(f.vertices.near[2]) ? f.vertices.far[2] : f.vertices.near[2];
    // three's own bounds (its margin over the camera's 4000 m far plane) plus the margin the lane's law adds over three's
    const three = 0.25 * Math.pow(f.vertices.far[0].z / (4000 - camNear), 2) * (4000 - camNear);
    const extra = i < breaks.length - 1 ? Math.max(0, csmFadeMargin(breaks[i], k) - 0.25 * breaks[i] ** 2) * (far - camNear) : 0;
    return p1.distanceTo(p2) + three + extra;
  });
}
const high = PRESETS.high;
const after = boxWidths(cascadeBreaks([], 4, camNear, high.shadowMaxFar, high.shadowBreaksM), high.shadowMaxFar, CSM_FADE_K);
const before = boxWidths(practical(4, high.shadowMaxFar), high.shadowMaxFar, 0);
const texel = (w, size) => w / size;
assert.ok(texel(before[0], high.shadowMapSizes[0]) > 0.10, `the practical split: High's near texel ${texel(before[0], 2048).toFixed(3)} m`);
assert.ok(texel(after[0], high.shadowMapSizes[0]) < 0.036, `the breaks: High's near texel ${texel(after[0], 2048).toFixed(3)} m`);
assert.ok(after[0] < before[0] / 2.5 && after[1] < before[1], 'the near boxes shrink');
assert.ok(after[2] <= before[2] * 1.15, `the mid box grows at most 15 % (${before[2].toFixed(0)} → ${after[2].toFixed(0)} m: its far break 301 → 320 m)`);
near(after[3], before[3], 1e-6, 'the far cascade unchanged');

// ---- 4. the presets
assert.deepEqual(PRESETS.ultra.shadowBreaksM, [28, 110, 320], 'Ultra');
assert.deepEqual(PRESETS.high.shadowBreaksM, [28, 110, 320], 'High');
for (const name of ['medium', 'low', 'mobile', 'mobile-low', 'mobile-high']) {
  assert.equal(PRESETS[name].shadowBreaksM, undefined, `${name} keeps the practical split`);
}

// ---- 5. the wiring
const lighting = read('./lighting.ts');
assert.match(lighting, /mode: 'custom',\s*customSplitsCallback: \(cascades: number, near: number, far: number, target: number\[\]\) => \{\s*cascadeBreaks\(target, cascades, near, far, presetBreaksM\);/,
  'the custom split from the preset\'s breaks');
assert.match(lighting, /let presetBreaksM: readonly number\[\] \| null = mobileTier \? null : preset\.shadowBreaksM \?\? null;/, 'never on the phones');
assert.match(lighting, /frag = frag\.replace\(marginAnchor, `margin = \$\{CSM_FADE_MARGIN_GLSL\};`\);/, 'the CSM chunk takes the margin law');
assert.match(lighting, /const extra = \(csmFadeMargin\(x, k\) - 0\.25 \* x \* x\) \* \(shadowFar - camera\.near\);/, 'each box grows by the margin the law adds');
assert.match(lighting, /shader\.uniforms\.uCotCsmFadeK = csmFadeKUniform;/, 'every CSM program binds the seam law');
assert.match(lighting, /uniform float uCotCsmFadeK;/, 'and declares it');
assert.match(lighting, /csmFadeKUniform\.value = csmFadeKFor\(presetBreaksM\);[\s\S]*csmFadeKUniform\.value = csmFadeKFor\(presetBreaksM\);/, 'set at build and on a preset switch');
assert.match(lighting, /for \(let i = 0; i < csm\.frustums\.length - 1; i\+\+\)/, 'the last cascade keeps three\'s box');
assert.match(lighting, /if \(csm\.maxFar !== p\.shadowMaxFar \|\| breaksChanged\) \{/, 'a preset switch re-splits');
const profiles = read('./shadowCasterProfiles.ts');
assert.match(profiles, /return \(fade \? x - csmFadeMargin\(x, fadeK\) \/ 2 : x\) \* Math\.max\(0, far - near\);/, 'the caster profiles sample by the same law');

console.log(`shadowCascadeLayout.selftest: explicit breaks or three's practical split, the fade law (k ${CSM_FADE_K}, cap ${CSM_FADE_CAP}; 0 without breaks) and its GLSL twin, High's near texel ${(100 * texel(before[0], 2048)).toFixed(1)} → ${(100 * texel(after[0], 2048)).toFixed(1)} cm, the presets and the wiring PASS`);
