// 2026-10-14 (SKY shadows r2a, P1): the cascades' tent PCF. The kernel rides on each cascade's shadow radius (100 + k), so
// three's getShadow call sites stay its own — vegetation's leaf floor counts and wraps the three directional sites (the
// r2a capture caught "expected three directional shadow sites, found 1" when the sites were renamed) and the coast
// wrapper calls getShadow; spot, point and other directional lights keep three's disk exactly.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  SHADOW_TENT_DEFAULT, SHADOW_TENT_GLSL, SHADOW_TENT_RADIUS_BASE, THREE_PCF_GET_SHADOW, THREE_PCF_GET_SHADOW_RENAMED,
  shadowTentBiasRadius, shadowTentHalfTexels, shadowTentRadius, shadowTentTaps, SHADOW_PCSS_SLOPE,
} from './shadowTent.ts';
import { PRESETS } from './quality.ts';

assert.equal(THREE.ShaderChunk.shadowmap_pars_fragment.split(THREE_PCF_GET_SHADOW).length, 2, 'three\'s PCF getShadow, once (the rename anchor)');
assert.ok(THREE_PCF_GET_SHADOW_RENAMED.startsWith('float cotThreeGetShadow('), 'renamed, same signature');
assert.match(SHADOW_TENT_GLSL, /float getShadow\( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord \) \{\s*if \( shadowRadius > 99\.5 \) return cotTentShadow\( shadowRadius - 100\.0,/, 'a tent-coded radius takes the tent');
assert.match(SHADOW_TENT_GLSL, /return cotThreeGetShadow\( shadowMap, shadowMapSize, shadowIntensity, shadowBias, shadowRadius, shadowCoord \);/, 'any other radius three\'s disk');
assert.match(SHADOW_TENT_GLSL, /#ifndef OPAQUE\s*k = 3\.0;\s*#endif/, 'the alpha-to-coverage cards take the smallest tent');
// the call sites stay three's: the CSM chunk's three directional sites (vegetation's leaf floor counts them)
const csmShader = readFileSync(new URL('../../node_modules/three/examples/jsm/csm/CSMShader.js', import.meta.url), 'utf8');
assert.equal(csmShader.split('getShadow( directionalShadowMap[ i ]').length - 1, 3, 'the CSM chunk carries three directional sites');
const lighting = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.doesNotMatch(lighting, /replace\(\s*'getShadow\( directionalShadowMap|COT_CSM_SHADOW|cotCsmShadow\(/, 'lighting.ts renames no call site');
assert.match(readFileSync(new URL('../world/vegetation.ts', import.meta.url), 'utf8'), /if \(sites !== 3\) throw/, 'vegetation still counts three sites');
assert.match(lighting, /THREE\.ShaderChunk\.shadowmap_pars_fragment = `\$\{pars\.replace\(THREE_PCF_GET_SHADOW, THREE_PCF_GET_SHADOW_RENAMED\)\}\n\$\{SHADOW_TENT_GLSL\}`;/, 'three\'s disk renamed, the tent appended');
// the kernels and their codes
assert.deepEqual([3, 5, 7].map(shadowTentRadius), [103, 105, 107]);
assert.equal(SHADOW_TENT_RADIUS_BASE, 100);
assert.deepEqual([3, 5, 7].map(shadowTentTaps), [4, 9, 16]);
assert.deepEqual([3, 5, 7].map(shadowTentHalfTexels), [1.5, 2, 2.5]);
for (const k of [3, 5, 7]) assert.ok(Math.abs((0.95 * shadowTentBiasRadius(k) + 1) - shadowTentHalfTexels(k)) < 1e-12, `${k}: the bias law reaches its half footprint`);
assert.deepEqual([...SHADOW_TENT_DEFAULT], [3, 3, 3, 3]);
// 2026-10-15 (SKY shadows r3, CL.11): contact hardening (9) on Ultra's and High's near cascade, its code carrying the
// cascade's depth range over its texel (log2 / 32 in the fraction); Medium keeps the 5
assert.deepEqual([...PRESETS.ultra.shadowTent], [9, 3, 3, 3]);
assert.deepEqual([...PRESETS.high.shadowTent], [9, 3, 3, 3]);
assert.deepEqual([...PRESETS.medium.shadowTent], [5, 3, 3, 3]);
assert.equal(shadowTentRadius(9, 1), 109);
assert.ok(Math.abs(shadowTentRadius(9, 2 ** 14) - (109 + 14 / 32)) < 1e-12, 'the depth scale in the fraction');
assert.equal(shadowTentRadius(9, 2 ** 20), 109.49, 'clamped short of the next code');
for (const R of [300, 5000, 14500, 40000]) {
  const code = shadowTentRadius(9, R) - 109;
  assert.ok(Math.abs(2 ** (code * 32) / R - 1) < 1e-9, `${R}: decoded exactly`);
}
assert.equal(shadowTentHalfTexels(9), 2.5, 'its widest spread is the 7\'s');
assert.equal(shadowTentTaps(9), 40);
assert.ok(Math.abs(SHADOW_PCSS_SLOPE - 2 * 0.0093) < 1e-4, 'twice the sun\'s angular diameter');
for (const term of ['if ( k >= 8.5 ) {\n\t\t\tshadow = cotPcssShadow( k - 9.0, shadowMap, t, uv, z );', 'float R = exp2( clamp( code, 0.0, 0.49 ) * 32.0 );',
  'if ( b0 < 0.001 ) return 1.0;', 'if ( b0 > 0.999 ) return 0.0;', 'texture( shadowMap, vec3( q, z - 256.0 / R ) )',
  'float spread = clamp( height * 0.0186 / 5.0, 0.333, 1.0 );']) assert.ok(SHADOW_TENT_GLSL.includes(term), term);
// the penumbra law on its own (the GLSL's arithmetic): a hull's blockers (0-3 m over the ground at High's 3.45 cm: up to 87
// texels) keep the narrowest spread; a crown 10 m up (290) takes the widest
const spreadFor = (heightTexels) => Math.min(1, Math.max(0.333, heightTexels * SHADOW_PCSS_SLOPE / 5));
assert.equal(spreadFor(87), 0.333);
assert.equal(spreadFor(290), 1);
const lightingSrc = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.match(lightingSrc, /if \(tentFor\(i\) >= 9\) shadow\.radius = tentRadius\(i\);/, 'the depth scale follows the cascade\'s fit');
assert.match(lightingSrc, /window\.__SHADOW_DEBUG\?\.noPcss \? 5 : k/, 'the A/B lever');
for (const name of ['ultra', 'high', 'medium']) {
  assert.deepEqual([...PRESETS[name].shadowTentDeck], [7, 7, 3, 3], `${name}: 7 on the near pair under a closed deck`);
}
for (const name of ['low', 'ultralow']) assert.equal(PRESETS[name].shadowTent, undefined, `${name}: 3 everywhere`);
console.log('shadowTent.selftest: tent kernels coded on the cascade radius, three\'s call sites and disk kept, the preset tables PASS');
