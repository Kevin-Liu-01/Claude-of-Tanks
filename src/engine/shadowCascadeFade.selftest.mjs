// 2026-10-14 (SKY shadows r2a, the shadow-quality plan's C1 and C6): the cascades' one fade law, its readers, High's
// cascade table and the contact seam the ENGINE lane's contact r6 reads (scene.userData.lightRig.contactSeamM).
// - the fade is linear: a half-band of 6 % of the break's distance, the CSM shader's margin, the shadow boxes' widening
//   (normalised by the shadow range, not the camera's 4 km), the caster profiles' sampled range and the held poses;
// - High breaks at 30 / 89 / 320 m with its third map at 4096: no distance band coarser than the practical split's by
//   more than ~6 %, cascade 0 three times finer;
// - every preset re-derives its frustums on a switch (High and Ultra share the 700 m range, not the splits);
// - lightRig.contactSeamM is cascade 0's depth bias along the sun plus one of its texels, for every preset.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CONTACT_SEAM_FALLBACK_M, CSM_FADE_HALF_SHARE, CSM_FADE_MARGIN_GLSL, contactSeamFor, pushCustomCascadeBreaks, CSM_FADE_MARGIN_THREE, csmBoxFadeMarginM, csmFadeHalfBand, csmSliceFromM, csmSliceToM,
} from './shadowCascadeFade.ts';
import { PRESETS } from './quality.ts';
import { shadowDepthBiasForTexel, shadowNormalBiasForTexel } from './shadowStability.ts';

const here = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

// ---- the law
assert.equal(CSM_FADE_HALF_SHARE, 0.06);
assert.ok(Math.abs(csmFadeHalfBand(30 / 700) * 700 - 1.8) < 1e-9, '±1.8 m at 30 m');
assert.ok(Math.abs(csmFadeHalfBand(89 / 700) * 700 - 5.34) < 1e-9, '±5.3 m at 89 m');
assert.equal(csmSliceFromM(0, 0.5, 700, true), 0, 'cascade 0 from the camera');
assert.ok(Math.abs(csmSliceFromM(0.5, 0, 700, true) - 0.47 * 700) < 1e-9 && Math.abs(csmSliceToM(0.5, 0, 700, true) - 0.53 * 700) < 1e-9, 'both ends');
assert.equal(csmSliceFromM(0.5, 0, 700, false), 350, 'no fade: the break');
assert.ok(Math.abs(csmBoxFadeMarginM(-89) - 0.12 * 89) < 1e-9, 'the box widens by the whole band at its far edge (any sign)');
assert.equal(CSM_FADE_MARGIN_GLSL, 'margin = 0.1200 * closestEdge;');
const csmShader = readFileSync(new URL('../../node_modules/three/examples/jsm/csm/CSMShader.js', import.meta.url), 'utf8');
assert.equal(csmShader.split(CSM_FADE_MARGIN_THREE).length, 2, 'three\'s margin line, once (the patch anchor)');

// ---- the readers
const lighting = here('./lighting.ts');
assert.match(lighting, /frag = frag\.replace\(CSM_FADE_MARGIN_THREE, CSM_FADE_MARGIN_GLSL\);/, 'the shader takes the law');
assert.match(lighting, /if \(this\.fade\) width \+= csmBoxFadeMarginM\(farVerts\[0\]\.z\);/, 'the boxes widen by it');
assert.match(here('./shadowCasterProfiles.ts'), /return csmSliceFromM\(breakStart, near, far, fade\);/, 'the caster profiles read it');
const cache = here('./shadowStaticCache.ts');
assert.match(cache, /csmSliceFromM\(from, 0, span, csm\.fade\)/, 'the held poses read it (near end)');
assert.match(cache, /csmSliceToM\(to, 0, span, csm\.fade\)/, 'the held poses read it (far end)');
assert.doesNotMatch(cache + here('./shadowCasterProfiles.ts'), /0\.125 \* (x|from|to) \* /, 'no second copy of three\'s quadratic law');

// ---- one import path (2026-10-15): renderLayers.ts re-exports the law; imported from three chunks of different reach it
// had become a chunk of its own, one up-front request over the game page's budget
{
  const { readdirSync } = await import('node:fs');
  const dir = new URL('../', import.meta.url);
  const importers = [];
  const walk = (u) => { for (const e of readdirSync(u, { withFileTypes: true })) { const c = new URL(e.name + (e.isDirectory() ? '/' : ''), u); if (e.isDirectory()) walk(c); else if (/\.ts$/.test(e.name) && /from '\.\/shadowCascadeFade\.ts'|from '\.\.\/engine\/shadowCascadeFade\.ts'/.test(readFileSync(c, 'utf8'))) importers.push(e.name); } };
  walk(dir);
  assert.deepEqual(importers, ['renderLayers.ts'], 'only renderLayers.ts imports the law (the rest import it from there)');
}

// ---- High's table
assert.deepEqual([...PRESETS.high.shadowSplitsM], [30, 89, 320]);
assert.deepEqual([...PRESETS.high.shadowMapSizes], [2048, 2048, 4096, 1024]);
for (const name of ['ultra', 'medium', 'low']) assert.equal(PRESETS[name].shadowSplitsM, undefined, `${name} keeps the practical split`);
{
  const breaks = [];
  pushCustomCascadeBreaks([30, 89, 320], 4, 700, breaks);
  assert.deepEqual(breaks.map((b) => +(b * 700).toFixed(6)), [30, 89, 320, 700], 'the custom breaks in metres');
  const mono = [];
  pushCustomCascadeBreaks([30, 20], 3, 700, mono);
  assert.ok(mono[1] > mono[0] && mono[2] === 1, 'monotonic, the last at the range');
}
// a cascade's texel by distance band: the box is the slice's diagonal (60 deg vertical fov, 16:9) and its fade band
const tanY = Math.tan(Math.PI / 6), tanX = tanY * 16 / 9;
const boxOf = (d0, d1) => {
  const far = (d) => [d * tanX, d * tanY, d];
  const [fx, fy] = far(d1), [nx, ny] = far(d0);
  const diagFar = 2 * Math.hypot(fx, fy);
  const across = Math.hypot(fx + nx, fy + ny, d1 - d0);
  return Math.max(diagFar, across) + csmBoxFadeMarginM(d1);
};
const texelsOf = (splits, sizes) => splits.map((d1, i) => boxOf(i ? splits[i - 1] : 0.5, d1) / sizes[i]);
const practical = texelsOf([89.2, 184.5, 319.8, 700], PRESETS.ultra.shadowMapSizes.map(() => 0).map((_, i) => [2048, 2048, 2048, 1024][i]));
const high = texelsOf([30, 89, 320, 700], PRESETS.high.shadowMapSizes);
// (main's High at every view depth against the new: the cascade covering it)
const at = (splits, texels, d) => texels[splits.findIndex((s) => d <= s)];
for (const d of [10, 29, 31, 60, 88, 90, 150, 184, 186, 250, 319, 321, 500, 699]) {
  const was = at([89.2, 184.5, 319.8, 700], practical, d), now = at([30, 89, 320, 700], high, d);
  assert.ok(now <= was * 1.10, `${d} m: no coarser than the practical split by more than 10 % (${(now * 100).toFixed(1)} vs ${(was * 100).toFixed(1)} cm)`);
}
assert.ok(high[0] < practical[0] / 2.5, `cascade 0 finer by more than 2.5x (${(high[0] * 100).toFixed(2)} vs ${(practical[0] * 100).toFixed(2)} cm)`);

// ---- every preset re-derives its frustums on a switch
const onSwitch = lighting.slice(lighting.indexOf('onPresetChange((p) => {'), lighting.indexOf('const shadowScheduler'));
assert.match(onSwitch, /cascadeSplitsM = p\.shadowSplitsM \?\? null;\s*csm\.mode = cascadeSplitsM \? 'custom' : 'practical';\s*csm\.maxFar = p\.shadowMaxFar;\s*csm\.updateFrustums\(\);/, 'splits, mode, range, frustums');
assert.doesNotMatch(onSwitch, /if \(csm\.maxFar !== p\.shadowMaxFar\)/, 'no longer gated on the range');

// ---- the contact seam (contact r6's contract)
assert.equal(CONTACT_SEAM_FALLBACK_M, 0.15);
assert.equal(contactSeamFor(0.08, 0.035), 0.08 + 0.035);
assert.match(lighting, /if \(i === 0\) contactSeam\.value = contactSeamFor\(-shadow\.bias \* depthRange, worldUnitsPerTexel\);/, 'cascade 0\'s live bias and texel');
assert.match(lighting, /Object\.defineProperty\(lightRig, 'contactSeamM', \{ enumerable: true, get: \(\) => contactSeam\.value \}\);/, 'published on the rig');
const RADII = [1.6, 2.3, 2.6, 2.8], REF = [4096, 4096, 4096, 2048];
for (const [name, p] of Object.entries(PRESETS)) {
  const splits = p.shadowSplitsM ? [...p.shadowSplitsM, p.shadowMaxFar] : null;
  const d1 = splits ? splits[0] : 0.5 * (0.5 + (p.shadowMaxFar - 0.5) / 4) + 0.5 * (0.5 * (p.shadowMaxFar / 0.5) ** 0.25);
  const texel = boxOf(0.5, d1) / p.shadowMapSizes[0];
  const radius = Math.max(1.25, RADII[0] * (p.shadowMapSizes[0] / REF[0]));
  const bias = shadowDepthBiasForTexel(texel, radius, shadowNormalBiasForTexel(texel));
  const seam = contactSeamFor(bias, texel);
  assert.ok(seam > texel && seam <= 0.4 + texel + 1e-9, `${name}: the seam is cascade 0's bias plus its texel (${seam.toFixed(3)} m)`);
}
console.log('shadowCascadeFade.selftest: the linear fade law and its four readers, High at 30/89/320 m (cascade 0 '
  + `${(high[0] * 100).toFixed(2)} cm, was ${(practical[0] * 100).toFixed(2)}), frustums on every switch, lightRig.contactSeamM PASS`);
